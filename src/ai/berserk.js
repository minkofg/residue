'use strict';
// 焚化炉桥段 + Boss 战一：暴走处刑者（计划 3.5、3.6、4.4）
//
// 桥段：焚化炉车间中间是一道熔渣坑，只有一座窄吊桥能过；吊桥正上方悬着钢水包。
//   把处刑者引上吊桥，拉下控制台的钢水闸（useLadle）→ 1 秒后钢水浇下来：
//     · 它在桥上 → 被钢水浇透，却变异成「暴走形态」（EDEF.executionerBerserk）→ Boss 战开始，
//       追踪者系统就此结束（不再跟随、不再有导演系统）；车间的门被警报联锁锁死，打赢才开
//     · 没在桥上 → 白浇，钢水包要重新加热 12 秒
//     · 你自己站在桥上 → 重伤
//
// Boss：3000 血，有上限、能杀死。和追踪形态完全独立的一套数值（config/enemies.js）。
//   阶段一（3000–1500）：速度 200，连续两下挥砍；中距离跳劈，落点有 0.8 秒红圈预警
//   阶段二（< 1500）：  撕掉拘束服，隔一段就冲撞；撞墙晕 2.5 秒。撞到钢水管道 → 管道破裂，一次 600
//   弱点：背后裸露的心脏，从背后打伤害 ×2
//   不会被普通攻击打出硬直；闪光弹只能晃它 1.5 秒

const BERSERK = {
  slash: { windup: 0.5, rec: 1.0, combo: 2, gap: 0.28, step: 280, arc: 1.1 },   // arc：只砍得到正前方 ±63° 以内的人
  leap: { min: 3.5 * 48, max: 8 * 48, cd: [5, 7], dmg: 55, r: 80, air: 0.45, land: 1.4 },
  charge: { min: 3 * 48, cd: [3.5, 5], tell: 0.7, spd: 440, time: 1.8, dmg: 50 },
  pipeR: 1.9 * 48,         // 撞墙时离钢水管道这么近 → 管道破裂
  backArc: 1.3,            // 子弹方向和它的朝向夹角小于这个（约 75°，背后 150° 的扇形）= 打在背后
  // 转身速度上限（弧度/秒）。它体型大、转身慢：绕到背后是这场 Boss 战的核心技巧（玩家跑 215，它走 200，光靠跑绕不过去）
  //   · 挥砍蓄力时几乎转不动 → 从侧面闪过去，这一刀就砍空
  //   · 硬直（rec：挥砍收招、跳劈落地、冲撞结束）完全不转身 → 这是绕背输出的窗口
  turn: { chase: 3.2, slash: 1.6 },
  flashStun: 1.5,
};
// 按上限转向目标角度
function turnToward(e, a, rate, dt) { const d = angDiff(e.fa, a); e.fa += Math.sign(d) * Math.min(Math.abs(d), rate * dt); }
const FURNACE = { land: 1.0, pourT: 2.6, recharge: 12, selfDmg: 60, enemyDmg: 400 };

function berserkBoss() { return S.enemies.find(e => e.t === 'executionerBerserk' && !e.dead) || null; }
function onBridge(x, y) {
  const F = LEVEL && LEVEL.furnace; if (!F) return false;
  const [bx, by, bw, bh] = F.bridge, tx = x / T, ty = y / T;
  return tx >= bx && tx < bx + bw && ty >= by && ty < by + bh;
}

