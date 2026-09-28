// HUD・メッセージ・会話・メニュー/ショップ・ミニマップ・各種画面
import { G } from './state.js';
import { expToNext, SKILLS } from './player.js';
import { ITEMS, WEAPONS, ARMORS, useItem, buy, equip } from './items.js';
import { questInfo } from './npc.js';
import { makeMapImage, areaName } from './world.js';
import { sfx, toggleMute, isMuted } from './audio.js';
import { save } from './save.js';
import { releasePointer } from './input.js';

const $ = (id) => document.getElementById(id);
let el = {};
let mapImg = null, mapTimer = 0;
let dlg = null;
let bannerTimer = null;
let lastArea = '', areaTimer = 0;

export function initUI() {
  for (const id of ['hud', 'lv', 'gold', 'hpFill', 'hpText', 'mpFill', 'mpText', 'expFill', 'questText', 'questDist', 'minimap', 'boss', 'bossName', 'bossFill', 'banner', 'messages', 'prompt', 'dialog', 'dlgName', 'dlgText', 'panel', 'touch', 'tInteract', 'cnt-potion', 'cnt-ether', 'hint'])
    el[id] = $(id);
  el.cdQ = document.querySelector('#sk-q .cd');
  el.cdE = document.querySelector('#sk-e .cd');
  el.skQ = $('sk-q'); el.skE = $('sk-e');
  el.dialog.addEventListener('click', () => advanceDialog());
  $('menuBtn').addEventListener('click', () => { if (!G.modal) openMenu(); });
  el.panel.addEventListener('click', onPanelClick);
  mapImg = makeMapImage(200);
}

// ---- HUD ----
export function updateHUD() {
  const P = G.player;
  el.lv.textContent = `Lv ${P.level}`;
  el.gold.textContent = `${P.gold} G`;
  el.hpFill.style.width = `${P.hp / P.maxHp * 100}%`;
  el.hpText.textContent = `HP ${Math.ceil(P.hp)} / ${P.maxHp}`;
  el.mpFill.style.width = `${P.mp / P.maxMp * 100}%`;
  el.mpText.textContent = `MP ${Math.floor(P.mp)} / ${P.maxMp}`;
  el.expFill.style.width = `${P.exp / expToNext(P.level) * 100}%`;
  el['cnt-potion'].textContent = P.inv.potion;
  el['cnt-ether'].textContent = P.inv.ether;
  el.cdQ.style.height = `${P.cdSpin / SKILLS.spin.cd * 100}%`;
  el.cdE.style.height = `${P.cdFire / SKILLS.fire.cd * 100}%`;
  el.skQ.classList.toggle('nomp', P.mp < SKILLS.spin.mp);
  el.skE.classList.toggle('nomp', P.mp < SKILLS.fire.mp);
  const q = questInfo();
  el.questText.textContent = q.text;
  el.questDist.textContent = q.target ? `目的地まで ${Math.round(Math.hypot(q.target.x - P.pos.x, q.target.z - P.pos.z))}m` : '';
  el.hint.style.display = (!G.touch && G.playTime < 40) ? '' : 'none';
}

export function updateUI(dt) {
  if (G.state === 'play' || G.state === 'ending') updateHUD();
  mapTimer -= dt;
  if (mapTimer <= 0 && G.state !== 'title') { mapTimer = 0.1; drawMinimap(); }
  // 会話の文字送り
  if (dlg && dlg.shown < dlg.full.length) {
    const before = Math.floor(dlg.shown);
    dlg.shown = Math.min(dlg.full.length, dlg.shown + dt * 45);
    if (Math.floor(dlg.shown) !== before && before % 3 === 0) sfx.talk();
    el.dlgText.textContent = dlg.full.slice(0, Math.floor(dlg.shown));
  }
  // エリア名
  if (G.state === 'play') {
    areaTimer -= dt;
    if (areaTimer <= 0) {
      areaTimer = 0.5;
      const a = areaName(G.player.pos.x, G.player.pos.z);
      if (a !== lastArea) { if (lastArea) banner(a, 'area'); lastArea = a; }
    }
  }
}

