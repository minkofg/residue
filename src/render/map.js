'use strict';
// 地图预渲染（地板、墙、家具画到离屏画布）

// ---------------------------------------------------------------- 地图预渲染
// 预渲染画布的尺寸跟随当前地图，在 renderMap() 里按 MW / MH 调整（切换地图时会重建）
const mapC = document.createElement('canvas'); mapC.width = MW * T; mapC.height = MH * T;
const mc = mapC.getContext('2d');
function roomOf(tx, ty) {
  let r = roomAt[ty * MW + tx];
  if (r === -2) { // 门：取相邻房间
    for (const [dx, dy] of [[0, 1], [0, -1], [1, 0], [-1, 0]]) { const q = roomAt[(ty + dy) * MW + tx + dx]; if (q >= 0) return q; }
  }
  return r;
}
function drawFloor(st, x, y, px, py) {
  const h = hash(x, y);
  switch (st) {
    case 'marble': case 'marble2': {
      const a = st === 'marble' ? ['#3d3832', '#2a2622'] : ['#34302d', '#26221f'];
      mc.fillStyle = ((x + y) & 1) ? a[0] : a[1]; mc.fillRect(px, py, T, T);
      mc.strokeStyle = 'rgba(255,255,255,0.04)'; mc.beginPath(); mc.moveTo(px + h * T, py); mc.lineTo(px + T, py + h * T); mc.stroke();
      mc.strokeStyle = 'rgba(0,0,0,0.4)'; mc.strokeRect(px + .5, py + .5, T - 1, T - 1); break;
    }
    case 'wood': case 'wood2': case 'safe': {
      mc.fillStyle = st === 'wood' ? '#38271a' : st === 'wood2' ? '#2c1f15' : '#4a3825'; mc.fillRect(px, py, T, T);
      mc.strokeStyle = 'rgba(0,0,0,0.45)';
      for (let k = 0; k < 4; k++) {
        mc.beginPath(); mc.moveTo(px, py + k * 12 + .5); mc.lineTo(px + T, py + k * 12 + .5); mc.stroke();
        const sx = px + Math.floor(hash(x * 7 + k, y * 3) * T);
        mc.beginPath(); mc.moveTo(sx + .5, py + k * 12); mc.lineTo(sx + .5, py + k * 12 + 12); mc.stroke();
        mc.fillStyle = `rgba(255,220,180,${hash(x + k, y * 5) * 0.04})`; mc.fillRect(px, py + k * 12 + 1, T, 11);
      }
      break;
    }
    case 'stone': {
      mc.fillStyle = '#2a2928'; mc.fillRect(px, py, T, T);
      for (let k = 0; k < 6; k++) { mc.fillStyle = `rgba(${hash(x, k) > .5 ? 255 : 0},${hash(x, k) > .5 ? 255 : 0},${hash(x, k) > .5 ? 255 : 0},0.05)`; mc.fillRect(px + hash(x + k, y) * T, py + hash(x, y + k) * T, 4, 4); }
      mc.strokeStyle = 'rgba(0,0,0,0.5)'; mc.strokeRect(px + .5, py + .5, T - 1, T - 1); break;
    }
    case 'carpet': {
      mc.fillStyle = '#461a1a'; mc.fillRect(px, py, T, T);
      mc.fillStyle = '#5a2424'; mc.beginPath(); mc.moveTo(px + T / 2, py + 8); mc.lineTo(px + T - 8, py + T / 2); mc.lineTo(px + T / 2, py + T - 8); mc.lineTo(px + 8, py + T / 2); mc.fill();
      mc.fillStyle = 'rgba(200,160,60,0.25)'; mc.fillRect(px + T / 2 - 2, py + T / 2 - 2, 4, 4); break;
    }
    case 'carpetG': {
      mc.fillStyle = '#1c2a1f'; mc.fillRect(px, py, T, T);
      mc.strokeStyle = 'rgba(180,150,70,0.12)'; mc.strokeRect(px + 6.5, py + 6.5, T - 13, T - 13); break;
    }
    case 'lab': {
      mc.fillStyle = '#5a6166'; mc.fillRect(px, py, T, T);
      mc.strokeStyle = '#454b50'; mc.strokeRect(px + .5, py + .5, T / 2, T / 2); mc.strokeRect(px + T / 2 + .5, py + T / 2 + .5, T / 2 - 1, T / 2 - 1);
      if (h > 0.8) { mc.fillStyle = 'rgba(90,10,10,0.5)'; mc.beginPath(); mc.arc(px + h * T, py + (1 - h) * T, 6 + h * 8, 0, 7); mc.fill(); }
      break;
    }
    // 厨房：白瓷砖。年久失修，缝里发黑，偶尔有一块碎了露出底下的水泥
    case 'tile': {
      const dirty = h * 0.10;
      mc.fillStyle = `rgb(${Math.floor(112 - dirty * 300)},${Math.floor(112 - dirty * 300)},${Math.floor(106 - dirty * 300)})`;
      mc.fillRect(px, py, T, T);
      mc.strokeStyle = 'rgba(0,0,0,0.55)'; mc.lineWidth = 1;
      mc.beginPath(); mc.moveTo(px, py + T / 2 + .5); mc.lineTo(px + T, py + T / 2 + .5);
      mc.moveTo(px + T / 2 + .5, py); mc.lineTo(px + T / 2 + .5, py + T); mc.stroke();
      mc.strokeStyle = 'rgba(0,0,0,0.5)'; mc.strokeRect(px + .5, py + .5, T - 1, T - 1);
      if (h > 0.86) { mc.fillStyle = 'rgba(30,26,22,0.55)'; mc.fillRect(px + 4, py + 4, T / 2 - 6, T / 2 - 6); }   // 碎掉的一块
      if (h < 0.06) { mc.fillStyle = 'rgba(90,14,10,0.40)'; mc.beginPath(); mc.ellipse(px + T / 2, py + T / 2, 14, 8, h * 6, 0, 7); mc.fill(); }
      break;
    }
    // 冷库：结霜的水泥地，泛蓝
    case 'frost': {
      mc.fillStyle = '#20262a'; mc.fillRect(px, py, T, T);
      for (let k = 0; k < 7; k++) {
        mc.fillStyle = `rgba(190,215,230,${0.04 + hash(x + k, y) * 0.07})`;
        mc.beginPath(); mc.arc(px + hash(x + k * 7, y) * T, py + hash(x, y + k * 5) * T, 2 + hash(k, x) * 6, 0, 7); mc.fill();
      }
      mc.strokeStyle = 'rgba(150,190,210,0.10)'; mc.strokeRect(px + .5, py + .5, T - 1, T - 1);
      break;
    }
    case 'water': {   // 积水：暗绿的水面 + 零星反光
      mc.fillStyle = '#16211e'; mc.fillRect(px, py, T, T);
      mc.fillStyle = 'rgba(90,130,110,0.18)'; for (let k = 0; k < 3; k++) mc.fillRect(px + hash(x + k * 5, y) * (T - 14), py + hash(x, y + k * 7) * T, 14, 1.5);
      mc.fillStyle = 'rgba(0,0,0,0.25)'; mc.fillRect(px, py + T - 3, T, 3);
      break;
    }
    case 'soil': {   // 温室：湿土 + 碎石小径
      mc.fillStyle = '#231a12'; mc.fillRect(px, py, T, T);
      for (let k = 0; k < 8; k++) { mc.fillStyle = hash(x * 5 + k, y) > .5 ? 'rgba(90,110,70,0.25)' : 'rgba(10,6,3,0.35)'; mc.fillRect(px + hash(x + k * 7, y) * T, py + hash(x, y + k * 5) * T, 3, 3); }
      break;
    }
    case 'grass': {
      mc.fillStyle = '#18241a'; mc.fillRect(px, py, T, T);
      for (let k = 0; k < 10; k++) { mc.fillStyle = hash(x * 3 + k, y) > .5 ? 'rgba(80,120,60,0.25)' : 'rgba(0,0,0,0.25)'; mc.fillRect(px + hash(x + k * 11, y) * T, py + hash(x, y + k * 13) * T, 2, 5); }
      break;
    }
  }
}
// 墙上的窗：月光蓝的玻璃 + 十字窗棂；碎了以后只剩尖角和黑洞
function drawWindow(px, py, broken) {
  mc.fillStyle = '#3a2c1e'; mc.fillRect(px + 4, py + 4, T - 8, T - 8);
  if (!broken) {
    const g = mc.createLinearGradient(px, py, px + T, py + T); g.addColorStop(0, '#2c3e52'); g.addColorStop(1, '#16202c');
    mc.fillStyle = g; mc.fillRect(px + 8, py + 8, T - 16, T - 16);
    mc.fillStyle = 'rgba(190,210,235,0.18)'; mc.fillRect(px + 10, py + 10, 6, T - 20);
    mc.fillStyle = '#3a2c1e'; mc.fillRect(px + T / 2 - 2, py + 8, 4, T - 16); mc.fillRect(px + 8, py + T / 2 - 2, T - 16, 4);
  } else {
    mc.fillStyle = '#050608'; mc.fillRect(px + 8, py + 8, T - 16, T - 16);
    mc.fillStyle = 'rgba(150,180,210,0.45)';
    for (const [a, b, c] of [[[8, 8], [20, 8], [8, 22]], [[T - 8, 8], [T - 8, 20], [T - 18, 8]], [[8, T - 8], [16, T - 8], [8, T - 16]], [[T - 8, T - 8], [T - 22, T - 8], [T - 8, T - 14]]]) {
      mc.beginPath(); mc.moveTo(px + a[0], py + a[1]); mc.lineTo(px + b[0], py + b[1]); mc.lineTo(px + c[0], py + c[1]); mc.fill();
    }
    mc.fillStyle = '#3a2c1e'; mc.fillRect(px + 8, py + T / 2 - 2, 12, 4);
  }
}
function drawTileAt(x, y) {
  const i = y * MW + x, v = grid[i], px = x * T, py = y * T;
  if (v === 0) {
    let edge = false;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const xx = x + dx, yy = y + dy; if (xx >= 0 && yy >= 0 && xx < MW && yy < MH && grid[yy * MW + xx] !== 0) edge = true; }
    mc.fillStyle = edge ? '#241c16' : '#070605'; mc.fillRect(px, py, T, T);
    if (edge) {
      mc.strokeStyle = 'rgba(0,0,0,0.5)';
      for (let k = 0; k < 4; k++) { mc.beginPath(); mc.moveTo(px, py + k * 12 + .5); mc.lineTo(px + T, py + k * 12 + .5); mc.stroke(); const o = (k & 1) ? T / 2 : 0; mc.beginPath(); mc.moveTo(px + o + .5, py + k * 12); mc.lineTo(px + o + .5, py + k * 12 + 12); mc.stroke(); }
      mc.fillStyle = 'rgba(255,230,200,0.05)'; mc.fillRect(px, py, T, 3);
    }
    const win = (LEVEL.windows || []).find(w => w.x === x && w.y === y);
    if (win) drawWindow(px, py, !!(S && S.flags && S.flags['win_' + win.id]));
    return;
  }
  const r = roomOf(x, y);
  drawFloor(r >= 0 ? ROOMS[r].floor : 'wood', x, y, px, py);
  // 墙投影
  if (y > 0 && grid[i - MW] === 0) { const g = mc.createLinearGradient(0, py, 0, py + 16); g.addColorStop(0, 'rgba(0,0,0,0.6)'); g.addColorStop(1, 'rgba(0,0,0,0)'); mc.fillStyle = g; mc.fillRect(px, py, T, 16); }
  if (x > 0 && grid[i - 1] === 0) { const g = mc.createLinearGradient(px, 0, px + 10, 0); g.addColorStop(0, 'rgba(0,0,0,0.45)'); g.addColorStop(1, 'rgba(0,0,0,0)'); mc.fillStyle = g; mc.fillRect(px, py, 10, T); }
  if (v === 2 || v === 3) {
    const vert = grid[i - 1] === 0 && grid[i + 1] === 0; // 左右是墙时，门沿上下方向
    const locked = v === 3;
    const closed = locked || !isDoorOpen(x, y);
    // 门框始终保留；用亮色边线把门从地板里“抠”出来。
    mc.fillStyle = locked ? '#6e2530' : '#9d6735';
    if (vert) { mc.fillRect(px, py, 5, T); mc.fillRect(px + T - 5, py, 5, T); }
    else { mc.fillRect(px, py, T, 5); mc.fillRect(px, py + T - 5, T, 5); }
    if (closed) {
      const grad = vert ? mc.createLinearGradient(px + 6, 0, px + T - 6, 0) : mc.createLinearGradient(0, py + 6, 0, py + T - 6);
      grad.addColorStop(0, locked ? '#4e2025' : '#7d4328'); grad.addColorStop(0.5, locked ? '#9a3c45' : '#c4773e'); grad.addColorStop(1, locked ? '#421b20' : '#67341f');
      mc.fillStyle = grad;
      if (vert) mc.fillRect(px + 6, py + 3, T - 12, T - 6); else mc.fillRect(px + 3, py + 6, T - 6, T - 12);
      // 木板/金属板纹理，避免关闭的门和地板融在一起。
      mc.strokeStyle = locked ? 'rgba(255,190,190,0.45)' : 'rgba(255,220,150,0.55)'; mc.lineWidth = 1;
      for (let k = 1; k < 4; k++) { mc.beginPath(); if (vert) { mc.moveTo(px + 7, py + k * 12); mc.lineTo(px + T - 7, py + k * 12); } else { mc.moveTo(px + k * 12, py + 7); mc.lineTo(px + k * 12, py + T - 7); } mc.stroke(); }
      mc.strokeStyle = locked ? '#ffb1b8' : '#ffd27a'; mc.lineWidth = 2; mc.strokeRect(px + 6, py + 6, T - 12, T - 12); mc.lineWidth = 1;
      // 中央把手/锁牌：锁门是红色锁牌，普通关门是金色把手。
      mc.fillStyle = locked ? '#ffe1e1' : '#ffe09a'; mc.beginPath(); mc.arc(px + T / 2, py + T / 2, locked ? 6 : 4, 0, 7); mc.fill();
      mc.fillStyle = locked ? '#8f2632' : '#6b3d1b'; mc.fillRect(px + T / 2 - 2, py + T / 2 - 2, 4, 7);
    } else {
      // 开门后显示黑色门洞和金绿色门槛，和关闭状态形成明确对比。
      mc.fillStyle = 'rgba(4,3,3,0.92)';
      if (vert) mc.fillRect(px + 5, py + 2, T - 10, T - 4); else mc.fillRect(px + 2, py + 5, T - 4, T - 10);
      mc.strokeStyle = '#9cbd72'; mc.lineWidth = 2;
      if (vert) { mc.beginPath(); mc.moveTo(px + 6, py + 4); mc.lineTo(px + 6, py + T - 4); mc.moveTo(px + T - 6, py + 4); mc.lineTo(px + T - 6, py + T - 4); mc.stroke(); }
      else { mc.beginPath(); mc.moveTo(px + 4, py + 6); mc.lineTo(px + T - 4, py + 6); mc.moveTo(px + 4, py + T - 6); mc.lineTo(px + T - 4, py + T - 6); mc.stroke(); }
      mc.lineWidth = 1;
    }
  }
}
function drawFurniture() {
  for (const [x, y, w, h, t] of FURN) {
    const px = x * T, py = y * T, pw = w * T, ph = h * T;
    mc.save();
    mc.fillStyle = 'rgba(0,0,0,0.5)'; mc.fillRect(px + 4, py + 6, pw, ph);
    if (t === 'table') {
      mc.fillStyle = '#4a2e1b'; mc.fillRect(px + 2, py + 4, pw - 4, ph - 8);
      mc.fillStyle = '#7b7564'; mc.fillRect(px + 10, py + 12, pw - 20, ph - 24);
      for (let k = 0; k < 5; k++) { mc.fillStyle = '#ccc'; mc.beginPath(); mc.arc(px + 30 + k * 55, py + 26, 9, 0, 7); mc.fill(); mc.beginPath(); mc.arc(px + 30 + k * 55, py + ph - 26, 9, 0, 7); mc.fill(); mc.fillStyle = '#6a1010'; mc.beginPath(); mc.arc(px + 30 + k * 55, py + 26, 5, 0, 7); mc.fill(); }
      for (let k = 0; k < 3; k++) { mc.fillStyle = '#e8dcc0'; mc.fillRect(px + 70 + k * 70, py + ph / 2 - 3, 6, 6); }
      mc.fillStyle = 'rgba(120,0,0,0.6)'; mc.beginPath(); mc.ellipse(px + 200, py + 50, 30, 14, .4, 0, 7); mc.fill();
    } else if (t === 'shelf') {
      mc.fillStyle = '#2e1d10'; mc.fillRect(px, py + 6, pw, ph - 12);
      for (let k = 0; k < pw / 6; k++) { mc.fillStyle = ['#5a1e1e', '#1e3a5a', '#3a4a1e', '#5a4a1e', '#3a1e4a', '#222'][Math.floor(hash(x + k, y) * 6)]; mc.fillRect(px + k * 6 + 1, py + 9 + hash(k, y) * 4, 5, ph - 22); }
    } else if (t === 'statue') {
      mc.fillStyle = '#4b4845'; mc.fillRect(px + 6, py + 6, pw - 12, ph - 12);
      mc.fillStyle = '#6e6a66'; mc.beginPath(); mc.arc(px + pw / 2, py + ph / 2, 28, 0, 7); mc.fill();
      mc.fillStyle = '#86817c'; mc.beginPath(); mc.arc(px + pw / 2, py + ph / 2 - 4, 13, 0, 7); mc.fill();
      mc.fillStyle = '#5d5955'; mc.fillRect(px + pw / 2 - 34, py + ph / 2 - 5, 68, 10);
    } else if (t === 'bench') {
      mc.fillStyle = '#6f797f'; mc.fillRect(px + 2, py + 6, pw - 4, ph - 12);
      mc.fillStyle = '#89939a'; mc.fillRect(px + 2, py + 6, pw - 4, 4);
      for (let k = 0; k < 8; k++) { mc.fillStyle = ['#3fc46a', '#c43f3f', '#3f8fc4', '#d9c040'][k % 4]; mc.beginPath(); mc.arc(px + 20 + k * 28, py + ph / 2, 5, 0, 7); mc.fill(); }
      mc.fillStyle = '#222'; mc.fillRect(px + 150, py + 12, 30, 22);
      mc.fillStyle = '#2f6'; mc.fillRect(px + 153, py + 15, 24, 14);
    } else if (t === 'bust') {
      const cx = px + T / 2, cy = py + T / 2;
      mc.fillStyle = '#3b3833'; mc.fillRect(px + 6, py + 6, T - 12, T - 12);            // 方形基座
      mc.fillStyle = '#56524c'; mc.fillRect(px + 9, py + 9, T - 18, T - 18);
      mc.fillStyle = '#b8b2a8'; mc.beginPath(); mc.ellipse(cx, cy + 5, 13, 9, 0, 0, 7); mc.fill();  // 肩
      mc.fillStyle = '#cfc8bc'; mc.beginPath(); mc.arc(cx, cy - 4, 8.5, 0, 7); mc.fill();           // 头
      mc.fillStyle = 'rgba(0,0,0,0.30)'; mc.beginPath(); mc.arc(cx, cy - 4, 8.5, 0.6, 2.5); mc.fill();
      mc.fillStyle = '#c9a545'; mc.fillRect(px + 13, py + T - 12, T - 26, 4);            // 铜名牌（发亮，提示可交互）
      mc.fillStyle = '#6b5a2a'; mc.fillRect(px + 13, py + T - 12, T - 26, 1);
    } else if (t === 'bed') {
      // 四柱床：床架、凌乱的被褥、枕头，床沿一道干掉的血迹
      mc.fillStyle = '#3a2214'; mc.fillRect(px + 2, py + 2, pw - 4, ph - 4);
      mc.fillStyle = '#6e2a2a'; mc.fillRect(px + 8, py + 8, pw - 16, ph - 16);
      mc.fillStyle = '#8a3a36'; mc.beginPath(); mc.moveTo(px + 30, py + 12); mc.lineTo(px + pw - 12, py + 20); mc.lineTo(px + pw - 20, py + ph - 14); mc.lineTo(px + 40, py + ph - 10); mc.fill();
      mc.fillStyle = '#d8cfbc'; mc.fillRect(px + 12, py + 14, 18, 26); mc.fillRect(px + 12, py + ph - 40, 18, 26);
      for (const [cx, cy] of [[px + 6, py + 6], [px + pw - 6, py + 6], [px + 6, py + ph - 6], [px + pw - 6, py + ph - 6]]) { mc.fillStyle = '#22140a'; mc.beginPath(); mc.arc(cx, cy, 5, 0, 7); mc.fill(); }
      mc.fillStyle = 'rgba(100,10,8,0.6)'; mc.beginPath(); mc.ellipse(px + pw - 16, py + ph / 2, 8, 22, 0, 0, 7); mc.fill();
    } else if (t === 'wine') {
      // 酒架：一格格的瓶口，有几格空了，地上一滩深色的酒
      mc.fillStyle = '#2a1a0e'; mc.fillRect(px + 2, py + 4, pw - 4, ph - 8);
      for (let k = 0; k * 12 < pw - 12; k++) for (let j = 0; j < 2; j++) {
        if (hash(x + k, y + j) < 0.25) continue;
        mc.fillStyle = hash(k, j + y) < 0.5 ? '#3d1418' : '#1f3320'; mc.beginPath(); mc.arc(px + 10 + k * 12, py + 16 + j * 16, 4.5, 0, 7); mc.fill();
      }
      mc.fillStyle = 'rgba(70,10,20,0.55)'; mc.beginPath(); mc.ellipse(px + pw * 0.6, py + ph + 6, 26, 8, 0, 0, 7); mc.fill();
    } else if (t === 'wardrobe') {
      mc.fillStyle = '#34200f'; mc.fillRect(px + 2, py + 4, pw - 4, ph - 8);
      mc.strokeStyle = '#1a0f06'; mc.lineWidth = 2; mc.beginPath(); mc.moveTo(px + pw / 2, py + 6); mc.lineTo(px + pw / 2, py + ph - 6); mc.stroke();
      mc.fillStyle = '#b89a50'; mc.fillRect(px + pw / 2 - 7, py + ph / 2 - 2, 4, 4); mc.fillRect(px + pw / 2 + 3, py + ph / 2 - 2, 4, 4);
    } else if (t === 'desk') {
      mc.fillStyle = '#5a3b20'; mc.fillRect(px + 2, py + 6, pw - 4, ph - 12);
      mc.fillStyle = '#e6dcc6'; mc.save(); mc.translate(px + 30, py + 24); mc.rotate(.2); mc.fillRect(-9, -12, 18, 24); mc.restore();
      mc.fillStyle = '#d9c9a0'; mc.beginPath(); mc.arc(px + pw - 20, py + 22, 7, 0, 7); mc.fill();
    } else if (t === 'hedge') {
      for (let k = 0; k < w * 3; k++) { mc.fillStyle = k & 1 ? '#1f3a1c' : '#284a22'; mc.beginPath(); mc.arc(px + 8 + k * 16, py + T / 2 + (hash(k, y) - .5) * 10, 18, 0, 7); mc.fill(); }
    } else if (t === 'counter') {
      // 厨房料理台：不锈钢台面 + 台下柜门 + 散落的刀具和没收拾的餐具
      mc.fillStyle = '#3a3d40'; mc.fillRect(px + 2, py + 5, pw - 4, ph - 10);
      mc.fillStyle = '#6b7276'; mc.fillRect(px + 2, py + 5, pw - 4, 6);
      mc.fillStyle = '#4e5458'; mc.fillRect(px + 2, py + ph - 13, pw - 4, 8);
      for (let k = 0; k * 46 < pw - 20; k++) {                       // 柜门缝
        mc.strokeStyle = 'rgba(0,0,0,0.5)'; mc.lineWidth = 2;
        mc.beginPath(); mc.moveTo(px + 12 + k * 46, py + ph - 12); mc.lineTo(px + 12 + k * 46, py + ph - 6); mc.stroke();
      }
      for (let k = 0; k * 60 < pw - 30; k++) {                       // 台面上的刀
        const bx = px + 22 + k * 60, by = py + 16 + hash(x + k, y) * 8;
        mc.fillStyle = '#b9c0c4'; mc.save(); mc.translate(bx, by); mc.rotate(hash(k, y) * 1.6 - 0.8);
        mc.fillRect(-13, -2, 20, 4); mc.fillStyle = '#2a1f16'; mc.fillRect(7, -3, 9, 6); mc.restore();
      }
      mc.fillStyle = 'rgba(110,12,8,0.55)';                          // 台沿淌下来的血
      mc.beginPath(); mc.ellipse(px + pw * 0.62, py + ph - 9, 22, 7, 0, 0, 7); mc.fill();
    } else if (t === 'stove') {
      // 灶台：四个炉眼，一口烧干的锅
      mc.fillStyle = '#2b2d2f'; mc.fillRect(px + 3, py + 5, pw - 6, ph - 10);
      mc.fillStyle = '#17191a'; mc.fillRect(px + 5, py + 7, pw - 10, ph - 14);
      for (let k = 0; k < 4; k++) {
        const cx = px + pw * (k % 2 ? 0.68 : 0.32), cy = py + ph * (k < 2 ? 0.34 : 0.68);
        mc.strokeStyle = '#4a4e50'; mc.lineWidth = 3; mc.beginPath(); mc.arc(cx, cy, 13, 0, 7); mc.stroke();
        mc.strokeStyle = '#3a3e40'; mc.beginPath(); mc.arc(cx, cy, 7, 0, 7); mc.stroke();
      }
      mc.fillStyle = '#54514c'; mc.beginPath(); mc.arc(px + pw * 0.32, py + ph * 0.34, 16, 0, 7); mc.fill();
      mc.fillStyle = '#231c14'; mc.beginPath(); mc.arc(px + pw * 0.32, py + ph * 0.34, 12, 0, 7); mc.fill();
    } else if (t === 'rack') {
      // 冷库的挂肉架：钩子上吊着东西。远看分不清是肉还是别的
      mc.fillStyle = '#4a4e52'; mc.fillRect(px + 2, py + 4, pw - 4, 6);
      for (let k = 0; k * 40 < pw - 16; k++) {
        const hx = px + 20 + k * 40;
        mc.strokeStyle = '#7d848a'; mc.lineWidth = 3;
        mc.beginPath(); mc.moveTo(hx, py + 8); mc.lineTo(hx, py + 20); mc.stroke();          // 钩子
        mc.fillStyle = ['#5c2a24', '#6b322a', '#4a211c'][k % 3];
        mc.beginPath(); mc.ellipse(hx, py + 30, 11, 17, 0, 0, 7); mc.fill();                  // 吊着的肉
        mc.fillStyle = 'rgba(230,240,245,0.10)'; mc.beginPath(); mc.ellipse(hx - 3, py + 25, 4, 7, 0, 0, 7); mc.fill();  // 霜
        mc.fillStyle = 'rgba(90,12,8,0.5)'; mc.beginPath(); mc.ellipse(hx, py + ph - 6, 9, 4, 0, 0, 7); mc.fill();       // 地上的血
      }
    } else if (t === 'tankpit') {   // 污水沉淀池：铁护栏围着一池更深的黑水
      mc.fillStyle = '#0c1412'; mc.fillRect(px + 4, py + 4, pw - 8, ph - 8);
      mc.fillStyle = 'rgba(80,120,90,0.2)'; for (let k = 0; k < 6; k++) mc.fillRect(px + 8 + hash(x + k, y) * (pw - 30), py + 8 + hash(k, y) * (ph - 16), 18, 1.5);
      mc.strokeStyle = '#6a7478'; mc.lineWidth = 3; mc.strokeRect(px + 3, py + 3, pw - 6, ph - 6);
      mc.lineWidth = 1; for (let k = 12; k < pw - 6; k += 16) { mc.beginPath(); mc.moveTo(px + k, py + 3); mc.lineTo(px + k, py + 8); mc.moveTo(px + k, py + ph - 3); mc.lineTo(px + k, py + ph - 8); mc.stroke(); }
    } else if (t === 'freezer') {   // 冷柜：白色柜体 + 结霜的玻璃门
      mc.fillStyle = '#b8c4c8'; mc.fillRect(px + 2, py + 6, pw - 4, ph - 10);
      mc.fillStyle = 'rgba(200,230,245,0.7)'; for (let k = 0; k < w; k++) mc.fillRect(px + k * T + 6, py + 10, T - 12, ph - 20);
      mc.strokeStyle = '#6a7a80'; mc.strokeRect(px + 2.5, py + 6.5, pw - 5, ph - 11);
    } else if (t === 'tank') {   // 培养槽 / 收容舱：玻璃圆柱 + 里面的轮廓
      const cx = px + pw / 2, cy = py + ph / 2, r = Math.min(pw, ph) / 2 - 4;
      mc.fillStyle = '#1e2a26'; mc.beginPath(); mc.arc(cx, cy, r + 3, 0, 7); mc.fill();
      mc.fillStyle = hash(x, y) > .4 ? 'rgba(60,160,110,0.55)' : 'rgba(20,30,28,0.9)'; mc.beginPath(); mc.arc(cx, cy, r - 2, 0, 7); mc.fill();
      mc.fillStyle = 'rgba(20,10,10,0.7)'; mc.beginPath(); mc.ellipse(cx, cy + 2, r * .35, r * .6, 0, 0, 7); mc.fill();
      mc.strokeStyle = '#8a9a94'; mc.lineWidth = 3; mc.beginPath(); mc.arc(cx, cy, r + 1, 0, 7); mc.stroke();
      mc.fillStyle = 'rgba(220,255,240,0.2)'; mc.fillRect(cx - r * .6, cy - r * .6, 4, r);
    } else if (t === 'train') {   // 货运列车：一节节车厢
      const n = Math.max(1, Math.round(pw / (T * 6)));
      for (let k = 0; k < n; k++) {
        const x0 = px + k * pw / n + 4, w0 = pw / n - 8;
        mc.fillStyle = '#3a3f44'; mc.fillRect(x0, py + 6, w0, ph - 12);
        mc.fillStyle = '#23272b'; for (let j = 12; j < w0 - 8; j += 16) mc.fillRect(x0 + j, py + 10, 3, ph - 20);
        mc.fillStyle = '#8a6a2a'; mc.fillRect(x0, py + ph / 2 - 3, w0, 6);
      }
      mc.fillStyle = '#555'; mc.fillRect(px, py + ph - 4, pw, 3); mc.fillRect(px, py + 3, pw, 3);
    } else if (t === 'piano') {
      mc.fillStyle = '#0e0b0a'; mc.beginPath(); mc.moveTo(px + 4, py + 4); mc.lineTo(px + pw - 4, py + 4); mc.quadraticCurveTo(px + pw - 4, py + ph - 4, px + pw * .45, py + ph - 4); mc.lineTo(px + 4, py + ph - 4); mc.closePath(); mc.fill();
      mc.strokeStyle = '#3a2e28'; mc.lineWidth = 2; mc.stroke();
      mc.fillStyle = '#ddd6c8'; mc.fillRect(px + 6, py + 6, 10, ph - 12);
      mc.fillStyle = '#111'; for (let k = 0; k < (ph - 12) / 5; k++) mc.fillRect(px + 6, py + 8 + k * 5, 6, 2);
    } else if (t === 'gramo') {
      mc.fillStyle = '#4a2e1b'; mc.fillRect(px + 10, py + 22, 28, 20);
      mc.fillStyle = '#b08a3a'; mc.beginPath(); mc.moveTo(px + 24, py + 26); mc.lineTo(px + 8, py + 4); mc.lineTo(px + 40, py + 4); mc.closePath(); mc.fill();
      mc.fillStyle = '#1a1208'; mc.beginPath(); mc.arc(px + 24, py + 32, 6, 0, 7); mc.fill();
    } else if (t === 'planter') {
      mc.fillStyle = '#4a3522'; mc.fillRect(px + 2, py + 8, pw - 4, ph - 14);
      mc.fillStyle = '#2a1c10'; mc.fillRect(px + 5, py + 11, pw - 10, ph - 20);
      for (let k = 0; k < pw / 12; k++) { const cx = px + 8 + k * 12, cy = py + 18; mc.fillStyle = hash(x + k, y) > .7 ? '#7a2a24' : '#2f5a2a'; mc.beginPath(); mc.arc(cx, cy, 6 + hash(k, y) * 3, 0, 7); mc.fill(); }
    } else if (t === 'pit') {   // 熔渣坑：往下看是暗红的余烬（能看过去，走不过去）
      mc.fillStyle = '#120806'; mc.fillRect(px, py, pw, ph);
      for (let k = 0; k < w * h * 3; k++) { const hx = hash(x * 13 + k, y * 7 + k); mc.fillStyle = `rgba(255,${60 + Math.floor(hx * 60)},10,${0.08 + hx * 0.18})`; mc.beginPath(); mc.arc(px + hash(k, x) * pw, py + hash(y, k) * ph, 4 + hx * 10, 0, 7); mc.fill(); }
      mc.strokeStyle = '#6a5a40'; mc.lineWidth = 3; mc.strokeRect(px + 1.5, py + 1.5, pw - 3, ph - 3);
      mc.fillStyle = '#b8962a'; for (let k = 0; k < pw; k += 16) { mc.fillRect(px + k, py, 8, 3); mc.fillRect(px + k, py + ph - 3, 8, 3); }
    } else if (t === 'furnace') {   // 焚化炉炉体：厚铁壳 + 发红的炉口
      mc.fillStyle = '#2e2a28'; mc.fillRect(px + 2, py + 2, pw - 4, ph - 4);
      mc.strokeStyle = '#555'; mc.lineWidth = 3; mc.strokeRect(px + 4, py + 4, pw - 8, ph - 8);
      const g = mc.createRadialGradient(px + pw / 2, py + ph - 14, 4, px + pw / 2, py + ph - 14, pw * 0.4);
      g.addColorStop(0, 'rgba(255,190,80,0.95)'); g.addColorStop(1, 'rgba(160,30,0,0.2)');
      mc.fillStyle = g; mc.fillRect(px + pw * 0.2, py + ph - 26, pw * 0.6, 20);
      mc.fillStyle = '#1a1614'; for (let k = 0; k < 5; k++) mc.fillRect(px + pw * 0.2 + k * pw * 0.12, py + ph - 26, 3, 20);
    } else if (t === 'conveyor') {   // 传送带：黑色胶带 + 一节节滚筒，两侧是黄色护栏
      mc.fillStyle = '#4a4d50'; mc.fillRect(px, py + 4, pw, ph - 8);
      mc.fillStyle = '#1c1d1f'; mc.fillRect(px + 3, py + 9, pw - 6, ph - 18);
      mc.strokeStyle = 'rgba(120,120,120,0.35)'; mc.lineWidth = 1;
      for (let k = px + 8; k < px + pw - 4; k += 10) { mc.beginPath(); mc.moveTo(k + .5, py + 10); mc.lineTo(k + .5, py + ph - 10); mc.stroke(); }
      mc.fillStyle = '#b8962a'; mc.fillRect(px, py + 3, pw, 3); mc.fillRect(px, py + ph - 6, pw, 3);
      if (hash(x, y) > 0.5) { mc.fillStyle = '#6a5030'; mc.fillRect(px + pw * 0.4, py + 12, 16, ph - 24); }   // 一只没送完的纸箱
    } else if (t === 'machine') {   // 生产机台：灰绿色机身、仪表盘、警示条纹
      mc.fillStyle = '#3c4640'; mc.fillRect(px + 3, py + 3, pw - 6, ph - 6);
      mc.strokeStyle = '#222a26'; mc.lineWidth = 2; mc.strokeRect(px + 4, py + 4, pw - 8, ph - 8);
      mc.fillStyle = '#1a1e1c'; mc.fillRect(px + 10, py + 10, pw - 20, ph * 0.35);
      mc.fillStyle = hash(x, y) > .5 ? '#a03020' : '#30a040'; mc.beginPath(); mc.arc(px + pw - 14, py + ph - 14, 4, 0, 7); mc.fill();
      mc.fillStyle = '#b8962a'; for (let k = 0; k < pw - 8; k += 12) mc.fillRect(px + 4 + k, py + ph - 9, 6, 4);
    } else if (t === 'crate') {
      mc.fillStyle = '#5b4527'; mc.fillRect(px + 3, py + 3, pw - 6, ph - 6);
      mc.strokeStyle = '#3a2a14'; mc.lineWidth = 3; mc.strokeRect(px + 5, py + 5, pw - 10, ph - 10);
      mc.beginPath(); mc.moveTo(px + 5, py + 5); mc.lineTo(px + pw - 5, py + ph - 5); mc.stroke();
    }
    mc.restore();
  }
  // 停机坪（只有配置了 pad 的地图才画）
  if (!PAD) return;
  mc.save(); mc.translate(PAD.x, PAD.y);
  mc.fillStyle = '#3a3d40'; mc.beginPath(); mc.arc(0, 0, 80, 0, 7); mc.fill();
  mc.strokeStyle = '#c9b43a'; mc.lineWidth = 5; mc.beginPath(); mc.arc(0, 0, 68, 0, 7); mc.stroke();
  mc.fillStyle = '#ddd'; mc.fillRect(-26, -32, 12, 64); mc.fillRect(14, -32, 12, 64); mc.fillRect(-14, -6, 28, 12);
  mc.restore();
}
function renderMap() {
  // 地图尺寸变了就重建画布（赋值 width/height 会清空内容，下面本来就要全部重画）
  if (mapC.width !== MW * T || mapC.height !== MH * T) { mapC.width = MW * T; mapC.height = MH * T; }
  mc.fillStyle = '#050404'; mc.fillRect(0, 0, mapC.width, mapC.height);
  for (let y = 0; y < MH; y++) for (let x = 0; x < MW; x++) drawTileAt(x, y);
  drawFurniture();
}
