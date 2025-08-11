// src/defaultItems.ts

export const DEFAULT_MINIMAL_LOG_SCRIPT = `
// Minimal Log: VS Code + Node (read-only, one-click, dual output)
// Example: Demonstrates how to log messages in a VS Code extension
// 1. Create a custom Output Channel in VS Code
// 2. Define a helper function to log to both Output Channel and console
// 3. Show environment info (Node version, platform, architecture)
// 4. List a few files/directories from the current workspace
// 5. Show the currently active file and its language
// 6. Display a completion message in VS Code's UI

// Import VS Code API
const vscode = require('vscode');
// Import Node.js file system and path modules
const fs = require('fs');
const path = require('path');
// Inject VM API
const { vm } = statusBarHelper.v1; 

(function main(){
  // Create a new Output Channel named "SBH Minimal Log"
  const ch = vscode.window.createOutputChannel('SBH Minimal Log');

  // Helper function: log to both Output Channel and console
  const emit = (...a) => {
    const line = a.join(' ');
    ch.appendLine(line);
    console.log(line);
  };

  // Show the Output Channel immediately
  ch.show(true);

  // Start logging
  emit('▶ Start');

  // Show Node.js version, platform, and architecture
  emit('Node: ' + process.version + '  Platform: ' + process.platform + '/' + process.arch);

  // Get current workspace root (or fallback to process.cwd())
  const ws = vscode.workspace.workspaceFolders;
  const root = ws && ws.length ? ws[0].uri.fsPath : process.cwd();
  emit('Workdir: ' + root);

  // Try listing the first 8 entries in the workspace folder
  try {
    const entries = fs.readdirSync(root, { withFileTypes: true }).slice(0, 8);
    entries.forEach(e => emit((e.isDirectory() ? '[D] ' : '[F] ') + e.name));
  } catch (e) {
    emit('readdir failed: ' + e.message);
  }

  // Show the active file name and language if available
  const ed = vscode.window.activeTextEditor;
  if (ed && ed.document.uri.scheme === 'file') {
    emit('Active file: ' + path.basename(ed.document.uri.fsPath) + ' (' + ed.document.languageId + ')');
  }

  // Final message
  emit('✔ Done');

  // Show a success message in VS Code
  vscode.window.showInformationMessage('Log demo finished. Check "SBH Minimal Log" and the bottom run log.');

  // Stop VM explicitly after completion
  vm.stop();
})();
`.trim();

export const DEFAULT_GIT_ADD_SCRIPT = `
// Git Add: stage all in first workspace (one-click)
// Example: How to run a terminal command from a VS Code extension
// 1. Get the first opened workspace folder path
// 2. Use Node.js child_process.exec to execute a system command (git add .)
// 3. Convert the command output (stdout/stderr) to string and handle it
// 4. Show messages in the VS Code UI

// Import VS Code API
const vscode = require('vscode');
// Import exec from Node.js (used to run system commands)
const { exec } = require('child_process');
const { vm } = statusBarHelper.v1;

(function main(){
  // Get the opened workspace folders
  const ws = vscode.workspace.workspaceFolders;
  if (!ws || !ws.length) {
    console.log('[GitAdd] No workspace folder.');
    vscode.window.showWarningMessage('No workspace folder — cannot run git add.');
    vm.stop();
    return;
  }

  // Get the first workspace's filesystem path
  const cwd = ws[0].uri.fsPath;
  console.log('[GitAdd] cwd:', cwd);

  // Execute the git add . command in the workspace directory
  exec('git add .', { cwd }, (err, stdout, stderr) => {
    if (err) {
      // stderr usually contains error messages
      console.error('[GitAdd] error:', stderr || err.message);
      vscode.window.showErrorMessage('Git add failed: ' + (stderr || err.message));
      vm.stop();
      return;
    }

    // stdout contains the command output (Buffer → string)
    if (stdout && stdout.trim()) console.log(stdout.trim());
    console.log('[GitAdd] done.');

    // Show a success message in VS Code
    vscode.window.showInformationMessage('✅ git add . done');

    vm.stop();
  });
})();
`.trim();

