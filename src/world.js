// 地形・植生・建物・空などワールドの生成と、地形まわりのクエリ
import * as THREE from 'three';
import { G, clamp } from './state.js';

export function rng(seed) {
  return function () {
    seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const R = rng(20260928);

// ---- value noise ----
const PERM = new Uint8Array(512);
(() => {
  const p = [];
  for (let i = 0; i < 256; i++) p.push(i);
  for (let i = 255; i > 0; i--) { const j = Math.floor(R() * (i + 1)); [p[i], p[j]] = [p[j], p[i]]; }
  for (let i = 0; i < 512; i++) PERM[i] = p[i & 255];
})();
const hash = (x, z) => PERM[PERM[x & 255] + (z & 255)] / 255;
export function vnoise(x, z) {
  const ix = Math.floor(x), iz = Math.floor(z);
  const fx = x - ix, fz = z - iz;
  const u = fx * fx * (3 - 2 * fx), v = fz * fz * (3 - 2 * fz);
  const a = hash(ix, iz), b = hash(ix + 1, iz), c = hash(ix, iz + 1), d = hash(ix + 1, iz + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
export function fbm(x, z) {
  let s = 0, a = 0.5, f = 1, n = 0;
  for (let i = 0; i < 4; i++) { s += vnoise(x * f, z * f) * a; n += a; a *= 0.5; f *= 2; }
  return s / n;
}
const sstep = (e0, e1, x) => { const t = clamp((x - e0) / (e1 - e0), 0, 1); return t * t * (3 - 2 * t); };

// ---- ワールドレイアウト ----
export const WATER_Y = -2;
export const BOUND = 184;
export const PLACES = {
  village: { x: 0, z: 0, r: 24, h: 2, name: 'はじまりの村' },
  camp: { x: 110, z: 70, r: 16, h: 3, name: 'ゴブリンの野営地' },
  arena: { x: 0, z: -138, r: 26, h: 14, name: '炎竜の火口' },
};
export const LAKE = { x: -95, z: 60, r: 34 };
const VOLC = { x: 0, z: -186 };
const ROADS = [[0, 0, 110, 70], [0, 0, 0, -138], [0, 0, -58, 34]];

function distSeg(px, pz, ax, az, bx, bz) {
  const vx = bx - ax, vz = bz - az;
  const t = clamp(((px - ax) * vx + (pz - az) * vz) / (vx * vx + vz * vz), 0, 1);
  return Math.hypot(px - ax - vx * t, pz - az - vz * t);
}
export function roadDist(x, z) {
  let d = 1e9;
  for (const r of ROADS) d = Math.min(d, distSeg(x, z, r[0], r[1], r[2], r[3]));
  return d;
}
export const forestness = (x, z) => fbm(x * 0.02 + 300, z * 0.02 + 300);
const volcanic = (z) => 1 - sstep(-128, -92, z);

export function heightAt(x, z) {
  let h = (fbm(x * 0.011 + 50, z * 0.011 + 50) - 0.5) * 26 + (vnoise(x * 0.08, z * 0.08) - 0.5) * 1.5;
  const e = Math.max(Math.abs(x), Math.abs(z));
  h += sstep(150, 198, e) * 40;
  const dv = Math.hypot(x - VOLC.x, z - VOLC.z);
  h += (1 - sstep(0, 80, dv)) * 55 - (1 - sstep(4, 14, dv)) * 22;
  const dl = Math.hypot(x - LAKE.x, z - LAKE.z);
  h = h + (-7 - h) * (1 - sstep(LAKE.r * 0.35, LAKE.r, dl));
  for (const k in PLACES) {
    const p = PLACES[k];
    const d = Math.hypot(x - p.x, z - p.z);
    const t = sstep(p.r, p.r + 20, d);
    h = p.h + (h - p.h) * t;
  }
  return h;
}

export function areaName(x, z) {
  for (const k in PLACES) { const p = PLACES[k]; if (Math.hypot(x - p.x, z - p.z) < p.r + 8) return p.name; }
  if (Math.hypot(x - LAKE.x, z - LAKE.z) < LAKE.r + 10) return '静寂の湖';
  if (z < -100) return '灼熱の荒野';
  if (forestness(x, z) > 0.56) return 'ささやきの森';
  return '緑の平原';
}

// ---- 地面の色 ----
function groundColor(x, z, h, out) {
  const n = vnoise(x * 0.35, z * 0.35), f = fbm(x * 0.03, z * 0.03);
  let r = 0.30 + f * 0.12 + n * 0.04, g = 0.55 + f * 0.15 + n * 0.05, b = 0.18 + f * 0.05;
  if (forestness(x, z) > 0.55) { r *= 0.8; g *= 0.85; b *= 0.85; }
  if (h < WATER_Y + 1.2) { const t = sstep(WATER_Y + 1.2, WATER_Y - 0.5, h); r += (0.78 - r) * t; g += (0.72 - g) * t; b += (0.52 - b) * t; }
  if (h > 20) { const t = sstep(20, 30, h); r += (0.45 - r) * t; g += (0.43 - g) * t; b += (0.40 - b) * t; }
  const v = volcanic(z);
  if (v > 0) {
    const cr = 0.22 + n * 0.08, cg = 0.17 + n * 0.05, cb = 0.15 + n * 0.04;
    r += (cr - r) * v; g += (cg - g) * v; b += (cb - b) * v;
    if (v > 0.6 && vnoise(x * 0.18, z * 0.18) > 0.84 && h < 30) { r = 1.0; g = 0.35 + n * 0.2; b = 0.05; }
  }
  const rd = roadDist(x, z);
  if (rd < 3.2) { const t = sstep(3.2, 1.6, rd); const dr = v > 0.5 ? 0.35 : 0.62, dg = v > 0.5 ? 0.28 : 0.48, db = v > 0.5 ? 0.22 : 0.32; r += (dr - r) * t; g += (dg - g) * t; b += (db - b) * t; }
  const dvil = Math.hypot(x, z);
  if (dvil < 11) { const t = sstep(11, 9, dvil); r += (0.62 - r) * t; g += (0.6 - g) * t; b += (0.56 - b) * t; }
  const da = Math.hypot(x - PLACES.arena.x, z - PLACES.arena.z);
  if (da < PLACES.arena.r) { const t = sstep(PLACES.arena.r, PLACES.arena.r - 3, da); r += (0.36 - r) * t; g += (0.3 - g) * t; b += (0.28 - b) * t; }
  out[0] = r; out[1] = g; out[2] = b;
}

// ---- コライダー(円)を空間グリッドで管理 ----
const CELL = 10;
const grid = new Map();
const key = (cx, cz) => cx * 1000 + cz;
export function addCollider(x, z, r) {
  const k = key(Math.floor(x / CELL), Math.floor(z / CELL));
  if (!grid.has(k)) grid.set(k, []);
  grid.get(k).push({ x, z, r });
}
function collide(pos, r) {
  const cx = Math.floor(pos.x / CELL), cz = Math.floor(pos.z / CELL);
  for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) {
    const list = grid.get(key(cx + i, cz + j));
    if (!list) continue;
    for (const c of list) {
      const dx = pos.x - c.x, dz = pos.z - c.z, d = Math.hypot(dx, dz), m = c.r + r;
      if (d < m && d > 1e-4) { pos.x = c.x + dx / d * m; pos.z = c.z + dz / d * m; }
    }
  }
}
const walkable = (x, z) => heightAt(x, z) > WATER_Y - 0.7;
export function moveEntity(pos, dx, dz, r) {
  let nx = pos.x + dx, nz = pos.z + dz;
  if (!walkable(nx, nz)) {
    if (walkable(nx, pos.z)) nz = pos.z;
    else if (walkable(pos.x, nz)) nx = pos.x;
    else { nx = pos.x; nz = pos.z; }
  }
  pos.x = nx; pos.z = nz;
  collide(pos, r);
  pos.x = clamp(pos.x, -BOUND, BOUND);
  pos.z = clamp(pos.z, -BOUND, BOUND);
}

// ---- メッシュ生成 ----
const std = (c, o = {}) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.85, ...o });
function add(parent, geo, mat, x, y, z, shadow = true) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  m.castShadow = shadow; m.receiveShadow = true;
  parent.add(m);
  return m;
}

