'use strict';
// 绘制玩家、敌人、道具

// ---------------------------------------------------------------- 绘制：角色
function drawPlayer() {
  const p = S.p, aiming = isAimKey() && P.reloadT <= 0;
  if (P.inv > 0 && Math.floor(P.inv * 15) % 2 === 0 && mode === 'play') return;
  ctx.save(); ctx.translate(p.x, p.y);
  ctx.fillStyle = 'rgba(0,0,0,0.45)'; ctx.beginPath(); ctx.ellipse(3, 4, 17, 15, 0, 0, 7); ctx.fill();
  ctx.rotate(p.a);
  const s = Math.sin(P.walk) * 6;
  ctx.fillStyle = '#1b222c'; ctx.fillRect(-4 + s, -10, 11, 7); ctx.fillRect(-4 - s, 3, 11, 7);
  ctx.fillStyle = '#2c3a4d'; ctx.beginPath(); ctx.ellipse(0, 0, 10, 15, 0, 0, 7); ctx.fill();
  ctx.fillStyle = '#3c4b33'; ctx.beginPath(); ctx.ellipse(1, 0, 8, 11, 0, 0, 7); ctx.fill();
  ctx.fillStyle = '#111'; ctx.fillRect(-2, -9, 3, 18);
  // 手臂 & 武器
  const kn = P.knifeT > 0;
  ctx.fillStyle = '#2c3a4d';
  if (aiming || kn) { ctx.fillRect(4, -9, 14, 5); ctx.fillRect(4, 4, 14, 5); }
  else { ctx.fillRect(2, -12, 10, 5); ctx.fillRect(4, 6, 12, 5); }
  ctx.fillStyle = '#c9a07a';
  if (kn) {
    ctx.beginPath(); ctx.arc(20, 0, 3.5, 0, 7); ctx.fill();
    ctx.fillStyle = '#ddd'; ctx.fillRect(22, -1.5, 16, 3);
  } else if (railOn()) {
    drawRailgunModel(aiming);
  } else if (WEAPONS[S.p.wep].model === 'pistol') {
    const gx = aiming ? 18 : 14;
    ctx.beginPath(); ctx.arc(gx, aiming ? 0 : 7, 3.5, 0, 7); ctx.fill();
    ctx.fillStyle = '#0d0d0d'; ctx.fillRect(gx, (aiming ? 0 : 7) - 2, 12, 4);
  } else {
    ctx.beginPath(); ctx.arc(12, 3, 3.5, 0, 7); ctx.arc(22, -1, 3.5, 0, 7); ctx.fill();
    ctx.fillStyle = '#3a2614'; ctx.fillRect(4, 0, 12, 5);
    ctx.fillStyle = '#151515'; ctx.fillRect(14, -2.5, 24, 5);
  }
  ctx.fillStyle = '#1e1510'; ctx.beginPath(); ctx.arc(0, 0, 7.5, 0, 7); ctx.fill();
  ctx.fillStyle = '#2b1d14'; ctx.beginPath(); ctx.arc(-1, 0, 6, 0, 7); ctx.fill();
  if (P.flash > 0) {
    const L = railOn() ? 44 : WEAPONS[S.p.wep].len;
    ctx.fillStyle = '#fff3b0'; ctx.beginPath(); ctx.moveTo(L, 0); ctx.lineTo(L + 18, -6); ctx.lineTo(L + 28, 0); ctx.lineTo(L + 18, 6); ctx.fill();
  }
  ctx.restore();
}
function drawEnemy(e) {
  if (e.t === 'crawler') { drawCrawler(e); return; }
  if (e.t === 'licker') { drawLicker(e); return; }
  if (e.t === 'slime') { drawSlime(e); return; }
  if (e.t === 'vine') { drawVine(e); return; }
  if (e.t === 'hunter') { drawHunter(e); return; }
  if (e.t === 'executionerBerserk') { drawBerserk(e); return; }
  if (e.t === 'lazarus') { drawLazarus(e); return; }
  if (e.t === 'parasite') { drawParasite(e); return; }
  if (e.t === 'tentacle') { drawTentacle(e); return; }
  ctx.save(); ctx.translate(e.x, e.y);
  if (e.dead) {
    const k = Math.min(1, e.deadT * 3);
    ctx.globalAlpha = 0.95;
    ctx.rotate(e.fa); ctx.scale(1 + 0.3 * k, 1 - 0.1 * k);
  } else {
    ctx.fillStyle = 'rgba(0,0,0,0.45)'; ctx.beginPath(); ctx.ellipse(3, 4, e.r + 2, e.r, 0, 0, 7); ctx.fill();
    let a = e.fa;
    if (e.t === 'zombie') a += Math.sin(e.ph * 2.2) * 0.18;
    if (e.stag > 0) a += Math.sin(e.ph * 40) * 0.2;
    ctx.rotate(a);
  }
  const atk = (e.state === 'attack' || (e.state === 'bash' && Math.sin(e.ph * 9) > 0)) && !e.dead; // 拍门时双臂反复前伸
  if (e.t === 'zombie') {
    const s = e.dead ? 0 : Math.sin(e.ph * 4) * 5;
    ctx.fillStyle = '#2a2a24'; ctx.fillRect(-4 + s, -10, 10, 7); ctx.fillRect(-4 - s, 3, 10, 7);
    ctx.fillStyle = e.dead ? '#3a3d32' : '#4a5042'; ctx.beginPath(); ctx.ellipse(0, 0, 10, 15, 0, 0, 7); ctx.fill();
    ctx.fillStyle = '#6a1212'; ctx.beginPath(); ctx.ellipse(2, 5, 4, 5, 0, 0, 7); ctx.fill();
    const reach = atk ? 24 : 16;
    ctx.fillStyle = '#4a5042'; ctx.fillRect(2, -13, reach - 4, 5); ctx.fillRect(2, 8, reach - 2, 5);
    ctx.fillStyle = '#7f8b6b'; ctx.beginPath(); ctx.arc(reach, -10.5, 3.5, 0, 7); ctx.arc(reach + 2, 10.5, 3.5, 0, 7); ctx.fill();
    ctx.fillStyle = e.dead ? '#5f6a52' : '#86917a'; ctx.beginPath(); ctx.arc(1, 0, 7.5, 0, 7); ctx.fill();
    ctx.fillStyle = '#3a2d25'; ctx.beginPath(); ctx.arc(-2, 0, 5, 0, 7); ctx.fill();
    if (!e.dead) { ctx.fillStyle = '#e8e2c0'; ctx.fillRect(5, -3.5, 2, 2); ctx.fillRect(5, 1.5, 2, 2); }
  } else if (e.t === 'bloater') {
    // 膨胀者：肿成一团的躯干，表皮下鼓着发绿的脓包，越接近爆炸越鼓
    if (e.dead) { ctx.restore(); return; }
    const pulse = 1 + 0.06 * Math.sin(e.ph * 5), s = Math.sin(e.ph * 3) * 4;
    ctx.fillStyle = '#2a2a1e'; ctx.fillRect(-4 + s, -13, 9, 7); ctx.fillRect(-4 - s, 6, 9, 7);
    ctx.fillStyle = '#6a7446'; ctx.beginPath(); ctx.ellipse(-2, 0, 17 * pulse, 18 * pulse, 0, 0, 7); ctx.fill();
    ctx.fillStyle = 'rgba(160,200,70,0.8)'; for (const [x, y, r] of [[-8, -7, 5], [2, 8, 6], [-10, 6, 4], [4, -9, 4]]) { ctx.beginPath(); ctx.arc(x, y, r * pulse, 0, 7); ctx.fill(); }
    ctx.fillStyle = '#4a5436'; ctx.fillRect(6, -14, 14, 5); ctx.fillRect(6, 9, 14, 5);
    ctx.fillStyle = '#86917a'; ctx.beginPath(); ctx.arc(10, 0, 6.5, 0, 7); ctx.fill();
    ctx.fillStyle = '#e8e2c0'; ctx.fillRect(13, -3, 2, 2); ctx.fillRect(13, 1.5, 2, 2);
  } else if (e.t === 'dog') {
    const s = e.dead ? 0 : Math.sin(e.ph * 14) * 6;
    ctx.fillStyle = '#2a1c16';
    ctx.fillRect(4 + s, -10, 4, 6); ctx.fillRect(4 - s, 4, 4, 6); ctx.fillRect(-12 - s, -9, 4, 5); ctx.fillRect(-12 + s, 4, 4, 5);
    ctx.fillStyle = e.dead ? '#2a1d17' : '#3d2a20'; ctx.beginPath(); ctx.ellipse(0, 0, 17, 8, 0, 0, 7); ctx.fill();
    ctx.fillStyle = '#7a1a1a'; ctx.fillRect(-6, -4, 3, 8); ctx.fillRect(-1, -4, 3, 8); ctx.fillRect(4, -4, 2, 8);
    ctx.fillStyle = '#3d2a20'; ctx.beginPath(); ctx.ellipse(17, 0, 7, 5.5, 0, 0, 7); ctx.fill();
    ctx.fillRect(-22, -1.5, 8, 3);
    if (!e.dead) { ctx.fillStyle = '#ddd'; ctx.fillRect(19, -3.5, 2, 2); ctx.fillRect(19, 1.5, 2, 2); if (atk) { ctx.fillStyle = '#a00'; ctx.fillRect(22, -2, 5, 4); } }
  } else if (e.t === 'boss') {
    if (e.knockdownT > 0) { ctx.translate(0, 14); ctx.rotate(0.18); ctx.scale(1.18, 0.55); ctx.globalAlpha = 0.72; }
    const s = e.dead ? 0 : Math.sin(e.ph * 3) * 7;
    ctx.fillStyle = '#121214'; ctx.fillRect(-6 + s, -16, 14, 10); ctx.fillRect(-6 - s, 6, 14, 10);
    ctx.fillStyle = '#1f2024'; ctx.beginPath(); ctx.ellipse(0, 0, 18, 27, 0, 0, 7); ctx.fill();
    ctx.strokeStyle = '#2e3036'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(6, -20); ctx.lineTo(6, 20); ctx.stroke(); ctx.lineWidth = 1;
    const grab = atk && e.atk === 'grab', tell = e.state === 'dash' && e.dashT > EXEC.dash.time;
    // 抓取：双臂同时前伸（重拳只伸右臂）；冲刺蓄力：身体后缩
    const pr = atk ? (grab ? 30 - e.atkT * 12 : 34 - e.atkT * 20) : tell ? 8 : 18, pl = grab ? pr : 14;
    if (tell) ctx.translate(-5, 0);
    ctx.fillStyle = '#1f2024'; ctx.fillRect(4, 14, pr, 10); ctx.fillRect(4, -24, pl, 9);
    // 抓取前摇：手臂发红光（计划 3.1）
    if (grab) { const g = 0.45 + 0.35 * Math.sin(e.ph * 30); ctx.fillStyle = `rgba(255,40,20,${g})`; ctx.beginPath(); ctx.arc(pr + 6, 19, 16, 0, 7); ctx.fill(); ctx.beginPath(); ctx.arc(pl + 6, -19, 14, 0, 7); ctx.fill(); }
    ctx.fillStyle = grab ? '#b8483a' : '#6d6560'; ctx.beginPath(); ctx.arc(pr + 6, 19, 10, 0, 7); ctx.fill(); ctx.beginPath(); ctx.arc(pl + 6, -19, grab ? 9 : 6, 0, 7); ctx.fill();
    ctx.fillStyle = '#8b837e'; ctx.beginPath(); ctx.arc(3, 0, 11, 0, 7); ctx.fill();
    ctx.fillStyle = '#5e1010'; ctx.fillRect(-3, -8, 3, 16);
    if (!e.dead) { ctx.fillStyle = '#fff'; ctx.fillRect(10, -5, 3, 3); ctx.fillRect(10, 2, 3, 3); }
    if (e.frozenT > 0) {   // 冰壳：半透明的淡蓝色，快破冰时闪
      const a = e.frozenT < 4 ? 0.35 + 0.25 * Math.sin(performance.now() / 60) : 0.55;
      ctx.fillStyle = `rgba(190,225,255,${a})`; ctx.beginPath(); ctx.ellipse(6, 0, 34, 34, 0, 0, 7); ctx.fill();
      ctx.strokeStyle = 'rgba(240,250,255,0.8)'; ctx.lineWidth = 1.5; ctx.stroke();
      ctx.beginPath(); ctx.moveTo(-10, -20); ctx.lineTo(4, -2); ctx.lineTo(-4, 14); ctx.moveTo(20, -18); ctx.lineTo(12, 4); ctx.stroke();
    }
  }
  ctx.restore();
}
// ---------------------------------------------------------------- 保险丝的样子
// 工业用的刀型熔断器：陶瓷管身 + 两头黄铜帽 + 伸出来的银色插片，管身中间一圈琥珀色标签带。
// 轮廓是「两头带插片的短圆柱」，和钥匙（圆环 + 长柄 + 齿）一眼能分开。
// 地上、HUD 的钥匙栏、配电箱的插槽都用这一个函数，保证玩家在三个地方看到的是同一个东西。
// s：缩放（地上 1，HUD 0.62）；横放，中心在原点，总长约 34×s
const isFuseKey = k => typeof k === 'string' && /^fuse[A-C]$/.test(k);
function drawFuseIcon(c, s = 1) {
  c.save(); c.scale(s, s);
  c.fillStyle = '#b8bcc0'; c.fillRect(-17, -1.5, 5, 3); c.fillRect(12, -1.5, 5, 3);            // 插片
  c.fillStyle = '#5a5e62'; c.fillRect(-16, -0.5, 2, 1); c.fillRect(14, -0.5, 2, 1);              // 插片上的孔
  c.fillStyle = '#8a6a26'; c.fillRect(-13, -6.5, 5, 13); c.fillRect(8, -6.5, 5, 13);             // 黄铜帽（暗边）
  c.fillStyle = '#d4ae52'; c.fillRect(-12.5, -6, 4, 12); c.fillRect(8.5, -6, 4, 12);
  c.fillStyle = '#f2dc96'; c.fillRect(-12.5, -6, 4, 2); c.fillRect(8.5, -6, 4, 2);              // 帽子的高光
  c.fillStyle = '#9a9282'; c.fillRect(-8, -5, 16, 10);                                           // 陶瓷管身（暗边）
  c.fillStyle = '#e4dccb'; c.fillRect(-8, -4.5, 16, 9);
  c.fillStyle = '#f6f1e6'; c.fillRect(-8, -4.5, 16, 2);                                          // 管身高光
  c.fillStyle = '#c8841e'; c.fillRect(-3, -4.5, 6, 9);                                           // 琥珀色标签带
  c.fillStyle = '#3a2a10'; c.fillRect(-2, -1, 4, 0.8); c.fillRect(-2, 1, 4, 0.8);               // 标签上的字
  c.restore();
}
// 配电箱里的一个插槽（竖放）：空的是两个铜夹子，插上了是一根竖着的保险丝
function drawFuseSlot(c, x, y, on) {
  c.save(); c.translate(x, y);
  c.fillStyle = '#0c0d0e'; c.fillRect(-3.5, -9, 7, 18);
  c.fillStyle = '#9a7a36'; c.fillRect(-3, -9, 6, 2); c.fillRect(-3, 7, 6, 2);                   // 上下两个夹子
  if (on) { c.rotate(Math.PI / 2); drawFuseIcon(c, 0.5); }
  c.restore();
}
function drawItem(it) {
  if (it.taken) return;
  ctx.save(); ctx.translate(it.x, it.y);
  const t = it.t;
  // 机关道具：底座已经画在地砖层了，这里只叠「它正望着哪边」和「机关亮没亮」
  if (t === 'bust') {
    // 注意：这里绝不能因为「朝向正确」而改变颜色。
    // 那等于给每一座单独发「叮」，四座各试四个方向就解开了，家谱直接作废 ——
    // 第一版就是栽在这上面的。视线指示只说「它朝哪」，不说「对不对」。
    const a = bustSpriteAngle(it.face);   // 方位→屏幕方向的定义在 game/puzzles.js 的 FACE_VEC
    const lit = !!S.flags.bustsSolved;              // 只有整个机关解开之后才允许发光
    ctx.rotate(a);
    ctx.fillStyle = lit ? 'rgba(210,180,90,0.95)' : 'rgba(150,145,135,0.9)';
    ctx.beginPath(); ctx.moveTo(0, -13); ctx.lineTo(5, -4); ctx.lineTo(-5, -4); ctx.fill();   // 鼻梁/视线方向
    ctx.strokeStyle = lit ? 'rgba(230,200,110,0.5)' : 'rgba(120,120,120,0.28)'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(0, -15); ctx.lineTo(0, -34); ctx.stroke();                     // 目光延长线
    ctx.restore(); return;
  }
  if (t === 'plate') {
    // 同理：不实时显示进度。想知道对了几道，得走过来蹲下看（按 E），而且那一下会响。
    const solved = !!S.flags.bustsSolved, n = solved ? 4 : 0;
    ctx.strokeStyle = 'rgba(150,130,80,0.5)'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.arc(0, 0, 15, 0, 7); ctx.stroke();
    // 方位罗盘：上为北。半身像的朝向读数用的就是这套词，这里把参照系交代清楚
    ctx.beginPath(); ctx.arc(0, 0, 22, 0, 7); ctx.stroke();
    ctx.font = 'bold 9px serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    const marks = [['北', 0, -22], ['东', 22, 0], ['南', 0, 22], ['西', -22, 0]];
    for (const [ch, mx, my] of marks) {
      ctx.fillStyle = ch === '北' ? 'rgba(220,190,120,0.9)' : 'rgba(170,155,120,0.75)';
      ctx.fillText(ch, mx, my);
    }
    ctx.strokeStyle = 'rgba(220,190,120,0.7)'; ctx.lineWidth = 1.5;   // 指北的小针
    ctx.beginPath(); ctx.moveTo(0, -16); ctx.lineTo(0, -19); ctx.stroke();
    ctx.textBaseline = 'alphabetic';
    for (let i = 0; i < 4; i++) {                       // 四道凹槽，对一座亮一道
      const lit = solved || i < n, a2 = i * Math.PI / 2 - Math.PI / 4;
      ctx.strokeStyle = lit ? 'rgba(235,200,110,0.85)' : 'rgba(90,85,75,0.55)'; ctx.lineWidth = lit ? 2.5 : 1.5;
      ctx.beginPath(); ctx.moveTo(Math.cos(a2) * 5, Math.sin(a2) * 5); ctx.lineTo(Math.cos(a2) * 14, Math.sin(a2) * 14); ctx.stroke();
    }
    ctx.restore(); return;
  }
  if (t === 'altar') {
    // 雕像底座前的石台：两个凹槽，嵌了徽章的那个发光
    ctx.fillStyle = '#3e3b37'; ctx.fillRect(-20, -10, 40, 20);
    ctx.strokeStyle = '#6a655e'; ctx.lineWidth = 1.5; ctx.strokeRect(-19.5, -9.5, 39, 19);
    ['lion', 'snake'].forEach((m, i) => {
      const on = S.altar && S.altar[m];
      ctx.fillStyle = on ? KEYS[m].col : '#1c1a18'; ctx.beginPath(); ctx.arc(-9 + i * 18, 0, 6, 0, 7); ctx.fill();
      ctx.strokeStyle = '#8a8070'; ctx.lineWidth = 1; ctx.stroke();
    });
    ctx.restore(); return;
  }
  if (t === 'traindoor' || t === 'escapedoor') {
    const go = t === 'escapedoor' ? !!S.flags.lazarusDead : S.flags.trainGo;
    ctx.fillStyle = go ? '#1a1a14' : '#5a5a48'; ctx.fillRect(-16, -20, 32, 22); ctx.strokeStyle = '#a8a888'; ctx.lineWidth = 2; ctx.strokeRect(-16, -20, 32, 22);
    if (!go) { ctx.strokeStyle = '#2a2a20'; ctx.beginPath(); ctx.moveTo(0, -20); ctx.lineTo(0, 2); ctx.stroke(); }
    ctx.fillStyle = go ? '#3ad04a' : (t === 'escapedoor' ? S.flags.trainStarted : S.flags.trainReady) ? '#e0a020' : '#e02a2a'; ctx.beginPath(); ctx.arc(12, -16, 2.5, 0, 7); ctx.fill();
    ctx.restore(); return;
  }
  if (t === 'trainConsole') {   // 列车控制台：屏幕 + 闸
    const on = !!S.flags.trainStarted;
    ctx.fillStyle = '#2a3036'; ctx.fillRect(-14, -12, 28, 24); ctx.strokeStyle = '#6a7a8a'; ctx.lineWidth = 2; ctx.strokeRect(-14, -12, 28, 24);
    ctx.fillStyle = on ? '#2ad05a' : '#1a4a6a'; ctx.fillRect(-10, -8, 20, 8);
    ctx.fillStyle = on ? '#9affb0' : '#e04030'; ctx.font = '7px sans-serif'; ctx.textAlign = 'center'; ctx.fillText(on ? 'GO' : 'STOP', 0, -2);
    ctx.strokeStyle = '#d8d8d8'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(0, 6); ctx.lineTo(on ? 8 : -8, on ? 10 : 2); ctx.stroke();
    ctx.restore(); return;
  }
  if (t === 'ladle') {   // 钢水闸控制台：黄黑警示条纹 + 一根大拉杆
    const down = !!S.pour || S.flags.execMutated, ready = !S.flags.execMutated && !S.pour && (S.pourReady || 0) <= S.time;
    ctx.fillStyle = '#4a4238'; ctx.fillRect(-12, -14, 24, 28); ctx.strokeStyle = '#c9a33a'; ctx.lineWidth = 2; ctx.strokeRect(-12, -14, 24, 28);
    ctx.fillStyle = '#c9a33a'; for (let k = -10; k < 10; k += 6) ctx.fillRect(k, 9, 3, 4);
    ctx.strokeStyle = '#d8d8d8'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(down ? 10 : -10, down ? 9 : -13); ctx.stroke();
    ctx.fillStyle = '#e06020'; ctx.beginPath(); ctx.arc(down ? 10 : -10, down ? 9 : -13, 4, 0, 7); ctx.fill();
    ctx.fillStyle = ready ? '#3ad04a' : '#e0a020'; ctx.beginPath(); ctx.arc(7, -9, 2.5, 0, 7); ctx.fill();
    ctx.restore(); return;
  }
  if (t === 'ln2lever') {
    const ready = S.flags.valvesSolved && (S.ln2Ready || 0) <= S.time, down = (S.ln2Ready || 0) > S.time;
    ctx.fillStyle = '#4a5058'; ctx.fillRect(-8, -14, 16, 28); ctx.strokeStyle = '#9aa2aa'; ctx.lineWidth = 1.5; ctx.strokeRect(-8, -14, 16, 28);
    ctx.strokeStyle = '#d8d8d8'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(down ? 9 : -9, down ? 10 : -12); ctx.stroke();
    ctx.fillStyle = '#c02020'; ctx.beginPath(); ctx.arc(down ? 9 : -9, down ? 10 : -12, 3.5, 0, 7); ctx.fill();
    ctx.fillStyle = ready ? '#3ad04a' : down ? '#e0a020' : '#e02a2a'; ctx.beginPath(); ctx.arc(5, -9, 2.5, 0, 7); ctx.fill();
    ctx.restore(); return;
  }
  if (t === 'gunlocker') {
    // 枪械柜：锁着红灯，解开绿灯；门开着且拿走后是空的
    const open = S.flags.valvesSolved, empty = S.flags.magnumTaken;
    ctx.fillStyle = '#3c4248'; ctx.fillRect(-15, -18, 30, 36); ctx.strokeStyle = '#8a9098'; ctx.lineWidth = 2; ctx.strokeRect(-15, -18, 30, 36);
    ctx.fillStyle = '#15181b'; ctx.fillRect(-11, -14, 22, 26);
    if (!empty) { ctx.fillStyle = '#1a1a1a'; ctx.fillRect(-7, -5, 14, 4); ctx.fillStyle = '#2a2a2a'; ctx.fillRect(-6, -1, 4, 7); ctx.fillStyle = '#b8b8b8'; ctx.fillRect(-7, -5, 14, 1); }   // 柜子里的麦林：和手枪同一个外形
    if (!open) { ctx.fillStyle = 'rgba(140,160,175,0.55)'; ctx.fillRect(-11, -14, 22, 26); }
    ctx.fillStyle = open ? '#3ad04a' : '#e02a2a'; ctx.beginPath(); ctx.arc(10, 14, 2.5, 0, 7); ctx.fill();
    ctx.restore(); return;
  }
  if (t === 'growlight') {
    // 墙上的补光灯开关 + 它对应的种植槽上方的灯（紫红色植物灯）
    const on = !!it.on;
    ctx.fillStyle = '#2e3236'; ctx.fillRect(-9, -12, 18, 24); ctx.strokeStyle = '#7a8088'; ctx.lineWidth = 1.5; ctx.strokeRect(-9, -12, 18, 24);
    ctx.fillStyle = '#111'; ctx.fillRect(-3, -6, 6, 12); ctx.fillStyle = on ? '#e8e8e8' : '#777'; ctx.fillRect(-3, on ? -6 : 0, 6, 6);
    ctx.fillStyle = on ? '#ff5ad0' : '#401030'; ctx.beginPath(); ctx.arc(0, -9, 2, 0, 7); ctx.fill();
    ctx.fillStyle = '#ddd'; ctx.font = 'bold 9px sans-serif'; ctx.textAlign = 'center'; ctx.fillText(it.v, 0, 21);
    ctx.restore();
    if (on) { const bed = GROW_BEDS[it.v]; ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.fillStyle = 'rgba(255,70,200,0.13)'; ctx.fillRect(bed[0] * T - 6, bed[1] * T - 10, (bed[2] - bed[0] + 1) * T + 12, T + 20); ctx.restore(); }
    return;
  }
  if (t === 'valve') {
    // 阀门 + 压力表：指针指向当前档位；对上了指针变绿
    const pv = valveP(it), ok = S.flags.valvesSolved;
    ctx.fillStyle = '#5a6268'; ctx.fillRect(-3, -2, 6, 20);
    ctx.fillStyle = '#b03a2a'; ctx.beginPath(); ctx.arc(0, 12, 8, 0, 7); ctx.fill(); ctx.fillStyle = '#222'; ctx.fillRect(-8, 11, 16, 2); ctx.fillRect(-1, 4, 2, 16);
    ctx.fillStyle = '#ddd'; ctx.beginPath(); ctx.arc(0, -8, 10, 0, 7); ctx.fill(); ctx.strokeStyle = '#444'; ctx.lineWidth = 2; ctx.stroke();
    const na = Math.PI * (0.8 + (pv - 1) / 4 * 1.4);
    ctx.strokeStyle = ok ? '#2a9a3a' : '#c02020'; ctx.beginPath(); ctx.moveTo(0, -8); ctx.lineTo(Math.cos(na) * 8, -8 + Math.sin(na) * 8); ctx.stroke();
    ctx.fillStyle = '#222'; ctx.font = 'bold 8px sans-serif'; ctx.textAlign = 'center'; ctx.fillText(it.v, 0, -12);
    ctx.restore(); return;
  }
  if (t === 'fusebox') {
    const n = FUSES.filter(f => S.fuses && S.fuses[f]).length;
    ctx.fillStyle = '#3a4046'; ctx.fillRect(-14, -18, 28, 36); ctx.strokeStyle = '#7a8088'; ctx.lineWidth = 2; ctx.strokeRect(-14, -18, 28, 36);
    for (let i = 0; i < 3; i++) drawFuseSlot(ctx, -8 + i * 8, 0, i < n);   // 三个插槽：插上的显示成竖着的保险丝
    ctx.fillStyle = S.flags.m2Power ? '#5f5' : (Math.sin(S.time * 6) > 0 ? '#f33' : '#400'); ctx.beginPath(); ctx.arc(0, -13, 2.5, 0, 7); ctx.fill();
    ctx.restore(); return;
  }
  if (t === 'console') {
    ctx.fillStyle = '#23282e'; ctx.fillRect(-22, -12, 44, 24);
    ctx.fillStyle = S.flags.trainReady ? '#3c9a4a' : S.flags.m2Power ? '#2a5a8a' : '#0a0c0e'; ctx.fillRect(-18, -9, 36, 12);
    if (S.flags.m2Power) { ctx.fillStyle = 'rgba(120,200,255,0.12)'; ctx.beginPath(); ctx.arc(0, 0, 30, 0, 7); ctx.fill(); }
    ctx.restore(); return;
  }
  if (t === 'switch') {
    // 墙上的灯开关：黄铜面板 + 拨杆（亮着时拨杆朝上、带一点暖光）
    const on = !!S.flags[it.v];
    ctx.fillStyle = '#6a5530'; ctx.fillRect(-7, -10, 14, 20);
    ctx.fillStyle = on ? '#ffd27a' : '#2a2418'; ctx.fillRect(-2, on ? -8 : 0, 4, 8);
    if (on) { ctx.fillStyle = 'rgba(255,210,120,0.18)'; ctx.beginPath(); ctx.arc(0, 0, 16, 0, 7); ctx.fill(); }
    ctx.restore(); return;
  }
  if (t === 'lift') {
    // 运货升降梯：铁栅门 + 井口
    ctx.fillStyle = '#0a0a0a'; ctx.fillRect(-22, -22, 44, 44);
    ctx.strokeStyle = S.flags.medalsPlaced ? '#9a8a5a' : '#4a4a4a'; ctx.lineWidth = 2;
    for (let i = -18; i <= 18; i += 6) { ctx.beginPath(); ctx.moveTo(i, -22); ctx.lineTo(i, 22); ctx.stroke(); }
    ctx.strokeRect(-22, -22, 44, 44);
    if (S.flags.medalsPlaced) { ctx.fillStyle = '#d04a2a'; ctx.beginPath(); ctx.arc(18, -18, 2.5, 0, 7); ctx.fill(); }
    ctx.restore(); return;
  }
  if (t === 'safe') {
    // 铸铁柜体 + 四个黄铜拨盘；打开后柜门向左翻开，露出空的内膛
    ctx.fillStyle = 'rgba(0,0,0,0.5)'; ctx.fillRect(-16, -12, 36, 30);
    ctx.fillStyle = '#2b2d30'; ctx.fillRect(-18, -16, 36, 30);
    ctx.strokeStyle = '#55585c'; ctx.lineWidth = 1.5; ctx.strokeRect(-17, -15, 34, 28);
    if (it.open) {
      ctx.fillStyle = '#0c0c0c'; ctx.fillRect(-14, -12, 28, 22);
      ctx.fillStyle = '#3a3d40'; ctx.fillRect(-30, -15, 12, 28);
    } else {
      for (let i = 0; i < 4; i++) { ctx.fillStyle = '#b8963e'; ctx.beginPath(); ctx.arc(-10.5 + i * 7, -4, 2.6, 0, 7); ctx.fill(); }
      ctx.fillStyle = '#8a8d90'; ctx.fillRect(-6, 4, 12, 3);
    }
    ctx.restore(); return;
  }
  ctx.fillStyle = 'rgba(0,0,0,0.4)'; ctx.beginPath(); ctx.ellipse(2, 3, 11, 8, 0, 0, 7); ctx.fill();
  if (t === 'ammo' || t === 'shells') {
    ctx.fillStyle = t === 'ammo' ? '#5d4b22' : '#6b1a18'; ctx.fillRect(-10, -7, 20, 14);
    ctx.fillStyle = t === 'ammo' ? '#d6b04e' : '#d9c16a'; for (let i = 0; i < 4; i++) ctx.fillRect(-8 + i * 5, -5, 3, 4);
    ctx.fillStyle = '#eee'; ctx.fillRect(-8, 2, 16, 2);
  } else if (t === 'fuse' || (t === 'key' && isFuseKey(it.v))) {
    // 保险丝（地图 2 的 fuseA/B/C 按钥匙处理，但长得要像保险丝，不能和钥匙一个样）
    ctx.rotate(-0.35); drawFuseIcon(ctx, 1);
  } else if (t === 'herb') {
    const hc = it.v === 'red' ? ['#6b1f1f', '#bd4040'] : it.v === 'blue' ? ['#1f3f6b', '#4f9bd0'] : ['#246b2b', '#5fd06a'];
    ctx.fillStyle = '#6b3d1f'; ctx.fillRect(-7, 0, 14, 8);
    ctx.fillStyle = hc[0]; for (let i = 0; i < 5; i++) { ctx.save(); ctx.rotate(i * 1.26); ctx.beginPath(); ctx.ellipse(6, 0, 7, 3.5, 0, 0, 7); ctx.fill(); ctx.restore(); }
    ctx.fillStyle = hc[1]; ctx.beginPath(); ctx.arc(0, 0, 3, 0, 7); ctx.fill();
  } else if (t === 'spray') {
    ctx.fillStyle = '#e6e6e6'; ctx.fillRect(-5, -10, 10, 20); ctx.fillStyle = '#888'; ctx.fillRect(-3, -13, 6, 4);
    ctx.fillStyle = '#2a9a3a'; ctx.fillRect(-1.5, -5, 3, 10); ctx.fillRect(-5, -1.5, 10, 3);
  } else if (t === 'key' && KEYS[it.v] && /徽章/.test(KEYS[it.v].name)) {
    ctx.fillStyle = '#3a2e14'; ctx.beginPath(); ctx.arc(0, 0, 10, 0, 7); ctx.fill();
    ctx.fillStyle = KEYS[it.v].col; ctx.beginPath(); ctx.arc(0, 0, 8, 0, 7); ctx.fill();
    ctx.fillStyle = '#2a2010'; ctx.font = 'bold 9px serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(it.v === 'lion' ? '狮' : '蛇', 0, 0.5); ctx.textBaseline = 'alphabetic';
  } else if (t === 'key') {
    ctx.fillStyle = KEYS[it.v].col; ctx.beginPath(); ctx.arc(-6, 0, 6, 0, 7); ctx.fill(); ctx.fillRect(-2, -2, 16, 4); ctx.fillRect(9, 2, 3, 5); ctx.fillRect(13, 2, 2, 4);
    ctx.fillStyle = '#222'; ctx.beginPath(); ctx.arc(-6, 0, 2.5, 0, 7); ctx.fill();
  } else if (t === 'file') {
    ctx.rotate(0.25); ctx.fillStyle = '#e8dfc8'; ctx.fillRect(-8, -11, 16, 22); ctx.fillStyle = '#7a7060'; for (let i = 0; i < 5; i++) ctx.fillRect(-5, -7 + i * 4, 10, 1.2);
  } else if (t === 'grenade' || t === 'flash') {
    drawThrowIcon(ctx, t === 'grenade' ? 'grenade' : 'flashbang');
  } else if (t === 'magammo') {
    ctx.fillStyle = '#3a2a14'; ctx.fillRect(-7, -6, 14, 12); ctx.fillStyle = '#e0c070'; for (let i = 0; i < 3; i++) ctx.fillRect(-5 + i * 4, -4, 3, 7);
  } else if (t === 'smgammo') {
    ctx.fillStyle = '#2a3a4a'; ctx.fillRect(-9, -7, 18, 14); ctx.fillStyle = '#8fb0d0'; for (let i = 0; i < 4; i++) ctx.fillRect(-7 + i * 4, -5, 2.5, 6); ctx.fillStyle = '#ddd'; ctx.fillRect(-7, 3, 14, 1.5);
  } else if (t === 'mod') {
    ctx.fillStyle = '#2a2d30'; ctx.fillRect(-12, -7, 24, 14); ctx.strokeStyle = '#c9a33a'; ctx.lineWidth = 1.5; ctx.strokeRect(-12, -7, 24, 14);
    ctx.fillStyle = '#7a8088'; ctx.fillRect(-8, -3, 16, 6);
  } else if (t === 'gl' || t === 'glcase') {
    const cased = t === 'glcase', empty = cased && S.flags.glTaken, open = !cased || S.flags.growSolved;
    // 榴弹发射器：放在一个打开的武器箱里，箱子比枪大一圈，远远就能认出来
    ctx.fillStyle = '#3a3020'; ctx.fillRect(-30, -14, 60, 28); ctx.fillStyle = '#1a1712'; ctx.fillRect(-27, -11, 54, 22);
    ctx.strokeStyle = '#c9a33a'; ctx.lineWidth = 1.5; ctx.strokeRect(-30, -14, 60, 28);
    if (!empty) { ctx.fillStyle = '#2a2a20'; ctx.fillRect(-24, -3, 14, 7); ctx.fillStyle = '#5a6a44'; ctx.fillRect(-10, -6, 28, 12); ctx.fillStyle = '#1a1a1a'; ctx.fillRect(18, -5, 7, 10);
    ctx.fillStyle = '#e07030'; ctx.beginPath(); ctx.arc(-18, 8, 2.5, 0, 7); ctx.arc(-12, 8, 2.5, 0, 7); ctx.fill(); }
    if (!open) { ctx.fillStyle = 'rgba(150,180,190,0.35)'; ctx.fillRect(-27, -11, 54, 22); }
    if (cased) { ctx.fillStyle = open ? '#3ad04a' : '#e02a2a'; ctx.beginPath(); ctx.arc(26, 10, 2.5, 0, 7); ctx.fill(); }
  } else if (t === 'glammo' || t === 'glbomb' || t === 'glacid') {
    ctx.fillStyle = '#3a3020'; ctx.fillRect(-11, -7, 22, 14); ctx.fillStyle = t === 'glbomb' ? GL_ROUNDS.bomb.col : t === 'glacid' ? GL_ROUNDS.acid.col : '#e07030'; for (let k = 0; k < 3; k++) { ctx.beginPath(); ctx.arc(-6 + k * 6, 0, 2.6, 0, 7); ctx.fill(); }
  } else if (t === 'shotgun') {
    ctx.fillStyle = '#3a2614'; ctx.fillRect(-22, -3, 14, 6); ctx.fillStyle = '#1a1a1a'; ctx.fillRect(-8, -2.5, 32, 5); ctx.fillStyle = '#4a3218'; ctx.fillRect(4, -3.5, 10, 7);
  } else if (t === 'typewriter') {
    ctx.fillStyle = '#161616'; ctx.fillRect(-14, -10, 28, 20); ctx.fillStyle = '#e8dfc8'; ctx.fillRect(-10, -16, 20, 8);
    ctx.fillStyle = '#555'; for (let i = 0; i < 6; i++) for (let j = 0; j < 2; j++) ctx.fillRect(-11 + i * 4, 0 + j * 4, 2.5, 2.5);
  }
  ctx.restore();
}

