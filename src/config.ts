/**
 * TUBES — every number the feel depends on.
 *
 * The game: a passthrough-AR pipefitting toy-puzzle played against the real
 * walls of your real room. Behind those walls (the fiction goes) sleeps an
 * old machine — THE WORKS — and you are the fitter bringing it back online.
 * A job hands you a run: you MOUNT a flange on a wall of your choosing, the
 * room answers by waking a socket somewhere on ANOTHER wall, and between
 * them goes a tube — a big industrial telescoping thing that takes both
 * hands. Grab the collar, haul it out of the wall click by click, walk it
 * across your actual floor, and offer it up to the socket until the magnet
 * takes it and the latch dogs slam home. Then the payoff: liquid light
 * pours through the run, the socket blooms, and a shaft of sun leans into
 * your room out of a wall that never had a window.
 *
 * Jobs start at one run and grow to three, keyed by LINE type — MAINS,
 * COOLANT, VOLT — each with its own metalwork, its own light and its own
 * voice. A socket only takes its own line. That is the whole puzzle, and
 * it is enough: the game is the pull, the seat, and the pour.
 *
 * Dimensions are metres. Times are seconds. Colours are the line's.
 */

export const GAME_TITLE = 'TUBES';

/* ────────────────────────────── THE WALLS ────────────────────────────────
 * Quest's room scan (WebXR plane detection) hands us the real walls as
 * planes. WallSystem folds them into a registry the whole game reads:
 * centre, normal (into the room), tangent basis and extents per wall.
 * Where no scan exists — desktop emulator, a headset that skipped room
 * setup — a synthetic fallback room stands in after a grace period, so the
 * game is always playable and the tools can always drive it.
 */
export const WALLS = {
  /** A wall must offer at least this much face (m²) to host hardware. */
  minArea: 1.1,
  /** Nothing mounts within this margin of a wall's edges. */
  edgeInset: 0.3,
  /** Mounting band: hardware lives where hands can work it. */
  minHeight: 0.7,
  maxHeight: 2.05,
  /** How long we wait for real planes after the session starts before the
   *  fallback room stands in. The scan usually answers inside a second;
   *  the grace keeps a slow first frame from building phantom walls. */
  fallbackGraceS: 3,
  /** The fallback room, centred on the player, aligned to their facing:
   *  a comfortable flat footprint (w × d, height h). */
  fallback: { w: 4.6, d: 3.6, h: 2.7 },
  /** Faint edge hint drawn on fallback walls (real walls need none — the
   *  player can SEE those). Opacity of the hairline frame. */
  hintOpacity: 0.22,
};

/* ────────────────────────────── THE TUBE ─────────────────────────────────
 * One run = flange (wall A) → telescoping tube → socket (wall B). The tube
 * is rigid plant hardware, not rope: it exits the flange along the wall's
 * normal, carries a gentle industrial flex on its way to your hands, and
 * telescopes in SEGMENTS that emerge one by one as you pull — each arrival
 * a click you can hear and feel. The segment count is fixed; the tube gets
 * longer by each segment sliding out of the one behind it.
 */
