# Aangan · Local architectural concept studio

Describe a house in plain words and get floor-wise plans you can edit, furnish, and walk through: enter a site, generate alternative layouts, edit them, and explore the same geometry in 3D and first person.

This is a standalone project inside `vastu-architect-ai/`. It does not modify or depend on JobPilot. React, TypeScript, Vite, and Three.js run in your browser. No account, paid API, or cloud storage is required.

The one network call the app makes is to **Ollama on `127.0.0.1:11434`**, to read a written brief. That is a local service on the loopback interface: nothing leaves the machine, and no key or sign-in is involved. Everything else - assets, fonts, geometry, rendering - is local with no CDN. If Ollama is not installed the chat says so and the manual requirements form still works.

## Run

Node.js 22.12+ is recommended. From this directory:

```sh
npm install
npm run dev
```

For the chat, install [Ollama](https://ollama.com) and pull a model. A 7-8B
instruct model is the sweet spot on Apple silicon with 16GB - noticeably better
than a 4B at holding on to words like "spacious" or "attached":

```sh
ollama pull qwen2.5:7b-instruct   # recommended
ollama pull qwen3:4b              # smaller and faster, drops more detail
```

The app lists every model you have installed and picks the strongest by
default; you can change it in the chat.

Open **http://127.0.0.1:5173**. Keep the terminal running. The server binds to the loopback interface. If that port is occupied, Vite prints the actual port it uses. Use the same address and port consistently: browser storage belongs to an origin.

For the compiled application:

```sh
npm run build
npm run preview
```

Open **http://127.0.0.1:4173**. No internet connection is required to run the installed application. This is local development/preview serving, not a hardened public hosting configuration.

## Use the studio

1. **Describe your home** opens the chat. Write the brief in prose - site size, facing, how many floors, and what belongs on each - and the local model turns it into a floor-by-floor program. **It is then shown back to you as something you can edit**, because a local model reliably gets the shape of a brief right and just as reliably drops a modifier: "spacious", "attached bathroom", or a *master* bedroom flattened to an ordinary one. Correct the levels, spaces, counts, and toggles, then **Design my house** produces three alternatives. Nothing is drawn until you confirm.

2. **Or set the requirements by hand**, or **Site details → Edit**, opens the requirements dialog. Set dimensions, side/rear and road-side setbacks, facing, 1–4 bedrooms, Vastu preference, and a budget target. Generation replaces the current project's floors; Undo restores them.
2. The optional description parser recognizes `30x40`, `south-facing`, `3 BHK` or `3 bedrooms`, and `80 lakh`. Click **Fill from description**, review the fields, and generate. It is an explicit keyword parser, not an LLM, and ignores other prose.
3. Choose among three deterministic alternatives. Generation from a chat brief needs room for a corridor with rooms on both sides; the older single-floor form path needs a buildable rectangle of at least 22 × 28 ft. Smaller rooms on constrained sites are flagged, not represented as professionally approved.
4. Select a room in the plan or right-hand list. Drag it to move, or drag its green corner to resize on a half-foot grid. The inspector also supports precise width, depth, X/Y coordinates, name, flooring, door wall and position, and window position. Edits update the shared data model immediately. Room moves do not automatically resize neighbors; the checker flags overlaps.
5. **Rooms** adds a room at the northwest corner for manual placement. **Furniture** adds a piece to the selected room. Its inspector controls X/Y position, 90-degree rotation, removal, and reset. **Materials** applies flooring to the selected room, or all rooms of the current floor if none is selected.
6. **3D View** opens a real WebGL model of the whole house, storey on storey, with the compound wall, gate, driveway, plinth, window chajjas and roof parapet. Drag to orbit, scroll to zoom, right-drag to pan. Orbiting cuts the building at the selected floor so you can look into it. **Walkthrough** starts at eye level: click the scene to capture the mouse, WASD to move, Escape to release; arrow keys move and turn without mouse capture. Walls and furniture block movement. **The staircase is real** - a dog-legged flight with treads, a half-landing and handrails - so you can climb from the stilt to the terrace, turning at each landing the way you would in the building. The floor selector follows you up. Current 3D assets are locally generated geometry, not third-party GLB models.
7. **Elevations** shows straight-on orthographic views of all four faces, with storey lines and levels, windows and their chajjas, the terrace parapet, and the stilt drawn as open parking on piers. The road-facing one is marked. **Export → Elevations SVG** saves all four.
8. Duplicate a floor with the plus in **Floors & levels** or **Duplicate this floor**. Each floor has separate rooms and height. Up to five floors are supported.
9. Changes save automatically in this browser on this device. **Export → Project JSON** creates a portable backup; **Open project** imports it. **Floor plan SVG** exports the current 2D view. **Print / Save as PDF** uses the browser's print dialog. Undo/redo retains up to 40 edit snapshots for the session. Project naming is autosaved without individual undo entries.

## What the checks mean

- **Plan checks:** room overlap, side/rear/front setback crossing, selected minimum room dimensions, furniture overlaps or furniture outside its room (including rotation), rooms with no outside wall to put a window in, and rooms with no walkable path back to the stair or passage. The last two are checked by flood-filling the floor through its doorways with the same collision test the walkthrough uses. They are diagnostics: manual edits can be invalid while a plan is being arranged.
- **Vastu:** the percentage of checked placements that match the built-in traditional room-zone table. Geographic north remains up regardless of road-facing direction. This is a transparent, limited rule set, not a claim of scientific or building-code compliance. Off mode displays no score; Strict generation only offers 100% matches and reports when the templates cannot meet all rules. Balanced mode exposes compromises. Strict is not a complete spatial solver.
- **Area:** sum of room rectangles across floors, including passage; it is not a certified carpet-area, FAR/FSI, or gross construction-area calculation. Room rectangles represent conceptual wall centerline geometry, not guaranteed clear internal dimensions.
- **Budget:** a stored target only, not a priced estimate. Modern Indian is currently the default descriptive style, not a material/style optimizer.
- **Collision:** movement against wall sections and furniture bounding rectangles, plus the height underfoot on a staircase, which is what carries the walker between storeys. Doors are actual wall openings and have lintels; windows have sills and transparent glass. Openings are shared between adjoining wall edges. Moving rooms or openings can disconnect access; the app does not yet solve or certify circulation and door approach clearances.

All plans are architectural **concepts**, not construction drawings. Structural systems, accessibility, local municipal rules, electrical/plumbing systems, door swings and furniture clearances need professional review.

## Storage and backups

The current project is stored under `aangan-project-v1` in browser localStorage. Clearing browser data removes it. Keep JSON exports for backups or transferring browsers. Import checks schema, finite dimensions, enum values, unique IDs, and bounded object counts; files over 2 MB are rejected. A malformed saved value is retained under `aangan-project-v1-recovery` when browser storage permits, while a fresh concept opens. Storage failures show a persistent header warning.

There is no background daemon, telemetry, remote database, filesystem autosave, or multi-user synchronization. The current browser project is the working file; use exported JSON for a collection of projects. A browser with hardware-accelerated WebGL is needed for 3D. Keyboard walkthrough controls are intended for desktop; mobile supports plan editing and touch orbit, but has no on-screen movement joystick yet.

## Implementation

- `src/brief.ts`: the Ollama client, the JSON schema it must answer in, a strict guard over what comes back, and `normalizeBrief`, which resolves what the model gets wrong (an en-suite double-counted as a shared bath, an empty roof, a forgotten staircase).
- `src/layout.ts`: the layout solver. The corridor and staircase core are solved once from the site and reused on every level, so flights align and walls stack. Rooms are shared between the bands either side by tradition and by load, cut with a minimum run so a pooja room is not a ribbon, and en-suites are carved from their own bedroom.
- `src/Chat.tsx`: the brief screen and the editable interpretation card.
- `src/engine.ts`: project schema and floor roles; deterministic room allocation; furniture primitives placed relative to the door; shared doors/windows and segmented walls; Vastu scoring; geometry validation including ventilation and circulation; collision bounds; keyword parsing; guarded import with v1 migration.
- `src/interiorScene.ts`: the Three.js scene. Each storey is built into its own group lifted to its height; between them run real dog-legged stairs, and around them the exterior envelope.
- `src/materials.ts`: procedurally generated textures, plus one CC0 Poly Haven wood floor.
- `src/presentation.ts`: camera viewpoints, moods, and palettes for the presentation mode.
- `src/Plan.tsx`: editable SVG room plan, dimensions, landscaping, furniture symbols, door swings, and Vastu grid.
- `src/Viewer.tsx`: lazy-loaded Three.js scene, orbit, mouse-look, keyboard walking, floor-aware collision, climbing between storeys, and renderer disposal.
- `src/elevation.ts`: orthographic projection of each face into an SVG drawing.
- `src/main.tsx`: studio UI, generation alternatives, room inspector, libraries, floor selection/duplication, undo/redo, import/export, local persistence, and dialog focus management.
- `src/style.css`: responsive desktop/tablet/mobile workspace and print layout.

## Verification

```sh
npm test
npm run build
```

The engine suite exercises all 48 combinations of four orientations, 1–4 bedrooms, and three variants, plus deterministic geometry, infeasible sites, real door openings, wall/furniture collision, invalid edits, rotated furniture bounds, computed Vastu, keyword parsing, and guarded JSON round trips.

The layout suite covers the brief pipeline without needing a model running: the guard against malformed or hostile model output, the repairs in `normalizeBrief`, and generation from a fixture of the worked brief - four levels with the right roles, a staircase core that stacks on every floor, en-suites that open off their own bedroom, no overlaps or setback crossings, every room reachable from the core, and no furniture parked across a doorway.

The elevation suite checks that every storey appears at the height it actually sits, that openings stay inside the face they are drawn on, that the road-facing elevation is never a blank wall, and that a project name cannot inject markup into the drawing.

To exercise the chat in a real browser, including a live extraction:

```sh
.venv/bin/python tests/chat_smoke.py
```

It skips the model call if Ollama is not running. To check the whole house in 3D - orbiting each level, climbing the staircase from the stilt to the terrace, and rendering the elevations:

```sh
npx tsx tests/fixture.mts /tmp/house.json   # any generated project
.venv/bin/python tests/multifloor_smoke.py /tmp/house.json
```

The optional browser regression script uses Python Playwright:

```sh
python3 -m venv .venv
.venv/bin/pip install playwright
.venv/bin/python -m playwright install chromium
# Start npm run dev in another terminal first.
.venv/bin/python tests/browser_smoke.py
```

Set `PLAYWRIGHT_CHROMIUM_EXECUTABLE` only if using an already installed compatible Chromium. Browser checks cover real room edits, drag resize, validation, undo/redo, materials, furniture, floor duplication, reload persistence, generation options, JSON round trips, SVG download, WebGL orbit, visible movement in walkthrough, mobile overflow, and uncaught page errors. Screenshots and generated test backups are written under ignored `artifacts/`. Test data uses a fresh disposable browser context.

## Remaining roadmap

The house is generated floor by floor, stacked, walkable and drawn in elevation. What it is not yet: rooms are rectangles on a shared corridor frame, so it will not produce an L-shaped plan, a courtyard, a split level or a cut-out. Walls cannot be dragged independently of their rooms. Circulation is checked but door swings and furniture clearances are not solved. There is no lift or ramp, no roof form other than flat, no structural grid, and no cost estimate: the budget is a stored number.

Next: constrained wall editing, door-swing and clearance solving, non-rectangular plans and courtyards, lift and ramp geometry, lighting/electrical/plumbing schedules, material cost estimation, project storage beyond browser localStorage, licensed GLB catalogs, and IFC/BIM/DXF import. There is no NestJS/PostgreSQL/Redis infrastructure because nothing here needs a remote service or a background render worker.
