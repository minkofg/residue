'use strict';
// 处刑者（追踪形态）AI 与导演系统（计划 3.1–3.6）。参数全部在 config/director.js。
//
// 状态（e.state）：
//   chase      追击：看见了玩家（或刚被打中、刚起身、剧情登场）。直线追赶，或沿“从玩家出发”的 A 层寻路场走；可以冲刺
//   attack/rec 重拳或抓取的前摇 / 收招
//   dash       冲刺：先原地蓄力，再朝固定方向直冲（可以横向躲开）
//   track      追踪：听到噪音、跟丢了、被导演挪过来。沿“从目标点出发”的寻路场走过去 —— 不知道玩家的实际位置
//   search     搜索：环顾 3 秒 → 去一个相邻房间 → 再环顾……
//   guard      守候：玩家躲进安全屋，它走到门外等 8–15 秒，然后转去别处
//   retreat    撤离：导演判定“太紧”，去 15 格以外搜索 30–60 秒，期间不理会声音
//   knockdown  跪地（e.knockdownT > 0）
// 只有 chase 会用到“玩家在哪”（计划 3.2 v3.2 说明）。

const EXRT = { field: new Int16Array(GRID_CAP), key: '', t: -1 };  // 运行时缓存（不存档）：目标点寻路场
const CHASING = { chase: true, attack: true, rec: true, dash: true };

function activeExecutioner() { return S.enemies.find(e => e.t === 'boss' && !e.dead) || null; }
// 玩家现在看得见它吗（在画面里，或者 12 格内视线通畅）。演出要「让它从别处登场」之前先问这个：
// 看得见就不能凭空把它挪走 —— 否则就像有两个处刑者（试玩反馈：打倒它之后上车，演出里它又从闸门冲出来）
function execSeen(e) {
  if (!e) return false;
  const m = T, onScreen = e.x > cam.x - m && e.x < cam.x + W + m && e.y > cam.y - m && e.y < cam.y + H + m;
  return onScreen || (dist(e.x, e.y, S.p.x, S.p.y) < 12 * T && losClear(e.x, e.y, S.p.x, S.p.y));
}
const execDown = e => !!e && (e.knockdownT > 0 || e.frozenT > 0);   // 被打倒 / 冻住
function isChasing(e) { return !!(e && CHASING[e.state]); }
const tileIdx = (x, y) => Math.floor(y / T) * MW + Math.floor(x / T);
// 玩家到 (x, y) 的路径距离（格；D 层：安全屋的门也算通）。到不了 = Infinity
function pathDistTo(x, y) { const v = flowDir[tileIdx(x, y)]; return v < 0 ? Infinity : v; }
function inPuzzleRoom() { const r = curRoom(); return r >= 0 && !!ROOMS[r].puzzle; }

