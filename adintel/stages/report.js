/**
 * Stage 9 — out/report.html (one self-contained file, no network) plus a
 * CSV per table for sheets.
 */
import { toCsv, round, truncate } from '../lib/util.js';

const esc = (s) =>
  String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
const pct = (x) => (x == null ? '–' : `${Math.round(x * 100)}%`);
const num = (x, d = 2) => (x == null ? '–' : Number(x).toFixed(d));
const human = (s) => String(s ?? '').replace(/_/g, ' ');

// Categorical slots (validated reference order) + a neutral "Other".
const SERIES = 8;
const DIM_TITLES = {
  adType: 'Ad type',
  hookArchetype: 'Hook archetype',
  angle: 'Angle',
  funnel: 'Funnel stage',
  awareness: 'Awareness level',
  offerType: 'Offer type',
  format: 'Media format',
  landingType: 'Landing page type',
  ctaButton: 'CTA button',
};

function stackedBars(rows, legendOrder) {
  // rows: [{label, dist:{k:share}, n}]
  const legend = legendOrder.slice(0, SERIES - 1);
  const slot = (k) => (legend.includes(k) ? legend.indexOf(k) + 1 : 'other');
  const bars = rows
    .map(({ label, dist, n }) => {
      const segs = {};
      for (const [k, v] of Object.entries(dist)) {
        const key = legend.includes(k) ? k : 'other';
        segs[key] = (segs[key] || 0) + v;
      }
      const order = [...legend, 'other'].filter((k) => segs[k]);
      return `<div class="sb-row"><div class="sb-label">${esc(label)}<span class="muted"> · ${n}</span></div><div class="sb-bar" role="img" aria-label="${esc(
        `${label}: ${order.map((k) => `${human(k)} ${pct(segs[k])}`).join(', ')}`,
      )}">${order
        .map(
          (k) =>
            `<span class="seg s-${slot(k)}" style="flex-grow:${segs[k]}" title="${esc(`${label} — ${human(k)}: ${pct(segs[k])}`)}">${segs[k] >= 0.12 ? pct(segs[k]) : ''}</span>`,
        )
        .join('')}</div></div>`;
    })
    .join('');
  const keys = [...legend, 'other'];
  return `<div class="legend">${keys
    .map((k) => `<span class="lg"><span class="sw s-${slot(k)}"></span>${esc(human(k))}</span>`)
    .join('')}</div><div class="sb">${bars}</div>`;
}

function distTable(dim, market) {
  const all = market.all[dim] || {};
  const win = market.winnersOnly[dim] || {};
  const keys = [...new Set([...Object.keys(all), ...Object.keys(win)])].sort((a, b) => (all[b] || 0) - (all[a] || 0));
  return `<table class="t compact"><thead><tr><th>${esc(DIM_TITLES[dim])}</th><th>All ads</th><th>Winners</th></tr></thead><tbody>${keys
    .map(
      (k) =>
        `<tr><td>${esc(human(k))}</td><td><span class="bar" style="--w:${(all[k] || 0) * 100}%"></span>${pct(all[k])}</td><td><span class="bar win" style="--w:${(win[k] || 0) * 100}%"></span>${pct(win[k])}</td></tr>`,
    )
    .join('')}</tbody></table>`;
}

function brandMatrix(dim, brands) {
  const keys = [...new Set(brands.flatMap((b) => Object.keys(b.all[dim] || {})))];
  const total = Object.fromEntries(keys.map((k) => [k, brands.reduce((s, b) => s + (b.all[dim]?.[k] || 0), 0)]));
  keys.sort((a, b) => total[b] - total[a]);
  const cell = (v) => `<td class="heat" style="--a:${v || 0}">${v ? pct(v) : ''}</td>`;
  return `<div class="scroll"><table class="t compact matrix"><thead><tr><th>Brand</th>${keys
    .map((k) => `<th>${esc(human(k))}</th>`)
    .join('')}</tr></thead><tbody>${brands
    .map((b) => `<tr><td>${esc(b.brand)}</td>${keys.map((k) => cell(b.all[dim]?.[k])).join('')}</tr>`)
    .join('')}</tbody></table></div>`;
}

const badge = (h) =>
  `${h.winners ? '<span class="badge win">winner</span>' : ''}${h.active ? '<span class="badge">live</span>' : ''}`;

