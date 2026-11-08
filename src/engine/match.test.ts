import { describe, expect, it } from 'vitest';
import { createSimpleAI } from './ai';
import type { Hex } from './hex';
import { activeRobot, ballHolder, legalActions, playMatch, robotById, shotOutcome, step } from './match';
import type { Rng } from './rng';
import { RULES } from './rules';
import { createMatch } from './setup';
import type { Action, Controller, Controllers, Corner, MatchState, ReactionKind } from './types';

// --- helpers ---------------------------------------------------------------

/** Dice that come out in the order given. */
function dice(...values: number[]): Rng {
  const queue = [...values];
  return {
    die: () => {
      const v = queue.shift();
      if (v === undefined) throw new Error('Ran out of scripted dice');
      return v;
    },
    next: () => 0.5,
    state: () => 1,
  };
}

function coach(opts: {
  actions?: Action[];
  react?: boolean | ((kind: ReactionKind) => boolean);
  corner?: Corner;
}): Controller {
  const queue = [...(opts.actions ?? [])];
  return {
    chooseAction: (_s, r, legal) => queue.shift() ?? legal.find((a) => a.type === 'hold' && a.robot === r.id)!,
    chooseReaction: (_s, _r, kind) =>
      typeof opts.react === 'function' ? opts.react(kind) : (opts.react ?? false),
    chooseCorner: () => opts.corner ?? 'centre',
  };
}

const hex = (col: number, row: number): Hex => ({ col, row });

/** A match with every robot parked out of the way at tick 29. */
function arena(): MatchState {
  const s = createMatch({ seed: 1 });
  s.robots.forEach((r, i) => {
    r.tick = 29;
    r.pos = r.team === 'home' ? hex(i, 0) : hex(12 - (i - 5), 8);
  });
  s.ball = { state: 'loose', at: hex(6, 8) };
  return s;
}

function place(s: MatchState, id: string, at: Hex, tick: number) {
  const r = robotById(s, id);
  r.pos = at;
  r.tick = tick;
  return r;
}

const both = (home: Controller, away: Controller): Controllers => ({ home, away });
const idle = coach({});

// Squad order: 0 Keeper, 1 Defender, 2 Midfielder, 3 Midfielder, 4 Striker.

// --- setup and turn order --------------------------------------------------

describe('kick-off', () => {
  it('starts with 10 robots and the home striker holding the ball', () => {
    const s = createMatch({ seed: 1 });
    expect(s.robots).toHaveLength(10);
    expect(ballHolder(s)?.id).toBe('home-4');
    expect(ballHolder(s)?.pos).toEqual(hex(6, 4));
  });
});

describe('timeline turn order', () => {
  it('lets the robot furthest back act first', () => {
    const s = arena();
    place(s, 'home-2', hex(3, 4), 5);
    place(s, 'away-2', hex(9, 4), 2);
    expect(activeRobot(s)?.id).toBe('away-2');
  });

  it('breaks ties by Speed, then the ball carrier, then the tie flip', () => {
    const s = arena();
    place(s, 'home-2', hex(3, 4), 0);
    place(s, 'away-2', hex(9, 4), 0);
    robotById(s, 'home-2').stats.speed = 4;
    expect(activeRobot(s)?.id).toBe('home-2');

    robotById(s, 'home-2').stats.speed = 3;
    s.ball = { state: 'held', by: 'away-2' };
    expect(activeRobot(s)?.id).toBe('away-2');

    s.ball = { state: 'loose', at: hex(6, 8) };
    const first = activeRobot(s)!.team;
    expect(first).toBe(s.tieFlip);
    const after = step(s, both(idle, idle));
    expect(after.tieFlip).not.toBe(first);
  });

  it('charges each action its tick cost', () => {
    const s = arena();
    place(s, 'home-2', hex(3, 4), 0);
    const moved = step(s, both(coach({ actions: [{ type: 'move', robot: 'home-2', to: hex(5, 4) }] }), idle));
    expect(robotById(moved, 'home-2').tick).toBe(2);
    expect(robotById(moved, 'home-2').pos).toEqual(hex(5, 4));
  });
});

// --- the ball on the timeline ----------------------------------------------

