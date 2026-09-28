// 敵のモデル・AI・スポーン
import * as THREE from 'three';
import { G, rand, randInt, angleLerp } from './state.js';
import { heightAt, moveEntity, PLACES, WATER_Y } from './world.js';
import { burst, ring, particle, spawnProjectile, dmgNumber } from './combat.js';
import { hurtPlayer, gainExp, gainGold } from './player.js';
import { sfx, playBGM } from './audio.js';
import { onDragonDefeated, onEnemyKilled } from './npc.js';
import * as UI from './ui.js';

export const TYPES = {
  slime: { name: 'スライム', hp: 24, atk: 7, def: 0, speed: 3.2, exp: 7, gold: [2, 5], aggro: 11, range: 1.5, radius: 0.7, height: 1.1, cd: 1.6, windup: 0.45 },
  goblin: { name: 'ゴブリン', hp: 50, atk: 12, def: 2, speed: 5.0, exp: 18, gold: [6, 12], aggro: 16, range: 1.8, radius: 0.6, height: 1.7, cd: 1.3, windup: 0.4 },
  golem: { name: 'ゴーレム', hp: 150, atk: 22, def: 6, speed: 2.6, exp: 55, gold: [18, 30], aggro: 14, range: 2.8, radius: 1.2, height: 3.2, cd: 2.2, windup: 0.75 },
  dragon: { name: '炎竜ヴァルガス', hp: 1100, atk: 34, def: 8, speed: 4.5, exp: 600, gold: [500, 500], aggro: 40, range: 7, radius: 3.4, height: 6, cd: 1.5, windup: 0.6 },
};

const ZONES = [
  { type: 'slime', x: 40, z: 20, r: 28, max: 7 },
  { type: 'slime', x: -30, z: 48, r: 26, max: 5 },
  { type: 'slime', x: -42, z: -30, r: 24, max: 4 },
  { type: 'goblin', x: 110, z: 70, r: 20, max: 6 },
  { type: 'goblin', x: 90, z: -30, r: 26, max: 4 },
  { type: 'golem', x: -60, z: -105, r: 24, max: 3 },
  { type: 'golem', x: 60, z: -105, r: 24, max: 3 },
];

const std = (c, o = {}) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.7, ...o });
function add(parent, geo, mat, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z); m.castShadow = true;
  parent.add(m);
  return m;
}
const eyeMat = () => std(0x111111);

