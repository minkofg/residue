'use strict';
// 各种怪物的叫声（试玩反馈：「符合怪物身份的声音」）。
//
// 以前除了僵尸，别的怪几乎都在借用几个通用音效：
//   狗 = 两声方波「哔哔」；猎手蓄力 / 挥爪也是那两声「哔哔」；舔舐者、猎手、蔓生体、寄生体都是同一个高频「嘶」；
//   处刑者、暴走处刑者、拉撒路、猎手、舔舐者的吼叫全是同一个锯齿波「roar」；拉撒路召唤寄生体时发的是僵尸的呻吟；
//   淤泥体只有滴水声。
// 这里给每种怪一套自己的声音，按「它是什么东西」来设计（写在每一项的注释里）。
//
// 做法和丧尸嗓音一样：纯数学合成（synthVoice 在 audio/zombie.js），不依赖 AudioContext。
// 游戏里第一次用到时生成几条变体缓存起来；tools/creature-preview.js 用同一套函数导出 WAV 试听。
//
// 用法：cryAt('dog', 'bark', x, y, 音量, 最远距离, 最小音量)，和 sfxAt 一样按位置做立体声、隔墙发闷。

// ---------------------------------------------------------------- 基础积木
const _R = (rnd, a, b) => a + (b - a) * rnd();
const _pk = (rnd, x) => Array.isArray(x) ? _R(rnd, x[0], x[1]) : x;
// RBJ 双二阶滤波器：type = 'bp' | 'lp' | 'hp'。返回的函数带 .set(f)：扫频时只换系数、保留状态（不会咔哒）
function _biquad(type, f, q, sr) {
  let B0, B1, B2, A1, A2, x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  const set = fr => {
    const w = 2 * Math.PI * Math.min(fr, sr * 0.45) / sr, al = Math.sin(w) / (2 * q), cs = Math.cos(w);
    let b0, b1, b2; const a0 = 1 + al, a1 = -2 * cs, a2 = 1 - al;
    if (type === 'lp') { b0 = (1 - cs) / 2; b1 = 1 - cs; b2 = b0; }
    else if (type === 'hp') { b0 = (1 + cs) / 2; b1 = -(1 + cs); b2 = b0; }
    else { b0 = al; b1 = 0; b2 = -al; }
    B0 = b0 / a0; B1 = b1 / a0; B2 = b2 / a0; A1 = a1 / a0; A2 = a2 / a0;
  };
  set(f);
  const fn = x => { const y = B0 * x + B1 * x1 + B2 * x2 - A1 * y1 - A2 * y2; x2 = x1; x1 = x; y2 = y1; y1 = y; return y; };
  fn.set = set;
  return fn;
}
// 把若干段按偏移（秒）叠在一起
function _mix(sr, parts) {
  let n = 0; for (const [buf, at = 0, g = 1] of parts) n = Math.max(n, Math.floor(at * sr) + buf.length);
  const out = new Float32Array(n);
  for (const [buf, at = 0, g = 1] of parts) { const o = Math.floor(at * sr); for (let i = 0; i < buf.length; i++) out[o + i] += buf[i] * g; }
  return out;
}
// 喉咙里的颤音「呼噜」：20–35Hz 的振幅起伏（狗低吼、猎手的颤鸣）
function _rattle(buf, sr, rnd, f, depth) {
  let ph = 0, fr = _pk(rnd, f);
  for (let i = 0; i < buf.length; i++) { if (i % 512 === 0) fr = fr * 0.9 + _pk(rnd, f) * 0.1; ph += fr / sr; buf[i] *= 1 - depth * (0.5 + 0.5 * Math.sin(2 * Math.PI * ph)); }
  return buf;
}
// 滤波噪声段：f 可以是 [起, 止] 做扫频；env(u) 给包络
function _noise(sr, rnd, dur, type, f, q, env) {
  const n = Math.floor(sr * dur), out = new Float32Array(n), [f0, f1] = Array.isArray(f) ? f : [f, f];
  const flt = _biquad(type, f0, q, sr);
  for (let i = 0; i < n; i++) {
    const u = i / n;
    if (f0 !== f1 && i % 64 === 0) flt.set(f0 * Math.pow(f1 / f0, u));
    out[i] = flt(rnd() * 2 - 1) * env(u);
  }
  return _norm(out);
}
// 峰值归一化到 1：各段按「听感上的比例」叠加，不受滤波器增益影响
function _norm(buf) { let m = 0; for (let i = 0; i < buf.length; i++) m = Math.max(m, Math.abs(buf[i])); if (m > 0) for (let i = 0; i < buf.length; i++) buf[i] /= m; return buf; }
// 一串「咔哒」：舔舐者的舌头、寄生体的口器、猎手喉咙里的颤响
// rate：每秒几下（区间）；freq：咔哒的共振频率；q：越大越「湿」越「脆」
function _clicks(sr, rnd, dur, rate, freq, q, gainJit = 0.5) {
  const n = Math.floor(sr * dur), out = new Float32Array(n);
  let t = _R(rnd, 0, 0.02);
  while (t < dur) {
    const at = Math.floor(t * sr), len = Math.floor(sr * 0.03), f = _pk(rnd, freq), bp = _biquad('bp', f, q, sr), g = 1 - gainJit * rnd();
    for (let k = 0; k < len && at + k < n; k++) out[at + k] += bp(k < 3 ? (rnd() * 2 - 1) * 4 : 0) * g;
    t += 1 / _pk(rnd, rate);
  }
  return _norm(out);
}
// 气泡：频率略微上扬、很快衰减的正弦（Minnaert 共振）—— 淤泥体、膨胀者的肚子、触手钻出地面
function _bubbles(sr, rnd, dur, count, freq, tau = [0.015, 0.045]) {
  const n = Math.floor(sr * dur), out = new Float32Array(n);
  for (let b = 0; b < count; b++) {
    const at = Math.floor(_R(rnd, 0, dur * 0.85) * sr), f = _pk(rnd, freq), tt = _pk(rnd, tau), g = _R(rnd, 0.4, 1);
    let ph = 0;
    for (let k = 0; at + k < n; k++) {
      const s = k / sr; if (s > tt * 6) break;
      ph += f * (1 + 0.9 * s / (tt * 6)) / sr;
      out[at + k] += Math.sin(2 * Math.PI * ph) * Math.exp(-s / tt) * g;
    }
  }
  return out;
}
// 低频扫音（咕咚 / 地底的闷响）
function _sweep(sr, dur, f0, f1, env) {
  const n = Math.floor(sr * dur), out = new Float32Array(n); let ph = 0;
  for (let i = 0; i < n; i++) { const u = i / n; ph += (f0 * Math.pow(f1 / f0, u)) / sr; out[i] = Math.sin(2 * Math.PI * ph) * env(u); }
  return out;
}
const _envAD = (a, p = 1.5) => u => u < a ? u / a : Math.pow(Math.max(0, (1 - u) / (1 - a)), p);
// 好几个嗓子叠在一起（拉撒路是很多具身体融成的一团肉 —— 叫起来像一群人同时在吼）
function _chorus(sr, rnd, base, voices) {
  return _mix(sr, voices.map(([mul, fs, at, g]) => [synthVoice({ ...base, f0: base.f0.map(x => x * mul), peak: base.peak.map(x => x * mul), end: base.end.map(x => x * mul), fscale: (base.fscale || 1) * fs }, sr, rnd), at, g]));
}

