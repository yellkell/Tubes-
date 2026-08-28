/**
 * The plant's hardware — bench units, feed pillars, and the parts
 * themselves. Same economy as tube/build.ts: a handful of shared unit
 * geometries scaled into place, silhouette and surface carrying the
 * identity, hairlines and one amber accent carrying the chrome.
 *
 * Everything here BUILDS; FactorySystem poses and animates. The gland
 * (a unit's tube intake) deliberately mirrors the socket's anatomy —
 * ring, open throat, iris, guide — because to the pull it IS a socket,
 * just one that stands on legs.
 */

import {
  AdditiveBlending,
  BoxGeometry,
  CircleGeometry,
  CylinderGeometry,
  DoubleSide,
  EdgesGeometry,
  Group,
  LineBasicMaterial,
  LineSegments,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  RingGeometry,
  TorusGeometry,
  Color,
} from 'three';
import { FACTORY, LINES, UNITS, type ItemId, type LineSpec, type UnitType } from '../config.js';
import { ITEMS } from '../config.js';

/* ── shared geometry / materials ────────────────────────────────────────── */

let _box: BoxGeometry | null = null;
const boxGeo = (): BoxGeometry => (_box ??= new BoxGeometry(1, 1, 1));
let _boxEdges: EdgesGeometry | null = null;
const boxEdges = (): EdgesGeometry => (_boxEdges ??= new EdgesGeometry(boxGeo()));
let _cyl: CylinderGeometry | null = null;
const cylGeo = (): CylinderGeometry => (_cyl ??= new CylinderGeometry(1, 1, 1, 12));
let _openCyl: CylinderGeometry | null = null;
const openCylGeo = (): CylinderGeometry => (_openCyl ??= new CylinderGeometry(1, 1, 1, 18, 1, true));
let _torus: TorusGeometry | null = null;
const torusGeo = (): TorusGeometry => (_torus ??= new TorusGeometry(1, 0.13, 10, 24));
let _ring: RingGeometry | null = null;
const ringGeo = (): RingGeometry => (_ring ??= new RingGeometry(0.72, 1, 28));
let _disc: CircleGeometry | null = null;
const discGeo = (): CircleGeometry => (_disc ??= new CircleGeometry(1, 24));

const ironMat = new MeshStandardMaterial({ color: 0x3a332c, roughness: 0.5, metalness: 0.8 });
const ironOpenMat = new MeshStandardMaterial({
  color: 0x35302a,
  roughness: 0.5,
  metalness: 0.8,
  side: DoubleSide,
});
const railMat = new MeshStandardMaterial({ color: 0x2b2622, roughness: 0.55, metalness: 0.75 });
const edgeMat = new LineBasicMaterial({ color: 0xffa22e, transparent: true, opacity: 0.35 });
const chevronMat = new MeshBasicMaterial({
  color: 0xffa22e,
  transparent: true,
  opacity: 0.35,
  blending: AdditiveBlending,
  depthWrite: false,
  side: DoubleSide,
});
const irisMat = new MeshBasicMaterial({ color: 0x07070a });

/** A bench box on a leg — every unit's chassis. Returns the box mesh so
 *  callers can hang details off its faces. */
function bench(group: Group, height = UNITS.crate.height, size = UNITS.crate.size): Mesh {
  const { benchTop, legRadius } = UNITS.crate;
  const box = new Mesh(boxGeo(), ironMat);
  box.scale.set(size, height, size);
  box.position.y = benchTop - height / 2;
  group.add(box);
  const frame = new LineSegments(boxEdges(), edgeMat);
  frame.scale.copy(box.scale);
  frame.position.copy(box.position);
  group.add(frame);
  const leg = new Mesh(cylGeo(), ironMat);
  const legH = benchTop - height;
  leg.scale.set(legRadius, legH, legRadius);
  leg.position.y = legH / 2;
  group.add(leg);
  return box;
}

/* ── the gland: the socket's anatomy on a bench ─────────────────────────── */

export interface GlandRefs {
  group: Group;
  guideMat: MeshBasicMaterial;
  glowMat: MeshBasicMaterial;
  iris: Mesh;
  /** Where the head seats (local +Z, metres off the face). */
  seatOffset: number;
}

/** Neutral until a line arrives — FactorySystem tints glow + guide from
 *  the seated run. Local +Z faces outward (the pull approaches along it). */
