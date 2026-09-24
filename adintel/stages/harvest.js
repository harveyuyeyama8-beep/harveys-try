/**
 * Stage 2 — take every ad each competitor has run, fold duplicates into
 * creatives, pull the landing pages they point at, and (optionally)
 * transcribe the videos.
 */
import fs from 'node:fs';
import path from 'node:path';
import { sourceFor } from './discover.js';
import { importAds } from '../sources/importer.js';
import { toCreatives } from '../sources/normalize.js';
import { fetchLanding } from '../sources/landing.js';
import { transcribe } from '../sources/transcribe.js';
import { log, pool, normText, sha, countBy, firstLine } from '../lib/util.js';

export async function harvest(ctx) {
  const { cfg } = ctx;
  const competitors = ctx.read('competitors.json', []);
  const src = sourceFor(ctx);
  const day = ctx.now.toISOString().slice(0, 10);

  let ads = [];
  if (!src) {
    ads = importAds(ctx);
  } else {
    for (const c of competitors) {
      if (!c.pageId) continue;
      const got = await ctx.cached('harvest', `${day}-${c.pageId}-${sha(cfg.harvest)}`, () =>
        src.fetchPageAds(ctx, c.pageId, cfg.harvest.maxAdsPerBrand),
      );
      ctx.write(`raw/${normText(c.name).replace(/\W+/g, '-')}.json`, got);
      ads.push(...got);
    }
  }

  const byPage = new Map(competitors.filter((c) => c.pageId).map((c) => [String(c.pageId), c.name]));
  const byName = new Map(competitors.map((c) => [normText(c.name), c.name]));
  const brandOf = (ad) => byPage.get(ad.pageId) || byName.get(normText(ad.pageName)) || null;
  const creatives = toCreatives(ads, brandOf, ctx.now);
  log(`harvest: ${ads.length} ads → ${creatives.length} unique creatives across ${new Set(creatives.map((c) => c.brand)).size} brands`);

  if (cfg.harvest.transcribeVideos && !ctx.offline) {
    const videos = creatives.filter((c) => c.video && !c.transcript);
    log(`harvest: transcribing ${videos.length} videos`);
    await pool(videos, cfg.concurrency.http, async (c) => {
      c.transcript = await ctx.cached('transcript', sha(c.video.split('?')[0]), () => transcribe(ctx, c.video));
    });
  }

  // Landing pages, most-linked first: a page many ads point at is a page that converts.
  const linkCounts = countBy(creatives, (c) => c.landingKey);
  const urlFor = new Map(creatives.filter((c) => c.landingKey).map((c) => [c.landingKey, c.linkUrl]));
  const keys = Object.keys(linkCounts)
    .sort((a, b) => linkCounts[b] - linkCounts[a])
    .slice(0, cfg.harvest.maxLandingPages);

  let landings = {};
  const fixture = path.join(ctx.root, 'fixtures', 'demo-landings.json');
  if (ctx.demo && fs.existsSync(fixture)) {
    landings = JSON.parse(fs.readFileSync(fixture, 'utf8'));
  } else if (cfg.harvest.scrapeLandingPages && keys.length) {
    log(`harvest: fetching ${keys.length} landing pages`);
    await pool(keys, cfg.concurrency.http, async (k) => {
      landings[k] = await ctx.cached('landing', `${day}-${sha(k)}`, () => fetchLanding(urlFor.get(k)));
    });
  }
  for (const [k, l] of Object.entries(landings)) {
    l.key = k;
    l.linkedCreatives = linkCounts[k] || 0;
    l.brands = [...new Set(creatives.filter((c) => c.landingKey === k).map((c) => c.brand))];
  }

  // What changed since the last harvest: new launches are what they're
  // testing right now; creatives killed young are what didn't work.
  const prevFile = ctx.file('creatives.json');
  if (fs.existsSync(prevFile)) {
    const prev = JSON.parse(fs.readFileSync(prevFile, 'utf8'));
    const prevIds = new Set(prev.map((c) => c.id));
    const prevActive = new Set(prev.filter((c) => c.active).map((c) => c.id));
    const view = (c) => ({ id: c.id, brand: c.brand, text: firstLine(c.body) || c.title, days: c.days, variants: c.variants, format: c.displayFormat, snapshot: c.snapshotUrl });
    ctx.write('changes.json', {
      since: fs.statSync(prevFile).mtime.toISOString(),
      launched: creatives.filter((c) => !prevIds.has(c.id)).map(view),
      killed: creatives.filter((c) => prevActive.has(c.id) && !c.active).map(view),
    });
  }

  ctx.write('ads.json', ads);
  ctx.write('creatives.json', creatives);
  ctx.write('landings.json', landings);
  return { ads: ads.length, creatives: creatives.length, landings: Object.keys(landings).length };
}
