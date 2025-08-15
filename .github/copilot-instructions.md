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
- **Import/Export 資料完整性**：
  - JSON 必須為 SbhItem[] 陣列格式，**嚴格保持欄位順序與未知欄位**
  - 支援 Replace/Append 合併策略，衝突時可 skip 或 newId
  - 所有 IO 經 bridge（`importExport` namespace），**禁止直接檔案存取**
  - 預覽（dry-run）與實際套用分離，確保安全性
- **Adaptive Polling + Sync 指示**：
  - 背景輪詢階梯：20s → 45s → 90s → 180s → 300s → 600s，依「連續未變更次數」提升；面板開啟時上限鎖在 90s。
  - 開啟設定面板時：若目前 interval > 90s 觸發一次 `forceImmediatePoll`（不推進穩定計數）。
  - 以 items signature（command|scriptHash|text|tooltip|hidden|enableOnInit）偵測遠端變更；變更時重置 interval & `_lastSyncApplied`。
  - `_lastSyncApplied` 初次啟動即初始化，並透過 `hostRun.lastSyncInfo` 提供給 Webview 顯示「Last sync …」。
  - UI 相對時間（just now / Xs / Xm / Xh）後續若本地化需加入 nls；避免在 Webview 端做重複運算（目前 15s 更新可視需求調整）。
- **Responsive / Compact Mode**：
  - < 1100px：隱藏 last sync 文字（僅 icon）。
  - < 860px：`body.compact` 啟用；隱藏「狀態列項目」標題文字與每列 tooltip，壓縮行高。
  - 調整或新增斷點時：集中於 `settings.html`，避免散落 magic numbers；必要時以 ResizeObserver 改寫。
- **UI 新增同步資訊**：last sync 指示器優先放在標題列右側，顏色/背景須遵循 VS Code Theme token，不直接寫死色碼。

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
  1) 透過設定面板「Add New Item」新增（`settings.html` 內 JS）  
  2) （若為預設示例）調整 `media/script-store.defaults.<locale>.json` 並升級 seed key（`ensureDefaultItems`）  
  3) 確保 `GLOBAL_*` 兩份資料一致並觸發重繪（`statusBarHelper._refreshStatusBar`）
- 當我請你**寫/改 Webview**：產出 TS/HTML/CSS，遵循現有 postMessage 協定；所有外掛資源用 `webview.asWebviewUri`。避免直接引用已移除的 restore defaults 流程。
- 當我請你**寫測試**：使用 `@vscode/test-electron` 啟動 VS Code，模擬指令與 Webview 通訊，驗證清理行為。
- 當我請你**實作 Import/Export**時：
  1) utils 在 `src/utils/importExport.ts`，嚴格型別檢查與欄位保留
  2) bridge 指令：`importPreview`、`exportPreview`、`applyImport`
  3) UI 預覽表格：checkbox（第一欄）、text、command、tooltip、size、status、reason
  4) 支援深淺色主題、多語系、響應式設計
- 當我請你**調整同步/輪詢/Last Sync 顯示**時：
  1) 輪詢核心：`extension.ts` 的 `_pollStableCount`、`_pollCurrentInterval`、`backgroundPollOnce`、`forceImmediatePoll`
  2) UI 指示器：`media/settings.html` 中 `#last-sync-indicator`（標題列）與 `updateLastSyncDisplay()`；若要本地化相對時間需新增 nls key。
  3) 若新增自訂「Force Sync」按鈕：透過 `_bridge` 呼叫新 hostRun 方法，內部直接呼叫 `backgroundPollOnce(context, true)`。
  4) 變更 signature 準則時務必同步更新 computeItemsSignature 以免漏偵測。
- 當我請你**優化響應式排版**時：
## Script Store（新）
目標：取代舊「Restore Samples」，提供遠端/本地 catalog 瀏覽、選擇性安裝或更新腳本。

