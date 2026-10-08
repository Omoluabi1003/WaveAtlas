import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium } from '@playwright/test';

// Uses Chromium's real browser zoom, not CSS zoom or pinch magnification.
// Start the application first; external services and microphone/worker events
// are deterministic fixtures. The actual shell, globe, panels and player render.
const base = process.env.WAVEATLAS_TEST_URL || 'http://127.0.0.1:3000';
const output = 'test-results/responsive';
const widths = [1024,1280,1366,1440,1536,1600,1920,2560];
const heights = [600,720,768,800,864,900,1080,1440];
const smoke = process.env.WAVEATLAS_GEOMETRY_SMOKE === '1';
const zooms = smoke ? [1,1.5,2] : [.8,1,1.25,1.5,2];
const critical = [[1366,768],[1440,900],[1536,864],[1920,1080],[2560,1440],[1280,720],[1024,768]];
const quick = process.env.WAVEATLAS_GEOMETRY_QUICK === '1';
const visual = process.env.WAVEATLAS_GEOMETRY_VISUAL === '1';
const selectedCritical = smoke ? [[1366,768],[1024,768]] : critical;
const dimensions = quick || smoke ? selectedCritical : widths.flatMap(w => heights.map(h => [w,h]));
const profile = await mkdtemp(join(tmpdir(),'waveatlas-geometry-'));
await rm(output,{recursive:true,force:true});
await mkdir(output,{recursive:true});
const context = await chromium.launchPersistentContext(profile, {
  channel: 'chromium',
  executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || undefined,
  headless: true, viewport: {width:1366,height:768},
  args: ['--no-sandbox','--enable-unsafe-swiftshader'],
});
const outcomes = [], errors = [];
let microphoneRequests = 0;
const settings = await context.newPage();
await settings.goto('chrome://settings/');
const page = await context.newPage();
page.on('pageerror',error => errors.push(error.message));
page.on('console',message => { if(message.type()==='error') errors.push(message.text()); });
await page.exposeFunction('recordMicrophoneRequest',() => microphoneRequests++);
await page.addInitScript(() => {
  sessionStorage.setItem('waveatlas:splash-seen','true');
  sessionStorage.setItem('waveatlas:arrival-completed','true');
  window.__voicePermission = 'granted';
  const query = navigator.permissions.query.bind(navigator.permissions);
  navigator.permissions.query = async descriptor => descriptor.name === 'microphone'
    ? { state: window.__voicePermission, addEventListener(){},removeEventListener(){} } : query(descriptor);
  class Recognition {
    start(){ window.recordMicrophoneRequest(); window.__recognition = this; this.onstart?.(); }
    stop(){ this.onend?.(); }
    abort(){ if (window.__recognition === this) window.__recognition = null; this.onend?.(); }
  }
  window.SpeechRecognition = Recognition;
  const Worker = window.Worker;
  window.Worker = class extends Worker {
    constructor(url,options) {
      // Retain real globe and other workers; only voice inference is a fixture.
      if(String(url).includes('atlas-neural-voice-worker')) {
        super(URL.createObjectURL(new Blob([`self.onmessage = event => { if (event.data.type === 'warm') self.postMessage({type:'prepared'}); };`],{type:'text/javascript'})),options);
      } else super(url,options);
    }
  };
});
const station = {
  id:'geometry-station', station_uuid:'geometry-station',
  name:'International Community Radio — a deliberately long station name for responsive metadata',
  url:`${base}/geometry-audio.wav`, country:'United Kingdom',country_code:'GB',city:'London',state:'Greater London',language:'English and multiple community languages',
  tags:['community','news'],codec:'WAV',bitrate:128,latitude:51.5072,longitude:-.1276,votes:100,click_count:100,
  health_score:100,is_active:true,last_check_ok:true,last_checked_at:new Date().toISOString(),failure_count:0,response_time_ms:10,
};
const wav = Buffer.alloc(44+8000*2*2);
wav.write('RIFF');wav.writeUInt32LE(wav.length-8,4);wav.write('WAVEfmt ',8);wav.writeUInt32LE(16,16);wav.writeUInt16LE(1,20);wav.writeUInt16LE(1,22);wav.writeUInt32LE(8000,24);wav.writeUInt32LE(16000,28);wav.writeUInt16LE(2,32);wav.writeUInt16LE(16,34);wav.write('data',36);wav.writeUInt32LE(wav.length-44,40);
await context.route('**/*',async route => {
  const url = new URL(route.request().url());
  if (url.pathname==='/geometry-audio.wav') return route.fulfill({contentType:'audio/wav',body:wav});
  if (url.pathname==='/api/stations/by-uuid') return route.fulfill({json:{station:{...station,station_uuid:(url.searchParams.get('station_uuid') || url.searchParams.get('uuid')),id:(url.searchParams.get('station_uuid') || url.searchParams.get('uuid'))}}});
  if (url.pathname==='/api/brief') return route.fulfill({json:{headlines:[]}});
  if (url.pathname==='/api/world-context') return route.fulfill({json:{context:null}});
  if (url.pathname==='/api/public-signals') return route.fulfill({json:{layers:{}}});
  if (url.pathname==='/_next/image') return route.fulfill({contentType:'image/png',body:Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jOUYAAAAASUVORK5CYII=','base64')});
  if (url.origin !== base && url.protocol.startsWith('http')) {
    if (/\.json|geojson|world-atlas|countries/i.test(url.pathname)) return route.fulfill({json:{type:'FeatureCollection',features:[]}});
    return route.fulfill({status:200,body:'',contentType:'text/plain'});
  }
  return route.continue();
});

async function zoom(value) {
  await settings.evaluate(value => new Promise(resolve => chrome.settingsPrivate.setDefaultZoom(value,resolve)), value);
  await page.waitForFunction(value => Math.abs(devicePixelRatio-value)<.02,value);
}
async function geometry(label, selector) {
  const failures = await page.evaluate(selector => {
    const failures=[], margin=2;
    const visible=e=>e.checkVisibility({checkOpacity:true,checkVisibilityCSS:true});
    const name=e=>e.getAttribute('aria-label') || e.textContent.trim().slice(0,90) || e.tagName;
    const scrollable=e=>/(auto|scroll)/.test(getComputedStyle(e).overflowY) && e.scrollHeight>e.clientHeight;
    if(document.documentElement.scrollWidth>document.documentElement.clientWidth) failures.push('document horizontal overflow');
    const scene=document.querySelector('.desktop-scene'), workspace=document.querySelector('.desktop-workspace');
    if(scene && visible(scene) && !workspace.classList.contains('has-drawer')) {
      const sr=scene.getBoundingClientRect(), wr=workspace.getBoundingClientRect();
      if(sr.width < wr.width*.8) failures.push('globe loses predominant workspace width');
      if(document.querySelector('.desktop-atlas-surface')) failures.push('Atlas must not reserve a separate workspace row');
      if(sr.height < Math.min(300,innerHeight*.45)) failures.push('globe scene is too short');
    }
    for(const button of document.querySelectorAll('.atlas-launcher-button')) if(visible(button) && button.getBoundingClientRect().height > 44) failures.push('Atlas launcher is larger than neighboring controls');
    const elements=[...document.querySelectorAll(selector)].filter(visible);
    for(const e of elements) {
      const r=e.getBoundingClientRect();
      if(r.width<=0 || r.height<=0) failures.push(`${name(e)}: empty geometry`);
      if(r.left < -margin || r.right > innerWidth+margin) failures.push(`${name(e)}: outside viewport horizontally`);
      let scrollParent=null;
      for(let p=e.parentElement;p;p=p.parentElement) {
        const style=getComputedStyle(p), pr=p.getBoundingClientRect();
        if(scrollable(p)) {
          scrollParent ||= p;
          if(p.scrollTop === 0 && r.top < pr.top-margin) failures.push(`${name(e)}: unreachable above scroll region`);
        }
        if(/hidden|clip/.test(style.overflowY) && (r.top < pr.top-margin || r.bottom>pr.bottom+margin) && !scrollParent) failures.push(`${name(e)}: clipped by ${p.className}`);
        if(/hidden|clip/.test(style.overflowX) && (r.left<pr.left-margin || r.right>pr.right+margin)) failures.push(`${name(e)}: horizontally clipped by ${p.className}`);
      }
      if((r.top< -margin || r.bottom>innerHeight+margin) && !scrollParent) failures.push(`${name(e)}: outside viewport vertically without scrolling`);
      // Check rendered text against every clipping ancestor. A glyph may extend
      // beyond its line box without being clipped, so visible overflow is valid.
      if(!e.closest('.waveatlas-auto-marquee')) {
        const walker=document.createTreeWalker(e,NodeFilter.SHOW_TEXT);
        for(let node=walker.nextNode();node;node=walker.nextNode()) {
          if(!node.textContent.trim() || node.parentElement.closest('.sr-only,[aria-hidden="true"],.waveatlas-auto-marquee')) continue;
          const range=document.createRange();range.selectNodeContents(node);
          for(const text of range.getClientRects()) {
            let textScroll=false;
            for(let p=node.parentElement;p;p=p.parentElement) {
              const style=getComputedStyle(p),pr=p.getBoundingClientRect();
              if(scrollable(p))textScroll=true;
              if(/hidden|clip/.test(style.overflowX) && (text.left<pr.left-margin || text.right>pr.right+margin)) failures.push(`${name(e)}: clipped text horizontally`);
              if(/hidden|clip/.test(style.overflowY) && !textScroll && (text.top<pr.top-margin || text.bottom>pr.bottom+margin)) failures.push(`${name(e)}: clipped text vertically`);
            }
          }
        }
      }

    }
    const regions=[...document.querySelectorAll('.desktop-app-header,.desktop-scene,.desktop-utility-rail,.desktop-context-drawer,.desktop-atlas-surface,.desktop-player')].filter(visible);
    for(const e of regions) {
      const parent=e.parentElement,r=e.getBoundingClientRect(),p=parent.getBoundingClientRect();
      if(r.left<p.left-margin || r.right>p.right+margin || (!scrollable(parent) && (r.top<p.top-margin || r.bottom>p.bottom+margin))) failures.push(`region escapes parent: ${e.className}`);
    }
    for(let i=0;i<regions.length;i++)for(let j=i+1;j<regions.length;j++) {
      const a=regions[i].getBoundingClientRect(),b=regions[j].getBoundingClientRect();
      if(Math.min(a.right,b.right)-Math.max(a.left,b.left)>margin && Math.min(a.bottom,b.bottom)-Math.max(a.top,b.top)>margin) failures.push(`collision: ${regions[i].className} / ${regions[j].className}`);
    }
    return [...new Set(failures)];
  }, selector);
  // A control in a declared scroll area must be reachable and hit-testable.
  failures.push(...await page.evaluate(selector => {
    const failures=[];
    const controls=[...document.querySelectorAll(selector)].filter(e=>e.matches('button,input,a[href]') && e.checkVisibility({checkOpacity:true,checkVisibilityCSS:true}));
    for(const e of controls) {
      e.scrollIntoView({behavior:'instant',block:'nearest',inline:'nearest'});
      const r=e.getBoundingClientRect(), x=(r.left+r.right)/2,y=(r.top+r.bottom)/2;
      const hit=document.elementFromPoint(x,y);
      if(!hit || (!e.contains(hit) && !hit.contains(e))) failures.push(`${e.getAttribute('aria-label')||e.textContent.trim()}: covered by ${hit?.className||'viewport'}`);
    }
    document.querySelectorAll('*').forEach(e=>{if(e.scrollTop)e.scrollTop=0;});
    return failures;
  },selector));
  outcomes.push({label,failures});
  if(failures.length) {
    await page.screenshot({path:`${output}/FAIL-${label.replace(/[^\w-]/g,'-')}.png`});
    console.log('FAIL',label,failures.slice(0,5));
  }
}
const primary = '.desktop-app-header input,.desktop-app-header button,.desktop-utility-rail button,.desktop-atlas-surface .atlas-voice-surface :is(button,h2,h3,p),.desktop-player :is(button,p),.globe-guide-caption,.empty-atlas :is(button,h1,p),.mobile-empty-voice :is(button,h2,h3,p),.waveatlas-mobile-header :is(button,h2,h3,p),.waveatlas-mobile-dock button,[data-waveatlas-player] button';
async function matrix(state) {
  console.log(`Matrix: ${state}`);
  for(const [width,height] of dimensions) for(const factor of zooms) {
    await page.setViewportSize({width,height});await zoom(factor);
    await page.waitForTimeout(50);
    const label=`${state}-${width}x${height}-${factor*100}`;
    await geometry(label,primary);
    if(visual) await page.screenshot({path:`${output}/${label}.jpg`,type:'jpeg',quality:65,animations:'disabled'});
    if(critical.some(([w,h])=>w===width&&h===height)&&(factor===1||factor===2)) await page.screenshot({path:`${output}/${label}.png`,animations:'disabled'});
  }
}
try {
  await page.goto(base,{waitUntil:'domcontentloaded'});
  console.log('Browser ready: beginning geometry matrix');
  await page.waitForSelector('html[data-wa-runtime="ready"]');
  await page.waitForFunction(()=>{const shell=document.querySelector('.desktop-app-shell');return shell && getComputedStyle(shell).display==='grid';});
  await page.waitForFunction(()=>Array.from(document.querySelectorAll('.atlas-voice-readiness')).some(e=>e.textContent.includes('READY')));
  assert.equal(microphoneRequests,0,'Displaying Atlas must not prompt for microphone or start capture');
  await matrix('empty');
  await page.setViewportSize({width:1366,height:768});await zoom(1);
  await page.evaluate(()=>{history.pushState({},'', '/station/geometry-station');window.dispatchEvent(new PopStateEvent('popstate'));});
  await page.waitForSelector('.desktop-player');
  await page.waitForTimeout(1500); // Let the automatic station-focus travel settle before visual capture.
  await matrix('station');
  console.log('Matrix: contextual drawers and capability sheets');
  for(const [width,height] of selectedCritical) for(const factor of zooms) {
    await page.setViewportSize({width,height});await zoom(factor);
    if(await page.locator('.desktop-utility-rail').isVisible()) {
      await page.getByRole('button',{name:'Open Settings',exact:true}).click();
      await geometry(`settings-${width}x${height}-${factor*100}`,primary+',.desktop-context-drawer :is(button,input,a,h2,h3,p)');
      await page.getByRole('button',{name:'Close search drawer',exact:true}).click();
    }
    await page.locator('.atlas-launcher-button:visible').hover();
    await page.locator('.atlas-capabilities-button:visible').click();
    await geometry(`capabilities-${width}x${height}-${factor*100}`,'.atlas-capabilities-sheet :is(button,h2,h3,li)');
    await page.getByRole('button',{name:'Close Atlas capabilities'}).click();
  }
  console.log('Matrix: mobile layouts and station details');
  for(const [width,height] of [[320,568],[375,667],[390,844],[430,932],[667,375],[767,550]]) {
    await page.setViewportSize({width,height});await zoom(1);
    await geometry(`mobile-${width}x${height}`,primary);
    await page.screenshot({path:`${output}/mobile-${width}x${height}.png`,animations:'disabled'});
  }
  await page.setViewportSize({width:430,height:932});await zoom(1);
  await page.getByRole('button',{name:'Open station details',exact:true}).click();
  await page.waitForTimeout(300);
  await geometry('mobile-station-details','.waveatlas-mobile-shell [aria-label="Destination Intelligence"] :is(button,h2,h3,p)');
  await page.getByRole('button',{name:'Close Destination Intelligence',exact:true}).click();
  await page.waitForTimeout(300);
  await geometry('mobile-station-details-closed',primary);
  await page.setViewportSize({width:1366,height:768});await zoom(1);
  console.log('Interactions: microphone boundaries, denied access, usage persistence and hydration');
  assert.equal(microphoneRequests,0,'Discovery and command previews must not activate microphone');
  await page.locator('.atlas-talk-button:visible').click();
  await page.waitForFunction(()=>window.__recognition);
  assert.equal(microphoneRequests,1,'Deliberate Talk interaction starts the existing recognition path');
  await page.getByRole('button',{name:'Close Atlas Voice'}).click();
  await page.locator('.atlas-talk-button:visible').click();
  await page.waitForFunction(()=>window.__recognition);
  await page.evaluate(()=>window.__recognition.onerror({error:'not-allowed'}));
  await page.waitForSelector('[aria-label="Atlas Assistant"]');
  assert.ok(await page.getByPlaceholder('Ask or tell Atlas what to do…').isVisible(),'Denied microphone retains text input');
  await page.getByRole('button',{name:'Close Atlas',exact:true}).click();
  await page.goto(base,{waitUntil:'domcontentloaded'});
  await page.waitForSelector('html[data-wa-runtime="ready"]');
  await page.locator('.atlas-launcher-button:visible').hover();
  await page.locator('.atlas-capabilities-button:visible').click();
  assert.ok(await page.locator('.atlas-voice-invitation:visible').count(),'Opening and denying Atlas does not mark it understood');
  await page.getByRole('button',{name:'Close Atlas capabilities'}).click();
  // Input with the existing text workflow retires the invitation without speech.
  await page.locator('.atlas-talk-button:visible').click();
  await page.getByRole('button',{name:'Open Atlas keyboard and transcript'}).click();
  await page.getByRole('button',{name:'Mute Atlas voice',exact:true}).click();
  await page.getByPlaceholder('Ask or tell Atlas what to do…').fill('Hello Atlas');
  await page.getByRole('button',{name:'Send',exact:true}).click();
  await page.getByRole('button',{name:'Close Atlas',exact:true}).click();
  await page.goto(base,{waitUntil:'domcontentloaded'});
  await page.waitForSelector('html[data-wa-runtime="ready"]');
  await page.locator('.atlas-launcher-button:visible').hover();
  await page.locator('.atlas-capabilities-button:visible').click();
  assert.equal(await page.locator('.atlas-voice-invitation:visible').count(),0,'Invitation stays retired after demonstrated usage');
  await page.getByRole('button',{name:'Close Atlas capabilities'}).click();
  assert.ok(await page.locator('.atlas-talk-button:visible').isVisible(),'Permanent entry remains');
  // Static HTML can be older than the client clock. Force drift so hydration
  // regressions fail deterministically rather than only after a minute rolls.
  await page.addInitScript(() => {
    const RealDate = Date;
    window.Date = class extends RealDate {
      constructor(...args) { super(...(args.length ? args : [RealDate.now() + 120000])); }
      static now() { return RealDate.now() + 120000; }
    };
  });
  await page.reload({waitUntil:'domcontentloaded'});
  await page.waitForSelector('html[data-wa-runtime="ready"]');
  await page.waitForTimeout(100);
  await writeFile(`${output}/results.json`,JSON.stringify({outcomes,errors,microphoneRequests},null,2));
  assert.equal(outcomes.filter(o=>o.failures.length).length,0,'Responsive geometry failures; see test-results/responsive/results.json');
  assert.deepEqual(errors,[],'No console errors, hydration warnings, or page exceptions');
  console.log(`PASS: ${outcomes.length} geometry cases, real Chromium zoom, mobile, preview, microphone boundaries and invitation persistence.`);
} finally { await writeFile(`${output}/results.json`,JSON.stringify({outcomes,errors,microphoneRequests},null,2)); await context.close(); await rm(profile,{recursive:true,force:true}); }
