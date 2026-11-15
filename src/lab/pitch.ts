// The 9-row hex pitch (13 hexes in even rows, 12 in odd rows) as three.js meshes, laid out from the engine's hex grid,
// dressed as the night stadium from the main menu key art: floodlit turf with painted hex lines, team-coloured goal
// areas, gold trim, LED boards, a crowd with phone lights, floodlight towers and a few foxfire sparks in the air.
// Everything is code-drawn (canvas textures and flat unlit meshes) so it sits with the cel-shaded sprites.

import * as THREE from 'three';
import { PITCH_COLS, PITCH_ROWS, inPitch, lastCol, pitchHexes, hexKey, type Hex } from '../engine/hex';
import { goalArea } from '../engine/match';

export const HEX_R = 1; // circumradius in world units
const SQ3 = Math.sqrt(3);

const OFFSET_X = (SQ3 * (PITCH_COLS - 1)) / 2;
const OFFSET_Z = (1.5 * (PITCH_ROWS - 1)) / 2;

/** World position (y = 0 ground) of a hex centre. x grows east, z grows south (towards the camera). */
export function hexToWorld(h: Hex): THREE.Vector3 {
  const x = SQ3 * HEX_R * (h.col + 0.5 * (h.row & 1)) - OFFSET_X;
  const z = 1.5 * HEX_R * h.row - OFFSET_Z;
  return new THREE.Vector3(x, 0, z);
}

/** The hex under a ground point, or null when off the pitch. */
export function worldToHex(x: number, z: number): Hex | null {
  const h = worldToGridHex(x, z);
  return inPitch(h) ? h : null;
}

function worldToGridHex(x: number, z: number): Hex {
  const px = x + OFFSET_X;
  const pz = z + OFFSET_Z;
  const q = ((SQ3 / 3) * px - (1 / 3) * pz) / HEX_R;
  const r = ((2 / 3) * pz) / HEX_R;
  // Cube rounding.
  let rx = Math.round(q);
  let rz = Math.round(r);
  const ry = Math.round(-q - r);
  const dx = Math.abs(rx - q);
  const dy = Math.abs(ry - (-q - r));
  const dz = Math.abs(rz - r);
  if (dx > dy && dx > dz) rx = -ry - rz;
  else if (!(dy > dz)) rz = -rx - ry;
  return { col: rx + (rz - (rz & 1)) / 2, row: rz };
}

/** Goal mouths: rows 3-5 of the end columns (as in the pitch mockup). */
export const GOAL_ROWS = [3, 4, 5];

/** Hex highlight tones for the match view: a move, a sprint, or a pass/shot target. */
export type HighlightTone = 'move' | 'sprint' | 'target';

export interface Pitch {
  group: THREE.Group;
  hexMesh: THREE.InstancedMesh;
  hover: THREE.Mesh;
  pathDots: THREE.InstancedMesh;
  goalCentre: { west: THREE.Vector3; east: THREE.Vector3 };
  /** Fill hexes with move / sprint / target tones (replaces any earlier highlights). */
  setHighlights(list: { hex: Hex; tone: HighlightTone }[]): void;
  /** Show the pulsing ball-landing marker on a hex, or hide it with null. */
  setLanding(hex: Hex | null): void;
}

// ------------------------------------------------------------------ palette

/** Night-stadium palette, taken from the main menu (src/ui/menu.css) and its key art. */
export const PITCH_COLOURS = {
  night: '#120b1d',
  violet: '#241232',
  turfLight: '#33914a',
  turfDark: '#27783c',
  line: '#f6efd9',
  hexLine: '#e9f7c4',
  gold: '#f2c25a',
  pink: '#ff4f9a',
  ember: '#ff7a3c',
  tide: '#33c2d0',
  move: '#bff7ff',
  sprint: '#ffd36b',
  target: '#ff5fa8',
} as const;

const TURF_HALF_W = 12.9;
const TURF_HALF_D = 8.2;
/** Touchlines and goal lines (painted boundary). */
const TOUCH_Z = 1.5 * (PITCH_ROWS - 1) / 2 + HEX_R + 0.18;
const GOAL_X = OFFSET_X + SQ3 / 2 + 0.38;

// ------------------------------------------------------------------ helpers

function canvas(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return [c, c.getContext('2d')!];
}

function texture(c: HTMLCanvasElement, repeatX = 1): THREE.CanvasTexture {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  if (repeatX !== 1) {
    t.wrapS = THREE.RepeatWrapping;
    t.repeat.set(repeatX, 1);
  }
  return t;
}

function hexShape(r: number): THREE.Shape {
  const s = new THREE.Shape();
  for (let i = 0; i < 6; i++) {
    // Pointy-topped: first corner at 30 degrees.
    const a = (Math.PI / 3) * i + Math.PI / 6;
    const x = r * Math.cos(a);
    const y = r * Math.sin(a);
    if (i === 0) s.moveTo(x, y);
    else s.lineTo(x, y);
  }
  s.closePath();
  return s;
}

/** Corner i of a hex on the ground (matches hexShape after rotateX(-90deg)). */
function hexCorner(c: THREE.Vector3, i: number, r = HEX_R): THREE.Vector3 {
  const a = (Math.PI / 3) * i + Math.PI / 6;
  return new THREE.Vector3(c.x + r * Math.cos(a), 0, c.z - r * Math.sin(a));
}

