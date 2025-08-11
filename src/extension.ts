import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import * as vm from 'vm';
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
import { SettingsPanel } from './SettingsPanel';

let _runOnceExecutedCommands: Set<string> = new Set();

// ─────────────────────────────────────────────────────────────
// 常數與小工具
// ─────────────────────────────────────────────────────────────
const fsp = fs.promises;
const KV_PREFIX = 'sbh.kv.';
const STORAGE_KEY_LIMIT   =  512 * 1024;      // 512KB
const STORAGE_TOTAL_LIMIT = 50 * 1024 * 1024; // 50MB
const JSON_SIZE_LIMIT     =  5 * 1024 * 1024; // 5MB
const TEXT_SIZE_LIMIT     =  5 * 1024 * 1024; // 5MB
const FILE_SIZE_LIMIT     = 20 * 1024 * 1024; // 20MB

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
  if (!ws) { throw new Error('workspace storage not available'); }
  return ws;
};

const inside = (base: string, rel = '') => {
  if (!rel) { return base; }
  if (path.isAbsolute(rel)) { throw new Error('absolute path not allowed'); }
  if (rel.includes('..')) { throw new Error('path escape rejected'); }
  const abs = path.resolve(base, rel);
  const baseAbs = path.resolve(base);
  if (!abs.startsWith(baseAbs)) { throw new Error('path escape rejected'); }
  return abs;
};

const ensureDir = async (absFile: string) => {
  await fsp.mkdir(path.dirname(absFile), { recursive: true }).catch(() => {});
};

// ─────────────────────────────────────────────────────────────
// ★ Runtime Manager（依 command 管理 VM）
// ─────────────────────────────────────────────────────────────
type RuntimeCtx = {
  abort: AbortController;
  timers: Set<NodeJS.Timeout>;
  disposables: Set<vscode.Disposable>;
};

const RUNTIMES = new Map<string, RuntimeCtx>();

// ─────────────────────────────────────────────────────────────
// VM 之間的訊息傳遞 (簡易 Bus)
// - 允許腳本呼叫 vm.sendMessage(target, msg)
// - 允許腳本註冊 vm.onMessage(handler)
// - vm.open(cmdId, payload?)：若目標尚未啟動則啟動；啟動後（或已在跑）可傳遞初始 payload
// - 若目標尚未註冊任何 handler，訊息會暫存於佇列，待第一個 handler 註冊時 flush
// - 訊息只在當次 VM 生命週期內有效；VM 關閉後其 handlers 與 queue 一併移除
// -----------------------------------------------------------------
type MessageRecord = { from: string; message: any };
const MESSAGE_HANDLERS = new Map<string, Set<(from: string, message: any) => void>>();
const MESSAGE_QUEUES   = new Map<string, MessageRecord[]>();

