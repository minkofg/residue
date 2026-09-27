'use strict';
// 格子属性查询（墙、遮挡、可通行）与地图构建

function solidT(tx, ty) { if (tx < 0 || ty < 0 || tx >= MW || ty >= MH) return true; const v = grid[ty * MW + tx]; return v === 0 || v === 3 || v === 4 || (v === 2 && !isDoorOpen(tx, ty)); }
function opaqueT(tx, ty) { if (tx < 0 || ty < 0 || tx >= MW || ty >= MH) return true; const v = grid[ty * MW + tx]; return v === 0 || v === 3 || (v === 2 && !isDoorOpen(tx, ty)); }
function passT(tx, ty) { if (tx < 0 || ty < 0 || tx >= MW || ty >= MH) return false; const v = grid[ty * MW + tx]; return v === 1 || (v === 2 && isDoorOpen(tx, ty)); }

function buildMap() {
  grid.fill(0); roomAt.fill(-1);
  ROOMS.forEach((r, i) => { for (let y = r.y; y < r.y + r.h; y++) for (let x = r.x; x < r.x + r.w; x++) { grid[y * MW + x] = 1; roomAt[y * MW + x] = i; } });
  if (!S.doors) S.doors = {};
  for (const [x, y] of DOORS) {
    const k = LOCKS[x + ',' + y];
    grid[y * MW + x] = (k && !S.unlocked.includes(doorKey(x, y))) ? 3 : 2;
    if (!(doorKey(x, y) in S.doors)) S.doors[doorKey(x, y)] = false;
    roomAt[y * MW + x] = -2;
  }
  for (const [x, y, w, h] of FURN) for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) grid[j * MW + i] = 4;
  // 与安全屋相邻的门
  doorSafe.fill(0);
  for (const [x, y] of DOORS) {
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx, ny = y + dy; if (nx < 0 || ny < 0 || nx >= MW || ny >= MH) continue;
      const ri = roomAt[ny * MW + nx]; if (ri >= 0 && ROOMS[ri].safe) doorSafe[y * MW + x] = 1;
    }
  }
}
