#!/usr/bin/env node
/**
 * THE SHOP — one continuous session, built BY HAND, headlessly.
 *
 *   npm run dev
 *   node tools/order-walk.mjs
 *
 * The point of this walk changed after playtest. The old one called
 * placeUnit directly and proved the SIM was correct while the game was
 * unplayable — every brick wall lived in the gap between the two. This
 * one builds the first chain through `build.aimAt` / `build.trigger`:
 * the same resolve-and-commit the controller runs, auto-facing, link
 * law, refusals and all. If a human can't build it, this fails.
 *
 * Floor: the fallback room's default, cells i ∈ [−5, 4], j ∈ [−4, 3].
 * Feeds: amber far (x 0), cyan left, violet right.
 */

import { mkdirSync } from 'node:fs';
import { chromium } from 'playwright';

const base = process.env.PREVIEW_BASE ?? 'http://localhost:5173';
const CELL = 0.35;
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
const setScale = (s) => page.evaluate((v) => window.__tubes.plant.timeScale(v), s);
const waitOrder = (idx, timeout = 120000) =>
  page.waitForFunction((want) => window.__tubes.plant.state().order === want, idx, { timeout });
const cellXZ = (i, j) => ({ x: (i + 0.5) * CELL, z: (j + 0.5) * CELL });

/* ── THE HANDS' OWN PATH ─────────────────────────────────────────────── */

const arm = (tool) => page.evaluate((t) => window.__tubes.build.arm(t), tool);
/** Aim at a cell and report what the game says it would do. */
const aim = (i, j, handRot = 0) =>
  page.evaluate(
    ({ x, z, r }) => window.__tubes.build.aimAt(x, z, r),
    { ...cellXZ(i, j), r: handRot },
  );
const pull = () => page.evaluate(() => window.__tubes.build.trigger());
/** Arm → aim → pull, the way a player does it. Returns the aim report. */
async function handPlace(tool, i, j, handRot = 0) {
  await arm(tool);
  const view = await aim(i, j, handRot);
  const ok = await pull();
  return { view, ok };
}
const unitsAt = () => page.evaluate(() => window.__tubes.plant.state().units);

async function seatRun(side, glandUnit, label = '') {
  const target = (await glands(side)).find((g) => g.unit === glandUnit);
  if (!target) return check(false, `a gland stands ready on unit ${glandUnit}`);
  if (!(await page.evaluate((s) => window.__tubes.plant.grab(s), side))) {
    return check(false, `${side} collar taken`);
  }
  const seat = {
    x: target.x + target.nx * 0.1,
    y: target.y + target.ny * 0.1,
    z: target.z + target.nz * 0.1,
  };
  const head = (await state()).runs.find((r) => r.side === side).head;
  for (let step = 1; step <= 6; step++) {
    const t = step / 6;
    await page.evaluate(
      ({ from, to, k }) =>
        window.__tubes.plant.dragTo(
          from.x + (to.x - from.x) * k,
          from.y + (to.y - from.y) * k,
          from.z + (to.z - from.z) * k,
        ),
      { from: head, to: seat, k: t },
    );
    await page.waitForTimeout(200);
  }
  try {
    await page.waitForFunction(
      ({ s, u }) => {
        const r = window.__tubes.plant.state().runs.find((x) => x.side === s);
        return r && (r.phase === 'seated' || r.phase === 'flowing') && r.target === u;
      },
      { s: side, u: glandUnit },
      { timeout: 10000 },
    );
  } catch {
    const r = (await state()).runs.find((x) => x.side === side);
    await page.evaluate(() => window.__tubes.plant.release());
    return check(false, `${side} should seat into ${glandUnit}, landed on ${r?.target} (${r?.phase})`);
  }
  await page.evaluate(() => window.__tubes.plant.release());
  await page.waitForFunction(
    (s) => window.__tubes.plant.state().runs.find((r) => r.side === s)?.phase === 'flowing',
    side,
    { timeout: 8000 },
  );
  check(true, `${side} seats into unit ${glandUnit}${label ? ` — ${label}` : ''}`);
}
const unseat = (u) => page.evaluate((x) => window.__tubes.plant.unseat(x), u);

/* ── the shop ────────────────────────────────────────────────────────── */

console.log('OPEN THE SHOP');
await page.evaluate(() => window.__tubes.menu.act('tab:orders'));
const offered = await page.evaluate(() => window.__tubes.menu.boardButtons());
check(offered.includes('start-order'), 'the board offers one entrance');
check(!offered.includes('free-play'), 'and no separate free-play mode to choose');
await page.evaluate(() => window.__tubes.menu.act('start-order'));
await page.waitForFunction(() => window.__tubes.site.screen === 'factory', undefined, { timeout: 5000 });
let s = await state();
check(s.mode === 'shop', 'one continuous shop, not a mode');
const cat = await page.evaluate(() => window.__tubes.build.catalogue());
check(
  ['dock', 'maker', 'belt'].every((t) => cat.available.includes(t)),
  `a real chain is buildable from minute one (${cat.available.join(', ')})`,
);

