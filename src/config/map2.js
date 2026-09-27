'use strict';
// 地图 2：拉撒路地下研究所（计划 4.2）。地图、道具、敌人、文件、事件都写在这一个文件里。
//
// 第一阶段（本轮）：骨架 + 电力机制
//   · 从酒窖升降梯下来 → 电梯厅。全图断电：只有红色应急灯，环境几乎全黑
//   · 三个保险丝（宿舍 / 污水区 / 培养槽区）插进电梯厅的配电箱 → 来电
//   · 来电：灯亮、电子门（冷冻库、主控室）解锁，但收容区的门也跟着自动打开 —— 里面的东西放出来了
//   · 主控室：ID 卡（污水区的「主任」身上）+ 电力 → 启动货运列车 → 货运站台 → 第二章结束（地图 3 以后接）
//   · 处刑者：换图后约 15–25 秒（被追着时 8–12 秒）从电梯井砸下来（execEntry）
// 后续阶段：舔舐者、淤泥体、积水减速、冲锋枪 / 麦林、冷冻库液氮谜题。

LEVELS.map2 = {
  id: 'map2', name: '拉撒路地下研究所', w: 72, h: 48,
  start: { x: 35.5, y: 41.5, a: -Math.PI / 2 },
  // 断电期间用红色应急灯的底色；flag 为真以后恢复正常（render/lighting.js）
  power: 'm2Power',
  rooms: [
    { id: 'm2lift',    name: '电梯厅',             x: 30, y: 36, w: 12, h: 9,  floor: 'lab',   amb: 0.96, ambOn: 0.75 },
    { id: 'm2sec',     name: '安保室（安全屋）',   x: 43, y: 38, w: 9,  h: 7,  floor: 'safe',  amb: 0.5,  safe: true },
    { id: 'm2cor',     name: '主走廊',             x: 6,  y: 32, w: 62, h: 3,  floor: 'tile',  amb: 0.97, ambOn: 0.85 },
    { id: 'm2dorm',    name: '员工宿舍',           x: 4,  y: 20, w: 12, h: 11, floor: 'carpet', amb: 0.97, ambOn: 0.85 },
    { id: 'm2sewer',   name: '污水处理区',         x: 4,  y: 36, w: 20, h: 10, floor: 'water', amb: 0.97, ambOn: 0.88, water: 0.7 },   // water：移动速度 ×0.7
    { id: 'm2tanks',   name: '培养槽区',           x: 18, y: 18, w: 16, h: 13, floor: 'lab',   amb: 0.96, ambOn: 0.8 },
    { id: 'm2freeze',  name: '冷冻库',             x: 38, y: 20, w: 12, h: 11, floor: 'frost', amb: 0.97, ambOn: 0.6 },
    { id: 'm2control', name: '主控室',             x: 52, y: 18, w: 14, h: 13, floor: 'lab',   amb: 0.97, ambOn: 0.65 },
    { id: 'm2bow',     name: 'B.O.W. 收容区',      x: 54, y: 36, w: 14, h: 10, floor: 'lab',   amb: 0.97, ambOn: 0.85 },
    { id: 'm2ncor',    name: '北通道',             x: 36, y: 14, w: 25, h: 3,  floor: 'stone', amb: 0.97, ambOn: 0.88 },
    { id: 'm2cargo',   name: '货运站台',           x: 24, y: 2,  w: 40, h: 11, floor: 'stone', amb: 0.97, ambOn: 0.8 },
  ],
  doors: [[35, 35], [42, 41], [10, 31], [14, 35], [26, 31], [44, 31], [60, 31], [60, 35], [58, 17], [48, 13]],
  // power / contain：没有钥匙道具，来电时由触发器解锁；idcard 在主控室里刷
  locks: { '44,31': 'power', '60,31': 'power', '60,35': 'contain', '48,13': 'cargo' },
  furn: [
    // 电梯厅：塌下来的电梯轿厢残骸（井口在西北角 —— 处刑者从这里下来）
    [30, 36, 3, 2, 'crate'],
    // 安保室：监控台
    [46, 38, 4, 1, 'desk'],
    // 宿舍：双层床和储物柜
    [5, 21, 2, 3, 'bed'], [5, 26, 2, 3, 'bed'], [12, 21, 3, 1, 'wardrobe'], [12, 27, 3, 1, 'desk'],
    // 污水区：沉淀池的护栏、管道
    [7, 39, 6, 2, 'tankpit'], [16, 39, 6, 2, 'tankpit'], [8, 43, 4, 1, 'crate'],
    // 培养槽区：两排培养槽
    [20, 20, 2, 2, 'tank'], [24, 20, 2, 2, 'tank'], [28, 20, 2, 2, 'tank'], [20, 26, 2, 2, 'tank'], [24, 26, 2, 2, 'tank'], [28, 26, 2, 2, 'tank'],
    // 冷冻库：冷柜
    [39, 21, 4, 1, 'freezer'], [45, 21, 4, 1, 'freezer'], [39, 27, 3, 1, 'freezer'],
    // 主控室：控制台
    [54, 19, 10, 1, 'counter'], [53, 24, 1, 4, 'desk'],
    // 收容区：收容舱
    [56, 38, 2, 2, 'tank'], [60, 38, 2, 2, 'tank'], [64, 38, 2, 2, 'tank'], [56, 43, 2, 2, 'tank'], [64, 43, 2, 2, 'tank'],
    // 货运站台：列车车厢（占北侧一整排）
    [26, 3, 36, 3, 'train'], [30, 9, 2, 1, 'crate'], [54, 10, 3, 1, 'crate'],
  ],
  lamps: [
    // 断电：零星的红色应急灯（noFlag：标记为真时熄灭）
    { room: 'm2lift', x: 38, y: 38, r: 150, a: 0.35, fl: 0.2, noFlag: 'm2Power', col: 'red' },
    { room: 'm2cor', x: 20, y: 33, r: 120, a: 0.3, noFlag: 'm2Power', col: 'red' },
    { room: 'm2cor', x: 52, y: 33, r: 120, a: 0.3, noFlag: 'm2Power', col: 'red' },
    { room: 'm2tanks', x: 26, y: 24, r: 160, a: 0.35, fl: 0.4, col: 'green' },   // 培养槽自己的备用电源，一直发着绿光
    { room: 'm2sec', x: 47, y: 41, r: 300, a: 0.8 },                              // 安保室有独立电源
    // 来电
    { room: 'm2lift', x: 36, y: 40, r: 280, a: 0.5, flag: 'm2Power' },
    { room: 'm2cor', x: 14, y: 33, r: 220, a: 0.4, flag: 'm2Power' }, { room: 'm2cor', x: 36, y: 33, r: 220, a: 0.4, flag: 'm2Power' }, { room: 'm2cor', x: 58, y: 33, r: 220, a: 0.4, flag: 'm2Power' },
    { room: 'm2freeze', x: 44, y: 25, r: 260, a: 0.55, flag: 'm2Power' },
    { room: 'm2control', x: 58, y: 24, r: 320, a: 0.6, flag: 'm2Power' },
    { room: 'm2bow', x: 61, y: 41, r: 260, a: 0.4, fl: 0.5, flag: 'm2Power' },
    { room: 'm2cargo', x: 44, y: 8, r: 460, a: 0.45, flag: 'trainReady' },
  ],
  exits: [],
  // 处刑者的剧情入口：电梯井（计划 3.6）
  execEntry: { x: 32, y: 39, msg: '头顶的电梯井传来金属撕裂声——它顺着缆绳砸了下来！' },
  windows: [],
};

