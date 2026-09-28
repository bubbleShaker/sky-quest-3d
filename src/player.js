// プレイヤーのモデル・操作・ステータス
import * as THREE from 'three';
import { G, clamp, rand, angleLerp } from './state.js';
import { input, consume } from './input.js';
import { cam } from './camera.js';
import { heightAt, moveEntity, PLACES, barrierOn } from './world.js';
import { sfx, stopBGM } from './audio.js';
import { meleeHit, spawnProjectile, burst, ring, dmgNumber } from './combat.js';
import { WEAPONS, ARMORS, useItem } from './items.js';
import * as UI from './ui.js';

export const expToNext = (lv) => Math.floor(18 * Math.pow(lv, 1.6));
export const SPAWN = { x: 0, z: 8 };
export const SKILLS = {
  spin: { mp: 10, cd: 3.0 },
  fire: { mp: 8, cd: 1.2 },
};
const ATTACKS = [
  { dur: 0.3, range: 2.7, mult: 1.0, kb: 5 },
  { dur: 0.3, range: 2.7, mult: 1.1, kb: 5 },
  { dur: 0.45, range: 3.1, mult: 1.7, kb: 11 },
];

const std = (c, o = {}) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.6, ...o });
function part(geo, mat, x, y, z, parent) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z); m.castShadow = true;
  parent.add(m);
  return m;
}

export function createPlayer() {
  const obj = new THREE.Group(), rig = new THREE.Group();
  rig.position.y = 1; obj.add(rig);
  const skin = std(0xffd6b0), cloth = std(0x2f6fdb), pants = std(0x3a3040), hair = std(0x6b4423), boot = std(0x4a3020), dark = std(0x111111);
  const gold = std(0xe0b030, { metalness: 0.7, roughness: 0.3 }), blade = std(0x9c6b3c, { metalness: 0.3, roughness: 0.4 });
  part(new THREE.CylinderGeometry(0.4, 0.34, 0.85, 12), cloth, 0, 0.28, 0, rig);
  part(new THREE.CylinderGeometry(0.37, 0.37, 0.12, 12), boot, 0, -0.1, 0, rig);
  const cape = part(new THREE.BoxGeometry(0.7, 0.95, 0.05), std(0xb02a2a), 0, 0.2, -0.36, rig);
  cape.rotation.x = 0.15;
  part(new THREE.SphereGeometry(0.32, 16, 12), skin, 0, 0.98, 0, rig);
  part(new THREE.SphereGeometry(0.345, 16, 12, 0, Math.PI * 2, 0, Math.PI * 0.5), hair, 0, 1.02, -0.02, rig);
  part(new THREE.SphereGeometry(0.05, 8, 6), dark, 0.11, 0.99, 0.29, rig);
  part(new THREE.SphereGeometry(0.05, 8, 6), dark, -0.11, 0.99, 0.29, rig);
  const limb = (x, y, len, w, mat, end) => {
    const g = new THREE.Group(); g.position.set(x, y, 0); rig.add(g);
    part(new THREE.BoxGeometry(w, len, w), mat, 0, -len / 2, 0, g);
    part(new THREE.SphereGeometry(w * 0.62, 8, 6), end, 0, -len, 0, g);
    return g;
  };
  const legL = limb(-0.17, -0.18, 0.78, 0.22, pants, boot), legR = limb(0.17, -0.18, 0.78, 0.22, pants, boot);
  const armL = limb(-0.52, 0.62, 0.68, 0.18, cloth, skin), armR = limb(0.52, 0.62, 0.68, 0.18, cloth, skin);
  const sword = new THREE.Group();
  sword.position.set(0, -0.68, 0.04); sword.rotation.x = Math.PI / 2; armR.add(sword);
  part(new THREE.BoxGeometry(0.07, 0.3, 0.07), boot, 0, -0.05, 0, sword);
  part(new THREE.BoxGeometry(0.34, 0.06, 0.1), gold, 0, 0.12, 0, sword);
  part(new THREE.BoxGeometry(0.1, 1.2, 0.03), blade, 0, 0.75, 0, sword);
  const shield = part(new THREE.CylinderGeometry(0.36, 0.36, 0.07, 16), std(0x8a5a2a), -0.12, -0.4, 0.05, armL);
  shield.rotation.z = Math.PI / 2;
  part(new THREE.CylinderGeometry(0.12, 0.12, 0.08, 12), gold, -0.14, -0.4, 0.05, armL).rotation.z = Math.PI / 2;

  const mats = new Set();
  obj.traverse((o) => { if (o.isMesh) mats.add(o.material); });

  const P = {
    obj, rig, legL, legR, armL, armR, clothMat: cloth, bladeMat: blade, mats: [...mats],
    pos: new THREE.Vector3(SPAWN.x, 0, SPAWN.z), vy: 0, onGround: true, yaw: Math.PI,
    kb: new THREE.Vector3(),
    level: 1, exp: 0, gold: 30, hp: 80, mp: 30,
    inv: { potion: 3, ether: 1 }, weapon: 'wood', armor: 'cloth', owned: { wood: true, cloth: true },
    maxHp: 80, maxMp: 30, atk: 12, def: 2,
    atkState: null, buffer: false, spin: null, cast: null, dodge: null,
    cdSpin: 0, cdFire: 0, cdDodge: 0, invuln: 0, hurtFlash: 0, sinceHurt: 99,
    walk: 0, dead: false, deadT: 0,
  };
  P.pos.y = heightAt(P.pos.x, P.pos.z);
  recalc(P);
  G.scene.add(obj);
  return P;
}

