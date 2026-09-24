/**
 * Claude does the jobs that need words or eyes: reading an ad image,
 * pulling the hook and copy apart, role-playing a buyer, and writing new
 * concepts. Anything that is a decision goes to Jev instead (lib/jev.js).
 *
 * Two call shapes:
 *   structured() — cheap model (Haiku by default), one request, JSON out
 *   strategize() — the strategist model (Opus), streamed, adaptive thinking
 */
import Anthropic from '@anthropic-ai/sdk';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import { limiter } from './util.js';

const IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/gif', 'image/webp']);
const MAX_IMAGE_BYTES = 4_500_000;

// Models that accept the server-side refusal fallback chain.
const FALLBACK_MODELS = new Set(['claude-opus-5', 'claude-fable-5-1']);

export function makeClaude(ctx) {
  const { cfg } = ctx;
  const limit = limiter(cfg.concurrency.claude);
  let client = null;
  const getClient = () => {
    client ??= new Anthropic({ maxRetries: 4, ...ctx.clientOptions?.anthropic });
    return client;
  };

  function charge(model, usage) {
    const p = cfg.pricing.anthropic[model];
    const l = ctx.ledger.anthropic;
    l.calls++;
    l.input += usage.input_tokens || 0;
    l.output += usage.output_tokens || 0;
    l.cacheRead += usage.cache_read_input_tokens || 0;
    l.cacheWrite += usage.cache_creation_input_tokens || 0;
    if (!p) return;
    l.usd +=
      ((usage.input_tokens || 0) * p.input +
        (usage.output_tokens || 0) * p.output +
        (usage.cache_read_input_tokens || 0) * p.cacheRead +
        (usage.cache_creation_input_tokens || 0) * p.cacheWrite) /
      1e6;
  }

  function checkStop(msg) {
    if (msg.stop_reason === 'refusal') {
      throw new Error(`Model declined (${msg.stop_details?.category ?? 'no category'}): ${msg.stop_details?.explanation ?? ''}`);
    }
    if (msg.stop_reason === 'max_tokens') throw new Error('Response hit max_tokens; raise it for this stage.');
    if (!msg.parsed_output) throw new Error('Response did not match the schema.');
  }

  /**
   * One cheap structured call. `system` should be stable across calls so it
   * caches; per-item material goes in `content`. In offline mode `mock()` is
   * returned instead.
   */
  async function structured({ model = cfg.models.extract, system, content, schema, maxTokens = 4000, mock }) {
    if (ctx.offline) return mock();
    ctx.assertBudget();
    const msg = await limit(() =>
      getClient().messages.parse({
        model,
        max_tokens: maxTokens,
        system: [{ type: 'text', text: system, cache_control: { type: 'ephemeral' } }],
        messages: [{ role: 'user', content }],
        output_config: { format: zodOutputFormat(schema) },
      }),
    );
    charge(model, msg.usage);
    checkStop(msg);
    return msg.parsed_output;
  }

  /** The expensive, careful call: streamed, adaptive thinking, JSON out. */
  async function strategize({ model = cfg.models.strategist, system, content, schema, maxTokens = 64000, effort = 'high', mock }) {
    if (ctx.offline) return mock();
    ctx.assertBudget();
    const params = {
      model,
      max_tokens: maxTokens,
      thinking: { type: 'adaptive' },
      output_config: { effort, format: zodOutputFormat(schema) },
      system,
      messages: [{ role: 'user', content }],
    };
    if (FALLBACK_MODELS.has(model)) {
      params.betas = ['server-side-fallback-2026-07-01'];
      params.fallbacks = 'default';
    }
    const msg = await limit(() => getClient().beta.messages.stream(params).finalMessage());
    charge(msg.model in cfg.pricing.anthropic ? msg.model : model, msg.usage);
    checkStop(msg);
    return msg.parsed_output;
  }

  /**
   * Fetch an image ourselves and inline it as base64. Ad-library CDN links
   * are signed and short-lived; fetching here means a dead link costs us a
   * skipped image instead of a failed API call.
   */
  async function imageBlock(url) {
    if (!url) return null;
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(15_000) });
      if (!res.ok) return null;
      const type = (res.headers.get('content-type') || '').split(';')[0].trim();
      if (!IMAGE_TYPES.has(type)) return null;
      const buf = Buffer.from(await res.arrayBuffer());
      if (buf.length > MAX_IMAGE_BYTES) return null;
      return { type: 'image', source: { type: 'base64', media_type: type, data: buf.toString('base64') } };
    } catch {
      return null;
    }
  }

  return { structured, strategize, imageBlock };
}
