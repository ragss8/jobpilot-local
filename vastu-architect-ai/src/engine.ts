export type RoomType =
  | "living"
  | "bedroom"
  | "master"
  | "kitchen"
  | "bathroom"
  | "pooja"
  | "dining"
  | "hall"
  | "stairs"
  | "office"
  | "parking"
  | "utility"
  | "theatre"
  | "store"
  | "entrance"
  | "terrace"
  | "seating"
  | "garden"
  | "balcony"
  | "lift"
  | "jacuzzi";
export type Material = "marble" | "wood" | "terrazzo" | "tile";
export type Direction = "North" | "East" | "South" | "West";
/** Levels stack in array order. A stilt is the open parking ground level, a
 *  terrace is the open roof; both skip the enclosed-room treatment. */
export type FloorRole = "stilt" | "residential" | "terrace";
export const furnitureKinds = [
  "bed",
  "sofa",
  "table",
  "counter",
  "wardrobe",
  "toilet",
  "altar",
  "desk",
  "car",
  "recliner",
  "screen",
  "planter",
  "bench",
  "washer",
  "pergola",
  "shower",
  "jacuzzi",
] as const;
export interface Furniture {
  id: string;
  kind: (typeof furnitureKinds)[number];
  x: number;
  y: number;
  w: number;
  d: number;
  rotation: number;
}
export interface Room {
  id: string;
  name: string;
  type: RoomType;
  x: number;
  y: number;
  w: number;
  d: number;
  material: Material;
  furniture: Furniture[];
  doorSide: "n" | "e" | "s" | "w";
  doorOffset: number;
  windowOffset: number;
  stairReverse?: boolean;
}
export interface Floor {
  id: string;
  name: string;
  height: number;
  role: FloorRole;
  rooms: Room[];
}
export interface Project {
  version: 2;
  name: string;
  site: {
    width: number;
    depth: number;
    facing: Direction;
    setback: number;
    front: number;
  };
  requirements: {
    bedrooms: number;
    style: string;
    vastu: "Balanced" | "Strict" | "Off";
    budget: number;
  };
  floors: Floor[];
  variant: number;
  wallThickness: number;
}
export interface Opening {
  axis: "h" | "v";
  fixed: number;
  start: number;
  end: number;
  kind: "door" | "window";
}
export interface Wall {
  axis: "h" | "v";
  fixed: number;
  start: number;
  end: number;
  bottom: number;
  top: number;
}
export const round = (n: number) => Math.round(n * 100) / 100;
export const uid = () => crypto.randomUUID();
/** Height of the terrace edge wall, in feet. */
export const PARAPET = 3.5;
/** A dog-legged flight: two runs against a mid-landing. Sized so the core is
 *  identical on every level and the flights stack. */
export const STAIR = { w: 8, d: 13, tread: 0.9, riser: 0.58 };
export const roomColors: Record<RoomType, string> = {
  lift: "#cbd4df",
  jacuzzi: "#b9deda",
  living: "#ede3d1",
  bedroom: "#e8e3db",
  master: "#e4ded2",
  kitchen: "#e4eadf",
  bathroom: "#deebeb",
  pooja: "#eee3cb",
  dining: "#ede3d1",
  hall: "#f4efe5",
  stairs: "#e1e5df",
  office: "#e2e7e9",
  parking: "#dcdcd6",
  utility: "#e0e6e4",
  theatre: "#ded9e0",
  store: "#e6e2da",
  entrance: "#eae6da",
  terrace: "#e9eee6",
  seating: "#ecdfd0",
  garden: "#dde8d6",
  balcony: "#e7ecdf",
};
/** Ground level of a floor, in feet, from the heights of everything below it. */
export function floorBase(p: Project, index: number) {
  return round(p.floors.slice(0, index).reduce((sum, f) => sum + f.height, 0));
}
/** Rooms that are enclosed and habitable: they need walls, a door, and
 *  ventilation. Open levels (parking, terrace decks, gardens) do not. */
