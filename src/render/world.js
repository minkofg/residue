'use strict';
// 场景合成

// ---------------------------------------------------------------- 绘制：场景
function renderWorld() {
  const p = S.p;
  const sx = (Math.random() - .5) * shake, sy = (Math.random() - .5) * shake;
  ctx.save(); ctx.translate(-Math.round(cam.x + sx), -Math.round(cam.y + sy));
  // 地图
  const x0 = Math.max(0, Math.floor(cam.x - 20)), y0 = Math.max(0, Math.floor(cam.y - 20));
  const w = Math.min(mapC.width - x0, W + 40), h = Math.min(mapC.height - y0, H + 40);
  if (w > 0 && h > 0) ctx.drawImage(mapC, x0, y0, w, h, x0, y0, w, h);
  drawDoorDamage();
  // 血迹
  for (const d of decals) {
    if (d.x < cam.x - 60 || d.x > cam.x + W + 60 || d.y < cam.y - 60 || d.y > cam.y + H + 60) continue;
    ctx.fillStyle = d.dirt ? `rgba(38,28,16,${d.a})` : `rgba(80,4,4,${d.a})`;   // dirt：石头被掀起后留下的坑 ctx.beginPath(); ctx.arc(d.x, d.y, d.r, 0, 7); ctx.fill();
    if (d.r > 8) { ctx.beginPath(); ctx.arc(d.x + Math.cos(d.rot) * d.r * .8, d.y + Math.sin(d.rot) * d.r * .8, d.r * .5, 0, 7); ctx.arc(d.x - Math.cos(d.rot + 1) * d.r * .7, d.y - Math.sin(d.rot + 1) * d.r * .7, d.r * .4, 0, 7); ctx.fill(); }
  }
  if (S.flags.heli && PAD) drawHeli();
  if (S.flags.heliDown && PAD) drawWreck();
  if (S.pod) drawPod();
  // 坠毁演出里还没砸地的直升机：地面阴影要在怪物下面
  if (S.crash && !S.crash.ground) drawCrashShadow();
  if (S.leap) drawLeapGround();
  // 第 4.6 秒那一拍：草坪上那个东西仰着头看你。给它一圈红光，别让这句话只是文字
  if (heliBoarding() && S.cineT > 4.4) {
    const b = S.enemies.find(e => e.t === 'boss' && !e.dead);
    if (b) {
      const a = clamp((S.cineT - 4.4) / 0.8, 0, 1) * (0.55 + 0.25 * Math.sin(S.time * 5));
      const g = ctx.createRadialGradient(b.x, b.y, 4, b.x, b.y, 70);
      g.addColorStop(0, `rgba(190,20,20,${a * 0.8})`); g.addColorStop(1, 'rgba(190,20,20,0)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(b.x, b.y, 70, 0, 7); ctx.fill();   // 只画光，转头是 update 的事
    }
  }
  if (S.map === 'map2' && typeof LN2 !== 'undefined') {   // 冷冻库地面上的液氮喷口区：黄黑警示虚线 + 一排喷口
    const z = LN2.zone, x = z.x0 * T, y = z.y0 * T, w = (z.x1 - z.x0 + 1) * T, h = (z.y1 - z.y0 + 1) * T;
    ctx.save(); ctx.setLineDash([10, 8]); ctx.strokeStyle = 'rgba(220,180,40,0.45)'; ctx.lineWidth = 3; ctx.strokeRect(x + 4, y + 4, w - 8, h - 8); ctx.setLineDash([]);
    ctx.fillStyle = 'rgba(30,40,50,0.7)'; for (let i = 0; i < 5; i++) { ctx.beginPath(); ctx.arc(x + w * (i + 0.5) / 5, y + h - 14, 5, 0, 7); ctx.fill(); ctx.beginPath(); ctx.arc(x + w * (i + 0.5) / 5, y + 14, 5, 0, 7); ctx.fill(); }
    ctx.restore();
  }
  if (S.train) drawTrainDepart();
  for (const it of S.items) if (!(S.train && (it.t === 'traindoor' || it.t === 'escapedoor'))) drawItem(it);
  drawHazards();
  for (const e of S.enemies) if (e.dead) drawEnemy(e);
  for (const e of S.enemies) if (!e.dead) drawEnemy(e);
  // 结局：1.15 秒后林岚已经进舱，人就不该还站在草坪上
  const boarded = S.cine > 0 && (S.train ? S.train.t > 0.7 : heliBoarding() && S.cineT > 1.15);
  if (!boarded) drawPlayer();
  if (S.flags.heli && PAD && boarded) drawHeli();   // 登机后直升机盖在最上层
  // 粒子
  for (const q of parts) {
    ctx.globalAlpha = clamp(q.life / q.max, 0, 1) * (q.t === 'shell' ? 1 : 0.9);
    ctx.fillStyle = q.c; if (q.t === 'bubble') { ctx.beginPath(); ctx.arc(q.x, q.y, q.s, 0, 7); ctx.fill(); } else ctx.fillRect(q.x - q.s / 2, q.y - q.s / 2, q.s, q.s * (q.t === 'shell' ? 2 : 1));
  }
  ctx.globalAlpha = 1;
  for (const t of tracers) { ctx.strokeStyle = `rgba(255,230,160,${t.life / 0.06 * 0.7})`; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(t.x1, t.y1); ctx.lineTo(t.x2, t.y2); ctx.stroke(); }
  ctx.restore();
}
function renderOverWorld() {
  // 暗处之上的元素：物品闪光、激光、浮动文字
  const p = S.p;
  ctx.save(); ctx.translate(-Math.round(cam.x), -Math.round(cam.y));
  for (const it of S.items) {
    if (it.taken || isProp(it.t)) continue;  // 机关道具不闪光：闪光是「这儿有战利品」的语言
    const d = dist(p.x, p.y, it.x, it.y); if (d > 320) continue;
    if (!losClear(p.x, p.y, it.x, it.y)) continue;
    const tw = 0.5 + 0.5 * Math.sin(S.time * 4 + it.id), s = 3 + tw * 4;
    ctx.globalAlpha = (0.35 + tw * 0.5) * clamp(1.3 - d / 320, 0, 1);
    ctx.fillStyle = it.t === 'key' ? '#ffe9a0' : '#fff';
    ctx.beginPath(); ctx.moveTo(it.x, it.y - s * 2); ctx.lineTo(it.x + s * .4, it.y - s * .4); ctx.lineTo(it.x + s * 2, it.y); ctx.lineTo(it.x + s * .4, it.y + s * .4); ctx.lineTo(it.x, it.y + s * 2); ctx.lineTo(it.x - s * .4, it.y + s * .4); ctx.lineTo(it.x - s * 2, it.y); ctx.lineTo(it.x - s * .4, it.y - s * .4); ctx.fill();
  }
  ctx.globalAlpha = 1;
  const aiming = isAimKey() && P.reloadT <= 0 && mode === 'play';
  if (aiming) {
    const ox = p.x + Math.cos(p.a) * 28, oy = p.y + Math.sin(p.a) * 28;
    let d = ray(ox, oy, p.a, 700, opaqueT);
    const dx = Math.cos(p.a), dy = Math.sin(p.a);
    for (const e of S.enemies) { if (e.dead) continue; const fx = e.x - ox, fy = e.y - oy, t = fx * dx + fy * dy; if (t < 0 || t > d) continue; const qx = fx - dx * t, qy = fy - dy * t; if (qx * qx + qy * qy < e.r * e.r) d = t; }
    ctx.strokeStyle = `rgba(255,30,30,${0.25 + P.focus * 0.35})`; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(ox, oy); ctx.lineTo(ox + dx * d, oy + dy * d); ctx.stroke();
    ctx.fillStyle = '#ff3030'; ctx.beginPath(); ctx.arc(ox + dx * d, oy + dy * d, 2.5, 0, 7); ctx.fill();
  }
  // 猎手处决前摇的红光要盖在黑暗之上：1 秒预警必须看得见（计划第 11 节第 4 条）
  for (const e of S.enemies) {
    if (e.dead || e.t !== 'hunter' || e.state !== 'execWind' || dist(p.x, p.y, e.x, e.y) > 700) continue;
    const k = 1 - Math.max(0, e.atkT) / HUNTER.execTell, r = 40 + k * 22 + Math.sin(S.time * 30) * 3;
    const g = ctx.createRadialGradient(e.x, e.y, 2, e.x, e.y, r);
    g.addColorStop(0, `rgba(255,60,40,${0.55 + k * 0.35})`); g.addColorStop(0.5, `rgba(255,20,10,${0.25 + k * 0.25})`); g.addColorStop(1, 'rgba(255,0,0,0)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(e.x, e.y, r, 0, 7); ctx.fill();
  }
  drawFlashes();
  drawBerserkTells();
  drawLazTells();
  if (S.crash) drawCrashAir();
  if (S.leap) drawLeapAir();
  ctx.font = 'bold 16px sans-serif'; ctx.textAlign = 'center';
  for (const f of floats) { ctx.globalAlpha = clamp(f.life, 0, 1); ctx.fillStyle = f.c; ctx.fillText(f.t, f.x, f.y); }
  ctx.globalAlpha = 1;
  // 交互提示
  if (mode === 'play' && !(S.cine > 0)) {
    const f = findInteract();
    if (f) {
      let t = '';
      if (f.kind === 'door') t = f.key && S.p.keys[f.key] ? `[E] 使用${KEYS[f.key].name}` : f.key ? '[E] 调查锁门' : (f.open ? '[E] 关门' : '[E] 开门');
      else if (f.kind === 'exit') t = '[E] ' + (f.ex.label || `前往${LEVELS[f.ex.to].name}`);
      else if (f.it.t === 'typewriter') t = '[E] 使用打字机存档';
      else if (f.it.t === 'file') t = '[E] 阅读文件';
      else if (f.it.t === 'bust') t = `[E] 转动「${BUSTS[f.it.v] ? BUSTS[f.it.v].name : '半身像'}」`;
      else if (f.it.t === 'plate') t = '[E] 踩下地砖机关';
      else if (f.it.t === 'altar') t = '[E] 调查雕像底座';
      else if (f.it.t === 'traindoor') t = S.flags.trainGo ? '[E] 上车' : S.flags.trainReady ? `车门锁着（预热 ${Math.ceil(S.countdown ? S.countdown.left : 0)} 秒）` : '[E] 查看车门';
      else if (f.it.t === 'ln2lever') t = !S.flags.valvesSolved ? '[E] 查看紧急排放拉杆' : (S.ln2Ready || 0) > S.time ? `加压中……${Math.ceil(S.ln2Ready - S.time)} 秒` : '[E] 拉下液氮排放拉杆';
      else if (f.it.t === 'escapedoor') t = S.flags.lazarusDead ? '[E] 跳上列车！' : '车门锁着（列车在预热）';
      else if (f.it.t === 'trainConsole') t = S.flags.trainStarted ? '列车控制台（已启动）' : '[E] 拉下闸门，启动列车';
      else if (f.it.t === 'ladle') t = S.flags.execMutated ? '钢水包（空）' : S.pour ? '钢水正在倒下……' : (S.pourReady || 0) > S.time ? `钢水包加热中……${Math.ceil(S.pourReady - S.time)} 秒` : '[E] 拉下钢水闸（吊桥上方的钢水包）';
      else if (f.it.t === 'gunlocker') t = S.flags.magnumTaken ? '枪械柜（空）' : S.flags.valvesSolved ? '[E] 打开枪械柜' : '[E] 查看枪械柜（锁着）';
      else if (f.it.t === 'growlight') t = `[E] ${f.it.on ? '关掉' : '打开'} ${f.it.v} 床补光灯`;
      else if (f.it.t === 'glcase') t = S.flags.glTaken ? '武器箱（空）' : S.flags.growSolved ? '[E] 拿出榴弹发射器' : '[E] 查看武器箱（电子锁）';
      else if (f.it.t === 'valve') t = `[E] 拧 ${f.it.v} 号阀门（现在 ${valveP(f.it)} 档）`;
      else if (f.it.t === 'fusebox') t = '[E] 调查配电箱';
      else if (f.it.t === 'console') t = '[E] 使用控制台';
      else if (f.it.t === 'switch') t = S.flags[f.it.v] ? '[E] 关灯' : '[E] 开灯';
      else if (f.it.t === 'lift') t = S.flags.medalsPlaced ? '[E] 乘升降梯下去' : '[E] 调查升降梯';
      else if (f.it.t === 'safe') t = f.it.open ? '[E] 查看保险柜' : '[E] 转动保险柜拨盘';
      else t = '[E] 拾取 ' + pickupName(f.it);
      ctx.font = '14px sans-serif'; const tw = ctx.measureText(t).width + 16;
      ctx.fillStyle = 'rgba(0,0,0,0.7)'; ctx.fillRect(p.x - tw / 2, p.y - 52, tw, 24);
      ctx.strokeStyle = 'rgba(200,180,120,0.6)'; ctx.strokeRect(p.x - tw / 2 + .5, p.y - 51.5, tw - 1, 23);
      ctx.fillStyle = '#eadcb0'; ctx.fillText(t, p.x, p.y - 35);
    }
  }
  ctx.restore();
  if (S.crash || S.crashFlash) drawCrashScreen();
  if (S.leap) drawLeapScreen();
}

// ---------------------------------------------------------------- 直升机
// 俯视角里「高度」没法直接画，用三个量一起骗眼睛：
//   · 机身越高画得越大（离镜头近）
//   · 地面阴影反过来越高越小、越淡，而且和机身错开更远
//   · 旋翼转速和下洗气流的范围跟着高度变
// heliAlt()：1 = 还在高空，0 = 已经落地。
function heliAlt() {
  const t = S.heliT || 0;
  if (heliBoarding() && S.cineT > 2.2) return clamp((S.cineT - 2.2) / 3.2, 0, 1) * 1.6;  // 起飞：越升越高
  return clamp(1 - t / 3.5, 0, 1);                                                    // 降落：3.5 秒落地
}
// o：坠毁演出时传入 { x, y, alt, ang, noTail }；平时不传，按降落时间轴画在停机坪上
function drawHeli(o) {
  const alt = o ? o.alt : heliAlt();
  const sc = 1 + alt * 0.55;                 // 越高越大
  const gx = o ? o.x : PAD.x, gy = o ? o.y : PAD.y;
  // 地面阴影：高度越大越小越淡，位置往下偏（太阳在上方）
  ctx.save();
  ctx.globalAlpha = 0.5 * (1 - alt * 0.55);
  ctx.fillStyle = '#000';
  ctx.beginPath(); ctx.ellipse(gx + alt * 26, gy + 34 + alt * 40, 30 * (1 - alt * 0.35), 16 * (1 - alt * 0.35), 0, 0, 7); ctx.fill();
  ctx.restore();

  // 被吹平的草：落地时最明显
  if (alt < 0.6) {
    ctx.save(); ctx.globalAlpha = (0.6 - alt) * 0.5;
    ctx.strokeStyle = '#6e7a4a'; ctx.lineWidth = 2;
    for (let i = 0; i < 12; i++) { const a = i / 12 * 6.283 + S.time * 1.5; ctx.beginPath(); ctx.arc(gx, gy, 66 + Math.sin(S.time * 6 + i) * 5, a, a + 0.3); ctx.stroke(); }
    ctx.restore();
  }

  ctx.save();
  ctx.translate(gx, gy - alt * 30);
  if (o && o.ang) ctx.rotate(o.ang);
  ctx.scale(sc, sc);

  // 尾梁 + 尾桨（被击中后尾梁只剩半截，尾桨已经飞了）
  ctx.fillStyle = '#2b3138'; ctx.fillRect(-7, 6, 14, o && o.noTail ? 38 : 62);
  if (!(o && o.noTail)) {
    ctx.fillStyle = '#20252b'; ctx.fillRect(-13, 62, 26, 9);
    ctx.save(); ctx.translate(0, 66); ctx.rotate(S.time * 40);
    ctx.strokeStyle = 'rgba(190,200,210,0.55)'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(-14, 0); ctx.lineTo(14, 0); ctx.stroke(); ctx.restore();
  } else { ctx.fillStyle = '#ff9a40'; ctx.beginPath(); ctx.arc(0, 44, 5 + Math.random() * 3, 0, 7); ctx.fill(); }

  // 机身
  ctx.fillStyle = '#39414a'; ctx.beginPath(); ctx.ellipse(0, 0, 25, 40, 0, 0, 7); ctx.fill();
  ctx.fillStyle = '#4a545f'; ctx.beginPath(); ctx.ellipse(0, -8, 20, 28, 0, 0, 7); ctx.fill();
  // 座舱玻璃
  ctx.fillStyle = '#7fa8c8'; ctx.beginPath(); ctx.ellipse(0, -24, 13, 11, 0, 0, 7); ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.22)'; ctx.beginPath(); ctx.ellipse(-4, -27, 6, 4, 0, 0, 7); ctx.fill();
  // 舱门（演出里林岚就是从这边上去的）
  ctx.fillStyle = heliBoarding() && S.cineT > 1.15 ? '#2b3138' : '#141a20';
  ctx.fillRect(18, -6, 8, 20);
  // 起落橇
  ctx.strokeStyle = '#1d2228'; ctx.lineWidth = 3;
  ctx.beginPath(); ctx.moveTo(-26, -14); ctx.lineTo(-26, 22); ctx.moveTo(26, -14); ctx.lineTo(26, 22); ctx.stroke();
  // 航行灯：红左绿右，尾灯白色，一闪一闪
  const blink = (Math.sin(S.time * 7) > 0.2) ? 1 : 0.15;
  ctx.globalAlpha = blink;
  ctx.fillStyle = '#ff4030'; ctx.beginPath(); ctx.arc(-24, 4, 3, 0, 7); ctx.fill();
  ctx.fillStyle = '#40ff60'; ctx.beginPath(); ctx.arc(24, 4, 3, 0, 7); ctx.fill();
  ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(0, 70, 2.5, 0, 7); ctx.fill();
  ctx.globalAlpha = 1;

  // 主旋翼：两片桨叶 + 一圈转起来的盘影
  const spin = S.time * 34;
  ctx.save(); ctx.rotate(spin);
  ctx.fillStyle = 'rgba(220,228,236,0.30)';
  for (const a of [0, Math.PI / 2]) { ctx.save(); ctx.rotate(a); ctx.fillRect(-112, -3.5, 224, 7); ctx.restore(); }
  ctx.restore();
  ctx.strokeStyle = 'rgba(200,215,230,0.14)'; ctx.lineWidth = 3;
  ctx.beginPath(); ctx.arc(0, 0, 110, 0, 7); ctx.stroke();
  ctx.fillStyle = '#20262c'; ctx.beginPath(); ctx.arc(0, 0, 7, 0, 7); ctx.fill();

  ctx.restore();
}

// 坠毁的直升机：歪倒的机身、断掉的旋翼、一直在烧的火
function drawWreck() {
  const gx = PAD.x + 20, gy = PAD.y + 10;
  ctx.save(); ctx.translate(gx, gy); ctx.rotate(0.9);
  ctx.fillStyle = 'rgba(0,0,0,0.55)'; ctx.beginPath(); ctx.ellipse(6, 8, 46, 30, 0, 0, 7); ctx.fill();
  ctx.fillStyle = '#23272c'; ctx.beginPath(); ctx.ellipse(0, 0, 24, 38, 0, 0, 7); ctx.fill();
  ctx.fillStyle = '#16191c'; ctx.fillRect(-6, 20, 12, 40);
  ctx.strokeStyle = '#3a3f45'; ctx.lineWidth = 4;
  ctx.beginPath(); ctx.moveTo(-8, -6); ctx.lineTo(-58, -20); ctx.moveTo(6, 2); ctx.lineTo(40, 34); ctx.stroke();
  ctx.restore();
  // 火：几团闪烁的橙色，加一点往上飘的火星
  for (let i = 0; i < 6; i++) {
    const fx = gx - 20 + hash(i, 3) * 40, fy = gy - 14 + hash(i, 7) * 28, r = 7 + Math.sin(S.time * 9 + i * 2) * 3 + hash(i, 1) * 6;
    ctx.fillStyle = `rgba(255,${120 + (i * 20) % 80},30,${0.55 + Math.sin(S.time * 13 + i) * 0.2})`;
    ctx.beginPath(); ctx.arc(fx, fy, r, 0, 7); ctx.fill();
  }
  if (Math.random() < 0.3) parts.push({ x: gx + rand(-20, 20), y: gy + rand(-10, 10), vx: rand(-10, 10), vy: rand(-70, -30), life: 0.9, max: 0.9, c: '#ffb050', s: 2, t: 'spark' });
}

// ---------------------------------------------------------------- 收容舱与坠毁演出
// 收容舱：落地前是一个越来越大的阴影 + 从高处坠下的舱体；落地后是一个裂开的金属胶囊
function drawPod() {
  const o = S.pod, k = clamp(o.t / 1.3, 0, 1), air = 1 - easeIn(k);
  ctx.save(); ctx.translate(o.x, o.y);
  ctx.globalAlpha = 0.25 + 0.45 * k; ctx.fillStyle = '#000';
  ctx.beginPath(); ctx.ellipse(air * 30, 10 + air * 40, 30 * (0.4 + 0.6 * k), 18 * (0.4 + 0.6 * k), 0, 0, 7); ctx.fill();
  ctx.globalAlpha = 1;
  ctx.translate(0, -air * 260); ctx.scale(1 + air * 0.8, 1 + air * 0.8);
  if (k >= 1) { ctx.strokeStyle = 'rgba(40,30,20,0.6)'; ctx.lineWidth = 3; for (let i = 0; i < 7; i++) { const a = i * 0.9; ctx.beginPath(); ctx.moveTo(Math.cos(a) * 26, Math.sin(a) * 30); ctx.lineTo(Math.cos(a) * 48, Math.sin(a) * 52); ctx.stroke(); } }
  ctx.fillStyle = '#3c434b'; ctx.beginPath(); ctx.ellipse(0, 0, 22, 34, 0, 0, 7); ctx.fill();
  ctx.fillStyle = '#12151a'; ctx.beginPath(); ctx.ellipse(0, 2, 15, 26, 0, 0, 7); ctx.fill();   // 舱内
  if (o.hatch) {                       // 舱门：落地后歪在一边，还没被扯下来
    ctx.save(); if (k >= 1) { ctx.translate(-20, 6); ctx.rotate(-0.5); }
    ctx.fillStyle = '#58616b'; ctx.fillRect(-13, -24, 26, 48); ctx.fillStyle = '#c8a030'; ctx.fillRect(-13, -4, 26, 5);
    ctx.restore();
  }
  ctx.fillStyle = '#c8a030'; ctx.fillRect(-22, -3, 5, 6); ctx.fillRect(17, -3, 5, 6);
  const bl = Math.sin(S.time * 8) > 0 ? 1 : 0.2; ctx.globalAlpha = bl; ctx.fillStyle = '#ff3020'; ctx.beginPath(); ctx.arc(0, -30, 3, 0, 7); ctx.fill();
  ctx.restore();
}

function drawCrashShadow() {
  const c = S.crash, a = c.hit ? c.alt : c.alt0;
  ctx.save(); ctx.globalAlpha = 0.5 * (1 - a * 0.55); ctx.fillStyle = '#000';
  ctx.beginPath(); ctx.ellipse(c.hx + a * 26, c.hy + 34 + a * 40, 30 * (1 - a * 0.35), 16 * (1 - a * 0.35), c.ang, 0, 7); ctx.fill();
  // 石头的影子
  if (c.thrown && !c.hit) { const h = crashRockPos(c); ctx.globalAlpha = 0.4; ctx.beginPath(); ctx.ellipse(h.x, h.y + 6, 14, 7, 0, 0, 7); ctx.fill(); }
  ctx.restore();
}

// 空中的东西都画在暗处之上：直升机、石头、碎片
function drawCrashAir() {
  const c = S.crash;
  // 处刑者：夜里的草地上它几乎是黑的。演出期间把它提到暗处之上，加一圈暗红的轮廓光和发亮的眼睛，
  // 让玩家看清「是谁在扔」。砸地后慢慢褪掉，交还控制权时回到正常画法
  const boss = S.enemies.find(e => e.t === 'boss' && !e.dead);
  if (boss) drawBossGlow(boss, Math.min(clamp(c.t / 0.3, 0, 1), clamp((CRASH.end - 0.8 - c.t) / 1.2, 0, 1)));
  if (!c.ground) drawHeli(c.hit ? { x: c.hx, y: c.hy, alt: c.alt, ang: c.ang, noTail: true } : { x: PAD.x, y: PAD.y, alt: c.alt0, ang: 0 });
  // 石头：从处刑者脚前的地里掀起来，慢慢举过头顶（越举越高 = 画得越大），蓄力时往后拉，甩出去后打着旋飞向尾梁
  if (c.ripped && !c.hit) {
    let x, y, rot, sc;
    const a = Math.atan2(PAD.y - c.by, PAD.x - c.bx);
    if (!c.thrown) {
      const lift = easeOut(clamp((c.t - CRASH.rip) / (CRASH.wind - CRASH.rip), 0, 1));
      const pull = clamp((c.t - CRASH.wind) / (CRASH.throw - CRASH.wind), 0, 1);
      const reach = lerp(30, 6, lift) - pull * 18;                     // 从脚前收到头顶，再往后拉
      x = c.bx + Math.cos(a) * reach; y = c.by + Math.sin(a) * reach - lift * 16;
      rot = a + lift * 0.4 - pull * 0.5; sc = 0.85 + lift * 0.3;
    } else { const h = crashRockPos(c); x = h.x; y = h.y - h.h; rot = h.rot; sc = 1.15 + h.h / 120; }
    drawRock(x, y, rot, sc);
  }
  for (const q of c.debris) {
    ctx.save(); ctx.globalAlpha = clamp(q.life, 0, 1); ctx.translate(q.x, q.y); ctx.rotate(q.rot);
    ctx.fillStyle = q.c; ctx.fillRect(-q.w / 2, -q.h / 2, q.w, q.h); ctx.restore();
  }
}

// 屏幕层：电影黑边 + 砸地白闪
function drawCrashScreen() {
  const c = S.crash;
  if (c) {
    const k = Math.min(clamp(c.t / 0.5, 0, 1), clamp((CRASH.end - c.t) / 0.6, 0, 1)), bh = Math.round(H * 0.09 * k);
    ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, bh); ctx.fillRect(0, H - bh, W, bh);
  }
  if (S.crashFlash > 0) { ctx.fillStyle = `rgba(255,236,200,${S.crashFlash * 0.85})`; ctx.fillRect(0, 0, W, H); }
}

