'use strict';
// 菜单：标题菜单、存档槽（存档 / 读档）、设置、操作说明、暂停菜单
// 菜单之间用栈返回：从哪里打开，Esc 就回到哪里。

const MENU = { cur: 0, stack: [], purpose: 'save', confirm: null, rects: [], slots: [], pauseCur: 0, titleCur: null };
const MENU_MODES = ['slots', 'settings', 'keys'];
const isMenuMode = m => MENU_MODES.includes(m);
const menuOverTitle = () => isMenuMode(mode) && MENU.stack[0] === 'title';
const UP = ['ArrowUp', 'KeyW'], DOWN = ['ArrowDown', 'KeyS'], LEFT = ['ArrowLeft', 'KeyA'], RIGHT = ['ArrowRight', 'KeyD'], OK = ['Enter', 'KeyE', 'Space'];

function refreshSlots() { MENU.slots = listSlots(); }
function openMenu(m) { MENU.stack.push(mode); mode = m; modeT = 0; MENU.cur = 0; MENU.confirm = null; }
function closeMenu() {
  if (mode === 'settings') saveSettings();
  mode = MENU.stack.pop() || 'title'; modeT = 0; MENU.confirm = null;
  if (mode === 'title') { MENU.stack = []; refreshSlots(); }
}
function goTitle() { mode = 'title'; modeT = 0; MENU.stack = []; MENU.titleCur = null; MENU.confirm = null; refreshSlots(); }

// ---------------------------------------------------------------- 标题菜单
function titleItems() {
  const latest = latestSlot(), any = MENU.slots.some(s => s.state !== 'empty');
  const it = [];
  if (latest) it.push({ id: 'continue', label: `继续（存档 ${latest}）` });
  it.push({ id: 'new', label: '新游戏' });
  if (any) it.push({ id: 'load', label: '读取存档' });
  it.push({ id: 'settings', label: '设置' }, { id: 'keys', label: '操作说明' });
  if (RESIDUE_API && RESIDUE_API.quit) it.push({ id: 'quit', label: '退出游戏' });
  return it;
}
function titleAction(id) {
  if (id === 'continue') loadSlot(latestSlot());
  else if (id === 'new') { CUR_SLOT = null; startGame(false); }
  else if (id === 'load') openSlots('load');
  else if (id === 'settings') openMenu('settings');
  else if (id === 'keys') openMenu('keys');
  else if (id === 'quit') RESIDUE_API.quit();
}
function titleKey(e) {
  const items = titleItems();
  if (MENU.titleCur === null || MENU.titleCur >= items.length) MENU.titleCur = 0;
  if (UP.includes(e.code)) MENU.titleCur = (MENU.titleCur + items.length - 1) % items.length;
  else if (DOWN.includes(e.code)) MENU.titleCur = (MENU.titleCur + 1) % items.length;
  else if (OK.includes(e.code)) titleAction(items[MENU.titleCur].id);
  else if (e.code === 'KeyC' && latestSlot()) titleAction('continue');
}
function drawTitleMenu() {
  const items = titleItems();
  if (MENU.titleCur === null || MENU.titleCur >= items.length) MENU.titleCur = 0;
  MENU.rects = [];
  const x = W / 2, y0 = H * 0.74 - (items.length - 1) * 15;
  ctx.textAlign = 'center';
  items.forEach((it, i) => {
    const y = y0 + i * 30, sel = i === MENU.titleCur;
    ctx.font = sel ? 'bold 20px sans-serif' : '18px sans-serif';
    ctx.fillStyle = sel ? '#f0e2b8' : '#8a8070';
    ctx.fillText(sel ? `▸ ${it.label} ◂` : it.label, x, y);
    MENU.rects.push({ x: x - 120, y: y - 20, w: 240, h: 28, i });
  });
}

