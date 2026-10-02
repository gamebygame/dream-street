import { test, expect } from '@playwright/test';

const snapshot = page => page.evaluate(() => window.__dreamStreet.snapshot());
/** A weighted sum over every passer-by's instance matrix: the picture of the crowd in one number. */
const crowdChecksum = page =>
  page.evaluate(() => {
    const r = window.__dreamStreet.renderer;
    let sum = 0,
      n = 0;
    for (const batch of r.crowd.batches.values()) {
      const a = batch.mesh.instanceMatrix.array;
      for (let i = 0; i < batch.mesh.count * 16; i++) {
        sum += a[i] * ((i % 7) + 1);
        n++;
      }
    }
    return { sum, n };
  });

test.beforeEach(async ({ page }) => {
  await page.goto('/?music=silent');
  await page.waitForFunction(() => window.__dreamStreet?.ready && window.__dreamStreet.music.mode === 'silent');
});

test('a clap counts only while the street moves, once per hit, from the key or the stage, never from a control', async ({
  page,
}) => {
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  expect(await page.evaluate(() => window.__dreamStreet.clap())).toBe(false);
  await page.getByRole('button', { name: '开始前行' }).click();
  await expect.poll(() => page.evaluate(() => window.__dreamStreet.snapshot().audio.status)).toBe('running');
  expect(await page.evaluate(() => window.__dreamStreet.clap())).toBe(true);
  expect((await snapshot(page)).audio.claps).toBe(1);
  expect((await snapshot(page)).audio.activeVoices).toBeGreaterThan(0);
  await page.waitForTimeout(200);
  await page.keyboard.press('Space');
  await expect.poll(() => page.evaluate(() => window.__dreamStreet.snapshot().audio.claps)).toBe(2);
  // A held key repeats keydown with `repeat` set; that is still one clap.
  await page.waitForTimeout(200);
  await page.keyboard.down('Space');
  await page.waitForTimeout(200);
  await page.keyboard.down('Space');
  await page.keyboard.up('Space');
  await page.waitForTimeout(100);
  expect((await snapshot(page)).audio.claps).toBe(3);
  await page.waitForTimeout(200);
  await page.locator('#stage canvas').click({ position: { x: 700, y: 300 } });
  await expect.poll(() => page.evaluate(() => window.__dreamStreet.snapshot().audio.claps)).toBe(4);
  // Space on a focused control keeps the control's own meaning.
  await page.locator('#volume').focus();
  await page.waitForTimeout(200);
  await page.keyboard.press('Space');
  await page.waitForTimeout(100);
  expect((await snapshot(page)).audio.claps).toBe(4);
  await page.getByRole('button', { name: '暂停', exact: true }).click();
  await page.waitForTimeout(200);
  expect(await page.evaluate(() => window.__dreamStreet.clap())).toBe(false);
  expect((await snapshot(page)).audio.claps).toBe(4);
  expect(errors).toEqual([]);
});

test('without clapping the passers-by are exactly the authored ones; clapping changes them, forgetting restores them', async ({
  page,
}) => {
  await page.evaluate(() => window.__dreamStreet.seek(113));
  const authored = await crowdChecksum(page);
  expect((await snapshot(page)).visual.response).toEqual({ groove: 0, pulse: 0, meet: 0 });
  await page.evaluate(() => {
    const t = window.__dreamStreet.transport;
    for (let b = 104; b <= 113; b++) t.claps.add(b);
    return window.__dreamStreet.seek(113);
  });
  const answering = await crowdChecksum(page);
  expect((await snapshot(page)).visual.response.groove).toBeGreaterThan(0.99);
  expect((await snapshot(page)).visual.response.meet).toBeGreaterThan(0.99);
  expect(answering.n).toBe(authored.n);
  expect(answering.sum).not.toBe(authored.sum);
  await page.evaluate(() => {
    window.__dreamStreet.transport.claps.clear();
    return window.__dreamStreet.seek(113);
  });
  expect(await crowdChecksum(page)).toEqual(authored);
  // A seek backward forgets claps that have not happened yet; nothing answers in the flowers however much is clapped.
  await page.evaluate(() => {
    const t = window.__dreamStreet.transport;
    for (let b = 104; b <= 113; b++) t.claps.add(b);
    return window.__dreamStreet.seek(100);
  });
  expect((await snapshot(page)).audio.claps).toBe(0);
  await page.evaluate(() => {
    const t = window.__dreamStreet.transport;
    for (let b = 140; b <= 150; b++) t.claps.add(b);
    return window.__dreamStreet.seek(150);
  });
  expect((await snapshot(page)).visual.response).toEqual({ groove: 0, pulse: 0, meet: 0 });
  expect((await snapshot(page)).visual.walkerAnchorS).toBe((await snapshot(page)).visual.reflectionAnchorS);
});