export const openRoomTypes: RoomType[] = [
  "jacuzzi",
  "parking",
  "terrace",
  "seating",
  "garden",
  "entrance",
  "balcony",
];
export const isOpen = (t: RoomType) => openRoomTypes.includes(t);
export const materialColors: Record<Material, string> = {
  marble: "#e7deca",
  wood: "#b99066",
  terrazzo: "#d5d0c6",
  tile: "#ccd9d5",
};
export function furnish(r: Room): Furniture[] {
  const items: Furniture[] = [];
  // Keep a clear approach in front of the door. Without this a bed or a
  // wardrobe can be laid across the only way into the room.
  const clear = doorClearance(r);
  const add = (
    kind: Furniture["kind"],
    x: number,
    y: number,
    w: number,
    d: number,
  ) => {
    if (
      x >= 0.2 &&
      y >= 0.2 &&
      x + w <= r.w - 0.2 &&
      y + d <= r.d - 0.2 &&
      !overlaps({ x, y, w, d }, clear) &&
      !items.some(
        (a) =>
          Math.min(a.x + a.w, x + w) - Math.max(a.x, x) > 0.05 &&
          Math.min(a.y + a.d, y + d) - Math.max(a.y, y) > 0.05,
      )
    )
      items.push({ id: uid(), kind, x, y, w, d, rotation: 0 });
  };
  /** Place a piece against the wall opposite the door, centred on it. */
  const against = (kind: Furniture["kind"], w: number, d: number) => {
    const back = { n: "s", s: "n", e: "w", w: "e" }[r.doorSide];
    if (back === "n") add(kind, (r.w - w) / 2, 0.65, w, d);
    else if (back === "s") add(kind, (r.w - w) / 2, r.d - d - 0.65, w, d);
    else if (back === "w") add(kind, 0.65, (r.d - d) / 2, w, d);
    else add(kind, r.w - w - 0.65, (r.d - d) / 2, w, d);
  };
  /** Fill a flank wall, one that does not carry the door. */
  const flank = (kind: Furniture["kind"], long: number, deep: number) => {
    const side = r.doorSide === "n" || r.doorSide === "s" ? "w" : "n";
    if (side === "w") add(kind, 0.5, (r.d - long) / 2, deep, long);
    else add(kind, (r.w - long) / 2, 0.5, long, deep);
  };
  if (r.type === "bedroom" || r.type === "master") {
    against("bed", Math.min(5.2, r.w - 1.4), Math.min(6.6, r.d - 1.4));
    flank("wardrobe", Math.min(4, Math.min(r.w, r.d) - 1.4), 1.6);
  }
  if (r.type === "living") {
    against("sofa", Math.min(7, r.w - 1.4), 2.7);
    add(
      "table",
      Math.max(0.6, r.w / 2 - 1.6),
      Math.max(0.6, r.d / 2 - 0.9),
      3.2,
      1.8,
    );
  }
  if (r.type === "dining") add("table", r.w / 2 - 2, r.d / 2 - 1.3, 4, 2.6);
  if (r.type === "kitchen") {
    flank("counter", Math.min(r.w, r.d) - 1, 2);
    against("counter", Math.min(5, r.w - 1.4), 2);
  }
  if (r.type === "bathroom") {
    against("toilet", 2.2, 3);
    flank("shower", 3, 3);
    if (!items.some((i) => i.kind === "toilet")) {
      for (const [w, d] of [
        [2.2, 3],
        [3, 2.2],
      ]) {
        for (const [x, y] of [
          [0.3, 0.3],
          [r.w - w - 0.3, 0.3],
          [0.3, r.d - d - 0.3],
          [r.w - w - 0.3, r.d - d - 0.3],
        ]) {
          if (!items.some((i) => i.kind === "toilet"))
            add("toilet", x, y, w, d);
        }
      }
    }
  }
  if (r.type === "pooja") against("altar", Math.min(2.8, r.w - 1.4), 1.5);
  if (r.type === "office") flank("desk", Math.min(4, r.w - 1.4), 2);
  if (r.type === "parking") {
    // 6 x 14.5 clear is a comfortable Indian car bay. Bays tile across the
    // short side and sit away from the driveway threshold.
    const bay = { w: 6.2, d: 14.5 };
    const acrossW = r.w >= r.d;
    const lane = acrossW ? bay.d : bay.w,
      pitch = acrossW ? bay.w : bay.d;
    const n = Math.max(1, Math.floor((acrossW ? r.w : r.d) / (pitch + 0.6)));
    const off = r.doorSide === "e" || r.doorSide === "s" ? 0.6 : undefined;
    for (let i = 0; i < n; i++) {
      const at = 0.6 + i * (pitch + 0.6);
      const back = off ?? Math.max(0.6, (acrossW ? r.d : r.w) - lane - 0.6);
      if (acrossW) add("car", at, back, bay.w, bay.d);
      else add("car", back, at, bay.w, bay.d);
    }
  }
  if (r.type === "utility") {
    against("washer", 2.4, 2.4);
    flank("counter", Math.min(5, Math.min(r.w, r.d) - 1.4), 2);
  }
  if (r.type === "theatre") {
    against("screen", Math.min(8, r.w - 1.4), 0.5);
    // Rows face the screen, set back from it and from the door.
    const seats = Math.max(1, Math.floor((r.w - 1) / 3.4));
    for (let row = 0; row < 2; row++)
      for (let seat = 0; seat < seats; seat++)
        add(
          "recliner",
          Math.max(0.5, (r.w - seats * 3.4) / 2) + seat * 3.4,
          r.d - 7 + row * 3.2,
          3,
          2.9,
        );
  }
  if (r.type === "store") flank("wardrobe", Math.min(4, r.w - 1.4), 1.8);
  if (r.type === "seating") {
    against("sofa", Math.min(7, r.w - 1.4), 2.7);
    add(
      "table",
      Math.max(0.6, r.w / 2 - 1.6),
      Math.max(0.6, r.d / 2 - 0.9),
      3.2,
      1.8,
    );
    if (r.d > 12) add("pergola", 0.4, r.d - 10, Math.min(12, r.w - 0.8), 9.5);
  }
  if (r.type === "garden") {
    for (let i = 0; i < Math.max(1, Math.floor(r.w / 4)); i++)
      add("planter", 0.5 + i * 4, 0.5, 3, 2);
    add("bench", Math.max(0.5, r.w / 2 - 2.5), r.d - 2.4, 5, 1.8);
  }
  if (r.type === "jacuzzi") against("jacuzzi", 6, 6);
  if (r.type === "balcony")
    add("bench", Math.max(0.5, r.w / 2 - 2), Math.max(0.5, r.d - 2.2), 4, 1.6);
  return items;
}
const overlaps = (
  a: { x: number; y: number; w: number; d: number },
  b: { x: number; y: number; w: number; d: number },
) =>
  Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x) > 0.05 &&
  Math.min(a.y + a.d, b.y + b.d) - Math.max(a.y, b.y) > 0.05;
