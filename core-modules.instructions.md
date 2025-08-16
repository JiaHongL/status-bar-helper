<!--
meta:
  paths:
    - src/extension.ts
    - src/SettingsPanel.ts
    - media/settings.html
  task: code
  description: Core modules (runtime, panel, webview) invariants & contracts.
-->
# Core Modules Contract (extension.ts / SettingsPanel.ts / settings.html)

> 精準約束三大核心：Extension Host Runtime、Settings Panel（Webview Host + TS）、Webview UI（HTML/JS）。修改其一必核對本文件清單，避免破壞橋接協定、同步/輪詢與 VM 隔離安全。此檔聚焦『不可破壞的不變量』與『擴充時的操作步驟』，不重複 `.github/copilot-instructions.md` 全域內容。

<!--
Maintenance Notes
LastMaintSync: 2025-08-16
Update Triggers:
1. Runtime VM 建立 / 中止流程或追蹤結構 (RUNTIMES / MESSAGE_*) 改動
2. Bridge namespace / 函式簽章 / 回傳格式有新增或修改
3. computeItemsSignature 欄位或 polling 階梯 / 閾值調整
4. Script Store cache TTL / 遠端 fetch 條件 / 安全 pattern 規則變更
5. Webview message 指令或事件新增 / 改名
6. 安全與大小限制修改 (KV / JSON / TEXT / Binary / Script)
7. Typedef 注入機制或內容版本化策略調整
Change Log:
2025-08-16: Added scriptStore namespace description & update triggers block. Updated UI icon button specifications and edit view simplification.
-->

## 1. Runtime & VM Lifecycle (extension.ts)
- 每個腳本以 `runScriptInVm(context, command, code, origin)` 啟動，對應一個 `RuntimeCtx { abort, timers, disposables }` 存於 `RUNTIMES`。
- 任何重新啟動：先 `abortByCommand(cmd, { type:'replaced', ... })`，再建立新 VM。
- 中止（任何來源）必須清理：timers、disposables、`RUNTIMES`、`MESSAGE_HANDLERS`、`MESSAGE_QUEUES`（維持無殘留）。
- VM 中計時器與 `Disposable` 採 Proxy 攔截，自動追蹤；新增 API/功能時不可繞過這層。
- 禁止任意 `eval/new Function`；僅允許 Node 內建模組（`require.resolve(m) === m` 的情況）。新增模組白名單時需審視安全性。

### VM Messaging Bus
- `dispatchMessage(target, from, message)`：若目標尚無 handler → queue；第一個 handler 註冊時 flush。
- 新增/刪除 command 之 VM 時：同步維護 `RUNTIMES`/`MESSAGE_HANDLERS`/`MESSAGE_QUEUES`，保持 referential integrity。
- API 簽章（於 VM `sbh.v1.vm`）：`open(cmdId, payload?)`, `sendMessage(target, msg)`, `onMessage(handler) -> unsubscribe`, `stop()`, `stopByCommand(cmd?)`, `onStop(cb)`, `reason()`。
- 若新增 payload 序列化需求，只能加入在 Bridge 層（不可直接在 sandbox 注入 host 物件）。

## 2. Status Bar Items Invariants
- Global 狀態來源：`GLOBAL_MANIFEST_KEY` + `GLOBAL_ITEMS_KEY`。任一修改後：
  1) 更新 status bar (`updateStatusBarItems`).
  2) 若 Settings Panel 開啟 → `_sendStateToWebview()`。
- `computeItemsSignature(items)` 哈希項目：`command|scriptHash|text|tooltip|hidden|enableOnInit`（變更規則時同步更新遠端同步偵測與文檔）。
- `enableOnInit` 僅在「首次 activation」且未執行過才啟動一次；防重入靠 `_runOnceExecutedCommands`。
- 任何預設項目新增：同步調整 `getDefaultItems()` 與 `buildDefaultItems()`（SettingsPanel 尾端複本）。若要移除複製，需抽共用 util，但須保持 `import` 不形成循環。

