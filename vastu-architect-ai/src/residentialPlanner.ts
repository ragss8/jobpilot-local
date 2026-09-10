import {
  buildableRect,
  defaultProject,
  furnish,
  uid,
  round,
  validate,
  vastu,
  type Project,
  type Room,
  type RoomType,
  type Floor,
} from "./engine";
import { label, type Brief, type SpaceRequest, type FloorBrief } from "./brief";
import { ROOM_STANDARDS, meetsSize } from "./planningRules";
export interface Proposal {
  project: Project;
  score: number;
  notes: string[];
}
export interface PlanningResult {
  proposals: Proposal[];
  attempted: number;
  rejected: number;
  reasons: string[];
  assumptions: string[];
}
type Rect = { x: number; y: number; w: number; d: number };
type Slot = SpaceRequest & { name: string };
function slots(f: FloorBrief): Slot[] {
  return f.spaces.flatMap((s) =>
    Array.from({ length: s.count }, (_, i) => ({
      ...s,
      name:
        label(s).replace(/^./, (x) => x.toUpperCase()) +
        (s.count > 1 ? ` ${i + 1}` : ""),
    })),
  );
}
function room(
  type: RoomType,
  name: string,
  b: Rect,
  doorSide: Room["doorSide"] = "n",
  doorOffset = 0.5,
): Room {
  return {
    id: uid(),
    type,
    name,
    ...b,
    material: ["bedroom", "master", "theatre", "seating"].includes(type)
      ? "wood"
      : type === "bathroom"
        ? "tile"
        : "terrazzo",
    doorSide,
    doorOffset,
    windowOffset: 0.5,
    furniture: [],
  };
}
function addSpace(
  s: Slot,
  b: Rect,
  side: Room["doorSide"],
  offset = 0.5,
): Room[] {
  if (!s.attachedBath) return [room(s.type, s.name, b, side, offset)];
  // A real en-suite is reserved before testing bedroom dimensions.
  if (!["master", "bedroom"].includes(s.type))
    throw Error("Only bedrooms can have an attached bathroom.");
  const bedroom = room(s.type, s.name, { ...b, d: b.d - 5 }, side, offset);
  const bath = room(
    "bathroom",
    `${s.name} · en-suite`,
    { x: b.x, y: b.y + b.d - 5, w: b.w, d: 5 },
    "n",
  );
  return [bedroom, bath];
}
function partition(
  list: Slot[],
  b: Rect,
  side: Room["doorSide"],
  strategy: number,
): Room[] {
  if (!list.length) return [room("entrance", "Shared landing", b, "n")];
  if (list.length === 1) return addSpace(list[0], b, side);
  // Every room fronts the same landing. No bedroom is a route to another.
  const axis = side === "w" || side === "e" ? "d" : "w";
  const total = list.reduce((a, s) => a + weight(s, strategy), 0);
  let at = axis === "w" ? b.x : b.y;
  return list.flatMap((s) => {
    const span = (b[axis] * weight(s, strategy)) / total;
    const cell = { ...b, [axis]: span, [axis === "w" ? "x" : "y"]: at };
    at += span;
    return addSpace(s, cell, side);
  });
}
function weight(s: Slot, strategy: number) {
  const std = ROOM_STANDARDS[s.type];
  return strategy === 0
    ? 1
    : std
      ? Math.sqrt(std.preferred[0] * std.preferred[1]) * (s.spacious ? 1.2 : 1)
      : 6;
}
export function dimensionIssues(rooms: Room[]) {
  return rooms.flatMap((r) => {
    const std = ROOM_STANDARDS[r.type];
    return std && !meetsSize(r.w, r.d, std.minimum)
      ? [
          `${r.name} needs at least ${std.minimum.join(" × ")} ft; this arrangement gives ${round(r.w)} × ${round(r.d)} ft.`,
        ]
      : [];
  });
}
export function fixtureIssues(rooms: Room[]) {
  const required: Partial<Record<RoomType, string[]>> = {
    bedroom: ["bed"],
    master: ["bed"],
    bathroom: ["toilet", "shower"],
    kitchen: ["counter"],
    living: ["sofa"],
    theatre: ["screen", "recliner"],
    jacuzzi: ["jacuzzi"],
    parking: ["car"],
  };
  return rooms.flatMap((r) =>
    (required[r.type] ?? [])
      .filter((kind) => !r.furniture.some((f) => f.kind === kind))
      .map(
        (kind) => `${r.name}: a ${kind} cannot fit with a clear door approach.`,
      ),
  );
}
function quality(rooms: Room[]) {
  let score = 0;
  for (const r of rooms) {
    const std = ROOM_STANDARDS[r.type];
    if (std) {
      const area = r.w * r.d,
        target = std.preferred[0] * std.preferred[1];
      score += Math.min(1, area / target) * 20;
      // A huge bathroom must not outscore a properly sized bathroom plus a
      // generous living hall. Extra area has different value by room use.
      const excessPenalty =
        r.type === "bathroom"
          ? 0.2
          : r.type === "theatre"
            ? 0.05
            : r.type === "kitchen"
              ? 0.04
              : r.type === "master"
                ? 0.01
                : r.type === "living"
                  ? 0.006
                  : 0.02;
      score -= Math.max(0, area - target * 1.4) * excessPenalty;
    }
    if (r.type === "entrance") score -= r.w * r.d * 0.06;
  }
  return score;
}
function solveFloor(
  f: FloorBrief,
  b: Rect,
  sw: number,
  lw: number,
  landing: number,
  lift: boolean,
  strategy: number,
): Room[] {
  const cd = 13,
    coreW = sw + lw + (lift ? 3 : 0),
    rearW = b.w - coreW;
  const core = room(
    "stairs",
    "Staircase",
    { x: b.x, y: b.y, w: sw, d: cd },
    "e",
    0,
  );
  const fixed = [
    core,
    room(
      "entrance",
      "Stair landing",
      { x: b.x + sw, y: b.y, w: lw + (lift ? 3 : 0), d: lift ? 8 : cd },
      "n",
    ),
  ];
  if (lift) {
    fixed.push(
      room("lift", "Elevator", { x: b.x + sw, y: b.y + 8, w: lw, d: 5 }, "s"),
    );
    fixed.push(
      room(
        "entrance",
        "Core connection",
        { x: b.x + sw + lw, y: b.y + 8, w: 3, d: 5 },
        "s",
      ),
    );
  }
  const req = slots(f);
  if (f.role === "stilt") {
    if (
      req.some(
        (s) => !["parking", "entrance", "utility", "store"].includes(s.type),
      )
    )
      throw Error(
        `${f.label}: a parking floor cannot contain residential rooms. Change its floor purpose explicitly to make a mixed-use floor.`,
      );
    const parking = req.find((s) => s.type === "parking");
    if (!parking)
      throw Error(`${f.label}: describe how many parking bays you need.`);
    const bay = room(
      "parking",
      parking.count > 1 ? `${parking.count}-car parking` : "Car parking",
      { x: b.x + coreW, y: b.y, w: rearW, d: b.d },
      "s",
    );
    // Full-size cars and a separate pedestrian entry. No decorative room fillers.
    const n = parking.count;
    if (rearW < n * 8 || b.d < 18)
      throw Error(
        `${f.label}: ${n} car${n > 1 ? "s need" : " needs"} ${n * 8} × 18 ft of clear parking approach beside the stair/lift core.`,
      );
    bay.furniture = Array.from({ length: n }, (_, i) => ({
      id: uid(),
      kind: "car",
      x: (rearW - n * 8) / 2 + i * 8 + 0.9,
      y: 1,
      w: 6.2,
      d: 14.5,
      rotation: 0,
    }));
    const entry = { x: b.x, y: b.y + cd, w: coreW, d: b.d - cd };
    const services = req.filter(
      (s) => s.type !== "parking" && s.type !== "entrance",
    );
    if (services.length) {
      fixed.push(...partition(services, { ...entry, d: 5 }, "s", strategy));
      fixed.push(
        room(
          "entrance",
          "Pedestrian entry",
          { ...entry, y: entry.y + 5, d: entry.d - 5 },
          "s",
        ),
      );
    } else fixed.push(room("entrance", "Pedestrian entry", entry, "s"));
    return [...fixed, bay];
  }
  const rear = { x: b.x + coreW, y: b.y, w: rearW, d: cd };
  const front = {
    x: b.x,
    y: b.y + cd + landing,
    w: b.w,
    d: b.d - cd - landing,
  };
  fixed.push(
    room(
      "entrance",
      f.role === "terrace" ? "Terrace access" : "Lift lobby",
      { x: b.x, y: b.y + cd, w: b.w, d: landing },
      "w",
    ),
  );
  // Enumerate assignments to the side of the core versus the full-width front.
  // Rear rooms need a door into the upper landing or the lower lobby; at most 2.
  let best: Room[] | undefined,
    bestScore = -Infinity,
    closest: string[] = [];
  if (req.length > 8)
    throw Error(
      `${f.label}: this compact-house solver supports up to eight requested spaces per floor.`,
    );
  for (let mask = 0; mask < 2 ** req.length; mask++) {
    const back = req.filter((_, i) => mask & (1 << i)),
      main = req.filter((_, i) => !(mask & (1 << i)));
    if (back.length > 2 || main.length > 4 || !main.length) continue;
    let rearRooms: Room[] = [];
    if (back.length === 1) rearRooms = addSpace(back[0], rear, "w", 0);
    else if (back.length === 2) {
      // Kitchen gets 9 ft; the bathroom gets 4 ft on a compact plot. Larger
      // sites may use the alternate split and rotated minimum dimensions.
      const split = strategy === 2 ? 8 : 9;
      rearRooms = [
        ...addSpace(back[0], { ...rear, d: split }, "w", 0),
        ...addSpace(
          back[1],
          { ...rear, y: rear.y + split, d: cd - split },
          "s",
        ),
      ];
    } else
      rearRooms = [
        room(
          "entrance",
          f.role === "terrace" ? "Open terrace" : "Daylit landing",
          rear,
          "n",
        ),
      ];
    const result = [
      ...fixed,
      ...rearRooms,
      ...partition(main, front, "n", strategy),
    ];
    const issues = dimensionIssues(result);
    if (issues.length) {
      if (!closest.length || issues.length < closest.length) closest = issues;
      continue;
    }
    const score = quality(result);
    if (score > bestScore) {
      best = result;
      bestScore = score;
    }
  }
  if (!best)
    throw Error(
      `${f.label}: no arrangement meets the room-size rules. ${closest.slice(0, 2).join(" ")}`,
    );
  return best;
}
/** Transform the same buildable frame to the street side. Furniture is
 * re-authored after this transform, so its local coordinates stay meaningful. */
