# TUBES — design notes

The pitch in one line: **your room is the machine room — mount a flange,
haul a two-handed tube out of the wall, seat it across the room, and
light pours through.**

RAVE RAID proved a set of crafts worth carrying whole, and TUBES is built
deliberately on that legacy:

1. **The surface language.** The canvas panel kit — quiet near-black
   glass, white-alpha hairlines, ONE accent that only marks what matters,
   eased hovers, a breathing under-halo — moved over intact and swapped
   its magenta for furnace amber. The board had to be the quality of the
   RAVE RAID board; the cheapest way to hit a bar is to bring the bar.
2. **The clipped-liquid trick.** The glowsticks' gel (Alyx-style world-
   space clip plane, bright back-face cut, meniscus band) is re-derived
   here as **the pour**: the clip is an arc-length front racing down the
   run instead of a level surface resting in a glass. Same illusion,
   rotated ninety degrees and given a job.
3. **The sound idiom.** Synthesised WebAudio, no assets: struck plate
   steel, servos, bandpassed steam. RAVE RAID's kit was already tuned to
   an industrial palette — TUBES plays the same instruments slower and
   lets them ring.
4. **The discipline.** Every tunable in one config with its reasoning
   attached; systems that own exactly one thing; a debug hook that makes
   the whole game drivable headlessly; tools that walk the REAL code and
   exit non-zero. The craft is the feature.

## Pillars

- **The room is the venue.** Full passthrough, no dome, no dim slider.
  Everything TUBES draws is bolted to, carried through, or shone into
  the player's actual space — the game never asks the room to pretend.
  The best effect in the game (the shaft) works BECAUSE the stage is
  real: fake sunlight in a fake room is set dressing; fake sunlight in
  your kitchen is a small miracle.
- **Two hands or nothing.** The tube is plant, not a prop. One hand
  rattles it (the whole tutorial, no words); two hands haul it; the lag
  in the follow spring is the weight. Every number in the pull exists to
  make "big heavy industrial thing" true in the wrists.
- **Doorways, not keyholes.** Aim anywhere near a wall and the reticle
  clamps somewhere legal. Arrive anywhere near the socket, roughly
  square, and the magnet does the last metre. Let go anywhere and the
  tube parks. The game's precision demands are all theatre — the
  forgiveness is engineered, invisible, and total. Nobody fails a
  pipefitting fantasy on a five-degree alignment check.
- **The payoff is light arriving.** Everything funnels into the pour:
  the charge (one held breath), the front (racing, hot-banded), the
  arrival (chord, bloom, shaft, hum). Satisfaction is the win condition;
  the timer is garnish for people who like garnish.
- **Theatre in fixed beats.** Mount → knock → iris → pull is the same
  shape every time, short enough to never wait through grudgingly. The
  wake is the room ANSWERING — the fiction (THE WORKS is already in
  your walls) does the worldbuilding a cutscene would have begged for.

## The room model

The scan (WebXR plane detection, requested optional so a refusal still
plays) becomes a **wall registry**: centre, into-the-room normal (decided
by which side the player is on), right/up tangents, half-extents. One
system owns the fold (WallSystem); everything else reads the registry and
never touches a raw XRPlane.

- **The mount band.** Hardware lives away from wall edges (0.3 m inset)
  and between 0.7 m and 2.05 m of height — where hands actually work.
  All placement maths clamps into the band rather than rejecting.
- **The registry holds every mountable surface.** Vertical planes are
  walls; the scan's floor and ceiling join them with a `kind`, and
  labelled furniture (tables, desks, couches) is filtered out on
  principle. Flanges mount on walls only — the half of the run you were
  taught stays where you were taught it — but the room's answer can
  come from any kind.
