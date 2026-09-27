'use strict';
// 僵尸抓人（计划 5.2）：僵尸的攻击打中时不直接咬，而是先抓住你 —— 连按 E 挣脱。
//
//   被抓住：不能移动、瞄准、射击；屏幕中间出现「连按 E 挣脱」和进度条
//   GRAB.bite 秒内按够 GRAB.need 次 E → 挣脱：僵尸被推开、踉跄；你有一小段时间不会被再抓
//   没挣脱 → 被咬一口（GRAB.biteDmg，比普通攻击疼），然后僵尸松口
//   投掷物（G）：被抓时按 G = 把手雷 / 闪光弹塞给它 → 立刻挣脱（手雷直接炸它，闪光弹让它眩晕）
//   抓你的僵尸被别的东西打倒 / 打出硬直 → 松手
//
//   P.grab = { e, t, n }   e 抓你的僵尸，t 已经抓了多久，n 按了几次 E

const GRAB = {
  grabDmg: 5,        // 被抓住那一下的抓伤
  bite: 1.8,         // 这么多秒内没挣脱就会被咬
  need: 8,           // 挣脱要按几次 E
  biteDmg: 32,       // 咬一口（普通攻击 20）
  cd: 2.5,           // 挣脱 / 被咬之后，这么久不会被再抓
  pushStag: 1.4,     // 挣脱时僵尸踉跄多久
  nadeDmg: 150,      // 被抓时塞手雷：直接炸抓你的那只
};

function isGrabbed() { return !!(P.grab && P.grab.e); }

// 僵尸的攻击打中：能抓就抓（返回 true），不能抓就走普通伤害
function tryGrab(e) {
  if (isGrabbed() || (P.grabCd || 0) > 0 || (P.inv || 0) > 0 || inSafe() || mode !== 'play') return false;   // 无敌时间里抓不住
  P.grab = { e, t: 0, n: 0 };
  e.state = 'grab'; e.atkT = 0;
  hurtPlayer(GRAB.grabDmg, Math.atan2(S.p.y - e.y, S.p.x - e.x), 'grab');
  P.reloadT = 0; P.focus = 0; P.railCharge = 0;
  enemyCry(e, 'attack', 1, 800, 0.3);
  msg('被抓住了！连按 E 挣脱！', 2);
  return true;
}

function releaseGrab(how) {
  const g = P.grab; if (!g) return;
  const e = g.e; P.grab = null; P.grabCd = GRAB.cd;
  if (!e || e.dead) return;
  if (how === 'escape') {
    const a = Math.atan2(e.y - S.p.y, e.x - S.p.x);
    pushEnemy(e, Math.cos(a) * 26, Math.sin(a) * 26);
    e.state = 'chase'; e.stag = GRAB.pushStag; P.inv = Math.max(P.inv || 0, 0.6);
    floats.push({ x: e.x, y: e.y - 26, t: '挣脱！', life: 1, c: '#e8e070' });
    sfx('bash', 0.7);
  } else if (e.state === 'grab') { e.state = 'rec'; e.recT = EDEF[e.t].rec; }
}

// 连按 E
function grabMash() {
  const g = P.grab; if (!g) return false;
  g.n++; shake = Math.max(shake, 3); sfx('knife', 0.3);
  if (g.n >= GRAB.need) releaseGrab('escape');
  return true;
}

// 被抓时按 G：把投掷物塞给它
function grabThrow() {
  const g = P.grab; if (!g) return false;
  const id = curThrow();
  if (!id) { msg('没有投掷物 —— 连按 E 挣脱！', 1.5); return false; }
  const e = g.e;
  invTake(id, 1); curThrow();
  releaseGrab('escape');
  if (id === 'grenade') {
    sfxAt('explode', e.x, e.y, 1, 1600, 0.3); shake = Math.max(shake, 14);
    for (let i = 0; i < 30; i++) { const a = rand(6.283), v = rand(80, 300); parts.push({ x: e.x, y: e.y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: rand(0.3, 0.7), max: 0.7, s: rand(2, 5), c: Math.random() < .5 ? '#ffd070' : '#ff7a20' }); }
    damageEnemy(e, GRAB.nadeDmg, Math.atan2(e.y - S.p.y, e.x - S.p.x), 30, false, 1, 'blast');
    emitNoise(e.x, e.y, THROW.grenade.noise, 'grenade');
    msg('把手雷塞进了它嘴里！', 2);
  } else {
    sfx('explode', 0.4); e.stag = Math.max(e.stag || 0, THROW.flashbang.stun); e.alert = false;
    P.whiteT = Math.max(P.whiteT || 0, 0.5);
    msg('闪光弹贴脸炸开 —— 它捂着眼睛松手了！', 2);
  }
  return true;
}

// 每帧（player/update.js 开头调用）。返回 true = 被抓着，这一帧玩家不能做别的
function updateGrab(dt) {
  if ((P.grabCd || 0) > 0) P.grabCd -= dt;
  const g = P.grab; if (!g) return false;
  const e = g.e, p = S.p;
  if (!e || e.dead || e.stag > 0 || e.state !== 'grab' || inSafe() || mode !== 'play') { releaseGrab('drop'); return false; }
  g.t += dt;
  // 被抓着：僵尸贴在身上，朝着你
  const a = Math.atan2(p.y - e.y, p.x - e.x); e.fa = a;
  const want = e.r + p.r - 4, d = dist(e.x, e.y, p.x, p.y);
  if (d > want + 1) moveEnt(e, Math.cos(a) * (d - want) * Math.min(1, dt * 10), Math.sin(a) * (d - want) * Math.min(1, dt * 10));
  if (g.t >= GRAB.bite) {
    P.inv = 0; hurtPlayer(GRAB.biteDmg, a, 'zombie');
    bleed(p.x, p.y, a, 20, true);
    msg('被狠狠咬了一口！', 2);
    releaseGrab('bite');
  }
  return true;
}

// 屏幕中间的提示和进度条（ui/hud.js 调用）
function drawGrab() {
  const g = P.grab; if (!g) return;
  const k = Math.min(1, g.n / GRAB.need), left = Math.max(0, 1 - g.t / GRAB.bite);
  const x = W / 2 - 120, y = H / 2 + 70, shakeX = Math.sin(performance.now() / 30) * 2;
  ctx.save(); ctx.textAlign = 'center';
  ctx.font = 'bold 24px sans-serif'; ctx.fillStyle = '#ffe070'; ctx.fillText('连按 E 挣脱！', W / 2 + shakeX, y - 12);
  ctx.fillStyle = 'rgba(0,0,0,0.7)'; ctx.fillRect(x, y, 240, 12);
  ctx.fillStyle = '#e8d050'; ctx.fillRect(x, y, 240 * k, 12);
  ctx.fillStyle = left < 0.35 ? '#e83a2a' : '#a02020'; ctx.fillRect(x, y + 16, 240 * left, 4);
  if (curThrow()) { ctx.font = '13px sans-serif'; ctx.fillStyle = '#ccc'; ctx.fillText(`或按 G 把${ITEMS[curThrow()].name}塞给它`, W / 2, y + 38); }
  ctx.restore();
}
