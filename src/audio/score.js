import {FOUR_HITS,mod} from '../content/plan.js';

export const STEMS=['kick','clap','hat','wood','bass','chord','melody'];
const roots=[38,43,36,38];
const chords=[[62,65,69,72],[59,62,64,67],[60,64,67,71],[57,60,62,65]];
const motives=[[74,77,76,69],[74,76,79,76],[72,76,74,71],[69,72,74,77]];

/** Score events are immutable descriptions. Querying ahead has no visual side effects. */
export function notesBetween(from,to){
  const result=[];
  const emit=(stem,beat,velocity,notes,duration)=>{
    if(beat>=Math.max(0,from)&&beat<to) result.push({id:`${stem}:${beat}`,stem,beat,velocity,notes,duration});
  };
  for(let bar=Math.max(0,Math.floor(from/4));bar<=Math.floor(to/4);bar++){
    const b=bar*4,local=mod(b,80),section=Math.floor(b/8)%4;
    const quiet=local>=64||local<16;
    for(let q=0;q<4;q++){
      const accent=FOUR_HITS.includes(mod(b+q,80));
      emit('kick',b+q,accent?1:.72+((bar+q)%3)*.025,null,.65);
      emit('hat',b+q+.5,quiet?.18:.28+(q%2)*.055,null,.25);
      if(q===1||q===3) emit('clap',b+q,quiet?.25:.42,null,.6);
    }
    if(!quiet){
      for(const [i,offset] of [.75,1.75,3.25].entries()) emit('wood',b+offset,.28+(i%2)*.09,[67+(bar%3)*2],.6);
    }
    const bassPattern=quiet?[0,1.5,2.75]:[0,.75,1.5,2.5,3.25];
    bassPattern.forEach((offset,i)=>emit('bass',b+offset,.49-(i%3)*.055,[roots[section]+(i===3?7:0)],.85));
    if(bar%2===0 && !FOUR_HITS.includes(mod(b,80))) emit('chord',b,quiet?.24:.35,chords[section],6);
    if(local>=16 && local<64){
      const offsets=bar%2===0?[.5,2.25,3.5]:[1.25,2.5];
      offsets.forEach((offset,i)=>emit('melody',b+offset,.26+(i%2)*.045,[motives[section][(bar+i)%4]],1.5));
    }
    for(const hit of FOUR_HITS){
      const global=Math.floor(b/80)*80+hit;
      if(global>=b&&global<b+4) emit('chord',global,.62,chords[section],2.1);
    }
  }
  return result.sort((a,b)=>a.beat-b.beat||a.id.localeCompare(b.id));
}

export function activeNotesAt(beat){
  return notesBetween(beat-8,beat).filter(n=>n.beat+n.duration>beat);
}
