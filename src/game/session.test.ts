import { describe, expect, it } from 'vitest';
import { activeRobot, createMatch, createSimpleAI, legalActions, robotById } from '../engine';
import { isHumanTurn, tryStep } from './session';

describe('human session', () => {
  it('asks the human for an action on their turn, then applies it', () => {
    const s = createMatch({ seed: 3 });
    const ai = createSimpleAI(3);
    expect(isHumanTurn(s, 'home')).toBe(true);
    const asked = tryStep(s, 'home', ai, []);
    expect(asked.question?.kind).toBe('action');
    const robot = activeRobot(s)!;
    const hold = legalActions(s, robot.id).find((a) => a.type === 'hold')!;
    const done = tryStep(s, 'home', ai, [], hold);
    expect(robotById(done.state!, robot.id).tick).toBe(2);
  });

  it('pauses for a reaction and resumes with the answer', () => {
    const s = createMatch({ seed: 3 });
    // Park a home defender next to the away carrier's path and let away run at it.
    s.robots.forEach((r) => (r.tick = 29));
    const carrier = robotById(s, 'away-4');
    carrier.pos = { col: 8, row: 4 };
    carrier.tick = 0;
    s.ball = { state: 'held', by: 'away-4' };
    const defender = robotById(s, 'home-1');
    defender.pos = { col: 6, row: 3 };
    defender.tick = 1;
    const run = { type: 'move', robot: 'away-4', to: { col: 7, row: 4 } } as const;
    const ai = { ...createSimpleAI(1), chooseAction: () => run };
    const asked = tryStep(s, 'home', ai, []);
    expect(asked.question).toEqual({ kind: 'reaction', robot: 'home-1', reaction: 'challenge' });
    const declined = tryStep(s, 'home', ai, [false]);
    expect(declined.state!.ball).toEqual({ state: 'held', by: 'away-4' });
    const accepted = tryStep(s, 'home', ai, [true]);
    expect(robotById(accepted.state!, 'home-1').tick).toBe(3);
  });
});