export const TUBE = {
  /** Telescoping segments (root → head). Eight reads unmistakably as
   *  plant pipework and keeps the whole run cheap to pose. */
  segments: 8,
  /** Radius of the fattest (root) segment, and of the slimmest (head).
   *  BIG on purpose: this is two-hands hardware, not a hose. */
  rootRadius: 0.088,
  headRadius: 0.058,
  /** How much tube sticks out of a freshly mounted flange — the stub you
   *  grab. Enough to read as "handle", not enough to poke anyone. */
  stubLength: 0.42,
  /** Max extension = run distance + this much slack, so a seated tube
   *  always had headroom and a wild pull can overshoot the socket a bit
   *  without hitting the stops the moment it lines up. */
  slack: 1.2,
  /** Hard ceiling on any run (fallback rooms are ~4.6 m corner to corner;
   *  real scans can be bigger, and a 7 m tube is still a good time). */
  maxLength: 7,
  /** THE PULL. The head chases the two-hand midpoint through a critically
   *  damped spring — the lag is the WEIGHT. Stiffness falls as the tube
   *  gets longer (more metal in your hands), which reads as mass without
   *  any physics engine. */
  followStiffness: 14,
  followStiffnessFar: 7.5,
  /** Both hands must be inside this reach of the collar to TAKE it.
   *  Generous: the fantasy is hauling plant, not threading a needle.
   *  Acquisition only — a held collar never re-tests reach (the head
   *  deliberately LAGS the hands; measuring your grip against your own
   *  weight illusion is how a fast haul used to drop itself). */
  grabReach: 0.3,
  /** Once held, the grab persists while both squeezes stay above this
   *  (analog, with the press as fallback) — a jostled grip mid-swing
   *  dips, it doesn't open. The only way to drop plant is to let go. */
  holdSqueeze: 0.3,
  /** BREAKING A SEAL. A seated tube is not welded to the box: take the
   *  collar in both hands and HAUL, and the gland lets go. Sheet 2 wants
   *  the amber line moved off the bank and onto the maker, and the only
   *  way out used to be deleting the bank — a fitter would just pull it.
   *
   *  It has to cost something, though, or a hand brushing past would
   *  unplumb a running factory. So it takes a real tug: both hands, and
   *  the collar dragged this far off the gland, held for `unseatHoldS`
   *  while the joint audibly strains. Let go early and it re-seats. */
  unseatPull: 0.26,
  unseatHoldS: 0.45,
  /** One hand alone can't haul it — but it can RATTLE it. The shake
   *  amplitude and the cooldown between rattle clanks. */
  rattleAmp: 0.012,
  rattleCooldownS: 0.4,
  /** A detent clicks every time this much tube emerges (or returns). The
   *  ratchet is most of what "it extends!" feels like in the hands. */
  detentPitch: 0.34,
  /** Released mid-carry, the free end DROOPS — a damped settle onto a
   *  slight sag, held by the wall. Sag per metre of extension, capped. */
  droopPerMetre: 0.055,
  droopMax: 0.2,
  droopSettleS: 0.7,
  /** The root flex: the tube leaves the wall along its normal and bows
   *  toward your hands. Control-point reach as a fraction of extension —
   *  small numbers keep it reading as heavy pipe, not garden hose. */
  bendReach: 0.32,
  bendReachMax: 0.85,
  /** THE STEER. Held with both hands, the collar AIMS: the controllers'
   *  pointing direction blends into the head's travel, so tipping your
   *  wrists bows the run where you're looking instead of only where
   *  you're standing. 0 = the old straight chord, 1 = pure wrist. */
  steerBlend: 0.6,
  /** The end control reaches further while you're steering, so the bow
   *  you're asking for is a bow you can see. */
  steerReach: 1.2,
  /** How far each section's pour volume tucks back through its joint
   *  into the fatter section behind it. This is what makes the column
   *  read as ONE pour stepping down in bore, not eight lit cells: the
   *  overlap swallows the seam, the bend wedge, and the collar's shadow
   *  in a single move. */
  pourOverlap: 0.1,
};

/* ────────────────────────────── THE SEAT ─────────────────────────────────
 * The socket answers a tube that comes CLOSE ENOUGH, POINTED ROUGHLY IN.
 * Inside the window the guide brightens and a magnet takes over — the head
 * eases onto the seat pose, the hands feel the pull-in, and the moment it
 * bottoms the latch dogs slam. Forgiveness is the design: every number
 * here is a doorway, not a keyhole.
 */
export const SEAT = {
  /** The magnet's catch radius around the socket mouth. */
  snapRadius: 0.32,
  /** How square the tube must arrive: dot(tube direction, into-socket).
   *  0.35 ≈ within ~70° — offer it up ANYWHERE near square and the
   *  socket does the last of the aiming for you. */
  alignDot: 0.35,
  /** The magnet's ease-in time once it takes. */
  magnetS: 0.16,
  /** Seat travel: the last shove, eased over this long, then the dogs. */
  seatS: 0.24,
  /** A seated head is DONE — the run locks, hands come away clean. */
};

