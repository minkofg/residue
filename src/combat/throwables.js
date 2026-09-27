'use strict';
// 投掷物（计划 6.2，副武器栏）：G 投掷，X 切换手雷 / 闪光弹。
//
//   破片手雷：落地滚一小段，引信到了就炸 —— 范围伤害 150（边缘减半）；离得太近自己也会被炸到
//   闪光弹：  靠眼睛的敌人（僵尸、狗、爬行者、膨胀者、猎手、处刑者）在范围内、看得见闪光 → 眩晕 3 秒；
//             舔舐者是瞎的，不会被闪到，但那一声会把它引过去；蔓生体、淤泥体没有反应。
//             自己正对着闪光也会白屏一下（不影响操作）
//
//   S.throws 飞行 / 滚动中的投掷物 { id, x, y, vx, vy, t, fuse }
//   S.p.sub  当前选中的投掷物（背包里没有了就自动换成另一种）
// 被僵尸抓住时按 G：把投掷物塞给它，立刻挣脱（ai/grab.js 的 grabThrow）。

const THROW = {
  speed: 460, minDist: 70, maxDist: 330, friction: 3.2, bounce: 0.45, cd: 0.8,
  grenade:   { dmg: 150, r: 110, playerDmg: 40, stag: 1.0, kb: 40, fuse: 1.4, noise: 14 },
  flashbang: { r: 230, stun: 3, fuse: 1.0, noise: 12, white: 1.2 },
};
const THROW_IDS = ['grenade', 'flashbang'];
// 靠眼睛的敌人：闪光弹对它们有效
const FLASH_BLIND = new Set(['zombie', 'dog', 'crawler', 'bloater', 'hunter', 'boss', 'executionerBerserk']);

function curThrow() {
  const p = S.p;
  if (p.sub && invHas(p.sub)) return p.sub;
  const f = THROW_IDS.find(id => invHas(id)) || null;
  p.sub = f; return f;
}
function selectThrow(id) {
  if (!invHas(id)) return false;
  S.p.sub = id; msg(`投掷物：${ITEMS[id].name}（G 投掷）`, 1.8); return true;
}
function cycleThrow() {
  const have = THROW_IDS.filter(id => invHas(id));
  if (!have.length) { msg('没有投掷物。', 1.5); return false; }
  const i = have.indexOf(curThrow());
  return selectThrow(have[(i + 1) % have.length]);
}

// 投掷：朝瞄准方向，落点 = 鼠标位置（夹在 70–330 像素之间）；没有鼠标信息就扔 200 像素
function throwItem(targetDist) {
  const p = S.p;
  if (P.throwCd > 0 || P.reloadT > 0) return false;
  if (inSafe()) { msg('安全屋里不能投掷。', 2); return false; }
  const id = curThrow();
  if (!id) { msg('没有投掷物。', 1.5); sfx('empty'); return false; }
  let d = targetDist;
  if (d === undefined) {
    const mx = typeof mouse !== 'undefined' && mouse.x ? mouse.x + cam.x : null, my = mx !== null ? mouse.y + cam.y : null;
    d = mx !== null ? dist(p.x, p.y, mx, my) : 200;
  }
  d = clamp(d, THROW.minDist, THROW.maxDist);
  // 匀减速滑行：v² = 2·a·d → 初速刚好停在落点
  const v = Math.sqrt(2 * THROW.speed * THROW.friction * d);
  invTake(id, 1);
  (S.throws = S.throws || []).push({ id, x: p.x + Math.cos(p.a) * 18, y: p.y + Math.sin(p.a) * 18, vx: Math.cos(p.a) * v, vy: Math.sin(p.a) * v, t: 0, fuse: THROW[id].fuse });
  P.throwCd = THROW.cd; sfx('knife', 0.6);
  emitNoise(p.x, p.y, 2, 'throw');
  if (!invHas(id)) curThrow();
  return true;
}

