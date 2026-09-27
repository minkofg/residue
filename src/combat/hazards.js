'use strict';
// 地图 3 的「范围伤害」：膨胀者的爆炸与毒雾、中毒、榴弹发射器的燃烧榴弹与火场
//
//   S.gas   毒雾   { x, y, r, t }   玩家站进去 → 中毒；怪物在里面也会慢慢掉血
//   S.fires 火场   { x, y, r, t }   燃烧榴弹落地后烧 HAZ.fire.t 秒；怪物在里面持续掉血（蔓生体只怕火）
//   S.nades 飞行中的榴弹 { x, y, vx, vy, left }
//   S.p.poison 中毒：每隔几秒掉一点血（不会致死，最低留 1），蓝色草药 / 含蓝的混合草药解毒

const HAZ = {
  bloat: { r: 95, dmgPlayer: 30, dmgEnemy: 70, gasR: 85, gasT: 7 },
  gas: { enemyDps: 6 },
  poison: { every: 2.2, dmg: 3, floor: 1 },
  nade: { speed: 620, blastR: 70, blastDmg: 90, fuse: 0.9 },
  fire: { r: 78, t: 4.5, dps: 45, playerDmg: 10 },
};

// ---------------------------------------------------------------- 膨胀者：死了就炸
function bloaterBurst(e) {
  if (e.burst) return; e.burst = true;
  const B = HAZ.bloat, p = S.p;
  sfxAt('explode', e.x, e.y, 1, 1600, 0.3); sfxAt('bash', e.x, e.y, 0.8, 1200, 0.2);
  shake = Math.max(shake, dist(e.x, e.y, p.x, p.y) < 300 ? 12 : 4);
  for (let i = 0; i < 40; i++) { const a = rand(6.283), v = rand(60, 260); parts.push({ x: e.x, y: e.y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: rand(0.4, 0.9), max: 0.9, s: rand(3, 6), c: Math.random() < .5 ? '#8aa04a' : '#5a7a2a' }); }
  decals.push({ x: e.x, y: e.y, r: 34, rot: rand(6), a: 0.6, dirt: true });
  emitNoise(e.x, e.y, 10, 'bloat');
  // 冲击：炸到玩家，也炸到旁边的怪（引到敌群旁边再打爆 —— 计划 5.x）
  const d = dist(e.x, e.y, p.x, p.y);
  if (d < B.r) hurtPlayer(B.dmgPlayer, Math.atan2(p.y - e.y, p.x - e.x), 'bloat');
  for (const o of S.enemies) {
    if (o === e || o.dead) continue;
    const od = dist(e.x, e.y, o.x, o.y);
    if (od < B.r + o.r) damageEnemy(o, B.dmgEnemy * (1 - od / (B.r + o.r) * 0.5), Math.atan2(o.y - e.y, o.x - e.x), 20, false, 0.5, 'blast');
  }
  (S.gas = S.gas || []).push({ x: e.x, y: e.y, r: B.gasR, t: B.gasT, max: B.gasT });
}

// ---------------------------------------------------------------- 中毒
function poisonPlayer() {
  const p = S.p; if (p.poison) return;
  p.poison = true; p.poisonT = 0; sfx('hurt', 0.6);
  msg('你中毒了！（蓝色草药可以解毒）', 4);
}
function curePoison() { const p = S.p; if (!p.poison) return false; p.poison = false; p.poisonT = 0; return true; }

