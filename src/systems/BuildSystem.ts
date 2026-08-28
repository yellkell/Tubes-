/**
 * BuildSystem — stamping plant onto the lattice.
 *
 * Phase 0 of the factory (FACTORY.md): one placeholder unit, the CRATE —
 * a bench-height stand wearing the shop's hairlines — placed with the
 * flange's own grammar: the ghost rides the right controller's ray onto
 * the floor, snaps to the grid cell under it, and the trigger stamps it
 * on. Occupied cells refuse with the one-hand rattle (the game's word
 * for "no"); Ⓑ over a standing crate unbolts it.
 *
 * The lattice is world-anchored (floor/grid.ts), whole-cell-inside-the-
 * tape only, and every stamp re-feeds the plant bounds that stop the
 * tape's sides from crossing standing work.
 *
 * Placement lives on the FLOOR screen for now — the wrist catalogue
 * (phase 3) will carry it into the shift proper. The crates themselves
 * stand on every screen: plant persists, that's the law.
 */

import { createSystem, InputComponent } from '@iwsdk/core';
import {
  AdditiveBlending,
  BoxGeometry,
  CylinderGeometry,
  EdgesGeometry,
  Group,
  LineBasicMaterial,
  LineSegments,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  Vector3,
} from 'three';
import { UNITS } from '../config.js';
import * as sfx from '../audio/sfx.js';
import { buzz } from '../game/haptics.js';
import { site } from '../game/state.js';
import {
  cellCenter,
  cellInFloor,
  occupiedCells,
  occupiedCount,
  occupy,
  unitAt,
  vacate,
  worldToCell,
  type Cell,
} from '../floor/grid.js';
import { floorAdjust, nearestSide } from '../floor/plan.js';
import { PointerRay } from '../ui/pointer.js';

/** Headless/dev hooks (wired into __tubes in main.ts). */
export const buildView: {
  /** The cell under the reticle right now (null = no honest aim). */
  aim?: () => (Cell & { free: boolean }) | null;
  placeAt?: (i: number, j: number) => boolean;
  removeAt?: (i: number, j: number) => boolean;
  count?: () => number;
  cells?: () => Cell[];
} = {};

const _origin = new Vector3();
const _dir = new Vector3();
const _hand = new Vector3();
const _c = { x: 0, z: 0 };

interface Crate {
  group: Group;
  i: number;
  j: number;
}

export class BuildSystem extends createSystem({}) {
  private pointer!: PointerRay;
  private ghost!: Group;
  private ghostMat!: MeshBasicMaterial;
  private focus!: LineSegments;
  private crates = new Map<number, Crate>();
  private nextId = 1;
  private clock = 0;

  /* shared geometry/materials — a shop of crates is matrix updates */
  private boxGeo = new BoxGeometry(1, 1, 1);
  private boxEdges = new EdgesGeometry(new BoxGeometry(1, 1, 1));
  private legGeo = new CylinderGeometry(1, 1, 1, 10);
  private shellMat = new MeshStandardMaterial({ color: 0x3a332c, roughness: 0.5, metalness: 0.8 });
  private edgeMat = new LineBasicMaterial({ color: 0xffa22e, transparent: true, opacity: 0.35 });