## 3. Adaptive Polling & Sync 指示
- 變數：`_pollStableCount`, `_pollCurrentInterval`, `_itemsSignature`, `_lastSyncApplied`。
- 階梯：`[20s,45s,90s,180s,300s,600s]`；閾值：3 / 6 / 10 / 15 / 25。Panel 開啟時最大 90s。
- `backgroundPollOnce(context, noAdapt)`：偵測差異 → 重設 counter & interval & `_lastSyncApplied`；未變更且 `noAdapt` 為 true 不累積 stable count。
- `forceImmediatePoll(context, respectShortInterval)`：僅在目前 interval > 90s 才觸發；呼叫後重新排程。
- UI：`settings.html` 透過 `lastSyncAt` 映射；若新增更多同步指標，資料應由 bridge `hostRun.lastSyncInfo` 擴充，避免 Webview 做多源計算。

## 4. Bridge Namespace Contract
`statusBarHelper._bridge` payload: `{ ns, fn, args }`；回傳 `{ ok:true, data } | { ok:false, error }`。

核心 namespaces：
- `storage`：`get/set/remove/keys` for global|workspace，寫入前 `enforceStorage()` 尺寸檢查；任何調高限制需在安全策略敘述變更。
- `files`：限定 `globalStorageUri`/`storageUri`；`inside()` 阻擋絕對路徑與 `..`；大小限制：TEXT 10MB, JSON 10MB, BYTES 50MB。
- `vm`：`list()`、`isRunning(cmd)`；若將來新增 `stop(cmd)` 應直接復用 `abortByCommand`。
- `hostRun`：`start(cmd, code)`（settings panel trusted run）與 `lastSyncInfo()`；新增 host 只讀資訊時放此。
- `importExport`：`importPreview`、`exportPreview`、`applyImport`。所有 JSON 解析→先 `parseAndValidate()`，避免在 webview 層做未驗證邏輯。
- `scriptStore`：`catalog`（遠端優先 + 本地 fallback + 5 分鐘記憶體快取）、`install`（單一安裝/更新；保留 hidden/enableOnInit）、`bulkInstall`（批次原子安裝，失敗回滾）。

擴充規則：
1. 新增 namespace 必須： (a) switch 區塊內完整錯誤包裝；(b) 回傳結構統一；(c) 更新本檔案 Bridge 協定段落；(d) 不得回傳 host 端 `Error` 物件原樣（只抽 message）。
2. 變更既有函式簽章：同步修補 settings.html 所有呼叫點與聯動 type 定義（Monaco injected typedef）。

## 5. SettingsPanel State Machine
- 兩個 view：`list` / `edit`；狀態由 `_activeView` + `_editingItem` + Webview state (`vscode.setState`) 驗證。
- Webview 啟動流程：`_getHtmlForWebview()` 讀取 `settings.html` → 注入 CSP → `on loadState` message 包含：`items`, `activeView`, `editingItem`, `typeDefs`, `translations`, `lastSyncAt`。
- 重新整理/激活 panel：呼叫 `_sendStateToWebview()`；途中會 async 取 `lastSyncInfo` 再 postMessage（注意延遲 → 不可假設同步）。
- Smart Run (`runScriptTrusted`) 透過 bridge hostRun；非 trusted `runScript` 為獨立 Node child，不享有沙箱 API（只示範腳本片段）。
- 定期刷新：`sendRunningSetIntervalId` 每 1.5s 更新 VM 執行中清單（host 角度）。調整頻率需衡量 UI 與 CPU 負載。

## 6. Webview (settings.html) Protocol & UI
Message directions：
- Webview → Extension: commands (`updateSettings`, `getSettings`, `runScriptTrusted`, `stopByCommand`, `data:*`, `importSettings`, `applyImportSettings`, `restoreDefaults`, `vm:refresh`, etc.)；新增指令需：
  1) 在 `onDidReceiveMessage` switch 加 case。
  2) 更新此文件 + 若需 host 能回傳資料則封裝於 bridge 或直接回 message。
- Extension → Webview: `loadState`, `runLog`, `runDone`, `vm:setRunning`, `data:setRows`, `importPreviewData`, `importDone`, `themeChanged`；新增事件記得集中列舉，避免 magic string 散落。

