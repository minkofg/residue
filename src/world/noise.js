'use strict';
// 噪音传播（BFS）与敌人听觉

// 噪音从声源向外传播：半径单位是“格”，每走一格 -1，穿过关着的门时剩余半径减半。
// 听到噪音的敌人不会“知道玩家在哪”，只会前往声源调查（e.heard），看见玩家才转入追击。
// 队列容量要留余量：「穿过关着的门剩余半径减半」破坏了单调性，同一个格子可以被**重新入队**
// （先从门那边传来一个小值，之后从绕路方向传来更大的值）。按格子数分配会在复杂门结构 + 大半径时溢出，
// 而 TypedArray 越界写入是**静默丢弃**的：随后会读到 undefined → 索引变成 NaN → 噪音场悄悄算错且不报错。
// 所以给 4 倍余量，并在末尾加哨兵：真的溢出时宁可少传一点，也要在控制台说出来。
const noiseQ = new Int32Array(GRID_CAP * 4);
function noiseField(x, y, radius) {
  const field = new Int16Array(MW * MH); field.fill(-1);
  if (radius <= 0) return field;
  const sx = clamp(Math.floor(x / T), 0, MW - 1), sy = clamp(Math.floor(y / T), 0, MH - 1);
  let h = 0, t = 0; field[sy * MW + sx] = radius; noiseQ[t++] = sy * MW + sx;
  while (h < t) {
    const c = noiseQ[h++], cx = c % MW, cy = (c / MW) | 0, b = field[c];
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = cx + dx, ny = cy + dy;
      if (nx < 0 || ny < 0 || nx >= MW || ny >= MH) continue;
      const v = grid[ny * MW + nx];
      if (v === 0 || v === 3 || v === 4) continue;
      let nb = b - 1;
      if (v === 2 && !isDoorOpen(nx, ny)) nb = Math.floor(nb / 2);
      const ni = ny * MW + nx;
      if (nb > 0 && nb > field[ni]) {
        field[ni] = nb;
        if (t >= noiseQ.length) { console.warn(`噪音传播队列溢出（半径 ${radius}，容量 ${noiseQ.length}）：本次结果可能不完整`); return field; }
        noiseQ[t++] = ni;
      }
    }
  }
  return field;
}
function emitNoise(x, y, radius, label = '', source = null) {
  if (radius <= 0) return 0;
  const field = noiseField(x, y, radius);
  let heardBy = 0;
  for (const e of S.enemies) {
    if (e.dead || e === source) continue;
    const idx = Math.floor(e.y / T) * MW + Math.floor(e.x / T);
    if (field[idx] < 0) continue;
    heardBy++;
    if (e.t === 'licker') { lickerHear(e, x, y, label, radius); continue; }   // 舔舐者：追着声音走，即使已经在追
    if (e.t === 'boss' && !(S.executioner && S.executioner.active)) continue;
    // 已经在追击的敌人不需要调查；其余敌人记录声源并前往。
    if (!e.alert) { e.heard = { x, y, t: 10, label }; e.heardField = field; }
  }
  return heardBy;
}
// 沿噪音场的梯度走向声源（数值越大越靠近）
function noiseNext(e) {
  const f = e.heardField; if (!f) return null;
  const tx = Math.floor(e.x / T), ty = Math.floor(e.y / T), cur = f[ty * MW + tx];
  if (cur < 0) return null;
  let best = cur, bx = -1, by = -1;
  for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
    const nx = tx + dx, ny = ty + dy; if (!passT(nx, ny)) continue;
    const v = f[ny * MW + nx]; if (v > best) { best = v; bx = nx; by = ny; }
  }
  return bx < 0 ? null : [(bx + .5) * T, (by + .5) * T];
}
