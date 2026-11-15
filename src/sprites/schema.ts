// The sprite atlas contract shared by placeholder and production art.
// One JSON file per player describes an atlas image, its frames, per-frame 2D
// anchors (where gear attaches) and the actions built from those frames.

/** [x, y, z] in frame pixels. z = 1 draws gear in front of the body, -1 behind it. */
export type Anchor = [number, number, number];

export const ANCHOR_NAMES = [
  'head_top',
  'brow',
  'shoulder_L',
  'shoulder_R',
  'forearm_L',
  'forearm_R',
  'hand_L',
  'hand_R',
  'chest_core',
  'back',
  'shin_L',
  'shin_R',
  'heel_L',
  'heel_R',
  'toe_L',
  'toe_R',
] as const;
export type AnchorName = (typeof ANCHOR_NAMES)[number];
export type Anchors = Partial<Record<AnchorName, Anchor>>;

/** The six hex facings, as drawn views (production art draws all six). */
export type FacingView = 'e' | 'se' | 'sw' | 'w' | 'nw' | 'ne';
/**
 * Prototype views: three drawn facing screen-right (mirrored for the left-facing
 * directions) plus a straight-on `front`.
 */
export type LegacyView = 'front' | 'front_three_quarter' | 'side' | 'back_three_quarter';
export type ViewName = FacingView | LegacyView;

export type Rect = [number, number, number, number];

/** Where a (possibly trimmed) image sits: its rect in an atlas page and its top-left on the frame canvas. */
export interface Placed {
  rect: Rect;
  offset: [number, number];
  /** Atlas page (index into `images`); default 0. */
  page?: number;
}

export interface FrameDef {
  /** x, y, width, height inside the atlas image. */
  rect: Rect;
  /** Top-left of `rect` on the frame canvas when the frame was trimmed; default [0, 0]. */
  offset?: [number, number];
  page?: number;
  anchors: Anchors;
  /**
   * Painted gear for pieces that bend with the body, keyed `<slot>_mk<n>` (core: `core_<tier>`).
   * Same canvas as the base frame. Replaces the anchored piece for that slot and tier.
   */
  overlays?: Record<string, Placed>;
}

/** A rigid gear piece drawn once per facing and placed on a frame's anchors. */
export interface GearPieceDef {
  rect: Rect;
  page?: number;
  /** Pixel in the piece that sits on the anchor. */
  pivot: [number, number];
  anchor: AnchorName;
  /** Rotate the piece so its +x axis points from `anchor` towards this anchor. */
  alignTo?: AnchorName;
}

/** One step of an action: a source frame plus an optional small transform. */
export interface ActionFrame {
  frame: string;
  /** Rotation in degrees about the foot pivot (positive = clockwise on screen). */
  rot?: number;
  dx?: number;
  dy?: number;
  /** Vertical scale about the foot pivot (breathing). */
  sy?: number;
}

export type SpriteEventType =
  | 'foot_contact'
  | 'ball_release'
  | 'wind_up'
  | 'ability_focus'
  | 'ability_release'
  | 'ability_resolve';

export interface SpriteEvent {
  frame: number;
  type: SpriteEventType;
  anchor?: AnchorName;
}

export interface ActionDef {
  fps: number;
  loop: boolean;
  /**
   * Ground distance one loop covers, in frame pixels (two strides for a run).
   * When set, playback speed follows movement speed so the feet don't slide.
   */
  stride_px?: number;
  /** Per-facing override of stride_px, for facings drawn with a different stride or frame count. */
  stride_px_by_view?: Partial<Record<ViewName, number>>;
  views: Partial<Record<ViewName, ActionFrame[]>>;
  events: SpriteEvent[];
}

export type ActionName =
  | 'loco_idle'
  | 'loco_jog'
  | 'shot_power'
  | 'ability'
  | 'run_to_shot'
  | 'run_to_idle';

export interface SpriteSheetDef {
  player: string;
  status: 'placeholder' | 'production';
  note?: string;
  image: string;
  /** Extra atlas pages for big sheets; `image` is page 0 when this is absent. */
  images?: string[];
  frameSize: [number, number];
  pivot_normalized: [number, number];
  coreColour: string;
  /** Creature core, which picks the Ascended spirit shape (e.g. 'kitsune'). */
  coreCreature?: string;
  views: Partial<Record<ViewName, { faces: string }>>;
  layers: string[];
  frames: Record<string, FrameDef>;
  /** Rigid gear art keyed `<slot>_mk<n>_<view>`, e.g. `shoulders_mk2_se`. Per side for paired slots: `shoulders_mk2_se_L`. */
  gear?: Record<string, GearPieceDef>;
  actions: Partial<Record<ActionName, ActionDef>>;
}