export function recalc(P) {
  P.maxHp = 80 + (P.level - 1) * 22;
  P.maxMp = 30 + (P.level - 1) * 6;
  P.atk = 12 + (P.level - 1) * 3 + WEAPONS[P.weapon].atk;
  P.def = Math.round(2 + (P.level - 1) * 1.5 + ARMORS[P.armor].def);
  P.hp = Math.min(P.hp, P.maxHp);
  P.mp = Math.min(P.mp, P.maxMp);
  updateLook(P);
}

export function updateLook(P) {
  const w = WEAPONS[P.weapon], a = ARMORS[P.armor];
  P.bladeMat.color.set(w.color);
  P.bladeMat.emissive.set(w.emissive || 0x000000);
  P.bladeMat.metalness = P.weapon === 'wood' ? 0.1 : 0.8;
  P.clothMat.color.set(a.color);
  P.clothMat.metalness = P.armor === 'steel' ? 0.6 : 0;
}

export function gainExp(n) {
  const P = G.player;
  P.exp += n;
  dmgNumber(P.pos.x, P.pos.y + 2.4, P.pos.z, `+${n} EXP`, 'exp');
  let up = false;
  while (P.exp >= expToNext(P.level)) {
    P.exp -= expToNext(P.level);
    P.level++;
    up = true;
  }
  if (up) {
    recalc(P);
    P.hp = P.maxHp; P.mp = P.maxMp;
    sfx.levelup();
    UI.banner('LEVEL UP!');
    UI.msg(`レベル ${P.level} になった！ HP・MPが全回復した`);
    burst(P.pos.x, P.pos.y + 1, P.pos.z, 0xffd35a, 40, 7, 0.25, 1.0, -3);
    ring(P.pos.x, P.pos.y + 0.3, P.pos.z, 0xfff0a0, 3);
  }
}

export function gainGold(n) {
  G.player.gold += n;
}

export function hurtPlayer(amount, from, kb = 7) {
  const P = G.player;
  if (P.dead || P.invuln > 0 || P.dodge) return false;
  const dmg = Math.max(1, Math.round((amount - P.def * 0.6) * rand(0.9, 1.1)));
  P.hp -= dmg; P.sinceHurt = 0; P.invuln = 0.7; P.hurtFlash = 0.15;
  dmgNumber(P.pos.x, P.pos.y + 2, P.pos.z, dmg, 'player');
  sfx.hurt();
  G.shake = Math.max(G.shake, 0.35);
  burst(P.pos.x, P.pos.y + 1.2, P.pos.z, 0xff3030, 8, 3, 0.15, 0.4);
  if (from) {
    const dx = P.pos.x - from.x, dz = P.pos.z - from.z, d = Math.hypot(dx, dz) || 1;
    P.kb.set(dx / d * kb, 0, dz / d * kb);
  }
  if (P.hp <= 0) { P.hp = 0; die(); }
  return true;
}

