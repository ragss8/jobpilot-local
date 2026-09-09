import * as THREE from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import {
  floorBase,
  stairRun,
  getWalls,
  getOpenings,
  type Project,
  type Floor,
  type Room,
} from "./engine";
import { createMaterials } from "./materials";
export type Obstacle = { x: number; z: number; w: number; d: number; level: number };
export interface Level {
  id: string;
  base: number;
  index: number;
  group: THREE.Group;
  ceilings: THREE.Group;
}
export function buildInterior(
  scene: THREE.Scene,
  renderer: THREE.WebGLRenderer,
  p: Project,
  showFurniture: boolean,
) {
  const mats = createMaterials(renderer),
    m = mats.base,
    geometries = new Set<THREE.BufferGeometry>(),
    allCeilings: THREE.Group[] = [],
    allLights: THREE.Group[] = [],
    levels: Level[] = [],
    obstacles: Obstacle[] = [];
  /** Whatever is being built into right now: the scene for site-wide pieces,
   *  a level's group while that storey is being assembled. */
  let root: THREE.Object3D = scene;
  let levelIndex = 0;
  // Reassigned per level so the shared helpers below always decorate the
  // storey currently being built.
  let ceilings = new THREE.Group(),
    lights = new THREE.Group();
  const mesh = (
    geo: THREE.BufferGeometry,
    mat: THREE.Material,
    x: number,
    y: number,
    z: number,
    parent: THREE.Object3D = root,
  ) => {
    geometries.add(geo);
    const a = new THREE.Mesh(geo, mat);
    a.position.set(x, y, z);
    a.castShadow = true;
    a.receiveShadow = true;
    parent.add(a);
    return a;
  };
  const box = (
    x: number,
    y: number,
    z: number,
    w: number,
    h: number,
    d: number,
    mat: THREE.Material,
    parent: THREE.Object3D = root,
    r = 0,
  ) =>
    mesh(
      r
        ? new RoundedBoxGeometry(w, h, d, 2, Math.min(r, w / 2, h / 2, d / 2))
        : new THREE.BoxGeometry(w, h, d),
      mat,
      x,
      y,
      z,
      parent,
    );
  const cyl = (
    x: number,
    y: number,
    z: number,
    r: number,
    h: number,
    mat: THREE.Material,
    parent: THREE.Object3D = root,
    top = r,
  ) => mesh(new THREE.CylinderGeometry(top, r, h, 24), mat, x, y, z, parent);
  const sphere = (
    x: number,
    y: number,
    z: number,
    r: number,
    mat: THREE.Material,
    parent: THREE.Object3D = root,
  ) => mesh(new THREE.SphereGeometry(r, 16, 12), mat, x, y, z, parent);
  const plane = (
    x: number,
    y: number,
    z: number,
    w: number,
    d: number,
    mat: THREE.Material,
    parent: THREE.Object3D = root,
  ) => {
    const a = mesh(new THREE.PlaneGeometry(w, d), mat, x, y, z, parent);
    a.rotation.x = -Math.PI / 2;
    return a;
  };
  const grass = mats.standard({ color: "#8e9c7e", roughness: 1 }),
    path = mats.standard({ color: "#c7c3b4", roughness: 0.85 });
  box(
    p.site.width / 2,
    -0.6,
    p.site.depth / 2,
    p.site.width + 55,
    0.5,
    p.site.depth + 55,
    grass,
  );
  box(
    p.site.width / 2,
    -0.25,
    p.site.depth / 2,
    p.site.width + 2,
    0.2,
    p.site.depth + 2,
    path,
  );
  const plant = (
    x: number,
    z: number,
    scale = 1,
    parent: THREE.Object3D = root,
  ) => {
    const g = new THREE.Group();
    g.position.set(x, 0, z);
    g.scale.setScalar(scale);
    parent.add(g);
    cyl(0, 0.6, 0, 0.48, 1.2, m.terracotta, g, 0.62);
    cyl(0, 1.8, 0, 0.035, 2.6, m.darkwood, g);
    for (let i = 0; i < 11; i++) {
      const angle = i * 2.4,
        y = 1.3 + i * 0.22;
      const leaf = sphere(
        Math.cos(angle) * 0.45,
        y,
        Math.sin(angle) * 0.45,
        0.44,
        m.leaf,
        g,
      );
      leaf.scale.set(1, 0.19, 0.5);
      leaf.rotation.set(0.45, angle, 0.3);
    }
    return g;
  };
  for (let i = 0; i < 12; i++)
    plant(
      i < 6 ? -4 : p.site.width + 4,
      2 + ((i % 6) * (p.site.depth - 4)) / 5,
      1.7,
    );
  const shadeCanvas = document.createElement("canvas");
  shadeCanvas.width = shadeCanvas.height = 128;
  const ctx = shadeCanvas.getContext("2d")!,
    grad = ctx.createRadialGradient(64, 64, 8, 64, 64, 64);
  grad.addColorStop(0, "rgba(40,32,20,.26)");
  grad.addColorStop(0.6, "rgba(40,32,20,.13)");
  grad.addColorStop(1, "rgba(40,32,20,0)");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 128, 128);
  const shadeTexture = new THREE.CanvasTexture(shadeCanvas),
    shade = new THREE.MeshBasicMaterial({
      map: shadeTexture,
      transparent: true,
      depthWrite: false,
    });
  const pendant = (x: number, z: number, height: number) => {
    cyl(x, height - 0.1, z, 0.25, 0.1, m.black, ceilings);
    cyl(x, height - 1.15, z, 0.016, 2, m.black, ceilings);
    cyl(x, height - 2.25, z, 0.75, 0.6, m.brass, ceilings, 0.28);
    const bulb = cyl(x, height - 2.56, z, 0.64, 0.025, m.light, ceilings);
    bulb.castShadow = false;
  };
  const art = (x: number, y: number, z: number, w: number, h: number) => {
    box(x, y, z, w + 0.15, h + 0.15, 0.1, m.darkwood);
    box(x, y, z + 0.065, w, h, 0.025, m.art);
  };
  /** Build one level into its own group, lifted to its height. Everything
   *  inside is authored with the floor at y=0, so the group does the
   *  stacking and no coordinate below has to know which storey it is on. */
  const buildLevel = (floor: Floor, base: number, index: number) => {
    const level = new THREE.Group();
    level.position.y = base;
    scene.add(level);
    root = level;
    levelIndex = index;
    ceilings = new THREE.Group();
    lights = new THREE.Group();
    level.add(ceilings, lights);
    allCeilings.push(ceilings);
    allLights.push(lights);
    levels.push({ id: floor.id, base, group: level, ceilings, index });
    for (const wall of getWalls(p, floor)) {
      const len = wall.end - wall.start,
        h = wall.top - wall.bottom;
      box(
        wall.axis === "h" ? (wall.start + wall.end) / 2 : wall.fixed,
        wall.bottom + h / 2,
        wall.axis === "h" ? wall.fixed : (wall.start + wall.end) / 2,
        wall.axis === "h" ? len : p.wallThickness,
        h,
        wall.axis === "h" ? p.wallThickness : len,
        m.wall,
      );
      if (wall.bottom === 0) {
        box(
          wall.axis === "h" ? (wall.start + wall.end) / 2 : wall.fixed,
          0.22,
          wall.axis === "h" ? wall.fixed : (wall.start + wall.end) / 2,
          wall.axis === "h" ? len : p.wallThickness + 0.07,
          0.44,
          wall.axis === "h" ? p.wallThickness + 0.07 : len,
          m.trim,
        );
      }
    }
    const openings = getOpenings(p, floor);
    for (const o of openings) {
      const g = new THREE.Group();
      g.position.set(
        o.axis === "h" ? (o.start + o.end) / 2 : o.fixed,
        0,
        o.axis === "h" ? o.fixed : (o.start + o.end) / 2,
      );
      g.rotation.y = o.axis === "h" ? 0 : Math.PI / 2;
      root.add(g);
      const w = o.end - o.start;
      if (o.kind === "door") {
        for (const x of [-w / 2, w / 2])
          box(x, 3.55, 0, 0.11, 7.1, p.wallThickness + 0.16, m.wood, g);
        box(0, 7.02, 0, w + 0.15, 0.15, p.wallThickness + 0.16, m.wood, g);
      } else {
        const glass = box(0, 5, 0, w, 3.9, 0.025, m.glass, g);
        glass.castShadow = false;
        for (const x of [-w / 2, 0, w / 2])
          box(x, 5, 0, 0.075, 4, 0.17, m.black, g);
        for (const y of [3, 7]) box(0, y, 0, w + 0.16, 0.09, 0.17, m.black, g);
        box(0, 2.98, 0, w + 0.3, 0.1, p.wallThickness + 0.4, m.stone, g);
        // Full-length linen panels sit beside the glazing, leaving its opening visible.
        if (showFurniture) {
          const outerX =
              o.axis === "v" ? (o.fixed < p.site.width / 2 ? 0.32 : -0.32) : 0,
            outerZ =
              o.axis === "h" ? (o.fixed < p.site.depth / 2 ? 0.32 : -0.32) : 0;
          const localZ = o.axis === "v" ? -outerX : outerZ;
          box(0, 7.6, localZ, w + 1.3, 0.07, 0.07, m.brass, g);
          for (const side of [-1, 1]) {
            const geo = new THREE.PlaneGeometry(0.7, 7.15, 12, 1);
            const pos = geo.attributes.position;
            for (let i = 0; i < pos.count; i++)
              pos.setZ(i, Math.sin(pos.getX(i) * 44) * 0.08);
            geo.computeVertexNormals();
            const curtain = mesh(
              geo,
              m.linen,
              side * (w / 2 + 0.22),
              3.9,
              localZ,
              g,
            );
            curtain.castShadow = false;
          }
        }
      }
    }
    for (const r of floor.rooms) {
      // The core is left open above the ground level so the flight coming up
      // through it is not capped by a floor slab.
      const openWell = r.type === "stairs" && index > 0;
      if (openWell) {
        buildArrival(r, index);
        continue;
      }
      box(r.x + r.w / 2, -0.04, r.y + r.d / 2, r.w, 0.18, r.d, m.trim);
      plane(
        r.x + r.w / 2,
        0.06,
        r.y + r.d / 2,
        r.w,
        r.d,
        mats.flooring(r.material, r.w, r.d),
      );
      box(
        r.x + r.w / 2,
        floor.height + 0.07,
        r.y + r.d / 2,
        r.w,
        0.14,
        r.d,
        m.ceiling,
        ceilings,
      );
      for (const z of [r.y + 0.15, r.y + r.d - 0.15])
        box(
          r.x + r.w / 2,
          floor.height - 0.16,
          z,
          r.w - 0.2,
          0.25,
          0.25,
          m.trim,
          ceilings,
        );
      for (const x of [r.x + 0.15, r.x + r.w - 0.15])
        box(
          x,
          floor.height - 0.16,
          r.y + r.d / 2,
          0.25,
          0.25,
          r.d - 0.2,
          m.trim,
          ceilings,
        );
      const light = new THREE.PointLight(
        "#ffe6bd",
        r.w * r.d * 1.3,
        Math.max(r.w, r.d) * 1.5,
        2,
      );
      light.position.set(r.x + r.w / 2, floor.height - 1, r.y + r.d / 2);
      lights.add(light);
      const nx = Math.max(1, Math.round(r.w / 7)),
        nz = Math.max(1, Math.round(r.d / 7));
      for (let ix = 0; ix < nx; ix++)
        for (let iz = 0; iz < nz; iz++) {
          const x = r.x + (r.w * (ix + 0.5)) / nx,
            z = r.y + (r.d * (iz + 0.5)) / nz;
          cyl(x, floor.height - 0.025, z, 0.22, 0.04, m.brass, ceilings);
          const lamp = cyl(
            x,
            floor.height - 0.055,
            z,
            0.17,
            0.015,
            m.light,
            ceilings,
          );
          lamp.castShadow = false;
        }
      if (!showFurniture) continue;
      for (const f of r.furniture) {
        const g = new THREE.Group();
        g.position.set(r.x + f.x + f.w / 2, 0.09, r.y + f.y + f.d / 2);
        g.rotation.y = (-f.rotation * Math.PI) / 180;
        root.add(g);
        const b = (
            x: number,
            y: number,
            z: number,
            w: number,
            h: number,
            d: number,
            mat: THREE.Material,
            rad = 0,
          ) => box(x, y, z, w, h, d, mat, g, rad),
          c = (
            x: number,
            y: number,
            z: number,
            rad: number,
            h: number,
            mat: THREE.Material,
            top = rad,
          ) => cyl(x, y, z, rad, h, mat, g, top);
        const sh = plane(0, -0.005, 0, f.w + 1.5, f.d + 1.5, shade, g);
        sh.receiveShadow = false;
        sh.castShadow = false;
        if (f.kind === "sofa") {
          for (const x of [-f.w / 2 + 0.4, f.w / 2 - 0.4])
            for (const z of [-f.d / 2 + 0.4, f.d / 2 - 0.4])
              c(x, 0.18, z, 0.07, 0.36, m.darkwood);
          b(0, 0.5, 0, f.w - 0.12, 0.55, f.d - 0.1, m.fabric, 0.17);
          b(0, 1.45, -f.d / 2 + 0.2, f.w, 1.9, 0.45, m.fabric, 0.16);
          for (const x of [-f.w / 2 + 0.18, f.w / 2 - 0.18])
            b(x, 1.1, 0, 0.36, 1.3, f.d, m.fabric, 0.16);
          const seatW = (f.w - 0.8) / 3;
          for (let i = 0; i < 3; i++) {
            const x = -f.w / 2 + 0.4 + seatW * (i + 0.5);
            b(x, 0.95, 0.12, seatW - 0.05, 0.42, f.d - 0.65, m.fabric, 0.15);
            const back = b(
              x,
              1.65,
              -f.d / 2 + 0.49,
              seatW - 0.06,
              1.1,
              0.3,
              m.fabric,
              0.12,
            );
            back.rotation.x = -0.12;
          }
          for (const side of [-1, 1]) {
            const pillow = b(
              side * (f.w / 2 - 0.9),
              1.6,
              -0.1,
              0.8,
              0.84,
              0.23,
              side === 1 ? m.accent : m.linen,
              0.13,
            );
            pillow.rotation.set(-0.18, side * 0.12, side * 0.17);
          }
        } else if (f.kind === "bed") {
          b(0, 0.38, 0, f.w, 0.62, f.d, m.darkwood, 0.12);
          b(0, 0.91, 0, f.w - 0.09, 0.48, f.d - 0.14, m.linen, 0.18);
          b(0, 1.19, 0.6, f.w + 0.02, 0.22, f.d - 1.4, m.fabric, 0.13);
          b(0, 1.34, f.d / 2 - 1.2, f.w + 0.05, 0.13, 1.55, m.accent, 0.08);
          b(0, 1.75, -f.d / 2 + 0.06, f.w + 0.15, 3.2, 0.2, m.fabric, 0.12);
          for (let i = 0; i < 8; i++)
            b(
              -f.w / 2 + (f.w * (i + 0.5)) / 8,
              1.8,
              -f.d / 2 + 0.175,
              0.022,
              2.7,
              0.02,
              m.linen,
            );
          for (const x of [-f.w / 4, f.w / 4]) {
            const pillow = b(
              x,
              1.34,
              -f.d / 2 + 0.86,
              f.w / 2 - 0.22,
              0.27,
              1.15,
              m.linen,
              0.19,
            );
            pillow.rotation.y = x < 0 ? 0.04 : -0.04;
          }
        } else if (f.kind === "table" || f.kind === "desk") {
          const dining = r.type === "dining",
            height = dining || f.kind === "desk" ? 2.45 : 1.35;
          b(0, height, 0, f.w, 0.16, f.d, dining ? m.wood : m.stone, 0.15);
          for (const x of [-f.w / 2 + 0.35, f.w / 2 - 0.35])
            for (const z of [-f.d / 2 + 0.3, f.d / 2 - 0.3])
              c(x, height / 2, z, 0.045, height, m.black);
          c(0, height + 0.28, 0, 0.21, 0.48, m.terracotta, 0.13);
          for (let i = 0; i < 4; i++) {
            const stem = c(0, height + 0.7, 0, 0.008, 0.5, m.darkwood);
            stem.rotation.z = i * 0.2 - 0.3;
            const bud = sphere(
              (i - 1.5) * 0.08,
              height + 0.96,
              0,
              0.12,
              m.leaf,
              g,
            );
            bud.scale.y = 0.4;
          }
          b(f.w * 0.25, height + 0.13, 0, 0.65, 0.08, 0.85, m.darkwood);
          b(f.w * 0.25, height + 0.18, 0.03, 0.63, 0.035, 0.82, m.linen);
          if (dining) {
            for (const side of [-1, 1])
              for (const xx of [-f.w * 0.27, f.w * 0.27]) {
                const zz = side * (f.d / 2 + 0.54);
                b(xx, 1.35, zz, 1.15, 0.17, 1.05, m.fabric, 0.12);
                b(xx, 1.95, zz + side * 0.43, 1.15, 1.1, 0.17, m.fabric, 0.15);
                for (const x of [xx - 0.43, xx + 0.43])
                  for (const z of [zz - 0.35, zz + 0.35])
                    c(x, 0.65, z, 0.035, 1.3, m.darkwood);
                const v = new THREE.Vector3(xx, 0, zz).applyAxisAngle(
                  new THREE.Vector3(0, 1, 0),
                  g.rotation.y,
                );
                obstacles.push({
                  level: levelIndex,
                  x: g.position.x + v.x - 0.6,
                  z: g.position.z + v.z - 0.6,
                  w: 1.2,
                  d: 1.2,
                });
              }
            pendant(g.position.x, g.position.z, floor.height);
          }
        } else if (f.kind === "counter") {
          b(0, 1.35, 0, f.w, 2.7, f.d, m.cabinet);
          b(0, 2.77, 0, f.w + 0.08, 0.14, f.d + 0.06, m.stone, 0.025);
          b(0, 0.13, f.d / 2 - 0.1, f.w, 0.2, 0.15, m.black);
          const doors = Math.max(1, Math.round(f.w / 1.8));
          for (let i = 0; i < doors; i++) {
            const x = -f.w / 2 + ((i + 0.5) * f.w) / doors;
            b(
              x,
              1.5,
              f.d / 2 + 0.025,
              f.w / doors - 0.05,
              2.26,
              0.055,
              m.cabinet,
              0.015,
            );
            b(x, 2.22, f.d / 2 + 0.07, 0.47, 0.027, 0.027, m.brass);
          }
          if (f.w > 3.5) {
            b(-f.w * 0.22, 2.85, 0, 1.65, 0.035, 1.25, m.black, 0.08);
            b(-f.w * 0.22, 2.866, 0, 1.4, 0.035, 1.05, m.white, 0.1);
            const tap = new THREE.Mesh(
              new THREE.TorusGeometry(0.24, 0.027, 8, 20, Math.PI),
              m.brass,
            );
            geometries.add(tap.geometry);
            tap.position.set(-f.w * 0.22, 3.35, -0.4);
            g.add(tap);
            c(-f.w * 0.22 - 0.24, 3.1, -0.4, 0.027, 0.5, m.brass);
            b(f.w * 0.26, 2.856, 0, 1.75, 0.026, 1.32, m.black, 0.06);
            for (const x of [f.w * 0.26 - 0.4, f.w * 0.26 + 0.4])
              for (const z of [-0.3, 0.3]) {
                const hob = new THREE.Mesh(
                  new THREE.TorusGeometry(0.2, 0.009, 6, 24),
                  m.white,
                );
                geometries.add(hob.geometry);
                hob.rotation.x = Math.PI / 2;
                hob.position.set(x, 2.88, z);
                g.add(hob);
              }
            b(0, 5.4, -f.d / 2 + 0.55, f.w, 1.75, 1.05, m.wood);
            for (let i = 0; i < doors; i++)
              b(
                -f.w / 2 + ((i + 0.5) * f.w) / doors,
                5.4,
                -f.d / 2 + 1.1,
                f.w / doors - 0.04,
                1.68,
                0.04,
                m.cabinet,
              );
            b(0, 4.5, -f.d / 2 + 1.04, f.w - 0.15, 0.025, 0.03, m.light);
          }
        } else if (f.kind === "wardrobe") {
          b(0, 3.6, 0, f.w, 7.2, f.d, m.wood);
          const panels = Math.max(2, Math.round(f.w / 1.8));
          for (let i = 0; i < panels; i++) {
            const x = -f.w / 2 + ((i + 0.5) * f.w) / panels;
            b(x, 3.6, f.d / 2 + 0.02, f.w / panels - 0.04, 7.05, 0.06, m.cabinet);
            b(x + 0.1, 3.4, f.d / 2 + 0.08, 0.025, 0.7, 0.04, m.brass);
          }
        } else if (f.kind === "toilet") {
          b(0, 1.6, -f.d / 2 + 0.34, f.w * 0.8, 2.4, 0.6, m.white, 0.12);
          c(0, 0.62, 0.25, 0.56, 1.24, m.white, 0.65);
          const bowl = sphere(0, 1.12, 0.25, 0.75, m.white, g);
          bowl.scale.set(0.88, 0.45, 1.13);
          const seat = new THREE.Mesh(
            new THREE.TorusGeometry(0.49, 0.09, 10, 32),
            m.white,
          );
          geometries.add(seat.geometry);
          seat.rotation.x = Math.PI / 2;
          seat.scale.y = 1.22;
          seat.position.set(0, 1.36, 0.25);
          g.add(seat);
          c(0, 1.35, 0.25, 0.4, 0.02, m.black);
        } else {
          b(0, 1.25, 0, f.w, 2.5, f.d, m.wood);
          b(0, 2.55, 0, f.w + 0.1, 0.1, f.d + 0.1, m.stone);
          c(0, 2.95, 0, 0.16, 0.6, m.brass, 0.25);
          sphere(0, 3.3, 0, 0.08, m.light, g);
        }
      }
      // Fixtures remain close to walls so the original room plan stays usable.
      if (r.type === "living") {
        const width = Math.min(5.3, r.w - 2);
        box(
          r.x + r.w / 2,
          4.4,
          r.y + r.d - 0.23,
          width,
          2.9,
          0.09,
          m.black,
          root,
          0.07,
        );
        const screenMat = mats.standard({
          color: "#273634",
          roughness: 0.2,
          metalness: 0.25,
          emissive: "#243a36",
          emissiveIntensity: 0.16,
        });
        box(
          r.x + r.w / 2,
          4.4,
          r.y + r.d - 0.295,
          width - 0.15,
          2.75,
          0.02,
          screenMat,
        );
        box(
          r.x + r.w / 2,
          1.3,
          r.y + r.d - 0.65,
          width + 1,
          0.65,
          0.8,
          m.wood,
          root,
          0.07,
        );
        obstacles.push({
          level: levelIndex,
          x: r.x + r.w / 2 - (width + 1) / 2,
          z: r.y + r.d - 1.05,
          w: width + 1,
          d: 0.9,
        });
        art(r.x + r.w * 0.38, 5.45, r.y + 0.25, Math.min(3.2, r.w * 0.28), 2.35);
      } else if (r.type === "bedroom" || r.type === "master") {
        art(r.x + r.w * 0.7, 5.35, r.y + 0.25, 1.7, 2.1);
      }
      if (
        r.w > 7 &&
        r.d > 7 &&
        ["living", "bedroom", "master", "office"].includes(r.type)
      ) {
        const x = r.x + r.w - 1,
          z = r.y + 1;
        if (
          !r.furniture.some(
            (a) =>
              x > r.x + a.x - 0.7 &&
              x < r.x + a.x + a.w + 0.7 &&
              z > r.y + a.y - 0.7 &&
              z < r.y + a.y + a.d + 0.7,
          )
        ) {
          plant(x, z, 0.85);
          obstacles.push({ level: levelIndex, x: x - 0.55, z: z - 0.55, w: 1.1, d: 1.1 });
        }
      }
      if (r.type === "bathroom" && r.w > 6) {
        box(r.x + 1.3, 2.3, r.y + r.d - 0.8, 1.6, 1.5, 1.2, m.cabinet);
        box(r.x + 1.3, 3.1, r.y + r.d - 0.8, 1.7, 0.12, 1.25, m.stone);
        cyl(r.x + 1.3, 3.28, r.y + r.d - 0.8, 0.5, 0.27, m.white, root, 0.6);
        box(r.x + 1.3, 5, r.y + r.d - 0.25, 1.65, 2.2, 0.045, m.glass);
        obstacles.push({ level: levelIndex, x: r.x + 0.35, z: r.y + r.d - 1.5, w: 1.9, d: 1.4 });
      }
    }
    // A flight up to the next storey, and the slab it pierces.
    const core = floor.rooms.find((r) => r.type === "stairs");
    const above = p.floors[index + 1];
    if (core && above) buildFlight(core, floor.height);
    root = scene;
  };
  /** The arrival landing of an upper core: the piece of floor you step onto
   *  off the flight below. The rest of the core is left open as the well. */
  const buildArrival = (core: Room, _index: number) => {
    const s = stairRun(core);
    const along = s.axis === "z";
    box(
      along ? core.x + core.w / 2 : core.x + s.arrival / 2,
      -0.04,
      along ? core.y + s.arrival / 2 : core.y + core.d / 2,
      along ? core.w : s.arrival,
      0.18,
      along ? s.arrival : core.d,
      m.stone,
    );
  };
  /** The dog-legged flight up to the next storey, drawn from the same
   *  solution the walker climbs, so geometry and movement cannot disagree. */
  const buildFlight = (core: Room, height: number) => {
    const s = stairRun(core);
    const along = s.axis === "z",
      across = along ? core.w : core.d,
      half = across / 2;
    const step = s.run / s.steps,
      rise = height / 2 / s.steps;
    const base = along ? core.x : core.y;
    /** Centre of a flight across the core: true = the far side of `mid`. */
    const sideAt = (far: boolean) => base + (far ? half * 1.5 : half * 0.5);
    const tread = (at: number, far: boolean, y: number) => {
      const a = s.from + s.arrival + at + step / 2,
        b = sideAt(far);
      box(
        along ? b : a,
        y - 0.09,
        along ? a : b,
        along ? half - 0.12 : step,
        0.18,
        along ? step : half - 0.12,
        m.stone,
      );
      box(
        along ? b : a - step / 2,
        y - rise / 2 - 0.13,
        along ? a - step / 2 : b,
        along ? half - 0.12 : 0.12,
        rise,
        along ? 0.12 : half - 0.12,
        m.wall,
      );
    };
    for (let i = 1; i <= s.steps; i++) {
      // The climbing flight rises away from the arrival; its partner comes
      // back over the top of it.
      tread(i * step - step, s.upperSide, i * rise);
      tread(i * step - step, !s.upperSide, height - i * rise + rise);
    }
    // The half-landing where the flights turn.
    box(
      along ? core.x + core.w / 2 : core.x + core.w - s.landing / 2,
      height / 2 - 0.09,
      along ? core.y + core.d - s.landing / 2 : core.y + core.d / 2,
      along ? core.w : s.landing,
      0.18,
      along ? s.landing : core.d,
      m.stone,
    );
    // A handrail over each flight, sloped to match its climb.
    const angle = Math.atan2(height / 2, s.run),
      railLen = Math.hypot(s.run, height / 2),
      midAlong = s.from + s.arrival + s.run / 2;
    for (const climbing of [true, false]) {
      const rail = box(
        along ? s.mid : midAlong,
        (climbing ? height / 4 : (height * 3) / 4) + 1.75,
        along ? midAlong : s.mid,
        along ? 0.11 : railLen,
        0.11,
        along ? railLen : 0.11,
        m.brass,
      );
      const dir = climbing ? 1 : -1;
      if (along) rail.rotation.x = -dir * angle;
      else rail.rotation.z = dir * angle;
    }
    for (let i = 0; i <= 6; i++) {
      const t = i / 6,
        at = s.from + s.arrival + t * s.run;
      for (const climbing of [true, false]) {
        const deck = climbing ? (height / 2) * t : height - (height / 2) * t;
        cyl(
          along ? s.mid : at,
          deck + 0.87,
          along ? at : s.mid,
          0.04,
          1.75,
          m.black,
        );
      }
    }
  };
  for (const [i, floor] of p.floors.entries())
    buildLevel(floor, floorBase(p, i), i);
  return {
    mats,
    levels,
    obstacles,
    setLights: (on: boolean) => {
      for (const g of allLights) g.visible = on;
      m.light.emissiveIntensity = on ? 2.2 : 0;
    },
    /** Hide the ceilings of a level so an overview can see into it. */
    setCeilings: (visible: (level: Level) => boolean) => {
      for (const level of levels) level.ceilings.visible = visible(level);
    },
    /** Show only the levels a predicate accepts, for isolating a storey. */
    setVisible: (visible: (level: Level) => boolean) => {
      for (const level of levels) level.group.visible = visible(level);
    },
    dispose: () => {
      geometries.forEach((g) => g.dispose());
      mats.dispose();
      shade.dispose();
      shadeTexture.dispose();
    },
  };
}
