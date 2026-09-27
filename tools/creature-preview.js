'use strict';
// 怪物叫声试听：用游戏里同一套合成函数（src/audio/zombie.js + creatures.js）导出 WAV。
//   node tools/creature-preview.js [输出目录]      缺省输出到 音效试听/
// 每种怪一个文件，把它的全部叫法按顺序连起来（每种叫法 2 条，中间空 0.5 秒）；另外每种叫法单独一个文件。
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const { wav, SR } = require('./zombie-preview');
const ctx = { Math }; vm.createContext(ctx);
for (const f of ['zombie.js', 'creatures.js']) vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'src', 'audio', f), 'utf8'), ctx);
vm.runInContext('this.CRIES = CRIES; this.synthVoice = synthVoice;', ctx);

const NAMES = {
  dog: ['狗', { bark: '发现你-连吠', growl: '平时-低吼', snarl: '扑咬', yelp: '中弹', whine: '倒下' }],
  hunter: ['猎手', { chitter: '平时-咯咯声', hiss: '飞扑前摇-嘶气', shriek: '发现你-尖叫', snarl: '挥爪', pain: '中弹' }],
  licker: ['舔舐者', { clicks: '平时-舌头嗒嗒', screech: '发现你-尖啸', lash: '舌头抽打', pain: '中弹' }],
  slime: ['淤泥体', { bubble: '潜伏-冒泡', gloop: '暴起-咕咚', pain: '中弹' }],
  vine: ['蔓生体', { creak: '立起来-吱嘎', lash: '藤鞭', spit: '吐酸液', pain: '中弹' }],
  parasite: ['寄生体', { chitter: '平时-咔咔', squeal: '扑咬-中弹' }],
  bloater: ['膨胀者', { idle: '平时', attack: '发现你-扑咬', hurt: '中弹' }],
  executioner: ['处刑者', { growl: '平时-低吼', roar: '咆哮', pain: '被打倒' }],
  berserk: ['暴走处刑者', { roar: '咆哮', grunt: '挥砍' }],
  lazarus: ['拉撒路', { moan: '召唤-群声呻吟', roar: '咆哮', grunt: '横扫' }],
  tentacle: ['触手', { rumble: '预警-地下隆隆', burst: '钻出地面' }],
};
function seeded(n) { let s = n >>> 0; return () => { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const cat = list => { const n = list.reduce((a, s) => a + s.length, 0), o = new Float32Array(n); let k = 0; for (const s of list) { o.set(s, k); k += s.length; } return o; };
if (require.main === module) {
  const dir = process.argv[2] || path.join(__dirname, '..', '音效试听');
  fs.mkdirSync(dir, { recursive: true });
  const gap = new Float32Array(Math.floor(SR * 0.5));
  let seed = 1;
  for (const [sp, [cn, acts]] of Object.entries(NAMES)) {
    const all = [];
    for (const [act, an] of Object.entries(acts)) {
      const clips = [1, 2].map(() => ctx.CRIES[sp][act].make(SR, seeded(seed++ * 7919)));
      fs.writeFileSync(path.join(dir, `${cn}-${an}.wav`), wav(cat([clips[0], gap, clips[1]])));
      all.push(clips[0], gap, clips[1], gap, gap);
    }
    fs.writeFileSync(path.join(dir, `${cn}（全部叫法）.wav`), wav(cat(all)));
  }
  console.log(`已导出到 ${dir}`);
}
module.exports = { NAMES };