// ---------------------------------------------------------------- 房间与目标点
// 房间相邻关系：两个房间之间有一扇没锁的门就算相邻。安全屋不算（它绝对不进）
function roomAdjacency() {
  const adj = ROOMS.map(() => new Set());
  for (const [x, y] of DOORS) {
    if (grid[y * MW + x] !== 2) continue;
    const rs = [];
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const ri = roomAt[(y + dy) * MW + x + dx]; if (ri >= 0 && !ROOMS[ri].safe && !rs.includes(ri)) rs.push(ri); }
    if (rs.length === 2) { adj[rs[0]].add(rs[1]); adj[rs[1]].add(rs[0]); }
  }
  return adj;
}
function roomOfPos(x, y) {
  const tx = Math.floor(x / T), ty = Math.floor(y / T), ri = roomAt[ty * MW + tx];
  if (ri >= 0) return ri;
  for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const r2 = roomAt[(ty + dy) * MW + tx + dx]; if (r2 >= 0 && !ROOMS[r2].safe) return r2; }
  return -1;
}
// 房间里的一个空地（优先中心，其次离中心最近的空地）
function roomPoint(ri) {
  const r = ROOMS[ri]; if (!r) return null;
  const cx = Math.floor(r.x + r.w / 2), cy = Math.floor(r.y + r.h / 2);
  let best = null, bd = Infinity;
  for (let y = r.y; y < r.y + r.h; y++) for (let x = r.x; x < r.x + r.w; x++) {
    if (grid[y * MW + x] !== 1) continue;
    const d = (x - cx) ** 2 + (y - cy) ** 2; if (d < bd) { bd = d; best = [x, y]; }
  }
  return best ? { x: (best[0] + .5) * T, y: (best[1] + .5) * T } : null;
}
// 下一个要检查的相邻房间。away：选离玩家最远的（撤离时用）
function nextRoomGoal(e, away) {
  const cur = roomOfPos(e.x, e.y);
  if (cur < 0) return null;
  let opts = [...roomAdjacency()[cur]];
  if (opts.length > 1 && e.lastRoom !== undefined) opts = opts.filter(r => r !== e.lastRoom);  // 不马上走回头路
  e.lastRoom = cur;
  if (!opts.length) return roomPoint(cur);
  let pick;
  if (away) pick = opts.reduce((a, b) => { const pa = roomPoint(a), pb = roomPoint(b); return pathDistTo(pb.x, pb.y) > pathDistTo(pa.x, pa.y) ? b : a; });
  else pick = opts[Math.floor(Math.random() * opts.length)];
  return roomPoint(pick);
}
// 满足条件的空地格（玩家看不见、不在安全屋、路径距离在 [minD, maxD]）；prefer(ri) 为真的房间优先
function findSpot(minD, maxD, prefer) {
  const p = S.p, pr = curRoom(), near = [], any = [];
  for (let ty = 1; ty < MH - 1; ty++) for (let tx = 1; tx < MW - 1; tx++) {
    const i = ty * MW + tx; if (grid[i] !== 1) continue;
    const ri = roomAt[i]; if (ri < 0 || ROOMS[ri].safe || ri === pr) continue;
    const v = flowDir[i]; if (v < minD || v > maxD) continue;
    // 周围四格也要是空地：落点不会贴着墙或家具
    if (grid[i + 1] !== 1 || grid[i - 1] !== 1 || grid[i + MW] !== 1 || grid[i - MW] !== 1) continue;
    const x = (tx + .5) * T, y = (ty + .5) * T;
    if (losClear(p.x, p.y, x, y)) continue;
    (prefer && prefer(ri) ? near : any).push({ x, y, ri, d: v });
  }
  const pool = near.length ? near : any;
  return pool.length ? pool[Math.floor(Math.random() * pool.length)] : null;
}
function farthestSpot() {
  let best = null, bv = -1;
  for (let i = 0; i < MW * MH; i++) {
    if (grid[i] !== 1 || roomAt[i] < 0 || ROOMS[roomAt[i]].safe) continue;
    if (flowDir[i] > bv) { bv = flowDir[i]; best = i; }
  }
  return best === null ? null : { x: (best % MW + .5) * T, y: (((best / MW) | 0) + .5) * T, d: bv };
}
function nearestDoor(x, y) {
  let best = null, bd = Infinity;
  for (const [dx, dy] of DOORS) { const d = dist(x, y, (dx + .5) * T, (dy + .5) * T); if (d < bd) { bd = d; best = { x: (dx + .5) * T, y: (dy + .5) * T }; } }
  return best;
}
// 玩家进的那扇安全屋门的门外一格
function safeDoorOutside() {
  const p = S.p; let best = null, bd = Infinity;
  for (const [x, y] of DOORS) {
    if (!doorSafe[y * MW + x]) continue;
    const d = dist(p.x, p.y, (x + .5) * T, (y + .5) * T); if (d >= bd) continue;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const i = (y + dy) * MW + x + dx, ri = roomAt[i];
      if (grid[i] === 1 && ri >= 0 && !ROOMS[ri].safe) { bd = d; best = { x: (x + dx + .5) * T, y: (y + dy + .5) * T, door: { x: (x + .5) * T, y: (y + .5) * T } }; }
    }
  }
  return best;
}
// 从目标点出发的 A 层寻路场（目标变了或每 0.5 秒重算一次：门的开关会改变路线）
function goalFlow(gx, gy) {
  const tx = Math.floor(gx / T), ty = Math.floor(gy / T), key = tx + ',' + ty;
  if (EXRT.key !== key || S.time - EXRT.t > 0.5 || EXRT.t > S.time) { computeFlowFrom(EXRT.field, 'A', tx, ty); EXRT.key = key; EXRT.t = S.time; }
  return EXRT.field;
}

