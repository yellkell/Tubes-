# PIECEWORK — from spatial puzzle to factory game

*Research + design + build plan for taking TUBES from a five-job pipefitting
ladder to a room-scale factory game in the shapez / Satisfactory family.
Working title: **PIECEWORK** (shop-floor word for getting paid per part made —
which is exactly the game). The name is a placeholder; the design isn't.*

**The pitch in one line:** you brought THE WORKS back online — now it opens
its supply manifolds, posts work orders, and your room stops being the
machine room and becomes the **shop floor**: set your floor like a boxing
ring, haul supply tubes out of wall-mounted feeds into maker boxes, belt the
parts together, and deliver ten of whatever the order sheet wants — each
sheet wanting something one step deeper than the last.

---

## 1 · Research: how the reference games are built

Two games define the genre's structure; a handful of VR titles have tested
it in room scale. What follows is the load-bearing skeleton of each, then
the grammar they share — the part we're actually importing. (Numbers below
come from shapez.io's open-source repo, the parsed Satisfactory 1.0 game
data, and the games' wikis — sources at the end.)

### shapez / shapez 2 (tobspr Games)

- **The goal structure is the whole game.** A central hub demands *N of
  shape X*; a live counter sits on the hub itself. Deliver them — at any
  pace, there is no failure — and the next level appears, wanting a shape
  that takes one more operation to make. The authored ladder is 26 levels,
  then freeplay generates targets forever. **This is the user-facing shape
  of our design: "create 10 of a certain item that gets increasingly more
  complex" is shapez's level loop, verbatim.**

  | Lvl | Target | Qty | Unlocks |
  | --- | --- | --- | --- |
  | 1 | plain circle | 30 | cutter (+ trash) |
  | 3 | plain rect | 70 | balancer |
  | 6 | quarter circle | 270 | painter |
  | 8 | blue halves | 480 | colour mixer |
  | 10 | cyan star | 800 | stacker |
  | 12 | two-layer shape | 1,000 | **blueprints** |
  | 14 | two-layer | **8/second** | (first *throughput* goal) |
  | 20 | the "logo" | 25,000 | wires layer |
  | 26 | 4-layer "rocket" | 50,000 | freeplay |

- **The target is its own recipe.** A shape's quadrants, colours and
  layers *visually encode* the cuts, paints and stacks that make it — you
  reverse-engineer the goal by looking at it, never by reading a menu.
  Three primary colour patches mix additively into seven colours for free
  combinatorial depth.
- **Complexity comes from operations, not new resources.** A handful of
  raws and transforms — cut (1→2), rotate (1→1), paint (2→1), mix (2→1),
  stack (2→1) — compose into thousands of targets. Buildings are **free
  and infinite**; the stacker is deliberately the slowest processor, so
  late shapes force *parallelization*, not just longer chains.
- **One new verb per level.** Cutter, then balancer, then rotator, tunnel,
  painter, mixer, merger, stacker — each level's target is impossible
  without exactly the newly granted building. The tutorial is the ladder.
- **Overdelivery banks; banked shapes are the only currency.** Every shape
  ever delivered accumulates in the hub, and upgrades (belt / extractor /
  processor / painting speed, tiers II–VIII: +50%…+200%, ~×8 total) cost
  *specific banked shapes* — e.g. belt tier II = 30 more of level 1's
  circles. Surplus production is never waste; old lines stay alive because
  their product stays spendable. Blueprints run on their own mass-produced
  shape.
- **shapez 2** keeps the identical skeleton (Vortex at map centre →
  ~10 milestones + side tasks → research points → shop) and scales the
  space: build platforms in 3D connected by notches, **three build layers
  per platform**, space belts (one = 48 lanes), trains from Milestone 2,
  infinite Operator Levels that pay for delivering *old* milestone shapes
  continuously. The lesson for us: the skeleton survives a dimension
  change untouched — encouraging, since we're about to change dimension
  harder than they did.

### Satisfactory (Coffee Stain)

- **Tiers and milestones.** Progress is Tiers 0–9, each rung opened by
  delivering a bill of parts to the HUB (Tier 2's Assembler costs
  200 cable + 200 rod + 500 screw + 300 plate). Tier *bands* are gated by
  **Space Elevator phases** — huge deliveries of deep assemblies
  (Phase 1: 50 Smart Plating; Phase 2: 500 Smart Plating + 500 Versatile
  Framework + 100 Automated Wiring; Phase 3 wants thousands). Project
  parts **cannot be handcrafted** — automation is mandatory, by law.
- **Machine complexity scales by input count.** Nearly a design law:
  Smelter (1 in, 4 MW) → Constructor (1 in, 4 MW) → **Assembler (2 in,
  15 MW)** → **Manufacturer (4 in, 55 MW)**, refineries running a
  parallel fluid ladder. A late part is late because more belts enter the
  box, and the power bill scales with it.
- **The canonical early chain** — iron ore → ingot → plates + rods →
  screws → **Reinforced Iron Plate** (Assembler: 30 plate + 60 screw →
  5/min) — is the first moment the game asks you to *plan* two parallel
  lines merging into one 2-input machine, and the moment most players
  fall in love. Phase 1's 50 Smart Plating ≈ 25 minutes of runtime from
  ~5 machines: tuned so you *leave it running and go expand*.