console.log('BUILDING BY HAND');
// Everything below goes through aim + trigger — the controller's path.
check((await handPlace('dock', 4, 1)).ok, 'the dock stands where the hand points');
check((await handPlace('dock', 0, 0)).ok === false, 'a second dock is refused');

// The draught first, with the floor still empty — then build the line
// while it pours. (Play order matters here: the magnet takes the
// NEAREST free gland, so a maker standing between the spout and the
// dock would quite reasonably catch the tube instead.)
const dockId = (await glands('far')).find((g) => g.type === 'dock').unit;
await seatRun('far', dockId, 'the collar swivels to meet it');
await setScale(10);

// THE AUTO-FACING, the whole point: lay rails BACKWARD from the dock and
// every piece turns itself to feed the one before it. No rotation puzzle.
const railCells = [
  [4, 0],
  [4, -1],
  [4, -2],
  [3, -2],
  [2, -2],
  [1, -2],
];
let autoFaced = 0;
for (const [i, j] of railCells) {
  const { view, ok } = await handPlace('belt', i, j, 0);
  if (ok && view && view.feeds) autoFaced++;
}
check(autoFaced === railCells.length, `every rail turned itself to connect (${autoFaced}/6)`);

// And the maker, laid last, turns its chute onto the line.
const maker = await handPlace('maker', 1, -3, 0);
check(maker.ok, 'the maker stands');
check(Boolean(maker.view?.feeds), 'and faces its chute onto the rail without being told');
const placed = await unitsAt();
void placed;

// Ⓑ IS THE HAND'S OVERRIDE. Auto-facing is right nearly always, and when
// it isn't the player has to be able to say so — this is the ask, on
// belts, verbatim. Four presses walk the compass and come home.
await arm('belt');
const startRot = (await aim(-2, 2, 0)).rot;
const spun = [];
for (let k = 0; k < 4; k++) {
  await page.evaluate(() => window.__tubes.build.turn());
  spun.push((await aim(-2, 2, 0)).rot);
}
check(
  spun[0] === (startRot + 1) % 4 && spun[1] === (startRot + 2) % 4,
  `Ⓑ turns the piece a quarter at a time (${startRot} → ${spun.join(' → ')})`,
);
check(spun[3] === startRot, 'and four presses bring it back where it started');
// And the override STICKS — the scorer does not argue it back into place.
await page.evaluate(() => window.__tubes.build.turn());
const held = (await aim(-2, 2, 0)).rot;
check(
  (await aim(-2, 2, 2)).rot === held,
  'the hand wins while it is held — aim no longer moves it',
);
check(
  (await page.evaluate(() => window.__tubes.build.forcedRot())) === held,
  'the override is live while the piece is in hand',
);
check(await pull(), 'and the turned piece lands');
check(
  (await page.evaluate(() => window.__tubes.build.forcedRot())) === null,
  'the next piece goes back to facing itself',
);
// …and it really is aim-led again: a different hand angle moves it.
const free = [(await aim(-4, 3, 0)).rot, (await aim(-4, 3, 1)).rot];
check(free[0] !== free[1], 'with nothing to link to, the hand steers once more');
await arm('delete');
await aim(-2, 2, 0);
await pull(); // tidy the test piece back off the floor
await arm(null);

// THE CONNECTION LAW, seen before you commit: a rail aimed into a maker
// shows no link, because a maker drinks fluid and has no use for parts.
await arm('belt');
const intoMaker = await aim(1, -4, 0);
check(
  intoMaker !== null && intoMaker.feeds === null,
  'a rail pointed at a maker offers no connection',
);
await arm(null);

await waitOrder(1);
s = await state();
check(s.mode === 'shop', 'goal 1 posted WITHOUT leaving the floor');
check(s.units >= 8, `and the plant you built is still standing (${s.units} units)`);

console.log('GOAL 2 — the first thing you make');
await setScale(6);
const makerId = (await glands('far')).find((g) => g.type === 'maker').unit;
await unseat(dockId);
await page.waitForTimeout(900);
await seatRun('far', makerId, 'amber feeds the maker');
await page.waitForFunction(() => window.__tubes.plant.state().parts > 0, undefined, {
  timeout: 60000,
});
check(true, 'parts come OUT of the maker and ride the rail');
await setScale(12);
await waitOrder(2, 180000);
check(true, 'ten gears delivered');

