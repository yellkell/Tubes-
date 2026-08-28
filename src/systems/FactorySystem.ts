/**
 * FactorySystem — the shift itself: feeds, supply runs, the sim, the
 * parts, the payoff. Everything PIECEWORK on the FACTORY screen.
 *
 * THE PULL LIVES ON. The supply hookup is TubeSystem's verb, forked —
 * same constants, same five rules — with one honest difference: there is
 * no predetermined socket. While the collar is held, EVERY free gland on
 * the floor is a candidate, and the nearest one inside the snap window
 * (roughly square) takes the head. The fork is deliberate scaffolding:
 * TubeSystem stays the ladder's untouched crown jewel, and the two pulls
 * reunify once the factory's is proven (FACTORY.md roadmap).
 *
 * Ownership: BuildSystem MUTATES the plant (stamp/unbolt); the sim
 * ADVANCES it (factory/sim.ts, events out); this system PERFORMS it —
 * meshes, pours, hums, haptics, the dock's counter plate — and carries
 * the hands: the two-hand pull and the one-hand part carry.
 *
 * Budget note: units are plain meshes (a full floor ≈ 15 units × ~8
 * draws); parts are instanced per item type. The order walk asserts the
 * whole worst frame under its own bar — instancing the unit chassis is
 * the known next win if it tightens.
 */

import { InputComponent, createSystem } from '@iwsdk/core';
import {
  AdditiveBlending,
  BufferGeometry,
  Float32BufferAttribute,
  Group,
  InstancedMesh,
  Matrix4,
  MeshBasicMaterial,
  Quaternion,
  Vector3,
} from 'three';
import { FACTORY, FLOW, ITEMS, LINES, SEAT, TUBE, UNITS, type ItemId } from '../config.js';
import * as sfx from '../audio/sfx.js';
import { buzz } from '../game/haptics.js';
import { orderComplete } from '../game/flow.js';
import { chestBonus, ownedUpgrades, railFactor, reachBonus } from '../game/progress.js';
import { site } from '../game/state.js';
import { cellCenter } from '../floor/grid.js';
import { floorLayout, type FloorSide } from '../floor/plan.js';
import {
  DIRS,
  chestParts,
  chuteParts,
  freshRun,
  orderSpec,
  plant,
  runForSide,
  runSeatedAt,
  type FactoryRun,
  type Part,
} from '../factory/state.js';
import { deliverPart, glandPose, linkAhead, partPose, retractRun, simTick } from '../factory/sim.js';
import {
  buildFeed,
  buildUnit,
  partKit,
  tickBeltTread,
  type FeedRefs,
  type UnitRefs,
} from '../factory/units.js';
import { buildCollar, buildSegment, type CollarRefs, type SegmentRefs } from '../tube/build.js';
import {
  bendControl,
  endControl,
  pathPoint,
  pathTangent,
  runLength,
  segmentSpans,
} from '../tube/geometry.js';

/** Headless/dev hooks (wired into __tubes in main.ts). */
export const factoryView: {
  state?: () => {
    mode: string;
    order: number;
    orderId: string | null;
    count: number;
    goal: number;
    elapsedMs: number;
    feeds: Partial<Record<FloorSide, boolean>>;
    runs: Array<{ side: FloorSide; phase: string; ext: number; target: number }>;
    parts: number;
    units: number;
    bank: Partial<Record<ItemId, number>>;
  };
  /** Every gland on the floor: the pose it would present to `side`'s
   *  spout (the collar swivels, so ask from somewhere), and whether a
   *  run already holds it. */
  glands?: (side?: FloorSide) => Array<{
    unit: number;
    type: string;
    x: number;
    y: number;
    z: number;
    nx: number;
    ny: number;
    nz: number;
    seated: boolean;
  }>;
  /** The driven two hands, per feed side (the tools' pull). */
  grab?: (side: FloorSide) => boolean;
  dragTo?: (x: number, y: number, z: number) => void;
  release?: () => void;
  /** Unbolt a seated run off a unit's gland. */
  unseat?: (unitId: number) => boolean;
  /** Headless hand-carry: take the nearest part / drop what's carried. */
  take?: (x: number, y: number, z: number) => number | null;
  drop?: (x: number, y: number, z: number) => boolean;
  timeScale?: (s: number) => void;
  parts?: () => Array<{ id: number; item: ItemId; kind: string; unit?: number }>;
} = {};

const SHELL_PAD = 0.03;
const UP_Y = new Vector3(0, 1, 0);
const FWD_Z = new Vector3(0, 0, 1);
const DOWN = new Vector3(0, -1, 0);

const _mouth = new Vector3();
const _p1 = new Vector3();
const _p2 = new Vector3();
const _entry = new Vector3();
const _chord = new Vector3();
const _pA = new Vector3();
const _pB = new Vector3();
const _point = new Vector3();
const _tangent = new Vector3();
const _quat = new Quaternion();
const _seat = new Vector3();
const _dir = new Vector3();
const _handL = new Vector3();
const _handR = new Vector3();
const _mid = new Vector3();
const _aimL = new Vector3();
const _aimSum = new Vector3();
const _g = new Vector3();
const _gn = new Vector3();
const _c = { x: 0, z: 0 };
const _m4 = new Matrix4();
const _m4b = new Matrix4();
const _v3 = new Vector3();
const _v3b = new Vector3();
/** Own scratch: layTube's _quat is live across its whole pass. */
const _q = new Quaternion();

interface RunHw {
  root: Group;
  segments: SegmentRefs[];
  collar: CollarRefs;
  humOn: boolean;
}

const FEED_NORMALS: Record<FloorSide, Vector3> = {
  far: new Vector3(0, 0, 1),
  near: new Vector3(0, 0, -1),
  left: new Vector3(1, 0, 0),
  right: new Vector3(-1, 0, 0),
};

