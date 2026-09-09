#!/usr/bin/env node
/**
 * THE FULL SHIFT — every job on the sheet, worked end to end, headlessly.
 *
 *   npm run dev
 *   node tools/job-walk.mjs
 *
 * Boots the page in the desktop emulator, clocks in, forces the fallback
 * room (a tool shouldn't wait out the scan grace), then works the whole
 * ladder with the driven hands: mount the flange, wait out the wake, take
 * the collar, haul the head onto the socket, and let the magnet + pour do
 * what they do. Asserts every phase hand-off, the unlock chain, the best
 * times landing on the sheet, and the draw-call budget with three lines
 * flowing at once.
 *
 * Exits non-zero if any of it fails.
 */

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
await page.waitForTimeout(1200);

console.log('PLAY');
await page.click('#enter-ar');
await page.waitForFunction(() => document.body.classList.contains('app-entered'), { timeout: 15000 });
await page.waitForFunction(() => Boolean(window.__tubes?.site), { timeout: 10000 });
await page.waitForTimeout(600);

// The room: force the stand-in and make sure it stands — four walls
// plus the floor and the ceiling, every one a registry citizen.
await page.evaluate(() => window.__tubes.wallsInfo.forceFallback());
await page.waitForFunction(() => window.__tubes.site.wallsReady, { timeout: 5000 });
const kinds = await page.evaluate(() => window.__tubes.walls.map((w) => w.kind));
check(
  kinds.length === 6 &&
    kinds.filter((k) => k === 'wall').length === 4 &&
    kinds.includes('floor') &&
    kinds.includes('ceiling'),
  `fallback room stands in (${kinds.join(', ')})`,
);

// THE STAGE ROOM: a headset with its boundary drawn plays inside that
// box — stand one in and the registry becomes it (four faces on its
// edges, the floor and the ceiling trimmed to it, at the stand-in's
// heights since no scan answers here), the stand-in gone; lift it and
// the stand-in comes back for the rest of the walk.
await page.evaluate(() => window.__tubes.stage.force({ minX: -1.2, maxX: 1.4, minZ: -1.5, maxZ: 0.9 }));
await page.waitForFunction(() => window.__tubes.site.stageRoom, { timeout: 5000 });
const box = await page.evaluate(() =>
  window.__tubes.walls.map((w) => ({ kind: w.kind, real: w.real, x: w.center.x, y: w.center.y, z: w.center.z, hw: w.halfW, hh: w.halfH })),
);
const at = (a, b) => Math.abs(a - b) < 0.02;
const face = (axis, v) => box.some((w) => w.kind === 'wall' && at(w[axis], v));
check(
  box.length === 6 && box.every((w) => !w.real) && face('x', -1.2) && face('x', 1.4) && face('z', -1.5) && face('z', 0.9),
  `the room-scale box takes the registry (${box.map((w) => `${w.kind}@${w.x.toFixed(1)},${w.z.toFixed(1)}`).join(' ')})`,
);
const boxFloor = box.find((w) => w.kind === 'floor');
const boxCeil = box.find((w) => w.kind === 'ceiling');
check(
  boxFloor && boxCeil && at(boxFloor.y, 0) && at(boxCeil.y, 2.7) && at(boxFloor.hw, 1.3) && at(boxFloor.hh, 1.2),
  `the floor and the ceiling are trimmed to the box (floor ${boxFloor?.hw.toFixed(2)} × ${boxFloor?.hh.toFixed(2)} half-extents, ceiling at ${boxCeil?.y.toFixed(2)})`,
);
await page.evaluate(() => window.__tubes.stage.force(null));
await page.waitForFunction(() => !window.__tubes.site.stageRoom && window.__tubes.site.fallbackRoom, { timeout: 5000 });
const back = await page.evaluate(() => window.__tubes.walls.map((w) => w.kind));
check(back.length === 6 && back.filter((k) => k === 'wall').length === 4, `the box lifted, the stand-in room stands again (${back.join(', ')})`);

const phase = (i) => page.evaluate((idx) => window.__tubes.site.runs[idx]?.phase ?? 'gone', i);
const waitPhase = (i, want, timeout = 15000) =>
  page.waitForFunction(
    ({ idx, p }) => window.__tubes.site.runs[idx]?.phase === p,
    { idx: i, p: want },
    { timeout },
  );

