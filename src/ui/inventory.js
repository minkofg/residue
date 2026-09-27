'use strict';
// 物品栏界面（打开时游戏暂停）。背包不限格数，格子多了就滚动（滚轮 / 方向键）
// 物品栏分两页，F 切换（也可以点页签）：
//   物品：方向键 / WASD 移动，E / 回车 使用或装备，C 组合草药，Q 快速治疗
//   文件：拿到过的全部文件，↑↓ 选择、←→ 翻页、滚轮滚动，E / 回车 阅读全文（读完回到这一页）
//   Tab / Esc 关闭。以前文件只能按数字键 1–9 打开，第 10 份起就打不开了。

const INV_COLS = INV_ROW;   // 一行几格（config/items.js）
let uiRects = []; // 本帧可点击的区域：{ x, y, w, h, side, i }

function openInventory() { mode = 'inv'; P.invSel = -1; P.invCur = clamp(P.invCur || 0, 0, inv().size - 1); setInvTab(P.invTab || 'items'); }
function setInvTab(t) { P.invTab = t === 'files' ? 'files' : 'items'; P.fileCur = clamp(P.fileCur || 0, 0, Math.max(0, S.p.files.length - 1)); }
// 文件来自哪张地图：地图 2 的文件编号是 m2f…，地图 3 是 m3f…，其余是地图 1
function fileMapName(id) { return id.startsWith('m3') ? '制药厂' : id.startsWith('m2') ? '研究所' : '宅邸'; }
function moveFileCursor(d, wrap) {
  const n = S.p.files.length; if (!n) return;
  const c = (P.fileCur || 0) + d;
  P.fileCur = wrap ? (c + n) % n : clamp(c, 0, n - 1);
}
function filesKey(e) {
  const d = keyDir(e.code), page = Math.max(1, (P.fileRows || 10) - 1);
  switch (e.code) {
    case 'Escape': case 'Tab': case 'KeyI': mode = 'play'; return;
    case 'KeyE': case 'Enter': case 'Space': if (S.p.files.length) openFile(S.p.files[P.fileCur], 'inv'); return;
    case 'PageUp': moveFileCursor(-page); return;
    case 'PageDown': moveFileCursor(page); return;
    case 'Home': P.fileCur = 0; return;
    case 'End': P.fileCur = Math.max(0, S.p.files.length - 1); return;
    case 'KeyQ': quickHeal(); return;
  }
  if (d) { if (d[1]) moveFileCursor(d[1], true); else moveFileCursor(d[0] * page); }
}
// 滚轮：文件页上下移动，物品页上下换行
function invWheel(dir) { if (P.invTab === 'files') moveFileCursor(dir); else moveGridCursor(0, dir); }

function moveGridCursor(dx, dy) {
  const n = inv().size, c = P.invCur;
  let x = c % INV_COLS + dx, y = Math.floor(c / INV_COLS) + dy;
  const rows = Math.ceil(n / INV_COLS);
  y = (y + rows) % rows; x = (x + INV_COLS) % INV_COLS;
  P.invCur = Math.min(n - 1, y * INV_COLS + x);
}
function keyDir(code) {
  return ({ ArrowLeft: [-1, 0], KeyA: [-1, 0], ArrowRight: [1, 0], KeyD: [1, 0], ArrowUp: [0, -1], KeyW: [0, -1], ArrowDown: [0, 1], KeyS: [0, 1] })[code] || null;
}

function invKey(e) {
  if (e.code === 'KeyF' && P.invSel < 0) { setInvTab(P.invTab === 'files' ? 'items' : 'files'); return; }
  if (P.invTab === 'files') { filesKey(e); return; }
  const d = keyDir(e.code);
  if (d) { moveGridCursor(d[0], d[1]); return; }
  const s = inv().slots[P.invCur];
  switch (e.code) {
    case 'Escape': if (P.invSel >= 0) { P.invSel = -1; msg('取消组合。', 1.5); } else mode = 'play'; return;
    case 'Tab': case 'KeyI': mode = 'play'; return;
    case 'KeyE': case 'Enter': case 'Space':
      if (P.invSel >= 0) { combineSlots(P.invSel, P.invCur); P.invSel = -1; } else useSlot(P.invCur);
      return;
    case 'KeyC':
      if (P.invSel >= 0) { combineSlots(P.invSel, P.invCur); P.invSel = -1; }
      else if (s && ITEMS[s.id].kind === 'herb') { P.invSel = P.invCur; msg('选择要组合的另一株草药，再按 C 或 E。', 3); }
      else msg('只有草药可以组合。', 1.8);
      return;
    case 'KeyQ': quickHeal(); return;
  }
}

