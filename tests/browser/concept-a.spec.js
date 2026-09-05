import { test, expect } from '@playwright/test';

for (const [width, height] of [[720,450], [1440,900], [1366,768], [1194,834], [1024,768], [834,1194], [768,1024], [390,844], [360,780]]) {
  test(`Concept A keeps context, map and inspector separate at ${width}x${height}`, async ({ page }, testInfo) => {
    await page.setViewportSize({width,height});
    await page.goto('/?view=2&vessel=hms-protector&layers=fleet&lat=54.59&lon=-1.19&zoom=5');
    await expect(page.locator('#detailTitle')).toHaveText('HMS Protector');
    await expect(page.locator('#detailPhotoImage')).toHaveAttribute('src', /protector.jpg$/);
    await expect(page.locator('#snapshotSelect')).toBeVisible();
    await expect(page.locator('#surfaceBackdrop')).toBeHidden();
    const bounds = await page.evaluate(() => {
      const rect = s => {const r=document.querySelector(s).getBoundingClientRect();return {x:r.x,y:r.y,right:r.right,bottom:r.bottom,width:r.width,height:r.height};};
      return {map:rect('#fleetMap'),detail:rect('#detailDrawer'),toolbar:rect('.workspace-toolbar'),context:rect('.workspace-context'),scrollWidth:document.documentElement.scrollWidth,scrollHeight:document.documentElement.scrollHeight,qualifier:getComputedStyle(document.querySelector('.workspace-toolbar'),'::after').content};
    });
    expect(bounds.scrollWidth).toBeLessThanOrEqual(width);
    expect(bounds.scrollHeight).toBeLessThanOrEqual(height);
    expect(bounds.context.bottom).toBeLessThanOrEqual(bounds.map.y+1);
    expect(bounds.qualifier).toContain('Not live');
    if(width>700 && width>height) {
      expect(bounds.map.width).toBeGreaterThanOrEqual(width*.6);
      expect(bounds.map.right).toBeLessThanOrEqual(bounds.detail.x+1);
    } else {
      expect(bounds.map.bottom).toBeLessThanOrEqual(bounds.detail.y+1);
      expect(bounds.map.height).toBeGreaterThanOrEqual(width>700? height*.45:200);
      await page.locator('#detailExpand').click();
      await expect(page.locator('#detailExpand')).toHaveAttribute('aria-expanded','true');
      await page.locator('#detailExpand').click();
    }
    await expect.poll(async()=> {
      const map=await page.locator('#fleetMap').boundingBox();
      const marker=await page.locator('.fleet-marker.is-selected').first().boundingBox();
      return !!marker && marker.x>=map.x+16 && marker.y>=map.y+16 && marker.x+marker.width<=map.x+map.width-16 && marker.y+marker.height<=map.y+map.height-16;
    }).toBe(true);
    await page.screenshot({path:testInfo.outputPath(`selected-${width}x${height}.png`)});
    await page.locator('#snapshotSelect').selectOption('2026-08-23');
    await expect(page.locator('#snapshotSelect')).toHaveValue('2026-08-23');
    await expect(page.locator('#detailTitle')).toHaveText('HMS Protector');
    await expect(page.locator('.fleet-marker.is-selected')).toHaveCount(0);
  });
}

test('filtering preserves a chosen camera until Fit results is requested',async({page})=>{
  await page.goto('/?view=2&lat=10&lon=20&zoom=5');
  await expect(page.locator('#asOfDate')).not.toHaveText('Loading');
  await page.locator('#searchInput').fill('HMS Duncan');
  await expect(page.locator('#vesselList button[data-vessel-id]')).toHaveCount(1);
  await expect.poll(()=>new URL(page.url()).searchParams.get('lat')).toBe('10');
  expect(new URL(page.url()).searchParams.get('lon')).toBe('20');
  expect(new URL(page.url()).searchParams.get('zoom')).toBe('5');
  await page.locator('#resetMap').click();
  await expect.poll(()=>new URL(page.url()).searchParams.get('lat')).not.toBe('10');
});

