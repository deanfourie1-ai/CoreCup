// The match view: the painted night-stadium pitch from the Sprite Lab with the real match on it.
//
// The engine moves the match on in whole steps; this stage turns each new state into something you can watch.
// Players run their hex paths, the ball travels between feet and hangs in the air while a pass or shot is in
// flight (it moves along as the timeline clock moves), shots end with a short scripted finish, and kick-off
// resets run everyone back into formation. While any of that is playing the stage reports `busy()`, so the
// AI waits and the human's highlights stay hidden until the pitch has settled.

import * as THREE from 'three';
import {
  ABILITIES,
  goalArea,
  hexKey,
  neighbours,
  reachable,
  RULES,
  sameHex,
  targetGoal,
  type Hex,
  type MatchEvent,
  type MatchState,
} from '../engine';
import { buildPitch, hexToWorld, worldToHex, PITCH_COLOURS, type HighlightTone, type Pitch } from '../lab/pitch';
import { loadSpriteSheet, type SpriteSheet } from '../sprites/atlas';
import { AbilityFx } from './ability-fx';
import { RUN, SpriteActor, TokenActor, type Actor } from './actors';
import { CHARACTER_ART } from './art';

export interface StageView {
  /** The robot whose turn it is (human side), for the gold ring and name tag. */
  active?: string;
  highlights: { hex: Hex; tone: HighlightTone }[];
}

const SHOT_WORDS = { goal: 'GOAL!', post: 'Off the post!', cleared: 'Cleared!', save: 'What a save!' } as const;
const REACTION_WORDS = { intercept: 'Intercept!', challenge: 'Challenge!', block: 'Block!', dive: 'Dive!' } as const;

/** Breadth-first path on the open grid (used for kick-off resets, where players may pass each other). */
function gridPath(from: Hex, to: Hex): Hex[] {
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
  if (!prev.has(hexKey(to))) return [to];
  const out: Hex[] = [];
  for (let cur: Hex | null = to; cur && !sameHex(cur, from); cur = prev.get(hexKey(cur)) ?? null) out.unshift(cur);
  return out;
}