export class FactorySystem extends createSystem({}) {
  private clock = 0;
  private lastGen = -1;
  private feeds = new Map<FloorSide, FeedRefs>();
  private feedFlash = new Map<FloorSide, number>();
  private runHw = new Map<FloorSide, RunHw>();
  private unitRefs = new Map<number, UnitRefs>();
  /** One InstancedMesh per item COMPONENT (parts are little assemblies —
   *  see factory/units.ts partKit). Indexed in lockstep with partLocals. */
  private partPools = new Map<ItemId, InstancedMesh[]>();
  private partLocals = new Map<ItemId, Matrix4[]>();
  private carried: Partial<Record<'left' | 'right', number>> = {};
  /** A tool's carry (factoryView.take) — the real grip's open hand must
   *  not drop it between the tool's two calls. */
  private carriedDriven: Partial<Record<'left' | 'right', boolean>> = {};
  private driven = { active: false, side: 'far' as FloorSide, pos: new Vector3() };
  /** The dock halo's delivery flash (decays in the dressing tick). */
  private dockFlash = 0;
  /** THE LINKS, drawn: a chevron on every live join, so a chain reads as
   *  a chain from across the room instead of as a row of boxes. */
  private linkMesh: InstancedMesh | null = null;
  /** When each part first appeared — a new one POPS, so "something came
   *  out of the maker" is impossible to miss. */
  private partSeen = new Map<number, number>();

  init(): void {
    factoryView.state = () => {
      const spec = orderSpec();
      return {
        mode: plant.mode,
        order: plant.orderIndex,
        orderId: spec?.id ?? null,
        count: plant.count,
        goal: spec?.goal ?? 0,
        elapsedMs: plant.elapsedMs,
        feeds: { ...plant.feedsAwake },
        runs: plant.runs.map((r) => ({
          side: r.side,
          phase: r.phase,
          ext: r.extension,
          target: r.targetUnit,
          head: { x: r.headVisual.x, y: r.headVisual.y, z: r.headVisual.z },
        })),
        parts: plant.parts.length,
        units: plant.units.length,
        bank: { ...plant.bank },
        upgrades: ownedUpgrades(),
      };
    };
    factoryView.glands = (side) => {
      const from = side ? runForSide(side)?.pointA : undefined;
      return plant.units
        .filter((u) => u.type === 'maker' || u.type === 'dock')
        .map((u) => {
          glandPose(u, _g, _gn, from);
          return {
            unit: u.id,
            type: u.type,
            x: _g.x,
            y: _g.y,
            z: _g.z,
            nx: _gn.x,
            ny: _gn.y,
            nz: _gn.z,
            seated: Boolean(runSeatedAt(u.id)),
          };
        });
    };
    factoryView.grab = (side) => {
      const run = runForSide(side);
      if (!run || run.phase !== 'pull') return false;
      this.driven.active = true;
      this.driven.side = side;
      this.driven.pos.copy(run.headVisual);
      return true;
    };
    factoryView.dragTo = (x, y, z) => {
      this.driven.pos.set(x, y, z);
    };
    factoryView.release = () => {
      this.driven.active = false;
    };
    factoryView.unseat = (unitId) => {
      const run = runSeatedAt(unitId);
      if (!run) return false;
      this.stopRunHum(run);
      retractRun(run);
      sfx.boltSpin();
      sfx.droopSettle();
      return true;
    };
    factoryView.take = (x, y, z) => this.takeNearest('right', _g.set(x, y, z), true);
    factoryView.drop = (x, y, z) => this.dropCarried('right', _g.set(x, y, z));
    factoryView.timeScale = (s) => {
      plant.timeScale = Math.max(0.1, Math.min(30, s));
    };
    factoryView.parts = () =>
      plant.parts.map((p) => ({
        id: p.id,
        item: p.item,
        kind: p.at.kind,
        unit: 'unit' in p.at ? p.at.unit : undefined,
      }));
  }

  update(delta: number): void {
    this.clock += delta;

    const live = plant.mode !== 'idle';
    if (this.lastGen !== plant.generation) {
      this.lastGen = plant.generation;
      this.syncStructures(live);
    }
    if (!live) return;

    const active = site.screen === 'factory';

    // The feeds stand on the tape's sides — reposed every frame (cheap,
    // and the floor may have moved between shifts).
    this.poseFeeds();

    // Hands: the pull and the carry — only mid-shift, never under the card.
    if (active && !site.paused) this.tickHands(delta);
    else if (this.driven.active && !active) this.driven.active = false;

    // The runs: pull physics, seat magnet, pours, retraction.
    for (const run of plant.runs) this.tickRun(run, delta);

    // The machine itself. The card pauses the HANDS, never the works.
    const dt = delta * plant.timeScale;
    simTick(dt);
    plant.elapsedMs += dt * 1000;
    // Every tread on the floor runs at the sim's own pace.
    tickBeltTread(dt, FACTORY.railSpeed * railFactor());

    this.drainEvents();
    this.renderParts();
    this.tickUnitDressing(delta);
  }

  /* ── structures: feeds, unit meshes, run hardware ─────────────────────── */