// ---------------------------------------------------------------- 状态切换
function exChase(e) { e.state = 'chase'; e.alert = true; e.lostT = 0; e.goal = null; e.lookT = 0; e.atkT = 0; }
function exTrack(e, x, y) { e.state = 'track'; e.alert = false; e.goal = { x, y }; e.lookT = 0; e.stuckT = 0; e.leaving = false; }
function exSearch(e, look = EXEC.lookAround) { e.state = 'search'; e.alert = false; e.goal = null; e.lookT = look; e.stuckT = 0; }
function exGuard(e) { e.state = 'guard'; e.alert = false; e.atkT = 0; e.lostT = 0; e.goal = safeDoorOutside(); e.guardT = rand(EXEC.guard[0], EXEC.guard[1]); e.stuckT = 0; }
function exRetreat(e) {
  const D = S.executioner, R = DIRECTOR;
  e.state = 'retreat'; e.alert = false; e.lostT = 0; e.lookT = 0; e.stuckT = 0; e.retreatT = rand(R.retreat[0], R.retreat[1]);
  const s = findSpot(R.retreatDist, Infinity) || farthestSpot();
  e.goal = s ? { x: s.x, y: s.y } : null;
  D.chaseT = 0; D.retreats = (D.retreats || 0) + 1;
}
// 守候结束 / 撤离结束：转去离玩家较远的房间搜索
function exGoElsewhere(e) {
  const s = findSpot(10, Infinity) || farthestSpot();
  if (s) { exTrack(e, s.x, s.y); e.leaving = true; } else exSearch(e);   // leaving：守完门去别处，不会又被拉回来守门
}

// ---------------------------------------------------------------- 移动
// 走一步：推开挡路的门、沉重脚步声（立体声，6 格内轻微震屏）、不能进安全屋。返回实际移动的距离
function exWalk(e, vx, vy, sp, dt, dPlayer) {
  const ox = e.x, oy = e.y;
  autoOpenDoorForExecutioner(e, e.x + vx * sp * dt, e.y + vy * sp * dt);
  moveEnt(e, vx * sp * dt, vy * sp * dt);
  if (inSafeTile(e.x, e.y)) { e.x = ox; e.y = oy; }
  e.stepT -= dt * sp / 100;
  if (e.stepT <= 0) {
    // 沉重的脚步：隔着几个房间就能听见（1600 像素），越近越响、画面越震 —— 让人听见它在靠近
    e.stepT = 0.72; e.stepSide = !e.stepSide;
    sfxAt('exstep', e.x, e.y, 1.8, 2000, 0.15);
    if (e.stepSide && Math.random() < 0.35) sfxAt('metal', e.x, e.y, 0.25, 900, 0);   // 身上的铁链 / 大衣上的金属扣
    const k2 = 1 - clamp(dPlayer / (14 * T), 0, 1);
    if (k2 > 0) shake = Math.max(shake, 1.5 + 7 * k2 * k2);
  }
  e.fa += angDiff(e.fa, Math.atan2(vy, vx)) * Math.min(1, dt * 5);
  const moved = Math.hypot(e.x - ox, e.y - oy);
  // 卡住检测：想走但几乎没动
  if (moved < sp * dt * 0.2) e.stuckT = (e.stuckT || 0) + dt; else e.stuckT = Math.max(0, (e.stuckT || 0) - dt);
  return moved;
}
function exWalkTo(e, tx, ty, sp, dt, dPlayer) { const a = Math.atan2(ty - e.y, tx - e.x); return exWalk(e, Math.cos(a), Math.sin(a), sp, dt, dPlayer); }
// 沿目标点寻路场走向 goal。到达返回 'arrived'，到不了或卡住返回 'fail'
function exGoTo(e, g, sp, dt, dPlayer, near = T * 0.8) {
  if (!g) return 'fail';
  if (dist(e.x, e.y, g.x, g.y) < near) return 'arrived';
  const n = flowNextOn(e, goalFlow(g.x, g.y), g.x, g.y);
  if (!n) return 'fail';
  exWalkTo(e, n[0], n[1], sp, dt, dPlayer);
  if (e.stuckT > EXEC.stuck) { e.stuckT = 0; return 'fail'; }
  return 'moving';
}

