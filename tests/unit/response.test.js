import test from 'node:test';
import assert from 'node:assert/strict';
import { CONFIG } from '../../src/config.js';
import { FOUR_HIT_WINDOW, wardrobeAt } from '../../src/content/plan.js';
import {
  CLAP_LIMIT,
  CLAP_MEMORY,
  ClapLog,
  RESPONSE_WINDOW,
  clapNote,
  crowdClapBeats,
  groove,
  pulse,
  responseAt,
  responseBetween,
} from '../../src/content/response.js';
import { CROWD, crowdPose, crowdState } from '../../src/content/crowd.js';
import { notesBetween } from '../../src/audio/score.js';

const everyBeat = (from, to, step = 1) =>
  Array.from({ length: Math.ceil((to - from) / step) }, (_, i) => from + i * step);

test('the clap log merges double hits, keeps time order, stays bounded and forgets after a backward seek', () => {
  const log = new ClapLog();
  assert.equal(log.add(NaN, 0), false);
  assert.equal(log.add(-1, 0), false);
  assert.equal(log.add(10, 1), true);
  assert.equal(log.add(10.02, 1.05), false, 'two hits 50 ms apart are one clap');
  assert.equal(log.add(10.05, 1.2), true, 'merging is by the clock on the wall, not by how far the beat moved');
  assert.equal(log.add(9, 2), false, 'a clap cannot be stamped before the last one');
  for (let i = 0; i < 400; i++) log.add(11 + i * 0.3);
  assert.ok(log.size <= CLAP_LIMIT);
  assert.ok(log.beats.every(b => b >= log.beats.at(-1) - CLAP_MEMORY));
  const frozen = log.snapshot();
  assert.ok(Object.isFrozen(frozen));
  log.dropAfter(100);
  assert.ok(log.beats.every(b => b <= 100));
  log.dropAfter(0);
  assert.equal(log.size, 0);
  log.add(5);
  log.clear();
  assert.equal(log.size, 0);
});

test('groove is a density that fills with a few steady claps, caps under mashing and fades when clapping stops', () => {
  assert.equal(groove(100, []), 0);
  assert.ok(groove(100, [100]) < 0.1, 'one clap barely registers');
  assert.ok(groove(102, [100, 101, 102]) > 0.9, 'three claps on consecutive beats fill it');
  assert.ok(groove(106, [100, 102, 104, 106]) > 0.85, 'clapping every other beat nearly fills it');
  const mashing = everyBeat(92, 100.001, 1 / 8);
  assert.ok(groove(100, mashing) <= 1);
  assert.equal(groove(100, mashing), groove(100, everyBeat(92, 100.001, 1)), 'mashing cannot exceed steady clapping');
  const steady = everyBeat(90, 100.001, 1);
  assert.ok(groove(100, steady) > 0.99);
  assert.ok(groove(104, steady) < groove(100, steady));
  assert.equal(groove(108, steady), 0, 'eight beats after the last clap nothing remains');
  // Pure: same inputs, same answer; inputs untouched.
  const claps = Object.freeze([100, 101]);
  assert.equal(groove(101.5, claps), groove(101.5, [...claps]));
  assert.ok(pulse(100.1, [100]) > 0.5 && pulse(100.4, [100]) === 0 && pulse(99.9, [100]) === 0);
});

test("the crowd clap beats are the score's own, bar for bar", () => {
  const score = new Set(
    notesBetween(80, 144)
      .filter(n => n.inst === 'groupClap')
      .map(n => n.beat),
  );
  const expected = new Set();
  for (let bar = 80; bar < 144; bar += 4) for (const beat of crowdClapBeats(bar + 1.5)) expected.add(beat);
  assert.deepEqual(
    [...expected].sort((a, b) => a - b),
    [...score].sort((a, b) => a - b),
  );
  assert.deepEqual(crowdClapBeats(70), []);
  assert.deepEqual(crowdClapBeats(150), []);
});

test('nothing answers without clapping, outside the response window or during the four-hit', () => {
  const steady = everyBeat(0, 600, 1);
  const silent = responseAt(70, []);
  assert.deepEqual(silent, { groove: 0, pulse: 0, meet: 0 });
  assert.equal(responseAt(100, []), silent, 'the silent answer is one shared object');
  for (const beat of [10, 23.9, 48, 50, 56, 59.9, 144, 150, 200, 240, 256 + 50])
    assert.equal(responseAt(beat, steady), silent);
  for (const beat of [24, 47.9, 60, 66, 72, 80, 100, 143.9, 256 + 100])
    assert.ok(responseAt(beat, steady).groove > 0.99);
  const notes = responseBetween(0, 2 * CONFIG.cycleBeats, steady);
  assert.ok(notes.length > 0);
  for (const note of notes) {
    const local = note.beat % CONFIG.cycleBeats;
    assert.ok(['stomp', 'groupClap'].includes(note.inst), note.inst);
    assert.ok(local >= 72 && local < RESPONSE_WINDOW.end, `response note at ${note.beat}`);
    assert.ok(local < FOUR_HIT_WINDOW.start || local >= FOUR_HIT_WINDOW.end);
    assert.ok(note.vel <= 0.6 && note.params.count <= 4);
  }
  assert.deepEqual(responseBetween(0, 512, []), []);
  const scoreIds = new Set(notesBetween(0, 512).map(n => n.id));
  assert.ok(notes.every(n => !scoreIds.has(n.id)));
  assert.equal(new Set(notes.map(n => n.id)).size, notes.length);
  // Half-open: however the span is split, the same notes come out once each.
  const pieces = [];
  for (let from = 0; from < 512; from += 0.7) pieces.push(...responseBetween(from, Math.min(512, from + 0.7), steady));
  assert.deepEqual(pieces, notes);
});