/** Flat ground strips (constant width, in world units) for a list of segments: crisp painted lines at any zoom. */
function stripGeometry(segments: [THREE.Vector3, THREE.Vector3][], width: number): THREE.BufferGeometry {
  const pos: number[] = [];
  const half = width / 2;
  for (const [a, b] of segments) {
    const dx = b.x - a.x;
    const dz = b.z - a.z;
    const len = Math.hypot(dx, dz) || 1;
    // Extend each end by half the width so corners meet without notches.
    const ex = (dx / len) * half;
    const ez = (dz / len) * half;
    const nx = (-dz / len) * half;
    const nz = (dx / len) * half;
    const p0 = [a.x - ex + nx, a.z - ez + nz];
    const p1 = [a.x - ex - nx, a.z - ez - nz];
    const p2 = [b.x + ex - nx, b.z + ez - nz];
    const p3 = [b.x + ex + nx, b.z + ez + nz];
    for (const [x, z] of [p0, p1, p2, p0, p2, p3]) pos.push(x, 0, z);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  return g;
}

function flat(color: THREE.ColorRepresentation, opacity = 1, additive = false): THREE.MeshBasicMaterial {
  return new THREE.MeshBasicMaterial({
    color,
    transparent: opacity < 1 || additive,
    opacity,
    depthWrite: !(opacity < 1 || additive),
    blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    side: THREE.DoubleSide,
  });
}

function glowTexture(inner: string, outer: string): THREE.CanvasTexture {
  const [c, g] = canvas(128, 128);
  const grd = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grd.addColorStop(0, inner);
  grd.addColorStop(0.25, outer);
  grd.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, 128, 128);
  return texture(c);
}

// ------------------------------------------------------------------ painted textures

/** Floodlit turf: mown stripes, light pools from the four towers, darker edges. */
function turfTexture(): THREE.CanvasTexture {
  const PX = 80; // px per world unit
  const W = Math.round(TURF_HALF_W * 2 * PX);
  const H = Math.round(TURF_HALF_D * 2 * PX);
  const [c, g] = canvas(W, H);
  const toPx = (x: number, z: number) => [(x + TURF_HALF_W) * PX, (z + TURF_HALF_D) * PX];

  g.fillStyle = PITCH_COLOURS.turfDark;
  g.fillRect(0, 0, W, H);
  // Mown stripes, one hex column wide, centred on the halfway line.
  g.fillStyle = PITCH_COLOURS.turfLight;
  for (let k = -8; k <= 8; k += 2) {
    const [x0] = toPx(k * SQ3 - SQ3 / 2, 0);
    g.fillRect(x0, 0, SQ3 * PX, H);
  }
  // Floodlight pools (soft, warm) and a cool centre.
  const pools: [number, number, number, string][] = [
    [-7, -3, 9, 'rgba(255,240,190,0.16)'],
    [7, -3, 9, 'rgba(255,240,190,0.16)'],
    [-6, 4, 8, 'rgba(255,236,200,0.12)'],
    [6, 4, 8, 'rgba(255,236,200,0.12)'],
    [0, 0, 7, 'rgba(230,255,220,0.10)'],
  ];
  for (const [x, z, r, col] of pools) {
    const [px, pz] = toPx(x, z);
    const grd = g.createRadialGradient(px, pz, 0, px, pz, r * PX);
    grd.addColorStop(0, col);
    grd.addColorStop(1, 'rgba(255,240,190,0)');
    g.fillStyle = grd;
    g.fillRect(0, 0, W, H);
  }
  // Fine grass grain: short vertical flecks, very low contrast so hexes stay the loudest pattern.
  let seed = 11;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < 9000; i++) {
    g.fillStyle = rnd() < 0.5 ? 'rgba(10,40,20,0.10)' : 'rgba(210,255,190,0.06)';
    g.fillRect(rnd() * W, rnd() * H, 2, 5 + rnd() * 6);
  }
  // Night vignette at the very edge of the turf, where the floodlights fall off.
  const vig = g.createRadialGradient(W / 2, H / 2, H * 0.45, W / 2, H / 2, W * 0.62);
  vig.addColorStop(0, 'rgba(18,11,29,0)');
  vig.addColorStop(1, 'rgba(18,11,29,0.55)');
  g.fillStyle = vig;
  g.fillRect(0, 0, W, H);
  return texture(c);
}

