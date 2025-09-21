# Status Bar Helper — Script 開發指南 (給 AI Model 閱讀使用)

## 必讀參考文件（**Model 必須嘗試讀取並理解**）

以下四份文件 **Model 應該先嘗試讀取並理解**（若環境可存取網路）。讀完後，Model 要能在產出腳本時依這些文件中的型別與 API 規範實作。

1. SBH README（套件總覽）  
   https://github.com/JiaHongL/status-bar-helper/blob/main/README.tw.md

   - 目的：了解 Status Bar Helper 的整體設計目標、腳本載入與執行方式、以及常見使用情境（例如 triggers、sidebar、storage 等）。

2. SBH Type Definitions（SBH 自己的 API 型別 — **raw 檔案**，必讀）  
   https://raw.githubusercontent.com/JiaHongL/status-bar-helper/refs/heads/main/types/status-bar-helper/sbh.d.ts

   - 目的：直接參考 `statusBarHelper.v1` 的型別定義（包含 `storage`、`files`、`secret`、`sidebar`、`vm` 等介面），以免產出與實際 API 不符的程式。
   - 你要「看得懂」的重點（從 `sbh.d.ts` 摘要）：
     - `storage`：兩層存取（`global` / `workspace`），各自提供 `get(key, default?)`、`set`、`remove`、`keys()` 等 Promise API，用於持久化 key/value（注意 workspace 在沒有開 workspace 時可能不可用）。
     - `files`：提供完整檔案 I/O（`dirs()`、`readText`/`writeText`、`readJSON`/`writeJSON`、`readBytes`/`writeBytes`、`exists`、`list`、`listStats`、`remove`、`clearAll`），所有皆為 Promise，且需帶 `scope: 'global' | 'workspace'` 與相對路徑。
     - `secret`：加密的機敏儲存（`get` / `set` / `delete` / `keys()`），用來存放 token / 機密。
     - `sidebar`：sidebar/webview 管理（`open(spec)` 可傳 raw HTML 或 `{ html?, focus?, onClose? }`；有 `postMessage`、`onMessage(handler)`（回傳 disposable）、`close()`、`onClose(handler)`；若已存在 session，`open` 會 replace 舊 session 並觸發舊 session 的 `onClose('replaced')`）。
     - `vm`：VM 生命週期與跨腳本通訊（`stop` / `onStop` / `reason` / `stopByCommand`、`open(cmdId, payload?)`、`sendMessage`、`onMessage`）。**注意：型別檔沒有提供任何顯示用方法（例如先前假設的 `vm.setLabel` 並不存在）——VM 主要負責執行控制與訊息傳遞。**

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
const { storage, files, vm, sidebar } = statusBarHelper.v1;
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
- 若是要讀取讀取專案內的檔案，請使用 vscode.workspace.fs，而非 statusBarHelper.v1.files

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

重點：`sidebar.open()`、`postMessage`、`onMessage`、同步關閉。

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

## 其他

- 特別注意 CSP 與 nonce 的使用
  - CSP 必須設定 `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data:; style-src 'unsafe-inline'; script-src 'nonce-xxxx';">`
  - `<script nonce="${nonce}">` 搭配 `const nonce = Math.random().toString(36).slice(2);`
  - 若要使用 VSCode API，必須在 script 裡面呼叫 `const vscode = acquireVsCodeApi();`
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

請先閱讀以上參考文件；接著我會提供腳本需求。請依文件中的 API 與型別規範產出可執行的腳本程式碼。

如果你已經準備好，請回覆 「請開始」，之後我會輸入需求。
