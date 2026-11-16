// Team-shape autopilot: the pacing playtest found that 60% of a coach's choices were off-ball robots shuffling into
// position. Those turns now play themselves: off-ball robots hold a team shape around the ball, and the keeper stays
// home. Anything that matters still comes to the player: the ball carrier, a tackle or interception on offer, a race
// for a loose ball or a pass, and any robot the player has taken over.

import {
  abilityChoice,
  ballHolder,
  clampCol,
  distance,
  keeperPlay,
  lastCol,
  targetGoal,
  towards,
  type Action,
  type Hex,
  type MatchState,
  type Robot,
} from '../engine';

/** Where play is: the ball's hex, its landing hex, or the goal it is flying at. */
export function ballSpot(s: MatchState): Hex {
  const b = s.ball;
  if (b.state === 'held') return ballHolder(s)!.pos;
  if (b.state === 'loose') return b.at;
  return b.flight.type === 'pass' ? b.flight.to : targetGoal(b.flight.team);
}

/**
 * True when this turn needs the player (same split as the pacing playtest's "meaningful" choices):
 * on the ball, a tackle or interception on offer, or close enough to race for a loose ball or a pass.
 */
export function needsPlayer(s: MatchState, r: Robot, legal: Action[]): boolean {
  if (ballHolder(s)?.id === r.id) return true;
  if (legal.some((a) => a.type === 'tackle' || a.type === 'intercept')) return true;
  // A good moment for the robot's signature ability (Stone Wall, Guardian Aura...): the player decides, not the autopilot.
  if (abilityChoice(s, r, legal)) return true;
  if (r.role === 'Keeper') return false;
  const racing = s.ball.state === 'loose' || (s.ball.state === 'flight' && s.ball.flight.type === 'pass');
  return racing && distance(r.pos, ballSpot(s)) <= r.stats.speed + 3;
}

/** Column measured from the robot's own goal line (0) towards the goal it attacks, turned into a real hex. */
function spot(r: Robot, depth: number, row: number): Hex {
  const east = targetGoal(r.team).col > 6;
  const d = Math.max(1, Math.min(lastCol(row) - 1, Math.round(depth)));
  return { col: clampCol(east ? d : lastCol(row) - d, row), row };
}

/** The hex a robot's place in the team shape asks for right now. */
export function shapeSpot(s: MatchState, r: Robot): Hex {
  const team = s.robots.filter((x) => x.team === r.team && x.role !== 'Keeper');
  const slot = team.findIndex((x) => x.id === r.id); // squad order: Defender, Midfielder, Midfielder, Striker
  const ball = ballSpot(s);
  const east = targetGoal(r.team).col > 6;
  const depth = east ? ball.col : lastCol(ball.row) - ball.col;
  const holder = ballHolder(s);
  const attacking = holder?.team === r.team || (s.ball.state === 'flight' && s.ball.flight.team === r.team);
  const ballRow = Math.max(2, Math.min(6, ball.row));

  if (attacking) {
    switch (slot) {
      case 0:
        return spot(r, Math.max(2, depth - 4), 4);
      case 1:
        return spot(r, depth + 1, 2);
      case 2:
        return spot(r, depth + 1, 6);
      default:
        // Striker: high, on the far side of the ball to stretch the defence.
        return spot(r, Math.min(11, depth + 3), ball.row <= 4 ? 5 : 3);
    }
  }
  // Out of possession: the robot nearest the carrier presses; the rest sit goal-side of the ball.
  if (holder && holder.team !== r.team) {
    const presser = [...team].sort(
      (a, b) => distance(a.pos, holder.pos) - distance(b.pos, holder.pos) || a.id.localeCompare(b.id),
    )[0];
    if (presser.id === r.id) return holder.pos;
  }
  switch (slot) {
    case 0:
      return spot(r, Math.max(1, depth - 2), ballRow);
    case 1:
      return spot(r, Math.max(2, depth - 1), 2);
    case 2:
      return spot(r, Math.max(2, depth - 1), 6);
    default:
      return spot(r, Math.max(5, depth + 1), 4);
  }
}

/**
 * The autopilot's action for a robot, or null when the player should choose. Moves only walk (no sprints), so the
 * shape costs the same ticks as a Wait and never burns a robot's timeline.
 */
export function autopilotAction(s: MatchState, r: Robot, legal: Action[]): Action | null {
  if (needsPlayer(s, r, legal)) return null;
  const wait = legal.find((a) => a.type === 'hold')!;
  if (r.role === 'Keeper') return keeperPlay(s, r, legal.filter((a) => a.type !== 'ability'));
  const target = shapeSpot(s, r);
  if (distance(r.pos, target) <= 1) return wait;
  return towards(
    r,
    legal.filter((a) => a.type !== 'sprint' && a.type !== 'ability'),
    target,
  );
}
