// The match engine. It knows the rules and nothing about the screen.
//
// `step` advances the match by exactly one event: either the next robot on the
// timeline takes an action, or a ball in flight lands. Coaches (a person, the
// AI, a test script or the rules simulator) answer every choice through the
// `Controller` interface, so the engine runs headless.

import { countHits, poolSize, rollPool } from './dice';
import {
  distance,
  hexKey,
  hexesWithin,
  inPitch,
  line,
  neighbours,
  sameHex,
  scatterDirection,
  step as stepHex,
  type Hex,
} from './hex';
import { createRng, type Rng } from './rng';
import { RULES } from './rules';
import { createMatch, resetForKickoff, type MatchOptions } from './setup';
import type {
  Action,
  Controllers,
  Corner,
  Flight,
  MatchState,
  PassFlight,
  ReactionKind,
  Robot,
  ShotFlight,
  ShotOutcome,
  TeamId,
} from './types';

interface Ctx {
  s: MatchState;
  rng: Rng;
  ctl: Controllers;
}

// ---------------------------------------------------------------------------
// Board helpers

export const otherTeam = (t: TeamId): TeamId => (t === 'home' ? 'away' : 'home');
export const attacksEast = (t: TeamId): boolean => t === 'home';

/** Centre hex of the goal a team is shooting at. */
export function targetGoal(team: TeamId): Hex {
  return { col: attacksEast(team) ? 12 : 0, row: 4 };
}

/** Centre hex of the goal a team defends. */
export function ownGoal(team: TeamId): Hex {
  return targetGoal(otherTeam(team));
}

/** The three goal-line hexes a team defends: Left, Centre, Right from the keeper's view. */
export function goalLine(team: TeamId): Hex[] {
  const col = ownGoal(team).col;
  return [3, 4, 5].map((row) => ({ col, row }));
}

/** The goal-line hexes plus every hex touching them. */
export function goalArea(team: TeamId): Hex[] {
  const seen = new Map<string, Hex>();
  for (const g of goalLine(team)) {
    seen.set(hexKey(g), g);
    for (const n of neighbours(g)) seen.set(hexKey(n), n);
  }
  return [...seen.values()];
}

export function inOwnGoalArea(robot: Robot): boolean {
  return goalArea(robot.team).some((h) => sameHex(h, robot.pos));
}

export function robotById(s: MatchState, id: string): Robot {
  const r = s.robots.find((x) => x.id === id);
  if (!r) throw new Error(`No robot ${id}`);
  return r;
}

export function robotAt(s: MatchState, h: Hex): Robot | undefined {
  return s.robots.find((r) => sameHex(r.pos, h));
}

export function ballHolder(s: MatchState): Robot | undefined {
  return s.ball.state === 'held' ? robotById(s, s.ball.by) : undefined;
}

export function keeperOf(s: MatchState, team: TeamId): Robot | undefined {
  return s.robots.find((r) => r.team === team && r.role === 'Keeper');
}

export function isOverheated(r: Robot): boolean {
  return r.overheatUntil !== null && r.tick < r.overheatUntil;
}

/** Can this robot react right now, timeline-wise? */
export function inReactionWindow(r: Robot, clock: number): boolean {
  return !isOverheated(r) && r.tick <= clock + RULES.reactionWindowBase + r.stats.reflex;
}

export function passRange(r: Robot): number {
  return RULES.passRangeBase + r.stats.control;
}

/** Every free hex a robot can reach in up to `steps` moves, with the path to it. */
export function reachable(s: MatchState, r: Robot, steps: number): Map<string, Hex[]> {
  const paths = new Map<string, Hex[]>([[hexKey(r.pos), [r.pos]]]);
  let frontier = [r.pos];
  for (let i = 0; i < steps; i++) {
    const next: Hex[] = [];
    for (const h of frontier) {
      for (const n of neighbours(h)) {
        const k = hexKey(n);
        if (paths.has(k) || robotAt(s, n)) continue;
        paths.set(k, [...paths.get(hexKey(h))!, n]);
        next.push(n);
      }
    }
    frontier = next;
  }
  return paths;
}

// ---------------------------------------------------------------------------
// Turn order

