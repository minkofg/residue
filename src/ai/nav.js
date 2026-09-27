'use strict';
// 流场寻路：三套寻路层（A 处刑者 / B 僵尸 / C 狗），以及自动开门

// ---------------------------------------------------------------- 流场寻路
// 带权最短路（Dijkstra + 二叉堆）：走一格代价 1，经过关着的门再加 NAV_DOOR_COST[层]。
// 80×64 的完整地图也只有 5120 格，三层每秒各算 4 次开销很小。
const navHeapN = new Int32Array(GRID_CAP * 4), navHeapC = new Int32Array(GRID_CAP * 4);
let navHeapLen = 0;
function navPush(n, c) {
  let i = navHeapLen++;
  while (i > 0) { const pi = (i - 1) >> 1; if (navHeapC[pi] <= c) break; navHeapN[i] = navHeapN[pi]; navHeapC[i] = navHeapC[pi]; i = pi; }
  navHeapN[i] = n; navHeapC[i] = c;
}
function navPop() {
  const top = navHeapN[0], last = --navHeapLen, ln = navHeapN[last], lc = navHeapC[last];
  let i = 0;
  for (;;) {
    let c = 2 * i + 1; if (c >= last) break;
    if (c + 1 < last && navHeapC[c + 1] < navHeapC[c]) c++;
    if (navHeapC[c] >= lc) break;
    navHeapN[i] = navHeapN[c]; navHeapC[i] = navHeapC[c]; i = c;
  }
  navHeapN[i] = ln; navHeapC[i] = lc;
  return top;
}

function navLayerOf(e) { return (EDEF[e.t] && EDEF[e.t].nav) || 'C'; }
function flowOf(layer) { return layer === 'A' ? flowExec : layer === 'B' ? flowB : flow; }
// 兼容旧调用：passFor(x, y, true) = A 层，passFor(x, y) = C 层
function passFor(tx, ty, layer = 'C') {
  if (layer === true) layer = 'A'; else if (layer === false) layer = 'C';
  if (tx < 0 || ty < 0 || tx >= MW || ty >= MH) return false;
  const i = ty * MW + tx, v = grid[i];
  if (v === 1) return true;
  if (v !== 2) return false;                 // 墙、家具、锁着的门
  if (isDoorOpen(tx, ty)) return true;
  if (layer === 'D') return true;            // 导演用的距离层：所有没锁的门都算通（包括安全屋的门），只用来量距离
  return layer !== 'C' && !doorSafe[i];      // 关着的门：A/B 层可以通过（安全屋的门除外）
}
function stepCost(tx, ty, layer) {
  return (grid[ty * MW + tx] === 2 && !isDoorOpen(tx, ty)) ? 1 + NAV_DOOR_COST[layer] : 1;
}
function computeFlow(out = flow, layer = 'C') {
  if (layer === true) layer = 'A'; else if (layer === false) layer = 'C';
  computeFlowFrom(out, layer, Math.floor(S.p.x / T), Math.floor(S.p.y / T));
}
// 从任意格子 (sx, sy) 出发的寻路场。处刑者在“搜索 / 追踪”时只用从噪音地点出发的场，不知道玩家在哪（计划 3.2）
function computeFlowFrom(out, layer, sx, sy) {
  out.fill(-1);
  if (sx < 0 || sy < 0 || sx >= MW || sy >= MH) return;
  const s = sy * MW + sx; out[s] = 0; navHeapLen = 0; navPush(s, 0);
  while (navHeapLen > 0) {
    const cd = navHeapC[0], c = navPop();
    if (cd > out[c]) continue;               // 过期的堆元素
    const cx = c % MW, cy = (c / MW) | 0;
    for (let k = 0; k < 4; k++) {
      const nx = cx + (k === 0 ? 1 : k === 1 ? -1 : 0), ny = cy + (k === 2 ? 1 : k === 3 ? -1 : 0);
      if (!passFor(nx, ny, layer)) continue;
      // 代价按“离开的格子”计算：从门格出来才加门的代价，这样寻路场的方向与“从玩家出发”一致
      const n = ny * MW + nx, nd = cd + stepCost(cx, cy, layer);
      if (out[n] < 0 || nd < out[n]) { out[n] = nd; navPush(n, nd); }
    }
  }
}
function computeAllFlows() { computeFlow(flow, 'C'); computeFlow(flowB, 'B'); computeFlow(flowExec, 'A'); computeFlow(flowDir, 'D'); }

