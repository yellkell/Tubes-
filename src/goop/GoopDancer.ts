/**
 * THE GOOP — the thing in the vat, and the last thing in TUBES.
 *
 * This is RAVE RAID's headliner, brought across whole and then stripped
 * of everything that made it a boxer. The body is identical: twenty
 * blobs on underdamped springs (goop/sim.ts) fused by a smooth-min into
 * one raymarched isosurface (goop/gelMaterial.ts), wearing the club's
 * own dance stances (goop/dancePoses.ts). What did NOT come across is
 * the fight — no moveset, no telegraphs, no KO, no torn-off lumps, no
 * hit detection. Nothing in a factory throws a jab.
 *
 * What is new here is the BIRTH. In the club the creature was simply
 * present; in TUBES you make it. It forms inside a glass tank on your
 * actual floor, climbs out over the rim, drops onto the boards, stands
 * up out of a puddle, and then dances until you leave. `birth` is that
 * whole arc as one 0..1 number the system above drives.
 *
 * Local space is the creature's own (origin on the floor under it, +Y
 * up, facing +Z), and the group carries scale — the sim always runs
 * man-sized so every proportion in goopConfig stays true; the parent
 * scales it down to something that fits in a workshop.
 */

import {
  BoxGeometry,
  CanvasTexture,
  Group,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  PlaneGeometry,
  SphereGeometry,
  Vector3,
} from 'three';
import { CREATURE, GEL_LOOK } from './goopConfig.js';
import { createGelMaterial, type GelUniforms } from './gelMaterial.js';
import { A } from './poses.js';
import { GoopSim } from './sim.js';
import type { StylePoseDelta } from './dancePoses.js';

const _v = new Vector3();
const _v2 = new Vector3();
const _v3 = new Vector3();
const _m = new Matrix4();

/** The contact shadow that grounds it on your REAL floor. Without this
 *  a passthrough creature reads as a sticker; with it, it is standing
 *  in the room. */
function shadowTexture(): CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 128;
  const g = c.getContext('2d')!;
  const grad = g.createRadialGradient(64, 64, 6, 64, 64, 62);
  grad.addColorStop(0, 'rgba(4, 12, 6, 0.6)');
  grad.addColorStop(0.7, 'rgba(4, 12, 6, 0.3)');
  grad.addColorStop(1, 'rgba(4, 12, 6, 0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 128);
  return new CanvasTexture(c);
}

export class GoopDancer {
  readonly group = new Group();
  readonly sim = new GoopSim();

  private gel: GelUniforms;
  private gelMesh: Mesh;
  private shadow: Mesh;
  private shadowMat: MeshBasicMaterial;
  private eyeL: Group;
  private eyeR: Group;
  private eyeMats: MeshBasicMaterial[] = [];
  private blinkTimer = 2.4;
  private blink = 0;

  /** 0 = a dome of gel, 1 = up on its feet. Eased toward `formTarget`. */
  private form = 0;
  private formTarget = 0;

  /** How fast the body oozes into a new stance (per second). The club's
   *  slow re-pour is 1.6; a dancer hitting a shape on the beat wants a
   *  snap, so the finale runs this hot. */
  styleEase = 6;

  private styleO = new Float32Array(20 * 3);
  private styleR = new Float32Array(20).fill(1);

  private facePoint = new Vector3(0, 1.5, 1);
  private yaw = 0;
  private time = 0;
  private prevPos = new Vector3();
  private prevVel = new Vector3();
  private playerLocal = new Vector3(0, 1.6, 2);

