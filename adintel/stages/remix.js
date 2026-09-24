/**
 * Stage 7 — turn what's working for them into ads for us.
 *
 * The strategist model gets the ranked hooks, bodies, CTAs, advertorials,
 * the over-performing patterns and the white-space gaps, the panel's most
 * common objections, the brand's facts and its live advertorials — and
 * writes new concepts. It borrows structures, never sentences: every
 * concept names the pattern it came from.
 *
 * Each concept then goes through the same Jev rubrics and the same
 * 15-persona panel as the competitor hooks, and comes out as a ranked
 * launch list (out/launch.csv) ready for Ads Manager.
 */
import fs from 'node:fs';
import path from 'node:path';
import { z } from 'zod';
import { makeClaude } from '../lib/claude.js';
import { makeJev } from '../lib/jev.js';
import { runPanel } from './personas.js';
import { AD_TYPES, HOOK_ARCHETYPES, ANGLES } from '../lib/taxonomy.js';
import { log, pool, round, weighted, truncate, toCsv, countBy } from '../lib/util.js';

const CTA_BUTTONS = ['SHOP_NOW', 'LEARN_MORE', 'ORDER_NOW', 'GET_OFFER', 'SIGN_UP', 'SUBSCRIBE', 'SEE_MORE', 'TRY_IT'];

// Labels are plain strings with the allowed values in the description, then
// snapped to the taxonomy in code: one off-list label should cost a label,
// not the whole batch of concepts.
const oneOf = (labels) => z.string().describe(`One of: ${labels.join(', ')}`);
const snap = (v, labels, fallback) => (labels.includes(v) ? v : fallback);

const Concepts = z.object({
  concepts: z.array(
    z.object({
      id: z.string().describe('Short slug, e.g. "c01-latte-math"'),
      name: z.string(),
      inspiredBy: z.array(z.string()).describe('IDs of the competitor hooks (H#) or patterns (P#) this concept borrows its structure from'),
      pattern: z.string().describe('The structure borrowed, in one line'),
      adType: oneOf(Object.keys(AD_TYPES)),
      hookArchetype: oneOf(Object.keys(HOOK_ARCHETYPES)),
      angle: oneOf(Object.keys(ANGLES)),
      funnel: oneOf(['tof', 'mof', 'bof']),
      hook: z.string().describe('The opening line / on-screen hook'),
      visual: z.string().describe('What the image or first 3 seconds show'),
      onImageText: z.string().describe('Text overlaid on the image or video. Empty if none.'),
      primaryText: z.string().describe('Full Meta primary text, hook first'),
      headline: z.string().describe('Meta headline under the creative, 40 characters or fewer'),
      description: z.string().describe('Meta link description, 30 characters or fewer'),
      ctaButton: oneOf(CTA_BUTTONS),
      landingSlug: z.string().describe('Which of our advertorial slugs this sends traffic to'),
      targetPersonas: z.array(z.string()).describe('Persona IDs this concept is aimed at'),
      rationale: z.string().describe('Why this should work, citing the data'),
    }),
  ),
});

function ourAdvertorials(ctx) {
  const dir = path.resolve(ctx.root, ctx.cfg.brand.advertorialsDir);
  if (!fs.existsSync(dir)) return ctx.cfg.brand.landingPages || [];
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith('.md'))
    .map((f) => {
      const fm = (fs.readFileSync(path.join(dir, f), 'utf8').split(/^---$/m)[1] || '');
      const field = (k) => (fm.match(new RegExp(`^${k}:\\s*["']?(.+?)["']?\\s*$`, 'm')) || [])[1] ?? null;
      return { slug: f.replace(/\.md$/, ''), headline: field('headline'), format: field('format') || 'article', primary: field('primary') === 'true', draft: field('draft') === 'true' };
    })
    .filter((a) => !a.draft);
}

