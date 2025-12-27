# Status Bar Helper — Script 開發指南 (給 AI Model 閱讀使用)

## 必讀參考文件（**Model 必須嘗試讀取並理解**）

以下四份文件 **Model 應該先嘗試讀取並理解**（若環境可存取網路）。讀完後，Model 要能在產出腳本時依這些文件中的型別與 API 規範實作。

1. SBH README（套件總覽）  
   https://github.com/JiaHongL/status-bar-helper/blob/main/README.tw.md

   - 目的：了解 Status Bar Helper 的整體設計目標、腳本載入與執行方式、以及常見使用情境（例如 triggers、sidebar、storage 等）。

2. SBH Type Definitions（SBH 自己的 API 型別 — **raw 檔案**，必讀）  
   https://raw.githubusercontent.com/JiaHongL/status-bar-helper/refs/heads/main/types/status-bar-helper/sbh.d.ts

   - 目的：直接參考 `statusBarHelper.v1` 的型別定義（包含 `storage`、`files`、`secret`、`sidebar`、`vm`、`packages` 等介面），以免產出與實際 API 不符的程式。
   - 你要「看得懂」的重點（從 `sbh.d.ts` 摘要）：
     - `storage`：兩層存取（`global` / `workspace`），各自提供 `get(key, default?)`、`set`、`remove`、`keys()` 等 Promise API，用於持久化 key/value（注意 workspace 在沒有開 workspace 時可能不可用）。
     - `files`：提供完整檔案 I/O（`dirs()`、`readText`/`writeText`、`readJSON`/`writeJSON`、`readBytes`/`writeBytes`、`exists`、`list`、`listStats`、`remove`、`clearAll`），所有皆為 Promise，且需帶 `scope: 'global' | 'workspace'` 與相對路徑。
     - `secret`：加密的機敏儲存（`get` / `set` / `delete` / `keys()`），用來存放 token / 機密。
     - `sidebar`：sidebar/webview 管理（`open(spec)` 可傳 raw HTML 或 `{ html?, focus?, onClose? }`；有 `postMessage`、`onMessage(handler)`（回傳 disposable）、`close()`、`onClose(handler)`；若已存在 session，`open` 會 replace 舊 session 並觸發舊 session 的 `onClose('replaced')`）。
     - `vm`：VM 生命週期與跨腳本通訊（`stop` / `onStop` / `reason` / `stopByCommand`、`open(cmdId, payload?)`、`sendMessage`、`onMessage`）。**注意：型別檔沒有提供任何顯示用方法（例如先前假設的 `vm.setLabel` 並不存在）——VM 主要負責執行控制與訊息傳遞。**
     - `packages`：npm 套件管理（`install(name, options?)`、`remove(name)`、`list()`、`exists(name)`、`require(name)`、`dir()`），套件安裝在 `globalStorage/sbh.packages/node_modules/`，與系統和工作區隔離。**注意：`require()` 是同步方法，必須先用 `install()` 安裝套件才能使用。**

3. VS Code d.ts（官方 VSCode API 參考）  
   https://raw.githubusercontent.com/microsoft/vscode/refs/heads/main/src/vscode-dts/vscode.d.ts

   - 目的：確認在擴充/腳本中可以安全使用的 `vscode` API（例如 `commands.executeCommand`、`window.showInformationMessage`、`workspace.workspaceFolders`、`window.showInputBox`、`window.showQuickPick` 等），必要時用這些官方 API 作為顯示或 workspace 操作的 fallback。

4. Node.js 型別（DefinitelyTyped — types/node v22）  
   https://github.com/DefinitelyTyped/DefinitelyTyped/tree/master/types/node/v22

   - 目的：確認會用到的 Node 內建模組簽章（同步 vs 非同步、callback vs Promise），避免誤用 API。
   - 有限範圍原則（**不要嘗試讀整個 repo**）：僅讀與腳本實作直接相關的型別檔，例如 `child_process.d.ts`、`fs.d.ts`、`path.d.ts`、`os.d.ts`、`process.d.ts`、`crypto.d.ts`、`timers.d.ts`、`stream.d.ts`。
   - d.ts 預設對應 Node v22，執行時依照使用者環境 (Node v18 ~ v24)，撰寫時請遵循實際版本的語法與 API。

