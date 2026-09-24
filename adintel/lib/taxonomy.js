/**
 * Every label the pipeline can put on an ad, and every rubric it grades with.
 *
 * Labels are Jev `choice` criteria: the key is what lands in the data, the
 * value is what Jev reads when deciding. Edit the descriptions to sharpen a
 * decision; add a key to add a bucket. Rubrics are Jev `score` questions with
 * five levels (0–4); their WEIGHTS live in config.json so `calibrate` can
 * retune them from your own results.
 */

export const AD_TYPES = {
  ugc_testimonial: 'A real-looking customer or creator talking to camera about their own experience with the product',
  ugc_unboxing: 'Creator opens the delivery / package on camera and reacts',
  ugc_routine: 'Creator shows the product inside a daily routine — morning ritual, day-in-the-life, "get ready with me"',
  founder_story: 'Founder or owner on camera or in first person telling why they started the company',
  native_static: 'Static image built to look organic, not like an ad: notes-app page, tweet / Reddit / text-message screenshot, handwritten note, raw phone photo with plain text',
  native_video: 'Lo-fi, unpolished video that looks like organic content but is not a creator testimonial',
  polished_static: 'Designed brand graphic or studio product photo; obviously an ad',
  polished_video: 'High-production brand commercial',
  meme: 'Meme format or joke template',
  listicle_static: 'Numbered list on the creative ("5 reasons…", "3 things…")',
  comparison: 'Us-vs-them: side-by-side or checklist against a competitor or the category (grocery coffee, Starbucks, pods)',
  before_after: 'Before / after transformation',
  review_collage: 'Wall of reviews, star ratings, customer quotes or comment screenshots',
  press_authority: 'Led by press ("as seen in"), an expert, a certification or an award',
  product_demo: 'Shows how it is made or used: brewing, roasting, pouring, ingredients, process',
  street_interview: 'Street interview, blind taste test, or strangers reacting',
  green_screen: 'Creator in front of an article, screenshot or website (green-screen style)',
  podcast_clip: 'Podcast or interview clip',
  carousel_multi: 'Carousel of several products, flavours or benefits',
  catalog_dpa: 'Templated catalog / dynamic product ad: product image, name, price',
  bof_discount: 'Offer is the hero: % off, sale, BOGO, bundle price, discount code',
  giveaway_free: 'Free bag, free sample, free gift or free shipping is the hero',
  problem_agitate: 'Leads with a pain and twists it: stale coffee, jitters, crashes, cost, bitterness',
  education_myth: 'Teaches something or busts a myth ("did you know…", "the truth about…")',
  advertorial_driver: 'Looks like a news or article teaser whose job is to send people to an article',
  holiday_gifting: 'Seasonal, holiday or gifting angle',
  quiz_driver: 'Invites the viewer to take a quiz or find their match',
  brand_mission: 'Mission, values or awareness with no direct product push',
  other: 'None of the above',
};

export const HOOK_ARCHETYPES = {
  question: 'Opens with a direct question to the viewer',
  bold_claim: 'A bold, confident claim or promise',
  contrarian: 'Contrarian or myth-busting: says the common belief is wrong',
  stat_number: 'Leads with a specific number or statistic',
  callout: 'Calls out a specific audience ("If you drink coffee every morning…", "Moms who…")',
  story_open: 'Opens a personal story mid-action ("I was spending $7 a day…")',
  social_proof: 'Leads with how many people use / love it, reviews, ratings',
  curiosity_gap: 'Withholds the key detail so you have to keep going',
  warning_fear: 'Warning, fear or danger ("Stop drinking…", "Your coffee might be…")',
  us_vs_them: 'Enemy framing: big coffee, grocery brands, pods, Starbucks',
  price_anchor: 'Leads with money: price, savings, cost per cup, latte math',
  pov: 'POV or relatable scenario framing ("POV: you finally…")',
  demonstration: 'The visual itself is the hook: a pour, a reaction, a process',
  authority: 'Expert, press, award or credential first',
  humor: 'Joke or absurdity first',
  urgency_scarcity: 'Deadline, limited stock or limited-time offer first',
  identity: 'Speaks to who the viewer is or wants to be ("For people who actually taste their coffee")',
  secret_insider: 'Secret or insider knowledge ("What roasters won\'t tell you")',
  transformation: 'Before/after or change-of-state promise',
  offer_first: 'The discount or free offer is the opening line',
  other: 'None of the above',
};

