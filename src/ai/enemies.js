'use strict';
// 普通敌人 AI：感知、调查、追击、攻击、分离（处刑者在 ai/executioner.js）

// ---------------------------------------------------------------- 敌人 AI
function updateEnemies(dt) {
  // 感知模型：看见 → 追击（alert）；听见 → 前往声源调查（heard）；丢失目标一段时间后 → 去最后看见的位置，再回到游荡。
  // 处刑者有自己的状态机和导演系统（ai/executioner.js）
  const safe = inSafe();
  updateFollow(dt);
  const ex = activeExecutioner();
  if (ex && S.executioner) updateDirector(dt, ex, safe);
  for (const e of S.enemies) updateEnemy(e, dt, safe);
}

function updateEnemy(e, dt, safe) {
    const p = S.p;
    if (e.dead) { e.deadT += dt; if (e.revive && e.deadT > e.revive) tryReviveCrawler(e); return; }
    if (e.t === 'crawler' && e.state === 'lurk') { updateLurk(e, dt, safe); return; }
    if (e.t === 'vine') { updateVine(e, dt, safe); return; }     // 温室里的蔓生体（ai/vine.js）
    if (e.t === 'slime') { updateSlime(e, dt, safe); return; }   // 水里的淤泥体（ai/slime.js）
    if (e.t === 'hunter') { updateHunter(e, dt, safe); return; }   // 生产车间的猎手（ai/hunter.js）
    if (e.t === 'licker') { updateLicker(e, dt, safe); return; }   // 失明：只靠听觉（ai/licker.js）
    if (e.t === 'boss') { updateExecutioner(e, dt, safe); return; }
    if (e.t === 'executionerBerserk') { updateBerserk(e, dt, safe); return; }
    if (e.t === 'lazarus') { updateLazarus(e, dt, safe); return; }   // 终点站台 Boss 战（ai/lazarus.js）
    if (e.t === 'tentacle') { updateTentacle(e, dt, safe); return; }   // 焚化炉 Boss 战（ai/berserk.js）  // 常驻追踪者：任何距离都更新
    const dx = p.x - e.x, dy = p.y - e.y, d = Math.hypot(dx, dy);
    if (d > SLEEP_DIST) return;  // 远处的普通敌人休眠
    if (e.leaveCd > 0) e.leaveCd -= dt;
    e.ph += dt; e.knifeStunT = Math.max(0, (e.knifeStunT || 0) - dt);
    const ang = Math.atan2(dy, dx);
    // 视野锥（计划 5.1 / 5.2）：没发现你之前只看得见前方 fov 度（僵尸 100°、狗 180°），背后只靠听觉；
    // 已经在追你（alert）时一直盯着，不看方向。贴身 70px 以内怎样都会发现
    const fov = EDEF[e.t].fov, inCone = e.alert || !fov || Math.abs(angDiff(e.fa, ang)) <= fov * Math.PI / 360;
    const los = d < e.sight && inCone && losClear(e.x, e.y, p.x, p.y);
    const direct = walkClear(e.x, e.y, p.x, p.y);
    // 看见玩家（玩家在安全屋里时不算）
    if (!safe && (los || d < 70)) {
      if (!e.alert) enemyCry(e, 'spot', 1, 700, 0.2);   // 发现你的那一下（狗连吠、僵尸嘶吼、寄生体尖叫）：「被看见了」的提示
      e.alert = true; e.lostT = 0; e.heard = null; e.heardField = null; e.lastSeen = { x: p.x, y: p.y };
    }
    if (e.alert && !los) {
      if (!bashKeepsTarget(e)) e.lostT = (e.lostT || 0) + dt; // 拍门时（玩家就在门后不远）不会遗忘
      if (safe || e.lostT > (EDEF[e.t].memory || 6)) {
        e.alert = false; e.lostT = 0;
        if (safe) leaveSafeDoor(e, p);   // 玩家躲进安全屋：不守门，走开去别处
        else {
          const ls = e.lastSeen || { x: p.x, y: p.y };
          e.heard = { x: ls.x, y: ls.y, t: 8, label: 'lastSeen' }; e.heardField = noiseField(ls.x, ls.y, 14);
        }
      }
    }
    if (!e.alert && e.state === 'bash') e.state = 'idle'; // 放弃拍门
    // 声音
    e.groanT -= dt;
    // 平时的叫声。追你的时候（alert）只是偶尔低声喘吼：像《僵尸世界大战》那样，发现你时吼一声，之后不再一路大喊
    if (e.groanT <= 0) { e.groanT = e.alert ? rand(8, 14) : rand(4, 9); enemyCry(e, 'idle', (e.t === 'parasite' ? 0.5 : 1) * (e.alert ? 0.6 : 1), e.t === 'parasite' ? 500 : 650); }
    if (e.stag > 0) { e.stag -= dt; return; }
    if (e.state === 'grab') return;   // 正抓着玩家（ai/grab.js 负责）
    if (safe && e.state === 'attack') { e.state = 'chase'; e.atkT = 0; }
    if (e.state === 'attack') {
      e.atkT -= dt; e.fa += angDiff(e.fa, ang) * Math.min(1, dt * 4);
      if (e.t === 'dog') moveEnt(e, Math.cos(e.fa) * 230 * dt, Math.sin(e.fa) * 230 * dt);
      if (e.atkT <= 0) {
        if (d < e.r + p.r + EDEF[e.t].reach + 6) {
          if (e.t === 'zombie' && tryGrab(e)) return;   // 僵尸：先抓住，连按 E 挣脱（ai/grab.js）
          hurtPlayer(e.dmg, ang, e.t);
          if (e.t === 'crawler') { P.slowT = CRAWLER.slowT; msg('脚踝被一只手死死攥住了！', 2); }   // 抓脚踝：短暂减速
        }
        e.state = 'rec'; e.recT = EDEF[e.t].rec;
      }
      return;
    }
    if (e.state === 'rec') { e.recT -= dt; if (e.recT <= 0) e.state = 'chase'; return; }
    let vx = 0, vy = 0, sp = e.spd;
    if (e.alert) {
      if (d < e.r + p.r + EDEF[e.t].reach * 0.7 && los && direct && !safe) { e.state = 'attack'; e.atkT = EDEF[e.t].windup; if (!(e.atkVoT > S.time)) { e.atkVoT = S.time + rand(3, 5); enemyCry(e, 'attack', e.t === 'dog' ? 1 : 0.8, 650); } return; }   // 扑咬叫声每只 3–5 秒最多一次（围上来的一群不会每一下都吼）
      let tx, ty;
      if (los && direct) { tx = p.x; ty = p.y; }
      else {
        const n = flowNext(e);
        // B 层（僵尸）：下一步是关着的门，而且已经贴到门上 → 拍门
        const bd = doorBashTarget(e, n);
        if (bd) { bashDoor(e, bd[0], bd[1], dt, d); return; }
        if (n) { tx = n[0]; ty = n[1]; }
      }
      if (e.state === 'bash') e.state = 'chase';
      if (tx !== undefined) { const a = Math.atan2(ty - e.y, tx - e.x); vx = Math.cos(a); vy = Math.sin(a); }
    } else if (e.heard) {
      // 调查：沿噪音场走向声源，到达后环顾片刻再放弃
      e.heard.t -= dt;
      const n = dist(e.x, e.y, e.heard.x, e.heard.y) > T * 0.8 ? noiseNext(e) : null;
      if (n) { const a = Math.atan2(n[1] - e.y, n[0] - e.x); vx = Math.cos(a) * 0.85; vy = Math.sin(a) * 0.85; }
      else { e.heard.t = Math.min(e.heard.t, 2.5); e.fa += dt * 1.5; }
      if (e.heard.t <= 0) { e.heard = null; e.heardField = null; }
    } else if (safe && d < SAFE_LEAVE.near * T && (e.leaveCd || 0) <= 0) {
      leaveSafeDoor(e, p);   // 在安全屋门口晃悠的也会走开（不会堵门）
    } else {
      e.wT -= dt; if (e.wT <= 0) { e.wT = rand(2, 5); e.wa = rand(Math.PI * 2); e.moving = Math.random() < 0.5; }
      if (e.moving) { vx = Math.cos(e.wa) * 0.35; vy = Math.sin(e.wa) * 0.35; }
    }
    if (e.t === 'zombie') sp *= 0.8 + 0.4 * Math.abs(Math.sin(e.ph * 2.2)); // 蹒跚
    if (e.t === 'crawler') { sp *= 0.5 + 0.9 * Math.max(0, Math.sin(e.ph * 3)); if ((vx || vy) && Math.random() < dt * 2) decals.push({ x: e.x - Math.cos(e.fa) * 12, y: e.y - Math.sin(e.fa) * 12, r: rand(3, 6), rot: 0, a: 0.5 }); }   // 一下一下往前拖，身后留血痕
    if (vx || vy) {
      const ox = e.x, oy = e.y;
      moveEnt(e, vx * sp * dt, vy * sp * dt);
      e.fa += angDiff(e.fa, Math.atan2(vy, vx)) * Math.min(1, dt * 5);
      // 安全屋阻挡：任何敌人都不能进入，且会取消已开始的攻击。
      if (inSafeTile(e.x, e.y)) { e.x = ox; e.y = oy; e.state = 'chase'; e.atkT = 0; }
    }
}

