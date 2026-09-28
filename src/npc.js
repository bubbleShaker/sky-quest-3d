// 村人 NPC・会話・メインクエストの進行
import * as THREE from 'three';
import { G } from './state.js';
import { heightAt, PLACES, chestSpot, setBarrier, addCollider } from './world.js';
import { sfx, playBGM } from './audio.js';
import { burst } from './combat.js';
import { gainExp, gainGold } from './player.js';
import { spawnEnemy, spawnDragon } from './enemies.js';
import { save } from './save.js';
import * as UI from './ui.js';

const ELDER = { x: 5, z: -5 };
const std = (c, o = {}) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.7, ...o });
const npcs = [];
let chest;

function buildNPC({ x, z, robe, hat, beard, hair }) {
  const g = new THREE.Group();
  const add = (geo, mat, px, py, pz) => { const m = new THREE.Mesh(geo, mat); m.position.set(px, py, pz); m.castShadow = true; g.add(m); return m; };
  const body = new THREE.Group(); g.add(body);
  const addB = (geo, mat, px, py, pz) => { const m = new THREE.Mesh(geo, mat); m.position.set(px, py, pz); m.castShadow = true; body.add(m); return m; };
  addB(new THREE.CylinderGeometry(0.3, 0.55, 1.4, 10), std(robe), 0, 0.7, 0);
  addB(new THREE.SphereGeometry(0.3, 14, 10), std(0xffd6b0), 0, 1.65, 0);
  addB(new THREE.SphereGeometry(0.045, 6, 5), std(0x111111), 0.1, 1.68, 0.27);
  addB(new THREE.SphereGeometry(0.045, 6, 5), std(0x111111), -0.1, 1.68, 0.27);
  if (hair) addB(new THREE.SphereGeometry(0.32, 14, 10, 0, Math.PI * 2, 0, Math.PI * 0.55), std(hair), 0, 1.7, -0.02);
  if (beard) addB(new THREE.ConeGeometry(0.22, 0.5, 8), std(0xf0f0f0), 0, 1.35, 0.2).rotation.x = Math.PI;
  if (hat === 'wizard') addB(new THREE.ConeGeometry(0.36, 0.8, 10), std(robe), 0, 2.15, 0);
  if (hat === 'helm') addB(new THREE.SphereGeometry(0.34, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.5), std(0xaab0b8, { metalness: 0.7, roughness: 0.3 }), 0, 1.72, 0);
  if (hat === 'cap') addB(new THREE.CylinderGeometry(0.34, 0.34, 0.18, 12), std(0x2e8b57), 0, 1.9, 0);
  if (hat === 'helm') { const sp = add(new THREE.CylinderGeometry(0.04, 0.04, 2.6, 6), std(0x6b4a2b), 0.5, 1.3, 0.1); add(new THREE.ConeGeometry(0.1, 0.35, 6), std(0xcccccc, { metalness: 0.8 }), 0.5, 2.75, 0.1); sp.rotation.z = 0; }
  g.position.set(x, heightAt(x, z), z);
  G.scene.add(g);
  addCollider(x, z, 0.6);
  return { g, body };
}

function addNPC(def) {
  const n = { ...def, ...buildNPC(def), baseYaw: def.yaw || 0, look: 0 };
  n.g.rotation.y = n.baseYaw;
  npcs.push(n);
  G.interactables.push({ x: def.x, z: def.z, r: 3.2, label: `話す（${def.name}）`, action: () => { n.look = 4; def.talk(); }, npc: true });
}

const say = (name, lines, onEnd) => UI.showDialog(name, lines, onEnd);

