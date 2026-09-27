'use strict';
// 把 src/index.html 和它引用的全部脚本合并成单文件试玩版（按原顺序，各自保持独立 <script>）
//   node tools/build-demo.js            → 试玩版.html（含试玩跳转，不进仓库）
//   node tools/build-demo.js --release  → 残响之馆.html（发布版，跳转关闭）
//   node tools/build-demo.js --all      → 两个都生成
// npm test 会检查这两个文件是不是和当前源码一致（过时了会失败），见 sim-tests「单文件版是否过时」。
const fs = require('node:fs');
const path = require('node:path');
const { ROOT, INDEX, gameSources } = require('./sources');

const OUT = { demo: '试玩版.html', release: '残响之馆.html' };

function buildHtml(release) {
  let html = fs.readFileSync(INDEX, 'utf8');
  for (const s of gameSources()) {
    const tag = `<script src="${s.rel}"></script>`;
    // 防止源码里的 </script> 提前结束标签
    const code = s.code.replace(/<\/script/gi, '<\\/script');
    html = html.replace(tag, () => `<script>/* ${s.rel} */\n${code}</script>`);
  }
  if (/<script src=/.test(html)) throw new Error('仍有未内联的 <script src>');
  if (!release) return html;
  // 发布版：给别人玩的版本。必须关掉 Shift+数字 的试玩跳转，
  // 否则玩家一个手滑就跳到结局，整个流程白做。
  const flag = 'const PLAYTEST_WARP_SOURCE = true;';
  if (!html.includes(flag)) throw new Error('找不到 PLAYTEST_WARP_SOURCE 开关，发布版无法确认跳转已关闭');
  html = html.replace(flag, 'const PLAYTEST_WARP_SOURCE = false;   // 发布版：试玩跳转已关闭');
  if (/const PLAYTEST_WARP_SOURCE = true/.test(html)) throw new Error('PLAYTEST_WARP_SOURCE 仍然是 true');
  return html;
}

function write(release) {
  const name = release ? OUT.release : OUT.demo;
  const html = buildHtml(release);
  fs.writeFileSync(path.join(ROOT, name), html);
  console.log(`已生成 ${name}（合并 ${gameSources().length} 个文件${release ? '，试玩跳转已关闭' : '，含试玩跳转'}）`);
}

if (require.main === module) {
  const all = process.argv.includes('--all');
  if (all || !process.argv.includes('--release')) write(false);
  if (all || process.argv.includes('--release')) write(true);
}

module.exports = { buildHtml, OUT };