// 地图 2 的钥匙：保险丝 ×3（插进配电箱就消耗掉）、ID 卡；三种机关门
Object.assign(KEYS, {
  fuseA:  { name: '保险丝（宿舍）',   col: '#d9a441', hint: '' },
  fuseB:  { name: '保险丝（污水区）', col: '#d9a441', hint: '' },
  fuseC:  { name: '保险丝（培养槽）', col: '#d9a441', hint: '' },
  idcard: { name: '主任的 ID 卡',     col: '#8fc0e0', hint: '' },
  power:   { name: '——', col: '#4a6a8a', puzzle: true, needs: ['fuseA', 'fuseB', 'fuseC'], hint: '电子门。读卡器的屏幕是黑的 —— 没有电。' },
  contain: { name: '——', col: '#8a3a3a', puzzle: true, needs: ['fuseA', 'fuseB', 'fuseC'], hint: '厚重的气密门，上面喷着「B.O.W. 收容区 —— 未经授权禁止入内」。门缝里有东西在呼吸。' },
  cargo:   { name: '——', col: '#6a6a4a', puzzle: true, needs: ['fuseA', 'fuseB', 'fuseC', 'idcard'], hint: '站台闸门。旁边的牌子写着：「列车调度由主控室统一控制」。' },
});
Object.assign(ITEMDEF, { fusebox: '配电箱', console: '控制台' });

