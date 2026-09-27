'use strict';
// 机关道具（prop）：能交互但拿不走的东西 —— 目前是画廊的四座半身像和天窗下的地板机关。
//
// 为什么做成 items 而不是家具：
//   · 家具画在缓存好的地砖图层上，转一下就要重画整块，而且家具没有每局变化的状态；
//   · items 本来就整体进存档（save.js 直接序列化 S.items），朝向 it.face 自动跟着存；
//   · findInteract() 已经会挑最近的 item，交互距离、遮挡规则全都免费复用。
// 代价是 PROPS 里的东西必须在「能捡的道具」相关的地方被排除掉（拾取、闪光、地图上的
// 「还有道具」标记），下面和 render/world.js、ui/screens.js 里都有对应处理。

const PROPS = { typewriter: 1, box: 1, bust: 1, plate: 1, safe: 1, altar: 1, lift: 1, switch: 1, fusebox: 1, console: 1, traindoor: 1, valve: 1, gunlocker: 1, ln2lever: 1, growlight: 1, glcase: 1, ladle: 1, trainConsole: 1, escapedoor: 1 };  // 不是战利品，只是能交互的场景物
const isProp = t => !!PROPS[t];

// 方位 → 屏幕方向。画布 y 轴向下，所以「北 = 上 = -y」。
// 这是全游戏「上北下南左西右东」的唯一定义处，渲染和文字都必须从这里取，
// 不许在别处另写一遍 —— 之前渲染里手搓了一个 face*90°-90°，整套朝向逆时针偏了一格：
// 名牌写着「面朝北」，像却指向屏幕左边。
const FACE_VEC = [[0, -1], [1, 0], [0, 1], [-1, 0]];   // 0=北(上) 1=东(右) 2=南(下) 3=西(左)
// 半身像贴图的「鼻梁」是朝上画的，所以朝北时旋转量是 0
function bustSpriteAngle(face) { return face * Math.PI / 2; }

// ---------------------------------------------------------------- 半身像
function bustsOf() { return S.items.filter(it => it.t === 'bust'); }
function bustRight(it) { const b = BUSTS[it.v]; return !!b && it.face === b.want; }
function bustsCorrect() { return bustsOf().filter(bustRight).length; }

// 转一座像：顺时针 90°。转到位不给「叮」的反馈 —— 那等于把 256 种组合的谜题
// 降级成 16 次试错，家谱就白写了。想要提示的人去看天窗下的地板机关。
function turnBust(it) {
  const b = BUSTS[it.v];
  it.face = (it.face + 1) % 4;
  sfx('door', 0.5);
  emitNoise(it.x, it.y, NOISE.doorClose * 0.6);  // 石头磨地是有声音的，会引来东西
  msg(`「${b.name}」${b.note ? ' · ' + b.note : ''}　现在面朝：${FACE_NAME[it.face]}`, 3);
  checkBusts();
}

// 天窗下的地板机关：只报「对了几道」，不报是哪几道。
// 这是给丢了家谱的人留的保底，但**必须有代价**，否则它会变成比读文件更快的捷径：
// 踩下去要绞动整套铜杆，动静比开门还大（NOISE.glass 级），附近的东西会被引过来。
// 读家谱是安静的，硬试是吵的 —— 这就是「保底不是捷径」的落实方式。
function readPlate() {
  const n = bustsCorrect();
  if (S.flags.bustsSolved) { sfx('pickup', 0.4); msg('凹槽里的四道铜线都亮着。机关已经松开了。', 4); return; }
  sfx('locked', 0.8);
  emitNoise(S.p.x, S.p.y, NOISE.glass);   // 很吵：硬试是要付学费的
  msg(`你踩下地砖。边缘刻着方位罗盘，指北的那道朝向长厅深处。铜杆在脚下绞动，声音荡开——四道凹槽，此刻有 ${n} 道亮着。`, 5);
}

