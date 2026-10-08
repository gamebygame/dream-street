import { test, expect } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.goto('/?debug=1&music=silent');
  await page.waitForFunction(() => window.__dreamStreet?.ready && window.__dreamStreet.music.mode === 'silent');
});

test('resizing a paused street redraws visible pixels at the held beat, including its expression', async ({ page }) => {
  await page.evaluate(async () => {
    const app = window.__dreamStreet;
    await app.play();
    await app.pause();
    await app.seek(21);
    app.renderer.expression.add(20.8);
    app.renderer.render(21, false);
  });
  const before = await page.evaluate(() => window.__dreamStreet.snapshot());
  await page.setViewportSize({ width: 1600, height: 900 });
  await page.waitForFunction(() => window.__dreamStreet.renderer.viewport.width === 1600);
  // Inspect an actual screenshot, not a forced render that would conceal the original blank-canvas bug.
  const png = await page.locator('#stage canvas').screenshot();
  const colors = await page.evaluate(async base64 => {
    const image = new Image();
    image.src = `data:image/png;base64,${base64}`;
    await image.decode();
    const canvas = document.createElement('canvas');
    canvas.width = 160;
    canvas.height = 90;
    const context = canvas.getContext('2d');
    context.drawImage(image, 0, 0, 160, 90);
    const pixels = context.getImageData(0, 0, 160, 90).data,
      colors = new Set();
    for (let i = 0; i < pixels.length; i += 4)
      colors.add(`${pixels[i] >> 4},${pixels[i + 1] >> 4},${pixels[i + 2] >> 4}`);
    return colors.size;
  }, png.toString('base64'));
  expect(colors).toBeGreaterThan(30);
  const after = await page.evaluate(() => window.__dreamStreet.snapshot());
  expect(after.visual.beat).toBe(before.visual.beat);
  expect(after.visual.expression).toEqual(before.visual.expression);
  expect(after.audio.status).toBe('paused');
  expect(after.audio.activeVoices).toBe(0);
  expect(after.audio.schedulers).toBe(0);
});

test('Space and canvas taps express; repeat, controls, pause, hidden pages and opt-out do not', async ({ page }) => {
  const events = () => page.evaluate(() => window.__dreamStreet.renderer.expression.events.length);
  await page.getByRole('button', { name: '开始前行' }).click();
  await page.evaluate(() => window.__dreamStreet.seek(20));
  await page.locator('#stage canvas').click({ position: { x: 850, y: 500 } });
  expect(await events()).toBe(1);
  // A seek resumes with an audio pre-roll. Wait for musical time, not 250 ms of wall time.
  await page.waitForFunction(() => {
    const app = window.__dreamStreet;
    return app.transport.sample().beat - app.renderer.expression.events.at(-1).beat > 0.5;
  });
  await page.keyboard.down('Space');
  expect(await events()).toBe(2);
  await page.waitForFunction(() => {
    const app = window.__dreamStreet;
    return app.transport.sample().beat - app.renderer.expression.events.at(-1).beat > 0.5;
  });
  await page.keyboard.down('Space');
  expect(await events()).toBe(2);
  await page.keyboard.up('Space');
  await page.getByRole('slider', { name: '音量' }).focus();
  await page.keyboard.press('Space');
  expect(await events()).toBe(2);
  await page.evaluate(() => window.__dreamStreet.pause());
  const held = await page.evaluate(() => window.__dreamStreet.snapshot().visual.expression);
  await page.locator('#stage canvas').click({ position: { x: 850, y: 500 } });
  await page.keyboard.press('Space');
  expect(await events()).toBe(2);
  expect(await page.evaluate(() => window.__dreamStreet.snapshot().visual.expression)).toEqual(held);
  await page.evaluate(() => window.__dreamStreet.play());
  await page.evaluate(() => {
    Object.defineProperty(document, 'hidden', { configurable: true, value: true });
    document.dispatchEvent(new KeyboardEvent('keydown', { code: 'Space' }));
    document.dispatchEvent(new Event('visibilitychange'));
  });
  expect(await events()).toBe(2);
  await page.evaluate(() => {
    delete document.hidden;
    document.dispatchEvent(new Event('visibilitychange'));
  });
  expect(await page.evaluate(() => window.__dreamStreet.transport.status)).toBe('paused');
  await page.getByRole('button', { name: '身体表达', exact: true }).click();
  await expect(page.locator('#participate')).toHaveAttribute('aria-pressed', 'false');
  await page.evaluate(() => window.__dreamStreet.play());
  await page.locator('#stage canvas').click({ position: { x: 850, y: 500 } });
  await page.keyboard.press('Space');
  expect(await events()).toBe(0);
});