5. SBH 預設腳本參考

- https://raw.githubusercontent.com/JiaHongL/status-bar-helper/refs/heads/main/src/default-items.ts

---

## 1. 怎麼撰寫腳本的相關模組引用

```js
const vscode = require("vscode");
const { storage, files, vm, sidebar, packages } = statusBarHelper.v1;
const {
  setTimeout,
  clearTimeout,
  setInterval,
  clearInterval,
} = require("timers");
const { randomUUID } = require("crypto");
const fs = require("fs");
const path = require("path");
const { exec, spawn } = require("child_process");
const util = require("util");
const fsp = require("fs").promises;
```

重點

- 請參考上方引入的方式，因為是在 node 環境下執行，所以需要使用 `require()`。
- 寫完腳本後，記得檢查程式碼使用到的模組是否有在上方引入。

---

## 2. 示範 statusBarHelper.v1.vm

```js
const vscode = require("vscode");
const { vm } = statusBarHelper.v1;

(function main() {
  const SELF = "sbh.demo.vmChatA";
  const PEER = "sbh.demo.vmChatB";
  let panel;

  vm.onStop(() => {
    try {
      panel?.dispose();
    } catch {}
  });

  function ensurePanel() {
    if (panel) return panel;
    panel = vscode.window.createWebviewPanel(
      "sbhVmChatA",
      "VM Chat A",
      vscode.ViewColumn.Active,
      { enableScripts: true, retainContextWhenHidden: true }
    );
    panel.onDidDispose(() => {
      try {
        vm.stop();
      } catch {}
    });
    return panel;
  }

  vm.onMessage((from, payload) => {
    if (from !== PEER) return;
    console.log("[B → me]", payload);
  });

  ensurePanel();
  console.log("[system] Chat A ready");
})();
```

重點

- vm.open / vm.sendMessage / vm.onMessage → VM 之間互傳訊息
- vm.stopByCommand / vm.stop → 停止指定或自身 VM
- vm.onStop → 清理資源（例如關閉 WebviewPanel）
- 若是跑一次性的腳本，沒有開啟任何 `createWebviewPanel()` 或 `sidebar.open()`，結尾記得呼叫 vm.stop() 結束腳本
- 若是跑完腳本，有使用到 `createWebviewPanel()` 或 `sidebar.open()`，則不需要呼叫 vm.stop()，因為 vm.stop() 也會把 webviewPanel 或 sidebar 關掉

---

## 3. 示範 statusBarHelper.v1.secret / statusBarHelper.v1.storage / statusBarHelper.v1.files

```js
const { secret, storage, files, vm } = statusBarHelper.v1;

(async () => {
  await secret.set("github.token", "ghp_xxx...");
  console.log("token =", await secret.get("github.token"));

  await storage.global.set("demo.keep", { ts: Date.now() });
  console.log(await storage.global.get("demo.keep"));

  const txtRel = "demo/notes/hello.txt";
  await files.writeText("global", txtRel, "hello");
  console.log(await files.readText("global", txtRel));

  vm.stop();
})();
```

重點

- secret.set/get/delete/keys → 儲存 token 或機敏資訊
- storage.global 與 storage.workspace → key/value 儲存
- files.readText/writeText/readJSON/writeJSON/readBytes/writeBytes → 檔案存取
- files.exists/list/listStats/remove → 檔案管理
- statusBarHelper.v1.files: 此 API 專門用於在「SBH」（StatusBarHelper）專用的沙盒化（sandboxed）、獨立儲存區域內進行 I/O 操作（讀取和寫入）。它不應該被用來存取使用者專案工作區內的檔案。
- vscode.workspace.workspaceFolders: 當您的目標是存取和讀取當前專案或工作區中的檔案時，這才是正確應使用的 API。它會提供專案根目錄的路徑。
---

## 4. 示範 workspaceFolders + exec

