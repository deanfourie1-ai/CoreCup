import { goalArea, hexKey, targetGoal, PITCH_COLS, PITCH_ROWS, type Hex, type MatchState } from '../engine';
import { BOARD_H, BOARD_W, centre, hexPoints, R } from './geometry';

export interface Highlight {
  hex: Hex;
  tone: 'move' | 'sprint' | 'target';
}

const ROLE_LETTER = { Keeper: 'K', Defender: 'D', Midfielder: 'M', Striker: 'S' } as const;

export function Pitch(props: {
  state: MatchState;
  active?: string;
  highlights: Highlight[];
  onHex: (h: Hex) => void;
}) {
  const { state, active, highlights, onHex } = props;
  const marks = new Map(highlights.map((h) => [hexKey(h.hex), h.tone]));
  const goalHexes = new Set([...goalArea('home'), ...goalArea('away')].map(hexKey));
  const hexes: Hex[] = [];
  for (let row = 0; row < PITCH_ROWS; row++) for (let col = 0; col < PITCH_COLS; col++) hexes.push({ col, row });

  const ball = state.ball;
  const holder = ball.state === 'held' ? state.robots.find((r) => r.id === ball.by) : undefined;
  const ballAt = ball.state === 'loose' ? ball.at : holder?.pos;
  const flight = ball.state === 'flight' ? ball.flight : undefined;
  const landing = flight && { at: flight.type === 'pass' ? flight.to : targetGoal(flight.team), tick: flight.landTick };

  return (
    <svg className="pitch" viewBox={`0 0 ${BOARD_W} ${BOARD_H}`} role="img" aria-label="The pitch">
      {hexes.map((h) => {
        const tone = marks.get(hexKey(h));
        const goalLine = (h.col === 0 || h.col === PITCH_COLS - 1) && h.row >= 3 && h.row <= 5;
        const cls = ['hex', goalHexes.has(hexKey(h)) ? 'area' : '', goalLine ? 'goal' : '', tone ?? ''].join(' ');
        return <polygon key={hexKey(h)} className={cls} points={hexPoints(h, R - 1)} onClick={() => onHex(h)} />;
      })}

      {landing && (
        <g className="landing">
          <polygon points={hexPoints(landing.at, R - 4)} />
          <text {...centre(landing.at)} dy={4}>
            t{landing.tick}
          </text>
        </g>
      )}

      {state.robots.map((r) => {
        const { x, y } = centre(r.pos);
        return (
          <g
            key={r.id}
            className={`robot ${r.team} ${r.id === active ? 'active' : ''}`}
            onClick={() => onHex(r.pos)}
          >
            <circle cx={x} cy={y} r={R * 0.62} />
            <text x={x} y={y + 5}>
              {ROLE_LETTER[r.role]}
            </text>
            <title>
              {r.name} ({r.role}, {r.core}) tick {r.tick}
            </title>
          </g>
        );
      })}

      {ballAt && (
        <circle className="ball" cx={centre(ballAt).x + R * 0.45} cy={centre(ballAt).y - R * 0.45} r={6} />
      )}
    </svg>
  );
}
