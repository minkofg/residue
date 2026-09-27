'use strict';
// 资源经济统计（计划 6.5 + 附录 D：「economy.js：弹药 / 必杀敌人血量比 1.2–1.4；治疗量约 2.5 次满血」）
//
// 每次改完地图摆放就跑一次。它回答两个问题：
//   1. 给的弹药，够不够打完「必须打的敌人」？——目标 1.2–1.4 倍（不算爆头和小刀）
//   2. 给的恢复品，相当于几次满血？——目标约 2.5 次
// 另外还会算：
//   · 富余的弹药够把处刑者打倒几次（计划要求只够 1–2 次，逼玩家躲而不是打）
//   · 每种武器各自的供给情况（霰弹枪弹给多了但手枪弹不够，总量正常也不行）
//   · 按「流程区段」分段统计（总量达标但前松后紧同样是坏体验）
//
// 用法：node tools/economy.js [地图id...]
//   --strict   比例超出目标区间时退出码非 0（接进 npm test 用）

const { R } = require('./harness');

const strict = process.argv.includes('--strict');
const ids = process.argv.slice(2).filter(a => !a.startsWith('--'));
const maps = ids.length ? ids : Object.keys(R.LEVELS);

const TARGET_AMMO = [1.2, 1.4];
const TARGET_HEAL = 2.5;
const HEAL_TOLERANCE = 0.6;      // 2.5 ± 0.6 次满血算达标。地图可以用 healTarget 改目标（地图 3 = 4.5，试玩反馈「多点药」），允许误差按比例放大

let failed = false;

// 一发弹药的期望身体伤害（不含爆头，含霰弹枪的距离衰减取中值）
function dmgPerRound(wid) {
  if (wid === 'grenade') return R.THROW.grenade.dmg;
  if (wid === 'gl_bomb') return R.GL_ROUNDS.bomb.dmg * 0.75;   // 爆炸榴弹：取中心和边缘的平均
  if (wid === 'gl_acid') return R.GL_ROUNDS.acid.dmg * R.GL_ROUNDS.acid.vuln;   // 酸液榴弹：本身 110，腐蚀加成粗略按再多一半算
  const W = R.WEAPONS[wid];
  if (!W) return 0;
  if (W.proj) return R.HAZ.nade.blastDmg + R.HAZ.fire.dps * R.HAZ.fire.t * 0.5;   // 榴弹：爆炸 + 火场里平均烧一半时间（蔓生体不动，其实能烧满）
  const avgFalloff = W.falloff ? (1 + W.falloffMin) / 2 : 1;
  return W.pellets * W.dmg * avgFalloff;
}

