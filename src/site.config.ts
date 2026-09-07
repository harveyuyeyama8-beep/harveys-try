/**
 * Everything that is true of the whole site rather than one advertorial.
 * Change it here, not in a template.
 */
export const site = {
  url: 'https://try.harveyscoffee.shop',
  name: "Harvey's Coffee",
  location: 'Davis, California',
  tagline: 'Single-origin coffee, roasted to order in Davis, California.',

  storeUrl: 'https://harveyscoffee.shop',
  quizPath: '/pages/take-our-quiz',
  contactEmail: '[YOUR@DOMAIN.EMAIL]',

  // The disclosure bar. Keep it — it is what makes this an honest
  // advertorial rather than a page pretending to be journalism.
  disclosure: {
    label: 'Advertisement',
    detail: "Paid content from Harvey's Coffee",
  },

  footerLinks: [
    { text: 'Find your coffee', href: 'https://harveyscoffee.shop/pages/take-our-quiz' },
    { text: 'Shop', href: 'https://harveyscoffee.shop' },
    { text: 'Refund policy', href: 'https://harveyscoffee.shop/policies/refund-policy' },
    { text: 'Privacy', href: 'https://harveyscoffee.shop/policies/privacy-policy' },
  ],

  legal:
    "This page is an advertisement published by Harvey's Coffee. Press quotations link to " +
    'the original articles and are reproduced for reference. Reviews are from verified ' +
    'customers, published with permission. Subscriptions renew until cancelled; terms and ' +
    'cancellation details are on the checkout page.',

  /**
   * Tracking.
   *
   * These two IDs are the BROWSER side. The server side (Meta Conversions
   * API) is configured with Cloudflare secrets instead — see README §7 —
   * because an access token must never sit in a public repo.
   */
  ga4Id: '',        // 'G-XXXXXXXXXX'
  metaPixelId: '1804928640922147',  // '1804928640922147'

  /**
   * Both hosts must also be listed in GA4 Admin → Data Streams → Configure
   * tag settings → Configure your domains, or GA4 records the quiz visit as
   * a referral from your own advertorial and the path breaks.
   */
  linkerDomains: ['harveyscoffee.shop', 'try.harveyscoffee.shop'],
} as const;
