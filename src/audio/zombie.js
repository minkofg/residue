'use strict';
// 丧尸的嗓音（第五版，试玩反馈「完全不像」之后重做）。
//
// 前四版的毛病：只有「声带拍打」的咯咯声（气泡音），没有真正的嗓音和元音，
// 听起来像马达、像青蛙、像漏气，就是不像一个人在喉咙里呻吟。
//
// 这一版照真人发声的方式合成（源 - 滤波模型）：
//   1. 声门脉冲（Rosenberg 波形）：有明确音高的嗓音。音高每个周期随机抖（jitter）、
//      强弱随机变（shimmer），并且隔一个周期弱一下、慢一点（周期倍化）——
//      耳朵听到的就是「嗓子烂了」的那种粗糙低吼，而不是干净的哼声。
//   2. 气声：噪声跟着声门开合一起起伏（同步于每个周期），就是嘶哑的「沙」。
//   3. 共振峰：四个串联的谐振器，按元音轨迹滑动 ——「呜——啊——呃」，嘴一张一合。
//      带宽开得比正常人宽（喉咙里有积液、组织烂了），声音发闷、发湿。
//   4. 咕噜：15–30Hz 的随机振幅起伏，时有时无（喉咙里的痰、血）。
//   5. 最后过一道软削波（tanh），让声音有点「破」。
//
// 三种叫法：
//   idle   游荡时的长呻吟（1.4–2.6 秒，音高低、起伏慢，偶尔两段）
//   attack 发现你 / 扑上来 / 抓住你的嘶吼（0.6–1.0 秒，音高高、气声重、更破）
//   hurt   中弹的闷哼（0.25–0.45 秒，音高往下掉）
//
// 纯数学、不依赖 AudioContext：游戏里生成缓冲播放；tools/zombie-preview.js 用同一个函数导出 WAV 试听。
// rnd：随机函数（缺省 Math.random），导出试听时传固定种子，保证每次导出一样。

const ZOMBIE_VOICE = {
  // 元音共振峰（F1–F4，Hz）。数值取成年男性元音，整体压低一点（喉腔被撑大）
  vowels: {
    u: [320, 800, 2300, 3200],     // 呜
    o: [480, 860, 2400, 3250],     // 噢
    a: [700, 1150, 2450, 3300],    // 啊
    ae: [640, 1500, 2400, 3300],   // 嗷（张大嘴的「æ」，嘶吼用）
    er: [480, 1250, 1750, 3100],   // 呃
  },
  kinds: {
    //         时长          起始音高      峰值音高      结束音高    元音轨迹            气声   破音   周期倍化  咕噜
    idle:   { dur: [1.4, 2.6], f0: [62, 78], peak: [88, 118], end: [48, 60], path: ['u', 'o', 'a', 'o', 'er'], breath: 0.45, drive: 1.8, sub: 0.35, gurgle: 0.55, humps: 0.35 },
    attack: { dur: [0.6, 1.0], f0: [110, 135], peak: [150, 190], end: [85, 105], path: ['er', 'ae', 'a', 'er'], breath: 0.7, drive: 2.4, sub: 0.5, gurgle: 0.3, att: 0.06, bw: 1.3 },
    hurt:   { dur: [0.25, 0.45], f0: [140, 165], peak: [150, 175], end: [80, 95], path: ['a', 'er'], breath: 0.55, drive: 2.4, sub: 0.3, gurgle: 0.1, att: 0.04 },
  },
};

// 哪些怪用这副嗓子：人变的（僵尸、爬行者、膨胀者）。狗叫、舔舐者 / 猎手 / 寄生体的嘶嘶声各有各的
const ZOMBIE_VOICED = t => t === 'zombie' || t === 'crawler' || t === 'bloater';

function synthZombie(kind, sr, rnd = Math.random) {
  return synthVoice(ZOMBIE_VOICE.kinds[kind] || ZOMBIE_VOICE.kinds.idle, sr, rnd);
}

