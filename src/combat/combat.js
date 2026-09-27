'use strict';
// 小刀、射击、伤害结算、处刑者登场

function knife() {
  if (P.knifeCd > 0) return; P.knifeCd = KNIFE.cd; P.knifeT = KNIFE.swing; sfx('knife');
  const p = S.p;
  for (const e of S.enemies) {
    if (e.dead) continue; const d = dist(p.x, p.y, e.x, e.y);
    if (d < KNIFE.reach + e.r && Math.abs(angDiff(p.a, Math.atan2(e.y - p.y, e.x - p.x))) < KNIFE.arc) damageEnemy(e, KNIFE.dmg, p.a, KNIFE.kb, false, KNIFE.stagger, 'knife');
  }
}
// 射击：全部数值来自 config/weapons.js
function shoot() {
  const p = S.p, w = p.wep, W_ = WEAPONS[w];
  if (railOn()) return;   // 电磁炮：按住蓄力，由 updateRail 处理（ai/lazarus.js）
  if (!W_ || P.reloadT > 0 || P.fireCd > 0) return;
  if (p.mag[w] <= 0) { sfx('empty'); P.fireCd = 0.3; if (ammoCount(w) > 0) reload(); else msg('弹药耗尽！'); return; }
  p.mag[w]--; S.stats.shots++;
  P.fireCd = W_.fireCd; P.flash = 0.07; shake = Math.max(shake, W_.shake);
  sfx(modVal(S.p.wep, 'sfx', W_.sfx));
  // 榴弹发射器：不是即时命中，发射一枚会飞的榴弹（combat/hazards.js）
  if (W_.proj) { launchGrenade(p.x + Math.cos(p.a) * 26, p.y + Math.sin(p.a) * 26, p.a + (Math.random() - .5) * W_.aimSpread * (1 - P.focus), W_.range, glLoaded()); emitNoise(p.x, p.y, W_.noise, 'gun'); P.focus = Math.min(P.focus, W_.focusAfter); return; }
  const spread = W_.aimSpread * (1 - P.focus) + W_.baseSpread;
  const ox = p.x + Math.cos(p.a) * 26 + Math.cos(p.a + 1.57) * 4, oy = p.y + Math.sin(p.a) * 26 + Math.sin(p.a + 1.57) * 4;
  let anyHit = false;
  for (let k = 0; k < W_.pellets; k++) {
    const a = p.a + (Math.random() - .5) * 2 * (modVal(w, 'cone', W_.cone) + spread * W_.aimMul);   // 霰弹枪短枪管：扩散更小
    const wd = ray(ox, oy, a, W_.range, opaqueT);
    const dx = Math.cos(a), dy = Math.sin(a);
    // 沿弹道收集命中的敌人（按距离排序）。pierce：麦林能穿透，最多再打穿 pierce 个
    const hits = [];
    for (const e of S.enemies) {
      if (e.dead || e.hidden) continue;   // 潜在水里的淤泥体打不到
      const fx = e.x - ox, fy = e.y - oy, t = fx * dx + fy * dy;
      if (t < -e.r || t > wd) continue;
      const px = fx - dx * t, py = fy - dy * t;
      if (px * px + py * py < e.r * e.r) hits.push([e, Math.max(0, t)]);
    }
    hits.sort((u, v) => u[1] - v[1]);
    const taken = hits.slice(0, 1 + (W_.pierce || 0));
    const hit = taken.length ? taken[0][0] : null;
    const ht = taken.length ? taken[taken.length - 1][1] : wd;
    const ex = ox + dx * (W_.pierce ? (taken.length > W_.pierce ? ht : wd) : ht), ey = oy + dy * (W_.pierce ? (taken.length > W_.pierce ? ht : wd) : ht);
    tracers.push({ x1: ox, y1: oy, x2: ex, y2: ey, life: W_.pierce ? 0.12 : 0.06 });
    if (hit) {
      anyHit = true;
      for (const [he, t] of taken) {
        const hd = W_.head, head = !!hd && he.t !== 'boss' && P.focus > hd.focus && Math.random() < hd.chance;
        const fall = W_.falloff ? clamp(1 - t / W_.range, W_.falloffMin, 1) : 1;
        damageEnemy(he, (head ? hd.dmg : modVal(w, 'dmg', W_.dmg)) * fall, a, (head ? hd.kb : W_.kb) * fall, head, W_.stagger, w);
      }
    } else {
      for (let i = 0; i < 5; i++) parts.push({ x: ex - dx * 3, y: ey - dy * 3, vx: rand(-80, 80) - dx * 60, vy: rand(-80, 80) - dy * 60, life: 0.25, max: 0.25, s: 2, c: '#ffd27a', t: 'spark' });
    }
  }
  if (anyHit) S.stats.hits++;
  // 抛壳
  parts.push({ x: p.x + Math.cos(p.a) * 14, y: p.y + Math.sin(p.a) * 14, vx: Math.cos(p.a + 1.57) * rand(80, 140), vy: Math.sin(p.a + 1.57) * rand(80, 140), life: 0.8, max: 0.8, s: 2, c: W_.shell, t: 'shell' });
  emitNoise(p.x, p.y, modVal(p.wep, 'noise', W_.noise), 'gun');
  P.focus = Math.min(P.focus, W_.focusAfter);
}
function bleed(x, y, a, n, big) {
  for (let i = 0; i < n; i++) {
    const aa = a + rand(-0.7, 0.7), sp = rand(60, big ? 320 : 200);
    parts.push({ x, y, vx: Math.cos(aa) * sp, vy: Math.sin(aa) * sp, life: rand(0.2, 0.5), max: 0.5, s: rand(1.5, 3.5), c: Math.random() < .5 ? '#8a0a0a' : '#5a0505', t: 'blood' });
  }
}
// 位置（格）来自触发器；F9 调试时不给参数，出现在地图 1 的收容舱
function spawnExecutioner(tx = 52, ty = 8, quiet = false) {   // quiet：演出自己负责声音和提示（跳落）
  if (S.enemies.some(e => e.t === 'boss' && !e.dead)) return;
  if (S.executioner && S.executioner.done) return;   // 焚化炉之后追踪形态已经不存在了（变成了暴走形态 / 被打倒）
  S.executioner = S.executioner || freshExecutioner();
  S.executioner.spawned = true; S.executioner.active = true; S.executioner.map = S.map; S.executioner.follow = null;
  const b = mkEnemy('boss', tx, ty); b.alert = true; b.state = 'chase';  // 登场时知道玩家在哪：第一次正面遭遇，被一路追回宅邸
  S.enemies.push(b);
  if (quiet) return;
  cryAt('executioner', 'roar', b.x, b.y, 1, 3000, 0.5); shake = 25;
  // 台词跟着登场位置走：收容舱 / 剧情入口（列车车厢）各有一句，别的地方（试玩跳转、调试）用通用的，免得在焚化炉里说「车厢门被撞飞」
  const en = LEVEL.execEntry, atEntry = en && Math.abs(tx - en.x) < 1 && Math.abs(ty - en.y) < 1;
  msg(S.map === 'map1' && tx === 52 && ty === 8 ? '收容舱的碎片四散飞溅——「处刑者」出现了！它不会停下。' : atEntry ? en.msg : '「处刑者」出现了！它不会停下。', 5);
}
// src：'knife' | 'pistol' | 'shotgun' …… 只有小刀受“1.5 秒内不再硬直”的限制
function damageEnemy(e, dmg, a, kb, head, stag, src = 'gun') {
  if (e.t === 'boss' && e.knockdownT > 0) return;
  if (e.t === 'boss' && e.frozenT > 0) { sfx('hit', 0.4); floats.push({ x: e.x, y: e.y - 30, t: '冰层挡住了', life: 0.8, c: '#bfe0ff' }); return; }   // 冻着：子弹打在冰上
  if (e.t === 'vine') { if (src === 'fire') { dmg *= VINE.fireMul; if (Math.random() < 0.4) floats.push({ x: e.x, y: e.y - 24, t: '烧起来了！', life: 0.7, c: '#ff9a3a' }); } kb = 0; stag = 0; }   // 蔓生体：榴弹爆炸和火场伤害 ×2，其他正常，不会被击退
  if (e.t === 'lazarus') { const r = lazarusDamage(e, dmg, a, src); if (r === null) return; dmg = r; stag = 0; kb = 0; }   // 拉撒路：阶段弱点、变身无敌、阶段三只怕电磁炮
  if (e.t === 'tentacle') { stag = 0; kb = 0; }
  if (e.t === 'executionerBerserk') { dmg = berserkDamage(e, dmg, a, src); stag = 0; kb *= 0.1; }   // 暴走处刑者：背后心脏 ×2，打不出硬直
  if (e.acidT > 0 && src !== 'acid' && src !== 'railgun') dmg *= GL_ROUNDS.acid.vuln;   // 酸液腐蚀：伤害 ×1.5
  if (e.t === 'hunter') { stag *= HUNTER.stagMul; kb *= HUNTER.kbMul; hunterHurt(e); }   // 猎手：硬直、击退减半；处决前摇被打中会中断
  if (e.t !== 'boss') e.hp -= dmg; else e.hp = e.maxhp;
  e.alert = true;
  if (e.t === 'licker') lickerHear(e, S.p.x, S.p.y, 'hit');   // 被打中：疼痛让它确定你就在那个方向
  const isKnife = src === 'knife';
  const canStun = stag > 0 && (!isKnife || e.knifeStunT <= 0);
  if (stag > 0 && !canStun) stag = 0;
  bleed(e.x, e.y, a, head ? 22 : 8, head);
  sfx(head ? 'head' : 'hit');
  if (head) floats.push({ x: e.x, y: e.y - 20, t: '爆头！', life: 1, c: '#ff4040' });
  if (e.t === 'boss') {
    e.stagAcc += dmg;
    const threshold = S.executioner ? S.executioner.nextThreshold : EXEC.threshold;
    if (e.stagAcc >= threshold) {
      e.stagAcc = 0; e.stag = 0; e.knockdownT = EXEC.knockdown; e.state = 'knockdown'; e.alert = false; e.midStagDone = false; e.atkT = 0;
      if (S.executioner) { S.executioner.knockdowns++; S.executioner.nextThreshold = Math.min(S.executioner.maxThreshold, Math.ceil(threshold * EXEC.thresholdGrow)); }
      floats.push({ x: e.x, y: e.y - 30, t: '暂时倒下', life: 1.5, c: '#ffcc55' });
      msg('「处刑者」被打倒了，但只能维持片刻。', 3); cryAt('executioner', 'pain', e.x, e.y, 1, 1200, 0.3); shake = 20;
    } else if (e.stagAcc >= EXEC.midStagger && !e.midStagDone) { e.midStagDone = true; e.stag = EXEC.midStaggerT; e.state = 'chase'; floats.push({ x: e.x, y: e.y - 30, t: '踉跄', life: 1, c: '#ffcc55' }); cryAt('executioner', 'pain', e.x, e.y, 0.8, 1200, 0.3); }
    pushEnemy(e, Math.cos(a) * kb * 0.2, Math.sin(a) * kb * 0.2);
  } else {
    if (canStun && isKnife) e.knifeStunT = 1.5;
    e.stag = Math.max(e.stag, stag); if (e.state === 'attack') e.state = 'chase';
    pushEnemy(e, Math.cos(a) * kb, Math.sin(a) * kb);
  }
  if (e.hp <= 0 && e.t !== 'boss') {
    e.dead = true; e.deadT = 0; e.fa = a; S.stats.kills++; fireEvent('kill', { t: e.t });
    if (e.t === 'bloater') bloaterBurst(e);   // 膨胀者：炸开，留下毒雾
    // 爬行者：身体伤害打死的僵尸有 30% 会在几秒后变成爬行者（爆头、小刀补刀的不会）。计划 5.2
    if (e.t === 'zombie' && !head && Math.random() < CRAWLER.reviveChance) e.revive = rand(CRAWLER.reviveDelay[0], CRAWLER.reviveDelay[1]);
    decals.push({ x: e.x + Math.cos(a) * 10, y: e.y + Math.sin(a) * 10, r: e.r * 1.7, rot: rand(6), a: 0.85 });
    enemyCry(e, 'die', 0.8, 650);   // 倒下时的最后一声（僵尸闷哼、狗哀鸣、猎手 / 舔舐者尖叫……）
  } else if (e.t !== 'boss' && !(e.hurtVoT > S.time)) {
    e.hurtVoT = S.time + (e.t === 'executionerBerserk' || e.t === 'lazarus' ? 2.5 : 0.7);   // 中弹叫声：0.7 秒内只叫一次（Boss 2.5 秒），冲锋枪连射不会叠成一片
    enemyCry(e, 'hurt', 0.7, 650);
  }
}
function hurtPlayer(dmg, a, src) {
  const p = S.p;
  if (P.inv > 0 || mode !== 'play') return;
  if (p.guardT > 0) dmg = Math.round(dmg * GUARD_MUL); // 红草药：受到的伤害 -20%
  p.hp -= dmg; P.inv = 1.1; P.hurtT = 0.5; shake = Math.max(shake, src === 'boss' ? 22 : 12);
  sfx('bite'); sfx('hurt');
  bleed(p.x, p.y, a, 14, true);
  decals.push({ x: p.x, y: p.y, r: 10, rot: rand(6), a: 0.7 });
  moveEnt(p, Math.cos(a) * (src === 'boss' ? 60 : 28), Math.sin(a) * (src === 'boss' ? 60 : 28));
  P.focus = 0; P.reloadT = 0;
  if (p.hp <= 0) { p.hp = 0; mode = 'dead'; modeT = 0; sfx('die'); }
}
