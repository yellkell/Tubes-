# TUBES 🔧🟠

A **passthrough-AR pipefitting toy-puzzle** for Quest, played against the
real walls of your real room. Behind those walls sleeps an old machine —
**THE WORKS** — and you are the fitter bringing it back online, one run of
industrial tube at a time.

- **You place one thing.** A job hands you a flange hologram on your
  laser: aim at any wall, pull the trigger, and it stamps onto the plaster
  with a thunk and a ring of self-tightening bolts. The aim is forgiving
  by construction — anywhere near a wall clamps into the legal mount band,
  so the reticle is always somewhere honest and the trigger is always a
  yes.
- **The room answers.** Something KNOCKS from inside another wall — a
  spot the game picked for it — and a socket irises awake there, wearing
  the same line's colours. THE WORKS is already in your walls; you're just
  opening the doors. And not only the walls: sometimes the knock comes
  from OVER YOUR HEAD, or under your feet — the scan's ceiling and floor
  carry exit ports too, and a run that dives into the floorboards or
  climbs into the ceiling is always a short, steep, reachable one (the
  picker guarantees every port it wakes is one the magnet can take).
- **The tube takes two hands.** A capped stub sticks out of the flange,
  collar glowing "grab me". One hand alone RATTLES it — a loose clank and
  a buzz that says *more hands* without a word. Both grips squeezing and
  it's yours — and it STAYS yours however hard you haul: the grab never
  re-tests your reach against the lagging weight, so the only way to
  drop plant is to open a hand. Then: pull, and the tube TELESCOPES out of the wall, fat root
  section first, each new thinner section arriving with a clank one plate
  deeper, the ratchet clicking in your palms the whole way. The head
  chases your hands with a lag that reads as weight — a stub answers your
  wrists, seven metres of plant answers your shoulders. And the collar
  STEERS: where your two controllers point blends into the head's
  travel, so tipping your wrists bows the run on command — carry it
  straight, or sweep it round yourself like a fitter walking pipe round
  a corner.
- **Let go and it waits.** A parked tube sags onto its own weight with
  one heavy boing and holds — cantilevered off the wall, resumable,
  never punishing. Walk around it. It's plant now.
- **The socket does the last metre.** Offer the head up anywhere near the
  socket, roughly square, and the magnet takes it: the guide flares, the
  head sweeps in along the socket's own normal, and the latch dogs slam —
  CLUNK-CLUNK — whether or not you hang on. TUBES does not fail the
  willing.
- **Then the payoff.** The line charges for one held breath — and POURS:
  a front of liquid light races the run from flange to socket behind
  frosted metal — ONE unbroken column, stepping down in bore straight
  through every telescoping joint (each section's glow tucks back
  through its collar into the section behind it, so the seams sit over
  lit liquid, never over a gap) — lands with the line's own chord, and
  the socket blooms —
  a burst of lens glints, a settling hum, and **a shaft of sunlight
  firing straight out of a wall that never had a window**, dust motes
  drifting in it — level across the room from a wall port, rising off
  a floor port, pouring straight down from a ceiling one. In passthrough that light lands in YOUR room, which is
  the whole trick: the game's best effect is played on a stage it didn't
  have to draw.
- **Five jobs, one honest ladder.** One run on the MAINS teaches
  everything. Then a long haul across the room; then two lines whose
  sockets only take their own kind; then two long-hauled lines that want
  the same air; then **FULL PRESSURE** — MAINS, COOLANT and VOLT all at
  once, and when the last seat lands the room celebrates. Best times per
  job live on the board.

## The lines

Every piece of hardware wears its line head to toe — silhouette, surface,
light, pour and voice. A socket only takes its own line; the collar's
colour tells you whose wall it wants.

| Line | The metal | The light | The pour | The voice |
| --- | --- | --- | --- | --- |
| **MAINS** | eight-sided cast iron, hex plates | furnace amber | slow and heavy | a boiler two rooms over; steam off hot metal on the seat |
| **COOLANT** | smooth machined alloy discs | glacier cyan | fast and bright | moving fluid; a hydraulic sigh on the seat |
| **VOLT** | six-sided dark-glass conduit | violet plasma | travelling packets that BITE on arrival | a transformer with opinions; an arc-snap on the seat |

