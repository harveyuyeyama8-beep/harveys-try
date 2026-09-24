import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { loadContext, ROOT } from '../lib/context.js';
import { mockAnswers } from '../lib/jev.js';
import { computeProof } from '../lib/proof.js';
import { toCreatives, fromApify } from '../sources/normalize.js';
import { spearman, reweight } from '../stages/calibrate.js';
import { parseCsv, toCsv } from '../lib/util.js';
import { discover } from '../stages/discover.js';
import { harvest } from '../stages/harvest.js';
import { decompose } from '../stages/decompose.js';
import { scoreStage } from '../stages/score.js';
import { personasStage } from '../stages/personas.js';
import { rankStage } from '../stages/rank.js';
import { remixStage } from '../stages/remix.js';
import { reportStage } from '../stages/report.js';

const FIXTURE = path.join(ROOT, 'fixtures', 'demo-ads.json');
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'adintel-'));
const PIPELINE = [discover, harvest, decompose, scoreStage, personasStage, rankStage, remixStage, reportStage];

function demoCtx(extra = {}) {
  const dir = tmp();
  return loadContext({ demo: true, import: FIXTURE, data: path.join(dir, 'data'), out: path.join(dir, 'out'), now: '2026-09-24T00:00:00Z', ...extra });
}

test('spearman and reweight', () => {
  assert.equal(spearman([1, 2, 3, 4], [10, 20, 30, 40]), 1);
  assert.equal(spearman([1, 2, 3, 4], [4, 3, 2, 1]), -1);
  const w = reweight({ a: 1, b: 1 }, { a: 1, b: -0.5 }, 0.5);
  assert.ok(w.a > w.b);
  assert.equal(Math.round((w.a + w.b) * 1000), 2000);
});

test('csv round trip keeps commas, quotes and newlines', () => {
  const rows = [{ a: 'x, "y"', b: 'line1\nline2' }];
  assert.deepEqual(parseCsv(toCsv(rows)), rows);
});

test('identical ads fold into one creative; proof rewards longevity and scale', () => {
  const now = new Date('2026-09-24T00:00:00Z');
  const base = { snapshot: { body: { text: 'Hello coffee' }, title: 'T', link_url: 'https://x.example/a?fbclid=1' }, page_id: '1', page_name: 'B' };
  const ads = [
    fromApify({ ...base, ad_archive_id: '1', start_date: 1_780_000_000, is_active: true, collation_count: 9 }),
    fromApify({ ...base, ad_archive_id: '2', start_date: 1_785_000_000, is_active: true }),
    fromApify({ ...base, ad_archive_id: '3', snapshot: { ...base.snapshot, body: { text: 'Other' } }, start_date: 1_790_000_000, is_active: false, end_date: 1_790_100_000 }),
  ];
  const creatives = toCreatives(ads, () => 'B', now);
  assert.equal(creatives.length, 2);
  const big = creatives.find((c) => c.body === 'Hello coffee');
  assert.equal(big.variants, 9);
  assert.equal(big.landingKey, 'x.example/a');
  const cfg = JSON.parse(fs.readFileSync(path.join(ROOT, 'config.json'), 'utf8'));
  const proof = computeProof(cfg, creatives);
  const small = creatives.find((c) => c.body === 'Other');
  assert.ok(proof[big.id].proof > proof[small.id].proof);
  assert.equal(proof[big.id].winner, true);
});

test('offline demo runs end to end and writes every output', async () => {
  const ctx = demoCtx();
  for (const stage of PIPELINE) await stage(ctx);
  const R = ctx.read('rankings.json');
  assert.equal(R.counts.brands, 4);
  assert.ok(R.hooks.length > 10);
  assert.ok(R.hooks[0].final >= R.hooks.at(-1).final);
  for (const f of ['report.html', 'hooks.csv', 'primary_text.csv', 'advertorials.csv', 'launch.csv', 'persona_matrix.csv', 'breakdown_adType.csv']) {
    assert.ok(fs.existsSync(path.join(ctx.outDir, f)), f);
  }
  const pm = parseCsv(fs.readFileSync(path.join(ctx.outDir, 'persona_matrix.csv'), 'utf8'));
  assert.equal(pm.length, 15 * ctx.read('persona_results.json').items.length);
});

/* ---- The live code path, with Claude and Jev answered by stub transports. ---- */

