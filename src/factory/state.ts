/**
 * The plant — the factory's shared mutable state, one plain singleton
 * (the `site` pattern, for the shop floor). Every factory system reads
 * and writes this; the SIM (factory/sim.ts) is the only thing that
 * advances it, and the sim never touches a mesh or a speaker — it
 * pushes EVENTS and FactorySystem plays them.
 *
 * A shift's plant lives exactly as long as the shift: STARTING an order
 * from the board deals a fresh floor, completing a sheet posts the next
 * one into the SAME plant (the factory persists and grows — law 9), and
 * DOWN TOOLS clears it.
 */

import { Vector3 } from 'three';
import {
  FACTORY,
  ORDERS,
  TUBE,
  type ItemId,
  type LineSpec,
  type OrderSpec,
  type UnitType,
} from '../config.js';
import type { FloorSide } from '../floor/plan.js';

/** Out-direction index: 0 = −Z, 1 = +X, 2 = +Z, 3 = −X (plan view). */
export type Rot = 0 | 1 | 2 | 3;
export const DIRS: ReadonlyArray<{ di: number; dj: number }> = [
  { di: 0, dj: -1 },
  { di: 1, dj: 0 },
  { di: 0, dj: 1 },
  { di: -1, dj: 0 },
];

export interface Unit {
  id: number;
  type: UnitType;
  i: number;
  j: number;
  /** The unit's OUT face (chute / belt travel). The gland lives on the
   *  opposite face; a combiner's ports on the two sides. */
  rot: Rot;
  /** Maker/combiner: seconds into the current craft (−1 = not crafting). */
  craftT: number;
  /** Combiner in-ports: a part id or −1, port 0 = left of OUT, 1 = right. */
  ports: [number, number];
}

/** One supply run off a feed's spout. Field names deliberately mirror
 *  RunState + RunHardware where the pull maths reads them — the factory
 *  pull is TubeSystem's verb, forked (see factory/pull.ts). */
export interface FactoryRun {
  side: FloorSide;
  line: LineSpec;
  phase: 'pull' | 'seated' | 'flowing' | 'retract';
  /** The spout (A) and, once the magnet takes, the gland (B). */
  pointA: Vector3;
  normalA: Vector3;
  pointB: Vector3;
  normalB: Vector3;
  /** The unit whose gland holds (or is taking) the head; −1 = none. */
  targetUnit: number;
  extension: number;
  head: Vector3;
  front: number;
  phaseT: number;
  /** The pull's live state (was RunHardware's). */
  held: boolean;
  magnet: boolean;
  aim: Vector3;
  aimOk: boolean;
  droop: number;
  droopVel: number;
  lastDetent: number;
  lastSections: number;
  rattleCool: number;
  strainCool: number;
  seatP: number;
  headVisual: Vector3;
  energy: number;
}

export type PartAt =
  | { kind: 'chute'; unit: number; slot: number }
  | { kind: 'belt'; unit: number }
  | { kind: 'port'; unit: number; port: 0 | 1 }
  | { kind: 'chest'; unit: number; index: number }
  | { kind: 'hand'; hand: 'left' | 'right' }
  | { kind: 'loose'; x: number; y: number; z: number };

export interface Part {
  id: number;
  item: ItemId;
  at: PartAt;
  /** Belt progress along the piece (0..1). */
  p: number;
}

/** One-shot happenings the sim reports and FactorySystem performs. */
export interface PlantEvent {
  kind: 'craft' | 'deliver' | 'bank' | 'complete' | 'post' | 'feed-wake';
  unit?: number;
  item?: ItemId;
  side?: FloorSide;
  order?: number;
}

export type PlantMode =
  | 'idle' // no shift — the board is up
  | 'order' // a sheet from the work book is live
  | 'free'; // FREE PLAY: every feed, every box, no one asking for ten

export interface Plant {
  /** What kind of shift this is. */
  mode: PlantMode;
  /** Index into ORDERS of the live sheet; −1 = free play or no shift. */
  orderIndex: number;
  /** Delivered toward the live sheet (fluid sheets count draughts). */
  count: number;
  /** Fluid accumulator (whole draughts peel off into `count`). */
  fluidAcc: number;
  units: Unit[];
  nextUnit: number;
  runs: FactoryRun[];
  parts: Part[];
  nextPart: number;
  /** Which feeds are awake (posted sheets wake them; PEARL never). */
  feedsAwake: Partial<Record<FloorSide, boolean>>;
  /** Build catalogue switched on by the sheets so far. */
  unitsAvailable: UnitType[];
  /** Banked surplus — every delivered non-target part. */
  bank: Partial<Record<ItemId, number>>;
  elapsedMs: number;
  /** Sim pace multiplier — the tools' fast-forward; play is 1. */
  timeScale: number;
  /** Bumped on any structural change; systems rebuild what they own. */
  generation: number;
  events: PlantEvent[];
}

export const plant: Plant = {
  mode: 'idle',
  orderIndex: -1,
  count: 0,
  fluidAcc: 0,
  units: [],
  nextUnit: 1,
  runs: [],
  parts: [],
  nextPart: 1,
  feedsAwake: {},
  unitsAvailable: [],
  bank: {},
  elapsedMs: 0,
  timeScale: 1,
  generation: 0,
  events: [],
};

