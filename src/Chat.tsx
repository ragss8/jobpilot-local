/** Describe a house in prose, check what was understood, then build it.
 *
 *  The confirmation step is not politeness. A local model reliably gets the
 *  shape of a brief right and just as reliably drops a modifier - "spacious",
 *  "attached", "master" - so the program it returns is shown back as
 *  something you can correct before any geometry is generated. */
import { useEffect, useRef, useState } from "react";
import {
  ArrowRight,
  Check,
  Loader2,
  Plus,
  RotateCcw,
  Sparkles,
  Trash2,
  TriangleAlert,
  X,
} from "lucide-react";
import {
  RECOMMENDED,
  briefSpaceTypes,
  checkOllama,
  extractBrief,
  label,
  normalizeBrief,
  type Brief,
  type BriefSpaceType,
  type OllamaStatus,
  type SpaceRequest,
} from "./brief";
import { generateFromBrief } from "./layout";
import type { Direction, FloorRole, Project } from "./engine";
const EXAMPLE = `I have a 30 x 48 ft north-facing site. I want to build a Ground + 2-floor independent house with a terrace.

The ground floor should mainly be used for parking, along with the required staircase, entrance, and utility areas.

The actual house should start from the first floor. On the first floor, I want a spacious living hall, one bedroom, an open kitchen, a pooja room, and a common bathroom.

On the second floor, I want two spacious master bedrooms with attached bathrooms and a dedicated home theatre.

The top level should be an open terrace, preferably with a good seating area and landscaping.`;
const ROLES: FloorRole[] = ["stilt", "residential", "terrace"];
const ROLE_LABEL: Record<FloorRole, string> = {
  stilt: "Parking level",
  residential: "Lived-in floor",
  terrace: "Open terrace",
};
const blankSpace = (): SpaceRequest => ({
  type: "bedroom",
  count: 1,
  spacious: false,
  attachedBath: false,
  open: false,
});
export default function Chat({
  base,
  onDesign,
  onClose,
}: {
  base: Project;
  onDesign: (options: Project[]) => void;
  onClose: () => void;
}) {
  const [text, setText] = useState(""),
    [status, setStatus] = useState<OllamaStatus | null>(null),
    [model, setModel] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [brief, setBrief] = useState<Brief | null>(null),
    [elapsed, setElapsed] = useState(0);
  const abort = useRef<AbortController | null>(null);
  const box = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    checkOllama().then((s) => {
      setStatus(s);
      if (s.model) setModel(s.model);
    });
    box.current?.focus();
    return () => abort.current?.abort();
  }, []);
  useEffect(() => {
    if (!busy) return setElapsed(0);
    const id = setInterval(() => setElapsed((n) => n + 1), 1000);
    return () => clearInterval(id);
  }, [busy]);
  const understand = async () => {
    if (!text.trim() || busy) return;
    setBusy(true);
    setError("");
    abort.current = new AbortController();
    try {
      const raw = await extractBrief(text, {
        model: model || undefined,
        signal: abort.current.signal,
      });
      setBrief(normalizeBrief(raw));
    } catch (err) {
      const e = err as Error;
      setError(
        e.name === "AbortError" ? "Stopped." : e.message || "Extraction failed.",
      );
    } finally {
      setBusy(false);
    }
  };
  /** Edit the understood program in place. */
  const patch = (fn: (b: Brief) => void) =>
    setBrief((prev) => {
      if (!prev) return prev;
      const next = structuredClone(prev);
      fn(next);
      return next;
    });
  const design = () => {
    if (!brief) return;
    try {
      onDesign([0, 1, 2].map((v) => generateFromBrief(base, brief, v)));
    } catch (err) {
      setError((err as Error).message);
    }
  };
  const totalSpaces =
    brief?.floors.reduce((n, f) => n + f.spaces.length, 0) ?? 0;
  return (
    <div className="chat">
      <div className="chat-head">
        <div>
          <span className="eyebrow">DESCRIBE YOUR HOME</span>
          <h2 id="dialog-title">Tell us about the house you want.</h2>
        </div>
        <button className="icon-button" onClick={onClose} aria-label="Close">
          <X size={17} />
        </button>
      </div>
      {status && !status.ok ? (
        <div className="chat-warn">
          <TriangleAlert size={16} />
          <div>
            <strong>The local model is not available.</strong>
            <p>{status.error}</p>
            <p className="muted tiny">
              Everything stays on this computer. Nothing is sent anywhere.
            </p>
          </div>
        </div>
      ) : null}
      {!brief ? (
        <>
          <label className="field">
            Your brief
            <textarea
              ref={box}
              className="chat-input"
              rows={9}
              placeholder="Describe the site, the floors, and the rooms you want on each…"
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) understand();
              }}
            />
          </label>
          <div className="chat-row">
            <button
              className="text-button"
              type="button"
              onClick={() => setText(EXAMPLE)}
            >
              <Sparkles size={14} />
              Use the example brief
            </button>
            {status?.models.length ? (
              <label className="chat-model">
                Model
                <select
                  value={model}
                  onChange={(e) => setModel(e.target.value)}
                >
                  {status.models.map((m) => (
                    <option key={m}>{m}</option>
                  ))}
                </select>
              </label>
            ) : null}
          </div>
          {error ? <p className="form-error">{error}</p> : null}
          <div className="modal-footer">
            {busy ? (
              <button
                className="text-button"
                onClick={() => abort.current?.abort()}
              >
                Stop
              </button>
            ) : (
              <span className="muted tiny">
                A {RECOMMENDED.split(":")[0]}-class model reads this in about
                half a minute, entirely offline.
              </span>
            )}
            <button
              className="button primary"
              disabled={busy || !text.trim() || (status ? !status.ok : true)}
              onClick={understand}
            >
              {busy ? (
                <>
                  <Loader2 size={15} className="spin" />
                  Reading your brief… {elapsed}s
                </>
              ) : (
                <>
                  Understand my brief
                  <ArrowRight size={15} />
                </>
              )}
            </button>
          </div>
        </>
      ) : (
        <>
          <p className="muted">
            Here is what we understood. Correct anything that is wrong before we
            draw it — the model can drop a word like “spacious” or “attached”.
          </p>
          <div className="chat-site">
            <label className="field">
              Width (ft)
              <input
                type="number"
                value={brief.site.width}
                onChange={(e) =>
                  patch((b) => {
                    b.site.width = +e.target.value;
                  })
                }
              />
            </label>
            <label className="field">
              Depth (ft)
              <input
                type="number"
                value={brief.site.depth}
                onChange={(e) =>
                  patch((b) => {
                    b.site.depth = +e.target.value;
                  })
                }
              />
            </label>
            <label className="field">
              Facing
              <select
                value={brief.site.facing}
                onChange={(e) =>
                  patch((b) => {
                    b.site.facing = e.target.value as Direction;
                  })
                }
              >
                {["North", "East", "South", "West"].map((d) => (
                  <option key={d}>{d}</option>
                ))}
              </select>
            </label>
          </div>
          <div className="chat-floors">
            {brief.floors.map((f, fi) => (
              <div className="chat-floor" key={fi}>
                <div className="chat-floor-head">
                  <input
                    className="chat-floor-name"
                    value={f.label}
                    aria-label={`Name of level ${fi + 1}`}
                    onChange={(e) =>
                      patch((b) => {
                        b.floors[fi].label = e.target.value;
                      })
                    }
                  />
                  <select
                    value={f.role}
                    aria-label={`Kind of level ${fi + 1}`}
                    onChange={(e) =>
                      patch((b) => {
                        b.floors[fi].role = e.target.value as FloorRole;
                      })
                    }
                  >
                    {ROLES.map((r) => (
                      <option key={r} value={r}>
                        {ROLE_LABEL[r]}
                      </option>
                    ))}
                  </select>
                  <button
                    className="icon-button"
                    aria-label={`Remove level ${fi + 1}`}
                    disabled={brief.floors.length < 2}
                    onClick={() =>
                      patch((b) => {
                        b.floors.splice(fi, 1);
                      })
                    }
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
                <div className="chat-spaces">
                  {f.spaces.map((s, si) => (
                    <div className="chat-space" key={si}>
                      <select
                        value={s.type}
                        aria-label="Space"
                        onChange={(e) =>
                          patch((b) => {
                            b.floors[fi].spaces[si].type = e.target
                              .value as BriefSpaceType;
                          })
                        }
                      >
                        {briefSpaceTypes.map((t) => (
                          <option key={t} value={t}>
                            {label({ type: t })}
                          </option>
                        ))}
                      </select>
                      <div className="chat-count">
                        <button
                          aria-label="One fewer"
                          onClick={() =>
                            patch((b) => {
                              const sp = b.floors[fi].spaces[si];
                              sp.count = Math.max(1, sp.count - 1);
                            })
                          }
                        >
                          –
                        </button>
                        <span>{s.count}</span>
                        <button
                          aria-label="One more"
                          onClick={() =>
                            patch((b) => {
                              const sp = b.floors[fi].spaces[si];
                              sp.count = Math.min(6, sp.count + 1);
                            })
                          }
                        >
                          +
                        </button>
                      </div>
                      {(
                        [
                          ["spacious", "Spacious"],
                          ["attachedBath", "Attached bath"],
                          ["open", "Open"],
                        ] as const
                      ).map(([key, name]) => (
                        <button
                          key={key}
                          className={`chip${s[key] ? " on" : ""}`}
                          aria-pressed={s[key]}
                          onClick={() =>
                            patch((b) => {
                              const sp = b.floors[fi].spaces[si];
                              sp[key] = !sp[key];
                            })
                          }
                        >
                          {s[key] ? <Check size={12} /> : null}
                          {name}
                        </button>
                      ))}
                      <button
                        className="icon-button"
                        aria-label={`Remove ${label(s)}`}
                        onClick={() =>
                          patch((b) => {
                            b.floors[fi].spaces.splice(si, 1);
                          })
                        }
                      >
                        <X size={13} />
                      </button>
                    </div>
                  ))}
                  <button
                    className="text-button"
                    onClick={() =>
                      patch((b) => {
                        b.floors[fi].spaces.push(blankSpace());
                      })
                    }
                  >
                    <Plus size={13} />
                    Add a space
                  </button>
                </div>
              </div>
            ))}
            <button
              className="button secondary full"
              disabled={brief.floors.length >= 5}
              onClick={() =>
                patch((b) => {
                  b.floors.push({
                    label: `Level ${b.floors.length + 1}`,
                    role: "residential",
                    spaces: [blankSpace()],
                  });
                })
              }
            >
              <Plus size={14} />
              Add a level
            </button>
          </div>
          {error ? <p className="form-error">{error}</p> : null}
          <div className="modal-footer">
            <button
              className="text-button"
              onClick={() => {
                setBrief(null);
                setError("");
              }}
            >
              <RotateCcw size={14} />
              Edit the brief
            </button>
            <button
              className="button primary"
              disabled={!totalSpaces}
              onClick={design}
            >
              Design my house
              <ArrowRight size={15} />
            </button>
          </div>
        </>
      )}
    </div>
  );
}
