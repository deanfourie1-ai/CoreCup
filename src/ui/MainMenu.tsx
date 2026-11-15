import { useEffect, useRef, useState } from 'react';
import { CLUBS, type ClubDef } from '../data/clubs';
import './menu.css';

const ART = `${import.meta.env.BASE_URL}menu/`;

interface MenuItem {
  id: string;
  label: string;
  detail: string;
  ready: boolean;
  note: string;
}

const ITEMS: MenuItem[] = [
  { id: 'kickoff', label: 'Kick Off', detail: 'Emberforge vs Tidewell AI', ready: true, note: '' },
  { id: 'squad', label: 'Squad', detail: 'Your five', ready: false, note: 'The squad screen is designed but not built yet.' },
  { id: 'workshop', label: 'Workshop', detail: 'Upgrades', ready: false, note: 'Upgrades between matches are designed but not built yet.' },
  { id: 'rivalry', label: 'Rivalry Series', detail: 'Best of five', ready: false, note: 'The Rivalry Series is designed but not built yet.' },
  { id: 'story', label: 'Story', detail: 'Club arcs', ready: false, note: 'Story arcs are planned for later.' },
];

/** Portrait art per creature core. Only cores with approved sheet art are listed. */
const PORTRAITS: Record<string, string> = {
  Golem: 'portrait-golem.webp',
  Qilin: 'portrait-qilin.webp',
  Anansi: 'portrait-anansi.webp',
  Kitsune: 'portrait-kitsune.webp',
  Phoenix: 'portrait-phoenix.webp',
};

const ROLE_SHORT: Record<string, string> = { Keeper: 'GK', Defender: 'DF', Midfielder: 'MF', Striker: 'FW' };

