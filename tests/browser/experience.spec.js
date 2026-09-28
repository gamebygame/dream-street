import { test, expect } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.goto('/?music=silent');
  await page.waitForFunction(() => window.__dreamStreet?.ready && window.__dreamStreet.music.mode === 'silent');
});
test('starts with a gesture, mutes without stopping, and resumes in place', async ({ page }) => {
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.getByRole('button', { name: '开始前行' }).click();
  await expect.poll(() => page.evaluate(() => window.__dreamStreet.snapshot().audio.status)).toBe('running');
  await expect.poll(() => page.evaluate(() => window.__dreamStreet.snapshot().visual.beat)).toBeGreaterThan(1);
  await page.getByRole('button', { name: '静音', exact: true }).click();
  const before = await page.evaluate(() => window.__dreamStreet.snapshot().visual.beat);
  await expect
    .poll(() => page.evaluate(() => window.__dreamStreet.snapshot().visual.beat))
    .toBeGreaterThan(before + 0.5);
  await page.getByRole('button', { name: '暂停', exact: true }).click();
  const held = await page.evaluate(() => window.__dreamStreet.snapshot().visual.beat);
  await page.waitForTimeout(250);
  expect(await page.evaluate(() => window.__dreamStreet.snapshot().visual.beat)).toBe(held);
  await page.getByRole('button', { name: '继续', exact: true }).click();
  await expect.poll(() => page.evaluate(() => window.__dreamStreet.snapshot().visual.beat)).toBeGreaterThan(held + 0.2);
  expect((await page.evaluate(() => window.__dreamStreet.snapshot())).audio.schedulers).toBe(1);
  expect(errors).toEqual([]);
});
test('the visibility handler suspends audio and keeps a return to the page paused', async ({ page }) => {
  await page.getByRole('button', { name: '开始前行' }).click();
  await expect.poll(() => page.evaluate(() => window.__dreamStreet.snapshot().visual.beat)).toBeGreaterThan(0.3);
  // Exercise the application's handler; native tab visibility is a separate manual check.
  await page.evaluate(() => {
    Object.defineProperty(document, 'hidden', { configurable: true, value: true });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await expect.poll(() => page.evaluate(() => window.__dreamStreet.snapshot().audio.contextState)).toBe('suspended');
  const held = await page.evaluate(() => window.__dreamStreet.snapshot().visual.beat);
  await page.evaluate(() => {
    delete document.hidden;
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await page.waitForTimeout(200);
  const snapshot = await page.evaluate(() => window.__dreamStreet.snapshot());
  expect(snapshot.visual.beat).toBe(held);
  expect(snapshot.audio.schedulers).toBe(0);
  expect(snapshot.audio.activeVoices).toBe(0);
  expect(snapshot.audio.status).toBe('paused');
});
test('costumes follow contacts, old clothes return inside the office, and seeks preserve anchors', async ({ page }) => {
  for (const [beat, outfit] of [
    [49.39, 'coat'],
    [49.4, 'jacket'],
    [51.4, 'sport'],
    [53.4, 'coat'],
    [55.4, 'open'],
    [60, 'open'],
    [63.99, 'open'],
    [64, 'old'],
    [144, 'old'],
  ]) {
    await page.evaluate(b => window.__dreamStreet.seek(b), beat);
    const snapshot = await page.evaluate(() => window.__dreamStreet.snapshot());
    expect(snapshot.visual.wardrobe.outfit).toBe(outfit);
    expect(snapshot.visual.walkerAnchorS).toBe(snapshot.visual.reflectionAnchorS);
  }
});
test('displayed products really overlap the reflection at the authored contacts', async ({ page }) => {
  for (const beat of [
    18.2, 25.1, 32.4, 39.7, 45.6, 49.4, 51.4, 53.4, 55.4, 91.1, 118.7, 146.4, 154.3, 165.1, 211.4, 242.1, 311.4,
  ]) {
    await page.evaluate(b => window.__dreamStreet.seek(b), beat);
    const distance = await page.evaluate(beat => {
      const app = window.__dreamStreet,
        product = app.snapshot().visual.products.find(p => Math.abs(p.beat - beat) < 0.001);
      const a = app.project(product.model),
        b = app.project([9.8, 0.52, 0]);
      return Math.hypot(a.x - b.x, a.y - b.y);
    }, beat);
    expect(distance).toBeLessThan(0.01);
  }
});
test('the actual glass shader clips a single performer behind frames, walls and gaps', async ({ page }) => {
  await page.evaluate(() => window.__dreamStreet.seek(56));
  const counts = {};
  for (const kind of ['wide', 'split', 'wall', 'gap']) {
    counts[kind] = await page.evaluate(kind => {
      const r = window.__dreamStreet.renderer;
      r.setFixture(kind);
      return r.reflectionPixelCount();
    }, kind);
    await page.screenshot({ path: `artifacts/browser/g0-${kind}.png` });
  }
  expect(counts.wide).toBeGreaterThan(500);
  expect(counts.split).toBeGreaterThan(0);
  expect(counts.split).toBeLessThan(counts.wide);
  expect(counts.wall).toBe(0);
  expect(counts.gap).toBe(0);
  const hiddenPose = await page.evaluate(() => window.__dreamStreet.renderer.dancer.footPositions);
  await page.evaluate(() => window.__dreamStreet.seek(58));
  const advancedPose = await page.evaluate(() => window.__dreamStreet.renderer.dancer.footPositions);
  expect(advancedPose).not.toEqual(hiddenPose);
  await page.evaluate(() => window.__dreamStreet.renderer.setFixture(null));
  expect(await page.evaluate(() => window.__dreamStreet.renderer.dancer.footPositions)).toEqual(advancedPose);
});
test('both desktop compositions keep the two performers in the viewport', async ({ page }) => {
  for (const width of [1440, 1600]) {
    await page.setViewportSize({ width, height: 900 });
    await page.waitForTimeout(100);
    await page.evaluate(() => window.__dreamStreet.seek(54));
    const positions = await page.evaluate(() =>
      [
        [0, 1, 0],
        [9.8, 1.52, 0],
      ].map(p => window.__dreamStreet.project(p)),
    );
    for (const p of positions) {
      expect(p.x).toBeGreaterThan(100);
      expect(p.x).toBeLessThan(width - 100);
      expect(p.y).toBeGreaterThan(100);
      expect(p.y).toBeLessThan(800);
    }
  }
});
test('scene pools and GPU resources remain bounded across repeated authored cycles', async ({ page }) => {
  const rounds = [];
  for (let cycle = 0; cycle < 4; cycle++) {
    for (let local = 0; local < 256; local += 4)
      await page.evaluate(b => window.__dreamStreet.seek(b), cycle * 256 + local);
    rounds.push(
      await page.evaluate(() => {
        const app = window.__dreamStreet,
          r = app.renderer;
        let objects = 0;
        r.scene.traverse(() => objects++);
        r.reflectionScene.traverse(() => objects++);
        for (const person of r.crowd.people) person.actor.root.traverse(() => objects++);
        return { ...app.snapshot().visual, objects };
      }),
    );
  }
  for (const key of ['geometries', 'textures', 'streetPool', 'reflectionTargets', 'objects'])
    expect(rounds[3][key]).toBe(rounds[1][key]);
  expect(rounds[3].contactCache).toBeLessThanOrEqual(32);
  expect(rounds[3].crowdResources.pool).toBe(36);
});
test('crowd joins, remains varied, and leaves through actual gaps while the solo performer continues', async ({
  page,
}) => {
  for (const [beat, count] of [
    [30, 0],
    [100, 36],
    [120, 36],
    [164, 0],
  ]) {
    await page.evaluate(b => window.__dreamStreet.seek(b), beat);
    const state = await page.evaluate(() => window.__dreamStreet.snapshot().visual);
    expect(state.crowd).toBe(count);
    expect(state.crowdResources.pool).toBe(36);
    expect(state.walkerAnchorS).toBe(state.reflectionAnchorS);
  }
  await page.evaluate(() => window.__dreamStreet.seek(60));
  const arriving = await page.evaluate(() => window.__dreamStreet.snapshot().visual.crowd);
  expect(arriving).toBeGreaterThan(0);
  expect(arriving).toBeLessThan(36);
  for (const beat of [82, 136]) {
    await page.evaluate(b => window.__dreamStreet.seek(b), beat);
    expect(await page.evaluate(() => window.__dreamStreet.renderer.reflectionPixelCount())).toBe(0);
  }
  await page.evaluate(() => window.__dreamStreet.seek(100));
  const parts = await page.evaluate(() => {
    const r = window.__dreamStreet.renderer;
    return {
      heights: r.crowd.people.map(p => p.person.height),
      poses: r.crowd.people.slice(0, 2).map(p => p.actor.leftArm.end.matrixWorld.elements),
      visible: r.crowd.group.visible,
    };
  });
  expect(new Set(parts.heights).size).toBeGreaterThan(5);
  expect(parts.poses[0]).not.toEqual(parts.poses[1]);
  expect(parts.visible).toBe(true);
});

test('the original score is audible, mutes and pauses with the street, and keeps sounding across chapters', async ({
  page,
}) => {
  await page.evaluate(() => window.__dreamStreet.chooseMusic('score'));
  await page.evaluate(() => window.__dreamStreet.seek(100));
  await page.getByRole('button', { name: '开始前行' }).click();
  await page.evaluate(() => {
    const t = window.__dreamStreet.transport;
    window.__level = t.context.createAnalyser();
    t.mixer.output.connect(window.__level);
  });
  const level = () =>
    page.evaluate(() => {
      const data = new Float32Array(window.__level.fftSize);
      window.__level.getFloatTimeDomainData(data);
      return Math.sqrt(data.reduce((sum, v) => sum + v * v, 0) / data.length);
    });
  await expect.poll(level).toBeGreaterThan(0.01);
  expect(await page.evaluate(() => window.__dreamStreet.snapshot().audio.activeVoices)).toBeGreaterThan(0);
  expect(await page.evaluate(() => window.__dreamStreet.snapshot().audio.music.capturable)).toBe(true);
  await page.getByRole('button', { name: '静音', exact: true }).click();
  await expect.poll(level).toBeLessThan(0.001);
  await page.evaluate(() => window.__dreamStreet.pause());
  const held = await page.evaluate(() => window.__dreamStreet.snapshot().audio.beat);
  await page.waitForTimeout(150);
  expect(await page.evaluate(() => window.__dreamStreet.snapshot().audio.beat)).toBe(held);
  expect(await page.evaluate(() => window.__dreamStreet.snapshot().audio.activeVoices)).toBe(0);
  await page.evaluate(() => {
    window.__dreamStreet.transport.setMuted(false);
    return window.__dreamStreet.play();
  });
  await expect.poll(level).toBeGreaterThan(0.01);
  for (const beat of [150, 210, 254, 258, 512]) {
    await page.evaluate(b => window.__dreamStreet.seek(b), beat);
    await expect.poll(level).toBeGreaterThan(0.005);
    expect(await page.evaluate(() => window.__dreamStreet.snapshot().audio.schedulers)).toBe(1);
  }
});

test('cyclists retain a finite pool and accompany with one steering hand', async ({ page }) => {
  for (const beat of [96, 104, 214, 220]) {
    await page.evaluate(b => window.__dreamStreet.seek(b), beat);
    const state = await page.evaluate(() => {
      const r = window.__dreamStreet.renderer,
        b = r.cyclists.people.find(p => p.state.visible);
      return {
        pool: r.cyclists.people.length,
        visible: r.cyclists.visibleCount,
        hand: b.actor.rightArm.end.matrixWorld.elements,
        feet: b.actor.footPositions,
      };
    });
    expect(state.pool).toBe(2);
    expect(state.visible).toBe(1);
    expect(state.hand.every(Number.isFinite)).toBe(true);
    expect(state.feet[0][1]).toBeGreaterThan(0.2);
  }
});
test('garments retain visible geometry through interrupted transitions and mannequins retain vertex colors', async ({
  page,
}) => {
  await page.evaluate(() => window.__dreamStreet.seek(18.7));
  const wardrobe = await page.evaluate(() => window.__dreamStreet.snapshot().visual.wardrobe);
  expect(wardrobe.layers.length).toBe(2);
  expect(wardrobe.progress).toBeGreaterThan(0);
  expect(wardrobe.progress).toBeLessThan(1);
  const displays = await page.evaluate(() =>
    window.__dreamStreet.renderer.street.products
      .filter(p => p.product.outfit)
      .map(p => ({
        color: !!p.model.children[0].geometry.attributes.color,
        vertices: p.model.children[0].geometry.attributes.position.count,
      })),
  );
  expect(displays.every(p => p.color && p.vertices > 0)).toBe(true);
  for (const beat of [100.19, 100.2, 100.3, 118.7]) {
    await page.evaluate(b => window.__dreamStreet.seek(b), beat);
    expect(await page.evaluate(() => window.__dreamStreet.renderer.reflectionPixelCount())).toBeGreaterThan(300);
  }
});

test('the normal entry uses the original score; the reference recording is only an optional comparison', async ({
  page,
}) => {
  await page.goto('/');
  await page.waitForFunction(() => window.__dreamStreet?.ready);
  expect(await page.evaluate(() => window.__dreamStreet.music.mode)).toBe('score');
  await expect(page.locator('#official-shell')).toBeHidden();
  await expect(page.locator('[data-music="score"]')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('[data-music="reference"]')).toHaveAttribute('aria-pressed', 'false');
  await expect(page.locator('#music-file')).toHaveCount(0);
});
