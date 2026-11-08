// A simple coach that plays legal, sensible football. It is the baseline
// opponent and lets whole matches run headless for tests and the simulator.
// It does not look ahead; a smarter AI comes in a later build step.

import { distance, type Hex } from './hex';
import {
  ballHolder,
  goalArea,
  inOwnGoalArea,
  ownGoal,
  passRange,
  robotAt,
  targetGoal,
} from './match';
import { createRng } from './rng';
import type { Action, Controller, Corner, MatchState, Robot } from './types';

const CORNERS: Corner[] = ['left', 'centre', 'right'];

function towards(r: Robot, legal: Action[], target: Hex): Action {
  const now = distance(r.pos, target);
  let best: Action | undefined;
  let bestDist = now;
  let bestCost = 0;
  for (const a of legal) {
    if (a.type !== 'move' && a.type !== 'sprint') continue;
    const d = distance(a.to, target);
    const cost = a.type === 'sprint' ? 2 : 1;
    // A sprint has to gain at least 2 more hexes than the best move to be worth it.
    if (d < bestDist - (cost > bestCost && best ? 1 : 0) || (d === bestDist && best && cost < bestCost)) {
      best = a;
      bestDist = d;
      bestCost = cost;
    }
  }
  return best ?? legal.find((a) => a.type === 'hold')!;
}

const find = <T extends Action['type']>(legal: Action[], type: T) =>
  legal.filter((a): a is Extract<Action, { type: T }> => a.type === type);

function closestOfTeam(s: MatchState, team: Robot['team'], to: Hex, skipKeeper = true): Robot | undefined {
  return s.robots
    .filter((r) => r.team === team && !(skipKeeper && r.role === 'Keeper'))
    .sort((a, b) => distance(a.pos, to) - distance(b.pos, to) || a.id.localeCompare(b.id))[0];
}

function withCarrier(s: MatchState, r: Robot, legal: Action[]): Action {
  const goal = targetGoal(r.team);
  const d = distance(r.pos, goal);
  const shoot = find(legal, 'shoot');
  if (d <= 5) return shoot.find((a) => a.kind === (d <= 3 ? 'placed' : 'driven'))!;

  const pressed = s.robots.some((o) => o.team !== r.team && distance(o.pos, r.pos) === 1);
  const options = s.robots
    .filter(
      (t) =>
        t.team === r.team &&
        t !== r &&
        t.role !== 'Keeper' &&
        distance(t.pos, goal) < d &&
        distance(t.pos, r.pos) <= passRange(r) &&
        !s.robots.some((o) => o.team !== r.team && distance(o.pos, t.pos) <= 1),
    )
    .sort((a, b) => distance(a.pos, goal) - distance(b.pos, goal));
  const passTo = (t: Robot) =>
    find(legal, 'pass').find((a) => a.kind === 'ground' && a.to.col === t.pos.col && a.to.row === t.pos.row)!;

  if (pressed && options.length) return passTo(options[0]);
  const move = towards(r, legal, goal);
  if (move.type !== 'hold') return move;
  if (options.length) return passTo(options[0]);
  return shoot.find((a) => a.kind === 'driven')!;
}

function keeperPlay(s: MatchState, r: Robot, legal: Action[]): Action {
  const tackle = find(legal, 'tackle')[0];
  if (tackle) return tackle;
  const ball = s.ball;
  if (ball.state === 'loose' && goalArea(r.team).some((h) => h.col === ball.at.col && h.row === ball.at.row)) {
    return towards(r, legal, ball.at);
  }
  if (!inOwnGoalArea(r)) return towards(r, legal, ownGoal(r.team));
  return legal.find((a) => a.type === 'hold')!;
}

export function createSimpleAI(seed: number): Controller {
  const rng = createRng(seed ^ 0x5eed);
  return {
    chooseAction(s, r, legal) {
      if (r.role === 'Keeper' && ballHolder(s) !== r) return keeperPlay(s, r, legal);
      const holder = ballHolder(s);
      if (holder === r) return withCarrier(s, r, legal);

      const intercept = find(legal, 'intercept')[0];
      if (intercept) return intercept;
      const tackle = find(legal, 'tackle')[0];
      if (tackle) return tackle;

      const ball = s.ball;
      if (ball.state === 'loose') {
        if (closestOfTeam(s, r.team, ball.at) === r) return towards(r, legal, ball.at);
        return distance(r.pos, ball.at) > 4 ? towards(r, legal, ball.at) : legal.find((a) => a.type === 'hold')!;
      }
      if (ball.state === 'flight') {
        const f = ball.flight;
        const spot = f.type === 'pass' ? f.to : ownGoal(r.team);
        if (f.type === 'pass' && closestOfTeam(s, r.team, spot) === r && !robotAt(s, spot)) return towards(r, legal, spot);
        return legal.find((a) => a.type === 'hold')!;
      }
      // Someone holds the ball.
      if (holder!.team === r.team) {
        const ahead = targetGoal(r.team).col > holder!.pos.col ? 3 : -3;
        const col = Math.max(0, Math.min(12, holder!.pos.col + ahead));
        return towards(r, legal, { col, row: r.pos.row });
      }
      const chasers = s.robots
        .filter((t) => t.team === r.team && t.role !== 'Keeper')
        .sort((a, b) => distance(a.pos, holder!.pos) - distance(b.pos, holder!.pos))
        .slice(0, 2);
      if (chasers.includes(r)) return towards(r, legal, holder!.pos);
      const own = ownGoal(r.team);
      return towards(r, legal, { col: Math.round((holder!.pos.col + own.col) / 2), row: holder!.pos.row });
    },
    chooseReaction: () => true,
    chooseCorner: () => CORNERS[Math.floor(rng.next() * 3)],
  };
}
