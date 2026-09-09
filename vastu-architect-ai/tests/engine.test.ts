import test from "node:test";
import assert from "node:assert/strict";
import {
  defaultProject,
  generate,
  getWalls,
  getOpenings,
  validate,
  vastu,
  canWalk,
  parseBrief,
  parseProject,
  furnitureBounds,
  type Direction,
} from "../src/engine.ts";
test("generated options fit site, do not overlap, and provide requested bedrooms", () => {
  for (const facing of ["North", "South", "East", "West"] as Direction[])
    for (const bedrooms of [1, 2, 3, 4])
      for (const variant of [0, 1, 2]) {
        const base = defaultProject();
        base.site.facing = facing;
        base.requirements.bedrooms = bedrooms;
        const p = generate(base, variant),
          f = p.floors[0];
        assert.equal(
          f.rooms.filter((r) => ["bedroom", "master"].includes(r.type)).length,
          bedrooms,
        );
        assert.equal(f.rooms.filter((r) => r.type === "master").length, 1);
        assert.deepEqual(
          validate(p, f).filter(
            (s) => s.includes("overlaps") || s.includes("setback"),
          ),
          [],
        );
        assert.doesNotThrow(() => parseProject(p));
      }
});
test("default concept has no geometric validation warnings", () => {
  const p = defaultProject();
  assert.deepEqual(validate(p, p.floors[0]), []);
});
test("geometry is deterministic apart from entity IDs", () => {
  const base = defaultProject();
  const strip = (p: unknown) =>
    JSON.parse(JSON.stringify(p, (k, v) => (k === "id" ? undefined : v)));
  assert.deepEqual(strip(generate(base, 1)), strip(generate(base, 1)));
  assert.notDeepEqual(strip(generate(base, 0)), strip(generate(base, 1)));
});
test("infeasible sites are rejected", () => {
  const p = defaultProject();
  p.site.width = 20;
  assert.throws(() => generate(p), /buildable area/);
});
test("doors are actual navigable holes with lintels above", () => {
  const p = defaultProject(),
    f = p.floors[0],
    walls = getWalls(p, f);
  for (const o of getOpenings(p, f).filter((o) => o.kind === "door")) {
    const mid = (o.start + o.end) / 2;
    assert.ok(
      !walls.some(
        (w) =>
          w.axis === o.axis &&
          Math.abs(w.fixed - o.fixed) < 0.02 &&
          mid > w.start &&
          mid < w.end &&
          w.bottom < 5.5,
      ),
    );
    assert.ok(
      walls.some(
        (w) =>
          w.axis === o.axis &&
          Math.abs(w.fixed - o.fixed) < 0.02 &&
          mid > w.start &&
          mid < w.end &&
          w.bottom === 7,
      ),
    );
  }
});
test("walk collision permits passage and blocks solid walls and furniture", () => {
  const p = defaultProject(),
    f = p.floors[0],
    walls = getWalls(p, f),
    hall = f.rooms.find((r) => r.type === "hall")!,
    bed = f.rooms[0];
  assert.ok(canWalk(hall.x + hall.w / 2, hall.y + hall.d - 2, p, f, walls));
  assert.equal(canWalk(bed.x, bed.y + 1, p, f, walls), false);
  assert.equal(
    canWalk(
      bed.x + bed.furniture[0].x + 2,
      bed.y + bed.furniture[0].y + 2,
      p,
      f,
      walls,
    ),
    false,
  );
  assert.equal(canWalk(-1, 5, p, f, walls), false);
});
test("overlaps and out-of-bounds furniture are explained", () => {
  const p = defaultProject(),
    f = p.floors[0];
  f.rooms[0].x += 3;
  f.rooms[0].furniture[0].x = 100;
  const issues = validate(p, f);
  assert.ok(issues.some((s) => s.includes("overlaps")));
  assert.ok(issues.some((s) => s.includes("needs more room")));
});
test("rotated furniture bounds rotate around its center", () => {
  assert.deepEqual(
    furnitureBounds({
      id: "x",
      kind: "bed",
      x: 1,
      y: 2,
      w: 4,
      d: 6,
      rotation: 90,
    }),
    { x: 0, y: 3, w: 6, d: 4 },
  );
});
test("Vastu score is derived from placements; off mode does not invent a score", () => {
  const p = defaultProject(),
    f = p.floors[0];
  const a = vastu(p, f);
  assert.equal(
    a.score,
    Math.round((a.checks.filter((c) => c.ok).length / a.checks.length) * 100),
  );
  p.requirements.vastu = "Off";
  assert.equal(vastu(p, f).score, null);
});
test("keyword parsing is bounded and leaves unspecified values alone", () => {
  const p = parseBrief("35x50 east-facing 4 BHK, 95 lakh", defaultProject());
  assert.equal(p.site.width, 35);
  assert.equal(p.site.depth, 50);
  assert.equal(p.site.facing, "East");
  assert.equal(p.requirements.bedrooms, 4);
  assert.equal(p.requirements.budget, 95);
});
test("import round-trips and rejects malformed or excessive data", () => {
  const p = defaultProject();
  assert.deepEqual(parseProject(JSON.parse(JSON.stringify(p))), p);
  for (const bad of [
    null,
    {},
    [],
    { ...p, version: 3 },
    { ...p, wallThickness: NaN },
    { ...p, floors: [] },
  ])
    assert.throws(() => parseProject(bad));
  const copy = structuredClone(p);
  copy.floors[0].rooms[0].id = copy.floors[0].id;
  assert.throws(() => parseProject(copy), /unique/);
});

test("manually overlapping furniture is reported", () => {
  const p = defaultProject(),
    f = p.floors[0],
    r = f.rooms[0];
  r.furniture.push({ ...r.furniture[0], id: "overlapping-bed" });
  assert.ok(validate(p, f).some((s) => s.includes("bed overlaps bed")));
});
