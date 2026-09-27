'use strict';
// 蔓生体（地图 3 温室）：伪装成种植槽里的一丛植物，不会移动。
//   · 平时（hide）：看起来就是一丛叶子，只是偶尔轻轻抖一下 —— 留心的玩家能认出来
//   · 玩家走近 / 被打 → 暴起（up）：近身用藤鞭抽，远一点就吐酸液（命中会中毒）
//   · 普通伤害正常，榴弹爆炸和火场 ×2；不会被击退（combat.js）
const VINE = { wake: 120, lashWind: 0.5, lashRec: 0.9, spitRange: 6 * 48, spitCd: 3.2, spitSpd: 320, acidDmg: 10, fireMul: 2 };

function updateVine(e, dt, safe) {
  const p = S.p, d = dist(e.x, e.y, p.x, p.y);
  e.ph += dt;
  if (e.state !== 'up') {
    e.state = 'hide';
    if ((d < VINE.wake && !safe) || e.alert) {
      e.state = 'up'; e.alert = true; e.spitT = 1.2; e.atkT = 0;
      cryAt('vine', 'creak', e.x, e.y, 1, 900, 0.2);
      shake = Math.max(shake, 5); msg('种植槽里的藤蔓猛地立了起来！', 3);
    }
    return;
  }
  e.fa = Math.atan2(p.y - e.y, p.x - e.x);
  if (safe) return;
  // 藤鞭：前摇 → 抽
  if (e.atkT > 0) {
    e.atkT -= dt;
    if (e.atkT <= 0) {
      if (d < e.reach + e.r + p.r) hurtPlayer(e.dmg, e.fa, 'vine');
      e.recT = VINE.lashRec; cryAt('vine', 'lash', e.x, e.y, 1, 750);
    }
    return;
  }
  if (e.recT > 0) { e.recT -= dt; return; }
  if (d < e.reach + e.r + p.r - 6) { e.atkT = VINE.lashWind; return; }
  // 酸液
  e.spitT -= dt;
  if (e.spitT <= 0 && d < VINE.spitRange && losClear(e.x, e.y, p.x, p.y)) {
    e.spitT = VINE.spitCd;
    const a = Math.atan2(p.y - e.y, p.x - e.x);
    (S.acid = S.acid || []).push({ x: e.x + Math.cos(a) * 20, y: e.y + Math.sin(a) * 20, vx: Math.cos(a) * VINE.spitSpd, vy: Math.sin(a) * VINE.spitSpd, left: VINE.spitRange / VINE.spitSpd + 0.2 });
    cryAt('vine', 'spit', e.x, e.y, 0.9, 750);
  }
}
function updateAcid(dt) {
  const p = S.p;
  for (const b of S.acid || []) {
    b.x += b.vx * dt; b.y += b.vy * dt; b.left -= dt;
    if (opaqueT(Math.floor(b.x / T), Math.floor(b.y / T)) || b.left <= 0) { b.done = true; decals.push({ x: b.x, y: b.y, r: 7, rot: 0, a: 0.5, dirt: true }); continue; }
    if (dist(b.x, b.y, p.x, p.y) < p.r + 6) {
      b.done = true; hurtPlayer(VINE.acidDmg, Math.atan2(b.vy, b.vx), 'acid'); poisonPlayer();
      for (let i = 0; i < 10; i++) parts.push({ x: b.x, y: b.y, vx: rand(-90, 90), vy: rand(-90, 90), life: 0.4, max: 0.4, s: 2.5, c: '#b8d040' });
    }
  }
  if (S.acid) S.acid = S.acid.filter(b => !b.done);
}
function drawVine(e) {
  ctx.save(); ctx.translate(e.x, e.y);
  if (e.dead) {
    ctx.fillStyle = '#2a2a14'; for (let i = 0; i < 6; i++) { const a = i * 1.05; ctx.fillRect(Math.cos(a) * 10 - 3, Math.sin(a) * 10 - 3, 6, 6); }
    ctx.restore(); return;
  }
  const up = e.state === 'up', t = e.ph;
  // 叶丛（伪装时就是这样）
  const twitch = !up && Math.sin(t * 0.7) > 0.97 ? Math.sin(t * 40) * 2 : 0;
  ctx.fillStyle = up ? '#3a5a22' : '#2f5a2a';
  for (let i = 0; i < 7; i++) { const a = i * 0.9 + 0.3; ctx.beginPath(); ctx.arc(Math.cos(a) * 11 + twitch, Math.sin(a) * 11, 9, 0, 7); ctx.fill(); }
  ctx.fillStyle = up ? '#5a7a2a' : '#3f6a34'; ctx.beginPath(); ctx.arc(0, 0, 10, 0, 7); ctx.fill();
  if (up) {
    // 立起来的藤鞭 + 一张有牙的「花苞」嘴，朝着玩家
    ctx.rotate(e.fa);
    const lash = e.atkT > 0 ? 1 - e.atkT / VINE.lashWind : 0;
    ctx.strokeStyle = '#4a6a24'; ctx.lineWidth = 5; ctx.lineCap = 'round';
    for (const s of [-1, 1]) { ctx.beginPath(); ctx.moveTo(0, 0); ctx.quadraticCurveTo(20, s * (18 + 8 * Math.sin(t * 5)), 28 + lash * 40, s * (6 + 10 * Math.sin(t * 7 + s))); ctx.stroke(); }
    ctx.fillStyle = '#7a2a3a'; ctx.beginPath(); ctx.arc(8, 0, 9, 0, 7); ctx.fill();
    ctx.fillStyle = '#e8e0c0'; for (let i = -2; i <= 2; i++) ctx.fillRect(12, i * 3 - 1, 4, 2);
  }
  ctx.restore();
}
function drawAcid() { ctx.fillStyle = '#c0e040'; for (const b of S.acid || []) { ctx.beginPath(); ctx.arc(b.x, b.y, 4, 0, 7); ctx.fill(); } }