/** The strip a person needs to get through the door and turn into the room,
 *  in room-local coordinates. */
export function doorClearance(r: Room) {
  const gap = 3.6,
    // An open room needs only its threshold kept clear; you can walk around
    // whatever is in it. An enclosed room needs space to enter and turn.
    deep = isOpen(r.type) ? 1.2 : 3.2;
  if (r.doorSide === "n" || r.doorSide === "s") {
    const x = Math.min(Math.max(0, (r.w - gap) * r.doorOffset), r.w - gap);
    return {
      x,
      y: r.doorSide === "n" ? 0 : r.d - deep,
      w: gap,
      d: Math.min(deep, r.d),
    };
  }
  const y = Math.min(Math.max(0, (r.d - gap) * r.doorOffset), r.d - gap);
  return {
    x: r.doorSide === "w" ? 0 : r.w - deep,
    y,
    w: Math.min(deep, r.w),
    d: gap,
  };
}
/** The rectangle a building may occupy: the site less its setbacks, with the
 *  larger road-side setback applied on the facing edge. */
export function buildableRect(site: Project["site"]) {
  const { width, depth, setback, front, facing } = site;
  return {
    x: setback + (facing === "West" ? front - setback : 0),
    y: setback + (facing === "North" ? front - setback : 0),
    w:
      width -
      2 * setback -
      (["East", "West"].includes(facing) ? front - setback : 0),
    d:
      depth -
      2 * setback -
      (["North", "South"].includes(facing) ? front - setback : 0),
  };
}
export function defaultProject(): Project {
  return generate(
    {
      version: 2,
      name: "The Courtyard House",
      site: { width: 30, depth: 40, facing: "South", setback: 2, front: 4 },
      requirements: {
        bedrooms: 3,
        style: "Modern Indian",
        vastu: "Balanced",
        budget: 80,
      },
      floors: [],
      variant: 0,
      wallThickness: 0.45,
    },
    0,
  );
}
export function generate(base: Project, variant = 0): Project {
  const p = structuredClone(base);
  p.variant = variant;
  const { facing } = p.site;
  const { x, y, w, d } = buildableRect(p.site);
  if (w < 22 || d < 28)
    throw new Error(
      "This template needs a buildable area of at least 22 × 28 ft. Increase the site or reduce setbacks.",
    );
  const left = round(w * [0.4, 0.44, 0.37][variant % 3]),
    hall = 3.5,
    right = round(w - left - hall),
    rx = round(x + left + hall),
    rooms: Room[] = [];
  const add = (
    type: RoomType,
    name: string,
    xx: number,
    yy: number,
    ww: number,
    dd: number,
    side: Room["doorSide"] = "w",
  ) => {
    const r: Room = {
      id: uid(),
      type,
      name,
      x: round(xx),
      y: round(yy),
      w: round(ww),
      d: round(dd),
      material:
        type === "bathroom"
          ? "tile"
          : type === "bedroom" || type === "master"
            ? "wood"
            : "marble",
      furniture: [],
      doorSide: side,
      doorOffset: 0.55,
      windowOffset: 0.5,
    };
    r.furniture = furnish(r);
    rooms.push(r);
    return r;
  };
  const n = p.requirements.bedrooms;
  const cells = Math.max(2, n);
  const cell = d / cells;
  for (let i = 0; i < cells; i++) {
    const isMaster = i === cells - 1;
    add(
      i >= cells - n ? (isMaster ? "master" : "bedroom") : "office",
      i >= cells - n
        ? isMaster
          ? "Master bedroom"
          : `Bedroom ${i + 1}`
        : "Study",
      x,
      y + i * cell,
      left,
      cell,
      "e",
    );
  }
  const top = round(d * 0.22),
    living = round(d * 0.37),
    dining = round(d * 0.19),
    bottom = round(d - top - living - dining),
    poojaW = 5;
  add("bathroom", "Bathroom", rx, y, right - poojaW, top, "w");
  add("pooja", "Pooja", rx + right - poojaW, y, poojaW, top, "s");
  add("living", "Living room", rx, y + top, right, living, "w");
  add("dining", "Dining", rx, y + top + living, right, dining, "w");
  add("kitchen", "Kitchen", rx, y + top + living + dining, right, bottom, "w");
  add("hall", "Passage", x + left, y, hall, d, facing === "North" ? "n" : "s");
  // A road-side entrance connects through a bedroom/living room for east/west sites.
  if (facing === "East" || facing === "West") {
    const entry = rooms.find((r) =>
      facing === "West" ? r.type === "master" : r.type === "dining",
    );
    if (entry) entry.doorOffset = 0.5;
  }
  p.floors = [
    { id: uid(), name: "Ground floor", height: 10, role: "residential", rooms },
  ];
  return p;
}
export function getOpenings(p: Project, f: Floor): Opening[] {
  const out: Opening[] = [];
  const push = (
    r: Room,
    side: Room["doorSide"],
    offset: number,
    size: number,
    kind: Opening["kind"],
  ) => {
    const axis = side === "n" || side === "s" ? "h" : "v";
    const length = axis === "h" ? r.w : r.d;
    const actual = Math.min(size, length - 1);
    if (actual <= 0) return;
    const start =
      (axis === "h" ? r.x : r.y) + 0.5 + (length - actual - 1) * offset;
    out.push({
      axis,
      fixed:
        axis === "h"
          ? r.y + (side === "s" ? r.d : 0)
          : r.x + (side === "e" ? r.w : 0),
      start,
      end: start + actual,
      kind,
    });
  };
  const minX = Math.min(...f.rooms.map((r) => r.x)),
    maxX = Math.max(...f.rooms.map((r) => r.x + r.w)),
    minY = Math.min(...f.rooms.map((r) => r.y)),
    maxY = Math.max(...f.rooms.map((r) => r.y + r.d));
  for (const r of f.rooms) {
    if (isOpen(r.type)) {
      // An open room has no walls of its own, but the enclosed rooms beside it
      // do. Cut a wide opening so the space is genuinely reachable instead of
      // being sealed in by its neighbours.
      push(r, r.doorSide, r.doorOffset, 6, "door");
      continue;
    }
    push(r, r.doorSide, r.doorOffset, 3, "door");
    if (r.type === "hall" || r.type === "lift") continue;
    // Every enclosed room gets a window on an exterior edge it actually
    // touches. The road-facing edge wins where a room reaches it, so the
    // front of the house has openings rather than a blank wall; otherwise
    // any edge that is not already carrying the door.
    const exterior = exteriorSides(r, { minX, maxX, minY, maxY });
    const front = ({ North: "n", South: "s", East: "e", West: "w" } as const)[
      p.site.facing
    ];
    const ranked = [...exterior].sort(
      (a, b) => Number(b === front) - Number(a === front),
    );
    const side = ranked.find((s) => s !== r.doorSide) ?? ranked[0];
    if (side)
      push(
        r,
        side,
        r.windowOffset,
        side === "n" || side === "s" ? 3 : 4,
        "window",
      );
  }
  if (p.site.facing === "East" || p.site.facing === "West") {
    const r = f.rooms.find((r) =>
      p.site.facing === "West" ? r.type === "master" : r.type === "dining",
    );
    if (r) push(r, p.site.facing === "West" ? "w" : "e", 0.5, 3.5, "door");
  }
  return out;
}
/** Which of a room's sides sit on the floor's outer envelope. */
export function exteriorSides(
  r: Room,
  b: { minX: number; maxX: number; minY: number; maxY: number },
): Room["doorSide"][] {
  const on = (a: number, c: number) => Math.abs(a - c) < 0.02;
  return (
    [
      ["w", on(r.x, b.minX)],
      ["e", on(r.x + r.w, b.maxX)],
      ["n", on(r.y, b.minY)],
      ["s", on(r.y + r.d, b.maxY)],
    ] as const
  )
    .filter(([, hit]) => hit)
    .map(([side]) => side);
}
/** The outer envelope of a floor, from its rooms. */
export function floorBounds(f: Floor) {
  return {
    minX: Math.min(...f.rooms.map((r) => r.x)),
    maxX: Math.max(...f.rooms.map((r) => r.x + r.w)),
    minY: Math.min(...f.rooms.map((r) => r.y)),
    maxY: Math.max(...f.rooms.map((r) => r.y + r.d)),
  };
}
export function getWalls(p: Project, f: Floor): Wall[] {
  const groups = new Map<
    string,
    { axis: "h" | "v"; fixed: number; ranges: number[][] }
  >();
  for (const r of f.rooms) {
    if (isOpen(r.type)) continue;
    for (const [axis, fixed, start, end] of [
      ["h", r.y, r.x, r.x + r.w],
      ["h", r.y + r.d, r.x, r.x + r.w],
      ["v", r.x, r.y, r.y + r.d],
      ["v", r.x + r.w, r.y, r.y + r.d],
    ] as const) {
      const key = `${axis}${round(fixed)}`;
      if (!groups.has(key))
        groups.set(key, { axis, fixed: round(fixed), ranges: [] });
      groups.get(key)!.ranges.push([start, end]);
    }
  }
  const openings = getOpenings(p, f),
    walls: Wall[] = [];
  for (const g of groups.values()) {
    const os = openings.filter(
      (o) => o.axis === g.axis && Math.abs(o.fixed - g.fixed) < 0.03,
    );
    const pts = [
      ...new Set(
        [...g.ranges.flat(), ...os.flatMap((o) => [o.start, o.end])].map(round),
      ),
    ].sort((a, b) => a - b);
    for (let i = 0; i < pts.length - 1; i++) {
      const start = pts[i],
        end = pts[i + 1],
        mid = (start + end) / 2;
      if (!g.ranges.some(([a, b]) => mid >= a && mid <= b)) continue;
      const cut = os.filter((o) => mid >= o.start && mid <= o.end);
      const door = cut.some((o) => o.kind === "door"),
        win = cut.some((o) => o.kind === "window");
      const wall = { axis: g.axis, fixed: g.fixed, start, end };
      if (!door && !win) walls.push({ ...wall, bottom: 0, top: f.height });
      else {
        if (win && !door) walls.push({ ...wall, bottom: 0, top: 3 });
        walls.push({ ...wall, bottom: 7, top: f.height });
      }
    }
  }
  // An open roof is ringed by a waist-high parapet instead of full walls, so a
  // walker is stopped at the edge without the level being boxed in.
  if (f.role === "terrace" && f.rooms.length) {
    const x0 = Math.min(...f.rooms.map((r) => r.x)),
      x1 = Math.max(...f.rooms.map((r) => r.x + r.w)),
      y0 = Math.min(...f.rooms.map((r) => r.y)),
      y1 = Math.max(...f.rooms.map((r) => r.y + r.d));
    for (const [axis, fixed, start, end] of [
      ["h", y0, x0, x1],
      ["h", y1, x0, x1],
      ["v", x0, y0, y1],
      ["v", x1, y0, y1],
    ] as const)
      walls.push({
        axis,
        fixed: round(fixed),
        start: round(start),
        end: round(end),
        bottom: 0,
        top: PARAPET,
      });
  }
  return walls;
}
/** A dog-legged flight inside the core: one run up to a half-landing, a turn,
 *  and a second run back the other way. Solved once here so the geometry the
 *  viewer draws and the height the walker climbs cannot disagree. */
