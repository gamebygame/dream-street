import * as THREE from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
import {CONFIG} from '../config.js';
import {BLOCKS,PRODUCTS,CROSSROADS,displayPosition} from '../content/plan.js';
import {createActor,createAccessory,mesh} from '../character/rig.js';

const stone=['#e6d9c3','#d7d9c8','#dfc5ac','#acc3b7'];
export class Street{
  constructor(scene,cache,glassMaterial,viewDirection){
    this.scene=scene;this.cache=cache;this.glassMaterial=glassMaterial;this.viewDirection=viewDirection;
    this.group=new THREE.Group();scene.add(this.group);this.cycles=[];this.glasses=[];this.products=[];this.debugLines=[];
    this.boxGeo=cache.geometry('box',()=>new THREE.BoxGeometry(1,1,1));
    this.displayGeometry=new Map();
    for(const id of ['jacket','sport','coat','open'])this.displayGeometry.set(id,this.bakeMannequin(id));
    this.displayMaterial=cache.material('#ffffff',{vertexColors:true});
    for(let slot=0;slot<3;slot++)this.cycles.push(this.makeCycle(slot));
    this.ground=new THREE.Mesh(cache.geometry('ground',()=>new THREE.PlaneGeometry(200,200)),cache.material('#dedfd0'));
    this.ground.rotation.x=-Math.PI/2;this.ground.position.y=-.035;scene.add(this.ground);
    this.sceneGroupCount=this.group.children.length;
  }
  box(parent,color,position,scale){return mesh(this.cache,parent,'box',()=>this.boxGeo,color,position,scale);}
  label(parent,text,position,width,{color='#405a51',size=110,bg=null}={}){
    const key=`label:${text}:${color}:${bg}`;
    if(!this.cache.textures.has(key)){
      const c=document.createElement('canvas');c.width=1024;c.height=192;
      const ctx=c.getContext('2d');if(bg){ctx.fillStyle=bg;ctx.fillRect(0,0,c.width,c.height);}
      ctx.fillStyle=color;ctx.font=`500 ${size}px Georgia, serif`;ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(text,512,103,990);
      const texture=new THREE.CanvasTexture(c);texture.colorSpace=THREE.SRGBColorSpace;texture.anisotropy=4;this.cache.textures.set(key,texture);
    }
    const materialKey=`labelmat:${key}`;
    if(!this.cache.materials.has(materialKey))this.cache.materials.set(materialKey,new THREE.MeshBasicMaterial({map:this.cache.textures.get(key),transparent:true,depthWrite:false,side:THREE.DoubleSide}));
    const plane=new THREE.Mesh(this.cache.geometry('label-plane',()=>new THREE.PlaneGeometry(1,1)),this.cache.materials.get(materialKey));
    plane.position.set(...position);plane.rotation.y=-Math.PI/2;plane.scale.set(width,width*192/1024,1);parent.add(plane);return plane;
  }
  bakeMannequin(id){
    const actor=createActor(this.cache,{outfit:id,mannequin:true,outfitIds:[id],accessories:false});actor.root.updateMatrixWorld(true);
    const geometries=[];
    actor.root.traverseVisible(object=>{
      if(!object.isMesh)return;
      const geo=object.geometry.clone().applyMatrix4(object.matrixWorld);
      for(const key of Object.keys(geo.attributes))if(key!=='position'&&key!=='normal')geo.deleteAttribute(key);
      const count=geo.attributes.position.count,c=object.material.color,colors=new Float32Array(count*3);
      for(let i=0;i<count;i++){colors[i*3]=c.r;colors[i*3+1]=c.g;colors[i*3+2]=c.b;}
      geo.setAttribute('color',new THREE.BufferAttribute(colors,3));geometries.push(geo);
    });
    const merged=mergeGeometries(geometries);for(const geo of geometries)geo.dispose();
    this.cache.geometries.set(`display-${id}`,merged);return merged;
  }
  makeWindow(parent,start,end,{office=false}={}){
    const middle=(start+end)/2,length=end-start;
    this.box(parent,office?'#9fb6ad':'#b5c2b2',[8.8,1.9,middle],[.1,3.45,length]);
    this.box(parent,office?'#7f9c94':'#b7aa90',[8.4,.14,middle],[1.0,.12,length]);
    const pane=new THREE.Mesh(this.cache.geometry('glass-plane',()=>new THREE.PlaneGeometry(1,1)),this.glassMaterial);
    pane.rotation.y=-Math.PI/2;pane.position.set(8,.18+3.45/2,middle);pane.scale.set(length,3.45,1);pane.renderOrder=5;parent.add(pane);this.glasses.push(pane);
    for(const z of [start,end])this.box(parent,'#58736a',[7.97,1.94,z],[.10,3.58,.11]);
    for(const y of [.18,3.64])this.box(parent,'#6f877b',[7.975,y,middle],[.105,.08,length]);
    if(office){
      for(let z=start+2;z<end;z+=2)this.box(parent,'#80978a',[8.2,2,z],[.07,3.2,.065]);
      this.box(parent,'#d1d6bd',[8.76,2.97,middle],[.06,.09,length]);
      for(let z=start+.6;z<end;z+=1.55){
        this.box(parent,'#abbca9',[8.74,1.89,z],[.04,1.28,.026]);
      }
    }
  }
  makeBuilding(parent,block){
    const start=block.start*.6,end=block.end*.6,mid=(start+end)/2,length=end-start;
    const wall=stone[block.palette??1];
    if(block.kind==='wall'){
      this.box(parent,'#d5bba5',[8.65,2.2,mid],[1.25,4.4,length]);
      this.box(parent,'#83917c',[7.98,.33,mid],[.2,.3,length]);
      return;
    }
    this.box(parent,wall,[9.28,3.95,mid],[2.6,.57,length]);
    this.box(parent,'#ece5cd',[9.34,4.37,mid],[2.85,.16,length+.1]);
    this.box(parent,'#c1c5ae',[9.42,4.53,mid],[2.75,.16,length+.04]);
    this.box(parent,wall,[10.58,2.0,mid],[.2,4.0,length]);
    for(const z of [start+.09,end-.09])this.box(parent,wall,[8.15,1.99,z],[.35,3.98,.18]);
    if(block.kind==='office'){
      this.makeWindow(parent,start+.18,end-.18,{office:true});
      const upper=new THREE.Group();parent.add(upper);
      this.box(upper,wall,[9.35,5.24,mid],[2.8,1.24,length]);
      for(let z=start+.68;z<end-.25;z+=1.15){
        this.box(upper,'#8da9a1',[7.91,5.24,z],[.04,.7,.75]);
        this.box(upper,'#d9dac3',[7.86,5.23,z],[.06,.035,.77]);
      }
      this.box(upper,'#e8e1c9',[9.32,5.92,mid],[2.95,.14,length+.07]);
      this.label(parent,block.label,[7.85,4.0,mid],Math.min(length-.6,4),{color:'#587368',size:75});
    }else{
      this.makeWindow(parent,start+.18,end-.18);
      this.label(parent,block.label,[7.87,3.96,mid],Math.min(length-.5,5.3),{color:block.hero?'#7b573d':'#4d6c5d',size:block.hero?100:82});
      const awning=block.hero?'#4a7465':block.palette===0?'#9d6652':'#c4ae85';
      this.box(parent,awning,[7.67,3.58,mid],[.75,.095,length-.15]);
      this.box(parent,awning,[7.33,3.49,mid],[.065,.19,length-.15]);
      for(let z=start+.3;z<end-.15;z+=.39)this.box(parent,block.hero?'#d6d0a9':'#e3d5b3',[7.66,3.633,z],[.70,.013,.12]);
      const contacts=PRODUCTS.filter(p=>p.beat>block.start && p.beat<block.end);
      contacts.forEach(p=>this.makeProduct(parent,p));
      this.shopDetails(parent,block,start,end);
      for(let z=start+.7;z<end-.3;z+=1.4)this.box(parent,'#e7dec1',[8.46,3.35,z],[.50,.035,.22]);
    }
  }
  makeProduct(parent,product){
    const {x,y,z}=displayPosition(product.beat*.6,.27,this.viewDirection);
    const model=new THREE.Group();model.userData.product=true;model.position.set(x-(CONFIG.facadeX-8),y,z);parent.add(model);
    if(product.outfit)model.add(new THREE.Mesh(this.displayGeometry.get(product.outfit),this.displayMaterial));
    if(product.accessory){
      const item=createAccessory(this.cache,product.accessory);item.position.set(0,.95,0);item.scale.setScalar(1.45);model.add(item);
      this.box(model,'#9f987e',[0,.44,0],[.055,.85,.055]);
    }
    const plinth=this.box(parent,product.hit?'#dbccb1':'#d1c4ac',[8.5,(y+.12)/2,z],[.7,y-.12,.82]);
    this.box(parent,'#ede3c9',[8.47,y-.015,z],[.74,.03,.88]);
    this.products.push({parent:parent.userData.cycleRoot,model,product,contactS:product.beat*.6});
    const line=new THREE.Mesh(this.cache.geometry('contact-line',()=>new THREE.BoxGeometry(.015,3.2,.025)),this.cache.material('#d73f38'));
    line.position.set(7.92,1.9,product.beat*.6);line.visible=false;parent.add(line);this.debugLines.push(line);
    return plinth;
  }
  shopDetails(parent,block,start,end){
    const mid=(start+end)/2;
    if(block.kind==='clocks'){
      for(const [i,z] of [start+.65,mid,end-.65].entries()){
        const face=mesh(this.cache,parent,'shop-clock',()=>new THREE.CylinderGeometry(.30,.30,.05,24),'#ebddba',[8.68,2.57,z]);
        face.rotation.z=Math.PI/2;
        this.box(parent,'#6b6d58',[8.64,2.65,z],[.015,.24,.024]);
        this.box(parent,'#6b6d58',[8.63,2.57,z+.075],[.016,.025,.18]);
        if(i!==1)this.box(parent,'#a28b67',[8.72,1.93,z],[.22,.6,.24]);
      }
    }else if(block.kind==='flowers'){
      this.box(parent,'#829779',[8.65,.44,mid],[.6,.65,end-start-.5]);
      for(let z=start+.9;z<end-.5;z+=2.3){
        mesh(this.cache,parent,'flower-vase',()=>new THREE.CylinderGeometry(.14,.11,.3,10),'#c7a184',[8.63,.70,z]);
        const flowers=createAccessory(this.cache,'bouquet');flowers.position.set(8.63,.86,z);flowers.scale.setScalar(.85);parent.add(flowers);
      }
      this.box(parent,'#a6b397',[8.66,2.70,mid],[.08,.05,end-start-.6]);
      for(const z of [start+.6,end-.6]){
        const rose=createAccessory(this.cache,'rose');rose.position.set(8.65,2.54,z);parent.add(rose);
      }
    }else if(block.kind==='antiques'){
      this.box(parent,'#8c7358',[8.67,.46,mid],[.58,.62,end-start-.45]);
      for(const [i,z] of [start+.7,mid,end-.7].entries()){
        const item=createAccessory(this.cache,block.theme==='lyric'?'umbrella':i%2?'watch':'cane');
        item.position.set(8.52,1.65,z);item.scale.setScalar(.85);parent.add(item);
        if(i===1){
          this.box(parent,'#756653',[8.68,2.43,z],[.16,.56,.43]);
          this.box(parent,'#b1aa87',[8.57,2.43,z],[.025,.39,.27]);
        }
      }
    }else if(block.kind==='gifts'||block.kind==='records'){
      this.box(parent,'#af9473',[8.70,.95,mid],[.22,.07,end-start-.45]);
      for(let i=0;i<5;i++){
        const z=start+.45+(end-start-.9)*i/4,color=['#bd8869','#a8b394','#75958b','#c5b485','#bfa798'][i];
        this.box(parent,color,[8.65,1.1,z],[.28,.25,.32]);
        this.box(parent,'#e6d5ac',[8.49,1.1,z],[.015,.26,.045]);
        if(block.kind==='records'){
          const record=mesh(this.cache,parent,'record-disc',()=>new THREE.CylinderGeometry(.2,.2,.022,24),'#465c56',[8.65,2.22,z]);record.rotation.z=Math.PI/2;
          this.box(parent,color,[8.73,2.22,z],[.025,.44,.44]);
        }
      }
    }else if(block.kind==='toys'){
      for(const [i,z] of [start+.7,mid,end-.7].entries()){
        const toy=createAccessory(this.cache,'puppet');toy.position.set(8.62,1.50,z);toy.rotation.y=-Math.PI/2;toy.scale.setScalar(1.5);parent.add(toy);
        this.box(parent,['#b98b62','#b3b394','#88a49a'][i],[8.69,.53,z],[.38,.55,.65]);
      }
    }else if(block.kind==='snacks'){
      this.box(parent,'#ac8f71',[8.65,.74,mid],[.65,1.05,end-start-.5]);
      this.box(parent,'#e4cfad',[8.54,1.3,mid],[.82,.08,end-start-.4]);
      for(let z=start+.45;z<end-.2;z+=.7){
        const cup=createAccessory(this.cache,'cup');cup.position.set(8.32,1.35,z);parent.add(cup);
        mesh(this.cache,parent,'bread',()=>new THREE.SphereGeometry(1,10,6),'#bc925e',[8.48,1.42,z+.25],[.12,.07,.17]);
      }
      this.box(parent,'#476c61',[8.69,2.50,mid],[.045,.85,Math.min(2,end-start-.5)]);
    }
    if(block.theme==='pocket')this.label(parent,'MUSIC · CLOTHES · EVERYDAY PEOPLE',[7.89,3.05,mid],Math.min(3.5,end-start-.4),{color:'#6c6753',size:42});
  }
  tree(parent,x,z){
    const trunk=mesh(this.cache,parent,'trunk',()=>new THREE.CylinderGeometry(.075,.12,1.9,7),'#8d8267',[x,1.02,z]);
    const leafGeo=this.cache.geometry('tree-crown',()=>new THREE.IcosahedronGeometry(1,1));
    for(const [i,offset] of [[-.26,2.35,.05],[.26,2.62,.22],[.02,2.9,-.18],[-.42,2.72,-.2]].entries()){
      mesh(this.cache,parent,'tree-crown',()=>leafGeo,['#8d9d66','#a4af75','#b2b886','#99a66e'][i],[x+offset[0],offset[1],z+offset[2]],[.68,.75,.67]);
    }
    const shadow=new THREE.Mesh(this.cache.geometry('tree-shadow',()=>new THREE.CircleGeometry(1,24)),new THREE.MeshBasicMaterial({color:'#4d6353',transparent:true,opacity:.08,depthWrite:false}));
    shadow.rotation.x=-Math.PI/2;shadow.position.set(x,.145,z);shadow.scale.set(1.3,1.15,1);parent.add(shadow);
    this.cache.materials.set(`tree-shadow-${this.cache.materials.size}`,shadow.material);return trunk;
  }
  planter(parent,x,z){
    this.box(parent,'#bdbaa2',[x,.29,z],[.66,.45,1.1]);
    this.box(parent,'#5a6951',[x,.525,z],[.57,.035,1.0]);
    for(let i=0;i<4;i++)mesh(this.cache,parent,'planter-leaf',()=>new THREE.IcosahedronGeometry(1,0),i%2?'#92a073':'#7e9068',[x,.63,z-.38+i*.25],[.34,.29,.32]);
  }
  makeCycle(slot){
    const group=new THREE.Group();group.userData.cycle=slot;this.group.add(group);
    const length=CONFIG.cycleBeats*CONFIG.distancePerBeat;
    this.box(group,'#b5c4be',[0,-.025,length/2],[12,.05,length]);
    const solid=[[0,76],[88,128],[144,256]];
    for(const [a,b] of solid){
      const start=a*.6,end=b*.6,mid=(start+end)/2,len=end-start;
      const paving=new THREE.Group();group.add(paving);
      for(const side of [-1,1]){
        this.box(paving,'#e6dec9',[side*7.9,.055,mid],[3.8,.14,len]);
        this.box(paving,'#a5ab98',[side*6.05,.12,mid],[.12,.2,len]);
        for(let z=start+.8;z<end;z+=1.6)this.box(paving,'#cec9b6',[side*7.9,.132,z],[3.7,.006,.022]);
        this.box(paving,'#d7d0ba',[side*8.3,.135,mid],[.022,.005,len]);
        for(let z=start+3;z<end-2;z+=10.8){if(side===-1)this.tree(paving,-6.65,z);else this.planter(paving,6.60,z+1);}
      }
      for(let z=start+1;z<end;z+=5.6)for(const x of [-1.8,1.8])this.box(paving,'#dfe0ce',[x,.008,z],[.08,.006,1.3]);
      this.mergeStatic(paving);
    }
    for(const road of CROSSROADS)this.makeCrossroad(group,road);
    for(const block of BLOCKS){
      const building=new THREE.Group();building.position.x=CONFIG.facadeX-8;building.userData.cycleRoot=group;group.add(building);
      this.makeBuilding(building,block);this.mergeStatic(building);
      const near=new THREE.Group();group.add(near);
      const start=block.start*.6,end=block.end*.6,mid=(start+end)/2,len=end-start;
      this.box(near,stone[block.palette??1],[-10.85,.82,mid],[2.1,1.64,len-.12]);
      this.box(near,'#e8dfc8',[-10.85,1.71,mid],[2.35,.14,len]);
      this.box(near,'#b1b49e',[-10.85,1.83,mid],[2.05,.10,len-.15]);
      for(let z=start+.65;z<end-.3;z+=1.45)this.box(near,'#789387',[-9.785,.89,z],[.035,1.03,.95]);
      this.mergeStatic(near);
    }
    return group;
  }
  makeCrossroad(group,road){
    const a=road.start*.6,b=road.end*.6,mid=(a+b)/2;
    const junction=new THREE.Group();group.add(junction);
    this.box(junction,'#b5c4be',[0,-.018,mid],[90,.03,b-a]);
    for(const z of [a+.8,b-.8])for(let x=-5.3;x<5.4;x+=1.0)this.box(junction,'#ece4cd',[x,.006,z],[.58,.013,.55]);
    for(const side of [-1,1]){
      for(let z=a+.7;z<b-.5;z+=.8)this.box(junction,'#ece4cd',[side*7.9,.012,z],[1.6,.014,.4]);
      for(const z of [a-.4,b+.4]){
        mesh(this.cache,junction,'signal-post',()=>new THREE.CylinderGeometry(.045,.065,2.6,8),'#536d62',[side*6.65,1.35,z]);
        this.box(junction,'#4c665e',[side*6.65,2.62,z],[.19,.39,.18]);
        mesh(this.cache,junction,'signal-light',()=>new THREE.SphereGeometry(.058,8,6),'#a6c886',[side*6.65,2.5,z-.10]);
      }
    }
    this.mergeStatic(junction);
  }
  mergeStatic(group){
    group.updateMatrixWorld(true);
    const buckets=new Map(),remove=[];
    group.traverse(object=>{
      if(!object.isMesh||object.material.transparent||object.material.vertexColors||this.debugLines.includes(object))return;
      for(let parent=object.parent;parent&&parent!==group;parent=parent.parent)if(parent.userData.product)return;
      const key=object.material.uuid;
      if(!buckets.has(key))buckets.set(key,{material:object.material,geometries:[]});
      const geometry=object.geometry.clone().applyMatrix4(new THREE.Matrix4().copy(group.matrixWorld).invert().multiply(object.matrixWorld));
      for(const attribute of Object.keys(geometry.attributes))if(attribute!=='normal'&&attribute!=='position')geometry.deleteAttribute(attribute);
      buckets.get(key).geometries.push(geometry);remove.push(object);
    });
    for(const object of remove)object.removeFromParent();
    for(const {material,geometries} of buckets.values()){
      const geometry=mergeGeometries(geometries);for(const g of geometries)g.dispose();
      const mesh=new THREE.Mesh(geometry,material);group.add(mesh);this.cache.geometries.set(`static-${this.cache.geometries.size}`,geometry);
    }
  }
  update(travelS){
    const length=CONFIG.cycleBeats*CONFIG.distancePerBeat,current=Math.floor(travelS/length);
    for(let slot=0;slot<this.cycles.length;slot++){
      const cycle=current-1+slot,group=this.cycles[slot];group.position.z=cycle*length-travelS;group.userData.cycle=cycle;
    }
  }
  showContacts(show){for(const line of this.debugLines)line.visible=show;}
  contactDiagnostics(travelS){
    return this.products.map(({parent,model,product})=>({id:`${parent.userData.cycle}:${product.id}`,beat:parent.userData.cycle*CONFIG.cycleBeats+product.beat,
      outfit:product.outfit,model:model.getWorldPosition(new THREE.Vector3()).toArray(),travelS})).filter(p=>Math.abs(p.beat-travelS/.6)<3);
  }
}
