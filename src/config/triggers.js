'use strict';
// 各地图的事件脚本（触发器）。引擎在 game/triggers.js，这里只有数据。
//
// 触发器：{ id, on: {…}, if: {…}, once: true(默认), do: [动作…] }
//   on（什么时候）：
//     { enter: '房间id' }            进入某个房间
//     { enterSafe: true }            进入任意安全屋
//     { pickup: '道具类型', v: 值 }   拿到道具（v 可省略；钥匙的 v 是钥匙名）
//     { kill: '敌人类型' | 'any' }    打倒敌人
//     { flag: '标记名' }              某个标记刚被设为真（可以串联事件）
//     { near: [格x, 格y], r: 像素 }   玩家走到某处附近（每帧检查）
//   if（附加条件，可省略）：{ flags: [...都为真], notFlags: [...都为假], keys: [...都拿到], notKeys: [...都还没拿到] }
//
// 动作（每个对象一个动词，其余是参数）：
//   { msg: '文字', sec }                 屏幕下方提示
//   { banner: '文字' }                   屏幕中央大字
//   { sfx: '音效', at: [格x, 格y], v }   音效；给了 at 就按位置做立体声
//   { groan: [格x, 格y], v, max, min }   怪物低吼（立体声）
//   { spawn: [[类型, 格x, 格y], …], alert } 刷怪
//   { spawnWave: { t, points, maxAlive, area: [x0, y0, x1, y1], minDist } }
//                                         在随机刷怪点补怪：区域内活着的少于 maxAlive 才刷，离玩家太近的点不刷
//   { flag: '名' } / { unflag: '名' }    设置 / 清除标记
//   { after: 秒, do: [...] }             延时（游戏内计时器：暂停不走、随存档保存）
//   { every: 秒, first: 秒, until: '标记', do: [...] }  重复，直到标记为真
//   { countdown: { label, sec, do } }    屏幕上方显示倒计时，到 0 时执行 do
//   { objective: '文字' | null }          屏幕上方的闪烁目标提示
//   { executioner: [格x, 格y] }          处刑者登场
//   { unlock: [格x, 格y] } / { openDoor: [格x, 格y] }
//   { goto: '地图id', at: [格x, 格y], a } 切换地图
//   { run: '脚本名' }                     执行本地图 scripts 里的一段动作
//   { shake: 强度 }                       震屏
//   { win: true }                         通关
// 写错动词、房间名、敌人类型或脚本名，`npm test` 会指出是哪一条。

LEVELS.map1.scripts = {
  // 拿到盾之钥匙 1.5 秒后：楼上玻璃碎裂，东侧走廊出现两只僵尸和一只狗
  // 拿到剑之钥匙：冷库门外的厨房里涌进来两只，逼玩家从冷库这个死胡同里杀出去
  coldAmbush: [
    { flag: 'coldAmbushFired' },
    { sfx: 'door', at: [4, 20] },
    { msg: '外面传来拖沓的脚步声——有东西被钥匙的响动引过来了。', sec: 5 },
    { spawn: [['zombie', 4, 23], ['zombie', 3, 25]], alert: true },
    { groan: [4.5, 24.5], v: 0.9, max: 900, min: 0.3 },
    { shake: 4 },
  ],
  // 直升机坠毁。第一章后半段从这里开始 —— 路被堵死了，只能往下走
  // 直升机坠毁：它从地上掀起一块大石头甩出去，正中尾梁。整段动画在 game/events.js（{ crash: true }）。
  // 砸地那一刻（演出第 4.2 秒）才设 heliDown、出横幅；下面的延时从演出开始算
  heliCrash: [
    { crash: true },
    { after: 7.5, do: [
      { msg: '【无线电】……林岚……机组……没了……宅邸地下……研究所……有货运列车……', sec: 6 },
    ] },
    { after: 11.0, do: [
      { objective: '▲ 回到宅邸，找到通往地下的路' },
    ] },
  ],
  ambush: [
    { flag: 'ambushFired' },
    { spawn: [['zombie', 40, 35], ['zombie', 52, 35], ['dog', 46, 34]] },
    { msg: '……楼上传来玻璃碎裂的声音。' },
    { groan: [46.5, 34.5], v: 0.8, max: 1400, min: 0.25 },
  ],
};

