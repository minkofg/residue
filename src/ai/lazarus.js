'use strict';
// 控制塔 + 终点站台 + Boss 战二：「拉撒路」（洛克伍德博士变异体）、电磁炮、J 登场（计划 2、4.3、4.5、6.1）
//
// 流程：打倒暴走处刑者 → 焚化炉车间北门通往控制塔（安全屋，J 在这里第一次露面）→ 控制台启动列车，
//   焚化炉车间南门打开 → 终点站台：洛克伍德博士现身，变异成拉撒路 → 三个阶段 → 倒下后 30 秒内跳上列车撤离（触手追击，见 updateEscape）
//
// 拉撒路：三个阶段各有一条血（1800 / 2200 / 4500），一个阶段打空 → 变身演出（无敌）→ 下一阶段满血
//   阶段一 人形：近身横扫（前摇 0.7 秒）、投掷钢材（红线预警）。每次出招后肩上的眼球睁开 2 秒 —— 这时打它 ×2.5
//   阶段二 四足兽形：速度 240（比你跑得快），扑咬 + 冲撞；撞墙晕 3 秒（输出窗口）；隔几秒召唤寄生体（30 血）
//   阶段三 巨大肉块：堵在站台东头不动，触手从你脚下钻出来（1 秒预警，打它 40 就能打断）；
//          站台从东往西被腐蚀，站在腐蚀区里持续掉血。J 丢来电磁炮（1500 × 3 发，按住射击蓄力 3 秒），
//          其他武器只有 10% 伤害。电磁炮打光了它还活着 → J 再丢一块电池（不会卡关）

const LAZ = {
  morph: 2.6,                                  // 变身演出（无敌）
  p1: {
    spd: 95,
    sweep: { windup: 0.7, rec: 0.8, arc: 1.3, reach: 92, dmg: 30 },
    toss: { min: 3.5 * 48, tell: 0.8, rec: 0.6, cd: [3, 4.5], spd: 560, dmg: 28, r: 14 },
    eyeOpen: 2.0,                              // 出招后眼球睁开多久
  },
  p2: {
    spd: 240,
    bite: { windup: 0.35, rec: 0.6, reach: 34, dmg: 22 },
    charge: { min: 3 * 48, tell: 0.6, spd: 520, time: 1.6, dmg: 35, cd: [2.5, 4] },
    roarCd: [11, 15],                          // 冲撞预警隔这么久才用一次满口咆哮，其余用短促的低哼（试玩反馈：阶段二太吵）
    summon: { cd: [7, 9], n: 2, max: 4 },
  },
  p3: {
    at: [85.5, 51.5], r: 72,                   // 肉块的位置（格）和半径
    // 触手：间隔 3–4 秒、1.3 秒预警、半径 50 —— 拿着电磁炮蓄力（瞄准速度 55）也能横移躲开，不必松手（玩家反馈后放慢）
    tentacle: { cd: [3, 4], first: 3, tell: 1.3, r: 50, dmg: 30, life: 0.5 },
    flinch: 2.5,                               // 被电磁炮打中后抽搐这么久：不长触手，地上正在冒的也缩回去
    corrode: { from: 80, to: 62, spd: 0.3, dps: 12 },   // 腐蚀边界从 x=80 格往西推到 62 格，每秒 0.3 格
    touch: 20,                                 // 贴上肉块
    jDelay: 2.2, resupply: 8,                  // J 丢电磁炮的延迟；打光了多久再补一块电池
  },
};
// 电磁炮（剧情武器，不占格子，数字键 6 切换）
const RAILGUN = { name: '电磁炮 EM-X', dmg: 1500, ammo: 3, charge: 3, cd: 0.8, range: 1500, noise: 20,
  keep: 1.2, decay: 1 };   // 松手后蓄力保留 1.2 秒（躲一下再接着蓄），之后每秒掉 1 秒

function lazarusBoss() { return S.enemies.find(e => e.t === 'lazarus' && !e.dead) || null; }
const lazPhaseDef = e => EDEF.lazarus.phases[(e.phase || 1) - 1];

// ---------------------------------------------------------------- 登场（触发器动作 lazarus: [x, y]）
function startLazarus(at) {
  if (S.enemies.some(e => e.t === 'lazarus')) return;
  const e = mkEnemy('lazarus', at[0], at[1]);
  e.phase = 1; e.alert = true; e.state = 'chase'; e.introT = 3.2; e.eyeT = 0; e.tossCd = S.time + 5;
  e.fa = Math.atan2(S.p.y - e.y, S.p.x - e.x);
  S.enemies.push(e);
  cryAt('lazarus', 'roar', e.x, e.y, 1, 3000, 0.5); shake = Math.max(shake, 14);
}
// 试玩跳转：直接从第 phase 阶段开打
function warpLazarus(phase) {
  S.enemies = S.enemies.filter(e => !['lazarus', 'parasite', 'tentacle'].includes(e.t));
  startLazarus([64, 51]); const e = lazarusBoss(); e.introT = 0;
  if (phase > 1) { e.phase = phase - 1; finishLazMorph(e); }
  S.fired[`${S.map}:m3_platform`] = true;
  const k = doorKey(80, 43); S.unlocked = S.unlocked.filter(u => u !== k); setDoorOpen(80, 43, false); grid[43 * MW + 80] = 3; drawTileAt(80, 43);
}
// 一个阶段打空 → 变身（无敌），演完进入下一阶段
function startLazMorph(e) {
  e.morphT = LAZ.morph; e.state = 'morph'; e.hp = 1; e.eyeT = 0; e.stunT = 0;
  cryAt('lazarus', 'roar', e.x, e.y, 1.2, 4000, 0.6); shake = Math.max(shake, 24);
  for (let i = 0; i < 50; i++) { const a = rand(6.283), v = rand(60, 280); parts.push({ x: e.x, y: e.y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: rand(0.4, 1), max: 1, s: rand(2, 6), c: Math.random() < .5 ? '#8a1a2a' : '#c06080', t: 'blood' }); }
  if (e.phase === 1) msg('它的脊椎「咔啦咔啦」地拉长，四肢着地 —— 已经不是人的形状了。', 4.5);
  else { msg('它退到站台尽头，身体像面团一样鼓胀起来，把整个站台堵死了……', 5); S.enemies.forEach(o => { if (o.t === 'parasite' && !o.dead) { o.dead = true; o.deadT = 0; } }); }
}
function finishLazMorph(e) {
  e.phase++; const D = lazPhaseDef(e);
  e.hp = e.maxhp = D.hp; e.state = 'chase'; e.atkT = 0; e.recT = 0;
  if (e.phase === 2) { e.r = 22; e.spd = LAZ.p2.spd; e.chargeCd = S.time + 2; e.summonCd = S.time + 3; }
  if (e.phase === 3) {
    e.r = LAZ.p3.r; e.x = LAZ.p3.at[0] * T; e.y = LAZ.p3.at[1] * T; e.tentCd = S.time + LAZ.p3.tentacle.first;
    S.corrode = LAZ.p3.corrode.from;
    S.jThrow = { t: -LAZ.p3.jDelay };   // J 先出现，过一会儿把电磁炮丢过来
    jAppear([52, 45], true);
  }
  setFlag(e.phase === 2 ? 'lazarus2' : 'lazarus3');
}

