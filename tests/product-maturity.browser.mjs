import assert from 'node:assert/strict';
import { chromium } from '@playwright/test';
const base = process.env.WAVEATLAS_TEST_URL || 'http://127.0.0.1:3012';
const stationId = 'ariyo-ai-premier-935-fm-ibadan';
const otherId = 'ariyo-ai-agidigbo-887-fm-ibadan';
const browser = await chromium.launch({ executablePath: '/usr/bin/chromium', args:['--no-sandbox','--disable-dev-shm-usage','--enable-unsafe-swiftshader'] });
try {
 for (const viewport of [{width:320,height:740},{width:390,height:844},{width:430,height:932},{width:768,height:1024},{width:1366,height:900},{width:1920,height:1080}]) {
  const context = await browser.newContext({ viewport });
  await context.addInitScript(() => {
   sessionStorage.setItem('waveatlas:splash-seen','true'); sessionStorage.setItem('waveatlas:arrival-completed','true');
   window.__plays=[];window.__radios=[];window.__context=null;window.__playback=null;window.__scenario='recover';window.__locationPrompts=0;
   window.addEventListener('waveatlas:station-context',event=>window.__context=event.detail);
   window.addEventListener('waveatlas:playback-context',event=>window.__playback=event.detail);
   navigator.geolocation.getCurrentPosition=()=>{window.__locationPrompts++;};
   navigator.permissions.query=async ()=>({state:'denied',addEventListener(){},removeEventListener(){}});
   const NativeAudio=window.Audio;window.Audio=function(...args){const audio=new NativeAudio(...args);window.__radios.push(audio);return audio;};window.Audio.prototype=NativeAudio.prototype;
   HTMLMediaElement.prototype.load=function(){};HTMLMediaElement.prototype.pause=function(){};
   HTMLMediaElement.prototype.play=function(){const url=this.src;window.__plays.push(url);setTimeout(()=>this.dispatchEvent(new Event(window.__scenario==='fail'||!url.includes('verified-backup')?'error':'playing')),25);return Promise.resolve();};
  });
  await context.route('**/*',route=>{
   const url=new URL(route.request().url());
   if(url.pathname==='/api/stations/streams')return route.fulfill({json:{candidates:[{url:'https://verified-backup.example/live.mp3',verified:true,health:95,confidence:.99,authority:1}]}});
   if(url.pathname==='/api/stations/failover')return route.fulfill({status:204});
   if(url.pathname==='/api/world-context')return route.fulfill({json:null});
   if(url.pathname==='/api/public-signals')return route.fulfill({json:{layers:{}}});
   if(url.pathname==='/_next/image')return route.fulfill({status:200,body:''});
   if(url.origin!==base&&url.protocol.startsWith('http'))return route.fulfill({status:200,body:''});
   return route.continue();
  });
  const page=await context.newPage();page.setDefaultTimeout(30000);
  await page.goto(`${base}/station/${stationId}`,{waitUntil:'domcontentloaded'});
  await page.waitForFunction(id=>window.__context?.station_uuid===id,stationId);
  assert.equal(await page.evaluate(()=>window.__plays.length),0,'Shared station starts silently');
  await page.evaluate(()=>window.dispatchEvent(new CustomEvent('waveatlas:assistant-playback',{detail:{command:'duck'}})));
  await page.evaluate(()=>window.dispatchEvent(new CustomEvent('waveatlas:assistant-playback',{detail:{command:'play'}})));
  await page.waitForFunction(()=>window.__playback?.status==='playing');
  assert.equal(await page.evaluate(()=>window.__context.station_uuid),stationId,'Failover preserves canonical station identity');
  assert.ok(await page.evaluate(()=>window.__plays.at(-1).includes('verified-backup')),'Verified backup actually selected');
  assert.equal(await page.evaluate(()=>window.__radios.length),1,'Failover uses one radio audio element');
  assert.equal(await page.evaluate(()=>window.__radios[0].muted),true,'Radio remains muted during Atlas focus');
  await page.waitForTimeout(600);
  assert.equal(await page.evaluate(()=>window.__radios[0].muted),true,'Elapsed time alone cannot release voice focus');
  await page.evaluate(()=>window.dispatchEvent(new CustomEvent('waveatlas:assistant-playback',{detail:{command:'restore'}})));
  await page.waitForFunction(()=>window.__radios[0].muted===false&&window.__radios[0].volume>0);
  const memory=await page.evaluate(()=>JSON.parse(localStorage.getItem('waveatlas:listening-memory')));
  assert.equal(memory.history[0].id,stationId,'Successful playback enters memory');
  assert.equal(memory.version,1);assert.ok(!('latitude' in memory));
  assert.equal(await page.evaluate(()=>window.__locationPrompts),0,'Details and playback never prompt for denied location');
  if(viewport.width<768)await page.getByRole('button',{name:'Open station details',exact:true}).click();
  else await page.getByRole('button',{name:'Open Explore',exact:true}).click();
  await page.getByText('Your listening memory',{exact:true}).filter({visible:true}).click();
  const save=page.getByRole('button',{name:'Save destination',exact:true}).filter({visible:true}).first();
  await save.click();
  assert.ok(await page.evaluate(id=>JSON.parse(localStorage.getItem('waveatlas:listening-memory')).favorites.includes(id),stationId),'Favorite is functional');
  await page.getByRole('button',{name:'Saved',exact:true}).filter({visible:true}).first().click();
  assert.ok(!(await page.evaluate(id=>JSON.parse(localStorage.getItem('waveatlas:listening-memory')).favorites.includes(id),stationId)),'Favorite removal is functional');
  await page.getByRole('button',{name:'Clear listening history',exact:true}).filter({visible:true}).first().click();
  assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('waveatlas:listening-memory')).history.length),0,'Clear history is functional');
  const dimensions=await page.evaluate(()=>({viewport:innerWidth,width:document.documentElement.scrollWidth}));
  assert.ok(dimensions.width<=dimensions.viewport+1,'No horizontal page overflow');
  await page.evaluate(()=>{window.__scenario='fail';});
  // An explicit retry of the same station starts a fresh bounded cycle.
  await page.evaluate(()=>window.__radios[0].dispatchEvent(new Event('error')));
  await page.waitForFunction(()=>window.__playback?.status==='failed');
  const failedCount=await page.evaluate(()=>window.__plays.length);await page.waitForTimeout(1500);
  assert.equal(await page.evaluate(()=>window.__plays.length),failedCount,'All endpoints failing cannot loop indefinitely');
  await page.evaluate(id=>{history.pushState({},'',`/station/${id}`);dispatchEvent(new PopStateEvent('popstate'));},otherId);
  await page.waitForFunction(id=>window.__context?.station_uuid===id,otherId);
  assert.equal(await page.evaluate(()=>window.__context.station_uuid),otherId,'Rapid selection supersedes endpoint recovery');
  console.log(`${viewport.width}px: silent share hydration, verified endpoint recovery, stable identity, one audio element, exclusive Atlas focus, memory, denied location, layout and bounded failures passed.`);
  await context.close();
 }
 const response=await fetch(`${base}/ops`);assert.equal(response.status,503,'Operations fail closed without credentials');
} finally { await browser.close(); }
