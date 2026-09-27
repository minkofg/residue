'use strict';
// 触发器引擎：读取 config/triggers.js 里当前地图的事件脚本并执行
// 触发记录在 S.fired['地图id:触发器id']，延时动作放进游戏内计时器，都随存档保存。

const TRIGGER_ON = ['enter', 'enterSafe', 'pickup', 'kill', 'flag', 'near'];
let trigDepth = 0;  // 防止“设置标记 → 触发 → 再设置标记”无限循环

function trigKey(t) { return `${S.map}:${t.id}`; }
function trigCond(c) {
  if (!c) return true;
  if (c.flags && !c.flags.every(f => S.flags[f])) return false;
  if (c.notFlags && c.notFlags.some(f => S.flags[f])) return false;
  if (c.keys && !c.keys.every(k => S.p.keys[k])) return false;
  if (c.notKeys && c.notKeys.some(k => S.p.keys[k])) return false;
  return true;
}
function trigMatches(on, type, d) {
  switch (type) {
    case 'enter': return (on.enter !== undefined && on.enter === d.room) || (!!on.enterSafe && !!d.safe);
    case 'pickup': return on.pickup === d.t && (on.v === undefined || on.v === d.v);
    case 'kill': return on.kill === 'any' || on.kill === d.t;
    case 'flag': return on.flag === d.flag;
    default: return false;
  }
}
function fireTrigger(t) {
  if (t.once !== false) { if (S.fired[trigKey(t)]) return false; S.fired[trigKey(t)] = true; }
  runActions(t.do, t.id);
  return true;
}
// 游戏里发生了某件事：enter / pickup / kill / flag
function fireEvent(type, data) {
  if (!LEVEL || !LEVEL.triggers || trigDepth > 8) return;
  if (!S.fired) S.fired = {};
  trigDepth++;
  try {
    for (const t of LEVEL.triggers) {
      if (!t.on || t.on.near) continue;
      if (trigMatches(t.on, type, data || {}) && trigCond(t.if)) fireTrigger(t);
    }
  } finally { trigDepth--; }
}
// 每帧：检查“走到某处附近”的触发器
function updateTriggers() {
  if (!LEVEL || !LEVEL.triggers) return;
  if (!S.fired) S.fired = {};
  for (const t of LEVEL.triggers) {
    if (!t.on || !t.on.near || !trigCond(t.if)) continue;
    if (t.once !== false && S.fired[trigKey(t)]) continue;
    const [x, y] = t.on.near;
    if (dist(S.p.x, S.p.y, x * T, y * T) < (t.on.r || 60)) fireTrigger(t);
    if (mode !== 'play') return;  // 通关、切换地图后不再继续
  }
}

