// Bridges the synchronous engine and a person clicking buttons.
//
// The engine asks its coaches for choices in the middle of a step (a reaction,
// a corner). A person can't answer instantly, so the human coach throws when it
// meets a question it has no answer for. The screen shows the question, records
// the answer, and runs the same step again from the same state. Steps are pure
// and seeded, so the re-run plays out identically up to the new answer.

import {
  activeRobot,
  peekNext,
  step,
  type Action,
  type Controller,
  type Corner,
  type MatchState,
  type ReactionKind,
  type TeamId,
} from '../engine';

export type Question =
  | { kind: 'action'; robot: string }
  | { kind: 'reaction'; robot: string; reaction: ReactionKind }
  | { kind: 'corner'; robot: string; as: 'shooter' | 'keeper' };

export type Answer = boolean | Corner;

class NeedsAnswer extends Error {
  constructor(public question: Question) {
    super('needs answer');
  }
}

function humanCoach(answers: Answer[], action?: Action): Controller {
  let next = 0;
  const take = (q: Question) => {
    if (next < answers.length) return answers[next++];
    throw new NeedsAnswer(q);
  };
  return {
    chooseAction: (_s, r) => {
      if (!action) throw new NeedsAnswer({ kind: 'action', robot: r.id });
      return action;
    },
    chooseReaction: (_s, r, reaction) => take({ kind: 'reaction', robot: r.id, reaction }) as boolean,
    chooseCorner: (_s, r, as) => take({ kind: 'corner', robot: r.id, as }) as Corner,
  };
}

export type StepResult = { state: MatchState; question?: undefined } | { state?: undefined; question: Question };

/**
 * Tries to advance one event. Returns the new state, or the question the
 * human coach must answer first.
 */
export function tryStep(
  state: MatchState,
  human: TeamId,
  ai: Controller,
  answers: Answer[],
  action?: Action,
): StepResult {
  const coach = humanCoach(answers, action);
  const controllers = human === 'home' ? { home: coach, away: ai } : { home: ai, away: coach };
  try {
    return { state: step(state, controllers) };
  } catch (e) {
    if (e instanceof NeedsAnswer) return { question: e.question };
    throw e;
  }
}

/** True when the next event is the human team's robot choosing an action. */
export function isHumanTurn(state: MatchState, human: TeamId): boolean {
  return peekNext(state).kind === 'robot' && activeRobot(state)?.team === human;
}
