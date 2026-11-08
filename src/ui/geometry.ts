import { PITCH_COLS, PITCH_ROWS, type Hex } from '../engine';

export const R = 26; // hex radius in pixels
const W = Math.sqrt(3) * R;
export const PAD = 8;
export const BOARD_W = Math.ceil(W * (PITCH_COLS + 0.5) + PAD * 2);
export const BOARD_H = Math.ceil(R * 1.5 * (PITCH_ROWS - 1) + R * 2 + PAD * 2);

export function centre(h: Hex): { x: number; y: number } {
  return {
    x: PAD + W / 2 + W * (h.col + 0.5 * (h.row & 1)),
    y: PAD + R + R * 1.5 * h.row,
  };
}

export function hexPoints(h: Hex, r = R): string {
  const { x, y } = centre(h);
  return Array.from({ length: 6 }, (_, i) => {
    const a = (Math.PI / 180) * (60 * i - 30);
    return `${(x + r * Math.cos(a)).toFixed(1)},${(y + r * Math.sin(a)).toFixed(1)}`;
  }).join(' ');
}
