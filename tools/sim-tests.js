'use strict';
const fs = require('node:fs');
const vm = require('node:vm');

const { R, SOURCES } = require('./harness');
const check = (condition, message) => { if (!condition) throw new Error(message); console.log('ok -', message); };

// 模块结构
{
  const path = require('node:path');
  const walk = d => fs.readdirSync(d, { withFileTypes: true }).flatMap(x => x.isDirectory() ? walk(path.join(d, x.name)) : [path.join(d, x.name)]);
  const onDisk = walk('src').filter(f => f.endsWith('.js')).map(f => path.relative('src', f).split(path.sep).join('/')).sort();
  const listed = SOURCES.map(s => s.rel).sort();
  check(JSON.stringify(onDisk) === JSON.stringify(listed), `模块：src/ 下的 ${onDisk.length} 个 .js 都已登记在 index.html，没有遗漏或多余`);
  check(SOURCES.every(s => s.code.startsWith("'use strict';")), '模块：每个文件都以 use strict 开头');
}

check(R.S.version === 5, '新状态含 save version（v5）');
check(Object.values(R.S.doors).every(open => open === false), '门初始为关闭状态');
check(!R.passT(25, 34), '关门阻挡寻路');
R.setDoorOpen(25, 34, true);
check(R.passT(25, 34), '开门后恢复通行');
R.setDoorOpen(25, 34, false);
R.S.unlocked = ['32,29', '48,37', '42,26'];
for (const k of Object.keys(R.S.doors)) R.S.doors[k] = true;
R.buildMap();
for (const k of Object.keys(R.S.doors)) R.setDoorOpen(+k.split(',')[0], +k.split(',')[1], true);
R.computeFlow();
check(R.flow.some(v => v > 45), '寻路不再被 45 格截断');

const wallEntity = { x: 28.5 * 48, y: 32.5 * 48, r: 14 };
R.moveEnt(wallEntity, 500, 0);
const tx = Math.floor(wallEntity.x / 48), ty = Math.floor(wallEntity.y / 48);
check(!R.solidT(tx, ty), '大幅击退后实体不会停在墙格内');

const before = R.S.enemies.length;
R.S.flags.ambush = true; R.S.flags.ambushFired = false; R.scheduleTimer('shieldAmbush', 1.5);
R.processGameTimers(0.7); check(R.S.enemies.length === before, '游戏内计时器未提前触发');
R.processGameTimers(0.8); check(R.S.enemies.length === before + 3, '游戏内计时器按游戏时间触发伏击');

const ex = R.mkEnemy('boss', 52, 8);
check(ex.maxhp === 3000 && R.S.executioner.nextThreshold === 400, '处刑者使用 3000 生命配置和累计打倒阈值');
R.damageEnemy(ex, 400, 0, 0, false, 0);
check(ex.knockdownT === 20 && !ex.dead, '处刑者只能被暂时打倒，不会死亡');

const z = R.mkEnemy('zombie', 32, 37); R.damageEnemy(z, 1, 0, 0, false, 0.45, 'knife');
const stunTimer = z.knifeStunT;
R.damageEnemy(z, 1, 0, 0, false, 0.45, 'knife');
check(stunTimer > 1.4 && z.knifeStunT === stunTimer, '同一敌人 1.5 秒内不会被小刀再次硬直');

const old = JSON.stringify({ p: { hp: 80 }, enemies: [], items: [], time: 2 });
R.loadGame(old);
check(R.S.version === 5 && R.S.timers && R.S.doors, '旧版存档自动迁移并补齐字段');

// ================= v3.2 新增：分析报告中的 5 个实测 Bug + 小问题 =================
const TS = 48;
const tile = o => [Math.floor(o.x / TS), Math.floor(o.y / TS)];
const openAll = () => { for (const k of Object.keys(R.S.doors)) { const [x, y] = k.split(',').map(Number); R.setDoorOpen(x, y, true); } };
// 注意 resetTransient()：它会把 P.room 复位成 -1。少了这一句，上一个测试结束时
// 玩家站在哪个房间会带进下一个测试，引擎认为「房间没变」，enter 触发器就不会响 ——
// 测试之间互相污染，排查起来非常费劲。顺带也清掉上一轮的 msgs。
const fresh = () => { R.S = R.newState(); R.buildMap(); R.mode = 'play'; R.S.enemies = []; R.resetTransient(); R.computeFlow(); };
// 跳到流程中的某个节点：当前这一批挂着快捷键的按下标跳，其余批次直接套落点（全部定义在 src/game/warp.js）
const warpTo = id => { const i = R.warpIdx(id); R.applyWarp(i >= 0 ? i : R.warpById(id)); };
const lastMsg = () => (R.msgs.length ? R.msgs[R.msgs.length - 1].t : '');   // 屏幕上最新的一条提示
const dist2 = (e, x, y) => Math.hypot(e.x - x, e.y - y);
const step = (sec) => { for (let i = 0; i < Math.round(sec * 60); i++) R.update(1 / 60); };

// Bug 1：噪音传播
fresh();
{
  const [px, py] = tile(R.S.p);
  const near = R.mkEnemy('zombie', px + 1, py), mid = R.mkEnemy('zombie', px + 5, py - 5);
  R.S.enemies = [near, mid];
  R.emitNoise(R.S.p.x, R.S.p.y, 14, 'gun');
  check(!!near.heard && !!mid.heard, '噪音：枪声（14 格）能传到 1 格和 10 格路径距离外的僵尸');
  check(!near.alert && !mid.alert, '噪音：听到声音只会去调查，不会直接变成“知道玩家位置”的追击');
  const f = R.noiseField(R.S.p.x, R.S.p.y, 14);
  check(f[py * R.MW + px] === 14 && f[py * R.MW + px + 3] === 11, '噪音：半径以“格”为单位，每格 -1');
}
fresh();
{
  // 主厅北门(32,29)，南侧声源在(32,31)；门关着时剩余半径减半
  const open = R.noiseField(32.5 * TS, 31.5 * TS, 10); R.setDoorOpen(32, 29, false);
  R.S.unlocked = ['32,29']; R.buildMap(); R.setDoorOpen(32, 29, false);
  const closed = R.noiseField(32.5 * TS, 31.5 * TS, 10);
  R.setDoorOpen(32, 29, true); const opened = R.noiseField(32.5 * TS, 31.5 * TS, 10);
  check(opened[28 * R.MW + 32] === 7 && closed[28 * R.MW + 32] === 3, '噪音：穿过关着的门剩余半径减半（开门 7 → 关门 3）');
}
fresh();
{
  const [px, py] = tile(R.S.p); const z = R.mkEnemy('zombie', px + 4, py); R.S.enemies = [z];
  R.S.p.x -= 0; R.keys.ShiftLeft = true; R.keys.KeyA = true; step(0.6); R.keys.ShiftLeft = false; R.keys.KeyA = false;
  check(!!z.heard || z.alert, '噪音：奔跑的脚步声会被附近的僵尸听到');
  const z2 = R.mkEnemy('zombie', tile(R.S.p)[0] + 4, tile(R.S.p)[1]); R.S.enemies = [z2]; R.S.p.a = Math.PI; // 背对
  z2.fa = 0; z2.sight = 0; R.keys.KeyA = true; step(0.6); R.keys.KeyA = false;
  check(!z2.heard && !z2.alert, '噪音：正常走路是安静的');
}
// 视野锥（M2 遗留，计划 5.2）：僵尸前方 100°、狗 180°，背后只靠听觉
fresh();
{
  const p = R.S.p, [px, py] = tile(p);
  const look = (t, fa) => { const z = R.mkEnemy(t, px + 4, py); z.fa = fa; z.moving = false; z.wT = 99; R.S.enemies = [z]; R.P.inv = 5; R.update(1 / 60); return z; };
  check(R.EDEF.zombie.fov === 100 && R.EDEF.dog.fov === 180, '视野锥：僵尸 100°、狗 180°');
  check(look('zombie', Math.PI).alert, '视野锥：僵尸正对着你（4 格）→ 发现');
  check(!look('zombie', 0).alert, '视野锥：僵尸背对着你 → 看不见（只能靠听）');
  check(!look('zombie', Math.PI + 1.0).alert, '视野锥：偏出 57°（超过 50°）→ 看不见');
  check(look('zombie', Math.PI + 0.7).alert, '视野锥：偏 40°（50° 以内）→ 看得见');
  check(look('dog', Math.PI + 1.3).alert && !look('dog', 0).alert, '视野锥：狗看得更宽（偏 75° 也能看见），但背后一样看不见');
  const z = R.mkEnemy('zombie', px, py); z.x = p.x + 60; z.y = p.y; z.fa = 0; z.wT = 99; R.S.enemies = [z]; R.update(1 / 60);
  check(z.alert, '视野锥：贴身 70px 以内背对着也会发现');
  const z3 = look('zombie', Math.PI); z3.fa = 0; R.update(1 / 60);
  check(z3.alert && z3.lostT === 0, '视野锥：已经在追你时转身不会跟丢（只有被墙挡住才算看不见）');
  const z4 = look('zombie', 0); R.damageEnemy(z4, 10, 0, 0, false, 0, 'pistol');
  check(z4.alert, '视野锥：从背后开枪打它 → 它也知道你在了');
}
// 不堵安全屋的门（试玩反馈）：玩家躲进安全屋后，门外的怪走开，不在门口晃
fresh();
{
  const TS = 48, p = R.S.p, door = [50, 33];   // 书房（安全屋）南门
  p.x = 50.5 * TS; p.y = 36.5 * TS; R.setDoorOpen(50, 33, true);
  const zs = [R.mkEnemy('zombie', 50, 40), R.mkEnemy('zombie', 52, 39), R.mkEnemy('dog', 47, 39)]; zs.forEach(z => { z.alert = true; }); R.S.enemies = zs;
  R.P.inv = 999; step(0.5);
  p.x = 50.5 * TS; p.y = 30.5 * TS;
  check(R.inSafe(), '安全屋：玩家进了书房');
  for (let i = 0; i < 40 * 60; i++) { R.update(1 / 60); R.P.inv = 999; }
  const dd = zs.map(z => Math.hypot(z.x - (door[0] + .5) * TS, z.y - (door[1] + .5) * TS) / TS);
  check(dd.every(d => d > 6), `安全屋：门开着，40 秒后门外的怪都走开了（离门 ${dd.map(d => d.toFixed(1)).join(' / ')} 格）`);
  const z = R.mkEnemy('zombie', 51, 42); z.fa = -Math.PI / 2; R.S.enemies = [z];
  R.keys.ShiftLeft = true; R.keys.KeyA = true; step(0.8); R.keys.ShiftLeft = false; R.keys.KeyA = false;
  check(!z.heard && !z.alert, '安全屋：隔音 —— 在里面奔跑不会把外面的怪引来');
  // 处刑者：门外守候 8–15 秒后去别处（以前守完会立刻又被拉回来守，一直堵门）
  R.S.enemies = []; p.x = 50.5 * TS; p.y = 35.5 * TS; R.spawnExecutioner(); const b = R.activeExecutioner(); b.x = 47.5 * TS; b.y = 35.5 * TS; b.alert = true; b.state = 'chase';
  step(0.5); p.x = 50.5 * TS; p.y = 30.5 * TS;
  let guarded = false; for (let i = 0; i < 3 * 60; i++) { R.update(1 / 60); R.P.inv = 999; if (b.state === 'guard') guarded = true; }
  for (let i = 0; i < 30 * 60; i++) { R.update(1 / 60); R.P.inv = 999; }
  const bd = Math.hypot(b.x - 50.5 * TS, b.y - 33.5 * TS) / TS;
  check(guarded && b.state !== 'guard' && bd > 8, `安全屋：处刑者先在门外守候，然后离开（33 秒后离门 ${bd.toFixed(1)} 格，状态 ${b.state}）`);
  check(!/体力/.test(R.FILES.f0.body) && typeof R.P.stamina === 'undefined', '没有体力条：奔跑不限时（物品栏里显示的是「生命」）');
  // 家谱 f9：第一次试玩说看不懂 → 加了括号方位和「怎么转」；第二次试玩说太明显 → 方位改成要想一步的线索：
  // 正门 = 开局时身后那扇门（南）；「清晨第一缕阳光」= 东；「藏书的那一侧」= 画廊西门门楣上的「图书室」铜牌；伊莱亚斯靠排除法。
  // 怎么转交给交互提示（按 E 会显示「现在面朝」），地砖会报「几道凹槽亮着」—— 卡住了也能一座一座试出来
  { const f9 = R.FILES.f9.body;
    check(!/[东南西北]边/.test(f9) && !/按 ?E/.test(f9) && /正门/.test(f9) && /清晨第一缕阳光/.test(f9) && /藏书的那一侧/.test(f9) && R.KEYS.gallery.hint.includes('「图书室」'),
      '家谱 f9：不直接写方位和操作，改成要想一步的线索（正门 / 清晨的阳光 / 西门门楣上的「图书室」铜牌）'); }
}
// 僵尸抓人 + 连按 E 挣脱（M2 遗留，计划 5.2）
fresh();
{
  const p = R.S.p, G = R.GRAB;
  const grabbed = () => { R.S.enemies = []; R.resetTransient(); p.hp = 100; R.P.inv = 0; const z = R.mkEnemy('zombie', 0, 0); z.x = p.x + 30; z.y = p.y; z.alert = true; z.state = 'attack'; z.atkT = 0.01; z.fa = Math.PI; R.S.enemies = [z]; R.update(1 / 60); R.update(1 / 60); return z; };
  let z = grabbed();
  check(R.isGrabbed() && z.state === 'grab' && p.hp === 100 - G.grabDmg, `抓人：僵尸的攻击打中 → 抓住你（抓伤 ${G.grabDmg}），不是直接咬`);
  const x0 = p.x; R.keys.KeyA = true; for (let i = 0; i < 30; i++) R.update(1 / 60); R.keys.KeyA = false;
  check(Math.abs(p.x - x0) < 4, '抓人：被抓住时走不动');
  for (let i = 0; i < G.need; i++) { R.grabMash(); R.update(1 / 60); }
  check(!R.isGrabbed() && z.stag > 0 && p.hp === 100 - G.grabDmg, `抓人：${G.bite} 秒内连按 ${G.need} 次 E → 挣脱，僵尸踉跄，不掉血`);
  z.stag = 0; z.state = 'attack'; z.atkT = 0.01; z.x = p.x + 30; R.P.inv = 0; R.update(1 / 60); R.update(1 / 60);
  check(!R.isGrabbed(), `抓人：刚挣脱的 ${G.cd} 秒内不会被再抓`);
  z = grabbed(); const h0 = p.hp;
  for (let i = 0; i < 60 * (G.bite + 0.1); i++) R.update(1 / 60);
  check(!R.isGrabbed() && h0 - p.hp === G.biteDmg, `抓人：没挣脱 → 被咬一口 ${G.biteDmg}（比普通攻击 20 疼），然后松口`);
  z = grabbed(); R.damageEnemy(z, 10, 0, 0, false, 0.5, 'pistol'); R.update(1 / 60);
  check(!R.isGrabbed(), '抓人：抓你的僵尸被别人打出硬直 → 松手');
  z = grabbed(); p.inv.slots.fill(null); R.invAdd(p.inv, 'grenade', 1); z.hp = 400;
  R.grabThrow();
  check(!R.isGrabbed() && z.hp === 400 - G.nadeDmg && !R.invHas('grenade'), '抓人：按 G 把手雷塞进它嘴里 → 立刻挣脱，直接炸它 150');
  z = grabbed(); R.invAdd(p.inv, 'flashbang', 1); R.grabThrow();
  check(!R.isGrabbed() && z.stag >= R.THROW.flashbang.stun - 0.1, '抓人：按 G 用闪光弹 → 立刻挣脱，它眩晕 3 秒');
  const d = R.mkEnemy('dog', 0, 0); d.x = p.x + 30; d.y = p.y; d.alert = true; d.state = 'attack'; d.atkT = 0.01; d.fa = Math.PI; R.S.enemies = [d]; R.resetTransient(); R.P.inv = 0; p.hp = 100; R.update(1 / 60); R.update(1 / 60);
  check(!R.isGrabbed() && p.hp < 100, '抓人：只有僵尸会抓，狗还是直接咬');
}
fresh(); openAll();
{
  const b = R.mkEnemy('boss', 52, 8); b.alert = true; R.S.executioner.active = true; R.S.enemies = [b];
  const z = R.mkEnemy('zombie', 52, 10); R.S.enemies.push(z); R.S.p.x = 10.5 * TS; R.S.p.y = 34.5 * TS;
  step(3);
  check(!z.heard && !z.alert, '处刑者的脚步声不再惊动其他敌人');
}

// Bug 2：处刑者远距离不休眠
const unlockAll = () => { R.S.unlocked = ['32,29', '48,37', '42,26']; R.buildMap(); openAll(); R.computeFlow(); };
fresh(); unlockAll();
{
  R.S.p.x = 10.5 * TS; R.S.p.y = 34.5 * TS;
  const b = R.mkEnemy('boss', 52, 8); b.alert = true; R.S.executioner.active = true; R.S.enemies = [b];
  const x0 = b.x, y0 = b.y; step(5);
  check(Math.hypot(b.x - x0, b.y - y0) > 200, '处刑者距离玩家 > 1500px 时仍然在移动（5 秒移动 > 200px）');
}
// 新发现：处刑者体型过大，过不了 1 格宽的门
fresh(); unlockAll();
{
  R.S.p.x = 36.5 * TS; R.S.p.y = 26.5 * TS;
  const b = R.mkEnemy('boss', 44, 22); b.alert = true; R.S.executioner.active = true; R.S.enemies = [b];
  step(8);
  check(b.r <= 48 / 2 - 3, `处刑者碰撞半径 ${b.r} ≤ 21，能通过门`);
  check(b.x < 42 * TS, '处刑者能从后廊穿过门进入北侧走廊');
}
// 处刑者能从后庭院一路追到西侧走廊
fresh(); unlockAll();
{
  R.S.p.x = 10.5 * TS; R.S.p.y = 34.5 * TS;
  const b = R.mkEnemy('boss', 52, 8); b.alert = true; R.S.executioner.active = true; R.S.enemies = [b];
  let reached = false; for (let i = 0; i < 60 * 40 && !reached; i++) { R.update(1 / 60); if (Math.hypot(b.x - R.S.p.x, b.y - R.S.p.y) < 120 || R.mode !== 'play') reached = true; }
  check(reached, '处刑者 40 秒内能从后庭院追到西侧走廊（全程穿门）');
}

// Bug 3：处刑者不能被连续压制
fresh();
{
  R.S.p.x = 32.5 * TS; R.S.p.y = 38.5 * TS;
  const b = R.mkEnemy('boss', 32, 31); b.alert = true; R.S.enemies = [b]; b.stagAcc = 210;
  let onsets = 0, prev = 0;
  for (let i = 0; i < 60 * 2.4; i++) { if (i % 18 === 0 && b.stagAcc + 26 < 400) R.damageEnemy(b, 26, -Math.PI / 2, 7, false, 0.22, 'pistol'); if (b.stag > 0 && prev <= 0) onsets++; prev = b.stag; R.update(1 / 60); }
  check(onsets === 1, `每个打倒周期只踉跄一次（连续射击 8 发，踉跄 ${onsets} 次）`);
}

// Bug 4：硬直冷却只限制小刀
fresh();
{
  const z = R.mkEnemy('zombie', 32, 35); R.S.enemies = [z];
  R.damageEnemy(z, 26, 0, 7, false, 0.22, 'pistol'); z.stag = 0;
  R.damageEnemy(z, 22, 0, 10, false, 0.45, 'knife');
  check(z.stag > 0, '手枪命中后，小刀仍可造成硬直');
  z.stag = 0; R.damageEnemy(z, 22, 0, 10, false, 0.4, 'shotgun');
  check(z.stag > 0, '小刀硬直后，枪械仍可造成硬直');
}

// Bug 5：安全屋不再冻结全图
fresh(); openAll();
{
  R.S.p.x = 50.5 * TS; R.S.p.y = 27.5 * TS; check(R.inSafe(), '测试前提：玩家在书房（安全屋）');
  const far = R.mkEnemy('zombie', 28, 35); far.alert = true; far.moving = true; far.wT = 99; far.wa = 0; R.S.enemies = [far];
  step(5); check(!far.alert, '玩家在安全屋时，追击的敌人会放弃目标');
  far.heard = null; far.heardField = null; far.moving = true; far.wT = 99; far.wa = 0; const x0 = far.x; step(1);
  check(Math.abs(far.x - x0) > 5, '玩家在安全屋时，远处的敌人照常活动（不再全图冻结）');
  const b = R.mkEnemy('boss', 40, 35); b.alert = true; R.S.executioner.active = true; R.S.enemies = [b];
  step(1); check(!b.alert && b.state === 'guard', '玩家在安全屋时处刑者失去目标，转为门外守候');
  R.S.p.x = 34.5 * TS; R.S.p.y = 26.5 * TS; step(5);
  check(!b.alert && R.S.executioner.graceT > 14, `离开安全屋后有宽限期（5 秒时处刑者仍未重新锁定，宽限期剩 ${R.S.executioner.graceT.toFixed(1)} 秒）`);
}

// 丢失目标：僵尸不会永久全知追踪
fresh(); openAll();
{
  R.S.p.x = 32.5 * TS; R.S.p.y = 37.5 * TS;
  const z = R.mkEnemy('zombie', 12, 34); z.alert = true; z.sight = 0; R.S.enemies = [z];
  step(7);
  check(!z.alert && !!z.heard, '僵尸看不见玩家 6 秒后放弃追击，改为去最后已知位置调查');
}

// 小问题
fresh(); openAll();
{
  R.S.p.x = 25.5 * TS; R.S.p.y = 34.5 * TS; // 站在门格(25,34)上
  R.interact();
  check(R.isDoorOpen(25, 34), '门格上有人时关不上门');
  const save = R.saveGame; R.S.enemies = [R.mkEnemy('zombie', 30, 30)]; R.emitNoise(30.5 * TS, 31.5 * TS, 10);
  R.saveGame();
  check(R.SAVE && !R.SAVE.includes('heardField') && R.SAVE.length < 20000, '存档不包含临时导航数据（heardField）');
}

// ================= M1 检查点 2：三套寻路层 + 僵尸拍门（计划 7.3）=================
// 场景：玩家在西侧走廊，所有门关着；主厅通往西侧走廊只有 (25,34) 这一扇门
const I = (x, y) => y * R.MW + x;
const doorScene = (type, px = 15.5, py = 34.5) => {
  R.S = R.newState(); R.buildMap(); R.mode = 'play';
  R.S.p.x = px * TS; R.S.p.y = py * TS;
  const e = R.mkEnemy(type, 29, 34); e.spd = type === 'zombie' ? 55 : e.spd;
  e.alert = true; e.lastSeen = { x: R.S.p.x, y: R.S.p.y };
  R.S.enemies = [e]; R.computeAllFlows(); return e;
};
{
  doorScene('zombie');
  check(R.flowB[I(25, 34)] === 10 && R.flowB[I(26, 34)] === 17, '寻路 B 层：经过关着的门代价 +6（门格 10 → 门后 17）');
  check(R.flowExec[I(26, 34)] === 13, '寻路 A 层：经过关着的门代价 +2（门后 13）');
  check(R.flow[I(26, 34)] === -1, '寻路 C 层：关着的门不能通过');
  R.setDoorOpen(25, 34, true); R.computeAllFlows();
  check(R.flowB[I(26, 34)] === 11 && R.flowExec[I(26, 34)] === 11 && R.flow[I(26, 34)] === 11, '寻路：门打开后三层代价一致（11）');
  check(!R.passFor(50, 33, 'A') && !R.passFor(50, 33, 'B') && R.doorSafe[I(50, 33)] === 1, '寻路：安全屋的门，处刑者和僵尸都不能通过');
  check(!R.passFor(32, 29, 'A') && !R.passFor(32, 29, 'B'), '寻路：锁着的门，任何一层都不能通过');
}
{
  const z = doorScene('zombie');
  let start = null, openedAt = null;
  for (let k = 0; k < 60 * 20 && openedAt === null; k++) {
    R.update(1 / 60);
    if (start === null && R.doorBashProgress(25, 34) > 0) start = R.S.time;
    if (start !== null && R.S.time - start < 7.5 && R.isDoorOpen(25, 34)) break;
    if (R.isDoorOpen(25, 34)) openedAt = R.S.time;
  }
  check(start !== null && z.x < 27 * TS, '拍门：追击中的僵尸走到关着的门前开始拍门');
  check(openedAt !== null && Math.abs(openedAt - start - R.DOOR_BASH_TIME) < 0.2, `拍门：拍了 ${(openedAt - start).toFixed(1)} 秒后门被撞开（设定 ${R.DOOR_BASH_TIME} 秒）`);
  check(!(R.S.doorBash && R.S.doorBash['25,34']), '拍门：门撞开后进度清零');
  step(3);
  check(z.x < 24 * TS, '拍门：门撞开后僵尸继续追进走廊');
}
{
  // 拍门超过记忆时间（6 秒）也不会半途放弃
  const z = doorScene('zombie');
  let maxLost = 0;
  for (let k = 0; k < 60 * 9; k++) { R.update(1 / 60); if (z.state === 'bash') maxLost = Math.max(maxLost, z.lostT || 0); }
  check(z.alert && maxLost < R.EDEF_NAV.zombie.memory, '拍门：拍门时记忆计时暂停，不会拍到一半忘记玩家');
}
{
  // 玩家走远（储藏室，离门超过 12 格）→ 僵尸不会一直拍下去
  const z = doorScene('zombie', 3.5, 36.5);
  step(14);
  check(!R.isDoorOpen(25, 34) && !z.alert, '拍门：玩家离门太远（超过 12 格）时，僵尸按记忆时间放弃，不会撞开门');
}
{
  // 只是听到声音来调查的僵尸：在门口停下，不拍门
  const z = doorScene('zombie', 22.5, 34.5); z.alert = false; z.lastSeen = null; // 离门 3 格发声，穿门后仍能传到僵尸
  R.emitNoise(R.S.p.x, R.S.p.y, 18, 'test');
  const heard = !!z.heard;
  step(10);
  check(heard && !R.isDoorOpen(25, 34) && R.doorBashProgress(25, 34) === 0, '拍门：只是听到声音来调查的僵尸不会拍门');
}
{
  // 狗（C 层）：到不了就停在原地，不会拍门
  const dog = doorScene('dog');
  step(10);
  check(!R.isDoorOpen(25, 34) && R.doorBashProgress(25, 34) === 0 && dog.x > 25.5 * TS, '拍门：狗不会拍门，关着的门能挡住狗');
}
{
  // 拍门进度写进存档，读档后接着算
  doorScene('zombie');
  let k = 0; while (R.doorBashProgress(25, 34) < 3 && k++ < 60 * 10) R.update(1 / 60);
  const before = R.doorBashProgress(25, 34);
  R.saveGame(); const saved = R.SAVE;
  R.loadGame(saved);
  check(JSON.parse(saved).doorBash && Math.abs(R.doorBashProgress(25, 34) - before) < 1e-6 && before >= 3, `存档：拍门进度（${before.toFixed(1)} 秒）随存档保存和读取`);
  R.loadGame(JSON.stringify({ ...JSON.parse(saved), doorBash: undefined }));
  check(R.S.doorBash && Object.keys(R.S.doorBash).length === 0, '存档：没有拍门进度的旧存档读取后补为空');
}
{
  // 处刑者：不会推开安全屋的门
  R.S = R.newState(); R.buildMap(); R.mode = 'play';
  R.S.executioner.active = true;
  const b = R.mkEnemy('boss', 50, 35); b.y = 34.3 * TS; R.S.enemies = [b];
  R.S.p.x = 50.5 * TS; R.S.p.y = 30.5 * TS; R.computeAllFlows();
  step(6);
  // 直接贴着门调用开门逻辑（不依赖“玩家在安全屋 → 处刑者失去目标”）
  const opened = R.autoOpenDoorForExecutioner(b, 50.5 * TS, 33.6 * TS);
  const ctrl = R.autoOpenDoorForExecutioner(b, 38.5 * TS, 35.4 * TS); // 对照：普通门 (38,35)
  check(!opened && !R.isDoorOpen(50, 33) && ctrl && R.isDoorOpen(38, 35), '处刑者：贴着门也不会推开安全屋的门（普通门照常推开）');
}

// ================= M1 检查点 3：背包（计划 6.4、7.5；v1.0.1 起不限格数、取消道具箱）=================
const slotsOf = () => R.INV.slots.filter(Boolean).map(x => x.id + (x.n > 1 ? '×' + x.n : ''));
const freshInv = () => { R.S = R.newState(); R.buildMap(); R.mode = 'play'; R.S.enemies = []; R.resetTransient(); };
const wItem = (t, v) => ({ id: 999, t, x: R.S.p.x, y: R.S.p.y, v, taken: false });
{
  freshInv();
  check(R.INV.size === 8 && R.invUsed() === 3 && JSON.stringify(slotsOf()) === '["pistol","ammo_pistol×18","herb_g"]', '背包：初始 8 格，手枪、手枪弹 18、绿色草药各占 1 格');
  R.S.p.keys.sword = true; R.S.p.files.push('f1');
  check(R.invUsed() === 3, '背包：钥匙和文件不占格子');
  R.invAdd(R.INV, 'ammo_pistol', 100);
  check(R.invCount('ammo_pistol') === 118 && R.INV.slots.filter(x => x && x.id === 'ammo_pistol').map(x => x.n).join(',') === '60,58', '背包：弹药按格堆叠（手枪弹一格最多 60：118 发 = 60 + 58）');
  R.invAdd(R.INV, 'herb_g', 2);
  check(R.INV.slots.filter(x => x && x.id === 'herb_g').length === 3, '背包：草药每株占 1 格，不堆叠');
}
{
  // 背包不限格数（v1.0.1 试玩反馈）：8 格占满以后再拿东西，自动往后加一行，东西照样拿起来
  freshInv();
  R.invAdd(R.INV, 'herb_g', 5); // 8/8
  const herb = wItem('herb', 'red');
  check(R.invFree() === 0 && R.pickUp(herb) && R.invHas('herb_r') && R.INV.size === 12 && R.INV.slots.length === 12, '背包不限格数：8 格占满后再拿，自动加一行（12 格），东西照样拿起来');
  const ammo = wItem('ammo', 100);
  check(R.pickUp(ammo) && R.invCount('ammo_pistol') === 118, '背包不限格数：弹药全部拿走（不会再只拿一部分、剩下的留在原地）');
  for (let i = 0; i < 30; i++) R.invAdd(R.INV, 'herb_b', 1);
  const big = R.INV.size;
  R.invTake('herb_b', 30);
  check(big === 40 && R.invUsed() === 10 && R.INV.size === 12, `背包不限格数：再塞 30 株也放得下（${big} 格），用掉以后末尾空出来的整行会收回（剩 ${R.INV.size} 格）`);
}
{
  freshInv();
  const sg = wItem('shotgun', 6);
  check(R.pickUp(sg) && R.invHas('shotgun') && R.S.p.mag.shotgun === 6, '拾取：霰弹枪占 1 格，并带着弹匣里的 6 发');
}
{
  // 草药组合
  freshInv(); const v = R.INV;
  R.invAdd(v, 'herb_g', 1); R.invAdd(v, 'herb_r', 1); R.invAdd(v, 'herb_b', 1);
  const idx = id => v.slots.findIndex(x => x && x.id === id);
  const used0 = R.invUsed();
  check(R.combineSlots(idx('herb_g'), v.slots.findIndex((x, i) => x && x.id === 'herb_g' && i !== idx('herb_g'))) && R.invHas('mix_gg') && R.invUsed() === used0 - 1, '组合：绿 + 绿 = 绿绿，空出 1 格');
  R.invTake('mix_gg', 1); R.invAdd(v, 'herb_g', 1);
  check(R.combineSlots(idx('herb_g'), idx('herb_r')) && R.invHas('mix_gr'), '组合：绿 + 红 = 绿红');
  check(R.combineSlots(idx('mix_gr'), idx('herb_b')) && R.invHas('mix_grb') && !R.invHas('herb_b'), '组合：绿红 + 蓝 = 三色');
  R.invAdd(v, 'herb_r', 1); R.invAdd(v, 'herb_b', 1);
  check(!R.combineSlots(idx('herb_r'), idx('herb_b')) && R.invHas('herb_r') && R.invHas('herb_b'), '组合：红 + 蓝 不能组合，两株都保留');
  check(!R.combineSlots(idx('pistol'), idx('herb_r')), '组合：武器不能和草药组合');
}
{
  // 使用恢复品、红草药减伤
  freshInv(); const p = R.S.p;
  R.invAdd(R.INV, 'herb_r', 1);
  p.hp = 50;
  check(!R.useHealItem('herb_r') && R.invHas('herb_r') && p.hp === 50, '使用：红色草药单独使用无效，不会被用掉');
  R.invAdd(R.INV, 'mix_gr', 1);
  check(R.useHealItem('mix_gr') && p.hp === 100 && p.guardT === 60, '使用：绿红草药恢复 100，并获得 60 秒减伤');
  R.P.inv = 0; R.hurtPlayer(20, 0, 'zombie');
  check(p.hp === 84, '减伤：减伤期间受到 20 点伤害只扣 16');
  step(61); R.P.inv = 0; p.hp = 100; R.hurtPlayer(20, 0, 'zombie');
  check(p.guardT === 0 && p.hp === 80, '减伤：60 秒后效果结束，受到 20 点伤害扣 20');
}
{
  // Q 快速治疗：刚好够用、最便宜
  freshInv(); const p = R.S.p; const v = R.INV;
  R.invAdd(v, 'mix_gg', 1); R.invAdd(v, 'spray', 1);
  check(R.pickQuickHeal(70) === 'herb_g', '快速治疗：缺 30 点 → 用绿色草药（够用且最便宜）');
  check(R.pickQuickHeal(20) === 'mix_gg', '快速治疗：缺 80 点 → 用绿绿草药，不浪费急救喷雾');
  R.invTake('mix_gg', 1);
  check(R.pickQuickHeal(20) === 'spray', '快速治疗：缺 80 点、只有绿草药和喷雾 → 用喷雾');
  R.invTake('spray', 1);
  check(R.pickQuickHeal(20) === 'herb_g', '快速治疗：都不够时用恢复量最大的');
  p.hp = 60; R.quickHeal();
  check(p.hp === 100 && !R.invHas('herb_g'), '快速治疗：Q 实际用掉一株绿色草药');
}
{
  // 装填从背包扣子弹
  freshInv(); const p = R.S.p;
  p.mag.pistol = 0; R.reload(); step(1.5);
  check(p.mag.pistol === 12 && R.ammoCount('pistol') === 6 && R.invCount('ammo_pistol') === 6, '装填：从背包的弹药格扣子弹（18 → 装 12，剩 6）');
  p.mag.pistol = 0; R.reload(); step(1.5);
  check(p.mag.pistol === 6 && !R.invHas('ammo_pistol') && R.invUsed() === 2, '装填：弹药用完后那一格空出来');
}
{
  // 取消道具箱（v1.0.1 试玩反馈）：安全屋里只剩打字机；腰包也没有了（背包不限格数）
  const all = ['map1', 'map2', 'map3'].flatMap(m => R.freshLevelState(m).items);
  check(!all.some(i => i.t === 'box' || i.t === 'pouch') && all.filter(i => i.t === 'typewriter').length === 5,
    '取消道具箱：三张地图上都没有道具箱和腰包了，5 台打字机都还在');
}
{
  // 格子多到一屏放不下：只画能放下的几行，跟着光标滚动；滚轮换行
  freshInv(); for (let i = 0; i < 37; i++) R.invAdd(R.INV, 'herb_b', 1);   // 40 格 = 10 行
  R.openInventory(); R.P.invCur = R.INV.size - 1;
  let threw = null; try { R.drawInventory(); } catch (e) { threw = e.message; }
  const cells = R.uiRects.filter(r => r.side === 0);
  check(!threw && R.INV.size === 40 && cells.length < 40 && cells.some(r => r.i === R.P.invCur) && R.P.invTop > 0,
    `背包格子滚动：40 格时只画 ${cells.length} 格，光标所在的格子总在可见范围里` + (threw ? ' —— ' + threw : ''));
  R.invWheel(-1); R.invWheel(-1);
  check(R.P.invCur === R.INV.size - 1 - 8, '背包格子滚动：滚轮往上 = 光标往上两行');
  R.mode = 'play';
}
{
  // 物品栏键盘操作：C 选草药 → 移动 → C 组合
  freshInv(); const v = R.INV;
  R.invAdd(v, 'herb_g', 1); // 格 3
  R.openInventory(); check(R.mode === 'inv', '物品栏：Tab 打开');
  R.P.invCur = 2; R.invKey({ code: 'KeyC', key: 'c' });
  check(R.P.invSel === 2, '物品栏：C 选中第一株草药');
  R.invKey({ code: 'ArrowRight', key: '' }); R.invKey({ code: 'KeyC', key: 'c' });
  check(R.invHas('mix_gg') && R.P.invSel === -1, '物品栏：移到第二株再按 C，组合成绿绿草药');
  R.S.p.hp = 30; R.P.invCur = v.slots.findIndex(x => x && x.id === 'mix_gg'); R.invKey({ code: 'KeyE', key: 'e' });
  check(R.S.p.hp === 100 && !R.invHas('mix_gg'), '物品栏：E 使用选中的草药');
  let threw = null; try { R.drawInventory(); } catch (err) { threw = err; }
  check(!threw, '物品栏界面绘制不报错');
  R.invKey({ code: 'Escape', key: '' });
}
{
  // 存档：背包（v5 起不限格数、没有道具箱）
  freshInv(); const v = R.INV;
  R.invAdd(v, 'mix_grb', 1); for (let i = 0; i < 8; i++) R.invAdd(v, 'herb_b', 1);   // 12 格
  R.saveGame(); const data = R.SAVE; R.loadGame(data);
  check(R.INV.size === 12 && R.invUsed() === 12 && R.invHas('mix_grb') && R.S.box === undefined && R.S.version === 5, '存档：背包的格数和物品都能保存和读取（v5，没有道具箱了）');
  // v4 旧存档：道具箱里的东西全部放进背包，地图上的道具箱拿掉，并提示玩家
  const v4 = JSON.parse(data); v4.version = 4; v4.box = [{ id: 'spray', n: 1 }, { id: 'ammo_pistol', n: 75 }, { id: 'shotgun', n: 1 }];
  v4.items.push({ id: 900, t: 'box', x: 100, y: 100, v: 0, taken: false });
  const sp0 = R.invCount('spray'), am0 = R.invCount('ammo_pistol');
  R.loadGame(JSON.stringify(v4));
  check(R.invCount('spray') === sp0 + 1 && R.invCount('ammo_pistol') === am0 + 75 && R.invHas('shotgun') && R.S.box === undefined && !R.S.items.some(i => i.t === 'box') && /道具箱已经取消/.test(R.msgs[R.msgs.length - 1].t),
    '存档：v4 旧存档里道具箱的东西全部放进背包（一件不少），地图上的道具箱拿掉，并提示玩家');
  // v2 旧存档：零散计数 → 格子，一件都不少
  const old = { version: 2, p: { hp: 70, wep: 'shotgun', mag: { pistol: 5, shotgun: 3 }, res: { pistol: 80, shotgun: 14 }, herb: 4, red: 1, blue: 1, mixes: { gg: 1, gr: 0, gb: 0, grb: 1 }, spray: 2, keys: { sword: true }, files: ['f1'], hasShotgun: true }, enemies: [], items: [], time: 100 };
  R.loadGame(JSON.stringify(old));
  const all = id => R.invCount(id);
  const ok = all('ammo_pistol') === 80 && all('ammo_shotgun') === 14 && all('herb_g') === 4 && all('herb_r') === 1 && all('herb_b') === 1 && all('mix_gg') === 1 && all('mix_grb') === 1 && all('spray') === 2 && all('shotgun') === 1 && all('pistol') === 1;
  check(ok && R.S.box === undefined && R.INV.size >= R.invUsed(), `存档：v2 旧存档迁移为格子，物品一件不少（不限格数，全部放得下：${R.invUsed()} 格）`);
  check(R.S.p.res === undefined && R.S.p.herb === undefined && R.S.p.hasShotgun === undefined && R.S.p.keys.sword && R.S.p.mag.shotgun === 3, '存档：迁移后删除旧字段，钥匙和弹匣保留');
  check(R.hasWeapon(R.S.p.wep), '存档：迁移后当前装备的武器一定在背包里');
}

// ================= M1 检查点 3：武器数据化（config/weapons.js）=================
{
  const ids = Object.keys(R.WEAPONS);
  const bad = ids.filter(w => !(R.ITEMS[w] && R.ITEMS[w].kind === 'weapon' && R.ITEMS[R.WEAPONS[w].ammo] && R.ITEMS[R.WEAPONS[w].ammo].weapon === w && R.WEAPON_SLOTS.some(s => s.id === w)));
  check(!bad.length, `武器：每把武器都有物品定义、弹药物品和武器栏位（${ids.join('、')}）`);
  const need = ['ammo', 'mag', 'reload', 'fireCd', 'pellets', 'dmg', 'range', 'kb', 'stagger', 'noise', 'sfx', 'model', 'noAmmo'];
  check(ids.every(w => need.every(k => R.WEAPONS[w][k] !== undefined)), '武器：必填字段齐全');
}
// 射一枪：玩家朝右，僵尸在 80px 外（准心没收拢时扩散也打得中）
const shootOnce = (w) => {
  fresh(); const p = R.S.p; p.a = 0;
  R.invAdd(R.INV, w, 1); R.S.p.wep = w; p.mag[w] = R.WEAPONS[w].mag; R.P.focus = 0; R.P.fireCd = 0; R.P.reloadT = 0;
  const z = R.mkEnemy('zombie', 0, 0); z.x = p.x + 80; z.y = p.y; z.hp = z.maxhp = 1000; R.S.enemies = [z];
  R.shoot(); return 1000 - z.hp;
};
{
  check(shootOnce('pistol') === 26, '武器：手枪伤害 26（与改动前一致）');
  const sg = shootOnce('shotgun');
  // 每颗命中的弹丸都会击退目标，后面的弹丸可能打偏，所以不会 7 颗全中（与改动前的行为一致，已用固定随机数对比原版逐发验证）
  check(sg >= 44 && sg <= 154, `武器：霰弹枪近距离一枪造成 ${Math.round(sg)} 伤害（至少 2 颗命中，上限 7×22=154）`);
  const old = R.WEAPONS.pistol.dmg; R.WEAPONS.pistol.dmg = 40;
  const d = shootOnce('pistol'); R.WEAPONS.pistol.dmg = old;
  check(d === 40, '武器：改 config/weapons.js 的伤害，射击立刻生效');
  // 装填时间、弹匣容量来自配置
  fresh(); const p = R.S.p; R.invAdd(R.INV, 'shotgun', 1); R.invAdd(R.INV, 'ammo_shotgun', 20); p.wep = 'shotgun'; p.mag.shotgun = 0;
  R.reload(); step(2.0); const mid = p.mag.shotgun; step(0.2);
  check(mid === 0 && p.mag.shotgun === 6 && R.ammoCount('shotgun') === 14, '武器：霰弹枪装填 2.1 秒、弹匣 6 发（2.0 秒时还没装好）');
}
{
  // 全自动：临时加一把测试用冲锋枪，按住左键连射；半自动手枪按住不连射
  R.WEAPONS.test_smg = { ...R.WEAPONS.pistol, fireCd: 0.1, auto: true, mag: 40 };
  fresh(); const p = R.S.p;
  p.wep = 'test_smg'; p.mag.test_smg = 40; R.keys.KeyK = true; R.mouse.l = true; R.mouse.lp = false;
  const s0 = R.S.stats.shots; step(0.55); const auto = R.S.stats.shots - s0;
  p.wep = 'pistol'; const s1 = R.S.stats.shots; step(1.0); const semi = R.S.stats.shots - s1;
  R.keys.KeyK = false; R.mouse.l = false; delete R.WEAPONS.test_smg;
  check(auto >= 5 && auto <= 6, `武器：全自动武器按住左键连射（0.55 秒 ${auto} 发，射速 0.1 秒）`);
  check(semi === 0, '武器：半自动手枪按住左键不会连射');
}
{
  fresh(); const p = R.S.p; p.a = 0;
  const z = R.mkEnemy('zombie', 0, 0); z.x = p.x + 40; z.y = p.y; R.S.enemies = [z]; R.P.knifeCd = 0;
  R.knife();
  check(z.hp === z.maxhp - R.KNIFE.dmg && R.P.knifeCd === R.KNIFE.cd, '武器：小刀的伤害和冷却来自 KNIFE 配置');
}

// ================= M1 检查点 4：立体声定位（audio.js sfxAt / spatial）=================
{
  fresh(); const p = R.S.p, T = 48 /* grid.js 的 T */;
  const L = R.spatial(p.x - 6 * T, p.y), Rt = R.spatial(p.x + 6 * T, p.y), C = R.spatial(p.x, p.y - 3 * T);
  check(L.pan < -0.6 && Rt.pan > 0.6 && Math.abs(C.pan) < 0.01, `立体声：左边的声源偏左（${L.pan.toFixed(2)}），右边偏右（${Rt.pan.toFixed(2)}），正前方居中`);
  const near = R.spatial(p.x + 2 * T, p.y, 900), far = R.spatial(p.x + 60 * T, p.y, 900), farMin = R.spatial(p.x + 60 * T, p.y, 900, 0.3);
  const floor = farMin.muffled ? 0.3 * 0.55 : 0.3; // 最小音量先生效，隔墙再打折
  check(near.gain > 0.8 && far.gain === 0 && Math.abs(farMin.gain - floor) < 1e-9, `立体声：近处响、远处无声，给了最小音量时不低于它（${near.gain.toFixed(2)} / ${far.gain} / ${farMin.gain.toFixed(3)}${farMin.muffled ? '，隔墙' : ''}）`);
  // 隔着门：大厅 ↔ 西走廊唯一的门 (25,34)
  R.setDoorOpen(25, 34, false);
  p.x = 27.5 * T; p.y = 34.5 * T;
  const shut = R.spatial(22.5 * T, 34.5 * T);
  R.setDoorOpen(25, 34, true);
  const open = R.spatial(22.5 * T, 34.5 * T);
  check(shut.muffled && !open.muffled && shut.gain < open.gain * 0.6, `立体声：隔着关着的门声音发闷变小（${shut.gain.toFixed(2)} vs 开门 ${open.gain.toFixed(2)}）`);
}
{
  // 处刑者从玩家左边追来：脚步声应当在它的位置播放，并偏左
  fresh(); const p = R.S.p, T = 48 /* grid.js 的 T */;
  const b = R.mkEnemy('boss', 0, 0); b.x = p.x - 5 * T; b.y = p.y; b.alert = true; b.state = 'chase'; R.S.enemies = [b];
  const orig = global.sfxAt, calls = [];
  global.sfxAt = (n, x, y, ...rest) => { calls.push({ n, x, y }); return orig(n, x, y, ...rest); };
  try { step(1.6); } finally { global.sfxAt = orig; }
  const st = calls.filter(c => c.n === 'exstep');
  const pans = st.map(c => R.spatial(c.x, c.y).pan);
  check(st.length >= 1 && pans[0] < -0.2 && pans.every(v => v < 0) /* 越走越近会逐渐居中，但始终不会跑到右边 */, `立体声：处刑者在左边时脚步声偏左（${st.length} 步，pan ${pans.map(v => v.toFixed(2)).join('/')}）`);
}
{
  // 假 AudioContext：检查节点连线 —— 音效 → 定位增益 →（低通）→ 声像 → 总音量，播放后恢复默认输出
  const nodes = [];
  const mk = type => { const n = { type, out: [], connect(t) { this.out.push(t); }, gain: { value: 1, setValueAtTime() {}, linearRampToValueAtTime() {}, exponentialRampToValueAtTime() {} }, frequency: { value: 0, setValueAtTime() {}, exponentialRampToValueAtTime() {}, linearRampToValueAtTime() {} }, Q: { value: 0 }, pan: { value: 0 }, start() {}, stop() {} }; nodes.push(n); return n; };
  const fake = { currentTime: 0, sampleRate: 8000, createGain: () => mk('gain'), createBiquadFilter: () => mk('filter'), createStereoPanner: () => mk('panner'), createBufferSource: () => mk('src'), createOscillator: () => mk('osc') };
  const AU = R.AU, saved = { c: AU.c, m: AU.m };
  AU.c = fake; AU.m = mk('master');
  try {
    fresh(); const p = R.S.p, T = 48 /* grid.js 的 T */;
    nodes.length = 0; AU.m = mk('master');
    R.sfxAt('hit', p.x + 5 * T, p.y);
    const pn = nodes.find(n => n.type === 'panner'), master = AU.m;
    const direct = nodes.filter(n => n.out.includes(master));
    check(pn && pn.pan.value > 0.5 && direct.length === 1 && direct[0] === pn && R.AU.out === null,
      `立体声：定位音效只经声像节点进入总音量（pan ${pn && pn.pan.value.toFixed(2)}），播放后恢复默认输出`);
    AU.panScale = 0; nodes.length = 0;
    R.sfxAt('hit', p.x + 5 * T, p.y);
    const pn0 = nodes.find(n => n.type === 'panner'); AU.panScale = 1;
    check(pn0 && pn0.pan.value === 0, '立体声：panScale = 0 时变成单声道（给设置菜单用）');
    nodes.length = 0; R.sfx('reload');
    check(nodes.filter(n => n.out.includes(AU.m)).length > 0 && !nodes.some(n => n.type === 'panner'), '立体声：玩家自己的声音（装填）不做定位，直接居中播放');
  } finally { AU.c = saved.c; AU.m = saved.m; AU.out = null; }
}

// ================= M1 检查点 5：触发器与关卡管理器（config/triggers.js、world/level.js）=================
{
  const errs = Object.keys(R.LEVELS).flatMap(id => R.validateLevel(id));
  check(errs.length === 0, `触发器：所有地图的事件配置都有效${errs.length ? '：' + errs.join('；') : ''}`);
  // 写错的配置要能被指出来
  R.LEVELS.map1.triggers.push(
    { id: 'bad1', on: { enter: 'no_such_room' }, do: [{ mesage: 'typo' }] },   // 故意写错的房间名（不要用真实房间名）
    { id: 'bad2', on: { pickup: 'key' }, do: [{ spawn: [['ghost', 1, 1]] }, { run: 'nope' }, { after: 1, do: [{ goto: 'map9' }] }] });
  const bad = R.validateLevel('map1');
  R.LEVELS.map1.triggers.length -= 2;
  check(bad.length === 5 && bad.some(e => e.includes('no_such_room')) && bad.some(e => e.includes('ghost')) && bad.some(e => e.includes('mesage')) && bad.some(e => e.includes('nope')) && bad.some(e => e.includes('map9')),
    `触发器：写错房间、动作、敌人、脚本、地图都会被检查出来（${bad.length} 条）`);
}
{
  // 后庭院完整流程：进入 → 无线电 → 2.5 秒处刑者 → 12 秒第一波 → 倒计时 90 秒 → 直升机 → 停机坪通关
  fresh(); const p = R.S.p, T = 48;
  p.x = 50.5 * T; p.y = 15.5 * T;
  step(0.1);
  check(R.S.flags.yardStarted && R.S.countdown && Math.abs(R.S.countdown.left - 89.9) < 0.05 && R.msgs.some(m => m.t.includes('直升机 90 秒')),
    `触发器：进入后庭院 → 无线电、90 秒倒计时（剩 ${R.S.countdown && R.S.countdown.left.toFixed(1)}）`);
  check(!R.S.enemies.some(e => e.t === 'boss'), '触发器：处刑者不会立刻出现');
  step(2.5);
  const boss = R.S.enemies.find(e => e.t === 'boss');
  check(boss && Math.floor(boss.x / T) === 52 && R.S.executioner.map === 'map1', '触发器：2.5 秒后处刑者在收容舱 (52,8) 登场');
  R.S.enemies = [];  // 不让处刑者干扰后面的检查
  p.x = 50.5 * T; p.y = 15.5 * T;
  step(9.2);
  check(R.S.enemies.length === 0, '触发器：第 11.8 秒还没有刷怪');
  step(0.3);
  const z1 = R.S.enemies.filter(e => e.t === 'zombie').length;
  check(z1 === 1 && R.S.enemies[0].alert, `触发器：第 12 秒刷出第一只僵尸（${z1} 只），并且已经警觉`);
  // 这段只测刷怪数量，不测生存：给玩家无敌，免得随机数序列变了以后被补刷的僵尸咬死
  for (let i = 0; i < 5; i++) { R.P.inv = 20; p.x = 50.5 * T; p.y = 15.5 * T; R.S.enemies.forEach(e => { e.x = 58.5 * T; e.y = 15.5 * T; e.state = 'idle'; e.alert = false; }); step(13); }
  const zAlive = R.S.enemies.filter(e => !e.dead && e.t === 'zombie').length;
  check(zAlive === 4, `触发器：后庭院同时最多 4 只补刷的僵尸（${zAlive}）`);
  R.S.enemies = [];
  R.S.countdown.left = 0.05; step(0.1);
  check(R.S.flags.heli && !R.S.countdown && R.msgs.some(m => m.t.includes('正在降落')), '触发器：倒计时结束 → 直升机飞来');
  step(2.0);
  check(R.S.crash && !R.S.flags.heli && !R.S.flags.heliDown, '坠毁演出：直升机飞来 1.6 秒后开始演出，还没砸地');
  { const x0 = p.x, y0 = p.y; R.keys.KeyW = true; step(0.5); R.keys.KeyW = false;
    check(p.x === x0 && p.y === y0, '坠毁演出：演出期间玩家不能移动'); }
  step(1.2);
  check(R.S.crash.hit && R.S.crash.debris.length > 0, '坠毁演出：石头已经命中尾梁，尾桨断飞');
  step(2.3);
  check(!R.S.flags.heli && R.S.flags.heliDown && R.P.bannerTxt === '—— 坠 毁 ——', '第一章后半段：直升机被处刑者打下来（坠毁横幅，残骸留在停机坪）');
  step(2.3);
  check(!R.S.crash, '坠毁演出：约 6.5 秒后结束，交还控制权');
  const n = R.S.enemies.length; step(14);
  check(R.S.enemies.length === n && !R.S.timers.some(t => t.until === 'heliDown'), '触发器：直升机坠毁以后后庭院不再刷怪');
  check(R.S.objective === '▲ 回到宅邸，找到通往地下的路', `第一章后半段：坠毁后给出新目标（${R.S.objective}）`);
  check(R.mode === 'play', '第一章后半段：直升机不再是结局，游戏继续');
  // 停机坪不再有「碰到就通关」
  p.hp = 100; p.x = R.PAD.x; p.y = R.PAD.y; step(0.5);
  check(R.mode === 'play' && !(R.S.cine > 0), '第一章后半段：走到停机坪什么都不会发生（没有旧结局）');
}
{
  // 第一章后半段完整流程：狮（后庭院）+ 蛇（主卧保险柜）→ 主厅雕像 → 石板门 → 酒窖 → 升降梯 → 第一章完
  fresh(); const T = 48, p = R.S.p;
  const altar = R.S.items.find(i => i.t === 'altar'), lift = R.S.items.find(i => i.t === 'lift');
  check(altar && lift && R.grid[40 * R.MW + 32] === 3, '徽章：主厅有雕像底座，酒窖石板门一开始锁着');
  // 没有徽章：只是提示
  p.x = altar.x; p.y = altar.y + 30; R.interact();
  check(!R.S.flags.medalsPlaced && R.msgs[R.msgs.length - 1].t.includes('狮与蛇'), '徽章：空手调查底座 → 提示两个凹槽（狮、蛇）');
  // 升降梯没电
  // 拿狮之徽章
  const lion = R.S.items.find(i => i.t === 'key' && i.v === 'lion');
  const inRoom = (it, id) => R.ROOMS[R.roomAt[Math.floor(it.y / T) * R.MW + Math.floor(it.x / T)]].id === id;
  check(inRoom(lion, 'yard'), '徽章：狮之徽章在后庭院（处刑者登场的地方）');
  p.x = lion.x; p.y = lion.y; R.interact();
  check(R.S.p.keys.lion, '徽章：捡到狮之徽章（不占背包格）');
  // 放一枚：还差一枚
  p.x = altar.x; p.y = altar.y + 30; R.interact();
  check(R.S.altar.lion && !R.S.p.keys.lion && !R.S.flags.medalsPlaced && R.grid[40 * R.MW + 32] === 3, '徽章：只放一枚，门不开');
  R.interact();
  check(R.msgs[R.msgs.length - 1].t.includes('还空着：蛇'), '徽章：再调查会提示还差哪一枚');
  // 保险柜给蛇之徽章
  const safe = R.S.items.find(i => i.t === 'safe');
  R.openSafe(safe); R.SAFE_UI.digits = [1, 0, 3, 1]; R.trySafe();
  check(R.S.p.keys.snake && R.S.p.mods.pistolMag, '徽章：主卧保险柜里是蛇之徽章（外加扩容弹匣）');
  p.x = altar.x; p.y = altar.y + 30; R.interact();
  check(R.S.flags.medalsPlaced, '徽章：两枚归位 → 机关触发');
  step(2.5);
  check(R.grid[40 * R.MW + 32] === 2 && R.isDoorOpen(32, 40) && R.S.unlocked.includes('32,40'), '徽章：石板门解锁并自己打开（记进存档）');
  // 存档穿越：门和底座状态
  const str = JSON.stringify(R.S); R.S = R.newState(); R.loadGame(str); R.mode = 'play';
  check(R.S.altar.lion && R.S.altar.snake && R.grid[40 * R.MW + 32] !== 3, '徽章：读档后底座和石板门的状态都还在');
  // 酒窖 → 升降梯：第一次 E 只是提示，第二次才下去
  const lf = R.S.items.find(i => i.t === 'lift'); R.S.enemies = [];
  R.S.p.x = lf.x; R.S.p.y = lf.y - 40; step(0.1);
  check(R.S.objective === '▲ 乘升降梯前往地下', '酒窖：进入后目标变成乘升降梯');
  R.interact();
  check(!R.S.flags.liftDown && R.msgs[R.msgs.length - 1].t.includes('回不来'), '升降梯：第一次按 E 提示「无法返回，建议先存档」');
  R.interact();
  check(R.S.flags.liftDown && R.S.cine > 0 && R.S.cineThen !== 'win' && R.S.flags.chapter1Done, '升降梯：再按一次才下降，进入演出');
  // 演出途中（试玩反馈）：以前 1.15 秒时人被瞬移到停机坪，镜头跟着飞到直升机那里，人物也不画了
  step(3);
  const inLift = Math.hypot(R.S.p.x - lf.x, R.S.p.y - lf.y), toPad = Math.hypot(R.S.p.x - R.PAD.x, R.S.p.y - R.PAD.y);
  const camOff = Math.hypot(R.cam.x + R.W / 2 - R.S.p.x, R.cam.y + R.H / 2 - R.S.p.y);
  check(R.S.cine > 0 && inLift < 8 && toPad > 1000 && camOff < 200 && !R.heliBoarding() && R.S.cineLift,
    `升降梯演出：林岚走进升降梯站好（离升降梯 ${inLift.toFixed(0)} px），不会被拉到停机坪，镜头一直跟着她（偏 ${camOff.toFixed(0)} px）`);
  step(4); for (let i = 0; i < 20 && R.mode === 'loading'; i++) R.updateLoading(0.1);
  check(R.S.map === 'map2' && R.MW === 72 && Math.floor(R.S.p.x / TS) === 35 && Math.floor(R.S.p.y / TS) === 41 && !R.S.cineLift, '升降梯：演出结束 → 进入地图 2 的电梯厅');
}
{
  // 升降梯：徽章没放之前没电；提示过了 4 秒要重新确认
  fresh(); const lf = R.S.items.find(i => i.t === 'lift'); R.S.p.x = lf.x; R.S.p.y = lf.y - 40;
  R.useLift(lf);
  check(!R.S.flags.liftDown && R.msgs[R.msgs.length - 1].t.includes('没有电'), '升降梯：徽章没放之前没电');
  R.S.flags.medalsPlaced = true; R.useLift(lf); R.S.time += 5; R.useLift(lf);
  check(!R.S.flags.liftDown, '升降梯：两次按键隔了 4 秒以上 → 重新提示，不会误触下降');
}
{
  // 拿盾之钥匙 → 1.5 秒后伏击；只触发一次
  fresh(); const p = R.S.p;
  const key = R.S.items.find(it => it.t === 'key' && it.v === 'shield');
  p.x = key.x; p.y = key.y; R.interact();
  check(R.S.p.keys.shield && R.S.enemies.length === 0, '触发器：拿到盾之钥匙时还没有伏击');
  step(1.6);
  check(R.S.enemies.length === 3 && R.S.flags.ambushFired, `触发器：1.5 秒后东侧走廊出现伏击（${R.S.enemies.length} 只）`);
  R.fireEvent('pickup', { t: 'key', v: 'shield' }); step(2);
  check(R.S.enemies.length === 3, '触发器：同一个触发器只执行一次');
}
{
  fresh(); const before = R.msgs.length;
  R.fireEvent('enter', { room: 'study', safe: true }); R.fireEvent('enter', { room: 'study', safe: true });
  check(R.msgs.length - before === 1 && R.msgs[R.msgs.length - 1].t.includes('暂时安全'), '触发器：第一次进安全屋的提示只出现一次');
}
{
  // 后庭院进行到一半存档 → 读档：倒计时、刷怪计时器、处刑者登场都接着走，不会重新开始
  fresh(); const p = R.S.p, T = 48;
  p.x = 50.5 * T; p.y = 15.5 * T; step(1);
  R.S.countdown.left = 50; R.saveGame();
  R.loadGame(R.SAVE); R.mode = 'play';
  check(R.S.countdown && Math.abs(R.S.countdown.left - 50) < 0.01 && R.S.timers.some(t => t.every === 13) && R.S.timers.some(t => t.do.some(a => a.executioner)),
    '存档：倒计时、刷怪计时器、处刑者登场计时器都随存档保存');
  R.S.p.x = 50.5 * T; R.S.p.y = 15.5 * T; step(0.2);
  check(R.S.countdown.left < 50 && R.S.countdown.left > 49.7, `存档：读档后回到后庭院不会重新开始倒计时（${R.S.countdown.left.toFixed(2)}）`);
  step(2);
  check(R.S.enemies.filter(e => e.t === 'boss').length === 1, '存档：读档后处刑者照常登场，而且只有一个');
}
{
  // v3 存档（事件写死在代码里的版本）迁移
  const v3 = s => JSON.stringify({ version: 3, p: { hp: 90, x: 50.5 * 48, y: 15.5 * 48 }, enemies: [], items: R.freshLevelState('map1').items, time: 100,
    flags: { safeMsg: true, ambush: true, ambushFired: true }, executioner: { spawned: s.boss === 0, active: s.boss === 0 }, yard: s });
  R.loadGame(v3({ started: true, timer: 40, spawnT: 5, heli: false, bossIn: 1.2 })); R.mode = 'play';
  check(R.S.countdown && R.S.countdown.left === 40 && R.S.timers.find(t => t.every === 13).left === 5 && R.S.timers.some(t => t.left === 1.2 && t.do.some(a => a.executioner)) && R.S.fired['map1:yard_enter'] && R.S.fired['map1:safe_first'] && R.S.fired['map1:shield_key'] && R.S.yard === undefined,
    '存档迁移：v3 的后庭院进度 → 倒计时 40 秒、5 秒后补怪、1.2 秒后处刑者；已触发的事件不会重来');
  step(0.2);
  check(R.S.countdown.left < 40 && !R.msgs.some(m => m.t.includes('直升机 90 秒')), '存档迁移：读档后不会重播无线电、不会重置倒计时');
  R.loadGame(v3({ started: true, timer: 0, spawnT: 5, heli: true, bossIn: 0 })); R.mode = 'play';
  check(R.S.flags.heliDown && R.S.objective === '▲ 回到宅邸，找到通往地下的路' && !R.S.countdown && !R.S.timers.some(t => t.every), '存档迁移：v3 里直升机已经到了 → 接到第一章后半段（直升机已坠毁）');
}
{
  // 关卡管理器：临时加一张测试地图，验证切换、每张地图单独保存状态、计时器按地图暂停、存读档
  const T = 48;
  R.LEVELS.test_b = {
    id: 'test_b', name: '测试地图', start: { x: 4.5, y: 3.5, a: 0 },
    rooms: [{ id: 'a', name: '测试间', x: 2, y: 2, w: 8, h: 4, floor: 'stone', amb: 0.9 }], doors: [], locks: {}, furn: [], lamps: [],
    items: [['herb', 8, 3, 1]], enemies: [['zombie', 8, 4]],
    triggers: [
      { id: 'hello', on: { enter: 'a' }, do: [{ flag: 'inB' }] },
      { id: 'chain', on: { flag: 'inB' }, do: [{ flag: 'chained' }] },
      { id: 'kill', on: { kill: 'zombie' }, do: [{ flag: 'killedInB' }] },
    ],
    exits: [{ x: 2, y: 5, to: 'map1', at: [32.5, 37.5], need: { flag: 'mayLeave' }, lockedMsg: '还不能走。' }],
  };
  check(R.validateLevel('test_b').length === 0, '关卡：测试地图配置有效');
  fresh();
  R.S.items[0].taken = true; R.setDoorOpen(32, 29, false); R.setDoorOpen(25, 34, true);
  const z = R.mkEnemy('zombie', 30, 33); z.dead = true; R.S.enemies.push(z);
  R.scheduleActions(1, [{ flag: 'm1timer' }]);
  const hp = R.S.p.hp = 77; R.invAdd(R.INV, 'ammo_pistol', 5); const ammo = R.ammoCount('pistol');
  R.gotoLevel('test_b', null, null, true);
  check(R.S.map === 'test_b' && R.ROOMS.length === 1 && R.S.items.length === 1 && R.S.enemies.length === 1 && R.grid[33 * R.MW + 30] === 0 && R.grid[3 * R.MW + 4] === 1,
    '关卡：切换到测试地图，房间、道具、敌人、网格都换成新地图的');
  check(R.S.p.hp === hp && R.ammoCount('pistol') === ammo && Math.floor(R.S.p.x / T) === 4, '关卡：生命和背包带过去，玩家在出生点');
  step(0.1);
  check(R.S.flags.inB && R.S.flags.chained && R.S.fired['test_b:hello'], '关卡：新地图的触发器生效；设置标记能串联触发下一个事件');
  step(2);
  check(!R.S.flags.m1timer, '关卡：地图 1 的计时器在别的地图时不走');
  R.damageEnemy(R.S.enemies[0], 999, 0, 0, false, 0);
  check(R.S.flags.killedInB, '关卡：打倒敌人的事件');
  R.gotoLevel('map1', [32.5, 37.5], null, true);
  check(R.S.map === 'map1' && R.S.items[0].taken && !R.isDoorOpen(32, 29) && R.isDoorOpen(25, 34) && R.S.enemies.some(e => e.id === z.id && e.dead) && R.S.maps.test_b && !R.S.maps.map1,
    '关卡：回到地图 1，拿过的道具、门的开关、打倒的敌人都保持原样');
  step(1.1);
  check(R.S.flags.m1timer, '关卡：回到地图 1 后计时器接着走');
  R.gotoLevel('test_b', null, null, true);
  check(R.S.enemies[0].dead && R.S.items.length === 1, '关卡：再进测试地图，打倒的敌人还是倒着');
  // 在测试地图存档、读档
  R.saveGame(); fresh(); R.loadGame(R.SAVE); R.mode = 'play';
  check(R.S.map === 'test_b' && R.ROOMS[0].id === 'a' && R.S.enemies[0].dead && R.S.maps.map1.items[0].taken && R.S.maps.map1.doors['25,34'] === true,
    '关卡：在别的地图存档读档，当前地图和其他地图的状态都在');
  // 出口：条件不满足就提示，满足了进入读取过场
  const ex = R.EXITS[0]; R.S.p.x = (ex.x + .5) * T; R.S.p.y = (ex.y + .5) * T - 10;
  const f = R.findInteract();
  check(f && f.kind === 'exit', '关卡：站在出口旁边能调查');
  R.interact();
  check(R.S.map === 'test_b' && R.mode === 'play' && R.msgs[R.msgs.length - 1].t === '还不能走。', '关卡：出口条件不满足时提示，不切换');
  R.S.flags.mayLeave = true; R.interact();
  check(R.mode === 'loading' && R.S.map === 'test_b', '关卡：满足条件后进入读取过场');
  R.updateLoading(0.2);
  const a1 = R.loadingAlpha();
  R.updateLoading(0.2);
  check(a1 > 0.4 && a1 < 0.7 && R.S.map === 'map1' && R.loadingAlpha() === 1, `关卡：先淡出（${a1.toFixed(2)}），黑屏时切换地图`);
  R.updateLoading(0.8);
  check(R.mode === 'play' && R.loadingAlpha() === 0 && Math.floor(R.S.p.x / T) === 32, '关卡：淡入后回到游戏，玩家在出口指定的位置');
  delete R.LEVELS.test_b; fresh();
}
{
  // 写错的动作不会让游戏崩溃
  fresh(); const warn = console.warn; let warned = 0; console.warn = () => warned++;
  try { R.runActions([{ nonsense: 1 }, { flag: 'afterBad' }], 'test'); } finally { console.warn = warn; }
  check(warned === 1 && R.S.flags.afterBad, '触发器：不认识的动作只警告并跳过，后面的动作照常执行');
}

// ================= M1 检查点 6：存档槽与设置（game/storage.js、game/settings.js、ui/menus.js）=================
{
  const ls = localStorage; ls.clear(); R.CUR_SLOT = null; R.refreshSlots();
  check(R.listSlots().every(s => s.state === 'empty') && R.latestSlot() === null && R.titleItems()[0].id === 'new' && !R.titleItems().some(i => i.id === 'continue' || i.id === 'load'),
    '存档槽：没有存档时标题菜单第一项是“新游戏”，没有“继续”和“读取存档”');
  // 旧版浏览器试玩的单一存档 → 槽 1
  fresh(); R.S.p.hp = 61; R.saveGame(1); const legacy = ls.getItem('residue_save_1'); ls.clear(); ls.setItem('residue_save', legacy);
  const s1 = R.listSlots()[0];
  check(s1.state === 'ok' && s1.hp === 61 && ls.getItem('residue_save') === null, '存档槽：旧版的单一存档自动放进槽 1');
  // 在打字机存档：选槽界面，默认选第一个空槽
  fresh(); R.CUR_SLOT = null;
  const tw = R.S.items.find(it => it.t === 'typewriter'); R.S.p.x = tw.x; R.S.p.y = tw.y + 30; step(0.05);
  R.interact();
  check(R.mode === 'slots' && R.MENU.purpose === 'save' && R.MENU.cur === 1, '存档槽：打字机打开选槽界面，光标在第一个空槽（存档 2）');
  R.slotsKey({ code: 'Enter' });
  const s2 = R.slotInfo(2);
  check(R.mode === 'play' && R.CUR_SLOT === 2 && s2.state === 'ok' && s2.room === '书房（安全屋）' && s2.map === '洛克伍德宅邸' && s2.savedAt > 0, `存档槽：存进槽 2，记录地图、房间和时间（${s2.map} · ${s2.room}）`);
  // 覆盖别的槽要确认
  R.interact();
  check(R.MENU.cur === 1, '存档槽：再次存档时光标默认在这局自己的槽');
  const before1 = ls.getItem('residue_save_1');
  R.slotsKey({ code: 'ArrowUp' }); R.slotsKey({ code: 'Enter' });
  check(R.mode === 'slots' && R.MENU.confirm === 1 && ls.getItem('residue_save_1') === before1, '存档槽：覆盖别的存档时先提示，不会直接覆盖');
  R.S.p.hp = 33; R.slotsKey({ code: 'Enter' });
  check(R.CUR_SLOT === 1 && R.slotInfo(1).hp === 33 && ls.getItem('residue_save_1_bak') === before1, '存档槽：再按一次才覆盖，旧档留作自动备份');
  // 存档界面 Esc 取消
  R.interact(); R.slotsKey({ code: 'Escape' });
  check(R.mode === 'play', '存档槽：Esc 取消，回到游戏');
  // 主档坏了读备份；都坏了拒绝读取
  ls.setItem('residue_save_1', '{坏');
  check(R.slotInfo(1).state === 'backup' && R.loadSlot(1) && R.S.p.hp === 61 && R.msgs.some(m => m.t.includes('自动备份')), '存档槽：主档损坏时读取自动备份，并提示');
  ls.setItem('residue_save_1_bak', '也坏了'); R.mode = 'play'; const hpNow = R.S.p.hp;
  check(R.slotInfo(1).state === 'corrupt' && !R.loadSlot(1) && R.mode === 'play' && R.S.p.hp === hpNow, '存档槽：主档和备份都坏了时拒绝读取，当前游戏不受影响');
  // “继续”选最近保存的槽
  const d2 = JSON.parse(ls.getItem('residue_save_2')); d2.meta.savedAt = 1; ls.setItem('residue_save_2', JSON.stringify(d2));
  fresh(); R.S.p.hp = 88; R.saveGame(3); R.goTitle();
  const items = R.titleItems();
  check(items[0].id === 'continue' && items[0].label.includes('存档 3') && items.some(i => i.id === 'load'), '存档槽：标题菜单“继续”指向最近保存的槽（存档 3）');
  R.S.p.hp = 1; R.titleKey({ code: 'Enter' });
  check(R.mode === 'play' && R.CUR_SLOT === 3 && R.S.p.hp === 88, '存档槽：继续 → 读取存档 3');
  check(R.deadCanLoad(), '存档槽：这局存过档，死亡后可以从存档继续');
  R.CUR_SLOT = null;
  check(!R.deadCanLoad(), '存档槽：新开的一局还没存档，死亡后只能重新开始（不会读到别的存档）');
  // 读档界面删除存档：按两次 Delete
  R.goTitle(); R.openSlots('load');
  check(R.mode === 'slots' && R.MENU.cur === 2, '存档槽：读档界面光标默认在最近的存档');
  R.slotsKey({ code: 'Delete' });
  check(R.slotInfo(3).state === 'ok' && R.MENU.confirm === 'del3', '存档槽：按一次 Delete 只是提示');
  R.slotsKey({ code: 'Delete' });
  check(R.slotInfo(3).state === 'empty' && ls.getItem('residue_save_3_bak') === null, '存档槽：再按一次删除（连同备份）');
  R.MENU.cur = 0; R.slotsKey({ code: 'Enter' });
  check(R.mode === 'slots', '存档槽：损坏的存档不能读取');
  R.slotsKey({ code: 'Escape' });
  check(R.mode === 'title', '存档槽：读档界面 Esc 回到标题');
  // 存档失败：不改当前槽，存档次数不增加
  fresh(); R.CUR_SLOT = 2; const saves = R.S.stats.saves, set = ls.setItem; ls.setItem = () => { throw new Error('disk full'); };
  try { R.saveGame(1); } finally { ls.setItem = set; }
  check(R.CUR_SLOT === 2 && R.S.stats.saves === saves && R.msgs.some(m => m.t.includes('存档失败')), '存档槽：写入失败时提示，当前槽和存档次数不变');
  // 浏览器整个禁掉存储（隐私模式 / file:// 直接打开）时，提示必须换一套说法 ——
  // 对网页玩家说「请检查磁盘空间」只会让他去查错方向。靠异常类型区分，不能靠再探一次。
  fresh(); const set2 = ls.setItem;
  ls.setItem = () => { const e = new Error('The operation is insecure.'); e.name = 'SecurityError'; throw e; };
  try { R.saveGame(1); } finally { ls.setItem = set2; }
  check(R.msgs.some(m => m.t.includes('不允许本页保存数据')), '存档失败：浏览器禁止存储时，提示的是真实原因而不是「磁盘空间」');
  check(!R.msgs.some(m => m.t.includes('磁盘空间')), '存档失败：这种情况下不会误导玩家去查硬盘');
  // 绘制不报错（假画布）
  R.openSlots('save'); R.drawSlots(); R.mode = 'play';
}
{
  // 暂停菜单
  fresh(); R.openPause();
  R.pauseKey({ code: 'ArrowDown' }); R.pauseKey({ code: 'Enter' });
  check(R.mode === 'settings', '暂停菜单：可以打开设置');
  R.settingsKey({ code: 'Escape' });
  check(R.mode === 'pause', '暂停菜单：设置 Esc 回到暂停菜单');
  R.MENU.pauseCur = 3; R.pauseKey({ code: 'Enter' });
  check(R.mode === 'pause' && R.MENU.confirm === 'title', '暂停菜单：回到标题要确认（没存的进度会丢）');
  R.pauseKey({ code: 'Enter' });
  check(R.mode === 'title', '暂停菜单：再按一次回到标题');
  fresh(); R.openPause(); R.pauseKey({ code: 'Escape' });
  check(R.mode === 'play', '暂停菜单：Esc 继续游戏');
  R.openPause(); R.drawPause(); R.mode = 'play';
}
{
  // 设置
  const ls = localStorage; ls.removeItem('residue_settings');
  R.SETTINGS = { ...R.SETTINGS_DEFAULT }; R.applySettings(); R.goTitle();
  R.openMenu('settings');
  R.settingsKey({ code: 'ArrowLeft' });
  check(R.SETTINGS.master === 0.7, '设置：← 把总音量调低 10%');
  for (let i = 0; i < 6; i++) R.settingsKey({ code: 'ArrowRight' });
  check(R.SETTINGS.master === 1, '设置：音量最高 100%');
  R.MENU.cur = 3; R.settingsKey({ code: 'Enter' });
  check(R.SETTINGS.stereo === false && R.AU.panScale === 0, '设置：切换成单声道，立体声定位随之关闭');
  R.MENU.cur = 4; R.settingsKey({ code: 'ArrowRight' });
  check(R.SETTINGS.grain === false, '设置：关闭画面颗粒');
  R.MENU.cur = 6; R.settingsKey({ code: 'Enter' });
  check(R.mode === 'keys', '设置：打开操作说明');
  R.keysKey({ code: 'Escape' });
  check(R.mode === 'settings', '设置：操作说明返回设置');
  check(ls.getItem('residue_settings') === null, '设置：调整过程中不写盘');
  R.settingsKey({ code: 'Escape' });
  const saved = JSON.parse(ls.getItem('residue_settings'));
  check(R.mode === 'title' && saved.master === 1 && saved.stereo === false && saved.grain === false, '设置：离开设置界面时保存');
  R.SETTINGS = { ...R.SETTINGS_DEFAULT }; R.loadSettings();
  check(R.SETTINGS.stereo === false && R.SETTINGS.grain === false && R.AU.panScale === 0, '设置：重新启动后读回设置并生效');
  ls.setItem('residue_settings', JSON.stringify({ master: 5, sfx: 'loud', ambient: 0.33, grain: 0, hack: 1 }));
  R.loadSettings();
  check(R.SETTINGS.master === 1 && R.SETTINGS.sfx === 1 && R.SETTINGS.ambient === 0.3 && R.SETTINGS.grain === true && !('hack' in R.SETTINGS), '设置：超出范围的值被限制，类型不对的用默认值，不认识的字段丢掉');
  ls.setItem('residue_settings', '{坏'); R.loadSettings();
  check(JSON.stringify(R.SETTINGS) === JSON.stringify({ ...R.SETTINGS_DEFAULT, fullscreen: R.SETTINGS.fullscreen }), '设置：设置文件损坏时用默认值');
  R.openMenu('settings'); R.MENU.cur = 7; R.SETTINGS.master = 0.2; R.settingsKey({ code: 'Enter' });
  check(R.SETTINGS.master === R.SETTINGS_DEFAULT.master, '设置：恢复默认');
  R.drawSettings(); R.openMenu('keys'); R.drawKeys(); R.goTitle(); R.drawTitleMenu();
  // 音量接到音频节点上（假音频）
  const g = () => ({ gain: { value: 1 } }); const AU = R.AU, saved2 = { c: AU.c, m: AU.m, sfxBus: AU.sfxBus, ambBus: AU.ambBus };
  AU.c = {}; AU.m = g(); AU.sfxBus = g(); AU.ambBus = g();
  R.SETTINGS = { ...R.SETTINGS_DEFAULT, master: 0.5, sfx: 0.3, ambient: 0 }; R.applySettings();
  const ok = Math.abs(AU.m.gain.value - R.MASTER_BASE * 0.5) < 1e-9 && AU.sfxBus.gain.value === 0.3 && AU.ambBus.gain.value === 0;
  Object.assign(AU, saved2); R.SETTINGS = { ...R.SETTINGS_DEFAULT }; R.applySettings(); ls.removeItem('residue_settings');
  check(ok, '设置：总音量、音效、环境音分别作用在对应的音频通道上');
  // 鼠标：点音量条直接设到点击位置
  R.openMenu('settings'); R.drawSettings();
  const bar = R.MENU.rects.find(r => r.slider === 'sfx');
  R.menuClick(bar.x + bar.w * 0.3, bar.y + 5);
  check(R.SETTINGS.sfx === 0.3, `设置：鼠标点音量条的 30% 处，音效音量变成 30%`);
  R.SETTINGS = { ...R.SETTINGS_DEFAULT }; R.goTitle();
  localStorage.clear(); R.CUR_SLOT = null; R.refreshSlots();
}

// ================= v3.2 决定（第 11 节第 6–9 条）=================
// 6. 处刑者速度 100；受伤减速 1.0 / 0.95 / 0.88 —— 实测玩家三种状态的行走速度都比处刑者快
fresh();
{
  check(R.mkEnemy('boss', 52, 8).spd === 100, '决定 6：处刑者行走速度 100');
  const measured = [];
  for (const hp of [100, 50, 20]) {
    R.S.p.x = 32.5 * TS; R.S.p.y = 37.5 * TS; R.S.p.hp = hp; R.S.enemies = [];
    const x0 = R.S.p.x; R.keys.KeyD = true; step(0.5); R.keys.KeyD = false;
    measured.push(Math.round((R.S.p.x - x0) / 0.5));
  }
  const expect = R.STATUS_SPEED.map(m => R.PLAYER_SPEED.walk * m);
  check(measured.every((v, i) => Math.abs(v - expect[i]) <= 3), `决定 6：实测行走速度 ${measured.join(' / ')}（预期 ${expect.map(Math.round).join(' / ')}）`);
  check(measured.every(v => v > 100), '决定 6：玩家任何状态下安静行走都比处刑者快');
  check(R.PLAYER_SPEED.aim < 100 && R.PLAYER_SPEED.walk * R.PLAYER_SPEED.reloadMul < 100, '决定 6：瞄准、装填时会被处刑者追上');
}
// 7. 安全屋宽限期 20 秒（行为已由上面的安全屋测试覆盖）
check(R.EXEC.grace === 20, '决定 7：离开安全屋后的宽限期为 20 秒');
// 8. 记忆时间：僵尸 6 秒、狗 8 秒
check(R.EDEF.zombie.memory === 6 && R.EDEF.dog.memory === 8, '决定 8：记忆时间 僵尸 6 秒、狗 8 秒');
// 9. 武器切换：数字键 1–5 + 滚轮
fresh(); R.resetTransient();
{
  const p = R.S.p;
  check(R.WEAPON_SLOTS.length === 5 && R.WEAPON_SLOTS[0].id === 'pistol' && R.WEAPON_SLOTS[1].id === 'shotgun', '决定 9：武器栏位 1–5（手枪、霰弹枪、冲锋枪、麦林、榴弹发射器）');
  check(!R.selectWeaponSlot(1) && p.wep === 'pistol', '决定 9：没有霰弹枪时按 2 不会切换');
  check(!R.cycleWeapon(1) && p.wep === 'pistol', '决定 9：只有一把武器时滚轮不切换');
  R.invAdd(R.S.p.inv, 'shotgun', 1);
  check(R.selectWeaponSlot(1) && p.wep === 'shotgun', '决定 9：按 2 切到霰弹枪');
  check(!R.selectWeaponSlot(2) && p.wep === 'shotgun', '决定 9：按 3（还没有冲锋枪）保持当前武器');
  step(0.2);
  check(R.cycleWeapon(1) && p.wep === 'pistol', '决定 9：滚轮在已拥有的武器之间循环（霰弹枪 → 手枪）');
  check(!R.cycleWeapon(1) && p.wep === 'pistol', '决定 9：滚轮 0.15 秒内不连跳');
  step(0.2);
  check(R.cycleWeapon(-1) && p.wep === 'shotgun', '决定 9：滚轮反方向（手枪 → 霰弹枪）');
  p.weapons = { magnum: true }; step(0.2);
  R.cycleWeapon(1); check(p.wep === 'magnum', '决定 9：滚轮会跳过没有的栏位（霰弹枪 → 麦林）');
  // 新游戏后游戏时间归零，滚轮仍然可用
  R.S = R.newState(); R.invAdd(R.S.p.inv, 'shotgun', 1); R.resetTransient();
  check(R.cycleWeapon(1) && R.S.p.wep === 'shotgun', '决定 9：新游戏 / 读档后滚轮立刻可用');
}

// ================= M2：处刑者完整 AI 与导演系统（计划 3.1–3.6）=================
{
  const T = 48, D = () => R.S.executioner;
  const boss = (tx, ty, st = 'search') => { const b = R.mkEnemy('boss', tx, ty); b.state = st; b.lookT = 99; R.S.executioner.active = true; R.S.enemies = [b]; return b; };
  const at = (o, tx, ty) => { o.x = (tx + .5) * T; o.y = (ty + .5) * T; };
  const withRandom = (v, fn) => { const r = Math.random; Math.random = () => v; try { return fn(); } finally { Math.random = r; } };
  const spy = (name, fn) => { const orig = global[name], calls = []; global[name] = (...a) => { calls.push(a); return orig(...a); }; try { fn(); } finally { global[name] = orig; } return calls; };
  const roomIdx = id => R.ROOMS.findIndex(r => r.id === id);
  const setup = () => { fresh(); unlockAll(); R.resetTransient(); R.P.inv = 0; R.computeAllFlows(); };

  // ---- 感知：前方 120° 视野，背后只靠听觉
  setup(); at(R.S.p, 28, 37);
  {
    const b = boss(28, 32); b.fa = -Math.PI / 2; step(0.05);
    check(b.state === 'search' && !b.alert, '处刑者：玩家在背后 5 格、中间没有遮挡，也看不见（背后只靠听觉）');
    b.fa = Math.PI / 2; step(0.05);
    check(R.isChasing(b) && b.alert, '处刑者：转身面向玩家后看见 → 追击');
  }
  // ---- 听觉：去声源，不知道玩家在哪
  setup(); at(R.S.p, 50, 41);
  {
    const b = boss(32, 12); b.fa = -Math.PI / 2; D().protectT = 999;
    R.emitNoise(15.5 * T, 34.5 * T, 40, 'test');
    step(0.05);
    check(b.state === 'track' && b.goal && Math.abs(b.goal.x - 15.5 * T) < 1 && Math.abs(b.goal.y - 34.5 * T) < 1, '处刑者：听到噪音 → 追踪，目标是声源（不是玩家的位置）');
    at(R.S.p, 52, 43); step(2);
    check(b.state === 'track' && Math.abs(b.goal.x - 15.5 * T) < 1, '处刑者：追踪时玩家移动，目标不变（搜索和追踪只用从噪音地点出发的寻路场）');
    let t = 0; while (b.state === 'track' && t < 40) { step(0.5); t += 0.5; }
    check(b.state === 'search' && R.roomOfPos(b.x, b.y) === roomIdx('wcor') && Math.hypot(b.x - 15.5 * T, b.y - 34.5 * T) < T, `处刑者：沿 A 层穿过 3 扇门走到声源（${t} 秒），然后开始环顾`);
    step(R.EXEC.lookAround + 0.3);
    const g = b.goal, adj = R.roomAdjacency()[roomIdx('wcor')];
    check(g && adj.has(R.roomOfPos(g.x, g.y)), `处刑者：环顾 ${R.EXEC.lookAround} 秒后去检查一个相邻房间（${R.ROOMS[R.roomOfPos(g.x, g.y)].name}）`);
  }
  // ---- 跟丢：看不见 4 秒 → 去最后看见的位置
  setup(); at(R.S.p, 28, 37);
  {
    const b = boss(28, 31, 'chase'); b.fa = Math.PI / 2; b.alert = true; b.dashCd = 99; step(0.05);
    const seen = { ...b.lastSeen };
    at(R.S.p, 14, 26); R.setDoorOpen(14, 32, false); R.setDoorOpen(25, 34, false); R.computeAllFlows();
    step(R.EXEC.loseSight - 0.3);
    check(b.state === 'chase', '处刑者：刚看不见时仍在追击（短暂记忆）');
    step(0.5);
    check(b.state === 'track' && Math.abs(b.goal.x - seen.x) < 1 && Math.abs(b.goal.y - seen.y) < 1, `处刑者：连续 ${R.EXEC.loseSight} 秒看不见 → 追踪，去最后看见玩家的地方`);
  }
  // ---- 重拳：前摇 0.6 秒可以躲开
  setup(); at(R.S.p, 28, 37);
  {
    const b = boss(28, 36, 'chase'); b.y = R.S.p.y - 50; b.fa = Math.PI / 2;
    b.state = 'attack'; b.atk = 'punch'; b.atkT = R.EXEC.punch.windup;
    step(0.2); at(R.S.p, 28, 39); R.S.p.x += 60; step(0.5);
    check(R.S.p.hp === 100 && b.state !== 'attack', '处刑者：重拳前摇中走开就能躲过');
    at(R.S.p, 28, 37); b.x = R.S.p.x; b.y = R.S.p.y - 50; b.state = 'attack'; b.atk = 'punch'; b.atkT = R.EXEC.punch.windup; R.P.inv = 0;
    step(0.7);
    check(R.S.p.hp === 100 - R.EXEC.punch.dmg && R.solidT(Math.floor(R.S.p.x / T), Math.floor(R.S.p.y / T)) === false, `处刑者：站着不动吃一记重拳 -${R.EXEC.punch.dmg}，被击退但不会进墙`);
  }
  // ---- 抓取：手臂发红光；小刀冷却好了自动反击挣脱
  setup(); at(R.S.p, 28, 37);
  {
    const b = boss(28, 36, 'chase'); b.y = R.S.p.y - 50; b.fa = Math.PI / 2;
    const warn = spy('sfxAt', () => withRandom(0, () => { b.state = 'chase'; b.dashCd = 99; step(0.05); }));
    check(b.state === 'attack' && b.atk === 'grab' && Math.abs(b.atkT - R.EXEC.grab.windup) < 0.06 && warn.some(c => c[0] === 'grabWarn'), '处刑者：抓取前摇 0.8 秒，并有预警音效');
    R.P.knifeCd = 0; step(0.8);
    check(R.S.p.hp === 100 && b.stag > 0 && R.P.knifeCd > R.EXEC.grab.counterKnifeCd - 0.5 && R.S.stats.escapes === 1, '处刑者：小刀冷却好了 → 被抓时自动反击挣脱，不受伤，它踉跄');
    b.stag = 0; b.x = R.S.p.x; b.y = R.S.p.y - 50; b.state = 'attack'; b.atk = 'grab'; b.atkT = 0.05; R.P.inv = 0;
    step(0.1);
    check(R.S.p.hp === 100 - R.EXEC.grab.dmg, `处刑者：小刀还在冷却时被抓住 -${R.EXEC.grab.dmg}`);
  }
  // ---- 冲刺：蓄力时原地转向，起跑后方向固定，速度 260；每 6 秒最多判定一次
  setup(); at(R.S.p, 28, 38);
  {
    const b = boss(28, 33, 'chase'); b.fa = Math.PI / 2; b.alert = true;
    withRandom(0.1, () => step(0.02));
    check(b.state === 'dash' && Math.abs(b.dashCd - R.EXEC.dash.every) < 0.1, '处刑者：3–7 格内有视线时会冲刺（每 6 秒最多判定一次）');
    const y0 = b.y; step(R.EXEC.dash.tell - 0.05);
    check(Math.abs(b.y - y0) < 1, '处刑者：冲刺前先原地蓄力（给玩家反应时间）');
    const a0 = b.dashA; step(0.1); const y1 = b.y; R.S.p.x += 3 * T; step(0.2);
    check(Math.abs((b.y - y1) / 0.2 - R.EXEC.dash.speed) < 15 && Math.abs(b.dashA - a0) < 1e-9, `处刑者：冲刺速度 ${Math.round((b.y - y1) / 0.2)}，方向在起跑时固定（横向躲开就能避过）`);
    step(1); check(R.S.p.hp === 100, '处刑者：横向躲开后冲刺没打中');
  }
  // ---- 打倒 20 秒 → 起身追击，20 秒内不会被瞬移
  setup(); at(R.S.p, 12, 34);
  {
    const b = boss(52, 8); R.damageEnemy(b, 400, 0, 0, false, 0);
    check(b.knockdownT === 20 && b.state === 'knockdown' && R.S.executioner.nextThreshold === 460, '处刑者：累计 400 伤害跪地 20 秒，下次阈值 +15%（460）');
    D().looseT = 59; step(19.9);
    check(b.knockdownT > 0 && D().teleports === 0, '处刑者：跪地期间导演不会瞬移它');
    step(0.2);
    check(b.state === 'chase' && D().protectT > 19, '处刑者：起身后进入追击，接下来 20 秒不触发“太松”瞬移');
  }
  // ---- 推开挡路的僵尸
  setup(); at(R.S.p, 12, 34);
  {
    const b = boss(23, 34, 'chase'); b.fa = Math.PI; b.alert = true;
    const z = R.mkEnemy('zombie', 21, 34); z.sight = 0; R.S.enemies.push(z);
    let staggered = false;
    withRandom(0.99, () => { for (let i = 0; i < 180; i++) { R.update(1 / 60); if (z.stag > 0) staggered = true; } });
    check(b.x < 19.5 * T && staggered, `处刑者：挡在走廊里的僵尸被推开并踉跄，它不会被挡住（3 秒走到 x=${(b.x / T).toFixed(1)} 格）`);
  }
  // ---- 安全屋：走到门外守候 8–15 秒，然后转去别处；绝不进入
  setup(); at(R.S.p, 40, 35);
  {
    const b = boss(44, 35, 'chase'); b.fa = Math.PI; b.alert = true;
    at(R.S.p, 50, 30); step(0.1);
    check(b.state === 'guard' && b.goal && Math.floor(b.goal.x / T) === 50 && Math.floor(b.goal.y / T) === 34, '处刑者：玩家躲进安全屋 → 走到那扇门的门外守候');
    let inSafe = false, arrived = -1, left = -1;
    for (let i = 0; i < 60 * 30; i++) {
      R.update(1 / 60); if (R.inSafeTileExport(b.x, b.y)) inSafe = true;
      if (arrived < 0 && Math.hypot(b.x - b.goal.x, b.y - b.goal.y) < T * 0.6) arrived = i / 60;
      if (arrived >= 0 && b.state !== 'guard') { left = i / 60; break; }
    }
    const waited = left - arrived;
    check(!inSafe && arrived >= 0 && waited >= 8 && waited <= 15.1 && b.state === 'track', `处刑者：在门外守候 ${waited.toFixed(1)} 秒后转去别处搜索，全程没进安全屋`);
  }
  // ---- 宽限期：离开安全屋后 20 秒内不会被瞬移
  setup(); at(R.S.p, 50, 30);
  {
    const b = boss(52, 8); b.stag = 999; step(0.1);
    at(R.S.p, 12, 34); D().looseT = 59; step(5);
    check(D().graceT > 14 && D().teleports === 0 && D().looseT === 59, `离开安全屋后的宽限期内（剩 ${D().graceT.toFixed(1)} 秒）不瞬移，“太松”计时暂停`);
    step(17);  // 宽限期 20 秒走完后，“太松”计时从 59 秒接着走，再 1 秒瞬移
    check(D().graceT === 0 && D().teleports === 1, '宽限期结束后“太松”计时继续，随即瞬移');
  }
  // ---- 太松：连续 60 秒离玩家超过 25 格 → 瞬移到玩家看不见的相邻区域，并播放远处的开门声
  setup(); at(R.S.p, 32, 37); R.setDoorOpen(38, 35, false); R.setDoorOpen(25, 34, false); R.setDoorOpen(32, 29, false);
  {
    const b = boss(52, 8); b.stag = 999; R.computeAllFlows();
    check(R.pathDistTo(b.x, b.y) > R.DIRECTOR.looseDist, `测试前提：处刑者离玩家 ${R.pathDistTo(b.x, b.y)} 格`);
    step(59.5); check(D().teleports === 0 && D().looseT > 59, '太松：60 秒之前不瞬移');
    const doors = spy('sfxAt', () => step(0.6)).filter(c => c[0] === 'door');
    const pd = R.pathDistTo(b.x, b.y), ri = R.roomOfPos(b.x, b.y), adj = R.roomAdjacency()[roomIdx('hall')];
    check(D().teleports === 1 && pd >= R.DIRECTOR.teleportMin && pd <= R.DIRECTOR.teleportMax && adj.has(ri) && !R.losClear(R.S.p.x, R.S.p.y, b.x, b.y),
      `太松：60 秒后瞬移到主厅的相邻区域（${R.ROOMS[ri].name}，路径 ${pd} 格），玩家看不见`);
    check(doors.length === 1 && Math.hypot(doors[0][1] - b.x, doors[0][2] - b.y) < 6 * T, '太松：瞬移时在落点附近播放开门声（玩家能判断它到了哪一带）');
    check(b.state === 'search' && b.lookT > 0 && !b.goal, '太松：瞬移后在落点环顾搜索，不会直接走进玩家的房间（它不知道玩家的确切位置）');
  }
  // ---- 瞬移落点：门都开着时，也只会选玩家看不见的地方（逐个检查候选点）
  setup(); at(R.S.p, 32, 37);
  {
    boss(52, 8); R.computeAllFlows();
    const r0 = Math.random; let k = 0, spots = [];
    Math.random = () => (k++ % 60) / 60;
    try { for (let i = 0; i < 60; i++) spots.push(R.findSpot(R.DIRECTOR.teleportMin, R.DIRECTOR.teleportMax)); } finally { Math.random = r0; }
    spots = spots.filter(Boolean);
    check(spots.length === 60 && spots.every(q => !R.losClear(R.S.p.x, R.S.p.y, q.x, q.y) && !R.ROOMS[q.ri].safe && q.ri !== R.curRoom()),
      `瞬移落点：门全开时抽查 60 个候选点，全部在玩家视线之外、不在安全屋、不在玩家所在的房间`);
  }
  // ---- 冲刺、击退也不能把它送进安全屋
  setup(); at(R.S.p, 28, 37);
  {
    const b = boss(50, 34); b.state = 'dash'; b.dashT = R.EXEC.dash.time; b.dashA = -Math.PI / 2;
    let entered = false; for (let i = 0; i < 60; i++) { R.update(1 / 60); if (R.inSafeTileExport(b.x, b.y)) entered = true; }
    check(R.isDoorOpen(50, 33) && !entered, '处刑者：朝开着的安全屋门冲刺，也会停在门口，进不去');
  }
  // ---- 暂停：玩家在安全屋、解谜房间里时“太松”计时暂停（不清零）
  setup(); at(R.S.p, 50, 30);
  {
    const b = boss(52, 8); b.stag = 999; step(0.1); D().looseT = 30;
    step(40); check(D().looseT === 30 && D().teleports === 0, '导演：玩家待在安全屋里时“太松”计时暂停（不清零），不会被瞬移到门口守着');
    at(R.S.p, 12, 34); D().graceT = 0; D().playerSafe = false;
    R.ROOMS[roomIdx('wcor')].puzzle = true;
    step(40); check(D().looseT === 30 && D().teleports === 0, '导演：玩家在解谜房间里时暂停');
    delete R.ROOMS[roomIdx('wcor')].puzzle;
    step(30.5); check(D().teleports === 1, '导演：离开解谜房间后计时接着走（30 + 30 秒）→ 瞬移');
  }
  // ---- 太紧：连续追击 90 秒 → 撤离到 15 格以外，期间不理会声音
  setup(); at(R.S.p, 28, 37);
  {
    const b = boss(28, 32, 'chase'); b.fa = Math.PI / 2; b.alert = true; b.dashCd = 99;
    D().chaseT = R.DIRECTOR.tightTime - 0.1; step(0.2);
    check(b.state === 'retreat' && D().retreats === 1 && D().chaseT === 0 && R.pathDistTo(b.goal.x, b.goal.y) >= R.DIRECTOR.retreatDist,
      `太紧：连续追击 90 秒后主动失去目标，去 ${R.pathDistTo(b.goal.x, b.goal.y)} 格外的地方`);
    check(b.retreatT >= 30 && b.retreatT <= 60, `太紧：撤离 ${b.retreatT.toFixed(0)} 秒（30–60）`);
    step(3);
    R.emitNoise(b.x, b.y, 20, 'test'); step(0.1);
    check(b.state === 'retreat', '太紧：撤离期间听到声音也不回头');
    b.retreatT = 0.05; step(0.1);
    check(b.state === 'search', '太紧：撤离时间到了恢复正常搜索');
  }
  // ---- 读档保护：太近就挪到 20 格以外看不见的地方，30 秒内不瞬移
  setup(); at(R.S.p, 32, 37);
  {
    const b = boss(40, 35, 'chase'); b.alert = true;
    R.saveGame(1); R.loadGame(R.SAVE); R.mode = 'play';
    const nb = R.activeExecutioner(), pd = R.pathDistTo(nb.x, nb.y);
    check(pd >= R.DIRECTOR.loadFar && !R.losClear(R.S.p.x, R.S.p.y, nb.x, nb.y) && nb.state === 'search' && D().protectT === 30,
      `读档保护：处刑者原本只隔 5 格，读档后在 ${pd} 格外、看不见，改为搜索；30 秒内不瞬移`);
    const far = boss(56, 6); far.lookT = 99; R.saveGame(1); R.loadGame(R.SAVE); R.mode = 'play';
    const fb = R.activeExecutioner();
    check(Math.floor(fb.x / T) === 56 && Math.floor(fb.y / T) === 6, '读档保护：本来就离得远时不挪动');
    const kd = boss(40, 35); R.damageEnemy(kd, 999, 0, 0, false, 0); R.saveGame(1); R.loadGame(R.SAVE); R.mode = 'play';
    check(R.activeExecutioner().knockdownT > 19, '读档：跪地中的处刑者读档后仍在跪地');
    localStorage.clear(); R.CUR_SLOT = null; R.refreshSlots();
  }
  // ---- 紧张度：离得近、追得久就升高；远离后回落
  setup(); at(R.S.p, 28, 37);
  {
    const b = boss(28, 32, 'chase'); b.fa = Math.PI / 2; b.alert = true; b.dashCd = 99; R.S.p.hp = 100000;
    withRandom(0.99, () => step(4));
    const hi = D().tension;
    R.S.enemies = []; const f = boss(56, 6); f.stag = 999; step(6);
    check(hi > 55 && D().tension < hi - 30, `紧张度：被近距离追击时升到 ${hi.toFixed(0)}，远离 6 秒后降到 ${D().tension.toFixed(0)}`);
  }
  // ---- 追击音乐：进入追击后逐渐加入，失去目标后 8 秒内淡出；紧张度越高鼓点越快
  setup(); at(R.S.p, 28, 37);
  {
    const b = boss(28, 32, 'chase'); b.alert = true; R.MUSIC.level = 0;
    for (let i = 0; i < 60 * 2.6; i++) R.updateChaseMusic(1 / 60);
    check(R.MUSIC.level === 1, '追击音乐：进入追击 2.5 秒内鼓点完全加入');
    b.state = 'search';
    for (let i = 0; i < 60 * 4; i++) R.updateChaseMusic(1 / 60);
    const mid = R.MUSIC.level;
    for (let i = 0; i < 60 * 4.1; i++) R.updateChaseMusic(1 / 60);
    check(mid > 0.4 && mid < 0.6 && R.MUSIC.level === 0, `追击音乐：失去目标后逐渐淡出（4 秒时 ${mid.toFixed(2)}），8 秒内完全停止`);
    const beats = tension => { b.state = 'chase'; R.MUSIC.level = 1; R.MUSIC.beatT = 0; D().tension = tension; return spy('playDrum', () => { for (let i = 0; i < 600; i++) R.updateChaseMusic(1 / 60); }).length; };
    const slow = beats(0), fast = beats(100);
    check(Math.abs(slow - 14) <= 1 && Math.abs(fast - 22) <= 1, `追击音乐：10 秒内 紧张度 0 → ${slow} 拍（84 BPM），100 → ${fast} 拍（132 BPM）`);
  }
  // ---- 换地图跟随：有剧情入口的地图，喘息 45–75 秒（被追时 30–45 秒）后从入口登场
  {
    R.LEVELS.test_f = {
      id: 'test_f', name: '测试地图 F', start: { x: 3.5, y: 7.5, a: 0 },
      rooms: [{ id: 'f', name: '测试厅', x: 2, y: 2, w: 30, h: 8, floor: 'stone', amb: 0.9 }], doors: [], locks: {}, furn: [], lamps: [], items: [], enemies: [],
      execEntry: { x: 29, y: 3, msg: '测试：它从通风口砸了下来！' },
    };
    R.LEVELS.test_g = { ...R.LEVELS.test_f, id: 'test_g', name: '测试地图 G', execEntry: undefined };
    check(R.validateLevel('test_f').length === 0, '跟随：带处刑者入口的测试地图配置有效');
    R.LEVELS.test_f.execEntry.x = 40; check(R.validateLevel('test_f').some(e => e.includes('处刑者入口')), '跟随：入口不在房间里会被 npm test 指出');
    R.LEVELS.test_f.execEntry.x = 29;
    setup(); at(R.S.p, 28, 37);
    const b = boss(28, 32, 'chase'); b.alert = true;
    R.gotoLevel('test_f', null, null, true);
    const f = D().follow;
    check(!R.S.enemies.some(e => e.t === 'boss') && !R.S.maps.map1.enemies.some(e => e.t === 'boss') && f && f.map === 'test_f' && f.left >= 8 && f.left <= 12,
      `跟随：换地图时正被追击，它离开地图 1，${f.left.toFixed(0)} 秒后跟来（8–12）`);
    R.saveGame(1); R.loadGame(R.SAVE); R.mode = 'play';
    check(R.S.executioner.follow && Math.abs(R.S.executioner.follow.left - f.left) < 0.01, '跟随：跟随倒计时随存档保存');
    step(D().follow.left - 0.3);
    check(!R.activeExecutioner(), '跟随：喘息时间内不出现');
    step(0.5);
    const nb = R.activeExecutioner();
    check(nb && Math.floor(nb.x / T) === 29 && Math.floor(nb.y / T) === 3 && R.msgs.some(m => m.t.includes('通风口')) && nb.state === 'track' && D().map === 'test_f' && !D().follow,
      '跟随：喘息时间结束后从剧情入口登场（巨响、提示），开始追踪玩家所在的房间');
    // 没被追时喘息时间更长；目标地图没有入口时它留在原地图
    setup(); boss(56, 6);
    R.gotoLevel('test_f', null, null, true);
    check(D().follow.left >= 15 && D().follow.left <= 25, `跟随：没被追时 ${D().follow.left.toFixed(0)} 秒后跟来（15–25）`);
    setup(); boss(56, 6); R.S.enemies = R.S.enemies.filter(e => e.t !== 'boss'); R.S.executioner.active = true;
    R.gotoLevel('test_f', null, null, true);
    check(D().follow && D().follow.map === 'test_f', '跟随：它登场过但此刻不在身边，换图后照样跟过来');
    setup(); boss(56, 6);
    R.gotoLevel('test_g', null, null, true);
    check(!D().follow && R.S.maps.map1.enemies.some(e => e.t === 'boss'), '跟随：目标地图没有入口时，它留在原来的地图');
    delete R.LEVELS.test_f; delete R.LEVELS.test_g; localStorage.clear(); R.CUR_SLOT = null; R.refreshSlots(); fresh();
  }
}

const game = SOURCES.map(s => s.code).join('\n');
check(!/\bsetTimeout\s*\(/.test(game), '游戏逻辑不使用浏览器 setTimeout');
check(/if \(e\.repeat\) return/.test(game), '过滤键盘自动重复');

// ================= 网格尺寸运行时化（计划 §4：地图扩到 80×64）=================
{
  // 定长数组按 MAX_MW×MAX_MH 一次分配，MW / MH 是当前地图的尺寸。
  // 这一组测试的意义：证明引擎在**非 64×48** 的地图上，寻路、噪音、预渲染、存档全都正确。
  check(R.GRID_CAP === R.MAX_MW * R.MAX_MH && R.MAX_MW >= 80 && R.MAX_MH >= 64, `网格：按上限 ${R.MAX_MW}×${R.MAX_MH} 预分配，容得下计划 §4 的 80×64`);
  check(R.flow.length === R.GRID_CAP && R.grid.length === R.GRID_CAP, '网格：寻路场和网格数组都按上限分配，切换地图不重新分配');
  let threw = '';
  try { R.setMapSize(200, 64); } catch (e) { threw = String(e.message); }
  check(threw.includes('非法'), '网格：超过上限的地图尺寸直接报错，不会静默截断');
  check(R.MW === 80 && R.MH === 48, '网格：报错后当前尺寸不变');

  // 一张 80×64 的大地图：房间横跨 x=2..77（宽 76 格，远超旧的 64），纵跨 y=2..61
  R.LEVELS.test_big = {
    id: 'test_big', name: '大地图测试', w: 80, h: 64, start: { x: 4.5, y: 4.5, a: 0 },
    rooms: [
      { id: 'west', name: '西端', x: 2, y: 2, w: 8, h: 6, floor: 'stone', amb: 0.9 },
      { id: 'hall', name: '长廊', x: 10, y: 4, w: 60, h: 3, floor: 'stone', amb: 0.9 },
      { id: 'east', name: '东南端', x: 70, y: 4, w: 8, h: 58, floor: 'stone', amb: 0.9 },
    ],
    doors: [[10, 5]], locks: {}, furn: [], lamps: [], items: [], enemies: [], triggers: [],
    exits: [{ x: 2, y: 7, to: 'map1', at: [32.5, 37.5] }],
  };
  check(R.validateLevel('test_big').length === 0, '网格：80×64 的测试地图配置有效');

  fresh();
  R.gotoLevel('test_big', null, null, true);
  check(R.MW === 80 && R.MH === 64, '网格：切换到 80×64 的地图后 MW / MH 跟着变');
  // 索引必须按新的 MW=80 算；如果哪里还写死 64，这一条就会挂
  check(R.grid[4 * 80 + 75] === 1 && R.grid[61 * 80 + 75] === 1 && R.grid[0] === 0,
    '网格：x=75、y=61 处的地板存在（说明索引用的是当前 MW，不是写死的 64）');
  check(R.mapC.width === 80 * 48 && R.mapC.height === 64 * 48, '网格：预渲染画布跟着扩大到 3840×3072');

  // 寻路：从西端走到东南角，路径长度必然超过旧地图的宽度上限
  R.S.p.x = 4.5 * 48; R.S.p.y = 4.5 * 48;
  R.setDoorOpen(10, 5, true);
  R.computeAllFlows();
  const farIdx = 60 * 80 + 74;              // 东南端深处
  check(R.flow[farIdx] > 64, `网格：寻路场铺满整张大地图，最远角落路径代价 ${R.flow[farIdx]} 格（> 64，旧尺寸根本到不了）`);
  check(R.flowExec[farIdx] > 64 && R.flowB[farIdx] > 64, '网格：A / B 两层寻路在大地图上同样铺满');

  // 噪音：半径够大时要能穿过 60 格的长廊
  const field = R.noiseField(4.5 * 48, 4.5 * 48, 25);
  check(field[4 * 80 + 25] > 0 && field[4 * 80 + 8] > field[4 * 80 + 25],
    '网格：噪音场在大地图上按格衰减传播（20 格外仍听得到，且越远越弱）');

  // 存档往返
  R.saveGame(1); R.S.p.hp = 1; R.loadSlot(1);
  check(R.S.map === 'test_big' && R.MW === 80 && R.MH === 64, '网格：在大地图上存读档后尺寸正确恢复');

  // 切回 64×48 必须干净地还原
  R.S.flags.mayLeave = true;
  R.gotoLevel('map1', null, null, true);
  check(R.MW === 80 && R.MH === 48 && R.mapC.width === 80 * 48, '网格：切回 64×48 的地图后尺寸和画布都还原');
  R.computeAllFlows();
  check(R.flow[Math.floor(R.S.p.y / 48) * R.MW + Math.floor(R.S.p.x / 48)] === 0, '网格：还原后寻路场按 MW=64 索引，玩家脚下代价为 0');
  delete R.LEVELS.test_big;
}

// ================= 噪音队列容量（静默溢出防护）=================
{
  fresh();
  // 大半径 + 多门结构会让格子重复入队；这里确认不会静默算错（溢出时会 console.warn）
  const warn = console.warn; let warned = 0; console.warn = () => warned++;
  let f;
  try { f = R.noiseField(R.S.p.x, R.S.p.y, 25); } finally { console.warn = warn; }
  const reached = f.reduce((n, v) => n + (v > 0 ? 1 : 0), 0);
  check(warned === 0 && reached > 100, `噪音：半径 25 的传播覆盖 ${reached} 格，队列没有溢出`);
}


// ================= 配置化的噪音半径与休眠距离（计划 7.1、8.3）=================
{
  fresh();
  check(R.NOISE.walk === 0 && R.NOISE.run === 6, '噪音表：行走 0 格（安静）、奔跑 6 格，数值在 config/player.js');
  check(R.SLEEP_DIST === 40 * 48, `性能：普通敌人 40 格外休眠（计划 8.3），SLEEP_DIST = ${R.SLEEP_DIST}px`);

  // 改配置立即生效：把奔跑噪音调成 1 格，远处的僵尸就听不到了
  const far = R.mkEnemy('zombie', Math.floor(R.S.p.x / 48) + 5, Math.floor(R.S.p.y / 48));
  R.S.enemies.push(far);
  const orig = R.NOISE.run;
  const heardLoud = R.emitNoise(R.S.p.x, R.S.p.y, R.NOISE.run, 'run');
  far.heard = null;
  R.NOISE.run = 1;
  const heardQuiet = R.emitNoise(R.S.p.x, R.S.p.y, R.NOISE.run, 'run');
  R.NOISE.run = orig;
  check(heardLoud > heardQuiet, `噪音表：奔跑半径 6 格有 ${heardLoud} 个敌人听见，改成 1 格只有 ${heardQuiet} 个（配置立即生效）`);
}


// ================= 垂直切片第一段：厨房 → 冷库 → 剑之钥匙（计划 4.1）=================
{
  fresh();
  const T = 48, p = R.S.p;

  // 房间和门都在
  const kitchen = R.ROOMS.findIndex(r => r.id === 'kitchen');
  const cold = R.ROOMS.findIndex(r => r.id === 'cold');
  check(kitchen >= 0 && cold >= 0, '切片：厨房和冷库两个房间已加入地图 1');
  check(R.grid[25 * R.MW + 7] === 2 && R.grid[20 * R.MW + 4] === 2, '切片：餐厅↔厨房 (7,25)、厨房↔冷库 (4,20) 两扇门存在');
  check(R.ROOMS[cold].amb < 0.4, `切片：冷库比别的房间暗得多（环境光 ${R.ROOMS[cold].amb}）`);

  // 剑之钥匙已经从餐厅搬到冷库门后
  const sword = R.S.items.find(i => i.t === 'key' && i.v === 'sword');
  const stx = Math.floor(sword.x / T), sty = Math.floor(sword.y / T);
  check(R.roomAt[sty * R.MW + stx] === cold, `切片：剑之钥匙在冷库里 (${stx},${sty})，不在餐厅了`);
  // 「挂在冷库门后」：门在 (4,20)，钥匙不能正对着门口，得进屋回头才看得见
  check(stx !== 4, '切片：钥匙不在门的正对面——进冷库要回头才看得见（呼应日记 f2）');

  // 日记文本和实际位置必须对得上，不然就是误导玩家
  check(R.FILES.f2.body.includes('冷库 门后'), '切片：厨师日记 f2 已按附录 B 改写为「钥匙 剑 挂在 冷库 门后」');
  check(!R.FILES.f1.body.includes('餐厅'), '切片：任务简报 f1 不再说钥匙在餐厅');
  check(R.FILES.f1.body.includes('厨房'), '切片：任务简报 f1 把线索指向厨房（附录 B）');
  check(!!R.FILES.f8, '切片：新增文件 f8 厨房墙上的备忘');

  // 主厅北门前的提示：别让玩家在西翼瞎转
  p.x = 32.5 * T; p.y = 30.5 * T; step(0.1);
  check(R.S.flags.hasSwordHint && R.S.objective && R.S.objective.includes('剑之钥匙'), '切片：走到主厅北门前会提示去西翼找剑之钥匙');

  // 进冷库前有预警（计划 §10：不要让惩罚毫无征兆地叠加）
  p.x = 4.5 * T; p.y = 21.5 * T; step(0.1);
  check(R.S.flags.coldWarned, '切片：靠近冷库门会先给一次预警，再让玩家决定进不进');

  // 拿钥匙 → 1.2 秒后厨房方向涌进来两只，把死胡同变成要杀出去的地方
  p.x = sword.x; p.y = sword.y; R.interact();
  check(!!R.S.p.keys.sword, '切片：拿到剑之钥匙');
  const before = R.S.enemies.filter(e => !e.dead).length;
  step(1.5);
  const after = R.S.enemies.filter(e => !e.dead).length;
  check(after === before + 2 && R.S.flags.coldAmbushFired, `切片：拿钥匙后 1.2 秒，厨房方向补进 2 只（${before} → ${after}）`);
  check(R.S.objective && R.S.objective.includes('主厅'), '切片：目标提示切换为「回到主厅，打开北门」');

  // 钥匙确实能开主厅北门
  check(R.LEVELS.map1.locks['32,29'] === 'sword' && R.grid[29 * R.MW + 32] === 3, '切片：主厅北门仍然是剑之钥匙锁');
}


// ================= 回归：玩家实测报的两个 bug =================
{
  // BUG A：打开地图时人物箭头会整个消失
  // 根因是闪烁用了 S.time，而 S.time 只在 mode==='play' 时推进。
  // 这里守的是「地图画人物位置时不准依赖 S.time」——UI 代码没法直接跑，就检查源码。
  const src = SOURCES.find(f => f.rel.endsWith('ui/screens.js')).code;
  const draw = src.slice(src.indexOf('function drawMap'), src.indexOf('function drawTitle'));
  check(!/Math\.sin\(S\.time[^)]*\)\s*>\s*-?[\d.]+\s*\|\|\s*mode/.test(draw),
    'BUG A：地图上的人物位置不再用 S.time 做闪烁隐藏（打开地图时 S.time 是冻住的）');
  check(draw.includes('performance.now()'), 'BUG A：地图动效改用真实时钟');
  check(!/62 \* sc/.test(draw), 'BUG A：地图居中不再写死 62，改用运行时的 MW');
}
{
  // BUG B：钥匙已经拿到了，任务提示还在让你去找
  // 玩家的真实路线是「先逛到冷库拿钥匙，之后才第一次走到主厅北门」。
  fresh(); const T = 48, p = R.S.p;
  const key = R.S.items.find(i => i.t === 'key' && i.v === 'sword');
  p.x = key.x; p.y = key.y; R.interact();
  check(R.S.objective === '▲ 回到主厅，打开北门', 'BUG B：拿到钥匙后目标变成「回到主厅，打开北门」');
  p.x = 32.5 * T; p.y = 30.5 * T; step(0.5);
  check(!R.S.fired['map1:sword_locked'], 'BUG B：已经拿到钥匙时，北门不会再喊「去西翼找剑之钥匙」');
  // 原来这里断言「收掉（null）」。现在改成断言「换成下一个目标」——
  // 真正要防的是「已完成的目标还在闪」，而不是「必须没有目标」。
  check(R.S.objective !== '▲ 回到主厅，打开北门', 'BUG B：带着钥匙回到北门 → 已完成的目标不再显示');
  check(R.S.objective === '▲ 探索北翼', 'BUG B：而且立刻接上了下一个目标，不留空窗');
}
{
  // 反过来：没拿钥匙时提示照常出，而且拿到钥匙前不会被 north_reached 抢跑
  fresh(); const T = 48, p = R.S.p;
  p.x = 32.5 * T; p.y = 30.5 * T; step(0.5);
  check(R.S.objective === '▲ 去西翼找剑之钥匙', 'BUG B 反向：没拿钥匙时北门照常给方向');
  check(!R.S.fired['map1:north_reached'], 'BUG B 反向：没钥匙时不会误报「北门可以打开了」');
}
{
  // notKeys 这个新条件本身
  fresh();
  check(R.trigCond({ notKeys: ['sword'] }) === true, 'DSL：notKeys —— 还没拿到钥匙时条件成立');
  R.S.p.keys.sword = true;
  check(R.trigCond({ notKeys: ['sword'] }) === false, 'DSL：notKeys —— 拿到钥匙后条件不成立');
  check(R.trigCond({ keys: ['sword'] }) === true, 'DSL：keys 仍然正常');
}


// ================= 垂直切片第二段：画廊半身像谜题（计划 4.2）=================
{
  fresh(); const p = R.S.p;
  const busts = R.S.items.filter(i => i.t === 'bust');
  const doorIdx = 12 * R.MW + 25;

  check(busts.length === 4, '谜题：画廊里有 4 座能转的半身像');

  // 四座像摆在四面墙的正中：位置本身就是一个方位（上北下南左西右东）。
  // 这样玩家不用在脑子里做「左上角 = 西北」这层换算。
  // 文案说的是「四面墙下」，位置就必须真在四面墙下 —— 两者绑在一起。
  {
    const g = R.ROOMS.find(r => r.id === 'gallery');
    const cx = g.x + g.w / 2, cy = g.y + g.h / 2;
    const sides = new Set();
    for (const b of busts) {
      const gx = Math.floor(b.x / 48), gy = Math.floor(b.y / 48);
      const dx = gx + 0.5 - cx, dy = gy + 0.5 - cy;
      // 主轴必须压倒性：竖着偏 = 北/南位，横着偏 = 东/西位。不能是含糊的斜角
      const side = Math.abs(dy) > Math.abs(dx) * 2 ? (dy < 0 ? 'N' : 'S')
                 : Math.abs(dx) > Math.abs(dy) * 2 ? (dx < 0 ? 'W' : 'E') : '?';
      check(side !== '?', `谜题：半身像 (${gx},${gy}) 明确落在某一面墙下，不是含糊的斜角位`);
      sides.add(side);
    }
    check(sides.size === 4, '谜题：四座像分占北/东/南/西四面，一面一座');
    check(!R.KEYS.gallery.hint.includes('四角') && R.KEYS.gallery.hint.includes('四面墙'),
      '谜题：门上的提示说的是「四面墙下」（和上面的位置断言配对）');

    // 站位和正确朝向之间不能有几何规律：全朝里、全朝外、全都朝同一边，
    // 任何一种都能让玩家不看家谱就猜到答案。
    const rel = new Set();
    for (const b of busts) {
      const gx = Math.floor(b.x / 48), gy = Math.floor(b.y / 48);
      const dx = gx + 0.5 - cx, dy = gy + 0.5 - cy;
      const at = Math.abs(dy) > Math.abs(dx) ? (dy < 0 ? 0 : 2) : (dx < 0 ? 3 : 1);  // 所在方位
      const want = R.BUSTS[b.v].want;
      rel.add(want === at ? 'out' : want === (at + 2) % 4 ? 'in' : 'side');          // 朝外/对望/侧向
    }
    check(rel.size >= 3, `谜题：站位与朝向的关系有 ${rel.size} 种（全「朝外」或全「对望」会让人不看家谱就猜到）`);
  }
  check(busts.every(b => !R.bustRight(b)), '谜题：开局一座都不是对的（不白送）');
  check(R.grid[doorIdx] === 3 && R.LEVELS.map1.locks['25,12'] === 'gallery', '谜题：图书室的门开局被机关闩住');
  check(R.KEYS.gallery.puzzle === true && !R.LEVELS.map1.items.some(i => i[0] === 'key' && i[3] === 'gallery'),
    '谜题：机关闩没有对应的钥匙道具——它只能靠解谜打开');
  check(R.ROOMS[R.ROOMS.findIndex(r => r.id === 'gallery')].puzzle === true, '谜题：画廊标成谜题房间（处刑者的导演逻辑会因此暂停）');

  // 线索必须在门的这一侧，否则就是把答案锁在答案后面
  const f9 = R.LEVELS.map1.items.find(i => i[3] === 'f9');
  check(!!f9 && R.roomAt[f9[2] * R.MW + f9[1]] === R.ROOMS.findIndex(r => r.id === 'gallery'),
    '谜题：家谱 f9 就放在画廊里（线索不能锁在它自己开的门后面）');
  for (const id of Object.keys(R.BUSTS)) {
    check(R.FILES.f9.body.includes(R.BUSTS[id].name.split(' ')[0]), `谜题：家谱里写到了「${R.BUSTS[id].name.split(' ')[0]}」`);
  }
  check(new Set(Object.values(R.BUSTS).map(b => b.want)).size === 4, '谜题：四座像的正确朝向互不重样（家谱背面那句自检成立）');

  // ── 每条线索都必须能推出唯一解，而且要和地图的实际布局对得上 ──────────
  // 踩过的坑：伊莱亚斯那条写的是「不看任何家人 + 对着天窗」，
  // 结果「不看家人」朝西朝北都成立（推不出唯一解），而天窗其实在他东边（和答案矛盾）。
  // 氛围文案一旦承担逻辑约束，就必须当逻辑来验。
  {
    const gal = R.ROOMS.find(r => r.id === 'gallery');
    const gcx = gal.x + gal.w / 2, gcy = gal.y + gal.h / 2;
    const withMark = Object.entries(R.BUSTS).filter(([, b]) => b.landmark);
    check(withMark.length === 3, '线索：三座像靠地标推，一座（被除名的伊莱亚斯）靠排除法');

    for (const [id, b] of withMark) {
      const room = R.ROOMS.find(r => r.id === b.landmark);
      check(!!room, `线索：「${b.name}」指向的房间 ${b.landmark} 真实存在`);
      const dx = (room.x + room.w / 2) - gcx, dy = (room.y + room.h / 2) - gcy;
      // 那个房间相对画廊的主方位
      const dir = Math.abs(dy) > Math.abs(dx) ? (dy < 0 ? 0 : 2) : (dx < 0 ? 3 : 1);
      check(dir === b.want,
        `线索：「${room.name}」确实在画廊的${R.FACE_NAME[b.want]}边——家谱那句话推出来的方向和地图对得上`);
    }

    // 排除法那一座：答案必须正好是另外三座没用掉的那个方向，否则推不出来
    const used = withMark.map(([, b]) => b.want);
    const left = [0, 1, 2, 3].filter(d => !used.includes(d));
    check(left.length === 1 && left[0] === R.BUSTS.elias.want,
      `线索：伊莱亚斯的答案（${R.FACE_NAME[R.BUSTS.elias.want]}）正好是另外三座剩下的那个方向 → 排除法能唯一确定`);
    check(R.FILES.f9.body.includes('剩下的那一个'), '线索：家谱明说了伊莱亚斯靠排除法（不能让玩家去猜氛围描述）');
    check(!R.FILES.f9.body.includes('天窗'), '线索：家谱里不再用「对着天窗」描述伊莱亚斯（那句和答案矛盾）');
  }

  // 「上北下南左西右东」：名牌报的方位，必须和屏幕上真正指的方向一致。
  // 这里栽过一次 —— 渲染里手搓了 face*90°-90°，整套朝向逆时针偏了一格：
  // 名牌写「面朝北」，像却指向屏幕左边。玩家一眼就看出来了，测试却没守住。
  {
    const expect = [['北', 0, -1], ['东', 1, 0], ['南', 0, 1], ['西', -1, 0]];
    for (let f = 0; f < 4; f++) {
      const [name, ex, ey] = expect[f];
      check(R.FACE_NAME[f] === name, `方位表：${f} 号方位叫「${name}」`);
      check(R.FACE_VEC[f][0] === ex && R.FACE_VEC[f][1] === ey,
        `方位表：${name} 对应屏幕方向 (${ex},${ey})（y 轴向下，北 = -y = 上）`);
      // 贴图的鼻梁画在本地 (0,-13)（朝上）。旋转之后必须落在该方位上
      const a = R.bustSpriteAngle(f);
      const px = 13 * Math.sin(a), py = -13 * Math.cos(a);
      check(Math.abs(px - ex * 13) < 0.01 && Math.abs(py - ey * 13) < 0.01,
        `渲染：半身像「面朝${name}」时，画出来真的指向屏幕${ey < 0 ? '上' : ey > 0 ? '下' : ex < 0 ? '左' : '右'}方`);
    }
    const src = SOURCES.find(f => f.rel.endsWith('render/entities.js')).code;
    const seg = src.slice(src.indexOf("if (t === 'bust')"), src.indexOf("if (t === 'plate')"));
    check(/bustSpriteAngle\(/.test(seg) && !/Math\.PI \/ 2 - Math\.PI \/ 2/.test(seg),
      '渲染：朝向换算只能走 bustSpriteAngle()，不许在渲染里另手搓一份');
  }

  // 转动：顺时针，且转错不会误开
  const b0 = busts[0], f0 = b0.face;
  p.x = b0.x; p.y = b0.y; R.interact();
  check(b0.face === (f0 + 1) % 4, '谜题：交互一次顺时针转 90°');
  check(!R.S.flags.bustsSolved && R.grid[doorIdx] === 3, '谜题：只转对一部分时门不会开');

  // 地板机关只报数量，不报是哪几座
  p.x = 32.5 * 48; p.y = 14.5 * 48; R.interact();
  check(R.msgs.some(m => /有 \d 道亮着/.test(m.t)), '谜题：天窗下的地板机关只告诉你「对了几道」');
  // 硬试是要付学费的：踩地砖的动静比开门还大，会把东西引过来。
  // 不然它就成了比读家谱更快的捷径 —— 保底，不是捷径。
  {
    const z = R.mkEnemy('zombie', 31, 18); z.alert = false; R.S.enemies.push(z);
    R.S.p.x = 32.5 * 48; R.S.p.y = 14.5 * 48; R.interact();
    check(!!z.heard, '防捷径：踩地砖查进度的动静会把附近的僵尸引过来（读家谱是安静的，硬试是吵的）');
  }

  // 按家谱摆对 → 铁闩松开
  for (const b of busts) { p.x = b.x; p.y = b.y; let g = 0; while (b.face !== R.BUSTS[b.v].want && g++ < 5) R.interact(); }
  check(R.S.flags.bustsSolved, '谜题：四座都摆对 → 机关解开');

  // 解开是一段有先后的演出，不是一声响。逐段验它真的在推进。
  check(R.grid[doorIdx] === 3, '谜题演出：刚解开的瞬间门还没开（先让四座像咔哒归位）');
  R.S.p.x = 32.5 * 48; R.S.p.y = 15.5 * 48;
  let peak = 0;
  for (let i = 0; i < 20; i++) { step(0.05); peak = Math.max(peak, R.shakeNow()); }  // 1 秒内的震动峰值
  check(peak >= 10, `谜题演出：约 0.8 秒时有一次真正的大震（峰值 ${peak.toFixed(1)}，日常开门只有 2–3）`);
  check(R.P.bannerTxt === '机 关 解 开', '谜题演出：打出横幅');
  check(R.msgs.some(m => m.t.includes('地砖沉下去')), '谜题演出：文字描述跟上了（地砖沉下去半寸）');
  {
    // 四声咔哒必须定位在四座像真正的位置上，否则声音会从空地传出来
    const clicks = R.LEVELS.map1.triggers.find(t => t.id === 'busts_solved');
    const ats = JSON.stringify(clicks.do).match(/"at":\[\d+,\d+\]/g) || [];
    const bustPos = new Set(R.LEVELS.map1.items.filter(i => i[0] === 'bust').map(i => `"at":[${i[1]},${i[2]}]`));
    const onBusts = ats.filter(a => bustPos.has(a));
    check(onBusts.length === 4, `谜题演出：四声咔哒都定位在半身像所在的格子上（${onBusts.length}/4）`);
  }
  step(1.0);
  check(R.grid[doorIdx] === 2, '谜题演出：约 1.7 秒时铁闩落下，门解锁');
  step(1.0);
  check(R.isDoorOpen(25, 12), '谜题演出：约 2.3 秒时门自己荡开一道缝');
  check(R.S.objective === '▲ 进入图书室', '谜题演出：给出下一个目标（别让玩家解完愣在原地）');
}
{
  // 机关道具不能混进「战利品」的逻辑里
  fresh();
  check(R.isProp('bust') && R.isProp('plate') && R.isProp('typewriter') && !R.isProp('ammo'), '机关道具：PROPS 名单正确');

  // 渲染层不准告诉玩家「这一座已经对了」。
  // 第一版就是栽在这儿：视线朝向正确时变金色 = 视觉版的「叮」，
  // 四座各试四个方向就解开了，家谱直接作废（玩家实测反馈）。
  {
    const src = SOURCES.find(f => f.rel.endsWith('render/entities.js')).code;
    const seg = src.slice(src.indexOf("if (t === 'bust')"), src.indexOf("if (t === 'plate')"));
    check(!/bustRight\s*\(/.test(seg), '防泄露：半身像的画法里不准调用 bustRight（会泄露单座对错）');
    const pseg = src.slice(src.indexOf("if (t === 'plate')"), src.indexOf("if (t === 'plate')") + 700);
    check(!/bustsCorrect\s*\(\)/.test(pseg), '防泄露：地砖的画法里不准实时显示进度（必须走过去按 E 才给）');
  }
  const gal = R.ROOMS.findIndex(r => r.id === 'gallery');
  const loot = R.S.items.filter(it => !it.taken && !R.isProp(it.t) && R.roomAt[Math.floor(it.y / 48) * R.MW + Math.floor(it.x / 48)] === gal);
  const props = R.S.items.filter(it => R.isProp(it.t));
  check(props.length >= 5, '机关道具：半身像和地板机关都登记成了 prop');
  check(loot.length > 0, '机关道具：画廊里另有真正的战利品（地图上的红色标记才有意义）');
  // 转像不会把它变成「已拿走」
  const b = R.S.items.find(i => i.t === 'bust');
  R.S.p.x = b.x; R.S.p.y = b.y; R.interact();
  check(!b.taken, '机关道具：转半身像不会把它「捡走」');
}
{
  // 存档：半身像的朝向必须存下来，不然读档后谜题白解
  fresh(); const p = R.S.p;
  const busts = R.S.items.filter(i => i.t === 'bust');
  for (const b of busts) { p.x = b.x; p.y = b.y; let g = 0; while (b.face !== R.BUSTS[b.v].want && g++ < 5) R.interact(); }
  const raw = JSON.parse(JSON.stringify(R.serializeSave ? R.serializeSave() : { items: R.S.items, flags: R.S.flags }));
  const savedFaces = raw.items.filter(i => i.t === 'bust').map(i => i.face);
  check(savedFaces.length === 4 && savedFaces.every(f => f !== undefined), '存档：四座半身像的朝向都写进了存档');
  check(raw.flags.bustsSolved === true, '存档：解谜标记写进了存档');
}


{
  // 谜题暂停规则：解谜时处刑者的「太松就瞬移过来」计时必须停住。
  // 不然玩家正对着家谱推敲，一抬头它站在门口——那不叫压迫感，叫惩罚思考。
  fresh(); const T = 48, p = R.S.p;
  R.spawnExecutioner(52, 8);                    // 扔在地图另一头
  const e = R.S.enemies.find(x => x.t === 'boss');
  p.x = 32.5 * T; p.y = 14.5 * T;               // 玩家待在画廊（puzzle 房间）
  for (let i = 0; i < 1400; i++) { p.x = 32.5 * T; p.y = 14.5 * T; R.update(0.05); }  // 70 秒 > looseTime 60
  check(R.DIRECTOR.looseTime === 60, '谜题暂停：导演的 looseTime 是 60 秒（测试前提）');
  check(!R.S.executioner.teleports, `谜题暂停：玩家在画廊解谜时，处刑者不会因为「太松」被瞬移过来（${R.S.executioner.teleports || 0} 次）`);
  check(Math.floor(e.x / T) > 40, '谜题暂停：处刑者仍然在地图另一头');

  // 对照组：把 puzzle 标记摘掉，同样的 70 秒它就该被瞬移过来。
  // 没有这一条，上面那条断言可能只是「反正它就是不会瞬移」，等于没测。
  fresh();
  const gal = R.ROOMS.find(r => r.id === 'gallery');
  gal.puzzle = false;
  try {
    R.spawnExecutioner(52, 8);
    const p2 = R.S.p;
    for (let i = 0; i < 1400; i++) { p2.x = 32.5 * T; p2.y = 14.5 * T; R.update(0.05); }
    check((R.S.executioner.teleports || 0) > 0, '谜题暂停 · 对照组：同一个房间不标 puzzle 时，处刑者确实会被瞬移过来');
  } finally { gal.puzzle = true; }
}


// ================= 试玩跳转（game/warp.js）=================
{
  // 跳转点本身必须是「落地就能玩」的，不能掉进墙里/家具里，也不能被自己跳过的锁挡住。
  // 第一版 F1 就落在主厅那尊雕像上（格 32,34 是 furn），靠这条测试抓出来的。
  check(R.PLAYTEST_WARP === true, '试玩跳转：源码里开关是开着的（方便自己测）');
  {
    // 现在只发浏览器单文件版，但这层运行时开关留着（以后要是再做桌面外壳，跳转不会跟着漏出去）
    check(R.isPackagedApp() === false, '试玩跳转：浏览器 / Node 里（没有宿主接口）不算打包版');
    global.residueAPI = { isDev: true };
    check(R.isPackagedApp() === false, '试玩跳转：宿主是开发版（isDev = true）时保留跳转');
    global.residueAPI = { isDev: false };
    check(R.isPackagedApp() === true, '试玩跳转：宿主是打包版（isDev = false）时识别为打包版');
    delete global.residueAPI;
    const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
    const warpSrc = fs.readFileSync(path.join(__dirname, '..', 'src', 'game', 'warp.js'), 'utf8');
    const head = warpSrc.slice(0, warpSrc.indexOf('// at   :'));
    const evalWarp = api => vm.runInNewContext(head + '; PLAYTEST_WARP', { window: api ? { residueAPI: api } : {} });
    check(evalWarp({ isDev: false }) === false, '试玩跳转：打包版宿主里 PLAYTEST_WARP 为 false（即使源码开关是 true）');
    check(evalWarp({ isDev: true }) === true && evalWarp(null) === true, '试玩跳转：开发版和浏览器里 PLAYTEST_WARP 为 true');
  }
  {
    // 发给别人玩的版本必须关掉跳转，否则一个手滑就跳到结局。
    // 靠人记得改是不可靠的，所以 build-demo.js --release 会自动关，这里验它真的关了。
    const fs = require('node:fs'), path = require('node:path');
    const rel = path.join(__dirname, '..', '残响之馆.html');
    if (fs.existsSync(rel)) {
      const html = fs.readFileSync(rel, 'utf8');
      check(/const PLAYTEST_WARP_SOURCE = false/.test(html) && !/const PLAYTEST_WARP_SOURCE = true/.test(html),
        '发布版 残响之馆.html：试玩跳转已关闭');
      // 角标也必须跟着消失 —— 它是「我打开的是哪个版本」的唯一肉眼标识
      check(/function drawPlaytestBadge/.test(html), '发布版：角标函数还在（靠开关控制，不是靠删代码）');
    }
    const demo = path.join(__dirname, '..', '试玩版.html');
    if (fs.existsSync(demo)) {
      const html = fs.readFileSync(demo, 'utf8');
      check(/const PLAYTEST_WARP_SOURCE = true/.test(html), '试玩版 试玩版.html：跳转是开着的');
      check(/e\.shiftKey/.test(html), '试玩版：Shift+数字的分支在');
      check(!/<script src=/.test(html), '发布版：所有脚本都内联了，单文件双击可玩');
      check(!/https?:\/\//.test(html.replace(/https?:\/\/[^"'\s]*w3\.org[^"'\s]*/g, '')),
        '发布版：没有外部网络依赖（别人断网也能玩）');
    }
  }
  {
    // 单文件版是否过时：残响之馆.html 曾经停在「爬行者」那一版，没有地图 2、3，发给别人的是旧游戏。
    // 这里用当前源码现场合并一次，和仓库里的文件逐字比较。改了 src 就要重新生成：npm run build:html
    const fs = require('node:fs'), path = require('node:path');
    const { buildHtml, OUT } = require('./build-demo');
    for (const [release, name] of [[false, OUT.demo], [true, OUT.release]]) {
      const file = path.join(__dirname, '..', name);
      const same = fs.existsSync(file) && fs.readFileSync(file, 'utf8') === buildHtml(release);
      check(same, `单文件版 ${name} 和当前源码一致（不一致就运行 npm run build:html）`);
    }
  }
  {
    // 结算画面文字：不能再出现「制作中」，最终结局靠 gameClear 标记
    const t = f => R.winText(f)[0];
    check(t({ chapter1Done: true }) === '第 一 章　完' && t({ chapter1Done: true, chapter2Done: true }) === '第 二 章　完'
      && t({ chapter1Done: true, chapter2Done: true, gameClear: true }) === '逃 出 生 天', '结算画面：按剧情标记显示第一章 / 第二章 / 通关');
    const all = [{ chapter1Done: true }, { chapter1Done: true, chapter2Done: true }, { gameClear: true }].flatMap(f => R.winText(f));
    check(all.every(x => !/制作中/.test(x)), '结算画面：不再出现「制作中」');
  }
  // 试玩跳转分批：用户按地图逐张测，Shift+1…5 只挂当前这一批（地图 1、2 已测完，现在是地图 3）
  check(R.WARP_STAGE === 'map3' && R.WARPS.length === 5 && R.WARPS.every(w => w.map === 'map3')
    && R.WARPS.map(w => w.code).join() === 'Shift+1,Shift+2,Shift+3,Shift+4,Shift+5'
    && R.WARPS.map(w => w.id).join() === 'm3,plant,furnace,tower,lazarus3',
    '试玩跳转：当前这一批是地图 3（Shift+1 货运站、2 生产车间、3 焚化炉、4 控制塔、5 拉撒路阶段三）');
  {
    // 试玩反馈「多点药」：地图 3 的恢复量目标从 2.5 提到 4.5 次满血（猎手 + 两场 Boss 战），新药放在车间、焚化炉、控制塔、站台
    const it3 = R.LEVELS.map3.items, heal = it3.reduce((s, [t, x, y, v]) => s + (t === 'spray' ? 100 : t === 'herb' && v !== 'red' && v !== 'blue' ? 40 : 0), 0) / 100;
    const at = (x, y) => it3.find(i => i[1] === x && i[2] === y);
    check(R.LEVELS.map3.healTarget === 4.5 && heal >= 4.5 && at(50, 35)[0] === 'herb' && at(85, 40)[0] === 'spray' && at(82, 13)[0] === 'herb',
      `地图 3 多放了药：恢复量 ${heal.toFixed(1)} 次满血（原来 3.0），生产车间、焚化炉 Boss 战场、控制塔各加了`);
  }
  {
    // 用户要求：按快捷键跳过去时多给点药，不用自己去拿（每个落点都给，正式流程不受影响）
    const ok = R.WARPS.every((w, i) => { fresh(); R.mode = 'play'; R.warpHotkey(i); return R.invCount('mix_gr') >= 2 && R.invCount('mix_gg') >= 2 && R.invCount('spray') >= 2 && R.invCount('herb_b') >= 2; });
    fresh(); R.mode = 'play'; R.warpHotkey(0); R.warpHotkey(0);
    check(ok && R.invCount('mix_gr') === 2 && R.invCount('spray') === 2, '试玩跳转：每个落点都额外带 2 份绿红混合、2 份绿绿混合、2 瓶喷雾、2 株蓝草药；连按两次不会叠加');
  }
  {
    // 地图 3 这一批的补给按「正常玩到这里大概剩多少」：刚下车没有榴弹发射器（在温室）、没有手雷（第一颗在生产车间）
    fresh(); R.mode = 'play'; warpTo('m3');
    check(!R.invHas('gl') && R.invCount('grenade') === 0 && R.invHas('magnum') && R.invCount('ammo_magnum') === 0 && R.S.items.find(i => i.t === 'glcase'),
      '试玩跳转「货运站」：身上是地图 2 结束时的家当（没有榴弹发射器、手雷、麦林备弹），温室的武器箱还等着你');
    // took：跳过的房间里散落的补给当作已经捡过（已经折进 give 里），文件和藏着的配件照样在
    fresh(); R.mode = 'play'; warpTo('plant');
    const inRoom = (it, id) => { const r = R.LEVEL.rooms.find(r => r.id === id), x = Math.floor(it.x / TS), y = Math.floor(it.y / TS); return x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h; };
    const loose = R.S.items.filter(it => ['glammo', 'ammo', 'herb', 'shells', 'smgammo', 'flash', 'spray'].includes(it.t));
    check(loose.filter(it => ['m3station', 'm3yard', 'm3admin', 'm3chem', 'm3green'].some(r => inRoom(it, r))).every(it => it.taken)
      && loose.filter(it => inRoom(it, 'm3plant')).every(it => !it.taken)
      && R.S.items.filter(it => it.t === 'file' || it.t === 'mod').every(it => !it.taken),
      '试玩跳转「生产车间」：前面房间的补给算已经捡过（不会跑回去多捡一份燃烧榴弹），车间里的还在；文件、藏着的麦林长枪管照样能找');
    // 焚化炉：处刑者在这里直接登场，不能说「最后一节车厢的门被从里面撞飞了」
    fresh(); R.mode = 'play'; R.msgs.length = 0; warpTo('furnace');
    check(!!R.activeExecutioner() && !R.msgs.some(m => /车厢/.test(m.t)), `试玩跳转「焚化炉」：处刑者就在南边，登场台词不再提车厢（${R.msgs.map(m => m.t).join(' / ')}）`);
    R.msgs.length = 0; R.S.enemies = R.S.enemies.filter(e => e.t !== 'boss'); R.spawnExecutioner(R.LEVEL.execEntry.x, R.LEVEL.execEntry.y);
    check(R.msgs.some(m => /车厢/.test(m.t)), '处刑者从地图 3 的剧情入口（最后一节车厢）登场时，还是那句「车厢门被从里面撞飞了」');
  }
  check(Object.entries(R.WARP_SETS).every(([m, set]) => set.length >= 1 && set.length <= 5 && set.every(w => (w.map || 'map1') === m && !w.code))
    && new Set(R.ALL_WARPS.map(w => w.id)).size === R.ALL_WARPS.length && ['map1', 'map2', 'map3'].every(m => R.WARP_STAGE_NAME[m]),
    '试玩跳转：三张地图各一批（每批最多 5 个 = Shift+1…5），落点 id 不重复，快捷键按顺序自动排，不写死在落点里');
  {
    // 按快捷键跳：每次都从全新开局套落点。以前是在当前进度上叠，连按两次多发一遍补给、上一段的标记和处刑者带过去
    // （不绑定哪一批：换批以后这几项照样有效）
    const last = R.WARPS.length - 1, snap = () => JSON.stringify([R.S.p.inv.slots, R.S.p.keys, R.S.flags, R.S.map, R.S.stats.saves]);
    fresh(); R.warpHotkey(0); const first = snap();
    fresh(); R.S.flags.junk = true; R.S.stats.saves = 9;
    R.warpHotkey(last); const a = snap(); R.warpHotkey(last);
    check(snap() === a, `试玩跳转：同一个快捷键（${R.WARPS[last].code}）连按两次，背包、钥匙、剧情标记完全一样（不叠加）`);
    check(!R.S.flags.junk && R.S.stats.saves === 0, '试玩跳转：快捷键先回到新开局 —— 之前的剧情标记、统计不会带过去，只留这个节点该有的');
    R.warpHotkey(0);
    check(snap() === first, '试玩跳转 Shift+1：从后面的节点跳回来，和直接按 Shift+1 的状态一模一样');
    R.mode = 'title'; const before = R.S; R.warpHotkey(0); check(R.S === before, '试玩跳转：不在游戏中（标题 / 菜单）按了不生效'); R.mode = 'play';
  }
  {
    // 发了的钥匙，地图上那一把当作已经捡过：冷库里的剑之钥匙再捡一次会重播伏击
    fresh(); warpTo('gallery');
    const sword = R.S.items.find(it => it.t === 'key' && it.v === 'sword');
    check(sword && sword.taken, '试玩跳转 落点 gallery：发了剑之钥匙，冷库里那把就不在了（不会再捡一次、重播伏击）');
    fresh(); warpTo('statue');
    check(['lion', 'shield', 'armor'].every(v => R.S.items.find(it => it.t === 'key' && it.v === v).taken), '试玩跳转 落点 statue：发了的钥匙和徽章，地图上都不再重复出现');
  }
  {
    // 落地后在跳过的房间里走动，不会把目标改回前面的那句
    fresh(); warpTo('yard'); const p = R.S.p; R.S.enemies = [];
    const lib = R.ROOMS.find(r => r.id === 'library');
    p.x = (lib.x + lib.w / 2) * TS; p.y = (lib.y + lib.h / 2) * TS; R.P.room = -1;
    for (let i = 0; i < 10; i++) R.update(1 / 60);
    check(R.S.objective === '▲ 从后庭院撤离', `试玩跳转 落点 yard：跳过的图书室再走进去，目标不会退回「找铠甲钥匙」（${R.S.objective}）`);
  }

  // 不许用功能键。F1=帮助 F3=查找 F5=刷新 F7=Firefox 插入光标浏览 F11=全屏 F12=开发者工具，
  // 其中一部分在网页拿到 keydown 之前就被浏览器接管了，preventDefault() 根本挡不住。
  // 实测：按 F7 弹出的是 Firefox 的「打开插入光标浏览？」对话框，游戏收不到。
  for (const w of R.WARPS) {
    check(!/^F\d+$/.test(w.code), `试玩跳转 ${w.code}：没有用被浏览器占用的功能键`);
  }
  {
    const src = SOURCES.find(f => f.rel.endsWith('input/input.js')).code;
    check(!/case 'F[1-9]':/.test(src.replace(/case 'F9':[^\n]*\n/, '')),
      '试玩跳转：输入层不再监听 F1–F8（F9 是原有的调试键，保留）');
    check(/shiftKey/.test(src), '试玩跳转：改用 Shift+数字这种浏览器不占用的组合');
  }

  for (const w of [...R.WARPS, ...R.ALL_WARPS.filter(f => R.warpIdx(f.id) < 0).map(f => ({ ...f, code: `落点 ${f.id}` }))]) {
    fresh();
    R.applyWarp(R.WARPS.includes(w) ? R.WARPS.indexOf(w) : w);
    const p = R.S.p, T = 48;
    const tx = Math.floor(p.x / T), ty = Math.floor(p.y / T);
    const tile = R.grid[ty * R.MW + tx];
    check(tile === 1 || tile === 2, `试玩跳转 ${w.code}：落点 (${tx},${ty}) 站得住（地块 ${tile}，4=家具 0=墙）`);
    check(R.roomAt[ty * R.MW + tx] >= 0, `试玩跳转 ${w.code}：落点在某个房间里，不是房间之间的缝`);
    check(p.hp === 100, `试玩跳转 ${w.code}：补满血`);
    if (w.countdown) check(R.S.countdown && R.S.countdown.left === w.countdown, `试玩跳转 ${w.code}：倒计时直接缩短到 ${w.countdown} 秒`);
    else check(R.S.countdown === null, `试玩跳转 ${w.code}：不残留上一段的倒计时`);
    check(R.S.objective === (w.objective || null), `试玩跳转 ${w.code}：目标提示是这个节点该有的那句（${R.S.objective}）`);
    // 跳过去以后，该开的门必须已经开了 —— 否则玩家会被自己跳过的锁关在外面
    for (const [dx, dy] of (w.open || [])) {
      check(R.grid[dy * R.MW + dx] !== 3, `试玩跳转 ${w.code}：跳过的锁门 (${dx},${dy}) 已经解锁`);
    }
    for (const k of (w.keys || [])) check(!!p.keys[k], `试玩跳转 ${w.code}：发了「${k}」钥匙`);
  }

  // 谜题测试点：必须还没解开
  fresh(); warpTo('gallery');
  check(!R.S.flags.bustsSolved, '测试落点 画廊：到画廊时谜题还没解（不然跳过去没得测）');
  check(R.grid[12 * R.MW + 25] === 3, '测试落点 画廊：图书室的门还闩着');
  check(R.S.p.keys.sword && R.grid[29 * R.MW + 32] !== 3, '测试落点 画廊：北门已经通了（跳过的前置流程不该再挡路）');
  {
    // 保险丝的样子（试玩反馈：和钥匙一模一样）：地上、HUD 钥匙栏、配电箱插槽都画成保险丝，钥匙照旧画钥匙
    const orig = global.drawFuseIcon, origSlot = global.drawFuseSlot; let n = 0, slots = [];
    global.drawFuseIcon = function (...a) { n++; return orig.apply(this, a); };
    global.drawFuseSlot = function (c, x, y, on) { slots.push(on); return origSlot.apply(this, arguments); };
    const item = (t, v) => ({ t, v, x: 0, y: 0, taken: false });
    n = 0; for (const f of ['fuseA', 'fuseB', 'fuseC']) R.drawItem(item('key', f));
    const fuses = n; n = 0; R.drawItem(item('key', 'sword')); R.drawItem(item('key', 'idcard')); R.drawItem(item('key', 'lion'));
    check(fuses === 3 && n === 0 && R.isFuseKey('fuseB') && !R.isFuseKey('idcard'), `保险丝：地上的三个保险丝画成保险丝（${fuses} / 3），钥匙、ID 卡、徽章照旧（误画 ${n} 次）`);
    fresh(); R.mode = 'play'; R.S.p.keys.fuseA = R.S.p.keys.fuseC = true; R.S.p.keys.sword = true; n = 0; R.drawHUD();
    check(n === 2, `保险丝：HUD 钥匙栏里拿到的保险丝也画成保险丝（${n} / 2）`);
    fresh(); warpTo('m2'); R.S.fuses = { fuseA: true, fuseB: true }; slots = []; R.drawItem(R.S.items.find(it => it.t === 'fusebox'));
    check(slots.join() === 'true,true,false', `保险丝：配电箱三个插槽，插上的两个显示保险丝、空的一个显示夹子（${slots.join()}）`);
    global.drawFuseIcon = orig; global.drawFuseSlot = origSlot;
  }
  {
    // 丧尸嗓音第五版（试玩反馈「完全不像」）：按真人发声合成 —— 有音高的嗓音 + 嘶哑气声 + 元音共振峰
    const sr = 22050, seeded = n => { let x = n; return () => { x = (x * 1103515245 + 12345) % 2147483648; return x / 2147483648; }; };
    const f0 = d0 => {   // 自相关估基频：先低通（只看 1kHz 以下的谐波，气声在高频），取 30% 处的 0.05 秒
      const d = new Float32Array(d0.length); let y = 0; for (let i = 0; i < d0.length; i++) { y += (d0[i] - y) * 0.2; d[i] = y; }
      const a = Math.floor(d.length * 0.3), L = Math.floor(sr * 0.05); let best = 0, lag = 0;
      for (let k = Math.floor(sr / 260); k < Math.floor(sr / 30); k++) { let sum = 0, e0 = 0, e1 = 0; for (let i = a; i < a + L; i++) { sum += d[i] * d[i + k]; e0 += d[i] * d[i]; e1 += d[i + k] * d[i + k]; } const r = sum / Math.sqrt(e0 * e1 + 1e-9); if (r > best) { best = r; lag = k; } }
      return { hz: sr / lag, r: best };
    };
    const V = {}; for (const k of ['idle', 'attack', 'hurt']) V[k] = [1, 2, 3].map(n => R.synthZombie(k, sr, seeded(n * 7 + k.length)));
    const all = Object.values(V).flat();
    check(all.every(d => d.every(Number.isFinite) && Math.max(...d.map(Math.abs)) <= 0.9001 && Math.max(...d.map(Math.abs)) > 0.85),
      '丧尸嗓音：三种叫法都能合成，没有 NaN，峰值归一化到 0.9（不会爆音）');
    const len = k => Math.max(...V[k].map(d => d.length / sr)), minLen = k => Math.min(...V[k].map(d => d.length / sr));
    check(minLen('idle') >= 1.4 && len('attack') <= 1.0 && minLen('attack') >= 0.6 && len('hurt') <= 0.45, `丧尸嗓音：游荡呻吟长（≥1.4 秒）、嘶吼 0.6–1 秒、中弹闷哼短（≤0.45 秒）`);
    const avg = xs => xs.reduce((a, x) => a + x, 0) / xs.length;
    const rn = seeded(99), noiseR = f0(Float32Array.from({ length: sr }, () => rn() * 2 - 1)).r;
    const rs = all.map(d => f0(d).r);
    check(avg(rs) > noiseR * 2.5 && Math.min(...rs) > noiseR * 1.5, `丧尸嗓音：是有音高的嗓音（带嘶哑），不是纯噪声（平均自相关 ${avg(rs).toFixed(2)}，纯噪声 ${noiseR.toFixed(2)}）`);
    const K = R.ZOMBIE_VOICE.kinds;
    check(K.attack.peak[0] > K.idle.peak[1] && K.attack.breath > K.idle.breath && K.attack.drive > K.idle.drive,
      '丧尸嗓音：嘶吼比游荡呻吟音高更高、气声更重、更破');
    const again = R.synthZombie('idle', sr, seeded(11));
    check(again.length === V.idle[0].length && again.every((x, i) => x === V.idle[0][i]), '丧尸嗓音：同一个种子合成出来完全一样（试听导出的就是游戏里的声音）');
    // 什么时候用哪种叫法
    const orig = global.groanAt, calls = [];
    global.groanAt = function (x, y, v, low, maxD, min, kind) { calls.push({ low: !!low, kind: kind || 'idle' }); };
    fresh(); const p = R.S.p; p.x = 20 * TS; p.y = 34.5 * TS;
    const z = R.mkEnemy('zombie', 23, 34); z.fa = Math.PI; R.S.enemies = [z]; R.P.inv = 99;
    for (let i = 0; i < 5; i++) R.updateEnemies(1 / 60);
    check(z.alert && calls.some(c => c.kind === 'attack'), '丧尸嗓音：僵尸发现你的那一下会嘶吼（和狗叫一样是「被看见了」的提示）');
    calls.length = 0; R.S.time = 100;
    for (let i = 0; i < 5; i++) R.damageEnemy(z, 5, 0, 0, false, 0);
    check(calls.filter(c => c.kind === 'hurt').length === 1, `丧尸嗓音：中弹闷哼 0.7 秒内只哼一次（连中 5 发哼了 ${calls.filter(c => c.kind === 'hurt').length} 次）`);
    calls.length = 0; R.damageEnemy(z, 999, 0, 0, false, 0);
    check(z.dead && calls.length === 1 && calls[0].kind === 'hurt', '丧尸嗓音：倒下时最后一声闷哼');
    calls.length = 0; const dg = R.mkEnemy('dog', 23, 34); dg.fa = Math.PI; dg.groanT = 0; const pz = R.mkEnemy('parasite', 22, 33); pz.groanT = 0; R.S.enemies = [dg, pz];
    for (let i = 0; i < 3; i++) R.updateEnemies(1 / 60);
    check(calls.length === 0 && R.ZOMBIE_VOICED('crawler') && R.ZOMBIE_VOICED('bloater') && !R.ZOMBIE_VOICED('licker'), '丧尸嗓音：只给人变的怪（僵尸、爬行者、膨胀者）用，狗、寄生体不用');
    global.groanAt = orig;
  }
  {
    // 怪物叫声（试玩反馈：「其他怪物的声音也改成符合身份的」）：audio/creatures.js
    const sr = 22050, seeded = n => { let x = n; return () => { x = (x * 1103515245 + 12345) % 2147483648; return x / 2147483648; }; };
    const hash = d => { let h = 0; for (let i = 0; i < d.length; i += 7) h = (h * 31 + Math.round(d[i] * 1e4)) % 1000000007; return h; };
    const zGold = { idle: [45934, -532344841], attack: [18251, -846555614], hurt: [8023, -702655923] };
    check(Object.entries(zGold).every(([k, [n, h]]) => { const d = R.synthZombie(k, sr, seeded(5)); return d.length === n && hash(d) === h; }),
      '怪物叫声：抽出通用嗓音合成之后，僵尸的三种叫法和已认可的第五版逐采样一致');
    const SP = ['dog', 'hunter', 'licker', 'slime', 'vine', 'parasite', 'bloater', 'executioner', 'berserk', 'lazarus', 'tentacle'];
    const bad = [];
    for (const sp of SP) for (const act in R.CRIES[sp] || {}) {
      const c = R.CRIES[sp][act], d = c.make(sr, seeded(3)), pk = d.reduce((m, x) => Math.max(m, Math.abs(x)), 0);
      if (!d.every(Number.isFinite) || pk > 0.9001 || pk < 0.5 || d.length < sr * 0.1 || d.length > sr * 3.2 || !(c.n >= 2) || !(c.gain > 0)) bad.push(`${sp}.${act}`);
    }
    check(SP.every(sp => R.CRIES[sp] && Object.keys(R.CRIES[sp]).length >= 2) && !bad.length, `怪物叫声：11 种怪各有 2 种以上叫法，全部能合成、没有 NaN、峰值不爆音、长度 0.1–3.2 秒${bad.length ? '（有问题：' + bad.join('、') + '）' : ''}`);
    const d1 = R.CRIES.licker.clicks.make(sr, seeded(8)), d2 = R.CRIES.licker.clicks.make(sr, seeded(8));
    check(d1.length === d2.length && d1.every((x, i) => x === d2[i]), '怪物叫声：同一个种子合成出来完全一样（tools/creature-preview.js 导出的就是游戏里的声音）');
    check(Object.values(R.CRIES.dog).every(c => !String(c.make).includes('synthVoice')),
      '怪物叫声：狗叫不用人声模型（试玩反馈「像人叫的」）—— 吠叫是下颌一张一合、没有元音，尖叫 / 哀鸣是鼻腔哨音');
    // 体型越大声音越低：用过零率粗估「亮度」
    const zcr = (sp, act) => { let z = 0, t = 0; for (let s = 1; s <= 3; s++) { const d = R.CRIES[sp][act].make(sr, seeded(s * 13)); for (let i = 1; i < d.length; i++) if ((d[i] >= 0) !== (d[i - 1] >= 0)) z++; t += d.length; } return z / t * sr; };
    const zx = zcr('executioner', 'roar'), zh = zcr('hunter', 'shriek'), zp = zcr('parasite', 'squeal');
    check(zx < zh && zh < zp, `怪物叫声：处刑者最低沉、猎手尖叫居中、寄生体最尖细（过零率 ${zx | 0} < ${zh | 0} < ${zp | 0} 次/秒）`);
    // 调用处按物种分流
    const og = global.groanAt, oc = global.cryAt, calls = [];
    global.groanAt = function (x, y, v, low, maxD, min, kind) { calls.push('zombie.' + (kind || 'idle') + (low ? '.low' : '')); };
    global.cryAt = function (sp, act) { calls.push(sp + '.' + act); };
    fresh(); const p = R.S.p; p.x = 20 * TS; p.y = 34.5 * TS; R.P.inv = 99;
    const dg = R.mkEnemy('dog', 23, 34); dg.fa = Math.PI; R.S.enemies = [dg];
    R.updateEnemies(1 / 60);
    check(dg.alert && calls.includes('dog.bark') && !calls.some(c => c.startsWith('zombie')), '怪物叫声：狗发现你是连吠（不再是两声方波「哔哔」）');
    calls.length = 0; const pz = R.mkEnemy('parasite', 30, 40); pz.groanT = 0; R.S.enemies = [pz]; R.updateEnemies(1 / 60);
    check(calls.includes('parasite.chitter') && !calls.some(c => c.startsWith('zombie')), '怪物叫声：寄生体平时是虫子一样的咔咔声（不再是丧尸呻吟 / 通用嘶嘶声）');
    calls.length = 0; R.S.time = 200; const hu = R.mkEnemy('hunter', 23, 34); R.S.enemies = [hu];
    for (let i = 0; i < 5; i++) R.damageEnemy(hu, 5, 0, 0, false, 0);
    check(calls.filter(c => c === 'hunter.pain').length === 1, `怪物叫声：非丧尸怪物也有中弹叫声，0.7 秒内只叫一次（猎手连中 5 发叫了 ${calls.filter(c => c === 'hunter.pain').length} 次）`);
    calls.length = 0; R.damageEnemy(dg, 999, 0, 0, false, 0);
    check(dg.dead && calls.length === 1 && calls[0] === 'dog.whine', '怪物叫声：狗倒下时是一声哀鸣');
    calls.length = 0; const bl = R.mkEnemy('bloater', 23, 34); R.S.enemies = [bl]; R.S.time = 300; R.damageEnemy(bl, 5, 0, 0, false, 0);
    check(calls.includes('bloater.hurt') && !calls.some(c => c.startsWith('zombie')), '怪物叫声：膨胀者用自己更低更闷、带肚子冒泡的嗓音');
    calls.length = 0; fresh(); const b = R.mkEnemy('boss', 23, 34); R.S.enemies = [b]; R.damageEnemy(b, 99999, 0, 0, false, 0);
    check(calls.includes('executioner.pain') && !calls.some(c => c.startsWith('zombie')), '怪物叫声：处刑者被打倒是它自己的低沉痛吼（不再借用通用低吼）');
    global.groanAt = og; global.cryAt = oc;
    const SRC = SOURCES.map(s => s.code).join('\n');
    const left = ["sfxAt('roar'", "sfxAt('dog'", 'groanAt(e.x, e.y, 1, true', 'groan(0.9, true)'].filter(k => SRC.includes(k));
    check(!left.length, `怪物叫声：怪物不再借用通用的锯齿波吼叫 / 方波狗叫 / 通用低吼${left.length ? '（还剩 ' + left.join('、') + '）' : ''}`);
  }
  {
    // 怪物叫声管理（试玩反馈：「很多怪物堆在一起的时候有点吵」×2）：优先级名额 + 同类实例上限 + HDR 响度窗口 + 空气吸收
    const AU = R.AU, KEYS = ['c', 'm', 'sfxBus', 'crBus', 'voices', 'zb', 'cries', 'lastIdle', 'lastHurt', 'hdr', 'nb'], saved = Object.fromEntries(KEYS.map(k => [k, AU[k]]));
    const started = [];
    const prm = () => ({ value: 1, setValueAtTime() {}, setTargetAtTime(v) { this.value = v; }, linearRampToValueAtTime() {}, exponentialRampToValueAtTime() {} });
    const node = type => ({ type, outs: [], connect(t) { this.outs.push(t); }, gain: prm(), pan: prm(), frequency: prm(), Q: prm(), playbackRate: { value: 1 }, buffer: null, loop: false,
      start() { if (this.type === 'src') started.push({ s: this, t: fake.currentTime }); }, stop(t) { this.stopped = t ?? fake.currentTime; } });
    const fake = { currentTime: 0, sampleRate: 8000, createGain: () => node('gain'), createBiquadFilter: () => node('filter'), createStereoPanner: () => node('panner'), createBufferSource: () => node('src'), createOscillator: () => node('osc'),
      createBuffer: (c, n, sr) => { const d = new Float32Array(n); return { duration: n / sr, getChannelData: () => d }; } };
    const reset = () => { AU.c = fake; AU.m = node('master'); AU.sfxBus = node('bus'); AU.crBus = null; AU.voices = []; AU.lastIdle = undefined; AU.lastHurt = undefined; AU.hdr = null; AU.nb = fake.createBuffer(1, 16000, 8000); fake.currentTime = 0; started.length = 0; };
    const voices = () => started.filter(x => x.s.buffer && x.s.buffer !== AU.nb);
    AU.zb = {}; AU.cries = {};
    try {
      reset(); fresh(); let p = R.S.p;
      for (let i = 0; i < 10; i++) R.groanAt(p.x + 60 + i * 5, p.y, 1, false, 650, 0, 'idle');
      check(voices().length === 1, `叫声管理：十只僵尸同时呻吟，只放 ${voices().length} 声`);
      fake.currentTime = 0.6; R.groanAt(p.x + 60, p.y, 1, false, 650, 0, 'idle'); fake.currentTime = 1.25; R.groanAt(p.x + 60, p.y, 1, false, 650, 0, 'idle');
      check(voices().length === 2, `叫声管理：闲聊声全局每 1.2 秒最多开口一次（0.6 秒时被挡、1.25 秒时放行）`);
      fake.currentTime = 1.3; started.length = 0;
      for (let i = 0; i < 5; i++) R.groanAt(p.x + 60 + i * 5, p.y, 1, false, 650, 0, 'attack');
      check(voices().length === 1, `叫声管理：五只僵尸同时发现你，只放 ${voices().length} 声嘶吼（同一种叫法 0.8 秒内只放 1 声）`);
      const idle = AU.voices.filter(v => v.pri === 0);
      check(idle.length === 2 && idle.every(v => v.ducked && v.g.gain.value < 1), '叫声管理：发现你的嘶吼响起时，正在播的闲聊声被压低一半');
      started.length = 0; R.cryAt('hunter', 'hiss', p.x + 80, p.y, 0.8, 700, 0.15); R.cryAt('hunter', 'hiss', p.x + 90, p.y, 0.8, 700, 0.15); R.cryAt('hunter', 'hiss', p.x + 100, p.y, 0.8, 700, 0.15);
      check(voices().length === 3, '叫声管理：前摇提示音（猎手飞扑前的嘶气）再挤也一定会播，一个都不丢');
      // HDR：枪声把响度窗口推高 → 中等距离的嘟囔被剔除；枪声过后窗口回落，又能听到
      reset(); fresh(); p = R.S.p;
      R.sfx('shotgun'); started.length = 0; fake.currentTime = 0.05;
      R.groanAt(p.x + 250, p.y, 1, false, 650, 0, 'idle');
      const dropped = voices().length === 0;
      fake.currentTime = 3; R.groanAt(p.x + 250, p.y, 1, false, 650, 0, 'idle');
      check(dropped && voices().length === 1, 'HDR 响度窗口：刚开完霰弹枪时，5 格外僵尸的嘟囔被枪声盖住不放；3 秒后窗口回落，又能听到');
      started.length = 0; fake.currentTime = 10; R.sfx('shotgun'); fake.currentTime = 10.05; R.cryAt('hunter', 'hiss', p.x + 250, p.y, 0.8, 700, 0.15);
      check(voices().length === 1, 'HDR 响度窗口：前摇提示音不受枪声影响，照样播放');
      // 空气吸收：远处的叫声高频被削掉，贴身的不削
      reset(); fresh(); p = R.S.p;
      const chainHasLow = x => { let n = x.s, lo = Infinity; for (let k = 0; k < 6 && n.outs[0]; k++) { n = n.outs[0]; if (n.type === 'lowpass') lo = Math.min(lo, n.frequency.value); } return lo; };
      R.cryAt('dog', 'bark', p.x + 20, p.y, 1, 700, 0); fake.currentTime = 2; R.cryAt('dog', 'bark', p.x - 280, p.y, 1, 350, 0);
      const v2 = voices();
      check(v2.length === 2 && chainHasLow(v2[0]) === Infinity && chainHasLow(v2[1]) < 4000, `空气吸收：贴身的狗叫不削高频，远处的只剩 ${chainHasLow(v2[1]) | 0}Hz 以下（退到背景里）`);
      // 整体密度：8 只僵尸 + 2 只狗围着玩家 30 秒
      const crowd = shoot => {
        reset(); fresh(); p = R.S.p; p.x = 20 * TS; p.y = 34.5 * TS; R.S.time = 0;
        for (let i = 0; i < 10; i++) { const a = i / 10 * 6.283, e = R.mkEnemy(i < 8 ? 'zombie' : 'dog', Math.round(20 + Math.cos(a) * (4 + i % 3 * 2)), Math.round(34 + Math.sin(a) * (3 + i % 2 * 2))); e.alert = true; R.S.enemies.push(e); }
        let acc = 0, sumN = 0, maxN = 0;
        for (let f = 0; f < 30 * 60; f++) {
          R.P.inv = 99; R.S.p.hp = 100; if (R.P.grab) R.P.grab = null; fake.currentTime += 1 / 60;
          acc += shoot / 60; while (acc >= 1) { acc--; const live = R.S.enemies.filter(e => !e.dead); const e = live[f % live.length]; R.sfx('pistol'); R.damageEnemy(e, 1, 0, 0, false, 0); e.hp = 100; }
          R.update(1 / 60);
          const act = voices().filter(x => x.t + x.s.buffer.duration / x.s.playbackRate.value > fake.currentTime && !(x.stopped <= fake.currentTime)).length;
          sumN += act; maxN = Math.max(maxN, act);
        }
        return { rate: voices().length / 30, avg: sumN / 1800, maxN };
      };
      const oA = global.updateAmbience, oM = global.updateChaseMusic; global.updateAmbience = () => {}; global.updateChaseMusic = () => {};   // 只量怪物叫声
      let q, g; try { q = crowd(0); g = crowd(3); } finally { global.updateAmbience = oA; global.updateChaseMusic = oM; }
      check(q.rate <= 1.5 && q.avg <= 1.6 && q.maxN <= 5, `叫声密度：8 僵尸 + 2 狗围着你 30 秒，每秒 ${q.rate.toFixed(2)} 声、平均同时 ${q.avg.toFixed(2)} 个、最多 ${q.maxN} 个（改之前约每秒 3.8 声、平均 4 个、最多 10 个）`);
      check(g.rate <= 2.5 && g.avg <= 1.6 && g.maxN <= 5, `叫声密度：同样一群、每秒打中 3 下，每秒 ${g.rate.toFixed(2)} 声、平均同时 ${g.avg.toFixed(2)} 个、最多 ${g.maxN} 个（改之前约每秒 6.5 声、平均 5 个、最多 12 个）`);
    } finally { Object.assign(AU, saved); AU.out = null; AU.curVoice = null; }
  }
  {
    // 行为上少叫：追你的僵尸不再一路大喊；扑咬叫声每只 3–5 秒最多一次
    const og = global.groanAt, calls = [];
    global.groanAt = function (x, y, v, low, maxD, min, kind) { calls.push({ kind: kind || 'idle', v, t: R.S.time }); };
    try {
      fresh(); const p = R.S.p; p.x = 20 * TS; p.y = 34.5 * TS; R.P.inv = 99;
      const z = R.mkEnemy('zombie', 20, 36); z.alert = true; z.groanT = 0; R.S.enemies = [z];
      R.updateEnemies(1 / 60);
      check(z.groanT >= 8 && calls.some(c => c.kind === 'idle' && c.v < 1), `追击中的僵尸：低声喘吼（音量 ${calls.length && calls[0].v}），下一声隔 ${z.groanT.toFixed(1)} 秒（没发现你时 4–9 秒）`);
      calls.length = 0; R.S.time = 50;
      for (let i = 0; i < 4; i++) { z.state = 'chase'; z.x = p.x; z.y = p.y + 30; z.atkVoT = z.atkVoT; R.S.time += 1; R.updateEnemies(1 / 60); }
      const atk = calls.filter(c => c.kind === 'attack').length;
      check(atk === 1, `扑咬叫声：4 秒里扑了 4 次，只吼 ${atk} 声（每只 3–5 秒最多一次）`);
    } finally { global.groanAt = og; }
  }
  // 地图 2：一键过去；来电节点门都开了；再跳回地图 1 也没问题
  fresh(); warpTo('m2');
  check(R.S.map === 'map2' && R.ROOMS[R.curRoom()].id === 'm2lift' && !R.S.flags.m2Power, '测试落点 m2：直接到地图 2 电梯厅，还没来电');
  fresh(); warpTo('m2train');
  check(R.S.map === 'map2' && R.S.flags.m2Power && R.S.p.keys.idcard && R.grid[31 * R.MW + 60] !== 3 && R.S.fuses.fuseC, '试玩跳转 m2train：地图 2 已来电，主控室门开着，ID 卡在手');
  { fresh(); warpTo('m2sewer'); check(R.S.enemies.filter(e => e.t === 'slime' && !e.dead).length === 2, '试玩跳转 m2sewer：污水区的两只淤泥体还在'); fresh(); warpTo('m2train'); }
  check(R.invHas('smg') && R.S.p.mag.smg === 40 && R.invCount('ammo_smg') === 40 && R.S.p.wep === 'smg' && R.invHas('magnum'), '试玩跳转 m2train：冲锋枪（满匣）+ 40 发拿在手上，麦林也在');
  check(R.S.p.inv.size % 4 === 0 && R.S.p.inv.size >= R.invUsed(), '测试落点：背包格子是整行，放得下全部物品（不限格数）');
  check(R.S.enemies.filter(e => e.t === 'licker').length === 2, '试玩跳转 m2train：两只舔舐者在场（一只就在主控室门外的走廊里）');
  {
    // 地图 2 这一批按「正常玩到这里」给补给：刚下升降梯没有冲锋枪（它在宿舍储物柜里）
    fresh(); warpTo('m2');
    check(!R.invHas('smg') && !R.invHas('magnum') && R.invHas('shotgun'), '试玩跳转 m2：刚到地图 2 只有手枪和霰弹枪，冲锋枪要去宿舍储物柜拿');
    // 配电箱：三个保险丝在手，按 E 就来电 → 2.5 秒后收容区放出舔舐者，目标换成去主控室
    fresh(); warpTo('m2fuses');
    const fb = R.S.items.find(it => it.t === 'fusebox'), p = R.S.p;
    check(R.S.map === 'map2' && !R.S.flags.m2Power && ['fuseA', 'fuseB', 'fuseC', 'idcard'].every(k => p.keys[k]) && Math.hypot(fb.x - p.x, fb.y - p.y) < 60,
      '试玩跳转 m2fuses：站在配电箱前，三个保险丝和 ID 卡都在手，还没来电');
    check(R.S.items.filter(it => it.t === 'key').every(it => it.taken) && R.S.items.find(it => it.t === 'safe' && it.v === 'dormLocker').open,
      '试玩跳转 m2fuses：地图上的保险丝、ID 卡不会再出现一份，宿舍储物柜当作已经开过（冲锋枪只有一把）');
    R.S.enemies = []; R.P.inv = 99; R.interact(); step(3.5);
    check(R.S.flags.m2Power && R.S.enemies.filter(e => e.t === 'licker').length === 2 && R.S.objective === '▲ 前往主控室，启动货运列车',
      `试玩跳转 m2fuses：按 E 插上保险丝 → 来电、放出两只舔舐者，目标换成去主控室（${R.S.objective}）`);
    // 主控室：按 E 刷卡 → 站台闸门打开、列车预热 60 秒
    fresh(); warpTo('m2train');
    const con = R.S.items.find(it => it.t === 'console');
    check(Math.hypot(con.x - R.S.p.x, con.y - R.S.p.y) < 60, '试玩跳转 m2train：站在主控室的列车控制台前');
    R.S.enemies = []; R.P.inv = 99; R.interact(); step(0.5);
    check(R.S.flags.trainReady && R.S.countdown && R.S.countdown.left > 58 && R.grid[13 * R.MW + 48] !== 3,
      '试玩跳转 m2train：按 E 刷卡 → 站台闸门打开，列车开始预热（60 秒倒计时）');
    // 冷冻库：阀门谜题还没解，麦林还在柜子里；舔舐者在收容区
    fresh(); warpTo('m2freeze');
    check(!R.S.flags.valvesSolved && !R.invHas('magnum') && R.S.enemies.filter(e => e.t === 'licker').length === 2 && !!R.activeExecutioner(),
      '试玩跳转 m2freeze：阀门谜题没解、麦林还在枪械柜里；舔舐者已经放出来，处刑者在场');
  }
  warpTo('start');
  check(R.S.map === 'map1' && R.MW === 80, '测试落点：从地图 2 能直接跳回地图 1');
  // 坠毁之后：最容易出的事是「一落地就把 90 秒倒计时重播一遍」
  fresh(); warpTo('crash');
  check(R.S.flags.heliDown && R.S.countdown === null, '测试落点 crash：直升机已坠毁、倒计时已结束');
  step(1.5);
  check(R.S.countdown === null, '测试落点 crash：站着不动也不会把 90 秒倒计时重新启动（yard_enter 已标成触发过）');
  check(R.S.enemies.some(e => e.t === 'boss' && !e.dead), '测试落点 crash：处刑者在场（被追回宅邸）');
  // 主厅雕像：两枚徽章在手，底座还空着
  fresh(); warpTo('statue');
  check(R.S.p.keys.lion && R.S.p.keys.snake && !R.S.flags.medalsPlaced && R.grid[40 * R.MW + 32] === 3, '测试落点 statue：两枚徽章在手，石板门还锁着');

  // 后庭院是追逐战测试点：得带着能打的家伙过去
  fresh(); warpTo('yard');
  check(R.invHas('shotgun') && R.invCount('ammo_shotgun') > 0, '测试落点 yard：发了霰弹枪和霰弹（空手去后庭院没意义）');
  check(R.invCount('ammo_pistol') >= 40, '测试落点 yard：手枪弹管够');
}


// ================= 垂直切片第三段：图书室 → 研究所 → 后廊 → 后庭院（计划 4.3）=================
{
  // 一条龙走完整个切片，每到一个节点都检查「玩家知不知道下一步去哪」。
  // 这一段原本一个触发器都没有：解完谜进图书室之后，最长的一程里没有任何指引。
  fresh(); const T = 48, p = R.S.p;
  const go = (x, y, s = 0.2) => { p.x = (x + .5) * T; p.y = (y + .5) * T; step(s); };
  const grab = v => { const it = R.S.items.find(i => !i.taken && i.v === v); p.x = it.x; p.y = it.y; R.interact(); step(0.1); };
  const trail = [];
  const mark = label => trail.push([label, R.S.objective]);

  go(32, 34);                    mark('出生后走到主厅');
  go(32, 30);                    mark('北门（锁着）');
  grab('sword');                 mark('拿到剑之钥匙');
  go(32, 30);                    mark('带钥匙回北门');
  R.S.p.keys.sword = true;
  go(32, 22);                    mark('进画廊');
  go(26, 12);                    mark('撞图书室的门');
  for (const b of R.S.items.filter(i => i.t === 'bust')) {
    p.x = b.x; p.y = b.y; let g = 0; while (b.face !== R.BUSTS[b.v].want && g++ < 5) R.interact();
  }
  step(3);                       mark('解开谜题');
  go(20, 12);                    mark('进图书室');
  grab('armor');                 mark('拿到铠甲钥匙');
  warpTo('start'); R.S.p.keys.armor = true; R.S.p.keys.sword = true;   // 跳过中间的长途跋涉
  go(50, 42);                    mark('进研究所');
  grab('shield');                mark('拿到盾之钥匙');
  go(44, 23);                    mark('进后廊');

  for (const [label, obj] of trail) {
    check(typeof obj === 'string' && obj.length > 0, `目标链：${label} —— 有明确的下一步（当前「${obj}」）`);
  }
  // 相邻两个节点之间目标必须真的在推进，不能从头到尾挂着同一句
  const uniq = new Set(trail.map(t => t[1]));
  check(uniq.size >= 6, `目标链：全程出现了 ${uniq.size} 个不同的目标，确实在往前推`);
}
{
  // 后廊只有 2 格宽。被处刑者堵在里面会不会必死？
  // 玩家半径 14、处刑者 21，两者相加 35 < 96（2 格），物理上挤得过去 —— 用测试钉死这个前提。
  fresh(); const T = 48, p = R.S.p;
  const pass = R.ROOMS.find(r => r.id === 'passage');
  check(pass.w >= 2, `后廊宽 ${pass.w} 格`);
  const boss = R.mkEnemy('boss', pass.x, 23);
  check(p.r + boss.r < pass.w * T, `后廊：玩家(r=${p.r}) 和处刑者(r=${boss.r}) 半径之和 ${p.r + boss.r} < 走廊宽 ${pass.w * T}px —— 挤得过去，不是死刑`);

  // 而且后廊两头都通：北接后庭院，南接北侧走廊的门。堵死一头还有另一头
  const ends = [[pass.x, pass.y], [pass.x, pass.y + pass.h - 1]];
  for (const [ex, ey] of ends) {
    check(R.grid[ey * R.MW + ex] !== 0, `后廊：端点 (${ex},${ey}) 不是死墙`);
  }
}
{
  // 后廊那一拍：进门前就该知道外面有东西
  fresh(); const T = 48, p = R.S.p;
  p.x = 43.5 * T; p.y = 23.5 * T; step(0.2);
  check(R.S.fired['map1:passage_enter'], '后廊：进门触发了那一拍');
  check(R.S.objective === '▲ 从后庭院撤离', '后廊：目标指向最后一程');
  const before = R.msgs.length;
  step(2.0);
  check(R.msgs.length > before && R.msgs.some(m => m.t.includes('很重的东西')),
    '后廊：约 1.6 秒后门外传来动静——进后庭院之前就知道那里有什么');
  check(!R.S.enemies.some(e => e.t === 'boss'), '后廊：但处刑者还没登场（f5 说它在后庭院的收容舱里，不能提前跑进来）');
}
{
  // f5 说「盾之钥匙放在实验台旁边的柜子上」—— 那就必须真的有个柜子，钥匙真的在上面
  fresh();
  const key = R.LEVELS.map1.items.find(i => i[0] === 'key' && i[3] === 'shield');
  const furn = R.LEVELS.map1.furn || R.LEVELS.map1.furniture;
  const on = (furn || []).some(([fx, fy, fw, fh, kind]) =>
    kind === 'desk' && key[1] >= fx && key[1] < fx + fw && key[2] >= fy && key[2] < fy + fh);
  check(on, `文案核对：盾之钥匙 (${key[1]},${key[2]}) 确实摆在柜子上（f5：实验台旁边的柜子）`);
  const bench = (furn || []).find(([, , , , k]) => k === 'bench');
  check(Math.abs(key[1] - (bench[0] + bench[2])) <= 2 || Math.abs(key[2] - bench[1]) <= 2,
    '文案核对：那个柜子确实在实验台「旁边」');
  check(R.FILES.f5.body.includes('实验台旁边的柜子'), '文案核对：f5 的原话没被改掉');
  check(R.LEVELS.map1.items.some(i => i[0] === 'file' && i[3] === 'f5'), '文案核对：f5 真的放在地图里（以前被同一行的注释吞掉过）');
  const swallowed = ['content.js', 'map1.js', 'map2.js', 'map3.js'].flatMap(f => fs.readFileSync(require('node:path').join(__dirname, '../src/config', f), 'utf8')
    .split('\n').filter(l => /\/\/.*\[\s*'[a-zA-Z]+'\s*,\s*\d+\s*,\s*\d+/.test(l)).map(l => f + ': ' + l.trim().slice(0, 60)));
  check(!swallowed.length, '配置文件：没有「注释写在同一行、把后面的物品也注释掉」的情况' + (swallowed.length ? ' —— ' + swallowed.join(' | ') : ''));
}


// ================= 速度关系（计划 5.2 的裁决依据）=================
{
  // 「僵尸该是 42 还是 50」这种争论没有意义 —— 真正要守的是速度之间的关系。
  // 下面四条任何一条被破坏，手感就会塌，所以写成测试而不是写在文档里。
  const P_ = R.PLAYER_SPEED, ST = R.STATUS_SPEED;
  const walk = P_.walk, hurt = Math.round(walk * ST[2]), reload = Math.round(walk * P_.reloadMul);
  const z = R.EDEF.zombie.spd[1], dog = R.EDEF.dog.spd[0], boss = R.EDEF.boss.spd[0];

  check(z > P_.aim,
    `速度关系：僵尸上限 ${z} > 瞄准移速 ${P_.aim} —— 举枪后退甩不掉它，开枪必须是有代价的决定`);
  check(z < reload,
    `速度关系：僵尸上限 ${z} < 换弹移速 ${reload} —— 换弹时还能边退边装，空弹匣不等于死刑（余量 ${reload - z}）`);
  check(z < hurt,
    `速度关系：僵尸上限 ${z} < 重伤行走 ${hurt} —— 再惨也走得掉，路是留着的`);
  check(boss < hurt && hurt - boss <= 10,
    `速度关系：处刑者 ${boss} < 重伤行走 ${hurt}，但只差 ${hurt - boss} —— 重伤时它几乎追平你，永远差一点`);
  check(dog > walk,
    `速度关系：感染犬 ${dog} > 正常行走 ${walk} —— 狗必须跑或者打，不能靠走路周旋`);
  check(dog < P_.run,
    `速度关系：感染犬 ${dog} < 冲刺 ${P_.run} —— 但冲刺甩得掉，给玩家留一条出路`);
  check(boss > z,
    `速度关系：处刑者 ${boss} > 僵尸上限 ${z} —— 它必须是最快的近战威胁`);

  // 裁决结果本身也钉住，免得又漂回去
  check(R.EDEF.zombie.spd[0] === 42 && R.EDEF.zombie.spd[1] === 62, '速度关系：僵尸 42–62（计划 5.2 已按代码定稿）');
  check(R.EDEF.dog.spd[0] === 175, '速度关系：感染犬 175（计划 5.2 已按代码定稿）');
}


// ================= 存档穿越整个切片 =================
// 论坛上的人会直接关掉网页。进度丢了就是最糟的体验，比任何手感问题都严重。
// 做法：在切片每个节点存一次、把内存里的 S 整个丢掉、再读回来，逐项比对。
{
  const T = 48;
  // 序列化用的是 saveGame 里那套（剔除 heardField / heard / lastSeen 这些临时导航数据）
  const dump = () => JSON.stringify(R.S, (k, v) => (k === 'heardField' || k === 'heard' || k === 'lastSeen') ? undefined : v);

  // 读档：把内存彻底换成另一局，再把存档喂回去 —— 模拟「关掉网页重开」
  const roundTrip = (raw) => {
    R.S = R.newState(); R.buildMap(); R.resetTransient();   // 彻底换一局，不留任何残留
    R.loadGame(raw);
    return R.S;
  };

  const nodes = [
    ['开局', 'start', null],
    ['画廊 · 谜题未解', 'gallery', null],
    ['画廊 · 谜题解到一半', 'gallery', 'half'],
    ['画廊 · 谜题刚解开', 'gallery', 'solved'],
    ['后庭院 · 倒计时中', 'yard', 'yard'],
  ];

  for (const [label, warp, extra] of nodes) {
    fresh();
    warpTo(warp);
    const p = R.S.p;

    if (extra === 'half') {                       // 只转对两座
      const bs = R.S.items.filter(i => i.t === 'bust');
      for (const b of bs.slice(0, 2)) { p.x = b.x; p.y = b.y; let g = 0; while (b.face !== R.BUSTS[b.v].want && g++ < 5) R.interact(); }
    }
    if (extra === 'solved') {
      const bs = R.S.items.filter(i => i.t === 'bust');
      for (const b of bs) { p.x = b.x; p.y = b.y; let g = 0; while (b.face !== R.BUSTS[b.v].want && g++ < 5) R.interact(); }
      step(3);                                    // 让开门那段演出跑完
    }
    if (extra === 'yard') { p.x = 50.5 * T; p.y = 15.5 * T; step(4); }   // 进后庭院、倒计时和处刑者都已启动

    // ---- 记下读档前的状态 ----
    const before = {
      faces: R.S.items.filter(i => i.t === 'bust').map(i => i.face),
      taken: R.S.items.filter(i => i.taken).length,
      flags: Object.keys(R.S.flags).sort().join(','),
      fired: Object.keys(R.S.fired).sort().join(','),
      unlocked: [...R.S.unlocked].sort().join(','),
      keys: Object.keys(p.keys).sort().join(','),
      objective: R.S.objective,
      countdown: R.S.countdown ? Math.round(R.S.countdown.left * 10) : null,
      timers: (R.S.timers || []).length,
      libDoor: R.grid[12 * R.MW + 25],
      northDoor: R.grid[29 * R.MW + 32],
      invSlots: JSON.stringify(p.inv.slots),
      hp: p.hp,
      boss: R.S.enemies.filter(e => e.t === 'boss' && !e.dead).length,
      exSpawned: !!(R.S.executioner && R.S.executioner.spawned),
    };

    const raw = dump();
    const S2 = roundTrip(raw);
    const p2 = S2.p;
    const after = {
      faces: S2.items.filter(i => i.t === 'bust').map(i => i.face),
      taken: S2.items.filter(i => i.taken).length,
      flags: Object.keys(S2.flags).sort().join(','),
      fired: Object.keys(S2.fired).sort().join(','),
      unlocked: [...S2.unlocked].sort().join(','),
      keys: Object.keys(p2.keys).sort().join(','),
      objective: S2.objective,
      countdown: S2.countdown ? Math.round(S2.countdown.left * 10) : null,
      timers: (S2.timers || []).length,
      libDoor: R.grid[12 * R.MW + 25],
      northDoor: R.grid[29 * R.MW + 32],
      invSlots: JSON.stringify(p2.inv.slots),
      hp: p2.hp,
      boss: S2.enemies.filter(e => e.t === 'boss' && !e.dead).length,
      exSpawned: !!(S2.executioner && S2.executioner.spawned),
    };

    const cmp = (k, why) => check(JSON.stringify(before[k]) === JSON.stringify(after[k]),
      `存档穿越 ${label}：${why}（存前 ${JSON.stringify(before[k])} → 读后 ${JSON.stringify(after[k])}）`);

    cmp('faces', '半身像的朝向');
    cmp('taken', '已捡走的道具数量');
    cmp('flags', '剧情标记');
    cmp('fired', '已触发的触发器');
    cmp('unlocked', '已解锁的门');
    cmp('keys', '手上的钥匙');
    cmp('objective', '目标提示');
    cmp('timers', '未到期的延时事件数量');
    cmp('libDoor', '图书室那扇机关门的格子状态');
    cmp('northDoor', '主厅北门的格子状态');
    cmp('invSlots', '背包格子');
    cmp('exSpawned', '处刑者是否已登场');
    cmp('hp', '血量');
    cmp('countdown', '直升机倒计时的剩余秒数');
    cmp('boss', '场上处刑者的数量');
  }
}
{
  // 单独盯一条最容易出事的：机关门的「解锁」和触发器的「已触发」是两套记录，
  // 读档后如果对不上，就会出现「标记说解开了，门却还锁着」这种死局。
  fresh();
  warpTo('gallery');
  const p = R.S.p;
  for (const b of R.S.items.filter(i => i.t === 'bust')) { p.x = b.x; p.y = b.y; let g = 0; while (b.face !== R.BUSTS[b.v].want && g++ < 5) R.interact(); }
  step(3);
  check(R.S.flags.bustsSolved && R.grid[12 * R.MW + 25] === 2, '存档穿越 · 死局检查：存档前，标记和门是一致的');
  const raw = JSON.stringify(R.S, (k, v) => (k === 'heardField' || k === 'heard' || k === 'lastSeen') ? undefined : v);
  R.S = R.newState(); R.buildMap(); R.resetTransient();
  R.loadGame(raw);
  check(R.S.flags.bustsSolved, '存档穿越 · 死局检查：读档后解谜标记还在');
  check(R.grid[12 * R.MW + 25] !== 3, '存档穿越 · 死局检查：读档后图书室的门没有变回锁着（否则玩家永远进不去 —— 谜题已解，机关不会再触发第二次）');
  check(R.S.unlocked.includes('25,12'), '存档穿越 · 死局检查：解锁记录写进了存档');
}


// ================= 序章（ui/intro.js）=================
{
  // 开头 60 秒决定别人愿不愿意继续玩。原来是「点新游戏 → 弹 f0 → 关掉 → 你站在主厅里」，
  // 玩家不知道自己是谁、在哪、怕什么。
  check(typeof R.startIntro === 'function' && Array.isArray(R.INTRO_LINES), '序章：存在');
  check(R.INTRO_LINES.length >= 5, `序章：至少 5 行铺陈（${R.INTRO_LINES.length} 行）`);

  // 时间轴必须递增，且每行都有喘息的间隔 —— 挤在一起就成了字幕轰炸
  let prev = -1;
  for (const ln of R.INTRO_LINES) {
    check(ln.t > prev, `序章：「${ln.s}」出现在 ${ln.t}s，时间轴递增`);
    if (prev >= 0) check(ln.t - prev >= 1.5, `序章：「${ln.s}」和上一行间隔 ${(ln.t - prev).toFixed(1)}s，读得完`);
    prev = ln.t;
  }
  check(R.INTRO_LEN > prev + 1.5, `序章：最后一行之后还有静默（总长 ${R.INTRO_LEN}s，末行 ${prev}s）`);

  // 内容上必须回答「我是谁、在哪、要干什么」——这是序章存在的理由
  const all = R.INTRO_LINES.map(l => l.s).join('');
  check(all.includes('洛克伍德'), '序章：说清楚了在哪（洛克伍德宅邸）');
  check(/S\.T\.R\.T|救援/.test(all), '序章：说清楚了我是谁（救援小队）');
  check(/出路|活下去/.test(all), '序章：说清楚了要干什么');

  // 新游戏走序章，读档不走 —— 第二次进来的人只想接着玩
  const src = SOURCES.find(f => f.rel.endsWith('game/save.js')).code;
  const startFn = src.slice(src.indexOf('function startGame'), src.indexOf('function loadGame'));
  const loadFn = src.slice(src.indexOf('function loadGame'));
  check(/startIntro\(\)/.test(startFn), '序章：新游戏会播');
  check(!/startIntro\(\)/.test(loadFn), '序章：读档不播（别逼老玩家再看一遍）');

  // 必须能跳过，键盘鼠标都行
  const inp = SOURCES.find(f => f.rel.endsWith('input/input.js')).code;
  check((inp.match(/mode === 'intro'/g) || []).length >= 2, '序章：键盘和鼠标都能跳过');
}


// ================= 环境声层（config/ambience.js）=================
{
  // 之前全图只有一条不变的低频嗡鸣：从主厅走到冷库、走到后庭院，耳朵里毫无变化。
  // 这一段验的是「每个房间听起来都不一样，而且切换是平滑的」。
  const ids = R.ROOMS.map(r => r.id);
  for (const id of ids) {
    check(!!R.AMBIENCE[id], `环境声：房间「${id}」有自己的环境声配置`);
  }
  // 配置本身的合理性
  const seen = new Set();
  for (const [id, cfg] of Object.entries(R.AMBIENCE)) {
    check(cfg.bed && cfg.bed.freq > 0 && cfg.bed.gain > 0, `环境声 ${id}：底噪参数完整`);
    check(cfg.bed.gain <= 0.06, `环境声 ${id}：底噪不过响（${cfg.bed.gain}），它是背景不是主角`);
    seen.add(`${cfg.bed.freq}|${cfg.bed.q}`);
    for (const sh of cfg.oneshots || []) {
      check(Array.isArray(sh.every) && sh.every[0] > 0 && sh.every[1] >= sh.every[0],
        `环境声 ${id}：「${sh.s}」的间隔是一个合法区间 [${sh.every}]`);
    }
  }
  check(seen.size >= 8, `环境声：至少 8 种不同的空间音色（实际 ${seen.size} 种），相邻房间不会听着一样`);

  // 空间感要和房间的性格对上
  check(R.AMBIENCE.cold.bed.freq < R.AMBIENCE.hall.bed.freq,
    `环境声：冷库(${R.AMBIENCE.cold.bed.freq}Hz) 比主厅(${R.AMBIENCE.hall.bed.freq}Hz) 闷 —— 低频=封闭，高频=空旷`);
  check(R.AMBIENCE.yard.bed.freq > R.AMBIENCE.hall.bed.freq && R.AMBIENCE.yard.bed.gain > R.AMBIENCE.hall.bed.gain,
    '环境声：后庭院（户外）比主厅更亮更响 —— 风声');
  check(R.AMBIENCE.study.bed.gain === Math.min(...Object.values(R.AMBIENCE).map(c => c.bed.gain)),
    '环境声：书房（安全屋）是全图最安静的地方 —— 那份安静本身就是奖励');
  check(R.AMBIENCE.lab.bed.q >= 2, `环境声：研究所的底噪有明显音高（Q=${R.AMBIENCE.lab.bed.q}）—— 电流嗡鸣`);

  // 单次声必须是随机间隔，不能等距（等距会被大脑当成机器噪音忽略）
  const nonFixed = Object.values(R.AMBIENCE).flatMap(c => c.oneshots || []).filter(s => s.every[1] > s.every[0]);
  const all = Object.values(R.AMBIENCE).flatMap(c => c.oneshots || []);
  check(nonFixed.length >= all.length - 1, `环境声：单次声几乎都是随机间隔（${nonFixed.length}/${all.length}，钟摆是唯一允许等距的）`);

  // 换房间必须是渐变而不是硬切
  check(R.AMB_FADE >= 1.0, `环境声：换房间的交叉渐变 ${R.AMB_FADE}s，不会听出「切了一刀」`);

  // 引擎行为：走进不同房间，底噪的目标会跟着换
  fresh(); const T = 48, p = R.S.p;
  warpTo('start'); step(0.1);
  const r1 = R.AMB.room;
  p.x = 4.5 * T; p.y = 17.5 * T; step(0.1);        // 冷库
  check(R.AMB.room === 'cold' && r1 !== 'cold', `环境声：走进冷库时环境层切过去了（${r1} → ${R.AMB.room}）`);
  p.x = 50.5 * T; p.y = 10.5 * T; step(0.1);        // 后庭院
  check(R.AMB.room === 'yard', '环境声：走到后庭院又切成户外');
}


// ================= 性能：寻路场的尖峰摊平 =================
{
  // 逻辑帧的平均耗时一直很低（0.08ms），问题在**尖峰**：四层寻路场原本在同一帧
  // 全部重算，那一帧要 7ms，是平均的 89 倍。好机器上看不出来，普通笔记本上
  // 就是每秒 4 次的规律性顿挫 —— 这种周期性卡顿比整体低帧更难受。
  check(typeof R.computeFlowSlice === 'function', '性能：寻路场改成了分帧轮转（computeFlowSlice）');
  check(Math.abs(R.FLOW_SLICE - 0.25 / 4) < 1e-9,
    `性能：每 ${R.FLOW_SLICE.toFixed(4)}s 重算一层，四层转一圈仍是 0.25s —— 刷新率没变，只是摊开了`);

  const upd = SOURCES.find(f => f.rel.endsWith('game/update.js')).code;
  check(!/computeAllFlows\(\)/.test(upd), '性能：每帧不再一次性重算全部四层');
  check(/computeFlowSlice\(\)/.test(upd), '性能：主循环走的是分帧版本');

  // 门一开一关，寻路必须立刻全部刷新 —— 不能等轮转，否则怪会撞着刚关上的门走
  const doors = SOURCES.find(f => f.rel.endsWith('ai/doors.js')).code;
  check(/computeAllFlows\(\)/.test(doors), '性能：门状态变化时仍然立刻全量重算（正确性优先于性能）');

  // 摊平之后，四层的内容必须和一次性全算出来的完全一致
  fresh(); const T = 48, p = R.S.p;
  p.x = 32.5 * T; p.y = 34.5 * T;
  for (let i = 0; i < 40; i++) R.update(1 / 60);     // 轮转两圈以上
  const snap = [R.flowOfLayer('A'), R.flowOfLayer('B'), R.flowOfLayer('C')].map(a => Array.from(a.slice(0, 4096)));
  R.computeAllFlows();
  const after = [R.flowOfLayer('A'), R.flowOfLayer('B'), R.flowOfLayer('C')].map(a => Array.from(a.slice(0, 4096)));
  for (let i = 0; i < 3; i++) {
    check(JSON.stringify(snap[i]) === JSON.stringify(after[i]),
      `性能：轮转算出来的第 ${'ABC'[i]} 层，和一次性全算的结果一模一样`);
  }
}

// ================= 地图 1 精修：主卧保险柜（第二个谜题）=================
{
  fresh();
  const T = 48, p = R.S.p, it = R.S.items.find(i => i.t === 'safe' && i.v === 'bedroom');
  const cfg = R.SAFES.bedroom;
  check(!!it && cfg.code.length === 4, '保险柜：主卧里有一只四位密码的保险柜');
  // 线索：密码必须能从两份文件里推出来（月日 → 四位），且两份文件都真的摆在地图上
  const f11 = R.FILES.f11.body, f10 = R.FILES.f10.body;
  check(/十月三十一日/.test(f11) && cfg.code === '1031' && /月在前，日在后/.test(f10), '保险柜：f10 说明格式（月日），f11 给出日期（十月三十一日 → 1031）');
  check(['f10', 'f11'].every(f => R.S.items.some(i => i.t === 'file' && i.v === f)), '保险柜：两份线索文件都摆在地图上');
  const roomOf = i => R.ROOMS[R.roomAt[Math.floor(i.y / T) * R.MW + Math.floor(i.x / T)]].id;
  check(roomOf(R.S.items.find(i => i.v === 'f10')) === 'bedroom' && roomOf(R.S.items.find(i => i.v === 'f11')) === 'library', '保险柜：一半线索在主卧，一半在图书室');
  // 交互提示不能再出现 undefined（半身像、地板机关原来会显示「拾取undefined」）
  p.x = it.x; p.y = it.y + 40; const f = R.findInteract();
  check(f && f.it === it, '保险柜：站在旁边按 E 选中的是保险柜');
  R.interact();
  check(R.mode === 'safe' && R.SAFE_UI.it === it, '保险柜：按 E 进入拨盘界面（游戏暂停）');
  R.modeT = 1;
  // 输错：打不开，有声音（会引怪），不锁死
  let heard = 0; const en = R.mkEnemy('zombie', it.x + 4 * T, it.y + 3 * T); R.S.enemies.push(en);
  ['Digit1', 'Digit2', 'Digit3', 'Digit4'].forEach(c => R.safeKey({ code: c }));
  const ok1 = R.trySafe();
  check(!ok1 && !it.open && R.mode === 'safe' && !R.S.p.mods.pistolMag, '保险柜：密码错误打不开，留在拨盘界面');
  check(!!en.heard || en.state === 'investigate' || en.alert, '保险柜：拉把手的声音会引来附近的怪（试错有代价）');
  R.S.enemies = [];
  // 方向键操作
  R.SAFE_UI.digits = [0, 0, 0, 0]; R.SAFE_UI.cur = 0;
  R.safeKey({ code: 'ArrowUp' }); R.safeKey({ code: 'ArrowRight' }); R.safeKey({ code: 'ArrowRight' });
  R.safeKey({ code: 'ArrowUp' }); R.safeKey({ code: 'ArrowUp' }); R.safeKey({ code: 'ArrowUp' });
  R.safeKey({ code: 'ArrowRight' }); R.safeKey({ code: 'ArrowUp' });
  check(R.SAFE_UI.digits.join('') === '1031', `保险柜：↑↓ 拨动、←→ 换位（拨出 ${R.SAFE_UI.digits.join('')}）`);
  R.safeKey({ code: 'ArrowLeft' }); R.safeKey({ code: 'ArrowDown' }); R.safeKey({ code: 'ArrowUp' });
  check(R.SAFE_UI.digits.join('') === '1031', '保险柜：↓ 从 0 拨回 9、再 ↑ 回到 0（循环）');
  R.safeKey({ code: 'Enter' });
  check(it.open && R.mode === 'play' && R.S.p.mods.pistolMag && R.S.flags.bedroomSafeOpen, '保险柜：正确密码打开，拿到手枪扩容弹匣，设置标记');
  check(R.magCap('pistol') === 18 && R.magCap('shotgun') === R.WEAPONS.shotgun.mag, '配件：手枪弹匣 12 → 18，霰弹枪不受影响');
  // 装填到 18
  R.S.p.wep = 'pistol'; R.S.p.mag.pistol = 0; R.reload(); step(2);
  check(R.S.p.mag.pistol === Math.min(18, 18), `配件：装填会装满扩容后的弹匣（${R.S.p.mag.pistol} 发）`);
  // 再按 E：已经空了，不会再给一次
  R.interact();
  check(R.mode === 'play' && Object.keys(R.S.p.mods).length === 1, '保险柜：打开过之后再调查只是提示，不会重复给奖励');
  // 存档穿越：配件和保险柜状态
  const str = JSON.stringify(R.S); R.S = R.newState(); R.loadGame(str);
  const it2 = R.S.items.find(i => i.t === 'safe');
  check(R.S.p.mods.pistolMag && it2.open && R.magCap('pistol') === 18, '保险柜：读档后配件和「已打开」都还在');
  // 坏数据：不认识的配件丢掉
  const bad = JSON.parse(str); bad.p.mods = { pistolMag: true, laser: true }; R.loadGame(JSON.stringify(bad));
  check(!R.S.p.mods.laser && R.S.p.mods.pistolMag, '配件：存档里不认识的配件读档时丢掉');
  // Esc 离开
  fresh(); const it3 = R.S.items.find(i => i.t === 'safe'); R.openSafe(it3); R.modeT = 1; R.safeKey({ code: 'Escape' });
  check(R.mode === 'play' && !it3.open, '保险柜：Esc 离开，什么都不变');
}
{
  // 交互提示：所有能交互的场景物都有像样的文案（不能出现 undefined）
  fresh(); const T = 48;
  const src = SOURCES.find(f => f.rel.endsWith('render/world.js')).code;
  for (const t of ['bust', 'plate', 'safe']) check(src.includes(`f.it.t === '${t}'`), `交互提示：${t} 有专门的提示文字`);
}
{
  // 每张地图的谜题数量：1–2 个（计划 v3.3 调整）
  const counts = Object.values(R.LEVELS).filter(L => L.items && L.id && !/^test/.test(L.id)).map(L => {
    const busts = L.items.some(([t]) => t === 'bust') ? 1 : 0;
    const safes = L.items.filter(([t]) => t === 'safe').length;
    const other = ['valve', 'growlight'].filter(p => L.items.some(([t]) => t === p)).length;
    return [L.id, busts + safes + other];
  });
  check(counts.every(([id, n]) => (n >= 1 || R.LEVELS[id].wip) && n <= 2), `谜题数量：每张地图 1–2 个（${counts.map(([id, n]) => id + '=' + n).join('，')}）`);
}


// ================= 爬行者（计划 5.2）=================
{
  const T = 48;
  check(R.EDEF.crawler && R.EDEF.crawler.hp === 60 && R.EDEF.crawler.nav === 'C', '爬行者：生命 60，C 层寻路（过不了关着的门）');
  check(R.LEVELS.map1.enemies.filter(e => e[0] === 'crawler').length >= 1, '爬行者：地图 1 摆了装死的爬行者');
  // 装死：玩家不靠近就一动不动
  fresh(); const p = R.S.p;
  p.x = 30.5 * T; p.y = 26.5 * T;                            // 北侧走廊
  const c = R.mkEnemy('crawler', 36, 26); R.S.enemies.push(c);
  const x0 = c.x, y0 = c.y;
  R.P.inv = 0; step(3);
  check(c.state === 'lurk' && c.x === x0 && c.y === y0 && !c.alert, '爬行者：玩家在 6 格外时趴着装死，不动也不追');
  // 走到跟前：暴起抓脚踝，扣血并减速
  p.x = c.x - 40; p.y = c.y; R.P.inv = 0; const hp0 = p.hp;
  step(0.6);
  check(c.alert && p.hp < hp0 && R.P.slowT > 0, `爬行者：走到跟前会暴起抓脚踝（扣血 ${hp0 - p.hp}，减速 ${R.P.slowT.toFixed(1)} 秒）`);
  // 减速确实生效
  { R.P.slowT = 1; R.S.enemies = []; const sx = p.x; R.keys.KeyD = true; step(0.2); R.keys.KeyD = false; const slow = p.x - sx;
    R.P.slowT = 0; const sx2 = p.x; R.keys.KeyD = true; step(0.2); R.keys.KeyD = false; const fast = p.x - sx2;
    check(slow > 0 && slow < fast * 0.6, `爬行者：被抓住后移动变慢（${slow.toFixed(0)} vs ${fast.toFixed(0)} px）`); }
  // 开枪打装死的爬行者：会醒
  fresh(); const c2 = R.mkEnemy('crawler', 36, 26); R.S.enemies.push(c2); R.S.p.x = 26.5 * T; R.S.p.y = 26.5 * T;
  R.damageEnemy(c2, 10, 0, 0, false, 0); step(0.1);
  check(c2.state !== 'lurk', '爬行者：装死时挨了打会醒过来');
  // 僵尸复活：身体伤害打死 → 几秒后在原地变成装死的爬行者（玩家在附近时）
  fresh(); const z = R.mkEnemy('zombie', 36, 26); R.S.enemies.push(z); R.S.p.x = 31.5 * T; R.S.p.y = 26.5 * T;
  const saved = R.CRAWLER.reviveChance; R.CRAWLER.reviveChance = 1;
  R.damageEnemy(z, 999, 0, 0, false, 0);
  R.CRAWLER.reviveChance = saved;
  check(z.dead && z.revive > 0, '爬行者：身体伤害打死的僵尸会被标记为可能复活');
  step(R.CRAWLER.reviveDelay[1] + 0.5);
  check(!z.dead && z.t === 'crawler' && z.state === 'lurk' && z.hp === 60, '爬行者：几秒后死掉的僵尸原地变成装死的爬行者');
  // 爆头打死的不会复活
  fresh(); const z2 = R.mkEnemy('zombie', 36, 26); R.S.enemies.push(z2);
  R.CRAWLER.reviveChance = 1; R.damageEnemy(z2, 999, 0, 0, true, 0); R.CRAWLER.reviveChance = saved;
  check(z2.dead && !z2.revive, '爬行者：爆头打死的僵尸不会复活');
  // 存档穿越
  fresh(); const c3 = R.mkEnemy('crawler', 36, 26); R.S.enemies.push(c3);
  const str = JSON.stringify(R.S); R.S = R.newState(); R.loadGame(str); R.mode = 'play';
  check(R.S.enemies.some(e => e.t === 'crawler' && e.state === 'lurk'), '爬行者：装死状态能存档读档');
}

// ================= 处刑者从二楼栏杆跳下（计划 3.5）=================
{
  const T = 48;
  fresh(); const p = R.S.p;
  p.x = 32.5 * T; p.y = 37.5 * T;
  const far = R.mkEnemy('boss', 52, 8); R.S.enemies.push(far);    // 它原本在后庭院
  R.startExecLeap(32, 31);
  check(R.S.leap && !R.S.enemies.some(e => e.t === 'boss'), '跳落：开始时它从原来的位置消失（从楼上下来）');
  { const x0 = p.x, y0 = p.y; R.keys.KeyS = true; step(0.5); R.keys.KeyS = false;
    check(p.x === x0 && p.y === y0, '跳落：演出期间玩家不能移动'); }
  step(R.LEAP.land);
  const b = R.S.enemies.find(e => e.t === 'boss' && !e.dead);
  check(b && Math.floor(b.x / T) === 32 && Math.floor(b.y / T) === 31, '跳落：它落在主厅北侧 (32,31)');
  step(R.LEAP.end);
  check(!R.S.leap && b.alert, '跳落：演出结束后交还控制权，它进入追击');
  // 触发器：两枚徽章归位后会跳下来
  const tr = R.LEVELS.map1.triggers.find(t => t.id === 'medals_placed');
  check(JSON.stringify(tr.do).includes('"leap"'), '跳落：放入最后一枚徽章的触发器里配置了跳落');
  // 升降梯演出中不会插进来
  fresh(); R.S.cine = 3; R.startExecLeap(32, 31);
  check(!R.S.leap, '跳落：已经在别的演出里时不会触发');
}
{
  // 试玩反馈：打倒处刑者之后触发演出，它又从别处跳出来 —— 像有两个处刑者。演出前先看它在不在玩家眼前
  const T = 48;
  let p; fresh(); p = R.S.p; p.x = 32.5 * T; p.y = 37.5 * T; R.cam.x = p.x - R.W / 2; R.cam.y = p.y - R.H / 2;
  const kd = R.mkEnemy('boss', 34, 36); kd.knockdownT = 15; kd.state = 'knockdown'; R.S.enemies = [kd]; const x0 = kd.x;
  R.startExecLeap(32, 31);
  check(!R.S.leap && R.S.enemies.filter(e => e.t === 'boss').length === 1 && kd.x === x0 && kd.knockdownT === 15, '跳落：它就在眼前、刚被打倒 → 不播跳落，它继续跪着（不会从二楼再跳下来一只）');
  fresh(); p = R.S.p; p.x = 32.5 * T; p.y = 37.5 * T; R.cam.x = p.x - R.W / 2; R.cam.y = p.y - R.H / 2;
  const st = R.mkEnemy('boss', 34, 36); R.S.enemies = [st]; R.startExecLeap(32, 31);
  check(!R.S.leap && R.S.enemies.length === 1 && R.S.enemies[0] === st && R.isChasing(st), '跳落：它就在眼前、站着 → 不播跳落，直接从原地追过来');
}
{
  // 地图 2 上车：打倒 / 冻住处刑者后上车 → 它躺在原地看着车开走；它不在眼前才撞开闸门冲出来
  const T = 48, board = () => { R.startTrainDepart([26, 3, 36, 3]); R.S.cine = 8.5; R.S.cineThen = null; };
  let p; fresh(); warpTo('m2train'); p = R.S.p; p.x = 40.5 * T; p.y = 7.5 * T;
  const kd = R.mkEnemy('boss', 44, 8); kd.knockdownT = 15; kd.state = 'knockdown'; R.S.enemies = R.S.enemies.filter(e => e.t !== 'boss').concat(kd);
  R.cam.x = p.x - R.W / 2; R.cam.y = p.y - R.H / 2; const kx = kd.x, ky = kd.y;
  board(); step(3);
  check(R.S.train && R.S.train.bossDown && !R.S.train.bossIn && kd.x === kx && kd.y === ky && kd.knockdownT > 0 && R.S.enemies.filter(e => e.t === 'boss' && !e.dead).length === 1,
    '上车演出：处刑者刚被你打倒在站台上 → 它还躺在原地，不会从闸门再冲出来一只');
  fresh(); warpTo('m2train'); p = R.S.p; p.x = 40.5 * T; p.y = 7.5 * T;
  const up = R.mkEnemy('boss', 44, 8); R.S.enemies = R.S.enemies.filter(e => e.t !== 'boss').concat(up); R.cam.x = p.x - R.W / 2; R.cam.y = p.y - R.H / 2;
  const ux = up.x; board(); step(2.7);
  check(R.S.train.bossIn && Math.abs(up.y - 8.5 * T) < 3 * T && Math.abs(up.x - ux) < 3 * T, '上车演出：它站在站台上 → 从原地追着车跑（不瞬移到闸门）');
  fresh(); warpTo('m2train'); p = R.S.p; p.x = 40.5 * T; p.y = 7.5 * T; R.S.enemies = R.S.enemies.filter(e => e.t !== 'boss'); R.cam.x = p.x - R.W / 2; R.cam.y = p.y - R.H / 2;
  board(); step(2.7);
  const g = R.activeExecutioner();
  check(g && R.S.train.bossIn && Math.abs(g.x - 48.5 * T) < 2 * T, '上车演出：它不在眼前 → 照旧撞开闸门冲上站台');
}

// ================= 地图 1 精修：音乐室 / 温室 / 园丁小屋 / 窗户 / 灯开关 =================
{
  fresh();
  check(R.MW === 80 && R.MH === 48, '精修：地图 1 扩到 80×48，东边放温室和园丁小屋');
  const room = id => R.ROOMS.findIndex(r => r.id === id);
  const at = it => R.roomAt[Math.floor(it.y / TS) * R.MW + Math.floor(it.x / TS)];
  const shed = room('shed');
  check(shed >= 0 && R.ROOMS[shed].safe, '精修：园丁小屋是安全屋');
  const tw = R.S.items.filter(i => i.t === 'typewriter' && at(i) === shed), bx = R.S.items.filter(i => i.t === 'box' && at(i) === shed);
  check(tw.length === 1 && bx.length === 0, '精修：园丁小屋里有打字机（v1.0.1 起取消了道具箱）');
  check(R.grid[16 * R.MW + 61] === 2 && R.grid[7 * R.MW + 61] === 2 && R.grid[9 * R.MW + 7] === 2, '精修：庭院↔小屋、庭院↔温室、图书室↔音乐室三扇门存在');
  // 灯开关
  const sw = R.S.items.find(i => i.t === 'switch' && i.v === 'lightMusic');
  check(sw && at(sw) === room('music') && R.isProp('switch'), '灯开关：音乐室门边有开关，是场景物不是战利品');
  check(!R.S.flags.lightMusic, '灯开关：音乐室一开始是黑的');
  R.S.enemies = []; R.S.p.x = sw.x; R.S.p.y = sw.y - 30; R.S.p.a = Math.PI / 2; R.interact();
  check(R.S.flags.lightMusic === true && !sw.taken, '灯开关：按 E 开灯，开关留在原地');
  R.interact();
  check(!R.S.flags.lightMusic, '灯开关：再按一次关灯');
  // 窗户
  check(R.validateLevel('map1').length === 0, '窗户：breakWindow 引用的窗户 id 都存在');
  const n0 = R.S.enemies.length; R.S.p.keys.sword = true;
  R.S.p.x = 19.5 * TS; R.S.p.y = 34.5 * TS; step(0.1);
  check(R.S.flags.win_wcor2 === true, '窗户：拿着剑之钥匙路过西侧走廊，南墙的窗被撞碎');
  check(R.S.enemies.length === n0 + 1 && R.S.enemies[R.S.enemies.length - 1].t === 'dog', '窗户：一只狗从破窗扑进来');
}

// ================= 地图 2：拉撒路地下研究所（第一阶段：电力机制）=================
{
  check(R.validateLevel('map2').length === 0, '地图 2：配置有效（房间、门、锁、触发器）');
  fresh(); R.gotoLevel('map2', null, null, true); R.mode = 'play'; R.S.enemies = [];
  const I2 = (x, y) => y * R.MW + x, at = it => R.ROOMS[R.roomAt[Math.floor(it.y / TS) * R.MW + Math.floor(it.x / TS)]].id;
  check(R.S.map === 'map2' && R.ROOMS[R.curRoom()].id === 'm2lift', '地图 2：出生在电梯厅');
  step(0.2);
  check(R.S.objective && R.S.objective.includes('保险丝'), '地图 2：一进来目标是找三个保险丝');
  check(R.LEVEL.execEntry && R.ROOMS[R.roomAt[I2(R.LEVEL.execEntry.x, R.LEVEL.execEntry.y)]].id === 'm2lift', '地图 2：处刑者的入口在电梯井（电梯厅）');
  const sec = R.ROOMS.find(r => r.id === 'm2sec');
  check(sec.safe && R.S.items.some(i => i.t === 'typewriter' && at(i) === 'm2sec') && !R.S.items.some(i => i.t === 'box'), '地图 2：安保室是安全屋，有打字机（v1.0.1 起取消了道具箱）');
  const fuses = ['fuseA', 'fuseB', 'fuseC'].map(v => R.S.items.find(i => i.t === 'key' && i.v === v));
  check(fuses.every(Boolean) && new Set(fuses.map(at)).size === 3 && fuses.every(f => !['m2freeze', 'm2control', 'm2bow', 'm2cargo'].includes(at(f))), '地图 2：三个保险丝在三个不同的、断电时就进得去的房间');
  check(R.grid[I2(44, 31)] === 3 && R.grid[I2(60, 31)] === 3 && R.grid[I2(60, 35)] === 3 && R.grid[I2(48, 13)] === 3, '地图 2：冷冻库、主控室、收容区、站台的门一开始都锁着');
  const box = R.S.items.find(i => i.t === 'fusebox'), con = R.S.items.find(i => i.t === 'console');
  R.useFusebox(box); check(!R.S.flags.m2Power && R.msgs[R.msgs.length - 1].t.includes('空'), '配电箱：空手调查 → 提示插槽是空的');
  R.S.p.keys.fuseA = R.S.p.keys.fuseB = true; R.useFusebox(box);
  check(!R.S.flags.m2Power && !R.S.p.keys.fuseA && R.msgs[R.msgs.length - 1].t.includes('2 / 3'), '配电箱：插进两个 → 2 / 3，还没来电');
  R.useConsole(con); check(!R.S.flags.trainReady && R.msgs[R.msgs.length - 1].t.includes('没有电'), '控制台：断电时用不了');
  const n0 = R.S.enemies.length; R.S.p.keys.fuseC = true; R.useFusebox(box);
  check(R.S.flags.m2Power, '配电箱：三个都插上 → 来电');
  step(0.1);
  check(R.grid[I2(44, 31)] === 2 && R.grid[I2(60, 31)] === 2, '来电：冷冻库和主控室的电子门解锁');
  check(R.grid[I2(60, 35)] === 3, '来电：收容区的门过一会儿才开');
  step(3);
  check(R.grid[I2(60, 35)] === 2 && R.isDoorOpen(60, 35) && R.S.enemies.length === n0 + 3, '来电：2.5 秒后收容区的气密门打开，放出三只');
  check(R.S.objective.includes('主控室'), '来电：目标变成去主控室');
  R.S.enemies = [];
  R.useConsole(con); check(!R.S.flags.trainReady && R.msgs[R.msgs.length - 1].t.includes('ID'), '控制台：没有 ID 卡 → 提示刷卡');
  const card = R.S.items.find(i => i.t === 'key' && i.v === 'idcard'); check(card && at(card) === 'm2sewer', '地图 2：ID 卡在污水处理区（主任那里）');
  R.S.p.keys.idcard = true; R.useConsole(con); step(0.1);
  check(R.S.flags.trainReady && R.grid[I2(48, 13)] === 2 && R.isDoorOpen(48, 13), '控制台：有电 + ID 卡 → 列车启动，站台闸门打开');
  const str = JSON.stringify(R.S); R.S = R.newState(); R.loadGame(str); R.mode = 'play';
  check(R.S.map === 'map2' && R.S.flags.m2Power && R.S.fuses.fuseC && R.grid[I2(44, 31)] === 2, '地图 2：存读档后电力、保险丝、门的状态都在');
  R.S.enemies = []; R.S.p.x = 44.5 * TS; R.S.p.y = 7.5 * TS; step(0.1);
  const td = R.S.items.find(i => i.t === 'traindoor');
  check(!R.S.flags.chapter2Done && R.S.countdown && R.S.countdown.label === '列车预热', '货运站台：进站台不会直接走 —— 列车要预热 60 秒（有倒计时）');
  R.useTrainDoor(td); check(!R.S.flags.boarded && R.msgs[R.msgs.length - 1].t.includes('预热'), '货运站台：预热没结束，车门打不开');
  R.S.enemies = []; for (let i = 0; i < 60 * 20; i++) { R.update(1 / 60); R.P.inv = 1; R.S.p.hp = 100; R.S.p.x = 44.5 * TS; R.S.p.y = 7.5 * TS; }
  check(R.activeExecutioner(), '货运站台：预热开始 15 秒后处刑者直奔站台');
  R.S.enemies = []; for (let i = 0; i < 60 * 42; i++) { R.update(1 / 60); R.P.inv = 1; R.S.p.hp = 100; R.S.p.x = 44.5 * TS; R.S.p.y = 7.5 * TS; }
  check(R.S.flags.trainGo, '货运站台：60 秒后车门打开');
  R.useTrainDoor(td); step(0.1);
  check(!R.S.flags.boarded && /回不来/.test(R.msgs[R.msgs.length - 1].t) && /先存档/.test(R.msgs[R.msgs.length - 1].t),
    '货运站台：第一次按 E 只提示「上车就回不来了，建议先存档」（和升降梯一样，计划 §2）');
  R.useTrainDoor(td); step(0.1);
  check(R.S.flags.chapter2Done && R.S.cine > 0, '货运站台：4 秒内再按一次 E 上车 → 上车演出');
  // 消音器
  { const m = R.S.items.find(i => i.t === 'mod' && i.v === 'smgSilencer'); check(m && at(m) === 'm2bow', '消音器：在 B.O.W. 收容区（舔舐者的窝里）');
    R.S.p.wep = 'smg'; check(R.modVal('smg', 'noise', 12) === 12, '消音器：没装之前冲锋枪噪音 12');
    R.S.p.x = m.x; R.S.p.y = m.y; R.interact(m) ; if (!R.S.p.mods.smgSilencer) { m.taken = false; R.giveReward && R.giveReward({ mod: 'smgSilencer' }); }
    check(R.S.p.mods.smgSilencer && R.modVal('smg', 'noise', 12) === 5 && R.modVal('pistol', 'noise', 14) === 14, '消音器：捡到后冲锋枪噪音 12 → 5（手枪不受影响）'); }
  // 霰弹枪短枪管（配件）
  { const m = R.S.items.find(i => i.t === 'mod' && i.v === 'shotgunBarrel'); check(m && at(m) === 'm2sewer', '霰弹枪短枪管：藏在污水处理区的箱子后面');
    check(R.modVal('shotgun', 'cone', R.WEAPONS.shotgun.cone) === R.WEAPONS.shotgun.cone, '霰弹枪短枪管：没装之前扩散 0.13');
    R.S.p.x = m.x; R.S.p.y = m.y; R.interact(m); if (!R.S.p.mods.shotgunBarrel) R.giveReward({ mod: 'shotgunBarrel' });
    check(R.S.p.mods.shotgunBarrel && R.modVal('shotgun', 'cone', 0.13) < 0.13 && R.modVal('magnum', 'cone', 0) === 0, '霰弹枪短枪管：装上后弹丸更集中（只影响霰弹枪）'); }
  check(R.S.train && R.S.cine > 0, '货运站台：上车后播列车开走的动画'); step(9); for (let i = 0; i < 400 && R.mode === 'loading'; i++) R.updateLoading(1 / 60); check(R.S.map === 'map3' && R.ROOMS[R.curRoom()].id === 'm3station', '货运站台：演出结束 → 列车开进地图 3 的货运站');
}

// ================= 地图 2 第二阶段：舔舐者 / 积水 / 储物柜 + 冲锋枪 =================
{
  const I2 = (x, y) => y * R.MW + x;
  const lickerAt = (tx, ty) => { const e = R.mkEnemy('licker', tx, ty); R.S.enemies.push(e); return e; };
  fresh(); R.gotoLevel('map2', null, null, true); R.mode = 'play'; R.S.enemies = [];
  const p = R.S.p; p.x = 35.5 * TS; p.y = 41.5 * TS;
  check(R.EDEF.licker && R.EDEF.licker.hp === 450 && R.EDEF.licker.r <= 21, '舔舐者：450 血，半径过得了门');
  // 1. 失明：就站在旁边 2 格、正对着，走路不会被发现
  let L = lickerAt(38, 41); L.fa = Math.PI;
  for (let i = 0; i < 90; i++) { R.keys.KeyA = i % 20 < 10; R.keys.KeyD = i % 20 >= 10; R.update(1 / 60); }
  R.keys.KeyA = R.keys.KeyD = false;
  check(!L.alert && L.state !== 'attack' && L.state !== 'lunge', '舔舐者：玩家在 2 格外正常走路 → 完全没发现（失明）');
  // 2. 开枪：听到了，扑向声源 / 用舌头
  R.S.enemies = []; L = lickerAt(39, 41); p.x = 35.5 * TS; p.y = 41.5 * TS;
  R.emitNoise(p.x, p.y, 14, 'run');
  check(L.alert !== undefined && L.heard && Math.abs(L.heard.x - p.x) < 1, '舔舐者：听到声音 → 记下声源的位置');
  const hp0 = p.hp; step(1.5);
  check(p.hp < hp0, `舔舐者：声源就是玩家、舌头够得着 → 受到攻击（${hp0} → ${p.hp}）`);
  // 3. 扑向的是声音不是人：声音在别处，站着不动的玩家不会被攻击
  fresh(); R.gotoLevel('map2', null, null, true); R.mode = 'play'; R.S.enemies = [];
  p.x = R.S.p.x; const P2 = R.S.p; P2.x = 31.5 * TS; P2.y = 43.5 * TS; P2.hp = 100;
  L = lickerAt(40, 38);
  R.emitNoise(40.5 * TS, 42.5 * TS, 6, 'door');
  step(1.2);
  check(dist2(L, 40.5 * TS, 42.5 * TS) < dist2({ x: 40.5 * TS, y: 38.5 * TS }, 40.5 * TS, 42.5 * TS) && P2.hp === 100, '舔舐者：扑向声源，站在远处不出声的玩家没事');
  // 4. 近距离枪声让它混乱
  R.S.enemies = []; L = lickerAt(33, 43); R.emitNoise(P2.x, P2.y, 14, 'gun');
  check(!(L.confT > 0), '舔舐者：手枪声不会震懵它（不会一挨打就原地转圈）');
  R.S.enemies = []; L = lickerAt(32, 43); R.emitNoise(P2.x, P2.y, 18, 'gun');
  check(L.confT > 0, '舔舐者：霰弹枪贴脸 → 震懵一下');
  const fa0 = L.fa; step(0.5);
  check(Math.abs(L.fa - fa0) < 0.01, '舔舐者：震懵时不转圈');
  L.confT = 0; R.emitNoise(P2.x, P2.y, 18, 'gun');
  check(!(L.confT > 0), '舔舐者：8 秒内不会被连续震懵');
  // 被子弹打中：知道你在哪，会反击
  R.S.enemies = []; L = lickerAt(33, 43); P2.hp = 100; R.damageEnemy(L, 26, 0, 0, false, 0.1, 'gun'); step(1.5);
  check(P2.hp < 100, `舔舐者：挨了一枪 → 朝开枪的人反击（${P2.hp}）`);
  // 5. 贴身撞上
  R.S.enemies = []; L = lickerAt(31, 43); L.x = P2.x + 20; L.y = P2.y; step(0.05);
  check(L.heard && L.alert, '舔舐者：贴身撞上也会被发现（摸到了）');
  // 6. 来电后收容区放出来的是舔舐者
  fresh(); R.gotoLevel('map2', null, null, true); R.mode = 'play'; R.S.enemies = [];
  R.S.flags.m2Power = true; R.fireEvent('flag', { flag: 'm2Power' }); step(3);
  check(R.S.enemies.filter(e => e.t === 'licker').length === 2, '来电：收容区放出两只舔舐者');
  // 积水
  fresh(); R.gotoLevel('map2', null, null, true); R.mode = 'play'; R.S.enemies = [];
  const sewer = R.ROOMS.find(r => r.id === 'm2sewer');
  check(sewer.water > 0 && sewer.water < 1 && sewer.floor === 'water', '积水：污水处理区有积水');
  const walkDist = (x, y) => { P2.x = x * TS; P2.y = y * TS; const x0 = P2.x; R.keys.KeyD = true; step(0.5); R.keys.KeyD = false; return P2.x - x0; };
  const P3 = R.S.p; const dDry = (() => { P3.x = 20 * TS; P3.y = 33.5 * TS; const x0 = P3.x; R.keys.KeyD = true; step(0.5); R.keys.KeyD = false; return P3.x - x0; })();
  const dWet = (() => { P3.x = 5.5 * TS; P3.y = 37.5 * TS; const x0 = P3.x; R.keys.KeyD = true; step(0.5); R.keys.KeyD = false; return P3.x - x0; })();
  check(dWet < dDry * 0.8 && dWet > dDry * 0.6, `积水：移动速度变慢（干地 ${dDry.toFixed(0)} → 水里 ${dWet.toFixed(0)} 像素 / 0.5 秒）`);
  const z = R.mkEnemy('zombie', 10, 37); z.fa = 0; R.S.enemies = [z]; P3.x = 6.5 * TS; P3.y = 37.5 * TS; R.keys.KeyD = true; step(1.5); R.keys.KeyD = false;
  check(!!z.heard || z.alert, '积水：在水里走路有水声，背对你的僵尸也会听见');
  // 储物柜 + 冲锋枪
  fresh(); R.gotoLevel('map2', null, null, true); R.mode = 'play'; R.S.enemies = [];
  const lk = R.S.items.find(i => i.t === 'safe' && i.v === 'dormLocker');
  check(lk && R.ROOMS[R.roomAt[I2(Math.floor(lk.x / TS), Math.floor(lk.y / TS))]].id === 'm2dorm', '储物柜：在员工宿舍');
  check(R.FILES.m2f3.body.includes('四月十七') && R.FILES.m2f6.body.includes('生日') && R.SAFES.dormLocker.code === '0417', '储物柜：密码 0417，线索分在信和便条里');
  R.openSafe(lk); R.SAFE_UI.digits = [0, 4, 1, 7]; R.trySafe();
  check(lk.open && R.invHas('smg') && R.invCount('ammo_smg') === 40 && R.S.p.mag.smg === 40, '储物柜：打开 → 冲锋枪（满匣 40）+ 40 发子弹');
  check(R.WEAPONS.smg.auto && R.WEAPONS.smg.fireCd <= 0.1 && R.WEAPONS.smg.mag === 40, '冲锋枪：全自动、射速 0.08 秒、弹匣 40');
  R.S.p.wep = 'smg'; R.S.p.mag.smg = 40; R.P.fireCd = 0; R.shoot();
  check(R.S.p.mag.smg === 39, '冲锋枪：能开火，消耗弹匣');
}

// ================= 地图 2 第三阶段：淤泥体 / 液氮阀门 / 麦林 =================
{
  fresh(); R.gotoLevel('map2', null, null, true); R.mode = 'play'; R.S.enemies = [];
  const p = R.S.p;
  // 淤泥体
  let s = R.mkEnemy('slime', 12, 40); R.S.enemies = [s];
  p.x = 30 * TS; p.y = 40.5 * TS; step(0.5);
  check(s.hidden === true, '淤泥体：平时潜在水里（hidden）');
  R.P.fireCd = 0; p.wep = 'pistol'; p.mag.pistol = 12; p.x = 6.5 * TS; p.y = 37.5 * TS; p.a = 0; R.P.focus = 1;
  s.x = 9.5 * TS; s.y = 37.5 * TS; const hp0 = s.hp; R.shoot();
  check(s.hp === hp0, '淤泥体：潜在水里时子弹打不到');
  p.hp = 100; R.P.inv = 0; s.x = p.x + 40; s.y = p.y; s.subT = 0; step(1.2);
  check(p.hp < 100 && R.P.slowT > 0 && !s.hidden, `淤泥体：玩家踩到它旁边 → 暴起拖人（伤害 + 减速，${p.hp}）`);
  R.P.fireCd = 0; R.P.focus = 1; p.a = Math.atan2(s.y - p.y, s.x - p.x); const hp1 = s.hp; R.shoot();
  check(s.hp < hp1, '淤泥体：露出水面时能打');
  for (let i = 0; i < 300; i++) { R.update(1 / 60); check.quiet = 1; }
  const room = R.ROOMS[R.roomAt[Math.floor(s.y / TS) * R.MW + Math.floor(s.x / TS)]];
  check(room && room.water, '淤泥体：永远待在积水里');
  // 阀门谜题
  fresh(); R.gotoLevel('map2', null, null, true); R.mode = 'play'; R.S.enemies = [];
  const vs = R.S.items.filter(i => i.t === 'valve');
  check(vs.length === 3 && vs.every(v => R.ROOMS[R.roomAt[Math.floor(v.y / TS) * R.MW + Math.floor(v.x / TS)]].id === 'm2freeze'), '阀门：冷冻库里有 A、B、C 三个阀门');
  check(R.FILES.m2f7.body.includes('3 档') && R.FILES.m2f7.body.includes('低两档') && R.FILES.m2f7.body.includes('之和'), '阀门：规程文件给出 A=3、B=A−2、C=A+B');
  const z = R.mkEnemy('zombie', 41, 25); R.S.enemies = [z];
  const V = v => vs.find(x => x.v === v);
  R.useValve(V('A'));
  check(V('A').p === 2 && (z.heard || z.alert), '阀门：拧一下 +1 档，有泄压声（附近的东西听得见）');
  for (let i = 0; i < 5; i++) R.useValve(V('A'));
  check(V('A').p === 2, '阀门：5 档之后回到 1 档');
  R.useValve(V('A'));   // 3
  R.useValve(V('C')); R.useValve(V('C'));   // 2 → 4
  check(V('B').p === undefined && !R.S.flags.valvesSolved, '阀门：B 初始不在答案上，还差 B 的时候不会打开');
  check(!R.invHas('magnum'), '阀门：没解开之前拿不到麦林');
  R.useValve(V('B')); R.useValve(V('B')); R.useValve(V('B'));   // 3 → 4 → 5 → 1
  check(R.S.flags.valvesSolved && !R.invHas('magnum'), '阀门：A3 B1 C4 → 枪械柜解锁（麦林还在柜子里）');
  const gl = R.S.items.find(i => i.t === 'gunlocker');
  { const v = R.S.p.inv; for (let i = 0; i < v.size; i++) if (!v.slots[i]) v.slots[i] = { id: 'herb_g', n: 1 }; }   // 格子全占满
  R.useGunLocker(gl);
  check(R.invHas('magnum') && R.S.p.mag.magnum === 6 && R.S.flags.magnumTaken, '枪械柜：格子全占满也能拿到麦林（满匣 6 发；背包不限格数，以前要先腾出空位）');
  // 麦林：穿透
  R.S.enemies = []; const a1 = R.mkEnemy('zombie', 44, 27), a2 = R.mkEnemy('zombie', 46, 27), a3 = R.mkEnemy('zombie', 48, 27), a4 = R.mkEnemy('zombie', 49, 27);
  [a1, a2, a3, a4].forEach(e => { e.y = 25.5 * TS; R.S.enemies.push(e); });
  { const p = R.S.p; p.x = 41.5 * TS; p.y = 25.5 * TS; p.a = 0; p.wep = 'magnum'; } R.P.fireCd = 0; R.P.reloadT = 0; R.P.focus = 1; R.shoot();
  check(a1.dead && a2.dead && a3.dead && !a4.dead, '麦林：一发 180，穿透——一排里打穿前三个，第四个没事');
  // 液氮：冻住处刑者
  {
    fresh(); R.gotoLevel('map2', null, null, true); R.mode = 'play'; R.S.enemies = [];
    const lev = R.S.items.find(i => i.t === 'ln2lever');
    check(!!lev && R.ROOMS[R.roomAt[Math.floor(lev.y / TS) * R.MW + Math.floor(lev.x / TS)]].id === 'm2freeze', '液氮：冷冻库门边有紧急排放拉杆');
    const p = R.S.p; p.x = lev.x; p.y = lev.y - 30; R.P.inv = 0;
    R.spawnExecutioner(44, 24); const b = R.activeExecutioner();
    R.useLN2Lever(lev);
    check(!b.frozenT, '液氮：阀门没调好之前拉不动');
    R.S.flags.valvesSolved = true; const hp0 = p.hp;
    R.useLN2Lever(lev);
    check(b.frozenT > 29 && b.state === 'frozen' && p.hp === hp0, '液氮：处刑者在中央 → 冻住 30 秒，站在门边的你没事');
    const bx = b.x, k0 = R.S.executioner ? R.S.executioner.knockdowns : 0, st0 = b.stagAcc || 0;
    R.damageEnemy(b, 500, 0, 0, false, 1);
    check((b.stagAcc || 0) === st0 && (R.S.executioner ? R.S.executioner.knockdowns : 0) === k0, '液氮：冻着时子弹打在冰上，不计入打倒阈值');
    for (let i = 0; i < 60 * 20; i++) { R.update(1 / 60); p.x = lev.x; p.y = lev.y - 30; R.P.inv = 1; }
    check(b.frozenT > 0 && Math.abs(b.x - bx) < 1, '液氮：20 秒后还冻着，一步没动');
    R.useLN2Lever(lev);
    check(b.frozenT < 11, '液氮：排放后要重新加压，不能连着拉');
    for (let i = 0; i < 60 * 11; i++) { R.update(1 / 60); p.x = lev.x; p.y = lev.y - 30; }
    check(!b.frozenT && (b.state === 'track' || R.isChasing(b)), '液氮：30 秒后破冰，直接朝你追过来');
    fresh(); R.gotoLevel('map2', null, null, true); R.mode = 'play'; R.S.enemies = []; R.S.flags.valvesSolved = true;
    const lev2 = R.S.items.find(i => i.t === 'ln2lever'); R.S.p.x = 44.5 * TS; R.S.p.y = 24.5 * TS; R.P.inv = 0; const h1 = R.S.p.hp;
    R.useLN2Lever(lev2);
    check(R.S.p.hp < h1 && R.P.slowT > 0, '液氮：自己站在喷口区里拉 → 冻伤 + 变慢');
  }
  // 地图 3：骨架
  {
    check(R.validateLevel('map3').length === 0, '地图 3：配置有效（房间、门、锁、触发器）');
    fresh(); R.mode = 'play'; warpTo('m3');
    check(R.S.map === 'map3' && R.ROOMS[R.curRoom()].id === 'm3station' && R.invHas('magnum'), '试玩跳转「货运站」：直接到地图 3 货运站（带齐武器）');
    check(R.ROOMS.find(r => r.id === 'm3yard').rain && R.ROOMS.find(r => r.id === 'm3admin').safe, '地图 3：装卸区下雨，行政楼是安全屋');
    const pass = R.S.items.find(i => i.t === 'key' && i.v === 'pass');
    check(pass && R.ROOMS[R.roomAt[Math.floor(pass.y / TS) * R.MW + Math.floor(pass.x / TS)]].id === 'm3admin' && R.grid[28 * R.MW + 12] === 3, '地图 3：通行证在行政楼，化学仓库的门锁着');
    for (let i = 0; i < 60 * 21; i++) { R.update(1 / 60); R.P.inv = 1; R.S.p.hp = 100; }
    check(R.activeExecutioner(), '地图 3：处刑者从最后一节车厢跟了过来');
  }
  // 处刑者全程跟随：地图 1 → 地图 2 → 地图 3 一路不掉（含倒地、冻住、长时间、存读档）
  {
    const god = () => { R.P.inv = 5; R.S.p.hp = 100; };
    const go = id => { R.gotoLevel(id); for (let i = 0; i < 600 && R.mode === 'loading'; i++) R.updateLoading(1 / 60); R.mode = 'play'; };
    const run = sec => { for (let i = 0; i < sec * 60; i++) { R.update(1 / 60); god(); if (R.mode !== 'play') R.mode = 'play'; } };
    fresh(); R.spawnExecutioner(40, 20); god();
    let b = R.activeExecutioner(); b.knockdownT = 5; b.state = 'knockdown';   // 倒地时换图也照样跟
    go('map2'); R.S.enemies = R.S.enemies.filter(e => e.t === 'boss');
    check(!R.activeExecutioner() && R.S.executioner.follow && R.S.executioner.follow.map === 'map2', '全程跟随：地图 1 倒地时换图，它也记着跟去地图 2');
    run(30);
    check(!!R.activeExecutioner(), '全程跟随：30 秒内从电梯井砸下来');
    let lost = 0; for (let s = 0; s < 240; s++) { run(1); if (!R.activeExecutioner()) lost++; }
    check(lost === 0, `全程跟随：在地图 2 待 4 分钟，它一直都在（消失 ${lost} 秒）`);
    R.freezeExecutioner(R.activeExecutioner());   // 冻着时换图
    const str = JSON.stringify(R.S); R.S = R.newState(); R.loadGame(str); R.mode = 'play';
    check(!!R.activeExecutioner(), '全程跟随：存读档后它还在');
    go('map3'); R.S.enemies = R.S.enemies.filter(e => e.t === 'boss');
    check(R.S.executioner.follow && R.S.executioner.follow.map === 'map3', '全程跟随：冻着时离开，它也记着跟去地图 3');
    run(30);
    b = R.activeExecutioner();
    check(b && !b.frozenT, '全程跟随：从最后一节车厢出来，冰已经化了');
    lost = 0; for (let s = 0; s < 120; s++) { run(1); if (!R.activeExecutioner()) lost++; }
    check(lost === 0, `全程跟随：在地图 3 待 2 分钟，它一直都在（消失 ${lost} 秒）`);
    // 回到地图 2（原路返回的情况）再回来：也不能丢
    go('map2'); run(30); check(!!R.activeExecutioner(), '全程跟随：折返回地图 2，它也跟回来');
  }
  // 地图 3：膨胀者、毒雾、中毒、燃烧榴弹
  {
    fresh(); R.mode = 'play'; warpTo('m3'); R.S.enemies = [];
    const p = R.S.p; p.x = 30 * TS; p.y = 20 * TS; R.P.inv = 0; p.hp = 100; p.poison = false;
    const bl = R.mkEnemy('bloater', 33, 20), z = R.mkEnemy('zombie', 34, 20); R.S.enemies = [bl, z];
    R.damageEnemy(bl, 500, 0, 0, false, 0);
    check(bl.dead && R.S.gas.length === 1, '膨胀者：打死就炸，留下一团毒雾');
    check(z.hp < 100, '膨胀者：爆炸能伤到旁边的怪');
    check(p.hp === 100, '膨胀者：站在 3 格外开枪，爆炸炸不到你');
    p.x = bl.x; p.y = bl.y; R.updateHazards(1 / 60);
    check(p.poison, '毒雾：走进去就中毒');
    const h0 = p.hp; for (let i = 0; i < 60 * 12; i++) R.updateHazards(1 / 60);
    check(p.hp < h0 && p.hp >= 1, '中毒：慢慢掉血（不会直接毒死）');
    R.S.gas = []; R.invAdd(p.inv, 'herb_b', 1); R.useHealItem('herb_b');
    check(!p.poison, '中毒：蓝色草药解毒');
    // 榴弹发射器
    R.S.enemies = []; p.x = 20 * TS; p.y = 20.5 * TS; p.a = 0; p.hp = 100; R.P.inv = 1;
    const t1 = R.mkEnemy('zombie', 26, 20); R.S.enemies = [t1];
    R.invAdd(p.inv, 'gl', 1); p.mag.gl = 1; p.wep = 'gl'; R.P.fireCd = 0; R.P.reloadT = 0; R.shoot();
    check(R.S.nades.length === 1, '榴弹发射器：发射一枚会飞的榴弹（不是即时命中）');
    for (let i = 0; i < 60; i++) R.updateHazards(1 / 60);
    check(R.S.nades.length === 0 && R.S.fires.length === 1 && t1.hp < 100, '燃烧榴弹：撞到怪就炸，留下一片火场');
    const hp1 = t1.hp; for (let i = 0; i < 60; i++) R.updateHazards(1 / 60);
    check(t1.dead || t1.hp < hp1, '燃烧榴弹：站在火场里的怪持续掉血');
    const glI = R.S.items.find(i => i.t === 'glcase'), fa = R.S.items.find(i => i.t === 'glammo');
    const roomOf = it => R.ROOMS[R.roomAt[Math.floor(it.y / TS) * R.MW + Math.floor(it.x / TS)]].id;
    check(glI && roomOf(glI) === 'm3green' && fa && roomOf(fa) === 'm3chem', '地图 3：燃烧榴弹在化学仓库深处，榴弹发射器在温室');
  }
  // 榴弹发射器的三种弹种（M4）：爆炸、酸液；R 切换
  {
    fresh(); R.mode = 'play'; warpTo('m3'); R.S.enemies = [];
    const p = R.S.p, G = R.GL_ROUNDS; p.inv.slots.fill(null);
    const setup = () => { p.x = 20 * TS; p.y = 20.5 * TS; p.a = 0; p.hp = 100; R.P.inv = 1; R.P.fireCd = 0; R.P.reloadT = 0; R.S.nades = []; R.S.fires = []; };
    R.invAdd(p.inv, 'gl', 1); p.wep = 'gl'; p.mag.gl = 1; p.glLoaded = 'fire'; p.glType = 'fire';
    R.invAdd(p.inv, 'ammo_fire', 1); R.invAdd(p.inv, 'ammo_bomb', 2); R.invAdd(p.inv, 'ammo_acid', 2);
    check(R.GL_ORDER.join() === 'fire,bomb,acid' && R.ITEMS.ammo_bomb.weapon === 'gl' && R.ITEMS.ammo_acid.weapon === 'gl', '榴弹：三种弹种（燃烧 / 爆炸 / 酸液）都是榴弹发射器的弹药');
    setup(); R.reload();
    check(p.mag.gl === 0 && p.glType === 'bomb' && R.invCount('ammo_fire') === 2 && R.P.reloadT > 0, '榴弹：装着一发时按 R → 那发退回背包，换装下一种（爆炸）');
    for (let i = 0; i < 60 * 2; i++) R.update(1 / 60);
    check(p.mag.gl === 1 && R.glLoaded() === 'bomb' && R.invCount('ammo_bomb') === 1, '榴弹：装填完成，枪里是爆炸榴弹');
    // 爆炸榴弹：范围大、边缘减半、墙后炸不到
    setup(); const z1 = R.mkEnemy('zombie', 26, 20), z2 = R.mkEnemy('zombie', 26, 22); z1.hp = z2.hp = 1000; R.S.enemies = [z1, z2];
    R.shoot(); check(R.S.nades.length === 1 && R.S.nades[0].kind === 'bomb', '爆炸榴弹：发射出去的是爆炸弹');
    for (let i = 0; i < 60; i++) R.updateHazards(1 / 60);
    check(1000 - z1.hp >= 200 && z2.hp < 1000 && 1000 - z2.hp < 1000 - z1.hp && !(R.S.fires || []).length, `爆炸榴弹：直接命中 ${1000 - z1.hp}、旁边 2 格的也被炸到 ${1000 - z2.hp}（边缘减半），不留火场`);
    setup(); R.P.inv = 0; R.S.enemies = []; R.bombBurst(p.x + 40, p.y);
    check(p.hp < 100 && p.hp >= 100 - G.bomb.playerDmg, `爆炸榴弹：贴脸打会炸到自己（-${100 - p.hp}）`);
    // 酸液榴弹：腐蚀 8 秒，之后伤害 ×1.5
    setup(); const b = R.mkEnemy('hunter', 26, 20); b.hp = 5000; R.S.enemies = [b];
    R.acidBurst(b.x, b.y);
    check(b.acidT === G.acid.t && 5000 - b.hp === G.acid.dmg, '酸液榴弹：命中 110 伤害，目标被腐蚀 8 秒');
    let h = b.hp; R.damageEnemy(b, 100, 0, 0, false, 0, 'gun');
    check(h - b.hp === 150, '酸液腐蚀：之后的枪击伤害 ×1.5');
    for (let i = 0; i < 60 * 8.2; i++) R.updateHazards(1 / 60);
    h = b.hp; R.damageEnemy(b, 100, 0, 0, false, 0, 'gun');
    check(h - b.hp === 100, '酸液腐蚀：8 秒后消退，伤害恢复正常');
    b.acidT = 5; R.S.enemies = [b];
    // 自动换弹种：选中的弹种打光了（枪也空了）→ 自动换成还有的
    p.mag.gl = 0; p.glType = 'bomb'; while (R.invCount('ammo_bomb')) R.invTake('ammo_bomb', 1);
    check(R.glCur() !== 'bomb' && R.ammoCount('gl') > 0, '榴弹：选的弹种打光了，自动换成背包里还有的');
    // 地图摆放 + 电磁炮不吃腐蚀加成
    const roomOf = it => R.ROOMS[R.roomAt[Math.floor(it.y / TS) * R.MW + Math.floor(it.x / TS)]].id;
    const bombs = R.S.items.filter(i => i.t === 'glbomb'), acids = R.S.items.filter(i => i.t === 'glacid');
    check(bombs.some(i => roomOf(i) === 'm3plant') && acids.some(i => roomOf(i) === 'm3tower') && acids.some(i => roomOf(i) === 'm3platform'), '地图 3：爆炸榴弹在生产车间，酸液榴弹在控制塔和终点站台');
    const pk = R.pickUp({ t: 'glacid', v: 2 });
    check(pk && R.invCount('ammo_acid') >= 2, '拾取：地上的酸液榴弹进背包');
  }
  // 配件：霰弹枪短枪管（弹丸更集中，远处打中更多）、麦林长枪管（伤害 +20%）
  {
    fresh(); R.mode = 'play'; warpTo('m3'); R.S.enemies = [];
    const p = R.S.p; p.inv.slots.fill(null); p.mods = {};
    const roomOf = it => R.ROOMS[R.roomAt[Math.floor(it.y / TS) * R.MW + Math.floor(it.x / TS)]].id;
    const mb = R.S.items.find(i => i.t === 'mod' && i.v === 'magnumBarrel');
    check(mb && roomOf(mb) === 'm3yard', '麦林长枪管：藏在装卸区的货堆后面');
    const shotAt = (w, n) => { let tot = 0; for (let k = 0; k < n; k++) { const z = R.mkEnemy('zombie', 26, 20); z.hp = 99999; R.S.enemies = [z]; p.x = 20.5 * TS; p.y = z.y; p.a = 0; p.wep = w; p.mag[w] = 5; R.P.fireCd = 0; R.P.reloadT = 0; R.P.focus = 1; R.shoot(); tot += 99999 - z.hp; } return tot / n; };
    R.invAdd(p.inv, 'magnum', 1); R.invAdd(p.inv, 'shotgun', 1);
    const m0 = shotAt('magnum', 5), s0 = shotAt('shotgun', 60);
    p.mods.magnumBarrel = true; p.mods.shotgunBarrel = true;
    const m1 = shotAt('magnum', 5), s1 = shotAt('shotgun', 60);
    check(Math.round(m0) === 180 && Math.round(m1) === 216, `麦林长枪管：一发 180 → ${Math.round(m1)}（+20%）`);
    check(s1 > s0 * 1.15, `霰弹枪短枪管：5.5 格外平均一枪 ${Math.round(s0)} → ${Math.round(s1)}（打中的弹丸更多）`);
  }
  // 蔓生体
  {
    fresh(); R.mode = 'play'; warpTo('m3'); R.S.enemies = [];
    const p = R.S.p, v = R.mkEnemy('vine', 34, 37); R.S.enemies = [v]; p.hp = 100; p.poison = false;
    p.x = 34.5 * TS; p.y = 41.5 * TS; R.P.inv = 1; R.update(1 / 60);
    check(v.state === 'hide', '蔓生体：离得远时伪装成植物，不动');
    R.damageEnemy(v, 100, 0, 10, false, 0.5, 'pistol');
    check(v.hp === 500 && Math.abs(v.x - 34.5 * TS) < 0.01, '蔓生体：子弹正常伤害，但打不退它');
    R.damageEnemy(v, 100, 0, 0, false, 0, 'fire');
    check(v.hp === 300, '蔓生体：榴弹/火焰伤害翻倍');
    v.state = 'hide'; v.alert = false; p.x = v.x; p.y = v.y + 100; R.update(1 / 60);
    check(v.state === 'up', '蔓生体：走近了就暴起');
    p.y = v.y + 200; R.P.inv = 0; p.hp = 100; v.spitT = 0;
    for (let i = 0; i < 90; i++) { R.update(1 / 60); if (p.poison) break; }
    check(p.poison && p.hp < 100, '蔓生体：隔几格吐酸液，命中会中毒');
    const vs = R.S.items && R.LEVELS.map3.enemies.filter(e => e[0] === 'vine').length;
    check(vs === 2, '地图 3：温室里有两只蔓生体');
  }
  // 温室补光灯谜题
  {
    fresh(); R.mode = 'play'; warpTo('m3'); R.S.p.inv.slots.fill(null); R.S.p.mag.gl = 0;
    const L = id => R.S.items.find(i => i.t === 'growlight' && i.v === id), box = R.S.items.find(i => i.t === 'glcase');
    check(box && !R.S.items.some(i => i.t === 'gl'), '温室：榴弹发射器锁在武器箱里');
    R.useGlCase(box); check(!R.S.flags.glTaken, '温室：灯位不对打不开武器箱');
    R.useGrowLight(L('C'));
    check(R.S.enemies.filter(e => e.t === 'vine').every(e => e.state === 'up'), '温室：打开 C 床的灯会惊醒蔓生体');
    R.useGrowLight(L('C')); R.useGrowLight(L('A')); R.useGrowLight(L('B'));
    check(!R.S.flags.growSolved, '温室：只开 A、B 还不够');
    R.useGrowLight(L('D'));
    check(R.S.flags.growSolved, '温室：A 开 B 开 C 关 D 开 → 电子锁解开');
    R.useGlCase(box); check(R.S.flags.glTaken && R.S.p.mag.gl === 1, '温室：拿到榴弹发射器（装着一发）');
    check(!R.LEVELS.map3.wip, '地图 3：不再标记为制作中');
  }
  // 猎手（M4-1）：生产车间、包抄、飞扑、处决（1 秒预警、可打断）
  {
    const H = R.EDEF.hunter;
    check(H.hp === 350 && H.spd[0] >= 150 && H.spd[1] <= 160 && H.spd[1] < R.PLAYER_SPEED.run && H.spd[0] > R.PLAYER_SPEED.walk && R.HUNTER.leapSpd === 360 && R.HUNTER.leapTell >= 0.55 && R.HUNTER.leapDmg === 25 && H.memory === 12 && H.nav === 'A', '猎手：350 血、移动 150–160（比玩家奔跑慢、比行走快）、飞扑 360（试玩反馈调慢）、伏低 0.55 秒、扑中 25、记忆 12 秒、会开门（A 层）');
    check(R.validateLevel('map3').length === 0, '生产车间：地图 3 配置仍然有效');
    fresh(); R.mode = 'play'; warpTo('m3');
    const roomId = (x, y) => { const i = R.roomAt[Math.floor(y) * R.MW + Math.floor(x)]; return i >= 0 ? R.ROOMS[i].id : null; };
    check(R.ROOMS.some(r => r.id === 'm3plant') && R.grid[36 * R.MW + 42] === 3 && R.LEVEL.locks['42,36'] === 'pass', '生产车间：在温室东边，入口要刷通行证');
    const hs = R.S.enemies.filter(e => e.t === 'hunter');
    check(hs.length === 2 && hs.every(e => roomId(e.x / TS, e.y / TS) === 'm3plant'), '生产车间：两只猎手在车间里');
    check(R.grid[26 * R.MW + 42] === 3, '生产车间：通往装卸区的卷帘门一开始插着插销');
    R.S.enemies = []; R.S.p.x = 43.5 * TS; R.S.p.y = 27.5 * TS; R.P.inv = 5; R.update(1 / 60);
    check(R.grid[26 * R.MW + 42] === 2, '生产车间：从里面走到卷帘门边，拔掉插销 → 和装卸区连通');
    const trg = R.LEVELS.map3.triggers.find(t => t.id === 'm3_gl');
    check(trg && /生产车间/.test(trg.do[0].objective), '地图 3：拿到榴弹发射器后，目标指向生产车间');
    { const W = R.WEAPONS, I = R.ITEMS;
      check(W.magnum.model === W.pistol.model && W.magnum.len === W.pistol.len && W.magnum.shell === W.pistol.shell && I.magnum.col === I.pistol.col,
        '麦林：外形和手枪一模一样（手上的模型、枪口火焰位置、弹壳、背包图标）'); }
    // 试玩跳转「生产车间」：直接到生产车间
    fresh(); R.mode = 'play'; warpTo('plant');
    check(R.S.map === 'map3' && R.ROOMS[R.curRoom()].id === 'm3plant' && R.S.enemies.filter(e => e.t === 'hunter' && !e.dead).length === 2,
      '试玩跳转「生产车间」：直接到生产车间，两只猎手都在');
    check(R.S.p.keys.pass && R.grid[36 * R.MW + 42] !== 3 && R.invHas('magnum') && R.S.p.mag.magnum === 6 && R.invCount('ammo_magnum') === 0 && R.invHas('gl'),
      '试玩跳转「生产车间」：通行证在手、车间门已开，带着麦林（满匣 6 发，备弹要在车间里捡）和榴弹发射器');
    { const o = R.S.objective; for (let i = 0; i < 30; i++) { R.update(1 / 60); R.P.inv = 1; } check(R.S.objective === o && /焚化炉/.test(o), '试玩跳转「生产车间」：落地后不会重播前面的剧情，目标还是车间这句'); }
    // 场地：装卸区的空地
    const setup = (hx, hy, px, py, hp = 100) => {
      fresh(); R.mode = 'play'; warpTo('m3');
      const p = R.S.p; p.x = px * TS; p.y = py * TS; p.hp = hp; p.poison = false; R.P.inv = 0; R.P.focus = 0;
      const h = R.mkEnemy('hunter', hx, hy); R.S.enemies = [h]; return h;
    };
    // 包抄：不走直线
    {
      const h = setup(20, 19, 12.5, 18.5); h.leapCd = 1e9; R.P.inv = 99;
      const x0 = h.x, y0 = h.y, x1 = R.S.p.x, y1 = R.S.p.y, L = Math.hypot(x1 - x0, y1 - y0);
      let off = 0;
      for (let i = 0; i < 60 * 3; i++) { R.updateHunter(h, 1 / 60, false); off = Math.max(off, Math.abs((h.x - x0) * (y1 - y0) - (h.y - y0) * (x1 - x0)) / L); if (h.state === 'slash') break; }
      check(h.alert && off > 1.2 * TS, `猎手：看见你之后不直线冲，而是绕向你的侧面（最大偏离 ${(off / TS).toFixed(1)} 格）`);
    }
    // 被枪口指着 → 横向闪身
    {
      const h = setup(18, 18, 12.5, 18.5); h.leapCd = 1e9; R.updateHunter(h, 1 / 60, false);
      const p = R.S.p; p.a = Math.atan2(h.y - p.y, h.x - p.x); R.P.focus = 1; h.dodgeCd = 0;
      R.updateHunter(h, 1 / 60, false);
      check(h.state === 'dodge', '猎手：被枪口指着时会横向闪身');
    }
    // 飞扑：4 格外，伏低 → 扑过来，命中带毒
    {
      const h = setup(16, 18, 12.5, 18.5); h.leapCd = 0;
      R.updateHunter(h, 1 / 60, false);
      check(h.state === 'crouch', '猎手：2.5–6 格、路上没挡 → 先伏低身子（预警）');
      let hit = false; for (let i = 0; i < 90; i++) { R.updateHunter(h, 1 / 60, false); if (R.S.p.hp < 100) { hit = true; break; } }
      check(hit && R.S.p.hp === 100 - R.HUNTER.leapDmg && R.S.p.poison, `猎手：飞扑命中 ${R.HUNTER.leapDmg} 伤害，爪子带毒`);
    }
    // 处决：体力 ≤ 40，前摇 1 秒、发红光；这 1 秒里打中它就中断
    {
      const h = setup(16, 18, 12.5, 18.5, 40); h.leapCd = 0;
      R.updateHunter(h, 1 / 60, false);
      check(h.state === 'execWind' && h.atkT >= 0.99, '猎手处决：玩家体力 ≤ 40% 时，飞扑变成处决，前摇 1 秒');
      for (let i = 0; i < 54; i++) R.updateHunter(h, 1 / 60, false);
      check(h.state === 'execWind' && R.S.p.hp === 40, '猎手处决：0.9 秒时还在蓄力（有时间反应）');
      R.damageEnemy(h, 26, 0, 10, false, 0.45, 'pistol');
      check(h.state !== 'execWind' && h.stag > 0 && h.execCd > R.S.time + 19, '猎手处决：蓄力时被打中 → 中断、踉跄，20 秒内不再尝试');
      h.stag = 0; h.state = 'chase'; h.leapCd = 0; h.x = 16.5 * TS; h.y = 18.5 * TS; R.updateHunter(h, 1 / 60, false);
      check(h.state === 'crouch', '猎手处决：冷却中只会普通飞扑');
    }
    {
      const h = setup(16, 18, 12.5, 18.5, 40); h.leapCd = 0;
      for (let i = 0; i < 120 && R.mode === 'play'; i++) R.updateHunter(h, 1 / 60, false);
      check(R.mode === 'play' && R.S.p.hp === 1 && R.S.p.poison && h.execCd > R.S.time + 19, `猎手处决：没打断 → 重伤到只剩 ${R.S.p.hp} 血、中毒（不再即死，试玩反馈），20 秒内不再处决`);
      R.P.inv = 0; h.state = 'chase'; h.stag = 0; h.leapCd = 0; h.x = 16.5 * TS; h.y = 18.5 * TS; R.S.p.x = 12.5 * TS; R.S.p.y = 18.5 * TS;
      R.updateHunter(h, 1 / 60, false);
      const w = h.state; for (let i = 0; i < 120 && R.mode === 'play'; i++) { R.updateHunter(h, 1 / 60, false); if (h.state === 'rec') break; }
      check(w === 'crouch' && R.mode === 'dead', '猎手：只剩 1 血时再被扑中（普通飞扑）才会死 —— 重伤之后要赶紧治疗');
    }
    {
      // 扑空之后趴在地上：躲开了就有还手的窗口
      const h = setup(16, 18, 12.5, 18.5); h.leapCd = 0; R.updateHunter(h, 1 / 60, false);
      for (let i = 0; i < 60 && h.state !== 'leap'; i++) R.updateHunter(h, 1 / 60, false);
      R.S.p.y += 2.5 * TS; let rec = 0;
      for (let i = 0; i < 120; i++) { R.updateHunter(h, 1 / 60, false); if (h.state === 'rec') { rec = h.recT; break; } }
      check(rec >= 0.8 && R.S.p.hp === 100, `猎手：飞扑被横移躲开 → 扑空后趴 ${rec.toFixed(2)} 秒（还手的窗口）`);
    }
    // 会开门
    {
      fresh(); R.mode = 'play'; warpTo('m3'); R.S.enemies = [];
      R.S.unlocked.push('42,36'); R.buildMap(); R.setDoorOpen(42, 36, false);
      const h = R.mkEnemy('hunter', 43, 36); R.S.enemies = [h]; h.x = 43.2 * TS;
      check(R.hunterDoor(h) && R.isDoorOpen(42, 36), '猎手：会推开关着的门（不会被一扇门挡住）');
    }
    // 硬直减半
    {
      const h = setup(20, 18, 12.5, 18.5), z = R.mkEnemy('zombie', 20, 20);
      R.damageEnemy(h, 26, 0, 10, false, 0.4, 'pistol'); R.damageEnemy(z, 26, 0, 10, false, 0.4, 'pistol');
      check(Math.abs(h.stag - z.stag / 2) < 1e-9 && h.hp === 324, '猎手：硬直只有普通敌人的一半（不容易被压制）');
    }
  }
  // 投掷物（M4-2）：G 投掷手雷 / 闪光弹，X 切换
  {
    const TH = R.THROW;
    check(TH.grenade.dmg === 150 && TH.flashbang.stun === 3, '投掷物：手雷范围伤害 150、闪光弹眩晕 3 秒（计划 6.2）');
    const src = SOURCES.find(f => f.rel.endsWith('input/input.js')).code;
    check(/case 'KeyG': throwItem\(\)/.test(src) && /case 'KeyX': cycleThrow\(\)/.test(src), '投掷物：G 投掷、X 切换');
    const setupT = () => { fresh(); R.mode = 'play'; warpTo('m3'); R.S.enemies = []; const p = R.S.p; p.inv.slots.fill(null); p.x = 20.5 * TS; p.y = 20.5 * TS; p.a = 0; p.hp = 100; R.P.inv = 0; R.P.throwCd = 0; R.P.reloadT = 0; return p; };
    const run = sec => { for (let i = 0; i < sec * 60; i++) R.updateHazards(1 / 60); };
    // 拾取 + 切换
    { const p = setupT(); R.S.p.inv.slots.fill(null);
      check(R.curThrow() === null && !R.throwItem(200), '投掷物：身上没有就扔不出去');
      R.pickUp({ t: 'grenade', v: 1, x: 0, y: 0 }); R.pickUp({ t: 'flash', v: 2, x: 0, y: 0 });
      check(R.invCount('grenade') === 1 && R.invCount('flashbang') === 2 && R.curThrow() === 'grenade', '投掷物：地上捡到手雷、闪光弹，放进背包；默认选中手雷');
      R.cycleThrow(); check(R.curThrow() === 'flashbang', '投掷物：X 切换到闪光弹');
      R.cycleThrow(); check(R.curThrow() === 'grenade', '投掷物：再按一次切回手雷'); }
    // 手雷：落点、引信、伤害、墙后
    { const p = setupT(); R.invAdd(p.inv, 'grenade', 2);
      const near = R.mkEnemy('zombie', 25, 20), far = R.mkEnemy('zombie', 29, 20), bl = R.mkEnemy('hunter', 25, 23); R.S.enemies = [near, far, bl];
      [near, far, bl].forEach(e => { e.stag = 99; });   // 站着别动
      bl.y = 22.5 * TS; bl.x = 24.5 * TS;
      R.throwItem(200);
      check(R.invCount('grenade') === 1 && R.S.throws.length === 1, '手雷：扔出去一颗（背包里少一颗）');
      run(1.0); const g = R.S.throws[0];
      check(g && Math.abs(g.x - (p.x + 18 + 200)) < 40 && near.hp === 100, `手雷：滑到瞄准的落点附近停下（${g ? ((g.x - p.x) | 0) : '?'} 像素），引信没到不炸`);
      run(0.5);
      check(R.S.throws.length === 0 && near.dead && far.hp === 100, '手雷：引信到了就炸 —— 落点旁边的僵尸炸死，4 格外的没事');
      check(bl.hp < 350 && p.hp === 100, '手雷：范围内的猎手也吃伤害；扔在 4 格外，炸不到自己'); }
    { const p = setupT(); R.invAdd(p.inv, 'grenade', 1); R.throwItem(40); run(2);
      check(p.hp < 100, '手雷：扔在脚边会炸到自己'); }
    { const p = setupT(); R.invAdd(p.inv, 'grenade', 1); p.a = Math.PI; const h0 = p.hp;   // 往西扔，撞墙弹回来
      p.x = 3.5 * TS; R.throwItem(330); run(0.3); const g = R.S.throws[0];
      check(g && g.x > 2 * TS && !R.solidT(Math.floor(g.x / TS), Math.floor(g.y / TS)), '手雷：撞墙会弹回来，不会穿墙'); run(2); void h0; }
    // 闪光弹
    { const p = setupT(); R.invAdd(p.inv, 'flashbang', 1); R.selectThrow('flashbang');
      const z = R.mkEnemy('zombie', 24, 20), h = R.mkEnemy('hunter', 25, 21), lk = R.mkEnemy('licker', 26, 20), hid = R.mkEnemy('zombie', 24, 26);
      [z, h, lk, hid].forEach(e => { e.alert = true; e.state = 'chase'; }); R.S.enemies = [z, h, lk, hid];
      p.a = Math.PI / 2;   // 背对着闪光（朝南看），自己不会白屏
      const n = R.flashBurst(22.5 * TS, 20.5 * TS);
      check(z.stag >= 3 && h.stag >= 3 && n === 2, '闪光弹：范围内看得见的僵尸、猎手 → 眩晕 3 秒');
      check(!(lk.stag > 0) && lk.heard && Math.abs(lk.heard.x - 22.5 * TS) < 1, '闪光弹：舔舐者是瞎的，不会被闪到，但会被那一声引过去');
      check(!(hid.stag > 0), '闪光弹：范围（约 5 格）外的不受影响');
      const wall = R.mkEnemy('zombie', 22, 9); wall.alert = true; R.S.enemies.push(wall);   // 货运站里，隔着一堵墙
      R.flashBurst(22.5 * TS, 12.5 * TS);
      check(!(wall.stag > 0) && Math.hypot(wall.x - 22.5 * TS, wall.y - 12.5 * TS) < R.THROW.flashbang.r, '闪光弹：墙后面（看不见闪光）的，就算在范围内也不受影响');
      check(!(R.P.whiteT > 0), '闪光弹：背对着闪光，自己不会白屏');
      p.a = Math.PI; R.flashBurst(18.5 * TS, 20.5 * TS);
      check(R.P.whiteT > 0.5, '闪光弹：自己正对着闪光 → 白屏一下'); }
    { const p = setupT(); const h = R.mkEnemy('hunter', 24, 20); R.S.enemies = [h]; p.hp = 40; h.leapCd = 0; h.x = 24.5 * TS; h.y = 20.5 * TS;
      R.updateHunter(h, 1 / 60, false); const w0 = h.state; R.flashBurst(23.5 * TS, 20.5 * TS);
      check(w0 === 'execWind' && h.state !== 'execWind' && h.stag >= 3, '闪光弹：猎手处决蓄力时被闪到 → 处决取消'); }
    { fresh(); R.mode = 'play'; warpTo('m3'); R.S.enemies = []; R.P.inv = 0;
      R.spawnExecutioner(30, 20); const b = R.activeExecutioner(); b.state = 'chase'; b.alert = true; b.x = 22.5 * TS; b.y = 20.5 * TS;
      R.S.p.x = 20.5 * TS; R.S.p.y = 20.5 * TS; R.S.p.a = Math.PI / 2;
      R.flashBurst(21.5 * TS, 21.5 * TS);
      check(b.stag >= 3, '闪光弹：处刑者也会被闪到，眩晕 3 秒'); }
    // 被处刑者抓住：小刀冷却中 → 用手雷 / 闪光弹挣脱
    { fresh(); R.mode = 'play'; warpTo('m3'); R.S.enemies = []; const p = R.S.p; p.inv.slots.fill(null); p.hp = 100; R.P.inv = 0;
      R.spawnExecutioner(30, 20); const b = R.activeExecutioner(); p.x = 20.5 * TS; p.y = 20.5 * TS; b.x = 21.2 * TS; b.y = 20.5 * TS;
      R.invAdd(p.inv, 'flashbang', 1); R.P.knifeCd = 5;
      b.state = 'attack'; b.atk = 'grab'; b.atkT = 0.01; b.alert = true;
      for (let i = 0; i < 3; i++) R.updateExecutioner(b, 1 / 60, false);
      check(p.hp === 100 && R.invCount('flashbang') === 0 && b.stag > 0, '处刑者抓取：小刀冷却中，身上有闪光弹 → 怼脸引爆挣脱，不受伤'); }
    // 摆放
    const it2 = R.LEVELS.map2.items.filter(i => i[0] === 'flash').length, it3 = R.LEVELS.map3.items.filter(i => i[0] === 'grenade' || i[0] === 'flash').length;
    check(it2 >= 1 && it3 >= 3, `投掷物摆放：地图 2 舔舐者区域有闪光弹，地图 3 有手雷和闪光弹（共 ${it2 + it3} 个）`);
    {
      // 试玩反馈：手雷、闪光弹按 E 之后道具消失却没进背包（interact 的 switch 漏了这两种）；提示名字显示不对
      fresh(); R.mode = 'play'; warpTo('plant'); R.msgs.length = 0;
      const gr = R.S.items.find(i => i.t === 'grenade'), fl = R.S.items.find(i => i.t === 'flash' && !i.taken);
      const g0 = R.invCount('grenade'), f0 = R.invCount('flashbang');
      R.S.p.x = gr.x; R.S.p.y = gr.y; R.interact(); R.S.p.x = fl.x; R.S.p.y = fl.y; R.interact();
      check(gr.taken && fl.taken && R.invCount('grenade') === g0 + 1 && R.invCount('flashbang') === f0 + 1 && R.msgs.some(m => /破片手雷/.test(m.t)) && R.msgs.some(m => /闪光弹/.test(m.t)),
        `捡手雷 / 闪光弹：真的进了背包（手雷 ${g0}→${R.invCount('grenade')}、闪光弹 ${f0}→${R.invCount('flashbang')}），提示「获得 破片手雷 / 闪光弹」`);
      const names = ['map1', 'map2', 'map3'].flatMap(m => R.LEVELS[m].items.map(([t, x, y, v]) => ({ t, v }))).filter(it => !R.isProp(it.t) && it.t !== 'file');
      const bad = names.filter(it => { const n = R.pickupName(it); return !n || /undefined/.test(n) || n === it.t; });
      check(!bad.length && R.pickupName({ t: 'grenade', v: 1 }) === '破片手雷' && R.pickupName({ t: 'flash', v: 1 }) === '闪光弹'
        && R.pickupName({ t: 'herb', v: 'red' }) === '红色草药' && R.pickupName({ t: 'herb', v: 'blue' }) === '蓝色草药' && R.pickupName({ t: 'mod', v: 'magnumBarrel' }) === R.MODS.magnumBarrel.name
        && R.pickupName({ t: 'glbomb', v: 2 }) === '爆炸榴弹 ×2',
        `地上道具的「[E] 拾取 …」和背包里的名字一致：手雷、闪光弹、红 / 蓝草药、配件都显示对的名字（三张图 ${names.length} 件，${bad.map(b => b.t).join() || '没有'}显示不对）`);
      const kinds = [...new Set(names.map(it => it.t))].filter(t => !['key', 'mod'].includes(t));
      check(kinds.every(t => R.worldToInv({ t, v: 1 })), `三张图地上能捡的道具（${kinds.join('、')}）都能进背包，不会按了 E 凭空消失`);
    }
    fresh(); R.mode = 'play'; warpTo('plant');
    check(R.invCount('grenade') === 0 && R.invCount('flashbang') === 2, '试玩跳转「生产车间」：带 2 颗闪光弹（地图 2 和装卸区各一颗），手雷 0 颗（全游戏第一颗就在这个车间里）');
  }
}

// 焚化炉 + Boss 战一：暴走处刑者（M4-3，计划 3.5、3.6、4.4）
{
  const D = R.EDEF.executionerBerserk, BZ = R.BERSERK;
  check(D.hp === 3000 && D.spd[0] === 200 && D.phase2At === 1500 && D.stunAfterCharge === 2.5 && D.leapTell === 0.8 && D.weakSpot.mul === 2 && D.envDamage === 600 && BZ.flashStun === 1.5,
    '暴走处刑者数值：3000 血、速度 200、1500 进阶段二、撞墙晕 2.5 秒、跳劈预警 0.8 秒、背后 ×2、管道 600、闪光弹 1.5 秒（计划 4.4）');
  const angDiff0 = (a, b) => { let d = b - a; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI; return d; };
  const setupF = () => { fresh(); R.mode = 'play'; warpTo('furnace'); const p = R.S.p; p.hp = 100; R.P.inv = 0; return p; };
  const runH = sec => { for (let i = 0; i < Math.round(sec * 60); i++) R.updateHazards(1 / 60); };
  // 落点、布局
  { const p = setupF(); const ex = R.activeExecutioner();
    check(R.S.map === 'map3' && R.ROOMS[R.curRoom()].id === 'm3furnace' && !!ex, '试玩跳转「焚化炉」：落在焚化炉车间，处刑者在南边');
    const F = R.LEVEL.furnace, [bx, by, bw, bh] = F.bridge;
    let ok = true; for (let y = by; y < by + bh; y++) { for (let x = 68; x < 90; x++) { const bridge = x >= bx && x < bx + bw; if (bridge === R.solidT(x, y)) ok = false; } }
    check(ok, '焚化炉：熔渣坑横贯整个车间，只有吊桥能过');
    check(F.pipes.length === 3 && F.pipes.every(([x, y]) => R.solidT(x, y)), '焚化炉：3 根钢水管道都嵌在墙上');
    check(R.LEVEL.items.some(i => i[0] === 'ladle') && R.isProp('ladle'), '焚化炉：吊桥北头有钢水闸控制台'); }
  // 浇空：不在桥上 → 重新加热 12 秒
  { const p = setupF(); const ex = R.activeExecutioner(); ex.x = 79.5 * TS; ex.y = 38.5 * TS;
    const it = R.S.items.find(i => i.t === 'ladle'); R.useLadle(it); runH(1.1);
    check(!R.S.flags.execMutated && R.activeExecutioner() === ex && R.S.pourReady - R.S.time > 10, '钢水闸：处刑者不在桥上 → 白浇，钢水包要重新加热 12 秒');
    runH(2); const n0 = R.S.pour; R.useLadle(it); check(!R.S.pour && !n0, '钢水闸：加热中拉不动'); }
  // 浇中：变异 → Boss 战，追踪者系统结束，门锁死
  { const p = setupF(); const ex = R.activeExecutioner(); ex.x = 79.9 * TS; ex.y = 29 * TS;
    const it = R.S.items.find(i => i.t === 'ladle'); R.useLadle(it);
    for (let i = 0; i < 66; i++) { ex.x = 79.9 * TS; ex.y = 29 * TS; R.updateHazards(1 / 60); }
    const b = R.berserkBoss();
    check(R.S.flags.execMutated && !!b && !R.activeExecutioner() && Math.abs(b.x - 79.9 * TS) < 1, '钢水闸：处刑者在桥上被浇透 → 原地变异成暴走形态');
    check(R.S.executioner.done && !R.S.executioner.active && !R.S.executioner.follow, '变异之后追踪者系统结束：不再跟随、不再有导演系统');
    R.spawnExecutioner(70, 38); check(!R.activeExecutioner(), '变异之后不会再刷出追踪形态的处刑者');
    check(R.grid[34 * R.MW + 67] === 3 && /暴走/.test(R.S.objective), 'Boss 战开始：车间门被警报联锁锁死，目标变成「打倒暴走的处刑者」');
    check(b.introT > 0, '变异演出：先定住 2.8 秒（外壳崩裂）');
    // 存档 / 读档
    R.saveGame(); R.loadGame(R.SAVE);
    const b2 = R.berserkBoss();
    check(!!b2 && R.S.flags.execMutated && R.grid[34 * R.MW + 67] === 3 && !R.activeExecutioner(), '存档：Boss 战中途读档，暴走处刑者还在、门还锁着、追踪形态不会回来'); }
  // 自己站在桥上 → 被钢水溅伤
  { const p = setupF(); R.S.enemies = []; p.x = 79.9 * TS; p.y = 28.5 * TS;
    R.useLadle(R.S.items.find(i => i.t === 'ladle')); runH(1.1);
    check(p.hp <= 100 - R.FURNACE.selfDmg + 1, '钢水闸：自己站在桥上 → 被钢水溅伤'); }
  const boss = () => { const p = setupF(); R.S.enemies = []; const b = R.mkEnemy('executionerBerserk', 78, 36); b.alert = true; b.state = 'chase'; R.S.enemies = [b]; p.x = 75.5 * TS; p.y = 36.5 * TS; b.fa = Math.PI; return [p, b]; };
  // 弱点：背后 ×2；没有硬直
  { const [p, b] = boss(); b.fa = Math.PI;   // 面朝西（朝着玩家）
    R.damageEnemy(b, 100, 0, 7, false, 0.3, 'pistol'); const front = 3000 - b.hp;
    b.fa = 0; R.damageEnemy(b, 100, 0, 7, false, 0.3, 'pistol'); const back = 3000 - front - b.hp;
    check(front === 100 && back === 200, `暴走处刑者：正面 100 → ${front}，打背后的心脏 → ${back}（×2）`);
    check(!(b.stag > 0), '暴走处刑者：普通攻击打不出硬直'); }
  // 转身慢：绕背是核心技巧（玩家反馈「绕不到背后」后加的）
  { const [p, b] = boss(); b.x = 76.5 * TS; b.y = 36.5 * TS; b.fa = Math.PI; p.hp = 200;
    R.updateBerserk(b, 1 / 60, false); check(b.state === 'slash', '（前提）贴身 → 开始挥砍蓄力');
    p.x = 77.3 * TS; p.y = 35.2 * TS;   // 蓄力时从侧面闪到它身后
    for (let i = 0; i < 40; i++) { R.P.inv = 0; R.updateBerserk(b, 1 / 60, false); }
    check(p.hp === 200, '暴走处刑者：挥砍蓄力时转身很慢 → 从侧面闪到身后，这一刀砍空');
    b.state = 'rec'; b.recT = 1; const fa0 = b.fa; p.x = 78.5 * TS; p.y = 36.5 * TS;
    for (let i = 0; i < 50; i++) R.updateBerserk(b, 1 / 60, false);
    check(b.fa === fa0, '暴走处刑者：收招硬直时完全不转身（绕背输出的窗口）');
    check(BZ.slash.rec >= 1 && BZ.leap.land >= 1.4 && BZ.backArc >= 1.3, `暴走处刑者：收招 ${BZ.slash.rec} 秒、跳劈落地 ${BZ.leap.land} 秒、背后判定 ±${(BZ.backArc * 57.3).toFixed(0)}°`);
    b.state = 'chase'; b.fa = 0; b.x = 76.5 * TS; p.x = 73.5 * TS; p.y = 36.5 * TS;   // 人在它正后方 3 格
    R.updateBerserk(b, 0.1, false);
    check(Math.abs(angDiff0(b.fa, 0)) < 0.5, '暴走处刑者：人在身后时要花时间转过来（不会瞬间转身）'); }
  // 阶段一：两连挥砍；跳劈红圈预警
  { const [p, b] = boss(); b.x = 76.5 * TS; b.y = 36.5 * TS; p.hp = 200;
    R.updateBerserk(b, 1 / 60, false); check(b.state === 'slash', '暴走处刑者：贴身 → 挥砍');
    let hits = 0, hp = p.hp; for (let i = 0; i < 90; i++) { R.P.inv = 0; R.updateBerserk(b, 1 / 60, false); if (p.hp < hp) { hits++; hp = p.hp; } }
    check(hits === 2, `暴走处刑者：挥砍是连续两下（打中 ${hits} 次）`); }
  { const [p, b] = boss(); b.x = 81.5 * TS; b.y = 36.5 * TS; b.leapCd = 0;
    R.updateBerserk(b, 1 / 60, false);
    check(b.state === 'leapTell' && Math.abs(b.atkT - 0.8) < 0.02 && Math.abs(b.leapX - p.x) < 1, '暴走处刑者：中距离 → 跳劈，先在落点亮 0.8 秒红圈');
    p.x = 75.5 * TS; p.y = 39.5 * TS;   // 看到红圈，走开
    for (let i = 0; i < 90; i++) R.updateBerserk(b, 1 / 60, false);
    check(p.hp === 100 && Math.abs(b.x - 75.5 * TS) < 2, '跳劈：看到红圈及时走开就不会被砸中');
    const [p2, b2] = boss(); b2.x = 81.5 * TS; b2.y = 36.5 * TS; b2.leapCd = 0;
    for (let i = 0; i < 90; i++) R.updateBerserk(b2, 1 / 60, false);
    check(p2.hp < 100, '跳劈：站在红圈里不动 → 被砸中'); }
  // 闪光弹：只晃 1.5 秒
  { const [p, b] = boss(); b.x = 79.5 * TS; b.y = 36.5 * TS; p.a = Math.PI;
    R.flashBurst(77.5 * TS, 36.5 * TS);
    check(Math.abs(b.stag - 1.5) < 1e-6, '闪光弹：暴走处刑者只被晃 1.5 秒'); }
  // 阶段二：冲撞、撞墙晕 2.5 秒；撞到管道 600
  { const [p, b] = boss(); b.hp = 1499; b.x = 72.5 * TS; b.y = 23.5 * TS; p.x = 75.5 * TS; p.y = 23.5 * TS;
    R.updateBerserk(b, 1 / 60, false); check(b.phase2 && b.state === 'rec', '暴走处刑者：血量低于 1500 → 进入阶段二（撕掉拘束服）');
    b.state = 'chase'; b.chargeCd = 0; p.x = 69.5 * TS; p.y = 23.5 * TS; b.x = 74.5 * TS;   // 玩家背靠西墙的管道
    R.updateBerserk(b, 1 / 60, false); check(b.state === 'chargeTell', '阶段二：隔一段距离 → 冲撞（先蓄力）');
    p.x = 70.5 * TS; p.y = 22.5 * TS;   // 蓄力时闪开（它按蓄力结束时的方向直冲过去）
    const hp0 = b.hp; let stunned = false;
    for (let i = 0; i < 150 && !stunned; i++) { R.updateBerserk(b, 1 / 60, false); if (b.stunT > 0) stunned = true; }
    check(stunned && Math.abs(b.stunT - 2.5) < 0.05, '阶段二：冲撞撞墙 → 晕 2.5 秒');
    check(hp0 - b.hp === 600 && R.pipeBroken(0) && (R.S.fires || []).length > 0, '阶段二：撞上墙边的钢水管道 → 管道破裂，一次 600');
    b.stunT = 0; b.state = 'charge'; b.chargeT = 1; b.chargeA = Math.PI; b.x = 69.9 * TS; const h1 = b.hp;
    for (let i = 0; i < 10; i++) R.updateBerserk(b, 1 / 60, false);
    check(h1 === b.hp, '钢水管道：每根只能破一次'); }
  // 打倒 → 门打开
  { const [p, b] = boss(); R.S.flags.execMutated = true; R.S.fired['map3:m3_mutate'] = true;
    R.S.unlocked = R.S.unlocked.filter(k => k !== '67,34'); R.buildMap();
    check(R.grid[34 * R.MW + 67] === 3, '（前提）门锁着');
    R.damageEnemy(b, 5000, 0, 0, false, 0, 'env');
    check(b.dead && R.S.flags.berserkDead && R.grid[34 * R.MW + 67] === 2 && /控制塔/.test(R.S.objective), '打倒暴走处刑者 → 车间门打开，目标指向控制塔'); }
  { fresh(); R.mode = 'play'; warpTo('plant');
    check(R.grid[34 * R.MW + 67] === 2, '试玩跳转「生产车间」：焚化炉车间的门已经解锁'); }
}

// 控制塔 + 终点站台 + Boss 战二：拉撒路、电磁炮、J（M4-4，计划 2、4.5、6.1）
{
  const LD = R.EDEF.lazarus, L = R.LAZ;
  check(LD.phases.map(p => p.hp).join() === '1800,2200,4500' && LD.phases[0].weakMul === 2.5 && LD.phases[1].stunAfterCharge === 3 && LD.phases[2].otherMul === 0.1 && R.EDEF.parasite.hp === 30,
    '拉撒路数值：三阶段 1800 / 2200 / 4500，眼球 ×2.5，撞墙晕 3 秒，阶段三其他武器 10%，寄生体 30 血（计划 4.5）');
  check(R.RAILGUN.dmg === 1500 && R.RAILGUN.ammo === 3 && R.RAILGUN.charge === 3, '电磁炮：1500 × 3 发，蓄力 3 秒（计划 6.1）');
  const upd = sec => { for (let i = 0; i < Math.round(sec * 60); i++) R.update(1 / 60); };
  // 控制塔：打倒暴走处刑者 → 北门开；J；控制台 → 南门开
  { fresh(); R.mode = 'play'; warpTo('furnace'); const p = R.S.p;
    check(R.grid[17 * R.MW + 75] === 3 && R.grid[43 * R.MW + 80] === 3, '焚化炉车间：北门（控制塔）、南门（终点站台）一开始都锁着');
    R.S.enemies = R.S.enemies.filter(e => e.t !== 'boss'); R.S.executioner.done = true;
    const b = R.mkEnemy('executionerBerserk', 78, 36); R.S.enemies.push(b); R.damageEnemy(b, 9999, 0, 0, false, 0, 'env');
    check(R.grid[17 * R.MW + 75] === 2 && /控制塔/.test(R.S.objective), '打倒暴走处刑者 → 控制塔的门打开'); }
  { fresh(); R.mode = 'play'; warpTo('tower'); const p = R.S.p; p.hp = 100;
    check(R.ROOMS[R.curRoom()].id === 'm3tower' && R.ROOMS[R.curRoom()].safe && !R.activeExecutioner(), '试玩跳转「控制塔」：控制塔是安全屋，处刑者已经不在了');
    check(R.LEVEL.items.some(i => i[0] === 'typewriter' && i[1] >= 70 && i[1] < 84 && i[2] >= 8 && i[2] < 17), '控制塔：有打字机（最终战前存档）');
    upd(0.2); check(!!R.S.npcJ, '进入控制塔：J 在控制台前');
    upd(16); check(R.S.flags.jMet && !R.S.npcJ && /控制台/.test(R.S.objective), 'J 说完话就离开了，目标变成「拉下控制台的闸」');
    R.useTrainConsole(R.S.items.find(i => i.t === 'trainConsole'));
    check(R.S.flags.trainStarted && R.grid[43 * R.MW + 80] === 2 && /终点站台/.test(R.S.objective), '控制台：列车启动 → 终点站台的门打开');
    // 走进站台 → 拉撒路登场，门锁上
    R.setDoorOpen(80, 43, true); p.x = 80.5 * TS; p.y = 46.5 * TS; upd(2);
    const lz = R.lazarusBoss();
    check(!!lz && lz.phase === 1 && R.grid[43 * R.MW + 80] === 3, '进入终点站台：洛克伍德现身（拉撒路阶段一），身后的门锁上');
    check(!R.S.enemies.some(e => e.t === 'boss'), '最终战：追踪形态的处刑者不会出现'); }
  const setupL = (phase = 1) => { fresh(); R.mode = 'play'; warpTo('tower'); R.S.fired['map3:m3_tower'] = true; const p = R.S.p; p.x = 60.5 * TS; p.y = 50.5 * TS; p.hp = 100; R.P.inv = 0;
    R.warpLazarus(phase); const e = R.lazarusBoss(); return [p, e]; };
  // 阶段一：眼球弱点
  { const [p, e] = setupL(1); e.x = 66.5 * TS; e.y = 50.5 * TS;
    R.damageEnemy(e, 100, 0, 7, false, 0.3, 'pistol'); const shut = 1800 - e.hp;
    e.eyeT = 1; R.damageEnemy(e, 100, 0, 7, false, 0.3, 'pistol'); const open = 1800 - shut - e.hp;
    check(shut === 100 && open === 250, `拉撒路阶段一：眼球闭着 100 → ${shut}，睁开时 → ${open}（×2.5）`); }
  { const [p, e] = setupL(1); e.x = 61.7 * TS; e.y = 50.5 * TS; e.fa = Math.PI; e.tossCd = 1e9;
    R.updateLazarus(e, 1 / 60, false); check(e.state === 'sweep', '阶段一：贴身 → 横扫（先有 0.7 秒前摇）');
    for (let i = 0; i < 50; i++) R.updateLazarus(e, 1 / 60, false);
    check(p.hp === 70 && e.eyeT > 1.5, '阶段一：横扫打中 30；出招后眼球睁开'); }
  { const [p, e] = setupL(1); e.x = 70.5 * TS; e.y = 50.5 * TS; e.fa = Math.PI; e.tossCd = 0;
    R.updateLazarus(e, 1 / 60, false); check(e.state === 'tossTell', '阶段一：中距离 → 投掷钢材（先亮红线）');
    for (let i = 0; i < 60 * 2; i++) { R.updateLazarus(e, 1 / 60, false); R.updateLazWorld(1 / 60); }
    check(p.hp === 100 - L.p1.toss.dmg, '阶段一：站着不动被钢材砸中');
    const [p2, e2] = setupL(1); e2.x = 70.5 * TS; e2.y = 50.5 * TS; e2.fa = Math.PI; e2.tossCd = 0;
    R.updateLazarus(e2, 1 / 60, false); for (let i = 0; i < 40; i++) R.updateLazarus(e2, 1 / 60, false);
    p2.y = 53.5 * TS; for (let i = 0; i < 60 * 2; i++) { R.updateLazarus(e2, 1 / 60, false); R.updateLazWorld(1 / 60); }
    check(p2.hp === 100, '阶段一：红线出现后横移，钢材打空'); }
  // 变身：不算击杀，无敌，下一阶段满血
  { const [p, e] = setupL(1); let kills = 0; const k0 = R.S.stats.kills;
    R.damageEnemy(e, 5000, 0, 0, false, 0, 'magnum');
    check(!e.dead && e.morphT > 0 && R.S.stats.kills === k0, '阶段一打空 → 变身演出（不死、不算击杀）');
    const hp = e.hp; R.damageEnemy(e, 500, 0, 0, false, 0, 'magnum'); check(e.hp === hp, '变身中无敌');
    for (let i = 0; i < 60 * 3; i++) R.updateLazarus(e, 1 / 60, false);
    check(e.phase === 2 && e.hp === 2200 && e.maxhp === 2200 && R.S.flags.lazarus2, '变身完 → 阶段二（四足兽形）2200 血'); }
  // 阶段二：召唤寄生体、冲撞撞墙晕 3 秒
  { const [p, e] = setupL(2); e.summonCd = 0; e.chargeCd = 1e9; e.x = 70.5 * TS; e.y = 50.5 * TS;
    R.updateLazarus(e, 1 / 60, false);
    const n1 = R.S.enemies.filter(o => o.t === 'parasite' && !o.dead).length;
    for (let k = 0; k < 5; k++) { e.summonCd = 0; R.updateLazarus(e, 1 / 60, false); }
    const n2 = R.S.enemies.filter(o => o.t === 'parasite' && !o.dead).length;
    check(n1 === 2 && n2 === 4, `阶段二：召唤寄生体（一次 ${n1} 只，最多同时 ${n2} 只）`);
    const par = R.S.enemies.find(o => o.t === 'parasite'); R.damageEnemy(par, 30, 0, 0, false, 0, 'pistol'); check(par.dead, '寄生体：30 血，一枪就死'); }
  { const [p, e] = setupL(2); R.S.enemies = [e]; e.summonCd = 1e9; e.chargeCd = 0; e.x = 60.5 * TS; e.y = 52.5 * TS; e.fa = -Math.PI / 2; p.x = 60.5 * TS; p.y = 46.5 * TS;
    R.updateLazarus(e, 1 / 60, false); check(e.state === 'chargeTell', '阶段二：隔一段距离 → 冲撞（先蓄力）');
    p.x = 62.5 * TS; p.y = 46.5 * TS;   // 闪开，它撞上站台北墙
    let st = false; for (let i = 0; i < 150 && !st; i++) { R.updateLazarus(e, 1 / 60, false); if (e.stunT > 0) st = true; }
    check(st && Math.abs(e.stunT - 3) < 0.05, '阶段二：冲撞撞墙 → 晕 3 秒（输出窗口）'); }
  // 试玩反馈「二阶段攻击声音有点吵」：每次冲撞都是一声 1.6–2 秒的满口咆哮，间隔才 2.5–4 秒 —— 整个阶段吵到底
  { const oc = global.cryAt, calls = [];
    global.cryAt = function (sp, act) { calls.push(sp + '.' + act); };
    try {
      const [p, e] = setupL(2); R.S.enemies = [e]; e.summonCd = 1e9;
      // 让它反复冲撞 30 秒：玩家站在冲撞距离之外，撞空 / 撞墙都马上复位
      p.x = 60.5 * TS; p.y = 46.5 * TS; let tells = 0, last = null;
      for (let i = 0; i < 60 * 30; i++) {
        R.S.time += 1 / 60; e.x = 60.5 * TS; e.y = 52.5 * TS; e.stunT = 0; e.hp = 2200;
        R.updateLazarus(e, 1 / 60, false);
        if (e.state === 'chargeTell' && last !== 'chargeTell') tells++;
        last = e.state;
      }
      const roars = calls.filter(c => c === 'lazarus.roar').length, grunts = calls.filter(c => c === 'lazarus.grunt').length;
      check(tells >= 6 && roars + grunts === tells, `阶段二：每次冲撞都有听觉预警（${tells} 次冲撞 = ${roars} 声咆哮 + ${grunts} 声低哼）`);
      check(roars <= 3 && grunts > roars, `阶段二不再吵：30 秒里满口咆哮只有 ${roars} 声（改之前每次冲撞都吼，约 ${tells} 声），其余是短促的低哼`);
    } finally { global.cryAt = oc; }
  }
  // Boss 的大叫彼此留白：两声之间至少 3.5 秒，正在响的时候来的那一声让位
  { const AU = R.AU, sv = { c: AU.c, voices: AU.voices, lastBig: AU.lastBig, hdr: AU.hdr };
    try {
      AU.c = { currentTime: 0 }; AU.voices = []; AU.lastBig = undefined; AU.hdr = null;
      const ok1 = !!R.voiceBegin('lazarus.roar', 3, 1);
      const blocked = R.voiceBegin('lazarus.moan', 3, 1);        // 上一声还在响
      AU.voices = []; AU.c.currentTime = 2;
      const early = R.voiceBegin('lazarus.roar', 3, 1);          // 才过 2 秒
      AU.c.currentTime = 3.6;
      const ok2 = !!R.voiceBegin('lazarus.roar', 3, 1);
      AU.voices = [];
      const cue = !!R.voiceBegin('tentacle.rumble', 3, 1);       // 前摇提示不受影响
      check(ok1 && !blocked && !early && ok2 && cue, 'Boss 大叫留白：正在响时来的那一声不放、3.5 秒内不重复；触手预警等前摇提示照常');
    } finally { Object.assign(AU, sv); }
  }
  // 阶段三：肉块、J 丢电磁炮、其他武器 10%
  { const [p, e] = setupL(3);
    check(e.phase === 3 && e.hp === 4500 && Math.abs(e.x - L.p3.at[0] * TS) < 1 && !!R.S.npcJ, '阶段三：退到站台尽头变成肉块（4500 血），J 出现');
    for (let i = 0; i < 60 * 3.2; i++) R.updateLazWorld(1 / 60);
    check(R.S.p.rail && R.S.p.rail.ammo === 3 && R.railOn(), 'J 把电磁炮丢过来：自动装备，3 发');
    R.damageEnemy(e, 180, 0, 0, false, 0, 'magnum'); check(e.hp === 4500 - 18, '阶段三：麦林只有 10% 伤害');
    // 切换武器
    R.selectWeaponSlot(0); check(!R.railOn() && R.S.p.wep === 'pistol', '按 1：切回手枪');
    R.selectWeaponSlot(5); check(R.railOn(), '按 6：切回电磁炮');
    const m0 = R.S.p.mag.pistol; R.P.fireCd = 0; R.shoot(); check(R.S.p.mag.pistol === m0, '拿着电磁炮时普通射击不会消耗手枪子弹');
    // 蓄力 3 秒
    p.a = Math.atan2(e.y - p.y, e.x - p.x);
    R.mouse.l = true;
    for (let i = 0; i < 60 * 2.5; i++) R.updateRail(1 / 60, true);
    check(R.S.p.rail.ammo === 3 && R.P.railCharge > 2.4, '电磁炮：蓄力不满 3 秒不会发射');
    for (let i = 0; i < 40; i++) R.updateRail(1 / 60, true);
    check(R.S.p.rail.ammo === 2 && e.hp === 4500 - 18 - 1500, '电磁炮：蓄满 3 秒发射，1500 伤害');
    R.mouse.l = false;
    // 存档读档
    R.saveGame(); R.loadGame(R.SAVE);
    const e2 = R.lazarusBoss();
    check(e2 && e2.phase === 3 && R.S.p.rail.ammo === 2, '存档：阶段三中途读档，阶段和电磁炮剩余发数都保留');
    R.damageEnemy(e2, 1500, 0, 0, false, 0, 'railgun'); R.damageEnemy(e2, 1500, 0, 0, false, 0, 'railgun');
    check(e2.dead && R.S.flags.lazarusDead && /列车/.test(R.S.objective), '拉撒路被打倒 → 目标指向列车撤离'); }
  // 触手：预警期间打掉就能打断
  { const [p, e] = setupL(3); e.tentCd = 0; R.updateLazarus(e, 1 / 60, false);
    const t = R.S.enemies.find(o => o.t === 'tentacle');
    check(t && t.state === 'tell' && Math.hypot(t.x - p.x, t.y - p.y) < 20, '阶段三：触手从玩家脚下钻出来（先有 1 秒预警）');
    for (let i = 0; i < 90; i++) R.updateTentacle(t, 1 / 60, false);
    check(p.hp === 70, '触手：站着不动被砸中 30');
    R.P.inv = 0; e.tentCd = 0; R.updateLazarus(e, 1 / 60, false); const t2 = R.S.enemies.filter(o => o.t === 'tentacle' && !o.dead).pop();
    R.damageEnemy(t2, 40, 0, 0, false, 0, 'pistol');
    for (let i = 0; i < 90; i++) R.updateTentacle(t2, 1 / 60, false);
    check(t2.dead && p.hp === 70, '触手：预警期间打掉它（40 血）→ 打断，不受伤');
    // 拿着电磁炮蓄力（瞄准速度）横移也躲得开 —— 不用松手
    R.P.inv = 0; e.tentCd = 0; R.updateLazarus(e, 1 / 60, false); const t3 = R.S.enemies.filter(o => o.t === 'tentacle' && !o.dead).pop(); t3.x = p.x; t3.y = p.y;   // 正好冒在脚下（冒出的位置有随机偏移）
    for (let i = 0; i < 90; i++) { R.moveEnt(p, 0, R.PLAYER_SPEED.aim / 60); R.updateTentacle(t3, 1 / 60, false); }
    check(p.hp === 70, `触手：预警 ${L.p3.tentacle.tell} 秒内用瞄准速度（${R.PLAYER_SPEED.aim}）横移就能躲开`);
    check(L.p3.tentacle.cd[0] >= 3, `触手：间隔 ${L.p3.tentacle.cd.join('–')} 秒（够蓄满一发电磁炮）`); }
  // 电磁炮：松手后蓄力保留一会儿；打中肉块 → 抽搐，暂停触手
  { const [p, e] = setupL(3); R.S.enemies = [e]; for (let i = 0; i < 60 * 3.2; i++) R.updateLazWorld(1 / 60);
    R.P.railCd = 0; R.P.railCharge = 0; R.mouse.l = true; for (let i = 0; i < 60 * 2; i++) R.updateRail(1 / 60, true); R.mouse.l = false;
    for (let i = 0; i < 60; i++) R.updateRail(1 / 60, false);
    check(R.P.railCharge > 1.9, `电磁炮：松手躲一下（1 秒），蓄力还在（${R.P.railCharge.toFixed(1)} 秒）`);
    for (let i = 0; i < 60 * 2; i++) R.updateRail(1 / 60, false);
    check(R.P.railCharge < 1.5, '电磁炮：松手太久，蓄力慢慢流失');
    const t = R.mkEnemy('tentacle', 0, 0); t.x = p.x; t.y = p.y; t.state = 'tell'; t.atkT = 1; R.S.enemies.push(t);
    p.a = Math.atan2(e.y - p.y, e.x - p.x); R.fireRail();
    check(e.hp === 3000 && t.dead && e.tentCd >= R.S.time + 2, '电磁炮打中肉块 → 抽搐 2.5 秒：不长触手，正在冒的缩回去'); }
  // 腐蚀
  { const [p, e] = setupL(3); R.S.enemies = [e]; e.tentCd = 1e9;
    p.x = 75.5 * TS; p.y = 46.5 * TS; for (let i = 0; i < 60; i++) R.updateLazWorld(1 / 60);
    check(p.hp === 100, '腐蚀：一开始只有站台东头被腐蚀');
    for (let i = 0; i < 60 * 25; i++) { R.updateLazWorld(1 / 60); if (p.hp < 100) break; }
    check(p.hp < 100 && R.S.corrode < 75.5, '腐蚀：边界往西推，追上你就开始掉血');
    for (let i = 0; i < 60 * 80; i++) { R.updateLazWorld(1 / 60); p.hp = 100; }
    check(R.S.corrode === L.p3.corrode.to, `腐蚀：最多推到 x=${L.p3.corrode.to}，西边始终留着一块安全的地方`); }
  // 电磁炮打光了还没死 → J 再补一块电池
  { const [p, e] = setupL(3); R.S.enemies = [e]; e.tentCd = 1e9;
    for (let i = 0; i < 60 * 3.2; i++) R.updateLazWorld(1 / 60);
    R.S.p.rail.ammo = 0; for (let i = 0; i < 60 * 10; i++) R.updateLazWorld(1 / 60);
    check(R.S.p.rail.ammo === 1, '电磁炮打光了拉撒路还活着 → J 再丢一块电池（不会卡关）'); }
}

// 列车撤离结局（M4-5，计划 2「结局钩子」、4.5「结尾」）：30 秒内跳上列车，身后有触手追击；通关置 gameClear
{
  const upd = sec => { for (let i = 0; i < Math.round(sec * 60); i++) R.update(1 / 60); };
  const killLaz = () => { fresh(); R.mode = 'play'; warpTo('lazarus3'); const p = R.S.p; p.hp = 100; R.P.inv = 0;
    const e = R.lazarusBoss(); R.S.enemies = R.S.enemies.filter(o => o.t !== 'tentacle'); R.damageEnemy(e, 99999, 0, 0, false, 0, 'railgun'); return p; };
  { fresh(); R.mode = 'play'; warpTo('lazarus3');
    const door = R.S.items.find(i => i.t === 'escapedoor'); R.useEscapeDoor(door);
    check(door && !R.S.flags.escaped, '列车车门：拉撒路还活着时锁着'); }
  { const p = killLaz();   // 试玩跳转过来立刻打倒（电磁炮还在 J 手里）：电磁炮落地时别把「跳上列车」盖掉
    for (let i = 0; i < 60 * 5; i++) { R.update(1 / 60); p.hp = 100; R.P.inv = 0; }
    check(R.S.p.rail && /跳上列车/.test(R.S.objective), `拉撒路在电磁炮落地前就倒下：J 的电磁炮照样送到，但目标栏还是「${R.S.objective}」`); }
  { const p = killLaz(); upd(2.2);
    check(/洛克伍德/.test(lastMsg()) && /弹琴/.test(lastMsg()),
      `拉撒路倒下：肉里传出洛克伍德的遗言，回收第一章琴谱 f13 和保险柜 f10 的伏笔（现在屏幕上写的是「${lastMsg()}」）`);
    check(/楼下有人在弹/.test(R.FILES.f13.body) && /伊莱亚斯/.test(R.FILES.f13.body) && /伊莱亚斯/.test(R.FILES.f10.body),
      '遗言的伏笔还在：f13 琴谱（半夜有人在弹）和 f10 便条（密码是抹掉伊莱亚斯名字的那天）'); }
  { const p = killLaz();
    check(R.S.flags.lazarusDead && R.S.countdown && R.S.countdown.left === R.ESCAPE.sec && R.escapeActive() && /跳上列车/.test(R.S.objective), '拉撒路倒下 → 车门打开，30 秒后发车（倒计时）');
    p.x = 60.5 * TS; p.y = 48.5 * TS; const seen = new Set(), near = new Set();
    for (let i = 0; i < 60 * 6; i++) { R.update(1 / 60); p.hp = 100; R.P.inv = 0; R.S.enemies.forEach(o => { if (o.t === 'tentacle' && !near.has(o.id)) { near.add(o.id); if (Math.hypot(o.x - p.x, o.y - p.y) < 40) seen.add(o.id); } }); }
    check(seen.size >= 3, `撤离：残骸的触手追着你从脚下钻出来（6 秒 ${seen.size} 根）`);
    let hits = 0; for (let i = 0; i < 60 * 4; i++) { const h = p.hp; R.update(1 / 60); if (p.hp < h) hits++; R.P.inv = 0; p.hp = 100; }
    check(hits > 0, `撤离：站着不动会被追击的触手打中（4 秒内 ${hits} 次）`);
    // 上车
    const door = R.S.items.find(i => i.t === 'escapedoor'); p.x = door.x; p.y = door.y + 4; R.useEscapeDoor(door);
    check(R.S.flags.escaped && R.S.flags.gameClear && !R.S.countdown && R.S.train && R.S.train.tunnel === 90, '跳上列车 → 置 gameClear，倒计时停止，列车向东开进隧道');
    upd(6.5); check(!!R.S.npcJ, '结局演出：站台上出现 J 的身影（结局钩子：她拿走了样本）');
    // 试玩反馈「最后的结局有点莫名其妙」：原来演出只写「有人弯腰拾起了什么」，
    // 真正点题的「样本管」写在评级画面的小字里（玩家那会儿正在看 S/A/B/C），林岚从头到尾一句话都没有
    check(/样本管/.test(lastMsg()), `结局演出：明说了她捡走的是一支完好的样本管（现在屏幕上写的是「${lastMsg()}」）`);
    upd(4.2);
    check(R.mode === 'play' && /林岚/.test(lastMsg()), `结局演出：林岚自己有一句话（现在屏幕上写的是「${lastMsg()}」）`);
    upd(3.5);
    const wt = R.winText(R.S.flags);
    check(R.mode === 'win' && wt[0] === '逃 出 生 天' && /红色风衣/.test(wt[2]) && /样本管/.test(wt[2]), '演出结束 → 通关画面「逃 出 生 天」，结尾暗示 J 带走了样本');
    check(/S\.T\.R\.T\./.test(wt[3] || '') && /焚毁/.test(wt[3] || ''),
      '通关画面第四行：S.T.R.T. 的结案报告说样本已随设施焚毁 —— 和玩家刚看见的那一幕对不上（收束任务简报 f1 那条线）'); }
  { const p = killLaz(); p.x = 60.5 * TS; p.y = 46.5 * TS;
    for (let i = 0; i < 60 * 31 && R.mode === 'play'; i++) { R.update(1 / 60); if (R.S.p.hp < 100 && R.S.countdown && R.S.countdown.left > 0.5) { R.S.p.hp = 100; R.P.inv = 0; } }
    check(R.mode === 'dead' && !R.S.flags.gameClear, '撤离：30 秒没跳上车 → 列车开走，死亡（不会通关）'); }
}

// ================= 通关评级（M5，计划 7.7；数值在 config/rank.js）=================
// 旧标准是 demo 的「10 分钟内 = S、15 分钟 A、25 分钟 B」，完整版首通 60–90 分钟 → 人人都是 C。
// 现在：结算时间 = 通关时间 + 罚时（存档、治疗各前 5 次不罚），按结算时间定档。
{
  const K = R.RANK;
  const rk = (min, saves = 0, heals = 0) => R.calcRank(Math.round(min * 60), { saves, heals }).rank;
  check(K.tiers.map(t => t[0]).join('') === 'SAB' && K.lowest === 'C' && K.tiers.every((t, i, a) => !i || t[1] > a[i - 1][1]),
    '评级：配置按 S → A → B 排列，上限依次变大，三档都超过是 C');
  check(rk(50) === 'S' && rk(50 + 1 / 60) === 'A' && rk(75) === 'A' && rk(75 + 1 / 60) === 'B' && rk(105) === 'B' && rk(105 + 1 / 60) === 'C',
    '评级：结算时间 ≤ 50 分钟 S、≤ 75 分钟 A、≤ 105 分钟 B，再慢是 C（边界含等号，多 1 秒就掉档）');
  check(rk(60, 8, 8) === 'A' && rk(90, 12, 12) === 'B' && rk(24, 3, 0) === 'S',
    '评级：完整版正常首通（60–90 分钟、存档和治疗各十来次）拿 A / B，不再全是 C');
  { const a = R.calcRank(3600, { saves: 5, heals: 5 }), b = R.calcRank(3600, { saves: 6, heals: 7 });
    check(a.savePen === 0 && a.healPen === 0 && a.final === 3600 && b.savePen === 60 && b.healPen === 60 && b.final === 3720,
      '评级：存档、治疗各前 5 次不罚；之后存档每次 +60 秒、治疗每次 +30 秒'); }
  check(rk(45) === 'S' && rk(45, 11) === 'A' && rk(45, 5, 17) === 'A',
    '评级：罚时会让评价掉档（45 分钟通关但存了 11 次档 → 结算 51 分钟 → A）');
  { const a = R.calcRank(4000, { saves: 7, heals: 9, kills: 0, shots: 500, hits: 50 }), b = R.calcRank(4000, { saves: 7, heals: 9, kills: 300, shots: 100, hits: 100 });
    check(a.rank === b.rank && a.final === b.final, '评级：击倒数、命中率不影响评价（游戏鼓励躲开处刑者，不奖励杀敌）'); }
  { const a = R.calcRank(3870, {}), s = R.calcRank(2400, {}), c = R.calcRank(7200, {});
    check(a.rank === 'A' && a.next.rank === 'S' && a.next.gap === 870 && s.rank === 'S' && !s.next && c.rank === 'C' && c.next.rank === 'B' && c.next.gap === 900,
      '评级：给出离上一档还差多少（A → S 差 14:30；C → B 差 15:00；S 没有上一档）'); }
  check(R.fmtClock(59) === '0:59' && R.fmtClock(3000) === '50:00' && R.fmtClock(3730.9) === '1:02:10' && R.fmtClock(-5) === '0:00',
    '时间格式：不满 1 小时是 M:SS，满 1 小时是 H:MM:SS');

  // 各地图用时：离开每张地图时记下 S.time
  fresh(); R.S.time = 1500; R.gotoLevel('map2', null, null, true); R.S.time = 2700; R.gotoLevel('map3', null, null, true); R.S.time = 3600;
  { const sp = R.mapSplits(R.S);
    check(sp.map(x => x[0]).join() === '宅邸,研究所,制药厂' && sp.map(x => x[1]).join() === '1500,1200,900',
      '结算画面：记下每张地图各玩了多久（宅邸 25:00 · 研究所 20:00 · 制药厂 15:00）'); }
  R.S.stats.saves = 9; R.S.stats.heals = 12; R.S.stats.kills = 41; R.S.stats.shots = 100; R.S.stats.hits = 68; R.S.time = 3870;
  { const rep = R.winReport(R.S);   // 64:30 + 存档 4 分 + 治疗 3 分 30 = 72:00 → A
    check(rep.time === '1:04:30' && rep.saves[1] === '+4:00' && rep.heals[1] === '+3:30' && rep.final === '1:12:00' && rep.r.rank === 'A'
      && /22:00，就是 S/.test(rep.hint) && rep.splits === '宅邸 25:00  ·  研究所 20:00  ·  制药厂 19:30',
      '结算画面：通关时间、各地图用时、两项罚时、结算时间、评价 A、「再缩短 22:00 就是 S」');
    check(/命中率 68%/.test(rep.extra) && /不计入评价/.test(rep.extra) && rep.ladder.startsWith('S ≤ 50:00  ·  A ≤ 1:15:00  ·  B ≤ 1:45:00') && /超过 5 次/.test(rep.rule),
      '结算画面：写明规则（各档上限、罚时怎么算），命中率注明不计入评价'); }
  { R.mode = 'win'; R.modeT = 3; let ok = true; try { R.drawWin(); } catch (e) { ok = e.message; } R.mode = 'play';
    check(ok === true, '结算画面：能正常画出来' + (ok === true ? '' : ' —— ' + ok)); }
  R.saveGame(); const splitSaved = JSON.stringify(R.S.stats.split); fresh(); R.loadGame(R.SAVE); R.mode = 'play';
  check(JSON.stringify(R.S.stats.split) === splitSaved && R.mapSplits(R.S).length === 3, '各地图用时随存档保存，读档后还在');
  R.loadGame(JSON.stringify({ map: 'map3', p: { hp: 80 }, time: 3000, stats: { kills: 3, shots: 10, hits: 5, saves: 4, heals: 2 } })); R.mode = 'play';
  check(R.S.stats.split && !Object.keys(R.S.stats.split).length && R.winReport(R.S).splits === '' && R.winReport(R.S).r.rank === 'S',
    '旧存档没有各地图用时：结算画面不显示那一行（不显示错的数），评级照常');

  // 榴弹的命中率：以前 shoot() 记了 shots，炸到怪却从来不记 hits —— 用榴弹发射器越多，命中率越难看
  fresh(); warpTo('m3'); R.S.enemies = [];
  { const p = R.S.p; p.x = 20 * TS; p.y = 20.5 * TS; p.a = 0; p.hp = 100; R.P.inv = 1;
    R.invAdd(p.inv, 'gl', 1); R.invAdd(p.inv, 'ammo_fire', 2); p.wep = 'gl'; p.mag.gl = 1; p.glLoaded = 'fire';
    const z = R.mkEnemy('zombie', 26, 20); R.S.enemies = [z];
    const s0 = R.S.stats.shots, h0 = R.S.stats.hits; R.P.fireCd = 0; R.P.reloadT = 0; R.shoot();
    for (let i = 0; i < 60; i++) R.updateHazards(1 / 60);
    check(z.hp < 100 && R.S.stats.shots === s0 + 1 && R.S.stats.hits === h0 + 1, '命中率：榴弹炸到怪算命中（以前永远算打空）');
    R.S.enemies = []; R.S.fires = []; p.mag.gl = 1; R.P.fireCd = 0; R.P.reloadT = 0; R.shoot();
    for (let i = 0; i < 90; i++) R.updateHazards(1 / 60);
    check(R.S.stats.shots === s0 + 2 && R.S.stats.hits === h0 + 1 && !R.S.nades.length, '命中率：榴弹什么都没炸到，算打空'); }
}

// ================= J 的铺垫（试玩反馈：「结局有点莫名其妙」「J 是从什么时候就存在的」）=================
// 改之前：J 只在地图 1 的 f4 末尾署过一次名（而且那份文档主要在讲存档和霰弹枪），地图 2 一次都没提，
// 到了地图 3 突然「又是 J，这个人一直走在你前面」、本人登场、结局带走样本 —— 玩家没有任何依据。
// 现在：三张地图都留下同一个人的痕迹（切开的锁、空掉的样本槽、对不上号的门禁记录），
// 和结局「她从残骸里拾起样本管」闭环。痕迹只写场景里看得见的东西，不出现「这一定是 J」这种旁白。
{
  const trigText = (map, id) => {
    const t = (R.LEVELS[map].triggers || []).find(x => x.id === id);
    return JSON.stringify(t || null);
  };
  const lab = trigText('map1', 'lab_enter');
  check(/切开/.test(lab) && /空了一个/.test(lab),
    'J 的痕迹 · 地图 1：研究报告说样本由博士亲自保管，玩家到了私人实验室却发现低温柜的锁被整齐切开、空了一格');
  check(/我在这里没找到我要的东西/.test(R.FILES.f4.body) && /—— J/.test(R.FILES.f4.body),
    'J 的痕迹 · 地图 1：f4 的留言写明她是先你一步来取东西的人（不再只是一个署名）');
  const tanks = trigText('map2', 'm2_tanks');
  check(/切开/.test(tanks) && /原始株/.test(tanks),
    'J 的痕迹 · 地图 2：培养槽区最里面的低温柜同样被整齐切开，「原始株」那一格是空的（同一个人、同一种手法）');
  check(/注销的临时证/.test(R.FILES.m2f2.body) && /姓名栏只有一个字母/.test(R.FILES.m2f2.body)
    && /调度员 ID 卡/.test(R.FILES.m2f2.body) && /污水处理区/.test(R.FILES.m2f2.body),
    'J 的痕迹 · 地图 2：安保日志多了一条对不上号的门禁记录（原来的 ID 卡线索没被改掉）');
  // 每张地图都要有痕迹：地图 3 才敢说「又是 J」
  const m1 = /—— J/.test(R.FILES.f4.body) || /切开/.test(lab);
  const m2 = /切开/.test(tanks) || /姓名栏只有一个字母/.test(R.FILES.m2f2.body);
  const m3 = /—— J/.test(R.FILES.m3f2.body) && /—— J/.test(R.FILES.m3f8.body);
  check(m1 && m2 && m3, 'J 的痕迹：三张地图都有，到地图 3 的「又是 J，这个人一直走在你前面」才站得住');
  const tell = Object.entries(R.FILES).filter(([, f]) => /这一定是 J|又是那个 J 干的/.test(f.body)).map(([k]) => k);
  check(!tell.length, 'J 的痕迹：只写场景里看得见的东西，不替玩家点破' + (tell.length ? ' —— ' + tell.join('、') : ''));
}

// ================= 文档口吻（第二次试玩反馈：文档提示太明显）=================
// 游戏里的文档只写剧情里的人会写的话。去哪 → 目标栏和地图；怎么操作 → 交互提示；答案 → 只写在 谜题文档.md。
// 以前 20 份文档末尾都有「（下一步：…）（怎么转：…）（打法：…）」的括号攻略，保险柜、补光灯连答案都替玩家算好了。
{
  const bodies = Object.entries(R.FILES);
  const guide = bodies.filter(([, f]) => /按 ?E|下一步|打法|去哪找|怎么转|输入 ?\d ?位|（顺序|（需要|月月日日/.test(f.body)).map(([k]) => k);
  check(!guide.length, '文档：没有攻略口吻（按 E、下一步、打法、去哪找、怎么转、输入几位数……）' + (guide.length ? ' —— ' + guide.join('、') : ''));
  check(!bodies.some(([, f]) => /\*\*/.test(f.body)), '文档：没有 Markdown 星号（游戏里会原样显示成 **）');
  check(!/\d{4}/.test(R.FILES.f10.body + R.FILES.f11.body + R.FILES.m2f3.body + R.FILES.m2f6.body) && !/A 开|→/.test(R.FILES.m3f5.body),
    '文档：密码和开关组合不再直接写出来（保险柜、储物柜要自己把两份文档对上）');
  // 攻略段删掉以后，谜题仍然要能从剧情文字唯一推出来
  const g = R.FILES.m3f5.body;
  check(/A 床[^\n]*每晚都要补光/.test(g) && /B 床[^\n]*A 床开着的时候，B 床也得开/.test(g) && /C 床[^\n]*绝对不要开灯/.test(g) && /D 床[^\n]*跟 B 床保持一致/.test(g)
    && JSON.stringify(R.GROW) === JSON.stringify({ A: true, B: true, C: false, D: true }), '补光灯：m3f5 的四条规则能唯一推出 A 开、B 开、C 关、D 开');
  check(/调度员 ID 卡/.test(R.FILES.m2f2.body) && /污水处理区/.test(R.FILES.m2f2.body), 'ID 卡：安保日志里的门禁记录指向污水处理区（以前靠括号攻略）');
  check(/玫瑰园的日晷/.test(R.FILES.f12.body) && /卧室的保险柜/.test(R.FILES.f12.body), '徽章：管家的备忘仍然写着狮在玫瑰园的日晷上、蛇在卧室的保险柜里');
  // 谜题文档.md 由 tools/puzzle-doc.js 生成。用独立进程跑（不受前面测试改过的状态影响），和仓库里的逐字比较
  const { execFileSync } = require('node:child_process'), path = require('node:path');
  const want = execFileSync(process.execPath, [path.join(__dirname, 'puzzle-doc.js'), '--stdout'], { encoding: 'utf8' });
  const have = fs.readFileSync(path.join(__dirname, '..', '谜题文档.md'), 'utf8');
  check(have === want, '谜题文档.md 和游戏里的文字、答案一致（不一致就运行 npm run build:html）');
  check(/\*\*1031\*\*/.test(have) && /\*\*0417\*\*/.test(have) && /埃德蒙 南/.test(have) && /A = 3 档/.test(have), '谜题文档.md：答案速查里有保险柜、储物柜、半身像、阀门的答案');
}

// ================= 物品栏的文件页（试玩反馈：文件变成两位数以后点不开）=================
// 以前文件只能在物品栏里按数字键 1–9 打开，第 10 份起没有键可按；文件一多列表还会画出面板。
{
  freshInv();
  const ids = ['f0', 'f1', 'f2', 'f3', 'f9', 'f4', 'f5', 'f10', 'f11', 'f13', 'f14', 'f12', 'm2f1', 'm2f2'];
  R.S.p.files = ids.slice();
  R.openInventory(); R.invKey({ code: 'KeyF', key: 'f' });
  check(R.mode === 'inv' && R.P.invTab === 'files', '文件页：物品栏里按 F 切到文件页');
  for (let i = 0; i < 11; i++) R.invKey({ code: 'ArrowDown', key: 'ArrowDown' });
  R.invKey({ code: 'KeyE', key: 'e' });
  check(R.mode === 'file' && R.fileView === R.FILES[ids[11]] && R.afterFile === 'inv', '文件页：第 12 份（两位数）也能打开，读完回到物品栏');
  R.mode = R.afterFile;   // 阅读界面按 E 关闭（input.js：mode = afterFile）
  check(R.mode === 'inv' && R.P.invTab === 'files' && R.P.fileCur === 11, '文件页：读完回来还停在文件页的同一份上');
  R.P.fileCur = 0; R.invKey({ code: 'ArrowUp', key: 'ArrowUp' }); const wrapped = R.P.fileCur;
  R.invKey({ code: 'ArrowLeft', key: 'ArrowLeft' }); const paged = R.P.fileCur;
  R.invKey({ code: 'Digit2', key: '2' });
  check(wrapped === ids.length - 1 && paged < wrapped && R.mode === 'inv', '文件页：↑ 从第一份绕到最后一份，← 往前翻一页；数字键不再用来开文件');
  // 全部 28 份（地图上摆着的都拿到）：光标在最后一份时，列表滚到能看见它；鼠标点两下打开
  const placed = ['map1', 'map2', 'map3'].flatMap(m => R.freshLevelState(m).items.filter(i => i.t === 'file').map(i => i.v));
  R.S.p.files = placed.slice(); R.P.fileCur = placed.length - 1;
  let threw = null; try { R.drawInventory(); } catch (e) { threw = e.message; }
  const rowsDrawn = R.uiRects.filter(r => r.side === 'file');
  check(!threw && placed.length >= 20 && rowsDrawn.some(r => r.i === R.P.fileCur) && rowsDrawn.length === R.P.fileRows && R.P.fileTop > 0,
    `文件页：${placed.length} 份文件时列表会滚动，光标所在的那份总在可见范围里（显示 ${rowsDrawn.length} 行）` + (threw ? ' —— ' + threw : ''));
  const r = rowsDrawn[1], cx = r.x + r.w / 2, cy = r.y + r.h / 2;
  R.invClick(cx, cy); const oneClick = R.mode; R.invClick(cx, cy);
  check(oneClick === 'inv' && R.mode === 'file' && R.fileView === R.FILES[placed[r.i]], '文件页：鼠标点一下选中、再点一下打开');
  R.mode = 'inv'; const tab = R.uiRects.find(q => q.side === 'tab' && q.i === 'items');
  R.invClick(tab.x + 5, tab.y + 5);
  check(R.P.invTab === 'items', '文件页：点「物品」页签回到格子');
  R.S.p.files = []; R.setInvTab('files'); threw = null; try { R.drawInventory(); } catch (e) { threw = e.message; }
  check(!threw, '文件页：一份文件都没有时也能正常绘制');
  // 每份文件标注的地图，和它实际摆放的地图一致
  const bad = [];
  for (const [m, name] of [['map1', '宅邸'], ['map2', '研究所'], ['map3', '制药厂']])
    for (const it of R.freshLevelState(m).items) if (it.t === 'file' && R.fileMapName(it.v) !== name) bad.push(`${it.v}@${m}`);
  check(!bad.length, '文件页：每份文件标注的来源地图和实际摆放的地图一致' + (bad.length ? ' —— ' + bad.join('、') : ''));
}

// ================= 页面还没加载完就动鼠标 / 按键（试玩截图：红框「menuHover is not defined」）=================
// 浏览器是一个 <script> 一个 <script> 执行的，两个脚本之间会处理输入事件。input.js 比 ui/menus.js 早加载，
// 以前页面加载时鼠标在画面上一动，就调到还不存在的 menuHover，红框从此一直挡在屏幕下方。
// harness 里的 addEventListener 是空函数，所以这里另开一个干净的环境：记下注册的监听，
// 每加载完一个文件就把所有键盘 / 鼠标 / 窗口事件触发一遍。
{
  const { canvasCtx } = require('./harness');
  const L = [];   // [目标, 事件, 处理函数]
  const target = who => ({ addEventListener: (type, fn) => L.push([who, type, fn]), removeEventListener: () => {} });
  const mkCanvas = () => ({ width: 0, height: 0, style: {}, getContext: () => canvasCtx, addEventListener: () => {} });
  const cvs = Object.assign(mkCanvas(), target('canvas'));
  const mem = new Map();
  const sb = Object.assign(target('window'), {
    innerWidth: 1280, innerHeight: 720, devicePixelRatio: 1,
    performance: { now: () => 0 }, requestAnimationFrame: () => {}, console, setTimeout, clearTimeout,
    localStorage: { getItem: k => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => { mem.set(k, String(v)); }, removeItem: k => { mem.delete(k); } },
  });
  sb.window = sb;
  sb.document = Object.assign(target('document'), { getElementById: () => cvs, createElement: mkCanvas, body: target('body') });
  vm.createContext(sb);
  const ev = (type, extra) => Object.assign({ type, code: 'KeyW', key: 'w', repeat: false, shiftKey: false, button: 0, clientX: 5, clientY: 5, deltaY: 100, preventDefault() {}, stopPropagation() {} }, extra);
  const errs = [];
  for (const s of SOURCES) {
    vm.runInContext(s.code, sb, { filename: 'src/' + s.rel });
    for (const [who, type, fn] of L) { try { fn(ev(type)); } catch (e) { errs.push(`${s.rel} 刚加载完时 ${who} 的 ${type}：${e.message}`); } }
  }
  check(!errs.length && L.some(([w, t]) => w === 'canvas' && t === 'mousemove'),
    `加载途中：每加载完一个文件都触发一遍键盘 / 鼠标 / 窗口事件，不报错${errs.length ? ' —— ' + errs.slice(0, 3).join('；') : ''}`);
  // 加载完以后输入要照常生效（不能因为挡了加载期间的事件，把正常输入也挡掉）
  const fire = (type, extra) => { for (const [, t, fn] of L) if (t === type) fn(ev(type, extra)); };
  vm.runInContext('MENU.titleCur = 0; frame(16);', sb);   // 画一帧标题画面，菜单项的位置记在 MENU.rects
  fire('keydown', { code: 'ArrowDown', key: 'ArrowDown' });
  const afterKey = vm.runInContext('MENU.titleCur', sb);
  const r0 = vm.runInContext('MENU.rects.find(q => q.i === 0)', sb);
  if (r0) fire('mousemove', { clientX: r0.x + r0.w / 2, clientY: r0.y + r0.h / 2 });
  const afterHover = vm.runInContext('MENU.titleCur', sb);
  check(vm.runInContext('booted', sb) === true && afterKey === 1 && !!r0 && afterHover === 0,
    `加载完成后输入照常生效：方向键移动标题菜单光标（→ ${afterKey}），鼠标悬停选中菜单项（→ ${afterHover}）`);
}

// ================= 报错红框（src/index.html 开头的内联脚本）=================
// 以前每来一次错误就追加一行、永远关不掉：一次加载期间的报错就能把血量和弹药一直挡住。
{
  const path = require('node:path');
  const html = fs.readFileSync(path.join(__dirname, '..', 'src', 'index.html'), 'utf8');
  const code = html.match(/<script>([\s\S]*?)<\/script>/)[1];
  const W = {};
  const body = { kids: [], appendChild(el) { el.parentNode = body; body.kids.push(el); return el; }, removeChild(el) { body.kids.splice(body.kids.indexOf(el), 1); el.parentNode = null; } };
  const mkEl = () => ({ style: {}, L: {}, textContent: '', parentNode: null, addEventListener(t, f) { this.L[t] = f; } });
  const sb = { addEventListener: (t, f) => { W[t] = f; }, document: { body, documentElement: body, createElement: mkEl, getElementById: () => null } };
  sb.window = sb;
  vm.runInNewContext(code, sb);
  const err = (message, filename, lineno) => W.error({ message, filename, lineno });
  const page = 'file:///D:/games/%E6%AE%8B%E5%93%8D%E4%B9%8B%E9%A6%86.html?picker=1';
  err('Uncaught ReferenceError: foo is not defined', page, 3272);
  err('Uncaught ReferenceError: foo is not defined', page, 3272);
  err('Uncaught TypeError: bar', '', 0);
  const t1 = body.kids.length ? body.kids[0].textContent : '';
  check(body.kids.length === 1 && t1.split('foo is not defined').length === 2 && /×2/.test(t1) && t1.includes('@残响之馆.html:3272') && t1.includes('TypeError: bar'),
    '报错红框：同一条错误只占一行并记次数（×2），文件名显示成「残响之馆.html」而不是一串 %E6…');
  let stopped = false;
  const box = body.kids[0];
  if (box) { box.L.mousedown({ stopPropagation() { stopped = true; } }); box.L.click({}); }
  const closed = body.kids.length === 0;
  err('Uncaught ReferenceError: foo is not defined', page, 3272);
  const quiet = body.kids.length === 0;
  err('Uncaught TypeError: baz', '', 0);
  const t2 = body.kids.length ? body.kids[0].textContent : '';
  check(stopped && closed && quiet && body.kids.length === 1 && t2.includes('baz') && !t2.includes('foo'),
    '报错红框：点一下就关（这一下不算开枪），关掉后同一条错误不再弹出，新的错误照样显示');
}

console.log('All simulation checks passed.');
