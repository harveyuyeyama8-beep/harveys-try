/**
 * Jev — TypeSafe's System One model — makes every cheap decision in the
 * pipeline: is this advertiser a competitor, what type of ad is this, how
 * good is this hook on each rubric line, would this persona stop / click /
 * buy. It returns calibrated probabilities instead of text, so a "score" is
 * a probability-weighted position on a rubric with a confidence, not a vibe.
 *
 * Weighting: each rubric answer is normalised to 0..1, shrunk toward 0.5 by
 * (1 - confidence) so an unsure answer counts for less, then combined with
 * the weights in config.json → rubricWeights. `calibrate` retunes those
 * weights from your own ad results.
 */
import { TypeSafeClient, noul, score, choice } from '@typesafe-ai/sdk';
import { RUBRICS } from './taxonomy.js';
import { sha, limiter, weighted, clamp01 } from './util.js';

export { noul, score, choice };

/** Build Jev score questions for one component's rubric. */
export function rubricQuestions(component) {
  const rubric = RUBRICS[component];
  if (!rubric) throw new Error(`No rubric for ${component}`);
  return Object.fromEntries(Object.entries(rubric).map(([k, { q, levels }]) => [k, score(q, levels)]));
}

/** Choice question from a {label: description} map. */
export const choiceFrom = (instructions, labels) => choice(instructions, { ...labels });

export function makeJev(ctx) {
  const { cfg } = ctx;
  const limit = limiter(cfg.concurrency.jev);
  let client = null;
  const getClient = () => {
    if (!client) {
      const opts = ctx.clientOptions?.typesafe || {};
      if (!process.env.TYPESAFE_API_KEY && !opts.apiKey) {
        throw new Error('TYPESAFE_API_KEY is not set. Add it to adintel/.env, or run with --offline.');
      }
      client = new TypeSafeClient({ defaultModel: cfg.models.jev, timeout: 30_000, retry: { maxRetries: 4 }, ...opts });
    }
    return client;
  };

  async function callOnce(state, questions) {
    if (ctx.offline) return mockAnswers(state, questions);
    ctx.assertBudget();
    const res = await limit(() => getClient().systemOne({ state, questions }));
    ctx.ledger.jev.calls++;
    ctx.ledger.jev.input += res.usage?.input_tokens || 0;
    ctx.ledger.jev.output += res.usage?.output_tokens || 0;
    ctx.ledger.jev.usd += cfg.pricing.jevPerCallUsd;
    return res.answers;
  }

  /**
   * Ask any number of questions about one state. Splits into calls of at most
   * jev.maxQuestionsPerCall, caches every call by content hash.
   */
  async function ask(state, questions, ns = 'jev') {
    const names = Object.keys(questions);
    const size = cfg.jev.maxQuestionsPerCall;
    const answers = {};
    for (let i = 0; i < names.length; i += size) {
      const chunk = Object.fromEntries(names.slice(i, i + size).map((n) => [n, questions[n]]));
      const key = sha({ m: cfg.models.jev, state, chunk, offline: ctx.offline });
      Object.assign(answers, await ctx.cached(ns, key, () => callOnce(state, chunk)));
    }
    return answers;
  }

  /** Normalised 0..1 value of one answer, shrunk toward 0.5 by its uncertainty. */
  function value(answer) {
    if (!answer) return null;
    if (answer.type === 'noul') return answer.noul;
    if (answer.type === 'score') {
      const levels = Object.keys(answer.probabilities).length;
      const norm = answer.score / (levels - 1);
      return cfg.jev.confidenceShrink ? 0.5 + (norm - 0.5) * answer.confidence : norm;
    }
    return null;
  }

  /** Grade one component (hook/body/headline/cta/advertorial) on its rubric. */
  async function rubric(component, state) {
    const answers = await ask(state, rubricQuestions(component), `rubric-${component}`);
    const criteria = {};
    for (const [k, a] of Object.entries(answers)) {
      criteria[k] = {
        score: a.score,
        confidence: a.confidence,
        value: value(a),
      };
    }
    const values = Object.fromEntries(Object.entries(criteria).map(([k, c]) => [k, c.value]));
    return { criteria, composite: weighted(values, cfg.rubricWeights[component]) };
  }

  /** Classify against label maps. Returns {name: {label, confidence, probabilities}}. */
  async function classify(state, sets, ns = 'classify') {
    const questions = Object.fromEntries(
      Object.entries(sets).map(([name, { q, labels }]) => [name, choiceFrom(q, labels)]),
    );
    const answers = await ask(state, questions, ns);
    return Object.fromEntries(
      Object.entries(answers).map(([k, a]) => [k, { label: a.choice, confidence: a.confidence, probabilities: a.probabilities }]),
    );
  }

  /** Yes/no probabilities for several questions about one state. */
  async function probs(state, questions, ns = 'noul') {
    const qs = Object.fromEntries(Object.entries(questions).map(([k, q]) => [k, typeof q === 'string' ? noul(q) : q]));
    const answers = await ask(state, qs, ns);
    return Object.fromEntries(Object.entries(answers).map(([k, a]) => [k, a.noul]));
  }

  return { ask, rubric, classify, probs, value };
}

