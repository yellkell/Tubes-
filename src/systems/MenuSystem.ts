/**
 * MenuSystem — the work board.
 *
 * Between shifts the board floats where you're looking (re-planted in
 * front of you every time it comes back — in AR the menu comes to the
 * room, not the room to the menu), laid out like a fitter's sheet:
 *
 *   ┌──────┬──────────────────────┬─────────────────┐
 *   │ TUBES│  JOBS: the ladder    │  THE JOB SHEET  │
 *   │ JOBS │  five rows, best     │  brief · lines  │
 *   │ SYS  │  times, locks        │  best · START   │
 *   └──────┴──────────────────────┴─────────────────┘
 *
 * One rail, one content region, no floating sub-panels. The look and
 * motion contract lives in ui/panel.ts (quiet glass, hairlines, one
 * furnace-amber accent, eased everything); this file decides WHAT each
 * button is, never how it looks.
 *
 * Mid-shift the board is gone and the right controller's Ⓐ raises THE
 * JOB CARD — a small pop-up dead ahead with the sheet's live state and
 * two honest buttons: BACK TO IT, or DOWN TOOLS. Raising it pauses the
 * hands (placement and the pull ignore input under the card) but never
 * the room: a pour mid-race keeps racing, because the machine doesn't
 * know you stopped.
 */

import { InputComponent, createSystem } from '@iwsdk/core';
import { Raycaster, Vector3, type Intersection, type Object3D } from 'three';
import {
  BOARD,
  GAME_TITLE,
  ITEMS,
  JOBS,
  LINES,
  ORDERS,
  UPGRADES,
  type ItemId,
  type UnitType,
  type UpgradeId,
} from '../config.js';
import * as sfx from '../audio/sfx.js';
import { setSfxVolume, sfxVolume } from '../audio/sfx.js';
import {
  abandonFactory,
  abandonShift,
  buyUpgrade,
  enterFloorSetup,
  startJob,
  startShop,
} from '../game/flow.js';
import {
  bestMs,
  orderBestMs,
  ordersUnlocked,
  ownedUpgrades,
  resetProgress,
  unlockedJobs,
  upgradeOwned,
} from '../game/progress.js';
import { site } from '../game/state.js';
import { bankTotal, orderSpec, plant } from '../factory/state.js';
import { buildView, typeAvailable, type BuildTool } from './BuildSystem.js';
import { font } from '../ui/fonts.js';
import { Panel, UI, type PanelButton } from '../ui/panel.js';
import { PointerRay } from '../ui/pointer.js';
import { walls } from './WallSystem.js';

/** Canvas geometry of the board. */
const W = BOARD.pxW;
const H = BOARD.pxH;
const RAIL_X = 28;
const RAIL_W = 240;
const CONTENT_X = 304;
/** JOBS: the ladder rows and the sheet beside them. */
const ROW_X = CONTENT_X;
const ROW_W = 486;
const ROW_Y0 = 172;
const ROW_H = 118;
const ROW_PITCH = 134;
const SHEET_X = 822;
const SHEET_W = W - SHEET_X - 34;
/** SYSTEM rows. */
const SYS_Y0 = 196;
const SYS_PITCH = 140;

type Tab = 'jobs' | 'orders' | 'sys';

/** Headless/dev hooks (wired into __tubes in main.ts) — drive the board
 *  without controllers: hover, press, read what's offered. */
export const menuView: {
  setTab?: (t: Tab) => void;
  setHover?: (id: string | null) => void;
  setPause?: (on: boolean) => void;
  /** Press any button by id — the headless finger. */
  act?: (id: string) => void;
  /** The board's raw canvas as a data URL — pixel-perfect style checks. */
  snapBoard?: () => string;
  /** Which buttons the board is actually offering right now. */
  boardButtons?: () => string[];
  snapCard?: () => string;
  cardButtons?: () => string[];
  /** What the card's controls SAY — a label carries state the id can't
   *  (QUIT asking "SURE? PRESS AGAIN", for one). */
  cardLabels?: () => string[];
  /** Every control on the card, in card pixels — the overlap check. */
  cardRects?: () => Array<{ id: string; x: number; y: number; w: number; h: number }>;
  /** The card's pixel frame those rects have to fit inside. */
  cardLayout?: () => { w: number; h: number };
} = {};

const _origin = new Vector3();
const _dir = new Vector3();
const _fwd = new Vector3();

export class MenuSystem extends createSystem({}) {
  private board!: Panel;
  private card!: Panel;
  private pointers!: Record<'left' | 'right', PointerRay>;
  private ray = new Raycaster();
  private hits: Intersection[] = [];
  private hover: string | null = null;
  private tab: Tab = 'jobs';
  private lastKey = '';
  private clock = 0;
  /** The rail marker slides between tabs instead of teleporting. */
  private railY = NaN;
  private railTargetY = NaN;
  /** RESET PROGRESS asks twice; the arm decays after a beat. */
  private resetArm = 0;
  /** QUIT is armed, not instant. A shift card mis-click used to take a
   *  whole floor of plant with it — the same two-press confirm RESET
   *  PROGRESS has always had, for the same reason. Seconds remaining. */
  private quitArm = 0;
  private lastScreen = '';
  /** The ORDERS tab's selected sheet. */
  private orderSel = 0;
  /** The factory card's page: the catalogue, or the bank's bills. */
  private cardMode: 'build' | 'goals' | 'supply' = 'build';
  /** The GOALS page's open sheet (null = the list). */
  private goalOpen: number | null = null;

  init(): void {
    this.board = new Panel(BOARD.widthM, BOARD.heightM, W, H);
    this.scene.add(this.board.group);

    this.card = new Panel(BOARD.cardW, BOARD.cardH, BOARD.cardPx[0], BOARD.cardPx[1]);
    this.card.setShown(false, true);
    this.scene.add(this.card.group);

    this.pointers = { left: new PointerRay(this.scene), right: new PointerRay(this.scene) };

    this.plant(this.board.group, BOARD.position[1], 1.35);

    menuView.setTab = (t) => {
      this.tab = t;
      this.lastKey = '';
    };
    menuView.setHover = (id) => {
      this.hover = id;
      this.lastKey = '';
    };
    menuView.setPause = (on) => {
      site.paused = on && (site.screen === 'shift' || site.screen === 'factory');
      this.lastKey = '';
    };
    menuView.act = (id) => this.action(id);
    menuView.snapBoard = () => (this.board.ctx().canvas as HTMLCanvasElement).toDataURL('image/png');
    menuView.boardButtons = () => this.board.liveButtons();
    menuView.snapCard = () => (this.card.ctx().canvas as HTMLCanvasElement).toDataURL('image/png');
    menuView.cardButtons = () => this.card.buttonIds();
    menuView.cardRects = () => this.card.buttonRects();
    menuView.cardLabels = () => this.card.buttonLabels();
    menuView.cardLayout = () => this.card.layout();
  }