export const treeSpots = [];
let sun, sky, water, barrier, clouds = [], flames = [], lava;

export function initWorld(scene) {
  scene.background = new THREE.Color(0xcfe6ff);
  scene.fog = new THREE.Fog(0xcfe6ff, 70, 290);

  // 空
  sky = new THREE.Mesh(
    new THREE.SphereGeometry(800, 32, 16),
    new THREE.ShaderMaterial({
      side: THREE.BackSide, depthWrite: false, fog: false,
      uniforms: { top: { value: new THREE.Color(0x3f86e0) }, bottom: { value: new THREE.Color(0xcfe6ff) } },
      vertexShader: 'varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: 'uniform vec3 top; uniform vec3 bottom; varying vec3 vP; void main(){ float h = clamp(vP.y * 1.8 + 0.05, 0.0, 1.0); gl_FragColor = vec4(mix(bottom, top, h), 1.0); \n#include <colorspace_fragment>\n }',
    }),
  );
  sky.renderOrder = -1;
  scene.add(sky);

  // ライト
  scene.add(new THREE.HemisphereLight(0xdfefff, 0x5a6b3a, 1.3));
  sun = new THREE.DirectionalLight(0xfff1d6, 2.6);
  sun.castShadow = true;
  const sm = G.touch ? 1024 : 2048;
  sun.shadow.mapSize.set(sm, sm);
  const sc = sun.shadow.camera; sc.left = -45; sc.right = 45; sc.top = 45; sc.bottom = -45; sc.near = 1; sc.far = 220;
  sun.shadow.bias = -0.0005; sun.shadow.normalBias = 0.04;
  scene.add(sun, sun.target);

  // 地形
  const SEG = 200, SIZE = 400;
  const geo = new THREE.PlaneGeometry(SIZE, SIZE, SEG, SEG);
  geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position;
  const colors = new Float32Array(pos.count * 3), c = [0, 0, 0];
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), z = pos.getZ(i), h = heightAt(x, z);
    pos.setY(i, h);
    groundColor(x, z, h, c);
    colors[i * 3] = c[0]; colors[i * 3 + 1] = c[1]; colors[i * 3 + 2] = c[2];
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geo.computeVertexNormals();
  const terrain = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95 }));
  terrain.receiveShadow = true;
  scene.add(terrain);

  // 水
  water = new THREE.Mesh(new THREE.PlaneGeometry(SIZE, SIZE), new THREE.MeshStandardMaterial({ color: 0x3a86d8, transparent: true, opacity: 0.78, roughness: 0.15, metalness: 0.1 }));
  water.rotation.x = -Math.PI / 2; water.position.y = WATER_Y;
  scene.add(water);

  buildTrees(scene);
  buildRocks(scene);
  buildVillage(scene);
  buildCamp(scene);
  buildArena(scene);
  buildClouds(scene);
}

