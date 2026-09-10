import { lazy, Suspense, useEffect, useRef, useState } from "react";
import {
  ArrowUp,
  ArrowUpRight,
  Box,
  Download,
  Footprints,
  House,
  Layers,
  LoaderCircle,
  MessageSquare,
  Plus,
  Ruler,
  Square,
  Undo2,
} from "lucide-react";
import Plan from "./Plan";
import { SIDES, elevationSvg } from "./elevation";
import { checkOllama, describeBrief, type OllamaStatus } from "./brief";
import { understand } from "./program";
import {
  planResidence,
  dimensionIssues,
  fixtureIssues,
} from "./residentialPlanner";
import {
  CHAT_KEY,
  emptyConversation,
  loadConversation,
  resetArchitecture,
  type Conversation,
} from "./studioStorage";
import {
  parseProject,
  validate,
  type Project,
  type Room,
  type Material,
  type Direction,
} from "./engine";
const Viewer = lazy(() => import("./Viewer"));
const EXAMPLE =
  "I have a 30 × 40 ft plot and want a G+3 independent house. Ground floor: car parking, pedestrian entry and staircase. First floor: living hall, kitchen and one bathroom. Second floor: two bedrooms. Third floor: one master bedroom and a home theatre. Elevator from ground to third floor. Terrace: garden, jacuzzi and a covered shelter.";
