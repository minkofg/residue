'use strict';
// 试玩跳转：一键跳到切片的各个节点，免得每测一次 30 秒的内容都要重跑 5 分钟前置流程。
//
// ⚠️ 这是给测试用的。开关分两层：
//   1. PLAYTEST_WARP_SOURCE：源码开关。`npm run build:release` 生成 残响之馆.html 时自动改成 false。
//   2. 打包版 exe（Electron 且 app.isPackaged）运行时强制关闭 —— 不管源码开关是什么。
//      exe 直接加载 src/，不经过 build:release，所以只靠第 1 层会把跳转带进 exe（v3.5 修复）。
//   tools/sim-tests.js 里有测试盯着这两层。
const PLAYTEST_WARP_SOURCE = true;
const PLAYTEST_WARP = PLAYTEST_WARP_SOURCE && !isPackagedApp();

// 打包版判断：preload 同步暴露 residueAPI.isDev（= !app.isPackaged）。浏览器里没有 residueAPI → 不是打包版。
function isPackagedApp() {
  return typeof window !== 'undefined' && !!window.residueAPI && window.residueAPI.isDev === false;
}

// at   : 落点（格坐标，可带小数）
// a    : 落地时的朝向（弧度，缺省朝下 = 进门的方向）
// keys : 直接塞进背包的钥匙
// open : 直接解锁并打开的门（跳过前置流程时，别让玩家被自己跳过的锁挡住）
// flags: 直接置上的剧情标记
// give : 补给（弹药 / 药草 / 霰弹枪），跳到后期节点时总不能空着手
// safes: 直接标成「已经打开过」的密码柜（奖励已经放进 give 里了）
// took : 这些房间里散落的补给当作已经捡过（已经算进 give 里了），免得跑回去再捡一遍、比正常流程多一截
//        （文件、配件、机关不算：文件照样能看，藏着的配件照样能找）
// fired: 直接标成「已触发过」的触发器。跳到流程中段时必须用 ——
//        否则一落地就会把已经发生过的剧情（比如后庭院的 90 秒倒计时）重新播一遍
// objective: 落地时该显示的目标（applyWarp 会清空目标，这里补回当时该有的那句）
// boss : 把处刑者放到这个位置，测追逐战和结局时要用
// map  : 目标地图（缺省 map1）。和当前地图不同就先直接切过去（不播读取过场）
// id   : 名字（测试和 warpById 用它找落点，不要写死下标）
// 快捷键不写在落点里：当前这一批（WARP_STAGE）按顺序自动排成 Shift+1…5。
//
// ── 分批测试 ──
// 用户按地图逐张测试：先测地图 1，测完改地图 2，再改地图 3。Shift+1…5 只挂当前这一批。
// 换批只改 WARP_STAGE 这一行（sim-tests 有一项检查当前是哪一批，一起改）。
// 其余批次的落点照样留着，自动测试用 warpById 直接套用（原来的 tools/warp-fixtures.js 已并进来）。
const WARP_STAGE = 'map3';   // 地图 1、2 已测完（用户确认），现在测地图 3

// 各节点跳过的触发器（按流程累加）：只放「进房间 / 靠近 / 捡钥匙」这类会自己再触发的。
// 不放的话，落地后走进图书室之类的地方会把目标提示改回前面的那句。
// flag 类触发器（bustsSolved 等）不用放：跳转直接改 S.flags，不会派发 flag 事件。
const M1_NORTH = ['intro', 'sword_locked', 'sword_key', 'north_reached'];
const M1_YARD = [...M1_NORTH, 'gallery_enter', 'gallery_hint', 'library_enter', 'armor_key', 'lab_enter', 'shield_key', 'passage_enter'];
const M1_CRASH = [...M1_YARD, 'yard_enter'];
const M2_FUSES = ['m2_arrive', 'm2_sec', 'm2_tanks', 'm2_fuseA', 'm2_fuseB', 'm2_fuseC'];
const M3_PLANT = ['m3_arrive', 'm3_admin', 'm3_pass', 'm3_chem', 'm3_glammo', 'm3_green', 'm3_glcase', 'm3_gl', 'm3_plant'];
const M3_BEFORE_PLANT = ['m3station', 'm3yard', 'm3admin', 'm3chem', 'm3green'];

