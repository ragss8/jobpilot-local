/** Floor-wise layout from a written brief.
 *
 *  The frame - a corridor and the staircase core beside it - is solved ONCE
 *  from the buildable rectangle and reused on every level. That is what makes
 *  the flights line up vertically, keeps load-bearing walls stacked, and lets
 *  a walker climb from the stilt to the terrace. Only the subdivision of the
 *  bands either side of the corridor changes per floor.
 *
 *  Every room therefore touches the corridor (circulation) and an outer wall
 *  (ventilation and daylight) by construction rather than by luck.
 *
 *  The core sits mid-way down the west band rather than in the corner: that
 *  still reads as the "West" zone tradition asks of a staircase, while leaving
 *  the south-west corner free for the master bedroom that wants it more. */
import {
  STAIR,
  buildableRect,
  furnish,
  round,
  uid,
  type Floor,
  type Material,
  type Project,
  type Room,
  type RoomType,
} from "./engine";
import {
  applyBrief,
  type Brief,
  type BriefSpaceType,
  type FloorBrief,
  type SpaceRequest,
} from "./brief";
export interface Rect {
  x: number;
  y: number;
  w: number;
  d: number;
}
const CORRIDOR = 3.5,
  BATH_DEPTH = 5.5,
  MIN_BAND = 7.5,
  /** Smallest sensible run along a band for a habitable room, and for the
   *  small service rooms that are allowed to be tighter. */
  MIN_RUN = 9,
  MIN_RUN_SMALL = 5.5,
  SMALL_AREA = 75;
export const SITE_TOO_SMALL =
  "This site is too narrow for a corridor with rooms on both sides. Increase the site or reduce the setbacks.";
/** Comfortable target areas in square feet, before the site is apportioned. */
const AREA: Record<BriefSpaceType, number> = {
  living: 210,
  bedroom: 135,
  master: 170,
  kitchen: 95,
  bathroom: 45,
  pooja: 32,
  dining: 110,
  office: 100,
  theatre: 185,
  parking: 240,
  utility: 55,
  store: 45,
  entrance: 60,
  seating: 170,
  garden: 120,
  balcony: 60,
};
const SMALL: BriefSpaceType[] = [
  "pooja",
  "bathroom",
  "store",
  "utility",
  "balcony",
];
/** Where tradition wants a space: a side of the plan and an end of it.
 *  North is up (small y) and west is left (small x), matching `zone()`. */
const PREFER: Partial<
  Record<BriefSpaceType, { side?: "near" | "far"; end?: "n" | "s" }>
> = {
  pooja: { side: "far", end: "n" },
  living: { side: "far", end: "n" },
  kitchen: { side: "far", end: "s" },
  master: { side: "near", end: "s" },
  bedroom: { side: "near" },
  bathroom: { side: "near", end: "n" },
  utility: { side: "near", end: "n" },
  store: { side: "near", end: "s" },
  theatre: { end: "s" },
  garden: { side: "far", end: "n" },
};
const NAMES: Partial<Record<BriefSpaceType, string>> = {
  living: "Living hall",
  master: "Master bedroom",
  theatre: "Home theatre",
  pooja: "Pooja",
  kitchen: "Kitchen",
  dining: "Dining",
  bathroom: "Bathroom",
  parking: "Parking",
  utility: "Utility",
  store: "Store",
  entrance: "Entrance",
  seating: "Seating deck",
  garden: "Garden",
  balcony: "Balcony",
  office: "Study",
  bedroom: "Bedroom",
};
function material(type: RoomType): Material {
  if (type === "bathroom" || type === "utility") return "tile";
  if (type === "bedroom" || type === "master" || type === "theatre")
    return "wood";
  if (["parking", "terrace", "seating", "garden", "balcony"].includes(type))
    return "terrazzo";
  return "marble";
}
function room(
  type: RoomType,
  name: string,
  r: Rect,
  doorSide: Room["doorSide"],
): Room {
  const out: Room = {
    id: uid(),
    type,
    name,
    x: round(r.x),
    y: round(r.y),
    w: round(r.w),
    d: round(r.d),
    material: material(type),
    furniture: [],
    doorSide,
    doorOffset: 0.5,
    windowOffset: 0.5,
  };
  out.furniture = furnish(out);
  return out;
}
/** The shared vertical frame, solved from the site alone so it is identical
 *  on every floor. The near band is interrupted by the core, leaving a
 *  segment at each end of it. */
