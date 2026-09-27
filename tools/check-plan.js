'use strict';
// 数值契约检查：调平过的关键数值 ↔ 代码
//
// 问题背景：处刑者速度 100、休眠 40 格、记忆时间 6/8 秒…… 这些数是反复试玩调平出来的，
// 改动一处常常在别处翻车。一次代码审查发现了 8 处漂移，所以把它变成机器检查。
//
// 每条契约：代码里的值必须等于这里写死的期望值。要改数值，代码和这里一起改 —— 强迫你确认是有意为之。
// （以前还会反查 PLAN_v3.2.md 里有没有同步写这个数；设计文档已从仓库移除，只保留代码这一侧。）
//
// 用法：node tools/check-plan.js
//   状态 pending 的条目只提醒不失败（还没拍板的设计决定）。

const { R } = require('./harness');

const rows = [];
// name              期望值            代码里的实际值                     计划章节（用来做反向检查）  状态
const C = (name, expect, actual, section, status = 'must') => rows.push({ name, expect, actual, section, status });

// ---------------------------------------------------------------- 处刑者与导演（计划 3.1–3.4）
C('处刑者行走速度',        100,  R.EDEF.boss.spd[0],        '### 3.1 基本设定');
C('处刑者碰撞半径',         21,  R.EDEF.boss.r,             '### 3.1 基本设定');
C('处刑者视线距离',        450,  R.EXEC.sightDist,          '### 3.1 基本设定');
C('处刑者视野角度',        120,  R.EXEC.fov,                '### 3.1 基本设定');
C('打倒阈值',              400,  R.EXEC.threshold,          '### 3.1 基本设定');
C('打倒阈值上限',          700,  R.EXEC.thresholdMax,       '### 3.1 基本设定');
C('跪地时间（秒）',         20,  R.EXEC.knockdown,          '### 3.1 基本设定');
C('中途踉跄阈值',          200,  R.EXEC.midStagger,         '### 3.1 基本设定');
C('重拳伤害',               35,  R.EXEC.punch.dmg,          '### 3.1 基本设定');
C('重拳前摇（秒）',        0.6,  R.EXEC.punch.windup,       '### 3.1 基本设定');
C('抓取伤害',               45,  R.EXEC.grab.dmg,           '### 3.1 基本设定');
C('抓取前摇（秒）',        0.8,  R.EXEC.grab.windup,        '### 3.1 基本设定');
C('冲刺速度',              260,  R.EXEC.dash.speed,         '### 3.1 基本设定');
C('安全屋宽限期（秒）',     20,  R.EXEC.grace,              '### 3.3 导演系统');
C('太松：距离（格）',       25,  R.DIRECTOR.looseDist,      '### 3.3 导演系统');
C('太松：时间（秒）',       60,  R.DIRECTOR.looseTime,      '### 3.3 导演系统');
C('太紧：时间（秒）',       90,  R.DIRECTOR.tightTime,      '### 3.3 导演系统');
C('撤离距离（格）',         15,  R.DIRECTOR.retreatDist,    '### 3.3 导演系统');
C('读档保护：近（格）',     12,  R.DIRECTOR.loadNear,       '### 3.3 导演系统');
C('读档保护：挪到（格）',   20,  R.DIRECTOR.loadFar,        '### 3.3 导演系统');
C('追击音乐淡入（秒）',    2.5,  R.CHASE_MUSIC.fadeIn,      '### 3.4 让玩家');
C('追击音乐淡出（秒）',      8,  R.CHASE_MUSIC.fadeOut,     '### 3.4 让玩家');
C('追击音乐 BPM 下限',      84,  R.CHASE_MUSIC.bpmLow,      '### 3.4 让玩家');
C('追击音乐 BPM 上限',     132,  R.CHASE_MUSIC.bpmHigh,     '### 3.4 让玩家');

// ---------------------------------------------------------------- 敌人（计划 5.1、5.2）
C('僵尸生命',              100,  R.EDEF.zombie.hp,          '### 5.2 怪物一览');
C('感染犬生命',             55,  R.EDEF.dog.hp,             '### 5.2 怪物一览');
C('僵尸记忆时间（秒）',      6,  R.EDEF.zombie.memory,      '### 5.1 通用感知模型');
C('感染犬记忆时间（秒）',    8,  R.EDEF.dog.memory,         '### 5.1 通用感知模型');
// 这三条曾经是「待裁决」（计划写 50–72 / 180，代码是 42–62 / 175）。
// 已按代码定稿并回写计划 5.2，理由写在那一节的引用块里：
// 要守的是速度之间的**关系**（见 sim-tests「速度关系」段），不是某个具体数字。
C('僵尸速度下限',           42,  R.EDEF.zombie.spd[0],      '### 5.2 怪物一览');
C('僵尸速度上限',           62,  R.EDEF.zombie.spd[1],      '### 5.2 怪物一览');
C('感染犬速度',            175,  R.EDEF.dog.spd[0],         '### 5.2 怪物一览');