function updateThrows(dt) {
  if (P.throwCd > 0) P.throwCd -= dt;
  if (P.whiteT > 0) P.whiteT -= dt;
  for (const f of S.flashes || []) f.t -= dt;
  if (S.flashes) S.flashes = S.flashes.filter(f => f.t > 0);
  for (const g of S.throws || []) {
    g.t += dt;
    // 滑行 + 撞墙反弹（分 3 步，防止穿墙）
    for (let k = 0; k < 3; k++) {
      const nx = g.x + g.vx * dt / 3, ny = g.y + g.vy * dt / 3;
      if (solidT(Math.floor(nx / T), Math.floor(g.y / T))) { g.vx = -g.vx * THROW.bounce; if (Math.abs(g.vx) > 40) sfxAt('metal', g.x, g.y, 0.3, 500); } else g.x = nx;
      if (solidT(Math.floor(g.x / T), Math.floor(ny / T))) { g.vy = -g.vy * THROW.bounce; } else g.y = ny;
    }
    const sp = Math.hypot(g.vx, g.vy), dec = THROW.speed * THROW.friction * dt;
    if (sp <= dec) { g.vx = g.vy = 0; } else { g.vx *= (sp - dec) / sp; g.vy *= (sp - dec) / sp; }
    if (g.t >= g.fuse) { g.done = true; if (g.id === 'grenade') grenadeBlast(g.x, g.y); else flashBurst(g.x, g.y); }
  }
  if (S.throws) S.throws = S.throws.filter(g => !g.done);
}

function grenadeBlast(x, y) {
  const G = THROW.grenade, p = S.p;
  sfxAt('explode', x, y, 1.2, 2000, 0.4); sfxAt('bash', x, y, 0.9, 1400, 0.2);
  shake = Math.max(shake, dist(x, y, p.x, p.y) < 350 ? 16 : 5);
  for (let i = 0; i < 50; i++) { const a = rand(6.283), v = rand(100, 380); parts.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: rand(0.3, 0.8), max: 0.8, s: rand(2, 5), c: Math.random() < .4 ? '#ffd070' : Math.random() < .5 ? '#ff7a20' : '#555' }); }
  decals.push({ x, y, r: 36, rot: rand(6), a: 0.8, dirt: true });
  emitNoise(x, y, G.noise, 'grenade');
  for (const o of S.enemies) {
    if (o.dead || o.hidden) continue;
    const od = dist(x, y, o.x, o.y);
    if (od > G.r + o.r || !losClear(x, y, o.x, o.y)) continue;   // 墙后面的炸不到
    damageEnemy(o, Math.round(G.dmg * (1 - 0.5 * Math.min(1, od / G.r))), Math.atan2(o.y - y, o.x - x), G.kb, false, G.stag, 'blast');
  }
  const pd = dist(x, y, p.x, p.y);
  if (pd < G.r * 0.85 && losClear(x, y, p.x, p.y)) hurtPlayer(Math.round(G.playerDmg * (1 - 0.5 * pd / G.r)), Math.atan2(p.y - y, p.x - x), 'grenade');
}

