/**
 * Stage 3 — take every creative apart. Claude (the cheap model) looks at the
 * image or first video frame and the copy, and returns each component the
 * way a viewer meets it: the hook, what you see, the text on the image, the
 * body, headline, CTA, offer, proof. Verbatim where visible.
 */
import { z } from 'zod';
import { makeClaude } from '../lib/claude.js';
import { log, pool, sha, firstLine, truncate } from '../lib/util.js';

const PROMPT_VERSION = 3;

export const Components = z.object({
  hook: z.string().describe(
    'The scroll-stopper exactly as the viewer meets it. Video: the first spoken or on-screen line. Static: the dominant text on the image. Otherwise the first line of the primary text. Verbatim.',
  ),
  hookSource: z.string().describe('One of: spoken, on_screen_text, image_text, primary_text, headline'),
  visualHook: z.string().describe('What the image or first frame shows, in 20 words or fewer. Empty if no image was provided.'),
  onImageText: z.string().describe('Every piece of text visible on the image, verbatim. Empty if none or no image.'),
  primaryTextBody: z.string().describe('The primary text after the hook line, verbatim. Empty if none.'),
  headline: z.string(),
  ctaButton: z.string().describe('The button label, e.g. "Shop now".'),
  ctaLine: z.string().describe('The sentence in the copy that asks for the action, verbatim. Empty if none.'),
  offer: z.string().describe('The offer in plain words, e.g. "50% off first bag". Empty if none.'),
  proofElements: z.array(z.string()).describe('Each piece of proof: review counts, ratings, press, numbers, certifications.'),
  bigIdea: z.string().describe('The single promise the ad is built on, one sentence.'),
  mechanism: z.string().describe('The reason it works that the ad claims ("roasted the day it ships"). Empty if none.'),
  targetCustomer: z.string().describe('Who this ad is written for, 12 words or fewer.'),
  tone: z.string().describe('Three words or fewer.'),
});

const SYSTEM = `You are a direct-response ad analyst. You take one social ad apart into its components, exactly as a person scrolling a feed meets them.

Rules:
- Quote text verbatim wherever it is visible in the copy, image or transcript. Do not rewrite, fix or improve anything.
- Never invent a component the ad does not have. If it is absent, return an empty string (or an empty list).
- The hook is the first thing that grabs attention: for video, the first spoken or on-screen line; for a static image, the dominant text on the image; if there is no image text, the first line of the primary text.
- If no image is attached, leave visualHook and onImageText empty and take the hook from the transcript or the copy.`;

function adText(c) {
  const lines = [
    `Brand: ${c.brand}`,
    `Format: ${c.displayFormat}`,
    `Running: ${c.days ?? '?'} days, ${c.active ? 'still active' : 'stopped'}, ${c.variants} ad ID(s)`,
    '',
    'Primary text:',
    '"""',
    c.body || '(none)',
    '"""',
    `Headline: ${c.title || '(none)'}`,
    `Link description: ${c.description || '(none)'}`,
    `CTA button: ${c.ctaText || c.ctaType || '(none)'}`,
    `Display link: ${c.caption || '(none)'}`,
  ];
  if (c.transcript) lines.push('', 'Video transcript:', '"""', truncate(c.transcript, 3000), '"""');
  if (c.cards?.length) {
    lines.push('', 'Carousel cards:');
    c.cards.slice(0, 10).forEach((k, i) => lines.push(`${i + 1}. ${k.title || ''} — ${truncate(k.body, 200)}`));
  }
  if (c.importedHook) lines.push('', `Hook recorded by the source tool: ${c.importedHook}`);
  return lines.join('\n');
}

/** Offline / failure fallback: pull components out of the text with no model. */
export function heuristicComponents(c) {
  const hook = c.importedHook || firstLine(c.transcript) || firstLine(c.body) || c.title || '';
  const body = String(c.body || '');
  const rest = body.startsWith(hook) ? body.slice(hook.length).trim() : body;
  const offer = (body.match(/\b(\d{1,2}% off[^.!\n]*|free [a-z ]{3,30}|buy \d+ get \d+[^.!\n]*|\$\d+ off[^.!\n]*)/i) || [])[0] || '';
  const ctaLine = (body.match(/[^.!\n]*(shop now|order now|try it|get yours|take the quiz|click|tap|claim|start)[^.!\n]*[.!]?/i) || [])[0] || '';
  return {
    hook,
    hookSource: c.transcript ? 'spoken' : 'primary_text',
    visualHook: '',
    onImageText: '',
    primaryTextBody: rest,
    headline: c.title || '',
    ctaButton: c.ctaText || c.ctaType || '',
    ctaLine: ctaLine.trim(),
    offer,
    proofElements: (body.match(/[\d,.]+\+?\s*(reviews|stars|customers|five-star|5-star)/gi) || []).slice(0, 5),
    bigIdea: firstLine(rest) || hook,
    mechanism: '',
    targetCustomer: '',
    tone: '',
    heuristic: true,
  };
}

export async function decompose(ctx) {
  const { cfg } = ctx;
  const creatives = ctx.read('creatives.json', []);
  const claude = makeClaude(ctx);
  const out = {};
  let n = 0;

  await pool(creatives, cfg.concurrency.claude, async (c) => {
    const key = sha([PROMPT_VERSION, cfg.models.extract, cfg.decompose.vision, c.id, c.body, c.title, c.image, c.transcript]);
    try {
      out[c.id] = await ctx.cached('decompose', key, async () => {
        const img = cfg.decompose.vision && !ctx.offline ? await claude.imageBlock(c.image) : null;
        const content = [
          ...(img ? [img, { type: 'text', text: 'Above: the ad image or the first frame of the video.' }] : []),
          { type: 'text', text: adText(c) },
        ];
        return claude.structured({ system: SYSTEM, content, schema: Components, maxTokens: 2500, mock: () => heuristicComponents(c) });
      });
    } catch (e) {
      log(`decompose: ${c.brand} ${c.id} failed (${e.message}); using text heuristics`);
      out[c.id] = heuristicComponents(c);
    }
    if (++n % 50 === 0) log(`decompose: ${n}/${creatives.length}`);
  });

  ctx.write('components.json', out);
  return { creatives: creatives.length };
}