function buildTrees(scene) {
  const spots = [];
  for (let x = -182; x <= 182; x += 4.2) {
    for (let z = -182; z <= 182; z += 4.2) {
      const jx = x + (R() - 0.5) * 3.8, jz = z + (R() - 0.5) * 3.8;
      const h = heightAt(jx, jz);
      if (h < WATER_Y + 0.8 || h > 26 || jz < -100) continue;
      let near = false;
      for (const k in PLACES) { const p = PLACES[k]; if (Math.hypot(jx - p.x, jz - p.z) < p.r + 5) near = true; }
      if (near || roadDist(jx, jz) < 4.5) continue;
      const f = forestness(jx, jz);
      if (f < 0.54 && R() > 0.035) continue;
      spots.push([jx, h, jz, 0.8 + R() * 0.6, R()]);
    }
  }
  const n = spots.length;
  const trunkGeo = new THREE.CylinderGeometry(0.22, 0.34, 2.2, 6); trunkGeo.translate(0, 1.1, 0);
  const leafGeo1 = new THREE.ConeGeometry(1.7, 3.2, 7); leafGeo1.translate(0, 3.4, 0);
  const leafGeo2 = new THREE.ConeGeometry(1.2, 2.4, 7); leafGeo2.translate(0, 4.9, 0);
  const trunks = new THREE.InstancedMesh(trunkGeo, std(0x6b4a2b), n);
  const l1 = new THREE.InstancedMesh(leafGeo1, std(0xffffff, { flatShading: true }), n);
  const l2 = new THREE.InstancedMesh(leafGeo2, std(0xffffff, { flatShading: true }), n);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3(), col = new THREE.Color(), up = new THREE.Vector3(0, 1, 0);
  spots.forEach((t, i) => {
    q.setFromAxisAngle(up, t[4] * 6.28); s.setScalar(t[3]); p.set(t[0], t[1] - 0.1, t[2]);
    m.compose(p, q, s);
    trunks.setMatrixAt(i, m); l1.setMatrixAt(i, m); l2.setMatrixAt(i, m);
    col.setHSL(0.27 + t[4] * 0.08, 0.5, 0.26 + t[4] * 0.1);
    l1.setColorAt(i, col); col.offsetHSL(0, 0, 0.05); l2.setColorAt(i, col);
    addCollider(t[0], t[2], 0.55 * t[3]);
    treeSpots.push(t);
  });
  for (const im of [trunks, l1, l2]) { im.castShadow = true; im.receiveShadow = true; scene.add(im); }
}

