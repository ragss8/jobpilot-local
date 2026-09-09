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
  | "office";
export type Material = "marble" | "wood" | "terrazzo" | "tile";
export type Direction = "North" | "East" | "South" | "West";
export interface Furniture {
  id: string;
  kind:
    | "bed"
    | "sofa"
    | "table"
    | "counter"
    | "wardrobe"
    | "toilet"
    | "altar"
    | "desk";
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
}
export interface Floor {
  id: string;
  name: string;
  height: number;
  rooms: Room[];
}
export interface Project {
  version: 1;
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
export const roomColors: Record<RoomType, string> = {
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
};
export const materialColors: Record<Material, string> = {
  marble: "#e7deca",
  wood: "#b99066",
  terrazzo: "#d5d0c6",
  tile: "#ccd9d5",
};
export function furnish(r: Room): Furniture[] {
  const items: Furniture[] = [];
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
      !items.some(
        (a) =>
          Math.min(a.x + a.w, x + w) - Math.max(a.x, x) > 0.05 &&
          Math.min(a.y + a.d, y + d) - Math.max(a.y, y) > 0.05,
      )
    )
      items.push({ id: uid(), kind, x, y, w, d, rotation: 0 });
  };
  if (r.type === "bedroom" || r.type === "master") {
    add("bed", Math.max(0.6, (r.w - 5.2) / 2), 0.65, 5.2, 6.6);
    add("wardrobe", 0.5, r.d - 2.1, Math.min(4, r.w - 1), 1.6);
  }
  if (r.type === "living") {
    add("sofa", 0.6, 0.65, Math.min(7, r.w - 1.2), 2.7);
    add("table", Math.max(0.6, r.w / 2 - 1.6), 4.3, 3.2, 1.8);
  }
  if (r.type === "dining") add("table", r.w / 2 - 2, r.d / 2 - 1.3, 4, 2.6);
  if (r.type === "kitchen") {
    add("counter", 0.4, 0.4, r.w - 0.8, 2);
    add("counter", r.w - 2.4, 2.4, 2, Math.max(2, r.d - 3));
  }
  if (r.type === "bathroom") add("toilet", r.w / 2 - 1.1, 0.6, 2.2, 3);
  if (r.type === "pooja") add("altar", r.w / 2 - 1.4, 0.5, 2.8, 1.5);
  if (r.type === "office") add("desk", 0.5, 0.5, 4, 2);
  return items;
}
export function defaultProject(): Project {
  return generate(
    {
      version: 1,
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
  const { width, depth, setback, front, facing } = p.site;
  const x = setback + (facing === "West" ? front - setback : 0),
    y = setback + (facing === "North" ? front - setback : 0);
  const w =
      width -
      2 * setback -
      (["East", "West"].includes(facing) ? front - setback : 0),
    d =
      depth -
      2 * setback -
      (["North", "South"].includes(facing) ? front - setback : 0);
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
  p.floors = [{ id: uid(), name: "Ground floor", height: 10, rooms }];
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
    push(r, r.doorSide, r.doorOffset, 3, "door");
    if (r.type === "hall") continue;
    if (Math.abs(r.x - minX) < 0.02) push(r, "w", r.windowOffset, 4, "window");
    else if (Math.abs(r.x + r.w - maxX) < 0.02)
      push(r, "e", r.windowOffset, 4, "window");
    else if (Math.abs(r.y - minY) < 0.02)
      push(r, "n", r.windowOffset, 3, "window");
  }
  if (p.site.facing === "East" || p.site.facing === "West") {
    const r = f.rooms.find((r) =>
      p.site.facing === "West" ? r.type === "master" : r.type === "dining",
    );
    if (r) push(r, p.site.facing === "West" ? "w" : "e", 0.5, 3.5, "door");
  }
  // NE pooja is reached through the family lounge; both share the opening.
  void maxY;
  return out;
}
export function getWalls(p: Project, f: Floor): Wall[] {
  const groups = new Map<
    string,
    { axis: "h" | "v"; fixed: number; ranges: number[][] }
  >();
  for (const r of f.rooms) {
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
  return walls;
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
    if (
      r.type !== "hall" &&
      r.type !== "pooja" &&
      r.type !== "bathroom" &&
      r.type !== "dining" &&
      (r.w < 7 || r.d < 7)
    )
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
  return errors;
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
export function parseProject(raw: unknown): Project {
  const p = raw as Project;
  const num = (v: unknown, min: number, max: number) =>
    typeof v === "number" && Number.isFinite(v) && v >= min && v <= max;
  const str = (v: unknown) => typeof v === "string" && v.length <= 120;
  if (
    !p ||
    p.version !== 1 ||
    !str(p.name) ||
    !p.site ||
    !num(p.site.width, 20, 150) ||
    !num(p.site.depth, 25, 150) ||
    !num(p.site.setback, 0, 15) ||
    !num(p.site.front, 0, 20) ||
    !["North", "South", "East", "West"].includes(p.site.facing) ||
    !p.requirements ||
    !num(p.requirements.bedrooms, 1, 4) ||
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
        !Array.isArray(r.furniture) ||
        r.furniture.length > 30
      )
        throw Error("Invalid room data.");
      for (const item of r.furniture) {
        id(item.id);
        if (
          ![
            "bed",
            "sofa",
            "table",
            "counter",
            "wardrobe",
            "toilet",
            "altar",
            "desk",
          ].includes(item.kind) ||
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
