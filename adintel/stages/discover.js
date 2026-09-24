/**
 * Stage 1 — find who to steal from.
 *
 * Two nets: the seed list in config (verified, not trusted — each name is
 * resolved to a real page that is running ads right now), and a keyword
 * sweep of the ad library that catches brands you didn't know about.
 * Keyword search is noisy (a "coffee subscription" search returns skincare
 * and romance-novel spam), so Jev decides who is actually a competitor.
 */
import * as apify from '../sources/apify.js';
import * as meta from '../sources/meta.js';
import { importAds } from '../sources/importer.js';
import { makeJev } from '../lib/jev.js';
import { log, pool, truncate, landingKey, normText } from '../lib/util.js';

export function sourceFor(ctx) {
  if (ctx.demo || ctx.flags.import) return null;
  const s = ctx.cfg.harvest.source;
  if (s === 'apify') return apify;
  if (s === 'meta') return meta;
  return null;
}

const RELATION = {
  q: 'How does this advertiser relate to our brand? Judge from what their ads sell and who they sell it to.',
  labels: {
    direct: 'Direct competitor: sells coffee (whole bean, ground, pods, instant, concentrate or a coffee subscription) to the same home coffee drinker',
    adjacent: 'Adjacent: fights for the same morning-ritual money or the same buyer — coffee alternatives, mushroom coffee, creamers, energy drinks, brewing gear',
    unrelated: 'Unrelated: a different category, or a junk / spam page that only matched the search words',
  },
};

const tokens = (s) => new Set(normText(s).replace(/[^a-z0-9 ]/g, ' ').split(' ').filter(Boolean));

/** Which page in these search results is the brand we asked for? */
function bestPage(name, ads) {
  const want = tokens(name);
  let best = null;
  for (const ad of ads) {
    const got = tokens(ad.pageName);
    const overlap = [...want].filter((t) => got.has(t)).length / Math.max(want.size, 1);
    const exact = normText(ad.pageName) === normText(name) ? 1 : 0;
    const s = exact + overlap;
    if (s >= 0.5 && (!best || s > best.s)) best = { s, pageId: ad.pageId, pageName: ad.pageName };
  }
  return best;
}

export async function discover(ctx) {
  const { cfg } = ctx;
  const jev = makeJev(ctx);
  const src = sourceFor(ctx);
  const pages = new Map();
  const own = normText(cfg.brand.name);

  const add = (ad, via, seed = false) => {
    const key = ad.pageId || normText(ad.pageName);
    if (!key || normText(ad.pageName) === own) return;
    if (!pages.has(key)) pages.set(key, { pageId: ad.pageId || null, name: ad.pageName, ads: [], via: new Set(), seed: false });
    const p = pages.get(key);
    if (!p.ads.some((a) => a.adId === ad.adId)) p.ads.push(ad);
    p.via.add(via);
    p.seed ||= seed;
  };

  if (!src) {
    // Import / demo: the competitors are whoever is in the files you supplied.
    for (const ad of importAds(ctx)) add(ad, 'import', true);
  } else {
    for (const seed of cfg.competitors.seeds) {
      if (seed.pageId) {
        pages.set(seed.pageId, { pageId: seed.pageId, name: seed.name, ads: [], via: new Set(['seed']), seed: true });
        continue;
      }
      const ads = await ctx.cached('discover-seed', normText(seed.name).replace(/\W+/g, '-'), () =>
        src.searchKeyword(ctx, seed.name, cfg.discover.adsPerSeedSearch),
      );
      const hit = bestPage(seed.name, ads);
      if (!hit) {
        log(`seed "${seed.name}": no advertiser page found — likely not running ads`);
        continue;
      }
      for (const ad of ads.filter((a) => a.pageId === hit.pageId)) add(ad, 'seed', true);
    }
    const day = ctx.now.toISOString().slice(0, 10);
    for (const kw of cfg.discover.keywords) {
      const ads = await ctx.cached('discover-kw', `${day}-${normText(kw).replace(/\W+/g, '-')}`, () =>
        src.searchKeyword(ctx, kw, cfg.discover.adsPerKeyword),
      );
      for (const ad of ads) add(ad, `keyword: ${kw}`);
    }
  }

  const candidates = [...pages.values()].filter((p) => p.seed || p.ads.length >= cfg.discover.minAdsToConsider);
  log(`discover: ${pages.size} advertisers seen, ${candidates.length} worth judging`);

  const brandCard = { name: cfg.brand.name, sells: cfg.brand.category, buyer: cfg.brand.icp };
  await pool(candidates, cfg.concurrency.jev, async (p) => {
    const state = {
      ourBrand: brandCard,
      advertiser: {
        name: p.name,
        adsSeen: p.ads.length,
        sampleAds: p.ads.slice(0, 6).map((a) => ({
          text: truncate(a.body, 280),
          headline: a.title,
          button: a.ctaText,
          landsOn: landingKey(a.linkUrl),
        })),
      },
    };
    const { relation } = await jev.classify(state, { relation: RELATION }, 'discover');
    p.relation = relation.label;
    p.relationProbabilities = relation.probabilities;
    p.relevance = (relation.probabilities.direct || 0) + 0.5 * (relation.probabilities.adjacent || 0);
    p.activeAdsSeen = p.ads.filter((a) => a.active).length;
  });

  const keepSeeds = !src || cfg.discover.alwaysKeepSeeds;
  const ranked = candidates
    .filter((p) => p.relevance >= cfg.discover.relevanceThreshold || (p.seed && keepSeeds))
    .sort((a, b) => b.activeAdsSeen - a.activeAdsSeen || b.relevance - a.relevance)
    .slice(0, cfg.discover.maxCompetitors);
  const rejected = candidates.filter((p) => !ranked.includes(p));

  const view = (p) => ({
    name: p.name,
    pageId: p.pageId,
    relation: p.relation,
    relevance: Math.round(p.relevance * 1000) / 1000,
    activeAdsSeen: p.activeAdsSeen,
    adsSeen: p.ads.length,
    foundVia: [...p.via],
  });
  ctx.write('competitors.json', ranked.map(view));
  ctx.write('competitors_rejected.json', rejected.map(view));
  log(`discover: kept ${ranked.length} competitors, rejected ${rejected.length}`);
  return ranked.map(view);
}
