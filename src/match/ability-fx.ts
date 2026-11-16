// Placeholder effects for signature abilities on the match pitch. Code-drawn glows, rings and hex tiles in each
// core's colour, so every ability reads at match camera until proper Saturday Anime effects art exists.
//
//   cast      a ring bursting out from the robot, plus the ability's name as a callout (the stage does the callout)
//   Flame     an orange flame glow on the Phoenix until the shot
//   Wall      glowing stone tiles on the wall hexes (Stone Wall, Shell Guard)
//   Aura      a soft green ring around the Qilin, the size of the aura
//   Decoy     a pink hex and a translucent pink copy of the Kitsune on the decoy hex, and a pink glow on her

import * as THREE from 'three';
import { ABILITIES, hexKey, type Hex, type MatchState } from '../engine';
import { HEX_R, hexToWorld } from '../lab/pitch';
import { SpriteActor, type Actor } from './actors';

let glowTex: THREE.Texture | undefined;
function glowTexture(): THREE.Texture {
  if (glowTex) return glowTex;
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d')!;
  const grad = g.createRadialGradient(64, 64, 4, 64, 64, 62);
  grad.addColorStop(0, 'rgba(255,255,255,0.95)');
  grad.addColorStop(0.35, 'rgba(255,255,255,0.45)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 128);
  glowTex = new THREE.CanvasTexture(c);
  return glowTex;
}

const additive = (colour: string, opacity: number) =>
  new THREE.MeshBasicMaterial({
    color: colour,
    transparent: true,
    opacity,
    depthWrite: false,
    depthTest: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
  });

function hexTile(h: Hex, colour: string, fill: number, edge: number): THREE.Group {
  const grp = new THREE.Group();
  const fillGeo = new THREE.CircleGeometry(HEX_R * 0.9, 6, Math.PI / 6);
  fillGeo.rotateX(-Math.PI / 2);
  const edgeGeo = new THREE.RingGeometry(HEX_R * 0.74, HEX_R * 0.93, 6, 1, Math.PI / 6);
  edgeGeo.rotateX(-Math.PI / 2);
  const a = new THREE.Mesh(fillGeo, additive(colour, fill));
  const b = new THREE.Mesh(edgeGeo, additive(colour, edge));
  a.renderOrder = b.renderOrder = 4;
  a.userData.base = fill;
  b.userData.base = edge;
  grp.add(a, b);
  grp.position.copy(hexToWorld(h)).setY(0.07);
  return grp;
}

interface Lasting {
  key: string;
  robot: string;
  objects: THREE.Object3D[];
  update(t: number, actor: Actor | undefined): void;
}

interface Burst {
  mesh: THREE.Mesh;
  t: number;
}

export class AbilityFx {
  private lasting = new Map<string, Lasting>();
  private bursts: Burst[] = [];

  constructor(
    private readonly scene: THREE.Scene,
    private readonly actors: Map<string, Actor>,
  ) {}

  /** The cast: a ring of the core's colour bursting out from the robot. */
  burst(robotId: string, colour: string) {
    const a = this.actors.get(robotId);
    if (!a) return;
    const geo = new THREE.RingGeometry(0.5, 0.75, 48);
    geo.rotateX(-Math.PI / 2);
    const mesh = new THREE.Mesh(geo, additive(colour, 0.95));
    mesh.position.set(a.pos.x, 0.09, a.pos.z);
    mesh.renderOrder = 6;
    this.scene.add(mesh);
    this.bursts.push({ mesh, t: 0 });
  }

  /** Matches the lasting effects on the pitch to the robots' effects in a state. */
  sync(s: MatchState) {
    const want = new Map<string, MatchState['robots'][number]>();
    for (const r of s.robots) {
      if (!r.effect) continue;
      const e = r.effect;
      const key = `${r.id}|${e.kind}|${e.kind === 'wall' ? e.hexes.map(hexKey).join(';') : e.kind === 'decoy' ? hexKey(e.hex) : ''}`;
      want.set(key, r);
    }
    for (const [key, l] of this.lasting) {
      if (want.has(key)) continue;
      this.scene.remove(...l.objects);
      this.lasting.delete(key);
    }
    for (const [key, r] of want) {
      if (this.lasting.has(key)) continue;
      const l = this.build(key, r);
      if (!l) continue;
      this.scene.add(...l.objects);
      this.lasting.set(key, l);
    }
  }

  private build(key: string, r: MatchState['robots'][number]): Lasting | null {
    const e = r.effect!;
    const colour = ABILITIES[r.core]?.colour ?? '#ffffff';
    switch (e.kind) {
      case 'wall': {
        const tiles = e.hexes.map((h) => hexTile(h, colour, 0.32, 0.95));
        return {
          key,
          robot: r.id,
          objects: tiles,
          update: (t) => {
            for (const g of tiles) {
              for (const c of g.children) {
                const m = (c as THREE.Mesh).material as THREE.MeshBasicMaterial;
                m.opacity = (c.userData.base as number) * (0.8 + 0.2 * Math.sin(t * 4));
              }
            }
          },
        };
      }
      case 'aura': {
        const radius = (e.range + 0.45) * HEX_R * Math.sqrt(3) * 0.95;
        const geo = new THREE.RingGeometry(radius - 0.12, radius, 64);
        geo.rotateX(-Math.PI / 2);
        geo.scale(1, 1, 0.9);
        const ring = new THREE.Mesh(geo, additive(colour, 0.55));
        ring.renderOrder = 4;
        const fillGeo = new THREE.CircleGeometry(radius, 64);
        fillGeo.rotateX(-Math.PI / 2);
        fillGeo.scale(1, 1, 0.9);
        const fill = new THREE.Mesh(fillGeo, additive(colour, 0.09));
        fill.renderOrder = 3;
        return {
          key,
          robot: r.id,
          objects: [ring, fill],
          update: (t, a) => {
            if (!a) return;
            ring.position.set(a.pos.x, 0.08, a.pos.z);
            fill.position.set(a.pos.x, 0.075, a.pos.z);
            (ring.material as THREE.MeshBasicMaterial).opacity = 0.45 + 0.15 * Math.sin(t * 3);
          },
        };
      }
      case 'flame': {
        const glow = new THREE.Sprite(
          new THREE.SpriteMaterial({ map: glowTexture(), color: colour, transparent: true, depthTest: false, depthWrite: false, blending: THREE.AdditiveBlending }),
        );
        glow.renderOrder = 5000;
        return {
          key,
          robot: r.id,
          objects: [glow],
          update: (t, a) => {
            if (!a) return;
            const s = 1.5 + 0.15 * Math.sin(t * 9);
            glow.scale.set(s, s * 1.5, 1);
            glow.position.set(a.pos.x, a.height * 0.45, a.pos.z + 0.05);
            (glow.material as THREE.SpriteMaterial).opacity = 0.55 + 0.15 * Math.sin(t * 13);
          },
        };
      }
      case 'decoy': {
        const tile = hexTile(e.hex, colour, 0.3, 0.95);
        const glow = new THREE.Sprite(
          new THREE.SpriteMaterial({ map: glowTexture(), color: colour, transparent: true, depthTest: false, depthWrite: false, blending: THREE.AdditiveBlending }),
        );
        glow.renderOrder = 5000;
        const objects: THREE.Object3D[] = [tile, glow];
        // A translucent pink copy of her on the decoy hex (sprite players only; a token gets the tile and glow).
        const actor = this.actors.get(r.id);
        let ghost: THREE.Mesh | undefined;
        if (actor instanceof SpriteActor) {
          ghost = new THREE.Mesh(
            actor.player.mesh.geometry,
            new THREE.MeshBasicMaterial({ map: actor.player.texture, color: '#ffc4dc', transparent: true, opacity: 0.55, depthTest: false, depthWrite: false, side: THREE.DoubleSide }),
          );
          objects.push(ghost);
        }
        const at = hexToWorld(e.hex);
        return {
          key,
          robot: r.id,
          objects,
          update: (t, a) => {
            if (!a) return;
            const s = 1.4 + 0.1 * Math.sin(t * 7);
            glow.scale.set(s, s * 1.6, 1);
            glow.position.set(a.pos.x, a.height * 0.45, a.pos.z + 0.05);
            (glow.material as THREE.SpriteMaterial).opacity = 0.45 + 0.1 * Math.sin(t * 11);
            if (ghost && a instanceof SpriteActor) {
              ghost.position.set(at.x + Math.sin(t * 23) * 0.015, 0, at.z);
              ghost.quaternion.copy(a.player.mesh.quaternion);
              ghost.scale.copy(a.player.mesh.scale);
              ghost.renderOrder = 100 + Math.round((at.z + 20) * 10);
              (ghost.material as THREE.MeshBasicMaterial).opacity = 0.5 + 0.1 * Math.sin(t * 31) * Math.sin(t * 13);
            }
          },
        };
      }
    }
  }

  update(dt: number, t: number) {
    for (const l of this.lasting.values()) l.update(t, this.actors.get(l.robot));
    for (let i = this.bursts.length - 1; i >= 0; i--) {
      const b = this.bursts[i];
      b.t += dt;
      const u = b.t / 0.7;
      b.mesh.scale.setScalar(1 + u * 2.4);
      (b.mesh.material as THREE.MeshBasicMaterial).opacity = Math.max(0, 0.95 * (1 - u));
      if (u >= 1) {
        this.scene.remove(b.mesh);
        b.mesh.geometry.dispose();
        this.bursts.splice(i, 1);
      }
    }
  }

  /** Remove everything (a new match). */
  clear() {
    for (const l of this.lasting.values()) this.scene.remove(...l.objects);
    this.lasting.clear();
  }
}