/* ────────────────────────────── THE WAKE ─────────────────────────────────
 * The beat between mounting a flange and the room answering. Fixed
 * theatre, always the same shape: the bolts bite, something KNOCKS from
 * inside another wall, and the socket irises awake where the knock came
 * from. Short enough to never wait through twice grudgingly.
 */
export const WAKE = {
  /** Knock-knock from behind the chosen wall (s after mount). */
  knockAt: 0.35,
  /** The socket stamps itself and irises open. */
  socketAt: 1.0,
  /** The run hands over to the pull. */
  doneAt: 1.55,
};

/* ────────────────────────────── THE FLOW ─────────────────────────────────
 * The payoff. On latch, the line charges for a breath, then the front
 * races the run from flange to socket and the tube is ALIVE — a living
 * pour riding inside frosted metal, pulsing at the line's own pace. At
 * the far end: the bloom, the shaft of light into the room, and the hum
 * settling in for good.
 */
export const FLOW = {
  /** The held breath between latch and pour. Anticipation is cheap. */
  chargeS: 0.55,
  /** The advancing front's hot band length (m). */
  frontBand: 0.55,
  /** The arrival bloom: glint burst count and its life. */
  bloomCount: 90,
  bloomLifeS: 1.6,
  /** The sun shaft leaning out of a connected socket: length and radius
   *  at the wide end. Passthrough loves a light that isn't there. */
  shaftLength: 1.9,
  shaftRadius: 0.5,
  /** Dust motes drifting in the shaft — the part that sells "sunlight". */
  moteCount: 46,
};

/* ────────────────────────────── THE LINES ────────────────────────────────
 * Three services run through THE WORKS, and every piece of hardware wears
 * its line head to toe — metalwork, light, pour and voice. A socket only
 * takes its own line; the collar's colour tells you which wall it wants.
 *
 *  MAINS   — the old plant. Cast iron, hex bolts, furnace-amber glow.
 *            The pour is slow and heavy; the hum is a boiler two rooms
 *            over; the seat is a steam hiss off hot metal.
 *  COOLANT — the retrofit. Brushed alloy, sleek rings, glacier cyan.
 *            Fast bright pour, airy hum, hydraulic sighs.
 *  VOLT    — the future bolted onto both. Dark glass, coil rings,
 *            violet plasma that travels in pulses and BITES when it
 *            lands. Crackle, arc, zap.
 */
export interface LineSpec {
  id: 'mains' | 'coolant' | 'volt';
  name: string;
  /** UI + text accents. */
  hex: string;
  /** The pour: lit body, shadowed depths, hot front/meniscus. */
  glow: number;
  deep: number;
  foam: number;
  /** Metalwork: shell tint, roughness, metalness — the vibe in PBR. */
  shell: number;
  roughness: number;
  metalness: number;
  /** Pour speed (m/s) and the living pulse once connected (Hz). */
  flowSpeed: number;
  pulseHz: number;
  /** VOLT's strobing front: 0 = smooth liquid, 1 = full plasma chop. */
  chop: number;
}

export const LINES: Record<'mains' | 'coolant' | 'volt', LineSpec> = {
  mains: {
    id: 'mains',
    name: 'MAINS',
    hex: '#ffa22e',
    glow: 0xffa22e,
    deep: 0x571f02,
    foam: 0xffe9c4,
    shell: 0x4a4038,
    roughness: 0.52,
    metalness: 0.82,
    flowSpeed: 2.3,
    pulseHz: 0.5,
    chop: 0,
  },
  coolant: {
    id: 'coolant',
    name: 'COOLANT',
    hex: '#46e0ff',
    glow: 0x46e0ff,
    deep: 0x043346,
    foam: 0xdcf8ff,
    shell: 0x5a6670,
    roughness: 0.28,
    metalness: 0.9,
    flowSpeed: 4.2,
    pulseHz: 0.9,
    chop: 0,
  },
  volt: {
    id: 'volt',
    name: 'VOLT',
    hex: '#b46bff',
    glow: 0xb46bff,
    deep: 0x2a0b4e,
    foam: 0xefe0ff,
    shell: 0x2d2a38,
    roughness: 0.38,
    metalness: 0.72,
    flowSpeed: 5.4,
    pulseHz: 2.2,
    chop: 0.85,
  },
};

