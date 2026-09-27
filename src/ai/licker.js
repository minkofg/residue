'use strict';
// 舔舐者（计划 5.x / 4.2）：完全失明，只靠听觉。
//   · 正常走路不会被发现；跑步、开枪、开关门会暴露（emitNoise 在 world/noise.js 里把声源位置交给它）
//   · 它扑向的是「声音在哪」，不是「玩家在哪」—— 响完就走开，它会扑个空
//   · 声源附近有人（舌头够得着）→ 长舌 3 格远程攻击；声源在 4 格内且路上没挡 → 猛扑
//   · 贴身撞上它也会被发现（摸到了）
//   · 近距离的枪声太响，它会混乱几秒（原地打转）
// 数值在 config/enemies.js 的 EDEF.licker / LICKER。

function lickerHear(e, x, y, label, radius = 0) {
  e.heard = { x, y, t: LICKER.memory, label }; e.heardAt = S.time; e.heardField = null;
  // 只有霰弹枪这种级别的巨响、而且贴得很近才会震懵它；震懵过一次之后一段时间内不会再被震懵
  if (label === 'gun' && radius >= LICKER.confuseNoise && dist(e.x, e.y, x, y) < LICKER.confuseDist && S.time >= (e.confCd || 0)) {
    e.confT = LICKER.confuseT; e.confCd = S.time + LICKER.confuseCd; e.state = 'idle';
  }
  if (!e.alertSfxT || S.time - e.alertSfxT > 3) { e.alertSfxT = S.time; cryAt('licker', 'screech', e.x, e.y, 0.6, 800, 0.1); }
}

function updateLicker(e, dt, safe) {
  const p = S.p, d = dist(e.x, e.y, p.x, p.y);
  if (d > SLEEP_DIST) return;
  e.ph += dt; e.tongueT = Math.max(0, (e.tongueT || 0) - dt);
  if (e.stag > 0) { e.stag -= dt; return; }
  if (e.confT > 0) { e.confT -= dt; return; }   // 震懵：原地甩头（只在绘制里抖动，不转身）
  // 撞上了：摸到了人
  if (!safe && d < e.r + p.r + 10) lickerHear(e, p.x, p.y, 'touch');
  const fresh = e.heard && S.time - (e.heardAt || 0) < LICKER.fresh;
  if (e.heard) { e.heard.t -= dt; if (e.heard.t <= 0) { e.heard = null; } }
  e.alert = !!fresh;

  if (e.state === 'attack') {
    e.atkT -= dt;
    if (e.atkT <= 0) {
      e.tongueT = 0.25;
      if (!safe && d < LICKER.tongue && losClear(e.x, e.y, p.x, p.y)) hurtPlayer(e.dmg, Math.atan2(p.y - e.y, p.x - e.x), 'licker');
      e.state = 'rec'; e.recT = EDEF.licker.rec;
    }
    return;
  }
  if (e.state === 'lunge') {
    e.lungeT -= dt;
    const ox = e.x, oy = e.y;
    moveEnt(e, Math.cos(e.fa) * LICKER.lungeSpd * dt, Math.sin(e.fa) * LICKER.lungeSpd * dt);
    if (inSafeTile(e.x, e.y)) { e.x = ox; e.y = oy; e.lungeT = 0; }
    if (!safe && d < e.r + p.r + 8 && !e.lungeHit) { e.lungeHit = true; hurtPlayer(Math.round(e.dmg * 1.2), e.fa, 'licker'); }
    if (e.lungeT <= 0) { e.state = 'rec'; e.recT = 0.8; }
    return;
  }
  if (e.state === 'rec') { e.recT -= dt; if (e.recT <= 0) e.state = 'idle'; return; }

  let vx = 0, vy = 0, sp = e.spd;
  if (fresh) {
    const hx = e.heard.x, hy = e.heard.y, dh = dist(e.x, e.y, hx, hy);
    const ah = Math.atan2(hy - e.y, hx - e.x);
    // 声源旁边有人、舌头够得着 → 长舌
    if (!safe && d < LICKER.tongue && dist(p.x, p.y, hx, hy) < LICKER.nearSource && losClear(e.x, e.y, p.x, p.y)) {
      e.state = 'attack'; e.atkT = EDEF.licker.windup; e.fa = Math.atan2(p.y - e.y, p.x - e.x);
      sfxAt('bite', e.x, e.y, 0.5, 600); cryAt('licker', 'lash', e.x, e.y, 0.9, 700); return;
    }
    // 声源在扑击距离内、路上没有挡 → 猛扑向声源
    if (dh < LICKER.lungeDist && dh > 40 && walkClear(e.x, e.y, hx, hy) && (e.lungeCd || 0) <= S.time) {
      e.state = 'lunge'; e.fa = ah; e.lungeT = Math.min(LICKER.lungeT, dh / LICKER.lungeSpd); e.lungeHit = false; e.lungeCd = S.time + 2.5; return;
    }
    if (dh > 30) {
      let a = ah;
      if (!walkClear(e.x, e.y, hx, hy)) { if (!e.heardField) e.heardField = noiseField(hx, hy, 16); const n = noiseNext(e); if (n) a = Math.atan2(n[1] - e.y, n[0] - e.x); }
      vx = Math.cos(a); vy = Math.sin(a);
    } else { e.fa += dt * 2; }   // 到了声源：左右摆头，听
  } else {
    e.wT -= dt; if (e.wT <= 0) { e.wT = rand(2, 5); e.wa = rand(Math.PI * 2); e.moving = Math.random() < 0.4; }
    if (e.moving) { vx = Math.cos(e.wa) * 0.3; vy = Math.sin(e.wa) * 0.3; }
    e.groanT -= dt; if (e.groanT <= 0) { e.groanT = rand(5, 10); cryAt('licker', 'clicks', e.x, e.y, 0.8, 550); }   // 舌头嗒嗒响 + 喘气：玩家靠它判断位置
  }
  if (vx || vy) {
    const ox = e.x, oy = e.y;
    moveEnt(e, vx * sp * dt, vy * sp * dt);
    e.fa += angDiff(e.fa, Math.atan2(vy, vx)) * Math.min(1, dt * 5);
    if (inSafeTile(e.x, e.y)) { e.x = ox; e.y = oy; }
  }
}

