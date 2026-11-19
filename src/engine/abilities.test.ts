import { afterEach, describe, expect, it } from 'vitest';
import { hexKey, type Hex } from './hex';
import { ballHolder, isOverheated, legalActions, robotById, shotWallHex, step, stoneWallHexes } from './match';
import type { Rng } from './rng';
import { RULES } from './rules';
import { createMatch } from './setup';
import type { Action, Controller, Controllers, MatchState, ReactionKind } from './types';

// Squad order. Emberforge (home): 0 Golem keeper, 1 Qilin, 2 Anansi, 3 Kitsune, 4 Phoenix.
// Tidewell (away): 0 Black Tortoise keeper, 1 Kraken, 2 Fenrir, 3 Kelpie, 4 Minotaur.

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

function coach(opts: { actions?: Action[]; react?: boolean | ((k: ReactionKind) => boolean) } = {}): Controller {
  const queue = [...(opts.actions ?? [])];
  return {
    chooseAction: (_s, r, legal) => queue.shift() ?? legal.find((a) => a.type === 'hold' && a.robot === r.id)!,
    chooseReaction: (_s, _r, kind) => (typeof opts.react === 'function' ? opts.react(kind) : (opts.react ?? false)),
    chooseCorner: () => 'centre',
  };
}

const hex = (col: number, row: number): Hex => ({ col, row });
const both = (home: Controller, away: Controller): Controllers => ({ home, away });
const idle = coach();

/** Everyone parked along the touchlines at tick 20; place() puts the robots a test needs. */
function arena(): MatchState {
  const s = createMatch({ seed: 1 });
  s.robots.forEach((r, i) => {
    r.tick = 20;
    r.pos = r.team === 'home' ? hex(i, 0) : hex(12 - (i - 5), 8);
  });
  s.ball = { state: 'loose', at: hex(6, 8) };
  s.kickoff = null;
  return s;
}

function place(s: MatchState, id: string, at: Hex, tick: number) {
  const r = robotById(s, id);
  r.pos = at;
  r.tick = tick;
  return r;
}

const abilities = (s: MatchState, id: string) => legalActions(s, id).filter((a) => a.type === 'ability');

afterEach(() => {
  RULES.abilities = true;
});

describe('abilities in general', () => {
  it('cost 8 ticks at Spark, then overheat for 12 ticks: no ability, no reactions', () => {
    const s = arena();
    place(s, 'home-4', hex(9, 4), 10);
    s.ball = { state: 'held', by: 'home-4' };
    const cast: Action = { type: 'ability', robot: 'home-4' };
    expect(abilities(s, 'home-4')).toEqual([cast]);
    const after = step(s, both(coach({ actions: [cast] }), idle), dice());
    const phoenix = robotById(after, 'home-4');
    expect(phoenix.tick).toBe(18);
    expect(phoenix.overheatUntil).toBe(30);
    expect(isOverheated(phoenix)).toBe(true);
    expect(abilities(after, 'home-4')).toEqual([]);
  });

  it('are gone when switched off in the rules', () => {
    RULES.abilities = false;
    const s = arena();
    place(s, 'home-4', hex(9, 4), 10);
    s.ball = { state: 'held', by: 'home-4' };
    expect(abilities(s, 'home-4')).toEqual([]);
  });

  it('are not allowed against a protected kick-off', () => {
    const s = createMatch({ seed: 1 });
    expect(abilities(s, 'away-1')).toEqual([]);
  });

  it('end at half time with the overheat', () => {
    const s = arena();
    s.robots.forEach((r) => (r.tick = 30));
    const q = robotById(s, 'home-1');
    q.effect = { kind: 'aura', range: 1, self: false };
    q.overheatUntil = 40;
    const after = step(s, both(idle, idle), dice());
    expect(after.half).toBe(2);
    expect(after.robots.every((r) => r.effect === null && r.overheatUntil === null)).toBe(true);
  });

  it('an overheated keeper can still Dive, but an overheated defender cannot Block', () => {
    const s = arena();
    place(s, 'away-4', hex(4, 4), 10);
    s.ball = { state: 'held', by: 'away-4' };
    const keeper = place(s, 'home-0', hex(0, 4), 11);
    keeper.overheatUntil = 40;
    const blocker = place(s, 'home-1', hex(2, 4), 11);
    blocker.overheatUntil = 40;
    const asked: string[] = [];
    const home: Controller = {
      ...coach(),
      chooseReaction: (_s, r, kind) => {
        asked.push(`${r.id}:${kind}`);
        return true;
      },
    };
    let t = step(s, both(home, coach({ actions: [{ type: 'shoot', robot: 'away-4', kind: 'driven' }] })), dice(4, 4, 4, 4, 4));
    // Land the shot: Power 4 shot, then the dive (Reflex 4 + 2 for guessing right).
    t = step(t, both(home, idle), dice(1, 1, 1, 1, 4, 4, 4, 4, 4, 4));
    expect(asked).toEqual(['home-0:dive']);
  });
});