// ---------------------------------------------------------------- 存档槽
// purpose：'save'（打字机）或 'load'（标题菜单）
function openSlots(purpose) {
  refreshSlots(); openMenu('slots'); MENU.purpose = purpose;
  if (purpose === 'save') {
    const empty = MENU.slots.findIndex(s => s.state === 'empty');
    MENU.cur = CUR_SLOT ? CUR_SLOT - 1 : Math.max(0, empty);
  } else {
    const latest = latestSlot(); MENU.cur = latest ? latest - 1 : 0;
  }
}
function slotsActivate(i) {
  if (i === SLOT_COUNT) { closeMenu(); return; }  // “返回”
  const s = MENU.slots[i], n = i + 1;
  if (MENU.purpose === 'save') {
    // 覆盖别的存档（不是这局自己的）要再按一次确认
    if (s.state !== 'empty' && n !== CUR_SLOT && MENU.confirm !== n) { MENU.confirm = n; sfx('locked'); return; }
    MENU.stack = []; mode = 'play'; MENU.confirm = null;
    saveGame(n); refreshSlots();
  } else {
    if (s.state === 'empty' || s.state === 'corrupt') { sfx('locked'); return; }
    MENU.stack = []; MENU.confirm = null;
    loadSlot(n);
  }
}
function slotsKey(e) {
  const rows = SLOT_COUNT + 1;
  if (e.code === 'Escape') { closeMenu(); return; }
  if (UP.includes(e.code)) { MENU.cur = (MENU.cur + rows - 1) % rows; MENU.confirm = null; }
  else if (DOWN.includes(e.code)) { MENU.cur = (MENU.cur + 1) % rows; MENU.confirm = null; }
  else if (OK.includes(e.code)) slotsActivate(MENU.cur);
  else if (e.code === 'Delete' && MENU.purpose === 'load' && MENU.cur < SLOT_COUNT && MENU.slots[MENU.cur].state !== 'empty') {
    // 删除存档：按两次 Delete
    const n = MENU.cur + 1;
    if (MENU.confirm !== 'del' + n) { MENU.confirm = 'del' + n; sfx('locked'); return; }
    deleteSlotRaw(n); if (CUR_SLOT === n) CUR_SLOT = null; MENU.confirm = null; refreshSlots(); sfx('door');
    if (!MENU.slots.some(s => s.state !== 'empty')) goTitle();
  }
}
function deleteSlotRaw(n) {
  if (RESIDUE_API) { try { RESIDUE_API.deleteSlot(n); } catch (e) { /* 删除失败就保留 */ } }
  else { try { localStorage.removeItem(LS_SLOT(n)); localStorage.removeItem(LS_BAK(n)); } catch (e) { /* 同上 */ } }
  MENU.slots[n - 1] = { n, state: 'empty' };
}
function drawSlots() {
  panelBg();
  const save = MENU.purpose === 'save';
  ctx.textAlign = 'center'; ctx.font = 'bold 30px serif'; ctx.fillStyle = '#d8c9a0';
  ctx.fillText(save ? '保存进度' : '读取存档', W / 2, H * 0.17);
  MENU.rects = [];
  const w = Math.min(640, W - 80), x = W / 2 - w / 2, h = 78, y0 = H * 0.24;
  for (let i = 0; i < SLOT_COUNT; i++) {
    const s = MENU.slots[i], y = y0 + i * (h + 12), sel = i === MENU.cur, n = i + 1;
    ctx.fillStyle = sel ? 'rgba(90,70,40,0.55)' : 'rgba(20,16,12,0.8)'; ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = sel ? '#e0c080' : 'rgba(150,130,90,0.35)'; ctx.lineWidth = sel ? 2 : 1; ctx.strokeRect(x + .5, y + .5, w - 1, h - 1);
    ctx.textAlign = 'left'; ctx.font = 'bold 18px serif'; ctx.fillStyle = '#e8dcc0';
    ctx.fillText(`存档 ${n}` + (n === CUR_SLOT ? '（当前）' : ''), x + 18, y + 30);
    ctx.font = '14px sans-serif';
    if (s.state === 'empty') { ctx.fillStyle = '#777'; ctx.fillText('—— 空 ——', x + 18, y + 56); }
    else if (s.state === 'corrupt') { ctx.fillStyle = '#c55'; ctx.fillText('存档和备份都已损坏', x + 18, y + 56); }
    else {
      ctx.fillStyle = '#bfb296'; ctx.fillText(`${s.map}${s.room ? ' · ' + s.room : ''}`, x + 18, y + 56);
      ctx.textAlign = 'right'; ctx.fillStyle = '#9a8f7a';
      ctx.fillText(`游戏时间 ${fmtTime(s.time)} · 存档 ${s.saves} 次`, x + w - 18, y + 30);
      ctx.fillText(fmtDate(s.savedAt), x + w - 18, y + 56);
      if (s.state === 'backup') { ctx.fillStyle = '#e0a040'; ctx.fillText('主档损坏，将读取自动备份', x + w - 18, y + 72); }
    }
    if (sel && MENU.confirm === n) { ctx.textAlign = 'right'; ctx.fillStyle = '#ff9a70'; ctx.font = 'bold 14px sans-serif'; ctx.fillText('再按一次覆盖这个存档', x + w - 18, y + 72); }
    if (sel && MENU.confirm === 'del' + n) { ctx.textAlign = 'right'; ctx.fillStyle = '#ff6a50'; ctx.font = 'bold 14px sans-serif'; ctx.fillText('再按一次 Delete 删除（不能恢复）', x + w - 18, y + 72); }
    MENU.rects.push({ x, y, w, h, i });
  }
  const by = y0 + SLOT_COUNT * (h + 12) + 10, sel = MENU.cur === SLOT_COUNT;
  ctx.textAlign = 'center'; ctx.font = sel ? 'bold 18px sans-serif' : '17px sans-serif'; ctx.fillStyle = sel ? '#f0e2b8' : '#8a8070';
  ctx.fillText(sel ? '▸ 返回 ◂' : '返回', W / 2, by + 20);
  MENU.rects.push({ x: W / 2 - 80, y: by, w: 160, h: 30, i: SLOT_COUNT });
  ctx.font = '13px sans-serif'; ctx.fillStyle = '#777';
  ctx.fillText(save ? '↑↓ 选择 · 回车 / E 保存 · Esc 取消' : '↑↓ 选择 · 回车 / E 读取 · Delete 删除 · Esc 返回', W / 2, by + 56);
}

