// パーティクル・ダメージ数字・飛び道具・近接当たり判定
import * as THREE from 'three';
import { G, rand } from './state.js';
import { heightAt } from './world.js';
import { damageEnemy } from './enemies.js';
import { hurtPlayer } from './player.js';
import { sfx } from './audio.js';

// ---- パーティクル (InstancedMesh 1つで描画) ----
const MAXP = 800;
let pmesh;
const parts = [];
let pIdx = 0;
const dummy = new THREE.Object3D();
const tmpC = new THREE.Color();

export function initFx(scene) {
  pmesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial({ color: 0xffffff }), MAXP);
  pmesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  pmesh.frustumCulled = false;
  dummy.scale.set(0, 0, 0); dummy.updateMatrix();
  for (let i = 0; i < MAXP; i++) {
    pmesh.setMatrixAt(i, dummy.matrix);
    pmesh.setColorAt(i, tmpC.set(0xffffff));
    parts.push({ life: 0 });
  }
  scene.add(pmesh);
}

export function particle(x, y, z, vx, vy, vz, color, size = 0.2, life = 0.6, grav = -9) {
  const i = pIdx; pIdx = (pIdx + 1) % MAXP;
  const p = parts[i];
  p.x = x; p.y = y; p.z = z; p.vx = vx; p.vy = vy; p.vz = vz;
  p.size = size; p.life = life; p.max = life; p.grav = grav; p.rot = Math.random() * 6;
  pmesh.setColorAt(i, tmpC.set(color));
}

export function burst(x, y, z, color, n = 12, speed = 4, size = 0.18, life = 0.6, grav = -9) {
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2, u = Math.random() * 2 - 1, s = speed * (0.4 + Math.random() * 0.6);
    const r = Math.sqrt(1 - u * u);
    particle(x, y, z, Math.cos(a) * r * s, Math.abs(u) * s + speed * 0.3, Math.sin(a) * r * s, color, size * (0.6 + Math.random() * 0.8), life * (0.6 + Math.random() * 0.6), grav);
  }
}

export function ring(x, y, z, color, radius = 6, n = 36) {
  for (let i = 0; i < n; i++) {
    const a = i / n * Math.PI * 2;
    particle(x, y, z, Math.cos(a) * radius * 2, 1.5, Math.sin(a) * radius * 2, color, 0.35, 0.5, -4);
  }
}

// ---- ダメージ数字 (DOM) ----
const nums = [];
let layer;
const v3 = new THREE.Vector3();
export function dmgNumber(x, y, z, text, kind = '') {
  if (!layer) layer = document.getElementById('dmgLayer');
  const el = document.createElement('div');
  el.className = 'dmg ' + kind;
  el.textContent = text;
  layer.appendChild(el);
  nums.push({ el, x: x + rand(-0.3, 0.3), y, z: z + rand(-0.3, 0.3), t: 0 });
}

export function updateFx(dt) {
  for (let i = 0; i < MAXP; i++) {
    const p = parts[i];
    if (p.life <= 0) { if (p.max) { p.max = 0; dummy.scale.set(0, 0, 0); dummy.updateMatrix(); pmesh.setMatrixAt(i, dummy.matrix); } continue; }
    p.life -= dt;
    p.vy += p.grav * dt;
    p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
    p.rot += dt * 5;
    const s = p.size * Math.max(0, p.life / p.max);
    dummy.position.set(p.x, p.y, p.z);
    dummy.rotation.set(p.rot, p.rot * 0.7, 0);
    dummy.scale.set(s, s, s);
    dummy.updateMatrix();
    pmesh.setMatrixAt(i, dummy.matrix);
  }
  pmesh.instanceMatrix.needsUpdate = true;
  if (pmesh.instanceColor) pmesh.instanceColor.needsUpdate = true;

  const w = innerWidth, h = innerHeight;
  for (let i = nums.length - 1; i >= 0; i--) {
    const n = nums[i];
    n.t += dt;
    if (n.t > 0.9) { n.el.remove(); nums.splice(i, 1); continue; }
    v3.set(n.x, n.y + n.t * 1.6, n.z).project(G.camera);
    if (v3.z > 1) { n.el.style.opacity = 0; continue; }
    const sx = (v3.x * 0.5 + 0.5) * w, sy = (-v3.y * 0.5 + 0.5) * h;
    const sc = n.t < 0.1 ? 1 + (0.1 - n.t) * 6 : 1;
    n.el.style.transform = `translate(-50%, -50%) translate(${sx}px, ${sy}px) scale(${sc})`;
    n.el.style.opacity = n.t > 0.6 ? (0.9 - n.t) / 0.3 : 1;
  }
}

