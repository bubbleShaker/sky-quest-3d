// ゲーム全体で共有する状態と小さなユーティリティ
export const G = {
  scene: null,
  camera: null,
  renderer: null,
  player: null,
  enemies: [],
  interactables: [],
  quest: { stage: 0, kills: 0, hasTreasure: false },
  state: 'title', // title | play | dead | ending
  modal: false,
  time: 0,
  playTime: 0,
  boss: null,
  bossFight: false,
  hitstop: 0,
  shake: 0,
  touch: false,
  cleared: false,
};

export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const lerp = (a, b, t) => a + (b - a) * t;
export const rand = (a, b) => a + Math.random() * (b - a);
export const randInt = (a, b) => Math.floor(rand(a, b + 1));

// 角度 a から b へ最短方向に t だけ補間
export function angleLerp(a, b, t) {
  const TAU = Math.PI * 2;
  const d = ((((b - a + Math.PI) % TAU) + TAU) % TAU) - Math.PI;
  return a + d * t;
}
