// WebAudio で効果音と BGM をその場で合成する
let ctx = null, master = null, sfxGain = null, bgmGain = null;
let muted = false;
try { muted = localStorage.getItem('sq3d-mute') === '1'; } catch (e) { /* ignore */ }

export function initAudio() {
  if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return; }
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return;
  ctx = new AC();
  master = ctx.createGain(); master.gain.value = muted ? 0 : 0.5; master.connect(ctx.destination);
  sfxGain = ctx.createGain(); sfxGain.gain.value = 0.8; sfxGain.connect(master);
  bgmGain = ctx.createGain(); bgmGain.gain.value = 0.2; bgmGain.connect(master);
}

export function toggleMute() {
  muted = !muted;
  if (master) master.gain.value = muted ? 0 : 0.5;
  try { localStorage.setItem('sq3d-mute', muted ? '1' : '0'); } catch (e) { /* ignore */ }
  return muted;
}
export const isMuted = () => muted;

function tone(f, dur, { type = 'square', vol = 0.15, to = null, delay = 0, attack = 0.005, dest = null } = {}) {
  if (!ctx) return;
  const t = ctx.currentTime + delay;
  const o = ctx.createOscillator(), g = ctx.createGain();
  o.type = type;
  o.frequency.setValueAtTime(f, t);
  if (to) o.frequency.exponentialRampToValueAtTime(to, t + dur);
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(vol, t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g); g.connect(dest || sfxGain);
  o.start(t); o.stop(t + dur + 0.02);
}

let noiseBuf = null;
function noise(dur, { vol = 0.2, freq = 1500, q = 1, type = 'bandpass', delay = 0, to = null } = {}) {
  if (!ctx) return;
  if (!noiseBuf) {
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  const t = ctx.currentTime + delay;
  const s = ctx.createBufferSource(); s.buffer = noiseBuf;
  const f = ctx.createBiquadFilter(); f.type = type; f.Q.value = q;
  f.frequency.setValueAtTime(freq, t);
  if (to) f.frequency.exponentialRampToValueAtTime(to, t + dur);
  const g = ctx.createGain();
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  s.connect(f); f.connect(g); g.connect(sfxGain);
  s.start(t); s.stop(t + dur + 0.02);
}

export const sfx = {
  swing() { noise(0.15, { vol: 0.25, freq: 3000, to: 800, q: 2 }); },
  hit() { tone(180, 0.12, { vol: 0.16, to: 60 }); noise(0.08, { vol: 0.3, freq: 1200 }); },
  hurt() { tone(300, 0.25, { type: 'sawtooth', vol: 0.15, to: 80 }); },
  kill() { tone(520, 0.1, { vol: 0.1 }); tone(780, 0.15, { vol: 0.1, delay: 0.08 }); },
  coin() { tone(988, 0.08, { vol: 0.08 }); tone(1319, 0.2, { vol: 0.08, delay: 0.07 }); },
  levelup() { [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.28, { type: 'triangle', vol: 0.2, delay: i * 0.1 })); },
  fire() { noise(0.4, { vol: 0.25, freq: 600, to: 200, type: 'lowpass' }); tone(220, 0.3, { type: 'sawtooth', vol: 0.06, to: 90 }); },
  boom() { noise(0.5, { vol: 0.35, freq: 500, to: 60, type: 'lowpass' }); },
  spin() { noise(0.45, { vol: 0.25, freq: 1500, to: 4000, q: 3 }); },
  dodge() { noise(0.18, { vol: 0.15, freq: 800, to: 2000 }); },
  jump() { tone(300, 0.15, { type: 'triangle', vol: 0.1, to: 600 }); },
  heal() { [660, 880, 1100].forEach((f, i) => tone(f, 0.2, { type: 'sine', vol: 0.15, delay: i * 0.06 })); },
  talk() { tone(720, 0.035, { vol: 0.04 }); },
  select() { tone(880, 0.06, { vol: 0.07 }); },
  error() { tone(160, 0.15, { vol: 0.1 }); },
  roar() { noise(1.3, { vol: 0.5, freq: 320, to: 90, type: 'lowpass' }); tone(110, 1.1, { type: 'sawtooth', vol: 0.18, to: 50 }); },
  chest() { [392, 523, 659, 784, 1047].forEach((f, i) => tone(f, 0.3, { type: 'triangle', vol: 0.15, delay: i * 0.08 })); },
  fanfare() { [523, 523, 523, 698, 880, 784, 698, 1047].forEach((f, i) => tone(f, i === 7 ? 0.9 : 0.22, { type: 'triangle', vol: 0.2, delay: [0, .15, .3, .45, .75, 1.05, 1.2, 1.4][i] })); },
};

// ---- BGM: コード進行のアルペジオ + ベース + メロディの簡易シーケンサ ----
const TRACKS = {
  field: {
    bpm: 96, lead: 'triangle',
    chords: [[57, 60, 64], [53, 57, 60], [55, 59, 62], [52, 55, 59]],
    mel: [76, 0, 79, 0, 81, 0, 79, 76, 77, 0, 76, 0, 72, 0, 74, 76, 74, 0, 79, 0, 83, 0, 81, 79, 79, 0, 76, 0, 71, 0, 0, 0],
  },
  boss: {
    bpm: 150, lead: 'sawtooth',
    chords: [[45, 48, 52], [46, 50, 53], [45, 48, 52], [44, 47, 51]],
    mel: [69, 0, 69, 72, 0, 71, 69, 0, 70, 0, 70, 74, 0, 72, 70, 0, 69, 0, 69, 72, 0, 76, 75, 0, 68, 0, 71, 0, 75, 0, 76, 0],
  },
  village: {
    bpm: 84, lead: 'sine',
    chords: [[60, 64, 67], [57, 60, 64], [53, 57, 60], [55, 59, 62]],
    mel: [72, 0, 76, 0, 79, 0, 76, 0, 76, 0, 72, 0, 69, 0, 0, 0, 72, 0, 69, 0, 65, 0, 69, 72, 74, 0, 71, 0, 67, 0, 0, 0],
  },
};
const midi = (n) => 440 * Math.pow(2, (n - 69) / 12);
let bgm = null;

export function playBGM(name) {
  if (!ctx || (bgm && bgm.name === name)) return;
  stopBGM();
  const tr = TRACKS[name];
  const step = 60 / tr.bpm / 2;
  const state = { name, step: 0, next: ctx.currentTime + 0.1 };
  state.timer = setInterval(() => {
    while (state.next < ctx.currentTime + 0.3) {
      const s = state.step, ch = tr.chords[Math.floor(s / 8) % tr.chords.length], i = s % 8;
      const d = state.next - ctx.currentTime;
      if (i % 4 === 0) tone(midi(ch[0] - 12), step * 3.6, { type: 'triangle', vol: 0.4, delay: d, dest: bgmGain });
      tone(midi(ch[[0, 1, 2, 1][i % 4]] + 12), step * 0.9, { type: tr.lead, vol: tr.lead === 'sawtooth' ? 0.05 : 0.1, delay: d, dest: bgmGain });
      const m = tr.mel[s % tr.mel.length];
      if (m) tone(midi(m), step * 1.8, { type: 'square', vol: 0.06, delay: d, dest: bgmGain });
      state.next += step; state.step++;
    }
  }, 100);
  bgm = state;
}

export function stopBGM() {
  if (bgm) { clearInterval(bgm.timer); bgm = null; }
}
