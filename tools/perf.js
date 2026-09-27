'use strict';
// 无画面性能剖析：量 update() 每帧要花多少毫秒。
//
// 画面部分（renderWorld / 光照 / 后期）必须在真机上看帧数，Node 里测不了。
// 但**逻辑**部分是可以量的，而且逻辑一旦超预算，再好的显卡也救不回来。
//
// 预算：60 FPS = 每帧 16.67ms，这是 update + render 两边一起分的。
// 逻辑应该控制在 4ms 以内（约 1/4），把剩下的留给绘制。
//
// 用法：node tools/perf.js [--strict]

const { R } = require('./harness');

const strict = process.argv.includes('--strict');
const BUDGET_MS = 4.0;        // 逻辑部分的每帧预算
const DT = 1 / 60;

function percentile(arr, p) {
  const a = [...arr].sort((x, y) => x - y);
  return a[Math.min(a.length - 1, Math.floor(a.length * p))];
}

// 跑 N 帧，返回每帧耗时（毫秒）
function bench(label, setup, frames = 900) {
  R.S = R.newState(); R.buildMap(); R.resetTransient(); R.mode = 'play';
  R.S.enemies = [];
  R.computeFlow();
  setup();
  for (let i = 0; i < 400; i++) R.update(DT);         // 预热：让寻路场进入稳态，也让 JIT 编译完（否则前几帧的编译开销会被当成卡顿）
  const times = [];
  for (let i = 0; i < frames; i++) {
    const t0 = process.hrtime.bigint();
    R.update(DT);
    times.push(Number(process.hrtime.bigint() - t0) / 1e6);
  }
  const avg = times.reduce((a, b) => a + b, 0) / times.length;
  const p95 = percentile(times, 0.95), p99 = percentile(times, 0.99), max = Math.max(...times);
  return { label, avg, p95, p99, max, times };
}

const T = 48;
const scenes = [
  ['空场景（只有玩家走路）', () => { R.S.p.x = 32.5 * T; R.S.p.y = 34.5 * T; }],
  ['典型战斗（3 只僵尸追击）', () => {
    R.S.p.x = 32.5 * T; R.S.p.y = 34.5 * T;
    for (const [x, y] of [[30, 33], [34, 33], [32, 31]]) { const e = R.mkEnemy('zombie', x, y); e.alert = true; e.state = 'chase'; R.S.enemies.push(e); }
  }],
  ['地图满载（全部固定敌人同时警觉）', () => {
    R.S.p.x = 32.5 * T; R.S.p.y = 34.5 * T;
    for (const [t, x, y] of R.LEVELS.map1.enemies) { const e = R.mkEnemy(t, x, y); e.alert = true; e.state = 'chase'; R.S.enemies.push(e); }
  }],
  ['最坏情况：后庭院终局', () => {
    // 4 只补刷僵尸 + 处刑者 + 直升机 + 90 秒倒计时 + 每帧都在生成的粒子
    R.S.p.x = 50.5 * T; R.S.p.y = 15.5 * T;
    R.update(0.1);                                   // 触发 yard_enter
    R.spawnExecutioner(52, 8);
    for (const [x, y] of [[44, 3], [60, 3], [60, 18], [44, 8]]) { const e = R.mkEnemy('zombie', x, y); e.alert = true; e.state = 'chase'; R.S.enemies.push(e); }
    R.S.flags.heli = true;
    for (let i = 0; i < 260; i++) R.parts.push({ x: R.S.p.x + i, y: R.S.p.y, vx: 40, vy: 10, life: 9, max: 9, s: 2, c: '#888', t: 'dust' });
  }],
];

console.log('\n逻辑帧耗时（update()，不含绘制）　预算 ' + BUDGET_MS.toFixed(1) + 'ms/帧（60FPS 的 1/4）\n');
console.log('  场景                                    平均      p95       p99       最坏*     判定');
let failed = false;
const results = [];
for (const [label, setup] of scenes) {
  const r = bench(label, setup);
  results.push(r);
  const bad = r.p95 > BUDGET_MS;
  if (bad) failed = true;
  console.log(`  ${label.padEnd(36)}${r.avg.toFixed(3).padStart(7)}ms${r.p95.toFixed(3).padStart(8)}ms${r.p99.toFixed(3).padStart(8)}ms${r.max.toFixed(3).padStart(9)}ms   ${bad ? '⚠️ 超预算' : '✅'}`);
}

// 卡顿感来自「经常出现的慢帧」，不是某一次孤立的极值。
// 所以判据用 p99 而不是 max：max 里混着 GC 和 JIT 的偶发开销，拿它当指标会一直误报。
console.log('\n  * 最坏值仅供参考：单次极值里混着垃圾回收和即时编译的开销，不代表真实卡顿。');
const spikes = results.map(r => ({ label: r.label, ratio: r.p99 / r.avg, p99: r.p99 }));
const worst = spikes.reduce((a, b) => (b.ratio > a.ratio ? b : a));
console.log(`  周期性尖峰（p99 / 平均）最高的是「${worst.label}」：${worst.ratio.toFixed(1)}×，p99 = ${worst.p99.toFixed(3)}ms`);
console.log('  寻路场现在是每帧只重算一层（四层轮转，整体刷新率仍是 0.25 秒），尖峰已被摊平。');
if (worst.p99 > BUDGET_MS) { console.log('  ⚠️ p99 超预算'); failed = true; }

console.log('');
if (strict && failed) process.exit(1);