/** Picks who acts at the lowest tick. Mutates the tie flip when it decides. */
function nextRobot(s: MatchState, tick: number): Robot {
  let best = s.robots.filter((r) => r.tick === tick);
  const topSpeed = Math.max(...best.map((r) => r.stats.speed));
  best = best.filter((r) => r.stats.speed === topSpeed);
  const holder = ballHolder(s);
  if (best.length > 1 && holder && best.includes(holder)) return holder;
  if (new Set(best.map((r) => r.team)).size > 1) {
    const winner = s.tieFlip;
    s.tieFlip = otherTeam(winner);
    best = best.filter((r) => r.team === winner);
  }
  // Two robots on the same team: their coach would choose; we take squad order.
  return best.sort((a, b) => a.id.localeCompare(b.id))[0];
}

/** What happens next, without changing anything. */
export function peekNext(
  s: MatchState,
): { kind: 'robot'; tick: number } | { kind: 'landing'; tick: number } | { kind: 'whistle' } | { kind: 'over' } {
  if (s.over) return { kind: 'over' };
  const minTick = Math.min(...s.robots.map((r) => r.tick));
  const boundary = s.half === 1 ? RULES.halfLength : RULES.matchLength;
  if (s.ball.state === 'flight') {
    const f = s.ball.flight;
    if (f.landTick <= minTick || minTick >= boundary) return { kind: 'landing', tick: f.landTick };
  }
  if (minTick >= boundary) return { kind: 'whistle' };
  return { kind: 'robot', tick: minTick };
}

/** The robot whose turn it is, or undefined if a landing or whistle comes first. */
export function activeRobot(s: MatchState): Robot | undefined {
  const next = peekNext(s);
  if (next.kind !== 'robot') return undefined;
  return nextRobot(structuredClone(s), next.tick);
}

// ---------------------------------------------------------------------------
// Legal actions

export function legalActions(s: MatchState, robotId: string): Action[] {
  const r = robotById(s, robotId);
  const out: Action[] = [];
  const walk = reachable(s, r, r.stats.speed);
  for (const [k, path] of walk) if (k !== hexKey(r.pos)) out.push({ type: 'move', robot: r.id, to: path[path.length - 1] });
  for (const [k, path] of reachable(s, r, r.stats.speed + RULES.sprintExtraHexes)) {
    if (!walk.has(k)) out.push({ type: 'sprint', robot: r.id, to: path[path.length - 1] });
  }
  const holder = ballHolder(s);
  if (holder === r) {
    for (const h of hexesWithin(r.pos, passRange(r))) {
      if (sameHex(h, r.pos)) continue;
      out.push({ type: 'pass', robot: r.id, to: h, kind: 'ground' });
      out.push({ type: 'pass', robot: r.id, to: h, kind: 'lofted' });
    }
    for (const kind of ['driven', 'placed', 'chip'] as const) out.push({ type: 'shoot', robot: r.id, kind });
  }
  if (holder && holder.team !== r.team && distance(holder.pos, r.pos) === 1) {
    out.push({ type: 'tackle', robot: r.id, target: holder.id });
  }
  if (s.ball.state === 'flight') {
    const f = s.ball.flight;
    if (f.type === 'pass' && f.kind === 'ground' && f.team !== r.team && touchesPath(r.pos, f.path)) {
      out.push({ type: 'intercept', robot: r.id });
    }
  }
  out.push({ type: 'hold', robot: r.id });
  return out;
}

function touchesPath(pos: Hex, path: Hex[]): boolean {
  return path.some((h) => distance(h, pos) <= 1);
}

const actionKey = (a: Action) => JSON.stringify(a);

// ---------------------------------------------------------------------------
// Dice and possession

function roll(ctx: Ctx, r: Robot, base: number, purpose: string, mods = 0): number {
  const penalty = r.role === 'Keeper' && !inOwnGoalArea(r) ? RULES.keeperOutsideAreaPenalty : 0;
  const result = rollPool(ctx.rng, poolSize(base, mods + penalty));
  ctx.s.log.push({ t: 'roll', robot: r.id, purpose, dice: result.dice, hits: countHits(result.dice) });
  return result.hits;
}

function setHeld(ctx: Ctx, r: Robot): void {
  ctx.s.ball = { state: 'held', by: r.id };
  ctx.s.log.push({ t: 'possession', robot: r.id, at: r.pos });
}

