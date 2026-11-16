// One on-pitch sprite player: a camera-facing quad whose texture is the
// paper-doll composite of the current frame.

import * as THREE from 'three';
import type { Direction, Hex } from '../engine/hex';
import { resolveFrame, type SpriteSheet } from '../sprites/atlas';
import { composeFrame } from '../sprites/compose';
import { directionFromVector } from '../sprites/facing';
import { loadoutKey, type Loadout } from '../sprites/loadout';
import type { ActionName, Anchors, SpriteEvent } from '../sprites/schema';
import { hexToWorld } from './pitch';

/** World height of the whole 256x352 frame; the character is ~86% of it (about 1.15 hex widths tall). */
export const FRAME_WORLD_H = 2.3;
/** World units per frame pixel. Fixed (2.3 units per 352 px), so a taller canvas adds headroom
 *  around her instead of shrinking her. */
export const WORLD_PER_PX = FRAME_WORLD_H / 352;
const RUN_SPEED = 3.8; // world units per second (about 2.2 hexes a second)
/** How often animated gear (glows, flames) is redrawn between frame changes. */
const GLOW_HZ = 12;

export class SpritePlayer {
  readonly mesh: THREE.Mesh;
  readonly shadow: THREE.Mesh;
  readonly pos = new THREE.Vector3();
  hex: Hex;
  dir: Direction = 'E';
  action: ActionName = 'loco_idle';
  loadout: Loadout;
  showAnchors = false;
  /** Ground speed while running, in world units per second (the run cycle keeps pace with it). */
  speed = RUN_SPEED;
  /** Called on animation events (foot contact, ball release). */
  onEvent?: (e: SpriteEvent, p: SpritePlayer) => void;
  /** Called when a non-looping action finishes. */
  onActionEnd?: (action: ActionName, p: SpritePlayer) => void;
  /** Anchors of the frame on screen, for attaching effects. */
  anchors: Anchors = {};
  composites = 0;

  private readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  /** The live composite; Fox Mirage ghosts share it. */
  readonly texture: THREE.CanvasTexture;
  private readonly k: number; // world units per frame pixel
  private frameIndex = 0;
  private frameClock = 0;
  private glowClock = 0;
  private lastKey = '';
  private path: Hex[] = [];
  private finished = false;

