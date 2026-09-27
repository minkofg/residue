'use strict';
// 房间判断、安全屋、调查与开关门

// ---------------------------------------------------------------- 玩家动作
function curRoom() { const tx = Math.floor(S.p.x / T), ty = Math.floor(S.p.y / T); const r = roomAt[ty * MW + tx]; return r; }
function inSafe() { const r = curRoom(); return r >= 0 && ROOMS[r].safe; }
function inSafeTile(x, y) { const ri = roomAt[Math.floor(y / T) * MW + Math.floor(x / T)]; return ri >= 0 && !!ROOMS[ri].safe; }
// 击退、分离等被动位移也不能把敌人推进安全屋
function pushEnemy(e, dx, dy) { const ox = e.x, oy = e.y; moveEnt(e, dx, dy); if (inSafeTile(e.x, e.y)) { e.x = ox; e.y = oy; } }
function findInteract() {
  const p = S.p; let best = null, bd = 60;
  for (const it of S.items) { if (it.taken) continue; const d = dist(p.x, p.y, it.x, it.y); if (d < bd) { bd = d; best = { kind: 'item', it }; } }
  if (best) return best;
  for (const ex of EXITS) { const d = dist(p.x, p.y, (ex.x + .5) * T, (ex.y + .5) * T); if (d < bd) { bd = d; best = { kind: 'exit', ex }; } }
  if (best) return best;
  let door = null, dd = 62;
  for (const [x, y] of DOORS) {
    if (grid[y * MW + x] !== 2 && grid[y * MW + x] !== 3) continue;
    const d = dist(p.x, p.y, (x + .5) * T, (y + .5) * T);
    if (d < dd) { dd = d; door = { kind: 'door', x, y, key: LOCKS[doorKey(x, y)] || null, open: isDoorOpen(x, y) }; }
  }
  return door;
}
// 门格上（含半径重叠）有玩家或敌人时不能关门
function doorBlocked(tx, ty) {
  const x0 = tx * T, y0 = ty * T;
  const overlap = e => { const nx = clamp(e.x, x0, x0 + T), ny = clamp(e.y, y0, y0 + T); return Math.hypot(e.x - nx, e.y - ny) < e.r; };
  return overlap(S.p) || S.enemies.some(e => !e.dead && overlap(e));
}
function interact() {
  const f = findInteract(); if (!f) return;
  const p = S.p;
  if (f.kind === 'exit') { useExit(f.ex); return; }
  if (f.kind === 'door') {
    const dk = doorKey(f.x, f.y);
    if (grid[f.y * MW + f.x] === 3) {
      if (!p.keys[f.key]) { sfx('locked'); msg(KEYS[f.key].hint); return; }
      grid[f.y * MW + f.x] = 2; if (!S.unlocked.includes(dk)) S.unlocked.push(dk);
      setDoorOpen(f.x, f.y, true); drawTileAt(f.x, f.y); sfx('door'); emitNoise((f.x + .5) * T, (f.y + .5) * T, NOISE.doorOpen); msg(`使用了「${KEYS[f.key].name}」。门开了。`);
    } else {
      if (isDoorOpen(f.x, f.y) && doorBlocked(f.x, f.y)) { msg('有东西挡着，门关不上。'); sfx('locked'); return; }
      setDoorOpen(f.x, f.y, !isDoorOpen(f.x, f.y)); drawTileAt(f.x, f.y); sfx('door'); emitNoise((f.x + .5) * T, (f.y + .5) * T, isDoorOpen(f.x, f.y) ? NOISE.doorOpen : NOISE.doorClose);
      msg(isDoorOpen(f.x, f.y) ? '门开了。' : '门关上了。');
    }
    return;
  }
  const it = f.it;
  switch (it.t) {
    case 'typewriter': openSlots('save'); return;  // 选存档槽（ui/menus.js）
    case 'bust': turnBust(it); return;   // 机关道具：转一下，拿不走（game/puzzles.js）
    case 'plate': readPlate(); return;
    case 'safe': openSafe(it); return;
    case 'altar': useAltar(it); return;
    case 'lift': useLift(it); return;
    case 'fusebox': useFusebox(it); return;
    case 'valve': useValve(it); return;
    case 'ln2lever': useLN2Lever(it); return;
    case 'ladle': useLadle(it); return;
    case 'trainConsole': useTrainConsole(it); return;
    case 'escapedoor': useEscapeDoor(it); return;
    case 'gunlocker': useGunLocker(it); return;
    case 'growlight': useGrowLight(it); return;
    case 'glcase': useGlCase(it); return;
    case 'console': useConsole(it); return;
    case 'traindoor': useTrainDoor(it); return;
    case 'switch':   // 灯开关：来回切换 flag；lamps 里带同名 flag 的灯跟着亮灭
      if (S.flags[it.v]) delete S.flags[it.v]; else S.flags[it.v] = true;
      sfx('locked', 0.5); msg(S.flags[it.v] ? '啪嗒。灯亮了。' : '啪嗒。灯灭了。'); return;
    case 'smgammo': case 'magammo': case 'gl': case 'glammo': case 'glbomb': case 'glacid':
    case 'ammo': case 'shells': case 'herb': case 'spray': case 'shotgun': case 'grenade': case 'flash':   // 手雷、闪光弹以前漏了：按 E 道具消失但没进背包
      if (!pickUp(it)) return;
      break;
    case 'mod': sfx('key'); giveReward({ mod: it.v }); break;   // 配件：不占格子，拿到立刻生效
    case 'key': p.keys[it.v] = true; msg(`获得「${KEYS[it.v].name}」`); sfx('key');
      break;
    case 'file': p.files.push(it.v); sfx('pickup'); it.taken = true; openFile(it.v); fireEvent('pickup', { t: it.t, v: it.v }); return;
    default:   // 兜底：能进背包的东西一律走 pickUp（新加道具忘了在上面列出来，也不会凭空消失）
      if (worldToInv(it)) { if (!pickUp(it)) return; break; }
      return;
  }
  it.taken = true;
  fireEvent('pickup', { t: it.t, v: it.v });  // 事件（例如拿到盾之钥匙后的伏击）写在 config/triggers.js
}
