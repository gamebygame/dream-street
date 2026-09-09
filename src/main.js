import './style.css';
import {ExperienceRenderer} from './render/scene.js';
import {Transport} from './audio/transport.js';
import {ReferenceMusic} from './audio/reference.js';
import {validatePlan} from './content/plan.js';

const $=selector=>document.querySelector(selector);
const entrance=$('#entrance'),startButton=$('#start'),pauseButton=$('#pause'),status=$('#status');
let experience,transport,reference,recording=false,lastHud=0,started=false;
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
function musicStatus(data){
  const names={silent:'无声动作检查',youtube:'Ecstatic Vibrations, Totally Transcendent · Sea Power',file:reference?.fileName||'本机音频'};
  const states={loading:'连接官方音源…',buffering:'等待音源缓冲…',blocked:'请点击官方播放器中的播放按钮',error:'音源暂时不可用',ready:'已选择',playing:'正在播放',paused:'已暂停',idle:'已选择'};
  $('#music-status').textContent=`${names[data.mode]} · ${states[data.status]||data.status}`;
  $('#official-caption').textContent='Ecstatic Vibrations, Totally Transcendent · Sea Power';
  document.querySelectorAll('[data-music]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.music===data.mode)));
}
async function chooseMusic(mode){
  const running=transport.status==='running';await pause();$('#official-shell').hidden=mode!=='youtube';
  try{await reference.select(mode);if(running)await play();}
  catch(error){$('#music-status').textContent=error.message;$('#music-panel').hidden=false;}
}

async function record({seconds=128.5,fromBeat=0,visualOnly=false}={}){
  if(recording)throw new Error('Already recording.');
  if(reference.mode==='youtube'&&!visualOnly)throw new Error('官方在线播放的声音无法录入视频。含声音的录制需要选择自己的本机音频文件。');
  if(!window.MediaRecorder||!experience.renderer.domElement.captureStream)throw new Error('当前浏览器不支持演示录制。');
  recording=true;
  try{
    await pause();await seek(fromBeat);await transport.ensureAudio();
    const canvasStream=experience.renderer.domElement.captureStream(60);
    const hasAudio=reference.mode==='file'&&!visualOnly;
    const stream=new MediaStream([...canvasStream.getVideoTracks(),...(hasAudio?transport.voices.capture.stream.getAudioTracks():[])]);
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
    return {blob,mime,seconds,bytes:blob.size,fromBeat,endBeat:transport.sample().beat,audioSource:reference.mode,hasAudio};
  }finally{recording=false;}
}

try{
  validatePlan();experience=new ExperienceRenderer($('#stage'));
  reference=new ReferenceMusic({element:'official-player',onChange:musicStatus,onPause:()=>pause().catch(showError),onPlay:beat=>(Number.isFinite(beat)?seek(beat).then(play):play()).catch(showError),onError:error=>{pause().catch(showError);$('#music-status').textContent=error.message;$('#music-panel').hidden=false;}});
  transport=new Transport({reference});
  startButton.disabled=true;startButton.firstChild.textContent='准备街道… ';
  await experience.warmup();startButton.disabled=false;startButton.firstChild.textContent='开始前行 ';
  startButton.addEventListener('click',async()=>{startButton.disabled=true;try{await play();}catch(error){showError(error);}finally{startButton.disabled=false;}});
  pauseButton.addEventListener('click',()=>{(transport.status==='running'?pause():play()).catch(showError);});
  $('#mute').addEventListener('click',()=>{
    transport.setMuted(!transport.muted);$('#mute').setAttribute('aria-pressed',String(transport.muted));$('#mute').textContent=transport.muted?'静音中':'声音';
  });
  $('#volume').addEventListener('input',event=>transport.setVolume(Number(event.target.value)));
  $('#about-toggle').addEventListener('click',()=>{const hidden=!$('#about').hidden;$('#about').hidden=hidden;$('#about-toggle').setAttribute('aria-expanded',String(!hidden));});
  $('#music-toggle').addEventListener('click',()=>{$('#music-panel').hidden=!$('#music-panel').hidden;$('#music-toggle').setAttribute('aria-expanded',String(!$('#music-panel').hidden));});
  document.querySelectorAll('[data-music]').forEach(button=>button.addEventListener('click',()=>chooseMusic(button.dataset.music)));
  $('#music-file').addEventListener('change',async event=>{
    const file=event.target.files?.[0];if(!file)return;
    const running=transport.status==='running';await pause();
    try{await transport.ensureAudio();await reference.loadFile(file,transport.context,transport.voices);$('#official-shell').hidden=true;if(running)await play();}
    catch(error){$('#music-status').textContent=`无法读取这份音频：${error.message}`;}
  });
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
      const {blob,mime,hasAudio}=await record({visualOnly:reference.mode==='youtube'});const url=URL.createObjectURL(blob),link=document.createElement('a');
      link.href=url;link.download=`dream-street-g2-2${hasAudio?'':'-silent'}.${mime.includes('mp4')?'mp4':'webm'}`;link.click();setTimeout(()=>URL.revokeObjectURL(url),10000);
    }catch(error){showError(error);}finally{button.disabled=false;button.textContent='录制 128 秒';}
  });
  experience.renderer.setAnimationLoop(time=>{
    if(transport.status==='running')experience.render(transport.sample().beat);
    if(recording&&transport.context){
      const stamp=transport.context.getOutputTimestamp?.();
      if(stamp?.contextTime>0)transport.voices.setRecordingDelay(transport.context.currentTime-stamp.contextTime-(performance.now()-stamp.performanceTime)/1000);
    }
    if(time-lastHud>250){
      updateControls();lastHud=time;
      if(debug){const d=experience.diagnostics(),t=transport.diagnostics();$('#diagnostics').textContent=JSON.stringify({beat:+d.beat.toFixed(3),outfit:d.wardrobe.outfit,theme:d.theme,crowd:d.crowd,cyclists:d.cyclists.visible,clock:t.syncMode,music:t.music.mode,voices:t.activeVoices,drawCalls:d.calls,p50:d.p50,p95:d.p95,textures:d.textures,geometry:d.geometries,contactCache:d.contactCache},null,2);}
    }
  });
  window.__dreamStreet={ready:true,play,pause,seek,record,chooseMusic,
    snapshot:()=>({visual:experience.diagnostics(),audio:transport.diagnostics()}),
    showContacts:show=>{experience.street.showContacts(show);experience.render(transport.sample().beat,false);},
    project:point=>{const p=point.clone?point:experience.walker.root.position.clone().set(...point);const out=p.project(experience.camera);return {x:(out.x*.5+.5)*experience.viewport.width,y:(-.5*out.y+.5)*experience.viewport.height};},
    get renderer(){return experience;},get transport(){return transport;},get music(){return reference;},
  };
  updateControls();musicStatus(reference.diagnostics());
  const silent=new URLSearchParams(location.search).get('music')==='silent';
  if(silent){await chooseMusic('silent');$('#music-status').textContent='无声动作检查 · 此模式不代表音乐交付';}
}catch(error){showError(error);startButton.disabled=true;startButton.textContent='暂时无法开启街道';}
