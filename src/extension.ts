/**
 * Status Bar Helper - Core Extension Module
 * 
 * Architecture Overview:
 * ┌─────────────────────┐    ┌─────────────────────┐    ┌─────────────────────┐
 * │   VS Code UI        │    │   Settings Panel    │    │   Background VM     │
 * │   (Status Bar)      │◄──►│   (Webview)         │◄──►│   (Script Runner)   │
 * └─────────────────────┘    └─────────────────────┘    └─────────────────────┘
 *            ▲                          ▲                          ▲
 *            │                          │                          │
 *            └──────────────────────────┼──────────────────────────┘
 *                                       │
 *                          ┌─────────────────────┐
 *                          │   Global State      │
 *                          │   Manager           │
 *                          └─────────────────────┘
 * 
 * Key Responsibilities:
 * - Status bar item lifecycle management
 * - VM sandbox creation and script execution
 * - Cross-device synchronization with adaptive polling
 * - Bridge API for secure host-VM communication
 * - Settings panel and webview management
 * 
 * State Management:
 * - GLOBAL_MANIFEST_KEY: Status bar item display settings
 * - GLOBAL_ITEMS_KEY: Command → script mapping
 * - _lastSyncApplied: Last successful sync timestamp for UI indicators
 * 
 * Security Model:
 * - Scripts run in isolated VM context with limited Node.js modules
 * - All file I/O goes through bridge API with path validation
 * - Size limits enforced: 2MB/key, 200MB total, 10MB JSON/text, 50MB binary
 */

import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import * as vm from 'vm';
import { localize } from './nls';
import { SettingsPanel } from './SettingsPanel';
import {
  parseAndValidate,
  estimateSize,
  diff,
  applyImport,
  exportSelection,
  MergeStrategy,
  ConflictPolicy
} from './utils/importExport';
import {
  initGlobalSyncKeys,
  loadFromGlobal,
  saveOneToGlobal,
  saveAllToGlobal,
  SbhItem,
  MIGRATION_FLAG_KEY,
  GLOBAL_MANIFEST_KEY,
  GLOBAL_ITEMS_KEY
} from './globalStateManager';
import { SmartBackupManager } from './SmartBackupManager';
import { BACKUP_DIR } from './utils/backup';
import { SidebarManager } from './SidebarManager';
import { addSecretKey, loadSecretKeys, removeSecretKey } from './secretKeyManager';

const sidebarMgr = new SidebarManager();

let _smartBackupManager: SmartBackupManager | null = null;

// ============================================================================
// Global State - VM Management & Status Bar Runtime
// ============================================================================

/** Commands that have executed their "run once on startup" logic */
let _runOnceExecutedCommands: Set<string> = new Set();

/** Current items signature hash for change detection across devices */
let _itemsSignature = '';

/** Background polling timer for cross-device sync */
let _pollTimer: NodeJS.Timeout | null = null;

// ============================================================================
// Adaptive Polling System - Cross-Device Sync
// ============================================================================

/** 連續未變更次數 - 用於自適應調整輪詢間隔 */
let _pollStableCount = 0;

/** 目前使用的輪詢間隔（毫秒） */
let _pollCurrentInterval = 20000;

/** 最近一次偵測到遠端同步變更並套用的時間戳 (ms) - 用於 UI "Last sync" 指示器 */
let _lastSyncApplied: number | null = null;

/**
 * 進階自適應階梯：20s → 45s → 90s → 180s (3m) → 300s (5m) → 600s (10m)
 * 依據連續未變更次數逐步放緩輪詢，節省資源同時保持同步能力
 */
const POLL_INTERVAL_STEPS = [20000, 45000, 90000, 180000, 300000, 600000];

/**
 * 計算自適應輪詢間隔
 * @param isPanelOpen 設定面板是否開啟（開啟時最大限制在90s，確保即時性）
 * @param stable 連續未變更次數
 * @returns 輪詢間隔（毫秒）
 * 
 * 升級門檻：>=3 → idx1, >=6 → idx2, >=10 → idx3, >=15 → idx4, >=25 → idx5
 */
function _calcAdaptiveInterval(isPanelOpen: boolean, stable: number): number {
  let idx = 0;
  if (stable >= 25) {
    idx = 5;
  } else if (stable >= 15) {
    idx = 4;
  } else if (stable >= 10) {
    idx = 3;
  } else if (stable >= 6) {
    idx = 2;
  } else if (stable >= 3) {
    idx = 1;
  } else {
    idx = 0;
  }
  // 若面板開啟，避免過慢（最高到 index 2 = 90s）
  if (isPanelOpen && idx > 2) { idx = 2; }
  return POLL_INTERVAL_STEPS[idx];
}

// ─────────────────────────────────────────────────────────────
// 常數與小工具
// ─────────────────────────────────────────────────────────────
const fsp = fs.promises;
const KV_PREFIX = 'sbh.kv.';
const STORAGE_KEY_LIMIT   =  5 * 1024 * 1024;  // 5MB
const STORAGE_TOTAL_LIMIT = 200 * 1024 * 1024; // 200MB
const JSON_SIZE_LIMIT     =  15 * 1024 * 1024; // 15MB
const TEXT_SIZE_LIMIT     =  15 * 1024 * 1024; // 15MB
const FILE_SIZE_LIMIT     = 50 * 1024 * 1024; // 50MB

const utf8Bytes = (v: any): number => {
  try {
  if (typeof v === 'string') { return Buffer.byteLength(v, 'utf8'); }
    return Buffer.byteLength(JSON.stringify(v ?? null), 'utf8');
  } catch { return 0; }
};

const toBridgeError = (e: unknown) =>
  ({ ok: false, error: (e as any)?.message ?? String(e) });

const scopeBase = (scope: 'global'|'workspace', ctx: vscode.ExtensionContext) => {
  if (scope === 'global') { return ctx.globalStorageUri.fsPath; }
  const ws = ctx.storageUri?.fsPath;
  if (!ws) { throw new Error(localize('err.workspaceStorageUnavailable', 'workspace storage not available')); }
  return ws;
};

const inside = (base: string, rel = '') => {
  if (!rel) { return base; }
  if (path.isAbsolute(rel)) { throw new Error(localize('err.absPathNotAllowed', 'absolute path not allowed')); }
  if (rel.includes('..')) { throw new Error(localize('err.pathEscapeRejected', 'path escape rejected')); }
  return path.join(base, rel);
};

// ─────────────────────────────────────────────────────────────
// 遷移函數（在此檔案中實現，因為需要存取其他設定）
// ─────────────────────────────────────────────────────────────

async function migrateFromSettingsIfNeeded(context: vscode.ExtensionContext): Promise<boolean> {
  // 檢查是否已遷移
  const isMigrated = context.globalState.get<boolean>(MIGRATION_FLAG_KEY);
  
  try {
    const config = vscode.workspace.getConfiguration('statusBarHelper');
    const oldItems = config.get<any[]>('items', []);
    
    if (!Array.isArray(oldItems) || oldItems.length === 0) {
      // 沒有舊資料
      if (!isMigrated) {
        // 首次執行，標記完成
        await context.globalState.update(MIGRATION_FLAG_KEY, true);
        return true;
      }
      return false;
    }
    
    // 有舊資料 - 無論是否已遷移，都檢查是否有新項目
    const existingItems = loadFromGlobal(context);
    const existingCommands = new Set(existingItems.map(i => i.command));
    const newItems = oldItems.filter(item => 
      item && typeof item === 'object' && 
      item.command && 
      !existingCommands.has(item.command)
    );
    
    if (newItems.length === 0) {
      // 沒有新項目，清空用戶級別的舊設定即可
      await config.update('items', [], vscode.ConfigurationTarget.Global);
      if (!isMigrated) {
        await context.globalState.update(MIGRATION_FLAG_KEY, true);
      }
      return false;
    }
    
    // 有新項目需要遷移
    if (isMigrated) {
      console.log(localize('log.migrate.foundNew', 'Found {0} new items to migrate from settings.json (sync scenario)', String(newItems.length)));
    }
    
    // 備份舊設定（可選，失敗不阻斷）
    try {
      const backupPath = path.join(context.globalStorageUri.fsPath, 'settings-backup.json');
      await fsp.mkdir(path.dirname(backupPath), { recursive: true });
      await fsp.writeFile(backupPath, JSON.stringify({ 
        timestamp: new Date().toISOString(),
        items: oldItems 
      }, null, 2));
    } catch (backupError) {
      console.warn(localize('log.migrate.backupFailed', 'Failed to backup settings:'), backupError);
    }
    
    // 載入現有 globalState 資料
    const manifest = context.globalState.get<any>(GLOBAL_MANIFEST_KEY, { version: 1, items: [] });
    const itemsMap = context.globalState.get<any>(GLOBAL_ITEMS_KEY, {});
    
    // 遷移每個項目（如果已遷移過，只處理新項目；否則處理全部）
    const itemsToMigrate = isMigrated ? newItems : oldItems;
    
    for (const oldItem of itemsToMigrate) {
      if (!oldItem || typeof oldItem !== 'object') {
        continue;
      }
      
      let command = oldItem.command;
      if (!command || typeof command !== 'string') {
        // 產生新的 command ID
        command = `sbh.user.${Math.random().toString(36).substr(2, 8)}`;
      }
      
      // 更新 manifest
      const existingIndex = manifest.items.findIndex((i: any) => i.command === command);
      const meta = {
        command,
  text: oldItem.text || '$(question) ' + localize('label.unknown', 'Unknown'),
        tooltip: oldItem.tooltip,
        hidden: Boolean(oldItem.hidden),
        enableOnInit: Boolean(oldItem.enableOnInit)
      };
      
      if (existingIndex >= 0) {
        manifest.items[existingIndex] = meta;
      } else {
        manifest.items.push(meta);
      }
      
      // 更新 script
      itemsMap[command] = oldItem.script || '';
    }
    
    // 寫回 globalState
    await context.globalState.update(GLOBAL_MANIFEST_KEY, manifest);
    await context.globalState.update(GLOBAL_ITEMS_KEY, itemsMap);
    
    // 清空舊設定（只清空用戶級別，因為通常用戶不會在工作區設定這個）
    await config.update('items', [], vscode.ConfigurationTarget.Global);
    
    // 標記遷移完成
    await context.globalState.update(MIGRATION_FLAG_KEY, true);
    
    if (itemsToMigrate.length > 0) {
      const msg = isMigrated
        ? localize('msg.migrate.successImported', '✅ Status Bar Helper: Successfully imported {0} items to the new storage format', String(itemsToMigrate.length))
        : localize('msg.migrate.successMigrated', '✅ Status Bar Helper: Successfully migrated {0} items to the new storage format', String(itemsToMigrate.length));
      vscode.window.showInformationMessage(msg);
    }
    
    return true;
    
  } catch (error) {
  console.error(localize('log.migrate.failed', 'Migration failed:'), error);
  vscode.window.showWarningMessage(localize('msg.migrate.failed', '⚠️ Status Bar Helper: Migration failed, old settings will be preserved. See Output panel for details.'));
    
    // 輸出詳細錯誤到 Output
  const output = vscode.window.createOutputChannel(localize('ext.outputChannel', 'Status Bar Helper'));
    output.appendLine(`Migration Error: ${error}`);
    output.show(true);
    
    return false;
  }
}