// 狗的发声器（试玩反馈：用人声模型做的狗叫「像人叫出来的」）。
// 人声像人，关键在「元音」：口腔张着、共振峰慢慢滑、音高平稳。狗不一样 ——
//   · 吠叫是下颌猛地张开又合上的一下「呜—汪—夫」：共振峰在 0.1 秒里先冲上去再掉下来，没有能听出来的元音；
//   · 起音只有几毫秒，音高先蹿高再往下掉，嗓音里一大半是混沌的噪声（声带不规则振动 + 次谐波），听不出「调」；
//   · 低吼是嘴唇咧开、牙关半合：共振峰固定不动，声带一下一下不规则地拍（「咯咯咯」的颗粒感），跟着呼气一阵一阵；
//   · 尖叫 / 哀鸣是鼻腔里出来的：几乎只有基频和二次谐波，像哨音，不带元音。
// P：dur 秒 · f0(u) 音高曲线 · jaw(u) 下颌开合 0–1 · env(u) 包络 · jit 周期抖动 · sub 次谐波 · noise 噪声比例 · size 体型（共振峰缩放）
function _dogVoice(sr, rnd, P) {
  const n = Math.floor(sr * P.dur), out = new Float32Array(n), sz = P.size || 1;
  const F = [_biquad('bp', 500, 3.2, sr), _biquad('bp', 1300, 4, sr), _biquad('bp', 2700, 5, sr), _biquad('bp', 220 * sz, 2, sr)];
  const G = [1, 0.75, 0.35, 0.5];
  const lo = _biquad('lp', 4200 * sz, 0.7, sr), lo2 = _biquad('lp', 4200 * sz, 0.7, sr);   // 狗叫的能量基本在 4kHz 以下；高频的「嘶」会让它像人在喊「哈！」
  let ph = 0, per = 0, mul = 1, amp = 1, prev = 0, lp = 0;
  for (let i = 0; i < n; i++) {
    const u = i / n;
    if (i % 32 === 0) { const j = P.jaw(u); F[0].set((380 + 720 * j) * sz); F[1].set((1050 + 850 * j) * sz); F[2].set((2500 + 500 * j) * sz); }
    if (ph >= 1 || i === 0) {
      if (i) ph -= 1; per++;
      const odd = per % 2 === 1;
      mul = (1 + (rnd() * 2 - 1) * P.jit) * (odd ? 1 + P.sub * 0.25 : 1);
      amp = (0.5 + rnd() * 0.5) * (odd ? 1 - P.sub * 0.5 : 1);
    }
    const f0 = P.f0(u) / mul; ph += f0 / sr;
    const flow = ph < 0.35 ? 0.5 * (1 - Math.cos(Math.PI * ph / 0.35)) : ph < 0.5 ? Math.cos(Math.PI * (ph - 0.35) / 0.3) : 0;
    const d = (flow - prev) * sr / (f0 * 8); prev = flow;
    lp += ((rnd() * 2 - 1) - lp) * 0.7;
    const x = d * amp * (1 - P.noise * 0.6) + lp * (0.25 + 0.75 * flow) * P.noise * 3;
    let y = 0; for (let k = 0; k < 4; k++) y += F[k](x) * G[k];
    out[i] = lo2(lo(y)) * P.env(u);
  }
  return out;
}
// 鼻腔哨音：基频 + 一点二、三次谐波 + 少量气声（尖叫、哀鸣）
function _dogTone(sr, rnd, dur, f0, env, wob = 0) {
  const n = Math.floor(sr * dur), out = new Float32Array(n), hp = _biquad('hp', 2000, 0.7, sr);
  let ph = 0, w = 0;
  for (let i = 0; i < n; i++) {
    const u = i / n; if (i % 256 === 0) w += ((rnd() * 2 - 1) - w) * 0.3;
    ph += f0(u) * (1 + wob * w) / sr;
    const s = Math.sin(2 * Math.PI * ph) + 0.45 * Math.sin(4 * Math.PI * ph + 0.5) + 0.15 * Math.sin(6 * Math.PI * ph + 1);
    out[i] = (s + hp(rnd() * 2 - 1) * 0.25) * env(u);
  }
  return out;
}
const _bell = (u, a, b) => u < a ? Math.sin(Math.PI / 2 * u / a) : Math.max(0, Math.cos(Math.PI / 2 * (u - a) / (b - a)));   // 0→1→0，a 处最高，b 处回到 0