// ---------------------------------------------------------------- 设置
const SETTING_ROWS = [
  { k: 'master', label: '总音量', type: 'vol' },
  { k: 'sfx', label: '音效', type: 'vol' },
  { k: 'ambient', label: '环境音', type: 'vol' },
  { k: 'stereo', label: '声道', type: 'bool', on: '立体声', off: '单声道' },
  { k: 'grain', label: '画面颗粒', type: 'bool', on: '开', off: '关' },
  { k: 'fullscreen', label: '全屏', type: 'bool', on: '开', off: '关' },
  { id: 'keys', label: '操作说明' },
  { id: 'reset', label: '恢复默认' },
  { id: 'back', label: '返回' },
];
function changeSetting(row, dir) {
  if (row.type === 'vol') {
    const v = Math.round(clamp(SETTINGS[row.k] + dir * 0.1, 0, 1) * 10) / 10;
    if (v === SETTINGS[row.k]) return;
    SETTINGS[row.k] = v; applySettings(); if (row.k !== 'ambient') sfx('pickup');  // 试听
  } else if (row.type === 'bool') {
    if (row.k === 'fullscreen') setFullscreen(!SETTINGS.fullscreen);
    else { SETTINGS[row.k] = !SETTINGS[row.k]; applySettings(); }
  }
}
function settingsActivate(i) {
  const row = SETTING_ROWS[i];
  if (row.type === 'bool') changeSetting(row, 1);
  else if (row.id === 'keys') openMenu('keys');
  else if (row.id === 'reset') { const fs = SETTINGS.fullscreen; SETTINGS = { ...SETTINGS_DEFAULT, fullscreen: fs }; applySettings(); sfx('pickup'); }
  else if (row.id === 'back') closeMenu();
}
function settingsKey(e) {
  const n = SETTING_ROWS.length;
  if (e.code === 'Escape') { closeMenu(); return; }
  if (UP.includes(e.code)) MENU.cur = (MENU.cur + n - 1) % n;
  else if (DOWN.includes(e.code)) MENU.cur = (MENU.cur + 1) % n;
  else if (LEFT.includes(e.code)) changeSetting(SETTING_ROWS[MENU.cur], -1);
  else if (RIGHT.includes(e.code)) changeSetting(SETTING_ROWS[MENU.cur], 1);
  else if (OK.includes(e.code)) settingsActivate(MENU.cur);
}
function drawSettings() {
  panelBg();
  ctx.textAlign = 'center'; ctx.font = 'bold 30px serif'; ctx.fillStyle = '#d8c9a0'; ctx.fillText('设 置', W / 2, H * 0.15);
  MENU.rects = [];
  const w = Math.min(560, W - 80), x = W / 2 - w / 2, rh = 40, y0 = H * 0.21;
  SETTING_ROWS.forEach((row, i) => {
    const y = y0 + i * rh + (row.id ? 14 : 0), sel = i === MENU.cur;
    if (sel) { ctx.fillStyle = 'rgba(90,70,40,0.45)'; ctx.fillRect(x, y, w, rh - 6); }
    ctx.textAlign = 'left'; ctx.font = sel ? 'bold 17px sans-serif' : '16px sans-serif'; ctx.fillStyle = sel ? '#f0e2b8' : '#b0a488';
    ctx.fillText(row.label, x + 16, y + 23);
    const vx = x + w * 0.42, vw = w * 0.58 - 16;
    if (row.type === 'vol') {
      const v = SETTINGS[row.k];
      ctx.fillStyle = 'rgba(255,255,255,0.12)'; ctx.fillRect(vx, y + 13, vw - 56, 8);
      ctx.fillStyle = sel ? '#e0c080' : '#9a8a60'; ctx.fillRect(vx, y + 13, (vw - 56) * v, 8);
      ctx.textAlign = 'right'; ctx.fillStyle = '#ddd'; ctx.fillText(`${Math.round(v * 100)}%`, x + w - 16, y + 23);
      MENU.rects.push({ x: vx, y, w: vw - 56, h: rh - 6, i, slider: row.k });
    } else if (row.type === 'bool') {
      ctx.textAlign = 'right'; ctx.fillStyle = SETTINGS[row.k] ? '#9fe08a' : '#aaa';
      ctx.fillText((sel ? '◂ ' : '') + (SETTINGS[row.k] ? row.on : row.off) + (sel ? ' ▸' : ''), x + w - 16, y + 23);
    }
    MENU.rects.push({ x, y, w, h: rh - 6, i });
  });
  ctx.textAlign = 'center'; ctx.font = '13px sans-serif'; ctx.fillStyle = '#777';
  const fy = y0 + SETTING_ROWS.length * rh + 34;
  ctx.fillText('↑↓ 选择 · ←→ 调节 · 回车 切换 · Esc 保存并返回', W / 2, fy);
  ctx.fillText('单声道：只有一个扬声器或单耳耳机时使用。背景音乐还没有，环境音是宅邸里的低鸣和风声。', W / 2, fy + 20);
}