### 範圍 Phase 1
1. Catalog 來源：先使用內建 `media/script-store.defaults.<locale>.json` 當本地 catalog；後續可加 remote fetch。
2. UI：設定面板按鈕「Script Store」開啟 overlay/modal（新 DOM 區塊）；顯示表格：Icon、Label、Tags、狀態（Installed / Update / New）、操作（Install / Update / View）。
3. 安裝 / 更新：
  - 安裝：將選擇項目寫入 globalState（若 command 已存在 → 標記 Update 模式，覆蓋 script/text/tooltip/tags；保留 hidden/enableOnInit 原值除非 catalog 指定 force）。
  - 更新判斷：比對 (command, scriptHash, text, tooltip, tags) 任一不同則顯示 Update。
4. Lazy Script：catalog 中若 script 太大可用 `scriptInline` 或 `scriptUrl` 欄位；Phase1 只用 `script` 直接內嵌。
5. 安全：忽略超過大小限制的 script；拒絕含 `eval(`、`new Function`、`process.env` 大量 dump pattern（基本字串掃描）。

### 範圍 Phase 2（預留）
1. Remote fetch：bridge `scriptStore.fetchCatalog()` 下載 JSON（ETag/If-None-Match 快取）。
2. 分段載入：單條目 scriptUrl 延後取得。
3. 差異預覽：顯示本地 vs catalog diff（行數 > 400 需摺疊）。
4. 搜尋 / Tag 過濾 / 多選批次安裝。

### Bridge Namespace（預計）
`ns: 'scriptStore'` 函式：
| fn | 描述 |
| --- | --- |
| `catalog` | 回傳 catalog 內容 + hash（本地 + remote 合併） |
| `install` | 安裝或更新單一 command（參數：payload item） |
| `bulkInstall` | 批次安裝/更新（陣列） |

### 型別（草案）
```ts
interface ScriptStoreEntryMeta {
  command: string;
  text: string;
  tooltip?: string;
  tags?: string[];
  script?: string;   // 直接內嵌（Phase1）
  scriptUrl?: string;// 延後載入（Phase2）
  hash?: string;     // script/content hash（SHA256 base64）
}
```

### 安裝邏輯摘要
1. 取得現有 items Map。
2. 對每個 entry：
  - 若不存在：新增（hidden 預設 false，enableOnInit false）。
  - 若存在：覆蓋 text/tooltip/script/tags；保留 hidden/enableOnInit。
3. 儲存後呼叫 `_refreshStatusBar`。

### 遇到選擇（歧義）時策略
1. 同 command 更新：保留使用者控制屬性（hidden, enableOnInit）。
2. Tag 覆蓋：catalog 為單一真實來源 → 直接覆蓋。
3. script 缺失：若 catalog entry 無 script（且無 scriptUrl） → 跳過並標示 warning。
4. 大小超限：跳過並回傳 error summary（不 partial 寫入損壞）。

### 風險控管 & 回滾
安裝前快照（clone items array）；若任一步驟拋錯，恢復快照並回傳錯誤（bridge 回覆 ok:false）。

  1) 主要邏輯：`settings.html` 內的 `COMPACT_BREAKPOINT` 與 CSS `.compact` class。
  2) 如需逐欄隱藏（CmdId / RunAtStartup），請以 `@media` 或額外 class 控制，避免在 JS 動態插刪 DOM。 

---

# Glossary（專案名詞）
- **Item / Script**：一個狀態列按鈕與其綁定的 VM 腳本
- **Bridge**：`statusBarHelper._bridge`；VM 端透過 `sbh.v1.*` 呼叫的宿主後端
- **Manifest / ItemsMap**：分別是顯示層定義與腳本內容映射
- **SettingsPanel**：管理 UI（Monaco editor + Output），可試跑腳本
- **Import/Export**：透過 JSON 格式匯入/匯出狀態列項目，支援合併策略與衝突處理
- **MergeStrategy**：`replace`（取代全部）或 `append`（附加）
- **ConflictPolicy**：`skip`（略過衝突）或 `newId`（產生新 ID）
- **Adaptive Polling**：背景自適應輪詢策略，用於跨裝置同步變更偵測
- **Last Sync Indicator**：顯示最近一次套用遠端變更時間的 UI 元件