// 鼠标：点一下选中，再点一下同一个 = 按 E
function invClick(mx, my) {
  const r = uiRects.find(r => mx >= r.x && mx <= r.x + r.w && my >= r.y && my <= r.y + r.h);
  if (!r) return;
  if (r.side === 'tab') { setInvTab(r.i); return; }
  if (r.side === 'file') { const again = P.fileCur === r.i; P.fileCur = r.i; if (again) openFile(S.p.files[r.i], 'inv'); return; }
  const again = P.invCur === r.i;
  P.invCur = r.i;
  if (again) invKey({ code: 'KeyE', key: 'e' });
}

// ---------------------------------------------------------------- 绘制
function drawItemIcon(id, cx, cy, s = 1) {
  const d = ITEMS[id];
  ctx.save(); ctx.translate(cx, cy); ctx.scale(s, s);
  if (d.kind === 'weapon') {
    ctx.fillStyle = '#1a1a1a';
    if (id === 'shotgun') { ctx.fillStyle = '#4a3218'; ctx.fillRect(-24, -3, 14, 7); ctx.fillStyle = '#1a1a1a'; ctx.fillRect(-10, -3, 34, 5); ctx.fillStyle = '#5a3a1a'; ctx.fillRect(2, 2, 10, 5); }
    else { ctx.fillRect(-12, -6, 24, 7); ctx.fillStyle = '#2a2a2a'; ctx.fillRect(-10, 0, 7, 11); ctx.fillStyle = d.col; ctx.fillRect(-12, -6, 24, 2); }
  } else if (d.kind === 'throw') {
    ctx.scale(1.2, 1.2); drawThrowIcon(ctx, id);
  } else if (d.kind === 'ammo') {
    ctx.fillStyle = id === 'ammo_shotgun' ? '#6b1a18' : id === 'ammo_smg' ? '#2a3a4a' : id === 'ammo_magnum' ? '#3a2a14' : '#5d4b22'; ctx.fillRect(-13, -9, 26, 18);
    ctx.fillStyle = d.col; for (let i = 0; i < 5; i++) ctx.fillRect(-11 + i * 5, -7, 3, 6);
    ctx.fillStyle = '#eee'; ctx.fillRect(-11, 3, 22, 2);
  } else if (d.kind === 'herb') {
    const cols = id === 'mix_grb' ? ['#5fd06a', '#d05050', '#4f9bd0'] : id === 'mix_gr' ? ['#5fd06a', '#d05050'] : id === 'mix_gb' ? ['#5fd06a', '#4f9bd0'] : id === 'mix_gg' ? ['#5fd06a', '#3fa04a'] : [d.col];
    if (id.startsWith('mix')) { ctx.fillStyle = 'rgba(220,220,200,0.25)'; ctx.fillRect(-10, -12, 20, 24); ctx.strokeStyle = '#ccc'; ctx.strokeRect(-10, -12, 20, 24); }
    cols.forEach((c, k) => { ctx.fillStyle = c; for (let i = 0; i < 5; i++) { ctx.save(); ctx.translate((k - (cols.length - 1) / 2) * 6, 0); ctx.rotate(i * 1.26); ctx.beginPath(); ctx.ellipse(6, 0, 7, 3.2, 0, 0, 7); ctx.fill(); ctx.restore(); } });
  } else if (id === 'spray') {
    ctx.fillStyle = '#e6e6e6'; ctx.fillRect(-6, -13, 12, 26); ctx.fillStyle = '#888'; ctx.fillRect(-3, -17, 6, 5);
    ctx.fillStyle = '#2a9a3a'; ctx.fillRect(-1.5, -6, 3, 11); ctx.fillRect(-5, -2, 10, 3);
  }
  ctx.restore();
}

