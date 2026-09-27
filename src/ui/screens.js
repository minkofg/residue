'use strict';
// 文件、物品栏、地图、标题、死亡、通关界面

// ---------------------------------------------------------------- 界面
function wrapText(t, x, y, maxW, lh) {
  for (const para of t.split('\n')) {
    if (!para) { y += lh * 0.6; continue; }
    let line = '';
    for (const ch of para) { if (ctx.measureText(line + ch).width > maxW) { ctx.fillText(line, x, y); y += lh; line = ch; } else line += ch; }
    ctx.fillText(line, x, y); y += lh;
  }
  return y;
}
function drawPanel(x, y, w, h) {
  ctx.fillStyle = 'rgba(8,6,5,0.92)'; ctx.fillRect(x, y, w, h);
  ctx.strokeStyle = '#6b5a3a'; ctx.lineWidth = 2; ctx.strokeRect(x + 1, y + 1, w - 2, h - 2);
  ctx.strokeStyle = 'rgba(107,90,58,0.4)'; ctx.lineWidth = 1; ctx.strokeRect(x + 7.5, y + 7.5, w - 15, h - 15);
}
function drawFile() {
  ctx.fillStyle = 'rgba(0,0,0,0.75)'; ctx.fillRect(0, 0, W, H);
  const w = Math.min(560, W - 40), h = Math.min(560, H - 40), x = (W - w) / 2, y = (H - h) / 2;
  ctx.fillStyle = '#e4d9bd'; ctx.fillRect(x, y, w, h);
  ctx.fillStyle = 'rgba(120,90,40,0.15)'; for (let i = 0; i < 6; i++) { ctx.beginPath(); ctx.arc(x + hash(i, 1) * w, y + hash(1, i) * h, 30 + hash(i, i) * 60, 0, 7); ctx.fill(); }
  ctx.fillStyle = '#2a1a10'; ctx.textAlign = 'center'; ctx.font = 'bold 22px serif'; ctx.fillText(fileView.title, W / 2, y + 48);
  ctx.fillStyle = '#7a1a1a'; ctx.fillRect(x + 40, y + 62, w - 80, 1.5);
  ctx.textAlign = 'left'; ctx.fillStyle = '#2a2018'; ctx.font = '16px serif';
  wrapText(fileView.body, x + 40, y + 100, w - 80, 26);
  ctx.textAlign = 'center'; ctx.fillStyle = '#6a5a40'; ctx.font = '13px sans-serif'; ctx.fillText(afterFile === 'inv' ? '按 E / 回车 / 点击 返回文件列表' : '按 E / 回车 / 点击 关闭 · 以后可以在物品栏（Tab）里按 F 重读', W / 2, y + h - 18);
}
function drawMap() {
  ctx.fillStyle = 'rgba(0,0,0,0.85)'; ctx.fillRect(0, 0, W, H);
  const sc = Math.min((W - 80) / (MW - 1), (H - 140) / (MH - 1)) * 0.95;
  const ox = (W - MW * sc) / 2, oy = 80;
  ctx.textAlign = 'center'; ctx.fillStyle = '#d8c9a0'; ctx.font = 'bold 22px serif'; ctx.fillText(`${LEVEL.name} · 地图`, W / 2, 50);
  ctx.font = '12px sans-serif';
  ROOMS.forEach((R, i) => {
    const vis = S.visited[R.id] || PLAYTEST_WARP;   // 试玩版：整张地图全部点亮，不用先走一遍
    const hasItems = S.items.some(it => !it.taken && !isProp(it.t) && Math.floor(it.x / T) >= R.x && Math.floor(it.x / T) < R.x + R.w && Math.floor(it.y / T) >= R.y && Math.floor(it.y / T) < R.y + R.h);
    ctx.fillStyle = !vis ? 'rgba(60,60,60,0.25)' : R.safe ? 'rgba(60,140,80,0.6)' : hasItems ? 'rgba(150,40,40,0.6)' : 'rgba(40,70,140,0.6)';
    ctx.fillRect(ox + R.x * sc, oy + R.y * sc, R.w * sc, R.h * sc);
    ctx.strokeStyle = vis ? '#bbb' : '#555'; ctx.strokeRect(ox + R.x * sc + .5, oy + R.y * sc + .5, R.w * sc - 1, R.h * sc - 1);
    ctx.fillStyle = vis ? '#eee' : '#777'; if (R.w > 3) ctx.fillText(vis ? R.name : '???', ox + (R.x + R.w / 2) * sc, oy + (R.y + R.h / 2) * sc + 4);
  });
  for (const [x, y] of DOORS) {
    const k = LOCKS[x + ',' + y], locked = grid[y * MW + x] === 3;
    const open = isDoorOpen(x, y);
    ctx.fillStyle = locked ? '#d45a68' : open ? '#86b36a' : '#e18a43'; ctx.fillRect(ox + x * sc + 1, oy + y * sc + 1, sc - 2, sc - 2);
    ctx.strokeStyle = locked ? '#ffd0d0' : '#261b12'; ctx.lineWidth = 1.5; ctx.strokeRect(ox + x * sc + 1.5, oy + y * sc + 1.5, sc - 3, sc - 3); ctx.lineWidth = 1;
  }
  // 当前位置：永远画出来，不做闪烁式的隐藏。
  // （旧写法用 S.time 控制闪烁，而 S.time 只在 mode==='play' 时推进；打开地图后它冻住，
  //   sin 变成常数，约 39% 的概率箭头在整个查看期间完全不显示。）
  // 改成用真实时钟做「呼吸光环」——动效还在，但箭头本体始终可见。
  {
    const p = S.p, px = ox + p.x / T * sc, py = oy + p.y / T * sc;
    const pulse = 0.5 + 0.5 * Math.sin(performance.now() / 1000 * 4);
    ctx.save(); ctx.translate(px, py);
    ctx.strokeStyle = `rgba(255,224,64,${0.15 + 0.35 * pulse})`; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(0, 0, 9 + 5 * pulse, 0, 7); ctx.stroke();
    ctx.rotate(p.a);
    ctx.beginPath(); ctx.moveTo(9, 0); ctx.lineTo(-6, -6); ctx.lineTo(-6, 6); ctx.closePath();
    ctx.fillStyle = '#ffe040'; ctx.fill();
    ctx.strokeStyle = '#3a2a06'; ctx.lineWidth = 1.5; ctx.stroke();  // 深色描边，压在任何底色上都看得见
    ctx.restore();
  }
  ctx.textAlign = 'left'; ctx.font = '13px sans-serif'; const ly = H - 36;
  [['rgba(150,40,40,0.8)', '还有道具'], ['rgba(40,70,140,0.8)', '已搜索完毕'], ['rgba(60,140,80,0.8)', '安全屋'], ['#ffe040', '当前位置']].forEach(([c, t], i) => { ctx.fillStyle = c; ctx.fillRect(40 + i * 130, ly - 11, 14, 14); ctx.fillStyle = '#ccc'; ctx.fillText(t, 60 + i * 130, ly); });
  ctx.textAlign = 'right'; ctx.fillStyle = '#6a5a40'; ctx.fillText('M / Esc 关闭', W - 30, ly);
}
function drawTitle(t) {
  ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, H);
  // 背景：模糊的宅邸剪影
  const g = ctx.createRadialGradient(W / 2, H * 0.35, 10, W / 2, H * 0.35, Math.max(W, H) * 0.7);
  g.addColorStop(0, '#1a0a08'); g.addColorStop(1, '#000'); ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = '#050303';
  const bx = W / 2, by = H * 0.62;
  ctx.fillRect(bx - 260, by - 90, 520, 200); ctx.fillRect(bx - 60, by - 160, 120, 90);
  ctx.beginPath(); ctx.moveTo(bx - 80, by - 160); ctx.lineTo(bx, by - 220); ctx.lineTo(bx + 80, by - 160); ctx.fill();
  ctx.beginPath(); ctx.moveTo(bx - 280, by - 90); ctx.lineTo(bx - 200, by - 140); ctx.lineTo(bx - 120, by - 90); ctx.fill();
  ctx.beginPath(); ctx.moveTo(bx + 120, by - 90); ctx.lineTo(bx + 200, by - 140); ctx.lineTo(bx + 280, by - 90); ctx.fill();
  for (let i = 0; i < 9; i++) { const lit = hash(i, Math.floor(t * 0.7)) > 0.8; ctx.fillStyle = lit ? 'rgba(200,140,60,0.5)' : 'rgba(40,20,10,0.6)'; ctx.fillRect(bx - 230 + i * 54, by - 60, 16, 24); }
  ctx.textAlign = 'center';
  const fl = Math.random() < 0.04 ? 0.3 : 1;
  ctx.globalAlpha = fl; ctx.font = 'bold 72px serif'; ctx.fillStyle = '#8a0e0e'; ctx.shadowColor = '#ff0000'; ctx.shadowBlur = 20;
  ctx.fillText('残 响 之 馆', W / 2, H * 0.25); ctx.shadowBlur = 0; ctx.globalAlpha = 1;
  ctx.font = '20px serif'; ctx.fillStyle = '#a89878'; ctx.fillText('R E S I D U E', W / 2, H * 0.25 + 40);
  ctx.font = '14px sans-serif'; ctx.fillStyle = '#6a6050'; ctx.fillText('一款俯视角生存恐怖游戏', W / 2, H * 0.25 + 68);
  ctx.font = '13px sans-serif'; ctx.fillStyle = '#666';
  ctx.fillText('↑↓ 选择 · 回车 确定 · 也可以用鼠标      （建议戴耳机）', W / 2, H - 28);  // 菜单本身由 ui/menus.js 画
}
function drawDead() {
  const a = clamp(modeT / 1.5, 0, 1);
  ctx.fillStyle = `rgba(60,0,0,${a * 0.7})`; ctx.fillRect(0, 0, W, H);
  ctx.globalAlpha = a; ctx.textAlign = 'center';
  ctx.font = 'bold 80px serif'; ctx.fillStyle = '#b00'; ctx.shadowColor = '#f00'; ctx.shadowBlur = 25; ctx.fillText('你 死 了', W / 2, H / 2 - 10); ctx.shadowBlur = 0;
  ctx.font = '18px sans-serif'; ctx.fillStyle = '#ddd';
  if (modeT > 1.2) { ctx.fillText(deadCanLoad() ? `按 回车 从存档 ${CUR_SLOT} 继续` : '按 回车 重新开始', W / 2, H / 2 + 50); ctx.fillStyle = '#999'; ctx.font = '14px sans-serif'; ctx.fillText('按 R 从头开始 · Esc 回到标题', W / 2, H / 2 + 80); }
  ctx.globalAlpha = 1;
}
// ---------------------------------------------------------------- 通关评级（计划 7.7，数值在 config/rank.js）
// 旧标准是 demo 的「10 分钟内 = S」，完整版首通 60–90 分钟，照旧标准人人都是 C。
// 现在：结算时间 = 通关时间 + 罚时（存档、治疗超出免罚次数的部分），按结算时间定档。
// 击倒数、命中率只展示不计分 —— 理由写在 config/rank.js 开头。