/** One block of crowd: rows of fans in team colours with phone lights and a few flags. */
function crowdTexture(leftTeam: string, rightTeam: string): THREE.CanvasTexture {
  const W = 2048;
  const H = 512;
  const [c, g] = canvas(W, H);
  const sky = g.createLinearGradient(0, 0, 0, H);
  sky.addColorStop(0, '#1a0f2a');
  sky.addColorStop(1, '#2a1638');
  g.fillStyle = sky;
  g.fillRect(0, 0, W, H);
  let seed = 3;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const lights: [number, number, string][] = [];
  const rows = 24;
  const rowH = (H - 16) / rows;
  for (let r = 0; r < rows; r++) {
    const y = 10 + r * rowH;
    // Step edge of each tier.
    g.fillStyle = 'rgba(255,255,255,0.035)';
    g.fillRect(0, y + rowH - 3, W, 2);
    const lit = 0.5 + (r / rows) * 0.5; // nearer rows catch more floodlight
    for (let x = 4; x < W; x += 9 + rnd() * 4) {
      const side = x / W + (rnd() - 0.5) * 0.3;
      const team = side < 0.5 ? leftTeam : rightTeam;
      const roll = rnd();
      g.globalAlpha = (0.3 + 0.4 * lit) * (roll < 0.5 ? 1 : 0.7);
      g.fillStyle = roll < 0.5 ? team : roll < 0.75 ? '#6a4a7e' : '#3c2a4e';
      // Shoulders and head.
      g.beginPath();
      g.ellipse(x, y + rowH * 0.62, 4.6, 4, 0, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = rnd() < 0.5 ? '#b98a78' : '#5e3e34';
      g.beginPath();
      g.arc(x, y + rowH * 0.22, 2.8, 0, Math.PI * 2);
      g.fill();
      g.globalAlpha = 1;
      // Phone lights and camera flashes.
      if (rnd() < 0.05) lights.push([x + 3, y + 2, rnd() < 0.35 ? '255,110,185' : '255,248,230']);
    }
  }
  // Flags waving above the crowd.
  for (let i = 0; i < 9; i++) {
    const x = 120 + i * 220 + rnd() * 60;
    const y = 40 + rnd() * 260;
    g.fillStyle = x < W / 2 ? leftTeam : rightTeam;
    g.globalAlpha = 0.85;
    g.beginPath();
    g.moveTo(x, y);
    g.quadraticCurveTo(x + 20, y - 8, x + 40, y + 2);
    g.lineTo(x + 40, y + 26);
    g.quadraticCurveTo(x + 20, y + 18, x, y + 28);
    g.closePath();
    g.fill();
    g.globalAlpha = 1;
  }
  // Soften the fans into a painted crowd, dim it under the night sky, then put crisp phone lights on top.
  const [soft, sg] = canvas(W, H);
  sg.filter = 'blur(1.6px) saturate(0.75) brightness(0.72)';
  sg.drawImage(c, 0, 0);
  sg.filter = 'none';
  const haze = sg.createLinearGradient(0, 0, 0, H);
  haze.addColorStop(0, 'rgba(18,11,29,0.55)');
  haze.addColorStop(0.6, 'rgba(18,11,29,0.15)');
  haze.addColorStop(1, 'rgba(60,20,70,0.05)');
  sg.fillStyle = haze;
  sg.fillRect(0, 0, W, H);
  for (const [x, y, col] of lights) {
    const glow = sg.createRadialGradient(x, y, 0, x, y, 6);
    glow.addColorStop(0, `rgba(${col},0.95)`);
    glow.addColorStop(1, `rgba(${col},0)`);
    sg.fillStyle = glow;
    sg.fillRect(x - 7, y - 7, 14, 14);
  }
  return texture(soft);
}

/** LED advertising boards: dark glass with gold and foxfire lettering. */
function boardTexture(): THREE.CanvasTexture {
  const [c, g] = canvas(2048, 64);
  g.fillStyle = '#1b0e27';
  g.fillRect(0, 0, 2048, 64);
  const words: [string, string][] = [
    ['CORE CUP', PITCH_COLOURS.gold],
    ['EMBERFORGE FOUNDRY', PITCH_COLOURS.ember],
    ['CORE CUP', PITCH_COLOURS.pink],
    ['TIDEWELL MARINERS', PITCH_COLOURS.tide],
  ];
  g.font = 'italic 900 38px "Arial Black", "Helvetica Neue", sans-serif';
  g.textBaseline = 'middle';
  let x = 30;
  for (const [w, col] of words) {
    g.shadowColor = col;
    g.shadowBlur = 14;
    g.fillStyle = col;
    g.fillText(w, x, 34);
    x += g.measureText(w).width + 60;
    // Hex bullet between words.
    g.shadowBlur = 0;
    g.strokeStyle = PITCH_COLOURS.gold;
    g.lineWidth = 3;
    g.beginPath();
    for (let i = 0; i <= 6; i++) {
      const a = (Math.PI / 3) * i + Math.PI / 6;
      const px = x - 30 + 11 * Math.cos(a);
      const py = 32 + 11 * Math.sin(a);
      if (i === 0) g.moveTo(px, py);
      else g.lineTo(px, py);
    }
    g.stroke();
    x += 10;
  }
  // Glowing top and bottom edges.
  g.fillStyle = PITCH_COLOURS.pink;
  g.fillRect(0, 0, 2048, 3);
  g.fillStyle = PITCH_COLOURS.gold;
  g.fillRect(0, 61, 2048, 3);
  return texture(c, 2);
}

/** Night sky behind the stadium: violet to a magenta haze where the floodlights hit it, with a few stars. */
function skyTexture(): THREE.CanvasTexture {
  const [c, g] = canvas(512, 512);
  const grd = g.createLinearGradient(0, 0, 0, 512);
  grd.addColorStop(0, '#0d0817');
  grd.addColorStop(0.55, '#2a1240');
  grd.addColorStop(0.8, '#5a1f5c');
  grd.addColorStop(1, '#7a2b5e');
  g.fillStyle = grd;
  g.fillRect(0, 0, 512, 512);
  let seed = 5;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < 140; i++) {
    g.fillStyle = `rgba(255,240,255,${0.2 + rnd() * 0.6})`;
    g.fillRect(rnd() * 512, rnd() * 300, 1.5, 1.5);
  }
  return texture(c);
}