export interface StairRun {
  /** The direction the flights run in. */
  axis: "x" | "z";
  direction: 1 | -1;
  /** Start of the core in that axis. */
  from: number;
  /** Depth of the arrival landing at the near end, level with this floor. */
  arrival: number;
  /** Length of each flight between the two landings. */
  run: number;
  /** Depth of the half-landing at the far end. */
  landing: number;
  /** Middle of the core across the run; the two flights sit either side. */
  mid: number;
  /** True when the first, ascending flight is on the far side of `mid`. */
  upperSide: boolean;
  steps: number;
}
export function stairRun(core: Room): StairRun {
  // The flights run along whichever side matches the standard core depth.
  const axis: "x" | "z" =
    Math.abs(core.d - STAIR.d) <= Math.abs(core.w - STAIR.d) ? "z" : "x";
  const span = axis === "z" ? core.d : core.w,
    across = axis === "z" ? core.w : core.d;
  const arrival = Math.min(3.5, span * 0.27),
    landing = Math.min(3.5, span * 0.27);
  // You should meet the first tread as you come through the door, so the
  // climbing flight is the one on the door's side of the core.
  const upperSide =
    axis === "z" ? core.doorSide === "e" : core.doorSide === "s";
  return {
    axis,
    direction: core.stairReverse ? -1 : 1,
    from: (axis === "z" ? core.y : core.x) + (core.stairReverse ? span : 0),
    arrival,
    landing,
    run: span - arrival - landing,
    mid: (axis === "z" ? core.x : core.y) + across / 2,
    upperSide,
    steps: 8,
  };
}
/** Height above this level's floor for a point standing on the flight, or
 *  null when the point is not over the core at all. Continuous from the
 *  arrival landing, up to the half-landing, and back to the floor above. */
