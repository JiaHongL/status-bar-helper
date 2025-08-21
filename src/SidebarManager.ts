// src/SidebarManager.ts
import * as vscode from 'vscode';

export type CloseReason = 'closed' | 'replaced';

export type OpenSpec =
  | string
  | {
      html?: string;
      /** 是否在載入時聚焦顯示（預設 true；false = 靜默載入不切頁） */
      focus?: boolean;
      /** 只綁在本次 session 的 onClose；會收到 'closed' 或 'replaced' */
      onClose?: (reason: CloseReason) => void;
    };

const CONTAINER_ID = 'sbhContainer';
const VIEW_ID = 'statusBarHelper.sidebar';

function blankHtml() {
  return '<!doctype html><meta charset="utf-8" /><body style="margin:0"></body>';
}

/**
 * Sidebar 單例管理器
 * - `open`：如已有內容，先觸發舊 session 的 onClose('replaced')，再載入新內容
 * - `close`：還原預設頁並觸發 onClose('closed')
 * - onClose 為「每次 open 的一次性 handler」
 * - 內建“replace 期間忽略一次 close”防抖，避免 A 的 onClose 連動把剛載入的 B 關掉
 */
export class SidebarManager {
  private view: vscode.WebviewView | null = null;
  private pendingHtml: string | null = null;

  private onMessageHandlers = new Set<(m: any) => void>();
  private onCloseHandlers = new Set<(reason: CloseReason) => void>(); // per-session

  private webviewMsgDisposable: vscode.Disposable | null = null;

  /** 目前是否顯示自訂內容（非預設頁） */
  private sessionActive = false;

  /** replace 流程中：忽略接下來「第一次」的 close() 呼叫，避免把新內容關掉 */
  private suppressNextCloseOnce = false;

  /** 預設頁 HTML（依語系） */
  private defaultHtml: string;

  /** 序列鎖，避免 open/close 競態 */
  private lock: Promise<void> = Promise.resolve();

  constructor() {
    this.defaultHtml = this.makeBuiltinDefaultHtml();
  }

  // ───────────────── Public ─────────────────

  bind(view: vscode.WebviewView) {
    this.webviewMsgDisposable?.dispose();
    this.webviewMsgDisposable = null;

    this.view = view;
    view.webview.options = { enableScripts: true };

    if (this.pendingHtml) {
      try { view.webview.html = this.pendingHtml; } catch {}
      this.pendingHtml = null;
      this.sessionActive = true; // 先前 open 的內容
    } else {
      try { view.webview.html = this.defaultHtml; } catch {}
      this.sessionActive = false;
    }

    this.webviewMsgDisposable = view.webview.onDidReceiveMessage((msg) => {
      for (const h of Array.from(this.onMessageHandlers)) {
        try { h(msg); } catch {}
      }
    });

    view.onDidDispose(() => {
      if (this.view === view) {
        this.view = null;
        this.sessionActive = false;
        this.webviewMsgDisposable?.dispose();
        this.webviewMsgDisposable = null;
        this.fireOnClose('closed'); // per-session；觸發後會清空
      }
    });
  }

  setDefaultHtml(html: string) {
    this.defaultHtml = html || this.makeBuiltinDefaultHtml();
    if (this.view && !this.sessionActive) {
      try { this.view.webview.html = this.defaultHtml; } catch {}
    }
  }

  /** Open（或 replace）Sidebar 內容 */
  async open(spec: OpenSpec): Promise<void> {
    await this.enqueue(async () => {
      // 1) 先把舊 session 標記為 replaced，並“抑制下一次 close”
      if (this.view && this.sessionActive) {
        this.suppressNextCloseOnce = true;   // ← 關鍵：忽略緊接而來的一次 close()
        await this.closeInternal('replaced'); // 只觸發舊 session 的 handlers
      } else {
        this.onCloseHandlers.clear(); // 沒有舊 session，確保乾淨
      }

      const html = typeof spec === 'string' ? spec : (spec?.html || blankHtml());
      const shouldFocus = typeof spec === 'object' ? spec.focus !== false : true;

      // 2) 註冊本次 session 的 onClose（若有）
      if (typeof spec === 'object' && typeof spec.onClose === 'function') {
        this.onCloseHandlers.add(spec.onClose);
      }

      // 3) 載入新內容
      this.sessionActive = true;
      if (this.view) {
        try { this.view.webview.html = html; } catch {}
      } else {
        this.pendingHtml = html;
      }

      // 4) 需要時才切頁
      if (shouldFocus) {
        try { await vscode.commands.executeCommand(`${CONTAINER_ID}.focus`); } catch {}
        try { await vscode.commands.executeCommand(`${VIEW_ID}.focus`); } catch (e) {
          console.warn('[sbh] focus view failed:', e);
        }
      }
    });
  }

  postMessage(msg: any): Thenable<boolean> {
    return this.view?.webview.postMessage(msg) ?? Promise.resolve(false);
  }

  onMessage(handler: (msg: any) => void): vscode.Disposable {
    this.onMessageHandlers.add(handler);
    return new vscode.Disposable(() => this.onMessageHandlers.delete(handler));
  }

