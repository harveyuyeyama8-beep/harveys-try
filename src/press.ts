/**
 * The outlets that have actually covered Harvey's, and the logo file for each.
 *
 * One registry, used by the trust bar at the top of the page, the press strip
 * and the coverage module further down, so a logo is never defined in two
 * places.
 *
 * `height` is the display height in px. It is tuned PER LOGO on purpose —
 * these wordmarks have wildly different aspect ratios (the Sacramento Bee is
 * about 12:1, ABC10 is about 2:1), so setting one shared height would make
 * the Bee enormous and ABC10 a speck. The numbers below are chosen so the
 * three read as roughly equal weight sitting next to each other.
 *
 * An outlet with no `src` has no logo file yet. It renders as its name set in
 * type (`face` picks serif or sans), so it can already be listed without a
 * broken image. Drop a logo file in public/images/press/ and add `src` +
 * `height` to switch it to the real logo. (The news shell shows logos in
 * grayscale, so a colored file is fine there.)
 *
 * Every outlet here really covered the business:
 *   toi        The Times of India, Sept. 5, 2026 (re-reports the Bee story)
 *   sacbee     The Sacramento Bee, July 1, 2026
 *   abc10      ABC10 (KXTV), April 16, 2026
 *   aol        AOL — syndicated the Bee story, July 1, 2026
 *   yahoo      Yahoo News — syndicated the Bee's video, July 1, 2026
 *   comstocks  Comstock's Magazine, July 20, 2026
 *   enterprise The Davis Enterprise, May 8, 2026
 *   dirt       The Dirt (Davis), Aug. 2025
 *
 * Adding an outlet: add a key here, then reference that key from the
 * markdown, and add it to the two logo `options:` lists in
 * public/admin/config.yml.
 */
export interface PressLogo {
  name: string;
  src?: string;
  height?: number;
  face?: 'serif' | 'sans';
}

export const PRESS_LOGOS: Record<string, PressLogo> = {
  abc10: {
    name: 'ABC10',
    src: '/images/press/abc10.svg',
    height: 30,
  },
  sacbee: {
    name: 'The Sacramento Bee',
    src: '/images/press/sacbee.svg',
    height: 16,
  },
  comstocks: {
    name: "Comstock's Magazine",
    src: '/images/press/comstocks.png',
    height: 25,
  },
  // toi, aol and yahoo logos: Wikimedia Commons files (public domain there),
  // downloaded 2026-09-23 with Harvey's OK.
  toi: {
    name: 'The Times of India',
    src: '/images/press/toi.svg',
    height: 15,
  },
  aol: {
    name: 'AOL',
    src: '/images/press/aol.svg',
    height: 19,
  },
  yahoo: {
    name: 'Yahoo News',
    src: '/images/press/yahoo-news.svg',
    height: 18,
  },
  enterprise: {
    name: 'The Davis Enterprise',
    face: 'serif',
  },
  dirt: {
    name: 'The Dirt',
    face: 'serif',
  },
};

export type PressLogoKey = keyof typeof PRESS_LOGOS;

/** Returns the logo record for a key, or null if the key isn't one we have. */
export function pressLogo(key: string | undefined | null): PressLogo | null {
  if (!key) return null;
  return PRESS_LOGOS[key] ?? null;
}