/** Drops the ball on a hex. A robot already standing there gets it. */
function setLoose(ctx: Ctx, h: Hex): void {
  const there = robotAt(ctx.s, h);
  if (there) return setHeld(ctx, there);
  ctx.s.ball = { state: 'loose', at: h };
  ctx.s.log.push({ t: 'possession', robot: null, at: h });
}

/** Moves a hex `times` steps in random directions (d6), staying on the pitch. */
function scatter(ctx: Ctx, from: Hex, times: number, team: TeamId): Hex {
  let h = from;
  for (let i = 0; i < times; i++) {
    const n = stepHex(h, scatterDirection(ctx.rng.die(6), attacksEast(team)));
    if (inPitch(n)) h = n;
  }
  return h;
}

/** Offers a reaction to the robot's coach; on yes, pays its ticks. */
function offerReaction(ctx: Ctx, r: Robot, kind: ReactionKind): boolean {
  if (!inReactionWindow(r, ctx.s.clock)) return false;
  if (!ctx.ctl[r.team].chooseReaction(ctx.s, r, kind)) return false;
  r.tick += RULES.cost[kind];
  ctx.s.log.push({ t: 'reaction', tick: ctx.s.clock, robot: r.id, kind });
  return true;
}

// ---------------------------------------------------------------------------
// Actions

function perform(ctx: Ctx, a: Action): void {
  const { s } = ctx;
  const r = robotById(s, a.robot);
  s.log.push({ t: 'action', tick: s.clock, action: a });
  switch (a.type) {
    case 'move':
    case 'sprint': {
      r.tick += RULES.cost[a.type];
      const steps = r.stats.speed + (a.type === 'sprint' ? RULES.sprintExtraHexes : 0);
      const path = reachable(s, r, steps).get(hexKey(a.to))!;
      walk(ctx, r, path.slice(1));
      return;
    }
    case 'pass':
      r.tick += RULES.cost.pass;
      return kickPass(ctx, r, a.to, a.kind);
    case 'shoot':
      r.tick += RULES.cost.shoot;
      return kickShot(ctx, r, a.kind);
    case 'tackle': {
      r.tick += RULES.cost.tackle;
      const target = robotById(s, a.target);
      const won = roll(ctx, r, r.stats.power, 'tackle');
      const kept = roll(ctx, target, target.stats.control, 'keep ball');
      if (won > kept) {
        setHeld(ctx, r);
        target.tick += RULES.lostBallDelay;
      } else if (won === kept && RULES.tackleTie === 'loose') {
        setLoose(ctx, scatter(ctx, target.pos, 1, r.team));
      }
      return;
    }
    case 'intercept': {
      r.tick += RULES.cost.intercept;
      const f = (s.ball as { flight: PassFlight }).flight;
      interceptRoll(ctx, r, f);
      return;
    }
    case 'hold':
      r.tick += RULES.cost.hold;
      return;
  }
}

/** Moves a robot hex by hex, picking up loose balls and facing Challenges. */
function walk(ctx: Ctx, r: Robot, path: Hex[]): void {
  const { s } = ctx;
  const offered = new Set<string>();
  for (const h of path) {
    r.pos = h;
    if (s.ball.state === 'loose' && sameHex(s.ball.at, h)) setHeld(ctx, r);
    if (ballHolder(s) !== r) continue;
    const challengers = s.robots.filter(
      (o) => o.team !== r.team && distance(o.pos, h) === 1 && !offered.has(o.id),
    );
    for (const o of challengers) {
      offered.add(o.id);
      if (!offerReaction(ctx, o, 'challenge')) continue;
      const take = roll(ctx, o, o.stats.power, 'challenge');
      const keep = roll(ctx, r, r.stats.control, 'keep ball');
      if (take > keep) {
        r.tick += RULES.lostBallDelay;
        return setHeld(ctx, o);
      }
      if (take === keep && RULES.tackleTie === 'loose') return setLoose(ctx, scatter(ctx, h, 1, o.team));
    }
  }
}

