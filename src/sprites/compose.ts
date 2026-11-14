// Paper-doll compositor: stacks aura, back gear, base body, front gear, core and
// effects into one canvas per on-pitch player. The canvas becomes the texture
// of a camera-facing quad in three.js.
//
// Mirroring (for left-facing directions) is applied by the renderer to the whole
// composite, so gear stays registered to the body; see facing.ts.

import { stepMatrix, transformAnchors, type ResolvedFrame, type SpriteSheet } from './atlas';
import { drawAura, drawCoreAndFx, drawGearPass, type GearContext } from './gear';
import type { Loadout } from './loadout';
import type { Anchors } from './schema';

export interface ComposeOptions {
  showAnchors?: boolean;
  /** Draw only the base body (used by the comparison strips). */
  baseOnly?: boolean;
}

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
  const g: GearContext = { ctx, a: anchors, view: rf.view, t, coreColour: sheet.def.coreColour };

  if (!opts.baseOnly) {
    drawAura(g, loadout.core);
    drawGearPass(g, loadout, 'back');
  }

  ctx.save();
  ctx.setTransform(...m);
  const [sx, sy, sw, sh] = rf.frame.rect;
  ctx.drawImage(sheet.image, sx, sy, sw, sh, 0, 0, sw, sh);
  ctx.restore();

  if (!opts.baseOnly) {
    drawGearPass(g, loadout, 'front');
    drawCoreAndFx(g, loadout);
  }

  if (opts.showAnchors) drawAnchors(ctx, anchors);
  return anchors;
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