// 背包格子。不限格数：放不下时只画能放下的几行，跟着光标滚动（滚轮 / 方向键），右边有滚动条。返回占用的高度
function drawInvGrid(x, y, cell, maxRows) {
  const v = inv(), gap = 8, n = v.size, rows = Math.ceil(n / INV_COLS), vis = Math.max(1, Math.min(rows, maxRows));
  P.invCur = clamp(P.invCur || 0, 0, n - 1);
  const cur = Math.floor(P.invCur / INV_COLS);
  let top = clamp(P.invTop || 0, 0, Math.max(0, rows - vis));
  if (cur < top) top = cur;
  if (cur >= top + vis) top = cur - vis + 1;
  P.invTop = top;
  for (let r = 0; r < vis; r++) for (let c = 0; c < INV_COLS; c++) {
    const i = (top + r) * INV_COLS + c; if (i >= n) break;
    const cx = x + c * (cell + gap), cy = y + r * (cell + gap), s = v.slots[i];
    ctx.fillStyle = 'rgba(30,24,18,0.9)'; ctx.fillRect(cx, cy, cell, cell);
    ctx.strokeStyle = '#4a3e2a'; ctx.lineWidth = 1; ctx.strokeRect(cx + .5, cy + .5, cell - 1, cell - 1);
    if (s) {
      drawItemIcon(s.id, cx + cell / 2, cy + cell / 2 - 8, cell / 64);
      ctx.textAlign = 'center'; ctx.font = '12px sans-serif'; ctx.fillStyle = ITEMS[s.id].col;
      ctx.fillText(ITEMS[s.id].short, cx + cell / 2, cy + cell - 9);
      if (ITEMS[s.id].max > 1) { ctx.textAlign = 'right'; ctx.font = 'bold 13px sans-serif'; ctx.fillStyle = '#fff'; ctx.fillText(s.n, cx + cell - 6, cy + 16); }
      if (ITEMS[s.id].kind === 'weapon' && S.p.wep === s.id) { ctx.textAlign = 'left'; ctx.font = 'bold 11px sans-serif'; ctx.fillStyle = '#ffe9a0'; ctx.fillText('装备', cx + 5, cy + 15); }
    }
    if (P.invSel === i) { ctx.strokeStyle = '#e8a040'; ctx.lineWidth = 3; ctx.strokeRect(cx + 2, cy + 2, cell - 4, cell - 4); }
    if (P.invCur === i) { ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.strokeRect(cx - 2, cy - 2, cell + 4, cell + 4); }
    uiRects.push({ x: cx, y: cy, w: cell, h: cell, side: 0, i });
  }
  ctx.lineWidth = 1;
  const h = vis * (cell + gap);
  if (rows > vis) {   // 滚动条，下面一行字说明还有几行没显示
    const bx = x + INV_COLS * (cell + gap) - 2, th = Math.max(16, (h - gap) * vis / rows), ty = y + (h - gap - th) * top / (rows - vis);
    ctx.fillStyle = 'rgba(107,90,58,0.25)'; ctx.fillRect(bx, y, 4, h - gap);
    ctx.fillStyle = '#8a7a5a'; ctx.fillRect(bx, ty, 4, th);
    ctx.textAlign = 'left'; ctx.font = '12px sans-serif';
    ctx.fillText([top > 0 ? `▲ 上面还有 ${top} 行` : '', top + vis < rows ? `▼ 下面还有 ${rows - top - vis} 行` : '', '（滚轮 / 方向键翻看）'].filter(Boolean).join('　'), x, y + h + 8);
  }
  return h;
}

function itemDescription(id) {
  const d = ITEMS[id];
  if (d.kind === 'weapon') return `装弹 ${S.p.mag[id] || 0}，备弹 ${ammoCount(id)}。E 装备。`;
  if (d.kind === 'ammo' && d.weapon === 'gl') return `一格最多 ${d.max} 发。榴弹发射器装着弹时按 R 换成下一种弹。${d === ITEMS.ammo_acid ? '腐蚀 8 秒：之后受到的伤害 ×1.5。' : d === ITEMS.ammo_bomb ? '大范围爆炸，别贴脸打。' : '留下一片火场，蔓生体怕火。'}`;
  if (d.kind === 'ammo') return `一格最多 ${d.max} 发。装备对应武器后按 R 装填。`;
  if (id === 'herb_r') return '单独使用无效。与绿色草药组合：恢复 100，并且 60 秒内受到的伤害 -20%。';
  if (id === 'herb_b') return '解毒。与绿色草药组合：恢复 40 并解毒。';
  const parts = [];
  if (d.heal) parts.push(d.heal >= 100 ? '完全恢复' : `恢复 ${d.heal}`);
  if (d.guard) parts.push(`${d.guard} 秒内受到的伤害 -20%`);
  if (d.cure) parts.push('解毒');
  return parts.join('，') + '。' + (id === 'herb_g' ? '可以和其他草药组合（C）。' : '');
}

