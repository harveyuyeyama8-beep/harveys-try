/**
 * Every source speaks a different dialect. This file turns each one into a
 * single Ad shape, then folds identical ads into Creatives.
 *
 * Ad:        one row in an ad library (one ad ID)
 * Creative:  one unique piece of creative. Brands run the same creative
 *            under many ad IDs; how many they run, and for how long, is the
 *            strongest public signal that it's making them money.
 */
import { sha, normText, toDate, daysBetween, landingKey } from '../lib/util.js';

const first = (obj, ...keys) => {
  for (const k of keys) {
    const v = k.split('.').reduce((o, p) => (o == null ? undefined : o[p]), obj);
    if (v !== undefined && v !== null && v !== '') return v;
  }
  return undefined;
};

const iso = (v) => toDate(v)?.toISOString() ?? null;

const FORMAT = (f) => {
  const s = String(f || '').toLowerCase();
  if (s.includes('video')) return 'video';
  if (s.includes('carousel') || s.includes('multi')) return 'carousel';
  if (s.includes('dco')) return 'dco';
  if (s.includes('dpa') || s.includes('catalog')) return 'dpa';
  if (s.includes('image') || s.includes('photo')) return 'image';
  if (s.includes('text')) return 'text';
  return s ? s : 'unknown';
};

/** Apify Facebook Ad Library scrapers (curious_coder and apify, snake or camel case). */
export function fromApify(item) {
  const s = item.snapshot || {};
  const cards = (s.cards || []).map((c) => ({
    body: first(c, 'body', 'body.text') || '',
    title: c.title || '',
    link: first(c, 'link_url', 'linkUrl') || '',
    image: first(c, 'original_image_url', 'originalImageUrl', 'resized_image_url', 'resizedImageUrl', 'video_preview_image_url', 'videoPreviewImageUrl') || '',
    video: first(c, 'video_hd_url', 'videoHdUrl', 'video_sd_url', 'videoSdUrl') || '',
  }));
  const videos = (s.videos || []).map((v) => ({
    url: first(v, 'video_sd_url', 'videoSdUrl', 'video_hd_url', 'videoHdUrl') || '',
    preview: first(v, 'video_preview_image_url', 'videoPreviewImageUrl') || '',
  }));
  const images = (s.images || []).map((i) => first(i, 'original_image_url', 'originalImageUrl', 'resized_image_url', 'resizedImageUrl')).filter(Boolean);
  const body = first(s, 'body.text', 'body') ?? cards[0]?.body ?? '';
  return {
    source: 'apify',
    platform: 'meta',
    adId: String(first(item, 'ad_archive_id', 'adArchiveID', 'adArchiveId', 'id') ?? sha(item)),
    pageId: String(first(item, 'page_id', 'pageID', 'pageId', 'snapshot.page_id') ?? ''),
    pageName: first(item, 'page_name', 'pageName', 'snapshot.page_name') || '',
    start: iso(first(item, 'start_date', 'startDate', 'startDateFormatted')),
    end: iso(first(item, 'end_date', 'endDate', 'endDateFormatted')),
    active: Boolean(first(item, 'is_active', 'isActive')),
    collation: Number(first(item, 'collation_count', 'collationCount')) || null,
    collationId: first(item, 'collation_id', 'collationID', 'collationId') ?? null,
    displayFormat: FORMAT(first(s, 'display_format', 'displayFormat') || (videos.length ? 'video' : images.length ? 'image' : cards.length ? 'carousel' : '')),
    body: typeof body === 'string' ? body : '',
    title: first(s, 'title') || cards[0]?.title || '',
    description: first(s, 'link_description', 'linkDescription') || '',
    caption: first(s, 'caption') || '',
    ctaText: first(s, 'cta_text', 'ctaText') || '',
    ctaType: first(s, 'cta_type', 'ctaType') || '',
    linkUrl: first(s, 'link_url', 'linkUrl') || cards[0]?.link || '',
    images,
    videos,
    cards,
    platforms: first(item, 'publisher_platform', 'publisherPlatform') || [],
    reach: Number(first(item, 'reached_countries_count', 'eu_total_reach', 'euTotalReach')) || null,
    snapshotUrl: first(item, 'url', 'ad_library_url') || null,
    transcript: null,
  };
}

/** Meta Graph API ads_archive rows. */
export function fromMetaApi(item) {
  const bodies = item.ad_creative_bodies || [];
  const titles = item.ad_creative_link_titles || (item.ad_creative_link_title ? [item.ad_creative_link_title] : []);
  const stop = item.ad_delivery_stop_time;
  return {
    source: 'meta_api',
    platform: 'meta',
    adId: String(item.id),
    pageId: String(item.page_id ?? ''),
    pageName: item.page_name || '',
    start: iso(item.ad_delivery_start_time || item.ad_creation_time),
    end: iso(stop),
    active: !stop,
    collation: null,
    collationId: null,
    displayFormat: bodies.length > 1 || titles.length > 1 ? 'dco' : 'unknown',
    body: bodies[0] || '',
    bodyVariants: bodies.slice(1),
    title: titles[0] || '',
    description: (item.ad_creative_link_descriptions || [])[0] || '',
    caption: (item.ad_creative_link_captions || [])[0] || '',
    ctaText: '',
    ctaType: '',
    linkUrl: '',
    images: [],
    videos: [],
    cards: [],
    platforms: item.publisher_platforms || [],
    reach: Number(item.eu_total_reach) || null,
    snapshotUrl: item.ad_snapshot_url || null,
    transcript: null,
  };
}

