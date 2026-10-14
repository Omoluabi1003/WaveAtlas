import assert from 'node:assert/strict';
import { chromium } from '@playwright/test';
const base=process.env.WAVEATLAS_TEST_URL||'http://127.0.0.1:3017';
const id='ariyo-ai-premier-935-fm-ibadan';
const browser=await chromium.launch({executablePath:'/usr/bin/chromium',args:['--no-sandbox','--disable-dev-shm-usage','--enable-unsafe-swiftshader']});
const wav=Buffer.alloc(44+8000*2*20);wav.write('RIFF');wav.writeUInt32LE(wav.length-8,4);wav.write('WAVEfmt ',8);wav.writeUInt32LE(16,16);wav.writeUInt16LE(1,20);wav.writeUInt16LE(1,22);wav.writeUInt32LE(8000,24);wav.writeUInt32LE(16000,28);wav.writeUInt16LE(2,32);wav.writeUInt16LE(16,34);wav.write('data',36);wav.writeUInt32LE(wav.length-44,40);
try {
 for(const mobile of [false,true]) {
  const context=await browser.newContext({viewport:mobile?{width:390,height:844}:{width:1366,height:900},isMobile:mobile});
  await context.addInitScript(()=>{
   sessionStorage.setItem('waveatlas:splash-seen','true');sessionStorage.setItem('waveatlas:arrival-completed','true');window.__playback={};window.__radios=[];window.__locations=0;
   const OriginalAudio=window.Audio;window.Audio=function(...args){const audio=new OriginalAudio(...args);window.__radios.push(audio);return audio;};
   window.addEventListener('waveatlas:playback-context',event=>{window.__playback=event.detail;});
   Object.defineProperty(navigator,'permissions',{value:{query:async()=>({state:'denied'})}});
   Object.defineProperty(navigator,'geolocation',{value:{getCurrentPosition:()=>{window.__locations++;}}});
  });
  let backupRequests=0;let allFail=false;
  await context.route('**/*',async route=>{
   const url=new URL(route.request().url());
   if(url.pathname==='/api/stations/streams')return route.fulfill({json:{stationId:id,candidates:[{url:`${base}/backup.wav`,health:95,confidence:1,authority:1,source:'verified-broadcaster',verifiedAt:new Date().toISOString()}]}});
   if(url.pathname==='/backup.wav'){backupRequests++;return allFail?route.fulfill({status:410,body:''}):route.fulfill({contentType:'audio/wav',body:wav});}
   if(url.pathname==='/api/world-context')return route.fulfill({json:null});if(url.pathname==='/api/public-signals')return route.fulfill({json:{layers:{}}});
   if(url.pathname==='/_next/image')return route.fulfill({body:''});
   if(url.origin!==base)return route.fulfill({status:url.href.includes('centova')?410:200,body:''});
   return route.continue();
  });
  const page=await context.newPage();page.setDefaultTimeout(30000);
  await page.goto(`${base}/station/${id}`,{waitUntil:'domcontentloaded',timeout:120000});
  await page.waitForFunction(id=>window.__playback.current?.station_uuid===id,id);
  await page.getByRole('button',{name:'Play or pause current station',exact:true}).filter({visible:true}).first().click();
  try { await page.waitForFunction(()=>window.__playback.status==='playing',null,{timeout:30000}); } catch(error) { console.log(await page.evaluate(()=>({playback:window.__playback,radios:window.__radios.map(a=>({src:a.src,error:a.error?.code,paused:a.paused,muted:a.muted})),text:document.body.innerText.slice(-500)})));throw error; }
  assert.equal(await page.evaluate(()=>window.__playback.current.station_uuid),id);assert.ok(backupRequests>=1);
  assert.ok(await page.evaluate(()=>localStorage.getItem('waveatlas:listening-memory:v1')?.includes('ariyo-ai-premier-935-fm-ibadan')));
  assert.equal(await page.evaluate(()=>window.__locations),0);
  assert.equal(await page.evaluate(()=>window.__radios.filter(audio=>!audio.paused).length),1);
  await page.evaluate(()=>dispatchEvent(new CustomEvent('waveatlas:assistant-playback',{detail:{command:'duck',value:0}})));
  assert.ok(await page.evaluate(()=>window.__radios.every(audio=>audio.paused||audio.muted||audio.volume===0)));
  await page.evaluate(()=>dispatchEvent(new CustomEvent('waveatlas:assistant-playback',{detail:{command:'restore'}})));
  await page.waitForTimeout(1200);assert.ok(await page.evaluate(()=>window.__radios.some(audio=>!audio.paused&&!audio.muted&&audio.volume>0)));
  allFail=true;await page.reload({waitUntil:'domcontentloaded'});
  await page.waitForFunction(id=>window.__playback.current?.station_uuid===id,id);
  await page.getByRole('button',{name:'Play or pause current station',exact:true}).filter({visible:true}).first().click();
  await page.waitForFunction(()=>window.__playback.status==='failed');
  assert.equal(await page.evaluate(()=>window.__playback.current.station_uuid),id);
  assert.ok(await page.evaluate(()=>window.__radios.every(audio=>audio.paused)));
  await page.goto(`${base}/ops`,{waitUntil:'domcontentloaded'});await page.getByText('Server authorization is required.',{exact:false}).waitFor();
  console.log(`${mobile?'Mobile':'Desktop'}: verified backup recovery, exact identity, memory, denied location, one audio element, voice mute/restore, all endpoints failed and operations gate passed`);
  await context.close();
 }
}finally{await browser.close();}