Built on Meta's [Immersive Web SDK](https://developers.meta.com/horizon/documentation/web/immersive-web-sdk/)
(`@iwsdk/core`) + Three.js, as an `immersive-ar` session with WebXR plane
detection for the room scan. The craft kit is carried over whole from
[RAVE RAID](https://github.com/yellkell/dance) — the canvas panel
language and its motion contract, the pointer grammar, the Rajdhani type
kit, the additive glow toolkit, the synthesised industrial sound palette,
and the clipped-liquid trick re-derived from a level surface into an
advancing flow front (the pour is the glowsticks' gel, rotated ninety
degrees and sent to work).

---

## Quick start

```bash
npm install
npm run dev          # → http://localhost:5173
```

- **Quest browser**: open the page, tap **CLOCK IN** → passthrough AR over
  your own room. If the headset has a room scan (Settings → Physical
  Space → Space Setup), the game uses your actual walls; without one, a
  stand-in room stands in after a few seconds and the board says so.
- **Desktop**: the IWSDK dev plugin injects a WebXR emulator (IWER) —
  click CLOCK IN and drive with the emulator's controls; the stand-in
  room appears (there is no plaster in a browser tab), with hairline
  frames drawn on its walls whenever a flange wants placing.
- **Mid-shift**: the right controller's **Ⓐ** raises **THE JOB CARD** —
  the sheet's live state, a clock, and two honest buttons: BACK TO IT or
  DOWN TOOLS. The hands pause under the card; a pour mid-race keeps
  racing, because the machine doesn't know you stopped.

There's also a debug hook in the console — the same one the headless
tools drive: `__tubes.site`, `__tubes.walls`,
`__tubes.menu.act('start')`, `__tubes.place.mountAt(id, u, v)`,
`__tubes.tube.grab()` / `.dragTo(x,y,z)` / `.release()`,
`__tubes.flow.progress()`, `__tubes.info()`.

## The room

The scan arrives as WebXR planes; WallSystem folds the vertical ones into
a registry of walls — centre, into-the-room normal, tangent basis,
extents — and everything downstream (the reticle, the socket picker, the
mount poses) reads walls through it and never touches a raw plane again.
Hardware mounts inside a **band**: away from edges, between hip and
reach height, so nothing ever asks you to fit pipe behind the sofa's
skirting or over a doorframe.

Where the socket wakes is **seeded per run**: sampled across every other
usable wall, kept only if the straight run lands inside range, scored
(long-haul jobs want the farthest honest spot; every job prefers a spot
the flange roughly faces), with a seeded jitter among the top few — so
reruns differ, but a tool's fixed seed replays a layout exactly.

The registry holds more than walls: the scan's **floor and ceiling**
are surfaces too (tables, desks and the rest of the furniture shelf are
deliberately filtered out — the machine lives in the room's bones, not
your coffee table), and a seeded roll sometimes routes a run's exit
port there. Flanges stay wall-mounted; it's the room's half of the run
that gets adventurous.

No scan — an emulator, a declined permission, an unset-up headset — and
the **fallback room** stands in after a grace: four synthetic walls
plus a floor and a ceiling around wherever you're standing. Honest
registry citizens in every way except `real`; the game plays
identically, and the board's status chip tells the truth about which
room you're in.

## Project map

```
src/
  config.ts              every tunable: walls, tube, seat, wake, flow,
                         the three lines, the five jobs, the board
  main.ts                IWSDK world boot (immersive-ar) + systems
  audio/sfx.ts           synthesised industrial sound kit (RAVE RAID
                         lineage: tone / whooshNoise / clank / servo /
                         subSwell) + the three lines' continuous hums
  materials/glow.ts      additive glow toolkit (vendored)
  materials/flow.ts      THE POUR: the clipped-liquid trick re-derived
                         for an advancing front inside a pipe
  room/walls.ts          the wall model: registry types, mount band,
                         the seeded socket picker, the fallback room
  floor/plan.ts          THE FLOOR: the hazard-tape site boundary —
                         SLUGFEST's ring layout ported whole (clamps,
                         wall snap, the plant law, per-headset save)
  floor/grid.ts          the world-anchored build lattice + occupancy
  floor/tape.ts          the tape rig: striped bands, bench posts,
                         grab rings, deck line, lattice hint
  factory/state.ts       the plant singleton: units, supply runs, parts,
                         the live sheet, the bank, the event bus
  factory/sim.ts         the factory's heartbeat, pure of scene and
                         speaker: feeds pour, makers stamp, belts carry,
                         combiners fit, the dock counts
  factory/units.ts       bench hardware: maker/combiner/rail/chest/dock,
                         the gland (a socket on legs), feed pillars, and
                         the part KITS — every item a little assembly in
                         its lineage's plate language, instanced
  tube/geometry.ts       telescoping maths: cubic path, root-first
                         section fill, spans, stops
  tube/build.ts          the hardware: flange / socket / segments /
                         collar / hologram, one shared-geometry factory
  game/state.ts          the `site` singleton every system reads
  game/flow.ts           screen changes: start, abandon, land, ceremony
  game/progress.ts       unlocks + best times (localStorage)
  game/rng.ts            seeded rng (vendored)
  game/haptics.ts        the buzz
  systems/WallSystem.ts       scan → registry (+ the hint frames)
  systems/FloorSystem.ts      the floor adjust verb: grab a tape side,
                              drag it to your wall, Ⓐ when done
  systems/BuildSystem.ts      unit holograms stamped onto the lattice
                              (armed from the shift card; pieces face
                              themselves, Ⓑ turns one, Ⓑ empty-handed
                              unbolts)
  systems/FactorySystem.ts    the shift: feeds, the factory pull (the
                              two-hand verb, re-aimed at glands), pours,
                              the sim's beat, parts, the dock's counter
  systems/PlacementSystem.ts  the reticle, the mount, the wake
  systems/TubeSystem.ts       the pull: grab, ratchet, park, magnet, seat
  systems/FlowSystem.ts       the payoff: charge, pour, bloom, shaft,
                              hums, ceremony
  systems/MenuSystem.ts       the board + THE JOB CARD (panel kit)
  ui/panel.ts, ui/pointer.ts, ui/fonts.ts   the RAVE RAID surface
                              language, re-accented furnace amber
tools/
  job-walk.mjs           THE FULL SHIFT: every job worked end to end,
                         headlessly, with phase/unlock/budget/joint asserts
  floor-walk.mjs         THE FLOOR: tape defaults, clamps, snap, lattice
                         stamping, the plant law, persistence — asserted
  order-walk.mjs         THE SHOP, built BY HAND: the same aim + trigger
                         the controller runs — auto-facing, Ⓑ's override,
                         the link law, refusals, the delete tool, goals
                         advancing in place, and the card's geometry
                         (nothing over anything, nothing off the edge)
  card-look.mjs          the Ⓐ card, page by page, as PNGs — painted text
                         has no rects to assert, and "the text was
                         obscured" is invisible to every state check
  preview-shot.mjs       screenshots of the moments that carry the look
  socket-look.mjs        a socket from 14 angles — the anti-culling check
                         (open geometry looks whole from one viewpoint and
                         half-there from the next; only an orbit catches it)
```

`DESIGN.md` has the full design notes and the roadmap. `FACTORY.md`
carries the factory direction — PIECEWORK: the genre research, the whole
design, and the phased build. Phases 0–2 are in (plus the bank's BILLS
from phase 3): mark the floor out in hazard tape — it comes down once
you're set up — and the board's ORDERS tab opens a five-sheet work book:
feeds on the floor's sides, the two-handed pull re-aimed at bench
machines whose intakes SWIVEL to meet the tube, rails and boxes that
TURN THEMSELVES to connect — and Ⓑ turns one yourself when you disagree
— a chest, a combiner, and a dock counting every delivery. One entrance,
one continuous session: goals advance in place on the Ⓐ card as you fill
them, the catalogue grows with them, and when the book runs out the shop
just stays open.

## Checks

```bash
npm run typecheck        # strict TS, no emit
npm run dev &            # then:
node tools/job-walk.mjs  # the whole ladder, asserted (exits non-zero on fail)
node tools/floor-walk.mjs     # the factory floor: tape, clamps, lattice
node tools/order-walk.mjs     # the shop, built through the hands' own path
node tools/card-look.mjs      # shots/card-*.png — every page of the Ⓐ card
node tools/preview-shot.mjs   # shots/ of the landing, board, pull, pour
node tools/socket-look.mjs    # shots/socket/ — one socket, 14 angles
```

The walk drives the REAL game through the debug hook — real placement
maths, real spring, real magnet, real pour — no mocks anywhere.

## Deploying

`deploy.yml` builds `dist/` and ships it to GitHub Pages on every push to
main (Pages must be set to "GitHub Actions" in the repo settings). The
site is fully static and fully offline-capable once loaded: no server, no
accounts, no telemetry — progress lives in the headset's localStorage.
WebXR needs https, which Pages is.
