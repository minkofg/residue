'use strict';
// 地图数据体检（计划附录 D：「check-maps.js：钥匙流程走得通；物件不在墙里；穿门怪物的半径 ≤ 21」）
//
// 手写地图数据时必然会犯的错误，靠试玩极难发现，这里全部自动查出来：
//   1. 房间越界 / 房间互相重叠
//   2. 门没有贴在两个房间之间（门必须连通恰好 2 个不同的房间）
//   3. 道具、敌人、出生点、出口、打字机、道具箱、处刑者入口摆在墙里或家具里
//   4. 家具把房间切断，或者把门堵死
//   5. 钥匙流程走不通：从出生点出发，反复「走到能走到的地方 → 捡到的钥匙开新门」，
//      最后必须能拿到所有钥匙、开到所有锁、走到出口（这是最重要的一条）
//   6. 穿门的怪物碰撞半径 > 21（门宽 48 的一半减 3），会像 demo 里的处刑者一样卡住
//   7. 地图尺寸超过 MAX_MW / MAX_MH
//
// 用法：node tools/check-maps.js [地图id...]      默认检查全部地图
// 退出码非 0 表示有错误（警告不影响退出码）。

const { R } = require('./harness');

const T = 48;
const problems = [];
const warnings = [];
const err = (map, msg) => problems.push(`✗ [${map}] ${msg}`);
const warn = (map, msg) => warnings.push(`· [${map}] ${msg}`);

const tileOf = (x, y) => R.grid[y * R.MW + x];
const inBounds = (x, y) => x >= 0 && y >= 0 && x < R.MW && y < R.MH;
const NAMES = { 0: '墙', 1: '地板', 2: '门', 3: '锁着的门', 4: '家具' };
// 实体能站的格子：地板或门
const standable = (x, y) => inBounds(x, y) && (tileOf(x, y) === 1 || tileOf(x, y) === 2 || tileOf(x, y) === 3);

// 把像素坐标或格坐标统一成格坐标
const toTile = v => Math.floor(v);