  /** Plant a panel in front of the player's face: forward on the floor
   *  plane, at a comfortable height, facing back at them. */
  private plant(group: Object3D, height: number, reach: number): void {
    this.camera.getWorldPosition(_origin);
    this.camera.getWorldDirection(_fwd);
    _fwd.y = 0;
    if (_fwd.lengthSq() < 1e-4) _fwd.set(0, 0, -1);
    _fwd.normalize();
    group.position.set(_origin.x + _fwd.x * reach, height, _origin.z + _fwd.z * reach);
    group.rotation.set(0, Math.atan2(_fwd.x, _fwd.z) + Math.PI, 0);
  }

  /** The plant's idle envelope — the under-halo's slow chug. */
  private chug(): number {
    const t = (this.clock % 2.4) / 2.4;
    const att = Math.min(1, t / 0.1);
    return att * (1 - t) ** 2;
  }

  update(delta: number): void {
    this.clock += delta;
    this.resetArm = Math.max(0, this.resetArm - delta);
    this.quitArm = Math.max(0, this.quitArm - delta);

    if (site.screen === 'shift') site.elapsedMs += delta * 1000;

    // Mid-shift (pipe jobs and factory orders alike), Ⓐ raises the card.
    const midShift = site.screen === 'shift' || site.screen === 'factory';
    if (midShift) {
      if (this.input.xr.gamepads.right?.getButtonDown(InputComponent.A_Button)) {
        sfx.uiClick();
        site.paused = !site.paused;
        if (site.paused) this.plant(this.card.group, BOARD.cardPosition[1], 1.0);
        this.lastKey = '';
      }
    } else if (site.paused) {
      site.paused = false;
    }

    const boardUp = site.screen === 'board';
    const cardUp = site.paused && midShift;

    // The board re-plants every time it comes back — you wandered.
    if (site.screen !== this.lastScreen) {
      this.lastScreen = site.screen;
      if (boardUp) {
        this.plant(this.board.group, BOARD.position[1], 1.35);
        this.lastKey = '';
      }
    }

    this.board.setShown(boardUp);
    this.card.setShown(cardUp);

    const pulse = this.chug();

    if (!boardUp && !cardUp) {
      this.pointers.left.hide();
      this.pointers.right.hide();
      this.board.tick(delta, pulse);
      this.card.tick(delta, pulse);
      return;
    }

    // Pointers + hover + click.
    const targets: Object3D[] = [];
    if (boardUp) targets.push(this.board.mesh);
    if (cardUp) targets.push(this.card.mesh);

    let hover: string | null = null;
    let clicked: string | null = null;
    let clickedPanel: Panel | null = null;
    for (const hand of ['left', 'right'] as const) {
      const hit = this.updatePointer(hand, delta, targets);
      if (hit?.uv) {
        const panel = hit.object === this.board.mesh ? this.board : this.card;
        const id = panel.buttonAt(hit.uv.x, hit.uv.y);
        if (id) {
          hover = id;
          if (this.input.xr.gamepads[hand]?.getButtonDown(InputComponent.Trigger)) {
            clicked = id;
            clickedPanel = panel;
            this.pointers[hand].click();
          }
        }
      }
    }
    if (hover !== this.hover) {
      this.hover = hover;
      this.lastKey = '';
      if (hover) sfx.uiHover();
    }
    if (clicked) {
      sfx.uiClick();
      clickedPanel?.press(clicked);
      this.action(clicked);
    }

    // The rail marker's slide.
    if (boardUp && Number.isFinite(this.railY) && Number.isFinite(this.railTargetY)) {
      const gap = this.railTargetY - this.railY;
      if (Math.abs(gap) > 0.5) {
        this.railY += gap * Math.min(1, delta / 0.09);
        this.lastKey = '';
      } else if (this.railY !== this.railTargetY) {
        this.railY = this.railTargetY;
        this.lastKey = '';
      }
    }

    this.repaintIfNeeded(boardUp, cardUp);
    this.board.tick(delta, pulse);
    this.card.tick(delta, pulse);
  }

  private updatePointer(
    hand: 'left' | 'right',
    delta: number,
    targets: Object3D[],
  ): Intersection | undefined {
    const p = this.pointers[hand];
    const rayObj = this.world.playerSpaceEntities?.raySpaces?.[hand]?.object3D;
    if (!rayObj) {
      p.hide();
      return undefined;
    }
    rayObj.getWorldPosition(_origin);
    rayObj.getWorldDirection(_dir).negate();
    this.ray.set(_origin, _dir);
    this.hits.length = 0;
    const hit = this.ray.intersectObjects(targets, false, this.hits)[0];
    const overButton = Boolean(
      hit?.uv &&
        (hit.object === this.board.mesh ? this.board : this.card).buttonAt(hit.uv.x, hit.uv.y),
    );
    p.update(delta, _origin, hit ? hit.point : null, overButton);
    return hit;
  }

  /* ── actions ──────────────────────────────────────────────────────────── */

  private action(id: string): void {
    if (id === 'tab:jobs') this.tab = 'jobs';
    else if (id === 'tab:orders') this.tab = 'orders';
    else if (id === 'tab:sys') this.tab = 'sys';
    else if (id.startsWith('job:')) {
      const i = Number(id.slice(4));
      if (i < unlockedJobs()) site.jobIndex = i;
    } else if (id === 'start') {
      startJob(site.jobIndex);
    } else if (id.startsWith('order:')) {
      const i = Number(id.slice(6));
      if (i < ordersUnlocked()) this.orderSel = i;
    } else if (id === 'start-order') {
      startShop(this.orderSel);
    } else if (id.startsWith('build:')) {
      // Arm the tool and put the card away — the hands do the rest.
      buildView.arm?.(id.slice(6) as BuildTool);
      site.paused = false;
    } else if (id === 'card:build') {
      this.cardMode = 'build';
    } else if (id === 'card:goals') {
      this.cardMode = 'goals';
    } else if (id === 'card:supply') {
      this.cardMode = 'supply';
    } else if (id === 'goal:back') {
      // BEFORE the prefix test below — 'goal:back' starts with 'goal:'
      // too, and parsing it as an index put NaN in goalOpen, which sent
      // the detail paint through ORDERS[NaN] and threw inside the paint
      // callback every frame. That is how a menu bricks a game.
      this.goalOpen = null;
    } else if (id.startsWith('goal:')) {
      const i = Number(id.slice(5));
      this.goalOpen = Number.isInteger(i) && i >= 0 && i < ORDERS.length ? i : null;
    } else if (id.startsWith('buy:')) {
      buyUpgrade(id.slice(4) as UpgradeId);
    } else if (id === 'sfx:down') {
      setSfxVolume(Math.max(0, Math.round((sfxVolume() - 0.1) * 10) / 10));
    } else if (id === 'sfx:up') {
      setSfxVolume(Math.min(1, Math.round((sfxVolume() + 0.1) * 10) / 10));
    } else if (id === 'walls:toggle') {
      site.showWalls = !site.showWalls;
    } else if (id === 'floor:set') {
      enterFloorSetup();
    } else if (id === 'reset') {
      if (this.resetArm > 0) {
        resetProgress();
        site.jobIndex = 0;
        this.resetArm = 0;
      } else {
        this.resetArm = 3;
      }
    } else if (id === 'resume') {
      site.paused = false;
      this.quitArm = 0;
    } else if (id === 'quit') {
      // Ask once. Everything standing on the floor is about to go.
      if (this.quitArm <= 0) {
        this.quitArm = 4;
        return;
      }
      this.quitArm = 0;
      site.paused = false;
      if (site.screen === 'factory') abandonFactory();
      else abandonShift();
    }
    this.lastKey = '';
  }