function buildRocks(scene) {
  const spots = [];
  for (let i = 0; i < 260; i++) {
    const x = (R() - 0.5) * 360, z = (R() - 0.5) * 360;
    const h = heightAt(x, z);
    if (h < WATER_Y || roadDist(x, z) < 4 || Math.hypot(x, z) < 30) continue;
    if (Math.hypot(x - PLACES.arena.x, z - PLACES.arena.z) < PLACES.arena.r + 3) continue;
    spots.push([x, h, z, 0.5 + R() * (volcanic(z) > 0.5 ? 2.2 : 1.3), R()]);
  }
  const geo = new THREE.DodecahedronGeometry(1, 0);
  const im = new THREE.InstancedMesh(geo, std(0xffffff, { flatShading: true }), spots.length);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), s = new THREE.Vector3(), p = new THREE.Vector3(), col = new THREE.Color();
  spots.forEach((t, i) => {
    e.set(t[4] * 3, t[4] * 5, t[4] * 2); q.setFromEuler(e);
    s.set(t[3], t[3] * 0.7, t[3] * 1.1); p.set(t[0], t[1] + t[3] * 0.2, t[2]);
    m.compose(p, q, s); im.setMatrixAt(i, m);
    const v = volcanic(t[2]);
    col.setRGB(0.5 - v * 0.28 + t[4] * 0.08, 0.5 - v * 0.3 + t[4] * 0.06, 0.5 - v * 0.3 + t[4] * 0.05);
    im.setColorAt(i, col);
    addCollider(t[0], t[2], t[3] * 0.9);
  });
  im.castShadow = true; im.receiveShadow = true;
  scene.add(im);
}

export const houses = [];
function buildHouse(scene, x, z, rot, wallColor, roofColor) {
  const g = new THREE.Group();
  const y = heightAt(x, z);
  g.position.set(x, y, z); g.rotation.y = rot;
  add(g, new THREE.BoxGeometry(6, 3.6, 5), std(wallColor), 0, 1.8, 0);
  add(g, new THREE.BoxGeometry(6.4, 0.5, 5.4), std(0x6b5238), 0, 0.2, 0);
  const roof = add(g, new THREE.ConeGeometry(4.9, 2.8, 4), std(roofColor, { flatShading: true }), 0, 5.0, 0);
  roof.rotation.y = Math.PI / 4; roof.scale.set(1.05, 1, 0.85);
  add(g, new THREE.BoxGeometry(1.2, 2, 0.1), std(0x5a3a1c), 0, 1.0, 2.52, false);
  const winMat = std(0xfff0b0, { emissive: 0x6a5020 });
  add(g, new THREE.BoxGeometry(0.9, 0.9, 0.1), winMat, -1.9, 2.1, 2.52, false);
  add(g, new THREE.BoxGeometry(0.9, 0.9, 0.1), winMat, 1.9, 2.1, 2.52, false);
  add(g, new THREE.BoxGeometry(0.6, 1.6, 0.6), std(0x8a8078), 1.8, 5.4, -0.8);
  scene.add(g);
  // コライダー(長辺方向に3つ)
  const ax = Math.cos(rot), az = -Math.sin(rot);
  for (const o of [-2, 0, 2]) addCollider(x + ax * o, z + az * o, 2.9);
  houses.push({ x, z, rot, y });
}