export const DEFAULT_SBH_STORAGE_SCRIPT = `
// Status Bar Helper v1: Demonstrates how to use the custom statusBarHelper API
// Purpose:
//  1. Show how to use custom storage (global & workspace) for key-value data
//  2. Show how to use custom file APIs to read/write text, JSON, and binary data
//  3. Show how to check existence, calculate file sizes, and log results
//  4. Intended for demo/testing inside a VS Code extension with SBH enabled

// Import Node.js Buffer (for binary and base64 handling)
const { Buffer } = require('buffer');

// Destructure storage and files API from statusBarHelper v1
const { storage, files, vm } = statusBarHelper.v1;

function main() {

  // Helper: current timestamp in readable format
  const now = () => new Date().toISOString().replace('T', ' ').replace('Z', '');

  // Helper: pretty-print any value for logging
  const dump = (x) => {
    if (x instanceof Uint8Array)
      return \`Uint8Array(\${x.length}) [\${Array.from(x).slice(0, 16).join(',')}\${x.length > 16 ? ',…' : ''}]\`;
    try { return JSON.stringify(x, null, 2); } catch { return String(x); }
  };

  // Helper: prefixed log output
  const log = (...a) => console.log('[SBH]', ...a.map(dump));

  (async () => {
    log('▶ start', now());

    // ─────────────── storage / global ───────────────
    log('— storage / global —');
    const gPrev = await storage.global.get('demo.keep', { runs: 0 });
    await storage.global.set('demo.keep', { ...gPrev, runs: (gPrev.runs || 0) + 1, ts: now(), from: 'global' });
    log('get keep =', await storage.global.get('demo.keep', null));
    log('keys =', await storage.global.keys());

    // ─────────────── storage / workspace ───────────────
    log('— storage / workspace —');
    try {
      const wPrev = await storage.workspace.get('demo.keep', { runs: 0 });
      await storage.workspace.set('demo.keep', { ...wPrev, runs: (wPrev.runs || 0) + 1, ts: now(), from: 'workspace' });
      log('get keep =', await storage.workspace.get('demo.keep', null));
      log('keys =', await storage.workspace.keys());
    } catch (e) {
      log('workspace storage not available:', e?.message || e);
    }

    // ─────────────── files API ───────────────
    const dirs = await files.dirs();
    log('dirs =', dirs);

    // Text file (global scope)
    const txtRel = 'demo/notes/hello.txt';
    const txtOld = (await files.exists('global', txtRel)) ? await files.readText('global', txtRel) : '';
    await files.writeText('global', txtRel, txtOld + \`hello @ \${now()}\\n\`);
    log('readText:', await files.readText('global', txtRel));

    // JSON file (workspace if available, otherwise global)
    /** @type {'global'|'workspace'} */
    const jsonScope = dirs.workspace ? 'workspace' : 'global';
    const jsonRel = 'demo/data/sample.json';
    const cur = (await files.exists(jsonScope, jsonRel))
      ? await files.readJSON(jsonScope, jsonRel)
      : { a: 1, createdAt: now() };
    cur.updatedAt = now();
    cur.count = (cur.count || 0) + 1;
    await files.writeJSON(jsonScope, jsonRel, cur);
    log('readJSON:', await files.readJSON(jsonScope, jsonRel));

    // Binary file (Uint8Array)
    const binRel = 'demo/bin/demo.bin';
    await files.writeBytes('global', binRel, new Uint8Array([1, 2, 3, 4, 5, 254, 255]));
    log('readBytes demo.bin:', await files.readBytes('global', binRel));

    // Binary file (base64 string)
    const b64Rel = 'demo/bin/base64.bin';
    await files.writeBytes('global', b64Rel, Buffer.from([9, 8, 7, 6]).toString('base64'));
    log('exists base64.bin:', await files.exists('global', b64Rel));

    // Simulated list of known demo files + calculate size
    /** @type {Array<{scope:'global'|'workspace', rel:string, type:'text'|'json'|'bytes'}>} */
    const candidates = [
      { scope: 'global', rel: 'demo/notes/hello.txt', type: 'text' },
      { scope: jsonScope, rel: 'demo/data/sample.json', type: 'json' },
      { scope: 'global', rel: 'demo/bin/demo.bin', type: 'bytes' },
      { scope: 'global', rel: 'demo/bin/base64.bin', type: 'bytes' },
      { scope: 'global', rel: 'demo/tmp/kept.txt', type: 'text' },
    ];

    /** @type {Array<{scope:string, path:string, type:string, size:number}>} */
    const rows = [];
    for (const c of candidates) {
      if (await files.exists(c.scope, c.rel)) {
        let size = 0;
        if (c.type === 'text') {
          const s = await files.readText(c.scope, c.rel);
          size = Buffer.byteLength(s, 'utf8');
        } else if (c.type === 'json') {
          const obj = await files.readJSON(c.scope, c.rel);
          size = Buffer.byteLength(JSON.stringify(obj), 'utf8');
        } else {
          const b = await files.readBytes(c.scope, c.rel);
          size = b?.length || 0;
        }
        rows.push({ scope: c.scope, path: c.rel, type: c.type, size });
      }
    }
    log('files (simulated list):', rows);

    // // Optional cleanup — user can delete via UI or uncomment below:
    // await storage.global.remove('demo.keep');
    // await storage.workspace.remove('demo.keep').catch(()=>{});
    // await files.remove('global', b64Rel);

    log('✔ done', now());
    vm.stop();
  })().catch(e => {
    console.error('❌', e);
    vm.stop();
  });
}

main();
`.trim();

