import {mod,wardrobeAt,themeWeightsAt} from '../content/plan.js';
import {CONFIG} from '../config.js';
import {greetingAt} from '../content/social.js';

const TAU=Math.PI*2;
const ease=t=>t*t*(3-2*t),mix=(a,b,t)=>a+(b-a)*t;
const vMix=(a,b,t)=>a.map((v,i)=>mix(v,b[i],t));

export function walkFoot(beat,side){
  const p=mod(beat+(side===1?0:1),2),stride=CONFIG.distancePerBeat/CONFIG.actorScale;
  if(p<1)return [side*.19,.095,stride*(.5-p)];
  const u=p-1;return [side*.19,.095+.10*Math.sin(Math.PI*u),stride*(ease(u)-.5)];
}
function base(beat){
  const s=Math.cos(Math.PI*beat);
  return {hip:[.012*Math.sin(Math.PI*beat),.91+.008*Math.cos(TAU*beat),0],yaw:0,
    chest:[.018,.026*s,.008*Math.sin(Math.PI*beat)],head:[-.025,0,0],
    leftHand:[.29,.715+.035*s,.04-.18*s],rightHand:[-.29,.715-.035*s,.04+.18*s],
    leftFoot:walkFoot(beat,1),rightFoot:walkFoot(beat,-1),
    leftArmWalk:1,rightArmWalk:1,
    leftElbowPole:[.25,-.12,1],rightElbowPole:[-.25,-.12,1],
    leftArmSwing:[.25*Math.cos(Math.PI*beat-.12),.16+.08*(1-Math.cos(Math.PI*beat-.36)),.035],
    rightArmSwing:[-.25*Math.cos(Math.PI*beat-.12),.16+.08*(1+Math.cos(Math.PI*beat-.36)),-.035],
    leftWrist:[.04*Math.sin(Math.PI*beat-.5),0,.04],rightWrist:[-.04*Math.sin(Math.PI*beat-.5),0,-.04],
    leftAnkle:[0,0,0],rightAnkle:[0,0,0],coat:.035*s,propTurn:0,propOpen:1};
}
export function sampleWalk(beat,{social=true}={}){
  const p=base(beat);
  if(social){
    const cue=greetingAt(beat);p.head[1]=cue.look;p.chest[1]+=cue.look*.10;
    p.head[0]+=.10*Math.abs(cue.reply);
    if(cue.reply<0){p.rightHand=vMix(p.rightHand,[-.53,1.66,.18],-cue.reply);p.rightArmWalk=1+cue.reply;}
    if(cue.reply>0){p.leftHand=vMix(p.leftHand,[.53,1.66,.18],cue.reply);p.leftArmWalk=1-cue.reply;}
  }
  return p;
}

const pose=overrides=>({...base(0),leftArmWalk:0,rightArmWalk:0,hip:[0,.90,0],leftHand:[.29,.72,.02],rightHand:[-.29,.72,.02],
  leftFoot:[.20,.095,.03],rightFoot:[-.20,.095,-.03],...overrides});

