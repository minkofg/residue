'use strict';
// 武器数值（计划 6.1）。射击、装填、HUD、绘制都从这里读取，加新武器只需要：
//   1. 在这里加一项；2. 在 config/items.js 加武器和弹药物品；3. 在 config/player.js 的 WEAPON_SLOTS 占好栏位。
//
// 字段说明
//   ammo        弹药物品 id（config/items.js）
//   mag         弹匣容量            reload     装填秒数          fireCd   两次射击的最短间隔（秒）
//   auto        true = 按住连射（冲锋枪）；false = 半自动，每按一次开一枪
//   pellets     每发弹丸数          dmg        每颗弹丸伤害      range    射程（像素）
//   cone        弹丸固定扩散（弧度，霰弹枪用）
//   aimSpread   准心没收拢时的扩散；aimMul 这部分扩散乘多少（霰弹枪受准心影响小）
//   falloff     true = 伤害和击退随距离衰减，最低到 falloffMin
//   head        爆头：{ chance, focus, dmg, kb }（准心收拢到 focus 以上时才有概率；处刑者不会被爆头）
//   kb          击退                stagger    硬直秒数
//   noise       枪声半径（格）      shake      屏幕震动          focusAfter 开枪后准心最多保留多少
//   sfx         音效名              shell      弹壳颜色          model / len  持枪绘制：pistol 手枪 / long 长枪
//   noAmmo      没有备弹时的提示
const WEAPONS = {
  pistol: {
    ammo: 'ammo_pistol', mag: 12, reload: 1.3, fireCd: 0.3, auto: false,
    pellets: 1, dmg: 26, range: 700, cone: 0, aimSpread: 0.17, aimMul: 1, baseSpread: 0.012,
    falloff: false, falloffMin: 1, head: { chance: 0.3, focus: 0.93, dmg: 110, kb: 14 },
    kb: 7, stagger: 0.22, noise: 14, shake: 3, focusAfter: 0.45,
    sfx: 'pistol', shell: '#c9a33a', model: 'pistol', len: 30, noAmmo: '没有手枪子弹了！',
  },
  shotgun: {
    ammo: 'ammo_shotgun', mag: 6, reload: 2.1, fireCd: 0.95, auto: false,
    pellets: 7, dmg: 22, range: 380, cone: 0.13, aimSpread: 0.17, aimMul: 0.4, baseSpread: 0.012,
    falloff: true, falloffMin: 0.25, head: null,
    kb: 16, stagger: 0.4, noise: 18, shake: 9, focusAfter: 0.1,
    sfx: 'shotgun', shell: '#b33', model: 'long', len: 38, noAmmo: '没有霰弹了！',
  },
  // 冲锋枪（地图 2 宿舍储物柜）：压制用，耗弹快，连射时扩散增大（aimSpread 大、focusAfter 低）
  smg: {
    ammo: 'ammo_smg', mag: 40, reload: 1.8, fireCd: 0.08, auto: true,
    pellets: 1, dmg: 11, range: 560, cone: 0, aimSpread: 0.2, aimMul: 1, baseSpread: 0.04,
    falloff: false, falloffMin: 1, head: null,
    kb: 3, stagger: 0.08, noise: 12, shake: 1.5, focusAfter: 0.75,
    sfx: 'pistol', shell: '#c9a33a', model: 'long', len: 30, noAmmo: '没有冲锋枪子弹了！',
  },
  // 麦林（地图 2 冷冻库，液氮阀门谜题）：一发 180，穿透（pierce：最多再打穿 2 个），全流程约 18 发
  magnum: {
    ammo: 'ammo_magnum', mag: 6, reload: 2.4, fireCd: 1.2, auto: false,
    pellets: 1, dmg: 180, range: 900, cone: 0, aimSpread: 0.15, aimMul: 1, baseSpread: 0.006, pierce: 2,
    falloff: false, falloffMin: 1, head: null,
    kb: 22, stagger: 0.6, noise: 20, shake: 18, focusAfter: 0.2,
    sfx: 'magnum', shell: '#c9a33a', model: 'pistol', len: 30,   // 外形、弹壳和手枪完全一样（v3.5 决定），只有枪声不同
    noAmmo: '没有麦林子弹了！',
  },
  // 榴弹发射器 GL-40（地图 3 温室）：燃烧榴弹 —— 落地爆炸 + 一片火场（蔓生体只怕火）
  gl: {
    ammo: 'ammo_fire', mag: 1, reload: 1.8, fireCd: 0.8, auto: false, proj: 'fire',
    pellets: 0, dmg: 0, range: 650, cone: 0, aimSpread: 0.12, aimMul: 1, baseSpread: 0,
    falloff: false, falloffMin: 1, head: null,
    kb: 0, stagger: 0, noise: 16, shake: 7, focusAfter: 0.3,
    sfx: 'shotgun', shell: '#c86a30', model: 'long', len: 36, noAmmo: '没有榴弹了！',
  },
};

// 榴弹发射器的三种弹种（计划 6.1）：弹匣只有 1 发，装的是哪种就打哪种。
//   燃烧：落地爆炸 + 火场（蔓生体只怕火） —— 数值在 combat/hazards.js 的 HAZ.nade / HAZ.fire
//   爆炸：大范围冲击（墙后炸不到，太近会炸到自己）
//   酸液：小范围 + 腐蚀 8 秒：之后受到的所有伤害 ×1.5（对付皮糙肉厚的 Boss；电磁炮不吃这个加成）
// 装着一发时按 R = 换下一种（退回背包、重新装填）
const GL_ROUNDS = {
  fire: { item: 'ammo_fire', name: '燃烧榴弹', col: '#e07030' },
  bomb: { item: 'ammo_bomb', name: '爆炸榴弹', col: '#d8c050', r: 120, dmg: 260, playerDmg: 45, kb: 40, stag: 1.0, noise: 18 },
  acid: { item: 'ammo_acid', name: '酸液榴弹', col: '#9ad040', r: 80, dmg: 110, playerDmg: 15, t: 8, vuln: 1.5 },
};
const GL_ORDER = ['fire', 'bomb', 'acid'];

// 小刀：不占格子，没有耐久度
const KNIFE = { cd: 0.55, swing: 0.2, dmg: 22, reach: 44, arc: 1.0, kb: 10, stagger: 0.45 };