  /* ── painting ─────────────────────────────────────────────────────────── */

  private repaintIfNeeded(boardUp: boolean, cardUp: boolean): void {
    const runsKey = site.runs.map((r) => r.phase).join(',');
    const key = [
      site.screen,
      this.tab,
      this.hover,
      site.jobIndex,
      unlockedJobs(),
      JOBS.map((j) => bestMs(j.id) ?? 0).join(','),
      sfxVolume().toFixed(1),
      site.showWalls,
      this.resetArm > 0,
      this.quitArm > 0,
      walls.length,
      site.fallbackRoom,
      runsKey,
      this.orderSel,
      ordersUnlocked(),
      ORDERS.map((o) => orderBestMs(o.id) ?? 0).join(','),
      plant.mode,
      plant.orderIndex,
      plant.count,
      bankTotal(),
      buildView.armed?.() ?? '',
      this.cardMode,
      this.goalOpen,
      plant.goalsDone,
      buildView.armed?.() ?? '',
      ownedUpgrades().join(','),
      cardUp
        ? Math.floor((site.screen === 'factory' ? plant.elapsedMs : site.elapsedMs) / 100)
        : 0,
    ].join('|');
    if (key === this.lastKey) return;
    this.lastKey = key;
    if (boardUp) this.paintBoard();
    if (cardUp) this.paintCard();
  }

  private paintBoard(): void {
    const buttons: PanelButton[] = [];

    // The rail.
    const tabs: Array<{ id: string; tab: Tab; label: string }> = [
      { id: 'tab:jobs', tab: 'jobs', label: 'JOBS' },
      { id: 'tab:orders', tab: 'orders', label: 'ORDERS' },
      { id: 'tab:sys', tab: 'sys', label: 'SYSTEM' },
    ];
    tabs.forEach((t, i) => {
      buttons.push({
        id: t.id,
        label: t.label,
        x: RAIL_X,
        y: 172 + i * 104,
        w: RAIL_W,
        h: 90,
        selected: this.tab === t.tab,
      });
    });
    this.railTargetY = 172 + Math.max(0, tabs.findIndex((t) => t.tab === this.tab)) * 104;
    if (!Number.isFinite(this.railY)) this.railY = this.railTargetY;

    // Each tab painter installs its own body; the shared chrome fronts it.
    this.boardJobsBody = null;
    this.boardOrdersBody = null;
    this.boardSysBody = null;
    if (this.tab === 'jobs') this.paintJobs(buttons);
    else if (this.tab === 'orders') this.paintOrders(buttons);
    else this.paintSystem(buttons);

    this.board.paint('', (g) => this.paintBoardBody(g), buttons, this.hover);
  }

  /** Header chrome: the wordmark, the room status, the rail's guide line. */
  private paintChrome(g: CanvasRenderingContext2D): void {
    // Wordmark — the title stencilled on, with its service stripe.
    g.textAlign = 'left';
    g.textBaseline = 'alphabetic';
    g.font = font(700, 64);
    g.letterSpacing = '6px';
    g.fillStyle = UI.textHi;
    g.fillText(GAME_TITLE, RAIL_X + 4, 96);
    g.letterSpacing = '0px';
    const wmW = g.measureText(GAME_TITLE).width + 10;
    g.fillStyle = UI.accent;
    g.beginPath();
    g.roundRect(RAIL_X + 6, 110, Math.min(wmW, 190), 5, 2.5);
    g.fill();
    g.font = font(500, 22);
    g.fillStyle = UI.faint;
    g.fillText('THE WORKS WANTS BACK ON', RAIL_X + 226, 100);

    // Room status, top right: what the scan gave us. Walls only — the
    // floor and ceiling are registry citizens too, but "6 WALLS" over a
    // four-walled room reads as a bug, not a feature.
    const real = walls.filter((w) => w.real && w.kind === 'wall').length;
    const label = !site.wallsReady
      ? 'WAITING FOR WALLS'
      : site.fallbackRoom
        ? 'STAND-IN ROOM'
        : `ROOM SCANNED · ${real} WALL${real === 1 ? '' : 'S'}`;
    g.textAlign = 'right';
    g.font = font(600, 24);
    g.fillStyle = site.fallbackRoom || !site.wallsReady ? UI.warn : UI.positive;
    const dotX = W - 34 - g.measureText(label).width - 24;
    g.fillText(label, W - 34, 96);
    g.beginPath();
    g.arc(dotX, 88, 7, 0, Math.PI * 2);
    g.fill();

    // Hairline under the header, and the rail's guide.
    g.strokeStyle = UI.lineFaint;
    g.lineWidth = 2;
    g.beginPath();
    g.moveTo(RAIL_X, 138);
    g.lineTo(W - 32, 138);
    g.stroke();

    // The rail marker: the accent sliding to the active tab.
    if (Number.isFinite(this.railY)) {
      g.fillStyle = UI.accent;
      g.beginPath();
      g.roundRect(RAIL_X - 10, this.railY + 18, 5, 54, 2.5);
      g.fill();
    }
  }

  /* ── JOBS tab ─────────────────────────────────────────────────────────── */

