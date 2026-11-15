// The 9-row hex pitch (13 hexes in even rows, 12 in odd rows) as three.js meshes, laid out from the engine's hex grid.

import * as THREE from 'three';
import { PITCH_COLS, PITCH_ROWS, inPitch, lastCol, pitchHexes, type Hex } from '../engine/hex';

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
  const row = rz;
  const col = rx + (rz - (rz & 1)) / 2;
  return inPitch({ col, row }) ? { col, row } : null;
}

/** Goal mouths: rows 3-5 of the end columns (as in the pitch mockup). */
export const GOAL_ROWS = [3, 4, 5];

export interface Pitch {
  group: THREE.Group;
  hexMesh: THREE.InstancedMesh;
  hover: THREE.Mesh;
  pathDots: THREE.InstancedMesh;
  goalCentre: { west: THREE.Vector3; east: THREE.Vector3 };
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

export function buildPitch(): Pitch {
  const group = new THREE.Group();

  // Floating brass platform under the pitch.
  const plat = new THREE.Mesh(
    new THREE.BoxGeometry(SQ3 * PITCH_COLS + 4.2, 0.6, 1.5 * PITCH_ROWS + 3.2),
    new THREE.MeshBasicMaterial({ color: 0x5a3b22 }),
  );
  plat.position.y = -0.32;
  group.add(plat);
  const rim = new THREE.Mesh(
    new THREE.BoxGeometry(SQ3 * PITCH_COLS + 4.6, 0.2, 1.5 * PITCH_ROWS + 3.6),
    new THREE.MeshBasicMaterial({ color: 0xc9a24a }),
  );
  rim.position.y = -0.2;
  group.add(rim);
  const turf = new THREE.Mesh(
    new THREE.PlaneGeometry(SQ3 * PITCH_COLS + 3.4, 1.5 * PITCH_ROWS + 2.4),
    new THREE.MeshBasicMaterial({ color: 0x2d5a3a }),
  );
  turf.rotation.x = -Math.PI / 2;
  turf.position.y = 0.02;
  group.add(turf);

  // Hexes: one instanced mesh, two-tone mown stripes by column.
  const geo = new THREE.ShapeGeometry(hexShape(HEX_R * 0.95));
  geo.rotateX(-Math.PI / 2);
  const all = pitchHexes();
  const hexMesh = new THREE.InstancedMesh(geo, new THREE.MeshBasicMaterial({ color: 0xffffff }), all.length);
  const m = new THREE.Matrix4();
  const c = new THREE.Color();
  all.forEach(({ col, row }, i) => {
    const p = hexToWorld({ col, row });
    m.makeTranslation(p.x, 0.04, p.z);
    hexMesh.setMatrixAt(i, m);
    const goalMouth = (col === 0 || col === lastCol(row)) && GOAL_ROWS.includes(row);
    c.set(goalMouth ? 0x5f8f4a : col % 2 ? 0x4d7f4f : 0x568a56);
    hexMesh.setColorAt(i, c);
  });
  group.add(hexMesh);

  // Pitch markings.
  const lineMat = new THREE.LineBasicMaterial({ color: 0xf1dec2, transparent: true, opacity: 0.75 });
  const half = new THREE.BufferGeometry().setFromPoints([
    new THREE.Vector3(0, 0.06, -OFFSET_Z - 1),
    new THREE.Vector3(0, 0.06, OFFSET_Z + 1),
  ]);
  group.add(new THREE.Line(half, lineMat));
  const circlePts: THREE.Vector3[] = [];
  for (let k = 0; k <= 64; k++) {
    const a = (k / 64) * Math.PI * 2;
    circlePts.push(new THREE.Vector3(Math.cos(a) * 2.2, 0.06, Math.sin(a) * 2.2));
  }
  group.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(circlePts), lineMat));

  // Goals: posts, crossbar and a simple net beyond each end.
  const goalCentre = { west: new THREE.Vector3(), east: new THREE.Vector3() };
  for (const side of ['west', 'east'] as const) {
    const colOf = (row: number) => (side === 'west' ? 0 : lastCol(row));
    const top = hexToWorld({ col: colOf(GOAL_ROWS[0]), row: GOAL_ROWS[0] });
    const bottom = hexToWorld({ col: colOf(GOAL_ROWS[GOAL_ROWS.length - 1]), row: GOAL_ROWS[GOAL_ROWS.length - 1] });
    const sign = side === 'west' ? -1 : 1;
    const xs = GOAL_ROWS.map((row) => hexToWorld({ col: colOf(row), row }).x);
    const x = (side === 'west' ? Math.min(...xs) : Math.max(...xs)) + sign * 1.25;
    const z0 = top.z - 0.9;
    const z1 = bottom.z + 0.9;
    const hgt = 1.15;
    const depth = 1.0;
    const postMat = new THREE.MeshBasicMaterial({ color: 0xfff3e0 });
    for (const z of [z0, z1]) {
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, hgt, 8), postMat);
      post.position.set(x, hgt / 2, z);
      group.add(post);
    }
    const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, z1 - z0, 8), postMat);
    bar.rotation.x = Math.PI / 2;
    bar.position.set(x, hgt, (z0 + z1) / 2);
    group.add(bar);
    const net: THREE.Vector3[] = [];
    const bx = x + sign * depth;
    for (let k = 0; k <= 10; k++) {
      const z = z0 + ((z1 - z0) * k) / 10;
      net.push(new THREE.Vector3(x, hgt, z), new THREE.Vector3(bx, hgt * 0.6, z));
      net.push(new THREE.Vector3(bx, hgt * 0.6, z), new THREE.Vector3(bx, 0, z));
    }
    for (let k = 0; k <= 4; k++) {
      const y = (hgt * 0.6 * k) / 4;
      net.push(new THREE.Vector3(bx, y, z0), new THREE.Vector3(bx, y, z1));
    }
    group.add(
      new THREE.LineSegments(
        new THREE.BufferGeometry().setFromPoints(net),
        new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.45 }),
      ),
    );
    goalCentre[side] = new THREE.Vector3(x + sign * 0.4, 0, (z0 + z1) / 2);
  }

  // Hover hex outline.
  const hoverGeo = new THREE.RingGeometry(HEX_R * 0.78, HEX_R * 0.95, 6, 1, Math.PI / 6);
  hoverGeo.rotateX(-Math.PI / 2);
  const hover = new THREE.Mesh(
    hoverGeo,
    new THREE.MeshBasicMaterial({ color: 0xfff1c4, transparent: true, opacity: 0.55, depthWrite: false }),
  );
  hover.visible = false;
  hover.renderOrder = 2;
  group.add(hover);

  const dotGeo = new THREE.CircleGeometry(0.12, 12);
  dotGeo.rotateX(-Math.PI / 2);
  const pathDots = new THREE.InstancedMesh(
    dotGeo,
    new THREE.MeshBasicMaterial({ color: 0xffd36b, transparent: true, opacity: 0.85, depthWrite: false }),
    40,
  );
  pathDots.count = 0;
  pathDots.renderOrder = 2;
  group.add(pathDots);

  return { group, hexMesh, hover, pathDots, goalCentre };
}