// ---- モデル ----
const BUILD = {
  slime() {
    const root = new THREE.Group(), body = new THREE.Group(); root.add(body);
    const hue = rand(0.28, 0.4);
    add(body, new THREE.SphereGeometry(0.75, 18, 14), std(new THREE.Color().setHSL(hue, 0.7, 0.5), { transparent: true, opacity: 0.88, roughness: 0.2 }), 0, 0.55, 0).scale.set(1, 0.78, 1);
    add(body, new THREE.SphereGeometry(0.1, 8, 6), eyeMat(), 0.24, 0.72, 0.62);
    add(body, new THREE.SphereGeometry(0.1, 8, 6), eyeMat(), -0.24, 0.72, 0.62);
    return { root, parts: { body } };
  },
  goblin() {
    const root = new THREE.Group(), body = new THREE.Group(); root.add(body);
    const skin = std(0x6aa84f), cloth = std(0x6b4a2b);
    add(body, new THREE.CylinderGeometry(0.32, 0.36, 0.7, 8), cloth, 0, 0.85, 0);
    add(body, new THREE.SphereGeometry(0.34, 12, 10), skin, 0, 1.45, 0.02);
    for (const s of [-1, 1]) {
      const ear = add(body, new THREE.ConeGeometry(0.1, 0.4, 6), skin, s * 0.36, 1.55, 0); ear.rotation.z = -s * 1.2;
      add(body, new THREE.SphereGeometry(0.06, 6, 5), std(0xffee00, { emissive: 0x886600 }), s * 0.12, 1.5, 0.3);
    }
    const legL = new THREE.Group(), legR = new THREE.Group();
    legL.position.set(-0.15, 0.5, 0); legR.position.set(0.15, 0.5, 0); body.add(legL, legR);
    add(legL, new THREE.BoxGeometry(0.16, 0.5, 0.16), skin, 0, -0.25, 0);
    add(legR, new THREE.BoxGeometry(0.16, 0.5, 0.16), skin, 0, -0.25, 0);
    const arm = new THREE.Group(); arm.position.set(0.42, 1.1, 0); body.add(arm);
    add(arm, new THREE.BoxGeometry(0.14, 0.5, 0.14), skin, 0, -0.25, 0);
    const club = add(arm, new THREE.CylinderGeometry(0.1, 0.05, 0.9, 6), std(0x7a5230), 0, -0.5, 0.35);
    club.rotation.x = Math.PI / 2;
    return { root, parts: { body, legL, legR, arm } };
  },
  golem() {
    const root = new THREE.Group(), body = new THREE.Group(); root.add(body);
    const stone = std(0x8a8580, { flatShading: true }), moss = std(0x4f7a3a, { flatShading: true });
    add(body, new THREE.BoxGeometry(1.6, 1.4, 1.1), stone, 0, 1.9, 0);
    add(body, new THREE.BoxGeometry(1.2, 0.3, 0.9), moss, 0, 2.7, 0);
    add(body, new THREE.BoxGeometry(0.8, 0.7, 0.7), stone, 0, 3.0, 0.1);
    const glow = std(0x60f0ff, { emissive: 0x30d0ff, emissiveIntensity: 1.5 });
    add(body, new THREE.BoxGeometry(0.15, 0.1, 0.05), glow, 0.2, 3.05, 0.46);
    add(body, new THREE.BoxGeometry(0.15, 0.1, 0.05), glow, -0.2, 3.05, 0.46);
    const armL = new THREE.Group(), armR = new THREE.Group();
    armL.position.set(-1.05, 2.4, 0); armR.position.set(1.05, 2.4, 0); body.add(armL, armR);
    add(armL, new THREE.BoxGeometry(0.55, 1.6, 0.55), stone, 0, -0.8, 0);
    add(armR, new THREE.BoxGeometry(0.55, 1.6, 0.55), stone, 0, -0.8, 0);
    add(body, new THREE.BoxGeometry(0.5, 1.2, 0.5), stone, -0.45, 0.6, 0);
    add(body, new THREE.BoxGeometry(0.5, 1.2, 0.5), stone, 0.45, 0.6, 0);
    return { root, parts: { body, armL, armR } };
  },
  dragon() {
    const root = new THREE.Group(), body = new THREE.Group(); root.add(body);
    body.scale.setScalar(1.5);
    const scale = std(0xb3261e, { roughness: 0.5, flatShading: true }), belly = std(0xe8a84a, { flatShading: true }), horn = std(0xeee4d0);
    add(body, new THREE.SphereGeometry(1, 16, 12), scale, 0, 2.2, 0).scale.set(1.5, 1.2, 2.2);
    add(body, new THREE.SphereGeometry(1, 12, 10), belly, 0, 1.85, 0.3).scale.set(1.15, 0.9, 1.8);
    const neck = new THREE.Group(); neck.position.set(0, 2.9, 1.6); body.add(neck);
    add(neck, new THREE.CylinderGeometry(0.45, 0.65, 1.8, 10), scale, 0, 0.7, 0.4).rotation.x = 0.6;
    const head = new THREE.Group(); head.position.set(0, 1.5, 1.0); neck.add(head);
    add(head, new THREE.BoxGeometry(0.9, 0.7, 1.3), scale, 0, 0, 0.3);
    add(head, new THREE.BoxGeometry(0.7, 0.3, 0.9), scale, 0, 0.05, 1.1);
    const jaw = new THREE.Group(); jaw.position.set(0, -0.2, 0.5); head.add(jaw);
    add(jaw, new THREE.BoxGeometry(0.65, 0.18, 1.1), belly, 0, -0.05, 0.5);
    for (const s of [-1, 1]) {
      add(head, new THREE.ConeGeometry(0.12, 0.8, 6), horn, s * 0.3, 0.55, -0.2).rotation.x = -0.8;
      add(head, new THREE.SphereGeometry(0.1, 8, 6), std(0xffee55, { emissive: 0xffaa00, emissiveIntensity: 2 }), s * 0.4, 0.15, 0.6);
    }
    const mouth = new THREE.Object3D(); mouth.position.set(0, -0.1, 1.6); head.add(mouth);
    const wings = [];
    for (const s of [-1, 1]) {
      const w = new THREE.Group(); w.position.set(s * 0.9, 3.0, 0.3); body.add(w);
      const shape = new THREE.Shape();
      shape.moveTo(0, 0); shape.lineTo(s * 3.8, 1.2); shape.lineTo(s * 4.2, -0.6); shape.lineTo(s * 2.6, -0.9); shape.lineTo(s * 1.4, -1.8); shape.lineTo(0, -1.2);
      const m = add(w, new THREE.ShapeGeometry(shape), std(0x6b1414, { side: THREE.DoubleSide, flatShading: true }));
      m.rotation.x = -Math.PI / 2;
      wings.push(w);
    }
    const tail = [];
    let prev = body, tz = -2.0, ty = 2.1;
    for (let i = 0; i < 5; i++) {
      const seg = new THREE.Group(); seg.position.set(0, i === 0 ? ty : 0, i === 0 ? tz : -0.8); prev.add(seg);
      add(seg, new THREE.ConeGeometry(0.5 - i * 0.08, 1.1, 8), scale, 0, 0, -0.4).rotation.x = -Math.PI / 2;
      tail.push(seg); prev = seg;
    }
    const legs = [];
    for (const [x, z] of [[-1, 1.2], [1, 1.2], [-1, -1.1], [1, -1.1]]) {
      const l = new THREE.Group(); l.position.set(x, 1.6, z); body.add(l);
      add(l, new THREE.CylinderGeometry(0.35, 0.28, 1.6, 8), scale, 0, -0.8, 0);
      add(l, new THREE.BoxGeometry(0.5, 0.2, 0.7), scale, 0, -1.55, 0.15);
      legs.push(l);
    }
    for (let i = 0; i < 5; i++) add(body, new THREE.ConeGeometry(0.18, 0.5, 5), horn, 0, 3.4 - i * 0.1, 1.2 - i * 0.7);
    return { root, parts: { body, neck, head, jaw, mouth, wings, tail, legs } };
  },
};

