import { readFileSync, writeFileSync } from "node:fs";
import { planResidence } from "../src/residentialPlanner.ts";
const c = JSON.parse(readFileSync("artifacts/live-conversation.json", "utf8"));
c.result = planResidence(c.brief);
c.choice = 0;
if (c.result.proposals.length !== 3)
  throw Error(JSON.stringify(c.result.reasons));
writeFileSync("artifacts/studio-fixture.json", JSON.stringify(c));
for (const f of c.result.proposals[0].project.floors)
  console.log(
    f.name,
    f.rooms
      .filter((r) => !["stairs", "lift", "entrance"].includes(r.type))
      .map((r) => `${r.name}: ${r.w} x ${r.d}`),
  );