/* ────────────────────────────── THE JOBS ─────────────────────────────────
 * The shift sheet: five authored jobs, one honest difficulty. The ladder
 * teaches by doing — one run, then a longer one, then two lines at once,
 * then two lines that want to cross your room, then all three services
 * and the room celebrates. Nothing here is random except WHERE the room
 * puts the hardware; what you owe each job never changes.
 *
 *  runs      — the lines this job wants connected, in the order their
 *              flange holograms are handed to you.
 *  longHaul  — bias the socket toward the farthest legal wall, so the
 *              run has to cross the room instead of hugging a corner.
 */
export interface JobSpec {
  id: string;
  name: string;
  brief: string;
  runs: Array<'mains' | 'coolant' | 'volt'>;
  longHaul?: boolean;
}

export const JOBS: JobSpec[] = [
  {
    id: 'first-light',
    name: 'FIRST LIGHT',
    brief: 'One run on the MAINS. Mount the flange, haul the tube, seat it. The machine does the rest.',
    runs: ['mains'],
  },
  {
    id: 'crosstown',
    name: 'CROSSTOWN',
    brief: 'The MAINS again — but the socket wakes across the room. Walk it over. Mind the sofa.',
    runs: ['mains'],
    longHaul: true,
  },
  {
    id: 'two-hander',
    name: 'TWO-HANDER',
    brief: 'MAINS and COOLANT, one after the other. A socket only takes its own line — the collar tells you whose.',
    runs: ['mains', 'coolant'],
  },
  {
    id: 'hot-and-cold',
    name: 'HOT AND COLD',
    brief: 'Both services, long-hauled. The runs will want the same air. Route around your own work.',
    runs: ['coolant', 'mains'],
    longHaul: true,
  },
  {
    id: 'full-pressure',
    name: 'FULL PRESSURE',
    brief: 'MAINS, COOLANT, VOLT. Every line at once. Seat the last one and see what the room does.',
    runs: ['mains', 'coolant', 'volt'],
    longHaul: true,
  },
];

/** Target placement: how far a socket may wake from its flange. */
export const RUN_RANGE = {
  min: 1.15,
  max: 6.4,
};

/* ────────────────────────────── THE PORTS ────────────────────────────────
 * Exit ports don't only live on walls: the scan's floor and ceiling are
 * registry citizens too, and sometimes the room answers from one — a
 * socket irising awake OVER your head, or under your feet. Flanges stay
 * wall-mounted (the thing YOU place is the thing you were taught); it's
 * the room's half of the run that gets adventurous.
 */
export const PORTS = {
  /** The seeded roll: this often, the picker TRIES overhead/underfoot
   *  first and takes the best legal flat spot it finds — its own lane,
   *  because on a distance-flavoured score a flat can never outbid a
   *  wall (the seat's alignment cone caps flat runs SHORT by geometry,
   *  which is also why a ceiling answer feels like an event: it's
   *  always close, always steep, always a reach). No legal flat spot —
   *  a mount too high for the ceiling's cone, a floor swallowed by the
   *  avoid circle — and the walls answer as ever. */
  flatChance: 0.3,
  /** Candidate samples per horizontal surface (walls get 14). */
  horizontalSamples: 10,
  /** A floor port never wakes under the player's feet. */
  floorAvoidRadius: 0.9,
};

/* ────────────────────────────── THE FLOOR ────────────────────────────────
 * PIECEWORK groundwork (FACTORY.md, phase 0). Before the shop can stand,
 * you mark out the floor: a rectangle of HAZARD TAPE strung post to post
 * on your real floor, each side draggable to your real walls — SLUGFEST's
 * ring verb wearing site clothing. Reach toward a side, hold the trigger,
 * slide it along its own normal; one side at a time; clamps keep the
 * floor a floor; the layout saves per headset.
 */
