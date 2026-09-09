import {mod} from '../content/plan.js';

export const REFERENCE_VIDEO='knOXppaqBYY';
export function referenceWindowAt(beat,duration){
  const length=duration>0?duration*2:Infinity;
  const start=Number.isFinite(length)?Math.floor(beat/length+1e-9)*length:0;
  return {start,end:start+length};
}

/** The official iframe stays visible. Only a user-selected local file enters the capture graph. */
export class ReferenceMusic{
  constructor({element,onChange=()=>{},onPause=()=>{},onPlay=()=>{},onError=()=>{}}={}){
    this.element=element;this.onChange=onChange;this.onPause=onPause;this.onPlay=onPlay;this.onError=onError;
    this.mode='youtube';this.status='idle';this.volume=.45;this.muted=false;this.token=0;this.active=null;
  }
  get enabled(){return this.mode!=='silent';}
  get duration(){
    if(this.mode==='file')return this.buffer?.duration||0;
    const reported=this.player?.getDuration?.()||0;
    // YouTube can alternate rounded metadata and the precise media duration when paused.
    if(reported>0)this.trackDuration=Math.min(this.trackDuration||Infinity,reported);
    return this.trackDuration||0;
  }
  get waiting(){return this.mode==='youtube'&&this.active&&(this.starting||this.status!=='playing');}
  notify(status){this.status=status;this.onChange(this.diagnostics());}
  async select(mode){
    if(!['youtube','file','silent'].includes(mode))throw new Error('Unknown music source.');
    this.pause();this.mode=mode;
    if(mode==='youtube')await this.ensurePlayer();
    if(mode==='file'&&!this.buffer)throw new Error('请先选择本机音频文件。');
    this.notify('ready');
  }
  async loadFile(file,context,voices){
    const decoded=await context.decodeAudioData(await file.arrayBuffer());
    if(decoded.duration<2)throw new Error('音频长度不足两秒。');
    this.pause();this.buffer=decoded;this.fileName=file.name;this.context=context;
    if(!this.gain){this.gain=context.createGain();this.gain.connect(voices.master);}
    await this.select('file');
  }
  ensurePlayer(){
    if(this.playerReady)return this.playerReady;
    this.notify('loading');
    this.playerReady=new Promise((resolve,reject)=>{
      const timeout=setTimeout(()=>reject(new Error('官方音源暂时连接不上。请重试，或选择自己的本机音频文件。')),15000);
      const create=()=>{
        this.player=new window.YT.Player(this.element,{width:320,height:200,videoId:REFERENCE_VIDEO,
          playerVars:{playsinline:1,origin:location.origin,controls:1,rel:0},
          events:{onReady:()=>{clearTimeout(timeout);resolve();},
            onError:event=>{const error=new Error(`官方播放器未能播放（${event.data}）。请重试或选择本机音频。`);clearTimeout(timeout);reject(error);this.notify('error');this.onError(error);},
            onAutoplayBlocked:()=>{this.notify('blocked');},
            onStateChange:event=>{
              if(this.mode!=='youtube')return;
              if(event.data===1&&document.hidden){this.pause();this.onPause();return;}
              if(event.data===1){this.notify('playing');if(!this.active&&performance.now()>(this.ignoreEventsUntil||0))this.onPlay(this.lastWindow?this.lastWindow.start+2*this.player.getCurrentTime():undefined);}
              if(event.data===3)this.notify('buffering');
              if(event.data===2){
                this.notify('paused');
                if(this.active&&performance.now()>(this.ignoreEventsUntil||0))this.onPause();
              }
              if(event.data===0&&this.active&&!this.starting){
                const beat=this.active.start+2*this.duration;
                this.startWindow(referenceWindowAt(beat,this.duration),beat).catch(error=>{this.notify('error');this.onError(error);});
              }
            }}});
      };
      if(window.YT?.Player)create();
      else{
        const previous=window.onYouTubeIframeAPIReady;
        window.onYouTubeIframeAPIReady=()=>{previous?.();create();};
        const script=document.createElement('script');script.src='https://www.youtube.com/iframe_api';script.onerror=()=>{clearTimeout(timeout);reject(new Error('无法连接官方音源。'));};document.head.appendChild(script);
      }
    }).catch(error=>{this.playerReady=null;throw error;});
    return this.playerReady;
  }
  async resume(beat,context,when){
    if(!this.enabled)return;
    this.context=context;const token=this.token;
    if(this.mode==='youtube')await this.ensurePlayer();
    if(token!==this.token)return;
    await this.startWindow(referenceWindowAt(beat,this.duration),beat,when);
  }
  async startWindow(window,beat,when=this.context.currentTime){
    const token=++this.token;this.stopSource();this.active={...window,held:beat};this.starting=true;
    const seconds=(beat-window.start)/2;
    if(this.mode==='file'){
      this.source=this.context.createBufferSource();this.source.buffer=this.buffer;this.source.loop=true;
      this.source.connect(this.gain);this.source.start(when,mod(seconds,this.buffer.duration));this.starting=false;this.notify('playing');return;
    }
    this.ignoreEventsUntil=performance.now()+600;this.notify('buffering');
    this.player.seekTo(seconds,true);this.player.setVolume(this.muted?0:100*this.volume);this.player.playVideo();
    const start=performance.now();
    while(token===this.token){
      if(this.player.getPlayerState()===1&&Math.abs(this.player.getCurrentTime()-seconds)<2){
        this.starting=false;this.notify('playing');return;
      }
      if(this.status==='error'||performance.now()-start>12000){this.active=null;this.starting=false;throw new Error('请在官方播放器中点击播放，或选择本机音频。');}
      await new Promise(resolve=>setTimeout(resolve,80));
    }
  }
  sample(){
    if(this.mode!=='youtube'||!this.active)return null;
    if(this.starting||this.status!=='playing')return {beat:this.active.held,seek:false};
    const beat=this.active.start+2*this.player.getCurrentTime();
    const seek=beat<this.active.held-1||beat>this.active.held+3;
    // The iframe clock is an estimate; tiny delivery jitter must not reverse the street.
    this.active.held=seek?beat:Math.max(this.active.held,beat);return {beat:this.active.held,seek};
  }
  update(beat){
    if(!this.enabled)return;
    if(this.mode==='file'){
      this.gain?.gain.setTargetAtTime(1,this.context.currentTime,.02);
      if(this.active)Object.assign(this.active,referenceWindowAt(beat,this.duration));
    }
    if(this.mode==='youtube'&&this.player?.setVolume){
      const volume=Math.round(this.muted?0:this.volume*100);
      if(volume!==this.appliedVolume){this.player.setVolume(volume);this.appliedVolume=volume;}
    }
  }
  stopSource(release=0){if(this.source){const source=this.source;source.stop(this.context.currentTime+release);source.onended=()=>source.disconnect();this.source=null;}}
  pause(){
    this.token++;this.ignoreEventsUntil=performance.now()+600;if(this.active)this.lastWindow=this.active;this.active=null;this.starting=false;
    this.gain?.gain.setTargetAtTime(0,this.context.currentTime,.015);this.stopSource(.05);
    if(this.player?.pauseVideo)this.player.pauseVideo();this.notify('paused');
  }
  setVolume(value){this.volume=value;this.appliedVolume=null;}
  setMuted(value){this.muted=value;this.appliedVolume=null;}
  allows(){return false;}
  diagnostics(){return {mode:this.mode,status:this.status,file:this.fileName??null,duration:this.duration,window:this.active?{start:this.active.start,end:this.active.end}:null,capturable:this.mode==='file',clock:this.mode==='youtube'?'youtube-player-estimate':'audio-context'};}
  dispose(){this.pause();this.player?.destroy();this.gain?.disconnect();this.buffer=null;}
}
