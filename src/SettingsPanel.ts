import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { spawn, ChildProcessWithoutNullStreams } from 'child_process';
import { 
  DEFAULT_MINIMAL_LOG_SCRIPT, 
  DEFAULT_GIT_ADD_SCRIPT, 
  DEFAULT_SBH_STORAGE_SCRIPT, 
  DEFAULT_TOGGLE_THEME_SCRIPT,
  DEFAULT_WHITEBOARD_SCRIPT, 
  DEFAULT_POMODORO_SCRIPT,
  DEFAULT_VM_CHAT_A_SCRIPT,
  DEFAULT_VM_CHAT_B_SCRIPT
} from './default-items';

export class SettingsPanel {
  public static currentPanel: SettingsPanel | undefined;
  private readonly _panel: vscode.WebviewPanel;
  private readonly _extensionUri: vscode.Uri;
  private _disposables: vscode.Disposable[] = [];

  private _activeView: 'list' | 'edit' = 'list';
  private _editingItem: any = null;

  // Smart Run
  private _nodeChild: ChildProcessWithoutNullStreams | null = null;

  // 面板自己的 VM（用於「Run」按鈕預覽）  
  private sendRunningSetIntervalId: NodeJS.Timeout | undefined;

  private constructor(panel: vscode.WebviewPanel, extensionUri: vscode.Uri) {

    this.sendRunningSetIntervalId = setInterval(()=>{
      this._sendRunningToWebview();
    }, 1500);

    this._panel = panel;
    this._extensionUri = extensionUri;

    this._panel.onDidDispose(() => this.dispose(), null, this._disposables);

    this._panel.webview.onDidReceiveMessage(
      async (message) => {
        switch (message.command) {
          
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
            const pick = message.choice; // 'Replace All' or 'Append'
            if (!pick) {
              return;
            }
            const cfg = vscode.workspace.getConfiguration('statusBarHelper');
            const items = cfg.get<any[]>('items', []) || [];
            const defaults = buildDefaultItems();
            let next: any[] = [];
            if (pick === 'Replace All') {
              next = defaults;
            } else if (pick === 'Append') {
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
            const cmd: string | undefined = message.itemCommand;
            if (!cmd) {
              vscode.window.showErrorMessage('此項目的 command 不可為空，無法執行。');
              return;
            }

            try {
              await vscode.commands.executeCommand('statusBarHelper._bridge', {
                ns: 'hostRun', fn: 'start', args: [cmd, code]
              });
            } catch (e:any) {
              vscode.window.showErrorMessage('啟動失敗：' + (e?.message || String(e)));
            }

            // 跑起來後同步一次 Running 給 webview
            this._sendRunningToWebview();
            return;
          }
          case 'stopByCommand': {
            const cmd: string | undefined = message.itemCommand;
            if (cmd) {
              try {
                await vscode.commands.executeCommand(
                  'statusBarHelper._abortByCommand',
                  cmd,
                  { type: 'manualStop', from: 'settingsList', at: Date.now() }
                );
              } catch {}
            }
            this._sendRunningToWebview();
            return;
          }

          case 'vm:refresh': {
            this._sendRunningToWebview();
            return;
          }

          // === Stored Data（Webview → 主進程 RPC）===
          case 'data:refresh': {
            const rows = await this._collectStoredRows();
            this._panel.webview.postMessage({ command: 'data:setRows', rows });
            return;
          }
          case 'data:delete': {
            const row = message.row as { kind: 'file' | 'kv'; scope: 'global' | 'workspace'; keyPath: string };
            try {
              if (row.kind === 'kv') {
                await this._callBridge('storage', row.scope === 'global' ? 'removeGlobal' : 'removeWorkspace', row.keyPath);
              } else {
                await this._callBridge('files', 'remove', row.scope, row.keyPath);
              }
            } catch {}
            const rows = await this._collectStoredRows();
            this._panel.webview.postMessage({ command: 'data:setRows', rows });
            return;
          }
          case 'data:clearAll': {
            for (const scope of ['global', 'workspace'] as const) {
              try {
                const fnKeys = scope === 'global' ? 'keysGlobal' : 'keysWorkspace';
                const fnRm = scope === 'global' ? 'removeGlobal' : 'removeWorkspace';
                const keys: string[] = await this._callBridge('storage', fnKeys);
                for (const k of keys) { await this._callBridge('storage', fnRm, k); }
              } catch {}
              try {
                await this._callBridge('files', 'clearAll', scope);
              } catch {}
            }
            const rows = await this._collectStoredRows();
            this._panel.webview.postMessage({ command: 'data:setRows', rows });
            return;
          }
        }
      },
      null,
      this._disposables
    );

    this._panel.onDidChangeViewState(
      e => {
        if (e.webviewPanel.visible) {
          if (this._activeView === 'list') { this._sendRunningToWebview(); }
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
    this._sendRunningToWebview();
  }

  private async _sendRunningToWebview() {
    try {
      const r = await vscode.commands.executeCommand(
        'statusBarHelper._bridge',
        { ns: 'vm', fn: 'list', args: [] }
      ) as any;
      const hostRunning: string[] = (r && r.ok) ? (r.data || []) : [];
      this._panel.webview.postMessage({
        command: 'vm:setRunning',
        hostRunning,
        panelRunning: [] // 之後可忽略這欄
      });
    } catch {
      this._panel.webview.postMessage({ command: 'vm:setRunning', hostRunning: [], panelRunning: [] });
    }
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
    if (this.sendRunningSetIntervalId) {
      clearInterval(this.sendRunningSetIntervalId);
      this.sendRunningSetIntervalId = undefined;
    }
    SettingsPanel.currentPanel = undefined;
    this._panel.dispose();
  while (this._disposables.length) { const x = this._disposables.pop(); if (x) { x.dispose(); } }
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
    // 若已有 Node child 在跑，先停
    if (this._nodeChild) {
      try { this._nodeChild.kill('SIGTERM'); } catch {}
      this._nodeChild = null;
    }

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

  // === Bridge 呼叫工具（Webview / VM 共用）===
  private async _callBridge(ns: string, fn: string, ...args: any[]) {
    const r = await vscode.commands.executeCommand('statusBarHelper._bridge', { ns, fn, args }) as any;
  if (r && r.ok) { return r.data; }
    throw new Error(r?.error || 'bridge error');
  }

  // === 收集 Stored Data（files + kv）===
  private async _collectStoredRows(): Promise<Array<{kind:'file'|'kv'; scope:'global'|'workspace'; ext:'text'|'json'|'bytes'; keyPath:string; size:number}>> {
    const rows: Array<{kind:'file'|'kv'; scope:'global'|'workspace'; ext:'text'|'json'|'bytes'; keyPath:string; size:number}> = [];

    for (const scope of ['global','workspace'] as const) {
      try {
        const list: Array<{rel:string; name:string; size:number}> = await this._callBridge('files','listStats', scope, '');
        list.forEach(f => {
          const rel = String(f.rel || f.name || '').replace(/^[/\\]+/, '');
          if (!rel) { return; }
          const ext = /\.json$/i.test(rel) ? 'json' : /\.txt$/i.test(rel) ? 'text' : 'bytes';
          rows.push({ kind:'file', scope, ext, keyPath: rel, size: Number(f.size || 0) });
        });
      } catch {}
    }

    const jsonSize = (v:any) => Buffer.byteLength(JSON.stringify(v ?? null), 'utf8');
    for (const scope of ['global','workspace'] as const) {
      const fnKeys = scope === 'global' ? 'keysGlobal' : 'keysWorkspace';
      const fnGet  = scope === 'global' ? 'getGlobal'  : 'getWorkspace';
      try {
        const keys: string[] = await this._callBridge('storage', fnKeys);
        for (const k of keys) {
          const val = await this._callBridge('storage', fnGet, k, null);
          rows.push({ kind:'kv', scope, ext:'json', keyPath:k, size: jsonSize(val) });
        }
      } catch {}
    }

    return rows;
  }
}

/* ---------- Restore defaults helpers (same as extension.ts) ---------- */
function buildDefaultItems(): any[] {
  return [
    {
      text: '$(output) Log',
      tooltip: 'VS Code + Node. Output + bottom log',
      command: 'sbh.demo.logMinimalPlus',
      script: DEFAULT_MINIMAL_LOG_SCRIPT,
      enableOnInit: false,
      hidden: true
    },
    {
      text: '$(diff-added) Git Add',
      tooltip: 'Stage all changes in the first workspace folder',
      command: 'sbh.demo.gitAdd',
      script: DEFAULT_GIT_ADD_SCRIPT,
      enableOnInit: false,
      hidden: true
    },
    {
      text: '$(database) Storage',
      tooltip: 'how to use the custom statusBarHelper API',
      command: 'sbh.demo.storage',
      script: DEFAULT_SBH_STORAGE_SCRIPT,
      enableOnInit: false,
      hidden: true
    },
    {
      text: '$(color-mode)',
      tooltip: 'Toggle between light and dark theme',
      command: 'sbh.demo.toggleTheme',
      script: DEFAULT_TOGGLE_THEME_SCRIPT,
      enableOnInit: false,
      hidden: false
    },
    {
      text: '$(paintcan) Board',
      tooltip: 'Board',
      command: 'sbh.demo.whiteboard',
      script: DEFAULT_WHITEBOARD_SCRIPT,
      enableOnInit: false,
      hidden: false
    },
    {
      text: '🍅 Pomodoro',
      tooltip: 'Open Pomodoro Timer',
      command: 'sbh.demo.pomodoro',
      script: DEFAULT_POMODORO_SCRIPT,
      enableOnInit: true,
      hidden: true
    },
    {
      text: '$(comment) Chat A',
      tooltip: 'VM messaging demo (A) — uses vm.open/sendMessage/onMessage',
      command: 'sbh.demo.vmChatA',
      script: DEFAULT_VM_CHAT_A_SCRIPT,
      enableOnInit: false,
      hidden: true
    },
    {
      text: '$(comment-discussion) Chat B',
      tooltip: 'VM messaging demo (B) — uses vm.open/sendMessage/onMessage',
      command: 'sbh.demo.vmChatB',
      script: DEFAULT_VM_CHAT_B_SCRIPT,
      enableOnInit: false,
      hidden: true
    }
  ];
}