export const FLOOR = {
  /** The floor stays workable: sides can't close inside this. */
  minWidth: 1.8,
  minDepth: 1.8,
  /** Hard cap on any side's coordinate — even a warehouse scan doesn't
   *  get a tape run the pull can't service. */
  maxSide: 7,
  /** Default sides stand this far inside the registry's walls. */
  inset: 0.25,
  /** Dragging a side inside this reach of a parallel wall SNAPS it… */
  snapDist: 0.2,
  /** …to just off the plaster (tape touches walls in no workshop). */
  snapGap: 0.04,
  /** How close a hand must be to a side to take it. */
  grabReach: 0.65,
  /** Sides refuse to cross standing plant by this margin — re-planning
   *  the floor can never orphan a crate outside the boundary. */
  plantPad: 0.15,
  /** The tape itself: barricade height and band width. */
  tapeHeight: 0.72,
  tapeWidth: 0.07,
  /** One amber+black stripe cycle per this many metres of tape. */
  stripePeriod: 0.24,
  /** Corner posts stand at bench height — the shop's one datum. */
  postHeight: 0.85,
  /** No walls yet (grace still counting) — a starter floor this big
   *  stands around the player, ready to drag out. */
  fallback: { w: 3.6, d: 2.8 },
  /** The build lattice: world-anchored cells this wide. Anchored to the
   *  WORLD, not the rectangle, so dragging a side never re-deals the
   *  cells under standing plant. */
  cell: 0.35,
};

/* ────────────────────────────── THE UNITS ────────────────────────────────
 * The shop's plant, one grid cell each, and ALL of it bench height on
 * principle: a room-scale factory on the actual floor is a crouching
 * simulator, so the whole shop lives in the mount band. The CRATE from
 * phase 0 grew up into the CHEST; the rest arrived with the orders.
 */
export const UNITS = {
  crate: {
    /** Footprint (m) — sits inside one grid cell with clearance. */
    size: 0.3,
    /** The box itself; its top lands on the bench datum. */
    height: 0.3,
    benchTop: 0.85,
    legRadius: 0.018,
  },
  /** Rails ride a touch under the bench so parts sit AT the datum. */
  railTop: 0.8,
  /** THE PULL. A rail is not stamped a cell at a time — you stand one
   *  and HAUL, and the run ratchets out of it exactly like a tube comes
   *  out of a wall. These are the stops on that haul. */
  pull: {
    /** How many rails one haul may lay. Long enough to cross the floor,
     *  short enough that a sweep of the arm can't carpet it. */
    maxRun: 14,
    /** A POST is a stick you stand to say "go through here". A haul
     *  visits every post between where it started and where you are
     *  pointing, in order, instead of taking the direct line — and the
     *  rail takes the post's place as it passes. Bought once (SUPPLY),
     *  then free to plant, like every other piece. */
    postRadius: 0.016,
    postHeight: 0.62,
    /** How far off the direct line a stick may sit and still catch the
     *  haul, in cells. It HAS to be more than zero: the whole point of a
     *  stick is bending a lane off the straight, and a straight drag's
     *  bounding box is a line with no width — nothing could ever be
     *  inside it. Two cells is forgiving enough to plant a stick where
     *  you want the bow, tight enough that one across the room doesn't
     *  come and hijack a lane you were laying somewhere else. */
    postReach: 2,
  },
  /** Where a unit's tube gland sits (m up its back face). */
  glandHeight: 0.7,
};

/* ────────────────────────────── THE FACTORY ──────────────────────────────
 * PIECEWORK phases 1–2 (FACTORY.md): the feeds, the sim, the orders.
 * Rates follow the tuning law — a naive single chain finishes a sheet in
 * minutes, a parallel floor in under one; waiting is legal, building is
 * better.
 */
