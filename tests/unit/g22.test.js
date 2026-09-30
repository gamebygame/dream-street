import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { AssetCache, createActor } from '../../src/character/rig.js';
import { sampleWalk, sampleDance } from '../../src/character/pose.js';
import { wardrobeAt } from '../../src/content/plan.js';
import { CYCLISTS, cyclistPose, cyclistState } from '../../src/content/cyclists.js';
import { notesBetween } from '../../src/audio/score.js';
import { CONFIG } from '../../src/config.js';

test('walking elbows flex through a natural range and actual joints remain continuous', () => {
  const cache = new AssetCache(),
    actor = createActor(cache),
    previous = {},
    range = { left: [Infinity, -Infinity], right: [Infinity, -Infinity] };
  for (let beat = 0; beat < 4; beat += 0.01) {
    actor.applyPose(sampleWalk(beat, { social: false }));
    for (const name of ['left', 'right']) {
      const arm = actor[name + 'Arm'],
        a = arm.upper.getWorldPosition(new THREE.Vector3()),
        b = arm.lower.getWorldPosition(new THREE.Vector3()),
        c = arm.end.getWorldPosition(new THREE.Vector3());
      const flex = Math.PI - a.sub(b).angleTo(c.clone().sub(b));
      // Never locked straight, never a raised forearm: about 15 to 45 degrees while walking.
      assert.ok(flex > 0.24 && flex < 0.8, `${beat}: ${flex}`);
      range[name] = [Math.min(range[name][0], flex), Math.max(range[name][1], flex)];
      // A pose jump moves the hand several centimetres; the fullest natural swing moves it about 0.009 here.
      if (previous[name]) assert.ok(c.distanceTo(previous[name]) < 0.012);
      previous[name] = c;
    }
  }
  // Ordinary gait shows roughly 30 degrees of elbow travel; a nearly rigid arm reads as stiff.
  for (const [low, high] of Object.values(range)) assert.ok(high - low > 0.42, `${low}..${high}`);
  cache.dispose();
});

test('the flower chapter has sustained weight and grounded footwork instead of outfit-driven pops', () => {
  const speed = (start, end) => {
    let energy = 0;
    for (let b = start; b < end; b += 0.02) {
      const a = sampleDance(b),
        c = sampleDance(b + 0.02);
      for (const key of ['hip', 'chest', 'leftHand'])
        energy += a[key].reduce((sum, v, i) => sum + (v - c[key][i]) ** 2, 0);
    }
    return energy / (end - start);
  };
  assert.ok(speed(150, 198) < speed(0, 16) * 0.08);
  for (let beat = 148; beat < 204; beat += 0.1) {
    const state = wardrobeAt(beat),
      p = sampleDance(beat, { ...state, weights: { sport: 1 } });
    assert.ok(p.leftFoot[1] < 0.097 && p.rightFoot[1] < 0.097);
    assert.ok(p.leftHand[1] < 1.3);
    assert.ok(Math.abs(p.chest[1]) < 0.15);
  }
});

test('flower gestures keep relaxed elbows below the shoulder instead of propping both arms forward', () => {
  const cache = new AssetCache(),
    actor = createActor(cache, { transitions: true });
  for (let beat = 148; beat < 162; beat += 0.1) {
    actor.applyPose(sampleDance(beat));
    for (const arm of [actor.leftArm, actor.rightArm]) {
      const shoulder = arm.upper.getWorldPosition(new THREE.Vector3()),
        elbow = arm.lower.getWorldPosition(new THREE.Vector3());
      assert.ok(elbow.y < shoulder.y - 0.12);
    }
  }
  cache.dispose();
});

test('every cyclist acknowledges the protagonist before imitation and again on departure', () => {
  for (const person of CYCLISTS)
    for (const beat of [person.join - 16, person.leave + 3]) {
      const state = cyclistState(person, beat),
        p = cyclistPose(person, beat, state, wardrobeAt(beat));
      assert.ok(state.acknowledgement > 0.99);
      assert.ok(p.leftHand[1] > 1.6);
      assert.ok(Math.abs(p.head[1]) > 0.5);
      assert.deepEqual(p.rightHand, [-0.32, 1.23, 0.52]);
      assert.equal(p.rightArmWalk, 0);
    }
});

test('cloth light stays in one preallocated reflection group and completes after the garment reveal', () => {
  const cache = new AssetCache(),
    actor = createActor(cache, { transitions: true }),
    count = cache.geometries.size;
  actor.setWardrobe(wardrobeAt(18.2));
  assert.equal(actor.clothLight.group.visible, false);
  actor.setWardrobe(wardrobeAt(19));
  assert.equal(actor.clothLight.group.visible, true);
  assert.ok(actor.clothLight.opacity.value > 0.8);
  assert.equal(actor.clothLight.group.parent, actor.root);
  for (let beat = 0; beat < 1024; beat += 0.2) actor.setWardrobe(wardrobeAt(beat));
  assert.equal(cache.geometries.size, count);
  assert.equal(actor.clothLight.group.children.length, 2);
  actor.setWardrobe(wardrobeAt(21));
  assert.equal(actor.clothLight.group.visible, false);
  cache.dispose();
});

test('every beat carries an audible pulse for the walking step, in every chapter and across the seam', () => {
  const pulse = ['kick', 'snare', 'clap', 'hat', 'shaker', 'stomp', 'groupClap', 'tom', 'tambourine'];
  for (let beat = 0; beat < 2 * CONFIG.cycleBeats; beat++) {
    const onBeat = notesBetween(beat, beat + 0.001).map(n => n.inst);
    assert.ok(
      onBeat.some(inst => pulse.includes(inst)),
      `beat ${beat} has no pulse`,
    );
  }
});

test('each chapter entrance is marked, and the loop seam gets a fill and a crash only after the first cycle', () => {
  const at = beat => notesBetween(beat, beat + 0.001).map(n => n.inst);
  for (const beat of [80, 208, 256, 512]) assert.ok(at(beat).includes('crash'), `${beat}`);
  assert.ok(!at(0).includes('crash'));
  // A soft snare roll carries the farewell crossroad into the flowers, rising to its last stroke.
  const roll = notesBetween(142, 144).filter(n => n.inst === 'snare');
  assert.ok(roll.length >= 8 && roll.every((n, i) => i === 0 || n.vel > roll[i - 1].vel));
  // Each build is the drummer's fill, landing on its window: the four-hit, the crowd groove, the parade and the
  // next cycle.
  for (const entrance of [48, 80, 208, 256])
    assert.ok(notesBetween(entrance - 1, entrance).filter(n => n.inst === 'tom').length >= 4, `${entrance}`);
});