export function stairHeightAt(
  core: Room,
  height: number,
  x: number,
  z: number,
): number | null {
  if (x < core.x || x > core.x + core.w || z < core.y || z > core.y + core.d)
    return null;
  const s = stairRun(core);
  const along = s.axis === "z" ? z : x,
    across = s.axis === "z" ? x : z;
  const t = (s.direction * (along - s.from) - s.arrival) / s.run;
  if (t <= 0) return 0;
  if (t >= 1) return height / 2;
  const climbing = across > s.mid === s.upperSide;
  return climbing ? (height / 2) * t : (height / 2) * (2 - t);
}
export function zone(r: Room, p: Project) {
  const xx = (r.x + r.w / 2) / p.site.width,
    yy = (r.y + r.d / 2) / p.site.depth;
  const v = yy < 0.4 ? "North" : yy > 0.6 ? "South" : "";
  const h = xx < 0.4 ? "West" : xx > 0.6 ? "East" : "";
  return v && h ? `${v}${h}` : v || h || "Center";
}
const rules: Partial<Record<RoomType, string[]>> = {
  pooja: ["NorthEast"],
  master: ["SouthWest"],
  kitchen: ["SouthEast", "NorthWest"],
  living: ["North", "East", "NorthEast"],
  stairs: ["South", "West", "SouthWest"],
  bathroom: ["West", "NorthWest", "South"],
};
export function vastu(p: Project, f: Floor) {
  const checks = f.rooms
    .filter((r) => rules[r.type])
    .map((r) => ({
      id: r.id,
      name: r.name,
      zone: zone(r, p),
      preferred: rules[r.type]!,
      ok: rules[r.type]!.includes(zone(r, p)),
    }));
  return {
    score:
      p.requirements.vastu === "Off"
        ? null
        : Math.round(
            (checks.filter((c) => c.ok).length / Math.max(1, checks.length)) *
              100,
          ),
    checks,
  };
}
/** Room types that are legitimately narrower than a habitable room. */
const SLIM: RoomType[] = [
  "lift",
  "jacuzzi",
  "hall",
  "pooja",
  "bathroom",
  "dining",
  "stairs",
  "utility",
  "store",
  "entrance",
  "balcony",
  "garden",
  "terrace",
  "seating",
];
export function validate(p: Project, f: Floor): string[] {
  const errors: string[] = [];
  for (const r of f.rooms) {
    if (
      r.x < (p.site.facing === "West" ? p.site.front : p.site.setback) - 0.05 ||
      r.y <
        (p.site.facing === "North" ? p.site.front : p.site.setback) - 0.05 ||
      r.x + r.w >
        p.site.width -
          (p.site.facing === "East" ? p.site.front : p.site.setback) +
          0.05 ||
      r.y + r.d >
        p.site.depth -
          (p.site.facing === "South" ? p.site.front : p.site.setback) +
          0.05
    )
      errors.push(`${r.name} crosses the site setback.`);
    if (!SLIM.includes(r.type) && (r.w < 7 || r.d < 7))
      errors.push(`${r.name} has a side shorter than 7 ft.`);
    for (const item of r.furniture) {
      const b = furnitureBounds(item);
      if (
        b.x < 0.2 ||
        b.y < 0.2 ||
        b.x + b.w > r.w - 0.2 ||
        b.y + b.d > r.d - 0.2
      )
        errors.push(`${r.name}: ${item.kind} needs more room.`);
    }
    for (let i = 0; i < r.furniture.length; i++)
      for (let j = i + 1; j < r.furniture.length; j++) {
        const a = furnitureBounds(r.furniture[i]),
          b = furnitureBounds(r.furniture[j]);
        if (
          Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x) > 0.05 &&
          Math.min(a.y + a.d, b.y + b.d) - Math.max(a.y, b.y) > 0.05
        )
          errors.push(
            `${r.name}: ${r.furniture[i].kind} overlaps ${r.furniture[j].kind}.`,
          );
      }
  }
  for (let i = 0; i < f.rooms.length; i++)
    for (let j = i + 1; j < f.rooms.length; j++) {
      const a = f.rooms[i],
        b = f.rooms[j];
      if (
        Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x) > 0.05 &&
        Math.min(a.y + a.d, b.y + b.d) - Math.max(a.y, b.y) > 0.05
      )
        errors.push(`${a.name} overlaps ${b.name}.`);
    }
  const bounds = f.rooms.length ? floorBounds(f) : null;
  if (bounds)
    for (const r of f.rooms)
      if (
        !isOpen(r.type) &&
        r.type !== "hall" &&
        r.type !== "bathroom" &&
        r.type !== "lift" &&
        !exteriorSides(r, bounds).length
      )
        errors.push(`${r.name} is landlocked, with no wall for a window.`);
  for (const name of unreachable(p, f))
    errors.push(`${name} cannot be reached from the entrance.`);
  return errors;
}
/** Rooms with no walkable path back to the floor's arrival point. Flood-fills
 *  a half-foot grid through doorways using the same collision test the
 *  walkthrough uses, so circulation matches what a visitor can actually do. */
