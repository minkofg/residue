'use strict';
// 每帧更新的调度顺序

// ---------------------------------------------------------------- 更新
// 登上直升机的演出（demo 版的结局）：只有直升机真的停在停机坪上（flags.heli）才算。
// 以前只看「这张地图有没有停机坪」，地图 1 的升降梯演出也被当成登机：
// 1.15 秒时人被瞬移到停机坪、镜头跟着飞过去、人物不再绘制。完整版里直升机会坠毁，所以现在这段永远不会触发。
function heliBoarding() { return S.cine > 0 && !!PAD && !!S.flags.heli; }
// 每帧的更新顺序；各部分的实现分别在 player/、world/、ai/、render/ 下
function update(dt) {
  S.time += dt;
  processGameTimers(dt);
  P.inv -= dt; P.fireCd -= dt; P.knifeCd -= dt; P.knifeT -= dt; P.flash -= dt; P.hurtT -= dt; P.bannerT -= dt; if (P.slowT > 0) P.slowT -= dt;
  flowT -= dt; if (flowT <= 0) flowT = computeFlowSlice();   // 每帧只重算一层（ai/nav.js：避免每秒 4 次的尖峰）

  // 演出段（S.cine > 0）：玩家交出控制权，怪物也停手。
  // 计时器和触发器照常跑 —— 整段演出就是靠它们一拍一拍推进的。
  // 不把玩家冻在原地不动的原因：结局那几秒他还要「走向直升机」，所以只锁输入不锁位移。
  if (S.flags.heli) S.heliT = (S.heliT || 0) + dt;   // 直升机自己的时间轴：降落 → 停机 → 升空

  // 直升机坠毁演出：锁输入、怪物停手，镜头由演出自己控制（game/events.js）
  if (S.crash || S.leap) {
    if (S.crash) updateHeliCrash(dt); else updateExecLeap(dt);
    updateRoomsAndEvents(dt);
    updateEffects(dt);
    updateAmbience(dt);
    return;
  }
  if (S.pod && S.pod.t < 2) {
    const was = S.pod.t; S.pod.t += dt;
    if (was < 1.3 && S.pod.t >= 1.3) { sfxAt('bash', S.pod.x, S.pod.y, 1, 2000, 0.4); sfxAt('explode', S.pod.x, S.pod.y, 0.35, 2000, 0.3); shake = Math.max(shake, 14); }
  }

  if (S.cine > 0) {
    S.cine -= dt; S.cineT = (S.cineT || 0) + dt;
    // 前 1.1 秒：林岚自己走向舱门（玩家已经交出控制权，但人不能定在原地不动）
    if (heliBoarding() && S.cineT < 1.1) {
      const k = Math.min(1, dt * 4.5);
      S.p.x += (PAD.x - S.p.x) * k; S.p.y += (PAD.y + 18 - S.p.y) * k;
      S.p.a = Math.atan2(PAD.y - S.p.y, PAD.x - S.p.x);
    }
    // 旋翼下洗：一圈被吹起来的草屑和尘土，整段演出持续
    if (heliBoarding() && Math.random() < 0.9) {
      const ang = rand(6.283), r0 = 30 + rand(60);
      parts.push({ x: PAD.x + Math.cos(ang) * r0, y: PAD.y + Math.sin(ang) * r0 + 20,
        vx: Math.cos(ang) * (90 + rand(140)), vy: Math.sin(ang) * (90 + rand(140)) - 20,
        life: rand(0.35, 0.8), max: 0.8, s: rand(1.5, 3), c: Math.random() < .5 ? '#6a6a4a' : '#8a8464', t: 'dust' });
    }
    // 升降梯（地图 1 → 地图 2）：林岚走进升降梯站好，之后一直待在里面；镜头照常跟着她
    if (S.cineLift && S.cineT < 0.9) { const k = Math.min(1, dt * 5); S.p.x += (S.cineLift.x - S.p.x) * k; S.p.y += (S.cineLift.y - S.p.y) * k; }
    updateTrainDepart(dt);
    updateRoomsAndEvents(dt);
    updateEffects(dt);
    updateAmbience(dt);
    updateCamera(dt, false);
    if (heliBoarding() && S.cineT > 1.15) { S.p.x = PAD.x; S.p.y = PAD.y + 18; }  // 已登机，人锁在舱门位置（不再绘制）
    // 第 4.4 秒：草坪上那个东西转过来仰头看着你。写在这里而不是渲染里 ——
    // 渲染函数不该改游戏状态，否则无画面测试根本跑不到这段逻辑。
    if (heliBoarding() && S.cineT > 4.4) {
      const b = S.enemies.find(e => e.t === 'boss' && !e.dead);
      if (b) b.fa = b.a = Math.atan2(PAD.y - b.y, PAD.x - b.x);
    }
    if (S.cine <= 0) { S.cine = 0; S.cineLift = null; if (S.cineThen === 'win') { mode = 'win'; modeT = 0; } else if (typeof S.cineThen === 'string' && S.cineThen.startsWith('goto:')) { S.train = null; gotoLevel(S.cineThen.slice(5)); } S.cineThen = null; }
    return;
  }

  const aiming = updatePlayer(dt);
  updateRoomsAndEvents(dt);
  updateEnemies(dt);
  updateHazards(dt);
  updateChaseMusic(dt);
  updateAmbience(dt);
  separateEntities();
  updateEffects(dt);
  updateCamera(dt, aiming);
}
