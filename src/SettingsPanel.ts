import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { spawn, ChildProcessWithoutNullStreams } from 'child_process';
// Removed legacy default-items import (deprecated restore defaults flow)
import {
  loadFromGlobal,
  saveAllToGlobal,
  SbhItem
} from './globalStateManager';
import { localize } from './nls';

export class SettingsPanel {
  public static currentPanel: SettingsPanel | undefined;
  public static extensionContext: vscode.ExtensionContext | undefined;
  
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
          case 'scriptStore:req': {
            // Webview Script Store RPC → 直接調用 bridge namespace scriptStore
            const { reqId, fn, args } = message;
            let result: any;
            try {
              const r = await vscode.commands.executeCommand('statusBarHelper._bridge', { ns:'scriptStore', fn, args: Array.isArray(args)?args:[] });
              result = r;
            } catch (e:any) {
              result = { ok:false, error: e?.message || String(e) };
            }
            this._panel.webview.postMessage({ command:'scriptStore:resp', reqId, result });
            return;
          }
          
          case 'updateSettings': {
            if (SettingsPanel.extensionContext) {
              await saveAllToGlobal(SettingsPanel.extensionContext, message.items);
              // 通知主擴充功能更新狀態列
              try {
                await vscode.commands.executeCommand('statusBarHelper._refreshStatusBar');
              } catch (e) {
                console.warn('Failed to refresh status bar:', e);
              }
            }
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
              saveLabel: localize('export.saveLabel', 'Export Settings'),
              filters: { 'JSON': ['json'] }
            }).then(uri => {
              if (uri) {
                fs.writeFileSync(uri.fsPath, JSON.stringify(items, null, 2));
                vscode.window.showInformationMessage(localize('export.success', 'Settings exported successfully.'));
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
                  const importItems = JSON.parse(content);
                  if (Array.isArray(importItems)) {
                    // Send to webview for preview instead of direct import
                    this._panel.webview.postMessage({ 
                      command: 'importPreviewData', 
                      items: importItems 
                    });
                  } else {
                    vscode.window.showErrorMessage(localize('err.import.invalidFormat', 'Invalid file format.'));
                  }
                } catch (e) {
                  vscode.window.showErrorMessage(localize('err.import.parse', 'Error parsing settings file.'));
                }
              }
            });
            return;
          }
          
          case 'applyImportSettings': {
            // Apply selected items from import preview
            const importItems = message.items;
            const mergeStrategy: 'replace' | 'append' = message.mergeStrategy === 'append' ? 'append' : 'replace';
            const conflictPolicy: 'skip' | 'newId' = message.conflictPolicy === 'newId' ? 'newId' : 'skip';
            if (Array.isArray(importItems) && SettingsPanel.extensionContext) {
              const current = loadFromGlobal(SettingsPanel.extensionContext);
              let next: SbhItem[] = [];
              if (mergeStrategy === 'replace') {
                // Overwrite same command, keep non-selected existing items
                const byCmd = new Map<string, SbhItem>();
                current.forEach(i => byCmd.set(i.command, i));
                importItems.forEach(i => byCmd.set(i.command, i));
                next = Array.from(byCmd.values());
              } else { // append
                const existing = new Map(current.map(i => [i.command, i] as const));
                const appended: SbhItem[] = [];
                importItems.forEach(i => {
                  if (!existing.has(i.command)) {
                    appended.push(i);
                  } else {
                    if (conflictPolicy === 'newId') {
                      const ts = new Date().toISOString().replace(/[-:T.Z]/g, '').slice(0,14);
                      let newCmd = `${i.command}-${ts}`;
                      // ensure uniqueness
                      let c = 1;
                      while (existing.has(newCmd)) { newCmd = `${i.command}-${ts}-${c++}`; }
                      appended.push({ ...i, command: newCmd });
                    } // skip does nothing
                  }
                });
                next = current.concat(appended);
              }
              await saveAllToGlobal(SettingsPanel.extensionContext, next);
              this._sendStateToWebview();
              this._panel.webview.postMessage({ command: 'importDone', items: next });
              vscode.window.showInformationMessage(localize('import.success', 'Settings imported successfully.'));
            }
            return;
          }

          // (restoreDefaults removed – superseded by Script Store)

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
              vscode.window.showErrorMessage(localize('err.run.noCommand', 'Command cannot be empty for this item.'));
              return;
            }

            try {
              await vscode.commands.executeCommand('statusBarHelper._bridge', {
                ns: 'hostRun', fn: 'start', args: [cmd, code]
              });
            } catch (e:any) {
              vscode.window.showErrorMessage(localize('err.run.startFailed', 'Failed to start: {0}', e?.message || String(e)));
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

  public static createOrShow(extensionUri: vscode.Uri, context?: vscode.ExtensionContext) {
    if (context) {
      SettingsPanel.extensionContext = context;
    }
    
    const column = vscode.window.activeTextEditor
      ? vscode.window.activeTextEditor.viewColumn
      : undefined;

    if (SettingsPanel.currentPanel) {
      SettingsPanel.currentPanel._panel.reveal(column);
      return;
    }

    const panel = vscode.window.createWebviewPanel(
      'statusBarHelperSettings',
      localize('panel.title', 'StatusBar Helper Settings'),
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
  this._panel.title = localize('panel.title', 'StatusBar Helper Settings');
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
    const items = SettingsPanel.extensionContext ? loadFromGlobal(SettingsPanel.extensionContext) : [];

    let typeDefs: { node: any[], vscode: string } | null = null;
    try {
      const nodeTypeDefsDir = path.join(this._extensionUri.fsPath, 'out', 'typedefs', 'node');
      const nodeTypeDefs = this._readTypeDefinitions(nodeTypeDefsDir, nodeTypeDefsDir);

      const vscodeDtsPath = path.join(this._extensionUri.fsPath, 'out', 'typedefs', 'vscode', 'index.d.ts');
      const vscodeDtsContent = fs.readFileSync(vscodeDtsPath, 'utf8');

      typeDefs = { node: nodeTypeDefs, vscode: vscodeDtsContent };
    } catch (error) {
      console.error('Error reading type definitions:', error);
      vscode.window.showErrorMessage(localize('err.typedefs.load', 'Error loading script editor type definitions. Autocomplete may not work correctly.'));
    }

    // Load translations
    const translations = this._loadTranslations();

    let lastSyncAt: number | null = null;
    try {
      vscode.commands.executeCommand('statusBarHelper._bridge', { ns: 'hostRun', fn: 'lastSyncInfo', args: [] })
        .then((r:any) => {
          if (r && r.ok) { lastSyncAt = r.data?.lastSyncAt ?? null; }
          this._panel.webview.postMessage({
            command: 'loadState',
            items,
            activeView: this._activeView,
            editingItem: this._editingItem,
            typeDefs,
            translations,
            lastSyncAt
          });
          this._sendRunningToWebview();
        });
      return; // 早退，避免重複 sendRunning
    } catch {
      // fallback: 沒拿到 lastSyncAt 仍送出
    }
    this._panel.webview.postMessage({
      command: 'loadState',
      items,
      activeView: this._activeView,
      editingItem: this._editingItem,
      typeDefs,
      translations,
      lastSyncAt
    });
    this._sendRunningToWebview();
  }

  private _loadTranslations(): Record<string, string> {
    try {
  const locale = vscode.env.language;
      let translations: Record<string, string> = {};
      
      // Load English fallback first
      const enPath = path.join(this._extensionUri.fsPath, 'media', 'nls.en.json');
      if (fs.existsSync(enPath)) {
        const enContent = fs.readFileSync(enPath, 'utf-8');
        translations = JSON.parse(enContent);
      }
      
  // Only overlay Traditional Chinese (avoid forcing zh-tw text on zh / zh-cn environments)
  const lower = locale.toLowerCase();
  const isTraditionalZh = lower === 'zh-tw' || lower === 'zh-hant';
  if (isTraditionalZh) {
        const zhPath = path.join(this._extensionUri.fsPath, 'media', 'nls.zh-tw.json');
        if (fs.existsSync(zhPath)) {
          const zhContent = fs.readFileSync(zhPath, 'utf-8');
          const zhTranslations = JSON.parse(zhContent);
          translations = { ...translations, ...zhTranslations };
        }
      }
      
      return translations;
    } catch (error) {
      console.warn('Failed to load webview translations:', error);
      return {};
    }
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

  // Localize document title
  const localizedTitle = localize('panel.title', 'StatusBar Helper Settings');
  htmlContent = htmlContent.replace(/<title>.*?<\/title>/i, `<title>${localizedTitle}</title>`);

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

// (buildDefaultItems removed – defaults now provided only via JSON + future Script Store)