// ---------------------------------------------------------------- 钢水闸
function useLadle(it) {
  if (S.flags.execMutated) { msg('钢水包已经倒空了，吊臂歪在一边。', 2.5); return; }
  if (S.pour) return;
  const wait = (S.pourReady || 0) - S.time;
  if (wait > 0) { sfx('locked', 0.4); msg(`钢水包正在重新加热……还要 ${Math.ceil(wait)} 秒。`, 2); return; }
  S.pour = { t: 0, landed: false };
  sfx('metal', 1.2); sfxAt('sizzle', it.x, it.y, 1, 1600, 0.3); shake = Math.max(shake, 6);
  emitNoise(it.x, it.y, 10, 'ladle');
  msg('闸门「哐」地落下 —— 吊桥上方的钢水包开始倾斜！', 2.5);
}
function updatePour(dt) {
  const s = S.pour; if (!s) return;
  s.t += dt;
  const F = LEVEL.furnace;
  if (!F) { S.pour = null; return; }
  const [bx, by, bw, bh] = F.bridge;
  if (s.t < FURNACE.pourT && Math.random() < dt * 60) {
    const x = (bx + Math.random() * bw) * T, y = (by + Math.random() * bh) * T;
    parts.push({ x, y, vx: rand(-40, 40), vy: rand(-80, -20), life: rand(0.3, 0.7), max: 0.7, s: rand(2, 5), c: Math.random() < .5 ? '#ffd060' : '#ff6a10' });
  }
  if (!s.landed && s.t >= FURNACE.land) {
    s.landed = true; shake = Math.max(shake, 16);
    sfxAt('explode', (bx + bw / 2) * T, (by + bh / 2) * T, 1, 2400, 0.4); sfxAt('sizzle', (bx + bw / 2) * T, (by + bh / 2) * T, 1.5, 2400, 0.4);
    const ex = activeExecutioner();
    let hit = false;
    for (const e of S.enemies) {
      if (e.dead || !onBridge(e.x, e.y)) continue;
      if (e === ex) { hit = true; continue; }
      if (e.t !== 'executionerBerserk') damageEnemy(e, FURNACE.enemyDmg, Math.PI / 2, 0, false, 0, 'fire');
    }
    if (onBridge(S.p.x, S.p.y)) { hurtPlayer(FURNACE.selfDmg, Math.PI / 2, 'fire'); msg('钢水溅了你一身！', 2.5); }
    if (hit) mutateExecutioner(ex);
    else { S.pourReady = S.time + FURNACE.recharge; msg('钢水轰地浇在空荡荡的吊桥上……它不在桥上。钢水包开始重新加热。', 4); }
  }
  if (s.t >= FURNACE.pourT) S.pour = null;
}
// 处刑者被钢水浇透 → 暴走形态。追踪者系统到此结束（计划 3.6）
function mutateExecutioner(ex) {
  const x = ex.x, y = ex.y;
  S.enemies = S.enemies.filter(e => e !== ex);
  const D = S.executioner;
  if (D) { D.active = false; D.follow = null; D.done = true; D.tension = 0; }
  const b = mkEnemy('executionerBerserk', 0, 0);
  b.x = x; b.y = y; b.fa = ex.fa; b.introT = 2.8; b.alert = true; b.state = 'chase';
  b.leapCd = S.time + 4; b.chargeCd = S.time + 3;
  S.enemies.push(b);
  shake = 28; cryAt('berserk', 'roar', x, y, 1.2, 4000, 0.6);
  for (let i = 0; i < 60; i++) { const a = rand(6.283), v = rand(60, 300); parts.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: rand(0.4, 1), max: 1, s: rand(2, 6), c: Math.random() < .5 ? '#ffb040' : '#5a1010' }); }
  msg('钢水把它浇了个透 —— 可它没有倒下。外壳一块块崩裂，左手长出了利爪……', 5);
  setFlag('execMutated');
}

// ---------------------------------------------------------------- 钢水管道
function pipeBroken(i) { return !!(S.pipes && S.pipes[i]); }
function checkPipes(e) {
  const F = LEVEL.furnace; if (!F || !F.pipes) return false;
  let hit = false;
  F.pipes.forEach(([px, py], i) => {
    if (pipeBroken(i) || dist(e.x, e.y, (px + .5) * T, (py + .5) * T) > BERSERK.pipeR) return;
    (S.pipes = S.pipes || {})[i] = true; hit = true;
    const x = (px + .5) * T, y = (py + .5) * T;
    sfxAt('explode', x, y, 1.2, 2400, 0.4); sfxAt('sizzle', x, y, 1.5, 2000, 0.3); shake = Math.max(shake, 18);
    (S.fires = S.fires || []).push({ x, y, r: 70, t: 5, max: 5 });
    damageEnemy(e, EDEF.executionerBerserk.envDamage, Math.atan2(e.y - y, e.x - x), 0, false, 0, 'env');
    floats.push({ x: e.x, y: e.y - 40, t: '管道破裂！', life: 1.5, c: '#ffa040' });
    msg('钢水管道被撞裂了，滚烫的钢水浇了它一身！', 3);
  });
  return hit;
}

