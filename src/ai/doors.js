'use strict';
// 僵尸拍门（B 层寻路）：正在追击的僵尸沿寻路走到关着的门前会拍门，
// 累计 DOOR_BASH_TIME 秒后把门撞开。进度保存在 S.doorBash（写进存档，不会自行恢复）。
// 只有“追击”状态的僵尸会拍门；只是听到声音来调查的僵尸会在门口停下，找不到人就离开。

// n：flowNext 给出的下一步。如果下一步是一扇关着、可以撞的门，而且僵尸已经贴到门上，返回门的格子坐标
function doorBashTarget(e, n) {
  if (!n || navLayerOf(e) !== 'B') return null;
  const tx = Math.floor(n[0] / T), ty = Math.floor(n[1] / T);
  if (tx < 0 || ty < 0 || tx >= MW || ty >= MH) return null;
  const i = ty * MW + tx;
  if (grid[i] !== 2 || isDoorOpen(tx, ty) || doorSafe[i]) return null;
  if (dist(e.x, e.y, (tx + .5) * T, (ty + .5) * T) > T * 0.5 + e.r + 8) return null;
  return [tx, ty];
}

// 拍门中的僵尸“知道”玩家在门后：玩家离门不超过 DOOR_BASH_GIVEUP 格（B 层路径代价）时，记忆计时暂停
function bashKeepsTarget(e) {
  if (e.state !== 'bash') return false;
  const v = flowB[Math.floor(e.y / T) * MW + Math.floor(e.x / T)];
  return v >= 0 && v <= DOOR_BASH_GIVEUP + NAV_DOOR_COST.B + 1;
}

function doorBashProgress(tx, ty) { return (S.doorBash && S.doorBash[doorKey(tx, ty)]) || 0; }

// d：僵尸到玩家的距离（用来决定音量和提示）
function bashDoor(e, tx, ty, dt, d) {
  if (!S.doorBash) S.doorBash = {};
  const k = doorKey(tx, ty), cx = (tx + .5) * T, cy = (ty + .5) * T;
  const prev = S.doorBash[k] || 0, now = prev + dt;
  S.doorBash[k] = now;
  e.moving = false; e.state = 'bash';
  e.fa += angDiff(e.fa, Math.atan2(cy - e.y, cx - e.x)) * Math.min(1, dt * 6);
  if (prev === 0 && d < 12 * T) msg('门外传来沉闷的撞门声……', 3);
  e.bashT = (e.bashT || 0) - dt;
  if (e.bashT <= 0) {
    e.bashT = rand(0.8, 1.1);
    sfxAt('bash', e.x, e.y, 1, 750, 0.08); // 声源用撞门者的位置：和它同侧听得清，隔着门就发闷
    if (d < 4 * T) shake = Math.max(shake, 2);
    emitNoise(cx, cy, DOOR_BASH_NOISE, 'door-bash', e);
  }
  if (now >= DOOR_BASH_TIME) breakDoor(tx, ty, e, d);
}

function breakDoor(tx, ty, e, d) {
  const cx = (tx + .5) * T, cy = (ty + .5) * T;
  delete S.doorBash[doorKey(tx, ty)];
  setDoorOpen(tx, ty, true); drawTileAt(tx, ty);
  sfxAt('bash', cx, cy, 1, 1000, 0.1); sfxAt('door', cx, cy, 1.6, 1000, 0.1);
  emitNoise(cx, cy, DOOR_BREAK_NOISE, 'door-break', e);
  if (d < 12 * T) { msg('门被撞开了！', 2.5); shake = Math.max(shake, 5); }
  for (let i = 0; i < 8; i++) { const life = rand(0.4, 0.9); parts.push({ t: 'dust', x: cx + rand(-14, 14), y: cy + rand(-14, 14), vx: rand(-60, 60), vy: rand(-60, 60), life, max: life, s: rand(2, 4), c: '#6b5a44' }); }
  e.state = 'chase'; e.bashT = 0;
  computeAllFlows(); flowT = 0.25; // 门的状态变了：寻路必须立刻全部重算，不能等轮转（否则怪会撞着刚关上的门走）
}

// 门上的撞击痕迹（每帧绘制在地图之上）
function drawDoorDamage() {
  if (!S.doorBash) return;
  for (const k in S.doorBash) {
    const v = S.doorBash[k]; if (!(v > 0)) continue;
    const [tx, ty] = k.split(',').map(Number);
    if (isDoorOpen(tx, ty)) continue;
    const x = tx * T, y = ty * T, f = clamp(v / DOOR_BASH_TIME, 0, 1);
    ctx.save(); ctx.translate(x + T / 2, y + T / 2);
    ctx.strokeStyle = `rgba(20,10,5,${0.35 + f * 0.5})`; ctx.lineWidth = 1.5;
    const n = 1 + Math.floor(f * 6);
    for (let i = 0; i < n; i++) {
      const a = hash(tx * 7 + i, ty * 13 + i) * Math.PI * 2, l = 6 + f * 16;
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(Math.cos(a) * l, Math.sin(a) * l); ctx.lineTo(Math.cos(a + 0.4) * l * 1.2, Math.sin(a + 0.4) * l * 1.2); ctx.stroke();
    }
    ctx.restore();
  }
}
