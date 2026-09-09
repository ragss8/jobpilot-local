# Aangan · Local architectural concept studio

A working implementation of the first milestone in the supplied Vastu Architect brief: enter a site, generate alternative floor plans, edit a plan, furnish it, and explore the same geometry in 3D and first person.

This is a standalone project inside `vastu-architect-ai/`. It does not modify or depend on JobPilot. React, TypeScript, Vite, and Three.js run in your browser. No account, paid AI API, cloud storage, or GPU model download is required. After installing dependencies, all application assets and processing are local; there are no CDN assets, external fonts, or runtime network integrations.

## Run

Node.js 22.12+ is recommended. From this directory:

```sh
npm install
npm run dev
```

Open **http://127.0.0.1:5173**. Keep the terminal running. The server binds to the loopback interface. If that port is occupied, Vite prints the actual port it uses. Use the same address and port consistently: browser storage belongs to an origin.

For the compiled application:

```sh
npm run build
npm run preview
```

Open **http://127.0.0.1:4173**. No internet connection is required to run the installed application. This is local development/preview serving, not a hardened public hosting configuration.

## Use the studio

1. **Create a new design** or **Site details → Edit** opens the requirements dialog. Set dimensions, side/rear and road-side setbacks, facing, 1–4 bedrooms, Vastu preference, and a budget target. Generation replaces the current project's floors; Undo restores them.
2. The optional description parser recognizes `30x40`, `south-facing`, `3 BHK` or `3 bedrooms`, and `80 lakh`. Click **Fill from description**, review the fields, and generate. It is an explicit keyword parser, not an LLM, and ignores other prose.
3. Choose among three deterministic alternatives with different bedroom/living allocations. The generator currently supports rectangular sites with a buildable rectangle of at least 22 × 28 ft. Smaller rooms on constrained sites are flagged, not represented as professionally approved.
4. Select a room in the plan or right-hand list. Drag it to move, or drag its green corner to resize on a half-foot grid. The inspector also supports precise width, depth, X/Y coordinates, name, flooring, door wall and position, and window position. Edits update the shared data model immediately. Room moves do not automatically resize neighbors; the checker flags overlaps.
5. **Rooms** adds a room at the northwest corner for manual placement. **Furniture** adds a piece to the selected room. Its inspector controls X/Y position, 90-degree rotation, removal, and reset. **Materials** applies flooring to the selected room, or all rooms of the current floor if none is selected.
6. **3D View** opens a real WebGL model: drag to orbit, scroll to zoom, and right-drag to pan. **Walkthrough** starts in the passage at eye level. Click the scene to capture the mouse, use WASD to move, and Escape to release. Arrow keys offer movement/turning without mouse capture. Walls and furniture block movement. Current 3D assets are locally generated geometric furniture, not third-party GLB models.
7. Duplicate a floor with the plus in **Floors & levels** or **Duplicate this floor**. Each floor has separate rooms and height. Up to five floors are supported. The viewer shows the selected floor; it does not yet assemble a complete multi-storey building or connect floors with traversable stairs.
8. Changes save automatically in this browser on this device. **Export → Project JSON** creates a portable backup; **Open project** imports it. **Floor plan SVG** exports the current 2D view. **Print / Save as PDF** uses the browser's print dialog. Undo/redo retains up to 40 edit snapshots for the session. Project naming is autosaved without individual undo entries.

## What the checks mean

- **Plan checks:** room overlap, side/rear/front setback crossing, selected minimum room dimensions, and furniture overlaps or furniture outside its room (including rotation). They are diagnostics: manual edits can be invalid while the user is arranging a plan.
- **Vastu:** the percentage of checked placements that match the built-in traditional room-zone table. Geographic north remains up regardless of road-facing direction. This is a transparent, limited rule set, not a claim of scientific or building-code compliance. Off mode displays no score; Strict generation only offers 100% matches and reports when the templates cannot meet all rules. Balanced mode exposes compromises. Strict is not a complete spatial solver.
- **Area:** sum of room rectangles across floors, including passage; it is not a certified carpet-area, FAR/FSI, or gross construction-area calculation. Room rectangles represent conceptual wall centerline geometry, not guaranteed clear internal dimensions.
- **Budget:** a stored target only, not a priced estimate. Modern Indian is currently the default descriptive style, not a material/style optimizer.
- **Collision:** single-floor movement against wall sections and furniture bounding rectangles. Doors are actual wall openings and have lintels; windows have sills and transparent glass. Openings are shared between adjoining wall edges. Moving rooms or openings can disconnect access; the app does not yet solve or certify circulation and door approach clearances.

All plans are architectural **concepts**, not construction drawings. Structural systems, accessibility, local municipal rules, electrical/plumbing systems, door swings and furniture clearances need professional review.

## Storage and backups

The current project is stored under `aangan-project-v1` in browser localStorage. Clearing browser data removes it. Keep JSON exports for backups or transferring browsers. Import checks schema, finite dimensions, enum values, unique IDs, and bounded object counts; files over 2 MB are rejected. A malformed saved value is retained under `aangan-project-v1-recovery` when browser storage permits, while a fresh concept opens. Storage failures show a persistent header warning.

There is no background daemon, telemetry, remote database, filesystem autosave, or multi-user synchronization. The current browser project is the working file; use exported JSON for a collection of projects. A browser with hardware-accelerated WebGL is needed for 3D. Keyboard walkthrough controls are intended for desktop; mobile supports plan editing and touch orbit, but has no on-screen movement joystick yet.

## Implementation

- `src/engine.ts`: project schema; deterministic room allocation; furniture primitives; shared doors/windows and segmented walls; Vastu scoring; geometry validation; collision bounds; description parsing; guarded import.
- `src/Plan.tsx`: editable SVG room plan, dimensions, landscaping, furniture symbols, door swings, and Vastu grid.
- `src/Viewer.tsx`: lazy-loaded Three.js scene, procedural assets, lighting/shadows, orbit, mouse-look, keyboard walking, collision, and renderer disposal.
- `src/main.tsx`: studio UI, generation alternatives, room inspector, libraries, floor selection/duplication, undo/redo, import/export, local persistence, and dialog focus management.
- `src/style.css`: responsive desktop/tablet/mobile workspace and print layout.

## Verification

```sh
npm test
npm run build
```

The engine suite exercises all 48 combinations of four orientations, 1–4 bedrooms, and three variants, plus deterministic geometry, infeasible sites, real door openings, wall/furniture collision, invalid edits, rotated furniture bounds, computed Vastu, keyword parsing, and guarded JSON round trips.

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

The broader supplied vision is not fully implemented in this first version. Next stages include constrained wall/neighbor editing, full circulation and door/furniture-clearance solving, stair/lift and parking geometry, assembled multi-floor buildings, facade and roof design, lighting/electrical/plumbing schedules, material cost estimation, project-file storage beyond browser localStorage, optional local Ollama requirement extraction, licensed GLB asset catalogs, Blender rendering, and IFC/BIM/DXF/PDF-plan import. There is no NestJS/PostgreSQL/Redis infrastructure yet because this milestone needs neither a remote service nor background render workers.
