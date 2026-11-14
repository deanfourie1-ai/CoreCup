// Paper-doll compositor: stacks aura, back gear, base body, front gear, core and
// effects into one canvas per on-pitch player. The canvas becomes the texture
// of a camera-facing quad in three.js.
//
// Gear comes from three sources, best first:
// 1. painted overlays on the frame (`FrameDef.overlays`) for pieces that bend,
// 2. rigid pieces drawn once per facing (`SpriteSheetDef.gear`) placed on anchors,
// 3. placeholder vector gear (gear.ts) when neither exists yet.
//
// Mirroring (a facing with no drawing of its own) is applied by the renderer to
// the whole composite, so gear stays registered to the body; see facing.ts.

import { stepMatrix, transformAnchors, type Matrix, type ResolvedFrame, type SpriteSheet } from './atlas';
import { viewShape } from './facing';
import { drawAura, drawCoreAndFx, drawGearPass, GEAR_ORDER, type GearContext, type Pass } from './gear';
import type { Loadout, Slot, Tier } from './loadout';
import type { Anchor, Anchors, AnchorName, FrameDef } from './schema';

export interface ComposeOptions {
  showAnchors?: boolean;
  /** Draw only the base body (used by the comparison strips). */
  baseOnly?: boolean;
}

/** Key used for a slot's art at a tier: `boots_mk3`, `core_2`. */
export const gearKey = (slot: Slot, tier: Tier): string => (slot === 'core' ? `core_${tier}` : `${slot}_mk${tier}`);

/** Which side of the body a paired piece belongs to, from its anchor name. */
const SIDES = ['L', 'R'] as const;

export function composeFrame(
  ctx: CanvasRenderingContext2D,
  sheet: SpriteSheet,
  rf: ResolvedFrame,
  loadout: Loadout,
  t: number,
  opts: ComposeOptions = {},
): Anchors {
  const [w, h] = sheet.def.frameSize;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, w, h);

  const m = stepMatrix(rf.step, sheet.pivot);
  const anchors = transformAnchors(rf.frame.anchors, m);
  const shape = viewShape(rf.view);

  // Placeholder vector gear assumes a right-facing body; for drawn left-facing views
  // it runs in a flipped space with mirrored anchors so it lands in the right place.
  const vectorAnchors = shape.left ? mirrorAnchors(anchors, w) : anchors;
  const g: GearContext = {
    ctx,
    a: vectorAnchors,
    view: shape.kind,
    t,
    coreColour: sheet.def.coreColour,
    creature: sheet.def.coreCreature,
  };
  const vector = (draw: () => void) => {
    ctx.save();
    if (shape.left) ctx.setTransform(-1, 0, 0, 1, w, 0);
    draw();
    ctx.restore();
  };

  const hasArt = (slot: Slot) => hasOverlay(rf.frame, slot, loadout[slot]) || hasRigid(sheet, rf, slot, loadout[slot]);

  if (!opts.baseOnly) {
    vector(() => drawAura(g, loadout.core));
    drawRigidPass(ctx, sheet, rf, anchors, loadout, 'back');
    vector(() => drawGearPass(g, loadout, 'back', hasArt));
  }

  ctx.save();
  ctx.setTransform(...m);
  const [sx, sy, sw, sh] = rf.frame.rect;
  const [ox, oy] = rf.frame.offset ?? [0, 0];
  ctx.drawImage(pageOf(sheet, rf.frame.page), sx, sy, sw, sh, ox, oy, sw, sh);
  ctx.restore();

  if (!opts.baseOnly) {
    drawOverlays(ctx, sheet, rf.frame, m, loadout);
    drawRigidPass(ctx, sheet, rf, anchors, loadout, 'front');
    vector(() => drawGearPass(g, loadout, 'front', hasArt));
    vector(() => drawCoreAndFx(g, loadout));
  }

  if (opts.showAnchors) drawAnchors(ctx, anchors);
  return anchors;
}

const pageOf = (sheet: SpriteSheet, page = 0) => sheet.images[page] ?? sheet.images[0];

function mirrorAnchors(a: Anchors, w: number): Anchors {
  const out: Anchors = {};
  for (const [k, v] of Object.entries(a) as [AnchorName, Anchor][]) out[k] = [w - v[0], v[1], v[2]];
  return out;
}

function hasOverlay(frame: FrameDef, slot: Slot, tier: Tier): boolean {
  return tier > 0 && !!frame.overlays?.[gearKey(slot, tier)];
}

function drawOverlays(ctx: CanvasRenderingContext2D, sheet: SpriteSheet, frame: FrameDef, m: Matrix, l: Loadout) {
  if (!frame.overlays) return;
  ctx.save();
  ctx.setTransform(...m);
  for (const slot of [...GEAR_ORDER, 'core'] as Slot[]) {
    const o = l[slot] > 0 ? frame.overlays[gearKey(slot, l[slot])] : undefined;
    if (!o) continue;
    const [x, y, w, h] = o.rect;
    ctx.drawImage(pageOf(sheet, o.page), x, y, w, h, o.offset[0], o.offset[1], w, h);
  }
  ctx.restore();
}

/** Rigid piece keys to try for a slot on this view: per-side first, then one piece for the slot. */
function rigidKeys(slot: Slot, tier: Tier, view: string): string[] {
  const base = `${gearKey(slot, tier)}_${view}`;
  return [...SIDES.map((s) => `${base}_${s}`), base];
}

function hasRigid(sheet: SpriteSheet, rf: ResolvedFrame, slot: Slot, tier: Tier): boolean {
  if (tier === 0 || !sheet.def.gear) return false;
  return rigidKeys(slot, tier, rf.view).some((k) => sheet.def.gear![k]);
}

function drawRigidPass(
  ctx: CanvasRenderingContext2D,
  sheet: SpriteSheet,
  rf: ResolvedFrame,
  anchors: Anchors,
  l: Loadout,
  pass: Pass,
) {
  const gear = sheet.def.gear;
  if (!gear) return;
  for (const slot of [...GEAR_ORDER, 'core'] as Slot[]) {
    if (l[slot] === 0) continue;
    for (const key of rigidKeys(slot, l[slot], rf.view)) {
      const piece = gear[key];
      if (!piece) continue;
      const at = anchors[piece.anchor];
      if (!at || (pass === 'front') !== at[2] >= 0) continue;
      const to = piece.alignTo ? anchors[piece.alignTo] : undefined;
      const angle = to ? Math.atan2(to[1] - at[1], to[0] - at[0]) : 0;
      const [x, y, pw, ph] = piece.rect;
      ctx.save();
      ctx.translate(at[0], at[1]);
      ctx.rotate(angle);
      ctx.drawImage(pageOf(sheet, piece.page), x, y, pw, ph, -piece.pivot[0], -piece.pivot[1], pw, ph);
      ctx.restore();
    }
  }
}

function drawAnchors(ctx: CanvasRenderingContext2D, anchors: Anchors) {
  ctx.save();
  ctx.font = '9px sans-serif';
  for (const [name, [x, y, z]] of Object.entries(anchors)) {
    ctx.fillStyle = z >= 0 ? '#3cf0ff' : '#ff4fd8';
    ctx.beginPath();
    ctx.arc(x, y, 3, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.fillText(name, x + 4, y - 3);
  }
  ctx.restore();
}