const ensureDir = async (absFile: string) => {
  await fsp.mkdir(path.dirname(absFile), { recursive: true }).catch(() => {});
};

// ============================================================================
// VM Runtime Management - Isolated Script Execution
// ============================================================================

/**
 * VM Runtime Context - 追蹤每個 command 的執行環境
 * 
 * 每個狀態列按鈕對應一個獨立的 VM 沙箱，確保：
 * - 腳本間互不干擾
 * - 資源可以完整清理
 * - 錯誤隔離不影響其他腳本
 */
type RuntimeCtx = {
  /** AbortController for graceful script termination */
  abort: AbortController;
  /** Timer references for cleanup (setTimeout, setInterval) */
  timers: Set<NodeJS.Timeout>;
  /** VS Code disposable resources (listeners, providers, etc.) */
  disposables: Set<vscode.Disposable>;
};

/** Active VM runtimes mapped by command ID */
const RUNTIMES = new Map<string, RuntimeCtx>();

// ============================================================================
// Inter-VM Message Bus - Script Communication System
// ============================================================================

/**
 * 腳本間訊息傳遞系統
 * 
 * 功能：
 * - vm.sendMessage(target, msg)：向指定 command 發送訊息
 * - vm.onMessage(handler)：註冊訊息接收處理器
 * - vm.open(cmdId, payload?)：啟動目標腳本並可選傳遞初始資料
 * 
 * 特性：
 * - 訊息只在當次 VM 生命週期內有效
 * - 目標 VM 未啟動時訊息會暫存於佇列
 * - VM 關閉時自動清理相關 handlers 與 queue
 */
type MessageRecord = { from: string; message: any };

/** Message handlers registered by each VM */
const MESSAGE_HANDLERS = new Map<string, Set<(from: string, message: any) => void>>();

/** Queued messages for VMs that haven't registered handlers yet */
const MESSAGE_QUEUES   = new Map<string, MessageRecord[]>();

/**
 * 分發訊息到目標 VM
 * @param target 目標 command ID
 * @param from 發送者 command ID  
 * @param message 訊息內容
 */
function dispatchMessage(target: string, from: string, message: any) {
  const handlers = MESSAGE_HANDLERS.get(target);
  if (!handlers || handlers.size === 0) {
    // 目標尚未註冊 handler，加入佇列
    let q = MESSAGE_QUEUES.get(target);
    if (!q) { q = []; MESSAGE_QUEUES.set(target, q); }
    q.push({ from, message });
    return;
  }
  // 立即分發給所有註冊的 handlers
  for (const h of handlers) {
    try { h(from, message); } catch (e) { console.error('[vm message handler error]', e); }
  }
}

function registerMessageHandler(command: string, handler: (from: string, message: any) => void) {
  let set = MESSAGE_HANDLERS.get(command);
  if (!set) { set = new Set(); MESSAGE_HANDLERS.set(command, set); }
  set.add(handler);
  // flush queued
  const q = MESSAGE_QUEUES.get(command);
  if (q && q.length) {
    for (const rec of q) {
      try { handler(rec.from, rec.message); } catch {}
    }
    MESSAGE_QUEUES.delete(command);
  }
  return () => { try { set?.delete(handler); } catch {} };
}

/**
 * 清理 VM 執行環境
 * @param command 要終止的 command ID
 * @param reason 終止原因（用於診斷和日誌）
 * @returns 是否成功終止（false 表示該 command 未在執行）
 * 
 * 完整清理流程：
 * 1. 發送 abort 信號給 VM
 * 2. 從 RUNTIMES 移除執行上下文
 * 3. 清理該 VM 的訊息處理器和佇列
 */
function abortByCommand(command: string, reason: any = { type: 'external', at: Date.now() }) {
  const ctx = RUNTIMES.get(command);
  if (!ctx) { return false; }
  try { ctx.abort.abort(reason); } catch {}
  RUNTIMES.delete(command);
  MESSAGE_HANDLERS.delete(command);
  MESSAGE_QUEUES.delete(command);
  return true;
}

/**
 * 建構 StatusBarHelper API 物件 - 提供給 VM 沙箱使用
 * 
 * 架構說明：
 * VM 沙箱 → sbh.v1.* → call() → _bridge command → Host APIs
 * 
 * 這種間接調用確保：
 * - VM 無法直接存取 host 環境
 * - 所有 I/O 經過安全驗證
 * - 統一的錯誤處理和日誌記錄
 * - 可以追蹤和限制 API 使用
 */
function buildSbh() {
  // 透過 _bridge 指令統一呼叫；提供給 VM 沙箱
  const call = async (ns: string, fn: string, ...args: any[]) => {
    const r = await vscode.commands.executeCommand('statusBarHelper._bridge', { ns, fn, args }) as any;
  if (r && r.ok) { return r.data; }
    throw new Error(r?.error || 'bridge error');
  };

  return {
    v1: {
      // Key-Value 持久化儲存 - 適合設定、小型資料
      storage: {
        // 全域儲存 - 跨工作區共享
        global: {
          get:  (key: string, def?: any) => call('storage', 'getGlobal', key, def),
          set:  (key: string, val: any)  => call('storage', 'setGlobal', key, val),
          remove: (key: string)          => call('storage', 'removeGlobal', key),
          keys: ()                       => call('storage', 'keysGlobal'),
        },
        // 工作區儲存 - 僅當前工作區可見
        workspace: {
          get:  (key: string, def?: any) => call('storage', 'getWorkspace', key, def),
          set:  (key: string, val: any)  => call('storage', 'setWorkspace', key, val),
          remove: (key: string)          => call('storage', 'removeWorkspace', key),
          keys: ()                       => call('storage', 'keysWorkspace'),
        },
      },
      // 檔案系統操作 - 支援文字、JSON、二進位格式
      files: {
        dirs:       () => call('files', 'dirs'),
        readText:   (scope: 'global'|'workspace', rel: string) => call('files', 'readText', scope, rel),
        writeText:  (scope: 'global'|'workspace', rel: string, s: string) => call('files', 'writeText', scope, rel, s),
        readJSON:   (scope: 'global'|'workspace', rel: string) => call('files', 'readJSON', scope, rel),
        writeJSON:  (scope: 'global'|'workspace', rel: string, data: any) => call('files', 'writeJSON', scope, rel, data),
        readBytes:  (scope: 'global'|'workspace', rel: string) => call('files', 'readBytes', scope, rel),
        writeBytes: (scope: 'global'|'workspace', rel: string, data: Uint8Array|ArrayBuffer|string) => call('files', 'writeBytes', scope, rel, data),
        exists:     (scope: 'global'|'workspace', rel: string) => call('files', 'exists', scope, rel),
        list:       (scope: 'global'|'workspace', rel?: string) => call('files', 'list', scope, rel ?? ''),
        listStats:  (scope: 'global'|'workspace', rel?: string) => call('files', 'listStats', scope, rel ?? ''),
        remove:     (scope: 'global'|'workspace', rel: string) => call('files', 'remove', scope, rel),
        clearAll:   (scope: 'global'|'workspace') => call('files', 'clearAll', scope),
      },
      // 密碼管理
      secret: {
        get:    (key: string) => call('secret', 'get', key),
        set:    (key: string, value: string) => call('secret', 'set', key, value),
        delete: (key: string) => call('secret', 'delete', key),
        keys:   () => call('secret', 'keys'),  
      },
      // 側邊欄操作
      sidebar: {
        open:       (spec: any) => sidebarMgr.open(spec),
        postMessage:(msg: any) => sidebarMgr.postMessage(msg),
        onMessage:  (handler: (m:any)=>void) => sidebarMgr.onMessage(handler),
        close:      () => sidebarMgr.close(),
        onClose:    (handler: ()=>void) => sidebarMgr.onClose(handler),
      },
      // vm 會在 runScriptInVm 執行時注入
      vm: {} as any,
    }
  };
}

