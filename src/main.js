import './style.css';
import {ExperienceRenderer} from './render/scene.js';
import {Transport} from './audio/transport.js';
import {validatePlan} from './content/plan.js';

const $=selector=>document.querySelector(selector);
const entrance=$('#entrance'),startButton=$('#start'),pauseButton=$('#pause'),status=$('#status');
let experience,transport,recording=false,lastHud=0,started=false;
const showError=error=>{console.error(error);$('#error-message').textContent=`暂时无法继续前行：${error.message}`;$('#error').hidden=false;};

function updateControls(){
  const state=transport?.status||'idle';
  pauseButton.textContent=state==='running'?'暂停':'继续';pauseButton.setAttribute('aria-label',state==='running'?'暂停':'继续');pauseButton.disabled=!started||state==='starting';
  $('#status-dot').classList.toggle('running',state==='running');
  status.textContent=state==='running'?experience.sample.phase:started?'停一会儿，街道还在。':'准备好了';
}

async function play(){
  await transport.resume();started=true;entrance.hidden=true;$('#error').hidden=true;updateControls();
}
async function pause(){
  const released=transport.pause();experience.render(transport.sample().beat,false);updateControls();await released;
}
async function seek(beat){await transport.seek(beat);experience.contactTracker.seek(beat);experience.render(beat,false);experience.resetMetrics();updateControls();}

async function record({seconds=40.5,fromBeat=0}={}){
  if(recording)throw new Error('Already recording.');
  if(!window.MediaRecorder||!experience.renderer.domElement.captureStream)throw new Error('当前浏览器不支持演示录制。');
  recording=true;
  try{
    await pause();await seek(fromBeat);await transport.ensureAudio();
    const canvasStream=experience.renderer.domElement.captureStream(60);
    const stream=new MediaStream([...canvasStream.getVideoTracks(),...transport.voices.capture.stream.getAudioTracks()]);
    const mime=['video/webm;codecs=vp9,opus','video/webm;codecs=vp8,opus','video/mp4'].find(type=>MediaRecorder.isTypeSupported(type));
    if(!mime)throw new Error('没有可用的录制编码器。');
    const recorder=new MediaRecorder(stream,{mimeType:mime,videoBitsPerSecond:8_000_000});
    const chunks=[];
    const result=new Promise((resolve,reject)=>{
      recorder.ondataavailable=event=>{if(event.data.size)chunks.push(event.data);};
      recorder.onerror=event=>reject(event.error||new Error('MediaRecorder failed.'));
      recorder.onstop=()=>resolve(new Blob(chunks,{type:mime}));
    });
    recorder.start(1000);await play();
    await new Promise(resolve=>setTimeout(resolve,seconds*1000));
    recorder.stop();const blob=await result;for(const track of canvasStream.getTracks())track.stop();
    return {blob,mime,seconds,bytes:blob.size,fromBeat,endBeat:transport.sample().beat};
  }finally{recording=false;}
}

try{
  validatePlan();experience=new ExperienceRenderer($('#stage'));transport=new Transport();
  startButton.disabled=true;startButton.firstChild.textContent='准备街道… ';
  await experience.warmup();startButton.disabled=false;startButton.firstChild.textContent='开始前行 ';
  startButton.addEventListener('click',async()=>{startButton.disabled=true;try{await play();}catch(error){showError(error);}finally{startButton.disabled=false;}});
  pauseButton.addEventListener('click',()=>{(transport.status==='running'?pause():play()).catch(showError);});
  $('#mute').addEventListener('click',()=>{
    transport.setMuted(!transport.muted);$('#mute').setAttribute('aria-pressed',String(transport.muted));$('#mute').textContent=transport.muted?'静音中':'声音';
  });
  $('#volume').addEventListener('input',event=>transport.setVolume(Number(event.target.value)));
  $('#about-toggle').addEventListener('click',()=>{const hidden=!$('#about').hidden;$('#about').hidden=hidden;$('#about-toggle').setAttribute('aria-expanded',String(!hidden));});
  $('#retry').addEventListener('click',()=>location.reload());
  document.addEventListener('visibilitychange',()=>{if(document.hidden)pause().catch(showError);});
  document.addEventListener('keydown',event=>{
    if(event.key==='Escape'&&started){event.preventDefault();(transport.status==='running'?pause():play()).catch(showError);}
  });
  const debug=new URLSearchParams(location.search).has('debug');$('#debug').hidden=!debug;
  document.querySelectorAll('[data-beat]').forEach(button=>button.addEventListener('click',()=>seek(Number(button.dataset.beat)).catch(showError)));
  $('#contacts').addEventListener('change',event=>{experience.street.showContacts(event.target.checked);experience.render(transport.sample().beat,false);});
  $('#capture').addEventListener('click',async()=>{
    const button=$('#capture');button.disabled=true;button.textContent='录制中…';
    try{
      const {blob,mime}=await record();const url=URL.createObjectURL(blob),link=document.createElement('a');
      link.href=url;link.download=`dream-street-g1.${mime.includes('mp4')?'mp4':'webm'}`;link.click();setTimeout(()=>URL.revokeObjectURL(url),10000);
    }catch(error){showError(error);}finally{button.disabled=false;button.textContent='录制 40 秒';}
  });
  experience.renderer.setAnimationLoop(time=>{
    if(transport.status==='running')experience.render(transport.sample().beat);
    if(recording&&transport.context){
      const stamp=transport.context.getOutputTimestamp?.();
      if(stamp?.contextTime>0)transport.voices.setRecordingDelay(transport.context.currentTime-stamp.contextTime-(performance.now()-stamp.performanceTime)/1000);
    }
    if(time-lastHud>250){
      updateControls();lastHud=time;
      if(debug){const d=experience.diagnostics(),t=transport.diagnostics();$('#diagnostics').textContent=JSON.stringify({beat:+d.beat.toFixed(3),outfit:d.wardrobe.outfit,clock:t.syncMode,voices:t.activeVoices,drawCalls:d.calls,p50:d.p50,p95:d.p95,textures:d.textures,geometry:d.geometries,contactCache:d.contactCache},null,2);}
    }
  });
  window.__dreamStreet={ready:true,play,pause,seek,record,
    snapshot:()=>({visual:experience.diagnostics(),audio:transport.diagnostics()}),
    showContacts:show=>{experience.street.showContacts(show);experience.render(transport.sample().beat,false);},
    project:point=>{const p=point.clone?point:experience.walker.root.position.clone().set(...point);const out=p.project(experience.camera);return {x:(out.x*.5+.5)*experience.viewport.width,y:(-.5*out.y+.5)*experience.viewport.height};},
    get renderer(){return experience;},get transport(){return transport;},
  };
  updateControls();
}catch(error){showError(error);startButton.disabled=true;startButton.textContent='暂时无法开启街道';}