- **The socket picker** is a pure seeded function in two lanes: sample
  candidate spots across every other usable surface, keep those whose
  straight run fits [1.15 m, 6.4 m], require the spot to be in FRONT of
  the flange's face, AND require the chord to arrive inside the seat's
  own alignment cone with margin — **every pick the room makes is a
  pick the magnet can take, by construction**, which also means flat
  ports are always short and steep (the cone caps them by geometry: a
  ceiling port is always an arm's reach up, never a room away). A
  seeded roll (PORTS.flatChance) sometimes tries the overhead lane
  first — a lane, not a score bias, because on a distance-flavoured
  score a short flat spot never outbids a wall, and "sometimes the
  ceiling answers" has to actually happen. Within a lane: long-haul
  jobs weight distance, ordinary jobs the middle of the range, best
  wins with seeded jitter. Same seed, same layout: the headless walk
  replays exactly. A floor port never wakes under the player's feet.
- **The fallback room** (4.6 × 3.6 × 2.7 m around the player, aligned to
  their facing) stands in when no scan answers within the grace. It's
  drawn only as hairline frames, only while a flange wants placing — you
  cannot aim at plaster you cannot see — and the board's status chip
  always says which room you're in. Real planes arriving later evict the
  stand-ins, but never mid-shift: mounted hardware keeps its walls.

## The tube

Modelled as a **cubic bezier** (mouth → out along the mount wall's
normal → back along the head's entry direction → head) carrying **eight
nested rigid sections, root fattest, filling root-first**: section i
shows `clamp(ext − i·segMax, 0, segMax)` of itself. Pull, and the fat
section comes out until it hits its stop, then the next thinner one
emerges from inside it — the classic telescope, which makes each
section's arrival an EVENT (a deeper clank, a harder buzz) on top of the
fine ratchet detents every 0.34 m.

The pull's five rules (each one line of feel, all in TubeSystem's
header): two hands or nothing, and then it's yours · the lag is the
weight and the wrists are the rudder · the ratchet tells the truth ·
parked is a real state · the socket does the last metre. "Then it's
yours" is load-bearing: acquisition tests reach + squeeze, but a HELD
collar re-tests only the squeeze (analog, soft floor) — the head lags
the hands on purpose, and measuring your grip against your own weight
illusion is how a fast haul once dropped itself. The follow is a single exponential
spring whose rate falls with extension; THE STEER blends the two
controllers' pointing direction into the head's travel
(TUBE.steerBlend) and stretches the end control while it's live, so
tipping both hands visibly bows the run — the curve answers your
wrists, not just your feet; the park is one underdamped droop spring;
the stops creak. No physics engine — RAVE RAID's club glasses proved
five cheap tricks read as one expensive one, and the tube runs on the
same economy.

**The seat.** Inside 0.32 m and within ~70° of square, the magnet takes:
the head eases onto the seat pose while the path's end control swings to
the socket's normal — so the tube visibly SWEEPS IN and meets the far
wall perpendicular, the way pipework does and rope doesn't. Latch dogs,
line-flavoured exhale (steam / hydraulic sigh / arc-snap), iris opens,
and the run locks. Hands come away clean; a seated run is DONE and can't
be un-seated — TUBES has no failure states, only unfinished jobs.

## The pour

One shader (materials/flow.ts), cloned per section, all sections of a
run sharing front/time/energy:

- **Charge** (0.55 s): energy ramps the dormant volume from near-black
  to lit — the line visibly wakes before anything moves.
- **The front**: an arc-length clip with a wobbled face (a surge, not a
  bulkhead), back-faces painted as the bright cut, a hot foam band
  burning behind it, racing at the line's speed (MAINS 2.3 m/s heavy,
  COOLANT 4.2 fast, VOLT 5.4 in packets).
- **One column, no cells**: two laws together. THE POLYLINE LAW —
  every piece (shell and pour alike) spans the straight line between
  its two points ON the curve, so consecutive sections share their
  joint point exactly and the run cannot open a gap at any bend the
  steer, the droop or the seat can ask for (pieces sized by arc length
  and centred on the curve used to fall short of each other, because a
  bent curve is longer than the chord between its ends — the walk now
  measures the worst joint off the scene's own transforms and holds it
  at zero). And THE TUCK — each section's pour volume runs back through
  its own joint into the fatter section behind it (the root into the
  flange's gland), uniforms carrying the stretched span so the front's
  clip stays world-true through the overlap, with the joint rings cut
  slimmer than the collar stock so the bands sit over lit liquid. The
  column steps down in bore at every joint, exactly what a telescope
  full of liquid would do; it never breaks.
- **Alive**: two travelling body waves plus the line's pulse — MAINS
  rolls (0.5 Hz), COOLANT streams (0.9), VOLT strobes (2.2 with `chop`
  squaring the wave into plasma packets with dark water between). Wet
  gloss (two Blinn-Phong lobes) and a fresnel skin keep the volume
  reading as a lit liquid cylinder, not flat neon.
- **Arrival**: the line's chord (warm third / bright fifth / electric
  octave over one shared boom), a 90-glint bloom off the socket mouth
  (population-sized sparkle — dust, grains, hero catches — that dies in
  the air, never litter), the hum fading in (per-line patch, detuned per
  run so two MAINS never phase-lock), and THE SHAFT: a ramped additive
  cone firing straight out of the socket's mouth, 46 motes drifting in
  it. Centred on every surface — level from a wall, rising from the
  floor, pouring from the ceiling; an early draft leaned every shaft
  downward for "sunlight" and it read as droop from anywhere but the
  floor. The sun flavour lives in the ramp and the motes, not a sag.

## Hardware that reads from everywhere

