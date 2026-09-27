'use strict';
// 玩家数值：移动速度、受伤减速、武器栏位

const PLAYER_SPEED = { walk: 120, run: 215, aim: 55, reloadMul: 0.7 };
// 噪音半径（单位：格，计划 7.1 的噪音表）。枪械的噪音在 config/weapons.js 的 noise 字段。
// 默认行走是 0（安静），这是「要不要按 Shift」这个核心取舍的基础。
const NOISE = {
  walk: 0,        // 行走：安静
  run: 6,         // 奔跑
  doorOpen: 4,    // 开门
  doorClose: 3,   // 关门
  doorRush: 6,    // 奔跑撞开门
  glass: 8,       // 打碎玻璃、踢翻物件
  wade: 3,        // 在积水里走（地图 2 污水区）：走路也有水声
};
// 受伤减速（良好 / 注意 / 危险）。v3.2 决定：1.0 / 0.95 / 0.88，
// 保证三种状态下安静行走（120 / 114 / 106）都比处刑者（100）快一点。
const STATUS_SPEED = [1, 0.95, 0.88];

// 武器栏位：数字键 1–5 对应下标 0–4；鼠标滚轮在“已拥有”的武器之间循环。
// 冲锋枪、麦林、榴弹发射器在后续地图加入，这里先占好位置。
const WEAPON_SLOTS = [
  { id: 'pistol',  name: '手枪 M19' },
  { id: 'shotgun', name: '霰弹枪 W870' },
  { id: 'smg',     name: '冲锋枪 MP-9' },
  { id: 'magnum',  name: '麦林 .44' },
  { id: 'gl',      name: '榴弹发射器 GL-40' },
];
const WEAPON_SWITCH_CD = 0.15; // 滚轮切换的最短间隔（秒），防止触控板一次滑动连跳好几把