function checkBusts() {
  if (S.flags.bustsSolved) return;
  const list = bustsOf();
  if (!list.length || bustsCorrect() !== list.length) return;
  setFlag('bustsSolved');   // 开门、播音效、给提示都写在 config/triggers.js 里
}

// 给触发器用的统一入口：设标记并让 on:{flag} 的触发器跑起来
function setFlag(name) {
  if (S.flags[name]) return;
  S.flags[name] = true;
  fireEvent('flag', { flag: name });
}

// ---------------------------------------------------------------- 密码保险柜
// 打开后进入 mode 'safe'（游戏暂停，和读文件一样）。拨盘：←→ 选位、↑↓ 拨动、数字键直接输入、Enter 试开、Esc 离开。
// 试错的代价和地板机关一样：拉一下把手会响（NOISE.doorClose），附近的东西会被引过来。
// 不设次数上限 —— 锁死玩家的谜题只会逼人去查攻略。
const SAFE_UI = { it: null, digits: [], cur: 0, shake: 0, tries: 0 };

function openSafe(it) {
  const cfg = SAFES[it.v];
  if (!cfg) return;
  if (it.open) { msg(`${cfg.name}开着，里面已经空了。`, 3); return; }
  SAFE_UI.it = it; SAFE_UI.digits = new Array(cfg.code.length).fill(0); SAFE_UI.cur = 0; SAFE_UI.shake = 0;
  sfx('pickup', 0.3);
  mode = 'safe'; modeT = 0;
}
function closeSafe() { SAFE_UI.it = null; mode = 'play'; }

function trySafe() {
  const it = SAFE_UI.it, cfg = SAFES[it.v];
  if (SAFE_UI.digits.join('') === cfg.code) {
    it.open = true;                  // 保险柜本身留在原地（进存档），只是变成「开着」
    closeSafe();
    sfx('locked', 0.7); sfx('key', 0.9);
    giveReward(cfg.reward);
    if (cfg.flag) setFlag(cfg.flag);
    fireEvent('pickup', { t: 'safe', v: it.v });
    return true;
  }
  SAFE_UI.tries++; SAFE_UI.shake = 0.35;
  sfx('locked', 0.9);
  emitNoise(it.x, it.y, NOISE.doorClose);   // 拉把手是有动静的
  msg('把手纹丝不动。', 2);
  return false;
}

function giveReward(r) {
  if (!r) return;
  if (r.mod) {
    const m = MODS[r.mod];
    S.p.mods = S.p.mods || {}; S.p.mods[r.mod] = true;
    msg(`获得「${m.name}」—— ${m.desc}`, 5);
  }
  if (r.key) { S.p.keys[r.key] = true; msg(`获得「${KEYS[r.key].name}」`, 4); }
  if (r.items) for (const [id, n] of r.items) {
    invAdd(S.p.inv, id, n);   // 背包不限格数，总能放下
    if (ITEMS[id].kind === 'weapon') { S.p.mag[id] = r.loaded ?? WEAPONS[id].mag; msg(`获得 ${ITEMS[id].name}！按 ${WEAPON_SLOTS.findIndex(s => s.id === id) + 1} 或滚轮切换。`, 5); }
  }
}

// 配件对某把枪的某个属性的覆盖（比如消音器把 noise 改成 5、sfx 换成 suppressed）
function modVal(w, key, dflt) {
  const mods = S && S.p && S.p.mods;
  if (mods) for (const k in mods) if (mods[k] && MODS[k] && MODS[k].weapon === w && MODS[k][key] !== undefined) return MODS[k][key];
  return dflt;
}
// 弹匣容量（含配件）。射击、装填、HUD 一律从这里取，不要直接读 WEAPONS[w].mag
function magCap(w) {
  let cap = WEAPONS[w] ? WEAPONS[w].mag : 0;
  const mods = S && S.p && S.p.mods;
  if (mods) for (const k in mods) if (mods[k] && MODS[k] && MODS[k].weapon === w) cap += MODS[k].mag || 0;
  return cap;
}