// ---------------------------------------------------------------- 叫声表
// make(sr, rnd) → Float32Array；n：缓存几条变体；gain：播放音量；rate：播放时的随机变速（顺带变调）
const CRIES = {
  // ── 狗（感染的杜宾犬）：真的狗叫是很短、很冲、带噪声的「汪」，共振峰比人高；低吼是持续的喉音加「呼噜」颤动
  dog: {
    bark: { n: 5, gain: 0.85, rate: [0.94, 1.06], make: (sr, r) => {   // 发现你：两三声连吠
      const one = i => {
        const f = _R(r, 420, 520) * (1 - i * 0.04), dur = _R(r, 0.11, 0.15), open = _R(r, 0.22, 0.32);
        const v = _dogVoice(sr, r, { dur, size: 0.95, jit: 0.22, sub: 0.55, noise: 0.7,
          f0: u => f * (u < 0.2 ? 0.7 + 0.3 * u / 0.2 : 1 - 0.4 * (u - 0.2) / 0.8),
          jaw: u => _bell(u, open, 1),
          env: u => Math.min(1, u / 0.03) * Math.exp(-3.2 * u) * Math.min(1, (1 - u) / 0.08) });
        const thump = _sweep(sr, 0.07, 160, 90, u => Math.exp(-6 * u));   // 胸腔一下闷响：大狗
        return _mix(sr, [[v, 0, 1], [thump, 0, 0.35]]);
      };
      const k = r() < 0.5 ? 2 : 3, parts = []; let t = 0;
      for (let i = 0; i < k; i++) { parts.push([one(i), t, 1 - i * 0.1]); t += _R(r, 0.22, 0.32); }
      return shapeOut(_mix(sr, parts), 2.6);
    } },
    growl: { n: 4, gain: 0.65, rate: [0.95, 1.05], make: (sr, r) => {   // 平时：牙关半合的低吼，跟着呼气一阵一阵
      const d = _R(r, 1.0, 1.5), f = _R(r, 95, 115), br = _R(r, 0.55, 0.7);
      const v = _dogVoice(sr, r, { dur: d, size: 0.9, jit: 0.3, sub: 0.8, noise: 0.55,
        f0: u => f * (1 + 0.12 * Math.sin(2 * Math.PI * u * 1.3)),
        jaw: u => 0.18 + 0.08 * Math.sin(2 * Math.PI * u * 2.1),
        env: u => u < br ? Math.min(1, u / 0.08) * Math.min(1, (br - u) / 0.06 + 0.25) : 0.3 * Math.sin(Math.PI * (u - br) / (1 - br)) });   // 呼气吼 → 吸气时轻一点
      return shapeOut(_rattle(v, sr, r, [22, 30], 0.6), 1.8);
    } },
    snarl: { n: 4, gain: 0.9, rate: [0.95, 1.05], make: (sr, r) => {   // 扑咬：「呜噜噜——嗷！」低吼突然张嘴
      const d = _R(r, 0.36, 0.46), f = _R(r, 150, 180), at = _R(r, 0.55, 0.65);
      const v = _dogVoice(sr, r, { dur: d, size: 0.95, jit: 0.25, sub: 0.7, noise: 0.65,
        f0: u => u < at ? f : f * (1 + 1.2 * _bell(u, at + 0.08, 1)),
        jaw: u => u < at ? 0.2 : 0.2 + 0.8 * _bell(u, at + 0.1, 1),
        env: u => Math.min(1, u / 0.1) * (u < at ? 0.55 : 1) * Math.min(1, (1 - u) / 0.12) });
      return shapeOut(_rattle(v, sr, r, [26, 34], 0.45), 2.2);
    } },
    yelp: { n: 3, gain: 0.6, rate: [0.95, 1.08], make: (sr, r) => {   // 中弹：「嗷！」一声尖的，音高猛地掉下去
      const f = _R(r, 1000, 1250), d = _R(r, 0.14, 0.22);
      return shapeOut(_dogTone(sr, r, d, u => f * (u < 0.12 ? 0.8 + 0.2 * u / 0.12 : 1 - 0.45 * (u - 0.12) / 0.88), u => Math.min(1, u / 0.04) * Math.pow(1 - u, 1.2), 0.02), 1.6);
    } },
    whine: { n: 2, gain: 0.55, rate: [0.95, 1.05], make: (sr, r) => {   // 倒下：鼻子里拖长的哀鸣，一抽一抽往下掉
      const f = _R(r, 900, 1050), d = _R(r, 0.7, 0.9);
      return shapeOut(_dogTone(sr, r, d, u => f * (1 - 0.35 * u) * (1 + 0.04 * Math.sin(2 * Math.PI * 7 * u * d)), u => Math.min(1, u / 0.05) * Math.pow(1 - u, 0.8) * (0.65 + 0.35 * Math.cos(2 * Math.PI * 5 * u * d)), 0.04), 1.4);
    } },
  },
  // ── 猎手（爬行类的生物兵器）：冷血动物的声音 —— 喉咙里「咯咯」的颤响、蛇一样的嘶气、又尖又破的爬虫尖叫（带颤音）
  hunter: {
    chitter: { n: 4, gain: 0.55, rate: [0.95, 1.05], make: (sr, r) => {   // 平时：喉咙里一串干涩的咯咯声 + 很低的蛙鸣式嘎声
      const croak = synthVoice({ dur: [0.45, 0.7], f0: [22, 28], peak: [30, 38], end: [20, 26], path: [[380, 900, 2300, 3200], [420, 1000, 2400, 3300]], fscale: 1.1, breath: 0.2, drive: 2, sub: 0.2, jitter: 0.2, bw: 1.2 }, sr, r);
      const ck = _clicks(sr, r, _R(r, 0.3, 0.5), [14, 22], [1300, 2000], 6, 0.6);
      return shapeOut(_mix(sr, [[croak, 0, 1], [ck, _R(r, 0.05, 0.2), 0.35]]), 1.4);
    } },
    hiss: { n: 3, gain: 0.8, rate: [0.97, 1.03], make: (sr, r) => {   // 飞扑前摇：嘶气越来越响（0.4 秒左右），听到就该闪了
      const d = _R(r, 0.38, 0.48);
      const h = _noise(sr, r, d, 'bp', [2400, 4200], 1.2, u => Math.pow(u, 1.6) * (u > 0.94 ? (1 - u) / 0.06 : 1));
      const low = synthVoice({ dur: d, f0: [120, 140], peak: [180, 220], end: [200, 240], peakAt: [0.8, 0.9], path: [[500, 1400, 2600, 3500]], fscale: 1.2, breath: 0.95, drive: 2, sub: 0.4, att: 0.7 }, sr, r);
      return shapeOut(_mix(sr, [[h, 0, 1], [low, 0, 0.5]]), 1.5);
    } },
    shriek: { n: 4, gain: 0.9, rate: [0.96, 1.04], make: (sr, r) => shapeOut(_mix(sr, [   // 发现你 / 处决前摇：又尖又破、带爬虫颤音的尖叫
      [synthVoice({ dur: [0.8, 1.1], f0: [300, 360], peak: [520, 640], end: [260, 320], path: ['er', 'ae', 'a', 'er'], fscale: 1.25, breath: 0.8, drive: 3.4, sub: 0.6, jitter: 0.12, vib: { rate: [18, 26], depth: 0.07 }, att: 0.05, bw: 1.3 }, sr, r), 0, 1],
      [_noise(sr, r, 0.9, 'bp', [3500, 2500], 1.5, _envAD(0.1)), 0, 0.25],
    ]), 1.3) },
    snarl: { n: 4, gain: 0.8, rate: [0.95, 1.05], make: (sr, r) => shapeOut(_rattle(synthVoice({ dur: [0.26, 0.36], f0: [220, 260], peak: [300, 360], end: [190, 230], path: ['er', 'ae'], fscale: 1.2, breath: 0.85, drive: 3.2, sub: 0.5, jitter: 0.1, att: 0.04 }, sr, r), sr, r, [30, 40], 0.4), 1.2) },
    pain: { n: 3, gain: 0.85, rate: [0.95, 1.05], make: (sr, r) => synthVoice({ dur: [0.25, 0.35], f0: [420, 480], peak: [560, 660], end: [320, 380], path: ['ae', 'er'], fscale: 1.25, breath: 0.75, drive: 3, sub: 0.5, jitter: 0.12, vib: { rate: [20, 28], depth: 0.06 }, att: 0.03 }, sr, r) },
  },
  // ── 舔舐者（瞎的、脑子露在外面、长舌头）：靠声音找你 —— 平时是舌头「嗒、嗒嗒」的湿响加粗重的喘气，
  //    发现你是刺耳的高频尖啸，攻击是舌头破空的「嗖——啪」
  licker: {
    clicks: { n: 5, gain: 0.7, rate: [0.95, 1.05], make: (sr, r) => {
      const d = _R(r, 0.7, 1.1), parts = [];
      let t = _R(r, 0, 0.1);
      while (t < d - 0.15) {   // 一簇一簇的：嗒嗒嗒 …… 嗒嗒
        const burst = _clicks(sr, r, _R(r, 0.1, 0.28), [9, 16], [1600, 2800], 9, 0.5);
        parts.push([burst, t, _R(r, 0.6, 1)]); t += burst.length / sr + _R(r, 0.08, 0.25);
      }
      parts.push([_noise(sr, r, d, 'bp', [900, 1300], 0.9, u => 0.5 - 0.5 * Math.cos(2 * Math.PI * Math.min(1, u * 1.2))), 0, 0.1]);   // 湿重的喘气
      return shapeOut(_mix(sr, parts), 1.3);
    } },
    screech: { n: 4, gain: 0.85, rate: [0.96, 1.04], make: (sr, r) => shapeOut(_mix(sr, [
      [synthVoice({ dur: [0.6, 0.85], f0: [480, 560], peak: [820, 980], end: [420, 500], path: ['ae', 'a', 'er'], fscale: 1.4, breath: 0.85, drive: 3.6, sub: 0.5, jitter: 0.1, vib: { rate: [26, 34], depth: 0.05 }, att: 0.04, bw: 1.2 }, sr, r), 0, 1],
      [_clicks(sr, r, 0.2, [18, 24], [1800, 2600], 9), 0, 0.5],   // 尖叫前舌头先抽几下
    ]), 1.3) },
    lash: { n: 4, gain: 0.9, rate: [0.95, 1.05], make: (sr, r) => {
      const d = _R(r, 0.16, 0.22);
      const whoosh = _noise(sr, r, d, 'bp', [3200, 700], 1.4, u => Math.sin(Math.PI * Math.min(1, u)) ** 2);
      const slap = _mix(sr, [[_noise(sr, r, 0.06, 'lp', 900, 0.8, _envAD(0.03, 2)), 0, 1], [_sweep(sr, 0.08, 320, 140, _envAD(0.05, 2)), 0, 0.8]]);
      return shapeOut(_mix(sr, [[whoosh, 0, 0.8], [slap, d * 0.9, 1]]), 1.4);
    } },
    pain: { n: 3, gain: 0.8, rate: [0.95, 1.05], make: (sr, r) => synthVoice({ dur: [0.22, 0.32], f0: [560, 640], peak: [800, 900], end: [420, 480], path: ['ae', 'er'], fscale: 1.4, breath: 0.8, drive: 3.2, sub: 0.4, vib: { rate: [26, 34], depth: 0.05 }, att: 0.03 }, sr, r) },
  },
  // ── 淤泥体（积水里的一团活淤泥）：没有嗓子 —— 只有冒泡、咕嘟、被扯开的湿响
  slime: {
    bubble: { n: 4, gain: 0.7, rate: [0.9, 1.1], make: (sr, r) => shapeOut(_mix(sr, [
      [_bubbles(sr, r, _R(r, 0.6, 1.0), 4 + Math.floor(r() * 4), [250, 700]), 0, 1],
      [_noise(sr, r, 0.8, 'lp', 260, 0.9, u => Math.sin(Math.PI * u) * 0.8), 0, 0.35],
    ]), 1.2) },
    gloop: { n: 4, gain: 0.95, rate: [0.9, 1.08], make: (sr, r) => shapeOut(_mix(sr, [   // 暴起 / 拖人：水面鼓起来「咕咚」
      [_sweep(sr, _R(r, 0.25, 0.35), 70, 210, u => Math.sin(Math.PI * u) * (0.7 + 0.3 * Math.sin(2 * Math.PI * 22 * u))), 0, 1],
      [_noise(sr, r, 0.55, 'lp', 520, 1, _envAD(0.08, 1.4)), 0.05, 0.6],
      [_bubbles(sr, r, 0.6, 6, [180, 500], [0.02, 0.05]), 0.12, 0.6],
    ]), 1.6) },
    pain: { n: 3, gain: 0.8, rate: [0.9, 1.1], make: (sr, r) => shapeOut(_mix(sr, [
      [_noise(sr, r, 0.18, 'bp', [500, 160], 2, _envAD(0.05, 1.5)), 0, 1], [_bubbles(sr, r, 0.3, 3, [300, 600]), 0.04, 0.6],
    ]), 1.3) },
  },
  // ── 蔓生体（变异的藤蔓）：植物不会叫 —— 木质纤维被拧紧时的「吱嘎」、叶子的沙沙声、藤鞭破空的「啪」
  vine: {
    creak: { n: 3, gain: 0.8, rate: [0.9, 1.1], make: (sr, r) => {   // 立起来：吱——嘎（摩擦的粘滑，越拧越慢）
      const d = _R(r, 0.9, 1.4), n = Math.floor(sr * d), out = new Float32Array(n), f = _R(r, 280, 420);
      const bp = _biquad('bp', f, 7, sr), bp2 = _biquad('bp', f * 2.1, 9, sr);
      let t = 0;
      while (t < d) {
        const at = Math.floor(t * sr); if (at < n) out[at] += (0.6 + 0.4 * r()) * 6;
        const u = t / d; t += 1 / (38 - 26 * u + _R(r, -3, 3));
      }
      for (let i = 0; i < n; i++) { const x = out[i]; out[i] = bp(x) + bp2(x) * 0.5; out[i] *= Math.min(1, i / n / 0.1) * Math.min(1, (1 - i / n) / 0.15); }
      const rustle = _noise(sr, r, d, 'hp', 3500, 0.7, u => (0.3 + 0.7 * r()) * Math.sin(Math.PI * u));
      return shapeOut(_mix(sr, [[_norm(out), 0, 1], [rustle, 0, 0.12]]), 1.3);
    } },
    lash: { n: 4, gain: 0.9, rate: [0.95, 1.05], make: (sr, r) => {
      const d = _R(r, 0.1, 0.14);
      const whoosh = _noise(sr, r, d, 'bp', [1200, 5000], 1.2, u => u * u);
      const crack = _mix(sr, [[_noise(sr, r, 0.03, 'hp', 1500, 0.7, _envAD(0.02, 3)), 0, 1], [_sweep(sr, 0.06, 2200, 1400, _envAD(0.02, 3)), 0, 0.4]]);
      const rustle = _noise(sr, r, 0.25, 'hp', 3000, 0.7, _envAD(0.1, 2));
      return shapeOut(_mix(sr, [[whoosh, 0, 0.7], [crack, d, 1], [rustle, d, 0.3]]), 1.5);
    } },
    pain: { n: 3, gain: 0.8, rate: [0.9, 1.1], make: (sr, r) => shapeOut(_mix(sr, [   // 被打中：纤维断裂的脆响 + 汁液
      [_clicks(sr, r, 0.12, [60, 90], [900, 1600], 5, 0.3), 0, 1], [_noise(sr, r, 0.2, 'lp', 700, 1, _envAD(0.05, 1.5)), 0.03, 0.6], [_bubbles(sr, r, 0.25, 2, [400, 700]), 0.05, 0.5],
    ]), 1.3) },
    spit: { n: 3, gain: 0.75, rate: [0.9, 1.1], make: (sr, r) => shapeOut(_mix(sr, [   // 吐酸液：「噗」+ 嘶嘶
      [_noise(sr, r, 0.12, 'bp', [900, 400], 1.2, _envAD(0.1, 2)), 0, 1], [_noise(sr, r, 0.35, 'bp', 3200, 2, _envAD(0.2, 1.5)), 0.06, 0.35],
    ]), 1.3) },
  },
  // ── 寄生体（拉撒路身上掉下来的小东西）：像虫子 —— 口器飞快地「咔咔咔」，受惊时一声细细的尖叫
  parasite: {
    chitter: { n: 4, gain: 0.6, rate: [0.9, 1.1], make: (sr, r) => shapeOut(_mix(sr, [
      [_clicks(sr, r, _R(r, 0.3, 0.5), [28, 42], [3000, 4800], 6, 0.6), 0, 1],
      [synthVoice({ dur: [0.05, 0.08], f0: [1300, 1500], peak: [1600, 1900], end: [1200, 1400], path: [[1500, 2800, 4000, 5000]], breath: 0.5, drive: 1.5, sub: 0.1, att: 0.1 }, sr, r), _R(r, 0.1, 0.3), 0.4],
    ]), 1.2) },
    squeal: { n: 3, gain: 0.65, rate: [0.9, 1.1], make: (sr, r) => synthVoice({ dur: [0.14, 0.22], f0: [1100, 1300], peak: [1500, 1800], end: [900, 1050], path: [[1500, 2800, 4000, 5000]], breath: 0.5, drive: 2, sub: 0.2, att: 0.05, bw: 1.1 }, sr, r) },
  },
  // ── 膨胀者（肚子里全是毒气的僵尸）：还是僵尸的嗓子，但更低、更闷、咕噜更多，肚子里一直在冒泡
  bloater: Object.fromEntries(['idle', 'attack', 'hurt'].map(k => [k, { n: k === 'idle' ? 4 : 3, gain: k === 'idle' ? 0.5 : 0.6, rate: [0.92, 1.05], make: (sr, r) => {
    const Z = ZOMBIE_VOICE.kinds[k];
    const v = synthVoice({ ...Z, f0: Z.f0.map(x => x * 0.78), peak: Z.peak.map(x => x * 0.78), end: Z.end.map(x => x * 0.8), fscale: 0.85, bw: 2.3, gurgle: 0.95, breath: Z.breath * 0.9 }, sr, r);
    return shapeOut(_mix(sr, [[v, 0, 1], [_bubbles(sr, r, v.length / sr, k === 'idle' ? 6 : 3, [120, 320], [0.03, 0.07]), 0, 0.5]]), 1.2);
  } }])),
  // ── 处刑者（两米多高的追踪者）：体型大 → 喉腔长（共振峰整体压低三成）、音高极低，胸腔里滚出来的低吼；
  //    咆哮时张大嘴（「噢——啊」），被打倒是一声闷痛的吼
  executioner: {
    growl: { n: 4, gain: 0.8, rate: [0.95, 1.04], make: (sr, r) => shapeOut(_mix(sr, [
      [synthVoice({ dur: [1.0, 1.5], f0: [38, 46], peak: [52, 62], end: [34, 40], path: ['u', 'o', 'er'], fscale: 0.72, breath: 0.5, drive: 2.2, sub: 0.55, gurgle: 0.2, bw: 1.4, jitter: 0.08, att: 0.2 }, sr, r), 0, 1],
      [_noise(sr, r, 1.2, 'lp', 160, 0.8, u => Math.sin(Math.PI * u)), 0, 0.3],   // 鼻腔里的粗气
    ]), 1.4) },
    roar: { n: 3, gain: 1, rate: [0.96, 1.03], make: (sr, r) => shapeOut(_mix(sr, [
      [synthVoice({ dur: [1.6, 2.1], f0: [55, 65], peak: [88, 105], end: [44, 52], path: ['o', 'a', 'a', 'er'], fscale: 0.72, breath: 0.7, drive: 3, sub: 0.6, gurgle: 0.15, bw: 1.3, jitter: 0.1, att: 0.1 }, sr, r), 0, 1],
      [_noise(sr, r, 1.8, 'lp', 220, 0.8, _envAD(0.15, 1.2)), 0, 0.45],
    ]), 1.5) },
    pain: { n: 3, gain: 0.95, rate: [0.95, 1.05], make: (sr, r) => synthVoice({ dur: [0.7, 1.0], f0: [70, 80], peak: [92, 106], end: [38, 46], path: ['a', 'o', 'u'], fscale: 0.72, breath: 0.6, drive: 2.6, sub: 0.5, bw: 1.4, att: 0.05 }, sr, r) },
  },
  // ── 暴走处刑者（烧伤后变异）：还是处刑者的嗓子，但裂成了两层（一层正常、一层低八度），更破、气声更重，像撕裂的肉
  berserk: {
    roar: { n: 3, gain: 1, rate: [0.96, 1.03], make: (sr, r) => shapeOut(_mix(sr, [
      [_chorus(sr, r, { dur: [1.4, 1.8], f0: [70, 80], peak: [110, 130], end: [55, 62], path: ['o', 'ae', 'a', 'er'], fscale: 0.75, breath: 0.85, drive: 3.6, sub: 0.7, gurgle: 0.4, bw: 1.5, jitter: 0.14, att: 0.06 }, [[1, 1, 0, 1], [0.5, 0.9, 0.02, 0.8]]), 0, 1],
      [_bubbles(sr, r, 1.4, 8, [150, 400], [0.02, 0.05]), 0.1, 0.35],
    ]), 1.6) },
    grunt: { n: 4, gain: 0.9, rate: [0.95, 1.05], make: (sr, r) => shapeOut(_chorus(sr, r, { dur: [0.35, 0.5], f0: [90, 100], peak: [120, 140], end: [60, 70], path: ['a', 'er'], fscale: 0.75, breath: 0.8, drive: 3.4, sub: 0.6, bw: 1.5, att: 0.04 }, [[1, 1, 0, 1], [0.5, 0.9, 0.01, 0.7]]), 1.3) },
  },
  // ── 拉撒路（很多具身体融成的一团肉）：一群嗓子同时在叫 —— 高高低低好几个人的呻吟叠在一起，底下是一层低频的肉团蠕动
  lazarus: {
    moan: { n: 3, gain: 0.95, rate: [0.97, 1.03], make: (sr, r) => shapeOut(_mix(sr, [
      [_chorus(sr, r, { ...ZOMBIE_VOICE.kinds.idle, dur: [2.0, 2.6], humps: 0 }, [[0.6, 0.8, 0, 1], [1, 1, 0.12, 0.8], [1.35, 1.12, 0.25, 0.6], [0.8, 0.9, 0.4, 0.7]]), 0, 1],
      [_sweep(sr, 2.6, 34, 28, u => Math.sin(Math.PI * u)), 0, 0.5],
    ]), 1.5) },
    roar: { n: 3, gain: 1, rate: [0.97, 1.03], make: (sr, r) => shapeOut(_mix(sr, [
      [_chorus(sr, r, { dur: [1.6, 2.0], f0: [60, 70], peak: [100, 120], end: [45, 55], path: ['o', 'a', 'ae', 'er'], fscale: 0.8, breath: 0.75, drive: 3.2, sub: 0.6, gurgle: 0.5, bw: 1.6, att: 0.08 }, [[1, 1, 0, 1], [0.55, 0.8, 0.03, 0.9], [1.6, 1.15, 0.08, 0.5]]), 0, 1],
      [_noise(sr, r, 2.0, 'lp', 180, 0.8, _envAD(0.15, 1.2)), 0, 0.5],
      [_bubbles(sr, r, 1.8, 10, [120, 350], [0.03, 0.06]), 0.1, 0.3],
    ]), 1.6) },
    grunt: { n: 4, gain: 0.9, rate: [0.95, 1.05], make: (sr, r) => shapeOut(_chorus(sr, r, { dur: [0.4, 0.55], f0: [80, 90], peak: [110, 125], end: [55, 65], path: ['a', 'er'], fscale: 0.8, breath: 0.7, drive: 3, sub: 0.5, gurgle: 0.4, bw: 1.6, att: 0.05 }, [[1, 1, 0, 1], [0.6, 0.85, 0.02, 0.8], [1.5, 1.1, 0.04, 0.5]]), 1.3) },
  },
  // ── 触手（从地下钻出来）：预警是脚下越来越响的湿闷隆隆声（1 秒内能听出来往哪躲），钻出来是地面破开 + 肉的湿响
  tentacle: {
    rumble: { n: 3, gain: 0.95, rate: [0.95, 1.05], make: (sr, r) => shapeOut(_mix(sr, [
      [_sweep(sr, 1.0, 45, 110, u => Math.pow(u, 1.5) * Math.min(1, (1 - u) / 0.06)), 0, 1],
      [_noise(sr, r, 1.0, 'lp', 300, 1, u => Math.pow(u, 1.2) * Math.min(1, (1 - u) / 0.06)), 0, 0.7],
      [_bubbles(sr, r, 1.0, 7, [150, 380], [0.02, 0.05]), 0.3, 0.5],
    ]), 1.6) },
    burst: { n: 3, gain: 1, rate: [0.95, 1.05], make: (sr, r) => shapeOut(_mix(sr, [
      [_noise(sr, r, 0.35, 'lp', 900, 0.8, _envAD(0.02, 2)), 0, 1], [_clicks(sr, r, 0.15, [70, 110], [700, 1400], 4, 0.3), 0, 0.7], [_sweep(sr, 0.3, 220, 80, _envAD(0.05, 1.5)), 0, 0.6],
    ]), 1.6) },
  },
};

