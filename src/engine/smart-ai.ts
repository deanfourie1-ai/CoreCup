// The smarter coach (Déan, 2026-11-19: "make the AI smarter, not stat boosts"). Same robots, same dice, same rules
// as the simple AI; it just thinks about the odds before it acts:
//
// - On the ball it weighs shooting, passing and running by their real dice odds: the chance a shot beats the
//   keeper and any blockers, the chance a pass is accurate and gets past interceptors, and the risk of being
//   challenged on a run. It shoots when the odds are good, not just when it is close.
// - Off the ball, attackers run into open space ahead of the carrier, spread across the rows, so there is
//   always a free pass on. Defenders press the carrier with one robot, cut the most dangerous pass with another,
//   and mark goal-side of the opponents nearest their goal.
// - It does not waste reactions it can't win (a Challenge it is likely to lose when it is needed elsewhere), and
//   it plays for time when it is ahead late on.

import { abilityChoice } from './ability-ai';
import { keeperPlay, towards } from './ai';
import { clampCol, distance, hexesWithin, inPitch, line, sameHex, type Hex } from './hex';
import {
  ballHolder,
  goalArea,
  inOwnGoalArea,
  keeperOf,
  ownGoal,
  passRange,
  robotAt,
  shotWallHex,
  targetGoal,
} from './match';
import { createRng } from './rng';
import { RULES } from './rules';
import type { Action, Controller, Corner, MatchState, Robot, ShotKind, TeamId } from './types';

const CORNERS: Corner[] = ['left', 'centre', 'right'];

/**
 * A pass or run only sets up a later shot, and the defence gets time to close it down, so its value is
 * discounted against shooting now. Tuned by simulation (tools/sim/balance.ts).
 */
export const SMART = { pass: 0.8, run: 0.8, hold: 0.6, pressers: 2 };

// ---------------------------------------------------------------------------
// Dice odds (every die hits on RULES.hitOn+ on a d6)

const P_HIT = () => (7 - RULES.hitOn) / 6;

/** Probability distribution of hits from n dice (at least 1 die, as the rules say). */
function hitsDist(n: number): number[] {
  n = Math.max(1, n);
  const p = P_HIT();
  let dist = [1];
  for (let i = 0; i < n; i++) {
    const next = new Array(dist.length + 1).fill(0);
    dist.forEach((q, k) => {
      next[k] += q * (1 - p);
      next[k + 1] += q * p;
    });
    dist = next;
  }
  return dist;
}

/** Sum of independent pools. */
function convolve(a: number[], b: number[]): number[] {
  const out = new Array(a.length + b.length - 1).fill(0);
  a.forEach((x, i) => b.forEach((y, j) => (out[i + j] += x * y)));
  return out;
}

/** P(attack hits > defence hits). */
function pBeats(attack: number[], defence: number[]): number {
  let p = 0;
  attack.forEach((x, i) => defence.forEach((y, j) => (p += i > j ? x * y : 0)));
  return p;
}

/** P(at least `need` hits from n dice). */
function pAtLeast(n: number, need: number): number {
  return hitsDist(n)
    .slice(need)
    .reduce((a, b) => a + b, 0);
}

const foesOf = (s: MatchState, team: TeamId) => s.robots.filter((o) => o.team !== team);
const mates = (s: MatchState, r: Robot) => s.robots.filter((t) => t.team === r.team && t.id !== r.id);
const nearestFoe = (s: MatchState, team: TeamId, h: Hex) =>
  Math.min(...foesOf(s, team).map((o) => distance(o.pos, h)));

// ---------------------------------------------------------------------------
// Shots

