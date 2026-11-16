// Rules simulator for signature abilities: AI against AI, abilities on and off, same seeds.
// Run from the repo root:  npx vite-node tools/sim/abilities.ts [matches=400]
// Prints the 0-0 rate, goals per match and how often each ability fires (and what it did).

import { createSimpleAI, playMatch, RULES, type MatchState } from '../../src/engine';

const N = Number(process.argv[2] ?? 400);

function run(label: string, abilities: boolean, tweak: () => void = () => {}) {
  const saved = { ...RULES, abilityCost: { ...RULES.abilityCost } };
  RULES.abilities = abilities;
  tweak();
  let nil = 0;
  let goals = 0;
  let homeWins = 0;
  let awayWins = 0;
  const uses = new Map<string, number>();
  const extra = new Map<string, number>();
  const bump = (m: Map<string, number>, k: string) => m.set(k, (m.get(k) ?? 0) + 1);
  for (let i = 1; i <= N; i++) {
    const s: MatchState = playMatch({ seed: i * 7919 }, { home: createSimpleAI(i), away: createSimpleAI(i + 999) });
    const g = s.score.home + s.score.away;
    goals += g;
    if (g === 0) nil++;
    if (s.score.home > s.score.away) homeWins++;
    if (s.score.away > s.score.home) awayWins++;
    for (const e of s.log) {
      if (e.t === 'ability') bump(uses, e.name);
      if (e.t === 'decoy') bump(extra, 'decoy fooled someone');
      if (e.t === 'walled') bump(extra, `wall stopped a ${e.what}`);
      if (e.t === 'shot') bump(extra, `shots`);
    }
  }
  Object.assign(RULES, saved);
  const pct = (x: number) => `${((x / N) * 100).toFixed(1)}%`;
  console.log(`\n== ${label} (${N} matches)`);
  console.log(`0-0: ${pct(nil)}   goals/match: ${(goals / N).toFixed(2)}   Emberforge win ${pct(homeWins)}, Tidewell win ${pct(awayWins)}`);
  const per = (m: Map<string, number>) =>
    [...m.entries()].sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${(v / N).toFixed(2)}`).join(', ');
  if (uses.size) console.log(`ability uses per match: ${per(uses)}`);
  console.log(`per match: ${per(extra)}`);
}

run('Abilities off', false);
run('Abilities on (design doc: 8 ticks at Spark + 12 Overheat)', true);
for (const arg of process.argv.slice(3)) {
  const [cost, oh] = arg.split('/').map(Number);
  run(`Abilities on, ${cost} ticks + ${oh} Overheat`, true, () => {
    RULES.abilityCost = { 1: cost, 2: cost, 3: cost };
    RULES.overheatTicks = oh;
  });
}
