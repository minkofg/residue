'use strict';
// 特效衰减与相机

// 粒子、弹道、飘字、消息、震屏的衰减
function updateEffects(dt) {
  for (const q of parts) {
    q.life -= dt; q.x += q.vx * dt; q.y += q.vy * dt; q.vx *= 0.9; q.vy *= 0.9;
    if (q.life <= 0 && q.t === 'blood' && Math.random() < 0.35) decals.push({ x: q.x, y: q.y, r: q.s * 1.5, rot: 0, a: 0.7 });
  }
  parts = parts.filter(q => q.life > 0);
  if (decals.length > 500) decals.splice(0, decals.length - 500);
  tracers.forEach(t => t.life -= dt); tracers = tracers.filter(t => t.life > 0);
  floats.forEach(f => { f.life -= dt; f.y -= 25 * dt; }); floats = floats.filter(f => f.life > 0);
  msgs.forEach(m => m.life -= dt); msgs = msgs.filter(m => m.life > 0);
  shake *= Math.pow(0.02, dt);
}

function updateCamera(dt, aiming) {
  const p = S.p;
  const aimOff = aiming ? 0.3 : 0.12;
  const tx = p.x - W / 2 + (mouse.x - W / 2) * aimOff, ty = p.y - H / 2 + (mouse.y - H / 2) * aimOff;
  cam.x = lerp(cam.x, tx, Math.min(1, dt * 6)); cam.y = lerp(cam.y, ty, Math.min(1, dt * 6));
}
