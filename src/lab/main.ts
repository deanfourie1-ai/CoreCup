// Sprite lab: the Round 1 vertical slice for the 2D anime sprite pipeline.
// Playmaker #10 on the 13x9 hex pitch with idle / run / shot, a separate ball,
// a selection ring, click-to-move, visible layered gear, and the checks the
// brief asks for (64 px legibility, six facings, ten sprites).

import * as THREE from 'three';
import { DIRECTIONS, PITCH_COLS, sameHex, neighbours, hexKey, type Direction, type Hex } from '../engine/hex';
import { loadSpriteSheet, resolveFrame, type SpriteSheet } from '../sprites/atlas';
import { composeFrame } from '../sprites/compose';
import { facingFor } from '../sprites/facing';
import { EMPTY_LOADOUT, PRESETS, SLOTS, TIER_LABELS, randomLoadout, type Loadout, type Tier } from '../sprites/loadout';
import type { ActionName } from '../sprites/schema';
import { buildPitch, hexToWorld, worldToHex } from './pitch';
import { FoxMirage } from './mirage';
import { SpritePlayer } from './player';
import './lab.css';

const params = new URLSearchParams(location.search);
const ATLAS_URL = params.get('atlas') ?? `${import.meta.env.BASE_URL}sprites/playmaker10/cc_playmaker10.json`;

// ------------------------------------------------------------------ scene

const stage = document.getElementById('stage')!;
const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
stage.appendChild(renderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 200);
camera.position.set(0, 16, 20);
camera.lookAt(0, 0, 0.4);

const pitch = buildPitch();
scene.add(pitch.group);

let zoom = 1;
function resize() {
  const w = stage.clientWidth;
  const h = stage.clientHeight;
  renderer.setSize(w, h);
  const aspect = w / h;
  const halfW = Math.max(13.6, 8.6 * aspect) / zoom;
  const halfH = halfW / aspect;
  camera.left = -halfW;
  camera.right = halfW;
  camera.top = halfH;
  camera.bottom = -halfH;
  camera.updateProjectionMatrix();
  pxPerUnit.textContent = `${Math.round(h / (2 * halfH))}`;
}
const pxPerUnit = document.getElementById('px-per-unit')!;

// ------------------------------------------------------------------ ball

function makeBall() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d')!;
  const halo = g.createRadialGradient(32, 32, 8, 32, 32, 32);
  halo.addColorStop(0, 'rgba(255,220,140,0.9)');
  halo.addColorStop(1, 'rgba(255,180,60,0)');
  g.fillStyle = halo;
  g.fillRect(0, 0, 64, 64);
  g.beginPath();
  g.arc(32, 32, 12, 0, Math.PI * 2);
  g.fillStyle = '#fffaf0';
  g.fill();
  g.lineWidth = 2;
  g.strokeStyle = '#2a1c18';
  g.stroke();
  g.fillStyle = '#d6a050';
  for (const [x, y] of [[32, 26], [26, 36], [38, 36]]) {
    g.beginPath();
    g.arc(x, y, 3.6, 0, Math.PI * 2);
    g.fill();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, depthWrite: false }));
  sprite.scale.set(0.75, 0.75, 1);
  const shadowGeo = new THREE.CircleGeometry(0.16, 16);
  shadowGeo.rotateX(-Math.PI / 2);
  const shadow = new THREE.Mesh(
    shadowGeo,
    new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.35, depthWrite: false }),
  );
  shadow.renderOrder = 3;
  return { sprite, shadow };
}

const ball = makeBall();
scene.add(ball.sprite, ball.shadow);

type BallState =
  | { kind: 'feet'; owner: SpritePlayer }
  | { kind: 'flight'; from: THREE.Vector3; to: THREE.Vector3; t: number; dur: number; height: number }
  | { kind: 'rest'; at: THREE.Vector3 };
let ballState: BallState;

// ------------------------------------------------------------------ selection ring