// ------------------------------------------------------------------ stadium

/** Camera direction of the match view (the lab camera sits at +(0, 16, 20) from its target). */
const VIEW_TILT = Math.atan2(16, 20);

/**
 * A flat card facing the match camera, centred at screen height `screenY` (world units above the pitch centre on
 * screen), at ground depth `z` (which sets what it hides and what hides it).
 */
function facingCard(width: number, height: number, screenY: number, z: number, x = 0): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(width, height));
  m.rotation.x = -VIEW_TILT;
  // screen y = y * cos(tilt) - z * sin(tilt)
  const y = (screenY + z * Math.sin(VIEW_TILT)) / Math.cos(VIEW_TILT);
  m.position.set(x, y, z);
  return m;
}

function buildStadium(group: THREE.Group) {
  // Endless dark ground, so no page shows through at any zoom.
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(400, 400), flat(PITCH_COLOURS.night));
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -0.06;
  group.add(ground);

  // Running track / apron around the turf.
  const apron = new THREE.Mesh(
    new THREE.PlaneGeometry(TURF_HALF_W * 2 + 3.2, TURF_HALF_D * 2 + 2.4),
    flat('#2a1a3a'),
  );
  apron.rotation.x = -Math.PI / 2;
  apron.position.y = -0.04;
  group.add(apron);

  // Gold trim around the turf (the menu's brass edge).
  const tw = TURF_HALF_W + 0.06;
  const td = TURF_HALF_D + 0.06;
  const corners = [
    new THREE.Vector3(-tw, 0, -td),
    new THREE.Vector3(tw, 0, -td),
    new THREE.Vector3(tw, 0, td),
    new THREE.Vector3(-tw, 0, td),
  ];
  const trim = new THREE.Mesh(
    stripGeometry(corners.map((p, i) => [p, corners[(i + 1) % 4]] as [THREE.Vector3, THREE.Vector3]), 0.14),
    flat(PITCH_COLOURS.gold),
  );
  trim.position.y = 0.005;
  group.add(trim);

  // LED boards along the far touchline and behind each goal (angled towards the camera).
  const boardTex = boardTexture();
  const farBoard = new THREE.Mesh(
    new THREE.PlaneGeometry(TURF_HALF_W * 2 + 3, 0.5),
    new THREE.MeshBasicMaterial({ map: boardTex }),
  );
  farBoard.position.set(0, 0.25, -TURF_HALF_D - 0.6);
  group.add(farBoard);
  // Stands: a sloped bank behind the far touchline and one behind each goal.
  const crowd = crowdTexture(PITCH_COLOURS.ember, PITCH_COLOURS.tide);
  const standMat = new THREE.MeshBasicMaterial({ map: crowd });
  const slope = Math.atan2(5.2, 5.6);
  const farStand = new THREE.Mesh(new THREE.PlaneGeometry(TURF_HALF_W * 2 + 9, Math.hypot(5.2, 5.6)), standMat);
  farStand.rotation.x = -(Math.PI / 2 - slope) + 0; // tilt back so the crowd faces the pitch and camera
  farStand.position.set(0, 0.35 + 2.6, -TURF_HALF_D - 1.1 - 2.8);
  group.add(farStand);
  // Fascia with a foxfire LED strip along the front of the upper tier.
  const fascia = new THREE.Mesh(new THREE.PlaneGeometry(TURF_HALF_W * 2 + 9, 0.7), flat('#1a0d24'));
  fascia.position.set(0, 5.75, -TURF_HALF_D - 6.45);
  group.add(fascia);
  const led = new THREE.Mesh(new THREE.PlaneGeometry(TURF_HALF_W * 2 + 9, 0.09), flat(PITCH_COLOURS.pink));
  led.position.set(0, 5.62, -TURF_HALF_D - 6.4);
  group.add(led);

  for (const side of [-1, 1]) {
    const tex = crowd.clone();
    tex.repeat.set(0.55, 1);
    tex.offset.set(side < 0 ? 0 : 0.45, 0);
    tex.needsUpdate = true;
    const end = new THREE.Mesh(
      new THREE.PlaneGeometry(TURF_HALF_D * 2 + 6, Math.hypot(5.2, 5.6)),
      new THREE.MeshBasicMaterial({ map: tex }),
    );
    // Rise away from the pitch towards +-x.
    end.rotation.order = 'YXZ';
    end.rotation.y = -side * Math.PI / 2;
    end.rotation.x = -(Math.PI / 2 - slope);
    end.position.set(side * (TURF_HALF_W + 1.6 + 2.8), 0.35 + 2.6, -1.2);
    group.add(end);
  }

  // Sky.
  const sky = new THREE.Mesh(new THREE.PlaneGeometry(220, 60), new THREE.MeshBasicMaterial({ map: skyTexture() }));
  sky.position.set(0, 18, -40);
  sky.lookAt(0, 16, 20);
  group.add(sky);

  // Framing for the match camera, which looks down at ~39 degrees: a stand roof across the top edge with a row
  // of floodlights, and the near crowd and LED boards across the bottom edge. These are flat cards facing the
  // camera, placed by where they land on screen (screen y in world units from the pitch centre; the match view
  // shows about +-8.6 of it at zoom 1).
  const W_ALL = TURF_HALF_W * 2 + 24;
  const roof = facingCard(W_ALL, 1.8, 8.6 + 0.9 - 1.0, -9);
  roof.material = flat('#140a1e');
  group.add(roof);
  const roofEdge = facingCard(W_ALL, 0.07, 7.62, -8.6);
  roofEdge.material = flat(PITCH_COLOURS.pink);
  group.add(roofEdge);
  // Light falling from the roof onto the far stand.
  const [hc, hg] = canvas(4, 128);
  const fall = hg.createLinearGradient(0, 0, 0, 128);
  fall.addColorStop(0, 'rgba(255,236,200,0.38)');
  fall.addColorStop(1, 'rgba(255,236,200,0)');
  hg.fillStyle = fall;
  hg.fillRect(0, 0, 4, 128);
  const haze = facingCard(W_ALL, 1.9, 6.65, -8.5);
  haze.material = new THREE.MeshBasicMaterial({ map: texture(hc), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
  group.add(haze);
  const halo = glowTexture('rgba(255,255,245,1)', 'rgba(255,214,150,0.35)');
  for (let i = 0; i < 9; i++) {
    const x = (i - 4) * 4.4;
    const lamp = facingCard(0.9, 0.16, 7.72, -8.4, x);
    lamp.material = flat('#fffbe8');
    group.add(lamp);
    const glow = new THREE.Sprite(
      new THREE.SpriteMaterial({ map: halo, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }),
    );
    glow.position.copy(lamp.position);
    glow.scale.set(4.2, 2.4, 1);
    group.add(glow);
  }

  // Near side: LED boards, then the backs of the home crowd (darker, drawn over the ground).
  const nearBoard = facingCard(W_ALL, 0.5, -6.3, 9.8);
  const nearBoardTex = boardTex.clone();
  nearBoardTex.repeat.set(3.4, 1);
  nearBoardTex.needsUpdate = true;
  nearBoard.material = new THREE.MeshBasicMaterial({ map: nearBoardTex, depthTest: false });
  nearBoard.renderOrder = 51;
  group.add(nearBoard);
  const nearTex = crowd.clone();
  nearTex.needsUpdate = true;
  const nearCrowd = facingCard(W_ALL, 8, -6.55 - 4, 10.5);
  nearCrowd.material = new THREE.MeshBasicMaterial({ map: nearTex, color: 0x6c5c7a, depthTest: false });
  nearCrowd.renderOrder = 50;
  group.add(nearCrowd);

  // Foxfire sparks drifting up over the stands (not over the pitch, so they never hide play).
  const N = 90;
  const pos = new Float32Array(N * 3);
  const seeds = Array.from({ length: N }, (_, i) => {
    const r = Math.sin(i * 12.9898) * 43758.5453;
    return r - Math.floor(r);
  });
  const sparkGeo = new THREE.BufferGeometry();
  sparkGeo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const sparks = new THREE.Points(
    sparkGeo,
    new THREE.PointsMaterial({
      map: glowTexture('rgba(255,230,240,1)', 'rgba(255,79,154,0.7)'),
      size: 9,
      sizeAttenuation: false,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    }),
  );
  sparks.frustumCulled = false;
  const placeSparks = (t: number) => {
    for (let i = 0; i < N; i++) {
      const s = seeds[i];
      const u = (t * (0.04 + s * 0.05) + s * 7.1) % 1;
      // Spread along the far stand and both end stands.
      const lane = i % 3;
      let x: number, z: number;
      if (lane === 0) {
        x = (s * 2 - 1) * (TURF_HALF_W + 3);
        z = -TURF_HALF_D - 0.9 - ((s * 13.7) % 1) * 0.6;
      } else {
        x = (lane === 1 ? -1 : 1) * (TURF_HALF_W + 1.8 + ((s * 5.3) % 1) * 3.5);
        z = (((s * 3.1) % 1) * 2 - 1) * TURF_HALF_D;
      }
      pos[i * 3] = x + Math.sin(t * 0.8 + s * 20) * 0.4;
      pos[i * 3 + 1] = 0.5 + u * (lane === 0 ? 3.2 : 6);
      pos[i * 3 + 2] = z;
    }
    sparkGeo.attributes.position.needsUpdate = true;
  };
  placeSparks(0);
  sparks.onBeforeRender = () => placeSparks(performance.now() / 1000);
  group.add(sparks);
}

// ------------------------------------------------------------------ pitch

export function buildPitch(opts: { painted?: PaintedPitchArt | null } = {}): Pitch {
  const group = new THREE.Group();
  // Code-drawn stadium, turf and goals. Hidden once the painted pitch art has loaded.
  const dressing = new THREE.Group();
  group.add(dressing);
  buildStadium(dressing);

  const turf = new THREE.Mesh(
    new THREE.PlaneGeometry(TURF_HALF_W * 2, TURF_HALF_D * 2),
    new THREE.MeshBasicMaterial({ map: turfTexture() }),
  );
  turf.rotation.x = -Math.PI / 2;
  turf.position.y = 0;
  dressing.add(turf);

  const all = pitchHexes();
  const homeArea = new Set(goalArea('home').map(hexKey));
  const awayArea = new Set(goalArea('away').map(hexKey));

  // Hex tiles: a light wash so each hex reads as a space without hiding the grass.
  // Goal areas take their defending team's colour (Emberforge west, Tidewell east).
  const tileGeo = new THREE.ShapeGeometry(hexShape(HEX_R * 0.96));
  tileGeo.rotateX(-Math.PI / 2);
  const hexMesh = new THREE.InstancedMesh(tileGeo, flat(0xffffff, 0.14), all.length);
  hexMesh.renderOrder = 1;
  const m = new THREE.Matrix4();
  const c = new THREE.Color();
  all.forEach((h, i) => {
    const p = hexToWorld(h);
    m.makeTranslation(p.x, 0.012, p.z);
    hexMesh.setMatrixAt(i, m);
    const key = hexKey(h);
    if (homeArea.has(key)) c.set(PITCH_COLOURS.ember);
    else if (awayArea.has(key)) c.set(PITCH_COLOURS.tide);
    else c.set('#000000');
    hexMesh.setColorAt(i, c);
  });
  group.add(hexMesh);

  // Hex grid lines: thin pale-lime outlines like the glowing grid in the key art.
  const gridSegs: [THREE.Vector3, THREE.Vector3][] = [];
  const seen = new Set<string>();
  for (const h of all) {
    const p = hexToWorld(h);
    for (let i = 0; i < 6; i++) {
      const a = hexCorner(p, i);
      const b = hexCorner(p, (i + 1) % 6);
      const k = [a, b]
        .map((v) => `${v.x.toFixed(2)},${v.z.toFixed(2)}`)
        .sort()
        .join('|');
      if (seen.has(k)) continue;
      seen.add(k);
      gridSegs.push([a, b]);
    }
  }
  const gridGlow = new THREE.Mesh(stripGeometry(gridSegs, 0.16), flat(PITCH_COLOURS.hexLine, 0.09, true));
  gridGlow.position.y = 0.018;
  gridGlow.renderOrder = 1;
  group.add(gridGlow);
  const grid = new THREE.Mesh(stripGeometry(gridSegs, 0.045), flat(PITCH_COLOURS.hexLine, 0.5));
  grid.position.y = 0.02;
  grid.renderOrder = 1;
  group.add(grid);

  // Painted markings: touchlines, goal lines, halfway line, centre circle and spot.
  const lineMat = flat(PITCH_COLOURS.line, 0.9);
  const tl = [
    new THREE.Vector3(-GOAL_X, 0, -TOUCH_Z),
    new THREE.Vector3(GOAL_X, 0, -TOUCH_Z),
    new THREE.Vector3(GOAL_X, 0, TOUCH_Z),
    new THREE.Vector3(-GOAL_X, 0, TOUCH_Z),
  ];
  const markSegs: [THREE.Vector3, THREE.Vector3][] = tl.map((p, i) => [p, tl[(i + 1) % 4]]);
  markSegs.push([new THREE.Vector3(0, 0, -TOUCH_Z), new THREE.Vector3(0, 0, TOUCH_Z)]);
  const marks = new THREE.Mesh(stripGeometry(markSegs, 0.09), lineMat);
  marks.position.y = 0.025;
  marks.renderOrder = 1;
  group.add(marks);
  const circleGeo = new THREE.RingGeometry(2.2 - 0.045, 2.2 + 0.045, 96);
  circleGeo.rotateX(-Math.PI / 2);
  const circle = new THREE.Mesh(circleGeo, lineMat);
  circle.position.y = 0.025;
  circle.renderOrder = 1;
  group.add(circle);
  const spotGeo = new THREE.CircleGeometry(0.13, 24);
  spotGeo.rotateX(-Math.PI / 2);
  const spot = new THREE.Mesh(spotGeo, lineMat);
  spot.position.y = 0.026;
  spot.renderOrder = 1;
  group.add(spot);
  // Corner arcs.
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const arcGeo = new THREE.RingGeometry(0.55, 0.64, 16, 1, 0, Math.PI / 2);
      arcGeo.rotateX(-Math.PI / 2);
      const arc = new THREE.Mesh(arcGeo, lineMat);
      arc.position.set(sx * GOAL_X, 0.025, sz * TOUCH_Z);
      // Ring quarter starts pointing +x and sweeps to -z; turn it to point inwards.
      arc.rotation.y = sx < 0 ? (sz < 0 ? -Math.PI / 2 : 0) : sz < 0 ? Math.PI : Math.PI / 2;
      arc.renderOrder = 1;
      group.add(arc);
    }
  }

  // Goal-area outlines in team colour, traced along the outer hex edges, with a soft glow under them.
  for (const [area, colour] of [
    [homeArea, PITCH_COLOURS.ember],
    [awayArea, PITCH_COLOURS.tide],
  ] as const) {
    const segs: [THREE.Vector3, THREE.Vector3][] = [];
    for (const h of all) {
      if (!area.has(hexKey(h))) continue;
      const p = hexToWorld(h);
      for (let i = 0; i < 6; i++) {
        // Neighbour across edge i (between corners i and i+1).
        const a = (Math.PI / 3) * (i + 1);
        const n = worldToGridHex(p.x + SQ3 * Math.cos(a), p.z - SQ3 * Math.sin(a));
        if (area.has(hexKey(n))) continue;
        segs.push([hexCorner(p, i), hexCorner(p, (i + 1) % 6)]);
      }
    }
    const glow = new THREE.Mesh(stripGeometry(segs, 0.26), flat(colour, 0.28));
    glow.position.y = 0.028;
    glow.renderOrder = 1;
    group.add(glow);
    const edge = new THREE.Mesh(stripGeometry(segs, 0.085), flat(colour, 0.95));
    edge.position.y = 0.03;
    edge.renderOrder = 1;
    group.add(edge);
  }

  // Goals: white posts with gold caps, crossbar, a tinted back panel and a net.
  const goalCentre = { west: new THREE.Vector3(), east: new THREE.Vector3() };
  for (const side of ['west', 'east'] as const) {
    const colOf = (row: number) => (side === 'west' ? 0 : lastCol(row));
    const top = hexToWorld({ col: colOf(GOAL_ROWS[0]), row: GOAL_ROWS[0] });
    const bottom = hexToWorld({ col: colOf(GOAL_ROWS[GOAL_ROWS.length - 1]), row: GOAL_ROWS[GOAL_ROWS.length - 1] });
    const sign = side === 'west' ? -1 : 1;
    const x = sign * GOAL_X;
    const z0 = top.z - 0.9;
    const z1 = bottom.z + 0.9;
    const hgt = 1.15;
    const depth = 1.0;
    const team = side === 'west' ? PITCH_COLOURS.ember : PITCH_COLOURS.tide;

    // Shadowed ground inside the goal.
    const mouth = new THREE.Mesh(new THREE.PlaneGeometry(depth, z1 - z0), flat('#0b1a10', 0.45));
    mouth.rotation.x = -Math.PI / 2;
    mouth.position.set(x + (sign * depth) / 2, 0.01, (z0 + z1) / 2);
    dressing.add(mouth);
    // Back panel tinted in the defending team's colour.
    const back = new THREE.Mesh(new THREE.PlaneGeometry(z1 - z0, hgt * 0.6), flat(team, 0.18));
    back.rotation.y = -sign * Math.PI / 2;
    back.position.set(x + sign * depth, hgt * 0.3, (z0 + z1) / 2);
    dressing.add(back);

    const postMat = flat('#fffaf0');
    for (const z of [z0, z1]) {
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.075, hgt, 10), postMat);
      post.position.set(x, hgt / 2, z);
      dressing.add(post);
      const cap = new THREE.Mesh(new THREE.SphereGeometry(0.1, 10, 8), flat(PITCH_COLOURS.gold));
      cap.position.set(x, hgt, z);
      dressing.add(cap);
    }
    const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.075, z1 - z0, 10), postMat);
    bar.rotation.x = Math.PI / 2;
    bar.position.set(x, hgt, (z0 + z1) / 2);
    dressing.add(bar);
    const net: THREE.Vector3[] = [];
    const bx = x + sign * depth;
    for (let k = 0; k <= 12; k++) {
      const z = z0 + ((z1 - z0) * k) / 12;
      net.push(new THREE.Vector3(x, hgt, z), new THREE.Vector3(bx, hgt * 0.6, z));
      net.push(new THREE.Vector3(bx, hgt * 0.6, z), new THREE.Vector3(bx, 0, z));
    }
    for (let k = 0; k <= 5; k++) {
      const y = (hgt * 0.6 * k) / 5;
      net.push(new THREE.Vector3(bx, y, z0), new THREE.Vector3(bx, y, z1));
    }
    for (const z of [z0, z1]) {
      for (let k = 0; k <= 4; k++) {
        const f = k / 4;
        net.push(new THREE.Vector3(x + sign * depth * f, hgt - hgt * 0.4 * f, z), new THREE.Vector3(x + sign * depth * f, 0, z));
      }
    }
    dressing.add(
      new THREE.LineSegments(
        new THREE.BufferGeometry().setFromPoints(net),
        new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.5 }),
      ),
    );
    goalCentre[side] = new THREE.Vector3(x + sign * 0.4, 0, (z0 + z1) / 2);
  }

  // Move / sprint / target highlights for the match view: bright fill plus an outline.
  const tones: Record<HighlightTone, THREE.Color> = {
    move: new THREE.Color(PITCH_COLOURS.move),
    sprint: new THREE.Color(PITCH_COLOURS.sprint),
    target: new THREE.Color(PITCH_COLOURS.target),
  };
  const hiFill = new THREE.InstancedMesh(tileGeo, flat(0xffffff, 0.34), all.length);
  hiFill.count = 0;
  hiFill.renderOrder = 2;
  const hiRingGeo = new THREE.RingGeometry(HEX_R * 0.8, HEX_R * 0.94, 6, 1, Math.PI / 6);
  hiRingGeo.rotateX(-Math.PI / 2);
  const hiRing = new THREE.InstancedMesh(hiRingGeo, flat(0xffffff, 0.9), all.length);
  hiRing.count = 0;
  hiRing.renderOrder = 2;
  group.add(hiFill, hiRing);
  const setHighlights = (list: { hex: Hex; tone: HighlightTone }[]) => {
    list.forEach(({ hex, tone }, i) => {
      const p = hexToWorld(hex);
      hiFill.setMatrixAt(i, m.makeTranslation(p.x, 0.04, p.z));
      hiRing.setMatrixAt(i, m.makeTranslation(p.x, 0.045, p.z));
      hiFill.setColorAt(i, tones[tone]);
      hiRing.setColorAt(i, tones[tone]);
    });
    hiFill.count = hiRing.count = list.length;
    for (const mesh of [hiFill, hiRing]) {
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    }
  };

  // Ball landing marker: a pulsing foxfire ring with a target dot.
  const landing = new THREE.Group();
  const landRingGeo = new THREE.RingGeometry(0.62, 0.78, 6, 1, Math.PI / 6);
  landRingGeo.rotateX(-Math.PI / 2);
  const landRing = new THREE.Mesh(landRingGeo, flat(PITCH_COLOURS.target, 0.95));
  const landDotGeo = new THREE.CircleGeometry(0.16, 20);
  landDotGeo.rotateX(-Math.PI / 2);
  const landDot = new THREE.Mesh(landDotGeo, flat('#fff3fa', 0.95));
  landDot.position.y = 0.002;
  landing.add(landRing, landDot);
  landing.renderOrder = 3;
  landRing.renderOrder = landDot.renderOrder = 3;
  landing.visible = false;
  landRing.onBeforeRender = () => {
    const s = 1 + 0.12 * Math.sin(performance.now() / 160);
    landRing.scale.set(s, 1, s);
  };
  group.add(landing);
  const setLanding = (hex: Hex | null) => {
    landing.visible = !!hex;
    if (hex) landing.position.copy(hexToWorld(hex)).setY(0.05);
  };

  // Hover hex outline.
  const hoverGeo = new THREE.RingGeometry(HEX_R * 0.78, HEX_R * 0.95, 6, 1, Math.PI / 6);
  hoverGeo.rotateX(-Math.PI / 2);
  const hover = new THREE.Mesh(
    hoverGeo,
    new THREE.MeshBasicMaterial({ color: 0xfff1c4, transparent: true, opacity: 0.7, depthWrite: false }),
  );
  hover.visible = false;
  hover.renderOrder = 2;
  group.add(hover);

  const dotGeo = new THREE.CircleGeometry(0.12, 12);
  dotGeo.rotateX(-Math.PI / 2);
  const pathDots = new THREE.InstancedMesh(
    dotGeo,
    new THREE.MeshBasicMaterial({ color: 0xffd36b, transparent: true, opacity: 0.95, depthWrite: false }),
    40,
  );
  pathDots.count = 0;
  pathDots.renderOrder = 2;
  group.add(pathDots);

  const painted = opts.painted === undefined ? PAINTED_PITCH : opts.painted;
  if (painted) loadPaintedPitch(group, dressing, painted);

  return { group, hexMesh, hover, pathDots, goalCentre, setHighlights, setLanding };
}