describe('passing with the ball on the timeline', () => {
  function passer() {
    const s = arena();
    place(s, 'home-2', hex(3, 4), 0); // Control 4
    s.ball = { state: 'held', by: 'home-2' };
    place(s, 'home-3', hex(7, 4), 29);
    return s;
  }
  const pass = (kind: 'ground' | 'lofted' = 'ground'): Action => ({ type: 'pass', robot: 'home-2', to: hex(7, 4), kind });

  it('puts the ball in flight and lands it at a future tick', () => {
    let s = passer();
    s = step(s, both(coach({ actions: [pass()] }), idle), dice(6, 6, 1, 1));
    expect(s.ball.state).toBe('flight');
    if (s.ball.state !== 'flight') return;
    expect(s.ball.flight.landTick).toBe(2); // 4 hexes, 1 tick per 2
    expect(robotById(s, 'home-2').tick).toBe(3);
    s = step(s, both(idle, idle), dice());
    expect(ballHolder(s)?.id).toBe('home-3');
  });

  it('flies a lofted pass for longer', () => {
    const s = step(passer(), both(coach({ actions: [pass('lofted')] }), idle), dice(6, 6, 1, 1));
    expect(s.ball.state === 'flight' && s.ball.flight.landTick).toBe(3); // 2 + 4/3
  });

  it('scatters an inaccurate pass 1 hex per missing hit', () => {
    const s = step(passer(), both(coach({ actions: [pass()] }), idle), dice(1, 1, 1, 1, 1, 1));
    // 0 hits against a band of 2: two scatter dice, each 1 = towards the target goal (East).
    expect(s.ball.state === 'flight' && s.ball.flight.type === 'pass' && s.ball.flight.to).toEqual(hex(9, 4));
  });

  it('lets an opponent near the path intercept at the kick', () => {
    const s0 = passer();
    place(s0, 'away-1', hex(5, 5), 2);
    const s = step(s0, both(coach({ actions: [pass()] }), coach({ react: true })), dice(6, 6, 1, 1, 6, 6, 6));
    expect(ballHolder(s)?.id).toBe('away-1');
    expect(robotById(s, 'away-1').tick).toBe(4);
  });

  it('cannot intercept a lofted pass', () => {
    const s0 = passer();
    place(s0, 'away-1', hex(5, 5), 2);
    const s = step(s0, both(coach({ actions: [pass('lofted')] }), coach({ react: true })), dice(6, 6, 1, 1));
    expect(s.ball.state).toBe('flight');
  });

  it('lets robots act while the ball is in the air, then contests the landing', () => {
    let s = passer();
    place(s, 'away-1', hex(7, 6), 1);
    const away = coach({ actions: [{ type: 'move', robot: 'away-1', to: hex(7, 5) }] });
    s = step(s, both(coach({ actions: [pass()] }), away), dice(6, 6, 1, 1));
    s = step(s, both(idle, away), dice()); // away-1 runs in before the ball lands
    expect(robotById(s, 'away-1').pos).toEqual(hex(7, 5));
    // Receiver's Control (4 dice) vs challenger's Power (3 dice).
    s = step(s, both(idle, away), dice(6, 1, 1, 1, 6, 6, 1));
    expect(ballHolder(s)?.id).toBe('away-1');
  });

  it('offers an Intercept action to a robot that reaches the path in time', () => {
    const s = passer();
    place(s, 'away-1', hex(5, 5), 1);
    const flying = step(s, both(coach({ actions: [pass()] }), idle), dice(6, 6, 1, 1));
    expect(legalActions(flying, 'away-1').some((a) => a.type === 'intercept')).toBe(true);
  });
});

// --- tackles, challenges and reactions ---------------------------------------