// ---------------------------------------------------------------- 感知
// 看见：视线距离内、在前方视野角内、中间没有遮挡；贴身时不看方向。玩家在安全屋里时看不见
function exSees(e, d, safe) {
  if (safe) return false;
  const p = S.p;
  if (d < EXEC.closeSense) return true;
  if (d > EXEC.sightDist) return false;
  if (Math.abs(angDiff(e.fa, Math.atan2(p.y - e.y, p.x - e.x))) > EXEC.fov * Math.PI / 360) return false;
  return losClear(e.x, e.y, p.x, p.y);
}

// ---------------------------------------------------------------- 每帧更新
function freezeExecutioner(e) {
  e.frozenT = LN2.freeze; e.state = 'frozen'; e.alert = false; e.atkT = 0; e.dashT = 0; e.stag = 0;
  cryAt('executioner', 'pain', e.x, e.y, 0.8, 2400, 0.2); shake = Math.max(shake, 14);
}
function updateExecutioner(e, dt, safe) {
  const p = S.p, D = S.executioner;
  // 被液氮冻住：一动不动；时间到破冰，直接追踪玩家当前位置（计划 3.x：环境击倒，不计入打倒阈值）
  if (e.frozenT > 0) {
    e.frozenT -= dt; e.state = 'frozen';
    if (e.frozenT < 4 && Math.random() < dt * 3) sfxAt('bash', e.x, e.y, 0.25, 900);   // 冰层开裂
    if (e.frozenT <= 0) {
      e.frozenT = 0; exTrack(e, p.x, p.y);
      if (D) D.protectT = Math.max(D.protectT || 0, 3);
      sfxAt('bash', e.x, e.y, 1.2, 1800); cryAt('executioner', 'roar', e.x, e.y, 1, 2400, 0.2); shake = 16;
      for (let i = 0; i < 24; i++) parts.push({ x: e.x, y: e.y, vx: rand(-160, 160), vy: rand(-160, 160), life: 0.8, max: 0.8, s: rand(3, 6), c: '#cfe6ff' });
      msg('冰层炸开了 —— 它朝你的方向冲了过来！', 3.5);
    }
    return;
  }
  e.ph += dt;
  if (e.knockdownT > 0) {
    e.knockdownT -= dt; e.state = 'knockdown'; e.alert = false; e.atkT = 0;
    if (e.knockdownT <= 0) {
      e.knockdownT = 0; e.stagAcc = 0; e.midStagDone = false; exChase(e);
      D.protectT = Math.max(D.protectT || 0, DIRECTOR.afterKnockdown);
      cryAt('executioner', 'roar', e.x, e.y, 1, 2400, 0.4); msg('沉重的脚步声重新响起……'); shake = 14;
    }
    return;
  }
  if (e.state === 'knockdown' || !e.state || e.state === 'idle') { if (e.alert) exChase(e); else exSearch(e); }  // 刚生成 / 旧存档
  const dx = p.x - e.x, dy = p.y - e.y, d = Math.hypot(dx, dy), ang = Math.atan2(dy, dx);
  // 玩家躲进安全屋：正在追的话走到门外守候
  // （守完门转去别处的那一趟 track 不算 —— 以前这里会立刻又切回守候，处刑者就一直堵在门口）
  if (safe && (CHASING[e.state] || (e.state === 'track' && !e.leaving))) exGuard(e);
  e.groanT -= dt;
  if (e.groanT <= 0) { e.groanT = rand(4, 9); cryAt('executioner', 'growl', e.x, e.y, 1, 1100); }
  if (e.stag > 0) { e.stag -= dt; return; }
  // 感知：看见 → 追击；被打中 / 剧情登场（alert 被外部设为真）→ 追击
  const retreating = e.state === 'retreat';
  const sees = exSees(e, d, safe) && (!retreating || d < DIRECTOR.retreatNotice * T);
  if (sees) { e.lastSeen = { x: p.x, y: p.y }; e.lostT = 0; }
  if ((sees || e.alert) && !CHASING[e.state] && !safe) { if (!e.alert) cryAt('executioner', 'roar', e.x, e.y, 0.8, 1300); exChase(e); }
  // 听觉：搜索 / 追踪 / 守候时听到噪音就去声源（追击中不需要，撤离中不理会，安全屋里的声音不算）
  if (e.heard) {
    const h = e.heard; e.heard = null; e.heardField = null;
    if ((e.state === 'search' || e.state === 'track' || e.state === 'guard') && !inSafeTile(h.x, h.y)) exTrack(e, h.x, h.y);
  }
  switch (e.state) {
    case 'attack': return exAttackStep(e, dt, d, ang, safe);
    case 'rec': e.recT -= dt; if (e.recT <= 0) exChase(e); return;
    case 'dash': return exDashStep(e, dt, d, ang);
    case 'chase': return exChaseStep(e, dt, d, ang, sees, safe);
    case 'track': return exTrackStep(e, dt, d);
    case 'guard': return exGuardStep(e, dt, d);
    case 'retreat': return exRetreatStep(e, dt, d);
    default: return exSearchStep(e, dt, d, false);
  }
}

