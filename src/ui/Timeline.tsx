import { RULES, type MatchState } from '../engine';

/** The shared track: every robot's token and, when it's flying, the ball. */
export function Timeline({ state, active }: { state: MatchState; active?: string }) {
  const max = RULES.matchLength;
  const pct = (t: number) => `${(Math.min(t, max) / max) * 100}%`;
  const stacks = new Map<number, number>();
  const lane = (raw: number) => {
    const t = Math.min(raw, max);
    const n = stacks.get(t) ?? 0;
    stacks.set(t, n + 1);
    return n;
  };
  const flight = state.ball.state === 'flight' ? state.ball.flight : undefined;
  const ticks = [...state.robots.map((r) => Math.min(r.tick, max)), ...(flight ? [Math.min(flight.landTick, max)] : [])];
  const tallest = Math.max(...[...new Set(ticks)].map((t) => ticks.filter((x) => x === t).length));
  return (
    <div className="timeline" aria-label="Timeline">
      <div className="track" style={{ height: 12 + tallest * 18 }}>
        <div className="now" style={{ left: pct(state.clock) }} />
        <div className="half" style={{ left: pct(RULES.halfLength) }} />
        {[...state.robots]
          .sort((a, b) => a.tick - b.tick)
          .map((r) => (
            <div
              key={r.id}
              className={`token ${r.team} ${r.id === active ? 'active' : ''}`}
              style={{ left: pct(r.tick), top: 6 + lane(r.tick) * 18 }}
              title={`${r.name}: tick ${r.tick}`}
            >
              {r.name.split(' ')[0]}
            </div>
          ))}
        {flight && (
          <div className="token ball-token" style={{ left: pct(flight.landTick), top: 6 + lane(flight.landTick) * 18 }}>
            Ball
          </div>
        )}
      </div>
      <div className="scale">
        <span>0</span>
        <span>Half</span>
        <span>{max}</span>
      </div>
    </div>
  );
}