  private paintJobs(buttons: PanelButton[]): void {
    const unlocked = unlockedJobs();
    JOBS.forEach((_job, i) => {
      buttons.push({
        id: `job:${i}`,
        label: '',
        ghost: true,
        disabled: i >= unlocked,
        x: ROW_X,
        y: ROW_Y0 + i * ROW_PITCH,
        w: ROW_W,
        h: ROW_H,
      });
    });
    const job = JOBS[site.jobIndex];
    const locked = site.jobIndex >= unlocked;
    buttons.push({
      id: 'start',
      label: locked ? 'LOCKED' : 'START JOB',
      sub: locked ? 'finish the sheet above it' : job.name,
      primary: !locked,
      disabled: locked || !site.wallsReady,
      x: SHEET_X + 10,
      y: H - 164,
      w: SHEET_W - 20,
      h: 112,
    });

    const hoverOf = (id: string): number => this.board.hoverOf(id);
    this.boardJobsBody = (g: CanvasRenderingContext2D): void => {
      const unlockedNow = unlockedJobs();
      JOBS.forEach((j, i) => {
        const y = ROW_Y0 + i * ROW_PITCH;
        const open = i < unlockedNow;
        const selected = i === site.jobIndex;
        const hov = hoverOf(`job:${i}`);
        // Plate.
        g.fillStyle = selected
          ? UI.accentFaint
          : `rgba(255,255,255,${(open ? 0.045 + 0.045 * hov : 0.02).toFixed(3)})`;
        g.beginPath();
        g.roundRect(ROW_X, y, ROW_W, ROW_H, 16);
        g.fill();
        g.lineWidth = 2;
        g.strokeStyle = selected
          ? 'rgba(255,162,46,0.9)'
          : `rgba(255,255,255,${(open ? 0.1 + 0.2 * hov : 0.05).toFixed(3)})`;
        g.stroke();
        if (selected) {
          g.fillStyle = UI.accent;
          g.beginPath();
          g.roundRect(ROW_X + 7, y + 12, 5, ROW_H - 24, 2.5);
          g.fill();
        }
        // Name + the run pips in their line colours.
        g.textAlign = 'left';
        g.textBaseline = 'middle';
        g.font = font(600, 33);
        g.letterSpacing = '1.5px';
        g.fillStyle = open ? UI.text : UI.disabled;
        g.fillText(`${i + 1}. ${j.name}`, ROW_X + 26, y + 36, ROW_W - 150);
        g.letterSpacing = '0px';
        j.runs.forEach((lineId, r) => {
          const line = LINES[lineId];
          g.fillStyle = open ? line.hex : 'rgba(255,255,255,0.14)';
          g.beginPath();
          g.arc(ROW_X + 34 + r * 34, y + 82, 9, 0, Math.PI * 2);
          g.fill();
        });
        // Best time (or the lock).
        g.textAlign = 'right';
        g.font = font(500, 24);
        if (!open) {
          g.fillStyle = UI.disabled;
          g.fillText('LOCKED', ROW_X + ROW_W - 22, y + 82);
        } else {
          const best = bestMs(j.id);
          g.fillStyle = best === null ? UI.faint : UI.dim;
          g.fillText(best === null ? '—' : fmtMs(best), ROW_X + ROW_W - 22, y + 82);
        }
        if (j.longHaul && open) {
          g.textAlign = 'right';
          g.font = font(500, 20);
          g.fillStyle = UI.faint;
          g.fillText('LONG HAUL', ROW_X + ROW_W - 22, y + 36);
        }
      });

      // THE JOB SHEET.
      const sel = JOBS[site.jobIndex];
      g.fillStyle = UI.well;
      g.beginPath();
      g.roundRect(SHEET_X, ROW_Y0, SHEET_W, H - ROW_Y0 - 190, 18);
      g.fill();
      g.textAlign = 'left';
      g.font = font(700, 42);
      g.letterSpacing = '2px';
      g.fillStyle = UI.textHi;
      g.fillText(sel.name, SHEET_X + 26, ROW_Y0 + 52);
      g.letterSpacing = '0px';
      wrapText(g, sel.brief, SHEET_X + 26, ROW_Y0 + 106, SHEET_W - 52, 32, font(500, 25), UI.dim);
      // The lines this sheet wants, as service chips.
      sel.runs.forEach((lineId, r) => {
        const line = LINES[lineId];
        const cx = SHEET_X + 26 + r * 172;
        const cy = ROW_Y0 + 236;
        g.fillStyle = 'rgba(255,255,255,0.04)';
        g.beginPath();
        g.roundRect(cx, cy, 156, 62, 12);
        g.fill();
        g.strokeStyle = UI.lineFaint;
        g.lineWidth = 2;
        g.stroke();
        g.fillStyle = line.hex;
        g.beginPath();
        g.arc(cx + 30, cy + 31, 11, 0, Math.PI * 2);
        g.fill();
        g.font = font(600, 25);
        g.fillStyle = UI.text;
        g.fillText(line.name, cx + 52, cy + 33);
      });
      const best = bestMs(sel.id);
      g.font = font(500, 24);
      g.fillStyle = UI.faint;
      g.fillText('BEST', SHEET_X + 26, ROW_Y0 + 356);
      g.font = font(600, 34);
      g.fillStyle = best === null ? UI.faint : UI.text;
      g.fillText(best === null ? 'no time on the sheet' : fmtMs(best), SHEET_X + 108, ROW_Y0 + 356);
      if (!site.wallsReady) {
        g.font = font(500, 23);
        g.fillStyle = UI.warn;
        g.fillText('waiting for walls — look around the room', SHEET_X + 26, ROW_Y0 + 412);
      }
    };
  }

  private boardJobsBody: ((g: CanvasRenderingContext2D) => void) | null = null;
  private boardOrdersBody: ((g: CanvasRenderingContext2D) => void) | null = null;
  private boardSysBody: ((g: CanvasRenderingContext2D) => void) | null = null;

  /* ── ORDERS tab (the factory's book) ──────────────────────────────────── */

  private targetOf(spec: (typeof ORDERS)[number]): {
    name: string;
    dots: string[];
    docket: string;
  } {
    if (spec.target.kind === 'fluid') {
      const line = LINES[spec.target.line];
      return {
        name: `${line.name} DRAUGHTS`,
        dots: [line.hex],
        docket: 'the works drinks straight from its own wall — and remembers the taste',
      };
    }
    const item = ITEMS[spec.target.item];
    return {
      name: item.name,
      dots: item.lineage.map((l) => LINES[l].hex),
      docket: item.docket,
    };
  }