function kickPass(ctx: Ctx, r: Robot, target: Hex, kind: PassFlight['kind']): void {
  const { s } = ctx;
  const hits = roll(ctx, r, r.stats.control, 'pass');
  const missing = Math.max(0, RULES.passBand(distance(r.pos, target)) - hits);
  const to = scatter(ctx, target, missing, r.team);
  const flightDistance = distance(r.pos, to);
  const flight: PassFlight = {
    type: 'pass',
    kind,
    team: r.team,
    kicker: r.id,
    kickerHits: hits,
    from: r.pos,
    to,
    path: line(r.pos, to).slice(1),
    landTick: s.clock + RULES.flight[kind](flightDistance),
  };
  s.ball = { state: 'flight', flight };
  if (kind !== 'ground') return;
  // Interceptions at the kick, nearest to the passer first.
  const offered = new Set<string>();
  for (const h of flight.path) {
    for (const o of s.robots) {
      if (o.team === r.team || offered.has(o.id) || distance(o.pos, h) > 1) continue;
      offered.add(o.id);
      if (offerReaction(ctx, o, 'intercept') && interceptRoll(ctx, o, flight) !== 'miss') return;
    }
  }
}

function interceptRoll(ctx: Ctx, r: Robot, f: PassFlight): 'steal' | 'deflect' | 'miss' {
  const hits = roll(ctx, r, r.stats.reflex, 'intercept');
  if (hits > f.kickerHits) {
    setHeld(ctx, r);
    return 'steal';
  }
  if (hits === f.kickerHits) {
    setLoose(ctx, scatter(ctx, r.pos, 1, r.team));
    return 'deflect';
  }
  return 'miss';
}

function kickShot(ctx: Ctx, r: Robot, kind: ShotFlight['kind']): void {
  const { s } = ctx;
  const d = distance(r.pos, targetGoal(r.team));
  const dice =
    r.stats.power - Math.floor(d / RULES.shot.distancePenaltyPer) + (kind === 'placed' ? RULES.shot.placedBonus : 0);
  s.ball = {
    state: 'flight',
    flight: { type: 'shot', kind, team: r.team, kicker: r.id, from: r.pos, dice, landTick: s.clock + RULES.flight[kind] },
  };
}

// ---------------------------------------------------------------------------
// Landings

function land(ctx: Ctx, f: Flight): void {
  if (f.type === 'pass') landPass(ctx, f);
  else shotMoment(ctx, f);
}

function landPass(ctx: Ctx, f: PassFlight): void {
  const { s } = ctx;
  const zone = [f.to, ...neighbours(f.to)];
  const near = s.robots.filter((r) => zone.some((h) => sameHex(h, r.pos)));
  const order = (a: Robot, b: Robot) =>
    distance(a.pos, f.to) - distance(b.pos, f.to) || a.tick - b.tick || a.id.localeCompare(b.id);
  const mine = near.filter((r) => r.team === f.team).sort(order);
  const theirs = near.filter((r) => r.team !== f.team).sort(order);
  if (!mine.length && !theirs.length) return setLoose(ctx, f.to);
  if (!theirs.length) return setHeld(ctx, mine[0]);
  if (!mine.length) return setHeld(ctx, theirs[0]);
  const receiver = mine[0];
  const challenger = theirs[0];
  const rec = roll(ctx, receiver, receiver.stats.control, 'receive');
  const ch = roll(ctx, challenger, challenger.stats.power, 'contest');
  if (rec > ch) setHeld(ctx, receiver);
  else if (ch > rec) setHeld(ctx, challenger);
  else setLoose(ctx, scatter(ctx, f.to, 1, f.team));
}

export function shotOutcome(margin: number): ShotOutcome {
  if (margin >= 1) return 'goal';
  if (margin === 0) return 'post';
  if (margin === -1) return 'cleared';
  return 'save';
}

