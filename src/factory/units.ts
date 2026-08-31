/**
 * The plant's hardware — bench units, feed pillars, and the parts.
 *
 * THE SECOND CUT: EVERY BOX WAS A DRUM.
 *
 * The first floor was built out of cylinders — a drum for the maker, a
 * drum for the bank, a round pillar for every feed, a torus for every
 * mouth — and playtest called it exactly right: it read as a steam
 * museum, not a factory. Round is the shape of a boiler, a vat, a
 * pressure vessel: things that HOLD. A shop floor is the other trade
 * entirely — plate steel cut square, folded, bolted and braced, because
 * everything on it is a thing that WORKS.
 *
 * So the whole catalogue was re-cut from flat stock, and three rules
 * carry it:
 *
 *  1. SQUARE STOCK, BOLTED. Chassis are boxes; hoppers are four-sided
 *     frustums (a folded funnel, not a spun one); every heavy joint
 *     wears a row of hex bolt heads and every big span wears a gusset.
 *     One curved thing survives per machine at most, and only where a
 *     curve does a job (a roller, a bolt head, the vat's own glass).
 *  2. SILHOUETTE FIRST, AND IN THREE DIMENSIONS. Not just a different
 *     plan shape — a different HEIGHT and a different mass. The MAKER
 *     is a tall press with a ram between two columns; the BANK is a low
 *     armoured strongbox with a wide throat; the COMBINER is a squat
 *     wide H with two hoppers; the CHEST is a slatted pallet crate; the
 *     RAIL is a low slatted deck on stubby legs; the VAT is the tallest
 *     thing in the room and the only one made of glass. Read across the
 *     floor at four metres, in passthrough, they are four different
 *     answers to "what is that".
 *  3. AMBER IS INFORMATION. Edge hairlines, lamps, chevrons, hazard
 *     bands — the accent goes only where the machine is telling you
 *     something. Painted-on trim is what makes a model look like a toy.
 *
 * Everything here BUILDS; FactorySystem poses and animates. The gland
 * (a unit's tube intake) deliberately mirrors the socket's anatomy —
 * ring, open throat, iris, guide — because to the pull it IS a socket,
 * just one that stands on legs. And only a MAKER and the VAT wear one:
 * the bank stopped taking tubes when the book stopped asking for
 * draughts, and a bank that caught the tube you were walking past it
 * was the single most-cursed magnet in the game.
 */

import {
  AdditiveBlending,
  BoxGeometry,
  BufferGeometry,
  CanvasTexture,
  CircleGeometry,
  CylinderGeometry,
  DoubleSide,
  EdgesGeometry,
  Float32BufferAttribute,
  Group,
  LineBasicMaterial,
  LineSegments,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  PlaneGeometry,
  Quaternion,
  RepeatWrapping,
  RingGeometry,
  SRGBColorSpace,
  Vector3,
} from 'three';
import { FACTORY, LINES, UNITS, type ItemId, type LineSpec, type UnitType } from '../config.js';

/* ── shared geometry ────────────────────────────────────────────────────── */

let _box: BoxGeometry | null = null;
const boxGeo = (): BoxGeometry => (_box ??= new BoxGeometry(1, 1, 1));
let _boxEdges: EdgesGeometry | null = null;
const boxEdges = (): EdgesGeometry => (_boxEdges ??= new EdgesGeometry(boxGeo()));
let _openCyl: CylinderGeometry | null = null;
const openCylGeo = (): CylinderGeometry => (_openCyl ??= new CylinderGeometry(1, 1, 1, 14, 1, true));
let _ring: RingGeometry | null = null;
const ringGeo = (): RingGeometry => (_ring ??= new RingGeometry(0.72, 1, 20));
let _disc: CircleGeometry | null = null;
const discGeo = (): CircleGeometry => (_disc ??= new CircleGeometry(1, 16));

/** N-sided prisms, cached. Four sides is a folded box; six is a bolt
 *  head; more than eight is a curve and we mean it when we ask for one. */
const _sideGeos = new Map<number, CylinderGeometry>();
function sided(sides: number): CylinderGeometry {
  let geo = _sideGeos.get(sides);
  if (!geo) {
    geo = new CylinderGeometry(1, 1, 1, sides);
    _sideGeos.set(sides, geo);
  }
  return geo;
}

/** A four-sided FRUSTUM — the folded hopper. `top`/`bottom` are half-
 *  widths across the flats; unit height, scaled by the caller. Four
 *  panels of cut plate, which is how a real hopper is made. */
const _frusta = new Map<string, CylinderGeometry>();
function hopperGeo(top: number, bottom: number): CylinderGeometry {
  const key = `${top}:${bottom}`;
  let geo = _frusta.get(key);
  if (!geo) {
    // A 4-sided cylinder's "radius" is corner-to-centre; ×√2 makes the
    // number mean half-width across the flats, which is how anyone
    // reading these call sites will think about it.
    geo = new CylinderGeometry(top * Math.SQRT2, bottom * Math.SQRT2, 1, 4, 1, true);
    geo.rotateY(Math.PI / 4);
    _frusta.set(key, geo);
  }
  return geo;
}

/** A right-triangle prism — the GUSSET, the one part that says "somebody
 *  welded this". Unit: 1 along +x, 1 up +y, 1 thick in z, corner at the
 *  origin. */
let _gusset: BufferGeometry | null = null;
function gussetGeo(): BufferGeometry {
  if (_gusset) return _gusset;
  const g = new BufferGeometry();
  const v: number[] = [];
  const tri = (
    ax: number, ay: number, az: number,
    bx: number, by: number, bz: number,
    cx: number, cy: number, cz: number,
  ): void => {
    v.push(ax, ay, az, bx, by, bz, cx, cy, cz);
  };
  // Two triangular faces…
  tri(0, 0, 0.5, 1, 0, 0.5, 0, 1, 0.5);
  tri(0, 0, -0.5, 0, 1, -0.5, 1, 0, -0.5);
  // …and the three rectangular sides.
  tri(0, 0, -0.5, 1, 0, -0.5, 1, 0, 0.5);
  tri(0, 0, -0.5, 1, 0, 0.5, 0, 0, 0.5);
  tri(0, 0, -0.5, 0, 0, 0.5, 0, 1, 0.5);
  tri(0, 0, -0.5, 0, 1, 0.5, 0, 1, -0.5);
  tri(1, 0, -0.5, 0, 1, -0.5, 0, 1, 0.5);
  tri(1, 0, -0.5, 0, 1, 0.5, 1, 0, 0.5);
  g.setAttribute('position', new Float32BufferAttribute(v, 3));
  g.computeVertexNormals();
  _gusset = g;
  return g;
}

