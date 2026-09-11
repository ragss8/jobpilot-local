import test from "node:test";
import assert from "node:assert/strict";
import { buildProgram, unitSpaces, buildablePlate } from "../src/autoProgram.ts";
import { planProject, planningIssues } from "../src/planner.ts";
import {
  detectLettable,
  inferResidentialKind,
} from "../src/requestContext.ts";
const brief = (text: string) => buildProgram(text, null);
test("a terse brief needs no project-type word to be understood", () => {
  // "G+3 with rental units, 30x40 plot" names no building type at all.
  const b = brief("G+3 with rental units, 30x40 plot");
  assert.equal(b.kind, "house");
  assert.equal(b.floors.length, 4);
  assert.equal(inferResidentialKind("G+3 with rental units, 30x40 plot"), "house");
  // Repeated units per floor is a different topology and stays an apartment.
  assert.equal(
    inferResidentialKind("6 floors with 3 units per floor"),
    "apartment",
  );
  // An unrecognised use is still refused rather than guessed at.
  assert.equal(inferResidentialKind("a hospital on 2 acres"), undefined);
});
test("lettable language is recognised, including the Indian term for it", () => {
  for (const phrase of [
    "with rental units",
    "I want to rent out the upper floors",
    "two portions to let out",
    "for tenants",
    "lettable floors",
  ])
    assert.ok(detectLettable(phrase), phrase);
  assert.equal(detectLettable("a family house with a home theatre"), false);
});
test("every let is self-contained: its own kitchen and bathroom on each floor", () => {
  const b = brief("Design a G+3 house on a 30 x 40 ft plot with rental units");
  assert.equal(b.lettable, true);
  assert.equal(b.floors[0].role, "stilt");
  const upper = b.floors.filter((f) => f.role === "residential");
  assert.equal(upper.length, 3);
  for (const f of upper) {
    const types = f.spaces.map((s) => s.type);
    for (const need of ["kitchen", "bathroom", "bedroom"])
      assert.ok(types.includes(need), `${f.label} needs its own ${need}`);
  }
});
test("G+4 is planned, and a fifth upper floor is still refused", () => {
  const b = brief("Design a G+4 house on a 30 x 40 ft plot with rental units");
  assert.equal(b.floors.length, 5);
  assert.throws(
    () => brief("Design a G+6 house on a 30 x 40 ft plot with rental units"),
    /G\+4/,
  );
});
test("the unit follows the plot's width, because rooms front the landing", () => {
  // Depth cannot buy a bedroom the width has no room to front.
  const beds = (w: number, d: number) =>
    unitSpaces(w, d).find((s) => s.type === "bedroom")!.count;
  assert.equal(beds(30, 40), 1);
  assert.equal(beds(30, 50), 1, "a deeper 30 ft plot is still 30 ft wide");
  assert.ok(beds(32, 40) >= 2, "a wider plot earns another bedroom");
  assert.ok(beds(50, 70) >= beds(32, 40));
  const plate = buildablePlate(30, 40);
  assert.deepEqual(plate, { w: 26, d: 34 });
});
test("a rental brief plans on every facing, at a range of sizes", () => {
  for (const facing of ["north", "south", "east", "west"])
    for (const [w, d] of [
      [30, 40],
      [32, 40],
      [40, 60],
      [50, 70],
    ] as [number, number][]) {
      const b = brief(
        `Design a G+3 ${facing}-facing house on a ${w} x ${d} ft plot with rental units`,
      );
      const r = planProject(b);
      assert.ok(
        r.proposals.length,
        `${facing} ${w}x${d}: ${[...new Set(r.reasons)][0] ?? "no proposals"}`,
      );
      const p = r.proposals[0].project;
      for (const f of p.floors)
        assert.deepEqual(planningIssues(p, f), [], `${facing} ${w}x${d} ${f.name}`);
    }
});
test("a unit that will not fit is stepped down, and the change is disclosed", () => {
  // Ask for more bedrooms than a 30 ft plate can seat beside the landing.
  const b = brief("Design a G+2 house on a 30 x 40 ft plot with rental units");
  for (const f of b.floors)
    for (const s of f.spaces) if (s.type === "bedroom") s.count = 3;
  const r = planProject(b);
  assert.ok(r.proposals.length, "a smaller unit should still be found");
  assert.ok(
    r.assumptions.some((a) => /did not fit this plate/.test(a)),
    "the step-down has to be stated, not silent",
  );
  // What was drawn is what gets described and remembered.
  assert.ok(r.brief, "the planned program is reported back");
  const beds = Math.max(
    ...r.brief!.floors.flatMap((f) =>
      f.spaces.filter((s) => s.type === "bedroom").map((s) => s.count),
    ),
  );
  assert.ok(beds < 3, `stepped down to ${beds} bedrooms`);
});
test("an explicitly requested program is never quietly shrunk", () => {
  // Only automatic lettable programs step down. A program the person stated
  // must fail loudly instead of losing rooms behind their back.
  const stated = brief(
    "Design a G+3 house on a 30 x 40 ft plot with rental units",
  );
  stated.automatic = false;
  const r = planProject(stated);
  assert.ok(
    !r.assumptions.some((a) => /did not fit this plate/.test(a)),
    "a stated program must not be stepped down",
  );
  // The same brief, left automatic, is allowed to adapt.
  const auto = brief(
    "Design a G+3 east-facing house on a 30 x 40 ft plot with rental units",
  );
  assert.equal(auto.automatic, true);
  assert.ok(planProject(auto).proposals.length);
});

