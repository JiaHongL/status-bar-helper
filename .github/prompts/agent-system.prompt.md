# Task: 專案 System Agent Prompt（長期指令集）

<!--
Maintenance Notes
LastMaintSync: 2025-10-19
Update Triggers:
1. 核心不變量（signature / polling / storage limits / sandbox 規則）調整
2. Bridge namespaces / 函式新增、移除、簽章修改
3. Script Store 行為（remote-first / cache TTL / 安全 pattern / 安裝邏輯）變更
4. 回應結構（10 個 section）或最終 checklist 欄位新增/刪除
5. Import/Export 策略（Replace/Append / ConflictPolicy）或 parse 驗證流程改動
6. Typedef 注入或 webview message 協定新增事件
7. Explorer Action API 註冊/清理流程或 Quick Pick UI 行為變更
8. 項目刪除時 VM 清理流程或資源釋放機制改動
Change Log:
2025-10-19: Script Store catalog defaults; auto-stop VM on deletion.
2025-10-04: Added Explorer Action API constraints and checklist items.
2025-08-16: Added maintenance triggers block for synchronization with other instruction docs.
-->

Context: #project @workspace
Goal:
- 為本 repo 所有後續 AI / Agent 操作提供統一的系統級規範（非單次任務）。
- 確保修改：符合 VM 沙箱安全、Bridge 協定、同步輪詢策略、globalState 單一來源與 UI 響應式規則。

Constraints:
- 嚴禁破壞：
  - 單一資料來源：globalState (manifest + itemsMap) → 任何 CRUD 後需 refresh status bar + （若面板開啟）同步 `_sendStateToWebview()`。
  - VM 沙箱：僅 Node 內建模組；`runScriptInVm` 追蹤 timers / `Disposable`；`abortByCommand` 必清除 RUNTIMES + message handlers/queues。
  - Messaging Bus：`sendMessage` / `onMessage` / `open` / `scripts()`，未註冊 handler 先排隊；VM 結束清理隊列。**`vm.scripts()` API (v1.10.4+)** 回傳所有已註冊腳本元數據 `Promise<Array<{command, text, tooltip}>>`，用於動態腳本管理（Script Launcher、指令面板整合），僅回傳基本資訊，不暴露敏感欄位與腳本內容。
  - Signature: `command|scriptHash|text|tooltip|hidden|enableOnInit`；變更需同步所有 diff / polling / docs。
  - Adaptive Polling：階梯 20s→45s→90s→180s→300s→600s；穩定閾值 3/6/10/15/25；面板開啟封頂 90s；`forceImmediatePoll` 僅在 interval >90s 時生效。
  - Import/Export：走 `importExport` bridge；`parseAndValidate`；Replace/Append + Skip/NewId；未知欄位保留。
  - 安全限制：KV 單鍵 2MB / 總量 200MB / JSON/TEXT 10MB / Binary 50MB；路徑禁止絕對及 `..` → 必經 `inside()`。
  - Bridge 回傳格式：`{ ok:true, data }` / `{ ok:false, error }`；不可丟未過濾 Error。
  - Monaco typedef（`settings.html` 注入）需與新增/修改的 VM / Bridge API 同步。
  - UI：<1100px 隱藏 last sync 文案；<860px `body.compact`；Running badge = host VM union；拖曳禁止執行中項目。**所有操作按鈕採用 VS Code Codicons（列表 24x24px，編輯頁 28x28px，Script Store 22x22px）。編輯頁面僅保留四個核心欄位（圖示、標籤、工具提示、腳本）。Diff 視窗採用底部按鈕佈局（取消/更新）**。
  - `enableOnInit` 僅首次 activation 執行一次（靠 `_runOnceExecutedCommands`）。
  - Script Store NEW 徽章系統：自動載入 catalog 並顯示新腳本計數徽章；狀態排序：新增 > 可更新 > 已安裝；批次安裝原子回滾；現代化色彩系統與主題適配。
  - **SecretStorage 安全**：機密資料僅透過 `sbh.v1.secrets` API 存取，所有操作需使用者確認，禁止硬編碼敏感資料。
  - **Smart Backup 智慧備份**：採用變更偵測機制，6小時最小間隔，僅在實際變更時執行備份，與同步共用 signature。
  - **SidebarManager 管理**：獨立 webview 生命週期，支援 HTML 載入、聚焦控制、替換防抖，透過 `sbh.v1.sidebar` API 控制。
  - **TypeScript 完整支援**：`types/status-bar-helper/sbh.d.ts` 提供完整 API 定義，VM 注入時必須與 bridge 同步。
  - **Explorer Action API**：單一入口 (`statusBarHelper.explorerAction`) + Quick Pick；`register()` 回傳 handle；VM abort 自動清理；永久顯示（無動態 visibility）。
  - **Script Store 安裝邏輯 (v1.11.1+)**：
    - CatalogEntry 包含 hidden/enableOnInit 可選欄位
    - 首次安裝使用 catalog 預設值（未定義則 false），更新時保留使用者設定
  - **刪除時 VM 清理 (v1.11.1+)**：updateSettings 與 uninstall 必須偵測並停止被刪除項目的 VM