function die() {
  const P = G.player;
  P.dead = true; P.deadT = 0;
  P.atkState = P.spin = P.cast = P.dodge = null;
  stopBGM();
  UI.msg('力尽きてしまった…');
}

export function revive() {
  const P = G.player;
  P.dead = false; P.hp = P.maxHp; P.mp = P.maxMp;
  P.gold = Math.floor(P.gold / 2);
  P.pos.set(SPAWN.x, heightAt(SPAWN.x, SPAWN.z), SPAWN.z);
  P.vy = 0; P.kb.set(0, 0, 0); P.invuln = 2;
  P.rig.rotation.set(0, 0, 0); P.rig.position.y = 1;
  P.yaw = Math.PI; cam.yaw = 0;
}

function nearestEnemy(maxD, minDot) {
  const P = G.player, fx = Math.sin(P.yaw), fz = Math.cos(P.yaw);
  let best = null, bd = maxD;
  for (const e of G.enemies) {
    if (e.dead || e.state === 'sleep') continue;
    const dx = e.pos.x - P.pos.x, dz = e.pos.z - P.pos.z, d = Math.hypot(dx, dz) - e.radius;
    if (d > bd) continue;
    if ((dx * fx + dz * fz) / (Math.hypot(dx, dz) || 1) < minDot) continue;
    best = e; bd = d;
  }
  return best;
}

function faceEnemy(e) {
  const P = G.player;
  P.yaw = Math.atan2(e.pos.x - P.pos.x, e.pos.z - P.pos.z);
}

function startAttack(step) {
  const P = G.player;
  const t = nearestEnemy(5, -0.2);
  if (t) faceEnemy(t);
  P.atkState = { step, t: 0, hit: false };
  P.buffer = false;
  sfx.swing();
  if (step === 2) { P.kb.set(Math.sin(P.yaw) * 7, 0, Math.cos(P.yaw) * 7); if (P.onGround) P.vy = 4; }
}

const busy = (P) => P.atkState || P.spin || P.cast || P.dodge;

