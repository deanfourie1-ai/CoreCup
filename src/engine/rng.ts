// Seeded random numbers so a match can be replayed exactly from its seed.
// Mulberry32: small, fast, and good enough for dice.

export interface Rng {
  /** A float in [0, 1). */
  next(): number;
  /** An integer from 1 to `sides`, inclusive. */
  die(sides?: number): number;
  /** The current internal state; `createRng(state)` continues from here. */
  state(): number;
}

export function createRng(seed: number): Rng {
  let state = seed >>> 0;
  const next = () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    next,
    die: (sides = 6) => 1 + Math.floor(next() * sides),
    state: () => state,
  };
}
