// The dice moment: a short cinematic beat over the pitch whenever a pass, shot, tackle, interception or contest is
// rolled. Target first, then every modifier, then the dice tumble and land, hits light up, and the result lands with
// a flourish. Click, tap or press Space to skip ahead; "Quick" plays it in under a second.

import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { RULES } from '../engine';
import type { DiceScene, DiceSide } from '../game/dice-scenes';

export type DiceSpeed = 'dramatic' | 'quick' | 'off';

/** Phase lengths in ms: intro (target + modifiers), each camp's roll, then the result. */
const TIMING = {
  dramatic: { intro: 500, roll: 650, result: 900 },
  quick: { intro: 180, roll: 420, result: 520 },
} as const;

/** Cube rotation that brings each face to the front (faces are laid out in .die-cube CSS). */
const FACE_ROT: Record<number, [number, number]> = {
  1: [0, 0],
  2: [-90, 0],
  3: [0, -90],
  4: [0, 90],
  5: [90, 0],
  6: [0, 180],
};

const PIPS: Record<number, number[]> = {
  1: [4],
  2: [0, 8],
  3: [0, 4, 8],
  4: [0, 2, 6, 8],
  5: [0, 2, 4, 6, 8],
  6: [0, 2, 3, 5, 6, 8],
};

function Face({ n }: { n: number }) {
  return (
    <div className={`die-face f${n}`}>
      {Array.from({ length: 9 }, (_, i) => (
        <span key={i} className={PIPS[n].includes(i) ? 'pip' : ''} />
      ))}
    </div>
  );
}

function Die({ value, state, index }: { value: number; state: 'waiting' | 'rolling' | 'landed'; index: number }) {
  const [x, y] = FACE_ROT[value];
  // Every die spins a little differently, decided by its slot so a replay looks the same.
  const style = {
    '--fx': `${x}deg`,
    '--fy': `${y}deg`,
    '--sx': `${720 + ((index * 137) % 3) * 90}deg`,
    '--sy': `${-1080 - ((index * 71) % 4) * 90}deg`,
    '--delay': `${index * 45}ms`,
  } as CSSProperties;
  const hit = value >= RULES.hitOn;
  return (
    <div className={`die ${state} ${state === 'landed' ? (hit ? 'hit' : 'miss') : ''} ${value === 6 ? 'six' : ''}`} style={style}>
      <div className="die-drop">
        <div className="die-cube">
          {[1, 2, 3, 4, 5, 6].map((n) => (
            <Face key={n} n={n} />
          ))}
        </div>
      </div>
    </div>
  );
}

const signed = (v: number) => (v > 0 ? `+${v}` : `−${Math.abs(v)}`);

function Camp({ side, state }: { side: DiceSide; state: 'waiting' | 'rolling' | 'landed' }) {
  const pool = side.dice.length;
  const total = side.base + side.mods.reduce((n, m) => n + m.value, 0);
  return (
    <div className={`dice-camp ${side.team} ${state}`}>
      <div className="camp-plate">
        <span className="camp-name">{side.name}</span>
        <span className="camp-role">{side.role}</span>
      </div>
      <ul className="camp-mods">
        <li>
          <span>{side.baseLabel}</span>
          <b>{side.base}</b>
        </li>
        {side.mods.map((m) => (
          <li key={m.label} className={m.value > 0 ? 'up' : 'down'}>
            <span>{m.label}</span>
            <b>{signed(m.value)}</b>
          </li>
        ))}
        {/* Experience and Links come with upgrades between matches; shown now so the slot is familiar. */}
        <li className="later">
          <span>Experience</span>
          <b>+0</b>
        </li>
        <li className="later">
          <span>Link</span>
          <b>+0</b>
        </li>
        {total < pool && (
          <li className="later">
            <span>Never fewer than</span>
            <b>1</b>
          </li>
        )}
      </ul>
      <div className="camp-dice" aria-label={`${pool} dice`}>
        {side.dice.map((v, i) => (
          <Die key={i} value={v} state={state} index={i} />
        ))}
      </div>
      <div className="camp-hits">
        {state === 'landed' ? (
          <>
            <b>{side.hits}</b> {side.hits === 1 ? 'hit' : 'hits'}
          </>
        ) : (
          <>
            {pool} {pool === 1 ? 'die' : 'dice'} · {RULES.hitOn}+ hits
          </>
        )}
      </div>
      {state === 'landed' && side.crit && <div className="camp-stamp crit">Critical!</div>}
      {state === 'landed' && side.fumble && <div className="camp-stamp fumble">Fumble</div>}
    </div>
  );
}