  private syncStructures(live: boolean): void {
    // Feeds exist while a shift does.
    if (live && this.feeds.size === 0) {
      for (const side of ['far', 'left', 'right', 'near'] as FloorSide[]) {
        const lineId = FACTORY.sides[side];
        const refs = buildFeed(lineId ? LINES[lineId] : null);
        this.scene.add(refs.group);
        this.feeds.set(side, refs);
      }
    }
    if (!live) {
      for (const refs of this.feeds.values()) refs.group.removeFromParent();
      this.feeds.clear();
      for (const hw of this.runHw.values()) this.dropRunHw(hw);
      this.runHw.clear();
      for (const refs of this.unitRefs.values()) this.dropUnitRefs(refs);
      this.unitRefs.clear();
      for (const pools of this.partPools.values()) {
        for (const pool of pools) pool.removeFromParent();
      }
      this.partPools.clear();
      this.partLocals.clear();
      this.partSeen.clear();
      if (this.linkMesh) {
        this.linkMesh.removeFromParent();
        this.linkMesh = null;
      }
      this.carried = {};
      this.driven.active = false;
      sfx.stopAllHums();
      return;
    }

    // Unit meshes follow plant.units.
    const liveIds = new Set(plant.units.map((u) => u.id));
    for (const [id, refs] of this.unitRefs) {
      if (!liveIds.has(id)) {
        this.dropUnitRefs(refs);
        this.unitRefs.delete(id);
      }
    }
    for (const unit of plant.units) {
      if (this.unitRefs.has(unit.id)) continue;
      const refs = buildUnit(unit.type);
      cellCenter(unit.i, unit.j, _c);
      refs.group.position.set(_c.x, 0, _c.z);
      const d = [
        { di: 0, dj: -1 },
        { di: 1, dj: 0 },
        { di: 0, dj: 1 },
        { di: -1, dj: 0 },
      ][unit.rot];
      refs.group.rotation.y = Math.atan2(d.di, d.dj);
      this.scene.add(refs.group);
      this.unitRefs.set(unit.id, refs);
    }

    // A run per awake feed (the stub waits on the spout).
    for (const [side, refs] of this.feeds) {
      const lineId = FACTORY.sides[side];
      if (!lineId || !plant.feedsAwake[side]) continue;
      if (!runForSide(side)) {
        this.spoutPose(side, refs, _g, _gn);
        plant.runs.push(freshRun(side, LINES[lineId], _g, _gn));
      }
      if (!this.runHw.has(side)) {
        const run = runForSide(side)!;
        const root = new Group();
        const segments: SegmentRefs[] = [];
        for (let s = 0; s < TUBE.segments; s++) {
          const seg = buildSegment(run.line, s);
          segments.push(seg);
          root.add(seg.shell, seg.rib, seg.pour);
        }
        const collar = buildCollar(run.line);
        root.add(collar.group);
        this.scene.add(root);
        this.runHw.set(side, { root, segments, collar, humOn: false });
      }
    }

    // Part pools once — one instanced mesh per component of each kit.
    if (this.partPools.size === 0) {
      for (const item of Object.keys(ITEMS) as ItemId[]) {
        const kit = partKit(item);
        const pools: InstancedMesh[] = [];
        const locals: Matrix4[] = [];
        for (const part of kit) {
          const pool = new InstancedMesh(part.geometry, part.material, 64);
          pool.count = 0;
          pool.frustumCulled = false;
          this.scene.add(pool);
          pools.push(pool);
          locals.push(part.local);
        }
        this.partPools.set(item, pools);
        this.partLocals.set(item, locals);
      }
    }

    if (!this.linkMesh) {
      const geo = new BufferGeometry();
      const v: number[] = [];
      for (const z of [-0.4, 0.15]) v.push(-0.5, 0, z, 0.5, 0, z, 0, 0, z + 0.45);
      geo.setAttribute('position', new Float32BufferAttribute(v, 3));
      const mat = new MeshBasicMaterial({
        color: 0xffb85c,
        transparent: true,
        opacity: 0.5,
        blending: AdditiveBlending,
        depthWrite: false,
        side: 2,
      });
      this.linkMesh = new InstancedMesh(geo, mat, 96);
      this.linkMesh.count = 0;
      this.linkMesh.frustumCulled = false;
      this.linkMesh.renderOrder = 12;
      this.scene.add(this.linkMesh);
    }
    this.relayLinks();
  }

  /** One chevron per live join, midway between the two cells. */
  private relayLinks(): void {
    const mesh = this.linkMesh;
    if (!mesh) return;
    let n = 0;
    for (const unit of plant.units) {
      const ahead = linkAhead(unit);
      if (!ahead || n >= 96) continue;
      cellCenter(unit.i, unit.j, _c);
      const ax = _c.x;
      const az = _c.z;
      cellCenter(ahead.i, ahead.j, _c);
      _q.setFromAxisAngle(UP_Y, Math.atan2(_c.x - ax, _c.z - az));
      _m4.compose(
        _v3.set((ax + _c.x) / 2, UNITS.railTop + 0.1, (az + _c.z) / 2),
        _q,
        _v3b.set(0.09, 1, 0.12),
      );
      mesh.setMatrixAt(n++, _m4);
    }
    mesh.count = n;
    mesh.instanceMatrix.needsUpdate = true;
  }

  private dropRunHw(hw: RunHw): void {
    hw.root.removeFromParent();
    for (const seg of hw.segments) seg.pourMat.dispose();
    hw.collar.capMat.dispose();
    hw.collar.glowMat.dispose();
  }

  private dropUnitRefs(refs: UnitRefs): void {
    refs.group.removeFromParent();
    if (refs.gland) {
      refs.gland.glowMat.dispose();
      refs.gland.guideMat.dispose();
    }
    if (refs.lampMat) refs.lampMat.dispose();
  }

  /* ── feeds ────────────────────────────────────────────────────────────── */

  private sideMid(side: FloorSide, out: Vector3): Vector3 {
    const cx = (floorLayout.left + floorLayout.right) / 2;
    const cz = (floorLayout.near + floorLayout.far) / 2;
    if (side === 'far') out.set(cx, 0, floorLayout.far);
    else if (side === 'near') out.set(cx, 0, floorLayout.near);
    else if (side === 'left') out.set(floorLayout.left, 0, cz);
    else out.set(floorLayout.right, 0, cz);
    return out;
  }