/** A flat triangle pointing along +z — the chevron, the flag, the arrow.
 *  Unit width and length, lying in the xz plane. */
let _tri: BufferGeometry | null = null;
function triangleGeo(): BufferGeometry {
  if (_tri) return _tri;
  const g = new BufferGeometry();
  g.setAttribute(
    'position',
    new Float32BufferAttribute([-0.5, 0, -0.5, 0.5, 0, -0.5, 0, 0, 0.5], 3),
  );
  g.computeVertexNormals();
  _tri = g;
  return g;
}

/* ── shared materials ───────────────────────────────────────────────────── */

/**
 * FLAT SHADING IS THE WHOLE POINT. Every material below shades flat, and
 * that one flag is what turns a low-poly prism from a smooth pipe into
 * cut plate: an eight-sided column with smoothed normals IS a cylinder
 * to the eye, however few sides it really has — which is exactly how the
 * first floor ended up reading as a boiler house while the code was full
 * of eights and sixes. Boxes look identical either way; every prism,
 * hopper and bolt head gains a hard facet edge. It is free, and it is
 * the single biggest difference between these two passes.
 */

/** Shop iron: the chassis stock everything is cut from. */
const ironMat = new MeshStandardMaterial({
  color: 0x3a332c,
  roughness: 0.5,
  metalness: 0.8,
  flatShading: true,
});
/** The same stock, two-sided — for open geometry (hoppers, throats). */
const ironOpenMat = new MeshStandardMaterial({
  color: 0x35302a,
  roughness: 0.5,
  metalness: 0.8,
  side: DoubleSide,
  flatShading: true,
});
/** Dark machined stock: bolts, rams, clamps, bands — the moving and the
 *  fastening. A step darker than the chassis so detail reads as detail. */
const hubMat = new MeshStandardMaterial({
  color: 0x231e19,
  roughness: 0.45,
  metalness: 0.85,
  flatShading: true,
});
/** Rail stock: cooler and flatter, so a lane reads as a different trade
 *  from the boxes it joins. */
const railMat = new MeshStandardMaterial({
  color: 0x2b2622,
  roughness: 0.55,
  metalness: 0.75,
  flatShading: true,
});
/** Guard steel: the pale plate on wear faces — anvils, throat linings. */
const wearMat = new MeshStandardMaterial({
  color: 0x565049,
  roughness: 0.32,
  metalness: 0.9,
  flatShading: true,
});
const edgeMat = new LineBasicMaterial({ color: 0xffa22e, transparent: true, opacity: 0.35 });
const irisMat = new MeshBasicMaterial({ color: 0x07070a });
/** The vat's glass — the ONE transparent surface in the catalogue. */
const glassMat = new MeshStandardMaterial({
  color: 0x0d2b1c,
  roughness: 0.06,
  metalness: 0.1,
  transparent: true,
  opacity: 0.34,
  side: DoubleSide,
});

/** A flat additive marking (chevrons, hazard flashes, lamp faces). */
function markMat(color = 0xffa22e, opacity = 0.35): MeshBasicMaterial {
  return new MeshBasicMaterial({
    color,
    transparent: true,
    opacity,
    blending: AdditiveBlending,
    depthWrite: false,
    side: DoubleSide,
  });
}
const chevronMat = markMat(0xffa22e, 0.35);

/* ── the fabricator's little verbs ──────────────────────────────────────── */

/** A cut plate. Every chassis in the shop is a stack of these. */
function plate(
  group: Group,
  w: number,
  h: number,
  d: number,
  x: number,
  y: number,
  z: number,
  mat: MeshStandardMaterial = ironMat,
): Mesh {
  const m = new Mesh(boxGeo(), mat);
  m.scale.set(w, h, d);
  m.position.set(x, y, z);
  group.add(m);
  return m;
}

/** An amber hairline round a plate — the chrome, and the only place the
 *  accent is allowed to be decorative. */
function outline(group: Group, of: Mesh): void {
  const frame = new LineSegments(boxEdges(), edgeMat);
  frame.scale.copy(of.scale);
  frame.position.copy(of.position);
  frame.quaternion.copy(of.quaternion);
  group.add(frame);
}

/** A row of hex bolt heads along a face. `axis` is 'x' or 'z'; the heads
 *  stand proud along `outward` (a unit vector component). Bolts are the
 *  cheapest possible "this was fabricated" signal and there is no reason
 *  to be shy with them. */
function boltRow(
  group: Group,
  count: number,
  from: [number, number, number],
  to: [number, number, number],
  face: 'x' | 'y' | 'z',
  outward: number,
): void {
  const r = UNITS.boltR;
  for (let i = 0; i < count; i++) {
    const t = count === 1 ? 0.5 : i / (count - 1);
    const bolt = new Mesh(sided(6), hubMat);
    bolt.scale.set(r, r * 0.62, r);
    bolt.position.set(
      from[0] + (to[0] - from[0]) * t,
      from[1] + (to[1] - from[1]) * t,
      from[2] + (to[2] - from[2]) * t,
    );
    if (face === 'x') bolt.rotation.z = (Math.PI / 2) * -Math.sign(outward || 1);
    else if (face === 'z') bolt.rotation.x = (Math.PI / 2) * Math.sign(outward || 1);
    group.add(bolt);
  }
}

/** A welded brace under a span. `size` is the leg length, `thick` the
 *  plate thickness; `flip` mirrors it about x. */
function gusset(
  group: Group,
  size: number,
  thick: number,
  x: number,
  y: number,
  z: number,
  rotY = 0,
  flip = false,
): void {
  const m = new Mesh(gussetGeo(), hubMat);
  m.scale.set(flip ? -size : size, size, thick);
  m.position.set(x, y, z);
  m.rotation.y = rotY;
  group.add(m);
}

