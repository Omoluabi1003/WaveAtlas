import assert from 'node:assert/strict';
import { chromium } from '@playwright/test';

const base = process.env.WAVEATLAS_TEST_URL || 'http://127.0.0.1:3012';
const a = 'ariyo-ai-premier-935-fm-ibadan';
const b = 'ariyo-ai-agidigbo-887-fm-ibadan';
const browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || '/usr/bin/chromium', args: ['--no-sandbox', '--disable-dev-shm-usage', '--enable-unsafe-swiftshader'] });
try {
  for (const mobile of [false, true]) {
    const context = await browser.newContext({ viewport: mobile ? { width: 390, height: 844 } : { width: 1366, height: 900 }, isMobile: mobile });
    await context.addInitScript(({ a }) => {
      sessionStorage.setItem('waveatlas:splash-seen', 'true');
      sessionStorage.setItem('waveatlas:arrival-completed', 'true');
      localStorage.setItem('waveatlas:last-station-id', a);
      window.__station = null; window.__shares = []; window.__copies = []; window.__playCalls = 0;
      window.addEventListener('waveatlas:station-context', event => { window.__station = event.detail; });
      HTMLMediaElement.prototype.play = function () { window.__playCalls++; return Promise.resolve(); };
      Object.defineProperty(navigator, 'share', { configurable: true, value: async payload => { window.__shares.push(payload); } });
      Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async url => { window.__copies.push(url); } } });
    }, { a });
    await context.route('**/*', route => {
      const url = new URL(route.request().url());
      if (url.pathname === '/_next/image') return route.fulfill({ status: 200, body: '' });
      if (url.pathname === '/api/world-context') return route.fulfill({ json: null });
      if (url.pathname === '/api/public-signals') return route.fulfill({ json: { layers: {} } });
      if (url.origin !== base && url.protocol.startsWith('http')) return route.fulfill({ status: 200, body: '' });
      return route.continue();
    });
    const page = await context.newPage();
    page.setDefaultTimeout(20000);
    for (const id of [a, b]) {
      console.log('Checking', mobile ? 'mobile' : 'desktop', id);
      await page.goto(`${base}/station/${id}`, { waitUntil: 'domcontentloaded', timeout: 120000 });
      await page.waitForFunction(id => window.__station?.station_uuid === id, id, { timeout: 30000 });
      assert.equal(await page.evaluate(() => window.__playCalls), 0, 'Shared links must wait for Play');
      const name = await page.evaluate(() => window.__station.name);
      assert.equal(await page.locator('meta[property="og:title"]').getAttribute('content'), `${name} | WaveAtlas`);
      const share = page.getByRole('button', { name: `Share ${name}`, exact: true }).filter({ visible: true }).first();
      await share.click();
      const payload = await page.evaluate(() => window.__shares.at(-1));
      assert.equal(payload.url, `https://wave-atlas.vercel.app/station/${id}`);
      await page.evaluate(() => { Object.defineProperty(navigator, 'share', { value: undefined, configurable: true }); });
      await share.click();
      assert.equal(await page.evaluate(() => window.__copies.at(-1)), payload.url);
      await page.waitForTimeout(1200);
      assert.equal(await page.evaluate(() => window.__station.station_uuid), id);
    }
    await page.goto(`${base}/?station=${b}`, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(id => window.__station?.station_uuid === id, b);
    assert.equal(await page.evaluate(() => window.__playCalls), 0);
    // Selecting A and returning to the same B URL must trigger resolution again.
    await page.evaluate(id => { history.pushState({}, '', `/station/${id}`); dispatchEvent(new PopStateEvent('popstate')); }, a);
    await page.waitForFunction(id => window.__station?.station_uuid === id, a);
    await page.goBack({ waitUntil: 'domcontentloaded' });
    await page.waitForFunction(id => window.__station?.station_uuid === id, b);
    await page.goto(`${base}/station/not-a-real-waveatlas-station`, { waitUntil: 'domcontentloaded' });
    await page.getByText('This signal is not in the Atlas.').waitFor();
    assert.equal(await page.getByRole('button', { name: /^Share / }).count(), 0);
    await context.close();
    console.log(`${mobile ? 'Mobile' : 'Desktop'}: exact restoration, persisted-state precedence, native share, clipboard, metadata, silent hydration, history and missing-station checks passed`);
  }
} finally { await browser.close(); }
