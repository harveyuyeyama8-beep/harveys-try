/**
 * One object every stage receives: config, paths, the spend ledger, and
 * JSON read/write helpers for the data directory. Nothing here talks to a
 * network.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { log, round } from './util.js';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function deepMerge(a, b) {
  if (Array.isArray(b) || b === null || typeof b !== 'object') return b;
  const out = { ...(a || {}) };
  for (const [k, v] of Object.entries(b)) out[k] = deepMerge(out[k], v);
  return out;
}

export function loadContext(flags = {}) {
  const envFile = path.join(ROOT, '.env');
  if (fs.existsSync(envFile)) process.loadEnvFile(envFile);

  const dataDir = path.resolve(flags.data || process.env.ADINTEL_DATA || path.join(ROOT, 'data'));
  const configPath = path.resolve(flags.config || path.join(ROOT, 'config.json'));
  let cfg = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  // calibrate writes learned weights here; they override config.json. Demo
  // runs keep theirs in the demo data dir so they never touch the real one.
  const calibratedPath = flags.demo ? path.join(dataDir, 'config.calibrated.json') : path.join(ROOT, 'config.calibrated.json');
  if (fs.existsSync(calibratedPath)) cfg = deepMerge(cfg, JSON.parse(fs.readFileSync(calibratedPath, 'utf8')));
  if (flags['max-usd']) cfg.budget.maxUsd = Number(flags['max-usd']);

  const outDir = path.resolve(flags.out || path.join(ROOT, 'out'));
  for (const d of [dataDir, outDir, path.join(dataDir, 'cache'), path.join(dataDir, 'raw'), path.join(dataDir, 'import')]) {
    fs.mkdirSync(d, { recursive: true });
  }

  const offline = Boolean(flags.offline || flags.demo || process.env.ADINTEL_OFFLINE === '1');
  if (offline) log('OFFLINE mode: Claude and Jev are replaced by local heuristics. Scores are placeholders, not judgments.');

  const ledger = {
    anthropic: { calls: 0, input: 0, output: 0, cacheRead: 0, cacheWrite: 0, usd: 0 },
    jev: { calls: 0, input: 0, output: 0, usd: 0 },
    apify: { runs: 0, items: 0, usd: 0 },
  };

  const ctx = {
    cfg,
    flags,
    offline,
    demo: Boolean(flags.demo),
    root: ROOT,
    calibratedPath,
    dataDir,
    outDir,
    ledger,
    now: flags.now ? new Date(flags.now) : new Date(),
    // Transport overrides for the SDK clients (tests inject stub fetches here).
    clientOptions: {},

    file: (name) => path.join(dataDir, name),
    read(name, fallback = null) {
      const p = path.join(dataDir, name);
      return fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, 'utf8')) : fallback;
    },
    write(name, value) {
      const p = path.join(dataDir, name);
      fs.mkdirSync(path.dirname(p), { recursive: true });
      fs.writeFileSync(p, JSON.stringify(value, null, 2));
      return p;
    },
    writeOut(name, text) {
      const p = path.join(outDir, name);
      fs.writeFileSync(p, text);
      return p;
    },

    /** Content-addressed cache: re-running a stage never pays twice for the same question. */
    async cached(ns, key, fn) {
      const dir = path.join(dataDir, 'cache', ns);
      const p = path.join(dir, `${key}.json`);
      if (!flags.fresh && fs.existsSync(p)) return JSON.parse(fs.readFileSync(p, 'utf8'));
      const value = await fn();
      if (value !== undefined) {
        fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(p, JSON.stringify(value));
      }
      return value;
    },

    spent: () => ledger.anthropic.usd + ledger.jev.usd + ledger.apify.usd,
    assertBudget() {
      const s = ctx.spent();
      if (s > cfg.budget.maxUsd) {
        throw new Error(`Budget stop: spent $${s.toFixed(2)} of $${cfg.budget.maxUsd}. Raise budget.maxUsd or pass --max-usd.`);
      }
    },
    spendSummary() {
      return {
        totalUsd: round(ctx.spent(), 4),
        anthropic: { ...ledger.anthropic, usd: round(ledger.anthropic.usd, 4) },
        jev: { ...ledger.jev, usd: round(ledger.jev.usd, 4) },
        apify: { ...ledger.apify, usd: round(ledger.apify.usd, 4) },
      };
    },
  };
  return ctx;
}
