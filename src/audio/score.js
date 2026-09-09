import {FOUR_HITS,mod,themeWeightsAt} from '../content/plan.js';
import {CONFIG} from '../config.js';

export const STEMS=['kick','clap','hat','wood','bass','chord','melody','arp'];
const arrangements={
  daylight:{roots:[38,38,43,43,36,36,38,45],chords:[[62,65,69,72],[62,65,69,76],[59,62,67,69],[59,64,67,74],[60,64,67,71],[60,64,69,72],[57,62,65,69],[57,60,64,67]],
    melody:[[74,77,76,69],[74,76,79,77],[76,74,72,71],[69,72,74,77]]},
  pocket:{roots:[38,38,41,41,43,43,36,45],chords:[[57,60,62,65],[57,62,65,69],[57,60,64,65],[57,60,65,69],[59,62,65,67],[59,62,67,69],[55,60,64,67],[57,60,64,67]],
    melody:[[69,72,74,65],[69,67,65,64],[67,69,74,72],[67,64,62,60]]},
  lyric:{roots:[50,45,46,48,50,43,45,50],chords:[[62,65,69,76],[57,60,64,69],[58,62,65,69],[60,64,67,74],[62,65,69,74],[55,59,62,69],[57,61,64,71],[62,65,69,74]],
    melody:[[77,76,74,69],[74,72,69,65],[76,74,72,69],[69,73,74,77]]},
  parade:{roots:[38,43,36,41,38,43,36,45],chords:[[62,65,69,72],[59,62,67,74],[60,64,67,72],[60,65,69,74],[62,65,69,76],[62,67,69,74],[60,64,67,71],[60,64,67,69]],
    melody:[[74,77,81,79],[79,77,74,72],[76,77,79,76],[74,72,69,74]]},
};

/** Half-open queries make the score independent of scheduler cadence and visual state. */
export function notesBetween(from,to){
  const result=[];
  for(let bar=Math.max(0,Math.floor(from/4));bar<=Math.floor(to/4);bar++){
    const b=bar*4,local=mod(b,CONFIG.cycleBeats),phrase=Math.floor(local/8)%4;
    for(const [variant,score] of Object.entries(arrangements)){
      const emit=(stem,offset,velocity,notes,duration)=>{
        const beat=b+offset;
        if(beat<Math.max(0,from)||beat>=to)return;
        const weight=themeWeightsAt(beat).find(t=>t.id===variant)?.weight??0;
        if(weight<=0)return;
        result.push({id:`${variant}:${stem}:${beat}`,variant,stem,beat,velocity:velocity*weight,notes,duration});
      };
      const pocket=variant==='pocket',parade=variant==='parade',lyric=variant==='lyric';
      const chord=score.chords[bar%8],root=score.roots[bar%8],motif=score.melody[phrase];
      const last=bar%4===3,answer=bar%2===1;
      if(lyric){
        // A half-time chamber interlude makes flowers and slow turns audible as a new scene.
        emit('chord',0,.37,chord,8);
        emit('bass',0,.30,[root],3.8);
        if(bar%2)emit('bass',2.75,.22,[root+7],2);
        for(const [i,offset] of [0,.75,1.5,2.75].entries())emit('arp',offset,.28-i*.025,[chord[i]],3.1);
        if(bar%4!==3)for(const [i,offset] of [answer?1:0,answer?3.25:2.5].entries())emit('melody',offset,.38,[motif[(bar+i)%4]],3.8);
        if(bar%2===0)emit('wood',3,.085,[81],.6);
        continue;
      }
      const quiet=local<8||local>=64&&local<72||local>=136&&local<144;
      const kick=pocket?[0,1.65,2.5,3.5]:parade?[0,1.5,2,3.5]:[0,1,2,3];
      kick.forEach((offset,i)=>emit('kick',offset,FOUR_HITS.includes(local+offset)?1:i===0?.86:.67,null,.75));
      for(const q of pocket?[2]:[1,3])emit('clap',q,quiet?.26:pocket?.68:.47,null,.65);
      if(pocket&&last)emit('clap',3.75,.17,null,.4);
      for(let i=0;i<8;i++){
        if(quiet&&i%2===0)continue;
        const swing=pocket&&i%2?.08:parade&&i%2?.035:0;
        emit('hat',i*.5+swing,(i%2?.28:.12)*(quiet?.65:1),null,i===7&&last?.65:.25);
      }
      if(!quiet){
        for(const [i,offset] of (pocket?[.85,3.25]:parade?[.75,1.75,2.75,3.25]:[.75,2.75,3.5]).entries())
          if(!last||offset<3.25)emit('wood',offset,.22+(i%2)*.10,[67+(bar%3)*2],.55);
        if(last)for(const [i,offset] of [3.25,3.5,3.75].entries())emit('wood',offset,.20+i*.045,[64-i*2],.45);
      }
      const bass=pocket?[0,.85,1.65,2.5,3.6]:parade?[0,.75,1.5,2,2.75,3.5]:[0,.75,1.5,2.75,3.5];
      bass.forEach((offset,i)=>emit('bass',offset,.54-(i%3)*.035,[root+(i===3?7:i===4&&answer?12:0)],pocket?1.3:.95));
      if(!FOUR_HITS.includes(local))emit('chord',0,quiet?.23:parade?.36:.31,chord,parade?2.5:4.5);
      if(parade&&!quiet)emit('chord',2.5,.24,chord,1.4);
      if(pocket&&answer&&!quiet)emit('chord',3.25,.18,chord,1.6);
      if(!quiet&&local>=8){
        const offsets=pocket?(answer?[1.65,3.1]:[.6,2.5]):parade?(answer?[.5,1.25,2.5,3.5]:[0,1.5,2.75]):(answer?[1.25,2.5]:[.5,2.25,3.5]);
        if(bar%8!==7)offsets.forEach((offset,i)=>emit('melody',offset,parade?.40:pocket?.32:.34,[motif[(bar+i)%4]],parade?2:2.5));
        if(!pocket&&bar%4<3)for(let i=0;i<8;i++)emit('arp',i*.5+.25,parade?.10:.14,[chord[(i+bar)%4]+12],1.1);
      }
      for(const hit of FOUR_HITS)if(hit>=local&&hit<local+4)emit('chord',hit-local,.70,chord,2.1);
      if((local===76||local===140||local===204)&&!pocket){
        for(let i=0;i<4;i++)emit('arp',i+.5,.19,[chord[i]+12],2.5);
      }
    }
  }
  return result.sort((a,b)=>a.beat-b.beat||a.id.localeCompare(b.id));
}
export function activeNotesAt(beat){return notesBetween(beat-8,beat).filter(n=>n.beat+n.duration>beat);}