// ---------------------------------------------------------------- 控制塔的列车控制台
function useTrainConsole(it) {
  if (S.flags.trainStarted) { msg('列车已经启动了。终点站台在焚化炉车间的南门外。', 3); return; }
  sfx('metal', 1); sfx('bash', 0.5); shake = Math.max(shake, 5);
  msg('闸门落下。远处传来柴油机「突突突」的启动声 —— 列车开始预热了。', 5);
  if (S.npcJ) jLeave();
  setFlag('trainStarted');
}

// ---------------------------------------------------------------- AI
function updateLazarus(e, dt, safe) {
  const p = S.p, dx = p.x - e.x, dy = p.y - e.y, d = Math.hypot(dx, dy), ang = Math.atan2(dy, dx);
  e.ph += dt;
  if (e.introT > 0) { e.introT -= dt; turnToward(e, ang, 2, dt); return; }
  if (e.morphT > 0) { e.morphT -= dt; if (e.morphT <= 0) finishLazMorph(e); return; }
  if (e.eyeT > 0) e.eyeT -= dt;
  if (e.phase === 3) { updateLazMass(e, dt, safe, d); return; }
  if (e.stunT > 0) { e.stunT -= dt; return; }
  const reachBase = e.r + p.r;
  if (e.phase === 1) {
    const C = LAZ.p1;
    switch (e.state) {
      case 'sweep': {
        e.atkT -= dt; turnToward(e, ang, 2.4, dt);
        if (e.atkT > 0) return;
        sfxAt('bash', e.x, e.y, 0.8, 1200); shake = Math.max(shake, 6);
        if (!safe && d < reachBase + C.sweep.reach * 0.6 && Math.abs(angDiff(e.fa, ang)) < C.sweep.arc) hurtPlayer(C.sweep.dmg, ang, 'boss');
        e.state = 'rec'; e.recT = C.sweep.rec; e.eyeT = C.eyeOpen; return;
      }
      case 'tossTell': {
        e.atkT -= dt; turnToward(e, ang, 3, dt); e.tossA = e.fa;
        if (e.atkT > 0) return;
        const ox = e.x + Math.cos(e.fa) * 30, oy = e.y + Math.sin(e.fa) * 30;
        (S.lazProj = S.lazProj || []).push({ x: ox, y: oy, vx: Math.cos(e.fa) * C.toss.spd, vy: Math.sin(e.fa) * C.toss.spd, rot: 0, life: 2.5 });
        sfxAt('metal', e.x, e.y, 1, 1600, 0.3);
        e.state = 'rec'; e.recT = C.toss.rec; e.eyeT = C.eyeOpen; return;
      }
      case 'rec': e.recT -= dt; if (e.recT <= 0) e.state = 'chase'; return;
    }
    if (safe) return;
    const los = losClear(e.x, e.y, p.x, p.y), direct = los && walkClear(e.x, e.y, p.x, p.y);
    if (direct && d < reachBase + C.sweep.reach * 0.5) { e.state = 'sweep'; e.atkT = C.sweep.windup; cryAt('lazarus', 'grunt', e.x, e.y, 0.8, 900, 0.1); return; }
    if (los && d > C.toss.min && S.time >= (e.tossCd || 0)) { e.state = 'tossTell'; e.atkT = C.toss.tell; e.tossCd = S.time + rand(C.toss.cd[0], C.toss.cd[1]); return; }
    lazMove(e, direct, C.spd, 3, dt);
    return;
  }
  // ---- 阶段二：四足兽形
  const C = LAZ.p2;
  if (S.time >= (e.summonCd || 0)) {
    e.summonCd = S.time + rand(C.summon.cd[0], C.summon.cd[1]);
    const alive = S.enemies.filter(o => o.t === 'parasite' && !o.dead).length;
    for (let i = 0; i < Math.min(C.summon.n, C.summon.max - alive); i++) {
      const a = rand(6.283), tx = Math.floor((e.x + Math.cos(a) * 40) / T), ty = Math.floor((e.y + Math.sin(a) * 40) / T);
      if (solidT(tx, ty)) continue;
      const o = mkEnemy('parasite', tx, ty); o.alert = true; o.state = 'chase'; S.enemies.push(o);
    }
    cryAt('lazarus', 'moan', e.x, e.y, 0.75, 1200, 0.3);   // 一群嗓子的呻吟：寄生体从它身上掉下来（压低：别和冲撞的叫声抢）
    floats.push({ x: e.x, y: e.y - 30, t: '寄生体！', life: 1.2, c: '#e090b0' });
  }
  switch (e.state) {
    case 'bite': {
      e.atkT -= dt; turnToward(e, ang, 5, dt);
      if (e.atkT > 0) return;
      if (!safe && d < reachBase + C.bite.reach + 6) hurtPlayer(C.bite.dmg, ang, 'boss');
      sfxAt('bite', e.x, e.y, 0.6, 900);
      e.state = 'rec'; e.recT = C.bite.rec; return;
    }
    case 'chargeTell': {
      e.atkT -= dt; turnToward(e, ang, 8, dt);
      if (e.atkT <= 0) {
        e.state = 'charge'; e.chargeT = C.charge.time; e.chargeA = e.fa; e.chargeHit = false;
        // 冲撞的听觉预警：平时是一声短促的低哼（0.4–0.55 秒），偶尔才是满口咆哮 ——
        // 每次冲撞都吼的话，2.5–4 秒一次，整个阶段二从头吵到尾（试玩反馈）。
        if (S.time >= (e.roarCd || 0)) { e.roarCd = S.time + rand(C.roarCd[0], C.roarCd[1]); cryAt('lazarus', 'roar', e.x, e.y, 0.9, 1800, 0.3); }
        else cryAt('lazarus', 'grunt', e.x, e.y, 0.95, 1500, 0.25);
      }
      return;
    }
    case 'charge': {
      e.chargeT -= dt;
      const ox = e.x, oy = e.y;
      moveEnt(e, Math.cos(e.chargeA) * C.charge.spd * dt, Math.sin(e.chargeA) * C.charge.spd * dt);
      if (inSafeTile(e.x, e.y)) { e.x = ox; e.y = oy; }
      if (!safe && !e.chargeHit && dist(e.x, e.y, p.x, p.y) < e.r + p.r + 6) { e.chargeHit = true; hurtPlayer(C.charge.dmg, e.chargeA, 'boss'); }
      if ((e.x - ox) * Math.cos(e.chargeA) + (e.y - oy) * Math.sin(e.chargeA) < C.charge.spd * dt * 0.5) {   // 沿冲撞方向前进不了（擦着墙滑也算）   // 撞墙：晕 3 秒 —— 输出窗口
        e.state = 'chase'; e.stunT = EDEF.lazarus.phases[1].stunAfterCharge; shake = Math.max(shake, 14); sfxAt('bash', e.x, e.y, 1.15, 2000, 0.4);
        floats.push({ x: e.x, y: e.y - 30, t: '晕眩', life: 1.2, c: '#ffcc55' });
      } else if (e.chargeT <= 0) { e.state = 'rec'; e.recT = 0.7; }
      return;
    }
    case 'rec': e.recT -= dt; if (e.recT <= 0) e.state = 'chase'; return;
  }
  if (safe) return;
  const los = losClear(e.x, e.y, p.x, p.y), direct = los && walkClear(e.x, e.y, p.x, p.y);
  if (direct && d < reachBase + C.bite.reach * 0.8) { e.state = 'bite'; e.atkT = C.bite.windup; return; }
  if (direct && d > C.charge.min && S.time >= (e.chargeCd || 0)) { e.state = 'chargeTell'; e.atkT = C.charge.tell; e.chargeCd = S.time + rand(C.charge.cd[0], C.charge.cd[1]); return; }
  lazMove(e, direct, e.spd, 6, dt);
}
function lazMove(e, direct, spd, turn, dt) {
  const p = S.p, n = direct ? [p.x, p.y] : flowNext(e);
  if (!n) return;
  const a = Math.atan2(n[1] - e.y, n[0] - e.x), ox = e.x, oy = e.y;
  turnToward(e, a, turn, dt);
  const k = Math.max(0.3, Math.cos(angDiff(e.fa, a)));
  moveEnt(e, Math.cos(e.fa) * spd * k * dt, Math.sin(e.fa) * spd * k * dt);
  if (inSafeTile(e.x, e.y)) { e.x = ox; e.y = oy; }
}
// ---- 阶段三：肉块。自己不动：长触手、腐蚀站台
function updateLazMass(e, dt, safe, d) {
  const C = LAZ.p3, p = S.p;
  e.fa = Math.atan2(p.y - e.y, p.x - e.x);
  if (e.flinchT > 0) e.flinchT -= dt;
  // 贴上去：被推开 + 受伤
  if (d < e.r + p.r) {
    const a = Math.atan2(p.y - e.y, p.x - e.x); p.x = e.x + Math.cos(a) * (e.r + p.r + 1); p.y = e.y + Math.sin(a) * (e.r + p.r + 1);
    if (!safe) hurtPlayer(C.touch, a, 'boss');
  }
  if (safe) return;
  if (S.time >= (e.tentCd || 0)) {
    e.tentCd = S.time + rand(C.tentacle.cd[0], C.tentacle.cd[1]);
    const o = mkEnemy('tentacle', 0, 0); o.x = p.x + rand(-10, 10); o.y = p.y + rand(-10, 10);
    o.state = 'tell'; o.atkT = C.tentacle.tell; o.alert = true; S.enemies.push(o);
    cryAt('tentacle', 'rumble', o.x, o.y, 1, 1200, 0.3);   // 脚下越来越响的闷响：快躲
  }
}
// 触手：从玩家脚下钻出来。预警期间打掉它（40 血）就能打断
function updateTentacle(e, dt, safe) {
  const C = LAZ.p3.tentacle;
  if (e.dead) return;
  e.ph += dt;
  if (!lazarusBoss() && !escapeActive()) { e.dead = true; e.deadT = 0; e.gone = true; return; }
  if (e.state === 'tell') {
    e.atkT -= dt; if (e.atkT > 0) return;
    e.state = 'slam'; e.atkT = C.life; shake = Math.max(shake, 8); sfxAt('bash', e.x, e.y, 0.9, 1400, 0.3); cryAt('tentacle', 'burst', e.x, e.y, 1, 1400, 0.3);
    if (!safe && dist(e.x, e.y, S.p.x, S.p.y) < C.r + S.p.r) hurtPlayer(C.dmg, Math.atan2(S.p.y - e.y, S.p.x - e.x), 'boss');
    return;
  }
  e.atkT -= dt; if (e.atkT <= 0) { e.dead = true; e.deadT = 0; e.gone = true; }   // 缩回地下（不算击杀）
}