/** Chance a shot of this kind from `from` scores, given who stands where now. */
export function shotChance(s: MatchState, shooter: Robot, from: Hex, kind: ShotKind): number {
  const team = shooter.team;
  if (shotWallHex(s, team, from, kind)) return 0;
  const goal = targetGoal(team);
  const d = distance(from, goal);
  let dice = shooter.stats.power - Math.floor(d / RULES.shot.distancePenaltyPer);
  if (kind === 'placed') dice += RULES.shot.placedBonus;
  if (shooter.effect?.kind === 'flame') dice += shooter.effect.dice;
  const keeper = keeperOf(s, otherSide(team));
  const keeperIn = !!keeper && inOwnGoalArea(keeper);
  if (kind === 'chip' && !keeperIn) dice += RULES.shot.chipBonusKeeperOut;

  let defence = [1];
  if (kind !== 'chip') {
    const lane = line(from, goal).slice(1);
    for (const o of foesOf(s, team)) {
      if (o === keeper || !lane.some((h) => sameHex(h, o.pos))) continue;
      defence = convolve(defence, hitsDist(o.stats.reflex));
    }
  }
  if (keeper && keeperIn) {
    // The keeper Dives: right corner 1 in 3 (+2), wrong 2 in 3 (-1). Average the two.
    const right = convolve(defence, hitsDist(keeper.stats.reflex + RULES.shot.cornerGuessRight));
    const wrong = convolve(defence, hitsDist(keeper.stats.reflex + RULES.shot.cornerGuessWrong));
    const a = hitsDist(dice);
    return pBeats(a, right) / 3 + (pBeats(a, wrong) * 2) / 3;
  }
  return pBeats(hitsDist(dice), defence);
}

const otherSide = (t: TeamId): TeamId => (t === 'home' ? 'away' : 'home');

function bestShot(s: MatchState, r: Robot, from: Hex): { kind: ShotKind; p: number } {
  return (['driven', 'placed', 'chip'] as ShotKind[])
    .map((kind) => ({ kind, p: shotChance(s, r, from, kind) }))
    .sort((a, b) => b.p - a.p)[0];
}

/**
 * How good a hex is for the attacking team to have the ball on: the chance of scoring from there next turn,
 * plus a little for being further up the pitch (a platform for the next pass).
 */
function hexValue(s: MatchState, r: Robot, h: Hex): number {
  const ghost = { ...r, pos: h, effect: null };
  const shot = bestShot(s, ghost, h).p;
  const goalDist = distance(h, targetGoal(r.team));
  return shot + 0.004 * (12 - goalDist);
}

// ---------------------------------------------------------------------------
// On the ball

/** Chance of keeping the ball against one Challenge or tackle. */
function keepChance(r: Robot, foe: Robot): number {
  const take = hitsDist(foe.stats.power);
  const keep = hitsDist(r.stats.control);
  return 1 - pBeats(take, keep);
}

/** Chance a pass lands with a teammate: accurate enough, not cut out on the way, not lost at the landing. */
function passChance(s: MatchState, r: Robot, to: Hex, kind: 'ground' | 'lofted', receiver: Robot): number {
  const band = RULES.passBand(distance(r.pos, to));
  let p = pAtLeast(r.stats.control, band) + (1 - pAtLeast(r.stats.control, band)) * 0.35;
  if (kind === 'ground') {
    const path = line(r.pos, to).slice(1);
    const kicker = hitsDist(r.stats.control);
    for (const o of foesOf(s, r.team)) {
      if (!path.some((h) => distance(h, o.pos) <= 1)) continue;
      // The interceptor needs more hits than the kicker (a tie deflects it loose: count half).
      const iDist = hitsDist(o.stats.reflex);
      let steal = 0;
      kicker.forEach((x, k) => iDist.forEach((y, i) => (steal += i > k ? x * y : i === k ? x * y * 0.5 : 0)));
      p *= 1 - steal;
    }
  }
  // At the landing: opponents who are, or will be, next to the target hex contest it.
  const flight = kind === 'ground' ? RULES.flight.ground(distance(r.pos, to)) : RULES.flight.lofted(distance(r.pos, to));
  const contest = foesOf(s, r.team).filter((o) => distance(o.pos, to) <= 1 + (flight >= 3 ? 1 : 0));
  if (contest.length) {
    const ch = Math.max(...contest.map((o) => o.stats.power));
    p *= 1 - pBeats(hitsDist(ch), hitsDist(receiver.stats.control)) - 0.1;
  }
  return Math.max(0, p);
}

