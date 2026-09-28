import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { wardrobeAt } from '../../src/content/plan.js';
import { sampleDance, sampleWalk } from '../../src/character/pose.js';
import { AssetCache, createActor } from '../../src/character/rig.js';
import { CROWD, crowdState, crowdPose } from '../../src/content/crowd.js';
import { FAREWELLS, greetingAt } from '../../src/content/social.js';
import { CYCLISTS, cyclistState, cyclistPose } from '../../src/content/cyclists.js';
import { referenceWindowAt, ReferenceMusic } from '../../src/audio/reference.js';

test('each electric phrase releases the arms and contains footwork, torso turns and a brief hat gesture', () => {
  const poses = Array.from({ length: 160 }, (_, i) => sampleDance(i / 10, wardrobeAt(0)));
  assert.ok(poses.filter(p => p.leftHand[1] < 0.8 || p.rightHand[1] < 0.8).length > 110);
  assert.ok(poses.some(p => p.rightHand[1] > 1.9));
  assert.ok(poses.some(p => p.rightFoot[1] > 0.24));
  assert.ok(Math.max(...poses.map(p => p.chest[1])) - Math.min(...poses.map(p => p.chest[1])) > 0.4);
  for (const b of [1, 4, 4.5, 5.5, 6.5, 7.2, 8, 15, 16]) {
    const h = 0.0001,
      prev = sampleDance(b - h, wardrobeAt(0)),
      at = sampleDance(b, wardrobeAt(0)),
      next = sampleDance(b + h, wardrobeAt(0));
    for (const key of ['leftHand', 'rightHand', 'chest'])
      for (let i = 0; i < 3; i++)
        assert.ok(Math.abs((at[key][i] - prev[key][i]) / h - (next[key][i] - at[key][i]) / h) < 0.02, `${b} ${key}`);
  }
});
test('torso garments follow body isolation, and the rose is actually attached to the mouth', () => {
  const cache = new AssetCache(),
    actor = createActor(cache, { transitions: true });
  const a = sampleDance(2),
    b = { ...a, chest: [0.25, 0.3, -0.2] };
  actor.applyPose(a);
  const before = actor.torsoRoot.matrixWorld.clone();
  actor.applyPose(b);
  assert.notDeepEqual(actor.torsoRoot.matrixWorld.elements, before.elements);
  assert.equal(actor.props.get('rose').parent, actor.head);
  assert.equal(actor.props.get('bouquet').parent, actor.rightArm.end);
  assert.equal(actor.props.get('umbrella').parent, actor.rightArm.end);
  cache.dispose();
});
test('the held parasol clears the tall hat throughout its dance phrase', () => {
  const cache = new AssetCache(),
    actor = createActor(cache, { transitions: true });
  for (let beat = 166; beat < 173; beat += 0.1) {
    const wardrobe = wardrobeAt(beat);
    actor.setWardrobe(wardrobe);
    actor.applyPose(sampleDance(beat, wardrobe));
    const hat = actor.clothes.get('old').parts.find(p => p.parent === actor.head);
    const top = new THREE.Box3().setFromObject(hat),
      canopy = new THREE.Box3().setFromObject(actor.props.get('umbrella').userData.canopy);
    assert.ok(canopy.min.y > top.max.y + 0.01, `${beat}: ${canopy.min.y} / ${top.max.y}`);
  }
  cache.dispose();
});
test('props change gesture, gaze and wrist articulation without a pose jump when acquired or released', () => {
  for (const [id, beat] of [
    ['bouquet', 149],
    ['rose', 158],
    ['umbrella', 169],
    ['cane', 120],
    ['watch', 43],
    ['record', 35],
    ['puppet', 215],
    ['cup', 233],
  ]) {
    const state = wardrobeAt(beat),
      pose = sampleDance(beat, state),
      empty = sampleDance(beat, { ...state, accessoryWeights: {} });
    assert.ok(state.accessoryWeights[id] > 0.8, id);
    assert.notDeepEqual(pose.rightHand, empty.rightHand, id);
    assert.notDeepEqual(pose.head, empty.head, id);
  }
  for (let beat = 144; beat < 174; beat += 0.031) {
    const a = sampleDance(beat),
      b = sampleDance(beat + 0.001);
    for (const key of ['rightHand', 'leftHand', 'head'])
      for (let j = 0; j < 3; j++) assert.ok(Math.abs(a[key][j] - b[key][j]) < 0.04, `${beat} ${key}`);
  }
});
test('walking paths have bounded speed and preserve separation through the junction without positional pushes', () => {
  for (let beat = 40; beat < 168; beat += 0.25) {
    const people = CROWD.map(p => crowdState(p, beat));
    for (const [i, a] of people.entries()) {
      const b = crowdState(CROWD[i], beat + 0.001);
      if (a.visible && b.visible) {
        const speed = Math.hypot(b.x - a.x, b.z - a.z + 0.0006) / 0.001;
        assert.ok(speed >= 0.599 && speed < 1.1, `${beat} ${i} ${speed}`);
      }
      for (let j = i + 1; j < people.length; j++) {
        const b = people[j];
        if (a.visible && b.visible) assert.ok(Math.hypot(a.x - b.x, a.z - b.z) > 1, `${beat} ${i} ${j}`);
      }
    }
  }
});
test('a passer greeting drives a delayed response from the protagonist and settles back into walking', () => {
  for (const cue of FAREWELLS) {
    const beat = cue.reply + 0.8,
      s = greetingAt(beat),
      person = CROWD[cue.person];
    assert.equal(s.person, person.index);
    assert.ok(Math.abs(s.reply) > 0.9);
    const pose = crowdPose(person, beat),
      walker = sampleWalk(beat);
    assert.ok(pose.rightHand[1] > 1.7);
    assert.ok(Math.abs(walker.head[1]) > 1);
    assert.ok(Math.max(walker.leftHand[1], walker.rightHand[1]) > 1.3);
  }
  assert.equal(greetingAt(160).person, null);
  assert.deepEqual(sampleWalk(160), sampleWalk(160, { social: false }));
  for (const beat of [130, 136, 142, 149, 157]) {
    const a = sampleWalk(beat - 0.0001),
      b = sampleWalk(beat + 0.0001);
    assert.ok(Math.abs(a.head[1] - b.head[1]) < 0.001);
  }
});
test('bicycle feet reach the pedals, the steering hand stays on the bar and wheel travel is monotonic', () => {
  const cache = new AssetCache(),
    actor = createActor(cache, { outfit: 'jacket', outfitIds: ['jacket'], accessories: false });
  actor.root.position.y = 0.18;
  for (const person of CYCLISTS) {
    for (const beat of [person.join, person.join + 1, person.join + 3]) {
      const state = cyclistState(person, beat),
        pose = cyclistPose(person, beat, state, wardrobeAt(beat));
      actor.applyPose(pose);
      const hand = actor.rightArm.end.getWorldPosition(new THREE.Vector3());
      assert.ok(hand.distanceTo(new THREE.Vector3(-0.2912, 1.2993, 0.4732)) < 0.02);
      for (const [i, side] of [1, -1].entries()) {
        const a = (state.distance / 1.9) * Math.PI * 2 + (side === 1 ? 0 : Math.PI),
          foot = actor.footPositions[i];
        assert.ok(Math.hypot(foot[1] - (0.54 + 0.16 * Math.cos(a)), foot[2] - (0.05 + 0.16 * Math.sin(a))) < 0.03);
      }
      assert.ok(cyclistState(person, beat + 0.001).distance > state.distance);
    }
  }
  cache.dispose();
});
test('the exact reference is the default and runs across all street chapters without a synthesizer layer', () => {
  const reference = new ReferenceMusic();
  assert.equal(reference.mode, 'youtube');
  for (const beat of [0, 145, 170, 208, 252, 256, 512]) {
    assert.deepEqual(referenceWindowAt(beat, 420), { start: 0, end: 840 });
    assert.equal(reference.allows({ variant: 'lyric' }), false);
    assert.equal(reference.allows({ variant: 'daylight' }), false);
  }
  assert.deepEqual(referenceWindowAt(841, 420), { start: 840, end: 1680 });
});