export interface Frame {
  rect: Rect;
  corridor: Rect;
  core: Rect;
  nearNorth: Rect;
  nearSouth: Rect;
  far: Rect;
  /** Which way the corridor runs: "v" down the depth, "h" across the width. */
  axis: "v" | "h";
  doors: { near: Room["doorSide"]; far: Room["doorSide"] };
}
export function planFrame(site: Project["site"], variant = 0): Frame {
  const rect = buildableRect(site);
  // A corridor runs the long way down a plan. The facing decides where the
  // entrance is, not which way the spine points.
  const axis: "v" | "h" = rect.d >= rect.w ? "v" : "h";
  const along = axis === "v" ? rect.d : rect.w,
    cross = axis === "v" ? rect.w : rect.d,
    usable = cross - CORRIDOR;
  if (along < STAIR.d + 2 * MIN_RUN || usable < 2 * MIN_BAND)
    throw Error(SITE_TOO_SMALL);
  // The core is carved out of the near band alone, so that band is made
  // wider to compensate. Without this the far band ends up half again as
  // large and collects rooms nobody wanted to put there.
  const balanced = along / (2 * along - STAIR.d),
    share = 0.5 + (balanced - 0.5) * 0.7,
    tilt = [1, 1.12, 0.9][variant % 3];
  const nearCross = round(
    Math.min(usable - MIN_BAND, Math.max(MIN_BAND, usable * share * tilt)),
  );
  const farCross = round(usable - nearCross);
  // Push the core a little past centre: far enough to read as "West" for
  // Vastu, near enough to the middle that both end segments stay usable.
  const coreAt = round(
    Math.min(
      along - STAIR.d - MIN_RUN,
      Math.max(MIN_RUN, (along - STAIR.d) * 0.52),
    ),
  );
  if (axis === "v") {
    const nearW = nearCross,
      farW = farCross;
    return {
      rect,
      axis,
      doors: { near: "e", far: "w" },
      core: { x: rect.x, y: round(rect.y + coreAt), w: nearW, d: STAIR.d },
      corridor: { x: round(rect.x + nearW), y: rect.y, w: CORRIDOR, d: rect.d },
      nearNorth: { x: rect.x, y: rect.y, w: nearW, d: coreAt },
      nearSouth: {
        x: rect.x,
        y: round(rect.y + coreAt + STAIR.d),
        w: nearW,
        d: round(rect.d - coreAt - STAIR.d),
      },
      far: {
        x: round(rect.x + nearW + CORRIDOR),
        y: rect.y,
        w: farW,
        d: rect.d,
      },
    };
  }
  const nearD = nearCross,
    farD = farCross;
  const nearY = round(rect.y + rect.d - nearD);
  return {
    rect,
    axis,
    doors: { near: "n", far: "s" },
    core: { x: round(rect.x + coreAt), y: nearY, w: STAIR.d, d: nearD },
    corridor: {
      x: rect.x,
      y: round(nearY - CORRIDOR),
      w: rect.w,
      d: CORRIDOR,
    },
    nearNorth: { x: rect.x, y: nearY, w: coreAt, d: nearD },
    nearSouth: {
      x: round(rect.x + coreAt + STAIR.d),
      y: nearY,
      w: round(rect.w - coreAt - STAIR.d),
      d: nearD,
    },
    far: { x: rect.x, y: rect.y, w: rect.w, d: farD },
  };
}
/** One room to place, expanded from a request's count. */
interface Slot {
  type: BriefSpaceType;
  name: string;
  area: number;
  attachedBath: boolean;
  prefer: { side?: "near" | "far"; end?: "n" | "s" };
}
function slots(spaces: SpaceRequest[]): Slot[] {
  const out: Slot[] = [];
  for (const s of spaces)
    for (let i = 0; i < s.count; i++)
      out.push({
        type: s.type,
        name:
          s.count > 1
            ? `${NAMES[s.type] ?? s.type} ${i + 1}`
            : (NAMES[s.type] ?? s.type),
        // An en-suite is carved from the same cell, so budget it there.
        area:
          AREA[s.type] * (s.spacious ? 1.3 : 1) +
          (s.attachedBath ? AREA.bathroom : 0),
        attachedBath: s.attachedBath,
        prefer: PREFER[s.type] ?? {},
      });
  return out;
}
type BandKey = "nearNorth" | "nearSouth" | "far";
const bandArea = (r: Rect) => r.w * r.d;
/** Place each room in the band tradition prefers, while keeping the bands
 *  loaded in proportion to their size. A preference is worth a lot, but not
 *  so much that one band is crushed while another sits half empty. */