// ---------------------------------------------------------------- 榴弹发射器
function launchGrenade(ox, oy, a, range, kind = 'fire') {
  const N = HAZ.nade;
  (S.nades = S.nades || []).push({ x: ox, y: oy, vx: Math.cos(a) * N.speed, vy: Math.sin(a) * N.speed, left: Math.min(range, 900) / N.speed, t: 0, kind });
}
function grenadeBurst(x, y, kind = 'fire') {
  if (kind === 'bomb') return bombBurst(x, y);
  if (kind === 'acid') return acidBurst(x, y);
  const N = HAZ.nade, F = HAZ.fire, p = S.p;
  sfxAt('explode', x, y, 1, 1800, 0.35); shake = Math.max(shake, dist(x, y, p.x, p.y) < 320 ? 10 : 4);
  for (let i = 0; i < 36; i++) { const a = rand(6.283), v = rand(80, 300); parts.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: rand(0.3, 0.7), max: 0.7, s: rand(2, 5), c: Math.random() < .5 ? '#ffb040' : '#ff5a20' }); }
  decals.push({ x, y, r: 30, rot: rand(6), a: 0.7, dirt: true });
  let hit = 0;
  for (const o of S.enemies) {
    if (o.dead || o.hidden) continue;
    const od = dist(x, y, o.x, o.y);
    if (od < N.blastR + o.r) { damageEnemy(o, N.blastDmg, Math.atan2(o.y - y, o.x - x), 18, false, 0.6, 'fire'); hit++; }
  }
  if (dist(x, y, p.x, p.y) < N.blastR * 0.8) hurtPlayer(20, Math.atan2(p.y - y, p.x - x), 'fire');
  (S.fires = S.fires || []).push({ x, y, r: F.r, t: F.t, max: F.t });
  return hit;   // 炸到几只（命中率统计用，见 updateHazards）
}

// 爆炸榴弹：大范围冲击，边缘减半；墙后面的炸不到；离得太近自己也挨炸
function bombBurst(x, y) {
  const B = GL_ROUNDS.bomb, p = S.p;
  sfxAt('explode', x, y, 1.3, 2200, 0.45); sfxAt('bash', x, y, 1, 1500, 0.2);
  shake = Math.max(shake, dist(x, y, p.x, p.y) < 380 ? 18 : 6);
  for (let i = 0; i < 60; i++) { const a = rand(6.283), v = rand(120, 420); parts.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: rand(0.3, 0.9), max: 0.9, s: rand(2, 6), c: Math.random() < .4 ? '#ffe080' : Math.random() < .5 ? '#ff8a20' : '#555' }); }
  decals.push({ x, y, r: 42, rot: rand(6), a: 0.85, dirt: true });
  emitNoise(x, y, B.noise, 'grenade');
  let hit = 0;
  for (const o of S.enemies) {
    if (o.dead || o.hidden) continue;
    const od = dist(x, y, o.x, o.y);
    if (od > B.r + o.r || !losClear(x, y, o.x, o.y)) continue;
    damageEnemy(o, Math.round(B.dmg * (1 - 0.5 * Math.min(1, od / B.r))), Math.atan2(o.y - y, o.x - x), B.kb, false, B.stag, 'blast'); hit++;
  }
  const pd = dist(x, y, p.x, p.y);
  if (pd < B.r * 0.85 && losClear(x, y, p.x, p.y)) hurtPlayer(Math.round(B.playerDmg * (1 - 0.5 * pd / B.r)), Math.atan2(p.y - y, p.x - x), 'grenade');
  return hit;
}
// 酸液榴弹：小范围伤害 + 腐蚀（e.acidT 秒内受到的伤害 ×1.5，见 damageEnemy）
function acidBurst(x, y) {
  const A = GL_ROUNDS.acid, p = S.p;
  sfxAt('bash', x, y, 0.8, 1200, 0.2); sfx('hurt', 0.2);
  shake = Math.max(shake, dist(x, y, p.x, p.y) < 300 ? 6 : 2);
  for (let i = 0; i < 40; i++) { const a = rand(6.283), v = rand(60, 260); parts.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: rand(0.4, 0.9), max: 0.9, s: rand(2, 5), c: Math.random() < .5 ? '#9ad040' : '#6a9a20' }); }
  decals.push({ x, y, r: 38, rot: rand(6), a: 0.6, dirt: true });
  emitNoise(x, y, 10, 'grenade');
  let hit = 0;
  for (const o of S.enemies) {
    if (o.dead || o.hidden) continue;
    if (dist(x, y, o.x, o.y) > A.r + o.r) continue;
    const fresh = !(o.acidT > 0);
    o.acidT = A.t;
    damageEnemy(o, A.dmg, Math.atan2(o.y - y, o.x - x), 6, false, 0.3, 'acid'); hit++;
    if (fresh && !o.dead) floats.push({ x: o.x, y: o.y - 34, t: '被腐蚀！受到伤害 ×1.5', life: 1.4, c: '#b0e050' });
  }
  if (dist(x, y, p.x, p.y) < A.r * 0.7) hurtPlayer(A.playerDmg, Math.atan2(p.y - y, p.x - x), 'acid');
  return hit;
}

