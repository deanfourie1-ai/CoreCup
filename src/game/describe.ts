// Turns engine events into plain sentences for the match log.

import { robotById, type MatchEvent, type MatchState } from '../engine';

const KIND_WORDS: Record<string, string> = {
  intercept: 'goes for the interception',
  challenge: 'challenges',
  block: 'throws in a block',
  dive: 'dives',
};

export function describe(s: MatchState, e: MatchEvent): string | null {
  const name = (id: string) => robotById(s, id).name;
  switch (e.t) {
    case 'action': {
      const a = e.action;
      const who = name(a.robot);
      switch (a.type) {
        case 'move':
          return `${who} moves.`;
        case 'sprint':
          return `${who} sprints.`;
        case 'pass':
          return `${who} plays a ${a.kind} pass.`;
        case 'shoot':
          return `${who} shoots, a ${a.kind} shot!`;
        case 'tackle':
          return `${who} tackles ${name(a.target)}.`;
        case 'intercept':
          return `${who} steps in to intercept.`;
        case 'hold':
          return `${who} holds.`;
      }
      return null;
    }
    case 'reaction':
      return `${name(e.robot)} reacts and ${KIND_WORDS[e.kind]}.`;
    case 'roll':
      return `${name(e.robot)} rolls for ${e.purpose}: ${e.dice.join(' ')} (${e.hits} ${e.hits === 1 ? 'hit' : 'hits'}).`;
    case 'possession':
      return e.robot ? `${name(e.robot)} has the ball.` : 'The ball is loose!';
    case 'shot':
      return {
        goal: 'GOAL!',
        post: 'Off the post!',
        cleared: 'Cleared away!',
        save: 'What a save!',
      }[e.outcome];
    case 'goal':
      return `Score: ${e.score.home} to ${e.score.away}.`;
    case 'halftime':
      return 'Half time.';
    case 'fulltime':
      return `Full time: ${e.score.home} to ${e.score.away}.`;
  }
}
