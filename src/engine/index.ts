// Public entry point for the rules engine. Headless: no UI imports, so the
// screen, the AI and the rules simulator can all use it.

export * from './types';
export * from './hex';
export * from './dice';
export * from './rng';
export { RULES } from './rules';
export { createMatch, resetForKickoff, kickoffPositions, CENTRE, type MatchOptions } from './setup';
export {
  step,
  playMatch,
  legalActions,
  activeRobot,
  peekNext,
  shotOutcome,
  ballHolder,
  robotById,
  robotAt,
  keeperOf,
  goalLine,
  goalArea,
  ownGoal,
  targetGoal,
  inOwnGoalArea,
  inReactionWindow,
  isOverheated,
  passRange,
  reachable,
  otherTeam,
  attacksEast,
  wallAt,
  shotWallHex,
  decoyHexes,
} from './match';
export { ABILITIES, TIER_NAMES, abilityOf, abilityN, type AbilityDef, type CoreTier } from './abilities';
export { abilityChoice } from './ability-ai';
export { createSimpleAI, towards, keeperPlay } from './ai';
