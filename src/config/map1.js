'use strict';
// 地图 1（洋馆）数据：房间、门、锁、家具、灯。钥匙定义（KEYS）所有地图共用。
// 一张地图 = LEVELS 里的一项；道具和敌人摆放在 content.js，事件在 triggers.js。
// 每张地图有自己的网格尺寸：在这里写 w / h（不写就是 64×48），上限见 world/grid.js 的 MAX_MW / MAX_MH。
// 用不到的格子就是墙。地图 1 精修后按计划 §4 扩到 80×64，改这里的 w / h 即可。

const LEVELS = {};
LEVELS.map1 = {
  id: 'map1', name: '洛克伍德宅邸', w: 80, h: 48,   // 精修：东边扩出温室和园丁小屋
  start: { x: 32.5, y: 37.5, a: -Math.PI / 2 },  // 新游戏出生点（格）
  rooms: [
  { id: 'hall',    name: '主厅',           x: 26, y: 30, w: 12, h: 10, floor: 'marble',  amb: 0.9 },
  { id: 'wcor',    name: '西侧走廊',       x: 10, y: 33, w: 15, h: 3,  floor: 'wood',    amb: 0.97 },
  { id: 'dining',  name: '餐厅',           x: 8,  y: 20, w: 12, h: 12, floor: 'wood2',   amb: 0.95 },
  // ★ 精修新增（计划 4.1）：厨房与冷库。剑之钥匙从餐厅移到冷库，呼应厨师日记（f2）
  { id: 'kitchen', name: '厨房',           x: 2,  y: 21, w: 5,  h: 9,  floor: 'tile',    amb: 0.88 },
  { id: 'cold',    name: '冷库',           x: 2,  y: 15, w: 5,  h: 5,  floor: 'frost',   amb: 0.30 },
  { id: 'storage', name: '储藏室',         x: 2,  y: 33, w: 7,  h: 6,  floor: 'stone',   amb: 0.97 },
  { id: 'ncor',    name: '北侧走廊',       x: 22, y: 25, w: 20, h: 4,  floor: 'carpet',  amb: 0.95 },
  { id: 'gallery', name: '画廊',           x: 26, y: 8,  w: 12, h: 16, floor: 'marble2', amb: 0.95, puzzle: true },
  // ★ 精修新增：主卧（画廊北墙的门进出）。保险柜谜题在这里 —— 地图 1 的第二个、也是最后一个谜题
  { id: 'bedroom', name: '主卧',           x: 27, y: 1,  w: 11, h: 6,  floor: 'carpet',  amb: 0.9 },
  { id: 'library', name: '图书室',         x: 8,  y: 6,  w: 17, h: 12, floor: 'carpetG', amb: 0.96 },
  { id: 'ecor',    name: '东侧走廊',       x: 39, y: 34, w: 14, h: 3,  floor: 'wood',    amb: 0.97 },
  { id: 'study',   name: '书房（安全屋）', x: 46, y: 22, w: 12, h: 11, floor: 'safe',    amb: 0.45, safe: true },
  { id: 'lab',     name: '私人实验室',     x: 44, y: 38, w: 14, h: 8,  floor: 'lab',     amb: 0.93 },
  { id: 'passage', name: '后廊',           x: 43, y: 19, w: 2,  h: 9,  floor: 'stone',   amb: 0.97 },
  // ★ 精修新增：酒窖（主厅南墙下的石阶）。地图 1 的出口 —— 两枚徽章嵌进主厅雕像后打开
  { id: 'cellar',  name: '酒窖',           x: 28, y: 41, w: 9,  h: 5,  floor: 'stone',   amb: 0.32 },
  { id: 'yard',    name: '后庭院',         x: 43, y: 2,  w: 18, h: 18, floor: 'grass',   amb: 0.82 },
  // ★ 精修新增：音乐室（图书室西墙的门）。进门一片漆黑 —— 开关在门边
  { id: 'music',   name: '音乐室',         x: 1,  y: 2,  w: 6,  h: 11, floor: 'wood2',   amb: 0.9 },
  // ★ 精修新增：温室（庭院东墙）和园丁小屋 —— 第二个安全屋，坠机之后在庭院里被追时的喘息点
  { id: 'green',   name: '温室',           x: 62, y: 2,  w: 14, h: 10, floor: 'soil',    amb: 0.9 },
  { id: 'shed',    name: '园丁小屋（安全屋）', x: 62, y: 13, w: 8, h: 6, floor: 'safe',   amb: 0.5, safe: true },
],
  doors: [[32, 29], [32, 24], [25, 34], [14, 32], [9, 34], [25, 12], [38, 35], [50, 33], [48, 37], [42, 26], [7, 25], [4, 20], [32, 7], [32, 40], [7, 9], [61, 7], [61, 16]],
  // 'gallery' 不是钥匙，是机关闩：靠解开半身像谜题打开（见 config/triggers.js 的 busts_solved）
  locks: { '32,29': 'sword', '48,37': 'armor', '42,26': 'shield', '25,12': 'gallery', '32,40': 'cellar' },
  furn: [
  [11, 25, 6, 2, 'table'], [10, 9, 6, 1, 'shelf'], [17, 9, 6, 1, 'shelf'], [10, 13, 6, 1, 'shelf'], [17, 13, 6, 1, 'shelf'],
  [31, 34, 2, 2, 'statue'], [47, 41, 5, 1, 'bench'], [47, 43, 5, 1, 'bench'],
  // 画廊四座像摆在四面墙下（x26-37 / y8-23）：上北 (32,10)、右东 (36,15)、下南 (30,21)、左西 (27,15)。
  // 南墙那座刻意避开入口门 (32,24) 的正对轴线 —— 门口正中立一根柱子既挡路也挡声音传播。
  // 位置本身就是一个方位，玩家不用在脑子里做「左上角 = 西北」这层换算。
  [32, 10, 1, 1, 'bust'], [36, 15, 1, 1, 'bust'], [30, 21, 1, 1, 'bust'], [27, 15, 1, 1, 'bust'],
  [52, 41, 2, 1, 'desk'],   // 私人实验室：实验台(47-51,41)旁边的柜子 —— f5 说盾之钥匙放在这上面
  [50, 24, 3, 1, 'desk'], [46, 10, 3, 1, 'hedge'], [56, 14, 3, 1, 'hedge'], [50, 14, 3, 1, 'hedge'],
  [3, 38, 2, 1, 'crate'], [7, 33, 2, 1, 'crate'],
  // 厨房：靠墙的料理台和灶台，中间留出通道
  [2, 23, 3, 1, 'counter'], [2, 27, 2, 1, 'stove'], [5, 28, 2, 1, 'counter'],
  // 冷库：两排挂肉架
  [2, 16, 4, 1, 'rack'], [2, 18, 3, 1, 'rack'],
  // 主卧：四柱床靠西墙，衣柜靠北墙；保险柜嵌在东北角（道具 safe，不是家具）
  [28, 2, 3, 2, 'bed'], [33, 1, 2, 1, 'wardrobe'],
  // 酒窖：两排酒架，中间留出走到升降梯的路
  [28, 42, 3, 1, 'wine'], [34, 42, 3, 1, 'wine'], [28, 44, 2, 1, 'crate'],
  // 音乐室：三角钢琴 + 留声机 + 两排折叠椅
  [2, 3, 3, 2, 'piano'], [5, 2, 1, 1, 'gramo'], [2, 8, 3, 1, 'bench'],
  // 温室：三排种植床，中间走人
  [64, 4, 4, 1, 'planter'], [70, 4, 4, 1, 'planter'], [64, 7, 4, 1, 'planter'], [70, 7, 4, 1, 'planter'], [64, 10, 3, 1, 'planter'],
  // 园丁小屋：工作台 + 工具架
  [66, 17, 3, 1, 'desk'], [62, 13, 1, 2, 'rack'],
  ],
  pad: { x: 52.5, y: 4.5 },  // 停机坪（格）；没有就不画
  lamps: [
  { room: 'hall', x: 32, y: 32, r: 300, a: 0.55 },
  { room: 'dining', x: 14, y: 26, r: 200, a: 0.5, fl: 0.15 },
  { room: 'kitchen', x: 4.5, y: 25.5, r: 190, a: 0.45, fl: 0.35 },   // 接触不良的日光灯，闪得厉害
  { room: 'cold', x: 4.5, y: 17.5, r: 110, a: 0.22, fl: 0.5 },       // 冷库的灯快坏了
  { room: 'library', x: 16.5, y: 11.5, r: 200, a: 0.35, fl: 0.1 },
  { room: 'gallery', x: 32, y: 14, r: 230, a: 0.3 },
  { room: 'bedroom', x: 30, y: 4, r: 150, a: 0.28, fl: 0.2 },   // 床头一盏快没电的台灯
  { room: 'ncor', x: 27, y: 27, r: 120, a: 0.35 }, { room: 'ncor', x: 37, y: 27, r: 120, a: 0.35 },
  { room: 'study', x: 52, y: 27, r: 420, a: 0.85 },
  { room: 'lab', x: 50, y: 40, r: 280, a: 0.65, fl: 1 },
    // flag：只有这个事件标记为真时才亮（由 triggers.js 设置）
    { room: 'yard', x: 52, y: 10, r: 500, a: 0.25, flag: 'yardStarted' },
    { room: 'yard', x: 52.5, y: 4.5, r: 260, a: 0.9, fl: 0.2, flag: 'heli' },
    { room: 'yard', x: 52.5, y: 4.5, r: 330, a: 0.7, fl: 0.6, flag: 'heliDown' },   // 坠毁的直升机在烧
    { room: 'cellar', x: 32.5, y: 44, r: 150, a: 0.3, fl: 0.25 },
    // sw：可开关的灯。flag 由墙边的开关道具（['switch', x, y, flag]）来回切换，随存档保存
    { room: 'music', x: 3.5, y: 6.5, r: 210, a: 0.5, fl: 0.1, flag: 'lightMusic', sw: true },
    { room: 'green', x: 69, y: 6.5, r: 330, a: 0.4, flag: 'lightGreen', sw: true },
    { room: 'shed', x: 66, y: 15.5, r: 240, a: 0.8, fl: 0.05 },
  ],
  // 通往其他地图的出口：{ x, y, to: 'map2', at: [x, y], a, label, need: { key | flag }, lockedMsg }
  exits: [],
  // 窗户（墙格）：{ x, y, id }。事件动作 { breakWindow: 'id' } 把它砸碎（S.flags['win_'+id]）
  windows: [
    { x: 13, y: 36, id: 'wcor1' }, { x: 20, y: 36, id: 'wcor2' },
    { x: 16, y: 5, id: 'lib1' }, { x: 0, y: 7, id: 'music1' }, { x: 52, y: 21, id: 'study1' },
  ],
  // 处刑者的剧情入口 { x, y, msg }（格）：换地图后它从这里跟来（计划 3.6）。地图 1 是它登场的地图，没有入口
  //   例：地图 2 的电梯井 execEntry: { x: 30, y: 12, msg: '头顶的电梯井传来金属撕裂声——它砸了下来！' }
};