// ---------------------------------------------------------------- 播放
// 变体按需生成：第一次叫只生成 1 条（最慢的拉撒路群声也就 0.1 秒左右），之后每叫一次补 1 条，直到 n 条。
// 切换地图的黑屏期间（world/level.js 的 updateLoading）会把这张图用得到的叫声先补齐，所以正常游玩时基本不会现生成。
function cryBank(species, act) {
  const c = CRIES[species] && CRIES[species][act]; if (!c || !AU.c) return null;
  AU.cries = AU.cries || {};
  return AU.cries[species + '.' + act] || (AU.cries[species + '.' + act] = []);
}
function cryGrow(species, act) {
  const c = CRIES[species][act], bank = cryBank(species, act);
  if (!bank || bank.length >= c.n) return false;
  const sr = AU.c.sampleRate, d = c.make(sr, Math.random), b = AU.c.createBuffer(1, d.length, sr);
  b.getChannelData(0).set(d); bank.push(b);
  return true;
}
function cry(species, act, v = 1) {
  if (!AU.c || v < 0.02) return;
  const c = CRIES[species] && CRIES[species][act]; if (!c) return;
  const bank = cryBank(species, act);
  if (bank.length < c.n) cryGrow(species, act);
  const s = AU.c.createBufferSource(); s.buffer = bank[Math.floor(Math.random() * bank.length)]; s.playbackRate.value = rand(c.rate[0], c.rate[1]);
  const g = AU.c.createGain(); g.gain.value = v * c.gain;
  s.connect(g); g.connect(auOut()); s.start(AU.c.currentTime);
  voiceStarted(s, g, s.buffer.duration / s.playbackRate.value);
}
function cryAt(species, act, x, y, v = 1, maxDist = 700, min = 0) { return voicedAt(species + '.' + act, cryPri(species, act), x, y, maxDist, min, () => cry(species, act, v)); }

