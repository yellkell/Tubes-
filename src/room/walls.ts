/**
 * The wall model — what the room scan becomes once the game can use it.
 *
 * WallSystem harvests WebXR planes (or builds the fallback room) into this
 * registry: each wall is a centre, a normal pointing INTO the room, a
 * right/up tangent basis, and half-extents. Everything downstream — the
 * placement reticle, the socket picker, the mount poses — reads walls
 * through here and never touches a raw XRPlane again.
 *
 * The maths lives in pure functions on purpose: the socket picker is the
 * one piece of the game that decides layout, so it has to be replayable
 * (seeded rng in, same answer out) and reasoned about away from a headset.
 */

import { Matrix4, Quaternion, Vector3 } from 'three';
import { RUN_RANGE, WALLS } from '../config.js';
import { mulberry32 } from '../game/rng.js';

export interface Wall {
  id: number;
  /** World centre of the face. */
  center: Vector3;
  /** Unit normal, INTO the room (the side hardware mounts on). */
  normal: Vector3;
  /** Unit tangents: `right` runs the wall's width, `up` climbs it
   *  (always tilted toward world up). */
  right: Vector3;
  up: Vector3;
  halfW: number;
  halfH: number;
  /** Scanned geometry, or the fallback room's stand-in. */
  real: boolean;
}

/** A spot on a wall, with everything a piece of hardware needs to mount. */
export interface WallSpot {
  wall: Wall;
  point: Vector3;
  normal: Vector3;
}

const _v = new Vector3();
const _w = new Vector3();

/** A wall big enough to bolt hardware to. */
export function usable(w: Wall): boolean {
  return (
    4 * w.halfW * w.halfH >= WALLS.minArea &&
    w.halfW > WALLS.edgeInset + 0.05 &&
    w.halfH > 0.2
  );
}

/** The wall-local (u, v) band hardware may occupy: u along `right`, v along
 *  `up`, both in metres from centre — edge-inset on all sides, and v
 *  further clamped so the point's world HEIGHT stays in the reach band. */
export function mountBand(w: Wall): { u: number; vLo: number; vHi: number } | null {
  const u = w.halfW - WALLS.edgeInset;
  let vLo = -w.halfH + WALLS.edgeInset;
  let vHi = w.halfH - WALLS.edgeInset;
  // World height along `up` (up.y is ~1 for real walls, exactly 1 for
  // fallback ones): clamp v so centreY + v·up.y lands inside the band.
  const upY = Math.max(0.35, w.up.y);
  vLo = Math.max(vLo, (WALLS.minHeight - w.center.y) / upY);
  vHi = Math.min(vHi, (WALLS.maxHeight - w.center.y) / upY);
  if (u <= 0.05 || vHi - vLo < 0.1) return null;
  return { u, vLo, vHi };
}

/** Wall-local (u, v) → world point on the face. */
export function pointOn(w: Wall, u: number, v: number, out = new Vector3()): Vector3 {
  return out.copy(w.center).addScaledVector(w.right, u).addScaledVector(w.up, v);
}

/** Clamp a world point (assumed near the face) into the mount band. */
export function clampToBand(w: Wall, point: Vector3, out = new Vector3()): Vector3 | null {
  const band = mountBand(w);
  if (!band) return null;
  _v.copy(point).sub(w.center);
  const u = Math.max(-band.u, Math.min(band.u, _v.dot(w.right)));
  const v = Math.max(band.vLo, Math.min(band.vHi, _v.dot(w.up)));
  return pointOn(w, u, v, out);
}

/** The orientation a piece of wall hardware wears: local +Z is the
 *  room-facing normal, +Y climbs the face — so "forward" is out of the
 *  wall and every flange stands upright on it. */
export function mountQuaternion(w: Wall, out = new Quaternion()): Quaternion {
  return out.setFromRotationMatrix(_basis.makeBasis(w.right, w.up, w.normal));
}

const _basis = new Matrix4();

