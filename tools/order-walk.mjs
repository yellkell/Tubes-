#!/usr/bin/env node
/**
 * THE WORK BOOK — all five sheets, filled headlessly.
 *
 *   npm run dev
 *   node tools/order-walk.mjs
 *
 * Boots the emulator, clocks in, forces the fallback room, and works the
 * factory's whole book through the REAL modules: the ORDERS tab, the
 * fluid draught into the dock's gland, the maker and the hand-carry, the
 * rails running unattended, the combiner fed from both sides, the line
 * re-plumbed mid-shift (unseat, re-seat), the chest, the bank taking
 * surplus, and the plant persisting from sheet to sheet. The sim runs at
 * timeScale through the same code the headset runs at 1.
 *
 * Exits non-zero if any of it fails.
 */

import { mkdirSync } from 'node:fs';
import { chromium } from 'playwright';

const base = process.env.PREVIEW_BASE ?? 'http://localhost:5173';
const fails = [];
const check = (ok, what) => {
  console.log(`  ${ok ? '✓' : '✗'} ${what}`);
  if (!ok) fails.push(what);
};

let browser;
try {
  browser = await chromium.launch();
} catch {
  browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
}
const page = await browser.newPage({ viewport: { width: 1280, height: 820 } });
page.on('pageerror', (e) => fails.push(`[pageerror] ${e.message}`));
await page.goto(base, { waitUntil: 'networkidle', timeout: 30000 }).catch(() => page.goto(base));
await page.waitForTimeout(1000);

console.log('CLOCK IN');
await page.click('#enter-ar');
await page.waitForFunction(() => document.body.classList.contains('app-entered'), { timeout: 15000 });
await page.waitForFunction(() => Boolean(window.__tubes?.site), { timeout: 10000 });
await page.waitForTimeout(400);
await page.evaluate(() => window.__tubes.wallsInfo.forceFallback());
await page.waitForFunction(() => window.__tubes.site.wallsReady, { timeout: 5000 });

const state = () => page.evaluate(() => window.__tubes.plant.state());
const glands = () => page.evaluate(() => window.__tubes.plant.glands());
const place = (i, j, type, rot) =>
  page.evaluate(({ i: ii, j: jj, t, r }) => window.__tubes.build.placeAt(ii, jj, t, r), {
    i,
    j,
    t: type,
    r: rot,
  });
const removeAt = (i, j) =>
  page.evaluate(({ i: ii, j: jj }) => window.__tubes.build.removeAt(ii, jj), { i, j });
const setScale = (s) => page.evaluate((v) => window.__tubes.plant.timeScale(v), s);
// A filled sheet posts the NEXT one in the same frame the tenth part
// lands (count resets with it), so the walk watches the ORDER advance —
// the honest signal — never the count itself.
const waitOrder = (idx, timeout = 60000) =>
  page.waitForFunction((want) => window.__tubes.plant.state().order === want, idx, { timeout });

/** Haul a feed's tube onto a gland: grab, stride the driven hands in,
 *  let the magnet and the charge do the rest. */
async function seatRun(side, glandUnit) {
  const target = (await glands()).find((g) => g.unit === glandUnit);
  check(Boolean(target), `a gland stands ready on unit ${glandUnit}`);
  const grabbed = await page.evaluate((s) => window.__tubes.plant.grab(s), side);
  check(grabbed, `${side} collar taken (two driven hands)`);
  const seat = {
    x: target.x + target.nx * 0.1,
    y: target.y + target.ny * 0.1,
    z: target.z + target.nz * 0.1,
  };
  const head = (await state()).runs.find((r) => r.side === side).head;
  // Stride the head in — the spring, the ratchet and the magnet all get
  // exercised on the way.
  for (let step = 1; step <= 6; step++) {
    const k = step / 6;
    await page.evaluate(
      ({ from, to, t }) =>
        window.__tubes.plant.dragTo(
          from.x + (to.x - from.x) * t,
          from.y + (to.y - from.y) * t,
          from.z + (to.z - from.z) * t,
        ),
      { from: head, to: seat, t: k },
    );
    await page.waitForTimeout(200);
  }
  await page.waitForFunction(
    ({ s, u }) => {
      const run = window.__tubes.plant.state().runs.find((r) => r.side === s);
      return run && (run.phase === 'seated' || run.phase === 'flowing') && run.target === u;
    },
    { s: side, u: glandUnit },
    { timeout: 10000 },
  );
  await page.evaluate(() => window.__tubes.plant.release());
  await page.waitForFunction(
    (s) => window.__tubes.plant.state().runs.find((r) => r.side === s)?.phase === 'flowing',
    side,
    { timeout: 8000 },
  );
  check(true, `${side} run seated and flowing into unit ${glandUnit}`);
}