describe('tackles and challenges', () => {
  function duel(tackler: number) {
    const s = arena();
    place(s, 'home-4', hex(6, 4), 5);
    s.ball = { state: 'held', by: 'home-4' };
    place(s, 'away-1', hex(7, 4), tackler);
    return s;
  }
  const tackle: Action = { type: 'tackle', robot: 'away-1', target: 'home-4' };

  it('wins the ball with more Power hits than the carrier has Control hits', () => {
    const s = step(duel(0), both(idle, coach({ actions: [tackle] })), dice(6, 6, 1, 6, 1, 1));
    expect(ballHolder(s)?.id).toBe('away-1');
    expect(robotById(s, 'away-1').tick).toBe(3);
  });

  it('pushes the robot that lost the ball 2 ticks down the track', () => {
    const s = step(duel(0), both(idle, coach({ actions: [tackle] })), dice(6, 6, 1, 6, 1, 1));
    expect(robotById(s, 'home-4').tick).toBe(7);
  });

  it('leaves the ball with the carrier on a tie', () => {
    const s = step(duel(0), both(idle, coach({ actions: [tackle] })), dice(6, 1, 1, 6, 1, 1));
    expect(ballHolder(s)?.id).toBe('home-4');
  });

  it('can knock the ball loose on a tie when that rule is switched on', () => {
    RULES.tackleTie = 'loose';
    try {
      // Scatter die 1 for Away points West.
      const s = step(duel(0), both(idle, coach({ actions: [tackle] })), dice(6, 1, 1, 6, 1, 1, 1));
      expect(s.ball).toEqual({ state: 'loose', at: hex(5, 4) });
    } finally {
      RULES.tackleTie = 'carrier';
    }
  });

  it('lets a nearby defender Challenge a carrier mid-move', () => {
    const s0 = arena();
    place(s0, 'home-4', hex(4, 4), 0);
    s0.ball = { state: 'held', by: 'home-4' };
    place(s0, 'away-1', hex(6, 3), 1);
    const run: Action = { type: 'move', robot: 'home-4', to: hex(6, 4) };
    const s = step(s0, both(coach({ actions: [run] }), coach({ react: true })), dice(6, 6, 6, 1, 1, 1));
    expect(ballHolder(s)?.id).toBe('away-1');
    expect(robotById(s, 'away-1').tick).toBe(3);
  });

  it('does not let a robot react once it is too far down the track', () => {
    const s0 = arena();
    place(s0, 'home-4', hex(4, 4), 0);
    s0.ball = { state: 'held', by: 'home-4' };
    place(s0, 'away-1', hex(6, 3), 6); // window is 0 + 2 + Reflex 3 = 5
    const run: Action = { type: 'move', robot: 'home-4', to: hex(6, 4) };
    const s = step(s0, both(coach({ actions: [run] }), coach({ react: true })), dice());
    expect(ballHolder(s)?.id).toBe('home-4');
  });

  it('takes a die off a keeper outside the goal area', () => {
    const s0 = arena();
    place(s0, 'away-0', hex(8, 4), 0); // keeper, Control 2
    s0.ball = { state: 'held', by: 'away-0' };
    const s = step(
      s0,
      both(idle, coach({ actions: [{ type: 'pass', robot: 'away-0', to: hex(6, 4), kind: 'ground' }] })),
      dice(6),
    );
    const roll = s.log.find((e) => e.t === 'roll');
    expect(roll && roll.t === 'roll' && roll.dice).toHaveLength(1);
  });
});

// --- the shot moment -------------------------------------------------------