// ---------------------------------------------------------------- 操作说明
const KEY_HELP = [
  ['移动', 'WASD'], ['奔跑（会发出声音）', '按住 左 Shift'], ['瞄准', '按住 右键 / 空格 / K'], ['持续瞄准开关', 'T'],
  ['射击', '左键 / J（瞄准时）'], ['小刀', 'F / V'], ['投掷（手雷 / 闪光弹）', 'G · X 切换'], ['装填（榴弹发射器装着弹时：换弹种）', 'R'], ['调查 · 开关门 · 拾取', 'E'],
  ['快速治疗 / 急救喷雾', 'Q / H'], ['切换武器', '1–5 / 鼠标滚轮'], ['物品栏（C 组合草药 · F 文件页）', 'Tab / I'], ['地图', 'M'],
  ['暂停菜单', 'Esc'], ['全屏', 'F11 / Alt+回车（桌面版）'],
];
function keysKey(e) { if (['Escape', 'Enter', 'KeyE', 'Space'].includes(e.code)) closeMenu(); }
function drawKeys() {
  panelBg();
  ctx.textAlign = 'center'; ctx.font = 'bold 30px serif'; ctx.fillStyle = '#d8c9a0'; ctx.fillText('操作说明', W / 2, H * 0.14);
  const w = Math.min(560, W - 80), x = W / 2 - w / 2, y0 = H * 0.2, rh = Math.min(30, (H * 0.68) / KEY_HELP.length);
  KEY_HELP.forEach(([a, k], i) => {
    const y = y0 + i * rh;
    ctx.textAlign = 'left'; ctx.font = '15px sans-serif'; ctx.fillStyle = '#b0a488'; ctx.fillText(a, x + 16, y + 20);
    ctx.textAlign = 'right'; ctx.fillStyle = '#eadcb0'; ctx.fillText(k, x + w - 16, y + 20);
  });
  ctx.textAlign = 'center'; ctx.font = '13px sans-serif'; ctx.fillStyle = '#777';
  ctx.fillText('建议戴耳机：怪物的位置能从左右声道听出来。Esc / 回车 返回', W / 2, y0 + KEY_HELP.length * rh + 30);
  MENU.rects = [{ x: 0, y: 0, w: W, h: H, i: 0 }];
}