function brief(ctx, rankings, panel) {
  const { cfg } = ctx;
  const N = cfg.remix.context;
  const topHooks = rankings.hooks.slice(0, N.hooks).map((h, i) => ({
    id: `H${i + 1}`,
    hook: h.hook,
    brand: h.brands.join(', '),
    archetype: h.archetype,
    adType: h.adType,
    visual: h.visual,
    winner: h.winners > 0,
    longestDays: h.longestDays,
    final: h.final,
    strongest: Object.entries(h.criteria).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([k]) => k),
    bestFor: h.persona?.bestFor,
  }));
  const patterns = rankings.patterns.slice(0, N.patterns).map((p, i) => ({ id: `P${i + 1}`, ...p }));
  const objections = Object.entries(countBy(Object.values(panel.matrix || {}), (m) => m.objection?.toLowerCase().trim() || null))
    .sort((a, b) => b[1] - a[1])
    .slice(0, 15)
    .map(([o, n]) => ({ objection: o, times: n }));
  return {
    brand: {
      name: cfg.brand.name,
      sells: cfg.brand.category,
      buyer: cfg.brand.icp,
      facts: cfg.brand.facts,
      offer: cfg.brand.offer,
      primaryCta: cfg.brand.cta,
      neverSay: cfg.brand.avoid,
    },
    ourAdvertorials: ourAdvertorials(ctx),
    personas: panel.personas,
    topCompetitorHooks: topHooks,
    topPrimaryText: rankings.bodies.slice(0, N.bodies).map((b) => ({ text: truncate(b.text, 900), brand: b.brands.join(', '), angle: b.angle, final: b.final })),
    topCtaLines: rankings.ctaLines.slice(0, N.ctas).map((c) => ({ line: c.ctaLine, button: c.button, final: c.final })),
    buttonsByLift: rankings.buttons.slice(0, 8).map(({ button, share, lift }) => ({ button, share, lift })),
    topAdvertorials: rankings.advertorials.slice(0, N.advertorials).map((a) => ({ type: a.landingType, h1: a.h1, headings: a.headings, brands: a.brands, final: a.final })),
    patternsByLift: patterns,
    whiteSpace: rankings.gaps.slice(0, 10),
    panelObjections: objections,
  };
}

const SYSTEM = `You are the head of creative strategy for a direct-to-consumer brand. You turn competitive ad intelligence into new ads that make money.

You are given what is working for competitors — ranked hooks, copy, CTAs, landing pages, the patterns that over-perform, and the white space nobody is using — plus a panel of buyer personas and their objections.

Write new ad concepts for our brand. Rules:
- Borrow structures, not sentences. Never reuse a competitor's wording; write original copy in our voice. Cite the hook (H#) or pattern (P#) each concept borrows from.
- Use only the facts listed for our brand. Do not invent reviews, numbers, press, awards, guarantees or claims. No health or medical claims.
- Spread the concepts across ad types, archetypes, angles and funnel stages, weighted toward what the data says works, with some deliberately aimed at the white space.
- Aim each concept at named personas and answer their objections.
- Send each concept to the one of our advertorials whose story it sets up.`;

