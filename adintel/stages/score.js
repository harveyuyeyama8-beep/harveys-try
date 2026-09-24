/**
 * Stage 4 — Jev grades and labels everything. Cheap, calibrated, weighted.
 *
 * Per creative:  ad type, hook archetype, angle, funnel stage, awareness
 *                level, offer type (choice) + Meta policy risk (yes/no)
 * Per component: hook, primary text, headline, CTA on their rubrics
 * Per landing:   page type + the advertorial rubric
 *
 * Every call is cached by content hash, so the same hook seen on 40 ads is
 * graded once, and a re-run costs nothing.
 */
import { makeJev, noul } from '../lib/jev.js';
import { AD_TYPES, HOOK_ARCHETYPES, ANGLES, FUNNEL, AWARENESS, OFFER_TYPES, LANDING_TYPES } from '../lib/taxonomy.js';
import { log, pool, truncate } from '../lib/util.js';

export const LABEL_SETS = {
  adType: { q: 'What type of ad is this? Judge the creative execution, not the product.', labels: AD_TYPES },
  hookArchetype: { q: 'Which archetype best describes how this ad opens (its hook)?', labels: HOOK_ARCHETYPES },
  angle: { q: 'What is the main selling angle of this ad?', labels: ANGLES },
  funnel: { q: 'Which funnel stage is this ad built for?', labels: FUNNEL },
  awareness: { q: 'Which buyer awareness level is this ad written for?', labels: AWARENESS },
  offerType: { q: 'What offer does this ad make?', labels: OFFER_TYPES },
};

export function adState(cfg, c, k) {
  return {
    category: cfg.brand.category,
    ad: {
      brand: c.brand,
      format: c.displayFormat,
      hook: k.hook,
      firstFrame: k.visualHook,
      textOnImage: k.onImageText,
      primaryText: truncate(c.body, 1500),
      headline: k.headline || c.title,
      button: k.ctaButton || c.ctaText,
      ctaLine: k.ctaLine,
      offer: k.offer,
      proof: k.proofElements,
      landsOn: c.landingKey,
    },
  };
}

export const hookState = (cfg, k, format) => ({
  audience: cfg.brand.icp,
  format,
  firstFrame: k.visualHook,
  textOnImage: k.onImageText,
  hook: k.hook,
});

export async function scoreStage(ctx) {
  const { cfg } = ctx;
  const jev = makeJev(ctx);
  const creatives = ctx.read('creatives.json', []);
  const components = ctx.read('components.json', {});
  const landings = ctx.read('landings.json', {});
  const facts = cfg.brand.facts;
  const out = { creatives: {}, landings: {} };
  let n = 0;

  await pool(creatives, cfg.concurrency.jev, async (c) => {
    const k = components[c.id];
    if (!k) return;
    const state = adState(cfg, c, k);
    const [labels, flags, hook, body, headline, cta, transfer] = await Promise.all([
      jev.classify(state, LABEL_SETS, 'classify'),
      jev.probs(
        state,
        {
          policyRisk: noul('Would Meta ad review likely reject or restrict this ad (health or medical claims, personal-attribute call-outs, before/after body claims, misleading claims)?'),
          ugcLooking: noul('Does this ad look like it was made by a customer or creator rather than the brand?'),
        },
        'flags',
      ),
      k.hook ? jev.rubric('hook', hookState(cfg, k, c.displayFormat)) : null,
      (k.primaryTextBody || c.body || '').length >= 40
        ? jev.rubric('body', { audience: cfg.brand.icp, primaryText: truncate(c.body, 2500) })
        : null,
      k.headline || c.title ? jev.rubric('headline', { audience: cfg.brand.icp, hook: k.hook, headline: k.headline || c.title }) : null,
      k.ctaButton || k.ctaLine || c.ctaText
        ? jev.rubric('cta', { hook: k.hook, offer: k.offer, ctaLine: k.ctaLine, button: k.ctaButton || c.ctaText })
        : null,
      k.hook
        ? jev.probs(
            { ourBrand: { name: cfg.brand.name, facts }, competitorHook: k.hook },
            { transferable: `Could ${cfg.brand.name} truthfully run an ad built on this hook's structure, using only the facts listed about ${cfg.brand.name}?` },
            'transfer',
          )
        : null,
    ]);
    out.creatives[c.id] = {
      labels,
      policyRisk: flags.policyRisk,
      ugcLooking: flags.ugcLooking,
      hook,
      body,
      headline,
      cta,
      transferable: transfer?.transferable ?? null,
    };
    if (++n % 100 === 0) log(`score: ${n}/${creatives.length}`);
  });

  const pages = Object.values(landings).filter((l) => !l.error && l.text);
  await pool(pages, cfg.concurrency.jev, async (l) => {
    const state = {
      title: l.title,
      h1: l.h1,
      headings: l.headings,
      buttons: l.ctas,
      signals: l.signals,
      words: l.words,
      text: truncate(l.text, 6000),
    };
    const [labels, rubric] = await Promise.all([
      jev.classify(state, { landingType: { q: 'What kind of page is this?', labels: LANDING_TYPES } }, 'landing-type'),
      jev.rubric('advertorial', state),
    ]);
    out.landings[l.key] = { landingType: labels.landingType, advertorial: rubric };
  });

  ctx.write('scores.json', out);
  log(`score: graded ${Object.keys(out.creatives).length} creatives and ${Object.keys(out.landings).length} landing pages`);
  return { creatives: Object.keys(out.creatives).length, landings: Object.keys(out.landings).length };
}
