'use strict';
// 全局运行状态：S、模式、玩家临时状态、相机、特效列表

// ---------------------------------------------------------------- 状态与输入
let S = newState();
const RESIDUE_API = window.residueAPI || null;
let SAVE = null;       // 最近一次存档 / 读档的内容（字符串）
let CUR_SLOT = null;   // 当前这局游戏对应的存档槽（1–3）；新游戏还没存过档时为 null
// 调试模式：浏览器加 ?debug，或 Electron 开发版（未打包）。F9 立刻让处刑者登场。
const DEBUG = (typeof location !== 'undefined' && /[?&]debug\b/.test(location.search)) || !!(RESIDUE_API && RESIDUE_API.isDev);
let aimLock = false;
// 页面是一个 <script> 一个 <script> 执行的，浏览器在两个脚本之间会处理键盘 / 鼠标事件。
// input.js 比 ui/menus.js 等文件先加载：页面还没加载完时鼠标在画面上一动，就会调到还不存在的函数
// （menuHover is not defined → 红框一直挡在屏幕下方）。所以 main.js 跑完之前，输入事件一律忽略。
let booted = false;
let mode = 'title', modeT = 0, fileView = null, afterFile = 'play';
const P = { focus: 0, fireCd: 0, reloadT: 0, knifeT: 0, knifeCd: 0, inv: 0, walk: 0, stepT: 0, flash: 0, room: -1, bannerT: 0, bannerTxt: '', hurtT: 0, heartT: 0, slowT: 0 };
let cam = { x: 0, y: 0 }, shake = 0;
let parts = [], decals = [], tracers = [], floats = [], msgs = [];
// 三套寻路场（从玩家出发的路径代价；-1 = 到不了）：flow = C 层，flowB = B 层，flowExec = A 层；flowDir = 导演量距离用的 D 层
let flow = new Int16Array(GRID_CAP), flowB = new Int16Array(GRID_CAP), flowExec = new Int16Array(GRID_CAP), flowDir = new Int16Array(GRID_CAP), flowT = 0;
const keys = {}; const mouse = { x: 0, y: 0, l: false, r: false, lp: false };

function isAimKey() { return mouse.r || keys.KeyK || keys.Space || aimLock; }
function msg(t, dur = 3.5) { msgs.push({ t, life: dur }); if (msgs.length > 4) msgs.shift(); }
function openFile(id, then = 'play') { fileView = FILES[id]; afterFile = then; mode = 'file'; modeT = 0; }