/** A hazard flash: a short amber bar on a face. Not a stripe texture —
 *  a bar of light, which survives passthrough at four metres. */
function flash(group: Group, w: number, h: number, x: number, y: number, z: number, ry = 0): void {
  const m = new Mesh(new PlaneGeometry(w, h), chevronMat);
  m.position.set(x, y, z);
  m.rotation.y = ry;
  m.renderOrder = 11;
  group.add(m);
}

/** A four-legged pedestal under a chassis: square-section legs with a
 *  foot plate, so nothing in the shop looks like it is hovering. */
function legs(group: Group, span: number, top: number, thick = 0.022): void {
  const h = span / 2;
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      plate(group, thick, top, thick, sx * h, top / 2, sz * h, hubMat);
    }
  }
  plate(group, span + thick * 2, 0.012, span + thick * 2, 0, 0.006, 0, hubMat);
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

/**
 * Neutral until a line arrives — FactorySystem tints glow + guide from
 * the seated run. Local +Z faces outward (the pull approaches along it).
 *
 * The gland keeps its round throat on purpose: it is a BORE, the one
 * place on the machine where something round has to fit, and the square
 * flange plate bolted round it is what tells you the rest of the box is
 * plate steel.
 */
export function buildGland(): GlandRefs {
  const group = new Group();
  const r = 0.058; // the head's radius — the bore it takes

  // The bolted flange plate: square stock, hex bolts at the corners.
  const face = plate(group, r * 3.4, r * 3.4, 0.022, 0, 0, 0.096, wearMat);
  outline(group, face);
  for (const sx of [-1, 1]) {
    boltRow(
      group,
      2,
      [sx * r * 1.32, -r * 1.32, 0.112],
      [sx * r * 1.32, r * 1.32, 0.112],
      'z',
      1,
    );
  }

  const throat = new Mesh(openCylGeo(), ironOpenMat);
  throat.rotation.x = Math.PI / 2;
  throat.scale.set(r * 1.2, 0.12, r * 1.2);
  throat.position.z = 0.04;
  group.add(throat);

  const iris = new Mesh(discGeo(), irisMat);
  iris.scale.setScalar(r * 1.15);
  iris.position.z = 0.02;
  group.add(iris);

  const glowMat = markMat(0xfff0dc, 0.18);
  const halo = new Mesh(ringGeo(), glowMat);
  halo.scale.setScalar(r * 1.5);
  halo.position.z = 0.109;
  halo.renderOrder = 12;
  group.add(halo);

  // THE GUIDE — a square bracket, not a ring: four corner ticks that read
  // as a target the moment a collar is loose anywhere on the floor.
  const guideMat = markMat(0xfff0dc, 0.1);
  const guide = new Group();
  const reach = r * 2.9;
  const arm = r * 1.1;
  for (const sx of [-1, 1]) {
    for (const sy of [-1, 1]) {
      const h = new Mesh(new PlaneGeometry(arm, 0.008), guideMat);
      h.position.set(sx * (reach - arm / 2), sy * reach, 0);
      guide.add(h);
      const v = new Mesh(new PlaneGeometry(0.008, arm), guideMat);
      v.position.set(sx * reach, sy * (reach - arm / 2), 0);
      guide.add(v);
    }
  }
  guide.position.z = 0.13;
  guide.traverse((o) => {
    o.renderOrder = 12;
  });
  group.add(guide);

  return { group, guideMat, glowMat, iris, seatOffset: 0.08 };
}

/* ── the rail tread (shared, scrolling) ─────────────────────────────────── */

let _treadTex: CanvasTexture | null = null;
let _treadMat: MeshBasicMaterial | null = null;
const TREAD_SLAT = 0.06; // metres of belt per texture repeat

function treadMaterial(): MeshBasicMaterial {
  if (_treadMat) return _treadMat;
  const canvas = document.createElement('canvas');
  canvas.width = 32;
  canvas.height = 32;
  const g = canvas.getContext('2d')!;
  g.fillStyle = '#17120e';
  g.fillRect(0, 0, 32, 32);
  g.fillStyle = '#2f272096'.slice(0, 7);
  g.fillStyle = '#2f271e';
  g.fillRect(0, 0, 32, 9); // the slat
  g.fillStyle = '#0b0806';
  g.fillRect(0, 9, 32, 3); // its shadow line
  g.fillStyle = 'rgba(255,162,46,0.20)';
  g.fillRect(0, 0, 32, 2); // the lit leading edge
  _treadTex = new CanvasTexture(canvas);
  _treadTex.wrapT = RepeatWrapping;
  _treadTex.colorSpace = SRGBColorSpace;
  _treadMat = new MeshBasicMaterial({ map: _treadTex, toneMapped: false });
  return _treadMat;
}

/** EVERY rail shares one tread texture, so one offset scroll moves the
 *  whole floor's slats — each piece's rotation carries its direction.
 *  FactorySystem feeds this the sim's own (scaled) speed. */
export function tickBeltTread(delta: number, speed: number): void {
  if (!_treadTex) return;
  _treadTex.offset.y = (_treadTex.offset.y + (delta * speed) / TREAD_SLAT) % 1;
}

/* ── units ──────────────────────────────────────────────────────────────── */

export interface UnitRefs {
  group: Group;
  gland: GlandRefs | null;
  /** Maker/combiner: the craft lamp FactorySystem pulses. */
  lampMat: MeshBasicMaterial | null;
  /** The working part — the maker's ram, the combiner's clamp —
   *  FactorySystem drives it while a craft runs. */
  anim: { mesh: Mesh; baseY: number; travel: number } | null;
  /** The bank's delivery halo — breathes, and flashes when one lands. */
  halo: MeshBasicMaterial | null;
  /** The vat's brew: the level mesh that rises, and its glow. */
  fill: { mesh: Mesh; mat: MeshStandardMaterial; top: number; floor: number } | null;
  vatGlow: MeshBasicMaterial | null;
}