LEVELS.map2.items = [
  // 电梯厅：配电箱（三个空插槽）+ 一份字条
  ['fusebox', 40, 37, 0], ['file', 34, 43, 'm2f1'],
  // 安保室（安全屋）
  ['typewriter', 45, 39, 0], ['herb', 44, 43, 1], ['file', 49, 39, 'm2f2'],
  // 宿舍：保险丝 A
  ['key', 14, 29, 'fuseA'], ['ammo', 8, 24, 6], ['file', 13, 22, 'm2f3'],
  // ★ 储物柜谜题：四位密码 0417 = 写信的人他妈的生日四月十七（月、日各两位）（信里写了日期，便条说密码就是它）
  ['safe', 15, 21, 'dormLocker'], ['file', 7, 29, 'm2f6'],
  // 污水区：保险丝 B + 主任的 ID 卡（在他身上 —— 先放在他倒下的位置旁边）
  ['key', 21, 44, 'fuseB'], ['key', 6, 44, 'idcard'], ['mod', 10, 44, 'shotgunBarrel'],   // ★ 配件：箱子后面的霰弹枪短枪管
  ['shells', 22, 37, 6], ['herb', 13, 42, 1],
  // 培养槽区：保险丝 C
  ['key', 32, 29, 'fuseC'], ['ammo', 19, 29, 12], ['file', 26, 24, 'm2f4'],
  // 冷冻库（来电后才进得去）：★ 液氮阀门谜题 → 麦林
  ['valve', 40, 24, 'A'], ['valve', 43, 24, 'B'], ['valve', 46, 24, 'C'], ['file', 48, 26, 'm2f7'], ['gunlocker', 43, 21, 0], ['ln2lever', 47, 29, 0],
  ['spray', 40, 29, 1], ['shells', 47, 23, 6],   // 麦林只给一匣（6 发）：它是王牌，不是主力
  // 主控室：列车控制台
  // B.O.W. 收容区：消音器（舔舐者的窝里 —— 走进去要轻手轻脚）
  ['mod', 61, 44, 'smgSilencer'], ['flash', 55, 44, 1],   // ★ 闪光弹：闪不到瞎子，但扔出去那一声能把舔舐者引开
  // 货运站台：列车车门（预热结束才能上车）
  ['traindoor', 44, 6, 0],
  ['console', 58, 20, 0], ['file', 64, 29, 'm2f5'], ['herb', 63, 21, 'red'],
  // 主走廊 / 北通道
  ['ammo', 66, 33, 5], ['herb', 40, 15, 1],
];
// 冷冻库的液氮喷口：拉下门边的拉杆，中央这一块（含边界）喷液氮
// 处刑者站在里面 → 冻住 LN2.freeze 秒（环境击倒，不计入打倒阈值），之后破冰直接追踪你
const LN2 = { zone: { x0: 39, y0: 22, x1: 48, y1: 26 }, freeze: 30, recharge: 60, selfDmg: 20, selfSlow: 3 };
LEVELS.map2.enemies = [
  ['zombie', 12, 33], ['zombie', 28, 33], ['dog', 50, 33],
  ['zombie', 9, 23], ['zombie', 13, 25],
  ['zombie', 7, 44], ['zombie', 18, 42], ['crawler', 11, 37],   // 7,44 这只就是「主任」
  ['slime', 14, 43], ['slime', 20, 38],   // ★ 淤泥体：藏在积水里，只看得见气泡
  ['zombie', 22, 24], ['zombie', 31, 23], ['crawler', 26, 29],
  ['zombie', 42, 26], ['zombie', 55, 27], ['zombie', 45, 15],
];

