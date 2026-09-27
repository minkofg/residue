'use strict';
// 玩家每帧更新

// 玩家：瞄准、移动、射击、装填、心跳。返回本帧是否在瞄准
function updatePlayer(dt) {
  const p = S.p;
  if (updateGrab(dt)) { mouse.lp = false; P.jHeld = !!keys.KeyJ; P.focus = 0; return false; }   // 被僵尸抓着：什么都做不了，只能连按 E（ai/grab.js）
  // 瞄准 & 朝向
  const wx = mouse.x + cam.x, wy = mouse.y + cam.y;
  p.a = Math.atan2(wy - p.y, wx - p.x);
  const aiming = isAimKey() && P.reloadT <= 0;
  // 移动（安全屋隔音：在里面奔跑不发出噪音，不会把外面的怪引来）
  let mx = 0, my = 0;
  if (keys.KeyW || keys.ArrowUp) my -= 1; if (keys.KeyS || keys.ArrowDown) my += 1;
  if (keys.KeyA || keys.ArrowLeft) mx -= 1; if (keys.KeyD || keys.ArrowRight) mx += 1;
  const ml = Math.hypot(mx, my);
  const status = p.hp > 66 ? 0 : p.hp > 33 ? 1 : 2;
  const sprinting = !!keys.ShiftLeft && !aiming;
  let spd = aiming ? PLAYER_SPEED.aim : sprinting ? PLAYER_SPEED.run : PLAYER_SPEED.walk;
  if (P.reloadT > 0) spd *= PLAYER_SPEED.reloadMul;
  spd *= STATUS_SPEED[status];
  if (P.slowT > 0) spd *= CRAWLER.slowMul;   // 脚踝被爬行者抓住
  const wr = curRoom(), water = wr >= 0 && ROOMS[wr].water;   // 积水区：移动变慢，每一步都有水声
  if (water) spd *= water;
  if (ml > 0) {
    const mdx = mx / ml * spd * dt, mdy = my / ml * spd * dt;
    if (sprinting) autoOpenDoorOnRun(p.x + mdx, p.y + mdy, mdx, mdy);
    moveEnt(p, mdx, mdy);
    P.walk += dt * spd * 0.06;
    P.stepT -= dt * spd / 120; if (P.stepT <= 0) { P.stepT = sprinting ? 0.42 : 0.58; sfx(water ? 'wade' : 'step', water ? (sprinting ? 1.4 : 1) : sprinting ? 1.3 : 0.45); if (sprinting && !inSafe()) emitNoise(p.x, p.y, NOISE.run, 'run'); else if (water) emitNoise(p.x, p.y, NOISE.wade, 'wade'); }
  }
  if (aiming) P.focus = Math.min(1, P.focus + dt / (ml > 0 ? 1.6 : 0.8)); else P.focus = Math.max(0, P.focus - dt * 3);
  if (mouse.lp) { if (aiming) shoot(); else if (!inSafe()) msg('按住右键 / 空格 / K 瞄准后才能射击（T 切换持续瞄准）。', 2.5); }
  if (keys.KeyJ && !P.jHeld && aiming) shoot();
  else if (WEAPONS[p.wep] && WEAPONS[p.wep].auto && aiming && (mouse.l || keys.KeyJ)) shoot(); // 全自动武器：按住连射
  updateRail(dt, aiming);   // 电磁炮蓄力（ai/lazarus.js）
  P.jHeld = !!keys.KeyJ; // J 与左键一致：半自动，每按一次开一枪
  mouse.lp = false;
  // 装填
  if (P.reloadT > 0) {
    P.reloadT -= dt;
    if (P.reloadT <= 0) { const w = p.wep; if (w === 'gl') p.glLoaded = glCur(); p.mag[w] = (p.mag[w] || 0) + takeAmmo(w, Math.max(0, magCap(w) - (p.mag[w] || 0))); }
  }
  if (p.guardT > 0) p.guardT = Math.max(0, p.guardT - dt); // 红草药减伤剩余时间
  // 心跳
  if (status === 2) { P.heartT -= dt; if (P.heartT <= 0) { P.heartT = 0.75; sfx('heart'); } }
  return aiming;
}