describe('Phoenix: Flame Shot', () => {
  it('adds +2 dice to the next shot, then it is spent', () => {
    const s = arena();
    place(s, 'home-4', hex(9, 4), 10);
    s.ball = { state: 'held', by: 'home-4' };
    let t = step(s, both(coach({ actions: [{ type: 'ability', robot: 'home-4' }] }), idle), dice());
    robotById(t, 'home-4').tick = 18;
    t.robots.filter((r) => r.id !== 'home-4').forEach((r) => (r.tick = 25));
    t = step(t, both(coach({ actions: [{ type: 'shoot', robot: 'home-4', kind: 'driven' }] }), idle), dice());
    const f = t.ball.state === 'flight' ? t.ball.flight : null;
    expect(f?.type === 'shot' && f.diceMods?.find((m) => m.label === 'Flame Shot')?.value).toBe(2);
    expect(robotById(t, 'home-4').effect).toBeNull();
  });
});

describe('Kraken: Tentacle Grab', () => {
  it('tackles a carrier 2 hexes away and pulls the ball in', () => {
    const s = arena();
    place(s, 'home-2', hex(6, 4), 20);
    s.ball = { state: 'held', by: 'home-2' };
    place(s, 'away-1', hex(8, 4), 10);
    const grab = abilities(s, 'away-1');
    expect(grab).toEqual([{ type: 'ability', robot: 'away-1', target: 'home-2' }]);
    // Kraken Power 3: three hits. Anansi Control 4: one hit.
    const t = step(s, both(idle, coach({ actions: grab })), dice(6, 6, 6, 6, 1, 1, 1));
    expect(ballHolder(t)?.id).toBe('away-1');
    expect(robotById(t, 'home-2').tick).toBe(22);
  });

  it('is not on offer next to the carrier (that is a normal tackle)', () => {
    const s = arena();
    place(s, 'home-2', hex(6, 4), 20);
    s.ball = { state: 'held', by: 'home-2' };
    place(s, 'away-1', hex(7, 4), 10);
    expect(abilities(s, 'away-1')).toEqual([]);
  });
});

describe('Kitsune: Fox Mirage', () => {
  it('puts up a decoy that draws the next tackle: the tackler gets nothing and ends up on the decoy', () => {
    const s = arena();
    place(s, 'home-3', hex(6, 4), 10);
    s.ball = { state: 'held', by: 'home-3' };
    place(s, 'away-1', hex(7, 4), 15);
    let t = step(s, both(coach({ actions: [{ type: 'ability', robot: 'home-3' }] }), idle), dice());
    const decoy = robotById(t, 'home-3').effect;
    expect(decoy?.kind).toBe('decoy');
    const at = decoy?.kind === 'decoy' ? decoy.hex : hex(0, 0);
    // No dice scripted: a fooled tackle must not roll.
    t = step(t, both(idle, coach({ actions: [{ type: 'tackle', robot: 'away-1', target: 'home-3' }] })), dice());
    expect(ballHolder(t)?.id).toBe('home-3');
    expect(hexKey(robotById(t, 'away-1').pos)).toBe(hexKey(at));
    expect(robotById(t, 'home-3').effect).toBeNull();
    expect(t.log.some((e) => e.t === 'decoy' && e.robot === 'away-1')).toBe(true);
  });
});

describe('Golem: Stone Wall', () => {
  it('stops a driven shot dead, but a chip goes over', () => {
    const s = arena();
    const golem = place(s, 'home-0', hex(0, 4), 10);
    golem.effect = { kind: 'wall', hexes: stoneWallHexes('home', 3) };
    place(s, 'away-4', hex(4, 4), 5);
    s.ball = { state: 'held', by: 'away-4' };
    let t = step(s, both(idle, coach({ actions: [{ type: 'shoot', robot: 'away-4', kind: 'driven' }] })), dice());
    t = step(t, both(idle, idle), dice());
    expect(t.log.some((e) => e.t === 'walled' && e.what === 'shot')).toBe(true);
    expect(t.ball.state === 'loose' || t.ball.state === 'held').toBe(true);
    expect(t.score.away).toBe(0);

    const c = arena();
    const g2 = place(c, 'home-0', hex(0, 4), 10);
    g2.effect = { kind: 'wall', hexes: stoneWallHexes('home', 3) };
    place(c, 'away-4', hex(4, 4), 5);
    c.ball = { state: 'held', by: 'away-4' };
    let u = step(c, both(idle, coach({ actions: [{ type: 'shoot', robot: 'away-4', kind: 'chip' }] })), dice());
    u = step(u, both(idle, idle), dice(6, 6, 6, 6, 1, 1));
    expect(u.log.some((e) => e.t === 'walled')).toBe(false);
    expect(u.log.some((e) => e.t === 'shot')).toBe(true);
  });

  it('builds 3 hexes across the goal mouth', () => {
    expect(stoneWallHexes('home', 3).map(hexKey)).toEqual(['1,3', '1,4', '1,5']);
  });
});