// ---------------------------------------------------------------- 暂停菜单
const PAUSE_ITEMS = [{ id: 'resume', label: '继续游戏' }, { id: 'settings', label: '设置' }, { id: 'keys', label: '操作说明' }, { id: 'title', label: '回到标题' }];
function openPause() { mode = 'pause'; modeT = 0; MENU.pauseCur = 0; MENU.confirm = null; }
function pauseActivate(i) {
  const id = PAUSE_ITEMS[i].id;
  if (id === 'resume') mode = 'play';
  else if (id === 'settings') openMenu('settings');
  else if (id === 'keys') openMenu('keys');
  else if (id === 'title') {
    if (MENU.confirm !== 'title') { MENU.confirm = 'title'; sfx('locked'); return; }  // 没存的进度会丢，按两次
    goTitle();
  }
}
function pauseKey(e) {
  const n = PAUSE_ITEMS.length;
  if (e.code === 'Escape') { mode = 'play'; return; }
  if (UP.includes(e.code)) { MENU.pauseCur = (MENU.pauseCur + n - 1) % n; MENU.confirm = null; }
  else if (DOWN.includes(e.code)) { MENU.pauseCur = (MENU.pauseCur + 1) % n; MENU.confirm = null; }
  else if (OK.includes(e.code)) pauseActivate(MENU.pauseCur);
}
function drawPause() {
  ctx.fillStyle = 'rgba(0,0,0,0.65)'; ctx.fillRect(0, 0, W, H); ctx.textAlign = 'center';
  ctx.font = 'bold 40px serif'; ctx.fillStyle = '#d8c9a0'; ctx.fillText('暂 停', W / 2, H * 0.36);
  MENU.rects = [];
  PAUSE_ITEMS.forEach((it, i) => {
    const y = H * 0.46 + i * 34, sel = i === MENU.pauseCur;
    ctx.font = sel ? 'bold 19px sans-serif' : '17px sans-serif'; ctx.fillStyle = sel ? '#f0e2b8' : '#8a8070';
    ctx.fillText(sel ? `▸ ${it.label} ◂` : it.label, W / 2, y);
    MENU.rects.push({ x: W / 2 - 110, y: y - 21, w: 220, h: 30, i });
  });
  if (MENU.confirm === 'title') { ctx.font = 'bold 14px sans-serif'; ctx.fillStyle = '#ff9a70'; ctx.fillText('上次存档之后的进度会丢失。再按一次回到标题。', W / 2, H * 0.46 + PAUSE_ITEMS.length * 34 + 10); }
  ctx.font = '13px sans-serif'; ctx.fillStyle = '#777'; ctx.fillText('↑↓ 选择 · 回车 确定 · Esc 继续游戏', W / 2, H * 0.46 + PAUSE_ITEMS.length * 34 + 36);
  if (PLAYTEST_WARP) {
    // 独立面板放在左下角。之前是居中往下排，结果和底部的操作说明叠在一起糊成一片。
    const lh = 18, padX = 14, padY = 12;
    const bw = 390, bh = padY * 2 + 24 + WARPS.length * lh + 20;   // 390：放得下「宅邸 · 主厅雕像（徽章在手 → 酒窖、升降梯）」这种长名字
    const bx = 20, by = H - bh - 20;
    ctx.fillStyle = 'rgba(8,6,5,0.92)'; ctx.fillRect(bx, by, bw, bh);
    ctx.strokeStyle = '#6b5a3a'; ctx.lineWidth = 1; ctx.strokeRect(bx + .5, by + .5, bw - 1, bh - 1);
    ctx.textAlign = 'left';
    let y = by + padY + 13;
    ctx.font = 'bold 13px sans-serif'; ctx.fillStyle = '#c9a545';
    ctx.fillText(`试玩跳转 · ${WARP_STAGE_NAME[WARP_STAGE]} · 游戏中直接按`, bx + padX, y); y += 21;
    ctx.font = '12px sans-serif';
    for (const w of WARPS) {
      ctx.fillStyle = '#c9a545'; ctx.fillText(w.code, bx + padX, y);
      ctx.fillStyle = '#9a9080'; ctx.fillText(w.name, bx + padX + 62, y);
      y += lh;
    }
    ctx.fillStyle = '#6a6252'; ctx.font = '11px sans-serif';
    ctx.fillText('每次都从新开局跳 · 补满血 · 发补给 · 开跳过的门', bx + padX, y + 8);
    ctx.textAlign = 'center';
  }
}

