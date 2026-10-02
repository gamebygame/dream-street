// Renders each chapter of the score offline, through the same mixer and instruments as live playback, into
// artifacts/music/<label>/ as WAV files plus objective metrics. Requires a running dev or preview server.
//   node scripts/render-music.mjs --label v1
import { chromium } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import { parseArgs } from 'node:util';

const { values: args } = parseArgs({ options: { label: { type: 'string' }, url: { type: 'string' } } });
const baseURL = args.url || process.env.DREAM_STREET_URL || 'http://127.0.0.1:5173';
const label = args.label || execFileSync('git', ['rev-parse', '--short', 'HEAD']).toString().trim();
const destination = resolve('artifacts/music', label);

await mkdir(destination, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', headless: true });
try {
  const page = await browser.newPage();
  await page.goto(`${baseURL}/?music=silent`);
  await page.waitForFunction(() => window.__dreamStreet?.ready);
  // The visitor clapping on every beat, for comparison with the plain chapters: the four-hit must stay the loudest
  // moment of its chapter with the corner's early stamp-stamp-clap present, and the crowd chapter gains hands.
  const clapping = (from, to) => Array.from({ length: to - from }, (_, i) => from + i);
  const spans = [
    ...(await page.evaluate(() => window.__dreamStreet.chapters)),
    { id: 'four-hit', from: 40, to: 64 },
    { id: 'seam', from: 248, to: 264 },
    { id: 'daylight-clapping', from: 0, to: 80, claps: clapping(60, 80) },
    { id: 'pocket-clapping', from: 80, to: 144, claps: clapping(80, 142) },
  ];
  const report = [];
  for (const span of spans) {
    const { metrics, wav } = await page.evaluate(
      ({ from, to, claps }) => window.__dreamStreet.renderMusic(from, to, claps ? { claps } : {}),
      span,
    );
    const name = `${String(report.length + 1).padStart(2, '0')}-${span.id}.wav`;
    await writeFile(resolve(destination, name), Buffer.from(wav, 'base64'));
    report.push({ id: span.id, file: name, ...metrics });
    console.log(JSON.stringify({ id: span.id, peakDb: metrics.peakDb, rmsDb: metrics.rmsDb, hits: metrics.hits }));
  }
  await writeFile(resolve(destination, 'metrics.json'), JSON.stringify(report, null, 2) + '\n');
  console.log(`Saved renders to ${destination}`);
} finally {
  await browser.close();
}
