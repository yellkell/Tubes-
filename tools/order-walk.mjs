#!/usr/bin/env node
/**
 * THE WORK BOOK — all five sheets, filled headlessly.
 *
 *   npm run dev
 *   node tools/order-walk.mjs
 *
 * Boots the emulator, clocks in, forces the fallback room, and works the
 * factory's whole book through the REAL modules: the ORDERS tab, the
 * fluid draught, the maker BELTING its gears home, a second line, the
 * wall-bound combiner fed from both sides, a maker re-fed from a
 * different feed entirely (the swivel gland's hardest case), the chest,
 * the bank paying a bill — then FREE PLAY.
 *
 * The floor is the fallback room's default: cells i ∈ [−5, 4],
 * j ∈ [−4, 3]. Feeds: amber far (x 0), cyan left, violet right.
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
const glands = (side) => page.evaluate((s) => window.__tubes.plant.glands(s), side);
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
/** A filled sheet posts the NEXT one in the same frame the tenth part
 *  lands (count resets with it), so the walk watches the ORDER advance. */
const waitOrder = (idx, timeout = 90000) =>
  page.waitForFunction((want) => window.__tubes.plant.state().order === want, idx, { timeout });

/** Lay a run of rails: [[i, j, rot], …]. */
async function rails(list) {
  let laid = 0;
  for (const [i, j, rot] of list) if (await place(i, j, 'belt', rot)) laid++;
  return laid;
}

/** Haul a feed's tube onto a gland: grab, stride the driven hands in,
 *  let the swivel and the magnet do the rest. */
async function seatRun(side, glandUnit, label = '') {
  const target = (await glands(side)).find((g) => g.unit === glandUnit);
  if (!target) {
    check(false, `a gland stands ready on unit ${glandUnit}`);
    return;
  }
  const grabbed = await page.evaluate((s) => window.__tubes.plant.grab(s), side);
  if (!grabbed) {
    check(false, `${side} collar taken`);
    return;
  }
  const seat = {
    x: target.x + target.nx * 0.1,
    y: target.y + target.ny * 0.1,
    z: target.z + target.nz * 0.1,
  };
  const head = (await state()).runs.find((r) => r.side === side).head;
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
  check(true, `${side} seats into unit ${glandUnit}${label ? ` — ${label}` : ''}`);
}

async function unseat(unitId) {
  const ok = await page.evaluate((u) => window.__tubes.plant.unseat(u), unitId);
  check(ok, `unit ${unitId} gives the supply back`);
  await page.waitForTimeout(900); // the tube telescopes home
}

console.log('SHEET 1 — FIRST DRAUGHT');
await page.evaluate(() => window.__tubes.menu.act('tab:orders'));
const offered = await page.evaluate(() => window.__tubes.menu.boardButtons());
check(offered.includes('start-order'), 'the ORDERS tab offers the book');
check(offered.includes('free-play'), 'and FREE PLAY beside it');
await page.evaluate(() => window.__tubes.menu.act('start-order'));
await page.waitForFunction(() => window.__tubes.site.screen === 'factory', undefined, { timeout: 5000 });
let s = await state();
check(s.mode === 'order' && s.order === 0 && s.goal === 10, `the first sheet is live (×${s.goal})`);
check(s.feeds.far === true && !s.feeds.left, 'the amber feed woke alone');

// THE WALL LAW: the dock is wall plant — open floor refuses it.
check((await place(0, 0, 'dock', 0)) === false, 'the dock refuses open floor');
check(await place(4, 1, 'dock', 0), 'the dock bolts to the site edge');
const dockId = (await glands('far')).find((g) => g.type === 'dock').unit;
await seatRun('far', dockId, 'the swivel took it side-on');
await setScale(10);
await waitOrder(1);
check(true, 'ten draughts drunk — sheet 2 posts into the same shift');

console.log('SHEET 2 — PIECE WORK');
await setScale(6);
s = await state();
check(s.units === 1, 'the plant persisted (the dock stands on)');
const cat2 = await page.evaluate(() => window.__tubes.build.catalogue());
check(
  cat2.available.includes('maker') && cat2.available.includes('belt'),
  `the maker AND the rails arrive together (${cat2.available.join(', ')})`,
);
check(await place(1, -3, 'maker', 2), 'the gear maker stands');
const laid = await rails([
  [1, -2, 1], [2, -2, 1], [3, -2, 1],
  [4, -2, 2], [4, -1, 2], [4, 0, 2],
]);
check(laid === 6, `rails run maker → dock (${laid} pieces)`);
await unseat(dockId);
const makerId = (await glands('far')).find((g) => g.type === 'maker').unit;
await seatRun('far', makerId, 'amber feeds the maker');
await waitOrder(2, 120000);
check(true, 'ten gears BELTED home — nothing hand-carried');

console.log('SHEET 3 — THE LINE');
s = await state();
check(s.feeds.left === true, 'the cyan feed woke with the sheet');
check(await place(-4, -3, 'maker', 2), 'the cell maker stands');
const laid3 = await rails([[-4, -2, 1], [-3, -2, 1], [-2, -2, 1], [-1, -2, 1], [0, -2, 1]]);
check(laid3 === 5, `a second lane merges into the first (${laid3} pieces)`);
const cellMakerId = (await glands('left')).find((g) => g.type === 'maker' && !g.seated).unit;
await seatRun('left', cellMakerId, 'cyan from the far side of the floor');
await setScale(12);

