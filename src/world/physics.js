'use strict';
// 射线、视线/直线可达判断、碰撞与移动

// ---------------------------------------------------------------- 射线
function ray(x, y, a, max, block) {
  const dx = Math.cos(a), dy = Math.sin(a);
  const px = x / T, py = y / T;
  let mx = Math.floor(px), my = Math.floor(py);
  const ddx = dx === 0 ? 1e30 : Math.abs(1 / dx), ddy = dy === 0 ? 1e30 : Math.abs(1 / dy);
  const sx = dx < 0 ? -1 : 1, sy = dy < 0 ? -1 : 1;
  let sdx = dx < 0 ? (px - mx) * ddx : (mx + 1 - px) * ddx;
  let sdy = dy < 0 ? (py - my) * ddy : (my + 1 - py) * ddy;
  const maxT = max / T;
  for (let n = 0; n < 200; n++) {
    let d;
    if (sdx < sdy) { d = sdx; sdx += ddx; mx += sx; } else { d = sdy; sdy += ddy; my += sy; }
    if (d > maxT) return max;
    if (block(mx, my)) return d * T;
  }
  return max;
}
const losClear = (x1, y1, x2, y2) => { const d = dist(x1, y1, x2, y2); return ray(x1, y1, Math.atan2(y2 - y1, x2 - x1), d, opaqueT) >= d - 1; };
const walkClear = (x1, y1, x2, y2) => { const d = dist(x1, y1, x2, y2); return ray(x1, y1, Math.atan2(y2 - y1, x2 - x1), d, solidT) >= d - 1; };

// ---------------------------------------------------------------- 碰撞
function collide(e) {
  const r = e.r;
  for (let pass = 0; pass < 3; pass++) {
    const x0 = Math.floor((e.x - r) / T), x1 = Math.floor((e.x + r) / T), y0 = Math.floor((e.y - r) / T), y1 = Math.floor((e.y + r) / T);
    let fixed = false;
    for (let ty = y0; ty <= y1; ty++) for (let tx = x0; tx <= x1; tx++) {
      if (!solidT(tx, ty)) continue;
      const nx = clamp(e.x, tx * T, tx * T + T), ny = clamp(e.y, ty * T, ty * T + T);
      let dx = e.x - nx, dy = e.y - ny, d = Math.hypot(dx, dy);
      if (d < r) {
        if (d > 0.0001) { e.x += dx / d * (r - d + 0.05); e.y += dy / d * (r - d + 0.05); }
        else {
          const left = e.x - tx * T, right = tx * T + T - e.x, top = e.y - ty * T, bottom = ty * T + T - e.y;
          const m = Math.min(left, right, top, bottom);
          if (m === left) e.x = tx * T - r - 0.05; else if (m === right) e.x = tx * T + T + r + 0.05; else if (m === top) e.y = ty * T - r - 0.05; else e.y = ty * T + T + r + 0.05;
        }
        fixed = true;
      }
    }
    if (!fixed) break;
  }
}
function moveEnt(e, dx, dy) {
  const n = Math.max(1, Math.ceil(Math.max(Math.abs(dx), Math.abs(dy)) / 8));
  for (let i = 0; i < n; i++) { e.x += dx / n; collide(e); e.y += dy / n; collide(e); }
}