test("a plot entered from its long side is still planned", () => {
  // Approached from the east, a 30 x 40 ft plot gives only 24 ft back from
  // the road; a core band across the top would leave 8 ft for the rooms.
  // The frame is solved transposed instead, putting the core along the side.
  for (const facing of ["east", "west"])
    for (const g of [1, 2, 3]) {
      const b = brief(
        `Design a G+${g} ${facing}-facing house on a 30 x 40 ft plot with 3 bedrooms`,
      );
      const r = planProject(b);
      assert.ok(r.proposals.length, `${facing} G+${g}`);
      const p = r.proposals[0].project;
      for (const f of p.floors)
        assert.deepEqual(planningIssues(p, f), [], `${facing} G+${g} ${f.name}`);
      // The core still stacks, which is what lets the stairs work.
      const cores = p.floors.map((f) => f.rooms.find((x) => x.type === "stairs")!);
      for (const c of cores.slice(1)) {
        assert.ok(Math.abs(c.x - cores[0].x) < 0.02);
        assert.ok(Math.abs(c.y - cores[0].y) < 0.02);
      }
    }
});
test("rooms asked for are placed on floors, and the counts are kept exactly", () => {
  const b = brief(
    "Design a G+2 house on a 40 x 60 ft plot with 4 bedrooms and 3 bathrooms",
  );
  const total = (type: string) =>
    b.floors.reduce(
      (n, f) => n + f.spaces.filter((s) => s.type === type).reduce((a, s) => a + s.count, 0),
      0,
    );
  assert.equal(total("bedroom"), 4);
  assert.equal(total("bathroom"), 3);
  // Nobody had to say which floor: sleeping rooms went up, shared rooms stayed.
  const live = b.floors.find((f) => f.spaces.some((s) => s.type === "living"))!;
  assert.ok(live.spaces.some((s) => s.type === "kitchen"));
  assert.ok(!live.spaces.some((s) => s.type === "bedroom"));
  assert.ok(planProject(b).proposals.length);
});
test("a house brief with rooms but no floors is no longer bounced back", () => {
  // This used to demand "Specify the floor for: bedroom".
  const r = planProject(
    brief("Design a G+2 house on a 40 x 60 ft plot with 3 bedrooms"),
  );
  assert.ok(r.proposals.length);
});
test("apartment units come from what the plate can serve", () => {
  const wide = brief("Design a 4 storey apartment building on a 100 x 150 ft plot");
  assert.ok(wide.unitsPerFloor! >= 2);
  assert.ok(planProject(wide).proposals.length);
  const modest = brief("Design a 4 storey apartment building on a 60 x 90 ft plot");
  assert.equal(modest.unitsPerFloor, 2);
  assert.ok(planProject(modest).proposals.length);
  // A plate that cannot take a corridor building says so, and says what will.
  assert.throws(
    () => brief("Design a 4 storey apartment building on a 40 x 60 ft plot"),
    /rental units/,
  );
});
