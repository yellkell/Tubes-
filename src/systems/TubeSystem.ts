/**
 * TubeSystem — the tube in your hands, and every piece of run hardware.
 *
 * This system owns the physical shift: it builds the flange the moment a
 * mount lands, irises the socket awake on cue, and then runs THE PULL —
 * the game's whole feel, five rules deep:
 *
 *  1. TWO HANDS OR NOTHING. Both grips inside reach, both squeezing, and
 *     the collar is yours. One hand squeezing alone RATTLES it — a shake,
 *     a loose clank, a buzz in that hand — which is the entire tutorial.
 *  2. THE LAG IS THE WEIGHT — AND THE WRISTS ARE THE RUDDER. The head
 *     chases the two-hand midpoint through an exponential spring whose
 *     stiffness falls as the tube lengthens: a stub answers your
 *     wrists, seven metres of plant answers your shoulders. And while
 *     it's yours, the collar AIMS: where the two controllers point
 *     blends into the head's travel (TUBE.steerBlend), so tipping your
 *     hands bows the run on command instead of the curve only knowing
 *     where you stand. No physics engine — one lerp rate and one blend.
 *  3. THE RATCHET TELLS THE TRUTH. Every detentPitch of travel clicks in
 *     the hands and the ears; every SECTION arrival lands a proper clank
 *     one plate deeper. Pulling tube out of a wall should feel like
 *     winning it.
 *  4. PARKED IS A REAL STATE. Let go mid-carry and the free end sags
 *     onto its own weight with one underdamped boing and WAITS — held by
 *     the wall, resumable, never punishing.
 *  5. THE SOCKET DOES THE LAST METRE. Inside the snap window, roughly
 *     square, the magnet takes the head: the guide flares, the head
 *     eases onto the seat pose (the path sweeping in along the socket's
 *     normal), and the latch dogs slam whether or not the hands hang on.
 *     Offering it up is enough — TUBES does not fail the willing.
 *
 * FlowSystem reads this system's hardware registry to drive the pour;
 * this file never touches a flow uniform except to zero a fresh one.
 */

import { InputComponent, createSystem } from '@iwsdk/core';
import { Group, Quaternion, Vector3 } from 'three';
import { SEAT, TUBE, WAKE } from '../config.js';
import * as sfx from '../audio/sfx.js';
import { buzz } from '../game/haptics.js';
import { site, type RunState } from '../game/state.js';
import { mountQuaternion } from '../room/walls.js';
import {
  buildCollar,
  buildFlange,
  buildSegment,
  buildSocket,
  type CollarRefs,
  type FlangeRefs,
  type SegmentRefs,
  type SocketRefs,
} from '../tube/build.js';
import {
  bendControl,
  endControl,
  maxExtensionFor,
  pathPoint,
  pathTangent,
  runLength,
  segmentSpans,
} from '../tube/geometry.js';
import { walls } from './WallSystem.js';

/** Everything one run owns in the scene. FlowSystem reads this registry
 *  (pour materials, socket refs) — the one shared surface. */
export interface RunHardware {
  root: Group;
  flange: FlangeRefs;
  socket: SocketRefs;
  segments: SegmentRefs[];
  collar: CollarRefs;
  /** The pull's live state. */
  held: boolean;
  magnet: boolean;
  /** THE STEER: where the wrists say the head travels (world, unit),
   *  and whether the hands are agreeing enough to say it. */
  aim: Vector3;
  aimOk: boolean;
  /** Parked droop: current sag (m) and its settle velocity. */
  droop: number;
  droopVel: number;
  /** Ratchet bookkeeping. */
  lastDetent: number;
  lastSections: number;
  rattleCool: number;
  strainCool: number;
  /** The seat ease (0..1 once the magnet takes). */
  seatP: number;
  /** Scratch: where the head is DRAWN (logical head + droop). */
  headVisual: Vector3;
}

/** Hardware per run index — rebuilt with the shift, torn down with it. */
export const runHardware: Array<RunHardware | null> = [];