// ---------------------------------------------------------------- 受伤修正（combat.js 的 damageEnemy 调用）
// 返回修正后的伤害；返回 null = 这一下完全无效（变身中 / 登场演出中）
function lazarusDamage(e, dmg, a, src) {
  if (e.introT > 0 || e.morphT > 0) { if (Math.random() < 0.3) floats.push({ x: e.x, y: e.y - 40, t: '无效', life: 0.6, c: '#aaa' }); return null; }
  const D = lazPhaseDef(e);
  if (e.phase === 1 && e.eyeT > 0 && src !== 'env') {
    dmg *= D.weakMul;
    if (Math.random() < 0.5) floats.push({ x: e.x, y: e.y - 36, t: '眼球！', life: 0.8, c: '#ffd040' });
  }
  if (e.phase === 3 && src !== 'railgun') {
    dmg *= D.otherMul;
    if (Math.random() < 0.25) floats.push({ x: e.x + rand(-30, 30), y: e.y - 50, t: '几乎没有效果', life: 0.8, c: '#aaa' });
  }
  if (e.phase < 3 && e.hp - dmg <= 0) { startLazMorph(e); return 0; }
  return dmg;
}

// ---------------------------------------------------------------- 站台上的其他东西：钢材、腐蚀、J、电磁炮
function updateLazWorld(dt) {
  updateEscape(dt);
  // 清掉缩回去的触手、死了一会儿的寄生体（它们会刷很多只）
  if (S.enemies.some(o => o.dead && (o.t === 'tentacle' || (o.t === 'parasite' && o.deadT > 6)))) S.enemies = S.enemies.filter(o => !(o.dead && (o.t === 'tentacle' || (o.t === 'parasite' && o.deadT > 6))));
  // 投出去的钢材
  if (S.lazProj && S.lazProj.length) {
    const p = S.p;
    S.lazProj = S.lazProj.filter(s => {
      s.life -= dt; s.rot += dt * 14;
      const nx = s.x + s.vx * dt, ny = s.y + s.vy * dt;
      if (solidT(Math.floor(nx / T), Math.floor(ny / T)) || s.life <= 0) { sfxAt('metal', s.x, s.y, 0.8, 1200, 0.2); return false; }
      s.x = nx; s.y = ny;
      if (dist(s.x, s.y, p.x, p.y) < LAZ.p1.toss.r + p.r) { hurtPlayer(LAZ.p1.toss.dmg, Math.atan2(s.vy, s.vx), 'boss'); return false; }
      return true;
    });
  }
  // 腐蚀：边界往西推；站在边界东边持续掉血
  const b = lazarusBoss();
  if (S.corrode !== undefined && S.corrode !== null) {
    if (!b) S.corrode = null;
    else {
      const C = LAZ.p3.corrode;
      S.corrode = Math.max(C.to, S.corrode - C.spd * dt);
      if (S.p.x > S.corrode * T && mode === 'play') {
        S.corrodeAcc = (S.corrodeAcc || 0) + C.dps * dt;
        if (S.corrodeAcc >= 4) { S.p.hp -= S.corrodeAcc; S.corrodeAcc = 0; P.hurtT = 0.2; if (Math.random() < 0.3) sfx('sizzle', 0.5); if (S.p.hp <= 0) hurtPlayer(1, 0, 'acid'); }
      }
    }
  }
  // J 把电磁炮丢过来
  if (S.jThrow) {
    const j = S.jThrow; j.t += dt;
    if (j.t >= 0 && !j.flying) { j.flying = true; j.x0 = S.npcJ ? S.npcJ.x : S.p.x - 200; j.y0 = S.npcJ ? S.npcJ.y : S.p.y - 200; msg(j.resupply ? 'J：「接着！最后一块电池 —— 这次别打偏了。」' : 'J：「林岚！接着 —— 普通的枪对它没用，用这个！」', 4); sfx('metal', 0.6); }
    if (j.flying && j.t >= 0.8) {
      S.jThrow = null;
      if (j.resupply) { S.p.rail.ammo += 1; msg('电磁炮电池 +1', 2.5); }
      else { S.p.rail = { ammo: RAILGUN.ammo, on: true }; P.railCharge = 0; P.railCd = 0; P.railIdle = 0; msg('获得电磁炮！按住射击蓄力 3 秒发射（共 3 发，数字键 6 切换）', 6); if (!S.flags.lazarusDead) S.objective = '▲ 用电磁炮轰击肉块（瞄准后按住射击，蓄力 3 秒）'; }   // 电磁炮落地前拉撒路已经死了（试玩跳转后立刻打倒）：别把「跳上列车」盖掉
      sfx('key'); if (S.npcJ) S.npcJ.leave = true;
    }
  } else if (b && b.phase === 3 && S.p.rail && S.p.rail.ammo <= 0 && P.railCharge <= 0) {
    // 电磁炮打光了它还活着：J 再补一块电池（不会卡关）
    S.railOutT = (S.railOutT || 0) + dt;
    if (S.railOutT >= LAZ.p3.resupply) { S.railOutT = 0; S.jThrow = { t: -0.6, resupply: true }; jAppear([52, 45], false); }
  } else S.railOutT = 0;
  // J 离场：淡出
  if (S.npcJ && S.npcJ.leave) { S.npcJ.alpha = (S.npcJ.alpha ?? 1) - dt * 0.8; if (S.npcJ.alpha <= 0) S.npcJ = null; }
  if (P.railBeam) { P.railBeam.life -= dt; if (P.railBeam.life <= 0) P.railBeam = null; }
}
// J：at = [x, y]（格），quiet = 不说话
function jAppear(at, loud) { S.npcJ = { x: (at[0] + .5) * T, y: (at[1] + .5) * T, alpha: 1, leave: false }; if (loud) sfx('step', 0.6); }
function jLeave() { if (S.npcJ) S.npcJ.leave = true; }

