// Node 18+ 推薦
import { readFile, writeFile, mkdir, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);
const root       = path.resolve(__dirname, '..');

// 允許用參數覆寫路徑：node scripts/generate-codicon-list.mjs [cssPath] [outPath]
const cssPath = path.resolve(root, process.argv[2] || 'media/styles/codicon.css');
const outPath = path.resolve(root, process.argv[3] || 'media/utils/vscode-icons.js');

async function exists(p){ try { await stat(p); return true; } catch { return false; } }

async function main() {
  const css = await readFile(cssPath, 'utf8');

  // 抓取 .codicon-xxx:before；逗號分隔的 selector 也會逐一命中
  const rx = /\.codicon-([a-z0-9-]+):before\b/gi;
  const set = new Set();

  for (let m; (m = rx.exec(css)); ) {
    const name = m[1].toLowerCase();
    // 排除極少數空值防護（理論上不會發生）
    if (name) set.add(name);
  }

  // 產生陣列：第一個元素為空字串，其餘按字母排序
  const icons = [''].concat([...set].sort((a, b) => a.localeCompare(b)));

  // 組出與你現有檔案相同的內容格式
  const header = `// Auto-generated from ${path.relative(root, cssPath)}\n` +
                 `// Run: npm run generate:codicons (or this script)\n\n`;
  const body =
`var vscodeIcons = [
  ${icons.map(s => JSON.stringify(s)).join(', ')}
];

// Note: declared with var so \`vscodeIcons\` is available as a global variable
window.vscodeIcons = vscodeIcons;
`;

  // 確保目錄存在並寫檔
  await mkdir(path.dirname(outPath), { recursive: true });
  await writeFile(outPath, header + body, 'utf8');

  console.log(`[codicons] extracted ${icons.length - 1} icons -> ${path.relative(root, outPath)}`);
}

main().catch(err => {
  console.error('[codicons] generate failed:', err);
  process.exitCode = 1;
});