function download(name: string, body: string, type = "application/json") {
  const url = URL.createObjectURL(new Blob([body], { type })),
    a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export default function Studio() {
  const [state, setState] = useState<Conversation>(() => {
    try {
      return loadConversation(localStorage);
    } catch {
      return emptyConversation();
    }
  });
  const [text, setText] = useState(""),
    [busy, setBusy] = useState(""),
    [storageError, setStorageError] = useState("");
  const [ai, setAI] = useState<OllamaStatus | null>(null),
    [level, setLevel] = useState(0),
    [mode, setMode] = useState<"2d" | "3d" | "walk" | "elev">("2d");
  const [selected, setSelected] = useState<string | null>(null),
    [side, setSide] = useState<Direction>("South"),
    [history, setHistory] = useState<Project[]>([]);
  const abort = useRef<AbortController | null>(null),
    end = useRef<HTMLDivElement>(null),
    input = useRef<HTMLTextAreaElement>(null);
  const [showProgram, setShowProgram] = useState(false);
  const project = state.result?.proposals[state.choice]?.project ?? null;
  const floor = project?.floors[Math.min(level, project.floors.length - 1)];
  const room = floor?.rooms.find((r) => r.id === selected);
  useEffect(() => {
    checkOllama().then(setAI);
    return () => abort.current?.abort();
  }, []);
  useEffect(() => {
    try {
      if (state.messages.length)
        localStorage.setItem(CHAT_KEY, JSON.stringify(state));
      else localStorage.removeItem(CHAT_KEY);
      setStorageError("");
    } catch {
      setStorageError(
        "Browser storage is unavailable or full. Export your design to keep a copy.",
      );
    }
  }, [state]);
  useEffect(() => {
    end.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [state.messages, busy]);
  function fresh() {
    abort.current?.abort();
    abort.current = null;
    setBusy("");
    try {
      resetArchitecture(localStorage);
    } catch {}
    setState(emptyConversation());
    setText("");
    setLevel(0);
    setSelected(null);
    setHistory([]);
    setMode("2d");
  }
  async function submit() {
    if (!text.trim() || busy) return;
    const message = text.trim(),
      previous = state.brief;
    const messages = [
      ...state.messages,
      { role: "user" as const, text: message },
    ];
    setState((s) => ({ ...s, messages }));
    setText("");
    setBusy("Understanding your floor-by-floor brief…");
    const controller = new AbortController();
    abort.current = controller;
    const timer = setTimeout(() => controller.abort(), 120000);
    try {
      const status = ai?.ok ? ai : await checkOllama();
      setAI(status);
      if (!status.ok || !status.model)
        throw Error(
          "The local language model is unavailable. Start Ollama with an installed model, then send your brief again. Your message is kept here.",
        );
      const request = previous
        ? message
        : messages
            .filter((m) => m.role === "user")
            .map((m) => m.text)
            .join("\nThen: ");
      const brief = await understand(
        request,
        previous,
        status.model,
        controller.signal,
      );
      if (controller.signal.aborted) return;
      setBusy("Testing 108 arrangements against the planning rules…");
      await new Promise((resolve) => setTimeout(resolve, 30));
      if (controller.signal.aborted) return;
      const result = planResidence(brief);
      const response = result.proposals.length
        ? `I found ${result.proposals.length} valid concepts from ${result.attempted} arrangements for your ${brief.site.width} × ${brief.site.depth} ft site.\n\n${describeBrief(
            brief,
          )
            .map((f) => `${f.label}: ${f.detail}`)
            .join(
              "\n",
            )}\n\n${brief.lift ? "The elevator and staircase are aligned on every level. " : "The staircase is aligned on every level. "}Choose a concept, explore a floor, or tell me what to change.`
        : `I couldn’t find a layout that satisfies the requested program and the configured size rules on ${brief.site.width} × ${brief.site.depth} ft.\n\n${result.reasons.join("\n\n")}\n\nYour requirements are kept. Try a larger plot, fewer parking bays, or a smaller floor program. For this G+3 example, you can say “Use 30 × 40 instead.” This is a limit of the current search and assumptions, not proof that no architect could solve the site.`;
      setState({
        messages: [...messages, { role: "assistant", text: response }],
        brief,
        result,
        choice: 0,
      });
      setLevel(0);
      setSelected(null);
      setHistory([]);
      setMode("2d");
    } catch (e) {
      if (abort.current !== controller) return;
      const error = controller.signal.aborted
        ? "The request was cancelled or timed out. Your previous design is preserved. Send the brief again to retry."
        : (e as Error).message;
      setState((s) => ({
        ...s,
        messages: [...messages, { role: "assistant", text: error }],
      }));
    } finally {
      clearTimeout(timer);
      if (abort.current === controller) {
        setBusy("");
        abort.current = null;
      }
    }
  }
  function changeProject(next: Project, record = true) {
    if (!project) return;
    if (record) setHistory((h) => [...h.slice(-19), structuredClone(project)]);
    setState((s) =>
      s.result
        ? {
            ...s,
            result: {
              ...s.result,
              proposals: s.result.proposals.map((p, i) =>
                i === s.choice ? { ...p, project: next } : p,
              ),
            },
          }
        : s,
    );
  }
  function edit(id: string, patch: Partial<Room>, record = true) {
    if (!project || !floor) return;
    const next = structuredClone(project),
      target = next.floors
        .find((f) => f.id === floor.id)!
        .rooms.find((r) => r.id === id)!;
    // Preserve structural alignment while editing a core's size/position.
    if (target.type === "stairs" || target.type === "lift")
      for (const f of next.floors) {
        const r = f.rooms.find((r) => r.type === target.type);
        if (r) Object.assign(r, patch);
      }
    else Object.assign(target, patch);
    changeProject(next, record);
  }
  const composer = (
    <form
      className="studio-composer"
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      <textarea
        ref={input}
        aria-label="Describe your house"
        placeholder={
          project
            ? "Tell me what to change…"
            : "Describe your plot, floors, rooms, and the way you want to live…"
        }
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
            e.preventDefault();
            submit();
          }
        }}
        rows={project ? 4 : 5}
      />
      <div className="composer-bottom">
        <span>
          <MessageSquare size={13} />{" "}
          {state.brief
            ? "Your earlier requirements stay in context"
            : "Start with a thought. Build from there."}
        </span>
        {busy ? (
          <button
            type="button"
            onClick={() => abort.current?.abort()}
            aria-label="Stop generation"
          >
            <Square size={15} />
          </button>
        ) : (
          <button
            type="submit"
            disabled={!text.trim()}
            aria-label="Generate architecture"
          >
            <ArrowUp size={19} />
          </button>
        )}
      </div>
    </form>
  );
  return (
    <div className={`studio ${project ? "has-design" : ""}`}>
      <header className="studio-header">
        <a className="studio-brand" href="/" aria-label="Aangan home">
          <span>
            <House size={23} />
          </span>
          <b>aangan</b>
          <i>HOUSE DESIGN STUDIO</i>
        </a>
        <div className="studio-header-right">
          <span
            className={`model-status ${ai?.ok ? "connected" : ""}`}
            title={ai?.error ?? "Your conversation stays on this computer"}
          >
            <i />
            {ai === null
              ? "Connecting to local AI"
              : ai.ok
                ? `${ai.model} · local`
                : "Local AI offline"}
          </span>
          <button onClick={fresh}>
            <Plus size={16} />
            New conversation
          </button>
        </div>
      </header>
      <main className={project ? "studio-workspace" : "studio-welcome"}>
        <section className="conversation-panel">
          {!state.messages.length ? (
            <div className="welcome-intro">
              <div className="intro-kicker">
                <span />A HOME THAT STARTS WITH YOU
              </div>
              <h1>
                Tell us how
                <br />
                you want to <em>live.</em>
              </h1>
              <p>
                A parking floor. A sunlit hall. A garden above the city.
                <br />
                Describe your house, and let’s give every space a purpose.
              </p>
            </div>
          ) : (
            <div className="conversation-heading">
              <MessageSquare size={16} />
              <span>Your design conversation</span>
              <small>Saved on this computer</small>
            </div>
          )}
          {state.messages.length > 0 && (
            <div className="message-list" aria-live="polite">
              {state.messages.map((m, i) => (
                <article key={i} className={`message ${m.role}`}>
                  <span>{m.role === "user" ? "YOU" : "AANGAN"}</span>
                  <p>{m.text}</p>
                </article>
              ))}
              {busy && (
                <div className="generation-status" role="status">
                  <LoaderCircle size={16} />
                  {busy}
                </div>
              )}
              <div ref={end} />
            </div>
          )}
          {composer}
          {!state.messages.length && (
            <>
              <div className="example-label">A FEW PLACES TO START</div>
              <div className="prompt-examples">
                <button
                  onClick={() => {
                    setText(EXAMPLE);
                    input.current?.focus();
                  }}
                >
                  <Layers size={21} />
                  <b>An independent G+3 house</b>
                  <span>Parking, family floors & a garden terrace</span>
                  <ArrowUpRight size={16} />
                </button>
                <button
                  onClick={() => {
                    setText(EXAMPLE.replace("30 × 40", "20 × 30"));
                    input.current?.focus();
                  }}
                >
                  <Ruler size={21} />
                  <b>Explore a compact plot</b>
                  <span>Find out what fits on a 20 × 30 site</span>
                  <ArrowUpRight size={16} />
                </button>
              </div>
              <div className="welcome-foot">
                <span>01 &nbsp; Describe</span>
                <i />
                <span>02 &nbsp; Review the plan</span>
                <i />
                <span>03 &nbsp; Walk through</span>
              </div>
            </>
          )}
          {state.brief && (
            <button
              className="program-toggle"
              onClick={() => setShowProgram(!showProgram)}
            >
              {showProgram ? "Hide" : "View"} understood requirements &
              assumptions
            </button>
          )}
          {showProgram && state.brief && (
            <div className="program-details">
              {describeBrief(state.brief).map((f, i) => (
                <p key={i}>
                  <b>{f.label}</b>
                  {f.detail}
                </p>
              ))}
              <p>
                <b>Vertical circulation</b>Stairs
                {state.brief.lift
                  ? `, elevator to ${state.brief.liftToTerrace ? "terrace" : "top residential floor"}`
                  : ""}
              </p>
              {state.result?.assumptions.map((a, i) => (
                <small key={i}>{a}</small>
              ))}
              <button
                onClick={() =>
                  download(
                    "architectural-brief.json",
                    JSON.stringify(state.brief, null, 2),
                  )
                }
              >
                Export brief JSON
              </button>
            </div>
          )}
          {storageError && (
            <p role="alert" className="storage-error">
              {storageError}
            </p>
          )}
        </section>
        {project && floor && (
          <section className="design-panel">
            <div className="design-title">
              <div>
                <span>YOUR ARCHITECTURAL CONCEPT</span>
                <h2>
                  {project.site.width} × {project.site.depth} <small>ft</small>{" "}
                  <i>/</i>{" "}
                  {project.floors.filter((f) => f.role !== "terrace").length -
                    1 >
                  0
                    ? `G+${project.floors.filter((f) => f.role !== "terrace").length - 1}`
                    : "Ground floor"}
                </h2>
              </div>
              <div className="design-actions">
                <button
                  title="Export editable project"
                  aria-label="Export project"
                  onClick={() =>
                    download(
                      "aangan-house.json",
                      JSON.stringify(project, null, 2),
                    )
                  }
                >
                  <Download size={17} />
                </button>
                <button
                  title="Undo room edit"
                  aria-label="Undo room edit"
                  disabled={!history.length}
                  onClick={() => {
                    const prev = history.at(-1);
                    if (prev) {
                      changeProject(prev, false);
                      setHistory((h) => h.slice(0, -1));
                    }
                  }}
                >
                  <Undo2 size={17} />
                </button>
              </div>
            </div>
            <div className="concept-row">
              {state.result?.proposals.map((p, i) => (
                <button
                  key={i}
                  className={state.choice === i ? "active" : ""}
                  onClick={() => {
                    setState((s) => ({ ...s, choice: i }));
                    setSelected(null);
                    setHistory([]);
                  }}
                >
                  Concept {String.fromCharCode(65 + i)}{" "}
                  <small>
                    {p.notes[0].includes("right") ? "Right" : "Left"} core
                  </small>
                </button>
              ))}
              <span>{state.result?.attempted} arrangements evaluated</span>
            </div>
            <div className="drawing-toolbar">
              <div className="view-modes">
                {(
                  [
                    { id: "2d", name: "Floor plan", Icon: Ruler },
                    { id: "3d", name: "3D view", Icon: Box },
                    { id: "walk", name: "Walkthrough", Icon: Footprints },
                    { id: "elev", name: "Elevation", Icon: House },
                  ] as const
                ).map(({ id, name, Icon }) => (
                  <button
                    key={id}
                    className={mode === id ? "active" : ""}
                    onClick={() => setMode(id)}
                  >
                    <Icon size={15} />
                    {name}
                  </button>
                ))}
              </div>
              <select
                aria-label="Current floor"
                value={level}
                onChange={(e) => {
                  setLevel(Number(e.target.value));
                  setSelected(null);
                }}
              >
                {project.floors.map((f, i) => (
                  <option key={f.id} value={i}>
                    {f.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="drawing-surface">
              {mode === "2d" ? (
                <Plan
                  project={project}
                  floor={floor}
                  selected={selected}
                  select={setSelected}
                  edit={edit}
                  checkpoint={() =>
                    setHistory((h) => [
                      ...h.slice(-19),
                      structuredClone(project),
                    ])
                  }
                  zoom={1}
                  showFurniture
                  showDimensions
                  showVastu={false}
                  measure={false}
                />
              ) : mode === "elev" ? (
                <div className="studio-elevation">
                  <div>
                    {SIDES.map((s) => (
                      <button
                        key={s}
                        className={side === s ? "active" : ""}
                        onClick={() => setSide(s)}
                      >
                        {s}
                      </button>
                    ))}
                    <button
                      onClick={() =>
                        download(
                          `aangan-${side}.svg`,
                          elevationSvg(project, side),
                          "image/svg+xml",
                        )
                      }
                    >
                      Save SVG
                    </button>
                  </div>
                  <div
                    dangerouslySetInnerHTML={{
                      __html: elevationSvg(project, side),
                    }}
                  />
                </div>
              ) : (
                <Suspense
                  fallback={
                    <div className="loading-scene">Loading your house…</div>
                  }
                >
                  <Viewer
                    project={project}
                    floor={floor}
                    walk={mode === "walk"}
                    showFurniture
                    onWalkChange={(w) => setMode(w ? "walk" : "3d")}
                    onFloorChange={setLevel}
                    onMaterialChange={(id, material) => edit(id, { material })}
                  />
                </Suspense>
              )}
            </div>
            <div className="drawing-footer">
              <span>
                <span className="status-dot" /> {floor.name} ·{" "}
                {project.site.facing}-facing site
              </span>
              <span>Concept design · professional review required</span>
            </div>
            {room && mode === "2d" && (
              <div className="room-inspector">
                <b>{room.name}</b>
                <label>
                  Width (ft)
                  <input
                    aria-label="Room width"
                    type="number"
                    min="2"
                    step=".5"
                    value={room.w}
                    onChange={(e) => {
                      const n = Number(e.target.value);
                      if (n >= 2 && n <= 150) edit(room.id, { w: n });
                    }}
                  />
                </label>
                <label>
                  Depth (ft)
                  <input
                    aria-label="Room depth"
                    type="number"
                    min="2"
                    step=".5"
                    value={room.d}
                    onChange={(e) => {
                      const n = Number(e.target.value);
                      if (n >= 2 && n <= 150) edit(room.id, { d: n });
                    }}
                  />
                </label>
                <label>
                  Flooring
                  <select
                    aria-label="Room flooring"
                    value={room.material}
                    onChange={(e) =>
                      edit(room.id, { material: e.target.value as Material })
                    }
                  >
                    {["marble", "wood", "terrazzo", "tile"].map((m) => (
                      <option key={m}>{m}</option>
                    ))}
                  </select>
                </label>
                <button onClick={() => setSelected(null)}>Close</button>
              </div>
            )}
            <details className="plan-review">
              <summary>Planning decisions & checks</summary>
              <p>{state.result?.proposals[state.choice].notes.join(" ")}</p>
              <p>
                Ranked by preferred room size, usable space and the existing
                Vastu rules. All displayed concepts passed dimension, overlap
                and route checks at generation.
              </p>
              {[
                ...validate(project, floor),
                ...dimensionIssues(floor.rooms),
                ...fixtureIssues(floor.rooms),
              ].map((m, i) => (
                <p className="check-warning" key={i}>
                  {m}
                </p>
              ))}
              {state.result?.assumptions.map((m, i) => (
                <p key={i}>{m}</p>
              ))}
            </details>
          </section>
        )}
      </main>
      {!project && (
        <footer className="studio-page-footer">
          <span>Designed around your life.</span>
          <span>Local AI · 2D plans · Desktop walkthroughs</span>
        </footer>
      )}
    </div>
  );
}
