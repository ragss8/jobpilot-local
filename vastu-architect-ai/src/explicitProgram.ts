import type { Brief, BriefSpaceType, SpaceRequest } from "./brief";
/** An independent check for explicit floor lists. This protects precise briefs
 * from model-added rooms; prose without clear floor headings stays with Qwen. */
const patterns: Partial<Record<BriefSpaceType, string>> = {
  master: "master(?:\\s+(?:bed\\s*rooms?|rooms?))?",
  bedroom: "bed\\s*rooms?",
  living: "living(?:\\s+(?:rooms?|halls?))?|halls?",
  kitchen: "kitchens?",
  bathroom: "bath\\s*rooms?|toilets?",
  dining: "dining(?:\\s+(?:rooms?|areas?))?",
  pooja: "pooja(?:\\s+rooms?)?|puja(?:\\s+rooms?)?",
  office: "offices?|stud(?:y|ies)",
  theatre: "(?:home\\s+)?theat(?:er|re)s?|cinema",
  parking: "(?:car\\s+)?parking|car\\s+bays?",
  utility: "utilit(?:y|ies)|laundry",
  store: "store(?:\\s+rooms?)?|storage",
  entrance: "(?:pedestrian\\s+)?entr(?:y|ance)",
  seating: "(?:covered\\s+)?shelter|pergola|seating(?:\\s+area)?",
  garden: "(?:terrace\\s+)?gardens?",
  jacuzzi: "jacuzzi|hot\\s+tub",
  balcony: "balcon(?:y|ies)",
};
const countWords: Record<string, number> = {
  a: 1,
  an: 1,
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
};
const labels = ["Ground", "First", "Second", "Third", "Fourth", "Terrace"];
export function explicitFloorSpaces(text: string): Map<string, SpaceRequest[]> {
  const result = new Map<string, SpaceRequest[]>();
  const headings = [
    ...text.matchAll(
      /\b(ground|first|second|third|fourth|terrace)(?:\s+floor)?\s*(?::|should\s+have|will\s+have|has\b)/gi,
    ),
  ];
  for (let i = 0; i < headings.length; i++) {
    const h = headings[i],
      key = h[1].toLowerCase();
    let body = text
      .slice(h.index! + h[0].length, headings[i + 1]?.index ?? text.length)
      .toLowerCase();
    // Attached/shared bathroom scope needs the model's full language parse.
    if (/\b(?:attached|en[- ]?suite)\b/.test(body)) continue;
    // Unqualified counted "rooms" on a sleeping floor means bedrooms.
    body = body.replace(
      /\b(one|two|three|four|five|six|[1-6])\s+rooms\b/g,
      "$1 bedrooms",
    );
    const spaces: SpaceRequest[] = [];
    // Match master before bedroom so a master is not counted twice.
    for (const [type, pattern] of Object.entries(patterns)) {
      const re = new RegExp(
        `\\b(?:(one|two|three|four|five|six|[1-6]|a|an)\\s+)?(?:spacious\\s+|large\\s+|big\\s+)?(?:${pattern})\\b`,
        "gi",
      );
      const matches = [...body.matchAll(re)];
      if (!matches.length) continue;
      const attached =
        (type === "bedroom" || type === "master") &&
        /attached|en[- ]?suite/.test(body);
      spaces.push({
        type: type as BriefSpaceType,
        count: matches.reduce(
          (n, m) => n + (Number(m[1]) || countWords[m[1]] || 1),
          0,
        ),
        spacious: matches.some((m) => /spacious|large|big/.test(m[0])),
        attachedBath: attached,
        open:
          ["garden", "seating", "parking"].includes(type) ||
          (/\bopen(?:[- ]plan)?\s+kitchen\b/.test(body) && type === "kitchen"),
      });
      if (type === "master") body = body.replace(re, "");
    }
    if (spaces.length) result.set(key, spaces);
  }
  return result;
}
export function reconcileExplicitProgram(b: Brief, text: string): Brief {
  const explicit = explicitFloorSpaces(text);
  // Partial changes such as "first floor: add a bathroom" are updates, not
  // replacements. Only reconcile complete programs with a ground floor.
  if (!explicit.has("ground") || explicit.size < 2) return b;
  const next = structuredClone(b);
  for (let i = 0; i < next.floors.length; i++) {
    const f = next.floors[i],
      key = f.role === "terrace" ? "terrace" : labels[i]?.toLowerCase();
    const spaces = explicit.get(key);
    if (spaces) {
      f.spaces = spaces;
      f.label = labels.find((l) => l.toLowerCase() === key) ?? f.label;
    }
  }
  return next;
}
