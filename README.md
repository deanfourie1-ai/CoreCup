# Core Cup

A tactical football game played by humanoid robots powered by mythological creature cores.
This is the browser prototype of a possible future board game.

## Run it

You need [Node.js](https://nodejs.org) 20 or newer.

```bash
npm install
npm run dev
```

Then open the address it prints (usually http://localhost:5173).

The 2D sprite art test lives at `/sprite-lab.html` (see [docs/2d-sprites](docs/2d-sprites/README.md)).

## Other commands

| Command | What it does |
| --- | --- |
| `npm test` | Runs the rules tests |
| `npm run build` | Type-checks and builds a production version into `dist/` |
| `npm run typecheck` | Type-checks only |

## Layout

- `src/engine/` holds the game rules. It has no UI code, so rules can be tested on their own and later reused for online play.
  - `index.ts` is the public entry point. `createMatch` sets up a match, `step` advances it by one event (a robot's action or a ball landing), and `playMatch` runs a whole match headless.
  - Coaches answer every choice through the `Controller` interface (actions, reactions, corner picks). `createSimpleAI` is the baseline AI.
  - `rules.ts` holds every tunable number (costs, flight times, match length), so playtests can change values without touching the engine.
  - Matches are seeded, so the same seed and coaches replay the same match.
- `src/data/` holds game data such as clubs and players.
- `src/sprites/` holds the 2D sprite system: atlas contract, facings, layered gear and the compositor.
- `src/lab/` is the Sprite Lab page (three.js pitch, sprite players).
- `public/sprites/` holds sprite atlases; `tools/sprites/` has the scripts that prepared them.
- Everything else in `src/` is the screen.
