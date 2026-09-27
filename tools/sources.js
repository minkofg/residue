'use strict';
// 游戏源码文件列表的唯一来源：src/index.html 里的 <script src> 顺序。
// 测试、语法检查、打包试玩版都从这里读取，新增文件只需要改 index.html。
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const INDEX = path.join(ROOT, 'src', 'index.html');

function gameSources() {
  const html = fs.readFileSync(INDEX, 'utf8');
  const list = [...html.matchAll(/<script src="([^"]+)"><\/script>/g)].map(m => m[1]);
  if (!list.length) throw new Error('src/index.html 中没有找到 <script src>');
  return list.map(rel => ({ rel, file: path.join(ROOT, 'src', rel), code: fs.readFileSync(path.join(ROOT, 'src', rel), 'utf8') }));
}

module.exports = { ROOT, INDEX, gameSources };
