import { spawn } from 'node:child_process';
import { writeFile } from 'node:fs/promises';
const port = 3012, base = `http://127.0.0.1:${port}`;
const server = spawn(process.execPath,['node_modules/next/dist/bin/next','start','--hostname','127.0.0.1','--port',String(port)],{env:{...process.env,WAVEATLAS_OPS_USERNAME:'',WAVEATLAS_OPS_PASSWORD:''},stdio:['ignore','pipe','pipe']});
let serverLog=''; server.stdout.on('data',chunk=>serverLog+=chunk);server.stderr.on('data',chunk=>serverLog+=chunk);
async function run(file, environment={}) { return await new Promise(resolve=>{const child=spawn(process.execPath,[file],{env:{...process.env,WAVEATLAS_TEST_URL:base,...environment},stdio:['ignore','pipe','pipe']});let output='';child.stdout.on('data',chunk=>output+=chunk);child.stderr.on('data',chunk=>output+=chunk);child.on('exit',code=>resolve({file,code,output}));}); }
try {
 let ready=false;
 for(let i=0;i<40;i++){try{const response=await fetch(`${base}/ops`,{signal:AbortSignal.timeout(1000)});if(response.status===503){ready=true;break;}}catch{}await new Promise(resolve=>setTimeout(resolve,250));}
 if(!ready)throw new Error(`Local server unavailable: ${serverLog}`);
 const checks=[
  ['tests/product-maturity.browser.mjs',{}],
  ['tests/station-deep-link.browser.mjs',{}],
  ['tests/atlas-journey.browser.mjs',{}],
  ['tests/responsive-geometry.browser.mjs',{WAVEATLAS_GEOMETRY_SMOKE:'1',PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH:'/usr/bin/chromium'}],
 ];
 const results=[];
 for(const [file,environment]of checks){const result=await run(file,environment);results.push(result);console.log(`${file}: ${result.code===0?'PASS':'FAIL'}\n${result.output}`);}
 await writeFile('reports/maturity/final-browser-results.json',JSON.stringify(results,null,2));
 if(results.some(result=>result.code!==0))process.exitCode=1;
} finally {server.kill('SIGTERM');}