```js
const vscode = require("vscode");
const { exec } = require("child_process");
const { vm } = statusBarHelper.v1;

const workspaceFolders = vscode.workspace.workspaceFolders;
if (workspaceFolders && workspaceFolders.length > 0) {
  const cwd = workspaceFolders[0].uri.fsPath;
  exec("git add .", { cwd }, (err) => {
    if (err) vscode.window.showErrorMessage("Git Add 失敗");
    else vscode.window.showInformationMessage("✅ git add . 成功");
    vm.stop();
  });
}
```

重點：

- vscode.workspace.workspaceFolders → 取得目前開啟的 workspace 資訊
- 取 workspaceFolders[0].uri.fsPath 作為 cwd
- 用 child_process.exec 執行 git 或 shell 指令
- 透過 vscode.window.showInformationMessage / showErrorMessage 顯示結果

---

## 5. 示範 createWebviewPanel

```js
const panel = vscode.window.createWebviewPanel(
  "sbhWeather",
  "Weather",
  vscode.ViewColumn.Active,
  { enableScripts: true, retainContextWhenHidden: true }
);
const nonce = Math.random().toString(36).slice(2);
panel.webview.html = `
  <meta http-equiv="Content-Security-Policy"
    content="default-src 'none'; img-src data:; style-src 'unsafe-inline'; script-src 'nonce-${nonce}';">
  <script nonce="${nonce}">console.log('ok');</script>
`;
```

重點：

- createWebviewPanel(viewType, title, column, options)
- panel.webview.html 注入 HTML
- CSP 必須設定 <meta http-equiv="Content-Security-Policy" …>
- script tag 記得加上 nonce="${nonce}"
- vm.onStop 與 panel.onDidDispose 清理資源

---

## 6. 示範 statusBarHelper.v1.sidebar

```js
const { sidebar, vm } = statusBarHelper.v1;
const vscode = require("vscode");

await sidebar.open({ html: "<h3>Sidebar Demo</h3>", onClose: () => vm.stop() });

const panel = vscode.window.createWebviewPanel(
  "sbh.tab",
  "Demo Tab",
  vscode.ViewColumn.Active,
  { enableScripts: true }
);

// Relay message
sidebar.onMessage((m) => panel.webview.postMessage(m));
panel.webview.onDidReceiveMessage((m) => sidebar.postMessage(m));
```

重點

- sidebar.open({ html, onClose }) → 開啟 sidebar
- sidebar.postMessage / sidebar.onMessage → 與 VM 或 WebviewPanel 溝通
- sidebar.close / sidebar.onClose → 關閉與監聽關閉事件
- 搭配 vscode.window.createWebviewPanel 可做雙邊互動

---

## 7. 示範 createStatusBarItem / showInputBox / showQuickPick

```js
const vscode = require("vscode");
const { vm } = statusBarHelper.v1;

(function () {
  const item = vscode.window.createStatusBarItem(
    vscode.StatusBarAlignment.Right,
    1000
  );
  item.text = "🍅 25:00";
  item.command = "sbh.demo.pomodoro";
  item.show();

  vscode.commands.registerCommand("sbh.demo.pomodoro", async () => {
    const choice = await vscode.window.showQuickPick([
      "Start",
      "Custom…",
      "Close",
    ]);
    if (choice === "Custom…") {
      const minutes = await vscode.window.showInputBox({
        prompt: "輸入分鐘數",
        value: "25",
      });
      vscode.window.showInformationMessage(`Start ${minutes} min`);
    }
  });

  vm.onStop(() => item.dispose());
})();
```

重點：

- createStatusBarItem → 建立自訂狀態列項目
- showQuickPick → 動態選單
- showInputBox → 自訂輸入（含 validateInput）
- 可結合 setInterval 實作番茄鐘等工具

---

## 8. 示範 withProgress / activeTab.input

結合範例