function withBall(s: MatchState, r: Robot, legal: Action[], timeMood: number): Action {
  const shots = legal.filter((a): a is Extract<Action, { type: 'shoot' }> => a.type === 'shoot');
  const best = bestShot(s, r, r.pos);
  const shootEv = best.p;
  const here = hexValue(s, r, r.pos);

  // Pass options: each outfield teammate in range, to its feet or one hex ahead of it into space.
  let bestPass: { a: Action; ev: number } | null = null;
  const goal = targetGoal(r.team);
  for (const t of mates(s, r)) {
    if (t.role === 'Keeper') continue;
    const spots = [t.pos, ...hexesWithin(t.pos, 1).filter((h) => distance(h, goal) < distance(t.pos, goal))];
    for (const to of spots) {
      if (!inPitch(to) || distance(r.pos, to) > passRange(r) || sameHex(to, r.pos)) continue;
      if (!sameHex(to, t.pos) && robotAt(s, to)) continue;
      for (const kind of ['ground', 'lofted'] as const) {
        const a = legal.find((l) => l.type === 'pass' && l.kind === kind && sameHex(l.to, to));
        if (!a) continue;
        const ev = passChance(s, r, to, kind, t) * hexValue(s, t, to) * SMART.pass;
        if (!bestPass || ev > bestPass.ev) bestPass = { a, ev };
      }
    }
  }

  // Runs: walks (and sprints for real gains), keeping clear of tacklers.
  let bestRun: { a: Action; ev: number } | null = null;
  for (const a of legal) {
    if (a.type !== 'move' && a.type !== 'sprint') continue;
    const path = line(r.pos, a.to).slice(1);
    let keep = 1;
    const seen = new Set<string>();
    for (const h of path) {
      for (const o of foesOf(s, r.team)) {
        if (seen.has(o.id) || distance(o.pos, h) !== 1) continue;
        seen.add(o.id);
        keep *= keepChance(r, o);
      }
    }
    // Ending next to an opponent invites a tackle on its turn.
    const after = foesOf(s, r.team).filter((o) => distance(o.pos, a.to) === 1);
    for (const o of after) keep *= 0.5 + 0.5 * keepChance(r, o);
    const ev = keep * hexValue(s, r, a.to) * (a.type === 'sprint' ? SMART.run - 0.03 : SMART.run);
    if (!bestRun || ev > bestRun.ev) bestRun = { a, ev };
  }

  // Under pressure, staying put is risky too.
  const pressure = foesOf(s, r.team).filter((o) => distance(o.pos, r.pos) === 1);
  let holdEv = here * (timeMood > 0 ? 1 : SMART.hold);
  for (const o of pressure) holdEv *= 0.5 + 0.5 * keepChance(r, o);

  // Behind late on: shoot more readily. Ahead late on: keep the ball.
  const shootWeight = timeMood < 0 ? 1.35 : timeMood > 0 ? 0.85 : 1;
  const options: { a: Action; ev: number }[] = [
    { a: shots.find((x) => x.kind === best.kind)!, ev: shootEv * shootWeight },
    ...(bestPass ? [bestPass] : []),
    ...(bestRun ? [bestRun] : []),
    { a: legal.find((x) => x.type === 'hold')!, ev: holdEv },
  ];
  options.sort((a, b) => b.ev - a.ev);
  return options[0].a;
}

// ---------------------------------------------------------------------------
// Off the ball

