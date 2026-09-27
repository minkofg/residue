'use strict';
// 程序合成音效与环境音

// ---------------------------------------------------------------- 音频
const AU = { c: null, m: null, nb: null, amb: false, out: null, panScale: 1 }; // panScale：立体声强度（设置里可改为 0 = 单声道）
// 当前音效的输出节点：普通音效直接进总音量；sfxAt 播放期间临时指向“定位”节点
function auOut() { return AU.out || AU.sfxBus || AU.m; }
function auInit() {
  if (AU.c) { if (AU.c.state === 'suspended') AU.c.resume(); return; }
  try {
    AU.c = new (window.AudioContext || window.webkitAudioContext)();
    AU.m = AU.c.createGain(); AU.m.gain.value = 0.55; AU.m.connect(AU.c.destination);
    // 分组音量：音效和环境音各一路，再进总音量（设置界面调节）
    AU.sfxBus = AU.c.createGain(); AU.sfxBus.connect(AU.m);
    AU.ambBus = AU.c.createGain(); AU.ambBus.connect(AU.m);
    const len = AU.c.sampleRate * 2; AU.nb = AU.c.createBuffer(1, len, AU.c.sampleRate);
    const d = AU.nb.getChannelData(0); for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  } catch (e) { AU.c = null; }
  if (AU.c && typeof applySettings === 'function') applySettings();
}
function noise(dur, type, freq, vol, delay = 0, q = 1, f2) {
  if (!AU.c) return; const c = AU.c, t = c.currentTime + delay;
  const s = c.createBufferSource(); s.buffer = AU.nb; s.loop = true;
  const f = c.createBiquadFilter(); f.type = type; f.frequency.setValueAtTime(freq, t); f.Q.value = q; if (f2) f.frequency.exponentialRampToValueAtTime(f2, t + dur);
  const g = c.createGain(); g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  s.connect(f); f.connect(g); g.connect(auOut()); s.start(t, rand(1)); s.stop(t + dur + 0.05);
}
function tone(freq, dur, type, vol, f2, delay = 0) {
  if (!AU.c) return; const c = AU.c, t = c.currentTime + delay;
  const o = c.createOscillator(); o.type = type; o.frequency.setValueAtTime(freq, t); if (f2) o.frequency.exponentialRampToValueAtTime(f2, t + dur);
  const g = c.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(vol, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g); g.connect(auOut()); o.start(t); o.stop(t + dur + 0.05);
}
// kind：丧尸的叫法（idle 游荡 / attack 发现你、扑咬、抓住 / hurt 中弹），只对丧尸（low = false）有效
function groan(vol, low, kind = 'idle') {
  if (!AU.c || vol < 0.02) return;
  if (!low) return zombieVoice(vol, kind);
  const c = AU.c, t = c.currentTime, dur = rand(0.9, 1.6);
  const o = c.createOscillator(); o.type = 'sawtooth'; const base = low ? 45 : rand(65, 95);
  o.frequency.setValueAtTime(base, t); o.frequency.linearRampToValueAtTime(base * rand(0.7, 1.2), t + dur);
  const l = c.createOscillator(); l.frequency.value = rand(5, 9); const lg = c.createGain(); lg.gain.value = base * 0.08; l.connect(lg); lg.connect(o.frequency);
  const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = low ? 300 : 500; f.Q.value = 4;
  const g = c.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(vol * 0.35, t + 0.25); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(f); f.connect(g); g.connect(auOut()); o.start(t); l.start(t); o.stop(t + dur + .1); l.stop(t + dur + .1);
}
// 丧尸的嗓音：合成在 audio/zombie.js（第五版，按真人发声的方式合成）。
// 每种叫法第一次用到时生成几条变体缓存起来（idle 6 条、attack 4 条、hurt 4 条），播放时随机挑一条、轻微变调。
const ZOMBIE_VARIANTS = { idle: 6, attack: 4, hurt: 4 };
function zombieBuffers(kind) {
  AU.zb = AU.zb || {};
  if (!AU.zb[kind]) {
    const c = AU.c, sr = c.sampleRate;
    AU.zb[kind] = [];
    for (let v = 0; v < (ZOMBIE_VARIANTS[kind] || 4); v++) {
      const d = synthZombie(kind, sr), b = c.createBuffer(1, d.length, sr);
      b.getChannelData(0).set(d); AU.zb[kind].push(b);
    }
  }
  return AU.zb[kind];
}
function zombieVoice(vol, kind = 'idle') {
  const c = AU.c, t = c.currentTime, bufs = zombieBuffers(ZOMBIE_VARIANTS[kind] ? kind : 'idle');
  const s = c.createBufferSource(); s.buffer = bufs[Math.floor(Math.random() * bufs.length)]; s.playbackRate.value = rand(0.9, 1.08);
  const g = c.createGain(); g.gain.value = vol * (kind === 'idle' ? 0.45 : 0.55);
  s.connect(g); g.connect(auOut()); s.start(t);
  voiceStarted(s, g, s.buffer.duration / s.playbackRate.value);   // 登记给怪物叫声管理（audio/creatures.js）
}
// ---------------------------------------------------------------- 立体声定位（以玩家为听者）
// gain：距离衰减（maxDist 以外为 0，但不低于 min）；pan：-1 左 … 1 右；
// muffled：中间隔着墙或关着的门 → 声音变闷（低通）并减小
const PAN_DIST = T * 7;        // 横向相差这么远就完全偏到一边
const MUFFLE_GAIN = 0.55, MUFFLE_FREQ = 700;
function spatial(x, y, maxDist = 900, min = 0) {
  const p = S.p, dx = x - p.x, dy = y - p.y, d = Math.hypot(dx, dy);
  const gain = Math.max(min, clamp(1 - d / maxDist, 0, 1));
  const pan = clamp(dx / PAN_DIST, -1, 1) * 0.9;
  const muffled = d > T && !losClear(p.x, p.y, x, y);
  return { gain: muffled ? gain * MUFFLE_GAIN : gain, pan, muffled, d };
}
function withSpatial(x, y, maxDist, min, play, bus, air) {
  const sp = spatial(x, y, maxDist, min);
  if (!AU.c || sp.gain < 0.02) return sp;
  const c = AU.c, g = c.createGain(); g.gain.value = sp.gain;
  let tail = g;
  if (sp.muffled) { const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = MUFFLE_FREQ; g.connect(f); tail = f; }
  else if (air && air < 12000) { const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = air; f.Q.value = 0.6; g.connect(f); tail = f; }   // 空气吸收（怪物叫声用）
  if (c.createStereoPanner) { const pn = c.createStereoPanner(); pn.pan.value = sp.pan * AU.panScale; tail.connect(pn); tail = pn; }
  tail.connect(bus || AU.sfxBus || AU.m);
  const prev = AU.out; AU.out = g;
  try { play(); } finally { AU.out = prev; }
  return sp;
}
// 在世界坐标 (x, y) 播放音效
function sfxAt(n, x, y, v = 1, maxDist = 900, min = 0) { return withSpatial(x, y, maxDist, min, () => sfx(n, v)); }
function groanAt(x, y, v = 1, low = false, maxDist = 650, min = 0, kind = 'idle') {
  if (low) return withSpatial(x, y, maxDist, min, () => groan(v, low, kind));
  return voicedAt('zombie.' + kind, ZOMBIE_PRI[kind] ?? 0, x, y, maxDist, min, () => groan(v, low, kind));   // 丧尸叫声也走怪物叫声管理（audio/creatures.js）
}

