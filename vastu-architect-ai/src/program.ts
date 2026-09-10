import { extractBrief, type Brief } from "./brief";
import { reconcileExplicitProgram } from "./explicitProgram";
const references = import.meta.glob("../knowledge/**/*.{md,json}", {
  query: "?raw",
  import: "default",
  eager: true,
}) as Record<string, string>;
/** Small bundled reference retrieval; no embedding service or external API. */
export function retrieveReferences(text: string) {
  const words = new Set(text.toLowerCase().match(/[a-z0-9]+/g) ?? []);
  return Object.entries(references)
    .map(([path, content]) => ({
      path,
      content,
      score: [...words].filter(
        (w) => w.length > 3 && content.toLowerCase().includes(w),
      ).length,
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 3);
}
export function dimensions(text: string) {
  const m = [
    ...text.matchAll(
      /\b(\d{2,3}(?:\.\d+)?)\s*(?:x|×|by|[-–])\s*(\d{2,3}(?:\.\d+)?)\b/gi,
    ),
  ].at(-1);
  return m ? { width: Number(m[1]), depth: Number(m[2]) } : null;
}
export async function understand(
  text: string,
  previous: Brief | null,
  model: string,
  signal: AbortSignal,
): Promise<Brief> {
  const size = dimensions(text);
  // Exact dimension-only edits do not need a probabilistic reinterpretation.
  if (
    previous &&
    size &&
    !/\b(floor|room|kitchen|bath|parking|terrace|lift|elevator|north|east|west|south)\b/i.test(
      text,
    )
  )
    return {
      ...structuredClone(previous),
      site: { ...previous.site, ...size },
    };
  if (!previous && !size)
    throw Error(
      "What are the plot dimensions? For example, “30 × 40 feet”. Include the purpose of each floor so I can plan your house.",
    );
  const refs = retrieveReferences(text);
  const prompt = `Reference guidance (never replace the user requirements):\n${refs
    .map((r) => r.content)
    .join("\n")
    .slice(
      0,
      4500,
    )}\n${previous ? `Previous program to update: ${JSON.stringify(previous)}\n` : ""}USER REQUEST:\n${text}`;
  let b = await extractBrief(prompt, { model, signal });
  if (!previous) b = reconcileExplicitProgram(b, text);
  if (size) b.site = { ...b.site, ...size };
  // Catch consequential omissions independently of the model's confidence.
  if (
    /\b(lift|elevator)\b/i.test(text) &&
    !/\b(no|without|remove)\s+(?:an?\s+|the\s+)?(?:lift|elevator)\b/i.test(
      text,
    ) &&
    !b.lift
  )
    throw Error(
      "The local model missed your elevator. Please send the requirement again; I have not generated an incomplete plan.",
    );
  if (
    /\b(jacuzzi|hot tub)\b/i.test(text) &&
    !/\b(remove|no|without)\s+(?:the\s+)?(?:jacuzzi|hot tub)\b/i.test(text) &&
    !b.floors.some((f) => f.spaces.some((s) => s.type === "jacuzzi"))
  )
    throw Error(
      "The local model missed the jacuzzi. Please retry; your complete requirement must survive parsing.",
    );
  const g = text.match(/\bg\s*(?:\+|plus)\s*(\d|one|two|three)\b/i);
  if (g) {
    const upper =
      Number(g[1]) ||
      ({ one: 1, two: 2, three: 3 } as Record<string, number>)[
        g[1].toLowerCase()
      ];
    if (b.floors.filter((f) => f.role !== "terrace").length !== upper + 1)
      throw Error(
        `G+${upper} needs ${upper + 1} occupied floors. Describe any missing floors; I will not invent their rooms.`,
      );
  }
  if (!/\b(north|south|east|west)\b/i.test(text) && !previous)
    b.assumptions = [
      ...(b.assumptions ?? []),
      "South-facing street assumed; tell me the facing to change it.",
    ];
  if (b.floors.some((f) => !f.spaces.length))
    throw Error(
      "One of the floors has no purpose yet. Tell me what should go on each floor.",
    );
  return b;
}
