'use strict';
// 房间切换（房间名横幅）并把事件交给触发器引擎；具体事件写在 config/triggers.js

function updateRoomsAndEvents(dt) {
  const r = curRoom();
  if (r >= 0 && r !== P.room) {
    P.room = r; const R = ROOMS[r];
    if (!S.visited[R.id]) { P.bannerT = 3; P.bannerTxt = R.name; }
    S.visited[R.id] = true;
    fireEvent('enter', { room: R.id, safe: !!R.safe });
  }
  updateTriggers();
}

// ---------------------------------------------------------------- 直升机坠毁演出（约 6.5 秒）
// 0.0  交出控制权，镜头拉向处刑者和直升机之间
// 0.3  它弯腰从地上掀起一块大石头（泥土飞溅，地上留下一个坑），0.3–1.0 慢慢举过头顶
// 1.0  后仰蓄力 → 1.35 甩出，石头打着旋飞 0.55 秒
// 1.9  命中尾梁：火花、尾桨断飞、机身开始打转冒黑烟
// 1.9–4.2  失控螺旋下坠，越转越快
// 4.2  砸地：白闪、爆炸、火球、旋翼碎片四散 → 残骸（heliDown）
// 6.5  镜头回到林岚，交还控制权
const CRASH = { rip: 0.3, wind: 1.0, throw: 1.35, hit: 1.9, ground: 4.2, end: 6.5 };
const easeIn = k => k * k, easeOut = k => 1 - (1 - k) * (1 - k);

function startHeliCrash() {
  if (S.crash || S.leap || S.cine > 0 || S.flags.heliDown || !PAD) return;
  const b = S.enemies.find(e => e.t === 'boss' && !e.dead);
  if (b && b.knockdownT > 0) { b.knockdownT = 0; b.stagAcc = 0; b.midStagDone = false; b.state = 'idle'; b.alert = true; }   // 跪着的时候：它就地站起来再掀石头（不会凭空换位置）
  const bx = b ? b.x : PAD.x - 190, by = b ? b.y : PAD.y + 170;
  const alt0 = typeof heliAlt === 'function' ? Math.max(0.35, heliAlt()) : 0.5;
  delete S.flags.heli;
  S.crash = { t: 0, bx, by, alt0, ang: 0, w: 0, hx: PAD.x, hy: PAD.y, alt: alt0, debris: [], hit: false, ground: false, ripped: false, thrown: false };
  msg('那个东西停了下来，抬头盯着直升机。', 3);
}

// 石头的飞行位置（世界坐标 + 抛物线高度），t 为演出时间
function crashRockPos(c) {
  const k = clamp((c.t - CRASH.throw) / (CRASH.hit - CRASH.throw), 0, 1);
  const tx = PAD.x, ty = PAD.y + 60 * (1 + c.alt0 * 0.55) - c.alt0 * 30;   // 尾梁位置
  return { x: lerp(c.bx, tx, k), y: lerp(c.by, ty, k), h: Math.sin(k * Math.PI) * 60 + k * c.alt0 * 40, rot: k * 14, k };
}