// 一块不规则的大石头：暗面 + 亮面 + 几道裂纹。形状固定，免得每帧抖动
const ROCK_SHAPE = [[-20, -6], [-14, -17], [-2, -21], [12, -16], [21, -5], [18, 10], [6, 18], [-9, 17], [-19, 9]];
function drawRock(x, y, rot, sc) {
  ctx.save(); ctx.translate(x, y); ctx.rotate(rot); ctx.scale(sc, sc);
  ctx.fillStyle = '#3e3a35'; ctx.beginPath(); ROCK_SHAPE.forEach(([px, py], i) => i ? ctx.lineTo(px, py) : ctx.moveTo(px, py)); ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#6f6960'; ctx.beginPath(); ROCK_SHAPE.forEach(([px, py], i) => i ? ctx.lineTo(px * 0.78 - 3, py * 0.78 - 3) : ctx.moveTo(px * 0.78 - 3, py * 0.78 - 3)); ctx.closePath(); ctx.fill();
  ctx.fillStyle = 'rgba(160,150,135,0.5)'; ctx.beginPath(); ctx.ellipse(-6, -9, 7, 4, -0.4, 0, 7); ctx.fill();
  ctx.strokeStyle = '#2c2925'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(-4, -12); ctx.lineTo(2, -2); ctx.lineTo(-3, 7); ctx.moveTo(8, -8); ctx.lineTo(12, 2); ctx.stroke();
  ctx.fillStyle = 'rgba(60,45,25,0.8)'; ctx.fillRect(-10, 12, 5, 3); ctx.fillRect(4, 13, 6, 3);   // 底下还粘着泥
  ctx.restore();
}

