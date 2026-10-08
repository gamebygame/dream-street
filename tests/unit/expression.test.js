import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ExpressionInput,
  EXPRESSION_LIMIT,
  applyExpression,
  sampleExpression,
} from '../../src/character/expression.js';
import { sampleDance } from '../../src/character/pose.js';
import { FOUR_HITS, wardrobeAt, mannequinOpacity } from '../../src/content/plan.js';
import { secondsFromBeats } from '../../src/config.js';
import { AssetCache, createActor } from '../../src/character/rig.js';

test('watching without input is exactly the authored dance at every chapter and contact', () => {
  for (let beat = 0; beat < 520; beat += 0.25) {
    const wardrobe = wardrobeAt(beat),
      pose = sampleDance(beat, wardrobe);
    assert.equal(applyExpression(pose, beat, wardrobe, []), pose);
  }
});

test('input prepares immediately and only aligns to a future beat within 120 ms', () => {
  for (const beat of [20, 20.3, 20.76, 20.95, 255.82]) {
    const input = new ExpressionInput();
    assert.equal(input.add(beat), true);
    const event = input.events[0];
    assert.ok(event.accent > beat);
    assert.ok(secondsFromBeats(event.accent - beat) <= 0.12 + 1e-9);
    const response = sampleExpression(beat + 0.02, input.events);
    assert.ok(response.accent > 0 && response.preparation > 0);
    assert.deepEqual(sampleExpression(beat - 0.01, input.events), { accent: 0, preparation: 0 });
  }
  const input = new ExpressionInput();
  input.add(20.76);
  assert.equal(input.events[0].accent, 21);
  assert.equal(input.events[0].aligned, true);
});

test('spam coalesces, never amplifies beyond one gesture, and records stay bounded', () => {
  const input = new ExpressionInput();
  for (let i = 0; i < 20000; i++) {
    const beat = i / 100;
    input.add(beat);
    assert.ok(input.events.length <= EXPRESSION_LIMIT);
    const sample = sampleExpression(beat, input.events);
    assert.ok(sample.accent >= 0 && sample.accent <= 1);
  }
  const events = structuredClone(input.events);
  assert.equal(input.add(events.at(-1).beat + 0.01), false);
  assert.deepEqual(input.events, events);
  input.setEnabled(false);
  assert.equal(input.add(300), false);
  assert.deepEqual(input.events, []);
});

test('the same beat and input record replay identically in either seek direction without mutation', () => {
  const input = new ExpressionInput();
  [20.78, 21.45, 22.2].forEach(beat => input.add(beat));
  const events = structuredClone(input.events);
  const beats = [20, 20.8, 21, 21.5, 22.4, 24];
  const at = beat => applyExpression(sampleDance(beat), beat, wardrobeAt(beat), events);
  const first = beats.map(at);
  assert.deepEqual([...beats].reverse().map(at).reverse(), first);
  assert.deepEqual(input.events, events);
  assert.deepEqual(at(24), sampleDance(24));
});

test('expression preserves actual planted feet, hip/root and held prop targets', () => {
  const cache = new AssetCache(),
    actor = createActor(cache, { transitions: true });
  for (const beat of [20, 27, 36, 42, 67, 104, 150, 156, 166, 214, 233, 244]) {
    const input = new ExpressionInput();
    input.add(beat - 0.2);
    const wardrobe = wardrobeAt(beat),
      base = sampleDance(beat, wardrobe);
    const copy = structuredClone(base),
      expressive = applyExpression(base, beat, wardrobe, input.events);
    actor.applyPose(base);
    const feet = structuredClone(actor.footPositions);
    actor.applyPose(expressive);
    assert.deepEqual(actor.footPositions, feet);
    assert.deepEqual(expressive.hip, base.hip);
    assert.equal(expressive.yaw, base.yaw);
    assert.deepEqual(base, copy);
    if (Object.values(wardrobe.accessoryWeights).some(weight => weight > 0)) {
      for (const key of ['leftHand', 'rightHand', 'leftWrist', 'rightWrist', 'propTurn', 'propOpen'])
        assert.deepEqual(expressive[key], base[key], `${beat}: ${key}`);
    }
  }
  cache.dispose();
});

test('four-hit signatures and holds stay intact; the flower response is restrained and sustained', () => {
  for (const hit of FOUR_HITS) {
    const input = new ExpressionInput();
    input.add(hit - 0.22);
    for (const beat of [hit, hit + 0.3]) {
      const base = sampleDance(beat);
      assert.equal(applyExpression(base, beat, wardrobeAt(beat), input.events), base);
    }
  }
  const day = new ExpressionInput(),
    flower = new ExpressionInput();
  day.add(20.8);
  flower.add(148.8);
  assert.ok(sampleExpression(149, flower.events).accent < sampleExpression(21, day.events).accent * 0.4);
  assert.ok(sampleExpression(150, flower.events).accent > 0);
});

test('the four mannequins yield only after contact and regain contrast after the performer passes', () => {
  for (const age of [-256, -1, -0.01, 0, 4.2, 256]) assert.equal(mannequinOpacity(age), 1);
  assert.ok(mannequinOpacity(0.6) < 0.25);
  assert.ok(mannequinOpacity(0.01) > 0.99);
});
