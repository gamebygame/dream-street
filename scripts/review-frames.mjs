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
  // Street life before the crowd forms: someone at a window, at a corner, chatting, walking the other way and
  // crossing from the side street, each until they have joined; `zoom` widens the close-up to show their company.
  { kind: 'crowd', index: 16, zoom: 7, beats: [70, 88, 92, 96, 100, 104] },
  { kind: 'crowd', index: 14, zoom: 7, beats: [60, 66, 70, 74, 78] },
  { kind: 'crowd', index: 19, zoom: 7, beats: [84, 90, 94, 98, 104] },
  { kind: 'crowd', index: 1, zoom: 7, beats: [74, 80, 84, 88, 92] },
  { kind: 'crowd', index: 2, zoom: 7, beats: [62, 68, 72, 76, 80] },
  { kind: 'cyclist', index: 0, zoom: 7, beats: [66, 72, 75, 78, 84] },
  { kind: 'cyclist', index: 1, zoom: 7, beats: [184, 190, 193, 197, 204] },
  { kind: 'scene', beats: [60, 66, 72, 78, 84, 90, 96, 102, 108] },
  // The crowd's answer to clapping, against the same beats without it: a corner stander as the clapping starts,
  // and the people beside him on the crowd's own clap beats. `claps` fills the log for the eight beats before.
  { kind: 'crowd', index: 14, zoom: 7, beats: [68, 68.1] },
  { kind: 'crowd', index: 14, zoom: 7, beats: [68, 68.1], claps: true },
  { kind: 'crowd', index: 32, zoom: 7, beats: [72, 74] },
  { kind: 'crowd', index: 32, zoom: 7, beats: [72, 74], claps: true },
  { kind: 'crowd', index: 0, beats: [113, 114, 115] },
  { kind: 'crowd', index: 0, beats: [113, 114, 115], claps: true },
  { kind: 'scene', beats: [76, 113, 115] },
  { kind: 'scene', beats: [76, 113, 115], claps: true },
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
      ({ kind, index, zoom }) =>
        window.__dreamStreet.renderer.setInspect(
          kind === 'scene' ? null : { kind, index: index ?? 0, ...(zoom ? { viewHeight: zoom } : {}) },
        ),
      shot,
    );
    for (const beat of shot.beats) {
      await page.evaluate(
        ({ b, claps }) => {
          const log = window.__dreamStreet.transport.claps;
          log.clear();
          if (claps) for (let c = b - 8; c <= b; c += 1) log.add(c);
          return window.__dreamStreet.seek(b);
        },
        { b: beat, claps: Boolean(shot.claps) },
      );
      const name = `${shot.kind}${shot.index === undefined ? '' : '-' + shot.index}${shot.zoom ? '-wide' : ''}-${beat}${shot.claps ? '-clapping' : ''}.png`;
      await page.locator('#stage canvas').screenshot({ path: resolve(destination, name) });
    }
  }
  if (errors.length) throw new Error(errors.join('\n'));
  console.log(`Saved review frames to ${destination}`);
} finally {
  await browser.close();
}