const ringGeo = new THREE.RingGeometry(0.5, 0.64, 48);
ringGeo.rotateX(-Math.PI / 2);
const ring = new THREE.Mesh(
  ringGeo,
  new THREE.MeshBasicMaterial({ color: 0xffc757, transparent: true, opacity: 0.95, depthWrite: false, blending: THREE.AdditiveBlending }),
);
ring.renderOrder = 4;
scene.add(ring);

// ------------------------------------------------------------------ players

let sheet: SpriteSheet;
let hero: SpritePlayer;
let selected: SpritePlayer;
const players: SpritePlayer[] = [];
const crowd: SpritePlayer[] = [];
let showAnchors = false;
let rngState = 7;
const rand = () => ((rngState = (rngState * 16807) % 2147483647) / 2147483647);

function addPlayer(hex: Hex, loadout: Loadout): SpritePlayer {
  const p = new SpritePlayer(sheet, hex, loadout, camera);
  p.showAnchors = showAnchors;
  scene.add(p.mesh, p.shadow);
  players.push(p);
  return p;
}

function removePlayer(p: SpritePlayer) {
  scene.remove(p.mesh, p.shadow);
  players.splice(players.indexOf(p), 1);
}

// ------------------------------------------------------------------ path finding

function findPath(from: Hex, to: Hex): Hex[] {
  const prev = new Map<string, Hex | null>([[hexKey(from), null]]);
  const queue: Hex[] = [from];
  while (queue.length) {
    const cur = queue.shift()!;
    if (sameHex(cur, to)) break;
    for (const n of neighbours(cur)) {
      if (prev.has(hexKey(n))) continue;
      prev.set(hexKey(n), cur);
      queue.push(n);
    }
  }
  if (!prev.has(hexKey(to))) return [];
  const out: Hex[] = [];
  for (let cur: Hex | null = to; cur && !sameHex(cur, from); cur = prev.get(hexKey(cur)) ?? null) out.unshift(cur);
  return out;
}

// ------------------------------------------------------------------ input

const raycaster = new THREE.Raycaster();
const ground = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);

function pointerHex(ev: PointerEvent): Hex | null {
  const r = renderer.domElement.getBoundingClientRect();
  const ndc = new THREE.Vector2(((ev.clientX - r.left) / r.width) * 2 - 1, -((ev.clientY - r.top) / r.height) * 2 + 1);
  raycaster.setFromCamera(ndc, camera);
  const hit = new THREE.Vector3();
  if (!raycaster.ray.intersectPlane(ground, hit)) return null;
  return worldToHex(hit.x, hit.z);
}

renderer.domElement.addEventListener('pointermove', (ev) => {
  const h = pointerHex(ev);
  pitch.hover.visible = !!h;
  if (h) pitch.hover.position.copy(hexToWorld(h)).setY(0.08);
  const path = h && selected ? findPath(selected.hex, h) : [];
  pitch.pathDots.count = path.length;
  const m = new THREE.Matrix4();
  path.forEach((p, i) => {
    const w = hexToWorld(p);
    pitch.pathDots.setMatrixAt(i, m.makeTranslation(w.x, 0.09, w.z));
  });
  pitch.pathDots.instanceMatrix.needsUpdate = true;
});

renderer.domElement.addEventListener('pointerleave', () => {
  pitch.hover.visible = false;
  pitch.pathDots.count = 0;
});

renderer.domElement.addEventListener('click', (ev) => {
  const h = pointerHex(ev);
  if (!h) return;
  const occupant = players.find((p) => sameHex(p.hex, h) && !p.moving);
  if (occupant && occupant !== selected) {
    selected = occupant;
    syncGearUi();
    return;
  }
  if (selected.action === 'shot_power') return;
  selected.runTo(findPath(selected.hex, h));
  pitch.pathDots.count = 0;
});

