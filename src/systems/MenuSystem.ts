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
 *
 * THREE THINGS THIS FILE LEARNED LATE:
 *
 *  · ONE DOOR. The board used to list every sheet in the book and let
 *    you START any of them — which meant starting sheet four on an empty
 *    floor, with no feeds awake, no rails and no gears, and no way to
 *    get any. Every entry but the first was a trap dressed as a choice.
 *    The tab is called FACTORY now, it offers exactly one button, and
 *    the book advances inside the shift where the plant you built is
 *    still standing.
 *  · PICTURES. A catalogue of seven words in one weight is a list you
 *    read every single time. Every build button carries its machine's
 *    shop drawing (ui/icons.ts) over the word, and so does every part
 *    on every sheet.
 *  · THE BOX PANEL. Click any standing plant and a small card says what
 *    is inside it and what is plumbed into it — and carries UNPLUG,
 *    which is the verb that did not exist at all until playtest went
 *    looking for it and found DELETE instead.
 */

import { InputComponent, createSystem } from '@iwsdk/core';
import { Raycaster, Vector3, type Intersection, type Object3D } from 'three';
import {
  BOARD,
  FACTORY,
  GAME_TITLE,
  ITEMS,
  JOBS,
  LINES,
  ORDERS,
  UNITS,
  UPGRADES,
  type ItemId,
  type OrderSpec,
  type UnitType,
  type UpgradeId,
} from '../config.js';
import * as sfx from '../audio/sfx.js';
import { setMusicVolume, musicVolume, setSfxVolume, sfxVolume } from '../audio/sfx.js';
import { nowPlaying } from '../audio/music.js';
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
  bookAt,
  bookFinished,
  chestBonus,
  orderBestMs,
  ordersUnlocked,
  ownedUpgrades,
  resetProgress,
  unlockedJobs,
  upgradeOwned,
} from '../game/progress.js';
import { site } from '../game/state.js';
import {
  bankTotal,
  chestParts,
  chuteParts,
  orderSpec,
  plant,
  runSeatedAt,
  takesTube,
  unitById,
} from '../factory/state.js';
import { removeUnit } from '../factory/sim.js';
import { buildView, typeAvailable, type BuildTool } from './BuildSystem.js';
import { factoryView } from './FactorySystem.js';
import { font } from '../ui/fonts.js';
import {
  GLYPH_DEAD,
  GLYPH_LIVE,
  goopGlyph,
  itemGlyph,
  unitGlyph,
  type GlyphId,
} from '../ui/icons.js';
import { Panel, UI, type PanelButton } from '../ui/panel.js';
import { PointerRay } from '../ui/pointer.js';
import { walls } from './WallSystem.js';

/** A button's picture: the machine's own shop drawing, greyed with the
 *  plate when the catalogue is refusing it. */
const toolGlyph =
  (id: GlyphId): NonNullable<PanelButton['glyph']> =>
  (g, x, y, size, dead) =>
    unitGlyph(g, id, x, y, size, dead ? GLYPH_DEAD : GLYPH_LIVE);

/** The same, for a part. */
const partGlyph =
  (item: ItemId): NonNullable<PanelButton['glyph']> =>
  (g, x, y, size, dead) =>
    itemGlyph(g, item, x, y, size, dead ? GLYPH_DEAD : GLYPH_LIVE);

/** What a piece of plant is CALLED on a card. The catalogue's words and
 *  the box panel's title come from one table, so they can never drift. */
export const UNIT_NAME: Record<UnitType, string> = {
  dock: 'BANK',
  maker: 'MAKER',
  belt: 'RAIL',
  combiner: 'COMBINER',
  chest: 'CHEST',
  post: 'POST',
  vat: 'VAT',
};

/** One line on what each piece of plant is FOR — the box panel's
 *  subtitle, and the catalogue's tooltip line. */
const UNIT_DOCKET: Record<UnitType, string> = {
  dock: 'where parts leave the floor — the sheet counts what lands in it',
  maker: 'drinks a line and stamps its part onto the chute',
  belt: 'carries parts one cell; haul a run of them in one gesture',
  combiner: 'two parts in the sides, one deeper part out the front',
  chest: 'holds what runs ahead of the line',
  post: 'a stick a hauled rail bends to visit',
  vat: 'drinks the fourth manifold. Nobody knows what for',
};

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
const SYS_Y0 = 188;
/** Five rows now that MUSIC has its own fader — 140 put RESET PROGRESS
 *  straight through the room-status footer. */
const SYS_PITCH = 124;

type Tab = 'jobs' | 'factory' | 'sys';

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
  /** THE BOX PANEL, headless: open one on a unit id, read what it is
   *  offering, and see it close. */
  inspect?: (unitId: number) => void;
  boxButtons?: () => string[];
  boxLabels?: () => string[];
  boxRects?: () => Array<{ id: string; x: number; y: number; w: number; h: number }>;
  boxLayout?: () => { w: number; h: number };
  snapBox?: () => string;
  /** THANKS FOR PLAYING — is it up, and what does it say. */
  finaleUp?: () => boolean;
  snapFinale?: () => string;
} = {};

const _origin = new Vector3();
const _dir = new Vector3();
const _fwd = new Vector3();

export class MenuSystem extends createSystem({}) {
  private board!: Panel;
  private card!: Panel;
  /** THE BOX PANEL — one standing machine, opened up. */
  private box!: Panel;
  /** THANKS FOR PLAYING. */
  private finale!: Panel;
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

    this.box = new Panel(BOARD.boxW, BOARD.boxH, BOARD.boxPx[0], BOARD.boxPx[1]);
    this.box.setShown(false, true);
    this.scene.add(this.box.group);

    this.finale = new Panel(BOARD.widthM * 0.78, BOARD.heightM * 0.78, 1060, 700);
    this.finale.setShown(false, true);
    this.scene.add(this.finale.group);

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
    menuView.inspect = (unitId) => {
      if (!unitById(unitId)) return;
      site.inspect = unitId;
      site.paused = true;
      this.lastKey = '';
    };
    menuView.boxButtons = () => this.box.buttonIds();
    menuView.boxLabels = () => this.box.buttonLabels();
    menuView.boxRects = () => this.box.buttonRects();
    menuView.boxLayout = () => this.box.layout();
    menuView.snapBox = () => (this.box.ctx().canvas as HTMLCanvasElement).toDataURL('image/png');
    menuView.finaleUp = () => site.finale;
    menuView.snapFinale = () =>
      (this.finale.ctx().canvas as HTMLCanvasElement).toDataURL('image/png');
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