// 罚时：前 rule.free 次不算，之后每次 rule.per 秒
function rankPenalty(n, rule) { return Math.max(0, (n | 0) - rule.free) * rule.per; }
// time：通关时间（秒，S.time）；stats：S.stats（只用 saves、heals）
// 返回 { time, savePen, healPen, final, rank, next }，next = { rank, gap } 是上一档和还差的秒数（S 没有）
function calcRank(time, stats) {
  const st = stats || {}, t = Math.max(0, Math.floor(time || 0));
  const savePen = rankPenalty(st.saves, RANK.savePenalty), healPen = rankPenalty(st.heals, RANK.healPenalty);
  const final = t + savePen + healPen;
  const i = RANK.tiers.findIndex(([, max]) => final <= max);
  const rank = i < 0 ? RANK.lowest : RANK.tiers[i][0];
  const ni = i < 0 ? RANK.tiers.length - 1 : i - 1;
  const next = ni >= 0 ? { rank: RANK.tiers[ni][0], gap: final - RANK.tiers[ni][1] } : null;
  return { time: t, savePen, healPen, final, rank, next };
}
// 不满 1 小时：M:SS；满 1 小时：H:MM:SS
function fmtClock(sec) {
  const v = Math.max(0, Math.floor(sec || 0)), h = Math.floor(v / 3600), m = Math.floor(v / 60) % 60, s = String(v % 60).padStart(2, '0');
  return h ? `${h}:${String(m).padStart(2, '0')}:${s}` : `${m}:${s}`;
}
const mapShortName = id => RANK.mapShort[id] || (LEVELS[id] && LEVELS[id].name) || id;
// 各地图用时：[[简称, 秒], …]。离开每张地图时 world/level.js 会记下 S.time（S.stats.split）。
// 前面每张地图都有记录才显示 —— 旧存档、试玩跳转开局的记录不全，宁可不显示也不显示错的数
function mapSplits(st) {
  const order = Object.keys(LEVELS), cur = order.indexOf(st.map), sp = (st.stats && st.stats.split) || {};
  if (cur <= 0) return [];
  const prev = order.slice(0, cur);
  if (!prev.every(id => typeof sp[id] === 'number')) return [];
  const out = []; let t0 = 0;
  for (const id of prev) { out.push([mapShortName(id), Math.max(0, sp[id] - t0)]); t0 = sp[id]; }
  out.push([mapShortName(st.map), Math.max(0, st.time - t0)]);
  return out;
}
// 结算画面上的全部文字。纯函数：测试直接检查这里，drawWin 只管画
function winReport(st) {
  const s = st.stats || {}, r = calcRank(st.time, s), sp = RANK.savePenalty, hp = RANK.healPenalty;
  const acc = s.shots ? Math.round(s.hits / s.shots * 100) : 0;
  const splits = mapSplits(st);
  return {
    r,
    time: fmtClock(r.time),
    splits: splits.map(([n, t]) => `${n} ${fmtClock(t)}`).join('  ·  '),
    saves: [`存档 ${s.saves | 0} 次`, '+' + fmtClock(r.savePen)],
    heals: [`治疗 ${s.heals | 0} 次`, '+' + fmtClock(r.healPen)],
    final: fmtClock(r.final),
    extra: `击倒敌人 ${s.kills | 0}  ·  命中率 ${acc}%（只作记录，不计入评价）`,
    hint: r.next ? `结算时间再缩短 ${fmtClock(r.next.gap)}，就是 ${r.next.rank}` : '最高评价',
    ladder: RANK.tiers.map(([k, v]) => `${k} ≤ ${fmtClock(v)}`).join('  ·  ') + `  ·  更慢为 ${RANK.lowest}`,
    rule: `罚时：存档超过 ${sp.free} 次后每次 +${fmtClock(sp.per)}，治疗超过 ${hp.free} 次后每次 +${fmtClock(hp.per)}`,
  };
}
function drawWin() {
  const a = clamp(modeT / 2, 0, 1);
  ctx.fillStyle = `rgba(0,0,0,${a * 0.9})`; ctx.fillRect(0, 0, W, H);
  ctx.globalAlpha = a; ctx.textAlign = 'center';
  const k = clamp(H / 760, 0.75, 1.15), cx = W / 2, fs = n => Math.round(n * k) + 'px ';
  // 章节结束和真正通关用不同的文字（winText 按剧情标记挑选，见下方）
  const [title, l1, l2, l3] = winText(S.flags);
  let y = H * 0.14 + 30 * k;
  ctx.font = 'bold ' + fs(56) + 'serif'; ctx.fillStyle = '#e8d8a0'; ctx.fillText(title, cx, y);
  ctx.font = fs(16) + 'serif'; ctx.fillStyle = '#aaa';
  ctx.fillText(l1, cx, y + 40 * k);
  ctx.fillText(l2, cx, y + 64 * k);
  // 第四行只有真结局才有：官方报告和玩家刚看见的东西对不上（S.T.R.T. 这条线的收尾）
  if (l3) { ctx.font = 'italic ' + fs(14) + 'serif'; ctx.fillStyle = '#6f675a'; ctx.fillText(l3, cx, y + 90 * k); }
  // 成绩单：左边项目、右边数值；罚时为 0 时数值变灰
  const rep = winReport(S), r = rep.r, L = cx - 190 * k, Rt = cx + 190 * k;
  const row = (label, val, color, size = 18, bold = false) => {
    ctx.font = (bold ? 'bold ' : '') + fs(size) + 'sans-serif'; ctx.fillStyle = color;
    ctx.textAlign = 'left'; ctx.fillText(label, L, y); ctx.textAlign = 'right'; ctx.fillText(val, Rt, y);
  };
  const note = (t, color, size) => { ctx.textAlign = 'center'; ctx.font = fs(size) + 'sans-serif'; ctx.fillStyle = color; ctx.fillText(t, cx, y); };
  y += 120 * k; row('通关时间', rep.time, '#ddd');
  if (rep.splits) { y += 22 * k; note(rep.splits, '#8a8070', 13); }
  y += 32 * k; row(rep.saves[0], rep.saves[1], r.savePen ? '#e0a070' : '#888');
  y += 30 * k; row(rep.heals[0], rep.heals[1], r.healPen ? '#e0a070' : '#888');
  y += 14 * k; ctx.fillStyle = 'rgba(200,180,140,0.35)'; ctx.fillRect(L, y, Rt - L, 1);
  y += 30 * k; row('结算时间', rep.final, '#f0e2b0', 20, true);
  y += 30 * k; note(rep.extra, '#8a8070', 14);
  // 评价 + 离下一档还差多少 + 全部规则（让玩家知道下一次该怎么打）
  y += 74 * k; ctx.textAlign = 'center'; ctx.font = 'bold ' + fs(56) + 'serif'; ctx.fillStyle = RANK.color[r.rank] || '#ccc'; ctx.fillText('评价 ' + r.rank, cx, y);
  y += 34 * k; note(rep.hint, '#cbb98f', 15);
  y += 24 * k; note(rep.ladder, '#7a7060', 13);
  y += 20 * k; note(rep.rule, '#7a7060', 13);
  if (modeT > 2) { ctx.textAlign = 'center'; ctx.font = '15px sans-serif'; ctx.fillStyle = '#888'; ctx.fillText('按 回车 返回标题', cx, H - 30); }
  ctx.globalAlpha = 1;
}

// 结算画面的文字。优先级：真正通关 > 第二章完 > 第一章完。
// ⚠️ 最终结局（M4 列车撤离）必须置上 gameClear 标记，否则会显示成「第 二 章　完」。
function winText(f) {
  f = f || {};
  if (f.gameClear || !f.chapter1Done) return ['逃 出 生 天', '货运列车冲出隧道，迎着黎明驶离赫里昂制药厂。', '……站台的阴影里，一抹红色风衣的衣角，和一支完好的样本管。',
    'S.T.R.T. 事后报告 · 拉撒路病原体：全部样本已随设施焚毁。 —— 归档'];
  if (f.chapter2Done) return ['第 二 章　完', '列车一头扎进隧道。拉撒路地下研究所被远远甩在身后。', '下一章　赫里昂制药厂'];
  return ['第 一 章　完', '升降梯沉进黑暗。洛克伍德宅邸的灯光在头顶缩成一个点。', '下一章　拉撒路地下研究所'];
}
