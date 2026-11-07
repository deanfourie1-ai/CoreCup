import { useState } from 'react';
import { CLUBS } from './data/clubs';
import { rollPool, type PoolRoll } from './engine/dice';
import { createRng } from './engine/rng';

const rng = createRng(Date.now());

export function App() {
  const [roll, setRoll] = useState<PoolRoll | null>(null);

  return (
    <main className="page">
      <header className="hero">
        <h1>Core Cup</h1>
        <p>Tactical football with robot athletes and mythological cores.</p>
      </header>

      <section className="clubs">
        {CLUBS.map((club) => (
          <article key={club.id} className="club" style={{ borderColor: club.colour }}>
            <h2 style={{ color: club.colour }}>{club.name}</h2>
            <p className="tagline">{club.tagline}</p>
            <ul>
              {club.players.map((p) => (
                <li key={p.name}>
                  <span className="role">{p.role}</span>
                  <span>{p.name}</span>
                  <span className="core">{p.core}</span>
                </li>
              ))}
            </ul>
          </article>
        ))}
      </section>

      <section className="dice">
        <button onClick={() => setRoll(rollPool(rng, 5))}>Roll 5 dice</button>
        {roll && (
          <p>
            {roll.dice.map((d, i) => (
              <span key={i} className={d >= 4 ? 'die hit' : 'die'}>
                {d}
              </span>
            ))}
            <strong>
              {roll.hits} {roll.hits === 1 ? 'hit' : 'hits'}
            </strong>
          </p>
        )}
      </section>

      <footer>Step 1 of the build plan: project setup. Next up: the hex pitch.</footer>
    </main>
  );
}
