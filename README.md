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
- `src/data/` holds game data such as clubs and players.
- Everything else in `src/` is the screen.