export function buildGland(): GlandRefs {
  const group = new Group();
  const r = 0.058; // the head's radius — the bore it takes

  const rim = new Mesh(torusGeo(), ironMat);
  rim.scale.setScalar(r * 1.45);
  rim.position.z = 0.1;
  group.add(rim);

  const throat = new Mesh(openCylGeo(), ironOpenMat);
  throat.rotation.x = Math.PI / 2;
  throat.scale.set(r * 1.45, 0.1, r * 1.45);
  throat.position.z = 0.05;
  group.add(throat);

  const iris = new Mesh(discGeo(), irisMat);
  iris.scale.setScalar(r * 1.3);
  iris.position.z = 0.03;
  group.add(iris);

  const glowMat = new MeshBasicMaterial({
    color: 0xfff0dc,
    transparent: true,
    opacity: 0.18,
    blending: AdditiveBlending,
    depthWrite: false,
    side: DoubleSide,
  });
  const halo = new Mesh(ringGeo(), glowMat);
  halo.scale.setScalar(r * 2.1);
  halo.position.z = 0.035;
  halo.renderOrder = 12;
  group.add(halo);

  const guideMat = glowMat.clone();
  guideMat.opacity = 0.1;
  const guide = new Mesh(ringGeo(), guideMat);
  guide.scale.setScalar(r * 3.1);
  guide.position.z = 0.14;
  guide.renderOrder = 12;
  group.add(guide);

  return { group, guideMat, glowMat, iris, seatOffset: 0.08 };
}

/* ── units ──────────────────────────────────────────────────────────────── */

export interface UnitRefs {
  group: Group;
  gland: GlandRefs | null;
  /** Maker/combiner: the craft lamp FactorySystem pulses. */
  lampMat: MeshBasicMaterial | null;
}

function chuteTray(group: Group): void {
  const tray = new Mesh(boxGeo(), railMat);
  tray.scale.set(0.16, 0.012, 0.16);
  tray.position.set(0, UNITS.crate.benchTop + 0.006, UNITS.crate.size / 2 + 0.05);
  group.add(tray);
}

function craftLamp(group: Group): MeshBasicMaterial {
  const lampMat = new MeshBasicMaterial({
    color: 0xffa22e,
    transparent: true,
    opacity: 0.2,
    blending: AdditiveBlending,
    depthWrite: false,
  });
  const lamp = new Mesh(cylGeo(), lampMat);
  lamp.scale.set(0.02, 0.01, 0.02);
  lamp.position.set(0, UNITS.crate.benchTop + 0.005, 0);
  group.add(lamp);
  return lampMat;
}

/** All builders face OUT along local +Z; FactorySystem rotates per rot. */
export function buildUnit(type: UnitType): UnitRefs {
  const group = new Group();
  let gland: GlandRefs | null = null;
  let lampMat: MeshBasicMaterial | null = null;

  if (type === 'dock') {
    const box = bench(group, 0.42);
    void box;
    // The hopper mouth: an open ring on the lid — parts go IN here.
    const mouth = new Mesh(torusGeo(), ironMat);
    mouth.rotation.x = Math.PI / 2;
    mouth.scale.setScalar(0.1);
    mouth.position.y = UNITS.crate.benchTop + 0.012;
    group.add(mouth);
    gland = buildGland();
  } else if (type === 'maker') {
    bench(group);
    chuteTray(group);
    lampMat = craftLamp(group);
    gland = buildGland();
  } else if (type === 'combiner') {
    bench(group, 0.34);
    chuteTray(group);
    lampMat = craftLamp(group);
    // Port trays on the two sides.
    for (const side of [-1, 1]) {
      const tray = new Mesh(boxGeo(), railMat);
      tray.scale.set(0.16, 0.012, 0.16);
      tray.position.set(side * (UNITS.crate.size / 2 + 0.05), UNITS.crate.benchTop + 0.006, 0);
      group.add(tray);
    }
  } else if (type === 'belt') {
    // A rail piece: two side skids at rail height on one slim leg,
    // chevrons pointing the way.
    const leg = new Mesh(cylGeo(), railMat);
    leg.scale.set(0.014, UNITS.railTop, 0.014);
    leg.position.y = UNITS.railTop / 2;
    group.add(leg);
    for (const side of [-1, 1]) {
      const skid = new Mesh(boxGeo(), railMat);
      skid.scale.set(0.03, 0.02, 0.35);
      skid.position.set(side * 0.075, UNITS.railTop, 0);
      group.add(skid);
    }
    for (let c = 0; c < 2; c++) {
      const chev = new Mesh(discGeo(), chevronMat);
      chev.rotation.x = -Math.PI / 2;
      chev.scale.setScalar(0.03);
      chev.position.set(0, UNITS.railTop - 0.004, -0.08 + c * 0.16);
      group.add(chev);
    }
  } else {
    // chest — the phase-0 crate, grown an open rim.
    bench(group);
    const rim = new Mesh(torusGeo(), ironMat);
    rim.rotation.x = Math.PI / 2;
    rim.scale.setScalar(0.11);
    rim.position.y = UNITS.crate.benchTop + 0.01;
    group.add(rim);
  }

  if (gland) {
    // On the BACK face (local −Z), facing backward — where the tube
    // arrives from.
    gland.group.position.set(0, UNITS.glandHeight, -UNITS.crate.size / 2 - 0.01);
    gland.group.rotation.y = Math.PI;
    group.add(gland.group);
  }
  return { group, gland, lampMat };
}

