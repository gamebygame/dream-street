import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { AssetCache, createActor } from '../../src/character/rig.js';
import { sampleDance, sampleWalk } from '../../src/character/pose.js';
import { wardrobeAt } from '../../src/content/plan.js';
import { CROWD, crowdPose, crowdState } from '../../src/content/crowd.js';
import { CYCLISTS, cyclistPose, cyclistState } from '../../src/content/cyclists.js';

const shoulder = new THREE.Vector3(),
  elbow = new THREE.Vector3(),
  hand = new THREE.Vector3(),
  forward = new THREE.Vector3(),
  rotation = new THREE.Quaternion();

/**
 * Where each elbow sits relative to its own shoulder-hand line. `front` > 0 means the elbow is in front of that
 * line. With the hand below the shoulder, a front elbow lifts the upper arm forward while the forearm droops back
 * toward the body: the zombie reach.
 */
function arms(actor) {
  actor.poseRoot.getWorldQuaternion(rotation);
  forward.set(0, 0, 1).applyQuaternion(rotation);
  return [actor.leftArm, actor.rightArm].map(arm => {
    arm.upper.getWorldPosition(shoulder);
    arm.lower.getWorldPosition(elbow);
    arm.end.getWorldPosition(hand);
    const line = hand.clone().sub(shoulder).normalize(),
      toElbow = elbow.clone().sub(shoulder);
    const offLine = toElbow.clone().addScaledVector(line, -toElbow.dot(line));
    const lift = toElbow.normalize().angleTo(new THREE.Vector3(0, -1, 0));
    return { front: offLine.dot(forward), handBelowShoulder: shoulder.y - hand.y, lift };
  });
}

function assertNoZombieReach(label, samples) {
  const reaching = samples.filter(s => s.handBelowShoulder > 0.05);
  assert.ok(reaching.length > 20, `${label}: too few low-hand samples`);
  const worst = Math.max(...reaching.map(s => s.front));
  assert.ok(worst <= 0.02, `${label}: an elbow sits ${worst.toFixed(3)} in front of a low hand`);
}

test('the reflection never reaches forward with a raised upper arm and a drooping forearm', () => {
  const cache = new AssetCache(),
    dancer = createActor(cache, { transitions: true }),
    samples = [];
  for (let beat = 0; beat < 256; beat += 0.25) {
    const wardrobe = wardrobeAt(beat);
    dancer.setWardrobe(wardrobe);
    dancer.applyPose(sampleDance(beat, wardrobe));
    samples.push(...arms(dancer));
  }
  assertNoZombieReach('dancer', samples);
  cache.dispose();
});

test('walking arms hang and swing low with elbows behind the body line', () => {
  const cache = new AssetCache(),
    walker = createActor(cache),
    samples = [];
  for (let beat = 0; beat < 8; beat += 0.05) {
    walker.applyPose(sampleWalk(beat, { social: false }));
    samples.push(...arms(walker));
  }
  assertNoZombieReach('walker', samples);
  for (const s of samples) {
    // Waist height at the front of the swing; a hand held before the chest would be about 0.2 below the shoulder.
    assert.ok(s.handBelowShoulder > 0.38, `walking hand rose to ${s.handBelowShoulder.toFixed(2)} below the shoulder`);
    assert.ok(s.lift < (30 * Math.PI) / 180, `walking upper arm lifted ${((s.lift * 180) / Math.PI).toFixed(1)}°`);
  }
  cache.dispose();
});

test('passers-by keep natural elbows while arriving, imitating and waving goodbye', () => {
  const cache = new AssetCache(),
    walking = [],
    imitating = [];
  for (const index of [0, 7, 13, 22, 35]) {
    const person = CROWD[index],
      actor = createActor(cache, { ...person, outfitIds: [person.outfit], accessories: false });
    for (let beat = 20; beat < 170; beat += 0.5) {
      const state = crowdState(person, beat);
      if (!state.visible) continue;
      actor.applyPose(crowdPose(person, beat, state, wardrobeAt(beat)));
      (state.participation < 0.05 && !state.wave ? walking : imitating).push(...arms(actor));
    }
  }
  assertNoZombieReach('walking passers-by', walking);
  assertNoZombieReach('imitating passers-by', imitating);
  for (const s of walking) assert.ok(s.lift < (30 * Math.PI) / 180, 'a walking passer-by lifted an arm');
  cache.dispose();
});

test('cyclists steer with natural elbows and imitate with the free hand', () => {
  const cache = new AssetCache(),
    rider = createActor(cache, { outfit: 'jacket', outfitIds: ['jacket'], accessories: false }),
    samples = [];
  rider.root.position.y = 0.18;
  for (const person of CYCLISTS)
    for (let beat = person.start; beat < person.end; beat += 0.5) {
      const state = cyclistState(person, beat);
      if (!state.visible) continue;
      rider.applyPose(cyclistPose(person, beat, state, wardrobeAt(beat)));
      samples.push(...arms(rider));
    }
  // Handlebar grips sit at elbow height, so only the free hand's lower reaches are constrained here.
  const worst = Math.max(...samples.map(s => s.front));
  assert.ok(worst <= 0.02, `a riding elbow sits ${worst.toFixed(3)} in front of its hand line`);
  cache.dispose();
});
