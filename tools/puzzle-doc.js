'use strict';
// 从游戏数据生成 谜题文档.md（答案速查 + 道具位置 + 全部文档原文）。
//   node tools/puzzle-doc.js            写入 谜题文档.md
//   node tools/puzzle-doc.js --stdout   只打印（sim-tests 用它检查文件是不是最新的）
// npm run build:html 会顺带运行一次。以前这份文档是手写的全文副本，改了游戏里的文字就会对不上；
// 现在答案、房间、文字全部从 src/config 读，不会再有「文档说在 A，游戏里在 B」。
const fs = require('node:fs');
const path = require('node:path');
const { R } = require('./harness');

const OUT = path.join(__dirname, '..', '谜题文档.md');
const MAPS = ['map1', 'map2', 'map3'];

// 每份线索文档在谜题链里的作用（顺序 = 正常流程里读到的顺序）。没列在这里的文档归到「其他文档」
const CLUES = {
  map1: [['f1', '剑之钥匙的去向'], ['f2', '剑之钥匙 → 冷库门后'], ['f8', '冷库在厨房里'], ['f9', '四尊半身像的朝向'],
    ['f3', '铠甲钥匙 → 私人实验室'], ['f4', '盾之钥匙在私人实验室'], ['f5', '盾之钥匙 → 后廊'], ['f10', '保险柜密码 = 那一天（月在前）'],
    ['f11', '那一天的日期'], ['f12', '两枚徽章 → 雕像 → 升降梯']],
  map2: [['m2f1', '三个保险丝在哪'], ['m2f2', '主任的 ID 卡在哪'], ['m2f3', '妈妈的生日'], ['m2f6', '储物柜密码 = 妈妈的生日'],
    ['m2f7', '三个阀门 + 液氮拉杆'], ['m2f5', '启动货运列车']],
  map3: [['m3f2', '通行证 + 厂区方位'], ['m3f3', '燃烧榴弹在哪'], ['m3f5', '补光灯开关'], ['m3f7', '钢水包打处刑者'],
    ['m3f8', '发车 + 洛克伍德的弱点']],
};

function roomName(map, x, y) {
  const r = R.LEVELS[map].rooms.find(o => x >= o.x && x < o.x + o.w && y >= o.y && y < o.y + o.h);
  return r ? r.name : `（${x}, ${y}）`;
}
const placed = map => R.LEVELS[map].items;
function fileRoom(id) {
  for (const m of MAPS) { const it = placed(m).find(i => i[0] === 'file' && i[3] === id); if (it) return roomName(m, it[1], it[2]); }
  return '（没有摆在地图上）';
}
const quote = body => body.split('\n').map(l => (l ? '> ' + l : '>')).join('\n');
const bustName = id => R.BUSTS[id].name.split(' ')[0];
const onOff = o => Object.entries(o).map(([k, v]) => `${k} ${v === true ? '开' : v === false ? '关' : v}`).join(' · ');