export const FACTORY = {
  /** After a line is hauled off a gland, that gland ignores it for this
   *  long — the head is right beside the box you just freed it from, so
   *  without a pause the magnet undoes the tug before you can step away. */
  spurnS: 2.5,
  /** Which line each side's FEED carries. `near` holds PEARL — a fourth
   *  manifold kept visibly in reserve (the expansion hook; it never
   *  wakes in these sheets). */
  sides: {
    far: 'mains',
    left: 'coolant',
    right: 'volt',
    near: null,
  } as Record<'far' | 'left' | 'right' | 'near', 'mains' | 'coolant' | 'volt' | null>,
  /** The spout: where the stub waits on the pillar (m up), and the
   *  supply rate a seated run pours at (units/s — one maker's appetite
   *  with a little headroom, which is the whole throttle design). */
  spoutHeight: 1.05,
  fluidRate: 0.8,
  /** Craft times. Makers drink and stamp; combiners fit two parts. */
  makerS: 4,
  combinerS: 6,
  /** Rails: part speed along a chain, and a chute's queue depth. */
  railSpeed: 0.35,
  chuteSlots: 2,
  chestCap: 12,
  /** An unbolted supply run telescopes home over this long. */
  retractS: 0.5,
  /** The gland's catch radius. Wider than a wall socket's (SEAT.snapRadius)
   *  because a bench gland is a SWIVEL — it turns to meet the tube — so
   *  the only thing left to ask of the player is "get it near", and we
   *  ask that generously. */
  seatRadius: 0.42,
  /** Hand-carry: how close a grip must be to take a loose part, and how
   *  close a drop must be to a hopper/port/chest to land IN it. */
  partReach: 0.35,
  dropReach: 0.4,
};

/* ────────────────────────────── THE ITEMS ────────────────────────────────
 * Colour → part, part + part → deeper part. Every item wears its
 * lineage's plate language (eight-sided iron / smooth alloy / hex glass),
 * so a composite part visibly CONTAINS its ingredients and a target on
 * the sheet is reverse-engineerable by looking at it.
 */
export type ItemId = 'gear' | 'cell' | 'chip' | 'pump' | 'lamp' | 'servo';

export interface ItemSpec {
  id: ItemId;
  name: string;
  tier: 1 | 2;
  /** The lines whose look this part carries (first = the body). */
  lineage: Array<'mains' | 'coolant' | 'volt'>;
  /** THE DOCKET — what the works DOES with it. One line, on the sheet:
   *  every part is FOR something behind your walls, and the fiction
   *  says so out loud. */
  docket: string;
}

export const ITEMS: Record<ItemId, ItemSpec> = {
  gear: {
    id: 'gear',
    name: 'GEAR',
    tier: 1,
    lineage: ['mains'],
    docket: 're-tooths the old drives sleeping behind your walls',
  },
  cell: {
    id: 'cell',
    name: 'CELL',
    tier: 1,
    lineage: ['coolant'],
    docket: 'holds a charge of coolant light for the dark stretches',
  },
  chip: {
    id: 'chip',
    name: 'CHIP',
    tier: 1,
    lineage: ['volt'],
    docket: 'thinks for valves that forgot their timings',
  },
  pump: {
    id: 'pump',
    name: 'PUMP',
    tier: 2,
    lineage: ['mains', 'coolant'],
    docket: 'puts pressure back where the mains ran to silt',
  },
  lamp: {
    id: 'lamp',
    name: 'LAMP',
    tier: 2,
    lineage: ['coolant', 'volt'],
    docket: 'a room behind the plaster gets its morning back',
  },
  servo: {
    id: 'servo',
    name: 'SERVO',
    tier: 2,
    lineage: ['mains', 'volt'],
    docket: 'an old arm on the far side learns its reach again',
  },
};

/** The maker's law: feed it a colour, get the colour's base part. */
export const MAKES: Record<'mains' | 'coolant' | 'volt', ItemId> = {
  mains: 'gear',
  coolant: 'cell',
  volt: 'chip',
};

