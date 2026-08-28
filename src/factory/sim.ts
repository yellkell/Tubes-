/**
 * The sim — the factory's one heartbeat, pure of scene and speaker.
 *
 * Fixed-step in spirit (FactorySystem hands it scaled wall time): feeds
 * pour, makers drink and stamp, chutes push, belts carry, combiners fit,
 * the dock drinks and swallows and counts. Anything audible or visible
 * that HAPPENS here leaves as a PlantEvent; FactorySystem performs it.
 *
 * This file is also the plant's mutation library — placing and removing
 * units, retracting runs, delivering parts — so BuildSystem and
 * FactorySystem never reach into the records bare-handed, and the
 * headless walk drives the same doors the hands do.
 */

import { Vector3 } from 'three';
import {
  COMBINES,
  FACTORY,
  MAKES,
  UNITS,
  combineKey,
  type ItemId,
  type UnitType,
} from '../config.js';
import { CELL, cellCenter, cellInFloor, edgeInward, occupy, vacate } from '../floor/grid.js';
import { chestBonus, craftFactor, railFactor } from '../game/progress.js';
import {
  DIRS,
  beltPart,
  chestParts,
  chuteParts,
  orderSpec,
  plant,
  runSeatedAt,
  unitAtCell,
  unitById,
  type Part,
  type Rot,
  type Unit,
} from './state.js';

const _c = { x: 0, z: 0 };

/* ── where parts sit (the sim's word; FactorySystem renders it) ─────────── */

/** A part's world pose from its logical place. Hand parts are the one
 *  place the sim defers — FactorySystem pins those to the grip. */
export function partPose(part: Part, out: Vector3): Vector3 {
  const at = part.at;
  if (at.kind === 'loose') return out.set(at.x, at.y, at.z);
  if (at.kind === 'hand') return out; // caller pins it
  const unit = unitById(at.unit);
  if (!unit) return out.set(0, 0, 0);
  cellCenter(unit.i, unit.j, _c);
  const dir = DIRS[unit.rot];
  if (at.kind === 'chute') {
    const reach = CELL * 0.5 - 0.07 - at.slot * 0.13;
    return out.set(_c.x + dir.di * reach, UNITS.crate.benchTop + 0.045, _c.z + dir.dj * reach);
  }
  if (at.kind === 'belt') {
    const along = (part.p - 0.5) * CELL * 0.92;
    return out.set(_c.x + dir.di * along, UNITS.railTop + 0.05, _c.z + dir.dj * along);
  }
  if (at.kind === 'port') {
    const side = DIRS[portDir(unit, at.port)];
    const reach = CELL * 0.5 - 0.09;
    return out.set(_c.x + side.di * reach, UNITS.crate.benchTop + 0.045, _c.z + side.dj * reach);
  }
  // chest — a little stack on the crate's lid.
  return out.set(_c.x, UNITS.crate.benchTop + 0.05 + at.index * 0.05, _c.z);
}

/** A combiner port's world-facing direction index: port 0 sits left of
 *  OUT, port 1 right. */
export function portDir(unit: Unit, port: 0 | 1): Rot {
  return ((unit.rot + (port === 0 ? 3 : 1)) % 4) as Rot;
}

/**
 * THE GLAND SWIVELS. A unit's tube intake is a collar that ORBITS its
 * drum: hand it the point the tube is coming from and it swings round
 * to meet it, so a supply run is never refused for arriving on the
 * wrong side. (It used to be welded to the unit's back face, which made
 * every hookup a guessing game about which way the box was facing —
 * the whole "doorways, not keyholes" law, broken. Now the door turns to
 * face you.) With no `toward`, it rests on the back face.
 */
export function glandPose(unit: Unit, point: Vector3, normal: Vector3, toward?: Vector3): void {
  cellCenter(unit.i, unit.j, _c);
  let nx: number;
  let nz: number;
  const dx = toward ? toward.x - _c.x : 0;
  const dz = toward ? toward.z - _c.z : 0;
  const len = Math.hypot(dx, dz);
  if (toward && len > 1e-3) {
    nx = dx / len;
    nz = dz / len;
  } else {
    const back = DIRS[((unit.rot + 2) % 4) as Rot];
    nx = back.di;
    nz = back.dj;
  }
  const reach = UNITS.crate.size / 2;
  point.set(_c.x + nx * reach, UNITS.glandHeight, _c.z + nz * reach);
  normal.set(nx, 0, nz);
}

/* ── mutations (BuildSystem / FactorySystem / the walk drive these) ─────── */

export function unitAvailable(type: UnitType): boolean {
  // No shift live = site dressing (the floor walk stamps test crates
  // before any sheet is posted); a shift obeys its catalogue — and FREE
  // PLAY's catalogue is simply everything.
  if (plant.mode === 'idle') return true;
  return plant.unitsAvailable.includes(type);
}

