/**
 * Apify's Facebook Ad Library scrapers read the public Ad Library web UI.
 * Unlike Meta's API, that covers ordinary US commercial ads, with full
 * creative: copy, headline, CTA, landing URL, images, videos and
 * collation_count (how many ad IDs share the creative).
 *
 * Needs APIFY_TOKEN. Actor and input shape are set in config.json →
 * harvest.apify, so you can swap scrapers without touching code.
 */
import { fromApify } from './normalize.js';
import { log, sleep } from '../lib/util.js';

const API = 'https://api.apify.com/v2';

export function libraryUrl(ctx, { pageId, q }) {
  const u = new URL('https://www.facebook.com/ads/library/');
  const { harvest } = ctx.cfg;
  u.searchParams.set('active_status', q ? 'active' : String(harvest.status).toLowerCase());
  u.searchParams.set('ad_type', 'all');
  u.searchParams.set('country', harvest.countries[0] || 'US');
  u.searchParams.set('media_type', 'all');
  if (pageId) {
    u.searchParams.set('view_all_page_id', pageId);
    u.searchParams.set('search_type', 'page');
  } else {
    u.searchParams.set('q', q);
    u.searchParams.set('search_type', ctx.cfg.discover.keywordMatch);
  }
  return u.toString();
}

function buildInput(ctx, url, count) {
  const { inputStyle, extraInput } = ctx.cfg.harvest.apify;
  const base =
    inputStyle === 'apify'
      ? { startUrls: [{ url }], resultsLimit: count }
      : { urls: [{ url }], count, 'scrapePageAds.activeStatus': String(ctx.cfg.harvest.status).toLowerCase() };
  return { ...base, ...(extraInput || {}) };
}

async function api(path, init = {}) {
  const token = process.env.APIFY_TOKEN;
  if (!token) throw new Error('APIFY_TOKEN is not set. Add it to adintel/.env, switch harvest.source, or use --demo.');
  const res = await fetch(`${API}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...(init.headers || {}) },
  });
  if (!res.ok) throw new Error(`Apify ${res.status} on ${path}: ${(await res.text()).slice(0, 300)}`);
  return res.json();
}

async function runActor(ctx, input) {
  ctx.assertBudget();
  const actor = ctx.cfg.harvest.apify.actor.replace('/', '~');
  const { data: run } = await api(`/acts/${actor}/runs`, { method: 'POST', body: JSON.stringify(input) });
  let status = run;
  while (!['SUCCEEDED', 'FAILED', 'ABORTED', 'TIMED-OUT'].includes(status.status)) {
    await sleep(2000);
    ({ data: status } = await api(`/actor-runs/${run.id}?waitForFinish=60`));
  }
  ctx.ledger.apify.runs++;
  ctx.ledger.apify.usd += status.usageTotalUsd || 0;
  if (status.status !== 'SUCCEEDED') throw new Error(`Apify run ${run.id} ended ${status.status}`);
  const items = await api(`/datasets/${status.defaultDatasetId}/items?clean=true&format=json`);
  ctx.ledger.apify.items += items.length;
  return items;
}

export async function fetchPageAds(ctx, pageId, max) {
  const url = libraryUrl(ctx, { pageId });
  log(`apify: page ${pageId} (up to ${max})`);
  return (await runActor(ctx, buildInput(ctx, url, max))).map(fromApify);
}

export async function searchKeyword(ctx, q, max) {
  const url = libraryUrl(ctx, { q });
  log(`apify: keyword "${q}" (up to ${max})`);
  return (await runActor(ctx, buildInput(ctx, url, max))).map(fromApify);
}
