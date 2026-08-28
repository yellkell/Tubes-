/**
 * Shift flow — the only place screens change hands. These are plain state
 * mutations; the systems notice (`site.generation`, `site.screen`) and do
 * the physical work: PlacementSystem hands you the next flange,
 * TubeSystem builds the hardware, FlowSystem pours the light, MenuSystem
 * brings the board back with the sheet stamped.
 */

import { CEREMONY_S, JOBS } from '../config.js';
import { freshSeed } from './rng.js';
import { recordJobDone, unlockedJobs } from './progress.js';
import { buildRuns, site } from './state.js';
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
