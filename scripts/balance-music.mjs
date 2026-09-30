// Solos each stem over each chapter and reports its loudness and low-frequency share, for balancing the mix.
// Requires a running dev or preview server.
//   node scripts/balance-music.mjs
import { chromium } from '@playwright/test';
import { parseArgs } from 'node:util';

const { values: args } = parseArgs({ options: { url: { type: 'string' } } });
const baseURL = args.url || process.env.DREAM_STREET_URL || 'http://127.0.0.1:5173';
const browser = await chromium.launch({ channel: 'chrome', headless: true });
try {
  const page = await browser.newPage();
  await page.goto(`${baseURL}/?music=silent`);
  await page.waitForFunction(() => window.__dreamStreet?.ready);
  const { chapters, stems } = await page.evaluate(async () => ({
    chapters: window.__dreamStreet.chapters,
    stems: (await import('/src/audio/mixer.js')).STEMS,
  }));
  const rows = [];
  for (const { id, from, to } of chapters)
    for (const stem of stems) {
      const { metrics } = await page.evaluate(
        ({ from, to, stem }) => window.__dreamStreet.renderMusic(from, to, { stems: [stem] }),
        { from, to, stem },
      );
      if (metrics.rmsDb > -80)
        rows.push({
          chapter: id,
          stem,
          rmsDb: metrics.rmsDb,
          p95Db: metrics.shortRmsDb.p95,
          peakDb: metrics.peakDb,
          low: metrics.lowShare,
        });
    }
  console.table(rows);
} finally {
  await browser.close();
}