// 半透明、裸露的肌肉和大脑，四肢着地；攻击时一根长舌
function drawLicker(e) {
  ctx.save(); ctx.translate(e.x, e.y);
  if (e.dead) { ctx.globalAlpha = 0.8; ctx.rotate(e.fa); ctx.fillStyle = '#4a1414'; ctx.beginPath(); ctx.ellipse(0, 0, 20, 12, 0, 0, 7); ctx.fill(); ctx.restore(); return; }
  ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.beginPath(); ctx.ellipse(3, 5, 22, 13, e.fa, 0, 7); ctx.fill();   // 地上的投影
  let a = e.fa; if (e.confT > 0) a += Math.sin(S.time * 25) * 0.25;
  ctx.rotate(a);
  ctx.globalAlpha = e.state === 'lunge' || e.state === 'attack' ? 0.95 : 0.72;
  const s = Math.sin(e.ph * (e.state === 'lunge' ? 20 : 6));
  ctx.strokeStyle = '#7a2a24'; ctx.lineWidth = 4; ctx.lineCap = 'round';
  for (const [x0, y0, dx, dy] of [[6, -6, 12 + s * 4, -14], [6, 6, 12 - s * 4, 14], [-8, -6, -10 - s * 4, -14], [-8, 6, -10 + s * 4, 14]]) {
    ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x0 + dx * .6, y0 + dy); ctx.lineTo(x0 + dx, y0 + dy * 1.1); ctx.stroke();
  }
  ctx.fillStyle = '#8a2e28'; ctx.beginPath(); ctx.ellipse(-2, 0, 17, 9, 0, 0, 7); ctx.fill();
  ctx.strokeStyle = 'rgba(40,5,5,0.6)'; ctx.lineWidth = 1; for (let k = -10; k < 10; k += 4) { ctx.beginPath(); ctx.moveTo(k, -8); ctx.lineTo(k + 2, 8); ctx.stroke(); }
  ctx.fillStyle = '#d98a8a'; ctx.beginPath(); ctx.ellipse(12, 0, 8, 7, 0, 0, 7); ctx.fill();   // 裸露的大脑
  ctx.strokeStyle = '#a05050'; ctx.beginPath(); ctx.moveTo(6, 0); ctx.quadraticCurveTo(12, -4, 18, 0); ctx.moveTo(8, 3); ctx.quadraticCurveTo(13, 6, 17, 3); ctx.stroke();
  ctx.fillStyle = '#2a0808'; ctx.fillRect(18, -2, 4, 4);   // 嘴
  ctx.globalAlpha = 1;
  if (e.state === 'attack' || e.tongueT > 0) {
    const len = e.tongueT > 0 ? LICKER.tongue : 10 + (1 - e.atkT / EDEF.licker.windup) * 10;
    ctx.strokeStyle = '#c85a6a'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(20, 0);
    ctx.quadraticCurveTo(20 + len / 2, Math.sin(e.ph * 20) * 8, 20 + len, 0); ctx.stroke();
  }
  ctx.restore();
}