/** Free, sensible hex near `target` (the robot's own hex counts as free). */
function freeNear(s: MatchState, r: Robot, target: Hex): Hex {
  const t = { col: clampCol(target.col, target.row), row: Math.max(0, Math.min(8, target.row)) };
  const there = robotAt(s, t);
  if (!there || there === r) return t;
  return (
    hexesWithin(t, 1)
      .filter((h) => inPitch(h) && (!robotAt(s, h) || robotAt(s, h) === r))
      .sort((a, b) => distance(a, r.pos) - distance(b, r.pos))[0] ?? t
  );
}

/** Attacking support: open space ahead of the carrier, inside its pass range, one robot per lane. */
function supportSpot(s: MatchState, r: Robot, holder: Robot): Hex {
  const goal = targetGoal(r.team);
  const lanes = [2, 4, 6, 1, 7, 3, 5];
  const others = mates(s, r).filter((t) => t.role !== 'Keeper' && t !== holder);
  const order = [r, ...others].sort((a, b) => a.id.localeCompare(b.id));
  const lane = lanes[order.indexOf(r) % lanes.length];
  let best: Hex = r.pos;
  let bestScore = -Infinity;
  for (const h of hexesWithin(r.pos, r.stats.speed + 2)) {
    if (!inPitch(h) || (robotAt(s, h) && robotAt(s, h) !== r)) continue;
    const toCarrier = distance(h, holder.pos);
    if (toCarrier < 2 || toCarrier > passRange(holder)) continue;
    const ahead = distance(holder.pos, goal) - distance(h, goal);
    const space = Math.min(3, nearestFoe(s, r.team, h));
    const laneFit = -Math.abs(h.row - lane) * 0.6;
    // Pass lane clear of opponents.
    const clear = line(holder.pos, h)
      .slice(1)
      .every((p) => nearestFoe(s, r.team, p) > 1)
      ? 1.5
      : 0;
    const score = ahead * 0.8 + space * 1.2 + laneFit + clear - distance(h, r.pos) * 0.15 + (distance(h, goal) <= 5 ? 1 : 0);
    if (score > bestScore) {
      bestScore = score;
      best = h;
    }
  }
  return best;
}

/** Defending: one presses, one cuts the most dangerous pass, the rest mark goal-side. */
function defendSpot(s: MatchState, r: Robot, holder: Robot): Hex {
  const own = ownGoal(r.team);
  const team = s.robots.filter((t) => t.team === r.team && t.role !== 'Keeper');
  const byCarrier = [...team].sort(
    (a, b) => distance(a.pos, holder.pos) - distance(b.pos, holder.pos) || a.id.localeCompare(b.id),
  );
  // Press with one robot, or two once the carrier is in our half.
  const inOurHalf = distance(holder.pos, own) <= 6;
  if (byCarrier.slice(0, inOurHalf ? SMART.pressers : 1).includes(r)) return holder.pos;

  // Opponent targets, most dangerous first (nearest our goal).
  const threats = foesOf(s, r.team)
    .filter((o) => o !== holder && o.role !== 'Keeper')
    .sort((a, b) => distance(a.pos, own) - distance(b.pos, own));
  const markers = byCarrier.slice(inOurHalf ? SMART.pressers : 1);
  // Assign markers to threats greedily by distance.
  const taken = new Set<string>();
  const plan = new Map<string, Robot>();
  for (const m of [...markers].sort((a, b) => distance(a.pos, own) - distance(b.pos, own))) {
    const t = threats.filter((x) => !taken.has(x.id)).sort((a, b) => distance(a.pos, m.pos) - distance(b.pos, m.pos))[0];
    if (t) {
      taken.add(t.id);
      plan.set(m.id, t);
    }
  }
  const mark = plan.get(r.id);
  if (!mark) return { col: clampCol(Math.round((holder.pos.col + own.col) / 2), 4), row: 4 };
  // Stand on the line from the carrier to that robot when the carrier is close (cuts the pass); else goal-side.
  const lane = line(holder.pos, mark.pos).slice(1, -1);
  if (lane.length >= 1 && distance(holder.pos, mark.pos) <= passRange(holder)) {
    return lane[Math.floor(lane.length / 2)];
  }
  const goalSide = line(mark.pos, own)[1] ?? mark.pos;
  return goalSide;
}