function startAmbient() {
  if (!AU.c || AU.amb) return; AU.amb = true; const c = AU.c;
  const g = c.createGain(); g.gain.value = 0.035; g.connect(AU.ambBus || AU.m);
  [55, 55.6, 82.4].forEach(fq => { const o = c.createOscillator(); o.type = 'sine'; o.frequency.value = fq; o.connect(g); o.start(); });
  const s = c.createBufferSource(); s.buffer = AU.nb; s.loop = true; const f = c.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 400; f.Q.value = 0.7;
  const ng = c.createGain(); ng.gain.value = 0.025; s.connect(f); f.connect(ng); ng.connect(AU.ambBus || AU.m); s.start();
  const l = c.createOscillator(); l.frequency.value = 0.07; const lg = c.createGain(); lg.gain.value = 250; l.connect(lg); lg.connect(f.frequency); l.start();
}
function sfx(n, v = 1) {
  if (!AU.c) return;
  if (HDR_SFX[n] !== undefined) hdrPush(HDR_SFX[n] + 20 * Math.log10(Math.max(v, 0.01)));   // 枪声、爆炸推高 HDR 窗口：怪物的嘟囔暂时让位（audio/creatures.js）
  switch (n) {
    case 'pistol': noise(0.25, 'lowpass', 3000, 0.9 * v, 0, 1, 400); tone(140, 0.12, 'square', 0.25 * v, 40); break;
    case 'shotgun': noise(0.55, 'lowpass', 2000, 1.2 * v, 0, 1, 200); tone(90, 0.25, 'square', 0.35 * v, 30); noise(0.15, 'bandpass', 1500, 0.3, 0.45); tone(300, 0.05, 'square', 0.1, 0, 0.5); break;
    case 'empty': tone(1800, 0.03, 'square', 0.12); break;
    case 'reload': tone(500, 0.05, 'square', 0.12); tone(900, 0.05, 'square', 0.12, 0, 0.35); noise(0.08, 'highpass', 3000, 0.2, 0.6); break;
    case 'bash': noise(0.3, 'lowpass', 220, 0.9 * v, 0, 1, 90); tone(55, 0.25, 'sine', 0.5 * v, 35); noise(0.08, 'bandpass', 900, 0.25 * v, 0.02, 3); break;
    case 'hit': noise(0.14, 'bandpass', 500, 0.5 * v, 0, 2); break;
    case 'head': noise(0.25, 'bandpass', 350, 0.8, 0, 1.5); tone(120, 0.1, 'sine', 0.3, 50); break;
    case 'hurt': tone(220, 0.35, 'sawtooth', 0.22, 90); noise(0.2, 'bandpass', 800, 0.4); break;
    case 'bite': noise(0.12, 'bandpass', 1200, 0.5, 0, 3); noise(0.15, 'lowpass', 400, 0.4, 0.05); break;
    case 'dog': tone(260, 0.12, 'square', 0.12 * v, 150); tone(240, 0.12, 'square', 0.12 * v, 140, 0.18); break;
    case 'roar': tone(70, 1.6, 'sawtooth', 0.4, 35); tone(52, 1.6, 'sawtooth', 0.3, 30); noise(1.4, 'lowpass', 500, 0.5, 0, 1, 100); break;
    case 'pickup': tone(880, 0.1, 'sine', 0.18); tone(1320, 0.18, 'sine', 0.15, 0, 0.08); break;
    case 'key': tone(660, 0.15, 'triangle', 0.2); tone(990, 0.15, 'triangle', 0.2, 0, 0.12); tone(1320, 0.3, 'triangle', 0.18, 0, 0.24); break;
    case 'door': noise(0.7, 'bandpass', 300, 0.25, 0, 8, 900); tone(90, 0.3, 'sine', 0.2, 50, 0.5); break;
    // ── 环境层的单次声（config/ambience.js 按房间随机穿插）──────────
    case 'drip':     tone(1500, 0.05, 'sine', 0.10 * v, 700); noise(0.14, 'bandpass', 2200, 0.07 * v, 0.01, 6); break;
    case 'clock':    tone(1100, 0.035, 'square', 0.055 * v, 800); noise(0.05, 'highpass', 4000, 0.04 * v, 0, 2); break;
    case 'creak':    noise(rand(0.5, 1.1), 'bandpass', rand(220, 420), 0.10 * v, 0, 7, rand(140, 300)); break;
    case 'wind':     noise(rand(1.8, 3.4), 'bandpass', rand(600, 1100), 0.16 * v, 0, 0.6, rand(300, 700)); break;
    case 'rainpane': noise(rand(1.2, 2.2), 'highpass', 3200, 0.07 * v, 0, 0.5); break;
    case 'paper':    noise(rand(0.3, 0.6), 'highpass', 2600, 0.06 * v, 0, 1.2); break;
    case 'glass':    for (let i = 0; i < 7; i++) { noise(rand(0.05, 0.25), 'highpass', rand(3000, 6000), 0.18 * v, i * 0.03 + rand(0.04), 2); tone(rand(2500, 5000), 0.15, 'sine', 0.03 * v, undefined, rand(0, 0.2)); } noise(0.3, 'lowpass', 400, 0.2 * v, 0, 1); break;
    case 'metal':    tone(rand(380, 700), rand(0.4, 0.9), 'triangle', 0.045 * v, rand(180, 320)); noise(0.2, 'bandpass', 1800, 0.05 * v, 0, 5); break;
    case 'sizzle':   noise(rand(0.15, 0.4), 'bandpass', rand(2600, 4200), 0.07 * v, 0, 3); break;
    case 'locked': noise(0.08, 'bandpass', 800, 0.3, 0, 4); noise(0.08, 'bandpass', 700, 0.3, 0.12, 4); break;
    case 'save': for (let i = 0; i < 9; i++) noise(0.04, 'highpass', 2500, 0.3, i * 0.09 + rand(0.03)); tone(1500, 0.3, 'sine', 0.1, 0, 0.9); break;
    case 'heart': tone(62, 0.13, 'sine', 0.5); tone(55, 0.15, 'sine', 0.4, 0, 0.18); break;
    case 'knife': noise(0.1, 'highpass', 2500, 0.35, 0, 1, 6000); break;
    case 'heal': noise(0.4, 'highpass', 4000, 0.2); tone(520, 0.2, 'sine', 0.12, 780); break;
    case 'die': tone(160, 1.8, 'sawtooth', 0.25, 30); noise(1.5, 'lowpass', 300, 0.4); break;
    case 'explode': noise(1.8, 'lowpass', 600, 1.4 * v, 0, 1, 60); tone(48, 1.4, 'sawtooth', 0.5 * v, 25); noise(0.4, 'bandpass', 1800, 0.5 * v); break;
    case 'heli': noise(3, 'lowpass', 180, 0.6); for (let i = 0; i < 20; i++) noise(0.08, 'lowpass', 250, 0.5, i * 0.13); break;
    // 麦林：尖锐的爆裂 + 胸口发闷的低频冲击 + 在走廊里来回撞的回声，比霰弹枪还响
    // 处刑者的脚步：极低的「咚」+ 地板被压的闷响 + 一点点碎响，像一百多公斤砸在地上
    case 'exstep':
      tone(46, 0.5, 'sine', 1.3 * v, 26);                    // 次低频：胸口能感觉到的「咚」
      tone(90, 0.18, 'triangle', 0.5 * v, 40);               // 落地的冲击
      noise(0.32, 'lowpass', 260, 1.1 * v, 0, 1.4, 60);       // 地板被压下去的闷响
      noise(0.5, 'lowpass', 120, 0.5 * v, 0.06, 0.8, 50);     // 余震
      noise(0.07, 'bandpass', 1100, 0.18 * v, 0.01, 1.5);     // 碎屑
      break;
    case 'suppressed': noise(0.07, 'bandpass', 1800, 0.35 * v, 0, 1.5, 700); tone(220, 0.04, 'square', 0.06 * v, 90); break;   // 装了消音器：闷闷的「噗」
    case 'magnum':
      noise(0.08, 'highpass', 2500, 1.1 * v);                 // 爆裂的「啪」
      noise(0.7, 'lowpass', 2600, 1.5 * v, 0, 1, 120);         // 主体轰鸣
      tone(70, 0.45, 'sine', 0.8 * v, 28);                     // 低频冲击
      tone(120, 0.18, 'square', 0.35 * v, 35);
      noise(0.9, 'bandpass', 700, 0.35 * v, 0.16, 0.7, 250);   // 回声 1
      noise(0.9, 'bandpass', 500, 0.18 * v, 0.38, 0.7, 180);   // 回声 2
      tone(2600, 0.6, 'sine', 0.035 * v, 2400, 0.05);          // 耳鸣
      break;
    // 积水里走：先是脚踩进水的闷「噗」，再是水被推开的哗啦声
    case 'wade':
      noise(0.09, 'lowpass', 500, 0.22 * v, 0, 1, 180);
      noise(0.28, 'bandpass', rand(700, 1000), 0.12 * v, 0.04, 1.4, 1800);
      noise(0.18, 'bandpass', rand(1800, 2400), 0.05 * v, 0.1, 2, 1200);
      break;
    case 'step': noise(0.05, 'lowpass', 300, 0.08 * v); break;
    // 处刑者抓取前摇：金属摩擦般的上扬尖啸（0.8 秒内能听出来，给玩家躲的时间）
    case 'grabWarn': tone(170, 0.75, 'sawtooth', 0.16 * v, 520); noise(0.7, 'bandpass', 1800, 0.18 * v, 0, 6, 3200); break;
  }
}

