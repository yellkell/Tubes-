/**
 * BuildSystem — stamping plant onto the lattice.
 *
 * The flange's own grammar, aimed at the floor: arm a unit type from the
 * wrist card, and its ghost rides the right controller's ray onto the
 * grid cell under it — the ARROW on the ghost is the unit's OUT face,
 * quantized from where the controller points, so a belt runs the way
 * your hand says and a maker's chute faces where you'll stand. Trigger
 * stamps it on; an occupied or off-site cell refuses with the one-hand
 * rattle. Ⓑ over standing plant unbolts in two honest steps: a unit
 * with a seated supply run gives the run up first (it telescopes home),
 * a bare unit comes off the floor.
 *
 * This system MUTATES the plant only (factory/sim.ts's doors) — meshes
 * belong to FactorySystem. Placement is armed on the FACTORY screen;
 * the headless hooks work anywhere (the floor walk stamps site crates
 * before any shift exists, which the catalogue permits by design).
 */

import { createSystem, InputComponent } from '@iwsdk/core';
import {
  AdditiveBlending,
  BoxGeometry,
  CircleGeometry,
  EdgesGeometry,
  Group,
  LineBasicMaterial,
  LineSegments,
  Mesh,
  MeshBasicMaterial,
  Vector3,
} from 'three';
import { UNITS, type UnitType } from '../config.js';
import * as sfx from '../audio/sfx.js';
import { buzz } from '../game/haptics.js';
import { site } from '../game/state.js';
import {
  cellCenter,
  cellInFloor,
  occupiedCells,
  occupiedCount,
  worldToCell,
  type Cell,
} from '../floor/grid.js';
import {
  WALL_BOUND,
  placeUnit,
  placementFor,
  removeUnit,
  retractRun,
  unitAvailable,
} from '../factory/sim.js';
import { plant, runSeatedAt, unitAtCell, type Rot } from '../factory/state.js';
import { PointerRay } from '../ui/pointer.js';

/** Headless/dev hooks (wired into __tubes in main.ts). */
export const buildView: {
  /** The cell under the reticle right now (null = no honest aim). */
  aim?: () => (Cell & { free: boolean }) | null;
  /** Arm a type for the hologram (null disarms). The card drives this. */
  arm?: (type: UnitType | null) => void;
  armed?: () => UnitType | null;
  placeAt?: (i: number, j: number, type?: UnitType, rot?: Rot) => boolean;
  removeAt?: (i: number, j: number) => boolean;
  count?: () => number;
  cells?: () => Cell[];
  /** What the live catalogue offers, and which of it is wall plant. */
  catalogue?: () => { available: UnitType[]; wallBound: UnitType[] };
} = {};

const _origin = new Vector3();
const _dir = new Vector3();
const _hit = new Vector3();
const _c = { x: 0, z: 0 };

export class BuildSystem extends createSystem({}) {
  private pointer!: PointerRay;
  private ghost!: Group;
  private ghostMat!: MeshBasicMaterial;
  private arrowMat!: MeshBasicMaterial;
  private focus!: LineSegments;
  private armed: UnitType | null = null;
  private clock = 0;
  private lastAim: (Cell & { free: boolean }) | null = null;

  init(): void {
    this.pointer = new PointerRay(this.scene);

    // The ghost: a bench silhouette with the OUT arrow — one shape for
    // every type (the stamp reveals the real chassis; the ghost's job is
    // the cell and the facing).
    this.ghostMat = new MeshBasicMaterial({
      color: 0xffa22e,
      transparent: true,
      opacity: 0.16,
      blending: AdditiveBlending,
      depthWrite: false,
    });
    this.arrowMat = this.ghostMat.clone();
    this.arrowMat.opacity = 0.5;
    this.ghost = new Group();
    const { size, height, benchTop } = UNITS.crate;
    const box = new Mesh(new BoxGeometry(size, height, size), this.ghostMat);
    box.position.y = benchTop - height / 2;
    this.ghost.add(box);
    const arrow = new Mesh(new CircleGeometry(0.05, 3), this.arrowMat);
    arrow.rotation.x = -Math.PI / 2;
    arrow.rotation.z = Math.PI; // point along local +Z
    arrow.position.set(0, benchTop + 0.01, size / 2 + 0.06);
    this.ghost.add(arrow);
    this.ghost.visible = false;
    this.scene.add(this.ghost);

    this.focus = new LineSegments(
      new EdgesGeometry(new BoxGeometry(1, 1, 1)),
      new LineBasicMaterial({
        color: 0xffa22e,
        transparent: true,
        opacity: 0.9,
        blending: AdditiveBlending,
        depthWrite: false,
      }),
    );
    this.focus.visible = false;
    this.scene.add(this.focus);

    buildView.aim = () => (this.lastAim ? { ...this.lastAim } : null);
    buildView.arm = (type) => {
      this.armed = type;
    };
    buildView.armed = () => this.armed;
    buildView.placeAt = (i, j, type = 'chest', rot = 0) => {
      const unit = placeUnit(type, i, j, rot);
      return unit !== null;
    };
    buildView.removeAt = (i, j) => {
      const unit = unitAtCell(i, j);
      if (!unit) return false;
      removeUnit(unit);
      return true;
    };
    buildView.catalogue = () => ({
      available: (['dock', 'maker', 'belt', 'combiner', 'chest'] as UnitType[]).filter((t) =>
        unitAvailable(t),
      ),
      wallBound: [...WALL_BOUND],
    });
    buildView.count = () => occupiedCount();
    buildView.cells = () => occupiedCells();
  }

