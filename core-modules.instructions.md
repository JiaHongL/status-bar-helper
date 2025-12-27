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
LastMaintSync: 2025-12-27
Update Triggers:
1. Runtime VM 建立 / 中止流程或追蹤結構 (RUNTIMES / MESSAGE_*) 改動
2. Bridge namespace / 函式簽章 / 回傳格式有新增或修改
3. computeItemsSignature 欄位或 polling 階梯 / 閾值調整
4. Script Store cache TTL / 遠端 fetch 條件 / 安全 pattern 規則 / 安裝邏輯（預設值處理）變更
5. Webview message 指令或事件新增 / 改名
6. 安全與大小限制修改 (KV / JSON / TEXT / Binary / Script)
7. Typedef 注入機制或內容版本化策略調整
8. 前端模組化架構變更（Web Components / Vite / Monaco ESM）
9. 構建系統變更（Vite config / 複製腳本 / Monaco/Codicons 更新流程）
10. Explorer Action API 註冊/清理機制、Quick Pick UI 行為、或 context key 可見性邏輯改動
11. package.json menus when 條件變更或 compile/build 腳本流程調整
12. 項目刪除時 VM 清理流程或資源釋放機制改動
13. Packages API 目錄結構 / 受保護路徑 / VM require 支援變更
Change Log:
2025-12-27: Packages API directory structure (sbh.packages/), protected directories for clearAll.
2025-10-19: Script Store respects catalog defaults for hidden/enableOnInit; auto-stop VM on item deletion.
2025-10-05: Enhanced build process (clean before compile) and improved compile/build script dependencies.
2025-10-04: Added Explorer Action API (file explorer context menu integration).
2025-10-02: Added frontend modularization, Vite build system, Monaco ESM upgrade, Web Components architecture.
2025-08-16: Added scriptStore namespace description & update triggers block. Updated UI icon button specifications and edit view simplification.
-->

## 1. Runtime & VM Lifecycle (extension.ts)
- 每個腳本以 `runScriptInVm(context, command, code, origin)` 啟動，對應一個 `RuntimeCtx { abort, timers, disposables }` 存於 `RUNTIMES`。
- 任何重新啟動：先 `abortByCommand(cmd, { type:'replaced', ... })`，再建立新 VM。
- 中止（任何來源）必須清理：timers、disposables、`RUNTIMES`、`MESSAGE_HANDLERS`、`MESSAGE_QUEUES`（維持無殘留）。
- VM 中計時器與 `Disposable` 採 Proxy 攔截，自動追蹤；新增 API/功能時不可繞過這層。
- 禁止任意 `eval/new Function`；僅允許 Node 內建模組（`require.resolve(m) === m` 的情況）。新增模組白名單時需審視安全性。
- **TypeScript 類型定義**：`types/status-bar-helper/sbh.d.ts` 提供完整的 API 型別定義，VM 注入時必須與實際 bridge API 保持同步。
- **Explorer Action 清理**：VM abort 時自動清理該 VM 註冊的所有 explorerAction 選單，透過 `registeredMenus` Set 追蹤，無需手動呼叫 dispose。