function sample(schema, defs = schema.$defs || schema.definitions || {}) {
  if (schema.$ref) return sample(defs[schema.$ref.split('/').pop()], defs);
  if (schema.anyOf) return sample(schema.anyOf[0], defs);
  if (schema.enum) return schema.enum[0];
  const allowed = schema.description?.match(/One of: ([\w-]+)/) || schema.description?.match(/\{enum: \["([^"]+)"/);
  if (allowed) return allowed[1];
  switch (schema.type) {
    case 'object':
      return Object.fromEntries(Object.entries(schema.properties || {}).map(([k, v]) => [k, sample(v, defs)]));
    case 'array':
      return [sample(schema.items, defs), sample(schema.items, defs)].map((x, i) => (x && typeof x === 'object' && 'id' in x ? { ...x, id: `c${i}` } : x));
    case 'number':
    case 'integer':
      return 5;
    case 'boolean':
      return true;
    default:
      return 'stub text';
  }
}

function stubs() {
  const seen = { anthropic: [], jev: 0 };
  const json = (body, headers = {}) => new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json', ...headers } });

  const anthropicFetch = async (url, init) => {
    const body = JSON.parse(init.body);
    const headers = Object.fromEntries(new Headers(init.headers).entries());
    seen.anthropic.push({ url: String(url), body, headers });
    const system = Array.isArray(body.system) ? body.system.map((b) => b.text).join('') : body.system;
    let out = sample(body.output_config.format.schema);
    if (system.includes('Stay in character')) {
      const ids = [...JSON.stringify(body.messages).matchAll(/\[AD ([^\]]+)\]/g)].map((m) => m[1]);
      out = { reactions: ids.map((id) => ({ id, stop: 6, click: 4, buy: 3, gut: 'ok', objection: 'price', wouldNeed: '' })) };
    }
    const text = JSON.stringify(out);
    const usage = { input_tokens: 1000, output_tokens: 200, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 };
    if (!body.stream) {
      return json({ id: 'msg_stub', type: 'message', role: 'assistant', model: body.model, content: [{ type: 'text', text }], stop_reason: 'end_turn', stop_sequence: null, usage });
    }
    const ev = (type, data) => `event: ${type}\ndata: ${JSON.stringify({ type, ...data })}\n\n`;
    const sse =
      ev('message_start', { message: { id: 'msg_stub', type: 'message', role: 'assistant', model: body.model, content: [], stop_reason: null, stop_sequence: null, usage: { ...usage, output_tokens: 1 } } }) +
      ev('content_block_start', { index: 0, content_block: { type: 'text', text: '' } }) +
      ev('content_block_delta', { index: 0, delta: { type: 'text_delta', text } }) +
      ev('content_block_stop', { index: 0 }) +
      ev('message_delta', { delta: { stop_reason: 'end_turn', stop_sequence: null }, usage: { output_tokens: 200 } }) +
      ev('message_stop', {});
    return new Response(sse, { status: 200, headers: { 'content-type': 'text/event-stream' } });
  };

  const jevFetch = async (url, init) => {
    assert.ok(String(url).endsWith('/v1/systemone'), String(url));
    const body = JSON.parse(init.body);
    assert.ok(body.state !== undefined && Object.keys(body.questions).length > 0);
    seen.jev++;
    return json({ model: body.model, answers: mockAnswers(body.state, body.questions), usage: { input_tokens: 80, output_tokens: 4 } });
  };

  return { seen, anthropicFetch, jevFetch };
}

test('live path: Claude and Jev requests are well-formed and parsed', async () => {
  const ctx = demoCtx();
  ctx.offline = false; // demo data, but real SDK clients
  const s = stubs();
  ctx.clientOptions = {
    anthropic: { apiKey: 'stub', fetch: s.anthropicFetch, maxRetries: 0 },
    typesafe: { apiKey: 'stub', fetch: s.jevFetch, retry: { maxRetries: 0 } },
  };
  ctx.cfg.decompose.vision = false;
  for (const stage of PIPELINE) await stage(ctx);

  const cheap = s.seen.anthropic.filter((r) => r.body.model === 'claude-haiku-4-5');
  const strategist = s.seen.anthropic.filter((r) => r.body.model === 'claude-opus-5');
  assert.ok(cheap.length > 0);
  for (const r of cheap) {
    assert.equal(r.body.output_config.format.type, 'json_schema');
    assert.equal(r.body.thinking, undefined);
    assert.equal(r.body.system[0].cache_control.type, 'ephemeral');
  }
  assert.equal(strategist.length, 1);
  const opus = strategist[0];
  assert.equal(opus.body.stream, true);
  assert.deepEqual(opus.body.thinking, { type: 'adaptive' });
  assert.equal(opus.body.fallbacks, 'default');
  assert.match(opus.headers['anthropic-beta'], /server-side-fallback-2026-07-01/);

  assert.ok(s.seen.jev > 100);
  assert.equal(ctx.ledger.jev.calls, s.seen.jev);
  assert.ok(ctx.ledger.anthropic.usd > 0);

  const launch = parseCsv(fs.readFileSync(path.join(ctx.outDir, 'launch.csv'), 'utf8'));
  assert.ok(launch.length >= 1);
  assert.match(launch[0].website_url, /^https:\/\/try\.harveyscoffee\.shop\/[a-z0-9-]+\?utm_source=facebook/);
  const panel = ctx.read('persona_results.json');
  const withGut = Object.values(panel.matrix).filter((m) => m.gut === 'ok');
  assert.equal(withGut.length, Object.keys(panel.matrix).length, 'every persona judgment carries its agent reaction');

  // Re-running is free: everything is served from the content-addressed cache.
  const before = { a: s.seen.anthropic.length, j: s.seen.jev };
  for (const stage of [decompose, scoreStage, personasStage]) await stage(ctx);
  assert.deepEqual({ a: s.seen.anthropic.length, j: s.seen.jev }, before);
});
