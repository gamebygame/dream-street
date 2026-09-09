import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {AssetCache,createActor} from '../../src/character/rig.js';
import {sampleWalk,sampleDance} from '../../src/character/pose.js';
import {wardrobeAt} from '../../src/content/plan.js';
import {CYCLISTS,cyclistPose,cyclistState} from '../../src/content/cyclists.js';
import {ReferenceMusic,referenceWindowAt} from '../../src/audio/reference.js';

test('walking elbows stay flexed through both swing extremes and actual joints remain continuous',()=>{
  const cache=new AssetCache(),actor=createActor(cache),previous={};
  for(let beat=0;beat<4;beat+=.01){
    actor.applyPose(sampleWalk(beat,{social:false}));
    for(const name of ['left','right']){
      const arm=actor[name+'Arm'],a=arm.upper.getWorldPosition(new THREE.Vector3()),b=arm.lower.getWorldPosition(new THREE.Vector3()),c=arm.end.getWorldPosition(new THREE.Vector3());
      const flex=Math.PI-a.sub(b).angleTo(c.clone().sub(b));
      assert.ok(flex>.14&&flex<.34,`${beat}: ${flex}`);
      if(previous[name])assert.ok(c.distanceTo(previous[name])<.009);previous[name]=c;
    }
  }
  cache.dispose();
});

test('the flower chapter has sustained weight and grounded footwork instead of outfit-driven pops',()=>{
  const speed=(start,end)=>{
    let energy=0;
    for(let b=start;b<end;b+=.02){const a=sampleDance(b),c=sampleDance(b+.02);
      for(const key of ['hip','chest','leftHand'])energy+=a[key].reduce((sum,v,i)=>sum+(v-c[key][i])**2,0);
    }return energy/(end-start);
  };
  assert.ok(speed(150,198)<speed(0,16)*.08);
  for(let beat=148;beat<204;beat+=.1){
    const state=wardrobeAt(beat),p=sampleDance(beat,{...state,weights:{sport:1}});
    assert.ok(p.leftFoot[1]<.097&&p.rightFoot[1]<.097);
    assert.ok(p.leftHand[1]<1.3);assert.ok(Math.abs(p.chest[1])<.15);
  }
});

test('flower gestures keep relaxed elbows below the shoulder instead of propping both arms forward',()=>{
  const cache=new AssetCache(),actor=createActor(cache,{transitions:true});
  for(let beat=148;beat<162;beat+=.1){
    actor.applyPose(sampleDance(beat));
    for(const arm of [actor.leftArm,actor.rightArm]){
      const shoulder=arm.upper.getWorldPosition(new THREE.Vector3()),elbow=arm.lower.getWorldPosition(new THREE.Vector3());
      assert.ok(elbow.y<shoulder.y-.12);
    }
  }cache.dispose();
});

test('every cyclist acknowledges the protagonist before imitation and again on departure',()=>{
  for(const person of CYCLISTS)for(const beat of [person.join-16,person.leave+3]){
    const state=cyclistState(person,beat),p=cyclistPose(person,beat,state,wardrobeAt(beat));
    assert.ok(state.acknowledgement>.99);assert.ok(p.leftHand[1]>1.6);assert.ok(Math.abs(p.head[1])>.5);
    assert.deepEqual(p.rightHand,[-.32,1.23,.52]);assert.equal(p.rightArmWalk,0);
  }
});

test('cloth light stays in one preallocated reflection group and completes after the garment reveal',()=>{
  const cache=new AssetCache(),actor=createActor(cache,{transitions:true}),count=cache.geometries.size;
  actor.setWardrobe(wardrobeAt(18.2));assert.equal(actor.clothLight.group.visible,false);
  actor.setWardrobe(wardrobeAt(19));assert.equal(actor.clothLight.group.visible,true);assert.ok(actor.clothLight.opacity.value>.8);
  assert.equal(actor.clothLight.group.parent,actor.root);
  for(let beat=0;beat<1024;beat+=.2)actor.setWardrobe(wardrobeAt(beat));
  assert.equal(cache.geometries.size,count);assert.equal(actor.clothLight.group.children.length,2);
  actor.setWardrobe(wardrobeAt(21));assert.equal(actor.clothLight.group.visible,false);cache.dispose();
});

test('YouTube clock keeps the full-track timeline at chapter changes and freezes for buffering',()=>{
  const ref=new ReferenceMusic();let time=80;
  ref.player={getCurrentTime:()=>time,getDuration:()=>420};ref.active={start:0,end:840,held:159.8};ref.status='playing';
  assert.equal(ref.sample().beat,160);time=128;assert.equal(ref.sample().beat,256);
  ref.status='buffering';time=129;assert.equal(ref.sample().beat,256);
  ref.status='playing';assert.equal(ref.sample().beat,258);
  time=4;assert.equal(ref.sample().seek,true);assert.equal(ref.sample().beat,8);
});

test('fractional recording durations cross repeated song boundaries without restarting the previous loop',()=>{
  const duration=215.841,length=duration*2;let window=referenceWindowAt(0,duration);
  for(let i=1;i<100;i++){
    window=referenceWindowAt(window.end,duration);
    assert.ok(Math.abs(window.start-i*length)<1e-7);
  }
});
