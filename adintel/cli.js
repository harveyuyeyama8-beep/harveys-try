#!/usr/bin/env node
/**
 * adintel — competitor ad intelligence for Harvey's Coffee.
 *
 *   node cli.js run                 discover → harvest → decompose → score → personas → rank → remix → report
 *   node cli.js run --from score    resume from a stage
 *   node cli.js <stage>             run one stage
 *   node cli.js run --demo          fixture data + offline heuristics, no keys needed
 *   node cli.js calibrate --results export.csv
 *
 * Flags: --offline  --demo  --import <file|dir>  --max-usd <n>  --fresh
 *        --config <path>  --data <dir>  --out <dir>  --skip remix,personas
 */
import fs from 'node:fs';
import path from 'node:path';
import { loadContext, ROOT } from './lib/context.js';
import { parseArgs, log } from './lib/util.js';
import { discover } from './stages/discover.js';
import { harvest } from './stages/harvest.js';
import { decompose } from './stages/decompose.js';
import { scoreStage } from './stages/score.js';
import { personasStage } from './stages/personas.js';
import { rankStage } from './stages/rank.js';
import { remixStage } from './stages/remix.js';
import { reportStage } from './stages/report.js';
import { calibrateStage } from './stages/calibrate.js';

const STAGES = {
  discover,
  harvest,
  decompose,
  score: scoreStage,
  personas: personasStage,
  rank: rankStage,
  remix: remixStage,
  report: reportStage,
};
const PIPELINE = Object.keys(STAGES);

function recordSpend(ctx) {
  const run = ctx.spendSummary();
  const prev = ctx.read('spend.json', { totalUsd: 0, anthropic: { usd: 0, calls: 0 }, jev: { usd: 0, calls: 0 }, apify: { usd: 0, runs: 0 }, runs: [] });
  const next = {
    totalUsd: prev.totalUsd + run.totalUsd,
    anthropic: { usd: prev.anthropic.usd + run.anthropic.usd, calls: prev.anthropic.calls + run.anthropic.calls },
    jev: { usd: prev.jev.usd + run.jev.usd, calls: prev.jev.calls + run.jev.calls },
    apify: { usd: prev.apify.usd + run.apify.usd, runs: prev.apify.runs + run.apify.runs },
    runs: [...prev.runs, { at: ctx.now.toISOString(), ...run }].slice(-50),
  };
  ctx.write('spend.json', next);
  return run;
}

async function main() {
  const flags = parseArgs(process.argv.slice(2));
  const cmd = flags._[0] || 'help';

  if (flags.demo) {
    flags.import ??= path.join(ROOT, 'fixtures', 'demo-ads.json');
    flags.data ??= path.join(ROOT, 'data-demo');
    flags.out ??= path.join(ROOT, 'out-demo');
    flags.now ??= '2026-09-24T00:00:00Z';
  }

  if (cmd === 'help' || flags.help) {
    const doc = fs.readFileSync(new URL(import.meta.url), 'utf8').match(/\/\*\*([\s\S]*?)\*\//)[1];
    console.log(doc.replace(/^ \* ?/gm, ''));
    return;
  }

  const ctx = loadContext(flags);
  let stages;
  if (cmd === 'run') {
    const from = flags.from ? PIPELINE.indexOf(flags.from) : 0;
    if (from < 0) throw new Error(`Unknown stage for --from: ${flags.from}`);
    const skip = new Set(String(flags.skip || '').split(',').filter(Boolean));
    stages = PIPELINE.slice(from).filter((s) => !skip.has(s));
  } else if (cmd === 'calibrate') {
    stages = ['calibrate'];
  } else if (STAGES[cmd]) {
    stages = [cmd];
  } else {
    throw new Error(`Unknown command "${cmd}". Try: node cli.js help`);
  }

  let recorded = false;
  try {
    for (const s of stages) {
      const t = Date.now();
      log(`▶ ${s}`);
      const fn = s === 'calibrate' ? calibrateStage : STAGES[s];
      if (s === 'report') {
        recordSpend(ctx);
        recorded = true;
      }
      const result = await fn(ctx);
      log(`✔ ${s} (${((Date.now() - t) / 1000).toFixed(1)}s) ${JSON.stringify(result ?? {})} · spent so far $${ctx.spent().toFixed(4)}`);
    }
  } finally {
    if (!recorded) recordSpend(ctx);
  }
  if (stages.includes('report')) log(`Report: ${path.join(ctx.outDir, 'report.html')}`);
  if (stages.includes('remix')) log(`Launch list: ${path.join(ctx.outDir, 'launch.csv')}`);
}

main().catch((e) => {
  log(`✖ ${e.message}`);
  if (process.env.DEBUG) console.error(e);
  process.exit(1);
});
