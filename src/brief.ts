import type { ProjectKind, FeatureRequest } from "./projectTypes";
/** Turns a written brief into a structured architectural program using a local
 *  Ollama model. The model is treated as untrusted: everything it returns is
 *  validated against a strict guard and then repaired by `normalizeBrief`,
 *  which owns the decisions a language model is not reliable about. */
import type { Direction, FloorRole, Project, RoomType } from "./engine";
export const OLLAMA_HOST = "/ollama";
/** Spaces a brief may ask for. `stairs` is deliberately absent: the generator
 *  always places the vertical core itself, so the model cannot forget it or
 *  put one on the terrace. */
export const briefSpaceTypes = [
  "living",
  "bedroom",
  "master",
  "kitchen",
  "bathroom",
  "pooja",
  "dining",
  "office",
  "theatre",
  "parking",
  "utility",
  "store",
  "entrance",
  "seating",
  "garden",
  "balcony",
  "jacuzzi",
] as const;
export type BriefSpaceType = (typeof briefSpaceTypes)[number];
export interface SpaceRequest {
  type: BriefSpaceType;
  count: number;
  spacious: boolean;
  attachedBath: boolean;
  open: boolean;
}
export interface FloorBrief {
  label: string;
  role: FloorRole;
  spaces: SpaceRequest[];
}
export interface Brief {
  groundParkingOnly?: boolean;
  kind?: ProjectKind;
  features?: FeatureRequest[];
  mainZoneAreaSqFt?: number;
  unitsPerFloor?: number;
  bedroomsPerUnit?: number;
  /** Every upper floor is a self-contained let rather than part of one home. */
  lettable?: boolean;
  automatic?: boolean;
  lift?: boolean;
  liftToTerrace?: boolean;
  shelter?: boolean;
  assumptions?: string[];
  site: { width: number; depth: number; facing: Direction; areaSqFt?: number; assumedShape?: boolean };
  floors: FloorBrief[];
}
export const MAX_FLOORS = 5,
  MAX_SPACES = 12,
  MAX_COUNT = 6;
/** Sent to Ollama as `format`. Every modifier is required: when they are
 *  optional the model omits them and silently drops "spacious", "master" and
 *  "attached bathroom" from the brief. */
