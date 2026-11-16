// When is a signature ability worth it? One rule of thumb per core. The simple AI uses this to play its abilities,
// and the match screen uses it so the autopilot hands a robot to the player at a good moment for its ability
// (instead of asking every turn). It never changes the rules; it only picks from the legal actions.

import { abilityN } from './abilities';
import { distance, line, type Hex } from './hex';
import {
  ballHolder,
  otherTeam,
  ownGoal,
  passRange,
  shotWallHex,
  targetGoal,
  undertowHex,
  wallAt,
} from './match';
import type { Action, MatchState, Robot } from './types';

type AbilityAction = Extract<Action, { type: 'ability' }>;

const foes = (s: MatchState, r: Robot) => s.robots.filter((o) => o.team !== r.team);
const foesWithin = (s: MatchState, r: Robot, h: Hex, d: number) => foes(s, r).filter((o) => distance(o.pos, h) <= d);

/** How much nearer the goal a hex is than the robot (positive = forward). */
const gain = (r: Robot, h: Hex) => distance(r.pos, targetGoal(r.team)) - distance(h, targetGoal(r.team));

/** The ability action worth playing now, or null. */
export function abilityChoice(s: MatchState, r: Robot, legal: Action[]): AbilityAction | null {
  const options = legal.filter((a): a is AbilityAction => a.type === 'ability');
  if (!options.length) return null;
  const holder = ballHolder(s);
  const goalDist = distance(r.pos, targetGoal(r.team));
  const pressed = foesWithin(s, r, r.pos, 1).length > 0;

  switch (r.core) {
    case 'Phoenix':
      // Charge the shot in range, when nobody can tackle during the charge.
      return goalDist <= 5 && foesWithin(s, r, r.pos, 1).length === 0 && !shotWallHex(s, r.team, r.pos, 'driven')
        ? options[0]
        : null;
    case 'Kitsune':
      // Under pressure on the ball: the decoy takes the first tackle or challenge.
      // One marker on her and nobody else close: the decoy takes that marker's tackle and she is free.
      return foesWithin(s, r, r.pos, 1).length === 1 && foesWithin(s, r, r.pos, 2).length === 1 ? options[0] : null;
    case 'Golem':
    case 'Black Tortoise': {
      // An opponent on the ball near our goal, and no wall up yet.
      if (!holder || holder.team === r.team) return null;
      const near = r.core === 'Golem' ? 5 : 4;
      if (distance(holder.pos, ownGoal(r.team)) > near) return null;
      if (r.core === 'Black Tortoise' && distance(r.pos, ownGoal(r.team)) > 1) return null;
      return options[0];
    }
    case 'Qilin': {
      // Opponent on the ball close by, with a teammate inside the aura who may need to react.
      if (!holder || holder.team === r.team || distance(holder.pos, r.pos) > 3) return null;
      const range = abilityN(r.core, 'range', r.tier);
      const covered = s.robots.filter((q) => q.team === r.team && q !== r && distance(q.pos, r.pos) <= range);
      return covered.length ? options[0] : null;
    }
    case 'Kraken':
      return options[0];
    case 'Kelpie': {
      // Pull the carrier next to a teammate who can tackle it soon.
      if (!holder || holder.team === r.team) return null;
      const a = options.find((o) => o.target === holder.id);
      if (!a) return null;
      const to = undertowHex(s, r, holder, abilityN(r.core, 'pull', r.tier));
      const tackler = to && s.robots.some((q) => q.team === r.team && q !== r && distance(q.pos, to) === 1);
      return tackler ? a : null;
    }
    case 'Anansi': {
      // A pass forward to a free teammate that an opponent could cut out.
      if (!pressed) return null;
      const best = s.robots
        .filter((t) => t.team === r.team && t !== r && t.role !== 'Keeper')
        .filter((t) => distance(t.pos, r.pos) <= passRange(r) && gain(r, t.pos) > 0)
        .filter((t) => foesWithin(s, r, t.pos, 1).length === 0)
        .filter((t) => {
          const path = line(r.pos, t.pos).slice(1);
          return foes(s, r).some((o) => path.some((h) => distance(h, o.pos) <= 1));
        })
        .filter((t) => !line(r.pos, t.pos).some((h) => wallAt(s, otherTeam(r.team), h)))
        .sort((a, b) => gain(r, b.pos) - gain(r, a.pos))[0];
      return best ? (options.find((o) => o.to && o.to.col === best.pos.col && o.to.row === best.pos.row) ?? null) : null;
    }
    case 'Fenrir': {
      // Break away when pressed, if the dash gains real ground.
      if (!pressed || goalDist <= 3) return null;
      const best = options.filter((o) => o.to).sort((a, b) => gain(r, b.to!) - gain(r, a.to!))[0];
      return best && gain(r, best.to!) >= 3 ? best : null;
    }
    case 'Minotaur': {
      if (holder !== r || !pressed || goalDist <= 3) return null;
      const best = options.filter((o) => o.to).sort((a, b) => gain(r, b.to!) - gain(r, a.to!))[0];
      return best && gain(r, best.to!) >= 3 ? best : null;
    }
  }
  return null;
}