/** The lip a finished part slides out onto — angled plate, a lit edge. */
function chuteLip(group: Group): void {
  const z = UNITS.crate.size / 2 + 0.045;
  const lip = plate(group, 0.15, 0.01, 0.15, 0, UNITS.crate.benchTop + 0.004, z, railMat);
  lip.rotation.x = -0.12;
  const cheekL = plate(group, 0.012, 0.026, 0.15, -0.078, UNITS.crate.benchTop + 0.014, z, railMat);
  const cheekR = plate(group, 0.012, 0.026, 0.15, 0.078, UNITS.crate.benchTop + 0.014, z, railMat);
  void cheekL;
  void cheekR;
  flash(group, 0.13, 0.006, 0, UNITS.crate.benchTop + 0.012, z + 0.072);
}

/** The craft lamp — a rectangular lens on the machine's crown, not a
 *  glowing pill. FactorySystem pulses its opacity while work runs. */
function craftLamp(group: Group, y: number, z = 0): MeshBasicMaterial {
  const lampMat = markMat(0xffa22e, 0.2);
  const lens = new Mesh(new PlaneGeometry(0.064, 0.014), lampMat);
  lens.position.set(0, y, z);
  lens.renderOrder = 12;
  group.add(lens);
  const housing = plate(group, 0.078, 0.02, 0.016, 0, y, z - 0.008, hubMat);
  void housing;
  return lampMat;
}

/**
 * All builders face OUT along local +Z; FactorySystem rotates per rot.
 * EVERY ROLE ITS OWN SILHOUETTE, in plan AND in profile — see the file
 * header for why that is the whole design.
 */