export async function remixStage(ctx) {
  const { cfg } = ctx;
  const rankings = ctx.read('rankings.json');
  if (!rankings) throw new Error('Run rank first.');
  const panelData = ctx.read('persona_results.json', { matrix: {}, personas: [] });
  const claude = makeClaude(ctx);
  const jev = makeJev(ctx);
  const b = brief(ctx, rankings, panelData);
  const slugs = b.ourAdvertorials.map((a) => a.slug);

  const written = await claude.strategize({
    system: SYSTEM,
    content: `Write ${cfg.remix.count} concepts.\n\n<intel>\n${JSON.stringify(b, null, 2)}\n</intel>`,
    schema: Concepts,
    mock: () => mockConcepts(b, cfg.remix.count),
  });
  const seenIds = new Set();
  const concepts = written.concepts.map((c, i) => {
    let id = String(c.id || `c${i + 1}`).toLowerCase().replace(/[^a-z0-9-]+/g, '-').slice(0, 40);
    if (seenIds.has(id)) id = `${id}-${i + 1}`;
    seenIds.add(id);
    return {
      ...c,
      id,
      adType: snap(c.adType, Object.keys(AD_TYPES), 'other'),
      hookArchetype: snap(c.hookArchetype, Object.keys(HOOK_ARCHETYPES), 'other'),
      angle: snap(c.angle, Object.keys(ANGLES), 'other'),
      funnel: snap(String(c.funnel).toLowerCase(), ['tof', 'mof', 'bof'], 'tof'),
      ctaButton: snap(String(c.ctaButton).toUpperCase().replace(/\s+/g, '_'), CTA_BUTTONS, 'LEARN_MORE'),
    };
  });
  log(`remix: ${concepts.length} concepts written`);

  // Same grading as the competitors: Jev rubrics + the persona panel.
  const graded = await pool(concepts, cfg.concurrency.jev, async (c) => {
    const [hook, body, headline] = await Promise.all([
      jev.rubric('hook', { audience: cfg.brand.icp, format: c.adType, firstFrame: c.visual, textOnImage: c.onImageText, hook: c.hook }),
      jev.rubric('body', { audience: cfg.brand.icp, primaryText: c.primaryText }),
      jev.rubric('headline', { audience: cfg.brand.icp, hook: c.hook, headline: c.headline }),
    ]);
    const policy = await jev.probs(
      { ad: { hook: c.hook, text: c.primaryText, onImageText: c.onImageText } },
      { policyRisk: 'Would Meta ad review likely reject or restrict this ad (health or medical claims, personal-attribute call-outs, misleading claims)?' },
      'flags',
    );
    return { ...c, jev: { hook, body, headline }, policyRisk: policy.policyRisk };
  });

  const items = graded.map((c) => ({ id: c.id, brand: cfg.brand.name, hook: c.hook, visual: c.visual, onImageText: c.onImageText, headline: c.headline, offer: cfg.brand.offer, cta: c.ctaButton.replace(/_/g, ' ') }));
  const panel = await runPanel(ctx, items, 'remix-panel');

  const W = cfg.final.weights;
  const launch = graded
    .map((c) => {
      const pe = panel.byItem[c.id];
      const jevScore = weighted({ hook: c.jev.hook.composite, body: c.jev.body.composite, headline: c.jev.headline.composite }, cfg.remix.jevMix);
      const slug = slugs.includes(c.landingSlug) ? c.landingSlug : slugs[0];
      const url = new URL(`${cfg.brand.landing.replace(/\/$/, '')}/${slug}`);
      for (const [k, v] of Object.entries(cfg.remix.utm)) url.searchParams.set(k, v.replace('{id}', c.id));
      return {
        ...c,
        landingSlug: slug,
        landingUrl: url.toString(),
        scores: {
          jev: round(jevScore),
          hook: round(c.jev.hook.composite),
          body: round(c.jev.body.composite),
          headline: round(c.jev.headline.composite),
          persona: round(pe?.score),
          stop: round(pe?.stop),
          click: round(pe?.click),
          buy: round(pe?.buy),
          policyRisk: round(c.policyRisk),
        },
        bestFor: pe?.bestFor ?? [],
        final: round(weighted({ jev: jevScore, persona: pe?.score }, { jev: W.jev, persona: W.persona }) * (1 - cfg.remix.policyPenalty * c.policyRisk)),
      };
    })
    .sort((a, b2) => b2.final - a.final)
    .map((c, i) => ({ rank: i + 1, ...c }));

  ctx.write('remix.json', { concepts: launch, matrix: panel.matrix, brief: b });
  ctx.writeOut(
    'launch.csv',
    toCsv(
      launch.map((c) => ({
        rank: c.rank,
        ad_name: c.id,
        concept: c.name,
        ad_type: c.adType,
        archetype: c.hookArchetype,
        funnel: c.funnel,
        hook: c.hook,
        visual_direction: c.visual,
        on_image_text: c.onImageText,
        primary_text: c.primaryText,
        headline: c.headline,
        description: c.description,
        call_to_action: c.ctaButton,
        website_url: c.landingUrl,
        predicted_final: c.final,
        jev: c.scores.jev,
        persona: c.scores.persona,
        p_stop: c.scores.stop,
        p_click: c.scores.click,
        p_buy: c.scores.buy,
        policy_risk: c.scores.policyRisk,
        best_for: c.bestFor.join(' '),
        inspired_by: c.inspiredBy.join(' '),
        rationale: c.rationale,
      })),
    ),
  );
  return { concepts: launch.length };
}

function mockConcepts(b, count) {
  const hooks = b.topCompetitorHooks;
  const slugs = b.ourAdvertorials.map((a) => a.slug);
  return {
    concepts: Array.from({ length: Math.min(count, Math.max(hooks.length, 1)) }, (_, i) => {
      const h = hooks[i % Math.max(hooks.length, 1)] || { id: 'H1', archetype: 'other', adType: 'other' };
      return {
        id: `c${String(i + 1).padStart(2, '0')}-offline`,
        name: `[offline placeholder] ${h.archetype} concept`,
        inspiredBy: [h.id],
        pattern: `${h.archetype} / ${h.adType}`,
        adType: h.adType in AD_TYPES ? h.adType : 'other',
        hookArchetype: h.archetype in HOOK_ARCHETYPES ? h.archetype : 'other',
        angle: 'freshness',
        funnel: 'tof',
        hook: `[offline placeholder — run with an Anthropic key for real copy] ${b.brand.facts[i % b.brand.facts.length]}`,
        visual: '',
        onImageText: '',
        primaryText: b.brand.facts.slice(0, 3).join(' '),
        headline: b.brand.offer,
        description: '',
        ctaButton: 'LEARN_MORE',
        landingSlug: slugs[i % Math.max(slugs.length, 1)] || '',
        targetPersonas: [],
        rationale: 'Offline placeholder so the launch list and report can be exercised without API keys.',
      };
    }),
  };
}
