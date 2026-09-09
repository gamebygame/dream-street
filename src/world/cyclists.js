import * as THREE from 'three';
import {createActor,mesh} from '../character/rig.js';
import {CYCLISTS,cyclistState,cyclistPose} from '../content/cyclists.js';

export class Cyclists{
  constructor(scene,cache,camera){
    this.group=new THREE.Group();this.group.name='passing-bicycles';scene.add(this.group);
    this.camera=camera;this.point=new THREE.Vector3();this.visibleCount=0;
    this.people=CYCLISTS.map(person=>{
      const root=new THREE.Group();this.group.add(root);const wheels=[],cranks=[];
      const beam=(a,b,width,color=person.color)=>{
        const from=new THREE.Vector3(...a),to=new THREE.Vector3(...b),delta=to.clone().sub(from);
        const part=mesh(cache,root,'bicycle-tube',()=>new THREE.CylinderGeometry(1,1,1,8),color,from.add(to).multiplyScalar(.5).toArray(),[width,delta.length(),width]);
        part.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),delta.normalize());return part;
      };
      for(const z of [-.65,.65]){
        const wheel=new THREE.Group();wheel.position.set(0,.35,z);root.add(wheel);wheels.push(wheel);
        const tire=mesh(cache,wheel,'bicycle-tire',()=>new THREE.TorusGeometry(.33,.024,6,28),'#3c4946');tire.rotation.y=Math.PI/2;
        const rim=mesh(cache,wheel,'bicycle-rim',()=>new THREE.TorusGeometry(.301,.008,4,28),'#a4afa8');rim.rotation.y=Math.PI/2;
        for(let i=0;i<6;i++){
          const spoke=mesh(cache,wheel,'bicycle-spoke',()=>new THREE.CylinderGeometry(.004,.004,.59,4),'#aeb4a9');spoke.rotation.x=i*Math.PI/6;
        }
      }
      const rear=[0,.35,-.65],front=[0,.35,.65],seat=[0,.93,-.15],crank=[0,.45,.05],neck=[0,.93,.5];
      for(const [a,b] of [[rear,seat],[rear,crank],[seat,crank],[seat,neck],[neck,crank],[neck,front]])beam(a,b,.024);
      beam(seat,[0,1.035,-.15],.023,'#9aa59e');
      mesh(cache,root,'box',()=>new THREE.BoxGeometry(1,1,1),'#4f4741',[0,1.035,-.15],[.30,.06,.27]);
      beam(neck,[0,1.30,.4732],.022,'#a4afa8');beam([-.291,1.30,.4732],[.291,1.30,.4732],.02,'#3f514c');
      for(const side of [-1,1]){
        const pedal=new THREE.Group();root.add(pedal);cranks.push({pedal,side});
        mesh(cache,pedal,'box',()=>new THREE.BoxGeometry(1,1,1),'#3f4d48',[0,0,0],[.18,.035,.16]);
      }
      const actor=createActor(cache,{outfit:'jacket',outfitIds:['jacket'],accessories:false,skinColor:person.skinColor,hatStyle:'cap',palette:{color:person.color,dark:'#3c5455',trim:'#d7cdb0',pants:'#536366'}});
      actor.root.position.y=.18;root.add(actor.root);
      return {person,root,actor,wheels,cranks,state:null};
    });
  }
  update(beat,wardrobe){
    this.visibleCount=0;
    for(const rider of this.people){
      const state=cyclistState(rider.person,beat);rider.state=state;rider.root.visible=state.visible;
      if(!state.visible)continue;
      rider.root.position.set(state.x,0,state.z);
      for(const wheel of rider.wheels)wheel.rotation.x=state.distance/.33;
      const phase=state.distance/1.9*Math.PI*2;
      for(const {pedal,side} of rider.cranks){const a=phase+(side===1?0:Math.PI);pedal.position.set(side*.20,.45+.16*Math.cos(a),.05+.16*Math.sin(a));}
      rider.actor.applyPose(cyclistPose(rider.person,beat,state,wardrobe));
      this.point.set(state.x,1,state.z).project(this.camera);
      if(Math.abs(this.point.x)<1&&Math.abs(this.point.y)<1)this.visibleCount++;
    }
  }
  diagnostics(){return {pool:this.people.length,visible:this.visibleCount};}
  dispose(){this.group.removeFromParent();}
}
