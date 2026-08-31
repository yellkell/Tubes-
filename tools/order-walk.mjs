#!/usr/bin/env node
/**
 * THE SHOP — one continuous session, built BY HAND, headlessly.
 *
 *   npm run dev
 *   node tools/order-walk.mjs
 *
 * The point of this walk: everything below goes through `build.aimAt` /
 * `build.trigger` and the pull's own driven hands — the same resolve-
 * and-commit path a controller runs, auto-facing, link law, refusals and
 * all. If a human can't build it, this fails.
 *
 * It walks the book as rewritten after playtest:
 *
 *   ONE DOOR       the board offers OPEN THE FACTORY and nothing else
 *   FIRST GEAR     a maker, a tube, and three stamped gears
 *   THE BANK       a bank, and a hauled lane that BENDS round plant
 *   THE BOX PANEL  click a box: what is in it, and UNPLUG
 *   THE REST       lines, the combiner, chests, servos
 *   THE GOOP       the fourth gate, the vat, and what climbs out of it
 *
 * Floor: the fallback room's default, cells i ∈ [−5, 4], j ∈ [−4, 3].
 * Feeds: amber far (x 0), cyan left, violet right, GREEN near.
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
  page.evaluate(({ x, z, r }) => window.__tubes.build.aimAt(x, z, r), { ...cellXZ(i, j), r: handRot });
const pull = () => page.evaluate(() => window.__tubes.build.trigger());
/** THE HAUL, as a hand does it: press on a cell, drag, let go. */
const haulTo = (i, j) =>
  page.evaluate(({ x, z }) => window.__tubes.build.haulTo(x, z), cellXZ(i, j));
const haulGo = () => page.evaluate(() => window.__tubes.build.haulRelease());
async function haulRun(from, to) {
  await arm('belt');
  await aim(from[0], from[1], 0);
  if (!(await pull())) return { anchor: false, steps: [], laid: 0 };
  const steps = await haulTo(to[0], to[1]);
  const laid = await haulGo();
  await arm(null);
  return { anchor: true, steps, laid };
}
/** Arm → aim → pull, the way a player does it. Returns the aim report. */
async function handPlace(tool, i, j, handRot = 0) {
  await arm(tool);
  const view = await aim(i, j, handRot);
  const ok = await pull();
  await arm(null);
  return { view, ok };
}
/** The route a haul between two cells WOULD lay, without holding one. */
const route = (a, b) =>
  page.evaluate(({ a, b }) => window.__tubes.plant.route(a, b), {
    a: cellXZ(a[0], a[1]),
    b: cellXZ(b[0], b[1]),
  });
const corners = (steps) => steps.filter((s, n) => n > 0 && s.rot !== steps[n - 1].rot).length;

/** Walk a supply collar onto a unit's gland with the driven two hands. */
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
    await page.evaluate(
      ({ from, to, k }) =>
        window.__tubes.plant.dragTo(
          from.x + (to.x - from.x) * k,
          from.y + (to.y - from.y) * k,
          from.z + (to.z - from.z) * k,
        ),
      { from: head, to: seat, k: step / 6 },
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
    check(true, label || `${side} seats on unit ${glandUnit}`);
  } catch {
    check(false, label || `${side} should seat on unit ${glandUnit}`);
  }
  await page.evaluate(() => window.__tubes.plant.release());
  return true;
}

/** THE TUG: both hands on a seated collar, hauled clear and HELD. */
async function tugOff(side, fromUnit) {
  const run = (await state()).runs.find((r) => r.side === side);
  if (!run) return check(false, `${side} has a run to tug`);
  await page.evaluate((s) => window.__tubes.plant.grab(s), side);
  const away = { x: run.head.x, y: run.head.y + 0.55, z: run.head.z + 0.55 };
  for (let n = 0; n < 8; n++) {
    await page.evaluate((p) => window.__tubes.plant.dragTo(p.x, p.y, p.z), away);
    await page.waitForTimeout(120);
  }
  try {
    await page.waitForFunction(
      (sd) => window.__tubes.plant.state().runs.find((r) => r.side === sd)?.phase === 'pull',
      side,
      { timeout: 6000 },
    );
  } catch {
    await page.evaluate(() => window.__tubes.plant.release());
    return check(false, `${side} should come off unit ${fromUnit} under a sustained haul`);
  }
  check(true, `and it comes away in your hands (unit ${fromUnit} freed)`);
  await page.evaluate(() => window.__tubes.plant.release());
  return true;
}