window.addEventListener('keydown', (ev) => {
  if (ev.key === 's' || ev.key === 'S') shoot();
  if (ev.key === 'm' || ev.key === 'M') castMirage();
});

// ------------------------------------------------------------------ Fox Mirage (Kitsune core ability)

let mirage: FoxMirage | null = null;
let pendingMirage = false;

function castMirage() {
  if (mirage || hero.action === 'shot_power') return;
  if (hero.moving) {
    pendingMirage = true;
    return;
  }
  pendingMirage = false;
  selected = hero;
  syncGearUi();
  mirage = new FoxMirage(scene, camera, hero, Math.max(1, hero.loadout.core) as Tier, players);
  if (sheet.def.actions.ability) hero.setAction('ability');
  flash(`Fox Mirage · ${mirage.tierName}${hero.loadout.core === 0 ? ' (no core fitted, shown at Spark)' : ''}`);
}

// ------------------------------------------------------------------ shooting

const banner = document.getElementById('banner')!;

let pendingShot = false;

function shoot() {
  if (hero.action === 'shot_power') return;
  if (hero.moving) {
    // Strike as soon as she arrives.
    pendingShot = true;
    return;
  }
  pendingShot = false;
  if (ballState.kind !== 'feet' || ballState.owner !== hero) {
    flash('Get the ball back first (Reset ball).');
    return;
  }
  selected = hero;
  const east = hero.pos.x >= 0;
  hero.face(east ? 'E' : 'W');
  hero.setAction('shot_power');
}

function onHeroEvent(e: { type: string }, p: SpritePlayer) {
  if (e.type !== 'ball_release' || ballState.kind !== 'feet' || ballState.owner !== p) return;
  const goal = p.pos.x >= 0 ? pitch.goalCentre.east : pitch.goalCentre.west;
  const toe = p.anchorWorld('toe_L') ?? p.pos.clone();
  const from = new THREE.Vector3(toe.x, 0.15, p.pos.z + 0.05);
  const to = goal.clone().add(new THREE.Vector3(0, 0.55, (rand() - 0.5) * 2.6));
  ballState = { kind: 'flight', from, to, t: 0, dur: 0.45 + from.distanceTo(to) * 0.06, height: 0.7 };
  kickFlash(from);
}

const flashes: { mesh: THREE.Sprite; t: number }[] = [];
function kickFlash(at: THREE.Vector3) {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d')!;
  g.translate(32, 32);
  g.strokeStyle = '#fff3c4';
  g.lineWidth = 3;
  for (let i = 0; i < 10; i++) {
    g.rotate((Math.PI * 2) / 10);
    g.beginPath();
    g.moveTo(10, 0);
    g.lineTo(28, 0);
    g.stroke();
  }
  const mesh = new THREE.Sprite(
    new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(c), depthTest: false, blending: THREE.AdditiveBlending, transparent: true }),
  );
  mesh.position.copy(at);
  mesh.renderOrder = 5000;
  scene.add(mesh);
  flashes.push({ mesh, t: 0 });
}

let bannerTimer = 0;
function flash(text: string, goal = false) {
  banner.textContent = text;
  banner.className = goal ? 'show goal' : 'show';
  bannerTimer = goal ? 1.8 : 2.2;
}

function resetBall() {
  ballState = { kind: 'feet', owner: hero };
}

// ------------------------------------------------------------------ UI

const gearRows = document.getElementById('gear-rows')!;
for (const slot of SLOTS) {
  const row = document.createElement('div');
  row.className = 'gear-row';
  row.innerHTML = `<span class="slot">${slot}</span>`;
  const seg = document.createElement('div');
  seg.className = 'seg';
  TIER_LABELS[slot].forEach((label, tier) => {
    const b = document.createElement('button');
    b.textContent = label;
    b.dataset.slot = slot;
    b.dataset.tier = String(tier);
    b.addEventListener('click', () => {
      selected.loadout = { ...selected.loadout, [slot]: tier as Tier };
      syncGearUi();
    });
    seg.appendChild(b);
  });
  row.appendChild(seg);
  gearRows.appendChild(row);
}