function shotMoment(ctx: Ctx, f: ShotFlight): void {
  const { s, ctl } = ctx;
  const shooter = robotById(s, f.kicker);
  const defending = otherTeam(f.team);
  const keeper = keeperOf(s, defending);
  const goal = targetGoal(f.team);

  // 1. Blocks, declared at landing by robots standing on the shot's line.
  const blockers: Robot[] = [];
  if (f.kind !== 'chip') {
    const lane = line(f.from, goal).slice(1);
    for (const o of s.robots) {
      if (o.team !== defending || o === keeper) continue;
      if (lane.some((h) => sameHex(h, o.pos)) && offerReaction(ctx, o, 'block')) blockers.push(o);
    }
  }

  // 2. The keeper: positioning dice inside the goal area, or a Dive.
  const keeperIn = !!keeper && inOwnGoalArea(keeper);
  const dive = keeperIn && offerReaction(ctx, keeper!, 'dive');

  // 3. Corner picks, locked in together.
  const corner: Corner = ctl[f.team].chooseCorner(s, shooter, 'shooter');
  const keeperCorner: Corner | null = dive ? ctl[defending].chooseCorner(s, keeper!, 'keeper') : null;

  // 4. Roll: blocks, then the shot, then the keeper.
  let blockHits = 0;
  const blockHitsBy = new Map<string, number>();
  for (const b of blockers) {
    const h = roll(ctx, b, b.stats.reflex, 'block');
    blockHits += h;
    blockHitsBy.set(b.id, h);
  }
  const chipBonus = f.kind === 'chip' && !keeperIn ? RULES.shot.chipBonusKeeperOut : 0;
  const shotHits = roll(ctx, shooter, f.dice, 'shot', chipBonus);
  let keeperHits = 0;
  if (dive) {
    const guess = keeperCorner === corner ? RULES.shot.cornerGuessRight : RULES.shot.cornerGuessWrong;
    keeperHits = roll(ctx, keeper!, keeper!.stats.reflex, 'dive', guess);
  } else if (keeperIn) {
    keeperHits = roll(ctx, keeper!, RULES.shot.keeperPositioningDice, 'positioning');
  }

  const margin = shotHits - (blockHits + keeperHits);
  const outcome = shotOutcome(margin);
  s.log.push({
    t: 'shot',
    shooter: shooter.id,
    outcome,
    margin,
    shotHits,
    defenceHits: blockHits + keeperHits,
    corner,
    keeperCorner,
  });

  switch (outcome) {
    case 'goal':
      s.score[f.team] += 1;
      s.log.push({ t: 'goal', team: f.team, score: { ...s.score } });
      resetForKickoff(s, defending);
      return;
    case 'post': {
      const free = goalArea(defending).filter((h) => !robotAt(s, h));
      const spot = free.length ? free[Math.floor(ctx.rng.next() * free.length)] : goal;
      return setLoose(ctx, spot);
    }
    case 'cleared': {
      const out = attacksEast(defending) ? 'E' : 'W';
      let h = goal;
      for (let i = 0; i < RULES.shot.clearDistance; i++) h = stepHex(h, out);
      return setLoose(ctx, scatter(ctx, h, 1, defending));
    }
    case 'save': {
      if (keeper && keeperHits > 0) return setHeld(ctx, keeper);
      const best = [...blockHitsBy.entries()].sort((a, b) => b[1] - a[1])[0];
      return setHeld(ctx, robotById(s, best[0]));
    }
  }
}

// ---------------------------------------------------------------------------
// Public API

/**
 * Advances the match by one event and returns the new state. The input state
 * is not changed. Pass `rng` only in tests that need scripted dice.
 */
export function step(state: MatchState, controllers: Controllers, rng?: Rng): MatchState {
  const s = structuredClone(state);
  const ctx: Ctx = { s, rng: rng ?? createRng(s.rngState), ctl: controllers };
  const next = peekNext(s);
  switch (next.kind) {
    case 'over':
      return s;
    case 'landing': {
      const f = (s.ball as { flight: Flight }).flight;
      s.clock = Math.max(s.clock, f.landTick);
      land(ctx, f);
      break;
    }
    case 'whistle':
      if (s.half === 1) {
        s.half = 2;
        s.clock = RULES.halfLength;
        s.log.push({ t: 'halftime' });
        resetForKickoff(s, otherTeam(s.firstKickoff));
      } else {
        s.over = true;
        s.clock = RULES.matchLength;
        s.log.push({ t: 'fulltime', score: { ...s.score } });
      }
      break;
    case 'robot': {
      s.clock = next.tick;
      const r = nextRobot(s, next.tick);
      const legal = legalActions(s, r.id);
      const action = controllers[r.team].chooseAction(s, r, legal);
      if (!legal.some((a) => actionKey(a) === actionKey(action))) {
        throw new Error(`Illegal action for ${r.id}: ${actionKey(action)}`);
      }
      perform(ctx, action);
      break;
    }
  }
  s.rngState = ctx.rng.state();
  return s;
}

/** Plays a whole match headless. Used by tests and the rules simulator. */
export function playMatch(options: MatchOptions, controllers: Controllers, maxEvents = 20000): MatchState {
  let s = createMatch(options);
  for (let i = 0; i < maxEvents && !s.over; i++) s = step(s, controllers);
  if (!s.over) throw new Error('Match did not finish');
  return s;
}
