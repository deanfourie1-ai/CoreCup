// Fox Mirage: the Kitsune core's ability, as a rendering spike for the Sprite Lab.
//
// Rendering only. When abilities exist in the rules engine, the engine decides the
// decoy hexes, who reacts and whether a swap happens, and this plays it back.
//
//   Spark     one decoy (pink hex marker and a translucent ghost) that draws a reaction
//   Surge     not designed yet, so it plays as Spark
//   Ascended  two decoys (two reactions), then she swaps places with one in a foxfire streak
//
// Timeline (seconds after the cast): 0-0.6 focus (foxfire gathers around her),
// 0.6 release (flames fly to the decoy hexes, ghosts appear), 1.4 swap
// (Ascended), 3.4 the ghosts dissolve.

import * as THREE from 'three';
import { DIRECTIONS, inPitch, step, type Direction, type Hex } from '../engine/hex';
import { directionFromVector } from '../sprites/facing';
import type { Tier } from '../sprites/loadout';
import { HEX_R, hexToWorld } from './pitch';
import type { SpritePlayer } from './player';

export const MIRAGE_TIER_NAMES = ['Spark', 'Spark', 'Surge (not designed yet, shown as Spark)', 'Ascended'] as const;

const FOCUS = 0.6;
const FLY = 0.25;
const SWAP_AT = 1.4;
const DISSOLVE_AT = 3.4;
const END = 3.9;
const PINK = new THREE.Color('#ff6f9e');
const FLAMES = 10;

interface Decoy {
  hex: Hex;
  pos: THREE.Vector3;
  marker: THREE.Group;
  ghost: THREE.Mesh;
  /** Additive pink copy over the ghost, so it reads as foxfire rather than a dim copy. */
  glow: THREE.Mesh;
}

interface Lure {
  player: SpritePlayer;
  /** Foxfire wisps drifting along an arc from the player to the decoy. */
  wisps: THREE.Sprite[];
  alert: THREE.Sprite;
}

export class FoxMirage {
  private t = 0;
  private released = false;
  private swapped = false;
  private readonly decoys: Decoy[] = [];
  private readonly flames: THREE.Sprite[] = [];
  private readonly lures: Lure[] = [];
  private streak?: { mesh: THREE.Mesh; t: number };
  private readonly root = new THREE.Group();
  done = false;

  constructor(
    private readonly scene: THREE.Scene,
    private readonly camera: THREE.Camera,
    private readonly hero: SpritePlayer,
    private readonly tier: Tier,
    private readonly others: SpritePlayer[],
    private readonly onRelease?: () => void,
  ) {
    scene.add(this.root);
    const tex = flameTexture();
    for (let i = 0; i < FLAMES; i++) {
      const s = new THREE.Sprite(
        new THREE.SpriteMaterial({ map: tex, color: i % 3 ? PINK : new THREE.Color('#ffb070'), transparent: true, depthTest: false, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0 }),
      );
      s.scale.setScalar(0.32);
      s.renderOrder = 5000;
      this.flames.push(s);
      this.root.add(s);
    }
    const hexes = decoyHexes(hero.hex, hero.dir, tier >= 3 ? 2 : 1);
    for (const hex of hexes) this.decoys.push(this.makeDecoy(hex));
  }

  get tierName(): string {
    return MIRAGE_TIER_NAMES[this.tier];
  }

