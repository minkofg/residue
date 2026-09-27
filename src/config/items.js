'use strict';
// 背包物品定义、草药混合配方、快速治疗顺序（计划 6.4、7.5）

// kind：weapon 武器 / ammo 弹药 / herb 草药 / heal 其他恢复品 / throw 投掷物（G 投掷，X 切换）
// max：一格最多堆叠多少（草药、喷雾、武器都是 1，不堆叠）
// heal：恢复多少生命；guard：受到伤害 -20% 的持续秒数；cure：解毒
const ITEMS = {
  pistol:       { name: '手枪 M19',        short: '手枪',   kind: 'weapon', max: 1,  col: '#b8b8b8' },
  shotgun:      { name: '霰弹枪 W870',      short: '霰弹枪', kind: 'weapon', max: 1,  col: '#b08a5a' },
  ammo_pistol:  { name: '手枪子弹',         short: '手枪弹', kind: 'ammo',   max: 60, col: '#d6b04e', weapon: 'pistol' },
  smg:          { name: '冲锋枪 MP-9',      short: '冲锋枪', kind: 'weapon', max: 1,  col: '#7a8a9a' },
  ammo_smg:     { name: '冲锋枪子弹',       short: '冲锋弹', kind: 'ammo',   max: 120, col: '#8fb0d0', weapon: 'smg' },
  magnum:       { name: '麦林 .44',         short: '麦林',   kind: 'weapon', max: 1,  col: '#b8b8b8' },   // 图标和手枪一样
  ammo_magnum:  { name: '麦林子弹',         short: '麦林弹', kind: 'ammo',   max: 12, col: '#e0c070', weapon: 'magnum' },
  ammo_shotgun: { name: '霰弹',             short: '霰弹',   kind: 'ammo',   max: 30, col: '#d06a50', weapon: 'shotgun' },
  gl:           { name: '榴弹发射器 GL-40', short: '榴弹',   kind: 'weapon', max: 1,  col: '#8a9a6a' },
  ammo_fire:    { name: '燃烧榴弹',         short: '燃烧弹', kind: 'ammo',   max: 6,  col: '#e07030', weapon: 'gl' },
  ammo_bomb:    { name: '爆炸榴弹',         short: '爆炸弹', kind: 'ammo',   max: 6,  col: '#d8c050', weapon: 'gl' },
  ammo_acid:    { name: '酸液榴弹',         short: '酸液弹', kind: 'ammo',   max: 6,  col: '#9ad040', weapon: 'gl' },
  herb_g:       { name: '绿色草药',         short: '绿',     kind: 'herb',   max: 1,  col: '#5fd06a', heal: 40 },
  herb_r:       { name: '红色草药',         short: '红',     kind: 'herb',   max: 1,  col: '#d05050', heal: 0 },
  herb_b:       { name: '蓝色草药',         short: '蓝',     kind: 'herb',   max: 1,  col: '#4f9bd0', heal: 0, cure: true },
  mix_gg:       { name: '混合草药（绿+绿）',   short: '绿绿',   kind: 'herb',   max: 1,  col: '#7fe08a', heal: 100 },
  mix_gr:       { name: '混合草药（绿+红）',   short: '绿红',   kind: 'herb',   max: 1,  col: '#e0a060', heal: 100, guard: 60 },
  mix_gb:       { name: '混合草药（绿+蓝）',   short: '绿蓝',   kind: 'herb',   max: 1,  col: '#60c0c0', heal: 40, cure: true },
  mix_grb:      { name: '混合草药（绿+红+蓝）', short: '三色',   kind: 'herb',   max: 1,  col: '#f0e080', heal: 100, guard: 60, cure: true },
  grenade:      { name: '破片手雷',         short: '手雷',   kind: 'throw',  max: 5,  col: '#6a7a40' },
  flashbang:    { name: '闪光弹',           short: '闪光',   kind: 'throw',  max: 5,  col: '#d8d8c8' },
  spray:        { name: '急救喷雾',         short: '喷雾',   kind: 'heal',   max: 1,  col: '#e8e8e8', heal: 100 },
};

const INV_START = 8;      // 物品栏至少 8 格。背包不限格数：格子不够就往后加一行（v1.0.1 起取消腰包和道具箱）
const INV_ROW = 4;        // 一行 4 格；背包的格数总是整行
const GUARD_MUL = 0.8;    // 红草药效果：受到的伤害 ×0.8

// 草药混合：两个物品 id 按字母排序后用 + 连接
const MIXES = {
  'herb_g+herb_g': 'mix_gg',
  'herb_g+herb_r': 'mix_gr',
  'herb_b+herb_g': 'mix_gb',
  'herb_b+mix_gr': 'mix_grb',
  'herb_r+mix_gb': 'mix_grb',
};
const mixResult = (a, b) => MIXES[[a, b].sort().join('+')] || null;

// 快速治疗（Q）：优先用“刚好够用”的最便宜的恢复品；都不够就用恢复量最大的
const HEAL_ORDER = ['herb_g', 'mix_gb', 'mix_gg', 'mix_gr', 'mix_grb', 'spray'];

// 地上道具的显示名（「[E] 拾取 …」）：和捡起来之后背包里的名字一致
// 以前用 ITEMDEF 查：手雷、闪光弹没有条目（显示 undefined），红 / 蓝草药都显示成「绿色草药」，配件只写「配件」
function pickupName(it) {
  if (it.t === 'key') return KEYS[it.v] ? KEYS[it.v].name : '钥匙';
  if (it.t === 'mod') return typeof MODS !== 'undefined' && MODS[it.v] ? MODS[it.v].name : '配件';
  const x = worldToInv(it);
  if (x && ITEMS[x.id]) return ITEMS[x.id].name + (ITEMS[x.id].max > 1 && x.n > 1 ? ` ×${x.n}` : '');
  return (typeof ITEMDEF !== 'undefined' && ITEMDEF[it.t]) || it.t;
}
// 地图上的道具 → 背包物品
function worldToInv(it) {
  switch (it.t) {
    case 'ammo': return { id: 'ammo_pistol', n: it.v };
    case 'shells': return { id: 'ammo_shotgun', n: it.v };
    case 'smgammo': return { id: 'ammo_smg', n: it.v };
    case 'magammo': return { id: 'ammo_magnum', n: it.v };
    case 'herb': return { id: it.v === 'red' ? 'herb_r' : it.v === 'blue' ? 'herb_b' : 'herb_g', n: 1 };
    case 'spray': return { id: 'spray', n: 1 };
    case 'grenade': return { id: 'grenade', n: it.v || 1 };
    case 'flash': return { id: 'flashbang', n: it.v || 1 };
    case 'shotgun': return { id: 'shotgun', n: 1 };
    case 'gl': return { id: 'gl', n: 1 };
    case 'glammo': return { id: 'ammo_fire', n: it.v };
    case 'glbomb': return { id: 'ammo_bomb', n: it.v };
    case 'glacid': return { id: 'ammo_acid', n: it.v };
    default: return null;
  }
}
