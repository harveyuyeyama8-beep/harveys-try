/**
 * Where the ads send people. Advertorials, listicles, quizzes and PDPs are
 * half the funnel; a landing page that many long-running ads point at is a
 * page that converts.
 *
 * Plain fetch, no browser: most advertorials are server-rendered. A
 * JS-only page comes back thin and is flagged `thin: true`.
 */
import { truncate } from '../lib/util.js';

const UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';

const decode = (s) =>
  s
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&rsquo;|&lsquo;/g, "'")
    .replace(/&ldquo;|&rdquo;/g, '"')
    .replace(/&mdash;/g, '—')
    .replace(/&ndash;/g, '–')
    .replace(/&hellip;/g, '…')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)));

const textOf = (html) =>
  decode(
    html
      .replace(/<(script|style|noscript|svg|iframe)[\s\S]*?<\/\1>/gi, ' ')
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/(p|h[1-6]|li|div|section|article|blockquote)>/gi, '\n')
      .replace(/<[^>]+>/g, ' '),
  )
    .replace(/[ \t]+/g, ' ')
    .replace(/\n\s*\n+/g, '\n')
    .trim();

const all = (html, re) => [...html.matchAll(re)].map((m) => textOf(m[1])).filter(Boolean);

export async function fetchLanding(url) {
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': UA, Accept: 'text/html' },
      redirect: 'follow',
      signal: AbortSignal.timeout(20_000),
    });
    if (!res.ok) return { url, finalUrl: res.url, error: `HTTP ${res.status}` };
    const html = await res.text();
    const text = textOf(html);
    const headings = all(html, /<h[1-3][^>]*>([\s\S]*?)<\/h[1-3]>/gi);
    const buttons = all(html, /<(?:button|a)[^>]*class="[^"]*(?:btn|button|cta)[^"]*"[^>]*>([\s\S]*?)<\/(?:button|a)>/gi);
    return {
      url,
      finalUrl: res.url,
      title: textOf((html.match(/<title[^>]*>([\s\S]*?)<\/title>/i) || [])[1] || ''),
      h1: headings[0] || '',
      headings: headings.slice(0, 30),
      ctas: [...new Set(buttons)].slice(0, 20),
      words: text.split(/\s+/).length,
      signals: {
        numberedHeadings: headings.filter((h) => /^\s*(#?\d+[.):]|reason \d|no\.\s*\d)/i.test(h)).length,
        byline: /\bby\s+[A-Z][a-z]+\s+[A-Z][a-z]+/.test(text.slice(0, 2000)),
        advertorialLabel: /\b(advertorial|sponsored|paid (content|post)|advertisement)\b/i.test(text),
        addToCart: /add to (cart|bag)/i.test(html),
        price: /\$\s?\d+(\.\d{2})?/.test(text),
        quiz: /\bquiz\b|question \d of \d/i.test(text),
        reviews: /\b\d[\d,]*\+?\s*(reviews|ratings)\b/i.test(text),
      },
      text: truncate(text, 12_000),
      thin: text.length < 600,
    };
  } catch (e) {
    return { url, error: e.message };
  }
}
