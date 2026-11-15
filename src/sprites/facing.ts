// Which drawn view (and whether to mirror it) shows a player facing each hex side.
//
// The pitch uses pointy-topped hexes, so the six facings are E, SE, SW, W, NW, NE.
// The camera looks north from the south, so SE/SW face the camera and NE/NW face
// away. Production art draws all six facings (views `e` ... `ne`). The Round 1
// placeholder drew three right-facing views and mirrored them; that still works
// as a fallback for any action missing a facing.

import type { Direction } from '../engine/hex';
import type { ActionDef, FacingView, LegacyView, ViewName } from './schema';

export interface Facing {
  view: ViewName;
  mirror: boolean;
}

const PREFERRED: Record<Direction, Facing> = {
  E: { view: 'side', mirror: false },
  W: { view: 'side', mirror: true },
  SE: { view: 'front_three_quarter', mirror: false },
  SW: { view: 'front_three_quarter', mirror: true },
  NE: { view: 'back_three_quarter', mirror: false },
  NW: { view: 'back_three_quarter', mirror: true },
};

/** Views to try, in order, when an action has no drawing for the preferred one. */
const FALLBACK: ViewName[] = ['side', 'front_three_quarter', 'front', 'back_three_quarter', 'e', 'se', 'ne'];

const FACING_VIEW: Record<Direction, FacingView> = { E: 'e', SE: 'se', SW: 'sw', W: 'w', NW: 'nw', NE: 'ne' };
const MIRROR_OF: Record<FacingView, FacingView> = { e: 'w', w: 'e', se: 'sw', sw: 'se', ne: 'nw', nw: 'ne' };

/** The view an action should show for a facing, falling back when it lacks that view. */
export function facingFor(action: ActionDef, dir: Direction): Facing {
  // 1. A drawing for this exact facing.
  const exact = FACING_VIEW[dir];
  if (action.views[exact]) return { view: exact, mirror: false };
  // 2. The opposite-hand facing, mirrored (numbers and one-sided details will read reversed).
  if (action.views[MIRROR_OF[exact]]) return { view: MIRROR_OF[exact], mirror: true };
  // 3. Prototype right-facing views.
  const want = PREFERRED[dir];
  if (action.views[want.view]) return want;
  const leftward = dir === 'W' || dir === 'SW' || dir === 'NW';
  for (const view of FALLBACK) {
    if (!action.views[view]) continue;
    // A straight-on front view reads the same either way, so it never mirrors.
    return { view, mirror: view === 'front' ? false : leftward };
  }
  throw new Error('Action has no views');
}

/** How placeholder vector gear should treat a view: its body angle and whether it faces screen-left. */
export function viewShape(view: ViewName): { kind: LegacyView; left: boolean } {
  switch (view) {
    case 'e':
      return { kind: 'side', left: false };
    case 'w':
      return { kind: 'side', left: true };
    case 'se':
      return { kind: 'front_three_quarter', left: false };
    case 'sw':
      return { kind: 'front_three_quarter', left: true };
    case 'ne':
      return { kind: 'back_three_quarter', left: false };
    case 'nw':
      return { kind: 'back_three_quarter', left: true };
    default:
      return { kind: view, left: false };
  }
}

/** The hex side closest to a direction on the ground plane (x east, z south). */
export function directionFromVector(dx: number, dz: number): Direction {
  // Pointy-topped hex sides sit every 60 degrees, starting at East.
  const deg = (Math.atan2(dz, dx) * 180) / Math.PI; // clockwise on screen, since z grows south
  const order: Direction[] = ['E', 'SE', 'SW', 'W', 'NW', 'NE'];
  const idx = Math.round((((deg % 360) + 360) % 360) / 60) % 6;
  return order[idx];
}
