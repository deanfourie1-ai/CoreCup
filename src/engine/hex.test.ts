import { describe, expect, it } from 'vitest';
import { distance, hexesWithin, line, neighbours, scatterDirection, step } from './hex';

describe('hex grid', () => {
  it('measures distance in hex steps', () => {
    expect(distance({ col: 0, row: 4 }, { col: 12, row: 4 })).toBe(12);
    expect(distance({ col: 6, row: 4 }, { col: 6, row: 4 })).toBe(0);
    expect(distance({ col: 6, row: 4 }, { col: 6, row: 5 })).toBe(1);
    expect(distance({ col: 6, row: 4 }, { col: 6, row: 6 })).toBe(2);
  });

  it('gives six neighbours in open play and fewer at the edge', () => {
    expect(neighbours({ col: 6, row: 4 })).toHaveLength(6);
    expect(neighbours({ col: 0, row: 0 })).toHaveLength(2);
    for (const n of neighbours({ col: 5, row: 3 })) {
      expect(distance(n, { col: 5, row: 3 })).toBe(1);
    }
  });

  it('steps East and West along a row', () => {
    expect(step({ col: 6, row: 4 }, 'E')).toEqual({ col: 7, row: 4 });
    expect(step({ col: 6, row: 3 }, 'W')).toEqual({ col: 5, row: 3 });
  });

  it('draws connected lines between hexes', () => {
    const l = line({ col: 1, row: 1 }, { col: 9, row: 6 });
    expect(l[0]).toEqual({ col: 1, row: 1 });
    expect(l[l.length - 1]).toEqual({ col: 9, row: 6 });
    for (let i = 1; i < l.length; i++) expect(distance(l[i - 1], l[i])).toBe(1);
  });

  it('points scatter die 1 at the target goal', () => {
    expect(scatterDirection(1, true)).toBe('E');
    expect(scatterDirection(1, false)).toBe('W');
    expect(scatterDirection(2, true)).toBe('SE');
    expect(scatterDirection(6, false)).toBe('SW');
  });

  it('finds hexes within range on the pitch', () => {
    expect(hexesWithin({ col: 6, row: 4 }, 1)).toHaveLength(7);
  });
});
