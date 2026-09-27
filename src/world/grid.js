'use strict';
// 地图网格、格子常量、门的开关状态

// ---------------------------------------------------------------- 地图
// 网格尺寸是**每张地图各自**的（计划 §4：地图 1 精修后扩到 80×64）。
//   · MAX_MW / MAX_MH 是所有地图的上限，全部定长数组按它一次性分配，切换地图不再重新分配
//   · MW / MH 是**当前地图**的尺寸，由 useLevel() → setMapSize() 设置
// 索引一律是 y * MW + x（用当前 MW），所以数组里超出当前地图的那部分就是闲置内存。
// 遍历整张图时必须用 MW / MH，绝对不要用数组的 .length（那是上限，不是当前尺寸）。
const T = 48, MAX_MW = 96, MAX_MH = 80;
const GRID_CAP = MAX_MW * MAX_MH;
let MW = 64, MH = 48;
const grid = new Uint8Array(GRID_CAP);     // 0墙 1地板 2门 3锁门 4家具
const roomAt = new Int16Array(GRID_CAP);
const doorSafe = new Uint8Array(GRID_CAP); // 1 = 通往安全屋的门（任何怪物都打不开、撞不开）
// 切换地图时设置当前网格尺寸。超过上限直接报错，不要静默截断
function setMapSize(w = 64, h = 48) {
  if (!Number.isInteger(w) || !Number.isInteger(h) || w < 8 || h < 8 || w > MAX_MW || h > MAX_MH) {
    throw new Error(`地图尺寸 ${w}×${h} 非法（上限 ${MAX_MW}×${MAX_MH}，见 world/grid.js）`);
  }
  MW = w; MH = h;
}
const SAVE_VERSION = 5;  // v3：背包改为格子 + 道具箱；v4：事件改为触发器 + 多地图状态；v5：背包不限格数、取消道具箱（旧存档箱子里的东西放进背包）
const doorKey = (x, y) => `${x},${y}`;
function isDoor(tx, ty) { return grid[ty * MW + tx] === 2 || grid[ty * MW + tx] === 3; }
function isDoorOpen(tx, ty) { return !!(S && S.doors && S.doors[doorKey(tx, ty)]); }
function setDoorOpen(tx, ty, open) { if (!S.doors) S.doors = {}; S.doors[doorKey(tx, ty)] = !!open; }