```js
const vscode = require("vscode");
const { vm } = statusBarHelper.v1;

(async () => {
  await vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      title: "處理中...",
      cancellable: false,
    },
    async (progress) => {
      progress.report({ message: "分析目前的 active tab" });
      await new Promise((r) => setTimeout(r, 1000));
      const active = vscode.window.tabGroups.activeTabGroup?.activeTab?.input;
      console.log("active tab input =", active);
    }
  );
  vm.stop();
})();
```

重點

- withProgress({ location, title }, task) → 長時間任務顯示進度
- tabGroups.activeTabGroup?.activeTab?.input → 取得目前使用中 tab 的資訊（檔案或 Webview）

## 9. 示範 vscode.commands.executeCommand

```js
const vscode = require("vscode");
const { vm } = statusBarHelper.v1;

(async () => {
  try {
    // 執行 VS Code 內建的「切換亮/暗主題」指令
    await vscode.commands.executeCommand(
      "workbench.action.toggleLightDarkThemes"
    );
  } catch (e) {
    // 如果執行失敗，顯示錯誤訊息
    vscode.window.showErrorMessage("Toggle theme failed: " + (e?.message || e));
  } finally {
    // 無論成功或失敗，腳本最後要停止 VM
    vm.stop();
  }
})();
```

重點

- vscode.commands.executeCommand(commandId, ...args) → 執行 VS Code 指令

---

## 10. 示範 statusBarHelper.v1.explorerAction

```js
const vscode = require("vscode");
const { explorerAction, vm } = statusBarHelper.v1;

(async () => {
  // 基本使用：顯示檔案資訊
  await explorerAction.register({
    description: "$(info) 顯示檔案資訊",
    handler: async (ctx) => {
      const filePath = ctx.uri?.fsPath;
      if (filePath) {
        vscode.window.showInformationMessage(`檔案路徑: ${filePath}`);
      }
    },
  });

  // 多檔選取：批次處理
  await explorerAction.register({
    description: "$(rocket) 批次處理檔案",
    handler: async (ctx) => {
      // 處理單檔或多檔選取
      const files = ctx.uris || (ctx.uri ? [ctx.uri] : []);
      vscode.window.showInformationMessage(`選取了 ${files.length} 個檔案`);

      for (const fileUri of files) {
        console.log("處理:", fileUri.fsPath);
        // 在這裡執行批次處理邏輯
      }
    },
  });

  // 條件執行：只處理特定檔案類型
  await explorerAction.register({
    description: "$(symbol-method) 編譯 TypeScript",
    handler: async (ctx) => {
      if (!ctx.uri?.fsPath.endsWith(".ts")) {
        vscode.window.showWarningMessage("此功能僅支援 .ts 檔案");
        return;
      }
      vscode.window.showInformationMessage(`編譯: ${ctx.uri.fsPath}`);
      // 執行編譯邏輯
    },
  });

  // 使用 onDispose 清理資源
  const action = await explorerAction.register({
    description: "$(database) 查詢檔案資料庫",
    handler: async (ctx) => {
      console.log("查詢檔案:", ctx.uri?.fsPath);
      // 執行資料庫查詢
    },
  });

  action.onDispose(() => {
    console.log("Explorer action 已移除，清理資源");
    // 在這裡清理相關資源（例如關閉 vm）
    vm.stop();
  });
})();
```

重點

- explorerAction.register({ description, handler }) → 註冊檔案總管右鍵選單動作
- description 支援 Codicons：使用 `$(icon)` 語法顯示圖示
- handler 接收 context：包含 `uri`（單檔）或 `uris`（多選）
- onDispose：可選的清理回調，在手動呼叫 `dispose()` 時觸發
- 單一入口：所有動作都會顯示在「Status Bar Helper」選單下的 Quick Pick 中
- 多檔支援：使用 `ctx.uris || (ctx.uri ? [ctx.uri] : [])` 同時處理單檔與多選情況

---

## 11. 示範 statusBarHelper.v1.packages