  constructor() {
    this.group.name = 'the-goop';

    this.gel = createGelMaterial();
    // A unit box the vertex shader inflates to the sim's live AABB.
    this.gelMesh = new Mesh(new BoxGeometry(2, 2, 2), this.gel.material);
    this.gelMesh.frustumCulled = false;
    this.gelMesh.renderOrder = 2; // after the opaque eyes, so blending sees them
    this.group.add(this.gelMesh);

    this.shadowMat = new MeshBasicMaterial({
      map: shadowTexture(),
      transparent: true,
      depthWrite: false,
    });
    this.shadow = new Mesh(new PlaneGeometry(1, 1), this.shadowMat);
    this.shadow.rotation.x = -Math.PI / 2;
    this.shadow.position.y = 0.004;
    this.shadow.renderOrder = 0;
    this.group.add(this.shadow);

    // THE EYES are the whole personality: two glossy beads that ride
    // wherever the gel surface happens to be, found by walking the field
    // outward from the head blob. They sink into the dome while it is
    // forming and surface as it stands up, for free.
    const mkEye = (): Group => {
      const g = new Group();
      const ball = new MeshBasicMaterial({ color: 0x101b10 });
      this.eyeMats.push(ball);
      g.add(new Mesh(new SphereGeometry(0.046, 16, 12), ball));
      const glint = new Mesh(
        new SphereGeometry(0.013, 8, 6),
        new MeshBasicMaterial({ color: 0xf4fff2 }),
      );
      glint.position.set(0.015, 0.017, 0.035);
      g.add(glint);
      this.group.add(g);
      return g;
    };
    this.eyeL = mkEye();
    this.eyeR = mkEye();
  }

  /** 0 = slump into the dome, 1 = stand up. */
  setForm(f: 0 | 1): void {
    this.formTarget = f;
  }

  get formValue(): number {
    return this.form;
  }

  /** Strike a stance: per-anchor deltas over the standing pose, oozed
   *  into over `styleEase`. Null returns it to neutral. */
  setStance(pose: ReadonlyArray<StylePoseDelta> | null): void {
    this.styleO.fill(0);
    this.styleR.fill(1);
    if (!pose) return;
    for (const [i, dx, dy, dz, rs] of pose) {
      this.styleO[i * 3] = dx;
      this.styleO[i * 3 + 1] = dy;
      this.styleO[i * 3 + 2] = dz;
      this.styleR[i] = rs;
    }
  }

  /** What it should look at (world) — normally your head. */
  faceToward(worldPos: Vector3): void {
    this.facePoint.copy(worldPos);
  }

  /** Its head, in world space — for anything that wants to point at it. */
  headWorld(out: Vector3): Vector3 {
    this.sim.corePos(A.HEAD, out);
    this.group.updateMatrixWorld();
    return this.group.localToWorld(out);
  }

  update(dt: number, playerHeadWorld: Vector3): void {
    this.time += dt;

    // Form easing — the pour from dome to dancer.
    const rate = dt / CREATURE.formTime;
    const gap = this.formTarget - this.form;
    this.form += Math.sign(gap) * Math.min(rate, Math.abs(gap));
    this.sim.form = this.form;

    // Face you, yaw only, springily. A gel creature that snaps to face
    // you reads as a turret; one that leans round reads as alive.
    _v.copy(this.facePoint).sub(this.group.position);
    _v.y = 0;
    if (_v.lengthSq() > 1e-5) {
      const target = Math.atan2(_v.x, _v.z);
      let d = target - this.yaw;
      while (d > Math.PI) d -= Math.PI * 2;
      while (d < -Math.PI) d += Math.PI * 2;
      this.yaw += d * Math.min(1, dt * (1.4 + this.form * 2.2));
    }
    this.group.rotation.set(0, this.yaw, 0);

    // INERTIA: when the root accelerates (climbing out of the tank, or a
    // hop), the mass lags and then catches up. This is most of what sells
    // "it is full of liquid" while it moves.
    if (dt > 1e-4) {
      _v.copy(this.group.position).sub(this.prevPos).divideScalar(dt);
      _v2.copy(_v).sub(this.prevVel);
      this.prevVel.copy(_v);
      this.prevPos.copy(this.group.position);
      _v2.clampLength(0, 6);
      // The group only ever yaws, so the inverse rotation is a plain
      // 2D turn — cheaper and clearer than round-tripping a quaternion.
      const cos = Math.cos(-this.yaw);
      const sin = Math.sin(-this.yaw);
      const lx = _v2.x * cos - _v2.z * sin;
      const lz = _v2.x * sin + _v2.z * cos;
      this.sim.applyInertia(-lx * 0.5, -_v2.y * 0.5, -lz * 0.5);
    }

    this.group.updateMatrixWorld();
    this.playerLocal.copy(playerHeadWorld);
    this.group.worldToLocal(this.playerLocal);

    // Ooze toward the live stance.
    const sk = Math.min(1, dt * this.styleEase);
    for (let i = 0; i < this.styleO.length; i++) {
      this.sim.styleOffsets[i] += (this.styleO[i] - this.sim.styleOffsets[i]) * sk;
    }
    for (let i = 0; i < this.styleR.length; i++) {
      this.sim.styleRadius[i] += (this.styleR[i] - this.sim.styleRadius[i]) * sk;
    }

    this.sim.update(dt);

    // Feed the raymarcher: the blob soup, its AABB, and the inverse of
    // the mesh's world matrix (the march runs in creature space).
    this.sim.bounds(_v, _v2);
    this.gelMesh.updateMatrixWorld();
    _m.copy(this.gelMesh.matrixWorld).invert();
    this.gel.update(
      this.sim.packed,
      this.sim.packedCount,
      this.sim.packedDents,
      this.sim.packedDentCount,
      _v,
      _v2,
      this.time,
      this.sim.agitation,
      0,
      _m,
    );
    this.gel.material.uniforms.uBlend.value = CREATURE.blend * this.sim.blendScale;

    const spread = Math.max(_v2.x, _v2.z) * 2.4;
    this.shadow.scale.set(spread, spread, 1);
    this.shadow.position.x = _v.x;
    this.shadow.position.z = _v.z;
    this.shadowMat.opacity = 0.55;

    // It is small and it is close: full step budget unless you walk off.
    const dist = this.group.position.distanceTo(playerHeadWorld);
    this.gel.setQuality(dist < 3 ? 1 : 3 / dist);

    this.updateEyes(dt, playerHeadWorld);
  }