// ---------------------------------------------------------------- 动作
const tp = v => (v + .5) * T;  // 格坐标（整数格的中心）→ 像素
const ACTIONS = {
  msg: a => msg(a.msg, a.sec),
  banner: a => { P.bannerT = 3; P.bannerTxt = a.banner; },
  sfx: a => a.at ? sfxAt(a.sfx, a.at[0] * T, a.at[1] * T, a.v ?? 1, a.max ?? 900, a.min ?? 0) : sfx(a.sfx, a.v ?? 1),
  groan: a => groanAt(a.groan[0] * T, a.groan[1] * T, a.v ?? 1, !!a.low, a.max ?? 650, a.min ?? 0),
  spawn: a => { for (const [t, x, y] of a.spawn) { const e = mkEnemy(t, x, y); if (a.alert) { e.alert = true; e.state = 'chase'; } S.enemies.push(e); } },
  spawnWave: a => {
    const w = a.spawnWave, [x0, y0, x1, y1] = w.area || [0, 0, MW, MH];
    const alive = S.enemies.filter(e => !e.dead && e.t === w.t && e.x > x0 * T && e.x < x1 * T && e.y > y0 * T && e.y < y1 * T).length;
    if (alive >= (w.maxAlive ?? 4)) return;
    const sp = w.points[Math.floor(rand(w.points.length))];
    if (dist(tp(sp[0]), tp(sp[1]), S.p.x, S.p.y) <= (w.minDist ?? 250)) return;
    const e = mkEnemy(w.t, sp[0], sp[1]); e.alert = true; S.enemies.push(e);
    groanAt(e.x, e.y, 0.7, false, 1200, 0.2);
  },
  // 砸碎一扇窗（LEVEL.windows 里的 id）：玻璃声 + 碎片 + 重画那一格墙
  breakWindow: a => {
    const w = (LEVEL.windows || []).find(w => w.id === a.breakWindow); if (!w) return;
    S.flags['win_' + w.id] = true; drawTileAt(w.x, w.y);
    sfxAt('glass', (w.x + .5) * T, (w.y + .5) * T, 1, 1100, 0.3);
    emitNoise((w.x + .5) * T, (w.y + .5) * T, NOISE.glass);
  },
  flag: a => { if (S.flags[a.flag]) return; S.flags[a.flag] = true; fireEvent('flag', { flag: a.flag }); },
  unflag: a => { delete S.flags[a.unflag]; },
  after: a => scheduleActions(a.after, a.do),
  every: a => scheduleActions(a.first ?? a.every, a.do, a.every, a.until),
  countdown: a => { S.countdown = { label: a.countdown.label, left: a.countdown.sec, do: a.countdown.do, map: S.map }; },
  objective: a => { S.objective = a.objective || null; },
  executioner: a => spawnExecutioner(a.executioner[0], a.executioner[1]),
  // 处刑者直奔 [x, y]：不在这张图就在那里登场；在的话，如果它离得远又不在玩家视野里，就挪过去，然后开始追
  execHunt: a => {
    const [x, y] = a.execHunt, e = activeExecutioner();
    if (!e) { if (S.executioner) S.executioner.follow = null; spawnExecutioner(x, y, true); const b = activeExecutioner(); if (b) exChase(b); sfxAt('bash', tp(x), tp(y), 1.3, 3000, 0.4); shake = Math.max(shake, 10); return; }
    if (e.frozenT > 0 || e.knockdownT > 0) return;   // 被冻着 / 倒地：那就是玩家赚到的时间
    if (dist(e.x, e.y, S.p.x, S.p.y) > 12 * T && !losClear(e.x, e.y, S.p.x, S.p.y)) { e.x = tp(x); e.y = tp(y); }
    exChase(e); sfxAt('bash', e.x, e.y, 1.3, 3000, 0.4); shake = Math.max(shake, 10);
  },
  unlock: a => { const [x, y] = a.unlock, k = doorKey(x, y); if (!S.unlocked.includes(k)) S.unlocked.push(k); if (grid[y * MW + x] === 3) grid[y * MW + x] = 2; drawTileAt(x, y); },
  // 锁上一扇门（Boss 战封门）：关上并从已解锁列表里去掉；门必须在 locks 里配了钥匙名（撞门时的提示）
  lockDoor: a => { const [x, y] = a.lockDoor, k = doorKey(x, y); S.unlocked = S.unlocked.filter(u => u !== k); setDoorOpen(x, y, false); if (LOCKS[k]) grid[y * MW + x] = 3; drawTileAt(x, y); },
  // 终点站台（ai/lazarus.js）：拉撒路登场、J 出现 / 离开
  lazarus: a => startLazarus(a.lazarus),
  jAppear: a => jAppear(a.jAppear, true),
  jLeave: () => jLeave(),
  openDoor: a => { const [x, y] = a.openDoor; if (grid[y * MW + x] === 2) { setDoorOpen(x, y, true); drawTileAt(x, y); } },
  goto: a => gotoLevel(a.goto, a.at, a.a),
  run: a => runActions((LEVEL.scripts || {})[a.run] || [], a.run),
  shake: a => { shake = Math.max(shake, a.shake); },
  win: () => { mode = 'win'; modeT = 0; },
  // 演出段：交出控制权 N 秒。then:'win' 表示演完直接进结算画面
  // 直升机坠毁演出（game/events.js）
  crash: () => startHeliCrash(),
  // 货运列车开走（game/events.js）：[x, y, w, h] 是列车这件家具的格子范围
  trainDepart: a => startTrainDepart(a.trainDepart, a),
  // 地图 3 结局（ai/lazarus.js）：列车 30 秒后发车、残骸的触手一路追；没赶上就死
  escapeStart: () => startEscape(),
  escapeFail: () => failEscape(),
  // 处刑者从二楼栏杆跳到 [x, y]（game/events.js）
  leap: a => startExecLeap(a.leap[0], a.leap[1]),
  // 收容舱从天上落下来（1.3 秒落地）
  pod: a => { S.pod = { x: (a.pod[0] + .5) * T, y: (a.pod[1] + .5) * T, t: 0, hatch: true }; },
  cine: a => { S.cine = Math.max(S.cine || 0, a.cine); S.cineLen = a.cine; S.cineT = 0; if (a.then) S.cineThen = a.then; const lf = a.lift && S.items.find(i => i.t === 'lift'); S.cineLift = lf ? { x: lf.x, y: lf.y } : null; },
};
const actionVerb = a => a && typeof a === 'object' ? Object.keys(a).find(k => k in ACTIONS) : undefined;
function runActions(list, src) {
  for (const a of list || []) {
    const v = actionVerb(a);
    if (!v) { console.warn(`[触发器 ${src}] 不认识的动作`, a); continue; }
    ACTIONS[v](a);
  }
}