// 宿舍储物柜：奖励冲锋枪（装满一匣）+ 一盒子弹
Object.assign(SAFES, {
  dormLocker: { name: '宿舍的储物柜', code: '0417', reward: { items: [['smg', 1], ['ammo_smg', 40]] }, flag: 'dormLockerOpen',
    look: '铁皮储物柜，挂着一把四位数的密码锁。柜门上贴着一张全家福。', clue: '（线索：宿舍里有一封信和一张便条）' },
});

Object.assign(FILES, {
  m2f1: { title: '贴在配电箱上的字条', body: '主电源跳闸了，备用发电机撑不了多久。\n\n三个保险丝被人拔走了 —— 应该是安保那边为了锁死收容区干的。\n\n一个在员工宿舍，一个在污水处理区，还有一个在培养槽区。\n\n注意：来电以后所有的电子门会一起复位。包括收容区。' },
  m2f2: { title: '安保日志', body: '23:10　收容区 3 号舱读数异常。\n23:42　主任下去查看污水泵，没有回来。门禁记录显示，他的调度员 ID 卡最后一次是在污水处理区刷的。\n00:15　拔掉全部保险丝，让收容区的气密门保持锁死。这是唯一的办法。\n00:50　有东西在电梯井里往下爬。\n01:20　培养槽区又刷了一次卡。是一张十一年前就注销的临时证，姓名栏只有一个字母。\n查不到人。监控那一段是黑的。\n\n安保室是独立供电的。门锁住就没事。门锁住就没事。' },
  m2f3: { title: '一封没寄出的信', body: '妈：\n\n先祝你生日快乐 —— 四月十七号，我没忘。今年又回不去了。\n\n这里的工资很高，我知道你不喜欢我做这份工作。\n\n最近地下的人一个接一个地发烧。上面说是流感，发了针剂。打完针的人都变得很安静，只是一直在啃指甲。\n\n我的针剂还没打。我把它藏在储物柜里了。' },
  m2f4: { title: '培养记录 L-07', body: '样本 L-07：舌骨延长 3 倍，视觉器官完全退化。\n对声音的反应时间 0.04 秒。\n\n备注（手写）：它听得见我们在玻璃外面说话。走路，不要跑。\n\n—— 洛克伍德博士要求把 L 系列全部转移到收容区。' },
  m2f6: { title: '床头的便条', body: '老周：\n\n你的柜子密码又忘了吧？你自己说的，改成你妈的生日，月和日各写两位，这样「一辈子都忘不了」。\n\n还有，别再把公司发的枪藏在柜子里了，安保查到要扣钱的。\n\n—— 小林' },
  m2f7: { title: '冷冻库操作规程（贴在墙上）', body: '液氮管路 · 冷冻柜电磁锁\n\n三路阀门压力必须按以下顺序设定，否则电磁锁不会释放：\n\n· A 路：3 档\n· B 路：比 A 路低两档\n· C 路：A、B 两路之和\n\n注意：阀门动作时有明显的泄压声。收容区有「客人」时请勿随意操作。\n\n紧急排放拉杆（门边）：压力正常后可用。拉下后冷冻库中央会喷出液氮，数秒内可冻结一切活体组织 —— 操作前确认中央区域无人！每次排放后需约 60 秒重新加压。' },
  m2f5: { title: '货运调度手册（节选）', body: '货运列车连接研究所与赫里昂制药厂的地下站台。\n\n启动步骤：\n1. 确认主电源正常；\n2. 在主控室控制台刷调度员以上权限的 ID 卡；\n3. 站台闸门自动开启，列车预热约 60 秒。\n\n紧急情况下，列车可在无人驾驶的状态下单程运行。' },
});