// ---------------------------------------------------------------- 公用
function panelBg() { ctx.fillStyle = menuOverTitle() ? 'rgba(0,0,0,0.72)' : 'rgba(0,0,0,0.8)'; ctx.fillRect(0, 0, W, H); }
function drawMenu() {
  if (mode === 'slots') drawSlots();
  else if (mode === 'settings') drawSettings();
  else if (mode === 'keys') drawKeys();
}
function menuKey(e) {
  if (mode === 'title') titleKey(e);
  else if (mode === 'slots') slotsKey(e);
  else if (mode === 'settings') settingsKey(e);
  else if (mode === 'keys') keysKey(e);
  else if (mode === 'pause') pauseKey(e);
}
// 鼠标：悬停移动光标，点击执行；设置里点音量条直接设到点击的位置
const hitRect = (x, y) => { for (let k = 0; k < MENU.rects.length; k++) { const r = MENU.rects[k];  /* 音量条排在所在行前面，优先命中 */ if (x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h) return r; } return null; };
function setCur(i) { if (mode === 'title') MENU.titleCur = i; else if (mode === 'pause') MENU.pauseCur = i; else MENU.cur = i; }
function menuHover(x, y) { const r = hitRect(x, y); if (r && mode !== 'keys') { const before = mode === 'title' ? MENU.titleCur : mode === 'pause' ? MENU.pauseCur : MENU.cur; if (before !== r.i) { setCur(r.i); if (mode === 'slots') MENU.confirm = null; } } }
function menuClick(x, y) {
  const r = hitRect(x, y); if (!r) return;
  if (mode === 'keys') { closeMenu(); return; }
  setCur(r.i);
  if (mode === 'title') titleAction(titleItems()[r.i].id);
  else if (mode === 'pause') pauseActivate(r.i);
  else if (mode === 'slots') slotsActivate(r.i);
  else if (mode === 'settings') {
    if (r.slider) { SETTINGS[r.slider] = Math.round(clamp((x - r.x) / r.w, 0, 1) * 10) / 10; applySettings(); if (r.slider !== 'ambient') sfx('pickup'); }
    else settingsActivate(r.i);
  }
}
// 死亡画面：这局存过档就回到最近一次存档，否则重新开始
function deadCanLoad() { return !!CUR_SLOT && MENU.slots[CUR_SLOT - 1] && ['ok', 'backup'].includes(MENU.slots[CUR_SLOT - 1].state); }