function textSprite(
  text: string,
  opts: { colour?: string; size?: number; bg?: string; height?: number } = {},
): THREE.Sprite {
  const size = opts.size ?? 44;
  const c = document.createElement('canvas');
  const g = c.getContext('2d')!;
  const font = `800 ${size}px Saira, system-ui, sans-serif`;
  g.font = font;
  const w = Math.ceil(g.measureText(text).width) + size;
  c.width = w;
  c.height = Math.ceil(size * 1.6);
  g.font = font;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  if (opts.bg) {
    g.fillStyle = opts.bg;
    const r = c.height / 2;
    g.beginPath();
    g.roundRect(2, 2, w - 4, c.height - 4, r - 2);
    g.fill();
  }
  g.lineWidth = size / 7;
  g.strokeStyle = 'rgba(16,8,26,0.9)';
  g.strokeText(text, w / 2, c.height / 2 + 1);
  g.fillStyle = opts.colour ?? '#fffaf0';
  g.fillText(text, w / 2, c.height / 2 + 1);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, depthWrite: false }));
  const h = opts.height ?? 0.5;
  s.scale.set((h * c.width) / c.height, h, 1);
  s.renderOrder = 9000;
  return s;
}

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
  for (const [x, y] of [
    [32, 26],
    [26, 36],
    [38, 36],
  ]) {
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

/** A scripted ball move that overrides the normal ball target (a shot's finish). */
interface BallScript {
  from: THREE.Vector3;
  to: THREE.Vector3;
  t: number;
  dur: number;
  height: number;
  /** Seconds to rest at `to` afterwards. */
  hold: number;
}

export class MatchStage {
  readonly renderer: THREE.WebGLRenderer;
  readonly camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 200);
  private readonly scene = new THREE.Scene();
  private readonly pitch: Pitch;
  private readonly ball = makeBall();
  private readonly actors = new Map<string, Actor>();
  private readonly fx: AbilityFx;
  private readonly sheets = new Map<string, SpriteSheet>();
  private readonly activeRing: THREE.Mesh;
  private nameTag: THREE.Sprite | null = null;
  private nameTagFor = '';
  private landingTag: THREE.Sprite | null = null;
  private landingKey = '';
  private callouts: { s: THREE.Sprite; t: number; base: THREE.Vector3; robot?: string }[] = [];
  private banner: HTMLDivElement;
  private bannerTimer = 0;
  private state: MatchState | null = null;
  private view: StageView = { highlights: [] };
  private highlightsShown = false;
  private hoverHex: Hex | null = null;
  private ballScript: BallScript | null = null;
  /** Clock tick when the current flight was first seen (for placing the ball along its path). */
  private flightStart: { key: string; tick: number } | null = null;
  private ballWorld = new THREE.Vector3();
  private ballHeight = 0.16;
  private lastFaceKey = '';
  private settleTimer = 0;
  private raf = 0;
  private elapsed = 0;
  private readonly clock = new THREE.Clock();
  private readonly resizeObserver: ResizeObserver;
  private readonly raycaster = new THREE.Raycaster();
  private readonly ground = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  ready: Promise<void>;
  onHex?: (h: Hex) => void;

  constructor(private readonly host: HTMLElement) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.setClearColor(PITCH_COLOURS.night);
    host.appendChild(this.renderer.domElement);
    this.banner = document.createElement('div');
    this.banner.className = 'stage-banner';
    host.appendChild(this.banner);

    // The Sprite Lab's match camera: fixed, looking down at the whole pitch.
    this.camera.position.set(0, 16, 20);
    this.camera.lookAt(0, 0, 0.4);
    this.camera.updateMatrixWorld();

    this.fx = new AbilityFx(this.scene, this.actors);
    this.pitch = buildPitch();
    this.scene.add(this.pitch.group);
    this.scene.add(this.ball.sprite, this.ball.shadow);

    const ringGeo = new THREE.RingGeometry(0.56, 0.72, 48);
    ringGeo.rotateX(-Math.PI / 2);
    ringGeo.scale(1, 1, 0.8);
    this.activeRing = new THREE.Mesh(
      ringGeo,
      new THREE.MeshBasicMaterial({
        color: 0xffc757,
        transparent: true,
        opacity: 0.95,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      }),
    );
    this.activeRing.renderOrder = 5;
    this.activeRing.visible = false;
    this.scene.add(this.activeRing);

    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(host);
    this.resize();

    const el = this.renderer.domElement;
    el.addEventListener('pointermove', this.onPointerMove);
    el.addEventListener('pointerleave', this.onPointerLeave);
    el.addEventListener('click', this.onClick);

    this.ready = this.loadArt();
    this.raf = requestAnimationFrame(this.tick);
  }

  private async loadArt() {
    await Promise.all(
      Object.entries(CHARACTER_ART).map(async ([core, art]) => {
        try {
          this.sheets.set(core, await loadSpriteSheet(art.atlas));
        } catch (err) {
          console.warn(`Sprite art for ${core} not loaded; using a stand-in token.`, err);
        }
      }),
    );
  }

  dispose() {
    cancelAnimationFrame(this.raf);
    this.resizeObserver.disconnect();
    const el = this.renderer.domElement;
    el.removeEventListener('pointermove', this.onPointerMove);
    el.removeEventListener('pointerleave', this.onPointerLeave);
    el.removeEventListener('click', this.onClick);
    this.renderer.dispose();
    el.remove();
    this.banner.remove();
  }

  /** Same framing rule as the Sprite Lab at zoom 1, so players appear at the size the art was approved at. */
  private resize() {
    const w = this.host.clientWidth;
    const h = this.host.clientHeight;
    if (!w || !h) return;
    this.renderer.setSize(w, h);
    const aspect = w / h;
    const halfW = Math.max(13.6, 8.6 * aspect);
    const halfH = halfW / aspect;
    Object.assign(this.camera, { left: -halfW, right: halfW, top: halfH, bottom: -halfH });
    this.camera.updateProjectionMatrix();
  }

  // ---------------------------------------------------------------- state in

  /** Show a new match state. Anything that changed since the last one is animated. */
  sync(state: MatchState, view: StageView) {
    this.view = view;
    const prev = this.state;
    this.state = state;
    if (!this.sheets.size && !prev) {
      // Art still loading: build the actors once it's in.
      this.ready.then(() => this.state === state && this.build(state));
      return;
    }
    if (!prev || this.actors.size === 0 || prev.seed !== state.seed || state.log.length < prev.log.length) {
      this.build(state);
      return;
    }
    this.animate(prev, state);
  }

  private build(state: MatchState) {
    for (const a of this.actors.values()) this.scene.remove(...a.objects);
    this.actors.clear();
    for (const r of state.robots) {
      const art = CHARACTER_ART[r.core];
      const sheet = this.sheets.get(r.core);
      const actor: Actor =
        art && sheet
          ? new SpriteActor(r.id, r.team, r.pos, sheet, this.camera, !!art.keeperStance)
          : new TokenActor(r.id, r, this.camera);
      actor.place(r.pos);
      this.actors.set(r.id, actor);
      this.scene.add(...actor.objects);
    }
    this.fx.clear();
    this.fx.sync(state);
    this.ballScript = null;
    this.flightStart = null;
    const target = this.ballTarget(state);
    this.ballWorld.copy(target.pos);
    this.ballHeight = target.height;
    this.lastFaceKey = '';
  }

  private animate(prev: MatchState, s: MatchState) {
    const events = s.log.slice(prev.log.length);
    const moveAction = new Map<string, { to: Hex; steps: number; sprint: boolean }>();
    /** Runs made by an ability (Unchained Dash, Labyrinth Charge), hex by hex. */
    const abilityRun = new Map<string, Hex[]>();
    let reset = false;
    for (const e of events) {
      if (e.t === 'ability') {
        const colour = ABILITIES[e.core]?.colour ?? PITCH_COLOURS.gold;
        this.callout(e.robot, `${e.name}!`, colour);
        this.fx.burst(e.robot, colour);
        if (e.path?.length) abilityRun.set(e.robot, e.path);
      }
      if (e.t === 'decoy') this.callout(e.robot, 'Fooled!', ABILITIES.Kitsune.colour);
      if (e.t === 'walled') this.hexCallout(e.at, e.what === 'shot' ? 'Walled off!' : 'Stopped by the wall!', '#f0e2c0');
      if (e.t === 'action') {
        const a = e.action;
        if (a.type === 'move') moveAction.set(a.robot, { to: a.to, steps: 1, sprint: false });
        if (a.type === 'sprint') moveAction.set(a.robot, { to: a.to, steps: 1 + RULES.sprintExtraHexes, sprint: true });
        if (a.type === 'tackle') this.callout(a.robot, 'Tackle!', PITCH_COLOURS.sprint);
        if (a.type === 'intercept') this.callout(a.robot, 'Intercept!', PITCH_COLOURS.move);
        if (a.type === 'shoot') this.callout(a.robot, `${a.kind[0].toUpperCase()}${a.kind.slice(1)} shot!`, PITCH_COLOURS.target);
        if (a.type === 'hold') this.callout(a.robot, 'Hold', '#e8e0cf');
      }
      if (e.t === 'reaction') this.callout(e.robot, REACTION_WORDS[e.kind], PITCH_COLOURS.move);
      if (e.t === 'shot') this.shotFinish(prev, e);
      if (e.t === 'goal' || e.t === 'halftime') reset = true;
      if (e.t === 'halftime') this.showBanner('Half time', false, 1.6);
      if (e.t === 'fulltime') this.showBanner('Full time', false, 2.4);
      if (e.t === 'possession' && e.robot) {
        const before = prev.ball.state === 'held' ? prev.robots.find((r) => r.id === (prev.ball as { by: string }).by) : undefined;
        const after = s.robots.find((r) => r.id === e.robot);
        if (before && after && before.team !== after.team) this.callout(after.id, 'Won it!', PITCH_COLOURS.gold);
      }
    }

    for (const r of s.robots) {
      const actor = this.actors.get(r.id);
      const was = prev.robots.find((x) => x.id === r.id);
      if (!actor || !was || sameHex(was.pos, r.pos)) continue;
      const mv = moveAction.get(r.id);
      const run = abilityRun.get(r.id);
      if (run && !reset) {
        const end = run.findIndex((h) => sameHex(h, r.pos));
        actor.runTo(end >= 0 ? run.slice(0, end + 1) : [...run, r.pos], RUN * 1.6);
      } else if (mv && !reset) {
        const full = reachable(prev, was, mv.steps).get(hexKey(mv.to)) ?? [was.pos, mv.to];
        // A lost Challenge stops the walk early: run only as far as the robot got.
        const end = full.findIndex((h) => sameHex(h, r.pos));
        const path = (end >= 0 ? full.slice(0, end + 1) : [...full, r.pos]).slice(1);
        actor.runTo(path, mv.sprint ? RUN * 1.35 : RUN);
      } else {
        // Kick-off reset: jog back into formation, a little quicker than match pace.
        actor.runTo(gridPath(actor.hex, r.pos), RUN * 1.6);
      }
    }
    if (reset) this.settleTimer = Math.max(this.settleTimer, 0.4);
    this.fx.sync(s);
  }

  /** The ball's finish for a shot: into the net, against the post, cleared away, or into the keeper's hands. */
  private shotFinish(prev: MatchState, e: Extract<MatchEvent, { t: 'shot' }>) {
    const shooter = prev.robots.find((r) => r.id === e.shooter)!;
    const goalHex = targetGoal(shooter.team);
    const east = goalHex.col > 6;
    const g = east ? this.pitch.goalCentre.east : this.pitch.goalCentre.west;
    // Left / centre / right from the shooter's view: facing east, left is up the screen (-z).
    const side = { left: -1, centre: 0, right: 1 }[e.corner] * (east ? 1 : -1);
    const from = this.ballWorld.clone();
    let to: THREE.Vector3;
    let height = 0.6;
    switch (e.outcome) {
      case 'goal':
        to = g.clone().add(new THREE.Vector3(east ? 0.5 : -0.5, 0, side * 1.4));
        height = 0.9;
        break;
      case 'post':
        to = g.clone().add(new THREE.Vector3(east ? -0.35 : 0.35, 0, (side || 1) * 2.15));
        break;
      case 'save': {
        const keeper = prev.robots.find((r) => r.team !== shooter.team && r.role === 'Keeper');
        to = keeper ? hexToWorld(keeper.pos) : g.clone();
        break;
      }
      default:
        to = g.clone().add(new THREE.Vector3(east ? -0.6 : 0.6, 0, side * 1.2));
    }
    this.ballScript = { from, to, t: 0, dur: 0.55, height, hold: e.outcome === 'goal' ? 1.1 : 0.35 };
    this.showBanner(SHOT_WORDS[e.outcome], e.outcome === 'goal', e.outcome === 'goal' ? 2.2 : 1.5);
  }

  private callout(robotId: string, text: string, colour: string) {
    const a = this.actors.get(robotId);
    if (!a) return;
    const s = textSprite(text, { colour, height: 0.7 });
    // Stack callouts that land on the same robot together ("Tentacle Grab!" then "Fooled!").
    const stacked = this.callouts.filter((c) => c.robot === robotId && c.t < 0.9).length;
    const base = a.pos.clone().setY(a.height + 0.75 + stacked * 0.6);
    s.position.copy(base);
    this.scene.add(s);
    this.callouts.push({ s, t: 0, base, robot: robotId });
  }

  private hexCallout(h: Hex, text: string, colour: string) {
    const s = textSprite(text, { colour, height: 0.6 });
    const base = hexToWorld(h).setY(1.2);
    s.position.copy(base);
    this.scene.add(s);
    this.callouts.push({ s, t: 0, base });
  }

  private showBanner(text: string, big: boolean, seconds: number) {
    this.banner.textContent = text;
    this.banner.className = `stage-banner show${big ? ' big' : ''}`;
    this.bannerTimer = seconds;
  }

  /**
   * Like `busy`, but ignores players still running. Off-ball shape moves use it, so a team shifts together instead
   * of one robot at a time.
   */
  settling(): boolean {
    if (!this.state || !this.actors.size) return true;
    if (this.settleTimer > 0 || this.ballScript) return true;
    const target = this.ballTarget(this.state);
    return this.ballWorld.distanceTo(target.pos) > 0.08;
  }

  /** True while anything on the pitch is still playing out (runs, the ball travelling, a shot's finish). */
  busy(): boolean {
    if (!this.state || !this.actors.size) return true;
    if (this.settleTimer > 0 || this.ballScript) return true;
    for (const a of this.actors.values()) if (a.moving) return true;
    const target = this.ballTarget(this.state);
    return this.ballWorld.distanceTo(target.pos) > 0.08;
  }

  // ---------------------------------------------------------------- ball

  /** Where the ball should be for a state: at the holder's feet, on its loose hex, or along its flight. */
  private ballTarget(s: MatchState): { pos: THREE.Vector3; height: number } {
    const b = s.ball;
    if (b.state === 'held') {
      const a = this.actors.get(b.by);
      const r = s.robots.find((x) => x.id === b.by)!;
      const p = a ? a.pos.clone() : hexToWorld(r.pos);
      // Just in front of the feet, towards the goal they attack, slightly nearer the camera.
      p.x += r.team === 'home' ? 0.38 : -0.38;
      p.z += 0.18;
      return { pos: p, height: 0.16 };
    }
    if (b.state === 'loose') return { pos: hexToWorld(b.at), height: 0.16 };
    const f = b.flight;
    const key = `${f.kicker}|${f.landTick}|${f.type}`;
    if (!this.flightStart || this.flightStart.key !== key) this.flightStart = { key, tick: s.clock };
    const span = Math.max(1, f.landTick - this.flightStart.tick);
    const u = Math.min(1, Math.max(0, (s.clock - this.flightStart.tick) / span));
    const from = hexToWorld(f.from);
    const to = f.type === 'pass' ? hexToWorld(f.to) : (targetGoal(f.team).col > 6 ? this.pitch.goalCentre.east : this.pitch.goalCentre.west).clone();
    // Hang a little short of the landing spot until it actually lands.
    const shown = Math.min(u, 0.82) * 0.92 + 0.08;
    const pos = from.lerp(to, shown);
    const loft = f.type === 'pass' ? (f.kind === 'lofted' ? 1.6 : 0.05) : f.kind === 'chip' ? 1.4 : 0.45;
    return { pos, height: 0.16 + Math.sin(shown * Math.PI) * loft };
  }

  private updateBall(dt: number) {
    if (!this.state) return;
    let pos: THREE.Vector3;
    let height: number;
    if (this.ballScript) {
      const sc = this.ballScript;
      sc.t += dt;
      const u = Math.min(1, sc.t / sc.dur);
      pos = sc.from.clone().lerp(sc.to, u);
      height = 0.16 + Math.sin(u * Math.PI) * sc.height * (1 - u * 0.4);
      this.ballWorld.copy(pos);
      this.ballHeight = height;
      if (sc.t >= sc.dur + sc.hold) this.ballScript = null;
    } else {
      const target = this.ballTarget(this.state);
      const d = target.pos.clone().sub(this.ballWorld);
      const dist = d.length();
      // Fast chase so passes look like kicks and dribbles stay glued to the feet.
      const max = (this.state.ball.state === 'held' && dist < 0.6 ? 30 : 11) * dt;
      if (dist <= max) this.ballWorld.copy(target.pos);
      else this.ballWorld.addScaledVector(d, max / dist);
      this.ballHeight += (target.height - this.ballHeight) * Math.min(1, dt * 10);
      // Dribble bob while the carrier runs.
      const b = this.state.ball;
      if (b.state === 'held' && this.actors.get(b.by)?.moving) this.ballHeight = 0.16 + Math.abs(Math.sin(this.elapsed * 9)) * 0.08;
    }
    this.ball.sprite.position.set(this.ballWorld.x, this.ballHeight, this.ballWorld.z);
    this.ball.shadow.position.set(this.ballWorld.x, 0.08, this.ballWorld.z);
    this.ball.sprite.renderOrder = 100 + Math.round((this.ballWorld.z + 0.2 + 20) * 10) + 1;
  }

  // ---------------------------------------------------------------- input

  private pointerToHex(ev: MouseEvent): Hex | null {
    const r = this.renderer.domElement.getBoundingClientRect();
    const ndc = new THREE.Vector2(((ev.clientX - r.left) / r.width) * 2 - 1, -((ev.clientY - r.top) / r.height) * 2 + 1);
    const lit = new Set(this.view.highlights.map((h) => hexKey(h.hex)));
    this.raycaster.setFromCamera(ndc, this.camera);
    const hit = new THREE.Vector3();
    const groundHex = this.raycaster.ray.intersectPlane(this.ground, hit) ? worldToHex(hit.x, hit.z) : null;
    if (groundHex && lit.has(hexKey(groundHex))) return groundHex;
    // Clicking a player's body (which stands up over the hexes behind it) means that player's hex.
    let best: { hex: Hex; z: number } | null = null;
    for (const a of this.actors.values()) {
      if (!lit.has(hexKey(a.hex))) continue;
      const foot = a.pos.clone().project(this.camera);
      const head = a.pos.clone().setY(a.height).project(this.camera);
      const halfW = (0.5 / (this.camera.right - this.camera.left)) * 2;
      if (ndc.x < foot.x - halfW || ndc.x > foot.x + halfW || ndc.y < foot.y - 0.02 || ndc.y > head.y) continue;
      if (!best || a.pos.z > best.z) best = { hex: a.hex, z: a.pos.z };
    }
    return best?.hex ?? groundHex;
  }

  private onPointerMove = (ev: PointerEvent) => {
    const h = this.highlightsShown ? this.pointerToHex(ev) : null;
    const lit = h && this.view.highlights.some((x) => sameHex(x.hex, h));
    this.hoverHex = lit ? h : null;
    this.renderer.domElement.style.cursor = lit ? 'pointer' : 'default';
  };

  private onPointerLeave = () => {
    this.hoverHex = null;
  };

  private onClick = (ev: MouseEvent) => {
    if (!this.highlightsShown) return;
    const h = this.pointerToHex(ev);
    if (h && this.view.highlights.some((x) => sameHex(x.hex, h))) this.onHex?.(h);
  };

  /** Screen position (client pixels) of a hex centre, for tests and automation. */
  hexToClient(h: Hex): { x: number; y: number } {
    const p = hexToWorld(h).project(this.camera);
    const r = this.renderer.domElement.getBoundingClientRect();
    return { x: r.left + ((p.x + 1) / 2) * r.width, y: r.top + ((1 - p.y) / 2) * r.height };
  }

  // ---------------------------------------------------------------- frame loop

  private tick = () => {
    const dt = Math.min(this.clock.getDelta(), 0.05);
    this.elapsed += dt;
    const s = this.state;

    if (s && this.actors.size) {
      // Standing players face the ball; a keeper at home in the goal area takes the ready stance.
      const ballKey = `${Math.round(this.ballWorld.x * 2)},${Math.round(this.ballWorld.z * 2)}`;
      const refacing = ballKey !== this.lastFaceKey;
      this.lastFaceKey = ballKey;
      const ownArea = { home: new Set(goalArea('home').map(hexKey)), away: new Set(goalArea('away').map(hexKey)) };
      for (const r of s.robots) {
        const a = this.actors.get(r.id);
        if (!a) continue;
        a.setStance(r.role === 'Keeper' && ownArea[r.team].has(hexKey(r.pos)) && sameHex(a.hex, r.pos));
        if (refacing && !a.moving) a.lookAt(this.ballWorld.x, this.ballWorld.z);
        a.update(dt, this.elapsed);
      }
      this.updateBall(dt);
      this.fx.update(dt, this.elapsed);
    }

    if (this.settleTimer > 0) this.settleTimer -= dt;
    const busy = this.busy();

    // Highlights and the active player's ring only once the pitch has settled.
    const show = !busy && this.view.highlights.length > 0;
    if (show !== this.highlightsShown || show) {
      this.pitch.setHighlights(show ? this.view.highlights : []);
      this.highlightsShown = show;
    }
    const hover = show && this.hoverHex;
    this.pitch.hover.visible = !!hover;
    if (hover) this.pitch.hover.position.copy(hexToWorld(hover)).setY(0.08);

    const active = !busy && this.view.active ? this.actors.get(this.view.active) : undefined;
    this.activeRing.visible = !!active;
    if (active) {
      this.activeRing.position.set(active.pos.x, 0.08, active.pos.z);
      const pulse = 1 + 0.07 * Math.sin(this.elapsed * 5);
      this.activeRing.scale.set(pulse, 1, pulse);
    }
    this.updateNameTag(active);
    this.updateLanding(s);

    for (let i = this.callouts.length - 1; i >= 0; i--) {
      const c = this.callouts[i];
      c.t += dt;
      c.s.position.copy(c.base).setY(c.base.y + c.t * 0.5);
      (c.s.material as THREE.SpriteMaterial).opacity = Math.min(1, 3 - c.t * 2.2);
      if (c.t > 1.35) {
        this.scene.remove(c.s);
        this.callouts.splice(i, 1);
      }
    }
    if (this.bannerTimer > 0) {
      this.bannerTimer -= dt;
      if (this.bannerTimer <= 0) this.banner.className = 'stage-banner';
    }

    this.renderer.render(this.scene, this.camera);
    this.raf = requestAnimationFrame(this.tick);
  };

  private updateNameTag(active: Actor | undefined) {
    const id = active?.robotId ?? '';
    if (id !== this.nameTagFor) {
      if (this.nameTag) this.scene.remove(this.nameTag);
      this.nameTag = null;
      this.nameTagFor = id;
      const r = this.state?.robots.find((x) => x.id === id);
      if (r) {
        this.nameTag = textSprite(`${r.name} · your move`, { size: 40, height: 0.46, bg: 'rgba(26,14,36,0.82)', colour: '#ffd36b' });
        this.scene.add(this.nameTag);
      }
    }
    if (this.nameTag && active) this.nameTag.position.set(active.pos.x, active.height + 0.55, active.pos.z);
  }

  private updateLanding(s: MatchState | null) {
    const f = s?.ball.state === 'flight' ? s.ball.flight : undefined;
    const at = f ? (f.type === 'pass' ? f.to : targetGoal(f.team)) : null;
    this.pitch.setLanding(at);
    const key = f && at ? `${hexKey(at)}|${f.landTick}` : '';
    if (key !== this.landingKey) {
      if (this.landingTag) this.scene.remove(this.landingTag);
      this.landingTag = null;
      this.landingKey = key;
      if (f && at) {
        this.landingTag = textSprite(`lands t${f.landTick}`, { size: 36, height: 0.42, colour: '#ffd9ec', bg: 'rgba(26,14,36,0.75)' });
        const p = hexToWorld(at);
        this.landingTag.position.set(p.x, 0.15, p.z + 0.95);
        this.scene.add(this.landingTag);
      }
    }
  }
}