async function unseat(unitId) {
  const ok = await page.evaluate((u) => window.__tubes.plant.unseat(u), unitId);
  check(ok, `unit ${unitId} gives the supply back`);
  await page.waitForFunction(
    () => window.__tubes.plant.state().runs.every((r) => r.phase === 'pull' || r.phase === 'flowing' || r.phase === 'seated'),
    undefined,
    { timeout: 5000 },
  );
}

/** Carry one part from a spot to a spot with the driven fist. */
async function carry(fromX, fromY, fromZ, toX, toY, toZ) {
  const took = await page.evaluate(
    ({ x, y, z }) => window.__tubes.plant.take(x, y, z),
    { x: fromX, y: fromY, z: fromZ },
  );
  if (took === null) return false;
  await page.waitForTimeout(60);
  return page.evaluate(({ x, y, z }) => window.__tubes.plant.drop(x, y, z), {
    x: toX,
    y: toY,
    z: toZ,
  });
}

console.log('SHEET 1 — FIRST DRAUGHT');
await page.evaluate(() => window.__tubes.menu.act('tab:orders'));
const offered = await page.evaluate(() => window.__tubes.menu.boardButtons());
check(offered.includes('start-order'), `the ORDERS tab offers the book (${offered.join(', ')})`);
await page.evaluate(() => window.__tubes.menu.act('start-order'));
await page.waitForFunction(() => window.__tubes.site.screen === 'factory', undefined, { timeout: 5000 });
let s = await state();
check(s.order === 0 && s.goal === 10, `the first sheet is live (order ${s.order}, ×${s.goal})`);
check(s.feeds.far === true && !s.feeds.left, 'the amber feed woke alone');
check(s.runs.length === 1 && s.runs[0].phase === 'pull', 'the stub waits on the spout');

check(await place(0, 0, 'dock', 2), 'the dock stands');
check((await place(0, 1, 'maker', 2)) === false, 'the catalogue withholds the maker (sheet 1)');
const dockId = (await glands()).find((g) => g.type === 'dock').unit;
await seatRun('far', dockId);
await setScale(10);
await waitOrder(1);
check(true, 'ten draughts drunk — sheet 2 posts into the same shift');

console.log('SHEET 2 — PIECE WORK');
await setScale(6);
s = await state();
check(s.units === 1, 'the plant persisted (the dock stands on)');
check(await place(0, -2, 'maker', 2), 'the maker stands');
const makerId = (await glands()).find((g) => g.type === 'maker').unit;
await unseat(dockId);
await page.waitForFunction(
  () => window.__tubes.plant.state().runs.find((r) => r.side === 'far')?.phase === 'pull',
  undefined,
  { timeout: 5000 },
);
check(true, 'the amber tube telescoped home to its stub');
await seatRun('far', makerId);
// You are the first conveyor: carry each gear off the chute to the dock
// — ten for the sheet, five more for the bank (bills want paying).
let carried = 0;
for (let tries = 0; tries < 300 && carried < 15; tries++) {
  const moved = await carry(0.175, 0.9, -0.42, 0.175, 0.9, 0.175);
  if (moved) carried++;
  else await page.waitForTimeout(300);
}
check(carried >= 15, `the fist ran the line (${carried} parts carried)`);
await waitOrder(2);
s = await state();
check((s.bank.gear ?? 0) >= 5, `the surplus banked (bank holds ${s.bank.gear ?? 0} gears)`);

console.log('SHEET 3 — THE LINE');
s = await state();
check(s.feeds.left === true, 'the cyan feed woke with the sheet');