// ---------------------------------------------------------------- 武器（计划 6.1）
C('手枪伤害',               26,  R.WEAPONS.pistol.dmg,      '### 6.1 武器');
C('手枪爆头伤害',          110,  R.WEAPONS.pistol.head.dmg, '### 6.1 武器');
C('手枪弹匣',               12,  R.WEAPONS.pistol.mag,      '### 6.1 武器');
C('手枪射速（秒）',        0.3,  R.WEAPONS.pistol.fireCd,   '### 6.1 武器');
C('霰弹枪弹丸伤害',         22,  R.WEAPONS.shotgun.dmg,     '### 6.1 武器');
C('霰弹枪弹丸数',            7,  R.WEAPONS.shotgun.pellets, '### 6.1 武器');
C('霰弹枪弹匣',              6,  R.WEAPONS.shotgun.mag,     '### 6.1 武器');

// ---------------------------------------------------------------- 移动与噪音（计划 7.1、7.3）
C('行走速度',              120,  R.PLAYER_SPEED.walk,       '### 7.1 移动与噪音');
C('奔跑速度',              215,  R.PLAYER_SPEED.run,        '### 7.1 移动与噪音');
C('奔跑噪音（格）',          6,  R.NOISE.run,               '### 7.1 移动与噪音');
C('开门噪音（格）',          4,  R.NOISE.doorOpen,          '### 7.1 移动与噪音');
C('关门噪音（格）',          3,  R.NOISE.doorClose,         '### 7.1 移动与噪音');
C('打碎玻璃噪音（格）',      8,  R.NOISE.glass,             '### 7.1 移动与噪音');
C('受伤减速：注意',       0.95,  R.STATUS_SPEED[1],         '### 7.1 移动与噪音');
C('受伤减速：危险',       0.88,  R.STATUS_SPEED[2],         '### 7.1 移动与噪音');
C('A 层门代价',              2,  R.NAV_DOOR_COST.A,         '### 7.3 寻路');
C('B 层门代价',              6,  R.NAV_DOOR_COST.B,         '### 7.3 寻路');
C('拍门撞开时间（秒）',      8,  R.DOOR_BASH_TIME,          '### 7.3 寻路');
C('拍门放弃距离（格）',     12,  R.DOOR_BASH_GIVEUP,        '### 7.3 寻路');

// ---------------------------------------------------------------- 背包（计划 7.5）
C('背包初始格数',            8,  R.INV_START,               '### 7.5 背包');
C('手枪弹堆叠上限',         60,  R.ITEMS.ammo_pistol.max,   '### 7.5 背包');
C('霰弹堆叠上限',           30,  R.ITEMS.ammo_shotgun.max,  '### 7.5 背包');
C('绿草药恢复量',           40,  R.ITEMS.herb_g.heal,       '### 6.4 恢复品');
C('绿+绿恢复量',           100,  R.ITEMS.mix_gg.heal,       '### 6.4 恢复品');

// ---------------------------------------------------------------- 性能（计划 8.3）
C('远处休眠距离（格）',     40,  R.SLEEP_DIST / 48,         '### 8.3 性能');

// ---------------------------------------------------------------- 通关评级（计划 7.7，config/rank.js）
// 暂定值：首次完整通关拿到真实时间后校准。改数字时两边一起改
C('评级 S 上限（分钟）',    50,  R.RANK.tiers[0][1] / 60,   '### 7.7 通关评级');
C('评级 A 上限（分钟）',    75,  R.RANK.tiers[1][1] / 60,   '### 7.7 通关评级');
C('评级 B 上限（分钟）',   105,  R.RANK.tiers[2][1] / 60,   '### 7.7 通关评级');
C('存档免罚次数',            5,  R.RANK.savePenalty.free,   '### 7.7 通关评级');
C('存档罚时（秒）',         60,  R.RANK.savePenalty.per,    '### 7.7 通关评级');
C('治疗免罚次数',            5,  R.RANK.healPenalty.free,   '### 7.7 通关评级');
C('治疗罚时（秒）',         30,  R.RANK.healPenalty.per,    '### 7.7 通关评级');

// ---------------------------------------------------------------- 执行
let bad = 0, pend = 0;
const eq = (a, b) => Math.abs(Number(a) - Number(b)) < 1e-9;

console.log('数值契约检查\n');
for (const r of rows) {
  if (eq(r.expect, r.actual)) continue;
  const tag = r.status === 'pending' ? '⚠️ 待裁决' : '✗ 不一致';
  if (r.status === 'pending') pend++; else bad++;
  console.log(`${tag}  ${r.name}：契约写 ${r.expect}，代码是 ${r.actual}   ← ${r.section}`);
}

console.log('');
if (bad) {
  console.error(`数值契约：${bad} 处不一致${pend ? `，另有 ${pend} 处待裁决` : ''}`);
  process.exit(1);
}
console.log(`数值契约通过（${rows.length} 条）${pend ? `，${pend} 处待裁决（不影响通过）` : ''}`);