// 演出里的处刑者：提到暗处之上，暗红轮廓光 + 发亮的眼睛（坠毁、跳落共用）。k = 0…1 淡入淡出
function drawBossGlow(boss, k) {
  if (!(k > 0)) return;
  const pulse = 0.8 + 0.2 * Math.sin(S.time * 6);
  const g = ctx.createRadialGradient(boss.x, boss.y, 10, boss.x, boss.y, 64);
  g.addColorStop(0, `rgba(170,20,15,${0.55 * k * pulse})`); g.addColorStop(1, 'rgba(170,20,15,0)');
  ctx.fillStyle = g; ctx.beginPath(); ctx.arc(boss.x, boss.y, 64, 0, 7); ctx.fill();
  ctx.save(); ctx.globalAlpha = k;
  ctx.shadowColor = 'rgba(255,60,40,0.9)'; ctx.shadowBlur = 14;
  drawEnemy(boss);
  ctx.restore();
  const a = boss.fa || 0, ex = boss.x + Math.cos(a) * 11, ey = boss.y + Math.sin(a) * 11, nx = -Math.sin(a) * 3.5, ny = Math.cos(a) * 3.5;
  ctx.save(); ctx.globalAlpha = k; ctx.shadowColor = '#ff2010'; ctx.shadowBlur = 10; ctx.fillStyle = '#ff5030';
  ctx.beginPath(); ctx.arc(ex + nx, ey + ny, 2.2, 0, 7); ctx.arc(ex - nx, ey - ny, 2.2, 0, 7); ctx.fill(); ctx.restore();
}