test('class filters precede optional analytics and hidden panels are inert',async({page})=>{
  await page.goto('/');
  await page.locator('#filterToggle').click();
  await page.locator('#classRibbon button').nth(1).click();
  const panel=page.locator('#classAvailabilityPanel');
  await expect(panel).not.toHaveAttribute('open','');
  const position=await page.evaluate(()=>({filters:document.querySelector('.filter-grid').getBoundingClientRect().bottom,analytics:document.querySelector('#classAvailabilityPanel').getBoundingClientRect().top}));
  expect(position.filters).toBeLessThanOrEqual(position.analytics);
  await page.keyboard.press('Escape');
  await expect(page.locator('#filterPanel')).toHaveAttribute('inert','');
  await expect(page.locator('#filterToggle')).toBeFocused();
});

test('a delayed photograph cannot overwrite a newer selection or shift its slot', async ({page})=>{
  const delayed=[];
  await page.route('**/photos/duncan.jpg', route=>{ delayed.push(route); });
  await page.goto('/?view=2&vessel=hms-duncan', {waitUntil:'domcontentloaded'});
  await expect(page.locator('#detailTitle')).toHaveText('HMS Duncan');
  await expect.poll(()=>delayed.length).toBeGreaterThan(0);
  await page.locator('#searchInput').fill('HMS Dragon');
  await page.locator('#vesselList button[data-vessel-id="hms-dragon"]').click();
  await expect(page.locator('#detailTitle')).toHaveText('HMS Dragon');
  await page.locator('#searchInput').fill('HMS Protector');
  await page.locator('#vesselList button[data-vessel-id="hms-protector"]').click();
  await expect(page.locator('#detailPhotoImage')).toHaveAttribute('src',/protector.jpg$/);
  const photoHeight=(await page.locator('#detailPhoto').boundingBox()).height;
  await Promise.all(delayed.map(route=>route.continue()));
  await page.waitForLoadState('networkidle');
  await expect(page.locator('#detailTitle')).toHaveText('HMS Protector');
  await expect(page.locator('#detailPhotoImage')).toHaveAttribute('src',/protector.jpg$/);
  expect(Math.abs((await page.locator('#detailPhoto').boundingBox()).height-photoHeight)).toBeLessThan(1);
});

test('motion policy follows preference changes without reloading',async({page})=>{
  await page.emulateMedia({reducedMotion:'no-preference'});
  await page.goto('/');
  await page.evaluate(async()=>{
    const {FleetMap}=await import('/src/components/FleetMap.js');
    const container=document.createElement('div');
    container.style.cssText='position:fixed;width:300px;height:300px';
    document.body.append(container);
    window.motionTestMap=new FleetMap({container,notice:document.createElement('div')});
  });
  expect(await page.evaluate(()=>window.motionTestMap.interactionProfile.animationsEnabled)).toBe(true);
  await page.emulateMedia({reducedMotion:'reduce'});
  await expect.poll(()=>page.evaluate(()=>window.motionTestMap.interactionProfile.animationsEnabled)).toBe(false);
  expect(await page.evaluate(()=>[window.motionTestMap.map.options.zoomAnimation,window.motionTestMap.map.options.fadeAnimation,window.motionTestMap.clusterGroup.options.animate])).toEqual([false,false,false]);
  await page.emulateMedia({reducedMotion:'no-preference'});
  await expect.poll(()=>page.evaluate(()=>window.motionTestMap.interactionProfile.animationsEnabled)).toBe(true);
});

