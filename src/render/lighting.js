'use strict';
// 动态光照、黑暗层、颗粒噪点

// ---------------------------------------------------------------- 光照
function castPoly(x, y, a0, a1, n, range) {
  const pts = [];
  for (let i = 0; i <= n; i++) { const a = a0 + (a1 - a0) * i / n; const d = ray(x, y, a, range, opaqueT); pts.push(x + Math.cos(a) * d, y + Math.sin(a) * d); }
  return pts;
}
function renderDarkness() {
  const p = S.p, r = curRoom(), R = r >= 0 ? ROOMS[r] : (P.room >= 0 ? ROOMS[P.room] : ROOMS[0]);
  dctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  dctx.globalCompositeOperation = 'source-over';
  dctx.clearRect(0, 0, W, H);
  // 有电力机制的地图（LEVEL.power）：断电时底色偏红（应急灯），来电后用 ambOn
  const powered = LEVEL.power && S.flags[LEVEL.power], amb = powered && R.ambOn != null ? R.ambOn : R.amb;
  dctx.fillStyle = R.id === 'yard' || R.outdoor ? `rgba(4,7,16,${amb})` : LEVEL.power && !powered ? `rgba(14,0,0,${amb})` : `rgba(0,0,0,${amb})`;
  dctx.fillRect(0, 0, W, H);
  dctx.globalCompositeOperation = 'destination-out';
  dctx.save(); dctx.translate(-cam.x, -cam.y);
  const fl = (Math.random() < 0.01 ? 0.6 : 1);
  // 近身感知
  let pts = castPoly(p.x, p.y, 0, Math.PI * 2, 90, 110);
  let g = dctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, 110);
  g.addColorStop(0, 'rgba(0,0,0,0.6)'); g.addColorStop(1, 'rgba(0,0,0,0)');
  dctx.fillStyle = g; poly(dctx, pts); dctx.fill();
  // 列车开走的演出：人在车上，不画手电；站台的灯全开 + 车厢里的暖光跟着车走
  const onTrain = S.train && S.cine > 0 && S.train.t > 0.7;
  if (S.train) {
    const R = S.train, off = trainOffset(R.t);
    dctx.save(); dctx.beginPath(); dctx.rect(24 * T, 2 * T, 40 * T, 11 * T); dctx.clip();
    g = dctx.createRadialGradient(44 * T, 8 * T, 0, 44 * T, 8 * T, 1100); g.addColorStop(0, 'rgba(0,0,0,0.85)'); g.addColorStop(1, 'rgba(0,0,0,0.35)');
    dctx.fillStyle = g; dctx.fillRect(24 * T, 2 * T, 40 * T, 11 * T);
    const dx = R.door.x + off, dy = R.y + R.h;
    g = dctx.createRadialGradient(dx, dy, 0, dx, dy, 220); g.addColorStop(0, 'rgba(0,0,0,1)'); g.addColorStop(1, 'rgba(0,0,0,0)');
    dctx.fillStyle = g; dctx.fillRect(dx - 220, dy - 220, 440, 440);
    dctx.restore();
  }
  // 手电筒
  const half = 0.48, range = onTrain ? 0 : 520;
  if (range) pts = [p.x, p.y].concat(castPoly(p.x, p.y, p.a - half, p.a + half, 70, range));
  g = dctx.createRadialGradient(p.x, p.y, 10, p.x, p.y, range);
  g.addColorStop(0, `rgba(0,0,0,${fl})`); g.addColorStop(0.55, `rgba(0,0,0,${0.85 * fl})`); g.addColorStop(1, 'rgba(0,0,0,0)');
  if (range) { dctx.fillStyle = g; poly(dctx, pts); dctx.fill(); }
  // 枪口火光
  if (P.flash > 0) {
    pts = castPoly(p.x, p.y, 0, Math.PI * 2, 90, 380);
    g = dctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, 380); g.addColorStop(0, 'rgba(0,0,0,0.9)'); g.addColorStop(1, 'rgba(0,0,0,0)');
    dctx.fillStyle = g; poly(dctx, pts); dctx.fill();
  }
  hazardLights(dctx);   // 火场的火光
  // 灯
  const lamps = LAMPS.filter(L => (!L.flag || S.flags[L.flag]) && !(L.noFlag && S.flags[L.noFlag]));  // 带 flag 的灯由事件点亮
  for (const L of lamps) {
    const Ri = ROOMS.find(q => q.id === L.room);
    let a = L.a;
    if (L.fl) { a *= L.fl >= 1 ? (Math.sin(S.time * 23) > 0.7 || Math.random() < 0.08 ? 0.15 : 1) : 1 - Math.random() * L.fl; }
    const lx = L.x * T, ly = L.y * T;
    if (lx + L.r < cam.x || lx - L.r > cam.x + W || ly + L.r < cam.y || ly - L.r > cam.y + H) continue;
    dctx.save(); dctx.beginPath(); dctx.rect(Ri.x * T, Ri.y * T, Ri.w * T, Ri.h * T); dctx.clip();
    g = dctx.createRadialGradient(lx, ly, 0, lx, ly, L.r); g.addColorStop(0, `rgba(0,0,0,${a})`); g.addColorStop(1, 'rgba(0,0,0,0)');
    dctx.fillStyle = g; dctx.fillRect(lx - L.r, ly - L.r, L.r * 2, L.r * 2);
    dctx.restore();
  }
  dctx.restore();
  dctx.globalCompositeOperation = 'source-over';
  ctx.drawImage(dark, 0, 0, W, H);
  if (R.rain) drawRain();
  // 彩色灯（col）：在暗层之上叠一层加色光晕 —— 应急灯的红、培养槽的绿
  const tint = { red: '255,40,30', green: '70,255,140', blue: '90,150,255', orange: '255,130,30' };
  ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.translate(-cam.x, -cam.y);
  for (const L of lamps) {
    if (!L.col || !tint[L.col]) continue;
    const Ri = ROOMS.find(q => q.id === L.room), lx = L.x * T, ly = L.y * T;
    ctx.save(); ctx.beginPath(); ctx.rect(Ri.x * T, Ri.y * T, Ri.w * T, Ri.h * T); ctx.clip();
    const k = L.fl ? 1 - Math.random() * L.fl * 0.5 : 1;
    const gg = ctx.createRadialGradient(lx, ly, 0, lx, ly, L.r); gg.addColorStop(0, `rgba(${tint[L.col]},${0.16 * k})`); gg.addColorStop(1, `rgba(${tint[L.col]},0)`);
    ctx.fillStyle = gg; ctx.fillRect(lx - L.r, ly - L.r, L.r * 2, L.r * 2); ctx.restore();
  }
  ctx.restore();
}
function poly(c, pts) { c.beginPath(); c.moveTo(pts[0], pts[1]); for (let i = 2; i < pts.length; i += 2) c.lineTo(pts[i], pts[i + 1]); c.closePath(); }

