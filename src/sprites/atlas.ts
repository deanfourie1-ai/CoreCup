// Loading a sprite sheet and resolving which frame to show.

import type { Direction } from '../engine/hex';
import { facingFor, type Facing } from './facing';
import type { ActionDef, ActionFrame, ActionName, Anchor, Anchors, FrameDef, SpriteSheetDef } from './schema';

export interface SpriteSheet {
  def: SpriteSheetDef;
  image: HTMLImageElement;
  /** Foot pivot in frame pixels. */
  pivot: [number, number];
}

export async function loadSpriteSheet(jsonUrl: string): Promise<SpriteSheet> {
  const def = (await (await fetch(jsonUrl)).json()) as SpriteSheetDef;
  const image = new Image();
  image.src = new URL(def.image, new URL(jsonUrl, location.href)).href;
  await image.decode();
  const [w, h] = def.frameSize;
  return { def, image, pivot: [w * def.pivot_normalized[0], h * def.pivot_normalized[1]] };
}

export interface ResolvedFrame extends Facing {
  index: number;
  step: ActionFrame;
  frame: FrameDef;
  action: ActionDef;
}

export function getAction(def: SpriteSheetDef, name: ActionName): ActionDef {
  const a = def.actions[name];
  if (!a) throw new Error(`Sprite sheet ${def.player} has no ${name}`);
  return a;
}

/** Number of frames an action plays for this facing. */
export function frameCount(def: SpriteSheetDef, name: ActionName, dir: Direction): number {
  const action = getAction(def, name);
  return action.views[facingFor(action, dir).view]!.length;
}

export function resolveFrame(def: SpriteSheetDef, name: ActionName, dir: Direction, index: number): ResolvedFrame {
  const action = getAction(def, name);
  const facing = facingFor(action, dir);
  const steps = action.views[facing.view]!;
  const i = action.loop ? ((index % steps.length) + steps.length) % steps.length : Math.min(index, steps.length - 1);
  const step = steps[i];
  const frame = def.frames[step.frame];
  if (!frame) throw new Error(`Missing frame ${step.frame}`);
  return { ...facing, index: i, step, frame, action };
}

/** 2D affine matrix [a, b, c, d, e, f] as used by CanvasRenderingContext2D.setTransform. */
export type Matrix = [number, number, number, number, number, number];

/** The step's small transform (rotate / nudge / breathe) about the foot pivot. */
export function stepMatrix(step: ActionFrame, pivot: [number, number]): Matrix {
  const [px, py] = pivot;
  const r = ((step.rot ?? 0) * Math.PI) / 180;
  const sy = step.sy ?? 1;
  const cos = Math.cos(r);
  const sin = Math.sin(r);
  // M = T(pivot + d) * R * S(1, sy) * T(-pivot)
  const a = cos;
  const b = sin;
  const c = -sin * sy;
  const d = cos * sy;
  const e = px + (step.dx ?? 0) - (a * px + c * py);
  const f = py + (step.dy ?? 0) - (b * px + d * py);
  return [a, b, c, d, e, f];
}

export function applyMatrix(m: Matrix, x: number, y: number): [number, number] {
  return [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];
}

/** Anchors moved by the step transform, so gear follows rotated/nudged frames. */
export function transformAnchors(anchors: Anchors, m: Matrix): Anchors {
  const out: Anchors = {};
  for (const [k, v] of Object.entries(anchors) as [keyof Anchors, Anchor][]) {
    const [x, y] = applyMatrix(m, v[0], v[1]);
    out[k] = [x, y, v[2]];
  }
  return out;
}
