/**
 * Named destinations.
 *
 * /go NEVER accepts a URL from the query string. It accepts a NAME, and looks
 * it up here. That is the difference between a click tracker and an open
 * redirect that spammers will find within a week and use to launder phishing
 * links through your domain.
 *
 * To add a destination: add a key here, then reference it as `destination:`
 * in an advertorial's frontmatter.
 */

export const BASE_UTM = {
  utm_source: 'advertorial',
  utm_medium: 'referral',
  utm_campaign: 'roasted-to-order',
};

export const DESTINATIONS = {
  quiz: {
    url: 'https://harveyscoffee.shop/pages/take-our-quiz',
  },
  shop: {
    url: 'https://harveyscoffee.shop',
  },
  // Example of a per-destination campaign override:
  // 'quiz-holiday': {
  //   url: 'https://harveyscoffee.shop/pages/take-our-quiz',
  //   utm: { utm_campaign: 'holiday-gifting' },
  // },
};

export const DEFAULT_DESTINATION = 'quiz';

/** Strip anything that isn't a safe short token. Query strings are attacker input. */
export function clean(value, fallback = '') {
  if (typeof value !== 'string') return fallback;
  const out = value.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 40);
  return out || fallback;
}

/**
 * Resolve a destination name to a full URL with UTMs attached.
 * If DISCOUNT_CODE is set as an environment variable, the link is wrapped so
 * the code applies itself on arrival and nobody has to type one.
 */
export function resolveDestination(name, position, env, page) {
  const key = Object.prototype.hasOwnProperty.call(DESTINATIONS, name)
    ? name
    : DEFAULT_DESTINATION;
  const entry = DESTINATIONS[key];

  const url = new URL(entry.url);
  const utm = { ...BASE_UTM, ...(entry.utm || {}) };
  for (const [k, v] of Object.entries(utm)) url.searchParams.set(k, v);

  // utm_content carries BOTH which advertorial and which CTA on it, as
  // "<page>--<cta-position>". One field, because Shopify and GA4 both surface
  // utm_content but neither reliably shows utm_term. With several advertorials
  // running, this is what tells you which page earned the click.
  if (position) {
    url.searchParams.set('utm_content', page ? `${page}--${position}` : position);
  }

  const code = env && env.DISCOUNT_CODE;
  if (code) {
    const wrapped = new URL(url.origin);
    wrapped.pathname = `/discount/${encodeURIComponent(code)}`;
    wrapped.searchParams.set('redirect', url.pathname + url.search);
    return { key, href: wrapped.toString() };
  }

  return { key, href: url.toString() };
}
