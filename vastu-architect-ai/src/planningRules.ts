import type { RoomType } from "./engine";
/** Product design targets in feet, not statutory building-code minima. */
export const ROOM_STANDARDS: Partial<
  Record<RoomType, { minimum: [number, number]; preferred: [number, number] }>
> = {
  living: { minimum: [10, 12], preferred: [12, 15] },
  bedroom: { minimum: [9, 10], preferred: [11, 12] },
  master: { minimum: [10, 12], preferred: [12, 14] },
  kitchen: { minimum: [7, 9], preferred: [10, 11] },
  bathroom: { minimum: [4, 7], preferred: [5, 8] },
  theatre: { minimum: [9, 12], preferred: [12, 16] },
  dining: { minimum: [8, 9], preferred: [10, 12] },
  office: { minimum: [7, 9], preferred: [10, 11] },
  pooja: { minimum: [4, 5], preferred: [5, 7] },
  utility: { minimum: [4, 5], preferred: [5, 7] },
  store: { minimum: [4, 5], preferred: [5, 7] },
  jacuzzi: { minimum: [8, 8], preferred: [9, 10] },
  seating: { minimum: [7, 8], preferred: [10, 12] },
  garden: { minimum: [4, 5], preferred: [8, 10] },
  balcony: { minimum: [4, 5], preferred: [5, 10] },
};
export function meetsSize(w: number, d: number, size: [number, number]) {
  const [a, b] = [w, d].sort((a, b) => a - b),
    [c, e] = [...size].sort((a, b) => a - b);
  return a + 0.01 >= c && b + 0.01 >= e;
}
