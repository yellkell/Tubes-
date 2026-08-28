/**
 * Shift flow — the only place screens change hands. These are plain state
 * mutations; the systems notice (`site.generation`, `site.screen`) and do
 * the physical work: PlacementSystem hands you the next flange,
 * TubeSystem builds the hardware, FlowSystem pours the light, MenuSystem
 * brings the board back with the sheet stamped.
 */

import { CEREMONY_S, JOBS, ORDERS, UPGRADES, type ItemId, type UpgradeId } from '../config.js';
import { freshSeed } from './rng.js';
import {
  loadBank,
  ordersUnlocked,
  recordJobDone,
  recordOrderDone,
  recordUpgrade,
  saveBank,
  unlockedJobs,
  upgradeOwned,
} from './progress.js';
import { buildRuns, site } from './state.js';
import { clearPlant, openShopFully, orderSpec, plant, postOrder } from '../factory/state.js';
import * as sfx from '../audio/sfx.js';

/** Clock in on a job. `seed` is for the tools — a layout replayed exactly. */
export function startJob(jobIndex: number, seed?: number): void {
  if (jobIndex < 0 || jobIndex >= JOBS.length || jobIndex >= unlockedJobs()) return;
  site.jobIndex = jobIndex;
  site.seed = seed ?? freshSeed();
  site.runs = buildRuns(JOBS[jobIndex]);
  site.activeRun = 0;
  site.elapsedMs = 0;
  site.ceremonyT = 0;
  site.screen = 'shift';
  site.fx.length = 0;
  site.generation++;
}

/** Down tools mid-shift (the JOB CARD's walk-away): everything mounted
 *  comes off the walls and the board takes over. */
export function abandonShift(): void {
  if (site.screen === 'board') return;
  site.runs = [];
  site.activeRun = -1;
  site.screen = 'board';
  site.fx.length = 0;
  sfx.stopAllHums();
  site.generation++;
}

/** A run's pour landed (FlowSystem calls this). Advance the shift: wake
 *  the next run's flange, or — last one down — start the ceremony. */
export function runLanded(runIndex: number): void {
  if (site.screen !== 'shift') return;
  const next = runIndex + 1;
  if (next < site.runs.length) {
    site.runs[next].phase = 'place';
    site.runs[next].phaseT = 0;
    site.activeRun = next;
    return;
  }
  // The last seat of the job — the room gets its moment before the board.
  site.activeRun = -1;
  site.screen = 'ceremony';
  site.ceremonyT = CEREMONY_S;
  site.fx.push({ kind: 'ceremony', runIndex });
  const job = JOBS[site.jobIndex];
  const newBest = recordJobDone(job.id, site.elapsedMs);
  sfx.stampDone();
  if (newBest) {
    /* the board will show the time in the accent — no popup needed */
  }
}

/* ── the factory (FACTORY.md phases 1–2) ─────────────────────────────────── */

/** OPEN THE SHOP. One entrance, one continuous session: the goals
 *  advance in place as you fill them and the catalogue grows with them,
 *  and when the book runs out the shop simply stays open. You never go
 *  back to the board for the next thing. The bank rides in from the
 *  shelf. */
export function startShop(index = 0): void {
  if (site.screen !== 'board') return;
  const at = Math.max(0, Math.min(index, ORDERS.length - 1, ordersUnlocked() - 1));
  clearPlant();
  plant.bank = loadBank();
  site.paused = false;
  site.screen = 'factory';
  postOrder(at);
  site.generation++;
}

/** DOWN TOOLS: the whole shift comes off the floor, the board returns.
 *  The bank keeps what it banked. */
export function abandonFactory(): void {
  if (site.screen !== 'factory') return;
  saveBank(plant.bank);
  clearPlant();
  site.screen = 'board';
  sfx.stopAllHums();
  site.generation++;
}

/** A goal filled (the sim's 'complete' event lands here): stamp it and
 *  post the next one INTO THE SAME SHIFT — the plant persists, the
 *  catalogue grows, and nothing kicks you out to a menu. The last goal
 *  simply opens the shop the rest of the way. */
export function orderComplete(): void {
  const spec = orderSpec();
  if (!spec || site.screen !== 'factory') return;
  recordOrderDone(spec.id, plant.elapsedMs);
  saveBank(plant.bank);
  const next = plant.orderIndex + 1;
  if (next < ORDERS.length) {
    postOrder(next);
    return;
  }
  openShopFully();
  sfx.stampDone();
  sfx.ceremonyChord();
}

/** Pay a bill: the fitting is bought with banked parts, kept for good,
 *  live the moment the stamp lands. False when the bank can't cover it
 *  (or it's already fitted). */
export function buyUpgrade(id: UpgradeId): boolean {
  const spec = UPGRADES.find((u) => u.id === id);
  if (!spec || upgradeOwned(id)) return false;
  for (const [item, n] of Object.entries(spec.bill)) {
    if ((plant.bank[item as ItemId] ?? 0) < (n ?? 0)) return false;
  }
  for (const [item, n] of Object.entries(spec.bill)) {
    plant.bank[item as ItemId] = (plant.bank[item as ItemId] ?? 0) - (n ?? 0);
  }
  recordUpgrade(id);
  saveBank(plant.bank);
  sfx.stampDone();
  return true;
}

/** THE FLOOR (FACTORY.md, phase 0): step off the board and mark the
 *  site out in hazard tape. FloorSystem owns the verb and the exit
 *  button; these own the screen change. */
export function enterFloorSetup(): void {
  if (site.screen !== 'board') return;
  site.screen = 'floor';
  site.generation++;
}

export function exitFloorSetup(): void {
  if (site.screen !== 'floor') return;
  site.screen = 'board';
  site.generation++;
}

/** Ceremony over: the hardware stays lit in memory, the board returns. */
export function ceremonyDone(): void {
  if (site.screen !== 'ceremony') return;
  site.runs = [];
  site.activeRun = -1;
  site.screen = 'board';
  sfx.stopAllHums();
  // Land the board on the next open sheet, ready to start.
  site.jobIndex = Math.min(unlockedJobs() - 1, JOBS.length - 1);
  site.generation++;
}