function makeHpBar() {
  const g = new THREE.Group();
  const bg = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 0.14), new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.6, depthWrite: false }));
  const fg = new THREE.Mesh(new THREE.PlaneGeometry(1.14, 0.09), new THREE.MeshBasicMaterial({ color: 0xff4040, depthWrite: false }));
  fg.position.z = 0.001;
  g.add(bg, fg);
  g.visible = false;
  return { g, fg };
}

export function spawnEnemy(type, x, z, zone = null) {
  const T = TYPES[type];
  const b = BUILD[type]();
  b.root.traverse((o) => { if (o.isMesh) o.material = o.material.clone(); });
  const mats = [];
  b.root.traverse((o) => { if (o.isMesh && o.material.emissive) mats.push(o.material); });
  const bar = makeHpBar();
  bar.g.position.y = T.height + (type === 'dragon' ? 4 : 0.5);
  if (type !== 'dragon') b.root.add(bar.g);
  const e = {
    type, T, obj: b.root, parts: b.parts, mats, bar,
    baseEmissive: mats.map((m) => m.emissive.clone()),
    pos: new THREE.Vector3(x, heightAt(x, z), z), yaw: rand(0, Math.PI * 2),
    hp: T.hp, maxHp: T.hp, state: 'idle', timer: rand(0, 2), wx: x, wz: z,
    flash: 0, kb: new THREE.Vector3(), stun: 0, dead: false, deadT: 0,
    zone, radius: T.radius, anim: rand(0, 10), vy: 0, hitCount: 0,
  };
  G.scene.add(e.obj);
  G.enemies.push(e);
  e.obj.position.copy(e.pos);
  return e;
}