function exChaseStep(e, dt, d, ang, sees) {
  const p = S.p, X = EXEC;
  if (!sees) {
    e.lostT = (e.lostT || 0) + dt;
    if (e.lostT > X.loseSight) { const ls = e.lastSeen || { x: p.x, y: p.y }; e.lostT = 0; exTrack(e, ls.x, ls.y); return; }
  }
  const direct = sees && walkClear(e.x, e.y, p.x, p.y);
  if (direct && d < e.r + p.r + EDEF.boss.reach * 0.7) { exStartAttack(e); return; }
  // 冲刺：3–7 格、有视线、直线可达；每 6 秒最多判定一次
  e.dashCd = (e.dashCd || 0) - dt;
  if (direct && d >= X.dash.minDist * T && d <= X.dash.maxDist * T && e.dashCd <= 0) {
    e.dashCd = X.dash.every;
    if (Math.random() < X.dash.chance) { e.state = 'dash'; e.dashT = X.dash.tell + X.dash.time; e.dashA = ang; cryAt('executioner', 'roar', e.x, e.y, 1, 1300); return; }
  }
  const n = direct ? [p.x, p.y] : flowNext(e);
  if (n) exWalkTo(e, n[0], n[1], e.spd, dt, d);
}
function exStartAttack(e) {
  const grab = Math.random() < EXEC.grab.chance;
  e.state = 'attack'; e.atk = grab ? 'grab' : 'punch'; e.atkT = grab ? EXEC.grab.windup : EXEC.punch.windup;
  if (grab) sfxAt('grabWarn', e.x, e.y, 1, 900, 0.3); else cryAt('executioner', 'growl', e.x, e.y, 1, 1100);
}
function exAttackStep(e, dt, d, ang, safe) {
  e.atkT -= dt; e.fa += angDiff(e.fa, ang) * Math.min(1, dt * 4);
  if (safe) { exGuard(e); return; }
  if (e.atkT > 0) return;
  const p = S.p, inReach = d < e.r + p.r + EDEF.boss.reach + 6;
  if (e.atk === 'grab') {
    e.state = 'rec'; e.recT = EXEC.grab.rec;
    if (!inReach || P.inv > 0 || mode !== 'play') return;
    if (P.knifeCd <= 0) {
      // 小刀反击挣脱：不受伤，它踉跄；小刀要过一会儿才能再用
      P.knifeCd = EXEC.grab.counterKnifeCd; P.knifeT = KNIFE.swing; P.inv = 0.8;
      sfx('knife'); sfx('hit'); bleed(e.x, e.y, ang + Math.PI, 8, false);
      e.state = 'chase'; e.stag = EXEC.grab.counterStun; S.stats.escapes = (S.stats.escapes || 0) + 1;
      floats.push({ x: e.x, y: e.y - 34, t: '挣脱！', life: 1.2, c: '#9fd8ff' });
      msg('被抓住的一瞬间，你把小刀扎进它的手臂，挣脱了！（小刀需要几秒才能再用）', 3.5);
      return;
    }
    // 手雷 / 闪光弹挣脱（计划 3.1、6.2）：塞进它嘴里 / 怼着脸引爆。手雷的伤害照常计入打倒阈值
    const th = invHas('grenade') ? 'grenade' : invHas('flashbang') ? 'flashbang' : null;
    if (th) {
      invTake(th, 1); P.inv = 1.2; S.stats.escapes = (S.stats.escapes || 0) + 1;
      moveEnt(p, Math.cos(ang + Math.PI) * 50, Math.sin(ang + Math.PI) * 50);
      e.state = 'chase';
      if (th === 'grenade') { msg('你把手雷塞进它嘴里，一脚蹬开 —— 轰！', 3.5); grenadeBlast(e.x + Math.cos(ang + Math.PI) * 10, e.y + Math.sin(ang + Math.PI) * 10); }
      else { msg('你把闪光弹怼在它脸上引爆，趁它看不见挣脱了！', 3.5); flashBurst(e.x, e.y); }
      e.stag = Math.max(e.stag || 0, EXEC.grab.counterStun);
      floats.push({ x: e.x, y: e.y - 34, t: '挣脱！', life: 1.2, c: '#9fd8ff' });
      return;
    }
    hurtPlayer(EXEC.grab.dmg, ang, 'boss'); msg('被处刑者抓住了！', 2);
    return;
  }
  if (inReach) hurtPlayer(EXEC.punch.dmg, ang, 'boss');
  e.state = 'rec'; e.recT = EXEC.punch.rec;
}
function exDashStep(e, dt, d, ang) {
  const X = EXEC.dash, p = S.p;
  e.dashT -= dt;
  if (e.dashT > X.time) { e.fa += angDiff(e.fa, ang) * Math.min(1, dt * 6); e.dashA = e.fa; return; }  // 蓄力：原地转向，方向在起跑时固定
  if (e.dashT <= 0) { e.state = 'rec'; e.recT = 0.5; return; }
  const moved = exWalk(e, Math.cos(e.dashA), Math.sin(e.dashA), X.speed, dt, d);
  if (dist(e.x, e.y, p.x, p.y) < e.r + p.r + 8) { hurtPlayer(X.dmg, e.dashA, 'boss'); e.state = 'rec'; e.recT = EXEC.punch.rec; return; }
  if (moved < X.speed * dt * 0.3) { e.state = 'rec'; e.recT = 0.7; shake = Math.max(shake, 6); sfxAt('bash', e.x, e.y, 0.8, 900); }  // 撞墙
}
function exTrackStep(e, dt, d) {
  const r = exGoTo(e, e.goal, e.spd, dt, d);
  if (r !== 'moving') exSearch(e, r === 'arrived' ? EXEC.lookAround : 1);
}
function exSearchStep(e, dt, d, away) {
  if (e.lookT > 0) {
    e.lookT -= dt; e.fa += dt * 1.6 * (e.id % 2 ? 1 : -1);  // 环顾
    if (e.lookT <= 0) e.goal = nextRoomGoal(e, away);
    return;
  }
  if (!e.goal) e.goal = nextRoomGoal(e, away);
  const r = exGoTo(e, e.goal, e.spd * 0.85, dt, d, T * 0.9);
  if (r !== 'moving') { e.goal = null; e.lookT = r === 'arrived' ? EXEC.lookAround : 1; }
}
function exGuardStep(e, dt, d) {
  const g = e.goal;
  if (g) {
    const r = exGoTo(e, g, e.spd, dt, d, T * 0.6);
    if (r === 'moving') return;
    if (r === 'fail') e.goal = null;   // 走不到门口：原地守候
    else e.fa += angDiff(e.fa, Math.atan2(g.door.y - e.y, g.door.x - e.x)) * Math.min(1, dt * 3);  // 面向门
  }
  e.guardT -= dt;
  if (e.guardT <= 0) exGoElsewhere(e);
}
function exRetreatStep(e, dt, d) {
  e.retreatT -= dt;
  if (e.retreatT <= 0) { exSearch(e); return; }
  if (e.goal && !e.lookT) {
    const r = exGoTo(e, e.goal, e.spd, dt, d);
    if (r !== 'moving') { e.goal = null; e.lookT = EXEC.lookAround; }
    return;
  }
  exSearchStep(e, dt, d, true);  // 到了之后在那一带搜索，每次选离玩家更远的房间
}