/* ── ONE DOOR ────────────────────────────────────────────────────────── */

console.log('ONE DOOR');
await page.evaluate(() => window.__tubes.menu.act('tab:factory'));
await page.waitForTimeout(250);
const offered = await page.evaluate(() => window.__tubes.menu.boardButtons());
check(offered.includes('start-order'), 'the board offers one entrance');
check(
  !offered.some((b) => /^order:\d/.test(b)),
  'and no per-sheet START buttons to strand yourself on',
);
check(!offered.includes('free-play'), 'and no separate free-play mode to choose');
await page.evaluate(() => window.__tubes.menu.act('start-order'));
await page.waitForFunction(() => window.__tubes.site.screen === 'factory', undefined, { timeout: 5000 });
let s = await state();
check(s.mode === 'shop', 'one continuous shop, not a mode');
check(s.orderId === 'first-gear', `and it always opens at the top of the book (${s.orderId})`);

/* ── SHEET 1: A MAKER AND A TUBE ─────────────────────────────────────── */

console.log('FIRST GEAR — a maker, a tube, three stamps');
const cat = await page.evaluate(() => window.__tubes.build.catalogue());
check(
  cat.available.length === 1 && cat.available[0] === 'maker',
  `the first sheet offers exactly the machine it is about (${cat.available.join(', ')})`,
);
check((await handPlace('maker', 0, -2)).ok, 'the maker stands where the hand points');
check((await handPlace('dock', 2, 1)).ok === false, 'a bank is refused — sheet 2 brings that');

// ONLY MAKERS AND THE VAT WEAR A GLAND. The bank used to, and it stole
// every tube walked past it.
const gl = await glands('far');
check(gl.length === 1 && gl[0].type === 'maker', `one gland on the floor, on the maker (${gl.length})`);
await seatRun('far', gl[0].unit, 'the collar swivels to meet the maker');
await setScale(6);
await page.waitForFunction(() => window.__tubes.plant.state().parts >= 2, undefined, { timeout: 60000 });
check(true, 'the works stamps gears onto the chute');
s = await state();
check(s.count === 2 && s.parts === 2, `two stamped, two on the chute (${s.count}/${s.goal})`);

// The chute holds two: the third only comes if you lift one off, which
// is the whole point of the sheet — it teaches the carry.
const chute = cellXZ(0, -2);
const took = await page.evaluate(
  ({ x, z }) => window.__tubes.plant.take(x, 0.9, z + 0.11),
  chute,
);
check(took !== null, 'a gear lifts off the chute into your fist');
await waitOrder(1, 60000);
check(true, 'and the third stamp fills the sheet');
s = await state();
check(s.orderId === 'the-bank', `sheet 2 posts onto the same floor (${s.orderId})`);
check(s.units === 1, 'with the maker you built still standing');

/* ── SHEET 2: THE BANK, AND A LANE THAT BENDS ────────────────────────── */

console.log('THE BANK — and rails that bend');
const cat2 = await page.evaluate(() => window.__tubes.build.catalogue());
check(
  ['maker', 'dock', 'belt'].every((t) => cat2.available.includes(t)),
  `the bank and the rails arrive (${cat2.available.join(', ')})`,
);
check((await handPlace('dock', 4, 1)).ok, 'the bank stands');
check((await handPlace('dock', -4, 3)).ok === false, 'a second bank is refused');

