// Turns the engine's roll events into "dice moments" for the screen: who rolls, what they need, every modifier, the
// dice, and how it ends. The rules engine has already decided everything; this only tells the story in order.

import { RULES, robotById, type MatchEvent, type MatchState, type RollMod, type TeamId } from '../engine';

type RollEvent = Extract<MatchEvent, { t: 'roll' }>;

export interface DiceSide {
  robot: string;
  name: string;
  team: TeamId;
  /** "Tackle", "Keep the ball", "Dive"… */
  role: string;
  base: number;
  baseLabel: string;
  mods: RollMod[];
  dice: number[];
  hits: number;
  /** Every die a hit, from three or more dice (1 in 8 or rarer). */
  crit: boolean;
  /** No hits from three or more dice. */
  fumble: boolean;
}

export interface DiceScene {
  kind: 'pass' | 'intercept' | 'tackle' | 'challenge' | 'receive' | 'shot';
  title: string;
  /** What the roll has to do, shown before the dice fall: "Needs 2 hits", "Beat the pass: 2 hits". */
  target: string;
  /** Attacker first; for a shot, the defence (blocks + keeper) after. */
  sides: DiceSide[];
  /** Index where the second camp starts (0 = single roll). */
  split: number;
  result: string;
  /** Which team the result favours, for the colour of the flourish. */
  winner: TeamId | null;
}

const ROLE_WORDS: Record<string, string> = {
  pass: 'Pass',
  intercept: 'Intercept',
  tackle: 'Tackle',
  challenge: 'Challenge',
  'keep ball': 'Keep the ball',
  receive: 'Receive',
  contest: 'Contest',
  block: 'Block',
  shot: 'Shot',
  dive: 'Dive',
  positioning: 'Keeper positioning',
};

function side(s: MatchState, e: RollEvent): DiceSide {
  const r = robotById(s, e.robot);
  return {
    robot: r.id,
    name: r.name,
    team: r.team,
    role: ROLE_WORDS[e.purpose] ?? e.purpose,
    base: e.base ?? e.dice.length,
    baseLabel: e.baseLabel ?? 'Dice',
    mods: e.mods ?? [],
    dice: e.dice,
    hits: e.hits,
    crit: e.dice.length >= 3 && e.hits === e.dice.length,
    fumble: e.dice.length >= 3 && e.hits === 0,
  };
}

const plural = (n: number) => `${n} ${n === 1 ? 'hit' : 'hits'}`;
const other = (t: TeamId): TeamId => (t === 'home' ? 'away' : 'home');

function opposed(
  kind: DiceScene['kind'],
  title: string,
  a: DiceSide,
  b: DiceSide,
  words: { win: string; lose: string; tie: string },
  tieFavoursB: boolean,
): DiceScene {
  const win = a.hits > b.hits;
  const tie = a.hits === b.hits;
  return {
    kind,
    title,
    target: `Beat ${b.name.split(' ')[0]}'s roll`,
    sides: [a, b],
    split: 1,
    result: win ? words.win : tie ? words.tie : words.lose,
    winner: win ? a.team : tie ? (tieFavoursB ? b.team : null) : b.team,
  };
}

/** Builds the dice moments for the events added between two states (`before` gives the names). */
export function diceScenes(s: MatchState, events: MatchEvent[]): DiceScene[] {
  const out: DiceScene[] = [];
  const blocks: DiceSide[] = [];
  let shot: { shooter: DiceSide; keeper?: DiceSide } | null = null;
  for (let i = 0; i < events.length; i++) {
    const e = events[i];
    if (e.t === 'shot' && shot) {
      const defence = [...blocks, ...(shot.keeper ? [shot.keeper] : [])];
      const words = { goal: 'GOAL!', post: 'Off the post!', cleared: 'Cleared!', save: 'What a save!' } as const;
      out.push({
        kind: 'shot',
        title: 'Shot on goal',
        target: defence.length ? 'Beat the defence' : 'Open goal: one hit scores',
        sides: [shot.shooter, ...defence],
        split: 1,
        result: words[e.outcome],
        winner: e.outcome === 'goal' ? shot.shooter.team : other(shot.shooter.team),
      });
      blocks.length = 0;
      shot = null;
      continue;
    }
    if (e.t !== 'roll') continue;
    const me = side(s, e);
    const next = events[i + 1]?.t === 'roll' ? (events[i + 1] as RollEvent) : undefined;
    switch (e.purpose) {
      case 'pass': {
        const need = e.need ?? 1;
        out.push({
          kind: 'pass',
          title: 'Pass',
          target: `Needs ${plural(need)}`,
          sides: [me],
          split: 0,
          result: me.hits >= need ? 'On target!' : me.hits === 0 ? 'Way off!' : 'Off target!',
          winner: me.hits >= need ? me.team : null,
        });
        break;
      }
      case 'intercept': {
        const need = e.need ?? 1;
        out.push({
          kind: 'intercept',
          title: 'Interception',
          target: `Beat the pass: ${plural(need)} steals it`,
          sides: [me],
          split: 0,
          result: me.hits >= need ? 'Stolen!' : me.hits === need - 1 ? 'Deflected!' : 'Missed it',
          winner: me.hits >= need ? me.team : me.hits === need - 1 ? null : other(me.team),
        });
        break;
      }
      case 'tackle':
      case 'challenge':
        if (next?.purpose === 'keep ball') {
          const tieKeeps = RULES.tackleTie === 'carrier';
          out.push(
            opposed(
              e.purpose,
              e.purpose === 'tackle' ? 'Tackle' : 'Challenge',
              me,
              side(s, next),
              { win: 'Won it!', lose: 'Kept it!', tie: tieKeeps ? 'Tie: kept it!' : 'Tie: it runs loose!' },
              tieKeeps,
            ),
          );
          i++;
        }
        break;
      case 'receive':
        if (next?.purpose === 'contest') {
          out.push(
            opposed('receive', 'Fight for the pass', me, side(s, next), { win: 'Controlled!', lose: 'Nicked it!', tie: 'Loose ball!' }, false),
          );
          i++;
        }
        break;
      case 'block':
        blocks.push(me);
        break;
      case 'shot':
        shot = { shooter: me };
        break;
      case 'dive':
      case 'positioning':
        if (shot) shot.keeper = me;
        break;
    }
  }
  return out;
}