const WARP_SETS = {
  map1: [
    { id: 'start', name: '宅邸 · 开局（主厅）', at: null },   // null = 关卡真正的出生点
    // 剑之钥匙已用、北门开着：落在北门里，往北就是画廊
    { id: 'gallery', name: '宅邸 · 画廊（半身像谜题）', at: [32, 22.5], a: -Math.PI / 2,
      keys: ['sword'], open: [[32, 29], [32, 24]], flags: ['hasSwordHint'], fired: M1_NORTH,
      objective: '▲ 探索北翼',
      give: { ammo: 40, herb: 1 } },
    // 三把钥匙都在手：落在后庭院入口，一落地就是无线电 → 处刑者 → 90 秒倒计时
    { id: 'yard', name: '宅邸 · 后庭院（处刑者登场、撑 90 秒）', at: [44, 17], a: -Math.PI / 2,
      keys: ['sword', 'armor', 'shield'], open: [[32, 29], [32, 24], [48, 37], [42, 26]],
      flags: ['hasSwordHint', 'bustsSolved'], fired: M1_YARD,
      objective: '▲ 从后庭院撤离',
      give: { ammo: 60, shells: 20, herb: 2, shotgun: true } },
    // 直升机已经坠毁、处刑者就在院子里：第一章后半段的起点（被追回宅邸，找两枚徽章）
    { id: 'crash', name: '宅邸 · 直升机坠毁（被追、找两枚徽章）', at: [44, 17], a: -Math.PI / 2,
      keys: ['sword', 'armor', 'shield'], open: [[32, 29], [32, 24], [48, 37], [42, 26], [25, 12]],
      flags: ['hasSwordHint', 'bustsSolved', 'yardStarted', 'heliDown'], fired: M1_CRASH,
      objective: '▲ 回到宅邸，找到通往地下的路',
      boss: [52, 12],
      give: { ammo: 40, shells: 10, herb: 1, shotgun: true } },
    // 两枚徽章都在手上，站在主厅雕像前：测开门演出、处刑者跳下来、酒窖和升降梯
    { id: 'statue', name: '宅邸 · 主厅雕像（徽章在手 → 酒窖、升降梯）', at: [32.5, 37.5], a: -Math.PI / 2,
      keys: ['sword', 'armor', 'shield', 'lion', 'snake'], open: [[32, 29], [32, 24], [48, 37], [42, 26], [25, 12]],
      flags: ['hasSwordHint', 'bustsSolved', 'yardStarted', 'heliDown', 'bedroomSafeOpen'],
      fired: [...M1_CRASH, 'lion_medal', 'snake_medal'],
      objective: '▲ 找到狮之徽章和蛇之徽章，放回主厅雕像',
      give: { ammo: 30, shells: 6, herb: 1, shotgun: true } },
  ],
  // 地图 2：电梯厅 → 三个保险丝（宿舍 / 污水区 / 培养槽区）→ 配电箱来电、收容区放出舔舐者 → 冷冻库（可选：麦林）→ 主控室刷卡 → 站台上车
  // 补给按「正常玩到这里大概剩多少」给：刚下来只有手枪和霰弹枪；冲锋枪在宿舍储物柜里，拿到保险丝的时候才算有
  map2: [
    { id: 'm2', map: 'map2', name: '研究所 · 电梯厅（断电，刚下升降梯）', at: null, follow: 15,
      flags: ['chapter1Done'], objective: '▲ 恢复电力（找到三个保险丝）', fired: ['m2_arrive'],
      give: { ammo: 30, shells: 8, herb: 1, shotgun: true } },
    { id: 'm2sewer', map: 'map2', name: '研究所 · 污水区（淤泥体、ID 卡）', at: [15, 36.5], follow: 15, a: Math.PI / 2, keep: ['slime'],
      flags: ['chapter1Done'], fired: ['m2_arrive'], objective: '▲ 恢复电力（找到三个保险丝）',
      give: { ammo: 30, shells: 8, herb: 1, shotgun: true } },
    // 三个保险丝、ID 卡都拿到了，冲锋枪也从宿舍储物柜里拿了：站在配电箱前，按 E 就来电
    { id: 'm2fuses', map: 'map2', name: '研究所 · 配电箱（三个保险丝在手 → 来电）', at: [40.5, 38.5], a: -Math.PI / 2, follow: 15,
      keys: ['fuseA', 'fuseB', 'fuseC', 'idcard'], safes: ['dormLocker'],
      flags: ['chapter1Done', 'dormLockerOpen'], fired: M2_FUSES, objective: '▲ 恢复电力（找到三个保险丝）',
      give: { ammo: 30, shells: 10, herb: 1, shotgun: true, smg: true, smgAmmo: 40 } },
    // 已来电：舔舐者在收容区，处刑者在西边的主走廊 —— 测阀门谜题，或者把它引进液氮喷口
    { id: 'm2freeze', map: 'map2', name: '研究所 · 冷冻库（阀门谜题 / 冻住处刑者）', at: [44, 27.5], a: -Math.PI / 2, boss: [12, 33],
      keys: ['idcard'], safes: ['dormLocker'], fuses: true, open: [[44, 31], [60, 31], [60, 35]],
      flags: ['chapter1Done', 'dormLockerOpen', 'm2Power'], fired: [...M2_FUSES, 'm2_power'], objective: '▲ 前往主控室，启动货运列车',
      spawn: [['licker', 58, 41], ['licker', 63, 41]],   // 来电时收容区放出来的两只（跳过了那段触发器，这里补上）
      give: { ammo: 30, shells: 10, herb: 1, shotgun: true, smg: true, smgAmmo: 40 } },
    // 站在主控室控制台前，ID 卡在手（麦林也拿了）：按 E 刷卡 → 站台闸门打开、列车预热 60 秒 → 15 秒后处刑者直奔站台
    { id: 'm2train', map: 'map2', name: '研究所 · 主控室（刷卡 → 列车预热 → 上车）', at: [58.5, 21.5], a: -Math.PI / 2, follow: 15,
      keys: ['idcard'], safes: ['dormLocker'], fuses: true, open: [[44, 31], [60, 31], [60, 35]],
      flags: ['chapter1Done', 'dormLockerOpen', 'm2Power', 'valvesSolved', 'magnumTaken'], fired: [...M2_FUSES, 'm2_power'],
      objective: '▲ 前往主控室，启动货运列车',
      spawn: [['licker', 60, 33], ['licker', 61, 41]],   // 一只已经爬到主走廊（主控室门外），一只还在收容区
      give: { ammo: 30, shells: 10, herb: 1, shotgun: true, smg: true, smgAmmo: 40, magnum: true } },
  ],
  map3: [
    // 地图 3：货运站 → 行政楼（通行证）→ 化学仓库（膨胀者、燃烧榴弹）→ 温室（补光灯谜题、榴弹发射器）→ 生产车间（猎手）
    //        → 焚化炉（把处刑者引上吊桥、倒钢水 → 暴走形态 Boss 战）→ 控制塔（J）→ 终点站台（拉撒路三个阶段）→ 跳上列车
    // 补给按「正常玩到这里大概剩多少」给（换批时逐项核过）：
    //   · 刚下车 = 地图 2 结束时的身家：手枪、霰弹枪、冲锋枪、麦林（满匣 6 发，没有备弹）。榴弹发射器在温室才有
    //   · 手雷整个游戏第一颗在生产车间；闪光弹地图 2 一颗、装卸区一颗、车间一颗；麦林备弹第一次出现在车间
    //   · 酸液榴弹在控制塔和站台上（专打拉撒路），焚化炉之前没有
    { id: 'm3', map: 'map3', name: '制药厂 · 货运站（起点）', at: null, follow: 20,
      flags: ['chapter1Done', 'chapter2Done'], give: { ammo: 30, shells: 10, herb: 1, shotgun: true, smg: true, smgAmmo: 40, magnum: true } },
    // M4-1：生产车间（猎手）。落在温室东墙那扇门里面，前面的锁、谜题都当作已经解开
    { id: 'plant', map: 'map3', name: '制药厂 · 生产车间（猎手）', at: [44.5, 35.5], a: 0, follow: 20,
      keys: ['pass'], open: [[12, 28], [42, 36], [67, 34]], took: M3_BEFORE_PLANT,
      flags: ['chapter1Done', 'chapter2Done', 'growSolved', 'glTaken'], fired: M3_PLANT,
      objective: '▲ 穿过生产车间，去东边的焚化炉车间',
      give: { ammo: 40, shells: 14, herb: 2, shotgun: true, smg: true, smgAmmo: 50, magnum: true, gl: 3, flashbang: 2 } },
    // M4-3：焚化炉车间。落在吊桥北头的钢水闸旁边；处刑者从南边（车间门那头）追过来，正好要过吊桥
    { id: 'furnace', map: 'map3', name: '制药厂 · 焚化炉（Boss 战一）', at: [77.5, 25.5], a: Math.PI / 2,
      keys: ['pass'], open: [[12, 28], [42, 36], [67, 34]], took: [...M3_BEFORE_PLANT, 'm3plant'],
      flags: ['chapter1Done', 'chapter2Done', 'growSolved', 'glTaken'], fired: [...M3_PLANT, 'm3_furnace'],
      objective: '▲ 把处刑者引上吊桥，然后拉下钢水闸（吊桥北头）', boss: [79, 38],
      give: { ammo: 40, shells: 12, herb: 4, shotgun: true, smg: true, smgAmmo: 40, magnum: true, magAmmo: 3, gl: 3, glBomb: 2, grenade: 1, flashbang: 2 } },
    // M4-4：控制塔（安全屋，J 登场）。暴走处刑者已经打倒；塔里的补给（麦林子弹、酸液榴弹）还在地上，自己捡
    { id: 'tower', map: 'map3', name: '制药厂 · 控制塔（J、最终战前）', at: [77.5, 13.5], a: -Math.PI / 2, execDone: true,
      keys: ['pass'], open: [[12, 28], [42, 36], [67, 34], [75, 17]], took: [...M3_BEFORE_PLANT, 'm3plant', 'm3furnace'],
      flags: ['chapter1Done', 'chapter2Done', 'growSolved', 'glTaken', 'execMutated', 'berserkDead'],
      fired: [...M3_PLANT, 'm3_furnace', 'm3_mutate', 'm3_berserkDead'],
      objective: '▲ 去控制塔（焚化炉车间北门）启动列车',
      give: { ammo: 30, shells: 8, herb: 3, shotgun: true, smg: true, smgAmmo: 30, magnum: true, magAmmo: 3, gl: 2, grenade: 1, flashbang: 1 } },
    // M4-4：直接跳到拉撒路阶段三（肉块 + J 丢电磁炮）
    { id: 'lazarus3', map: 'map3', name: '制药厂 · 终点站台（拉撒路阶段三、电磁炮）', at: [60.5, 50.5], a: 0, execDone: true, lazPhase: 3,
      keys: ['pass'], open: [[12, 28], [42, 36], [67, 34], [75, 17]], took: [...M3_BEFORE_PLANT, 'm3plant', 'm3furnace', 'm3tower'],
      flags: ['chapter1Done', 'chapter2Done', 'growSolved', 'glTaken', 'execMutated', 'berserkDead', 'jMet', 'trainStarted'],
      fired: [...M3_PLANT, 'm3_furnace', 'm3_mutate', 'm3_berserkDead', 'm3_tower', 'm3_train', 'm3_platform', 'm3_laz2', 'm3_laz3'],
      objective: '▲ 躲开脚下的触手，远离被腐蚀的地面',
      give: { ammo: 30, shells: 8, herb: 3, shotgun: true, smg: true, smgAmmo: 30, magnum: true, magAmmo: 6, gl: 2, grenade: 1, flashbang: 1 } },
  ],
};
// 按快捷键跳过去时额外塞的药（用户要求「跳图的时候多给点药，不用我自己去拿」）。只在试玩跳转里给，正式流程不受影响。
// 用混合好的草药：一格就是一次满血，不占一堆格子；蓝草药解猎手 / 膨胀者的毒
const WARP_HEAL_BONUS = [['mix_gr', 2], ['mix_gg', 2], ['spray', 2], ['herb_b', 2]];
const WARP_STAGE_NAME = { map1: '地图 1 宅邸', map2: '地图 2 研究所', map3: '地图 3 制药厂' };
const WARPS = WARP_SETS[WARP_STAGE].map((w, i) => ({ ...w, code: `Shift+${i + 1}` }));   // 当前这一批 = 快捷键
const ALL_WARPS = Object.values(WARP_SETS).flat();
const warpIdx = id => WARPS.findIndex(w => w.id === id);
const warpById = id => ALL_WARPS.find(w => w.id === id);