function updateHeliCrash(dt) {
  const c = S.crash; if (!c) return;
  const t0 = c.t; c.t += dt; const t = c.t;
  const pass = x => t0 < x && t >= x;
  const boss = S.enemies.find(e => e.t === 'boss' && !e.dead);
  if (boss) { boss.fa = boss.a = Math.atan2(c.hy - boss.y, c.hx - boss.x); boss.ph = (boss.ph || 0) + dt * (t < CRASH.throw ? 0.6 : 0.2); }

  if (pass(CRASH.rip)) {
    c.ripped = true; sfxAt('bash', c.bx, c.by, 1, 1500); sfxAt('bash', c.bx, c.by, 0.6, 1500); shake = Math.max(shake, 6);
    const a = Math.atan2(PAD.y - c.by, PAD.x - c.bx), rx = c.bx + Math.cos(a) * 30, ry = c.by + Math.sin(a) * 30;
    decals.push({ x: rx, y: ry, r: 16, rot: 0, a: 0.55, dirt: true });                  // 石头原来的坑
    for (let i = 0; i < 26; i++) { const d = rand(6.283), v = rand(60, 200); parts.push({ x: rx, y: ry, vx: Math.cos(d) * v, vy: Math.sin(d) * v, life: rand(0.4, 0.9), max: 0.9, s: rand(2, 4), c: Math.random() < .5 ? '#4a3a26' : '#6a5a3e', t: 'dust' }); }
    msg('它弯下腰，从草地里硬生生掀起一块大石头——', 3);
  }
  if (pass(CRASH.throw)) { c.thrown = true; cryAt('executioner', 'roar', c.bx, c.by, 0.9, 3000, 0.5); shake = Math.max(shake, 7); }
  if (c.thrown && !c.hit && Math.random() < 0.8) {            // 石头拖出的土屑
    const h = crashRockPos(c);
    parts.push({ x: h.x, y: h.y - h.h, vx: rand(-20, 20), vy: rand(-20, 20), life: 0.4, max: 0.4, s: 2, c: '#777', t: 'dust' });
  }
  if (pass(CRASH.hit)) {
    c.hit = true; sfx('bash', 1); sfx('explode', 0.45); shake = Math.max(shake, 11);
    const tx = PAD.x, ty = PAD.y + 50;
    for (let i = 0; i < 36; i++) { const a = rand(6.283), v = rand(80, 320); parts.push({ x: tx, y: ty - c.alt0 * 30, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: rand(0.3, 0.8), max: 0.8, s: rand(1.5, 3), c: Math.random() < .5 ? '#ffd070' : '#fff2b0', t: 'spark' }); }
    c.debris.push({ x: tx, y: ty, vx: 190, vy: 120, rot: 0, vr: 18, w: 28, h: 4, life: 2.2, c: '#9aa4ae' });   // 尾桨
    for (let i = 0; i < 7; i++) { const d = rand(6.283), v = rand(100, 260); c.debris.push({ x: tx, y: ty, vx: Math.cos(d) * v, vy: Math.sin(d) * v + 80, rot: rand(6.28), vr: rand(-12, 12), w: rand(6, 13), h: rand(5, 10), life: rand(1.2, 2), c: i % 2 ? '#6b665e' : '#4f4a44' }); }   // 石头撞碎
    msg('【无线电】被什么东西砸中了！尾桨没了——失控了——Mayday！', 4);
  }
  if (c.hit && !c.ground) {                                   // 失控螺旋
    const k = clamp((t - CRASH.hit) / (CRASH.ground - CRASH.hit), 0, 1);
    c.w = lerp(3, 16, k); c.ang += c.w * dt;
    const cx = PAD.x + 20, cy = PAD.y + 10, r = 70 * (1 - k);
    c.hx = cx + Math.cos(k * 7) * r; c.hy = cy + Math.sin(k * 7) * r * 0.7;
    c.alt = (c.alt0 + 0.15 * Math.sin(Math.min(k * 3, Math.PI))) * (1 - easeIn(k));
    const tail = { x: c.hx - Math.sin(c.ang) * 60 * (1 + c.alt * .55), y: c.hy + Math.cos(c.ang) * 60 * (1 + c.alt * .55) - c.alt * 30 };
    for (let i = 0; i < 2; i++) parts.push({ x: tail.x + rand(-6, 6), y: tail.y + rand(-6, 6), vx: rand(-25, 25), vy: rand(-40, -5), life: rand(0.8, 1.5), max: 1.5, s: rand(5, 9), c: Math.random() < .3 ? '#ff8a30' : '#1a1a1a', t: 'smoke' });
    if (Math.floor(t0 * 3) !== Math.floor(t * 3)) sfx('bash', 0.25);
  }
  if (pass(CRASH.ground)) {
    c.ground = true; c.alt = 0; S.crashFlash = 1;
    runActions([{ flag: 'heliDown' }, { banner: '—— 坠 毁 ——' }], 'heliCrash');
    sfx('explode', 1.2); shake = Math.max(shake, 20);
    const gx = PAD.x + 20, gy = PAD.y + 10;
    for (let i = 0; i < 70; i++) { const a = rand(6.283), v = rand(60, 360); parts.push({ x: gx, y: gy, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: rand(0.5, 1.3), max: 1.3, s: rand(3, 8), c: ['#ffcf60', '#ff8a30', '#ff5020', '#2a2220'][i % 4], t: 'fire' }); }
    for (let i = 0; i < 2; i++) { const a = rand(6.283); c.debris.push({ x: gx, y: gy, vx: Math.cos(a) * 320, vy: Math.sin(a) * 320, rot: rand(6.28), vr: rand(-20, 20), w: 110, h: 6, life: 1.6, c: '#8d969f' }); }   // 断掉的旋翼
    for (let i = 0; i < 10; i++) { const a = rand(6.283), v = rand(120, 300); c.debris.push({ x: gx, y: gy, vx: Math.cos(a) * v, vy: Math.sin(a) * v, rot: rand(6.28), vr: rand(-15, 15), w: rand(6, 14), h: rand(4, 9), life: rand(1, 2), c: '#2b3138' }); }
    const d = dist(S.p.x, S.p.y, gx, gy);                      // 离得太近会被气浪掀开（不扣血）
    if (d < 140) { const a = Math.atan2(S.p.y - gy, S.p.x - gx); moveEnt(S.p, Math.cos(a) * (140 - d), Math.sin(a) * (140 - d)); }
  }
  for (const q of c.debris) { q.life -= dt; q.x += q.vx * dt; q.y += q.vy * dt; q.vx *= Math.pow(0.25, dt); q.vy *= Math.pow(0.25, dt); q.rot += q.vr * dt; q.vr *= Math.pow(0.4, dt); }
  c.debris = c.debris.filter(q => q.life > 0);
  if (S.crashFlash) S.crashFlash = Math.max(0, S.crashFlash - dt * 1.6);

  // 镜头：前半段看处刑者和直升机，砸地后慢慢回到林岚
  // 举石头时镜头偏向处刑者（看清它弯腰掀石头），甩出后跟着石头移向直升机
  const wBoss = t < CRASH.throw ? 0.75 : lerp(0.75, 0.3, clamp((t - CRASH.throw) / (CRASH.hit - CRASH.throw), 0, 1));
  const focus = t < CRASH.hit ? { x: lerp(PAD.x, c.bx, wBoss), y: lerp(PAD.y, c.by, wBoss) } : { x: c.hx, y: c.hy };
  const back = clamp((t - CRASH.ground - 0.9) / 1.2, 0, 1);
  const fx = lerp(focus.x, S.p.x, back), fy = lerp(focus.y, S.p.y, back);
  cam.x = lerp(cam.x, fx - W / 2, Math.min(1, dt * 3)); cam.y = lerp(cam.y, fy - H / 2, Math.min(1, dt * 3));

  if (t >= CRASH.end) { S.crash = null; S.crashFlash = 0; }
}