UI 規則：
- Responsive：`COMPACT_BREAKPOINT = 860px`；<860 → body.compact：隱藏列表 tooltip、標題文字。<1100 → 隱藏 last sync 文字（只留 icon）。
- **Icon Interface**：所有操作按鈕採用 VS Code Codicons：Run/Stop/Edit/Delete/Save/Cancel，規格為 22-28px 含完整無障礙屬性。
- **Edit View Simplification**：編輯頁面僅保留四個核心欄位（圖示、標籤、工具提示、腳本），移除 tags 編輯功能。
- Running badge：host VM + panel VM union；任何更動 running 計算方式→同步修改 `getRunningSet()` 與徽章更新邏輯。
- Drag reorder：禁止拖放執行中的項目；排序完成後 `saveAndPostSettings()`（更新 host）。
- Edit split layout：維持 `splitRatio` state；折疊 output 時不重算 ratio 以利回復。
- Icon dropdown 浮層：定位使用 fixed + 重新定位 on resize/scroll；避免 Monaco 遮擋。

## 7. Security & Limits Recap (Core Scope)
- 僅允許 Node 內建模組進 VM；新增第三方需審視：代碼體積、攻擊面、是否破壞可攜性。
- I/O 僅經 Bridge；`files.*` 必須走 `inside()` 解析；禁止直接在 VM 使用 `fs` 寫入 extension 根目錄（目前 sandbox 提供 `fs` 但用者需自律—若未來加強可收窄）。
- 尺寸：KV 單鍵 2MB / KV 總量 200MB / JSON/Text 10MB / Binary 50MB；修改需同步文件與錯誤訊息文字、避免靜默差異。
- 避免在 Webview 放長輪詢：host 已有 background polling；如需主動刷新 sync 資訊 → 呼叫 `forceImmediatePoll()`（新增 hostRun API）。

## 8. Modification Checklist (PR 自查)
| 類型 | 檢查項 |
| ---- | ------ |
| VM API | 是否需要更新 Monaco typedef (sbhTypeDefs)？ |
| Bridge | 是否更新協定文檔 & error 包裝？ |
| Polling | 是否同步調整 `_calcAdaptiveInterval` 與文件描述？ |
| Signature | 變更 `computeItemsSignature()` 是否同步 UI / 同步邏輯？ |
| State 更新 | 修改 globalState 後是否呼叫 `updateStatusBarItems` + `_sendStateToWebview`？ |
| 新 UI 事件 | 有集中定義 & 避免硬字串？ |
| Icon 按鈕 | 新增操作按鈕是否採用 Codicons 並包含 title/aria-label？ |
| 編輯頁面 | 是否維持僅四個核心欄位（圖示、標籤、工具提示、腳本）？ |
| 安全限制 | 是否維持路徑與大小檢查？ |
| 多語系 | 新增 user-visible string 是否透過 `localize()` & 對應 nls 檔？ |
| 清理 | 新增計時器 / Disposable 是否在 VM 結束釋放？ |

## 9. Extension Points for Future
- Force Sync Button：在 webview 新增按鈕 → postMessage → host 端新增 case 呼叫 `forceImmediatePoll(context,false)` → 更新 lastSync UI。
- Script Debug Hooks：可在 `runScriptInVm` 中注入 `__sbhDebug`（受設定開關）記錄執行計時 / 記憶體；需確保不洩露 host 環境。
- Import/Export 增強：加入簽章 diff 顯示（hash 對比），在 `importPreview` 回傳 size/changed fields。
- Script Store Phase 2：ETag/If-None-Match；`scriptUrl` lazy fetch；token-level diff；搜尋 / tag 過濾 / 多選強化；來源指示（remote/local）。

## 10. Quick Reference (Do & Don't)
Do:
- 用 `saveAllToGlobal()` / `saveOneToGlobal()` 修改資料後立即同步 UI。
- 用 `abortByCommand()` 停止 VM；不要直接操作 `RUNTIMES`。
- 在新增橋接函式時回傳 `{ ok:true, data }`。
- 在 SettingsPanel 更新 items 後透過 `_refreshStatusBar` 指令刷新。

Don't:
- 在 Webview 直接假設同步資料即時性（取決於 polling）。
- 靜默忽略 Bridge 錯誤（至少 `console.warn`）。
- 在 `settings.html` 添加未經過濾的 user script 日誌到 DOM（已透過 `escapeHtml`）。

---
維護者：更新本檔後，可視情況在 `README` 或 `IMPLEMENTATION_SUMMARY.md` 加超連結；保持 root 下易被發現。
