/**
 * Market proof — what the competitor's own wallet says about a creative.
 * Free to compute, and the most honest signal in the pipeline: nobody keeps
 * paying for an ad for 60 days, or duplicates it across 15 ad sets, unless
 * it is making them money.
 *
 *   longevity  days live, log-scaled, capped at proof.longevityCapDays
 *   scale      ad IDs sharing the creative (1 → 0), capped at proof.variantsCap
 *   live       still running today (1), ran long then stopped (0.5), else 0
 *
 * Big brands run everything longer, so the score blends the absolute value
 * with the creative's percentile inside its own brand.
 */
import { clamp01, weighted, percentileRank } from './util.js';

export function computeProof(cfg, creatives) {
  const P = cfg.proof;
  const raw = new Map();
  for (const c of creatives) {
    const longevity = c.days == null ? 0 : clamp01(Math.log1p(c.days) / Math.log1p(P.longevityCapDays));
    const scale = clamp01(Math.log(Math.max(1, c.variants)) / Math.log(P.variantsCap));
    const live = c.active ? 1 : (c.days ?? 0) >= P.winnerMinDays ? 0.5 : 0;
    raw.set(c.id, { longevity, scale, live, absolute: weighted({ longevity, scale, live }, P.weights) });
  }
  const byBrand = {};
  for (const c of creatives) (byBrand[c.brand] ||= []).push(raw.get(c.id).absolute);

  const out = {};
  for (const c of creatives) {
    const r = raw.get(c.id);
    const withinBrand = percentileRank(r.absolute, byBrand[c.brand]);
    out[c.id] = {
      ...r,
      withinBrand,
      proof: (1 - P.brandRelativeMix) * r.absolute + P.brandRelativeMix * withinBrand,
      winner: (c.active && (c.days ?? 0) >= P.winnerMinDays) || c.variants >= P.winnerMinVariants,
    };
  }
  return out;
}
