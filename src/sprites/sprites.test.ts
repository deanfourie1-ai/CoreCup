import { describe, expect, it } from 'vitest';
import { DIRECTIONS } from '../engine/hex';
import { applyMatrix, frameCount, resolveFrame, stepMatrix } from './atlas';
import { directionFromVector, facingFor } from './facing';
import { SLOTS, tierCombinations } from './loadout';
import { ANCHOR_NAMES, type ActionDef, type ActionName, type SpriteSheetDef } from './schema';
import sheetJson from '../../public/sprites/playmaker10/cc_playmaker10.json';


const sheet = sheetJson as unknown as SpriteSheetDef;

describe('facing', () => {
  const jog = sheet.actions.loco_jog!;

  it('shows the camera-facing view for SE/SW and the back view for NE/NW', () => {
    expect(facingFor(jog, 'SE')).toEqual({ view: 'front_three_quarter', mirror: false });
    expect(facingFor(jog, 'SW')).toEqual({ view: 'front_three_quarter', mirror: true });
    expect(facingFor(jog, 'NE')).toEqual({ view: 'back_three_quarter', mirror: false });
    expect(facingFor(jog, 'NW')).toEqual({ view: 'back_three_quarter', mirror: true });
    expect(facingFor(jog, 'W')).toEqual({ view: 'side', mirror: true });
  });

  it('falls back to a view the action has, and never mirrors a straight-on front view', () => {
    expect(facingFor(sheet.actions.shot_power!, 'NW')).toEqual({ view: 'side', mirror: true });
    expect(facingFor(sheet.actions.loco_idle!, 'W')).toEqual({ view: 'front', mirror: false });
  });

  it('uses a drawn facing when there is one, and mirrors the opposite hand only as a fallback', () => {
    const v = (names: string[]) => ({ fps: 10, loop: true, events: [], views: Object.fromEntries(names.map((n) => [n, [{ frame: 'x' }]])) }) as ActionDef;
    const six = v(['e', 'se', 'sw', 'w', 'nw', 'ne']);
    for (const [d, view] of [['E', 'e'], ['SE', 'se'], ['SW', 'sw'], ['W', 'w'], ['NW', 'nw'], ['NE', 'ne']] as const)
      expect(facingFor(six, d)).toEqual({ view, mirror: false });
    const right = v(['e', 'se', 'ne']);
    expect(facingFor(right, 'W')).toEqual({ view: 'e', mirror: true });
    expect(facingFor(right, 'SW')).toEqual({ view: 'se', mirror: true });
    expect(facingFor(right, 'NW')).toEqual({ view: 'ne', mirror: true });
  });

  it('turns a ground vector into the nearest hex side', () => {
    expect(directionFromVector(1, 0)).toBe('E');
    expect(directionFromVector(0.866, 1.5)).toBe('SE');
    expect(directionFromVector(-0.866, 1.5)).toBe('SW');
    expect(directionFromVector(-1, 0)).toBe('W');
    expect(directionFromVector(-0.866, -1.5)).toBe('NW');
    expect(directionFromVector(0.866, -1.5)).toBe('NE');
  });
});

describe('placeholder atlas metadata', () => {
  it('gives every frame every anchor, inside the frame', () => {
    const [w, h] = sheet.frameSize;
    for (const [name, f] of Object.entries(sheet.frames)) {
      for (const a of ANCHOR_NAMES) {
        const v = f.anchors[a];
        expect(v, `${name}.${a}`).toBeDefined();
        expect(v![0]).toBeGreaterThanOrEqual(0);
        expect(v![0]).toBeLessThan(w);
        expect(v![1]).toBeGreaterThanOrEqual(0);
        expect(v![1]).toBeLessThan(h);
        expect([1, -1]).toContain(v![2]);
      }
    }
  });

  it('only references frames that exist, with events inside each action', () => {
    for (const [name, action] of Object.entries(sheet.actions)) {
      const lengths = Object.values(action!.views).map((v) => v!.length);
      for (const steps of Object.values(action!.views)) for (const s of steps!) expect(sheet.frames[s.frame], s.frame).toBeDefined();
      for (const e of action!.events) expect(e.frame, name).toBeLessThan(Math.min(...lengths));
    }
  });

  it('has idle, jog and a shot with a foot-contact event', () => {
    expect(sheet.actions.shot_power!.events.some((e) => e.type === 'foot_contact')).toBe(true);
    for (const a of ['loco_idle', 'loco_jog', 'shot_power'] as ActionName[])
      for (const d of DIRECTIONS) expect(frameCount(sheet, a, d)).toBeGreaterThan(0);
  });

  it('loops jog frames and holds the last shot frame', () => {
    expect(resolveFrame(sheet, 'loco_jog', 'E', 5).index).toBe(1);
    const n = frameCount(sheet, 'shot_power', 'E');
    expect(resolveFrame(sheet, 'shot_power', 'E', n + 3).index).toBe(n - 1);
  });
});

describe('step transforms', () => {
  it('keeps the foot pivot fixed when rotating or breathing', () => {
    const pivot: [number, number] = [128, 341];
    for (const step of [{ frame: 'x', rot: 12 }, { frame: 'x', sy: 1.05 }, { frame: 'x', rot: -9, sy: 0.97 }]) {
      const [x, y] = applyMatrix(stepMatrix(step, pivot), ...pivot);
      expect(x).toBeCloseTo(128);
      expect(y).toBeCloseTo(341);
    }
  });

  it('nudges by dx/dy', () => {
    const [x, y] = applyMatrix(stepMatrix({ frame: 'x', dx: 6, dy: -5 }, [128, 341]), 10, 10);
    expect([x, y]).toEqual([16, 5]);
  });
});

describe('loadout', () => {
  it('has six slots and 729 Mk I-III mixes, which is why gear is layered, not baked', () => {
    expect(SLOTS).toHaveLength(6);
    expect(tierCombinations()).toBe(729);
  });
});
