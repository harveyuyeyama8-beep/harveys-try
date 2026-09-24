# adintel — competitor ad intelligence

Finds every brand competing for Harvey's Coffee's buyer, pulls every ad they
run, takes each ad apart (hook, visual, on-image text, primary text,
headline, CTA, offer, proof, landing page / advertorial), ranks every
component best to worst, breaks each competitor down by ad type, shows what
is actually working, puts the best hooks in front of 15 simulated buyers,
and writes a ranked launch list of new Harvey's ads built on the winning
structures.

```
discover ─▶ harvest ─▶ decompose ─▶ score ─▶ personas ─▶ rank ─▶ remix ─▶ report
 who to      every ad,   Claude reads  Jev labels  15 persona   best→worst  new ads for   report.html
 steal from  landing     image + copy  and grades  agents +     breakdowns  Harvey's,     + CSVs
 (Jev picks  pages,      into parts    everything  Jev probs    patterns    graded the    + launch.csv
 real ones)  videos                                             white space same way
                                                                    ▲
                                              calibrate ◀── your Ads Manager results
```

## Run it

```bash
cd adintel
npm install
npm run demo          # fictional fixture data, no keys, no cost → out-demo/report.html
```

For real:

```bash
cp .env.example .env  # fill in ANTHROPIC_API_KEY, TYPESAFE_API_KEY, APIFY_TOKEN
node cli.js run       # → out/report.html, out/launch.csv, out/*.csv
```

| Command | Does |
|---|---|
| `node cli.js run` | the whole pipeline |
| `node cli.js run --from score` | resume from a stage (earlier outputs are reused) |
| `node cli.js run --skip remix` | leave stages out |
| `node cli.js harvest` | one stage |
| `node cli.js run --import ads.csv` | skip scraping; use your own export (Apify, Meta API, AdWhispr, Foreplay, any sheet) |
| `node cli.js run --offline` | local heuristics instead of Claude/Jev — plumbing test only |
| `node cli.js calibrate --results export.csv` | learn from your own ad results |
| `--max-usd 60` | raise the spend cap for this run (default `budget.maxUsd` = $40) |
| `--fresh` | ignore the cache |

Every Claude and Jev call is cached by content hash under `data/cache/`, so
re-running a stage, or grading the same hook seen on 40 ads, is paid for once.
The run stops itself when spend passes the budget. `data/spend.json` keeps the
running total.

## What each stage does

**1. discover** — Two nets. The seed list in `config.json` (each name is
resolved to a real ad-library page, so a brand that isn't advertising drops
out) and a keyword sweep of the ad library (`discover.keywords`) that finds
brands you didn't know about. Keyword search is mostly junk — a "coffee
subscription" search returns skincare and romance-novel spam — so **Jev**
classifies every advertiser as *direct / adjacent / unrelated* from a sample
of their ads. Keepers are ranked by live ad count. → `data/competitors.json`
(and `competitors_rejected.json`, so you can see what was thrown out).

