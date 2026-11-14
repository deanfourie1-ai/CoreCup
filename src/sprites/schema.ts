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

/** The drawn views. Every native view faces screen-right except `front`. */
export type ViewName = 'front' | 'front_three_quarter' | 'side' | 'back_three_quarter';

export interface FrameDef {
  /** x, y, width, height inside the atlas image. */
  rect: [number, number, number, number];
  anchors: Anchors;
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

export type SpriteEventType = 'foot_contact' | 'ball_release' | 'wind_up';

export interface SpriteEvent {
  frame: number;
  type: SpriteEventType;
  anchor?: AnchorName;
}

export interface ActionDef {
  fps: number;
  loop: boolean;
  views: Partial<Record<ViewName, ActionFrame[]>>;
  events: SpriteEvent[];
}

export type ActionName = 'loco_idle' | 'loco_jog' | 'shot_power';

export interface SpriteSheetDef {
  player: string;
  status: 'placeholder' | 'production';
  note?: string;
  image: string;
  frameSize: [number, number];
  pivot_normalized: [number, number];
  coreColour: string;
  /** Creature core, which picks the Ascended spirit shape (e.g. 'kitsune'). */
  coreCreature?: string;
  views: Partial<Record<ViewName, { faces: string }>>;
  layers: string[];
  frames: Record<string, FrameDef>;
  actions: Partial<Record<ActionName, ActionDef>>;
}
