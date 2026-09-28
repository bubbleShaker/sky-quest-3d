// localStorage へのセーブ/ロード
import { G } from './state.js';
import { heightAt } from './world.js';
import { recalc } from './player.js';

const KEY = 'sky-quest-3d-save-v1';

export function hasSave() {
  try { return !!localStorage.getItem(KEY); } catch (e) { return false; }
}

export function save() {
  const P = G.player;
  if (!P || P.dead) return false;
  try {
    localStorage.setItem(KEY, JSON.stringify({
      level: P.level, exp: P.exp, hp: Math.round(P.hp), mp: Math.round(P.mp), gold: P.gold,
      inv: P.inv, weapon: P.weapon, armor: P.armor, owned: P.owned,
      quest: G.quest, cleared: G.cleared, playTime: G.playTime,
      pos: [P.pos.x, P.pos.z],
    }));
    return true;
  } catch (e) { return false; }
}

export function load() {
  let d;
  try { d = JSON.parse(localStorage.getItem(KEY)); } catch (e) { return false; }
  if (!d) return false;
  const P = G.player;
  P.level = d.level; P.exp = d.exp; P.gold = d.gold;
  P.inv = { potion: 0, ether: 0, ...d.inv };
  P.weapon = d.weapon; P.armor = d.armor; P.owned = d.owned;
  recalc(P);
  P.hp = Math.max(1, d.hp); P.mp = d.mp;
  G.quest = { stage: 0, kills: 0, hasTreasure: false, ...d.quest };
  G.cleared = !!d.cleared;
  G.playTime = d.playTime || 0;
  if (d.pos) P.pos.set(d.pos[0], heightAt(d.pos[0], d.pos[1]), d.pos[1]);
  return true;
}
