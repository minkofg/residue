'use strict';
// HUD、准星、后期

// ---------------------------------------------------------------- HUD
function drawHUD() {
  // 自己被闪光弹晃到：白屏，慢慢褪去（combat/throwables.js）
  if (P.whiteT > 0) { ctx.fillStyle = `rgba(255,255,248,${Math.min(0.92, P.whiteT / 0.8)})`; ctx.fillRect(0, 0, W, H); }
  drawGrab();   // 被僵尸抓住：连按 E 的提示（ai/grab.js）
  const p = S.p, st = p.hp > 66 ? 0 : p.hp > 33 ? 1 : 2;
  const col = p.poison ? '#b060e0' : ['#3fdc5a', '#e8c030', '#e83a2a'][st], label = p.poison ? '中毒' : ['良好', '注意', '危险'][st];
  // 心电图
  const bx = 20, by = H - 90, bw = 200, bh = 70;
  ctx.fillStyle = 'rgba(0,0,0,0.65)'; ctx.fillRect(bx, by, bw, bh);
  ctx.strokeStyle = 'rgba(120,120,120,0.5)'; ctx.strokeRect(bx + .5, by + .5, bw - 1, bh - 1);
  ctx.strokeStyle = 'rgba(60,90,60,0.25)'; for (let i = 1; i < 10; i++) { ctx.beginPath(); ctx.moveTo(bx + i * 20, by); ctx.lineTo(bx + i * 20, by + bh); ctx.stroke(); }
  ctx.save(); ctx.beginPath(); ctx.rect(bx, by, bw, bh); ctx.clip();
  const speed = [60, 85, 120][st], period = [70, 55, 40][st], amp = [22, 18, 12][st];
  const off = (S.time * speed) % period;
  ctx.strokeStyle = col; ctx.lineWidth = 2; ctx.shadowColor = col; ctx.shadowBlur = 8; ctx.beginPath();
  for (let x = 0; x <= bw; x += 2) {
    const ph = ((x + off) % period) / period;
    let y = 0;
    if (ph > 0.3 && ph < 0.35) y = -amp * 0.3; else if (ph >= 0.35 && ph < 0.4) y = amp * 0.3; else if (ph >= 0.4 && ph < 0.45) y = -amp; else if (ph >= 0.45 && ph < 0.5) y = amp * 0.6; else if (ph > 0.6 && ph < 0.7) y = -amp * 0.2 * Math.sin((ph - 0.6) * 31);
    const sx = bx + x, sy = by + bh / 2 + 6 + y;
    x === 0 ? ctx.moveTo(sx, sy) : ctx.lineTo(sx, sy);
  }
  ctx.stroke(); ctx.restore();
  ctx.fillStyle = col; ctx.font = 'bold 16px sans-serif'; ctx.textAlign = 'left'; ctx.fillText(label, bx + 8, by + 20);
  ctx.fillStyle = '#999'; ctx.font = '11px sans-serif'; ctx.fillText('CONDITION', bx + 8, by + bh - 6);

  // 武器
  const w = p.wep, ax = W - 230, ay = H - 90;
  ctx.fillStyle = 'rgba(0,0,0,0.65)'; ctx.fillRect(ax, ay, 210, 70); ctx.strokeStyle = 'rgba(120,120,120,0.5)'; ctx.strokeRect(ax + .5, ay + .5, 209, 69);
  ctx.fillStyle = '#bbb'; ctx.font = '13px sans-serif'; ctx.textAlign = 'left';
  if (railOn()) {   // 电磁炮：剩余发数 + 蓄力条
    const k = Math.min(1, (P.railCharge || 0) / RAILGUN.charge);
    ctx.fillText(`6 ${RAILGUN.name}`, ax + 10, ay + 20);
    ctx.font = 'bold 34px sans-serif'; ctx.fillStyle = p.rail.ammo ? '#9ad8ff' : '#e83a2a'; ctx.fillText(p.rail.ammo, ax + 10, ay + 58);
    ctx.font = '13px sans-serif'; ctx.fillStyle = '#9a9a9a'; ctx.fillText(k > 0 ? '蓄力中…' : '按住射击蓄力 3 秒', ax + 50, ay + 50);
    ctx.fillStyle = '#223'; ctx.fillRect(ax + 10, ay + 62, 190, 4); ctx.fillStyle = k >= 1 ? '#fff' : '#6ac0ff'; ctx.fillRect(ax + 10, ay + 62, 190 * k, 4);
  } else {
  { const si = WEAPON_SLOTS.findIndex(s => s.id === w); ctx.fillText(w === 'gl' ? `${si + 1} GL-40` : `${si + 1} ${WEAPON_SLOTS[si].name}`, ax + 10, ay + 20); }
  if (w === 'gl') {   // 弹种：枪里那发（空着就显示下一发要装的）；背包里还有别的弹种就提示 R 切换
    const k = p.mag.gl > 0 ? glLoaded() : glCur(), G = GL_ROUNDS[k];
    ctx.fillStyle = G.col; ctx.fillText(G.name, ax + 70, ay + 20);
    if (p.mag.gl > 0 && P.reloadT <= 0 && GL_ORDER.some(o => o !== k && invCount(GL_ROUNDS[o].item) > 0)) { ctx.fillStyle = '#9a9a9a'; ctx.fillText('[R] 换弹种', ax + 130, ay + 50); }
    ctx.fillStyle = '#bbb';
  }
  ctx.font = 'bold 34px sans-serif'; ctx.fillStyle = p.mag[w] === 0 ? '#e83a2a' : '#f0f0f0'; ctx.fillText(p.mag[w], ax + 10, ay + 58);
  const mw = ctx.measureText(p.mag[w] + '').width;
  ctx.font = '18px sans-serif'; ctx.fillStyle = '#9a9a9a'; ctx.fillText('/ ' + ammoCount(w), ax + 16 + mw, ay + 58);
  if (P.reloadT > 0) { ctx.fillStyle = '#e8c030'; ctx.font = '13px sans-serif'; ctx.fillText('装填中…', ax + 130, ay + 20); const mx = WEAPONS[w].reload; ctx.fillRect(ax + 10, ay + 64, 190 * (1 - P.reloadT / mx), 3); }
  else if (p.mag[w] === 0) { ctx.fillStyle = '#e83a2a'; ctx.font = '13px sans-serif'; ctx.fillText('[R] 装填', ax + 140, ay + 20); }
  }
  // 恢复品 & 钥匙
  ctx.textAlign = 'left'; ctx.font = '13px sans-serif';
  { const nh = HEAL_ORDER.filter(id => id !== 'spray').reduce((s, id) => s + invCount(id), 0);
    // 按实际字宽排版：不同系统的中文字体宽度不一样，写死 x 坐标会互相压住
    const parts = [
      [nh ? '#5fd06a' : '#777', `[Q] 快速治疗（草药 ${nh}）`],
      [invHas('spray') ? '#e8e8e8' : '#777', `[H] 喷雾 ×${invCount('spray')}`],
      ...(curThrow() ? [['#d8c890', `[G] ${ITEMS[curThrow()].short} ×${invCount(curThrow())}` + (THROW_IDS.filter(id => invHas(id)).length > 1 ? '（X 切换）' : '')]] : [])];
    const GAP = 14, widths = parts.map(([, t]) => ctx.measureText(t).width);
    ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(240, H - 50, Math.max(300, 20 + widths.reduce((a, b) => a + b, 0) + GAP * (parts.length - 1)), 30);
    let x = 250;
    parts.forEach(([c, t], i) => { ctx.fillStyle = c; ctx.fillText(t, x, H - 30); x += widths[i] + GAP; });
    if (p.guardT > 0) { ctx.fillStyle = '#e0a060'; ctx.fillText(`减伤 ${Math.ceil(p.guardT)}s`, 250, H - 58); } }
  let kx = p.guardT > 0 ? 330 : 240; for (const k in KEYS) {
    if (!p.keys[k]) continue;
    if (isFuseKey(k)) { ctx.save(); ctx.translate(kx + 14, H - 66); drawFuseIcon(ctx, 0.62); ctx.restore(); kx += 34; continue; }   // 保险丝画成保险丝
    ctx.fillStyle = KEYS[k].col; ctx.beginPath(); ctx.arc(kx + 8, H - 66, 6, 0, 7); ctx.fill(); ctx.fillRect(kx + 12, H - 68, 12, 4); kx += 34;
  }
  // 右上角
  ctx.textAlign = 'right'; ctx.fillStyle = 'rgba(200,200,200,0.5)'; ctx.font = '12px sans-serif';
  ctx.fillText('WASD行走  左Shift跑  右键/空格瞄准  T持续瞄准  左键射击  F小刀  G投掷  R装填  E开关门/调查  Tab物品  M地图', W - 16, 22);
  // 处刑者状态：不显示地图位置，只显示“暂时倒下/累计伤害”信息。
  const ex = S.enemies.find(e => e.t === 'boss' && !e.dead);
  if (ex && S.executioner && S.executioner.active) {
    const exw = 260, exh = 42, exx = W / 2 - exw / 2, exy = 62;
    ctx.textAlign = 'center'; ctx.fillStyle = 'rgba(0,0,0,0.72)'; ctx.fillRect(exx, exy, exw, exh);
    const exDown = ex.knockdownT > 0, progress = clamp((ex.stagAcc || 0) / Math.max(1, S.executioner.nextThreshold), 0, 1);
    ctx.fillStyle = exDown ? '#7cbd74' : '#8d2525'; ctx.fillRect(exx + 10, exy + 25, (exw - 20) * (exDown ? 1 : progress), 5);
    ctx.fillStyle = exDown ? '#b8e5a2' : '#e6c9a0'; ctx.font = '12px sans-serif'; ctx.fillText(exDown ? `处刑者暂时倒下 · ${Math.ceil(ex.knockdownT)} 秒` : '处刑者 · 累计伤害', W / 2, exy + 17);
  }
  // Boss 战：暴走处刑者的血条（阶段二变红）
  const bz = S.enemies.find(e => e.t === 'executionerBerserk' && !e.dead);
  if (bz) {
    const bw = 420, bx = W / 2 - bw / 2, by = 62, k = clamp(bz.hp / bz.maxhp, 0, 1);
    ctx.textAlign = 'center'; ctx.fillStyle = 'rgba(0,0,0,0.72)'; ctx.fillRect(bx, by, bw, 38);
    ctx.fillStyle = '#3a1010'; ctx.fillRect(bx + 10, by + 24, bw - 20, 6);
    ctx.fillStyle = bz.phase2 ? '#e0402a' : '#b83020'; ctx.fillRect(bx + 10, by + 24, (bw - 20) * k, 6);
    ctx.fillStyle = 'rgba(255,255,255,0.35)'; ctx.fillRect(bx + 10 + (bw - 20) * (EDEF.executionerBerserk.phase2At / bz.maxhp), by + 22, 1, 10);
    ctx.fillStyle = '#f0d0b0'; ctx.font = '12px sans-serif'; ctx.fillText(bz.phase2 ? '暴走处刑者 · 阶段二' : '暴走处刑者', W / 2, by + 16);
  }
  // Boss 战二：拉撒路的血条（每个阶段一条）
  const lz = S.enemies.find(e => e.t === 'lazarus' && !e.dead);
  if (lz) {
    const bw = 460, bx = W / 2 - bw / 2, by = 62, k = lz.morphT > 0 ? 0 : clamp(lz.hp / lz.maxhp, 0, 1), ph = lz.phase || 1;
    ctx.textAlign = 'center'; ctx.fillStyle = 'rgba(0,0,0,0.72)'; ctx.fillRect(bx, by, bw, 38);
    ctx.fillStyle = '#2a1018'; ctx.fillRect(bx + 10, by + 24, bw - 20, 6);
    ctx.fillStyle = ['#c04a6a', '#d0405a', '#e03a4a'][ph - 1]; ctx.fillRect(bx + 10, by + 24, (bw - 20) * k, 6);
    ctx.fillStyle = '#f0d0d8'; ctx.font = '12px sans-serif';
    ctx.fillText(`拉撒路 · 阶段${'一二三'[ph - 1]}（${EDEF.lazarus.phases[ph - 1].name}）` + (lz.morphT > 0 ? ' · 变异中' : ''), W / 2, by + 16);
    for (let i = 0; i < 3; i++) { ctx.fillStyle = i < ph - 1 ? '#555' : i === ph - 1 ? '#e0a0b0' : '#a04060'; ctx.beginPath(); ctx.arc(bx + bw - 40 + i * 12, by + 12, 3.5, 0, 7); ctx.fill(); }
  }
  // 倒计时与目标提示（由触发器设置）
  const cd = S.countdown && (!S.countdown.map || S.countdown.map === S.map) ? S.countdown : null;
  if (cd) {
    const t = Math.max(0, cd.left), s = `${cd.label} ${String(Math.floor(t / 60)).padStart(2, '0')}:${String(Math.floor(t % 60)).padStart(2, '0')}`;
    ctx.textAlign = 'center'; ctx.font = 'bold 22px sans-serif'; ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(W / 2 - 130, 16, 260, 36);
    ctx.fillStyle = t < 15 ? '#e83a2a' : '#eadcb0'; ctx.fillText(s, W / 2, 42);
  } else if (S.objective && mode === 'play') {
    ctx.textAlign = 'center'; ctx.font = 'bold 22px sans-serif'; ctx.fillStyle = Math.sin(S.time * 6) > 0 ? '#ffe070' : '#fff'; ctx.fillText(S.objective, W / 2, 42);
  }
  // 房间名
  if (P.bannerT > 0) {
    const a = clamp(Math.min(P.bannerT, 3 - P.bannerT) * 2, 0, 1);
    ctx.globalAlpha = a; ctx.textAlign = 'center'; ctx.font = '26px serif'; ctx.fillStyle = '#d8c9a0'; ctx.fillText(P.bannerTxt, W / 2, H * 0.2);
    ctx.fillStyle = '#8a1a1a'; ctx.fillRect(W / 2 - 80, H * 0.2 + 12, 160, 2); ctx.globalAlpha = 1;
  }
  // 消息
  ctx.textAlign = 'center'; ctx.font = '16px sans-serif';
  msgs.forEach((m, i) => {
    const y = H - 120 - (msgs.length - 1 - i) * 30;
    ctx.globalAlpha = clamp(m.life, 0, 1);
    const tw = ctx.measureText(m.t).width + 30;
    ctx.fillStyle = 'rgba(0,0,0,0.7)'; ctx.fillRect(W / 2 - tw / 2, y - 20, tw, 28);
    ctx.fillStyle = '#eee'; ctx.fillText(m.t, W / 2, y);
  });
  ctx.globalAlpha = 1;
}
function drawCrosshair() {
  const aiming = isAimKey() && P.reloadT <= 0 && mode === 'play';
  const x = mouse.x, y = mouse.y;
  if (!aiming) { ctx.fillStyle = 'rgba(255,255,255,0.6)'; ctx.fillRect(x - 1.5, y - 1.5, 3, 3); return; }
  const g = 4 + (1 - P.focus) * 24, locked = P.focus > 0.93;
  ctx.strokeStyle = locked ? '#ff3030' : 'rgba(255,255,255,0.85)'; ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(x - g - 8, y); ctx.lineTo(x - g, y); ctx.moveTo(x + g, y); ctx.lineTo(x + g + 8, y);
  ctx.moveTo(x, y - g - 8); ctx.lineTo(x, y - g); ctx.moveTo(x, y + g); ctx.lineTo(x, y + g + 8);
  ctx.stroke(); ctx.lineWidth = 1;
  if (locked) { ctx.fillStyle = '#ff3030'; ctx.fillRect(x - 1.5, y - 1.5, 3, 3); }
}
// 试玩版角标：一眼分清「我现在打开的是哪个版本」。
// 发布版（build:release 关掉 PLAYTEST_WARP）这块完全不画，所以它同时也是版本指示器。
function drawPlaytestBadge() {
  if (!PLAYTEST_WARP) return;
  ctx.save();
  ctx.textAlign = 'left'; ctx.font = 'bold 11px sans-serif';
  const txt = '试玩版 · ' + WARP_STAGE_NAME[WARP_STAGE] + '  Shift+1…' + WARPS.length + ' 跳转 · Esc 看列表';
  const w = ctx.measureText(txt).width + 16;
  ctx.fillStyle = 'rgba(8,6,5,0.55)'; ctx.fillRect(10, 10, w, 20);
  ctx.strokeStyle = 'rgba(201,165,69,0.45)'; ctx.lineWidth = 1; ctx.strokeRect(10.5, 10.5, w - 1, 19);
  ctx.fillStyle = '#c9a545'; ctx.fillText(txt, 18, 24);
  ctx.restore();
}
// 帧率叠层（按 P 开关）。真机帧数只能在你自己的机器上量 —— 这就是那把尺子。
// 显示的是「帧时间」而不只是 FPS：60FPS = 16.7ms，看到柱子顶破红线就是掉帧。
const PERF = { on: false, hist: new Array(120).fill(0), i: 0, acc: 0, n: 0, fps: 0 };
function perfSample(dt) {
  const ms = dt * 1000;
  PERF.hist[PERF.i] = ms; PERF.i = (PERF.i + 1) % PERF.hist.length;
  PERF.acc += dt; PERF.n++;
  if (PERF.acc >= 0.5) { PERF.fps = PERF.n / PERF.acc; PERF.acc = 0; PERF.n = 0; }
}
function drawPerf() {
  if (!PERF.on) return;
  const w = 244, h = 96, x = W - w - 12, y = 12;
  ctx.save();
  ctx.fillStyle = 'rgba(8,6,5,0.78)'; ctx.fillRect(x, y, w, h);
  ctx.strokeStyle = 'rgba(120,110,90,0.5)'; ctx.lineWidth = 1; ctx.strokeRect(x + .5, y + .5, w - 1, h - 1);

  // 帧时间柱状图。红线 = 16.7ms（60FPS），黄线 = 33.3ms（30FPS）
  const gx = x + 8, gy = y + 26, gw = w - 16, gh = 44, scale = gh / 40;   // 纵轴 0–40ms
  ctx.fillStyle = 'rgba(255,60,60,0.35)'; ctx.fillRect(gx, gy + gh - 16.7 * scale, gw, 1);
  ctx.fillStyle = 'rgba(255,200,60,0.30)'; ctx.fillRect(gx, gy + gh - 33.3 * scale, gw, 1);
  const bw = gw / PERF.hist.length;
  for (let k = 0; k < PERF.hist.length; k++) {
    const v = PERF.hist[(PERF.i + k) % PERF.hist.length];
    const bh = Math.min(gh, v * scale);
    ctx.fillStyle = v > 33.3 ? '#e04030' : v > 16.7 ? '#e0a040' : '#5aa85a';
    ctx.fillRect(gx + k * bw, gy + gh - bh, Math.max(1, bw - 0.5), bh);
  }
  const sorted = [...PERF.hist].filter(v => v > 0).sort((a, b) => a - b);
  const p99 = sorted.length ? sorted[Math.floor(sorted.length * 0.99)] : 0;
  ctx.textAlign = 'left'; ctx.font = 'bold 12px sans-serif'; ctx.fillStyle = '#d8c9a0';
  ctx.fillText(`${PERF.fps.toFixed(0)} FPS   帧时间 p99 ${p99.toFixed(1)}ms`, x + 8, y + 17);
  ctx.font = '11px sans-serif'; ctx.fillStyle = '#9a9080';
  const alive = S.enemies.filter(e => !e.dead).length;
  ctx.fillText(`敌人 ${alive}/${S.enemies.length}　粒子 ${parts.length}　血迹 ${decals.length}`, x + 8, y + gh + 40);
  ctx.fillStyle = '#6a6252';
  ctx.fillText('红线 16.7ms=60FPS　黄线 33.3ms=30FPS　P 关闭', x + 8, y + gh + 56);
  ctx.restore();
}
function drawPost() {
  const p = S.p;
  ctx.fillStyle = 'rgba(30,40,25,0.07)'; ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = vignette; ctx.fillRect(0, 0, W, H);
  if (p.hp <= 33 || P.hurtT > 0) {
    const a = P.hurtT > 0 ? P.hurtT : 0.25 + 0.15 * Math.sin(S.time * 8);
    const g = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.25, W / 2, H / 2, Math.max(W, H) * 0.7);
    g.addColorStop(0, 'rgba(120,0,0,0)'); g.addColorStop(1, `rgba(140,0,0,${a})`);
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  }
  // 结局演出的收尾：最后 1.4 秒压黑，黑到底的同时切进结算画面，中间没有硬切
  if (S.cine > 0 && S.cineLen) {
    const left = S.cine;
    const sink = S.cineLift ? 0.75 * clamp(S.cineT / S.cineLen, 0, 1) : 0;   // 升降梯往下沉：头顶的光越来越小
    const a = Math.max(sink, left < 1.4 ? clamp(1 - left / 1.4, 0, 1) : 0);
    if (a > 0) { ctx.fillStyle = `rgba(0,0,0,${a})`; ctx.fillRect(0, 0, W, H); }
  }
  if (!grainPat) grainPat = ctx.createPattern(grainC, 'repeat');
  if (SETTINGS.grain) { ctx.save(); ctx.globalAlpha = 0.05; ctx.translate(rand(-128, 0), rand(-128, 0)); ctx.fillStyle = grainPat; ctx.fillRect(0, 0, W + 256, H + 256); ctx.restore(); }  // 设置里可关
}
