# Aangan · Local architecture chatbot

A fresh conversation is the starting point. Describe the plot and the purpose of each floor; the app interprets the brief with local Ollama, searches 108 arrangements, checks geometry and access, and displays up to three concepts. Follow-up instructions preserve the current floor program.

## Run

```sh
npm install
npm run dev
```

Open **http://127.0.0.1:5173**. Keep Ollama running on `127.0.0.1:11434` with an installed model. The current machine has `qwen3:4b`; no paid API or account is required. The Vite development and preview servers proxy `/ollama` to that loopback service, so no browser CORS override is needed.

```sh
npm run build
npm run preview
npm test
```

A static file host alone does not provide the Ollama proxy. Use the supplied local development/preview server.

## What changed

- No seeded house, automatic bedrooms or initial floor plan.
- The first load of this version removes `aangan-project-v1`, its recovery key and previous architecture conversation data. A migration marker prevents later reloads from erasing new work.
- **New conversation** clears architecture-generated browser data again. It preserves assets, rules and unrelated applications' storage. This app has no SQL database; no JobPilot database or files are reset.
- New conversation state is saved under `aangan-conversation-v3`. Export a project or its interpreted brief to keep a separate JSON copy.
- Qwen extracts a typed floor program. The geometry solver never accepts room coordinates from the model.
- Bundled local reference documents and a worked example are retrieved by keyword overlap. This is a small reference layer, not an embedding database, fine-tuned model, or a large curated plan corpus.
- The solver varies core width, shaft/landing width, lobby depth, core side and room allocation. It ranks surviving arrangements by preferred room dimensions, usable area and the existing Vastu score. It then checks the displayed results with the editor's overlap and walkability validator.
- Parking floors reject residential fillers. Requested counts and attached bathrooms must fit, rather than being silently removed.
- Stair and lift reservations align through the building. An unrequested terrace elevator stop is excluded. Stairs and elevator controls work in the desktop walkthrough.
- Parking cars, kitchen/bathroom fixtures, bedrooms, theatre furniture, garden planting, jacuzzi and a covered pergola are represented in both plan and 3D geometry.
- Plans support room dragging, resizing, material changes and undo. A structural core edit is propagated to every floor. Manual edits can create conflicts; check the planning panel afterwards.

## Example

> I have a 30 × 40 ft plot and want a G+3 independent house. Ground floor: car parking, pedestrian entry and staircase. First floor: living hall, kitchen and one bathroom. Second floor: two bedrooms. Third floor: one master bedroom and a home theatre. Elevator from ground to third floor. Terrace: garden, jacuzzi and a covered shelter.

This represents five levels: ground, first, second, third and terrace. A 20 × 30 version of the same program currently fails the configured parking/core constraints. The app explains that result, preserves the program and accepts a follow-up such as “Use 30 × 40 instead.” A failed bounded search is not proof that the site has no possible architectural solution.

## Design boundaries

Room size targets are in `src/planningRules.ts`; they are product design constraints, not statutory minima. Setbacks are disclosed assumptions. The current solver uses a rectangular footprint, one aligned dog-legged stair, and at most one elevator. It does not solve arbitrary irregular plots or every independent-house topology.

The score is a heuristic ranking, not an architectural certification. The app does not yet optimize the full seven-part weighted score in the product proposal, use embedding RAG, learn persistent global rules from arbitrary corrections, or fine-tune Qwen. Corrections are retained in the conversation's structured program.

These are conceptual drawings and an interactive browser rendering. Road turning geometry, net clear room dimensions, code compliance, structural design, lift supplier requirements, terrace water loads, and detailed plumbing/electrical/fire design require further engineering. The model parser can still misunderstand a request; the understood requirements remain visible and exportable for review.

## Main files

- `src/Studio.tsx`: conversational workflow, review and desktop views.
- `src/program.ts`, `src/brief.ts`: reference retrieval, local model parsing and schema checks.
- `src/residentialPlanner.ts`, `src/planningRules.ts`: candidate search and room standards.
- `src/engine.ts`: shared geometry, openings, furniture and collision validation.
- `src/Plan.tsx`, `src/interiorScene.ts`, `src/Viewer.tsx`: plans, 3D assembly and navigation.
- `src/studioStorage.ts`: scoped reset and conversation persistence.
- `knowledge/`: local planning references and example.

`Editor.tsx`, `Chat.tsx` and `layout.ts` preserve the earlier editor and corridor solver for migration/reference; the new startup workflow does not call that solver.

## Browser integration check

`tests/studio_live_smoke.py` uses the real local model, not a mocked response. With Python Playwright and Chromium installed:

```sh
PLAYWRIGHT_CHROMIUM_EXECUTABLE=/path/to/chromium python tests/studio_live_smoke.py
```

It checks a blank start, scoped reset, the five-level example, 2D/3D/walk views, persistence, dimension follow-ups and a mobile viewport. Screenshots and the test conversation are written to ignored `artifacts/`. Older browser scripts target the previous editor UI; unit tests still cover its shared geometry.

For a repeatable rendering check after the live test, run `node --import tsx tests/studio_fixture.mts`, then run `tests/studio_viewer_smoke.py` with the same Chromium environment variable. It verifies an elevator round trip, the selected-floor regression, terrace rendering, elevations, room-rule feedback and undo. The fixture uses the saved real-model brief and the current solver.
