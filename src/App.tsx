import { useState } from 'react';
import { MainMenu } from './ui/MainMenu';
import { MatchScreen } from './ui/MatchScreen';

type Screen = 'menu' | 'match';

export function App() {
  const [screen, setScreen] = useState<Screen>('menu');

  if (screen === 'menu') return <MainMenu onKickOff={() => setScreen('match')} />;

  return (
    <main className="page match-page">
      <div className="match-bar">
        <button onClick={() => setScreen('menu')}>◂ Main menu</button>
        <h1 className="title">Core Cup</h1>
        <p className="subtitle">You coach Emberforge Foundry against the Tidewell Mariners AI.</p>
      </div>
      <MatchScreen />
    </main>
  );
}
