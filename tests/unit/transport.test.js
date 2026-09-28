import test from 'node:test';
import assert from 'node:assert/strict';
import { Transport, outputTime } from '../../src/audio/transport.js';

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
  const voices = {
    active: new Set(),
    cache: new Map(),
    played: [],
    prewarm() {},
    setVolume(v) {
      this.volume = v;
    },
    setMuted(v) {
      this.muted = v;
    },
    setPaused(v) {
      this.paused = v;
    },
    play(note, when, offset) {
      this.played.push({ note, when, offset });
      this.active.add(note.id);
    },
    stopAll() {
      this.active.clear();
    },
    dispose() {},
  };
  const transport = new Transport({
    contextFactory: () => context,
    now: () => now * 1000,
    voicesFactory: () => voices,
    wait: () => Promise.resolve(),
    setTimer: fn => {
      timers.set(++id, fn);
      return id;
    },
    clearTimer: id => timers.delete(id),
  });
  return {
    context,
    voices,
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
  assert.equal(f.voices.active.size, 0);
  const count = f.voices.played.length;
  await f.transport.resume();
  assert.equal(f.transport.sample().beat, beat);
  f.advance(0.3);
  assert.ok(f.transport.sample().beat > beat);
  assert.ok(f.voices.played.length - count < 12);
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
  assert.equal(f.voices.muted, true);
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
  assert.equal(f.voices.paused, false);
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
