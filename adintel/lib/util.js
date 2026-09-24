import { createHash } from 'node:crypto';

export function stableStringify(v) {
  if (v === null || typeof v !== 'object') return JSON.stringify(v);
  if (Array.isArray(v)) return `[${v.map(stableStringify).join(',')}]`;
  const keys = Object.keys(v).filter((k) => v[k] !== undefined).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify(v[k])}`).join(',')}}`;
}

export const sha = (v) =>
  createHash('sha256')
    .update(typeof v === 'string' ? v : stableStringify(v))
    .digest('hex')
    .slice(0, 16);

export const log = (...a) => console.error('[adintel]', ...a);

/** Run `fn` over `items` with at most `limit` in flight. Preserves order. */
export async function pool(items, limit, fn) {
  const out = new Array(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i], i);
    }
  };
  await Promise.all(Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, worker));
  return out;
}

/** A semaphore: `const limit = limiter(4); await limit(() => work())`. */
export function limiter(n) {
  let active = 0;
  const queue = [];
  const next = () => {
    if (active >= n || !queue.length) return;
    active++;
    const { fn, resolve, reject } = queue.shift();
    Promise.resolve()
      .then(fn)
      .then(resolve, reject)
      .finally(() => {
        active--;
        next();
      });
  };
  return (fn) =>
    new Promise((resolve, reject) => {
      queue.push({ fn, resolve, reject });
      next();
    });
}

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
export const clamp01 = (x) => Math.max(0, Math.min(1, x));
export const mean = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
export function std(xs) {
  if (xs.length < 2) return 0;
  const m = mean(xs);
  return Math.sqrt(mean(xs.map((x) => (x - m) ** 2)));
}
export const round = (x, d = 3) => (Number.isFinite(x) ? Math.round(x * 10 ** d) / 10 ** d : null);

/** Weighted mean over the keys present in both `values` and `weights`. */
export function weighted(values, weights) {
  let num = 0;
  let den = 0;
  for (const [k, w] of Object.entries(weights)) {
    if (values[k] == null || !Number.isFinite(values[k])) continue;
    num += values[k] * w;
    den += w;
  }
  return den ? num / den : null;
}

/** Fraction of `xs` strictly below x, plus half the ties. 0..1. */
export function percentileRank(x, xs) {
  if (!xs.length) return 0.5;
  let below = 0;
  let equal = 0;
  for (const v of xs) {
    if (v < x) below++;
    else if (v === x) equal++;
  }
  return (below + equal / 2) / xs.length;
}

/** Parse a date that may be unix seconds, unix ms, or an ISO string. */
export function toDate(v) {
  if (v == null || v === '') return null;
  if (typeof v === 'number' || /^\d+$/.test(String(v))) {
    const n = Number(v);
    return new Date(n < 1e12 ? n * 1000 : n);
  }
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}

export const daysBetween = (a, b) => Math.max(0, Math.round((b - a) / 86_400_000));

/** Lowercased, whitespace-collapsed, URL-free text for dedupe keys. */
export const normText = (s) =>
  String(s || '')
    .replace(/https?:\/\/\S+/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();

/** The first line or sentence of copy — the fallback hook when nothing better exists. */
export function firstLine(s, max = 160) {
  const text = String(s || '').trim();
  if (!text) return '';
  const line = text.split(/\n+/)[0].trim();
  const sentence = line.match(/^.{12,}?[.!?…](?=\s|$)/);
  const pick = sentence && sentence[0].length < line.length ? sentence[0] : line;
  return pick.length > max ? `${pick.slice(0, max - 1)}…` : pick;
}

/** Strip a URL down to host+path so ?fbclid= and UTMs don't split one landing page into many. */
export function landingKey(u) {
  try {
    const url = new URL(u);
    return `${url.hostname.replace(/^www\./, '')}${url.pathname.replace(/\/+$/, '') || '/'}`;
  } catch {
    return null;
  }
}

export function parseArgs(argv) {
  const out = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith('--')) {
      out._.push(a);
      continue;
    }
    const [k, v] = a.slice(2).split('=');
    if (v !== undefined) out[k] = v;
    else if (argv[i + 1] && !argv[i + 1].startsWith('--')) out[k] = argv[++i];
    else out[k] = true;
  }
  return out;
}

const csvCell = (v) => {
  if (v == null) return '';
  const s = typeof v === 'object' ? JSON.stringify(v) : String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export function toCsv(rows, columns) {
  const cols = columns || [...new Set(rows.flatMap((r) => Object.keys(r)))];
  return [cols.join(','), ...rows.map((r) => cols.map((c) => csvCell(r[c])).join(','))].join('\n') + '\n';
}

/** RFC 4180 CSV → array of objects keyed by the header row. */
export function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (c === '"') quoted = false;
      else cell += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') {
      row.push(cell);
      cell = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
    } else cell += c;
  }
  if (cell || row.length) {
    row.push(cell);
    rows.push(row);
  }
  const [head, ...body] = rows.filter((r) => r.some((c) => c !== ''));
  if (!head) return [];
  return body.map((r) => Object.fromEntries(head.map((h, i) => [h.trim(), r[i] ?? ''])));
}

export function countBy(items, keyFn) {
  const m = {};
  for (const it of items) {
    const k = keyFn(it);
    if (k == null) continue;
    m[k] = (m[k] || 0) + 1;
  }
  return m;
}

export const truncate = (s, n) => {
  const t = String(s || '');
  return t.length > n ? `${t.slice(0, n - 1)}…` : t;
};
