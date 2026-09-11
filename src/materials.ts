import * as THREE from "three";
import type { Material } from "./engine";
import { palettes, type Palette } from "./presentation";
export function createMaterials(renderer: THREE.WebGLRenderer) {
  const textures = new Set<THREE.Texture>(),
    materials = new Set<THREE.Material>();
  let seed = 42;
  const rand = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  const canvas = (
    paint: (ctx: CanvasRenderingContext2D, n: number) => void,
    n = 512,
  ) => {
    const c = document.createElement("canvas");
    c.width = c.height = n;
    const ctx = c.getContext("2d")!;
    paint(ctx, n);
    const t = new THREE.CanvasTexture(c);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
    textures.add(t);
    return t;
  };
  const fabric = canvas((c, n) => {
    c.fillStyle = "#d8d2c6";
    c.fillRect(0, 0, n, n);
    for (let x = 0; x < n; x += 2) {
      c.strokeStyle = `rgba(70,63,52,${0.06 + rand() * 0.08})`;
      c.beginPath();
      c.moveTo(x, 0);
      c.lineTo(x, n);
      c.stroke();
    }
    for (let y = 0; y < n; y += 2) {
      c.strokeStyle = `rgba(255,255,255,${rand() * 0.25})`;
      c.beginPath();
      c.moveTo(0, y);
      c.lineTo(n, y);
      c.stroke();
    }
  });
  const stone = canvas((c, n) => {
    c.fillStyle = "#f1eee5";
    c.fillRect(0, 0, n, n);
    for (let i = 0; i < 19; i++) {
      c.beginPath();
      let x = rand() * n;
      c.moveTo(x, 0);
      for (let y = 0; y <= n; y += 12) {
        x += Math.sin(y * 0.018 + i) * 7 + (rand() - 0.5) * 18;
        c.lineTo(x, y);
      }
      c.strokeStyle = `rgba(137,129,109,${0.04 + rand() * 0.13})`;
      c.lineWidth = 0.5 + rand() * 2;
      c.stroke();
    }
    c.strokeStyle = "#d9d5c9";
    c.lineWidth = 1;
    c.strokeRect(0, 0, n, n);
  });
  const tile = canvas((c, n) => {
    c.fillStyle = "#d0d8cd";
    c.fillRect(0, 0, n, n);
    for (let i = 0; i < 4000; i++) {
      c.fillStyle = rand() > 0.5 ? "#ffffff09" : "#30453006";
      c.fillRect(rand() * n, rand() * n, 3, 3);
    }
    c.strokeStyle = "#efeee7";
    c.lineWidth = 3;
    for (let i = 0; i < n; i += n / 4) {
      c.beginPath();
      c.moveTo(i, 0);
      c.lineTo(i, n);
      c.moveTo(0, i);
      c.lineTo(n, i);
      c.stroke();
    }
  });
  const terrazzo = canvas((c, n) => {
    c.fillStyle = "#dad7cf";
    c.fillRect(0, 0, n, n);
    const cols = ["#b6b6a4", "#8e9685", "#f3eee1", "#b3a18a", "#cac1b4"];
    for (let i = 0; i < 2300; i++) {
      const x = rand() * n,
        y = rand() * n,
        r = 1 + rand() * 4;
      c.fillStyle = cols[i % cols.length];
      c.beginPath();
      c.moveTo(x - r, y);
      c.lineTo(x, y - r);
      c.lineTo(x + r, y + r * 0.5);
      c.lineTo(x - r * 0.5, y + r);
      c.fill();
    }
  });
  const wood = canvas((c, n) => {
    c.fillStyle = "#a68b66";
    c.fillRect(0, 0, n, n);
    for (let i = 0; i < 180; i++) {
      c.strokeStyle = `rgba(${rand() > 0.5 ? "63,39,20" : "218,186,129"},${rand() * 0.12})`;
      c.beginPath();
      const x = rand() * n;
      c.moveTo(x, 0);
      for (let y = 0; y < n; y += 10)
        c.lineTo(x + Math.sin(y * 0.03 + i) * 2, y);
      c.stroke();
    }
  });
  const art = canvas((c, n) => {
    c.fillStyle = "#e7e1d5";
    c.fillRect(0, 0, n, n);
    c.fillStyle = "#ab8a63";
    c.beginPath();
    c.arc(n * 0.43, n * 0.43, n * 0.23, Math.PI, 0);
    c.lineTo(n * 0.66, n);
    c.lineTo(n * 0.2, n);
    c.fill();
    c.fillStyle = "#485945";
    c.beginPath();
    c.ellipse(n * 0.78, n * 0.78, n * 0.42, n * 0.19, -0.6, 0, Math.PI * 2);
    c.fill();
    c.strokeStyle = "#645a48";
    c.lineWidth = 3;
    for (let i = 0; i < 6; i++) {
      c.beginPath();
      c.ellipse(
        n * 0.45,
        n * 0.37,
        n * (0.22 + i * 0.017),
        n * (0.3 + i * 0.013),
        0,
        Math.PI,
        Math.PI * 2,
      );
      c.stroke();
    }
  });
  const standard = (params: THREE.MeshStandardMaterialParameters) => {
    const m = new THREE.MeshStandardMaterial(params);
    materials.add(m);
    return m;
  };
  const base = {
    wall: standard({ color: palettes.warm.wall, roughness: 0.92 }),
    ceiling: standard({ color: "#f5f3eb", roughness: 0.9 }),
    trim: standard({ color: "#e5dfd2", roughness: 0.55 }),
    wood: standard({ map: wood, color: "#b4a58e", roughness: 0.48 }),
    darkwood: standard({ map: wood, color: "#6c5542", roughness: 0.4 }),
    fabric: standard({
      map: fabric,
      color: palettes.warm.fabric,
      roughness: 0.96,
    }),
    accent: standard({
      map: fabric,
      color: palettes.warm.accent,
      roughness: 0.91,
    }),
    linen: standard({
      map: fabric,
      color: "#fffaf0",
      roughness: 1,
      side: THREE.DoubleSide,
    }),
    rug: standard({ map: fabric, color: "#c8b99e", roughness: 1 }),
    cabinet: standard({ color: palettes.warm.cabinet, roughness: 0.5 }),
    stone: standard({ map: stone, roughness: 0.2, metalness: 0.05 }),
    brass: standard({ color: "#b7995d", metalness: 0.8, roughness: 0.3 }),
    black: standard({ color: "#272d2a", roughness: 0.4, metalness: 0.25 }),
    white: standard({ color: "#f4f3ed", roughness: 0.23 }),
    leaf: standard({ color: "#537048", roughness: 0.75 }),
    terracotta: standard({ color: "#ac9274", roughness: 0.8 }),
    art: standard({ map: art, roughness: 0.9 }),
    light: standard({
      color: "#fff4d4",
      emissive: "#ffd9a0",
      emissiveIntensity: 2.2,
    }),
    glass: new THREE.MeshPhysicalMaterial({
      color: "#dde8e8",
      transparent: true,
      opacity: 0.13,
      roughness: 0.08,
      metalness: 0.1,
      side: THREE.DoubleSide,
    }),
  };
  materials.add(base.glass);
  const loader = new THREE.TextureLoader();
  const woodMaps: {
    map?: THREE.Texture;
    normalMap?: THREE.Texture;
    roughnessMap?: THREE.Texture;
  } = {};
  const floors = new Map<string, THREE.MeshStandardMaterial>();
  for (const [file, key] of [
    ["diff", "map"],
    ["nor_gl", "normalMap"],
    ["rough", "roughnessMap"],
  ] as const) {
    const t = loader.load(
      `/materials/wood_floor-${file}.jpg`,
      (tex) => {
        tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
        tex.colorSpace =
          key === "map" ? THREE.SRGBColorSpace : THREE.NoColorSpace;
        tex.anisotropy = 8;
        for (const [id, mat] of floors) {
          if (id.startsWith("wood:")) {
            const [, w, d] = id.split(":");
            const clone = tex.clone();
            clone.repeat.set(+w / 13, +d / 13);
            textures.add(clone);
            mat[key] = clone;
            mat.needsUpdate = true;
          }
        }
      },
      undefined,
      () => {},
    );
    textures.add(t);
    woodMaps[key] = t;
  }
  const flooring = (kind: Material, w: number, d: number) => {
    const key = `${kind}:${w}:${d}`;
    if (floors.has(key)) return floors.get(key)!;
    const texture = (
      kind === "wood"
        ? woodMaps.map!
        : kind === "marble"
          ? stone
          : kind === "tile"
            ? tile
            : terrazzo
    ).clone();
    texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(
      w / (kind === "wood" ? 13 : kind === "marble" ? 6 : 8),
      d / (kind === "wood" ? 13 : kind === "marble" ? 6 : 8),
    );
    textures.add(texture);
    const m = standard({
      map: texture,
      roughness: kind === "marble" ? 0.23 : kind === "wood" ? 0.5 : 0.65,
      normalScale: new THREE.Vector2(0.3, 0.3),
      color: kind === "wood" ? "#e1cfae" : "#ffffff",
    });
    if (kind === "wood")
      for (const k of ["normalMap", "roughnessMap"] as const) {
        const t = woodMaps[k]!.clone();
        t.wrapS = t.wrapT = THREE.RepeatWrapping;
        t.repeat.copy(texture.repeat);
        textures.add(t);
        m[k] = t;
      }
    floors.set(key, m);
    return m;
  };
  return {
    base,
    flooring,
    standard,
    setPalette: (p: Palette) => {
      base.wall.color.set(palettes[p].wall);
      base.fabric.color.set(palettes[p].fabric);
      base.accent.color.set(palettes[p].accent);
      base.cabinet.color.set(palettes[p].cabinet);
    },
    dispose: () => {
      materials.forEach((m) => m.dispose());
      textures.forEach((t) => t.dispose());
    },
  };
}
