import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';

/**
 * An advertorial is a LIST OF BLOCKS, not a page of HTML.
 *
 * That is the whole point of this setup: you (or the CMS at /admin) add,
 * remove and reorder blocks, and the layout renders each one with the right
 * component. Nobody edits markup to publish a new page.
 *
 * To add a new block type: add it to the union below, add a matching
 * component in src/components/, register it in src/layouts/Advertorial.astro,
 * and add the field group to public/admin/config.yml.
 */

const photo = z.object({
  src: z.string().optional(),        // /images/roaster.jpg — leave empty to show the placeholder
  alt: z.string().default(''),
  caption: z.string().optional(),
  shape: z.enum(['wide', 'standard', 'tall']).default('standard'),
  width: z.enum(['full', 'inset']).default('full'),
  note: z.string().optional(),       // what to shoot, shown only while src is empty
});

const blocks = z.discriminatedUnion('type', [
  // Body copy. Markdown, so links, bold and lists all work.
  z.object({
    type: z.literal('prose'),
    heading: z.string().optional(),
    lead: z.boolean().default(false),   // drop cap on the first paragraph
    body: z.string(),
  }),

  z.object({ type: z.literal('photo') }).merge(photo),

  // Credibility strip under the header: a logo row, then social proof,
  // then stars. Every field is optional — leave one out and that row
  // doesn't render.
  z.object({
    type: z.literal('trustbar'),
    label: z.string().optional(),                  // e.g. "As Seen In" — sits between two rules
    logos: z.array(z.string()).default([]),        // keys from src/press.ts
    heading: z.string().optional(),                // the bold line
    proof: z.string().optional(),                  // the quieter line under it
    stars: z.number().min(0).max(5).default(0),    // 0 = don't show stars
  }),

  // Places the CTA module. The copy comes from the `cta` field below, so
  // every CTA on the page is identical by construction.
  z.object({
    type: z.literal('cta'),
    variant: z.enum(['standard', 'final']).default('standard'),
  }),

  z.object({
    type: z.literal('pullquote'),
    text: z.string(),
  }),

  z.object({
    type: z.literal('compare'),
    label: z.string().optional(),
    themHeading: z.string().default('Supermarket bag'),
    usHeading: z.string().default("Harvey's subscription"),
    rows: z.array(z.object({
      label: z.string(),
      them: z.string(),
      us: z.string(),
    })).default([]),
  }),

  z.object({
    type: z.literal('steps'),
    items: z.array(z.object({
      title: z.string(),
      body: z.string(),
    })).default([]),
  }),

  z.object({
    type: z.literal('quizcard'),
    heading: z.string().default('What the quiz asks'),
    time: z.string().default('5 questions · about 60 seconds'),
    questions: z.array(z.string()).default([]),
    footnote: z.string().optional(),
  }),

  z.object({
    type: z.literal('press'),
    label: z.string().default('As covered by'),
    items: z.array(z.object({
      outlet: z.string(),
      logo: z.string().optional(),   // key from src/press.ts; falls back to the outlet name
      quote: z.string(),
      url: z.string().url(),
      linkText: z.string().default('Read the article →'),
    })).default([]),
  }),

  z.object({
    type: z.literal('reviews'),
    heading: z.string().optional(),
    items: z.array(z.object({
      stars: z.number().min(1).max(5).default(5),
      quote: z.string(),
      who: z.string(),
    })).default([]),
  }),

  z.object({
    type: z.literal('faq'),
    heading: z.string().default('Questions'),
    items: z.array(z.object({
      q: z.string(),
      a: z.string(),
    })).default([]),
  }),
]);

const advertorials = defineCollection({
  loader: glob({ base: './src/content/advertorials', pattern: '**/*.md' }),
  schema: z.object({
    // --- listing / status ---
    title: z.string(),                     // internal name, also the <title>
    draft: z.boolean().default(false),
    primary: z.boolean().default(false),   // the one "/" redirects to

    // --- head ---
    description: z.string().max(200),
    ogImage: z.string().default('/og.jpg'),
    noindex: z.boolean().default(true),

    // --- article header ---
    kicker: z.string().optional(),
    headline: z.string(),
    dek: z.string().optional(),
    author: z.string().optional(),
    date: z.coerce.date().optional(),
    readingTime: z.string().optional(),

    // --- the CTA module, used by every `cta` block on the page ---
    cta: z.object({
      offer: z.string(),
      urgency: z.string().optional(),
      button: z.string().default('TAKE THE QUIZ'),
      sub: z.string().optional(),
      // Leave empty and no guarantee line renders. Fill it in only once the
      // refund policy actually says the same thing.
      risk: z.string().default(''),
      bullets: z.array(z.string()).default([]),
      // Named destination, resolved server-side in functions/_lib/destinations.js.
      // Never a raw URL — that would make /go an open redirect.
      destination: z.string().default('quiz'),
    }),

    sticky: z.object({
      title: z.string(),
      sub: z.string().optional(),
    }).optional(),

    // --- the page itself ---
    blocks: z.array(blocks).default([]),
  }),
});

export const collections = { advertorials };
