import test from "node:test";
import assert from "node:assert/strict";
import { planResidence } from "../src/residentialPlanner.ts";
import { ROOM_STANDARDS, meetsSize } from "../src/planningRules.ts";
import {
  validate,
  parseProject,
  canWalk,
  getWalls,
  stairHeightAt,
  type Direction,
} from "../src/engine.ts";
import {
  resetArchitecture,
  loadConversation,
  CHAT_KEY,
} from "../src/studioStorage.ts";
import type { Brief, SpaceRequest } from "../src/brief.ts";
const sp = (type: SpaceRequest["type"], count = 1): SpaceRequest => ({
  type,
  count,
  spacious: false,
  attachedBath: false,
  open: false,
});
export function userExample(
  width = 30,
  depth = 40,
  facing: Direction = "South",
): Brief {
  return {
    site: { width, depth, facing },
    lift: true,
    liftToTerrace: false,
    shelter: true,
    floors: [
      { label: "Ground", role: "stilt", spaces: [sp("parking")] },
      {
        label: "First",
        role: "residential",
        spaces: [sp("living"), sp("kitchen"), sp("bathroom")],
      },
      { label: "Second", role: "residential", spaces: [sp("bedroom", 2)] },
      {
        label: "Third",
        role: "residential",
        spaces: [sp("master"), sp("theatre")],
      },
      {
        label: "Terrace",
        role: "terrace",
        spaces: [sp("garden"), sp("jacuzzi"), sp("seating")],
      },
    ],
  };
}
test("G+3 search preserves the exact floor program, full-sized car, elevator and roof leisure", () => {
  const result = planResidence(userExample());
  assert.equal(result.attempted, 108);
  assert.equal(result.proposals.length, 3);
  for (const { project: p } of result.proposals) {
    assert.equal(p.floors.length, 5);
    assert.doesNotThrow(() => parseProject(p));
    assert.deepEqual(
      p.floors[0].rooms
        .filter((r) => !["stairs", "lift", "entrance"].includes(r.type))
        .map((r) => r.type),
      ["parking"],
    );
    assert.deepEqual(
      p.floors[1].rooms
        .filter((r) => !["stairs", "lift", "entrance"].includes(r.type))
        .map((r) => r.type)
        .sort(),
      ["bathroom", "kitchen", "living"],
    );
    assert.equal(
      p.floors[2].rooms.filter((r) => r.type === "bedroom").length,
      2,
    );
    assert.deepEqual(
      p.floors[3].rooms
        .filter((r) => !["stairs", "lift", "entrance"].includes(r.type))
        .map((r) => r.type)
        .sort(),
      ["master", "theatre"],
    );
    assert.deepEqual(
      p.floors[4].rooms
        .filter((r) => !["stairs", "lift", "entrance"].includes(r.type))
        .map((r) => r.type)
        .sort(),
      ["garden", "jacuzzi", "seating"],
    );
    assert.ok(
      p.floors[0].rooms
        .flatMap((r) => r.furniture)
        .some((f) => f.kind === "car" && f.w === 6.2 && f.d === 14.5),
    );
    for (const f of p.floors) {
      assert.deepEqual(validate(p, f), []);
      for (const r of f.rooms) {
        const s = ROOM_STANDARDS[r.type];
        if (s) assert.ok(meetsSize(r.w, r.d, s.minimum), r.name);
      }
    }
    for (const type of ["stairs", "lift"]) {
      const positions = p.floors.map((f) => {
        const r = f.rooms.find((r) => r.type === type)!;
        return [r.x, r.y, r.w, r.d, r.doorSide];
      });
      for (const pos of positions) assert.deepEqual(pos, positions[0]);
    }
    const roof = p.floors[4],
      shelter = roof.rooms.find((r) => r.type === "seating")!;
    assert.ok(shelter.furniture.some((f) => f.kind === "pergola"));
    assert.ok(
      roof.rooms
        .find((r) => r.type === "jacuzzi")!
        .furniture.some((f) => f.kind === "jacuzzi"),
    );
    const bath = p.floors[1].rooms.find((r) => r.type === "bathroom")!;
    assert.ok(bath.w * bath.d < 90);
    assert.ok(bath.furniture.some((f) => f.kind === "toilet"));
    assert.ok(bath.furniture.some((f) => f.kind === "shower"));
    assert.ok(
      canWalk(
        shelter.x + shelter.w / 2,
        shelter.y + shelter.d / 2,
        p,
        roof,
        getWalls(p, roof),
      ),
      "A pergola roof must not block the whole seating area",
    );
  }
  assert.equal(
    new Set(
      result.proposals.map((p) =>
        JSON.stringify(
          p.project.floors.map((f) => f.rooms.map((r) => [r.x, r.y, r.w, r.d])),
        ),
      ),
    ).size,
    3,
  );
});
test("20x30 G+3 is refused with a specific conflict instead of tiny invented rooms", () => {
  const b = userExample(20, 30),
    before = structuredClone(b),
    r = planResidence(b);
  assert.equal(r.proposals.length, 0);
  assert.equal(r.attempted, 108);
  assert.match(r.reasons.join(" "), /parking|needs|too small/i);
  assert.deepEqual(b, before);
});
test("parking purpose rejects residential fillers", () => {
  const b = userExample();
  b.floors[0].spaces.push(sp("bedroom"));
  const r = planResidence(b);
  assert.equal(r.proposals.length, 0);
  assert.match(
    r.reasons.join(" "),
    /parking floor cannot contain residential rooms/,
  );
});
test("extra requested spaces cannot silently disappear", () => {
  const b = userExample();
  b.floors[3].spaces.push(sp("bedroom", 6));
  const r = planResidence(b);
  assert.equal(r.proposals.length, 0);
  assert.ok(r.reasons.length);
});
test("storage reset removes only architecture-generated data and restores an empty chat", () => {
  const map = new Map<string, string>([
    ["aangan-project-v1", "old"],
    ["aangan-project-v1-recovery", "old"],
    [CHAT_KEY, "old"],
    ["unrelated-app", "keep"],
    ["material-catalogue", "keep"],
  ]);
  const storage = {
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => map.set(k, v),
    removeItem: (k: string) => map.delete(k),
  } as Storage;
  resetArchitecture(storage);
  assert.equal(map.get("unrelated-app"), "keep");
  assert.equal(map.get("material-catalogue"), "keep");
  assert.ok(!map.has("aangan-project-v1"));
  assert.ok(!map.has(CHAT_KEY));
  assert.deepEqual(loadConversation(storage).messages, []);
  assert.equal(loadConversation(storage).result, null);
});
test("core and straight parking orient to all four street facings without breaking stair arrivals", () => {
  for (const facing of ["North", "South", "East", "West"] as Direction[]) {
    const result = planResidence(userExample(40, 40, facing));
    assert.equal(result.proposals.length, 3, `${facing}: ${result.reasons}`);
    const p = result.proposals[0].project;
    for (const f of p.floors) {
      assert.deepEqual(validate(p, f), [], facing);
      const r = f.rooms.find((r) => r.type === "stairs")!;
      // A point just inside the core door is on its level arrival landing.
      const side = r.doorSide;
      const along =
        (side === "e" || side === "w" ? r.y : r.x) +
        0.5 +
        ((side === "e" || side === "w" ? r.d : r.w) - 4) * r.doorOffset +
        1.5;
      const x = side === "e" ? r.x + r.w - 1 : side === "w" ? r.x + 1 : along;
      const z = side === "s" ? r.y + r.d - 1 : side === "n" ? r.y + 1 : along;
      assert.equal(stairHeightAt(r, 10, x, z), 0, `${facing} landing`);
    }
    const parking = p.floors[0].rooms.find((r) => r.type === "parking")!;
    assert.equal(
      parking.doorSide,
      ({ North: "n", South: "s", East: "e", West: "w" } as const)[facing],
    );
  }
});
test("explicit floor lists override model-invented fillers and preserve room counts", async () => {
  const { reconcileExplicitProgram } =
    await import("../src/explicitProgram.ts");
  const b = userExample();
  b.floors[0].spaces.push(sp("store"));
  b.floors[2].spaces = [sp("bedroom", 3)];
  const fixed = reconcileExplicitProgram(
    b,
    "30x40 G+3. Ground floor: car parking, pedestrian entry and staircase. First floor: living hall, kitchen and one bathroom. Second floor: two rooms. Third floor: one master bedroom and home theatre. Elevator ground to third. Terrace: garden, jacuzzi and covered shelter.",
  );
  assert.deepEqual(fixed.floors[0].spaces.map((s) => s.type).sort(), [
    "entrance",
    "parking",
  ]);
  assert.equal(fixed.floors[2].spaces[0].count, 2);
  assert.deepEqual(
    fixed.floors[3].spaces.map((s) => s.type),
    ["master", "theatre"],
  );
  assert.equal(fixed.floors[4].spaces.length, 3);
});