  private spoutPose(side: FloorSide, refs: FeedRefs, point: Vector3, normal: Vector3): void {
    this.sideMid(side, point);
    normal.copy(FEED_NORMALS[side]);
    point.addScaledVector(normal, refs.mouthOffset).setY(FACTORY.spoutHeight);
  }

  private poseFeeds(): void {
    for (const [side, refs] of this.feeds) {
      this.sideMid(side, _g);
      refs.group.position.set(_g.x, 0, _g.z);
      const n = FEED_NORMALS[side];
      refs.group.rotation.y = Math.atan2(n.x, n.z);
      const awake = Boolean(plant.feedsAwake[side]);
      const flash = this.feedFlash.get(side) ?? 0;
      if (flash > 0) this.feedFlash.set(side, flash - 0.016);
      const breathe = 0.5 + 0.5 * Math.sin(this.clock * 2.2);
      refs.glowMat.opacity = awake
        ? 0.25 + 0.2 * breathe + Math.max(0, flash) * 0.5
        : FACTORY.sides[side]
          ? 0.06
          : 0.08;
      // A run's pointA rides the spout (the floor may have moved between
      // shifts; runs are born fresh each shift, but stay honest anyway).
      const run = runForSide(side);
      if (run && run.phase === 'pull' && !run.held) {
        this.spoutPose(side, refs, _g, _gn);
        run.pointA.copy(_g);
        run.normalA.copy(_gn);
      }
    }
  }

  /* ── hands: the pull's grips and the carry ────────────────────────────── */

  private tickHands(delta: number): void {
    void delta;
    const grips = this.world.playerSpaceEntities?.gripSpaces;
    const objL = grips?.left?.object3D;
    const objR = grips?.right?.object3D;
    if (objL) objL.getWorldPosition(_handL);
    if (objR) objR.getWorldPosition(_handR);

    // THE CARRY: one squeezing hand near a loose part takes it — unless
    // that hand is close enough to a collar that the pull has first call.
    for (const [hand, obj, pos] of [
      ['left', objL, _handL],
      ['right', objR, _handR],
    ] as const) {
      if (!obj) continue;
      const gp = this.input.xr.gamepads[hand];
      const squeezing = gp?.getButtonPressed(InputComponent.Squeeze) ?? false;
      const carriedId = this.carried[hand];
      if (carriedId !== undefined && !squeezing && !this.carriedDriven[hand]) {
        this.dropCarried(hand, pos);
      } else if (
        carriedId === undefined &&
        (gp?.getButtonDown(InputComponent.Squeeze) ?? false) &&
        !this.nearAnyCollar(pos)
      ) {
        this.takeNearest(hand, pos, false);
      }
    }
  }

  private nearAnyCollar(pos: Vector3): boolean {
    for (const run of plant.runs) {
      if (run.phase === 'pull' && pos.distanceTo(run.headVisual) < TUBE.grabReach) return true;
    }
    return false;
  }

  private takeNearest(hand: 'left' | 'right', pos: Vector3, headless: boolean): number | null {
    if (this.carried[hand] !== undefined) return null; // one part per fist
    let best: Part | null = null;
    let bestD = FACTORY.partReach;
    for (const part of plant.parts) {
      const at = part.at;
      if (at.kind === 'hand' || at.kind === 'port') continue;
      if (at.kind === 'chest') {
        // Only the top of the stack is in reach of a fist.
        const stack = chestParts(at.unit);
        if (stack[stack.length - 1] !== part) continue;
      }
      partPose(part, _pA);
      const d = _pA.distanceTo(pos);
      if (d < bestD) {
        bestD = d;
        best = part;
      }
    }
    if (!best) return null;
    const at = best.at;
    if (at.kind === 'chute') {
      for (const p of chuteParts(at.unit)) {
        if (p.at.kind === 'chute' && p.at.slot > at.slot) p.at.slot -= 1;
      }
    }
    best.at = { kind: 'hand', hand };
    this.carried[hand] = best.id;
    if (headless) this.carriedDriven[hand] = true;
    else {
      sfx.uiHover();
      buzz(this.world, hand, 0.3, 25);
    }
    return best.id;
  }

  private dropCarried(hand: 'left' | 'right', pos: Vector3): boolean {
    const id = this.carried[hand];
    if (id === undefined) return false;
    const part = plant.parts.find((p) => p.id === id);
    delete this.carried[hand];
    delete this.carriedDriven[hand];
    if (!part) return false;

    // Over the dock: delivered. Over a chest: banked in the crate. Over a
    // combiner's port tray: fitted. Anywhere else: it's on the floor now.
    for (const unit of plant.units) {
      cellCenter(unit.i, unit.j, _c);
      const d = Math.hypot(pos.x - _c.x, pos.z - _c.z);
      if (d > FACTORY.dropReach) continue;
      if (unit.type === 'dock') {
        deliverPart(part);
        buzz(this.world, hand, 0.5, 40);
        return true;
      }
      if (unit.type === 'chest' && chestParts(unit.id).length < FACTORY.chestCap + chestBonus()) {
        part.at = { kind: 'chest', unit: unit.id, index: chestParts(unit.id).length };
        sfx.uiClick();
        return true;
      }
      if (unit.type === 'combiner') {
        for (const portIdx of [0, 1] as const) {
          if (unit.ports[portIdx] < 0) {
            unit.ports[portIdx] = part.id;
            part.at = { kind: 'port', unit: unit.id, port: portIdx };
            sfx.uiClick();
            return true;
          }
        }
      }
    }
    part.at = { kind: 'loose', x: pos.x, y: 0.05, z: pos.z };
    sfx.droopSettle();
    return true;
  }