function safeKey(e) {
  const d = SAFE_UI.digits, n = d.length;
  if (modeT < 0.15) return;
  switch (e.code) {
    case 'ArrowLeft': case 'KeyA': SAFE_UI.cur = (SAFE_UI.cur + n - 1) % n; sfx('step', 0.2); return;
    case 'ArrowRight': case 'KeyD': SAFE_UI.cur = (SAFE_UI.cur + 1) % n; sfx('step', 0.2); return;
    case 'ArrowUp': case 'KeyW': d[SAFE_UI.cur] = (d[SAFE_UI.cur] + 1) % 10; sfx('empty', 0.35); return;
    case 'ArrowDown': case 'KeyS': d[SAFE_UI.cur] = (d[SAFE_UI.cur] + 9) % 10; sfx('empty', 0.35); return;
    case 'Enter': case 'KeyE': case 'Space': trySafe(); return;
    case 'Escape': case 'Tab': closeSafe(); return;
  }
  const m = /^(?:Digit|Numpad)(\d)$/.exec(e.code);
  if (m) { d[SAFE_UI.cur] = +m[1]; SAFE_UI.cur = Math.min(n - 1, SAFE_UI.cur + 1); sfx('empty', 0.35); }
}

function drawSafe(dt) {
  const it = SAFE_UI.it; if (!it) return;
  const cfg = SAFES[it.v], d = SAFE_UI.digits, n = d.length;
  SAFE_UI.shake = Math.max(0, SAFE_UI.shake - (dt || 0.016));
  ctx.fillStyle = 'rgba(0,0,0,0.72)'; ctx.fillRect(0, 0, W, H);
  const pw = 120 * n + 80, ph = 300, sx = SAFE_UI.shake > 0 ? Math.sin(SAFE_UI.shake * 90) * 6 : 0;
  const x0 = W / 2 - pw / 2 + sx, y0 = H / 2 - ph / 2;
  ctx.fillStyle = '#1d1f21'; ctx.fillRect(x0, y0, pw, ph);
  ctx.strokeStyle = '#4a4c4e'; ctx.lineWidth = 3; ctx.strokeRect(x0 + 1.5, y0 + 1.5, pw - 3, ph - 3);
  ctx.strokeStyle = '#2c2e30'; ctx.lineWidth = 1; ctx.strokeRect(x0 + 12, y0 + 12, pw - 24, ph - 24);
  ctx.textAlign = 'center'; ctx.fillStyle = '#c9b98a'; ctx.font = '20px serif';
  ctx.fillText(cfg.name, W / 2 + sx, y0 + 44);
  ctx.fillStyle = '#8a8070'; ctx.font = '13px sans-serif'; ctx.fillText(cfg.look, W / 2 + sx, y0 + 68);
  for (let i = 0; i < n; i++) {
    const cx = x0 + 40 + 60 + i * 120, cy = y0 + 160, sel = i === SAFE_UI.cur;
    ctx.fillStyle = sel ? '#8a6d2e' : '#5e4c24'; ctx.beginPath(); ctx.arc(cx, cy, 44, 0, 7); ctx.fill();
    ctx.fillStyle = sel ? '#d8b862' : '#a88a44'; ctx.beginPath(); ctx.arc(cx, cy, 38, 0, 7); ctx.fill();
    ctx.fillStyle = '#2a2010'; ctx.font = 'bold 40px serif'; ctx.textBaseline = 'middle'; ctx.fillText(d[i], cx, cy + 2);
    ctx.font = '12px sans-serif'; ctx.fillStyle = sel ? '#e8d8a0' : '#555';
    ctx.fillText('▲', cx, cy - 58); ctx.fillText('▼', cx, cy + 58);
    ctx.textBaseline = 'alphabetic';
  }
  ctx.fillStyle = '#777'; ctx.font = '13px sans-serif';
  ctx.fillText('←→ 选择拨盘　↑↓ 或数字键 拨动　Enter 拉开把手　Esc 离开', W / 2 + sx, y0 + ph - 26);
  if (SAFE_UI.tries >= 3) { ctx.fillStyle = '#8a7a5a'; ctx.fillText(SAFES[SAFE_UI.it.v].clue || '（线索：主卧和图书室里各有一份文件）', W / 2 + sx, y0 + ph - 48); }
}