const presetRow = document.getElementById('presets')!;
for (const [, p] of Object.entries(PRESETS)) {
  const b = document.createElement('button');
  b.textContent = p.label;
  b.addEventListener('click', () => {
    selected.loadout = { ...p.loadout };
    syncGearUi();
  });
  presetRow.appendChild(b);
}

function syncGearUi() {
  for (const b of gearRows.querySelectorAll<HTMLButtonElement>('button')) {
    const on = selected.loadout[b.dataset.slot as keyof Loadout] === Number(b.dataset.tier);
    b.setAttribute('aria-pressed', String(on));
  }
  document.getElementById('selected-name')!.textContent = selected === hero ? '#10 Playmaker' : 'Crowd test copy';
}

// In-place preview of any action in any facing.
const previewRow = document.getElementById('preview')!;
let preview: { action: ActionName; dir: Direction } | null = null;
for (const action of ['loco_idle', 'loco_jog', 'shot_power'] as ActionName[]) {
  const b = document.createElement('button');
  b.textContent = { loco_idle: 'Idle', loco_jog: 'Jog', shot_power: 'Shot' }[action as 'loco_idle'];
  b.dataset.action = action;
  b.addEventListener('click', () => {
    preview = { action, dir: preview?.dir ?? hero.dir };
    applyPreview();
  });
  previewRow.appendChild(b);
}
const facingRow = document.getElementById('facings')!;
for (const dir of ['NW', 'NE', 'W', 'E', 'SW', 'SE'] as Direction[]) {
  const b = document.createElement('button');
  b.textContent = dir;
  b.dataset.dir = dir;
  b.addEventListener('click', () => {
    preview = { action: preview?.action ?? 'loco_jog', dir };
    applyPreview();
  });
  facingRow.appendChild(b);
}
function applyPreview() {
  if (!preview) return;
  hero.stop();
  hero.face(preview.dir);
  hero.setAction(preview.action);
  for (const b of previewRow.querySelectorAll<HTMLButtonElement>('button'))
    b.setAttribute('aria-pressed', String(b.dataset.action === preview.action));
  for (const b of facingRow.querySelectorAll<HTMLButtonElement>('button'))
    b.setAttribute('aria-pressed', String(b.dataset.dir === preview.dir));
}

document.getElementById('shoot')!.addEventListener('click', shoot);
document.getElementById('mirage')!.addEventListener('click', castMirage);
document.getElementById('reset')!.addEventListener('click', () => {
  preview = null;
  hero.setAction('loco_idle');
  resetBall();
});

const anchorsToggle = document.getElementById('anchors') as HTMLInputElement;
anchorsToggle.addEventListener('change', () => {
  showAnchors = anchorsToggle.checked;
  for (const p of players) p.showAnchors = showAnchors;
});

const crowdToggle = document.getElementById('crowd') as HTMLInputElement;
crowdToggle.addEventListener('change', () => {
  if (crowdToggle.checked) {
    const taken = new Set(players.map((p) => hexKey(p.hex)));
    while (crowd.length < 9) {
      const h = { col: Math.floor(rand() * PITCH_COLS), row: Math.floor(rand() * 9) };
      if (taken.has(hexKey(h))) continue;
      taken.add(hexKey(h));
      const p = addPlayer(h, randomLoadout(rand));
      crowd.push(p);
    }
  } else {
    for (const p of crowd) removePlayer(p);
    crowd.length = 0;
    if (!players.includes(selected)) selected = hero;
  }
  syncGearUi();
});

const zoomInput = document.getElementById('zoom') as HTMLInputElement;
zoomInput.addEventListener('input', () => {
  zoom = Number(zoomInput.value);
  resize();
});

// ------------------------------------------------------------------ checks: 64 px strip + six facings