// THE BANK IS FOR SOMETHING: gears keep arriving while the sheet wants
// cells, so they bank — and a bill gets paid off the SUPPLY page.
await page.waitForFunction(() => (window.__tubes.plant.state().bank.gear ?? 0) >= 4, undefined, {
  timeout: 120000,
});
const before = (await state()).bank.gear ?? 0;
await page.evaluate(() => window.__tubes.menu.act('buy:long-reach'));
s = await state();
check(s.upgrades.includes('long-reach'), 'LONG REACH fitted off the SUPPLY page');
check((s.bank.gear ?? 0) === before - 4, `the bill came out of the bank (${before} → ${s.bank.gear ?? 0})`);
await waitOrder(3, 180000);
check(true, 'ten cells rode home while the gears banked');

console.log('SHEET 4 — FIRST FITTING');
await setScale(8);
// The combiner is wall plant too — and it takes the wall's facing, not
// the hand's, so its two ports always sit along the tape.
check((await place(0, -1, 'combiner', 0)) === false, 'the combiner refuses open floor');
check(await place(-2, -4, 'combiner', 0), 'the combiner bolts to the far tape');
const combiner = await page.evaluate(() =>
  window.__tubes.plant.state().units,
);
void combiner;
// Re-plumb both makers to feed its ports along the wall.
await removeAt(1, -3);
check(await place(1, -3, 'maker', 0), 'the gear maker turns to face the wall run');
await rails([[1, -4, 3], [0, -4, 3], [-1, -4, 3]]);
await removeAt(-4, -3);
check(await place(-4, -3, 'maker', 0), 'the cell maker turns too');
await rails([[-4, -4, 1], [-3, -4, 1]]);
check((await rails([[-2, -3, 2]])) === 1, 'the combiner chutes onto the main lane');
const gearMaker2 = (await glands('far')).find((g) => g.type === 'maker' && g.x > 0).unit;
const cellMaker2 = (await glands('left')).find((g) => g.type === 'maker' && g.x < -0.9).unit;
await seatRun('far', gearMaker2, 're-seated after the turn');
await seatRun('left', cellMaker2);
await setScale(12);
await waitOrder(4, 300000);
check(true, 'ten pumps fitted — two wall lanes became one');

console.log('SHEET 5 — NIGHT SHIFT');
await setScale(6);
s = await state();
check(s.feeds.right === true, 'the violet feed woke with the sheet');
check(await place(2, 1, 'chest', 0), 'the chest stands (free plant, mid-floor)');
// THE SWIVEL'S HARDEST CASE: the same maker, re-fed from a feed on the
// opposite side of the room. Its gland swings right round to meet it.
await unseat(gearMaker2);
await seatRun('right', gearMaker2, 'violet takes the gear maker — gland swung right round');

// The worst frame, shot while the whole floor is actually RUNNING (the
// book's last sheet clears the plant when it closes, so a shot after
// the ceremony catches an empty room).
await page.waitForTimeout(1200);
const info = await page.evaluate(() => window.__tubes.info());
check(info && info.calls < 320, `draw budget holds at full shift (${info?.calls} calls)`);
mkdirSync('shots', { recursive: true });
await page.evaluate(() => window.__tubes.rig(0, 1.35, 0));
await page.waitForTimeout(400);
await page.screenshot({ path: 'shots/order-walk.png' });
await page.evaluate(() => window.__tubes.rig(-1.1, -0.4, -0.6));
await page.waitForTimeout(400);
await page.screenshot({ path: 'shots/order-walk-lines.png' });
await page.evaluate(() => window.__tubes.rig(0, 0, 0));
console.log('  · shots/order-walk.png · shots/order-walk-lines.png');

await setScale(14);
await page.waitForFunction(() => window.__tubes.site.screen === 'ceremony', undefined, {
  timeout: 420000,
});
check(true, 'ten lamps — the book closed, and the room gets its moment');
await page.waitForFunction(() => window.__tubes.site.screen === 'board', undefined, { timeout: 15000 });

console.log('FREE PLAY');
await page.evaluate(() => {
  window.__tubes.menu.act('tab:orders');
  window.__tubes.menu.act('free-play');
});
await page.waitForFunction(() => window.__tubes.site.screen === 'factory', undefined, { timeout: 5000 });
s = await state();
check(s.mode === 'free', 'FREE PLAY opens the shop');
check(s.order === -1 && s.goal === 0, 'nobody is asking for ten of anything');
check(
  s.feeds.far === true && s.feeds.left === true && s.feeds.right === true,
  'every feed is awake at once',
);
const catF = await page.evaluate(() => window.__tubes.build.catalogue());
check(catF.available.length === 5, `the whole catalogue is open (${catF.available.join(', ')})`);
check(
  catF.wallBound.join(',') === 'dock,combiner',
  `and the wall law still names its plant (${catF.wallBound.join(', ')})`,
);
check(await place(0, 0, 'maker', 2), 'a maker stands anywhere it likes');
check(await place(-5, 0, 'combiner', 0), 'the combiner still wants a wall');
const freeMaker = (await glands('far')).find((g) => g.type === 'maker').unit;
await seatRun('far', freeMaker, 'free play pours like any shift');
await setScale(12);
const banked0 = Object.values((await state()).bank).reduce((a, b) => a + b, 0);
await page.waitForFunction(
  (was) =>
    Object.values(window.__tubes.plant.state().bank).reduce((a, b) => a + b, 0) > was ||
    window.__tubes.plant.state().parts > 0,
  banked0,
  { timeout: 60000 },
);
check(true, 'free play makes parts with no sheet in sight');
await page.evaluate(() => window.__tubes.abandonFactory());
await page.waitForFunction(() => window.__tubes.site.screen === 'board', undefined, { timeout: 5000 });
check((await state()).mode === 'idle', 'DOWN TOOLS closes the shop');

await browser.close();
if (fails.length) {
  console.error(`\n${fails.length} FAILED:\n - ${fails.join('\n - ')}`);
  process.exit(1);
}
console.log('\nTHE WHOLE BOOK FILLED.');