  private paintOrders(buttons: PanelButton[]): void {
    const unlocked = ordersUnlocked();
    ORDERS.forEach((_o, i) => {
      buttons.push({
        id: `order:${i}`,
        label: '',
        ghost: true,
        disabled: i >= unlocked,
        x: ROW_X,
        y: ROW_Y0 + i * ROW_PITCH,
        w: ROW_W,
        h: ROW_H,
      });
    });
    this.orderSel = Math.min(this.orderSel, ORDERS.length - 1);
    const sel = ORDERS[this.orderSel];
    const locked = this.orderSel >= unlocked;
    buttons.push(
      {
        id: 'start-order',
        label: locked ? 'LOCKED' : 'OPEN THE SHOP',
        sub: locked ? 'fill the sheet above it' : sel.name,
        primary: !locked,
        disabled: locked || !site.wallsReady,
        x: SHEET_X + 10,
        y: H - 182,
        w: SHEET_W - 20,
        h: 96,
      },
      {
        id: 'shop-note',
        label: 'one shift — the goals advance as you build',
        display: true,
        small: true,
        x: SHEET_X + 10,
        y: H - 76,
        w: SHEET_W - 20,
        h: 62,
      },
    );

    const hoverOf = (id: string): number => this.board.hoverOf(id);
    this.boardOrdersBody = (g: CanvasRenderingContext2D): void => {
      const unlockedNow = ordersUnlocked();
      ORDERS.forEach((o, i) => {
        const y = ROW_Y0 + i * ROW_PITCH;
        const open = i < unlockedNow;
        const selected = i === this.orderSel;
        const hov = hoverOf(`order:${i}`);
        g.fillStyle = selected
          ? UI.accentFaint
          : `rgba(255,255,255,${(open ? 0.045 + 0.045 * hov : 0.02).toFixed(3)})`;
        g.beginPath();
        g.roundRect(ROW_X, y, ROW_W, ROW_H, 16);
        g.fill();
        g.lineWidth = 2;
        g.strokeStyle = selected
          ? 'rgba(255,162,46,0.9)'
          : `rgba(255,255,255,${(open ? 0.1 + 0.2 * hov : 0.05).toFixed(3)})`;
        g.stroke();
        if (selected) {
          g.fillStyle = UI.accent;
          g.beginPath();
          g.roundRect(ROW_X + 7, y + 12, 5, ROW_H - 24, 2.5);
          g.fill();
        }
        g.textAlign = 'left';
        g.textBaseline = 'middle';
        g.font = font(600, 33);
        g.letterSpacing = '1.5px';
        g.fillStyle = open ? UI.text : UI.disabled;
        g.fillText(`${i + 1}. ${o.name}`, ROW_X + 26, y + 36, ROW_W - 150);
        g.letterSpacing = '0px';
        const target = this.targetOf(o);
        target.dots.forEach((hex, r) => {
          g.fillStyle = open ? hex : 'rgba(255,255,255,0.14)';
          g.beginPath();
          g.arc(ROW_X + 34 + r * 30, y + 82, 9, 0, Math.PI * 2);
          g.fill();
        });
        g.font = font(500, 23);
        g.fillStyle = open ? UI.dim : UI.disabled;
        g.fillText(
          `${o.goal} × ${target.name}`,
          ROW_X + 34 + target.dots.length * 30 + 8,
          y + 82,
        );
        g.textAlign = 'right';
        g.font = font(500, 24);
        if (!open) {
          g.fillStyle = UI.disabled;
          g.fillText('LOCKED', ROW_X + ROW_W - 22, y + 82);
        } else {
          const best = orderBestMs(o.id);
          g.fillStyle = best === null ? UI.faint : UI.dim;
          g.fillText(best === null ? '—' : fmtMs(best), ROW_X + ROW_W - 22, y + 82);
        }
      });

      // THE ORDER SHEET.
      const sheet = ORDERS[this.orderSel];
      const target = this.targetOf(sheet);
      g.fillStyle = UI.well;
      g.beginPath();
      g.roundRect(SHEET_X, ROW_Y0, SHEET_W, H - ROW_Y0 - 190, 18);
      g.fill();
      g.textAlign = 'left';
      g.font = font(700, 42);
      g.letterSpacing = '2px';
      g.fillStyle = UI.textHi;
      g.fillText(sheet.name, SHEET_X + 26, ROW_Y0 + 52);
      g.letterSpacing = '0px';
      wrapText(g, sheet.brief, SHEET_X + 26, ROW_Y0 + 106, SHEET_W - 52, 32, font(500, 25), UI.dim);
      // DELIVER: the target, worn in its lineage's dots.
      g.font = font(500, 24);
      g.fillStyle = UI.faint;
      g.fillText('DELIVER', SHEET_X + 26, ROW_Y0 + 268);
      target.dots.forEach((hex, r) => {
        g.fillStyle = hex;
        g.beginPath();
        g.arc(SHEET_X + 142 + r * 30, ROW_Y0 + 264, 11, 0, Math.PI * 2);
        g.fill();
      });
      g.font = font(600, 32);
      g.fillStyle = UI.text;
      g.fillText(
        `${sheet.goal} × ${target.name}`,
        SHEET_X + 142 + target.dots.length * 30 + 12,
        ROW_Y0 + 266,
      );
      // THE DOCKET — what the works is going to DO with them.
      g.font = font(500, 22);
      g.fillStyle = UI.faint;
      wrapText(g, `docket: ${target.docket}`, SHEET_X + 26, ROW_Y0 + 312, SHEET_W - 52, 28, font(500, 22), UI.faint);
      const best = orderBestMs(sheet.id);
      g.font = font(500, 24);
      g.fillStyle = UI.faint;
      g.fillText('BEST', SHEET_X + 26, ROW_Y0 + 386);
      g.font = font(600, 34);
      g.fillStyle = best === null ? UI.faint : UI.text;
      g.fillText(best === null ? 'no time on the sheet' : fmtMs(best), SHEET_X + 108, ROW_Y0 + 386);
      const banked = bankTotal();
      g.font = font(500, 23);
      g.fillStyle = banked > 0 ? UI.dim : UI.faint;
      g.fillText(
        banked > 0 ? `the bank holds ${banked} surplus part${banked === 1 ? '' : 's'} — the card's SUPPLY page spends them` : 'the bank stands empty — surplus deliveries keep',
        SHEET_X + 26,
        ROW_Y0 + 440,
      );
      if (!site.wallsReady) {
        g.font = font(500, 23);
        g.fillStyle = UI.warn;
        g.fillText('waiting for walls — look around the room', SHEET_X + 26, ROW_Y0 + 488);
      }
    };
  }

  /* ── SYSTEM tab ───────────────────────────────────────────────────────── */