// ---------------------------------------------------------------- 电磁炮（player/update.js 每帧调用）
function railOn() { return !!(S.p.rail && S.p.rail.on); }
function equipRail() {
  if (!S.p.rail) { msg('[6] 这个栏位还没有武器。', 1.8); return false; }
  if (S.p.rail.on) return false;
  S.p.rail.on = true; P.railCharge = 0; P.reloadT = 0; sfx('reload', 0.6); return true;
}
function updateRail(dt, aiming) {
  if (!railOn()) { P.railCharge = 0; return; }
  P.railCd = Math.max(0, (P.railCd || 0) - dt);
  const hold = aiming && (mouse.l || keys.KeyJ);
  if (hold && S.p.rail.ammo > 0 && P.railCd <= 0) {
    const before = P.railCharge || 0;
    P.railCharge = before + dt;
    if (Math.floor(before * 4) !== Math.floor(P.railCharge * 4)) sfx('sizzle', 0.25 + P.railCharge * 0.15);
    if (P.railCharge >= RAILGUN.charge) fireRail();
    P.railIdle = 0;
  } else {
    if (hold && S.p.rail.ammo <= 0 && mouse.lp) { sfx('empty'); msg('电磁炮没电了。', 1.5); }
    P.railIdle = (P.railIdle || 0) + dt;
    if (P.railIdle > RAILGUN.keep) P.railCharge = Math.max(0, (P.railCharge || 0) - dt * RAILGUN.decay);
  }
}
function fireRail() {
  const p = S.p, a = p.a;
  P.railCharge = 0; P.railCd = RAILGUN.cd; p.rail.ammo--; S.stats.shots++;
  const ox = p.x + Math.cos(a) * 30, oy = p.y + Math.sin(a) * 30;
  const wd = ray(ox, oy, a, RAILGUN.range, opaqueT), dx = Math.cos(a), dy = Math.sin(a);
  let hit = false;
  for (const e of S.enemies.slice()) {   // 贯穿：弹道上的全部命中
    if (e.dead || e.hidden) continue;
    const fx = e.x - ox, fy = e.y - oy, t = fx * dx + fy * dy;
    if (t < -e.r || t > wd) continue;
    const px = fx - dx * t, py = fy - dy * t;
    if (px * px + py * py < e.r * e.r) {
      damageEnemy(e, RAILGUN.dmg, a, 30, false, 1, 'railgun'); hit = true;
      if (e.t === 'lazarus' && e.phase === 3 && !e.dead) {   // 肉块抽搐：一段时间不长触手，正在冒的缩回去
        e.tentCd = Math.max(e.tentCd || 0, S.time + LAZ.p3.flinch); e.flinchT = LAZ.p3.flinch;
        S.enemies.forEach(o => { if (o.t === 'tentacle' && !o.dead && o.state === 'tell') { o.dead = true; o.deadT = 0; o.gone = true; } });
      }
    }
  }
  if (hit) S.stats.hits++;
  P.railBeam = { x1: ox, y1: oy, x2: ox + dx * wd, y2: oy + dy * wd, life: 0.6 };
  P.flash = 0.15; shake = Math.max(shake, 30);
  sfx('explode', 1); sfx('magnum', 1);
  emitNoise(p.x, p.y, RAILGUN.noise, 'gun');
  if (!hit) msg(p.rail.ammo > 0 ? `打偏了！电磁炮还剩 ${p.rail.ammo} 发。` : '打偏了……电磁炮没电了。', 2.5);
}