```js
const vscode = require("vscode");
const { packages, vm } = statusBarHelper.v1;

(async () => {
  // 列出已安裝的套件
  const installedPkgs = await packages.list();
  console.log("已安裝套件:", installedPkgs.map(p => `${p.name}@${p.version}`).join(", ") || "無");

  // 檢查套件是否存在，不存在則安裝
  if (!await packages.exists("lodash")) {
    console.log("正在安裝 lodash...");
    const result = await packages.install("lodash");
    if (result.success) {
      console.log(`✅ 安裝成功: lodash@${result.version}`);
    } else {
      console.error("❌ 安裝失敗:", result.error);
      vm.stop();
      return;
    }
  }

  // 使用已安裝的套件（同步方法）
  const _ = packages.require("lodash");
  const arr = [1, 2, 3, 4, 5, 6];
  console.log("_.chunk([1,2,3,4,5,6], 2) =", _.chunk(arr, 2));

  // 顯示套件安裝目錄
  const pkgDir = await packages.dir();
  console.log("套件安裝位置:", pkgDir);

  vm.stop();
})();
```

進階範例：使用 Playwright 進行網頁操作

```js
const vscode = require("vscode");
const { packages, vm } = statusBarHelper.v1;

(async () => {
  // 確保 Playwright 已安裝
  if (!await packages.exists("playwright")) {
    const result = await packages.install("playwright");
    if (!result.success) {
      vscode.window.showErrorMessage("安裝 Playwright 失敗: " + result.error);
      vm.stop();
      return;
    }
  }

  // 載入 Playwright
  const { chromium } = packages.require("playwright");

  try {
    // 啟動瀏覽器
    const browser = await chromium.launch({ headless: false });
    const page = await browser.newPage();
    
    await page.goto("https://example.com");
    const title = await page.title();
    vscode.window.showInformationMessage(`網頁標題: ${title}`);
    
    // 截圖
    await page.screenshot({ path: "/tmp/screenshot.png" });
    
    await browser.close();
  } catch (e) {
    vscode.window.showErrorMessage("Playwright 執行失敗: " + e.message);
  }

  vm.stop();
})();
```

重點

- `packages.install(name, options?)` → 安裝 npm 套件，支援指定版本 `{ version: '1.0.0' }` 或強制重裝 `{ force: true }`
- `packages.require(name)` → 同步載入已安裝的套件（必須先安裝）
- `packages.exists(name)` → 檢查套件是否已安裝
- `packages.list()` → 列出所有已安裝套件（回傳 `{name, version, path, size}[]`）
- `packages.remove(name)` → 移除套件
- `packages.dir()` → 取得套件安裝目錄的絕對路徑
- 套件安裝在 `globalStorage/sbh.packages/node_modules/`，與系統和工作區隔離
- 套件目錄受保護，不會被 `files.clearAll()` 刪除

---

## 其他

- 如在 html 使用字串模板，請注意跳脫反引號與 `${}`,例如：

```js
const panel = vscode.window.createWebviewPanel(
  "demo",
  "Demo",
  vscode.ViewColumn.Active,
  { enableScripts: true }
);
const nonce = Math.random().toString(36).slice(2);
panel.webview.html = `
  <meta http-equiv="Content-Security-Policy"
    content="default-src 'none'; img-src data:; style-src 'unsafe-inline'; script-src 'nonce-${nonce}';">
  <script nonce="${nonce}">
    const vscode = acquireVsCodeApi();
    const msg = 'Hello from Webview';
    console.log(msg);
    vscode.postMessage({ type: 'greet', text: msg });
  </script>
`;
```