/**
 * 在 Extension Host 內執行 VM 沙箱腳本
 * 
 * 設計原則：
 * - 每個 command 對應一個獨立的 VM 沙箱
 * - 提供受限的 Node.js 環境（僅內建模組）
 * - 透過 bridge API 進行安全的 host 通訊
 * - 完整的資源清理和錯誤隔離
 * 
 * @param context VS Code 擴充套件上下文
 * @param command 指令 ID（用作 VM 識別）
 * @param code 要執行的 JavaScript 程式碼
 * @param origin 執行來源（狀態列按鈕/自動執行/設定面板預覽）
 */
function runScriptInVm(
  context: vscode.ExtensionContext,
  command: string,
  code: string,
  origin: 'statusbar' | 'autorun' | 'settingsPanel'
) {
  // 同 command 舊 VM 先替換（確保單一實例）
  abortByCommand(command, { type: 'replaced', from: origin, at: Date.now() });

  // 建立執行上下文
  const abort = new AbortController();
  const signal = abort.signal;
  const timers = new Set<NodeJS.Timeout>();           // 追蹤計時器供清理
  const disposables = new Set<vscode.Disposable>();   // 追蹤 VS Code 資源供清理

  /**
   * 包裝 Timer 函數以追蹤資源
   * 確保 VM 結束時可以清理所有 setTimeout/setInterval
   */
  const wrapTimeout = <T extends (...a: any[]) => any>(orig: T) =>
    ((...args: any[]) => { const h = orig(...args); timers.add(h as any); return h; }) as unknown as T;

  /**
   * 向設定面板發送訊息（僅限面板預覽模式）
   * 用於即時顯示腳本執行結果和錯誤
   */
  const postToSettingsPanel = (m: any) => {
  if (origin !== 'settingsPanel') { return; }
    const p = (SettingsPanel.currentPanel as any);
    p?._panel?.webview?.postMessage?.(m);
  };

  /**
   * 代理 console 輸出到設定面板
   * 讓 VM 內的 console.log 等可以顯示在 Output 面板
   */
  const makeConsoleProxy = (base: Console) => {
    const forward = (level: 'log'|'info'|'warn'|'error') =>
      (...args: any[]) => {
        try { (base as any)[level](...args); } catch {}
        // 轉成字串（盡量好看）
        const text = args.map(a => {
          if (typeof a === 'string') { return a; }
          try { return JSON.stringify(a, null, 2); } catch { return String(a); }
        }).join(' ') + '\n';
        postToSettingsPanel({ command: 'runLog', chunk: text });
      };
    return {
      ...base,
      log:  forward('log'),
      info: forward('info'),
      warn: forward('warn'),
      error: forward('error'),
    } as Console;
  };

  // 深層 proxy vscode（原本就有）
  const makeDeepVscodeProxy = (root: any) => {
    const cache = new WeakMap<object, any>();
    const wrapFn = (fn: Function, thisArg: any) => (...args: any[]) => {
  if (signal.aborted) { throw new Error(localize('err.execStopped', 'Execution stopped')); }
      const ret = Reflect.apply(fn, thisArg, args);
      if (ret && typeof ret === 'object' && typeof (ret as any).dispose === 'function') {
        try { disposables.add(ret as vscode.Disposable); } catch {}
      }
      return ret;
    };
    const proxify = (obj: any): any => {
    if (!obj || (typeof obj !== 'object' && typeof obj !== 'function')) { return obj; }
    if (cache.has(obj)) { return cache.get(obj); }
      const p = new Proxy(obj, {
        get(t, prop, recv) {
          const v = Reflect.get(t, prop, recv);
      if (typeof v === 'function') { return wrapFn(v, t); }
      if (v && (typeof v === 'object' || typeof v === 'function')) { return proxify(v); }
          return v;
        }
      });
      cache.set(obj, p);
      return p;
    };
    return proxify(root);
  };

  const sandbox: any = {
    fs, path, process,
    // ▶ 如果從 settingsPanel 跑，就用 proxy console，把輸出回傳給 webview
    console: origin === 'settingsPanel' ? makeConsoleProxy(console) : console,
    __dirname: path.dirname(context.extensionPath),
    require: (m: string) => {
  if (m === 'vscode') { return sandbox.vscode; }
  if (require.resolve(m) === m) { return require(m); } // 只允許 Node 內建模組
      throw new Error(localize('err.onlyBuiltinAllowed', 'Only built-in modules are allowed: {0}', String(m)));
    }
  };
  sandbox.Buffer = require('buffer').Buffer;
  sandbox.vscode = makeDeepVscodeProxy(vscode);

  // 注入 sbh 與 vm API
  const api = buildSbh();

  (api as any).v1.vm = {
    onStop: (handler: (r:any)=>void) => {
      if (signal.aborted) { queueMicrotask(() => handler((signal as any).reason)); return () => {}; }
      const h = () => handler((signal as any).reason);
      signal.addEventListener('abort', h, { once: true });
      return () => signal.removeEventListener('abort', h);
    },
    stop: (reason?: any) => {
      try { abort.abort(reason ?? { type: 'userStop', at: Date.now() }); } catch {}
    },
    reason: () => (signal as any).reason,
    command,
    stopByCommand: (cmd?: string, reason?: any) => {
      try { abortByCommand(cmd ?? command, reason ?? { type: 'userStop', at: Date.now() }); } catch {}
    },
    signal,
    // ─── 新增：訊息 / 啟動 API ───
    sendMessage: (targetCmdId: string, message: any) => {
      if (!targetCmdId || typeof targetCmdId !== 'string') { return; }
      dispatchMessage(targetCmdId, command, message);
    },
    onMessage: (handler: (fromCmdId: string, message: any) => void) => {
      if (typeof handler !== 'function') { return () => {}; }
      return registerMessageHandler(command, handler);
    },
    open: async (cmdId: string, payload?: any) => {
      if (!cmdId || typeof cmdId !== 'string') { throw new Error(localize('err.vmOpenInvalidCmd', 'vm.open: invalid cmdId')); }
      // 已在跑 → 直接送 payload
      if (RUNTIMES.has(cmdId)) {
        if (arguments.length >= 2) { dispatchMessage(cmdId, command, payload); }
        return;
      }
      // 從 globalState 載入腳本
      const items = loadFromGlobal(context);
      const targetItem = items.find(i => i && i.command === cmdId);
  if (!targetItem || !targetItem.script) { throw new Error(localize('err.vmOpenCmdNotFound', 'vm.open: command not found or empty script: {0}', String(cmdId))); }
      try {
        runScriptInVm(context, cmdId, targetItem.script, 'statusbar');
      } catch (e) {
        throw new Error(localize('err.vmOpenStartFailed', 'vm.open: failed to start target: {0}', (e as any)?.message || String(e)));
      }
      // 等待下一輪 tick 讓目標 VM 有機會註冊 onMessage 再送 payload（若有）
      if (arguments.length >= 2) {
        setTimeout(() => dispatchMessage(cmdId, command, payload), 0);
      }
    }
  };

  // 當 VM 結束時通知 webview（對 Trusted VM 也要有 runDone）
  sandbox.__sbhDone = (code: number) => {
    if (code === 0) {
      postToSettingsPanel({ command: 'runDone', code, chunk: '[Run succeeded]' });
    } else {
      postToSettingsPanel({ command: 'runDone', code, chunk: '[Run failed]' });
    }
  };

  sandbox.sbh = sandbox.statusBarHelper = sandbox.SBH = api;

  // 攔住計時器，便於 stop 清掉
  sandbox.setTimeout  = wrapTimeout(setTimeout);
  sandbox.setInterval = wrapTimeout(setInterval);
  sandbox.clearTimeout  = (h: any) => { timers.delete(h); clearTimeout(h); };
  sandbox.clearInterval = (h: any) => { timers.delete(h); clearInterval(h); };

  // 記錄這顆 VM
  RUNTIMES.set(command, { abort, timers, disposables });
  // 初始化訊息 handler 集合（確保存在，方便 queue flush）
  if (!MESSAGE_HANDLERS.has(command)) { MESSAGE_HANDLERS.set(command, new Set()); }

  // 被 stop 時清理
  signal.addEventListener('abort', () => {
    for (const t of timers) { try { clearTimeout(t); clearInterval(t as any); } catch {} }
    for (const d of disposables) { try { d.dispose(); } catch {} }
    RUNTIMES.delete(command);
  MESSAGE_HANDLERS.delete(command);
  MESSAGE_QUEUES.delete(command);
    // 如果是從設定面板跑的，中止也當作 done（非 0 退出碼）
    postToSettingsPanel({ command: 'runDone', code: 0 , chunk: '[VM closed]' });
  }, { once: true });

  // 包起來：resolve / reject 都會呼叫 __sbhDone
  const wrapped =
    `(async()=>{try{${code}}catch(e){console.error('❌',e&&(e.stack||e.message||e));throw e}})()
      .then(()=>{try{__sbhDone?.(0)}catch{}})
      .catch(()=>{try{__sbhDone?.(1)}catch{}})`;

  try {
    vm.runInNewContext(wrapped, sandbox);
  } catch (e) {
    RUNTIMES.delete(command);
    // 啟動失敗也要把錯誤丟給 webview
    postToSettingsPanel({ command: 'runLog', chunk: `[VM bootstrap error] ${(e as any)?.message || String(e)}\n` });
    postToSettingsPanel({ command: 'runDone', code: 1  , chunk: '[Run failed]' });
    throw e;
  }
}