export const briefSchema = {
  type: "object",
  properties: {
    lift: { type: "boolean" },
    liftToTerrace: { type: "boolean" },
    shelter: { type: "boolean" },
    assumptions: { type: "array", items: { type: "string" } },
    site: {
      type: "object",
      properties: {
        width: { type: "number" },
        depth: { type: "number" },
        facing: { type: "string", enum: ["North", "East", "South", "West"] },
      },
      required: ["width", "depth", "facing"],
    },
    floors: {
      type: "array",
      items: {
        type: "object",
        properties: {
          label: { type: "string" },
          role: { type: "string", enum: ["stilt", "residential", "terrace"] },
          spaces: {
            type: "array",
            items: {
              type: "object",
              properties: {
                type: { type: "string", enum: [...briefSpaceTypes] },
                count: { type: "integer" },
                spacious: { type: "boolean" },
                attachedBath: { type: "boolean" },
                open: { type: "boolean" },
              },
              required: ["type", "count", "spacious", "attachedBath", "open"],
            },
          },
        },
        required: ["label", "role", "spaces"],
      },
    },
  },
  required: [
    "site",
    "floors",
    "lift",
    "liftToTerrace",
    "shelter",
    "assumptions",
  ],
};
export const SYSTEM_PROMPT = `Extract a structured architectural program from an Indian residential design brief.

RULES:
- You interpret requirements only; never return coordinates or room sizes.
- elevator/lift => lift=true. liftToTerrace=true ONLY when explicitly asked; otherwise it stops at the top residential floor.
- jacuzzi/hot tub => jacuzzi on its requested floor. Covered shelter/pergola => shelter=true and a seating space on the terrace.
- G+3 means ground + first + second + third. A terrace above that is a FIFTH level, never a replacement for the third floor.
- "two rooms" on a sleeping floor means two bedrooms. "hall" means living.
- Preserve every explicitly requested floor, space and count. Do not drop features to make them fit.
- Missing facing defaults to South; note this in assumptions. Dimensions are in feet unless explicitly stated. Convert metres to feet.
- Keep shared bathrooms separate from attached bathrooms.
- Follow-up instructions update the supplied previous program; preserve everything else.
- Emit ONLY spaces the user asked for. Never invent rooms. Never emit stairs or a staircase: the generator adds the vertical core itself.
- Use type 'master' when the user says master bedroom or suite. Use 'bedroom' otherwise.
- spacious=true ONLY if the user said spacious/large/big about that space. Otherwise false.
- attachedBath=true only if that bedroom has an attached or en-suite bathroom. When attachedBath is true, do NOT also emit separate bathroom spaces for it.
- open=true only for an open or open-plan kitchen or living space. Otherwise false.
- count = how many of that space on that floor.
- role: 'stilt' for a parking or service ground level, 'residential' for a lived-in floor, 'terrace' for an open roof level.
- One entry per floor the user describes, in order from the ground up.

EXAMPLE: "two spacious master bedrooms with attached bathrooms and a dedicated home theatre" becomes:
[{"type":"master","count":2,"spacious":true,"attachedBath":true,"open":false},{"type":"theatre","count":1,"spacious":false,"attachedBath":false,"open":false}]`;
/** Models that follow a JSON schema well, best first; matched as a prefix so
 *  a specific tag wins over its family. A 7-8B instruct model is the sweet
 *  spot on Apple silicon with 16GB - clearly better at holding on to
 *  modifiers like "spacious" or "attached" than a 4B, and still comfortable.
 *  Anything else installed is still offered; this only picks the default. */
export const PREFERRED = [
  "qwen2.5:14b",
  "qwen2.5:7b",
  "qwen3:8b",
  "llama3.1:8b",
  "qwen3:4b",
  "qwen2.5",
  "qwen3",
  "llama3.1",
  "mistral",
  "gemma2",
  "llama3.2",
];
/** What to tell someone who has Ollama but nothing useful installed. */
export const RECOMMENDED = "qwen2.5:7b-instruct";
export async function listModels(host = OLLAMA_HOST, signal?: AbortSignal) {
  const res = await fetch(`${host}/api/tags`, { signal });
  if (!res.ok) throw Error(`Ollama answered ${res.status}.`);
  const body = (await res.json()) as { models?: { name?: unknown }[] };
  return (body.models ?? [])
    .map((m) => m.name)
    .filter((n): n is string => typeof n === "string");
}
export function pickModel(models: string[]) {
  for (const want of PREFERRED) {
    const hit = models.find((m) => m.startsWith(want));
    if (hit) return hit;
  }
  return models[0];
}
export interface OllamaStatus {
  ok: boolean;
  models: string[];
  model?: string;
  error?: string;
}
export async function checkOllama(host = OLLAMA_HOST): Promise<OllamaStatus> {
  try {
    const response=await fetch('/planning-ai/health',{signal:AbortSignal.timeout(1000)});
    if(response.ok){const status=await response.json();if(status.ready&&typeof status.model==='string')return {ok:true,models:[status.model],model:status.model};}
  }catch{}
  try {
    const models = await listModels(host, AbortSignal.timeout(5000));
    if (!models.length)
      return {
        ok: false,
        models,
        error: `Ollama is running but has no models. Run: ollama pull ${RECOMMENDED}`,
      };
    return { ok: true, models, model: pickModel(models) };
  } catch (err) {
    return {
      ok: false,
      models: [],
      error:
        (err as Error).name === "AbortError"
          ? "Cancelled."
          : `Could not reach Ollama at ${host}. Install it from ollama.com, then run: ollama serve && ollama pull ${RECOMMENDED}`,
    };
  }
}
/** Ask the local model for a program. Throws on transport, schema, or guard
 *  failure; the caller shows the message and keeps the typed brief. */