export function reportStage(ctx) {
  const { cfg } = ctx;
  const R = ctx.read('rankings.json');
  if (!R) throw new Error('Run rank first.');
  const remix = ctx.read('remix.json');
  const panel = ctx.read('persona_results.json', { matrix: {}, items: [], personas: [] });
  const competitors = ctx.read('competitors.json', []);
  const spend = ctx.read('spend.json', null);
  const personaName = Object.fromEntries((panel.personas || []).map((p) => [p.id, p.name]));
  const nameOf = (ids) => (ids || []).map((i) => personaName[i] || i).join(', ');
  const N = cfg.report.rows;

  // ---- CSVs
  ctx.writeOut('hooks.csv', toCsv(R.hooks.map((h, i) => ({ rank: i + 1, hook: h.hook, brands: h.brands.join(' | '), archetype: h.archetype, ad_type: h.adType, final: h.final, proof: h.proof, jev: h.jev, persona: h.persona?.score, p_stop: h.persona?.stop, p_click: h.persona?.click, p_buy: h.persona?.buy, best_for: nameOf(h.persona?.bestFor), winners: h.winners, longest_days: h.longestDays, ad_ids: h.adIds, transferable: h.transferable, policy_risk: h.policyRisk, visual: h.visual, on_image_text: h.onImageText, ...Object.fromEntries(Object.entries(h.criteria).map(([k, v]) => [`c_${k}`, v])), snapshot: h.snapshot }))));
  ctx.writeOut('primary_text.csv', toCsv(R.bodies.map((b, i) => ({ rank: i + 1, text: b.text, words: b.words, brands: b.brands.join(' | '), angle: b.angle, final: b.final, proof: b.proof, jev: b.jev, winners: b.winners, ...Object.fromEntries(Object.entries(b.criteria).map(([k, v]) => [`c_${k}`, v])) }))));
  ctx.writeOut('headlines.csv', toCsv(R.headlines.map((h, i) => ({ rank: i + 1, headline: h.headline, brands: h.brands.join(' | '), final: h.final, proof: h.proof, jev: h.jev, winners: h.winners }))));
  ctx.writeOut('cta_lines.csv', toCsv(R.ctaLines.map((c, i) => ({ rank: i + 1, cta_line: c.ctaLine, button: c.button, offer: c.offer, brands: c.brands.join(' | '), final: c.final, proof: c.proof, jev: c.jev }))));
  ctx.writeOut('cta_buttons.csv', toCsv(R.buttons.map((b) => ({ button: b.button, share: b.share, winner_rate: b.winnerRate, lift: b.lift, jev: b.jev, creatives: b.creatives }))));
  ctx.writeOut('offers.csv', toCsv(R.offers.map((o) => ({ offer: o.offer, offer_type: o.offerType, brands: o.brands.join(' | '), creatives: o.creatives, winner_rate: o.winnerRate, lift: o.lift, proof: o.proof }))));
  ctx.writeOut('advertorials.csv', toCsv(R.advertorials.map((a, i) => ({ rank: i + 1, url: a.url, brands: a.brands.join(' | '), type: a.landingType, h1: a.h1, final: a.final, proof: a.proof, jev: a.jev, creatives_pointing: a.creativesPointing, winners_pointing: a.winnersPointing, words: a.words, headings: a.headings.join(' / '), ...Object.fromEntries(Object.entries(a.criteria).map(([k, v]) => [`c_${k}`, v])) }))));
  ctx.writeOut('patterns.csv', toCsv(R.patterns));
  ctx.writeOut('creatives.csv', toCsv(R.creatives.map((c, i) => ({ rank: i + 1, ...c, labels: undefined, ...Object.fromEntries(Object.entries(c.labels).map(([k, v]) => [k, v])) }))));
  for (const dim of Object.keys(DIM_TITLES)) {
    ctx.writeOut(`breakdown_${dim}.csv`, toCsv([{ brand: 'MARKET (all)', ...R.breakdown.market.all[dim] }, { brand: 'MARKET (winners)', ...R.breakdown.market.winnersOnly[dim] }, ...R.breakdown.brands.map((b) => ({ brand: b.brand, ...b.all[dim] }))]));
  }
  const matrixRows = Object.entries(panel.matrix || {}).map(([k, m]) => {
    const [persona, item] = k.split('|');
    const it = (panel.items || []).find((x) => x.id === item);
    return { persona: personaName[persona] || persona, hook: it?.hook, brand: it?.brand, p_stop: round(m.stop), p_click: round(m.click), p_buy: round(m.buy), ev: round(m.ev, 5), gut: m.gut, objection: m.objection, would_need: m.wouldNeed };
  });
  ctx.writeOut('persona_matrix.csv', toCsv(matrixRows));

  // ---- HTML
  const market = R.breakdown.market;
  const legendOrder = Object.keys(market.all.adType || {});
  const typeBars = stackedBars(
    [
      { label: 'Market — all ads', dist: market.all.adType, n: market.creatives },
      { label: 'Market — winners', dist: market.winnersOnly.adType || {}, n: market.winners },
      ...R.breakdown.brands.map((b) => ({ label: b.brand, dist: b.all.adType, n: b.creatives })),
    ],
    legendOrder,
  );

  const heatItems = (panel.items || []).slice(0, cfg.report.heatmapHooks);
  const heat = heatItems.length
    ? `<div class="scroll"><table class="t compact matrix"><thead><tr><th>Hook</th>${panel.personas
        .map((p) => `<th class="rot"><span>${esc(p.name)}</span></th>`)
        .join('')}</tr></thead><tbody>${heatItems
        .map((it) => {
          const evs = panel.personas.map((p) => panel.matrix[`${p.id}|${it.id}`]);
          return `<tr><td class="hookcell">${esc(truncate(it.hook, 90))}<div class="muted">${esc(it.brand)}</div></td>${evs
            .map((m) => {
              if (!m) return '<td></td>';
              const a = Math.min(1, m.stop);
              return `<td class="heat" style="--a:${a}" title="${esc(`stop ${pct(m.stop)} · click ${pct(m.click)} · buy ${pct(m.buy)}${m.gut ? `\n“${m.gut}”` : ''}${m.objection ? `\nObjection: ${m.objection}` : ''}`)}">${pct(m.stop)}</td>`;
            })
            .join('')}</tr>`;
        })
        .join('')}</tbody></table></div><p class="note">Cells show P(stop scrolling). Hover for click / buy probabilities, the persona's gut reaction and objection. Full matrix: persona_matrix.csv.</p>`
    : '<p class="muted">No persona panel run yet.</p>';

  const hookRows = R.hooks
    .slice(0, N)
    .map(
      (h, i) => `<tr><td class="num">${i + 1}</td><td class="hookcell"><div>${esc(h.hook)}</div>${h.visual ? `<div class="muted">Visual: ${esc(h.visual)}</div>` : ''}<div class="muted">${esc(h.brands.join(', '))} · ${esc(human(h.archetype))} · ${esc(human(h.adType))} ${badge(h)}${h.snapshot ? ` · <a href="${esc(h.snapshot)}" target="_blank" rel="noopener">ad</a>` : ''}</div></td><td class="num strong">${num(h.final)}</td><td class="num">${num(h.proof)}</td><td class="num">${num(h.jev)}</td><td class="num">${h.persona ? num(h.persona.score) : '–'}</td><td class="num">${h.longestDays ?? '–'}</td><td class="small">${esc(nameOf(h.persona?.bestFor))}</td></tr>`,
    )
    .join('');

  const textTable = (list, field, extra = () => '') =>
    list
      .slice(0, N)
      .map(
        (b, i) => `<tr><td class="num">${i + 1}</td><td class="hookcell"><div class="pre">${esc(truncate(b[field], 700))}</div><div class="muted">${esc(b.brands.join(', '))} ${badge(b)} ${extra(b)}</div></td><td class="num strong">${num(b.final)}</td><td class="num">${num(b.proof)}</td><td class="num">${num(b.jev)}</td></tr>`,
      )
      .join('');

  const patternRows = R.patterns
    .slice(0, 40)
    .map((p) => `<tr><td>${esc(DIM_TITLES[p.dimension])}</td><td>${esc(human(p.label))}</td><td class="num strong">${num(p.lift)}×</td><td class="num">${pct(p.winnerRate)}</td><td class="num">${pct(p.share)}</td><td class="num">${p.creatives}</td><td class="num">${p.brands}</td></tr>`)
    .join('');
  const gapRows = R.gaps
    .map((p) => `<tr><td>${esc(DIM_TITLES[p.dimension])}</td><td>${esc(human(p.label))}</td><td class="num strong">${num(p.lift)}×</td><td class="num">${pct(p.share)}</td><td class="num">${pct(p.winnerRate)}</td></tr>`)
    .join('');

  const advRows = R.advertorials
    .slice(0, N)
    .map(
      (a, i) => `<tr><td class="num">${i + 1}</td><td class="hookcell"><div><a href="${esc(a.url)}" target="_blank" rel="noopener">${esc(a.h1 || a.title || a.url)}</a></div><div class="muted">${esc(a.brands.join(', '))} · ${esc(human(a.landingType))} · ${a.words ?? '?'} words · ${a.creativesPointing} ads point here (${a.winnersPointing} winners)</div>${a.headings.length ? `<div class="muted small">${esc(a.headings.slice(0, 8).join(' / '))}</div>` : ''}</td><td class="num strong">${num(a.final)}</td><td class="num">${num(a.proof)}</td><td class="num">${num(a.jev)}</td></tr>`,
    )
    .join('');

  const launchRows = remix
    ? remix.concepts
        .map(
          (c) => `<tr><td class="num">${c.rank}</td><td class="hookcell"><div class="strong">${esc(c.hook)}</div><div class="muted">${esc(c.name)} · ${esc(human(c.adType))} · ${esc(human(c.hookArchetype))} · ${esc(c.funnel.toUpperCase())} → /${esc(c.landingSlug)}</div><details><summary>Full ad</summary><div class="pre">${esc(c.primaryText)}</div><div><b>Headline:</b> ${esc(c.headline)} · <b>Button:</b> ${esc(human(c.ctaButton))}</div>${c.visual ? `<div><b>Visual:</b> ${esc(c.visual)}</div>` : ''}${c.onImageText ? `<div><b>On image:</b> ${esc(c.onImageText)}</div>` : ''}<div class="muted">Borrows: ${esc(c.pattern)} (${esc(c.inspiredBy.join(', '))}). ${esc(c.rationale)}</div></details></td><td class="num strong">${num(c.final)}</td><td class="num">${num(c.scores.jev)}</td><td class="num">${num(c.scores.persona)}</td><td class="num">${pct(c.scores.stop)}</td><td class="num">${pct(c.scores.policyRisk)}</td><td class="small">${esc(nameOf(c.bestFor))}</td></tr>`,
        )
        .join('')
    : '';

  const changes = ctx.read('changes.json');
  const changeList = (list, empty) =>
    list.length
      ? `<table class="t compact"><tbody>${list
          .slice(0, 40)
          .map((c) => `<tr><td>${esc(c.brand)}</td><td>${esc(truncate(c.text, 140))}</td><td class="num">${c.days ?? '–'}d</td><td>${c.snapshot ? `<a href="${esc(c.snapshot)}" target="_blank" rel="noopener">ad</a>` : ''}</td></tr>`)
          .join('')}</tbody></table>`
      : `<p class="muted">${empty}</p>`;
  const changesHtml = changes
    ? `<h2 id="changes">Since the last harvest (${esc(new Date(changes.since).toDateString())})</h2>
<div class="grid2"><div class="card scroll"><h3>Launched — what they're testing now (${changes.launched.length})</h3>${changeList(changes.launched, 'Nothing new.')}</div>
<div class="card scroll"><h3>Killed — ran then stopped (${changes.killed.length})</h3>${changeList(changes.killed, 'Nothing stopped.')}<p class="note">Killed within ~14 days usually means it lost.</p></div></div>`
    : '';

  const kpis = [
    ['Competitors', R.counts.brands],
    ['Unique creatives', R.counts.creatives],
    ['Winners', R.counts.winners],
    ['Landing pages', R.counts.landings],
    ['Hooks ranked', R.hooks.length],
    ['Run cost', spend ? `$${num(spend.totalUsd)}` : '–'],
  ];

  const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Competitor Ad Intel</title>
<style>
:root{color-scheme:light;--bg:#fcfcfb;--card:#ffffff;--ink:#0b0b0b;--ink-2:#52514e;--ink-3:#7a7974;--line:#e6e5e0;--accent:#2a78d6;--win:#0ca30c;
--s1:#2a78d6;--s2:#eb6834;--s3:#1baf7a;--s4:#eda100;--s5:#e87ba4;--s6:#008300;--s7:#4a3aa7;--s8:#e34948;--other:#b9b8b2;--heat:42,120,214}
@media (prefers-color-scheme:dark){:root:not([data-theme="light"]){color-scheme:dark;--bg:#1a1a19;--card:#222221;--ink:#ffffff;--ink-2:#c3c2b7;--ink-3:#8f8e86;--line:#383835;--accent:#3987e5;
--s1:#3987e5;--s2:#d95926;--s3:#199e70;--s4:#c98500;--s5:#d55181;--s6:#008300;--s7:#9085e9;--s8:#e66767;--other:#5c5b56;--heat:57,135,229}}
:root[data-theme="dark"]{color-scheme:dark;--bg:#1a1a19;--card:#222221;--ink:#ffffff;--ink-2:#c3c2b7;--ink-3:#8f8e86;--line:#383835;--accent:#3987e5;
--s1:#3987e5;--s2:#d95926;--s3:#199e70;--s4:#c98500;--s5:#d55181;--s6:#008300;--s7:#9085e9;--s8:#e66767;--other:#5c5b56;--heat:57,135,229}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ink);font:14px/1.45 ui-sans-serif,system-ui,-apple-system,"Segoe UI",sans-serif}
main{max-width:1180px;margin:0 auto;padding:24px 16px 64px}h1{font-size:26px;margin:0 0 4px}h2{font-size:19px;margin:40px 0 8px}h3{font-size:15px;margin:20px 0 6px}
.muted{color:var(--ink-3)}.small{font-size:12px}.strong{font-weight:600}.note{color:var(--ink-3);font-size:12px}
.banner{background:#fab21926;border:1px solid #fab219;padding:10px 12px;border-radius:8px;margin:12px 0}
nav{display:flex;flex-wrap:wrap;gap:6px 14px;margin:12px 0 0;font-size:13px}nav a{color:var(--accent);text-decoration:none}
.kpis{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:10px;margin:18px 0}.kpi{background:var(--card);border:1px solid var(--line);border-radius:10px;padding:12px}
.kpi b{display:block;font-size:24px}.kpi span{color:var(--ink-2);font-size:12px}
.card{background:var(--card);border:1px solid var(--line);border-radius:10px;padding:14px;margin:10px 0}
.scroll{overflow-x:auto}table.t{width:100%;border-collapse:collapse}.t th,.t td{padding:7px 8px;border-bottom:1px solid var(--line);text-align:left;vertical-align:top}
.t th{font-size:12px;color:var(--ink-2);font-weight:600;position:sticky;top:0;background:var(--card)}.t .num{text-align:right;font-variant-numeric:tabular-nums;white-space:nowrap}
.t.compact td,.t.compact th{padding:4px 6px;font-size:12px}.hookcell{min-width:260px}.pre{white-space:pre-wrap}
.bar{display:inline-block;height:8px;width:calc(var(--w) * .6);max-width:60%;background:var(--s1);border-radius:0 4px 4px 0;margin-right:6px;vertical-align:middle}.bar.win{background:var(--win)}
.heat{background:rgba(var(--heat),calc(var(--a) * .85));text-align:center;font-variant-numeric:tabular-nums}
.matrix th.rot{height:120px;vertical-align:bottom;white-space:nowrap}.matrix th.rot span{writing-mode:vertical-rl;transform:rotate(180deg)}
.badge{display:inline-block;font-size:10px;padding:1px 6px;border-radius:9px;border:1px solid var(--line);color:var(--ink-2);margin-left:4px}.badge.win{border-color:var(--win);color:var(--win)}
.legend{display:flex;flex-wrap:wrap;gap:6px 14px;margin:6px 0 10px;font-size:12px;color:var(--ink-2)}.lg{display:inline-flex;align-items:center;gap:5px}.sw{width:10px;height:10px;border-radius:2px;display:inline-block}
.sb-row{display:grid;grid-template-columns:minmax(120px,220px) 1fr;gap:10px;align-items:center;margin:5px 0}.sb-label{font-size:12px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.sb-bar{display:flex;gap:2px;height:20px}.seg{display:flex;align-items:center;justify-content:center;font-size:10px;color:#fff;min-width:2px;overflow:hidden}.seg:first-child{border-radius:4px 0 0 4px}.seg:last-child{border-radius:0 4px 4px 0}
.s-3,.s-4,.s-5{color:#0b0b0b}.s-1{background:var(--s1)}.s-2{background:var(--s2)}.s-3{background:var(--s3)}.s-4{background:var(--s4)}.s-5{background:var(--s5)}.s-6{background:var(--s6)}.s-7{background:var(--s7)}.s-8{background:var(--s8)}.s-other{background:var(--other)}
.grid2{display:grid;grid-template-columns:repeat(auto-fit,minmax(320px,1fr));gap:12px}details summary{cursor:pointer;color:var(--accent);font-size:12px}
a{color:var(--accent)}
@media (max-width:640px){.sb-row{grid-template-columns:1fr}.hookcell{min-width:200px}}
</style></head><body><main>
<h1>Competitor Ad Intel — ${esc(cfg.brand.name)}</h1>
<div class="muted">Generated ${esc(new Date(R.generatedAt).toUTCString())} · final score = ${Object.entries(R.weights).map(([k, v]) => `${v}×${k}`).join(' + ')} (renormalised over available signals)</div>
${ctx.offline ? '<div class="banner"><b>Offline run.</b> Claude and Jev were replaced by local heuristics, so every score and label below is a placeholder. Add API keys and re-run for real judgments.</div>' : ''}
<nav>${changes ? '<a href="#changes">What changed</a>' : ''}<a href="#brands">Competitors</a><a href="#mix">Ad mix</a><a href="#working">What's working</a><a href="#hooks">Hooks</a><a href="#panel">Persona panel</a><a href="#bodies">Primary text</a><a href="#headlines">Headlines</a><a href="#ctas">CTAs &amp; offers</a><a href="#advertorials">Advertorials</a>${remix ? '<a href="#launch">Launch list</a>' : ''}</nav>
<div class="kpis">${kpis.map(([k, v]) => `<div class="kpi"><b>${esc(v)}</b><span>${esc(k)}</span></div>`).join('')}</div>

${changesHtml}
<h2 id="brands">Competitors</h2>
<div class="card scroll"><table class="t"><thead><tr><th>Brand</th><th class="num">Creatives</th><th class="num">Ad IDs</th><th class="num">Live</th><th class="num">Winners</th><th class="num">Avg days</th><th>Their best hook</th></tr></thead><tbody>${R.breakdown.brands
    .map((b) => {
      const c = competitors.find((x) => x.name === b.brand);
      return `<tr><td>${esc(b.brand)}${c?.relation ? `<div class="muted small">${esc(c.relation)}</div>` : ''}</td><td class="num">${b.creatives}</td><td class="num">${b.adIds}</td><td class="num">${b.active}</td><td class="num">${b.winners}</td><td class="num">${b.avgDays}</td><td>${esc(truncate(b.topHook, 140))}</td></tr>`;
    })
    .join('')}</tbody></table></div>
<p class="note">Winner = still live after ${cfg.proof.winnerMinDays}+ days, or duplicated across ${cfg.proof.winnerMinVariants}+ ad IDs. Nobody keeps paying for a loser.</p>

<h2 id="mix">Ad mix — % of creatives by type</h2>
<div class="card">${typeBars}</div>
<div class="grid2">${['hookArchetype', 'angle', 'funnel', 'awareness', 'offerType', 'format', 'landingType', 'ctaButton'].map((d) => `<div class="card">${distTable(d, market)}</div>`).join('')}</div>
<h3>By brand</h3>
${['adType', 'hookArchetype', 'angle', 'funnel', 'offerType'].map((d) => `<div class="card"><h3>${esc(DIM_TITLES[d])}</h3>${brandMatrix(d, R.breakdown.brands)}</div>`).join('')}

<h2 id="working">What's working</h2>
<p class="note">Lift = average market-proof of creatives with this label ÷ market average. 1.5× means those ads run longer and get scaled harder than the typical ad.</p>
<div class="card scroll"><table class="t"><thead><tr><th>Dimension</th><th>Label</th><th class="num">Lift</th><th class="num">Winner rate</th><th class="num">Share of ads</th><th class="num">Creatives</th><th class="num">Brands</th></tr></thead><tbody>${patternRows}</tbody></table></div>
<h3>White space — over-performs, under-used</h3>
<div class="card scroll">${gapRows ? `<table class="t"><thead><tr><th>Dimension</th><th>Label</th><th class="num">Lift</th><th class="num">Share</th><th class="num">Winner rate</th></tr></thead><tbody>${gapRows}</tbody></table>` : '<p class="muted">Nothing yet.</p>'}</div>

<h2 id="hooks">Hooks — best to worst</h2>
<div class="card scroll"><table class="t"><thead><tr><th class="num">#</th><th>Hook</th><th class="num">Final</th><th class="num">Proof</th><th class="num">Jev</th><th class="num">Panel</th><th class="num">Days</th><th>Works best on</th></tr></thead><tbody>${hookRows}</tbody></table></div>
<p class="note">Top ${Math.min(N, R.hooks.length)} of ${R.hooks.length}. Everything: hooks.csv.</p>

<h2 id="panel">Persona panel — would they stop?</h2>
<div class="card">${heat}</div>

<h2 id="bodies">Primary text — best to worst</h2>
<div class="card scroll"><table class="t"><thead><tr><th class="num">#</th><th>Primary text</th><th class="num">Final</th><th class="num">Proof</th><th class="num">Jev</th></tr></thead><tbody>${textTable(R.bodies, 'text', (b) => `· ${esc(human(b.angle))} · ${b.words} words`)}</tbody></table></div>

<h2 id="headlines">Headlines — best to worst</h2>
<div class="card scroll"><table class="t"><thead><tr><th class="num">#</th><th>Headline</th><th class="num">Final</th><th class="num">Proof</th><th class="num">Jev</th></tr></thead><tbody>${textTable(R.headlines, 'headline')}</tbody></table></div>

<h2 id="ctas">CTAs &amp; offers</h2>
<div class="grid2"><div class="card scroll"><h3>Buttons</h3><table class="t compact"><thead><tr><th>Button</th><th class="num">Share</th><th class="num">Winner rate</th><th class="num">Lift</th></tr></thead><tbody>${R.buttons.map((b) => `<tr><td>${esc(b.button)}</td><td class="num">${pct(b.share)}</td><td class="num">${pct(b.winnerRate)}</td><td class="num">${num(b.lift)}×</td></tr>`).join('')}</tbody></table></div>
<div class="card scroll"><h3>Offers</h3><table class="t compact"><thead><tr><th>Offer</th><th>Type</th><th class="num">Ads</th><th class="num">Lift</th></tr></thead><tbody>${R.offers.slice(0, 30).map((o) => `<tr><td>${esc(o.offer)}<div class="muted">${esc(o.brands.join(', '))}</div></td><td>${esc(human(o.offerType))}</td><td class="num">${o.creatives}</td><td class="num">${num(o.lift)}×</td></tr>`).join('')}</tbody></table></div></div>
<div class="card scroll"><h3>CTA lines</h3><table class="t"><thead><tr><th class="num">#</th><th>Line</th><th class="num">Final</th><th class="num">Proof</th><th class="num">Jev</th></tr></thead><tbody>${textTable(R.ctaLines, 'ctaLine', (c) => `· ${esc(c.button || '')}`)}</tbody></table></div>

<h2 id="advertorials">Advertorials &amp; landing pages — best to worst</h2>
<div class="card scroll">${advRows ? `<table class="t"><thead><tr><th class="num">#</th><th>Page</th><th class="num">Final</th><th class="num">Proof</th><th class="num">Jev</th></tr></thead><tbody>${advRows}</tbody></table>` : '<p class="muted">No landing pages scraped.</p>'}</div>

${remix ? `<h2 id="launch">Launch list — new concepts for ${esc(cfg.brand.name)}</h2>
<p class="note">Written from the patterns above, graded by the same Jev rubrics and persona panel. Ready to build: launch.csv.</p>
<div class="card scroll"><table class="t"><thead><tr><th class="num">#</th><th>Concept</th><th class="num">Final</th><th class="num">Jev</th><th class="num">Panel</th><th class="num">P(stop)</th><th class="num">Policy risk</th><th>Aimed at</th></tr></thead><tbody>${launchRows}</tbody></table></div>` : ''}

${spend ? `<h2>Run cost</h2><div class="card small">Anthropic $${num(spend.anthropic.usd, 4)} (${spend.anthropic.calls} calls) · Jev $${num(spend.jev.usd, 4)} (${spend.jev.calls} calls) · Apify $${num(spend.apify.usd, 4)} (${spend.apify.runs} runs) · total $${num(spend.totalUsd, 4)}</div>` : ''}
</main></body></html>`;

  const p = ctx.writeOut('report.html', html);
  return { report: p };
}
