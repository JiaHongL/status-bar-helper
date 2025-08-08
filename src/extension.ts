import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import * as vm from 'vm';

// ─────────────────────────────────────────────────────────────
// 狀態列項目管理
// ─────────────────────────────────────────────────────────────
let itemDisposables: vscode.Disposable[] = [];
let gearItem: vscode.StatusBarItem | null = null;

function updateStatusBarItems(context: vscode.ExtensionContext) {
  // 清掉舊的
  itemDisposables.forEach(d => d.dispose());
  itemDisposables = [];

  const config = vscode.workspace.getConfiguration('statusBarHelper');
  const items = config.get<any[]>('items', []);

  items.forEach((item, index) => {
    const { text, tooltip, command, script, hidden } = item || {};
    if (!text || !command || hidden) return;

    const statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100 - index);
    statusBarItem.text = text;
    statusBarItem.tooltip = tooltip;
    statusBarItem.command = command;

    // 每個 item 對應一個 command，VM 內執行腳本（允許 vscode + Node 內建模組）
    const commandDisposable = vscode.commands.registerCommand(command, () => {
      if (!script) return;

      const sandbox = {
        vscode,
        fs,
        path,
        process,
        console: console,
        __dirname: path.dirname(context.extensionPath),
        require: (moduleName: string) => {
          if (moduleName === 'vscode') return vscode;
          // 只允許 Node 內建模組
          if (require.resolve(moduleName) === moduleName) return require(moduleName);
          throw new Error(`Only built-in modules are allowed: ${moduleName}`);
        }
      };

      const wrapped = `(function(){ ${script} })();`;
      try {
        vm.runInNewContext(wrapped, sandbox);
      } catch (e: any) {
        vscode.window.showErrorMessage(`❌ Script error: ${e?.message || String(e)}`);
        console.error(e);
      }
    });

    itemDisposables.push(statusBarItem, commandDisposable);
    statusBarItem.show();
  });
}

function refreshGearButton() {
  if (gearItem) { gearItem.dispose(); gearItem = null; }
  const enabled = vscode.workspace.getConfiguration('statusBarHelper')
    .get<boolean>('showGearOnStartup', true); // 無此設定時預設顯示

  if (!enabled) return;

  const item = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
  item.text = '$(gear)';
  item.tooltip = 'Status Bar Helper Settings';
  item.command = 'statusBarHelper.showSettings';
  item.show();
  gearItem = item;
}

// ─────────────────────────────────────────────────────────────
// 預設樣本（第一次安裝/空清單時植入）
// ─────────────────────────────────────────────────────────────
async function ensureDefaultItems(context: vscode.ExtensionContext) {
  const seededKey = 'sbh.seededDefaults.v2'; // bump key for new defaults
  const already = context.globalState.get<boolean>(seededKey);
  const config = vscode.workspace.getConfiguration('statusBarHelper');
  const items = config.get<any[]>('items', []);
  if (already || (Array.isArray(items) && items.length > 0)) return;
  await config.update('items', getDefaultItems(), vscode.ConfigurationTarget.Global);
  await context.globalState.update(seededKey, true);
}

function getDefaultItems(): any[] {
  return [
    {
      text: '$(notebook) Log',
      tooltip: 'VS Code + Node log demo',
      command: 'sbh.demo.logMinimalPlus',
      script: minimalLogScript(),
    },
    {
      text: '$(diff-added) Git Add',
      tooltip: 'Run "git add ." in workspace root',
      command: 'sbh.demo.gitAdd',
      script: gitAddScript(),
    },
    {
      text: '$(paintcan) Board',
      tooltip: 'Whiteboard (draw only)',
      command: 'sbh.demo.whiteboard',
      script: whiteboardNoSaveScript(),
    },
  ];
}

// ─────────────────────────────────────────────────────────────
// 三個預設腳本
// ─────────────────────────────────────────────────────────────
function minimalLogScript(): string {
  return `
// Minimal Log: VS Code + Node (read-only, one-click, dual output)
const vscode = require('vscode');
const fs = require('fs');
const path = require('path');

(function main(){
  const ch = vscode.window.createOutputChannel('SBH Minimal Log');
  const emit = (...a) => { const s = a.join(' '); ch.appendLine(s); console.log(s); };
  ch.show(true);

  emit('▶ Start');
  emit('Node:', process.version, 'Platform:', process.platform + '/' + process.arch);

  const ws = vscode.workspace.workspaceFolders;
  const root = ws && ws.length ? ws[0].uri.fsPath : process.cwd();
  emit('Workdir:', root);

  try {
    fs.readdirSync(root, { withFileTypes: true }).slice(0, 8)
      .forEach(e => emit((e.isDirectory() ? '[D]' : '[F]'), e.name));
  } catch (e) { emit('readdir failed:', e.message); }

  const ed = vscode.window.activeTextEditor;
  if (ed && ed.document.uri.scheme === 'file') {
    emit('Active file:', path.basename(ed.document.uri.fsPath), '(' + ed.document.languageId + ')');
  }

  emit('✔ Done');
  vscode.window.showInformationMessage('Log demo finished. Check "SBH Minimal Log" and bottom run log.');
})();
`.trim();
}