// ---------------------------------------------------------------- 结局：30 秒内跳上列车（计划 4.5「结尾」）
// 拉撒路倒下 → 列车汽笛、车门打开、30 秒后发车。那滩残骸还没死透：触手一路追着你从地下钻出来
const ESCAPE = { sec: 30, tentacle: { cd: [1.1, 1.6], tell: 0.9 } };
function escapeActive() { return !!(S.escape && !S.flags.escaped && S.map === 'map3'); }
function startEscape() { S.escape = { tentCd: S.time + 1.5 }; }
function updateEscape(dt) {
  if (!escapeActive() || mode !== 'play') return;
  const E = S.escape, p = S.p, R = ROOMS.find(r => r.id === 'm3platform');
  if (!R || S.time < E.tentCd) return;
  E.tentCd = S.time + rand(ESCAPE.tentacle.cd[0], ESCAPE.tentacle.cd[1]);
  const tx = p.x / T, ty = p.y / T;
  if (tx < R.x || tx >= R.x + R.w || ty < R.y || ty >= R.y + R.h) return;   // 只在站台上追
  const o = mkEnemy('tentacle', 0, 0); o.x = p.x + rand(-12, 12); o.y = p.y + rand(-12, 12);
  o.state = 'tell'; o.atkT = ESCAPE.tentacle.tell; o.alert = true; S.enemies.push(o);
  cryAt('tentacle', 'rumble', o.x, o.y, 1, 1200, 0.3);
}
function useEscapeDoor(it) {
  if (S.flags.escaped) return;
  if (!S.flags.lazarusDead) { sfx('locked', 0.5); msg('车门锁着。列车还在预热 —— 先解决站台上的那个东西。', 3); return; }
  S.countdown = null;
  S.enemies.forEach(o => { if (o.t === 'tentacle' && !o.dead) { o.dead = true; o.deadT = 0; o.gone = true; } });
  setFlag('escaped');
}
// 30 秒到了还没上车：列车开走，残骸把站台吞没
function failEscape() {
  if (S.flags.escaped || mode !== 'play') return;
  msg('汽笛长鸣，列车开走了 —— 站台上的肉块涌了过来。', 4);
  P.inv = 0; hurtPlayer(S.p.hp + 999, 0, 'boss');
}

