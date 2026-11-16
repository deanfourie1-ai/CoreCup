import { describe, expect, it } from 'vitest';
import {
  createMatch,
  createSimpleAI,
  goalArea,
  legalActions,
  robotById,
  sameHex,
  step,
  type Controller,
  type MatchState,
} from '../engine';
import { autopilotAction, needsPlayer } from './autopilot';
import { diceScenes } from './dice-scenes';
import { hitChance, suggestPasses } from './passes';
import { tryStep } from './session';

describe('team-shape autopilot', () => {
  it('leaves the ball carrier to the player', () => {
    const s = createMatch({ seed: 1 });
    const carrier = robotById(s, (s.ball as { by: string }).by);
    expect(autopilotAction(s, carrier, legalActions(s, carrier.id))).toBeNull();
    // The screen gets its robot from a copy of the state; that must not fool the check.
    const copy = structuredClone(carrier);
    expect(autopilotAction(s, copy, legalActions(s, copy.id))).toBeNull();
  });

  it('plays off-ball robots and the keeper, and only with legal walks or waits', () => {
    const s = createMatch({ seed: 1 });
    for (const r of s.robots.filter((x) => x.team === 'home' && s.ball.state === 'held' && s.ball.by !== x.id)) {
      const legal = legalActions(s, r.id);
      const a = autopilotAction(s, r, legal)!;
      expect(a).not.toBeNull();
      expect(['move', 'hold']).toContain(a.type);
      expect(legal.some((l) => JSON.stringify(l) === JSON.stringify(a))).toBe(true);
    }
  });

  it('plays whole matches with the player only asked for the turns that matter', () => {
    let asked = 0;
    let auto = 0;
    const thinker = createSimpleAI(11);
    const home: Controller = {
      chooseAction(s, r, legal) {
        const a = autopilotAction(s, r, legal);
        if (a) {
          auto++;
          return a;
        }
        asked++;
        return thinker.chooseAction(s, r, legal);
      },
      chooseReaction: () => true,
      chooseCorner: () => 'left',
    };
    let keeperAway = 0;
    for (let seed = 1; seed <= 6; seed++) {
      let s: MatchState = createMatch({ seed });
      const ctl = { home, away: createSimpleAI(seed) };
      for (let i = 0; i < 20000 && !s.over; i++) {
        s = step(s, ctl);
        const k = s.robots.find((r) => r.team === 'home' && r.role === 'Keeper')!;
        if (!goalArea('home').some((h) => sameHex(h, k.pos))) keeperAway++;
      }
      expect(s.over).toBe(true);
    }
    // The playtest had ~112 choices per side and 25 that mattered; autopilot should take well over half.
    expect(auto).toBeGreaterThan(asked);
    // The keeper stays home almost all the time.
    expect(keeperAway).toBeLessThan(40);
  });

  it('always hands over a tackle chance', () => {
    const s = createMatch({ seed: 2 });
    s.kickoff = null;
    const carrier = robotById(s, (s.ball as { by: string }).by);
    const away = s.robots.find((r) => r.team === 'away' && r.role === 'Midfielder')!;
    away.pos = { col: carrier.pos.col + 1, row: carrier.pos.row };
    const legal = legalActions(s, away.id);
    expect(legal.some((a) => a.type === 'tackle')).toBe(true);
    expect(needsPlayer(s, away, legal)).toBe(true);
  });
});

describe('suggested passes', () => {
  it('chance of hits matches the dice maths', () => {
    expect(hitChance(1, 1)).toBeCloseTo(0.5);
    expect(hitChance(2, 1)).toBeCloseTo(0.75);
    expect(hitChance(4, 2)).toBeCloseTo(11 / 16);
    expect(hitChance(3, 4)).toBe(0);
  });

  it('offers a few legal targets, not every hex', () => {
    const s = createMatch({ seed: 4 });
    const carrier = robotById(s, (s.ball as { by: string }).by);
    const opts = suggestPasses(s, carrier);
    expect(opts.length).toBeGreaterThan(0);
    expect(opts.length).toBeLessThanOrEqual(4);
    const legal = legalActions(s, carrier.id);
    for (const o of opts) {
      expect(legal.some((a) => a.type === 'pass' && a.kind === o.kind && sameHex(a.to, o.to))).toBe(true);
      expect(o.need).toBeGreaterThanOrEqual(1);
    }
  });
});

describe('always react', () => {
  it('answers reaction prompts with yes instead of asking', () => {
    const s = createMatch({ seed: 3 });
    s.robots.forEach((r) => (r.tick = 29));
    const carrier = robotById(s, 'away-4');
    carrier.pos = { col: 8, row: 4 };
    carrier.tick = 0;
    s.ball = { state: 'held', by: 'away-4' };
    s.kickoff = null;
    const defender = robotById(s, 'home-1');
    defender.pos = { col: 6, row: 3 };
    defender.tick = 1;
    const run = { type: 'move', robot: 'away-4', to: { col: 7, row: 4 } } as const;
    const ai = { ...createSimpleAI(1), chooseAction: () => run };
    expect(tryStep(s, 'home', ai, []).question?.kind).toBe('reaction');
    const auto = tryStep(s, 'home', ai, [], undefined, { alwaysReact: true });
    expect(auto.question).toBeUndefined();
    expect(robotById(auto.state!, 'home-1').tick).toBe(3);
  });
});

describe('dice moments', () => {
  it('turns every rolled event of a match into scenes with targets and modifiers', () => {
    let s = createMatch({ seed: 9 });
    const ctl = { home: createSimpleAI(1), away: createSimpleAI(2) };
    const kinds = new Set<string>();
    let rolls = 0;
    let shown = 0;
    while (!s.over) {
      const before = s.log.length;
      s = step(s, ctl);
      const events = s.log.slice(before);
      rolls += events.filter((e) => e.t === 'roll').length;
      for (const sc of diceScenes(s, events)) {
        kinds.add(sc.kind);
        shown += sc.sides.length;
        expect(sc.target.length).toBeGreaterThan(0);
        for (const side of sc.sides) {
          const pool = Math.max(1, side.base + side.mods.reduce((n, m) => n + m.value, 0));
          expect(side.dice.length).toBe(pool);
        }
      }
    }
    expect(shown).toBe(rolls);
    expect(kinds.has('pass') || kinds.has('shot')).toBe(true);
  });
});

