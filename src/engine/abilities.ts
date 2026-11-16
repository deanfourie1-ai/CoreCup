// Signature abilities: one per creature core, three tiers (Spark, Surge, Ascended).
//
// This file is data only, so cores can be added or rebalanced without touching the rules code (design doc,
// "Costs and timing"). The rules that read these numbers live in match.ts under "Signature abilities".
//
// What is built: every core at every tier for the numbers below (reach, wall size, dice and so on). The Ascended
// extras that need new rules (Phoenix rebound, Kraken delay, Kitsune swap, Golem wall stopping movement, Anansi
// curve, Fenrir knock-loose, Kelpie delay, Tortoise +1 positioning die, Minotaur takes the ball) are listed in
// `notBuiltYet` and play as the tier below for now. Matches use Spark until the between-match loop exists.

export type CoreTier = 1 | 2 | 3;
export const TIER_NAMES: Record<CoreTier, string> = { 1: 'Spark', 2: 'Surge', 3: 'Ascended' };

/** When a coach is offered the ability. */
export type AbilityUse =
  | 'carrier' // on the ball
  | 'defend' // off the ball, against the opposing carrier
  | 'keeper' // the keeper protecting its goal
  | 'support'; // off the ball, helping teammates

export interface AbilityDef {
  core: string;
  name: string;
  use: AbilityUse;
  /** Placeholder VFX colour until ability art exists. */
  colour: string;
  /** One line per tier, as the design doc's table says it. */
  text: Record<CoreTier, string>;
  /** Per-tier numbers the rules read. Index 0 = Spark. */
  n: Record<string, [number, number, number]>;
  /** Tier effects in the doc that are not in the rules yet. */
  notBuiltYet?: string;
  /** Tiers Déan has not approved yet (they play as the tier below). */
  unapproved?: CoreTier[];
}

const t = (spark: number, surge: number, ascended: number): [number, number, number] => [spark, surge, ascended];

export const ABILITIES: Record<string, AbilityDef> = {
  Phoenix: {
    core: 'Phoenix',
    name: 'Flame Shot',
    use: 'carrier',
    colour: '#ff8a3d',
    text: { 1: 'Next shot gets +2 dice', 2: '+3 dice', 3: '+3 dice, and a saved shot rebounds to the shooter' },
    n: { dice: t(2, 3, 3) },
    notBuiltYet: 'Ascended rebound',
  },
  Kraken: {
    core: 'Kraken',
    name: 'Tentacle Grab',
    use: 'defend',
    colour: '#5fd0c8',
    text: { 1: 'Tackle from 2 hexes away', 2: 'Reach 3', 3: 'Reach 3, and the target is delayed 2 ticks' },
    n: { reach: t(2, 3, 3) },
    notBuiltYet: 'Ascended 2-tick delay',
  },
  Kitsune: {
    core: 'Kitsune',
    name: 'Fox Mirage',
    use: 'carrier',
    colour: '#ff6f9e',
    text: { 1: 'A decoy hex that draws one reaction', 2: 'The decoy draws up to two reactions', 3: 'Two decoys, and the robot swaps places with one' },
    // Surge is not approved, so it plays as Spark (one decoy, one reaction).
    n: { decoys: t(1, 1, 2) },
    notBuiltYet: 'Ascended swap',
    unapproved: [2],
  },
  Golem: {
    core: 'Golem',
    name: 'Stone Wall',
    use: 'keeper',
    colour: '#c9b48a',
    text: { 1: 'A 3-hex wall blocks passes and shots until it next acts', 2: '4-hex wall', 3: '5-hex wall that also stops movement' },
    n: { size: t(3, 4, 5) },
    notBuiltYet: 'Ascended wall stopping movement',
  },
  Anansi: {
    core: 'Anansi',
    name: 'Web Pass',
    use: 'carrier',
    colour: '#e8d27a',
    text: { 1: 'A pass that cannot be intercepted', 2: 'Also +1 die', 3: 'Also curves around one robot, +1 die' },
    n: { dice: t(0, 1, 1) },
    notBuiltYet: 'Ascended curve',
  },
  Fenrir: {
    core: 'Fenrir',
    name: 'Unchained Dash',
    use: 'carrier',
    colour: '#9fb8ff',
    text: { 1: 'Sprint ignores Challenges', 2: 'Sprint ignores Challenges, +1 hex', 3: 'Dash through one opponent and knock the ball loose' },
    n: { extra: t(2, 3, 3) },
    notBuiltYet: 'Ascended dash-through',
  },
  Qilin: {
    core: 'Qilin',
    name: 'Guardian Aura',
    use: 'support',
    colour: '#8ff0b0',
    text: { 1: 'Adjacent teammates +1 die on reactions', 2: 'The Qilin gets the bonus too', 3: 'Aura reaches 2 hexes' },
    n: { range: t(1, 1, 2), self: t(0, 1, 1) },
  },
  Kelpie: {
    core: 'Kelpie',
    name: 'Undertow',
    use: 'defend',
    colour: '#4fb3e8',
    text: { 1: 'Pull an opponent within 2 hexes 1 hex', 2: 'Within 3 hexes', 3: 'Pull 2 hexes and delay them 2 ticks' },
    n: { reach: t(2, 3, 3), pull: t(1, 1, 2) },
    notBuiltYet: 'Ascended 2-tick delay',
  },
  'Black Tortoise': {
    core: 'Black Tortoise',
    name: 'Shell Guard',
    use: 'keeper',
    colour: '#7a9a6a',
    text: { 1: 'Blocks one adjacent hex as well as its own', 2: 'Two adjacent hexes', 3: 'Two adjacent hexes, and +1 positioning die' },
    n: { extra: t(1, 2, 2) },
    notBuiltYet: 'Ascended +1 positioning die',
  },
  Minotaur: {
    core: 'Minotaur',
    name: 'Labyrinth Charge',
    use: 'carrier',
    colour: '#e0603a',
    text: {
      1: 'A straight run of up to Speed + 2 hexes that knocks aside the first robot in its path',
      2: '+1 hex',
      3: 'Knocks aside the first two robots, and a ball carrier hit loses the ball',
    },
    n: { extra: t(2, 3, 3), knocks: t(1, 1, 2) },
    notBuiltYet: 'Ascended ball knock-loose',
  },
};

export function abilityOf(core: string): AbilityDef | undefined {
  return ABILITIES[core];
}

/** A tier's number for a core (Spark when the tier is out of range). */
export function abilityN(core: string, key: string, tier: CoreTier): number {
  const v = ABILITIES[core]?.n[key];
  return v ? v[Math.min(3, Math.max(1, tier)) - 1] : 0;
}
