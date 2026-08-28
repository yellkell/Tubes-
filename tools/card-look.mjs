#!/usr/bin/env node
/**
 * THE Ⓐ CARD, PAGE BY PAGE — the check that has to have eyes.
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
 * rects to compare, so this dumps each page of the card as a PNG and a
 * human looks. Cheap, and the only honest way to see a menu.
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { chromium } from 'playwright';

const base = process.env.PREVIEW_BASE ?? 'http://localhost:5173';
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
await page.evaluate(() => {
  window.__tubes.menu.act('tab:orders');
  window.__tubes.menu.act('start-order');
});
await page.waitForFunction(() => window.__tubes.site.screen === 'factory', undefined, { timeout: 5000 });
await page.evaluate(() => window.__tubes.menu.setPause(true));
await page.waitForTimeout(400);

mkdirSync('shots', { recursive: true });
const shot = async (name, acts) => {
  await page.evaluate((a) => a.forEach((id) => window.__tubes.menu.act(id)), acts);
  await page.waitForTimeout(400);
  const url = await page.evaluate(() => window.__tubes.menu.snapCard());
  writeFileSync(`shots/card-${name}.png`, Buffer.from(url.split(',')[1], 'base64'));
  console.log(`  · shots/card-${name}.png`);
};

console.log('THE CARD, PAGE BY PAGE');
await shot('build', ['card:build']);
await shot('goals', ['card:goals']);
await shot('sheet-first', ['goal:0']);
// The last sheet is the longest in the book — the one that overflowed.
await shot('sheet-last', ['goal:back', `goal:${(await page.evaluate(() => window.__tubes.menu.cardButtons())).filter((b) => /^goal:\d/.test(b)).length - 1}`]);
await shot('supply', ['goal:back', 'card:supply']);

await browser.close();
console.log('\nLOOK AT THEM.');
