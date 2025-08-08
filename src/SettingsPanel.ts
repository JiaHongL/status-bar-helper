import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import * as vm from 'vm';
import { spawn, ChildProcessWithoutNullStreams } from 'child_process';

export class SettingsPanel {
  public static currentPanel: SettingsPanel | undefined;
  private readonly _panel: vscode.WebviewPanel;
  private readonly _extensionUri: vscode.Uri;
  private _disposables: vscode.Disposable[] = [];

  private _activeView: 'list' | 'edit' = 'list';
  private _editingItem: any = null;

  // Smart Run
  private _nodeChild: ChildProcessWithoutNullStreams | null = null;
  private _runningVm = false;

  private constructor(panel: vscode.WebviewPanel, extensionUri: vscode.Uri) {
    this._panel = panel;
    this._extensionUri = extensionUri;

    this._panel.onDidDispose(() => this.dispose(), null, this._disposables);

    this._panel.webview.onDidReceiveMessage(
      async (message) => {
        switch (message.command) {
          case 'confirmDiscard': {
            vscode.window
              .showWarningMessage('Discard changes?', { modal: true }, 'Discard', 'Cancel')
              .then((selection) => {
                this._panel.webview.postMessage({
                  command: 'confirmDiscardResult',
                  token: message.token,
                  choice: selection || 'Cancel',
                });
              });
            return;
          }
          case 'updateSettings': {
            await vscode.workspace.getConfiguration('statusBarHelper')
              .update('items', message.items, vscode.ConfigurationTarget.Global);
            this._activeView = 'list';
            this._editingItem = null;
            return;
          }
          case 'getSettings': {
            this._sendStateToWebview();
            return;
          }
          case 'enterEditView': {
            this._activeView = 'edit';
            this._editingItem = message.item;
            return;
          }
          case 'exitEditView': {
            this._activeView = 'list';
            this._editingItem = null;
            return;
          }
          case 'showError': {
            vscode.window.showErrorMessage(message.message);
            return;
          }
          case 'exportSettings': {
            const items = message.items;
            const now = new Date();
            const y = now.getFullYear();
            const m = String(now.getMonth() + 1).padStart(2, '0');
            const d = String(now.getDate()).padStart(2, '0');
            const hh = String(now.getHours()).padStart(2, '0');
            const mm = String(now.getMinutes()).padStart(2, '0');
            const ss = String(now.getSeconds()).padStart(2, '0');
            const defaultName = `status-bar-helper-${y}-${m}-${d}-${hh}-${mm}-${ss}.json`;

            const workspaceFolders = vscode.workspace.workspaceFolders;
            let defaultUri: vscode.Uri | undefined;
            if (workspaceFolders && workspaceFolders.length > 0) {
              defaultUri = vscode.Uri.joinPath(workspaceFolders[0].uri, defaultName);
            }

            vscode.window.showSaveDialog({
              defaultUri,
              saveLabel: 'Export Settings',
              filters: { 'JSON': ['json'] }
            }).then(uri => {
              if (uri) {
                fs.writeFileSync(uri.fsPath, JSON.stringify(items, null, 2));
                vscode.window.showInformationMessage('Settings exported successfully.');
              }
            });
            return;
          }
          case 'importSettings': {
            vscode.window.showOpenDialog({ canSelectMany: false, filters: { 'JSON': ['json'] } }).then(async (uris) => {
              if (uris && uris.length > 0) {
                const uri = uris[0];
                const content = fs.readFileSync(uri.fsPath, 'utf8');
                try {
                  const items = JSON.parse(content);
                  if (Array.isArray(items)) {
                    await vscode.workspace.getConfiguration('statusBarHelper')
                      .update('items', items, vscode.ConfigurationTarget.Global);
                    this._sendStateToWebview();
                    this._panel.webview.postMessage({ command: 'importDone', items });
                    vscode.window.showInformationMessage('Settings imported successfully.');
                  } else {
                    vscode.window.showErrorMessage('Invalid file format.');
                  }
                } catch (e) {
                  vscode.window.showErrorMessage('Error parsing settings file.');
                }
              }
            });
            return;
          }

          // === Restore defaults ===
          case 'restoreDefaults': {
            const cfg = vscode.workspace.getConfiguration('statusBarHelper');
            const items = cfg.get<any[]>('items', []) || [];
            const defaults = buildDefaultItems();

            const pick = await vscode.window.showWarningMessage(
              'Restore sample items?',
              { modal: true },
              'Replace All', 'Append', 'Cancel'
            );
            if (!pick || pick === 'Cancel') return;

            let next: any[] = [];
            if (pick === 'Replace All') {
              next = defaults;
            } else {
              const exists = new Set(items.map(i => i?.command));
              const toAdd = defaults.filter(d => !exists.has(d.command));
              next = items.concat(toAdd);
            }

            await cfg.update('items', next, vscode.ConfigurationTarget.Global);
            this._activeView = 'list';
            this._editingItem = null;
            this._sendStateToWebview();
            vscode.window.showInformationMessage(
              pick === 'Replace All' ? 'Replaced with sample items.' : 'Appended sample items (no duplicates).'
            );
            return;
          }

          // === Smart Run ===
          case 'runScript': {
            const code: string = message.code || '';
            this._runInNode(code);
            return;
          }
          case 'runScriptTrusted': {
            const code: string = message.code || '';
            this._runInVm(code);
            return;
          }
          case 'stopRun': {
            this._stopRun();
            return;
          }
        }
      },
      null,
      this._disposables
    );

    this._panel.onDidChangeViewState(
      e => {
        if (!e.webviewPanel.visible) return;
        if (this._activeView === 'list') {
          this._sendStateToWebview();
        } else {
          this._panel.webview.postMessage({ command: 'becameVisible' });
        }
      },
      null,
      this._disposables
    );

    this._update();
  }

