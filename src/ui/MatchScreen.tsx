import { useEffect, useMemo, useState } from 'react';
import {
  activeRobot,
  createMatch,
  createSimpleAI,
  legalActions,
  robotById,
  RULES,
  sameHex,
  type Action,
  type Hex,
  type MatchState,
  type PassKind,
} from '../engine';
import { describe } from '../game/describe';
import { isHumanTurn, tryStep, type Answer, type Question } from '../game/session';
import { Pitch, type Highlight } from './Pitch';
import { Timeline } from './Timeline';

const HUMAN = 'home';
const AI_DELAY_MS = 450;

type Mode = 'move' | PassKind;

const REACTION_WORDS = {
  intercept: 'intercept the pass',
  challenge: 'challenge the carrier',
  block: 'block the shot',
  dive: 'dive for the shot',
} as const;

export function MatchScreen() {
  const [seed, setSeed] = useState(() => Date.now() % 1_000_000);
  const ai = useMemo(() => createSimpleAI(seed), [seed]);
  const [state, setState] = useState<MatchState>(() => createMatch({ seed }));
  const [answers, setAnswers] = useState<Answer[]>([]);
  const [held, setHeld] = useState<Action | undefined>();
  const [question, setQuestion] = useState<Question | null>(null);
  const [mode, setMode] = useState<Mode>('move');

  function advance(action?: Action, given: Answer[] = answers) {
    const res = tryStep(state, HUMAN, ai, given, action);
    if (res.question) {
      if (res.question.kind === 'action') return; // our turn: wait for a click
      setHeld(action);
      setAnswers(given);
      setQuestion(res.question);
      return;
    }
    setState(res.state);
    setAnswers([]);
    setHeld(undefined);
    setQuestion(null);
    setMode('move');
  }

  const answer = (a: Answer) => advance(held, [...answers, a]);

  // The AI's turns and ball landings play out on their own.
  useEffect(() => {
    if (state.over || question || isHumanTurn(state, HUMAN)) return;
    const t = setTimeout(() => advance(), AI_DELAY_MS);
    return () => clearTimeout(t);
  });

  function newMatch() {
    const next = Date.now() % 1_000_000;
    setSeed(next);
    setState(createMatch({ seed: next }));
    setAnswers([]);
    setHeld(undefined);
    setQuestion(null);
  }

  const myTurn = !question && isHumanTurn(state, HUMAN);
  const me = myTurn ? activeRobot(state) : undefined;
  const legal = me ? legalActions(state, me.id) : [];
  const of = <T extends Action['type']>(t: T) => legal.filter((a): a is Extract<Action, { type: T }> => a.type === t);

  const highlights: Highlight[] = [];
  if (me && mode === 'move') {
    for (const a of of('move')) highlights.push({ hex: a.to, tone: 'move' });
    for (const a of of('sprint')) highlights.push({ hex: a.to, tone: 'sprint' });
  }
  if (me && mode !== 'move') {
    for (const a of of('pass')) if (a.kind === mode) highlights.push({ hex: a.to, tone: 'target' });
  }

  function onHex(h: Hex) {
    if (!me) return;
    const hit = legal.find(
      (a) =>
        ((mode === 'move' && (a.type === 'move' || a.type === 'sprint')) ||
          (a.type === 'pass' && a.kind === mode)) &&
        'to' in a &&
        sameHex(a.to, h),
    );
    if (hit) advance(hit);
  }

  const log = state.log
    .map((e) => describe(state, e))
    .filter((x): x is string => !!x)
    .slice(-14)
    .reverse();

  return (
    <div className="match">
      <header className="scoreboard">
        <span className="team home">Emberforge {state.score.home}</span>
        <span className="clock">
          {state.half === 1 ? '1st half' : '2nd half'} · tick {state.clock}
        </span>
        <span className="team away">{state.score.away} Tidewell</span>
      </header>

      <Timeline state={state} active={me?.id} />

      <div className="board">
        <Pitch state={state} active={me?.id} highlights={highlights} onHex={onHex} />

        <aside className="side">
          {me && (
            <div className="panel">
              <h3>
                {me.name} <small>({me.role}, {me.core})</small>
              </h3>
              <p className="hint">
                {mode === 'move'
                  ? `Click a green hex to move (${RULES.cost.move} ticks) or a gold hex to sprint (${RULES.cost.sprint}).`
                  : `Click a hex to play a ${mode} pass (${RULES.cost.pass} ticks).`}
              </p>
              <div className="buttons">
                {mode !== 'move' && <button onClick={() => setMode('move')}>Back to moving</button>}
                {of('pass').length > 0 && (
                  <>
                    <button onClick={() => setMode('ground')}>Ground pass</button>
                    <button onClick={() => setMode('lofted')}>Lofted pass</button>
                  </>
                )}
                {of('shoot').map((a) => (
                  <button key={a.kind} className="shoot" onClick={() => advance(a)}>
                    Shoot: {a.kind}
                  </button>
                ))}
                {of('tackle').map((a) => (
                  <button key={a.target} onClick={() => advance(a)}>
                    Tackle {robotById(state, a.target).name} ({RULES.cost.tackle})
                  </button>
                ))}
                {of('intercept').map((a) => (
                  <button key="i" onClick={() => advance(a)}>
                    Intercept ({RULES.cost.intercept})
                  </button>
                ))}
                {of('hold').map((a) => (
                  <button key="h" onClick={() => advance(a)}>
                    Hold ({RULES.cost.hold})
                  </button>
                ))}
              </div>
            </div>
          )}
          {!me && !state.over && !question && <div className="panel hint">Tidewell is playing…</div>}

          <ol className="log">
            {log.map((line, i) => (
              <li key={state.log.length - i}>{line}</li>
            ))}
          </ol>
        </aside>
      </div>

      {question && question.kind === 'reaction' && (
        <div className="modal">
          <div className="card">
            <p>
              {robotById(state, question.robot).name} can {REACTION_WORDS[question.reaction]}. It costs{' '}
              {RULES.cost[question.reaction]} ticks.
            </p>
            <button onClick={() => answer(true)}>React</button>
            <button onClick={() => answer(false)}>Let it go</button>
          </div>
        </div>
      )}

      {question && question.kind === 'corner' && (
        <div className="modal">
          <div className="card close-up">
            <p className="big">{question.as === 'shooter' ? 'Pick your corner!' : 'Your keeper dives. Guess the corner!'}</p>
            {(['left', 'centre', 'right'] as const).map((c) => (
              <button key={c} onClick={() => answer(c)}>
                {c}
              </button>
            ))}
          </div>
        </div>
      )}

      {state.over && (
        <div className="modal">
          <div className="card">
            <p className="big">
              Full time: Emberforge {state.score.home}, Tidewell {state.score.away}
            </p>
            <button onClick={newMatch}>Play again</button>
          </div>
        </div>
      )}
    </div>
  );
}
