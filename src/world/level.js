'use strict';
// 关卡管理器：当前地图的数据、切换地图、每张地图单独保存状态

// 当前地图的数据（useLevel 设置）。其余代码直接读这些变量。
let LEVEL = null, ROOMS = [], DOORS = [], LOCKS = {}, FURN = [], LAMPS = [], PAD = null, EXITS = [];
// 每张地图单独保存的状态；当前地图的这些字段就在 S 上，离开时存进 S.maps[地图id]
const PER_MAP_KEYS = ['items', 'enemies', 'doors', 'unlocked', 'doorBash', 'visited'];
const LOAD_FADE_OUT = 0.35, LOAD_HOLD = 0.35, LOAD_FADE_IN = 0.45;  // 切换地图：淡出 → 读取画面 → 淡入（秒）

function useLevel(id) {
  const L = LEVELS[id];
  if (!L) throw new Error(`没有这张地图：${id}`);
  setMapSize(L.w || 64, L.h || 48);   // 每张地图各自的网格尺寸（不写就是 64×48）
  LEVEL = L; ROOMS = L.rooms; DOORS = L.doors; LOCKS = L.locks || {}; FURN = L.furn || []; LAMPS = L.lamps || []; EXITS = L.exits || [];
  PAD = L.pad ? { x: L.pad.x * T, y: L.pad.y * T } : null;
}
// 一张地图第一次进入时的状态
function freshLevelState(id) {
  const L = LEVELS[id];
  return {
    items: makeItems(L.items || []), enemies: makeEnemies(L.enemies || []),
    doors: Object.fromEntries(L.doors.map(([x, y]) => [doorKey(x, y), false])), unlocked: [], doorBash: {}, visited: {},
  };
}
function stashLevel() {
  const st = {};
  for (const k of PER_MAP_KEYS) st[k] = S[k];
  for (const e of st.enemies) { e.heard = null; e.heardField = null; e.lastSeen = null; }
  S.maps[S.map] = st;
}
function restoreLevel(id) {
  const st = S.maps[id] || freshLevelState(id);
  delete S.maps[id];
  for (const k of PER_MAP_KEYS) S[k] = st[k];
  EID = Math.max(EID, S.enemies.reduce((m, e) => Math.max(m, e.id + 1), 0));
}
// 切换地图。instant：立即完成（测试和读档用）；否则进入 loading 模式，淡出 → 读取画面 → 淡入
function gotoLevel(id, at, a, instant) {
  if (!LEVELS[id]) { msg(`[错误] 没有这张地图：${id}`, 4); return false; }
  if (instant) { swapLevel(id, at, a); return true; }
  mode = 'loading'; P.load = { id, at, a, t: 0, swapped: false };
  return true;
}
function swapLevel(id, at, a) {
  S.cineLift = null;
  if (!S.maps) S.maps = {};
  if (id !== S.map) {
    // 记下离开这张地图时的游戏时间，结算画面据此算出每张地图各玩了多久（ui/screens.js 的 mapSplits）
    if (S.stats) S.stats.split = { ...(S.stats.split || {}), [S.map]: S.time };
    execBeforeLeave(id); stashLevel(); useLevel(id); restoreLevel(id); S.map = id;   // 处刑者：目标地图有入口就跟过去（计划 3.6）
  }
  const L = LEVELS[id], pos = at || [L.start.x, L.start.y];
  S.p.x = pos[0] * T; S.p.y = pos[1] * T; S.p.a = a ?? L.start.a ?? S.p.a;
  buildMap(); renderMap(); computeAllFlows();
  // 过场特效不跨地图；背包、生命、计时器、标记都保留
  parts = []; decals = []; tracers = []; floats = [];
  P.room = -1; P.bannerT = 0; P.reloadT = 0; P.fireCd = 0.3; P.inv = Math.max(P.inv, 1);
  cam.x = S.p.x - W / 2; cam.y = S.p.y - H / 2; flowT = 0;
  for (const e of S.enemies) if (e.dead) decals.push({ x: e.x, y: e.y, r: e.r * 1.6, rot: rand(6), a: 0.8 });
}
// 这张图会出现的怪：地图上的敌人 + 会追过来的处刑者 + 写在地图配置里的 Boss
function warmLevelCries() {
  const types = S.enemies.map(e => e.t);
  if (LEVEL.execEntry || (S.executioner && S.executioner.spawned)) types.push('boss');
  for (const [t] of LEVEL.bossNeeds || []) types.push(t);
  warmCries(types);
}
// loading 模式每帧调用
function updateLoading(dt) {
  const L = P.load; if (!L) { mode = 'play'; return; }
  L.t += dt;
  if (!L.swapped && L.t >= LOAD_FADE_OUT) { swapLevel(L.id, L.at, L.a); L.swapped = true; warmLevelCries(); }
  else if (L.swapped) pumpCries(40);   // 黑屏读取期间把这张图的怪物叫声先生成好（audio/creatures.js）
  if (L.t >= LOAD_FADE_OUT + LOAD_HOLD + LOAD_FADE_IN) { P.load = null; mode = 'play'; }
}
// 黑幕透明度：淡出时 0→1，读取时 1，淡入时 1→0
function loadingAlpha() {
  const L = P.load; if (!L) return 0;
  if (L.t < LOAD_FADE_OUT) return L.t / LOAD_FADE_OUT;
  if (L.t < LOAD_FADE_OUT + LOAD_HOLD) return 1;
  return clamp(1 - (L.t - LOAD_FADE_OUT - LOAD_HOLD) / LOAD_FADE_IN, 0, 1);
}
function drawLoading() {
  const a = loadingAlpha(); if (a <= 0) return;
  ctx.fillStyle = `rgba(0,0,0,${a})`; ctx.fillRect(0, 0, W, H);
  if (a >= 0.99 && P.load) {
    ctx.textAlign = 'center'; ctx.fillStyle = '#d8c9a0'; ctx.font = '26px serif';
    ctx.fillText(LEVELS[P.load.id].name, W / 2, H / 2 - 6);
    ctx.font = '13px sans-serif'; ctx.fillStyle = '#777'; ctx.fillText('读取中……', W / 2, H / 2 + 24);
  }
}
// 出口（通往其他地图）：满足条件就切换，否则提示
function exitReady(ex) {
  const n = ex.need; if (!n) return true;
  if (n.key && !S.p.keys[n.key]) return false;
  if (n.flag && !S.flags[n.flag]) return false;
  return true;
}
function useExit(ex) {
  if (!exitReady(ex)) { sfx('locked'); msg(ex.lockedMsg || '现在还不能过去。'); return false; }
  sfx('door'); return gotoLevel(ex.to, ex.at, ex.a);
}

useLevel('map1');
