#!/usr/bin/env node
/**
 * THE GOOP, FACE ON — the check that has to have eyes, for the thing
 * that has eyes.
 *
 *   npm run dev
 *   node tools/goop-look.mjs
 *
 * Everything about the creature's face is motion: the gaze wanders, the
 * pupils dilate, it blinks twice sometimes. None of that can be asserted
 * and all of it can be seen, so this drives the finale, gets the camera
 * a metre from its head, and shoots a burst of frames from two angles —
 * head-on, and from the side where the eye PLACEMENT used to fall apart
 * (a fixed splay angle collapsed the two eyes together whenever the body
 * yawed away from the player).
 */

import { mkdirSync } from 'node:fs';
import { chromium } from 'playwright';

const base = process.env.PREVIEW_BASE ?? 'http://localhost:5173';
let browser;
try {
  browser = await chromium.launch();
} catch {
  browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
}
const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
page.on('pageerror', (e) => console.error('[pageerror]', e.message));
await page.goto(base, { waitUntil: 'networkidle', timeout: 30000 }).catch(() => page.goto(base));
await page.waitForTimeout(800);
await page.click('#enter-ar');
await page.waitForFunction(() => Boolean(window.__tubes?.site), { timeout: 15000 });
await page.evaluate(() => window.__tubes.wallsInfo.forceFallback());
await page.waitForFunction(() => window.__tubes.site.wallsReady, { timeout: 5000 });

console.log('BREWING');
await page.evaluate(() => {
  window.__tubes.menu.act('tab:factory');
  window.__tubes.menu.act('start-order');
});
await page.waitForFunction(() => window.__tubes.site.screen === 'factory', undefined, { timeout: 5000 });
await page.evaluate(() => window.__tubes.plant.postSheet(6));
await page.evaluate(() => window.__tubes.build.placeAt(0, -1, 'vat', 0));
await page.waitForTimeout(400);
const vat = (await page.evaluate(() => window.__tubes.plant.glands('near'))).find(
  (g) => g.type === 'vat',
);
if (!vat) {
  console.error('no vat gland — nothing to fill');
  await browser.close();
  process.exit(1);
}
await page.evaluate((s) => window.__tubes.plant.grab(s), 'near');
for (let k = 1; k <= 6; k++) {
  await page.evaluate((t) => window.__tubes.plant.dragTo(t.x + t.nx * 0.1, t.y, t.z + t.nz * 0.1), vat);
  await page.waitForTimeout(150);
}
await page.evaluate(() => window.__tubes.plant.release());
await page.evaluate(() => window.__tubes.plant.timeScale(8));
console.log('  music:', JSON.stringify(await page.evaluate(() => window.__tubes.music.state())));
await page.waitForFunction(() => window.__tubes.plant.state().goop === 'dancing', undefined, {
  timeout: 120000,
});
await page.evaluate(() => window.__tubes.menu.act('finale:close'));
console.log('DANCING');
console.log('  music:', JSON.stringify(await page.evaluate(() => window.__tubes.music.state())));

// Studio light for the shot only — passthrough supplies the real room.
await page.evaluate(() => {
  const s = window.__tubes.scene();
  for (const o of s.children) {
    if (o.isHemisphereLight) o.intensity = 2.4;
    if (o.isDirectionalLight) o.intensity = 2.2;
  }
});
const at = await page.evaluate(() => window.__tubes.goop.state());
console.log(`  it stands at ${at.x.toFixed(2)}, ${at.z.toFixed(2)}`);

mkdirSync('shots', { recursive: true });
const clip = { x: 420, y: 130, width: 620, height: 560 };
const shot = async (name, angle, dist) => {
  // Ring the creature at `angle`, level with its head.
  const x = at.x + Math.sin(angle) * dist;
  const z = at.z + Math.cos(angle) * dist;
  // three's camera looks down −Z at yaw 0, so standing at `angle` around
  // the ring and yawing BY that angle points it back at the middle.
  await page.evaluate((a) => window.__tubes.rig(a.x, a.z, a.yaw, -0.6, -0.02), {
    x,
    z,
    yaw: angle,
  });
  await page.waitForTimeout(700);
  await page.screenshot({ path: `shots/${name}.png`, clip });
  console.log('  ·', `shots/${name}.png`);
};
for (let n = 0; n < 3; n++) await shot(`goop-face-${n}`, 0, 1.15);
for (let n = 0; n < 2; n++) await shot(`goop-side-${n}`, Math.PI / 2, 1.15);
await shot('goop-quarter', Math.PI / 4, 1.3);

await browser.close();
console.log('\nLOOK AT IT.');