  /* ── the runs: pull, seat, pour, retract ──────────────────────────────── */

  private tickRun(run: FactoryRun, delta: number): void {
    const hw = this.runHw.get(run.side);
    if (!hw) return;

    if (run.phase === 'pull' && !site.paused) this.tickPull(run, hw, delta);
    else if (run.phase === 'retract') this.tickRetract(run, hw, delta);
    if (run.phase === 'seated' || run.phase === 'flowing') {
      this.layTube(run, hw, run.extension, true);
      this.tickPour(run, hw, delta);
    } else {
      // Energy dies with the connection.
      run.energy = Math.max(0, run.energy - delta * 3);
      for (const seg of hw.segments) {
        seg.pour.visible = seg.pour.visible && run.energy > 0.01;
        seg.pourMat.uniforms.uEnergy.value = run.energy;
      }
    }
    this.tickCollarTell(run, hw);
  }

  private tickPull(run: FactoryRun, hw: RunHw, delta: number): void {
    _mouth.copy(run.pointA).addScaledVector(run.normalA, 0);
    run.rattleCool = Math.max(0, run.rattleCool - delta);
    run.strainCool = Math.max(0, run.strainCool - delta);
    const maxExt = TUBE.maxLength + reachBonus(); // LONG REACH, if fitted

    const hands = this.readHands(run);
    if (hands.aim) run.aim.copy(hands.aim);
    run.aimOk = hands.aim !== null;

    if (!run.magnet) {
      if (hands.holding && !run.held) {
        run.held = true;
        run.droop = 0;
        run.droopVel = 0;
        sfx.grabLatch();
        buzz(this.world, 'both', 0.35, 30);
      } else if (!hands.holding && run.held) {
        run.held = false;
        sfx.droopSettle();
      } else if (!run.held && hands.rattling && run.rattleCool <= 0) {
        run.rattleCool = TUBE.rattleCooldownS;
        sfx.oneHandRattle();
        buzz(this.world, hands.rattleHand, 0.25, 25);
      }
    }

    if (run.held && !run.magnet) {
      const reach = (run.extension - TUBE.stubLength) / Math.max(0.001, maxExt - TUBE.stubLength);
      const k = TUBE.followStiffness + (TUBE.followStiffnessFar - TUBE.followStiffness) * reach;
      run.head.lerp(hands.mid, 1 - Math.exp(-k * delta));

      _dir.copy(run.head).sub(_mouth);
      let ext = _dir.length();
      if (ext < 1e-4) {
        _dir.copy(run.normalA);
        ext = 1e-4;
      }
      _dir.divideScalar(ext);
      if (ext > maxExt) {
        ext = maxExt;
        run.head.copy(_mouth).addScaledVector(_dir, ext);
        if (run.strainCool <= 0) {
          run.strainCool = 0.9;
          sfx.strainCreak();
          buzz(this.world, 'both', 0.5, 70);
        }
      } else if (ext < TUBE.stubLength) {
        ext = TUBE.stubLength;
        run.head.copy(_mouth).addScaledVector(_dir, ext);
      }

      const detent = Math.floor(ext / TUBE.detentPitch);
      if (detent !== run.lastDetent) {
        run.lastDetent = detent;
        sfx.segmentClick(detent);
        buzz(this.world, 'both', 0.18, 14);
      }
      const sections = segmentSpans(ext, maxExt).length;
      if (sections > run.lastSections) {
        sfx.sectionArrive(sections - 1);
        buzz(this.world, 'both', 0.4, 40);
      }
      run.lastSections = sections;
      run.extension = ext;
    }

    // Parked droop.
    const droopTarget =
      run.held || run.magnet ? 0 : Math.min(TUBE.droopMax, run.extension * TUBE.droopPerMetre);
    const spring = 60 / TUBE.droopSettleS;
    run.droopVel += (droopTarget - run.droop) * spring * delta;
    run.droopVel *= Math.exp(-4.2 * delta);
    run.droop += run.droopVel * delta;
    run.headVisual.copy(run.head).addScaledVector(DOWN, run.droop);

    // THE GLAND DOES THE LAST METRE — whichever free gland is nearest,
    // offered up roughly square.
    if (!run.magnet && run.held) {
      let bestUnit = -1;
      let bestD = FACTORY.seatRadius;
      for (const unit of plant.units) {
        if (unit.type !== 'maker' && unit.type !== 'dock') continue;
        if (runSeatedAt(unit.id)) continue;
        if (plant.runs.some((r) => r !== run && r.magnet && r.targetUnit === unit.id)) continue;
        // The collar SWIVELS to face this run's spout, so the alignment
        // gate is satisfied by construction: the only thing we ask of
        // the player is "bring it near". Nothing is ever refused for
        // approaching a box from the wrong side again.
        glandPose(unit, _g, _gn, run.pointA);
        _seat.copy(_g).addScaledVector(_gn, 0.08);
        const d = run.headVisual.distanceTo(_seat);
        if (d >= bestD) continue;
        bestD = d;
        bestUnit = unit.id;
        run.pointB.copy(_g);
        run.normalB.copy(_gn);
      }
      if (bestUnit >= 0) {
        run.magnet = true;
        run.targetUnit = bestUnit;
        run.seatP = 0;
        sfx.magnetTake();
        buzz(this.world, 'both', 0.3, 120);
      }
    }
    if (run.magnet) {
      _seat.copy(run.pointB).addScaledVector(run.normalB, 0.08);
      run.seatP = Math.min(1, run.seatP + delta / (SEAT.magnetS + SEAT.seatS));
      const e = 1 - (1 - run.seatP) ** 3;
      run.head.lerp(_seat, e);
      run.headVisual.copy(run.head);
      run.extension = Math.max(TUBE.stubLength, runLength(_mouth, run.head));
      if (run.seatP >= 1) this.seatRun(run, hw, _seat);
    }

    this.layTube(run, hw, run.extension, run.magnet);
  }

