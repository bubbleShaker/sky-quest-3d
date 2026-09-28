// キーボード / マウス(ポインタロック) / タッチ入力をまとめて扱う
import { G } from './state.js';

export const input = {
  keys: new Set(),
  actions: new Set(), // このフレームに押されたアクション
  moveX: 0, moveY: 0,
  lookX: 0, lookY: 0,
  zoom: 0,
  locked: false,
};

const KEYMAP = {
  Space: 'jump', KeyJ: 'attack', KeyK: 'dodge', ShiftLeft: 'dodge', ShiftRight: 'dodge',
  KeyQ: 'skill1', KeyE: 'skill2', KeyF: 'interact', Enter: 'interact',
  Digit1: 'potion', Digit2: 'ether', KeyI: 'menu', Tab: 'menu', Escape: 'escape', KeyM: 'mute',
};

const stick = { id: null, ox: 0, oy: 0, x: 0, y: 0 };
const look = { id: null, x: 0, y: 0 };
let noLock = false;
let stickBase, stickKnob;

export function enableTouchUI() {
  if (G.touch) return;
  G.touch = true;
  document.body.classList.add('touch');
  if (G.state === 'play') document.getElementById('touch').classList.remove('hidden');
}

export function initInput(canvas) {
  stickBase = document.getElementById('stickBase');
  stickKnob = document.getElementById('stickKnob');

  addEventListener('keydown', (e) => {
    if (['Space', 'Tab', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
    input.keys.add(e.code);
    const a = KEYMAP[e.code];
    if (a && !e.repeat) input.actions.add(a);
  });
  addEventListener('keyup', (e) => input.keys.delete(e.code));
  addEventListener('blur', () => input.keys.clear());
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());

  canvas.addEventListener('pointerdown', (e) => {
    if (G.state !== 'play' || G.modal) return;
    if (e.pointerType === 'mouse') {
      if (!noLock && document.pointerLockElement !== canvas) {
        try {
          const r = canvas.requestPointerLock();
          if (r && r.catch) r.catch(() => { noLock = true; });
        } catch (err) { noLock = true; }
        return;
      }
      if (e.button === 0) input.actions.add('attack');
      else if (e.button === 2) input.actions.add('dodge');
      return;
    }
    // タッチ/ペン: 左側=移動スティック, 右側=視点
    e.preventDefault();
    enableTouchUI();
    if (e.clientX < innerWidth * 0.45 && stick.id === null) {
      stick.id = e.pointerId; stick.ox = e.clientX; stick.oy = e.clientY; stick.x = stick.y = 0;
      stickBase.style.display = 'block';
      stickBase.style.left = e.clientX + 'px'; stickBase.style.top = e.clientY + 'px';
      stickKnob.style.transform = '';
    } else if (look.id === null) {
      look.id = e.pointerId; look.x = e.clientX; look.y = e.clientY;
    }
    try { canvas.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
  });

  canvas.addEventListener('pointermove', (e) => {
    if (e.pointerId === stick.id) {
      let dx = e.clientX - stick.ox, dy = e.clientY - stick.oy;
      const l = Math.hypot(dx, dy), R = 50;
      if (l > R) { dx *= R / l; dy *= R / l; }
      stick.x = dx / R; stick.y = dy / R;
      stickKnob.style.transform = `translate(${dx}px, ${dy}px)`;
    } else if (e.pointerId === look.id) {
      input.lookX += (e.clientX - look.x) * 1.8;
      input.lookY += (e.clientY - look.y) * 1.8;
      look.x = e.clientX; look.y = e.clientY;
    } else if (e.pointerType === 'mouse' && noLock && (e.buttons & 2)) {
      input.lookX += e.movementX; input.lookY += e.movementY;
    }
  });
  const end = (e) => {
    if (e.pointerId === stick.id) {
      stick.id = null; stick.x = stick.y = 0; stickBase.style.display = 'none';
    }
    if (e.pointerId === look.id) look.id = null;
  };
  canvas.addEventListener('pointerup', end);
  canvas.addEventListener('pointercancel', end);

  document.addEventListener('pointerlockchange', () => { input.locked = document.pointerLockElement === canvas; });
  document.addEventListener('pointerlockerror', () => { noLock = true; });
  addEventListener('mousemove', (e) => {
    if (input.locked) { input.lookX += e.movementX; input.lookY += e.movementY; }
  });
  canvas.addEventListener('wheel', (e) => { input.zoom += Math.sign(e.deltaY); e.preventDefault(); }, { passive: false });

  // タッチボタン
  document.querySelectorAll('#tbtns .tb').forEach((b) => {
    b.addEventListener('pointerdown', (e) => {
      e.preventDefault(); e.stopPropagation();
      input.actions.add(b.dataset.act);
      b.classList.add('on');
    });
    const off = () => b.classList.remove('on');
    b.addEventListener('pointerup', off); b.addEventListener('pointercancel', off); b.addEventListener('pointerleave', off);
  });

  if (matchMedia('(pointer: coarse)').matches) enableTouchUI();
  addEventListener('touchstart', () => enableTouchUI(), { once: true, passive: true });
}

export function releasePointer() {
  if (document.pointerLockElement) document.exitPointerLock?.();
}

export function updateInputAxes() {
  let x = 0, y = 0;
  const k = input.keys;
  if (k.has('KeyW') || k.has('ArrowUp')) y += 1;
  if (k.has('KeyS') || k.has('ArrowDown')) y -= 1;
  if (k.has('KeyA') || k.has('ArrowLeft')) x -= 1;
  if (k.has('KeyD') || k.has('ArrowRight')) x += 1;
  if (stick.id !== null && Math.hypot(stick.x, stick.y) > 0.15) { x += stick.x; y -= stick.y; }
  const l = Math.hypot(x, y);
  if (l > 1) { x /= l; y /= l; }
  input.moveX = x; input.moveY = y;
}

export function consume(a) {
  if (input.actions.has(a)) { input.actions.delete(a); return true; }
  return false;
}

export function endFrame() {
  input.actions.clear();
  input.lookX = input.lookY = 0;
  input.zoom = 0;
}