// ─────────────────────────────────────────────────────────────
// 狀態列項目管理
// ─────────────────────────────────────────────────────────────
let itemDisposables: vscode.Disposable[] = [];
let gearItem: vscode.StatusBarItem | null = null;

function updateStatusBarItems(context: vscode.ExtensionContext, firstActivation = false) {
  // 清掉舊的
  itemDisposables.forEach(d => d.dispose());
  itemDisposables = [];

  // 從 globalState 載入項目
  const items = loadFromGlobal(context);

  items.forEach((item, index) => {
    const { text, tooltip, command, script, hidden, enableOnInit } = item;
    
    // 創建狀態列項目（即使隱藏也要創建，以便動態切換顯示）
    const statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100 - index);
    statusBarItem.text = text;
    statusBarItem.tooltip = tooltip;
    statusBarItem.command = command;

    // 每個 item 對應一個 command：透過 runScriptInVm 執行
    const commandDisposable = vscode.commands.registerCommand(command, () => {
    if (!script) { return; }
      try {
        runScriptInVm(context, command, script, 'statusbar');
      } catch (e: any) {
        vscode.window.showErrorMessage(localize('err.script', '❌ Script error: {0}', e?.message || String(e)));
        console.error(e);
      }
    });

    itemDisposables.push(statusBarItem, commandDisposable);

    // 根據 hidden 狀態決定是否顯示
    if (!hidden) {
      statusBarItem.show();
    }

    // enableOnInit 邏輯（只在首次啟動時執行）
    if (firstActivation && enableOnInit && !_runOnceExecutedCommands.has(command)) {
      try {
        runScriptInVm(context, command, script, 'autorun');
        _runOnceExecutedCommands.add(command);
      } catch (e: any) {
        vscode.window.showErrorMessage(localize('err.scriptRunOnce', '❌ Script error (Run Once): {0}', e?.message || String(e)));
        console.error(e);
      }
    }
  });
  // 更新簽章（用於遠端同步差異偵測）
  try { _itemsSignature = computeItemsSignature(items); } catch {}
  // 若是首次啟动尚未有同步紀錄，初始化基準時間（方便 UI 顯示）
  if (firstActivation && _lastSyncApplied === null) {
    _lastSyncApplied = Date.now();
  }
}

function refreshGearButton() {
  if (gearItem) { gearItem.dispose(); gearItem = null; }
  const enabled = vscode.workspace.getConfiguration('statusBarHelper')
    .get<boolean>('showGearOnStartup', true);

  if (!enabled) { return; }

  const item = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
  item.text = '$(gear)';
  item.tooltip = localize('tooltip.settings', 'Status Bar Helper Settings');
  item.command = 'statusBarHelper.showSettings';
  item.show();
  gearItem = item;
}

function computeItemsSignature(items: ReturnType<typeof loadFromGlobal>): string {
  const hash = (s: string) => {
    let h = 5381; for (let i = 0; i < s.length; i++) { h = (h * 33) ^ s.charCodeAt(i); }
    return (h >>> 0).toString(36);
  };
  return items
    .map(i => `${i.command}|${hash(i.script||'')}|${i.text||''}|${i.tooltip||''}|${i.hidden?'1':'0'}|${i.enableOnInit?'1':'0'}`)
    .sort()
    .join('~');
}

function startBackgroundPolling(context: vscode.ExtensionContext) {
  if (_pollTimer) { clearTimeout(_pollTimer); }
  _pollStableCount = 0;
  _pollCurrentInterval = POLL_INTERVAL_STEPS[0];
  const loop = () => {
    try { backgroundPollOnce(context); } catch {}
    _pollTimer = setTimeout(loop, _pollCurrentInterval);
  };
  _pollTimer = setTimeout(loop, _pollCurrentInterval);
}

// 單次背景輪詢；若偵測到變更回傳 true。若未變更且 noAdapt=true，則不增加穩定次數（避免面板剛開造成過度升級）。
function backgroundPollOnce(context: vscode.ExtensionContext, noAdapt = false): boolean {
  const items = loadFromGlobal(context);
  const sig = computeItemsSignature(items);
  if (sig !== _itemsSignature) {
    _itemsSignature = sig;
    updateStatusBarItems(context, false);
    if (SettingsPanel.currentPanel) {
      try { (SettingsPanel.currentPanel as any)._sendStateToWebview?.(); } catch {}
    }
    _pollStableCount = 0;
    _pollCurrentInterval = POLL_INTERVAL_STEPS[0];
  _lastSyncApplied = Date.now();
    return true;
  }
  if (!noAdapt) {
    _pollStableCount++;
    _pollCurrentInterval = _calcAdaptiveInterval(!!SettingsPanel.currentPanel, _pollStableCount);
  }
  return false;
}

// 在需要時（例如開啟設定面板）強制立即做一次快掃：
// 規則：若目前 interval 已經 <= 90s（index 0/1/2）就不做，避免太頻繁；
//       若 > 90s 則立即掃描，未變更時不推進自適應（保持節能節奏），有變更則重置為最快。
function forceImmediatePoll(context: vscode.ExtensionContext, respectShortInterval = true) {
  const SHORT_CAP = 90000; // 90s
  if (respectShortInterval && _pollCurrentInterval <= SHORT_CAP) { return; }
  if (_pollTimer) { clearTimeout(_pollTimer); _pollTimer = null; }
  try { backgroundPollOnce(context, true); } catch {}
  // 重新排下一輪（使用當前 _pollCurrentInterval，若有變更已被重置）
  const loop = () => {
    try { backgroundPollOnce(context); } catch {}
    _pollTimer = setTimeout(loop, _pollCurrentInterval);
  };
  _pollTimer = setTimeout(loop, _pollCurrentInterval);
}

// ─────────────────────────────────────────────────────────────
// 預設樣本載入（轉型：改由 JSON 作為單一來源）
// Step 1: 先支援 JSON 載入 + TS 常數 fallback；後續可移除 TS 常數。
// ─────────────────────────────────────────────────────────────
async function ensureDefaultItems(context: vscode.ExtensionContext) {
  const seededKey = 'sbh.seededDefaults.v3'; // bump key to重新植入新格式（僅在空清單時）
  const already = context.globalState.get<boolean>(seededKey);
  const existing = loadFromGlobal(context);
  if (already || existing.length > 0) { return; }

  let defaults: SbhItem[] = [];
  try {
    defaults = await loadDefaultsFromJson(context);
  } catch (e) {
    console.warn('[sbh] loadDefaultsFromJson failed, fallback to TS constants:', (e as any)?.message || e);
    // 已無 TS 常數；若 JSON 失敗，提供最小 fallback 2 個腳本
    defaults = [
      { command: 'sbh.demo.logMinimalPlus', text: '$(output) Log', tooltip: 'Log demo (fallback)', script: "console.log('fallback log'); const { vm }=statusBarHelper.v1; vm.stop();", enableOnInit: false, hidden: true },
      { command: 'sbh.demo.toggleTheme', text: '$(color-mode)', tooltip: 'Toggle theme (fallback)', script: "const vscode=require('vscode'); const { vm }=statusBarHelper.v1; vscode.commands.executeCommand('workbench.action.toggleLightDarkThemes').finally(()=>vm.stop());", enableOnInit: false, hidden: false }
    ];
  }
  for (const item of defaults) {
    try { await saveOneToGlobal(context, item); } catch {}
  }
  await context.globalState.update(seededKey, true);
}

