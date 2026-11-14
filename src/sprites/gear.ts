// Placeholder gear art, drawn as vector shapes onto the anchors of each frame.
//
// This is the "anchored rigid piece" half of the paper-doll approach: each piece
// is one drawing positioned and rotated from two anchors per frame. Production
// gear should be painted, but the anchor contract stays the same. See
// docs/2d-sprites/layered-upgrades.md for when a piece needs per-frame overlay
// art instead.

import type { Anchor, Anchors, ViewName } from './schema';
import type { Loadout, Slot, Tier } from './loadout';

const INK = '#2a1c18';
const BRASS = '#d6a050';
const BRASS_DARK = '#7a5524';
const BRASS_LIGHT = '#f2c46d';
const EMBER = '#c4472a';

export interface GearContext {
  ctx: CanvasRenderingContext2D;
  a: Anchors;
  view: ViewName;
  /** Seconds, for glow pulses and flames. */
  t: number;
  coreColour: string;
  /** Creature core id; picks the Ascended spirit shape. */
  creature?: string;
}

/** Which depth pass is being drawn: behind the body, or in front of it. */
export type Pass = 'back' | 'front';

const inPass = (anchor: Anchor | undefined, pass: Pass): anchor is Anchor =>
  !!anchor && (pass === 'front' ? anchor[2] >= 0 : anchor[2] < 0);

function shape(ctx: CanvasRenderingContext2D, fill: string | CanvasGradient, lw = 2.5) {
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.lineJoin = 'round';
  ctx.lineWidth = lw;
  ctx.strokeStyle = INK;
  ctx.stroke();
}

function brassGrad(ctx: CanvasRenderingContext2D, x: number, y: number, r: number): CanvasGradient {
  const g = ctx.createLinearGradient(x - r, y - r, x + r * 0.6, y + r);
  g.addColorStop(0, BRASS_LIGHT);
  g.addColorStop(0.45, BRASS);
  g.addColorStop(1, BRASS_DARK);
  return g;
}

export function glow(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, colour: string, alpha = 1) {
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.globalAlpha = alpha;
  const g = ctx.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, colour);
  g.addColorStop(0.35, colour + 'aa');
  g.addColorStop(1, colour + '00');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

/** Run `draw` in a frame at `p`, rotated so +x points from p towards q. */
function along(ctx: CanvasRenderingContext2D, p: Anchor, q: Anchor, draw: (len: number) => void) {
  const dx = q[0] - p[0];
  const dy = q[1] - p[1];
  ctx.save();
  ctx.translate(p[0], p[1]);
  ctx.rotate(Math.atan2(dy, dx));
  draw(Math.hypot(dx, dy));
  ctx.restore();
}

function glowStrip(g: GearContext, x0: number, y0: number, x1: number, y1: number, w = 3) {
  const { ctx } = g;
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.strokeStyle = g.coreColour;
  ctx.lineCap = 'round';
  ctx.lineWidth = w + 4;
  ctx.globalAlpha = 0.35 + 0.15 * Math.sin(g.t * 5);
  ctx.beginPath();
  ctx.moveTo(x0, y0);
  ctx.lineTo(x1, y1);
  ctx.stroke();
  ctx.globalAlpha = 1;
  ctx.lineWidth = w;
  ctx.strokeStyle = '#fff6dc';
  ctx.stroke();
  ctx.restore();
}

// ---------------------------------------------------------------- head

/** Where the near ear sits relative to the brow anchor, per view. */
function earOffset(view: ViewName): [number, number] {
  switch (view) {
    case 'front':
      return [-24, 12];
    case 'front_three_quarter':
      return [-30, 12];
    case 'side':
      return [-30, 12];
    case 'back_three_quarter':
      return [-18, 12];
  }
}