function assign(list: Slot[], frame: Frame, role: FloorBrief["role"]) {
  const out: Record<BandKey, Slot[]> = { nearNorth: [], nearSouth: [], far: [] };
  const size: Record<BandKey, number> = {
    nearNorth: bandArea(frame.nearNorth),
    nearSouth: bandArea(frame.nearSouth),
    far: bandArea(frame.far),
  };
  const load: Record<BandKey, number> = { nearNorth: 0, nearSouth: 0, far: 0 };
  const keys: BandKey[] = ["nearNorth", "nearSouth", "far"];
  for (const slot of [...list].sort((a, b) => b.area - a.area)) {
    const wants: BandKey[] = [];
    if (slot.prefer.side === "far") wants.push("far");
    else if (slot.prefer.side === "near")
      wants.push(
        slot.prefer.end === "s" ? "nearSouth" : "nearNorth",
        slot.prefer.end === "s" ? "nearNorth" : "nearSouth",
      );
    else if (slot.prefer.end)
      wants.push(slot.prefer.end === "s" ? "nearSouth" : "far");
    const score = (k: BandKey) => {
      const rank = wants.indexOf(k);
      const bonus = rank === 0 ? 1.5 : rank === 1 ? 0.75 : 0;
      return bonus - (load[k] + slot.area) / size[k];
    };
    const pick = keys.reduce((a, b) => (score(a) >= score(b) ? a : b));
    out[pick].push(slot);
    load[pick] += slot.area;
  }
  // A band nobody wanted still has to be built. Borrow a room from the most
  // crowded band, but only when that band can spare it - otherwise the fix
  // just moves the emptiness somewhere else.
  for (const key of keys) {
    if (out[key].length) continue;
    let best: { from: BandKey; slot: Slot; score: number } | null = null;
    for (const from of keys) {
      if (out[from].length < 2) continue;
      for (const slot of out[from]) {
        // The donor has to stay a sensible size, or the gap just moves.
        if ((load[from] - slot.area) / size[from] < 0.55) continue;
        const near = key !== "far";
        const fits = -Math.abs(slot.area - size[key]) / size[key];
        const wanted =
          (slot.prefer.side === "near" && near) ||
          (slot.prefer.side === "far" && !near)
            ? 1
            : slot.prefer.side
              ? -0.6
              : 0;
        const ends =
          slot.prefer.end && key !== "far"
            ? (key === "nearSouth") === (slot.prefer.end === "s")
              ? 0.4
              : -0.4
            : 0;
        const score = fits + wanted + ends;
        if (!best || score > best.score) best = { from, slot, score };
      }
    }
    if (!best) continue;
    out[best.from].splice(out[best.from].indexOf(best.slot), 1);
    out[key].push(best.slot);
    load[best.from] -= best.slot.area;
    load[key] += best.slot.area;
  }
  // Where a band is far larger than what it was asked to hold, the surplus
  // becomes usable outdoor space instead of bloating every room in it.
  for (const key of keys) {
    const spare = size[key] - load[key];
    // A stilt is meant to be one big open deck, so surplus there is not waste.
    if (role === "stilt") continue;
    if (!out[key].length || spare < 150 || spare / size[key] < 0.4) continue;
    out[key].push({
      type: role === "terrace" ? "garden" : "balcony",
      name: role === "terrace" ? "Garden" : "Balcony",
      // Capped, so the rooms that were asked for absorb most of the slack
      // and the leftover reads as a balcony rather than half the floor.
      area: Math.min(spare, size[key] * 0.32),
      attachedBath: false,
      prefer: { end: "n" },
    });
  }
  return out;
}
/** Order a band from its north/west end to its south/east end. */
function order(list: Slot[]) {
  const rank = (s: Slot) =>
    s.prefer.end === "n" ? 0 : s.prefer.end === "s" ? 2 : 1;
  return [...list].sort((a, b) => rank(a) - rank(b) || b.area - a.area);
}
const minRun = (s: Slot) =>
  SMALL.includes(s.type) ? MIN_RUN_SMALL : Math.min(MIN_RUN, 9);