// ---------------------------------------------------------------- 每帧
function updateHazards(dt) {
  const p = S.p;
  // 飞行中的榴弹：撞墙 / 撞到怪 / 飞到射程尽头就炸。
  // 命中率：shoot() 发射时已经记了一发 shots，这里炸到怪才记 hits（以前榴弹永远算打空）
  drawAcid();
  const burst = g => { g.done = true; if (grenadeBurst(g.x, g.y, g.kind) > 0) S.stats.hits++; };
  for (const g of S.nades || []) {
    const steps = 3;
    for (let k = 0; k < steps && !g.done; k++) {
      const nx = g.x + g.vx * dt / steps, ny = g.y + g.vy * dt / steps;
      const hitE = S.enemies.find(o => !o.dead && !o.hidden && dist(nx, ny, o.x, o.y) < o.r + 8);
      if (opaqueT(Math.floor(nx / T), Math.floor(ny / T)) || hitE) { burst(g); break; }
      g.x = nx; g.y = ny;
    }
    g.left -= dt; g.t += dt;
    if (!g.done && g.left <= 0) burst(g);
    if (!g.done && Math.random() < 0.7) parts.push({ x: g.x, y: g.y, vx: rand(-15, 15), vy: rand(-15, 15), life: 0.35, max: 0.35, s: 2.5, c: 'rgba(200,200,200,0.5)' });
  }
  if (S.nades) S.nades = S.nades.filter(g => !g.done);
  // 酸液腐蚀：计时 + 冒绿泡
  for (const o of S.enemies) if (o.acidT > 0) { o.acidT -= dt; if (!o.dead && Math.random() < dt * 12) parts.push({ x: o.x + rand(-o.r, o.r), y: o.y + rand(-o.r, o.r), vx: rand(-8, 8), vy: rand(-30, -10), life: 0.5, max: 0.5, s: rand(2, 3.5), c: '#9ad040' }); }
  // 火场
  for (const f of S.fires || []) {
    f.t -= dt;
    for (const o of S.enemies) {
      if (o.dead || o.hidden || dist(f.x, f.y, o.x, o.y) > f.r + o.r * 0.5) continue;
      o.burnAcc = (o.burnAcc || 0) + HAZ.fire.dps * dt;
      if (o.burnAcc >= 15) { damageEnemy(o, o.burnAcc, rand(6.283), 0, false, 0.15, 'fire'); o.burnAcc = 0; }
    }
    if (dist(f.x, f.y, p.x, p.y) < f.r * 0.8) hurtPlayer(HAZ.fire.playerDmg, rand(6.283), 'fire');
    if (Math.random() < dt * 30) { const a = rand(6.283), r = rand(f.r); parts.push({ x: f.x + Math.cos(a) * r, y: f.y + Math.sin(a) * r, vx: rand(-10, 10), vy: rand(-50, -20), life: rand(0.3, 0.6), max: 0.6, s: rand(2, 4), c: Math.random() < .5 ? '#ffa030' : '#ff5010' }); }
  }
  if (S.fires) S.fires = S.fires.filter(f => f.t > 0);
  // 毒雾
  for (const g of S.gas || []) {
    g.t -= dt;
    if (dist(g.x, g.y, p.x, p.y) < g.r) poisonPlayer();
    for (const o of S.enemies) if (!o.dead && o.t !== 'bloater' && o.t !== 'boss' && dist(g.x, g.y, o.x, o.y) < g.r) { o.gasAcc = (o.gasAcc || 0) + HAZ.gas.enemyDps * dt; if (o.gasAcc >= 10) { damageEnemy(o, o.gasAcc, 0, 0, false, 0, 'gas'); o.gasAcc = 0; } }
  }
  if (S.gas) S.gas = S.gas.filter(g => g.t > 0);
  updateAcid(dt);   // 蔓生体的酸液（ai/vine.js）
  updateThrows(dt);   // 手雷、闪光弹（combat/throwables.js）
  updatePour(dt);     // 焚化炉的钢水（ai/berserk.js）
  updateLazWorld(dt); // 终点站台：钢材、腐蚀、J、电磁炮（ai/lazarus.js）
  // 中毒：慢慢掉血，不致死
  if (p.poison) {
    p.poisonT = (p.poisonT || 0) + dt;
    if (p.poisonT >= HAZ.poison.every) { p.poisonT = 0; if (p.hp > HAZ.poison.floor) { p.hp = Math.max(HAZ.poison.floor, p.hp - HAZ.poison.dmg); P.hurtT = Math.max(P.hurtT || 0, 0.15); } }
  }
}

