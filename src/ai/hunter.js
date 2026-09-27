'use strict';
// 猎手（计划 4.3、5.2）：地图 3 生产车间的精英敌人。数值在 config/enemies.js 的 EDEF.hunter / HUNTER。
//   · 平时走得比你跑得慢（155，玩家奔跑 215），拉开距离靠飞扑补上；会开门（A 层寻路）；看见你之后记 12 秒
//   · 包抄：看得见你时不直线冲，而是绕向你身体一侧的一个点；被枪口指着时会横向闪身
//   · 近身：爪击。2.5–6 格、路上没挡：伏低 0.55 秒后飞扑（360），命中带毒；扑空趴 0.85 秒
//   · 处决：你的生命 ≤ 40 时，飞扑变成处决 —— 前摇 1 秒，全身发红光并尖啸；
//     前摇期间只要打中它就会中断（踉跄），之后 20 秒内不再尝试。
//     处决扑中 = 重伤：打到只剩 1 血、中毒（毒不致死），之后 20 秒内也不再处决 —— 赶紧治疗。
//     只剩 1 血时再被扑中（普通飞扑）才会死。（原来是即死，试玩反馈太难，改用计划第 11 节第 4 条的「其他选择」）

function hunterDoor(e) {
  // 和处刑者一样：走到关着的门前直接推开（安全屋的门除外），但声音小一些
  const tx = Math.floor(e.x / T), ty = Math.floor(e.y / T);
  for (let yy = ty - 1; yy <= ty + 1; yy++) for (let xx = tx - 1; xx <= tx + 1; xx++) {
    if (xx < 0 || yy < 0 || xx >= MW || yy >= MH || grid[yy * MW + xx] !== 2 || isDoorOpen(xx, yy) || doorSafe[yy * MW + xx]) continue;
    if (dist(e.x, e.y, (xx + .5) * T, (yy + .5) * T) < T * 0.95) {
      setDoorOpen(xx, yy, true); drawTileAt(xx, yy); sfxAt('door', (xx + .5) * T, (yy + .5) * T, 1.2, 1100, 0.2);
      emitNoise((xx + .5) * T, (yy + .5) * T, NOISE.doorOpen, 'hunter-door', e); flowT = 0; return true;
    }
  }
  return false;
}

// 开始飞扑 / 处决的前摇
function hunterStartLeap(e, p, exec) {
  e.fa = Math.atan2(p.y - e.y, p.x - e.x);
  if (exec) {
    e.state = 'execWind'; e.atkT = HUNTER.execTell;
    cryAt('hunter', 'shriek', e.x, e.y, 1.1, 1400, 0.4);   // 尖啸
    floats.push({ x: e.x, y: e.y - 30, t: '！！', life: 1, c: '#ff3030' });
  } else {
    e.state = 'crouch'; e.atkT = HUNTER.leapTell; cryAt('hunter', 'hiss', e.x, e.y, 0.8, 700, 0.15);   // 越来越响的嘶气，0.4 秒后扑过来
  }
}
function hunterLeap(e, p, exec) {
  const d = dist(e.x, e.y, p.x, p.y);
  e.fa = Math.atan2(p.y - e.y, p.x - e.x);   // 起跳那一刻锁定方向：之后横移就能躲开
  e.state = 'leap'; e.execLeap = !!exec; e.lungeHit = false;
  e.lungeT = Math.min(d + 40, HUNTER.leapMax + 40) / HUNTER.leapSpd;
  e.leapCd = S.time + rand(HUNTER.leapCd[0], HUNTER.leapCd[1]);
  sfxAt('bash', e.x, e.y, 0.5, 700, 0.1);
}
function hunterHitPlayer(e, p) {
  if (e.execLeap && p.hp <= HUNTER.execBelow) {
    // 处决：P.inv（刚挨过打的无敌时间）照样有效；扑中 = 重伤（打到只剩 1 血），本来就只剩 1 血才会死
    if (P.inv > 0 || mode !== 'play') return;
    e.execCd = S.time + HUNTER.execCd;   // 给你时间治疗：20 秒内不再处决
    if (p.hp <= HUNTER.execLeave) { hurtPlayer(p.hp + 999, e.fa, 'hunter'); msg('猎手的爪子从你的喉咙上划了过去。', 4); return; }
    hurtPlayer(p.hp - HUNTER.execLeave, e.fa, 'hunter');
    if (HUNTER.leapPoison && p.hp > 0) poisonPlayer();
    msg('猎手的爪子撕开了你的肩膀 —— 只剩一口气了，快治疗！', 4.5);
    return;
  }
  const hp0 = p.hp;
  hurtPlayer(HUNTER.leapDmg, e.fa, 'hunter');
  if (HUNTER.leapPoison && p.hp < hp0 && p.hp > 0) poisonPlayer();
}