- 不得：提升限制/引入第三方模組/繞過橋接直接存取檔案或 VS Code 物件。

Reference Files:
- `src/extension.ts`（Runtime + Bridge + Polling + Import/Export host + SecretStorage + Smart Backup）
- `src/SettingsPanel.ts`（Panel 控制器 / webview message handling / smart run）
- `src/SidebarManager.ts`（側邊欄管理 / 獨立 webview 生命週期）
- `src/SmartBackupManager.ts`（智慧備份 / 變更偵測 / 間隔調整）
- `src/secretKeyManager.ts`（機密儲存管理 / 使用者確認機制）
- `media/settings.html`（UI + Monaco + typedef + message 協定）
- `types/status-bar-helper/sbh.d.ts`（完整 TypeScript API 定義）
- `core-modules.instructions.md`（核心契約與檢查表）

Expected Answer Structure (任何功能/修改請遵循)：
1. Requirements: 梳理原始需求 + 推斷假設（若必要）
2. Impacted Areas: Runtime / Bridge / Panel TS / Webview HTML/JS / globalState / typedef / nls / tests
3. Plan (最小可行)：分步 + 檔案 + 目的
4. Contract Changes: 新/改 API、事件、訊息格式
5. Safety & Invariants: 對每一條不變量標註 保持 / 需調整（含處理方式）
6. Patch Preview: 要改的函式/區塊（描述即可，提交時用 diff）
7. Testing: 手動步驟 + 邊界案例（空清單 / 重複 command / 大腳本 / polling 行為 / import 衝突）
8. Risks & Rollback: 觸發訊號、回滾動作
9. Optional Follow-ups: ≤3 條
10. Checklist (勾選)：
   - [ ] globalState 單一來源維持
   - [ ] Signature 規則同步/未變或已更新全部使用處
   - [ ] Bridge API & error 格式一致
   - [ ] VM 清理邏輯完整（timers/Disposable/message queues）
   - [ ] 大小/路徑限制未突破
   - [ ] typedef 已同步
   - [ ] UI 響應式/Running badge 規則未破壞
   - [ ] 新增字串使用 `localize`
   - [ ] Import/Export 欄位順序 + 未知欄位保留
   - [ ] Explorer Action 自動清理邏輯完整（VM abort listener）
   - [ ] 刪除項目時正確停止其 VM（updateSettings / uninstall）

If Request Is Trivial:
- 仍回覆是否觸及不變量；未觸及 → 註記 `(core invariants unaffected)`。

Rejection Criteria:
- 需求要求突破沙箱 / 放寬限制且無配套 / 直接操作內部 Map/Set。

Tone:
- 精準、工程化、繁體中文；無多餘客套；必要即給 Diff；避免空泛敘述。

Return only relevant content；不要重複貼未更動指引。