/** Headless/dev hooks (wired into __tubes in main.ts). */
export const tubeView: {
  state?: () => Array<{
    phase: RunState['phase'];
    ext: number;
    held: boolean;
    magnet: boolean;
    head: { x: number; y: number; z: number };
  }>;
  /** Take the collar with two virtual hands (placed ON it). */
  grab?: () => boolean;
  /** Move the virtual hands (world space). */
  dragTo?: (x: number, y: number, z: number) => void;
  /** Open the virtual hands. */
  release?: () => void;
} = {};

const UP_Y = new Vector3(0, 1, 0);
const FWD_Z = new Vector3(0, 0, 1);
const DOWN = new Vector3(0, -1, 0);

const _mouth = new Vector3();
const _p1 = new Vector3();
const _p2 = new Vector3();
const _entry = new Vector3();
const _target = new Vector3();
const _handL = new Vector3();
const _handR = new Vector3();
const _chord = new Vector3();
const _aimL = new Vector3();
const _aimSum = new Vector3();
const _point = new Vector3();
const _tangent = new Vector3();
const _quat = new Quaternion();
const _seat = new Vector3();
const _dir = new Vector3();

export class TubeSystem extends createSystem({}) {
  private lastGeneration = -1;
  private clock = 0;
  /** The tool-driven hands: when active they replace both grips. */
  private driven = { active: false, pos: new Vector3() };

  init(): void {
    tubeView.state = () =>
      site.runs.map((r, i) => ({
        phase: r.phase,
        ext: r.extension,
        held: runHardware[i]?.held ?? false,
        magnet: runHardware[i]?.magnet ?? false,
        head: { x: r.head.x, y: r.head.y, z: r.head.z },
      }));
    tubeView.grab = () => {
      const run = this.workedRun();
      const hw = run ? runHardware[site.activeRun] : null;
      if (!run || !hw) return false;
      this.driven.active = true;
      this.driven.pos.copy(hw.headVisual);
      return true;
    };
    tubeView.dragTo = (x, y, z) => {
      this.driven.pos.set(x, y, z);
    };
    tubeView.release = () => {
      this.driven.active = false;
    };
  }

  private workedRun(): RunState | null {
    if (site.screen !== 'shift' || site.activeRun < 0) return null;
    const run = site.runs[site.activeRun];
    return run && run.phase === 'pull' ? run : null;
  }

  update(delta: number): void {
    this.clock += delta;

    if (this.lastGeneration !== site.generation) {
      this.lastGeneration = site.generation;
      this.teardown();
    }

    for (let i = 0; i < site.runs.length; i++) {
      const run = site.runs[i];
      if (run.phase === 'pending' || run.phase === 'place') continue;
      const hw = (runHardware[i] ??= this.buildHardware(run));
      this.poseStatics(run, hw);
      this.tickWake(run, hw);
      // Under the JOB CARD the pull freezes where it stands — the hands
      // belong to the card, and a parked tube can wait forever anyway.
      if (run.phase === 'pull' && !site.paused) this.tickPull(run, hw, i, delta);
      if (run.phase === 'seated' || run.phase === 'flowing') this.layTube(run, hw, run.extension, true);
      this.tickCollarTell(run, hw, delta);
    }
  }

  /* ── build / teardown ─────────────────────────────────────────────────── */

  private buildHardware(run: RunState): RunHardware {
    const root = new Group();
    const flange = buildFlange(run.line);
    const socket = buildSocket(run.line);
    const collar = buildCollar(run.line);
    const segments: SegmentRefs[] = [];
    for (let s = 0; s < TUBE.segments; s++) {
      const seg = buildSegment(run.line, s);
      segments.push(seg);
      root.add(seg.shell, seg.rib, seg.pour);
    }
    socket.group.visible = false; // the wake reveals it
    root.add(flange.group, socket.group, collar.group);
    this.scene.add(root);

    // A fresh tube is a capped stub straight out of the wall.
    this.mouthOf(run, flange, _mouth);
    run.extension = TUBE.stubLength;
    run.head.copy(_mouth).addScaledVector(run.normalA, TUBE.stubLength);

    return {
      root,
      flange,
      socket,
      segments,
      collar,
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
      headVisual: run.head.clone(),
    };
  }

