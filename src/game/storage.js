'use strict';
// 存档槽（3 个，每个带自动备份）和设置的读写。
// Electron：%APPDATA%/Residue/save-N.json、save-N.bak.json、settings.json（见 electron/storage.js）
// 浏览器试玩：localStorage 的 residue_save_N、residue_save_N_bak、residue_settings

const SLOT_COUNT = 3;
const LS_SLOT = n => `residue_save_${n}`, LS_BAK = n => `residue_save_${n}_bak`, LS_SETTINGS = 'residue_settings';
const lsGet = k => { try { return localStorage.getItem(k) || ''; } catch (e) { return ''; } };
const lsSet = (k, v) => { localStorage.setItem(k, v); };
// 存档写失败有两种完全不同的原因，提示说错了玩家会一直去查错方向：
//   · 浏览器根本不让存（隐私模式、file:// 直接打开、站点被设为「不保存数据」）→ SecurityError
//   · 空间不够 → QuotaExceededError
// 不能靠「再探一次」来区分：两者都是 setItem 抛异常。只能看异常本身。
let LAST_STORAGE_ERR = null;
function storageBlocked() {
  const e = LAST_STORAGE_ERR;
  if (!e) return false;
  return /security|denied|access|not allowed/i.test(`${e.name} ${e.message}`);
}

function readSlotRaw(n, backup) {
  if (RESIDUE_API) { try { return RESIDUE_API.loadSlot(n, !!backup) || ''; } catch (e) { return ''; } }
  return lsGet(backup ? LS_BAK(n) : LS_SLOT(n));
}
// Electron 返回 Promise<boolean>；浏览器直接返回 boolean（同步写完）
function writeSlotRaw(n, data) {
  if (RESIDUE_API) return Promise.resolve(RESIDUE_API.saveSlot(n, data)).then(r => r !== false, () => false);
  try {
    const old = lsGet(LS_SLOT(n));
    if (old && parseSave(old)) lsSet(LS_BAK(n), old);  // 覆盖前备份（旧档完好时）
    lsSet(LS_SLOT(n), data);
    LAST_STORAGE_ERR = null;
    return true;
  } catch (e) { LAST_STORAGE_ERR = e; return false; }
}
function parseSave(str) {
  if (!str) return null;
  try { const o = JSON.parse(str); return o && typeof o === 'object' && o.p ? o : null; } catch (e) { return null; }
}
// 旧版浏览器试玩只有一个存档（residue_save）→ 放进槽 1
function migrateLegacySlot() {
  if (RESIDUE_API) return;
  const old = lsGet('residue_save');
  if (old && !lsGet(LS_SLOT(1))) { try { lsSet(LS_SLOT(1), old); localStorage.removeItem('residue_save'); } catch (e) { /* 存不下就算了，旧档还在 */ } }
}
// 槽位信息（给存档 / 读档界面用）
// state：'empty' 空 | 'ok' 正常 | 'backup' 主档损坏、备份可用 | 'corrupt' 都坏了
function slotInfo(n) {
  const main = readSlotRaw(n), data = parseSave(main);
  const bak = data ? null : parseSave(readSlotRaw(n, true));
  const d = data || bak;
  const state = data ? 'ok' : bak ? 'backup' : main ? 'corrupt' : 'empty';
  const m = (d && d.meta) || {};
  return {
    n, state, data: d,
    map: m.map || (d && LEVELS[d.map] ? LEVELS[d.map].name : d ? LEVELS.map1.name : ''),
    room: m.room || '', time: d ? +d.time || 0 : 0, savedAt: +m.savedAt || 0, saves: d && d.stats ? d.stats.saves || 0 : 0,
    hp: d && d.p ? d.p.hp : 0,
  };
}
function listSlots() { migrateLegacySlot(); return Array.from({ length: SLOT_COUNT }, (_, i) => slotInfo(i + 1)); }
// “继续”：最近保存的那个槽
function latestSlot() {
  const ok = listSlots().filter(s => s.state === 'ok' || s.state === 'backup');
  if (!ok.length) return null;
  return ok.reduce((a, b) => (b.savedAt > a.savedAt ? b : a)).n;
}
// 读取某个槽：主档坏了就读备份
function loadSlot(n) {
  const info = slotInfo(n);
  if (info.state === 'empty' || info.state === 'corrupt') { sfx('locked'); msg(info.state === 'empty' ? '这个存档槽是空的。' : '存档和备份都损坏了，无法读取。', 3); return false; }
  loadGame(JSON.stringify(info.data));
  CUR_SLOT = n;
  if (info.state === 'backup') msg(`存档 ${n} 损坏，已读取上一次的自动备份。`, 5);
  return true;
}
const fmtTime = sec => { sec = Math.floor(sec); const h = Math.floor(sec / 3600), m = Math.floor(sec / 60) % 60, s = sec % 60; return (h ? h + ':' : '') + String(m).padStart(h ? 2 : 1, '0') + ':' + String(s).padStart(2, '0'); };
const fmtDate = ms => { if (!ms) return ''; const d = new Date(ms), z = v => String(v).padStart(2, '0'); return `${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())} ${z(d.getHours())}:${z(d.getMinutes())}`; };