// THE ASK, VERBATIM: "we want the rails to actually bend when we pull
// them, bend around objects, bend to where we're putting them to go."
// A clear floor still lays the one-cornered L a hand would draw…
const clear = await route([-4, 3], [-1, 3]);
check(clear.length === 3 && corners(clear) === 0, `a clear haul runs straight (${clear.length} cells)`);
const ell = await route([-4, 3], [-1, 1]);
check(corners(ell) === 1, `and turns exactly once across a corner (${corners(ell)})`);
// …and a floor with something in the way BENDS ROUND IT instead of
// stopping dead against it, which is what it used to do.
check((await handPlace('belt', -3, 3)).ok, 'something stands in the lane\u2019s way');
const blocked = await route([-4, 3], [-1, 3]);
check(
  blocked.length > 0 && !blocked.some((st) => st.i === -3 && st.j === 3),
  `the lane goes AROUND the box (${blocked.map((st) => `${st.i},${st.j}`).join(' → ')})`,
);
check(
  blocked.some((st) => st.i === -1 && st.j === 3),
  'and still arrives where you pointed',
);
await page.evaluate(() => window.__tubes.build.removeAt(-3, 3));

// THE HAUL for real: one rail at the maker's chute, dragged to the bank.
// And the maker, which was stood on an empty floor last sheet facing
// wherever the hand pointed, TURNS ITS CHUTE onto the rail the moment
// the rail lands beside it — nobody should have to unbolt a machine to
// re-aim it (see sim.faceStrandedMakers).
const makerBefore = (await page.evaluate(() => window.__tubes.plant.plan())).find(
  (u) => u.type === 'maker',
);
const run = await haulRun([1, -2], [4, 0]);
check(run.anchor, 'one rail stands, and the haul starts in your hand');
check(run.steps.length >= 5, `the run ratchets out to the corner (${run.steps.length} cells)`);
check(run.laid === run.steps.length, `and the whole lane lands at once (${run.laid} rails)`);
check(corners(run.steps) <= 1, `the lane turns once, not every cell (${corners(run.steps)})`);
// AND IT IS A CHAIN, not a row of rails.
const plan = await page.evaluate(() => window.__tubes.plant.plan());
let hop = plan.find((u) => u.i === 1 && u.j === -2);
let hops = 0;
while (hop && hop.feeds !== null && hops < 30) {
  hop = plan.find((u) => u.id === hop.feeds);
  hops++;
}
check(
  hops === run.laid + 1,
  `every rail feeds the next, right into the bank (${hops} hops, ${run.laid} rails)`,
);
check(hop?.type === 'dock', `and the lane ends in the bank (${hop?.type})`);
const makerAfter = plan.find((u) => u.type === 'maker');
check(
  makerBefore?.feeds === null && makerAfter?.feeds !== null,
  `the stranded maker turns its chute onto the new lane (fed ${makerBefore?.feeds} \u2192 ${makerAfter?.feeds})`,
);

/* ── THE BOX PANEL ───────────────────────────────────────────────────── */

console.log('THE BOX PANEL');
// Playtest went looking for a chest's contents and for a way to pull a
// tube off a box, and found neither. Both live on this panel, and it
// opens by POINTING AT A BOX WITH AN EMPTY HAND and pulling the trigger.
await arm(null);
await aim(0, -2, 0);
check(await pull(), 'an empty hand + the trigger opens the box under the reticle');
await page.waitForTimeout(300);
const boxBtns = await page.evaluate(() => window.__tubes.menu.boxButtons());
check(
  ['box:unplug', 'box:turn', 'box:remove', 'box:close'].every((b) => boxBtns.includes(b)),
  `the panel carries its verbs (${boxBtns.join(', ')})`,
);
const boxLabels = await page.evaluate(() => window.__tubes.menu.boxLabels());
check(boxLabels.includes('UNPLUG'), `and UNPLUG is live on a plumbed box (${boxLabels.join(' · ')})`);
const beforeUnplug = await state();
await page.evaluate(() => window.__tubes.menu.act('box:unplug'));
await page.waitForTimeout(400);
const afterUnplug = await state();
check(
  afterUnplug.runs.find((r) => r.side === 'far').target === -1,
  'UNPLUG frees the line',
);
check(
  afterUnplug.units === beforeUnplug.units,
  'and the box is still standing — nothing had to be deleted to do it',
);
await page.evaluate(() => window.__tubes.menu.act('box:close'));
await page.waitForTimeout(250);
check(
  (await page.evaluate(() => window.__tubes.site.inspect)) === -1,
  'CLOSE puts it away and gives the hands back',
);