export async function extractBrief(
  text: string,
  opts: { host?: string; model?: string; signal?: AbortSignal } = {},
): Promise<Brief> {
  const host = opts.host ?? OLLAMA_HOST;
  const model = opts.model ?? pickModel(await listModels(host, opts.signal));
  if (!model) throw Error("No Ollama model is installed.");
  const res = await fetch(`${host}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    signal: opts.signal,
    body: JSON.stringify({
      model,
      stream: false,
      think: false,
      options: { temperature: 0, num_ctx: 8192, num_predict: 2200 },
      format: briefSchema,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: text.slice(0, 22000) },
      ],
    }),
  });
  if (!res.ok) throw Error(`Ollama answered ${res.status}.`);
  const body = (await res.json()) as { message?: { content?: string } };
  const content = body.message?.content;
  if (typeof content !== "string" || !content.trim())
    throw Error("The model returned nothing to read.");
  let raw: unknown;
  try {
    raw = JSON.parse(content);
  } catch {
    throw Error("The model did not return valid JSON. Try again.");
  }
  const parsed = validateBrief(raw);
  const original = raw as Brief;
  if (
    original.floors.length !== parsed.floors.length ||
    original.floors.some(
      (f, i) => f.spaces.length !== parsed.floors[i].spaces.length,
    )
  )
    throw Error(
      "The model returned unsupported or excessive spaces. Please clarify your floor program; no rooms have been silently discarded.",
    );
  return parsed;
}
/** Strict guard over model output, in the same spirit as `parseProject`. */
export function validateBrief(raw: unknown): Brief {
  const b = raw as Brief;
  const num = (v: unknown, min: number, max: number) =>
    typeof v === "number" && Number.isFinite(v) && v >= min && v <= max;
  if (!b || typeof b !== "object" || Array.isArray(b))
    throw Error("The model did not describe a house.");
  if (
    !b.site ||
    !num(b.site.width, 15, 150) ||
    !num(b.site.depth, 15, 150) ||
    !["North", "East", "South", "West"].includes(b.site.facing)
  )
    throw Error("The site dimensions or facing could not be read.");
  if (!Array.isArray(b.floors) || !b.floors.length)
    throw Error("No floors were described.");
  const floors: FloorBrief[] = [];
  for (const f of b.floors.slice(0, MAX_FLOORS)) {
    if (
      !f ||
      typeof f.label !== "string" ||
      f.label.length > 60 ||
      !["stilt", "residential", "terrace"].includes(f.role) ||
      !Array.isArray(f.spaces)
    )
      throw Error("A floor in the program is malformed.");
    const spaces: SpaceRequest[] = [];
    for (const s of f.spaces.slice(0, MAX_SPACES)) {
      if (
        !s ||
        !(briefSpaceTypes as readonly string[]).includes(s.type) ||
        !num(s.count, 1, MAX_COUNT) ||
        !Number.isInteger(s.count)
      )
        continue;
      spaces.push({
        type: s.type,
        count: s.count,
        spacious: s.spacious === true,
        attachedBath: s.attachedBath === true,
        open: s.open === true,
      });
    }
    floors.push({ label: f.label.slice(0, 60), role: f.role, spaces });
  }
  return {
    site: { ...b.site },
    floors,
    lift: b.lift === true,
    liftToTerrace: b.liftToTerrace === true,
    shelter: b.shelter === true,
    assumptions: Array.isArray(b.assumptions)
      ? b.assumptions
          .filter((x): x is string => typeof x === "string")
          .slice(0, 12)
      : [],
  };
}
const BEDS: BriefSpaceType[] = ["bedroom", "master"];
/** Repairs the model is not reliable enough to be trusted with. Structural
 *  necessities are added, contradictions are resolved, and nothing else is
 *  invented: a room the user did not ask for does not appear here. */
export function normalizeBrief(brief: Brief): Brief {
  const floors = brief.floors.map((f) => {
    let spaces = f.spaces.filter((s) => s.count > 0);
    // A bedroom with an attached bath does not also consume a shared one, but
    // the model often emits both. Keep only the surplus shared bathrooms.
    const attached = spaces
      .filter((s) => BEDS.includes(s.type) && s.attachedBath)
      .reduce((n, s) => n + s.count, 0);
    if (attached)
      spaces = spaces.flatMap((s) => {
        if (s.type !== "bathroom") return [s];
        const keep = s.count - attached;
        return keep > 0 ? [{ ...s, count: keep }] : [];
      });
    // Merge duplicate requests for the same space with the same modifiers.
    const merged: SpaceRequest[] = [];
    for (const s of spaces) {
      const same = merged.find(
        (m) =>
          m.type === s.type &&
          m.spacious === s.spacious &&
          m.attachedBath === s.attachedBath &&
          m.open === s.open,
      );
      if (same) same.count = Math.min(MAX_COUNT, same.count + s.count);
      else merged.push({ ...s });
    }
    // An open roof with nothing on it is still a roof you can stand on.
    if (f.role === "terrace" && !merged.length)
      merged.push({
        type: "seating",
        count: 1,
        spacious: false,
        attachedBath: false,
        open: true,
      });
    return { ...f, spaces: merged };
  });
  // A house needs somewhere to live. If the model only produced service
  // levels, the last one becomes residential rather than failing outright.
  if (!floors.some((f) => f.role === "residential")) {
    const last = floors[floors.length - 1];
    if (last) last.role = "residential";
  }
  return { site: { ...brief.site }, floors };
}
/** Total sleeping rooms across the program, for `requirements.bedrooms`. */
export function bedroomCount(brief: Brief) {
  return Math.max(
    1,
    Math.min(
      8,
      brief.floors.reduce(
        (n, f) =>
          n +
          f.spaces
            .filter((s) => BEDS.includes(s.type))
            .reduce((a, s) => a + s.count, 0),
        0,
      ),
    ),
  );
}
/** A short, readable echo of what was understood, shown in the chat. */
export function describeBrief(brief: Brief) {
  if(brief.kind==='resort')return [{label:'Resort site program',role:'residential' as const,detail:(brief.features??[]).map(f=>`${f.excluded?'Excluded: ':''}${f.count??''} ${f.kind}${f.source==='default'?' (assumed)':''}`).join(', ')}];
  if(brief.kind==='apartment')return brief.floors.map(f=>({label:f.label,role:f.role,detail:f.role==='stilt'?'Parking and shared core':`${brief.unitsPerFloor} apartments, ${brief.bedroomsPerUnit} bedrooms per apartment, private kitchens/bathrooms and shared access`}));
  return brief.floors.map((f) => ({
    label: f.label,
    role: f.role,
    detail: f.spaces.length
      ? f.spaces
          .map(
            (s) =>
              `${s.count > 1 ? `${s.count} × ` : ""}${label(s)}` +
              [
                s.spacious && "spacious",
                s.attachedBath && "attached bath",
                s.open && "open",
              ]
                .filter(Boolean)
                .reduce((a, t, i) => a + (i ? ", " : " · ") + t, ""),
          )
          .join(", ")
      : "open level",
  }));
}
export function label(s: { type: BriefSpaceType }) {
  return (
    (
      {
        master: "master bedroom",
        theatre: "home theatre",
        pooja: "pooja room",
        seating: "seating area",
        garden: "landscaping",
        living: "living hall",
      } as Partial<Record<BriefSpaceType, string>>
    )[s.type] ?? s.type
  );
}
/** Merge a brief into a project's site and requirements, leaving the caller
 *  to generate the floors. */
export function applyBrief(base: Project, brief: Brief): Project {
  const p = structuredClone(base);
  p.site.width = brief.site.width;
  p.site.depth = brief.site.depth;
  p.site.facing = brief.site.facing;
  p.requirements.bedrooms = bedroomCount(brief);
  return p;
}
