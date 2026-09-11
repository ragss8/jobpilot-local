# Aangan · Local architecture chatbot

A fresh conversation is the starting point. Describe the plot and the purpose of each floor; the app interprets the brief with local Ollama, searches 108 arrangements, checks geometry and access, and displays up to three concepts. Follow-up instructions preserve the current floor program.

## Run

Requirements: Node 22.9 or newer, Docker (for the local Postgres), and Ollama on `127.0.0.1:11434` with an installed model. The current machine has `qwen3:4b`; no paid API is required.

```sh
npm install
cp .env.example .env   # then fill in JWT_SECRET and GOOGLE_CLIENT_ID
npm run db:up          # Postgres 18 on 127.0.0.1:5433
npm run server         # accounts and chat-history API on 127.0.0.1:8787
npm run dev            # the studio on port 5173
```

`./start.sh` (or `start.bat`) starts the database, API and studio together.

Open **http://localhost:5173**. Google sign-in only accepts `localhost` as a local origin, so the studio redirects `http://127.0.0.1:5173` (the address Vite prints) there. The Vite development and preview servers proxy `/api` to the API and `/ollama` to the local model, so no browser CORS override is needed.

```sh
npm run build
npm run preview
npm test
npm run test:server    # API tests against the Postgres in .env
```

A static file host alone does not provide these proxies. Use the supplied local development/preview server.

## Google sign-in

1. In [Google Cloud Console](https://console.cloud.google.com/apis/credentials), configure the OAuth consent screen (External, Testing) and add the demo accounts as test users.
2. Create an **OAuth client ID** of type **Web application**. Under **Authorized JavaScript origins**, add both `http://localhost` and `http://localhost:5173`. No redirect URI is needed.
3. Put the client ID in `.env` as `GOOGLE_CLIENT_ID`, list the demo accounts in `ALLOWED_EMAILS`, and restart `npm run server`.

## Accounts and chat history

- Sign In With Google gives the browser a Google ID token, which it posts to `POST /api/auth/google`. The API verifies it against Google's public keys (issuer, audience = your client ID, expiry), requires a verified email on the allow-list, and returns the app's own HS256 JWT, valid for 7 days. Every other API call needs `Authorization: Bearer <jwt>`.
- Postgres tables: `users` (keyed by Google's `sub`), `conversations` (owner, title and the design state as `jsonb`) and `messages` (one row per chat message, with the time it was recorded). The API only reads or writes conversations owned by the caller.
- The studio saves the open conversation shortly after each change and reopens your most recent one when you sign in. **History** lists all of your conversations; **New conversation** starts another.
- Endpoints: `GET /api/conversations` lists yours, `GET /api/conversations/:id` returns one, and `PUT /api/conversations/:id` creates or updates it.
- A conversation kept in this browser before accounts existed (`aangan-conversation-v3`) moves into the first account that signs in here.
- This is a local proof of concept: the session JWT is kept in `localStorage`, the database password in `compose.yml` is a local development value, and nothing is deployed.

## What changed

- No seeded house, automatic bedrooms or initial floor plan.
- The first load of this version removes `aangan-project-v1`, its recovery key and previous architecture conversation data. A migration marker prevents later reloads from erasing new work.
- Export a project or its interpreted brief to keep a separate JSON copy.
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

- `src/App.tsx`, `src/Login.tsx`, `src/api.ts`: Google sign-in, the session JWT and API calls.
- `src/Studio.tsx`: conversational workflow, conversation history, review and desktop views.
- `server/app.ts`, `server/index.ts`, `server/schema.ts`: accounts and chat-history API, Google token verification and the Postgres schema.
- `src/program.ts`, `src/brief.ts`: reference retrieval, local model parsing and schema checks.
- `src/residentialPlanner.ts`, `src/planningRules.ts`: candidate search and room standards.
- `src/engine.ts`: shared geometry, openings, furniture and collision validation.
- `src/Plan.tsx`, `src/interiorScene.ts`, `src/Viewer.tsx`: plans, 3D assembly and navigation.
- `src/studioStorage.ts`: conversation types, scoped reset and the pre-account browser storage format.
- `knowledge/`: local planning references and example.

`Editor.tsx`, `Chat.tsx` and `layout.ts` preserve the earlier editor and corridor solver for migration/reference; the new startup workflow does not call that solver.

## Browser integration check

These Playwright scripts were written before accounts existed. They open the studio without signing in and read the conversation from `localStorage`, so they need updating before they pass again.

`tests/studio_live_smoke.py` uses the real local model, not a mocked response. With Python Playwright and Chromium installed:

```sh
PLAYWRIGHT_CHROMIUM_EXECUTABLE=/path/to/chromium python tests/studio_live_smoke.py
```

It checks a blank start, scoped reset, the five-level example, 2D/3D/walk views, persistence, dimension follow-ups and a mobile viewport. Screenshots and the test conversation are written to ignored `artifacts/`. Older browser scripts target the previous editor UI; unit tests still cover its shared geometry.

For a repeatable rendering check after the live test, run `node --import tsx tests/studio_fixture.mts`, then run `tests/studio_viewer_smoke.py` with the same Chromium environment variable. It verifies an elevator round trip, the selected-floor regression, terrace rendering, elevations, room-rule feedback and undo. The fixture uses the saved real-model brief and the current solver.