  private paintSystem(buttons: PanelButton[]): void {
    const rowW = 150;
    const valueW = 260;
    const y0 = SYS_Y0;
    buttons.push(
      { id: 'sfx:down', label: '−', x: CONTENT_X + 330, y: y0, w: rowW, h: 96, px: 48 },
      {
        id: 'sfx:vol',
        label: `${Math.round(sfxVolume() * 100)}%`,
        display: true,
        x: CONTENT_X + 330 + rowW + 16,
        y: y0,
        w: valueW,
        h: 96,
      },
      {
        id: 'sfx:up',
        label: '+',
        x: CONTENT_X + 330 + rowW + valueW + 32,
        y: y0,
        w: rowW,
        h: 96,
        px: 48,
      },
      {
        id: 'walls:toggle',
        label: site.showWalls ? 'SHOWN' : 'HIDDEN',
        selected: site.showWalls,
        x: CONTENT_X + 330,
        y: y0 + SYS_PITCH,
        w: rowW + valueW + 16,
        h: 96,
      },
      {
        id: 'floor:set',
        label: 'SET THE FLOOR',
        x: CONTENT_X + 330,
        y: y0 + SYS_PITCH * 2,
        w: rowW + valueW + 16,
        h: 96,
      },
      {
        id: 'reset',
        label: this.resetArm > 0 ? 'SURE? PRESS AGAIN' : 'RESET PROGRESS',
        tone: UI.danger,
        x: CONTENT_X + 330,
        y: y0 + SYS_PITCH * 3,
        w: rowW + valueW + 16 + rowW + 16,
        h: 96,
        small: true,
      },
    );

    this.boardSysBody = (g: CanvasRenderingContext2D): void => {
      g.textAlign = 'left';
      g.textBaseline = 'middle';
      const label = (text: string, sub: string, y: number): void => {
        g.font = font(600, 30);
        g.fillStyle = UI.text;
        g.fillText(text, CONTENT_X + 10, y + 34);
        g.font = font(500, 22);
        g.fillStyle = UI.faint;
        g.fillText(sub, CONTENT_X + 10, y + 68);
      };
      label('SOUND', 'the shop, the ratchet, the pour', SYS_Y0);
      label('WALL FRAMES', 'hairlines on what the scan found', SYS_Y0 + SYS_PITCH);
      label('THE FLOOR', 'hazard tape round the shop floor — drag the sides to your walls', SYS_Y0 + SYS_PITCH * 2);
      label('THE SHEET', 'tear it up, start the trade again', SYS_Y0 + SYS_PITCH * 3);

      const real = walls.filter((w) => w.real && w.kind === 'wall').length;
      const flats = walls.filter((w) => w.kind !== 'wall').length;
      const fake = walls.filter((w) => !w.real && w.kind === 'wall').length;
      g.font = font(500, 22);
      g.fillStyle = UI.faint;
      g.fillText(
        `room: ${real} scanned wall${real === 1 ? '' : 's'}${fake ? ` · ${fake} stand-in` : ''}${flats ? ` · floor/ceiling ports live` : ''}  ·  passthrough AR  ·  built on the Immersive Web SDK`,
        CONTENT_X + 10,
        H - 96,
      );
    };
  }

  /* ── THE JOB CARD ─────────────────────────────────────────────────────── */

  private paintCard(): void {
    if (site.screen === 'factory') {
      this.paintFactoryCard();
      return;
    }
    const [cw, ch] = BOARD.cardPx;
    const job = JOBS[site.jobIndex];
    const buttons: PanelButton[] = [
      {
        id: 'resume',
        label: 'BACK TO IT',
        primary: true,
        x: 34,
        y: ch - 118,
        w: cw / 2 - 46,
        h: 88,
      },
      {
        id: 'quit',
        label: this.quitArm > 0 ? 'SURE? PRESS AGAIN' : 'QUIT',
        tone: UI.danger,
        x: cw / 2 + 12,
        y: ch - 118,
        w: cw / 2 - 46,
        h: 88,
        small: true,
      },
    ];
    this.card.paint(
      job.name,
      (g) => {
        g.textAlign = 'left';
        g.textBaseline = 'middle';
        // The clock.
        g.textAlign = 'center';
        g.font = font(600, 34);
        g.fillStyle = UI.dim;
        g.fillText(fmtMs(site.elapsedMs), cw / 2, 132);
        // One row per run: line dot, name, where it stands.
        site.runs.forEach((run, i) => {
          const y = 176 + i * 40;
          g.textAlign = 'left';
          g.fillStyle = run.line.hex;
          g.beginPath();
          g.arc(56, y, 8, 0, Math.PI * 2);
          g.fill();
          g.font = font(600, 24);
          g.fillStyle = UI.text;
          g.fillText(run.line.name, 76, y + 1);
          g.textAlign = 'right';
          g.font = font(500, 22);
          const state =
            run.phase === 'flowing'
              ? 'FLOWING'
              : run.phase === 'seated'
                ? 'CHARGING'
                : run.phase === 'pull'
                  ? 'ON THE HOOK'
                  : run.phase === 'wake'
                    ? 'WAKING'
                    : run.phase === 'place'
                      ? 'PLACE THE FLANGE'
                      : 'WAITING';
          g.fillStyle = run.phase === 'flowing' ? UI.positive : UI.dim;
          g.fillText(state, cw - 44, y + 1);
        });
      },
      buttons,
      this.hover,
    );
  }

  /** Can the live bank cover a bill? */
  private canAfford(id: UpgradeId): boolean {
    const spec = UPGRADES.find((u) => u.id === id);
    if (!spec) return false;
    for (const [item, n] of Object.entries(spec.bill)) {
      if ((plant.bank[item as ItemId] ?? 0) < (n ?? 0)) return false;
    }
    return true;
  }

  private billText(id: UpgradeId): string {
    const spec = UPGRADES.find((u) => u.id === id);
    if (!spec) return '';
    return Object.entries(spec.bill)
      .map(([item, n]) => `${n} ${ITEMS[item as ItemId].name}`)
      .join(' + ');
  }