function gitAddScript(): string {
  return `
// Git Add: run "git add ." at workspace root; log to Output and bottom panel
const vscode = require('vscode');
const { exec } = require('child_process');

(function main(){
  const folders = vscode.workspace.workspaceFolders;
  if (!folders || folders.length === 0) {
    console.log('[git add] no workspace');
    vscode.window.showWarningMessage('No workspace open — cannot run git add.');
    return;
  }

  const cwd = folders[0].uri.fsPath;
  console.log('[git add] cwd:', cwd);

  const ch = vscode.window.createOutputChannel('SBH Git');
  ch.show(true);
  ch.appendLine('▶ git add .');

  exec('git add .', { cwd }, (err, stdout, stderr) => {
    if (stdout) { ch.append(stdout); console.log(stdout.trim()); }
    if (stderr) { ch.append(stderr); console.log(stderr.trim()); }

    if (err) {
      ch.appendLine('✖ git add failed');
      vscode.window.showErrorMessage('Git add failed: ' + (stderr || err.message));
      return;
    }

    ch.appendLine('✔ git add done');
    vscode.window.showInformationMessage('✅ git add . done');
  });
})();
`.trim();
}

function whiteboardNoSaveScript(): string {
  return `
// Whiteboard (no save): draw-only Webview with color/size, undo/redo, clear
const vscode = require('vscode');

(function main(){
  const panel = vscode.window.createWebviewPanel(
    'sbhWhiteboard',
    'Whiteboard — Draw Only',
    vscode.ViewColumn.Active,
    { enableScripts: true, retainContextWhenHidden: true }
  );

  const nonce = Math.random().toString(36).slice(2);
  panel.webview.html = getHtml(nonce);

  function getHtml(nonce){
    let html = '';
    html += '<!doctype html>\\n';
    html += '<meta http-equiv="Content-Security-Policy" content="default-src \\'none\\'; img-src data:; style-src \\'unsafe-inline\\'; script-src \\'nonce-' + nonce + '\\';">\\n';
    html += '<title>Whiteboard (Draw Only)</title>\\n';
    html += '<style>\\n';
    html += '  :root{ --h:32px }\\n';
    html += '  body{font-family:var(--vscode-font-family);color:var(--vscode-foreground);background:var(--vscode-editor-background);margin:0}\\n';
    html += '  .bar{display:flex;align-items:center;gap:8px;border-bottom:1px solid var(--vscode-editorGroup-border);padding:6px 8px;height:var(--h);user-select:none;background:var(--vscode-sideBar-background)}\\n';
    html += '  .bar input[type="color"]{width:28px;height:20px;border:1px solid var(--vscode-input-border);background:var(--vscode-input-background)}\\n';
    html += '  .bar input[type="range"]{width:120px}\\n';
    html += '  button{background:var(--vscode-button-background);color:var(--vscode-button-foreground);border:1px solid var(--vscode-button-border,transparent);padding:4px 10px;border-radius:4px;cursor:pointer}\\n';
    html += '  button:hover{background:var(--vscode-button-hoverBackground)}\\n';
    html += '  #wrap{position:relative;height:calc(100vh - var(--h) - 2px)}\\n';
    html += '  canvas{width:100%;height:100%}\\n';
    html += '  #grid{position:absolute;inset:0;background:' +
            'linear-gradient(to right, transparent 99%, var(--vscode-editorGroup-border) 0) 0 0/20px 20px,' +
            'linear-gradient(to bottom, transparent 99%, var(--vscode-editorGroup-border) 0) 0 0/20px 20px;pointer-events:none;opacity:.2}\\n';
    html += '</style>\\n';
    html += '<div class="bar">\\n';
    html += '  <span>Color</span><input id="color" type="color" value="#00d3a7">\\n';
    html += '  <span>Size</span><input id="size" type="range" min="1" max="32" value="4">\\n';
    html += '  <button id="undo">Undo</button>\\n';
    html += '  <button id="redo">Redo</button>\\n';
    html += '  <button id="clear">Clear</button>\\n';
    html += '</div>\\n';
    html += '<div id="wrap">\\n';
    html += '  <canvas id="c"></canvas>\\n';
    html += '  <div id="grid"></div>\\n';
    html += '</div>\\n';
    html += '<script nonce="' + nonce + '">\\n';
    html += '  const c = document.getElementById(\\'c\\'); const ctx = c.getContext(\\'2d\\');\\n';
    html += '  let drawing=false, last=null; let color=document.getElementById(\\'color\\').value; let size=+document.getElementById(\\'size\\').value;\\n';
    html += '  const undoStack=[], redoStack=[];\\n';
    html += '  function snapshot(){ undoStack.push(c.toDataURL()); if(undoStack.length>30) undoStack.shift(); redoStack.length=0; }\\n';
    html += '  function restore(url){ return new Promise(res=>{ const img=new Image(); img.onload=()=>{ ctx.clearRect(0,0,c.width,c.height); ctx.drawImage(img,0,0); res(); }; img.src=url; }); }\\n';
    html += '  function resize(){ const r=c.getBoundingClientRect(); const tmp=document.createElement(\\'canvas\\'); tmp.width=r.width*devicePixelRatio; tmp.height=r.height*devicePixelRatio; const tctx=tmp.getContext(\\'2d\\'); tctx.drawImage(c,0,0); c.width=r.width*devicePixelRatio; c.height=r.height*devicePixelRatio; ctx.setTransform(1,0,0,1,0,0); ctx.scale(devicePixelRatio,devicePixelRatio); ctx.drawImage(tmp,0,0); }\\n';
    html += '  new ResizeObserver(resize).observe(document.getElementById(\\'wrap\\')); setTimeout(resize,0);\\n';
    html += '  function line(p1,p2){ ctx.strokeStyle=color; ctx.lineWidth=size; ctx.lineCap=\\'round\\'; ctx.lineJoin=\\'round\\'; ctx.beginPath(); ctx.moveTo(p1.x,p1.y); ctx.lineTo(p2.x,p2.y); ctx.stroke(); }\\n';
    html += '  function pos(e){ const r=c.getBoundingClientRect(); return { x:e.clientX-r.left, y:e.clientY-r.top }; }\\n';
    html += '  c.addEventListener(\\'pointerdown\\', e=>{ e.preventDefault(); snapshot(); drawing=true; last=pos(e); });\\n';
    html += '  c.addEventListener(\\'pointermove\\', e=>{ if(!drawing) return; const p=pos(e); line(last,p); last=p; });\\n';
    html += '  c.addEventListener(\\'pointerup\\', ()=>{ drawing=false; last=null; });\\n';
    html += '  c.addEventListener(\\'pointerleave\\', ()=>{ drawing=false; last=null; });\\n';
    html += '  document.getElementById(\\'color\\').oninput=e=>color=e.target.value;\\n';
    html += '  document.getElementById(\\'size\\').oninput =e=>size=+e.target.value;\\n';
    html += '  document.getElementById(\\'undo\\').onclick= async ()=>{ if(!undoStack.length) return; const snap=undoStack.pop(); undoStack.push(c.toDataURL()); await restore(snap); };\\n';
    html += '  document.getElementById(\\'redo\\').onclick= async ()=>{ if(!redoStack.length) return; const snap=redoStack.pop(); undoStack.push(c.toDataURL()); await restore(snap); };\\n';
    html += '  document.getElementById(\\'clear\\').onclick= ()=>{ snapshot(); ctx.clearRect(0,0,c.width,c.height); };\\n';
    html += '<\\/script>';
    return html;
  }
})();
`.trim();
}