  constructor(
    private readonly sheet: SpriteSheet,
    hex: Hex,
    loadout: Loadout,
    private readonly camera: THREE.Camera,
  ) {
    const [w, h] = sheet.def.frameSize;
    this.hex = hex;
    this.loadout = loadout;
    this.pos.copy(hexToWorld(hex));
    this.canvas = document.createElement('canvas');
    this.canvas.width = w;
    this.canvas.height = h;
    this.ctx = this.canvas.getContext('2d')!;
    this.texture = new THREE.CanvasTexture(this.canvas);
    this.texture.colorSpace = THREE.SRGBColorSpace;
    this.texture.minFilter = THREE.LinearMipmapLinearFilter;
    this.texture.anisotropy = 4;

    this.k = WORLD_PER_PX;
    const geo = new THREE.PlaneGeometry(w * this.k, h * this.k);
    // PlaneGeometry is centred; move it so the foot pivot sits at the mesh origin.
    const [px, py] = sheet.pivot;
    geo.translate((w / 2 - px) * this.k, (py - h / 2) * this.k, 0);
    this.mesh = new THREE.Mesh(
      geo,
      new THREE.MeshBasicMaterial({
        map: this.texture,
        transparent: true,
        depthTest: false,
        depthWrite: false,
        side: THREE.DoubleSide, // mirrored facings flip the quad
      }),
    );

    const sc = document.createElement('canvas');
    sc.width = sc.height = 64;
    const sctx = sc.getContext('2d')!;
    const grad = sctx.createRadialGradient(32, 32, 0, 32, 32, 32);
    grad.addColorStop(0, 'rgba(0,0,0,0.55)');
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    sctx.fillStyle = grad;
    sctx.fillRect(0, 0, 64, 64);
    const sgeo = new THREE.PlaneGeometry(1.1, 0.5);
    sgeo.rotateX(-Math.PI / 2);
    this.shadow = new THREE.Mesh(
      sgeo,
      new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(sc), transparent: true, depthWrite: false }),
    );
    this.shadow.renderOrder = 3;
    this.redraw(0);
  }

  /** Screen-space corners of this player's quad, for keeping the whole sprite in view. */
  quadCorners(): THREE.Vector3[] {
    const box = this.mesh.geometry.boundingBox ?? (this.mesh.geometry.computeBoundingBox(), this.mesh.geometry.boundingBox!);
    this.mesh.updateMatrixWorld();
    return [
      [box.min.x, box.min.y],
      [box.max.x, box.min.y],
      [box.min.x, box.max.y],
      [box.max.x, box.max.y],
    ].map(([x, y]) => this.mesh.localToWorld(new THREE.Vector3(x, y, 0)));
  }

  get moving(): boolean {
    return this.path.length > 0;
  }

  setAction(action: ActionName) {
    if (action === this.action && !this.finished) return;
    this.action = action;
    this.frameIndex = 0;
    this.frameClock = 0;
    this.finished = false;
    this.lastKey = '';
    this.fireEvents();
  }

  face(dir: Direction) {
    this.dir = dir;
    this.lastKey = '';
  }

  runTo(path: Hex[]) {
    this.path = path.slice();
    if (this.path.length) this.setAction('loco_jog');
  }

  stop() {
    this.path = [];
  }

  /** Jump straight to a hex (Fox Mirage swap). */
  place(hex: Hex) {
    this.path = [];
    this.hex = hex;
    this.pos.copy(hexToWorld(hex));
  }

  /** World position of an anchor on the current frame. */
  anchorWorld(name: keyof Anchors): THREE.Vector3 | null {
    const a = this.anchors[name];
    if (!a) return null;
    const [px, py] = this.sheet.pivot;
    const local = new THREE.Vector3((a[0] - px) * this.k, (py - a[1]) * this.k, 0);
    this.mesh.updateMatrixWorld();
    return this.mesh.localToWorld(local);
  }

  update(dt: number, t: number) {
    // Movement along the queued hex path.
    if (this.path.length) {
      const target = hexToWorld(this.path[0]);
      const d = target.clone().sub(this.pos);
      const dist = Math.hypot(d.x, d.z);
      if (dist > 0.02) this.dir = directionFromVector(d.x, d.z);
      const stepLen = this.speed * dt;
      if (dist <= stepLen) {
        this.pos.copy(target);
        this.hex = this.path.shift()!;
        if (!this.path.length) this.setAction('loco_idle');
      } else {
        this.pos.addScaledVector(d, stepLen / dist);
      }
    }

    // Animation clock.
    const action = this.sheet.def.actions[this.action]!;
    this.frameClock += dt;
    // Lock the run cycle to ground speed so feet don't skate: one loop covers `stride_px` of ground.
    const view = resolveFrame(this.sheet.def, this.action, this.dir, 0).view;
    const steps = action.views[view]!.length;
    const stride = action.stride_px_by_view?.[view] ?? action.stride_px;
    const fps = stride && this.moving ? (steps * this.speed) / (stride * this.k) : action.fps;
    const frameDur = 1 / fps;
    while (this.frameClock >= frameDur && !this.finished) {
      this.frameClock -= frameDur;
      const rf = resolveFrame(this.sheet.def, this.action, this.dir, this.frameIndex);
      const n = action.views[rf.view]!.length;
      if (!action.loop && this.frameIndex >= n - 1) {
        this.finished = true;
        this.onActionEnd?.(this.action, this);
        break;
      }
      this.frameIndex++;
      this.fireEvents();
    }

    // Composite when the frame, facing or loadout changed, plus a slow tick for glows.
    this.glowClock += dt;
    const key = `${this.action}|${this.dir}|${this.frameIndex}|${loadoutKey(this.loadout)}|${this.showAnchors}`;
    const animatedGear = this.loadout.core > 0 || this.loadout.boots === 3 || Object.values(this.loadout).includes(3);
    if (key !== this.lastKey || (animatedGear && this.glowClock > 1 / GLOW_HZ)) {
      this.redraw(t);
      this.lastKey = key;
      this.glowClock = 0;
    }

    this.mesh.position.copy(this.pos);
    this.mesh.quaternion.copy(this.camera.quaternion);
    this.shadow.position.set(this.pos.x, 0.07, this.pos.z);
    // Nearer the camera (larger z) draws later.
    this.mesh.renderOrder = 100 + Math.round((this.pos.z + 20) * 10);
  }

  private fireEvents() {
    if (!this.onEvent) return;
    const action = this.sheet.def.actions[this.action]!;
    for (const e of action.events) if (e.frame === this.frameIndex) this.onEvent(e, this);
  }

  redraw(t: number) {
    const rf = resolveFrame(this.sheet.def, this.action, this.dir, this.frameIndex);
    this.anchors = composeFrame(this.ctx, this.sheet, rf, this.loadout, t, { showAnchors: this.showAnchors });
    this.mesh.scale.x = rf.mirror ? -1 : 1;
    this.texture.needsUpdate = true;
    this.composites++;
  }
}