/**
 * Plays a queue of dice scenes one after another, then calls `onDone`.
 * `human` is the player's team, so the result flourish is gold when it goes your way.
 */
export function DiceMoment({
  scenes,
  speed,
  human,
  onDone,
}: {
  scenes: DiceScene[];
  speed: Exclude<DiceSpeed, 'off'>;
  human: string;
  onDone: () => void;
}) {
  const [index, setIndex] = useState(0);
  // 0 intro · 1 first camp rolling · 2 second camp rolling · 3 result
  const [phase, setPhase] = useState(0);
  const scene = scenes[index];
  const doneRef = useRef(onDone);
  doneRef.current = onDone;
  const t = TIMING[speed];
  const opposed = scene ? scene.split > 0 : false;

  const next = () => {
    if (index + 1 < scenes.length) {
      setIndex(index + 1);
      setPhase(0);
    } else doneRef.current();
  };

  useEffect(() => {
    if (!scene) return;
    let wait: number;
    let then: () => void;
    if (phase === 0) {
      wait = t.intro;
      then = () => setPhase(1);
    } else if (phase === 1) {
      wait = t.roll;
      // Quick mode rolls both camps together.
      then = () => setPhase(opposed && speed === 'dramatic' ? 2 : 3);
    } else if (phase === 2) {
      wait = t.roll;
      then = () => setPhase(3);
    } else {
      wait = t.result;
      then = next;
    }
    const id = window.setTimeout(then, wait);
    return () => window.clearTimeout(id);
    // Only a new scene or phase restarts the timer; re-renders of the match screen must not.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index, phase, scene]);

  const skip = () => {
    if (phase < 3) setPhase(3);
    else next();
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code === 'Space' || e.code === 'Enter' || e.code === 'Escape') {
        e.preventDefault();
        skip();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  if (!scene) return null;

  const campState = (camp: 0 | 1): 'waiting' | 'rolling' | 'landed' => {
    if (phase === 3) return 'landed';
    if (camp === 0) return phase >= 2 ? 'landed' : phase === 1 ? 'rolling' : 'waiting';
    if (speed === 'quick') return phase === 1 ? 'rolling' : 'waiting';
    return phase === 2 ? 'rolling' : 'waiting';
  };

  const left = scene.split > 0 ? scene.sides.slice(0, scene.split) : scene.sides;
  const right = scene.split > 0 ? scene.sides.slice(scene.split) : [];
  const tone = scene.winner === null ? 'even' : scene.winner === human ? 'good' : 'bad';
  const anyCrit = phase === 3 && scene.sides.some((s) => s.crit);

  return (
    <div
      className={`dice-moment ${speed} kind-${scene.kind} ${phase === 3 ? 'resolved' : ''}`}
      onClick={skip}
      role="dialog"
      aria-live="polite"
      aria-label={`${scene.title}: ${scene.target}`}
    >
      <div className="dm-bar top" />
      <div className="dm-bar bottom" />
      <div className="dm-lines" />
      <div className="dm-head">
        <div className="dm-title">{scene.title}</div>
        <div className="dm-target">{scene.target}</div>
      </div>
      <div className={`dm-arena ${right.length ? 'two' : 'one'}`}>
        <div className="dm-side">
          {left.map((s) => (
            <Camp key={s.robot} side={s} state={campState(0)} />
          ))}
        </div>
        {right.length > 0 && <div className="dm-vs">VS</div>}
        {right.length > 0 && (
          <div className={`dm-side ${right.length > 1 ? 'many' : ''}`}>
            {right.map((s) => (
              <Camp key={s.robot} side={s} state={campState(1)} />
            ))}
            {right.length > 1 && campState(1) === 'landed' && (
              <div className="dm-total">
                Defence total <b>{right.reduce((n, s) => n + s.hits, 0)}</b>
              </div>
            )}
          </div>
        )}
      </div>
      <div className={`dm-result ${phase === 3 ? 'show' : ''} ${tone} ${anyCrit ? 'crit' : ''}`}>
        {phase === 3 && (
          <>
            <span className="dm-burst" />
            <span className="dm-result-text">{scene.result}</span>
          </>
        )}
      </div>
      <div className="dm-skip">
        {scenes.length > 1 ? `${index + 1} / ${scenes.length} · ` : ''}Click or Space to skip
      </div>
    </div>
  );
}
