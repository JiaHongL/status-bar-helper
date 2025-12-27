/**
 * Status Bar Helper - Settings Panel Management
 * 
 * Architecture Overview:
 * ┌─────────────────────────────────────────────────────────────────────────────┐
 * │                            VS Code Host (Extension)                        │
 * └─────────────────────────────────────────────────────────────────────────────┘
 *                                       │
 *                                  postMessage
 *                                       │
 * ┌─────────────────────────────────────────────────────────────────────────────┐
 * │                              Webview Panel                                 │
 * │                                                                             │
 * │  ┌─────────────────────┐                    ┌─────────────────────┐       │
 * │  │     Main Page       │◄──────────────────►│     Edit Page       │       │
 * │  │                     │                    │                     │       │
 * │  │ ┌─────────────────┐ │                    │ ┌─────────────────┐ │       │
 * │  │ │   List View     │ │                    │ │ Monaco Editor   │ │       │
 * │  │ │ (Status Items)  │ │                    │ │ (Script Edit)   │ │       │
 * │  │ └─────────────────┘ │                    │ └─────────────────┘ │       │
 * │  │ ┌─────────────────┐ │                    │ ┌─────────────────┐ │       │
 * │  │ │   Data View     │ │                    │ │ Preview VM      │ │       │
 * │  │ │ (Stored Data)   │ │                    │ │ (Run Button)    │ │       │
 * │  │ └─────────────────┘ │                    │ └─────────────────┘ │       │
 * │  └─────────────────────┘                    └─────────────────────┘       │
 * │           │                                            │                   │
 * │  ┌─────────────────┐              ┌─────────────────┐ │                   │
 * │  │  Script Store   │              │ Import/Export   │ │                   │
 * │  │   (Modal)       │              │   (Dialog)      │ │                   │
 * │  └─────────────────┘              └─────────────────┘ │                   │
 * └─────────────────────────────────────────────────────────────────────────────┘
 *                                       │
 *                                  RPC Bridge
 *                                       │
 * ┌─────────────────────────────────────────────────────────────────────────────┐
 * │                            Global State Manager                            │
 * └─────────────────────────────────────────────────────────────────────────────┘
 * 
 * Key Responsibilities:
 * - Webview lifecycle management and resource cleanup
 * - Settings synchronization between UI and global state
 * - Script preview execution with isolated VM
 * - Script Store integration and RPC handling
 * - Import/Export functionality with file I/O
 * - Real-time running status updates
 * 
 * Communication Patterns:
 * - Host → Webview: State updates, running status, sync indicators
 * - Webview → Host: Setting changes, script execution, file operations
 * - Script Store: RPC bridge for catalog management and installation
 */

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
import { BACKUP_DIR } from './utils/backup';

/**
 * Settings Panel - 主要的設定介面管理類別
 * 
 * 生命週期管理：
 * - 單例模式確保同時只有一個設定面板
 * - 自動清理資源防止記憶體洩漏
 * - 智慧重新載入現有面板而非建立新實例
 */
export class SettingsPanel {
  /** 單例面板實例 */
  public static currentPanel: SettingsPanel | undefined;
  
  /** Extension 上下文參照（用於狀態存取） */
  public static extensionContext: vscode.ExtensionContext | undefined;
  
  /** VS Code Webview 面板 */
  private readonly _panel: vscode.WebviewPanel;
  
  /** Extension URI（用於資源載入） */
  private readonly _extensionUri: vscode.Uri;
  
  /** 資源清理追蹤 */
  private _disposables: vscode.Disposable[] = [];

  /** 目前的檢視模式：列表檢視或編輯檢視 */
  private _activeView: 'list' | 'edit' = 'list';
  
  /** 正在編輯的項目（編輯模式時） */
  private _editingItem: any = null;

  // ============================================================================
  // Script Preview Execution - 設定面板內的腳本預覽執行
  // ============================================================================
  
  /** Smart Run - Node.js 子程序（用於執行系統指令） */
  private _nodeChild: ChildProcessWithoutNullStreams | null = null;

  /** 面板專用的 VM 執行狀態定時器（用於「Run」按鈕預覽） */
  private sendRunningSetIntervalId: NodeJS.Timeout | undefined;