export const DEFAULT_TOGGLE_THEME_SCRIPT = `
// Toggle between Light and Dark themes in VS Code (one-click)
// Purpose: Demonstrates how to trigger a built-in VS Code command from a script
// Note: This uses 'workbench.action.toggleLightDarkThemes' which toggles the current color theme

const vscode = require('vscode');
const { vm } = statusBarHelper.v1;

(async () => {
  try {
    // Execute the built-in toggle theme command
    await vscode.commands.executeCommand('workbench.action.toggleLightDarkThemes');
  } catch (e) {
    // Show an error message in VS Code if the command fails
    vscode.window.showErrorMessage('Toggle theme failed: ' + (e?.message || e));
  } finally {
    vm.stop();
  }
})();
`.trim();

export const DEFAULT_WHITEBOARD_SCRIPT = `
// Whiteboard (no save): draw-only Webview + Export PNG + correct Undo/Redo scaling
const vscode = require('vscode');
const fs = require('fs');
const path = require('path');
const { vm } = statusBarHelper.v1;

(function main(){
  const panel = vscode.window.createWebviewPanel(
    'sbhWhiteboard',
    'Whiteboard — Draw Only',
    vscode.ViewColumn.Active,
    { enableScripts: true, retainContextWhenHidden: true }
  );

  vm.onStop(reason => {
    try { panel.dispose(); } catch {}
  });

  panel.onDidDispose(() => {
    vm.stop();
  });

  const nonce = Math.random().toString(36).slice(2);
  panel.webview.html = getHtml(nonce);

  // 接收 webview 的匯出請求 → 存檔
  panel.webview.onDidReceiveMessage(async (msg) => {
    if (msg?.type !== 'exportPNG' || typeof msg.dataURL !== 'string') return;
    try {
      const now = new Date();
      const y = now.getFullYear();
      const m = String(now.getMonth()+1).padStart(2,'0');
      const d = String(now.getDate()).padStart(2,'0');
      const hh = String(now.getHours()).padStart(2,'0');
      const mm = String(now.getMinutes()).padStart(2,'0');
      const ss = String(now.getSeconds()).padStart(2,'0');
      const defaultName = \`whiteboard-\${y}\${m}\${d}-\${hh}\${mm}\${ss}.png\`;

      const uri = await vscode.window.showSaveDialog({
        saveLabel: 'Export PNG',
        defaultUri: vscode.Uri.file(path.join(process.cwd(), defaultName)),
        filters: { 'PNG Image': ['png'] }
      });
      if (!uri) return;

      const base64 = msg.dataURL.split(',')[1] || '';
      fs.writeFileSync(uri.fsPath, Buffer.from(base64, 'base64'));

      vscode.window.showInformationMessage(\`✅ Exported: \${path.basename(uri.fsPath)}\`);
      panel.webview.postMessage({ type: 'exported', file: uri.fsPath });
    } catch (e) {
      vscode.window.showErrorMessage('Export failed: ' + (e?.message || e));
    }
  });

  function getHtml(nonce){
    return \`<!doctype html>
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data:; style-src 'unsafe-inline'; script-src 'nonce-\${nonce}';">
<title>Whiteboard (Draw Only)</title>
<style>
  :root{ --h:32px }
  body{font-family:var(--vscode-font-family);color:var(--vscode-foreground);background:var(--vscode-editor-background);margin:0}
  .bar{display:flex;align-items:center;gap:8px;border-bottom:1px solid var(--vscode-editorGroup-border);padding:6px 8px;height:var(--h);user-select:none;background:var(--vscode-sideBar-background)}
  .bar input[type="color"]{width:28px;height:20px;border:1px solid var(--vscode-input-border);background:var(--vscode-input-background)}
  .bar input[type="range"]{width:120px}
  button{background:var(--vscode-button-background);color:var(--vscode-button-foreground);border:1px solid var(--vscode-button-border,transparent);padding:4px 10px;border-radius:4px;cursor:pointer}
  button:hover{background:var(--vscode-button-hoverBackground)}
  #wrap{position:relative;height:calc(100vh - var(--h) - 2px)}
  canvas{width:100%;height:100%}
  #grid{position:absolute;inset:0;background:
        linear-gradient(to right, transparent 99%, var(--vscode-editorGroup-border) 0) 0 0/20px 20px,
        linear-gradient(to bottom, transparent 99%, var(--vscode-editorGroup-border) 0) 0 0/20px 20px;pointer-events:none;opacity:.2}
  #msg{margin-left:auto;opacity:.85;font-size:.9em}
</style>
<div class="bar">
  <span>Color</span><input id="color" type="color" value="#00d3a7">
  <span>Size</span><input id="size" type="range" min="1" max="32" value="4">
  <button id="undo">Undo</button>
  <button id="redo">Redo</button>
  <button id="clear">Clear</button>
  <span style="flex:1"></span>
  <button id="export">Export PNG</button>
  <span id="msg"></span>
</div>
<div id="wrap">
  <canvas id="c"></canvas>
  <div id="grid"></div>
</div>
<script nonce="\${nonce}">
  const vscode = acquireVsCodeApi();
  const c = document.getElementById('c');
  const ctx = c.getContext('2d');
  let drawing=false, last=null;
  let color=document.getElementById('color').value;
  let size=+document.getElementById('size').value;
  const undoStack=[], redoStack=[];
  const msgEl = document.getElementById('msg');

  function flash(t){ msgEl.textContent=t; setTimeout(()=>msgEl.textContent='', 2000); }
  function dpr(){ return window.devicePixelRatio || 1; }
  function applyScale(){ ctx.setTransform(1,0,0,1,0,0); ctx.scale(dpr(), dpr()); }

  function resize(){
    const r=c.getBoundingClientRect();
    const tmp=document.createElement('canvas');
    tmp.width=c.width; tmp.height=c.height;
    tmp.getContext('2d').drawImage(c,0,0);

    c.width = Math.max(1, Math.round(r.width  * dpr()));
    c.height= Math.max(1, Math.round(r.height * dpr()));
    applyScale();
    try { ctx.drawImage(tmp, 0,0, tmp.width, tmp.height, 0,0, c.width, c.height); } catch {}
  }
  new ResizeObserver(resize).observe(document.getElementById('wrap'));
  setTimeout(resize,0);

  function line(p1,p2){
    ctx.strokeStyle=color; ctx.lineWidth=size; ctx.lineCap='round'; ctx.lineJoin='round';
    ctx.beginPath(); ctx.moveTo(p1.x,p1.y); ctx.lineTo(p2.x,p2.y); ctx.stroke();
  }
  function pos(e){ const r=c.getBoundingClientRect(); return { x:e.clientX-r.left, y:e.clientY-r.top }; }

  function makeSnap(){ return { w: c.width, h: c.height, url: c.toDataURL('image/png') }; }
  function snapshot(){ try{ undoStack.push(makeSnap()); if(undoStack.length>30) undoStack.shift(); }catch{} redoStack.length=0; }
  function restore(snap){
    return new Promise(res=>{
      const img=new Image();
      img.onload=()=>{
        ctx.setTransform(1,0,0,1,0,0);
        ctx.clearRect(0,0,c.width,c.height);
        ctx.drawImage(img, 0,0, snap.w, snap.h, 0,0, c.width, c.height);
        applyScale();
        res();
      };
      img.src=snap.url;
    });
  }

  c.addEventListener('pointerdown', e=>{ e.preventDefault(); snapshot(); drawing=true; last=pos(e); });
  c.addEventListener('pointermove', e=>{ if(!drawing) return; const p=pos(e); line(last,p); last=p; });
  c.addEventListener('pointerup',   ()=>{ drawing=false; last=null; });
  c.addEventListener('pointerleave',()=>{ drawing=false; last=null; });

  document.getElementById('color').oninput=e=>color=e.target.value;
  document.getElementById('size').oninput =e=>size=+e.target.value;

  document.getElementById('undo').onclick = async ()=>{
    if(!undoStack.length) return;
    const snap = undoStack.pop();
    redoStack.push(makeSnap());
    await restore(snap);
  };
  document.getElementById('redo').onclick = async ()=>{
    if(!redoStack.length) return;
    const snap = redoStack.pop();
    undoStack.push(makeSnap());
    await restore(snap);
  };
  document.getElementById('clear').onclick = ()=>{
    snapshot();
    ctx.setTransform(1,0,0,1,0,0);
    ctx.clearRect(0,0,c.width,c.height);
    applyScale();
  };

  document.getElementById('export').onclick= ()=>{
    try{
      const url=c.toDataURL('image/png');
      vscode.postMessage({ type:'exportPNG', dataURL: url });
      flash('Exporting…');
    }catch(e){ flash('Export failed'); }
  };
  window.addEventListener('message', e=>{
    const m=e.data||{};
    if(m.type==='exported'){
      const name=(m.file||'').split(/[\\\\/]/).pop()||m.file;
      flash('Saved: '+name);
    }
  });
<\\/script>\`;
  }
})();
`.trim();