// Plug the maker back in and finish the sheet.
await page.waitForTimeout(900); // the line telescopes home first
await seatRun('far', gl[0].unit, 'and the same line goes straight back on');
await setScale(14);
await waitOrder(2, 180000);
check(true, 'ten gears delivered — the bank counts what lands in it');

/* ── THE REST OF THE BOOK ────────────────────────────────────────────── */

console.log('THE LINE — a second lane');
// The cyan maker stands east of the bank and rails straight into it, so
// two chains share one dock exactly as the sheet asks.
await setScale(8);
const cellMaker = await handPlace('maker', 2, 1, 1);
check(cellMaker.ok, 'a second maker stands');
await handPlace('belt', 3, 1, 1);
const cellPlan = (await page.evaluate(() => window.__tubes.plant.plan())).find(
  (u) => u.i === 2 && u.j === 1,
);
check(cellPlan?.feeds !== null, 'and its chute finds the rail beside it');
const cellMakerId = (await glands('left')).find((g) => g.type === 'maker' && !g.seated).unit;
await seatRun('left', cellMakerId, 'cyan feeds it');
await setScale(24);
await waitOrder(3, 180000);
check(true, 'ten cells — two lanes, one bank');

console.log('FIRST FITTING — two lanes become one');
await setScale(6);
// Re-plumb the floor round a combiner: gears down from the north into
// one port, cells up from the south into the other, pumps out the east.
for (const [i, j] of [[3, 1], [3, -2], [4, -2]]) {
  await page.evaluate(({ i, j }) => window.__tubes.build.removeAt(i, j), { i, j });
}
const feed2 = await handPlace('belt', 2, 0, 0);
check(feed2.ok, 'a rail stands between the cyan maker and the middle of the floor');
const turnedMaker = (await page.evaluate(() => window.__tubes.plant.plan())).find(
  (u) => u.i === 2 && u.j === 1,
);
check(
  turnedMaker?.rot === 0,
  `and the cyan maker turns to feed it, having lost its old lane (rot ${turnedMaker?.rot})`,
);
await page.evaluate(() => window.__tubes.build.removeAt(2, -2));
const comb = await handPlace('combiner', 2, -1, 1);
check(comb.ok, 'the combiner stands between the two lanes');
check((comb.view?.fedBy.length ?? 0) >= 1, 'and shows what already feeds it');
await handPlace('belt', 2, -2, 2);
await handPlace('belt', 3, -1, 1);
await handPlace('belt', 4, -1, 2);
const chain = await page.evaluate(() => window.__tubes.plant.plan());
const combUnit = chain.find((u) => u.type === 'combiner');
check(combUnit?.feeds !== null, 'the combiner has somewhere to send its pumps');
await setScale(28);
await waitOrder(4, 300000);
check(true, 'ten pumps fitted — two lanes became one');

console.log('NIGHT SHIFT');
await setScale(6);
s = await state();
check(s.feeds.right === true, 'the violet feed woke');
check((await handPlace('chest', 0, 1, 0)).ok, 'and the chest arrives');
// The same box, re-plumbed: the amber maker comes off its line in both
// hands and goes onto violet, and now it stamps CHIPS.
await tugOff('far', gl[0].unit);
await page.waitForTimeout(900);
await seatRun('right', gl[0].unit, 'violet re-feeds the same box');
await setScale(28);
await waitOrder(5, 300000);
check(true, 'ten lamps — the same maker, a different line');

// A look at a running floor.
const info = await page.evaluate(() => window.__tubes.info());
check(info && info.calls < 420, `draw budget holds (${info?.calls} calls)`);
mkdirSync('shots', { recursive: true });
await page.evaluate(() => window.__tubes.rig(0, 1.6, 0, -0.4, -0.3));
await page.waitForTimeout(400);
await page.screenshot({ path: 'shots/order-walk.png' });
await page.evaluate(() => window.__tubes.rig(0, 0, 0));
console.log('  · shots/order-walk.png');