function dispatchMessage(target: string, from: string, message: any) {
  const handlers = MESSAGE_HANDLERS.get(target);
  if (!handlers || handlers.size === 0) {
    // queue
    let q = MESSAGE_QUEUES.get(target);
    if (!q) { q = []; MESSAGE_QUEUES.set(target, q); }
    q.push({ from, message });
    return;
  }
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

function abortByCommand(command: string, reason: any = { type: 'external', at: Date.now() }) {
  const ctx = RUNTIMES.get(command);
  if (!ctx) { return false; }
  try { ctx.abort.abort(reason); } catch {}
  RUNTIMES.delete(command);
  MESSAGE_HANDLERS.delete(command);
  MESSAGE_QUEUES.delete(command);
  return true;
}

function buildSbh() {
  // 透過 _bridge 指令統一呼叫；提供給 VM 沙箱
  const call = async (ns: string, fn: string, ...args: any[]) => {
    const r = await vscode.commands.executeCommand('statusBarHelper._bridge', { ns, fn, args }) as any;
  if (r && r.ok) { return r.data; }
    throw new Error(r?.error || 'bridge error');
  };

  return {
    v1: {
      storage: {
        global: {
          get:  (key: string, def?: any) => call('storage', 'getGlobal', key, def),
          set:  (key: string, val: any)  => call('storage', 'setGlobal', key, val),
          remove: (key: string)          => call('storage', 'removeGlobal', key),
          keys: ()                       => call('storage', 'keysGlobal'),
        },
        workspace: {
          get:  (key: string, def?: any) => call('storage', 'getWorkspace', key, def),
          set:  (key: string, val: any)  => call('storage', 'setWorkspace', key, val),
          remove: (key: string)          => call('storage', 'removeWorkspace', key),
          keys: ()                       => call('storage', 'keysWorkspace'),
        },
      },
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
      // vm 會在 runScriptInVm 執行時注入
      vm: {} as any,
    }
  };
}

/** 封裝：在 Extension Host 內跑 VM（依 command 註冊、可被 stop） */
function runScriptInVm(
  context: vscode.ExtensionContext,
  command: string,
  code: string,
  origin: 'statusbar' | 'autorun' | 'settingsPanel'
) {
  // 同 command 舊 VM 先取代
  abortByCommand(command, { type: 'replaced', from: origin, at: Date.now() });

  const abort = new AbortController();
  const signal = abort.signal;
  const timers = new Set<NodeJS.Timeout>();
  const disposables = new Set<vscode.Disposable>();

  const wrapTimeout = <T extends (...a: any[]) => any>(orig: T) =>
    ((...args: any[]) => { const h = orig(...args); timers.add(h as any); return h; }) as unknown as T;

  // 方便往設定面板丟訊息
  const postToSettingsPanel = (m: any) => {
  if (origin !== 'settingsPanel') { return; }
    const p = (SettingsPanel.currentPanel as any);
    p?._panel?.webview?.postMessage?.(m);
  };

  // 讓 console.* 也回傳到 webview 的 Output
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
  if (signal.aborted) { throw new Error('Execution stopped'); }
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
      throw new Error(`Only built-in modules are allowed: ${m}`);
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
      if (!cmdId || typeof cmdId !== 'string') { throw new Error('vm.open: invalid cmdId'); }
      // 已在跑 → 直接送 payload
      if (RUNTIMES.has(cmdId)) {
        if (arguments.length >= 2) { dispatchMessage(cmdId, command, payload); }
        return;
      }
      // 找設定中的腳本
      const config = vscode.workspace.getConfiguration('statusBarHelper');
      const items = config.get<any[]>('items', []);
      const targetItem = items.find(i => i && i.command === cmdId);
      if (!targetItem || !targetItem.script) { throw new Error(`vm.open: command not found or empty script: ${cmdId}`); }
      try {
        runScriptInVm(context, cmdId, targetItem.script, 'statusbar');
      } catch (e) {
        throw new Error(`vm.open: failed to start target: ${(e as any)?.message || e}`);
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

  const config = vscode.workspace.getConfiguration('statusBarHelper');
  const items = config.get<any[]>('items', []);

  items.forEach((item, index) => {
    const { text, tooltip, command, script, hidden, enableOnInit } = item || {};
    if (hidden && !enableOnInit) {
      return;
    }
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
        vscode.window.showErrorMessage(`❌ Script error: ${e?.message || String(e)}`);
        console.error(e);
      }
    });

    itemDisposables.push(statusBarItem, commandDisposable);

    if (!hidden) {
      statusBarItem.show();
    }

    if (firstActivation && enableOnInit && !_runOnceExecutedCommands.has(command)) {
      try {
        runScriptInVm(context, command, script, 'autorun');
        _runOnceExecutedCommands.add(command);
      } catch (e: any) {
        vscode.window.showErrorMessage(`❌ Script error (Run Once): ${e?.message || String(e)}`);
        console.error(e);
      }
    }
  });
}