  /**
   * THE SHIFT CARD — Ⓐ, dead ahead, and the only menu a shift has.
   * Three pages: BUILD (the plant, plus the wrecking bar), GOALS (the
   * book, tappable for what a sheet actually asks of you) and SUPPLY
   * (the bank's bills). The live goal rides the header, so the room
   * floats nothing.
   */
  private paintFactoryCard(): void {
    const [cw, ch] = BOARD.cardPx;
    const spec = orderSpec();
    const armed = buildView.armed?.() ?? null;
    // Three columns, measured off the card instead of nailed to pixels —
    // the card grew and every hard-coded 166 would have left a gutter.
    const colW = (cw - 2 * CARD_PAD - 2 * CARD_GAP) / 3;
    const colX = (c: number): number => CARD_PAD + c * (colW + CARD_GAP);
    const tab = (id: string, label: string, on: boolean, c: number): PanelButton => ({
      id,
      label,
      small: true,
      selected: on,
      x: colX(c),
      y: 162,
      w: colW,
      h: 42,
    });
    const buttons: PanelButton[] = [
      tab('card:build', 'BUILD', this.cardMode === 'build', 0),
      tab('card:goals', 'GOALS', this.cardMode === 'goals', 1),
      tab('card:supply', 'SUPPLY', this.cardMode === 'supply', 2),
      {
        id: 'resume',
        label: 'BACK TO IT',
        primary: true,
        x: 34,
        y: ch - 84,
        w: cw / 2 - 46,
        h: 64,
      },
      {
        id: 'quit',
        label: this.quitArm > 0 ? 'SURE? PRESS AGAIN' : 'QUIT',
        tone: UI.danger,
        x: cw / 2 + 12,
        y: ch - 84,
        w: cw / 2 - 46,
        h: 64,
        small: true,
      },
    ];

    if (this.cardMode === 'build') {
      // The wrecking bar sits in the catalogue like any other tool —
      // playtest went looking for a delete and found nothing.
      const kit: Array<{ tool: BuildTool; label: string }> = [
        { tool: 'dock', label: 'BANK' },
        { tool: 'maker', label: 'MAKER' },
        { tool: 'belt', label: 'RAIL' },
        { tool: 'combiner', label: 'COMBINER' },
        { tool: 'chest', label: 'CHEST' },
        { tool: 'post', label: 'POST' },
        { tool: 'delete', label: 'DELETE' },
      ];
      kit.forEach((entry, i) => {
        buttons.push({
          id: `build:${entry.tool}`,
          label: entry.label,
          small: true,
          disabled: entry.tool === 'delete' ? false : !typeAvailable(entry.tool as UnitType),
          selected: armed === entry.tool,
          tone: entry.tool === 'delete' ? UI.danger : undefined,
          x: colX(i % 3),
          y: CARD_BODY + Math.floor(i / 3) * 66,
          w: colW,
          h: 58,
        });
      });
    } else if (this.cardMode === 'goals') {
      if (this.goalOpen === null) {
        const step = goalRowStep(ch);
        ORDERS.forEach((_o, i) => {
          buttons.push({
            id: `goal:${i}`,
            label: '',
            ghost: true,
            x: CARD_PAD,
            y: CARD_BODY + i * step,
            w: cw - 2 * CARD_PAD,
            h: step - 6,
          });
        });
      } else {
        buttons.push({
          id: 'goal:back',
          label: 'ALL GOALS',
          small: true,
          x: CARD_PAD,
          y: ch - CARD_FOOT,
          w: 190,
          h: 46,
        });
      }
    } else {
      UPGRADES.forEach((u, i) => {
        buttons.push({
          id: `buy:${u.id}`,
          label: '',
          ghost: true,
          disabled: upgradeOwned(u.id) || !this.canAfford(u.id),
          x: CARD_PAD,
          y: CARD_BODY - 6 + i * 46,
          w: cw - 2 * CARD_PAD,
          h: 42,
        });
      });
    }

    const title = spec?.name ?? (plant.goalsDone ? 'THE SHOP IS YOURS' : 'THE SHOP');
    this.card.paint(
      title,
      (g) => {
        g.textBaseline = 'middle';
        g.textAlign = 'left';
        g.font = font(500, 24);
        g.fillStyle = UI.dim;
        g.fillText(fmtMs(plant.elapsedMs), 36, 118);
        const banked = bankTotal();
        g.font = font(500, 21);
        g.fillStyle = banked > 0 ? UI.dim : UI.faint;
        g.fillText(`bank · ${banked}`, 150, 118);
        if (spec) {
          const target = this.targetOf(spec);
          g.textAlign = 'right';
          g.font = font(700, 46);
          g.fillStyle = UI.accent;
          g.fillText(`${plant.count} / ${spec.goal}`, cw - 40, 112);
          g.font = font(600, 22);
          g.fillStyle = UI.dim;
          g.fillText(target.name, cw - 40, 144);
        } else if (plant.goalsDone) {
          g.textAlign = 'right';
          g.font = font(600, 24);
          g.fillStyle = UI.accent;
          g.fillText('every sheet filled', cw - 40, 118);
          g.font = font(500, 20);
          g.fillStyle = UI.faint;
          g.fillText('build whatever you like', cw - 40, 146);
        }

        if (this.cardMode === 'goals') this.paintGoals(g, cw, ch);
        else if (this.cardMode === 'supply') this.paintBills(g, cw);
        else if (armed) {
          g.textAlign = 'center';
          g.font = font(500, 20);
          g.fillStyle = UI.faint;
          g.fillText(
            armed === 'delete'
              ? 'point at plant and pull the trigger to take it out'
              : armed === 'belt'
                ? 'stand one, then HOLD the trigger and haul the run out'
                : armed === 'post'
                  ? 'plant a stick where you want a hauled rail to bend'
                  : 'aim at the floor — it turns itself to connect, Ⓑ turns it yourself',
            cw / 2,
            ch - CARD_FOOT - 26,
          );
        }
      },
      buttons,
      this.hover,
    );
  }

