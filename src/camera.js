// 三人称追従カメラ
import * as THREE from 'three';
import { G, clamp } from './state.js';
import { input } from './input.js';
import { heightAt, houses } from './world.js';

export const cam = { yaw: 0, pitch: 0.38, dist: 10, target: new THREE.Vector3() };
const tmp = new THREE.Vector3();

export function snapCamera() {
  const p = G.player.pos;
  cam.target.set(p.x, p.y + 1.6, p.z);
  updateCamera(0);
}

export function updateCamera(dt) {
  const sens = 0.0028;
  cam.yaw -= input.lookX * sens;
  cam.pitch = clamp(cam.pitch + input.lookY * sens, -0.2, 1.25);
  cam.dist = clamp(cam.dist + input.zoom * 1.2, 5, 18);

  const p = G.player.pos;
  tmp.set(p.x, p.y + 1.6, p.z);
  cam.target.lerp(tmp, dt > 0 ? 1 - Math.exp(-dt * 12) : 1);

  let dist = cam.dist + (G.bossFight ? 5 : 0);
  const cp = Math.cos(cam.pitch);
  // 家の中にカメラが入らないよう、途中で当たったら手前に寄せる
  for (let d = 1.5; d <= dist; d += 0.5) {
    const hx = cam.target.x + Math.sin(cam.yaw) * cp * d, hz = cam.target.z + Math.cos(cam.yaw) * cp * d;
    const hy = cam.target.y + Math.sin(cam.pitch) * d;
    if (houses.some((h) => Math.hypot(hx - h.x, hz - h.z) < 4.2 && hy < h.y + 6.5)) { dist = Math.max(1.5, d - 0.8); break; }
  }
  const x = cam.target.x + Math.sin(cam.yaw) * cp * dist;
  const z = cam.target.z + Math.cos(cam.yaw) * cp * dist;
  let y = cam.target.y + Math.sin(cam.pitch) * dist;
  const gh = heightAt(x, z) + 0.6;
  if (y < gh) y = gh;
  G.camera.position.set(x, y, z);
  G.camera.lookAt(cam.target);

  if (G.shake > 0) {
    const s = G.shake * 0.35;
    G.camera.position.x += (Math.random() - 0.5) * s;
    G.camera.position.y += (Math.random() - 0.5) * s;
    G.shake = Math.max(0, G.shake - dt * 2.5);
  }
}

// タイトル画面用のゆっくり回るカメラ
export function orbitCamera(t) {
  const r = 55, x = Math.sin(t * 0.05) * r, z = Math.cos(t * 0.05) * r;
  G.camera.position.set(x, heightAt(x, z) + 22, z);
  G.camera.lookAt(0, 6, -20);
}