/** The combiner's law: two DIFFERENT tier-1 parts, alphabetical key. */
export const COMBINES: Record<string, ItemId> = {
  'cell+gear': 'pump',
  'cell+chip': 'lamp',
  'chip+gear': 'servo',
};

export function combineKey(a: ItemId, b: ItemId): string {
  return [a, b].sort().join('+');
}

/* ─────────────────────────────── THE BILLS ───────────────────────────────
 * What the bank is FOR (FACTORY.md, the economy): upgrades are BILLS OF
 * BANKED PARTS, exactly like milestones — no abstract currency, ever.
 * Overproducing a SPECIFIC item is a decision, and old lines stay alive
 * because their product stays spendable. Bought fittings persist with
 * the trade (localStorage) and apply the moment the bill is paid.
 * (The SECOND SPOUT — the big physical one, with its colour dial — is
 * the next fitting on this list.)
 */
export type UpgradeId =
  | 'long-reach'
  | 'belt-pace'
  | 'quick-boxes'
  | 'deep-crates'
  | 'route-posts';

export interface UpgradeSpec {
  id: UpgradeId;
  name: string;
  /** What it does, in the card's one line. */
  effect: string;
  bill: Partial<Record<ItemId, number>>;
}

export const UPGRADES: UpgradeSpec[] = [
  {
    id: 'long-reach',
    name: 'LONG REACH',
    effect: 'supply tubes stretch two metres further',
    bill: { gear: 4 },
  },
  {
    id: 'belt-pace',
    name: 'BELT PACE',
    effect: 'rails run a quarter faster',
    bill: { gear: 8, cell: 6 },
  },
  {
    id: 'quick-boxes',
    name: 'QUICK BOXES',
    effect: 'makers and combiners craft a quarter faster',
    bill: { cell: 8, pump: 4 },
  },
  {
    id: 'deep-crates',
    name: 'DEEP CRATES',
    effect: 'chests hold twice the parts',
    bill: { chip: 6, lamp: 4 },
  },
  {
    // The one fitting that changes a VERB rather than a number: a haul
    // goes direct until you give it somewhere to go through.
    id: 'route-posts',
    name: 'ROUTING POSTS',
    effect: 'sticks you plant — a hauled rail bends to visit them',
    // GEAR ONLY, and early. This is the first fitting anyone actually
    // wants — it shapes the very first lane you pull — so it is priced
    // in the part the very first lane makes. A routing aid you cannot
    // afford until the book runs out is a routing aid nobody ever uses.
    bill: { gear: 10 },
  },
];

/* ────────────────────────────── THE ORDERS ───────────────────────────────
 * The work book: deliver 10 × the target, each sheet one verb deeper
 * (the whole research section of FACTORY.md, made config). Completing a
 * sheet posts the next one INTO the same shift — the plant persists,
 * the factory grows; DOWN TOOLS clears the floor. Sheets 6–10 (tees,
 * the bank's bills, the second spout) are the next phase of the book.
 */
export type UnitType = 'dock' | 'maker' | 'belt' | 'combiner' | 'chest' | 'post';

export interface OrderSpec {
  id: string;
  name: string;
  brief: string;
  /** Deliver `goal` of this to the BANK. Fluid targets drink through
   *  the bank's own gland; item targets ride belts or hands. */
  target: { kind: 'fluid'; line: 'mains' | 'coolant' | 'volt' } | { kind: 'item'; item: ItemId };
  goal: number;
  /** The GOALS page's deeper read: what this actually asks of you. */
  steps: string[];
  /** What this sheet switches on the morning it's posted. */
  wakes: { feeds?: Array<'mains' | 'coolant' | 'volt'>; units?: UnitType[] };
}