test('an edge selection stays clear through repeated rotation',async({page})=>{
  await page.emulateMedia({reducedMotion:'no-preference'});
  await page.setViewportSize({width:1194,height:834});
  await page.goto('/?view=2&vessel=hms-protector&lat=30&lon=49&zoom=4');
  await expect(page.locator('#detailTitle')).toHaveText('HMS Protector');
  for(const [width,height] of [[1194,834],[834,1194],[390,844],[844,390],[360,780]]){
    await page.setViewportSize({width,height});
    await expect.poll(async()=>{
      const map=await page.locator('#fleetMap').boundingBox();
      const marker=await page.locator('.fleet-marker.is-selected').first().boundingBox();
      return !!marker && marker.x>=map.x+16 && marker.y>=map.y+16 && marker.x+marker.width<=map.x+map.width-16 && marker.y+marker.height<=map.y+map.height-16;
    }).toBe(true);
  }
});

test('Fit results and zoom controls remain separate and outside open panels',async({page})=>{
  for(const [width,height] of [[1366,768],[390,844]]){
    await page.setViewportSize({width,height});
    await page.goto('/?view=2');
    await expect(page.locator('#loadingState')).toBeHidden();
    for(const openFilters of [false,true]){
      if(openFilters){await page.locator('#fleetToggle').click();await page.locator('#filterToggle').click();}
      const overlap=await page.evaluate(()=>{
        const rect=s=>document.querySelector(s).getBoundingClientRect();
        const intersects=(a,b)=>a.left<b.right&&a.right>b.left&&a.top<b.bottom&&a.bottom>b.top;
        const controls=[rect('#resetMap'),rect('.leaflet-control-zoom')];
        const panels=[...document.querySelectorAll('.surface:not([hidden])')].map(p=>p.getBoundingClientRect());
        return intersects(...controls)||controls.some(c=>panels.some(p=>intersects(c,p)));
      });
      expect(overlap).toBe(false);
    }
  }
});

test('opening a different map cluster does not return to the hidden selected record', async ({page}) => {
  await page.setViewportSize({width:1194,height:834});
  await page.emulateMedia({reducedMotion:'no-preference'});
  await page.goto('/?view=2&layers=fleet,clusters&vessel=hms-protector&lat=54&lon=-3&zoom=5');
  await expect(page.locator('#detailTitle')).toHaveText('HMS Protector');
  // The Clyde cluster is separate from Protector at Teesside.
  await page.locator('.fleet-cluster').filter({has:page.locator('.sr-only', {hasText:/^6 vessel locations$/})}).click();
  await expect(page.locator('#clusterResultList')).toContainText('HMS Bangor');
  await expect(page.locator('#detailDrawer')).toBeHidden();
  await expect.poll(()=>Number(new URL(page.url()).searchParams.get('lon'))).toBeLessThan(-4);
  await page.waitForTimeout(500);
  expect(Number(new URL(page.url()).searchParams.get('lon'))).toBeLessThan(-4);
});

test('selected photos display without waiting for detached image decoding', async ({page}) => {
  await page.addInitScript(() => {
    HTMLImageElement.prototype.decode = () => new Promise(() => {});
  });
  await page.goto('/?view=2&vessel=hms-protector');
  await expect(page.locator('#detailPhotoImage')).toHaveAttribute('src', /protector.jpg$/);
  await expect(page.locator('#detailPhoto')).not.toHaveClass(/is-loading/);
  expect(await page.locator('#detailPhotoImage').evaluate(image => image.complete && image.naturalWidth > 0)).toBe(true);
});

test('a photo without credit has no empty band beneath the image', async ({page}) => {
  await page.goto('/?view=2&vessel=hms-queen-elizabeth');
  await expect(page.locator('#detailPhoto')).not.toHaveClass(/is-loading/);
  await expect(page.locator('#detailPhotoImage')).toHaveAttribute('src', /queen_elizabeth.jpg$/);
  const sizes=await page.locator('#detailPhoto').evaluate(figure=>({
    figure:figure.getBoundingClientRect().height,
    image:figure.querySelector('img').getBoundingClientRect().height,
    credit:figure.querySelector('figcaption').getBoundingClientRect().height,
  }));
  expect(sizes.credit).toBe(0);
  expect(sizes.figure-sizes.image).toBeLessThanOrEqual(2);
});