// ---------------------------------------------------------------- 检查配置（npm test 会对每张地图调用）
function validateLevel(id) {
  const L = LEVELS[id], errs = [], roomIds = new Set(L.rooms.map(r => r.id));
  const seen = new Set();
  const checkActions = (list, where) => {
    if (!Array.isArray(list)) { errs.push(`${where}：do 必须是数组`); return; }
    list.forEach((a, i) => {
      const w = `${where} 第 ${i + 1} 个动作`, v = actionVerb(a);
      if (!v) { errs.push(`${w}：不认识的动作 ${JSON.stringify(a)}`); return; }
      if (v === 'spawn') for (const [t] of a.spawn) if (!EDEF[t]) errs.push(`${w}：没有这种敌人 ${t}`);
      if (v === 'breakWindow' && !(L.windows || []).some(x => x.id === a.breakWindow)) errs.push(`${w}：没有这扇窗 ${a.breakWindow}`);
      if (v === 'spawnWave' && !EDEF[a.spawnWave.t]) errs.push(`${w}：没有这种敌人 ${a.spawnWave.t}`);
      if (v === 'run' && !(L.scripts || {})[a.run]) errs.push(`${w}：没有这段脚本 ${a.run}`);
      if (v === 'goto' && !LEVELS[a.goto]) errs.push(`${w}：没有这张地图 ${a.goto}`);
      if ((v === 'unlock' || v === 'openDoor' || v === 'lockDoor') && !L.doors.some(([x, y]) => x === a[v][0] && y === a[v][1])) errs.push(`${w}：(${a[v]}) 不是门`);
      if (v === 'after' || v === 'every') checkActions(a.do, `${w}（延时）`);
      if (v === 'countdown') checkActions(a.countdown.do, `${w}（倒计时结束）`);
    });
  };
  for (const t of L.triggers || []) {
    const w = `地图 ${id} 触发器 ${t.id}`;
    if (!t.id) errs.push(`地图 ${id}：有触发器没有 id`);
    if (seen.has(t.id)) errs.push(`${w}：id 重复`); seen.add(t.id);
    const ons = Object.keys(t.on || {}).filter(k => TRIGGER_ON.includes(k));
    if (ons.length !== 1) errs.push(`${w}：on 里需要恰好一个条件（${TRIGGER_ON.join(' / ')}）`);
    if (t.on && t.on.enter !== undefined && !roomIds.has(t.on.enter)) errs.push(`${w}：没有这个房间 ${t.on.enter}`);
    if (t.on && t.on.kill && t.on.kill !== 'any' && !EDEF[t.on.kill]) errs.push(`${w}：没有这种敌人 ${t.on.kill}`);
    checkActions(t.do, w);
  }
  for (const [name, list] of Object.entries(L.scripts || {})) checkActions(list, `地图 ${id} 脚本 ${name}`);
  for (const ex of L.exits || []) if (!LEVELS[ex.to]) errs.push(`地图 ${id} 出口 (${ex.x},${ex.y})：没有这张地图 ${ex.to}`);
  // 处刑者的剧情入口（换地图后从这里跟来）必须在某个非安全屋的房间里
  if (L.execEntry) {
    const { x, y } = L.execEntry, r = L.rooms.find(r => x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h);
    if (!r) errs.push(`地图 ${id} 处刑者入口 (${x},${y})：不在任何房间里`);
    else if (r.safe) errs.push(`地图 ${id} 处刑者入口 (${x},${y})：不能放在安全屋里`);
  }
  return errs;
}