    // Mid-shift (pipe jobs and factory orders alike), Ⓐ raises the card —
    // and, if the box panel happens to be open, puts THAT away first.
    // One button, one back-step, which is what a hand expects of it.
    const midShift = site.screen === 'shift' || site.screen === 'factory';
    if (midShift) {
      if (this.input.xr.gamepads.right?.getButtonDown(InputComponent.A_Button)) {
        sfx.uiClick();
        if (site.inspect >= 0) {
          this.closeBox();
        } else {
          site.paused = !site.paused;
          if (site.paused) this.plant(this.card.group, BOARD.cardPosition[1], 1.0);
        }
        this.lastKey = '';
      }
    } else if (site.paused) {
      site.paused = false;
      site.inspect = -1;
    }

    // A box that stopped existing (the wrecking bar, DOWN TOOLS) closes
    // its own panel rather than painting a card about nothing.
    if (site.inspect >= 0 && (!unitById(site.inspect) || site.screen !== 'factory')) {
      this.closeBox();
    }

    // THANKS FOR PLAYING outranks everything: it comes up once, and it
    // is not something to have a box panel open in front of.
    const boardUp = site.screen === 'board';
    const finaleUp = site.finale;
    const boxUp = site.inspect >= 0 && site.screen === 'factory' && !finaleUp;
    const cardUp = site.paused && midShift && !boxUp && !finaleUp;

    // The board re-plants every time it comes back — you wandered.
    if (site.screen !== this.lastScreen) {
      this.lastScreen = site.screen;
      if (boardUp) {
        this.plant(this.board.group, BOARD.position[1], 1.35);
        this.lastKey = '';
      }
    }
    // The box panel and the finale card come to WHERE YOU ARE, the same
    // as everything else in this file: you clicked a box from wherever
    // you were standing, so that is where the answer appears.
    if (boxUp && !this.box.isShown) this.plant(this.box.group, BOARD.boxPosition[1], 0.86);
    if (finaleUp && !this.finale.isShown) this.plant(this.finale.group, 1.4, 1.5);

    this.board.setShown(boardUp);
    this.card.setShown(cardUp);
    this.box.setShown(boxUp);
    this.finale.setShown(finaleUp);

    const pulse = this.chug();

    if (!boardUp && !cardUp && !boxUp && !finaleUp) {
      this.pointers.left.hide();
      this.pointers.right.hide();
      this.board.tick(delta, pulse);
      this.card.tick(delta, pulse);
      this.box.tick(delta, pulse);
      this.finale.tick(delta, pulse);
      return;
    }

    // Pointers + hover + click.
    const targets: Object3D[] = [];
    if (boardUp) targets.push(this.board.mesh);
    if (cardUp) targets.push(this.card.mesh);
    if (boxUp) targets.push(this.box.mesh);
    if (finaleUp) targets.push(this.finale.mesh);

    let hover: string | null = null;
    let clicked: string | null = null;
    let clickedPanel: Panel | null = null;
    for (const hand of ['left', 'right'] as const) {
      const hit = this.updatePointer(hand, delta, targets);
      if (hit?.uv) {
        const panel = this.panelOf(hit.object);
        const id = panel?.buttonAt(hit.uv.x, hit.uv.y) ?? null;
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

    this.repaintIfNeeded(boardUp, cardUp, boxUp, finaleUp);
    this.board.tick(delta, pulse);
    this.card.tick(delta, pulse);
    this.box.tick(delta, pulse);
    this.finale.tick(delta, pulse);
  }

  /** Which of our four panels a raycast landed on. */
  private panelOf(obj: Object3D): Panel | null {
    if (obj === this.board.mesh) return this.board;
    if (obj === this.card.mesh) return this.card;
    if (obj === this.box.mesh) return this.box;
    if (obj === this.finale.mesh) return this.finale;
    return null;
  }

  /** Put the box panel away and give the hands back. */
  private closeBox(): void {
    site.inspect = -1;
    site.paused = false;
    this.lastKey = '';
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
      hit?.uv && this.panelOf(hit.object)?.buttonAt(hit.uv.x, hit.uv.y),
    );
    p.update(delta, _origin, hit ? hit.point : null, overButton);
    return hit;
  }

  /* ── actions ──────────────────────────────────────────────────────────── */

