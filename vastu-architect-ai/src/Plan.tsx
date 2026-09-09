import { useRef } from "react";
import {
  getOpenings,
  getWalls,
  roomColors,
  round,
  type Project,
  type Floor,
  type Room,
  type Furniture,
} from "./engine";
export function FurnitureDrawing({ item: f }: { item: Furniture }) {
  return (
    <g
      transform={`translate(${f.x} ${f.y}) rotate(${f.rotation} ${f.w / 2} ${f.d / 2})`}
      stroke="#867c69"
      strokeWidth=".055"
      fill="#f9f6ef"
    >
      {f.kind === "bed" ? (
        <>
          <rect width={f.w} height={f.d} rx=".2" fill="#c6b89c" />
          <rect x=".15" y=".35" width={f.w - 0.3} height={f.d - 0.5} rx=".2" />
          <rect x=".35" y=".55" width={f.w / 2 - 0.5} height="1.25" rx=".2" />
          <rect
            x={f.w / 2 + 0.15}
            y=".55"
            width={f.w / 2 - 0.5}
            height="1.25"
            rx=".2"
          />
          <rect
            x=".15"
            y="2.2"
            width={f.w - 0.3}
            height={f.d - 2.35}
            fill="#bdad8f"
          />
          <path d={`M .25 2.55 H ${f.w - 0.25}`} />
        </>
      ) : f.kind === "sofa" ? (
        <>
          <rect width={f.w} height={f.d} rx=".3" fill="#b9b69f" />
          {[0, 1, 2].map((i) => (
            <rect
              key={i}
              x={0.3 + (i * (f.w - 0.6)) / 3}
              y=".6"
              width={(f.w - 0.6) / 3 - 0.06}
              height={f.d - 0.95}
              rx=".15"
              fill="#dedbc9"
            />
          ))}
        </>
      ) : f.kind === "table" ? (
        <>
          <rect x=".7" y="-.4" width="1" height=".6" rx=".2" />
          <rect x=".7" y={f.d - 0.2} width="1" height=".6" rx=".2" />
          <rect x={f.w - 1.7} y="-.4" width="1" height=".6" rx=".2" />
          <rect x={f.w - 1.7} y={f.d - 0.2} width="1" height=".6" rx=".2" />
          <rect width={f.w} height={f.d} rx=".35" fill="#cbb998" />
          <circle cx={f.w / 2} cy={f.d / 2} r=".3" fill="#739078" />
        </>
      ) : f.kind === "toilet" ? (
        <>
          <rect width={f.w} height=".8" rx=".15" />
          <ellipse cx={f.w / 2} cy={f.d * 0.6} rx={f.w * 0.4} ry={f.d * 0.37} />
          <ellipse
            cx={f.w / 2}
            cy={f.d * 0.6}
            rx={f.w * 0.23}
            ry={f.d * 0.24}
            fill="#e2e8e5"
          />
        </>
      ) : (
        <>
          <rect
            width={f.w}
            height={f.d}
            rx=".08"
            fill={f.kind === "counter" ? "#b7bca7" : "#cbbb9f"}
          />
          {f.kind === "counter" && f.w > 4 ? (
            <>
              <rect
                x=".7"
                y=".35"
                width="1.8"
                height="1.2"
                rx=".2"
                fill="#d6dfdc"
              />
              <circle cx={f.w - 1.3} cy="1" r=".55" fill="#6c7366" />
            </>
          ) : (
            <path d={`M ${f.w / 2} 0 V ${f.d}`} />
          )}
        </>
      )}
    </g>
  );
}
interface Props {
  project: Project;
  floor: Floor;
  selected: string | null;
  select: (id: string | null) => void;
  edit: (id: string, patch: Partial<Room>, history?: boolean) => void;
  checkpoint: () => void;
  zoom: number;
  showFurniture: boolean;
  showDimensions: boolean;
  showVastu: boolean;
  measure: boolean;
}
export default function Plan({
  project: p,
  floor,
  selected,
  select,
  edit,
  checkpoint,
  zoom,
  showFurniture,
  showDimensions,
  showVastu,
  measure,
}: Props) {
  const svg = useRef<SVGSVGElement>(null),
    drag = useRef<{
      id: string;
      mode: "move" | "resize";
      sx: number;
      sy: number;
      room: Room;
    } | null>(null);
  const point = (e: React.PointerEvent) => {
    const pt = svg.current!.createSVGPoint();
    pt.x = e.clientX;
    pt.y = e.clientY;
    return pt.matrixTransform(svg.current!.getScreenCTM()!.inverse());
  };
  const start = (e: React.PointerEvent, r: Room, mode: "move" | "resize") => {
    e.stopPropagation();
    select(r.id);
    const pt = point(e);
    checkpoint();
    drag.current = {
      id: r.id,
      mode,
      sx: pt.x,
      sy: pt.y,
      room: structuredClone(r),
    };
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const move = (e: React.PointerEvent) => {
    if (!drag.current) return;
    const a = drag.current,
      pt = point(e),
      dx = Math.round((pt.x - a.sx) * 2) / 2,
      dy = Math.round((pt.y - a.sy) * 2) / 2;
    if (a.mode === "move")
      edit(
        a.id,
        {
          x: round(
            Math.max(
              p.site.setback,
              Math.min(p.site.width - p.site.setback - a.room.w, a.room.x + dx),
            ),
          ),
          y: round(
            Math.max(
              p.site.setback,
              Math.min(p.site.depth - p.site.setback - a.room.d, a.room.y + dy),
            ),
          ),
        },
        false,
      );
    else
      edit(
        a.id,
        {
          w: round(
            Math.max(
              3,
              Math.min(p.site.width - p.site.setback - a.room.x, a.room.w + dx),
            ),
          ),
          d: round(
            Math.max(
              3,
              Math.min(p.site.depth - p.site.setback - a.room.y, a.room.d + dy),
            ),
          ),
        },
        false,
      );
  };
  const walls = getWalls(p, floor),
    openings = getOpenings(p, floor);
  return (
    <div className="plan-stage">
      <svg
        ref={svg}
        id="floor-plan"
        role="img"
        aria-label="Editable floor plan. Select a room to edit its dimensions, or drag to move it."
        viewBox={`-5 -6 ${p.site.width + 10} ${p.site.depth + 13}`}
        style={{ transform: `scale(${zoom})` }}
        onPointerMove={move}
        onPointerUp={() => (drag.current = null)}
        onPointerCancel={() => (drag.current = null)}
        onClick={() => select(null)}
      >
        <defs>
          <pattern
            id="grass"
            width=".8"
            height=".8"
            patternUnits="userSpaceOnUse"
          >
            <rect width=".8" height=".8" fill="#e2e8d9" />
            <circle cx=".2" cy=".2" r=".035" fill="#9cae92" />
          </pattern>
          <pattern
            id="wood"
            width="1.4"
            height="5"
            patternUnits="userSpaceOnUse"
          >
            <rect width="1.4" height="5" fill="#e1d8c6" />
            <path d="M0 0V5M0 2.5H1.4" stroke="#c4b89f" strokeWidth=".025" />
          </pattern>
          <pattern
            id="tile"
            width="1.8"
            height="1.8"
            patternUnits="userSpaceOnUse"
          >
            <rect width="1.8" height="1.8" fill="#e6eded" />
            <path
              d="M0 0H1.8V1.8"
              fill="none"
              stroke="#bfcccb"
              strokeWidth=".025"
            />
          </pattern>
        </defs>
        <rect
          x="0"
          y="0"
          width={p.site.width}
          height={p.site.depth}
          fill="url(#grass)"
          stroke="#91a58b"
          strokeWidth=".08"
          strokeDasharray=".3 .2"
        />
        {Array.from({ length: 8 }, (_, i) => (
          <g
            key={i}
            transform={`translate(${i < 4 ? 1 : p.site.width - 1} ${3 + ((i % 4) * (p.site.depth - 6)) / 3})`}
          >
            <circle r=".65" fill="#a7b79b" />
            <circle cx=".2" cy="-.15" r=".45" fill="#bac8ac" />
          </g>
        ))}
        {floor.rooms.map((r) => (
          <g
            key={r.id}
            tabIndex={0}
            role="button"
            aria-label={`Select ${r.name}`}
            onKeyDown={(e) => {
              if (e.key === "Enter") select(r.id);
            }}
            onClick={(e) => {
              e.stopPropagation();
              select(r.id);
            }}
            onPointerDown={(e) => start(e, r, "move")}
            className="plan-room"
          >
            <rect
              x={r.x}
              y={r.y}
              width={r.w}
              height={r.d}
              fill={
                r.material === "wood"
                  ? "url(#wood)"
                  : r.material === "tile"
                    ? "url(#tile)"
                    : roomColors[r.type]
              }
            />
            {showFurniture && (
              <g transform={`translate(${r.x} ${r.y})`} pointerEvents="none">
                {r.furniture.map((f) => (
                  <FurnitureDrawing key={f.id} item={f} />
                ))}
              </g>
            )}
            <g pointerEvents="none">
              <rect
                x={r.x + 0.2}
                y={r.y + r.d * 0.64}
                width={r.w - 0.4}
                height="1.9"
                rx=".15"
                fill="#fffcf2"
                opacity=".8"
              />
              <text
                x={r.x + r.w / 2}
                y={r.y + r.d * 0.64 + 0.75}
                textAnchor="middle"
                fill="#454b40"
                fontSize={r.type === "hall" ? ".47" : ".6"}
                fontWeight="600"
              >
                {r.name}
              </text>
              {showDimensions && (
                <text
                  x={r.x + r.w / 2}
                  y={r.y + r.d * 0.64 + 1.4}
                  textAnchor="middle"
                  fill="#7c8073"
                  fontSize=".46"
                >
                  {r.w.toFixed(1)}′ × {r.d.toFixed(1)}′
                </text>
              )}
            </g>
          </g>
        ))}
        <g pointerEvents="none">
          {walls
            .filter((w) => w.bottom === 0)
            .map((w, i) => (
              <line
                key={i}
                x1={w.axis === "h" ? w.start : w.fixed}
                y1={w.axis === "h" ? w.fixed : w.start}
                x2={w.axis === "h" ? w.end : w.fixed}
                y2={w.axis === "h" ? w.fixed : w.end}
                stroke={w.top === 3 ? "#9eb1af" : "#51574b"}
                strokeWidth={w.top === 3 ? 0.15 : p.wallThickness}
              />
            ))}
          {openings
            .filter((o) => o.kind === "door")
            .map((o, i) => (
              <g
                key={i}
                transform={
                  o.axis === "h"
                    ? `translate(${o.start} ${o.fixed})`
                    : `translate(${o.fixed} ${o.start}) rotate(90)`
                }
                fill="none"
                stroke="#8d937f"
                strokeWidth=".07"
              >
                <path
                  d={`M0 0 V${o.end - o.start} A${o.end - o.start} ${o.end - o.start} 0 0 0 ${o.end - o.start} 0`}
                  strokeDasharray=".12 .06"
                />
                <path d={`M0 0 V${o.end - o.start}`} strokeWidth=".12" />
              </g>
            ))}
        </g>
        {selected &&
          floor.rooms
            .filter((r) => r.id === selected)
            .map((r) => (
              <g key={r.id}>
                <rect
                  x={r.x}
                  y={r.y}
                  width={r.w}
                  height={r.d}
                  fill="none"
                  stroke="#42785f"
                  strokeWidth=".13"
                  pointerEvents="none"
                />
                <rect
                  role="button"
                  aria-label="Resize selected room"
                  x={r.x + r.w - 0.4}
                  y={r.y + r.d - 0.4}
                  width=".8"
                  height=".8"
                  rx=".1"
                  fill="#356a51"
                  stroke="white"
                  strokeWidth=".12"
                  style={{ cursor: "nwse-resize" }}
                  onClick={(e) => e.stopPropagation()}
                  onPointerDown={(e) => start(e, r, "resize")}
                />
              </g>
            ))}
        {showVastu && (
          <g pointerEvents="none">
            {[1, 2].map((i) => (
              <g key={i}>
                <path
                  d={`M${(p.site.width * i) / 3} 0V${p.site.depth}M0 ${(p.site.depth * i) / 3}H${p.site.width}`}
                  stroke="#b98c49"
                  strokeWidth=".08"
                  strokeDasharray=".4 .2"
                />
              </g>
            ))}
            {["NW", "N", "NE", "W", "CENTER", "E", "SW", "S", "SE"].map(
              (s, i) => (
                <text
                  key={s}
                  x={(p.site.width * ((i % 3) + 0.5)) / 3}
                  y={(p.site.depth * (Math.floor(i / 3) + 0.5)) / 3}
                  textAnchor="middle"
                  fontSize="1.8"
                  fill="#a17838"
                  opacity=".5"
                >
                  {s}
                </text>
              ),
            )}
          </g>
        )}
        {(showDimensions || measure) && (
          <g stroke="#9b9e8f" strokeWidth=".055" fill="#717969" fontSize=".6">
            <path
              d={`M0 -1.6H${p.site.width}M0 -2.1V-.8M${p.site.width} -2.1V-.8M-1.6 0V${p.site.depth}M-2.1 0H-.8M-2.1 ${p.site.depth}H-.8`}
            />
            <text
              x={p.site.width / 2}
              y="-2.1"
              stroke="none"
              textAnchor="middle"
            >
              {p.site.width}′–0″
            </text>
            <text
              transform={`translate(-2.2 ${p.site.depth / 2}) rotate(-90)`}
              stroke="none"
              textAnchor="middle"
            >
              {p.site.depth}′–0″
            </text>
          </g>
        )}
        <g fill="#7a8275" fontSize=".55" textAnchor="middle">
          <text x={p.site.width / 2} y={p.site.depth + 2}>
            SOUTH
          </text>
          <text x={p.site.width / 2} y="-4">
            NORTH
          </text>
        </g>
        <g
          transform={
            p.site.facing === "South"
              ? `translate(0 ${p.site.depth + 3})`
              : p.site.facing === "North"
                ? "translate(0 -5.6)"
                : p.site.facing === "East"
                  ? `translate(${p.site.width + 3} 0) rotate(90)`
                  : "translate(-3 0) rotate(90)"
          }
        >
          <rect
            width={
              ["South", "North"].includes(p.site.facing)
                ? p.site.width
                : p.site.depth
            }
            height="1.5"
            fill="#e6e5de"
          />
          <text
            x={
              (["South", "North"].includes(p.site.facing)
                ? p.site.width
                : p.site.depth) / 2
            }
            y="1"
            fontSize=".55"
            textAnchor="middle"
            fill="#8a8e83"
          >
            ACCESS ROAD · {p.site.facing.toUpperCase()}
          </text>
        </g>
      </svg>
    </div>
  );
}
