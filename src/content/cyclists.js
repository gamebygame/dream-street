import {mod,smooth} from './plan.js';
import {sampleDance,blendPose,sampleWalk} from '../character/pose.js';

export const CYCLISTS=Object.freeze([
  {id:'bicycle-morning',x:-5.35,z:1.8,start:52,join:96,leave:130,end:162,color:'#507c77',skinColor:'#9c6b51'},
  {id:'bicycle-afternoon',x:5.35,z:-1.8,start:172,join:214,leave:234,end:256,color:'#b07d52',skinColor:'#d1ab86'},
]);
export function cyclistState(person,beat){
  const b=mod(beat,256),u=(b-person.start)/(person.join-person.start);
  if(b<person.start||b>=person.end)return {visible:false,x:person.x,z:-30,distance:0,participation:0};
  const arrival=22*smooth(u),exit=26*smooth((b-person.leave)/(person.end-person.leave));
  const greeting=smooth((b-person.join+20)/3)*(1-smooth((b-person.join+12)/3));
  const farewell=smooth((b-person.leave+1)/2)*(1-smooth((b-person.leave-7)/3));
  return {visible:true,x:person.x,z:person.z-22+arrival+exit,
    distance:(b-person.start)*.6+arrival+exit,
    acknowledgement:Math.max(greeting,farewell),greetingPhase:b-(greeting>farewell?person.join-20:person.leave-1),
    participation:smooth((b-person.join+12)/10)*(1-smooth((b-person.leave)/5))};
}
export function cyclistPose(person,beat,state,wardrobe){
  const p=blendPose(sampleWalk(beat,{social:false}),sampleDance(beat,wardrobe),state.participation*.72);
  const phase=state.distance/1.9*Math.PI*2;
  p.leftArmWalk=0;p.rightArmWalk=0;
  p.hip=[0,.94,-.12];p.yaw=0;p.chest=[.16,.035*Math.sin(beat*Math.PI)*state.participation,.015];
  const proximity=smooth((state.z+12)/5)*(1-smooth((state.z-8)/6));
  const look=Math.max(-1.12,Math.min(1.12,Math.atan2(-person.x,-state.z)));
  p.head=[-.06+.13*Math.sin(Math.PI*state.greetingPhase)*state.acknowledgement,
    look*proximity*.9-Math.sign(person.x)*.22*state.acknowledgement,-.04*state.acknowledgement];p.coat=.04;
  p.rightHand=[-.32,1.23,.52];p.rightWrist=[.35,0,0];
  const grip=[.32,1.23,.52];p.leftHand=p.leftHand.map((v,i)=>grip[i]+(v-grip[i])*state.participation);
  const wave=[.48+.045*Math.sin(Math.PI*state.greetingPhase),1.66,.24];
  p.leftHand=p.leftHand.map((v,i)=>v+(wave[i]-v)*state.acknowledgement);
  for(const [key,side,offset] of [['leftFoot',1,0],['rightFoot',-1,Math.PI]]){
    p[key]=[side*.22,(.54+.16*Math.cos(phase+offset)-.18)/.91,(.05+.16*Math.sin(phase+offset))/.91];
  }
  p.leftAnkle=[0,0,0];p.rightAnkle=[0,0,0];return p;
}