  private teardown(): void {
    for (const hw of runHardware) {
      if (!hw) continue;
      hw.root.removeFromParent();
      for (const seg of hw.segments) seg.pourMat.dispose();
      hw.flange.glowMat.dispose();
      hw.socket.glowMat.dispose();
      hw.socket.guideMat.dispose();
      hw.collar.capMat.dispose();
      hw.collar.glowMat.dispose();
    }
    runHardware.length = 0;
    this.driven.active = false;
  }

  /** Where the tube leaves the flange (a touch off the plaster). */
  private mouthOf(run: RunState, flange: FlangeRefs, out: Vector3): Vector3 {
    return out.copy(run.pointA).addScaledVector(run.normalA, flange.mouthOffset);
  }

  private poseStatics(run: RunState, hw: RunHardware): void {
    const wallA = walls.find((w) => w.id === run.wallA);
    const wallB = walls.find((w) => w.id === run.wallB);
    hw.flange.group.position.copy(run.pointA);
    if (wallA) hw.flange.group.quaternion.copy(mountQuaternion(wallA, _quat));
    hw.socket.group.position.copy(run.pointB);
    if (wallB) hw.socket.group.quaternion.copy(mountQuaternion(wallB, _quat));
  }

  /* ── the wake (socket theatre — poses only; sounds live in placement) ── */

  private tickWake(run: RunState, hw: RunHardware): void {
    if (run.phase === 'wake') {
      const p = run.phaseT;
      if (p >= WAKE.socketAt) {
        hw.socket.group.visible = true;
        // A quick stamp-in: overshoot ease on the socket's scale.
        const t = Math.min(1, (p - WAKE.socketAt) / 0.35);
        const s = 0.8 + 0.2 * (1 - (1 - t) ** 3) + 0.05 * Math.sin(t * Math.PI);
        hw.socket.group.scale.setScalar(s);
      }
      // The tube starts life visible as its capped stub.
      this.layTube(run, hw, run.extension, false);
    } else if (hw.socket.group.visible) {
      hw.socket.group.scale.setScalar(1);
    } else if (run.phase !== 'pending') {
      hw.socket.group.visible = true;
    }
  }

  /* ── the pull ─────────────────────────────────────────────────────────── */

  private tickPull(run: RunState, hw: RunHardware, runIndex: number, delta: number): void {
    this.mouthOf(run, hw.flange, _mouth);
    hw.rattleCool = Math.max(0, hw.rattleCool - delta);
    hw.strainCool = Math.max(0, hw.strainCool - delta);

    const maxExt = maxExtensionFor(runLength(_mouth, _seat.copy(run.pointB)));

    // Where are the hands, and how many of them are ON the collar?
    const hands = this.readHands(hw);
    run.hands = hands.near;
    if (hands.aim) hw.aim.copy(hands.aim);
    hw.aimOk = hands.aim !== null;

    if (!hw.magnet) {
      if (hands.holding && !hw.held) {
        hw.held = true;
        hw.droop = 0;
        hw.droopVel = 0;
        sfx.grabLatch();
        buzz(this.world, 'both', 0.35, 30);
      } else if (!hands.holding && hw.held) {
        hw.held = false;
        // Parked: the free end takes its own weight.
        sfx.droopSettle();
      } else if (!hw.held && hands.rattling && hw.rattleCool <= 0) {
        hw.rattleCool = TUBE.rattleCooldownS;
        sfx.oneHandRattle();
        buzz(this.world, hands.rattleHand, 0.25, 25);
      }
    }

    if (hw.held && !hw.magnet) {
      // THE LAG IS THE WEIGHT: stiffness falls as the tube lengthens.
      const reach = (run.extension - TUBE.stubLength) / Math.max(0.001, maxExt - TUBE.stubLength);
      const k = TUBE.followStiffness + (TUBE.followStiffnessFar - TUBE.followStiffness) * reach;
      const ease = 1 - Math.exp(-k * delta);
      run.head.lerp(hands.mid, ease);

      // The stops: never shorter than the stub, never past the ceiling.
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
        if (hw.strainCool <= 0) {
          hw.strainCool = 0.9;
          sfx.strainCreak();
          buzz(this.world, 'both', 0.5, 70);
        }
      } else if (ext < TUBE.stubLength) {
        ext = TUBE.stubLength;
        run.head.copy(_mouth).addScaledVector(_dir, ext);
      }

      // The ratchet: fine detents, and the section clanks over them.
      const detent = Math.floor(ext / TUBE.detentPitch);
      if (detent !== hw.lastDetent) {
        hw.lastDetent = detent;
        sfx.segmentClick(detent);
        buzz(this.world, 'both', 0.18, 14);
      }
      const sections = segmentSpans(ext, maxExt).length;
      if (sections > hw.lastSections) {
        sfx.sectionArrive(sections - 1);
        buzz(this.world, 'both', 0.4, 40);
      }
      hw.lastSections = sections;
      run.extension = ext;
    }