// ---------------------------------------------------------------- 导演系统
function updateDirector(dt, e, safe) {
  const D = S.executioner, R = DIRECTOR;
  D.protectT = Math.max(0, (D.protectT || 0) - dt);
  // 离开安全屋 → 宽限期
  if (safe) D.playerSafe = true;
  else if (D.playerSafe) { D.playerSafe = false; D.graceT = EXEC.grace; }
  else if (D.graceT > 0) D.graceT = Math.max(0, D.graceT - dt);
  const pd = pathDistTo(e.x, e.y);
  // 紧张度：越近、追得越久越高（只影响追击音乐）
  const target = clamp(1 - pd / R.tensionNear, 0, 1) * 60 + (CHASING[e.state] ? 15 + Math.min(25, (D.chaseT || 0) / R.tightTime * 25) : 0);
  D.tension = (D.tension || 0) + clamp(target - (D.tension || 0), -R.tensionFall * dt, R.tensionRise * dt);
  // 太紧：连续追击超过 90 秒 → 主动失去目标（跟丢后的短暂追踪不清零）
  if (CHASING[e.state]) { D.chaseT = (D.chaseT || 0) + dt; if (D.chaseT >= R.tightTime) exRetreat(e); }
  else if (e.state !== 'track') D.chaseT = 0;
  // 太松：连续 60 秒离玩家超过 25 格 → 瞬移到玩家看不见的相邻区域。以下情况暂停计时（不清零）
  const paused = safe || D.graceT > 0 || D.protectT > 0 || inPuzzleRoom() || e.knockdownT > 0 || e.frozenT > 0 || CHASING[e.state] || e.state === 'retreat' || e.state === 'guard';
  if (pd <= R.looseDist) D.looseT = 0;
  else if (!paused) { D.looseT = (D.looseT || 0) + dt; if (D.looseT >= R.looseTime) directorTeleport(e); }
}
function directorTeleport(e) {
  const D = S.executioner, R = DIRECTOR, pr = curRoom();
  const adj = pr >= 0 ? roomAdjacency()[pr] : null;
  const s = findSpot(R.teleportMin, R.teleportMax, adj ? ri => adj.has(ri) : null);
  if (!s) { D.looseT = R.looseTime - 5; return false; }  // 没有合适的落点：5 秒后再试
  e.x = s.x; e.y = s.y; e.stuckT = 0; D.looseT = 0; D.teleports = (D.teleports || 0) + 1;
  const door = nearestDoor(s.x, s.y);  // 远处的开门声：玩家能判断它到了哪一带
  if (door) sfxAt('door', door.x, door.y, 1.8, 1600, 0.25);
  // 落地后在这一带搜索（环顾 → 随机检查相邻房间），而不是直接走进玩家的房间：
  // 它“出现在附近”，但不知道玩家的确切位置（计划 3.2：只有追击才知道玩家在哪）
  e.lastRoom = undefined; exSearch(e);
  return true;
}
// 读档保护：它离玩家不到 12 格就挪到 20 格以外看不见的地方；30 秒内不瞬移。防止“读档 → 出门 → 被秒杀”
function execAfterLoad() {
  const D = S.executioner; if (!D) return;
  D.playerSafe = inSafe(); D.graceT = 0; D.looseT = 0; D.chaseT = 0; D.protectT = DIRECTOR.loadProtect;
  const e = activeExecutioner(); if (!e) return;
  computeAllFlows();
  e.heard = null; e.heardField = null; e.atkT = 0; e.stag = 0; e.lastSeen = null;
  if (e.knockdownT <= 0) exSearch(e);
  if (pathDistTo(e.x, e.y) < DIRECTOR.loadNear) {
    const s = findSpot(DIRECTOR.loadFar, DIRECTOR.loadFar + 12) || findSpot(DIRECTOR.loadFar, Infinity) || farthestSpot();
    if (s) { e.x = s.x; e.y = s.y; }
  }
}

