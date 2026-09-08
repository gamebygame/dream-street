import {mod} from '../content/plan.js';
import {CONFIG} from '../config.js';

const TAU=Math.PI*2;
const smooth=t=>t*t*(3-2*t);
const mix=(a,b,t)=>a+(b-a)*t;
const vMix=(a,b,t)=>a.map((v,i)=>mix(v,b[i],t));

/**
 * @typedef {Object} Pose
 * @property {number[]} hip Root translation below the shared travel anchor.
 * @property {number} yaw Body rotation in radians.
 * @property {number[]} chest
 * @property {number[]} head
 * @property {number[]} leftHand
 * @property {number[]} rightHand
 * @property {number[]} leftFoot
 * @property {number[]} rightFoot
 * @property {number} coat
 */

export function walkFoot(beat,side){
  const p=mod(beat+(side===1?0:1),2);
  const stride=CONFIG.distancePerBeat/CONFIG.actorScale;
  if(p<1) return [side*.19,.095,stride*(.5-p)];
  const u=p-1;
  return [side*.19,.095+.15*Math.sin(Math.PI*u),stride*(smooth(u)-.5)];
}

function base(beat){
  return {hip:[.025*Math.sin(Math.PI*beat),.89+.008*Math.cos(TAU*beat),0],yaw:0,
    chest:[-.025,0,.025*Math.sin(Math.PI*beat)],head:[0,0,0],
    leftHand:[.35,.83,.06-.16*Math.sin(Math.PI*beat)],
    rightHand:[-.35,.83,.06+.16*Math.sin(Math.PI*beat)],
    leftFoot:walkFoot(beat,1),rightFoot:walkFoot(beat,-1),coat:0};
}

/** @param {number} beat Global quarter-note position. @returns {Pose} */
export function sampleWalk(beat){return base(beat);}

function groove(beat){
  const p=base(beat), wave=Math.sin(Math.PI*beat),pulse=(1-Math.cos(TAU*beat))*.5;
  const open=(1-Math.cos(TAU*beat/16))*.5;
  p.hip=[.055*wave,.91-.035*pulse,.015*Math.cos(Math.PI*beat)];
  p.chest=[.045+.025*pulse,.07*wave,-.065*wave];
  p.head=[-.035*pulse,-.06*wave,.03*wave];
  p.leftHand=[.42+.18*open,1.11+.18*open+.1*Math.sin(Math.PI*beat+.7),.2+.17*wave];
  p.rightHand=[-.42-.18*open,1.11+.18*open-.1*Math.sin(Math.PI*beat+.7),.2-.17*wave];
  p.leftFoot[1]+=p.leftFoot[1]>.08?.035*pulse:0;
  p.rightFoot[1]+=p.rightFoot[1]>.08?.035*pulse:0;
  p.coat=.06*wave;
  return p;
}

const pose=(override)=>({...base(0),hip:[0,.9,0],leftFoot:[.22,.075,.1],rightFoot:[-.22,.075,-.12],...override});
const hat=pose({hip:[-.025,.86,.015],chest:[.08,.08,.08],head:[.1,-.08,-.12],
  rightHand:[-.13,1.91,.19],leftHand:[.53,1.04,.3],rightFoot:[-.22,.075,.29]});
const chest=pose({hip:[0,.85,0],chest:[-.12,0,0],head:[-.05,0,0],
  leftHand:[.75,1.43,.21],rightHand:[-.75,1.43,.21],leftFoot:[.29,.075,.15],rightFoot:[-.29,.075,.15]});
const turn=pose({hip:[.015,.89,0],yaw:-.72,chest:[.015,-.15,-.1],head:[0,.14,0],
  leftHand:[.62,1.6,.18],rightHand:[-.38,1.13,.41],leftFoot:[.24,.075,.26],rightFoot:[-.24,.075,-.23],coat:.35});
const open=pose({hip:[0,.94,0],yaw:.05,chest:[-.085,0,0],head:[-.06,0,0],
  leftHand:[.87,1.65,.08],rightHand:[-.87,1.65,.08],leftFoot:[.26,.075,.08],rightFoot:[-.26,.075,.08],coat:.12});

/** The entire four-hit phrase has authored anticipations, readable holds, and recoveries. */
function phraseKeys(globalStart){
  return [
    [0,groove(globalStart)],
    [1.2,pose({hip:[-.02,.87,0],chest:[.12,0,.04],rightHand:[-.27,1.65,.34],leftHand:[.32,.98,.36]})],
    [1.82,pose({...hat,hip:[-.03,.83,0],rightHand:[-.16,1.83,.25]})],
    [2,hat],[2.42,hat],
    [3.15,pose({hip:[0,.89,0],chest:[.08,0,0],leftHand:[.17,1.19,.43],rightHand:[-.17,1.19,.43]})],
    [3.8,pose({hip:[0,.79,0],leftHand:[.49,1.3,.33],rightHand:[-.49,1.3,.33]})],
    [4,chest],[4.42,chest],
    [5.12,pose({hip:[.04,.85,0],yaw:.25,chest:[.06,.1,0],leftHand:[.34,1.21,.42],rightHand:[-.51,1.52,.27],coat:-.12})],
    [5.8,pose({...turn,yaw:-.52,hip:[.04,.86,0],coat:.24})],
    [6,turn],[6.4,turn],
    [7.1,pose({hip:[0,.86,0],yaw:-.26,chest:[.12,0,0],leftHand:[.22,1.1,.4],rightHand:[-.22,1.1,.4],coat:.22})],
    [7.8,pose({...open,hip:[0,.87,0],leftHand:[.65,1.39,.24],rightHand:[-.65,1.39,.24]})],
    [8,open],[8.52,open],
    [10,pose({hip:[0,.91,0],leftHand:[.56,1.25,.21],rightHand:[-.56,1.25,.21],coat:.04})],
    [12,groove(globalStart+12)],
  ];
}

function blend(a,b,t){
  const result={};
  for(const key of Object.keys(a)) result[key]=Array.isArray(a[key])?vMix(a[key],b[key],t):mix(a[key],b[key],t);
  return result;
}

/** @param {number} beat Global quarter-note position. @returns {Pose} */
export function sampleDance(beat){
  const local=mod(beat,80);
  if(local<48||local>60) return groove(beat);
  const t=local-48,keys=phraseKeys(beat-t);
  for(let i=1;i<keys.length;i++){
    if(t<=keys[i][0]){
      const [ta,a]=keys[i-1],[tb,b]=keys[i];
      return blend(a,b,smooth((t-ta)/(tb-ta)));
    }
  }
  return groove(beat);
}