### VM Messaging Bus
- `dispatchMessage(target, from, message)`：若目標尚無 handler → queue；第一個 handler 註冊時 flush。
- 新增/刪除 command 之 VM 時：同步維護 `RUNTIMES`/`MESSAGE_HANDLERS`/`MESSAGE_QUEUES`，保持 referential integrity。
- API 簽章（於 VM `sbh.v1.vm`）：`open(cmdId, payload?)`, `sendMessage(target, msg)`, `onMessage(handler) -> unsubscribe`, `stop()`, `stopByCommand(cmd?)`, `onStop(cb)`, `reason()`, `scripts()` (async)。
- **`scripts()` API**：回傳所有已註冊腳本的元數據 (command, text, tooltip)，用於動態腳本管理 (如 Script Launcher、指令面板整合)。僅回傳基本資訊，不暴露敏感欄位 (hidden, enableOnInit) 與腳本內容。
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
- `vm`：`list()`、`isRunning(cmd)`、`scripts()` (v1.10.4+)；若將來新增 `stop(cmd)` 應直接復用 `abortByCommand`。
- `hostRun`：`start(cmd, code)`（settings panel trusted run）與 `lastSyncInfo()`；新增 host 只讀資訊時放此。
- `importExport`：`importPreview`、`exportPreview`、`applyImport`。所有 JSON 解析→先 `parseAndValidate()`，避免在 webview 層做未驗證邏輯。
- `scriptStore`：`catalog`（遠端優先 + 本地 fallback + 5 分鐘記憶體快取）、`install`（單一安裝/更新；保留 hidden/enableOnInit）、`bulkInstall`（批次原子安裝，失敗回滾）。
  - **v1.11.1 安裝邏輯更新**：
    - CatalogEntry 新增 `hidden?: boolean` 和 `enableOnInit?: boolean` 欄位
    - normalize() 從 JSON 提取這些可選欄位
    - applyInstall() 首次安裝時優先使用 catalog 預設值（fallback 為 false），更新時保留使用者設定
  - **v1.11.1 刪除時 VM 清理**：
    - updateSettings：偵測被刪除項目並呼叫 `_abortByCommand`
    - uninstall：移除前先停止 VM
    - 確保無殭屍 VM 進程殘留
- `explorerAction`：`register(vmCommand, config)`（檔案總管右鍵選單動作註冊）。單一入口 + Quick Pick；VM abort 自動清理。
- `packages`：npm 套件管理。
  - **目錄結構**：`globalStorage/sbh.packages/`（根目錄）包含 `package.json`、`package-lock.json`、`node_modules/`（套件安裝位置）。
  - **API**：`dir`（回傳根目錄路徑）、`list`（列出已安裝套件）、`exists`（檢查套件存在）、`info`（取得套件資訊）、`install`（安裝套件）、`remove`（移除套件）。
  - **受保護目錄**：`sbh.packages/` 與 `backups/` 不受 `files.clearAll` 影響，確保套件與備份資料安全。
  - **VM require 支援**：sandbox 的 `require()` 自動從 `sbh.packages/node_modules/` 載入已安裝套件。

擴充規則：
1. 新增 namespace 必須： (a) switch 區塊內完整錯誤包裝；(b) 回傳結構統一；(c) 更新本檔案 Bridge 協定段落；(d) 不得回傳 host 端 `Error` 物件原樣（只抽 message）。
2. 變更既有函式簽章：同步修補 settings.html 所有呼叫點與聯動 type 定義（Monaco injected typedef）。

### Explorer Action Menu Visibility
- **選單可見性**：採用條件顯示策略，透過 `when: "hasRegistrations"` 控制。只有在有動作註冊時選單才顯示，避免空選單出現。
- **Context Key 管理**：`updateExplorerActionContext()` 在 `registerExplorerMenu()` 和 `disposeExplorerMenu()` 中自動更新 `hasRegistrations` 狀態。
- **初始化**：activate() 時呼叫 `updateExplorerActionContext()` 設定初始狀態為 false（無註冊）。

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
- **Edit View Simplification**：編輯頁面僅保留四個核心欄位（圖示、標籤、工具提示、腳本），移除 tags 編輯功能（tags 僅供 Script Store 與 Import/Export 使用）。
- Running badge：host VM + panel VM union；任何更動 running 計算方式→同步修改 `getRunningSet()` 與徽章更新邏輯。
- Drag reorder：禁止拖放執行中的項目；排序完成後 `saveAndPostSettings()`（更新 host）。
- Edit split layout：維持 `splitRatio` state；折疊 output 時不重算 ratio 以利回復。
- Icon dropdown 浮層：定位使用 fixed + 重新定位 on resize/scroll；避免 Monaco 遮擋。

