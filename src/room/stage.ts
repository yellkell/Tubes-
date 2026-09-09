/**
 * THE STAGE — the headset's own room-scale box.
 *
 * A headset that has had its boundary drawn knows a rectangle of floor
 * it is happy for you to walk: WebXR hands it over as the `bounded-floor`
 * reference space's `boundsGeometry`. The game itself lives in
 * `local-floor` (you spawn at the origin facing −Z, and every wall,
 * flange and crate is measured from there), so this module asks the
 * session for the bounded space ON THE SIDE, reads its polygon once a
 * frame can pose the two spaces against each other, and folds the
 * corners into the game's frame as one axis-aligned box.
 *
 * That box is the room, for everything: the hazard tape deals itself
 * from it first (floor/plan.ts), and the wall registry becomes it —
 * four faces on its edges, the floor and the ceiling trimmed to it
 * (systems/WallSystem.ts) — so a job's flange and ports stand on the
 * boundary you already drew rather than on the scan's plaster beyond
 * it. No boundary — a stationary guardian, an emulator, a browser that
 * refuses the space — and `rect` settles to null, and the scan's walls
 * take their turn as before.
 *
 * A rotated boundary (drawn off-axis to the heading you entered on) gets
 * the box AROUND it, same honest v0 caveat as an off-axis scan: the drag
 * and the snap are how it comes home.
 */

import { Matrix4, Vector3 } from 'three';

export interface StageRect {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

export const stage = {
  /** The bounded-floor question has been answered, one way or the other
   *  (a session with no answer yet is not settled — the floor waits). */
  settled: false,
  /** The room-scale box in world x/z, or null when the headset drew none. */
  rect: null as StageRect | null,
};

/** Headless/dev hook (wired into __tubes in main.ts). */
export const stageView: {
  /** Stand in a box for the headset's (null lifts it) — the tools' way
   *  to walk the stage path on a desktop that has no boundary. */
  force?: (rect: StageRect | null) => void;
  state?: () => { settled: boolean; rect: StageRect | null };
} = {};

let forced: StageRect | null = null;
/** What the headset itself answered (null: nothing drawn) — restored
 *  when a forced box is lifted. */
let read: StageRect | null = null;
let seenSession: XRSession | null = null;
let boundedSpace: XRReferenceSpace | null = null;
let asked = false;
/** Frames spent waiting for a pose between the two spaces before we
 *  stop asking — a boundary that never poses is no boundary. */
let poseBudget = 0;

const _m = new Matrix4();
const _p = new Vector3();

stageView.force = (rect) => {
  forced = rect ? { ...rect } : null;
  if (forced) {
    stage.rect = { ...forced };
    stage.settled = true;
  } else {
    // Lifted: back to whatever the headset said (or is still saying).
    stage.rect = read ? { ...read } : null;
  }
};
stageView.state = () => ({ settled: stage.settled, rect: stage.rect ? { ...stage.rect } : null });

function resetForSession(session: XRSession | null): void {
  seenSession = session;
  boundedSpace = null;
  asked = false;
  poseBudget = 120;
  read = null;
  if (!forced) {
    stage.settled = false;
    stage.rect = null;
  }
}

/**
 * Called once a frame by the floor. Asks the session for its bounded
 * space the first time it sees one, then reads the box the first frame
 * it can. Cheap after that — one branch.
 */
export function pollStage(
  session: XRSession | null,
  frame: XRFrame | undefined,
  refSpace: XRReferenceSpace | null,
): void {
  if (session !== seenSession) resetForSession(session);
  if (forced) return;
  if (!session) {
    // Nothing to ask: a page outside the headset settles empty so the
    // floor never waits on an answer that can't come.
    stage.settled = true;
    return;
  }
  if (stage.settled) return;

  if (!asked) {
    asked = true;
    const s = session;
    s.requestReferenceSpace('bounded-floor').then(
      (space) => {
        if (s !== seenSession) return;
        boundedSpace = space;
      },
      () => {
        // The space is refused outright: no boundary to stand on.
        if (s !== seenSession) return;
        stage.settled = true;
      },
    );
    return;
  }
  if (!boundedSpace || !frame || !refSpace) return;

  const geom = (boundedSpace as Partial<XRBoundedReferenceSpace>).boundsGeometry;
  if (!geom || geom.length < 3) {
    // A bounded space with nothing drawn on it (a stationary boundary,
    // or the emulator's stand-in): the walls take their turn.
    stage.settled = true;
    return;
  }

  let pose: XRPose | null | undefined;
  try {
    pose = frame.getPose(boundedSpace, refSpace);
  } catch {
    pose = null;
  }
  if (!pose) {
    if (--poseBudget <= 0) stage.settled = true;
    return;
  }

  _m.fromArray(pose.transform.matrix);
  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  for (const c of geom) {
    _p.set(c.x, c.y, c.z).applyMatrix4(_m);
    minX = Math.min(minX, _p.x);
    maxX = Math.max(maxX, _p.x);
    minZ = Math.min(minZ, _p.z);
    maxZ = Math.max(maxZ, _p.z);
  }
  const ok = [minX, maxX, minZ, maxZ].every(Number.isFinite) && maxX - minX > 0.2 && maxZ - minZ > 0.2;
  read = ok ? { minX, maxX, minZ, maxZ } : null;
  stage.rect = read ? { ...read } : null;
  stage.settled = true;
}
