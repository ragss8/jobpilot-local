import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import {
  ArrowLeft,
  Camera,
  Check,
  ChevronDown,
  Expand,
  Footprints,
  Layers,
  Lightbulb,
  Maximize,
  MousePointer2,
  Pause,
  Play,
  Settings2,
  Sun,
  Sunset,
  Moon,
  X,
} from "lucide-react";
import {
  canWalk,
  getWalls,
  materialColors,
  type Project,
  type Floor,
  type Room,
  type Material,
  floorBase,
  stairHeightAt,
} from "./engine";
import {
  initialRoom,
  roomView,
  palettes,
  type Mood,
  type Palette,
} from "./presentation";
import { buildInterior } from "./interiorScene";
const EYE = 5.35;
interface Runtime {
  setLevel: (index: number) => void;
  navigate: (id: string) => boolean;
  setWalk: (walk: boolean) => void;
  setMood: (mood: Mood) => void;
  setPalette: (palette: Palette) => void;
  setLights: (on: boolean) => void;
  capture: () => void;
  lock: () => void;
}
export default function Viewer({
  project: p,
  floor,
  walk,
  showFurniture,
  onWalkChange,
  onMaterialChange,
  onFloorChange,
}: {
  project: Project;
  floor: Floor;
  walk: boolean;
  showFurniture: boolean;
  onWalkChange?: (walk: boolean) => void;
  onMaterialChange?: (id: string, m: Material) => void;
  onFloorChange?: (index: number) => void;
}) {
  const host = useRef<HTMLDivElement>(null),
    runtime = useRef<Runtime | null>(null),
    savedView = useRef<{
      floor: string;
      x: number;
      z: number;
      y: number;
      yaw: number;
      pitch: number;
      walk: boolean;
      target: THREE.Vector3;
    } | null>(null);
  const [error, setError] = useState(""),
    [locked, setLocked] = useState(false),
    [present, setPresent] = useState(false),
    [settings, setSettings] = useState(false),
    [mood, setMood] = useState<Mood>("day"),
    [palette, setPalette] = useState<Palette>("warm"),
    [lights, setLights] = useState(true),
    [activeRoom, setActiveRoom] = useState(initialRoom(p, floor).id),
    [position, setPosition] = useState({ x: 0, z: 0, yaw: 0 }),
    [tour, setTour] = useState(false),
    [notice, setNotice] = useState("");
  const walkRef = useRef(walk),
    moodRef = useRef(mood),
    paletteRef = useRef(palette),
    lightsRef = useRef(lights);
  walkRef.current = walk;
  moodRef.current = mood;
  paletteRef.current = palette;
  lightsRef.current = lights;
  const current =
    floor.rooms.find((r) => r.id === activeRoom) ?? initialRoom(p, floor),
    rooms = floor.rooms.filter((r) => r.type !== "hall");
  const go = (id: string) => {
    if (runtime.current?.navigate(id)) {
      onWalkChange?.(true);
      setActiveRoom(id);
      setNotice("");
    } else
      setNotice(
        "This room has no clear standing position. Move furniture or enlarge the room in the plan.",
      );
  };
  useEffect(() => {
    if (!notice) return;
    const id = setTimeout(() => setNotice(""), 6000);
    return () => clearTimeout(id);
  }, [notice]);
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !document.pointerLockElement) {
        setSettings(false);
        setPresent(false);
        setTour(false);
      }
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, []);
  useEffect(() => {
    if (!tour) return;
    const id = setInterval(() => {
      const index = rooms.findIndex((r) => r.id === activeRoom);
      go(rooms[(index + 1) % rooms.length].id);
    }, 6000);
    return () => clearInterval(id);
  }, [tour, activeRoom, floor]);
  useEffect(() => {
    runtime.current?.setWalk(walk);
  }, [walk]);
  useEffect(() => {
    // Changing storey moves the viewer rather than rebuilding the scene, so
    // the whole house stays loaded and the walk can carry on.
    runtime.current?.setLevel(p.floors.findIndex((f) => f.id === floor.id));
  }, [floor, p.floors]);
  useEffect(() => {
    runtime.current?.setMood(mood);
  }, [mood]);
  useEffect(() => {
    runtime.current?.setPalette(palette);
  }, [palette]);
  useEffect(() => {
    runtime.current?.setLights(lights);
  }, [lights]);
  useEffect(() => {
    const el = host.current!;
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({
        antialias: true,
        preserveDrawingBuffer: true,
        powerPreference: "high-performance",
      });
    } catch {
      setError(
        "3D needs WebGL hardware acceleration. The 2D plan remains available.",
      );
      return;
    }
    setError("");
    renderer.setPixelRatio(Math.min(devicePixelRatio, 1.75));
    renderer.setSize(el.clientWidth, el.clientHeight);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.domElement.setAttribute(
      "aria-label",
      "Interactive architectural walkthrough",
    );
    renderer.domElement.tabIndex = 0;
    el.appendChild(renderer.domElement);
    const scene = new THREE.Scene();
    scene.background = new THREE.Color("#d8e1e4");
    const camera = new THREE.PerspectiveCamera(
      58,
      el.clientWidth / el.clientHeight,
      0.08,
      400,
    );
    const envScene = new RoomEnvironment(),
      pmrem = new THREE.PMREMGenerator(renderer),
      environment = pmrem.fromScene(envScene, 0.04);
    scene.environment = environment.texture;
    scene.environmentIntensity = 0.48;
    envScene.dispose();
    pmrem.dispose();
    const hemi = new THREE.HemisphereLight("#e7f2ff", "#8d8270", 0.75);
    scene.add(hemi);
    const sun = new THREE.DirectionalLight("#fff4df", 3.3);
    sun.position.set(p.site.width + 25, 35, -18);
    sun.target.position.set(p.site.width / 2, 0, p.site.depth / 2);
    scene.add(sun, sun.target);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    const storeys = p.floors.reduce((sum, f) => sum + f.height, 0);
    const span = Math.max(p.site.width, p.site.depth, storeys) + 15;
    Object.assign(sun.shadow.camera, {
      left: -span,
      right: span,
      top: span,
      bottom: -span,
      far: 200,
      near: 1,
    });
    sun.shadow.bias = -0.00008;
    sun.shadow.normalBias = 0.02;
    sun.shadow.radius = 3;
    const model = buildInterior(scene, renderer, p, showFurniture);
    model.mats.setPalette(paletteRef.current);
    model.setLights(lightsRef.current);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.minDistance = 6;
    controls.maxDistance = 200;
    controls.maxPolarAngle = Math.PI / 2 - 0.02;
    const frame = () => {
      const reach = Math.max(p.site.width, p.site.depth, storeys * 1.2);
      controls.target.set(p.site.width / 2, storeys * 0.42, p.site.depth / 2);
      camera.position.set(
        p.site.width / 2 + reach * 0.95,
        storeys * 0.75 + reach * 0.55,
        p.site.depth / 2 + reach * 1.05,
      );
      controls.update();
    };
    frame();
    /** Which storey the walker is on. Movement changes it by climbing, so it
     *  is tracked here and reported outward rather than driven by the prop. */
    let level = Math.max(
      0,
      p.floors.findIndex((f) => f.id === floor.id),
    );
    let walkerY = floorBase(p, level);
    const wallCache = new Map<number, ReturnType<typeof getWalls>>();
    const wallsOf = (i: number) => {
      if (!wallCache.has(i)) wallCache.set(i, getWalls(p, p.floors[i]));
      return wallCache.get(i)!;
    };
    const bare = new Map<number, Floor>();
    const floorOf = (i: number) => {
      if (showFurniture) return p.floors[i];
      if (!bare.has(i))
        bare.set(i, {
          ...p.floors[i],
          rooms: p.floors[i].rooms.map((r) => ({ ...r, furniture: [] })),
        });
      return bare.get(i)!;
    };
    const coreOf = (i: number) =>
      p.floors[i]?.rooms.find((r) => r.type === "stairs");
    let walking = walkRef.current,
      yaw = 0,
      pitch = -0.035,
      lastRoom = "",
      lastPosition = 0,
      previous = performance.now();
    const keys = new Set<string>();
    const valid = (x: number, z: number, i = level) =>
      canWalk(x, z, p, floorOf(i), wallsOf(i)) &&
      !model.obstacles.some(
        (b) =>
          b.level === i &&
          x > b.x - 0.62 &&
          x < b.x + b.w + 0.62 &&
          z > b.z - 0.62 &&
          z < b.z + b.d + 0.62,
      );
    /** Height of whatever is underfoot at a point: the storey's own floor, or
     *  a tread of the flight running through the core. Two flights can pass
     *  over the same spot, so the one nearest the walker wins. */
    const supportAt = (x: number, z: number, from: number) => {
      let best = floorBase(p, level),
        bestGap = Infinity;
      const consider = (i: number) => {
        const storey = p.floors[i],
          core = storey && coreOf(i);
        if (!core) return;
        const h = stairHeightAt(core, storey.height, x, z);
        if (h === null) return;
        // Without a storey above there is no flight, only the landing you
        // arrive on, so nothing higher than the floor is standable.
        if (!p.floors[i + 1] && h > 0.01) return;
        const y = floorBase(p, i) + h;
        const gap = Math.abs(y - from);
        if (gap < bestGap) {
          bestGap = gap;
          best = y;
        }
      };
      // The storey below reaches up through the well, and the one above
      // owns the landing you step out on to at the top of the flight.
      consider(level - 1);
      consider(level);
      consider(level + 1);
      // A flight is only reachable from close to it; otherwise stay on this
      // floor rather than snapping to a step overhead.
      return bestGap <= 2.2 ? best : floorBase(p, level);
    };
    /** What you can see. Walking through the house shows every storey with
     *  its ceiling on. Orbiting cuts the building at the selected floor, so
     *  you look down into it instead of at the roof. */
    const showLevels = () => {
      model.setVisible((l) => walking || l.index <= level);
      model.setCeilings((l) => walking && l.index <= level);
    };
    /** Settle on the storey whose floor the walker is standing at or above. */
    const settleLevel = () => {
      while (level + 1 < p.floors.length && walkerY >= floorBase(p, level + 1) - 0.06)
        level++;
      while (level > 0 && walkerY < floorBase(p, level) - 0.06) level--;
    };
    const setWalk = (next: boolean) => {
      if (next === walking) return;
      walking = next;
      controls.enabled = !next;
      showLevels();
      keys.clear();
      if (next) {
        const r = initialRoom(p, floor);
        navigate(r.id);
      } else {
        if (document.pointerLockElement === renderer.domElement)
          document.exitPointerLock();
        camera.fov = 48;
        frame();
        camera.updateProjectionMatrix();
      }
    };
    const navigate = (id: string) => {
      const at = p.floors.findIndex((f) => f.rooms.some((r) => r.id === id));
      if (at < 0) return false;
      const target = p.floors[at];
      const r = target.rooms.find((r) => r.id === id)!;
      let view = roomView(p, target, r);
      if (!view) return false;
      if (level !== at) {
        level = at;
        walkerY = floorBase(p, at);
        onFloorChange?.(at);
      }
      if (!valid(view.x, view.z, at)) {
        let found = false;
        for (let v = 0.82; v > 0.1 && !found; v -= 0.13)
          for (let u = 0.82; u > 0.1 && !found; u -= 0.13) {
            const x = r.x + r.w * u,
              z = r.y + r.d * v;
            if (valid(x, z, at)) {
              view = {
                ...view,
                x,
                z,
                yaw: Math.atan2(-(r.x + r.w * 0.4 - x), -(r.y + r.d * 0.2 - z)),
              };
              found = true;
            }
          }
        if (!found) return false;
      }
      walking = true;
      controls.enabled = false;
      camera.fov = 58;
      camera.updateProjectionMatrix();
      walkerY = floorBase(p, level);
      showLevels();
      camera.position.set(view.x, walkerY + EYE, view.z);
      yaw = view.yaw;
      pitch = view.pitch;
      camera.rotation.set(pitch, yaw, 0, "YXZ");
      setActiveRoom(id);
      keys.clear();
      return true;
    };
    const setMood = (value: Mood) => {
      if (value === "day") {
        scene.background = new THREE.Color("#d9e5eb");
        hemi.color.set("#eaf3ff");
        hemi.intensity = 0.85;
        sun.color.set("#fff1d6");
        sun.intensity = 3.2;
        sun.position.set(p.site.width + 25, 35, -18);
        scene.environmentIntensity = 0.5;
        renderer.toneMappingExposure = 1.12;
      } else if (value === "sunset") {
        scene.background = new THREE.Color("#c7afa1");
        hemi.color.set("#bdd0e3");
        hemi.intensity = 0.5;
        sun.color.set("#ffc78c");
        sun.intensity = 2.8;
        sun.position.set(p.site.width + 35, 14, p.site.depth * 0.5);
        scene.environmentIntensity = 0.35;
        renderer.toneMappingExposure = 1.02;
      } else {
        scene.background = new THREE.Color("#202f44");
        hemi.color.set("#7394c2");
        hemi.intensity = 0.18;
        sun.color.set("#98b7e4");
        sun.intensity = 0.18;
        sun.position.set(-15, 28, 8);
        scene.environmentIntensity = 0.14;
        renderer.toneMappingExposure = 1.15;
      }
    };
    setMood(moodRef.current);
    const old = savedView.current;
    if (
      old &&
      old.floor === floor.id &&
      old.walk === walking &&
      (!walking || valid(old.x, old.z))
    ) {
      camera.position.set(old.x, old.y, old.z);
      yaw = old.yaw;
      pitch = old.pitch;
      controls.target.copy(old.target);
      controls.enabled = !walking;
      walkerY = old.y - EYE;
      settleLevel();
      showLevels();
      if (walking) camera.rotation.set(pitch, yaw, 0, "YXZ");
      else controls.update();
    } else if (walking) {
      navigate(initialRoom(p, p.floors[level]).id);
    } else showLevels();
    const capture = () => {
      renderer.render(scene, camera);
      renderer.domElement.toBlob((blob) => {
        if (!blob) {
          setNotice("Could not capture this view.");
          return;
        }
        const url = URL.createObjectURL(blob),
          a = document.createElement("a");
        a.href = url;
        a.download = "aangan-interior.png";
        a.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
        setNotice("Your current interior view was saved as a PNG.");
      }, "image/png");
    };
    const lock = () => {
      if (!walking) return;
      renderer.domElement.focus();
      try {
        const result = renderer.domElement.requestPointerLock();
        result?.catch(() =>
          setNotice(
            "Mouse capture is unavailable. Drag to look, or use the arrow keys.",
          ),
        );
      } catch {
        setNotice("Drag to look, or use the arrow keys.");
      }
    };
    runtime.current = {
      setLevel: (i: number) => {
        if (i === level || !p.floors[i]) return;
        level = i;
        walkerY = floorBase(p, i);
        showLevels();
        if (walking) navigate(initialRoom(p, p.floors[i]).id);
      },
      navigate,
      setWalk,
      setMood,
      setPalette: model.mats.setPalette,
      setLights: model.setLights,
      capture,
      lock,
    };
    const down = (e: KeyboardEvent) => {
      if (
        !walking ||
        /^(INPUT|TEXTAREA|SELECT)$/.test((e.target as HTMLElement)?.tagName) ||
        document.querySelector('[role="dialog"]')
      )
        return;
      if (
        [
          "KeyW",
          "KeyA",
          "KeyS",
          "KeyD",
          "ArrowUp",
          "ArrowDown",
          "ArrowLeft",
          "ArrowRight",
        ].includes(e.code)
      ) {
        e.preventDefault();
        keys.add(e.code);
      }
    };
    const up = (e: KeyboardEvent) => keys.delete(e.code),
      blur = () => keys.clear();
    const look = (dx: number, dy: number) => {
      yaw -= dx * 0.002;
      pitch = Math.max(-1.15, Math.min(1.15, pitch - dy * 0.002));
    };
    let drag: { x: number; y: number } | null = null;
    const move = (e: MouseEvent) => {
      if (walking && document.pointerLockElement === renderer.domElement)
        look(e.movementX, e.movementY);
    };
    const pointerDown = (e: PointerEvent) => {
      if (walking && e.button === 0) {
        drag = { x: e.clientX, y: e.clientY };
        renderer.domElement.setPointerCapture(e.pointerId);
      }
    };
    const pointerMove = (e: PointerEvent) => {
      if (
        !drag ||
        !walking ||
        document.pointerLockElement === renderer.domElement
      )
        return;
      look(e.clientX - drag.x, e.clientY - drag.y);
      drag = { x: e.clientX, y: e.clientY };
    };
    const pointerUp = () => (drag = null);
    const lockChange = () => {
      setLocked(document.pointerLockElement === renderer.domElement);
      keys.clear();
    };
    renderer.domElement.addEventListener("pointerdown", pointerDown);
    renderer.domElement.addEventListener("pointermove", pointerMove);
    renderer.domElement.addEventListener("pointerup", pointerUp);
    renderer.domElement.addEventListener("pointercancel", pointerUp);
    renderer.domElement.addEventListener("dblclick", lock);
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    window.addEventListener("blur", blur);
    document.addEventListener("mousemove", move);
    document.addEventListener("pointerlockchange", lockChange);
    const resize = new ResizeObserver(() => {
      if (!el.clientWidth || !el.clientHeight) return;
      camera.aspect = el.clientWidth / el.clientHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(el.clientWidth, el.clientHeight);
    });
    resize.observe(el);
    renderer.setAnimationLoop(() => {
      const now = performance.now(),
        dt = Math.min((now - previous) / 1000, 0.05);
      previous = now;
      if (walking) {
        if (keys.has("ArrowLeft")) yaw += dt * 1.1;
        if (keys.has("ArrowRight")) yaw -= dt * 1.1;
        let forward =
          Number(keys.has("KeyW") || keys.has("ArrowUp")) -
          Number(keys.has("KeyS") || keys.has("ArrowDown")),
          side = Number(keys.has("KeyD")) - Number(keys.has("KeyA"));
        const length = Math.hypot(forward, side) || 1;
        forward /= length;
        side /= length;
        const dx = (-Math.sin(yaw) * forward + Math.cos(yaw) * side) * dt * 5.5,
          dz = (-Math.cos(yaw) * forward - Math.sin(yaw) * side) * dt * 5.5;
        if (valid(camera.position.x + dx, camera.position.z))
          camera.position.x += dx;
        if (valid(camera.position.x, camera.position.z + dz))
          camera.position.z += dz;
        // Follow whatever is underfoot, easing on to it so a flight reads as
        // a climb rather than a series of jumps.
        const support = supportAt(
          camera.position.x,
          camera.position.z,
          walkerY,
        );
        walkerY += (support - walkerY) * Math.min(1, dt * 12);
        const before = level;
        settleLevel();
        if (level !== before) {
          showLevels();
          onFloorChange?.(level);
          lastRoom = "";
        }
        camera.position.y = walkerY + EYE;
        camera.rotation.set(pitch, yaw, 0, "YXZ");
        if (now - lastPosition > 150) {
          lastPosition = now;
          setPosition({ x: camera.position.x, z: camera.position.z, yaw });
          // Development only: lets the browser tests observe the walker
          // climbing, which is not otherwise visible from the DOM.
          if (import.meta.env.DEV)
            (window as unknown as Record<string, unknown>).__aangan = {
              x: camera.position.x,
              y: camera.position.y,
              z: camera.position.z,
              walkerY,
              level,
              yaw,
              walking,
            };
          const room = p.floors[level].rooms.find(
            (r) =>
              camera.position.x >= r.x &&
              camera.position.x <= r.x + r.w &&
              camera.position.z >= r.y &&
              camera.position.z <= r.y + r.d,
          );
          if (room && room.id !== lastRoom) {
            lastRoom = room.id;
            setActiveRoom(room.id);
          }
        }
      } else controls.update();
      renderer.render(scene, camera);
    });
    return () => {
      savedView.current = {
        floor: p.floors[level]?.id ?? floor.id,
        x: camera.position.x,
        z: camera.position.z,
        y: camera.position.y,
        yaw,
        pitch,
        walk: walking,
        target: controls.target.clone(),
      };
      runtime.current = null;
      renderer.setAnimationLoop(null);
      resize.disconnect();
      controls.dispose();
      renderer.domElement.removeEventListener("pointerdown", pointerDown);
      renderer.domElement.removeEventListener("pointermove", pointerMove);
      renderer.domElement.removeEventListener("pointerup", pointerUp);
      renderer.domElement.removeEventListener("pointercancel", pointerUp);
      renderer.domElement.removeEventListener("dblclick", lock);
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
      window.removeEventListener("blur", blur);
      document.removeEventListener("mousemove", move);
      document.removeEventListener("pointerlockchange", lockChange);
      if (document.pointerLockElement === renderer.domElement)
        document.exitPointerLock();
      model.dispose();
      environment.dispose();
      renderer.dispose();
      renderer.domElement.remove();
    };
  }, [p, showFurniture]);
  return (
    <div
      className={`archviz ${present ? "presenting" : ""} ${walk ? "walking" : "orbiting"}`}
    >
      <div className="viewer" ref={host} />
      {error && (
        <div className="viewer-message" role="alert">
          {error}
        </div>
      )}
      <div className="presentation-top">
        <div className="presentation-title">
          {present && (
            <button
              className="glass-icon"
              aria-label="Exit presentation"
              onClick={() => setPresent(false)}
            >
              <ArrowLeft size={18} />
            </button>
          )}
          <div>
            <span>AANGAN / INTERACTIVE RESIDENCE</span>
            <h2>
              {present ? p.name : walk ? current.name : "The complete picture"}
            </h2>
          </div>
        </div>
        <div className="presentation-actions">
          {present && (
            <select
              aria-label="Presentation floor"
              value={p.floors.findIndex((f) => f.id === floor.id)}
              onChange={(e) => onFloorChange?.(+e.target.value)}
            >
              {p.floors.map((f, i) => (
                <option key={f.id} value={i}>
                  {f.name}
                </option>
              ))}
            </select>
          )}
          <button
            title="Save current view"
            aria-label="Save current view"
            className="glass-icon"
            onClick={() => runtime.current?.capture()}
          >
            <Camera size={17} />
          </button>
          <button
            title="Interior settings"
            aria-label="Interior settings"
            className={`glass-icon ${settings ? "selected" : ""}`}
            onClick={() => setSettings(!settings)}
          >
            <Settings2 size={17} />
          </button>
          <button
            className="present-button"
            onClick={() => {
              setPresent(!present);
              setSettings(false);
            }}
          >
            <Expand size={15} />
            {present ? "Exit presentation" : "Present design"}
          </button>
        </div>
      </div>
      {walk && (
        <div className="tour-room-badge">
          <span className="live-dot" /> {floor.name} <span>/</span>{" "}
          {current.name}
        </div>
      )}
      {walk && present && (
        <div className="tour-minimap">
          <span>
            YOU ARE HERE <small>N ↑</small>
          </span>
          <svg
            viewBox={`0 0 ${p.site.width} ${p.site.depth}`}
            aria-label="Room navigation map"
          >
            {floor.rooms.map((r) => (
              <rect
                key={r.id}
                x={r.x}
                y={r.y}
                width={r.w}
                height={r.d}
                fill={r.id === current.id ? "#b5a17e" : "#ffffff18"}
                stroke="#ffffff65"
                strokeWidth=".15"
                onClick={() => go(r.id)}
              >
                <title>{r.name}</title>
              </rect>
            ))}
            <g
              transform={`translate(${position.x} ${position.z}) rotate(${(-position.yaw * 180) / Math.PI})`}
            >
              <path d="M0 -.7L-.6 .6L0 .3L.6 .6Z" fill="white" />
              <circle r="1.6" fill="none" stroke="#fff" strokeWidth=".1" />
            </g>
          </svg>
          <small>Click a room to enter</small>
        </div>
      )}
      {settings && (
        <aside className="interior-settings">
          <div className="settings-heading">
            <h3>Set the atmosphere</h3>
            <button
              aria-label="Close interior settings"
              className="glass-icon"
              onClick={() => setSettings(false)}
            >
              <X size={16} />
            </button>
          </div>
          <label>LIGHT & TIME</label>
          <div className="mood-options">
            {(
              [
                { id: "day", name: "Daylight", icon: Sun },
                { id: "sunset", name: "Golden hour", icon: Sunset },
                { id: "evening", name: "Evening", icon: Moon },
              ] as const
            ).map((v) => (
              <button
                key={v.id}
                className={mood === v.id ? "selected" : ""}
                onClick={() => setMood(v.id)}
              >
                <v.icon size={17} />
                {v.name}
              </button>
            ))}
          </div>
          <button
            className="light-switch"
            aria-pressed={lights}
            onClick={() => setLights(!lights)}
          >
            <Lightbulb size={16} />
            Interior lights
            <span className={lights ? "switch on" : "switch"} />
          </button>
          <label>
            INTERIOR PALETTE <small>view preview</small>
          </label>
          <div className="palette-options">
            {(Object.keys(palettes) as Palette[]).map((key) => (
              <button
                key={key}
                className={palette === key ? "selected" : ""}
                onClick={() => setPalette(key)}
              >
                <span style={{ background: palettes[key].fabric }} />
                <span style={{ background: palettes[key].cabinet }} />
                {palettes[key].label}
                {palette === key && <Check size={14} />}
              </button>
            ))}
          </div>
          {walk && onMaterialChange && (
            <>
              <label>
                {current.name.toUpperCase()} · FLOORING{" "}
                <small>saved to project</small>
              </label>
              <div className="floor-options">
                {(Object.keys(materialColors) as Material[]).map((mat) => (
                  <button
                    className={current.material === mat ? "selected" : ""}
                    key={mat}
                    onClick={() => onMaterialChange(current.id, mat)}
                  >
                    <span
                      className={`material-swatch ${mat}`}
                      style={{ backgroundColor: materialColors[mat] }}
                    />
                    {mat}
                    {current.material === mat && <Check size={11} />}
                  </button>
                ))}
              </div>
            </>
          )}
          <p>
            Lighting and palette preview your design. Floor finishes also update
            the editable plan.
          </p>
        </aside>
      )}
      <div className="presentation-bottom">
        <div className="tour-nav">
          <button
            className={walk ? "selected" : ""}
            onClick={() => {
              onWalkChange?.(true);
              go(initialRoom(p, floor).id);
            }}
          >
            <Footprints size={16} />
            <span>Walk</span>
          </button>
          <button
            className={!walk ? "selected" : ""}
            onClick={() => {
              setTour(false);
              onWalkChange?.(false);
            }}
          >
            <Layers size={16} />
            <span>Overview</span>
          </button>
          <span className="tour-divider" />
          <div className="tour-room-select">
            <span>EXPLORE A ROOM</span>
            <select
              aria-label="Explore a room"
              value={current.id}
              onChange={(e) => {
                setTour(false);
                go(e.target.value);
              }}
            >
              {floor.rooms.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
            </select>
          </div>
          <button
            className={tour ? "selected" : ""}
            aria-label={tour ? "Pause room slideshow" : "Start room slideshow"}
            onClick={() => {
              if (!tour) go(current.id);
              setTour(!tour);
            }}
          >
            {tour ? <Pause size={16} /> : <Play size={16} />}
            <span>{tour ? "Pause" : "Room tour"}</span>
          </button>
          {walk && (
            <button
              className="mouse-look"
              onClick={() => runtime.current?.lock()}
            >
              <MousePointer2 size={15} />
              <span>{locked ? "Mouse captured" : "Mouse look"}</span>
            </button>
          )}
        </div>
        <div className="walk-help">
          {walk
            ? "W A S D to move · Drag to look · Double-click for mouse look · Esc to release"
            : "Drag to orbit · Scroll to zoom · Right-drag to pan"}
          <small>
            Desktop architectural visualization ·{" "}
            {tour
              ? "Room slideshow changes viewpoint every 6 seconds"
              : "All rendering stays on your computer"}
          </small>
        </div>
      </div>
      {walk && locked && <div className="crosshair">·</div>}
      {notice && (
        <div className="presentation-notice" role="status">
          {notice}
        </div>
      )}
      <a
        className="asset-credit"
        href="https://polyhaven.com/a/wood_floor"
        target="_blank"
        rel="noreferrer"
      >
        Textures · Poly Haven / CC0
      </a>
    </div>
  );
}