/** Work one run: mount, wake, haul, seat — up to the pour landing. */
async function workRun(runIndex) {
  check((await phase(runIndex)) === 'place', `run ${runIndex}: flange on the ray`);

  // While the run is still placing: the floor and ceiling must refuse a
  // flange (they answer runs, they don't take mounts).
  if (runIndex === 0) {
    const floorMount = await page.evaluate(() => {
      const t = window.__tubes;
      const flat = t.walls.find((w) => w.kind !== 'wall');
      return flat ? t.place.mountAt(flat.id, 0, 0) : null;
    });
    if (floorMount !== null) {
      check(floorMount === false, `run ${runIndex}: floor/ceiling refuse the flange`);
    }
  }

  // Mount on a wall the picker can answer from (vary the wall per run so
  // multi-run jobs spread their hardware like a person would). Walls
  // only — flanges don't mount on the floor or the ceiling, and mountAt
  // enforces it, so the pick here filters by kind.
  const mounted = await page.evaluate((idx) => {
    const t = window.__tubes;
    const wallsOnly = t.walls.filter((w) => w.kind === 'wall');
    const wall = wallsOnly[idx % wallsOnly.length];
    return t.place.mountAt(wall.id, 0.2 * ((idx % 3) - 1), 0);
  }, runIndex);
  check(mounted, `run ${runIndex}: flange mounted`);

  await waitPhase(runIndex, 'wake', 4000).catch(() => {});
  const wakePhase = await phase(runIndex);
  check(wakePhase === 'wake' || wakePhase === 'pull', `run ${runIndex}: the room answers (${wakePhase})`);
  await waitPhase(runIndex, 'pull', 6000);
  check(true, `run ${runIndex}: on the hook`);

  const socket = await page.evaluate((idx) => {
    const r = window.__tubes.site.runs[idx];
    return {
      x: r.pointB.x + r.normalB.x * 0.1,
      y: r.pointB.y + r.normalB.y * 0.1,
      z: r.pointB.z + r.normalB.z * 0.1,
    };
  }, runIndex);

  const grabbed = await page.evaluate(() => window.__tubes.tube.grab());
  check(grabbed, `run ${runIndex}: collar taken (two driven hands)`);

  // Haul in a few strides — the spring, the ratchet and the stops all get
  // exercised on the way; the magnet takes the last stretch itself.
  const head = await page.evaluate((idx) => {
    const h = window.__tubes.site.runs[idx].head;
    return { x: h.x, y: h.y, z: h.z };
  }, runIndex);
  for (let step = 1; step <= 6; step++) {
    const t = step / 6;
    await page.evaluate(
      ({ from, to, k }) =>
        window.__tubes.tube.dragTo(
          from.x + (to.x - from.x) * k,
          from.y + (to.y - from.y) * k,
          from.z + (to.z - from.z) * k,
        ),
      { from: head, to: socket, k: t },
    );
    await page.waitForTimeout(220);
  }

  await waitPhase(runIndex, 'seated', 8000);
  check(true, `run ${runIndex}: latched home`);
  await waitPhase(runIndex, 'flowing', 8000);
  const front = await page.evaluate((idx) => window.__tubes.flow.progress()[idx], runIndex);
  check(front.front > front.length, `run ${runIndex}: the pour landed (front ${front.front.toFixed(1)}m)`);

  // THE POLYLINE LAW, measured off the scene: consecutive sections must
  // share their joint points exactly. A seated run carries a real bend
  // (the path sweeps into the socket's normal), so this is the law
  // under load, not the law on a straight pipe.
  const gap = await page.evaluate((idx) => window.__tubes.tube.jointGaps(idx), runIndex);
  check(gap !== null && gap < 0.002, `run ${runIndex}: no gaps at the joints (worst ${(gap * 1000).toFixed(2)}mm)`);
}

const JOBS = await page.evaluate(() =>
  window.__tubes.site ? window.__tubes.menu.boardButtons().filter((b) => b.startsWith('job:')).length : 0,
);
check(JOBS >= 1, `the board offers the ladder (${JOBS} job rows live)`);

