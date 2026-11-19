// Balance simulator: one configuration per run, so several can run side by side.
// Run from the repo root:  npx vite-node tools/sim/balance.ts <config> [matches=1000] [firstSeed=1]
//   config: off | on | without:<Core>[,<Core>] | cost:<ticks>/<overheat> | smart-home | smart-away | smart-both
//           | player-vs-simple | player-vs-smart  (home = autopilot + simple choices, a stand-in for a person)
// Prints one JSON line: matches, 0-0 count, goals, wins, ability uses.

import { createSimpleAI, createSmartAI, playMatch, RULES, SMART, type Controller } from '../../src/engine';
import { autopilotAction } from '../../src/game/autopilot';

const [config = 'on', nArg = '1000', firstArg = '1'] = process.argv.slice(2);
const N = Number(nArg);
const first = Number(firstArg);

RULES.abilities = config !== 'off';
if (config.startsWith('without:')) RULES.abilitiesOff = config.slice(8).split(',');
if (config.startsWith('cost:')) {
  const [cost, oh] = config.slice(5).split('/').map(Number);
  RULES.abilityCost = { 1: cost, 2: cost, 3: cost };
  RULES.overheatTicks = oh;
}

// Smart AI knobs to try, e.g. SMART='{"pass":0.75}'.
if (process.env.SMART) Object.assign(SMART, JSON.parse(process.env.SMART));

// Rule knobs to try, e.g. RULESX='{"wallStopsShots":["driven"]}'.
if (process.env.RULESX) Object.assign(RULES, JSON.parse(process.env.RULESX));

// A stand-in for a person: the team-shape autopilot plays off-ball turns, the simple AI's choices the rest.
function player(seed: number): Controller {
  const thinker = createSimpleAI(seed);
  return { ...thinker, chooseAction: (s, r, legal) => autopilotAction(s, r, legal) ?? thinker.chooseAction(s, r, legal) };
}

const pick = (side: 'home' | 'away', seed: number): Controller => {
  if (side === 'home' && config.startsWith('player-')) return player(seed);
  if (side === 'away' && config === 'player-vs-smart') return createSmartAI(seed);
  return config === `smart-${side}` || config === 'smart-both' ? createSmartAI(seed) : createSimpleAI(seed);
};

const out = { config, smart: process.env.SMART ?? '', rules: process.env.RULESX ?? '', n: N, nil: 0, goals: 0, home: 0, away: 0, uses: {} as Record<string, number> };
for (let i = first; i < first + N; i++) {
  const s = playMatch({ seed: i * 7919 }, { home: pick('home', i), away: pick('away', i + 999) });
  const g = s.score.home + s.score.away;
  out.goals += g;
  if (g === 0) out.nil++;
  if (s.score.home > s.score.away) out.home++;
  if (s.score.away > s.score.home) out.away++;
  for (const e of s.log) if (e.t === 'ability') out.uses[e.name] = (out.uses[e.name] ?? 0) + 1;
}
console.log(JSON.stringify(out));