  init(): void {
    this.pointer = new PointerRay(this.scene);

    // The ghost: the crate's silhouette in hologram amber.
    this.ghostMat = new MeshBasicMaterial({
      color: 0xffa22e,
      transparent: true,
      opacity: 0.16,
      blending: AdditiveBlending,
      depthWrite: false,
    });
    this.ghost = this.buildCrateShape(this.ghostMat, null);
    this.ghost.visible = false;
    this.scene.add(this.ghost);

    // The focus frame: marks the standing crate under the reticle.
    this.focus = new LineSegments(
      this.boxEdges,
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

    buildView.aim = () => this.currentAim();
    buildView.placeAt = (i, j) => this.place(i, j);
    buildView.removeAt = (i, j) => this.remove(i, j);
    buildView.count = () => occupiedCount();
    buildView.cells = () => occupiedCells();
  }

  update(delta: number): void {
    this.clock += delta;

    const active = site.screen === 'floor' && floorAdjust.initialized;
    if (!active) {
      this.ghost.visible = false;
      this.focus.visible = false;
      this.pointer.hide();
      this.lastAim = null;
      return;
    }

    // The right hand aims (the flange convention). A hand that's holding
    // — or hovering — the tape belongs to the tape.
    const rayObj = this.world.playerSpaceEntities?.raySpaces?.right?.object3D;
    const pad = this.input.xr.gamepads.right;
    const gripObj = (
      this.world as {
        playerSpaceEntities?: { gripSpaces?: { right?: { object3D?: import('three').Object3D } } };
      }
    ).playerSpaceEntities?.gripSpaces?.right?.object3D;
    let handOnTape = floorAdjust.grabbed !== null;
    if (!handOnTape && gripObj) {
      gripObj.getWorldPosition(_hand);
      handOnTape = nearestSide({ x: _hand.x, y: _hand.y, z: _hand.z }) !== null;
    }
    if (!rayObj || handOnTape) {
      this.ghost.visible = false;
      this.focus.visible = false;
      this.pointer.hide();
      this.lastAim = null;
      return;
    }

    rayObj.getWorldPosition(_origin);
    rayObj.getWorldDirection(_dir).negate();

    // The ray onto the floor plane.
    let cell: Cell | null = null;
    let point: Vector3 | null = null;
    if (_dir.y < -0.05) {
      const t = -_origin.y / _dir.y;
      if (t > 0.05 && t < 9) {
        point = _hand.copy(_origin).addScaledVector(_dir, t);
        cell = worldToCell(point.x, point.z);
      }
    }

    const occupied = cell ? unitAt(cell.i, cell.j) : undefined;
    const legal = cell !== null && cellInFloor(cell.i, cell.j);
    const free = legal && occupied === undefined;
    this.lastAim = cell ? { ...cell, free } : null;

    // The ghost stands on the cell it would take; the focus frame marks
    // a crate already standing there.
    if (cell && free) {
      cellCenter(cell.i, cell.j, _c);
      this.ghost.position.set(_c.x, 0, _c.z);
      this.ghost.visible = true;
      const breathe = 0.5 + 0.5 * Math.sin(this.clock * 3.2);
      this.ghostMat.opacity = 0.12 + 0.08 * breathe;
    } else {
      this.ghost.visible = false;
    }
    if (cell && occupied !== undefined) {
      const s = UNITS.crate.size + 0.03;
      cellCenter(cell.i, cell.j, _c);
      this.focus.position.set(_c.x, UNITS.crate.benchTop - UNITS.crate.height / 2, _c.z);
      this.focus.scale.set(s, UNITS.crate.height + 0.03, s);
      this.focus.visible = true;
    } else {
      this.focus.visible = false;
    }

    this.pointer.update(delta, _origin, point, free || occupied !== undefined);

    if (pad?.getButtonDown(InputComponent.Trigger) && cell) {
      if (free) {
        this.pointer.click();
        this.place(cell.i, cell.j);
        buzz(this.world, 'right', 0.6, 50);
      } else {
        // Off the site, or the cell's taken — the game's word for "no".
        sfx.oneHandRattle();
        buzz(this.world, 'right', 0.25, 40);
      }
    }
    if (pad?.getButtonDown(InputComponent.B_Button) && cell && occupied !== undefined) {
      this.remove(cell.i, cell.j);
      buzz(this.world, 'right', 0.4, 40);
    }
  }

  private lastAim: (Cell & { free: boolean }) | null = null;

  private currentAim(): (Cell & { free: boolean }) | null {
    return this.lastAim ? { ...this.lastAim } : null;
  }

  /* ── the plant ────────────────────────────────────────────────────────── */

  private place(i: number, j: number): boolean {
    if (!cellInFloor(i, j)) return false;
    const id = this.nextId;
    if (!occupy(i, j, id)) return false;
    this.nextId++;
    const group = this.buildCrateShape(this.shellMat, this.edgeMat);
    cellCenter(i, j, _c);
    group.position.set(_c.x, 0, _c.z);
    this.scene.add(group);
    this.crates.set(id, { group, i, j });
    sfx.mountThunk();
    return true;
  }

  private remove(i: number, j: number): boolean {
    const id = unitAt(i, j);
    if (id === undefined) return false;
    const crate = this.crates.get(id);
    if (crate) {
      crate.group.removeFromParent();
      this.crates.delete(id);
    }
    vacate(i, j);
    sfx.boltSpin();
    return true;
  }

  /** One crate: a bench-height box on a leg. Shared geometry, scaled into
   *  place; `edges` null skips the hairlines (the ghost draws its own). */
  private buildCrateShape(
    shell: MeshStandardMaterial | MeshBasicMaterial,
    edges: LineBasicMaterial | null,
  ): Group {
    const { size, height, benchTop, legRadius } = UNITS.crate;
    const group = new Group();
    const box = new Mesh(this.boxGeo, shell);
    box.scale.set(size, height, size);
    box.position.y = benchTop - height / 2;
    group.add(box);
    const leg = new Mesh(this.legGeo, shell);
    const legH = benchTop - height;
    leg.scale.set(legRadius, legH, legRadius);
    leg.position.y = legH / 2;
    group.add(leg);
    if (edges) {
      const frame = new LineSegments(this.boxEdges, edges);
      frame.scale.copy(box.scale);
      frame.position.copy(box.position);
      group.add(frame);
    }
    return group;
  }
}