// THE LADDER, top to bottom.
const jobRuns = [1, 1, 2, 2, 3];
for (let job = 0; job < jobRuns.length; job++) {
  await page.waitForFunction(() => window.__tubes.site.screen === 'board', undefined, { timeout: 15000 });
  const offered = await page.evaluate(() => window.__tubes.menu.boardButtons());
  check(offered.includes('start'), `job ${job + 1}: START JOB is live`);
  const onJob = await page.evaluate(() => window.__tubes.site.jobIndex);
  check(onJob === job, `job ${job + 1}: the board landed on the right sheet (${onJob})`);

  await page.evaluate(() => window.__tubes.menu.act('start'));
  await page.waitForFunction(() => window.__tubes.site.screen === 'shift', undefined, { timeout: 5000 });
  console.log(`JOB ${job + 1} — ${jobRuns[job]} run(s)`);

  const coachUp = () => page.evaluate(() => window.__tubes.menu.coachUp());

  if (job === 0) {
    // THE COACH LINE: the first sheet says its one sentence while the
    // flange rides the ray — and steps aside for the card.
    await page.waitForFunction(() => window.__tubes.menu.coachUp(), undefined, { timeout: 3000 }).catch(() => {});
    check(await coachUp(), 'FIRST LIGHT coaches the first flange');

    // THE JOB CARD, once: raise it, read what it offers, put it away.
    await page.evaluate(() => window.__tubes.menu.setPause(true));
    await page.waitForTimeout(400);
    check(!(await coachUp()), 'the coach line steps aside for the card');
    const cardButtons = await page.evaluate(() => window.__tubes.menu.cardButtons());
    check(
      cardButtons.includes('resume') && cardButtons.includes('quit'),
      `the JOB CARD offers its two honest buttons (${cardButtons.join(', ')})`,
    );
    await page.evaluate(() => window.__tubes.menu.act('resume'));
    await page.waitForFunction(() => !window.__tubes.site.paused, undefined, { timeout: 3000 });
    check(true, 'BACK TO IT puts the card away');
    await page.waitForFunction(() => window.__tubes.menu.coachUp(), undefined, { timeout: 3000 }).catch(() => {});
    check(await coachUp(), 'and the coach line comes back with the hands');
  }

  for (let r = 0; r < jobRuns[job]; r++) {
    await page.waitForFunction(
      (idx) => window.__tubes.site.runs[idx]?.phase === 'place',
      r,
      { timeout: 10000 },
    );
    // Only the first sheet coaches: by CROSSTOWN the flange on the ray
    // is the cue, and the room stays quiet.
    if (job === 1 && r === 0) check(!(await coachUp()), 'CROSSTOWN says nothing — the flange on the ray is the cue');
    await workRun(r);
    if (job === 0 && r === 0) check(!(await coachUp()), 'the coach line goes with the mount');
  }

  // SEATED LINES GIVE WAY TO EACH OTHER: on a multi-run job, no two
  // seated centrelines may come inside a bore of one another through
  // the middle of their runs (the fitting corridors at the ends are the
  // sockets' business), and every run still lands square on its socket
  // whatever it dodged. Measured off the drawn curves, dodge included.
  if (jobRuns[job] > 1) {
    const lines = await page.evaluate(() => {
      const t = window.__tubes;
      return t.site.runs.map((run, i) => ({
        curve: t.tube.runCurve(i, 48),
        n: { x: run.normalB.x, y: run.normalB.y, z: run.normalB.z },
      }));
    });
    const inner = (pts) => pts.slice(Math.floor(pts.length * 0.2), Math.ceil(pts.length * 0.8));
    let worst = Infinity;
    for (let i = 0; i < lines.length; i++) {
      for (let j = i + 1; j < lines.length; j++) {
        if (!lines[i].curve || !lines[j].curve) continue;
        for (const p of inner(lines[i].curve)) {
          for (const q of inner(lines[j].curve)) {
            worst = Math.min(worst, Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]));
          }
        }
      }
    }
    check(worst > 0.2, `job ${job + 1}: seated lines clear each other (closest ${worst.toFixed(2)} m)`);
    let steepest = 0;
    for (const l of lines) {
      if (!l.curve) continue;
      const [a, b] = [l.curve[l.curve.length - 2], l.curve[l.curve.length - 1]];
      const d = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
      const L = Math.hypot(...d) || 1;
      const cos = -(d[0] * l.n.x + d[1] * l.n.y + d[2] * l.n.z) / L;
      steepest = Math.max(steepest, (Math.acos(Math.max(-1, Math.min(1, cos))) * 180) / Math.PI);
    }
    // The bezier's own curvature over the last sample is worth 2–3° on
    // a steep run; the dodge's share is exactly zero, and 4 is the bar.
    check(steepest < 4, `job ${job + 1}: every line lands on its socket's axis (worst ${steepest.toFixed(1)}°)`);
  }

  await page.waitForFunction(() => window.__tubes.site.screen === 'ceremony', undefined, {
    timeout: 10000,
  });
  check(true, `job ${job + 1}: ceremony`);
  if (job === jobRuns.length - 1) {
    // FULL PRESSURE: three lines lit at once — the budget's worst frame.
    const info = await page.evaluate(() => window.__tubes.info());
    check(info && info.calls < 220, `draw budget holds at full pressure (${info?.calls} calls)`);
  }
  await page.waitForFunction(() => window.__tubes.site.screen === 'board', undefined, { timeout: 12000 });
}

