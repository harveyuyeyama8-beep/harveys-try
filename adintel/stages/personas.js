/**
 * Stage 5 — put the best hooks in front of 15 buyers.
 *
 * Each persona in personas.json is its own sub-agent: a cheap Claude call
 * that becomes that person, scrolls a feed of the hooks, and reacts in their
 * own voice — gut reaction, objection, what would make them buy. Jev then
 * turns each (persona, ad, reaction) into calibrated probabilities:
 *
 *   stop   P(stops scrolling)
 *   click  P(taps through | stopped)
 *   buy    P(buys within a week | tapped through)
 *
 * Expected buyers per impression for a persona = stop × click × buy. The
 * hook's persona score is that, weighted by how much of the market each
 * persona is (their `weight`). Only the top-K hooks get here — the cheap
 * stages decide who is worth the panel's time.
 *
 * engine (config.personas.engine):
 *   "agents+jev"  both (default)
 *   "jev"         skip the agents; Jev judges persona + ad directly (cheapest)
 *   "agents"      skip Jev; use the agents' own 0–10 ratings
 */
import fs from 'node:fs';
import path from 'node:path';
import { z } from 'zod';
import { makeClaude } from '../lib/claude.js';
import { makeJev, noul } from '../lib/jev.js';
import { computeProof } from '../lib/proof.js';
import { log, pool, sha, weighted, mean, std, normText, clamp01 } from '../lib/util.js';

const Reactions = z.object({
  reactions: z.array(
    z.object({
      id: z.string(),
      stop: z.number().describe('0–10: how likely you are to stop scrolling on this ad'),
      click: z.number().describe('0–10: if you stopped, how likely you are to tap through'),
      buy: z.number().describe('0–10: if you tapped through and the offer matched, how likely you are to buy this week'),
      gut: z.string().describe('Your honest inner monologue on seeing it, in your own voice, 25 words or fewer'),
      objection: z.string().describe('The main reason you would not buy. Empty if none.'),
      wouldNeed: z.string().describe('What would have to be true for you to buy. Empty if nothing.'),
    }),
  ),
});

export function loadPersonas(ctx) {
  const personas = JSON.parse(fs.readFileSync(path.resolve(ctx.root, ctx.cfg.personas.file), 'utf8'));
  const total = personas.reduce((s, p) => s + p.weight, 0);
  return personas.map((p) => ({ ...p, weight: p.weight / total }));
}

const personaSystem = (p) => `You are ${p.name}. Stay in character for the whole task.

About you: ${p.summary}
Age: ${p.age}. Location: ${p.location}.
How you drink coffee: ${p.coffee}
What you spend: ${p.spend}
What gets you to buy: ${p.triggers.join('; ')}
What stops you: ${p.objections.join('; ')}
How you use social media: ${p.media}

You are scrolling Facebook and Instagram on your phone. Like real life, you scroll past most ads in under a second, and you buy almost nothing. You will see a batch of ads. React to each one honestly as yourself — not as a marketer, not as an AI. Low numbers are normal. Only rate high when this ad would genuinely get you.`;

export const feedItem = (it) =>
  [
    `[AD ${it.id}]`,
    `Sponsored · ${it.brand}`,
    it.visual ? `You see: ${it.visual}` : null,
    it.onImageText ? `Text on the image: ${it.onImageText}` : null,
    `Opening line: ${it.hook}`,
    it.headline ? `Headline: ${it.headline}` : null,
    it.offer ? `Offer: ${it.offer}` : null,
    it.cta ? `Button: ${it.cta}` : null,
  ]
    .filter(Boolean)
    .join('\n');

function mockReaction(p, it) {
  const u = (s) => parseInt(sha([p.id, it.id, s]).slice(0, 6), 16) / 0xffffff;
  return {
    id: it.id,
    stop: Math.round(u('s') * 7),
    click: Math.round(u('c') * 6),
    buy: Math.round(u('b') * 5),
    gut: '[offline placeholder reaction]',
    objection: p.objections[0] || '',
    wouldNeed: '',
  };
}

/**
 * Run the panel over `items` ({id, brand, hook, visual, onImageText,
 * headline, offer, cta}). Returns {byItem, matrix}.
 */