/* ------------------------------------------------------------------------ */
/* Offline stand-in. Deterministic, cheap, and deliberately crude: it exists
 * so the pipeline and report can be exercised without API keys. Never read
 * its numbers as judgments. */

const STOP = new Set('the and for you your this that with not are from its but has any who what how into one than then them they our out all can was were been more most only some such very just like also'.split(' '));
const values = (v) => (v && typeof v === 'object' ? Object.values(v).map(values).join(' ') : String(v ?? ''));
const words = (s) => (values(s).toLowerCase().match(/[a-z]{3,}/g) || []).filter((w) => !STOP.has(w));
const unit = (seed) => parseInt(sha(seed).slice(0, 8), 16) / 0xffffffff;

function heuristicLift(state) {
  const t = JSON.stringify(state);
  let lift = 0;
  if (/\d/.test(t)) lift += 0.08;
  if (/\?/.test(t)) lift += 0.05;
  if (/\b(you|your)\b/i.test(t)) lift += 0.05;
  if (/\b(stop|never|secret|truth|myth|why|mistake)\b/i.test(t)) lift += 0.08;
  if (/\b(best|quality|premium|delicious)\b/i.test(t)) lift -= 0.05;
  return lift;
}

export function mockAnswers(state, questions) {
  const out = {};
  const stateWords = new Set(words(state));
  const lift = heuristicLift(state);
  for (const [name, q] of Object.entries(questions)) {
    const seed = [state, name, q.instructions];
    if (q.type === 'noul') {
      out[name] = { type: 'noul', noul: clamp01(0.25 + 0.5 * unit(seed) + lift) };
    } else if (q.type === 'score') {
      const n = q.criteria.length;
      const expected = clamp01(0.2 + 0.55 * unit(seed) + lift) * (n - 1);
      const probabilities = Object.fromEntries(
        q.criteria.map((_, i) => [String(i), Math.exp(-((i - expected) ** 2))]),
      );
      const z = Object.values(probabilities).reduce((a, b) => a + b, 0);
      for (const k of Object.keys(probabilities)) probabilities[k] /= z;
      const legend = Object.fromEntries(q.criteria.map((c, i) => [String(i), c]));
      out[name] = { type: 'score', score: expected, confidence: 0.5 + 0.4 * unit([seed, 'c']), legend, probabilities };
    } else {
      const labels = Object.keys(q.criteria);
      const raw = labels.map((l) => {
        const lw = words(`${l} ${q.criteria[l] || ''}`);
        const hits = lw.filter((w) => stateWords.has(w)).length;
        return Math.exp(hits * 0.9 + unit([seed, l]) * 0.6 - (l === 'other' || l === 'none' ? 1 : 0));
      });
      const z = raw.reduce((a, b) => a + b, 0);
      const probabilities = Object.fromEntries(labels.map((l, i) => [l, raw[i] / z]));
      const best = labels[raw.indexOf(Math.max(...raw))];
      out[name] = { type: 'choice', choice: best, confidence: probabilities[best], probabilities };
    }
  }
  return out;
}
