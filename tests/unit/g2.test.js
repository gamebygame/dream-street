import test from 'node:test';
import assert from 'node:assert/strict';
import { BLOCKS, PRODUCTS, REVEAL_BEATS, wardrobeAt, themeWeightsAt, contactsBetween } from '../../src/content/plan.js';
import { CROWD, crowdState, crowdPose } from '../../src/content/crowd.js';
import { sampleDance, sampleWalk } from '../../src/character/pose.js';
import { crowdEnergy, notesBetween } from '../../src/audio/score.js';

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
    assert.equal(wardrobeAt(p.beat + (p.hit ? REVEAL_BEATS.fourHit : REVEAL_BEATS.change) + 0.001).progress, 1);
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
test('four musical chapters share the street windows, and the flower chapter is tender', () => {
  for (let b = 0; b < 512; b += 0.37) {
    const weights = themeWeightsAt(b);
    assert.ok(Math.abs(weights.reduce((sum, t) => sum + t.weight, 0) - 1) < 1e-10);
  }
  const notes = notesBetween(0, 768);
  assert.equal(new Set(notes.map(n => n.id)).size, notes.length);
  assert.deepEqual([...notesBetween(0, 79.37), ...notesBetween(79.37, 768)], notes);
  for (const [a, b, id] of [
    [0, 80, 'daylight'],
    [80, 144, 'pocket'],
    [144, 208, 'lyric'],
    [208, 256, 'parade'],
  ]) {
    const phrase = notesBetween(a, b);
    assert.ok(phrase.length > 100, id);
    assert.ok(
      phrase.every(n => n.chapter === id),
      id,
    );
  }
  // No driving drums under the flowers: piano, a round bass, a violin-like guitar, a soft heartbeat and a shaker.
  const tender = notesBetween(148, 192);
  assert.ok(tender.every(n => ['piano', 'bass', 'lead', 'kick', 'shaker'].includes(n.inst)));
  assert.ok(tender.filter(n => n.inst === 'kick').every(n => n.params?.tone === 'soft'));
  assert.ok(tender.filter(n => n.inst === 'lead').every(n => n.params?.soft));
  // The parade drives on piano eighths over a backbeat.
  const parade = notesBetween(212, 248);
  for (let beat = 212; beat < 248; beat += 0.5)
    assert.ok(
      parade.some(n => n.inst === 'piano' && n.beat === beat),
      `${beat}`,
    );
  for (let beat = 213; beat < 248; beat += 2)
    assert.ok(
      parade.some(n => n.inst === 'snare' && n.beat === beat),
      `${beat}`,
    );
});
test('36 varied passers-by are street life first, join as he nears, share travel, and all leave at the junction', () => {
  assert.equal(CROWD.length, 36);
  assert.equal(new Set(CROWD.map(p => p.id)).size, 36);
  assert.ok(new Set(CROWD.map(p => p.skinColor)).size >= 5);
  assert.ok(CROWD.some(p => p.child) && CROWD.some(p => p.elder));
  // Browsing, waiting at a corner, chatting, crossing from the side street and walking the other way.
  assert.equal(new Set(CROWD.map(p => p.activity)).size, 5);
  const count = b => CROWD.filter(p => crowdState(p, b).visible).length;
  assert.equal(count(0), 0);
  const street = CROWD.map(p => crowdState(p, 60)).filter(s => s.visible);
  assert.ok(street.length > 0 && street.length < 36);
  assert.ok(street.every(s => ['browse', 'wait', 'chat', 'cross', 'oncoming'].includes(s.phase)));
  assert.equal(count(110), 36);
  assert.equal(count(127), 36);
  assert.equal(count(170), 0);
  assert.equal(CROWD.filter(p => p.wave).length, 4);
  for (const p of CROWD) {
    // Nobody is conjured beside him: each is first seen at a distance, doing their own thing.
    let first = 0;
    while (!crowdState(p, first).visible) first += 0.25;
    const seen = crowdState(p, first);
    assert.equal(seen.phase, p.activity, p.id);
    assert.ok(Math.hypot(seen.x, seen.z) > 8, `${p.id} appears ${Math.hypot(seen.x, seen.z).toFixed(1)} away`);
    // They set off only once he is near: people walking toward him turn about four seconds before they would meet.
    const setOff = crowdState(p, p.path.join);
    assert.ok(Math.hypot(setOff.x, setOff.z) < 14, `${p.id} sets off too early`);
    assert.ok(p.path.end <= 110, `${p.id} is still joining at ${p.path.end}`);
    const a = crowdState(p, 110),
      b = crowdState(p, 116);
    assert.equal(a.x, b.x);
    assert.equal(a.z, b.z);
    assert.ok(Math.hypot(a.x, a.z) > 1.5);
    for (const beat of [p.path.join, p.path.end, p.leave, 147]) {
      const left = crowdState(p, beat - 1e-5),
        right = crowdState(p, beat + 1e-5);
      if (left.visible && right.visible) {
        assert.ok(Math.hypot(left.x - right.x, left.z - right.z) < 0.001, `${p.id} jumps at ${beat}`);
        assert.ok(Math.abs(left.distance - right.distance) < 0.001, `${p.id} feet jump at ${beat}`);
      }
    }
  }
});
test('the claps and stamps grow with the people who have actually joined', () => {
  for (let beat = 80; beat <= 124; beat += 2) {
    const joined = CROWD.reduce((sum, p) => sum + crowdState(p, beat).participation, 0) / CROWD.length;
    assert.ok(Math.abs(crowdEnergy(beat) - joined) < 0.15, `${beat}: energy ${crowdEnergy(beat)} vs ${joined}`);
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