function drawLastMsg(x, y) {
  const m = msgs[msgs.length - 1]; if (!m) return;
  ctx.textAlign = 'left'; ctx.font = '14px sans-serif'; ctx.fillStyle = '#e8dcb0'; ctx.fillText(m.t, x, y);
}

function drawInventory() {
  uiRects = [];
  ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(0, 0, W, H);
  const w = Math.min(860, W - 40), h = Math.min(540, H - 40), x = (W - w) / 2, y = (H - h) / 2, p = S.p;
  drawPanel(x, y, w, h);
  const tabsEnd = drawInvTabs(x + 30, y + 44);
  if (P.invTab === 'files') { drawFilesPage(x, y, w, h); return; }
  ctx.textAlign = 'left'; ctx.font = '14px sans-serif'; ctx.fillStyle = '#8a7a5a';
  ctx.fillText(`已用 ${invUsed()} 格 · 背包不限格数`, tabsEnd, y + 43);
  // 格子多了就缩小一点，一屏最多摆 6 行（试玩反馈「背包好像不是无限的」：原来固定 4 行，多出来的藏在下面不容易发现）
  const rows = Math.ceil(inv().size / INV_COLS), showRows = clamp(rows, 4, 6);
  const cell = Math.min(80, Math.floor((h - 150) / showRows) - 8);
  drawInvGrid(x + 30, y + 66, cell, Math.max(2, Math.floor((h - 150) / (cell + 8))));
  // 右侧：说明、关键道具、文件
  const fx = x + 30 + INV_COLS * (cell + 8) + 24, fw = x + w - 30 - fx; let fy = y + 80;
  const s = inv().slots[P.invCur];
  ctx.textAlign = 'left';
  if (s) {
    ctx.font = 'bold 17px sans-serif'; ctx.fillStyle = ITEMS[s.id].col; ctx.fillText(ITEMS[s.id].name + (ITEMS[s.id].max > 1 ? `  ×${s.n}` : ''), fx, fy); fy += 24;
    ctx.font = '14px sans-serif'; ctx.fillStyle = '#ccc'; fy = wrapText(itemDescription(s.id), fx, fy, fw, 20) + 8;
  } else { ctx.font = '14px sans-serif'; ctx.fillStyle = '#666'; ctx.fillText('（空格子）', fx, fy); fy += 30; }
  fy += 6; ctx.font = '14px sans-serif'; ctx.fillStyle = '#8a7a5a'; ctx.fillText('— 关键道具（不占格子）—', fx, fy); fy += 24;
  const ks = Object.keys(KEYS).filter(k => p.keys[k]);
  if (!ks.length) { ctx.fillStyle = '#666'; ctx.fillText('（无）', fx, fy); fy += 24; }
  else ks.forEach(k => { ctx.fillStyle = KEYS[k].col; ctx.fillText('◆ ' + KEYS[k].name, fx, fy); fy += 22; });
  fy += 10; ctx.fillStyle = '#8a7a5a'; ctx.fillText(`— 文件 ${p.files.length} 份（按 F 查看）—`, fx, fy); fy += 30;
  ctx.fillStyle = '#8a8a8a';
  const t = Math.floor(S.time);
  ctx.fillText(`生命 ${Math.ceil(p.hp)}` + (p.guardT > 0 ? `  · 减伤剩余 ${Math.ceil(p.guardT)} 秒` : '') + `  · 游戏时间 ${Math.floor(t / 60)}分${t % 60}秒`, fx, fy);
  drawLastMsg(x + 30, y + h - 46);
  ctx.textAlign = 'center'; ctx.fillStyle = '#6a5a40'; ctx.font = '13px sans-serif';
  ctx.fillText(P.invSel >= 0 ? '选择另一株草药 → C / E 组合 · Esc 取消' : '方向键 / WASD 选择 · E 使用或装备 · C 组合草药 · Q 快速治疗 · F 文件 · 鼠标点两下 = 使用 · Tab / Esc 关闭', W / 2, y + h - 18);
}

// 页签：物品 / 文件（点击也能切换）
function drawInvTabs(x, y) {
  const tabs = [['items', '物 品'], ['files', `文 件（${S.p.files.length}）`]];
  ctx.textAlign = 'left'; ctx.font = 'bold 22px serif';
  for (const [id, label] of tabs) {
    const on = (P.invTab || 'items') === id, tw = ctx.measureText(label).width;
    ctx.fillStyle = on ? '#e8d9a8' : '#6a5a40'; ctx.fillText(label, x, y);
    if (on) { ctx.fillStyle = '#b08a4a'; ctx.fillRect(x, y + 7, tw, 2); }
    uiRects.push({ x: x - 6, y: y - 26, w: tw + 12, h: 38, side: 'tab', i: id });
    x += tw + 34;
  }
  return x;
}