- **Logistics unlock as pressure arrives.** Belts in speed marks
  (Mk.1–6: 60 → 1,200 items/min), splitters/mergers and containers early;
  trucks, trains, drones only when distance demands them. Storage is
  explicitly a buffer against rate mismatch.
- **Power is the tax on scale.** Every machine draws it; eras of the game
  are power eras (biomass 30 MW → coal 75 → fuel 250 → nuclear 2,500),
  and an overloaded grid trips a fuse. Overclocking trades superlinear
  power for speed. (We don't want a literal grid in a 3×3 m room — but
  the *throttle role* needs an answer; see Feeds below.)
- **Alternate recipes as discoveries.** Crash-site hard drives each offer
  a choice of 1-of-3 alternate recipes (~109 of them) that restructure
  ratios — replay and expression with zero balance risk, since defaults
  always suffice. The MAM research trees (96 nodes) do the same for
  optional tech.

### Room-scale VR precedents

- **The Last Clockwinder** (Pontoco, 2022) is the landmark: you record
  short loops of your own hand motions into clones that chain into
  assembly lines. Its lesson, and now our pillar: **in VR the body is the
  first machine** — automation must replace something your hands were
  genuinely doing, so it lands as relief, not homework. Generous snapping
  and a pod-sized room as the optimization puzzle.
- **VRactory** (App Lab) is the closest true VR shapez — machines linked
  by belts building toward explicit rate goals. **Conveyor VR** does
  assembly under throughput pressure on scripted lines. **Fail Factory**
  (Armature) reduces factory to hand-speed minigames — evidence that
  station work gets repetitive *without* a building layer. Nobody has
  shipped the passthrough-AR version where the factory stands in your
  actual room. That's the open lane.

### The shared grammar — twelve laws we're importing

1. **Source → transform → combine → deliver.** Everything is this pipe.
2. **The goal is a count of a named item,** its progress counter mounted
   on the delivery point itself. No failure state; pace is the player's.
   (TUBES already lives by "no failure states, only unfinished jobs.")
3. **The target is its own recipe** — it visually encodes what built it.
4. **One new verb per level.** The ladder is the tutorial. TUBES' five-job
   ladder is already built this way.
5. **Complexity ramps depth first, arity second, throughput third.**
   Longer chains, then 2-input machines, then rates that force parallel
   lines. In a room, every input is a physical route — hold high-arity
   boxes until late, or forever.
6. **Building is free; throughput is earned.** Placing plant never costs.
   Upgrades cost banked product.
7. **Logistics arrive exactly when their absence hurts:** hands → belt →
   split/merge → buffer. (And trash must arrive with the first
   byproduct-maker — shapez ships it with the cutter.)
8. **Yesterday's target is tomorrow's ingredient.** Era gates consume the
   previous era's product (elevator phases, upgrade bills of old level
   shapes) — "puzzle solved once" becomes "production line kept alive."
9. **The factory persists and grows.** Orders change; the plant stays.
   Tearing down a working line is the genre's cardinal sin.
10. **Overproduction banks.** A running factory is never wasted.
11. **When complexity exceeds working memory, hand out compression** —
    blueprints (shapez L12, Satisfactory Tier 4) — and hide alternate
    recipes as discoveries in the world.
12. **The payoff is watching it run** — the first item traversing the
    finished chain, items visible the whole way, a tick per delivery.
    And in VR: the body is the first machine.

**Where we deliberately deviate:** no power grid (a room doesn't need two
throttles — **spout rate is our power**, and the second spout is our
"more power"); no trash in v1 (no recipe has a byproduct — every output
has a consumer, and the chest is the only buffer); count goals never
become pure throughput goals in the campaign (waiting is legal; parallel
lines just make the room *feel* better and the bank fill faster).

---

## 2 · What we already own

This is not a from-scratch project. Inventory of the two codebases, mapped
to the factory design:

### From TUBES (this repo) — carries over nearly whole

| Existing | File(s) | Factory role |
| --- | --- | --- |
| Wall registry (walls/floor/ceiling, mount band, fallback room) | `room/walls.ts`, `systems/WallSystem.ts` | Feeds snap to real walls; floor rect initialises from the scan |
| The two-handed tube pull (grab, ratchet, steer, park, magnet, seat) | `systems/TubeSystem.ts`, `tube/*` | **The connection verb**: hauling supply from a feed spout into a box intake |
| Typed lines with full identity (metal, light, pour, voice) | `config.ts` LINES, `tube/build.ts` | **The raw materials.** AMBER / CYAN / VIOLET feedstock = MAINS / COOLANT / VOLT, colour → item |
| The pour (arc-length flow front, one unbroken column) | `materials/flow.ts`, `systems/FlowSystem.ts` | A seated supply run pours *continuously* — a live supply line reads as exactly what it is |
| Placement grammar (hologram on ray, clamp-to-legal, stamp) | `systems/PlacementSystem.ts` | Generalised from wall mounts to floor-grid placement of boxes/belts |
| Board + Ⓐ job card, panel kit, pointer lasers | `systems/MenuSystem.ts`, `ui/*` | The board becomes the order sheet; the card becomes the **Ⓐ shift menu** |
| Jobs ladder, unlocks, best times, seeds | `config.ts` JOBS, `game/progress.ts`, `game/rng.ts` | Orders ladder, the bank, seeded layouts |
| Synth sound kit + per-line detuned hums | `audio/sfx.ts` | The factory soundscape — more lines running = richer room |
| Headless tool discipline (`__tubes` hook, job-walk, preview-shot) | `tools/*` | `factory-walk.mjs`: set floor, build a chain, assert 10 delivered — no mocks |

