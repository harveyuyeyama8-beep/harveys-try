/**
 * /go — the click tracker.
 *
 * Every CTA on the site points here instead of straight at the store. This is
 * Atlas's /clkg/ redirect, except it's on your own domain, so there's no
 * third-party hop and nothing for a browser to block.
 *
 * What it does, in order:
 *   1. resolves a NAMED destination (never a URL from the query string)
 *   2. writes a row to Analytics Engine — which CTA, which country, referrer
 *   3. fires the Meta Conversions API server-side, sharing an event_id with
 *      the browser pixel so the two deduplicate
 *   4. 302s the visitor onward
 *
 * Steps 2 and 3 run inside waitUntil, so the person is redirected immediately
 * and never waits for a tracking call.
 *
 *   /go?to=quiz&pos=cta-1&eid=<uuid>
 */
import { resolveDestination, clean } from './_lib/destinations.js';
import { sendMetaEvent, logToAE } from './_lib/meta.js';

export async function onRequestGet(context) {
  const { request, env, waitUntil } = context;
  const url = new URL(request.url);

  const to = clean(url.searchParams.get('to'), 'quiz');
  const position = clean(url.searchParams.get('pos'), 'unknown');
  const eventId = clean(url.searchParams.get('eid'), '') || crypto.randomUUID();

  const { key, href } = resolveDestination(to, position, env);

  logToAE(env, {
    event: 'quiz_start_click',
    position,
    destination: key,
    request,
    extra: eventId,
  });

  waitUntil(
    sendMetaEvent(env, request, url, {
      name: 'QuizStart',
      eventId,
      sourceUrl: request.headers.get('referer') || url.origin,
      customData: { cta_position: position, destination: key },
    })
  );

  return new Response(null, {
    status: 302,
    headers: {
      Location: href,
      // Never let a CDN or browser cache a tracked redirect — you'd stop
      // counting clicks after the first one.
      'Cache-Control': 'no-store, no-cache, must-revalidate',
      'Referrer-Policy': 'no-referrer-when-downgrade',
    },
  });
}