test('a delayed reference selection cannot hide and play the old source after switching back', async ({ page }) => {
  const state = await page.evaluate(async () => {
    const app = window.__dreamStreet,
      calls = [];
    await app.chooseMusic('score');
    await app.play();
    const load = Promise.withResolvers();
    app.music.ensurePlayer = () => load.promise;
    app.music.player = Object.fromEntries(
      ['pauseVideo', 'playVideo', 'seekTo', 'setVolume'].map(key => [key, () => calls.push(key)]),
    );
    const pending = app.chooseMusic('reference');
    const during = { mode: app.music.mode, audible: app.transport.scoreAudible };
    await app.chooseMusic('score');
    load.resolve();
    await pending;
    return {
      during,
      calls,
      mode: app.music.mode,
      audible: app.transport.scoreAudible,
      hidden: document.querySelector('#official-shell').hidden,
      selected: document.querySelector('[data-music="score"]').getAttribute('aria-pressed'),
    };
  });
  expect(state.during).toEqual({ mode: 'score', audible: true });
  expect(state.mode).toBe('score');
  expect(state.audible).toBe(true);
  expect(state.hidden).toBe(true);
  expect(state.selected).toBe('true');
  expect(state.calls).not.toContain('playVideo');
});

test('the real loader recovers from an API failure; retry and a later player failure keep UI and audio consistent', async ({
  page,
}) => {
  await page.route('https://www.youtube.com/iframe_api', route => route.abort());
  await page.evaluate(() => window.__dreamStreet.chooseMusic('score'));
  await page.getByRole('button', { name: '开始前行' }).click();
  await page.evaluate(() => window.__dreamStreet.chooseMusic('reference'));
  await expect(page.locator('#official-shell')).toBeHidden();
  expect(await page.evaluate(() => window.__dreamStreet.transport.scoreAudible)).toBe(true);
  const result = await page.evaluate(async () => {
    const app = window.__dreamStreet;
    window.YT = {
      Player: class {
        constructor(mount, options) {
          this.events = options.events;
          mount.textContent = 'Test official player';
        }
        pauseVideo() {}
        playVideo() {}
        seekTo() {}
        setVolume() {}
        destroy() {}
      },
    };
    const pending = app.chooseMusic('reference');
    const player = app.music.player;
    player.events.onReady({ target: player });
    await pending;
    const playing = {
      mode: app.music.mode,
      audible: app.transport.scoreAudible,
      hidden: document.querySelector('#official-shell').hidden,
    };
    player.events.onError({ data: 100, target: player });
    return {
      playing,
      mode: app.music.mode,
      audible: app.transport.scoreAudible,
      hidden: document.querySelector('#official-shell').hidden,
      selected: document.querySelector('[data-music="score"]').getAttribute('aria-pressed'),
    };
  });
  expect(result.playing).toEqual({ mode: 'reference', audible: false, hidden: false });
  expect(result.mode).toBe('score');
  expect(result.audible).toBe(true);
  expect(result.hidden).toBe(true);
  expect(result.selected).toBe('true');
});

test('normal entry offers quiet watching and expression; the unsynchronized comparison is debug-only', async ({
  page,
}) => {
  await page.goto('/');
  await page.waitForFunction(() => window.__dreamStreet?.ready);
  await expect(page.locator('#music-toggle')).toBeHidden();
  await expect(page.locator('#official-shell')).toBeHidden();
  await expect(page.locator('#participate')).toBeVisible();
  expect(await page.evaluate(() => window.__dreamStreet.music.mode)).toBe('score');
  await page.goto('/?debug=1');
  await page.waitForFunction(() => window.__dreamStreet?.ready);
  await page.getByRole('button', { name: '开始前行' }).click();
  await page.getByRole('button', { name: '音乐', exact: true }).click();
  await expect(page.getByRole('button', { name: '对照原曲', exact: true })).toBeVisible();
});