// ------------------------------------------------------------------ painted pitch art

/**
 * Painted stadium art from the design agent, drawn for the match camera: one 3840 x 2880 background
 * (stadium, grass, goal backs) plus the near post and net of each goal as transparent layers on the same canvas.
 * See /mnt/project-files/pitch-redesign/design-agent-pitch-brief.md for the spec.
 */
export interface PaintedPitchArt {
  background: string;
  fronts: string[];
}

const ART = `${import.meta.env.BASE_URL}pitch/`;
export const PAINTED_PITCH: PaintedPitchArt = {
  background: `${ART}pitch_background.webp`,
  fronts: [`${ART}goal_west_front.webp`, `${ART}goal_east_front.webp`],
};

/** Canvas size, its scale, and where the pitch centre sits on it (from the guide render). */
const ART_W = 3840;
const ART_H = 2880;
const ART_PX_PER_UNIT = 125;
const ART_CENTRE_Y = 1408.4;

/**
 * The match camera has no perspective, so a picture painted for it stays exact under any pan or zoom as long as
 * it is a card facing the camera at the right scale. The background sits far behind the pitch; the goal fronts
 * draw over the players (they only cover the posts, outside the playing hexes).
 */
function loadPaintedPitch(group: THREE.Group, dressing: THREE.Group, art: PaintedPitchArt) {
  // Exact view direction of the lab camera: from target + (0, 0, 0.4) up to target + (0, 16, 20).
  const tilt = Math.atan2(16, 19.6);
  const up = new THREE.Vector3(0, Math.cos(tilt), -Math.sin(tilt));
  const back = new THREE.Vector3(0, -Math.sin(tilt), -Math.cos(tilt));
  // Screen point of the world origin in the guide render is (1920, ART_CENTRE_Y); the card centre is below it.
  const centreDown = (ART_H / 2 - ART_CENTRE_Y) / ART_PX_PER_UNIT;
  const card = (url: string, depth: number, front: boolean) =>
    new Promise<THREE.Mesh>((resolve, reject) => {
      new THREE.TextureLoader().load(
        url,
        (tex) => {
          tex.colorSpace = THREE.SRGBColorSpace;
          tex.anisotropy = 4;
          const m = new THREE.Mesh(
            new THREE.PlaneGeometry(ART_W / ART_PX_PER_UNIT, ART_H / ART_PX_PER_UNIT),
            new THREE.MeshBasicMaterial({ map: tex, transparent: front, depthWrite: false, depthTest: !front }),
          );
          m.rotation.x = -tilt;
          m.position.copy(up).multiplyScalar(-centreDown).addScaledVector(back, depth);
          m.renderOrder = front ? 10_000 : -10;
          m.frustumCulled = false;
          resolve(m);
        },
        undefined,
        reject,
      );
    });
  Promise.all([card(art.background, 60, false), ...art.fronts.map((u) => card(u, -2, true))])
    .then(([bg, ...fronts]) => {
      group.add(bg, ...fronts);
      dressing.visible = false;
    })
    .catch((err) => console.warn('Painted pitch art not loaded; keeping the code-drawn stadium.', err));
}