export function drawMinimap() {
  const c = el.minimap, ctx = c.getContext('2d'), W = c.width;
  const P = G.player;
  const scale = W / 400 * 2.2; // ズーム
  const toMap = (x, z) => [W / 2 + (x - P.pos.x) * scale, W / 2 + (z - P.pos.z) * scale];
  ctx.save();
  ctx.clearRect(0, 0, W, W);
  ctx.beginPath(); ctx.arc(W / 2, W / 2, W / 2, 0, Math.PI * 2); ctx.clip();
  ctx.fillStyle = '#1a2a40'; ctx.fillRect(0, 0, W, W);
  const [ox, oy] = toMap(-200, -200);
  ctx.imageSmoothingEnabled = true;
  ctx.drawImage(mapImg, ox, oy, 400 * scale, 400 * scale);
  // 敵
  for (const e of G.enemies) {
    if (e.dead) continue;
    const [x, y] = toMap(e.pos.x, e.pos.z);
    ctx.fillStyle = e.type === 'dragon' ? '#ff3010' : '#ff5050';
    ctx.beginPath(); ctx.arc(x, y, e.type === 'dragon' ? 6 : 2.5, 0, Math.PI * 2); ctx.fill();
  }
  // NPC / 調べられるもの
  ctx.fillStyle = '#ffe060';
  for (const it of G.interactables) {
    const [x, y] = toMap(it.x, it.z);
    ctx.fillRect(x - 2, y - 2, 4, 4);
  }
  // 目的地
  const q = questInfo();
  if (q.target) {
    let [x, y] = toMap(q.target.x, q.target.z);
    const dx = x - W / 2, dy = y - W / 2, d = Math.hypot(dx, dy), lim = W / 2 - 9;
    if (d > lim) { x = W / 2 + dx / d * lim; y = W / 2 + dy / d * lim; }
    const pulse = 5 + Math.sin(G.time * 6) * 1.5;
    ctx.fillStyle = '#ffd35a'; ctx.strokeStyle = '#000'; ctx.lineWidth = 1.5;
    star(ctx, x, y, pulse);
  }
  // プレイヤー(カメラ方向に合わせて回転する矢印)
  ctx.translate(W / 2, W / 2);
  ctx.rotate(-G.player.yaw + Math.PI);
  ctx.fillStyle = '#fff'; ctx.strokeStyle = '#1b2440'; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(0, -8); ctx.lineTo(6, 6); ctx.lineTo(0, 3); ctx.lineTo(-6, 6); ctx.closePath();
  ctx.stroke(); ctx.fill();
  ctx.restore();
  ctx.fillStyle = 'rgba(255,255,255,.8)'; ctx.font = '12px sans-serif'; ctx.textAlign = 'center';
  ctx.fillText('N', W / 2, 13);
}

function star(ctx, x, y, r) {
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = i / 10 * Math.PI * 2 - Math.PI / 2, rr = i % 2 ? r * 0.45 : r;
    ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
  }
  ctx.closePath(); ctx.stroke(); ctx.fill();
}

// ---- メッセージ ----
export function msg(text) {
  const d = document.createElement('div');
  d.textContent = text;
  el.messages.appendChild(d);
  while (el.messages.children.length > 5) el.messages.firstChild.remove();
  setTimeout(() => { d.style.opacity = 0; }, 3500);
  setTimeout(() => d.remove(), 4200);
}

export function banner(text, cls = '') {
  el.banner.textContent = text;
  el.banner.className = `show ${cls}`;
  clearTimeout(bannerTimer);
  bannerTimer = setTimeout(() => { el.banner.className = cls; }, cls === 'area' ? 2000 : 1600);
}

export function setPrompt(label) {
  if (label) {
    el.prompt.textContent = `F : ${label}`;
    el.prompt.classList.remove('hidden');
    el.tInteract.textContent = label;
    el.tInteract.classList.remove('hidden');
  } else {
    el.prompt.classList.add('hidden');
    el.tInteract.classList.add('hidden');
  }
}

export function bossBar(e) {
  if (!e) { el.boss.classList.add('hidden'); return; }
  el.boss.classList.remove('hidden');
  el.bossName.textContent = e.T.name;
  el.bossFill.style.width = `${Math.max(0, e.hp / e.maxHp * 100)}%`;
}

// ---- 会話 ----
export function showDialog(name, lines, onEnd) {
  G.modal = true;
  releasePointer();
  dlg = { name, lines, i: 0, onEnd, full: lines[0], shown: 0 };
  el.dlgName.textContent = name;
  el.dlgName.style.display = name ? '' : 'none';
  el.dlgText.textContent = '';
  el.dialog.classList.remove('hidden');
  setPrompt(null);
}

export const dialogOpen = () => !!dlg;

export function advanceDialog() {
  if (!dlg) return;
  if (dlg.shown < dlg.full.length) { dlg.shown = dlg.full.length; el.dlgText.textContent = dlg.full; return; }
  dlg.i++;
  if (dlg.i >= dlg.lines.length) {
    const cb = dlg.onEnd;
    dlg = null;
    el.dialog.classList.add('hidden');
    G.modal = false;
    if (cb) cb();
    return;
  }
  dlg.full = dlg.lines[dlg.i]; dlg.shown = 0;
  sfx.select();
}

// ---- パネル (メニュー / ショップ) ----
let panelKind = null;
export const panelOpen = () => !!panelKind;

export function openMenu() {
  panelKind = 'menu';
  G.modal = true;
  releasePointer();
  renderPanel();
  el.panel.classList.remove('hidden');
  sfx.select();
}

export function openShop() {
  panelKind = 'shop';
  G.modal = true;
  releasePointer();
  renderPanel();
  el.panel.classList.remove('hidden');
}

export function closePanel() {
  panelKind = null;
  el.panel.classList.add('hidden');
  G.modal = false;
}