// ---------------------------------------------------------------- 处刑者从二楼栏杆跳下（计划 3.5：放入最后一枚徽章时）
// 0.0  交出控制权、黑边；头顶木头断裂，木屑和灰往下掉，落点出现影子
// 1.0  它从画面外砸下来 → 1.35 落地：震屏、尘土一圈、地板裂开；离得太近的林岚被气浪推开（不扣血）
// 1.35–2.6  它慢慢直起身，1.8 秒一声怒吼，红眼盯着你
// 2.6  交还控制权，它进入追击 —— 酒窖的门就在身后，跑
const LEAP = { drop: 1.0, land: 1.35, roar: 1.8, end: 2.6 };
function startExecLeap(tx, ty) {
  if (S.leap || S.crash || S.cine > 0) return;   // 已经在别的演出里（比如玩家抢先坐上了升降梯）就不跳了
  const old = S.enemies.find(e => e.t === 'boss' && !e.dead);
  if (old && execSeen(old)) {   // 它就在你眼前（比如刚被你打倒在主厅里）：不能再从二楼跳下来一只
    if (execDown(old)) { msg('石板挪开的巨响在大厅里回荡。那个东西还跪在地上 —— 趁现在！', 3.5); return; }
    exChase(old); cryAt('executioner', 'roar', old.x, old.y, 1, 3000, 0.6); shake = Math.max(shake, 10);
    msg('它听见了石板挪开的声音，转过身冲了过来！', 3); return;
  }
  S.enemies = S.enemies.filter(e => e !== old);      // 不在眼前：不管原来在哪，都从楼上下来
  S.leap = { t: 0, x: (tx + .5) * T, y: (ty + .5) * T };
  sfxAt('creak', S.leap.x, S.leap.y, 1.4, 1500); sfxAt('bash', S.leap.x, S.leap.y, 0.6, 1500);
  msg('头顶的栏杆发出一声断裂的巨响——', 2.5);
}
function updateExecLeap(dt) {
  const L = S.leap; if (!L) return;
  const t0 = L.t; L.t += dt; const t = L.t, pass = x => t0 < x && t >= x;
  if (t < LEAP.land && Math.random() < 0.7) parts.push({ x: L.x + rand(-40, 40), y: L.y + rand(-60, 10), vx: rand(-10, 10), vy: rand(30, 80), life: rand(0.4, 0.9), max: 0.9, s: rand(1.5, 3.5), c: Math.random() < .5 ? '#6a5a44' : '#8a7a60', t: 'dust' });
  if (pass(LEAP.land)) {
    spawnExecutioner(L.x / T - .5, L.y / T - .5, true);
    const b = S.enemies.find(e => e.t === 'boss' && !e.dead);
    if (b) { b.fa = b.a = Math.atan2(S.p.y - b.y, S.p.x - b.x); b.state = 'wait'; }
    sfx('bash', 1.2); sfx('explode', 0.55); shake = Math.max(shake, 24);
    decals.push({ x: L.x, y: L.y + 4, r: 26, rot: 0, a: 0.6, dirt: true });
    for (let i = 0; i < 44; i++) { const a = rand(6.283), v = rand(120, 300); parts.push({ x: L.x, y: L.y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: rand(0.4, 0.9), max: 0.9, s: rand(2, 5), c: Math.random() < .5 ? '#6a5a44' : '#9a8a70', t: 'dust' }); }
    const d = dist(S.p.x, S.p.y, L.x, L.y);
    if (d < 120) { const a = Math.atan2(S.p.y - L.y, S.p.x - L.x); moveEnt(S.p, Math.cos(a) * (120 - d), Math.sin(a) * (120 - d)); }
  }
  const b = S.enemies.find(e => e.t === 'boss' && !e.dead);
  if (b && t >= LEAP.land) { b.fa = b.a = Math.atan2(S.p.y - b.y, S.p.x - b.x); b.ph = (b.ph || 0) + dt * 0.3; }
  if (pass(LEAP.roar) && b) { cryAt('executioner', 'roar', b.x, b.y, 1, 3000, 0.6); shake = Math.max(shake, 12); msg('「处刑者」从二楼跳了下来！', 3); }
  // 镜头：看落点和林岚之间
  const fx = lerp(L.x, S.p.x, 0.4), fy = lerp(L.y, S.p.y, 0.4);
  cam.x = lerp(cam.x, fx - W / 2, Math.min(1, dt * 4)); cam.y = lerp(cam.y, fy - H / 2, Math.min(1, dt * 4));
  if (t >= LEAP.end) {
    S.leap = null;
    if (b) { b.state = 'idle'; b.alert = true; b.atkT = 0; b.lastSeen = { x: S.p.x, y: S.p.y }; b.stag = 0.5; }   // idle + alert：下一帧由状态机转入追击；stag 给玩家半秒起跑
  }
}