// ---------------------------------------------------------------------------

/** +1 when ahead in the last 15 ticks, -1 when behind in the last 15, else 0. */
function timeMood(s: MatchState, team: TeamId): number {
  const left = RULES.matchLength - s.clock;
  if (s.half !== 2 || left > 15) return 0;
  const diff = s.score[team] - s.score[otherSide(team)];
  return diff > 0 ? 1 : diff < 0 ? -1 : 0;
}

export function createSmartAI(seed: number, opts: { abilities?: boolean } = {}): Controller {
  const rng = createRng(seed ^ 0x5a17);
  const useAbilities = opts.abilities ?? true;
  return {
    chooseAction(s, r, legal) {
      const ability = useAbilities ? abilityChoice(s, r, legal) : null;
      if (ability) return ability;
      legal = legal.filter((a) => a.type !== 'ability');
      const holder = ballHolder(s);
      if (holder?.id === r.id) return withBall(s, r, legal, timeMood(s, r.team));
      if (r.role === 'Keeper') return keeperPlay(s, r, legal);

      const intercept = legal.find((a) => a.type === 'intercept');
      if (intercept) return intercept;
      const tackle = legal.find((a) => a.type === 'tackle');
      if (tackle) return tackle;
      const hold = legal.find((a) => a.type === 'hold')!;

      const ball = s.ball;
      if (ball.state === 'loose') {
        // The two who get there first go (ticks count: a robot further down the track arrives later).
        const eta = (t: Robot) => t.tick + Math.ceil(distance(t.pos, ball.at) / t.stats.speed) * RULES.cost.move;
        const chasers = s.robots
          .filter((t) => t.team === r.team && t.role !== 'Keeper')
          .sort((a, b) => eta(a) - eta(b))
          .slice(0, 2);
        if (chasers.some((c) => c.id === r.id)) return towards(r, legal, ball.at);
        const foe = foesOf(s, r.team).sort((a, b) => eta(a) - eta(b))[0];
        return towards(r, legal, freeNear(s, r, line(ball.at, ownGoal(r.team))[2] ?? foe.pos));
      }
      if (ball.state === 'flight') {
        const f = ball.flight;
        if (f.type === 'shot') return hold;
        const spot = f.to;
        const near = s.robots
          .filter((t) => t.team === r.team && t.role !== 'Keeper')
          .sort((a, b) => distance(a.pos, spot) - distance(b.pos, spot))[0];
        if (near.id === r.id && distance(r.pos, spot) > 0) return towards(r, legal, spot);
        if (f.team !== r.team && distance(r.pos, spot) <= r.stats.speed + 1) return towards(r, legal, spot);
        return hold;
      }
      const h = holder!;
      const target = h.team === r.team ? supportSpot(s, r, h) : defendSpot(s, r, h);
      if (sameHex(target, r.pos)) return hold;
      return towards(r, legal, freeNear(s, r, target));
    },
    chooseReaction(s, r, kind) {
      if (kind === 'dive' || kind === 'intercept' || kind === 'block') return true;
      // Challenge: worth it when it has a fair chance of taking the ball, or the carrier is close to our goal.
      const holder = ballHolder(s);
      if (!holder) return true;
      const p = pBeats(hitsDist(r.stats.power), hitsDist(holder.stats.control));
      return p >= 0.25 || distance(holder.pos, ownGoal(r.team)) <= 5 || goalArea(r.team).some((g) => sameHex(g, holder.pos));
    },
    chooseCorner: () => CORNERS[Math.floor(rng.next() * 3)],
  };
}

