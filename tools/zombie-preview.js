'use strict';
// 丧尸嗓音试听：用游戏里同一个合成函数（src/audio/zombie.js 的 synthZombie）导出 WAV。
//   node tools/zombie-preview.js [输出目录]     缺省输出到 音效试听/
// 每种叫法导出 3 条（固定种子，每次导出一样），另外拼一条「全部连起来」的方便一次听完。
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const ctx = {}; vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'src', 'audio', 'zombie.js'), 'utf8'), ctx);
vm.runInContext('this.synthZombie = synthZombie; this.ZOMBIE_VOICE = ZOMBIE_VOICE;', ctx);

const SR = 44100;
function seeded(n) { let s = n >>> 0; return () => { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
function wav(samples) {
  const b = Buffer.alloc(44 + samples.length * 2);
  b.write('RIFF', 0); b.writeUInt32LE(36 + samples.length * 2, 4); b.write('WAVE', 8); b.write('fmt ', 12);
  b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22); b.writeUInt32LE(SR, 24); b.writeUInt32LE(SR * 2, 28); b.writeUInt16LE(2, 32); b.writeUInt16LE(16, 34);
  b.write('data', 36); b.writeUInt32LE(samples.length * 2, 40);
  for (let i = 0; i < samples.length; i++) b.writeInt16LE(Math.round(Math.max(-1, Math.min(1, samples[i])) * 32767), 44 + i * 2);
  return b;
}
const NAMES = { idle: '游荡呻吟', attack: '发现你-扑咬', hurt: '中弹闷哼' };
function render(kind, seed) { return ctx.synthZombie(kind, SR, seeded(seed)); }
if (require.main === module) {
  const dir = process.argv[2] || path.join(__dirname, '..', '音效试听');
  fs.mkdirSync(dir, { recursive: true });
  const all = [], gap = n => new Float32Array(Math.floor(SR * n));
  for (const kind of Object.keys(NAMES)) for (let k = 1; k <= 3; k++) {
    const s = render(kind, kind.length * 1000 + k);
    fs.writeFileSync(path.join(dir, `丧尸-${NAMES[kind]}-${k}.wav`), wav(s));
    all.push(s, gap(0.6));
  }
  const total = all.reduce((a, s) => a + s.length, 0), cat = new Float32Array(total); let o = 0;
  for (const s of all) { cat.set(s, o); o += s.length; }
  fs.writeFileSync(path.join(dir, '丧尸-全部连起来.wav'), wav(cat));
  console.log(`已导出到 ${dir}`);
}
module.exports = { render, wav, SR };
