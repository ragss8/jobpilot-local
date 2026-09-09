import {
  canWalk,
  getWalls,
  type Project,
  type Floor,
  type Room,
} from "./engine";
export type Mood = "day" | "sunset" | "evening";
export type Palette = "warm" | "sage" | "ink";
export const palettes = {
  warm: {
    label: "Warm neutral",
    fabric: "#d2c5b0",
    accent: "#a47752",
    cabinet: "#b5a48c",
    wall: "#ede9e0",
  },
  sage: {
    label: "Sage & oak",
    fabric: "#9aa18a",
    accent: "#738268",
    cabinet: "#7d8c74",
    wall: "#ebece2",
  },
  ink: {
    label: "Soft charcoal",
    fabric: "#777e83",
    accent: "#53626b",
    cabinet: "#5b6569",
    wall: "#e8e8e3",
  },
};
export function roomView(p: Project, f: Floor, r: Room) {
  const walls = getWalls(p, f);
  const targets = [
    [0.83, 0.86],
    [0.7, 0.83],
    [0.5, 0.85],
    [0.82, 0.55],
    [0.5, 0.5],
    [0.2, 0.8],
    [0.85, 0.2],
  ];
  for (let y = 0.8; y > 0.1; y -= 0.15)
    for (let x = 0.8; x > 0.1; x -= 0.15) targets.push([x, y]);
  for (const [u, v] of targets) {
    const x = r.x + r.w * u,
      z = r.y + r.d * v;
    if (canWalk(x, z, p, f, walls)) {
      const target = r.furniture.find((a) =>
        ["sofa", "bed", "counter", "altar", "desk"].includes(a.kind),
      );
      const tx = target ? r.x + target.x + target.w / 2 : r.x + r.w / 2,
        tz = target ? r.y + target.y + target.d / 2 : r.y + r.d * 0.25;
      return { x, z, yaw: Math.atan2(-(tx - x), -(tz - z)), pitch: -0.035 };
    }
  }
  return null;
}
export function initialRoom(p: Project, f: Floor) {
  return (
    [
      ...f.rooms.filter((r) => r.type === "living"),
      ...f.rooms.filter((r) => r.type !== "living"),
    ].find((r) => roomView(p, f, r)) ?? f.rooms[0]
  );
}
