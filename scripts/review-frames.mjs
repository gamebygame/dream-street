// Captures the same close-up and full-scene frames for every review round, so body mechanics can be compared
// beat for beat between versions. Requires a running dev or preview server (default http://127.0.0.1:5173).
//   node scripts/review-frames.mjs --label before-arms
import { chromium } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import { parseArgs } from 'node:util';

const { values: args } = parseArgs({ options: { label: { type: 'string' }, url: { type: 'string' } } });
const baseURL = args.url || process.env.DREAM_STREET_URL || 'http://127.0.0.1:5173';
const label = args.label || execFileSync('git', ['rev-parse', '--short', 'HEAD']).toString().trim();
const destination = resolve('artifacts/review', label);

// Close-ups use the production viewing angle; only the orthographic height shrinks.
const SHOTS = [
  { kind: 'walker', beats: [10, 20.5, 33] },
  { kind: 'crowd', index: 0, beats: [100, 104.3, 112] },
  { kind: 'crowd', index: 13, beats: [104.3, 118] },
  { kind: 'dancer', beats: [49.5, 50, 52, 54, 56, 58] },
  { kind: 'dancer', beats: [150, 156, 166] },
  { kind: 'cyclist', index: 0, beats: [104] },
  { kind: 'cyclist', index: 1, beats: [220] },
  { kind: 'scene', beats: [10, 54, 104.3, 150] },
];

await mkdir(destination, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(`${baseURL}/?debug=1&music=silent`);
  await page.waitForFunction(() => window.__dreamStreet?.ready && window.__dreamStreet.music.mode === 'silent');
  await page.addStyleTag({ content: '#entrance,#debug,.masthead,.controls,#official-shell{display:none!important}' });
  for (const shot of SHOTS) {
    await page.evaluate(
      ({ kind, index }) =>
        window.__dreamStreet.renderer.setInspect(kind === 'scene' ? null : { kind, index: index ?? 0 }),
      shot,
    );
    for (const beat of shot.beats) {
      await page.evaluate(b => window.__dreamStreet.seek(b), beat);
      const name = `${shot.kind}${shot.index === undefined ? '' : '-' + shot.index}-${beat}.png`;
      await page.locator('#stage canvas').screenshot({ path: resolve(destination, name) });
    }
  }
  if (errors.length) throw new Error(errors.join('\n'));
  console.log(`Saved review frames to ${destination}`);
} finally {
  await browser.close();
}
