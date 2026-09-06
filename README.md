# try.harveyscoffee.shop

Advertorial landing pages on Cloudflare. Astro 5 for the site, Sveltia CMS at
`/admin` for editing, Cloudflare Pages Functions for the tracking that runs at
the edge.

Nothing here is a hand-edited HTML file. A page is a **list of blocks** —
prose, photo, CTA, comparison table, steps, quiz card, press strip, reviews,
FAQ — that you add, remove and reorder. The layout renders each block with the
right component. That's what makes a second and third advertorial cost you
twenty minutes instead of a rebuild.

```
src/content/advertorials/*.md   ← the pages. frontmatter only, no HTML
src/content.config.ts           ← what a block is allowed to contain
src/components/                 ← one component per block type
src/layouts/Advertorial.astro   ← renders blocks in order
src/site.config.ts              ← site-wide: URLs, tracking IDs, footer, legal
src/styles/theme.css            ← every visual decision, in one file
public/admin/                   ← the CMS
functions/go.js                 ← click tracker + redirect
functions/api/event.js          ← page-event beacon
```

---

## 1. What you need first

- A **GitHub account**. Free. The CMS commits your edits to a repo — that's
  how a browser edit becomes a live page.
- A **Cloudflare account**. Free.
- Access to **Wix DNS** for harveyscoffee.shop.

You don't need to install anything on your computer for the normal workflow.
Everything after the first push happens in a browser.

## 2. Optional: run it locally

Only if you want to preview before pushing.

```bash
npm install
npm run dev          # http://localhost:4321
```

`npm run dev` runs Astro alone, so `/go` and `/api/event` return 404 — those
are Cloudflare Functions. To exercise them too:

```bash
npm run build
npx wrangler pages dev dist
```

Copy `.env.example` to `.dev.vars` first if you want the Meta forwarding to
fire locally.

## 3. Push it to GitHub

Create an empty repo — call it `harveys-try` — then from this folder:

```bash
git init
git add .
git commit -m "Advertorial site"
git branch -M main
git remote add origin https://github.com/YOUR-USERNAME/harveys-try.git
git push -u origin main
```

`.gitignore` already keeps `node_modules`, `dist` and any secrets out.

## 4. Connect Cloudflare Pages

Cloudflare dashboard → **Workers & Pages** → **Create** → **Pages** →
**Connect to Git** → pick the repo.

Build settings:

| Field | Value |
|---|---|
| Framework preset | Astro |
| Build command | `npm run build` |
| Build output directory | `dist` |
| Root directory | *(leave blank)* |

Save and deploy. It builds in about a minute and goes live at
`harveys-try.pages.dev`. Check it there before touching DNS.

From now on **every push to `main` rebuilds and redeploys automatically** —
including the commits the CMS makes when you hit Publish. That's the whole
loop.

## 5. Point try.harveyscoffee.shop at it

Two halves. Cloudflare first, then Wix.

**Cloudflare:** project → **Custom domains** → **Set up a custom domain** →
enter `try.harveyscoffee.shop`. It will tell you it can't find the domain in
your account (correct — DNS is at Wix) and show you a CNAME target,
`harveys-try.pages.dev`.

**Wix:** Domains → harveyscoffee.shop → **DNS Records** → **Add Record**:

```
Type:  CNAME
Host:  try
Value: harveys-try.pages.dev
TTL:   default
```

Leave the existing `@` A record and the `www` CNAME alone — those keep the
store up. This is exactly the same shape as the `blog` record.

Go back to the Cloudflare custom-domain screen. It verifies within a few
minutes and issues the certificate itself. Nothing else to configure.

**Rollback is one action:** delete the `try` CNAME at Wix. The storefront never
routes through this site either way.

## 6. Turn on the CMS

This is the part with the most steps, and you only do it once.

**a. Deploy the OAuth worker.** GitHub won't let a browser page log in
directly; something server-side has to hold the client secret. Sveltia ships a
Cloudflare Worker for exactly this:

<https://github.com/sveltia/sveltia-cms-auth>

Deploy it to your Cloudflare account. Note the URL it gives you —
`https://sveltia-cms-auth.<your-subdomain>.workers.dev`.

**b. Register a GitHub OAuth app.** <https://github.com/settings/applications/new>

- Application name: anything
- Homepage URL: `https://try.harveyscoffee.shop`
- **Authorization callback URL:** `<YOUR_WORKER_URL>/callback`

Save the **Client ID** and generate a **Client Secret**.

**c. Give the worker its variables.** Worker → Settings → Variables:

| Name | Value |
|---|---|
| `GITHUB_CLIENT_ID` | from step b |
| `GITHUB_CLIENT_SECRET` | from step b — click **Encrypt** |
| `ALLOWED_DOMAINS` | `try.harveyscoffee.shop` |

`ALLOWED_DOMAINS` matters. Without it, anyone who finds your worker can use it
to start a GitHub login flow.

**d. Point the CMS at both.** Edit `public/admin/config.yml`:

```yaml
backend:
  name: github
  repo: YOUR-USERNAME/harveys-try
  branch: main
  base_url: https://sveltia-cms-auth.YOUR-SUBDOMAIN.workers.dev
```

Commit and push. Then open `https://try.harveyscoffee.shop/admin`, sign in with
GitHub, and you're editing. Publish writes a commit; Cloudflare rebuilds; the
change is live in about a minute.

The same worker works for the blog — that was the open item on its list. Point
its `config.yml` at the same `base_url` and add `blog.harveyscoffee.shop` to
`ALLOWED_DOMAINS`.

## 7. Tracking

Two layers. The browser layer feeds the ad platforms. The edge layer is the one
that actually counts, because it runs whether or not a pixel loaded.

### Browser side

Fill in `src/site.config.ts`:

```ts
ga4Id: 'G-XXXXXXXXXX',
metaPixelId: '1234567890123456',
```

Leave either blank and that script never loads at all.

**One thing you must do or attribution breaks.** This page and the quiz are
different origins. GA4 → Admin → Data Streams → your web stream → Configure tag
settings → **Configure your domains** → add both `harveyscoffee.shop` and
`try.harveyscoffee.shop`. Without it GA4 logs the quiz visit as a referral from
your own advertorial and you lose the path from ad to subscription.

### Edge side

In Cloudflare: project → **Settings** → **Variables and Secrets**. Add these to
**both** Production and Preview:

| Name | Type | Value |
|---|---|---|
| `META_PIXEL_ID` | Variable | same pixel ID |
| `META_ACCESS_TOKEN` | **Secret** | from Events Manager → your pixel → Settings → Conversions API → Generate access token |
| `META_API_VERSION` | Variable | current Graph API version, e.g. `v25.0` |
| `META_TEST_EVENT_CODE` | Variable | optional, while testing |
| `DISCOUNT_CODE` | Variable | optional — set it and every CTA link self-applies the code |

The access token must be a **Secret**, not a Variable. A Variable is readable
in the dashboard forever; a Secret is write-only after you save it. It must
never go in the repo.

Then add the **Analytics Engine binding**: project → Settings → Functions →
Analytics Engine bindings → variable name `AE`, dataset `harveys_try`. (It's
also declared in `wrangler.toml`, but the dashboard is the reliable path for a
Git-connected project.)

### How a click actually flows

1. Someone clicks a CTA. The href is `/go?to=quiz&pos=cta-3` — your own domain,
   nothing third-party to block.
2. The browser generates a one-time `event_id`, appends it to that URL, and
   fires the Meta pixel with the same ID.
3. `functions/go.js` resolves `quiz` to the real destination **from a
   server-side allowlist** — never from the query string, or you'd have built
   an open redirect that spammers will find and use to launder links through
   your domain.
