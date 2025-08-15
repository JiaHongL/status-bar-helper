# Status Bar Helper

[English](README.en.md) | [繁體中文](README.md)

這是一款能讓你在 VS Code 狀態列上新增自訂按鈕的擴充套件。
你可以撰寫 JavaScript 腳本，或結合 VS Code API，打造各種獨特且實用的功能。

## ✨ 特色重點

- 自訂按鈕：在狀態列建立專屬按鈕，點擊即可執行自訂 JavaScript 腳本。
- 自動執行：支援在 VS Code 啟動時自動觸發指定腳本。
- 內建 Monaco 編輯器：提供語法高亮、智能提示等進階編輯功能。
- 資料存取 API：可透過擴充 API 操作 Storage 與 File 系統，方便管理資料。
- 獨立 VM 執行：每個腳本皆在獨立 Node.js VM 中運行，互不干擾，並僅使用原生 Node 模組。
- 安全性與隔離性：腳本在受控環境中執行，避免影響 VS Code 及其他腳本的穩定性與安全性。
- Script Store（第一階段 + 遠端預覽）：集中瀏覽範例腳本（本地 + 遠端優先），檢視差異並單筆或批次安裝（原子回滾）、更新偵測（hash）。

## 📖 使用說明

### 設定頁

在這個頁面，你可以撰寫並即時測試狀態列項目的腳本：

- 顯示 / 隱藏 狀態列按鈕。
- 新增、編輯、刪除 狀態列項目。
- 即時查看 Running 狀態（綠點 / 計數）。
- 切換是否顯示於狀態列，以及啟動時自動執行。
- 複製 cmdId
- 一鍵 Run / Stop 控制腳本運行狀態。
- 管理套件儲存的全域與工作區資料（包含刪除與大小顯示）。