// The sheet after the shift: everything open, every time on the board.
const sheet = await page.evaluate(() => ({
  unlocked: window.__tubes.menu.boardButtons().filter((b) => b.startsWith('job:')).length,
}));
check(sheet.unlocked === 5, `every sheet is open (${sheet.unlocked}/5)`);

// THE PORTS: sweep seeds through the REAL picker (start a job with a
// forced seed, mount, read where the room answered, walk away) and make
// sure every answer, whatever the surface, is one the fitter could
// actually finish: inside the magnet's alignment cone, because a port
// the magnet can't take is a port that never was — and inside the
// HANDS' REACH, because the fallback room's ceiling is 2.7 m and a
// socket up there is a job that cannot be done. The floor still takes
// its turn; the ceiling only answers in a room low enough to work.
const ports = await page.evaluate(() => {
  const t = window.__tubes;
  const seen = { wall: 0, floor: 0, ceiling: 0 };
  let misaligned = 0;
  let outOfReach = 0;
  let highest = 0;
  // The rig's own eye line, plus PORTS.overheadReach (0.72).
  const reachY = 1.6 + 0.72;
  const wallsOnly = t.walls.filter((w) => w.kind === 'wall');
  for (let seed = 1; seed <= 60; seed++) {
    t.startJob(0, seed);
    t.place.mountAt(wallsOnly[seed % wallsOnly.length].id, 0.3 * ((seed % 3) - 1), 0.1);
    const run = t.site.runs[0];
    const target = t.walls.find((w) => w.id === run.wallB);
    if (target) {
      seen[target.kind]++;
      highest = Math.max(highest, run.pointB.y);
      if (run.pointB.y > reachY) outOfReach++;
      const dx = run.pointB.x - run.pointA.x;
      const dy = run.pointB.y - run.pointA.y;
      const dz = run.pointB.z - run.pointA.z;
      const len = Math.hypot(dx, dy, dz);
      const align =
        -(dx * run.normalB.x + dy * run.normalB.y + dz * run.normalB.z) / len;
      if (align < 0.35) misaligned++;
    }
    t.abandonShift();
  }
  return { seen, misaligned, outOfReach, highest };
});
check(ports.seen.floor + ports.seen.ceiling > 0, `the room answers from overhead or underfoot sometimes (walls ${ports.seen.wall} · floor ${ports.seen.floor} · ceiling ${ports.seen.ceiling} / 60 seeds)`);
check(ports.seen.wall > ports.seen.floor + ports.seen.ceiling, 'walls still carry most of the shift');
check(ports.misaligned === 0, 'every answered port sits inside the magnet\'s cone');
check(
  ports.outOfReach === 0,
  `no port wakes above the hands (highest ${ports.highest.toFixed(2)}m of 2.32m)`,
);
check(
  ports.seen.ceiling === 0,
  `a 2.7m ceiling never answers (${ports.seen.ceiling} of 60 seeds)`,
);

await browser.close();
if (fails.length) {
  console.error(`\n${fails.length} FAILED:\n - ${fails.join('\n - ')}`);
  process.exit(1);
}
console.log('\nTHE WHOLE SHIFT WORKED.');
