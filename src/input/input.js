'use strict';
// 键盘、鼠标输入

addEventListener('keydown', e => {
  if (!booted) return;   // 还在加载（见 game/globals.js）
  keys[e.code] = true;
  if (['Tab', 'Space', 'ArrowUp', 'ArrowDown'].includes(e.code)) e.preventDefault();

  // 系统自动重复只保留为“按住”状态，不重复执行切换、交互、攻击等动作。
  if (e.repeat) return;
  auInit();
  if (mode === 'title' || mode === 'pause' || isMenuMode(mode)) { menuKey(e); return; }  // 菜单（ui/menus.js）
  if (mode === 'intro') { if (modeT > 0.4) endIntro(); return; }   // 序章：任意键跳过（第二次玩的人不该被强迫再看）
  if (mode === 'file') { if (modeT > 0.3 && ['KeyE', 'Enter', 'Escape', 'Tab'].includes(e.code)) { mode = afterFile; } return; }
  if (mode === 'dead') { if (modeT > 1.2) { if (e.code === 'Enter') { deadCanLoad() ? loadSlot(CUR_SLOT) : startGame(true); } else if (e.code === 'KeyR') { CUR_SLOT = null; startGame(true); } else if (e.code === 'Escape') goTitle(); } return; }
  if (mode === 'win') { if (modeT > 2 && e.code === 'Enter') goTitle(); return; }
  if (mode === 'inv') { invKey(e); return; }
  if (mode === 'safe') { safeKey(e); return; }
  if (mode === 'map') { if (['KeyM', 'Escape', 'Tab'].includes(e.code)) mode = 'play'; return; }
  if (mode !== 'play') return;
  const p = S.p;
  if (isGrabbed()) {   // 被僵尸抓着：只能连按 E 挣脱，或者按 G 塞投掷物（ai/grab.js）
    if (e.code === 'KeyE') grabMash(); else if (e.code === 'KeyG') grabThrow(); else if (e.code === 'Escape') openPause();
    return;
  }
  switch (e.code) {
    case 'KeyE': interact(); break;
    case 'KeyT': aimLock = !aimLock; msg(aimLock ? '持续瞄准：开（左键直接射击，再按 T 关闭）' : '持续瞄准：关', 2.5); break;
    case 'KeyR': reload(); break;
    case 'Digit6': if (!e.shiftKey) equipRail(); break;   // 电磁炮（最终战）
    case 'Digit1': case 'Digit2': case 'Digit3': case 'Digit4': case 'Digit5':
      if (PLAYTEST_WARP && e.shiftKey) { warpHotkey(+e.code.slice(5) - 1); break; }   // Shift+数字 = 试玩跳转（当前这一批，见 game/warp.js 的 WARP_STAGE）
      selectWeaponSlot(+e.code.slice(5) - 1); break;
    case 'KeyG': throwItem(); break;     // 投掷物（combat/throwables.js）
    case 'KeyX': cycleThrow(); break;    // 切换手雷 / 闪光弹
    case 'KeyQ': quickHeal(); break;
    case 'KeyH': useSpray(); break;
    case 'KeyF': case 'KeyV': knife(); break;
    case 'Tab': case 'KeyI': openInventory(); break;
    case 'KeyM': mode = 'map'; break;
    case 'KeyP': PERF.on = !PERF.on; msg(PERF.on ? '帧率叠层：开（再按 P 关闭）' : '帧率叠层：关', 2); break;
    case 'Escape': openPause(); break;
    case 'F9': if (DEBUG) { spawnExecutioner(); msg('[调试] 处刑者已登场', 2); } break;
    // 试玩跳转见下方 Shift+数字的分支（game/warp.js）
  }
});
addEventListener('keyup', e => { keys[e.code] = false; });
cv.addEventListener('mousemove', e => { mouse.x = e.clientX; mouse.y = e.clientY; if (!booted) return; if (mode === 'title' || mode === 'pause' || isMenuMode(mode)) menuHover(e.clientX, e.clientY); });
addEventListener('mousedown', e => {
  if (e.button === 2) e.preventDefault();
  if (!booted) return;
  auInit();
  if (e.button === 0) { mouse.l = true; mouse.lp = true; }
  if (e.button === 2) mouse.r = true;
  if ((mode === 'title' || mode === 'pause' || isMenuMode(mode)) && e.button === 0) menuClick(e.clientX, e.clientY);
  else if (mode === 'intro' && modeT > 0.4) endIntro();
  else if (mode === 'file' && modeT > 0.3) mode = afterFile;
  else if (mode === 'inv' && e.button === 0) invClick(e.clientX, e.clientY);
});
// 鼠标滚轮：向下 = 下一把，向上 = 上一把（只在已拥有的武器之间循环）
addEventListener('wheel', e => {
  if (booted && mode === 'inv' && e.deltaY) { e.preventDefault(); invWheel(e.deltaY > 0 ? 1 : -1); return; }   // 物品栏：滚动文件列表 / 格子
  if (!booted || mode !== 'play' || !e.deltaY) return;
  e.preventDefault();
  cycleWeapon(e.deltaY > 0 ? 1 : -1);
}, { passive: false });
addEventListener('mouseup', e => { if (e.button === 2) e.preventDefault(); if (e.button === 0) mouse.l = false; if (e.button === 2) mouse.r = false; });
// 全局屏蔽右键菜单（捕获阶段，覆盖 window/document/body/canvas）
const blockCtx = e => { e.preventDefault(); e.stopPropagation(); return false; };
[window, document, document.body, cv].forEach(t => { t.addEventListener('contextmenu', blockCtx, { capture: true }); t.addEventListener('auxclick', e => { if (e.button === 2) blockCtx(e); }, { capture: true }); });
document.oncontextmenu = () => false; document.body.oncontextmenu = () => false;
addEventListener('blur', () => { for (const k in keys) keys[k] = false; mouse.l = mouse.r = false; if (booted && mode === 'play') openPause(); });
