/**
 * Bring your own ads: drop .json, .jsonl or .csv files into data/import/
 * (or pass --import <path>). Apify dumps, Meta API dumps and generic sheets
 * are detected per row — see normalize.js for the column names it accepts.
 */
import fs from 'node:fs';
import path from 'node:path';
import { detect } from './normalize.js';
import { parseCsv, log } from '../lib/util.js';

function rowsFrom(file) {
  const text = fs.readFileSync(file, 'utf8');
  if (file.endsWith('.csv')) return parseCsv(text);
  if (file.endsWith('.jsonl')) return text.split('\n').filter(Boolean).map((l) => JSON.parse(l));
  const json = JSON.parse(text);
  if (Array.isArray(json)) return json;
  return json.ads || json.data || json.items || [json];
}

export function importAds(ctx) {
  const target = ctx.flags.import ? path.resolve(ctx.flags.import) : ctx.file('import');
  const files = fs.statSync(target).isDirectory()
    ? fs.readdirSync(target).filter((f) => /\.(json|jsonl|csv)$/.test(f)).map((f) => path.join(target, f))
    : [target];
  const ads = [];
  for (const f of files) {
    const rows = rowsFrom(f);
    ads.push(...rows.map(detect));
    log(`import: ${rows.length} rows from ${path.basename(f)}`);
  }
  return ads;
}
