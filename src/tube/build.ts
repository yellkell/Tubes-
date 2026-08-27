/**
 * The hardware — flanges, sockets, telescoping segments, the collar. One
 * factory per piece, all of it built from a handful of SHARED unit
 * geometries scaled into place, so a full shift of plant is matrix
 * updates, not geometry churn.
 *
 * THE VIBES LIVE IN SILHOUETTE AND SURFACE, NOT IN EXTRA DRAWS. Each line
 * carries its identity three ways at zero cost: the radial segment count
 * of its plates (MAINS is eight-sided cast iron, COOLANT a smooth
 * machined disc, VOLT a six-sided conduit fitting), its PBR surface
 * (rough dark iron / brushed alloy / dark glass), and its light (the glow
 * rings, the pour, the collar's tell). Nobody counts bolts in passthrough;
 * everybody reads a hex plate as industrial from across the room.
 *
 * Draw budget per run: flange 3 + socket 4 + collar 3 + 8 segments × 2
 * shells (+ the pour volume only once the line charges) ≈ 26–34. Three
 * runs and the board sit comfortably inside a Quest AR frame.
 */

import {
  AdditiveBlending,
  CircleGeometry,
  CylinderGeometry,
  DoubleSide,
  Group,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  RingGeometry,
  TorusGeometry,
  type ShaderMaterial,
} from 'three';
import { FLOW, TUBE, type LineSpec } from '../config.js';
import { createFlowMaterial } from '../materials/flow.js';
import { segmentRadius } from './geometry.js';

/* ── shared unit geometries (scaled per use, never rebuilt) ─────────────── */

let _shellGeo: CylinderGeometry | null = null;
/** Unit shell: r=1, h=1, open-ended — every barrel and throat wears it. */
function shellGeo(): CylinderGeometry {
  return (_shellGeo ??= new CylinderGeometry(1, 1, 1, 18, 1, true));
}

let _pourGeo: CylinderGeometry | null = null;
/** Unit pour volume: capped, so the cut face has geometry to show. */
function pourGeo(): CylinderGeometry {
  return (_pourGeo ??= new CylinderGeometry(1, 1, 1, 14, 1));
}

const _plateGeos = new Map<number, CylinderGeometry>();
/** Unit plate: r=1, h=1, `sides` radial segments — the vibe's silhouette. */
function plateGeo(sides: number): CylinderGeometry {
  let geo = _plateGeos.get(sides);
  if (!geo) {
    geo = new CylinderGeometry(1, 1, 1, sides);
    _plateGeos.set(sides, geo);
  }
  return geo;
}

let _ringGeo: TorusGeometry | null = null;
/** Unit torus ring (r=1, tube 0.14) — collars, glands, grips. */
function ringGeo(): TorusGeometry {
  return (_ringGeo ??= new TorusGeometry(1, 0.14, 10, 24));
}

let _ribGeo: TorusGeometry | null = null;
/** The JOINT ring — deliberately slimmer than the collar stock (0.09 vs
 *  0.14): a joint band as fat as the grab ring chopped the pour into
 *  eight lit cells, and the whole point of the pour is that it reads as
 *  ONE column. Narrow bands, continuous light. */
function ribGeo(): TorusGeometry {
  return (_ribGeo ??= new TorusGeometry(1, 0.09, 10, 24));
}

let _glowRingGeo: RingGeometry | null = null;
/** Unit flat ring for additive glow halos on hardware faces. */
function glowRingGeo(): RingGeometry {
  return (_glowRingGeo ??= new RingGeometry(0.72, 1, 28));
}

let _discGeo: CircleGeometry | null = null;
function discGeo(): CircleGeometry {
  return (_discGeo ??= new CircleGeometry(1, 24));
}

/* ── shared per-line materials ──────────────────────────────────────────── */

interface LineMats {
  plate: MeshStandardMaterial;
  shell: MeshStandardMaterial;
  glow: MeshBasicMaterial; // template — cloned where opacity animates alone
}

const _mats = new Map<string, LineMats>();