  public static createOrShow(extensionUri: vscode.Uri) {
    const column = vscode.window.activeTextEditor
      ? vscode.window.activeTextEditor.viewColumn
      : undefined;

    if (SettingsPanel.currentPanel) {
      SettingsPanel.currentPanel._panel.reveal(column);
      return;
    }

    const panel = vscode.window.createWebviewPanel(
      'statusBarHelperSettings',
      'StatusBar Helper Settings',
      column || vscode.ViewColumn.One,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [
          vscode.Uri.joinPath(extensionUri, 'media'),
          vscode.Uri.joinPath(extensionUri, 'out')
        ]
      }
    );

    SettingsPanel.currentPanel = new SettingsPanel(panel, extensionUri);
  }

  private _update() {
    const webview = this._panel.webview;
    this._panel.title = 'StatusBar Helper Settings';
    this._panel.webview.html = this._getHtmlForWebview(webview);
    this._sendStateToWebview();
  }

  private _readTypeDefinitions(baseDir: string, dirPath: string): { path: string, content: string }[] {
    const files: { path: string, content: string }[] = [];
    try {
      const entries = fs.readdirSync(dirPath, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = path.join(dirPath, entry.name);
        if (entry.isDirectory()) {
          files.push(...this._readTypeDefinitions(baseDir, fullPath));
        } else if (entry.isFile() && entry.name.endsWith('.d.ts')) {
          const content = fs.readFileSync(fullPath, 'utf8');
          const virtualPath = 'file:///' + path.relative(baseDir, fullPath).replace(/\\/g, '/');
          files.push({ path: virtualPath, content });
        }
      }
    } catch (error) {
      console.error(`Error reading directory ${dirPath}:`, error);
    }
    return files;
  }

  private _sendStateToWebview() {
    const config = vscode.workspace.getConfiguration('statusBarHelper');
    const items = config.get<any[]>('items', []);

    let typeDefs: { node: any[], vscode: string } | null = null;
    try {
      const nodeTypeDefsDir = path.join(this._extensionUri.fsPath, 'out', 'typedefs', 'node');
      const nodeTypeDefs = this._readTypeDefinitions(nodeTypeDefsDir, nodeTypeDefsDir);

      const vscodeDtsPath = path.join(this._extensionUri.fsPath, 'out', 'typedefs', 'vscode', 'index.d.ts');
      const vscodeDtsContent = fs.readFileSync(vscodeDtsPath, 'utf8');

      typeDefs = { node: nodeTypeDefs, vscode: vscodeDtsContent };
    } catch (error) {
      console.error('Error reading type definitions:', error);
      vscode.window.showErrorMessage('Error loading script editor type definitions. Autocomplete may not work correctly.');
    }

    this._panel.webview.postMessage({
      command: 'loadState',
      items,
      activeView: this._activeView,
      editingItem: this._editingItem,
      typeDefs
    });
  }

  private _getHtmlForWebview(webview: vscode.Webview): string {
    const htmlPath = path.join(this._extensionUri.fsPath, 'media', 'settings.html');
    let htmlContent = fs.readFileSync(htmlPath, 'utf8');

    htmlContent = htmlContent.replace(
      /<head>/,
      `<head><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; script-src ${webview.cspSource} 'unsafe-inline'; font-src ${webview.cspSource}; img-src ${webview.cspSource} https: data:;">`
    );

    const monacoUri = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'media', 'vs'));
    const codiconsUri = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'media', 'codicon.css'));

    htmlContent = htmlContent.replace(/{{monacoUri}}/g, monacoUri.toString());
    htmlContent = htmlContent.replace(/{{codiconsUri}}/g, codiconsUri.toString());

    return htmlContent;
  }

  public dispose() {
    SettingsPanel.currentPanel = undefined;
    this._panel.dispose();
    while (this._disposables.length) {
      const x = this._disposables.pop();
      if (x) x.dispose();
    }
  }

  // ---------- Smart Run helpers ----------
  private _postLog(chunk: string) {
    this._panel.webview.postMessage({ command: 'runLog', chunk });
  }
  private _postDone(code: number) {
    this._panel.webview.postMessage({ command: 'runDone', code });
  }

  /** 純 Node 執行（可中止） */
  private _runInNode(code: string) {
    this._stopRun();

    const wrapped = `
      (async () => {
        try {
          ${code}
        } catch (e) {
          console.error('[VM Error]', e && (e.stack || e.message || e));
          process.exitCode = 1;
        }
      })();
    `;

    const child = spawn(process.execPath, ['-e', wrapped], {
      cwd: vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || process.cwd(),
      env: process.env,
      stdio: 'pipe'
    });
    this._nodeChild = child;

    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', d => this._postLog(String(d)));
    child.stderr.on('data', d => this._postLog(String(d)));
    child.on('close', code => {
      this._nodeChild = null;
      this._postDone(typeof code === 'number' ? code : 0);
    });
    child.on('error', err => {
      this._postLog(`[spawn error] ${err?.message || String(err)}\n`);
      this._nodeChild = null;
      this._postDone(1);
    });
  }

  /** VM 內執行（可用 vscode / fs / path；不可中途中止） */
  private _runInVm(code: string) {
    if (this._runningVm) {
      this._postLog('[info] 前一個 VM 執行尚未結束，請稍候或改用 Node 模式。\n');
      return;
    }
    this._runningVm = true;

    const sandbox: any = {
      vscode,
      fs,
      path,
      process,
      console: {
        log: (...a: any[]) => { this._postLog(a.map(x => String(x)).join(' ') + '\n'); console.log(...a); },
        error: (...a: any[]) => { this._postLog(a.map(x => String(x)).join(' ') + '\n'); console.error(...a); },
        warn:  (...a: any[]) => { this._postLog(a.map(x => String(x)).join(' ') + '\n'); console.warn(...a); },
        info:  (...a: any[]) => { this._postLog(a.map(x => String(x)).join(' ') + '\n'); console.info(...a); },
      },
      __dirname: path.dirname(this._extensionUri.fsPath),
      require: (moduleName: string) => {
        if (moduleName === 'vscode') return vscode;
        if (require.resolve(moduleName) === moduleName) return require(moduleName); // 只允許 Node 內建
        throw new Error(`Only built-in modules are allowed: ${moduleName}`);
      }
    };

    const wrapped = `(async () => { try { ${code} } catch (e) { console.error('❌', e && (e.stack || e.message || e)); } })();`;

    try {
      vm.runInNewContext(wrapped, sandbox);
      this._postDone(0);
    } catch (e: any) {
      this._postLog('❌ ' + (e?.stack || e?.message || String(e)) + '\n');
      this._postDone(1);
    } finally {
      this._runningVm = false;
    }
  }

  /** 停止執行（只能停 Node child；VM 無法安全中斷） */
  private _stopRun() {
    if (this._nodeChild) {
      try {
        this._nodeChild.kill('SIGTERM');
        this._postLog('[stop] sent SIGTERM\n');
      } catch {}
      this._nodeChild = null;
    }
  }
}

