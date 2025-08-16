# Copilot Instructions — Status Bar Helper

> 讓 Copilot **熟悉專案、維持一致風格**，並能在 Chat/Agent/Review 階段自動套用。

<!--
Maintenance Notes
LastMaintSync: 2025-08-16
Update Triggers (若發生務必同步本檔):
1. 新增 / 移除 Bridge namespace 或其函式 (scriptStore / importExport / hostRun ...)
2. 變更 items signature 欄位或 adaptive polling 階梯 / 閾值
3. 調整安全限制 (KV / JSON / TEXT / Binary / Script size) 或 sandbox 規則
4. Script Store 行為（遠端來源 / cache TTL / 安全掃描規則 / hash 組成）改動
5. 新增初始化預設項目或預設 seeding 流程變更
6. Webview UI 斷點 (<1100 / <860) 或同步指示器顯示策略調整
7. Import/Export 格式（策略、欄位、合併規則）變更
8. 新增/移除本檔引用的關鍵 NLS key / typedef 注入流程
Instruction Change Log:
2025-08-16: Sync with UI icon conversion & edit view tags removal. Updated responsive design and UI interaction patterns.
-->

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
- **Responsive / Compact Mode + Icon Interface**：
  - < 1100px：隱藏 last sync 文字（僅 icon）。
  - < 860px：`body.compact` 啟用；隱藏「狀態列項目」標題文字與每列 tooltip，壓縮行高。
  - 調整或新增斷點時：集中於 `settings.html`，避免散落 magic numbers；必要時以 ResizeObserver 改寫。
  - **全面圖示化介面**：所有操作按鈕（Run/Stop/Edit/Delete/Save/Cancel）均採用 VS Code Codicons，提供一致的視覺體驗。
  - 圖示按鈕規格：列表檢視 24x24px，編輯頁面 28x28px，Script Store 22x22px，均包含完整的 title 和 aria-label 屬性。
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
  - **編輯頁面設計**：僅保留圖示、標籤、工具提示和腳本四個核心編輯欄位，**不包含 tags 編輯功能**。
  - **圖示按鈕介面**：所有操作按鈕使用 Codicons，確保一致的視覺體驗和完整的無障礙支援。
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
## Script Store（現況 & Roadmap）
目標：取代舊「Restore Samples」，提供（遠端優先 + 本地 fallback）catalog 瀏覽、增量更新、差異檢視與批次安裝。

### 現行實作（Phase 1 + 1.5）
1. Catalog 來源：遠端 `https://raw.githubusercontent.com/.../media/script-store.defaults.<locale>.json`（3s timeout、256KB JSON 大小上限、失敗則本地 packaged JSON）。
2. Locale：`vscode.env.language` → `zh-tw`（含 zh-hant）優先，其餘 fallback `en`；遠端 / 本地皆使用同一判斷邏輯，避免 tooltip 語系錯配。
3. Cache：記憶體 5 分鐘 TTL（面板重開 / 多次請求不重複下載）。
4. UI：面板「Script Store」 overlay 表格欄位：Icon、Label、Tags、Status（Installed / Update / New）、Action（圖示化操作：View/Install/Update/Remove）。
5. Status 判斷：hash = sha256(script|text|tooltip|tags JSON)；與現有項目 hash 相同 → Installed；存在差異 → Update；不存在 → New。
6. 安裝 / 更新：覆蓋 script/text/tooltip/tags；保留 hidden / enableOnInit。
7. 安全：
  - 單 script 安全大小限制（目前 32KB；超過拒絕）。
  - Pattern 掃描拒絕：`eval(`、`new Function`、大量 `process.env.` (>5 次)。
  - JSON parse 失敗或格式非陣列 → 忽略該來源並 fallback。
8. Diff 視窗：簡易 line-based（>400 行可摺疊）；顯示 catalog vs installed 差異。
9. Bulk Install：原子性；失敗回滾快照（確保 globalState 一致）。
10. **更新確認**：有差異時 View 圖示顏色變化，更新前顯示確認對話框包含差異預覽。

### 待辦（Phase 2）
1. ETag / If-None-Match → 精準網路快取（減少 5 分鐘 TTL 期間的重複資料）。
2. `scriptUrl` 延後載入（Lazy 大型腳本）+ 逐條目 hash 驗證。
3. Token / 行內 diff 高亮（目前僅 line diff）。
4. 搜尋 / Tag 過濾 / 多選批次操作強化（快速多選 + 快捷鍵）。
5. Source Indicator（顯示 remote / local fallback 狀態）。

### Bridge Namespace（現況）
`ns: 'scriptStore'` 函式：
| fn | 描述 | 備註 |
| --- | --- | --- |
| `catalog` | 取得（cache 後）catalog 陣列 + 計算後 status/hash | 遠端優先 + fallback + 5min TTL |
| `install` | 安裝 / 更新單一 command | 維持 hidden/enableOnInit |
| `bulkInstall` | 批次安裝/更新 | 原子回滾 |

### 型別（現況）
```ts
interface ScriptStoreEntryMeta {
  command: string;
  text: string;
  tooltip?: string;
  tags?: string[];
  script?: string;      // Phase1 直接內嵌
  scriptUrl?: string;   // Phase2 預留（lazy fetch）
  hash?: string;        // 計算後附加（sha256 base64）
  status?: 'installed' | 'update' | 'new';
}
```

### 安裝邏輯摘要
1. 建索引：現有 items → Map(command → item)。
2. 對每個 entry：
  - 不存在：新增（hidden=false, enableOnInit=false）。
  - 已存在：覆蓋 text/tooltip/script/tags；保留 hidden/enableOnInit。
3. 寫回 globalState → 觸發 `_refreshStatusBar`。

### 邊界 / 選擇策略
1. 缺 script（亦無 scriptUrl）→ 跳過（回傳 warning）。
2. script 超限 → 跳過並報錯，不部分寫入。
3. Tag 覆蓋：catalog 為權威來源直接覆蓋。
4. 安裝過程中任一失敗 → 還原快照並回覆 `{ ok:false }`。

### 風險控管 & 回滾
預先 clone items 陣列；逐項驗證 & 構建新陣列 → 成功後一次性寫入；失敗則放棄並回傳錯誤碼（不殘留部分狀態）。

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
