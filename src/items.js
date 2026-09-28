// アイテム・装備の定義と使用/購入
import { G } from './state.js';
import { sfx } from './audio.js';
import { burst, dmgNumber } from './combat.js';
import { recalc } from './player.js';
import * as UI from './ui.js';

export const ITEMS = {
  potion: { name: 'ポーション', desc: 'HPを60回復する', price: 20 },
  ether: { name: 'エーテル', desc: 'MPを30回復する', price: 40 },
};
export const WEAPONS = {
  wood: { name: '木の剣', atk: 0, price: 0, color: 0x9c6b3c, desc: '練習用の木剣' },
  iron: { name: '鉄の剣', atk: 8, price: 150, color: 0xdfe6ee, desc: '攻撃力 +8' },
  flame: { name: '炎の剣', atk: 18, price: 500, color: 0xff7a2a, emissive: 0xff3300, desc: '攻撃力 +18' },
};
export const ARMORS = {
  cloth: { name: '布の服', def: 0, price: 0, color: 0x2f6fdb, desc: 'ふつうの服' },
  leather: { name: '革の鎧', def: 5, price: 120, color: 0x8b5a2b, desc: '防御力 +5' },
  steel: { name: '鋼の鎧', def: 12, price: 400, color: 0x9aa4b0, desc: '防御力 +12' },
};

export function useItem(id) {
  const P = G.player;
  if (P.dead) return false;
  if (!P.inv[id]) { UI.msg(`${ITEMS[id].name}を持っていない`); sfx.error(); return false; }
  if (id === 'potion') {
    if (P.hp >= P.maxHp) { UI.msg('HPは満タンだ'); return false; }
    const v = Math.min(60, P.maxHp - P.hp);
    P.hp += v;
    dmgNumber(P.pos.x, P.pos.y + 2, P.pos.z, `+${Math.round(v)}`, 'heal');
    burst(P.pos.x, P.pos.y + 1, P.pos.z, 0x6dff8a, 16, 3, 0.15, 0.8, 2);
  } else if (id === 'ether') {
    if (P.mp >= P.maxMp) { UI.msg('MPは満タンだ'); return false; }
    P.mp = Math.min(P.maxMp, P.mp + 30);
    burst(P.pos.x, P.pos.y + 1, P.pos.z, 0x6fa2ff, 16, 3, 0.15, 0.8, 2);
  }
  P.inv[id]--;
  sfx.heal();
  return true;
}

export function buy(kind, id) {
  const P = G.player;
  const def = kind === 'item' ? ITEMS[id] : kind === 'weapon' ? WEAPONS[id] : ARMORS[id];
  if (P.gold < def.price) { UI.msg('お金が足りない'); sfx.error(); return false; }
  P.gold -= def.price;
  if (kind === 'item') P.inv[id] = (P.inv[id] || 0) + 1;
  else { P.owned[id] = true; equip(kind, id); }
  sfx.coin();
  UI.msg(`${def.name}を買った`);
  return true;
}

export function equip(kind, id) {
  const P = G.player;
  if (!P.owned[id]) return;
  if (kind === 'weapon') P.weapon = id; else P.armor = id;
  recalc(P);
  sfx.select();
}
