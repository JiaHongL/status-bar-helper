// scripts/update-monaco.mjs  (Node 18+)
import { execFile as _execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { readFile, writeFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const execFile = promisify(_execFile);
const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);
const root       = path.resolve(__dirname, '..');

const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const npx = process.platform === 'win32' ? 'npx.cmd' : 'npx';

const args = new Set(process.argv.slice(2));
const isInit = args.has('init') || args.has('--init');

async function exists(p){ try { await stat(p); return true; } catch { return false; } }
async function readPkg(){ return JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8')); }

function declaredSpec(pkg){
  return pkg.dependencies?.['monaco-editor'] ?? pkg.devDependencies?.['monaco-editor'] ?? null;
}

async function installedVersion(){
  try {
    const j = JSON.parse(await readFile(path.join(root, 'node_modules/monaco-editor/package.json'), 'utf8'));
    return j.version;
  } catch { return null; }
}

async function npmInstall(spec, { exact = false } = {}){
  const argv = ['i', `monaco-editor@${spec}`, '--no-audit', '--no-fund'];
  if (exact) argv.push('-E');
  console.log('[update-monaco] npm', argv.join(' '));
  await execFile(npm, argv, { cwd: root, stdio: 'inherit' });
}

async function latestVersion(){
  const { stdout } = await execFile(npm, ['view', 'monaco-editor', 'version'], { cwd: root });
  return stdout.trim();
}

async function setExact(version){
  const pkg = await readPkg();
  (pkg.dependencies ??= {})['monaco-editor'] = version;
  await writeFile(path.join(root, 'package.json'), JSON.stringify(pkg, null, 2) + '\n', 'utf8');
}

async function runViteBuild(){
  // 你既有 scripts 名稱不變：呼叫 build:webview
  await execFile(npm, ['run', 'build:webview'], { cwd: root, stdio: 'inherit' });
}

(async () => {
  try {
    console.log('[update-monaco] cwd =', root);

    if (isInit) {
      // init：照 package.json 宣告安裝（不強制升級）
      const spec = declaredSpec(await readPkg());
      if (!spec) throw new Error('monaco-editor is not declared in package.json');
      if (!(await exists(path.join(root, 'node_modules/monaco-editor')))) {
        console.log('[update-monaco:init] installing declared spec:', spec);
        await npmInstall(spec, { exact: false });
      } else {
        console.log('[update-monaco:init] using installed:', await installedVersion());
      }
    } else {
      // 一般：升級到最新版並鎖定 exact
      const latest = await latestVersion();
      const cur = await installedVersion();
      if (cur !== latest) {
        console.log(`[update-monaco] upgrade ${cur ?? '(none)'} -> ${latest}`);
        await setExact(latest);
        await npmInstall(latest, { exact: true });
      } else {
        console.log('[update-monaco] already latest:', cur);
      }
    }

    // 取代舊「複製 esm/vs」→ 打包 webview
    await runViteBuild();

    console.log('[update-monaco] Done.');
  } catch (err) {
    console.error('[update-monaco] Failed:', err);
    process.exitCode = 1;
  }
})();
