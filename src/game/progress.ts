/**
 * The fitter's record — which jobs are open and the best time each has
 * been worked in, kept in localStorage. It works with no network at all
 * because there is no network: TUBES is a shop, not a service.
 */

import { JOBS, ORDERS, type ItemId } from '../config.js';

const KEY = 'tubes-progress';

interface Stored {
  /** How many jobs are open (1 = just FIRST LIGHT). */
  unlocked: number;
  /** Best completion, ms, by job id. */
  best: Record<string, number>;
  /** The factory's book: sheets open, best per sheet, the banked parts. */
  orders: number;
  orderBest: Record<string, number>;
  bank: Record<string, number>;
}

let stored: Stored = { unlocked: 1, best: {}, orders: 1, orderBest: {}, bank: {} };

function readTimes(into: Record<string, number>, from: unknown): void {
  if (!from || typeof from !== 'object') return;
  for (const [id, ms] of Object.entries(from)) {
    if (typeof ms === 'number' && Number.isFinite(ms) && ms > 0) into[id] = ms;
  }
}

(() => {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw) as Partial<Stored>;
    if (typeof parsed.unlocked === 'number' && parsed.unlocked >= 1) {
      stored.unlocked = Math.min(JOBS.length, Math.floor(parsed.unlocked));
    }
    readTimes(stored.best, parsed.best);
    if (typeof parsed.orders === 'number' && parsed.orders >= 1) {
      stored.orders = Math.min(ORDERS.length, Math.floor(parsed.orders));
    }
    readTimes(stored.orderBest, parsed.orderBest);
    if (parsed.bank && typeof parsed.bank === 'object') {
      for (const [item, n] of Object.entries(parsed.bank)) {
        if (typeof n === 'number' && Number.isFinite(n) && n > 0) stored.bank[item] = Math.floor(n);
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

/* ── the factory's book ──────────────────────────────────────────────────── */

export function ordersUnlocked(): number {
  return stored.orders;
}

export function orderBestMs(orderId: string): number | null {
  return stored.orderBest[orderId] ?? null;
}

/** A sheet filled: keep the better time, open the next page. */
export function recordOrderDone(orderId: string, ms: number): boolean {
  const idx = ORDERS.findIndex((o) => o.id === orderId);
  if (idx >= 0) {
    stored.orders = Math.max(stored.orders, Math.min(ORDERS.length, idx + 2));
  }
  const prev = stored.orderBest[orderId];
  const better = prev === undefined || ms < prev;
  if (better) stored.orderBest[orderId] = Math.round(ms);
  save();
  return better;
}

/** The bank lives on the shelf between shifts. */
export function loadBank(): Partial<Record<ItemId, number>> {
  return { ...(stored.bank as Partial<Record<ItemId, number>>) };
}

export function saveBank(bank: Partial<Record<ItemId, number>>): void {
  const clean: Record<string, number> = {};
  for (const [item, n] of Object.entries(bank)) {
    if (typeof n === 'number' && n > 0) clean[item] = Math.floor(n);
  }
  stored.bank = clean;
  save();
}

/** SYSTEM tab: tear the sheet up and start the trade again. */
export function resetProgress(): void {
  stored = { unlocked: 1, best: {}, orders: 1, orderBest: {}, bank: {} };
  save();
}