function matsFor(line: LineSpec): LineMats {
  let m = _mats.get(line.id);
  if (m) return m;
  m = {
    plate: new MeshStandardMaterial({
      color: line.shell,
      roughness: line.roughness,
      metalness: line.metalness,
    }),
    // The frosted barrel the pour glows through. Depth-writing OFF so the
    // opaque pour renders first and the shell blends over it — the same
    // sort order the glowstick liquid taught us.
    shell: new MeshStandardMaterial({
      color: line.shell,
      roughness: Math.min(0.9, line.roughness + 0.15),
      metalness: line.metalness * 0.5,
      transparent: true,
      opacity: line.id === 'mains' ? 0.6 : line.id === 'coolant' ? 0.44 : 0.38,
      depthWrite: false,
    }),
    glow: new MeshBasicMaterial({
      color: line.glow,
      transparent: true,
      opacity: 0.5,
      blending: AdditiveBlending,
      depthWrite: false,
      side: DoubleSide,
    }),
  };
  _mats.set(line.id, m);
  return m;
}

/** The vibe's silhouette: plate sides per line. */
function sidesFor(line: LineSpec): number {
  return line.id === 'mains' ? 8 : line.id === 'coolant' ? 24 : 6;
}

/* ── the pieces ─────────────────────────────────────────────────────────── */

export interface FlangeRefs {
  group: Group;
  /** The idle halo — FlowSystem breathes it. */
  glowMat: MeshBasicMaterial;
  /** Where the tube leaves the wall (local +Z out of the plate). */
  mouthOffset: number;
}

/** The mount: base plate + gland ring + face halo. Local +Z faces the
 *  room; the group sits ON the wall (z=0 at the plaster). */
export function buildFlange(line: LineSpec): FlangeRefs {
  const m = matsFor(line);
  const group = new Group();
  const sides = sidesFor(line);
  const r = TUBE.rootRadius;

  const plate = new Mesh(plateGeo(sides), m.plate);
  plate.rotation.x = Math.PI / 2;
  plate.scale.set(r * 1.85, 0.045, r * 1.85);
  plate.position.z = 0.0225;
  group.add(plate);

  const gland = new Mesh(ringGeo(), m.plate);
  gland.scale.setScalar(r * 1.22);
  gland.position.z = 0.075;
  group.add(gland);

  const glowMat = m.glow.clone();
  glowMat.opacity = 0.32;
  const halo = new Mesh(glowRingGeo(), glowMat);
  halo.scale.setScalar(r * 1.7);
  halo.position.z = 0.052;
  halo.renderOrder = 12;
  group.add(halo);

  return { group, glowMat, mouthOffset: 0.075 };
}

export interface SocketRefs {
  group: Group;
  glowMat: MeshBasicMaterial;
  /** The dark iris disc — scales to zero as the tube arrives home. */
  iris: Mesh;
  /** The guide ring the magnet brightens (world-facing, additive). */
  guideMat: MeshBasicMaterial;
  /** Where the head seats (local +Z, metres off the wall). */
  seatOffset: number;
}

/** The answer on the far wall: plate + open throat + iris + guide ring. */
export function buildSocket(line: LineSpec): SocketRefs {
  const m = matsFor(line);
  const group = new Group();
  const sides = sidesFor(line);
  const r = TUBE.headRadius;

  const plate = new Mesh(plateGeo(sides), m.plate);
  plate.rotation.x = Math.PI / 2;
  plate.scale.set(r * 2.5, 0.04, r * 2.5);
  plate.position.z = 0.02;
  group.add(plate);

  // The throat: a short open barrel the head slides into.
  const throat = new Mesh(shellGeo(), m.plate);
  throat.rotation.x = Math.PI / 2;
  throat.scale.set(r * 1.45, 0.12, r * 1.45);
  throat.position.z = 0.08;
  group.add(throat);

  // The iris: a dark disc a hair inside the throat — the "closed" read.
  const irisMat = new MeshBasicMaterial({ color: 0x07070a });
  const iris = new Mesh(discGeo(), irisMat);
  iris.scale.setScalar(r * 1.3);
  iris.position.z = 0.045;
  group.add(iris);

  const glowMat = m.glow.clone();
  glowMat.opacity = 0.4;
  const halo = new Mesh(glowRingGeo(), glowMat);
  halo.scale.setScalar(r * 2.3);
  halo.position.z = 0.045;
  halo.renderOrder = 12;
  group.add(halo);

  // The guide: a wider ghost ring floating off the wall at the magnet's
  // reach — the "offer it up HERE" mark. FlowSystem breathes it while the
  // run is being worked and snaps it bright when the magnet takes.
  const guideMat = m.glow.clone();
  guideMat.opacity = 0.12;
  const guide = new Mesh(glowRingGeo(), guideMat);
  guide.scale.setScalar(r * 3.1);
  guide.position.z = 0.16;
  guide.renderOrder = 12;
  group.add(guide);

  return { group, glowMat, iris, guideMat, seatOffset: 0.1 };
}