// ---------------------------------------------------------------- 主厅雕像底座（两枚徽章）
// 不是谜题，是「收集」的终点：谜题负责产出徽章（蛇 = 主卧保险柜），狮在后庭院 —— 处刑者登场之后才去得了的地方。
const MEDALS = ['lion', 'snake'];
function useAltar(it) {
  S.altar = S.altar || {};
  const put = MEDALS.filter(m => S.p.keys[m] && !S.altar[m]);
  if (!put.length) {
    const left = MEDALS.filter(m => !S.altar[m]).map(m => KEYS[m].name.replace('之徽章', ''));
    if (!left.length) { msg('两枚徽章都嵌在底座里。石板已经挪开了。', 3); return; }
    sfx('locked', 0.5);
    msg(`雕像的底座上有两个圆形凹槽，分别刻着狮与蛇。${left.length < 2 ? `还空着：${left[0]}。` : ''}`, 5);
    return;
  }
  for (const m of put) { S.altar[m] = true; delete S.p.keys[m]; }
  sfx('key', 0.9);
  msg(`把${put.map(m => '「' + KEYS[m].name + '」').join('和')}嵌进了凹槽。`, 4);
  if (MEDALS.every(m => S.altar[m])) setFlag('medalsPlaced');   // 开门的一串动静写在 config/triggers.js
}

