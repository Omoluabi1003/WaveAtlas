import assert from 'node:assert/strict';
import { chromium } from '@playwright/test';

const base = process.env.WAVEATLAS_TEST_URL || 'http://127.0.0.1:3000';
const browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || '/usr/bin/chromium', args: ['--no-sandbox', '--enable-unsafe-swiftshader'] });
try {
  for (const [width, height, reducedMotion] of [[1440, 900, 'no-preference'], [390, 844, 'no-preference'], [375, 667, 'reduce']]) {
    const context = await browser.newContext({ viewport: { width, height }, reducedMotion, isMobile: width < 600 });
    await context.addInitScript(() => {
      sessionStorage.setItem('waveatlas:splash-seen', 'true');
      sessionStorage.setItem('waveatlas:arrival-completed', 'true');
      HTMLMediaElement.prototype.play = () => Promise.resolve();
      window.__orbital = { frames: 0, invalid: [] };
      for (const method of ['arc', 'ellipse', 'createRadialGradient', 'createLinearGradient']) {
        const original = CanvasRenderingContext2D.prototype[method];
        CanvasRenderingContext2D.prototype[method] = function (...args) {
          if (args.some(value => typeof value === 'number' && !Number.isFinite(value))) window.__orbital.invalid.push(method);
          return original.apply(this, args);
        };
      }
      const clear = CanvasRenderingContext2D.prototype.clearRect;
      CanvasRenderingContext2D.prototype.clearRect = function (...args) {
        if (this.canvas.getAttribute('aria-label') === 'Interactive audio tourism globe') window.__orbital.frames++;
        return clear.apply(this, args);
      };
    });
    await context.route('**/*', route => {
      const url = new URL(route.request().url());
      if (url.pathname === '/api/public-signals') return route.fulfill({ json: { layers: {} } });
      if (url.pathname === '/api/world-context') return route.fulfill({ json: null });
      if (url.origin !== base && url.protocol.startsWith('http')) return route.fulfill({ status: 200, body: '' });
      return route.continue();
    });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => { if (/hydration|render error/i.test(message.text())) errors.push(message.text()); });
    await page.goto(`${base}/station/ariyo-ai-premier-935-fm-ibadan`, { waitUntil: 'domcontentloaded', timeout: 120000 });
    const canvas = page.locator('canvas[aria-label="Interactive audio tourism globe"]:visible');
    await canvas.waitFor({ timeout: 60000 });
    await page.waitForFunction(() => window.__orbital.frames > 12, undefined, { timeout: 60000 });
    await page.waitForTimeout(4500);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, 'No horizontal overflow');
    const before = await page.evaluate(() => window.__orbital.frames);
    const box = await canvas.boundingBox();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height * 0.45);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2 + 45, box.y + box.height * 0.45 + 15, { steps: 10 });
    await page.mouse.up();
    await page.waitForTimeout(500);
    assert.ok(await page.evaluate(() => window.__orbital.frames) > before, 'Globe continues rendering after dragging');
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.setViewportSize({ width: height, height: width });
    await page.waitForTimeout(500);
    await page.setViewportSize({ width, height });
    await page.waitForTimeout(500);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    assert.deepEqual(await page.evaluate(() => window.__orbital.invalid), [], 'All Canvas geometry is finite');
    assert.deepEqual(errors, [], 'No hydration or renderer exceptions');
    await page.screenshot({ path: `/tmp/orbital-${width}.png` });
    console.log(`PASS ${width}x${height} ${reducedMotion}: canvas, drag, resize/orientation, motion preference change, overflow, hydration`);
    await context.close();
  }
} finally { await browser.close(); }