export function unreachable(p: Project, f: Floor): string[] {
  const reach = f.rooms.find((r) => r.type === "stairs" || r.type === "hall");
  if (!reach || f.rooms.length < 2) return [];
  const walls = getWalls(p, f),
    step = 0.5,
    b = floorBounds(f);
  const key = (x: number, y: number) =>
    `${Math.round(x / step)}:${Math.round(y / step)}`;
  const start = { x: reach.x + reach.w / 2, y: reach.y + reach.d / 2 };
  if (!canWalk(start.x, start.y, p, f, walls)) return [];
  const seen = new Set([key(start.x, start.y)]),
    queue = [start];
  while (queue.length) {
    const cur = queue.shift()!;
    for (const [dx, dy] of [
      [step, 0],
      [-step, 0],
      [0, step],
      [0, -step],
    ]) {
      const x = round(cur.x + dx),
        y = round(cur.y + dy);
      if (x < b.minX || x > b.maxX || y < b.minY || y > b.maxY) continue;
      if (seen.has(key(x, y)) || !canWalk(x, y, p, f, walls)) continue;
      seen.add(key(x, y));
      queue.push({ x, y });
    }
  }
  return f.rooms
    .filter((r) => {
      if (r.id === reach.id || r.type === "bathroom") return false;
      for (let x = r.x + 0.5; x < r.x + r.w - 0.4; x += step)
        for (let y = r.y + 0.5; y < r.y + r.d - 0.4; y += step)
          if (seen.has(key(x, y))) return false;
      return true;
    })
    .map((r) => r.name);
}
export function furnitureBounds(f: Furniture) {
  const rotated = Math.abs(f.rotation % 180) === 90;
  return {
    x: f.x + (rotated ? (f.w - f.d) / 2 : 0),
    y: f.y + (rotated ? (f.d - f.w) / 2 : 0),
    w: rotated ? f.d : f.w,
    d: rotated ? f.w : f.d,
  };
}
export function canWalk(
  x: number,
  y: number,
  p: Project,
  f: Floor,
  walls: Wall[],
) {
  const radius = 0.65;
  if (
    x < radius ||
    y < radius ||
    x > p.site.width - radius ||
    y > p.site.depth - radius
  )
    return false;
  for (const wall of walls) {
    if (wall.bottom > 5.5 || wall.top < 0.3) continue;
    const a = wall.axis === "h" ? x : y,
      b = wall.axis === "h" ? y : x;
    if (
      a > wall.start - radius &&
      a < wall.end + radius &&
      Math.abs(b - wall.fixed) < radius + p.wallThickness / 2
    )
      return false;
  }
  for (const r of f.rooms)
    for (const item of r.furniture) {
      if (item.kind === "pergola") {
        // Its roof is overhead. Only the four posts block a walker.
        for (const px of [item.x + 0.3, item.x + item.w - 0.3])
          for (const py of [item.y + 0.3, item.y + item.d - 0.3])
            if (Math.hypot(x - r.x - px, y - r.y - py) < radius + 0.16)
              return false;
        continue;
      }
      const b = furnitureBounds(item);
      if (
        x > r.x + b.x - radius &&
        x < r.x + b.x + b.w + radius &&
        y > r.y + b.y - radius &&
        y < r.y + b.y + b.d + radius
      )
        return false;
    }
  return true;
}
export function parseBrief(text: string, base: Project) {
  const p = structuredClone(base);
  const dim = text.match(/(\d+(?:\.\d+)?)\s*(?:ft\s*)?[x×]\s*(\d+(?:\.\d+)?)/i);
  if (dim) {
    p.site.width = +dim[1];
    p.site.depth = +dim[2];
  }
  const bedrooms = text.match(/(\d)\s*(?:bhk|bedrooms?)/i);
  if (bedrooms)
    p.requirements.bedrooms = Math.max(1, Math.min(4, +bedrooms[1]));
  const facing = text.match(/(north|south|east|west)[ -]?facing/i);
  if (facing)
    p.site.facing = (facing[1][0].toUpperCase() +
      facing[1].slice(1).toLowerCase()) as Direction;
  const budget = text.match(/(?:₹|rs\.?|budget)?\s*(\d+)\s*(?:lakh|lac|l\b)/i);
  if (budget) p.requirements.budget = +budget[1];
  return p;
}
/** Projects saved before floors carried a role read as ordinary residential
 *  levels. Migration is in-place on a clone, ahead of validation. */
