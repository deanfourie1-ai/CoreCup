// The people on the pitch during a match. A player with approved art is a SpritePlayer (the same animated
// sprite as the Sprite Lab); anyone not drawn yet is a stand-in token in the team colour. Both walk hex paths
// the same way, so the match stage treats them alike.

import * as THREE from 'three';
import type { Direction, Hex, Robot, TeamId } from '../engine';
import { hexToWorld, PITCH_COLOURS } from '../lab/pitch';
import { SpritePlayer } from '../lab/player';
import type { SpriteSheet } from '../sprites/atlas';
import { directionFromVector } from '../sprites/facing';
import { EMPTY_LOADOUT } from '../sprites/loadout';

export const TEAM_COLOUR: Record<TeamId, string> = { home: PITCH_COLOURS.ember, away: PITCH_COLOURS.tide };

/** Normal running speed in world units per second (the Sprite Lab's pace). */
export const RUN = 3.8;

export interface Actor {
  readonly robotId: string;
  readonly pos: THREE.Vector3;
  hex: Hex;
  readonly moving: boolean;
  /** World height of the figure, for the name tag and click box. */
  readonly height: number;
  readonly objects: THREE.Object3D[];
  runTo(path: Hex[], speed: number): void;
  place(hex: Hex): void;
  /** Turn to face a ground point (only while standing). */
  lookAt(x: number, z: number): void;
  /** Standing pose: the keeper ready stance or a normal idle. */
  setStance(ready: boolean): void;
  update(dt: number, t: number): void;
}

/** A soft team-coloured ring on the grass under each player, so teams read at a glance. */
function teamRing(team: TeamId): THREE.Mesh {
  const geo = new THREE.RingGeometry(0.42, 0.55, 40);
  geo.rotateX(-Math.PI / 2);
  geo.scale(1, 1, 0.8);
  const m = new THREE.Mesh(
    geo,
    new THREE.MeshBasicMaterial({ color: TEAM_COLOUR[team], transparent: true, opacity: 0.85, depthWrite: false }),
  );
  m.renderOrder = 4;
  return m;
}

export class SpriteActor implements Actor {
  readonly player: SpritePlayer;
  readonly ring: THREE.Mesh;
  readonly objects: THREE.Object3D[];
  readonly height: number;
  private ready = false;

  constructor(
    readonly robotId: string,
    team: TeamId,
    hex: Hex,
    sheet: SpriteSheet,
    camera: THREE.Camera,
    private readonly hasStance: boolean,
  ) {
    this.player = new SpritePlayer(sheet, hex, { ...EMPTY_LOADOUT }, camera);
    this.player.face(team === 'home' ? 'E' : 'W');
    this.ring = teamRing(team);
    this.objects = [this.player.shadow, this.ring, this.player.mesh];
    // Character height is about 86% of the frame above the pivot, at the fixed lab scale.
    this.height = sheet.pivot[1] * (2.3 / 352) * 0.92;
  }

  get pos() {
    return this.player.pos;
  }
  get hex() {
    return this.player.hex;
  }
  set hex(h: Hex) {
    this.player.hex = h;
  }
  get moving() {
    return this.player.moving;
  }

  runTo(path: Hex[], speed: number) {
    this.player.speed = speed;
    this.player.runTo(path);
  }

  place(hex: Hex) {
    this.player.place(hex);
    this.player.setAction(this.standing());
  }

  lookAt(x: number, z: number) {
    if (this.moving || this.ready) return;
    const dx = x - this.pos.x;
    const dz = z - this.pos.z;
    if (Math.hypot(dx, dz) < 0.3) return;
    const dir = directionFromVector(dx, dz);
    if (dir !== this.player.dir) this.player.face(dir);
  }

  setStance(ready: boolean) {
    this.ready = ready && this.hasStance;
  }

  private standing() {
    return this.ready ? 'keeper_ready' : 'loco_idle';
  }

  update(dt: number, t: number) {
    if (!this.moving) {
      const want = this.standing();
      if (this.player.action !== want) {
        // The ready stance is drawn facing the camera.
        if (want === 'keeper_ready') this.player.face('SE' as Direction);
        this.player.setAction(want);
      }
    }
    this.player.update(dt, t);
    this.ring.position.set(this.pos.x, 0.06, this.pos.z);
  }
}

const ROLE_LETTER: Record<Robot['role'], string> = { Keeper: 'K', Defender: 'D', Midfielder: 'M', Striker: 'S' };