// 钥匙（所有地图共用）
const KEYS = {
  sword:  { name: '剑之钥匙', col: '#cfd8e0', hint: '门锁着。锁孔上方刻着一把剑的图案。' },
  armor:  { name: '铠甲钥匙', col: '#e0a94a', hint: '厚重的铁门锁着。门牌写着「研究区——需铠甲钥匙」。' },
  shield: { name: '盾之钥匙', col: '#6fa8dc', hint: '门锁着。锁孔上方刻着一面盾牌。门外传来风声……' },
  // 机关闩：没有对应的钥匙道具，玩家永远拿不到 —— hint 负责告诉他该去看半身像
  // 徽章：钥匙类，不占格子。两枚都嵌进主厅雕像 → 酒窖的门打开（地图 1 的出口）
  lion:  { name: '狮之徽章', col: '#d9b04a', hint: '' },
  snake: { name: '蛇之徽章', col: '#5fae6a', hint: '' },
  // needs：机关门要先拿到哪些东西才可能打开（地图体检用它判断会不会卡关）
  cellar: { name: '——', col: '#6a5a4a', puzzle: true, needs: ['lion', 'snake'], hint: '厚重的石板门，没有锁孔。门楣上刻着一行字：「狮与蛇归位之时」。' },
  gallery: { name: '——', col: '#8a7a5a', puzzle: true, hint: '门楣上钉着一块铜牌：「图书室」。门从里面被铁闩闩住了，闩上连着四根铜杆，分别伸向画廊四面墙下的半身像。' },
};