// ---------------------------------------------------------------- 通用嗓音合成（僵尸、处刑者、猎手、舔舐者、狗……都用它）
// P 的字段（区间都写 [最小, 最大]，每次随机取）：
//   dur 时长（秒）· f0 / peak / end 起始、峰值、结束音高（Hz）· peakAt 峰值出现在第几成（缺省 idle 0.25–0.45、短促的 0.05–0.15）
//   path 元音轨迹（ZOMBIE_VOICE.vowels 的名字，或直接写 [F1, F2, F3, F4]）· fscale 共振峰整体缩放（<1 = 体型大、喉腔长；>1 = 体型小）
//   bw 带宽倍数（越大越闷越湿）· breath 气声 · drive 破音 · sub 周期倍化（粗糙）· gurgle 咕噜 · jitter 音高抖动
//   att 起音占比 · humps 两段式的概率 · vib 颤音 { rate: [Hz], depth: 比例 }（尖啸用）
function synthVoice(P, sr, rnd = Math.random) {
  const V = ZOMBIE_VOICE.vowels, R = (a, b) => a + (b - a) * rnd(), pick = x => Array.isArray(x) ? R(x[0], x[1]) : x;
  const dur = pick(P.dur), n = Math.max(1, Math.floor(sr * dur)), out = new Float32Array(n);
  const f0a = pick(P.f0), f0p = pick(P.peak), f0e = pick(P.end);
  const peakAt = P.peakAt ? pick(P.peakAt) : dur < 0.5 ? R(0.05, 0.15) : R(0.25, 0.45);
  const twoHumps = P.humps ? rnd() < P.humps : false;   // 偶尔「呜——呃…呜——」两段（不设 humps 就不抽随机数：保证僵尸的声音和第五版一模一样）
  const fs = P.fscale || 1, breath = P.breath ?? 0.45, drive = P.drive ?? 1.8, sub = P.sub ?? 0.35, gurgleAmt = P.gurgle ?? 0.3, jit = P.jitter ?? 0.1;
  const path = P.path.map(v => (typeof v === 'string' ? V[v] : v).map(f => f * fs));
  const vibRate = P.vib ? pick(P.vib.rate) : 0, vibDepth = P.vib ? P.vib.depth : 0;

  const pitchAt = u => {
    let f = u < peakAt ? f0a + (f0p - f0a) * Math.sin(Math.PI / 2 * u / peakAt)
                       : f0p + (f0e - f0p) * Math.pow((u - peakAt) / (1 - peakAt), 0.8);
    if (twoHumps) f *= 1 - 0.28 * Math.exp(-Math.pow((u - 0.55) / 0.07, 2));
    if (vibRate) f *= 1 + vibDepth * Math.sin(2 * Math.PI * vibRate * u * dur);
    return f;
  };
  const att = P.att ?? (dur < 0.5 ? 0.05 : 0.14);
  const envAt = u => {
    const a = Math.min(1, u / att), r = u > 0.6 ? Math.pow(Math.max(0, (1 - u) / 0.4), 1.4) : 1;
    let e = a * r;
    if (twoHumps) e *= 1 - 0.55 * Math.exp(-Math.pow((u - 0.55) / 0.06, 2));
    return e;
  };
  const formantsAt = u => {
    if (path.length === 1) return path[0];
    const x = Math.min(0.9999, u) * (path.length - 1), i = Math.floor(x), t = (1 - Math.cos(Math.PI * (x - i))) / 2;
    return path[i].map((f, k) => f + (path[i + 1][k] - f) * t);
  };
  // 串联谐振器（Klatt）
  const bwMul = P.bw ?? 1.6;
  const BW = [110, 140, 220, 300].map(b => b * bwMul);
  const res = BW.map(() => ({ a: 0, b: 0, c: 0, y1: 0, y2: 0 }));
  const setRes = F => {
    for (let k = 0; k < 4; k++) {
      const r = res[k], f = Math.min(F[k], sr * 0.45);
      const C = -Math.exp(-2 * Math.PI * BW[k] / sr), B = 2 * Math.exp(-Math.PI * BW[k] / sr) * Math.cos(2 * Math.PI * f / sr);
      r.c = C; r.b = B; r.a = 1 - B - C;
    }
  };

  // 声门：Rosenberg 脉冲（开相 40%、闭相 16%），取导数当激励
  let ph = 0, per = 0, periodAmp = 1, periodMul = 1, prevFlow = 0;
  let gurgPh = 0, gurgF = R(15, 30), gurgOn = 0, lpN = 0, hpPrev = 0, hpOut = 0;
  for (let i = 0; i < n; i++) {
    const u = i / n;
    if (i % 32 === 0) setRes(formantsAt(u));
    if (ph >= 1 || i === 0) {   // 新周期：抖音高、抖强弱、周期倍化
      if (i) ph -= 1;
      per++;
      const odd = per % 2 === 1;
      periodMul = (1 + (rnd() * 2 - 1) * jit) * (odd ? 1 + sub * 0.12 : 1);
      periodAmp = (0.7 + rnd() * 0.3) * (odd ? 1 - sub * 0.6 : 1);
      if (rnd() < 0.04) periodAmp *= 0.25;   // 偶尔漏一拍
    }
    const f0 = pitchAt(u) / periodMul;
    ph += f0 / sr;
    const flow = ph < 0.4 ? 0.5 * (1 - Math.cos(Math.PI * ph / 0.4)) : ph < 0.56 ? Math.cos(Math.PI * (ph - 0.4) / 0.32) : 0;
    const dFlow = (flow - prevFlow) * sr / (f0 * 8); prevFlow = flow;
    const voiced = dFlow * periodAmp;
    lpN += ((rnd() * 2 - 1) - lpN) * 0.5;
    const asp = lpN * (0.3 + 0.7 * flow) * breath * 2.6;   // 2.6：气声要盖住谐波之间的空隙，否则听起来像在哼歌
    let x = voiced * Math.max(0, 1 - breath * 0.4) + asp;
    for (let k = 0; k < 4; k++) { const r = res[k]; const y = r.a * x + r.b * r.y1 + r.c * r.y2; r.y2 = r.y1; r.y1 = y; x = y; }
    if (i % 256 === 0) {
      gurgOn += ((rnd() < gurgleAmt * 0.5 ? 1 : 0) - gurgOn) * 0.3;
      gurgF += (R(15, 30) - gurgF) * 0.1;
    }
    gurgPh += gurgF / sr;
    const gurg = 1 - gurgOn * 0.6 * (0.5 + 0.5 * Math.sin(2 * Math.PI * gurgPh));
    hpOut = 0.993 * (hpOut + x - hpPrev); hpPrev = x;
    out[i] = hpOut * gurg * envAt(u);
  }
  return shapeOut(out, drive);
}
// 归一化 → 软削波（破音）→ 再归一化到 0.9
function shapeOut(out, drive = 1) {
  const n = out.length;
  let m = 0; for (let i = 0; i < n; i++) m = Math.max(m, Math.abs(out[i]));
  if (m > 0) for (let i = 0; i < n; i++) out[i] = Math.tanh(out[i] / m * drive);
  m = 0; for (let i = 0; i < n; i++) m = Math.max(m, Math.abs(out[i]));
  if (m > 0) for (let i = 0; i < n; i++) out[i] *= 0.9 / m;
  return out;
}