    // Parked droop: one underdamped settle onto the sag, then stillness.
    const droopTarget =
      hw.held || hw.magnet
        ? 0
        : Math.min(TUBE.droopMax, run.extension * TUBE.droopPerMetre);
    const spring = 60 / TUBE.droopSettleS;
    hw.droopVel += (droopTarget - hw.droop) * spring * delta;
    hw.droopVel *= Math.exp(-4.2 * delta);
    hw.droop += hw.droopVel * delta;

    hw.headVisual.copy(run.head).addScaledVector(DOWN, hw.droop);

    // THE SOCKET DOES THE LAST METRE.
    _seat.copy(run.pointB).addScaledVector(run.normalB, hw.socket.seatOffset);
    if (!hw.magnet && hw.held) {
      const close = hw.headVisual.distanceTo(_seat) < SEAT.snapRadius;
      if (close) {
        // Arriving roughly square: the tube's travel vs INTO the socket.
        _entry.copy(_seat).sub(_mouth).normalize();
        if (_entry.dot(_dir.copy(run.normalB).negate()) > SEAT.alignDot) {
          hw.magnet = true;
          hw.seatP = 0;
          sfx.magnetTake();
          buzz(this.world, 'both', 0.3, 120);
        }
      }
    }
    if (hw.magnet) {
      hw.seatP = Math.min(1, hw.seatP + delta / (SEAT.magnetS + SEAT.seatS));
      const e = 1 - (1 - hw.seatP) ** 3;
      run.head.lerp(_seat, e);
      hw.headVisual.copy(run.head);
      run.extension = Math.max(TUBE.stubLength, runLength(_mouth, run.head));
      if (hw.seatP >= 1) this.seat(run, hw, runIndex, _mouth, _seat);
    }

