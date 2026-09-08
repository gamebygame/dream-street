import * as THREE from 'three';
import {CONFIG,OUTFITS} from '../config.js';

export class AssetCache{
  constructor(){this.geometries=new Map();this.materials=new Map();this.textures=new Map();}
  geometry(key,make){if(!this.geometries.has(key))this.geometries.set(key,make());return this.geometries.get(key);}
  material(color,options={}){const key=color+JSON.stringify(options);if(!this.materials.has(key))this.materials.set(key,new THREE.MeshStandardMaterial({color,roughness:.92,metalness:0,...options}));return this.materials.get(key);}
  dispose(){for(const collection of [this.geometries,this.materials,this.textures])for(const object of collection.values())object.dispose();}
}

/** Elliptical cross-sections give cloth a tailored volume rather than box-shaped limbs. */
function cloth(sections,segments=12){
  const positions=[],indices=[];
  const ascending=sections[sections.length-1][0]>sections[0][0];
  sections.forEach(([y,rx,rz,z=0])=>{for(let i=0;i<segments;i++){const a=i/segments*Math.PI*2;positions.push(Math.cos(a)*rx,y,Math.sin(a)*rz+z);}});
  for(let j=0;j<sections.length-1;j++)for(let i=0;i<segments;i++){
    const a=j*segments+i,b=j*segments+(i+1)%segments,c=a+segments,d=b+segments;
    indices.push(...(ascending?[a,c,b,b,c,d]:[a,b,c,b,d,c]));
  }
  for(const [j,flip] of [[0,true],[sections.length-1,false]]){
    const center=positions.length/3;positions.push(0,sections[j][0],sections[j][3]||0);
    for(let i=0;i<segments;i++){const a=j*segments+i,b=j*segments+(i+1)%segments;indices.push(center,...(flip===ascending?[a,b]:[b,a]));}
  }
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));g.setIndex(indices);g.computeVertexNormals();return g;
}

export function mesh(cache,parent,key,make,color,position=[0,0,0],scale=[1,1,1],options={}){
  const object=new THREE.Mesh(cache.geometry(key,make),cache.material(color,options));object.position.set(...position);object.scale.set(...scale);parent.add(object);return object;
}
const sphere=(cache,parent,color,position,scale)=>mesh(cache,parent,'sphere16',()=>new THREE.SphereGeometry(1,16,12),color,position,scale);
const box=(cache,parent,color,position,scale)=>mesh(cache,parent,'box',()=>new THREE.BoxGeometry(1,1,1),color,position,scale);

function bone(parent,name,position){const b=new THREE.Bone();b.name=name;b.position.set(...position);parent.add(b);return b;}

function outfitParts(cache,rig,id){
  const style=OUTFITS[id],parts=[],tails=[];
  const add=(parent,key,make,color,position,scale)=>{const p=mesh(cache,parent,key,make,color,position,scale);parts.push(p);return p;};
  const torso=style.kind==='sport'?[[-.07,.31,.22],[.08,.33,.25],[.28,.35,.22],[.48,.37,.2]]:
    style.kind==='open'?[[-.06,.32,.22],[.09,.34,.24],[.28,.29,.2],[.47,.31,.19]]:
    [[-.07,.33,.23],[.1,.34,.25],[.29,.29,.2],[.47,.29,.19]];
  add(rig.hip,`torso-${id}`,()=>cloth(torso,14),style.color);
  add(rig.hip,`waist-${id}`,()=>cloth([[-.16,.285,.205],[-.03,.30,.22],[.05,.28,.20]],12),style.pants);
  for(const side of [1,-1]){
    const leg=side===1?rig.leftLeg:rig.rightLeg;
    const arm=side===1?rig.leftArm:rig.rightArm;
    add(leg.upper,`trouser-upper-${id}`,()=>cloth([[0,.17,.18],[-.2,.185,.19],[-.46,.19,.175]],12),style.pants);
    add(leg.lower,`trouser-lower-${id}`,()=>cloth([[.025,.19,.175],[-.2,.19,.16],[-.37,.205,.175],[-.405,.18,.15]],12),style.pants);
    const sleeve=style.kind==='open'?.17:style.kind==='sport'?.16:.13;
    add(arm.upper,`sleeve-upper-${id}`,()=>cloth([[.045,sleeve*1.08,sleeve],[ -.18,sleeve,sleeve*.92],[-.355,sleeve*.92,sleeve*.9]],12),style.color);
    add(arm.lower,`sleeve-lower-${id}`,()=>cloth([[.025,sleeve*.96,sleeve*.9],[-.15,sleeve*.88,sleeve*.8],[-.295,style.kind==='open'?.19:.105,style.kind==='open'?.155:.095]],12),style.color);
    add(arm.lower,`cuff-${id}`,()=>cloth([[-.287,style.kind==='open'?.192:.109,style.kind==='open'?.158:.099],[-.325,style.kind==='open'?.19:.109,style.kind==='open'?.156:.099]],12),style.trim);
    const lapel=add(rig.hip,'box',()=>new THREE.BoxGeometry(1,1,1),style.trim,[side*.115,.335,.198],[.075,.23,.025]);lapel.rotation.z=side*.28;
    if(style.kind==='coat'){
      const tail=add(rig.hip,`coat-tail-${side}`,()=>cloth([[.06,.175,.245],[ -.20,.21,.26],[-.49,.24,.275]],10),style.color,[side*.15,0,-.015]);tails.push({mesh:tail,side});
      const back=add(rig.hip,'box',()=>new THREE.BoxGeometry(1,1,1),style.dark,[0,.08,-.257],[.51,.045,.03]);
      back.name='coat-belt';
    }
    if(style.kind==='sport'){
      add(arm.upper,'box',()=>new THREE.BoxGeometry(1,1,1),style.trim,[0,-.15,-sleeve],[.05,.26,.014]);
    }
  }
  add(rig.hip,'box',()=>new THREE.BoxGeometry(1,1,1),style.dark,[0,.025,-.235],[.54,.045,.025]);
  if(id==='old'){
    const patch=add(rig.hip,'box',()=>new THREE.BoxGeometry(1,1,1),'#8a806b',[-.18,.15,-.233],[.14,.13,.015]);patch.rotation.z=.18;
    add(rig.leftLeg.lower,'box',()=>new THREE.BoxGeometry(1,1,1),'#827b66',[-.02,-.22,-.165],[.135,.11,.01]);
    for(const x of [-.22,-.13])add(rig.hip,'box',()=>new THREE.BoxGeometry(1,1,1),'#d0bea0',[x,.15,-.243],[.008,.12,.007]);
  }
  return {parts,tails};
}