// Full-body phrases alternate release, weight transfer, travel and punctuation.
const ELECTRIC=[
  [0,pose({hip:[-.10,.91,0],leftHand:[.27,.68,-.14],rightHand:[-.36,.91,.23],rightFoot:[-.29,.095,.24],chest:[-.04,-.14,.10]})],
  [1,pose({hip:[.12,.84,.01],leftHand:[.44,1.06,.16],rightHand:[-.27,.65,-.12],leftFoot:[.34,.095,.22],rightFoot:[-.15,.16,-.22],rightAnkle:[-.35,.22,0],chest:[.12,.20,-.13]})],
  [2,pose({hip:[.14,.93,-.03],yaw:.23,leftHand:[.21,.73,-.14],rightHand:[-.20,1.38,.38],leftFoot:[.31,.095,-.22],rightFoot:[-.19,.12,.24],leftAnkle:[0,-.3,0],chest:[-.08,-.20,-.09]})],
  [3,pose({hip:[-.12,.87,0],leftHand:[.38,1.33,.26],rightHand:[-.29,.67,-.10],leftFoot:[.10,.19,.27],rightFoot:[-.32,.095,-.07],chest:[.10,.28,.15]})],
  [4,pose({hip:[-.04,.92,0],yaw:-.22,leftHand:[.27,.68,-.10],rightHand:[-.13,1.98,.16],rightWrist:[0,0,-.35],head:[.10,-.12,-.12],leftFoot:[.12,.095,-.20],rightFoot:[-.24,.095,.25]})],
  [4.5,pose({hip:[-.05,.90,0],yaw:-.22,leftHand:[.28,.70,-.12],rightHand:[-.13,1.98,.16],head:[.10,-.12,-.12]})],
  [5.5,pose({hip:[.08,.85,0],yaw:.20,leftHand:[.50,.92,.06],rightHand:[-.40,.68,-.20],leftFoot:[.30,.095,-.16],rightFoot:[-.22,.26,.40],rightAnkle:[-.35,0,0],chest:[.14,-.24,-.11]})],
  [6.5,pose({hip:[.10,.93,0],yaw:.48,leftHand:[.58,1.64,.09],rightHand:[-.27,.68,-.06],leftFoot:[.35,.095,.14],rightFoot:[-.14,.12,-.24],chest:[-.09,.28,-.14]})],
  [7.2,pose({hip:[-.05,.85,0],yaw:.08,leftHand:[.12,1.20,.38],rightHand:[-.16,1.10,.35],leftFoot:[.15,.12,-.05],rightFoot:[-.23,.095,.06],chest:[.15,-.17,0]})],
  [8,pose({hip:[-.12,.89,0],yaw:-.38,leftHand:[.33,.66,-.10],rightHand:[-.57,1.42,.10],leftFoot:[.21,.095,.28],rightFoot:[-.36,.095,-.13],chest:[-.08,-.2,.13]})],
  [9,pose({hip:[.08,.86,-.02],yaw:-.65,leftHand:[.28,.72,.12],rightHand:[-.35,.73,-.12],leftFoot:[.15,.095,-.25],rightFoot:[-.18,.17,.24],leftAnkle:[0,.32,0],chest:[.13,.21,-.09]})],
  [10,pose({hip:[.05,.96,0],yaw:.45,leftHand:[.22,1.27,.27],rightHand:[-.29,.71,-.20],leftFoot:[.28,.17,.22],rightFoot:[-.23,.095,-.20],chest:[-.12,-.20,0]})],
  [11,pose({hip:[-.14,.86,0],yaw:.18,leftHand:[.43,.82,-.14],rightHand:[-.43,.85,.18],leftFoot:[.12,.12,-.28],rightFoot:[-.35,.095,.23],chest:[.14,.14,.12]})],
  [12,pose({hip:[-.12,.91,0],yaw:0,leftHand:[.31,.69,-.12],rightHand:[-.64,1.21,.02],leftFoot:[.33,.095,.04],rightFoot:[-.33,.095,.04],chest:[-.09,-.23,.12]})],
  [13,pose({hip:[.08,.84,0],yaw:-.24,leftHand:[.44,1.12,.25],rightHand:[-.21,.70,-.03],leftFoot:[.10,.095,.25],rightFoot:[-.25,.16,-.13],chest:[.16,.17,-.14]})],
  [14,pose({hip:[.10,.94,0],yaw:.14,leftHand:[.20,.73,-.11],rightHand:[-.24,1.51,.25],leftFoot:[.34,.095,-.10],rightFoot:[-.12,.19,.22],head:[-.10,0,0],chest:[-.12,-.18,-.10]})],
  [15,pose({hip:[-.04,.86,0],leftHand:[.39,.86,.20],rightHand:[-.28,.70,-.15],leftFoot:[.20,.14,.22],rightFoot:[-.28,.095,-.10],chest:[.10,.14,.08]})],
];
const LYRIC=[
  [0,pose({hip:[-.04,.90,0],yaw:-.16,leftHand:[.16,.93,.26],rightHand:[-.15,1.12,.30],head:[.12,-.12,.035],chest:[.09,-.08,.04]})],
  [4,pose({hip:[-.06,.885,.015],yaw:-.18,leftHand:[.13,1.04,.27],rightHand:[-.13,1.17,.29],head:[.20,-.10,.04],chest:[.14,-.09,.05]})],
  [8,pose({hip:[-.06,.885,.015],yaw:-.18,leftHand:[.14,1.02,.28],rightHand:[-.14,1.16,.30],head:[.18,-.12,.04],chest:[.13,-.09,.05]})],
  [12,pose({hip:[.035,.91,0],yaw:.06,leftHand:[.42,1.08,.24],rightHand:[-.20,.99,.29],leftFoot:[.30,.095,.13],rightFoot:[-.15,.095,-.08],leftAnkle:[0,-.15,-.035],head:[.03,.22,-.025],chest:[.035,.06,-.025]})],
  [16,pose({hip:[.055,.915,0],yaw:.22,leftHand:[.54,1.17,.10],rightHand:[-.27,.84,.19],leftFoot:[.36,.095,.15],rightFoot:[-.15,.095,-.08],leftAnkle:[.045,-.24,-.04],head:[-.025,.28,-.05],chest:[-.015,.08,-.035]})],
  [20,pose({hip:[.055,.915,0],yaw:.22,leftHand:[.51,1.15,.13],rightHand:[-.27,.84,.19],leftFoot:[.36,.095,.15],rightFoot:[-.15,.095,-.08],leftAnkle:[.045,-.24,-.04],head:[.005,.24,-.05],chest:[.005,.08,-.035]})],
  [24,pose({hip:[.025,.90,0],yaw:.09,leftHand:[.34,.93,.24],rightHand:[-.21,.91,.27],leftFoot:[.26,.095,.05],rightFoot:[-.16,.095,-.05],head:[.10,.05,-.02],chest:[.07,.035,-.01]})],
  [28,pose({hip:[-.025,.89,.01],yaw:-.08,leftHand:[.18,.87,.29],rightHand:[-.16,1.01,.31],head:[.16,-.10,.03],chest:[.12,-.05,.025]})],
];

