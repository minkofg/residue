'use strict';
// 武器切换与装填（恢复品和背包在 player/inventory.js）

// ---------------------------------------------------------------- 武器切换
function hasWeapon(id) {
  const p = S.p;
  return invHas(id) || !!(p.weapons && p.weapons[id]); // weapons：后续地图的武器（调试用）
}
function equipWeapon(id) {
  const p = S.p;
  if (p.rail && p.rail.on) { p.rail.on = false; P.railCharge = 0; if (p.wep === id) { sfx('reload', 0.6); return true; } }   // 从电磁炮切回普通武器
  if (p.wep === id) return false;
  p.wep = id; P.reloadT = 0; P.lastSwitch = S.time; sfx('reload');
  return true;
}
// 数字键 1–5
function selectWeaponSlot(i) {
  if (i === 5) return equipRail();   // 6：电磁炮（剧情武器，不在 WEAPON_SLOTS 里）
  const slot = WEAPON_SLOTS[i];
  if (!slot) return false;
  if (!hasWeapon(slot.id)) { msg(`[${i + 1}] 这个栏位还没有武器。`, 1.8); return false; }
  return equipWeapon(slot.id);
}
// 鼠标滚轮：dir = 1 下一把，-1 上一把
function cycleWeapon(dir) {
  if (P.lastSwitch !== undefined && S.time - P.lastSwitch < WEAPON_SWITCH_CD) return false;
  const owned = WEAPON_SLOTS.map(s => s.id).filter(hasWeapon);
  if (owned.length < 2) return false;
  const i = owned.indexOf(S.p.wep);
  return equipWeapon(owned[(i + dir + owned.length) % owned.length]);
}

// 榴弹发射器换弹种：把枪里那发退回背包，装下一种背包里有的
function cycleGlRound() {
  const p = S.p, cur = glLoaded();
  const have = GL_ORDER.filter(k => k !== cur && invCount(GL_ROUNDS[k].item) > 0);
  if (!have.length) { msg(`只有${GL_ROUNDS[cur].name}。`, 1.5); return false; }
  const next = have.find(k => GL_ORDER.indexOf(k) > GL_ORDER.indexOf(cur)) || have[0];
  if (p.mag.gl > 0) {
    if (invAdd(inv(), GL_ROUNDS[cur].item, 1) > 0) { msg('背包满了，退不出这发榴弹。', 2); sfx('locked'); return false; }
    p.mag.gl = 0;
  }
  p.glType = next; P.reloadT = WEAPONS.gl.reload; sfx('reload');
  msg(`换装 ${GL_ROUNDS[next].name}`, 1.8);
  return true;
}
function reload() {
  const p = S.p, w = p.wep, W_ = WEAPONS[w];
  if (railOn()) return;   // 电磁炮不用装填
  if (w === 'gl' && P.reloadT <= 0 && p.mag.gl >= 1) { cycleGlRound(); return; }   // 榴弹：装着一发时 R = 换弹种
  if (!W_ || P.reloadT > 0 || p.mag[w] >= magCap(w)) return;
  if (ammoCount(w) <= 0) { msg(W_.noAmmo); sfx('empty'); return; }
  P.reloadT = W_.reload; sfx('reload');
}
