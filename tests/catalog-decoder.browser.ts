import assert from 'node:assert/strict';
import { chromium } from '@playwright/test';
import { EventEmitter } from 'node:events';
import type { request } from 'node:http';
import { browserAudioProof } from '../lib/agents/browser-audio-proof';
async function main() {
const samples=8000, wav=Buffer.alloc(44+samples*2);
wav.write('RIFF');wav.writeUInt32LE(wav.length-8,4);wav.write('WAVEfmt ',8);wav.writeUInt32LE(16,16);wav.writeUInt16LE(1,20);wav.writeUInt16LE(1,22);wav.writeUInt32LE(8000,24);wav.writeUInt32LE(16000,28);wav.writeUInt16LE(2,32);wav.writeUInt16LE(16,34);wav.write('data',36);wav.writeUInt32LE(samples*2,40);
for(let i=0;i<samples;i++)wav.writeInt16LE(Math.round(2000*Math.sin(2*Math.PI*440*i/8000)),44+i*2);
const browser=await chromium.launch({executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE||'/usr/bin/chromium',args:['--no-sandbox']});
try {
 const page=await browser.newPage();
 let requests=0;
 await page.route('**/*',route=>{requests++;return route.abort();});
 const deps={resolve:async()=>[{address:'8.8.8.8',family:4}],request:((_url:unknown,_options:unknown,callback:(response:unknown)=>void)=>{
  const req=new EventEmitter() as EventEmitter&{end():void};req.end=()=>{
   const res=new EventEmitter() as EventEmitter&{statusCode:number;headers:object;destroy():void};res.statusCode=200;res.headers={'content-type':'audio/wav'};res.destroy=()=>{};
   callback(res);queueMicrotask(()=>{res.emit('data',wav);res.emit('end');});
  };return req;
 }) as unknown as typeof request};
 const result=await browserAudioProof(page,'https://fixture.example/audio','audio-wav',deps);
 assert.equal(result.ok,true,JSON.stringify(result));assert(result.seconds>=0.15);assert.equal(requests,0);
 assert.equal((await browserAudioProof(page,'https://fixture.example/audio','audio-hls-cmaf',deps)).ok,false);
 const privateResult=await browserAudioProof(page,'https://fixture.example/audio','audio-wav',{...deps,resolve:async()=>[{address:'127.0.0.1',family:4}]});
 assert.equal(privateResult.ok,false);
 console.log('Browser proof: Chromium decodes a bounded pinned sample, rejects private addresses, never requests untrusted URLs, and leaves HLS acquisition pending');
}finally{await browser.close();}

}
main().catch(error=>{console.error(error);process.exit(1);});
