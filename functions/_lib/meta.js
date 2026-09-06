/**
 * Meta Conversions API — server-side event forwarding.
 *
 * Why this exists: the browser pixel is blocked for a meaningful share of your
 * traffic (ad blockers, iOS, privacy browsers). Those clicks still happen; Meta
 * just never hears about them, so its optimiser is learning from partial data
 * and your reported cost per action is worse than the real one.
 *
 * Deduplication: the browser fires the same event with the same `eventID`, and
 * Meta collapses the pair. Without a shared event_id you double-count.
 *
 * Nothing here throws. A tracking failure must never break a redirect.
 */

const DEFAULT_API_VERSION = 'v25.0';

/** Read a cookie out of the request header. */
export function cookie(request, name) {
  const header = request.headers.get('cookie') || '';
  for (const part of header.split(';')) {
    const [k, ...rest] = part.trim().split('=');
    if (k === name) return rest.join('=');
  }
  return undefined;
}

/**
 * Meta's click ID cookie format. If someone arrives from an ad with ?fbclid=
 * and the pixel hasn't set _fbc yet, we can build it ourselves:
 *   fb.<subdomain-index>.<timestamp-ms>.<fbclid>
 */
export function deriveFbc(request, url) {
  const existing = cookie(request, '_fbc');
  if (existing) return existing;
  const fbclid = url.searchParams.get('fbclid');
  if (!fbclid) return undefined;
  return `fb.1.${Date.now()}.${fbclid}`;
}

/**
 * Send one event. Returns a promise — hand it to context.waitUntil() so the
 * user's redirect isn't waiting on Meta's response.
 */
export async function sendMetaEvent(env, request, url, event) {
  const pixelId = env.META_PIXEL_ID;
  const token = env.META_ACCESS_TOKEN;
  if (!pixelId || !token) return; // not configured — silently skip

  const version = env.META_API_VERSION || DEFAULT_API_VERSION;

  const payload = {
    data: [
      {
        event_name: event.name,
        event_time: Math.floor(Date.now() / 1000),
        event_id: event.eventId,
        event_source_url: event.sourceUrl || url.toString(),
        action_source: 'website',
        user_data: {
          client_ip_address: request.headers.get('cf-connecting-ip') || undefined,
          client_user_agent: request.headers.get('user-agent') || undefined,
          fbp: cookie(request, '_fbp'),
          fbc: deriveFbc(request, url),
        },
        custom_data: event.customData || {},
      },
    ],
  };

  if (env.META_TEST_EVENT_CODE) payload.test_event_code = env.META_TEST_EVENT_CODE;

  try {
    const res = await fetch(
      `https://graph.facebook.com/${version}/${pixelId}/events?access_token=${encodeURIComponent(token)}`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
      }
    );
    if (!res.ok) {
      // Surfaces in `wrangler pages deployment tail`. Never thrown.
      console.log('meta capi error', res.status, await res.text());
    }
  } catch (err) {
    console.log('meta capi exception', err && err.message);
  }
}

/**
 * Write one row to the Analytics Engine dataset, if the binding exists.
 * Query it later with SQL — see README §8.
 */
export function logToAE(env, { event, position, destination, request, extra }) {
  if (!env || !env.AE) return;
  try {
    const cf = request.cf || {};
    env.AE.writeDataPoint({
      // indexes are what you group by cheaply; one only.
      indexes: [String(position || event || 'unknown')],
      blobs: [
        String(event || ''),
        String(position || ''),
        String(destination || ''),
        String(cf.country || ''),
        String(request.headers.get('referer') || ''),
        String(extra || ''),
      ],
      doubles: [1],
    });
  } catch (err) {
    console.log('analytics engine error', err && err.message);
  }
}
