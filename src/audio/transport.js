import {CONFIG} from '../config.js';
import {notesBetween,activeNotesAt} from './score.js';
import {Voices} from './voices.js';

export function outputTime(context,now){
  if(context.state==='running'&&typeof context.getOutputTimestamp==='function'){
    const stamp=context.getOutputTimestamp();
    const age=(now-stamp.performanceTime)/1000;
    if(stamp.contextTime>0 && Number.isFinite(stamp.contextTime)&&age>=-.01&&age<.5){
      return {time:Math.max(0,Math.min(context.currentTime,stamp.contextTime+age)),mode:'output-timestamp'};
    }
  }
  return {time:context.currentTime,mode:'currentTime-fallback'};
}

export class Transport{
  constructor({contextFactory,now=()=>performance.now(),setTimer=(fn,ms)=>globalThis.setInterval(fn,ms),clearTimer=id=>globalThis.clearInterval(id),wait=ms=>new Promise(resolve=>setTimeout(resolve,ms)),voicesFactory=ctx=>new Voices(ctx)}={}){
    this.contextFactory=contextFactory||(()=>new AudioContext({latencyHint:'interactive'}));
    this.now=now;this.setTimer=setTimer;this.clearTimer=clearTimer;this.wait=wait;this.voicesFactory=voicesFactory;
    this.status='idle';this.heldBeat=0;this.lastBeat=0;this.generation=0;this.timer=null;
    this.context=null;this.voices=null;this.volume=.45;this.muted=false;this.syncMode='not-started';this.error=null;
  }
  async ensureAudio(){
    if(this.context)return;
    this.context=this.contextFactory();this.voices=this.voicesFactory(this.context);
    this.voices.prewarm(notesBetween(0,160));this.voices.setVolume(this.volume);this.voices.setMuted(this.muted);
    this.context.addEventListener?.('statechange',()=>{
      if(this.status==='running'&&this.context.state!=='running') this.pause();
    });
  }
  sample(){
    let beat=this.heldBeat;
    if(this.status==='running'){
      const stamp=outputTime(this.context,this.now());this.syncMode=stamp.mode;
      beat=Math.max(this.lastBeat,this.heldBeat+Math.max(0,stamp.time-this.epoch)*2);
      this.lastBeat=beat;
    }
    return {beat,travelS:beat*CONFIG.distancePerBeat,status:this.status};
  }
  async resume(){
    if(this.status==='running'||this.status==='starting')return;
    const generation=++this.generation;this.status='starting';
    try{
      if(this.pausePromise)await this.pausePromise;
      if(generation!==this.generation)return;
      await this.ensureAudio();
      if(generation!==this.generation)return;
      await this.context.resume();
      if(generation!==this.generation){
        if(this.status==='paused')await this.context.suspend();
        return;
      }
      if(this.context.state!=='running')throw new Error('浏览器尚未允许声音播放。请再次点击继续。');
      this.epoch=this.context.currentTime+.1;this.lastBeat=this.heldBeat;
      this.cursor=this.heldBeat;this.voices.stopAll();this.voices.setPaused(false);
      for(const note of activeNotesAt(this.heldBeat))this.voices.play(note,this.epoch,(this.heldBeat-note.beat)/2);
      this.status='running';this.schedule();
      this.timer=this.setTimer(()=>{if(generation===this.generation)this.schedule();},CONFIG.schedulerInterval);
    }catch(error){this.error=error;await this.pause();throw error;}
  }
  schedule(){
    if(this.status!=='running')return;
    const now=this.context.currentTime;
    const horizon=this.heldBeat+(now+CONFIG.audioLookahead-this.epoch)*2;
    if(horizon<=this.cursor)return;
    for(const note of notesBetween(this.cursor,horizon)){
      const scheduled=this.epoch+(note.beat-this.heldBeat)/2;
      const offset=Math.max(0,now-scheduled);
      if(offset<note.duration/2)this.voices.play(note,Math.max(now,scheduled),offset);
    }
    this.cursor=horizon;
  }
  async pause(){
    if(this.pausePromise){this.status='paused';this.generation++;return this.pausePromise;}
    this.heldBeat=this.sample().beat;this.lastBeat=this.heldBeat;this.status='paused';this.generation++;
    if(this.timer!==null){this.clearTimer(this.timer);this.timer=null;}
    if(this.context?.state==='running'){
      this.voices.setPaused(true);
      this.pausePromise=(async()=>{
        // Freeze the logical beat immediately, but let the output release before suspension.
        await this.wait(90);this.voices.stopAll();await this.context.suspend();
      })().finally(()=>{this.pausePromise=null;});
      return this.pausePromise;
    }
    this.voices?.stopAll();
  }
  async seek(beat){
    const running=this.status==='running';await this.pause();
    this.heldBeat=Math.max(0,Number.isFinite(beat)?beat:0);this.lastBeat=this.heldBeat;
    if(running)await this.resume();
  }
  setVolume(value){this.volume=Math.max(0,Math.min(1,value));this.voices?.setVolume(this.volume);}
  setMuted(value){this.muted=Boolean(value);this.voices?.setMuted(this.muted);}
  diagnostics(){return {...this.sample(),syncMode:this.syncMode,contextState:this.context?.state||'not-created',activeVoices:this.voices?.active.size||0,cachedBuffers:this.voices?.cache.size||0,schedulers:this.timer===null?0:1,generation:this.generation};}
  async dispose(){await this.pause();this.voices?.dispose();await this.context?.close();}
}