describe('the shot moment', () => {
  function chance(kind: 'driven' | 'placed' | 'chip' = 'driven') {
    const s = arena();
    place(s, 'home-4', hex(9, 4), 0); // Power 4, 3 hexes out: 3 dice
    s.ball = { state: 'held', by: 'home-4' };
    place(s, 'away-0', hex(12, 4), 1); // keeper, Reflex 4
    const shoot: Action = { type: 'shoot', robot: 'home-4', kind };
    return { s, shoot };
  }
  const lastShot = (s: MatchState) => s.log.filter((e) => e.t === 'shot').at(-1);

  it('maps the margin to the four outcomes', () => {
    expect(shotOutcome(2)).toBe('goal');
    expect(shotOutcome(0)).toBe('post');
    expect(shotOutcome(-1)).toBe('cleared');
    expect(shotOutcome(-3)).toBe('save');
  });

  it('scores against 2 positioning dice when the keeper does not dive', () => {
    const { s: s0, shoot } = chance();
    let s = step(s0, both(coach({ actions: [shoot] }), coach({ react: false })), dice());
    s = step(s, both(idle, coach({ react: false })), dice(6, 6, 6, 1, 1));
    expect(lastShot(s)).toMatchObject({ outcome: 'goal', shotHits: 3, defenceHits: 0 });
    expect(s.score.home).toBe(1);
    expect(ballHolder(s)?.id).toBe('away-4'); // Away kicks off after conceding
  });

  it('gives a diving keeper +2 dice for guessing the corner', () => {
    const { s: s0, shoot } = chance();
    const home = coach({ actions: [shoot], corner: 'left' });
    const away = coach({ react: true, corner: 'left' });
    let s = step(s0, both(home, away), dice());
    s = step(s, both(home, away), dice(6, 6, 1, 6, 6, 6, 6, 1, 1));
    expect(lastShot(s)).toMatchObject({ outcome: 'save', shotHits: 2, defenceHits: 4, keeperCorner: 'left' });
    expect(ballHolder(s)?.id).toBe('away-0');
    expect(robotById(s, 'away-0').tick).toBe(4);
  });

  it('clears the ball when the defence wins by 1', () => {
    const { s: s0, shoot } = chance();
    const home = coach({ actions: [shoot], corner: 'left' });
    const away = coach({ react: true, corner: 'right' }); // wrong guess: 4 - 1 = 3 dice
    let s = step(s0, both(home, away), dice());
    s = step(s, both(home, away), dice(6, 6, 1, 6, 6, 6, 4));
    expect(lastShot(s)).toMatchObject({ outcome: 'cleared' });
    expect(s.ball).toEqual({ state: 'loose', at: hex(10, 4) });
  });

  it('rebounds off the post into the goal area on a tie', () => {
    const { s: s0, shoot } = chance();
    let s = step(s0, both(coach({ actions: [shoot] }), idle), dice());
    s = step(s, both(idle, idle), dice(6, 6, 1, 6, 6));
    expect(lastShot(s)).toMatchObject({ outcome: 'post' });
    expect(s.ball.state).toBe('loose');
  });

  it('lets a defender on the shot line Block, adding to the defence', () => {
    const { s: s0, shoot } = chance();
    place(s0, 'away-1', hex(11, 4), 1);
    const away = coach({ react: (k) => k === 'block' });
    let s = step(s0, both(coach({ actions: [shoot] }), away), dice());
    s = step(s, both(idle, away), dice(6, 6, 1, 6, 6, 6, 6, 1));
    expect(s.log.some((e) => e.t === 'reaction' && e.kind === 'block')).toBe(true);
    expect(lastShot(s)).toMatchObject({ shotHits: 3, defenceHits: 3, outcome: 'post' });
  });

  it('cannot Block a chip, and a chip gets +2 dice when the keeper is off its line', () => {
    const { s: s0, shoot } = chance('chip');
    place(s0, 'away-0', hex(8, 7), 29); // keeper wandered out
    place(s0, 'away-1', hex(11, 4), 1);
    const ctl = both(coach({ actions: [shoot] }), coach({ react: true }));
    const rng = dice(6, 1, 1, 1, 1);
    let s = s0;
    // The chip hangs for 3 ticks, so the defender acts twice before it lands.
    while (!lastShot(s)) s = step(s, ctl, rng);
    expect(s.log.some((e) => e.t === 'reaction')).toBe(false);
    const roll = s.log.filter((e) => e.t === 'roll').at(-1);
    expect(roll && roll.t === 'roll' && roll.dice).toHaveLength(5);
    expect(lastShot(s)).toMatchObject({ outcome: 'goal' });
  });
});

// --- halves and full matches -------------------------------------------------

describe('halves and full time', () => {
  it('blows for half time at tick 30 and the other team kicks off', () => {
    const s0 = arena();
    s0.robots.forEach((r) => (r.tick = 30));
    const s = step(s0, both(idle, idle), dice());
    expect(s.half).toBe(2);
    expect(ballHolder(s)?.id).toBe('away-4');
  });

  it('lands a ball still in the air before the whistle', () => {
    const s0 = arena();
    s0.robots.forEach((r) => (r.tick = 31));
    place(s0, 'home-3', hex(7, 4), 31);
    s0.ball = {
      state: 'flight',
      flight: { type: 'pass', kind: 'ground', team: 'home', kicker: 'home-2', kickerHits: 2, from: hex(3, 4), to: hex(7, 4), path: [], landTick: 33 },
    };
    let s = step(s0, both(idle, idle), dice());
    expect(s.half).toBe(1);
    expect(ballHolder(s)?.id).toBe('home-3');
    s = step(s, both(idle, idle), dice());
    expect(s.half).toBe(2);
  });

  it('plays a whole AI match to full time, the same way every time for a seed', () => {
    const play = () => playMatch({ seed: 7 }, { home: createSimpleAI(1), away: createSimpleAI(2) });
    const a = play();
    const b = play();
    expect(a.over).toBe(true);
    expect(a.clock).toBe(60);
    expect(a.score).toEqual(b.score);
    expect(a.log.length).toBe(b.log.length);
    const goals = a.log.filter((e) => e.t === 'goal').length;
    expect(goals).toBe(a.score.home + a.score.away);
  });
});