- 特別注意 CSP 與 nonce 的使用
  - 在建立 Webview 時，內容安全策略 (Content Security Policy, CSP) 是確保安全性的關鍵。
    - 1. 基礎 CSP 規則：
      - 一個安全的起點是設定非常嚴格的規則，預設阻擋所有資源，只允許必要的項目。
        - CSP 必須設定 <meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data:; style-src 'unsafe-inline'; script-src 'nonce-xxxx';">

    - 2. 內聯腳本 (Inline Scripts)：
      - 所有直接寫在 HTML 裡的 <script> 標籤都必須包含一個 nonce 屬性，且該 nonce 值必須與 CSP 中的 script-src 'nonce-xxxx' 相符。
        - <script nonce="${nonce}"> 需搭配 const nonce = Math.random().toString(36).slice(2); 動態產生。
        
    - 3. VS Code API：
      - 在 Webview 的腳本中若要與 VS Code 互動 (例如發送訊息)，必須先呼叫 acquireVsCodeApi()。
        - const vscode = acquireVsCodeApi();

  - 如何加入外部資源 (例如 CDN)
    - 如果您需要從外部網路載入資源 (如 CSS 函式庫、JS 腳本、字型)，您必須在 CSP 中將該資源的來源網域加入白名單。
    - 核心原則：在既有的 *-src 指令中，增加允許的網域。
    - 範例：假設我們想從 CDN (https://cdn.jsdelivr.net) 載入 Bootstrap 的 CSS 和 JS。
      - 修改前的 content：
        - "default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-${nonce}';"
      - 修改後的 content：
        - "default-src 'none'; style-src 'unsafe-inline' https://cdn.jsdelivr.net; script-src 'nonce-${nonce}' https://cdn.jsdelivr.net;"
      - 說明：
        - style-src 新增了 https://cdn.jsdelivr.net，允許載入該網域的 CSS。
        - script-src 新增了 https://cdn.jsdelivr.net，允許載入該網域的 JS。'nonce-${nonce}' 規則仍然保留，用於授權您自己的內聯腳本。

完整程式碼範例
這個範例展示了如何在 JavaScript 字串模板中，建立一個包含外部資源和內聯腳本的 Webview HTML。

```js
const vscode = require("vscode");
const { vm } = statusBarHelper.v1;

(function main() {
  let panel;

  // 當 VM 停止時，清理 WebviewPanel 資源
  vm.onStop(() => {
    if (panel) {
      panel.dispose();
    }
  });

  // 建立 WebviewPanel
  panel = vscode.window.createWebviewPanel(
    'sbhMinimalCspDemo',
    '精簡 CSP 範例',
    vscode.ViewColumn.One,
    {
      enableScripts: true,
      retainContextWhenHidden: true,
    }
  );

  // 當 WebviewPanel 關閉時，停止 VM
  panel.onDidDispose(() => {
    vm.stop();
  });

  // 產生 Nonce 並設定 Webview 的 HTML 內容
  const nonce = Math.random().toString(36).slice(2);
  panel.webview.html = getWebviewHtml(nonce);

})();

/**
 * 產生 Webview 的 HTML 內容
 * @param {string} nonce - 用於 CSP 的隨機數
 * @returns {string} HTML 字串
 */
function getWebviewHtml(nonce) {
  return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <meta http-equiv="Content-Security-Policy" 
              content="default-src 'none'; 
                       style-src https://cdn.jsdelivr.net; 
                       script-src 'nonce-${nonce}' https://cdn.jsdelivr.net;">
        <title>精簡 CSP 範例</title>
        <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.2/dist/css/bootstrap.min.css">
    </head>
    <body class="p-4">

      <button type="button" class="btn btn-secondary" 
              data-bs-toggle="tooltip" data-bs-placement="top"
              title="Bootstrap JS 已成功載入！">
        將滑鼠懸停在此處
      </button>

      <script nonce="${nonce}" src="https://cdn.jsdelivr.net/npm/bootstrap@5.3.2/dist/js/bootstrap.bundle.min.js"></script>
      
      <script nonce="${nonce}">
        try {
          // 初始化所有 Bootstrap Tooltips
          const tooltipTriggerList = [].slice.call(document.querySelectorAll('[data-bs-toggle="tooltip"]'));
          tooltipTriggerList.map(function (el) { return new bootstrap.Tooltip(el) });
          console.log("✅ Bootstrap JS 載入並初始化成功");
        } catch (e) {
          console.error("❌ 初始化 Bootstrap JS 失敗", e);
        }
      </script>

    </body>
    </html>
  `;
}
```

請先閱讀以上參考文件；接著我會提供腳本需求。請依文件中的 API 與型別規範產出可執行的腳本程式碼。

如果你已經準備好，請回覆 「請開始」，之後我會輸入需求。
