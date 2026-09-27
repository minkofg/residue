'use strict';
// 背包：格子、堆叠、拾取、使用、草药混合、快速治疗（计划 6.4、7.5）
// 数据：S.p.inv = { size, slots: [ { id, n } | null, … ] }，size 总是等于 slots.length，而且是整行（INV_ROW 的倍数）。
// v1.0.1 起背包不限格数：格子不够就往后加一行，末尾空出来的整行会收回（至少 INV_START 格）。取消了腰包和道具箱。
// 关键道具（S.p.keys）和文件（S.p.files）不占格子。

function newInventory(list = []) {
  const inv = { size: INV_START, slots: new Array(INV_START).fill(null) };
  for (const [id, n] of list) invAdd(inv, id, n);
  return inv;
}
function inv() { return S.p.inv; }
function invUsed(v = inv()) { return v.slots.filter(Boolean).length; }
function invFree(v = inv()) { return v.size - invUsed(v); }
function invCount(id, v = inv()) { return v.slots.reduce((s, x) => s + (x && x.id === id ? x.n : 0), 0); }
function invHas(id, v = inv()) { return invCount(id, v) > 0; }

// 格子整理：补成整行、至少 INV_START 格；末尾整行都空着就收回来
function invFit(v) {
  while (v.slots.length < INV_START || v.slots.length % INV_ROW) v.slots.push(null);
  while (v.slots.length > INV_START && v.slots.slice(-INV_ROW).every(s => !s)) v.slots.length -= INV_ROW;
  v.size = v.slots.length;
  return v;
}
// 放入 n 个 id：先补满已有的同类堆叠，再占空格，格子不够就往后加一行。不限格数，总是全部放下（返回 0 = 没有放不下的）
function invAdd(v, id, n = 1) {
  const max = ITEMS[id].max;
  for (const s of v.slots) { if (n <= 0) break; if (s && s.id === id && s.n < max) { const k = Math.min(max - s.n, n); s.n += k; n -= k; } }
  for (let i = 0; n > 0; i++) {
    if (i >= v.slots.length) for (let k = 0; k < INV_ROW; k++) v.slots.push(null);
    if (!v.slots[i]) { const k = Math.min(max, n); v.slots[i] = { id, n: k }; n -= k; }
  }
  v.size = v.slots.length;
  return 0;
}
// 取出 n 个 id（从后面的格子开始取）。返回实际取出的数量
function invTake(id, n = 1, v = inv()) {
  let got = 0;
  for (let i = v.slots.length - 1; i >= 0 && got < n; i--) {
    const s = v.slots[i]; if (!s || s.id !== id) continue;
    const k = Math.min(s.n, n - got); s.n -= k; got += k; if (s.n <= 0) v.slots[i] = null;
  }
  invFit(v);
  return got;
}

// ---------------------------------------------------------------- 武器与弹药
function ammoIdFor(w) { if (w === 'gl') return GL_ROUNDS[glCur()].item; return WEAPONS[w] ? WEAPONS[w].ammo : null; }
// 榴弹发射器当前选的弹种：选中的那种背包里没了（而且枪里是空的）→ 自动换成还有的那种
function glCur() {
  const p = S.p; let t = GL_ROUNDS[p.glType] ? p.glType : 'fire';
  if (!(p.mag && p.mag.gl > 0) && invCount(GL_ROUNDS[t].item) <= 0) { const f = GL_ORDER.find(k => invCount(GL_ROUNDS[k].item) > 0); if (f) t = f; }
  p.glType = t; return t;
}
function glLoaded() { const p = S.p; return GL_ROUNDS[p.glLoaded] ? p.glLoaded : 'fire'; }
function ammoCount(w) { const id = ammoIdFor(w); return id ? invCount(id) : 0; }
function takeAmmo(w, n) { const id = ammoIdFor(w); return id ? invTake(id, n) : 0; }

// ---------------------------------------------------------------- 拾取
// 返回 true 表示道具已经从地上拿走
function pickUp(it) {
  const x = worldToInv(it); if (!x) return false;
  const def = ITEMS[x.id];
  invAdd(inv(), x.id, x.n);   // 背包不限格数，总能放下
  if (def.kind === 'weapon') {
    S.p.mag[x.id] = it.v || 0; sfx('key');
    const si = WEAPON_SLOTS.findIndex(s => s.id === x.id);
    msg(`获得 ${def.name}！按 ${si + 1} 或滚轮切换。`); return true;
  }
  sfx('pickup');
  msg(`获得 ${def.name}${def.max > 1 ? ' ×' + x.n : ''}` + (def.kind === 'herb' ? '（Tab 打开物品栏，C 组合草药）' : ''));
  return true;
}