export const DEFAULT_POMODORO_SCRIPT = `
// @ts-check
// 🍅 Pomodoro in Status Bar — Quick Pick (Start / Stop, auto-clean on abort)
const vscode = require('vscode');
const { setInterval, clearInterval } = require('timers');
const { randomUUID } = require('crypto');
const { vm } = statusBarHelper.v1;

(function () {
  const DEFAULT_MIN = 25;
  const PRIORITY = 1000;
  const KEY = '__SBH_POMODORO_SINGLETON__';
  /** @type {{
   *  item?: vscode.StatusBarItem,
   *  timer?: NodeJS.Timeout|null,
   *  endAt?: number,
   *  mode?: 'idle'|'running',
   *  minutes?: number,
   *  cmdId?: string,
   *  disposable?: vscode.Disposable|null
   * }} */
  const S = (globalThis[KEY] ||= {
    timer: null, endAt: 0, mode: 'idle', minutes: DEFAULT_MIN, disposable: null
  });

  const fmt = (secs) => {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return \`\${String(m).padStart(2,'0')}:\${String(s).padStart(2,'0')}\`;
  };

  const createItem = () => {
    if (!S.item) {
      S.item = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, PRIORITY);
      S.item.command = getCommandId();
      S.item.tooltip = 'Pomodoro — click to open menu';
      S.item.show();
    }
  };

  const getCommandId = () => {
    if (!S.cmdId) S.cmdId = \`sbh.pomodoro.menu.\${randomUUID()}\`;
    if (!S.disposable) {
      try {
        S.disposable = vscode.commands.registerCommand(S.cmdId, openMenu);
      } catch {}
    }
    return S.cmdId;
  };

  const update = () => {
    if (!S.item) return;
    if (S.mode !== 'running') {
      S.item.text = \`🍅 \${String(S.minutes).padStart(2,'0')}:00\`;
      S.item.tooltip = 'Pomodoro — click to open menu';
      return;
    }
    const remain = Math.max(0, Math.ceil((S.endAt - Date.now()) / 1000));
    S.item.text = \`🍅 \${fmt(remain)}\`;
    S.item.tooltip = 'Counting down — click to open menu';
    if (remain <= 0) finish();
  };

  const start = (minutes = S.minutes) => {
    createItem();
    clearTimer();
    S.minutes = minutes;
    S.endAt = Date.now() + minutes * 60 * 1000;
    S.mode = 'running';
    update();
    S.timer = setInterval(update, 1000);
    vscode.window.showInformationMessage(\`🍅 Started \${minutes} minutes\`);
  };

  const finish = () => {
    clearTimer();
    S.mode = 'idle';
    update();
    vscode.window.showInformationMessage('⏰ Time’s up! Take a break.');
    vscode.window.showWarningMessage('⏰ Pomodoro is over! Start another round?', 'Restart', 'Cancel')
      .then(choice => { if (choice === 'Restart') start(S.minutes); });
  };

  const closeAll = () => {
    clearTimer();
    S.mode = 'idle';
    if (S.item) { S.item.dispose(); S.item = undefined; }
    if (S.disposable) { S.disposable.dispose(); S.disposable = null; }
    S.cmdId = undefined;
  };

  const clearTimer = () => {
    if (S.timer) { clearInterval(S.timer); S.timer = null; }
  };

  async function openMenu() {
    const remain = S.mode === 'running' ? Math.max(0, Math.ceil((S.endAt - Date.now())/1000)) : null;
    /** @type {Array<{label:string, detail?:string, action:'start'|'close'|'custom'|'stop'}>} */
    const picks = [];

    if (S.mode === 'running') {
      picks.push({ label: 'Stop', detail: \`Stop current timer (remaining \${fmt(remain)})\`, action: 'stop' });
      picks.push({ label: 'Start', detail: \`Restart \${S.minutes} minutes\`, action: 'start' });
    } else {
      picks.push({ label: 'Start', detail: \`Start \${S.minutes} minute timer\`, action: 'start' });
    }
    picks.push({ label: 'Custom minutes…', detail: 'Enter 1–120 minutes to start', action: 'custom' });
    picks.push({ label: 'Close', detail: 'Remove status bar item', action: 'close' });

    const picked = await vscode.window.showQuickPick(picks, {
      placeHolder: 'Pomodoro — choose an action',
      ignoreFocusOut: true
    });
    if (!picked) return;

    if (picked.action === 'start') start(S.minutes);
    else if (picked.action === 'stop') { clearTimer(); S.mode = 'idle'; update(); }
    else if (picked.action === 'close') closeAll();
    else if (picked.action === 'custom') {
      const v = await vscode.window.showInputBox({
        prompt: 'Enter minutes (1–120)',
        value: String(S.minutes),
        validateInput: (s) => {
          const n = Number(s);
          if (!Number.isFinite(n) || n < 1 || n > 120) return 'Enter an integer between 1 and 120';
          return null;
        }
      });
      if (v) start(Number(v));
    }
  }

  // Automatically clean up when externally stopped (e.g., rerun, delete, hide, script change, or disable).
  vm.onStop(reason => {
    try { closeAll(); } catch {}
  });

  createItem();
  update();
})();`.trim();

