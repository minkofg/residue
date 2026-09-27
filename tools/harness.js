'use strict';
// 在 Node 里加载游戏（假画布、假音频），供自动测试和调试脚本使用：
//   const { R, SOURCES } = require('./harness');
const vm = require('node:vm');

// ---------------------------------------------------------------- 可复现的随机数
// 游戏里到处用 Math.random（敌人速度、冲刺判定、补怪点…）。用真随机跑测试意味着
// 「同一份代码这次过下次挂」——实测后庭院那条 65 秒的补怪流程，玩家有概率在走到
// 停机坪之前就被打死，5 次里挂 1 次。换成定种子的 PRNG（mulberry32），
// 同一个种子永远得到同一串数，测试结果就只取决于代码。
let __seed = 0x9E3779B9;
function setSeed(n) { __seed = (n >>> 0) || 1; }
Math.random = function () {
  __seed = (__seed + 0x6D2B79F5) >>> 0;
  let t = __seed;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
setSeed(20260926);
const noop = () => {};
const canvasCtx = new Proxy(function () {}, {
  get(_t, key) {
    if (key === 'measureText') return () => ({ width: 10 });
    if (key === 'getChannelData') return () => new Float32Array(32);
    if (key === 'data') return new Uint8Array(32);
    return () => canvasCtx;
  },
  set: () => true,
  apply: () => canvasCtx,
});
const canvas = () => ({ width: 0, height: 0, style: {}, getContext: () => canvasCtx, addEventListener: noop });
global.window = global;
global.innerWidth = 1280; global.innerHeight = 720; global.devicePixelRatio = 1;
global.addEventListener = noop; global.removeEventListener = noop;
global.document = { getElementById: () => canvas(), createElement: canvas, addEventListener: noop, body: { addEventListener: noop } };
global.performance = { now: () => 0 };
global.requestAnimationFrame = noop;
// 内存版 localStorage：存档槽和设置在浏览器里就存在这里
const lsMem = new Map();
global.localStorage = { getItem: k => (lsMem.has(k) ? lsMem.get(k) : null), setItem: (k, v) => { lsMem.set(k, String(v)); }, removeItem: k => { lsMem.delete(k); }, clear: () => lsMem.clear(), _mem: lsMem };

// 与浏览器一致：按 index.html 的顺序逐个加载，每个文件是独立脚本（共享全局作用域）。
// 这样如果某个文件在加载时用到了后面文件才定义的函数，测试会直接报错。
const { gameSources } = require('./sources');
const SOURCES = gameSources();
for (const s of SOURCES) vm.runInThisContext(s.code, { filename: 'src/' + s.rel });
// 测试用导出：let 变量用 getter/setter，函数和常量直接引用
vm.runInThisContext(`global.__residue = {
  get S(){return S},
  set S(v){S=v},
  get mode(){return mode},
  get cam(){return cam},
  get uiRects(){return uiRects},
  get fileView(){return fileView},
  get afterFile(){return afterFile},
  invClick, setInvTab, fileMapName, invWheel,
  get W(){return W},
  get H(){return H},
  heliBoarding,
  get modeT(){return modeT},
  set modeT(v){modeT=v},
  set mode(v){mode=v},
  get SAVE(){return SAVE},
  get grid(){return grid},
  get flow(){return flow},
  get flowExec(){return flowExec},
  get flowB(){return flowB},
  get INV(){return S.p.inv},
  get msgs(){return msgs},
  get CUR_SLOT(){return CUR_SLOT},
  set CUR_SLOT(v){CUR_SLOT=v},
  get SETTINGS(){return SETTINGS},
  set SETTINGS(v){SETTINGS=v},
  get DOORS(){return DOORS},
  get ROOMS(){return ROOMS},
  get PAD(){return PAD},
  get LEVEL(){return LEVEL},
  get EXITS(){return EXITS},
  get P_load(){return P.load},
  get MW(){return MW},
  get MH(){return MH},
  get mapC(){return mapC},
  FILES, KEYS, trigCond, computeFlowSlice, FLOW_SLICE, computeAllFlows, flowOfLayer: flowOf, AMBIENCE, AMBIENCE_DEFAULT, AMB_FADE, AMB, drawHeli, heliAlt, get parts() { return parts; }, startIntro, INTRO_LINES, INTRO_LEN, FACE_VEC, bustSpriteAngle, WARPS, warpIdx, applyWarp, PLAYTEST_WARP, WARP_STAGE, WARP_STAGE_NAME, WARP_SETS, ALL_WARPS, warpById, warpHotkey, drawItem, drawHUD, isFuseKey, synthZombie, ZOMBIE_VOICE, ZOMBIE_VOICED, synthVoice, CRIES, ENEMY_CRY, groanAt, cryAt, voiceBegin, VOICE, CRY_BIG, get cam() { return cam; }, get W() { return W; }, get H() { return H; }, damageEnemy, updateEnemies, invCount, invHas, NOISE, P, isDoorOpen,
  shakeNow: () => shake,
  mkEnemy, BUSTS, FACE_NAME, turnBust, readPlate, bustsCorrect, bustRight, isProp, pickupName, worldToInv,
  MAX_MW, MAX_MH, GRID_CAP, setMapSize, renderMap, SLEEP_DIST, NOISE, useLevel, freshLevelState, MIXES, INV_ROW, invFit, DOOR_BASH_GIVEUP, ITEMDEF,
  newState, buildMap, computeAllFlows, flowOf, passFor, doorSafe, roomAt, LEVELS, useLevel, MENU, SLOT_COUNT, listSlots, slotInfo, latestSlot, loadSlot, openSlots, slotsKey, titleItems, titleKey, goTitle, openPause, pauseKey, openMenu, closeMenu, settingsKey, keysKey, loadSettings, saveSettings, applySettings, sanitizeSettings, SETTINGS_DEFAULT, MASTER_BASE, deadCanLoad, refreshSlots, menuClick, drawSlots, drawSettings, drawKeys, drawPause, drawTitleMenu, gotoLevel, updateLoading, loadingAlpha, freshLevelState, fireEvent, runActions, updateTriggers, validateLevel, scheduleActions, useExit, updateRoomsAndEvents, EDEF_NAV: EDEF, DOOR_BASH_TIME, NAV_DOOR_COST, doorBashProgress, autoOpenDoorForExecutioner,
  useLift, useAltar, useFusebox, useConsole, useValve, useGrowLight, useGlCase, useGunLocker, useTrainDoor, modVal, useLN2Lever, GROW, HAZ, bloaterBurst, launchGrenade, updateHazards, curePoison, LN2, freezeExecutioner, VALVES, SAFES, MODS, SAFE_UI, openSafe, closeSafe, safeKey, trySafe, magCap, drawSafe,
  ITEMS, INV_START, newInventory, invAdd, invTake, invCount, invHas, invUsed, invFree, ammoCount, takeAmmo, GRAB, tryGrab, grabMash, grabThrow, isGrabbed, updateGrab, releaseGrab, GL_ROUNDS, GL_ORDER, glCur, glLoaded, cycleGlRound, bombBurst, acidBurst, grenadeBurst, pickUp, useSlot, useHealItem, combineSlots, pickQuickHeal, quickHeal, useSpray, migrateInventory, reload, shoot, hurtPlayer, openInventory, invKey, drawInventory, WEAPONS, KNIFE, knife, mouse, AU, spatial, sfxAt, sfx, findInteract, interact, update, passT, solidT, setDoorOpen, isDoorOpen, computeFlow, flowNext, scheduleTimer, processGameTimers, emitNoise, noiseField, damageEnemy, moveEnt, collide, mkEnemy, saveGame, loadGame, spawnExecutioner, inSafe, P, keys,
  get flowDir(){return flowDir},
  EXEC, DIRECTOR, CHASE_MUSIC, MUSIC, updateChaseMusic, updateExecutioner, updateDirector, directorTeleport, execAfterLoad, execBeforeLeave, updateFollow, activeExecutioner, isChasing, roomAdjacency, roomOfPos, roomPoint, findSpot, safeDoorOutside, pathDistTo, computeFlowFrom, flowNextOn, freshExecutioner, separateEntities, inSafeTileExport: inSafeTile, curRoom, losClear, KNIFE, drawHUD: typeof drawHUD === 'function' ? drawHUD : null,
  ESCAPE, startEscape, updateEscape, useEscapeDoor, failEscape, escapeActive, startTrainDepart,
  LAZ, RAILGUN, warpLazarus, useTrainConsole, finishLazMorph, startLazarus, updateLazarus, updateTentacle, lazarusBoss, lazarusDamage, updateLazWorld, updateRail, fireRail, equipRail, railOn, jAppear, jLeave, startLazMorph,
  BERSERK, FURNACE, updateBerserk, useLadle, updatePour, mutateExecutioner, berserkBoss, onBridge, checkPipes, pipeBroken,
  THROW, throwItem, updateThrows, grenadeBlast, flashBurst, curThrow, cycleThrow, selectThrow,
  HUNTER, updateHunter, hunterDoor, hunterHurt,
  isPackagedApp, winText, RANK, calcRank, rankPenalty, fmtClock, mapSplits, winReport, drawWin, EDEF, CRAWLER, LEAP, startExecLeap, tryReviveCrawler, PLAYER_SPEED, STATUS_SPEED, WEAPON_SLOTS, selectWeaponSlot, cycleWeapon, hasWeapon, resetTransient,
};`, { filename: 'test-exports' });
const R = global.__residue;

module.exports = { R, SOURCES, setSeed, canvasCtx };