function migrate(raw: unknown): unknown {
  const p = raw as { version?: number; floors?: { role?: string }[] };
  if (!p || typeof p !== "object" || p.version !== 1) return raw;
  const next = structuredClone(p);
  next.version = 2;
  for (const f of next.floors ?? []) f.role = "residential";
  return next;
}
export function parseProject(raw: unknown): Project {
  const p = migrate(raw) as Project;
  const num = (v: unknown, min: number, max: number) =>
    typeof v === "number" && Number.isFinite(v) && v >= min && v <= max;
  const str = (v: unknown) => typeof v === "string" && v.length <= 120;
  if (
    !p ||
    p.version !== 2 ||
    !str(p.name) ||
    !p.site ||
    !num(p.site.width, 15, 150) ||
    !num(p.site.depth, 15, 150) ||
    !num(p.site.setback, 0, 15) ||
    !num(p.site.front, 0, 20) ||
    !["North", "South", "East", "West"].includes(p.site.facing) ||
    !p.requirements ||
    !num(p.requirements.bedrooms, 0, 40) ||
    !str(p.requirements.style) ||
    !["Strict", "Balanced", "Off"].includes(p.requirements.vastu) ||
    !num(p.requirements.budget, 1, 10000) ||
    !num(p.wallThickness, 0.2, 1.5) ||
    !num(p.variant, 0, 2) ||
    !Array.isArray(p.floors) ||
    p.floors.length < 1 ||
    p.floors.length > 5
  )
    throw Error("This is not a supported Aangan project.");
  const ids = new Set<string>();
  const id = (v: unknown) => {
    if (!str(v) || ids.has(v as string))
      throw Error("Project IDs must be unique.");
    ids.add(v as string);
  };
  for (const f of p.floors) {
    id(f.id);
    if (
      !str(f.name) ||
      !num(f.height, 8, 16) ||
      !["stilt", "residential", "terrace"].includes(f.role) ||
      !Array.isArray(f.rooms) ||
      f.rooms.length < 1 ||
      f.rooms.length > 60
    )
      throw Error("Invalid floor data.");
    for (const r of f.rooms) {
      id(r.id);
      if (
        !str(r.name) ||
        !str(r.type) ||
        !str(r.material) ||
        !Object.hasOwn(roomColors, r.type) ||
        !Object.hasOwn(materialColors, r.material) ||
        !num(r.x, 0, 150) ||
        !num(r.y, 0, 150) ||
        !num(r.w, 2, 150) ||
        !num(r.d, 2, 150) ||
        !["n", "e", "s", "w"].includes(r.doorSide) ||
        !num(r.doorOffset, 0, 1) ||
        !num(r.windowOffset, 0, 1) ||
        (r.stairReverse !== undefined && typeof r.stairReverse !== "boolean") ||
        !Array.isArray(r.furniture) ||
        r.furniture.length > 30
      )
        throw Error("Invalid room data.");
      for (const item of r.furniture) {
        id(item.id);
        if (
          !(furnitureKinds as readonly string[]).includes(item.kind) ||
          !num(item.x, 0, 150) ||
          !num(item.y, 0, 150) ||
          !num(item.w, 0.2, 40) ||
          !num(item.d, 0.2, 40) ||
          ![0, 90, 180, 270].includes(item.rotation)
        )
          throw Error("Invalid furniture data.");
      }
    }
  }
  return structuredClone(p);
}