function checkLevel(id) {
  const L = R.LEVELS[id];
  if (!L) { err(id, '这张地图不存在'); return; }

  // ---- 0. 尺寸 ----
  const w = L.w || 64, h = L.h || 48;
  if (w > R.MAX_MW || h > R.MAX_MH) {
    err(id, `地图尺寸 ${w}×${h} 超过上限 ${R.MAX_MW}×${R.MAX_MH}（改 world/grid.js 的 MAX_MW / MAX_MH）`);
    return;
  }

  // 用引擎自己的 buildMap 把网格铺出来，保证和运行时完全一致
  R.S = R.newState();
  R.S.map = id;
  R.useLevel(id);
  R.S.unlocked = [];
  Object.assign(R.S, R.freshLevelState(id));
  R.buildMap();

  const rooms = L.rooms || [];

  // ---- 1. 房间越界与重叠 ----
  rooms.forEach((r, i) => {
    if (r.x < 1 || r.y < 1 || r.x + r.w > w - 1 || r.y + r.h > h - 1) {
      err(id, `房间「${r.name || r.id}」越界：(${r.x},${r.y}) ${r.w}×${r.h}，地图是 ${w}×${h}（四周要留 1 格墙）`);
    }
    for (let j = i + 1; j < rooms.length; j++) {
      const q = rooms[j];
      const ox = Math.min(r.x + r.w, q.x + q.w) - Math.max(r.x, q.x);
      const oy = Math.min(r.y + r.h, q.y + q.h) - Math.max(r.y, q.y);
      if (ox > 0 && oy > 0) {
        // 1 格宽的接缝通常是故意让两个房间直接相通（例如后廊↔后庭院），不算错
        const seam = Math.min(ox, oy) === 1;
        (seam ? warn : err)(id, `房间「${r.name || r.id}」和「${q.name || q.id}」重叠 ${ox}×${oy} 格${seam ? '（1 格接缝，应该是故意让它们相通）' : ''}`);
      }
    }
  });

  // ---- 2. 门必须连通恰好两个不同房间 ----
  for (const [dx, dy] of (L.doors || [])) {
    if (!inBounds(dx, dy)) { err(id, `门 (${dx},${dy}) 在地图外`); continue; }
    const around = [[1, 0], [-1, 0], [0, 1], [0, -1]]
      .map(([ax, ay]) => R.roomAt[(dy + ay) * R.MW + dx + ax])
      .filter(v => v >= 0);
    const uniq = [...new Set(around)];
    if (uniq.length === 0) err(id, `门 (${dx},${dy}) 两边都不是房间，这扇门通向虚空`);
    else if (uniq.length === 1) warn(id, `门 (${dx},${dy}) 只连着一个房间「${rooms[uniq[0]].name || uniq[0]}」，可能是摆歪了`);
  }

  // ---- 3. 家具不能堵死门 ----
  for (const [dx, dy] of (L.doors || [])) {
    if (!inBounds(dx, dy)) continue;
    const open = [[1, 0], [-1, 0], [0, 1], [0, -1]].filter(([ax, ay]) => standable(dx + ax, dy + ay) || tileOf(dx + ax, dy + ay) === 1);
    if (open.length < 2) err(id, `门 (${dx},${dy}) 被堵死了（周围只有 ${open.length} 个能走的格子，多半是家具压上去了）`);
  }

  // ---- 4. 所有摆放物不能在墙里 ----
  // 摆在家具上是合法的（打字机在书桌上、钥匙在柜子上），只要旁边站得住、够得着。
  // 摆在墙里则一定是错的。
  // bust/plate 这类机关道具本来就是长在家具上的（半身像叠在 furn 的 'bust' 底座上），必须放行
  const ON_FURNITURE_OK = new Set(['typewriter', 'file', 'key', 'spray', 'shotgun', 'bust', 'plate']);
  const spot = (label, px, py, asTile, kind) => {
    const tx = asTile ? toTile(px) : Math.floor(px / T);
    const ty = asTile ? toTile(py) : Math.floor(py / T);
    if (!inBounds(tx, ty)) { err(id, `${label} 在地图外：格 (${tx},${ty})`); return; }
    const v = tileOf(tx, ty);
    if (v === 1 || v === 2 || v === 3) return;                      // 站得上去，没问题
    if (v === 4 && ON_FURNITURE_OK.has(kind)) {                     // 摆在家具上：要有相邻的可站格
      const ok = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([ax, ay]) => standable(tx + ax, ty + ay));
      if (!ok) err(id, `${label} 摆在家具上，但四周都站不住，够不着：格 (${tx},${ty})`);
      return;
    }
    err(id, `${label} 摆在${NAMES[v]}里：格 (${tx},${ty})`);
  };
  if (L.start) spot('出生点', L.start.x, L.start.y, true);
  for (const it of (L.items || [])) spot(`道具 ${ITEMNAME(it)}`, it[1], it[2], true, it[0]);
  for (const e of (L.enemies || [])) spot(`敌人 ${e[0]}`, e[1], e[2], true);
  for (const x of (L.exits || [])) spot(`出口 → ${x.to}`, x.x, x.y, true);
  if (L.execEntry) spot('处刑者入口 execEntry', L.execEntry.x, L.execEntry.y, true);
  if (L.pad) spot('停机坪 pad', L.pad.x, L.pad.y, true);

  // ---- 5. 穿门怪物的碰撞半径 ----
  const DOOR_HALF = T / 2 - 3;   // 21
  const used = new Set((L.enemies || []).map(e => e[0]));
  if (L.execEntry) used.add('boss');
  for (const a of (L.triggers || [])) {
    for (const act of (a.do || [])) {
      if (act.spawn) { if (Array.isArray(act.spawn)) for (const s of act.spawn) used.add(Array.isArray(s) ? s[0] : s); else used.add(act.spawn.t); }
      if (act.spawnWave) used.add(act.spawnWave.t);
    }
  }
  for (const t of used) {
    const def = R.EDEF[t];
    if (!def) { err(id, `用到了不存在的敌人类型「${t}」`); continue; }
    const layer = def.nav || 'C';
    if (layer !== 'C' && def.r > DOOR_HALF) {
      err(id, `敌人「${t}」走 ${layer} 层寻路（能过门）但碰撞半径 ${def.r} > ${DOOR_HALF}，会卡在门口（demo 的处刑者就是这样从没进过宅邸）`);
    }
  }

  // ---- 6. 钥匙流程可达性（最重要）----
  keyFlow(id, L);
}