// 四层寻路场原本是**同一帧**全部重算的：平均帧只要 0.08ms，但那一帧要 7ms，
// 尖峰是平均的 89 倍。在性能好的机器上看不出来，在普通笔记本上就是
// 每秒 4 次的规律性顿挫 —— 这种周期性卡顿比整体低帧更难受。
//
// 改成轮流算：每 1/16 秒算一层，四层转一圈仍然是 0.25 秒（刷新率没变），
// 但单帧只承担四分之一的工作。
const FLOW_ORDER = [[() => flow, 'C'], [() => flowB, 'B'], [() => flowExec, 'A'], [() => flowDir, 'D']];
const FLOW_SLICE = 0.25 / FLOW_ORDER.length;
let flowSlot = 0;
function computeFlowSlice() {
  const [get, layer] = FLOW_ORDER[flowSlot];
  computeFlow(get(), layer);
  flowSlot = (flowSlot + 1) % FLOW_ORDER.length;
  return FLOW_SLICE;
}

// 返回下一步要走向的点（世界坐标），到不了返回 null
function flowNext(e) { return flowNextOn(e, flowOf(navLayerOf(e)), S.p.x, S.p.y); }
// 沿寻路场 map 下坡走；已经在终点格时直接走向 (gx, gy)
function flowNextOn(e, map, gx, gy) {
  const layer = navLayerOf(e);
  const tx = Math.floor(e.x / T), ty = Math.floor(e.y / T), cur = map[ty * MW + tx];
  if (cur < 0) return null;
  if (cur === 0) return [gx, gy];
  let best = cur, bx = -1, by = -1;
  for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
    if (!dx && !dy) continue; const nx = tx + dx, ny = ty + dy;
    if (!passFor(nx, ny, layer)) continue;
    if (dx && dy && (!passFor(tx + dx, ty, layer) || !passFor(tx, ty + dy, layer))) continue;
    const v = map[ny * MW + nx]; if (v >= 0 && v < best) { best = v; bx = nx; by = ny; }
  }
  return bx < 0 ? null : [(bx + .5) * T, (by + .5) * T];
}

function autoOpenDoorForExecutioner(e, x, y) {
  const tx = Math.floor(x / T), ty = Math.floor(y / T);
  for (let yy = ty - 1; yy <= ty + 1; yy++) for (let xx = tx - 1; xx <= tx + 1; xx++) {
    if (xx < 0 || yy < 0 || xx >= MW || yy >= MH || grid[yy * MW + xx] !== 2 || isDoorOpen(xx, yy) || doorSafe[yy * MW + xx]) continue;
    if (dist(x, y, (xx + .5) * T, (yy + .5) * T) < T * 0.95) {
      setDoorOpen(xx, yy, true); drawTileAt(xx, yy); emitNoise((xx + .5) * T, (yy + .5) * T, 10, 'executioner-door', e);
      sfxAt('door', (xx + .5) * T, (yy + .5) * T, 1.8, 1600, 0.25); shake = Math.max(shake, 5); flowT = 0; return true;
    }
  }
  return false;
}
function autoOpenDoorOnRun(x, y, mdx = 0, mdy = 0) {
  const tx = Math.floor(x / T), ty = Math.floor(y / T);
  for (let yy = ty - 1; yy <= ty + 1; yy++) for (let xx = tx - 1; xx <= tx + 1; xx++) {
    if (xx < 0 || yy < 0 || xx >= MW || yy >= MH || grid[yy * MW + xx] !== 2 || isDoorOpen(xx, yy)) continue;
    const cx = (xx + .5) * T - x, cy = (yy + .5) * T - y, cl = Math.hypot(cx, cy), ml = Math.hypot(mdx, mdy) || 1;
    if (cl > 1 && (cx * mdx + cy * mdy) / (cl * ml) < 0.7) continue; // 不在前进方向上
    if (dist(x, y, (xx + .5) * T, (yy + .5) * T) < T * 0.9) { setDoorOpen(xx, yy, true); drawTileAt(xx, yy); emitNoise((xx + .5) * T, (yy + .5) * T, 6, 'door-run'); msg('奔跑撞开了门！', 1.5); flowT = 0; return true; }
  }
  return false;
}