function renderPanel() {
  const P = G.player;
  let h = '';
  if (panelKind === 'menu') {
    h += `<h2>ステータス</h2><table>
      <tr><td>レベル</td><td>${P.level}</td><td>次のレベルまで</td><td>${expToNext(P.level) - P.exp} EXP</td></tr>
      <tr><td>HP</td><td>${Math.ceil(P.hp)} / ${P.maxHp}</td><td>MP</td><td>${Math.floor(P.mp)} / ${P.maxMp}</td></tr>
      <tr><td>攻撃力</td><td>${P.atk}</td><td>防御力</td><td>${P.def}</td></tr>
      <tr><td>所持金</td><td>${P.gold} G</td><td>プレイ時間</td><td>${fmtTime(G.playTime)}</td></tr></table>`;
    h += '<h3>アイテム</h3><div class="list">';
    for (const id in ITEMS) {
      h += `<div class="item"><span class="nm">${ITEMS[id].name} ×${P.inv[id] || 0}<span class="ds">${ITEMS[id].desc}</span></span><button class="pbtn" data-use="${id}" ${P.inv[id] ? '' : 'disabled'}>使う</button></div>`;
    }
    h += '</div><h3>装備</h3><div class="list">';
    for (const [kind, tbl] of [['weapon', WEAPONS], ['armor', ARMORS]]) {
      for (const id in tbl) {
        if (!P.owned[id]) continue;
        const on = (kind === 'weapon' ? P.weapon : P.armor) === id;
        h += `<div class="item"><span class="nm">${tbl[id].name}<span class="ds">${tbl[id].desc}</span></span>${on ? '<span>装備中</span>' : `<button class="pbtn" data-equip="${kind}:${id}">装備</button>`}</div>`;
      }
    }
    h += '</div><h3>操作</h3><div style="font-size:13px;line-height:1.7;color:#ccd">WASD 移動 ／ マウス 視点（クリックでロック、Escで解除）／ 左クリック・J 攻撃 ／ 右クリック・Shift 回避 ／ Space ジャンプ ／ Q 回転斬り ／ E 火球 ／ F 話す ／ 1 ポーション ／ 2 エーテル ／ ホイール ズーム</div>';
    h += `<div class="prow"><button class="pbtn" data-act="mute">音：${isMuted() ? 'OFF' : 'ON'}</button><button class="pbtn gold" data-act="save">セーブ</button><button class="pbtn" data-act="close">閉じる</button></div>`;
  } else if (panelKind === 'shop') {
    h += `<h2>商人の店</h2><div>所持金：<span style="color:var(--accent)">${P.gold} G</span></div>`;
    h += '<h3>道具</h3><div class="list">';
    for (const id in ITEMS) {
      h += `<div class="item"><span class="nm">${ITEMS[id].name}（所持 ${P.inv[id] || 0}）<span class="ds">${ITEMS[id].desc}</span></span><span class="pr">${ITEMS[id].price} G</span><button class="pbtn" data-buy="item:${id}" ${P.gold < ITEMS[id].price ? 'disabled' : ''}>買う</button></div>`;
    }
    for (const [kind, tbl, title] of [['weapon', WEAPONS, '武器'], ['armor', ARMORS, '防具']]) {
      h += `</div><h3>${title}</h3><div class="list">`;
      for (const id in tbl) {
        if (!tbl[id].price) continue;
        const owned = P.owned[id];
        h += `<div class="item"><span class="nm">${tbl[id].name}<span class="ds">${tbl[id].desc}</span></span><span class="pr">${tbl[id].price} G</span>${owned ? '<span>購入済</span>' : `<button class="pbtn" data-buy="${kind}:${id}" ${P.gold < tbl[id].price ? 'disabled' : ''}>買う</button>`}</div>`;
      }
    }
    h += '</div><div class="prow"><button class="pbtn" data-act="close">店を出る</button></div>';
  }
  el.panel.innerHTML = h;
}

function onPanelClick(ev) {
  const b = ev.target.closest('button');
  if (!b) return;
  const d = b.dataset;
  if (d.use) useItem(d.use);
  else if (d.equip) { const [k, id] = d.equip.split(':'); equip(k, id); }
  else if (d.buy) { const [k, id] = d.buy.split(':'); buy(k, id); }
  else if (d.act === 'mute') toggleMute();
  else if (d.act === 'save') msg(save() ? 'セーブしました' : 'セーブできませんでした');
  else if (d.act === 'close') { closePanel(); return; }
  renderPanel();
}

function fmtTime(s) {
  const m = Math.floor(s / 60);
  return `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
}

// ---- 画面 ----
export function showHUD(on) {
  el.hud.classList.toggle('hidden', !on);
  el.touch.classList.toggle('hidden', !(on && G.touch));
}

export function showGameOver() {
  G.state = 'dead';
  releasePointer();
  setPrompt(null);
  $('gameover').classList.remove('hidden');
}

export function showEnding() {
  G.state = 'ending';
  releasePointer();
  const P = G.player;
  $('endStats').innerHTML = `レベル ${P.level}<br>プレイ時間 ${fmtTime(G.playTime)}<br>所持金 ${P.gold} G`;
  $('ending').classList.remove('hidden');
}