export function dockUnit(): Unit | undefined {
  return plant.units.find((u) => u.type === 'dock');
}

/** WALL PLANT: these bolt to the site's edge and face inward. The dock
 *  is where the works reaches into the room, and the combiner wants its
 *  two feed sides clear — both read wrong marooned mid-floor. */
export const WALL_BOUND: readonly UnitType[] = ['dock', 'combiner'];

export function wallBound(type: UnitType): boolean {
  return WALL_BOUND.includes(type);
}

/** Where a unit of this type may stand, and facing which way: null when
 *  the cell refuses it. Wall plant takes the edge's inward direction and
 *  ignores the hand's aim; free plant keeps whatever it was given. */
export function placementFor(type: UnitType, i: number, j: number, rot: Rot): Rot | null {
  if (!cellInFloor(i, j)) return null;
  if (!wallBound(type)) return rot;
  return edgeInward(i, j);
}

/** Stand a unit on a cell. The catalogue and the lattice both get a vote. */
export function placeUnit(type: UnitType, i: number, j: number, rot: Rot): Unit | null {
  if (!unitAvailable(type)) return null;
  if (type === 'dock' && dockUnit()) return null;
  const facing = placementFor(type, i, j, rot);
  if (facing === null) return null;
  rot = facing;
  const id = plant.nextUnit;
  if (!occupy(i, j, id)) return null;
  plant.nextUnit++;
  const unit: Unit = { id, type, i, j, rot, craftT: -1, ports: [-1, -1] };
  plant.units.push(unit);
  plant.generation++;
  return unit;
}

/** Unbolt a unit: its seated run retracts, its parts spill loose. */
export function removeUnit(unit: Unit): void {
  const run = runSeatedAt(unit.id);
  if (run) retractRun(run);
  const spill = new Vector3();
  for (const part of plant.parts) {
    if (
      (part.at.kind === 'chute' || part.at.kind === 'port' || part.at.kind === 'chest' || part.at.kind === 'belt') &&
      part.at.unit === unit.id
    ) {
      partPose(part, spill);
      part.at = { kind: 'loose', x: spill.x, y: 0.05, z: spill.z };
      part.p = 0;
    }
  }
  vacate(unit.i, unit.j);
  plant.units.splice(plant.units.indexOf(unit), 1);
  plant.generation++;
}

/** Unseat a run: the tube telescopes home and the stub waits again. */
export function retractRun(run: (typeof plant.runs)[number]): void {
  run.phase = 'retract';
  run.phaseT = 0;
  run.held = false;
  run.magnet = false;
  run.targetUnit = -1;
  run.front = -1;
}

/** A part lands in the dock: the sheet counts it, or the bank does. */
export function deliverPart(part: Part): void {
  const spec = orderSpec();
  plant.parts.splice(plant.parts.indexOf(part), 1);
  if (spec && spec.target.kind === 'item' && spec.target.item === part.item && plant.count < spec.goal) {
    plant.count++;
    plant.events.push({ kind: 'deliver', item: part.item });
    if (plant.count >= spec.goal) plant.events.push({ kind: 'complete', order: plant.orderIndex });
  } else {
    plant.bank[part.item] = (plant.bank[part.item] ?? 0) + 1;
    plant.events.push({ kind: 'bank', item: part.item });
  }
}

function spawnPart(item: ItemId, unit: Unit): void {
  const slot = chuteParts(unit.id).length;
  plant.parts.push({ id: plant.nextPart++, item, at: { kind: 'chute', unit: unit.id, slot }, p: 0 });
  plant.events.push({ kind: 'craft', unit: unit.id, item });
}

/* ── the tick ───────────────────────────────────────────────────────────── */