## 7. Security & Limits Recap (Core Scope)
- 僅允許 Node 內建模組進 VM；新增第三方需審視：代碼體積、攻擊面、是否破壞可攜性。
- I/O 僅經 Bridge；`files.*` 必須走 `inside()` 解析；禁止直接在 VM 使用 `fs` 寫入 extension 根目錄（目前 sandbox 提供 `fs` 但用者需自律—若未來加強可收窄）。
- 尺寸：KV 單鍵 2MB / KV 總量 200MB / JSON/Text 10MB / Binary 50MB；修改需同步文件與錯誤訊息文字、避免靜默差異。
- 避免在 Webview 放長輪詢：host 已有 background polling；如需主動刷新 sync 資訊 → 呼叫 `forceImmediatePoll()`（新增 hostRun API）。
- **SecretStorage 安全規範**：機密資料僅限透過 `sbh.v1.secrets` API 存取，不得在腳本中硬編碼金鑰或密碼，所有機密操作需使用者確認。
- **SidebarManager 隔離**：側邊欄內容與主面板完全隔離，各自維護獨立的 webview 生命週期與訊息處理。
- **受保護目錄**：`files.clearAll` 會跳過 `sbh.packages/`（npm 套件）與 `backups/`（備份資料），確保重要資料不被意外清除。

## 8. UI Icon Interface & Edit View Standards
- **Icon Button Specifications**: All action buttons use VS Code Codicons with consistent sizing (24x24px for list view, 28x28px for edit page, 22x22px for Script Store).
- **Edit Page Simplification**: Edit interface maintains only four core fields: Icon, Label, Tooltip, Script (tags editing removed).
- **Diff Window UX**: Bottom button layout (Cancel/Update) replaces header buttons, providing standard confirmation dialog experience.
- **Script Store NEW Badge**: Dynamic badge on Script Store button shows count of new scripts with auto-loading on panel init.
- **Installation Confirmation**: Batch install displays detailed item confirmation dialog with multilingual support.
- **Modern Color System**: Gradient backgrounds and theme-adaptive status badges for enhanced visual hierarchy.
- **Status Sorting**: Script Store entries sorted by priority: New > Update > Installed.
- **Accessibility**: All icon buttons include complete `title` and `aria-label` attributes.
- **Explorer Action Menu**: Permanently visible in explorer context menu (group `2_workspace@1`), no dynamic visibility control.
- **Internationalization**: All UI text uses `t()` function with corresponding nls file entries.

## 9. Smart Backup & SidebarManager Integration
- **Smart Backup Manager**: 智慧型定時備份採用變更偵測機制，6小時最小間隔，僅在實際變更時執行備份，避免重複備份造成儲存負擔。
- **Backup Signature**: 使用與同步相同的 `computeItemsSignature` 進行變更偵測，確保備份觸發條件與遠端同步一致。
- **SidebarManager Lifecycle**: 獨立的 webview 生命週期管理，支援 `open/close/replace` 操作，自動處理 onClose 回調與防抖機制。
- **Sidebar API Integration**: 透過 `sbh.v1.sidebar` 提供腳本中的側邊欄控制能力，支援 HTML 內容載入與聚焦控制。
- **SecretStorage Bridge**: `sbh.v1.secrets` API 提供安全的機密儲存功能，所有操作需使用者確認，避免腳本直接存取敏感資料。

---

## 9. Modification Checklist (PR 自查)
| 類型 | 檢查項 |
| ---- | ------ |
| VM API | 是否需要更新 Monaco typedef (sbhTypeDefs)？ |
| Bridge | 是否更新協定文檔 & error 包裝？ |
| Polling | 是否同步調整 `_calcAdaptiveInterval` 與文件描述？ |
| Signature | 變更 `computeItemsSignature()` 是否同步 UI / 同步邏輯？ |
| State 更新 | 修改 globalState 後是否呼叫 `updateStatusBarItems` + `_sendStateToWebview`？ |
| 新 UI 事件 | 有集中定義 & 避免硬字串？ |
| VM 清理 | 刪除項目時是否正確停止其 VM？ |
| Explorer Action | 新增動作是否透過 `sbh.v1.explorerAction.register()` 並正確清理？ |
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
- 直接在組件間共享全域變數（改用 CustomEvent 通訊）。
- 硬編碼 UI 文字（必須透過 `i18n-helper.js` 的 `t()` 函式）。
- 在 Web Component 中使用 Shadow DOM 造成樣式隔離問題（目前專案不使用 Shadow DOM）。

## 11. Frontend Modularization Architecture (v1.8.x)