export const ANGLES = {
  taste: 'Taste and flavour',
  freshness: 'Freshness / roasted-to-order / roast date',
  health: 'Health, clean ingredients, low acid, mold / mycotoxin free, no jitters',
  energy_focus: 'Energy, focus, productivity, no crash',
  convenience: 'Convenience, delivered, never run out, easy',
  price_value: 'Price, value, savings vs café',
  quality_origin: 'Origin, single-origin, sourcing, craft, specialty grade',
  ethics: 'Ethics, direct trade, sustainability, farmers',
  personalization: 'Personalised / matched to you / quiz',
  identity_lifestyle: 'Identity, lifestyle, aesthetic, ritual',
  underdog_local: 'Small / local / family / young founders vs big corporations',
  gifting: 'Gift for someone else',
  novelty: 'New product, new format, limited release',
  other: 'Other',
};

export const FUNNEL = {
  tof: 'Top of funnel: cold audience, sells the idea or the problem, no hard offer',
  mof: 'Middle of funnel: builds belief — proof, comparison, education, reviews',
  bof: 'Bottom of funnel: pushes the purchase now — offer, urgency, retargeting language',
};

export const AWARENESS = {
  unaware: 'Unaware: viewer does not know they have the problem; ad opens with a story, curiosity or identity',
  problem_aware: 'Problem aware: names the problem, not yet the solution',
  solution_aware: 'Solution aware: talks about the type of solution (fresh roasted, subscription)',
  product_aware: 'Product aware: compares this brand, handles objections',
  most_aware: 'Most aware: just the offer / reminder',
};

export const OFFER_TYPES = {
  none: 'No offer',
  percent_off: 'Percentage off',
  dollar_off: 'Dollar amount off',
  first_order: 'First-order / first-bag deal',
  free_product: 'Free bag, free gift, free sample or free gear',
  free_shipping: 'Free shipping',
  bundle: 'Bundle, multi-bag or BOGO',
  subscription_discount: 'Subscribe-and-save discount',
  trial_guarantee: 'Trial, money-back guarantee or risk reversal as the offer',
  sale_event: 'Named sale event (Black Friday, anniversary, holiday)',
};

export const LANDING_TYPES = {
  pdp: 'Product detail page with price and add-to-cart',
  collection: 'Collection or shop-all page',
  homepage: 'Brand homepage',
  advertorial: 'Long-form article / news-style advertorial selling the product',
  listicle: 'Numbered listicle ("5 reasons…") selling the product',
  quiz: 'Quiz or product finder',
  lander: 'Dedicated sales page / long-form landing page that is not article-styled',
  other: 'Something else or could not tell',
};

/** Five-level rubrics, index 0 (worst) → 4 (best). */
const R = (worst, low, mid, high, best) => [worst, low, mid, high, best];