export function buildUnit(type: UnitType): UnitRefs {
  const group = new Group();
  const { benchTop, size } = UNITS.crate;
  let gland: GlandRefs | null = null;
  let lampMat: MeshBasicMaterial | null = null;
  let anim: UnitRefs['anim'] = null;
  let halo: MeshBasicMaterial | null = null;
  let fill: UnitRefs['fill'] = null;
  let vatGlow: MeshBasicMaterial | null = null;

  if (type === 'dock') {
    /* THE BANK — a low armoured strongbox with a wide folded throat.
     * Nothing about it moves and nothing about it is tall: it is the one
     * machine on the floor whose whole job is to be a hole that parts go
     * into and never come out of, and it is built like a safe. */
    const bodyH = 0.4;
    const bodyY = benchTop - 0.1 - bodyH / 2;
    legs(group, 0.22, bodyY - bodyH / 2);
    const body = plate(group, 0.29, bodyH, 0.29, 0, bodyY, 0);
    outline(group, body);
    // Corner armour, standing proud of the body on all four uprights.
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) {
        plate(group, 0.036, bodyH + 0.01, 0.036, sx * 0.135, bodyY, sz * 0.135, hubMat);
      }
    }
    // Bolt rows down the front face, and the deposit plate between them.
    boltRow(group, 4, [-0.105, bodyY + 0.14, 0.148], [0.105, bodyY + 0.14, 0.148], 'z', 1);
    boltRow(group, 4, [-0.105, bodyY - 0.14, 0.148], [0.105, bodyY - 0.14, 0.148], 'z', 1);
    const label = plate(group, 0.17, 0.075, 0.008, 0, bodyY, 0.149, wearMat);
    outline(group, label);
    flash(group, 0.14, 0.008, 0, bodyY - 0.026, 0.155);
    // THE THROAT: a folded four-panel hopper opening upward, its mouth
    // wider than the box under it, so from across the floor the bank
    // reads as a funnel with a safe bolted under it.
    const hopper = new Mesh(hopperGeo(0.145, 0.075), ironOpenMat);
    hopper.scale.set(1, 0.11, 1);
    hopper.position.y = benchTop - 0.045;
    group.add(hopper);
    // The rim: four bars of plate round the mouth (a torus would have put
    // the drum straight back).
    for (const [dx, dz, w, d] of [
      [0, 0.147, 0.302, 0.016],
      [0, -0.147, 0.302, 0.016],
      [0.147, 0, 0.016, 0.302],
      [-0.147, 0, 0.016, 0.302],
    ]) {
      plate(group, w, 0.016, d, dx, benchTop + 0.012, dz, hubMat);
    }
    const mouth = new Mesh(discGeo(), irisMat);
    mouth.rotation.x = -Math.PI / 2;
    mouth.scale.setScalar(0.072);
    mouth.position.y = benchTop - 0.098;
    group.add(mouth);
    // THE HALO — a square of light lying in the mouth, because a ring
    // would be the only circle on the whole machine.
    halo = markMat(0xffa22e, 0.25);
    for (const [dx, dz, w, d] of [
      [0, 0.128, 0.256, 0.012],
      [0, -0.128, 0.256, 0.012],
      [0.128, 0, 0.012, 0.256],
      [-0.128, 0, 0.012, 0.256],
    ]) {
      const bar = new Mesh(boxGeo(), halo);
      bar.scale.set(w, 0.004, d);
      bar.position.set(dx, benchTop + 0.021, dz);
      bar.renderOrder = 12;
      group.add(bar);
    }
    for (const sx of [-1, 1]) gusset(group, 0.06, 0.014, sx * 0.145, bodyY + bodyH / 2, 0, sx > 0 ? 0 : Math.PI);
  } else if (type === 'maker') {
    /* THE MAKER — a stamping press. Two heavy columns, a crown beam, and
     * a RAM that comes down on an anvil between them. The tallest thing
     * on the floor bar the vat, and the only one you can watch working
     * from the far wall. */
    const anvilY = benchTop - 0.02;
    const crownY = benchTop + 0.2;
    legs(group, 0.2, benchTop - 0.24);
    // The bed the anvil sits on.
    const bed = plate(group, 0.26, 0.09, 0.24, 0, benchTop - 0.085, 0);
    outline(group, bed);
    boltRow(group, 4, [-0.09, benchTop - 0.085, 0.121], [0.09, benchTop - 0.085, 0.121], 'z', 1);
    // The anvil: pale wear plate, the one bright face on the machine.
    plate(group, 0.15, 0.03, 0.15, 0, anvilY, 0, wearMat);
    // Two columns and the crown they carry.
    for (const sx of [-1, 1]) {
      const col = plate(group, 0.042, 0.34, 0.052, sx * 0.108, benchTop + 0.03, -0.01, hubMat);
      outline(group, col);
      gusset(group, 0.045, 0.016, sx * 0.108, benchTop - 0.04, -0.01, sx > 0 ? 0 : Math.PI);
    }
    const crown = plate(group, 0.28, 0.05, 0.09, 0, crownY, -0.01);
    outline(group, crown);
    boltRow(group, 3, [-0.09, crownY, 0.037], [0.09, crownY, 0.037], 'z', 1);
    // THE RAM — square section, guided by the columns, with a pale die
    // block on its foot and a hairline round it. It is ONE object (the
    // die and the edge frame ride it as children) because FactorySystem
    // drives the whole thing down onto the anvil by moving one mesh.
    const ram = new Mesh(boxGeo(), hubMat);
    ram.scale.set(0.1, 0.16, 0.1);
    ram.position.set(0, anvilY + 0.135, -0.005);
    const die = new Mesh(boxGeo(), wearMat);
    die.scale.set(1.16, 0.14, 1.16); // ram-local: it inherits the ram's scale
    die.position.y = -0.56;
    ram.add(die);
    const ramEdge = new LineSegments(boxEdges(), edgeMat);
    ram.add(ramEdge);
    group.add(ram);
    anim = { mesh: ram, baseY: anvilY + 0.135, travel: -0.085 };
    // THE FEEDSTOCK HOPPER, at the back, over the gland: what the tube
    // pours into. A folded funnel, mouth up, bolted to the columns.
    const hop = new Mesh(hopperGeo(0.085, 0.042), ironOpenMat);
    hop.scale.set(1, 0.1, 1);
    hop.position.set(0, benchTop + 0.12, -0.108);
    group.add(hop);
    plate(group, 0.05, 0.1, 0.05, 0, benchTop + 0.03, -0.108, hubMat);
    chuteLip(group);
    lampMat = craftLamp(group, crownY + 0.042, 0.03);
    gland = buildGland();
  } else if (type === 'combiner') {
    /* THE COMBINER — a squat, wide H. Two folded hoppers stand out over
     * the side lanes; a low body sits between them; a cross-beam carries
     * TWO small rams that press down together. Low and broad where the
     * maker is tall and narrow — the pair read apart at a glance. */
    const bodyH = 0.2;
    const bodyY = benchTop - 0.13;
    legs(group, 0.18, bodyY - bodyH / 2);
    const body = plate(group, 0.16, bodyH, 0.26, 0, bodyY, 0);
    outline(group, body);
    for (const sx of [-1, 1]) {
      // The side stack: a column out to the lane, a hopper on top of it.
      const arm = plate(group, 0.1, 0.13, 0.14, sx * 0.115, benchTop - 0.095, 0, hubMat);
      outline(group, arm);
      const hop = new Mesh(hopperGeo(0.075, 0.04), ironOpenMat);
      hop.scale.set(1, 0.085, 1);
      hop.position.set(sx * 0.13, benchTop + 0.012, 0);
      group.add(hop);
      // The intake tray the lane's parts land on.
      const tray = plate(group, 0.15, 0.012, 0.15, sx * (size / 2 + 0.05), benchTop + 0.006, 0, railMat);
      void tray;
      flash(group, 0.006, 0.11, sx * (size / 2 + 0.118), benchTop + 0.013, 0, Math.PI / 2);
      gusset(group, 0.05, 0.014, sx * 0.06, bodyY + bodyH / 2, 0, sx > 0 ? 0 : Math.PI);
    }
    // The cross-beam and its two rams.
    const beam = plate(group, 0.3, 0.036, 0.07, 0, benchTop + 0.088, -0.02);
    outline(group, beam);
    boltRow(group, 5, [-0.13, benchTop + 0.088, 0.017], [0.13, benchTop + 0.088, 0.017], 'z', 1);
    const clamp = new Mesh(boxGeo(), hubMat);
    clamp.scale.set(0.19, 0.026, 0.07);
    clamp.position.set(0, benchTop + 0.04, -0.02);
    group.add(clamp);
    for (const sx of [-1, 1]) {
      const rod = new Mesh(boxGeo(), wearMat);
      rod.scale.set(0.16, 0.9, 0.16);
      rod.position.set(sx * 0.36, 0.6, 0);
      clamp.add(rod);
    }
    anim = { mesh: clamp, baseY: benchTop + 0.04, travel: -0.022 };
    chuteLip(group);
    lampMat = craftLamp(group, benchTop + 0.132, 0.008);
  } else if (type === 'belt') {
    /* THE RAIL — a slatted deck on stubby legs. Two I-section side frames
     * with flanges top and bottom, a scrolling tread between them, an end
     * roller (the one honest cylinder in the shop) and a lit chevron. */
    const y = UNITS.railTop;
    for (const sx of [-1, 1]) {
      plate(group, 0.014, 0.03, 0.35, sx * 0.07, y - 0.004, 0, railMat); // the web
      plate(group, 0.026, 0.008, 0.35, sx * 0.07, y + 0.012, 0, hubMat); // top flange
      plate(group, 0.026, 0.008, 0.35, sx * 0.07, y - 0.02, 0, hubMat); // bottom flange
      for (const sz of [-1, 1]) {
        plate(group, 0.016, y - 0.022, 0.016, sx * 0.07, (y - 0.022) / 2, sz * 0.13, hubMat);
      }
    }
    const tread = new Mesh(new PlaneGeometry(0.114, 0.34), treadMaterial());
    tread.rotation.x = -Math.PI / 2;
    tread.position.y = y + 0.004;
    group.add(tread);
    // End rollers: a rail is the one place a cylinder does a job.
    for (const sz of [-1, 1]) {
      const roller = new Mesh(sided(8), hubMat);
      roller.rotation.z = Math.PI / 2;
      roller.scale.set(0.014, 0.13, 0.014);
      roller.position.set(0, y, sz * 0.168);
      group.add(roller);
    }
    const chev = new Mesh(triangleGeo(), chevronMat);
    chev.scale.set(0.07, 1, 0.06);
    chev.position.set(0, y + 0.008, 0.115);
    chev.renderOrder = 12;
    group.add(chev);
  } else if (type === 'post') {
    /* THE POST — a survey peg, and honestly a peg. Square section (so it
     * can't be mistaken for plant), two hazard collars up the shaft, and
     * a flat flag on top you can find across a floor. */
    const { postRadius, postHeight } = UNITS.pull;
    plate(group, 0.05, 0.012, 0.05, 0, 0.006, 0, hubMat);
    const shaft = plate(group, postRadius * 1.7, postHeight, postRadius * 1.7, 0, postHeight / 2, 0, railMat);
    outline(group, shaft);
    for (const t of [0.42, 0.7]) {
      plate(group, postRadius * 2.4, 0.012, postRadius * 2.4, 0, postHeight * t, 0, hubMat);
    }
    const flag = new Mesh(triangleGeo(), chevronMat);
    flag.scale.set(0.055, 1, 0.075);
    flag.rotation.x = -Math.PI / 2;
    flag.position.set(0, postHeight + 0.03, 0.004);
    flag.renderOrder = 12;
    group.add(flag);
    plate(group, 0.014, 0.05, 0.014, 0, postHeight + 0.02, 0, hubMat);
  } else if (type === 'vat') {
    /* THE VAT — the last thing in the book, and the only glass in it.
     * A bolted steel cage round a green tank: four corner columns, a
     * heavy base pan, a clamped lid, and a level inside that COMES UP as
     * the fourth manifold pours. Tall enough to be the thing you look at,
     * and by design nothing else on the floor looks remotely like it. */
    const { size: vs, height: vh } = UNITS.vat;
    // The pan's centre sits a plate's thickness under the tank floor, so
    // UNITS.vat.tankFloor stays the one number everything else reads.
    const baseY = UNITS.vat.tankFloor - 0.03;
    const tankY = baseY + vh / 2;
    legs(group, vs - 0.08, baseY - 0.03);
    // The base pan the tank sits in.
    const pan = plate(group, vs, 0.06, vs, 0, baseY, 0);
    outline(group, pan);
    boltRow(group, 4, [-vs / 2 + 0.04, baseY, vs / 2 + 0.004], [vs / 2 - 0.04, baseY, vs / 2 + 0.004], 'z', 1);
    // THE GLASS. A box of it, held in four corner columns.
    const tank = new Mesh(boxGeo(), glassMat);
    tank.scale.set(vs - 0.06, vh, vs - 0.06);
    tank.position.y = tankY;
    tank.renderOrder = 6;
    group.add(tank);
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) {
        const col = plate(group, 0.026, vh + 0.02, 0.026, sx * (vs / 2 - 0.024), tankY, sz * (vs / 2 - 0.024), hubMat);
        void col;
      }
    }
    // Two banding hoops of flat bar round the glass.
    for (const t of [0.3, 0.72]) {
      const y = baseY + 0.03 + vh * t;
      for (const [dx, dz, w, d] of [
        [0, vs / 2 - 0.03, vs - 0.05, 0.012],
        [0, -(vs / 2 - 0.03), vs - 0.05, 0.012],
        [vs / 2 - 0.03, 0, 0.012, vs - 0.05],
        [-(vs / 2 - 0.03), 0, 0.012, vs - 0.05],
      ]) {
        plate(group, w, 0.014, d, dx, y, dz, hubMat);
      }
    }
    // THE LEVEL — a green block scaled up from the tank floor as it
    // brews. FactorySystem owns the maths; this is the mesh and its
    // datum.
    const fillMat = new MeshStandardMaterial({
      color: 0x2fd47a,
      emissive: 0x0e6b38,
      roughness: 0.2,
      metalness: 0.0,
      transparent: true,
      opacity: 0.85,
    });
    const level = new Mesh(boxGeo(), fillMat);
    level.scale.set(vs - 0.08, 0.001, vs - 0.08);
    level.position.y = baseY + 0.03;
    level.visible = false;
    level.renderOrder = 5;
    group.add(level);
    fill = { mesh: level, mat: fillMat, top: vh - 0.05, floor: baseY + 0.03 };
    // The lid: a heavy plate with four clamps, and the inlet the gland
    // feeds into standing off the back of it.
    const lid = plate(group, vs + 0.02, 0.034, vs + 0.02, 0, baseY + 0.03 + vh + 0.017, 0);
    outline(group, lid);
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) {
        plate(group, 0.03, 0.05, 0.014, sx * (vs / 2 - 0.02), baseY + 0.03 + vh, sz * (vs / 2 + 0.012), hubMat);
      }
    }
    const inlet = new Mesh(hopperGeo(0.05, 0.028), ironOpenMat);
    inlet.scale.set(1, 0.07, 1);
    inlet.position.set(0, baseY + 0.03 + vh + 0.07, -0.05);
    group.add(inlet);
    plate(group, 0.04, 0.06, 0.09, 0, baseY + 0.03 + vh + 0.06, -0.098, hubMat);
    // The vat's own light — a green under-glow in the pan, live from the
    // moment it stands, so an empty vat still reads as WAITING.
    vatGlow = markMat(0x4dff9b, 0.14);
    const under = new Mesh(new PlaneGeometry(vs - 0.05, vs - 0.05), vatGlow);
    under.rotation.x = -Math.PI / 2;
    under.position.y = baseY + 0.033;
    under.renderOrder = 12;
    group.add(under);
    gland = buildGland();
  } else {
    /* THE CHEST — a pallet crate. Slat base, four corner angle brackets,
     * ribbed side panels, open top. Nothing on it moves and nothing on it
     * glows except the hazard bar: it is the only piece of plant on the
     * floor that is just STORAGE, and it should look inert. */
    const h = 0.26;
    const y = benchTop - h / 2;
    // The pallet: three bearers and two deck boards.
    for (const sx of [-1, 0, 1]) {
      plate(group, 0.036, 0.05, size, sx * (size / 2 - 0.03), benchTop - h - 0.025, 0, hubMat);
    }
    plate(group, size, 0.014, size, 0, benchTop - h + 0.007, 0, railMat);
    // Four ribbed side panels round an open top.
    for (const [w, d, dx, dz] of [
      [size, 0.014, 0, size / 2],
      [size, 0.014, 0, -size / 2],
      [0.014, size, size / 2, 0],
      [0.014, size, -size / 2, 0],
    ]) {
      const panel = plate(group, w, h, d, dx, y, dz);
      outline(group, panel);
    }
    for (const t of [-0.08, 0, 0.08]) {
      plate(group, 0.012, h - 0.03, 0.008, t, y, size / 2 + 0.009, hubMat);
      plate(group, 0.008, h - 0.03, 0.012, size / 2 + 0.009, y, t, hubMat);
    }
    // Corner angle brackets — two plates each, the real thing.
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) {
        plate(group, 0.038, h + 0.012, 0.01, sx * (size / 2 - 0.019), y, sz * (size / 2 + 0.007), hubMat);
        plate(group, 0.01, h + 0.012, 0.038, sx * (size / 2 + 0.007), y, sz * (size / 2 - 0.019), hubMat);
      }
    }
    flash(group, 0.16, 0.01, 0, y + h / 2 - 0.03, size / 2 + 0.014);
  }

  if (gland) {
    // On the BACK face (local −Z), facing backward — where the tube
    // arrives from. FactorySystem swings it round the box to meet
    // whichever spout is offering.
    gland.group.position.set(0, UNITS.glandHeight, -size / 2 - 0.01);
    gland.group.rotation.y = Math.PI;
    group.add(gland.group);
  }
  return { group, gland, lampMat, anim, halo, fill, vatGlow };
}

