'use strict';
// 淤泥体（计划 4.2 污水区）：藏在积水里，只露出气泡。
//   · 潜伏（hidden）时子弹打不到、画面上只看得见一串气泡 —— 看气泡判断它在哪
//   · 玩家踩进它附近 → 从水里暴起，把人往水里拖（伤害 + 长时间减速）
//   · 暴起后露在水面上几秒，这时才能打；之后又沉下去换个位置
//   · 只在积水房间（room.water）里活动，永远不会离开水
// 数值：EDEF.slime / SLIME（config/enemies.js）

function inWater(x, y) { const ri = roomAt[Math.floor(y / T) * MW + Math.floor(x / T)]; return ri >= 0 && !!ROOMS[ri].water; }

function updateSlime(e, dt, safe) {
  const p = S.p, d = dist(e.x, e.y, p.x, p.y);
  if (d > SLEEP_DIST) return;
  e.ph += dt;
  if (e.stag > 0) { e.stag -= dt; return; }
  const pw = inWater(p.x, p.y) && !safe;
  if (e.hidden === undefined) e.hidden = true;
  // 气泡
  e.bubT = (e.bubT || 0) - dt;
  if (e.hidden && e.bubT <= 0) { e.bubT = rand(0.25, 0.7); parts.push({ x: e.x + rand(-10, 10), y: e.y + rand(-10, 10), vx: 0, vy: -6, life: 0.7, max: 0.7, s: rand(2, 4), c: 'rgba(150,190,160,0.7)', t: 'bubble' }); }

  if (e.state === 'grab') {           // 暴起前摇：水面鼓起来
    e.atkT -= dt;
    if (e.atkT <= 0) {
      e.hidden = false;
      if (pw && d < SLIME.grabReach) {
        hurtPlayer(e.dmg, Math.atan2(p.y - e.y, p.x - e.x), 'slime');
        P.slowT = SLIME.slowT; msg('冰冷的淤泥缠住了你的腿，把你往水里拖！', 2.5);
        sfxAt('drip', e.x, e.y, 0.8, 500); cryAt('slime', 'gloop', e.x, e.y, 1, 550);
      }
      e.state = 'up'; e.upT = SLIME.upT;
    }
    return;
  }
  let vx = 0, vy = 0;
  if (e.state === 'up') {             // 露在水面上：能被打
    e.upT -= dt;
    if (pw && d < SLIME.grabReach && (e.atkCd || 0) <= S.time) { e.state = 'grab'; e.atkT = 0.35; e.atkCd = S.time + 1.6; return; }
    if (pw) { const a = Math.atan2(p.y - e.y, p.x - e.x); vx = Math.cos(a) * 0.6; vy = Math.sin(a) * 0.6; }
    if (e.upT <= 0) { e.state = 'sub'; e.hidden = true; e.subT = rand(1.5, 3); cryAt('slime', 'bubble', e.x, e.y, 0.8, 450); }
  } else {                            // 潜伏：朝水里的玩家慢慢漂过去
    e.state = 'sub'; e.hidden = true;
    e.subT = Math.max(0, (e.subT || 0) - dt);
    if (pw && d < SLIME.senseDist) {
      const a = Math.atan2(p.y - e.y, p.x - e.x); vx = Math.cos(a); vy = Math.sin(a);
      if (d < SLIME.emergeDist && e.subT <= 0) { e.state = 'grab'; e.atkT = SLIME.tell; cryAt('slime', 'gloop', e.x, e.y, 1, 550); return; }
    } else {
      e.wT -= dt; if (e.wT <= 0) { e.wT = rand(2, 4); e.wa = rand(Math.PI * 2); }
      vx = Math.cos(e.wa) * 0.3; vy = Math.sin(e.wa) * 0.3;
    }
  }
  if (vx || vy) {
    const ox = e.x, oy = e.y;
    moveEnt(e, vx * e.spd * dt, vy * e.spd * dt);
    if (!inWater(e.x, e.y) || inSafeTile(e.x, e.y)) { e.x = ox; e.y = oy; e.wa = rand(Math.PI * 2); }   // 永远不离开水
    e.fa = Math.atan2(vy, vx);
  }
}

function drawSlime(e) {
  if (e.dead) { ctx.save(); ctx.translate(e.x, e.y); ctx.fillStyle = 'rgba(40,60,40,0.6)'; ctx.beginPath(); ctx.ellipse(0, 0, 20, 12, 0, 0, 7); ctx.fill(); ctx.restore(); return; }
  if (e.hidden && e.state !== 'grab') return;   // 潜伏：只有气泡（粒子）
  ctx.save(); ctx.translate(e.x, e.y);
  const rise = e.state === 'grab' ? 1 - Math.max(0, e.atkT) / SLIME.tell : 1;
  const wob = Math.sin(e.ph * 8) * 2;
  ctx.globalAlpha = 0.45 + 0.5 * rise;
  ctx.fillStyle = 'rgba(20,40,30,0.6)'; ctx.beginPath(); ctx.ellipse(0, 4, 24 * rise + 6, 12 * rise + 4, 0, 0, 7); ctx.fill();   // 水面上的涟漪
  ctx.fillStyle = '#2f4a32'; ctx.beginPath(); ctx.ellipse(0, -4 * rise, 14 + wob, 16 * rise + 2, 0, 0, 7); ctx.fill();
  ctx.fillStyle = '#4a6a3e'; ctx.beginPath(); ctx.ellipse(-3, -8 * rise, 6, 5 * rise + 1, 0, 0, 7); ctx.fill();
  if (e.state === 'up' || rise > 0.6) {
    ctx.strokeStyle = '#3a5a36'; ctx.lineWidth = 4; ctx.lineCap = 'round';
    for (let k = -1; k <= 1; k += 2) { ctx.beginPath(); ctx.moveTo(k * 8, -2); ctx.quadraticCurveTo(k * 22, -10 + wob, k * 26, 6); ctx.stroke(); }
    ctx.fillStyle = '#c8d86a'; ctx.fillRect(-5, -12 * rise, 2, 2); ctx.fillRect(3, -12 * rise, 2, 2);
  }
  ctx.restore();
}