describe('Black Tortoise: Shell Guard', () => {
  it("does not stop shots on the keeper's own hex (the keeper saves there with its dice), only on the extra hex", () => {
    const s = arena();
    const tortoise = place(s, 'away-0', hex(12, 4), 10);
    tortoise.effect = { kind: 'wall', hexes: [hex(12, 4), hex(11, 4)] };
    place(s, 'home-4', hex(8, 4), 5);
    // Straight down row 4: the line crosses the extra hex (11,4) first, so the shell stops it.
    expect(shotWallHex(s, 'home', hex(8, 4), 'driven')).toEqual(hex(11, 4));
    // With only the keeper's own hex in the shell, nothing stops the shot (the keeper still rolls to save it).
    tortoise.effect = { kind: 'wall', hexes: [hex(12, 4)] };
    expect(shotWallHex(s, 'home', hex(8, 4), 'driven')).toBeUndefined();
    RULES.wallOwnHexStopsShots = true;
    expect(shotWallHex(s, 'home', hex(8, 4), 'driven')).toEqual(hex(12, 4));
    RULES.wallOwnHexStopsShots = false;
  });
});

describe('Anansi: Web Pass', () => {
  it('is a ground pass nobody can intercept', () => {
    const s = arena();
    place(s, 'home-2', hex(3, 4), 10);
    s.ball = { state: 'held', by: 'home-2' };
    place(s, 'away-1', hex(5, 3), 11);
    const offered: string[] = [];
    const away: Controller = { ...idle, chooseReaction: (_s, r, k) => (offered.push(`${r.id}:${k}`), true) };
    const web: Action = { type: 'ability', robot: 'home-2', to: hex(7, 4) };
    const t = step(s, both(coach({ actions: [web] }), away), dice(6, 6, 6, 6));
    expect(offered).toEqual([]);
    expect(t.ball.state === 'flight' && t.ball.flight.type === 'pass' && t.ball.flight.web).toBe(true);
    expect(legalActions(t, 'away-1').some((a) => a.type === 'intercept')).toBe(false);
  });
});

describe('Fenrir: Unchained Dash', () => {
  it('sprints past defenders without facing a Challenge', () => {
    const s = arena();
    place(s, 'away-2', hex(8, 4), 10);
    s.ball = { state: 'held', by: 'away-2' };
    place(s, 'home-1', hex(6, 3), 11);
    const offered: string[] = [];
    const home: Controller = { ...idle, chooseReaction: (_s, r, k) => (offered.push(`${r.id}:${k}`), true) };
    const dash: Action = { type: 'ability', robot: 'away-2', to: hex(4, 4) };
    expect(abilities(s, 'away-2')).toContainEqual(dash);
    const t = step(s, both(home, coach({ actions: [dash] })), dice());
    expect(offered).toEqual([]);
    expect(robotById(t, 'away-2').pos).toEqual(hex(4, 4));
    expect(ballHolder(t)?.id).toBe('away-2');
  });
});

describe('Qilin: Guardian Aura', () => {
  it('gives a teammate next to the Qilin +1 die on a reaction', () => {
    const s = arena();
    const q = place(s, 'home-1', hex(4, 3), 25);
    q.effect = { kind: 'aura', range: 1, self: false };
    place(s, 'home-2', hex(4, 4), 11);
    place(s, 'away-2', hex(7, 4), 10);
    s.ball = { state: 'held', by: 'away-2' };
    const t = step(
      s,
      both(coach({ react: true }), coach({ actions: [{ type: 'move', robot: 'away-2', to: hex(5, 4) }] })),
      dice(1, 1, 1, 1, 1, 1, 1, 1, 1, 1),
    );
    const challenge = t.log.find((e) => e.t === 'roll' && e.purpose === 'challenge');
    expect(challenge && challenge.t === 'roll' && challenge.mods).toContainEqual({ label: 'Guardian Aura', value: 1 });
  });
});

describe('Kelpie: Undertow', () => {
  it('pulls an opponent 2 hexes away one hex closer', () => {
    const s = arena();
    place(s, 'away-3', hex(6, 4), 10);
    place(s, 'home-2', hex(8, 4), 20);
    s.ball = { state: 'held', by: 'home-2' };
    const pull = abilities(s, 'away-3').find((a) => a.target === 'home-2')!;
    const t = step(s, both(idle, coach({ actions: [pull] })), dice());
    expect(robotById(t, 'home-2').pos).toEqual(hex(7, 4));
    expect(ballHolder(t)?.id).toBe('home-2');
  });
});

describe('Minotaur: Labyrinth Charge', () => {
  it('runs in a straight line and knocks aside the first robot in the way', () => {
    const s = arena();
    place(s, 'away-4', hex(9, 4), 10);
    s.ball = { state: 'held', by: 'away-4' };
    place(s, 'home-1', hex(7, 4), 20);
    const charge: Action = { type: 'ability', robot: 'away-4', to: hex(5, 4) };
    expect(abilities(s, 'away-4')).toContainEqual(charge);
    const t = step(s, both(idle, coach({ actions: [charge] })), dice());
    expect(robotById(t, 'away-4').pos).toEqual(hex(5, 4));
    expect(robotById(t, 'home-1').pos).not.toEqual(hex(7, 4));
    expect(t.log.some((e) => e.t === 'shoved' && e.robot === 'home-1')).toBe(true);
  });
});