export function updatePlayer(dt) {
  const P = G.player;
  P.cdSpin = Math.max(0, P.cdSpin - dt);
  P.cdFire = Math.max(0, P.cdFire - dt);
  P.cdDodge = Math.max(0, P.cdDodge - dt);
  P.invuln = Math.max(0, P.invuln - dt);
  P.hurtFlash = Math.max(0, P.hurtFlash - dt);
  P.sinceHurt += dt;

  if (P.dead) { animateDeath(dt); return; }

  P.mp = Math.min(P.maxMp, P.mp + dt * 1.2);
  if (P.sinceHurt > 6) P.hp = Math.min(P.maxHp, P.hp + dt * P.maxHp * 0.012);

  // ---- 行動入力 ----
  if (consume('potion')) useItem('potion');
  if (consume('ether')) useItem('ether');
  if (consume('dodge') && !P.dodge && P.cdDodge <= 0 && (!P.atkState || P.atkState.hit)) {
    let dx = 0, dz = 0;
    if (Math.hypot(input.moveX, input.moveY) > 0.1) {
      const s = Math.sin(cam.yaw), c = Math.cos(cam.yaw);
      dx = -s * input.moveY + c * input.moveX; dz = -c * input.moveY - s * input.moveX;
    } else { dx = Math.sin(P.yaw); dz = Math.cos(P.yaw); }
    const l = Math.hypot(dx, dz) || 1;
    P.dodge = { t: 0, dx: dx / l, dz: dz / l };
    P.atkState = null; P.yaw = Math.atan2(dx, dz);
    P.cdDodge = 0.2;
    sfx.dodge();
  }
  if (consume('attack')) {
    if (P.atkState) P.buffer = true;
    else if (!busy(P)) startAttack(0);
  }
  if (consume('skill1') && !busy(P)) {
    if (P.cdSpin > 0) { /* クールダウン中 */ }
    else if (P.mp < SKILLS.spin.mp) { UI.msg('MPが足りない'); sfx.error(); }
    else { P.mp -= SKILLS.spin.mp; P.cdSpin = SKILLS.spin.cd; P.spin = { t: 0, hit: false }; sfx.spin(); }
  }
  if (consume('skill2') && !busy(P)) {
    if (P.cdFire > 0) { /* クールダウン中 */ }
    else if (P.mp < SKILLS.fire.mp) { UI.msg('MPが足りない'); sfx.error(); }
    else {
      P.mp -= SKILLS.fire.mp; P.cdFire = SKILLS.fire.cd;
      const t = nearestEnemy(28, 0.4);
      if (t) faceEnemy(t);
      P.cast = { t: 0, fired: false, target: t };
    }
  }
  if (consume('jump') && P.onGround && !busy(P)) { P.vy = 9; P.onGround = false; sfx.jump(); }

  // ---- 攻撃の進行 ----
  if (P.atkState) {
    const a = P.atkState, A = ATTACKS[a.step];
    a.t += dt;
    const k = a.t / A.dur;
    if (!a.hit && k >= 0.45) {
      a.hit = true;
      meleeHit(P.pos.x, P.pos.z, P.yaw, A.range, 0.25, P.atk * A.mult, A.kb);
      const fx = Math.sin(P.yaw), fz = Math.cos(P.yaw);
      for (let i = 0; i < 6; i++) burstSlash(P.pos.x + fx * 1.6, P.pos.y + 1.1, P.pos.z + fz * 1.6);
    }
    if (k >= 1) {
      if (P.buffer && a.step < 2) startAttack(a.step + 1);
      else P.atkState = null;
    }
  }
  if (P.spin) {
    P.spin.t += dt;
    if (!P.spin.hit && P.spin.t > 0.25) {
      P.spin.hit = true;
      meleeHit(P.pos.x, P.pos.z, P.yaw, 4.0, -1, P.atk * 1.8, 10);
      ring(P.pos.x, P.pos.y + 1, P.pos.z, 0x9fe0ff, 2.2, 40);
    }
    if (P.spin.t >= 0.55) P.spin = null;
  }
  if (P.cast) {
    P.cast.t += dt;
    if (!P.cast.fired && P.cast.t > 0.18) {
      P.cast.fired = true;
      const fx = Math.sin(P.yaw), fz = Math.cos(P.yaw);
      const sx = P.pos.x + fx * 0.9, sy = P.pos.y + 1.4, sz = P.pos.z + fz * 0.9;
      let dy = 0;
      const t = P.cast.target;
      if (t && !t.dead) dy = (t.pos.y + t.T.height * 0.5 - sy) / Math.max(1, Math.hypot(t.pos.x - sx, t.pos.z - sz));
      spawnProjectile({ x: sx, y: sy, z: sz, dx: fx, dy, dz: fz, speed: 24, dmg: P.atk * 2.0, owner: 'player', radius: 0.45, color: 0xff6a10, life: 1.6 });
      sfx.fire();
    }
    if (P.cast.t >= 0.35) P.cast = null;
  }

  // ---- 移動 ----
  const s = Math.sin(cam.yaw), c = Math.cos(cam.yaw);
  let mx = -s * input.moveY + c * input.moveX, mz = -c * input.moveY - s * input.moveX;
  const ml = Math.hypot(mx, mz);
  let speed = 7.5;
  if (P.dodge) {
    P.dodge.t += dt;
    const k = P.dodge.t / 0.42;
    mx = P.dodge.dx; mz = P.dodge.dz; speed = 15 * (1 - k * 0.6);
    if (k >= 1) P.dodge = null;
  } else if (busy(P)) {
    speed = P.spin ? 3 : 1.2;
  } else if (ml > 0.05) {
    P.yaw = angleLerp(P.yaw, Math.atan2(mx, mz), 1 - Math.exp(-dt * 14));
  }
  const moving = P.dodge ? 1 : ml;
  const oldX = P.pos.x, oldZ = P.pos.z;
  moveEntity(P.pos, (mx * speed + P.kb.x) * dt, (mz * speed + P.kb.z) * dt, 0.45);
  P.kb.multiplyScalar(Math.exp(-dt * 8));
  if (barrierOn()) {
    const A = PLACES.arena, dx = P.pos.x - A.x, dz = P.pos.z - A.z, d = Math.hypot(dx, dz), m = A.r + 3.5;
    if (d < m) {
      P.pos.x = A.x + dx / d * m; P.pos.z = A.z + dz / d * m;
      if (!P.barrierMsg || G.time - P.barrierMsg > 4) { P.barrierMsg = G.time; UI.msg('炎の結界に阻まれた…。村長の話を聞こう'); }
    }
  }
  const realSpeed = Math.hypot(P.pos.x - oldX, P.pos.z - oldZ) / Math.max(dt, 1e-4);

  // 重力と接地
  const gh = heightAt(P.pos.x, P.pos.z);
  P.vy -= 25 * dt;
  P.pos.y += P.vy * dt;
  if (P.pos.y <= gh || (P.onGround && P.vy <= 0 && P.pos.y - gh < 0.7)) { P.pos.y = gh; P.vy = 0; P.onGround = true; }
  else P.onGround = false;

  animate(dt, moving, realSpeed);
}