const strip = document.getElementById('strip') as HTMLCanvasElement;
const stripCtx = strip.getContext('2d')!;
const scratch = document.createElement('canvas');
const scratchCtx = scratch.getContext('2d')!;
const STRIP_DIRS: Direction[] = ['E', 'SE', 'SW', 'W', 'NW', 'NE'];

function drawStrip(t: number) {
  const [fw, fh] = sheet.def.frameSize;
  scratch.width = fw;
  scratch.height = fh;
  const cell = 74;
  const charH = 64;
  // 64 px is the character's height, so the full frame is drawn a little taller.
  const scale = charH / (fh * 0.86);
  strip.width = cell * STRIP_DIRS.length;
  strip.height = 2 * 92 + 8;
  stripCtx.clearRect(0, 0, strip.width, strip.height);
  const action: ActionName = preview?.action ?? (hero.action === 'shot_power' ? 'shot_power' : 'loco_jog');
  const actionDef = sheet.def.actions[action]!;
  const frameNo = Math.floor(t * actionDef.fps);
  [selected.loadout, EMPTY_LOADOUT].forEach((loadout, rowIdx) => {
    STRIP_DIRS.forEach((dir, i) => {
      const rf = resolveFrame(sheet.def, action, dir, frameNo);
      composeFrame(scratchCtx, sheet, rf, loadout, t, { baseOnly: rowIdx === 1 });
      const x = i * cell;
      const y = rowIdx * 96;
      stripCtx.save();
      stripCtx.imageSmoothingQuality = 'high';
      const dw = fw * scale;
      const dh = fh * scale;
      stripCtx.translate(x + cell / 2, y + 4);
      if (rf.mirror) stripCtx.scale(-1, 1);
      stripCtx.drawImage(scratch, -dw / 2, 0, dw, dh);
      stripCtx.restore();
      stripCtx.fillStyle = rf.mirror ? '#ffb38a' : '#c9d6c0';
      stripCtx.font = '10px system-ui, sans-serif';
      const f = facingFor(actionDef, dir);
      stripCtx.fillText(`${dir}${f.mirror ? ' (mirror)' : ''}`, x + 4, y + 90);
    });
  });
}

// ------------------------------------------------------------------ stats

const fpsEl = document.getElementById('fps')!;
const statsEl = document.getElementById('stats')!;
let fpsAvg = 60;
let frameMsAvg = 16;

// ------------------------------------------------------------------ main loop

const clock = new THREE.Clock();
let stripClock = 0;
const camTarget = new THREE.Vector3();
let elapsed = 0;

