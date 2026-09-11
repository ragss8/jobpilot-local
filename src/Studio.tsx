import { lazy, Suspense, useEffect, useRef, useState } from "react";
import {
  ArrowUp,
  ArrowUpRight,
  Box,
  Download,
  Footprints,
  History,
  House,
  Layers,
  LoaderCircle,
  LogOut,
  MessageSquare,
  Plus,
  Ruler,
  Square,
  Undo2,
} from "lucide-react";
import Plan from "./Plan";
import CampusView from "./CampusView";
import {resolveRequest} from "./requestContext";
import {planProject,planningIssues} from "./planner";
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
  type Conversation,
} from "./studioStorage";
import {
  api,
  ApiError,
  type ConversationSummary,
  type Session,
} from "./api";
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
// Moves the conversation kept in this browser before accounts existed into
// the first account that signs in here.
let browserImport: Promise<void> | undefined;
function importBrowserConversation(token: string) {
  browserImport ??= (async () => {
    let local: Conversation;
    try {
      local = loadConversation(localStorage);
      localStorage.removeItem(CHAT_KEY);
    } catch {
      return;
    }
    if (!local.messages.length) return;
    try {
      await api.saveConversation(token, crypto.randomUUID(), local);
    } catch (e) {
      try {
        localStorage.setItem(CHAT_KEY, JSON.stringify(local));
      } catch {}
      browserImport = undefined;
      throw e;
    }
  })();
  return browserImport;
}
export default function Studio({
  session,
  onSignOut,
}: {
  session: Session;
  onSignOut: () => void;
}) {
  const [state, setState] = useState<Conversation>(emptyConversation);
  const [conversationId, setConversationId] = useState<string | null>(null),
    [conversations, setConversations] = useState<ConversationSummary[]>([]),
    [loading, setLoading] = useState(true),
    [showHistory, setShowHistory] = useState(false);
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
    input = useRef<HTMLTextAreaElement>(null),
    saved = useRef(new Map<string, string>()),
    saving = useRef<Promise<void>>(Promise.resolve()),
    pendingSave = useRef<(() => void) | null>(null);
  const [showProgram, setShowProgram] = useState(false);
  const project = state.result?.proposals[state.choice]?.project ?? null;
  const floor = project?.floors[Math.min(level, project.floors.length - 1)];
  const room = floor?.rooms.find((r) => r.id === selected);
  function failed(e: unknown, message: string) {
    if (e instanceof ApiError && e.status === 401) onSignOut();
    else setStorageError(message);
  }
  useEffect(() => {
    checkOllama().then(setAI);
    let cancelled = false;
    importBrowserConversation(session.token)
      .then(() => api.conversations(session.token))
      .then(async (list) => {
        if (cancelled) return;
        setConversations(list);
        if (list[0]) await open(list[0].id);
      })
      .catch(
        (e) =>
          !cancelled &&
          failed(
            e,
            "Your saved conversations couldn't be loaded. Check that the API server is running, then reload.",
          ),
      )
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
      abort.current?.abort();
    };
  }, []);
  // Saves the open conversation shortly after it changes. Saves run one at a
  // time so an older snapshot never lands after a newer one.
  useEffect(() => {
    if (!state.messages.length) return;
    if (!conversationId) {
      setConversationId(crypto.randomUUID());
      return;
    }
    const id = conversationId,
      snapshot = state,
      body = JSON.stringify(snapshot);
    if (saved.current.get(id) === body) return;
    const save = () => {
      pendingSave.current = null;
      saving.current = saving.current.then(() =>
        api.saveConversation(session.token, id, snapshot).then(
          (summary) => {
            saved.current.set(id, body);
            setStorageError("");
            setConversations((list) => [
              summary,
              ...list.filter((c) => c.id !== id),
            ]);
          },
          (e) =>
            failed(
              e,
              "This conversation couldn't be saved to your account. Your latest changes are still on screen.",
            ),
        ),
      );
    };
    pendingSave.current = save;
    const timer = setTimeout(save, 700);
    return () => {
      clearTimeout(timer);
      if (pendingSave.current === save) pendingSave.current = null;
    };
  }, [state, conversationId]);
  useEffect(() => {
    end.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [state.messages, busy]);
  function resetView() {
    pendingSave.current?.();
    abort.current?.abort();
    abort.current = null;
    setBusy("");
    setText("");
    setLevel(0);
    setSelected(null);
    setHistory([]);
    setMode("2d");
    setShowHistory(false);
  }
  function fresh() {
    resetView();
    setConversationId(null);
    setState(emptyConversation());
  }
  async function open(id: string) {
    resetView();
    try {
      const conversation = await api.conversation(session.token, id);
      for (const proposal of conversation.result?.proposals ?? [])
        proposal.project = parseProject(proposal.project);
      saved.current.set(id, JSON.stringify(conversation));
      setConversationId(id);
      setState(conversation);
      setStorageError("");
    } catch (e) {
      failed(e, "That conversation couldn't be opened. Try again.");
    }
  }
  async function submit() {
    if (!text.trim() || busy) return;
    const message = text.trim(),
      context = resolveRequest(text.trim(),state.pendingNew?null:state.brief,state.activeRequest??''),
      previous = context.previous;
    const messages = [
      ...state.messages,
      { role: "user" as const, text: message },
    ];
    setState((s) => ({ ...s, messages, activeRequest:context.text, pendingNew:context.intent==='new'||s.pendingNew }));
    setText("");
    setBusy("Understanding your project requirements…");
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
      const brief = await understand(
        context.text,
        previous,
        status.model,
        controller.signal,
      );
      if (controller.signal.aborted) return;
      setBusy("Testing arrangements for this project type…");
      await new Promise((resolve) => setTimeout(resolve, 30));
      if (controller.signal.aborted) return;
      const planned = planProject(brief);
      // The planner may have settled on a smaller program than was proposed;
      // describe and remember what was actually drawn.
      const result = planned;
      const effective = planned.brief ?? brief;
      const response = result.proposals.length
        ? `I found ${result.proposals.length} valid concepts from ${result.attempted} arrangements for your ${effective.site.width} × ${effective.site.depth} ft site.\n\n${describeBrief(
            effective,
          )
            .map((f) => `${f.label}: ${f.detail}`)
            .join(
              "\n",
            )}\n\n${effective.kind==='resort'?"The site layout separates accommodation, amenities and access. ":effective.lift ? "The elevator and staircase are aligned on every level. " : "The staircase is aligned on every level. "}Choose a concept, explore a floor, or tell me what to change.`
        : `I couldn’t find a layout that satisfies the requested program and the configured size rules on ${brief.site.width} × ${brief.site.depth} ft.\n\n${result.reasons.join("\n\n")}\n\nYour requirements are kept. Try a larger site or revise the requirements described in the conflicts. This is a limit of the current search and assumptions, not proof that no architect could solve the site.`;
      setState({
        messages: [...messages, { role: "assistant", text: response }],
        brief: effective,
        activeRequest:context.text,
        pendingNew:false,
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
        aria-label="Describe your project"
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
            ? "Corrections update this project; a new project starts fresh"
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
  if (loading)
    return (
      <div className="studio">
        <div className="loading-scene studio-loading" role="status">
          Loading your conversations…
        </div>
      </div>
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
            title={ai?.error ?? "The model runs on this computer"}
          >
            <i />
            {ai === null
              ? "Connecting to local AI"
              : ai.ok
                ? `${ai.model} · local`
                : "Local AI offline"}
          </span>
          <div className="history-menu">
            <button
              aria-expanded={showHistory}
              onClick={() => setShowHistory(!showHistory)}
            >
              <History size={16} />
              History
            </button>
            {showHistory && (
              <nav className="history-panel" aria-label="Conversation history">
                <b>YOUR CONVERSATIONS</b>
                {conversations.length ? (
                  conversations.map((c) => (
                    <button
                      key={c.id}
                      className={c.id === conversationId ? "active" : ""}
                      onClick={() => open(c.id)}
                    >
                      <span>{c.title}</span>
                      <small>
                        {new Date(c.updatedAt).toLocaleString()} ·{" "}
                        {c.messageCount}{" "}
                        {c.messageCount === 1 ? "message" : "messages"}
                      </small>
                    </button>
                  ))
                ) : (
                  <p>No saved conversations yet.</p>
                )}
              </nav>
            )}
          </div>
          <button onClick={fresh}>
            <Plus size={16} />
            New conversation
          </button>
          <span className="account" title={session.user.email}>
            {session.user.picture && (
              <img
                src={session.user.picture}
                alt=""
                referrerPolicy="no-referrer"
              />
            )}
            <span>{session.user.name ?? session.user.email}</span>
          </span>
          <button
            aria-label="Sign out"
            title="Sign out"
            onClick={() => {
              pendingSave.current?.();
              onSignOut();
            }}
          >
            <LogOut size={16} />
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
                Describe your project, and let’s give every space a purpose.
              </p>
            </div>
          ) : (
            <div className="conversation-heading">
              <MessageSquare size={16} />
              <span>Your design conversation</span>
              <small>Saved to your account</small>
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
                <b>{state.brief.kind==='resort'?'Site access':'Vertical circulation'}</b>{state.brief.kind==='resort'?'Pedestrian and vehicle routes':'Stairs'}
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
                  {project.kind==='resort'?'Resort masterplan':project.floors.filter((f) => f.role !== "terrace").length -
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
                      "aangan-project.json",
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
                    {project.kind==='resort'?'Site layout':project.kind==='apartment'?'Shared core':p.notes[0].includes("right") ? "Right core" : "Left core"}
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
                ).filter(v=>project.kind!=='resort'||v.id==='2d'||v.id==='3d').map(({ id, name, Icon }) => (
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
              {project.kind==='resort'?<CampusView project={project} three={mode==='3d'}/>:mode === "2d" ? (
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
                Concepts use planning rules for the selected project type. Displayed layouts passed the supported geometry, feature and access checks at generation.
              </p>
              {[
                ...planningIssues(project, floor),
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