// ---------------------------------------------------------------- AI
function updateBerserk(e, dt, safe) {
  const B = BERSERK, D = EDEF.executionerBerserk, p = S.p;
  const dx = p.x - e.x, dy = p.y - e.y, d = Math.hypot(dx, dy), ang = Math.atan2(dy, dx);
  e.ph += dt;
  if (e.introT > 0) { e.introT -= dt; e.fa += angDiff(e.fa, ang) * Math.min(1, dt * 2); return; }
  if (e.stunT > 0) { e.stunT -= dt; return; }
  if (e.stag > 0) { e.stag -= dt; return; }
  if (e.hp <= D.phase2At && !e.phase2) {
    e.phase2 = true; e.state = 'rec'; e.recT = 1.4; e.chargeCd = S.time + 1.5;
    cryAt('berserk', 'roar', e.x, e.y, 1.2, 4000, 0.5); shake = Math.max(shake, 20);
    msg('它撕掉了身上的拘束服 —— 开始发疯似的横冲直撞！（引它撞上墙边的钢水管道）', 5);
    return;
  }
  const reach = e.r + p.r + D.reach;
  switch (e.state) {
    case 'slash': {
      e.atkT -= dt; turnToward(e, ang, B.turn.slash, dt);
      if (e.combo > 0 && d > reach * 0.7) {   // 第二下：踏步追上被第一下打退的玩家
        const ox = e.x, oy = e.y; moveEnt(e, Math.cos(ang) * B.slash.step * dt, Math.sin(ang) * B.slash.step * dt);
        if (inSafeTile(e.x, e.y)) { e.x = ox; e.y = oy; }
      }
      if (e.atkT > 0) return;
      if (!safe && d < reach + 8 && Math.abs(angDiff(e.fa, ang)) < B.slash.arc) hurtPlayer(D.dmg, ang, 'boss');   // 已经绕到侧面 / 背后 → 砍空
      sfxAt('bash', e.x, e.y, 0.6, 900);
      e.combo = (e.combo || 0) + 1;
      if (e.combo < B.slash.combo && d < reach * 1.6) { e.atkT = B.slash.gap; return; }
      e.state = 'rec'; e.recT = B.slash.rec; e.combo = 0; return;
    }
    case 'leapTell': {
      e.atkT -= dt; e.fa = Math.atan2(e.leapY - e.y, e.leapX - e.x);
      if (e.atkT <= 0) { e.state = 'leapAir'; e.airT = 0; e.leapFrom = { x: e.x, y: e.y }; cryAt('berserk', 'grunt', e.x, e.y, 1, 1600, 0.3); }
      return;
    }
    case 'leapAir': {
      e.airT += dt; const k = Math.min(1, e.airT / B.leap.air);
      e.x = e.leapFrom.x + (e.leapX - e.leapFrom.x) * k; e.y = e.leapFrom.y + (e.leapY - e.leapFrom.y) * k;
      if (k >= 1) {
        e.state = 'rec'; e.recT = B.leap.land; shake = Math.max(shake, 16); sfxAt('bash', e.x, e.y, 1.5, 2000, 0.4);
        decals.push({ x: e.x, y: e.y, r: 40, rot: rand(6), a: 0.6, dirt: true });
        if (!safe && dist(e.x, e.y, p.x, p.y) < B.leap.r + p.r) hurtPlayer(B.leap.dmg, Math.atan2(p.y - e.y, p.x - e.x), 'boss');
        // 落在墙里 / 家具上：往回找最近能站的地方
        if (solidT(Math.floor(e.x / T), Math.floor(e.y / T))) { e.x = e.leapFrom.x; e.y = e.leapFrom.y; }
      }
      return;
    }
    case 'chargeTell': {
      e.atkT -= dt; e.fa += angDiff(e.fa, ang) * Math.min(1, dt * 8);
      if (e.atkT <= 0) { e.state = 'charge'; e.chargeT = B.charge.time; e.chargeA = e.fa; e.chargeHit = false; cryAt('berserk', 'roar', e.x, e.y, 1, 2000, 0.3); }
      return;
    }
    case 'charge': {
      e.chargeT -= dt;
      const ox = e.x, oy = e.y;
      moveEnt(e, Math.cos(e.chargeA) * B.charge.spd * dt, Math.sin(e.chargeA) * B.charge.spd * dt);
      if (inSafeTile(e.x, e.y)) { e.x = ox; e.y = oy; }
      if (!safe && !e.chargeHit && dist(e.x, e.y, p.x, p.y) < e.r + p.r + 6) { e.chargeHit = true; hurtPlayer(B.charge.dmg, e.chargeA, 'boss'); }
      const along = (e.x - ox) * Math.cos(e.chargeA) + (e.y - oy) * Math.sin(e.chargeA);   // 沿冲撞方向前进了多少（擦着墙滑也算撞上）
      if (along < B.charge.spd * dt * 0.5) {   // 撞墙：晕 2.5 秒；旁边有钢水管道就撞裂它
        e.state = 'chase'; e.stunT = D.stunAfterCharge; shake = Math.max(shake, 14); sfxAt('bash', e.x, e.y, 1.6, 2000, 0.4);
        floats.push({ x: e.x, y: e.y - 34, t: '晕眩', life: 1.2, c: '#ffcc55' });
        checkPipes(e);
      } else if (e.chargeT <= 0) { e.state = 'rec'; e.recT = 1.2; }
      return;
    }
    case 'rec': e.recT -= dt; if (e.recT <= 0) e.state = 'chase'; return;
  }
  // ---- 追击
  if (safe) return;
  const los = losClear(e.x, e.y, p.x, p.y), direct = los && walkClear(e.x, e.y, p.x, p.y);
  // 人在它身后时先转过来，不会反手就砍
  if (direct && d < reach * 0.85 && Math.abs(angDiff(e.fa, ang)) < 1.6) { e.state = 'slash'; e.atkT = B.slash.windup; e.combo = 0; cryAt('berserk', 'grunt', e.x, e.y, 0.7, 900, 0.1); return; }
  if (e.phase2 && direct && d > B.charge.min && S.time >= (e.chargeCd || 0)) {
    e.state = 'chargeTell'; e.atkT = B.charge.tell; e.chargeCd = S.time + rand(B.charge.cd[0], B.charge.cd[1]); return;
  }
  if (!e.phase2 && los && d > B.leap.min && d < B.leap.max && S.time >= (e.leapCd || 0) && !solidT(Math.floor(p.x / T), Math.floor(p.y / T))) {
    e.state = 'leapTell'; e.atkT = D.leapTell; e.leapX = p.x; e.leapY = p.y; e.leapCd = S.time + rand(B.leap.cd[0], B.leap.cd[1]); return;
  }
  const n = direct ? [p.x, p.y] : flowNext(e);
  if (n) {
    const a = Math.atan2(n[1] - e.y, n[0] - e.x), ox = e.x, oy = e.y;
    turnToward(e, a, B.turn.chase, dt);   // 转身慢：朝着当前面朝的方向走，目标在身后时要先转过来（转身时走得慢）
    const k = Math.max(0.25, Math.cos(angDiff(e.fa, a)));
    moveEnt(e, Math.cos(e.fa) * e.spd * k * dt, Math.sin(e.fa) * e.spd * k * dt);
    if (inSafeTile(e.x, e.y)) { e.x = ox; e.y = oy; }
  }
}