function tick() {
  const t0 = performance.now();
  const dt = Math.min(clock.getDelta(), 0.05);
  elapsed += dt;

  // Crowd copies wander so the ten-sprite test is busy.
  for (const p of crowd) {
    if (!p.moving && p.action === 'loco_idle' && rand() < dt * 0.6) {
      const h = { col: Math.floor(rand() * PITCH_COLS), row: Math.floor(rand() * 9) };
      p.runTo(findPath(p.hex, h));
    }
  }

  for (const p of players) p.update(dt, elapsed);
  if (pendingShot && !hero.moving) shoot();
  if (pendingMirage && !hero.moving) castMirage();
  if (mirage) {
    mirage.update(dt);
    if (mirage.done) mirage = null;
  }

  // Ball.
  if (ballState.kind === 'feet') {
    const p = ballState.owner;
    const dir = DIRECTIONS.indexOf(p.dir);
    const ang = (dir * Math.PI) / 3;
    const ahead = p.moving ? 0.42 : 0.36;
    const bob = p.moving ? Math.abs(Math.sin(elapsed * 9)) * 0.08 : 0;
    ball.sprite.position.set(p.pos.x + Math.cos(ang) * ahead, 0.16 + bob, p.pos.z + Math.sin(ang) * ahead);
  } else if (ballState.kind === 'flight') {
    const s = ballState;
    s.t += dt;
    const u = Math.min(s.t / s.dur, 1);
    ball.sprite.position.lerpVectors(s.from, s.to, u);
    ball.sprite.position.y += Math.sin(u * Math.PI) * s.height;
    if (u >= 1) {
      ballState = { kind: 'rest', at: s.to.clone().setY(0.16) };
      flash('GOAL!', true);
      setTimeout(resetBall, 1600);
    }
  } else {
    ball.sprite.position.copy(ballState.at);
  }
  ball.shadow.position.set(ball.sprite.position.x, 0.08, ball.sprite.position.z);
  ball.sprite.renderOrder = 100 + Math.round((ball.sprite.position.z + 20) * 10) + 1;

  // When zoomed in, the camera drifts towards the selected player.
  const follow = Math.min(1, Math.max(0, zoom - 1));
  camTarget.lerp(new THREE.Vector3(selected.pos.x * follow, 0, selected.pos.z * follow * 0.6), Math.min(1, dt * 4));
  camera.position.set(camTarget.x, 16, 20 + camTarget.z);
  camera.lookAt(camTarget.x, 0, 0.4 + camTarget.z);

  // Selection ring follows the selected player.
  ring.position.set(selected.pos.x, 0.09, selected.pos.z);
  const pulse = 1 + 0.06 * Math.sin(elapsed * 5);
  ring.scale.set(pulse, 1, pulse);

  for (let i = flashes.length - 1; i >= 0; i--) {
    const f = flashes[i];
    f.t += dt;
    f.mesh.scale.setScalar(0.6 + f.t * 4);
    (f.mesh.material as THREE.SpriteMaterial).opacity = Math.max(0, 1 - f.t * 4);
    if (f.t > 0.3) {
      scene.remove(f.mesh);
      flashes.splice(i, 1);
    }
  }

  if (bannerTimer > 0) {
    bannerTimer -= dt;
    if (bannerTimer <= 0) banner.className = '';
  }

  stripClock += dt;
  if (stripClock > 0.12) {
    drawStrip(elapsed);
    stripClock = 0;
  }

  renderer.render(scene, camera);

  const frameMs = performance.now() - t0;
  fpsAvg += (1 / Math.max(dt, 1e-3) - fpsAvg) * 0.05;
  frameMsAvg += (frameMs - frameMsAvg) * 0.05;
  fpsEl.textContent = `${Math.round(fpsAvg)} fps · ${frameMsAvg.toFixed(1)} ms/frame CPU`;
  statsEl.textContent = `${players.length} sprite${players.length === 1 ? '' : 's'} · ${renderer.info.render.calls} draw calls`;
  requestAnimationFrame(tick);
}

// ------------------------------------------------------------------ boot

async function boot() {
  sheet = await loadSpriteSheet(ATLAS_URL);
  document.getElementById('art-status')!.textContent =
    sheet.def.status === 'placeholder' ? 'Placeholder art from the handoff zip' : 'Production art';
  hero = addPlayer({ col: 4, row: 4 }, { ...PRESETS.spike.loadout });
  hero.onEvent = onHeroEvent;
  hero.onActionEnd = (action, p) => {
    if (action === 'ability') p.setAction('loco_idle');
    if (action === 'shot_power') {
      p.setAction('loco_idle');
      if (preview?.action === 'shot_power') setTimeout(() => preview && applyPreview(), 600);
    }
  };
  selected = hero;
  resetBall();
  syncGearUi();
  resize();
  window.addEventListener('resize', resize);
  // Handle for browser automation and console poking.
  (window as unknown as { lab: unknown }).lab = { players, hero: () => hero, camera, renderer, shoot, resetBall, castMirage, mirageActive: () => !!mirage };
  requestAnimationFrame(tick);
}

boot().catch((err) => {
  document.getElementById('art-status')!.textContent = `Could not load sprites: ${err}`;
  console.error(err);
});
