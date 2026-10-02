import test from 'node:test';
import assert from 'node:assert/strict';
import { Transport, outputTime } from '../../src/audio/transport.js';
import { CONFIG } from '../../src/config.js';

function fixture() {
  let now = 0;
  const timers = new Map();
  let id = 0;
  const context = {
    state: 'suspended',
    currentTime: 0,
    async resume() {
      this.state = 'running';
    },
    async suspend() {
      this.state = 'suspended';
    },
    async close() {
      this.state = 'closed';
    },
    getOutputTimestamp() {
      return { contextTime: Math.max(0, this.currentTime - 0.03), performanceTime: now * 1000 };
    },
  };
  const mixer = {
    active: new Set(),
    played: [],
    setVolume(v) {
      this.volume = v;
    },
    setMuted(v) {
      this.muted = v;
    },
    setPaused(v) {
      this.paused = v;
    },
    setAudible(v) {
      this.audible = v;
    },
    stopAll() {
      this.active.clear();
    },
    dispose() {},
  };
  const transport = new Transport({
    contextFactory: () => context,
    now: () => now * 1000,
    mixerFactory: () => mixer,
    play: (target, note, when, offset) => {
      target.played.push({ note, when, offset });
      target.active.add(note.id);
    },
    wait: () => Promise.resolve(),
    prepare: () => Promise.resolve(),
    setTimer: fn => {
      timers.set(++id, fn);
      return id;
    },
    clearTimer: id => timers.delete(id),
  });
  return {
    context,
    mixer,
    transport,
    timers,
    advance(seconds) {
      now += seconds;
      if (context.state === 'running') context.currentTime += seconds;
      for (const fn of timers.values()) fn();
    },
  };
}