export function createActor(cache,{outfit='old',mannequin=false}={}){
  const root=new THREE.Group();root.name=mannequin?'display-mannequin':'actor-follow-anchor';
  const poseRoot=new THREE.Group();root.add(poseRoot);poseRoot.scale.setScalar(CONFIG.actorScale);
  const hip=bone(poseRoot,'hips',[0,.93,0]);
  const spine=bone(hip,'spine',[0,.2,0]);
  const chest=bone(spine,'chest',[0,.23,0]);
  const neck=bone(chest,'neck',[0,.14,0]);
  const head=bone(neck,'head',[0,.13,0]);
  const skin=mannequin?'#a79b86':'#bf9472';
  sphere(cache,neck,skin,[0,.04,0],[.105,.135,.1]);
  sphere(cache,head,skin,[0,.055,.015],[.21,.245,.18]);
  sphere(cache,head,skin,[0,.025,.19],[.074,.075,.095]);
  for(const side of [1,-1]){
    sphere(cache,head,skin,[side*.207,.055,.005],[.046,.074,.042]);
    if(!mannequin){sphere(cache,head,'#253b3c',[side*.086,.108,.171],[.017,.018,.012]);sphere(cache,head,'#6e5543',[side*.073,.147,.174],[.055,.013,.013]);}
  }
  sphere(cache,head,mannequin?skin:'#5b5146',[0,-.055,.147],[.095,.018,.03]);
  const hatGroup=new THREE.Group();head.add(hatGroup);hatGroup.position.set(0,.257,-.008);hatGroup.rotation.z=-.065;
  mesh(cache,hatGroup,'hat-brim',()=>new THREE.CylinderGeometry(.305,.305,.035,24),'#3a4542');
  mesh(cache,hatGroup,'hat-crown',()=>cloth([[0,.235,.215],[.11,.23,.21],[.205,.20,.19]],24),'#46534e');
  mesh(cache,hatGroup,'hat-ribbon',()=>cloth([[.023,.238,.218],[.063,.236,.216]],24),'#b5a07e');
  const rig={root,poseRoot,hip,spine,chest,neck,head};
  for(const [side,name] of [[1,'left'],[-1,'right']]){
    const upper=bone(hip,`${name}-thigh`,[side*.19,0,0]);
    const lower=bone(upper,`${name}-shin`,[0,-.46,0]);
    const foot=bone(lower,`${name}-foot`,[0,-.43,0]);
    sphere(cache,foot,'#393e3a',[0,-.005,.09],[.155,.09,.27]);
    sphere(cache,foot,'#272f2c',[0,-.057,.085],[.158,.034,.265]);
    rig[`${name}Leg`]={upper,lower,end:foot,lengths:[.46,.43]};
    const shoulder=bone(chest,`${name}-shoulder`,[side*.285,0,0]);
    const elbow=bone(shoulder,`${name}-elbow`,[0,-.355,0]);
    const hand=bone(elbow,`${name}-hand`,[0,-.32,0]);
    sphere(cache,hand,skin,[0,-.05,.018],[.075,.11,.058]);
    sphere(cache,hand,skin,[-side*.055,-.025,.05],[.035,.065,.035]);
    rig[`${name}Arm`]={upper:shoulder,lower:elbow,end:hand,lengths:[.355,.32]};
  }
  const clothes=new Map();
  for(const id of Object.keys(OUTFITS)){
    const entry=outfitParts(cache,rig,id);clothes.set(id,entry);for(const part of entry.parts)part.visible=id===outfit;
  }
  let current=outfit;
  const down=new THREE.Vector3(0,-1,0),q=new THREE.Quaternion(),parentQ=new THREE.Quaternion();
  const origin=new THREE.Vector3(),goal=new THREE.Vector3(),direction=new THREE.Vector3(),pole=new THREE.Vector3(),elbow=new THREE.Vector3();
  const targetQuat=new THREE.Quaternion(),temporary=new THREE.Vector3();
  function solve(chain,coordinates,poleCoordinates){
    chain.upper.getWorldPosition(origin);goal.set(...coordinates);poseRoot.localToWorld(goal);
    direction.copy(goal).sub(origin);const physicalScale=CONFIG.actorScale;
    const l1=chain.lengths[0]*physicalScale,l2=chain.lengths[1]*physicalScale;
    const distance=Math.max(.001,Math.min(l1+l2-.0001,direction.length()));direction.normalize();
    pole.set(...poleCoordinates).applyQuaternion(poseRoot.getWorldQuaternion(targetQuat));
    pole.addScaledVector(direction,-pole.dot(direction)).normalize();
    const along=(l1*l1-l2*l2+distance*distance)/(2*distance);
    const height=Math.sqrt(Math.max(0,l1*l1-along*along));
    elbow.copy(origin).addScaledVector(direction,along).addScaledVector(pole,height);
    temporary.copy(elbow).sub(origin).normalize();q.setFromUnitVectors(down,temporary);
    chain.upper.parent.getWorldQuaternion(parentQ).invert();chain.upper.quaternion.copy(parentQ.multiply(q));
    chain.upper.updateWorldMatrix(false,true);
    goal.copy(origin).addScaledVector(direction,distance);
    temporary.copy(goal).sub(elbow).normalize();q.setFromUnitVectors(down,temporary);
    chain.lower.parent.getWorldQuaternion(parentQ).invert();chain.lower.quaternion.copy(parentQ.multiply(q));
    chain.lower.updateWorldMatrix(false,true);
    chain.end.parent.getWorldQuaternion(parentQ).invert();
    poseRoot.getWorldQuaternion(q);chain.end.quaternion.copy(parentQ.multiply(q));
  }
  function setOutfit(id){
    if(current===id)return;
    if(!clothes.has(id))throw new Error(`Unknown outfit ${id}`);
    for(const part of clothes.get(current).parts)part.visible=false;
    for(const part of clothes.get(id).parts)part.visible=true;
    current=id;
  }
  function applyPose(p){
    poseRoot.rotation.y=p.yaw;
    hip.position.set(...p.hip);hip.rotation.set(0,-.05,0);
    spine.rotation.set(p.chest[0]*.4,p.chest[1]*.4,p.chest[2]*.4);
    chest.rotation.set(p.chest[0]*.6,p.chest[1]*.6,p.chest[2]*.6);
    head.rotation.set(p.head[0],p.head[1]-.18,p.head[2]);
    root.updateMatrixWorld(true);
    solve(rig.leftLeg,p.leftFoot,[0,0,1]);solve(rig.rightLeg,p.rightFoot,[0,0,1]);
    solve(rig.leftArm,p.leftHand,[1,0,.35]);solve(rig.rightArm,p.rightHand,[-1,0,.35]);
    for(const {mesh:tail,side} of clothes.get(current).tails){tail.rotation.x=p.coat;tail.rotation.z=side*Math.abs(p.coat)*.3;}
    root.updateMatrixWorld(true);
  }
  if(mannequin){
    head.visible=false;
    for(const limb of [rig.leftLeg,rig.rightLeg,rig.leftArm,rig.rightArm])for(const child of limb.end.children)child.visible=false;
  }
  const staticPose={hip:[0,.93,0],yaw:mannequin?-Math.PI/2:0,chest:[0,0,0],head:[0,0,0],leftHand:[.31,.76,.025],rightHand:[-.31,.76,.025],leftFoot:[.19,.095,0],rightFoot:[-.19,.095,0],coat:0};
  applyPose(staticPose);
  return {...rig,setOutfit,applyPose,clothes,get outfit(){return current;},get footPositions(){return [rig.leftLeg.end.getWorldPosition(new THREE.Vector3()).toArray(),rig.rightLeg.end.getWorldPosition(new THREE.Vector3()).toArray()];}};
}