// ---------------------------------------------------------------- 换地图跟随（计划 3.6）
// 离开地图时调用（swapLevel 里、切换之前）：目标地图有剧情入口（execEntry）就跟过去，否则留在原地图
function execBeforeLeave(toId) {
  const D = S.executioner; if (!D || !D.active) return;
  if (!LEVELS[toId] || !LEVELS[toId].execEntry) return;
  const e = activeExecutioner();
  // 它一旦登场就一直跟着玩家：即使此刻不在这张图里（还在路上 / 被冻着 / 倒地），也照样跟到下一张图
  if (!e && D.follow && D.follow.map === toId) return;
  const R = DIRECTOR, [a, b] = e && (CHASING[e.state] || e.state === 'track') ? R.followChased : R.follow;
  if (e) S.enemies = S.enemies.filter(x => x !== e);
  D.follow = { map: toId, left: rand(a, b) };
}
// 每帧：玩家在目标地图里，喘息时间走完就从入口登场（巨响、震屏、全图都能听见）
function updateFollow(dt) {
  const D = S.executioner, f = D && D.follow;
  if (!f || f.map !== S.map || !LEVEL.execEntry) return;
  f.left -= dt; if (f.left > 0) return;
  const en = LEVEL.execEntry, b = mkEnemy('boss', en.x, en.y);
  D.follow = null; D.map = S.map; D.protectT = Math.max(D.protectT || 0, 10);
  S.enemies.push(b);
  cryAt('executioner', 'roar', b.x, b.y, 1, 4000, 0.6); sfxAt('bash', b.x, b.y, 1.5, 4000, 0.5); shake = 25;
  msg(en.msg || '远处一声巨响——它跟来了。', 4.5);
  const pr = curRoom(), g = pr >= 0 ? roomPoint(pr) : null;
  exTrack(b, g ? g.x : S.p.x, g ? g.y : S.p.y);
}
