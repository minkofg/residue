'use strict';
// 设置：音量、立体声 / 单声道、画面颗粒、全屏。改动在离开设置界面时保存（见 ui/menus.js）。

const SETTINGS_DEFAULT = Object.freeze({ master: 0.8, sfx: 1, ambient: 1, stereo: true, grain: true, fullscreen: false });
const MASTER_BASE = 0.55;  // 总音量 100% 时的实际增益（原来的固定值）
let SETTINGS = { ...SETTINGS_DEFAULT };

// 读进来的设置可能是旧版本、被手改过或者坏的：只保留认识的字段，数值限制在 0–1 并取整到 10%
function sanitizeSettings(o) {
  const s = { ...SETTINGS_DEFAULT };
  if (!o || typeof o !== 'object') return s;
  for (const k of Object.keys(SETTINGS_DEFAULT)) {
    const d = SETTINGS_DEFAULT[k], v = o[k];
    if (typeof v !== typeof d) continue;
    s[k] = typeof d === 'number' ? (Number.isFinite(v) ? Math.round(clamp(v, 0, 1) * 10) / 10 : d) : v;
  }
  return s;
}
function loadSettings() {
  let raw = '';
  try { raw = RESIDUE_API ? RESIDUE_API.loadSettings() : lsGet(LS_SETTINGS); } catch (e) { raw = ''; }
  try { SETTINGS = sanitizeSettings(JSON.parse(raw || '{}')); } catch (e) { SETTINGS = { ...SETTINGS_DEFAULT }; }
  if (RESIDUE_API && RESIDUE_API.isFullscreen) { try { SETTINGS.fullscreen = !!RESIDUE_API.isFullscreen(); } catch (e) { /* 窗口还没建好 */ } }
  else SETTINGS.fullscreen = !!(typeof document !== 'undefined' && document.fullscreenElement);  // 浏览器没法自动进全屏
  applySettings();
}
function saveSettings() {
  const d = JSON.stringify(SETTINGS);
  try { if (RESIDUE_API) RESIDUE_API.saveSettings(d); else lsSet(LS_SETTINGS, d); } catch (e) { /* 设置存不下不影响游戏 */ }
}
function applySettings() {
  AU.panScale = SETTINGS.stereo ? 1 : 0;
  if (!AU.c) return;
  AU.m.gain.value = MASTER_BASE * SETTINGS.master;
  if (AU.sfxBus) AU.sfxBus.gain.value = SETTINGS.sfx;
  if (AU.ambBus) AU.ambBus.gain.value = SETTINGS.ambient;
}
function setFullscreen(on) {
  SETTINGS.fullscreen = !!on;
  try {
    if (RESIDUE_API) RESIDUE_API.setFullscreen(!!on);
    else if (on) document.documentElement.requestFullscreen(); else if (document.fullscreenElement) document.exitFullscreen();
  } catch (e) { /* 浏览器拒绝时保持原状 */ }
}
// F11 / Alt+Enter / 浏览器 Esc 退出全屏时，同步设置里的开关
if (RESIDUE_API && RESIDUE_API.onFullscreen) RESIDUE_API.onFullscreen(v => { SETTINGS.fullscreen = v; saveSettings(); });
else if (typeof document !== 'undefined') document.addEventListener('fullscreenchange', () => { SETTINGS.fullscreen = !!document.fullscreenElement; });
loadSettings();