export const RUBRICS = {
  hook: {
    scroll_stop: {
      q: 'How hard is it for someone scrolling a Facebook or Instagram feed to scroll past this opening?',
      levels: R('Invisible; indistinguishable from any ad', 'Faintly interesting', 'Noticeable; some pull', 'Strong pattern interrupt', 'Nearly impossible to scroll past'),
    },
    curiosity: {
      q: 'How strongly does the opening create an open loop the viewer needs closed?',
      levels: R('No open question', 'Weak', 'Moderate', 'Strong', 'Irresistible'),
    },
    specificity: {
      q: 'How concrete is the opening — numbers, names, sensory detail, a specific situation?',
      levels: R('Pure generic', 'Mostly generic', 'Some specific detail', 'Specific', 'Vivid and exact'),
    },
    clarity: {
      q: 'How fast is the opening understood — under two seconds, no rereading?',
      levels: R('Confusing', 'Needs rereading', 'Understood with effort', 'Clear', 'Instant'),
    },
    emotion: {
      q: 'How strong an emotion does the opening trigger (surprise, envy, anger, fear, delight, identity)?',
      levels: R('None', 'Faint', 'Moderate', 'Strong', 'Visceral'),
    },
    relevance: {
      q: 'How relevant is the opening to a US adult who drinks coffee at home most days?',
      levels: R('Irrelevant', 'Loosely related', 'Relevant', 'Very relevant', 'Feels written for them'),
    },
    credibility: {
      q: 'How believable is the opening to a skeptical buyer?',
      levels: R('Sounds like a scam', 'Hard to believe', 'Neutral', 'Believable', 'Obviously true'),
    },
    novelty: {
      q: 'How different is the opening from the typical coffee ad the viewer has seen a hundred times?',
      levels: R('Cliché', 'Familiar', 'Somewhat fresh', 'Fresh', 'Never seen anything like it'),
    },
  },
  body: {
    readability: {
      q: 'How easy and pleasant is the primary text to read on a phone?',
      levels: R('Wall of text / confusing', 'Hard work', 'Fine', 'Easy', 'Effortless, pulls you line to line'),
    },
    benefit_density: {
      q: 'How many concrete, desirable outcomes does the copy make the reader feel?',
      levels: R('None', 'Vague benefits', 'A few', 'Several strong ones', 'Every line sells an outcome'),
    },
    proof: {
      q: 'How much believable proof does the copy carry (numbers, reviews, press, specifics, demonstrations)?',
      levels: R('None', 'Token', 'Some', 'Solid', 'Overwhelming'),
    },
    objection_handling: {
      q: 'How well does the copy pre-empt the reasons someone would not buy (price, commitment, taste risk, cancel)?',
      levels: R('Ignores them', 'Barely', 'Handles one', 'Handles several', 'Leaves no reason to wait'),
    },
    offer_clarity: {
      q: 'How clear is what to do next and what you get for doing it?',
      levels: R('No idea', 'Vague', 'Understandable', 'Clear', 'Crystal clear and compelling'),
    },
    voice: {
      q: 'How human and native does the copy feel, versus corporate ad-speak?',
      levels: R('Corporate', 'Stiff', 'Neutral', 'Human', 'Sounds like a friend texting you'),
    },
  },
  headline: {
    clarity: {
      q: 'How instantly understood is the headline?',
      levels: R('Confusing', 'Unclear', 'OK', 'Clear', 'Instant'),
    },
    benefit: {
      q: 'How strong is the benefit or reason to click in the headline?',
      levels: R('None', 'Weak', 'Moderate', 'Strong', 'Irresistible'),
    },
    curiosity: {
      q: 'How much does the headline make you want to see what is behind the click?',
      levels: R('Not at all', 'Slightly', 'Somewhat', 'Very', 'Must click'),
    },
  },
  cta: {
    action_clarity: {
      q: 'How clear is the action being asked for?',
      levels: R('No clear action', 'Vague', 'OK', 'Clear', 'Unmissable'),
    },
    low_friction: {
      q: 'How small does the commitment feel (e.g. "take a 30-second quiz" vs "subscribe now")?',
      levels: R('Big scary commitment', 'Heavy', 'Moderate', 'Light', 'Feels like nothing'),
    },
    value_framing: {
      q: 'How well does the call to action say what the person gets, not just what they do?',
      levels: R('Only the action', 'Barely', 'Some value', 'Clear value', 'Value is the whole CTA'),
    },
    congruence: {
      q: 'How well does the call to action follow from the hook and copy before it?',
      levels: R('Disconnected', 'Weak link', 'Fine', 'Natural', 'Inevitable next step'),
    },
  },
  advertorial: {
    narrative_pull: {
      q: 'How strongly does the page pull a reader from the top through to the offer?',
      levels: R('Bounces immediately', 'Weak', 'Keeps some readers', 'Strong', 'Unputdownable'),
    },
    native_feel: {
      q: 'How much does the page read like genuine editorial content rather than a sales page?',
      levels: R('Obvious sales page', 'Mostly salesy', 'Mixed', 'Mostly editorial', 'Reads like real journalism'),
    },
    proof_density: {
      q: 'How much believable proof is on the page (press, reviews, numbers, photos, founder story)?',
      levels: R('None', 'Token', 'Some', 'Lots', 'Overwhelming'),
    },
    objection_handling: {
      q: 'How thoroughly does the page kill the reasons not to buy?',
      levels: R('Ignores them', 'Barely', 'Handles some', 'Handles most', 'Nothing left to object to'),
    },
    offer_reveal: {
      q: 'How well is the offer revealed — earned by the story, clear, urgent?',
      levels: R('No offer / buried', 'Weak', 'Present', 'Strong', 'Perfectly timed and compelling'),
    },
  },
};

export const COMPONENTS = Object.keys(RUBRICS);