// 文件页：左边列表（按拿到的顺序，标出来自哪张地图），右边预览；E 阅读全文
function drawFilesPage(x, y, w, h) {
  const files = S.p.files, n = files.length;
  const lx = x + 30, ly = y + 84, lw = Math.min(380, Math.floor((w - 60) * 0.48)), rowH = 30;
  const rows = Math.max(3, Math.floor((h - 164) / rowH)); P.fileRows = rows;
  ctx.textAlign = 'left'; ctx.font = '14px sans-serif';
  if (!n) {
    ctx.fillStyle = '#666'; ctx.fillText('还没有拿到文件。在地图上找到的日记、便条、报告都会收在这里，随时可以重读。', lx, ly + 20);
  } else {
    P.fileCur = clamp(P.fileCur || 0, 0, n - 1);
    let top = clamp(P.fileTop || 0, 0, Math.max(0, n - rows));
    if (P.fileCur < top) top = P.fileCur;
    if (P.fileCur >= top + rows) top = P.fileCur - rows + 1;
    P.fileTop = top;
    for (let k = 0; k < rows && top + k < n; k++) {
      const i = top + k, id = files[i], ry = ly + k * rowH, sel = i === P.fileCur;
      ctx.fillStyle = sel ? 'rgba(200,180,120,0.18)' : 'rgba(30,24,18,0.7)'; ctx.fillRect(lx, ry, lw, rowH - 4);
      if (sel) { ctx.strokeStyle = '#fff'; ctx.lineWidth = 1; ctx.strokeRect(lx + .5, ry + .5, lw - 1, rowH - 5); }
      ctx.textAlign = 'left'; ctx.fillStyle = '#8a7a5a'; ctx.fillText(`${i + 1}.`, lx + 8, ry + 18);
      ctx.fillStyle = sel ? '#fff4d8' : '#e4d9bd'; ctx.fillText(FILES[id].title, lx + 40, ry + 18);
      ctx.textAlign = 'right'; ctx.fillStyle = '#6a5a40'; ctx.fillText(fileMapName(id), lx + lw - 8, ry + 18);
      uiRects.push({ x: lx, y: ry, w: lw, h: rowH - 4, side: 'file', i });
    }
    ctx.textAlign = 'center'; ctx.fillStyle = '#8a7a5a'; ctx.font = '12px sans-serif';
    if (top > 0) ctx.fillText(`▲ 上面还有 ${top} 份`, lx + lw / 2, ly - 8);
    if (top + rows < n) ctx.fillText(`▼ 下面还有 ${n - top - rows} 份`, lx + lw / 2, ly + rows * rowH + 10);
    // 预览：标题、来源，正文超出部分裁掉（E 看全文）
    const f = FILES[files[P.fileCur]], px = lx + lw + 26, pw = x + w - 30 - px, ph = rows * rowH - 30;
    ctx.textAlign = 'left'; ctx.font = 'bold 17px serif'; ctx.fillStyle = '#e8d9a8'; ctx.fillText(f.title, px, ly + 18);
    ctx.font = '12px sans-serif'; ctx.fillStyle = '#6a5a40'; ctx.fillText(`${fileMapName(files[P.fileCur])} · 第 ${P.fileCur + 1} / ${n} 份`, px, ly + 38);
    ctx.save(); ctx.beginPath(); ctx.rect(px, ly + 48, pw, ph - 20); ctx.clip();
    ctx.font = '14px serif'; ctx.fillStyle = '#bdb29a'; wrapText(f.body, px, ly + 68, pw, 21);
    ctx.restore();
    ctx.font = '13px sans-serif'; ctx.fillStyle = '#b08a4a'; ctx.fillText('E / 回车 阅读全文', px, ly + ph + 14);
  }
  drawLastMsg(x + 30, y + h - 46);
  ctx.textAlign = 'center'; ctx.fillStyle = '#6a5a40'; ctx.font = '13px sans-serif';
  ctx.fillText('↑↓ 选择 · ←→ 翻页 · 滚轮滚动 · E / 回车 阅读 · 鼠标点两下 = 阅读 · F 回到物品 · Tab / Esc 关闭', W / 2, y + h - 18);
}