// ---------------------------------------------------------------- 渲染（地面层：人物之前）
function drawHazards() {
  drawLazGround();   // 终点站台被腐蚀的地面（ai/lazarus.js）
  drawFurnace();   // 焚化炉：吊桥上的钢水包、墙上的钢水管道（ai/berserk.js）
  const t = performance.now() / 1000;
  for (const g of S.gas || []) {
    const k = Math.min(1, g.t / 1.5), gr = ctx.createRadialGradient(g.x, g.y, 0, g.x, g.y, g.r);
    gr.addColorStop(0, `rgba(140,190,60,${0.42 * k})`); gr.addColorStop(0.7, `rgba(110,160,40,${0.25 * k})`); gr.addColorStop(1, 'rgba(90,130,30,0)');
    ctx.fillStyle = gr; ctx.beginPath(); ctx.arc(g.x, g.y, g.r * (1 + 0.05 * Math.sin(t * 2)), 0, 7); ctx.fill();
  }
  for (const f of S.fires || []) {
    const k = Math.min(1, f.t / 1), fl = 0.8 + 0.2 * Math.sin(t * 17 + f.x);
    const gr = ctx.createRadialGradient(f.x, f.y, 0, f.x, f.y, f.r);
    gr.addColorStop(0, `rgba(255,200,80,${0.65 * k * fl})`); gr.addColorStop(0.5, `rgba(255,110,20,${0.45 * k * fl})`); gr.addColorStop(1, 'rgba(200,40,0,0)');
    ctx.fillStyle = gr; ctx.beginPath(); ctx.arc(f.x, f.y, f.r, 0, 7); ctx.fill();
  }
  for (const g of S.nades || []) { ctx.fillStyle = (GL_ROUNDS[g.kind] || GL_ROUNDS.fire).col; ctx.beginPath(); ctx.arc(g.x, g.y, 4, 0, 7); ctx.fill(); }
  drawThrows();
}
// 火光照亮周围（在暗层上抠洞，lighting.js 调用）
function hazardLights(c) {
  for (const f of S.fires || []) {
    const r = f.r * 3, g = c.createRadialGradient(f.x, f.y, 0, f.x, f.y, r);
    g.addColorStop(0, `rgba(0,0,0,${0.85 * Math.min(1, f.t)})`); g.addColorStop(1, 'rgba(0,0,0,0)');
    c.fillStyle = g; c.fillRect(f.x - r, f.y - r, r * 2, r * 2);
  }
}
