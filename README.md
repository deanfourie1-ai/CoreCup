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
- `src/game/` connects the engine to a person: it pauses a step when the engine needs your answer (a reaction or a corner) and replays it once you answer.
- `src/ui/` is the placeholder board: the hex pitch, the timeline track, action buttons and pop-ups. It will be reskinned once the art direction is final.