// 按快捷键跳转：先回到一局全新的游戏，再套落点。
// 以前是在当前进度上直接叠：连按两次多发一遍手雷、上一段的处刑者 / 计时器 / 标记跟着带过去，
// 同一个快捷键每次测出来的状态都不一样。现在每次都一样。
function warpHotkey(i) {
  if (!PLAYTEST_WARP || mode !== 'play' || !WARPS[i]) return;
  S = newState(); buildMap(); renderMap(); resetTransient();
  applyWarp(i);
}

function applyWarp(i) {
  if (!PLAYTEST_WARP) return;
  const w = typeof i === 'object' ? i : WARPS[i];   // 下标 = 当前这一批的快捷键；对象 = 直接套落点（其他批次，测试用 warpById 取）
  if (!w || mode !== 'play') return;
  // 目标在别的地图：先切过去（立即完成，不播过场）
  const target = w.map || 'map1';
  if (S.map !== target) gotoLevel(target, null, null, true);
  const p = S.p;
  if (w.fuses) S.fuses = { fuseA: true, fuseB: true, fuseC: true };

  // 先把跳过的门打开，再落地 —— 顺序反了的话玩家会卡在自己没开的锁后面
  for (const k of w.keys || []) p.keys[k] = true;
  for (const [x, y] of w.open || []) {
    const dk = doorKey(x, y);
    if (!S.unlocked.includes(dk)) S.unlocked.push(dk);
    if (grid[y * MW + x] === 3) grid[y * MW + x] = 2;
    setDoorOpen(x, y, true);
    drawTileAt(x, y);
  }
  // 发了的钥匙，地图上那一把就当已经捡过（否则再捡一次会把「捡钥匙」的剧情重播一遍，比如冷库的伏击）
  for (const it of S.items) if (it.t === 'key' && (w.keys || []).includes(it.v)) it.taken = true;
  // safes：这些密码柜当作已经打开过（奖励由 give 发），免得再开一次多拿一份
  for (const it of S.items) if (it.t === 'safe' && (w.safes || []).includes(it.v)) it.open = true;
  if (w.took) {
    const rs = LEVEL.rooms.filter(r => w.took.includes(r.id));
    for (const it of S.items) {
      if (isProp(it.t) || it.t === 'file' || it.t === 'key' || it.t === 'mod' || it.t === 'shotgun' || it.t === 'smg' || it.t === 'magnum') continue;
      const tx = Math.floor(it.x / T), ty = Math.floor(it.y / T);
      if (rs.some(r => tx >= r.x && tx < r.x + r.w && ty >= r.y && ty < r.y + r.h)) it.taken = true;
    }
  }
  for (const f of w.flags || []) S.flags[f] = true;
  for (const id of w.fired || []) S.fired[`${S.map}:${id}`] = true;

  const g = w.give || {};
  const v = inv();
  if (g.shotgun && !invHas('shotgun')) { invAdd(v, 'shotgun', 1); p.mag.shotgun = WEAPONS.shotgun.mag; }
  if (g.smg && !invHas('smg')) { invAdd(v, 'smg', 1); p.mag.smg = WEAPONS.smg.mag; p.wep = 'smg'; }
  if (g.smgAmmo) invAdd(v, 'ammo_smg', g.smgAmmo);
  if (g.gl && !invHas('gl')) { invAdd(v, 'gl', 1); p.mag.gl = 1; invAdd(v, 'ammo_fire', g.gl); p.glLoaded = 'fire'; }
  if (g.glBomb) invAdd(v, 'ammo_bomb', g.glBomb);
  if (g.glAcid) invAdd(v, 'ammo_acid', g.glAcid);
  if (g.magnum && !invHas('magnum')) { invAdd(v, 'magnum', 1); p.mag.magnum = WEAPONS.magnum.mag; }
  if (g.magAmmo) invAdd(v, 'ammo_magnum', g.magAmmo);
  if (g.grenade) invAdd(v, 'grenade', g.grenade);
  if (g.flashbang) invAdd(v, 'flashbang', g.flashbang);
  if (g.ammo) invAdd(v, 'ammo_pistol', g.ammo);
  if (g.shells) invAdd(v, 'ammo_shotgun', g.shells);
  if (g.herb) invAdd(v, 'herb_g', g.herb);
  for (const [id, n] of WARP_HEAL_BONUS) invAdd(v, id, n);   // 试玩跳转多给的药
  p.hp = 100;

  const at = w.at || [LEVEL.start.x, LEVEL.start.y];
  p.x = at[0] * T; p.y = at[1] * T;
  p.a = w.a !== undefined ? w.a : (LEVEL.start.a ?? -Math.PI / 2);
  p.vx = p.vy = 0;
  cam.x = p.x - W / 2; cam.y = p.y - H / 2;

  // 跳过去之后不该留着上一段的目标提示和倒计时
  S.objective = w.objective || null;
  S.countdown = null;
  S.cine = 0; S.cineThen = null;
  S.enemies = S.enemies.filter(e => !e.dead && (w.keep ? w.keep.includes(e.t) || dist(e.x, e.y, p.x, p.y) > 400 : dist(e.x, e.y, p.x, p.y) > 400));   // keep：这些种类即使在附近也留着（就是来测它们的）
  for (const [t, x, y] of w.spawn || []) S.enemies.push(mkEnemy(t, x, y));
  if (w.execDone) {   // 焚化炉之后：追踪形态已经不存在
    const D = S.executioner = S.executioner || freshExecutioner();
    D.done = true; D.active = false; D.follow = null; S.enemies = S.enemies.filter(e => e.t !== 'boss');
  }
  if (w.boss) { P.room = -1; spawnExecutioner(w.boss[0], w.boss[1]); }
  if (w.lazPhase) { P.room = curRoom(); warpLazarus(w.lazPhase); }
  // follow：处刑者已经在追你了，几秒后从这张图的入口（电梯井）砸下来 —— 和正式流程一致
  if (w.follow && !w.execDone && !activeExecutioner()) {
    const D = S.executioner = S.executioner || freshExecutioner();
    D.spawned = D.active = true; D.follow = { map: S.map, left: w.follow };
  }
  // 重放某个触发器（比如后庭院开场），并把它的倒计时缩短到 countdown 秒
  if (w.trigger) {
    const t = (LEVEL.triggers || []).find(t => t.id === w.trigger);
    if (t) {
      S.fired[`${S.map}:${t.id}`] = true;
      S.timers = S.timers.filter(x => x.map !== S.map);
      S.enemies = S.enemies.filter(e => e.t !== 'boss'); S.pod = null; S.crash = null;
      P.room = curRoom(); runActions(t.do, `warp:${t.id}`);
      if (w.countdown && S.countdown) S.countdown.left = w.countdown;
    }
  }
  msg(`[试玩跳转] ${w.name}`, 3);
  sfx('save', 0.6);
}