export function initNPCs() {
  addNPC({ name: '村長', x: ELDER.x, z: ELDER.z, robe: 0x7a4fa0, hat: 'wizard', beard: true, yaw: -0.8, talk: talkElder });
  addNPC({ name: '商人', x: -8.2, z: 7.4, robe: 0x2e8b57, hat: 'cap', hair: 0x3a2a1a, yaw: Math.PI * 0.75, talk: () => say('商人', ['いらっしゃい！ 冒険の準備はうちで整えていきな。'], () => UI.openShop()) });
  addNPC({ name: '村娘ミラ', x: 9, z: 8, robe: 0xe06c9f, hair: 0xd08a30, yaw: -2.3, talk: talkGirl });
  addNPC({ name: '衛兵', x: 3.5, z: -26, robe: 0x5a6a8a, hat: 'helm', yaw: Math.PI, talk: talkGuard });
  G.interactables.push({ x: 0, z: 0, r: 4.3, label: '泉で休む', action: rest });

  // 宝箱
  const c = new THREE.Group();
  const wood = std(0x8a5a2b), gold = std(0xf0c040, { metalness: 0.8, roughness: 0.3 });
  const base = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.8, 0.9), wood); base.position.y = 0.4; base.castShadow = true;
  const lid = new THREE.Group(); lid.position.set(0, 0.8, -0.45);
  const lidM = new THREE.Mesh(new THREE.BoxGeometry(1.45, 0.35, 0.95), wood); lidM.position.set(0, 0.17, 0.45); lidM.castShadow = true;
  const band = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.38, 0.97), gold); band.position.set(0, 0.17, 0.45);
  lid.add(lidM, band);
  const lock = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.25, 0.08), gold); lock.position.set(0, 0.7, 0.47);
  c.add(base, lid, lock);
  c.position.set(chestSpot.x, heightAt(chestSpot.x, chestSpot.z), chestSpot.z);
  c.rotation.y = Math.atan2(-110, -70);
  G.scene.add(c);
  addCollider(chestSpot.x, chestSpot.z, 0.9);
  chest = { g: c, lid, open: false };
  G.interactables.push({ x: chestSpot.x, z: chestSpot.z, r: 2.8, label: '宝箱を調べる', action: openChest });
}

// セーブデータ読込後の見た目の同期
export function syncQuestWorld() {
  const q = G.quest;
  setBarrier(q.stage < 3);
  if (q.hasTreasure || q.stage > 2) { chest.open = true; chest.lid.rotation.x = -1.9; }
  if (q.stage === 3) spawnDragon();
}

function talkElder() {
  const q = G.quest, P = G.player;
  if (q.stage === 0) {
    say('村長', [
      'おお、旅の若者よ。よく来てくれた。',
      'この空の村は今、魔物どもに脅かされておる。北の火口に棲む炎竜ヴァルガスが目覚めてからというもの、魔物が増える一方なのじゃ。',
      'まずは腕試しじゃ。村の東の平原にいるスライムを 5匹 退治してきてくれんか？',
      '剣は「左クリック」か「J」で振れる。続けて押せば連続攻撃じゃ。「Shift」で素早く転がって攻撃をかわせるぞ。',
    ], () => { q.stage = 1; q.kills = 0; UI.msg('クエスト開始：スライム退治'); sfx.select(); save(); });
  } else if (q.stage === 1) {
    if (q.kills >= 5) {
      say('村長', [
        'なんと、もう片付けたのか！ 見事な腕前じゃ。',
        'これは礼じゃ。受け取ってくれ。（60G と ポーション×2 を受け取った）',
        '実はな…東の野営地に巣食うゴブリンどもが、村の宝「黄金の王冠」を盗んでいったのじゃ。',
        'あの王冠には炎竜の結界を解く力がある。どうか取り戻してきてくれ！ 野営地は東の道を進んだ先じゃ。',
      ], () => {
        gainGold(60); P.inv.potion += 2; gainExp(60);
        q.stage = 2; UI.msg('クエスト開始：黄金の王冠を取り戻せ'); sfx.coin(); save();
      });
    } else {
      say('村長', [`スライムはあと ${5 - q.kills}匹 じゃ。村の東の平原にたくさんおるぞ。`]);
    }
  } else if (q.stage === 2) {
    if (q.hasTreasure) {
      say('村長', [
        'おお…！ これぞまさしく黄金の王冠！ よくぞ取り戻してくれた！',
        '礼として 200G と エーテル×2 を授けよう。',
        '…王冠の力で、火口を覆う炎の結界を解いた。いよいよ炎竜ヴァルガスとの決戦じゃ。',
        '竜は噛みつき・踏みつけ・炎の息・火球を使う。予備動作をよく見て、回避で身をかわすのじゃ。',
        '準備ができたら、北の道を進んで火口へ向かえ。商人の店で装備を整えるのを忘れるでないぞ！',
      ], () => {
        gainGold(200); P.inv.ether += 2; gainExp(200);
        q.stage = 3; setBarrier(false); spawnDragon();
        UI.msg('炎の結界が消えた！ クエスト開始：炎竜を討て'); sfx.chest(); save();
      });
    } else {
      say('村長', ['ゴブリンの野営地は村から東へ道を進んだ先じゃ。王冠は宝箱にしまわれておるはず。気をつけるのじゃぞ。']);
    }
  } else if (q.stage === 3) {
    say('村長', ['炎竜は北の火口じゃ。レベル 6〜7 はあった方がよかろう。無理をするでないぞ。', '泉で休めば体力が戻り、冒険の記録も残せるぞ。']);
  } else {
    say('村長', ['そなたこそ真の英雄じゃ！ 村の皆が感謝しておるぞ。', 'これからも自由に冒険を楽しむがよい。']);
  }
}

