import test from 'node:test';
import assert from 'node:assert/strict';
import { ReferenceMusic } from '../../src/audio/reference.js';

function fixture() {
  const operations = [],
    changes = [],
    errors = [];
  const reference = new ReferenceMusic({
    onChange: data => changes.push(data),
    onError: error => errors.push(error.message),
  });
  reference.player = Object.fromEntries(
    ['pauseVideo', 'playVideo', 'seekTo', 'setVolume', 'destroy'].map(name => [
      name,
      (...args) => operations.push([name, ...args]),
    ]),
  );
  const load = Promise.withResolvers();
  reference.ensurePlayer = () => load.promise;
  return { reference, operations, changes, errors, load };
}

test('a stale reference load cannot restart audio or change the newly selected source', async () => {
  for (const mode of ['score', 'silent']) {
    const { reference, load, operations } = fixture();
    reference.resume();
    const first = reference.select('reference');
    assert.equal(reference.mode, 'score');
    await reference.select(mode);
    load.resolve();
    assert.equal(await first, false);
    assert.equal(reference.mode, mode);
    assert.equal(reference.status, 'idle');
    assert.deepEqual(
      operations.map(([name]) => name),
      ['pauseVideo'],
    );
  }
});

test('only the latest of overlapping reference selections commits; pause during loading stays paused', async () => {
  const { reference, load, operations } = fixture();
  reference.resume();
  const first = reference.select('reference');
  const second = reference.select('reference');
  reference.pause();
  load.resolve();
  assert.deepEqual(await Promise.all([first, second]), [false, true]);
  assert.equal(reference.mode, 'reference');
  assert.equal(reference.status, 'ready');
  assert.equal(operations.filter(([name]) => name === 'playVideo').length, 0);
  assert.equal(operations.filter(([name]) => name === 'seekTo').length, 1);
  reference.resume();
  assert.equal(operations.filter(([name]) => name === 'playVideo').length, 1);
});

test('current failures preserve the audible source and allow retry; stale errors remain silent', async () => {
  const { reference, load, errors } = fixture();
  const first = reference.select('reference');
  load.reject(new Error('network failure'));
  assert.equal(await first, false);
  assert.equal(reference.mode, 'score');
  assert.equal(reference.requestedMode, 'score');
  assert.equal(reference.status, 'error');
  assert.deepEqual(errors, ['network failure']);
  const retry = Promise.withResolvers();
  reference.ensurePlayer = () => retry.promise;
  const second = reference.select('reference');
  await reference.select('silent');
  retry.reject(new Error('stale failure'));
  assert.equal(await second, false);
  assert.equal(reference.status, 'idle');
  assert.deepEqual(errors, ['network failure']);
  reference.ensurePlayer = () => Promise.resolve();
  assert.equal(await reference.select('reference'), true);
});

test('disposing during loading prevents a late completion from playing or notifying', async () => {
  const { reference, load, changes, operations } = fixture();
  reference.resume();
  const pending = reference.select('reference');
  reference.dispose();
  const count = changes.length;
  load.resolve();
  assert.equal(await pending, false);
  assert.equal(changes.length, count);
  assert.equal(operations.filter(([name]) => name === 'playVideo').length, 0);
});

test('a ready player that throws during activation restores the previous source', async () => {
  const { reference, load, errors } = fixture();
  await reference.select('silent');
  reference.player.seekTo = () => {
    throw new Error('player unavailable');
  };
  const pending = reference.select('reference');
  load.resolve();
  assert.equal(await pending, false);
  assert.equal(reference.mode, 'silent');
  assert.equal(reference.requestedMode, 'silent');
  assert.equal(reference.status, 'error');
  assert.deepEqual(errors, ['player unavailable']);
});
