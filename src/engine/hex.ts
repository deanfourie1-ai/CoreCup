// Hex grid maths for the pitch.
//
// The pitch uses pointy-topped hexes in "odd-r" offset layout: every odd row is
// shifted half a hex to the right. Pointy tops give each hex one side facing
// straight at each goal, which keeps the d6 scatter rule simple.
//
// `Hex` is the board position people see (column, row). Maths happens in axial
// coordinates (q, r) and is converted back.

export interface Hex {
  col: number;
  row: number;
}

interface Axial {
  q: number;
  r: number;
}

export const PITCH_COLS = 13;
export const PITCH_ROWS = 9;

export const hexKey = (h: Hex): string => `${h.col},${h.row}`;
export const sameHex = (a: Hex, b: Hex): boolean => a.col === b.col && a.row === b.row;

function toAxial(h: Hex): Axial {
  return { q: h.col - (h.row - (h.row & 1)) / 2, r: h.row };
}

function fromAxial(a: Axial): Hex {
  return { col: a.q + (a.r - (a.r & 1)) / 2, row: a.r };
}

/** Hex sides in clockwise order (screen rows grow downwards), starting East. */
export const DIRECTIONS = ['E', 'SE', 'SW', 'W', 'NW', 'NE'] as const;
export type Direction = (typeof DIRECTIONS)[number];

const AXIAL_STEP: Record<Direction, Axial> = {
  E: { q: 1, r: 0 },
  SE: { q: 0, r: 1 },
  SW: { q: -1, r: 1 },
  W: { q: -1, r: 0 },
  NW: { q: 0, r: -1 },
  NE: { q: 1, r: -1 },
};

export function inPitch(h: Hex, cols = PITCH_COLS, rows = PITCH_ROWS): boolean {
  return h.col >= 0 && h.col < cols && h.row >= 0 && h.row < rows;
}

export function step(h: Hex, dir: Direction): Hex {
  const a = toAxial(h);
  const s = AXIAL_STEP[dir];
  return fromAxial({ q: a.q + s.q, r: a.r + s.r });
}

/** Neighbouring hexes that are on the pitch. */
export function neighbours(h: Hex): Hex[] {
  return DIRECTIONS.map((d) => step(h, d)).filter((n) => inPitch(n));
}

export function distance(a: Hex, b: Hex): number {
  const x = toAxial(a);
  const y = toAxial(b);
  const dq = x.q - y.q;
  const dr = x.r - y.r;
  return (Math.abs(dq) + Math.abs(dr) + Math.abs(dq + dr)) / 2;
}

export function isAdjacent(a: Hex, b: Hex): boolean {
  return distance(a, b) === 1;
}

function cubeRound(x: number, z: number): Axial {
  const y = -x - z;
  let rx = Math.round(x);
  let rz = Math.round(z);
  const ry = Math.round(y);
  const dx = Math.abs(rx - x);
  const dy = Math.abs(ry - y);
  const dz = Math.abs(rz - z);
  if (dx > dy && dx > dz) rx = -ry - rz;
  else if (!(dy > dz)) rz = -rx - ry;
  return { q: rx, r: rz };
}

/** Every hex on the straight line from `a` to `b`, both ends included. */
export function line(a: Hex, b: Hex): Hex[] {
  const n = distance(a, b);
  if (n === 0) return [a];
  const A = toAxial(a);
  const B = toAxial(b);
  // A tiny nudge keeps the line off hex edges so results are stable.
  const ax = A.q + 1e-6;
  const az = A.r + 2e-6;
  const out: Hex[] = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    out.push(fromAxial(cubeRound(ax + (B.q - A.q) * t, az + (B.r - A.r) * t)));
  }
  return out;
}

/**
 * The scatter die: 1 points at the attacking team's target goal (East or West),
 * then the numbers go clockwise round the hex.
 */
export function scatterDirection(roll: number, attacksEast: boolean): Direction {
  const start = attacksEast ? 0 : 3;
  return DIRECTIONS[(start + roll - 1) % 6];
}

/** Every hex within `range` of `h` that is on the pitch. */
export function hexesWithin(h: Hex, range: number): Hex[] {
  const out: Hex[] = [];
  for (let row = 0; row < PITCH_ROWS; row++) {
    for (let col = 0; col < PITCH_COLS; col++) {
      const c = { col, row };
      if (distance(h, c) <= range) out.push(c);
    }
  }
  return out;
}
