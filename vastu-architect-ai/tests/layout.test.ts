import test from "node:test";
import assert from "node:assert/strict";
import {
  defaultProject,
  validate,
  parseProject,
  doorClearance,
  floorBase,
  getWalls,
  canWalk,
  type Direction,
  type Project,
} from "../src/engine.ts";
import {
  validateBrief,
  normalizeBrief,
  bedroomCount,
  pickModel,
  type Brief,
} from "../src/brief.ts";
import {
  generateFromBrief,
  coreAligned,
  planFrame,
  SITE_TOO_SMALL,
} from "../src/layout.ts";
const sp = (
  type: string,
  count = 1,
  o: { sp?: boolean; ab?: boolean; op?: boolean } = {},
) => ({
  type,
  count,
  spacious: !!o.sp,
  attachedBath: !!o.ab,
  open: !!o.op,
});
/** The programme from the worked brief: 30 x 48 north-facing, G+2 and a roof. */
const RAW = {
  site: { width: 30, depth: 48, facing: "North" },
  floors: [
    {
      label: "Ground",
      role: "stilt",
      spaces: [sp("parking"), sp("utility")],
    },
    {
      label: "First",
      role: "residential",
      spaces: [
        sp("living", 1, { sp: true }),
        sp("bedroom"),
        sp("kitchen", 1, { op: true }),
        sp("pooja"),
        sp("bathroom"),
      ],
    },
    {
      label: "Second",
      role: "residential",
      spaces: [sp("master", 2, { sp: true, ab: true }), sp("theatre")],
    },
    {
      label: "Terrace",
      role: "terrace",
      spaces: [sp("seating"), sp("garden")],
    },
  ],
};
const site = () => {
  const base = defaultProject();
  base.site.setback = 2;
  base.site.front = 4;
  return base;
};
const brief = () => normalizeBrief(validateBrief(structuredClone(RAW)));
test("the guard rejects anything the model might return that is not a house", () => {
  for (const bad of [
    null,
    [],
    "house",
    {},
    { site: { width: 30, depth: 48, facing: "Up" }, floors: [] },
    { site: { width: 5, depth: 48, facing: "North" }, floors: [{}] },
    { site: { width: 30, depth: 48, facing: "North" }, floors: [] },
    {
      site: { width: 30, depth: 48, facing: "North" },
      floors: [{ label: "x", role: "basement", spaces: [] }],
    },
  ])
    assert.throws(() => validateBrief(bad));
});
test("the guard drops malformed spaces but keeps the sound ones", () => {
  const b = validateBrief({
    site: { width: 30, depth: 48, facing: "North" },
    floors: [
      {
        label: "First",
        role: "residential",
        spaces: [
          sp("living"),
          { type: "dungeon", count: 1 },
          { type: "bedroom", count: 99 },
          sp("kitchen"),
        ],
      },
    ],
  });
  assert.deepEqual(
    b.floors[0].spaces.map((s) => s.type),
    ["living", "kitchen"],
  );
});
test("the guard caps floors and spaces rather than trusting the model", () => {
  const many = validateBrief({
    site: { width: 40, depth: 60, facing: "East" },
    floors: Array.from({ length: 9 }, () => ({
      label: "L",
      role: "residential",
      spaces: Array.from({ length: 30 }, () => sp("bedroom")),
    })),
  });
  assert.equal(many.floors.length, 5);
  assert.ok(many.floors[0].spaces.length <= 12);
});
test("an en-suite does not also consume a shared bathroom", () => {
  // The model routinely emits both; normalisation resolves the contradiction.
  const b = normalizeBrief(
    validateBrief({
      site: { width: 30, depth: 48, facing: "North" },
      floors: [
        {
          label: "Second",
          role: "residential",
          spaces: [sp("master", 2, { ab: true }), sp("bathroom", 2)],
        },
      ],
    }),
  );
  assert.deepEqual(
    b.floors[0].spaces.map((s) => `${s.type}x${s.count}`),
    ["masterx2"],
  );
});
test("a surplus shared bathroom survives alongside en-suites", () => {
  const b = normalizeBrief(
    validateBrief({
      site: { width: 30, depth: 48, facing: "North" },
      floors: [
        {
          label: "Second",
          role: "residential",
          spaces: [sp("master", 1, { ab: true }), sp("bathroom", 2)],
        },
      ],
    }),
  );
  const bath = b.floors[0].spaces.find((s) => s.type === "bathroom");
  assert.equal(bath?.count, 1);
});
test("an empty roof is still a roof you can stand on", () => {
  const b = normalizeBrief(
    validateBrief({
      site: { width: 30, depth: 48, facing: "North" },
      floors: [{ label: "Terrace", role: "terrace", spaces: [] }],
    }),
  );
  assert.ok(b.floors[0].spaces.length);
});
test("bedrooms are counted across every floor", () => {
  assert.equal(bedroomCount(brief()), 3);
});
test("the worked brief becomes four levels with the roles it described", () => {
  const p = generateFromBrief(site(), brief(), 0);
  assert.deepEqual(
    p.floors.map((f) => f.role),
    ["stilt", "residential", "terrace"].flatMap((r) =>
      r === "residential" ? ["residential", "residential"] : [r],
    ),
  );
  assert.equal(p.floors.length, 4);
  assert.equal(p.requirements.bedrooms, 3);
  assert.doesNotThrow(() => parseProject(p));
});
test("the staircase core stacks on every level, which is what lets you climb", () => {
  for (const variant of [0, 1, 2]) {
    const p = generateFromBrief(site(), brief(), variant);
    assert.ok(coreAligned(p), `variant ${variant}`);
    for (const f of p.floors)
      assert.equal(
        f.rooms.filter((r) => r.type === "stairs").length,
        1,
        `${f.name} should have exactly one core`,
      );
  }
});
test("floors stack at the height of everything below them", () => {
  const p = generateFromBrief(site(), brief(), 0);
  assert.equal(floorBase(p, 0), 0);
  assert.equal(floorBase(p, 1), p.floors[0].height);
  assert.equal(
    floorBase(p, 3),
    p.floors[0].height + p.floors[1].height + p.floors[2].height,
  );
});
test("every generated floor is sound: no overlaps, setbacks kept, all rooms reachable", () => {
  for (const facing of ["North", "East", "South", "West"] as Direction[])
    for (const variant of [0, 1, 2]) {
      const base = site();
      const b = brief();
      b.site.facing = facing;
      const p = generateFromBrief(base, b, variant);
      for (const f of p.floors)
        assert.deepEqual(
          validate(p, f),
          [],
          `${facing} v${variant} ${f.name}`,
        );
    }
});
test("the masters keep their en-suites, opening off their own bedroom", () => {
  const p = generateFromBrief(site(), brief(), 0);
  const second = p.floors[2];
  const suites = second.rooms.filter((r) => /bath$/.test(r.name));
  assert.equal(suites.length, 2);
  for (const bath of suites) {
    const owner = second.rooms.find(
      (r) => r.name === bath.name.replace(/ bath$/, ""),
    );
    assert.ok(owner, "an en-suite belongs to a bedroom");
    // Shares a wall with the bedroom it serves.
    assert.ok(
      Math.abs(bath.y - (owner!.y + owner!.d)) < 0.02 ||
        Math.abs(bath.x - (owner!.x + owner!.w)) < 0.02,
    );
  }
});
test("open levels are not boxed in: a stilt parks cars, a roof stays open", () => {
  const p = generateFromBrief(site(), brief(), 0);
  const stilt = p.floors[0];
  assert.ok(stilt.rooms.some((r) => r.type === "parking"));
  assert.ok(
    stilt.rooms.some((r) => r.furniture.some((f) => f.kind === "car")),
    "a parking level holds cars",
  );
  const roof = p.floors[3];
  assert.equal(roof.role, "terrace");
  // A parapet rings the roof, so the walker is stopped at the edge.
  const parapet = getWalls(p, roof).filter((w) => w.top <= 3.5);
  assert.ok(parapet.length >= 4);
});
test("furniture never lands across the door it has to be reached through", () => {
  for (const facing of ["North", "East", "South", "West"] as Direction[]) {
    const b = brief();
    b.site.facing = facing;
    const p = generateFromBrief(site(), b, 0);
    for (const f of p.floors)
      for (const r of f.rooms) {
        const clear = doorClearance(r);
        for (const item of r.furniture)
          assert.ok(
            Math.min(item.x + item.w, clear.x + clear.w) -
              Math.max(item.x, clear.x) <=
              0.05 ||
              Math.min(item.y + item.d, clear.y + clear.d) -
                Math.max(item.y, clear.y) <=
                0.05,
            `${f.name}/${r.name}: ${item.kind} blocks the doorway`,
          );
      }
  }
});
test("you can stand in the core on every level", () => {
  const p = generateFromBrief(site(), brief(), 0);
  for (const f of p.floors) {
    const core = f.rooms.find((r) => r.type === "stairs")!;
    assert.ok(
      canWalk(core.x + core.w / 2, core.y + core.d / 2, p, f, getWalls(p, f)),
      `${f.name} core should be standable`,
    );
  }
});
test("variants differ while describing the same house", () => {
  const strip = (p: Project) =>
    JSON.stringify(p.floors, (k, v) => (k === "id" ? undefined : v));
  const a = generateFromBrief(site(), brief(), 0),
    b = generateFromBrief(site(), brief(), 1);
  assert.notEqual(strip(a), strip(b));
  assert.equal(a.floors.length, b.floors.length);
  // Generation is otherwise deterministic.
  assert.equal(strip(a), strip(generateFromBrief(site(), brief(), 0)));
});
test("a site with no room for a corridor and rooms is refused, not fudged", () => {
  const base = site();
  const b = brief();
  b.site.width = 16;
  b.site.depth = 20;
  assert.throws(() => generateFromBrief(base, b, 0), new RegExp("too narrow"));
  assert.ok(SITE_TOO_SMALL.includes("too narrow"));
});
test("the corridor runs the long way down the plan", () => {
  const wide = planFrame(
    { width: 60, depth: 30, facing: "North", setback: 2, front: 4 },
    0,
  );
  assert.equal(wide.axis, "h");
  const deep = planFrame(
    { width: 30, depth: 60, facing: "North", setback: 2, front: 4 },
    0,
  );
  assert.equal(deep.axis, "v");
});
test("the default model is the strongest installed, not merely the first", () => {
  assert.equal(pickModel(["llama3.2:1b", "qwen2.5:7b"]), "qwen2.5:7b");
  assert.equal(pickModel(["mistral:7b"]), "mistral:7b");
  assert.equal(pickModel([]), undefined);
});
test("a brief round-trips through the project guard unchanged", () => {
  const p = generateFromBrief(site(), brief(), 2);
  assert.deepEqual(parseProject(JSON.parse(JSON.stringify(p))), p);
});
const _unused: Brief | null = null;
void _unused;