### From SLUGFEST (goopboxing2) — one mechanic, ported

| Existing | File(s) | Factory role |
| --- | --- | --- |
| The adjustable ring: 4 independent sides, `{left,right,near,far}`, clamps keep it a ring, saved per headset | `arena/ringLayout.ts` | **THE FLOOR** — the play boundary, same data shape, same law |
| Adjust mode: quick-menu toggle → glowing side handles → trigger-grab a side → drag along its own normal → release saves | `systems/ArenaSystem.ts` (`adjustTick`), `systems/MenuSystem.ts` | Floor setup before/between orders, one side at a time, to your real walls |
| "Layout is cosmetic by law" discipline | `arena/ringLayout.ts` header | Ours is stronger: the floor is *functional* (feeds stand on its sides) but still per-headset and re-adjustable |
| Two-seat mirror math | `game/ring.ts` | The door to co-located co-op factory, already cut |

Nothing else crosses over from SLUGFEST — the goop, the judge and the
Firebase wire stay home.

---

## 3 · The design

### The fiction

TUBES ends with THE WORKS lit. PIECEWORK begins the morning after: the
machine is awake, it remembers you, and it has *orders to fill*. The walls
grow supply manifolds; a work board posts sheets; the room hums louder the
more of your plant is running. You are no longer the fitter — you're the
shop.

### THE FLOOR — the boundary (ported from SLUGFEST's ring)