test('output timestamp mapping falls back for missing, invalid or stale stamps', () => {
  assert.equal(outputTime({ state: 'running', currentTime: 2 }, 2000).mode, 'currentTime-fallback');
  assert.deepEqual(
    outputTime(
      { state: 'running', currentTime: 2, getOutputTimestamp: () => ({ contextTime: 1.9, performanceTime: 1990 }) },
      2000,
    ),
    { time: 1.91, mode: 'output-timestamp' },
  );
  assert.equal(
    outputTime(
      { state: 'running', currentTime: 2, getOutputTimestamp: () => ({ contextTime: 1, performanceTime: 100 }) },
      2000,
    ).mode,
    'currentTime-fallback',
  );
});
test('starting and repeated resume create one scheduler', async () => {
  const f = fixture();
  await Promise.all([f.transport.resume(), f.transport.resume()]);
  assert.equal(f.timers.size, 1);
  f.advance(1);
  assert.ok(f.transport.sample().beat > 1.5);
  await f.transport.resume();
  assert.equal(f.timers.size, 1);
  await f.transport.dispose();
  assert.equal(f.timers.size, 0);
});
test('pause freezes the unified beat and resume cannot replay a missed backlog', async () => {
  const f = fixture();
  await f.transport.resume();
  f.advance(1.5);
  const beat = f.transport.sample().beat;
  await f.transport.pause();
  f.advance(30);
  assert.equal(f.transport.sample().beat, beat);
  assert.equal(f.mixer.active.size, 0);
  const count = f.mixer.played.length;
  await f.transport.resume();
  assert.equal(f.transport.sample().beat, beat);
  f.advance(0.3);
  assert.ok(f.transport.sample().beat > beat);
  assert.ok(f.mixer.played.length - count < 12);
  assert.equal(f.timers.size, 1);
  await f.transport.dispose();
});
test('mute keeps travel alive and seek reanchors without another scheduler', async () => {
  const f = fixture();
  await f.transport.resume();
  f.advance(0.8);
  const before = f.transport.sample().beat;
  f.transport.setMuted(true);
  f.advance(0.8);
  assert.ok(f.transport.sample().beat > before);
  assert.equal(f.mixer.muted, true);
  await f.transport.seek(63.5);
  assert.equal(f.transport.sample().beat, 63.5);
  assert.equal(f.timers.size, 1);
  await f.transport.dispose();
});
test('two resume requests during the pause release still produce one clock', async () => {
  const f = fixture();
  await f.transport.resume();
  f.advance(1);
  let release;
  f.transport.wait = () =>
    new Promise(resolve => {
      release = resolve;
    });
  const pausing = f.transport.pause();
  const held = f.transport.sample().beat;
  const first = f.transport.resume(),
    second = f.transport.resume();
  assert.equal(f.transport.sample().beat, held);
  assert.equal(f.timers.size, 0);
  release();
  await Promise.all([pausing, first, second]);
  assert.equal(f.timers.size, 1);
  assert.equal(f.mixer.paused, false);
  f.transport.wait = () => Promise.resolve();
  await f.transport.dispose();
});
test('a hidden-page pause cancels a resume queued during the output release', async () => {
  const f = fixture();
  await f.transport.resume();
  let release;
  f.transport.wait = () =>
    new Promise(resolve => {
      release = resolve;
    });
  const pausing = f.transport.pause(),
    resuming = f.transport.resume(),
    hidden = f.transport.pause();
  release();
  await Promise.all([pausing, resuming, hidden]);
  assert.equal(f.transport.status, 'paused');
  assert.equal(f.context.state, 'suspended');
  assert.equal(f.timers.size, 0);
});
test('the street advances at the score tempo and sampling never commits state', async () => {
  const f = fixture();
  await f.transport.resume();
  f.advance(3);
  const beat = f.transport.sample().beat;
  // 0.1 s of scheduling lead and a 0.03 s output delay precede the audible start.
  assert.ok(Math.abs(beat - ((3 - 0.13) * CONFIG.bpm) / 60) < 1e-9, String(beat));
  const before = { ...f.transport };
  for (let i = 0; i < 1000; i++) {
    f.transport.sample();
    f.transport.diagnostics();
  }
  assert.deepEqual({ ...f.transport }, before);
  assert.equal(f.transport.tick().beat, beat);
  await f.transport.dispose();
});
test('a silenced score keeps scheduling so a comparison returns on the same beat', async () => {
  const f = fixture();
  f.transport.setScoreAudible(false);
  await f.transport.resume();
  assert.equal(f.mixer.audible, false);
  const count = f.mixer.played.length;
  f.advance(1);
  assert.ok(f.mixer.played.length > count);
  f.transport.setScoreAudible(true);
  assert.equal(f.mixer.audible, true);
  await f.transport.dispose();
});
test('a clap is heard at once while running, a held key is one clap, and the crowd answers from the claps so far', async () => {
  const f = fixture();
  assert.equal(f.transport.clap(0), false, 'nothing before the street moves');
  await f.transport.seek(70);
  await f.transport.resume();
  f.advance(0.5);
  const count = f.mixer.played.length,
    beat = f.transport.sample().beat;
  assert.equal(f.transport.clap(beat), true);
  assert.equal(f.transport.clap(beat + 0.01), false, 'a second hit within 120 ms is the same clap');
  const live = f.mixer.played.slice(count);
  assert.equal(live.length, 1);
  assert.equal(live[0].note.inst, 'clap');
  assert.ok(Math.abs(live[0].when - (f.context.currentTime + 0.005)) < 1e-9, 'heard now, outside the look-ahead');
  // Clapping on every beat through the gateway: the corner's stomps are scheduled like the score, ahead of time.
  // Time advances in scheduler-sized steps, as it does live; one big step would make every note late.
  for (let b = beat + 0.5; b < 80; b += 1) f.transport.claps.add(b);
  for (let i = 0; i < 60; i++) f.advance(0.1);
  const answered = f.mixer.played.filter(p => p.note.id.startsWith('response:'));
  assert.ok(
    answered.some(p => p.note.inst === 'stomp' && p.note.beat === 76),
    'the stamp before the kit',
  );
  assert.ok(answered.every(p => p.note.beat >= 72 && p.note.beat < 144));
  assert.ok(f.mixer.played.filter(p => p.note.beat === 76).some(p => !p.note.id.startsWith('response:')));
  assert.equal(f.transport.diagnostics().claps, f.transport.claps.size);
  assert.ok(f.transport.diagnostics().groove >= 0);
  await f.transport.pause();
  assert.equal(f.transport.clap(f.transport.sample().beat), false, 'nothing while paused');
  await f.transport.seek(10);
  assert.equal(f.transport.claps.size, 0, 'a backward seek forgets claps that have not happened yet');
  await f.transport.dispose();
});
