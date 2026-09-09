import * as THREE from 'three';
import {CONFIG,OUTFITS} from '../config.js';
import {ACCESSORIES} from '../content/plan.js';
import {ClothLight} from './cloth-light.js';

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
const TAU=Math.PI*2;
const box=(cache,parent,color,position,scale)=>mesh(cache,parent,'box',()=>new THREE.BoxGeometry(1,1,1),color,position,scale);

function bone(parent,name,position){const b=new THREE.Bone();b.name=name;b.position.set(...position);parent.add(b);return b;}

function outfitParts(cache,rig,id,palette){
  const style={...OUTFITS[id],...palette},parts=[],tails=[];
  const add=(parent,key,make,color,position,scale)=>{
    if(parent===rig.hip&&!key.startsWith('waist-')&&!key.startsWith('coat-tail-'))parent=rig.torsoRoot;
    const p=mesh(cache,parent,key,make,color,position,scale);parts.push(p);return p;
  };
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
    if(style.kind==='coat'||style.kind==='old'){
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
    add(rig.hip,'box',()=>new THREE.BoxGeometry(1,1,1),'#c7c0aa',[0,.37,.202],[.095,.19,.018]);
    add(rig.hip,'box',()=>new THREE.BoxGeometry(1,1,1),'#4e3e34',[0,.35,.218],[.032,.17,.015]);
    for(const y of [.21,.06])for(const x of [-.10,.10])add(rig.hip,'button',()=>new THREE.SphereGeometry(.018,8,6),style.trim,[x,y,.249]);
    const patch=add(rig.hip,'box',()=>new THREE.BoxGeometry(1,1,1),'#8a806b',[-.18,.15,-.233],[.14,.13,.015]);patch.rotation.z=.18;
    add(rig.leftLeg.lower,'box',()=>new THREE.BoxGeometry(1,1,1),'#827b66',[-.02,-.22,-.165],[.135,.11,.01]);
    for(const x of [-.22,-.13])add(rig.hip,'box',()=>new THREE.BoxGeometry(1,1,1),'#d0bea0',[x,.15,-.243],[.008,.12,.007]);
  }
  const hat=rig.hatStyle==='outfit'?(id==='old'?'top':id==='sport'?'cap':id==='open'?'beret':'fedora'):rig.hatStyle;
  if(hat!=='none'){
    const group=new THREE.Group();rig.head.add(group);group.position.set(0,.257,-.008);parts.push(group);
    const color=id==='old'?'#343d39':style.dark;
    mesh(cache,group,'brim-'+hat,()=>new THREE.CylinderGeometry(hat==='cap'?.24:.29,hat==='cap'?.24:.29,.026,20),color);
    const height=hat==='top'?.39:hat==='beret'?.10:.19;
    mesh(cache,group,'crown-'+hat,()=>cloth([[0,.218,.20],[height*.65,hat==='top'?.208:.23,.20],[height,hat==='top'?.235:.195,.20]],20),color);
    if(hat==='cap')mesh(cache,group,'box',()=>new THREE.BoxGeometry(1,1,1),color,[0,.025,.24],[.32,.025,.22]);
    if(hat==='top'||hat==='fedora')mesh(cache,group,'ribbon-'+hat,()=>cloth([[.025,.222,.203],[.075,.220,.203]],20),id==='old'?'#746b57':style.trim);
  }
  return {parts,tails,uniforms:[]};
}