// ---------------------------------------------------------------- 地图 2：配电箱（三个保险丝）
const FUSES = ['fuseA', 'fuseB', 'fuseC'];
function useFusebox(it) {
  S.fuses = S.fuses || {};
  const put = FUSES.filter(f => S.p.keys[f] && !S.fuses[f]);
  const n0 = FUSES.filter(f => S.fuses[f]).length;
  if (!put.length) {
    if (n0 === 3) { msg('三个保险丝都插着。配电箱嗡嗡作响。', 3); return; }
    sfx('locked', 0.5); msg(`配电箱的面板开着，三个保险丝插槽${n0 ? `还空着 ${3 - n0} 个` : '全是空的'}。`, 4); return;
  }
  for (const f of put) { S.fuses[f] = true; delete S.p.keys[f]; }
  const n = n0 + put.length;
  sfx('key', 0.9); msg(`插入了 ${put.length} 个保险丝（${n} / 3）。`, 3);
  if (n === 3) setFlag('m2Power');   // 来电的一串动静写在 config/map2.js
}
// ---------------------------------------------------------------- 地图 2：冷冻库的液氮阀门（三个阀门的压力）
// 每个阀门 1–5 档，按 E 拧一档（5 之后回到 1）。三个都对上 → 冷冻柜的锁松开，拿到麦林。
// 拧阀门会嘶的一声（NOISE.doorClose）—— 舔舐者会听见，乱试是有代价的。
const VALVES = { A: 3, B: 1, C: 4 };
const VALVE_START = { A: 1, B: 3, C: 2 };   // 初始档位：三个都不在答案上
const valveP = it => it.p ?? VALVE_START[it.v] ?? 1;   // 答案来自文件 m2f7：A=3，B 比 A 低两档，C = A + B
function useValve(it) {
  if (S.flags.valvesSolved) { msg('三个压力表的指针都停在绿区。冷冻柜已经打开了。', 3); return; }
  it.p = valveP(it) % 5 + 1;
  sfx('sizzle', 0.7); emitNoise(it.x, it.y, NOISE.doorClose, 'valve');
  msg(`${it.v} 号阀门：压力 ${it.p} 档`, 1.5);
  const vs = S.items.filter(i => i.t === 'valve');
  if (vs.length === 3 && vs.every(v => valveP(v) === VALVES[v.v])) {
    sfx('locked', 0.8); sfx('key', 0.9);
    msg('管道里的嘶声平息了。墙边那个枪械柜的电磁锁「咔」地弹开了。', 5);
    setFlag('valvesSolved');
  }
}
// 液氮紧急排放：冻住站在冷冻库中央的处刑者
const inLN2Zone = (x, y) => { const z = LN2.zone, tx = Math.floor(x / T), ty = Math.floor(y / T); return tx >= z.x0 && tx <= z.x1 && ty >= z.y0 && ty <= z.y1; };
function useLN2Lever(it) {
  if (!S.flags.valvesSolved) { sfx('locked', 0.5); msg('紧急排放拉杆。旁边的压力表指针趴在零上 —— 管路压力还没调好。', 4); return; }
  const wait = (S.ln2Ready || 0) - S.time;
  if (wait > 0) { sfx('locked', 0.4); msg(`管路正在重新加压……还要 ${Math.ceil(wait)} 秒。`, 2); return; }
  S.ln2Ready = S.time + LN2.recharge;
  sfx('sizzle', 1.4); sfx('bash', 0.6); shake = Math.max(shake, 8);
  emitNoise(it.x, it.y, 8, 'ln2');
  const z = LN2.zone;
  for (let i = 0; i < 90; i++) parts.push({ x: (z.x0 + Math.random() * (z.x1 - z.x0 + 1)) * T, y: (z.y0 + Math.random() * (z.y1 - z.y0 + 1)) * T, vx: rand(-20, 20), vy: rand(-30, 5), life: rand(0.8, 1.8), max: 1.8, s: rand(4, 10), c: 'rgba(210,235,255,0.55)', t: 'bubble' });
  let hitBoss = false;
  for (const e of S.enemies) {
    if (e.dead || !inLN2Zone(e.x, e.y)) continue;
    if (e.t === 'boss') { freezeExecutioner(e); hitBoss = true; }
    else { e.stag = Math.max(e.stag || 0, 6); e.frozenT = 6; }   // 杂兵也冻住一会儿
  }
  if (inLN2Zone(S.p.x, S.p.y)) { hurtPlayer(LN2.selfDmg, 0, 'ln2'); P.slowT = Math.max(P.slowT || 0, LN2.selfSlow); msg('刺骨的白雾扑了你一身！', 2.5); }
  if (hitBoss) msg('白雾轰地喷满了冷冻库 —— 「处刑者」被冻在了原地！（约 30 秒）', 5);
  else msg('液氮喷了出来……可是中央什么也没有。管路开始重新加压。', 3.5);
}
// 枪械柜：阀门解开后才能打开；背包满了就先留在柜子里，随时回来拿
function useGunLocker(it) {
  if (S.flags.magnumTaken) { msg('枪械柜空了。', 2); return; }
  if (!S.flags.valvesSolved) { sfx('locked', 0.5); msg('一个上了电磁锁的枪械柜。锁旁边的指示灯写着「管道压力异常 —— 锁定」。', 4); return; }
  sfx('key', 0.9);
  giveReward({ items: [['magnum', 1]] });   // 满匣 6 发，没有备弹
  setFlag('magnumTaken');
}
// ---------------------------------------------------------------- 地图 2：主控室的列车控制台
function useConsole(it) {
  if (S.flags.trainReady) { msg('列车正在预热。去站台。', 3); return; }
  if (!S.flags.m2Power) { sfx('locked', 0.5); msg('控制台一片漆黑。没有电。', 3); return; }
  if (!S.p.keys.idcard) { sfx('locked', 0.5); msg('屏幕亮着：「请刷调度员以上权限的 ID 卡」。', 4); return; }
  delete S.p.keys.idcard; sfx('save', 0.6); msg('刷卡。屏幕跳出一行绿字：「货运列车 —— 启动」。', 4);
  setFlag('trainReady');
}