/* ── THE FOURTH GATE, AND THE GOOP ───────────────────────────────────── */

console.log('THE FOURTH GATE');
// Sheet 6 wants six servos through the same combiner; the walk proves
// the GATE, which is the new mechanism, by posting it — a door only a
// tool has.
await setScale(4);
s = await state();
check(s.orderId === 'the-fourth-gate', 'sheet 6 asks for servos');
check(s.feeds.near !== true, 'and the fourth manifold is still shut');
await page.evaluate(() => window.__tubes.plant.postSheet(6));
await page.waitForTimeout(600);
s = await state();
check(s.orderId === 'the-goop', 'sheet 7 posts');
check(s.feeds.near === true, 'and the fourth manifold OPENS — the gate comes off');
const catGoop = await page.evaluate(() => window.__tubes.build.catalogue());
check(catGoop.available.includes('vat'), `the vat arrives in the catalogue (${catGoop.available.join(', ')})`);

console.log('THE GOOP');
check((await handPlace('vat', -3, 1)).ok, 'the vat stands');
const vatId = (await glands('near')).find((g) => g.type === 'vat')?.unit;
check(vatId !== undefined, 'and it wears a gland the green line can take');
await seatRun('near', vatId, 'the green line seats in the vat');
await setScale(6);
await page.waitForFunction(() => window.__tubes.plant.state().goop === 'brewing', undefined, {
  timeout: 40000,
});
check(true, 'the vat starts to fill');
await page.waitForFunction(() => window.__tubes.plant.state().goop === 'born', undefined, {
  timeout: 90000,
});
check(true, 'IT IS BORN');
await setScale(1);
await page.waitForFunction(() => window.__tubes.plant.state().goop === 'dancing', undefined, {
  timeout: 40000,
});
const goop = await page.evaluate(() => window.__tubes.goop.state());
check(Boolean(goop?.dancing), `and it climbs out and dances (form ${goop?.form?.toFixed(2)})`);
check(goop.y < 0.2, `on your actual floor, not inside the tank (y ${goop.y.toFixed(2)})`);
check(await page.evaluate(() => window.__tubes.menu.finaleUp()), 'THANKS FOR PLAYING comes up');
await page.evaluate(() => window.__tubes.rig(-0.6, 0.8, 0, -0.35, -0.25));
await page.waitForTimeout(600);
await page.screenshot({ path: 'shots/order-walk-goop.png' });
console.log('  · shots/order-walk-goop.png');
await page.evaluate(() => window.__tubes.menu.act('finale:close'));
await page.waitForTimeout(300);
check(
  (await page.evaluate(() => window.__tubes.menu.finaleUp())) === false,
  'and the card gets out of the way so you can watch it',
);
check(
  (await page.evaluate(() => window.__tubes.goop.state()))?.dancing === true,
  'while the goop keeps dancing',
);

/* ── THE CARDS ───────────────────────────────────────────────────────── */