LEVELS.map1.triggers = [
  // ★ 可打碎的窗户：拿着剑之钥匙回主厅，路过西侧走廊时一只狗撞碎南墙的窗户扑进来
  { id: 'window_dog', on: { near: [19.5, 34.5], r: 110 }, if: { keys: ['sword'] }, do: [
    { breakWindow: 'wcor2' }, { shake: 5 },
    { spawn: [['dog', 20, 35]], alert: true },
    { msg: '玻璃炸开——有东西从窗外扑了进来！', sec: 4 },
  ] },
  { id: 'music_enter', on: { enter: 'music' }, if: { notFlags: ['lightMusic'] }, do: [
    { msg: '一片漆黑。门边的墙上好像有个开关。', sec: 4 },
  ] },
  { id: 'shed_enter', on: { enter: 'shed' }, do: [
    { msg: '园丁的小屋。门闩很结实 —— 这里是安全的。', sec: 4 },
  ] },
  // 开场：出生点就该有方向。原本开局 objective 是 null，玩家第一眼没有任何指引。
  { id: 'intro', on: { near: [32.5, 37.5], r: 150 }, do: [
    { objective: '▲ 找到离开宅邸的路' },
  ] },

  { id: 'safe_first', on: { enterSafe: true }, do: [{ msg: '这里很安静……感觉暂时安全了。' }] },

  { id: 'shield_key', on: { pickup: 'key', v: 'shield' }, do: [
    { objective: '▲ 带着盾之钥匙前往后庭院' },
    { after: 1.5, do: [{ run: 'ambush' }] },
  ] },

  // ── 垂直切片第一段：厨房 → 冷库 → 剑之钥匙 ──────────────────────────
  // 主厅北门锁着时给个方向，别让玩家在西翼瞎转
  { id: 'sword_locked', on: { near: [32, 30], r: 70 }, if: { notFlags: ['hasSwordHint'], notKeys: ['sword'] }, do: [
    { flag: 'hasSwordHint' },
    { msg: '门锁着，锁孔上方刻着一把剑。管家的记录提到过厨房。', sec: 5 },
    { objective: '▲ 去西翼找剑之钥匙' },
  ] },

  { id: 'kitchen_enter', on: { enter: 'kitchen' }, do: [
    { msg: '一股腐坏的油脂味。灶台上的锅早就烧干了。', sec: 4 },
    { sfx: 'step', v: 0.3 },
  ] },

  // 冷库是个 5×5 的死胡同，进去之前先给一次预警——计划 §10「惩罚叠加导致挫败」的对策
  { id: 'cold_door', on: { near: [4, 21], r: 60 }, if: { notFlags: ['coldWarned'] }, do: [
    { flag: 'coldWarned' },
    { msg: '冷库的门虚掩着。门缝里渗出白雾……还有味道。', sec: 5 },
    { groan: [3.5, 17.5], v: 0.55, max: 700, min: 0.2 },
  ] },

  { id: 'cold_enter', on: { enter: 'cold' }, do: [
    { banner: '冷 库' },
    { msg: '零下十八度。挂肉架上的东西已经分不出是什么了。', sec: 5 },
    { shake: 3 },
  ] },

  // 关键一拍：钥匙挂在门后，要转身才看得见（日记 f2 写明了）
  { id: 'sword_key', on: { pickup: 'key', v: 'sword' }, do: [
    { objective: '▲ 回到主厅，打开北门' },
    { after: 1.2, do: [{ run: 'coldAmbush' }] },
  ] },

  // 目标达成就要收掉提示。少了这一条，「回到主厅，打开北门」会一直闪到通关。
  { id: 'north_reached', on: { near: [32, 30], r: 70 }, if: { keys: ['sword'] }, do: [
    { msg: '剑形的锁芯咬合了。北门可以打开了。', sec: 4 },
    { objective: '▲ 探索北翼' },
  ] },

  // ── 垂直切片第二段：画廊半身像谜题 ──────────────────────────────────
  { id: 'gallery_enter', on: { enter: 'gallery' }, do: [
    { banner: '画 廊' },
    { msg: '天窗漏下一柱灰光，正照在地砖中央——地砖边缘刻着方位罗盘，上为北。四面墙下各立着一尊大理石半身像，底座刻着凹槽，它们是能转的。', sec: 7 },
  ] },

  // 解开的这一下是整个切片唯一的「解决了一件大事」时刻，必须够响。
  // 做法是一串有先后的动静，而不是一声响：
  //   四座像依次归位（咔、咔、咔、咔）→ 地砖轰鸣 + 强震 → 横幅 → 铁闩落下 → 门吱呀打开
  { id: 'busts_solved', on: { flag: 'bustsSolved' }, do: [
    { objective: null },
    // 1) 四声金属咔哒，从四个角依次传来——让玩家听出「是那四座在动」
    { sfx: 'key', v: 0.9, at: [32, 10] },
    { after: 0.18, do: [{ sfx: 'key', v: 0.9, at: [36, 15] }, { shake: 2 }] },
    { after: 0.36, do: [{ sfx: 'key', v: 0.9, at: [30, 21] }, { shake: 2 }] },
    { after: 0.54, do: [{ sfx: 'key', v: 0.9, at: [27, 15] }, { shake: 3 }] },
    // 2) 地砖下面的东西整个转起来：低吼级的轰鸣 + 一次真正的大震
    { after: 0.8, do: [
      { sfx: 'roar', v: 0.55 },
      { shake: 11 },
      { banner: '机 关 解 开' },
      { msg: '四道铜线同时亮起。整块地砖沉下去半寸，天窗的光柱里浮起一层灰。', sec: 6 },
    ] },
    // 3) 铁闩落下，门真的开了——声音定位在门上，告诉玩家「该往哪走」
    { after: 1.7, do: [
      { sfx: 'locked', v: 1, at: [25, 12] },
      { shake: 5 },
      { unlock: [25, 12] },
    ] },
    { after: 2.3, do: [
      { sfx: 'door', at: [25, 12] },
      { openDoor: [25, 12] },
      { msg: '西墙那扇门自己向内荡开了一道缝。', sec: 5 },
      { objective: '▲ 进入图书室' },
    ] },
    // 4) 动静这么大，当然会招来东西——奖励之后立刻恢复压迫感
    { after: 3.4, do: [{ groan: [31, 26], v: 0.7, max: 900, min: 0.2 }] },
  ] },

  // 撞了一次机关闩的门之后才给目标提示——没撞过的人不需要被剧透
  { id: 'gallery_hint', on: { near: [25, 12], r: 60 }, if: { notFlags: ['bustsSolved'] }, do: [
    { objective: '▲ 转动画廊的四座半身像' },
  ] },

  // ── 垂直切片第三段：图书室 → 私人实验室 → 后廊 → 后庭院 ────────────────
  // 这一段原本一个触发器都没有：玩家解完谜进了图书室，之后整条最长的路上
  // 没有任何目标指引。下面这串把目标链接通 —— 任何时刻都知道下一步去哪。
  { id: 'library_enter', on: { enter: 'library' }, do: [
    { banner: '图 书 室' },
    { msg: '四壁的书架一直顶到天花板。有人把其中一排推倒了，书散了一地。', sec: 5 },
    { objective: '▲ 在图书室找到铠甲钥匙' },
  ] },

  { id: 'armor_key', on: { pickup: 'key', v: 'armor' }, do: [
    { msg: '铠甲钥匙。研究报告里说，东翼私人实验室的铁门要用它。', sec: 5 },
    { objective: '▲ 前往私人实验室（东侧走廊尽头的铁门）' },
  ] },

  { id: 'lab_enter', on: { enter: 'lab' }, do: [
    { banner: '私 人 实 验 室' },
    { msg: '应急灯把一切染成青灰色。实验台上的东西还摆在原处，像是有人中途放弃了。', sec: 6 },
    { sfx: 'step', v: 0.25 },
    { objective: '▲ 找到盾之钥匙' },
    { after: 6, do: [{ msg: '墙边的低温柜开着。锁没有被砸，是从外面整整齐齐切开的 —— 柜子里六个样本槽，空了一个。', sec: 6 }] },
  ] },

  // 后廊：2 格宽的石头夹道，通往最后一程。
  // 这里不打架 —— 这一拍的任务是「让你在进门前就知道外面有什么」。
  { id: 'passage_enter', on: { enter: 'passage' }, do: [
    { banner: '后 廊' },
    { msg: '两侧是冰冷的石墙，只容两个人并肩。尽头的门缝里透进夜风，和一股铁锈味。', sec: 6 },
    { sfx: 'door', v: 0.35 },
    { objective: '▲ 从后庭院撤离' },
    // 门外那声闷响：预示后庭院有东西（f5 说赫里昂要把处刑者空投过来）
    { after: 1.6, do: [
      { groan: [52, 8], v: 0.85, max: 2000, min: 0.35, low: true },
      { shake: 3 },
      { msg: '门外某个很重的东西动了一下。地面跟着震了震。', sec: 5 },
    ] },
  ] },

  // 后庭院：无线电 → 2.5 秒后处刑者登场 → 90 秒倒计时，期间每 13 秒补怪 → 直升机降落
  { id: 'yard_enter', on: { enter: 'yard' }, do: [
    { flag: 'yardStarted' },
    { msg: '【无线电】……林岚？收到信号了！直升机 90 秒后抵达后庭院，坚持住！', sec: 6 },
    { sfx: 'locked' },
    { after: 1.2, do: [{ pod: [53, 7] }, { msg: '头顶传来螺旋桨声——另一架直升机投下了什么东西。', sec: 3 }] },
    { after: 2.5, do: [{ executioner: [52, 8] }] },
    { countdown: { label: '直升机抵达', sec: 90, do: [
      { flag: 'heli' },
      { sfx: 'heli' },
      { msg: '【无线电】看到你了！正在降落——', sec: 3 },
      { objective: null },
      { after: 1.6, do: [{ run: 'heliCrash' }] },
    ] } },
    { every: 13, first: 12, until: 'heliDown', do: [
      { spawnWave: { t: 'zombie', points: [[44, 3], [60, 3], [60, 18], [60, 10], [44, 8]], maxAlive: 4, area: [43, 0, 64, 20], minDist: 250 } },
    ] },
  ] },

  // ── 地图 1 后半段：徽章 → 主厅雕像 → 酒窖 → 升降梯 ──────────────────
  // 直升机坠毁后才给目标：之前玩家满脑子是「撑 90 秒」，不需要知道后面的事
  { id: 'lion_medal', on: { pickup: 'key', v: 'lion' }, do: [
    { msg: '日晷的指针底下压着一枚铜徽章，刻着一头狮子。', sec: 4 },
  ] },
  { id: 'snake_medal', on: { flag: 'bedroomSafeOpen' }, do: [
    { after: 0.2, do: [{ msg: '保险柜里除了弹匣，还有一枚刻着蛇的铜徽章。', sec: 4 }] },
  ] },
  { id: 'altar_hint', on: { near: [32.5, 36.5], r: 70 }, if: { flags: ['heliDown'], notFlags: ['medalsPlaced'] }, do: [
    { objective: '▲ 找到狮之徽章和蛇之徽章，放回主厅雕像' },
  ] },
  // 石板挪开：和半身像一样，是一串有先后的动静。而且整栋房子都听得见 —— 它也听得见
  { id: 'medals_placed', on: { flag: 'medalsPlaced' }, do: [
    { objective: null },
    { after: 0.4, do: [{ sfx: 'roar', v: 0.5 }, { shake: 9 }, { banner: '石 板 挪 开' }] },
    { after: 1.4, do: [
      { sfx: 'locked', at: [32, 40] }, { unlock: [32, 40] },
      { msg: '雕像连同底座往后滑开半步。南墙下的石板门松动了——一股潮湿的酒味从下面涌上来。', sec: 6 },
    ] },
    { after: 2.2, do: [{ sfx: 'door', at: [32, 40] }, { openDoor: [32, 40] }, { objective: '▲ 进入酒窖' }] },
    // 计划 3.5：放入最后一枚徽章时，它从二楼栏杆跳下来。落在主厅北侧，酒窖的门在南边 —— 往身后跑
    { after: 3.0, do: [{ leap: [32, 31] }] },
  ] },
  { id: 'cellar_enter', on: { enter: 'cellar' }, do: [
    { banner: '酒 窖' },
    { msg: '酒架上的瓶子大多碎了，地上黏糊糊的。最里面有一架运货的升降梯，铁栅门半开着。', sec: 6 },
    { objective: '▲ 乘升降梯前往地下' },
  ] },
  // 第一章结束 → 升降梯降到地图 2（拉撒路地下研究所）
  { id: 'lift_down', on: { flag: 'liftDown' }, do: [
    { objective: null },
    { cine: 6.5, lift: true },   // lift：林岚走进升降梯站好，镜头跟着她，画面随下降慢慢变暗（game/update.js）
    { after: 6.5, do: [{ goto: 'map2', at: [35.5, 41.5], a: -Math.PI / 2 }] },
    { flag: 'chapter1Done' },
    { sfx: 'door' }, { shake: 4 },
    { msg: '你拉上铁栅门，扳下拉杆。升降梯猛地一沉。', sec: 3 },
    { after: 2.2, do: [{ sfx: 'metal', v: 1 }, { shake: 3 }, { msg: '头顶那方灯光越来越小。缆绳在黑暗里吱呀作响。', sec: 3 }] },
    { after: 4.4, do: [{ groan: [32, 30], v: 1, max: 5000, min: 0.5, low: true }, { shake: 8 }, { msg: '上方传来一声巨响——它在砸酒窖的门。', sec: 3 }] },
  ] },
];

// ── 地图 1 精修：主卧保险柜（可选谜题）────────────────────────────────
LEVELS.map1.triggers.push(
  { id: 'bedroom_enter', on: { enter: 'bedroom' }, do: [
    { banner: '主 卧' },
    { msg: '床单被扯到了地上。床头台灯的灯泡一闪一闪，照着墙角那只铸铁保险柜。', sec: 6 },
  ] },
  // 打开保险柜的一拍：奖励之后给一点点回响，提醒玩家伊莱亚斯这条线还没完（地窖 → 后续地图）
  { id: 'bedroom_safe', on: { flag: 'bedroomSafeOpen' }, do: [
    { after: 1.2, do: [{ msg: '保险柜的内壁上用小刀刻着一行字：「他还在下面。」', sec: 5 }] },
  ] },
);