function updateHunter(e, dt, safe) {
  const p = S.p, dx = p.x - e.x, dy = p.y - e.y, d = Math.hypot(dx, dy);
  if (d > SLEEP_DIST) return;
  if (!e.side) e.side = e.id % 2 ? 1 : -1;   // 包抄从哪一侧绕（被枪指着闪身后会换边）
  e.ph += dt; e.knifeStunT = Math.max(0, (e.knifeStunT || 0) - dt);
  const ang = Math.atan2(dy, dx);
  const los = d < e.sight && losClear(e.x, e.y, p.x, p.y);
  if (!safe && (los || d < 70)) {
    if (!e.alert) cryAt('hunter', 'shriek', e.x, e.y, 0.6, 900, 0.15);
    e.alert = true; e.lostT = 0; e.heard = null; e.heardField = null; e.lastSeen = { x: p.x, y: p.y };
  }
  if (e.alert && !los) {
    e.lostT = (e.lostT || 0) + dt;
    if (safe || e.lostT > EDEF.hunter.memory) {
      e.alert = false; e.lostT = 0;
      const ls = e.lastSeen || { x: p.x, y: p.y };
      e.heard = { x: ls.x, y: ls.y, t: 8, label: 'lastSeen' }; e.heardField = noiseField(ls.x, ls.y, 14);
    }
  }
  e.groanT -= dt; if (e.groanT <= 0) { e.groanT = rand(4, 8); cryAt('hunter', 'chitter', e.x, e.y, 0.7, 600); }   // 喉咙里咯咯响：靠它判断位置
  if (e.stag > 0) { e.stag -= dt; return; }
  if (safe && e.state !== 'leap' && e.state !== 'rec') { if (e.state !== 'idle') e.state = 'chase'; e.atkT = 0; }

  // ---- 前摇 / 动作中
  if (e.state === 'slash') {
    e.atkT -= dt; e.fa += angDiff(e.fa, ang) * Math.min(1, dt * 6);
    if (e.atkT <= 0) {
      if (!safe && d < e.r + p.r + EDEF.hunter.reach + 6) hurtPlayer(e.dmg, ang, 'hunter');
      e.state = 'rec'; e.recT = EDEF.hunter.rec;
    }
    return;
  }
  if (e.state === 'crouch' || e.state === 'execWind') {
    e.atkT -= dt; e.fa += angDiff(e.fa, ang) * Math.min(1, dt * 8);
    if (e.atkT <= 0) {
      if (safe || !los) { e.state = 'chase'; return; }
      hunterLeap(e, p, e.state === 'execWind');
    }
    return;
  }
  if (e.state === 'leap') {
    e.lungeT -= dt;
    const ox = e.x, oy = e.y;
    moveEnt(e, Math.cos(e.fa) * HUNTER.leapSpd * dt, Math.sin(e.fa) * HUNTER.leapSpd * dt);
    if (inSafeTile(e.x, e.y)) { e.x = ox; e.y = oy; e.lungeT = 0; }
    if (!safe && !e.lungeHit && dist(e.x, e.y, p.x, p.y) < e.r + p.r + 10) { e.lungeHit = true; hunterHitPlayer(e, p); }
    if (e.lungeT <= 0 || (Math.abs(e.x - ox) + Math.abs(e.y - oy) < 0.5)) { e.state = 'rec'; e.recT = e.lungeHit ? 0.9 : HUNTER.leapMissRec; e.execLeap = false; }
    return;
  }
  if (e.state === 'dodge') {
    e.dodgeT -= dt;
    const ox = e.x, oy = e.y, a = ang + e.side * Math.PI / 2;
    moveEnt(e, Math.cos(a) * HUNTER.dodgeSpd * dt, Math.sin(a) * HUNTER.dodgeSpd * dt);
    if (inSafeTile(e.x, e.y)) { e.x = ox; e.y = oy; }
    if (e.dodgeT <= 0) e.state = 'chase';
    return;
  }
  if (e.state === 'rec') { e.recT -= dt; if (e.recT <= 0) e.state = 'chase'; return; }

  // ---- 决策
  let vx = 0, vy = 0, sp = e.spd;
  if (e.alert) {
    if (e.state === 'idle') e.state = 'chase';
    const direct = walkClear(e.x, e.y, p.x, p.y);
    if (!safe && los && direct) {
      // 近身：爪击
      if (d < e.r + p.r + EDEF.hunter.reach * 0.8) { e.state = 'slash'; e.atkT = EDEF.hunter.windup; cryAt('hunter', 'snarl', e.x, e.y, 0.8, 650); return; }
      // 飞扑 / 处决
      const execOk = p.hp <= HUNTER.execBelow && S.time >= (e.execCd || 0);
      if (d > HUNTER.leapMin && d < HUNTER.leapMax && S.time >= (e.leapCd || 0)) { hunterStartLeap(e, p, execOk); return; }
      // 被枪口指着（瞄准中、准星几乎对着它）→ 横向闪身
      const aimed = P.focus > 0.15 && Math.abs(angDiff(p.a, ang + Math.PI)) < 0.22;
      if (aimed && d > 90 && S.time >= (e.dodgeCd || 0)) {
        e.dodgeCd = S.time + HUNTER.dodgeCd; e.side = -e.side; e.state = 'dodge'; e.dodgeT = HUNTER.dodgeT; return;
      }
    }
    let tx, ty;
    if (los && direct) {
      // 包抄：远的时候奔向玩家身侧的一个点，近了才正面扑上来
      tx = p.x; ty = p.y;
      if (d > HUNTER.flankDist) {
        const fx = p.x + Math.cos(ang + e.side * Math.PI / 2) * HUNTER.flankDist, fy = p.y + Math.sin(ang + e.side * Math.PI / 2) * HUNTER.flankDist;
        if (walkClear(e.x, e.y, fx, fy) && !solidT(Math.floor(fx / T), Math.floor(fy / T))) { tx = fx; ty = fy; }
      }
    } else {
      const n = flowNext(e);
      if (n) { tx = n[0]; ty = n[1]; }
      hunterDoor(e);
    }
    if (tx !== undefined) { const a = Math.atan2(ty - e.y, tx - e.x); vx = Math.cos(a); vy = Math.sin(a); }
  } else if (e.heard) {
    e.heard.t -= dt;
    const n = dist(e.x, e.y, e.heard.x, e.heard.y) > T * 0.8 ? noiseNext(e) : null;
    if (n) { const a = Math.atan2(n[1] - e.y, n[0] - e.x); vx = Math.cos(a) * 0.6; vy = Math.sin(a) * 0.6; }
    else { e.heard.t = Math.min(e.heard.t, 2.5); e.fa += dt * 2; }
    if (e.heard.t <= 0) { e.heard = null; e.heardField = null; }
  } else {
    e.state = 'idle';
    e.wT -= dt; if (e.wT <= 0) { e.wT = rand(2, 5); e.wa = rand(Math.PI * 2); e.moving = Math.random() < 0.5; }
    if (e.moving) { vx = Math.cos(e.wa) * 0.3; vy = Math.sin(e.wa) * 0.3; }
  }
  if (vx || vy) {
    const ox = e.x, oy = e.y;
    moveEnt(e, vx * sp * dt, vy * sp * dt);
    e.fa += angDiff(e.fa, Math.atan2(vy, vx)) * Math.min(1, dt * 7);
    if (inSafeTile(e.x, e.y)) { e.x = ox; e.y = oy; e.state = 'chase'; }
  }
}