// ---------------------------------------------------------------- 怪物叫声管理（试玩反馈：「很多怪物堆在一起的时候有点吵」）
// 参考了几家的做法：
//   · DICE《战地》的 HDR 音频：每个声音有一个「设计响度」，按距离衰减后得到「听到的响度」；最响的声音决定一个
//     响度窗口的上沿，窗口以下的声音直接不放（剔除），窗口上沿升高时其余声音整体压低 —— 开枪时僵尸的嘟囔自然消失，
//     枪声过后 1–2 秒再慢慢回来。它不是压缩器：不改波形，只决定谁出声、多大声。
//   · Wwise 的「同类声音实例上限」：同一种敌人的同一种叫法同时只放 1 个，多余的丢掉（《Scars Above》对敌人声音就是这么做的）。
//   · 《僵尸世界大战》：普通僵尸发现你时只吼一声，追击时只有持续的低声喘吼，不会一路大喊。
//   · Fatshark《暗潮》：提示音太多就不再是提示；危险提示（能伤到玩家的前摇）优先，其余能省则省；远处的声音要有远处的频响。
// 落到这里：
//   优先级 3 提示音（前摇、Boss）：永远播放，不被剔除、不被压低；并把正在播的闲聊声压低一半
//   优先级 2 发现你 / 扑咬：同一种叫法 0.8 秒内只放 1 声（五只僵尸同时发现你 → 一声嘶吼）
//   优先级 1 中弹 / 倒下：同时最多 2 个，两声之间至少隔 0.4 秒
//   优先级 0 平时的叫声：同时最多 2 个，全局每 1.2 秒最多开口一次，有别的声音在响时远处的不叫
//   再加 HDR 响度窗口 + 距离越远高频越少（空气吸收），远处的怪退到背景里。
const VOICE = { max: 5, idleMax: 2, idleGap: 1.2, hurtMax: 2, hurtGap: 0.4, dupWin: 0.8, dupMax: 1, duck: 0.5, farIdle: 0.35, bigGap: 3.5 };
// HDR：window 窗口宽度（dB）· floor 窗口上沿的最低位置 · release 上沿回落速度（dB/秒）
const HDR = { window: 16, floor: -6, release: 8 };
// 各优先级的设计响度（dB，贴身时）
const PRI_DB = [-14, -9, -5, -2];
const ZOMBIE_PRI = { idle: 0, hurt: 1, attack: 2 };
const CRY_IDLE = { 'dog.growl': 1, 'hunter.chitter': 1, 'licker.clicks': 1, 'slime.bubble': 1, 'parasite.chitter': 1, 'bloater.idle': 1 };
const CRY_HURT = { pain: 1, yelp: 1, whine: 1, hurt: 1 };
const CRY_CUE = { 'hunter.hiss': 1, 'hunter.shriek': 1, 'slime.gloop': 1, 'tentacle.rumble': 1, 'tentacle.burst': 1, 'vine.creak': 1, 'licker.screech': 1 };
const CRY_BOSS = { executioner: 1, berserk: 1, lazarus: 1 };
// Boss 的「满口咆哮」（1.6–2.6 秒的大叫，不是短促的闷哼）。优先级 3 不受 HDR 和各种上限约束，
// 但这几声彼此之间必须留白：Boss 每次出招都吼一嗓子的话，冲撞间隔才 2.5–4 秒，
// 一段 30 秒的阶段二里有 25 秒都是它在吼，从头吵到尾（试玩反馈）。短促的 grunt 不在此列，照常发声。
const CRY_BIG = { 'lazarus.roar': 1, 'lazarus.moan': 1, 'executioner.roar': 1, 'berserk.roar': 1 };
function cryPri(species, act) {
  const k = species + '.' + act;
  if (CRY_BOSS[species] || CRY_CUE[k]) return 3;
  if (CRY_IDLE[k]) return 0;
  if (CRY_HURT[act]) return 1;
  return 2;
}
// 怪物叫声总线：整体比其他音效低一点（原来一群怪一起叫时会盖过枪声和脚步）
function crBus() {
  if (!AU.c) return null;
  if (!AU.crBus) { AU.crBus = AU.c.createGain(); AU.crBus.gain.value = 0.8; AU.crBus.connect(AU.sfxBus || AU.m); }
  return AU.crBus;
}
// HDR 窗口上沿：随时间回落，被更响的声音推高
function hdrTop() {
  const H = AU.hdr || (AU.hdr = { top: HDR.floor, t: AU.c.currentTime }), now = AU.c.currentTime;
  H.top = Math.max(HDR.floor, H.top - HDR.release * (now - H.t)); H.t = now;
  return H;
}
// 很响的非怪物声音（开枪、爆炸）也推高窗口：audio.js 的 sfx() 调用
const HDR_SFX = { pistol: -3, smg: -3, shotgun: 0, magnum: 0, explode: 0, railgun: 0 };
function hdrPush(db) { if (!AU.c) return; const H = hdrTop(); H.top = Math.max(H.top, db); }
// 决定这一声放不放、放多大。返回 null = 不放；否则 rec.scale 是 HDR 给的音量倍数
function voiceBegin(key, pri, gain) {
  const now = AU.c.currentTime;
  AU.voices = (AU.voices || []).filter(v => v.end > now);
  const V = AU.voices, n = V.length, H = hdrTop();
  const L = PRI_DB[pri] + 20 * Math.log10(Math.max(gain, 1e-4));   // 听到的响度
  let scale = 1;
  if (pri < 3) {
    if (L < H.top - HDR.window) return null;                        // 在窗口以下：被更响的声音盖住了，不放
    if (pri === 0) {
      if (V.filter(v => v.pri === 0).length >= VOICE.idleMax || n >= VOICE.max - 1) return null;
      if (now - (AU.lastIdle ?? -9) < VOICE.idleGap) return null;
      if (n > 0 && gain < VOICE.farIdle) return null;
      AU.lastIdle = now;
    } else if (pri === 1) {
      if (V.filter(v => v.pri === 1).length >= VOICE.hurtMax || n >= VOICE.max) return null;
      if (now - (AU.lastHurt ?? -9) < VOICE.hurtGap) return null;
      AU.lastHurt = now;
    } else if (V.filter(v => v.key === key && now - v.t0 < VOICE.dupWin).length >= VOICE.dupMax) return null;
    scale = Math.pow(10, -(H.top - HDR.floor) / 20);                // 窗口被推高了多少，就压低多少
  } else if (CRY_BIG[key]) {
    if (V.some(v => CRY_BIG[v.key])) return null;                   // 已经有一声大叫在响：这一声让位，不要叠起来
    if (now - (AU.lastBig ?? -9) < VOICE.bigGap) return null;       // 两声大叫之间至少留 bigGap 秒
    AU.lastBig = now;
  }
  H.top = Math.max(H.top, L);
  if (pri >= 2) for (const v of V) if (v.pri === 0 && v.g && !v.ducked) {   // 要紧的声音来了：闲聊声压低
    v.ducked = true; try { v.g.gain.setTargetAtTime(v.g.gain.value * VOICE.duck, now, 0.05); } catch (e) { /* 旧浏览器 */ }
  }
  if (V.length >= VOICE.max + 2) {   // 实在太多：掐掉最早的一个闲聊声
    const old = V.find(v => v.pri === 0 && v.s);
    if (old) { try { old.g.gain.setTargetAtTime(0, now, 0.04); old.s.stop(now + 0.2); } catch (e) { /* 已经停了 */ } old.end = now; }
  }
  const rec = { key, pri, t0: now, end: now + 1, s: null, g: null, ducked: false, scale };
  V.push(rec);
  return rec;
}
// cry() / zombieVoice() 开始播放后调用：把音源登记到当前这一声上，并乘上 HDR 音量
function voiceStarted(s, g, dur) {
  const r = AU.curVoice; if (!r) return;
  r.s = s; r.g = g; r.end = AU.c.currentTime + dur;
  if (r.scale !== 1) g.gain.value *= r.scale;
}
function voicedAt(key, pri, x, y, maxDist, min, play) {
  if (!AU.c) return withSpatial(x, y, maxDist, min, play);
  const sp = spatial(x, y, maxDist, min);
  if (sp.gain < 0.02) return sp;
  const rec = voiceBegin(key, pri, sp.gain);
  if (!rec) return sp;
  AU.curVoice = rec;
  // 空气吸收：越远高频越少（贴身 14kHz → 最远 2.2kHz），远处的怪退到背景里，近处的才「刺耳」
  const air = sp.muffled ? 0 : 14000 * Math.pow(2200 / 14000, clamp(sp.d / maxDist, 0, 1));
  try { return withSpatial(x, y, maxDist, min, play, crBus(), air); } finally { AU.curVoice = null; }
}