// ---------------------------------------------------------------- 绘制
function drawLazarus(e) {
  ctx.save(); ctx.translate(e.x, e.y);
  if (e.dead) {
    ctx.globalAlpha = 0.9; ctx.fillStyle = '#3a1020';
    ctx.beginPath(); ctx.ellipse(0, 0, e.r * 1.1, e.r * 0.8, 0.3, 0, 7); ctx.fill();
    ctx.fillStyle = '#5a2030'; for (let i = 0; i < 6; i++) { ctx.beginPath(); ctx.arc(Math.cos(i) * e.r * 0.6, Math.sin(i * 1.7) * e.r * 0.4, e.r * 0.2, 0, 7); ctx.fill(); }
    ctx.restore(); return;
  }
  const shakeX = e.morphT > 0 || e.introT > 0 ? Math.sin(e.ph * 40) * 3 : 0;
  ctx.translate(shakeX, 0);
  if (e.phase === 3) { drawLazMass(e); ctx.restore(); return; }
  ctx.fillStyle = 'rgba(0,0,0,0.45)'; ctx.beginPath(); ctx.ellipse(3, 6, e.r + 4, e.r - 2, 0, 0, 7); ctx.fill();
  let a = e.fa; if (e.stunT > 0) a += Math.sin(e.ph * 30) * 0.15;
  ctx.rotate(a);
  const s = Math.sin(e.ph * (e.phase === 2 ? 16 : 6));
  if (e.phase === 1) {
    // 人形：白大褂碎片、半身肉瘤、右臂变异成巨大的肉棒
    ctx.fillStyle = '#1a1414'; ctx.fillRect(-8 + s * 6, -16, 14, 10); ctx.fillRect(-8 - s * 6, 6, 14, 10);
    ctx.fillStyle = '#c8c0b0'; ctx.beginPath(); ctx.ellipse(0, 0, 17, 24, 0, 0, 7); ctx.fill();   // 白大褂
    ctx.fillStyle = '#9a3a4a'; ctx.beginPath(); ctx.ellipse(-2, 8, 15, 18, 0.3, 0, 7); ctx.fill();   // 肉瘤
    ctx.fillStyle = '#b85a6a'; for (let i = 0; i < 4; i++) { ctx.beginPath(); ctx.arc(-6 + i * 4, 6 + (i % 2) * 8, 5, 0, 7); ctx.fill(); }
    const sw = e.state === 'sweep' ? (1 - Math.max(0, e.atkT) / LAZ.p1.sweep.windup) : 0;
    ctx.save(); ctx.rotate(0.9 - sw * 1.8);
    ctx.fillStyle = '#8a2a3a'; ctx.fillRect(4, 10, 44, 16); ctx.beginPath(); ctx.arc(50, 18, 13, 0, 7); ctx.fill();   // 右臂
    ctx.restore();
    ctx.fillStyle = '#d8c0a8'; ctx.beginPath(); ctx.arc(6, -2, 10, 0, 7); ctx.fill();   // 头（还看得出是个人）
    ctx.fillStyle = '#333'; ctx.fillRect(12, -7, 3, 3); ctx.fillRect(12, 1, 3, 3);
    // 肩上的眼球（弱点）：出招后睁开 2 秒，发黄光
    const open = e.eyeT > 0;
    if (open) { const g = ctx.createRadialGradient(0, -20, 2, 0, -20, 22); g.addColorStop(0, 'rgba(255,220,60,0.6)'); g.addColorStop(1, 'rgba(255,200,0,0)'); ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, -20, 22, 0, 7); ctx.fill(); }
    ctx.fillStyle = '#6a2030'; ctx.beginPath(); ctx.arc(0, -20, 9, 0, 7); ctx.fill();
    ctx.fillStyle = open ? '#fff4c0' : '#7a3040'; ctx.beginPath(); ctx.ellipse(0, -20, 7, open ? 6 : 1.5, 0, 0, 7); ctx.fill();
    if (open) { ctx.fillStyle = '#c02010'; ctx.beginPath(); ctx.arc(2, -20, 3, 0, 7); ctx.fill(); }
  } else {
    // 四足兽形：拉长的脊椎、四条腿
    ctx.strokeStyle = '#6a1a2a'; ctx.lineWidth = 6; ctx.lineCap = 'round';
    for (const [lx, side] of [[12, 1], [12, -1], [-12, 1], [-12, -1]]) { ctx.beginPath(); ctx.moveTo(lx, side * 6); ctx.lineTo(lx + 8 + s * 5 * side * Math.sign(lx), side * 22); ctx.stroke(); }
    ctx.fillStyle = e.state === 'chargeTell' ? '#b03040' : '#8a2a3a'; ctx.beginPath(); ctx.ellipse(0, 0, 28, 13, 0, 0, 7); ctx.fill();
    ctx.fillStyle = '#b85a6a'; for (let k = -20; k <= 16; k += 6) { ctx.beginPath(); ctx.arc(k, 0, 3.2, 0, 7); ctx.fill(); }   // 脊椎骨节
    ctx.fillStyle = '#c8b0a0'; ctx.beginPath(); ctx.ellipse(28, 0, 10, 8, 0, 0, 7); ctx.fill();   // 头
    ctx.fillStyle = '#ff3020'; ctx.fillRect(32, -5, 3, 3); ctx.fillRect(32, 2, 3, 3);
    if (e.state === 'bite') { ctx.fillStyle = '#f0e0d0'; for (let t = -1; t <= 1; t++) ctx.fillRect(37, t * 3 - 1, 5, 2); }
  }
  ctx.restore();
}
function drawLazMass(e) {
  const r = e.r, pul = Math.sin(e.ph * 2.2) * 4 + (e.flinchT > 0 ? Math.sin(e.ph * 50) * 5 : 0);
  ctx.fillStyle = 'rgba(0,0,0,0.5)'; ctx.beginPath(); ctx.ellipse(6, 10, r + 10, r * 0.8, 0, 0, 7); ctx.fill();
  const g = ctx.createRadialGradient(-10, -10, 10, 0, 0, r + pul);
  g.addColorStop(0, '#c05a70'); g.addColorStop(0.6, '#8a2a3a'); g.addColorStop(1, '#4a1020');
  ctx.fillStyle = g; ctx.beginPath();
  for (let i = 0; i <= 24; i++) { const a = i / 24 * 6.283, rr = r + pul + Math.sin(a * 5 + e.ph * 3) * 6; i ? ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr * 0.9) : ctx.moveTo(Math.cos(a) * rr, Math.sin(a) * rr * 0.9); }
  ctx.fill();
  ctx.fillStyle = '#d88090'; for (let i = 0; i < 9; i++) { const a = i * 2.4, rr = r * (0.3 + (i % 3) * 0.2); ctx.beginPath(); ctx.arc(Math.cos(a) * rr, Math.sin(a) * rr * 0.8, 6 + (i % 3) * 3, 0, 7); ctx.fill(); }
  // 还能认出来的那张脸
  ctx.fillStyle = '#d8c0a8'; ctx.beginPath(); ctx.arc(-r * 0.3, -r * 0.2, 11, 0, 7); ctx.fill();
  ctx.fillStyle = '#300'; ctx.fillRect(-r * 0.3 - 5, -r * 0.2 - 3, 3, 3); ctx.fillRect(-r * 0.3 + 2, -r * 0.2 - 3, 3, 3);
  ctx.fillRect(-r * 0.3 - 3, -r * 0.2 + 4, 6, 2);
}
function drawParasite(e) {
  ctx.save(); ctx.translate(e.x, e.y);
  if (e.dead) { ctx.fillStyle = '#4a1a2a'; ctx.beginPath(); ctx.ellipse(0, 0, 9, 5, e.fa, 0, 7); ctx.fill(); ctx.restore(); return; }
  ctx.rotate(e.fa); const s = Math.sin(e.ph * 24) * 3;
  ctx.strokeStyle = '#7a2a3a'; ctx.lineWidth = 2;
  for (let i = -1; i <= 1; i += 2) for (let k = -4; k <= 4; k += 4) { ctx.beginPath(); ctx.moveTo(k, 0); ctx.lineTo(k + s * i, i * 10); ctx.stroke(); }
  ctx.fillStyle = e.stag > 0 ? '#e0a0b0' : '#b05070'; ctx.beginPath(); ctx.ellipse(0, 0, 9, 6, 0, 0, 7); ctx.fill();
  ctx.fillStyle = '#ffd0d0'; ctx.fillRect(6, -2, 3, 1.5); ctx.fillRect(6, 1, 3, 1.5);
  ctx.restore();
}
function drawTentacle(e) {
  if (e.dead) return;
  ctx.save(); ctx.translate(e.x, e.y);
  if (e.state === 'tell') {   // 地面鼓起来、裂开
    const k = 1 - Math.max(0, e.atkT) / LAZ.p3.tentacle.tell;
    ctx.fillStyle = '#3a1a20'; ctx.beginPath(); ctx.ellipse(0, 0, 10 + k * 10, 7 + k * 7, 0, 0, 7); ctx.fill();
    ctx.fillStyle = '#b05070'; ctx.beginPath(); ctx.arc(0, 0, 4 + k * 10, 0, 7); ctx.fill();
  } else {
    const k = Math.max(0, e.atkT) / LAZ.p3.tentacle.life;
    ctx.strokeStyle = '#8a2a3a'; ctx.lineWidth = 16; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.quadraticCurveTo(20 * Math.sin(e.ph * 8), -30 * k, 6, -60 * k); ctx.stroke();
    ctx.strokeStyle = '#c05a70'; ctx.lineWidth = 7; ctx.stroke();
  }
  ctx.restore();
}
// 地面上的：腐蚀区（画在敌人下面）
function drawLazGround() {
  if (S.corrode === undefined || S.corrode === null || !LEVEL) return;
  const x0 = S.corrode * T, R = ROOMS.find(r => r.id === 'm3platform'); if (!R) return;
  const x1 = (R.x + R.w) * T, y0 = R.y * T, y1 = (R.y + R.h) * T;
  const g = ctx.createLinearGradient(x0 - 20, 0, x0 + 60, 0);
  g.addColorStop(0, 'rgba(120,200,60,0)'); g.addColorStop(0.3, 'rgba(110,190,50,0.35)'); g.addColorStop(1, 'rgba(80,140,30,0.42)');
  ctx.fillStyle = g; ctx.fillRect(x0 - 20, y0, x1 - x0 + 20, y1 - y0);
  ctx.fillStyle = 'rgba(180,255,90,0.25)';
  for (let i = 0; i < 16; i++) { const bx = x0 + 10 + hash(i, 3) * (x1 - x0 - 20), by = y0 + hash(7, i) * (y1 - y0); ctx.beginPath(); ctx.arc(bx, by, 3 + 4 * Math.abs(Math.sin(S.time * 2 + i)), 0, 7); ctx.fill(); }
}
// 盖在黑暗之上的：预警（钢材红线、冲撞红光、触手红圈）、钢材、电磁炮光束、J
function drawLazTells() {
  const e = lazarusBoss();
  if (e && e.state === 'tossTell') {
    const k = 1 - Math.max(0, e.atkT) / LAZ.p1.toss.tell;
    ctx.strokeStyle = `rgba(255,50,30,${0.3 + 0.5 * k})`; ctx.lineWidth = 2 + k * 3; ctx.setLineDash([12, 8]);
    ctx.beginPath(); ctx.moveTo(e.x, e.y); ctx.lineTo(e.x + Math.cos(e.fa) * 700, e.y + Math.sin(e.fa) * 700); ctx.stroke(); ctx.setLineDash([]);
  }
  if (e && e.state === 'chargeTell') {
    const g = ctx.createRadialGradient(e.x, e.y, 4, e.x, e.y, 56); g.addColorStop(0, 'rgba(255,60,30,0.55)'); g.addColorStop(1, 'rgba(255,0,0,0)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(e.x, e.y, 56, 0, 7); ctx.fill();
  }
  for (const t of S.enemies) {
    if (t.t !== 'tentacle' || t.dead || t.state !== 'tell') continue;
    const k = 1 - Math.max(0, t.atkT) / LAZ.p3.tentacle.tell;
    ctx.strokeStyle = `rgba(255,40,40,${0.5 + 0.4 * k})`; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(t.x, t.y, LAZ.p3.tentacle.r, 0, 7); ctx.stroke();
    ctx.fillStyle = `rgba(255,30,30,${0.1 + 0.2 * k})`; ctx.beginPath(); ctx.arc(t.x, t.y, LAZ.p3.tentacle.r * k, 0, 7); ctx.fill();
  }
  for (const s of S.lazProj || []) {
    ctx.save(); ctx.translate(s.x, s.y); ctx.rotate(s.rot);
    ctx.fillStyle = '#8a8a90'; ctx.fillRect(-18, -4, 36, 8); ctx.fillStyle = '#5a5a60'; ctx.fillRect(-18, -1, 36, 2);
    ctx.restore();
  }
  if (P.railBeam) {
    const b = P.railBeam, k = b.life / 0.6;
    ctx.lineCap = 'round';
    ctx.strokeStyle = `rgba(120,200,255,${0.35 * k})`; ctx.lineWidth = 22 * k; ctx.beginPath(); ctx.moveTo(b.x1, b.y1); ctx.lineTo(b.x2, b.y2); ctx.stroke();
    ctx.strokeStyle = `rgba(230,250,255,${0.95 * k})`; ctx.lineWidth = 5 * k; ctx.stroke();
  }
  // 蓄力中：枪口越来越亮
  if (railOn() && P.railCharge > 0) {
    const p = S.p, k = Math.min(1, P.railCharge / RAILGUN.charge), mx = p.x + Math.cos(p.a) * 44, my = p.y + Math.sin(p.a) * 44;
    const g = ctx.createRadialGradient(mx, my, 1, mx, my, 10 + k * 26); g.addColorStop(0, `rgba(220,245,255,${0.5 + 0.5 * k})`); g.addColorStop(1, 'rgba(80,160,255,0)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(mx, my, 10 + k * 26, 0, 7); ctx.fill();
    ctx.strokeStyle = `rgba(140,210,255,${0.25 + 0.4 * k})`; ctx.lineWidth = 1.5; ctx.setLineDash([6, 10]);
    ctx.beginPath(); ctx.moveTo(mx, my); ctx.lineTo(p.x + Math.cos(p.a) * 900, p.y + Math.sin(p.a) * 900); ctx.stroke(); ctx.setLineDash([]);
  }
  // 飞过来的电磁炮
  const j = S.jThrow;
  if (j && j.flying) {
    const k = Math.min(1, j.t / 0.8), x = j.x0 + (S.p.x - j.x0) * k, y = j.y0 + (S.p.y - j.y0) * k - Math.sin(k * Math.PI) * 60;
    ctx.save(); ctx.translate(x, y); ctx.rotate(k * 12);
    ctx.fillStyle = '#3a4a5a'; ctx.fillRect(-18, -5, 36, 10); ctx.fillStyle = '#7ad0ff'; ctx.fillRect(-6, -3, 12, 6);
    ctx.restore();
  }
  if (S.npcJ) drawJ(S.npcJ);
}
// J：红色风衣、黑色短发
function drawJ(j) {
  ctx.save(); ctx.globalAlpha = Math.max(0, Math.min(1, j.alpha ?? 1)); ctx.translate(j.x, j.y);
  const a = Math.atan2(S.p.y - j.y, S.p.x - j.x); ctx.rotate(a);
  ctx.fillStyle = 'rgba(0,0,0,0.4)'; ctx.beginPath(); ctx.ellipse(2, 4, 15, 11, 0, 0, 7); ctx.fill();
  ctx.fillStyle = '#9a1020'; ctx.beginPath(); ctx.ellipse(-2, 0, 12, 15, 0, 0, 7); ctx.fill();   // 风衣
  ctx.fillStyle = '#6a0a14'; ctx.fillRect(-12, -3, 8, 6);
  ctx.fillStyle = '#e0c0a0'; ctx.beginPath(); ctx.arc(10, -9, 3, 0, 7); ctx.arc(10, 9, 3, 0, 7); ctx.fill();   // 手
  ctx.fillStyle = '#111'; ctx.beginPath(); ctx.arc(1, 0, 8, 0, 7); ctx.fill();   // 黑发
  ctx.fillStyle = '#e0c0a0'; ctx.beginPath(); ctx.arc(4, 0, 4.5, -1.2, 1.2); ctx.fill();
  ctx.restore();
  if ((j.alpha ?? 1) > 0.5) { ctx.fillStyle = 'rgba(255,200,200,0.85)'; ctx.font = '11px sans-serif'; ctx.textAlign = 'center'; ctx.fillText('J', j.x, j.y - 24); }
}
// 电磁炮的持枪样子（render/entities.js 的 drawPlayer 调用；坐标系已经转到玩家朝向）
function drawRailgunModel(aiming) {
  ctx.fillStyle = '#c9a07a'; ctx.beginPath(); ctx.arc(12, 4, 3.5, 0, 7); ctx.arc(24, -2, 3.5, 0, 7); ctx.fill();
  ctx.fillStyle = '#2a3440'; ctx.fillRect(2, -5, 40, 10);
  ctx.fillStyle = '#4a5a6a'; ctx.fillRect(16, -7, 18, 3); ctx.fillRect(16, 4, 18, 3);
  const k = Math.min(1, (P.railCharge || 0) / RAILGUN.charge);
  ctx.fillStyle = `rgb(${80 + k * 150},${170 + k * 80},255)`; ctx.fillRect(10, -2, 26, 4);
}
