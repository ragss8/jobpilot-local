/** Orthographic elevations, drawn from the same model as the plans.
 *
 *  An elevation is a straight-on projection of one face: no perspective, so
 *  heights and widths can be read off it. Each storey contributes its outline,
 *  its openings, and the sunshades above them; the roof contributes a parapet.
 *  Concept drawings, not construction drawings. */
import {
  PARAPET,
  floorBase,
  floorBounds,
  getOpenings,
  type Direction,
  type Project,
} from "./engine";
export const SIDES: Direction[] = ["North", "East", "South", "West"];
/** Sill and head of a window, matching the wall segments `getWalls` leaves. */
const SILL = 3,
  HEAD = 7,
  DOOR_HEAD = 7,
  CHAJJA = 0.3;
interface Band {
  /** Position across the face, in feet from the left of the drawing. */
  u: number;
  /** Width across the face. */
  w: number;
  bottom: number;
  top: number;
  kind: "door" | "window";
}
interface Storey {
  name: string;
  base: number;
  height: number;
  from: number;
  to: number;
  parapet: boolean;
  /** A stilt reads as an open deck on piers, not a solid face. */
  open: boolean;
  bands: Band[];
}
/** Everything visible on one face, in feet, ready to be drawn. */
export function elevation(p: Project, side: Direction) {
  // Faces are read left to right; two of them mirror so the drawing keeps a
  // consistent handedness rather than reading backwards.
  const vertical = side === "North" || side === "South";
  const extent = vertical ? p.site.width : p.site.depth;
  const flip = side === "South" || side === "West";
  const across = (v: number) => (flip ? extent - v : v);
  const storeys: Storey[] = [];
  for (const [i, f] of p.floors.entries()) {
    if (!f.rooms.length) continue;
    const b = floorBounds(f),
      base = floorBase(p, i);
    const lo = vertical ? b.minX : b.minY,
      hi = vertical ? b.maxX : b.maxY;
    const face = vertical
      ? side === "North"
        ? b.minY
        : b.maxY
      : side === "West"
        ? b.minX
        : b.maxX;
    const bands: Band[] = [];
    for (const o of getOpenings(p, f)) {
      const onFace =
        (vertical ? o.axis === "h" : o.axis === "v") &&
        Math.abs(o.fixed - face) < 0.03;
      if (!onFace) continue;
      bands.push({
        u: Math.min(across(o.start), across(o.end)),
        w: Math.abs(o.end - o.start),
        bottom: o.kind === "window" ? SILL : 0,
        top: o.kind === "window" ? HEAD : DOOR_HEAD,
        kind: o.kind,
      });
    }
    storeys.push({
      name: f.name,
      base,
      height: f.height,
      from: Math.min(across(lo), across(hi)),
      to: Math.max(across(lo), across(hi)),
      parapet: f.role === "terrace",
      open: f.role === "stilt",
      bands,
    });
  }
  const total = storeys.reduce((s, f) => Math.max(s, f.base + f.height), 0);
  return { side, extent, storeys, total, flip };
}
const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
/** Render one elevation as a standalone SVG. */
export function elevationSvg(p: Project, side: Direction) {
  const e = elevation(p, side);
  const pad = 5,
    labels = 13;
  // Drawing space is in feet, flipped so that y grows upward like a building.
  const w = e.extent + pad * 2 + labels,
    h = e.total + PARAPET + pad * 2 + 5;
  const y = (ft: number) => h - pad - 4 - ft;
  const parts: string[] = [];
  parts.push(
    `<rect width="${w}" height="${h}" fill="#fbfaf5"/>`,
    // Ground line, drawn well past the house so it reads as a datum.
    `<path d="M ${pad - 4} ${y(0)} H ${w - pad + 2}" stroke="#8b9482" stroke-width=".18"/>`,
  );
  for (const s of e.storeys) {
    const left = labels + pad + s.from,
      width = s.to - s.from;
    parts.push(
      `<rect x="${left.toFixed(2)}" y="${y(s.base + s.height).toFixed(2)}" width="${width.toFixed(2)}" height="${s.height.toFixed(2)}" fill="${s.open ? "#f7f5ee" : "#f0ede3"}" stroke="#5b6653" stroke-width=".16"/>`,
    );
    if (s.open) {
      // Piers carrying the floor above, with the parking open between them.
      const piers = Math.max(2, Math.round(width / 9));
      for (let i = 0; i <= piers; i++) {
        const px = left + (i * width) / piers - (i === 0 ? 0 : i === piers ? 1.1 : 0.55);
        parts.push(
          `<rect x="${px.toFixed(2)}" y="${y(s.base + s.height).toFixed(2)}" width="1.1" height="${s.height.toFixed(2)}" fill="#e8e4d8" stroke="#5b6653" stroke-width=".12"/>`,
        );
      }
      parts.push(
        `<text x="${(left + width / 2).toFixed(2)}" y="${y(s.base + s.height / 2).toFixed(2)}" text-anchor="middle" font-size="1.35" fill="#9aa38f" font-family="Georgia, serif">open parking</text>`,
      );
    }
    if (s.parapet)
      parts.push(
        `<rect x="${(left - 0.45).toFixed(2)}" y="${y(s.base + PARAPET).toFixed(2)}" width="${(width + 0.9).toFixed(2)}" height="${PARAPET}" fill="#e6e1d2" stroke="#5b6653" stroke-width=".16"/>`,
      );
    for (const b of s.bands) {
      const bx = labels + pad + b.u;
      parts.push(
        `<rect x="${bx.toFixed(2)}" y="${y(s.base + b.top).toFixed(2)}" width="${b.w.toFixed(2)}" height="${(b.top - b.bottom).toFixed(2)}" fill="${b.kind === "window" ? "#cfdde2" : "#b08c5f"}" stroke="#404a3c" stroke-width=".13"/>`,
      );
      if (b.kind === "window") {
        const mid = bx + b.w / 2;
        parts.push(
          `<path d="M ${mid.toFixed(2)} ${y(s.base + b.top).toFixed(2)} V ${y(s.base + b.bottom).toFixed(2)}" stroke="#5f6d72" stroke-width=".1"/>`,
          // The chajja that shades it.
          `<rect x="${(bx - 0.8).toFixed(2)}" y="${y(s.base + b.top + CHAJJA + 0.35).toFixed(2)}" width="${(b.w + 1.6).toFixed(2)}" height="${CHAJJA}" fill="#ded8c9" stroke="#5b6653" stroke-width=".1"/>`,
        );
      }
    }
    // Level line and its height above ground.
    parts.push(
      `<path d="M ${pad - 2} ${y(s.base).toFixed(2)} H ${(labels + pad + s.from).toFixed(2)}" stroke="#a9b19c" stroke-width=".08" stroke-dasharray="1 .7"/>`,
      `<text x="${pad - 2}" y="${(y(s.base) - 0.7).toFixed(2)}" font-size="1.5" fill="#6d7768" font-family="Georgia, serif">${esc(s.name)}</text>`,
      `<text x="${pad - 2}" y="${(y(s.base) + 1.5).toFixed(2)}" font-size="1.25" fill="#97a08d" font-family="Georgia, serif">+${s.base.toFixed(1)} ft</text>`,
    );
  }
  parts.push(
    `<text x="${(w / 2).toFixed(2)}" y="${(h - 1.6).toFixed(2)}" text-anchor="middle" font-size="1.9" fill="#4d5748" font-family="Georgia, serif">${side} elevation · ${esc(p.name)}</text>`,
  );
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w.toFixed(2)} ${h.toFixed(2)}" width="${(w * 12).toFixed(0)}" height="${(h * 12).toFixed(0)}">${parts.join("")}</svg>`;
}