    this.layTube(run, hw, run.extension, hw.magnet);
  }

  private seat(run: RunState, hw: RunHardware, runIndex: number, mouth: Vector3, seat: Vector3): void {
    run.phase = 'seated';
    run.phaseT = 0;
    run.head.copy(seat);
    run.extension = runLength(mouth, seat);
    hw.held = false;
    hw.magnet = false;
    hw.droop = 0;
    this.driven.active = false;
    site.fx.push({ kind: 'seat', runIndex });
    sfx.seatClunk();
    sfx.latchDogs();
    if (run.line.id === 'mains') sfx.steamHiss();
    else if (run.line.id === 'coolant') sfx.hydraulicSigh();
    else sfx.arcZap();
    buzz(this.world, 'both', 0.9, 90);
    // The iris opens for the pour.
    hw.socket.iris.visible = false;
  }

  /** Both grip poses → held / rattling / midpoint / the wrists' aim.
   *  The tools' driven hands substitute both grips and run the same
   *  rules (aimless — a tool steers by position, and the chord serves). */
  private readHands(hw: RunHardware): {
    holding: boolean;
    rattling: boolean;
    rattleHand: 'left' | 'right';
    near: number;
    mid: Vector3;
    aim: Vector3 | null;
  } {
    if (this.driven.active) {
      // Tool hands are ideal hands: both on the collar, both squeezing.
      _target.copy(this.driven.pos);
      return { holding: true, rattling: false, rattleHand: 'right', near: 2, mid: _target, aim: null };
    }

    const grips = this.world.playerSpaceEntities?.gripSpaces;
    const objL = grips?.left?.object3D;
    const objR = grips?.right?.object3D;
    let near = 0;
    let holding = 0;
    let rattling = false;
    let rattleHand: 'left' | 'right' = 'right';
    if (objL) objL.getWorldPosition(_handL);
    if (objR) objR.getWorldPosition(_handR);
    for (const [hand, obj, pos] of [
      ['left', objL, _handL],
      ['right', objR, _handR],
    ] as const) {
      if (!obj) continue;
      const gp = this.input.xr.gamepads[hand];
      const squeezing =
        (gp?.getButtonPressed(InputComponent.Squeeze) ?? false) ||
        (gp?.getButtonPressed(InputComponent.Trigger) ?? false);
      const isNear = pos.distanceTo(hw.headVisual) < TUBE.grabReach;
      if (isNear) near++;
      if (isNear && squeezing) {
        holding++;
        rattleHand = hand;
      }
    }
    if (holding === 1) rattling = true;
    _target.copy(_handL).add(_handR).multiplyScalar(0.5);

    // THE STEER: the two pointers' average forward. Rays, not grips —
    // "point the collar where you want the bend" is the same grammar as
    // every laser in the game. Hands pointing hard against each other
    // cancel out (a short sum) and the steer politely stands down.
    let aim: Vector3 | null = null;
    const rays = this.world.playerSpaceEntities?.raySpaces;
    const rayL = rays?.left?.object3D;
    const rayR = rays?.right?.object3D;
    if (rayL && rayR) {
      rayL.getWorldDirection(_aimL).negate();
      rayR.getWorldDirection(_aimSum).negate().add(_aimL);
      if (_aimSum.lengthSq() > 0.5) aim = _aimSum.normalize();
    }
    return { holding: holding === 2, rattling, rattleHand, near, mid: _target, aim };
  }

  /* ── laying the tube along its path ───────────────────────────────────── */

  private layTube(run: RunState, hw: RunHardware, ext: number, entering: boolean): void {
    this.mouthOf(run, hw.flange, _mouth);
    const maxExt = maxExtensionFor(runLength(_mouth, _seat.copy(run.pointB)));
    bendControl(_mouth, run.normalA, ext, _p1);
    // The head's arrival direction: the socket's normal once seating (or
    // seated); held, the wrists' steer blended into the straight chord;
    // parked, the chord alone — with the cap facing OUTWARD along the
    // travel, the way a tube's face looks where the tube is going.
    if (entering) {
      _entry.copy(run.normalB);
    } else {
      _chord.copy(hw.headVisual).sub(_mouth).normalize();
      if (hw.held && hw.aimOk) {
        _entry
          .copy(_chord)
          .multiplyScalar(1 - TUBE.steerBlend)
          .addScaledVector(hw.aim, TUBE.steerBlend);
        // Wrists dead against the chord: no direction survives the
        // blend, so the run falls straight rather than folding.
        if (_entry.lengthSq() < 0.01) _entry.copy(_chord);
        _entry.normalize().negate();
      } else {
        _entry.copy(_chord).negate();
      }
    }
    endControl(hw.headVisual, _entry, ext, _p2, hw.held && hw.aimOk && !entering ? TUBE.steerReach : 1);

    const spans = segmentSpans(ext, maxExt);
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
      const sMid = (span.s0 + span.s1) / 2;
      const len = span.s1 - span.s0;
      const tMid = Math.min(1, sMid / Math.max(0.001, ext));
      pathPoint(_mouth, _p1, _p2, hw.headVisual, tMid, _point);
      pathTangent(_mouth, _p1, _p2, hw.headVisual, tMid, _tangent);
      _quat.setFromUnitVectors(UP_Y, _tangent);
      seg.shell.position.copy(_point);
      seg.shell.quaternion.copy(_quat);
      seg.shell.scale.set(span.radius, len + 0.024, span.radius);
      // THE POUR IS ONE COLUMN. Each section's volume tucks back through
      // its own joint into the fatter section behind it (the root tucks
      // into the flange's gland), so the seam, the bend wedge and the
      // joint ring all sit over lit glow instead of a gap — the column
      // reads as one pour stepping down in bore, exactly what a
      // telescope full of liquid would do. The uniforms carry the
      // STRETCHED span, so the front's arc-length clip stays world-true
      // straight through the overlap: both volumes cut on the same s.
      const pour0 = span.s0 - (span.index === 0 ? 0.03 : Math.min(TUBE.pourOverlap, span.s0));
      const pourLen = span.s1 - pour0;
      const tPour = Math.min(1, (pour0 + span.s1) / 2 / Math.max(0.001, ext));
      pathPoint(_mouth, _p1, _p2, hw.headVisual, tPour, _point);
      pathTangent(_mouth, _p1, _p2, hw.headVisual, tPour, _tangent);
      seg.pour.position.copy(_point);
      seg.pour.quaternion.copy(_quat.setFromUnitVectors(UP_Y, _tangent));
      seg.pour.scale.set(span.radius * 0.82, pourLen, span.radius * 0.82);
      seg.pourMat.uniforms.uS0.value = pour0;
      seg.pourMat.uniforms.uS1.value = span.s1;
      // The joint collar at this section's outer end.
      const tEnd = Math.min(1, span.s1 / Math.max(0.001, ext));
      pathPoint(_mouth, _p1, _p2, hw.headVisual, tEnd, _point);
      pathTangent(_mouth, _p1, _p2, hw.headVisual, tEnd, _tangent);
      seg.rib.position.copy(_point);
      seg.rib.quaternion.copy(_quat.setFromUnitVectors(FWD_Z, _tangent));
    }

    // The collar caps the head, facing out along the final tangent.
    pathTangent(_mouth, _p1, _p2, hw.headVisual, 1, _tangent);
    hw.collar.group.position.copy(hw.headVisual);
    hw.collar.group.quaternion.copy(_quat.setFromUnitVectors(FWD_Z, _tangent));
  }

  /* ── the collar's tell ────────────────────────────────────────────────── */

  private tickCollarTell(run: RunState, hw: RunHardware, _delta: number): void {
    // Capped and waiting: breathe. Held: steady. Magnetized: flare.
    // Seated/flowing: the cap goes quiet — the pour is the light now.
    const breathe = 0.5 + 0.5 * Math.sin(this.clock * 2.6);
    if (run.phase === 'pull') {
      if (hw.magnet) {
        hw.collar.capMat.opacity = 0.95;
        hw.collar.glowMat.opacity = 0.5;
        hw.socket.guideMat.opacity = 0.75;
      } else if (hw.held) {
        hw.collar.capMat.opacity = 0.7;
        hw.collar.glowMat.opacity = 0.28;
        hw.socket.guideMat.opacity = 0.3 + 0.2 * breathe;
      } else {
        hw.collar.capMat.opacity = 0.4 + 0.35 * breathe;
        hw.collar.glowMat.opacity = 0.12 + 0.16 * breathe;
        hw.socket.guideMat.opacity = 0.1 + 0.14 * breathe;
      }
    } else {
      hw.collar.capMat.opacity = 0.25;
      hw.collar.glowMat.opacity = 0.1;
      hw.socket.guideMat.opacity = 0;
    }
  }
}
