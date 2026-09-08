import {test,expect} from '@playwright/test';

test.beforeEach(async({page})=>{
  await page.goto('/');await page.waitForFunction(()=>window.__dreamStreet?.ready);
});
test('starts with a gesture, mutes without stopping, and resumes in place',async({page})=>{
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.getByRole('button',{name:'开始前行'}).click();
  await expect.poll(()=>page.evaluate(()=>window.__dreamStreet.snapshot().audio.status)).toBe('running');
  await expect.poll(()=>page.evaluate(()=>window.__dreamStreet.snapshot().visual.beat)).toBeGreaterThan(1);
  await page.getByRole('button',{name:'静音',exact:true}).click();
  const before=await page.evaluate(()=>window.__dreamStreet.snapshot().visual.beat);
  await expect.poll(()=>page.evaluate(()=>window.__dreamStreet.snapshot().visual.beat)).toBeGreaterThan(before+.5);
  await page.getByRole('button',{name:'暂停',exact:true}).click();
  const held=await page.evaluate(()=>window.__dreamStreet.snapshot().visual.beat);await page.waitForTimeout(250);
  expect(await page.evaluate(()=>window.__dreamStreet.snapshot().visual.beat)).toBe(held);
  await page.getByRole('button',{name:'继续',exact:true}).click();
  await expect.poll(()=>page.evaluate(()=>window.__dreamStreet.snapshot().visual.beat)).toBeGreaterThan(held+.2);
  expect((await page.evaluate(()=>window.__dreamStreet.snapshot())).audio.schedulers).toBe(1);expect(errors).toEqual([]);
});
test('the visibility handler suspends audio and keeps a return to the page paused',async({page})=>{
  await page.getByRole('button',{name:'开始前行'}).click();
  await expect.poll(()=>page.evaluate(()=>window.__dreamStreet.snapshot().visual.beat)).toBeGreaterThan(.3);
  // Exercise the application's handler; native tab visibility is a separate manual check.
  await page.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,value:true});document.dispatchEvent(new Event('visibilitychange'));});
  await expect.poll(()=>page.evaluate(()=>window.__dreamStreet.snapshot().audio.contextState)).toBe('suspended');
  const held=await page.evaluate(()=>window.__dreamStreet.snapshot().visual.beat);
  await page.evaluate(()=>{delete document.hidden;document.dispatchEvent(new Event('visibilitychange'));});
  await page.waitForTimeout(200);
  const snapshot=await page.evaluate(()=>window.__dreamStreet.snapshot());
  expect(snapshot.visual.beat).toBe(held);expect(snapshot.audio.schedulers).toBe(0);expect(snapshot.audio.activeVoices).toBe(0);
  expect(snapshot.audio.status).toBe('paused');
});
test('costumes follow contacts, old clothes return inside the office, and seeks preserve anchors',async({page})=>{
  for(const [beat,outfit] of [[49.64,'coat'],[49.65,'jacket'],[51.65,'sport'],[53.65,'coat'],[55.65,'open'],[60,'open'],[63.99,'open'],[64,'old'],[144,'old']]){
    await page.evaluate(b=>window.__dreamStreet.seek(b),beat);
    const snapshot=await page.evaluate(()=>window.__dreamStreet.snapshot());
    expect(snapshot.visual.wardrobe.outfit).toBe(outfit);expect(snapshot.visual.walkerAnchorS).toBe(snapshot.visual.reflectionAnchorS);
  }
});
test('displayed products really overlap the reflection at the authored contacts',async({page})=>{
  for(const beat of [18.2,25.1,32.4,39.7,45.6,49.65,51.65,53.65,55.65,135.65]){
    await page.evaluate(b=>window.__dreamStreet.seek(b),beat);
    const distance=await page.evaluate(beat=>{
      const app=window.__dreamStreet,product=app.snapshot().visual.products.find(p=>Math.abs(p.beat-beat)<.001);
      const a=app.project(product.model),b=app.project([8,.52,0]);return Math.hypot(a.x-b.x,a.y-b.y);
    },beat);
    expect(distance).toBeLessThan(.01);
  }
});
test('the actual glass shader clips a single performer behind frames, walls and gaps',async({page})=>{
  await page.evaluate(()=>window.__dreamStreet.seek(56));
  const counts={};
  for(const kind of ['wide','split','wall','gap']){
    counts[kind]=await page.evaluate(kind=>{const r=window.__dreamStreet.renderer;r.setFixture(kind);return r.reflectionPixelCount();},kind);
    await page.screenshot({path:`artifacts/g1/g0-${kind}.png`});
  }
  expect(counts.wide).toBeGreaterThan(500);expect(counts.split).toBeGreaterThan(0);expect(counts.split).toBeLessThan(counts.wide);
  expect(counts.wall).toBe(0);expect(counts.gap).toBe(0);
  const hiddenPose=await page.evaluate(()=>window.__dreamStreet.renderer.dancer.footPositions);
  await page.evaluate(()=>window.__dreamStreet.seek(58));
  const advancedPose=await page.evaluate(()=>window.__dreamStreet.renderer.dancer.footPositions);
  expect(advancedPose).not.toEqual(hiddenPose);
  await page.evaluate(()=>window.__dreamStreet.renderer.setFixture(null));
  expect(await page.evaluate(()=>window.__dreamStreet.renderer.dancer.footPositions)).toEqual(advancedPose);
});
test('both desktop compositions keep the two performers in the viewport',async({page})=>{
  for(const width of [1440,1600]){
    await page.setViewportSize({width,height:900});await page.waitForTimeout(100);await page.evaluate(()=>window.__dreamStreet.seek(54));
    const positions=await page.evaluate(()=>[[0,1,0],[8,1.52,0]].map(p=>window.__dreamStreet.project(p)));
    for(const p of positions){expect(p.x).toBeGreaterThan(100);expect(p.x).toBeLessThan(width-100);expect(p.y).toBeGreaterThan(100);expect(p.y).toBeLessThan(800);}
  }
});
test('scene pools and GPU resources remain bounded across repeated authored cycles',async({page})=>{
  const rounds=[];
  for(let cycle=0;cycle<4;cycle++){
    for(let local=0;local<80;local+=4)await page.evaluate(b=>window.__dreamStreet.seek(b),cycle*80+local);
    rounds.push(await page.evaluate(()=>window.__dreamStreet.snapshot().visual));
  }
  for(const key of ['geometries','textures','streetPool','reflectionTargets'])expect(rounds[3][key]).toBe(rounds[1][key]);
  expect(rounds[3].contactCache).toBeLessThanOrEqual(18);
});
