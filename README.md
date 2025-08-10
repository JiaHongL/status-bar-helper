# Status Bar Helper

這是一款能讓你在 VS Code 狀態列上新增自訂按鈕的擴充套件。
你可以撰寫 JavaScript 腳本，或結合 VS Code API，打造各種獨特且實用的功能。

## ✨ 特色重點

- 自訂按鈕：在狀態列建立專屬按鈕，點擊即可執行自訂 JavaScript 腳本。
- 自動執行：支援在 VS Code 啟動時自動觸發指定腳本。
- 內建 Monaco 編輯器：提供語法高亮、智能提示等進階編輯功能。
- 資料存取 API：可透過擴充 API 操作 Storage 與 File 系統，方便管理資料。
- 獨立 VM 執行：每個腳本皆在獨立 Node.js VM 中運行，互不干擾，並僅使用原生 Node 模組。
- 安全性與隔離性：腳本在受控環境中執行，避免影響 VS Code 及其他腳本的穩定性與安全性。

## 📖 使用說明

### 設定頁

在這個頁面，你可以撰寫並即時測試狀態列項目的腳本：

- 內建 Run / Stop 按鈕，隨時執行或停止腳本。
- 內建 Monaco 編輯器，支援 Node.js 原生模組與 VS Code API。
- 下方 Output 面板 即時顯示腳本輸出與執行狀態（成功 / 失敗 / VM 關閉）。
- Output 面板可隱藏，並支援拖曳調整高度。
- 適合快速開發、測試與除錯自訂功能。

![alt text](https://raw.githubusercontent.com/JiaHongL/status-bar-helper/main/image/image-1.png)

### 編輯頁

在這個頁面中，你可以編寫並即時測試狀態列項目的腳本：

- 內建 Run / Stop 按鈕，立即測試腳本。
- 內建 Monaco 編輯器，支援 node 原生模組 與 VS Code API。
- 下方 Output 面板 會即時顯示腳本輸出與執行狀態（成功 / 失敗 / VM 關閉）。
- Output 面板可隱藏或拖拉改變顯示高度。
- 適合快速開發與調試自訂功能。

![alt text](https://raw.githubusercontent.com/JiaHongL/status-bar-helper/main/image/image-2.png)

---

## 🔧 指令與捷徑

- **Status Bar Helper: Settings** — 從命令面板開啟設定頁
- **右下角齒輪按鈕** — 快速進入設定頁

![alt text](https://raw.githubusercontent.com/JiaHongL/status-bar-helper/main/image/image-3.png)

---

## 內建範例

- Log：示範如何將輸出同時顯示在面板 Output 區塊與 VS Code 的 Output Channel。
- Git Add：示範如何在擴充套件中執行全域 Git 指令（例如 git add）。
- Storage：示範如何使用 StatusBarHelper 的 Storage 與 File API 進行資料讀寫與檔案操作。
- Toggle Light/Dark Mode：示範如何將 VS Code 指令製作成狀態列按鈕，快速切換主題。
![alt text](https://raw.githubusercontent.com/JiaHongL/status-bar-helper/main/image/01.gif)
- Board：示範如何使用 VS Code Webview 建立自訂互動介面。
![alt text](https://raw.githubusercontent.com/JiaHongL/status-bar-helper/main/image/02.gif)
- Pomodoro：示範結合狀態列與 showQuickPick 建立簡單的番茄鐘計時器。
![alt text](https://raw.githubusercontent.com/JiaHongL/status-bar-helper/main/image/03.gif)

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