export async function runPanel(ctx, items, ns = 'panel') {
  const { cfg } = ctx;
  const engine = cfg.personas.engine;
  const claude = makeClaude(ctx);
  const jev = makeJev(ctx);
  const personas = loadPersonas(ctx);
  const size = cfg.personas.hooksPerAgentCall;

  // 1. Agents react (one cached call per persona per batch of hooks).
  const reactions = {};
  if (engine !== 'jev') {
    const jobs = [];
    for (const p of personas) for (let i = 0; i < items.length; i += size) jobs.push({ p, batch: items.slice(i, i + size) });
    log(`${ns}: ${jobs.length} persona agent calls (${personas.length} personas × ${Math.ceil(items.length / size)} batches)`);
    await pool(jobs, cfg.concurrency.claude, async ({ p, batch }) => {
      const key = sha([cfg.models.persona, p, batch.map(feedItem)]);
      let res;
      try {
        res = await ctx.cached(`${ns}-agent`, key, () =>
          claude.structured({
            model: cfg.models.persona,
            system: personaSystem(p),
            content: `Here is your feed. React to every ad, using its exact ID.\n\n${batch.map(feedItem).join('\n\n')}`,
            schema: Reactions,
            maxTokens: 6000,
            mock: () => ({ reactions: batch.map((it) => mockReaction(p, it)) }),
          }),
        );
      } catch (e) {
        log(`${ns}: persona ${p.id} batch failed (${e.message})`);
        return;
      }
      for (const r of res.reactions) {
        const id = String(r.id).replace(/^\[?\s*AD\s*/i, '').replace(/\]$/, '').trim();
        reactions[`${p.id}|${id}`] = r;
      }
    });
  }

  // 2. Jev converts person + ad (+ their reaction) into calibrated probabilities.
  const pairs = personas.flatMap((p) => items.map((it) => ({ p, it })));
  const matrix = {};
  if (engine !== 'agents') log(`${ns}: ${pairs.length} Jev persona judgments`);
  await pool(pairs, cfg.concurrency.jev, async ({ p, it }) => {
    const r = reactions[`${p.id}|${it.id}`];
    let probs;
    if (engine === 'agents') {
      probs = r ? { stop: clamp01(r.stop / 10), click: clamp01(r.click / 10), buy: clamp01(r.buy / 10) } : null;
    } else {
      const state = {
        person: { name: p.name, age: p.age, summary: p.summary, coffee: p.coffee, spend: p.spend, buysWhen: p.triggers, stopsWhen: p.objections },
        ad: feedItem(it),
        ...(r ? { theirReaction: { gut: r.gut, objection: r.objection, wouldNeed: r.wouldNeed } } : {}),
      };
      probs = await jev.probs(
        state,
        {
          stop: noul('Would this person stop scrolling to look at this ad?'),
          click: noul('Having stopped, would this person tap through to the website?'),
          buy: noul('Having tapped through, and assuming the page delivers what the ad promised, would this person buy within a week?'),
        },
        `${ns}-jev`,
      );
    }
    if (!probs) return;
    matrix[`${p.id}|${it.id}`] = {
      ...probs,
      ev: probs.stop * probs.click * probs.buy,
      gut: r?.gut ?? null,
      objection: r?.objection ?? null,
      wouldNeed: r?.wouldNeed ?? null,
    };
  });

  // 3. Aggregate per item, weighted by market share.
  const byItem = {};
  for (const it of items) {
    const rows = personas.map((p) => ({ p, m: matrix[`${p.id}|${it.id}`] })).filter((x) => x.m);
    if (!rows.length) continue;
    const w = Object.fromEntries(rows.map(({ p }) => [p.id, p.weight]));
    const pick = (f) => weighted(Object.fromEntries(rows.map(({ p, m }) => [p.id, m[f]])), w);
    const evs = rows.map(({ m }) => m.ev);
    byItem[it.id] = {
      stop: pick('stop'),
      click: pick('click'),
      buy: pick('buy'),
      ev: pick('ev'),
      polarization: std(rows.map(({ m }) => m.stop)),
      bestFor: [...rows].sort((a, b) => b.m.ev - a.m.ev).slice(0, 3).map(({ p }) => p.id),
      worstFor: [...rows].sort((a, b) => a.m.ev - b.m.ev).slice(0, 2).map(({ p }) => p.id),
      meanEv: mean(evs),
    };
  }
  const maxEv = Math.max(...Object.values(byItem).map((b) => b.ev), 1e-9);
  for (const b of Object.values(byItem)) b.score = b.ev / maxEv;
  return { byItem, matrix, personas: personas.map(({ id, name, weight }) => ({ id, name, weight })) };
}

/** Pick the top-K competitor hooks (by proof + Jev) and run the panel on them. */
export async function personasStage(ctx) {
  const { cfg } = ctx;
  const creatives = ctx.read('creatives.json', []);
  const components = ctx.read('components.json', {});
  const scores = ctx.read('scores.json', { creatives: {} });
  const proof = computeProof(cfg, creatives);

  // One representative creative per unique hook: the one with the most proof.
  const best = new Map();
  for (const c of creatives) {
    const k = components[c.id];
    const s = scores.creatives[c.id];
    if (!k?.hook || !s?.hook) continue;
    const prelim = weighted({ proof: proof[c.id].proof, jev: s.hook.composite }, { proof: cfg.final.weights.proof, jev: cfg.final.weights.jev });
    const key = normText(k.hook);
    if (!best.has(key) || best.get(key).prelim < prelim) best.set(key, { c, k, prelim });
  }
  const top = [...best.values()].sort((a, b) => b.prelim - a.prelim).slice(0, cfg.personas.topK);
  const items = top.map(({ c, k }) => ({
    id: c.id.slice(0, 8),
    creativeId: c.id,
    brand: c.brand,
    hook: k.hook,
    visual: k.visualHook,
    onImageText: k.onImageText,
    headline: k.headline || c.title,
    offer: k.offer,
    cta: k.ctaButton || c.ctaText,
  }));
  log(`personas: panel of ${loadPersonas(ctx).length} on the top ${items.length} hooks (engine: ${cfg.personas.engine})`);
  const panel = await runPanel(ctx, items, 'panel');

  const byCreative = {};
  for (const it of items) if (panel.byItem[it.id]) byCreative[it.creativeId] = { ...panel.byItem[it.id], itemId: it.id };
  ctx.write('persona_results.json', { byCreative, matrix: panel.matrix, items, personas: panel.personas });
  return { hooks: items.length };
}
