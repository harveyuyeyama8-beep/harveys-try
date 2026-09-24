/**
 * Stage 6 — everything, best to worst.
 *
 * Final score = weighted(proof, jev, persona) with config.final.weights,
 * renormalised over whichever signals an item has (a hook outside the
 * persona top-K is ranked on proof + Jev alone).
 *
 * Also builds:
 *   breakdown  % of each brand's ads by type, archetype, angle, funnel,
 *              awareness, offer, format, landing type, CTA — all ads and
 *              winners only
 *   patterns   which labels over-perform: avg proof vs the market (lift)
 *   gaps       labels that over-perform but almost nobody uses
 */
import { computeProof } from '../lib/proof.js';
import { log, weighted, mean, normText, round, countBy } from '../lib/util.js';

const DIMENSIONS = ['adType', 'hookArchetype', 'angle', 'funnel', 'awareness', 'offerType', 'format', 'landingType', 'ctaButton'];

const mode = (xs) => {
  const c = countBy(xs.filter(Boolean), (x) => x);
  return Object.keys(c).sort((a, b) => c[b] - c[a])[0] ?? null;
};
const maxOf = (xs) => (xs.length ? Math.max(...xs) : null);
const avg = (xs) => {
  const v = xs.filter((x) => x != null && Number.isFinite(x));
  return v.length ? mean(v) : null;
};
const criteriaMeans = (list) => {
  const out = {};
  for (const r of list.filter(Boolean)) for (const [k, c] of Object.entries(r.criteria)) (out[k] ||= []).push(c.value);
  return Object.fromEntries(Object.entries(out).map(([k, v]) => [k, round(mean(v))]));
};
const ctaLabel = (s) => String(s || '').replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, (m) => m.toUpperCase()).trim() || null;

/** Group rows by a text key and roll them up. */
function rollup(rows, keyFn, build) {
  const groups = new Map();
  for (const r of rows) {
    const text = keyFn(r);
    if (!text) continue;
    const k = normText(text);
    if (!groups.has(k)) groups.set(k, { text, rows: [] });
    groups.get(k).rows.push(r);
  }
  return [...groups.values()].map(({ text, rows: g }) => build(text, g));
}

const byFinal = (a, b) => (b.final ?? -1) - (a.final ?? -1);