// 货运列车的车门：预热结束才开
function useTrainDoor(it) {
  if (S.flags.boarded) return;
  if (!S.flags.trainReady) { sfx('locked', 0.5); msg('车门锁着。列车没有启动 —— 调度在主控室。', 3); return; }
  if (!S.flags.trainGo) { sfx('locked', 0.4); msg(`车门还锁着。列车在预热……还要 ${Math.ceil(S.countdown ? S.countdown.left : 0)} 秒。`, 2); return; }
  // 计划 §2：进入下一张地图前要提示「无法返回」—— 和酒窖升降梯一样，按一次只是提示，4 秒内再按一次才上车。
  // （这句提醒以前只写在调度手册 m2f5 的括号攻略里，攻略段删掉后挪到这里）
  if (!(S.trainConfirmT > S.time)) {
    S.trainConfirmT = S.time + 4;
    sfx('locked', 0.4);
    msg('车门开着，柴油机在空转。上车之后就回不来了——建议先存档。（再按一次 E 上车）', 5);
    return;
  }
  S.trainConfirmT = 0;
  setFlag('boarded');
}
// ---------------------------------------------------------------- 酒窖升降梯（地图出口）
// 计划 §2：进入下一张地图前要提示「无法返回」。按一次 E 只是提示，4 秒内再按一次才下去。
function useLift(it) {
  if (!S.flags.medalsPlaced) { msg('升降梯没有电。', 3); return; }
  if (!(S.liftConfirmT > S.time)) {
    S.liftConfirmT = S.time + 4;
    sfx('locked', 0.5);
    msg('铁栅门后面是一架运货的升降梯，缆绳一直垂进黑暗里。下去之后就回不来了——建议先存档。（再按一次 E 下降）', 5);
    return;
  }
  S.liftConfirmT = 0;
  setFlag('liftDown');   // 下降演出与切换地图写在 config/triggers.js
}

// ---------------------------------------------------------------- 地图 3：温室补光灯（四个开关 → 武器箱电子锁）
// 答案来自文件 m3f5：A 开、B 开（因为 A 开）、C 关（会叫醒蔓生体）、D 跟 B 一样 → 开
const GROW_BEDS = { A: [29, 31, 32], B: [35, 31, 38], C: [29, 35, 32], D: [35, 35, 38] };   // 开关对应的种植槽 [x0, y, x1]
const GROW = { A: true, B: true, C: false, D: true };
function useGrowLight(it) {
  if (S.flags.growSolved) { msg('补光灯的灯位已经对上了。武器箱开着。', 2.5); return; }
  it.on = !it.on;
  sfx('key', 0.5); emitNoise(it.x, it.y, NOISE.doorClose, 'switch');
  msg(`${it.v} 床补光灯：${it.on ? '开' : '关'}`, 1.5);
  if (it.v === 'C' && it.on) {   // 惩罚：光把 B-7 叫醒了
    for (const e of S.enemies) if (e.t === 'vine' && !e.dead) { e.state = 'up'; e.alert = true; }
    msg('C 床的灯一亮，种植槽里的藤蔓猛地挺了起来！', 4); shake = Math.max(shake, 4);
  }
  const ls = S.items.filter(i => i.t === 'growlight');
  if (ls.length === 4 && ls.every(l => !!l.on === GROW[l.v])) {
    sfx('save', 0.6); sfx('key', 0.9);
    msg('配电箱「嘀」了一声。武器箱的电子锁弹开了。', 5);
    setFlag('growSolved');
  }
}
function useGlCase(it) {
  if (S.flags.glTaken) { msg('武器箱空了。', 2); return; }
  if (!S.flags.growSolved) { sfx('locked', 0.5); msg('一个装着榴弹发射器的武器箱。电子锁的小屏幕上写着：「夜间模式 —— 灯位错误」。', 4); return; }
  sfx('key', 0.9);
  giveReward({ items: [['gl', 1]], loaded: 1 });
  setFlag('glTaken');
}
