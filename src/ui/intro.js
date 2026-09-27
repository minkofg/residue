'use strict';
// 序章：新游戏开始时的开场演出。
//
// 为什么值得单独做：开头 60 秒决定别人愿不愿意继续玩。原来的流程是
// 「点新游戏 → 弹出 f0 文件 → 关掉 → 你站在主厅里，随便走」——
// 玩家不知道自己是谁、在哪、怕什么，只知道有个人物能动。
//
// 这里不做动画特效，只做**节奏**：黑屏里一行行浮出字，配无线电杂音和心跳，
// 最后一行落下之后才亮起画面。任意键可跳过（第二次玩的人不该被强迫再看一遍）。

const INTRO_LINES = [
  { t: 0.6,  s: '1998 年 9 月 24 日，夜。', size: 20, col: '#8a8070' },
  { t: 3.2,  s: '赫里昂制药郊外 · 洛克伍德宅邸', size: 26, col: '#c9b98a' },
  { t: 6.0,  s: '失联 72 小时。', size: 20, col: '#8a8070' },
  { t: 9.0,  s: 'S.T.R.T. 救援小队的直升机在宅邸上空被击落。', size: 19, col: '#9a9080' },
  { t: 12.0, s: '队友下落不明。无线电里只剩沙沙声。', size: 19, col: '#9a9080' },
  { t: 15.4, s: '身后的大门被什么东西堵死了。', size: 21, col: '#b8a880' },
  { t: 18.6, s: '先找到出路。', size: 28, col: '#d8c9a0' },
  { t: 21.2, s: '活下去。', size: 34, col: '#e8d8a0' },
];
const INTRO_LEN = 25.0;      // 总长；最后一行之后留几秒静默再亮起画面
const INTRO_FADE = 2.2;      // 结尾淡入游戏画面的时长

let introT = 0;

function startIntro() {
  introT = 0;
  mode = 'intro';
  modeT = 0;
}

function updateIntro(dt) {
  introT += dt;
  // 心跳：越接近结尾越快，把节奏推上去
  const beat = introT < 12 ? 1.35 : introT < 19 ? 1.05 : 0.8;
  if (Math.floor(introT / beat) !== Math.floor((introT - dt) / beat)) {
    sfx('heart', clamp(0.18 + introT / INTRO_LEN * 0.35, 0.18, 0.55));
  }
  if (introT >= INTRO_LEN) endIntro();
}

function endIntro() {
  startAmbient();
  openFile('f0', 'play');       // 序章之后才是简报，关掉简报就开始玩
  msg('无线电：「……有人吗……听得到吗……」', 5);
}

function drawIntro() {
  // 底下已经画好了真实的游戏画面（主厅、灯光、林岚）。这里盖一层黑，
  // 最后 2.2 秒让这层黑的透明度降下去 —— 画面就是从序章里「亮起来」的，
  // 而不是切一刀换个场景。
  const k = introT > INTRO_LEN - INTRO_FADE ? (introT - (INTRO_LEN - INTRO_FADE)) / INTRO_FADE : 0;
  ctx.fillStyle = `rgba(0,0,0,${1 - clamp(k, 0, 1)})`; ctx.fillRect(0, 0, W, H);
  ctx.textAlign = 'center';

  // 每行：淡入 → 停留 → 淡出；同一时刻通常只有一两行在屏幕上
  for (const ln of INTRO_LINES) {
    const d = introT - ln.t;
    if (d < 0 || d > 5.2) continue;
    const a = clamp(Math.min(d / 1.1, (5.2 - d) / 1.3), 0, 1) * (1 - clamp(k, 0, 1));
    if (a <= 0) continue;
    ctx.globalAlpha = a;
    ctx.font = `${ln.size}px serif`;
    ctx.fillStyle = ln.col;
    ctx.fillText(ln.s, W / 2, H / 2 + (ln.t > 15 ? 0 : -10));
  }
  ctx.globalAlpha = 1;

  // 无线电静噪：几道随机的细横线，暗示"信号里什么都没有"
  if (introT < 20) {
    ctx.fillStyle = 'rgba(160,150,130,0.05)';
    for (let i = 0; i < 3; i++) {
      const y = (hash(Math.floor(introT * 6), i) * H) | 0;
      ctx.fillRect(0, y, W, 1);
    }
  }

  // 跳过提示：等 2 秒再出现，免得第一眼就在教人怎么跳过自己的开场
  if (introT > 2 && k <= 0) {
    ctx.globalAlpha = clamp((introT - 2) / 1.5, 0, 0.5);
    ctx.font = '12px sans-serif'; ctx.fillStyle = '#666';
    ctx.fillText('按任意键跳过', W / 2, H - 30);
    ctx.globalAlpha = 1;
  }
}