// THE BANK IS FOR SOMETHING: pay LONG REACH's bill (4 gears) off the
// card's SUPPLY page — the fitting is live the moment the stamp lands.
const gearsBefore = s.bank.gear ?? 0;
await page.evaluate(() => window.__tubes.menu.act('buy:long-reach'));
s = await state();
check(s.upgrades.includes('long-reach'), 'LONG REACH fitted off the SUPPLY page');
check(
  (s.bank.gear ?? 0) === gearsBefore - 4,
  `the bill came out of the bank (${gearsBefore} → ${s.bank.gear ?? 0} gears)`,
);
check(await place(-4, -1, 'maker', 1), 'the cell maker stands');
check(await place(-3, -1, 'belt', 1), 'rails stand');
await place(-2, -1, 'belt', 1);
await place(-1, -1, 'belt', 2);
await place(-1, 0, 'belt', 1);
const cellMakerId = (await glands()).find((g) => g.type === 'maker' && !g.seated && g.x < -0.9).unit;
await seatRun('left', cellMakerId);
await setScale(12);
await waitOrder(3, 120000);
check(true, 'ten cells rode the rails unattended');

console.log('SHEET 4 — FIRST FITTING');
await setScale(8);
check(await removeAt(-1, -1), 'a rail comes up for the combiner');
check(await place(-1, -1, 'combiner', 2), 'the combiner stands');
check(await place(0, -1, 'belt', 3), 'the gear chute rails into its port');
await setScale(12);
await waitOrder(4, 240000);
check(true, 'ten pumps fitted — two lines became one');

console.log('SHEET 5 — NIGHT SHIFT');
await setScale(6);
s = await state();
check(s.feeds.right === true, 'the violet feed woke with the sheet');
check(await place(3, -1, 'maker', 3), 'the chip maker stands');
await place(2, -1, 'belt', 3);
await place(1, -1, 'belt', 3);
check(await place(3, 0, 'chest', 0), 'the chest stands');
// Re-plumb the line mid-shift: gears starve (amber unseats), chips take
// their port — the combiner's next fitting is a LAMP.
await unseat(makerId);
const chipMakerId = (await glands()).find((g) => g.type === 'maker' && !g.seated && g.x > 0.9).unit;
await seatRun('right', chipMakerId);

// The chest holds what the fist gives it: lift a chip off the line,
// drop it in the crate.
let stored = false;
for (let tries = 0; tries < 40 && !stored; tries++) {
  stored = await carry(1.225, 0.9, -0.175, 1.225, 0.9, 0.175);
  if (!stored) await page.waitForTimeout(400);
}
check(stored, 'the chest answered the fist');
const inChest = await page.evaluate(
  () => window.__tubes.plant.parts().filter((p) => p.kind === 'chest').length,
);
check(inChest >= 1, `the crate holds it (${inChest} stored)`);

s = await state();
const bankTotal = Object.values(s.bank).reduce((a, b) => a + b, 0);
check(bankTotal >= 1, `the bank kept sheet 2's surplus (${bankTotal} part${bankTotal === 1 ? '' : 's'})`);

// The worst frame: three feeds, three runs, the whole bench network and
// its parts, all standing at once.
const info = await page.evaluate(() => window.__tubes.info());
check(info && info.calls < 320, `draw budget holds at full shift (${info?.calls} calls)`);
mkdirSync('shots', { recursive: true });
await page.evaluate(() => window.__tubes.rig(0, 1.35, 0));
await page.waitForTimeout(300);
await page.screenshot({ path: 'shots/order-walk.png' });
// And a closer look at the parts themselves — the kits are the point.
await page.evaluate(() => window.__tubes.rig(0.15, 1.05, 0));
await page.waitForTimeout(300);
await page.screenshot({ path: 'shots/order-walk-parts.png' });
await page.evaluate(() => window.__tubes.rig(0, 0, 0));
console.log('  · shots/order-walk.png · shots/order-walk-parts.png');

await setScale(14);
await page.waitForFunction(() => window.__tubes.site.screen === 'ceremony', undefined, {
  timeout: 300000,
});
check(true, 'the book closed — the room gets its moment');
await page.waitForFunction(() => window.__tubes.site.screen === 'board', undefined, { timeout: 12000 });

// The shelf: every sheet open, times on the board, the bank kept.
const shelf = await page.evaluate(() => {
  window.__tubes.menu.act('tab:orders');
  return window.__tubes.menu.boardButtons().filter((b) => b.startsWith('order:')).length;
});
check(shelf === 5, `every sheet is on the board (${shelf}/5)`);

await browser.close();
if (fails.length) {
  console.error(`\n${fails.length} FAILED:\n - ${fails.join('\n - ')}`);
  process.exit(1);
}
console.log('\nTHE WHOLE BOOK FILLED.');