// 受伤修正（combat.js 的 damageEnemy 调用）：返回修正后的伤害
function berserkDamage(e, dmg, a, src) {
  if (src === 'env') return dmg;
  if (Math.abs(angDiff(a, e.fa)) < BERSERK.backArc) {
    if (Math.random() < 0.5) floats.push({ x: e.x, y: e.y - 30, t: '心脏！', life: 0.8, c: '#ff5050' });
    return dmg * EDEF.executionerBerserk.weakSpot.mul;
  }
  return dmg;
}

// ---------------------------------------------------------------- 绘制
function drawBerserk(e) {
  ctx.save(); ctx.translate(e.x, e.y);
  if (e.dead) {
    ctx.rotate(e.fa); ctx.globalAlpha = 0.9; ctx.fillStyle = '#2a0e0a'; ctx.beginPath(); ctx.ellipse(0, 0, 34, 20, 0, 0, 7); ctx.fill();
    ctx.fillStyle = '#6a1a10'; ctx.beginPath(); ctx.arc(-10, 0, 7, 0, 7); ctx.fill(); ctx.restore(); return;
  }
  const air = e.state === 'leapAir', k = air ? Math.sin(Math.min(1, e.airT / BERSERK.leap.air) * Math.PI) : 0;
  ctx.fillStyle = 'rgba(0,0,0,0.45)'; ctx.beginPath(); ctx.ellipse(3, 6, 24 - k * 6, 18 - k * 5, 0, 0, 7); ctx.fill();
  if (air) { ctx.translate(0, -k * 26); ctx.scale(1 + k * 0.2, 1 + k * 0.2); }
  let a = e.fa; if (e.stunT > 0) a += Math.sin(e.ph * 30) * 0.15;
  if (e.introT > 0) { ctx.translate(Math.sin(e.ph * 40) * 3, 0); }
  ctx.rotate(a);
  const p2 = e.phase2, s = Math.sin(e.ph * (e.state === 'charge' ? 18 : 6)) * 7;
  const skin = p2 ? '#6a2a22' : '#2a1a18', skin2 = p2 ? '#8a3a2a' : '#3a2420';
  ctx.fillStyle = '#140c0a'; ctx.fillRect(-8 + s, -19, 16, 11); ctx.fillRect(-8 - s, 8, 16, 11);   // 腿
  ctx.fillStyle = skin; ctx.beginPath(); ctx.ellipse(0, 0, 21, 30, 0, 0, 7); ctx.fill();
  if (!p2) { ctx.strokeStyle = '#4a3a34'; ctx.lineWidth = 2; for (let k2 = -16; k2 <= 16; k2 += 8) { ctx.beginPath(); ctx.moveTo(-10, k2); ctx.lineTo(12, k2 + 3); ctx.stroke(); } }   // 拘束服的带子
  else { ctx.strokeStyle = '#a04a3a'; ctx.lineWidth = 1.5; for (let k2 = -18; k2 <= 18; k2 += 6) { ctx.beginPath(); ctx.moveTo(-14, k2); ctx.quadraticCurveTo(0, k2 + 4, 14, k2); ctx.stroke(); } }   // 裸露的肌肉
  // 背后的心脏（弱点）：一跳一跳地发红光
  const beat = 0.6 + 0.4 * Math.max(0, Math.sin(e.ph * 7));
  ctx.fillStyle = `rgba(255,50,30,${0.35 * beat})`; ctx.beginPath(); ctx.arc(-16, 0, 14, 0, 7); ctx.fill();
  ctx.fillStyle = '#c02020'; ctx.beginPath(); ctx.arc(-15, 0, 6 + beat * 2, 0, 7); ctx.fill();
  // 右臂：普通的拳；左臂：利爪（挥砍时前伸）
  const sl = e.state === 'slash', pr = sl ? 28 + (e.combo % 2 ? 10 : 0) - Math.max(0, e.atkT) * 20 : e.state === 'chargeTell' ? 6 : 16;
  ctx.fillStyle = skin2; ctx.fillRect(4, 16, 18, 10); ctx.beginPath(); ctx.arc(24, 21, 8, 0, 7); ctx.fill();
  ctx.fillRect(4, -27, pr, 10);
  ctx.strokeStyle = '#d8d0c0'; ctx.lineWidth = 2.5;
  for (let c = -1; c <= 1; c++) { ctx.beginPath(); ctx.moveTo(pr + 4, -22 + c * 4); ctx.lineTo(pr + 26, -24 + c * 7); ctx.stroke(); }
  // 头
  ctx.fillStyle = skin2; ctx.beginPath(); ctx.arc(6, 0, 12, 0, 7); ctx.fill();
  const eye = e.state === 'chargeTell' || e.state === 'leapTell' ? '#ff2a1a' : '#ffb0a0';
  ctx.fillStyle = eye; ctx.fillRect(13, -6, 3, 3); ctx.fillRect(13, 3, 3, 3);
  ctx.restore();
}
// 盖在黑暗之上的预警：跳劈落点的红圈、冲撞前的红光（必须看得见，才躲得开）
function drawBerserkTells() {
  const e = berserkBoss(); if (!e) return;
  if (e.state === 'leapTell' || e.state === 'leapAir') {
    const k = e.state === 'leapTell' ? 1 - e.atkT / EDEF.executionerBerserk.leapTell : 1;
    ctx.strokeStyle = `rgba(255,40,30,${0.5 + 0.4 * k})`; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(e.leapX, e.leapY, BERSERK.leap.r, 0, 7); ctx.stroke();
    ctx.fillStyle = `rgba(255,30,20,${0.12 + 0.25 * k})`; ctx.beginPath(); ctx.arc(e.leapX, e.leapY, BERSERK.leap.r * k, 0, 7); ctx.fill();
  }
  if (e.state === 'chargeTell') {
    const g = ctx.createRadialGradient(e.x, e.y, 4, e.x, e.y, 60);
    g.addColorStop(0, 'rgba(255,60,30,0.55)'); g.addColorStop(1, 'rgba(255,0,0,0)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(e.x, e.y, 60, 0, 7); ctx.fill();
    ctx.strokeStyle = 'rgba(255,60,30,0.5)'; ctx.lineWidth = 2; ctx.setLineDash([8, 8]);
    ctx.beginPath(); ctx.moveTo(e.x, e.y); ctx.lineTo(e.x + Math.cos(e.fa) * 400, e.y + Math.sin(e.fa) * 400); ctx.stroke(); ctx.setLineDash([]);
  }
  if (e.introT > 0) {
    const g = ctx.createRadialGradient(e.x, e.y, 4, e.x, e.y, 80);
    g.addColorStop(0, 'rgba(255,150,40,0.6)'); g.addColorStop(1, 'rgba(255,80,0,0)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(e.x, e.y, 80, 0, 7); ctx.fill();
  }
}
// 地面层：吊桥、钢水包、倒下来的钢水、墙上的钢水管道
function drawFurnace() {
  const F = LEVEL && LEVEL.furnace; if (!F) return;
  const [bx, by, bw, bh] = F.bridge, x0 = bx * T, y0 = by * T, w = bw * T, h = bh * T;
  // 钢水包（悬在桥中央上方）
  const cx = x0 + w / 2, cy = y0 + h / 2, empty = S.flags.execMutated, tilt = S.pour ? Math.min(1, S.pour.t / FURNACE.land) : empty ? 1 : 0;
  ctx.save(); ctx.translate(cx, cy);
  ctx.strokeStyle = '#555'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(-w, -4); ctx.lineTo(w, -4); ctx.stroke();   // 吊轨
  ctx.rotate(tilt * 0.7);
  ctx.fillStyle = '#3a3230'; ctx.beginPath(); ctx.arc(0, 0, 20, 0, 7); ctx.fill();
  ctx.fillStyle = empty ? '#2a2220' : `rgba(255,${120 + Math.floor(40 * Math.sin(S.time * 3))},30,0.9)`; ctx.beginPath(); ctx.arc(0, 0, 14, 0, 7); ctx.fill();
  ctx.restore();
  // 倒下来的钢水
  if (S.pour) {
    const k = Math.min(1, S.pour.t / FURNACE.land), fade = S.pour.t > FURNACE.pourT - 0.6 ? (FURNACE.pourT - S.pour.t) / 0.6 : 1;
    const g = ctx.createRadialGradient(cx, cy, 2, cx, cy, Math.max(w, h) * 0.7);
    g.addColorStop(0, `rgba(255,220,120,${0.9 * k * fade})`); g.addColorStop(0.6, `rgba(255,110,20,${0.7 * k * fade})`); g.addColorStop(1, 'rgba(200,40,0,0)');
    ctx.fillStyle = g; ctx.fillRect(x0 - 10, y0 - 10, w + 20, h + 20);
  }
  // 墙上的钢水管道（完好的发着暗红的光，破了的只剩断口）
  (F.pipes || []).forEach(([px, py], i) => {
    const x = (px + .5) * T, y = (py + .5) * T, broken = pipeBroken(i);
    ctx.fillStyle = broken ? '#2a2422' : '#5a4a44'; ctx.beginPath(); ctx.arc(x, y, 12, 0, 7); ctx.fill();
    ctx.strokeStyle = broken ? '#1a1412' : '#8a7a70'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(x, y, 12, 0, 7); ctx.stroke();
    if (!broken) { ctx.fillStyle = `rgba(255,${90 + Math.floor(30 * Math.sin(S.time * 4 + i))},20,0.8)`; ctx.beginPath(); ctx.arc(x, y, 6, 0, 7); ctx.fill(); }
  });
}