test("kept up through the gateway, the clapping starts the corner's stamp-stamp-clap before the kit does", () => {
  const early = responseBetween(72, 80, everyBeat(66, 80, 1));
  assert.deepEqual(
    early.map(n => [n.beat, n.inst]),
    [
      [72, 'stomp'],
      [73, 'stomp'],
      [74, 'groupClap'],
      [76, 'stomp'],
      [77, 'stomp'],
      [78, 'groupClap'],
    ],
  );
  assert.deepEqual(responseBetween(72, 80, [60]), [], 'one clap long ago starts nothing');
  const later = responseBetween(112, 116, everyBeat(100, 116, 1));
  assert.deepEqual(
    later.map(n => [n.beat, n.inst, n.params.count]),
    [
      [113, 'groupClap', 4],
      [115, 'groupClap', 4],
    ],
  );
});

test('the pose of a passer-by is exactly the authored one unless the answer is present', () => {
  for (const person of [CROWD[2], CROWD[14], CROWD[19], CROWD[30]])
    for (const beat of [68, 76, 90, 104.3, 113, 120, 126, 134]) {
      const state = crowdState(person, beat),
        wardrobe = wardrobeAt(beat),
        authored = crowdPose(person, beat, state, wardrobe);
      assert.deepEqual(crowdPose(person, beat, state, wardrobe, null), authored);
      assert.deepEqual(crowdPose(person, beat, state, wardrobe, { groove: 0, pulse: 0, meet: 0 }), authored);
      assert.deepEqual(crowdPose(person, beat, state, wardrobe, responseAt(beat, [])), authored);
    }
});

test('with the answer present, standers dip on a clap and the people beside him bring their hands together', () => {
  const stander = CROWD[14],
    standing = crowdState(stander, 68);
  assert.ok(standing.stand > 0.99 && standing.participation > 0, 'the corner waiter has noticed him by 68');
  const still = crowdPose(stander, 68, standing, wardrobeAt(68)),
    dipped = crowdPose(stander, 68, standing, wardrobeAt(68), { groove: 0, pulse: 1, meet: 0 });
  assert.ok(dipped.hip[1] < still.hip[1] - 0.02);
  assert.ok(dipped.rightFoot[1] > still.rightFoot[1]);
  let meeting = 0;
  for (const person of CROWD) {
    const state = crowdState(person, 113);
    if (state.participation < 0.99) continue;
    const apart = crowdPose(person, 113, state, wardrobeAt(113)),
      together = crowdPose(person, 113, state, wardrobeAt(113), { groove: 1, pulse: 0, meet: 1 });
    assert.ok(Math.abs(together.leftHand[0] - together.rightHand[0]) < 0.2, person.id);
    assert.ok(together.leftHand[1] > 1 && together.rightHand[1] > 1, person.id);
    if (Math.hypot(...apart.leftHand.map((v, i) => v - together.leftHand[i])) > 0.05) meeting++;
  }
  assert.ok(meeting > 30, `${meeting} people changed their hands`);
});

test("the visitor's clap is soft through the four-hit and the flowers, and never silenced", () => {
  for (const [beat, soft] of [
    [10, false],
    [47, false],
    [50, true],
    [59.9, true],
    [60, false],
    [100, false],
    [150, true],
    [207, true],
    [220, false],
    [256 + 52, true],
  ]) {
    const note = clapNote(beat);
    assert.equal(note.inst, 'clap');
    assert.equal(note.params.soft, soft, `beat ${beat}`);
    assert.ok(note.vel > 0);
  }
});

test('through the gateway the answer is seen as well as heard: stamps on one and two, hands together on three', () => {
  const kept = everyBeat(60, 72, 1);
  assert.equal(responseAt(72, kept).pulse, 1, "the pattern's stamp, with no clap of the visitor's on that beat");
  assert.ok(responseAt(74, kept).meet > 0.99, 'hands meet on the third beat');
  assert.equal(responseAt(75, kept).meet, 0);
  assert.equal(responseAt(68, kept).meet, 0, 'before the gateway nobody claps along');
  const stander = CROWD[32],
    standing = crowdState(stander, 74);
  assert.ok(standing.stand > 0.99 && standing.participation > 0.1, 'the near corner waiter has noticed him by 74');
  const together = crowdPose(stander, 74, standing, wardrobeAt(74), { groove: 1, pulse: 0, meet: 1 });
  assert.ok(Math.abs(together.leftHand[0] - together.rightHand[0]) < 0.2, 'a stander who noticed claps fully');
});
