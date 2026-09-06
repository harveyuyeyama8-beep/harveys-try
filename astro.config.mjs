// @ts-check
import { defineConfig } from 'astro/config';

// Static output. Cloudflare Pages serves the built files from dist/, and the
// dynamic bits live in functions/ as Pages Functions — they run at the edge
// and are deployed alongside the static assets automatically.
export default defineConfig({
  site: 'https://try.harveyscoffee.shop',
  output: 'static',
  trailingSlash: 'ignore',
  build: {
    format: 'directory',
  },
  // Marked handles Markdown inside content blocks; Astro's own pipeline
  // handles anything written as a page body.
  markdown: {
    shikiConfig: { theme: 'github-light' },
  },
});
