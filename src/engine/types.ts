import type { CoreTier } from './abilities';
import type { Hex } from './hex';

/** Home attacks East (towards column 12), Away attacks West. */
export type TeamId = 'home' | 'away';
export type Role = 'Keeper' | 'Defender' | 'Midfielder' | 'Striker';

export interface Stats {
  speed: number;
  power: number;
  control: number;
  reflex: number;
}

export interface Robot {
  id: string;
  team: TeamId;
  name: string;
  role: Role;
  core: string;
  stats: Stats;
  pos: Hex;
  /** The robot's token on the timeline. */
  tick: number;
  /** Overheated (no ability, no reactions) while `tick` is below this. */
  overheatUntil: number | null;
  /** Creature core tier: 1 Spark, 2 Surge, 3 Ascended. */
  tier: CoreTier;
  /** A lasting ability effect; it ends when the robot's next action ends. */
  effect: AbilityEffect | null;
}

export type AbilityEffect =
  /** Phoenix: dice added to the next shot. */
  | { kind: 'flame'; dice: number }
  /** Kitsune: decoy hex; `charges` reactions or tackles aimed at her go to it instead. */
  | { kind: 'decoy'; hex: Hex; charges: number }
  /** Golem, Black Tortoise: hexes that stop the other team's ground passes and non-chip shots. */
  | { kind: 'wall'; hexes: Hex[] }
  /** Qilin: teammates within `range` get +1 die on reactions (and the Qilin too when `self`). */
  | { kind: 'aura'; range: number; self: boolean };

export type PassKind = 'ground' | 'lofted';
export type ShotKind = 'driven' | 'placed' | 'chip';
export type Corner = 'left' | 'centre' | 'right';

export interface PassFlight {
  type: 'pass';
  kind: PassKind;
  team: TeamId;
  kicker: string;
  kickerHits: number;
  from: Hex;
  to: Hex;
  /** Hexes the ball passes over, kicker's hex excluded. */
  path: Hex[];
  landTick: number;
  /** Anansi's Web Pass: cannot be intercepted. */
  web?: boolean;
}

export interface ShotFlight {
  type: 'shot';
  kind: ShotKind;
  team: TeamId;
  kicker: string;
  from: Hex;
  /** Shot dice before the chip bonus and keeper modifiers. */
  dice: number;
  /** How `dice` was built from the shooter's Power, for the dice moment on screen. */
  diceMods?: RollMod[];
  landTick: number;
}

export type Flight = PassFlight | ShotFlight;

export type Ball =
  | { state: 'held'; by: string }
  | { state: 'loose'; at: Hex }
  | { state: 'flight'; flight: Flight };

export type Action =
  | { type: 'move'; robot: string; to: Hex }
  | { type: 'sprint'; robot: string; to: Hex }
  | { type: 'pass'; robot: string; to: Hex; kind: PassKind }
  | { type: 'shoot'; robot: string; kind: ShotKind }
  | { type: 'tackle'; robot: string; target: string }
  | { type: 'intercept'; robot: string }
  | { type: 'hold'; robot: string }
  /** The robot's signature ability. `to` is a hex (a pass, dash or charge), `target` a robot (grab, pull). */
  | { type: 'ability'; robot: string; to?: Hex; target?: string };

/** One line on a roll's modifier list ("-1 Distance"). */
export interface RollMod {
  label: string;
  value: number;
}

export type ReactionKind = 'intercept' | 'challenge' | 'block' | 'dive';

export type ShotOutcome = 'goal' | 'post' | 'cleared' | 'save';

export type MatchEvent =
  | { t: 'action'; tick: number; action: Action }
  | { t: 'reaction'; tick: number; robot: string; kind: ReactionKind }
  | {
      t: 'roll';
      robot: string;
      purpose: string;
      dice: number[];
      hits: number;
      /** The stat dice before modifiers (e.g. Control 4). */
      base?: number;
      baseLabel?: string;
      mods?: RollMod[];
      /** Hits this roll needs on its own (a pass's distance band), when there is a fixed target. */
      need?: number;
    }
  | { t: 'possession'; robot: string | null; at: Hex }
  | {
      t: 'shot';
      shooter: string;
      outcome: ShotOutcome;
      margin: number;
      shotHits: number;
      defenceHits: number;
      corner: Corner;
      keeperCorner: Corner | null;
    }
  | { t: 'goal'; team: TeamId; score: Score }
  | {
      t: 'ability';
      tick: number;
      robot: string;
      core: string;
      name: string;
      tier: CoreTier;
      /** Hexes the robot ran (dash, charge), for the pitch to animate. */
      path?: Hex[];
      /** Wall hexes or the decoy hex. */
      hexes?: Hex[];
      target?: string;
    }
  /** Fox Mirage fooled a robot: it went for the decoy and got nothing. */
  | { t: 'decoy'; robot: string; owner: string; at: Hex }
  /** A wall stopped a pass or shot. */
  | { t: 'walled'; by: string; at: Hex; what: 'pass' | 'shot' }
  /** A robot was moved by someone else's ability (Undertow pull, Labyrinth Charge knock). */
  | { t: 'shoved'; robot: string; by: string; from: Hex; to: Hex }
  | { t: 'coin'; winner: TeamId }
  | { t: 'halftime' }
  | { t: 'fulltime'; score: Score };

export interface Score {
  home: number;
  away: number;
}

export interface MatchState {
  seed: number;
  rngState: number;
  clock: number;
  half: 1 | 2;
  over: boolean;
  score: Score;
  robots: Robot[];
  ball: Ball;
  /** Wins the next timeline tie that comes down to teams; flips when used. */
  tieFlip: TeamId;
  firstKickoff: TeamId;
  /**
   * Kick-off protection: set by every kick-off reset. The taker acts first whatever the track says; until it has
   * moved, passed or shot, opponents stay in their own half and at least 2 hexes from the ball.
   */
  kickoff?: { taker: string; acted: boolean } | null;
  log: MatchEvent[];
}

/** One coach: a human UI, the AI, or a test script. */
export interface Controller {
  chooseAction(state: MatchState, robot: Robot, legal: Action[]): Action;
  chooseReaction(state: MatchState, robot: Robot, kind: ReactionKind): boolean;
  chooseCorner(state: MatchState, robot: Robot, as: 'shooter' | 'keeper'): Corner;
}

export type Controllers = Record<TeamId, Controller>;
