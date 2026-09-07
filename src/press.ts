/**
 * The outlets that have actually covered Harvey's, and the logo file for each.
 *
 * One registry, used by both the trust bar at the top of the page and the
 * press strip further down, so a logo is never defined in two places.
 *
 * `height` is the display height in px. It is tuned PER LOGO on purpose —
 * these wordmarks have wildly different aspect ratios (the Sacramento Bee is
 * about 12:1, ABC10 is about 2:1), so setting one shared height would make
 * the Bee enormous and ABC10 a speck. The numbers below are chosen so the
 * three read as roughly equal weight sitting next to each other.
 *
 * Adding an outlet: drop a black-on-transparent SVG or PNG in
 * public/images/press/, add a key here, then reference that key from the
 * markdown. Nothing else needs to change.
 */
export const PRESS_LOGOS = {
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
} as const;

export type PressLogoKey = keyof typeof PRESS_LOGOS;

/** Returns the logo record for a key, or null if the key isn't one we have. */
export function pressLogo(key: string | undefined | null) {
  if (!key) return null;
  return (PRESS_LOGOS as Record<string, { name: string; src: string; height: number }>)[key] ?? null;
}