// ---------------------------------------------------------------- 房间环境层
// 一条常驻的带通噪声「底噪」，换房间时把滤波频率和音量平滑推到新值。
// 不为每个房间各开一路再交叉淡入 —— 那样节点会越堆越多，而且换房间快时会叠出杂音。
const AMB = { bed: null, filt: null, gain: null, lfo: null, lfoGain: null, room: null, t: 0, nextShot: 0, shots: [] };

function ambStart() {
  if (!AU.c || AMB.bed) return;
  const c = AU.c;
  const s = c.createBufferSource(); s.buffer = AU.nb; s.loop = true;
  const f = c.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 400; f.Q.value = 0.7;
  const g = c.createGain(); g.gain.value = 0;
  // 缓慢起伏的滤波频率：没有它，底噪听起来就是一段死循环
  const l = c.createOscillator(); l.frequency.value = 0.05; const lg = c.createGain(); lg.gain.value = 80;
  l.connect(lg); lg.connect(f.frequency); l.start();
  s.connect(f); f.connect(g); g.connect(AU.ambBus || AU.m); s.start();
  AMB.bed = s; AMB.filt = f; AMB.gain = g; AMB.lfo = l; AMB.lfoGain = lg;
}
// roomId 为 null 表示不在任何房间里
function ambSetRoom(roomId) {
  if (AMB.room === roomId) return;
  AMB.room = roomId;
  const cfg = (roomId && AMBIENCE[roomId]) || AMBIENCE_DEFAULT;
  AMB.shots = cfg.oneshots || [];
  AMB.nextShot = cfg.oneshots && cfg.oneshots.length ? rand(0.5, 2) : 1e9;
  if (!AU.c) return;
  ambStart();
  const t = AU.c.currentTime, b = cfg.bed;
  AMB.filt.frequency.cancelScheduledValues(t);
  AMB.filt.frequency.setValueAtTime(Math.max(20, AMB.filt.frequency.value), t);
  AMB.filt.frequency.linearRampToValueAtTime(b.freq, t + AMB_FADE);
  AMB.filt.Q.linearRampToValueAtTime(b.q, t + AMB_FADE);
  AMB.gain.gain.cancelScheduledValues(t);
  AMB.gain.gain.setValueAtTime(AMB.gain.gain.value, t);
  AMB.gain.gain.linearRampToValueAtTime(b.gain, t + AMB_FADE);
  AMB.lfoGain.gain.linearRampToValueAtTime(b.sway, t + AMB_FADE);
}
// 每帧：房间变了就换底噪，并按各自的区间随机丢出单次声
function updateAmbience(dt) {
  const r = curRoom();
  ambSetRoom(r >= 0 ? ROOMS[r].id : null);
  if (!AMB.shots.length) return;
  AMB.nextShot -= dt;
  if (AMB.nextShot > 0) return;
  const sh = AMB.shots[Math.floor(rand(AMB.shots.length))];
  sfx(sh.s, sh.v ?? 0.4);
  // 间隔永远取区间里的随机值：等距的滴水声三次之后就会被大脑当成机器噪音忽略掉
  AMB.nextShot = rand(sh.every[0], sh.every[1]);
}