/* ── the feeds ──────────────────────────────────────────────────────────── */

export interface FeedRefs {
  group: Group;
  /** The pillar's halo — dormant dim, awake breathing. */
  glowMat: MeshBasicMaterial;
  /** PEARL's bolted hatch: the thing that comes OFF when the gate opens. */
  hatch: Group | null;
  /** Where the spout's tube leaves (local +Z, off the pillar face). */
  mouthOffset: number;
  awakeVisual: boolean;
}

/**
 * A manifold column wearing its line's plate language — square section
 * with a bolted mid-flange, because the pillars are the first thing you
 * see when the shop opens and round ones made the whole room look like a
 * boiler house. Local +Z faces INTO the floor; the spout sits at
 * FACTORY.spoutHeight.
 *
 * PEARL is built shut: an X-braced hatch bolted over its spout, which
 * FactorySystem takes off (and only ever once) when the fourth gate is
 * paid for.
 */
export function buildFeed(line: LineSpec | null): FeedRefs {
  const group = new Group();
  const shell = new MeshStandardMaterial({
    color: line ? line.shell : 0x4a463e,
    roughness: line ? line.roughness : 0.4,
    metalness: line ? line.metalness : 0.7,
    flatShading: true,
  });
  // Each line still carries a silhouette signature, but in the SECTION of
  // the column rather than in how round it is: MAINS is a plain square
  // post, COOLANT a slimmer one with a chamfered cap, VOLT an eight-sided
  // one (the only faceted column), PEARL the heaviest of the four.
  const sides = line ? (line.id === 'volt' ? 6 : 4) : 4;

  // The base pad, bolted to your actual floor.
  plate(group, 0.3, 0.03, 0.3, 0, 0.015, 0, shell);
  boltRow(group, 3, [-0.1, 0.032, -0.1], [0.1, 0.032, -0.1], 'y', 1);

  const column = new Mesh(sided(sides), shell);
  const w = line && line.id === 'coolant' ? 0.085 : line && line.id === 'pearl' ? 0.115 : 0.1;
  column.scale.set(w * (sides === 4 ? Math.SQRT2 : 1), 1.33, w * (sides === 4 ? Math.SQRT2 : 1));
  if (sides === 4) column.rotation.y = Math.PI / 4;
  column.position.y = 0.695;
  group.add(column);

  // The mid-flange: two plates and a ring of bolts, the join every real
  // column has and no modelled one ever does.
  for (const y of [0.52, 0.556]) {
    plate(group, w * 2.6, 0.016, w * 2.6, 0, y, 0, shell);
  }
  boltRow(group, 3, [-w * 0.9, 0.538, w * 1.34], [w * 0.9, 0.538, w * 1.34], 'z', 1);

  // The cap, and its four tie-down lugs.
  const cap = plate(group, w * 2.9, 0.05, w * 2.9, 0, 1.385, 0, shell);
  void cap;
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      plate(group, 0.02, 0.03, 0.02, sx * w * 1.2, 1.425, sz * w * 1.2, hubMat);
    }
  }

  // THE SPOUT HOUSING on the room-facing face: a bolted square plate with
  // a short collar standing off it.
  const face = plate(group, 0.18, 0.18, 0.03, 0, FACTORY.spoutHeight, 0.115, shell);
  outline(group, face);
  boltRow(group, 2, [-0.072, -0.072 + FACTORY.spoutHeight, 0.132], [0.072, -0.072 + FACTORY.spoutHeight, 0.132], 'z', 1);
  boltRow(group, 2, [-0.072, 0.072 + FACTORY.spoutHeight, 0.132], [0.072, 0.072 + FACTORY.spoutHeight, 0.132], 'z', 1);
  const collar = new Mesh(openCylGeo(), shell);
  collar.rotation.x = Math.PI / 2;
  collar.scale.set(0.078, 0.05, 0.078);
  collar.position.set(0, FACTORY.spoutHeight, 0.152);
  group.add(collar);

  const glowMat = markMat(line ? line.glow : 0xe8e2d6, line ? 0.25 : 0.08);
  const halo = new Mesh(ringGeo(), glowMat);
  halo.scale.setScalar(0.12);
  halo.position.set(0, FACTORY.spoutHeight, 0.14);
  halo.renderOrder = 12;
  group.add(halo);

  let hatch: Group | null = null;
  if (line?.id === 'pearl') {
    // BOLTED SHUT. Two crossed straps over a blank plate and eight bolt
    // heads — a door that has never been opened, and visibly so.
    hatch = new Group();
    const shut = plate(hatch, 0.2, 0.2, 0.014, 0, FACTORY.spoutHeight, 0.163, hubMat);
    outline(hatch, shut);
    for (const rot of [0.7, -0.7]) {
      const strap = plate(hatch, 0.27, 0.03, 0.01, 0, FACTORY.spoutHeight, 0.172, shell);
      strap.rotation.z = rot;
    }
    for (const sx of [-1, 1]) {
      boltRow(
        hatch,
        3,
        [sx * 0.078, FACTORY.spoutHeight - 0.078, 0.176],
        [sx * 0.078, FACTORY.spoutHeight + 0.078, 0.176],
        'z',
        1,
      );
    }
    group.add(hatch);
  } else if (!line) {
    const shut = new Mesh(discGeo(), irisMat);
    shut.scale.setScalar(0.07);
    shut.position.set(0, FACTORY.spoutHeight, 0.141);
    group.add(shut);
  }

  return { group, glowMat, hatch, mouthOffset: 0.17, awakeVisual: false };
}