function flashBurst(x, y) {
  const F = THROW.flashbang, p = S.p;
  sfxAt('glass', x, y, 0.8, 1600, 0.3); sfxAt('explode', x, y, 0.5, 1600, 0.2);
  (S.flashes = S.flashes || []).push({ x, y, t: 0.35 });
  emitNoise(x, y, F.noise, 'flash');   // 舔舐者会循着这一声扑过去
  let n = 0;
  for (const o of S.enemies) {
    if (o.dead || o.hidden || !FLASH_BLIND.has(o.t)) continue;
    if (o.t === 'boss' && (o.frozenT > 0 || o.knockdownT > 0)) continue;
    if (o.t === 'crawler' && o.state === 'lurk') continue;   // 趴在地上装死，眼睛是闭着的
    if (dist(x, y, o.x, o.y) > F.r || !losClear(x, y, o.x, o.y)) continue;
    if (o.t === 'executionerBerserk') {   // 暴走形态：只晃 1.5 秒；跳在半空中的不受影响
      if (o.state === 'leapAir') continue;
      o.stag = Math.max(o.stag || 0, BERSERK.flashStun); o.blindT = BERSERK.flashStun; o.state = 'chase'; n++;
      floats.push({ x: o.x, y: o.y - 26, t: '眩晕', life: 1.2, c: '#fff6c0' }); continue;
    }
    o.stag = Math.max(o.stag || 0, F.stun); o.blindT = F.stun; o.atkT = 0; n++;
    if (o.t === 'boss') { if (o.state === 'attack' || o.state === 'dash') o.state = 'chase'; o.dashT = 0; }
    else if (o.state !== 'idle') o.state = o.t === 'hunter' ? 'rec' : 'chase';
    if (o.t === 'hunter') { o.recT = 0.3; o.execLeap = false; }
    floats.push({ x: o.x, y: o.y - 26, t: '眩晕', life: 1.2, c: '#fff6c0' });
  }
  // 自己正对着闪光：白屏一下
  const pd = dist(x, y, p.x, p.y);
  if (pd < F.r && losClear(x, y, p.x, p.y) && Math.abs(angDiff(p.a, Math.atan2(y - p.y, x - p.x))) < 1.1) P.whiteT = F.white * (1 - pd / F.r * 0.5);
  return n;
}

// ---------------------------------------------------------------- 绘制
// 地上 / 物品栏里共用的小图标（原点在中心，约 20×20）
function drawThrowIcon(c, id) {
  if (id === 'grenade') {
    c.fillStyle = '#4a5a30'; c.beginPath(); c.ellipse(0, 1, 7, 8.5, 0, 0, 7); c.fill();
    c.strokeStyle = '#2e3a1c'; c.lineWidth = 1; for (let k = -4; k <= 4; k += 4) { c.beginPath(); c.moveTo(-7, k + 1); c.lineTo(7, k + 1); c.stroke(); }
    c.fillStyle = '#8a8a80'; c.fillRect(-3, -10, 6, 4); c.fillRect(2, -9, 6, 2);
    c.strokeStyle = '#c9a33a'; c.lineWidth = 1.2; c.beginPath(); c.arc(-4, -9, 2.5, 0, 7); c.stroke();
  } else {
    c.fillStyle = '#c8c8b8'; c.fillRect(-5, -8, 10, 17);
    c.fillStyle = '#2a2a2a'; c.fillRect(-5, -3, 10, 2); c.fillRect(-5, 3, 10, 2);
    c.fillStyle = '#8a8a80'; c.fillRect(-3, -11, 6, 4); c.fillRect(2, -10, 6, 2);
    c.strokeStyle = '#c9a33a'; c.lineWidth = 1.2; c.beginPath(); c.arc(-4, -10, 2.5, 0, 7); c.stroke();
  }
}
function drawThrows() {
  for (const g of S.throws || []) {
    ctx.save(); ctx.translate(g.x, g.y); ctx.rotate(g.t * 9 * Math.min(1, Math.hypot(g.vx, g.vy) / 200)); ctx.scale(0.7, 0.7);
    drawThrowIcon(ctx, g.id);
    // 引信快到了：一闪一闪
    if (g.fuse - g.t < 0.6 && Math.floor(g.t * 12) % 2 === 0) { ctx.fillStyle = g.id === 'grenade' ? '#ff4030' : '#fff'; ctx.beginPath(); ctx.arc(0, -10, 3, 0, 7); ctx.fill(); }
    ctx.restore();
  }
}
// 闪光：盖在黑暗之上（render/world.js 的 renderOverWorld 调用）
function drawFlashes() {
  for (const f of S.flashes || []) {
    const k = Math.max(0, f.t / 0.35), r = THROW.flashbang.r * (1.2 - k * 0.4);
    const g = ctx.createRadialGradient(f.x, f.y, 0, f.x, f.y, r);
    g.addColorStop(0, `rgba(255,255,240,${0.95 * k})`); g.addColorStop(1, 'rgba(255,255,240,0)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(f.x, f.y, r, 0, 7); ctx.fill();
  }
}
