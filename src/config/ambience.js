'use strict';
// 每个房间的环境声。恐怖游戏一半的压迫感在声音里，而这一层之前是空的 ——
// 全图只有一条不变的低频嗡鸣，从主厅走到冷库、走到后庭院，耳朵里毫无变化。
//
// 一份配置由两部分组成：
//   bed     持续的底噪。用带通滤波后的白噪声模拟「这个空间听起来像什么」：
//             freq 低 = 闷（地下室、冷库）；freq 高 = 空旷带回声（大厅、庭院）
//             Q 高 = 有明显的音高（管道、电流）；Q 低 = 宽频的风声、雨声
//             sway 让滤波频率缓慢起伏，避免听起来像一段死循环
//   oneshots 随机穿插的单次声音。间隔写成区间，永远不要等距 ——
//             等距的滴水声 3 次之后就会被大脑归类为「机器噪音」而自动忽略。
const AMBIENCE = {
  // 大理石大厅：空旷、有回声，远处有座落地钟
  hall:    { bed: { freq: 520, q: 0.6, gain: 0.030, sway: 120 },
             oneshots: [{ s: 'clock', every: [3.4, 4.2], v: 0.5 }, { s: 'creak', every: [14, 26], v: 0.35 }] },
  gallery: { bed: { freq: 620, q: 0.5, gain: 0.028, sway: 160 },
             oneshots: [{ s: 'rainpane', every: [6, 11], v: 0.42 }, { s: 'creak', every: [18, 30], v: 0.3 }] },
  bedroom: { bed: { freq: 280, q: 0.9, gain: 0.018, sway: 40 },
             oneshots: [{ s: 'clock', every: [4.6, 5.4], v: 0.25 }, { s: 'creak', every: [11, 22], v: 0.35 }] },
  // 酒窖：潮、闷、有水滴；升降梯的缆绳偶尔自己响一下
  cellar:  { bed: { freq: 110, q: 1.6, gain: 0.04, sway: 20 },
             oneshots: [{ s: 'drip', every: [2.8, 5.5], v: 0.4 }, { s: 'metal', every: [8, 15], v: 0.35 }] },
  library: { bed: { freq: 300, q: 0.8, gain: 0.022, sway: 60 },
             oneshots: [{ s: 'creak', every: [10, 20], v: 0.4 }, { s: 'paper', every: [13, 24], v: 0.35 }] },
  dining:  { bed: { freq: 380, q: 0.7, gain: 0.026, sway: 90 },
             oneshots: [{ s: 'creak', every: [12, 22], v: 0.35 }] },

  // 厨房：滴水的水龙头。冷库：压缩机的低频 + 更慢更冷的滴水
  kitchen: { bed: { freq: 260, q: 1.1, gain: 0.028, sway: 50 },
             oneshots: [{ s: 'drip', every: [2.2, 3.6], v: 0.45 }] },
  cold:    { bed: { freq: 95,  q: 2.4, gain: 0.045, sway: 18 },
             oneshots: [{ s: 'drip', every: [3.5, 6.5], v: 0.3 }, { s: 'metal', every: [9, 17], v: 0.32 }] },

  storage: { bed: { freq: 220, q: 1.0, gain: 0.024, sway: 40 },
             oneshots: [{ s: 'drip', every: [5, 10], v: 0.28 }, { s: 'creak', every: [15, 28], v: 0.3 }] },

  // 安全屋：最安静的地方。这份安静本身就是奖励，别用声音去污染它
  study:   { bed: { freq: 200, q: 0.9, gain: 0.014, sway: 30 },
             oneshots: [{ s: 'clock', every: [4.0, 4.0], v: 0.22 }] },

  // 私人实验室：电流嗡鸣 + 应急灯的滋滋声
  lab:     { bed: { freq: 120, q: 3.0, gain: 0.040, sway: 12 },
             oneshots: [{ s: 'sizzle', every: [4, 8], v: 0.34 }, { s: 'metal', every: [11, 20], v: 0.3 }] },

  // 石头夹道：风从尽头的门缝里灌进来
  passage: { bed: { freq: 700, q: 0.4, gain: 0.038, sway: 260 },
             oneshots: [{ s: 'wind', every: [5, 9], v: 0.5 }] },

  // 户外：风最大，远处有树和铁皮
  yard:    { bed: { freq: 900, q: 0.35, gain: 0.048, sway: 380 },
             oneshots: [{ s: 'wind', every: [3.5, 7], v: 0.65 }, { s: 'metal', every: [12, 22], v: 0.28 }] },

  music:   { bed: { freq: 260, q: 1.2, gain: 0.02, sway: 40 },
             oneshots: [{ s: 'creak', every: [10, 20], v: 0.3 }] },
  green:   { bed: { freq: 1400, q: 0.5, gain: 0.03, sway: 300 },
             oneshots: [{ s: 'rainpane', every: [3, 6], v: 0.7 }, { s: 'drip', every: [2.5, 5], v: 0.35 }] },
  // 第二个安全屋：和书房一样安静
  shed:    { bed: { freq: 200, q: 0.9, gain: 0.014, sway: 30 },
             oneshots: [{ s: 'rainpane', every: [6, 10], v: 0.25 }] },
  // 地图 2：研究所。低频机械嗡鸣 + 滴水；安保室和书房一样安静
  // 地图 3：制药厂。户外是大雨；行政楼安静
  m3station: { bed: { freq: 300, q: 0.8, gain: 0.03, sway: 60 }, oneshots: [{ s: 'metal', every: [6, 12], v: 0.35 }, { s: 'rainpane', every: [4, 8], v: 0.4 }] },
  m3yard:    { bed: { freq: 1600, q: 0.3, gain: 0.05, sway: 400 }, oneshots: [{ s: 'rainpane', every: [1.5, 3.5], v: 0.8 }, { s: 'wind', every: [5, 10], v: 0.5 }, { s: 'metal', every: [14, 26], v: 0.25 }] },
  m3admin:   { bed: { freq: 200, q: 0.9, gain: 0.014, sway: 30 }, oneshots: [{ s: 'rainpane', every: [5, 9], v: 0.3 }] },
  m3green:   { bed: { freq: 1400, q: 0.5, gain: 0.03, sway: 300 }, oneshots: [{ s: 'rainpane', every: [3, 6], v: 0.7 }, { s: 'drip', every: [2.5, 5], v: 0.35 }] },
  m3chem:    { bed: { freq: 140, q: 1.6, gain: 0.03, sway: 20 }, oneshots: [{ s: 'drip', every: [2.5, 5], v: 0.35 }, { s: 'sizzle', every: [8, 15], v: 0.15 }] },
  m2lift:    { bed: { freq: 90,  q: 2.0, gain: 0.04, sway: 15 }, oneshots: [{ s: 'metal', every: [7, 14], v: 0.35 }, { s: 'drip', every: [3, 6], v: 0.3 }] },
  m2sec:     { bed: { freq: 200, q: 0.9, gain: 0.014, sway: 30 }, oneshots: [{ s: 'sizzle', every: [9, 16], v: 0.12 }] },
  m2sewer:   { bed: { freq: 160, q: 1.2, gain: 0.045, sway: 40 }, oneshots: [{ s: 'drip', every: [1.2, 2.5], v: 0.45 }] },
  m2tanks:   { bed: { freq: 110, q: 3.0, gain: 0.04, sway: 10 }, oneshots: [{ s: 'sizzle', every: [5, 9], v: 0.3 }] },
  m2freeze:  { bed: { freq: 95,  q: 2.4, gain: 0.045, sway: 18 }, oneshots: [{ s: 'metal', every: [9, 17], v: 0.3 }] },
  m2bow:     { bed: { freq: 70,  q: 3.0, gain: 0.05, sway: 10 }, oneshots: [{ s: 'metal', every: [5, 10], v: 0.4 }] },
  // 走廊：默认，介于房间之间
  wcor:    { bed: { freq: 400, q: 0.7, gain: 0.024, sway: 80 }, oneshots: [{ s: 'creak', every: [16, 30], v: 0.3 }] },
  ncor:    { bed: { freq: 430, q: 0.7, gain: 0.024, sway: 80 }, oneshots: [{ s: 'creak', every: [16, 30], v: 0.3 }] },
  ecor:    { bed: { freq: 400, q: 0.7, gain: 0.024, sway: 80 }, oneshots: [{ s: 'creak', every: [16, 30], v: 0.3 }] },
};
// 不在表里的房间（以及房间之外）用这一份
const AMBIENCE_DEFAULT = { bed: { freq: 400, q: 0.7, gain: 0.022, sway: 80 }, oneshots: [] };
const AMB_FADE = 1.6;   // 换房间时底噪的交叉渐变时长（秒）。太快会听出「切了一刀」