export const ORDERS: OrderSpec[] = [
  {
    id: 'first-draught',
    name: 'FIRST DRAUGHT',
    brief: 'Stand the BANK, then run a tube from the amber feed into its collar — the collar turns to meet you, so just bring it near. The works pours; the bank drinks ten draughts.',
    steps: [
      'Ⓐ → BUILD → BANK, then trigger on the floor to stand it',
      'Grab the amber feed\u2019s tube with both grips',
      'Carry the head to the bank\u2019s collar until it snaps home',
    ],
    target: { kind: 'fluid', line: 'mains' },
    goal: 10,
    // Everything the first real chain needs, from the first minute —
    // the shop is never a locked room.
    wakes: { feeds: ['mains'], units: ['dock', 'maker', 'belt'] },
  },
  {
    id: 'piece-work',
    name: 'PIECE WORK',
    brief: 'Now make something. A MAKER fed with amber stamps a GEAR every few seconds onto its chute; RAILS carry them to the bank.',
    steps: [
      'Stand a MAKER \u2014 then take the amber collar off the bank in BOTH hands and HAUL until it lets go',
      'Stand a RAIL at the maker\u2019s chute, then HOLD the trigger and pull the run to the bank',
      'Rails point themselves — they turn to feed whatever they touch',
    ],
    target: { kind: 'item', item: 'gear' },
    goal: 10,
    wakes: {},
  },
  {
    id: 'the-line',
    name: 'THE LINE',
    brief: 'The cyan feed wakes. A second maker, a second lane — CELLS this time, and two chains sharing one dock.',
    steps: [
      'Stand a second MAKER near the cyan feed',
      'Run its tube, and rail its chute into the line you already have',
    ],
    target: { kind: 'item', item: 'cell' },
    goal: 10,
    wakes: { feeds: ['coolant'] },
  },
  {
    id: 'first-fitting',
    name: 'FIRST FITTING',
    brief: 'The COMBINER: gears into one side, cells into the other, PUMPS out the front. Two lines becoming one is the whole trade.',
    steps: [
      'Stand a COMBINER where both lines can reach its two sides',
      'Rail the gear line into one side, the cell line into the other',
      'Pull a rail run from its front chute to the bank',
    ],
    target: { kind: 'item', item: 'pump' },
    goal: 10,
    wakes: { units: ['combiner'] },
  },
  {
    id: 'night-shift',
    name: 'NIGHT SHIFT',
    brief: 'Violet wakes. CHIPS meet cells and make LAMPS — and the CHEST arrives to hold what runs ahead of the line.',
    steps: [
      'Haul a maker\u2019s collar off in both hands and re-seat it on the violet line — the same box now stamps CHIPS',
      'Feed chips and cells to the combiner',
      'Stand a CHEST anywhere a line runs ahead of itself',
    ],
    target: { kind: 'item', item: 'lamp' },
    goal: 10,
    wakes: { feeds: ['volt'], units: ['chest'] },
  },
];

/* ────────────────────────────── THE BOARD ────────────────────────────────
 * The menu is a work board: quiet glass, hairlines, one furnace-amber
 * accent that only marks what matters (see ui/panel.ts for the whole
 * discipline). It floats at spawn, hides for the shift, and the right
 * controller's Ⓐ raises the JOB CARD mid-shift the way a fitter checks
 * the sheet — the shift never stops for it.
 */
export const BOARD = {
  widthM: 1.3,
  heightM: 0.86,
  pxW: 1360,
  pxH: 900,
  /** Where the board stands relative to spawn (m, forward is −Z). */
  position: [0, 1.32, -1.35] as [number, number, number],
  /** The shift card (pause) — dead ahead, below the eye line. Sized to
   *  the BOOK, which is the page that needs the most room: the ladder,
   *  or one sheet opened up with its docket and every step. Playtest
   *  found text sitting on other text, and the honest fix was a bigger
   *  card, not smaller type — you read this at a metre, in passthrough.
   *  Kept at 1000 px/m so every font size below is still true. */
  cardW: 0.68,
  cardH: 0.64,
  cardPx: [680, 640] as [number, number],
  cardPosition: [0, 1.24, -1.0] as [number, number, number],
};

/** The celebration when a job's last run lands: how long the room gets to
 *  glow before the board comes back with the sheet stamped. */
export const CEREMONY_S = 4.2;