// 道具的显示名：key 和 file 带上具体是哪一把 / 哪一份
const ITEMNAME = it => (it[0] === 'key' || it[0] === 'file' || it[0] === 'herb') && it[3] ? `${it[0]}:${it[3]}` : it[0];
// 道具够不够得着：自己这格可达，或者（摆在家具上时）任一相邻格可达
function itemReachable(reach, it) {
  const ix = Math.floor(it[1]), iy = Math.floor(it[2]);
  if (!inBounds(ix, iy)) return false;
  if (reach[iy * R.MW + ix]) return true;
  if (tileOf(ix, iy) !== 4) return false;
  return [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([ax, ay]) => inBounds(ix + ax, iy + ay) && reach[(iy + ay) * R.MW + ix + ax]);
}

// 从出生点出发做「可达性 + 开锁」的不动点迭代：
// 反复扩张可达区域，把区域内捡得到的钥匙拿上，用钥匙开掉锁着的门，直到不再增长。
// 机关门：不靠钥匙，靠触发器里的 { unlock: [x,y] } 打开（例如画廊半身像谜题开图书室的门）。
// 体检要认得它，否则门后的一整片区域都会被误判成「永远走不到」。
// 规矩是：机关门在「所有机关道具都摸得到」之后才算能过 —— 摸不到就解不开，那才是真卡关。
const PUZZLE_PROPS = new Set(['bust', 'plate']);
function eventUnlockedDoors(L) {
  const out = new Set();
  const walk = list => { for (const a of list || []) { if (Array.isArray(a.unlock)) out.add(a.unlock.join(',')); if (Array.isArray(a.do)) walk(a.do); if (a.countdown && a.countdown.do) walk(a.countdown.do); } };
  for (const t of L.triggers || []) walk(t.do);
  for (const k of Object.keys(L.scripts || {})) walk(L.scripts[k]);
  return out;
}