  private seatRun(run: FactoryRun, hw: RunHw, seat: Vector3): void {
    run.phase = 'seated';
    run.phaseT = 0;
    run.front = -1;
    run.head.copy(seat);
    run.extension = runLength(_mouth.copy(run.pointA), seat);
    run.held = false;
    run.magnet = false;
    run.droop = 0;
    if (this.driven.active && this.driven.side === run.side) this.driven.active = false;
    for (const seg of hw.segments) seg.pour.visible = seg.shell.visible;
    const gland = this.unitRefs.get(run.targetUnit)?.gland;
    if (gland) {
      gland.iris.visible = false;
      gland.glowMat.color.setHex(run.line.glow);
      gland.guideMat.color.setHex(run.line.glow);
    }
    sfx.seatClunk();
    sfx.latchDogs();
    if (run.line.id === 'mains') sfx.steamHiss();
    else if (run.line.id === 'coolant') sfx.hydraulicSigh();
    else sfx.arcZap();
    sfx.chargeRise(FLOW.chargeS);
    buzz(this.world, 'both', 0.9, 90);
  }

  private tickPour(run: FactoryRun, hw: RunHw, delta: number): void {
    run.phaseT += delta;
    let target = 0;
    if (run.phase === 'seated') {
      target = Math.min(1, run.phaseT / FLOW.chargeS);
      if (run.phaseT >= FLOW.chargeS && run.front < 0) run.front = 0.001;
      if (run.front >= 0) {
        run.front += run.line.flowSpeed * delta;
        if (run.front >= run.extension) {
          run.front = run.extension + 10;
          run.phase = 'flowing';
          run.phaseT = 0;
          sfx.flowArrive(run.line.id);
          sfx.startHum(`plant-${run.side}`, run.line.id, run.line.pulseHz);
          hw.humOn = true;
          buzz(this.world, 'both', 0.5, 120);
        }
      }
    } else {
      target = 1;
    }
    run.energy += (target - run.energy) * Math.min(1, delta * 6);
    for (const seg of hw.segments) {
      const u = seg.pourMat.uniforms;
      u.uTime.value = this.clock;
      u.uFront.value = run.front;
      u.uEnergy.value = run.energy;
    }
  }

  private stopRunHum(run: FactoryRun): void {
    const hw = this.runHw.get(run.side);
    if (hw?.humOn) {
      sfx.stopHum(`plant-${run.side}`);
      hw.humOn = false;
    }
    const gland = this.unitRefs.get(run.targetUnit)?.gland;
    if (gland) gland.iris.visible = true;
  }

  private tickRetract(run: FactoryRun, hw: RunHw, delta: number): void {
    if (hw.humOn) {
      sfx.stopHum(`plant-${run.side}`);
      hw.humOn = false;
    }
    run.phaseT += delta;
    const t = Math.min(1, run.phaseT / FACTORY.retractS);
    const ease = 1 - (1 - t) ** 2;
    const ext = run.extension + (TUBE.stubLength - run.extension) * ease;
    run.head.copy(run.pointA).addScaledVector(run.normalA, ext);
    run.headVisual.copy(run.head);
    this.layTube(run, hw, ext, false);
    if (t >= 1) {
      run.phase = 'pull';
      run.extension = TUBE.stubLength;
      run.front = -1;
      run.phaseT = 0;
      run.lastDetent = Math.floor(TUBE.stubLength / TUBE.detentPitch);
      run.lastSections = 1;
      sfx.seatClunk();
    }
  }

  /** Both grips (or the tool's driven pair) against ONE run's collar —
   *  TubeSystem.readHands, forked with a per-run gate: acquisition only
   *  while no other run is held. */
  private readHands(run: FactoryRun): {
    holding: boolean;
    rattling: boolean;
    rattleHand: 'left' | 'right';
    mid: Vector3;
    aim: Vector3 | null;
  } {
    if (this.driven.active && this.driven.side === run.side) {
      _mid.copy(this.driven.pos);
      return { holding: true, rattling: false, rattleHand: 'right', mid: _mid, aim: null };
    }
    if (this.driven.active) {
      _mid.copy(run.headVisual);
      return { holding: false, rattling: false, rattleHand: 'right', mid: _mid, aim: null };
    }

    const otherHeld = plant.runs.some((r) => r !== run && r.held);
    const grips = this.world.playerSpaceEntities?.gripSpaces;
    const objL = grips?.left?.object3D;
    const objR = grips?.right?.object3D;
    let holding = 0;
    let rattleHand: 'left' | 'right' = 'right';
    if (objL) objL.getWorldPosition(_handL);
    if (objR) objR.getWorldPosition(_handR);
    for (const [hand, obj, pos] of [
      ['left', objL, _handL],
      ['right', objR, _handR],
    ] as const) {
      if (!obj) continue;
      // A hand that's carrying a part is spoken for.
      if (this.carried[hand] !== undefined) continue;
      const gp = this.input.xr.gamepads[hand];
      const pressed =
        (gp?.getButtonPressed(InputComponent.Squeeze) ?? false) ||
        (gp?.getButtonPressed(InputComponent.Trigger) ?? false);
      const isNear = pos.distanceTo(run.headVisual) < TUBE.grabReach;
      if (run.held) {
        const grip = Math.max(
          gp?.getButtonValue(InputComponent.Squeeze) ?? 0,
          gp?.getButtonValue(InputComponent.Trigger) ?? 0,
        );
        if (pressed || grip > TUBE.holdSqueeze) holding++;
      } else if (isNear && pressed && !otherHeld) {
        holding++;
        rattleHand = hand;
      }
    }
    const rattling = !run.held && holding === 1;
    _mid.copy(_handL).add(_handR).multiplyScalar(0.5);

    let aim: Vector3 | null = null;
    const rays = this.world.playerSpaceEntities?.raySpaces;
    const rayL = rays?.left?.object3D;
    const rayR = rays?.right?.object3D;
    if (rayL && rayR) {
      rayL.getWorldDirection(_aimL).negate();
      rayR.getWorldDirection(_aimSum).negate().add(_aimL);
      if (_aimSum.lengthSq() > 0.5) aim = _aimSum.normalize();
    }
    return { holding: holding === 2, rattling, rattleHand, mid: _mid, aim };
  }