/* ── the parts ──────────────────────────────────────────────────────────
 * Every item is a little ASSEMBLY, not a token: a handful of components
 * over shared prisms, each wearing its lineage's plate language — and a
 * tier-2 part visibly CONTAINS its ingredients (the pump is an eight-
 * sided iron body with a hex alloy throat; you can read the gear and the
 * cell in it from across the bench). Nothing here uses more than eight
 * sides either: at 5 cm across, a twenty-sided prism is a smooth pebble,
 * and the shop does not make pebbles.
 *
 * Rendered instanced per component: a floor full of parts is a dozen
 * draw calls.
 */

export interface PartComponent {
  geometry: CylinderGeometry;
  material: MeshStandardMaterial | MeshBasicMaterial;
  local: Matrix4;
}

const _bodyMats = new Map<string, MeshStandardMaterial>();
function bodyMat(lineId: 'mains' | 'coolant' | 'volt'): MeshStandardMaterial {
  let m = _bodyMats.get(lineId);
  if (!m) {
    const line = LINES[lineId];
    m = new MeshStandardMaterial({
      color: line.shell,
      roughness: line.roughness,
      metalness: line.metalness,
      flatShading: true,
    });
    _bodyMats.set(lineId, m);
  }
  return m;
}

const _glowMats = new Map<string, MeshBasicMaterial>();
function glowFor(lineId: 'mains' | 'coolant' | 'volt'): MeshBasicMaterial {
  let m = _glowMats.get(lineId);
  if (!m) {
    m = new MeshBasicMaterial({
      color: LINES[lineId].glow,
      transparent: true,
      opacity: 0.85,
      blending: AdditiveBlending,
      depthWrite: false,
    });
    _glowMats.set(lineId, m);
  }
  return m;
}

