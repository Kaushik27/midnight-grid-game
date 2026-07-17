# Midnight Grid

An original, browser-based open-city action game. Steal a ride, collect the Pier
9 package, lose the police, and deliver it to the garage before the clock runs
out. The game uses a responsive Canvas 2D renderer and ships without copied GTA
branding, characters, maps, or assets.

## Play

```bash
npm install
npm run dev
```

Open `http://localhost:3000`.

- `WASD` or arrow keys: move and drive
- `Shift`: sprint
- `E`: enter or exit a vehicle
- `Space`: handbrake
- `P` or `Esc`: pause
- `M`: mute
- `R`: retry after a completed or failed run

Touch controls appear automatically on smaller screens.

## Hosted game

The production game is deployed to GitHub Pages from `main`:

<https://kaushik27.github.io/midnight-grid-game/>

The deployment workflow builds a static Vite entry point while keeping the
existing Vinext development and server build intact.

## Verify

```bash
npm test
npm run lint
npm run typecheck
```

The test suite covers the production build, server-rendered shell, input math,
collision sliding, safe vehicle exits, mission order, pursuit escape state,
deterministic effects, and removal of starter UI.

## Main files

- `app/MidnightGridGame.tsx`: renderer, simulation, AI, audio, UI, and controls
- `app/game-core.mjs`: deterministic geometry and mission helpers
- `app/globals.css`: responsive game shell and overlays
- `site/main.tsx`: static GitHub Pages entry point
- `.github/workflows/deploy-pages.yml`: Pages build and deployment
- `tests/game.test.mjs`: logic and production-shell tests
