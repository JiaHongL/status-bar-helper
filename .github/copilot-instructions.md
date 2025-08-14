# Copilot Instructions — Status Bar Helper

> 讓 Copilot **熟悉專案、維持一致風格**，並能在 Chat/Agent/Review 階段自動套用。

## Project quick facts
- Name: **status-bar-helper**（VS Code Extension）
- Stack: **TypeScript** + VS Code API（`vscode`），Node.js（`vm` 沙箱）
- Build: `npm run compile`（`tsc` + `cpx` 複製 typedefs / nls），Package: `npm run build`（`vsce package`）
- Test: `@vscode/test-electron`；（尚未定義 npm test 腳本，可補 `vscode-test` 例行測）
- Activation: `onStartupFinished`、`statusBarHelper.showSettings`
- Commands: `statusBarHelper.showSettings`、`statusBarHelper._bridge`、`statusBarHelper._abortByCommand`、`statusBarHelper._refreshStatusBar`
- Capabilities: 不支援 **Untrusted** 與 **Virtual** 工作區（`capabilities.untrustedWorkspaces/virtualWorkspaces` 均為 false）

## Coding style
- TypeScript **strict** 開啟；**避免 `any`**；型別窄化優先
- 命名：公開 API 使用 **小駝峰動詞開頭**（e.g. `loadFromGlobal`），常數全大寫 `SNAKE_CASE`
- 錯誤處理：**永遠回傳安全錯誤**（不可丟未過濾的例外至 webview / 使用者可見處）
- 日誌：用內建 `createOutputChannel('Status Bar Helper')`，避免 `console.log` 散落；VM 內請轉用 `console` 代理（會導回面板 log）

## Architecture rules
- **User Script 以 VM 隔離**：每個指令在 Node `vm` 沙箱執行，**只允許 Node 內建模組**與被代理的 VS Code API；嚴禁 `eval/new Function`。
- **可釋放資源**：任何 `Disposable`、計時器（`setTimeout/Interval`）都必須被追蹤，**在中止/結束時釋放**。
- **Message Bus**：VM 與 Host 透過 `statusBarHelper._bridge` 溝通；請使用既有封裝，避免旁路。
- **Storage 與 File API**：一律走 `sbh.v1.storage` 與 `sbh.v1.fs`，**禁止直接以 VM 存取擴充資料夾**。
- **Path 安全**：檔案操作不得使用絕對路徑或 `..` 越界；所有路徑須經過 base path 解析。
- **GlobalState 為單一事實來源**：使用
  - `GLOBAL_MANIFEST_KEY`：狀態列項目清單（text/tooltip/hidden/enableOnInit）
  - `GLOBAL_ITEMS_KEY`：`command -> script` 映射
  - `MIGRATION_FLAG_KEY`：自 settings.json 遷移旗標  
  修改這些資料時，**務必一併更新**面板 UI（postMessage）與 status bar。

## Quality bar
- PR 必附：動機、變更摘要、受影響面、回滾策略、測試證據
- 測試覆蓋：VM 中止清理、橋接錯誤傳遞、設定遷移、面板訊息流
- 效能：主執行緒上的長工必須使用非同步 I/O；避免阻塞 UI（特別是初始化與面板開啟）

## Security / Limits
- **大小限制**（在 `extension.ts` 中宣告）：單 Key 2MB、總量 200MB、JSON/TEXT 10MB、檔案 50MB  
  請勿調升限制而未制定壓縮或分片策略。
- 禁止將機密寫入純文字；必要時請提示使用者轉交至安全金鑰存放。

## How to use me（給 Copilot）
- 當我請你**新增狀態列按鈕 + 腳本**時：  
  1) 修改/呼叫 SettingsPanel 的新增流程或在 `default-items.ts` 添新預設腳本  
  2) 更新 `extension.ts` 的預設種子（若需）  
  3) 確保 `GLOBAL_*` 兩份資料一致並觸發重繪
- 當我請你**寫/改 Webview**：產出 TS/HTML/CSS，遵循現有 postMessage 協定；所有外掛資源用 `webview.asWebviewUri`。
- 當我請你**寫測試**：使用 `@vscode/test-electron` 啟動 VS Code，模擬指令與 Webview 通訊，驗證清理行為。

---

# Glossary（專案名詞）
- **Item / Script**：一個狀態列按鈕與其綁定的 VM 腳本
- **Bridge**：`statusBarHelper._bridge`；VM 端透過 `sbh.v1.*` 呼叫的宿主後端
- **Manifest / ItemsMap**：分別是顯示層定義與腳本內容映射
- **SettingsPanel**：管理 UI（Monaco editor + Output），可試跑腳本