// 受伤（combat.js 的 damageEnemy 调用）：处决前摇中被打中 → 中断
function hunterHurt(e) {
  if (e.state === 'execWind') {
    e.state = 'rec'; e.recT = 0.4; e.stag = Math.max(e.stag, 0.8); e.execCd = S.time + HUNTER.execCd;
    floats.push({ x: e.x, y: e.y - 30, t: '打断！', life: 1.2, c: '#ffcc55' });
    cryAt('hunter', 'pain', e.x, e.y, 1, 700, 0.2); e.hurtVoT = S.time + 0.7;
  } else if (e.state === 'crouch') { e.state = 'chase'; }
}

// 外形：瘦长的爬行类，墨绿色鳞皮，前肢是一对长爪。处决前摇时全身发红光
function drawHunter(e) {
  ctx.save(); ctx.translate(e.x, e.y);
  if (e.dead) {
    ctx.rotate(e.fa); ctx.globalAlpha = 0.9;
    ctx.fillStyle = '#23301f'; ctx.beginPath(); ctx.ellipse(0, 0, 20, 10, 0, 0, 7); ctx.fill();
    ctx.fillStyle = '#3a1010'; ctx.beginPath(); ctx.ellipse(-4, 2, 10, 5, 0, 0, 7); ctx.fill();
    ctx.restore(); return;
  }
  const exec = e.state === 'execWind', crouch = e.state === 'crouch' || exec, leap = e.state === 'leap';
  if (exec) {   // 红光：越接近扑出越亮
    const k = 1 - Math.max(0, e.atkT) / HUNTER.execTell;
    const g = ctx.createRadialGradient(0, 0, 4, 0, 0, 46 + k * 16);
    g.addColorStop(0, `rgba(255,40,30,${0.35 + k * 0.4})`); g.addColorStop(1, 'rgba(255,0,0,0)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, 62 + k * 16, 0, 7); ctx.fill();
  }
  ctx.fillStyle = 'rgba(0,0,0,0.4)'; ctx.beginPath(); ctx.ellipse(3, 5, leap ? 14 : 19, 11, e.fa, 0, 7); ctx.fill();
  let a = e.fa; if (e.stag > 0) a += Math.sin(e.ph * 40) * 0.2;
  ctx.rotate(a);
  const sc = crouch ? 0.88 : leap ? 1.12 : 1; ctx.scale(sc, crouch ? 1.12 : 1);
  const s = Math.sin(e.ph * (e.alert ? 16 : 7));
  // 后腿、尾巴
  ctx.strokeStyle = '#2c3a26'; ctx.lineWidth = 5; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(-8, -6); ctx.lineTo(-14 - s * 3, -14); ctx.moveTo(-8, 6); ctx.lineTo(-14 + s * 3, 14); ctx.stroke();
  ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(-12, 0); ctx.quadraticCurveTo(-22, s * 6, -30, s * 3); ctx.stroke();
  // 身体
  ctx.fillStyle = exec ? '#6a2a20' : '#34482e'; ctx.beginPath(); ctx.ellipse(-1, 0, 15, 9, 0, 0, 7); ctx.fill();
  ctx.fillStyle = exec ? '#8a3a2a' : '#46603a'; for (let k = -10; k <= 6; k += 5) { ctx.beginPath(); ctx.arc(k, 0, 2.2, 0, 7); ctx.fill(); }   // 背脊的鳞
  // 前臂 + 长爪（攻击、飞扑时前伸）
  const reach = e.state === 'slash' || leap ? 10 : crouch ? -2 : 3;
  ctx.strokeStyle = '#3c5232'; ctx.lineWidth = 4;
  ctx.beginPath(); ctx.moveTo(6, -7); ctx.lineTo(14 + reach + s * 2, -13); ctx.moveTo(6, 7); ctx.lineTo(14 + reach - s * 2, 13); ctx.stroke();
  ctx.strokeStyle = '#d8d0b8'; ctx.lineWidth = 1.5;
  for (const sy of [-1, 1]) for (let c = -1; c <= 1; c++) {
    const bx = 14 + reach + (sy < 0 ? s : -s) * 2, by = 13 * sy;
    ctx.beginPath(); ctx.moveTo(bx, by); ctx.lineTo(bx + 9, by + c * 3 + sy * 2); ctx.stroke();
  }
  // 头
  ctx.fillStyle = exec ? '#7a3024' : '#3e5634'; ctx.beginPath(); ctx.ellipse(15, 0, 7, 6, 0, 0, 7); ctx.fill();
  ctx.fillStyle = exec || e.alert ? '#ff3a2a' : '#c8b040';
  ctx.beginPath(); ctx.arc(18, -3, 1.6, 0, 7); ctx.arc(18, 3, 1.6, 0, 7); ctx.fill();
  ctx.restore();
}