function drawHead(g: GearContext, tier: Tier, pass: Pass) {
  const { ctx, a, view } = g;
  const brow = a.brow;
  const top = a.head_top;
  if (!brow || !top || pass !== 'front' || tier === 0) return;
  const [ox, oy] = earOffset(view);
  const ears: [number, number][] =
    view === 'front' ? [[brow[0] + ox, brow[1] + oy], [brow[0] - ox, brow[1] + oy]] : [[brow[0] + ox, brow[1] + oy]];

  if (tier === 3) {
    // Crest helm: a brass cap over the crown with two swept horns. Changes the silhouette.
    const cx = (brow[0] + top[0]) / 2 - 4;
    const cy = top[1] + 14;
    const back = view === 'front' ? 0 : -1;
    const horn = (dir: number) => {
      ctx.beginPath();
      ctx.moveTo(cx + dir * 16 + 6, cy + 2);
      ctx.quadraticCurveTo(cx + dir * 24 + back * 16, cy - 22, cx + dir * 30 + back * 36, cy - 38);
      ctx.quadraticCurveTo(cx + dir * 6 + back * 8, cy - 18, cx + dir * 4 - 8, cy - 2);
      ctx.closePath();
      shape(ctx, brassGrad(ctx, cx, cy - 20, 30));
    };
    if (view === 'front') {
      horn(-1);
      horn(1);
    } else {
      horn(0.4);
      horn(-0.6);
    }
    ctx.beginPath();
    ctx.ellipse(cx, cy + 4, 30, 15, 0, Math.PI, 0);
    ctx.closePath();
    shape(ctx, brassGrad(ctx, cx, cy, 30));
    // Central crest fin.
    ctx.beginPath();
    ctx.moveTo(cx - 6, cy - 8);
    ctx.lineTo(cx + 4 + back * 10, cy - 30);
    ctx.lineTo(cx + 8, cy - 8);
    ctx.closePath();
    shape(ctx, EMBER);
    glowStrip(g, cx - 22, cy + 2, cx + 22, cy + 2, 2.5);
  }

  for (const [ex, ey] of ears) {
    // Ear housing (Mk I+), bigger with an antenna fin at Mk II+.
    const r = tier >= 2 ? 11 : 9;
    if (tier >= 2) {
      ctx.beginPath();
      ctx.moveTo(ex - 3, ey - 6);
      ctx.lineTo(ex - 10, ey - 30);
      ctx.lineTo(ex + 4, ey - 8);
      ctx.closePath();
      shape(ctx, brassGrad(ctx, ex, ey - 15, 15), 2);
    }
    ctx.beginPath();
    ctx.arc(ex, ey, r, 0, Math.PI * 2);
    shape(ctx, brassGrad(ctx, ex, ey, r));
    ctx.beginPath();
    ctx.arc(ex, ey, r * 0.45, 0, Math.PI * 2);
    ctx.fillStyle = tier >= 2 ? g.coreColour : BRASS_DARK;
    ctx.fill();
    if (tier >= 2) glow(ctx, ex, ey, r * 1.6, g.coreColour, 0.6);
  }

  if (tier >= 2 && view !== 'back_three_quarter') {
    // Visor band pushed up on the forehead, like the goggles, so the eyes stay readable.
    const [ex] = ears[0];
    const x1 = view === 'front' ? brow[0] - ox : brow[0] + 4;
    const y1 = top[1] + (brow[1] - top[1]) * 0.4;
    ctx.beginPath();
    ctx.moveTo(ex, y1 - 2);
    ctx.lineTo(x1, y1 - 5);
    ctx.lineTo(x1, y1 + 4);
    ctx.lineTo(ex, y1 + 8);
    ctx.closePath();
    ctx.save();
    ctx.globalAlpha = 0.9;
    shape(ctx, tier === 3 ? g.coreColour : '#ffb347', 2);
    ctx.restore();
    if (tier === 3) glow(ctx, (ex + x1) / 2, y1 - 2, 16, g.coreColour, 0.45);
  }
}

// ---------------------------------------------------------------- shoulders

