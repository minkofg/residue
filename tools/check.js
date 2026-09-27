'use strict';
// 语法检查：游戏全部源码 + Electron 主进程和 preload
const { execFileSync } = require('node:child_process');
const path = require('node:path');
const { ROOT, gameSources } = require('./sources');

const files = gameSources().map(s => s.file);
let bad = 0;
for (const f of files) {
  try { execFileSync(process.execPath, ['--check', f], { stdio: 'pipe' }); }
  catch (e) { bad++; console.error(`✗ ${path.relative(ROOT, f)}\n${e.stderr}`); }
}
if (bad) { console.error(`${bad} 个文件有语法错误`); process.exit(1); }
console.log(`语法检查通过（${files.length} 个文件）`);