/**
 * THE ANSWER FROM THE WALLS — where the socket wakes for a fresh mount.
 *
 * Sampled, filtered, scored: candidate spots are drawn across every OTHER
 * usable wall, kept only if the straight run from the mount lands inside
 * RUN_RANGE, then scored — long-haul jobs want the farthest honest spot,
 * ordinary jobs want a middle-distance one, and every job prefers a spot
 * the flange roughly faces (a tube can bend, but a socket BEHIND the
 * flange's wall reads as a trick, and TUBES doesn't do tricks). The pick
 * is the best-scoring sample with a seeded jitter among the top few, so
 * reruns differ but a tool's fixed seed replays exactly.
 *
 * Returns null only when no other wall offers a legal spot — the caller
 * falls back to sharing the mount wall (a same-wall run is legal when the
 * room gives us nothing better; it still needs the range check).
 */
export function pickSocket(
  allWalls: Wall[],
  mountWall: number,
  mountPoint: Vector3,
  mountNormal: Vector3,
  seed: number,
  longHaul: boolean,
): WallSpot | null {
  const rng = mulberry32(seed);
  const spots: Array<{ spot: WallSpot; score: number }> = [];

  const consider = (w: Wall, samples: number): void => {
    const band = mountBand(w);
    if (!band) return;
    for (let i = 0; i < samples; i++) {
      const u = (rng() * 2 - 1) * band.u;
      const v = band.vLo + rng() * (band.vHi - band.vLo);
      const p = pointOn(w, u, v, new Vector3());
      const dist = _w.copy(p).sub(mountPoint).length();
      if (dist < RUN_RANGE.min || dist > RUN_RANGE.max) continue;
      _w.normalize();
      // In front of the mount's face (never behind its own wall)…
      const facing = _w.dot(mountNormal);
      if (facing < 0.05) continue;
      // …and the socket's face must see the mount back.
      if (_v.copy(mountPoint).sub(p).normalize().dot(w.normal) < 0.05) continue;
      const span = RUN_RANGE.max - RUN_RANGE.min;
      const reach = (dist - RUN_RANGE.min) / span;
      const score =
        (longHaul ? reach : 1 - Math.abs(reach - 0.45) * 1.6) + facing * 0.35 + rng() * 0.18;
      spots.push({ spot: { wall: w, point: p, normal: w.normal.clone() }, score });
    }
  };

  for (const w of allWalls) {
    if (w.id === mountWall || !usable(w)) continue;
    consider(w, 14);
  }
  // The room gave us nothing across the way — offer the mount's own wall
  // (far end of it) rather than refusing the job.
  if (spots.length === 0) {
    const own = allWalls.find((w) => w.id === mountWall);
    if (own) consider(own, 20);
  }
  if (spots.length === 0) return null;
  spots.sort((a, b) => b.score - a.score);
  return spots[0].spot;
}

/**
 * The fallback room — four synthetic walls around the player, aligned to
 * their facing, when no scan answers (desktop emulator, a headset without
 * room setup). Synthetic walls are honest registry citizens: everything
 * downstream works identically, it just can't see the plaster.
 */
export function buildFallbackRoom(
  centerX: number,
  centerZ: number,
  yaw: number,
  nextId: number,
): Wall[] {
  const { w, d, h } = WALLS.fallback;
  const cos = Math.cos(yaw);
  const sin = Math.sin(yaw);
  const fwd = new Vector3(-sin, 0, -cos); // yaw 0 faces −Z
  const side = new Vector3(cos, 0, -sin);
  const up = new Vector3(0, 1, 0);
  const mid = h / 2;
  const make = (offset: Vector3, normal: Vector3, halfW: number, id: number): Wall => {
    const center = new Vector3(centerX, mid, centerZ).add(offset);
    const right = new Vector3().crossVectors(up, normal).normalize();
    return {
      id,
      center,
      normal: normal.clone().normalize(),
      right,
      up: up.clone(),
      halfW,
      halfH: mid,
      real: false,
    };
  };
  return [
    make(fwd.clone().multiplyScalar(d / 2), fwd.clone().negate(), w / 2, nextId),
    make(fwd.clone().multiplyScalar(-d / 2), fwd.clone(), w / 2, nextId + 1),
    make(side.clone().multiplyScalar(w / 2), side.clone().negate(), d / 2, nextId + 2),
    make(side.clone().multiplyScalar(-w / 2), side.clone(), d / 2, nextId + 3),
  ];
}
