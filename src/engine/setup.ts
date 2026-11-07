import { CLUBS, ROLE_STATS, type ClubDef } from '../data/clubs';
import type { Hex } from './hex';
import { PITCH_COLS } from './hex';
import type { MatchState, Robot, TeamId } from './types';

export interface MatchOptions {
  seed: number;
  home?: ClubDef;
  away?: ClubDef;
  /** Which team kicks off the first half. Defaults to home. */
  kickoff?: TeamId;
}

export const CENTRE: Hex = { col: 6, row: 4 };

/**
 * Kick-off formation for a team that attacks East. Away mirrors it.
 * Order follows the squad list: Keeper, Defender, Midfielder, Midfielder, Striker.
 */
function formation(kickingOff: boolean): Hex[] {
  return [
    { col: 0, row: 4 },
    { col: 2, row: 4 },
    { col: 3, row: 2 },
    { col: 3, row: 6 },
    kickingOff ? CENTRE : { col: 4, row: 4 },
  ];
}

const mirror = (h: Hex): Hex => ({ col: PITCH_COLS - 1 - h.col, row: h.row });

export function kickoffPositions(team: TeamId, kickingOff: boolean): Hex[] {
  const f = formation(kickingOff);
  return team === 'home' ? f : f.map(mirror);
}

/** Puts both teams back in formation and gives the ball to the kicking-off striker. */
export function resetForKickoff(state: MatchState, kickoff: TeamId): void {
  for (const team of ['home', 'away'] as TeamId[]) {
    const spots = kickoffPositions(team, team === kickoff);
    state.robots
      .filter((r) => r.team === team)
      .forEach((r, i) => {
        r.pos = spots[i];
      });
  }
  const striker = state.robots.find((r) => r.team === kickoff && r.role === 'Striker');
  state.ball = { state: 'held', by: striker!.id };
}

function buildTeam(club: ClubDef, team: TeamId): Robot[] {
  return club.players.map((p, i) => ({
    id: `${team}-${i}`,
    team,
    name: p.name,
    role: p.role,
    core: p.core,
    stats: { ...(p.stats ?? ROLE_STATS[p.role]) },
    pos: { col: 0, row: 0 },
    tick: 0,
    overheatUntil: null,
  }));
}

export function createMatch(options: MatchOptions): MatchState {
  const home = options.home ?? CLUBS[0];
  const away = options.away ?? CLUBS[1];
  const kickoff = options.kickoff ?? 'home';
  const state: MatchState = {
    seed: options.seed,
    rngState: options.seed >>> 0,
    clock: 0,
    half: 1,
    over: false,
    score: { home: 0, away: 0 },
    robots: [...buildTeam(home, 'home'), ...buildTeam(away, 'away')],
    ball: { state: 'loose', at: CENTRE },
    tieFlip: kickoff === 'home' ? 'away' : 'home',
    firstKickoff: kickoff,
    log: [],
  };
  resetForKickoff(state, kickoff);
  return state;
}
