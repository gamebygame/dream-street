import {STEMS} from './score.js';

const frequency=midi=>440*2**((midi-69)/12);
function random(seed){let x=seed>>>0;return()=>{x=(1664525*x+1013904223)>>>0;return x/4294967296*2-1;};}

export class Voices{
  constructor(context){
    this.context=context;this.cache=new Map();this.active=new Set();this.stems={};
    this.master=context.createGain();this.master.gain.value=.45;
    this.compressor=context.createDynamicsCompressor();
    this.compressor.threshold.value=-14;this.compressor.knee.value=18;this.compressor.ratio.value=3;
    this.compressor.attack.value=.012;this.compressor.release.value=.22;
    this.master.connect(this.compressor);this.compressor.connect(context.destination);
    this.capture=context.createMediaStreamDestination();this.captureDelay=context.createDelay(.5);
    this.compressor.connect(this.captureDelay);this.captureDelay.connect(this.capture);
    for(const stem of STEMS){const gain=context.createGain();gain.connect(this.master);this.stems[stem]=gain;}
    this.volume=.45;this.muted=false;this.paused=false;
  }
  setVolume(value){this.volume=Math.max(0,Math.min(1,value));this.applyVolume();}
  setMuted(value){this.muted=value;this.applyVolume();}
  applyVolume(){this.master.gain.setTargetAtTime(this.muted||this.paused?0:this.volume,this.context.currentTime,.02);}
  setPaused(value){this.paused=value;this.applyVolume();}
  setRecordingDelay(seconds){this.captureDelay.delayTime.setTargetAtTime(Math.max(0,Math.min(.3,seconds)),this.context.currentTime,.03);}
  bufferFor(note){
    const key=`${note.stem}:${note.notes?.join(',')||''}:${note.duration}`;
    if(this.cache.has(key))return this.cache.get(key);
    const rate=this.context.sampleRate,duration=note.duration*.5;
    const buffer=this.context.createBuffer(2,Math.ceil(rate*duration),rate);
    const rand=random(137+note.stem.charCodeAt(0)),data=buffer.getChannelData(0),right=buffer.getChannelData(1);
    let previousNoise=0,lowNoise=0;
    for(let i=0;i<data.length;i++){
      const t=i/rate,tail=Math.min(1,(duration-t)/.025);let sample=0;
      const noise=rand();lowNoise=.68*lowNoise+.32*noise;const bright=noise-previousNoise;previousNoise=noise;
      if(note.stem==='kick'){
        const phase=2*Math.PI*(47*t+(100*.025)*(1-Math.exp(-t/.025)));
        sample=.88*Math.sin(phase)*Math.exp(-t/ .11)+.035*bright*Math.exp(-t/.006);
      }else if(note.stem==='clap'){
        const bursts=[0,.013,.026].reduce((s,o)=>s+(t>=o?Math.exp(-(t-o)/.007):0),0);
        sample=(noise-lowNoise)*(.27*bursts+.19*Math.exp(-t/.055));
      }else if(note.stem==='hat'){
        sample=bright*.19*Math.exp(-t/.028);
      }else if(note.stem==='wood'){
        const f=frequency(note.notes[0]);
        sample=(Math.sin(2*Math.PI*f*t)+.45*Math.sin(2*Math.PI*f*2.67*t))*.32*Math.exp(-t/.055)+.08*noise*Math.exp(-t/.008);
      }else if(note.stem==='bass'){
        const f=frequency(note.notes[0]),attack=Math.min(1,t/.006);
        const tone=Math.sin(2*Math.PI*f*t)+.22*Math.sin(2*Math.PI*f*2*t)+.085*Math.sin(2*Math.PI*f*3*t);
        sample=.52*tone*attack*Math.exp(-t/.16);
      }else if(note.stem==='chord'){
        const envelope=(1-Math.exp(-t/.018))*Math.exp(-t/.74)*Math.min(1,(duration-t)/.4);
        for(const n of note.notes){const f=frequency(n);sample+=(Math.sin(2*Math.PI*f*t)+.16*Math.sin(2*Math.PI*f*2.002*t)+.12*Math.sin(2*Math.PI*f*.998*t))*.16*envelope;}
      }else{
        const f=frequency(note.notes[0]),envelope=(1-Math.exp(-t/.008))*Math.exp(-t/.22);
        sample=(Math.sin(2*Math.PI*f*t)+.18*Math.sin(2*Math.PI*f*2*t)*Math.exp(-t/.07))*.38*envelope;
      }
      const fade=Math.max(0,tail);data[i]=sample*fade;right[i]=sample*fade;
    }
    this.cache.set(key,buffer);return buffer;
  }
  prewarm(notes){for(const note of notes)this.bufferFor(note);}
  play(note,when,offset=0){
    const buffer=this.bufferFor(note);
    if(offset>=buffer.duration)return;
    const source=this.context.createBufferSource(),gain=this.context.createGain();
    source.buffer=buffer;gain.gain.value=note.velocity;
    if(offset>0){gain.gain.setValueAtTime(0,when);gain.gain.linearRampToValueAtTime(note.velocity,when+.012);}
    source.connect(gain);gain.connect(this.stems[note.stem]);
    const voice={source,gain,id:note.id,when};this.active.add(voice);
    source.onended=()=>{source.disconnect();gain.disconnect();this.active.delete(voice);};
    source.start(when,Math.max(0,offset));
  }
  stopAll(){
    for(const voice of this.active){voice.source.stop();voice.source.disconnect();voice.gain.disconnect();}
    this.active.clear();
  }
  dispose(){this.stopAll();this.cache.clear();for(const stem of Object.values(this.stems))stem.disconnect();this.master.disconnect();this.compressor.disconnect();this.captureDelay.disconnect();}
}