// ─────────────────────────────────────────────────────────────
// ▼ New Examples: VM Messaging (A / B) — demonstrate vm.open / vm.sendMessage / vm.onMessage
// Each script opens a simple Webview with:
//  - A button to open the peer script (starts if not running) and optionally send an initial payload
//  - A text input + Send button to send typed message to the peer
//  - A log area that appends received messages (with timestamp and sender)
//  - Uses vm.onMessage to receive data; vm.sendMessage to send; vm.open to ensure peer running
//  - When this VM stops (rerun / stop / item removed) the panel is disposed
//  - Very small / minimal UI for clarity (not styled heavily)
// -----------------------------------------------------------------------------
export const DEFAULT_VM_CHAT_A_SCRIPT =
  "// VM Chat A — demonstrates vm.open / vm.sendMessage / vm.onMessage / vm.stopByCommand / vm.stop / vm.onStop\n// Commands assumed:\n//   A: sbh.demo.vmChatA\n//   B: sbh.demo.vmChatB\nconst vscode = require('vscode');\nconst { vm } = statusBarHelper.v1;\n\n(function main () {\n  const SELF = 'sbh.demo.vmChatA';\n  const PEER = 'sbh.demo.vmChatB';\n  let panel;\n\n  vm.onStop(() => { try { panel?.dispose(); } catch {} });\n\n  function ensurePanel () {\n    if (panel) return panel;\n    panel = vscode.window.createWebviewPanel(\n      'sbhVmChatA',\n      'VM Chat A',\n      vscode.ViewColumn.Active,\n      { enableScripts: true, retainContextWhenHidden: true }\n    );\n    panel.onDidDispose(() => { try { vm.stop(); } catch {} });\n\n    const nonce = Math.random().toString(36).slice(2);\n    panel.webview.html = getHtml(nonce, 'A', SELF, PEER);\n    panel.webview.onDidReceiveMessage(onWebviewMessage);\n    return panel;\n  }\n\n  function log (line) { try { panel?.webview.postMessage({ type: 'append', line }); } catch {} }\n\n  function onWebviewMessage (msg) {\n    if (!msg || typeof msg !== 'object') return;\n\n    if (msg.type === 'send') {\n      const text = String(msg.text || '').trim();\n      if (!text) return;\n      vm.sendMessage(PEER, { from: SELF, text, at: Date.now() });\n      log('[me -> B] ' + text);\n    } else if (msg.type === 'openPeer') {\n      vm.open(PEER, { from: SELF, text: '👋 Hello (started from A)', at: Date.now() })\n        .catch(e => log('[open error] ' + (e?.message || e)));\n      log('[system] Requested to open B');\n    } else if (msg.type === 'stopPeer') {\n      try { vm.stopByCommand(PEER, { type: 'peerStop', from: SELF, at: Date.now() }); }\n      catch (e) { log('[stopPeer error] ' + (e?.message || e)); }\n      log('[system] Requested to stop B');\n    } else if (msg.type === 'stopSelf') {\n      try { vm.stop({ type: 'selfStop', from: SELF, at: Date.now() }); } catch {}\n    }\n  }\n\n  // Receive messages from peer\n  vm.onMessage((from, payload) => {\n    try {\n      if (from !== PEER) return; // Only show peer messages\n      const text = (payload && payload.text != null) ? String(payload.text) : JSON.stringify(payload);\n      const ts = new Date(payload?.at || Date.now()).toLocaleTimeString();\n      log('[B -> me @ ' + ts + '] ' + text);\n    } catch (e) {\n      log('[recv error] ' + (e?.message || e));\n    }\n  });\n\n  ensurePanel();\n  log('[system] Chat A ready. Use the buttons to interact with Chat B.');\n})();\n\nfunction getHtml (nonce, label, selfCmd, peerCmd) {\n  return `<!doctype html>\n<meta charset=\"utf-8\" />\n<meta http-equiv=\"Content-Security-Policy\" content=\"default-src 'none'; img-src https: data:; style-src 'unsafe-inline'; script-src 'nonce-${nonce}'\">\n<title>VM Chat ${label}</title>\n<style>\n  body{font-family:var(--vscode-font-family);margin:0;background:var(--vscode-editor-background);color:var(--vscode-foreground);}\n  header{padding:8px;border-bottom:1px solid var(--vscode-editorGroup-border);display:flex;gap:8px;align-items:center;flex-wrap:wrap;}\n  button{background:var(--vscode-button-background);color:var(--vscode-button-foreground);border:1px solid var(--vscode-button-border,transparent);padding:4px 10px;border-radius:4px;cursor:pointer;font-size:.9em;}\n  button:hover{background:var(--vscode-button-hoverBackground);}\n  input{flex:1;min-width:160px;padding:4px 6px;background:var(--vscode-input-background);color:var(--vscode-input-foreground);border:1px solid var(--vscode-input-border);border-radius:3px;}\n  #log{padding:8px;font:12px var(--vscode-editor-font-family,monospace);white-space:pre-wrap;overflow:auto;max-height:60vh;}\n  footer{padding:6px 8px;border-top:1px solid var(--vscode-editorGroup-border);font-size:11px;opacity:.7;}\n  .cmd{opacity:.7;font-size:.8em}\n</style>\n<header>\n  <strong>Chat ${label}</strong>\n  <button id=\"openPeer\" title=\"Start peer script if not running\">Open Peer</button>\n  <button id=\"stopPeer\" title=\"Stop peer script\">Stop Peer</button>\n  <button id=\"stopSelf\" title=\"Stop this script\">Stop Self</button>\n  <input id=\"msg\" placeholder=\"Type message…\" />\n  <button id=\"send\">Send</button>\n</header>\n<div id=\"log\" tabindex=\"0\"></div>\n<footer>self: <code>${selfCmd}</code> &nbsp; peer: <code>${peerCmd}</code> — Demonstrating vm.open / vm.sendMessage / vm.onMessage / vm.stopByCommand / vm.stop</footer>\n<script nonce=\"${nonce}\">\n  const vscode = acquireVsCodeApi();\n  const logEl = document.getElementById('log');\n\n  function append(line){\n    const at = new Date().toLocaleTimeString();\n    logEl.textContent += \\`[\\${at}] \\${line}\\\\n\\`;\n    logEl.scrollTop = logEl.scrollHeight;\n  }\n\n  append('script injected');\n\n  window.addEventListener('message', e => {\n    const m = e.data || {};\n    if (m.type === 'append') append(m.line);\n  });\n\n  document.getElementById('send').onclick = () => {\n    const el = document.getElementById('msg');\n    vscode.postMessage({ type: 'send', text: el.value });\n    el.value = '';\n  };\n\n  document.getElementById('openPeer').onclick = () => vscode.postMessage({ type: 'openPeer' });\n  document.getElementById('stopPeer').onclick = () => vscode.postMessage({ type: 'stopPeer' });\n  document.getElementById('stopSelf').onclick = () => vscode.postMessage({ type: 'stopSelf' });\n\n  document.getElementById('msg').addEventListener('keydown', e => {\n    if (e.key === 'Enter') document.getElementById('send').click();\n  });\n\n  append('UI loaded.');\n</script>`;\n}\n";