### Web Components Structure
前端採用 Web Components 標準實現模組化，每個主要 UI 區塊封裝為獨立自訂元素：

**Components Directory** (`media/components/`):
- `list-view.js`: 狀態列項目列表 (`<list-view>`)
- `edit-page.js`: 項目編輯頁面 (`<edit-page>`)
- `script-store.js`: 腳本商店 (`<script-store>`)
- `import-dialog.js`: 匯入對話框 (`<import-dialog>`)
- `export-dialog.js`: 匯出對話框 (`<export-dialog>`)
- `backup-manager.js`: 備份管理 (`<backup-manager>`)
- `data-view.js`: 儲存資料檢視 (`<data-view>`)
- `monaco-editor.js`: Monaco 編輯器包裝 (`<monaco-editor>`)
- `confirmation-dialog.js`: 確認對話框 (`<confirmation-dialog>`)

**Component Lifecycle**:
- `connectedCallback()`: 組件插入 DOM 時初始化
- `disconnectedCallback()`: 組件移除時清理資源
- 事件驅動通訊：使用 `CustomEvent` 向上傳遞訊息
- 屬性監聽：透過 `attributeChangedCallback()` 響應屬性變更

### CSS Modularization
**Styles Directory** (`media/styles/`):
- `base.css`: CSS 變數定義（顏色、間距、字型）、重置樣式
- `layout.css`: 頁面佈局、容器、grid/flexbox 規則
- `components.css`: 共用組件樣式（按鈕、對話框、表單元素）
- `list-view.css`: 列表檢視專用樣式
- `edit-page.css`: 編輯頁面專用樣式
- `codicon.css` + `codicon.ttf`: VS Code Codicons 字型與樣式

**CSS Variables Convention**:
- `--vscode-*`: 使用 VS Code 主題變數確保一致性
- `--sbh-*`: 專案自訂變數（避免與 VS Code 變數衝突）

### Vite Build System
**Configuration** (`vite.config.ts`):
- **Input**: `media-src/main.ts` (TypeScript 源碼)
- **Output**: `media/main.js` (ESM bundle)
- **Mode**: 生產構建（`npm run build:frontend`）
- **Features**: TypeScript 轉譯、Tree shaking、最小化

**Build Commands**:
```bash
npm run compile          # TypeScript (tsc) + 複製資源 (fs.cp)
npm run build:frontend   # Vite 構建前端 (可選)
npm run watch           # TypeScript watch mode
npm run build           # vsce package
```

**File Copy Script** (`scripts/copy-files.mjs`):
- 替代原本的 `cpx` 依賴
- 使用 Node.js 原生 `fs.cp` API
- 複製 `types/` 與 `media/nls*.json` 至 `out/`

### Monaco Editor ESM Integration

**Monaco 0.53.0 Upgrade**:
- 切換至 ESM 版本 (`monaco-editor/esm/vs/editor/editor.api`)
- 動態載入器 (`media/utils/monaco-loader.js`)
- Web Component 包裝 (`media/components/monaco-editor.js`)

**Webview Copy/Paste Fix**:
- 修復 Monaco 0.53 在 webview CSP 限制下的複製/貼上問題
- 實作自訂剪貼簿處理邏輯
- 保持 VS Code 主題一致性

**TypeScript Definitions Injection**:
- `settings.html` 動態注入 `sbh.d.ts` 內容
- 提供完整的 API IntelliSense
- 與 Bridge API 保持同步

**Monaco Update Script** (`scripts/update-monaco.mjs`):
- 自動更新 Monaco Editor 版本
- 驗證 ESM 模組可用性
- 更新構建配置

### Codicons Management

**Update Script** (`scripts/update-codicons.mjs`):
- 自動下載最新 Codicons 字型與 CSS
- 驗證字型檔案完整性
- 版本化管理

**Icon List Generator** (`scripts/generate-codicon-list.mjs`):
- 解析 `codicon.css` 生成可用圖示清單
- 供前端圖示選擇器使用
- 支援搜尋與過濾

### Internationalization (i18n)

**i18n Helper** (`media/utils/i18n-helper.js`):
- **API**: `t(key, fallback?)` - 取得翻譯字串
- **API**: `setLanguage(locale)` - 切換語言
- **Files**: `media/nls.en.json`, `media/nls.zh-tw.json`
- **Integration**: 所有組件透過 `t()` 存取翻譯