let fountainWater;
function buildVillage(scene) {
  const walls = [0xf2e6c9, 0xe8d7b5, 0xf5efe0, 0xdcc9a3];
  const roofs = [0xb4432f, 0x3f6fb0, 0x4f8a3f, 0x8a4fa0, 0xc2762a];
  let i = 0;
  for (let a = 0; a < Math.PI * 2; a += Math.PI / 4) {
    const x = Math.sin(a) * 17, z = Math.cos(a) * 17;
    if (roadDist(x, z) < 6.5 || z > 15) continue; // 南側はスタート地点のカメラのため空ける
    buildHouse(scene, x, z, a + Math.PI, walls[i % walls.length], roofs[i % roofs.length]);
    i++;
  }
  // 噴水(回復の泉)
  const y = heightAt(0, 0);
  const g = new THREE.Group(); g.position.set(0, y, 0);
  const stone = std(0xb8b2a6);
  add(g, new THREE.CylinderGeometry(2.8, 3.0, 0.7, 20), stone, 0, 0.35, 0);
  fountainWater = add(g, new THREE.CylinderGeometry(2.5, 2.5, 0.1, 20), new THREE.MeshStandardMaterial({ color: 0x6ad0ff, emissive: 0x1a5a90, transparent: true, opacity: 0.85 }), 0, 0.66, 0, false);
  add(g, new THREE.CylinderGeometry(0.35, 0.45, 1.8, 10), stone, 0, 1.5, 0);
  add(g, new THREE.CylinderGeometry(1.1, 0.6, 0.35, 16), stone, 0, 2.4, 0);
  add(g, new THREE.SphereGeometry(0.45, 12, 8), new THREE.MeshStandardMaterial({ color: 0x9fe8ff, emissive: 0x3aa0ff, emissiveIntensity: 0.8 }), 0, 2.9, 0, false);
  scene.add(g);
  addCollider(0, 0, 3.0);

  // 商人の屋台
  const s = new THREE.Group(); s.position.set(-9, heightAt(-9, 9), 9); s.rotation.y = Math.PI * 0.75;
  add(s, new THREE.BoxGeometry(3.4, 1, 1.4), std(0x8a5a2b), 0, 0.5, 0);
  for (const [px, pz] of [[-1.6, -0.6], [1.6, -0.6], [-1.6, 0.6], [1.6, 0.6]]) add(s, new THREE.CylinderGeometry(0.07, 0.07, 2.6, 6), std(0x5a3a1c), px, 1.3, pz);
  const canopy = add(s, new THREE.BoxGeometry(3.8, 0.12, 2), std(0xd84a4a), 0, 2.65, 0); canopy.rotation.x = 0.12;
  add(s, new THREE.SphereGeometry(0.22, 8, 6), std(0xff5555), -0.8, 1.2, 0);
  add(s, new THREE.SphereGeometry(0.22, 8, 6), std(0xffdd33), -0.3, 1.2, 0.1);
  add(s, new THREE.CylinderGeometry(0.15, 0.15, 0.4, 8), std(0x55aaff, { emissive: 0x113355 }), 0.5, 1.2, 0);
  add(s, new THREE.CylinderGeometry(0.15, 0.15, 0.4, 8), std(0xff66cc, { emissive: 0x331122 }), 0.9, 1.2, 0);
  scene.add(s);
  addCollider(-9, 9, 1.8);
  // 樽と木箱
  for (const [bx, bz] of [[-12, 5], [-12.5, 6.3], [6, 12]]) {
    add(scene, new THREE.CylinderGeometry(0.5, 0.45, 1.1, 10), std(0x7a5230), bx, heightAt(bx, bz) + 0.55, bz);
    addCollider(bx, bz, 0.55);
  }
  // 街灯
  for (let a = 0.4; a < Math.PI * 2; a += Math.PI / 2) {
    const x = Math.sin(a) * 10.5, z = Math.cos(a) * 10.5, yy = heightAt(x, z);
    add(scene, new THREE.CylinderGeometry(0.08, 0.1, 3, 6), std(0x333333), x, yy + 1.5, z);
    add(scene, new THREE.BoxGeometry(0.4, 0.5, 0.4), std(0xffe9a0, { emissive: 0xffc860, emissiveIntensity: 0.8 }), x, yy + 3.1, z, false);
  }
}

