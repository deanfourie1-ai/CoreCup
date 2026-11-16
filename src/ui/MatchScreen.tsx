import { useEffect, useMemo, useRef, useState } from 'react';
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
import { autopilotAction } from '../game/autopilot';
import { describe } from '../game/describe';
import { diceScenes, type DiceScene } from '../game/dice-scenes';
import { suggestPasses } from '../game/passes';
import { isHumanTurn, tryStep, type Answer, type Question } from '../game/session';
import type { MatchStage } from '../match/stage';
import { DiceMoment, type DiceSpeed } from './DiceMoment';
import { MatchStageView } from './MatchStageView';
import type { Highlight } from './Pitch';
import { Timeline } from './Timeline';

const HUMAN = 'home';
/** Pause after the pitch settles before the AI acts, so each move can be followed. */
const AI_DELAY_MS = 350;
/** Autopilot turns are routine shape moves, so they go quicker than the AI's. */
const AUTO_DELAY_MS = 160;

interface Settings {
  dice: DiceSpeed;
  alwaysReact: boolean;
  autopilot: boolean;
}

const DEFAULT_SETTINGS: Settings = { dice: 'dramatic', alwaysReact: false, autopilot: true };
const SETTINGS_KEY = 'corecup.match.settings';

function loadSettings(): Settings {
  try {
    return { ...DEFAULT_SETTINGS, ...JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? '{}') };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

function Seg<T extends string | boolean>(props: { value: T; options: [T, string][]; onChange: (v: T) => void }) {
  return (
    <span className="seg">
      {props.options.map(([v, label]) => (
        <button key={String(v)} className={v === props.value ? 'on' : ''} onClick={() => props.onChange(v)}>
          {label}
        </button>
      ))}
    </span>
  );
}

type Mode = 'move' | PassKind;
type Coin = 'heads' | 'tails';

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
  /** The coin toss before kick-off: null until called, then what the coin showed and who won. */
  const [toss, setToss] = useState<{ call: Coin; landed: Coin; won: boolean } | null>(null);
  const [tossDone, setTossDone] = useState(false);
  const [answers, setAnswers] = useState<Answer[]>([]);
  const [held, setHeld] = useState<Action | undefined>();
  const [question, setQuestion] = useState<Question | null>(null);
  const [mode, setMode] = useState<Mode>('move');
  const [settings, setSettings] = useState<Settings>(loadSettings);
  /** Home robots the player has taken off autopilot. */
  const [manual, setManual] = useState<Set<string>>(() => new Set());
  /** Dice moments still to play, and the state the pitch keeps showing until they finish. */
  const [dice, setDice] = useState<{ scenes: DiceScene[]; before: MatchState } | null>(null);
  const stageRef = useRef<MatchStage | null>(null);

  const changeSettings = (patch: Partial<Settings>) => {
    const next = { ...settings, ...patch };
    setSettings(next);
    try {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(next));
    } catch {
      // Private window or blocked storage: the setting still applies for this match.
    }
  };

  function advance(action?: Action, given: Answer[] = answers) {
    const res = tryStep(state, HUMAN, ai, given, action, { alwaysReact: settings.alwaysReact });
    if (res.question) {
      if (res.question.kind === 'action') return; // our turn: wait for a click
      setHeld(action);
      setAnswers(given);
      setQuestion(res.question);
      return;
    }
    if (settings.dice !== 'off') {
      const scenes = diceScenes(res.state, res.state.log.slice(state.log.length));
      if (scenes.length) setDice({ scenes, before: state });
    }
    setState(res.state);
    setAnswers([]);
    setHeld(undefined);
    setQuestion(null);
    setMode('move');
  }

  const answer = (a: Answer) => advance(held, [...answers, a]);

  // Robots the autopilot plays this turn (off-ball shape, keeper at home), unless the player took them over.
  const humanTurn = tossDone && !dice && !question && isHumanTurn(state, HUMAN);
  // activeRobot looks at a copy of the state; take the real robot so identity checks hold.
  const turnRobot = humanTurn ? robotById(state, activeRobot(state)!.id) : undefined;
  const autoAction =
    turnRobot && settings.autopilot && !manual.has(turnRobot.id)
      ? autopilotAction(state, turnRobot, legalActions(state, turnRobot.id))
      : null;

  // The AI's turns, ball landings and autopilot turns play out on their own, each once the pitch has finished
  // showing the last one and any dice moment is over.
  useEffect(() => {
    if (!tossDone || state.over || question || dice) return;
    if (isHumanTurn(state, HUMAN) && !autoAction) return;
    // Off-ball turns (autopilot, or an AI robot while someone holds the ball) don't wait for other runs to finish.
    const next = activeRobot(state);
    const offBall = !!autoAction || (!!next && state.ball.state === 'held' && state.ball.by !== next.id);
    let t: ReturnType<typeof setTimeout>;
    const wait = () => {
      const stage = stageRef.current;
      const blocked = !stage || (offBall ? stage.settling() : stage.busy());
      t = blocked
        ? setTimeout(wait, 60)
        : setTimeout(() => advance(autoAction ?? undefined), offBall ? AUTO_DELAY_MS : AI_DELAY_MS);
    };
    wait();
    return () => clearTimeout(t);
  });

  function newMatch() {
    const next = Date.now() % 1_000_000;
    setSeed(next);
    setState(createMatch({ seed: next }));
    setToss(null);
    setTossDone(false);
    setAnswers([]);
    setHeld(undefined);
    setQuestion(null);
    setDice(null);
  }

  function callToss(call: Coin) {
    const landed: Coin = Math.random() < 0.5 ? 'heads' : 'tails';
    const won = landed === call;
    setToss({ call, landed, won });
    setState(createMatch({ seed, kickoff: won ? HUMAN : 'away', coinToss: true }));
  }

  const me = !autoAction ? turnRobot : undefined;
  const legal = me ? legalActions(state, me.id) : [];
  const of = <T extends Action['type']>(t: T) => legal.filter((a): a is Extract<Action, { type: T }> => a.type === t);
  const passOptions = me && of('pass').length ? suggestPasses(state, me) : [];
  const passFor = (o: (typeof passOptions)[number]) =>
    of('pass').find((a) => a.kind === o.kind && sameHex(a.to, o.to));
  const wait = of('hold')[0];
  /** What the pitch shows: the state before the step while its dice moment is playing. */
  const shown = dice ? dice.before : state;

  const highlights: Highlight[] = [];
  if (me && mode === 'move') {
    for (const a of of('move')) highlights.push({ hex: a.to, tone: 'move' });
    for (const a of of('sprint')) highlights.push({ hex: a.to, tone: 'sprint' });
    // Suggested passes to teammates light up too: one click on a teammate plays it.
    for (const o of passOptions) if (o.receiver) highlights.push({ hex: o.to, tone: 'target' });
  }
  if (me && mode !== 'move') {
    for (const a of of('pass')) if (a.kind === mode) highlights.push({ hex: a.to, tone: 'target' });
  }

  // One-tap Wait: W key (Space is kept for skipping dice).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code === 'KeyW' && wait && !(e.target instanceof HTMLInputElement)) advance(wait);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  function onHex(h: Hex) {
    if (!me) return;
    if (mode === 'move') {
      const o = passOptions.find((p) => p.receiver && sameHex(p.to, h));
      const a = o && passFor(o);
      if (a) return advance(a);
    }
    const hit = legal.find(
      (a) =>
        ((mode === 'move' && (a.type === 'move' || a.type === 'sprint')) ||
          (a.type === 'pass' && a.kind === mode)) &&
        'to' in a &&
        sameHex(a.to, h),
    );
    if (hit) advance(hit);
  }

  const log = shown.log
    .map((e) => describe(shown, e))
    .filter((x): x is string => !!x)
    .slice(-12)
    .reverse();

  return (
    <div className="match">
      <header className="scoreboard">
        <span className="team home">Emberforge {shown.score.home}</span>
        <span className="clock">
          {shown.half === 1 ? '1st half' : '2nd half'} · tick {shown.clock}
        </span>
        <span className="team away">{shown.score.away} Tidewell</span>
      </header>

      <Timeline state={shown} active={me?.id} />

      <div className="arena">
        <div className="stage-wrap">
          <MatchStageView state={shown} active={me?.id} highlights={highlights} onHex={onHex} stageRef={stageRef} />
          {dice && settings.dice !== 'off' && (
            <DiceMoment
              key={dice.before.log.length}
              scenes={dice.scenes}
              speed={settings.dice}
              human={HUMAN}
              onDone={() => setDice(null)}
            />
          )}
        </div>

        <div className="hud">
          {me && (
            <div className="panel actions">
              <h3>
                {me.name} <small>({me.role}, {me.core})</small>
              </h3>
              <p className="hint">
                {mode === 'move'
                  ? `Click a pale blue hex to move (${RULES.cost.move} ticks) or a gold hex to sprint (${RULES.cost.sprint}).${passOptions.some((o) => o.receiver) ? ' Click a pink teammate to pass.' : ''}`
                  : `Click any pink hex to play a ${mode} pass (${RULES.cost.pass} ticks).`}
              </p>
              {wait && (
                <div className="buttons">
                  <button className="wait-btn" onClick={() => advance(wait)} title="Shortcut: W">
                    Wait ({RULES.cost.hold} ticks) · W
                  </button>
                  {settings.autopilot && manual.has(me.id) && (
                    <button
                      onClick={() => {
                        const next = new Set(manual);
                        next.delete(me.id);
                        setManual(next);
                      }}
                    >
                      Back to autopilot
                    </button>
                  )}
                </div>
              )}
              {mode === 'move' && passOptions.length > 0 && (
                <div className="pass-options" aria-label="Suggested passes">
                  {passOptions.map((o) => {
                    const a = passFor(o);
                    return (
                      a && (
                        <button key={`${o.to.col},${o.to.row}`} onClick={() => advance(a)}>
                          <span>
                            {o.label} <small>({o.kind})</small>
                            {o.marked > 0 && <span className="risk"> · marked</span>}
                          </span>
                          <span>
                            {o.need} {o.need === 1 ? 'hit' : 'hits'} · <span className="odds">{Math.round(o.chance * 100)}%</span>
                          </span>
                        </button>
                      )
                    );
                  })}
                </div>
              )}
              <div className="buttons">
                {mode !== 'move' && <button onClick={() => setMode('move')}>Back to moving</button>}
                {of('pass').length > 0 && mode === 'move' && (
                  <>
                    <button onClick={() => setMode('ground')}>Any hex: ground</button>
                    <button onClick={() => setMode('lofted')}>Any hex: lofted</button>
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
              </div>
            </div>
          )}
          {!me && !state.over && !question && (
            <div className="panel actions hint">
              {dice ? 'Rolling…' : autoAction ? `Autopilot: ${turnRobot!.name} keeps the shape…` : 'Tidewell is playing…'}
            </div>
          )}

          <div className="panel settings" aria-label="Match settings">
            <div className="row">
              <span>Team shape</span>
              <Seg value={settings.autopilot} options={[[true, 'Autopilot'], [false, 'I move everyone']]} onChange={(v) => changeSettings({ autopilot: v })} />
            </div>
            {settings.autopilot && (
              <div className="squad-chips" title="Click a player to control them yourself every turn">
                {state.robots
                  .filter((r) => r.team === HUMAN)
                  .map((r) => {
                    const isManual = manual.has(r.id);
                    return (
                      <button
                        key={r.id}
                        className={isManual ? 'manual' : 'auto'}
                        onClick={() => {
                          const next = new Set(manual);
                          if (isManual) next.delete(r.id);
                          else next.add(r.id);
                          setManual(next);
                        }}
                      >
                        {r.name.split(' ')[0]}
                        {r.role === 'Keeper' ? ' (GK)' : ''}: {isManual ? 'you' : 'auto'}
                      </button>
                    );
                  })}
              </div>
            )}
            <div className="row">
              <span>Reactions</span>
              <Seg value={settings.alwaysReact} options={[[false, 'Ask me'], [true, 'Always react']]} onChange={(v) => changeSettings({ alwaysReact: v })} />
            </div>
            <div className="row">
              <span>Dice</span>
              <Seg
                value={settings.dice}
                options={[
                  ['dramatic', 'Dramatic'],
                  ['quick', 'Quick'],
                  ['off', 'Off'],
                ]}
                onChange={(v) => changeSettings({ dice: v })}
              />
            </div>
          </div>

          <ol className="panel log" aria-label="Match log">
            {log.map((line, i) => (
              <li key={state.log.length - i}>{line}</li>
            ))}
          </ol>
        </div>
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

      {!tossDone && (
        <div className="modal">
          <div className="card coin-card">
            <p className="big">Coin toss</p>
            <div className={`coin ${toss ? `flip-${toss.landed}` : ''}`} aria-hidden="true">
              <span className="coin-face heads">H</span>
              <span className="coin-face tails">T</span>
            </div>
            {!toss ? (
              <>
                <p>Call it. The winner kicks off.</p>
                <button onClick={() => callToss('heads')}>Heads</button>
                <button onClick={() => callToss('tails')}>Tails</button>
              </>
            ) : (
              <>
                <p className="coin-result">
                  {toss.landed === 'heads' ? 'Heads' : 'Tails'}!{' '}
                  {toss.won ? 'You win the toss: Emberforge kick off.' : 'Tidewell win the toss and kick off.'}
                </p>
                <button onClick={() => setTossDone(true)}>Kick off</button>
              </>
            )}
          </div>
        </div>
      )}

      {state.over && !dice && (
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