console.log('NOTHING SITS ON ANYTHING');
await page.evaluate(() => window.__tubes.menu.setPause(true));
await page.waitForTimeout(300);
const boxes = await page.evaluate(() => window.__tubes.menu.cardLayout());
check(boxes.w >= 700 && boxes.h >= 640, `the card has room to read (${boxes.w}×${boxes.h})`);
const overlaps = [];
const rectsOf = async (m) => {
  await page.evaluate((k) => {
    window.__tubes.menu.setPause(true);
    window.__tubes.menu.act(`card:${k}`);
  }, m);
  await page.waitForTimeout(250);
  return page.evaluate(() => window.__tubes.menu.cardRects());
};
const sweep = (name, rects, frame) => {
  for (let a = 0; a < rects.length; a++) {
    for (let b = a + 1; b < rects.length; b++) {
      const p = rects[a];
      const q = rects[b];
      if (p.x < q.x + q.w && q.x < p.x + p.w && p.y < q.y + q.h && q.y < p.y + p.h) {
        overlaps.push(`${name}: ${p.id} over ${q.id}`);
      }
    }
  }
  const off = rects.filter((r) => r.y + r.h > frame.h || r.x + r.w > frame.w || r.x < 0 || r.y < 0);
  if (off.length) overlaps.push(`${name}: ${off.map((r) => r.id).join(', ')} off the card`);
};
for (const which of ['build', 'goals', 'supply']) {
  const rects = await rectsOf(which);
  check(rects.length > 2, `the ${which} page paints its controls (${rects.length})`);
  sweep(which, rects, boxes);
}
await page.evaluate(() => {
  window.__tubes.menu.act('card:goals');
  window.__tubes.menu.act('goal:6');
});
await page.waitForTimeout(250);
const sheetRects = await page.evaluate(() => window.__tubes.menu.cardRects());
check(sheetRects.some((r) => r.id === 'goal:back'), 'the last sheet opens');
sweep('sheet', sheetRects, boxes);
// THE ONE THAT BRICKED A HEADSET: 'goal:back' starts with 'goal:', so the
// index branch used to catch it first and park NaN in goalOpen; the next
// PAINT then indexed ORDERS[NaN] and threw, every frame.
await page.evaluate(() => window.__tubes.menu.act('goal:back'));
await page.waitForTimeout(600);
const backBtns = await page.evaluate(() => window.__tubes.menu.cardButtons());
check(
  backBtns.filter((b) => /^goal:\d/.test(b)).length === 7 && !backBtns.includes('goal:back'),
  'ALL GOALS goes back to the ladder — and does not brick the card',
);
await page.evaluate(() => {
  window.__tubes.menu.act('card:build');
  window.__tubes.menu.setPause(false);
});
// And the box panel gets the same sweep — it is a card like any other.
const anyUnit = (await page.evaluate(() => window.__tubes.plant.plan()))[0];
await page.evaluate((id) => window.__tubes.menu.inspect(id), anyUnit.id);
await page.waitForTimeout(350);
sweep('box', await page.evaluate(() => window.__tubes.menu.boxRects()), await page.evaluate(() => window.__tubes.menu.boxLayout()));
await page.evaluate(() => window.__tubes.menu.act('box:close'));
check(overlaps.length === 0, `no control sits on another, on any page${overlaps.length ? ` — ${overlaps.join(' · ')}` : ''}`);

console.log('THE HOLOGRAM WEARS THE MACHINE');
const gp = await page.evaluate(() => window.__tubes.build.ghostParts());
check(
  ['dock', 'maker', 'belt', 'combiner', 'chest', 'post', 'vat'].every((t) => gp[t] >= 4),
  `every tool's ghost is a machine, not a box (${Object.entries(gp).map(([k, v]) => `${k} ${v}`).join(', ')})`,
);
check(new Set(Object.values(gp)).size >= 5, 'and they do not all look the same as each other');

console.log('DOWN TOOLS');
await page.evaluate(() => {
  window.__tubes.menu.setPause(true);
  window.__tubes.menu.act('quit');
});
await page.waitForTimeout(250);
check(
  (await page.evaluate(() => window.__tubes.site.screen)) === 'factory',
  'one press on QUIT does not take the floor with it',
);
check(
  (await page.evaluate(() => window.__tubes.menu.cardLabels())).some((l) => /SURE/.test(l)),
  'it asks first',
);
await page.evaluate(() => window.__tubes.menu.act('quit'));
await page.waitForFunction(() => window.__tubes.site.screen === 'board', undefined, { timeout: 5000 });
check((await state()).mode === 'idle', 'and the second press closes the shop');
check(
  (await page.evaluate(() => window.__tubes.goop.state())) === null,
  'and the goop goes with it',
);

await browser.close();
if (fails.length) {
  console.error(`\n${fails.filter(Boolean).length} FAILED:\n - ${fails.filter(Boolean).join('\n - ')}`);
  process.exit(1);
}
console.log('\nTHE SHOP WORKS BY HAND.');
