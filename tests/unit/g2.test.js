import test from 'node:test';
import assert from 'node:assert/strict';
import { BLOCKS, PRODUCTS, wardrobeAt, themeWeightsAt, contactsBetween } from '../../src/content/plan.js';
import { CROWD, crowdState, crowdPose } from '../../src/content/crowd.js';
import { sampleDance, sampleWalk } from '../../src/character/pose.js';
import { notesBetween } from '../../src/audio/score.js';

test('nine shop types, two real junctions, and eight staged props are present', () => {
  assert.deepEqual([...new Set(BLOCKS.map(b => b.kind).filter(k => k !== 'wall'))].sort(), [
    'antiques',
    'clocks',
    'fashion',
    'flowers',
    'gifts',
    'office',
    'records',
    'snacks',
    'toys',
  ]);
  for (const b of [82, 136]) assert.ok(!BLOCKS.some(s => b >= s.start && b < s.end));
  assert.equal(new Set(PRODUCTS.map(p => p.accessory).filter(Boolean)).size, 8);
});
test('wardrobe reveals begin at contact, finish before the next outfit, and survive the loop seam', () => {
  for (const p of PRODUCTS.filter(p => p.outfit)) {
    assert.equal(wardrobeAt(p.beat).progress, 0);
    assert.ok(wardrobeAt(p.beat + 0.15).progress > 0 && wardrobeAt(p.beat + 0.15).progress < 1);
    assert.equal(wardrobeAt(p.beat + (p.hit ? 1.15 : 1.8) + 0.001).progress, 1);
  }
  assert.equal(wardrobeAt(255.999).outfit, 'open');
  assert.equal(wardrobeAt(256.001).outfit, 'open');
  assert.equal(wardrobeAt(260).outfit, 'old');
  assert.equal(wardrobeAt(260).progress, 0);
  for (let b = 0; b < 800; b += 0.31) {
    const s = wardrobeAt(b);
    assert.ok(s.accessories.length <= 2);
    assert.ok(s.accessories.filter(p => p !== 'scarf').length <= 1);
    assert.ok(Math.abs(Object.values(s.weights).reduce((a, b) => a + b, 0) - 1) < 1e-10);
    assert.ok(Object.values(s.accessoryWeights).filter(w => w > 0).length <= 2);
  }
});
test('four arrangements crossfade at authored gateways, including the continuing street seam', () => {
  for (let b = 0; b < 512; b += 0.37) {
    const weights = themeWeightsAt(b);
    assert.ok(Math.abs(weights.reduce((sum, t) => sum + t.weight, 0) - 1) < 1e-10);
  }
  const notes = notesBetween(0, 768);
  assert.equal(new Set(notes.map(n => n.id)).size, notes.length);
  assert.deepEqual([...notesBetween(0, 79.37), ...notesBetween(79.37, 768)], notes);
  for (const [a, b, id] of [
    [8, 72, 'daylight'],
    [84, 136, 'pocket'],
    [148, 200, 'lyric'],
    [212, 248, 'parade'],
  ]) {
    const phrase = notesBetween(a, b);
    assert.ok(phrase.length > 20);
    assert.ok(phrase.every(n => n.variant === id));
  }
  assert.equal(new Set(notes.map(n => n.variant)).size, 4);
  assert.ok(notesBetween(152, 200).every(n => !['kick', 'clap', 'hat'].includes(n.stem)));
  assert.ok(notesBetween(216, 248).some(n => n.stem === 'kick'));
});
test('36 varied identities arrive gradually, share travel, and all leave at the junction', () => {
  assert.equal(CROWD.length, 36);
  assert.equal(new Set(CROWD.map(p => p.id)).size, 36);
  assert.ok(new Set(CROWD.map(p => p.skinColor)).size >= 5);
  assert.ok(CROWD.some(p => p.child) && CROWD.some(p => p.elder));
  const count = b => CROWD.filter(p => crowdState(p, b).visible).length;
  assert.equal(count(0), 0);
  assert.ok(count(22) > 0 && count(22) < 36);
  assert.equal(count(96), 36);
  assert.equal(count(127), 36);
  assert.equal(count(170), 0);
  assert.equal(CROWD.filter(p => p.wave).length, 4);
  for (const p of CROWD) {
    const a = crowdState(p, 108),
      b = crowdState(p, 115);
    assert.equal(a.x, b.x);
    assert.equal(a.z, b.z);
    assert.ok(Math.hypot(a.x, a.z) > 1.5);
    for (const beat of [p.start, 96, p.leave, 147]) {
      const left = crowdState(p, beat - 1e-5),
        right = crowdState(p, beat + 1e-5);
      if (left.visible && right.visible) assert.ok(Math.hypot(left.x - right.x, left.z - right.z) < 0.001);
    }
  }
});
test('imitation varies without changing the protagonist walk, and clothing changes upper-body language', () => {
  assert.notDeepEqual(crowdPose(CROWD[0], 104.3), crowdPose(CROWD[1], 104.3));
  const old = wardrobeAt(104.3),
    sport = { ...old, weights: { sport: 1 } },
    coat = { ...old, weights: { coat: 1 } };
  assert.notDeepEqual(sampleDance(104.3, sport).chest, sampleDance(104.3, coat).chest);
  const a = sampleWalk(104.3),
    b = sampleWalk(138.8);
  assert.notEqual(a.head[1], b.head[1]);
  assert.ok(b.leftHand[1] > 1.2);
  assert.equal(contactsBetween(0, 256).length, 24);
});
