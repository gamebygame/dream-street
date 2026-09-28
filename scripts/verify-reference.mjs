import { chromium } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';

const destination = 'artifacts/g2-2';
await mkdir(destination, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const errors = [],
  results = { date: new Date().toISOString() };
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(process.env.DREAM_STREET_URL || 'http://127.0.0.1:5173');
  await page.waitForFunction(() => window.__dreamStreet?.ready);
  assert.equal(await page.evaluate(() => window.__dreamStreet.music.mode), 'youtube');
  await page.evaluate(() => window.__dreamStreet.seek(138));
  await page.getByRole('button', { name: '开始前行' }).click();
  await page.waitForFunction(() => window.__dreamStreet.transport.status === 'running', null, { timeout: 30000 });
  results.start = await page.evaluate(() => window.__dreamStreet.snapshot().audio);
  results.build = await page.evaluate(() => [...document.scripts].filter(s => s.type === 'module').map(s => s.src));
  results.source = await page.evaluate(() => {
    const player = window.__dreamStreet.music.player;
    const data = player.getVideoData();
    return {
      url: player.getVideoUrl(),
      duration: player.getDuration(),
      data: { video_id: data.video_id, title: data.title, author: data.author },
    };
  });
  assert.equal(results.source.data.video_id, 'knOXppaqBYY');
  assert.ok(results.source.duration > 128);
  await page.waitForTimeout(1000);
  await page.evaluate(() => window.__dreamStreet.pause());
  results.paused = await page.evaluate(() => window.__dreamStreet.snapshot().audio);
  await page.waitForTimeout(500);
  results.held = await page.evaluate(() => window.__dreamStreet.snapshot().audio);
  assert.equal(results.held.beat, results.paused.beat);
  await page.evaluate(() => window.__dreamStreet.play());
  await page.waitForFunction(() => window.__dreamStreet.transport.sample().beat > 150, null, { timeout: 15000 });
  results.flowerChapter = await page.evaluate(() => window.__dreamStreet.snapshot().audio);
  assert.equal(results.flowerChapter.music.status, 'playing');
  assert.equal(results.flowerChapter.activeVoices, 0);
  assert.equal(results.flowerChapter.music.window.start, 0);
  assert.equal(results.flowerChapter.syncMode, 'youtube-player-estimate');
  await page.screenshot({ path: destination + '/official-source.png' });
  await page.evaluate(() => window.__dreamStreet.seek(256));
  await page.waitForTimeout(1200);
  results.streetSeam = await page.evaluate(() => ({
    audio: window.__dreamStreet.snapshot().audio,
    seconds: window.__dreamStreet.music.player.getCurrentTime(),
  }));
  assert.ok(results.streetSeam.seconds > 128);
  assert.equal(results.streetSeam.audio.music.window.start, 0);
  assert.equal(results.streetSeam.audio.activeVoices, 0);
  await page.evaluate(() => window.__dreamStreet.transport.setMuted(true));
  await page.waitForTimeout(100);
  assert.equal(await page.evaluate(() => window.__dreamStreet.music.player.getVolume()), 0);
  await page.evaluate(() => window.__dreamStreet.transport.setMuted(false));
  await page.waitForTimeout(100);
  assert.equal(await page.evaluate(() => window.__dreamStreet.music.player.getVolume()), 45);
  await page.evaluate(() => window.__dreamStreet.music.player.seekTo(5, true));
  await page.waitForTimeout(1200);
  results.playerSeek = await page.evaluate(() => window.__dreamStreet.snapshot().audio);
  assert.ok(results.playerSeek.beat < 15);
  const end = results.source.duration * 2;
  await page.evaluate(b => window.__dreamStreet.seek(b), end - 4);
  await page.waitForFunction(b => window.__dreamStreet.transport.sample().beat > b + 1, end, { timeout: 18000 });
  results.fullSongLoop = await page.evaluate(() => window.__dreamStreet.snapshot().audio);
  assert.equal(results.fullSongLoop.music.window.start, results.fullSongLoop.music.duration * 2);
  assert.equal(results.fullSongLoop.activeVoices, 0);
  await page.evaluate(() => window.__dreamStreet.pause());
  assert.equal(errors.length, 0);
  results.passed = true;
} finally {
  results.errors = errors;
  await writeFile(destination + '/official-source-report.json', JSON.stringify(results, null, 2) + '\n');
  await browser.close();
  console.log(JSON.stringify(results));
}
