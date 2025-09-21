// Node 18+ 推薦；16.7+ 也可（fs.cp 已存在）
import { cp, mkdir, readdir, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);
const root       = path.resolve(__dirname, '..');
const outDir     = path.join(root, 'out');
const typedefs   = path.join(outDir, 'typedefs');

async function exists(p) {
  try { await stat(p); return true; } catch { return false; }
}
async function ensureDir(p) {
  await mkdir(p, { recursive: true });
}
async function copyDir(src, dest) {
  if (!(await exists(src))) return;
  await ensureDir(path.dirname(dest));
  await cp(src, dest, { recursive: true });
}
async function copyDirContents(src, dest) {
  if (!(await exists(src))) return;
  await ensureDir(dest);
  const items = await readdir(src);
  await Promise.all(items.map(name => cp(
    path.join(src, name),
    path.join(dest, name),
    { recursive: true }
  )));
}
async function main() {
  // 準備目錄
  await ensureDir(outDir);
  await ensureDir(typedefs);

  // 1) 等同：cpx "node_modules/@types/{node,vscode}/**/*" out/typedefs
  //   讓輸出為：out/typedefs/node/** 與 out/typedefs/vscode/**
  await copyDir(path.join(root, 'node_modules/@types/node'),   path.join(typedefs, 'node'));
  await copyDir(path.join(root, 'node_modules/@types/vscode'), path.join(typedefs, 'vscode'));

  // 2) 等同：cpx "types/**/*" out/typedefs
  //   將專案的 ./types 內容直接攤到 out/typedefs 下（保留子結構）
  await copyDirContents(path.join(root, 'types'), typedefs);

  // 3) 等同：cpx "package.nls*.json" out
  //   複製所有符合的 NLS 檔到 out 根目錄
  const files = await readdir(root);
  const nlsRx = /^package\.nls.*\.json$/i;
  await Promise.all(
    files.filter(f => nlsRx.test(f))
         .map(f => cp(path.join(root, f), path.join(outDir, f)))
  );

  console.log('[copy-files] done');
}

main().catch(err => {
  console.error('[copy-files] failed:', err);
  process.exitCode = 1;
});
