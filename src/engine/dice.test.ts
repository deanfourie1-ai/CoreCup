import { describe, expect, it } from 'vitest';
import { countHits, poolSize, rerollMisses, rollPool } from './dice';
import { createRng } from './rng';

describe('dice pools', () => {
  it('counts 4, 5 and 6 as hits', () => {
    expect(countHits([1, 2, 3, 4, 5, 6])).toBe(3);
  });

  it('never makes a pool smaller than 1 die', () => {
    expect(poolSize(2, -5)).toBe(1);
    expect(rollPool(createRng(1), 0).dice).toHaveLength(1);
  });

  it('gives the same rolls for the same seed', () => {
    const a = rollPool(createRng(42), 5);
    const b = rollPool(createRng(42), 5);
    expect(a).toEqual(b);
  });

  it('only ever rolls 1 to 6', () => {
    const rng = createRng(7);
    const { dice } = rollPool(rng, 1000);
    expect(Math.min(...dice)).toBe(1);
    expect(Math.max(...dice)).toBe(6);
  });

  it('keeps hits and rerolls only misses', () => {
    const rng = createRng(3);
    const before = { dice: [6, 1, 5, 2], hits: 2 };
    const after = rerollMisses(rng, before);
    expect(after.dice[0]).toBe(6);
    expect(after.dice[2]).toBe(5);
    expect(after.hits).toBeGreaterThanOrEqual(2);
  });
});