function burstSlash(x, y, z) {
  burst(x, y, z, 0xeaf6ff, 1, 3, 0.12, 0.25, 0);
}

function animate(dt, moving, realSpeed) {
  const P = G.player;
  const { rig, legL, legR, armL, armR } = P;
  P.walk += dt * Math.min(realSpeed, 9) * 1.5;
  const walkAmt = P.onGround && moving > 0.1 && !P.dodge ? 1 : 0;
  const sw = Math.sin(P.walk) * 0.8 * walkAmt;
  legL.rotation.x = sw; legR.rotation.x = -sw;
  armL.rotation.x = -sw * 0.6; armL.rotation.z = 0;
  armR.rotation.set(sw * 0.6, 0, 0);
  rig.rotation.set(0, 0, 0);
  rig.position.y = 1 + (walkAmt ? Math.abs(Math.sin(P.walk)) * 0.08 : Math.sin(G.time * 2) * 0.02);
  if (!P.onGround) { legL.rotation.x = -0.5; legR.rotation.x = 0.3; }
  let yaw = P.yaw;

  if (P.atkState) {
    const a = P.atkState, k = Math.min(1, a.t / ATTACKS[a.step].dur), e = 1 - Math.pow(1 - k, 3);
    if (a.step === 0) { armR.rotation.x = -2.7 + e * 2.5; armR.rotation.z = 0.2; }
    else if (a.step === 1) { armR.rotation.x = -1.9 + e * 0.6; armR.rotation.z = 1.0 - e * 2.0; yaw += 0.6 - e * 1.2; }
    else { armR.rotation.x = -3.0 + e * 2.9; rig.rotation.x = e * 0.25; }
    armL.rotation.x = -0.6;
  }
  if (P.spin) { yaw += (P.spin.t / 0.55) * Math.PI * 4; armR.rotation.set(-1.5, 0, 1.2); armL.rotation.z = -1.2; }
  if (P.cast) { armL.rotation.x = -1.6; armR.rotation.x = -1.4; }
  if (P.dodge) {
    const k = P.dodge.t / 0.42;
    rig.rotation.x = k * Math.PI * 2; rig.position.y = 0.7;
    legL.rotation.x = legR.rotation.x = -1.2; armL.rotation.x = armR.rotation.x = -1.4;
  }
  P.obj.rotation.y = yaw;
  P.obj.position.copy(P.pos);

  // 被ダメージの点滅
  const blink = P.invuln > 0 && !P.dodge && Math.floor(P.invuln * 20) % 2 === 0;
  P.rig.visible = !blink || P.invuln < 0.05;
  for (const m of P.mats) if (m.emissive && m !== P.bladeMat) m.emissive.setRGB(P.hurtFlash > 0 ? 0.8 : 0, 0, 0);
}

function animateDeath(dt) {
  const P = G.player;
  P.deadT += dt;
  P.rig.rotation.x = Math.max(-Math.PI / 2, -P.deadT * 4);
  P.rig.position.y = Math.max(0.3, 1 - P.deadT * 2);
  P.obj.position.copy(P.pos);
  if (P.deadT > 1.8 && G.state === 'play') UI.showGameOver();
}
