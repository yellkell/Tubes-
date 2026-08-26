/**
 * The fitter's record — which jobs are open and the best time each has
 * been worked in, kept in localStorage. It works with no network at all
 * because there is no network: TUBES is a shop, not a service.
 */

import { JOBS } from '../config.js';

const KEY = 'tubes-progress';

interface Stored {
  /** How many jobs are open (1 = just FIRST LIGHT). */
  unlocked: number;
  /** Best completion, ms, by job id. */
  best: Record<string, number>;
}

let stored: Stored = { unlocked: 1, best: {} };

(() => {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw) as Partial<Stored>;
    if (typeof parsed.unlocked === 'number' && parsed.unlocked >= 1) {
      stored.unlocked = Math.min(JOBS.length, Math.floor(parsed.unlocked));
    }
    if (parsed.best && typeof parsed.best === 'object') {
      for (const [id, ms] of Object.entries(parsed.best)) {
        if (typeof ms === 'number' && Number.isFinite(ms) && ms > 0) stored.best[id] = ms;
      }
    }
  } catch {
    /* fine — a fresh sheet */
  }
})();

function save(): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(stored));
  } catch {
    /* private mode — the shift still counts, it just won't keep */
  }
}

export function unlockedJobs(): number {
  return stored.unlocked;
}

export function bestMs(jobId: string): number | null {
  return stored.best[jobId] ?? null;
}

/** A job landed: keep the better time, open the next sheet. Returns true
 *  if this time is a new best. */
export function recordJobDone(jobId: string, ms: number): boolean {
  const jobIndex = JOBS.findIndex((j) => j.id === jobId);
  if (jobIndex >= 0) {
    stored.unlocked = Math.max(stored.unlocked, Math.min(JOBS.length, jobIndex + 2));
  }
  const prev = stored.best[jobId];
  const better = prev === undefined || ms < prev;
  if (better) stored.best[jobId] = Math.round(ms);
  save();
  return better;
}

/** SYSTEM tab: tear the sheet up and start the trade again. */
export function resetProgress(): void {
  stored = { unlocked: 1, best: {} };
  save();
}