// ---- 近接攻撃判定 ----
export function calcDamage(atk, def) {
  return Math.max(1, Math.round((atk - def * 0.5) * rand(0.9, 1.1)));
}

export function meleeHit(ox, oz, yaw, range, arcCos, power, kb) {
  const fx = Math.sin(yaw), fz = Math.cos(yaw);
  let n = 0;
  for (const e of G.enemies) {
    if (e.dead || e.state === 'sleep') continue;
    const dx = e.pos.x - ox, dz = e.pos.z - oz, d = Math.hypot(dx, dz) || 0.001;
    if (d - e.radius > range) continue;
    const dot = (dx * fx + dz * fz) / d;
    if (dot < arcCos && d > e.radius + 0.8) continue;
    const crit = Math.random() < 0.12;
    const dmg = Math.round(calcDamage(power, e.T.def) * (crit ? 1.6 : 1));
    damageEnemy(e, dmg, dx / d, dz / d, kb, crit);
    n++;
  }
  if (n) { sfx.hit(); G.hitstop = 0.05; G.shake = Math.max(G.shake, 0.15); }
  return n;
}

// ---- 飛び道具 ----
const projs = [];
const ballGeo = new THREE.SphereGeometry(1, 12, 8);
export function spawnProjectile({ x, y, z, dx, dy, dz, speed, dmg, owner, radius = 0.4, color = 0xff6a00, life = 3 }) {
  const m = new THREE.Mesh(ballGeo, new THREE.MeshBasicMaterial({ color: 0xfff0a0 }));
  m.scale.setScalar(radius * 0.6);
  const halo = new THREE.Mesh(ballGeo, new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.55, depthWrite: false, blending: THREE.AdditiveBlending }));
  halo.scale.setScalar(1.8);
  m.add(halo);
  m.position.set(x, y, z);
  G.scene.add(m);
  const l = Math.hypot(dx, dy, dz) || 1;
  projs.push({ m, vx: dx / l * speed, vy: dy / l * speed, vz: dz / l * speed, dmg, owner, radius, life, color });
}

export function updateProjectiles(dt) {
  for (let i = projs.length - 1; i >= 0; i--) {
    const p = projs[i];
    p.life -= dt;
    const pos = p.m.position;
    pos.x += p.vx * dt; pos.y += p.vy * dt; pos.z += p.vz * dt;
    particle(pos.x, pos.y, pos.z, rand(-1, 1), rand(0, 1.5), rand(-1, 1), Math.random() < 0.5 ? p.color : 0xffd060, p.radius * 0.8, 0.35, 0);
    let hit = false;
    if (p.owner === 'player') {
      for (const e of G.enemies) {
        if (e.dead || e.state === 'sleep') continue;
        const dx = e.pos.x - pos.x, dz = e.pos.z - pos.z, dy = pos.y - (e.pos.y + e.T.height * 0.5);
        if (Math.hypot(dx, dz) < e.radius + p.radius && Math.abs(dy) < e.T.height * 0.7 + p.radius) {
          const l = Math.hypot(p.vx, p.vz) || 1;
          damageEnemy(e, calcDamage(p.dmg, e.T.def), p.vx / l, p.vz / l, 5, false);
          hit = true; break;
        }
      }
    } else {
      const P = G.player;
      if (!P.dead && Math.hypot(P.pos.x - pos.x, P.pos.z - pos.z) < 0.6 + p.radius && pos.y > P.pos.y - 0.5 && pos.y < P.pos.y + 2.4) {
        hurtPlayer(p.dmg, pos, 8);
        hit = true;
      }
    }
    if (pos.y < heightAt(pos.x, pos.z)) hit = true;
    if (hit || p.life <= 0) {
      burst(pos.x, pos.y, pos.z, p.color, 18, 6, 0.3, 0.5, -4);
      if (hit) sfx.boom();
      G.scene.remove(p.m);
      p.m.material.dispose(); p.m.children[0].material.dispose();
      projs.splice(i, 1);
    }
  }
}

export function clearProjectiles() {
  for (const p of projs) { G.scene.remove(p.m); p.m.material.dispose(); p.m.children[0].material.dispose(); }
  projs.length = 0;
}
