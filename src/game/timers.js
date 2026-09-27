'use strict';
// 游戏内计时器（随游戏时间推进，可存档）

// 游戏内计时器：暂停、阅读文件和存档都不会丢失事件；不使用浏览器延迟回调。
// 计时器记着自己属于哪张地图，玩家不在那张地图时不走（回来后继续）。
function scheduleTimer(type, seconds) {
  if (!S.timers) S.timers = [];
  S.timers.push({ id: `${S.time.toFixed(3)}-${Math.random().toString(36).slice(2)}`, type, left: seconds, map: S.map });
}
// 触发器的延时 / 重复动作；every 给了就每隔 every 秒重复，until 标记为真时停止
function scheduleActions(seconds, actions, every, until) {
  if (!S.timers) S.timers = [];
  const t = { id: `${S.time.toFixed(3)}-${Math.random().toString(36).slice(2)}`, type: 'actions', left: seconds, map: S.map, do: actions };
  if (every) { t.every = every; if (until) t.until = until; }
  S.timers.push(t);
}
const timerHere = t => !t.map || t.map === S.map;
function processGameTimers(dt) {
  if (!S.timers) S.timers = [];
  // 重复动作的停止条件先检查（例如直升机到了就不再刷怪）
  S.timers = S.timers.filter(t => !(t.until && S.flags[t.until]));
  for (const timer of S.timers) if (timerHere(timer)) timer.left -= dt;
  const due = S.timers.filter(timer => timer.left <= 0);
  S.timers = S.timers.filter(timer => timer.left > 0);
  for (const timer of due) {
    if (timer.type === 'actions') {
      runActions(timer.do, 'timer');
      if (timer.every && !(timer.until && S.flags[timer.until])) { timer.left += timer.every; S.timers.push(timer); }
    } else if (timer.type === 'shieldAmbush' && !S.flags.ambushFired) {
      // v3 以前的存档里可能还挂着这个计时器
      runActions(LEVELS.map1.scripts.ambush, 'ambush');
    }
  }
  const c = S.countdown;
  if (c && timerHere(c)) {
    c.left -= dt;
    if (c.left <= 0) { S.countdown = null; runActions(c.do, 'countdown'); }
  }
}