// ---------------------------------------------------------------- 处刑者从二楼栏杆跳下（主厅）
function drawLeapGround() {
  const L = S.leap; if (!L) return;
  const k = clamp(L.t / LEAP.land, 0, 1);
  if (L.t < LEAP.land) {   // 落点的影子：越来越大、越来越黑
    ctx.save(); ctx.globalAlpha = 0.15 + 0.55 * k * k; ctx.fillStyle = '#000';
    ctx.beginPath(); ctx.ellipse(L.x, L.y + 6, 12 + 22 * k, 8 + 14 * k, 0, 0, 7); ctx.fill(); ctx.restore();
  }
}
function drawLeapAir() {
  const L = S.leap; if (!L) return;
  if (L.t >= LEAP.drop && L.t < LEAP.land) {      // 从画面外砸下来：越低越小
    const k = clamp((L.t - LEAP.drop) / (LEAP.land - LEAP.drop), 0, 1), h = (1 - k * k) * 180, sc = 1 + (1 - k) * 1.4;
    const fake = { t: 'boss', x: L.x, y: L.y - h, fa: Math.PI / 2, ph: 0, dead: false, state: 'chase', r: 21 };
    ctx.save(); ctx.translate(L.x, L.y - h); ctx.scale(sc, sc); ctx.translate(-L.x, -(L.y - h));
    drawBossGlow(fake, 1); ctx.restore();
  }
  const boss = S.enemies.find(e => e.t === 'boss' && !e.dead);
  if (boss && L.t >= LEAP.land) drawBossGlow(boss, clamp((LEAP.end - L.t) / 0.6, 0, 1));
}
function drawLeapScreen() {
  const L = S.leap; if (!L) return;
  const k = Math.min(clamp(L.t / 0.4, 0, 1), clamp((LEAP.end - L.t) / 0.5, 0, 1)), bh = Math.round(H * 0.09 * k);
  ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, bh); ctx.fillRect(0, H - bh, W, bh);
}