function build() {
  const S = R.SAFES, B = R.BUSTS, F = R.FACE_NAME;
  const busts = Object.keys(B).map(id => `${bustName(id)} ${F[B[id].want]}`).join(' · ');
  const L = [];
  L.push('# 谜题文档（答案、道具位置、文档原文）', '');
  L.push('> **本文件由 `tools/puzzle-doc.js` 从游戏数据自动生成，不要手改。** 改了 `src/config/` 里的文档文字、谜题答案或道具位置后，运行 `npm run build:html`（会顺带重新生成本文件）；`npm test` 会检查它是不是最新的。');
  L.push('');
  L.push('## 文档写法');
  L.push('');
  L.push('第一次试玩：家谱、保险柜的线索看不懂 → 加了方位和格式说明。之后又给 21 份文档末尾都加了「去哪 / 找什么 / 怎么操作 / 答案格式」的括号说明。第二次试玩：**提示太明显**。现在的规矩：');
  L.push('');
  L.push('- 游戏里的文档只写**剧情里的人会写的话**（日记、便条、规程、留言），不写「下一步去哪」「按 E」「答案是几」。');
  L.push('- **去哪**由目标栏（▲）和地图（M）负责；**怎么操作**由交互时的提示负责（半身像显示「现在面朝」，阀门显示档位，补光灯显示开 / 关，保险柜是拨盘界面）。');
  L.push('- **每个谜题至少让玩家自己连一次线**（两份文档对上，或者把描述换算成方位），但答案必须能从游戏里的信息唯一推出来（`npm test` 里有对应的检查）。');
  L.push('- 答案和推理过程只写在这份文件里。');
  L.push('');
  L.push('## 答案速查');
  L.push('');
  L.push('| 谜题 | 地点 | 答案 | 怎么推出来 |');
  L.push('|---|---|---|---|');
  L.push(`| 画廊半身像 | 画廊 | ${busts} | 正门：开局时身后那扇大门，主厅在画廊南边（f0、f9）；「清晨第一缕阳光照到的地方」= 东（f9）；「藏书的那一侧」：画廊西门门楣的铜牌写着「图书室」；剩下的北边归伊莱亚斯（f9 排除法）。地砖会报「几道凹槽亮着」，卡住了可以一座一座试 |`);
  L.push(`| ${S.bedroom.name} | 主卧 | **${S.bedroom.code}** | f10：密码是伊莱亚斯被除名的那一天，月在前、日在后 → f11：一八九〇年十月三十一日 |`);
  L.push(`| ${S.dormLocker.name} | 员工宿舍 | **${S.dormLocker.code}** | m2f6：老周的密码是他妈妈的生日，月、日各两位 → m2f3（老周没寄出的信）：四月十七号 |`);
  L.push(`| 冷冻库阀门 | 冷冻库 | ${onOff(R.VALVES).replace(/(\w) (\d)/g, '$1 = $2 档')} | m2f7：A 路 3 档；B 路比 A 低两档；C 路是 A、B 之和 |`);
  L.push(`| 温室补光灯 | 植物实验温室 | ${onOff(R.GROW)} | m3f5：A 床每晚都开；A 开着 B 也得开；C 床绝对不能开；D 跟 B 一致 |`);
  L.push('');
  L.push('**机关和 Boss**（以前写在文档括号里的打法）：');
  L.push('');
  L.push('- 液氮拉杆（冷冻库门边，m2f7）：阀门对上以后可以反复用，把追你的东西引到房间正中再拉，排放后要等约 60 秒重新加压。');
  L.push('- 焚化炉（m3f7）：让处刑者追着你上吊桥，你先过桥，到桥北头的控制台拉闸，约 1 秒后钢水落下；每次倾倒后要等 12 秒。它变异后会冲撞：站到墙边的钢水管道前，等它冲过来再闪开，让它撞管道（规程第 4 条「严禁撞击」就是提示）。');
  L.push('- 洛克伍德 / 拉撒路（m3f8）：它出招后肩上的眼球会睁开，那是弱点。');
  L.push('');
  L.push('## 钥匙和关键道具在哪');
  L.push('');
  const keyName = v => (R.KEYS[v] && R.KEYS[v].name) || v;
  const MAPNAME = m => R.LEVELS[m].name;
  for (const m of MAPS) {
    const rows = [];
    for (const it of placed(m)) {
      if (it[0] === 'key') rows.push([keyName(it[3]), roomName(m, it[1], it[2])]);
      else if (it[0] === 'glcase') rows.push(['榴弹发射器（武器箱，补光灯谜题）', roomName(m, it[1], it[2])]);
      else if (it[0] === 'glammo') rows.push([`燃烧榴弹 ×${it[3]}`, roomName(m, it[1], it[2])]);
      else if (it[0] === 'safe' && S[it[3]]) {
        const rw = S[it[3]].reward || {};
        const what = [rw.key && keyName(rw.key), ...(rw.items || []).map(([id, n]) => (R.ITEMS[id] ? R.ITEMS[id].name : id) + (n > 1 ? ' ×' + n : ''))].filter(Boolean).join('、');
        rows.push([`${what || '奖励'}（${S[it[3]].name}里，密码 ${S[it[3]].code}）`, roomName(m, it[1], it[2])]);
      }
    }
    L.push(`- **${MAPNAME(m)}**：` + rows.map(([a, b]) => `${a} → ${b}`).join('；'));
  }
  L.push('');
  const listed = new Set();
  for (const m of MAPS) {
    L.push(`## ${MAPNAME(m)}`, '');
    for (const [id, what] of CLUES[m]) {
      const f = R.FILES[id]; listed.add(id);
      L.push(`### ${f.title}　\`${id}\``, '', `**位置：**${fileRoom(id)}　|　**线索：**${what}`, '', quote(f.body), '');
    }
  }
  const others = MAPS.flatMap(m => placed(m).filter(i => i[0] === 'file' && !listed.has(i[3])).map(i => i[3]));
  L.push('## 其他文档（剧情和氛围，不承担谜题线索）', '');
  for (const id of others) { const f = R.FILES[id]; L.push(`### ${f.title}　\`${id}\``, '', `**位置：**${fileRoom(id)}`, '', quote(f.body), ''); }
  return L.join('\n');
}

module.exports = { build, OUT };
if (require.main === module) {
  const text = build();
  if (process.argv.includes('--stdout')) process.stdout.write(text);
  else { fs.writeFileSync(OUT, text); console.log('已生成 谜题文档.md'); }
}