function refreshGearButton() {
  if (gearItem) { gearItem.dispose(); gearItem = null; }
  const enabled = vscode.workspace.getConfiguration('statusBarHelper')
    .get<boolean>('showGearOnStartup', true);

  if (!enabled) { return; }

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
  const seededKey = 'sbh.seededDefaults.v2';
  const already = context.globalState.get<boolean>(seededKey);
  const config = vscode.workspace.getConfiguration('statusBarHelper');
  const items = config.get<any[]>('items', []);
  if (already || (Array.isArray(items) && items.length > 0)) { return; }
  await config.update('items', getDefaultItems(), vscode.ConfigurationTarget.Global);
  await context.globalState.update(seededKey, true);
}

function getDefaultItems(): any[] {
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

// 若使用者在加入 Chat A/B 之前已安裝，設定中可能沒有這兩個項目或 script 為空字串。
async function backfillChatMessagingSamples(context: vscode.ExtensionContext) {
  const config = vscode.workspace.getConfiguration('statusBarHelper');
  const items = config.get<any[]>('items', []) || [];
  let changed = false;
  const ensure = (cmd: string, scriptConst: string, defaultItem: any) => {
    const idx = items.findIndex(i => i && i.command === cmd);
    if (idx === -1) {
      // 不自動插入全新項目（避免驚嚇）；若需要可 Restore Defaults。
      return;
    }
    const it = items[idx];
    if (!it.script || typeof it.script !== 'string' || it.script.trim().length < 50) {
      it.script = scriptConst;
      changed = true;
    }
  };
  ensure('sbh.demo.vmChatA', DEFAULT_VM_CHAT_A_SCRIPT, null);
  ensure('sbh.demo.vmChatB', DEFAULT_VM_CHAT_B_SCRIPT, null);
  if (changed) {
    await config.update('items', items, vscode.ConfigurationTarget.Global);
  }
}

// ─────────────────────────────────────────────────────────────
// Bridge 指令：statusBarHelper._bridge
// ─────────────────────────────────────────────────────────────
function registerBridge(context: vscode.ExtensionContext) {
  return vscode.commands.registerCommand('statusBarHelper._bridge', async (payload?: any) => {
    try {
  if (!payload || typeof payload !== 'object') { throw new Error('invalid payload'); }
      const { ns, fn, args = [] } = payload as { ns: string; fn: string; args: any[] };

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
  console.log('✅ Status Bar Helper Activated');

  // 1) 植入預設項目（若目前為空）
  await ensureDefaultItems(context);
  // 1b) 回填可能為空的 Chat A/B 範例腳本
  await backfillChatMessagingSamples(context);

  // 2) 建立使用者自訂的狀態列項目（用 Runtime Manager 跑）
  updateStatusBarItems(context, true);

  // 3) 註冊 Settings（lazy import）
  const showSettings = vscode.commands.registerCommand('statusBarHelper.showSettings', async () => {
    const { SettingsPanel } = await import('./SettingsPanel.js');
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

  // 6) 註冊橋接指令
  context.subscriptions.push(registerBridge(context));

  // 7) 對外：依 command 中止目前在 host 端跑的 VM（給 SettingsPanel / 列表 Stop 用）
  context.subscriptions.push(
    vscode.commands.registerCommand('statusBarHelper._abortByCommand', (cmd: string, reason?: any) =>
      abortByCommand(String(cmd || ''), reason ?? { type: 'external', at: Date.now() })
    )
  );

  // （可選）同步白名單
  // context.globalState.setKeysForSync?.(['sbh.seededDefaults.v2']);
}

export function deactivate() {
  if (gearItem) { gearItem.dispose(); gearItem = null; }
  itemDisposables.forEach(d => d.dispose());
  // 安全收掉所有仍在跑的 VM
  for (const [cmd] of RUNTIMES) { abortByCommand(cmd, { type: 'deactivate', at: Date.now() }); }
}