A socket's throat is an OPEN cylinder — it is a bore, you look into it —
and open geometry is where one-sided materials betray you: FrontSide
draws only the wall facing the camera, so the far wall's inner surface
is culled and the mouth reads as HALF a rim, with the visible half
following the viewer round the room. Invisible from any one viewpoint,
obvious the moment you walk past. Two rules came out of it, and both are
cheap:

1. **Open geometry renders both sides.** The throat wears its own
   two-sided material (`plateOpen`). The tube's shells stay one-sided on
   purpose — they are transparent and filled with an opaque pour, so
   their far wall is hidden anyway, and two-sided transparency would
   only buy self-sorting artefacts.
2. **Silhouettes are closed shapes.** The socket's rim is a torus, so
   the outline that says "socket" is whole by construction and can never
   depend on where you're standing. `tools/socket-look.mjs` orbits one
   and shoots 14 angles, because this class of defect is only ever
   visible in motion.

## The lines

Identity is carried three free ways — silhouette (plate sides: 8 / 24 /
6), surface (rough iron / brushed alloy / dark glass), light (amber /
cyan / violet) — plus pour behaviour and voice. Nobody counts bolts in
passthrough; everybody reads a hex plate as industrial from across the
room. A socket only takes its own line, which is the whole matching rule
and all the puzzle the ladder needs to teach.

## The jobs

Five sheets, no difficulty settings — the ladder IS the difficulty:

1. **FIRST LIGHT** — one MAINS run. The verbs, taught by doing.
2. **CROSSTOWN** — one run, long-hauled: the picker weights the farthest
   honest wall, so the tube must cross the room and the park (letting
   go halfway) earns its keep.
3. **TWO-HANDER** — MAINS then COOLANT: lines exist, sockets are typed.
4. **HOT AND COLD** — both, long-hauled: two runs wanting the same air;
   you route around your own standing work.
5. **FULL PRESSURE** — all three. The last seat triggers the ceremony:
   every pour surges, the chord spreads seven notes, and the board comes
   back with the sheet stamped.

Runs are sequential (place → pull → pour, then the next flange), which
keeps the loop tight and the teaching honest. Best time per job on the
sheet; a rerun rolls a fresh seed, so the room deals new walls.

## The board

RAVE RAID's live-service lobby discipline, sized to a shop: one rail
(JOBS / SYSTEM), one content region, THE sheet on the right with the one
primary CTA. AR-specific: the board RE-PLANTS in front of wherever the
player is standing every time it returns — in passthrough the menu comes
to the room, not the room to the menu. Mid-shift it's gone entirely;
right Ⓐ raises THE JOB CARD (live run states, the clock, BACK TO IT /
DOWN TOOLS). The card pauses the HANDS but never the MACHINE — a pour
mid-race keeps racing — because the fiction doesn't know you stopped,
and the fiction is the boss here.

## Honest limits

- **No occlusion.** Without depth sensing, a tube crossing your sofa
  draws over the sofa. Passthrough players forgive this faster than any
  fix we could afford; depth-gated rendering is on the roadmap, not in
  the build.
- **Controllers only.** The two-hand grab reads grip squeezes; tracked
  hands need a pinch-strength grammar that deserves its own pass.
- **The scan is trusted, not audited.** A wall the scan missed doesn't
  exist; furniture is invisible to the picker (a run can cross your
  bookcase), and horizontal furniture is deliberately REFUSED as a port
  surface — floor and ceiling only, because the machine lives in the
  room's bones. The mount band keeps the worst of it away from
  skirting.
- **Solo.** There is no wire. The seeded-layout discipline is already
  multiplayer-shaped (a shared seed deals both players the same walls
  only if they share a room scan, which is exactly the co-location
  problem), so the door is cut, not opened.

## Roadmap

- **Hands.** Pinch-to-grab with per-hand strength, so the two-hand rule
  survives controllerless play.
- **The fuller puzzle.** Multiple lines live at once with shared
  sockets — choose which service goes where; junction pieces (a Y that
  splits a run, a valve that gates one); runs that must cross without
  touching. The typed-socket rule scales to all of it.
- **Persistent plant.** WebXR persistent anchors (the SDK already
  restores them) so a finished job's hardware is still on your walls
  tomorrow — the room slowly becoming THE WORKS between sessions is the
  long game.
- **Depth occlusion** where the device offers it, so the sofa wins.
- **Co-located co-op.** Two fitters, one room, one tube — one on each
  end of a run that takes four hands. The relay would carry poses and
  seeds only, RAVE RAID style.
- **More services.** STEAM (billowing, scalding, and now that the
  ceiling takes ports, it would live up there on principle), DATA
  (glass fibre, light packets, wants corners). Each must earn a
  distinct pour, voice and metal or it doesn't ship.