console.log('THE REST OF THE BOOK');
// A second lane, laid backward off the first so every piece self-faces.
await setScale(8);
await handPlace('belt', 0, -2, 0);
await handPlace('belt', -1, -2, 0);
const cellMaker = await handPlace('maker', -1, -3, 0);
check(Boolean(cellMaker.view?.feeds), 'the second maker faces its own lane unprompted');
const cellMakerId = (await glands('left')).find((g) => g.type === 'maker' && !g.seated).unit;
await seatRun('left', cellMakerId, 'a second lane');
await setScale(14);
await waitOrder(3, 240000);
check(true, 'ten cells — two lanes, one dock');

// THE COMBINER takes its two feeds head-on (its ports face each other),
// so it drops into the seam between the lanes: gears arrive from the
// east, cells from the west, pumps leave northward.
await setScale(6);
await page.evaluate(() => window.__tubes.build.removeAt(0, -2));
const comb = await handPlace('combiner', 0, -2, 2);
check(comb.ok, 'the combiner stands mid-floor (no wall rule left)');
check((comb.view?.fedBy.length ?? 0) >= 1, 'and shows what already feeds it');
// Turn the gear lane's last rail around to feed the near port…
await page.evaluate(() => window.__tubes.build.removeAt(1, -2));
const turned = await handPlace('belt', 1, -2, 3);
check(turned.view?.rot === 3, 'a rail re-laid beside it turns to feed the port');
// …and rail the combiner's output to the dock, backward as ever.
for (const [i, j] of [
  [3, -1],
  [2, -1],
  [1, -1],
  [0, -1],
]) {
  await handPlace('belt', i, j, 1);
}
await setScale(14);
await waitOrder(4, 300000);
check(true, 'ten pumps fitted — two lanes became one');

console.log('THE BOOK RUNS OUT');
await setScale(6);
s = await state();
check(s.feeds.right === true, 'the violet feed woke for the last sheet');
await handPlace('chest', 2, 1, 0);
await unseat(makerId);
await page.waitForTimeout(900);
await seatRun('right', makerId, 'violet re-feeds the same box');

// A look at a running floor before the last sheet lands.
const info = await page.evaluate(() => window.__tubes.info());
check(info && info.calls < 340, `draw budget holds (${info?.calls} calls)`);
mkdirSync('shots', { recursive: true });
await page.evaluate(() => window.__tubes.rig(0, 1.35, 0));
await page.waitForTimeout(400);
await page.screenshot({ path: 'shots/order-walk.png' });
await page.evaluate(() => window.__tubes.rig(0.9, 0.75, 0));
await page.waitForTimeout(400);
await page.screenshot({ path: 'shots/order-walk-lines.png' });
await page.evaluate(() => window.__tubes.rig(0, 0, 0));
console.log('  · shots/order-walk.png · shots/order-walk-lines.png');

await setScale(16);
await page.waitForFunction(() => window.__tubes.plant.state().order === -1, undefined, {
  timeout: 420000,
});
s = await state();
check(s.mode === 'shop', 'the last goal does NOT close the shop');
check(
  s.feeds.far && s.feeds.left && s.feeds.right,
  'every feed is open now — free play, without ever choosing it',
);
const catEnd = await page.evaluate(() => window.__tubes.build.catalogue());
check(catEnd.available.length === 5, `the whole catalogue is open (${catEnd.available.join(', ')})`);
check((await state()).units > 5, 'and the factory you built is untouched');

console.log('THE Ⓐ CARD');
await page.evaluate(() => window.__tubes.menu.setPause(true));
await page.waitForTimeout(300);
let cardBtns = await page.evaluate(() => window.__tubes.menu.cardButtons());
check(
  ['card:build', 'card:goals', 'card:supply'].every((b) => cardBtns.includes(b)),
  `the card carries its three pages (${cardBtns.join(', ')})`,
);
check(cardBtns.includes('build:delete'), 'DELETE sits in the catalogue, not in folklore');
await page.evaluate(() => window.__tubes.menu.act('card:goals'));
await page.waitForTimeout(200);
cardBtns = await page.evaluate(() => window.__tubes.menu.cardButtons());
check(cardBtns.filter((b) => /^goal:\d/.test(b)).length === 5, 'GOALS lists the whole book');
await page.evaluate(() => window.__tubes.menu.act('goal:2'));
await page.waitForTimeout(200);
cardBtns = await page.evaluate(() => window.__tubes.menu.cardButtons());
check(cardBtns.includes('goal:back'), 'and a sheet opens up for a closer read');