  /**
   * 監聽關閉（包含被 replace、或使用者/程式 close）
   * 只對“當次 open”有效；觸發後自動移除
   */
  onClose(handler: (reason: CloseReason) => void): vscode.Disposable {
    this.onCloseHandlers.add(handler);
    return new vscode.Disposable(() => this.onCloseHandlers.delete(handler));
  }

  /** 主動關閉（還原預設頁 + 觸發 onClose('closed')） */
  async close(): Promise<void> {
    await this.enqueue(async () => {
      // 若剛做完 replace，忽略“第一個” close（通常是舊 session 的 onClose 連動呼叫）
      if (this.suppressNextCloseOnce) {
        this.suppressNextCloseOnce = false;
        return;
      }
      await this.closeInternal('closed');
    });
  }

  // ──────────────── private ────────────────

  private async closeInternal(reason: CloseReason) {
    if (this.view) {
      try { this.view.webview.html = this.defaultHtml; } catch {}
    } else {
      this.pendingHtml = this.defaultHtml;
    }
    this.sessionActive = false;
    this.fireOnClose(reason); // 只通知當前 session，並清空 handlers
  }

  private fireOnClose(reason: CloseReason) {
    const handlers = Array.from(this.onCloseHandlers);
    this.onCloseHandlers.clear();
    for (const h of handlers) {
      try { h(reason); } catch {}
    }
  }

  private enqueue(job: () => Promise<void>): Promise<void> {
    this.lock = this.lock.then(job, job);
    return this.lock;
  }

  // ─────────── default pages (i18n) ───────────

  private makeBuiltinDefaultHtml(): string {
    const lang = vscode.env.language?.toLowerCase() || '';
    const isZh = ['zh-tw', 'zh-hant'].some(t => lang.startsWith(t));
    return isZh ? this.makeBuiltinDefaultHtmlZhTw() : this.makeBuiltinDefaultHtmlEn();
  }

  private makeBuiltinDefaultHtmlEn(): string {
    return `<!doctype html>
<html><head><meta charset="utf-8"/>
<style>
:root { color-scheme: light dark; }
body { margin:0; padding:16px; font-family: var(--vscode-font-family);
       color: var(--vscode-editor-foreground);
       background: var(--vscode-editor-background); }
h2 { margin: 0 0 8px; font-weight:600; letter-spacing:.3px; }
p { opacity:.88; line-height:1.6; margin: 6px 0; }
code, pre { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; }
pre { background: var(--vscode-editor-inactiveSelectionBackground);
      border: 1px solid var(--vscode-editorGroup-border);
      border-radius: 8px; padding: 10px; overflow:auto; }
.tip { margin-top:12px; font-size: .92em; opacity:.8; }
</style></head>
<body>
  <h2>Status Bar Helper</h2>
  <p>This is the default page of the sidebar.</p>
  <p>Use <code>statusBarHelper.v1.sidebar.open({ html })</code> to render your own UI, and
     call <code>statusBarHelper.v1.sidebar.close()</code> to restore this page.</p>
  <pre>// Example
const { sidebar } = statusBarHelper.v1;
await sidebar.open({ html: "&lt;h3 style='padding:12px'&gt;Hello Sidebar&lt;/h3&gt;" });
// ... later
await sidebar.close();</pre>
  <p class="tip">If you don't need this icon, right-click "Status Bar Helper" in the Activity Bar to hide it.</p>
</body></html>`;
  }

  private makeBuiltinDefaultHtmlZhTw(): string {
    return `<!doctype html>
<html><head><meta charset="utf-8"/>
<style>
:root { color-scheme: light dark; }
body { margin:0; padding:16px; font-family: var(--vscode-font-family);
       color: var(--vscode-editor-foreground);
       background: var(--vscode-editor-background); }
h2 { margin: 0 0 8px; font-weight:600; letter-spacing:.3px; }
p { opacity:.88; line-height:1.6; margin: 6px 0; }
code, pre { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; }
pre { background: var(--vscode-editor-inactiveSelectionBackground);
      border: 1px solid var(--vscode-editorGroup-border);
      border-radius: 8px; padding: 10px; overflow:auto; }
.tip { margin-top:12px; font-size: .92em; opacity:.8; }
</style></head>
<body>
  <h2>Status Bar Helper</h2>
  <p>這是側邊欄的預設頁面。</p>
  <p>用 <code>statusBarHelper.v1.sidebar.open({ html })</code> 可以顯示自訂 UI，
     呼叫 <code>statusBarHelper.v1.sidebar.close()</code> 會還原回本頁。</p>
  <pre>// 範例
const { sidebar } = statusBarHelper.v1;
await sidebar.open({ html: "&lt;h3 style='padding:12px'&gt;哈囉 Sidebar&lt;/h3&gt;" });
// ... 稍後
await sidebar.close();</pre>
  <p class="tip">若不需要這個圖示，在左側 Activity Bar 對「Status Bar Helper」按右鍵即可隱藏。</p>
</body></html>`;
  }
}