/* ---------- Restore defaults helpers (same as extension.ts) ---------- */
function buildDefaultItems(): any[] {
  return [
    {
      text: '$(output) Log',
      tooltip: 'VS Code + Node. Output + bottom log',
      command: 'sbh.demo.logMinimalPlus',
      script: minimalLogScriptForSettingsPanel(),
    },
    {
      text: '$(diff-added) Git Add',
      tooltip: 'Stage all changes in the first workspace folder',
      command: 'sbh.demo.gitAdd',
      script: gitAddScriptForSettingsPanel(),
    },
    {
      text: '$(paintcan) Board',
      tooltip: 'Draw-only webview (no save)',
      command: 'sbh.demo.whiteboard',
      script: whiteboardNoSaveScriptForSettingsPanel(),
    },
  ];
}

function minimalLogScriptForSettingsPanel(): string {
  return `
// Minimal Log: VS Code + Node (read-only, one-click, dual output)
const vscode = require('vscode');
const fs = require('fs');
const path = require('path');

(function main(){
  const ch = vscode.window.createOutputChannel('SBH Minimal Log');
  const emit = (...a) => {
    const line = a.join(' ');
    ch.appendLine(line);
    console.log(line);
  };
  ch.show(true);

  emit('▶ Start');
  emit('Node: ' + process.version + '  Platform: ' + process.platform + '/' + process.arch);

  const ws = vscode.workspace.workspaceFolders;
  const root = ws && ws.length ? ws[0].uri.fsPath : process.cwd();
  emit('Workdir: ' + root);

  try {
    const entries = fs.readdirSync(root, { withFileTypes: true }).slice(0, 8);
    entries.forEach(e => emit((e.isDirectory() ? '[D] ' : '[F] ') + e.name));
  } catch (e) {
    emit('readdir failed: ' + e.message);
  }

  const ed = vscode.window.activeTextEditor;
  if (ed && ed.document.uri.scheme === 'file') {
    emit('Active file: ' + path.basename(ed.document.uri.fsPath) + ' (' + ed.document.languageId + ')');
  }

  emit('✔ Done');
  vscode.window.showInformationMessage('Log demo finished. Check "SBH Minimal Log" and the bottom run log.');
})();
`.trim();
}

