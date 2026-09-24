/**
 * Meta's official Ad Library API (Graph API /ads_archive).
 *
 * Free, but limited for commercial ads: full copy is only returned for ads
 * that delivered in the EU/UK (DSA transparency), and there is no image,
 * video, CTA or landing URL. For US creative, use the Apify source.
 * Useful for: EU-running brands, discovery, and cross-checking.
 *
 * Needs META_ADLIB_TOKEN — a user token from an identity-verified account
 * (facebook.com/ID). Not the Conversions API token.
 */
import { fromMetaApi } from './normalize.js';
import { log } from '../lib/util.js';

const FIELDS = [
  'id',
  'page_id',
  'page_name',
  'ad_creation_time',
  'ad_delivery_start_time',
  'ad_delivery_stop_time',
  'ad_creative_bodies',
  'ad_creative_link_titles',
  'ad_creative_link_descriptions',
  'ad_creative_link_captions',
  'ad_snapshot_url',
  'publisher_platforms',
  'languages',
  'eu_total_reach',
].join(',');

async function* archive(ctx, params, max) {
  const token = process.env.META_ADLIB_TOKEN;
  if (!token) throw new Error('META_ADLIB_TOKEN is not set. Add it to adintel/.env, switch harvest.source, or use --demo.');
  const { harvest, meta } = ctx.cfg;
  const url = new URL(`https://graph.facebook.com/${meta.apiVersion}/ads_archive`);
  url.searchParams.set('access_token', token);
  url.searchParams.set('ad_type', 'ALL');
  url.searchParams.set('ad_active_status', harvest.status);
  url.searchParams.set('ad_reached_countries', JSON.stringify(meta.countries));
  url.searchParams.set('fields', FIELDS);
  url.searchParams.set('limit', '250');
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, typeof v === 'string' ? v : JSON.stringify(v));

  let next = url.toString();
  let n = 0;
  while (next && n < max) {
    const res = await fetch(next);
    const body = await res.json();
    if (body.error) throw new Error(`Meta Ad Library: ${body.error.message}`);
    for (const row of body.data || []) {
      if (n++ >= max) return;
      yield row;
    }
    next = body.paging?.next || null;
  }
}

export async function fetchPageAds(ctx, pageId, max) {
  log(`meta: page ${pageId} (up to ${max})`);
  const out = [];
  for await (const row of archive(ctx, { search_page_ids: [pageId] }, max)) out.push(fromMetaApi(row));
  return out;
}

export async function searchKeyword(ctx, q, max) {
  log(`meta: keyword "${q}" (up to ${max})`);
  const out = [];
  const search_type = ctx.cfg.discover.keywordMatch === 'keyword_exact_phrase' ? 'KEYWORD_EXACT_PHRASE' : 'KEYWORD_UNORDERED';
  for await (const row of archive(ctx, { search_terms: q, search_type }, max)) out.push(fromMetaApi(row));
  return out;
}