/** Cut a band into cells.
 *
 *  Rooms are laid in runs across the band. A small room whose fair share would
 *  be a sliver is paired with its neighbour and the two share one run side by
 *  side, which is how a pooja room or a store actually gets built rather than
 *  becoming a 3 ft ribbon across the plan. */
function cut(band: Rect, list: Slot[], axis: "v" | "h"): [Slot, Rect][] {
  if (!list.length) return [];
  const span = axis === "v" ? band.d : band.w,
    width = axis === "v" ? band.w : band.d;
  const strips: Slot[][] = [];
  for (const slot of list) {
    const last = strips[strips.length - 1];
    const ideal = slot.area / width;
    const pairable =
      last &&
      last.length === 1 &&
      SMALL.includes(slot.type) &&
      SMALL.includes(last[0].type) &&
      slot.area <= SMALL_AREA &&
      last[0].area <= SMALL_AREA &&
      width >= 9;
    if (pairable && ideal < MIN_RUN) last.push(slot);
    else strips.push([slot]);
  }
  // Give every strip at least its minimum run, then share what is left over
  // in proportion to demand so the band is filled exactly.
  const mins = strips.map((s) => Math.max(...s.map(minRun)));
  const wants = strips.map((s) => s.reduce((a, i) => a + i.area, 0) / width);
  let runs = strips.map((_, i) => Math.max(mins[i], wants[i]));
  const total = runs.reduce((a, b) => a + b, 0);
  if (total > span) {
    // Overcommitted: shrink towards the minimums, then scale if still over.
    const slack = runs.map((r, i) => r - mins[i]),
      slackSum = slack.reduce((a, b) => a + b, 0),
      cutBy = total - span;
    runs =
      slackSum >= cutBy
        ? runs.map((r, i) => r - (slack[i] / slackSum) * cutBy)
        : runs.map((r) => (r / total) * span);
  } else if (total < span) {
    const extra = total > 0 ? (span - total) / total : 0;
    runs = runs.map((r) => r + r * extra);
  }
  const out: [Slot, Rect][] = [];
  let at = axis === "v" ? band.y : band.x;
  const end = axis === "v" ? band.y + band.d : band.x + band.w;
  strips.forEach((strip, i) => {
    const run = i === strips.length - 1 ? end - at : runs[i];
    // Two rooms sharing a run split the band's width between them, each
    // keeping enough width to be a room.
    const areaSum = strip.reduce((a, s) => a + s.area, 0);
    let across = axis === "v" ? band.x : band.y;
    strip.forEach((slot, j) => {
      const lastInStrip = j === strip.length - 1;
      const raw = strip.length === 1 ? width : (slot.area / areaSum) * width;
      const size = lastInStrip
        ? (axis === "v" ? band.x + band.w : band.y + band.d) - across
        : Math.max(4.5, Math.min(raw, width - 4.5));
      out.push([
        slot,
        axis === "v"
          ? { x: round(across), y: round(at), w: round(size), d: round(run) }
          : { x: round(at), y: round(across), w: round(run), d: round(size) },
      ]);
      across += size;
    });
    at += run;
  });
  return out;
}
/** Carve an en-suite off the end of a bedroom cell, keeping both rectangular.
 *  Returns null when the cell cannot spare the depth. */
function carveAttachedBath(
  cell: Rect,
  axis: "v" | "h",
  name: string,
): { room: Rect; bath: Room } | null {
  const span = axis === "v" ? cell.d : cell.w,
    width = axis === "v" ? cell.w : cell.d;
  if (span - BATH_DEPTH < 8 || (span - BATH_DEPTH) * width < 80 || width < 5)
    return null;
  if (axis === "v") {
    const bath = {
      x: cell.x,
      y: round(cell.y + cell.d - BATH_DEPTH),
      w: cell.w,
      d: BATH_DEPTH,
    };
    // The en-suite opens off its own bedroom, through the wall they share.
    return { room: { ...cell, d: round(cell.d - BATH_DEPTH) }, bath: room("bathroom", `${name} bath`, bath, "n") };
  }
  const bath = {
    x: round(cell.x + cell.w - BATH_DEPTH),
    y: cell.y,
    w: BATH_DEPTH,
    d: cell.d,
  };
  return { room: { ...cell, w: round(cell.w - BATH_DEPTH) }, bath: room("bathroom", `${name} bath`, bath, "w") };
}
function buildBand(
  band: Rect,
  list: Slot[],
  frame: Frame,
  doorSide: Room["doorSide"],
): Room[] {
  const out: Room[] = [];
  for (const [slot, cell] of cut(band, order(list), frame.axis)) {
    if (slot.attachedBath) {
      const carved = carveAttachedBath(cell, frame.axis, slot.name);
      if (carved) {
        out.push(room(slot.type as RoomType, slot.name, carved.room, doorSide));
        out.push(carved.bath);
        continue;
      }
    }
    out.push(room(slot.type as RoomType, slot.name, cell, doorSide));
  }
  return out;
}
/** A band with nothing assigned to it still has to be something. */
function filler(role: FloorBrief["role"]): SpaceRequest {
  return {
    type:
      role === "stilt" ? "parking" : role === "terrace" ? "seating" : "balcony",
    count: 1,
    spacious: false,
    attachedBath: false,
    open: true,
  };
}
/** Keep names unique on a floor, so two leftover bands do not both read
 *  "Parking" in the room list. */