// ---------------------------------------------------------------- 不堵安全屋的门
// 玩家在安全屋里时，门外的敌人放弃目标，走到离安全屋 far 格以外的地方再游荡 —— 出门时不会一开门就撞上一群
const SAFE_LEAVE = { near: 8, far: [10, 16], t: 14, cd: 6 };
function leaveSafeDoor(e, p) {
  e.leaveCd = SAFE_LEAVE.cd;
  const ex = Math.floor(e.x / T), ey = Math.floor(e.y / T);
  for (let k = 0; k < 40; k++) {
    const a = rand(6.283), r = rand(SAFE_LEAVE.far[0], SAFE_LEAVE.far[1]);
    const tx = Math.floor(p.x / T + Math.cos(a) * r), ty = Math.floor(p.y / T + Math.sin(a) * r);
    if (tx < 1 || ty < 1 || tx >= MW - 1 || ty >= MH - 1 || solidT(tx, ty) || grid[ty * MW + tx] !== 1) continue;
    const x = (tx + .5) * T, y = (ty + .5) * T;
    if (inSafeTile(x, y)) continue;
    const f = noiseField(x, y, SAFE_LEAVE.far[1] + 12);
    if (f[ey * MW + ex] < 0) continue;   // 走不过去
    e.heard = { x, y, t: SAFE_LEAVE.t, label: 'leave' }; e.heardField = f; e.state = 'idle';
    return true;
  }
  // 找不到合适的地方：至少别站在门口 —— 朝远离玩家的方向慢慢走
  e.heard = null; e.heardField = null; e.wa = Math.atan2(e.y - p.y, e.x - p.x); e.moving = true; e.wT = 4;
  return false;
}

