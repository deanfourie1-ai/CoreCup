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
}

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
}

export interface ShotFlight {
  type: 'shot';
  kind: ShotKind;
  team: TeamId;
  kicker: string;
  from: Hex;
  /** Shot dice before the chip bonus and keeper modifiers. */
  dice: number;
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
  | { type: 'hold'; robot: string };

export type ReactionKind = 'intercept' | 'challenge' | 'block' | 'dive';

export type ShotOutcome = 'goal' | 'post' | 'cleared' | 'save';

export type MatchEvent =
  | { t: 'action'; tick: number; action: Action }
  | { t: 'reaction'; tick: number; robot: string; kind: ReactionKind }
  | { t: 'roll'; robot: string; purpose: string; dice: number[]; hits: number }
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
  log: MatchEvent[];
}

/** One coach: a human UI, the AI, or a test script. */
export interface Controller {
  chooseAction(state: MatchState, robot: Robot, legal: Action[]): Action;
  chooseReaction(state: MatchState, robot: Robot, kind: ReactionKind): boolean;
  chooseCorner(state: MatchState, robot: Robot, as: 'shooter' | 'keeper'): Corner;
}

export type Controllers = Record<TeamId, Controller>;