export function rankStage(ctx) {
  const { cfg } = ctx;
  const W = cfg.final.weights;
  const creatives = ctx.read('creatives.json', []);
  const components = ctx.read('components.json', {});
  const scores = ctx.read('scores.json', { creatives: {}, landings: {} });
  const personas = ctx.read('persona_results.json', { byCreative: {} });
  const landings = ctx.read('landings.json', {});
  const proof = computeProof(cfg, creatives);

  // One flat row per creative with every signal on it.
  const rows = creatives
    .filter((c) => components[c.id] && scores.creatives[c.id])
    .map((c) => {
      const k = components[c.id];
      const s = scores.creatives[c.id];
      const pr = proof[c.id];
      const pe = personas.byCreative[c.id] || null;
      const landing = scores.landings[c.landingKey];
      const labels = Object.fromEntries(Object.entries(s.labels).map(([d, v]) => [d, v.label]));
      return {
        id: c.id,
        brand: c.brand,
        c,
        k,
        s,
        proof: pr.proof,
        winner: pr.winner,
        persona: pe,
        labels: {
          ...labels,
          format: c.displayFormat,
          landingType: landing?.landingType?.label ?? null,
          ctaButton: ctaLabel(k.ctaButton || c.ctaText || c.ctaType),
        },
        final: weighted({ proof: pr.proof, jev: s.hook?.composite, persona: pe?.score }, W),
      };
    });
  log(`rank: ${rows.length} creatives with full signals`);

  const common = (g) => ({
    brands: [...new Set(g.map((r) => r.brand))],
    creatives: g.length,
    adIds: g.reduce((n, r) => n + r.c.adIds.length, 0),
    winners: g.filter((r) => r.winner).length,
    longestDays: maxOf(g.map((r) => r.c.days ?? 0)),
    active: g.some((r) => r.c.active),
    proof: round(maxOf(g.map((r) => r.proof))),
    example: [...g].sort((a, b) => b.proof - a.proof)[0].id,
    snapshot: [...g].sort((a, b) => b.proof - a.proof)[0].c.snapshotUrl,
  });

  const hooks = rollup(rows, (r) => r.k.hook, (text, g) => {
    const lead = [...g].sort((a, b) => b.proof - a.proof)[0];
    const pe = g.map((r) => r.persona).find(Boolean) || null;
    const jev = avg(g.map((r) => r.s.hook?.composite));
    const base = common(g);
    return {
      hook: text,
      ...base,
      archetype: mode(g.map((r) => r.labels.hookArchetype)),
      adType: mode(g.map((r) => r.labels.adType)),
      visual: lead.k.visualHook,
      onImageText: lead.k.onImageText,
      jev: round(jev),
      criteria: criteriaMeans(g.map((r) => r.s.hook)),
      transferable: round(avg(g.map((r) => r.s.transferable))),
      policyRisk: round(avg(g.map((r) => r.s.policyRisk))),
      persona: pe && {
        score: round(pe.score),
        ev: round(pe.ev, 5),
        stop: round(pe.stop),
        click: round(pe.click),
        buy: round(pe.buy),
        polarization: round(pe.polarization),
        bestFor: pe.bestFor,
        worstFor: pe.worstFor,
        itemId: pe.itemId,
      },
      final: round(weighted({ proof: base.proof, jev, persona: pe?.score }, W)),
    };
  }).sort(byFinal);

  const pj = { proof: W.proof, jev: W.jev };
  const bodies = rollup(rows.filter((r) => (r.c.body || '').length >= 40), (r) => r.c.body, (text, g) => {
    const jev = avg(g.map((r) => r.s.body?.composite));
    const base = common(g);
    return {
      text,
      words: text.split(/\s+/).length,
      ...base,
      angle: mode(g.map((r) => r.labels.angle)),
      jev: round(jev),
      criteria: criteriaMeans(g.map((r) => r.s.body)),
      final: round(weighted({ proof: base.proof, jev }, pj)),
    };
  }).sort(byFinal);

  const headlines = rollup(rows, (r) => r.k.headline || r.c.title, (text, g) => {
    const jev = avg(g.map((r) => r.s.headline?.composite));
    const base = common(g);
    return { headline: text, ...base, jev: round(jev), criteria: criteriaMeans(g.map((r) => r.s.headline)), final: round(weighted({ proof: base.proof, jev }, pj)) };
  }).sort(byFinal);

  const ctaLines = rollup(rows, (r) => r.k.ctaLine, (text, g) => {
    const jev = avg(g.map((r) => r.s.cta?.composite));
    const base = common(g);
    return {
      ctaLine: text,
      button: mode(g.map((r) => r.labels.ctaButton)),
      offer: mode(g.map((r) => r.k.offer)),
      ...base,
      jev: round(jev),
      criteria: criteriaMeans(g.map((r) => r.s.cta)),
      final: round(weighted({ proof: base.proof, jev }, pj)),
    };
  }).sort(byFinal);

  const marketProof = mean(rows.map((r) => r.proof)) || 1e-9;
  const buttons = rollup(rows, (r) => r.labels.ctaButton, (text, g) => ({
    button: text,
    share: round(g.length / rows.length),
    winnerRate: round(g.filter((r) => r.winner).length / g.length),
    lift: round(mean(g.map((r) => r.proof)) / marketProof),
    jev: round(avg(g.map((r) => r.s.cta?.composite))),
    ...common(g),
  })).sort((a, b) => b.lift - a.lift);

  const offers = rollup(rows.filter((r) => r.k.offer), (r) => r.k.offer, (text, g) => ({
    offer: text,
    offerType: mode(g.map((r) => r.labels.offerType)),
    winnerRate: round(g.filter((r) => r.winner).length / g.length),
    lift: round(mean(g.map((r) => r.proof)) / marketProof),
    ...common(g),
  })).sort((a, b) => b.proof - a.proof);

  const advertorials = Object.values(landings)
    .filter((l) => scores.landings[l.key])
    .map((l) => {
      const s = scores.landings[l.key];
      const pointing = rows.filter((r) => r.c.landingKey === l.key);
      const proofMax = maxOf(pointing.map((r) => r.proof)) ?? 0;
      const jev = s.advertorial.composite;
      return {
        url: l.finalUrl || l.url,
        key: l.key,
        brands: l.brands,
        landingType: s.landingType.label,
        title: l.title,
        h1: l.h1,
        headings: (l.headings || []).slice(0, 12),
        ctas: (l.ctas || []).slice(0, 6),
        words: l.words,
        creativesPointing: pointing.length,
        winnersPointing: pointing.filter((r) => r.winner).length,
        proof: round(proofMax),
        jev: round(jev),
        criteria: Object.fromEntries(Object.entries(s.advertorial.criteria).map(([k, c]) => [k, round(c.value)])),
        final: round(weighted({ proof: proofMax, jev }, pj)),
      };
    })
    .sort(byFinal);

  // % breakdown by brand and for the whole market; all ads and winners only.
  const dist = (g, d) => {
    const c = countBy(g, (r) => r.labels[d] ?? 'unknown');
    return Object.fromEntries(Object.entries(c).sort((a, b) => b[1] - a[1]).map(([k, n]) => [k, round(n / g.length)]));
  };
  const breakdownOf = (g) => Object.fromEntries(DIMENSIONS.map((d) => [d, dist(g, d)]));
  const brands = [...new Set(rows.map((r) => r.brand))];
  const breakdown = {
    market: { creatives: rows.length, winners: rows.filter((r) => r.winner).length, all: breakdownOf(rows), winnersOnly: breakdownOf(rows.filter((r) => r.winner)) },
    brands: brands
      .map((b) => {
        const g = rows.filter((r) => r.brand === b);
        const w = g.filter((r) => r.winner);
        return {
          brand: b,
          creatives: g.length,
          adIds: g.reduce((n, r) => n + r.c.adIds.length, 0),
          active: g.filter((r) => r.c.active).length,
          winners: w.length,
          avgDays: round(mean(g.map((r) => r.c.days ?? 0)), 1),
          topHook: [...g].sort((a, b) => b.final - a.final)[0]?.k.hook ?? null,
          all: breakdownOf(g),
          winnersOnly: w.length ? breakdownOf(w) : null,
        };
      })
      .sort((a, b) => b.active - a.active || b.creatives - a.creatives),
  };

  const patterns = [];
  for (const d of DIMENSIONS) {
    const groups = {};
    for (const r of rows) (groups[r.labels[d] ?? 'unknown'] ||= []).push(r);
    for (const [label, g] of Object.entries(groups)) {
      if (g.length < cfg.rank.minPatternSize) continue;
      patterns.push({
        dimension: d,
        label,
        creatives: g.length,
        brands: new Set(g.map((r) => r.brand)).size,
        share: round(g.length / rows.length),
        winnerRate: round(g.filter((r) => r.winner).length / g.length),
        avgProof: round(mean(g.map((r) => r.proof))),
        lift: round(mean(g.map((r) => r.proof)) / marketProof),
        avgJev: round(avg(g.map((r) => r.s.hook?.composite))),
      });
    }
  }
  patterns.sort((a, b) => b.lift - a.lift);
  const gaps = patterns.filter((p) => p.lift >= cfg.rank.gapMinLift && p.share <= cfg.rank.gapMaxShare && p.label !== 'unknown' && p.label !== 'other');

  const creativesRanked = rows
    .map((r) => ({
      id: r.id,
      brand: r.brand,
      hook: r.k.hook,
      headline: r.k.headline || r.c.title,
      labels: r.labels,
      days: r.c.days,
      active: r.c.active,
      variants: r.c.variants,
      winner: r.winner,
      proof: round(r.proof),
      jevHook: round(r.s.hook?.composite),
      jevBody: round(r.s.body?.composite),
      persona: round(r.persona?.score),
      final: round(r.final),
      snapshot: r.c.snapshotUrl,
      image: r.c.image,
      linkUrl: r.c.linkUrl,
    }))
    .sort(byFinal);

  const rankings = {
    generatedAt: ctx.now.toISOString(),
    weights: W,
    counts: { creatives: rows.length, brands: brands.length, winners: rows.filter((r) => r.winner).length, landings: advertorials.length },
    hooks,
    bodies,
    headlines,
    ctaLines,
    buttons,
    offers,
    advertorials,
    breakdown,
    patterns,
    gaps,
    creatives: creativesRanked,
  };
  ctx.write('rankings.json', rankings);
  return rankings.counts;
}