export function MainMenu({ onKickOff }: { onKickOff: () => void }) {
  const [note, setNote] = useState('');
  const home = CLUBS[0];
  const away = CLUBS[1];

  function choose(item: MenuItem) {
    if (item.id === 'kickoff') onKickOff();
    else setNote(item.note);
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const n = Number(e.key);
      if (n >= 1 && n <= ITEMS.length) choose(ITEMS[n - 1]);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  return (
    <div className="mm">
      <div className="mm-hero" aria-hidden="true">
        <img src={`${ART}key-art-kitsune.webp`} alt="" />
      </div>
      <Embers />
      <div className="mm-shade" aria-hidden="true" />

      <div className="mm-layout">
        <section className="mm-left">
          <Logo />
          <p className="mm-tag">Creature-core football. Five a side, one hex pitch, one clock.</p>

          <nav className="mm-menu" aria-label="Main menu">
            {ITEMS.map((item, i) => (
              <button
                key={item.id}
                className={`mm-btn${item.id === 'kickoff' ? ' primary' : ''}${item.ready ? '' : ' locked'}`}
                aria-disabled={!item.ready}
                autoFocus={item.id === 'kickoff'}
                onClick={() => choose(item)}
              >
                <span className="mm-key">{i + 1}</span>
                <span className="mm-label">{item.label}</span>
                <span className="mm-detail">{item.detail}</span>
                {!item.ready && <span className="mm-soon">Coming later</span>}
              </button>
            ))}
          </nav>
          <p className="mm-note" role="status" aria-live="polite">
            {note}
          </p>
          <a className="mm-lab" href="sprite-lab.html">
            Sprite Lab (art test)
          </a>
        </section>

        <section className="mm-right">
          <Fixture home={home} away={away} />
        </section>

        <section className="mm-squad" aria-label="Your starting five">
          <h2 className="mm-heading">
            <span>{home.name}</span> starting five
          </h2>
          <div className="mm-strip">
            {home.players.map((p) => (
              <figure key={p.name} className={`mm-player${p.core === 'Kitsune' ? ' star' : ''}`}>
                <div className="mm-frame">
                  {PORTRAITS[p.core] ? (
                    <img src={`${ART}${PORTRAITS[p.core]}`} alt="" />
                  ) : (
                    <div className="mm-blank" />
                  )}
                  <span className="mm-pos">{ROLE_SHORT[p.role]}</span>
                </div>
                <figcaption>
                  <strong>{p.name}</strong>
                  <small>{p.core} core</small>
                </figcaption>
              </figure>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}

function Logo() {
  return (
    <h1 className="mm-logo" aria-label="Core Cup">
      <svg viewBox="0 0 64 64" className="mm-emblem" aria-hidden="true">
        <defs>
          <radialGradient id="mm-core" cx="0.5" cy="0.45">
            <stop offset="0" stopColor="#fff6d8" />
            <stop offset="0.35" stopColor="#ffb347" />
            <stop offset="1" stopColor="#ff4f8b" />
          </radialGradient>
        </defs>
        <polygon points="32,3 57,17.5 57,46.5 32,61 7,46.5 7,17.5" fill="#2a1030" stroke="#f2c25a" strokeWidth="3" />
        <polygon points="32,12 49,22 49,42 32,52 15,42 15,22" fill="none" stroke="#ff6f9e" strokeWidth="1.5" opacity="0.7" />
        <circle cx="32" cy="32" r="10" fill="url(#mm-core)" />
      </svg>
      <span className="mm-word">
        <span className="core">Core</span>
        <span className="cup">Cup</span>
      </span>
    </h1>
  );
}

function Crest({ club }: { club: ClubDef }) {
  return (
    <svg viewBox="0 0 48 56" className="mm-crest" aria-hidden="true">
      <path d="M24 2 L45 10 L45 30 Q45 46 24 54 Q3 46 3 30 L3 10 Z" fill={club.colour} stroke="#f2c25a" strokeWidth="2.5" />
      <path d="M24 9 L38 14.5 L38 30 Q38 41 24 47 Q10 41 10 30 L10 14.5 Z" fill="rgba(0,0,0,0.25)" />
      <text x="24" y="35" textAnchor="middle" fontSize="18" fontWeight="900" fontStyle="italic" fill="#fff4dc">
        {club.name[0]}
      </text>
    </svg>
  );
}

function Fixture({ home, away }: { home: ClubDef; away: ClubDef }) {
  return (
    <div className="mm-fixture">
      <div className="mm-fixture-head">Next match · Friendly vs AI</div>
      <div className="mm-fixture-row">
        <div className="mm-club">
          <Crest club={home} />
          <span>{home.name}</span>
          <small>You</small>
        </div>
        <span className="mm-vs">VS</span>
        <div className="mm-club">
          <Crest club={away} />
          <span>{away.name}</span>
          <small>AI</small>
        </div>
      </div>
      <div className="mm-fixture-foot">5 a side · 13×9 hex pitch · 60-tick clock</div>
    </div>
  );
}

/** Foxfire sparks drifting up over the menu. Static when reduced motion is on. */
function Embers() {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    const ctx = c.getContext('2d');
    if (!ctx) return;
    const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
    let w = 0;
    let h = 0;
    let raf = 0;
    type P = { x: number; y: number; r: number; vy: number; sway: number; ph: number; hue: number };
    let parts: P[] = [];
    const spawn = (anyY: boolean): P => ({
      x: Math.random() * w,
      y: anyY ? Math.random() * h : h + 10,
      r: Math.random() * 2.2 + 0.6,
      vy: Math.random() * 0.5 + 0.25,
      sway: Math.random() * 0.8 + 0.2,
      ph: Math.random() * Math.PI * 2,
      hue: Math.random() < 0.7 ? 330 : 28,
    });
    const size = () => {
      const d = Math.min(devicePixelRatio || 1, 2);
      w = c.clientWidth;
      h = c.clientHeight;
      c.width = w * d;
      c.height = h * d;
      ctx.setTransform(d, 0, 0, d, 0, 0);
      parts = Array.from({ length: Math.round((w * h) / 14000) }, () => spawn(true));
    };
    const draw = (t: number) => {
      ctx.clearRect(0, 0, w, h);
      ctx.globalCompositeOperation = 'lighter';
      for (const p of parts) {
        if (!reduce) {
          p.y -= p.vy;
          p.x += Math.sin(t / 900 + p.ph) * p.sway * 0.4;
          if (p.y < -10) Object.assign(p, spawn(false));
        }
        const a = Math.min(1, p.y / h + 0.15) * (0.55 + 0.45 * Math.sin(t / 300 + p.ph));
        const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.r * 4);
        g.addColorStop(0, `hsla(${p.hue},100%,80%,${a})`);
        g.addColorStop(1, `hsla(${p.hue},100%,60%,0)`);
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r * 4, 0, Math.PI * 2);
        ctx.fill();
      }
      if (!reduce) raf = requestAnimationFrame(draw);
    };
    size();
    addEventListener('resize', size);
    raf = requestAnimationFrame(draw);
    return () => {
      cancelAnimationFrame(raf);
      removeEventListener('resize', size);
    };
  }, []);
  return <canvas ref={ref} className="mm-embers" aria-hidden="true" />;
}