4. It writes a row to Analytics Engine, fires the Conversions API with that
   same `event_id`, and 302s the visitor onward. Meta sees two reports of one
   event, matches the IDs, and counts it once.
5. UTMs ride along: `utm_content=cta-3` tells you which CTA on the page earned
   the click.

The tracking calls run inside `waitUntil`, so nobody waits on them. If a
binding or token is missing, the functions skip that step silently rather than
failing the redirect — tracking must never be able to break the page.

## 8. Reading the data

Analytics Engine is queried with SQL over the Cloudflare API. Column names are
positional: `index1` is the CTA position, `blob1`–`blob6` are event, position,
destination, country, referrer, extra.

```sql
SELECT blob2 AS cta, COUNT() AS clicks
FROM harveys_try
WHERE blob1 = 'quiz_start_click'
  AND timestamp > NOW() - INTERVAL '7' DAY
GROUP BY cta
ORDER BY clicks DESC
```

That tells you which CTA position is doing the work — the thing you can't learn
from GA4 without a lot of setup. Pair it with:

```sql
SELECT blob6 AS depth, COUNT() AS hits
FROM harveys_try
WHERE blob1 = 'scroll_depth'
GROUP BY depth
```

to see where readers quit, which is where the page needs work.

## 9. Publishing a new advertorial

In `/admin`: **Advertorials** → **New Advertorial**. Fill in the header fields,
write the CTA once, then build the page by adding blocks in order.

Or in the repo: copy `roasted-to-order.md`, rename it, edit the frontmatter.
The filename becomes the URL.

- `draft: true` — not built at all
- `primary: true` — this is what the root URL serves. Set it on exactly one.
  Flipping it swaps where your ads land without touching the ad.

Every other advertorial is still reachable at `/its-filename`, which is how you
run a second angle against the same audience.

## 10. Adding a new block type

Four files, in this order:

1. `src/content.config.ts` — add a variant to the `blocks` union
2. `src/components/YourBlock.astro` — the markup
3. `src/layouts/Advertorial.astro` — a `case` in the switch, and add the name
   to `NARROW` if it belongs in the reading column
4. `public/admin/config.yml` — a matching entry under `blocks: types:`

If the schema and the CMS config drift apart, the CMS will happily save
something the build then rejects. Change both together.

## 11. Before you send traffic

- **The guarantee line is empty on purpose.** `cta.risk` renders nothing until
  you fill it. Your refund policy excludes perishable goods while the homepage
  promises "love it or your money back." Make those agree first — a guarantee
  that contradicts the policy page is worse than no guarantee.
- **Cancellation** is the first FAQ. Answer it in one sentence, no hedging, and
  only write "cancel anytime" if it's genuinely one click.
- **Press quotes are placeholders.** Paste the real sentence from each article.
- **Reviews are empty.** Real ones only — a fabricated review isn't just risky,
  it's illegal.
- **`noindex` is on deliberately.** A paid landing page competing with your own
  store in search hurts you. Turn it off only if you decide this should rank.
- The **"Advertisement / Paid content"** bar stays. It's what makes this an
  honest advertorial rather than a page pretending to be journalism.

## 12. When something breaks

| Symptom | Cause |
|---|---|
| Build fails after a CMS edit | Schema mismatch. The build log names the field; fix `content.config.ts` or `config.yml` so they agree. |
| `/admin` loads but login fails | `ALLOWED_DOMAINS` on the worker, or the OAuth callback URL doesn't end in `/callback`. |
| `/go` 404s | Functions didn't deploy. `functions/` must be at the repo root, not inside `src/` or `public/`. |
| Clicks aren't in Analytics Engine | The `AE` binding isn't set on that environment. Preview and Production are separate. |
| Meta shows duplicate events | The browser pixel and the edge are sending different `event_id`s. Both come from the same click handler; check nothing is overwriting the `eid` parameter. |
| Custom domain stuck on "verifying" | The Wix CNAME hasn't propagated, or `Host` was entered as the full domain instead of just `try`. |