// ─────────────────────────────────────────────────────────────
// 啟動/釋放
// ─────────────────────────────────────────────────────────────
export async function activate(context: vscode.ExtensionContext) {
  console.log('✅ Status Bar Helper Activated (lazy import)');

  // 1) 植入預設項目（若目前為空）
  await ensureDefaultItems(context);

  // 2) 建立使用者自訂的狀態列項目
  updateStatusBarItems(context);

  // 3) 註冊指令：用到才載入 SettingsPanel（lazy import）
  const showSettings = vscode.commands.registerCommand('statusBarHelper.showSettings', async () => {
    const { SettingsPanel } = await import('./SettingsPanel.js'); // ← lazy import
    SettingsPanel.createOrShow(context.extensionUri);
  });
  context.subscriptions.push(showSettings);

  // 4) 顯示右下角齒輪（可由設定關閉）
  refreshGearButton();

  // 5) 設定變更時更新
  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration(e => {
      if (e.affectsConfiguration('statusBarHelper.items')) {
        updateStatusBarItems(context);
      }
      if (e.affectsConfiguration('statusBarHelper.showGearOnStartup')) {
        refreshGearButton();
      }
    })
  );
}

export function deactivate() {
  if (gearItem) { gearItem.dispose(); gearItem = null; }
  itemDisposables.forEach(d => d.dispose());
}