function randomSpot(zone) {
  for (let i = 0; i < 20; i++) {
    const a = rand(0, Math.PI * 2), r = Math.sqrt(Math.random()) * zone.r;
    const x = zone.x + Math.cos(a) * r, z = zone.z + Math.sin(a) * r;
    if (heightAt(x, z) > WATER_Y + 0.5 && Math.hypot(x, z) > 32) return [x, z];
  }
  return [zone.x, zone.z];
}

export function initEnemies() {
  for (const zone of ZONES) {
    zone.count = 0; zone.timer = 0;
    for (let i = 0; i < zone.max; i++) {
      const [x, z] = randomSpot(zone);
      spawnEnemy(zone.type, x, z, zone);
      zone.count++;
    }
  }
}

export function spawnDragon() {
  if (G.boss && !G.boss.dead) return;
  const A = PLACES.arena;
  const e = spawnEnemy('dragon', A.x, A.z - 6, null);
  e.state = 'sleep'; e.yaw = 0;
  G.boss = e;
}

export function resetBoss() {
  const e = G.boss;
  if (!e || e.dead) return;
  e.state = 'sleep';
  e.hp = Math.min(e.maxHp, e.hp + e.maxHp * 0.3);
  G.bossFight = false;
  UI.bossBar(null);
}

export function damageEnemy(e, amount, dirX, dirZ, kb, crit) {
  if (e.dead) return;
  e.hp -= amount;
  e.flash = 0.12;
  dmgNumber(e.pos.x, e.pos.y + e.T.height + 0.4, e.pos.z, crit ? `${amount}!` : amount, crit ? 'crit' : '');
  burst(e.pos.x - dirX * e.radius * 0.5, e.pos.y + e.T.height * 0.55, e.pos.z - dirZ * e.radius * 0.5, e.type === 'slime' ? 0x80ff90 : 0xffe0a0, 8, 4, 0.14, 0.4);
  if (e.type !== 'dragon') {
    const heavy = e.type === 'golem' ? 0.3 : 1;
    e.kb.set(dirX * kb * heavy, 0, dirZ * kb * heavy);
    if (e.state !== 'windup' || e.type !== 'golem') e.stun = e.type === 'golem' ? 0.15 : 0.3;
    if (e.state === 'idle' || e.state === 'return') e.state = 'chase';
  }
  e.bar.g.visible = true;
  if (e.hp <= 0) kill(e);
}

function kill(e) {
  e.dead = true; e.deadT = 0; e.hp = 0;
  e.bar.g.visible = false;
  sfx.kill();
  burst(e.pos.x, e.pos.y + e.T.height * 0.5, e.pos.z, e.type === 'slime' ? 0x60e070 : e.type === 'golem' ? 0x9a9590 : e.type === 'dragon' ? 0xff5020 : 0x6aa84f, e.type === 'dragon' ? 120 : 24, e.type === 'dragon' ? 12 : 5, 0.25, 0.9);
  gainExp(e.T.exp);
  const g = randInt(e.T.gold[0], e.T.gold[1]);
  gainGold(g);
  sfx.coin();
  if (e.type !== 'dragon' && Math.random() < 0.12) {
    G.player.inv.potion++;
    UI.msg(`${e.T.name}はポーションを落とした！`);
  }
  if (e.zone) e.zone.count--;
  onEnemyKilled(e);
  if (e.type === 'dragon') {
    G.bossFight = false;
    UI.bossBar(null);
    onDragonDefeated();
  }
}

