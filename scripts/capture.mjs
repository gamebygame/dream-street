import {chromium} from '@playwright/test';
import {mkdir,writeFile} from 'node:fs/promises';
import {spawn} from 'node:child_process';
import {resolve} from 'node:path';
import {setTimeout as wait} from 'node:timers/promises';

const baseURL=process.env.DREAM_STREET_URL||'http://127.0.0.1:5173';
const destination=resolve('artifacts/g2-2');
const soakSeconds=Number(process.env.DREAM_STREET_SOAK_SECONDS||600);
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
  const visualURL=new URL(baseURL);if(process.env.DREAM_STREET_MUSIC==='silent')visualURL.searchParams.set('music','silent');
  await page.goto(visualURL.href);await page.waitForFunction(()=>window.__dreamStreet?.ready);
  await page.screenshot({path:resolve(destination,'entrance.png')});
  await page.getByRole('button',{name:'开始前行'}).click();
  await page.waitForFunction(()=>window.__dreamStreet.transport.status==='running',null,{timeout:30000});
  await page.evaluate(()=>window.__dreamStreet.pause());
  for(const beat of [3,4,6.5,10,18.2,18.7,19.1,19.6,20.1,35.75,49.65,50,50.4,50.9,52,54,56,60,64,66,82,90,100,104.3,112,132.8,138.8,144.8,148,151.8,156,160,164,168,176,196,198,240,180,188,211.4,215,223,233,244,256]){
    await page.evaluate(b=>window.__dreamStreet.seek(b),beat);
    await page.screenshot({path:resolve(destination,`frame-${beat}.png`)});
  }
  await page.setViewportSize({width:1600,height:900});
  await page.evaluate(()=>window.__dreamStreet.seek(56));
  await page.screenshot({path:resolve(destination,'wide-1600.png')});
  await page.evaluate(()=>window.__dreamStreet.seek(104.3));
  await page.screenshot({path:resolve(destination,'crowd-1600.png')});
  await page.setViewportSize({width:1440,height:900});
  await page.waitForFunction(()=>window.__dreamStreet.renderer.viewport.width===1440&&window.__dreamStreet.renderer.renderer.domElement.width===1440);
  const info=await page.evaluate(()=>({userAgent:navigator.userAgent,dpr:devicePixelRatio,date:new Date().toISOString(),scripts:[...document.scripts].filter(s=>s.type==='module').map(s=>s.src)}));
  const started=Date.now(),samples=[];
  const recording=page.evaluate(async()=>{
    window.__recordingResult=await window.__dreamStreet.record({seconds:128.5,visualOnly:true});
    const {blob,...metadata}=window.__recordingResult;return metadata;
  });
  const cadence=setInterval(async()=>{
    try{
      const snapshot=await page.evaluate(()=>window.__dreamStreet.snapshot());
      const elapsedSeconds=(Date.now()-started)/1000;samples.push({elapsedSeconds,...snapshot});
      console.log(JSON.stringify({elapsedSeconds:+elapsedSeconds.toFixed(1),beat:+snapshot.visual.beat.toFixed(2),crowd:snapshot.visual.crowd,p95:snapshot.visual.p95,geometries:snapshot.visual.geometries,textures:snapshot.visual.textures,voices:snapshot.audio.activeVoices}));
    }catch(error){errors.push(error.message);}
  },20_000);
  let metadata;
  try{
    metadata=await recording;
    const download=page.waitForEvent('download');
    await page.evaluate(()=>{
      const link=document.createElement('a');link.href=URL.createObjectURL(window.__recordingResult.blob);
      link.download='dream-street-g2-2-silent.webm';link.click();setTimeout(()=>URL.revokeObjectURL(link.href),1000);
    });
    await (await download).saveAs(resolve(destination,'dream-street-g2-2-silent.webm'));
    await wait(Math.max(0,soakSeconds*1000-(Date.now()-started)));
  }finally{clearInterval(cadence);}
  const final=await page.evaluate(()=>window.__dreamStreet.snapshot());
  await page.evaluate(()=>window.__dreamStreet.pause());
  const paused=await page.evaluate(()=>window.__dreamStreet.snapshot());
  const stable=samples.filter(s=>s.elapsedSeconds>=140);
  const checks={noErrors:errors.length===0,cyclesCompleted:final.visual.beat>=Math.floor((soakSeconds-10)/128)*256,
    audioReleased:paused.audio.activeVoices===0&&paused.audio.schedulers===0,
    crowdSeen:samples.some(s=>s.visual.crowd===36),fixedPool:samples.every(s=>s.visual.crowdResources.pool===36),
    stableGeometry:new Set(stable.map(s=>s.visual.geometries)).size<=1,
    stableTextures:new Set(stable.map(s=>s.visual.textures)).size<=1,
    stableAudio:new Set(stable.map(s=>s.audio.cachedBuffers)).size<=1,
    boundedContacts:samples.every(s=>s.visual.contactCache<=32),singleScheduler:samples.every(s=>s.audio.schedulers===1),
    noSynthesizer:samples.every(s=>s.audio.activeVoices===0),correctSource:samples.every(s=>s.audio.music.mode===(process.env.DREAM_STREET_MUSIC==='silent'?'silent':'youtube'))};
  const report={info,node:process.version,soakSeconds:(Date.now()-started)/1000,recording:metadata,samples,final,paused,checks,errors};
  await writeFile(resolve(destination,'capture-report.json'),JSON.stringify(report,null,2)+'\n');
  console.log(JSON.stringify({capture:metadata,finalBeat:final.visual.beat,p95:final.visual.p95,fourHitFrames:final.visual.fourHitFrames,errors}));
  if(Object.values(checks).some(value=>!value))process.exitCode=1;
}finally{
  await browser?.close();server?.kill('SIGTERM');
}
