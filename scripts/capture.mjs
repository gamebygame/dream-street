import {chromium} from '@playwright/test';
import {mkdir,writeFile} from 'node:fs/promises';
import {spawn} from 'node:child_process';
import {resolve} from 'node:path';
import {setTimeout as wait} from 'node:timers/promises';

const baseURL=process.env.DREAM_STREET_URL||'http://127.0.0.1:5173';
const destination=resolve('artifacts/g1');
const soakSeconds=Number(process.env.DREAM_STREET_SOAK_SECONDS||125);
await mkdir(destination,{recursive:true});
let server,browser;
try{
  if(!await fetch(baseURL).then(r=>r.ok).catch(()=>false)){
    server=spawn(process.execPath,['node_modules/vite/bin/vite.js','--host','127.0.0.1','--port','5173','--strictPort'],{stdio:'ignore'});
    for(let i=0;i<100;i++){
      if(await fetch(baseURL).then(r=>r.ok).catch(()=>false))break;
      if(i===99)throw new Error('The local development server did not start.');await wait(100);
    }
  }
  browser=await chromium.launch({channel:'chrome',headless:true});
  const page=await browser.newPage({viewport:{width:1440,height:900},deviceScaleFactor:1});
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(baseURL);await page.waitForFunction(()=>window.__dreamStreet?.ready);
  await page.screenshot({path:resolve(destination,'entrance.png')});
  await page.getByRole('button',{name:'开始前行'}).click();
  await page.evaluate(()=>window.__dreamStreet.pause());
  for(const beat of [10,18.2,35.75,49.65,50,52,54,56,60,62,64,66]){
    await page.evaluate(b=>window.__dreamStreet.seek(b),beat);
    await page.screenshot({path:resolve(destination,`frame-${beat}.png`)});
  }
  await page.setViewportSize({width:1600,height:900});
  await page.evaluate(()=>window.__dreamStreet.seek(56));
  await page.screenshot({path:resolve(destination,'wide-1600.png')});
  await page.setViewportSize({width:1440,height:900});
  const info=await page.evaluate(()=>({userAgent:navigator.userAgent,dpr:devicePixelRatio,date:new Date().toISOString()}));
  const started=Date.now(),samples=[];
  const recording=page.evaluate(async()=>{
    window.__recordingResult=await window.__dreamStreet.record({seconds:40.5});
    const {blob,...metadata}=window.__recordingResult;return metadata;
  });
  const cadence=setInterval(async()=>{
    try{
      const snapshot=await page.evaluate(()=>window.__dreamStreet.snapshot());
      const elapsedSeconds=(Date.now()-started)/1000;samples.push({elapsedSeconds,...snapshot});
      console.log(JSON.stringify({elapsedSeconds:+elapsedSeconds.toFixed(1),beat:+snapshot.visual.beat.toFixed(2),p95:snapshot.visual.p95,geometries:snapshot.visual.geometries,textures:snapshot.visual.textures,voices:snapshot.audio.activeVoices}));
    }catch(error){errors.push(error.message);}
  },20_000);
  let metadata;
  try{
    metadata=await recording;
    const download=page.waitForEvent('download');
    await page.evaluate(()=>{
      const link=document.createElement('a');link.href=URL.createObjectURL(window.__recordingResult.blob);
      link.download='dream-street-g1.webm';link.click();setTimeout(()=>URL.revokeObjectURL(link.href),1000);
    });
    await (await download).saveAs(resolve(destination,'dream-street-g1.webm'));
    await wait(Math.max(0,soakSeconds*1000-(Date.now()-started)));
  }finally{clearInterval(cadence);}
  const final=await page.evaluate(()=>window.__dreamStreet.snapshot());
  await page.evaluate(()=>window.__dreamStreet.pause());
  const paused=await page.evaluate(()=>window.__dreamStreet.snapshot());
  const report={info,node:process.version,soakSeconds:(Date.now()-started)/1000,recording:metadata,samples,final,paused,errors};
  await writeFile(resolve(destination,'capture-report.json'),JSON.stringify(report,null,2)+'\n');
  console.log(JSON.stringify({capture:metadata,finalBeat:final.visual.beat,p95:final.visual.p95,fourHitFrames:final.visual.fourHitFrames,errors}));
  if(errors.length||final.visual.beat<soakSeconds*2-2||paused.audio.activeVoices!==0)process.exitCode=1;
}finally{
  await browser?.close();server?.kill('SIGTERM');
}
