/**
 * Headless-browser plumbing for sources whose specs never reach the HTML.
 *
 * Unilumin and INFiLED both ship a product page whose marketing copy is
 * server-rendered and whose specification table is written by JavaScript
 * afterwards, so `fetchText` returns a page with every label and no values.
 * These sources ask for a real browser instead, and everything else about the
 * source interface is unchanged: they still export `brand` and `scrape()`.
 *
 * Playwright is a devDependency and the browser binary is not, so install it
 * once before running these sources:
 *
 *   npx playwright install chromium
 *
 * Two kinds of failure matter here and they are reported separately, because
 * only one of them means the scraper needs fixing:
 *
 *   TransportError  the page never arrived — DNS, TLS, a timeout, a bot
 *                   challenge that never cleared. Nothing was learned about
 *                   the site, so the run is incomplete, not wrong.
 *   a shape failure the page arrived and the spec container was not in it.
 *                   That is the site changing under the parser.
 */

const DEFAULT_UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';

export class TransportError extends Error {
  constructor(url, attempts, cause) {
    super(`${url} did not load after ${attempts} attempts: ${cause}`);
    this.name = 'TransportError';
    this.url = url;
  }
}

/** Playwright is optional, so say plainly what is missing rather than throwing a resolve error. */
async function loadPlaywright() {
  try {
    return (await import('playwright')).chromium;
  } catch (err) {
    throw new Error(
      'This source needs a headless browser. Run `npm install` and then ' +
        `\`npx playwright install chromium\`. (${err.message})`
    );
  }
}

/**
 * Open one browser for a whole source run. Reusing a single context keeps
 * whatever cookies a site hands out, which is what gets past the interstitial
 * some of these sites put in front of a first visit.
 */
export async function openBrowser({ log = console.log, userAgent = DEFAULT_UA } = {}) {
  const chromium = await loadPlaywright();
  const browser = await chromium.launch({
    // Containers and CI images rarely have user namespaces enabled; this is a
    // throwaway browser reading public pages, so the sandbox buys nothing.
    args: ['--no-sandbox', '--disable-dev-shm-usage'],
  });
  const context = await browser.newContext({ userAgent, viewport: { width: 1440, height: 2400 } });
  // Images and fonts are most of the bytes on these pages and none of the specs.
  await context.route('**/*', (route) =>
    ['image', 'media', 'font'].includes(route.request().resourceType())
      ? route.abort()
      : route.continue()
  );
  const page = await context.newPage();

  return {
    page,
    /**
     * Load `url` and hand back the page once `ready` is on it.
     *
     * `ready` is a selector that marks the page as having finished drawing.
     * Waiting for it rather than for a network event is what separates "the
     * page is still loading" from "the page loaded and what I wanted is not on
     * it" — and which of those it is depends on what is being loaded, so the
     * caller says:
     *
     *   requireReady: false  a product page. Missing means the spec table is
     *     (default)          gone, which is the caller's shape failure to
     *                        report, not something a retry can fix.
     *   requireReady: true   an index page. Missing means the menu did not
     *                        draw, and there is nothing to report but a retry.
     */
    async visit(
      url,
      { ready = null, requireReady = false, attempts = 4, settleMs = 1500, timeout = 45_000 } = {}
    ) {
      let last = 'no attempt made';
      for (let attempt = 1; attempt <= attempts; attempt++) {
        try {
          const response = await page.goto(url, { waitUntil: 'domcontentloaded', timeout });
          const status = response?.status() ?? 0;
          // A bot interstitial answers 2xx and then navigates itself away once
          // it is satisfied, which takes a few seconds and does not always
          // happen on the first load. Sitting through it is the browser
          // behaving like a browser; nothing here answers the challenge.
          for (let i = 0; i < 10 && /sgcaptcha|challenge/i.test(page.url()); i++) {
            await page.waitForTimeout(3000);
          }
          if (/sgcaptcha|challenge/i.test(page.url())) {
            last = 'bot interstitial did not clear';
          } else if (status >= 400) {
            last = `HTTP ${status}`;
          } else {
            const seen = ready
              ? await page
                  .waitForSelector(ready, { timeout: 15_000 })
                  .then(() => true)
                  .catch(() => false)
              : true;
            await page.waitForTimeout(settleMs);
            // The egress path in front of some of these sites answers with a
            // stub body rather than an error; a page this small never held a
            // spec table.
            const html = await page.content();
            if (html.length < 5000) last = `page body was only ${html.length} bytes`;
            else if (requireReady && !seen) last = `loaded without ${ready}`;
            else return page;
          }
        } catch (err) {
          last = err.message.split('\n')[0];
        }
        log(`  retry ${attempt}/${attempts} ${url}: ${last}`);
        await page.waitForTimeout(2000 * attempt);
      }
      throw new TransportError(url, attempts, last);
    },
    async close() {
      await context.close();
      await browser.close();
    },
  };
}