  /** 最近一次成功同步的時間戳 */
  lastSyncAt = null; // timestamp of last successful sync

  /**
   * Settings Panel 建構函數
   * @param panel VS Code webview 面板實例
   * @param extensionUri Extension 的 URI（用於載入資源）
   */
  private constructor(panel: vscode.WebviewPanel, extensionUri: vscode.Uri) {

    setTimeout(() => {
      this._sendRunningToWebview();
      this._sendStoredDataToWebview();
    }, 400);

    // 啟動執行狀態定時更新（每2.5秒向 webview 發送最新的執行狀態）
    this.sendRunningSetIntervalId = setInterval(()=>{
      this._sendRunningToWebview();
      this._sendStoredDataToWebview();
      this._checkLastSync();
    }, 2500);

    this._panel = panel;
    this._extensionUri = extensionUri;

    // 面板關閉時自動清理資源
    this._panel.onDidDispose(() => this.dispose(), null, this._disposables);

    // ============================================================================
    // Webview ↔ Host 通訊協定處理
    // ============================================================================
    this._panel.webview.onDidReceiveMessage(async (message) => {
      switch (message.command) {
          // === 備份管理：還原備份 ===
          case 'backup:restore': {
            try {
              const backupId = message.backupId;
              // 僅允許還原 smart-backup-*.json
              if (typeof backupId === 'string' && backupId.startsWith('smart-backup-') && backupId.endsWith('.json')) {
                const path = require('path');
                const filePath = path.join(SettingsPanel.extensionContext!.globalStorageUri.fsPath, BACKUP_DIR, backupId);
                const result: any = await vscode.commands.executeCommand('statusBarHelper._bridge', { ns: 'backup', fn: 'restore', args: [filePath] });
                if (result && typeof result === 'object' && result.ok) {
                  this._panel.webview.postMessage({ command: 'backup:restore:result', success: true });
                  this._sendStateToWebview();
                  await vscode.commands.executeCommand('statusBarHelper._refreshStatusBar');
                } else {
                  this._panel.webview.postMessage({ command: 'backup:restore:result', success: false, message: (result && typeof result === 'object' && result.error) ? result.error : 'Restore failed' });
                }
              } else {
                this._panel.webview.postMessage({ command: 'backup:restore:result', success: false, message: 'Invalid backup id' });
              }
            } catch (e:any) {
              this._panel.webview.postMessage({ command: 'backup:restore:result', success: false, message: e?.message || String(e) });
            }
            return;
          }
          // === 備份管理：取得備份清單 ===
          case 'backup:list': {
            try {
              const list = await vscode.commands.executeCommand('statusBarHelper._bridge', { ns: 'backup', fn: 'listHistory', args: [] }) as { ok: boolean, data?: any[], error?: string };
              const backups = (list && list.ok && Array.isArray(list.data)) ? list.data.map((item: any) => ({
                id: item.file,
                timeStr: item.timestamp ? new Date(item.timestamp).toLocaleString() : '',
                timestamp: item.timestamp,
                sizeStr: item.size ? this.formatSize(item.size) : '',
                count: item.itemsCount || 0
              })) : [];
              this._panel.webview.postMessage({ command: 'backup:list', backups });
            } catch (e:any) {
              this._panel.webview.postMessage({ command: 'backup:list', backups: [], error: e?.message || String(e) });
            }
            return;
          }
          // === 備份管理：刪除備份 ===
          case 'backup:delete': {
            try {
              const backupId = message.backupId;
              // 僅允許刪除 smart-backup-*.json
              if (typeof backupId === 'string' && backupId.startsWith('smart-backup-') && backupId.endsWith('.json')) {
                await vscode.commands.executeCommand('statusBarHelper._bridge', { ns: 'backup', fn: 'delete', args: [backupId] });
              }
              // 回傳最新清單
              const list = await vscode.commands.executeCommand('statusBarHelper._bridge', { ns: 'backup', fn: 'listHistory', args: [] }) as { ok: boolean, data?: any[], error?: string };
              const backups = (list && list.ok && Array.isArray(list.data)) ? list.data.map((item: any, idx: number) => ({
                id: item.file,
                timeStr: item.timestamp ? new Date(item.timestamp).toLocaleString() : '',
                timestamp: item.timestamp,
                sizeStr: item.size ? this.formatSize(item.size) : '',
                count: item.itemsCount || 0
              })) : [];
              this._panel.webview.postMessage({ command: 'backup:list', backups });
            } catch (e:any) {
              this._panel.webview.postMessage({ command: 'backup:list', backups: [], error: e?.message || String(e) });
            }
            return;
          }
          // === 備份管理：建立手動備份 ===
          case 'backup:create': {
            try {
              const result = await vscode.commands.executeCommand('statusBarHelper._bridge', { ns: 'backup', fn: 'createBackup', args: [] }) as { ok: boolean, error?: string };
              this._panel.webview.postMessage({ command: 'backup:create:result', success: !!(result && result.ok), message: result && result.ok ? '' : (result?.error || '建立備份失敗') });
            } catch (e:any) {
              this._panel.webview.postMessage({ command: 'backup:create:result', success: false, message: e?.message || String(e) });
            }
            return;
          }
          case 'backup:getStatus':{
            const result = await vscode.commands.executeCommand('statusBarHelper._bridge', { ns: 'backup', fn: 'getStatus', args: [] }) as { ok: boolean, data?: any, error?: string };
            this._panel.webview.postMessage({ command: 'backup:getStatus:result', message: result.data || '' });
          }
          // Script Store RPC 橋接 - 轉發到主 extension 的 bridge 系統
          case 'scriptStore:req': {
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
          
          // 更新設定 - 儲存到 global state 並刷新狀態列
          case 'updateSettings': {
            if (SettingsPanel.extensionContext) {
              // 檢測被刪除的項目並停止其 VM
              const oldItems = loadFromGlobal(SettingsPanel.extensionContext);
              const newItems = message.items;
              const newCommandSet = new Set(newItems.map((i: any) => i.command));
              const deletedCommands = oldItems
                .map(i => i.command)
                .filter(cmd => !newCommandSet.has(cmd));
              
              // 停止被刪除項目的 VM
              for (const cmd of deletedCommands) {
                try {
                  await vscode.commands.executeCommand('statusBarHelper._abortByCommand', cmd, { type: 'deleted', at: Date.now() });
                } catch (e) {
                  console.warn(`Failed to abort VM for deleted item ${cmd}:`, e);
                }
              }
              
              await saveAllToGlobal(SettingsPanel.extensionContext, newItems);
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
          
          // 載入設定狀態
          case 'getSettings': {
            this._sendStateToWebview();
            return;
          }
          
          // 進入編輯檢視
          case 'enterEditView': {
            this._activeView = 'edit';
            this._editingItem = message.item;
            return;
          }
          
          // 離開編輯檢視
          case 'exitEditView': {
            this._activeView = 'list';
            this._editingItem = null;
            return;
          }
          
          // 顯示錯誤訊息
          case 'showError': {
            vscode.window.showErrorMessage(message.message);
            return;
          }
          
          // 匯出設定到檔案
          case 'exportSettings': {
            const items = message.items;
            // 產生時間戳檔名
            const now = new Date();
            const y = now.getFullYear();
            const m = String(now.getMonth() + 1).padStart(2, '0');
            const d = String(now.getDate()).padStart(2, '0');
            const hh = String(now.getHours()).padStart(2, '0');
            const mm = String(now.getMinutes()).padStart(2, '0');
            const ss = String(now.getSeconds()).padStart(2, '0');
            const defaultName = `status-bar-helper-${y}-${m}-${d}-${hh}-${mm}-${ss}.json`;

            // 預設儲存位置為工作區根目錄
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
          
          // 匯入設定從檔案
          case 'importSettings': {
            vscode.window.showOpenDialog({ canSelectMany: false, filters: { 'JSON': ['json'] } }).then(async (uris) => {
              if (uris && uris.length > 0) {
                const uri = uris[0];
                const content = fs.readFileSync(uri.fsPath, 'utf8');
                try {
                  const importItems = JSON.parse(content);
                  if (Array.isArray(importItems)) {
                    // 發送到 webview 進行預覽而非直接匯入
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
              await vscode.commands.executeCommand('statusBarHelper._refreshStatusBar');
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
            this._sendStoredDataToWebview();
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

          case 'data:refresh': {
            this._sendStoredDataToWebview();
            return;
          }
          case 'data:delete': {
            const row = message.row as { kind: 'file' | 'kv' | 'secret' | 'package'; scope: 'global' | 'workspace'; keyPath: string };
            try {
              if (row.kind === 'kv') {
                await this._callBridge('storage', row.scope === 'global' ? 'removeGlobal' : 'removeWorkspace', row.keyPath);
              } else if(row.kind === 'secret') {
                await this._callBridge('secret', 'delete', row.keyPath);
              } else if(row.kind === 'package') {
                await this._callBridge('packages', 'remove', row.keyPath);
              } else {
                await this._callBridge('files', 'remove', row.scope, row.keyPath);
              }
            } catch {}
            this._sendStoredDataToWebview();
            return;
          }
          case 'openExternal': {
            if (message.url && typeof message.url === 'string') {
              try {
                await vscode.env.openExternal(vscode.Uri.parse(message.url));
              } catch (e) {
                console.warn('Failed to open external URL:', e);
                vscode.window.showErrorMessage(localize('err.openExternal', 'Failed to open external link.'));
              }
            }
            return;
          }
          case 'data:clearAll': {
            const rows = message.rows as Array<{kind:'file'|'kv'|'secret'|'package'; scope:'global'|'workspace'; keyPath:string}> | undefined;
            if (Array.isArray(rows) && rows.length) {
              // 只刪目前列表裡的資料
              for (const r of rows) {
                // safety：不要動到備份資料夾
                if (r.keyPath && r.keyPath.includes(BACKUP_DIR)) { continue; }
                try {
                  if (r.kind === 'kv') {
                    await this._callBridge('storage',
                      r.scope === 'global' ? 'removeGlobal' : 'removeWorkspace',
                      r.keyPath);
                  } else if (r.kind === 'secret') {
                    await this._callBridge('secret', 'delete', r.keyPath);
                  } else if (r.kind === 'package') {
                    await this._callBridge('packages', 'remove', r.keyPath);
                  } else { // file
                    await this._callBridge('files', 'remove', r.scope, r.keyPath);
                  }
                } catch {}
              }
            } else {
              // 沒帶 rows：維持舊版「全部清除」行為（相容性）
              for (const scope of ['global', 'workspace'] as const) {
                try {
                  const fnKeys = scope === 'global' ? 'keysGlobal' : 'keysWorkspace';
                  const fnRm = scope === 'global' ? 'removeGlobal' : 'removeWorkspace';
                  let keys: string[] = await this._callBridge('storage', fnKeys);
                  for (const k of keys) { await this._callBridge('storage', fnRm, k); }
                } catch {}
                try {
                  const allFiles = await this._callBridge('files', 'listStats', scope, '');
                  for (const f of allFiles) {
                    const rel = String(f.rel || f.name || '').replace(/^[/\\]+/, '');
                    if (rel.includes(BACKUP_DIR)) { continue; }
                    // 排除 sbh.packages（套件由 packages API 管理）
                    if (rel.startsWith('sbh.packages/') || rel.startsWith('sbh.packages\\')) { continue; }
                    await this._callBridge('files', 'remove', scope, rel);
                  }
                } catch {}
              }
              try {
                const secretKeys: string[] = await this._callBridge('secret', 'keys');
                for (const k of secretKeys) { await this._callBridge('secret', 'delete', k); }
              } catch {}
              // Note: 不自動清除 packages，需使用者明確刪除
            }
            let rows2 = await this._collectStoredRows();
            rows2 = rows2.filter(row =>!row.keyPath.includes(BACKUP_DIR));
            this._panel.webview.postMessage({ command: 'data:setRows', rows2 });
            return;
          }
          
          // 套件管理
          case 'packages:install': {
            const { name, version } = message as { name: string; version?: string };
            try {
              const result = await this._callBridge('packages', 'install', name, { version, showProgress: true });
              this._panel.webview.postMessage({ command: 'packages:installResult', result });
              this._sendStoredDataToWebview();
            } catch (e: any) {
              this._panel.webview.postMessage({ 
                command: 'packages:installResult', 
                result: { success: false, name, error: e?.message || String(e) }
              });
            }
            return;
          }
          
          case 'packages:remove': {
            const { name } = message as { name: string };
            try {
              const result = await this._callBridge('packages', 'remove', name);
              this._panel.webview.postMessage({ command: 'packages:removeResult', result });
              this._sendStoredDataToWebview();
            } catch (e: any) {
              this._panel.webview.postMessage({ 
                command: 'packages:removeResult', 
                result: { success: false, name, error: e?.message || String(e) }
              });
            }
            return;
          }
          
          case 'packages:removeAll': {
            const { packages: packageNames } = message as { packages: string[] };
            try {
              let successCount = 0;
              let lastError = '';
              for (const name of packageNames) {
                try {
                  const result = await this._callBridge('packages', 'remove', name);
                  if (result?.data?.success) {
                    successCount++;
                  } else {
                    lastError = result?.data?.error || 'Unknown error';
                  }
                } catch (e: any) {
                  lastError = e?.message || String(e);
                }
              }
              this._panel.webview.postMessage({ 
                command: 'packages:removeAllResult', 
                result: { 
                  success: successCount === packageNames.length,
                  removed: successCount,
                  total: packageNames.length,
                  error: successCount < packageNames.length ? lastError : undefined
                }
              });
              this._sendStoredDataToWebview();
            } catch (e: any) {
              this._panel.webview.postMessage({ 
                command: 'packages:removeAllResult', 
                result: { success: false, removed: 0, total: packageNames.length, error: e?.message || String(e) }
              });
            }
            return;
          }
          
          case 'packages:list': {
            try {
              const packages = await this._callBridge('packages', 'list');
              this._panel.webview.postMessage({ command: 'packages:listResult', packages });
            } catch {
              this._panel.webview.postMessage({ command: 'packages:listResult', packages: [] });
            }
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

    let typeDefs: { node: any[], vscode: string, sbh: string } | null = null;
    try {
      const nodeTypeDefsDir = path.join(this._extensionUri.fsPath, 'out', 'typedefs', 'node');
      const nodeTypeDefs = this._readTypeDefinitions(nodeTypeDefsDir, nodeTypeDefsDir);

      const vscodeDtsPath = path.join(this._extensionUri.fsPath, 'out', 'typedefs', 'vscode', 'index.d.ts');
      const vscodeDtsContent = fs.readFileSync(vscodeDtsPath, 'utf8');

      const sbhDtsPath = path.join(this._extensionUri.fsPath, 'out', 'typedefs', 'status-bar-helper', 'sbh.d.ts');
      const sbhDtsContent = fs.readFileSync(sbhDtsPath, 'utf8');

      typeDefs = { node: nodeTypeDefs, vscode: vscodeDtsContent, sbh: sbhDtsContent };
    } catch (error) {
      console.error('Error reading type definitions:', error);
      vscode.window.showErrorMessage(localize('err.typedefs.load', 'Error loading script editor type definitions. Autocomplete may not work correctly.'));
    }

    // Load translations
    const translations = this._loadTranslations();
    const currentLocale = vscode.env.language;

    try {
      vscode.commands.executeCommand('statusBarHelper._bridge', { ns: 'hostRun', fn: 'lastSyncInfo', args: [] })
        .then((r:any) => {
          if (r && r.ok) { this.lastSyncAt = r.data?.lastSyncAt ?? null; }
          this._panel.webview.postMessage({
            command: 'loadState',
            items,
            activeView: this._activeView,
            editingItem: this._editingItem,
            typeDefs,
            translations,
            currentLocale,
            lastSyncAt: this.lastSyncAt
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
      currentLocale,
      lastSyncAt: this.lastSyncAt
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

  private _checkLastSync(){
    try {
      vscode.commands.executeCommand('statusBarHelper._bridge', { ns: 'hostRun', fn: 'lastSyncInfo', args: [] })
        .then((r:any) => {
          if(this.lastSyncAt !== r.data?.lastSyncAt){
            this.lastSyncAt = r.data?.lastSyncAt ?? null;
            this._panel.webview.postMessage({
              command: 'sync:lastSyncAt',
              lastSyncAt: this.lastSyncAt
            });
          }
        });
    } catch {}
  }

  private async _sendStoredDataToWebview(){
    let rows = await this._collectStoredRows();
    this._panel.webview.postMessage({ command: 'data:setRows', rows });
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
    let html = fs.readFileSync(htmlPath, 'utf8');

    // Title
    const localizedTitle = localize('panel.title', 'StatusBar Helper Settings');
    html = html.replace(/<title>.*?<\/title>/i, `<title>${localizedTitle}</title>`);

    // CSP（包含 worker-src blob:）
    html = html.replace(
      /<head>/,
      `<head><meta http-equiv="Content-Security-Policy"
        content="default-src 'none';
                style-src ${webview.cspSource} 'unsafe-inline';
                script-src ${webview.cspSource} 'unsafe-inline';
                worker-src ${webview.cspSource} blob:;
                font-src ${webview.cspSource};
                img-src ${webview.cspSource} https: data:;">`
    );

    // URIs
    const distUri             = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'media', 'dist'));
    const monacoCssUri        = vscode.Uri.joinPath(distUri, 'monaco-bundle.css');

    const utilsUri            = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'media', 'utils'));
    const monacoLoaderUri     = vscode.Uri.joinPath(utilsUri, 'monaco-loader.js');

    const stylesUri           = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'media', 'styles'));
    const componentsBaseUri   = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'media', 'components'));

    // 替換 placeholder（舊 {{monacoUri}} 不再需要）
    html = html
      .replace(/{{stylesUri}}/g,         stylesUri.toString())
      .replace(/{{componentsBaseUri}}/g, componentsBaseUri.toString())
      .replace(/{{utilsUri}}/g,          utilsUri.toString())
      .replace(/{{monacoUri}}/g, '');

    // 在 </head> 前插入 CSS + Loader（loader 會自行 import monaco-bundle.js）
    html = html.replace(
      /<\/head>/i,
      `<link rel="stylesheet" href="${monacoCssUri}">\n` +
      `<script type="module" src="${monacoLoaderUri}"></script>\n</head>`
    );

    return html;
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

  // === 收集 Stored Data（files + kv + packages）===
  private async _collectStoredRows(): Promise<Array<{kind:'file'|'kv'|'secret'|'package'; scope:'global'|'workspace'; ext:'text'|'json'|'bytes'; keyPath:string; size:number; version?:string}>> {
    const rows: Array<{kind:'file'|'kv'|'secret'|'package'; scope:'global'|'workspace'; ext:'text'|'json'|'bytes'; keyPath:string; size:number; version?:string}> = [];

    // 1) files (global/workspace)
    for (const scope of ['global','workspace'] as const) {
      try {
        const list: Array<{rel:string; name:string; size:number}> =
          await this._callBridge('files','listStats', scope, '');
        list.forEach(f => {
          const rel = String(f.rel || f.name || '').replace(/^[/\\]+/, '');
          if (!rel) { return; }
          // 排除 sbh.packages 目錄（套件由 packages API 管理）
          if (rel.startsWith('sbh.packages/') || rel.startsWith('sbh.packages\\')) { return; }
          const ext = /\.json$/i.test(rel) ? 'json' : /\.txt$/i.test(rel) ? 'text' : 'bytes';
          rows.push({ kind:'file', scope, ext, keyPath: rel, size: Number(f.size || 0) });
        });
      } catch {}
    }

    // 2) key-value storage (global/workspace)
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

    // 3) secret storage（只列 key，不取值；scope 固定 global）
    try {
      const secretKeys: string[] = await this._callBridge('secret', 'keys');
      for (const k of secretKeys) {
        rows.push({ kind:'secret', scope:'global', ext:'bytes', keyPath:k, size: 1 });// size 不明
      }
    } catch {}

    // 4) installed packages
    try {
      const packages: Array<{name:string; version:string; path:string; size?:number}> = await this._callBridge('packages', 'list');
      for (const pkg of packages) {
        rows.push({ 
          kind: 'package', 
          scope: 'global', 
          ext: 'bytes', 
          keyPath: pkg.name, 
          size: pkg.size || 0,
          version: pkg.version
        });
      }
    } catch {}

    return rows?.filter(row => !row.keyPath.includes(BACKUP_DIR));
  }


  private formatSize(bytes: number): string {
    if (bytes < 1024) { return bytes + ' B'; }
    if (bytes < 1024 * 1024) { return (bytes / 1024).toFixed(1) + ' KB'; }
    return (bytes / 1024 / 1024).toFixed(2) + ' MB';
  }
  
}