function cubic(a,b,c,d,t,leftScale,rightScale){
  const m1=(c-a)*leftScale,m2=(d-b)*rightScale;
  return (2*t*t*t-3*t*t+1)*b+(t*t*t-2*t*t+t)*m1+(-2*t*t*t+3*t*t)*c+(t*t*t-t*t)*m2;
}
function phrase(keys,beat,length=16){
  const t=mod(beat,length);let i=keys.findIndex((k,n)=>t>=k[0]&&t<(keys[n+1]?.[0]??length));
  if(i<0)i=0;
  const a=keys[mod(i-1,keys.length)][1],b=keys[i][1],c=keys[(i+1)%keys.length][1],d=keys[(i+2)%keys.length][1];
  const at=keys[mod(i-1,keys.length)][0]-(i===0?length:0),bt=keys[i][0];
  const ct=keys[(i+1)%keys.length][0]+(i+1>=keys.length?length:0),dt=keys[(i+2)%keys.length][0]+(i+2>=keys.length?length:0);
  const u=(t-bt)/(ct-bt),leftScale=.7*(ct-bt)/(ct-at),rightScale=.7*(ct-bt)/(dt-bt),result={};
  for(const key of Object.keys(b))result[key]=Array.isArray(b[key])?b[key].map((v,j)=>cubic(a[key][j],v,c[key][j],d[key][j],u,leftScale,rightScale)):cubic(a[key],b[key],c[key],d[key],u,leftScale,rightScale);
  result.leftFoot[1]=Math.max(.095,result.leftFoot[1]);result.rightFoot[1]=Math.max(.095,result.rightFoot[1]);
  return result;
}
export function blendPose(a,b,t){
  const result={};for(const key of Object.keys(a))result[key]=Array.isArray(a[key])?vMix(a[key],b[key],t):mix(a[key],b[key],t);return result;
}