LEVELS.map2.triggers = [
  { id: 'm2_arrive', on: { enter: 'm2lift' }, do: [
    { banner: '拉 撒 路 地 下 研 究 所' },
    { msg: '升降梯砸在井底。四周只有红色的应急灯 —— 这里断电了。', sec: 6 },
    { objective: '▲ 恢复电力（找到三个保险丝）' },
  ] },
  { id: 'm2_sec', on: { enter: 'm2sec' }, do: [{ msg: '安保室。独立供电，门很厚 —— 这里是安全的。', sec: 4 }] },
  { id: 'm2_tanks', on: { enter: 'm2tanks' }, do: [
    { msg: '一排排培养槽泛着绿光。有几只是空的，玻璃从里面被撞碎了。', sec: 5 },
    // J 的痕迹（之二）：和宅邸实验室一模一样的手法 —— 切开的锁、空掉的样本槽
    { after: 5, do: [{ msg: '最里面那只低温柜没有碎。它的锁被整整齐齐切开了，标着「原始株」的那一格是空的。', sec: 6 }] },
  ] },
  ...['fuseA', 'fuseB', 'fuseC'].map(f => ({ id: 'm2_' + f, on: { pickup: 'key', v: f }, do: [{ msg: '得把它插回电梯厅的配电箱。', sec: 3 }] })),
  // 来电：灯亮、电子门解锁 —— 收容区的门也开了
  { id: 'm2_power', on: { flag: 'm2Power' }, do: [
    { objective: null }, { sfx: 'sizzle', v: 1 }, { shake: 5 }, { banner: '电 力 恢 复' },
    { unlock: [44, 31] }, { unlock: [60, 31] },
    { after: 2.5, do: [
      { sfx: 'metal', at: [60, 35], v: 1 }, { unlock: [60, 35] }, { openDoor: [60, 35] },
      { msg: '远处传来气密门泄压的嘶声。广播：「收容区门禁已复位。」……有什么东西在地上爬，喉咙里咯咯作响。', sec: 7 },
      { spawn: [['licker', 58, 41], ['licker', 63, 41], ['zombie', 60, 37]] },
      { groan: [60, 40], v: 1, max: 2000, min: 0.3 },
      { objective: '▲ 前往主控室，启动货运列车' },
    ] },
  ] },
  { id: 'm2_train', on: { flag: 'trainReady' }, do: [
    { objective: null }, { sfx: 'locked', at: [48, 13] }, { unlock: [48, 13] }, { openDoor: [48, 13] }, { shake: 3 },
    { msg: '控制台亮起绿灯。远处，站台的闸门隆隆升起。列车开始预热 —— 60 秒。', sec: 6 },
    { objective: '▲ 前往货运站台，等列车预热完' },
    { countdown: { label: '列车预热', sec: 60, do: [
      { flag: 'trainGo' }, { sfx: 'metal', at: [44, 6], v: 1 }, { shake: 4 },
      { msg: '汽笛一声长鸣 —— 车门开了！快上车！', sec: 5 }, { objective: '▲ 上车（最后一节车厢的车门）' },
    ] } },
    // 处刑者听见了：它直奔站台（从北通道那头撞过来）
    { after: 15, do: [{ execHunt: [38, 15] }, { msg: '北通道传来一声巨响 —— 它知道你要走了。', sec: 4 }] },
  ] },
  { id: 'm2_board', on: { flag: 'boarded' }, do: [
    { objective: null }, { flag: 'chapter2Done' },
    { cine: 8.5, then: 'goto:map3' }, { trainDepart: [26, 3, 36, 3] },
    { msg: '你跳上最后一节车厢。列车猛地一震，开始往前挪。', sec: 3.5 },
    { after: 2.6, do: [{ msg: '身后的站台上，有什么东西撞开了闸门 ——', sec: 3 }] },
    { after: 5.6, do: [{ msg: '……列车一头扎进了隧道。它的吼声被远远甩在身后。', sec: 3 }] },
  ] },
];