/** Anything else: CSV exports, AdWhispr / Foreplay / Motion dumps, hand-built sheets. */
export function fromGeneric(item) {
  const statusText = String(first(item, 'status') || '').toLowerCase();
  const image = first(item, 'image', 'image_url', 'imageUrl', 'thumbnail', 'thumbnail_url', 'thumbnailUrl');
  const video = first(item, 'video', 'video_url', 'videoUrl');
  return {
    source: 'import',
    platform: first(item, 'platform') || 'meta',
    adId: String(first(item, 'id', 'ad_id', 'adId', 'ad_archive_id') ?? sha(item)),
    pageId: String(first(item, 'page_id', 'pageId') ?? ''),
    pageName: first(item, 'brand', 'brand_name', 'brandName', 'page_name', 'pageName', 'advertiser') || '',
    start: iso(first(item, 'start', 'start_date', 'startDate', 'first_seen', 'firstSeen', 'launched')),
    end: iso(first(item, 'end', 'end_date', 'endDate', 'last_seen', 'lastSeen')),
    active: statusText ? statusText === 'active' : Boolean(first(item, 'active', 'is_active', 'isActive')),
    collation: Number(first(item, 'collation_count', 'variants', 'duplicates')) || null,
    collationId: null,
    displayFormat: FORMAT(first(item, 'format', 'media_type', 'mediaType', 'display_format') || (video ? 'video' : image ? 'image' : '')),
    body: first(item, 'body', 'primary_text', 'primaryText', 'ad_copy', 'adCopy', 'copy', 'text') || '',
    title: first(item, 'title', 'headline') || '',
    description: first(item, 'description', 'link_description') || '',
    caption: first(item, 'caption', 'display_url') || '',
    ctaText: first(item, 'cta', 'cta_text', 'ctaText', 'call_to_action') || '',
    ctaType: first(item, 'cta_type', 'ctaType') || '',
    linkUrl: first(item, 'link', 'link_url', 'linkUrl', 'landing_page', 'landingPage', 'destination', 'url') || '',
    images: image ? [image] : [],
    videos: video ? [{ url: video, preview: image || '' }] : [],
    cards: [],
    platforms: [],
    reach: Number(first(item, 'reach', 'impressions')) || null,
    snapshotUrl: first(item, 'snapshot_url', 'ad_library_url') || null,
    transcript: first(item, 'transcript') || null,
    hook: first(item, 'hook') || null,
  };
}

export function detect(item) {
  if (item.snapshot) return fromApify(item);
  if (item.ad_creative_bodies || item.ad_snapshot_url || item.ad_delivery_start_time) return fromMetaApi(item);
  return fromGeneric(item);
}

/** The media a viewer sees first: image, or the video's first frame. */
export const leadImage = (ad) =>
  ad.images[0] || ad.videos[0]?.preview || ad.cards.find((c) => c.image)?.image || null;

/**
 * Fold ads into creatives. Identity = brand + copy + headline + lead media
 * (or Meta's collation_id when the source gives one).
 */
export function toCreatives(ads, brandOf, now) {
  const groups = new Map();
  for (const ad of ads) {
    const brand = brandOf(ad);
    if (!brand) continue;
    const mediaKey = leadImage(ad)?.split('?')[0] || ad.videos[0]?.url?.split('?')[0] || '';
    const key = ad.collationId
      ? sha(['c', brand, ad.collationId])
      : sha([brand, normText(ad.body), normText(ad.title), mediaKey]);
    if (!groups.has(key)) groups.set(key, { key, brand, ads: [] });
    groups.get(key).ads.push(ad);
  }

  return [...groups.values()].map(({ key, brand, ads: group }) => {
    // The richest row carries the creative's content.
    const lead = [...group].sort((a, b) => score(b) - score(a))[0];
    const starts = group.map((a) => toDate(a.start)).filter(Boolean);
    const ends = group.map((a) => toDate(a.end)).filter(Boolean);
    const active = group.some((a) => a.active);
    const start = starts.length ? new Date(Math.min(...starts)) : null;
    const end = active ? now : ends.length ? new Date(Math.max(...ends)) : null;
    return {
      id: key,
      brand,
      pageId: lead.pageId,
      adIds: group.map((a) => a.adId),
      variants: Math.max(group.length, ...group.map((a) => a.collation || 0)),
      active,
      start: start?.toISOString() ?? null,
      end: end?.toISOString() ?? null,
      days: start && end ? daysBetween(start, end) : null,
      displayFormat: lead.displayFormat,
      body: lead.body,
      title: lead.title,
      description: lead.description,
      caption: lead.caption,
      ctaText: lead.ctaText,
      ctaType: lead.ctaType,
      linkUrl: lead.linkUrl,
      landingKey: landingKey(lead.linkUrl),
      image: leadImage(lead),
      video: lead.videos[0]?.url || lead.cards.find((c) => c.video)?.video || null,
      cards: lead.cards,
      platforms: [...new Set(group.flatMap((a) => a.platforms || []))],
      reach: group.reduce((s, a) => s + (a.reach || 0), 0) || null,
      snapshotUrl: lead.snapshotUrl,
      transcript: lead.transcript || null,
      importedHook: lead.hook || null,
    };
  });
}

const score = (a) => (a.body ? 2 : 0) + (a.title ? 1 : 0) + (leadImage(a) ? 2 : 0) + (a.linkUrl ? 1 : 0);