export function createAccessory(cache,id){
  const group=new THREE.Group();group.name='accessory-'+id;
  if(id==='scarf'){
    mesh(cache,group,'scarf-ring',()=>new THREE.TorusGeometry(.13,.052,5,12),'#be8458',[0,.015,0],[1,1,.8]).rotation.x=Math.PI/2;
    for(const side of [-1,1]){const end=box(cache,group,'#bd895e',[side*.13,-.19,-.11],[.105,.42,.04]);end.rotation.z=side*.12;}
  }else if(id==='watch'){
    const face=mesh(cache,group,'watch-face',()=>new THREE.CylinderGeometry(.14,.14,.045,20),'#d9c58d',[0,.06,.03]);face.rotation.x=Math.PI/2;
    box(cache,group,'#605c49',[0,.09,.06],[.014,.10,.012]);box(cache,group,'#605c49',[.025,.045,.062],[.06,.014,.012]);
    for(let i=0;i<6;i++)sphere(cache,group,'#ba985b',[.03*Math.sin(i),-.04-i*.035,.02],[.018,.024,.018]);
  }else if(id==='puppet'){
    sphere(cache,group,'#c8a277',[0,.31,0],[.09,.095,.08]);
    box(cache,group,'#ad6d51',[0,.16,0],[.13,.19,.09]);
    for(const side of [-1,1]){
      const arm=box(cache,group,'#c8a277',[side*.10,.18,0],[.045,.21,.045]);arm.rotation.z=side*.55;
      box(cache,group,'#637b77',[side*.045,-.015,0],[.06,.17,.06]);
    }
  }else if(id==='rose'||id==='bouquet'){
    const count=id==='rose'?1:5;
    for(let i=0;i<count;i++){
      const flower=new THREE.Group();group.add(flower);
      flower.position.set(count===1?0:Math.sin(i*2.4)*.14, count===1?0:(i%2)*.07,count===1?0:Math.cos(i*2.4)*.1);
      flower.rotation.z=count===1?0:Math.sin(i*2.4)*.22;
      mesh(cache,flower,'flower-stem',()=>new THREE.CylinderGeometry(.012,.016,.66,6),'#5c7955',[0,.16,0]);
      const leaf=sphere(cache,flower,'#769363',[.07,.11,0],[.105,.035,.055]);leaf.rotation.z=.5;
      sphere(cache,flower,id==='rose'?'#ab4258':['#d48a83','#dcb1a0','#c26069'][i%3],[0,.53,0],[.13,.10,.12]);
      for(let petal=0;petal<5;petal++)sphere(cache,flower,'#edc0a7',[.07*Math.cos(petal*TAU/5),.55,.07*Math.sin(petal*TAU/5)],[.055,.055,.055]);
    }
    if(id==='bouquet')mesh(cache,group,'bouquet-wrap',()=>new THREE.ConeGeometry(.19,.31,7,1,true),'#d5bc94',[0,.0,0]);
  }else if(id==='cane'){
    mesh(cache,group,'cane-stem',()=>new THREE.CylinderGeometry(.021,.019,.80,8),'#765639',[0,-.38,0]);
    mesh(cache,group,'cane-handle',()=>new THREE.TorusGeometry(.085,.027,6,12,Math.PI),'#c4a468',[.07,.025,0]);
    sphere(cache,group,'#35463e',[0,-.79,0],[.025,.026,.025]);
  }else if(id==='record'){
    const disk=mesh(cache,group,'vinyl',()=>new THREE.CylinderGeometry(.22,.22,.019,32),'#364541',[0,.17,0]);disk.rotation.x=Math.PI/2;
    const label=mesh(cache,group,'vinyl-label',()=>new THREE.CylinderGeometry(.075,.075,.023,20),'#c97d52',[0,.17,0]);label.rotation.x=Math.PI/2;
  }else if(id==='umbrella'){
    mesh(cache,group,'umbrella-stem',()=>new THREE.CylinderGeometry(.015,.018,1.06,8),'#846f51',[0,.47,0]);
    const canopy=new THREE.Group();canopy.name='canopy';canopy.position.y=1.0;group.add(canopy);group.userData.canopy=canopy;
    mesh(cache,canopy,'umbrella-canopy',()=>new THREE.ConeGeometry(.54,.23,8,1,true),'#c68f7e',[0,0,0],undefined,{side:THREE.DoubleSide});
    mesh(cache,canopy,'umbrella-lining',()=>new THREE.ConeGeometry(.531,.225,8,1,true),'#e0c6a1',[0,-.007,0],undefined,{side:THREE.DoubleSide});
    sphere(cache,canopy,'#876e4e',[0,.16,0],[.025,.06,.025]);
    for(let i=0;i<8;i++)sphere(cache,canopy,'#a98263',[.54*Math.sin(i*Math.PI/4),-.115,.54*Math.cos(i*Math.PI/4)],[.025,.025,.025]);
  }else if(id==='cup'){
    mesh(cache,group,'cup',()=>new THREE.CylinderGeometry(.105,.075,.25,14),'#e4d7b9',[0,.1,0]);
    mesh(cache,group,'cup-lid',()=>new THREE.CylinderGeometry(.111,.111,.025,14),'#b99c76',[0,.238,0]);
    box(cache,group,'#997459',[0,.1,-.084],[.13,.065,.015]);
  }
  return group;
}

