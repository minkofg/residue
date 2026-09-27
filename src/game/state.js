'use strict';
// 敌人实例与新游戏状态

let EID = 0;
function mkEnemy(t, tx, ty) {
  const d = EDEF[t];
  return { id: EID++, t, x: (tx + .5) * T, y: (ty + .5) * T, hp: d.hp, maxhp: d.hp, r: d.r, spd: rand(d.spd[0], d.spd[1]), sight: d.sight, dmg: d.dmg, reach: d.reach, state: 'idle',
    fa: rand(Math.PI * 2), wa: rand(Math.PI * 2), wT: rand(3), moving: false, atkT: 0, recT: 0, stag: 0, alert: false, dead: false, deadT: 0,
    ph: rand(10), groanT: rand(3, 10), stagAcc: 0, knifeStunT: 0, knockdownT: 0, stepT: rand(0.2, 0.8),
    ...(t === 'crawler' ? { state: 'lurk', twitchT: rand(CRAWLER.twitch[0], CRAWLER.twitch[1]) } : {}) };
}
// 新游戏：从 levelId 地图开始（默认地图 1）
function newState(levelId = 'map1') {
  EID = 0; useLevel(levelId);
  const L = LEVEL, lv = freshLevelState(levelId);
  return {
    version: SAVE_VERSION,
    p: { x: L.start.x * T, y: L.start.y * T, r: 14, a: L.start.a ?? -Math.PI / 2, hp: 100, wep: 'pistol', mag: { pistol: WEAPONS.pistol.mag, shotgun: 0 }, inv: newInventory([['pistol', 1], ['ammo_pistol', 18], ['herb_g', 1]]), guardT: 0, keys: {}, files: [], mods: {} },
    map: levelId, maps: {},  // 当前地图；其他去过的地图的状态（见 world/level.js）
    ...lv,                   // items、enemies、doors、unlocked、doorBash、visited：当前地图的状态
    timers: [], flags: {}, fired: {}, countdown: null, objective: null, time: 0, cine: 0, cineLen: 0, cineT: 0, cineThen: null, heliT: 0, crash: null, pod: null, train: null, gas: [], fires: [], nades: [], acid: [], leap: null, altar: {}, fuses: {}, liftConfirmT: 0, trainConfirmT: 0,
    stats: { kills: 0, shots: 0, hits: 0, saves: 0, heals: 0, split: {} },   // split：离开每张地图时的 S.time（结算画面算各地图用时）
    executioner: freshExecutioner(),  // 处刑者 / 导演状态（config/director.js）
  };
}
