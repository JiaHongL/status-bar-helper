// Node 18+ recommended

import { execFile as _execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { readFile, writeFile, cp, mkdir, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const execFile = promisify(_execFile);
const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);
const root       = path.resolve(__dirname, '..');
const pkgPath    = path.join(root, 'package.json');

const stylesDir  = path.join(root, 'media', 'styles');
const srcDir     = path.join(root, 'node_modules', '@vscode', 'codicons', 'dist');
const iconsOut   = path.join(root, 'media', 'utils', 'vscode-icons.js');

const npmCmd     = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const isInit     = process.argv.slice(2).some(a => a === 'init' || a === '--init');

async function exists(p){ try{ await stat(p); return true; } catch { return false; } }
async function readPkg(){ return JSON.parse(await readFile(pkgPath, 'utf8')); }

function getDeclaredSpec(pkg){
  return (pkg.dependencies && pkg.dependencies['@vscode/codicons'])
      || (pkg.devDependencies && pkg.devDependencies['@vscode/codicons'])
      || null;
}

async function getInstalledExact(){
  try {
    const installed = JSON.parse(await readFile(
      path.join(root, 'node_modules', '@vscode', 'codicons', 'package.json'), 'utf8'
    ));
    return installed.version;
  } catch { return null; }
}

async function npmInstall(spec, opts = { exact: false }){
  const args = ['i', `@vscode/codicons@${spec}`];
  if (opts.exact) args.push('-E'); // lock exact version when updating
  args.push('--no-audit','--no-fund');
  await execFile(npmCmd, args, { cwd: root, stdio: 'inherit' });
}

async function getLatestVersion(){
  const { stdout } = await execFile(npmCmd, ['view', '@vscode/codicons', 'version'], { cwd: root });
  return stdout.trim();
}

async function setExactInPkg(version){
  const pkg = await readPkg();
  if (!pkg.dependencies) pkg.dependencies = {};
  pkg.dependencies['@vscode/codicons'] = version; // lock exact
  await writeFile(pkgPath, JSON.stringify(pkg, null, 2) + '\n', 'utf8');
}

async function copyAssets(){
  if (!(await exists(srcDir))) {
    throw new Error(`Missing ${srcDir} (@vscode/codicons not installed?)`);
  }
  await mkdir(stylesDir, { recursive: true });
  for (const f of ['codicon.css', 'codicon.ttf']) {
    await cp(path.join(srcDir, f), path.join(stylesDir, f));
  }
  console.log('[update-codicons] Copied codicon.css & codicon.ttf into media/styles');
}

async function generateVscodeIconsFromCss() {
  const cssPath = path.join(stylesDir, 'codicon.css');
  if (!(await exists(cssPath))) {
    throw new Error(`CSS not found: ${cssPath} (did copyAssets() run?)`);
  }

  const css = await readFile(cssPath, 'utf8');

  // Capture all ".codicon-<name>:before"
  const rx = /\.codicon-([a-z0-9-]+):before\b/gi;
  const set = new Set();
  for (let m; (m = rx.exec(css)); ) {
    const name = m[1]?.toLowerCase();
    if (name) set.add(name);
  }

  // First element is an empty string, rest sorted alphabetically
  const icons = [''].concat([...set].sort((a, b) => a.localeCompare(b)));

  const header =
    `// Auto-generated from ${path.relative(root, cssPath)}\n` +
    `// DO NOT EDIT MANUALLY. Run \`npm run update:codicons\` (or this script) instead.\n\n`;

  const body =
`var vscodeIcons = [
  ${icons.map(s => JSON.stringify(s)).join(', ')}
];

// Note: declared with var so \`vscodeIcons\` is available as a global variable
window.vscodeIcons = vscodeIcons;
`;

  await mkdir(path.dirname(iconsOut), { recursive: true });
  await writeFile(iconsOut, header + body, 'utf8');

  console.log(`[update-codicons] Generated ${icons.length - 1} icon names -> ${path.relative(root, iconsOut)}`);
}

async function main(){
  if (isInit) {
    const pkgSpec = getDeclaredSpec(await readPkg());
    if (!pkgSpec) throw new Error('@vscode/codicons is not declared in package.json.');
    const installed = await exists(path.join(root, 'node_modules', '@vscode', 'codicons'));
    if (!installed) {
      console.log('[update-codicons:init] Installing declared spec:', pkgSpec);
      // Preserve user’s declared range (^/~) in init mode
      await npmInstall(pkgSpec, { exact: false });
    } else {
      console.log('[update-codicons:init] Using installed @vscode/codicons:', await getInstalledExact());
    }
  } else {
    const latest = await getLatestVersion();
    const installed = await getInstalledExact();
    if (installed !== latest) {
      console.log(`[update-codicons] Upgrading ${installed ?? '(none)'} -> ${latest}`);
      await setExactInPkg(latest);
      await npmInstall(latest, { exact: true });
    } else {
      console.log(`[update-codicons] Already latest: ${installed}`);
    }
  }

  await copyAssets();
  await generateVscodeIconsFromCss();

  console.log('[update-codicons] Done.');
}

main().catch(err => { console.error('[update-codicons] Failed:', err); process.exitCode = 1; });
