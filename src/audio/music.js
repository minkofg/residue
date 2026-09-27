'use strict';
// 追击音乐（计划 3.4）：处刑者进入追击后，低频鼓点逐渐加入；失去目标后 8 秒内淡出。
// 紧张度（导演系统）越高鼓点越快。还没有独立的“音乐”音量，所以接在“环境音”那一路上。
// MUSIC.level（0–1）是纯数值，没有声卡也会更新，测试直接检查它。

const MUSIC = { level: 0, beatT: 0, beat: 0, bus: null };

function musicBus() {
  if (!AU.c) return null;
  if (!MUSIC.bus) { MUSIC.bus = AU.c.createGain(); MUSIC.bus.gain.value = CHASE_MUSIC.vol; MUSIC.bus.connect(AU.ambBus || AU.m); }
  return MUSIC.bus;
}
function resetChaseMusic() { MUSIC.level = 0; MUSIC.beatT = 0; MUSIC.beat = 0; }

function updateChaseMusic(dt) {
  const C = CHASE_MUSIC, ex = activeExecutioner();
  const bz = S.enemies.some(e => (e.t === 'executionerBerserk' || e.t === 'lazarus') && !e.dead);   // Boss 战：一直是追击音乐
  const chasing = (!!ex && isChasing(ex) && !inSafe()) || bz;
  MUSIC.level = chasing ? Math.min(1, MUSIC.level + dt / C.fadeIn) : Math.max(0, MUSIC.level - dt / C.fadeOut);
  if (MUSIC.level <= 0.01) { MUSIC.beatT = 0; MUSIC.beat = 0; return; }
  MUSIC.beatT -= dt;
  if (MUSIC.beatT > 0) return;
  const tension = bz ? 1 : clamp(((S.executioner && S.executioner.tension) || 0) / 100, 0, 1);
  MUSIC.beatT += 60 / (C.bpmLow + (C.bpmHigh - C.bpmLow) * tension);
  if (MUSIC.beatT < 0) MUSIC.beatT = 0.05;  // 卡顿后不补打一串
  playDrum(MUSIC.beat++ % 4, MUSIC.level, tension);
}
// 一拍：底鼓（每拍）+ 第 1 拍重音 + 紧张时的反拍闷响
function playDrum(beat, level, tension) {
  const bus = musicBus(); if (!bus) return;
  const prev = AU.out; AU.out = bus;
  try {
    const v = level * (beat === 0 ? 1 : 0.7);
    tone(58, 0.4, 'sine', 0.55 * v, 30);
    noise(0.12, 'lowpass', 160, 0.35 * v);
    if (beat === 0) tone(38, 0.7, 'sine', 0.4 * level, 26);
    if (tension > 0.5) noise(0.08, 'bandpass', 220, 0.25 * level * (tension - 0.5) * 2, 60 / 250, 2);
  } finally { AU.out = prev; }
}