export function orderSpec(): OrderSpec | null {
  return plant.orderIndex >= 0 && plant.orderIndex < ORDERS.length
    ? ORDERS[plant.orderIndex]
    : null;
}

export function unitById(id: number): Unit | undefined {
  return plant.units.find((u) => u.id === id);
}

export function unitAtCell(i: number, j: number): Unit | undefined {
  return plant.units.find((u) => u.i === i && u.j === j);
}

export function partById(id: number): Part | undefined {
  return plant.parts.find((p) => p.id === id);
}

export function runForSide(side: FloorSide): FactoryRun | undefined {
  return plant.runs.find((r) => r.side === side);
}

export function runSeatedAt(unitId: number): FactoryRun | undefined {
  return plant.runs.find(
    (r) => r.targetUnit === unitId && (r.phase === 'seated' || r.phase === 'flowing'),
  );
}

export function chuteParts(unitId: number): Part[] {
  return plant.parts
    .filter((p) => p.at.kind === 'chute' && p.at.unit === unitId)
    .sort((a, b) => (a.at as { slot: number }).slot - (b.at as { slot: number }).slot);
}

export function beltPart(unitId: number): Part | undefined {
  return plant.parts.find((p) => p.at.kind === 'belt' && p.at.unit === unitId);
}

export function chestParts(unitId: number): Part[] {
  return plant.parts.filter((p) => p.at.kind === 'chest' && p.at.unit === unitId);
}

export function bankTotal(): number {
  return Object.values(plant.bank).reduce((s, n) => s + (n ?? 0), 0);
}

/** A fresh spout run: the capped stub, straight out of the pillar. */
export function freshRun(side: FloorSide, line: LineSpec, spout: Vector3, normal: Vector3): FactoryRun {
  const head = spout.clone().addScaledVector(normal, TUBE.stubLength);
  return {
    side,
    line,
    phase: 'pull',
    pointA: spout.clone(),
    normalA: normal.clone(),
    pointB: new Vector3(),
    normalB: new Vector3(0, 0, 1),
    targetUnit: -1,
    extension: TUBE.stubLength,
    head,
    front: -1,
    phaseT: 0,
    held: false,
    magnet: false,
    aim: new Vector3(),
    aimOk: false,
    droop: 0,
    droopVel: 0,
    lastDetent: Math.floor(TUBE.stubLength / TUBE.detentPitch),
    lastSections: 1,
    rattleCool: 0,
    strainCool: 0,
    seatP: 0,
    headVisual: head.clone(),
    energy: 0,
  };
}

/** Clear the whole shift (DOWN TOOLS / the book closing). */
export function clearPlant(): void {
  plant.mode = 'idle';
  plant.orderIndex = -1;
  plant.count = 0;
  plant.fluidAcc = 0;
  plant.units = [];
  plant.runs = [];
  plant.parts = [];
  plant.feedsAwake = {};
  plant.unitsAvailable = [];
  plant.elapsedMs = 0;
  plant.timeScale = 1;
  plant.events.length = 0;
  plant.generation++;
}

/** Post a sheet into the live shift: wake its feeds, open its catalogue. */
export function postOrder(index: number): void {
  const spec = ORDERS[index];
  plant.mode = 'order';
  plant.orderIndex = index;
  plant.count = 0;
  plant.fluidAcc = 0;
  plant.elapsedMs = 0;
  for (const feedLine of spec.wakes.feeds ?? []) {
    for (const [side, line] of Object.entries(FACTORY.sides) as Array<
      [FloorSide, 'mains' | 'coolant' | 'volt' | null]
    >) {
      if (line === feedLine && !plant.feedsAwake[side]) {
        plant.feedsAwake[side] = true;
        plant.events.push({ kind: 'feed-wake', side });
      }
    }
  }
  for (const u of spec.wakes.units ?? []) {
    if (!plant.unitsAvailable.includes(u)) plant.unitsAvailable.push(u);
  }
  plant.events.push({ kind: 'post', order: index });
  plant.generation++;
}

/**
 * FREE PLAY — the shop with nobody asking for ten of anything. Every
 * feed is awake, every box is in the catalogue, and every delivery
 * simply BANKS. The work book teaches; this is where you just build,
 * and it is the mode most factory players end up living in.
 */
export function openFreeplay(): void {
  plant.mode = 'free';
  plant.orderIndex = -1;
  plant.count = 0;
  plant.fluidAcc = 0;
  plant.elapsedMs = 0;
  for (const [side, line] of Object.entries(FACTORY.sides) as Array<
    [FloorSide, 'mains' | 'coolant' | 'volt' | null]
  >) {
    if (line && !plant.feedsAwake[side]) {
      plant.feedsAwake[side] = true;
      plant.events.push({ kind: 'feed-wake', side });
    }
  }
  plant.unitsAvailable = ['dock', 'maker', 'belt', 'combiner', 'chest'];
  plant.generation++;
}