  /** The eyes ride the surface — walked outward from the head blob along
   *  the gaze until the field says we have popped out of the gel. */
  private updateEyes(dt: number, playerHeadWorld: Vector3): void {
    this.blinkTimer -= dt;
    if (this.blinkTimer <= 0) {
      this.blinkTimer = 2.2 + Math.random() * 3.4;
      this.blink = 1;
    }
    this.blink = Math.max(0, this.blink - dt * 7);
    const lid = 1 - Math.min(1, this.blink * 1.6) * 0.92;

    this.sim.corePos(A.HEAD, _v);
    _v3.copy(this.playerLocal).sub(_v);
    _v3.y *= 0.4; // level-ish: it looks at you, it doesn't crane
    if (_v3.lengthSq() < 1e-6) _v3.set(0, 0, 1);
    _v3.normalize();

    const place = (eye: Group, side: number): void => {
      const ang = 0.3 * side;
      const dx = _v3.x * Math.cos(ang) - _v3.z * Math.sin(ang);
      const dz = _v3.x * Math.sin(ang) + _v3.z * Math.cos(ang);
      _v2.set(dx, _v3.y, dz);
      let s = 0.05;
      for (let i = 0; i < 9; i++) {
        _v.set(
          this.sim.packed[A.HEAD * 4] + _v2.x * s,
          this.sim.packed[A.HEAD * 4 + 1] + _v2.y * s,
          this.sim.packed[A.HEAD * 4 + 2] + _v2.z * s,
        );
        if (this.sim.fieldAt(_v) > -0.02) break;
        s += 0.045;
      }
      eye.position.set(_v.x - _v2.x * 0.02, _v.y - _v2.y * 0.02, _v.z - _v2.z * 0.02);
      eye.scale.set(1, lid, 1);
      eye.lookAt(playerHeadWorld);
    };
    place(this.eyeL, 1);
    place(this.eyeR, -1);

    for (const m of this.eyeMats) m.color.setRGB(0.06, 0.1, 0.06);
  }

  /** Everything this owns, back to the driver. */
  dispose(): void {
    this.group.removeFromParent();
    this.gelMesh.geometry.dispose();
    this.gel.material.dispose();
    this.shadow.geometry.dispose();
    this.shadowMat.map?.dispose();
    this.shadowMat.dispose();
    for (const eye of [this.eyeL, this.eyeR]) {
      eye.traverse((o) => {
        const m = o as Mesh;
        if (m.isMesh) {
          m.geometry.dispose();
          (m.material as MeshBasicMaterial).dispose();
        }
      });
      eye.removeFromParent();
    }
  }
}

/** The palette, exported so the vat's glass and the goop can be checked
 *  against each other by eye — they are meant to be the same stuff. */
export const GOOP_GREEN = GEL_LOOK.shallowColor;