![alt text](https://raw.githubusercontent.com/JiaHongL/status-bar-helper/main/image/image-1.png)

### 編輯頁

在這個頁面中，你可以編寫並即時測試狀態列項目的腳本：

- 內建 Run / Stop 按鈕，立即測試腳本。
- 內建 Monaco 編輯器，支援 node 原生模組 與 VS Code API。
- 下方 Output 面板 會即時顯示腳本輸出與執行狀態（成功 / 失敗 / VM 關閉）。
- Output 面板可隱藏或拖拉改變顯示高度。
- 適合快速開發與調試自訂功能。

![alt text](https://raw.githubusercontent.com/JiaHongL/status-bar-helper/main/image/image-2.png)

### 匯入/匯出功能

Status Bar Helper 支援完整的資料匯入匯出功能，讓你輕鬆備份、分享或遷移狀態列項目設定：

#### 📤 匯出功能

- **選擇匯出**：可選擇特定項目進行匯出
- **JSON 格式**：標準 JSON 陣列格式，便於編輯與版本控制
- **完整資料**：包含按鈕文字、提示、腳本、顯示/隱藏狀態等完整設定

#### 📥 匯入功能

- **格式驗證**：嚴格檢查 JSON 格式與必要欄位
- **合併策略**：
  - **Replace（取代）**：清除現有項目，僅保留匯入項目
  - **Append（附加）**：保留現有項目，新增匯入項目
- **衝突處理**：
  - **Skip（略過）**：遇到重複 command ID 時略過該項目
  - **New ID（新 ID）**：自動產生新的 command ID 避免衝突
- **預覽模式**：匯入前可預覽變更內容與衝突狀況

#### 📋 JSON 格式範例

```json
[
  {
    "command": "myext.customButton",
    "text": "$(gear) 我的按鈕",
    "tooltip": "自訂功能按鈕",
    "script": "console.log('Hello World!');",
    "hidden": false,
    "enableOnInit": false
  }
]
```

#### 🔒 安全性與限制

- 檔案大小限制：JSON 檔案最大 10MB
- 欄位保留：完整保留原始欄位順序與未知欄位
- 路徑安全：所有檔案操作均經過路徑驗證，防止越界存取

---

## 🔧 指令與捷徑

- **Status Bar Helper: Settings** — 從命令面板開啟設定頁
- **右下角齒輪按鈕** — 快速進入設定頁

![alt text](https://raw.githubusercontent.com/JiaHongL/status-bar-helper/main/image/image-3.png)

---

## 內建範例

### Script Store

集中式腳本目錄來源：`script-store.defaults.<locale>.json`（目前提供 `en` 與 `zh-tw`）。

功能：

- 遠端優先（GitHub raw，3 秒 timeout / 256KB 上限）→ 失敗 fallback 本地檔
- 語系判斷：`vscode.env.language`（僅 zh-tw / zh-hant 走繁體，其餘英文）
- 狀態徽章：NEW / INSTALLED / UPDATE（script + text + tooltip + tags hash）
- 單項 / 批次安裝（批次為原子：任一失敗即回滾）
- Diff 檢視（欄位變更 + 行級簡易差異；>400 行預設摺疊）
- 安全快篩：拒絕含 `eval(`、`new Function`、大量 `process.env` 取用的腳本
- 5 分鐘記憶體快取（後續規劃 ETag）

規劃中（Phase 2）：ETag 快取、`scriptUrl` 延遲載入、token 細粒度 diff、使用者強制語系覆寫。

- Log：示範如何將輸出同時顯示在面板 Output 區塊與 VS Code 的 Output Channel。
- Git Add：示範如何在擴充套件中執行全域 Git 指令（例如 git add）。
- Storage：示範如何使用 StatusBarHelper.v1 的 Storage 與 File API 進行資料讀寫與檔案操作。
  - Global Storage（跨工作區）
    - storage.global.get(key, default?)：讀取值
    - storage.global.set(key, value)：寫入值
    - storage.global.remove(key)：刪除鍵值
    - storage.global.keys()：列出所有鍵
  - Workspace Storage（僅開啟工作區時）
    - storage.workspace.get(key, default?)
    - storage.workspace.set(key, value)
    - storage.workspace.remove(key)
    - storage.workspace.keys()
  - Files API（檔案存取）
    - files.dirs()：取得實體資料夾路徑（global / workspace）
    - 文字：readText(scope, relPath)／writeText(scope, relPath, content)
    - JSON：readJSON(scope, relPath)／writeJSON(scope, relPath, data)
    - 二進位：readBytes(scope, relPath)／writeBytes(scope, relPath, data)（Uint8Array／ArrayBuffer／base64）
    - exists(scope, relPath)：檢查檔案/資料夾是否存在
    - list(scope, relPath?)：列出檔案/資料夾
    - listStats(scope, relPath?)：列出檔案與大小/相對路徑
    - remove(scope, relPath)：刪除檔案或資料夾
    - clearAll(scope)：清空該範圍所有檔案
- Toggle Light/Dark Mode：示範如何將 VS Code 指令製作成狀態列按鈕，快速切換主題。
![alt text](https://raw.githubusercontent.com/JiaHongL/status-bar-helper/main/image/01.gif)
- Board：示範如何使用 VS Code Webview 建立自訂互動介面。
![alt text](https://raw.githubusercontent.com/JiaHongL/status-bar-helper/main/image/02.gif)
- Pomodoro：示範結合狀態列與 showQuickPick 建立簡單的番茄鐘計時器。
![alt text](https://raw.githubusercontent.com/JiaHongL/status-bar-helper/main/image/03.gif)
- Chat A、Chat B：示範如何使用 StatusBarHelper.v1 的 vm 在兩個腳本間建立通訊並互相控制生命週期，包含：
  - vm.open(cmd, payload)：啟動（或喚醒）另一個腳本，並可附帶初始訊息。
  - vm.sendMessage(targetCmd, message)：向目標腳本傳送訊息。
  - vm.onMessage(handler)：接收其他腳本傳來的訊息。
  - vm.stopByCommand(cmd, reason)：結束指定腳本。
  - vm.stop(reason)：自行結束目前腳本。
  - vm.onStop(handler)：監聽 VM 關閉事件。
  
  ![alt text](https://raw.githubusercontent.com/JiaHongL/status-bar-helper/main/image/04.gif)

> 備註：每個 VM 執行完成後不會自動關閉，必須由使用者自行呼叫 vm.stop() 來結束；可搭配 vm.onStop() 監聽 VM 關閉事件。

---

Made with ❤️ by **[Joe]**

---

## StatusBarHelper.v1 API 定義

```javascript
/**
 * StatusBarHelper API 定義
 * 提供腳本可用的：鍵值儲存（全域 / 工作區）、檔案讀寫（全域 / 工作區）、以及 VM 控制。
 */
interface StatusBarHelper {
  v1: {
    // ─────────────────────────────────────────────────────────
    // 儲存管理（鍵值式，序列化後存放；適合中小量設定/資料）
    // ─────────────────────────────────────────────────────────
    storage: {
      /** 全域儲存（跨所有工作區共用）。適合使用者偏好、共用設定等。 */
      global: {
        /**
         * 讀取指定 key 的值。
         * @param key 鍵名
         * @param def（可選）預設值；當 key 不存在時回傳此值（否則回傳 undefined）
         * @returns 儲存的值或 undefined（或 def）
         */
        get<T>(key: string, def?: T): Promise<T | undefined>;
        /**
         * 寫入指定 key 的值。
         * @param key 鍵名
         * @param value 要儲存的值（可為可序列化物件）
         */
        set<T>(key: string, value: T): Promise<void>;
        /**
         * 刪除指定 key。
         * @param key 鍵名
         */
        remove(key: string): Promise<void>;
        /**
         * 取得目前所有已存在的 key 清單。
         * @returns string 陣列
         */
        keys(): Promise<string[]>;
      };

      /** 工作區儲存（僅限目前開啟的 Workspace）。適合專案本身的狀態或設定。 */
      workspace: {
        /**
         * 讀取指定 key 的值。
         * @param key 鍵名
         * @param def（可選）預設值；當 key 不存在時回傳此值（否則回傳 undefined）
         * @returns 儲存的值或 undefined（或 def）
         */
        get<T>(key: string, def?: T): Promise<T | undefined>;
        /**
         * 寫入指定 key 的值。
         * @param key 鍵名
         * @param value 要儲存的值（可為可序列化物件）
         */
        set<T>(key: string, value: T): Promise<void>;
        /**
         * 刪除指定 key。
         * @param key 鍵名
         */
        remove(key: string): Promise<void>;
        /**
         * 取得目前所有已存在的 key 清單。
         * @returns string 陣列
         */
        keys(): Promise<string[]>;
      };
    };

    // ─────────────────────────────────────────────────────────
    // 檔案作業（針對全域 / 工作區的 SBH 專屬資料夾）
    // 適合較大量資料、二進位、或需要目錄階層的情境。
    // 所有路徑一律使用「相對於各自根目錄」的 relativePath。
    // ─────────────────────────────────────────────────────────
    files: {
      /**
       * 取得兩個儲存根目錄的絕對路徑。
       * @returns { global, workspace }（workspace 在無工作區時為 null）
       */
      dirs(): Promise<{ global: string; workspace: string | null }>;

      /**
       * 讀取 UTF-8 純文字檔。
       * @param scope 'global' 或 'workspace'
       * @param relativePath 儲存根目錄底下的相對路徑
       * @returns 檔案內容字串
       */
      readText(scope: 'global' | 'workspace', relativePath: string): Promise<string>;

      /**
       * 寫入 UTF-8 純文字檔（覆寫）。
       * 若父資料夾不存在會自動建立。
       * @param scope 'global' 或 'workspace'
       * @param relativePath 儲存根目錄底下的相對路徑
       * @param content 檔案內容
       */
      writeText(scope: 'global' | 'workspace', relativePath: string, content: string): Promise<void>;

      /**
       * 讀取 JSON 檔，並反序列化成物件。
       * @param scope 'global' 或 'workspace'
       * @param relativePath 相對路徑
       * @returns 反序列化後的資料
       */
      readJSON<T>(scope: 'global' | 'workspace', relativePath: string): Promise<T>;

      /**
       * 寫入 JSON 檔（覆寫）。
       * @param scope 'global' 或 'workspace'
       * @param relativePath 相對路徑
       * @param data 任何可序列化的資料
       */
      writeJSON(scope: 'global' | 'workspace', relativePath: string, data: any): Promise<void>;

      /**
       * 讀取位元組檔案，回傳 Uint8Array。
       * @param scope 'global' 或 'workspace'
       * @param relativePath 相對路徑
       */
      readBytes(scope: 'global' | 'workspace', relativePath: string): Promise<Uint8Array>;

      /**
       * 寫入位元組檔案（覆寫）。
       * @param scope 'global' 或 'workspace'
       * @param relativePath 相對路徑
       * @param data 可為 Uint8Array、ArrayBuffer、或 base64 字串
       */
      writeBytes(
        scope: 'global' | 'workspace',
        relativePath: string,
        data: Uint8Array | ArrayBuffer | string
      ): Promise<void>;

      /**
       * 檢查檔案或目錄是否存在。
       * @param scope 'global' 或 'workspace'
       * @param relativePath 相對路徑
       * @returns 存在則為 true
       */
      exists(scope: 'global' | 'workspace', relativePath: string): Promise<boolean>;

      /**
       * 列出資料夾內容（非遞迴）。
       * @param scope 'global' 或 'workspace'
       * @param relativePath（可選）要列出的資料夾
       * @returns name 與 type（'directory' | 'file'）
       */
      list(
        scope: 'global' | 'workspace',
        relativePath?: string
      ): Promise<{ name: string; type: 'directory' | 'file' }[]>;

      /**
       * 遞迴列出所有檔案與其大小（bytes），並回傳相對路徑 rel。
       * @param scope 'global' 或 'workspace'
       * @param relativePath（可選）起始資料夾
       */
      listStats(
        scope: 'global' | 'workspace',
        relativePath?: string
      ): Promise<{ name: string; type: 'file'; size: number; rel: string }[]>;

      /**
       * 刪除單一檔案或空資料夾。
       * @param scope 'global' 或 'workspace'
       * @param relativePath 相對路徑
       */
      remove(scope: 'global' | 'workspace', relativePath: string): Promise<void>;

      /**
       * 清空該 scope 根目錄下的所有內容（僅刪內容，不刪根）。
       * 請謹慎使用。
       * @param scope 'global' 或 'workspace'
       */
      clearAll(scope: 'global' | 'workspace'): Promise<void>;
    };

    // ─────────────────────────────────────────────────────────
    // VM（腳本執行環境）控制
    // 可在腳本內主動停止自己、或監聽被外部停止的事件。
    // ─────────────────────────────────────────────────────────
    vm: {
      /**
       * 主動停止目前這顆 VM。
       * @param reason（可選）停止原因物件或字串，會出現在 onStop 的回呼中。
       */
      stop(reason?: any): void;

      /**
       * 當這顆 VM 被外部停止（或已經停止）時呼叫回調。
       * - 若 VM 已停止，回調會在下一個 microtask 觸發一次。
       * - 回傳的函式可解除監聽。
       * @param cb 停止時要呼叫的處理函式（可取得 reason）
       * @returns 解除監聽的函式
       */
      onStop(cb: (reason?: any) => void): () => void;

      /**
       * 取得最後一次停止原因（若尚未停止則可能為 undefined）。
       */
      reason(): any;

      /**
       * 目前這顆 VM 的 command 名稱（對應你的狀態列項目 command）。
       */
      command: string;

      /**
       * 以 command 名稱停止某顆（或自己）VM。
       * @param cmd（可選）要停止的 command；未提供時等同停止自己
       * @param reason（可選）停止原因
       */
      stopByCommand(cmd?: string, reason?: any): void;

      /**
       * 開啟（啟動）另一個 command 對應的腳本（若尚未執行）。
       * 若已在執行且提供 payload，則作為訊息傳送。
       * @param cmdId 目標腳本的 command Id
       * @param payload（可選）啟動後要傳遞的第一個訊息
       */
      open(cmdId: string, payload?: any): Promise<void>;

      /**
       * 傳送訊息給另一顆執行中的 VM（若對方尚未註冊 onMessage 會暫存佇列，直到註冊）。
       * @param targetCmdId 目標 VM 的 command Id
       * @param message 要傳遞的資料
       */
      sendMessage(targetCmdId: string, message: any): void;

      /**
       * 監聽從其他 VM 傳入的訊息，回傳取消監聽函式。
       * @param handler 處理函式 (fromCmdId, message)
       * @returns unsubscribe 函式
       */
      onMessage(handler: (fromCmdId: string, message: any) => void): () => void;
      
      /**
       * 這顆 VM 的 AbortSignal；可自行監聽 'abort' 事件。
       * 一般建議使用 onStop 即可。
       */
      signal: AbortSignal;
    };
  };
}

// ─────────────────────────────────────────────────────────
// 全域別名（在你的腳本中任選其一使用）
// 例：const { storage, files, vm } = statusBarHelper.v1;
// ─────────────────────────────────────────────────────────
declare const statusBarHelper: StatusBarHelper; // 完整名稱
declare const sbh: StatusBarHelper;             // 短名稱
declare const SBH: StatusBarHelper;             // 大寫別名
```

