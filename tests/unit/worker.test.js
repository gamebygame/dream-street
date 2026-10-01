import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../../deploy/worker.js';

const SITE = 'https://dream-street.jovipro.com';
const PAGES = 'https://gamebygame.github.io/dream-street';

/** Runs the Worker against a stand-in for github.io and records what it asked for. */
async function serve(path, { method = 'GET', headers = {}, upstream = () => new Response('ok') } = {}) {
  const calls = [];
  const original = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    calls.push({ url, init });
    return upstream(url, init);
  };
  try {
    const response = await worker.fetch(new Request(path.startsWith('http') ? path : SITE + path, { method, headers }));
    return { response, calls };
  } finally {
    globalThis.fetch = original;
  }
}

test('the Worker serves the Pages build under the same path, and passes on only what a static site needs', async () => {
  const { response, calls } = await serve('/assets/index.js?v=2', {
    headers: {
      'if-none-match': '"abc"',
      'cf-connecting-ip': '203.0.113.7',
      'x-forwarded-for': '203.0.113.7',
      cookie: 'a=b',
    },
    upstream: () =>
      new Response('code', {
        headers: { 'cache-control': 'max-age=600', etag: '"abc"', 'content-type': 'text/javascript' },
      }),
  });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, `${PAGES}/assets/index.js?v=2`);
  assert.equal(calls[0].init.redirect, 'manual');
  assert.equal(calls[0].init.cache, 'no-store');
  assert.deepEqual([...calls[0].init.headers.keys()], ['if-none-match']);
  assert.equal(response.status, 200);
  assert.equal(await response.text(), 'code');
  assert.equal(response.headers.get('etag'), '"abc"');
  assert.equal(response.headers.get('cache-control'), 'max-age=600, no-transform');

  const root = await serve('/', { method: 'HEAD' });
  assert.equal(root.calls[0].url, `${PAGES}/`);
  assert.equal(root.calls[0].init.method, 'HEAD');
  assert.equal(root.response.headers.get('cache-control'), 'no-transform');
});

test('plain HTTP moves to HTTPS and only reads are served, without asking github.io', async () => {
  const insecure = await serve('http://dream-street.jovipro.com/assets/a.css?x=1');
  assert.equal(insecure.response.status, 301);
  assert.equal(insecure.response.headers.get('location'), `${SITE}/assets/a.css?x=1`);
  assert.equal(insecure.calls.length, 0);

  const write = await serve('/', { method: 'POST' });
  assert.equal(write.response.status, 405);
  assert.equal(write.response.headers.get('allow'), 'GET, HEAD');
  assert.equal(write.calls.length, 0);
});

test('redirects inside the project stay on this address; anything else is left alone', async () => {
  const redirect = location => () => new Response(null, { status: 301, headers: { location } });
  const cases = [
    [`${PAGES}/assets/`, `${SITE}/assets/`],
    [PAGES, `${SITE}/`],
    ['/dream-street/docs/?a=1', `${SITE}/docs/?a=1`],
    ['https://gamebygame.github.io/tetris/', 'https://gamebygame.github.io/tetris/'],
    ['https://gamebygame.github.io/dream-streetlight/', 'https://gamebygame.github.io/dream-streetlight/'],
  ];
  for (const [location, expected] of cases) {
    const { response } = await serve('/assets', { upstream: redirect(location) });
    assert.equal(response.status, 301, location);
    assert.equal(response.headers.get('location'), expected, location);
  }
});

test('while Pages still sends github.io to this address, the Worker answers 503 instead of looping', async () => {
  const { response } = await serve('/', {
    upstream: () => new Response(null, { status: 301, headers: { location: `${SITE}/` } }),
  });
  assert.equal(response.status, 503);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.equal(response.headers.get('retry-after'), '10');
});