async function loadDefaultsFromJson(context: vscode.ExtensionContext): Promise<SbhItem[]> {
  // 使用 VS Code 目前顯示語言（更精準）
  const guess = vscode.env.language.toLowerCase();
  const localeCandidates: string[] = [];
  if (['zh-tw', 'zh-hant'].some(tag => guess.startsWith(tag))) { localeCandidates.push('zh-tw'); }
  // 其它一律 fallback 英文
  localeCandidates.push('en');

  // 先嘗試遠端（GitHub raw）→ 失敗再 fallback 本地 packaged 檔案
  // 風險控管：
  //  - Timeout 3s 避免 activation 卡住
  //  - 限制大小 256KB
  //  - 僅允許陣列 JSON，否則視為失敗
  const RAW_BASE = 'https://raw.githubusercontent.com/JiaHongL/status-bar-helper/main/media';
  const SIZE_LIMIT = 256 * 1024;

  const tryFetchRemote = async (loc: string): Promise<SbhItem[] | null> => {
    const url = `${RAW_BASE}/script-store.defaults.${loc}.json`;
    try {
      const text = await new Promise<string>((resolve, reject) => {
        const controller = new AbortController();
        const timer = setTimeout(() => { controller.abort(); reject(new Error('timeout')); }, 3000);
        // 使用 https 模組，避免對 fetch lib 依賴
        const https = require('https') as typeof import('https');
        https.get(url, { signal: (controller as any).signal, headers: { 'User-Agent': 'status-bar-helper' } }, (res: any) => {
          if (res.statusCode !== 200) { clearTimeout(timer); res.resume(); return reject(new Error('http ' + res.statusCode)); }
          let size = 0; let chunks: Buffer[] = [];
          res.on('data', (d: Buffer) => { size += d.length; if (size > SIZE_LIMIT) { res.destroy(new Error('size limit')); return; } chunks.push(d); });
          res.on('end', () => { clearTimeout(timer); try { resolve(Buffer.concat(chunks).toString('utf8')); } catch (e) { reject(e); } });
          res.on('error', (e: any) => { clearTimeout(timer); reject(e); });
        }).on('error', (e: any) => { clearTimeout(timer); reject(e); });
      });
      const arr = JSON.parse(text);
      if (!Array.isArray(arr)) { return null; }
      return arr.map(normalizeDefaultJsonItem).filter(Boolean) as SbhItem[];
    } catch (e) {
      // 靜默失敗：回到本地 fallback
      console.warn('[sbh] remote defaults fetch failed', loc, (e as any)?.message || e);
      return null;
    }
  };

  for (const loc of localeCandidates) {
    const remote = await tryFetchRemote(loc);
    if (remote && remote.length) { return remote; }
  }

  // 遠端都失敗 → 本地 packaged fallback
  const mediaRoot = context.asAbsolutePath('media');
  const triedLocal: string[] = [];
  for (const loc of localeCandidates) {
    const file = path.join(mediaRoot, `script-store.defaults.${loc}.json`);
    triedLocal.push(file);
    if (fs.existsSync(file)) {
      try {
        const raw = await fsp.readFile(file, 'utf8');
        const arr = JSON.parse(raw);
        if (!Array.isArray(arr)) { continue; }
        return arr.map(normalizeDefaultJsonItem).filter(Boolean) as SbhItem[];
      } catch (e) {
        console.warn('[sbh] local defaults parse failed', file, (e as any)?.message || e);
      }
    }
  }
  throw new Error('no defaults json found (remote & local)');
}

function normalizeDefaultJsonItem(x: any): SbhItem | null {
  if (!x || typeof x !== 'object') { return null; }
  if (typeof x.command !== 'string' || !x.command) { return null; }
  // script 欄位在第一階段可為空字串（之後 Script Store 將遠端補全）
  const script = typeof x.script === 'string' ? x.script : '';
  return {
    command: x.command,
    text: typeof x.text === 'string' ? x.text : x.command,
    tooltip: typeof x.tooltip === 'string' ? x.tooltip : x.command,
    script,
    enableOnInit: !!x.enableOnInit,
  hidden: !!x.hidden,
  tags: Array.isArray(x.tags) ? x.tags.filter((t: any) => typeof t === 'string' && t.trim()).slice(0, 12) : undefined
  };
}

// Deprecated: 後續將移除，僅作為 JSON 載入失敗 fallback

// 若使用者在加入 Chat A/B 之前已安裝，globalState 中可能沒有這兩個項目或 script 為空字串。
async function backfillChatMessagingSamples(context: vscode.ExtensionContext) {
  // 轉型後：Chat A/B 預設腳本已內嵌於 JSON，不做舊版補寫。
}

