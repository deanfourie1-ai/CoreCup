// The match engine. It knows the rules and nothing about the screen.
//
// `step` advances the match by exactly one event: either the next robot on the
// timeline takes an action, or a ball in flight lands. Coaches (a person, the
// AI, a test script or the rules simulator) answer every choice through the
// `Controller` interface, so the engine runs headless.

import { abilityN, abilityOf } from './abilities';
import { countHits, poolSize, rollPool } from './dice';
import {
  DIRECTIONS,
  distance,
  hexKey,
  hexesWithin,
  inPitch,
  lastCol,
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
  AbilityEffect,
  Action,
  Controllers,
  Corner,
  Flight,
  MatchState,
  PassFlight,
  ReactionKind,
  RollMod,
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
  return { col: attacksEast(team) ? lastCol(4) : 0, row: 4 };
}

/** Centre hex of the goal a team defends. */
export function ownGoal(team: TeamId): Hex {
  return targetGoal(otherTeam(team));
}

/** The three goal-line hexes a team defends: Left, Centre, Right from the keeper's view. */
export function goalLine(team: TeamId): Hex[] {
  const east = !attacksEast(team);
  return [3, 4, 5].map((row) => ({ col: east ? lastCol(row) : 0, row }));
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

/**
 * Can this robot react right now, timeline-wise? An overheated robot cannot, except that a keeper may still Dive
 * (design doc, "Keepers and Overheat").
 */
export function inReactionWindow(r: Robot, clock: number, kind?: ReactionKind): boolean {
  if (isOverheated(r) && kind !== 'dive') return false;
  return r.tick <= clock + RULES.reactionWindowBase + r.stats.reflex;
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

/** The kick-off taker while it still has its first action to take. */
function kickoffTaker(s: MatchState): Robot | undefined {
  return s.kickoff && !s.kickoff.acted ? robotById(s, s.kickoff.taker) : undefined;
}

/** Is kick-off protection still on (the taker has not moved, passed or shot yet)? */
export function kickoffProtected(s: MatchState): boolean {
  return !!s.kickoff && s.ball.state === 'held' && s.ball.by === s.kickoff.taker;
}

/** Picks who acts at the lowest tick. Mutates the tie flip when it decides. */
function nextRobot(s: MatchState, tick: number): Robot {
  const taker = kickoffTaker(s);
  if (taker) return taker;
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
  // Kick-off: the taker acts first, now, whatever the track says.
  if (kickoffTaker(s)) return { kind: 'robot', tick: s.clock };
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
    if (f.type === 'pass' && f.kind === 'ground' && !f.web && f.team !== r.team && touchesPath(r.pos, f.path)) {
      out.push({ type: 'intercept', robot: r.id });
    }
  }
  out.push(...abilityActions(s, r));
  out.push({ type: 'hold', robot: r.id });
  if (kickoffProtected(s) && holder && holder.team !== r.team) return out.filter((a) => respectsKickoff(r, holder, a));
  return out;
}

/** Kick-off protection: an opponent may not tackle, step into the kicking team's half, or come within 2 hexes. */
function respectsKickoff(r: Robot, holder: Robot, a: Action): boolean {
  if (a.type === 'tackle' || a.type === 'ability') return false;
  if (a.type !== 'move' && a.type !== 'sprint') return true;
  const half = Math.floor(lastCol(a.to.row) / 2);
  const ownHalf = attacksEast(r.team) ? a.to.col <= half : a.to.col >= lastCol(a.to.row) - half;
  return ownHalf && distance(a.to, holder.pos) >= 2;
}

function touchesPath(pos: Hex, path: Hex[]): boolean {
  return path.some((h) => distance(h, pos) <= 1);
}

const actionKey = (a: Action) => JSON.stringify(a);

// ---------------------------------------------------------------------------
// Dice and possession

const STAT_WORDS: Record<keyof Robot['stats'], string> = {
  speed: 'Speed',
  power: 'Power',
  control: 'Control',
  reflex: 'Reflex',
};

/**
 * Rolls a robot's dice pool and logs it with everything the dice moment on screen shows: the stat it came from,
 * each modifier, and the hits needed when the target is fixed.
 */
function roll(
  ctx: Ctx,
  r: Robot,
  stat: keyof Robot['stats'] | { dice: number; label: string },
  purpose: string,
  mods: RollMod[] = [],
  need?: number,
): number {
  const base = typeof stat === 'string' ? r.stats[stat] : stat.dice;
  const baseLabel = typeof stat === 'string' ? STAT_WORDS[stat] : stat.label;
  const all = [...mods];
  if (r.role === 'Keeper' && !inOwnGoalArea(r)) all.push({ label: 'Outside goal area', value: RULES.keeperOutsideAreaPenalty });
  if (REACTION_ROLLS.has(purpose) && inAura(ctx.s, r)) all.push({ label: 'Guardian Aura', value: 1 });
  const shown = all.filter((m) => m.value !== 0);
  const total = shown.reduce((n, m) => n + m.value, 0);
  const result = rollPool(ctx.rng, poolSize(base, total));
  ctx.s.log.push({
    t: 'roll',
    robot: r.id,
    purpose,
    dice: result.dice,
    hits: countHits(result.dice),
    base,
    baseLabel,
    mods: shown,
    ...(need !== undefined ? { need } : {}),
  });
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

/**
 * Offers a reaction to the robot's coach; on yes, pays its ticks. `against` is the robot it reacts to: if that
 * robot has a Fox Mirage decoy up, the reaction goes to the decoy and comes to nothing (returns false).
 */
function offerReaction(ctx: Ctx, r: Robot, kind: ReactionKind, against?: Robot): boolean {
  if (!inReactionWindow(r, ctx.s.clock, kind)) return false;
  if (!ctx.ctl[r.team].chooseReaction(ctx.s, r, kind)) return false;
  r.tick += RULES.cost[kind];
  ctx.s.log.push({ t: 'reaction', tick: ctx.s.clock, robot: r.id, kind });
  if (against && kind !== 'dive' && fooledByDecoy(ctx, r, against)) return false;
  return true;
}

// ---------------------------------------------------------------------------
// Actions

function perform(ctx: Ctx, a: Action): void {
  const { s } = ctx;
  const r = robotById(s, a.robot);
  if (s.kickoff && s.kickoff.taker === r.id) {
    s.kickoff.acted = true;
    // Protection ends once the taker moves, passes or shoots.
    if (a.type !== 'hold') s.kickoff = null;
  }
  s.log.push({ t: 'action', tick: s.clock, action: a });
  // A lasting effect runs until the robot's next action ends (design doc, "Costs and timing").
  const before = r.effect;
  doAction(ctx, r, a);
  if (before && r.effect === before) r.effect = null;
}

function doAction(ctx: Ctx, r: Robot, a: Action): void {
  const { s } = ctx;
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
      if (fooledByDecoy(ctx, r, target)) return;
      const won = roll(ctx, r, 'power', 'tackle');
      const kept = roll(ctx, target, 'control', 'keep ball');
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
    case 'ability':
      return performAbility(ctx, r, a);
  }
}

/**
 * Moves a robot hex by hex, picking up loose balls and facing Challenges. `noChallenges` (Unchained Dash) skips
 * them; `skip` lists robots that cannot challenge (knocked aside by a Labyrinth Charge).
 */
function walk(ctx: Ctx, r: Robot, path: Hex[], opts: { noChallenges?: boolean; skip?: string[] } = {}): void {
  const { s } = ctx;
  const offered = new Set<string>(opts.skip ?? []);
  for (const h of path) {
    r.pos = h;
    if (s.ball.state === 'loose' && sameHex(s.ball.at, h)) setHeld(ctx, r);
    if (ballHolder(s) !== r || opts.noChallenges) continue;
    const challengers = s.robots.filter(
      (o) => o.team !== r.team && distance(o.pos, h) === 1 && !offered.has(o.id),
    );
    for (const o of challengers) {
      offered.add(o.id);
      if (!offerReaction(ctx, o, 'challenge', r)) continue;
      const take = roll(ctx, o, 'power', 'challenge');
      const keep = roll(ctx, r, 'control', 'keep ball');
      if (take > keep) {
        r.tick += RULES.lostBallDelay;
        return setHeld(ctx, o);
      }
      if (take === keep && RULES.tackleTie === 'loose') return setLoose(ctx, scatter(ctx, h, 1, o.team));
    }
  }
}

function kickPass(
  ctx: Ctx,
  r: Robot,
  target: Hex,
  kind: PassFlight['kind'],
  web?: { dice: number },
): void {
  const { s } = ctx;
  const band = RULES.passBand(distance(r.pos, target));
  const mods = web?.dice ? [{ label: 'Web Pass', value: web.dice }] : [];
  const hits = roll(ctx, r, 'control', 'pass', mods, band);
  const missing = Math.max(0, band - hits);
  let to = scatter(ctx, target, missing, r.team);
  let path = line(r.pos, to).slice(1);
  // A ground pass that runs into a wall stops there (a lofted pass flies over).
  if (kind === 'ground') {
    const stop = path.findIndex((h) => wallAt(s, otherTeam(r.team), h));
    if (stop >= 0) {
      to = path[stop];
      path = path.slice(0, stop + 1);
      s.log.push({ t: 'walled', by: wallAt(s, otherTeam(r.team), to)!.id, at: to, what: 'pass' });
    }
  }
  const flight: PassFlight = {
    type: 'pass',
    kind,
    team: r.team,
    kicker: r.id,
    kickerHits: hits,
    from: r.pos,
    to,
    path,
    landTick: s.clock + RULES.flight[kind](distance(r.pos, to)),
    ...(web ? { web: true } : {}),
  };
  s.ball = { state: 'flight', flight };
  if (kind !== 'ground' || web) return;
  // Interceptions at the kick, nearest to the passer first.
  const offered = new Set<string>();
  for (const h of flight.path) {
    for (const o of s.robots) {
      if (o.team === r.team || offered.has(o.id) || distance(o.pos, h) > 1) continue;
      offered.add(o.id);
      if (offerReaction(ctx, o, 'intercept', r) && interceptRoll(ctx, o, flight) !== 'miss') return;
    }
  }
}

function interceptRoll(ctx: Ctx, r: Robot, f: PassFlight): 'steal' | 'deflect' | 'miss' {
  const hits = roll(ctx, r, 'reflex', 'intercept', [], f.kickerHits + 1);
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
  const diceMods: RollMod[] = [
    { label: 'Distance', value: -Math.floor(d / RULES.shot.distancePenaltyPer) },
    { label: 'Placed shot', value: kind === 'placed' ? RULES.shot.placedBonus : 0 },
    { label: 'Flame Shot', value: r.effect?.kind === 'flame' ? r.effect.dice : 0 },
  ].filter((m) => m.value !== 0);
  const dice = r.stats.power + diceMods.reduce((n, m) => n + m.value, 0);
  s.ball = {
    state: 'flight',
    flight: {
      type: 'shot',
      kind,
      team: r.team,
      kicker: r.id,
      from: r.pos,
      dice,
      diceMods,
      landTick: s.clock + RULES.flight[kind],
    },
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
  const rec = roll(ctx, receiver, 'control', 'receive');
  const ch = roll(ctx, challenger, 'power', 'contest');
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

  // 0. A wall on the shot's line stops a driven or placed shot dead; a chip goes over it.
  const wallHex = shotWallHex(s, f.team, f.from, f.kind);
  if (wallHex) {
    s.log.push({ t: 'walled', by: wallAt(s, defending, wallHex)!.id, at: wallHex, what: 'shot' });
    return setLoose(ctx, wallHex);
  }

  // 1. Blocks, declared at landing by robots standing on the shot's line.
  const blockers: Robot[] = [];
  if (f.kind !== 'chip') {
    const lane = line(f.from, goal).slice(1);
    for (const o of s.robots) {
      if (o.team !== defending || o === keeper) continue;
      if (lane.some((h) => sameHex(h, o.pos)) && offerReaction(ctx, o, 'block', shooter)) blockers.push(o);
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
    const h = roll(ctx, b, 'reflex', 'block');
    blockHits += h;
    blockHitsBy.set(b.id, h);
  }
  const chipBonus = f.kind === 'chip' && !keeperIn ? RULES.shot.chipBonusKeeperOut : 0;
  const shotMods: RollMod[] = f.diceMods
    ? [...f.diceMods]
    : [{ label: 'Shot', value: f.dice - shooter.stats.power }];
  if (chipBonus) shotMods.push({ label: 'Chip, keeper off the line', value: chipBonus });
  const shotHits = roll(ctx, shooter, 'power', 'shot', shotMods);
  let keeperHits = 0;
  if (dive) {
    const guess = keeperCorner === corner ? RULES.shot.cornerGuessRight : RULES.shot.cornerGuessWrong;
    keeperHits = roll(ctx, keeper!, 'reflex', 'dive', [
      { label: keeperCorner === corner ? 'Guessed the corner' : 'Wrong corner', value: guess },
    ]);
  } else if (keeperIn) {
    keeperHits = roll(ctx, keeper!, { dice: RULES.shot.keeperPositioningDice, label: 'Positioning' }, 'positioning');
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
// Signature abilities
//
// Numbers come from abilities.ts. An ability never rolls to trigger (design doc, Dice); one that includes a tackle
// or pass uses that normal roll. Every ability costs RULES.abilityCost[tier] ticks instead of the action it
// includes, then the robot overheats for RULES.overheatTicks: no ability and no reactions (a keeper may still Dive).

const REACTION_ROLLS = new Set(['intercept', 'challenge', 'block', 'dive']);

/** Is this robot covered by a teammate's Guardian Aura? */
function inAura(s: MatchState, r: Robot): boolean {
  return s.robots.some(
    (q) =>
      q.team === r.team &&
      q.effect?.kind === 'aura' &&
      (q !== r ? distance(q.pos, r.pos) <= q.effect.range : q.effect.self),
  );
}

/** The robot of `team` whose wall covers hex `h`, if any. */
export function wallAt(s: MatchState, team: TeamId, h: Hex): Robot | undefined {
  return s.robots.find((q) => q.team === team && q.effect?.kind === 'wall' && q.effect.hexes.some((w) => sameHex(w, h)));
}

/** The first hex of the defending team's wall on a shot's line, if the shot is one a wall stops (not a chip). */
export function shotWallHex(s: MatchState, shooting: TeamId, from: Hex, kind: ShotFlight['kind']): Hex | undefined {
  if (kind === 'chip') return undefined;
  const defending = otherTeam(shooting);
  return line(from, targetGoal(shooting))
    .slice(1)
    .find((h) => wallAt(s, defending, h));
}

/**
 * Fox Mirage: a reaction or tackle aimed at a robot with a decoy up goes to the decoy instead. The fooled robot
 * has already paid its ticks; it runs onto the decoy hex if that is free and gets nothing.
 */
function fooledByDecoy(ctx: Ctx, r: Robot, target: Robot): boolean {
  const e = target.effect;
  if (e?.kind !== 'decoy' || e.charges <= 0 || r.team === target.team) return false;
  e.charges -= 1;
  if (!robotAt(ctx.s, e.hex)) {
    r.pos = e.hex;
    if (ctx.s.ball.state === 'loose' && sameHex(ctx.s.ball.at, e.hex)) setHeld(ctx, r);
  }
  ctx.s.log.push({ t: 'decoy', robot: r.id, owner: target.id, at: e.hex });
  if (e.charges <= 0) target.effect = null;
  return true;
}

/** Where Fox Mirage puts its decoys: free hexes 2 steps away, towards the goal she attacks and away from opponents. */
export function decoyHexes(s: MatchState, r: Robot, count: number): Hex[] {
  const goal = targetGoal(r.team);
  const nearestFoe = (h: Hex) =>
    Math.min(...s.robots.filter((o) => o.team !== r.team).map((o) => distance(o.pos, h)));
  return hexesWithin(r.pos, 2)
    .filter((h) => distance(h, r.pos) === 2 && !robotAt(s, h))
    .sort(
      (a, b) =>
        distance(a, goal) - distance(b, goal) - (nearestFoe(a) - nearestFoe(b)) * 0.5 ||
        a.row - b.row ||
        a.col - b.col,
    )
    .slice(0, count);
}

/** Stone Wall: a line of hexes one step out from the goal line, centred on the goal mouth. */
export function stoneWallHexes(team: TeamId, size: number): Hex[] {
  const out = attacksEast(team) ? 'E' : 'W';
  const rows = [4, 3, 5, 2, 6].slice(0, size);
  return rows
    .map((row) => stepHex({ col: attacksEast(team) ? 0 : lastCol(row), row }, out))
    .sort((a, b) => a.row - b.row);
}

/** Shell Guard: the Tortoise's own hex plus the adjacent hexes nearest the ball. */
export function shellGuardHexes(s: MatchState, r: Robot, extra: number): Hex[] {
  const ball = ballSpotOf(s);
  const goal = ownGoal(r.team);
  const side = neighbours(r.pos)
    .filter((h) => distance(h, goal) <= distance(r.pos, goal) + 1)
    .sort((a, b) => distance(a, ball) - distance(b, ball) || a.row - b.row || a.col - b.col)
    .slice(0, extra);
  return [r.pos, ...side];
}

function ballSpotOf(s: MatchState): Hex {
  const b = s.ball;
  if (b.state === 'held') return robotById(s, b.by).pos;
  if (b.state === 'loose') return b.at;
  return b.flight.type === 'pass' ? b.flight.to : targetGoal(b.flight.team);
}

/** Undertow: the free hex next to the target that is nearest the Kelpie, `steps` times. */
export function undertowHex(s: MatchState, kelpie: Robot, target: Robot, steps: number): Hex | undefined {
  let at = target.pos;
  for (let i = 0; i < steps; i++) {
    const next = neighbours(at)
      .filter((h) => !robotAt(s, h) && distance(h, kelpie.pos) < distance(at, kelpie.pos) && !sameHex(h, kelpie.pos))
      .sort((a, b) => distance(a, kelpie.pos) - distance(b, kelpie.pos) || a.row - b.row || a.col - b.col)[0];
    if (!next) break;
    at = next;
  }
  return sameHex(at, target.pos) ? undefined : at;
}

/**
 * Labyrinth Charge lines: for each of the 6 directions, the hexes the Minotaur can run in a straight line. The first
 * `knocks` robots in the way are knocked aside onto a free hex off the line; the next one stops the run.
 */
export function chargeLines(s: MatchState, r: Robot, length: number, knocks: number) {
  const out: { path: Hex[]; knocked: { id: string; to: Hex }[] }[] = [];
  for (const dir of DIRECTIONS) {
    const path: Hex[] = [];
    const knocked: { id: string; to: Hex }[] = [];
    let h = r.pos;
    for (let i = 0; i < length; i++) {
      const n = stepHex(h, dir);
      if (!inPitch(n)) break;
      const there = robotAt(s, n);
      if (there) {
        if (knocked.length >= knocks) break;
        const aside = neighbours(n).find(
          (x) =>
            !robotAt(s, x) &&
            !sameHex(x, r.pos) &&
            !knocked.some((k) => sameHex(k.to, x)) &&
            !sameHex(x, stepHex(n, dir)) &&
            !path.some((p) => sameHex(p, x)),
        );
        if (!aside) break;
        knocked.push({ id: there.id, to: aside });
      }
      path.push(n);
      h = n;
    }
    if (path.length) out.push({ path, knocked });
  }
  return out;
}

/** The ability actions a robot has right now (none while overheated or with abilities switched off). */
function abilityActions(s: MatchState, r: Robot): Action[] {
  const def = abilityOf(r.core);
  if (!RULES.abilities || !def || isOverheated(r)) return [];
  const n = (k: string) => abilityN(r.core, k, r.tier);
  const holder = ballHolder(s);
  const mine = holder === r;
  const id = r.id;
  switch (r.core) {
    case 'Phoenix':
    case 'Kitsune':
      return mine && r.effect === null ? [{ type: 'ability', robot: id }] : [];
    case 'Golem':
    case 'Black Tortoise':
      return r.effect?.kind === 'wall' ? [] : [{ type: 'ability', robot: id }];
    case 'Qilin':
      return r.effect?.kind === 'aura' ? [] : [{ type: 'ability', robot: id }];
    case 'Kraken': {
      if (!holder || holder.team === r.team) return [];
      const d = distance(holder.pos, r.pos);
      return d >= 2 && d <= n('reach') ? [{ type: 'ability', robot: id, target: holder.id }] : [];
    }
    case 'Kelpie':
      return s.robots
        .filter((o) => o.team !== r.team)
        .filter((o) => {
          const d = distance(o.pos, r.pos);
          return d >= 2 && d <= n('reach') && undertowHex(s, r, o, n('pull'));
        })
        .map((o) => ({ type: 'ability', robot: id, target: o.id }));
    case 'Anansi':
      if (!mine) return [];
      return hexesWithin(r.pos, passRange(r))
        .filter((h) => !sameHex(h, r.pos))
        .map((h) => ({ type: 'ability', robot: id, to: h }));
    case 'Fenrir': {
      if (!mine) return [];
      const out: Action[] = [];
      for (const [k, path] of reachable(s, r, r.stats.speed + n('extra'))) {
        if (k !== hexKey(r.pos)) out.push({ type: 'ability', robot: id, to: path[path.length - 1] });
      }
      return out;
    }
    case 'Minotaur':
      return chargeLines(s, r, r.stats.speed + n('extra'), n('knocks')).flatMap((l) =>
        l.path.map((h) => ({ type: 'ability' as const, robot: id, to: h })),
      );
  }
  return [];
}

function performAbility(ctx: Ctx, r: Robot, a: Extract<Action, { type: 'ability' }>): void {
  const { s } = ctx;
  const def = abilityOf(r.core)!;
  const n = (k: string) => abilityN(r.core, k, r.tier);
  r.tick += RULES.abilityCost[r.tier];
  r.overheatUntil = r.tick + RULES.overheatTicks;
  const event: Extract<MatchState['log'][number], { t: 'ability' }> = {
    t: 'ability',
    tick: s.clock,
    robot: r.id,
    core: r.core,
    name: def.name,
    tier: r.tier,
    ...(a.target ? { target: a.target } : {}),
  };
  s.log.push(event);
  const lasting = (e: AbilityEffect) => {
    r.effect = e;
  };
  switch (r.core) {
    case 'Phoenix':
      return lasting({ kind: 'flame', dice: n('dice') });
    case 'Kitsune': {
      // The decoy that draws the reaction. (Ascended's second decoy and swap are not built yet.)
      const [hex] = decoyHexes(s, r, 1);
      if (!hex) return;
      event.hexes = [hex];
      return lasting({ kind: 'decoy', hex, charges: n('decoys') });
    }
    case 'Golem': {
      const hexes = stoneWallHexes(r.team, n('size'));
      event.hexes = hexes;
      return lasting({ kind: 'wall', hexes });
    }
    case 'Black Tortoise': {
      const hexes = shellGuardHexes(s, r, n('extra'));
      event.hexes = hexes;
      return lasting({ kind: 'wall', hexes });
    }
    case 'Qilin':
      return lasting({ kind: 'aura', range: n('range'), self: n('self') > 0 });
    case 'Kraken': {
      // Tentacle Grab: a normal tackle roll from range; the ball comes back to the Kraken.
      const target = robotById(s, a.target!);
      if (fooledByDecoy(ctx, r, target)) return;
      const won = roll(ctx, r, 'power', 'tackle');
      const kept = roll(ctx, target, 'control', 'keep ball');
      if (won > kept) {
        setHeld(ctx, r);
        target.tick += RULES.lostBallDelay;
      }
      return;
    }
    case 'Kelpie': {
      const target = robotById(s, a.target!);
      const to = undertowHex(s, r, target, n('pull'))!;
      s.log.push({ t: 'shoved', robot: target.id, by: r.id, from: target.pos, to });
      target.pos = to;
      if (s.ball.state === 'loose' && sameHex(s.ball.at, to)) setHeld(ctx, target);
      return;
    }
    case 'Anansi':
      return kickPass(ctx, r, a.to!, 'ground', { dice: n('dice') });
    case 'Fenrir': {
      const path = reachable(s, r, r.stats.speed + n('extra')).get(hexKey(a.to!))!;
      event.path = path.slice(1);
      return walk(ctx, r, path.slice(1), { noChallenges: true });
    }
    case 'Minotaur': {
      const lineFor = chargeLines(s, r, r.stats.speed + n('extra'), n('knocks')).find((l) =>
        l.path.some((h) => sameHex(h, a.to!)),
      )!;
      const path = lineFor.path.slice(0, lineFor.path.findIndex((h) => sameHex(h, a.to!)) + 1);
      const knocked = lineFor.knocked.filter((k) => path.some((h) => sameHex(h, robotById(s, k.id).pos)));
      for (const k of knocked) {
        const o = robotById(s, k.id);
        s.log.push({ t: 'shoved', robot: o.id, by: r.id, from: o.pos, to: k.to });
        o.pos = k.to;
        if (s.ball.state === 'loose' && sameHex(s.ball.at, k.to)) setHeld(ctx, o);
      }
      event.path = path;
      return walk(ctx, r, path, { skip: knocked.map((k) => k.id) });
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
        // A fresh half: every ability is available again, so it pays to use one before the break.
        for (const r of s.robots) r.overheatUntil = null;
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
