'use strict';
// 敌人数值与 AI 常量

const EDEF = {
  zombie: { hp: 100, r: 16, spd: [42, 62], sight: 300, fov: 100, dmg: 20, reach: 22, windup: 0.6, rec: 0.9, memory: 6, nav: 'B' },
  dog:    { hp: 55,  r: 14, spd: [175, 195], sight: 400, fov: 180, dmg: 12, reach: 24, windup: 0.3, rec: 0.55, memory: 8, nav: 'C' },
  // 爬行者（计划 5.2）：僵尸变体。下半身废了，贴地爬，速度 30–40；过不了关着的门（C 层）。
  // 平时趴在地上装死（state 'lurk'），和普通尸体几乎一样；玩家走到跟前才猛地抓脚踝。
  crawler: { hp: 60, r: 14, spd: [30, 40], sight: 220, fov: 100, dmg: 15, reach: 18, windup: 0.3, rec: 1.2, memory: 6, nav: 'C' },
  // 舔舐者（地图 2）：失明，只靠听觉（ai/licker.js）。r 16 ≤ 21 过得了门，但不会开门（C 层）
  licker: { hp: 450, r: 16, spd: [90, 90], sight: 0, dmg: 25, reach: 130, windup: 0.45, rec: 1.1, memory: 4, nav: 'C' },
  // 淤泥体（地图 2 积水区）：潜在水里，只露气泡（ai/slime.js）
  slime: { hp: 150, r: 16, spd: [55, 55], sight: 0, dmg: 18, reach: 30, windup: 0.6, rec: 1, memory: 4, nav: 'C' },
  // 膨胀者（地图 3 化学仓库）：慢、肉，死了就炸，留下一团毒雾（combat/hazards.js）。会拍门，不撞开
  bloater: { hp: 120, r: 18, spd: [36, 44], sight: 260, fov: 100, dmg: 15, reach: 24, windup: 0.8, rec: 1.2, memory: 6, nav: 'B' },
  // 蔓生体（地图 3 温室）：伪装成植物、不移动；不会被击退（ai/vine.js）
  vine: { hp: 600, r: 20, spd: [0, 0], sight: 0, dmg: 20, reach: 60, windup: 0.5, rec: 0.9, memory: 99, nav: 'C' },
  // 猎手（地图 3 生产车间，计划 5.2）：聪明、快，会绕到侧面，从远处飞扑（ai/hunter.js）。
  // 会开门（A 层，和处刑者一样走到门前直接推开）；记忆 12 秒。r 16 ≤ 21 过得了门
  hunter: { hp: 350, r: 16, spd: [150, 160],   // 试玩反馈「都会飞扑了就走慢点」：205–215（和玩家奔跑一样快）→ 150–160（比奔跑 215 慢、比行走 120 快）
            sight: 420, dmg: 22, reach: 26, windup: 0.35, rec: 0.7, memory: 12, nav: 'A' },
  // 处刑者速度 100（v3.2 决定）：比玩家任何状态下的安静行走都慢一点，比瞄准、装填时快。
  // 处刑者：不能杀死，只能按累计伤害暂时打倒；作为追踪者而非普通 Boss。
  // 碰撞半径必须 ≤ 门宽的一半减 3（48/2-3=21），否则过不了门；外观仍按大体型绘制，攻击距离相应加长。
  // 追踪形态：杀不死，只能按累计伤害暂时打倒（combat.js 里 e.hp 恒等于 maxhp）。
  // 这里的 hp 只是占位，真正决定「能撑多久」的是 config/director.js 的 EXEC.threshold。
  boss:   { hp: 3000, r: 21, spd: [100, 100], sight: 450, dmg: 35, reach: 39, windup: 0.6, rec: 1.0, memory: 0, nav: 'A' },
  // 暴走形态（计划 4.4，焚化炉 Boss 战一）：有上限、可以被杀死，和追踪形态**完全独立**的一套数值。
  // v3.2 修订 I 要求两个形态分开定义，避免以后改 Boss 数值时误伤追踪者。M4 启用。
  executionerBerserk: {
    hp: 3000, r: 21, spd: [200, 200], sight: 450, dmg: 45, reach: 42, windup: 0.5, rec: 0.8, memory: 12, nav: 'A',
    weakSpot: { name: '背后的心脏', mul: 2 },        // 弱点：背后裸露的心脏，伤害 ×2
    envDamage: 600,                                   // 引它撞上钢水管道：一次 600
    phase2At: 1500,                                   // 低于 1500 进入阶段二（冲撞墙壁）
    stunAfterCharge: 2.5,                             // 撞墙后晕眩
    leapTell: 0.8,                                    // 跳劈落点红圈预警
  },
  // Boss 战二：拉撒路（计划 4.5）。三个阶段各有一条血；行为和其余数值在 ai/lazarus.js 的 LAZ
  lazarus: {
    hp: 1800, r: 26, spd: [95, 95], sight: 900, dmg: 30, reach: 60, windup: 0.7, rec: 0.8, memory: 99, nav: 'A',
    phases: [
      { name: '人形', hp: 1800, weakMul: 2.5 },            // 肩上的眼球（出招后睁开）×2.5
      { name: '四足兽形', hp: 2200, stunAfterCharge: 3 },  // 撞墙后晕眩 3 秒
      { name: '肉块', hp: 4500, otherMul: 0.1 },           // 只有电磁炮能打；其他武器 10%
    ],
  },
  parasite: { hp: 30, r: 9, spd: [150, 170], sight: 500, dmg: 8, reach: 14, windup: 0.3, rec: 0.7, memory: 20, nav: 'B' },   // 拉撒路阶段二召唤的小型寄生体
  tentacle: { hp: 40, r: 16, spd: [0, 0], sight: 0, dmg: 30, reach: 0, windup: 1, rec: 0.5, memory: 0, nav: 'C' },         // 拉撒路阶段三的触手（预警时打掉就能打断）
};
// 爬行者的其余参数
const CRAWLER = {
  reviveChance: 0.3,      // 僵尸被「身体伤害」打死时变成爬行者的概率（爆头打死的不会）
  reviveDelay: [3, 7],    // 死后多少秒才可能爬起来（之后还要等玩家走近）
  reviveDist: 8,          // 玩家在多少格以内才会「复活」（远处的尸体保持死亡，省得没人看见时白白变异）
  wakeDist: 64,           // 装死时玩家离它多少像素会暴起抓脚踝
  twitch: [3, 6],         // 装死时每隔几秒手指抽动一下 —— 留心的玩家能看出来（计划：「留意地上的尸体」）
  slowMul: 0.45,          // 脚踝被抓：接下来 slowT 秒移动速度 ×0.45
  slowT: 1.6,
};
// 舔舐者的其余参数
const LICKER = {
  fresh: 2.5,          // 听到声音后多少秒内「知道」声源在哪（之后就是摸黑乱找）
  memory: 5,           // 声源记多久
  tongue: 3 * 48,      // 长舌射程 3 格
  nearSource: 110,     // 玩家离声源多近才算「就是那个声音」
  lungeDist: 4 * 48, lungeSpd: 400, lungeT: 0.45,   // 猛扑
  confuseNoise: 16, confuseDist: 2.5 * 48, confuseT: 1.8, confuseCd: 8,   // 霰弹枪（18）贴脸：震懵 1.8 秒，8 秒内不再被震懵；手枪（14）、冲锋枪（12）不会
};
const SLIME = {
  senseDist: 6 * 48,   // 玩家在水里、6 格内：朝他漂过去
  emergeDist: 60,      // 贴到这么近就暴起
  tell: 0.6,           // 暴起前水面鼓起来的时间 —— 看到就赶紧退
  grabReach: 64,
  slowT: 2.8,          // 被拖：减速多久（沿用爬行者的减速倍率）
  upT: 3,              // 露出水面多久（这段时间能打）
};
// 猎手的其余参数（计划 5.2、第 11 节第 4 条：处决保留，但有 1 秒预警、可以打断）
const HUNTER = {
  leapSpd: 360,            // 飞扑速度（试玩反馈「飞得太快」：450 → 360）
  leapMin: 2.5 * 48, leapMax: 6 * 48,   // 在这个距离内、路上没挡才会飞扑
  leapTell: 0.55,          // 普通飞扑前伏低身子的时间（0.4 → 0.55：看到它伏低、听到嘶气，来得及横移）
  leapCd: [4.5, 6],        // 两次飞扑之间（3.5–5 → 4.5–6）
  leapDmg: 25,             // 30 → 25
  leapMissRec: 0.85,       // 扑空后趴在地上的时间（0.6 → 0.85）：躲开了就有一个还手的窗口
  execBelow: 40,           // 玩家生命 ≤ 40（40%）时，飞扑变成「处决」
  execLeave: 1,            // 处决扑中：打到只剩 1 血（重伤），不再即死 —— 计划第 11 节第 4 条的「其他选择」，试玩反馈后采用
  execTell: 1.0,           // 处决前摇：全身发红光 + 尖啸
  execCd: 20,              // 处决被打断后，20 秒内不再尝试
  flankDist: 3 * 48,       // 包抄：瞄准玩家侧面这么远的一个点，而不是直线冲过去
  dodgeCd: 2.2, dodgeT: 0.28, dodgeSpd: 380,   // 被枪口指着时横向闪身
  stagMul: 0.5,            // 硬直只有普通敌人的一半
  kbMul: 0.4,
  leapPoison: true,        // 爪子带毒：飞扑命中会中毒（蓝色草药解）
};
const SLEEP_DIST = 40 * 48;   // 普通敌人超过 40 格休眠（计划 8.3）；处刑者不休眠（v3.2 附录 A2 第 3 条）
// 处刑者的其余参数（感知、冲刺、抓取、打倒阈值、导演系统）在 config/director.js

// 寻路层（计划 7.3）：nav 字段决定敌人用哪一层
//   A 处刑者：关着的门可以通过，额外代价 +2（走到门前直接推开）
//   B 僵尸：  关着的门可以通过，额外代价 +6（走到门前拍门，累计 DOOR_BASH_TIME 秒后撞开）
//   C 狗等：  关着的门不能通过
//   D 导演：  只用来量玩家和处刑者之间的路径距离（玩家躲在安全屋里关着门也能量）
// 锁着的门、安全屋的门：任何一层都不能通过。
const NAV_DOOR_COST = { A: 2, B: 6, C: Infinity, D: 2 };  // D：导演系统量“路径距离”用，不用于移动
const DOOR_BASH_TIME = 8;     // 僵尸拍门多少秒撞开（进度写进存档，不会自行恢复）
const DOOR_BASH_NOISE = 5;    // 每次拍门的噪音半径（格）：会引来附近的敌人
const DOOR_BREAK_NOISE = 8;   // 门被撞开时的噪音半径（格）
const DOOR_BASH_GIVEUP = 12;  // 拍门时记忆计时暂停；但玩家离门超过这么多格（路径距离），僵尸就放弃