// ─────────────────────────────────────────────────────────────
// Bridge 指令：statusBarHelper._bridge
// ─────────────────────────────────────────────────────────────
function registerBridge(context: vscode.ExtensionContext) {
  return vscode.commands.registerCommand('statusBarHelper._bridge', async (payload?: any) => {
    try {
      if (!payload || typeof payload !== 'object') { throw new Error('invalid payload'); }
      const { ns, fn, args = [] } = payload as { ns: string; fn: string; args: any[] };

      // --- 智慧備份 bridge API ---
      if (ns === 'backup') {
        try {
          if (!_smartBackupManager) { throw new Error('SmartBackupManager not initialized'); }
          switch (fn) {
            case 'createBackup': {
              // 取得目前 global items
              const { loadFromGlobal } = require('./globalStateManager');
              const { writeSmartBackup, cleanupOldBackups } = require('./utils/backup');
              const items = loadFromGlobal(context);
              // 產生 signature
              const changeSignature = require('crypto').createHash('sha256').update(JSON.stringify(items)).digest('hex');
              const freq = 'manual';
              const content = {
                timestamp: new Date().toISOString(),
                type: 'smart',
                changeSignature,
                changeFrequency: freq,
                items
              };
              await writeSmartBackup(context.globalStorageUri.fsPath, content);
              await cleanupOldBackups(context.globalStorageUri.fsPath);
              return { ok: true };
            }
            case 'getStatus': {
              const status = _smartBackupManager.getStatus();
              return { ok: true, data: status };
            }
            case 'forceBackup': {
              try {
                await _smartBackupManager['checkAndBackup']();
                return { ok: true };
              } catch (e:any) {
                return { ok: false, error: e?.message || String(e) };
              }
            }
            case 'listHistory': {
              const { listSmartBackups } = require('./utils/backup');
              const basePath = context.globalStorageUri.fsPath;
              const list = await listSmartBackups(basePath);
              return { ok: true, data: list };
            }
            case 'restore': {
              const [filePath] = args;
              const { readSmartBackup } = require('./utils/backup');
              const backup = await readSmartBackup(filePath);
              if (!backup || !Array.isArray(backup.items)) { return { ok: false, error: 'invalidBackupFile' }; }
              // 實際還原 items
              const { saveAllToGlobal } = require('./globalStateManager');
              await saveAllToGlobal(context, backup.items);
              await vscode.commands.executeCommand('statusBarHelper._refreshStatusBar');
              return { ok: true };
            }
            case 'delete': {
              const [backupId] = args;
              const fs = require('fs');
              const path = require('path');
              try {
                if (!backupId || typeof backupId !== 'string') { throw new Error('invalidBackupId'); }
                if (!backupId.startsWith('smart-backup-') || !backupId.endsWith('.json')) { throw new Error('invalidBackupFile'); }
                const filePath = path.join(context.globalStorageUri.fsPath, BACKUP_DIR, backupId);
                const exists = fs.existsSync(filePath);

                if (!exists) { throw new Error('fileNotFound'); }
                await fs.promises.unlink(filePath);
                return { ok: true };
              } catch (e:any) {

                return { ok: false, error: e?.message || String(e) };
              }
            }
            case 'resetSchedule': {
              _smartBackupManager.stop();
              await _smartBackupManager.start();
              return { ok: true };
            }
          }
          return { ok: false, error: 'unknownFn' };
        } catch (e:any) {
          return { ok: false, error: e?.message || String(e) };
        }
      }

      // ---- Script Store API ----
      if (ns === 'scriptStore') {
        interface CatalogEntry { command: string; text: string; tooltip?: string; tags?: string[]; script?: string; hash?: string; }
        const SAFE_LIMIT = 32 * 1024; // 32KB script limit (Phase1)
        const computeHash = (content: string) => { try { return require('crypto').createHash('sha256').update(content || '').digest('base64'); } catch { return ''; } };
        // Cache 避免每次開面板都重新抓；失效時間 5 分鐘
        let _catalogCache: { at: number; entries: CatalogEntry[] } | null = null;
        const loadCatalog = async (): Promise<CatalogEntry[]> => {
          const now = Date.now();
            if (_catalogCache && now - _catalogCache.at < 5 * 60 * 1000) { return _catalogCache.entries; }
          const mediaRoot = context.asAbsolutePath('media');
          const lang = vscode.env.language.toLowerCase();
          const locales: string[] = [];
          if (['zh-tw','zh-hant'].some(l => lang.startsWith(l))) { locales.push('zh-tw'); }
          locales.push('en');
          const RAW_BASE = 'https://raw.githubusercontent.com/JiaHongL/status-bar-helper/main/media';
          const SIZE_LIMIT = 256 * 1024;
          const https = require('https') as typeof import('https');

          const tryRemote = (loc: string): Promise<CatalogEntry[] | null> => new Promise((resolve) => {
            const url = `${RAW_BASE}/script-store.defaults.${loc}.json`;
            const controller = new AbortController();
            const timer = setTimeout(() => { controller.abort(); resolve(null); }, 3000);
            try {
              https.get(url, { signal: (controller as any).signal, headers:{ 'User-Agent':'status-bar-helper' } }, res => {
                if (res.statusCode !== 200) { clearTimeout(timer); res.resume(); return resolve(null); }
                let size = 0; const chunks: Buffer[] = [];
                res.on('data', d => { size += d.length; if (size > SIZE_LIMIT) { res.destroy(new Error('size limit')); } else { chunks.push(d); } });
                res.on('end', () => { clearTimeout(timer); try { const text = Buffer.concat(chunks).toString('utf8'); const arr = JSON.parse(text); if (Array.isArray(arr)) { resolve(normalize(arr)); } else { resolve(null); } } catch { resolve(null); } });
                res.on('error', () => { clearTimeout(timer); resolve(null); });
              }).on('error', () => { clearTimeout(timer); resolve(null); });
            } catch { clearTimeout(timer); resolve(null); }
          });

          const normalize = (arr: any[]): CatalogEntry[] => arr.map(o => ({
            command: String(o.command || ''),
            text: typeof o.text === 'string' ? o.text : String(o.command || ''),
            tooltip: typeof o.tooltip === 'string' ? o.tooltip : undefined,
            tags: Array.isArray(o.tags) ? o.tags.filter((t: any) => typeof t === 'string' && t.trim()).slice(0,12) : undefined,
            script: typeof o.script === 'string' ? o.script : undefined
          })).filter(e => e.command);

          // 依序嘗試：遠端 → 本地
          for (const loc of locales) {
            try {
              const remote = await tryRemote(loc);
              if (remote && remote.length) { _catalogCache = { at: now, entries: remote }; return remote; }
            } catch { /* ignore */ }
            // 本地 fallback
            const f = path.join(mediaRoot, `script-store.defaults.${loc}.json`);
            if (fs.existsSync(f)) {
              try {
                const raw = fs.readFileSync(f, 'utf8');
                const arr = JSON.parse(raw);
                if (Array.isArray(arr)) { const norm = normalize(arr); _catalogCache = { at: now, entries: norm }; return norm; }
              } catch (e) { console.warn('[sbh] scriptStore catalog parse failed', f, (e as any)?.message || e); }
            }
          }
          _catalogCache = { at: now, entries: [] };
          return [];
        };
        const currentItems = () => loadFromGlobal(context);
        const indexItems = () => new Map(currentItems().map(i => [i.command, i] as const));
        const unsafeScript = (scriptStr: string) => {
          const lower = scriptStr.toLowerCase();
            if (/eval\s*\(/.test(lower) || /new\s+function/.test(lower)) { return 'forbiddenEval'; }
            if (/process\.env\./.test(scriptStr) && (scriptStr.match(/process\.env\./g)||[]).length > 5) { return 'suspiciousEnvAccess'; }
            return '';
        };
        const buildStatusView = (catalog: CatalogEntry[]) => {
          const idx = indexItems();
          return catalog.map(entry => {
            const installed = idx.get(entry.command);
            const scriptContent = entry.script || '';
            const catalogHash = computeHash(scriptContent + '|' + entry.text + '|' + (entry.tooltip||'') + '|' + JSON.stringify(entry.tags||[]));
            let status: 'installed' | 'update' | 'new' = 'new';
            if (installed) {
              const installedHash = computeHash((installed.script||'') + '|' + installed.text + '|' + (installed.tooltip||'') + '|' + JSON.stringify(installed.tags||[]));
              status = installedHash === catalogHash ? 'installed' : 'update';
            }
            return { ...entry, hash: catalogHash, status };
          });
        };
        const applyInstall = async (payload: CatalogEntry) => {
          if (!payload || typeof payload !== 'object') { return { ok:false, error:'invalidPayload' }; }
          const { command, text, tooltip, tags, script } = payload;
          if (typeof command !== 'string' || !command.trim()) { return { ok:false, error:'invalidCommand' }; }
          const scriptStr = typeof script === 'string' ? script : '';
          if (Buffer.byteLength(scriptStr, 'utf8') > SAFE_LIMIT) { return { ok:false, error:'scriptTooLarge' }; }
          const unsafe = unsafeScript(scriptStr); if (unsafe) { return { ok:false, error:unsafe }; }
          const existing = indexItems().get(command);
          const updated: SbhItem = {
            command,
            text: typeof text === 'string' && text.trim() ? text : command,
            tooltip: typeof tooltip === 'string' ? tooltip : undefined,
            script: scriptStr,
            hidden: existing ? existing.hidden : false,
            enableOnInit: existing ? existing.enableOnInit : false,
            tags: Array.isArray(tags) ? tags.filter(t => typeof t === 'string' && t.trim()).slice(0,12) : undefined
          };
          try {
            await saveOneToGlobal(context, updated);
            return { ok:true, data:{ command } };
          } catch (e:any) {
            return { ok:false, error:'saveFailed', message:e?.message || String(e) };
          }
        };
        switch (fn) {
          case 'catalog': {
            const base = await loadCatalog();
            const enriched = buildStatusView(base);
            return { ok: true, data: { entries: enriched, count: enriched.length } };
          }
          case 'uninstall': {
            const [command] = args as [string];
            if (typeof command !== 'string' || !command) { return { ok:false, error:'invalidCommand' }; }
            // remove from global state
            const all = currentItems();
            const remain = all.filter(i => i.command !== command);
            if (remain.length === all.length) { return { ok:false, error:'notFound' }; }
            try {
              await saveAllToGlobal(context, remain);
              await vscode.commands.executeCommand('statusBarHelper._refreshStatusBar');
              return { ok:true, data:{ command } };
            } catch(e:any){
              return { ok:false, error:'uninstallFailed', message:e?.message||String(e) };
            }
          }
          case 'diff': { // preview local vs catalog for specific command list
            const [commands] = args as [string[]];
            const cat = buildStatusView(await loadCatalog());
            const subset = Array.isArray(commands) && commands.length ? cat.filter(c => commands.includes(c.command)) : cat;
            const diffs = subset.map(entry => {
              const installed = indexItems().get(entry.command);
              if (!installed) { return { command: entry.command, status: 'new' }; }
              return {
                command: entry.command,
                status: entry.status,
                changed: entry.status === 'update',
                before: entry.status === 'update' ? {
                  text: installed.text, tooltip: installed.tooltip, tags: installed.tags, script: installed.script
                } : undefined,
                after: entry.status === 'update' ? {
                  text: entry.text, tooltip: entry.tooltip, tags: entry.tags, script: entry.script
                } : undefined
              };
            });
            return { ok:true, data:{ diffs } };
          }
          case 'install': {
            const [payload] = args as [CatalogEntry];
            const r = await applyInstall(payload);
            if (r.ok) { await vscode.commands.executeCommand('statusBarHelper._refreshStatusBar'); }
            return r;
          }
          case 'bulkInstall': {
            const [entries] = args as [CatalogEntry[]];
            if (!Array.isArray(entries)) { return { ok:false, error:'invalidPayload' }; }
            // snapshot for rollback
            const snapshot = currentItems();
            const results: Array<{command:string; ok:boolean; error?:string}> = [];
            for (const entry of entries) {
              const r = await applyInstall(entry);
              results.push({ command: entry?.command, ok: !!r.ok, error: r.ok ? undefined : r.error });
              if (!r.ok) { // rollback
                try { await saveAllToGlobal(context, snapshot); } catch {}
                await vscode.commands.executeCommand('statusBarHelper._refreshStatusBar');
                return { ok:false, error:'partialFailureRolledBack', data:{ results } };
              }
            }
            await vscode.commands.executeCommand('statusBarHelper._refreshStatusBar');
            return { ok:true, data:{ results } };
          }
        }
        return { ok:false, error:'unknownFn' };
      }

      // ---------- Import/Export (dry-run) ----------
      if (ns === 'importExport') {
        switch (fn) {
          case 'importPreview': {
            const [json, strategy, conflictPolicy] = args as [string, MergeStrategy, ConflictPolicy];
            const parse = parseAndValidate(json);
            if (!parse.valid) { return { ok: false, error: parse.error }; }
            const current = loadFromGlobal(context);
            const diffResult = diff(current, parse.items);
            
            // 建立預覽資料
            const previewItems = parse.items.map((item, index) => {
              const exists = current.find(c => c.command === item.command);
              let status: string;
              let reason: string;
              
              if (!exists) {
                status = 'new';
                reason = 'Will be added as new item';
              } else if (JSON.stringify(exists) !== JSON.stringify(item)) {
                status = 'conflict';
                reason = strategy === 'replace' ? 'Will replace existing' : 
                        conflictPolicy === 'skip' ? 'Will be skipped' : 'Will get new ID';
              } else {
                status = 'exists';
                reason = 'Identical to existing item';
              }
              
              return { item, status, reason };
            });
            
            return { ok: true, data: { items: previewItems, total: parse.items.length } };
          }
          case 'exportPreview': {
            const [selected] = args as [number[]];
            const current = loadFromGlobal(context);
            const selectedCommands = selected.map(index => current[index]?.command).filter(Boolean);
            const exp = exportSelection(current, selectedCommands);
            return { ok: true, data: { ...exp, count: exp.items.length } };
          }
          case 'applyImport': {
            const [json, strategy, conflictPolicy] = args as [string, MergeStrategy, ConflictPolicy];
            const parse = parseAndValidate(json);
            if (!parse.valid) { return { ok: false, error: parse.error }; }
            const current = loadFromGlobal(context);
            const applyResult = applyImport(current, parse.items, strategy, conflictPolicy);
            
            // 實際更新 globalState
            const manifest = context.globalState.get<any>(GLOBAL_MANIFEST_KEY, { version: 1, items: [] });
            const itemsMap = context.globalState.get<any>(GLOBAL_ITEMS_KEY, {});
            
            // 清空並重新建立
            manifest.items = [];
            for (const key of Object.keys(itemsMap)) {
              delete itemsMap[key];
            }
            
            // 套用新資料
            for (const item of applyResult.result) {
              manifest.items.push({
                command: item.command,
                text: item.text,
                tooltip: item.tooltip,
                hidden: Boolean(item.hidden),
                enableOnInit: Boolean(item.enableOnInit),
                ...(Array.isArray(item.tags) && item.tags.length ? { tags: item.tags.slice(0,12) } : {})
              });
              itemsMap[item.command] = item.script || '';
            }
            
            await context.globalState.update(GLOBAL_MANIFEST_KEY, manifest);
            await context.globalState.update(GLOBAL_ITEMS_KEY, itemsMap);
            
            return { ok: true, data: applyResult };
          }
        }
      }
      // ---------- storage ----------
      if (ns === 'storage') {
        const mapKey = (k: string) => KV_PREFIX + String(k ?? '');

        const keysOf = (m: vscode.Memento) =>
          (typeof (m as any).keys === 'function'
            ? (m as any).keys() as string[]
            : [] as string[]).filter((k) => k.startsWith(KV_PREFIX));

        const enforceStorage = async (m: vscode.Memento, key: string, value: any) => {
          // 單鍵
          const size = utf8Bytes(value);
          if (size > STORAGE_KEY_LIMIT) {
            throw new Error(
              `Value too large (${(size / 1024).toFixed(1)} KB > ${STORAGE_KEY_LIMIT / 1024} KB).
              Please use the files API (writeText / writeJSON / writeBytes) for large data.`
            );
          }
          // 總量（僅計算我方前綴）
          const ks = keysOf(m);
          let total = 0;
          for (const k of ks) {
            const v = m.get(k);
            total += utf8Bytes(v);
          }
          // 更新後大小（替換同鍵）
          const wireKey = mapKey(key);
          const existing = m.get(wireKey);
          total -= utf8Bytes(existing);
          total += size;
          if (total > STORAGE_TOTAL_LIMIT) {
            throw new Error(`total storage exceeded (>${STORAGE_TOTAL_LIMIT} bytes)`);
          }
        };

        switch (fn) {
          case 'getGlobal': {
            const [key, def] = args;
            return { ok: true, data: context.globalState.get(mapKey(key), def) };
          }
          case 'setGlobal': {
            const [key, val] = args;
            await enforceStorage(context.globalState, key, val);
            await context.globalState.update(mapKey(key), val);
            return { ok: true, data: true };
          }
          case 'removeGlobal': {
            const [key] = args;
            await context.globalState.update(mapKey(key), undefined);
            return { ok: true, data: true };
          }
          case 'keysGlobal': {
            const ks = (context.globalState as any).keys?.() as string[] | undefined;
            const out = (ks ?? []).filter(k => k.startsWith(KV_PREFIX)).map(k => k.slice(KV_PREFIX.length));
            return { ok: true, data: out };
          }

          case 'getWorkspace': {
            const [key, def] = args;
            return { ok: true, data: context.workspaceState.get(mapKey(key), def) };
          }
          case 'setWorkspace': {
            const [key, val] = args;
            await enforceStorage(context.workspaceState, key, val);
            await context.workspaceState.update(mapKey(key), val);
            return { ok: true, data: true };
          }
          case 'removeWorkspace': {
            const [key] = args;
            await context.workspaceState.update(mapKey(key), undefined);
            return { ok: true, data: true };
          }
          case 'keysWorkspace': {
            const ks = (context.workspaceState as any).keys?.() as string[] | undefined;
            const out = (ks ?? []).filter(k => k.startsWith(KV_PREFIX)).map(k => k.slice(KV_PREFIX.length));
            return { ok: true, data: out };
          }
        }
      }

      // ---------- vm state ----------
      if (ns === 'vm') {
        switch (fn) {
          case 'list': {
            const data = Array.from(RUNTIMES.keys());
            return { ok: true, data };
          }
          case 'isRunning': {
            const [cmd] = args as [string];
            return { ok: true, data: RUNTIMES.has(String(cmd || '')) };
          }
        }
      }

      // ---------- files ----------
      if (ns === 'files') {
        const dirs = () => ({
          global: context.globalStorageUri.fsPath,
          workspace: context.storageUri?.fsPath ?? null,
        });

        const [scope, rel, extra] = args as [ 'global'|'workspace', string, any ];
        switch (fn) {
          case 'dirs': {
            return { ok: true, data: dirs() };
          }

          case 'readText': {
            const abs = inside(scopeBase(scope, context), rel);
            const s = await fsp.readFile(abs, 'utf8');
            return { ok: true, data: s };
          }
          case 'writeText': {
            const s = String(extra ?? '');
            const size = utf8Bytes(s);
            if (size > TEXT_SIZE_LIMIT) { throw new Error(`file too large (>${TEXT_SIZE_LIMIT} bytes)`); }
            const abs = inside(scopeBase(scope, context), rel);
            await ensureDir(abs);
            await fsp.writeFile(abs, s, 'utf8');
            return { ok: true, data: true };
          }

          case 'readJSON': {
            const abs = inside(scopeBase(scope, context), rel);
            const s = await fsp.readFile(abs, 'utf8');
            const j = JSON.parse(s);
            return { ok: true, data: j };
          }
          case 'writeJSON': {
            const data = extra;
            const s = JSON.stringify(data ?? null);
            const size = utf8Bytes(s);
            if (size > JSON_SIZE_LIMIT) { throw new Error(`file too large (>${JSON_SIZE_LIMIT} bytes)`); }
            const abs = inside(scopeBase(scope, context), rel);
            await ensureDir(abs);
            await fsp.writeFile(abs, s, 'utf8');
            return { ok: true, data: true };
          }

          case 'readBytes': {
            const abs = inside(scopeBase(scope, context), rel);
            const buf = await fsp.readFile(abs);
            // 回傳 Uint8Array（VM 與 Webview 都好處理）
            return { ok: true, data: new Uint8Array(buf) };
          }
          case 'writeBytes': {
            let data = extra as Uint8Array | ArrayBuffer | string;
            let buf: Buffer;
            if (typeof data === 'string') {
              buf = Buffer.from(data, 'base64'); // 字串視為 base64
            } else if (data instanceof Uint8Array) {
              buf = Buffer.from(data);
            } else if (data && (data as any).byteLength !== null && (data as any).byteLength !== undefined) {
              buf = Buffer.from(new Uint8Array(data as ArrayBuffer));
            } else {
              throw new Error('unsupported byte payload');
            }
            if (buf.byteLength > FILE_SIZE_LIMIT) { throw new Error(`file too large (>${FILE_SIZE_LIMIT} bytes)`); }
            const abs = inside(scopeBase(scope, context), rel);
            await ensureDir(abs);
            await fsp.writeFile(abs, buf);
            return { ok: true, data: true };
          }

          case 'exists': {
            const abs = inside(scopeBase(scope, context), rel);
            try { const st = await fsp.stat(abs); return { ok: true, data: st.isFile() || st.isDirectory() }; }
            catch { return { ok: true, data: false }; }
          }

          // 非遞迴列出（單層）
          case 'list': {
            const base = scopeBase(scope, context);
            const root = inside(base, rel || '');
            let ents: fs.Dirent[] = [];
            try { ents = await fsp.readdir(root, { withFileTypes: true }); } catch { ents = []; }
            const data = ents.map(e => ({ name: e.name, type: e.isDirectory() ? 'directory' : 'file' as const }));
            return { ok: true, data };
          }

          // 遞迴列出所有檔案 + 大小
          case 'listStats': {
            const base = scopeBase(scope, context);
            const root = inside(base, rel || '');
            const baseRel = (rel || '').replace(/^[/\\]+/, '');
            const out: Array<{name:string; type:'file'; size:number; rel:string}> = [];

            const walk = async (dir: string, curRel: string) => {
              let ents: fs.Dirent[] = [];
              try { ents = await fsp.readdir(dir, { withFileTypes: true }); } catch { return; }
              for (const e of ents) {
                const abs = path.join(dir, e.name);
                const nextRel = curRel ? `${curRel}/${e.name}` : e.name;
                if (e.isDirectory()) {
                  await walk(abs, nextRel);
                } else if (e.isFile()) {
                  try {
                    const st = await fsp.stat(abs);
                    out.push({
                      name: e.name,
                      type: 'file',
                      size: st.size,
                      rel: baseRel ? `${baseRel}/${nextRel}` : nextRel,
                    });
                  } catch {}
                }
              }
            };
            await walk(root, '');
            return { ok: true, data: out };
          }

          case 'remove': {
            const abs = inside(scopeBase(scope, context), rel);
            await fsp.unlink(abs);
            return { ok: true, data: true };
          }

          // 清空整個 scope 目錄（僅刪內容，不刪根）
          case 'clearAll': {
            const base = scopeBase(scope, context);
            let ents: fs.Dirent[] = [];
            try { ents = await fsp.readdir(base, { withFileTypes: true }); } catch {}
            for (const e of ents) {
              const p = path.join(base, e.name);
              try {
                // Node 16+ 可用 rm；舊版 fallback
                // @ts-ignore
                if (e.isDirectory() && fsp.rm) { await fsp.rm(p, { recursive: true, force: true }); }
                else if (e.isDirectory()) {
                  const rmrf = async (d: string) => {
                    const list = await fsp.readdir(d, { withFileTypes: true });
                    for (const x of list) {
                      const q = path.join(d, x.name);
                      if (x.isDirectory()) { await rmrf(q); await fsp.rmdir(q).catch(()=>{}); }
                      else { await fsp.unlink(q).catch(()=>{}); }
                    }
                  };
                  await rmrf(p); await fsp.rmdir(p).catch(()=>{});
                } else {
                  await fsp.unlink(p).catch(()=>{});
                }
              } catch {}
            }
            return { ok: true, data: true };
          }
        }

        throw new Error('Unknown files fn');
      }

      // ---------- secret ----------
      if (ns === 'secret') {
        try {
          const [key, value] = args || [];
          switch (fn) {
            case 'get': {
              if (typeof key !== 'string' || !key.trim()) throw new Error('invalid key');
              const v = await context.secrets.get(key);
              return { ok: true, data: v ?? undefined };
            }
            case 'set': {
              if (typeof key !== 'string' || !key.trim()) throw new Error('invalid key');
              await context.secrets.store(key, String(value ?? ''));
              await addSecretKey(context, key);              // ← 登記
              return { ok: true, data: true };
            }
            case 'delete': {
              if (typeof key !== 'string' || !key.trim()) throw new Error('invalid key');
              await context.secrets.delete(key);
              await removeSecretKey(context, key);           // ← 移除登記
              return { ok: true, data: true };
            }
            case 'keys': {
              const list = loadSecretKeys(context);          // ← 取得清單（不含值）
              return { ok: true, data: list };
            }
            default:
              throw new Error('unknown fn: ' + fn);
          }
        } catch (e:any) {
          return { ok: false, error: e?.message || String(e) };
        }
      }

      // ---------- vm state ----------    //（若你尚未加過）
      if (ns === 'vm') {
        switch (fn) {
          case 'list': {
            const data = Array.from(RUNTIMES.keys());
            return { ok: true, data };
          }
          case 'isRunning': {
            const [cmd] = args as [string];
            return { ok: true, data: RUNTIMES.has(String(cmd || '')) };
          }
        }
      }

      // ---------- hostRun ----------
      if (ns === 'hostRun') {
        switch (fn) {
          case 'start': {
            const [cmd, code] = args as [string, string];
            if (!cmd || !code) { throw new Error('hostRun.start: invalid args'); }
            // 啟動前先把同 command 的舊 VM 關掉（只影響同名）
            abortByCommand(cmd, { type: 'replaced', from: 'settingsPanel', at: Date.now() });
            // 直接用 host 端的 runScriptInVm 執行
            runScriptInVm(context, cmd, code, 'settingsPanel');
            return { ok: true, data: true };
          }
          case 'lastSyncInfo': {
            return { ok: true, data: { lastSyncAt: _lastSyncApplied } };
          }
        }
      }


      throw new Error('Unknown bridge ns');
    } catch (e) {
      return toBridgeError(e);
    }
  });
}

// ─────────────────────────────────────────────────────────────
export async function activate(context: vscode.ExtensionContext) {
  console.log('🚀 Status Bar Helper: 開始啟動');
  const outputChannel = vscode.window.createOutputChannel(localize('ext.outputChannel', 'Status Bar Helper'));
  outputChannel.appendLine('Status Bar Helper 正在啟動...');
  
  try {
    console.log('✅ Status Bar Helper Activated');

    // 1) 初始化 globalState 同步設定
    initGlobalSyncKeys(context);

    // 2) 執行一次性遷移（從 settings.json 到 globalState）
    await migrateFromSettingsIfNeeded(context);

    // 3) 植入預設項目（若目前為空）
    await ensureDefaultItems(context);

    // 4) 回填可能為空的 Chat A/B 範例腳本
    await backfillChatMessagingSamples(context);

    // 5) 初始化 SmartBackupManager
    _smartBackupManager = new SmartBackupManager(context);
    await _smartBackupManager.start();

    // 6) 建立使用者自訂的狀態列項目（用 Runtime Manager 跑）
    updateStatusBarItems(context, true);
    // 啟動背景輪詢偵測同步變更
    startBackgroundPolling(context);

    // 註冊 sidebar view
    context.subscriptions.push(
      vscode.window.registerWebviewViewProvider('statusBarHelper.sidebar', {
        resolveWebviewView(view) { sidebarMgr.bind(view); }
      })
    );

    // 7) 註冊 Settings（lazy import）
  const showSettings = vscode.commands.registerCommand('statusBarHelper.showSettings', async () => {
    const { SettingsPanel } = await import('./SettingsPanel.js');
    SettingsPanel.createOrShow(context.extensionUri, context);
  // 面板開啟時若當前輪詢間隔已放寬到 >90s，觸發一次立即快掃以降低等待同步的體感時間
  forceImmediatePoll(context, true);
  });
  context.subscriptions.push(showSettings);

  // 7) 顯示右下角齒輪（可由設定關閉）
  refreshGearButton();

  // 8) 設定變更時更新（保留向後相容，也監聽可能的舊設定變更）
  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration(e => {
      if (e.affectsConfiguration('statusBarHelper.items')) {
        // 舊設定變更時嘗試重新遷移
        migrateFromSettingsIfNeeded(context).then(() => {
          updateStatusBarItems(context);
        });
      }
      if (e.affectsConfiguration('statusBarHelper.showGearOnStartup')) {
        refreshGearButton();
      }
      // 主題變更 → 通知面板
      if (e.affectsConfiguration('workbench.colorTheme')) {
        const currentTheme = vscode.workspace.getConfiguration().get('workbench.colorTheme');
        const isDark = (currentTheme as string || '').toLowerCase().includes('dark');
        if (SettingsPanel.currentPanel) {
          (SettingsPanel.currentPanel as any)['_panel'].webview.postMessage({
            command: 'themeChanged',
            isDark
          });
        }
      }
    })
  );

  // 9) 註冊橋接指令
  context.subscriptions.push(registerBridge(context));

  // 10) 對外：依 command 中止目前在 host 端跑的 VM（給 SettingsPanel / 列表 Stop 用）
  context.subscriptions.push(
    vscode.commands.registerCommand('statusBarHelper._abortByCommand', (cmd: string, reason?: any) =>
      abortByCommand(String(cmd || ''), reason ?? { type: 'external', at: Date.now() })
    )
  );

  // 11) 內部：重新整理狀態列項目（給 SettingsPanel 用）
  context.subscriptions.push(
    vscode.commands.registerCommand('statusBarHelper._refreshStatusBar', () => {
      updateStatusBarItems(context, false);
    })
  );
  
  outputChannel.appendLine('✅ Status Bar Helper 啟動完成');
  console.log('✅ Status Bar Helper: 啟動完成');
  } catch (error) {
    outputChannel.appendLine(`❌ Status Bar Helper 啟動失敗: ${error}`);
    console.error('❌ Status Bar Helper 啟動失敗:', error);
    throw error;
  }
}

export function deactivate() {
  if (gearItem) { gearItem.dispose(); gearItem = null; }
  itemDisposables.forEach(d => d.dispose());
  // 安全收掉所有仍在跑的 VM
  for (const [cmd] of RUNTIMES) { abortByCommand(cmd, { type: 'deactivate', at: Date.now() }); }
  if (_pollTimer) { try { clearTimeout(_pollTimer); } catch {}; _pollTimer = null; }
  if (_smartBackupManager) {
    _smartBackupManager.stop();
    _smartBackupManager = null;
  }
}