function orientRoom(
  r: Room,
  b: Rect,
  actual: Rect,
  facing: Project["site"]["facing"],
) {
  let x = r.x - b.x,
    y = r.y - b.y,
    w = r.w,
    d = r.d;
  if (facing === "North" || facing === "West") {
    y = b.d - y - d;
    if (r.doorSide === "n") r.doorSide = "s";
    else if (r.doorSide === "s") r.doorSide = "n";
    else r.doorOffset = 1 - r.doorOffset;
    if (r.type === "stairs") r.stairReverse = true;
    r.furniture = r.furniture.map((f) => ({ ...f, y: r.d - f.y - f.d }));
  }
  if (facing === "East" || facing === "West") {
    [x, y, w, d] = [y, x, d, w];
    r.doorSide = ({ n: "w", s: "e", e: "s", w: "n" } as const)[r.doorSide];
    // Preserve long-axis cars under the coordinate transpose.
    r.furniture = r.furniture.map((f) => ({
      ...f,
      x: f.y,
      y: f.x,
      w: f.d,
      d: f.w,
    }));
  }
  Object.assign(r, { x: actual.x + x, y: actual.y + y, w, d });
}
export function planResidence(brief: Brief): PlanningResult {
  const compact = Math.min(brief.site.width, brief.site.depth) < 25;
  const base = defaultProject();
  base.name = "Your independent house";
  base.site = {
    ...brief.site,
    setback: compact ? 1 : 2,
    front: compact ? 3 : 4,
  };
  base.requirements.vastu = "Balanced";
  base.requirements.bedrooms = brief.floors
    .flatMap((f) => f.spaces)
    .filter((s) => s.type === "bedroom" || s.type === "master")
    .reduce((a, s) => a + s.count, 0);
  const actual = buildableRect(base.site);
  const sideways = ["East", "West"].includes(base.site.facing);
  const b = {
    x: 0,
    y: 0,
    w: sideways ? actual.d : actual.w,
    d: sideways ? actual.w : actual.d,
  };
  const proposals: Proposal[] = [],
    failures = new Map<string, number>();
  let attempted = 0,
    rejected = 0;
  const assumptions = [
    ...(brief.assumptions ?? []),
    `Concept setbacks: ${base.site.setback} ft sides/rear and ${base.site.front} ft facing ${brief.site.facing}. These are editable design assumptions, not a municipal code check.`,
    "Room dimensions are nominal partition dimensions; wall thickness and construction clearances need detailed design.",
    "Parking uses straight-in access; road width and vehicle turning paths are not simulated.",
  ];
  if (brief.lift)
    assumptions.push(
      `A ${compact ? "4.5–5" : "5"} ft elevator shaft is reserved through the stack; lift stops ${brief.liftToTerrace ? "include the terrace" : "at the highest residential floor"}. Supplier clearances, pit and overhead are not engineered.`,
    );
  if (brief.floors.some((f) => f.spaces.some((s) => s.type === "jacuzzi")))
    assumptions.push(
      "Terrace jacuzzi and planted areas require structural load, drainage and waterproofing design.",
    );
  // 3 core widths × 2 shaft/landing widths × 3 lobby depths × 2 positions × 3 allocations = 108 candidates.
  for (const sw of [6.5, 7.25, 8])
    for (const lw of brief.lift ? [4.5, 5] : [3.5, 4])
      for (const landing of [3, 3.5, 4])
        for (const mirror of [false, true])
          for (const strategy of [0, 1, 2]) {
            attempted++;
            try {
              if (b.w - sw - lw < 4 || b.d - 13 - landing < 7)
                throw Error(
                  "The buildable rectangle is too small for the vertical core and habitable rooms.",
                );
              const p = structuredClone(base);
              p.variant = 0;
              p.floors = brief.floors.map((f, i) => {
                const rooms = solveFloor(
                  f,
                  b,
                  sw,
                  lw,
                  landing,
                  !!brief.lift,
                  strategy,
                );
                if (
                  f.role === "terrace" &&
                  brief.lift &&
                  !brief.liftToTerrace
                ) {
                  const shaft = rooms.find((r) => r.type === "lift")!;
                  shaft.name = "Lift overrun · no terrace stop";
                }
                for (const r of rooms) {
                  if (mirror) {
                    r.x = b.x + b.w - (r.x - b.x) - r.w;
                    if (r.doorSide === "e") r.doorSide = "w";
                    else if (r.doorSide === "w") r.doorSide = "e";
                    else r.doorOffset = 1 - r.doorOffset;
                  }
                  orientRoom(r, b, actual, base.site.facing);
                  for (const k of ["x", "y", "w", "d"] as const)
                    r[k] = round(r[k]);
                  if (!r.furniture.length) r.furniture = furnish(r);
                  if (
                    f.role === "terrace" &&
                    brief.shelter &&
                    r.type === "seating"
                  ) {
                    // Pergola is overhead, so it can cover the seating without making
                    // that entire footprint a furniture collision obstacle.
                    r.name = "Covered shelter";
                    r.furniture = [
                      {
                        id: uid(),
                        kind: "pergola",
                        x: 0.5,
                        y: 0.5,
                        w: r.w - 1,
                        d: r.d - 1,
                        rotation: 0,
                      },
                    ];
                  }
                }
                return {
                  id: uid(),
                  name: f.label,
                  height: 10,
                  role: f.role,
                  rooms,
                } satisfies Floor;
              });
              const issues = p.floors.flatMap((f) => dimensionIssues(f.rooms));
              if (issues.length) throw Error(issues[0]);
              const score = Math.round(
                p.floors.reduce((n, f) => n + quality(f.rooms), 0) /
                  p.floors.length +
                  (p.floors.reduce((n, f) => n + (vastu(p, f).score ?? 50), 0) /
                    p.floors.length) *
                    0.15,
              );
              proposals.push({
                project: p,
                score,
                notes: [
                  `Core ${sw} × 13 ft, ${landing} ft lobby; ${mirror ? "right" : "left"} side.`,
                  "Parking, public rooms, bedrooms and terrace leisure are planned by floor purpose.",
                ],
              });
            } catch (e) {
              rejected++;
              const message = (e as Error).message;
              failures.set(message, (failures.get(message) ?? 0) + 1);
            }
          }
  // Structural candidates must also pass the same geometry and walkability
  // checks used by the editor before any result reaches the user.
  const accepted: Proposal[] = [],
    seen = new Set<string>();
  for (const candidate of proposals.sort((a, b) => b.score - a.score)) {
    const p = candidate.project;
    const signature = JSON.stringify(
      p.floors.map((f) => f.rooms.map((r) => [r.type, r.x, r.y, r.w, r.d])),
    );
    if (seen.has(signature)) continue;
    seen.add(signature);
    const errors = p.floors.flatMap((f) => [
      ...validate(p, f),
      ...fixtureIssues(f.rooms),
    ]);
    if (errors.length) {
      rejected++;
      const msg = errors[0];
      failures.set(msg, (failures.get(msg) ?? 0) + 1);
      continue;
    }
    candidate.project.variant = accepted.length;
    accepted.push(candidate);
    if (accepted.length === 3) break;
  }
  return {
    proposals: accepted,
    attempted,
    rejected,
    reasons: accepted.length
      ? []
      : [...failures]
          .sort((a, b) => b[1] - a[1])
          .slice(0, 3)
          .map(([m]) => m),
    assumptions,
  };
}