function uniqueNames(rooms: Room[]) {
  const seen = new Map<string, number>();
  for (const r of rooms) {
    const n = (seen.get(r.name) ?? 0) + 1;
    seen.set(r.name, n);
    if (n > 1) r.name = `${r.name} ${n}`;
  }
  return rooms;
}
function buildFloor(brief: FloorBrief, frame: Frame, index: number): Floor {
  const { near, far } = frame.doors;
  const core = room(
    "stairs",
    brief.role === "terrace" ? "Stair head" : "Staircase",
    frame.core,
    near,
  );
  // The door opens onto the arrival landing at the near end of the core, so
  // you step off the flight and straight out, not into the stairwell.
  core.doorOffset = 0;
  const rooms: Room[] = [core];
  const spine: RoomType =
    brief.role === "terrace" ? "terrace" : brief.role === "stilt" ? "entrance" : "hall";
  rooms.push(
    room(
      spine,
      spine === "hall" ? "Passage" : spine === "entrance" ? "Entrance" : "Terrace",
      frame.corridor,
      near,
    ),
  );
  const groups = assign(slots(brief.spaces), frame, brief.role);
  for (const [key, band, side] of [
    ["nearNorth", frame.nearNorth, near],
    ["nearSouth", frame.nearSouth, near],
    ["far", frame.far, far],
  ] as const) {
    const list = groups[key].length ? groups[key] : slots([filler(brief.role)]);
    rooms.push(...buildBand(band, list, frame, side));
  }
  return {
    id: uid(),
    name: floorName(brief, index),
    height: brief.role === "terrace" ? 9 : 10,
    role: brief.role,
    rooms: uniqueNames(rooms),
  };
}
function floorName(brief: FloorBrief, index: number) {
  const raw = brief.label.trim();
  if (raw && /floor|terrace|level|ground|stilt|roof/i.test(raw))
    return raw[0].toUpperCase() + raw.slice(1);
  if (brief.role === "terrace") return "Terrace";
  return (
    [
      "Ground floor",
      "First floor",
      "Second floor",
      "Third floor",
      "Fourth floor",
    ][index] ?? `Level ${index + 1}`
  );
}
/** Build a complete project from a brief. `variant` shifts the corridor
 *  position, giving genuinely different plans on the same frame. */
export function generateFromBrief(
  base: Project,
  brief: Brief,
  variant = 0,
): Project {
  if (!brief.floors.length) throw Error("The brief described no floors.");
  const p = applyBrief(base, brief);
  p.variant = variant % 3;
  const frame = planFrame(p.site, variant);
  p.floors = brief.floors.slice(0, 5).map((f, i) => buildFloor(f, frame, i));
  return p;
}
/** Vertical alignment is the point of the shared frame, so it is asserted
 *  rather than assumed. */
export function coreAligned(p: Project) {
  const cores = p.floors.map((f) => f.rooms.find((r) => r.type === "stairs"));
  if (cores.some((c) => !c)) return false;
  const [first, ...rest] = cores as Room[];
  return rest.every(
    (c) =>
      Math.abs(c.x - first.x) < 0.02 &&
      Math.abs(c.y - first.y) < 0.02 &&
      Math.abs(c.w - first.w) < 0.02 &&
      Math.abs(c.d - first.d) < 0.02,
  );
}
