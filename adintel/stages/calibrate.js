/**
 * Stage 8 — close the loop. After the launch list has spent real money,
 * export results from Ads Manager and feed them back:
 *
 *   node cli.js calibrate --results path/to/export.csv
 *
 * Columns (case-insensitive): ad_name, impressions, clicks, purchases, spend.
 * Rows whose ad_name matches a remix concept use its stored scores. Rows
 * with a `hook` column (any of your past ads) are graded by Jev on the spot.
 *
 * For every hook-rubric line, and for Jev vs the persona panel, it measures
 * how well the score ranked your real results (Spearman), and moves the
 * weights toward the lines that predicted money. Learned weights go to
 * config.calibrated.json, which overrides config.json on every later run.
 * With few ads the move is small; it grows with sample size.
 */
import fs from 'node:fs';
import path from 'node:path';
import { makeJev } from '../lib/jev.js';
import { parseCsv, log, round, mean } from '../lib/util.js';

function ranks(xs) {
  const idx = xs.map((x, i) => [x, i]).sort((a, b) => a[0] - b[0]);
  const r = new Array(xs.length);
  for (let i = 0; i < idx.length; ) {
    let j = i;
    while (j + 1 < idx.length && idx[j + 1][0] === idx[i][0]) j++;
    for (let k = i; k <= j; k++) r[idx[k][1]] = (i + j) / 2;
    i = j + 1;
  }
  return r;
}

export function spearman(a, b) {
  const pairs = a.map((x, i) => [x, b[i]]).filter(([x, y]) => Number.isFinite(x) && Number.isFinite(y));
  if (pairs.length < 3) return null;
  const ra = ranks(pairs.map((p) => p[0]));
  const rb = ranks(pairs.map((p) => p[1]));
  const ma = mean(ra);
  const mb = mean(rb);
  let num = 0;
  let da = 0;
  let db = 0;
  for (let i = 0; i < ra.length; i++) {
    num += (ra[i] - ma) * (rb[i] - mb);
    da += (ra[i] - ma) ** 2;
    db += (rb[i] - mb) ** 2;
  }
  return da && db ? num / Math.sqrt(da * db) : 0;
}

/** Move weights toward the criteria with positive correlation, by `alpha`. */
export function reweight(old, correlations, alpha) {
  const total = Object.values(old).reduce((a, b) => a + b, 0);
  const pos = Object.fromEntries(Object.keys(old).map((k) => [k, Math.max(0, correlations[k] ?? 0)]));
  const posTotal = Object.values(pos).reduce((a, b) => a + b, 0);
  if (!posTotal) return old;
  return Object.fromEntries(
    Object.keys(old).map((k) => [k, round((1 - alpha) * old[k] + alpha * (pos[k] / posTotal) * total, 3)]),
  );
}

export async function calibrateStage(ctx) {
  const { cfg } = ctx;
  const file = ctx.flags.results;
  if (!file) throw new Error('Pass --results <csv exported from Ads Manager>.');
  const rows = parseCsv(fs.readFileSync(path.resolve(file), 'utf8')).map((r) =>
    Object.fromEntries(Object.entries(r).map(([k, v]) => [k.toLowerCase().trim().replace(/\s+/g, '_'), v])),
  );
  const remix = ctx.read('remix.json', { concepts: [] });
  const concepts = new Map(remix.concepts.map((c) => [c.id, c]));
  const jev = makeJev(ctx);

  const samples = [];
  for (const r of rows) {
    const impressions = Number(r.impressions) || 0;
    if (impressions < cfg.calibrate.minImpressions) continue;
    const clicks = Number(r.clicks || r.link_clicks) || 0;
    const purchases = Number(r.purchases || r.results || r.conversions) || 0;
    const concept = concepts.get(r.ad_name);
    let hookRubric = concept?.jev?.hook;
    if (!hookRubric && r.hook) hookRubric = await jev.rubric('hook', { audience: cfg.brand.icp, hook: r.hook });
    if (!hookRubric) continue;
    samples.push({
      name: r.ad_name || r.hook,
      ctr: clicks / impressions,
      cvr: purchases / impressions,
      purchases,
      criteria: Object.fromEntries(Object.entries(hookRubric.criteria).map(([k, c]) => [k, c.value])),
      jev: concept?.scores?.jev ?? hookRubric.composite,
      persona: concept?.scores?.persona ?? null,
    });
  }
  if (samples.length < cfg.calibrate.minAds) {
    throw new Error(`Only ${samples.length} usable ads (need ${cfg.calibrate.minAds} with ≥${cfg.calibrate.minImpressions} impressions).`);
  }

  const totalPurchases = samples.reduce((s, x) => s + x.purchases, 0);
  const target = totalPurchases >= cfg.calibrate.minPurchasesForCvr ? 'cvr' : 'ctr';
  const y = samples.map((s) => s[target]);
  const alpha = Math.min(cfg.calibrate.maxStep, samples.length / cfg.calibrate.fullTrustAt);

  const criteriaCorr = Object.fromEntries(
    Object.keys(cfg.rubricWeights.hook).map((k) => [k, spearman(samples.map((s) => s.criteria[k]), y)]),
  );
  const finalCorr = {
    jev: spearman(samples.map((s) => s.jev), y),
    persona: spearman(samples.map((s) => s.persona ?? NaN), y),
  };

  const hookWeights = reweight(cfg.rubricWeights.hook, criteriaCorr, alpha);
  const fw = cfg.final.weights;
  const moved = reweight({ jev: fw.jev, persona: fw.persona }, finalCorr, alpha);
  const calibrated = {
    calibratedAt: ctx.now.toISOString(),
    calibratedOn: { ads: samples.length, target, alpha: round(alpha) },
    rubricWeights: { hook: hookWeights },
    final: { weights: { ...fw, ...moved } },
  };
  fs.writeFileSync(ctx.calibratedPath, JSON.stringify(calibrated, null, 2));

  const report = { target, ads: samples.length, alpha: round(alpha), criteriaCorrelation: criteriaCorr, finalCorrelation: finalCorr, before: { hook: cfg.rubricWeights.hook, final: fw }, after: calibrated };
  ctx.write('calibration.json', report);
  log(`calibrate: ${samples.length} ads, target ${target}, step ${round(alpha)} → ${ctx.calibratedPath}`);
  return report;
}
