// エントリポイント: 初期化・ゲームループ・画面遷移
import * as THREE from 'three';
import { G } from './state.js';
import { initWorld, updateWorld, heightAt } from './world.js';
import { createPlayer, updatePlayer, revive } from './player.js';
import { initEnemies, updateEnemies, resetBoss } from './enemies.js';
import { initFx, updateFx, updateProjectiles, clearProjectiles } from './combat.js';
import { initNPCs, updateNPCs, syncQuestWorld } from './npc.js';
import { initInput, updateInputAxes, consume, endFrame } from './input.js';
import { updateCamera, snapCamera, orbitCamera, cam } from './camera.js';
import { initAudio, playBGM, toggleMute } from './audio.js';
import { hasSave, load, save } from './save.js';
import * as UI from './ui.js';

const canvas = document.getElementById('game');
const coarse = matchMedia('(pointer: coarse)').matches;
G.touch = false;

const renderer = new THREE.WebGLRenderer({ canvas, antialias: !coarse });
renderer.setPixelRatio(Math.min(devicePixelRatio, coarse ? 1.5 : 2));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
G.renderer = renderer;

const scene = new THREE.Scene();
G.scene = scene;
const camera = new THREE.PerspectiveCamera(60, innerWidth / innerHeight, 0.1, 1200);
G.camera = camera;

addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});

// ---- 初期化 ----
initWorld(scene);
initFx(scene);
G.player = createPlayer();
initNPCs();
initEnemies();
initInput(canvas);
UI.initUI();

document.getElementById('loading').style.display = 'none';
const btnCont = document.getElementById('btnCont');
btnCont.disabled = !hasSave();

function startGame(cont) {
  initAudio();
  if (cont && !load()) cont = false;
  syncQuestWorld();
  const P = G.player;
  P.obj.position.copy(P.pos);
  cam.yaw = P.yaw + Math.PI;
  snapCamera();
  document.getElementById('title').classList.add('hidden');
  G.state = 'play';
  UI.showHUD(true);
  playBGM(nearVillage() ? 'village' : 'field');
  if (cont) UI.msg('冒険の記録を読み込んだ');
  else UI.msg('村長に話しかけてみよう（黄色い★が目的地）');
}

document.getElementById('btnNew').addEventListener('click', () => startGame(false));
btnCont.addEventListener('click', () => startGame(true));
document.getElementById('btnRevive').addEventListener('click', () => {
  document.getElementById('gameover').classList.add('hidden');
  revive();
  clearProjectiles();
  resetBoss();
  snapCamera();
  G.state = 'play';
  playBGM('village');
  UI.msg('村の泉のそばで目を覚ました…');
});
document.getElementById('btnFree').addEventListener('click', () => {
  document.getElementById('ending').classList.add('hidden');
  G.state = 'play';
});

const nearVillage = () => Math.hypot(G.player.pos.x, G.player.pos.z) < 45;

// ---- 調べられるもの ----
function nearestInteractable() {
  const P = G.player;
  let best = null, bd = 1e9;
  for (const it of G.interactables) {
    const d = Math.hypot(P.pos.x - it.x, P.pos.z - it.z);
    if (d < it.r && d < bd) { best = it; bd = d; }
  }
  return best;
}

// ---- ループ ----
const clock = new THREE.Clock();
let saveTimer = 0, bgmTimer = 0;

function tick() {
  requestAnimationFrame(tick);
  let dt = Math.min(clock.getDelta(), 0.05);
  G.time += dt;
  updateInputAxes();
  if (consume('mute')) UI.msg(toggleMute() ? '音をOFFにした' : '音をONにした');

  if (G.state === 'title') {
    orbitCamera(G.time);
  } else {
    if (G.state === 'play') G.playTime += dt;
    if (G.hitstop > 0) { G.hitstop -= dt; dt *= 0.1; }

    if (G.modal) {
      if (UI.dialogOpen()) {
        if (consume('interact') || consume('attack') || consume('jump')) UI.advanceDialog();
      } else if (UI.panelOpen()) {
        if (consume('menu') || consume('escape')) UI.closePanel();
      }
    } else if (G.state === 'play' || G.state === 'dead') {
      if (G.state === 'play' && consume('menu')) UI.openMenu();
      const it = G.state === 'play' && !G.player.dead ? nearestInteractable() : null;
      UI.setPrompt(it ? it.label : null);
      if (it && consume('interact')) it.action();
      if (!G.modal) {
        updatePlayer(dt);
        updateEnemies(dt);
        updateProjectiles(dt);
      }
    }
    updateNPCs(dt);
    if (!G.modal || G.state !== 'play') updateCamera(dt);

    // 自動セーブ & BGM 切替
    saveTimer += dt;
    if (saveTimer > 30 && G.state === 'play') { saveTimer = 0; save(); }
    bgmTimer -= dt;
    if (bgmTimer <= 0 && G.state === 'play' && !G.player.dead) {
      bgmTimer = 1;
      if (!G.bossFight) playBGM(nearVillage() ? 'village' : 'field');
    }
  }
  updateWorld(dt, G.time);
  updateFx(dt);
  UI.updateUI(dt);
  endFrame();
  renderer.render(scene, camera);
}
tick();

// デバッグ用 (コンソールから確認できるように)
window.__G = G;
window.__heightAt = heightAt;