export const DEFAULT_VM_CHAT_B_SCRIPT =
  "// VM Chat B — demonstrates vm.open / vm.sendMessage / vm.onMessage / vm.stopByCommand / vm.stop /  vm.onStop\n// Commands assumed:\n//   A: sbh.demo.vmChatA\n//   B: sbh.demo.vmChatB\nconst vscode = require('vscode');\nconst { vm } = statusBarHelper.v1;\n\n(function main () {\n  const SELF = 'sbh.demo.vmChatB';\n  const PEER = 'sbh.demo.vmChatA';\n  let panel;\n\n  vm.onStop(() => { try { panel?.dispose(); } catch {} });\n\n  function ensurePanel () {\n    if (panel) return panel;\n    panel = vscode.window.createWebviewPanel(\n      'sbhVmChatB',\n      'VM Chat B',\n      vscode.ViewColumn.Active,\n      { enableScripts: true, retainContextWhenHidden: true }\n    );\n    panel.onDidDispose(() => { try { vm.stop(); } catch {} });\n\n    const nonce = Math.random().toString(36).slice(2);\n    panel.webview.html = getHtml(nonce, 'B', SELF, PEER);\n    panel.webview.onDidReceiveMessage(onWebviewMessage);\n    return panel;\n  }\n\n  function log (line) { try { panel?.webview.postMessage({ type: 'append', line }); } catch {} }\n\n  function onWebviewMessage (msg) {\n    if (!msg || typeof msg !== 'object') return;\n\n    if (msg.type === 'send') {\n      const text = String(msg.text || '').trim();\n      if (!text) return;\n      vm.sendMessage(PEER, { from: SELF, text, at: Date.now() });\n      log('[me -> A] ' + text);\n    } else if (msg.type === 'openPeer') {\n      vm.open(PEER, { from: SELF, text: '👋 Hello (started from B)', at: Date.now() })\n        .catch(e => log('[open error] ' + (e?.message || e)));\n      log('[system] Requested to open A');\n    } else if (msg.type === 'stopPeer') {\n      try { vm.stopByCommand(PEER, { type: 'peerStop', from: SELF, at: Date.now() }); }\n      catch (e) { log('[stopPeer error] ' + (e?.message || e)); }\n      log('[system] Requested to stop A');\n    } else if (msg.type === 'stopSelf') {\n      try { vm.stop({ type: 'selfStop', from: SELF, at: Date.now() }); } catch {}\n    }\n  }\n\n  // Receive messages from peer\n  vm.onMessage((from, payload) => {\n    try {\n      if (from !== PEER) return; // Only show peer messages\n      const text = (payload && payload.text != null) ? String(payload.text) : JSON.stringify(payload);\n      const ts = new Date(payload?.at || Date.now()).toLocaleTimeString();\n      log('[A -> me @ ' + ts + '] ' + text);\n    } catch (e) {\n      log('[recv error] ' + (e?.message || e));\n    }\n  });\n\n  ensurePanel();\n  log('[system] Chat B ready. Use the buttons to interact with Chat A.');\n})();\n\nfunction getHtml (nonce, label, selfCmd, peerCmd) {\n  return `<!doctype html>\n<meta charset=\"utf-8\" />\n<meta http-equiv=\"Content-Security-Policy\" content=\"default-src 'none'; img-src https: data:; style-src 'unsafe-inline'; script-src 'nonce-${nonce}'\">\n<title>VM Chat ${label}</title>\n<style>\n  body{font-family:var(--vscode-font-family);margin:0;background:var(--vscode-editor-background);color:var(--vscode-foreground);}\n  header{padding:8px;border-bottom:1px solid var(--vscode-editorGroup-border);display:flex;gap:8px;align-items:center;flex-wrap:wrap;}\n  button{background:var(--vscode-button-background);color:var(--vscode-button-foreground);border:1px solid var(--vscode-button-border,transparent);padding:4px 10px;border-radius:4px;cursor:pointer;font-size:.9em;}\n  button:hover{background:var(--vscode-button-hoverBackground);}\n  input{flex:1;min-width:160px;padding:4px 6px;background:var(--vscode-input-background);color:var(--vscode-input-foreground);border:1px solid var(--vscode-input-border);border-radius:3px;}\n  #log{padding:8px;font:12px var(--vscode-editor-font-family,monospace);white-space:pre-wrap;overflow:auto;max-height:60vh;}\n  footer{padding:6px 8px;border-top:1px solid var(--vscode-editorGroup-border);font-size:11px;opacity:.7;}\n  .cmd{opacity:.7;font-size:.8em}\n</style>\n<header>\n  <strong>Chat ${label}</strong>\n  <button id=\"openPeer\" title=\"Start peer script if not running\">Open Peer</button>\n  <button id=\"stopPeer\" title=\"Stop peer script\">Stop Peer</button>\n  <button id=\"stopSelf\" title=\"Stop this script\">Stop Self</button>\n  <input id=\"msg\" placeholder=\"Type message…\" />\n  <button id=\"send\">Send</button>\n</header>\n<div id=\"log\" tabindex=\"0\"></div>\n<footer>self: <code>${selfCmd}</code> &nbsp; peer: <code>${peerCmd}</code> — Demonstrating vm.open / vm.sendMessage / vm.onMessage / vm.stopByCommand / vm.stop</footer>\n<script nonce=\"${nonce}\">\n  const vscode = acquireVsCodeApi();\n  const logEl = document.getElementById('log');\n\n  function append(line){\n    const at = new Date().toLocaleTimeString();\n    logEl.textContent += \\`[\\${at}] \\${line}\\\\n\\`;\n    logEl.scrollTop = logEl.scrollHeight;\n  }\n\n  append('script injected');\n\n  window.addEventListener('message', e => {\n    const m = e.data || {};\n    if (m.type === 'append') append(m.line);\n  });\n\n  document.getElementById('send').onclick = () => {\n    const el = document.getElementById('msg');\n    vscode.postMessage({ type: 'send', text: el.value });\n    el.value = '';\n  };\n\n  document.getElementById('openPeer').onclick = () => vscode.postMessage({ type: 'openPeer' });\n  document.getElementById('stopPeer').onclick = () => vscode.postMessage({ type: 'stopPeer' });\n  document.getElementById('stopSelf').onclick = () => vscode.postMessage({ type: 'stopSelf' });\n\n  document.getElementById('msg').addEventListener('keydown', e => {\n    if (e.key === 'Enter') document.getElementById('send').click();\n  });\n\n  append('UI loaded.');\n</script>`;\n}\n";