function drawShoulders(g: GearContext, tier: Tier, pass: Pass) {
  const { ctx, a } = g;
  if (tier === 0) return;
  for (const side of ['L', 'R'] as const) {
    const s = a[`shoulder_${side}`];
    if (!inPass(s, pass)) continue;
    const [x, y] = [s[0], s[1] - 4];
    ctx.save();
    ctx.translate(x, y);
    if (tier === 3) {
      // Spiked pauldron: three blades rise above the shoulder line.
      for (const [bx, h] of [[-12, 26], [0, 34], [12, 24]] as const) {
        ctx.beginPath();
        ctx.moveTo(bx - 6, -4);
        ctx.lineTo(bx + 2, -h);
        ctx.lineTo(bx + 7, -4);
        ctx.closePath();
        shape(ctx, brassGrad(ctx, bx, -h / 2, h / 2), 2);
      }
    }
    const w = [0, 14, 19, 24][tier];
    const h = [0, 9, 12, 15][tier];
    if (tier >= 2) {
      // Lower plate.
      ctx.beginPath();
      ctx.ellipse(0, h * 0.9, w * 0.85, h * 0.7, 0, 0, Math.PI * 2);
      shape(ctx, brassGrad(ctx, 0, h, w), 2);
    }
    ctx.beginPath();
    ctx.ellipse(0, 0, w, h, 0, Math.PI, 0);
    ctx.quadraticCurveTo(w * 0.6, h * 1.1, 0, h * 0.9);
    ctx.quadraticCurveTo(-w * 0.6, h * 1.1, -w, 0);
    ctx.closePath();
    shape(ctx, brassGrad(ctx, 0, 0, w));
    if (tier >= 2) {
      ctx.beginPath();
      ctx.arc(0, h * 0.25, 3, 0, Math.PI * 2);
      ctx.fillStyle = tier === 3 ? g.coreColour : INK;
      ctx.fill();
    }
    if (tier === 3) glow(ctx, 0, h * 0.25, 16, g.coreColour, 0.7);
    ctx.restore();
  }
}

// ---------------------------------------------------------------- arms

function drawArms(g: GearContext, tier: Tier, pass: Pass) {
  const { ctx, a } = g;
  if (tier === 0) return;
  for (const side of ['L', 'R'] as const) {
    const f = a[`forearm_${side}`];
    const h = a[`hand_${side}`];
    if (!inPass(f, pass) || !h) continue;
    along(ctx, f, h, (len) => {
      const L = Math.max(len, 14);
      const bw = [0, 7, 8, 9][tier];
      const start = tier === 1 ? L * 0.15 : -L * 0.15;
      const end = tier === 1 ? L * 0.7 : L * 0.85;
      if (tier === 3) {
        // Elbow blade sweeping back past the elbow.
        ctx.beginPath();
        ctx.moveTo(start + 2, -bw + 2);
        ctx.lineTo(start - 22, -bw - 16);
        ctx.lineTo(start + 16, -bw + 6);
        ctx.closePath();
        shape(ctx, brassGrad(ctx, start - 8, -bw - 6, 16), 2);
      }
      ctx.beginPath();
      ctx.roundRect(start, -bw, end - start, bw * 2, 4);
      shape(ctx, brassGrad(ctx, (start + end) / 2, 0, L / 2));
      // Rivet bands.
      ctx.strokeStyle = BRASS_DARK;
      ctx.lineWidth = 2;
      for (const tx of [start + 4, end - 4]) {
        ctx.beginPath();
        ctx.moveTo(tx, -bw + 2);
        ctx.lineTo(tx, bw - 2);
        ctx.stroke();
      }
      if (tier >= 2) {
        // Knuckle guard over the glove.
        ctx.beginPath();
        ctx.arc(L, 0, tier === 3 ? 10 : 8, 0, Math.PI * 2);
        shape(ctx, brassGrad(ctx, L, 0, 9), 2);
      }
      if (tier === 3) {
        glowStrip(g, start + 6, 0, end - 6, 0, 2);
        glow(ctx, L, 0, 14, g.coreColour, 0.6);
      }
    });
  }
}

