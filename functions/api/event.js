/**
 * /api/event — the beacon endpoint.
 *
 * The page posts page views and scroll depth here. Same-origin, first-party,
 * so it survives the blockers that eat third-party analytics. Cheap: one
 * Analytics Engine row per event, no database.
 *
 * Always returns 204 quickly. A tracking endpoint that can fail loudly is a
 * tracking endpoint that will eventually take a page down with it.
 */
import { logToAE, sendMetaEvent } from '../_lib/meta.js';
import { clean } from '../_lib/destinations.js';

const ALLOWED_EVENTS = new Set(['advertorial_view', 'scroll_depth', 'quiz_start_click']);

export async function onRequest(context) {
  const { request, env, waitUntil } = context;

  // Single handler, branching on method. Exporting both onRequest and
  // onRequestPost makes precedence ambiguous, so don't.
  if (request.method !== 'POST') return new Response(null, { status: 405 });

  let body = {};
  try {
    body = await request.json();
  } catch {
    return new Response(null, { status: 204 });
  }

  const event = clean(body.event, '');
  if (!ALLOWED_EVENTS.has(event)) return new Response(null, { status: 204 });

  const position = clean(body.cta_position, '');
  const depth = Number.isFinite(body.percent_scrolled) ? String(body.percent_scrolled) : '';

  // clean() strips the slashes, so "/origin-story" becomes "origin-story" and
  // the root page becomes "root" — matching the slug that /go records.
  const page = clean(body.path, '') || 'root';

  logToAE(env, {
    event,
    position: position || event,
    page,
    destination: '',
    request,
    extra: depth,
  });

  // Only the page view is worth sending to Meta from here; the click is sent
  // by /go, which has the redirect context and the shared event_id.
  if (event === 'advertorial_view') {
    waitUntil(
      sendMetaEvent(env, request, new URL(request.url), {
        name: 'ViewContent',
        eventId: clean(body.event_id, '') || crypto.randomUUID(),
        sourceUrl: request.headers.get('referer') || new URL(request.url).origin,
        customData: { content_name: String(body.path || '/').slice(0, 100) },
      })
    );
  }

  return new Response(null, { status: 204 });
}