export function createActor(cache,{outfit='old',mannequin=false,outfitIds=Object.keys(OUTFITS),skinColor='#bf9472',hairColor='#5b5146',hatStyle='outfit',height=1,width=1,palette,transitions=false,accessories=true}={}){
  const root=new THREE.Group();root.name=mannequin?'display-mannequin':'actor-follow-anchor';
  const poseRoot=new THREE.Group();root.add(poseRoot);poseRoot.scale.setScalar(CONFIG.actorScale*height);
  const hip=bone(poseRoot,'hips',[0,.93,0]);
  const spine=bone(hip,'spine',[0,.2,0]);
  const chest=bone(spine,'chest',[0,.23,0]);
  const neck=bone(chest,'neck',[0,.14,0]);
  const head=bone(neck,'head',[0,.13,0]);
  const skin=mannequin?'#a79b86':skinColor;
  sphere(cache,neck,skin,[0,.04,0],[.105,.135,.1]);
  sphere(cache,head,skin,[0,.055,.015],[.21,.245,.18]);
  sphere(cache,head,skin,[0,.025,.19],[.074,.075,.095]);
  for(const side of [1,-1]){
    sphere(cache,head,skin,[side*.207,.055,.005],[.046,.074,.042]);
    if(!mannequin){sphere(cache,head,'#253b3c',[side*.086,.108,.171],[.017,.018,.012]);sphere(cache,head,'#6e5543',[side*.073,.147,.174],[.055,.013,.013]);}
  }
  sphere(cache,head,mannequin?skin:hairColor,[0,-.055,.147],[.095,.018,.03]);
  if(hatStyle==='none')sphere(cache,head,hairColor,[0,.16,-.015],[.216,.16,.182]);
  const torsoPivot=bone(hip,'coat-body-pivot',[0,.20,0]),torsoRoot=new THREE.Group();torsoRoot.position.y=-.20;torsoPivot.add(torsoRoot);
  const rig={root,poseRoot,hip,spine,chest,neck,head,hatStyle,torsoRoot,torsoPivot};
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
  for(const id of outfitIds){
    const entry=outfitParts(cache,rig,id,palette);clothes.set(id,entry);for(const part of entry.parts)part.visible=id===outfit;
    if(transitions){
      const materials=new Map();
      for(const part of entry.parts)part.traverse(object=>{
        if(!object.isMesh)return;
        if(!materials.has(object.material)){
          const material=object.material.clone(),u={bands:{value:new THREE.Vector4(0,1,-1,-1)},floor:{value:CONFIG.reflectionFloor},edge:{value:1},glow:{value:0}};
          material.onBeforeCompile=shader=>{
            shader.uniforms.uClothBands=u.bands;shader.uniforms.uClothFloor=u.floor;shader.uniforms.uClothEdge=u.edge;shader.uniforms.uClothGlow=u.glow;
            shader.vertexShader='varying vec3 vClothWorld;\n'+shader.vertexShader;
            shader.vertexShader=shader.vertexShader.replace('#include <project_vertex>','#include <project_vertex>\nvClothWorld=(modelMatrix*vec4(transformed,1.0)).xyz;');
            shader.fragmentShader='varying vec3 vClothWorld;uniform vec4 uClothBands;uniform float uClothFloor;uniform float uClothEdge;uniform float uClothGlow;\n'+shader.fragmentShader;
            shader.fragmentShader=shader.fragmentShader.replace('#include <clipping_planes_fragment>',`#include <clipping_planes_fragment>
              float y=vClothWorld.y-uClothFloor+.065*sin(vClothWorld.z*7.0+vClothWorld.y*4.0);
              float grain=fract(sin(dot(floor(gl_FragCoord.xy),vec2(12.9898,78.233)))*43758.5453);
              float field=clamp((y+.25+(grain-.5)*.025)/2.8,.000001,.999999);
              bool visible=(field>=uClothBands.x&&field<uClothBands.y)||(field>=uClothBands.z&&field<uClothBands.w);
              if(!visible)discard;`);
            shader.fragmentShader=shader.fragmentShader.replace('#include <emissivemap_fragment>',`#include <emissivemap_fragment>
              float seam=(1.-smoothstep(.006,.075,abs(field-uClothEdge)))*uClothGlow;
              float iridescence=.5+.5*sin(vClothWorld.z*6.+vClothWorld.y*3.);
              totalEmissiveRadiance+=mix(vec3(.20,.65,.58),vec3(1.,.75,.33),iridescence)*seam*.9;`);
          };
          material.customProgramCacheKey=()=> 'cloth-refraction-v3';
          cache.materials.set('transition-'+material.uuid,material);materials.set(object.material,material);entry.uniforms.push(u);
        }
        object.material=materials.get(object.material);
      });
    }
  }
  const props=new Map();
  const clothLight=transitions?new ClothLight(root,cache):null;
  if(accessories&&!mannequin)for(const id of ACCESSORIES){
    const group=createAccessory(cache,id);(id==='scarf'?neck:id==='rose'?head:rig.rightArm.end).add(group);
    if(id==='rose'){group.position.set(0,0,.22);group.rotation.z=Math.PI/2;}
    group.visible=false;props.set(id,group);
  }
  let current=outfit;
  const down=new THREE.Vector3(0,-1,0),q=new THREE.Quaternion(),parentQ=new THREE.Quaternion();
  const origin=new THREE.Vector3(),goal=new THREE.Vector3(),direction=new THREE.Vector3(),pole=new THREE.Vector3(),elbow=new THREE.Vector3();
  const targetQuat=new THREE.Quaternion(),temporary=new THREE.Vector3();
  function solve(chain,coordinates,poleCoordinates){
    chain.upper.getWorldPosition(origin);goal.set(...coordinates);poseRoot.localToWorld(goal);
    direction.copy(goal).sub(origin);const physicalScale=CONFIG.actorScale*height;
    const l1=chain.lengths[0]*physicalScale,l2=chain.lengths[1]*physicalScale;
    const distance=Math.max(.001,Math.min(l1+l2-.0001,direction.length()));direction.normalize();
    pole.set(...poleCoordinates).applyQuaternion(poseRoot.getWorldQuaternion(targetQuat));
    pole.addScaledVector(direction,-pole.dot(direction)).normalize();
    const along=(l1*l1-l2*l2+distance*distance)/(2*distance);
    const bendHeight=Math.sqrt(Math.max(0,l1*l1-along*along));
    elbow.copy(origin).addScaledVector(direction,along).addScaledVector(pole,bendHeight);
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
  function setWardrobe(state){
    if(!transitions){setOutfit(state.outfit);return;}
    clothLight.update(state);
    for(const [id,entry] of clothes){
      const layers=state.layers.filter(layer=>layer.id===id);
      for(const part of entry.parts)part.visible=layers.length>0;
      for(const u of entry.uniforms){
        u.bands.value.set(layers[0]?.from??-1,layers[0]?.to??-1,layers[1]?.from??-1,layers[1]?.to??-1);
        u.edge.value=state.progress;u.glow.value=clothLight.opacity.value;
      }
    }
    current=state.outfit;
    for(const [id,group] of props){
      const strength=state.accessoryWeights[id]||0;
      group.visible=strength>0;group.scale.setScalar(strength);
    }
  }
  function applyPose(p){
    poseRoot.rotation.y=p.yaw;
    hip.position.set(...p.hip);hip.rotation.set(0,-.05,0);
    spine.rotation.set(p.chest[0]*.4,p.chest[1]*.4,p.chest[2]*.4);
    chest.rotation.set(p.chest[0]*.6,p.chest[1]*.6,p.chest[2]*.6);
    torsoPivot.rotation.set(p.chest[0]*.88,p.chest[1]*.88,p.chest[2]*.88);
    head.rotation.set(p.head[0],p.head[1]-.08,p.head[2]);
    root.updateMatrixWorld(true);
    solve(rig.leftLeg,p.leftFoot,[0,0,1]);solve(rig.rightLeg,p.rightFoot,[0,0,1]);
    solve(rig.leftArm,p.leftHand,p.leftElbowPole||[.25,-.12,1]);solve(rig.rightArm,p.rightHand,p.rightElbowPole||[-.25,-.12,1]);
    // A relaxed pendulum uses joint arcs, avoiding the straight-elbow singularity of hand IK.
    // Gesture weights return smoothly to IK for greetings, dancing and the bicycle handlebar.
    for(const name of ['left','right']){
      const weight=p[name+'ArmWalk']||0,angles=p[name+'ArmSwing'];if(!weight)continue;
      const arm=rig[name+'Arm'];
      arm.upper.quaternion.slerp(q.setFromEuler(new THREE.Euler(angles[0],0,angles[2])),weight);
      arm.lower.quaternion.slerp(q.setFromEuler(new THREE.Euler(-angles[1],0,0)),weight);
      arm.end.quaternion.slerp(q.identity(),weight);
    }
    for(const [limb,rotation] of [[rig.leftArm,p.leftWrist],[rig.rightArm,p.rightWrist],[rig.leftLeg,p.leftAnkle],[rig.rightLeg,p.rightAnkle]]){
      if(rotation)limb.end.quaternion.multiply(targetQuat.setFromEuler(new THREE.Euler(...rotation)));
    }
    for(const entry of clothes.values())for(const {mesh:tail,side} of entry.tails)if(tail.visible){tail.rotation.x=p.coat;tail.rotation.z=side*Math.abs(p.coat)*.3;}
    if(props.has('scarf'))props.get('scarf').rotation.z=p.coat*.6;
    for(const [id,group] of props)if(group.visible){
      if(id==='rose')group.rotation.z=Math.PI/2;
      else if(id==='record')group.rotation.z=p.propTurn||0;
      else if(id==='umbrella'){
        group.rotation.y=p.propTurn||0;group.userData.canopy.scale.set(p.propOpen??1,1,p.propOpen??1);
      }else if(id==='watch'||id==='puppet')group.rotation.z=p.propTurn||0;
    }
    root.updateMatrixWorld(true);
  }
  if(mannequin){
    head.visible=false;
    for(const limb of [rig.leftLeg,rig.rightLeg,rig.leftArm,rig.rightArm])for(const child of limb.end.children)child.visible=false;
  }
  const staticPose={hip:[0,.93,0],yaw:mannequin?-Math.PI/2:0,chest:[0,0,0],head:[0,0,0],leftHand:[.31,.76,.025],rightHand:[-.31,.76,.025],leftFoot:[.19,.095,0],rightFoot:[-.19,.095,0],coat:0};
  applyPose(staticPose);
  if(width!==1)root.traverse(object=>{if(object.isMesh)object.scale.x*=width;});
  return {...rig,setOutfit,setWardrobe,applyPose,clothes,props,clothLight,get outfit(){return current;},get footPositions(){return [rig.leftLeg.end.getWorldPosition(new THREE.Vector3()).toArray(),rig.rightLeg.end.getWorldPosition(new THREE.Vector3()).toArray()];}};
}