// 敌人之间、敌人与玩家之间互相推开
function separateEntities() {
  const p = S.p;
  const al = S.enemies.filter(e => !e.dead);
  for (let i = 0; i < al.length; i++) {
    const a = al[i];
    for (let j = i + 1; j < al.length; j++) {
      const b = al[j], dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy), m = a.r + b.r;
      if (!(d < m && d > 0.01)) continue;
      const nx = dx / d, ny = dy / d;
      // 处刑者不会被挡住：挡路的僵尸被它整个推开，并踉跄一下（计划 3.2“推开”）
      if (a.t === 'boss' || b.t === 'boss') {
        const o = a.t === 'boss' ? b : a, s = a.t === 'boss' ? 1 : -1;
        pushEnemy(o, s * nx * (m - d), s * ny * (m - d));
        if (m - d > 1 && !(o.stag > 0)) o.stag = EXEC.trample;  // 每帧都会分开，所以重叠只有 1–2 像素
        continue;
      }
      const o = (m - d) / 2; pushEnemy(a, -nx * o, -ny * o); pushEnemy(b, nx * o, ny * o);
    }
    const dx = a.x - p.x, dy = a.y - p.y, d = Math.hypot(dx, dy), m = a.r + p.r;
    if (d < m && d > 0.01) pushEnemy(a, dx / d * (m - d), dy / d * (m - d));
  }
}

// ---------------------------------------------------------------- 爬行者
// 死掉的僵尸「复活」成爬行者：原地、原朝向，仍然趴着装死。玩家要走近才会复活（远处的保持死亡）
function tryReviveCrawler(e) {
  const d = dist(e.x, e.y, S.p.x, S.p.y);
  if (d > CRAWLER.reviveDist * T || inSafe()) return;
  const c = mkEnemy('crawler', 0, 0);
  Object.assign(e, { t: 'crawler', dead: false, deadT: 0, revive: 0, hp: c.hp, maxhp: c.hp, r: c.r, spd: c.spd, sight: c.sight, dmg: c.dmg, reach: c.reach,
    state: 'lurk', alert: false, stag: 0, atkT: 0, twitchT: rand(0.5, 1.5), heard: null, heardField: null });
}
// 装死：不动、不出声，只偶尔抽一下手指。玩家踩到跟前、或者它挨了打，就暴起抓脚踝
function updateLurk(e, dt, safe) {
  e.twitchT -= dt; if (e.twitchT <= 0) { e.twitchT = rand(CRAWLER.twitch[0], CRAWLER.twitch[1]); e.twitch = 0.35; }
  if (e.twitch > 0) e.twitch -= dt;
  const d = dist(e.x, e.y, S.p.x, S.p.y);
  if (e.alert || (!safe && d < CRAWLER.wakeDist)) {
    e.state = 'attack'; e.atkT = EDEF.crawler.windup; e.alert = true; e.lastSeen = { x: S.p.x, y: S.p.y };
    e.fa = Math.atan2(S.p.y - e.y, S.p.x - e.x);
    groanAt(e.x, e.y, 1, false, 700, 0.3, 'attack'); shake = Math.max(shake, 3);   // 装死的爬行者扑起来：嘶吼
  }
}