/* ── the feeds ──────────────────────────────────────────────────────────── */

export interface FeedRefs {
  group: Group;
  /** The pillar's halo — dormant dim, awake breathing. */
  glowMat: MeshBasicMaterial;
  /** Where the spout's tube leaves (local +Z, off the pillar face). */
  mouthOffset: number;
  awakeVisual: boolean;
}

/** A manifold pillar wearing its line's plate language (or PEARL's quiet
 *  reserve). Local +Z faces INTO the floor; the spout sits at
 *  FACTORY.spoutHeight. */
export function buildFeed(line: LineSpec | null): FeedRefs {
  const group = new Group();
  const sides = line ? (line.id === 'mains' ? 8 : line.id === 'coolant' ? 24 : 6) : 16;
  const shell = new MeshStandardMaterial({
    color: line ? line.shell : 0x4a463e,
    roughness: line ? line.roughness : 0.4,
    metalness: line ? line.metalness : 0.7,
  });

  const pillar = new Mesh(new CylinderGeometry(1, 1, 1, sides), shell);
  pillar.scale.set(0.11, 1.35, 0.11);
  pillar.position.y = 0.675;
  group.add(pillar);

  const cap = new Mesh(new CylinderGeometry(1, 1, 1, sides), shell);
  cap.scale.set(0.135, 0.05, 0.135);
  cap.position.y = 1.375;
  group.add(cap);

  // The spout plate on the room-facing face.
  const plate = new Mesh(new CylinderGeometry(1, 1, 1, sides), shell);
  plate.rotation.x = Math.PI / 2;
  plate.scale.set(0.16, 0.04, 0.16);
  plate.position.set(0, FACTORY.spoutHeight, 0.12);
  group.add(plate);

  const gland = new Mesh(torusGeo(), shell);
  gland.scale.setScalar(0.105);
  gland.position.set(0, FACTORY.spoutHeight, 0.155);
  group.add(gland);

  const glowMat = new MeshBasicMaterial({
    color: line ? line.glow : 0xe8e2d6,
    transparent: true,
    opacity: line ? 0.25 : 0.08,
    blending: AdditiveBlending,
    depthWrite: false,
    side: DoubleSide,
  });
  const halo = new Mesh(ringGeo(), glowMat);
  halo.scale.setScalar(0.15);
  halo.position.set(0, FACTORY.spoutHeight, 0.145);
  halo.renderOrder = 12;
  group.add(halo);

  if (!line) {
    // PEARL sleeps: a shut iris where a spout would be.
    const shut = new Mesh(discGeo(), irisMat);
    shut.scale.setScalar(0.07);
    shut.position.set(0, FACTORY.spoutHeight, 0.141);
    group.add(shut);
  }

  return { group, glowMat, mouthOffset: 0.17, awakeVisual: false };
}

/* ── the parts ──────────────────────────────────────────────────────────── */

const _partGeos = new Map<ItemId, CylinderGeometry>();
const _partMats = new Map<ItemId, MeshStandardMaterial>();

/** Silhouette per item: the lineage's plate language in the hand. */
export function partGeometry(item: ItemId): CylinderGeometry {
  let geo = _partGeos.get(item);
  if (geo) return geo;
  const make = (r: number, h: number, sides: number): CylinderGeometry =>
    new CylinderGeometry(r, r, h, sides);
  geo =
    item === 'gear'
      ? make(0.055, 0.032, 8)
      : item === 'cell'
        ? make(0.04, 0.078, 20)
        : item === 'chip'
          ? make(0.05, 0.018, 6)
          : item === 'pump'
            ? make(0.055, 0.082, 8)
            : item === 'lamp'
              ? make(0.042, 0.09, 20)
              : make(0.055, 0.045, 6); // servo
  _partGeos.set(item, geo);
  return geo;
}

export function partMaterial(item: ItemId): MeshStandardMaterial {
  let mat = _partMats.get(item);
  if (mat) return mat;
  const spec = ITEMS[item];
  const body = LINES[spec.lineage[0]];
  const light = LINES[spec.lineage[spec.lineage.length - 1]];
  mat = new MeshStandardMaterial({
    color: body.shell,
    roughness: body.roughness,
    metalness: body.metalness,
    emissive: new Color(light.glow),
    emissiveIntensity: spec.tier === 2 ? 0.5 : 0.28,
  });
  _partMats.set(item, mat);
  return mat;
}