// ---- 更新 ----
const _v = new THREE.Vector3();
export function updateEnemies(dt) {
  const P = G.player;
  for (let i = G.enemies.length - 1; i >= 0; i--) {
    const e = G.enemies[i];
    e.anim += dt;
    if (e.dead) {
      e.deadT += dt;
      const s = Math.max(0.01, 1 - e.deadT / (e.type === 'dragon' ? 2.5 : 0.5));
      e.obj.scale.setScalar(s);
      e.obj.rotation.z = (1 - s) * 0.8;
      if (e.type === 'dragon' && Math.random() < 0.5) burst(e.pos.x + rand(-4, 4), e.pos.y + rand(1, 6), e.pos.z + rand(-4, 4), 0xff8030, 4, 5, 0.3, 0.6);
      if (s <= 0.01) {
        G.scene.remove(e.obj);
        e.obj.traverse((o) => { if (o.isMesh) o.material.dispose(); });
        G.enemies.splice(i, 1);
      }
      continue;
    }
    if (e.type === 'dragon') updateDragon(e, dt);
    else updateBasic(e, dt, P);

    // 点滅
    e.flash = Math.max(0, e.flash - dt);
    const wind = e.state === 'windup' && Math.floor(e.anim * 14) % 2 === 0;
    for (let k = 0; k < e.mats.length; k++) {
      const m = e.mats[k];
      if (e.flash > 0) m.emissive.setRGB(1, 1, 1);
      else if (wind) m.emissive.setRGB(0.6, 0.1, 0);
      else m.emissive.copy(e.baseEmissive[k]);
    }
    e.obj.position.copy(e.pos);
    e.obj.rotation.y = e.yaw;
    if (e.bar.g.visible) {
      const r = Math.max(0, e.hp / e.maxHp);
      e.bar.fg.scale.x = Math.max(0.001, r);
      e.bar.fg.position.x = -(1 - r) * 0.57;
      e.bar.g.quaternion.copy(e.obj.quaternion).invert().multiply(G.camera.quaternion);
    }
  }

  // リスポーン
  for (const z of ZONES) {
    if (z.count >= z.max) continue;
    z.timer += dt;
    if (z.timer < 10) continue;
    const [x, zz] = randomSpot(z);
    if (Math.hypot(P.pos.x - x, P.pos.z - zz) < 35) continue;
    z.timer = 0;
    spawnEnemy(z.type, x, zz, z);
    z.count++;
  }
}

function separate(e) {
  for (const o of G.enemies) {
    if (o === e || o.dead) continue;
    const dx = e.pos.x - o.pos.x, dz = e.pos.z - o.pos.z, d = Math.hypot(dx, dz), m = e.radius + o.radius;
    if (d < m && d > 1e-3) { const p = (m - d) * 0.5; e.pos.x += dx / d * p; e.pos.z += dz / d * p; }
  }
}