/** Stand-in for a player whose art isn't approved yet: a team-coloured disc standee with the role letter. */
export class TokenActor implements Actor {
  readonly pos = new THREE.Vector3();
  readonly objects: THREE.Object3D[];
  readonly height = 1.45;
  hex: Hex;
  private readonly card: THREE.Mesh;
  private readonly ring: THREE.Mesh;
  private readonly shadow: THREE.Mesh;
  private path: Hex[] = [];
  private speed = RUN;
  private bobT = Math.random() * 10;

  constructor(
    readonly robotId: string,
    robot: Robot,
    private readonly camera: THREE.Camera,
  ) {
    this.hex = robot.pos;
    this.pos.copy(hexToWorld(robot.pos));
    const c = document.createElement('canvas');
    c.width = 128;
    c.height = 168;
    const g = c.getContext('2d')!;
    const team = TEAM_COLOUR[robot.team];
    // Stem and base.
    g.fillStyle = 'rgba(20,12,30,0.9)';
    g.fillRect(58, 110, 12, 46);
    g.beginPath();
    g.ellipse(64, 158, 30, 8, 0, 0, Math.PI * 2);
    g.fill();
    // Disc: dark rim, team fill, gold inner line.
    g.beginPath();
    g.arc(64, 62, 58, 0, Math.PI * 2);
    g.fillStyle = '#1a0f26';
    g.fill();
    g.beginPath();
    g.arc(64, 62, 52, 0, Math.PI * 2);
    g.fillStyle = team;
    g.fill();
    const shade = g.createLinearGradient(0, 10, 0, 114);
    shade.addColorStop(0, 'rgba(255,255,255,0.28)');
    shade.addColorStop(0.5, 'rgba(255,255,255,0)');
    shade.addColorStop(1, 'rgba(0,0,0,0.25)');
    g.fillStyle = shade;
    g.fill();
    g.lineWidth = 3;
    g.strokeStyle = PITCH_COLOURS.gold;
    g.beginPath();
    g.arc(64, 62, 45, 0, Math.PI * 2);
    g.stroke();
    g.fillStyle = '#fffaf0';
    g.font = '900 56px Saira, system-ui, sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(ROLE_LETTER[robot.role], 64, 58);
    g.font = '700 15px Saira, system-ui, sans-serif';
    g.fillText(robot.name.split(' ')[0].toUpperCase().slice(0, 9), 64, 94);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 4;
    const w = 1.05;
    const h = (w * 168) / 128;
    const geo = new THREE.PlaneGeometry(w, h);
    geo.translate(0, h / 2 - 0.02, 0);
    this.card = new THREE.Mesh(
      geo,
      new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthTest: false, depthWrite: false }),
    );
    this.ring = teamRing(robot.team);
    const sgeo = new THREE.CircleGeometry(0.42, 24);
    sgeo.rotateX(-Math.PI / 2);
    sgeo.scale(1, 1, 0.45);
    this.shadow = new THREE.Mesh(
      sgeo,
      new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.35, depthWrite: false }),
    );
    this.shadow.renderOrder = 3;
    this.objects = [this.shadow, this.ring, this.card];
  }

  get moving() {
    return this.path.length > 0;
  }

  runTo(path: Hex[], speed: number) {
    this.path = path.slice();
    this.speed = speed;
  }

  place(hex: Hex) {
    this.path = [];
    this.hex = hex;
    this.pos.copy(hexToWorld(hex));
  }

  lookAt() {}
  setStance() {}

  update(dt: number) {
    let hop = 0;
    if (this.path.length) {
      const target = hexToWorld(this.path[0]);
      const d = target.clone().sub(this.pos);
      const dist = Math.hypot(d.x, d.z);
      const stepLen = this.speed * dt;
      if (dist <= stepLen) {
        this.pos.copy(target);
        this.hex = this.path.shift()!;
      } else {
        this.pos.addScaledVector(d, stepLen / dist);
      }
      this.bobT += dt * this.speed * 2.4;
      hop = Math.abs(Math.sin(this.bobT)) * 0.12;
    }
    this.card.position.set(this.pos.x, hop, this.pos.z);
    this.card.quaternion.copy(this.camera.quaternion);
    this.card.renderOrder = 100 + Math.round((this.pos.z + 20) * 10);
    this.ring.position.set(this.pos.x, 0.06, this.pos.z);
    this.shadow.position.set(this.pos.x, 0.07, this.pos.z);
  }
}