function keyFlow(id, L) {
  if (!L.start) return;
  const locks = L.locks || {};
  const byEvent = eventUnlockedDoors(L);
  const held = new Set();
  const taken = new Set();
  let propsReady = false;
  let reach = null;

  const flood = () => {
    const seen = new Uint8Array(R.MW * R.MH);
    const q = [Math.floor(L.start.y) * R.MW + Math.floor(L.start.x)];
    seen[q[0]] = 1;
    for (let i = 0; i < q.length; i++) {
      const c = q[i], cx = c % R.MW, cy = (c / R.MW) | 0;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = cx + dx, ny = cy + dy;
        if (!inBounds(nx, ny)) continue;
        const ni = ny * R.MW + nx;
        if (seen[ni]) continue;
        const v = tileOf(nx, ny);
        if (v === 0 || v === 4) continue;                   // 墙、家具
        if (v === 3) {                                       // 锁着的门：手上有钥匙才过
          const pos = `${nx},${ny}`, need = locks[pos];
          if (byEvent.has(pos)) { if (!propsReady) continue; }  // 机关门：机关道具都够得着才算能开
          else if (need && !held.has(need)) continue;
          if (byEvent.has(pos) && R.KEYS[need] && R.KEYS[need].needs && !R.KEYS[need].needs.every(k => held.has(k))) continue;  // 机关门还要先集齐东西（徽章）
        }
        seen[ni] = 1; q.push(ni);
      }
    }
    return seen;
  };

  for (let iter = 0; iter < 32; iter++) {
    reach = flood();
    let grew = false;
    for (const it of (L.items || [])) {
      const [kind, ix, iy] = it;
      const key = `${kind}@${ix},${iy}`;
      if (taken.has(key)) continue;
      if (!itemReachable(reach, it)) continue;
      taken.add(key); grew = true;
      // 钥匙的第 4 个字段就是锁里写的名字：['key', 10, 21, 'sword'] ↔ locks['32,29'] = 'sword'
      if (kind === 'key' && it[3]) held.add(it[3]);
      if (kind === 'safe' && R.SAFES[it[3]] && R.SAFES[it[3]].reward.key) held.add(R.SAFES[it[3]].reward.key);   // 保险柜里的钥匙 / 徽章
    }
    const allProps = (L.items || []).filter(it => PUZZLE_PROPS.has(it[0]));
    const ready = allProps.every(it => itemReachable(reach, it));
    if (ready && !propsReady) { propsReady = true; grew = true; }
    if (!grew) break;
  }

  // 拿不到的道具（摆在家具上的，相邻格可达就算够得着）
  for (const it of (L.items || [])) {
    if (!itemReachable(reach, it)) {
      err(id, `道具「${ITEMNAME(it)}」在 (${it[1]},${it[2]})，从出生点**永远走不到**（被锁死或被墙围住）`);
    }
  }
  // 机关门自己的体检：光在 locks 里写一个假钥匙名是不够的
  for (const pos of Object.keys(locks)) {
    const need = locks[pos];
    const isPuzzleKey = !!(R.KEYS[need] && R.KEYS[need].puzzle);
    if (isPuzzleKey && !byEvent.has(pos)) {
      err(id, `门 (${pos}) 标成了机关闩「${need}」，但没有任何触发器会 unlock 它 → 永远打不开`);
    }
    if (byEvent.has(pos) && !isPuzzleKey && !(L.items || []).some(it => it[0] === 'key' && it[3] === need)) {
      err(id, `门 (${pos}) 由触发器打开，但 KEYS['${need}'] 没标 puzzle:true → 玩家撞门时没有像样的提示`);
    }
  }
  // 开不了的锁
  for (const [pos, need] of Object.entries(locks)) {
    if (byEvent.has(pos)) continue;   // 机关门不靠钥匙
    if (!held.has(need)) {
      err(id, `锁着的门 (${pos}) 需要「${need}」，但这把钥匙在流程里拿不到 → 卡关`);
    }
  }
  // 到不了的出口
  for (const x of (L.exits || [])) {
    if (!reach[Math.floor(x.y) * R.MW + Math.floor(x.x)]) {
      err(id, `出口 → ${x.to} 在 (${x.x},${x.y})，走不到 → 通不了关`);
    }
  }
  // 到不了的房间（只警告：可能是故意的装饰空间）
  const reachedRooms = new Set();
  for (let i = 0; i < R.MW * R.MH; i++) if (reach[i] && R.roomAt[i] >= 0) reachedRooms.add(R.roomAt[i]);
  (L.rooms || []).forEach((r, i) => {
    if (!reachedRooms.has(i)) warn(id, `房间「${r.name || r.id}」从出生点走不到`);
  });
}

// ---------------------------------------------------------------- 入口
const want = process.argv.slice(2);
const ids = want.length ? want : Object.keys(R.LEVELS);
for (const id of ids) checkLevel(id);

for (const w of warnings) console.log(w);
if (problems.length) {
  for (const p of problems) console.error(p);
  console.error(`\n地图体检：${problems.length} 个错误，${warnings.length} 个提醒`);
  process.exit(1);
}
console.log(`地图体检通过（${ids.length} 张地图：${ids.join('、')}），${warnings.length} 个提醒`);