// ---------------------------------------------------------------- 地图 2 结尾：货运列车开走
// 0–0.7 秒林岚跳上车门；1.2 秒起列车加速向东，钻进隧道（站台东墙）；2.6 秒处刑者撞开闸门冲上站台，扑了个空
const TRAIN_ANIM = { go: 1.2, acc: 170, bossAt: 2.6 };
// opt（地图 3 结局用）：tunnel 隧道口所在的东墙 x（格，缺省 64）、clip 站台西边界（格，缺省 24）、noBoss 不让处刑者追出来
function startTrainDepart(r, opt = {}) {
  const [x, y, w, h] = r;
  S.train = { t: 0, x: x * T, y: y * T, w: w * T, h: h * T, door: { x: S.p.x, y: S.p.y }, bossIn: false,
    tunnel: opt.tunnel ?? 64, clip: opt.clip ?? 24, noBoss: !!opt.noBoss, north: S.p.y < y * T };
  sfx('metal', 1); shake = Math.max(shake, 4);
}
const trainOffset = t => t < TRAIN_ANIM.go ? 0 : 0.5 * TRAIN_ANIM.acc * (t - TRAIN_ANIM.go) ** 2;
function updateTrainDepart(dt) {
  const R = S.train; if (!R) return;
  const was = R.t; R.t += dt;
  const p = S.p;
  // 林岚跳上车：朝车门走两步，然后人就在车上了（不再绘制）
  if (R.t < 0.7) { p.y += ((R.north ? R.y + 6 : R.y + R.h - 6) - p.y) * Math.min(1, dt * 6); p.a = R.north ? Math.PI / 2 : -Math.PI / 2; }
  // 列车起步 / 加速的声音
  if (was < TRAIN_ANIM.go && R.t >= TRAIN_ANIM.go) { sfx('bash', 0.8); sfx('sizzle', 0.9); shake = Math.max(shake, 6); }
  const off = trainOffset(R.t), sp = R.t > TRAIN_ANIM.go ? TRAIN_ANIM.acc * (R.t - TRAIN_ANIM.go) : 0;
  if (sp > 0) { R.clack = (R.clack || 0) - dt * sp / 90; if (R.clack <= 0) { R.clack = 1; sfx('step', 1.6); } }
  // 车轮火花：沿着车底往后飞
  if (sp > 60 && Math.random() < 0.8) {
    const xs = R.x + off + Math.random() * R.w, ys = R.y + R.h - 4;
    if (xs < R.tunnel * T) parts.push({ x: xs, y: ys, vx: -sp * 0.4 - rand(40), vy: rand(-40, 10), life: rand(0.2, 0.45), max: 0.45, s: rand(1.5, 3), c: Math.random() < .5 ? '#ffd070' : '#ff9a30' });
  }
  // 镜头：人在车上 —— 跟着车门走一小段，然后停在站台上看着列车远去
  p.x = R.door.x + Math.min(off, 5 * T);
  // 处刑者：撞开闸门冲上站台，追着车跑，追不上
  if (!R.noBoss && was < TRAIN_ANIM.bossAt && R.t >= TRAIN_ANIM.bossAt) {
    let b = activeExecutioner();
    if (b && execSeen(b) && execDown(b)) R.bossDown = true;   // 你把它打倒 / 冻住了才上的车：它就躺在原地看着车开走
    else if (b && execSeen(b)) { b.state = 'chase'; R.bossIn = true; cryAt('executioner', 'roar', b.x, b.y, 1, 5000, 0.6); shake = Math.max(shake, 10); }   // 它就在站台上：从原地追出来
    else {   // 不在眼前（或者还没登场）：撞开闸门冲上站台
      if (!b) { spawnExecutioner(48, 12, true); b = activeExecutioner(); }
      if (b) { b.x = 48.5 * T; b.y = 12 * T; b.frozenT = 0; b.knockdownT = 0; b.state = 'chase'; R.bossIn = true; }
      sfxAt('bash', 48.5 * T, 13 * T, 1.4, 5000, 0.6); cryAt('executioner', 'roar', 48.5 * T, 12 * T, 1, 5000, 0.6); shake = Math.max(shake, 14);
    }
  }
  if (R.bossDown && R.t > 6.2 && !R.roar2) {   // 倒在地上冲着远去的列车吼一声
    R.roar2 = true; const d = activeExecutioner(); if (d) cryAt('executioner', 'pain', d.x, d.y, 1, 5000, 0.5);
  }
  const b = R.bossIn && activeExecutioner();
  if (b) {
    const tx = Math.min(R.x + off + R.w - 30, 62 * T), ty = R.y + R.h + 26;
    const a = Math.atan2(ty - b.y, tx - b.x), d = Math.hypot(tx - b.x, ty - b.y);
    if (d > 8) { const v = Math.min(d, 230 * dt); b.x += Math.cos(a) * v; b.y += Math.sin(a) * v; b.ph = (b.ph || 0) + dt * 1.6; }
    b.fa = b.a = Math.atan2(R.y + R.h / 2 - b.y, Math.min(R.x + off + R.w, 64 * T) - b.x);
    if (R.t > 6.2 && !R.roar2) { R.roar2 = true; cryAt('executioner', 'roar', b.x, b.y, 1, 5000, 0.5); shake = Math.max(shake, 8); }
  }
}
// 渲染（在地面和道具之后、人物之前）：先把站台上静态的那列车盖掉，再画移动中的列车，裁在站台里（东墙就是隧道口）
function drawTrainDepart() {
  const R = S.train; if (!R) return;
  const off = trainOffset(R.t);
  ctx.save();
  ctx.fillStyle = '#16181a'; ctx.fillRect(R.x - 4, R.y, R.w + 8, R.h);   // 空出来的轨道
  ctx.fillStyle = '#4a4540'; for (let x = R.x; x < R.x + R.w; x += 22) ctx.fillRect(x, R.y + 8, 8, R.h - 16);   // 枕木
  ctx.fillStyle = '#8a8a88'; ctx.fillRect(R.x - 4, R.y + 18, R.w + 8, 3); ctx.fillRect(R.x - 4, R.y + R.h - 21, R.w + 8, 3);   // 钢轨
  ctx.beginPath(); ctx.rect(R.clip * T, R.y - T, (R.tunnel - R.clip) * T, R.h + 2 * T); ctx.clip();
  const px = R.x + off, py = R.y, pw = R.w, ph = R.h, n = Math.max(1, Math.round(pw / (T * 6)));
  for (let k = 0; k < n; k++) {
    const x0 = px + k * pw / n + 4, w0 = pw / n - 8;
    ctx.fillStyle = '#3a3f44'; ctx.fillRect(x0, py + 6, w0, ph - 12);
    ctx.fillStyle = '#23272b'; for (let j = 12; j < w0 - 8; j += 16) ctx.fillRect(x0 + j, py + 10, 3, ph - 20);
    ctx.fillStyle = '#8a6a2a'; ctx.fillRect(x0, py + ph / 2 - 3, w0, 6);
    if (k < n - 1) { ctx.fillStyle = '#222'; ctx.fillRect(x0 + w0, py + ph / 2 - 4, 8, 8); }   // 车钩
  }
  // 最后一节车厢：开着的车门（林岚就在里面）+ 红色尾灯
  const dx = R.door.x + off;
  const dy = R.north ? py + 6 : py + ph - 26;
  ctx.fillStyle = '#0c0c0a'; ctx.fillRect(dx - 16, dy, 32, 20);
  ctx.fillStyle = 'rgba(255,220,150,0.35)'; ctx.fillRect(dx - 12, dy + 2, 24, 16);
  const blink = 0.6 + 0.4 * Math.sin(R.t * 10);
  ctx.fillStyle = `rgba(255,40,30,${blink})`; ctx.beginPath(); ctx.arc(px + 6, py + 16, 5, 0, 7); ctx.arc(px + 6, py + ph - 16, 5, 0, 7); ctx.fill();
  const g = ctx.createRadialGradient(px, py + ph / 2, 0, px, py + ph / 2, 90); g.addColorStop(0, `rgba(255,30,20,${0.35 * blink})`); g.addColorStop(1, 'rgba(255,30,20,0)');
  ctx.fillStyle = g; ctx.fillRect(px - 90, py - 50, 180, ph + 100);
  ctx.restore();
  // 隧道口：东墙上一块黑洞
  ctx.fillStyle = '#050505'; ctx.fillRect(R.tunnel * T - 6, R.y - 6, 12, R.h + 12);
}
