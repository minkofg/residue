'use strict';
// 处刑者（追踪形态）与导演系统的全部参数（计划 3.1–3.4、3.6）。调手感只改这里，不用碰代码。
// 距离单位：写“格”的是格子数（1 格 = 48 像素），写“px”的是像素；时间单位是秒。

// ---------------------------------------------------------------- 处刑者本身
const EXEC = {
  // 感知：以听觉为主。看见 = 视线 450px 以内 + 身体朝向前方 120° + 中间没有墙和关着的门；背后只靠听觉。
  sightDist: 450, fov: 120,
  closeSense: 70,        // 贴身时不管朝向都能察觉（px）
  loseSight: 4,          // 追击中连续看不见玩家这么久 → 转为“追踪”，去最后看见的位置
  lookAround: 3,         // 到达噪音地点 / 房间后环顾多久
  // 打倒（不能被杀死）
  knockdown: 20,         // 单膝跪地多久
  threshold: 400, thresholdGrow: 1.15, thresholdMax: 700,  // 累计伤害阈值；每次打倒后 +15%，上限 700
  midStagger: 200, midStaggerT: 1.4,                        // 每个打倒周期内累计到 200 踉跄一次
  // 冲刺：惩罚“站着不动瞄准”
  dash: { minDist: 3, maxDist: 7, every: 6, chance: 0.35, speed: 260, time: 0.8, tell: 0.35, dmg: 30 },
  // 重拳：前摇 0.6 秒可以躲；击退 60px（分步移动，不会打进墙里）
  punch: { dmg: 35, windup: 0.6, rec: 1.0 },
  // 抓取：前摇 0.8 秒，手臂发红光并有音效；小刀冷却好了会自动反击挣脱（之后小刀要等 counterKnifeCd 秒）
  grab: { dmg: 45, windup: 0.8, chance: 0.3, rec: 1.4, counterStun: 1.6, counterKnifeCd: 6 },
  guard: [8, 15],        // 玩家躲进安全屋 → 在门外守候这么久，然后转去别处搜索
  grace: 20,             // 玩家离开安全屋后的宽限期：只能靠看见 / 听见发现玩家，也不会被瞬移过来（第 11 节已确认 20 秒）
  stuck: 2.5,            // 卡住（想走但几乎没动）这么久就换一个搜索目标
  trample: 0.35,         // 挡路的僵尸被它推开时的硬直
  shakeDist: 6,          // 脚步声在多少格以内会让镜头轻微震动
};

// ---------------------------------------------------------------- 导演系统（隐藏的紧张度 0–100）
const DIRECTOR = {
  looseDist: 25, looseTime: 60,      // 太松：连续 60 秒离玩家超过 25 格（路径距离）→ 瞬移到玩家看不见的相邻区域
  teleportMin: 7, teleportMax: 16,   // 瞬移落点离玩家的路径距离（格）
  tightTime: 90,                     // 太紧：连续追击超过 90 秒 → 主动失去目标
  retreatDist: 15, retreat: [30, 60],// 转去 15 格以外的区域搜索 30–60 秒（不会离开当前地图）
  retreatNotice: 2.5,                // 撤离期间只有贴到这么近（格）才会重新发现玩家
  afterKnockdown: 20,                // 起身后 20 秒内不触发“太松”的瞬移
  loadNear: 12, loadFar: 20, loadProtect: 30,  // 读档保护：离玩家不到 12 格就挪到 20 格以外看不见的地方；30 秒内不瞬移
  follow: [15, 25], followChased: [8, 12],    // 换地图后的喘息时间；换图时正被追击则缩短
  // 紧张度：越近、追得越久越高。只影响追击音乐的速度，不影响判定
  tensionNear: 25,                   // 路径距离在这么多格以内才开始增加
  tensionRise: 20, tensionFall: 6,   // 每秒最多上升 / 下降多少
};

// ---------------------------------------------------------------- 追击音乐（低频鼓点）
const CHASE_MUSIC = {
  fadeIn: 2.5,           // 进入追击后鼓点逐渐加入
  fadeOut: 8,            // 失去目标后 8 秒内淡出
  bpmLow: 84, bpmHigh: 132,  // 紧张度 0 → 100 对应的速度
  vol: 0.55,
};

// 新游戏时的处刑者 / 导演状态（存进存档）
//   chaseT 连续追击时间，looseT “太松”计时，protectT 不瞬移保护，graceT 离开安全屋的宽限期，
//   follow 换地图跟随 { map, left }，teleports / retreats 导演干预次数（调试和平衡用）
function freshExecutioner() {
  return { active: false, spawned: false, knockdowns: 0, nextThreshold: EXEC.threshold, maxThreshold: EXEC.thresholdMax, map: 'map1',
    tension: 0, chaseT: 0, looseT: 0, protectT: 0, graceT: 0, playerSafe: false, follow: null, teleports: 0, retreats: 0 };
}