  /** TubeSystem.layTube, forked verbatim onto the FactoryRun record. */
  private layTube(run: FactoryRun, hw: RunHw, ext: number, entering: boolean): void {
    _mouth.copy(run.pointA);
    const maxExt = TUBE.maxLength + reachBonus();
    bendControl(_mouth, run.normalA, ext, _p1);
    if (entering) {
      _entry.copy(run.normalB);
    } else {
      _chord.copy(run.headVisual).sub(_mouth).normalize();
      if (run.held && run.aimOk) {
        _entry
          .copy(_chord)
          .multiplyScalar(1 - TUBE.steerBlend)
          .addScaledVector(run.aim, TUBE.steerBlend);
        if (_entry.lengthSq() < 0.01) _entry.copy(_chord);
        _entry.normalize().negate();
      } else {
        _entry.copy(_chord).negate();
      }
    }
    endControl(run.headVisual, _entry, ext, _p2, run.held && run.aimOk && !entering ? TUBE.steerReach : 1);

    const spans = segmentSpans(ext, maxExt);
    const extSafe = Math.max(0.001, ext);
    for (let i = 0; i < hw.segments.length; i++) {
      const seg = hw.segments[i];
      const span = spans[i];
      const on = Boolean(span);
      seg.shell.visible = on;
      seg.rib.visible = on;
      if (!span) {
        seg.pour.visible = false;
        continue;
      }
      pathPoint(_mouth, _p1, _p2, run.headVisual, span.s0 / extSafe, _pA);
      pathPoint(_mouth, _p1, _p2, run.headVisual, Math.min(1, span.s1 / extSafe), _pB);
      _tangent.copy(_pB).sub(_pA);
      let chord = _tangent.length();
      if (chord < 1e-5) {
        pathTangent(_mouth, _p1, _p2, run.headVisual, span.s0 / extSafe, _tangent);
        chord = span.s1 - span.s0;
      } else {
        _tangent.divideScalar(chord);
      }
      _quat.setFromUnitVectors(UP_Y, _tangent);
      seg.shell.position.copy(_pA).add(_pB).multiplyScalar(0.5);
      seg.shell.quaternion.copy(_quat);
      seg.shell.scale.set(span.radius, chord + SHELL_PAD, span.radius);
      const pour0 = span.s0 - (span.index === 0 ? 0.03 : Math.min(TUBE.pourOverlap, span.s0));
      pathPoint(_mouth, _p1, _p2, run.headVisual, pour0 / extSafe, _point);
      _tangent.copy(_pB).sub(_point);
      const pourChord = Math.max(0.01, _tangent.length());
      _tangent.normalize();
      seg.pour.position.copy(_point).add(_pB).multiplyScalar(0.5);
      seg.pour.quaternion.copy(_quat.setFromUnitVectors(UP_Y, _tangent));
      seg.pour.scale.set(span.radius * 0.87, pourChord, span.radius * 0.87);
      seg.pourMat.uniforms.uS0.value = pour0;
      seg.pourMat.uniforms.uS1.value = span.s1;
      pathTangent(_mouth, _p1, _p2, run.headVisual, Math.min(1, span.s1 / extSafe), _tangent);
      seg.rib.position.copy(_pB);
      seg.rib.quaternion.copy(_quat.setFromUnitVectors(FWD_Z, _tangent));
    }

    pathTangent(_mouth, _p1, _p2, run.headVisual, 1, _tangent);
    hw.collar.group.position.copy(run.headVisual);
    hw.collar.group.quaternion.copy(_quat.setFromUnitVectors(FWD_Z, _tangent));
  }

  private tickCollarTell(run: FactoryRun, hw: RunHw): void {
    const breathe = 0.5 + 0.5 * Math.sin(this.clock * 2.6);
    if (run.phase === 'pull') {
      if (run.magnet) {
        hw.collar.capMat.opacity = 0.95;
        hw.collar.glowMat.opacity = 0.5;
      } else if (run.held) {
        hw.collar.capMat.opacity = 0.7;
        hw.collar.glowMat.opacity = 0.28;
      } else {
        hw.collar.capMat.opacity = 0.4 + 0.35 * breathe;
        hw.collar.glowMat.opacity = 0.12 + 0.16 * breathe;
      }
    } else {
      hw.collar.capMat.opacity = 0.25;
      hw.collar.glowMat.opacity = 0.1;
    }
    // Free glands breathe their guides while any collar is loose or held
    // — and SWIVEL: a seated gland holds its run's line, a free one
    // turns to face whichever tube is nearest your hands. The box you
    // are walking a tube toward opens its door as you come.
    const wanting = plant.runs.some((r) => r.phase === 'pull');
    for (const unit of plant.units) {
      const gland = this.unitRefs.get(unit.id)?.gland;
      if (!gland) continue;
      const seated = runSeatedAt(unit.id);
      gland.guideMat.opacity = seated ? 0 : wanting ? 0.12 + 0.16 * breathe : 0.06;
      gland.glowMat.opacity = seated ? 0.45 : 0.15;

      let toward: Vector3 | undefined;
      if (seated) {
        toward = seated.pointA;
      } else {
        let bestD = Infinity;
        cellCenter(unit.i, unit.j, _c);
        for (const run of plant.runs) {
          if (run.phase !== 'pull') continue;
          const d = (run.headVisual.x - _c.x) ** 2 + (run.headVisual.z - _c.z) ** 2;
          if (d < bestD) {
            bestD = d;
            toward = run.headVisual;
          }
        }
      }
      this.poseGland(unit, gland.group, toward);
    }
  }