  private action(id: string): void {
    if (id === 'tab:jobs') this.tab = 'jobs';
    // 'tab:orders' is kept as an alias on purpose: the tools and anyone's
    // muscle memory both still say it, and a renamed tab is no reason to
    // break a door that already works.
    else if (id === 'tab:factory' || id === 'tab:orders') this.tab = 'factory';
    else if (id === 'tab:sys') this.tab = 'sys';
    else if (id.startsWith('job:')) {
      const i = Number(id.slice(4));
      if (i < unlockedJobs()) site.jobIndex = i;
    } else if (id === 'start') {
      startJob(site.jobIndex);
    } else if (id === 'start-order') {
      // ONE DOOR, and no argument: startShop with nothing passed means
      // "where the book got to". Passing 0 here is what threw a returning
      // player's whole progress away — the resume logic was in place and
      // the only caller in the game was walking straight past it.
      startShop();
    } else if (id.startsWith('box:')) {
      this.boxAction(id.slice(4));
    } else if (id === 'finale:close') {
      site.finale = false;
      plant.goop = 'done';
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
    } else if (id === 'mus:down') {
      setMusicVolume(Math.max(0, Math.round((musicVolume() - 0.1) * 10) / 10));
    } else if (id === 'mus:up') {
      setMusicVolume(Math.min(1, Math.round((musicVolume() + 0.1) * 10) / 10));
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
      site.inspect = -1;
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

  /**
   * THE BOX PANEL'S VERBS.
   *
   * UNPLUG is the one that had to exist: playtest said "we can't
   * disconnect the tubes when they're connected to the boxes — I delete
   * the boxes at the moment", which is a sentence about a missing verb,
   * not a missing button. The tug (both hands on the collar, haul and
   * hold) is still the good way to do it in the room; this is the way
   * you can find, and it goes through the same sim door, so the hum
   * stops and the iris shuts identically.
   */
  private boxAction(what: string): void {
    const unit = unitById(site.inspect);
    if (!unit) {
      this.closeBox();
      return;
    }
    if (what === 'close') {
      this.closeBox();
      return;
    }
    if (what === 'unplug') {
      if (factoryView.unseat?.(unit.id)) sfx.boltSpin();
      else sfx.oneHandRattle();
      return;
    }
    if (what === 'turn') {
      unit.rot = ((unit.rot + 1) % 4) as typeof unit.rot;
      plant.generation++;
      sfx.segmentClick(unit.rot);
      return;
    }
    if (what === 'remove') {
      removeUnit(unit);
      sfx.boltSpin();
      sfx.droopSettle();
      this.closeBox();
    }
  }

  /* ── painting ─────────────────────────────────────────────────────────── */

  private repaintIfNeeded(
    boardUp: boolean,
    cardUp: boolean,
    boxUp: boolean,
    finaleUp: boolean,
  ): void {
    const runsKey = site.runs.map((r) => r.phase).join(',');
    const key = [
      site.screen,
      this.tab,
      this.hover,
      site.jobIndex,
      unlockedJobs(),
      JOBS.map((j) => bestMs(j.id) ?? 0).join(','),
      sfxVolume().toFixed(1),
      musicVolume().toFixed(1),
      nowPlaying() ?? '',
      site.showWalls,
      this.resetArm > 0,
      this.quitArm > 0,
      walls.length,
      site.fallbackRoom,
      runsKey,
      ordersUnlocked(),
      bookFinished(),
      ORDERS.map((o) => orderBestMs(o.id) ?? 0).join(','),
      plant.mode,
      plant.orderIndex,
      plant.count,
      plant.goop,
      Math.floor(plant.brewT * 4),
      bankTotal(),
      Object.entries(plant.bank).map(([k, n]) => `${k}${n}`).join(''),
      buildView.armed?.() ?? '',
      this.cardMode,
      this.goalOpen,
      plant.goalsDone,
      ownedUpgrades().join(','),
      site.inspect,
      // The box panel is a LIVE window on one machine: a part landing in
      // the chest you are looking at has to appear, so the contents are
      // part of the key.
      boxUp ? this.boxKey() : '',
      site.finale,
      cardUp
        ? Math.floor((site.screen === 'factory' ? plant.elapsedMs : site.elapsedMs) / 100)
        : 0,
    ].join('|');
    if (key === this.lastKey) return;
    this.lastKey = key;
    if (boardUp) this.paintBoard();
    if (cardUp) this.paintCard();
    if (boxUp) this.paintBox();
    if (finaleUp) this.paintFinale();
  }

  /** Everything about the inspected box that could change under you. */
  private boxKey(): string {
    const unit = unitById(site.inspect);
    if (!unit) return 'gone';
    const held = [
      ...chestParts(unit.id),
      ...chuteParts(unit.id),
      ...plant.parts.filter((p) => p.at.kind === 'belt' && p.at.unit === unit.id),
    ]
      .map((p) => p.item)
      .join(',');
    const run = runSeatedAt(unit.id);
    return [
      unit.id,
      unit.rot,
      held,
      unit.ports.join('/'),
      unit.craftT >= 0,
      run ? `${run.line.id}:${run.phase}` : '-',
    ].join('~');
  }

  private paintBoard(): void {
    const buttons: PanelButton[] = [];

    // The rail.
    const tabs: Array<{ id: string; tab: Tab; label: string }> = [
      { id: 'tab:jobs', tab: 'jobs', label: 'JOBS' },
      { id: 'tab:factory', tab: 'factory', label: 'FACTORY' },
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
    else if (this.tab === 'factory') this.paintFactoryTab(buttons);
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

  /* ── FACTORY tab (one door into the book) ────────────────────────────── */

  /** What a sheet is asking for, in one shape: the words, the lineage
   *  dots, the docket line, the picture, and the VERB (stamp / deliver /
   *  brew) — because "10 × GEAR" means three different things depending
   *  on where the gear has to end up. */
  private targetOf(spec: OrderSpec): {
    name: string;
    verb: string;
    dots: string[];
    docket: string;
    glyph: NonNullable<PanelButton['glyph']>;
  } {
    if (spec.target.kind === 'brew') {
      return {
        name: 'THE GOOP',
        verb: 'BREW',
        dots: [LINES.pearl.hex],
        docket: 'nobody wrote a docket for this one. It writes its own',
        glyph: (g, x, y, size, dead) => goopGlyph(g, x, y, size, !dead),
      };
    }
    const item = ITEMS[spec.target.item];
    return {
      name: item.name,
      verb: spec.target.kind === 'craft' ? 'STAMP' : 'DELIVER',
      dots: item.lineage.map((l) => LINES[l].hex),
      docket: item.docket,
      glyph: partGlyph(item.id),
    };
  }

  /** How far down the book this headset has got — the sheet the next
   *  shift will open on, and the sheet the FACTORY tab paints its ticks
   *  up to. ORDERS.length once the book is filled, so every row ticks. */
  private bookProgress(): number {
    return bookFinished() ? ORDERS.length : bookAt();
  }

  /**
   * THE FACTORY TAB — the book, and ONE button.
   *
   * It used to be a list of five startable sheets and it was actively
   * hostile: pressing sheet four dealt you a bare floor with sheet
   * four's demands and none of sheet one, two or three's plant, feeds or
   * parts. There was no way to succeed and no way to tell. Every row is
   * read-only now; the ladder is a MAP of the shift, not a menu of
   * shifts, and the shift itself has one entrance.
   */
  private paintFactoryTab(buttons: PanelButton[]): void {
    const done = this.bookProgress();
    buttons.push(
      {
        id: 'start-order',
        label: 'OPEN THE FACTORY',
        // WHERE YOU LEFT OFF. The floor is bare either way — a shift is
        // a shift — but every feed and every machine the book has ever
        // opened comes back with you, so this says which sheet is live
        // rather than pretending the whole ladder starts again.
        sub:
          done >= ORDERS.length
            ? 'the book is filled \u2014 the shop is yours'
            : done > 0
              ? `back to ${ORDERS[done].name}`
              : ORDERS[0].name,
        primary: true,
        disabled: !site.wallsReady,
        x: SHEET_X + 10,
        y: H - 182,
        w: SHEET_W - 20,
        h: 96,
      },
      {
        // THE ONE CONTROL NOBODY CAN GUESS. Every instruction in the
        // shift lives on the Ⓐ card, which means the very first thing a
        // player has to know is that Ⓐ exists — and the only place to
        // tell them is here, before they go in.
        id: 'shop-note',
        label: '\u24b6 on the right controller raises the card',
        display: true,
        small: true,
        x: SHEET_X + 10,
        y: H - 76,
        w: SHEET_W - 20,
        h: 62,
      },
    );

    const ROW = 74;
    const RH = 66;
    this.boardOrdersBody = (g: CanvasRenderingContext2D): void => {
      g.textAlign = 'left';
      g.textBaseline = 'middle';
      g.font = font(600, 24);
      g.fillStyle = UI.faint;
      g.letterSpacing = '2px';
      g.fillText('THE BOOK', ROW_X + 2, ROW_Y0 - 22);
      g.letterSpacing = '0px';

      ORDERS.forEach((o, i) => {
        const y = ROW_Y0 + i * ROW;
        const filled = i < done;
        const here = i === done;
        const t = this.targetOf(o);
        // The plate: the sheet you are up to is the only lit one.
        g.fillStyle = here ? UI.accentFaint : 'rgba(255,255,255,0.028)';
        g.beginPath();
        g.roundRect(ROW_X, y, ROW_W, RH, 12);
        g.fill();
        g.lineWidth = 2;
        g.strokeStyle = here ? 'rgba(255,162,46,0.85)' : 'rgba(255,255,255,0.07)';
        g.stroke();

        // The state mark: a filled tick, the live arrow, or a dot.
        g.textAlign = 'center';
        g.font = font(700, 26);
        g.fillStyle = filled ? UI.positive : here ? UI.accent : UI.disabled;
        g.fillText(filled ? '\u2713' : here ? '\u25b8' : '\u00b7', ROW_X + 30, y + RH / 2);

        g.textAlign = 'left';
        g.font = font(600, 28);
        g.letterSpacing = '1.2px';
        g.fillStyle = filled ? UI.dim : here ? UI.textHi : UI.faint;
        g.fillText(`${i + 1}. ${o.name}`, ROW_X + 54, y + RH / 2 - 11, ROW_W - 250);
        g.letterSpacing = '0px';
        g.font = font(500, 20);
        g.fillStyle = UI.faint;
        g.fillText(`${t.verb} ${o.goal} \u00d7 ${t.name}`, ROW_X + 54, y + RH / 2 + 16);

        // The picture, on the right of its own row.
        t.glyph(g, ROW_X + ROW_W - 58, y + 9, 48, !filled && !here);
        // Best time, if this headset has one.
        const best = orderBestMs(o.id);
        if (best !== null) {
          g.textAlign = 'right';
          g.font = font(500, 20);
          g.fillStyle = UI.dim;
          g.fillText(fmtMs(best), ROW_X + ROW_W - 72, y + RH / 2);
        }
      });

      // THE SHIFT SHEET.
      const sheetH = H - ROW_Y0 - 190;
      g.fillStyle = UI.well;
      g.beginPath();
      g.roundRect(SHEET_X, ROW_Y0, SHEET_W, sheetH, 18);
      g.fill();
      g.textAlign = 'left';
      g.font = font(700, 40);
      g.letterSpacing = '2px';
      g.fillStyle = UI.textHi;
      g.fillText('THE SHOP FLOOR', SHEET_X + 26, ROW_Y0 + 50);
      g.letterSpacing = '0px';
      let y = ROW_Y0 + 96;
      y +=
        30 *
          wrapText(
            g,
            'Your floor becomes the shop. Feeds wake on its four sides, you haul supply tubes into the boxes you stand, and rails carry what they make. The book asks for one thing at a time and posts the next onto the same floor \u2014 nothing is ever taken off you. Everything you build comes off the \u24b6 card; point at any machine with an empty hand to open it up.',
            SHEET_X + 26,
            y,
            SHEET_W - 52,
            30,
            font(500, 24),
            UI.dim,
          ) +
        18;

      // WHERE YOU ARE.
      const at = ORDERS[Math.min(done, ORDERS.length - 1)];
      const t = this.targetOf(at);
      g.font = font(500, 22);
      g.fillStyle = UI.faint;
      g.fillText(done >= ORDERS.length ? 'THE BOOK IS FILLED' : 'UP NEXT', SHEET_X + 26, y);
      y += 34;
      t.glyph(g, SHEET_X + 26, y - 22, 44, false);
      g.font = font(600, 30);
      g.fillStyle = UI.text;
      g.fillText(at.name, SHEET_X + 84, y);
      g.font = font(500, 21);
      g.fillStyle = UI.faint;
      g.fillText(`${t.verb} ${at.goal} \u00d7 ${t.name}`, SHEET_X + 84, y + 26);
      y += 62;

      // THE BANK, itemised — it survives between shifts and pays for the
      // fittings, so it deserves better than one number.
      g.font = font(500, 22);
      g.fillStyle = UI.faint;
      g.fillText('THE BANK', SHEET_X + 26, y);
      y += 30;
      const held = (Object.entries(plant.bank) as Array<[ItemId, number]>).filter(
        ([, n]) => (n ?? 0) > 0,
      );
      if (held.length === 0) {
        g.font = font(500, 21);
        g.fillStyle = UI.faint;
        g.fillText('empty \u2014 surplus deliveries keep here', SHEET_X + 26, y + 6);
      } else {
        held.slice(0, 6).forEach(([item, n], i) => {
          const cx = SHEET_X + 26 + (i % 3) * 106;
          const cy = y - 12 + Math.floor(i / 3) * 56;
          itemGlyph(g, item, cx, cy, 34);
          g.textAlign = 'left';
          g.font = font(600, 22);
          g.fillStyle = UI.text;
          g.fillText(`\u00d7${n}`, cx + 40, cy + 18);
        });
      }

      if (!site.wallsReady) {
        g.textAlign = 'left';
        g.font = font(500, 23);
        g.fillStyle = UI.warn;
        g.fillText('waiting for walls \u2014 look around the room', SHEET_X + 26, ROW_Y0 + sheetH - 26);
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
      { id: 'mus:down', label: '−', x: CONTENT_X + 330, y: y0 + SYS_PITCH, w: rowW, h: 96, px: 48 },
      {
        id: 'mus:vol',
        label: `${Math.round(musicVolume() * 100)}%`,
        display: true,
        x: CONTENT_X + 330 + rowW + 16,
        y: y0 + SYS_PITCH,
        w: valueW,
        h: 96,
      },
      {
        id: 'mus:up',
        label: '+',
        x: CONTENT_X + 330 + rowW + valueW + 32,
        y: y0 + SYS_PITCH,
        w: rowW,
        h: 96,
        px: 48,
      },
      {
        id: 'walls:toggle',
        label: site.showWalls ? 'SHOWN' : 'HIDDEN',
        selected: site.showWalls,
        x: CONTENT_X + 330,
        y: y0 + SYS_PITCH * 2,
        w: rowW + valueW + 16,
        h: 96,
      },
      {
        id: 'floor:set',
        label: 'SET THE FLOOR',
        x: CONTENT_X + 330,
        y: y0 + SYS_PITCH * 3,
        w: rowW + valueW + 16,
        h: 96,
      },
      {
        id: 'reset',
        label: this.resetArm > 0 ? 'SURE? PRESS AGAIN' : 'RESET PROGRESS',
        tone: UI.danger,
        x: CONTENT_X + 330,
        y: y0 + SYS_PITCH * 4,
        w: rowW + valueW + 16 + rowW + 16,
        h: 96,
        small: true,
      },
    );

    this.boardSysBody = (g: CanvasRenderingContext2D): void => {
      g.textAlign = 'left';
      g.textBaseline = 'middle';
      // THE LABEL COLUMN HAS A WIDTH, and the sub-line has to respect
      // it: the controls start at CONTENT_X + 330, and a sub that ran
      // long used to print straight through SET THE FLOOR. Clamped, not
      // trusted.
      const labelW = 306;
      const label = (text: string, sub: string, y: number): void => {
        g.font = font(600, 30);
        g.fillStyle = UI.text;
        g.fillText(text, CONTENT_X + 10, y + 34, labelW);
        g.font = font(500, 22);
        g.fillStyle = UI.faint;
        g.fillText(sub, CONTENT_X + 10, y + 68, labelW);
      };
      label('SOUND', 'the shop, the ratchet, the pour', SYS_Y0);
      // The now-playing line rides the MUSIC row's sub, because a record
      // you cannot name is a record you cannot ask for again.
      const on = nowPlaying();
      label('MUSIC', on ? `now playing · ${on}` : 'the records', SYS_Y0 + SYS_PITCH);
      label('WALL FRAMES', 'hairlines on what the scan found', SYS_Y0 + SYS_PITCH * 2);
      label('THE FLOOR', 'hazard tape — drag its sides to your walls', SYS_Y0 + SYS_PITCH * 3);
      label('THE SHEET', 'tear it up, start the trade again', SYS_Y0 + SYS_PITCH * 4);

      const real = walls.filter((w) => w.real && w.kind === 'wall').length;
      const flats = walls.filter((w) => w.kind !== 'wall').length;
      const fake = walls.filter((w) => !w.real && w.kind === 'wall').length;
      g.font = font(500, 22);
      g.fillStyle = UI.faint;
      g.fillText(
        `room: ${real} scanned wall${real === 1 ? '' : 's'}${fake ? ` · ${fake} stand-in` : ''}${flats ? ` · floor/ceiling ports live` : ''}  ·  passthrough AR  ·  built on the Immersive Web SDK`,
        CONTENT_X + 10,
        H - 44,
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
      // EVERY TOOL CARRIES ITS PICTURE. Seven words in one weight is a
      // list you re-read every time you open the card; seven silhouettes
      // is a thing you learn once and then recognise on the floor,
      // because the ghost on your ray wears the same shape.
      //
      // The wrecking bar sits in the catalogue like any other tool —
      // playtest went looking for a delete and found nothing.
      const kit: Array<{ tool: BuildTool; label: string }> = [
        { tool: 'maker', label: 'MAKER' },
        { tool: 'dock', label: 'BANK' },
        { tool: 'belt', label: 'RAIL' },
        { tool: 'combiner', label: 'COMBINER' },
        { tool: 'chest', label: 'CHEST' },
        { tool: 'post', label: 'POST' },
        { tool: 'vat', label: 'VAT' },
        { tool: 'delete', label: 'DELETE' },
      ];
      kit.forEach((entry, i) => {
        buttons.push({
          id: `build:${entry.tool}`,
          label: entry.label,
          small: true,
          px: 22,
          glyph: toolGlyph(entry.tool),
          disabled: entry.tool === 'delete' ? false : !typeAvailable(entry.tool as UnitType),
          selected: armed === entry.tool,
          tone: entry.tool === 'delete' ? UI.danger : undefined,
          x: colX(i % 3),
          y: CARD_BODY + Math.floor(i / 3) * 100,
          w: colW,
          h: 92,
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
          y: ch - CARD_FOOT - 10,
          w: 190,
          h: 44,
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
          y: CARD_BODY + i * billRowStep(ch),
          w: cw - 2 * CARD_PAD,
          h: billRowStep(ch) - 8,
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
          g.fillText(`${plant.count} / ${spec.goal}`, cw - 96, 112);
          g.font = font(600, 22);
          g.fillStyle = UI.dim;
          g.fillText(target.name, cw - 96, 144);
          target.glyph(g, cw - 84, 92, 48, false);
          // THE BREW has no counter worth reading — one of one — so the
          // vat gets a level bar instead, which is the honest gauge.
          if (spec.target.kind === 'brew' && plant.goop !== 'none') {
            const p = Math.min(1, plant.brewT / UNITS.vat.brewS);
            g.fillStyle = 'rgba(255,255,255,0.08)';
            g.beginPath();
            g.roundRect(36, 150, cw - 200, 10, 5);
            g.fill();
            g.fillStyle = LINES.pearl.hex;
            g.beginPath();
            g.roundRect(36, 150, Math.max(6, (cw - 200) * p), 10, 5);
            g.fill();
          }
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
        else if (this.cardMode === 'supply') this.paintBills(g, cw, ch);
        else {
          g.textAlign = 'center';
          g.font = font(500, 20);
          g.fillStyle = UI.faint;
          g.fillText(
            armed === 'delete'
              ? 'point at plant and pull the trigger to take it out'
              : armed === 'belt'
                ? 'stand one, then HOLD the trigger and haul the run out \u2014 it bends round anything'
                : armed === 'post'
                  ? 'plant a stick where you want a hauled rail to bend'
                  : armed === 'vat'
                    ? 'stand it with room around it, then bring it the green line'
                    : armed
                      ? 'aim at the floor \u2014 it turns itself to connect, \u24d1 turns it yourself'
                      : 'empty-handed, the trigger OPENS a box: what is in it, and UNPLUG',
            cw / 2,
            ch - CARD_FOOT - 34,
          );
          // THE WAY BACK OUT. Arming a tool used to be a one-way door
          // and nothing on this card said otherwise, so it says so now —
          // on the page where you pick the tool up, which is the only
          // place anybody is going to read it.
          if (armed) {
            g.font = font(600, 19);
            g.fillStyle = UI.dim;
            g.fillText('\u24cd on the left controller puts it back down', cw / 2, ch - CARD_FOOT - 8);
          }
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
        g.fillText(`${done ? '\u2713' : now ? '\u25b8' : '\u00b7'}  ${o.name}`, CARD_PAD + 20, y + h / 2);
        const t = this.targetOf(o);
        const gs = Math.min(h - 10, 30);
        t.glyph(g, cw - CARD_PAD - 20 - gs, y + (h - gs) / 2, gs, !done && !now);
        g.textAlign = 'right';
        g.font = font(500, 18);
        g.fillStyle = UI.faint;
        g.fillText(
          `${t.verb} ${o.goal} \u00d7 ${t.name}`,
          cw - CARD_PAD - 28 - gs,
          y + h / 2,
        );
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
    const wide = cw - 2 * left - 62;
    g.textAlign = 'left';
    g.font = font(700, 26);
    g.fillStyle = UI.textHi;
    g.fillText(o.name, left, CARD_BODY + 10);
    g.font = font(600, 20);
    g.fillStyle = UI.accent;
    g.fillText(`${t.verb} ${o.goal} \u00d7 ${t.name}`, left, CARD_BODY + 38);
    t.glyph(g, cw - CARD_PAD - 56, CARD_BODY - 8, 54, false);
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
      next ? `next \u00b7 ${next.name}` : 'last sheet \u2014 then the shop is yours',
      cw - CARD_PAD,
      ch - CARD_FOOT + 12,
    );
  }

  /* ── THE BOX PANEL ────────────────────────────────────────────────────
   * Point at any standing plant with an empty hand, pull the trigger,
   * and this opens: what the box IS, what it is HOLDING, what is
   * PLUMBED into it, and the three verbs that were homeless until now.
   *
   * Two playtest notes, one panel:
   *   "we should be able to check what is in a chest by clicking on it
   *    and seeing a menu with the stuff"          → the contents grid
   *   "we can't disconnect the tubes when they're connected to the
   *    boxes — I delete the boxes at the moment"  → UNPLUG
   *
   * The tug (both hands on the collar, haul and hold) is still the good
   * way to break a seal, and it is still there. This is the way you can
   * FIND, which is a different requirement and needs its own answer.
   */
  private paintBox(): void {
    const unit = unitById(site.inspect);
    if (!unit) return;
    const [cw, ch] = BOARD.boxPx;
    const run = runSeatedAt(unit.id);
    const cap = FACTORY.chestCap + chestBonus();
    // WHAT IS IN IT depends entirely on what it is: a crate has a stack,
    // a maker has a chute, a combiner has two ports, a rail has whatever
    // is riding it, the bank has the whole vault, and the vat has a
    // level rather than any parts at all. One shape, per machine.
    const stack =
      unit.type === 'combiner'
        ? (unit.ports
            .map((id) => (id >= 0 ? plant.parts.find((p) => p.id === id) : undefined))
            .filter(Boolean) as Array<{ item: ItemId }>)
        : unit.type === 'chest'
          ? chestParts(unit.id)
          : unit.type === 'belt'
            ? plant.parts.filter((p) => p.at.kind === 'belt' && p.at.unit === unit.id)
            : unit.type === 'dock'
              ? (Object.entries(plant.bank) as Array<[ItemId, number]>)
                  .filter(([, n]) => (n ?? 0) > 0)
                  .flatMap(([item, n]) => Array.from({ length: n ?? 0 }, () => ({ item })))
              : chuteParts(unit.id);
    const heading =
      unit.type === 'combiner'
        ? 'IN THE PORTS'
        : unit.type === 'chest'
          ? `IN THE CRATE \u00b7 ${stack.length} / ${cap}`
          : unit.type === 'belt'
            ? 'ON THE RAIL'
            : unit.type === 'dock'
              ? 'IN THE VAULT'
              : unit.type === 'vat'
                ? 'IN THE TANK'
                : unit.type === 'post'
                  ? ''
                  : 'ON THE CHUTE';
    const emptyLine =
      unit.type === 'dock'
        ? 'nothing banked yet \u2014 surplus deliveries keep here'
        : unit.type === 'belt'
          ? 'nothing riding it'
          : 'empty';

    const PAD = 26;
    const footY = ch - 74;
    const third = (cw - PAD * 2 - 16) / 3;
    const buttons: PanelButton[] = [
      {
        id: 'box:unplug',
        label: run ? 'UNPLUG' : 'NOTHING PLUMBED',
        small: true,
        px: 20,
        disabled: !run,
        tone: run ? UI.warn : undefined,
        x: PAD,
        y: footY,
        w: third,
        h: 54,
      },
      {
        id: 'box:turn',
        label: 'TURN',
        small: true,
        px: 20,
        // Sinks have no out face to turn, and a turn on one would look
        // like a bug rather than a choice.
        disabled: unit.type === 'dock' || unit.type === 'chest' || unit.type === 'vat',
        x: PAD + third + 8,
        y: footY,
        w: third,
        h: 54,
      },
      {
        id: 'box:remove',
        label: 'TAKE IT OUT',
        small: true,
        px: 20,
        tone: UI.danger,
        x: PAD + (third + 8) * 2,
        y: footY,
        w: third,
        h: 54,
      },
      {
        // CLOSE lives in the corner, away from the three verbs — one of
        // which takes the machine off the floor. Nobody should be able
        // to reach for "put this away" and hit "TAKE IT OUT".
        id: 'box:close',
        label: 'CLOSE',
        small: true,
        px: 19,
        x: cw - PAD - 92,
        y: 22,
        w: 92,
        h: 42,
      },
    ];

    this.box.paint(
      UNIT_NAME[unit.type],
      (g) => {
        g.textAlign = 'left';
        g.textBaseline = 'middle';
        // The machine's own drawing, top left, at a size worth looking at.
        unitGlyph(g, unit.type, PAD, 108, 74);
        wrapText(g, UNIT_DOCKET[unit.type], PAD + 92, 126, cw - PAD * 2 - 96, 24, font(500, 19), UI.dim);

        // THE PLUMBING — what line is in it, and how it is doing.
        let y = 206;
        g.font = font(500, 19);
        g.fillStyle = UI.faint;
        g.fillText('PLUMBING', PAD, y);
        y += 30;
        if (run) {
          g.fillStyle = run.line.hex;
          g.beginPath();
          g.arc(PAD + 10, y, 9, 0, Math.PI * 2);
          g.fill();
          g.font = font(600, 23);
          g.fillStyle = UI.text;
          g.fillText(run.line.name, PAD + 30, y);
          g.font = font(500, 19);
          g.fillStyle = run.phase === 'flowing' ? UI.positive : UI.dim;
          g.fillText(run.phase === 'flowing' ? 'FLOWING' : 'CHARGING', PAD + 158, y);
          if (unit.type === 'vat') {
            const p = Math.min(1, plant.brewT / UNITS.vat.brewS);
            g.fillStyle = 'rgba(255,255,255,0.08)';
            g.beginPath();
            g.roundRect(PAD + 250, y - 7, cw - PAD * 2 - 250, 14, 7);
            g.fill();
            g.fillStyle = LINES.pearl.hex;
            g.beginPath();
            g.roundRect(PAD + 250, y - 7, Math.max(8, (cw - PAD * 2 - 250) * p), 14, 7);
            g.fill();
          }
        } else {
          g.font = font(500, 20);
          g.fillStyle = UI.faint;
          g.fillText(
            takesTube(unit)
              ? 'no line seated \u2014 haul one over and it will take it'
              : unit.type === 'post'
                ? 'a stick. A hauled rail bends to visit it, and takes its place'
                : 'this one takes rails, not tubes',
            PAD,
            y,
          );
        }

        // WHAT IS IN IT.
        if (!heading) return;
        y += 48;
        g.textAlign = 'left';
        g.font = font(500, 19);
        g.fillStyle = UI.faint;
        g.fillText(heading, PAD, y);
        y += 22;
        if (unit.type === 'vat') {
          // The vat holds no parts, ever — it holds a LEVEL, and that is
          // the only number about it worth reading.
          const p = Math.min(1, plant.brewT / UNITS.vat.brewS);
          g.fillStyle = 'rgba(255,255,255,0.07)';
          g.beginPath();
          g.roundRect(PAD, y + 10, cw - PAD * 2, 26, 13);
          g.fill();
          g.fillStyle = LINES.pearl.hex;
          g.beginPath();
          g.roundRect(PAD, y + 10, Math.max(10, (cw - PAD * 2) * p), 26, 13);
          g.fill();
          g.font = font(600, 20);
          // The label rides INSIDE the track, clear of the fill's own
          // minimum nub — a dry tank should not print its first letter
          // over a sliver of green.
          g.fillStyle = p > 0.45 ? UI.onAccent : UI.dim;
          g.fillText(
            plant.goop === 'none'
              ? 'dry \u2014 nothing green has reached it'
              : plant.goop === 'brewing'
                ? `${Math.round(p * 100)}% \u2014 something is taking shape in there`
                : 'whatever was in here is out here now',
            PAD + 24,
            y + 24,
          );
          return;
        }
        if (stack.length === 0) {
          g.font = font(500, 20);
          g.fillStyle = UI.faint;
          g.fillText(emptyLine, PAD, y + 22);
          return;
        }
        const counts = new Map<ItemId, number>();
        for (const part of stack) counts.set(part.item, (counts.get(part.item) ?? 0) + 1);
        [...counts.entries()].slice(0, 5).forEach(([item, n], i) => {
          const x = PAD + i * 96;
          itemGlyph(g, item, x, y, 42);
          g.textAlign = 'left';
          g.font = font(600, 21);
          g.fillStyle = UI.text;
          g.fillText(`\u00d7${n}`, x + 48, y + 26);
          g.font = font(500, 15);
          g.fillStyle = UI.faint;
          g.fillText(ITEMS[item].name, x + 2, y + 56);
        });
      },
      buttons,
      this.hover,
    );
  }

  /**
   * THANKS FOR PLAYING — the last card in the game.
   *
   * It comes up once, on its own, while the goop is dancing on your
   * actual floor behind it. Deliberately the only screen in TUBES that
   * is not made of shop chrome: no rail, no tabs, no counters. One
   * picture, one line, one button that gets out of the way so you can
   * watch the thing you built.
   */
  private paintFinale(): void {
    const cw = 1060;
    const ch = 700;
    const buttons: PanelButton[] = [
      {
        id: 'finale:close',
        label: 'WATCH IT DANCE',
        primary: true,
        x: cw / 2 - 220,
        y: ch - 148,
        w: 440,
        h: 96,
      },
    ];
    this.finale.paint(
      '',
      (g) => {
        // EVERY Y HERE FLOWS. The first cut nailed the clock to a fixed
        // offset and the closing paragraph grew into it — the same class
        // of bug the GOALS page was rebuilt to kill, and it deserves no
        // more mercy on the last screen in the game than it got there.
        g.textAlign = 'center';
        g.textBaseline = 'middle';
        goopGlyph(g, cw / 2 - 84, 58, 168, true);
        g.font = font(700, 72);
        g.letterSpacing = '8px';
        g.fillStyle = UI.textHi;
        g.fillText('THANKS FOR PLAYING', cw / 2, 292);
        g.letterSpacing = '0px';
        g.font = font(600, 26);
        g.fillStyle = LINES.pearl.hex;
        g.fillText('the fourth manifold is open, and something came out of it', cw / 2, 344);
        let y = 400;
        y +=
          31 *
          wrapText(
            g,
            'You stood a maker in an empty room and ran one tube into it. Everything after that \u2014 the bank, the lanes, the combiner, the chest, six servos and a vat \u2014 you built. The shop stays open: every feed is yours, the catalogue is yours, and nobody is going to ask you for ten of anything ever again.',
            cw / 2 - 380,
            y,
            760,
            31,
            font(500, 23),
            UI.dim,
            'center',
          );
        g.textAlign = 'center';
        g.font = font(500, 20);
        g.fillStyle = UI.faint;
        g.fillText(`the works ran for ${fmtMs(plant.elapsedMs)}`, cw / 2, y + 6);
      },
      buttons,
      this.hover,
    );
  }

  /**
   * THE BANK'S BILLS.
   *
   * The old cut printed a bill as a run of words — "8 CELL + 4 PUMP" —
   * on a row of grey text, which told you the price and nothing at all
   * about whether you could pay it: you had to hold the number in your
   * head and go and look at the bank. Every bill is CHIPS now, one per
   * ingredient, each carrying the part's own drawing, what it costs, and
   * what the bank actually holds — and each chip turns green on its own
   * the moment that line of the bill is covered. You can see at a glance
   * which single part you are short of, which is the only question
   * anybody ever asks this page.
   */
  private paintBills(g: CanvasRenderingContext2D, cw: number, ch: number): void {
    const hoverOf = (id: string): number => this.card.hoverOf(id);
    const step = billRowStep(ch);
    const h = step - 8;
    const CHIP = 94;
    UPGRADES.forEach((u, i) => {
      const y = CARD_BODY + i * step;
      const owned = upgradeOwned(u.id);
      const afford = this.canAfford(u.id);
      const hov = hoverOf(`buy:${u.id}`);
      g.fillStyle = owned
        ? UI.accentFaint
        : `rgba(255,255,255,${(0.035 + 0.05 * hov).toFixed(3)})`;
      g.beginPath();
      g.roundRect(CARD_PAD, y, cw - 2 * CARD_PAD, h, 12);
      g.fill();
      g.strokeStyle = owned
        ? 'rgba(255,162,46,0.5)'
        : `rgba(255,255,255,${(0.08 + 0.2 * hov).toFixed(3)})`;
      g.lineWidth = 2;
      g.stroke();

      const bill = Object.entries(u.bill) as Array<[ItemId, number]>;
      const billW = owned ? 96 : bill.length * CHIP;
      g.textAlign = 'left';
      g.textBaseline = 'middle';
      g.font = font(600, 21);
      g.fillStyle = owned ? UI.dim : afford ? UI.text : UI.disabled;
      g.fillText(u.name, CARD_PAD + 18, y + h / 2 - 12, cw - 2 * CARD_PAD - billW - 40);
      g.font = font(500, 16);
      g.fillStyle = UI.faint;
      g.fillText(u.effect, CARD_PAD + 18, y + h / 2 + 13, cw - 2 * CARD_PAD - billW - 40);

      if (owned) {
        g.textAlign = 'right';
        g.font = font(700, 19);
        g.fillStyle = UI.accent;
        g.fillText('FITTED', cw - CARD_PAD - 20, y + h / 2);
        return;
      }
      // One chip per ingredient: the drawing, the price, and what the
      // bank has against it.
      bill.forEach(([item, need], n) => {
        const have = plant.bank[item] ?? 0;
        const covered = have >= (need ?? 0);
        const x = cw - CARD_PAD - billW + n * CHIP + 6;
        itemGlyph(g, item, x, y + h / 2 - 17, 34, covered ? GLYPH_LIVE : GLYPH_DEAD);
        g.textAlign = 'left';
        g.font = font(700, 19);
        g.fillStyle = covered ? UI.positive : UI.warn;
        g.fillText(String(need ?? 0), x + 40, y + h / 2 - 9);
        g.font = font(500, 14);
        g.fillStyle = UI.faint;
        g.fillText(`bank ${have}`, x + 40, y + h / 2 + 12);
      });
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
/** How much of the bottom belongs to the footer, measured up from ch.
 *  BACK TO IT / QUIT sit at ch − 84 and stand 64 tall, so 124 is that
 *  band plus a hairline of air — the old 150 was sized for a shorter
 *  card and left every page a dead stripe it could have been reading
 *  in. */
const CARD_FOOT = 124;

/** Row pitch for the goals ladder: share the body band out over the
 *  book, so a longer book tightens up instead of running off the card. */
function goalRowStep(ch: number): number {
  const band = ch - CARD_FOOT - 26 - CARD_BODY;
  return Math.max(30, Math.min(54, Math.floor(band / Math.max(1, ORDERS.length))));
}

/** The same share-out for the bills. They are fatter than goal rows
 *  because each one carries its bill as chips rather than as words. */
function billRowStep(ch: number): number {
  const band = ch - CARD_FOOT - 26 - CARD_BODY;
  return Math.max(46, Math.min(72, Math.floor(band / Math.max(1, UPGRADES.length))));
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
  align: CanvasTextAlign = 'left',
): number {
  g.font = fontStr;
  g.fillStyle = color;
  g.textAlign = align;
  // Centred blocks are measured from the middle of the box, so the
  // caller still passes the box's LEFT edge and gets what they drew.
  const at = align === 'center' ? x + maxW / 2 : x;
  const words = text.split(' ');
  let line = '';
  let yy = y;
  let lines = 0;
  for (const word of words) {
    const probe = line ? `${line} ${word}` : word;
    if (g.measureText(probe).width > maxW && line) {
      g.fillText(line, at, yy);
      lines++;
      line = word;
      yy += lineH;
    } else {
      line = probe;
    }
  }
  if (line) {
    g.fillText(line, at, yy);
    lines++;
  }
  g.textAlign = 'left';
  return lines;
}