function updateBasic(e, dt, P) {
  const T = e.T;
  const dx = P.pos.x - e.pos.x, dz = P.pos.z - e.pos.z, dist = Math.hypot(dx, dz);
  const toP = Math.atan2(dx, dz);
  const home = e.zone ? Math.hypot(e.pos.x - e.zone.x, e.pos.z - e.zone.z) : 0;
  let mvx = 0, mvz = 0, spd = 0;

  if (e.stun > 0) {
    e.stun -= dt;
  } else {
    switch (e.state) {
      case 'idle': {
        e.timer -= dt;
        if (e.timer <= 0) {
          const [x, z] = e.zone ? randomSpot(e.zone) : [e.pos.x + rand(-8, 8), e.pos.z + rand(-8, 8)];
          e.wx = x; e.wz = z; e.timer = rand(3, 7);
        }
        const wx = e.wx - e.pos.x, wz = e.wz - e.pos.z, wd = Math.hypot(wx, wz);
        if (wd > 1) { mvx = wx / wd; mvz = wz / wd; spd = T.speed * 0.35; e.yaw = angleLerp(e.yaw, Math.atan2(wx, wz), 1 - Math.exp(-dt * 4)); }
        if (!P.dead && dist < T.aggro) { e.state = 'chase'; if (e.type === 'goblin') particle(e.pos.x, e.pos.y + 2.2, e.pos.z, 0, 2, 0, 0xff3030, 0.3, 0.5, 0); }
        break;
      }
      case 'chase': {
        if (P.dead || dist > T.aggro * 2 || (e.zone && home > e.zone.r + 35)) { e.state = 'return'; break; }
        e.yaw = angleLerp(e.yaw, toP, 1 - Math.exp(-dt * 8));
        if (dist < T.range + 0.45) { e.state = 'windup'; e.timer = T.windup; }
        else { mvx = dx / dist; mvz = dz / dist; spd = T.speed; }
        break;
      }
      case 'windup': {
        e.yaw = angleLerp(e.yaw, toP, 1 - Math.exp(-dt * 5));
        e.timer -= dt;
        if (e.timer <= 0) {
          if (e.type === 'slime') { e.kb.set(Math.sin(e.yaw) * 9, 0, Math.cos(e.yaw) * 9); e.vy = 5; }
          if (e.type === 'golem') { ring(e.pos.x + Math.sin(e.yaw) * 2, e.pos.y + 0.2, e.pos.z + Math.cos(e.yaw) * 2, 0xb0a080, 2, 24); G.shake = Math.max(G.shake, 0.3); }
          const reach = T.range + (e.type === 'slime' ? 1.2 : 0.9);
          const facing = (dx * Math.sin(e.yaw) + dz * Math.cos(e.yaw)) / (dist || 1);
          if (dist < reach && facing > 0.3) hurtPlayer(T.atk, e.pos, e.type === 'golem' ? 12 : 7);
          e.state = 'recover'; e.timer = T.cd;
        }
        break;
      }
      case 'recover': {
        e.timer -= dt;
        e.yaw = angleLerp(e.yaw, toP, 1 - Math.exp(-dt * 2));
        if (e.timer <= 0) e.state = 'chase';
        break;
      }
      case 'return': {
        const hx = (e.zone ? e.zone.x : e.wx) - e.pos.x, hz = (e.zone ? e.zone.z : e.wz) - e.pos.z, hd = Math.hypot(hx, hz);
        e.hp = Math.min(e.maxHp, e.hp + dt * e.maxHp * 0.2);
        if (hd < (e.zone ? e.zone.r * 0.5 : 2)) { e.state = 'idle'; e.bar.g.visible = e.hp < e.maxHp; }
        else { mvx = hx / hd; mvz = hz / hd; spd = T.speed; e.yaw = angleLerp(e.yaw, Math.atan2(hx, hz), 1 - Math.exp(-dt * 6)); }
        if (!P.dead && dist < T.aggro * 0.6) e.state = 'chase';
        break;
      }
    }
  }

  moveEntity(e.pos, (mvx * spd + e.kb.x) * dt, (mvz * spd + e.kb.z) * dt, e.radius * 0.8);
  e.kb.multiplyScalar(Math.exp(-dt * 7));
  separate(e);
  const gh = heightAt(e.pos.x, e.pos.z);
  e.vy -= 25 * dt;
  e.pos.y += e.vy * dt;
  if (e.pos.y < gh) { e.pos.y = gh; e.vy = 0; }

  // アニメーション
  const moving = spd > 0.1;
  const p = e.parts;
  if (e.type === 'slime') {
    const k = moving ? Math.abs(Math.sin(e.anim * 8)) : Math.abs(Math.sin(e.anim * 3)) * 0.3;
    p.body.scale.set(1 + (1 - k) * 0.15, 0.8 + k * 0.35, 1 + (1 - k) * 0.15);
    if (e.state === 'windup') p.body.scale.set(1.3, 0.6, 1.3);
  } else if (e.type === 'goblin') {
    const sw = moving ? Math.sin(e.anim * 12) * 0.7 : 0;
    p.legL.rotation.x = sw; p.legR.rotation.x = -sw;
    p.arm.rotation.x = e.state === 'windup' ? -2.6 : e.state === 'recover' && e.timer > T.cd - 0.2 ? 0.4 : -sw * 0.5;
    p.body.position.y = moving ? Math.abs(Math.sin(e.anim * 12)) * 0.08 : 0;
  } else if (e.type === 'golem') {
    const sw = moving ? Math.sin(e.anim * 4) * 0.4 : 0;
    p.armL.rotation.x = sw; p.armR.rotation.x = -sw;
    if (e.state === 'windup') { p.armL.rotation.x = p.armR.rotation.x = -2.6; }
    else if (e.state === 'recover' && e.timer > T.cd - 0.3) { p.armL.rotation.x = p.armR.rotation.x = -0.6; }
    p.body.rotation.z = moving ? Math.sin(e.anim * 4) * 0.06 : 0;
  }
}