export let chestSpot;
function buildCamp(scene) {
  const P = PLACES.camp;
  const tentMat = std(0x8a6a3a, { flatShading: true }), tentMat2 = std(0x6a4a2a, { flatShading: true });
  for (let i = 0; i < 4; i++) {
    const a = i * Math.PI / 2 + 0.5, x = P.x + Math.sin(a) * 9, z = P.z + Math.cos(a) * 9;
    const t = add(scene, new THREE.ConeGeometry(2.6, 3.4, 6), i % 2 ? tentMat : tentMat2, x, heightAt(x, z) + 1.7, z);
    t.rotation.y = a;
    addCollider(x, z, 2.4);
  }
  // 柵
  for (let a = 0; a < Math.PI * 2; a += 0.22) {
    if (Math.abs(((a - Math.atan2(-110, -70)) + Math.PI * 3) % (Math.PI * 2) - Math.PI) < 0.45) continue; // 入口
    const x = P.x + Math.sin(a) * 15, z = P.z + Math.cos(a) * 15;
    const s = add(scene, new THREE.ConeGeometry(0.25, 2.6, 5), std(0x5a3a1c), x, heightAt(x, z) + 1.1, z);
    s.rotation.z = 0.1;
    addCollider(x, z, 0.5);
  }
  // 焚き火
  const fy = heightAt(P.x + 3, P.z - 3);
  for (let i = 0; i < 4; i++) { const l = add(scene, new THREE.CylinderGeometry(0.12, 0.12, 1.4, 6), std(0x4a2a10), P.x + 3, fy + 0.15, P.z - 3); l.rotation.set(Math.PI / 2, i * Math.PI / 4, 0); }
  const flame = add(scene, new THREE.ConeGeometry(0.5, 1.4, 8), new THREE.MeshBasicMaterial({ color: 0xff8a20 }), P.x + 3, fy + 0.8, P.z - 3, false);
  flames.push(flame);
  addCollider(P.x + 3, P.z - 3, 0.8);
  chestSpot = { x: P.x - 1, z: P.z + 1 };
}

let pillars = [];
function buildArena(scene) {
  const A = PLACES.arena;
  const mat = std(0x4a3e3a, { flatShading: true });
  for (let i = 0; i < 12; i++) {
    const a = i / 12 * Math.PI * 2, x = A.x + Math.sin(a) * (A.r - 1), z = A.z + Math.cos(a) * (A.r - 1);
    if (Math.abs(Math.sin(a / 2)) < 0.14) continue; // 南側(入口)
    const h = 4 + (i % 3) * 1.5;
    const p = add(scene, new THREE.BoxGeometry(1.6, h, 1.6), mat, x, heightAt(x, z) + h / 2 - 0.3, z);
    p.rotation.y = a;
    add(scene, new THREE.BoxGeometry(0.5, 0.5, 0.5), std(0xff5a1a, { emissive: 0xff3a00, emissiveIntensity: 1.2 }), x, heightAt(x, z) + h + 0.1, z, false);
    addCollider(x, z, 1.1);
    pillars.push(p);
  }
  barrier = new THREE.Mesh(
    new THREE.CylinderGeometry(A.r + 3, A.r + 3, 16, 48, 1, true),
    new THREE.MeshBasicMaterial({ color: 0xff4020, transparent: true, opacity: 0.18, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending }),
  );
  barrier.position.set(A.x, A.h + 6, A.z);
  scene.add(barrier);
  // 火口の溶岩
  const vh = heightAt(VOLC.x, VOLC.z);
  lava = new THREE.Mesh(new THREE.CircleGeometry(12, 24), new THREE.MeshBasicMaterial({ color: 0xff5a10 }));
  lava.rotation.x = -Math.PI / 2; lava.position.set(VOLC.x, vh + 1.5, VOLC.z);
  scene.add(lava);
}