// ---------------------------------------------------------------- legs

function drawLegs(g: GearContext, tier: Tier, pass: Pass) {
  const { ctx, a, view } = g;
  if (tier === 0) return;
  for (const side of ['L', 'R'] as const) {
    const s = a[`shin_${side}`];
    const heel = a[`heel_${side}`];
    if (!inPass(s, pass) || !heel) continue;
    along(ctx, s, heel, (len) => {
      if (tier >= 2) {
        // Shin guard down the front of the shin.
        const gl = tier === 3 ? len * 0.85 : len * 0.6;
        ctx.beginPath();
        ctx.moveTo(4, -9);
        ctx.lineTo(gl, -7);
        ctx.lineTo(gl + 4, 0);
        ctx.lineTo(gl, 7);
        ctx.lineTo(4, 9);
        ctx.closePath();
        shape(ctx, brassGrad(ctx, gl / 2, 0, gl / 2));
        if (tier === 3) {
          glowStrip(g, 10, 0, gl - 6, 0, 2);
          // Side fin.
          ctx.beginPath();
          ctx.moveTo(gl * 0.3, view === 'front' ? 8 : -8);
          ctx.lineTo(gl * 0.55, view === 'front' ? 22 : -22);
          ctx.lineTo(gl * 0.75, view === 'front' ? 8 : -8);
          ctx.closePath();
          shape(ctx, EMBER, 2);
        }
      }
    });
    // Knee plate, round on Mk I, shield-shaped with a spike on Mk III.
    const r = [0, 10, 12, 13][tier];
    ctx.beginPath();
    if (tier === 3) {
      ctx.moveTo(s[0] - r, s[1] - r * 0.6);
      ctx.lineTo(s[0], s[1] - r * 1.9);
      ctx.lineTo(s[0] + r, s[1] - r * 0.6);
      ctx.lineTo(s[0] + r * 0.7, s[1] + r * 0.8);
      ctx.lineTo(s[0], s[1] + r * 1.2);
      ctx.lineTo(s[0] - r * 0.7, s[1] + r * 0.8);
      ctx.closePath();
    } else {
      ctx.ellipse(s[0], s[1], r, r * 1.1, 0, 0, Math.PI * 2);
    }
    shape(ctx, brassGrad(ctx, s[0], s[1], r));
    ctx.beginPath();
    ctx.arc(s[0], s[1], 2.5, 0, Math.PI * 2);
    ctx.fillStyle = tier === 3 ? g.coreColour : INK;
    ctx.fill();
  }
}

// ---------------------------------------------------------------- boots

function drawBoots(g: GearContext, tier: Tier, pass: Pass) {
  const { ctx, a } = g;
  if (tier === 0) return;
  for (const side of ['L', 'R'] as const) {
    const heel = a[`heel_${side}`];
    const toe = a[`toe_${side}`];
    if (!inPass(heel, pass) || !toe) continue;
    along(ctx, heel, toe, (len) => {
      const L = Math.max(len, 10);
      if (tier === 3) {
        // Twin heel fins: the boot silhouette grows backwards.
        for (const [oy, reach] of [[-8, 26], [2, 20]] as const) {
          ctx.beginPath();
          ctx.moveTo(4, oy - 3);
          ctx.lineTo(-reach, oy - 10);
          ctx.lineTo(2, oy + 5);
          ctx.closePath();
          shape(ctx, brassGrad(ctx, -reach / 2, oy, reach / 2), 2);
        }
        // Full armoured upper.
        ctx.beginPath();
        ctx.moveTo(-4, -12);
        ctx.lineTo(L * 0.75, -10);
        ctx.quadraticCurveTo(L + 8, -6, L + 6, 4);
        ctx.lineTo(-2, 8);
        ctx.closePath();
        shape(ctx, brassGrad(ctx, L / 2, 0, L / 2));
        glowStrip(g, 2, -2, L * 0.8, -1, 2);
      }
      if (tier >= 2 && tier < 3) {
        // Heel spur plate and ankle cuff.
        ctx.beginPath();
        ctx.moveTo(4, -10);
        ctx.lineTo(-12, -4);
        ctx.lineTo(4, 6);
        ctx.closePath();
        shape(ctx, brassGrad(ctx, -4, 0, 10), 2);
        ctx.beginPath();
        ctx.roundRect(-2, -16, 14, 8, 3);
        shape(ctx, brassGrad(ctx, 5, -12, 8), 2);
      }
      // Toe cap (every tier).
      ctx.beginPath();
      ctx.ellipse(L * 0.85, -1, [0, 9, 11, 12][tier], [0, 7, 8, 9][tier], 0, 0, Math.PI * 2);
      shape(ctx, brassGrad(ctx, L * 0.85, 0, 10));
    });
  }
}