// THE ONE THAT BRICKED A HEADSET. 'goal:back' starts with 'goal:', so the
// index branch caught it first and parked NaN in goalOpen; the next PAINT
// then indexed ORDERS[NaN] and threw, every frame, and the game was gone.
// The old walk pressed this exact button and passed, because it flipped
// the page back in the same evaluate — no frame ever rendered the broken
// state. So: press it ALONE, let real frames go by, and prove the card
// still answers afterwards. (pageerror is wired to fails at the top, so a
// throw during those frames fails the run on its own.)
await page.evaluate(() => window.__tubes.menu.act('goal:back'));
await page.waitForTimeout(600);
cardBtns = await page.evaluate(() => window.__tubes.menu.cardButtons());
check(
  cardBtns.filter((b) => /^goal:\d/.test(b)).length === 5 && !cardBtns.includes('goal:back'),
  'ALL GOALS goes back to the ladder — and does not brick the card',
);
await page.evaluate(() => window.__tubes.menu.act('card:supply'));
await page.waitForTimeout(250);
check(
  (await page.evaluate(() => window.__tubes.menu.cardButtons())).some((b) => b.startsWith('buy:')),
  'and the card still answers after the trip',
);
await page.evaluate(() => {
  window.__tubes.menu.act('card:build');
  window.__tubes.menu.setPause(false);
});

console.log('NOTHING SITS ON ANYTHING');
const boxes = await page.evaluate(() => window.__tubes.menu.cardLayout());
check(boxes.w >= 640 && boxes.h >= 600, `the card has room to read (${boxes.w}×${boxes.h})`);
const overlaps = [];
// cardRects() reports the LAST PAINT, so every act needs a frame to land
// before it is read — otherwise this sweep cheerfully checks the page you
// just left, which is how a layout bug reaches a headset.
const rectsOf = async (m) => {
  await page.evaluate((k) => {
    window.__tubes.menu.setPause(true);
    window.__tubes.menu.act(`card:${k}`);
  }, m);
  await page.waitForTimeout(250);
  return page.evaluate(() => window.__tubes.menu.cardRects());
};
for (const page_ of ['build', 'goals', 'supply']) {
  const rects = await rectsOf(page_);
  check(rects.length > 2, `the ${page_} page paints its controls (${rects.length})`);
  for (let a = 0; a < rects.length; a++) {
    for (let b = a + 1; b < rects.length; b++) {
      const p = rects[a];
      const q = rects[b];
      if (p.x < q.x + q.w && q.x < p.x + p.w && p.y < q.y + q.h && q.y < p.y + p.h) {
        overlaps.push(`${page_}: ${p.id} over ${q.id}`);
      }
    }
  }
  const off = rects.filter((r) => r.y + r.h > boxes.h || r.x + r.w > boxes.w);
  if (off.length) overlaps.push(`${page_}: ${off.map((r) => r.id).join(', ')} off the card`);
}
check(overlaps.length === 0, `no control sits on another, on any page${overlaps.length ? ` — ${overlaps.join(' · ')}` : ''}`);
// The opened sheet is the page that overflowed in the headset.
await page.evaluate(() => {
  window.__tubes.menu.act('card:goals');
  window.__tubes.menu.act('goal:4');
});
await page.waitForTimeout(250);
const sheetRects = await page.evaluate(() => window.__tubes.menu.cardRects());
check(
  sheetRects.some((r) => r.id === 'goal:back'),
  'the last sheet opens (the longest one in the book)',
);
check(
  sheetRects.every((r) => r.y + r.h <= boxes.h && r.x + r.w <= boxes.w),
  'an opened sheet keeps its controls on the card',
);
await page.evaluate(() => {
  window.__tubes.menu.act('goal:back');
  window.__tubes.menu.act('card:build');
  window.__tubes.menu.setPause(false);
});

console.log('THE WRECKING BAR');
const before = (await state()).units;
await arm('delete');
const del = await aim(2, 1, 0);
check(del?.placeable === true, 'DELETE marks the plant under the reticle');
check(await pull(), 'and the trigger takes it out');
check((await state()).units === before - 1, `one unit gone (${before} → ${before - 1})`);
const nothing = await aim(-5, 3, 0);
check(nothing?.placeable === false, 'empty floor has nothing to delete');
await arm(null);

await page.evaluate(() => window.__tubes.abandonFactory());
await page.waitForFunction(() => window.__tubes.site.screen === 'board', undefined, { timeout: 5000 });
check((await state()).mode === 'idle', 'DOWN TOOLS closes the shop');

await browser.close();
if (fails.length) {
  console.error(`\n${fails.length} FAILED:\n - ${fails.join('\n - ')}`);
  process.exit(1);
}
console.log('\nTHE SHOP WORKS BY HAND.');