  update(dt: number) {
    if (this.done) return;
    this.t += dt;
    const t = this.t;
    const heroPos = this.hero.pos;

    // Flames: orbit and gather during focus, then fly to the decoys.
    this.flames.forEach((f, i) => {
      const m = f.material as THREE.SpriteMaterial;
      if (t < FOCUS) {
        const u = t / FOCUS;
        const a = (i / FLAMES) * Math.PI * 2 + t * 7;
        const r = 0.9 - 0.45 * u;
        f.position.set(heroPos.x + Math.cos(a) * r, 0.25 + u * 1.1 + 0.15 * Math.sin(a * 2), heroPos.z + Math.sin(a) * r * 0.6);
        m.opacity = Math.min(1, u * 2.5);
      } else if (t < FOCUS + FLY) {
        const u = (t - FOCUS) / FLY;
        const d = this.decoys[i % this.decoys.length].pos;
        const from = new THREE.Vector3(heroPos.x, 1.35, heroPos.z);
        f.position.lerpVectors(from, new THREE.Vector3(d.x, 0.9, d.z), u);
        f.position.y += Math.sin(u * Math.PI) * 0.6;
        m.opacity = 1 - u * 0.3;
      } else {
        m.opacity = Math.max(0, m.opacity - dt * 4);
      }
    });

    if (!this.released && t >= FOCUS + FLY * 0.6) {
      this.released = true;
      this.onRelease?.();
      this.lureNearest(this.tier >= 3 ? 2 : 1); // each decoy draws a reaction
    }

    // Decoys: marker and ghost fade in on release, flicker, dissolve upwards at the end.
    for (const d of this.decoys) {
      const appear = clamp01((t - FOCUS - FLY * 0.5) / 0.3);
      const vanish = clamp01((t - DISSOLVE_AT) / (END - DISSOLVE_AT));
      const flicker = 0.85 + 0.15 * Math.sin(t * 31 + d.pos.x * 3) * Math.sin(t * 13);
      const ghostMat = d.ghost.material as THREE.MeshBasicMaterial;
      ghostMat.opacity = 0.62 * appear * (1 - vanish) * flicker;
      d.ghost.position.set(d.pos.x + Math.sin(t * 23) * 0.015, vanish * 0.6, d.pos.z);
      d.ghost.quaternion.copy(this.camera.quaternion);
      d.ghost.scale.set(this.hero.mesh.scale.x, 1 + vanish * 0.25, 1);
      d.ghost.renderOrder = 100 + Math.round((d.pos.z + 20) * 10);
      d.glow.position.copy(d.ghost.position);
      d.glow.quaternion.copy(d.ghost.quaternion);
      d.glow.scale.copy(d.ghost.scale);
      d.glow.renderOrder = d.ghost.renderOrder + 1;
      (d.glow.material as THREE.MeshBasicMaterial).opacity = ghostMat.opacity * 0.75;
      const pulse = 1 + 0.05 * Math.sin(t * 6);
      d.marker.scale.set(pulse, 1, pulse);
      d.marker.position.set(d.pos.x, 0.06, d.pos.z);
      for (const c of d.marker.children) {
        const mat = (c as THREE.Mesh).material as THREE.MeshBasicMaterial;
        mat.opacity = (c.userData.base as number) * appear * (1 - vanish);
      }
    }

    // Reactions: foxfire wisps beckon the fooled players towards the decoy.
    for (const l of this.lures) {
      const d = this.decoys[0].pos;
      const fade = 1 - clamp01((t - DISSOLVE_AT) / (END - DISSOLVE_AT));
      const p = l.player.pos;
      l.wisps.forEach((w, i) => {
        const u = (i / l.wisps.length + t * 0.45) % 1;
        w.position.set(THREE.MathUtils.lerp(p.x, d.x, u), 0.5 + Math.sin(u * Math.PI) * 0.9, THREE.MathUtils.lerp(p.z, d.z, u));
        (w.material as THREE.SpriteMaterial).opacity = fade * Math.sin(u * Math.PI) * 0.95;
      });
      l.alert.position.set(p.x, 2.35 + 0.08 * Math.sin(t * 8), p.z);
      (l.alert.material as THREE.SpriteMaterial).opacity = fade;
      if (!l.player.moving) l.player.face(directionFromVector(d.x - p.x, d.z - p.z));
    }

    // Ascended: swap places with the first decoy.
    if (this.tier >= 3 && !this.swapped && t >= SWAP_AT) {
      this.swapped = true;
      const d = this.decoys[0];
      const from = heroPos.clone();
      this.streak = { mesh: streakMesh(from, d.pos), t: 0 };
      this.root.add(this.streak.mesh);
      const oldHex = this.hero.hex;
      this.hero.place(d.hex);
      d.hex = oldHex;
      d.pos.copy(from);
    }
    if (this.streak) {
      this.streak.t += dt;
      const m = this.streak.mesh.material as THREE.MeshBasicMaterial;
      m.opacity = Math.max(0, 1 - this.streak.t / 0.45);
    }

    if (t >= END) this.dispose();
  }

  dispose() {
    this.done = true;
    this.scene.remove(this.root);
    for (const d of this.decoys) this.scene.remove(d.ghost, d.glow);
    this.root.traverse((o) => {
      const m = o as THREE.Mesh;
      m.geometry?.dispose();
      (m.material as THREE.Material | undefined)?.dispose?.();
    });
  }

