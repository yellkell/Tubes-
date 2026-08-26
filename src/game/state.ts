/**
 * Shared mutable app state — one plain singleton every system reads and
 * writes (the FIRE FIGHT `app` pattern, by way of RAVE RAID's `match`).
 * No framework, no events except a couple of tiny queues ("buses") for
 * cross-system one-shots.
 */

import { Vector3 } from 'three';
import { JOBS, type JobSpec, type LineSpec } from '../config.js';
import { LINES } from '../config.js';

export type Screen =
  | 'board' // the work board is up, no shift running
  | 'shift' // a job is live: place, pull, seat, pour, repeat
  | 'ceremony'; // the last run landed — the room gets its moment

/** One run's life, in order. Every phase is owned by exactly one system:
 *  PlacementSystem owns place→wake, TubeSystem owns pull→seated,
 *  FlowSystem owns seated→flowing. */
export type RunPhase =
  | 'pending' // queued behind the run before it
  | 'place' // flange hologram riding the ray, waiting for a wall
  | 'wake' // mounted; the socket is answering on another wall
  | 'pull' // the tube is real: capped, held, or parked mid-carry
  | 'seated' // latched home; the line is charging
  | 'flowing'; // the pour landed — alive for good

export interface RunState {
  line: LineSpec;
  phase: RunPhase;
  /** Mount (wall A): registry wall id + world pose. */
  wallA: number;
  pointA: Vector3;
  normalA: Vector3;
  /** Socket (wall B): filled when the room answers. */
  wallB: number;
  pointB: Vector3;
  normalB: Vector3;
  /** The pull, live: current extension (m) and the head's world pose. */
  extension: number;
  head: Vector3;
  /** Who's holding it: 0 hands, 1 (rattling), 2 (hauling). */
  hands: number;
  /** The flow front's arc length once seated (m; ≥ run length = landed). */
  front: number;
  /** Seconds since 'wake' / since 'seated' — the theatrical clocks. */
  phaseT: number;
}

/** Cross-system one-shots (FlowSystem drains these every frame). */
export interface FxEvent {
  kind: 'mount' | 'wake' | 'seat' | 'arrive' | 'ceremony';
  runIndex: number;
}

export interface Site {
  screen: Screen;
  /** The job the board has selected / the shift is running. */
  jobIndex: number;
  /** Placement seed for this attempt — fresh per start, forceable by
   *  tools so a layout can be replayed exactly. */
  seed: number;
  /** The live shift (empty on the board). */
  runs: RunState[];
  /** Which run is being worked (index into runs; -1 = none). */
  activeRun: number;
  /** Shift clock, ms (the board shows best times per job). */
  elapsedMs: number;
  /** Ceremony countdown, seconds. */
  ceremonyT: number;
  /** THE JOB CARD is up: hands are ignored, the machine is not. */
  paused: boolean;
  /** Bumped to make every system rebuild what it owns. */
  generation: number;
  /** WallSystem reports: any walls at all, and whether they're synthetic. */
  wallsReady: boolean;
  fallbackRoom: boolean;
  /** SYSTEM tab: draw hairline frames on the registry's walls. */
  showWalls: boolean;
  /** The fx bus. */
  fx: FxEvent[];
}

export const site: Site = {
  screen: 'board',
  jobIndex: 0,
  seed: 1,
  runs: [],
  activeRun: -1,
  elapsedMs: 0,
  ceremonyT: 0,
  paused: false,
  generation: 0,
  wallsReady: false,
  fallbackRoom: false,
  showWalls: false,
  fx: [],
};

export function jobSpec(): JobSpec {
  return JOBS[Math.min(site.jobIndex, JOBS.length - 1)];
}

/** Fresh run states for a job — everything zeroed, first run placing. */
export function buildRuns(spec: JobSpec): RunState[] {
  return spec.runs.map((lineId, i) => ({
    line: LINES[lineId],
    phase: i === 0 ? 'place' : 'pending',
    wallA: -1,
    pointA: new Vector3(),
    normalA: new Vector3(0, 0, 1),
    wallB: -1,
    pointB: new Vector3(),
    normalB: new Vector3(0, 0, 1),
    extension: 0,
    head: new Vector3(),
    hands: 0,
    front: -1,
    phaseT: 0,
  }));
}
