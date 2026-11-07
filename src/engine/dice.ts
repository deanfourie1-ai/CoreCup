// Dice pool rules from the design doc: roll d6s, every 4, 5 or 6 is a hit,
// and a pool is never smaller than 1 die.

import type { Rng } from './rng';

export const HIT_ON = 4;
export const MIN_DICE = 1;

export interface PoolRoll {
  dice: number[];
  hits: number;
}

export function poolSize(base: number, modifiers = 0): number {
  return Math.max(MIN_DICE, base + modifiers);
}

export function countHits(dice: number[]): number {
  return dice.filter((d) => d >= HIT_ON).length;
}

export function rollPool(rng: Rng, size: number): PoolRoll {
  const dice = Array.from({ length: Math.max(MIN_DICE, size) }, () => rng.die(6));
  return { dice, hits: countHits(dice) };
}

/** A reroll rolls every miss from one roll again, once. */
export function rerollMisses(rng: Rng, roll: PoolRoll): PoolRoll {
  const dice = roll.dice.map((d) => (d >= HIT_ON ? d : rng.die(6)));
  return { dice, hits: countHits(dice) };
}