const GIRL_LINES = [
  ['村の泉で休むと、HPとMPが全部回復するのよ。記録もしてくれるの！'],
  ['「Q」の回転斬りは周りの敵をまとめて攻撃できるわ。囲まれた時に便利よ。'],
  ['「E」の火球は遠くの敵を狙い撃ちできるの。MPの管理に気をつけてね。'],
  ['北の荒野には岩のゴーレムがいるの。硬いけど、倒すとたくさん経験値がもらえるみたい。'],
  ['商人さんの炎の剣、すっごく強いんだって！ 高いけど…。'],
];
let girlIdx = 0;
function talkGirl() {
  say('村娘ミラ', GIRL_LINES[girlIdx++ % GIRL_LINES.length]);
}

function talkGuard() {
  const q = G.quest;
  if (q.stage < 3) say('衛兵', ['この先は火口へ続く道だ。炎の結界があって誰も近づけん。', 'ゴーレムもうろついている。腕に自信がないなら引き返せ。']);
  else if (q.stage === 3) say('衛兵', ['結界が消えたか…！ 炎竜は手強いぞ。ポーションは多めに持っていけ。']);
  else say('衛兵', ['あの炎竜を倒すとはな！ 恐れ入った。']);
}

function rest() {
  const P = G.player;
  P.hp = P.maxHp; P.mp = P.maxMp;
  sfx.heal();
  burst(P.pos.x, P.pos.y + 1, P.pos.z, 0x9fe8ff, 30, 4, 0.2, 1.0, 1);
  const ok = save();
  UI.msg(ok ? '泉の水で体力が回復した。冒険を記録した。' : '泉の水で体力が回復した。');
}

function openChest() {
  const q = G.quest;
  if (chest.open) { say('', ['宝箱は空っぽだ。']); return; }
  if (q.stage < 2) { say('', ['頑丈な宝箱だ。ゴブリンたちの宝物だろうか…。今は開けられそうにない。']); return; }
  chest.open = true;
  q.hasTreasure = true;
  sfx.chest();
  burst(chestSpot.x, chest.g.position.y + 1, chestSpot.z, 0xffd35a, 40, 5, 0.2, 1.2, -2);
  gainGold(50);
  say('', ['宝箱を開けた！', '「黄金の王冠」と 50G を手に入れた！'], () => {
    UI.msg('ゴブリンたちが襲ってきた！');
    for (let i = 0; i < 3; i++) {
      const a = i * 2.1 + 0.5;
      spawnEnemy('goblin', chestSpot.x + Math.sin(a) * 8, chestSpot.z + Math.cos(a) * 8, null).state = 'chase';
    }
    save();
  });
}

export function onEnemyKilled(e) {
  const q = G.quest;
  if (q.stage === 1 && e.type === 'slime' && q.kills < 5) {
    q.kills++;
    UI.msg(q.kills >= 5 ? 'スライムを5匹倒した！ 村長に報告しよう' : `スライム討伐 ${q.kills}/5`);
  }
}

export function onDragonDefeated() {
  G.quest.stage = 4;
  G.cleared = true;
  UI.banner('VICTORY!');
  sfx.fanfare();
  setTimeout(() => { playBGM('village'); save(); UI.showEnding(); }, 3500);
}

export function questInfo() {
  const q = G.quest;
  switch (q.stage) {
    case 0: return { text: '村長と話そう', target: ELDER };
    case 1: return q.kills >= 5 ? { text: '村長に報告しよう', target: ELDER } : { text: `東の平原でスライムを倒す (${q.kills}/5)`, target: { x: 40, z: 20 } };
    case 2: return q.hasTreasure ? { text: '村長に王冠を届けよう', target: ELDER } : { text: 'ゴブリンの野営地で宝を取り戻す', target: chestSpot };
    case 3: return { text: '北の火口で炎竜ヴァルガスを倒す', target: PLACES.arena };
    default: return { text: 'クリア！ 自由に冒険しよう', target: null };
  }
}

export function updateNPCs(dt) {
  const P = G.player;
  for (const n of npcs) {
    n.body.position.y = Math.sin(G.time * 2 + n.x) * 0.02;
    const d = Math.hypot(P.pos.x - n.x, P.pos.z - n.z);
    const target = d < 6 ? Math.atan2(P.pos.x - n.x, P.pos.z - n.z) : n.baseYaw;
    const cur = n.g.rotation.y;
    let diff = ((target - cur + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
    n.g.rotation.y = cur + diff * (1 - Math.exp(-dt * 4));
  }
  if (chest.open && chest.lid.rotation.x > -1.9) chest.lid.rotation.x = Math.max(-1.9, chest.lid.rotation.x - dt * 4);
}