function bodyPhrase(beat,theme,outfit){
  const lyric=theme==='lyric',p=lyric?phrase(LYRIC,beat-144,32):phrase(ELECTRIC,beat+(theme==='parade'?4:0));
  // Sustained movement has its own timing; the electric outfit accents must not leak into it.
  if(lyric){
    p.leftElbowPole=[.20,-1,.15];p.rightElbowPole=[-.20,-1,.15];
    const breath=Math.sin(TAU*(beat-144)/16);
    p.hip[1]+=.003*breath;p.chest[0]+=.008*breath;p.coat=.025*Math.sin(TAU*(beat-146)/16);
    p.leftWrist=[.06*breath,0,.12];p.rightWrist=[-.04*breath,0,-.12];
    if(outfit==='open'){p.leftHand[0]*=1.06;p.rightHand[0]*=1.06;}
    return p;
  }
  const pulse=Math.sin(Math.PI*beat),rise=Math.max(0,Math.sin(Math.PI*beat/2));
  if(theme==='pocket'){p.hip[1]-=.025;p.chest[1]*=1.25;p.coat+=.09*pulse;}
  if(theme==='parade'){p.hip[1]+=.02*rise;p.leftAnkle[0]-=.18*rise;p.head[2]+=.06*pulse;}
  if(outfit==='sport'){p.chest[1]*=1.2;p.hip[1]-=.025;p.chest[0]+=.055*Math.sin(TAU*beat);}
  if(outfit==='coat'){p.yaw*=1.18;p.coat+=.18*Math.sin(Math.PI*beat/4);}
  if(outfit==='open'){p.leftHand[0]*=1.10;p.rightHand[0]*=1.10;p.chest[2]*=1.12;}
  p.coat+=.10*pulse;p.leftWrist[2]+=.16*Math.sin(Math.PI*beat/2);p.rightWrist[2]-=.14*pulse;
  return p;
}
function propPhrase(id,beat,age,basePose,tender){
  const p={...basePose};for(const key of Object.keys(p))if(Array.isArray(p[key]))p[key]=[...p[key]];
  const a=Math.max(0,age)/8*TAU;
  if(id==='bouquet'){
    p.rightHand=[-.34-.20*Math.sin(a),1.14+.35*Math.sin(a*.5),.25+.18*Math.cos(a)];
    p.rightWrist=[.18*Math.sin(a),.50*Math.sin(a),-.65*Math.sin(a)];p.propTurn=.65*Math.sin(a);
    p.leftHand=[.40+.14*Math.sin(a),.78+.24*Math.max(0,-Math.sin(a)),.04];
    p.head=[.10,-.25*Math.sin(a*.5),-.10*Math.sin(a)];p.chest[2]+=.08*Math.sin(a);
  }else if(id==='rose'){
    p.yaw+=.24*Math.sin(a);p.head=[-.06,-.35*Math.sin(a*.5),.12*Math.sin(a)];
    p.leftHand=[.45+.14*Math.sin(a),.90+.40*Math.max(0,Math.sin(a)),.12];
    p.rightHand=[-.32,.73+.15*Math.max(0,-Math.sin(a)),0];p.chest[0]-=.055;
  }else if(id==='umbrella'){
    p.rightHand=[-.43,1.64+.08*Math.sin(a),.06];p.rightWrist=[0,.25*Math.sin(a),-.15];
    p.propTurn=a;p.propOpen=.85+.15*Math.sin(a*.5);p.yaw+=.23*Math.sin(a);
    p.leftHand=[.43+.17*Math.sin(a),.70+.31*Math.max(0,Math.sin(a)),.08];
    p.head[2]-=.12*Math.sin(a);
  }else if(id==='cane'){
    const sweep=Math.sin(a),plant=Math.max(0,Math.cos(a));
    p.rightHand=[-.40-.16*sweep,.82+.38*(1-plant),.23+.13*sweep];
    p.rightWrist=[.25*sweep,0,.58*sweep];p.propTurn=.18*sweep;
    p.leftHand=[.30,.73+.55*Math.max(0,-sweep),-.06];p.chest[0]+=.09*plant;
    p.head[0]+=.08*plant;p.head[1]-=.22*sweep;
    p.rightAnkle[0]-=.25*Math.max(0,sweep);
  }else if(id==='watch'){
    const inspect=Math.max(0,Math.sin(a));p.rightHand=[-.27,1.03+.53*inspect,.32];
    p.rightWrist=[-.3*inspect,.25, .35*Math.cos(a)];p.propTurn=.65*Math.sin(a*2);
    p.head[0]+=.18*inspect;p.head[1]-=.32*inspect;p.leftHand=[.29,.70,-.1];p.chest[1]+=.10*Math.sin(a*4);
  }else if(id==='record'){
    p.rightHand=[-.33-.17*Math.sin(a),.89+.46*Math.max(0,Math.sin(a)),.26];
    p.rightWrist=[.4*Math.sin(a),a,0];p.propTurn=a;
    p.leftHand=[.39,.71+.60*Math.max(0,-Math.sin(a)),.15];p.head[1]=-.22*Math.sin(a);
  }else if(id==='puppet'){
    p.hip[1]-=.05*(1+Math.sin(a));p.rightHand=[-.37,1.05+.27*Math.sin(a*2),.38];
    p.rightWrist=[.16*Math.sin(a*2),0,.32*Math.sin(a)];p.propTurn=.2*Math.sin(a*2);
    p.leftHand=[.32,.74+.25*Math.max(0,-Math.sin(a*2)),.08];p.head[0]=.13+.09*Math.sin(a*2);
  }else if(id==='cup'){
    const toast=Math.max(0,Math.sin(a));p.rightHand=[-.27, .83+.65*toast,.30];
    p.rightWrist=[-.3*toast,0,.07];p.leftHand=[.35,.69,-.12];p.head[0]=-.12*toast;
    p.chest[0]-=.08*toast;
  }else if(id==='scarf'){
    p.leftHand=[.32,1.05+.38*Math.sin(a),.20];p.leftWrist[2]=.4*Math.sin(a);p.yaw+=.16*Math.sin(a);
  }
  if(tender>0&&['bouquet','rose','umbrella'].includes(id)){
    const q={...basePose};for(const key of Object.keys(q))if(Array.isArray(q[key]))q[key]=[...q[key]];
    const breath=Math.sin(Math.max(0,age)/16*TAU),offer=.5-.5*Math.cos(Math.max(0,age)/24*TAU);
    if(id==='bouquet'){
      q.rightHand=[-.18-.17*offer,1.13+.07*offer,.29+.14*offer];q.rightWrist=[.10,.10,-.12-.22*offer];
      q.leftHand=[.10+.20*offer,1.00-.12*offer,.31];q.leftWrist=[.08,0,.22];
      q.head=[.17-.14*offer,-.15-.12*offer,.025];q.chest[0]+=.035*(1-offer);q.propTurn=.12*breath;
    }else if(id==='rose'){
      q.leftHand=[.28+.14*offer,.84+.22*offer,.23];q.rightHand=[-.19,.91+.07*breath,.28];
      q.leftWrist=[.04,0,.18];q.rightWrist=[.03,0,-.12];q.head=[.10-.11*offer,.20*breath,-.045];q.yaw+=.10*offer;
    }else{
      q.rightHand=[-.43,1.66+.02*breath,.06];q.rightWrist=[0,.10*breath,-.15];
      q.leftHand=[.30+.13*offer,.89+.08*breath,.24];q.leftWrist=[-.1,0,.14];
      q.head=[.04,.14*breath,-.035];q.propTurn=.22*breath;q.propOpen=1;
    }
    return blendPose(p,q,tender);
  }
  return p;
}

export function sampleDance(beat,state=wardrobeAt(beat)){
  const themes=themeWeightsAt(beat);let p,total=0;
  for(const [outfit,weight] of Object.entries(state.weights))for(const theme of themes){
    const w=weight*theme.weight;if(w<=0)continue;
    const q=bodyPhrase(beat,theme.id,outfit);p=p?blendPose(p,q,w/(total+w)):q;total+=w;
  }
  const tender=themes.find(t=>t.id==='lyric')?.weight||0;
  for(const [id,weight] of Object.entries(state.accessoryWeights))if(weight>0)
    p=blendPose(p,propPhrase(id,beat,beat-state.accessoryStarts[id],p,tender),weight);
  return p;
}
