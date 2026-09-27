'use strict';
// 画布、分辨率与窗口缩放

// =====================================================================
//  残响之馆 RESIDUE —— 一款类《生化危机》的俯视角生存恐怖游戏
// =====================================================================
const cv = document.getElementById('c'), ctx = cv.getContext('2d');
const dark = document.createElement('canvas'), dctx = dark.getContext('2d');
let W = 0, H = 0, DPR = 1, vignette = null;
function resize() {
  DPR = Math.min(window.devicePixelRatio || 1, 2);
  W = innerWidth; H = innerHeight;
  cv.width = W * DPR; cv.height = H * DPR;
  cv.style.width = W + 'px'; cv.style.height = H + 'px';
  dark.width = cv.width; dark.height = cv.height;
  vignette = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.3, W / 2, H / 2, Math.max(W, H) * 0.75);
  vignette.addColorStop(0, 'rgba(0,0,0,0)');
  vignette.addColorStop(1, 'rgba(0,0,0,0.75)');
}
addEventListener('resize', resize);