Before the first order, the board hands you the floor: a rectangle of
amber-and-black **hazard tape** strung post to post at hip height across
your real floor — SLUGFEST's ADJUST RING verb, restrung in barricade
tape (the team call: tape, not ropes — and the shop's furnace amber IS
caution livery, so the boundary wears the game's one accent for free).
Bench-height corner posts, a hairline deck mark, the build lattice faint
inside it, and in adjust mode each side grows a glowing grab ring —

- reach toward a side, **hold trigger, drag it along its own normal** to
  your real wall; release and it stays; one side at a time; clamps keep a
  minimum floor (≥ 1.8 × 1.8 m) and a maximum inside arm's-reach of the
  registry's walls.
- with a room scan, sides **initialise at your actual walls** (inset
  0.25 m) and **snap** to a wall when dragged within 0.2 m of it; in the
  fallback room, a 3.6 × 2.8 m default stands in — same law as both
  parent games, playable anywhere.
- the layout **saves per headset** (`localStorage`, the SLUGFEST pattern)
  and greets you next shift.
- once plant is standing, a side **refuses to cross it** — the clamp
  extends to occupied cells, so re-planning the floor can never orphan a
  machine outside the boundary.
- and once you're set up, **the tape comes down**: barricade tape is site
  dressing, not furniture. It stands only while the floor is being marked
  out; the boundary lives on in the lattice and the feeds standing on its
  sides, and SET THE FLOOR raises it again any time.

### THE FEEDS — tube spawners on every side

Each side of the floor gets a **FEED**: a manifold pillar standing at the
side's midpoint, facing in, wearing its line's metalwork head to toe (the
`build.ts` plate language — nobody will mistake whose feed it is from
across the room). Its **spout** is a flange-and-gland at hand height.

- **Feed colours:** far = **AMBER** (mains), left = **CYAN** (coolant),
  right = **VIOLET** (volt), near = **PEARL** — a fourth line kept in
  reserve (dormant through the campaign, the expansion hook; the DESIGN.md
  roadmap's STEAM finally gets its job). Feeds sleep until their first
  order wakes them — knock, iris, hum: the TUBES wake theatre, reused as
  the unlock ceremony.
- **The spout is where the pull lives on.** Grab the collar two-handed and
  haul a telescoping tube out of the feed — the entire existing verb,
  unchanged — and seat it into a **box's intake** instead of a wall
  socket. A seated run pours continuously: it is a supply line now, and
  the pour shader already knows how to be one.
- **THE GLAND SWIVELS.** A box's intake is a collar that ORBITS its drum:
  it turns to face wherever the tube is coming from, so a hookup is never
  refused for arriving on the wrong side, and a box can be re-fed from a
  feed clean across the room without moving an inch. (The first cut
  welded the gland to the box's back face, and playtest killed it inside
  a minute: every connection became a guessing game about which way the
  box happened to be facing — "doorways, not keyholes" broken in the one
  place the whole game hangs off. Now the door turns to face you and the
  alignment gate is satisfied *by construction*: all we ask is "bring it
  near", inside a catch radius wider than the wall sockets'.)
- **Spout rate is our power grid** (deviation note above): a spout
  supplies a fixed rate, generous for one consumer, tight for two — the
  throttle that makes upgrades and layout choices matter without ever
  drawing a wire.
- **One spout, one run.** A feed supports a single live tube. The
  **SECOND SPOUT upgrade** (bought from the bank, per feed) grows a
  second gland beside the first — servo ceremony, very visible — for a
  second simultaneous run. The second spout carries a **colour dial**:
  grab and twist (ratchet detents — the feel kit already has them) to
  tune it to any *unlocked* line, so late floors can pull two ambers for
  a hungry gear line, or bring violet to a wall it never lived on. This
  is the user-spec "second spout to give more options" made physical.

### Hands make connections, belts make throughput

The thesis that keeps TUBES' soul inside a factory game — and the
research's law 12 (the body is the first machine, per The Last
Clockwinder) made structural:

- **Tubes carry fluid, and only hands place tubes.** Every supply hookup
  is the two-handed haul — heavy, deliberate, satisfying, rare (a dozen
  times a shift, not a hundred).
- **Belts carry parts, and belts are automation.** Rails arrive with the
  very first maker, so the first part you ever stamp rides home in front
  of you. (The first cut withheld them a sheet longer and made you
  hand-carry ten gears; playtest found the hole immediately — parts
  stacked two-deep on a chute you had to know to look at, and the sheet
  simply never finished. Carrying still works, and still matters for
  loading a chest or a combiner port by hand — it is just no longer the
  only way anything moves.)

### THE SHOP FLOOR IS BENCH HEIGHT

A room-scale factory that lives on the actual floor is a crouching
simulator. So: **every unit stands on legs at bench height (~0.85 m)** —
boxes are waist-high bench machines, belts are self-supported rails at
0.8 m, chests are crates on stands, the dock is a pedestal. The whole
factory lives inside TUBES' existing mount band ("where hands actually
work", 0.7–2.05 m) and nothing ever asks your knees. Parts riding rails
at bench height also sit exactly where passthrough looks best — mid-room,
against your real furniture, not lost in carpet.

### The units (crafted from the Ⓐ card, placed on the grid)

Placement uses a **soft grid**: 0.35 m cells aligned to the floor
rectangle. Holograms snap; occupied cells refuse with a buzz; the nearest
free cell inside reach is always offered (doorways, not keyholes).

| Unit | Ports | What it does |
| --- | --- | --- |
| **MAKER box** | 1 tube gland in · 1 rail out | Solidifies feedstock into the colour's base part every few seconds — gulp, stamp, eject |
| **COMBINER box** | 2 rail in · 1 rail out | Two different parts in, one deeper part out; *the* complexity machine (the Assembler law — and per law 5, arity 2 is our ceiling for the campaign) |
| **BELT rail** | 1 in · 1 out per piece | Floating rail pieces — no legs, just two skids and a slatted TREAD that visibly runs (one shared scrolling texture; rotation carries direction); speed is upgradable |
| **SPLIT / MERGE tee** | 1→2 / 2→1 | Routing pressure valves; unlock exactly when their absence hurts (law 7) |
| **CHEST crate** | 1 in (+ hand access) | Buffers 12 parts against rate mismatch; also the bin you grab from to hand-carry |
| **THE DOCK** | 1 tube gland · 1 rail hopper · hand hopper | The delivery point — a round player-placed pedestal with an amber mouth, one per floor. Drinks fluids, swallows parts, **flashes its halo as each one lands**, banks the surplus. The COUNT itself rides the Ⓐ card — a chosen deviation from law 2: the room floats nothing |

Boxes and rails are **free to craft** (law 6: never charge for trying).
The bank buys **upgrades** only.

**THE FACING IS THE GAME'S PROBLEM, NOT YOURS.** Every piece turns
itself to connect: a rail swings to feed whatever it touches, a maker
aims its chute at a rail, a combiner turns so its two ports face the
lines that would fill them. Your aim only breaks ties. Lay rails
*backward from the dock* and the whole run self-orients with no
rotation input at all — which is the difference between laying a
conveyor and solving a puzzle about laying a conveyor.

**THE CONNECTION LAW, DRAWN BEFORE YOU COMMIT.** Rails feed rails,
docks, chests and a combiner's two ports — never a maker, which drinks
fluid off a tube and has no use for a part. While the ghost stands,
amber chevrons show exactly what it will feed and what will feed it;
aim a rail at a maker and no chevron appears. Standing plant keeps its
chevrons too, so a chain reads as a chain across the room instead of a
row of boxes.

**DELETE IS A TOOL.** It sits in the card beside the boxes and paints
its target red — a verb nobody can find is a verb that doesn't exist.
Moving it there freed Ⓑ up for the verb it should always have had:

**THE RAIL IS PULLED, NOT STAMPED.** Pressing a trigger once per cell
is bookkeeping, not a verb — and this game already owns the best verb it
has. So: stand ONE rail where the parts come from, keep hold of the
trigger, and haul. The run ratchets out toward wherever you point, one
detent per cell, pitched up the run exactly like the tube's telescoping
sections, so a long lane plays a rising scale. Let go and it is rails,
every piece already facing the next. **Flow follows the drag** — the same
way the tube's head follows your hands — so you pull *from* the maker
*to* the bank and the last rail arrives pointing into it. A press with no
drag is still one rail, so nothing was taken away.

**AND THE STICKS BEND IT.** A haul goes direct by default: one leg, one
corner, one leg. Buy ROUTING POSTS (10 GEAR — priced in the part the very
first lane makes, because a routing aid you cannot afford until the book
runs out is one nobody ever uses) and you can plant sticks: a survey peg
with striped collars and a bright cap. Any stick standing between the two
ends of a haul — within two cells of the box between them, because a
straight drag's box is a line with no width and nothing could ever be
inside it — becomes a waypoint the run visits in order. Plant the stick
where you want the bow. The rail takes its place as it passes; the stick
was scaffolding, and scaffolding comes down.

**THE HOLOGRAM WEARS THE MACHINE.** The ghost used to be one anonymous
crate for every tool, which meant the catalogue told you what you had
picked and the floor didn't — you found out what you had built by
building it. Each tool now holds its own body, from the very same builder
the standing plant uses, in glass: the maker's drum and piston, the
combiner's twin lobes, the bank's mouth, the crate's bands, a post's
stick.

**THE DOCK IS THE BANK.** One name for one thing. It was always where
deliveries land AND where the surplus accrues — two words for that was
one too many, and "bank" is the one the player already reads on the card.

**QUIT ASKS FIRST.** It used to say DOWN TOOLS and mean it immediately;
one mis-click took a whole floor of plant with it. Now it arms, the same
two-press confirm RESET PROGRESS has always had.

**Ⓑ TURNS THE PIECE, AND MEANS IT.** Auto-facing is the default, not a
cage. With a piece in hand, Ⓑ ratchets it a quarter turn and that
choice *wins over the scorer* until the piece lands — otherwise the
button appears to do nothing, because bestRot simply argues it back.
Four presses walk the compass and come home. The override is per piece:
the next one goes back to facing itself, which is right far more often
than a stale hand angle. Empty-handed, Ⓑ unbolts exactly as it always
did — one button, and what you are holding decides which verb it is.

*(An earlier cut split plant into "wall plant" — dock and combiner
bolted to the site's edge. Playtest killed it: it turned every one of
them into a hunt for a legal cell, for a tidiness nobody had asked for.
Everything stands anywhere now.)*

**Every role its own silhouette** (shipped): the MAKER is a solidifier
drum with a working piston, the COMBINER twin lobes under one pressing
clamp, the CHEST a banded crate, the DOCK the round pedestal with the
amber mouth. Machines tell you what they are from across the room — and
tell you when they're WORKING: pistons bob, clamps press, lamps pulse,
the dock's halo flashes as parts land.

### Items: colour → part, part + part → deeper part

Three colours in the campaign; every recipe is 1-in (maker) or 2-in
(combiner). Depth first, arity second, throughput third — the research
ramp, exactly. And per law 3, **a composite part visibly contains its
ingredients** — a PUMP is an iron gear-body with an alloy cell-throat; a
CORE has an engine block and an arm articulation readable at arm's length
— so a target on the sheet is reverse-engineerable by looking at it,
never by reading a recipe menu.

Every item is built as a little **assembly** (a component kit over shared
geometry, instanced — a floor of parts is a dozen draw calls): the gear
is a sixteen-tooth double plate on a lit amber axle, the cell a machined
canister with a glowing charge band, the chip a dark hex wafer with
violet traces inside — and the tier-2 kits wear both parents. Parts at
rest turn slowly on the bench; a part in your fist holds still. And every
item carries a **works docket** — one line of what the machine behind
your walls DOES with it, printed on the order sheet — so nothing you
make is ever just a token.

| Tier | Item | Recipe | Silhouette (free identity, per the lines' plate language) |
| --- | --- | --- | --- |
| 0 | AMBER · CYAN · VIOLET | feeds | the pours themselves |
| 1 | **GEAR** | maker ← amber | eight-sided cast iron (mains) |
| 1 | **CELL** | maker ← cyan | smooth alloy canister (coolant) |
| 1 | **CHIP** | maker ← violet | six-sided dark-glass wafer (volt) |
| 2 | **PUMP** | gear + cell | iron body, alloy throat |
| 2 | **LAMP** | cell + chip | canister with a lit crown |
| 2 | **SERVO** | gear + chip | iron ring on glass |
| 3 | **ENGINE** | pump + gear | the first part that needs a *split or a second spout* |
| 3 | **ARM** | servo + cell | — |
| 3 | **BEACON** | lamp + gear | — |
| 4 | **CORE** | engine + arm | the campaign's final part — everything at once |

(PEARL and its SHELL part, plus an INFUSER box — part + fluid in — are the
post-campaign expansion lane, deliberately outside v1's tree.)

### ONE SHOP, ALWAYS OPEN

There is **one entrance and one session**. You open the shop and stay in
it: goals advance in place as you fill them, the catalogue grows with
them, and when the book runs out the shop simply stays open with every
feed awake and nothing left to ask. No mode to choose, no trip back to
the board between sheets.

The first goal already hands you **dock, maker and rails** — enough to
build a whole working chain in the first minute. (The bit-by-bit
unlock was the other half of playtest's brick wall: gated to one box at
a time, the shop read as a locked room, while starting with everything
read as a pile of parts with no reason to touch any of them. Growing
*while you play* is the only version that behaves like a factory game.)

The Ⓐ card's **GOALS** page carries the book: the ladder with what's
done, what's live and what's next — and tapping a sheet opens it up for
the deeper read, the works docket it serves, and the actual steps it
asks of you.

### THE ORDERS — the level ladder (ten sheets, one new verb each)

Every order: **deliver 10 ×** the target. No timers, no failure; best
time per sheet on the board, exactly like the jobs today. The plant
**persists between orders** — sheets change, the factory grows (law 9;
DOWN TOOLS still clears the floor if you want out). And the ladder obeys
law 8 by construction: **every tier-2 target returns two or three sheets
later as an ingredient** (PUMP → ENGINE, SERVO → ARM, LAMP → BEACON), so
the line you built for order 4 is still earning in order 7.

| # | Order | Target ×10 | What wakes / what it teaches |
| --- | --- | --- | --- |
| 1 | FIRST DRAUGHT | AMBER (fluid) | The floor, the dock, the pull: run one tube feed→dock. Pure TUBES, new destination |
| 2 | PIECE WORK | GEAR | Now MAKE something: tube→maker→rail→dock, and the first part you ever stamp POPS out of the chute and rides home in front of you |
| 3 | THE LINE | CELL | CYAN wakes: a second maker, a second lane, two chains sharing one dock |
| 4 | FIRST FITTING | PUMP | The COMBINER: two lines merging into a 2-in box — our Reinforced Iron Plate moment |
| 5 | NIGHT SHIFT | LAMP | VIOLET wakes; the CHEST arrives to buffer the rate mismatch it creates |
| 6 | HOT ORDER | SERVO | SPLIT/MERGE tees; the bank starts posting upgrade bills worth chasing |
| 7 | THE PUSH | ENGINE | Needs gear in *two* chains: split the gear rail **or** buy the SECOND SPOUT — the first layout decision with two right answers |
| 8 | COLD SNAP | ARM | Parallel deep chains; chest discipline |
| 9 | FULL BOOK | BEACON **and** PUMP | Two targets on one sheet — the factory serves two masters |
| 10 | THE CORE | CORE | Everything running at once. The dock drinks the tenth core, every feed surges, and the room gets the full ceremony |

**The tuning law** (from the research: shapez's count ramp, Satisfactory's
"leave it running and go expand"): rates are set so a naive single chain
finishes a sheet in **3–5 minutes** and a well-parallelized floor in
**under one** — waiting is always legal, building is always better.
First-guess rates for `config.ts` (reasons attached there as ever):

```
FEEDS.spoutRate    0.8 units/s        one consumer generous, two tight
UNITS.maker        1 part / 4 s       (drinks 2 units)
UNITS.combiner     1 part / 6 s
UNITS.railSpeed    0.35 m/s           parts 0.3 m apart
UNITS.chestCap     12
```

### THE BANK — the one currency (and it's the parts themselves)

The research is unambiguous (law 6 + 10, straight from shapez): the
strongest factory economy is **no abstract currency at all**. So:

- The dock counts deliveries against the sheet first; **everything beyond
  the sheet banks** — a per-item tally kept in progress storage, shown on
  the Ⓐ card. A running factory is never wasted.
- **Upgrades are bills of banked parts,** exactly like milestones — which
  keeps old lines alive (law 8) and makes overproducing *specific* items
  a decision, not noise. **Shipped:** the shift card's SUPPLY page lists
  the bills; pay one and the fitting is yours for good, live immediately
  (five-sheet-book pricing below — the numbers grow with sheets 6–10):

| Upgrade | Effect | Bill |
| --- | --- | --- |
| LONG REACH ✅ | tube max length +2 m | 4 GEAR |
| BELT PACE ✅ | rail speed +25% | 8 GEAR + 6 CELL |
| QUICK BOXES ✅ | maker/combiner craft −25% | 8 CELL + 4 PUMP |
| DEEP CRATES ✅ | chest 12 → 24 | 6 CHIP + 4 LAMP |
| SECOND SPOUT (per feed) | +1 tube run, colour-dialable | phase 3 — the big physical one |

### THE CATALOGUE — the Ⓐ menu

Mid-shift there is no board — and no hardware on your arm either (the
wrist-button idea retired; one press beats one gadget). **Ⓐ raises the
shift card dead ahead, below the eye line** — the job card, promoted:
laser-clickable with either hand, and **the sheet's goal lives on it**:
the big amber `3 / 10` and its target ride the card's header, because
the room floats nothing — the dock just flashes its halo as parts land.
Three pages under that header:

- **BUILD** — dock / maker / rail / combiner / chest, and DELETE at the
  end of the row; pick one and the card drops, the hologram rides your
  ray to the grid (trigger stamps, Ⓑ turns).
- **GOALS** — the book as a ladder (`✓` filled, `▸` running, `·` still
  to come), every sheet tappable for its docket, its steps in order,
  and what it feeds two sheets later.
- **SUPPLY** — the bills above: pay one and the fitting is yours for
  good, live immediately.

**AND THE CARD IS SIZED TO THE BOOK.** Playtest found text sitting on
other text all through GOALS, and two things were wrong. The card was
500 px tall for a page that wanted more, and — worse — every y on it
was a fixed offset, so a docket that wrapped to two lines printed its
second line straight through the first step. The card is now 680 × 640
(same 1000 px/m, so every font size is unchanged — bigger card, not
smaller type, because you read this at a metre through passthrough) and
nothing on it is a hard-coded pixel: pages measure themselves against a
header / body / footer band, text advances by the lines it actually
drew, and the steps stop where the footer begins.

*(And ALL GOALS bricked the game. `'goal:back'` starts with `'goal:'`,
so the index branch caught it first, parked `NaN` in `goalOpen`, and
the next paint indexed `ORDERS[NaN]` and threw — every frame, forever.
The walk pressed that exact button and passed, because it flipped the
page back in the same evaluate and no frame ever rendered the broken
state. It now presses it alone and lets real frames go by.)*

The clock, the bank tally, BACK TO IT and DOWN TOOLS ride the card too.

Raising it pauses the hands, never the machine — a factory mid-hum keeps
humming, because the fiction doesn't know you stopped (the job-card law,
inherited verbatim).

### The payoff economy

TUBES' aesthetic engine is reused as the factory's reward channel: every
craft is a thunk + glow gulp (and a piston or clamp you can SEE working);
every delivery a tick and a flash of the dock's amber halo — the count
itself rides the Ⓐ card; every completed sheet a chord; the tenth sheet,
the full ceremony. The per-line detuned hums
scale with live plant, so *the room itself* tells you how much factory
you own. Satisfaction stays the win condition; the timer stays garnish.

---

## 4 · Architecture

The discipline stays: every tunable in `config.ts` with its reasoning,
systems that own exactly one thing, a debug hook (`__tubes.plant…`) that
makes the whole factory drivable headlessly, tools that walk the real code.

### New modules

```
src/floor/plan.ts        THE FLOOR: {left,right,near,far}, clamps (incl.
                         occupied-cell law), wall-snap, save/load
                         — a straight port of arena/ringLayout.ts
src/floor/grid.ts        the WORLD-ANCHORED 0.35 m lattice + occupancy
                         (anchored to the world, not the rectangle, so a
                         dragged side never re-deals cells under plant)
src/floor/tape.ts        the hazard-tape rig: striped bands, bench-height
                         posts, grab rings, deck line, lattice hint
src/factory/items.ts     ItemSpec registry (id, tier, line lineage,
                         silhouette recipe)
src/factory/recipes.ts   RecipeSpec: 1-in maker table (colour→part) +
                         2-in combiner table (part+part→part)
src/factory/graph.ts     the plant graph: nodes (spout, run, box, rail,
                         chest, dock) + edges; pure and seedable
src/factory/sim.ts       the tick (fixed 8 Hz, decoupled from render):
                         spouts emit, runs supply, boxes craft, rails
                         advance slot-parts, chests buffer, dock counts
                         and banks — deterministic given layout + seed
src/systems/FloorSystem.ts    floor adjust mode (ArenaSystem.adjustTick,
                              ported) + feed pillars on the sides
src/systems/BuildSystem.ts    catalogue selection → hologram → grid stamp
                              (PlacementSystem's grammar, floor variant)
src/systems/FactorySystem.ts  runs sim, owns unit visuals + instanced
                              parts + craft/deliver fx
```

### Existing modules, extended

- `config.ts` grows FLOOR, FEEDS, UNITS, ITEMS, RECIPES, ORDERS, BILLS —
  the JOBS/LINES pattern, same voice, reasons attached.
- `game/state.ts`: `site` keeps screens (`board / shift / ceremony`);
  a sibling `plant` object carries floor rect, placed units, live runs,
  the bank, order progress; `generation` discipline unchanged.
- `systems/TubeSystem.ts`: seat targets become *unit intakes* (moving
  furniture) as well as wall sockets; the run's far pose comes from the
  box, not the picker. The pull itself doesn't change.
- `systems/MenuSystem.ts`: board gains the ORDERS ladder + the bank; the
  job card becomes the Ⓐ shift menu (same panel kit, same anchor —
  dead ahead, below the eye line).
- `game/progress.ts`: orders unlocked, best times, **the bank**, bought
  upgrades — still localStorage, still no server.
- `tools/factory-walk.mjs`: the new job-walk — set floor, wake feed,
  seat a run headlessly, stamp a maker + rails, assert parts advance and
  10 land, order flips, surplus banks, a bill pays, the second spout
  runs. Exits non-zero. `preview-shot.mjs` gains the money shots (bench
  line running, dock bloom, catalogue).

### Performance stance (Quest AR budget)

Instanced meshes per part type; one shared pour material per line; unit
shells from the existing shared-geometry factory; hum LOD (nearest ~6
sources audible); caps in config (~24 units, ~64 rail pieces v1) with the
`__tubes.info()` draw-call check in the walk. The existing per-run budget
maths says three tube runs + a full bench network fits if parts are
instanced — the walk asserts it instead of hoping.

---

## 5 · Build plan

Five phases, each ending green on `npm run typecheck` + a headless walk.

- **Phase 0 — THE FLOOR.** ✅ **SHIPPED.** `floor/plan.ts` (the ring
  port: clamps, the plant law, per-headset save), `floor/grid.ts`,
  `floor/tape.ts` (the hazard-tape rig), `systems/FloorSystem.ts` (the
  adjust verb + wall snap with a ratchet click), `systems/BuildSystem.ts`
  (crate holograms stamped onto the lattice, Ⓑ unbolts), SET THE FLOOR
  on the board's SYSTEM tab. All of it walked headlessly by
  `tools/floor-walk.mjs` — defaults dealt from the walls, the cap, the
  minimum, the snap through the live drag path, occupied-cell refusal,
  the plant law, and the layout surviving a reload — with the original
  five-job ladder still walking green beside it
  (`npm run dev`, then `node tools/floor-walk.mjs`).
- **Phase 1 — SUPPLY.** ✅ **SHIPPED.** Feed pillars stand on the tape's
  sides in their lines' metalwork (PEARL dormant on the fourth); the
  two-handed pull forked onto the shop floor (`systems/FactorySystem.ts`
  — same constants, same five rules, one honest difference: no
  predetermined socket, every free GLAND is a candidate and the nearest
  one inside the snap window takes the head); continuous pours + per-run
  hums; makers drink colour and stamp parts; the dock with its gland,
  hopper and delivery halo (the count rides the Ⓐ card); grip-carry (you are the first
  conveyor); Ⓑ unbolts in two steps (run first, unit second) whenever
  the hands are empty.
- **Phase 2 — LOGISTICS.** ✅ **SHIPPED.** Rails with visible parts,
  chute push, combiner ports fed from both sides, the chest, the ORDERS
  tab + the Ⓐ shift card with the BUILD catalogue, sheets 1–5 posting
  into one persistent shift, per-sheet best times, and the bank already
  tallying every surplus delivery (its BILLS wait for phase 3).
  `tools/order-walk.mjs` fills the whole book headlessly — the draught,
  the hand-carried gears, cells riding unattended, pumps from two lines,
  the mid-shift re-plumb to lamps, the chest, the bank — with the floor
  and job walks still green beside it.
- **Phase 3 — ECONOMY.** ◐ **Half in.** The bank and its BILLS shipped
  early (the SUPPLY page, four fittings live: reach, pace, quick boxes,
  deep crates — the walk pays one and asserts the deduction). Remaining:
  the SECOND SPOUT with its grab-and-twist colour dial, and sheets 6–7
  built on it. *Check: both ENGINE solutions walk green.*
- **Phase 4 — DEPTH & POLISH.** Tiers 3–4, two-target sheets, the finale
  ceremony, perf pass, preview shots. *The full ten-sheet ladder walks.*
- **Roadmap (post-v1),** each item genre-sourced:
  - **PEARL + INFUSER lane** (part + fluid recipes) and **fluid mixing**
    — shapez's three primaries → seven colours, ours: amber+cyan etc. at
    a MIXER box, a whole second depth axis for free.
  - **The blueprint stamp** (law 11): grab-duplicate a box *with its rail
    stubs*, paid from the bank — when floors get big enough to hurt.
  - **Alternate recipes as room discoveries** (law 11): rare parts found
    behind an iris that shortcut a chain; defaults always suffice.
  - **A second rail layer** (shapez 2's answer to saturation) when the
    bench plane fills — verticality as the relief valve.
  - **Persistent plant via WebXR anchors** — the factory still standing
    in your room tomorrow (the DESIGN.md roadmap's long game).
  - **Co-located co-op** on the two-seat mirror; **tracked-hands**
    grammar for the pull.

---

## 6 · Open calls (recommendations attached)

1. **Bench height vs floor scale.** Recommend bench (0.85 m) hard: it
   keeps the whole factory in the mount band and passthrough's best zone.
   The cost: less "toy city on the carpet" fantasy. Decide before Phase 0.
2. **Plant persistence across orders.** Recommend persistent within a
   shift (law 9); DOWN TOOLS clears. Cross-*session* persistence waits
   for anchors on the roadmap.
3. **Grid cell size.** 0.35 m assumed; verify against real reach in the
   headset during Phase 0 (0.3–0.45 m is the plausible band).
4. **Banked-part bills vs an abstract scrap currency.** The draft
   originally used scrap (one number, lighter UI); the research flipped
   it — shapez proves the parts-are-the-currency economy, and it feeds
   law 8 for free. Recommend bills; flag here in case the team prefers
   scrap's simplicity for v1.
5. **The fourth side.** Spec says every side gets a spawner — PEARL
   stands dormant as the visible promise of more. Alternative: the fourth
   side hosts the dock instead. Recommend dormant PEARL + player-placed
   dock.

---

## 7 · Sources

- shapez level/upgrade/building numbers: the open-source repo —
  [`levels.js`](https://github.com/tobspr-games/shapez.io/blob/master/src/js/game/modes/levels.js),
  [`regular.js`](https://github.com/tobspr-games/shapez.io/blob/master/src/js/game/modes/regular.js),
  [`config.js`](https://github.com/tobspr-games/shapez.io/blob/master/src/js/core/config.js);
  [Levels](https://shapezio.fandom.com/wiki/Levels) and
  [Freeplay](https://shapezio.fandom.com/wiki/Freeplay) wiki pages.
- shapez 2: [Vortex](https://shapez2.wiki.gg/wiki/Vortex),
  [Milestones](https://shapez2.wiki.gg/wiki/Milestones),
  [Space Platforms](https://shapez2.wiki.gg/wiki/Space_Platforms),
  [Trains](https://shapez2.wiki.gg/wiki/Trains),
  [Operator Level](https://shapez2.wiki.gg/wiki/Operator_Level),
  [Shop](https://shapez2.wiki.gg/wiki/Shop).
- Satisfactory: parsed 1.0 game data
  ([greeny/SatisfactoryTools](https://github.com/greeny/SatisfactoryTools));
  [Space Elevator](https://satisfactory.wiki.gg/wiki/Space_Elevator),
  [Conveyor Belts](https://satisfactory.wiki.gg/wiki/Conveyor_Belts),
  [Milestones](https://satisfactory.wiki.gg/wiki/Milestones),
  [Power Shard](https://satisfactory.wiki.gg/wiki/Power_Shard),
  [Production line tutorial](https://satisfactory.wiki.gg/wiki/Tutorial:Production_line).
- VR precedents: The Last Clockwinder —
  [Road to VR](https://roadtovr.com/the-last-clockwinder-review-quest-2-steam/),
  [UploadVR](https://www.uploadvr.com/the-last-clockwinder-review/);
  [VRactory](https://sidequestvr.com/app/7500/vractory);
  [Conveyor VR](https://conveyorvr.com/).
- This repo: `README.md`, `DESIGN.md` (pillars, roadmap), `src/*` as
  inventoried above. goopboxing2: `arena/ringLayout.ts`,
  `systems/ArenaSystem.ts` (the ring adjust verb), `README.md`.