  update(delta: number): void {
    this.clock += delta;

    const active = site.screen === 'factory' && !site.paused;
    if (site.screen !== 'factory') this.armed = null;
    if (!active) {
      this.hideAim();
      return;
    }

    const rayObj = this.world.playerSpaceEntities?.raySpaces?.right?.object3D;
    const pad = this.input.xr.gamepads.right;
    if (!rayObj) {
      this.hideAim();
      return;
    }
    rayObj.getWorldPosition(_origin);
    rayObj.getWorldDirection(_dir).negate();

    // The ray onto the floor plane.
    let cell: Cell | null = null;
    if (_dir.y < -0.05) {
      const t = -_origin.y / _dir.y;
      if (t > 0.05 && t < 9) {
        _hit.copy(_origin).addScaledVector(_dir, t);
        cell = worldToCell(_hit.x, _hit.z);
      }
    }
    const occupied = cell ? unitAtCell(cell.i, cell.j) : undefined;
    const inFloor = cell !== null && cellInFloor(cell.i, cell.j);
    const free = inFloor && occupied === undefined;
    this.lastAim = cell ? { ...cell, free } : null;

    // Facing: the controller's yaw, quantized to the lattice — except for
    // WALL PLANT (the dock, the combiner), which only stands on the
    // site's edge and takes that edge's inward facing. Sweep the ray
    // across open floor with a dock armed and no ghost appears: the
    // refusal reads before the trigger ever does.
    const yaw = Math.atan2(_dir.x, _dir.z);
    const handRot = ((((2 - Math.round(yaw / (Math.PI / 2))) % 4) + 4) % 4) as Rot;
    const facing =
      this.armed && cell ? placementFor(this.armed, cell.i, cell.j, handRot) : null;
    const rot = facing ?? handRot;
    const placeable = free && facing !== null;

    // The ghost stands only when a type is armed and the cell is honest.
    if (this.armed && cell && placeable) {
      cellCenter(cell.i, cell.j, _c);
      this.ghost.position.set(_c.x, 0, _c.z);
      const d = [
        { di: 0, dj: -1 },
        { di: 1, dj: 0 },
        { di: 0, dj: 1 },
        { di: -1, dj: 0 },
      ][rot];
      this.ghost.rotation.y = Math.atan2(d.di, d.dj);
      this.ghost.visible = true;
      const breathe = 0.5 + 0.5 * Math.sin(this.clock * 3.2);
      this.ghostMat.opacity = 0.12 + 0.08 * breathe;
    } else {
      this.ghost.visible = false;
    }

    // The focus frame marks standing plant under the reticle (Ⓑ's mark).
    if (cell && occupied !== undefined) {
      const s = UNITS.crate.size + 0.03;
      cellCenter(cell.i, cell.j, _c);
      this.focus.position.set(_c.x, UNITS.crate.benchTop - UNITS.crate.height / 2, _c.z);
      this.focus.scale.set(s, UNITS.crate.height + 0.03, s);
      this.focus.visible = true;
    } else {
      this.focus.visible = false;
    }

    const aiming = Boolean(this.armed && cell) || occupied !== undefined;
    this.pointer.update(
      delta,
      _origin,
      cell ? _hit : null,
      aiming && (placeable || occupied !== undefined),
    );

    if (pad?.getButtonDown(InputComponent.Trigger) && this.armed && cell) {
      if (placeable && placeUnit(this.armed, cell.i, cell.j, rot)) {
        this.pointer.click();
        sfx.mountThunk();
        buzz(this.world, 'right', 0.6, 50);
      } else {
        sfx.oneHandRattle();
        buzz(this.world, 'right', 0.25, 40);
      }
    }
    if (pad?.getButtonDown(InputComponent.B_Button) && cell && occupied !== undefined) {
      const unit = unitAtCell(cell.i, cell.j);
      if (unit) {
        const run = runSeatedAt(unit.id);
        if (run) {
          // First press gives the supply back; the unit stands.
          retractRun(run);
          sfx.boltSpin();
        } else {
          removeUnit(unit);
          sfx.boltSpin();
        }
        buzz(this.world, 'right', 0.4, 40);
      }
    }
  }

  private hideAim(): void {
    this.ghost.visible = false;
    this.focus.visible = false;
    this.pointer.hide();
    this.lastAim = null;
  }
}

/** The catalogue's availability check, for the card's button states. */
export function typeAvailable(type: UnitType): boolean {
  if (plant.orderIndex < 0) return type === 'chest';
  if (type === 'dock' && plant.units.some((u) => u.type === 'dock')) return false;
  return plant.unitsAvailable.includes(type);
}
