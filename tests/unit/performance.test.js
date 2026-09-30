import test from 'node:test';
import assert from 'node:assert/strict';
import { CONFIG } from '../../src/config.js';
import {
  sampleScene,
  contactsBetween,
  ContactTracker,
  wardrobeAt,
  projectToGlass,
  displayPosition,
  validatePlan,
  PRODUCTS,
} from '../../src/content/plan.js';
import { sampleDance, sampleWalk, walkFoot } from '../../src/character/pose.js';
import { AssetCache, createActor } from '../../src/character/rig.js';
import { notesBetween } from '../../src/audio/score.js';

test('authored content is internally valid', () => assert.equal(validatePlan(), true));
test('the two performers share uninterrupted travel over cycle boundaries', () => {
  for (const beat of [0, 49.4, 55.4, 64, 79.999, 80, 80.001, 240, 10_000]) {
    const s = sampleScene(beat);
    assert.equal(s.walkerAnchorS, s.reflectionAnchorS);
    assert.equal(s.travelS, beat * 0.6);
  }
  assert.ok(sampleScene(80.001).travelS > sampleScene(79.999).travelS);
});
test('the office preserves the new outfit before a visible recovery at beat 64', () => {
  assert.equal(wardrobeAt(60).outfit, 'open');
  assert.equal(wardrobeAt(63.999).outfit, 'open');
  assert.equal(wardrobeAt(64).outfit, 'old');
  assert.equal(wardrobeAt(144).outfit, 'old');
});
test('four costume contacts precede the four band hits of the score', () => {
  for (const [i, p] of PRODUCTS.filter(p => p.hit).entries()) {
    assert.ok(Math.abs(p.hit - p.beat - CONFIG.contactLead) < 1e-10);
    assert.notEqual(wardrobeAt(p.beat - 0.001).outfit, p.outfit);
    assert.equal(wardrobeAt(p.hit).outfit, ['jacket', 'sport', 'coat', 'open'][i]);
    const accent = notesBetween(p.hit, p.hit + 0.001).map(n => n.inst);
    for (const inst of ['kick', 'snare', 'tom', 'crash', 'guitar', 'bass', 'piano'])
      assert.ok(accent.includes(inst), `${p.hit} ${inst}`);
    // Stop-time: no kick between one accent and the preparation for the next.
    assert.equal(notesBetween(p.hit + 0.25, p.hit + 1.5).filter(n => n.inst === 'kick').length, 0);
  }
});
test('cross-frame contacts are unique and independent of frame cadence', () => {
  const end = CONFIG.cycleBeats * 3,
    coarse = contactsBetween(0, end),
    fine = [];
  let from = 0;
  for (let to = 0.137; to < end; to += 0.137) {
    fine.push(...contactsBetween(from, to));
    from = to;
  }
  fine.push(...contactsBetween(from, end));
  assert.deepEqual(fine, coarse);
  assert.equal(new Set(coarse.map(e => e.id)).size, coarse.length);
  assert.equal(coarse.length, PRODUCTS.length * 3);
  const tracker = new ContactTracker();
  tracker.advance(end);
  assert.equal(tracker.advance(end).length, 0);
  assert.ok(tracker.recent.length <= 32);
});
test('a seek reconstructs appearance without a pre-roll or animation reset', () => {
  const a = sampleScene(54),
    pose = sampleDance(54);
  const tracker = new ContactTracker();
  tracker.advance(999);
  tracker.seek(54);
  assert.deepEqual(sampleScene(54), a);
  assert.deepEqual(sampleDance(54), pose);
  assert.equal(tracker.advance(54).length, 0);
  assert.notDeepEqual(sampleDance(63.99), sampleDance(64.01));
});
test('display depth is projected onto the glass contact section', () => {
  const direction = { x: 0.55, y: -0.61, z: 0.55 };
  const reference = projectToGlass({ x: CONFIG.facadeX + 0.46, y: 2, z: 30 + 0.46 }, direction);
  assert.ok(Math.abs(reference.z - 30) < 1e-10);
  assert.equal(reference.x, CONFIG.facadeX);
  assert.ok(reference.y > 2); // The viewing ray is traced back toward the glass.
});
test('actual product placement aligns in both height and travel with the reflection', () => {
  const direction = { x: 0.557, y: -0.616, z: 0.557 };
  for (const product of PRODUCTS) {
    const p = displayPosition(product.beat * 0.6, 0.27, direction),
      q = projectToGlass(p, direction);
    assert.ok(Math.abs(q.y - CONFIG.reflectionFloor) < 1e-10);
    assert.ok(Math.abs(q.z - product.beat * 0.6) < 1e-10);
  }
});
test('stance feet remain planted in street coordinates including the actor scale', () => {
  const cache = new AssetCache(),
    actor = createActor(cache);
  const positions = [];
  for (const beat of [0.05, 0.25, 0.5, 0.75, 0.95]) {
    actor.applyPose(sampleWalk(beat));
    positions.push(actor.footPositions[0][2] + beat * CONFIG.distancePerBeat);
    assert.ok(actor.footPositions[0][1] >= 0.08);
  }
  assert.ok(Math.max(...positions) - Math.min(...positions) < 1e-5, JSON.stringify(positions));
  cache.dispose();
});
test('dance phrase joins without a pose discontinuity at entry, exit and garment changes', () => {
  for (const beat of [...PRODUCTS.map(p => p.beat), 48, 60, 64, 80, 144, 208, 256]) {
    const a = sampleDance(beat - 1e-5),
      b = sampleDance(beat + 1e-5);
    for (const name of ['hip', 'leftHand', 'rightHand', 'leftFoot', 'rightFoot'])
      for (let i = 0; i < 3; i++) assert.ok(Math.abs(a[name][i] - b[name][i]) < 0.001, `${beat} ${name}`);
  }
});
test('score partitioning has no double notes and querying ahead changes no scene state', () => {
  const notes = notesBetween(0, 240);
  assert.equal(new Set(notes.map(n => n.id)).size, notes.length);
  const before = sampleScene(18);
  notesBetween(50, 64);
  assert.deepEqual(sampleScene(18), before);
  assert.deepEqual([...notesBetween(0, 50.125), ...notesBetween(50.125, 80)], notesBetween(0, 80));
});
