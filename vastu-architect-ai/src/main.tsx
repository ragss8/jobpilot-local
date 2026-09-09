import React, { Suspense, lazy, useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import Chat from "./Chat";
import {
  ArrowUpRight,
  ArrowLeft,
  ArrowRight,
  Check,
  ChevronDown,
  Compass,
  Copy,
  Download,
  FolderOpen,
  Grid2X2,
  House,
  Layers,
  Leaf,
  Maximize,
  Minus,
  MousePointer2,
  Move,
  PanelLeftClose,
  Plus,
  Redo2,
  RotateCw,
  Ruler,
  Settings2,
  Sofa,
  Sparkles,
  Square,
  Trash2,
  Undo2,
  Upload,
  UserRound,
  View,
  Footprints,
  X,
  ZoomIn,
  ZoomOut,
  Box,
  CheckCircle2,
  AlertTriangle,
  Palette,
  Save,
} from "lucide-react";
import Plan from "./Plan";
import {
  defaultProject,
  generate,
  vastu,
  validate,
  parseBrief,
  parseProject,
  uid,
  furnish,
  round,
  roomColors,
  materialColors,
  type Project,
  type Room,
  type RoomType,
  type Material,
  type Direction,
  type Furniture,
} from "./engine";
import "./style.css";
const Viewer = lazy(() => import("./Viewer"));
const STORAGE = "aangan-project-v1";
function load() {
  try {
    const raw = localStorage.getItem(STORAGE);
    if (raw) return { project: parseProject(JSON.parse(raw)), error: "" };
  } catch {
    try {
      const raw = localStorage.getItem(STORAGE);
      if (raw) localStorage.setItem(STORAGE + "-recovery", raw);
    } catch {}
    return {
      project: defaultProject(),
      error:
        "The saved project could not be read. A fresh concept is open; any readable original was retained under a recovery key.",
    };
  }
  return { project: defaultProject(), error: "" };
}
const initial = load();
const IconButton = ({
  label,
  children,
  onClick,
  disabled = false,
  active = false,
}: {
  label: string;
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
  active?: boolean;
}) => (
  <button
    className={`icon-button ${active ? "active" : ""}`}
    title={label}
    aria-label={label}
    onClick={onClick}
    disabled={disabled}
  >
    {children}
  </button>
);
function download(name: string, body: string, type = "application/json") {
  const url = URL.createObjectURL(new Blob([body], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function App() {
  const [project, setProject] = useState<Project>(initial.project),
    [level, setLevel] = useState(0),
    [selected, setSelected] = useState<string | null>(null),
    [mode, setMode] = useState<"2d" | "3d" | "walk">("2d"),
    [panel, setPanel] = useState("project"),
    [zoom, setZoom] = useState(1),
    [showFurniture, setShowFurniture] = useState(true),
    [showDimensions, setShowDimensions] = useState(true),
    [showVastu, setShowVastu] = useState(false),
    [measure, setMeasure] = useState(false),
    [toast, setToast] = useState(initial.error),
    [saveState, setSaveState] = useState("Saved on this device"),
    [modal, setModal] = useState(false),
    [chat, setChat] = useState(false),
    [draft, setDraft] = useState<Project>(project),
    [brief, setBrief] = useState(""),
    [options, setOptions] = useState<Project[] | null>(null),
    [formError, setFormError] = useState(""),
    [exportOpen, setExportOpen] = useState(false),
    [history, setHistory] = useState<Project[]>([]),
    [future, setFuture] = useState<Project[]>([]);
  const file = useRef<HTMLInputElement>(null);
  const floor = project.floors[Math.min(level, project.floors.length - 1)],
    room = floor.rooms.find((r) => r.id === selected);
  const analysis = vastu(project, floor),
    issues = validate(project, floor);
  const totalArea = Math.round(
    project.floors.reduce(
      (s, f) => s + f.rooms.reduce((a, r) => a + r.w * r.d, 0),
      0,
    ),
  );
  const checkpoint = () => {
    setHistory((h) => [...h.slice(-39), structuredClone(project)]);
    setFuture([]);
  };
  const change = (p: Project, record = true) => {
    if (record) checkpoint();
    setProject(p);
  };
  const editRoom = (id: string, patch: Partial<Room>, record = true) => {
    const next = structuredClone(project);
    Object.assign(
      next.floors[Math.min(level, next.floors.length - 1)].rooms.find(
        (r) => r.id === id,
      )!,
      patch,
    );
    change(next, record);
  };
  const undo = () => {
    if (!history.length) return;
    setFuture((f) => [project, ...f]);
    setProject(history[history.length - 1]);
    setLevel((l) => Math.min(l, history[history.length - 1].floors.length - 1));
    setHistory((h) => h.slice(0, -1));
    setSelected(null);
  };
  const redo = () => {
    if (!future.length) return;
    setHistory((h) => [...h, project]);
    setProject(future[0]);
    setLevel((l) => Math.min(l, future[0].floors.length - 1));
    setFuture((f) => f.slice(1));
    setSelected(null);
  };
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE, JSON.stringify(project));
      setSaveState("Saved on this device");
    } catch {
      setSaveState("Save failed · Export a backup");
    }
  }, [project]);
  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => setToast(""), 7000);
    return () => clearTimeout(id);
  }, [toast]);
  useEffect(() => {
    const listener = (e: KeyboardEvent) => {
      if (/INPUT|TEXTAREA|SELECT/.test((e.target as HTMLElement).tagName))
        return;
      if ((e.ctrlKey || e.metaKey) && e.key === "z") {
        e.preventDefault();
        e.shiftKey ? redo() : undo();
      }
      if (e.key === "Escape") {
        setModal(false);
        setExportOpen(false);
        setSelected(null);
      }
    };
    window.addEventListener("keydown", listener);
    return () => window.removeEventListener("keydown", listener);
  });
  useEffect(() => {
    if (!modal) return;
    const previous = document.activeElement as HTMLElement | null;
    const dialog = document.querySelector<HTMLElement>('[role="dialog"]');
    const focusables = () =>
      Array.from(
        dialog?.querySelectorAll<HTMLElement>(
          'button:not(:disabled),input:not(:disabled),select,textarea,[tabindex="0"]',
        ) ?? [],
      );
    focusables()[0]?.focus();
    const trap = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setModal(false);
        return;
      }
      if (e.key !== "Tab") return;
      const list = focusables(),
        first = list[0],
        last = list[list.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last?.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first?.focus();
      }
    };
    document.addEventListener("keydown", trap);
    return () => {
      document.removeEventListener("keydown", trap);
      previous?.focus();
    };
  }, [modal, options]);
  const duplicate = () => {
    if (project.floors.length >= 5) {
      setToast("Up to 5 floors are supported.");
      return;
    }
    const next = structuredClone(project),
      copy = structuredClone(floor);
    copy.id = uid();
    copy.name = `Floor ${next.floors.length}`;
    copy.rooms.forEach((r) => {
      r.id = uid();
      r.furniture.forEach((f) => (f.id = uid()));
    });
    next.floors.push(copy);
    change(next);
    setLevel(next.floors.length - 1);
    setSelected(null);
    setToast("Floor duplicated. Edit this level independently.");
  };
  const addRoom = (type: RoomType) => {
    const next = structuredClone(project),
      r: Room = {
        id: uid(),
        name:
          type === "master"
            ? "Master bedroom"
            : type[0].toUpperCase() + type.slice(1),
        type,
        x: project.site.setback,
        y: project.site.setback,
        w: 8,
        d: 8,
        material: "marble",
        furniture: [],
        doorSide: "s",
        doorOffset: 0.5,
        windowOffset: 0.5,
      };
    r.furniture = furnish(r);
    next.floors[level].rooms.push(r);
    change(next);
    setSelected(r.id);
    setToast(
      "Room added at the northwest corner. Move it into free space; overlaps are flagged.",
    );
  };
  const exportSvg = () => {
    const svg = document.querySelector("#floor-plan");
    if (!svg) {
      setToast("Switch to 2D plan to export a drawing.");
      return;
    }
    const clone = svg.cloneNode(true) as SVGElement;
    clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
    clone.removeAttribute("style");
    clone.setAttribute("width", "900");
    clone.setAttribute("height", "1100");
    download(
      "aangan-floor-plan.svg",
      new XMLSerializer().serializeToString(clone),
      "image/svg+xml",
    );
    setExportOpen(false);
  };
  const field = (
    label: string,
    key: "x" | "y" | "w" | "d",
    min: number,
    max: number,
  ) => (
    <label className="field">
      {label}
      <div className="unit-input">
        <input
          aria-label={label}
          type="number"
          step=".5"
          min={min}
          max={max}
          value={room![key]}
          onChange={(e) => {
            if (e.target.value !== "")
              editRoom(room!.id, {
                [key]: Math.max(min, Math.min(max, Number(e.target.value))),
              });
          }}
        />
        <span>ft</span>
      </div>
    </label>
  );
  return (
    <div className="app-shell">
      <header className="header">
        <a className="brand" href="#" onClick={(e) => e.preventDefault()}>
          <span className="brand-mark">
            <House size={23} />
          </span>
          <span>
            aangan<span className="brand-dot">.</span>
            <small>SPACE FOR YOUR VISION</small>
          </span>
        </a>
        <div className="header-divider" />
        <div className="project-name">
          <span className="breadcrumb">
            Workspace <span>/</span> Residential
          </span>
          <input
            aria-label="Project name"
            value={project.name}
            maxLength={100}
            onChange={(e) =>
              change({ ...project, name: e.target.value }, false)
            }
          />
        </div>
        <span
          className={`save-status ${saveState.startsWith("Save failed") ? "warning" : ""}`}
        >
          <span className="status-dot" />
          {saveState}
        </span>
        <div className="header-actions">
          <button
            className="button secondary"
            onClick={() => file.current?.click()}
          >
            <FolderOpen size={15} />
            Open project
          </button>
          <div className="export-wrap">
            <button
              className="button primary"
              onClick={() => setExportOpen(!exportOpen)}
            >
              <Download size={15} />
              Export
              <ChevronDown size={13} />
            </button>
            {exportOpen && (
              <div className="dropdown">
                <button
                  onClick={() => {
                    download(
                      "aangan-project.json",
                      JSON.stringify(project, null, 2),
                    );
                    setExportOpen(false);
                  }}
                >
                  <Save size={15} />
                  Project JSON
                </button>
                <button onClick={exportSvg}>
                  <Ruler size={15} />
                  Floor plan SVG
                </button>
                <button
                  onClick={() => {
                    setMode("2d");
                    setExportOpen(false);
                    setTimeout(() => window.print(), 200);
                  }}
                >
                  <Square size={15} />
                  Print / Save as PDF
                </button>
              </div>
            )}
          </div>
          <span className="avatar">ME</span>
        </div>
      </header>
      <div className="workspace">
        <nav className="rail" aria-label="Workspace tools">
          {[
            { id: "project", icon: House, label: "Project" },
            { id: "rooms", icon: Grid2X2, label: "Rooms" },
            { id: "furniture", icon: Sofa, label: "Furniture" },
            { id: "materials", icon: Palette, label: "Materials" },
            { id: "vastu", icon: Compass, label: "Vastu" },
          ].map((n) => (
            <button
              key={n.id}
              className={panel === n.id ? "rail-item active" : "rail-item"}
              onClick={() => {
                setPanel(n.id);
                if (n.id === "vastu") setShowVastu(true);
              }}
            >
              <n.icon size={21} />
              <span>{n.label}</span>
            </button>
          ))}
          <div className="rail-bottom">
            <span
              className="local-indicator"
              title="Everything is stored in your browser on this device"
            >
              <Leaf size={19} />
            </span>
            <small>LOCAL</small>
          </div>
        </nav>
        <aside className="left-panel">
          <div className="panel-heading">
            <h2>
              {
                {
                  project: "Project overview",
                  rooms: "Room library",
                  furniture: "Furniture library",
                  materials: "Material palette",
                  vastu: "Vastu insights",
                }[panel]
              }
            </h2>
            <Settings2 size={16} />
          </div>
          {panel === "project" && (
            <>
              <div className="project-card">
                <div className="eyebrow">YOUR NEXT CHAPTER</div>
                <h3>
                  A home that feels
                  <br />
                  like you.
                </h3>
                <p>Thoughtful spaces. A fresh perspective.</p>
                <button
                  className="button light"
                  onClick={() => {
                    setOptions(null);
                    setChat(true);
                  }}
                >
                  <Sparkles size={15} />
                  Describe your home
                  <ArrowUpRight size={15} />
                </button>
                <button
                  className="card-alt-link"
                  onClick={() => {
                    setDraft(project);
                    setOptions(null);
                    setModal(true);
                    setFormError("");
                  }}
                >
                  or set the requirements by hand
                </button>
                <House className="card-watermark" size={120} />
              </div>
              <section>
                <div className="section-heading">
                  <h3>Site details</h3>
                  <button
                    className="text-button"
                    onClick={() => {
                      setDraft(project);
                      setOptions(null);
                      setModal(true);
                    }}
                  >
                    Edit
                  </button>
                </div>
                <div className="site-diagram">
                  <span className="dim-top">{project.site.width} ft</span>
                  <div className="site-rect">
                    <Compass size={24} />
                    <span>
                      {project.site.width * project.site.depth}
                      <small>sq ft site area</small>
                    </span>
                  </div>
                  <span className="dim-side">{project.site.depth} ft</span>
                  <span className="road-label">
                    {project.site.facing.toUpperCase()} FACING · ROAD
                  </span>
                </div>
                <div className="detail-line">
                  <span>Plot dimensions</span>
                  <strong>
                    {project.site.width} × {project.site.depth} ft
                  </strong>
                </div>
                <div className="detail-line">
                  <span>Orientation</span>
                  <strong>{project.site.facing} facing</strong>
                </div>
                <div className="detail-line">
                  <span>Setbacks · side / front</span>
                  <strong>
                    {project.site.setback} / {project.site.front} ft
                  </strong>
                </div>
              </section>
              <section>
                <div className="section-heading">
                  <h3>Design brief</h3>
                  <span className="tiny-badge">CONCEPT</span>
                </div>
                <div className="brief-chips">
                  <span>{project.requirements.bedrooms} bedrooms</span>
                  <span>
                    {project.floors.length}{" "}
                    {project.floors.length === 1 ? "floor" : "floors"}
                  </span>
                  <span>{project.requirements.style}</span>
                  <span>{project.requirements.vastu} Vastu</span>
                </div>
                <div className="detail-line">
                  <span>Budget target</span>
                  <strong>₹{project.requirements.budget} lakh</strong>
                </div>
              </section>
              <section>
                <div className="section-heading">
                  <h3>Floors & levels</h3>
                  <IconButton
                    label="Duplicate current floor"
                    onClick={duplicate}
                  >
                    <Plus size={15} />
                  </IconButton>
                </div>
                {project.floors.map((f, i) => (
                  <button
                    key={f.id}
                    className={`floor-row ${i === level ? "active" : ""}`}
                    onClick={() => {
                      setLevel(i);
                      setSelected(null);
                    }}
                  >
                    <Layers size={16} />
                    <span>
                      {f.name}
                      <small>
                        {Math.round(f.rooms.reduce((s, r) => s + r.w * r.d, 0))}{" "}
                        sq ft · {f.height} ft high
                      </small>
                    </span>
                    {i === level && <Check size={15} />}
                  </button>
                ))}
              </section>
            </>
          )}
          {panel === "rooms" && (
            <section>
              <p className="muted">
                Select a room in the plan to edit it. Drag its corner to resize.
              </p>
              <div className="library-grid">
                {(
                  [
                    "bedroom",
                    "master",
                    "living",
                    "kitchen",
                    "bathroom",
                    "pooja",
                    "dining",
                    "office",
                  ] as RoomType[]
                ).map((t) => (
                  <button key={t} onClick={() => addRoom(t)}>
                    <span style={{ background: roomColors[t] }}>
                      <Grid2X2 size={22} />
                    </span>
                    {t === "master" ? "Master bed" : t}
                    <Plus size={13} />
                  </button>
                ))}
              </div>
              <p className="note">
                New rooms need free space. The checker flags overlaps as you
                arrange your plan.
              </p>
            </section>
          )}
          {panel === "furniture" && (
            <section>
              <p className="muted">
                {room
                  ? `Add to ${room.name}.`
                  : "Select a room in the plan first."}
              </p>
              <div className="library-grid">
                {(
                  [
                    "bed",
                    "sofa",
                    "table",
                    "counter",
                    "wardrobe",
                    "toilet",
                    "shower",
                    "altar",
                    "desk",
                    "car",
                    "recliner",
                    "screen",
                    "washer",
                    "planter",
                    "bench",
                    "pergola",
                  ] as Furniture["kind"][]
                ).map((kind) => (
                  <button
                    disabled={!room}
                    key={kind}
                    onClick={() => {
                      const dims: Record<Furniture["kind"], number[]> = {
                        bed: [5, 6.5],
                        sofa: [6, 2.6],
                        table: [4, 2.5],
                        counter: [4, 2],
                        wardrobe: [4, 1.8],
                        toilet: [2, 3],
                        altar: [2.5, 1.5],
                        desk: [4, 2],
                        car: [6.2, 14.5],
                        recliner: [3, 2.9],
                        screen: [8, 0.5],
                        planter: [3, 2],
                        bench: [5, 1.8],
                        washer: [2.4, 2.4],
                        pergola: [10, 8],
                        shower: [3, 3],
                      };
                      const [w, d] = dims[kind];
                      editRoom(room!.id, {
                        furniture: [
                          ...room!.furniture,
                          {
                            id: uid(),
                            kind,
                            x: 0.7,
                            y: 0.7,
                            w,
                            d,
                            rotation: 0,
                          },
                        ],
                      });
                    }}
                  >
                    <span>
                      <Sofa size={24} />
                    </span>
                    {kind}
                    <Plus size={13} />
                  </button>
                ))}
              </div>
              <p className="note">
                Use the room inspector to position, rotate, or remove each
                piece.
              </p>
            </section>
          )}
          {panel === "materials" && (
            <section>
              <p className="muted">
                {room
                  ? `Choose flooring for ${room.name}.`
                  : "Choose flooring for the entire current floor, or select a room."}
              </p>
              {(Object.keys(materialColors) as Material[]).map((m) => (
                <button
                  key={m}
                  className={`material-card ${room?.material === m ? "active" : ""}`}
                  onClick={() => {
                    if (room) editRoom(room.id, { material: m });
                    else {
                      const next = structuredClone(project);
                      next.floors[level].rooms.forEach((r) => (r.material = m));
                      change(next);
                    }
                  }}
                >
                  <span
                    className={`material-swatch ${m}`}
                    style={{ backgroundColor: materialColors[m] }}
                  />
                  <span>
                    {m}
                    <small>
                      {
                        {
                          wood: "Warm oak · Natural finish",
                          marble: "Beige stone · Honed finish",
                          tile: "Sage ceramic · Matte finish",
                          terrazzo: "Soft grey · Aggregate finish",
                        }[m]
                      }
                    </small>
                  </span>
                  {room?.material === m && <Check size={15} />}
                </button>
              ))}
              <div className="note">
                <Leaf size={17} /> Materials update in both 2D and 3D.
              </div>
            </section>
          )}
          {panel === "vastu" && (
            <section>
              <div className="vastu-large">
                <Compass size={28} />
                <strong>
                  {analysis.score ?? "—"}
                  <small>/100</small>
                </strong>
                <p>Traditional placement rules</p>
              </div>
              <label className="field">
                Vastu preference
                <select
                  value={project.requirements.vastu}
                  onChange={(e) =>
                    change({
                      ...project,
                      requirements: {
                        ...project.requirements,
                        vastu: e.target.value as "Off" | "Strict" | "Balanced",
                      },
                    })
                  }
                >
                  <option>Balanced</option>
                  <option>Strict</option>
                  <option>Off</option>
                </select>
              </label>
              {analysis.checks.map((c) => (
                <div className="vastu-check" key={c.id}>
                  {c.ok ? (
                    <CheckCircle2 size={16} />
                  ) : (
                    <AlertTriangle size={16} />
                  )}
                  <div>
                    <strong>{c.name}</strong>
                    <span>{c.zone}</span>
                    {!c.ok && (
                      <small>Preferred: {c.preferred.join(" or ")}</small>
                    )}
                  </div>
                </div>
              ))}
              <p className="note">
                Score is the share of checked room placements matching these
                traditional rules. It is not a building-code or safety
                assessment. Strict mode requires every rule to pass when
                generating.
              </p>
            </section>
          )}
          <div className="local-note">
            <span>
              <Leaf size={14} /> Made for your space.
            </span>
            <small>Private by design. No cloud required.</small>
          </div>
        </aside>
        <main className="canvas-panel">
          <div className="canvas-header">
            <div>
              <span className="eyebrow">DESIGN STUDIO</span>
              <h1>Make room for possibilities.</h1>
            </div>
            <span className="concept-badge">
              <span />
              Concept design
            </span>
          </div>
          <div className="canvas-toolbar">
            <div className="view-tabs">
              {(
                [
                  { id: "2d", name: "2D Plan", icon: Grid2X2 },
                  { id: "3d", name: "3D View", icon: Box },
                  { id: "walk", name: "Walkthrough", icon: Footprints },
                ] as const
              ).map((v) => (
                <button
                  key={v.id}
                  className={mode === v.id ? "active" : ""}
                  onClick={() => setMode(v.id)}
                >
                  <v.icon size={16} />
                  {v.name}
                </button>
              ))}
            </div>
            <div className="toolbar-actions">
              <IconButton
                label="Undo"
                onClick={undo}
                disabled={!history.length}
              >
                <Undo2 size={16} />
              </IconButton>
              <IconButton label="Redo" onClick={redo} disabled={!future.length}>
                <Redo2 size={16} />
              </IconButton>
              <span className="toolbar-divider" />
              <IconButton
                label="Toggle dimensions"
                onClick={() => setShowDimensions(!showDimensions)}
                active={showDimensions}
              >
                <Ruler size={17} />
              </IconButton>
              <IconButton
                label="Toggle furniture"
                onClick={() => setShowFurniture(!showFurniture)}
                active={showFurniture}
              >
                <Sofa size={17} />
              </IconButton>
            </div>
          </div>
          <div className={`canvas ${mode}`}>
            <div className="floor-picker">
              <Layers size={14} />
              <select
                aria-label="Current floor"
                value={Math.min(level, project.floors.length - 1)}
                onChange={(e) => {
                  setLevel(+e.target.value);
                  setSelected(null);
                }}
              >
                {project.floors.map((f, i) => (
                  <option key={f.id} value={i}>
                    {f.name}
                  </option>
                ))}
              </select>
              <ChevronDown size={13} />
            </div>
            <div className="north-indicator">
              <span>N</span>
              <Compass size={38} strokeWidth={1} />
            </div>
            {mode === "2d" ? (
              <Plan
                project={project}
                floor={floor}
                selected={selected}
                select={setSelected}
                edit={editRoom}
                checkpoint={checkpoint}
                zoom={zoom}
                showFurniture={showFurniture}
                showDimensions={showDimensions}
                showVastu={showVastu}
                measure={measure}
              />
            ) : (
              <Suspense
                fallback={
                  <div className="loading">Building your 3D space…</div>
                }
              >
                <Viewer
                  project={project}
                  floor={floor}
                  walk={mode === "walk"}
                  showFurniture={showFurniture}
                  onWalkChange={(walking) => setMode(walking ? "walk" : "3d")}
                  onMaterialChange={(id, material) =>
                    editRoom(id, { material })
                  }
                  onFloorChange={(index) => {
                    setLevel(index);
                    setSelected(null);
                  }}
                />
              </Suspense>
            )}
            {mode === "2d" && (
              <>
                <div className="floating-tools">
                  <IconButton
                    label="Select and move rooms"
                    onClick={() => setMeasure(false)}
                    active={!measure}
                  >
                    <MousePointer2 size={18} />
                  </IconButton>
                  <IconButton
                    label="Measure plan"
                    onClick={() => setMeasure(!measure)}
                    active={measure}
                  >
                    <Ruler size={18} />
                  </IconButton>
                  <IconButton
                    label="Vastu grid"
                    onClick={() => setShowVastu(!showVastu)}
                    active={showVastu}
                  >
                    <Compass size={18} />
                  </IconButton>
                </div>
                <div className="zoom-controls">
                  <IconButton
                    label="Zoom out"
                    onClick={() =>
                      setZoom((z) => Math.max(0.6, round(z - 0.1)))
                    }
                  >
                    <Minus size={15} />
                  </IconButton>
                  <span>{Math.round(zoom * 100)}%</span>
                  <IconButton
                    label="Zoom in"
                    onClick={() =>
                      setZoom((z) => Math.min(1.7, round(z + 0.1)))
                    }
                  >
                    <Plus size={15} />
                  </IconButton>
                  <span className="toolbar-divider" />
                  <IconButton label="Fit plan" onClick={() => setZoom(1)}>
                    <Maximize size={15} />
                  </IconButton>
                </div>
              </>
            )}
            <div className="canvas-caption">
              {mode === "2d"
                ? "Click a room to edit · Drag to move · Corner handle to resize"
                : mode === "3d"
                  ? "Drag to orbit · Scroll to zoom · Right-drag to pan"
                  : "Explore your design at eye level"}
            </div>
          </div>
          <div className="canvas-footer">
            <span>
              <span className="status-dot" />
              {mode === "2d"
                ? "Live floor plan"
                : mode === "3d"
                  ? "Live 3D model"
                  : "First-person view"}
              <span className="footer-divider">|</span>Units: feet
            </span>
            <span>
              {floor.rooms.length} rooms
              <span className="footer-divider">|</span>North is up
            </span>
          </div>
          <div className="insight-banner">
            <span className="insight-icon">
              <Sparkles size={18} />
            </span>
            <div>
              <strong>Your vision, with room to evolve.</strong>
              <p>
                Every room is editable. Explore your home in 3D whenever you’re
                ready.
              </p>
            </div>
            <button onClick={() => setMode(mode === "2d" ? "3d" : "2d")}>
              {mode === "2d" ? "Explore in 3D" : "Back to plan"}
              <ArrowRight size={16} />
            </button>
          </div>
        </main>
        <aside className="right-panel">
          <div className="panel-heading">
            <h2>{room ? "Room properties" : "Design at a glance"}</h2>
            {room ? (
              <IconButton
                label="Close room properties"
                onClick={() => setSelected(null)}
              >
                <X size={16} />
              </IconButton>
            ) : (
              <View size={16} />
            )}
          </div>
          {room ? (
            <>
              <section>
                <span className="eyebrow">SELECTED ROOM</span>
                <input
                  className="room-name-input"
                  aria-label="Room name"
                  value={room.name}
                  maxLength={60}
                  onChange={(e) => editRoom(room.id, { name: e.target.value })}
                />
                <span className="room-area">
                  {round(room.w * room.d)} sq ft
                </span>
                <div className="field-grid">
                  {field(
                    "Width",
                    "w",
                    3,
                    project.site.width - 2 * project.site.setback,
                  )}
                  {field(
                    "Depth",
                    "d",
                    3,
                    project.site.depth - 2 * project.site.setback,
                  )}
                  {field("Position X", "x", 0, project.site.width - room.w)}
                  {field("Position Y", "y", 0, project.site.depth - room.d)}
                </div>
                <label className="field">
                  Flooring
                  <select
                    aria-label="Room flooring"
                    value={room.material}
                    onChange={(e) =>
                      editRoom(room.id, {
                        material: e.target.value as Material,
                      })
                    }
                  >
                    {Object.keys(materialColors).map((m) => (
                      <option key={m}>{m}</option>
                    ))}
                  </select>
                </label>
                <label className="field">
                  Door wall
                  <select
                    value={room.doorSide}
                    onChange={(e) =>
                      editRoom(room.id, {
                        doorSide: e.target.value as Room["doorSide"],
                      })
                    }
                  >
                    {Object.entries({
                      n: "North",
                      e: "East",
                      s: "South",
                      w: "West",
                    }).map(([v, n]) => (
                      <option key={v} value={v}>
                        {n}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="field">
                  Door position
                  <input
                    type="range"
                    min="0"
                    max="1"
                    step=".05"
                    value={room.doorOffset}
                    onChange={(e) =>
                      editRoom(room.id, { doorOffset: +e.target.value })
                    }
                  />
                </label>
                <label className="field">
                  Window position
                  <input
                    type="range"
                    min="0"
                    max="1"
                    step=".05"
                    value={room.windowOffset}
                    onChange={(e) =>
                      editRoom(room.id, { windowOffset: +e.target.value })
                    }
                  />
                </label>
              </section>
              <section>
                <div className="section-heading">
                  <h3>Furniture</h3>
                  <button
                    className="text-button"
                    onClick={() => setPanel("furniture")}
                  >
                    Add
                  </button>
                </div>
                {room.furniture.length === 0 && (
                  <p className="muted">No furniture yet.</p>
                )}
                {room.furniture.map((f) => (
                  <div className="furniture-item" key={f.id}>
                    <div>
                      <strong>{f.kind}</strong>
                      <IconButton
                        label={`Rotate ${f.kind}`}
                        onClick={() =>
                          editRoom(room.id, {
                            furniture: room.furniture.map((a) =>
                              a.id === f.id
                                ? { ...a, rotation: (a.rotation + 90) % 360 }
                                : a,
                            ),
                          })
                        }
                      >
                        <RotateCw size={13} />
                      </IconButton>
                      <IconButton
                        label={`Remove ${f.kind}`}
                        onClick={() =>
                          editRoom(room.id, {
                            furniture: room.furniture.filter(
                              (a) => a.id !== f.id,
                            ),
                          })
                        }
                      >
                        <Trash2 size={13} />
                      </IconButton>
                    </div>
                    <div className="furniture-coordinates">
                      {(["x", "y"] as const).map((k) => (
                        <label key={k}>
                          {k.toUpperCase()}
                          <input
                            aria-label={`${f.kind} ${k} position`}
                            type="number"
                            min="0"
                            max={k === "x" ? room.w : room.d}
                            step=".5"
                            value={f[k]}
                            onChange={(e) =>
                              editRoom(room.id, {
                                furniture: room.furniture.map((a) =>
                                  a.id === f.id
                                    ? {
                                        ...a,
                                        [k]: Math.max(
                                          0,
                                          Math.min(
                                            k === "x" ? room.w : room.d,
                                            +e.target.value,
                                          ),
                                        ),
                                      }
                                    : a,
                                ),
                              })
                            }
                          />
                        </label>
                      ))}
                      <span>{f.rotation}°</span>
                    </div>
                  </div>
                ))}
                <button
                  className="button secondary full"
                  onClick={() =>
                    editRoom(room.id, { furniture: furnish(room) })
                  }
                >
                  <RotateCw size={14} />
                  Reset furniture
                </button>
              </section>
              <section>
                <button
                  className="button danger full"
                  disabled={floor.rooms.length <= 1}
                  onClick={() => {
                    const next = structuredClone(project);
                    next.floors[level].rooms = next.floors[level].rooms.filter(
                      (r) => r.id !== room.id,
                    );
                    change(next);
                    setSelected(null);
                  }}
                >
                  <Trash2 size={14} />
                  Remove room
                </button>
              </section>
            </>
          ) : (
            <>
              <section>
                <div className="area-stat">
                  <span className="stat-icon">
                    <Layers size={21} />
                  </span>
                  <div>
                    <span>Total floor area</span>
                    <strong>
                      {totalArea.toLocaleString()}
                      <small>sq ft</small>
                    </strong>
                  </div>
                </div>
                <div className="small-stats">
                  <div>
                    <strong>
                      {
                        project.floors.flatMap((f) => f.rooms).filter((r) =>
                          ["bedroom", "master"].includes(r.type),
                        ).length
                      }
                    </strong>
                    <span>Bedrooms</span>
                  </div>
                  <div>
                    <strong>
                      {
                        project.floors
                          .flatMap((f) => f.rooms)
                          .filter((r) => r.type === "bathroom").length
                      }
                    </strong>
                    <span>Bathrooms</span>
                  </div>
                  <div>
                    <strong>{project.floors.length}</strong>
                    <span>Floors</span>
                  </div>
                </div>
              </section>
              <section>
                <div className="section-heading">
                  <h3>Vastu alignment</h3>
                  <Compass size={16} />
                </div>
                <div className="score-row">
                  <div
                    className="score-ring"
                    style={{
                      background: `conic-gradient(#4c7761 ${(analysis.score ?? 0) * 3.6}deg,#e8ece4 0)`,
                    }}
                  >
                    <span>
                      {analysis.score ?? "—"}
                      <small>/100</small>
                    </span>
                  </div>
                  <div>
                    <strong>
                      {analysis.score === null
                        ? "Not scored"
                        : analysis.score >= 80
                          ? "Well aligned"
                          : "Room to improve"}
                    </strong>
                    <p>
                      {analysis.checks.filter((c) => c.ok).length} of{" "}
                      {analysis.checks.length} placements
                      <br />
                      match Vastu rules
                    </p>
                  </div>
                </div>
                <button
                  className="text-button arrow-link"
                  onClick={() => {
                    setPanel("vastu");
                    setShowVastu(true);
                  }}
                >
                  View Vastu analysis
                  <ArrowUpRight size={14} />
                </button>
              </section>
              <section>
                <div className="section-heading">
                  <h3>Spaces in your home</h3>
                  <span className="count-badge">{floor.rooms.length}</span>
                </div>
                <div className="room-list">
                  {floor.rooms.map((r) => (
                    <button key={r.id} onClick={() => setSelected(r.id)}>
                      <span
                        className="room-color"
                        style={{ background: roomColors[r.type] }}
                      />
                      <span>{r.name}</span>
                      <small>{Math.round(r.w * r.d)} ft²</small>
                    </button>
                  ))}
                </div>
              </section>
              <section>
                <div className="section-heading">
                  <h3>Building settings</h3>
                </div>
                <label className="field">
                  Floor height (ft)
                  <input
                    type="number"
                    min="8"
                    max="16"
                    step=".5"
                    value={floor.height}
                    onChange={(e) => {
                      const next = structuredClone(project);
                      next.floors[level].height = Math.max(
                        8,
                        Math.min(16, +e.target.value),
                      );
                      change(next);
                    }}
                  />
                </label>
                <label className="field">
                  Wall thickness (ft)
                  <input
                    type="number"
                    min=".2"
                    max="1.5"
                    step=".05"
                    value={project.wallThickness}
                    onChange={(e) =>
                      change({
                        ...project,
                        wallThickness: Math.max(
                          0.2,
                          Math.min(1.5, +e.target.value),
                        ),
                      })
                    }
                  />
                </label>
                <button className="button secondary full" onClick={duplicate}>
                  <Copy size={14} />
                  Duplicate this floor
                </button>
              </section>
            </>
          )}
          <section className="validation-section">
            <div className="section-heading">
              <h3>Plan checks</h3>
              <span className={issues.length ? "warning" : "success"}>
                {issues.length ? `${issues.length} to review` : "Clear"}
              </span>
            </div>
            {issues.length ? (
              issues.map((issue, i) => (
                <div className="validation-message" key={i}>
                  <AlertTriangle size={13} />
                  <span>{issue}</span>
                </div>
              ))
            ) : (
              <div className="validation-message good">
                <CheckCircle2 size={15} />
                Rooms fit inside the site, with no overlaps or furniture outside
                rooms.
              </div>
            )}
            <p className="note">
              Architectural concept only. Access, circulation, structure, and
              local building rules require professional review.
            </p>
          </section>
        </aside>
      </div>
      <input
        ref={file}
        type="file"
        accept=".json,application/json"
        hidden
        onChange={async (e) => {
          const f = e.target.files?.[0];
          if (!f) return;
          try {
            if (f.size > 2_000_000)
              throw Error("Project files must be smaller than 2 MB.");
            const p = parseProject(JSON.parse(await f.text()));
            change(p);
            setLevel(0);
            setSelected(null);
            setToast("Project imported and saved on this device.");
          } catch (err) {
            setToast(
              err instanceof Error ? err.message : "Could not import project.",
            );
          }
          e.target.value = "";
        }}
      />
      {toast && (
        <div className="toast" role="status">
          <span>{toast}</span>
          <IconButton label="Dismiss notification" onClick={() => setToast("")}>
            <X size={16} />
          </IconButton>
        </div>
      )}
      {chat && (
        <div className="modal-backdrop" onClick={() => setChat(false)}>
          <div
            className="modal wide"
            role="dialog"
            aria-modal="true"
            aria-labelledby="dialog-title"
            onClick={(e) => e.stopPropagation()}
          >
            <Chat
              base={project}
              onClose={() => setChat(false)}
              onDesign={(next) => {
                setOptions(next);
                setChat(false);
                setModal(true);
                setFormError("");
              }}
            />
          </div>
        </div>
      )}
      {modal && (
        <div className="modal-backdrop" onClick={() => setModal(false)}>
          <div
            className="modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="dialog-title"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="modal-heading">
              <span className="eyebrow">A NEW BEGINNING</span>
              <IconButton
                label="Close design dialog"
                onClick={() => setModal(false)}
              >
                <X size={20} />
              </IconButton>
            </div>
            <h2 id="dialog-title">Let’s make space for your life.</h2>
            <p className="muted">
              Start with your site. We’ll turn it into three editable concepts.
            </p>
            {!options ? (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  try {
                    if (draft.site.front < draft.site.setback)
                      throw Error(
                        "Front setback must be at least the side setback.",
                      );
                    const opts = [0, 1, 2].map((v) => generate(draft, v));
                    opts.forEach(parseProject);
                    if (draft.requirements.vastu === "Strict") {
                      const strict = opts.filter(
                        (p) => vastu(p, p.floors[0]).score === 100,
                      );
                      if (!strict.length)
                        throw Error(
                          "These templates cannot satisfy every Vastu rule on this site. Choose Balanced to review the compromises and edit the plan.",
                        );
                      setOptions(strict);
                    } else setOptions(opts);
                    setFormError("");
                  } catch (err) {
                    setFormError((err as Error).message);
                  }
                }}
              >
                <label className="field">
                  Describe your home{" "}
                  <span className="optional">
                    optional · local keyword parser
                  </span>
                  <textarea
                    placeholder="A 30 × 40 south-facing home, 3 bedrooms, ₹80 lakh budget…"
                    value={brief}
                    onChange={(e) => setBrief(e.target.value)}
                  />
                </label>
                <button
                  type="button"
                  className="text-button"
                  onClick={() => {
                    setDraft(parseBrief(brief, draft));
                    setFormError(
                      "Recognized site dimensions, bedroom count, facing, and lakh budget are filled below. Other preferences must be set manually.",
                    );
                  }}
                >
                  <Sparkles size={14} />
                  Fill from description
                </button>
                <div className="form-grid">
                  {(["width", "depth", "setback", "front"] as const).map(
                    (k) => (
                      <label className="field" key={k}>
                        {
                          {
                            width: "Site width (ft)",
                            depth: "Site depth (ft)",
                            setback: "Side / rear setback (ft)",
                            front: "Front setback (ft)",
                          }[k]
                        }
                        <input
                          required
                          aria-label={
                            {
                              width: "Site width",
                              depth: "Site depth",
                              setback: "Side setback",
                              front: "Front setback",
                            }[k]
                          }
                          type="number"
                          min={k === "width" ? 26 : k === "depth" ? 32 : 0}
                          max={k === "width" || k === "depth" ? 150 : 15}
                          step=".5"
                          value={draft.site[k]}
                          onChange={(e) =>
                            setDraft({
                              ...draft,
                              site: { ...draft.site, [k]: +e.target.value },
                            })
                          }
                        />
                      </label>
                    ),
                  )}
                  <label className="field">
                    Road & facing
                    <select
                      value={draft.site.facing}
                      onChange={(e) =>
                        setDraft({
                          ...draft,
                          site: {
                            ...draft.site,
                            facing: e.target.value as Direction,
                          },
                        })
                      }
                    >
                      {["North", "South", "East", "West"].map((d) => (
                        <option key={d}>{d}</option>
                      ))}
                    </select>
                  </label>
                  <label className="field">
                    Bedrooms
                    <select
                      value={draft.requirements.bedrooms}
                      onChange={(e) =>
                        setDraft({
                          ...draft,
                          requirements: {
                            ...draft.requirements,
                            bedrooms: +e.target.value,
                          },
                        })
                      }
                    >
                      {[1, 2, 3, 4].map((n) => (
                        <option key={n} value={n}>
                          {n} bedrooms
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="field">
                    Vastu preference
                    <select
                      value={draft.requirements.vastu}
                      onChange={(e) =>
                        setDraft({
                          ...draft,
                          requirements: {
                            ...draft.requirements,
                            vastu: e.target.value as
                              | "Strict"
                              | "Balanced"
                              | "Off",
                          },
                        })
                      }
                    >
                      <option>Balanced</option>
                      <option>Strict</option>
                      <option>Off</option>
                    </select>
                  </label>
                  <label className="field">
                    Budget target (₹ lakh)
                    <input
                      type="number"
                      min="1"
                      max="10000"
                      value={draft.requirements.budget}
                      onChange={(e) =>
                        setDraft({
                          ...draft,
                          requirements: {
                            ...draft.requirements,
                            budget: +e.target.value,
                          },
                        })
                      }
                    />
                  </label>
                </div>
                {formError && (
                  <p className="form-error" role="status">
                    {formError}
                  </p>
                )}
                <div className="modal-footer">
                  <span>
                    Local generation · No API keys
                    <br />
                    <small>
                      Applying a design replaces the current plan. Undo restores
                      it.
                    </small>
                  </span>
                  <button className="button primary" type="submit">
                    <Sparkles size={16} />
                    Generate designs
                  </button>
                </div>
              </form>
            ) : (
              <>
                <div className="options-grid">
                  {options.map((p, i) => (
                    <button
                      className="design-option"
                      key={p.variant}
                      onClick={() => {
                        change(p);
                        setLevel(0);
                        setSelected(null);
                        setModal(false);
                        setMode("2d");
                        setZoom(1);
                        setToast(
                          `Design ${String.fromCharCode(65 + p.variant)} is ready. Select any room to make it yours.`,
                        );
                      }}
                    >
                      <div className="mini-stack">
                        {p.floors.map((f) => (
                          <div className="mini-plan" key={f.id}>
                            <svg
                              viewBox={`0 0 ${p.site.width} ${p.site.depth}`}
                            >
                              {f.rooms.map((r) => (
                                <rect
                                  key={r.id}
                                  x={r.x}
                                  y={r.y}
                                  width={r.w}
                                  height={r.d}
                                  fill={roomColors[r.type]}
                                  stroke="#596650"
                                  strokeWidth=".35"
                                />
                              ))}
                            </svg>
                            <small>{f.name}</small>
                          </div>
                        ))}
                      </div>
                      <span className="eyebrow">
                        OPTION {String.fromCharCode(65 + p.variant)}
                      </span>
                      <h3>
                        {
                          [
                            "A balanced beginning",
                            "Room to unwind",
                            "Space to gather",
                          ][p.variant]
                        }
                      </h3>
                      <div className="detail-line">
                        <span>Vastu rules</span>
                        <strong>
                          {p.requirements.vastu === "Off"
                            ? "Off"
                            : `${Math.round(
                                p.floors.reduce(
                                  (a, f) => a + (vastu(p, f).score ?? 0),
                                  0,
                                ) / p.floors.length,
                              )}%`}
                        </strong>
                      </div>
                      <div className="detail-line">
                        <span>Built area</span>
                        <strong>
                          {Math.round(
                            p.floors.reduce(
                              (a, f) =>
                                a + f.rooms.reduce((n, r) => n + r.w * r.d, 0),
                              0,
                            ),
                          ).toLocaleString()}{" "}
                          sq ft
                        </strong>
                      </div>
                      <div className="detail-line">
                        <span>Plan checks</span>
                        <strong>
                          {p.floors.reduce(
                            (a, f) => a + validate(p, f).length,
                            0,
                          )}{" "}
                          to review
                        </strong>
                      </div>
                      <span className="option-choose">
                        Use this design
                        <ArrowRight size={15} />
                      </span>
                    </button>
                  ))}
                </div>
                <div className="modal-footer">
                  <button
                    className="text-button"
                    onClick={() => setOptions(null)}
                  >
                    <ArrowLeft size={15} />
                    Adjust requirements
                  </button>
                  <span>Select a concept to start editing.</span>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