// ---------------------------------------------------------------- 使用与混合
// 使用一件恢复品（按 id）。返回是否用掉
function useHealItem(id) {
  const p = S.p, d = ITEMS[id];
  if (!d || !(d.kind === 'herb' || d.kind === 'heal')) return false;
  if (id === 'herb_r') { msg('红色草药单独使用没有效果，和绿色草药混合后才有用。'); return false; }
  if (id === 'herb_b' && !p.poison) { msg('蓝色草药可以解毒。现在没有中毒，不需要使用。'); return false; }
  if (p.hp >= 100 && !d.guard && !(d.cure && p.poison)) { msg('现在不需要治疗。'); return false; }
  if (!invTake(id, 1)) return false;
  p.hp = Math.min(100, p.hp + d.heal);
  if (d.guard) p.guardT = Math.max(p.guardT || 0, d.guard);
  const cured = d.cure && curePoison();
  if (cured) msg('毒解了。', 2);
  S.stats.heals++; sfx('heal');
  msg(`使用了${d.name}。` + (d.guard ? `${d.guard} 秒内受到的伤害降低 20%。` : ''));
  return true;
}
function useSlot(i) {
  const s = inv().slots[i]; if (!s) return false;
  const d = ITEMS[s.id];
  if (d.kind === 'weapon') { if (S.p.wep === s.id) { msg(`已经装备着${d.name}。`, 1.8); return false; } equipWeapon(s.id); msg(`装备了${d.name}。`, 1.8); return true; }
  if (d.kind === 'throw') { if (S.p.sub === s.id) { msg(`${d.name}已经是当前投掷物（G 投掷）。`, 1.8); return false; } return selectThrow(s.id); }
  if (d.kind === 'ammo') { msg(`${d.name}：装备对应的武器后按 R 装填。`, 2.2); return false; }
  return useHealItem(s.id);
}
// 把格子 j 的草药混合进格子 i（结果放在 i，j 空出来）
function combineSlots(i, j) {
  const v = inv(), a = v.slots[i], b = v.slots[j];
  if (i === j || !a || !b) return false;
  const r = mixResult(a.id, b.id);
  if (!r) { sfx('locked'); msg(`${ITEMS[a.id].name} 和 ${ITEMS[b.id].name} 不能组合。`, 2.5); return false; }
  v.slots[i] = { id: r, n: 1 }; v.slots[j] = null; invFit(v);
  sfx('pickup'); msg(`组合成了 ${ITEMS[r].name}。`, 2.5);
  return true;
}
// Q：快速治疗
function pickQuickHeal(hp = S.p.hp) {
  const miss = 100 - hp, have = HEAL_ORDER.filter(id => invHas(id));
  if (!have.length) return null;
  const enough = have.find(id => ITEMS[id].heal >= miss);
  if (enough) return enough;
  return have.reduce((b, id) => ITEMS[id].heal > ITEMS[b].heal ? id : b, have[0]);
}
function quickHeal() {
  if (S.p.hp >= 100) { msg('现在不需要治疗。'); return false; }
  const id = pickQuickHeal();
  if (!id) { msg('没有可用的恢复品。'); return false; }
  return useHealItem(id);
}
function useSpray() {
  if (!invHas('spray')) { msg('没有急救喷雾。'); return false; }
  return useHealItem('spray');
}

// ---------------------------------------------------------------- 旧存档迁移（v2 及以前：零散计数 → 格子）
function migrateInventory(oldP) {
  const v = newInventory();
  const put = (id, n) => { if (n > 0) invAdd(v, id, n); };   // 不限格数，全部放得下
  const res = oldP.res || {}, mixes = oldP.mixes || {};
  put('pistol', 1);
  if (oldP.hasShotgun) put('shotgun', 1);
  put('ammo_pistol', res.pistol || 0); put('ammo_shotgun', res.shotgun || 0);
  put('herb_g', oldP.herb === undefined ? 0 : oldP.herb); put('herb_r', oldP.red || 0); put('herb_b', oldP.blue || 0);
  put('mix_gg', mixes.gg || 0); put('mix_gr', mixes.gr || 0); put('mix_gb', mixes.gb || 0); put('mix_grb', mixes.grb || 0);
  put('spray', oldP.spray || 0);
  return v;
}
