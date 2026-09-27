'use strict';
// 开始游戏、读档、存档

function resetTransient() {
  parts = []; decals = []; tracers = []; floats = []; msgs = [];
  Object.assign(P, { focus: 0, fireCd: 0, reloadT: 0, knifeT: 0, knifeCd: 0, inv: 1.5, flash: 0, room: -1, bannerT: 0, hurtT: 0, lastSwitch: undefined, invCur: 0, invSel: -1, invTop: 0, invTab: 'items', fileCur: 0, fileTop: 0, grab: null, grabCd: 0 });
  cam.x = S.p.x - W / 2; cam.y = S.p.y - H / 2; flowT = 0;
  resetChaseMusic();
}
function startGame(restart) {
  S = newState(); buildMap(); renderMap(); resetTransient();
  // 序章先走黑屏文字（ui/intro.js），放完再弹 f0 简报，然后才交出控制权。
  // 读档不放序章 —— 第二次进来的人只想接着玩。
  startIntro();
}
function loadGame(str) {
  try {
    const raw = JSON.parse(str);
    const mapId = LEVELS[raw.map] ? raw.map : 'map1';
    const fresh = newState(mapId);  // 同时切换到存档所在的地图
    const oldP = raw.p || {};
    S = { ...fresh, ...raw, version: SAVE_VERSION, p: { ...fresh.p, ...oldP } };
    delete S.meta;
    // v1 存档迁移：旧草药只有绿色，旧存档没有门、计时器和版本字段。
    S.timers = Array.isArray(raw.timers) ? raw.timers : [];
    S.doors = { ...fresh.doors, ...(raw.doors || {}) };
    S.doorBash = (raw.doorBash && typeof raw.doorBash === 'object') ? { ...raw.doorBash } : {};
    S.flags = { ...fresh.flags, ...(raw.flags || {}) }; S.visited = { ...fresh.visited, ...(raw.visited || {}) };
    S.stats = { ...fresh.stats, ...(raw.stats || {}) }; S.yard = { ...fresh.yard, ...(raw.yard || {}) };
    S.executioner = { ...fresh.executioner, ...(raw.executioner || {}) };
    // v4：多地图和触发器
    S.map = mapId;
    S.maps = {};
    if (raw.maps && typeof raw.maps === 'object') for (const [id, st] of Object.entries(raw.maps)) if (LEVELS[id] && id !== mapId && st) S.maps[id] = { ...freshLevelState(id), ...st };
    S.fired = (raw.fired && typeof raw.fired === 'object') ? { ...raw.fired } : {};
    S.countdown = raw.countdown && raw.countdown.do ? raw.countdown : null;
    S.objective = typeof raw.objective === 'string' ? raw.objective : null;
    migrateEvents(raw);
    S.unlocked = Array.isArray(raw.unlocked) ? raw.unlocked : []; S.enemies = Array.isArray(raw.enemies) ? raw.enemies : fresh.enemies; S.items = Array.isArray(raw.items) ? raw.items : fresh.items;
    S.p.mag = { ...fresh.p.mag, ...(oldP.mag || {}) };
    S.p.keys = { ...(oldP.keys || {}) };
    S.p.mods = {}; for (const k in (oldP.mods || {})) if (MODS[k] && oldP.mods[k]) S.p.mods[k] = true;   // 不认识的配件丢掉
    // 背包：v3 起是格子；更早的存档把零散计数转换成格子。v5 起不限格数（整行，至少 INV_START 格）
    if (oldP.inv && Array.isArray(oldP.inv.slots)) {
      const slots = oldP.inv.slots.map(x => (x && ITEMS[x.id] && x.n > 0) ? { id: x.id, n: x.n } : null);
      S.p.inv = invFit({ size: slots.length, slots });
    } else {
      S.p.inv = migrateInventory(oldP);
      if (oldP.hasShotgun) S.p.mag.shotgun = (oldP.mag && oldP.mag.shotgun) || 0;
    }
    // v5 取消了道具箱：旧存档箱子里的东西全部放进背包（一件不少）；地图上的道具箱和没捡的腰包一并拿掉
    const boxed = Array.isArray(raw.box) ? raw.box.filter(x => x && ITEMS[x.id] && x.n > 0) : [];
    for (const x of boxed) invAdd(S.p.inv, x.id, x.n);
    delete S.box;
    const gone = it => it && (it.t === 'box' || it.t === 'pouch');
    S.items = S.items.filter(it => !gone(it));
    for (const m of Object.values(S.maps || {})) if (m && Array.isArray(m.items)) m.items = m.items.filter(it => !gone(it));
    for (const k of ['res', 'herb', 'red', 'blue', 'mixes', 'spray', 'hasShotgun']) delete S.p[k];
    S.p.guardT = +oldP.guardT || 0;
    if (!invHas(S.p.wep)) S.p.wep = ['pistol', 'shotgun'].find(invHas) || 'pistol';
    for (const e of [S.enemies, ...Object.values(S.maps).map(m => m.enemies || [])].flat()) { const d = EDEF[e.t] || EDEF.zombie; e.sight = d.sight; e.dmg = d.dmg; e.reach = d.reach; e.r = d.r; e.knifeStunT = e.knifeStunT || 0; e.heard = null; e.heardField = null; e.bashT = 0; }
    EID = [S.enemies, ...Object.values(S.maps).map(m => m.enemies || [])].flat().reduce((m, e) => Math.max(m, e.id + 1), 0);
    buildMap(); renderMap(); resetTransient(); startAmbient(); mode = 'play';
    execAfterLoad();  // 读档保护：处刑者太近就挪远，30 秒内不瞬移
    for (const e of S.enemies) if (e.dead) decals.push({ x: e.x, y: e.y, r: e.r * 1.6, rot: rand(6), a: 0.8 });
    msg(raw.version === undefined || raw.version < SAVE_VERSION ? '读取旧版存档，已自动迁移。' + (boxed.length ? `道具箱已经取消，箱子里的 ${boxed.length} 样东西都放进了背包。` : '') : '读取存档。', boxed.length ? 6 : 3);
  } catch (e) { msg('存档损坏，已开始新游戏。'); startGame(true); }
}
// v3 以前：事件写死在代码里，进度存在 S.flags 和 S.yard。转换成触发器记录、倒计时和计时器。
function migrateEvents(raw) {
  const f = S.flags, fired = S.fired, Y = raw.yard;
  delete S.yard;
  if (!Y && !f.safeMsg && !f.ambush) return;
  if (f.safeMsg) { fired['map1:safe_first'] = true; delete f.safeMsg; }
  if (f.ambush) { fired['map1:shield_key'] = true; delete f.ambush; }  // 还没到时间的伏击计时器照常触发（见 timers.js）
  if (!Y || !Y.started) return;
  const trig = LEVELS.map1.triggers.find(t => t.id === 'yard_enter');
  const cd = trig.do.find(a => a.countdown).countdown, wave = trig.do.find(a => a.every);
  fired['map1:yard_enter'] = true; f.yardStarted = true;
  // v3 存档里直升机已经到了 → 按现在的剧情就是「已经坠毁」，接到第一章后半段
  if (Y.heli) { f.heliDown = true; S.objective = '▲ 回到宅邸，找到通往地下的路'; }
  else if (!S.countdown) {
    S.countdown = { label: cd.label, left: +Y.timer || 0, do: cd.do, map: 'map1' };
    S.timers.push({ id: 'migrated-wave', type: 'actions', left: +Y.spawnT || wave.every, every: wave.every, until: wave.until, do: wave.do, map: 'map1' });
  }
  if (Y.bossIn > 0 && !S.executioner.spawned) {
    const ex = trig.do.find(a => a.after && a.do.some(b => b.executioner));
    S.timers.push({ id: 'migrated-boss', type: 'actions', left: Y.bossIn, do: ex.do, map: 'map1' });
  }
}
// 存到存档槽 slot（默认当前这局的槽；新游戏第一次存档由打字机界面选槽）
function saveGame(slot = CUR_SLOT || 1) {
  S.version = SAVE_VERSION; S.stats.saves++;
  const r = curRoom() >= 0 ? ROOMS[curRoom()] : ROOMS[P.room];
  S.meta = { map: LEVEL.name, room: r ? r.name : '', savedAt: Date.now() };  // 存档界面显示用
  const data = JSON.stringify(S, (k, v) => (k === 'heardField' || k === 'heard' || k === 'lastSeen') ? undefined : v);
  delete S.meta;
  const ok = () => { SAVE = data; CUR_SLOT = slot; refreshSlots(); sfx('save'); msg(`打字机咔哒作响……已保存到存档 ${slot}。`); };
  const fail = () => {
    S.stats.saves--; sfx('locked');
    msg(storageBlocked()
      ? '这个浏览器不允许本页保存数据，进度无法留存。请改用浏览器打开在线版，或关闭隐私模式后重试。'
      : '存档失败！请检查磁盘空间或文件权限。', 6);
  };
  try {
    const res = writeSlotRaw(slot, data);
    if (res && typeof res.then === 'function') res.then(v => v ? ok() : fail(), fail);
    else if (res) ok(); else fail();
  } catch (e) { fail(); }
}