// 爬行者：装死时和死掉的僵尸画得一样（只多一个偶尔抽动的手指）；醒来后是贴地拖行的上半身
function drawCrawler(e) {
  ctx.save(); ctx.translate(e.x, e.y);
  const lurk = e.state === 'lurk' && !e.dead;
  if (lurk || e.dead) { ctx.rotate(e.fa); ctx.scale(1.3, 0.9); }
  else {
    ctx.fillStyle = 'rgba(0,0,0,0.4)'; ctx.beginPath(); ctx.ellipse(2, 3, 18, 10, e.fa, 0, 7); ctx.fill();
    let a = e.fa; if (e.stag > 0) a += Math.sin(e.ph * 40) * 0.2;
    ctx.rotate(a);
  }
  const body = e.dead || lurk ? '#3a3d32' : '#474c3e', skin = e.dead || lurk ? '#5f6a52' : '#838e76';
  // 拖在身后的腿（醒来后才画得出「断了」的样子）
  ctx.fillStyle = '#2a2a24';
  if (lurk || e.dead) { ctx.fillRect(-4, -10, 10, 7); ctx.fillRect(-4, 3, 10, 7); }
  else { ctx.fillRect(-26, -6, 14, 4); ctx.fillRect(-24, 2, 12, 4); ctx.fillStyle = '#5a1010'; ctx.fillRect(-14, -5, 4, 10); }
  ctx.fillStyle = body; ctx.beginPath(); ctx.ellipse(lurk || e.dead ? 0 : -3, 0, lurk || e.dead ? 10 : 13, lurk || e.dead ? 15 : 9, 0, 0, 7); ctx.fill();
  ctx.fillStyle = '#6a1212'; ctx.beginPath(); ctx.ellipse(-2, 3, 4, 4, 0, 0, 7); ctx.fill();
  // 手臂：醒来后一左一右交替往前扒；装死时摊着，偶尔抽动一下
  const atk = e.state === 'attack' && !e.dead;
  let l = 16, r = 16;
  if (!lurk && !e.dead) { const s = Math.sin(e.ph * 3); l = 16 + s * 7; r = 16 - s * 7; if (atk) l = r = 26; }
  if (lurk && e.twitch > 0) r += Math.sin(e.twitch * 60) * 3;
  ctx.fillStyle = body; ctx.fillRect(2, -13, l - 4, 5); ctx.fillRect(2, 8, r - 2, 5);
  ctx.fillStyle = '#7f8b6b'; ctx.beginPath(); ctx.arc(l, -10.5, 3.5, 0, 7); ctx.arc(r + 2, 10.5, 3.5, 0, 7); ctx.fill();
  ctx.fillStyle = skin; ctx.beginPath(); ctx.arc(5, 0, 7, 0, 7); ctx.fill();
  ctx.fillStyle = '#3a2d25'; ctx.beginPath(); ctx.arc(2, 0, 4.5, 0, 7); ctx.fill();
  if (!lurk && !e.dead) { ctx.fillStyle = '#e8e2c0'; ctx.fillRect(9, -3.5, 2, 2); ctx.fillRect(9, 1.5, 2, 2); }
  ctx.restore();
}