**NLS Checker** (`tools/check-nls.mjs`):
- 驗證所有語言檔案的 key 完整性
- 偵測缺失或多餘的翻譯 key
- CI/CD 整合準備

**Usage Pattern**:
```javascript
import { t } from './utils/i18n-helper.js';
element.textContent = t('key.path', 'Default Text');
```

### Development Workflow

**Adding New Component**:
1. 建立 `media/components/my-component.js`
2. 實作 `customElements.define('my-component', MyComponent)`
3. 新增對應 CSS（若需要）
4. 在 `media/nls.*.json` 新增翻譯 key
5. 執行 `npm run check-nls` 驗證
6. 在 `settings.html` 中使用 `<my-component>`

**Styling Guidelines**:
- 優先使用 `--vscode-*` 變數確保主題一致性
- 新增專案自訂變數時使用 `--sbh-` 前綴
- 避免硬編碼顏色值
- 使用相對單位（rem, em）而非絕對像素

**Testing in Webview**:
1. 修改組件程式碼
2. 執行 `npm run compile`（或 watch mode）
3. 在 VS Code 中開啟 Status Bar Helper 設定面板
4. 使用 F12 開啟 DevTools 測試互動
5. 檢查 Console 中的錯誤訊息

### Migration Notes (Phase 1-8)

**Completed Migrations**:
- ✅ Phase 1: CSS 模組化（分離變數、佈局、組件樣式）
- ✅ Phase 2: 多國語系工具化（i18n-helper + NLS checker）
- ✅ Phase 3: Confirmation Dialog 組件化
- ✅ Phase 4-5: Import/Export 對話框組件化
- ✅ Phase 6: Backup Manager 組件化
- ✅ Phase 7: Script Store 組件化
- ✅ Phase 8: Data View 與 List View 組件化

**Architecture Benefits**:
- 組件可重用性提升
- 責任分離更清晰
- 維護成本降低
- 測試隔離性改善
- 國際化統一管理

### Future Enhancements

**Planned Improvements**:
- Vite watch mode 整合（目前使用 tsc watch）
- Web Component 單元測試框架
- Monaco Editor 更豐富的 IntelliSense 提示

## 11. Explorer Action API (Context Menu Integration)
- **設計原則**：單一入口點 + Quick Pick 選單，避免選單爆炸；支援 Codicons；VM 停止自動清理。
- **註冊流程**：`sbh.v1.explorerAction.register({ description, handler })` → 回傳 `{ dispose(), onDispose(cb) }`。
- **Context 結構**：`{ uri?: vscode.Uri, uris?: vscode.Uri[] }` - 支援單選與多選檔案。
- **Cleanup**：每個 VM 透過 `registeredMenus: Set<string>` 追蹤其註冊的 menuIds；abort signal listener 自動批次清理。
- **Quick Pick**：`statusBarHelper.explorerAction` 指令顯示所有已註冊動作；無註冊時顯示友善訊息（`explorerAction.noRegistrations`）。
- **NLS Keys**：`explorerAction.noRegistrations`（無動作註冊）、`explorerAction.selectAction`（選擇動作提示）。
- **Package.json**：
  - Command：`statusBarHelper.explorerAction` with title `%cmd.explorerAction.title%`
  - Menu：`explorer/context` group `2_workspace@1` with `"when": "hasRegistrations"`
  - Visibility：條件顯示，只有在 `hasRegistrations` 為 true 時才顯示選單
- **Context Key 更新**：透過 `updateExplorerActionContext()` 在註冊/移除時自動更新 `hasRegistrations` 狀態。
- **限制**：僅限檔案系統 URI；handler 內錯誤會捕捉並顯示 VS Code 錯誤訊息。
- Codicons 圖示選擇器 UI 改進
- i18n 熱重載（開發模式）
- CSS-in-JS 考量（可選）

---
維護者：更新本檔後，可視情況在 `README` 或 `IMPLEMENTATION_SUMMARY.md` 加超連結；保持 root 下易被發現。
