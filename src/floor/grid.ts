/**
 * THE GRID — the build lattice under the tape.
 *
 * Cells are a WORLD-ANCHORED lattice (multiples of FLOOR.cell off the
 * world origin), not an offset from the rectangle: dragging a side never
 * re-deals the cells under standing plant, so a crate keeps its cell for
 * life. The floor rectangle only decides which lattice cells are
 * IN BOUNDS right now.
 *
 * Occupancy lives here (cell → unit id), and every change re-reports the
 * plant's bounding rect to the floor plan — that's how "a side refuses
 * to cross a crate" stays true without the plan ever knowing what a
 * crate is.
 */

import { FLOOR } from '../config.js';
import { floorLayout, setPlantBounds } from './plan.js';

export const CELL = FLOOR.cell;

export interface Cell {
  i: number;
  j: number;
}

/** World plan point → the lattice cell under it. */
export function worldToCell(x: number, z: number): Cell {
  return { i: Math.floor(x / CELL), j: Math.floor(z / CELL) };
}

/** A cell's centre on the plan. */
export function cellCenter(i: number, j: number, out: { x: number; z: number }): void {
  out.x = (i + 0.5) * CELL;
  out.z = (j + 0.5) * CELL;
}

/** Is the WHOLE cell inside the tape? (A crate half over the line is a
 *  crate outside the site — the hologram only offers honest cells.) */
export function cellInFloor(i: number, j: number): boolean {
  const eps = 1e-3;
  return (
    i * CELL >= floorLayout.left - eps &&
    (i + 1) * CELL <= floorLayout.right + eps &&
    j * CELL >= floorLayout.far - eps &&
    (j + 1) * CELL <= floorLayout.near + eps
  );
}

/* ── occupancy ────────────────────────────────────────────────────────────── */

const occ = new Map<string, number>();
const key = (i: number, j: number): string => `${i},${j}`;

export function unitAt(i: number, j: number): number | undefined {
  return occ.get(key(i, j));
}

/** Claim a cell for a unit. False if it's taken. */
export function occupy(i: number, j: number, unitId: number): boolean {
  const k = key(i, j);
  if (occ.has(k)) return false;
  occ.set(k, unitId);
  reportBounds();
  return true;
}

/** Free a cell. False if it wasn't occupied. */
export function vacate(i: number, j: number): boolean {
  const gone = occ.delete(key(i, j));
  if (gone) reportBounds();
  return gone;
}

export function occupiedCells(): Cell[] {
  const cells: Cell[] = [];
  for (const k of occ.keys()) {
    const [i, j] = k.split(',').map(Number);
    cells.push({ i, j });
  }
  return cells;
}

export function occupiedCount(): number {
  return occ.size;
}

/** Tools and DOWN-TOOLS resets. */
export function clearGrid(): void {
  occ.clear();
  reportBounds();
}

/** The plant's bounding rect (cell EDGES, not centres) → the plan's
 *  side clamp. Null when the floor is empty. */
function reportBounds(): void {
  if (occ.size === 0) {
    setPlantBounds(null);
    return;
  }
  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  for (const k of occ.keys()) {
    const [i, j] = k.split(',').map(Number);
    minX = Math.min(minX, i * CELL);
    maxX = Math.max(maxX, (i + 1) * CELL);
    minZ = Math.min(minZ, j * CELL);
    maxZ = Math.max(maxZ, (j + 1) * CELL);
  }
  setPlantBounds({ minX, maxX, minZ, maxZ });
}