export function simTick(dt: number): void {
  const spec = orderSpec();

  // THE FEEDS POUR. A flowing run into the dock's gland is a delivery of
  // fluid; into a maker it's the maker's appetite answered (read below).
  for (const run of plant.runs) {
    if (run.phase !== 'flowing') continue;
    const target = unitById(run.targetUnit);
    if (
      target?.type === 'dock' &&
      spec?.target.kind === 'fluid' &&
      spec.target.line === run.line.id &&
      plant.count < spec.goal
    ) {
      plant.fluidAcc += FACTORY.fluidRate * dt;
      while (plant.fluidAcc >= 1 && plant.count < spec.goal) {
        plant.fluidAcc -= 1;
        plant.count++;
        plant.events.push({ kind: 'deliver' });
        if (plant.count >= spec.goal) plant.events.push({ kind: 'complete', order: plant.orderIndex });
      }
    }
  }

  // MAKERS drink and stamp. QUICK BOXES (a paid fitting) shortens every
  // craft.
  const makerS = FACTORY.makerS * craftFactor();
  const combinerS = FACTORY.combinerS * craftFactor();
  for (const unit of plant.units) {
    if (unit.type !== 'maker') continue;
    const run = runSeatedAt(unit.id);
    const supplied = run?.phase === 'flowing';
    const space = chuteParts(unit.id).length < FACTORY.chuteSlots;
    if (unit.craftT < 0 && supplied && space) unit.craftT = 0;
    else if (unit.craftT >= 0) {
      if (supplied || unit.craftT > 0) unit.craftT += dt;
      if (unit.craftT >= makerS) {
        if (space && run) {
          spawnPart(MAKES[run.line.id], unit);
          unit.craftT = supplied ? 0 : -1;
        } else {
          unit.craftT = makerS; // done, waiting on the chute
        }
      }
    }
  }

  // COMBINERS fit two parts into one deeper one.
  for (const unit of plant.units) {
    if (unit.type !== 'combiner') continue;
    const a = unit.ports[0] >= 0 ? plant.parts.find((p) => p.id === unit.ports[0]) : undefined;
    const b = unit.ports[1] >= 0 ? plant.parts.find((p) => p.id === unit.ports[1]) : undefined;
    const out = a && b ? COMBINES[combineKey(a.item, b.item)] : undefined;
    const space = chuteParts(unit.id).length < FACTORY.chuteSlots;
    if (unit.craftT < 0 && out && space) unit.craftT = 0;
    else if (unit.craftT >= 0) {
      unit.craftT += dt;
      if (unit.craftT >= combinerS) {
        if (out && space && a && b) {
          plant.parts.splice(plant.parts.indexOf(a), 1);
          plant.parts.splice(plant.parts.indexOf(b), 1);
          unit.ports[0] = -1;
          unit.ports[1] = -1;
          spawnPart(out, unit);
          unit.craftT = -1;
        } else {
          unit.craftT = combinerS;
        }
      }
    }
  }

  // CHUTES push their front part into whatever stands ahead.
  for (const unit of plant.units) {
    if (unit.type !== 'maker' && unit.type !== 'combiner') continue;
    const queue = chuteParts(unit.id);
    const front = queue[0];
    if (!front) continue;
    const dir = DIRS[unit.rot];
    const ahead = unitAtCell(unit.i + dir.di, unit.j + dir.dj);
    if (ahead && acceptPart(front, ahead, unit.rot)) {
      // Re-pack the queue behind it.
      for (const p of queue.slice(1)) (p.at as { slot: number }).slot -= 1;
    }
  }

  // BELTS carry (BELT PACE quickens them), and hand off at each end.
  const railSpeed = FACTORY.railSpeed * railFactor();
  for (const part of [...plant.parts]) {
    if (part.at.kind !== 'belt') continue;
    const belt = unitById(part.at.unit);
    if (!belt) continue;
    part.p += (dt * railSpeed) / CELL;
    if (part.p < 1) continue;
    part.p = 1;
    const dir = DIRS[belt.rot];
    const ahead = unitAtCell(belt.i + dir.di, belt.j + dir.dj);
    if (ahead) acceptPart(part, ahead, belt.rot);
  }
}

/** Can `into` take this part arriving FROM travel direction `travel`?
 *  Performs the transfer when it can. */
function acceptPart(part: Part, into: Unit, travel: Rot): boolean {
  if (into.type === 'belt') {
    if (beltPart(into.id)) return false;
    part.at = { kind: 'belt', unit: into.id };
    part.p = 0;
    return true;
  }
  if (into.type === 'dock') {
    deliverPart(part);
    return true;
  }
  if (into.type === 'chest') {
    const held = chestParts(into.id);
    if (held.length >= FACTORY.chestCap + chestBonus()) return false;
    part.at = { kind: 'chest', unit: into.id, index: held.length };
    return true;
  }
  if (into.type === 'combiner') {
    // Only the two SIDE faces are ports: the part travels `travel`, so it
    // enters through the face opposite — valid when that face sits left
    // or right of the combiner's OUT.
    const enterFrom = ((travel + 2) % 4) as Rot; // the face it knocks on
    let port: 0 | 1 | null = null;
    if (enterFrom === portDir(into, 0)) port = 0;
    else if (enterFrom === portDir(into, 1)) port = 1;
    if (port === null) return false;
    if (into.ports[port] >= 0) return false;
    into.ports[port] = part.id;
    part.at = { kind: 'port', unit: into.id, port };
    return true;
  }
  return false; // makers drink fluid, not parts
}