// ---------------------------------------------------------------- core

/** The creature spirit behind the body at Ascended. Kept clear of the face. */
export function drawAura(g: GearContext, tier: Tier) {
  if (tier < 3) return;
  if (g.creature === 'kitsune') return drawFoxTails(g);
  const { ctx, a, t } = g;
  const back = a.back ?? a.chest_core;
  if (!back) return;
  // Wings root between the shoulder blades and spread wide of the body, below head height.
  const [x, y] = [back[0], back[1] - 4];
  const flap = Math.sin(t * 3) * 0.1;
  ctx.save();
  ctx.globalAlpha = 0.85;
  for (const dir of [-1, 1]) {
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(dir, 1);
    ctx.rotate(flap);
    // Five flame feathers fanning from level to steeply down.
    for (let i = 0; i < 5; i++) {
      const ang = -0.35 + i * 0.32;
      const len = 118 - i * 14;
      const tipX = Math.cos(ang) * len;
      const tipY = Math.sin(ang) * len;
      const grad = ctx.createLinearGradient(0, 0, tipX, tipY);
      grad.addColorStop(0, '#fff3c4');
      grad.addColorStop(0.3, g.coreColour + 'ee');
      grad.addColorStop(1, g.coreColour + '00');
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.moveTo(0, -6);
      ctx.quadraticCurveTo(tipX * 0.5, tipY * 0.5 - 22, tipX, tipY);
      ctx.quadraticCurveTo(tipX * 0.6, tipY * 0.6 + 8, 0, 8);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();
  }
  ctx.restore();
  glow(ctx, x, y, 70, g.coreColour, 0.4);
}

/** Kitsune: a fan of foxfire tails rising from the lower back, kept beside the head, never over the face. */
function drawFoxTails(g: GearContext) {
  const { ctx, a, t } = g;
  const back = a.back ?? a.chest_core;
  if (!back) return;
  const [x, y] = [back[0], back[1] + 30];
  ctx.save();
  ctx.globalAlpha = 0.85;
  const tails = 7;
  for (let i = 0; i < tails; i++) {
    // Fan from low-left round to low-right, skipping straight up where the head is.
    const side = i < tails / 2 ? -1 : 1;
    const k = i < tails / 2 ? i : tails - 1 - i;
    const ang = -Math.PI / 2 + side * (0.75 + k * 0.32) + Math.sin(t * 2.4 + i) * 0.08;
    const len = 104 - Math.abs(k - 1) * 8;
    const tipX = x + Math.cos(ang) * len;
    const tipY = y + Math.sin(ang) * len;
    const bend = side * 26;
    const grad = ctx.createLinearGradient(x, y, tipX, tipY);
    grad.addColorStop(0, '#ffd9a0');
    grad.addColorStop(0.35, g.coreColour + 'ee');
    grad.addColorStop(0.8, '#ff9a5a99');
    grad.addColorStop(1, '#ffffff00');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.moveTo(x - 5, y);
    ctx.quadraticCurveTo((x + tipX) / 2 - bend, (y + tipY) / 2 - 10, tipX, tipY);
    ctx.quadraticCurveTo((x + tipX) / 2 - bend * 0.3, (y + tipY) / 2 + 12, x + 5, y);
    ctx.closePath();
    ctx.fill();
    // White-hot tail tip.
    glow(ctx, tipX, tipY, 9, '#fff3f8', 0.6);
  }
  ctx.restore();
  glow(ctx, x, y - 10, 60, g.coreColour, 0.35);
}

function drawCore(g: GearContext, tier: Tier) {
  const { ctx, a, t } = g;
  if (tier === 0) return;
  const c = a.chest_core;
  if (c && c[2] >= 0) {
    const pulse = 1 + 0.12 * Math.sin(t * 6);
    const r = [0, 5, 7, 8][tier] * pulse;
    glow(ctx, c[0], c[1], [0, 16, 22, 26][tier] * pulse, g.coreColour, 0.85);
    if (tier >= 2) {
      // Rotating ring of sparks.
      ctx.save();
      ctx.translate(c[0], c[1]);
      ctx.rotate(t * 2);
      ctx.strokeStyle = '#fff6dc';
      ctx.lineWidth = 2;
      for (let i = 0; i < 6; i++) {
        ctx.rotate(Math.PI / 3);
        ctx.beginPath();
        ctx.moveTo(r + 4, 0);
        ctx.lineTo(r + 9, 0);
        ctx.stroke();
      }
      ctx.restore();
    }
    ctx.beginPath();
    ctx.moveTo(c[0], c[1] - r * 1.3);
    ctx.lineTo(c[0] + r, c[1]);
    ctx.lineTo(c[0], c[1] + r * 1.3);
    ctx.lineTo(c[0] - r, c[1]);
    ctx.closePath();
    shape(ctx, '#fff6dc', 2);
  } else if (tier >= 2 && a.back) {
    // Seen from behind: a vent glow between the shoulder blades.
    glow(ctx, a.back[0], a.back[1], tier === 3 ? 26 : 18, g.coreColour, 0.7);
  }
}

/** Boot thruster flames for Mk III boots. Drawn last so they sit over everything. */
function drawFx(g: GearContext, l: Loadout) {
  const { ctx, a, t } = g;
  if (l.boots === 3) {
    for (const side of ['L', 'R'] as const) {
      const heel = a[`heel_${side}`];
      const toe = a[`toe_${side}`];
      if (!heel || !toe) continue;
      along(ctx, heel, toe, () => {
        const flick = 0.8 + 0.3 * Math.sin(t * 22 + (side === 'L' ? 0 : 2));
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        const grad = ctx.createLinearGradient(0, 0, -30 * flick, 0);
        grad.addColorStop(0, '#fff6dc');
        grad.addColorStop(0.3, g.coreColour);
        grad.addColorStop(1, g.coreColour + '00');
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.moveTo(-2, -7);
        ctx.quadraticCurveTo(-18 * flick, -8, -32 * flick, 0);
        ctx.quadraticCurveTo(-18 * flick, 8, -2, 7);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
      });
    }
  }
}

const SLOT_DRAW: Partial<Record<Slot, (g: GearContext, tier: Tier, pass: Pass) => void>> = {
  legs: drawLegs,
  boots: drawBoots,
  arms: drawArms,
  shoulders: drawShoulders,
  head: drawHead,
};

/** Layer order inside a pass, bottom to top. */
export const GEAR_ORDER: Slot[] = ['legs', 'boots', 'arms', 'shoulders', 'head'];

export function drawGearPass(g: GearContext, l: Loadout, pass: Pass) {
  for (const slot of GEAR_ORDER) SLOT_DRAW[slot]?.(g, l[slot], pass);
}

export function drawCoreAndFx(g: GearContext, l: Loadout) {
  drawCore(g, l.core);
  drawFx(g, l);
}