  /** Swing a gland's collar round its unit to face `toward` (world), or
   *  home to the back face. The mesh is a child of the unit's rotated
   *  group, so the world direction is folded back through that yaw. */
  private poseGland(unit: (typeof plant.units)[number], group: Group, toward?: Vector3): void {
    glandPose(unit, _g, _gn, toward);
    const d = DIRS[unit.rot];
    const yaw = Math.atan2(d.di, d.dj);
    const cos = Math.cos(yaw);
    const sin = Math.sin(yaw);
    const lx = _gn.x * cos - _gn.z * sin;
    const lz = _gn.x * sin + _gn.z * cos;
    const reach = UNITS.crate.size / 2 + 0.01;
    group.position.set(lx * reach, UNITS.glandHeight, lz * reach);
    group.rotation.y = Math.atan2(lx, lz);
  }

  /* ── events, parts, dressing, the plate ───────────────────────────────── */

  private drainEvents(): void {
    for (const ev of plant.events.splice(0)) {
      if (ev.kind === 'craft') {
        sfx.segmentClick(3);
      } else if (ev.kind === 'deliver') {
        sfx.sectionArrive(1);
        this.dockFlash = 1;
      } else if (ev.kind === 'bank') {
        sfx.uiHover();
        this.dockFlash = 0.6;
      } else if (ev.kind === 'feed-wake') {
        sfx.wallKnock();
        sfx.socketWake();
        if (ev.side) this.feedFlash.set(ev.side, 1);
      } else if (ev.kind === 'post') {
        sfx.stampDone();
      } else if (ev.kind === 'complete') {
        sfx.stampDone();
        sfx.ceremonyChord();
        orderComplete();
      }
    }
  }

  private renderParts(): void {
    const counts = new Map<ItemId, number>();
    const grips = this.world.playerSpaceEntities?.gripSpaces;
    for (const part of plant.parts) {
      const pools = this.partPools.get(part.item);
      const locals = this.partLocals.get(part.item);
      if (!pools || !locals) continue;
      const idx = counts.get(part.item) ?? 0;
      if (idx >= 64) continue;
      counts.set(part.item, idx + 1);
      let born = this.partSeen.get(part.id);
      if (born === undefined) {
        born = this.clock;
        this.partSeen.set(part.id, born);
      }
      const age = this.clock - born;
      // A part is BORN with a punch — the one moment that says "the
      // maker made something", which playtest never once saw.
      const punch = age < 0.4 ? 1 + 1.4 * (1 - age / 0.4) ** 3 : 1;
      const inHand = part.at.kind === 'hand';
      if (inHand) {
        const obj = grips?.[(part.at as { hand: 'left' | 'right' }).hand]?.object3D;
        if (obj) obj.getWorldPosition(_pA);
        else partPose(part, _pA);
      } else {
        partPose(part, _pA);
      }
      // A slow idle turn, offset per part — parts at rest read as alive;
      // a part in the fist holds still.
      const spin = inHand ? 0 : this.clock * 0.7 + part.id * 1.3;
      _q.setFromAxisAngle(UP_Y, spin);
      _m4.compose(_pA, _q, _v3.set(punch, punch, punch));
      for (let c = 0; c < pools.length; c++) {
        _m4b.multiplyMatrices(_m4, locals[c]);
        pools[c].setMatrixAt(idx, _m4b);
      }
    }
    if (this.partSeen.size > 256) {
      const live = new Set(plant.parts.map((p) => p.id));
      for (const id of [...this.partSeen.keys()]) if (!live.has(id)) this.partSeen.delete(id);
    }
    for (const [item, pools] of this.partPools) {
      const n = counts.get(item) ?? 0;
      for (const pool of pools) {
        pool.count = n;
        pool.instanceMatrix.needsUpdate = true;
      }
    }
  }

  /** The working tells: craft lamps pulse, the maker's piston bobs, the
   *  combiner's clamp presses, and the dock's halo breathes — flashing
   *  when a delivery lands. (The COUNT lives on the Ⓐ card, not in the
   *  room — the halo only says "it went in".) */
  private tickUnitDressing(delta: number): void {
    this.dockFlash = Math.max(0, this.dockFlash - delta * 2.2);
    const breathe = 0.5 + 0.5 * Math.sin(this.clock * 2.2);
    for (const unit of plant.units) {
      const refs = this.unitRefs.get(unit.id);
      if (!refs) continue;
      const crafting = unit.craftT >= 0;
      if (refs.lampMat) {
        refs.lampMat.opacity = crafting
          ? 0.35 + 0.35 * (0.5 + 0.5 * Math.sin(this.clock * 6))
          : 0.12;
      }
      if (refs.anim) {
        const stroke = crafting ? (0.5 + 0.5 * Math.sin(this.clock * 7)) * refs.anim.travel : 0;
        refs.anim.mesh.position.y = refs.anim.baseY + stroke;
      }
      if (refs.halo) {
        refs.halo.opacity = 0.16 + 0.14 * breathe + 0.55 * this.dockFlash;
      }
    }
  }
}
