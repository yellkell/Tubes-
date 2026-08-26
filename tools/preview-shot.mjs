#!/usr/bin/env node
/**
 * PREVIEW SHOTS — the shift on camera, for style iteration.
 *
 *   npm run dev
 *   node tools/preview-shot.mjs
 *
 * Boots the emulator, clocks in, and captures shots/ of the moments that
 * carry the look: the board, the placed flange + woken socket, the pull
 * mid-haul, and a landed run with the pour and the shaft going. Also
 * writes the board's raw canvas (board.png) for pixel-perfect UI checks.
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { chromium } from 'playwright';

const base = process.env.PREVIEW_BASE ?? 'http://localhost:5173';
mkdirSync('shots', { recursive: true });

let browser;
try {
  browser = await chromium.launch();
} catch {
  browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
}
const page = await browser.newPage({ viewport: { width: 1280, height: 820 } });
page.on('pageerror', (e) => console.error('[pageerror]', e.message));
await page.goto(base, { waitUntil: 'networkidle', timeout: 30000 }).catch(() => page.goto(base));
await page.waitForTimeout(1200);
await page.screenshot({ path: 'shots/landing.png' });

await page.click('#enter-ar');
await page.waitForFunction(() => document.body.classList.contains('app-entered'), { timeout: 15000 });
await page.waitForFunction(() => Boolean(window.__tubes?.site), { timeout: 10000 });
await page.evaluate(() => window.__tubes.wallsInfo.forceFallback());
await page.waitForFunction(() => window.__tubes.site.wallsReady, { timeout: 5000 });
await page.waitForTimeout(900);
await page.screenshot({ path: 'shots/board.scene.png' });

// The board's own canvas, pixel-perfect.
const board = await page.evaluate(() => window.__tubes.menu.snapBoard());
writeFileSync('shots/board.png', Buffer.from(board.split(',')[1], 'base64'));

// Start the first job, mount on the wall AHEAD (the camera looks −Z), and
// let the wake play out on camera.
await page.evaluate(() => window.__tubes.menu.act('start'));
await page.waitForFunction(() => window.__tubes.site.screen === 'shift', undefined, { timeout: 5000 });
await page.evaluate(() => {
  const t = window.__tubes;
  // The wall most in front of the spawn: biggest −z centre.
  const wall = [...t.walls].sort((a, b) => a.center.z - b.center.z)[0];
  t.place.mountAt(wall.id, 0.3, 0.1);
});
await page.waitForTimeout(1200);
await page.screenshot({ path: 'shots/wake.png' });
await page.waitForFunction(() => window.__tubes.site.runs[0]?.phase === 'pull', undefined, {
  timeout: 6000,
});

// Take the collar and haul it halfway across the room for the mid-pull shot.
await page.evaluate(() => window.__tubes.tube.grab());
const mid = await page.evaluate(() => {
  const r = window.__tubes.site.runs[0];
  return {
    x: (r.pointA.x + r.pointB.x) / 2,
    y: (r.pointA.y + r.pointB.y) / 2 + 0.1,
    z: (r.pointA.z + r.pointB.z) / 2,
  };
});
await page.evaluate((p) => window.__tubes.tube.dragTo(p.x, p.y, p.z), mid);
await page.waitForTimeout(900);
await page.screenshot({ path: 'shots/pull.png' });

// Park it (the droop), then finish the run and shoot the pour + shaft.
await page.evaluate(() => window.__tubes.tube.release());
await page.waitForTimeout(700);
await page.screenshot({ path: 'shots/parked.png' });
await page.evaluate(() => window.__tubes.tube.grab());
const seat = await page.evaluate(() => {
  const r = window.__tubes.site.runs[0];
  return {
    x: r.pointB.x + r.normalB.x * 0.1,
    y: r.pointB.y + r.normalB.y * 0.1,
    z: r.pointB.z + r.normalB.z * 0.1,
  };
});
await page.evaluate((p) => window.__tubes.tube.dragTo(p.x, p.y, p.z), seat);
await page.waitForFunction(() => window.__tubes.site.runs[0]?.phase === 'flowing', undefined, {
  timeout: 12000,
});
await page.waitForTimeout(900);
await page.screenshot({ path: 'shots/flowing.png' });

console.log('shots/: landing, board.scene, board, wake, pull, parked, flowing');
await browser.close();