export function setBarrier(on) { barrier.visible = on; }
export const barrierOn = () => barrier.visible;

function buildClouds(scene) {
  const mat = new THREE.MeshLambertMaterial({ color: 0xffffff, flatShading: true, transparent: true, opacity: 0.92 });
  const geo = new THREE.IcosahedronGeometry(1, 1);
  for (let i = 0; i < 16; i++) {
    const g = new THREE.Group();
    for (let j = 0; j < 5; j++) {
      const m = new THREE.Mesh(geo, mat);
      m.position.set((R() - 0.5) * 16, (R() - 0.5) * 2, (R() - 0.5) * 6);
      m.scale.set(4 + R() * 4, 2 + R() * 2, 3 + R() * 3);
      g.add(m);
    }
    g.position.set((R() - 0.5) * 500, 75 + R() * 25, (R() - 0.5) * 500);
    scene.add(g);
    clouds.push(g);
  }
}

export function updateWorld(dt, t) {
  const focus = G.state === 'play' || G.state === 'dead' || G.state === 'ending' ? G.player.pos : new THREE.Vector3(0, 0, -20);
  sun.position.set(focus.x + 50, focus.y + 90, focus.z + 35);
  sun.target.position.copy(focus);
  sky.position.copy(G.camera.position);
  for (const c of clouds) { c.position.x += dt * 2; if (c.position.x > 260) c.position.x = -260; }
  for (const f of flames) { f.scale.set(1 + Math.sin(t * 13) * 0.12, 1 + Math.sin(t * 9) * 0.2, 1); }
  if (fountainWater) fountainWater.material.emissiveIntensity = 0.7 + Math.sin(t * 2) * 0.3;
  lava.material.color.setHSL(0.05, 1, 0.5 + Math.sin(t * 1.5) * 0.06);
  if (barrier.visible) barrier.material.opacity = 0.14 + Math.sin(t * 3) * 0.05;
  water.position.y = WATER_Y + Math.sin(t * 0.8) * 0.05;
}

// ---- ミニマップ用の背景画像 ----
export function makeMapImage(size) {
  const cv = document.createElement('canvas'); cv.width = cv.height = size;
  const ctx = cv.getContext('2d');
  const img = ctx.createImageData(size, size), c = [0, 0, 0];
  for (let py = 0; py < size; py++) for (let px = 0; px < size; px++) {
    const x = px / size * 400 - 200, z = py / size * 400 - 200, h = heightAt(x, z);
    let r, g, b;
    if (h < WATER_Y) { r = 0.23; g = 0.5; b = 0.85; }
    else {
      groundColor(x, z, h, c); r = c[0]; g = c[1]; b = c[2];
      const sh = 0.85 + clamp((heightAt(x + 2, z + 2) - h) * -0.08, -0.25, 0.25);
      r *= sh; g *= sh; b *= sh;
    }
    const i = (py * size + px) * 4;
    img.data[i] = r * 255; img.data[i + 1] = g * 255; img.data[i + 2] = b * 255; img.data[i + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  ctx.fillStyle = 'rgba(20,60,20,0.55)';
  for (const t of treeSpots) ctx.fillRect((t[0] + 200) / 400 * size - 0.7, (t[2] + 200) / 400 * size - 0.7, 1.4, 1.4);
  ctx.fillStyle = '#8a5a3a';
  for (const h of houses) ctx.fillRect((h.x + 200) / 400 * size - 2, (h.z + 200) / 400 * size - 2, 4, 4);
  return cv;
}
