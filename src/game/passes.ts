// Suggested passes: instead of lighting every hex in range, the carrier gets a few good options, each with the hits
// it needs and the chance the dice give it.

import {
  distance,
  hexesWithin,
  inPitch,
  line,
  passRange,
  robotAt,
  RULES,
  sameHex,
  targetGoal,
  type Hex,
  type MatchState,
  type PassKind,
  type Robot,
} from '../engine';
import { step } from '../engine/hex';

export interface PassOption {
  to: Hex;
  kind: PassKind;
  /** Teammate standing on the target, or none for a pass into space. */
  receiver?: string;
  need: number;
  /** Chance (0 to 1) of rolling at least `need` hits. */
  chance: number;
  /** Opponents next to the landing hex (they will contest it). */
  marked: number;
  label: string;
}

/** Chance of at least `need` hits from `dice` d6 hitting on RULES.hitOn or better. */
export function hitChance(dice: number, need: number): number {
  const p = (7 - RULES.hitOn) / 6;
  let total = 0;
  for (let k = need; k <= dice; k++) total += choose(dice, k) * p ** k * (1 - p) ** (dice - k);
  return Math.min(1, need <= 0 ? 1 : total);
}

function choose(n: number, k: number): number {
  let c = 1;
  for (let i = 1; i <= k; i++) c = (c * (n - k + i)) / i;
  return c;
}

export function suggestPasses(s: MatchState, r: Robot, max = 4): PassOption[] {
  const range = passRange(r);
  const goal = targetGoal(r.team);
  const inRange = new Set(hexesWithin(r.pos, range).map((h) => `${h.col},${h.row}`));
  const opponents = s.robots.filter((o) => o.team !== r.team);
  const dice = Math.max(1, r.stats.control);

  const option = (to: Hex, receiver?: Robot): PassOption & { score: number } => {
    const d = distance(r.pos, to);
    const need = RULES.passBand(d);
    const lane = line(r.pos, to).slice(1);
    const cutOff = opponents.filter((o) => lane.some((h) => distance(h, o.pos) <= 1)).length;
    const kind: PassKind = cutOff ? 'lofted' : 'ground';
    const marked = opponents.filter((o) => distance(o.pos, to) <= 1).length;
    const chance = hitChance(dice, need);
    const gain = distance(r.pos, goal) - distance(to, goal);
    const name = receiver ? receiver.name.split(' ')[0] : 'space';
    return {
      to,
      kind,
      receiver: receiver?.id,
      need,
      chance,
      marked,
      label: receiver ? `To ${name}` : 'Into space',
      score: gain * 1.2 + chance * 4 - marked * 2.5 - (kind === 'lofted' ? 0.6 : 0),
    };
  };

  const mates = s.robots.filter(
    (t) => t.team === r.team && t.id !== r.id && t.role !== 'Keeper' && inRange.has(`${t.pos.col},${t.pos.row}`),
  );
  const options = mates.map((t) => option(t.pos, t));

  // One ball into space: two hexes ahead of the most advanced teammate, if it is free and unmarked.
  const east = goal.col > 6;
  const lead = [...mates].sort((a, b) => distance(a.pos, goal) - distance(b.pos, goal))[0];
  if (lead) {
    let h = lead.pos;
    for (let i = 0; i < 2; i++) {
      const n = step(h, east ? 'E' : 'W');
      if (inPitch(n)) h = n;
    }
    const free = !robotAt(s, h) && !opponents.some((o) => distance(o.pos, h) <= 1);
    const forward = distance(h, goal) < distance(r.pos, goal);
    if (free && forward && !sameHex(h, lead.pos) && inRange.has(`${h.col},${h.row}`)) {
      const o = option(h);
      o.label = `Into space for ${lead.name.split(' ')[0]}`;
      o.score += 0.5;
      options.push(o);
    }
  }

  return options
    .sort((a, b) => b.score - a.score)
    .slice(0, max)
    .map(({ score: _score, ...o }) => o);
}