// ---------------------------------------------------------------- 颗粒噪点
const grainC = document.createElement('canvas'); grainC.width = grainC.height = 256;
(() => { const g = grainC.getContext('2d'), id = g.createImageData(256, 256); for (let i = 0; i < id.data.length; i += 4) { const v = Math.random() * 255; id.data[i] = id.data[i + 1] = id.data[i + 2] = v; id.data[i + 3] = 255; } g.putImageData(id, 0, 0); })();
let grainPat = null;

// 户外下雨（房间 rain: true）：屏幕空间里斜着落的雨丝 + 地上溅起的小水花。画在暗层之上，雨丝本身是亮的
function drawRain() {
  const t = performance.now() / 1000;
  ctx.save(); ctx.strokeStyle = 'rgba(170,190,215,0.28)'; ctx.lineWidth = 1; ctx.beginPath();
  for (let i = 0; i < 170; i++) {
    const sx = (i * 97.13) % 1, sp = 0.8 + ((i * 53.7) % 1) * 0.5;
    const y = ((t * 900 * sp + i * 131) % (H + 80)) - 40, x = ((sx * (W + 200) + y * 0.25 - cam.x * 0.2) % (W + 200) + W + 200) % (W + 200) - 100;
    ctx.moveTo(x, y); ctx.lineTo(x - 5, y - 18);
  }
  ctx.stroke();
  ctx.fillStyle = 'rgba(190,210,230,0.25)';
  for (let i = 0; i < 26; i++) { const k = (t * 3 + i * 0.37) % 1, x = (i * 211.7 + Math.floor(t * 3 + i * 0.37) * 97) % W, y = (i * 157.3 + Math.floor(t * 3 + i * 0.37) * 61) % H; ctx.globalAlpha = 1 - k; ctx.beginPath(); ctx.ellipse(x, y, 2 + k * 6, 1 + k * 2.5, 0, 0, 7); ctx.fill(); }
  ctx.restore();
}