function report(id) {
  const L = R.LEVELS[id];
  if (!L) { console.error(`没有这张地图：${id}`); failed = true; return; }

  // ---- 供给：地图上摆的弹药和恢复品 ----
  const ammo = {};          // 武器 id → 发数
  let healTotal = 0;
  const healDetail = {};
  const addAmmo = (w, n) => { ammo[w] = (ammo[w] || 0) + n; };

  const countItem = ([t, , , v]) => {
    switch (t) {
      case 'ammo':   addAmmo('pistol', v || 0); break;
      case 'shells': addAmmo('shotgun', v || 0); break;
      case 'smgammo': addAmmo('smg', v || 0); break;
      case 'glammo': addAmmo('gl', v || 0); break;
      case 'glbomb': addAmmo('gl_bomb', v || 0); break;
      case 'glacid': addAmmo('gl_acid', v || 0); break;
      case 'gl': addAmmo('gl', v || 0); break;
      case 'magammo': addAmmo('magnum', v || 0); break;
      case 'grenade': addAmmo('grenade', v || 1); break;   // 破片手雷：一颗按 150 计（闪光弹不造成伤害，不计）
      case 'glcase': addAmmo('gl', 1); break;   // 补光灯谜题的奖励：榴弹发射器（装着一发）
      case 'gunlocker': addAmmo('magnum', R.WEAPONS.magnum.mag); break;   // 阀门谜题的奖励：麦林（满匣 6 发）
      case 'safe': {   // 保险柜 / 储物柜的奖励里的弹药也算供给
        const r = (R.SAFES[v] || {}).reward || {};
        for (const [id, n] of r.items || []) { const d = R.ITEMS[id]; if (d && d.kind === 'ammo') addAmmo(d.weapon, n); else if (d && d.kind === 'weapon') addAmmo(id, r.loaded ?? R.WEAPONS[id].mag); }
        break;
      }
      case 'spray':  healTotal += 100; healDetail['急救喷雾'] = (healDetail['急救喷雾'] || 0) + 1; break;
      case 'herb': {
        // 绿草药 40；红、蓝单独不回血（红要混合、蓝解毒）
        const kind = v === 'red' ? '红' : v === 'blue' ? '蓝' : '绿';
        healDetail[kind + '草药'] = (healDetail[kind + '草药'] || 0) + 1;
        if (kind === '绿') healTotal += R.ITEMS.herb_g.heal;
        break;
      }
      default: break;
    }
  };
  for (const it of (L.items || [])) countItem(it);
  // 触发器里刷出来的补给也算
  for (const tr of (L.triggers || [])) for (const a of (tr.do || [])) if (a.giveItem) countItem(a.giveItem);

  // 第一张地图还要算上开局自带的弹匣和背包（和计划 6.5「demo 实测 102 发」的口径一致）
  const first = Object.keys(R.LEVELS)[0];
  if (id === first) {
    const st = R.newState();
    for (const sl of st.p.inv.slots) {
      if (!sl) continue;
      const def = R.ITEMS[sl.id];
      if (def && def.kind === 'ammo' && def.weapon) addAmmo(def.weapon, sl.n);
      if (def && (def.kind === 'herb' || def.kind === 'heal') && def.heal) {
        healTotal += def.heal * sl.n;
        healDetail['开局携带 ' + def.short] = sl.n;
      }
    }
    for (const [w, n] of Object.entries(st.p.mag || {})) addAmmo(w, n);   // 枪里已经上膛的
  }

  // ---- 需求：必须打的敌人总血量 ----
  // 「必须打」的判定：地图上固定摆的敌人里，挡在主线路径上的。这里保守地全部计入，
  // 但把可以绕开的（狗群、庭院补怪）单独列出来，方便手工调整。
  const enemies = {};
  for (const [t] of (L.enemies || [])) enemies[t] = (enemies[t] || 0) + 1;

  // 触发器刷出来的怪也要算。三个坑，之前全踩了：
  //   1. 伏击写在 scripts 里（ambush / coldAmbush），只扫 trigger.do 根本看不到；
  //   2. 动作会嵌套（after / every / countdown 里还有 do），必须递归；
  //   3. 补怪的字段叫 maxAlive，不叫 max —— 名字对不上，waveHp 一直是 0，
  //      也就是说「敌人需求」长期只算了地图上摆着的固定敌人。
  let spawnHp = 0, spawnCount = 0, waveHp = 0, waveCount = 0, spawnZombies = 0;
  // window：当前所在倒计时的秒数，用来估算补怪一共会刷几只
  const walk = (list, seen = new Set(), window = 0) => {
    for (const a of list || []) {
      if (Array.isArray(a.spawn)) {                       // 伏击：强制战斗，全额计入
        for (const [t] of a.spawn) if (R.EDEF[t]) { spawnHp += R.EDEF[t].hp; spawnCount++; if (t === 'zombie') spawnZombies++; }
      }
      if (a.every && Array.isArray(a.do) && window > 0) {
        // 「每 N 秒刷一次，直到某事发生」：按倒计时长度估算总共会刷几轮
        const first = a.first ?? a.every;
        a._rounds = window > first ? Math.floor((window - first) / a.every) + 1 : 0;
      }
      const w = a.spawnWave;
      if (w && w.t && R.EDEF[w.t]) {
        // 补怪是「拖时间」用的，不要求打完，按一半计入。
        // 只数 maxAlive 会低估：90 秒里每 13 秒刷一轮，实际会刷 6 轮。
        const rounds = list._rounds ?? 1;
        const n = Math.max(rounds, w.maxAlive ?? 4);
        waveHp += R.EDEF[w.t].hp * n * 0.5; waveCount += n;
      }
      if (Array.isArray(a.do)) { a.do._rounds = a._rounds; walk(a.do, seen, window); }
      if (a.countdown && Array.isArray(a.countdown.do)) walk(a.countdown.do, seen, a.countdown.sec || 0);
      if (typeof a.run === 'string' && !seen.has(a.run)) {  // scripts 里的伏击
        seen.add(a.run); walk((L.scripts || {})[a.run], seen);
      }
    }
  };
  for (const tr of (L.triggers || [])) {
    // countdown 和 every 常常是同一层的兄弟：先找出本层倒计时的长度，再走一遍
    const cd = (tr.do || []).find(a => a.countdown);
    walk(tr.do, new Set(), cd ? (cd.countdown.sec || 0) : 0);
  }

  let needHp = spawnHp;
  const needDetail = [];
  if (spawnCount) needDetail.push(`触发器伏击×${spawnCount}（${spawnHp} 血）`);
  for (const [t, n] of Object.entries(enemies)) {
    const def = R.EDEF[t];
    if (!def) { console.error(`  ! 未知敌人类型 ${t}`); continue; }
    if (t === 'boss') continue;                       // 处刑者不计入「必杀」，它杀不死
    needHp += def.hp * n;
    needDetail.push(`${t}×${n}（${def.hp} 血）`);
  }
  // Boss 战（地图里不预先摆放、由剧情生成的 Boss）：L.bossNeeds = [[类型, 需要玩家亲手打掉的血量]]
  for (const [t, hp] of (L.bossNeeds || [])) {
    needHp += hp;
    needDetail.push(`Boss ${t}（${hp} 血）`);
  }
  // 爬行者复活（计划 5.2）：身体伤害打死的僵尸有 reviveChance 会爬起来。
  // 爆头打死的不会、走远了的也不会复活，所以按一半计入（和补怪同一个口径）
  const zombieN = (enemies.zombie || 0) + spawnZombies;
  const reviveHp = R.EDEF.crawler ? zombieN * R.CRAWLER.reviveChance * R.EDEF.crawler.hp * 0.5 : 0;
  const needTotal = needHp + waveHp + reviveHp;

  // ---- 供给的总伤害 ----
  let supplyDmg = 0;
  const supplyDetail = [];
  for (const [w, n] of Object.entries(ammo)) {
    const d = dmgPerRound(w) * n;
    supplyDmg += d;
    supplyDetail.push(`${R.WEAPONS[w] ? w : w}: ${n} 发 × ${dmgPerRound(w).toFixed(0)} = ${d.toFixed(0)}`);
  }
  // 初始弹匣里的子弹也算供给
  for (const [w, W] of Object.entries(R.WEAPONS)) {
    if (ammo[w] === undefined) continue;
    void W;
  }

  const ratio = needTotal > 0 ? supplyDmg / needTotal : Infinity;
  const healRuns = healTotal / 100;

  // 富余的弹药能把处刑者打倒几次
  const spare = supplyDmg - needTotal * TARGET_AMMO[0];
  const knockdowns = spare > 0 ? spare / R.EXEC.threshold : 0;

  // ---- 输出 ----
  console.log(`\n══ ${id}  ${L.name || ''} ══`);
  console.log(`  弹药供给  ${supplyDmg.toFixed(0)} 点伤害`);
  for (const s of supplyDetail) console.log(`            · ${s}`);
  console.log(`  敌人需求  ${needTotal.toFixed(0)} 点血量`);
  console.log(`            · 固定敌人 ${needHp}（${needDetail.join('、')}）`);
  if (waveCount) console.log(`            · 触发器补怪 ${waveCount} 只，按一半计入 ${waveHp.toFixed(0)}`);
  if (reviveHp) console.log(`            · 僵尸复活成爬行者（${zombieN} 只 × ${R.CRAWLER.reviveChance}），按一半计入 ${reviveHp.toFixed(0)}`);

  const ammoOk = ratio >= TARGET_AMMO[0] && ratio <= TARGET_AMMO[1];
  console.log(`  ▸ 弹药比  ${ratio.toFixed(2)} 倍   目标 ${TARGET_AMMO[0]}–${TARGET_AMMO[1]}   ${ammoOk ? '✅ 达标' : ratio > TARGET_AMMO[1] ? '⚠️ 偏多（玩家不会有资源压力）' : '⚠️ 偏少（可能卡死）'}`);
  // 伤害类配件（藏在地图里、可以错过）：单独算一遍「捡到之后」的弹药比，也不能超过上限太多
  const dmgMods = (L.items || []).filter(([t, , , v]) => t === 'mod' && R.MODS[v] && R.MODS[v].dmg);
  for (const [, , , v] of dmgMods) {
    const M = R.MODS[v], extra = (ammo[M.weapon] || 0) * (M.dmg - R.WEAPONS[M.weapon].dmg), r2 = (supplyDmg + extra) / needTotal;
    console.log(`  ▸ 捡到「${M.name}」后  ${r2.toFixed(2)} 倍   ${r2 <= TARGET_AMMO[1] + 0.02 ? '✅ 仍在目标内' : '⚠️ 偏多'}`);
    if (r2 > TARGET_AMMO[1] + 0.02) failed = true;
  }
  if (!ammoOk) {
    const want = needTotal * (TARGET_AMMO[0] + TARGET_AMMO[1]) / 2;
    const diff = (want - supplyDmg) / dmgPerRound('pistol');
    console.log(`            建议：手枪弹 ${diff > 0 ? '增加' : '减少'} 约 ${Math.abs(diff).toFixed(0)} 发`);
  }

  const hT = L.healTarget || TARGET_HEAL, hTol = +(HEAL_TOLERANCE * hT / TARGET_HEAL).toFixed(1);
  const healOk = Math.abs(healRuns - hT) <= hTol;
  console.log(`  ▸ 恢复量  ${healRuns.toFixed(2)} 次满血   目标 ${hT}±${hTol}   ${healOk ? '✅ 达标' : healRuns > hT ? '⚠️ 偏多' : '⚠️ 偏少'}`);
  console.log(`            · ${Object.entries(healDetail).map(([k, v]) => `${k}×${v}`).join('、') || '无'}`);

  // 地图 3：焚化炉之后处刑者就没了（最终战的弹药是给拉撒路的），这一项只作参考
  const execEnds = (L.bossNeeds || []).some(([t]) => t === 'executionerBerserk');
  console.log(`  ▸ 富余弹药够把处刑者打倒 ${knockdowns.toFixed(1)} 次   目标 1–2 次（计划 6.5：逼玩家以躲避为主）${execEnds ? '  （焚化炉之后没有处刑者，只作参考）' : knockdowns > 2.5 ? '  ⚠️ 太多了' : ''}`);

  if (strict && (!ammoOk || !healOk)) failed = true;
}

for (const id of maps) report(id);

console.log('');
if (failed) { console.error('资源经济：有指标超出目标区间（--strict）'); process.exit(1); }