function gitAddScriptForSettingsPanel(): string {
  return `
// Git Add: stage all in first workspace (one-click)
const vscode = require('vscode');
const { exec } = require('child_process');

(function main(){
  const ws = vscode.workspace.workspaceFolders;
  if (!ws || !ws.length) {
    console.log('[GitAdd] No workspace folder.');
    vscode.window.showWarningMessage('No workspace folder — cannot run git add.');
    return;
  }
  const cwd = ws[0].uri.fsPath;
  console.log('[GitAdd] cwd:', cwd);

  exec('git add .', { cwd }, (err, stdout, stderr) => {
    if (err) {
      console.error('[GitAdd] error:', stderr || err.message);
      vscode.window.showErrorMessage('Git add failed: ' + (stderr || err.message));
      return;
    }
    if (stdout && stdout.trim()) console.log(stdout.trim());
    console.log('[GitAdd] done.');
    vscode.window.showInformationMessage('✅ git add . done');
  });
})();
`.trim();
}

function whiteboardNoSaveScriptForSettingsPanel(): string {
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
    html += '  const c = document.getElementById(\\'c\\');\\n';
    html += '  const ctx = c.getContext(\\'2d\\');\\n';
    html += '  let drawing=false, last=null;\\n';
    html += '  let color = document.getElementById(\\'color\\').value;\\n';
    html += '  let size  = +document.getElementById(\\'size\\').value;\\n';
    html += '  const undoStack=[], redoStack=[];\\n';
    html += '  function snapshot(){ undoStack.push(c.toDataURL()); if(undoStack.length>30) undoStack.shift(); redoStack.length=0; }\\n';
    html += '  function restore(dataUrl){ return new Promise(res => { const img=new Image(); img.onload=()=>{ ctx.clearRect(0,0,c.width,c.height); ctx.drawImage(img,0,0); res(); }; img.src=dataUrl; }); }\\n';
    html += '  function resize(){\\n';
    html += '    const r = c.getBoundingClientRect();\\n';
    html += '    const tmp = document.createElement(\\'canvas\\');\\n';
    html += '    tmp.width = r.width * devicePixelRatio;\\n';
    html += '    tmp.height= r.height* devicePixelRatio;\\n';
    html += '    const tctx= tmp.getContext(\\'2d\\');\\n';
    html += '    tctx.drawImage(c,0,0);\\n';
    html += '    c.width = r.width * devicePixelRatio;\\n';
    html += '    c.height= r.height* devicePixelRatio;\\n';
    html += '    ctx.setTransform(1,0,0,1,0,0);\\n';
    html += '    ctx.scale(devicePixelRatio, devicePixelRatio);\\n';
    html += '    ctx.drawImage(tmp,0,0);\\n';
    html += '  }\\n';
    html += '  new ResizeObserver(resize).observe(document.getElementById(\\'wrap\\'));\\n';
    html += '  setTimeout(resize, 0);\\n';
    html += '  function line(p1,p2){\\n';
    html += '    ctx.strokeStyle=color; ctx.lineWidth=size; ctx.lineCap=\\'round\\'; ctx.lineJoin=\\'round\\';\\n';
    html += '    ctx.beginPath(); ctx.moveTo(p1.x,p1.y); ctx.lineTo(p2.x,p2.y); ctx.stroke();\\n';
    html += '  }\\n';
    html += '  function pos(e){ const r=c.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; }\\n';
    html += '  c.addEventListener(\\'pointerdown\\', e=>{ e.preventDefault(); snapshot(); drawing=true; last=pos(e); });\\n';
    html += '  c.addEventListener(\\'pointermove\\', e=>{ if(!drawing) return; const p=pos(e); line(last,p); last=p; });\\n';
    html += '  c.addEventListener(\\'pointerup\\',   ()=>{ drawing=false; last=null; });\\n';
    html += '  c.addEventListener(\\'pointerleave\\',()=>{ drawing=false; last=null; });\\n';
    html += '  document.getElementById(\\'color\\').oninput=e=>color=e.target.value;\\n';
    html += '  document.getElementById(\\'size\\').oninput =e=>size=+e.target.value;\\n';
    html += '  document.getElementById(\\'undo\\').onclick= async ()=>{ if(!undoStack.length) return; const snap = undoStack.pop(); redoStack.push(c.toDataURL()); await restore(snap); };\\n';
    html += '  document.getElementById(\\'redo\\').onclick= async ()=>{ if(!redoStack.length) return; const snap = redoStack.pop(); undoStack.push(c.toDataURL()); await restore(snap); };\\n';
    html += '  document.getElementById(\\'clear\\').onclick= ()=>{ snapshot(); ctx.clearRect(0,0,c.width,c.height); };\\n';
    html += '<\\/script>';
    return html;
  }
})();
`.trim();
}
