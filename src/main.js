'use strict';
// 主循环与启动

// ---------------------------------------------------------------- 主循环
let last = performance.now(), titleT = 0;
function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000); last = now;
  perfSample(dt);
  modeT += dt;
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  // 标题画面，以及从标题打开的读档 / 设置 / 操作说明
  if (mode === 'title' || menuOverTitle()) { titleT += dt; drawTitle(titleT); if (mode === 'title') drawTitleMenu(); else drawMenu(); drawCrosshair(); requestAnimationFrame(frame); return; }
  if (mode === 'intro') updateIntro(dt);
  else if (mode === 'play') update(dt);
  else if (mode === 'loading') updateLoading(dt);  // 切换地图：淡出 → 读取画面 → 淡入
  else if (mode === 'dead' || mode === 'win') { // 背景继续少量更新
    for (const e of S.enemies) if (e.dead) e.deadT += dt;
    parts.forEach(q => { q.life -= dt; q.x += q.vx * dt; q.y += q.vy * dt; }); parts = parts.filter(q => q.life > 0);
    S.time += mode === 'win' ? 0 : 0;
  }
  ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, H);
  renderWorld();
  renderDarkness();
  renderOverWorld();
  drawPost();
  if (mode === 'intro') { drawIntro(); requestAnimationFrame(frame); return; }
  if (mode === 'loading') drawLoading();
  if (mode === 'play' || mode === 'pause') drawHUD();
  if (mode === 'play' || mode === 'pause') drawPlaytestBadge();   // 试玩版角标（发布版不画）
  drawPerf();                                                     // 帧率叠层（按 P 开关）
  if (mode === 'file') drawFile();
  else if (mode === 'inv') drawInventory();
  else if (mode === 'map') drawMap();
  else if (mode === 'safe') drawSafe(dt);
  else if (mode === 'dead') drawDead();
  else if (mode === 'win') drawWin();
  else if (mode === 'pause') drawPause();
  else if (isMenuMode(mode)) drawMenu();  // 游戏中打开的存档槽 / 设置 / 操作说明
  drawCrosshair();
  requestAnimationFrame(frame);
}
resize();
buildMap(); renderMap(); refreshSlots();
booted = true;   // 从这里开始才处理键盘 / 鼠标（见 game/globals.js）
requestAnimationFrame(frame);