const _q = new Quaternion();
const _s = new Vector3();
const _p = new Vector3();

function comp(
  geometry: CylinderGeometry,
  material: MeshStandardMaterial | MeshBasicMaterial,
  sx: number,
  sy: number,
  sz: number,
  y = 0,
  ry = 0,
): PartComponent {
  _q.setFromAxisAngle(new Vector3(0, 1, 0), ry);
  return {
    geometry,
    material,
    local: new Matrix4().compose(_p.set(0, y, 0), _q.clone(), _s.set(sx, sy, sz)),
  };
}

const _kits = new Map<ItemId, PartComponent[]>();

/** The item's component kit — local matrices over shared geometry. */
export function partKit(item: ItemId): PartComponent[] {
  let kit = _kits.get(item);
  if (kit) return kit;
  const iron = bodyMat('mains');
  const alloy = bodyMat('coolant');
  const glass = bodyMat('volt');
  const amber = glowFor('mains');
  const cyan = glowFor('coolant');
  const violet = glowFor('volt');
  const c8 = sided(8);
  const c6 = sided(6);
  const c4 = sided(4);

  if (item === 'gear') {
    // Two eight-sided plates a half-tooth apart: a sixteen-point toothed
    // disc, square hub, lit amber axle.
    kit = [
      comp(c8, iron, 0.052, 0.026, 0.052),
      comp(c8, iron, 0.052, 0.013, 0.052, 0, Math.PI / 8),
      comp(c4, hubMat, 0.02, 0.03, 0.02),
      comp(c6, amber, 0.008, 0.034, 0.008),
    ];
  } else if (item === 'cell') {
    // A machined can: hex alloy body, square end caps, a lit charge band.
    kit = [
      comp(c6, alloy, 0.038, 0.072, 0.038),
      comp(c4, hubMat, 0.038, 0.008, 0.038, 0.033),
      comp(c4, hubMat, 0.038, 0.008, 0.038, -0.033),
      comp(c6, cyan, 0.0392, 0.016, 0.0392),
    ];
  } else if (item === 'chip') {
    // A square wafer of dark glass, violet traces lit inside, one pin.
    kit = [
      comp(c4, glass, 0.05, 0.012, 0.05),
      comp(c4, violet, 0.036, 0.015, 0.036),
      comp(c6, hubMat, 0.007, 0.024, 0.007),
    ];
  } else if (item === 'pump') {
    // GEAR + CELL, readable: eight-sided iron body, hex alloy throat, the
    // joint lit cyan, the base lit amber.
    kit = [
      comp(c8, iron, 0.048, 0.06, 0.048),
      comp(c6, alloy, 0.024, 0.032, 0.024, 0.043),
      comp(c6, cyan, 0.027, 0.009, 0.027, 0.029),
      comp(c8, amber, 0.049, 0.008, 0.049, -0.029),
    ];
  } else if (item === 'lamp') {
    // CELL + CHIP: the can wearing a square glass crown, lit violet on
    // top and cyan at the waist.
    kit = [
      comp(c6, alloy, 0.036, 0.055, 0.036, -0.008),
      comp(c4, glass, 0.042, 0.018, 0.042, 0.03),
      comp(c4, violet, 0.03, 0.015, 0.03, 0.047),
      comp(c6, cyan, 0.037, 0.012, 0.037, -0.02),
    ];
  } else {
    // servo — GEAR + CHIP: an eight-sided iron ring round a square glass
    // core, violet at the crown. The part the fourth gate is bolted with.
    kit = [
      comp(c8, iron, 0.05, 0.028, 0.05),
      comp(c4, glass, 0.028, 0.052, 0.028),
      comp(c4, violet, 0.019, 0.01, 0.019, 0.031),
    ];
  }
  _kits.set(item, kit);
  return kit;
}
