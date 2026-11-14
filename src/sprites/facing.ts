// Which drawn view (and whether to mirror it) shows a player facing each hex side.
//
// The pitch uses pointy-topped hexes, so the six facings are E, SE, SW, W, NW, NE.
// The camera looks north from the south, so SE/SW face the camera and NE/NW face
// away. Every native view is drawn facing screen-right; the left-facing three are
// mirrors until dedicated art exists (see docs/2d-sprites/layered-upgrades.md).

import type { Direction } from '../engine/hex';
import type { ActionDef, ViewName } from './schema';

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
const FALLBACK: ViewName[] = ['side', 'front_three_quarter', 'front', 'back_three_quarter'];

/** The view an action should show for a facing, falling back when it lacks that view. */
export function facingFor(action: ActionDef, dir: Direction): Facing {
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

/** The hex side closest to a direction on the ground plane (x east, z south). */
export function directionFromVector(dx: number, dz: number): Direction {
  // Pointy-topped hex sides sit every 60 degrees, starting at East.
  const deg = (Math.atan2(dz, dx) * 180) / Math.PI; // clockwise on screen, since z grows south
  const order: Direction[] = ['E', 'SE', 'SW', 'W', 'NW', 'NE'];
  const idx = Math.round((((deg % 360) + 360) % 360) / 60) % 6;
  return order[idx];
}