export interface SegmentRefs {
  /** Frosted barrel (unit cylinder scaled: x/z radius, y length). */
  shell: Mesh;
  /** The joint collar at this section's outer end. */
  rib: Mesh;
  /** The pour volume inside (hidden until the line charges). */
  pour: Mesh;
  pourMat: ShaderMaterial;
}

/** One telescoping section: barrel + end collar + pour volume. All three
 *  are posed by TubeSystem every frame; nothing here owns a transform. */
export function buildSegment(line: LineSpec, index: number): SegmentRefs {
  const m = matsFor(line);
  const r = segmentRadius(index);

  const shell = new Mesh(shellGeo(), m.shell);
  shell.renderOrder = 8; // after the pour writes depth
  shell.scale.set(r, 1, r);

  const rib = new Mesh(ribGeo(), m.plate);
  rib.scale.setScalar(r * 1.1);

  const pourMat = createFlowMaterial(
    line.glow,
    line.deep,
    line.foam,
    line.pulseHz,
    line.chop,
    FLOW.frontBand,
  );
  const pour = new Mesh(pourGeo(), pourMat);
  pour.renderOrder = 4;
  pour.scale.set(r * 0.82, 1, r * 0.82);
  pour.visible = false;

  return { shell, rib, pour, pourMat };
}

export interface CollarRefs {
  group: Group;
  /** The end cap's centre light — the line's tell, and the magnet's. */
  capMat: MeshBasicMaterial;
  glowMat: MeshBasicMaterial;
}

/** The head collar — the two-hands handle. A fat ring, two grip bars
 *  (port and starboard, where hands naturally land), and the cap. */
export function buildCollar(line: LineSpec): CollarRefs {
  const m = matsFor(line);
  const group = new Group();
  const r = TUBE.headRadius;

  const ring = new Mesh(ringGeo(), m.plate);
  ring.scale.setScalar(r * 1.55);
  group.add(ring);

  // Grip bars: stubby cylinders along local X, one each side.
  for (const side of [-1, 1]) {
    const bar = new Mesh(plateGeo(10), m.plate);
    bar.rotation.z = Math.PI / 2;
    bar.scale.set(0.021, 0.16, 0.021);
    bar.position.x = side * (r * 1.55 + 0.08);
    group.add(bar);
  }

  // The cap: the tube's face, dark, with the line's light at its heart.
  const capMat = m.glow.clone();
  capMat.opacity = 0.55;
  const cap = new Mesh(discGeo(), capMat);
  cap.scale.setScalar(r * 0.9);
  cap.position.z = 0.012;
  cap.renderOrder = 12;
  group.add(cap);

  const glowMat = m.glow.clone();
  glowMat.opacity = 0.2;
  const halo = new Mesh(glowRingGeo(), glowMat);
  halo.scale.setScalar(r * 2.1);
  halo.renderOrder = 12;
  group.add(halo);

  return { group, capMat, glowMat };
}

export interface HologramRefs {
  group: Group;
  mat: MeshBasicMaterial;
  ringMat: MeshBasicMaterial;
}

/** The placement ghost: the flange's outline riding the reticle — additive,
 *  bodiless, unmistakably not-yet-real. */
export function buildHologram(line: LineSpec): HologramRefs {
  const group = new Group();
  const sides = sidesFor(line);
  const r = TUBE.rootRadius;
  const mat = new MeshBasicMaterial({
    color: line.glow,
    transparent: true,
    opacity: 0.2,
    blending: AdditiveBlending,
    depthWrite: false,
    wireframe: true,
  });
  const plate = new Mesh(plateGeo(sides), mat);
  plate.rotation.x = Math.PI / 2;
  plate.scale.set(r * 1.85, 0.045, r * 1.85);
  plate.position.z = 0.0225;
  group.add(plate);

  const ringMat = new MeshBasicMaterial({
    color: line.glow,
    transparent: true,
    opacity: 0.35,
    blending: AdditiveBlending,
    depthWrite: false,
    side: DoubleSide,
  });
  const reticle = new Mesh(glowRingGeo(), ringMat);
  reticle.scale.setScalar(r * 2.6);
  reticle.position.z = 0.006;
  reticle.renderOrder = 12;
  group.add(reticle);

  return { group, mat, ringMat };
}
