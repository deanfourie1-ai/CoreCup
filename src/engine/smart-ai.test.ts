import { describe, expect, it } from 'vitest';
import { createSimpleAI } from './ai';
import { legalActions, playMatch, robotById, step } from './match';
import { createMatch } from './setup';
import { createSmartAI, shotChance } from './smart-ai';
import type { Action, Controller } from './types';

describe('smart AI', () => {
  it('only ever picks legal actions', () => {
    const smart = createSmartAI(3);
    const checked: Controller = {
      ...smart,
      chooseAction(s, r, legal) {
        const a = smart.chooseAction(s, r, legal);
        const key = JSON.stringify(a);
        expect(legal.some((l: Action) => JSON.stringify(l) === key)).toBe(true);
        return a;
      },
    };
    let s = createMatch({ seed: 5 });
    for (let i = 0; i < 20000 && !s.over; i++) s = step(s, { home: createSimpleAI(5), away: checked });
    expect(s.over).toBe(true);
  });

  it('rates a close shot above a long one', () => {
    const s = createMatch({ seed: 1 });
    s.kickoff = null;
    const striker = robotById(s, 'home-4');
    const close = shotChance(s, striker, { col: 10, row: 4 }, 'placed');
    const far = shotChance(s, striker, { col: 4, row: 4 }, 'placed');
    expect(close).toBeGreaterThan(far);
    expect(close).toBeGreaterThan(0);
    expect(legalActions(s, striker.id).length).toBeGreaterThan(0);
  });

  it('beats the simple AI more often than it loses, with the same robots and dice', () => {
    let smart = 0;
    let simple = 0;
    for (let i = 1; i <= 30; i++) {
      const s = playMatch({ seed: i * 101 }, { home: createSimpleAI(i), away: createSmartAI(i) });
      if (s.score.away > s.score.home) smart++;
      if (s.score.home > s.score.away) simple++;
    }
    // Over 800 simulated matches it wins about 43% and loses about 16%.
    expect(smart).toBeGreaterThan(simple);
  });
});