// ---- ボス: 炎竜 ----
function updateDragon(e, dt) {
  const P = G.player, A = PLACES.arena, p = e.parts;
  const dx = P.pos.x - e.pos.x, dz = P.pos.z - e.pos.z, dist = Math.hypot(dx, dz);
  const toP = Math.atan2(dx, dz);
  const pInArena = Math.hypot(P.pos.x - A.x, P.pos.z - A.z) < A.r + 1;
  const phase2 = e.hp < e.maxHp * 0.5;
  const sp = phase2 ? 1.35 : 1;

  // 羽ばたき・尻尾
  const flap = e.state === 'sleep' ? 0.1 : 0.45;
  p.wings[0].rotation.z = Math.sin(e.anim * 3) * flap + 0.2;
  p.wings[1].rotation.z = -Math.sin(e.anim * 3) * flap - 0.2;
  p.tail.forEach((t, i) => { t.rotation.y = Math.sin(e.anim * 2 - i * 0.6) * 0.25; });
  p.body.position.y = Math.sin(e.anim * 1.5) * 0.1;
  p.jaw.rotation.x = 0; p.neck.rotation.x = 0; p.head.rotation.x = 0;

  if (e.state === 'sleep') {
    p.neck.rotation.x = 0.6; p.head.rotation.x = 0.4;
    if (!P.dead && pInArena) {
      e.state = 'roar'; e.timer = 1.8;
      sfx.roar(); G.shake = 1.2;
      G.bossFight = true;
      UI.bossBar(e);
      UI.banner(e.T.name);
      playBGM('boss');
    }
    return;
  }
  if (P.dead || Math.hypot(P.pos.x - A.x, P.pos.z - A.z) > A.r + 30) { resetBoss(); return; }
  if (phase2 && !e.p2) {
    e.p2 = true; e.state = 'roar'; e.timer = 1.4;
    sfx.roar(); G.shake = 1; UI.msg('炎竜が怒り狂っている！');
  }

  let move = 0;
  switch (e.state) {
    case 'roar':
      e.timer -= dt;
      p.neck.rotation.x = -0.5; p.jaw.rotation.x = 0.6;
      if (Math.random() < 0.5) particle(e.pos.x + rand(-2, 2), e.pos.y + 0.3, e.pos.z + rand(-2, 2), 0x886655, rand(-3, 3), 2, rand(-3, 3), 0.4, 0.6, -3);
      if (e.timer <= 0) { e.state = 'chase'; e.timer = 1; }
      break;
    case 'chase': {
      e.yaw = angleLerp(e.yaw, toP, 1 - Math.exp(-dt * 2.5 * sp));
      if (dist > 9) move = e.T.speed * sp;
      e.timer -= dt;
      if (e.timer <= 0) {
        const facing = (dx * Math.sin(e.yaw) + dz * Math.cos(e.yaw)) / (dist || 1);
        const r = Math.random();
        if (dist < 9 && facing > 0.5) e.state = r < 0.45 ? 'bite' : r < 0.75 ? 'stomp' : 'breath';
        else if (dist < 9) e.state = 'stomp';
        else e.state = r < 0.55 ? 'volley' : 'breath';
        e.timer = 0; e.fired = 0; e.tick = 0;
        if (e.state === 'breath') sfx.fire();
      }
      break;
    }
    case 'bite': {
      e.timer += dt * sp;
      e.yaw = angleLerp(e.yaw, toP, 1 - Math.exp(-dt * 3));
      if (e.timer < 0.6) { p.neck.rotation.x = -0.4; p.jaw.rotation.x = 0.7; }
      else if (e.timer < 0.85) {
        p.neck.rotation.x = 0.6; p.jaw.rotation.x = 0;
        if (!e.fired) {
          e.fired = 1;
          const facing = (dx * Math.sin(e.yaw) + dz * Math.cos(e.yaw)) / (dist || 1);
          if (dist < 9.5 && facing > 0.55) hurtPlayer(e.T.atk * 1.2, e.pos, 12);
        }
      } else if (e.timer > 1.3) toChase(e, sp);
      break;
    }
    case 'stomp': {
      e.timer += dt * sp;
      if (e.timer < 0.8) { p.body.position.y = e.timer * 1.2; p.body.rotation.x = -e.timer * 0.3; }
      else if (!e.fired) {
        e.fired = 1; p.body.position.y = 0; p.body.rotation.x = 0;
        G.shake = 0.9; sfx.boom();
        ring(e.pos.x, e.pos.y + 0.3, e.pos.z, 0xffa040, 5, 48);
        ring(e.pos.x, e.pos.y + 0.3, e.pos.z, 0x886655, 3.5, 30);
        if (dist < 10.5 && P.pos.y - heightAt(P.pos.x, P.pos.z) < 1) hurtPlayer(e.T.atk * 1.3, e.pos, 16);
      }
      if (e.timer > 1.6) { p.body.rotation.x = 0; toChase(e, sp); }
      break;
    }
    case 'breath': {
      e.timer += dt;
      e.yaw = angleLerp(e.yaw, toP, 1 - Math.exp(-dt * 1.1 * sp));
      p.neck.rotation.x = 0.3; p.jaw.rotation.x = 0.6;
      if (e.timer > 0.4 && e.timer < 2.2) {
        p.mouth.getWorldPosition(_v);
        const fx = Math.sin(e.yaw), fz = Math.cos(e.yaw);
        for (let i = 0; i < 4; i++) {
          const s = rand(14, 20);
          particle(_v.x, _v.y, _v.z, (fx + rand(-0.2, 0.2)) * s, rand(-5, -1), (fz + rand(-0.2, 0.2)) * s, [0xff4010, 0xff9020, 0xffd040][i % 3], rand(0.35, 0.7), 0.75, 0);
        }
        e.tick -= dt;
        if (e.tick <= 0) {
          e.tick = 0.2;
          const facing = (dx * fx + dz * fz) / (dist || 1);
          if (dist < 16 && facing > 0.88) hurtPlayer(e.T.atk * 0.9, e.pos, 5);
        }
      }
      if (e.timer > 2.6) toChase(e, sp);
      break;
    }
    case 'volley': {
      e.timer += dt;
      e.yaw = angleLerp(e.yaw, toP, 1 - Math.exp(-dt * 4));
      p.neck.rotation.x = -0.3; p.jaw.rotation.x = 0.5;
      const n = phase2 ? 5 : 3;
      if (e.timer > 0.5 && e.fired < n && e.timer > 0.5 + e.fired * 0.28) {
        p.mouth.getWorldPosition(_v);
        const tx = P.pos.x + rand(-2, 2) * (e.fired ? 1 : 0), tz = P.pos.z + rand(-2, 2) * (e.fired ? 1 : 0), ty = P.pos.y + 1;
        spawnProjectile({ x: _v.x, y: _v.y, z: _v.z, dx: tx - _v.x, dy: ty - _v.y, dz: tz - _v.z, speed: 17, dmg: e.T.atk * 0.95, owner: 'enemy', radius: 0.7, color: 0xff4a10, life: 4 });
        sfx.fire();
        e.fired++;
      }
      if (e.timer > 0.6 + n * 0.28 + 0.5) toChase(e, sp);
      break;
    }
  }
  if (move) moveEntity(e.pos, Math.sin(e.yaw) * move * dt, Math.cos(e.yaw) * move * dt, 2.5);
  const ax = e.pos.x - A.x, az = e.pos.z - A.z, ad = Math.hypot(ax, az), lim = A.r - 4;
  if (ad > lim) { e.pos.x = A.x + ax / ad * lim; e.pos.z = A.z + az / ad * lim; }
  e.pos.y = heightAt(e.pos.x, e.pos.z);
  // 足踏み
  if (move) p.legs.forEach((l, i) => { l.rotation.x = Math.sin(e.anim * 6 + i * Math.PI) * 0.4; });
  // プレイヤーを押し出す
  if (!P.dead && dist < e.radius + 0.6) {
    const m = e.radius + 0.6;
    P.pos.x = e.pos.x + dx / (dist || 1) * m; P.pos.z = e.pos.z + dz / (dist || 1) * m;
  }
  UI.bossBar(e);
}

function toChase(e, sp) {
  e.state = 'chase';
  e.timer = rand(0.7, 1.5) / sp;
}