  /** The book, in the card: the ladder, or one sheet opened up.
   *
   *  EVERY Y BELOW FLOWS. The first cut nailed the docket to y=280 and
   *  the steps to y=316, so a docket that wrapped to two lines printed
   *  its second line straight through the first step — and the ladder's
   *  own hint sat on the last row. Nothing here is a fixed offset any
   *  more: text advances by the lines it actually drew, and the footer
   *  band (ALL GOALS, "next ·") is reserved before the body starts. */
  private paintGoals(g: CanvasRenderingContext2D, cw: number, ch: number): void {
    const live = plant.orderIndex;
    if (this.goalOpen === null) {
      const hoverOf = (id: string): number => this.card.hoverOf(id);
      const step = goalRowStep(ch);
      const h = step - 6;
      ORDERS.forEach((o, i) => {
        const y = CARD_BODY + i * step;
        const done = plant.goalsDone || i < live;
        const now = i === live;
        const hov = hoverOf(`goal:${i}`);
        g.fillStyle = now ? UI.accentFaint : `rgba(255,255,255,${(0.03 + 0.05 * hov).toFixed(3)})`;
        g.beginPath();
        g.roundRect(CARD_PAD, y, cw - 2 * CARD_PAD, h, 8);
        g.fill();
        if (now) {
          g.fillStyle = UI.accent;
          g.beginPath();
          g.roundRect(CARD_PAD + 6, y + 7, 4, h - 14, 2);
          g.fill();
        }
        g.textAlign = 'left';
        g.font = font(600, 20);
        g.fillStyle = done ? UI.dim : now ? UI.textHi : UI.faint;
        g.fillText(`${done ? '✓' : now ? '▸' : '·'}  ${o.name}`, CARD_PAD + 20, y + h / 2);
        const t = this.targetOf(o);
        g.textAlign = 'right';
        g.font = font(500, 18);
        g.fillStyle = UI.faint;
        g.fillText(`${o.goal} × ${t.name}`, cw - CARD_PAD - 16, y + h / 2);
      });
      g.textAlign = 'center';
      g.font = font(500, 18);
      g.fillStyle = UI.faint;
      g.fillText('tap a sheet for what it asks', cw / 2, ch - CARD_FOOT - 26);
      return;
    }

    // ONE SHEET, OPENED: what it wants, how you do it, what comes next.
    const o = ORDERS[this.goalOpen];
    if (!o) {
      this.goalOpen = null;
      return;
    }
    const t = this.targetOf(o);
    const left = CARD_PAD + 2;
    const wide = cw - 2 * left;
    g.textAlign = 'left';
    g.font = font(700, 26);
    g.fillStyle = UI.textHi;
    g.fillText(o.name, left, CARD_BODY + 10);
    g.font = font(600, 20);
    g.fillStyle = UI.accent;
    g.fillText(`${o.goal} × ${t.name}`, left, CARD_BODY + 38);
    // The docket advances the cursor by however many lines it took.
    let y = CARD_BODY + 66;
    y += 22 * wrapText(g, t.docket, left, y, wide, 22, font(500, 17), UI.faint) + 14;
    // The steps stop where the footer band begins — better a sheet you
    // can read to the bottom of than one that prints over its own feet.
    const floorY = ch - CARD_FOOT - 34;
    for (const stepText of o.steps) {
      if (y > floorY) break;
      g.fillStyle = UI.accent;
      g.beginPath();
      g.arc(left + 8, y - 5, 3.5, 0, Math.PI * 2);
      g.fill();
      y += 22 * wrapText(g, stepText, left + 22, y, wide - 22, 22, font(500, 17), UI.dim) + 8;
    }
    const next = ORDERS[this.goalOpen + 1];
    g.textAlign = 'right';
    g.font = font(500, 17);
    g.fillStyle = UI.faint;
    g.fillText(
      next ? `next · ${next.name}` : 'last sheet — then the shop is yours',
      cw - CARD_PAD,
      ch - CARD_FOOT + 23,
    );
  }

  /** The bank's bills (the SUPPLY page's body). */
  private paintBills(g: CanvasRenderingContext2D, cw: number): void {
    const hoverOf = (id: string): number => this.card.hoverOf(id);
    UPGRADES.forEach((u, i) => {
      const y = CARD_BODY - 6 + i * 46;
      const owned = upgradeOwned(u.id);
      const afford = this.canAfford(u.id);
      const hov = hoverOf(`buy:${u.id}`);
      g.fillStyle = `rgba(255,255,255,${(owned ? 0.02 : 0.04 + 0.05 * hov).toFixed(3)})`;
      g.beginPath();
      g.roundRect(CARD_PAD, y, cw - 2 * CARD_PAD, 42, 10);
      g.fill();
      g.strokeStyle = owned
        ? 'rgba(255,162,46,0.35)'
        : `rgba(255,255,255,${(0.08 + 0.18 * hov).toFixed(3)})`;
      g.lineWidth = 2;
      g.stroke();
      g.textAlign = 'left';
      g.font = font(600, 20);
      g.fillStyle = owned ? UI.dim : afford ? UI.text : UI.disabled;
      g.fillText(u.name, CARD_PAD + 16, y + 15);
      g.font = font(500, 15);
      g.fillStyle = UI.faint;
      g.fillText(u.effect, CARD_PAD + 16, y + 32);
      g.textAlign = 'right';
      g.font = font(600, 17);
      if (owned) {
        g.fillStyle = UI.accent;
        g.fillText('FITTED', cw - CARD_PAD - 16, y + 22);
      } else {
        g.fillStyle = afford ? UI.positive : UI.faint;
        g.fillText(this.billText(u.id), cw - CARD_PAD - 16, y + 22);
      }
    });
  }

  /* ── shared body dispatcher ───────────────────────────────────────────── */

  /** Panel.paint takes one body; the board's is whichever tab's painter
   *  was built last, behind the shared chrome. */
  private paintBoardBody(g: CanvasRenderingContext2D): void {
    this.paintChrome(g);
    this.boardJobsBody?.(g);
    this.boardOrdersBody?.(g);
    this.boardSysBody?.(g);
  }
}

/* ── little helpers ───────────────────────────────────────────────────────── */

function fmtMs(ms: number): string {
  const total = Math.max(0, Math.round(ms / 100) / 10);
  const m = Math.floor(total / 60);
  const s = (total - m * 60).toFixed(1);
  return m > 0 ? `${m}:${s.padStart(4, '0')}` : `${s}s`;
}

/* ── the shift card's layout band ───────────────────────────────────────
 * The card has three fixed zones — header (goal + clock), body (the
 * page), footer (BACK TO IT / DOWN TOOLS, and whatever the page parks
 * above them) — and every page measures itself against these instead of
 * guessing pixels. Playtest found text over text on the GOALS page; it
 * was all fixed offsets that had outgrown a 500 px card.
 */
const CARD_PAD = 34;
const CARD_GAP = 8;
/** Where a page's body may start — clear of the tabs at y 162. */
const CARD_BODY = 220;
/** How much of the bottom belongs to the footer, measured up from ch. */
const CARD_FOOT = 150;

/** Row pitch for the goals ladder: share the body band out over the
 *  book, so a longer book tightens up instead of running off the card. */
function goalRowStep(ch: number): number {
  const band = ch - CARD_FOOT - 26 - CARD_BODY;
  return Math.max(30, Math.min(46, Math.floor(band / Math.max(1, ORDERS.length))));
}

function wrapText(
  g: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  maxW: number,
  lineH: number,
  fontStr: string,
  color: string,
): number {
  g.font = fontStr;
  g.fillStyle = color;
  g.textAlign = 'left';
  const words = text.split(' ');
  let line = '';
  let yy = y;
  let lines = 0;
  for (const word of words) {
    const probe = line ? `${line} ${word}` : word;
    if (g.measureText(probe).width > maxW && line) {
      g.fillText(line, x, yy);
      lines++;
      line = word;
      yy += lineH;
    } else {
      line = probe;
    }
  }
  if (line) {
    g.fillText(line, x, yy);
    lines++;
  }
  return lines;
}
