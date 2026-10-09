import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdir } from 'node:fs/promises';
import { chromium } from '@playwright/test';

const base = process.env.WAVEATLAS_TEST_URL || 'http://127.0.0.1:3011';
const mode = process.env.WAVEATLAS_JOURNEY_SERVER_MODE === 'production' ? 'start' : 'dev';
const server = process.env.WAVEATLAS_JOURNEY_START_SERVER === '1' ? spawn(process.execPath, ['node_modules/next/dist/bin/next', mode, ...(mode === 'dev' ? ['--webpack'] : []), '--hostname', '127.0.0.1', '--port', String(new URL(base).port)], { stdio: ['ignore', 'pipe', 'pipe'] }) : null;
if (server) {
  server.stdout.on('data', data => { if (String(data).includes('Ready')) console.log('Journey test server ready'); });
  server.stderr.on('data', data => process.stderr.write(data));
  for (let i = 0; i < 60; i++) {
    try { await fetch(base, { signal: AbortSignal.timeout(2000) }); break; } catch { await new Promise(resolve => setTimeout(resolve, 1000)); }
  }
}
const browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || undefined, headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage', '--enable-unsafe-swiftshader'] });
const errors = [];
const route = { from: { label: 'Lagos, Nigeria', lat: 6.5244, lng: 3.3792, countryCode: 'NG' }, to: { label: 'Dubai, United Arab Emirates', lat: 25.2048, lng: 55.2708, countryCode: 'AE' } };
const fixture = { id: 'journey-fixture', station_uuid: 'journey-fixture', name: 'Journey Lagos Radio', url: `${base}/journey-audio.wav`, country: 'Nigeria', country_code: 'NG', city: 'Lagos', latitude: 6.5244, longitude: 3.3792, language: 'English', tags: ['music'], codec: 'WAV', bitrate: 128, votes: 0, click_count: 0, health_score: 95, is_active: true, last_check_ok: true, last_checked_at: '2026-10-09', failure_count: 0, response_time_ms: 10 };
const wav = Buffer.alloc(44 + 8000 * 2 * 10);
wav.write('RIFF'); wav.writeUInt32LE(wav.length - 8, 4); wav.write('WAVEfmt ', 8); wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20); wav.writeUInt16LE(1, 22); wav.writeUInt32LE(8000, 24); wav.writeUInt32LE(16000, 28); wav.writeUInt16LE(2, 32); wav.writeUInt16LE(16, 34); wav.write('data', 36); wav.writeUInt32LE(wav.length - 44, 40);
const context = await browser.newContext({ viewport: { width: 1366, height: 900 } });
await context.addInitScript(() => {
  sessionStorage.setItem('waveatlas:splash-seen', 'true'); sessionStorage.setItem('waveatlas:arrival-completed', 'true');
  window.__played = [];
  window.addEventListener('waveatlas:station-playing', event => window.__played.push(event.detail?.station?.name));
});
await context.route('**/*', async request => {
  const url = new URL(request.request().url());
  if (url.pathname === '/journey-audio.wav') return request.fulfill({ contentType: 'audio/wav', body: wav });
  if (url.pathname === '/api/stations/by-country') return request.fulfill({ json: { stations: url.searchParams.get('countryCode') === 'NG' ? [fixture] : [] } });
  if (url.pathname === '/api/stations/search') return request.fulfill({ json: { stations: [fixture] } });
  if (url.pathname === '/api/brief') return request.fulfill({ json: { category: url.searchParams.get('category'), headlines: [] } });
  if (url.pathname === '/api/world-context') return request.fulfill({ json: null });
  if (url.pathname === '/api/public-signals') return request.fulfill({ json: { layers: {} } });
  if (url.origin !== base && url.protocol.startsWith('http')) return request.fulfill({ status: 200, body: '', contentType: 'text/plain' });
  return request.continue();
});
const page = await context.newPage(); page.on('pageerror', error => errors.push(error.message));
await mkdir('test-results/journey', { recursive: true });
try {
  await page.goto(`${base}/?journey=${encodeURIComponent(JSON.stringify(route))}`, { waitUntil: 'domcontentloaded', timeout: 120000 });
  const dialog = page.getByRole('dialog', { name: 'Atlas Journey.' });
  await dialog.waitFor({ timeout: 120000 });
  await page.getByRole('button', { name: 'Begin journey', exact: true }).waitFor();
  await page.waitForTimeout(400);
  assert.equal(await page.locator('#journey-progress').inputValue(), '0', 'Shared routes open without starting');
  const firstFrame = await page.locator('canvas[aria-label^="Simulated flight"]').screenshot();
  await page.getByRole('button', { name: 'Begin journey', exact: true }).click();
  await page.waitForTimeout(1800);
  assert(Number(await page.locator('#journey-progress').inputValue()) > 0, 'Aircraft progresses');
  const nextFrame = await page.locator('canvas[aria-label^="Simulated flight"]').screenshot();
  assert(!firstFrame.equals(nextFrame), 'Canvas animation changes visible pixels');
  await page.getByRole('button', { name: 'Pause journey' }).click();
  const paused = await page.locator('#journey-progress').inputValue(); await page.waitForTimeout(600);
  assert.equal(await page.locator('#journey-progress').inputValue(), paused, 'Pause holds progress');
  await page.locator('#journey-progress').fill('500');
  assert.equal(await page.locator('#journey-progress').inputValue(), '500');
  await page.getByRole('button', { name: 'Aerial view', exact: true }).click();
  assert.equal(await page.getByRole('button', { name: 'Aerial view', exact: true }).getAttribute('aria-pressed'), 'true');
  await page.getByRole('button', { name: 'Follow aircraft', exact: true }).click();
  await page.getByRole('button', { name: 'Route view', exact: true }).click();
  assert.equal(await page.getByRole('button', { name: 'Route view', exact: true }).getAttribute('aria-pressed'), 'true');
  await page.waitForTimeout(100);
  await page.screenshot({ path: 'test-results/journey/desktop.png', fullPage: true });
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('waveatlas_journeys_v1')).length), 1);
  await page.getByRole('button', { name: 'Share', exact: true }).click();
  const share = await page.getByRole('textbox', { name: 'Journey link' }).inputValue();
  assert.deepEqual(JSON.parse(new URL(share).searchParams.get('journey')), route);
  await page.getByRole('button', { name: 'Reset journey', exact: true }).click();
  const radioCard = dialog.getByRole('article').filter({ hasText: 'Journey Lagos Radio' });
  const listen = radioCard.getByRole('button', { name: 'Listen', exact: true });
  await listen.waitFor({ timeout: 30000 }); await listen.click();
  await page.waitForFunction(() => window.__played.includes('Journey Lagos Radio'), { timeout: 30000 });
  await radioCard.getByRole('button', { name: 'Destination Brief', exact: true }).click();
  await page.getByRole('dialog', { name: 'WaveAtlas Daily' }).waitFor();
  await page.keyboard.press('Escape');
  await page.getByRole('dialog', { name: 'WaveAtlas Daily' }).waitFor({ state: 'hidden' });
  assert.equal(await page.getByRole('dialog', { name: 'WaveAtlas Daily' }).count(), 0);
  assert.equal(await dialog.count(), 1, 'Escape closes nested Brief without closing journey');
  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator('#journey-progress').fill('350');
  await dialog.evaluate(node => { node.parentElement.scrollTop = 0; });
  await page.screenshot({ path: 'test-results/journey/mobile.png', fullPage: true });
  assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'No mobile page overflow');
  assert(await dialog.evaluate(node => node.scrollWidth <= node.clientWidth), 'No modal overflow');
  for (const width of [320, 390, 768, 1366]) { await page.setViewportSize({ width, height: 900 }); assert(await dialog.evaluate(node => node.scrollWidth <= node.clientWidth), `No journey overflow at ${width}px`); }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('button', { name: 'Close Atlas Journey' }).click();
  const entry = page.getByRole('button', { name: 'Open Atlas Journey' }).filter({ visible: true }).first();
  await entry.waitFor(); await entry.click(); await dialog.waitFor();
  await page.getByRole('button', { name: 'London → Tokyo', exact: true }).click();
  assert.equal(await page.locator('#journey-progress').inputValue(), '0', 'Route changes reset progress');
  await page.getByRole('button', { name: 'Close Atlas Journey' }).click();
  await page.goto(`${base}/?journey=invalid`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(800);
  assert.equal(await page.getByRole('dialog', { name: 'Atlas Journey.' }).count(), 0, 'Invalid shared routes ignored');
  await page.getByRole('button', { name: 'Open Atlas Journey' }).filter({ visible: true }).first().click();
  await dialog.waitFor();
  assert.equal(await page.locator('#journey-progress').inputValue(), '0', 'Journey opens from the mobile empty state');
  assert.deepEqual(errors, []);
  console.log('Atlas Journey browser: shared preview, animation, pause, seeking, three cameras, save/share, real player selection, nested Brief, mobile layout and entry, route reset, invalid-link handling and zero runtime errors passed');
} catch (error) { console.log('Journey browser failure context', await page.evaluate(() => ({ played: window.__played, audio: [...document.querySelectorAll('audio')].map(a => ({src:a.src, paused:a.paused, error:a.error?.code})), selected: document.body.innerText.slice(-1500) }))); throw error; } finally { await context.close(); await browser.close(); server?.kill(); }
