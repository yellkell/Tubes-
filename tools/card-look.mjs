#!/usr/bin/env node
/**
 * EVERY MENU, PAGE BY PAGE — the check that has to have eyes.
 *
 *   npm run dev
 *   node tools/card-look.mjs
 *
 * Playtest reported "a lot of the text was obscured by stuff", and not
 * one state assertion could have caught it: the buttons were all present
 * and correct, the ids were right, the game was running. The layout was
 * simply printing over itself, because every y on the GOALS page was a
 * fixed offset that had outgrown its card.
 *
 * order-walk asserts the geometry it CAN (no control over another, none
 * off the edge — see NOTHING SITS ON ANYTHING). Painted text has no
 * rects to compare, so this dumps every surface in the game as a PNG and
 * a human looks. Cheap, and the only honest way to see a menu.
 *
 * It shoots: the board's three tabs, the shift card's three pages, an
 * opened sheet at both ends of the book, the BOX PANEL on one of each
 * kind of plant, and THANKS FOR PLAYING.
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { chromium } from 'playwright';

const base = process.env.PREVIEW_BASE ?? 'http://localhost:5173';
const CELL = 0.35;
let browser;
try {
  browser = await chromium.launch();
} catch {
  browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
}
const page = await browser.newPage({ viewport: { width: 1280, height: 820 } });
page.on('pageerror', (e) => console.error('[pageerror]', e.message));
await page.goto(base, { waitUntil: 'networkidle', timeout: 30000 }).catch(() => page.goto(base));
await page.waitForTimeout(900);
await page.click('#enter-ar');
await page.waitForFunction(() => Boolean(window.__tubes?.site), { timeout: 15000 });
await page.evaluate(() => window.__tubes.wallsInfo.forceFallback());
await page.waitForFunction(() => window.__tubes.site.wallsReady, { timeout: 5000 });

mkdirSync('shots', { recursive: true });
const save = (name, url) => {
  writeFileSync(`shots/${name}.png`, Buffer.from(url.split(',')[1], 'base64'));
  console.log(`  · shots/${name}.png`);
};

console.log('THE BOARD, TAB BY TAB');
for (const tab of ['jobs', 'factory', 'sys']) {
  await page.evaluate((t) => window.__tubes.menu.act(`tab:${t}`), tab);
  await page.waitForTimeout(400);
  save(`board-${tab}`, await page.evaluate(() => window.__tubes.menu.snapBoard()));
}

console.log('THE Ⓐ CARD, PAGE BY PAGE');
await page.evaluate(() => {
  window.__tubes.menu.act('tab:factory');
  window.__tubes.menu.act('start-order');
});
await page.waitForFunction(() => window.__tubes.site.screen === 'factory', undefined, { timeout: 5000 });
// The whole catalogue open, so the BUILD page shoots every machine.
await page.evaluate(() => window.__tubes.plant.openAll());
await page.evaluate(() => window.__tubes.menu.setPause(true));
await page.waitForTimeout(400);
const shot = async (name, acts) => {
  await page.evaluate((a) => a.forEach((id) => window.__tubes.menu.act(id)), acts);
  await page.waitForTimeout(400);
  save(name, await page.evaluate(() => window.__tubes.menu.snapCard()));
};
await shot('card-build', ['card:build']);
await shot('card-goals', ['card:goals']);
await shot('card-sheet-first', ['goal:0']);
// The last sheet is the longest in the book — the one that overflowed.
const sheets = (await page.evaluate(() => window.__tubes.menu.cardButtons())).filter((b) =>
  /^goal:\d/.test(b),
).length;
await shot('card-sheet-last', ['goal:back', `goal:${sheets - 1}`]);
await shot('card-supply', ['goal:back', 'card:supply']);
await page.evaluate(() => {
  window.__tubes.menu.act('card:build');
  window.__tubes.menu.setPause(false);
});

console.log('THE BOX PANEL, ONE OF EACH');
// A floor with one of everything on it, and something IN the chest, so
// the contents grid is shot with contents in it.
const place = (t, i, j, rot = 0) =>
  page.evaluate(({ t, i, j, rot }) => window.__tubes.build.placeAt(i, j, t, rot), { t, i, j, rot });
await place('maker', 0, -2, 2);
await place('belt', 0, -1, 2);
await place('chest', 0, 0);
await place('dock', -2, 0);
await place('combiner', 2, 0);
await place('vat', 2, -2);
await page.waitForTimeout(300);
// Fill the chest by hand, from the maker's own chute.
const glands = await page.evaluate(() => window.__tubes.plant.glands('far'));
const maker = glands.find((g) => g.type === 'maker');
if (maker) {
  await page.evaluate((s) => window.__tubes.plant.grab(s), 'far');
  for (let k = 1; k <= 6; k++) {
    await page.evaluate(
      ({ t, k }) => window.__tubes.plant.dragTo(t.x + t.nx * 0.1, t.y, t.z + t.nz * 0.1),
      { t: maker, k },
    );
    await page.waitForTimeout(140);
  }
  await page.evaluate(() => window.__tubes.plant.release());
  await page.evaluate(() => window.__tubes.plant.timeScale(12));
  await page.waitForFunction(() => window.__tubes.plant.state().parts >= 2, undefined, { timeout: 30000 }).catch(() => {});
}
await page.waitForTimeout(600);
for (const u of await page.evaluate(() => window.__tubes.plant.plan())) {
  await page.evaluate((id) => window.__tubes.menu.inspect(id), u.id);
  await page.waitForTimeout(420);
  save(`box-${u.type}`, await page.evaluate(() => window.__tubes.menu.snapBox()));
}
await page.evaluate(() => window.__tubes.menu.act('box:close'));

console.log('THANKS FOR PLAYING');
// The last card in the game, without walking the whole book to it.
await page.evaluate(() => window.__tubes.plant.postSheet(6));
await page.waitForTimeout(300);
const vat = (await page.evaluate(() => window.__tubes.plant.glands('near'))).find(
  (g) => g.type === 'vat',
);
if (vat) {
  await page.evaluate((s) => window.__tubes.plant.grab(s), 'near');
  for (let k = 1; k <= 6; k++) {
    await page.evaluate((t) => window.__tubes.plant.dragTo(t.x + t.nx * 0.1, t.y, t.z + t.nz * 0.1), vat);
    await page.waitForTimeout(150);
  }
  await page.evaluate(() => window.__tubes.plant.release());
  await page.evaluate(() => window.__tubes.plant.timeScale(8));
  await page
    .waitForFunction(() => window.__tubes.menu.finaleUp(), undefined, { timeout: 90000 })
    .catch(() => console.error('  ! the goop never arrived'));
  await page.waitForTimeout(400);
  save('card-finale', await page.evaluate(() => window.__tubes.menu.snapFinale()));
  // And the creature itself, on the floor beside its vat.
  await page.evaluate(() => window.__tubes.menu.act('finale:close'));
  // Stand a metre and a half in front of the vat, at about the goop's
  // own eye height, and let it come to you.
  const at = await page.evaluate(() => window.__tubes.goop.state());
  void at;
  await page.evaluate(() => window.__tubes.rig(0.5, 1.1, 0, -0.45, -0.16));
  await page.waitForTimeout(900);
  await page.screenshot({ path: 'shots/the-goop.png', clip: { x: 240, y: 90, width: 800, height: 640 } });
  console.log('  · shots/the-goop.png');
}
void CELL;

await browser.close();
console.log('\nLOOK AT THEM.');