// 敌人种类 → 叫声物种，以及这种敌人的通用叫法（idle 平时 · spot 发现你 · attack 扑咬 · hurt 中弹 · die 倒下）
// 僵尸 / 爬行者走 audio/zombie.js 的丧尸嗓音；其余走上面的叫声表。
const ENEMY_CRY = {
  dog: ['dog', { idle: 'growl', spot: 'bark', attack: 'snarl', hurt: 'yelp', die: 'whine' }],
  bloater: ['bloater', { idle: 'idle', spot: 'attack', attack: 'attack', hurt: 'hurt', die: 'hurt' }],
  parasite: ['parasite', { idle: 'chitter', spot: 'squeal', attack: 'squeal', hurt: 'squeal', die: 'squeal' }],
  hunter: ['hunter', { idle: 'chitter', spot: 'shriek', attack: 'snarl', hurt: 'pain', die: 'shriek' }],
  licker: ['licker', { idle: 'clicks', spot: 'screech', attack: 'lash', hurt: 'pain', die: 'screech' }],
  slime: ['slime', { idle: 'bubble', spot: 'gloop', attack: 'gloop', hurt: 'pain', die: 'gloop' }],
  vine: ['vine', { idle: 'creak', spot: 'creak', attack: 'lash', hurt: 'pain', die: 'creak' }],
  tentacle: ['slime', { hurt: 'pain', die: 'pain' }],   // 被打中是肉的湿响（钻出来的声音在 ai/lazarus.js 里直接放）
  boss: ['executioner', { idle: 'growl', spot: 'roar', attack: 'growl', hurt: 'pain', die: 'pain' }],
  executionerBerserk: ['berserk', { idle: 'grunt', spot: 'roar', attack: 'grunt', hurt: 'grunt', die: 'roar' }],
  lazarus: ['lazarus', { idle: 'moan', spot: 'roar', attack: 'grunt', hurt: 'grunt', die: 'roar' }],
};
const ZOMBIE_ACT = { idle: 'idle', spot: 'attack', attack: 'attack', hurt: 'hurt', die: 'hurt' };
// 这种敌人有没有自己的叫声表（没有的就是丧尸嗓音）
const hasCry = t => !!ENEMY_CRY[t];
function enemyCry(e, act, v = 1, maxDist = 650, min = 0) {
  if (!hasCry(e.t)) return groanAt(e.x, e.y, v, false, maxDist, min, ZOMBIE_ACT[act] || 'idle');
  const [sp, m] = ENEMY_CRY[e.t]; if (!m[act]) return null;
  return cryAt(sp, m[act], e.x, e.y, v, maxDist, min);
}

// 预热：把这些敌人种类会用到的叫声排进队列，pumpCries(毫秒) 在预算内一条条生成
function warmCries(types) {
  if (!AU.c) return;
  AU.cryQ = AU.cryQ || [];
  const sps = new Set();
  for (const t of types) if (ENEMY_CRY[t]) sps.add(ENEMY_CRY[t][0]);
  if (sps.has('lazarus')) { sps.add('parasite'); sps.add('tentacle'); sps.add('slime'); }
  if (sps.has('executioner')) sps.add('berserk');
  for (const sp of sps) for (const act in CRIES[sp]) AU.cryQ.push([sp, act]);
}
function pumpCries(budgetMs) {
  if (!AU.c || !AU.cryQ || !AU.cryQ.length) return;
  const t0 = performance.now();
  while (AU.cryQ.length && performance.now() - t0 < budgetMs) {
    const [sp, act] = AU.cryQ[0];
    if (!cryGrow(sp, act)) AU.cryQ.shift();
  }
}