  private makeDecoy(hex: Hex): Decoy {
    const pos = hexToWorld(hex);
    const marker = new THREE.Group();
    const fillGeo = new THREE.CircleGeometry(HEX_R * 0.92, 6, Math.PI / 6);
    fillGeo.rotateX(-Math.PI / 2);
    const fill = new THREE.Mesh(fillGeo, new THREE.MeshBasicMaterial({ color: PINK, transparent: true, opacity: 0, depthWrite: false }));
    fill.userData.base = 0.38;
    const edgeGeo = new THREE.RingGeometry(HEX_R * 0.8, HEX_R * 0.95, 6, 1, Math.PI / 6);
    edgeGeo.rotateX(-Math.PI / 2);
    const edge = new THREE.Mesh(edgeGeo, new THREE.MeshBasicMaterial({ color: '#ff8fb6', transparent: true, opacity: 0, depthWrite: false }));
    edge.userData.base = 0.95;
    fill.renderOrder = edge.renderOrder = 4;
    marker.add(fill, edge);
    this.root.add(marker);

    // The ghost shares her live texture, so it mirrors whatever she is doing, tinted foxfire pink.
    const ghost = new THREE.Mesh(
      this.hero.mesh.geometry,
      new THREE.MeshBasicMaterial({ map: this.hero.texture, color: '#ffd6e6', transparent: true, opacity: 0, depthTest: false, depthWrite: false, side: THREE.DoubleSide }),
    );
    const glow = new THREE.Mesh(
      this.hero.mesh.geometry,
      new THREE.MeshBasicMaterial({ map: this.hero.texture, color: PINK, transparent: true, opacity: 0, depthTest: false, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending }),
    );
    this.scene.add(ghost, glow);
    return { hex, pos, marker, ghost, glow };
  }

  private lureNearest(n: number) {
    const d = this.decoys[0].pos;
    const near = this.others
      .filter((p) => p !== this.hero)
      .sort((a, b) => a.pos.distanceTo(d) - b.pos.distanceTo(d))
      .slice(0, n);
    for (const player of near) {
      const wisps = Array.from({ length: 7 }, () => {
        const w = new THREE.Sprite(
          new THREE.SpriteMaterial({ map: flameTexture(), color: PINK, transparent: true, opacity: 0, depthTest: false, depthWrite: false, blending: THREE.AdditiveBlending }),
        );
        w.scale.setScalar(0.22);
        w.renderOrder = 4999;
        return w;
      });
      const alert = new THREE.Sprite(new THREE.SpriteMaterial({ map: alertTexture(), transparent: true, depthTest: false }));
      alert.scale.set(0.45, 0.45, 1);
      alert.renderOrder = 5001;
      this.root.add(...wisps, alert);
      this.lures.push({ player, wisps, alert });
    }
  }
}

/** Decoy hexes: two steps ahead (one if the pitch ends); Ascended splits them either side of her facing. */
export function decoyHexes(from: Hex, dir: Direction, count: number): Hex[] {
  const i = DIRECTIONS.indexOf(dir);
  const dirs = count === 1 ? [dir] : [DIRECTIONS[(i + 5) % 6], DIRECTIONS[(i + 1) % 6]];
  return dirs.map((d) => {
    const one = step(from, d);
    const two = step(one, d);
    if (inPitch(two)) return two;
    if (inPitch(one)) return one;
    // At the edge: try the other directions.
    for (const alt of DIRECTIONS) if (inPitch(step(from, alt))) return step(from, alt);
    return from;
  });
}

const clamp01 = (x: number) => Math.min(1, Math.max(0, x));

let flameTex: THREE.Texture | undefined;
function flameTexture(): THREE.Texture {
  if (flameTex) return flameTex;
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d')!;
  const grad = g.createRadialGradient(32, 36, 0, 32, 36, 30);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.3, 'rgba(255,255,255,0.75)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.beginPath();
  // Teardrop: a flame tip pointing up.
  g.moveTo(32, 2);
  g.bezierCurveTo(52, 26, 60, 44, 32, 62);
  g.bezierCurveTo(4, 44, 12, 26, 32, 2);
  g.fill();
  flameTex = new THREE.CanvasTexture(c);
  return flameTex;
}

function alertTexture(): THREE.Texture {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d')!;
  g.fillStyle = '#ff6f9e';
  g.beginPath();
  g.arc(32, 32, 26, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = '#fff';
  g.font = 'bold 40px sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText('?', 32, 35);
  return new THREE.CanvasTexture(c);
}

function streakMesh(a: THREE.Vector3, b: THREE.Vector3): THREE.Mesh {
  const len = Math.hypot(b.x - a.x, b.z - a.z);
  const geo = new THREE.PlaneGeometry(len, 0.5);
  geo.rotateX(-Math.PI / 2);
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 16;
  const g = c.getContext('2d')!;
  const grad = g.createLinearGradient(0, 0, 128, 0);
  grad.addColorStop(0, 'rgba(255,111,158,0)');
  grad.addColorStop(0.5, 'rgba(255,190,215,1)');
  grad.addColorStop(1, 'rgba(255,111,158,0)');
  g.fillStyle = grad;
  g.fillRect(0, 4, 128, 8);
  const mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(c), transparent: true, depthTest: false, depthWrite: false, blending: THREE.AdditiveBlending }));
  mesh.position.set((a.x + b.x) / 2, 0.9, (a.z + b.z) / 2);
  mesh.rotation.y = -Math.atan2(b.z - a.z, b.x - a.x);
  mesh.renderOrder = 5002;
  return mesh;
}