**2. harvest** — Every ad each competitor has run (active and stopped),
folded into unique *creatives*: brands run one creative under many ad IDs,
and that count is a scaling signal. Landing pages are fetched most-linked
first. Optional video transcription (`harvest.transcribeVideos`) gets the
spoken hook of UGC. Each harvest also diffs against the last one: **new
launches** (what they're testing this week) and **creatives killed young**
(what lost).

**3. decompose** — Claude Haiku looks at the image or first video frame and
the copy and returns the components verbatim: hook (and where it came from:
spoken / on-screen / image text / first line), what the viewer sees, all text
on the image, body, headline, CTA button, CTA line, offer, proof elements, the
big idea, the claimed mechanism, the target customer.

**4. score (Jev)** — Every decision is a Jev call: typed questions in,
calibrated probabilities out, ~$0.0004 each.
- *Labels* (Jev `choice`): ad type (29 buckets — UGC testimonial, native
  static, founder story, us-vs-them, BOF discount, advertorial driver, quiz
  driver…), hook archetype (21), angle (14), funnel stage, awareness level,
  offer type, landing page type. All in `lib/taxonomy.js`; edit a
  description to sharpen a decision, add a key to add a bucket.
- *Rubrics* (Jev `score`, 5 levels): hook (scroll-stop, curiosity,
  specificity, clarity, emotion, relevance, credibility, novelty), primary
  text, headline, CTA, advertorial.
- *Flags* (Jev `noul`): Meta policy risk, looks-like-UGC, and "could
  Harvey's truthfully run this structure?"

**How the weighting works.** Each rubric answer is Jev's
probability-weighted position on the scale (e.g. 2.7 of 4), normalised to
0–1 and **shrunk toward 0.5 by (1 − confidence)**, so an answer Jev is unsure
of counts for less. Criteria are then combined with `rubricWeights` in
`config.json`. Those weights are what `calibrate` learns.

**5. personas** — The top 60 hooks (`personas.topK`, chosen by proof + Jev
so the panel only sees contenders) go in front of the 15 buyers in
`personas.json` — Busy Keurig Mom, Daily Café Habit, Pour-Over Hobbyist,
Folgers Loyalist Retiree, Subscription-Burned Skeptic, Proud Parent of a
Teen, and nine more, each with a market-share weight. Each persona is its
own sub-agent (a Claude Haiku call that becomes that person and scrolls a
feed of the ads): gut reaction, objection, what would make them buy. Jev then
turns each persona × ad × reaction into three calibrated probabilities:

```
P(stop scrolling)  ×  P(tap through | stopped)  ×  P(buy this week | tapped)  =  expected buyers per impression
```

weighted across personas by market share. Also recorded: which personas a
hook works best and worst on, and how polarising it is.
`personas.engine`: `agents+jev` (default), `jev` (cheapest, no agents),
`agents` (agents' own 0–10 ratings).

**6. rank** — Everything best to worst.

```
final = 0.40 × proof  +  0.35 × Jev  +  0.25 × persona     (config.final.weights; renormalised over the signals an item has)
```

*Proof* is the competitor's own wallet, free to compute: days live
(log-scaled, capped at 90), ad IDs sharing the creative (scale), still
running today — blended with the creative's percentile inside its own brand
so a giant's every ad doesn't look like a winner. **Winner** = live 30+ days
or duplicated across 5+ ad IDs.

Ranked lists: hooks, primary text, headlines, CTA lines, CTA buttons (by
lift), offers, advertorials / landing pages (a page many winning ads point at
is a page that converts). Breakdowns: % of every brand's ads by type,
archetype, angle, funnel, awareness, offer, format, landing type and CTA —
for all ads and winners only. **Patterns**: each label's lift = its average
proof ÷ the market's. **White space**: labels with lift ≥ 1.15× that under
10% of ads use.

**7. remix** — Claude Opus gets the rankings, patterns, white space, the
panel's most common objections, Harvey's facts (`brand.facts` — the only
claims it may use) and the live advertorials in `../src/content/advertorials`,
and writes 30 new concepts. It borrows structures, never sentences, and cites
the hook or pattern each concept came from. Every concept is graded by the
same Jev rubrics and the same 15-persona panel, penalised for policy risk,
and written to `out/launch.csv` with UTM-tagged landing URLs
(`utm_content=<concept id>` — name the ad the same in Ads Manager).

**8. report** — `out/report.html` (self-contained, light/dark, phone-safe)
and a CSV per table.

**calibrate** — After the launch list has spent money, export from Ads
Manager (ad name, impressions, link clicks, purchases, spend) and run
`node cli.js calibrate --results export.csv`. For every hook-rubric line,
and for Jev vs the persona panel, it measures how well the score ranked your
real results (Spearman; purchases per impression once there are 20+
purchases, CTR before that) and moves the weights toward what predicted
money. The step size grows with sample size. Learned weights land in
`config.calibrated.json`, which overrides `config.json` from then on. Rows
with a `hook` column but no matching concept (your older ads) are graded on
the spot.

## Sources

| `harvest.source` | Coverage | Needs |
|---|---|---|
| `apify` (default) | Full US creative: copy, headline, CTA, landing URL, images, video, collation count | `APIFY_TOKEN`; actor set in `harvest.apify.actor` |
| `meta` | Official Ad Library API. Commercial ads only with EU/UK delivery, no media or CTA | `META_ADLIB_TOKEN` from an identity-verified account |
| `--import` | Anything you export: Apify / Meta API dumps, AdWhispr, Foreplay, Motion, a sheet | nothing |

Import columns are matched loosely (`brand`, `body`/`primary_text`,
`headline`, `cta`, `link`, `start`, `end`, `status`, `image`, `video`,
`transcript`, `hook`…) — see `sources/normalize.js`.

## Cost

Rough, for ~3,000 unique creatives across 20 brands:

| Stage | Model | ≈ |
|---|---|---|
| decompose | Haiku + image | $12 (`decompose.vision: false` ≈ $5) |
| score | Jev, ~7 calls per creative | $7 |
| personas | 60 Haiku agent calls + 900 Jev | $1.20 |
| remix | Opus, one call + panel | $1.50 |
| **total** | | **≈ $22** + Apify |

Second run on the same ads: near zero (cache).

## Files

```
cli.js              entry point
config.json         brand facts, seeds, keywords, weights, models, budget
personas.json       the 15 buyers and their market weights
lib/taxonomy.js     every label and rubric
lib/jev.js          Jev client, rubric weighting, offline stand-in
lib/claude.js       Claude client (cheap structured calls, streamed strategist)
lib/proof.js        market-proof score
sources/            apify, meta, importer, landing pages, transcription, normalisation
stages/             one file per stage
fixtures/           fictional demo data
test/               node --test
```

## Next moves

- **Run it weekly** (`node cli.js run` on a cron). The launched/killed diff is
  the fastest read on what competitors are testing and what's losing.
- **TikTok**: add a `sources/tiktok.js` for Creative Center top ads; the rest
  of the pipeline is platform-agnostic.
- **Push the launch list to Meta as paused ads** for review, named by concept
  ID so `calibrate` can read the results back.
- **Generate the statics**: `visual` + `onImageText` on each concept is
  already a brief for an image model.
- **Close the loop through Shopify**: purchases by `utm_content` are a better
  calibration target than Meta-reported purchases.
