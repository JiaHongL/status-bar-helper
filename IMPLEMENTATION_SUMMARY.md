# Status Bar Helper - 完整功能實作總覽 ✅

## 🎯 專案概述

Status Bar Helper 是一個功能豐富的 VS Code 擴充套件，提供自訂狀態列按鈕、腳本執行環境、智慧備份、機密管理等完整功能。版本已發展至 **v1.8.13**，具備企業級的安全性與穩定性，並採用現代化的前端模組化架構。

## 🔄 最新功能（v1.5.0 - v1.8.13）

### v1.8.13 - 前端模組化重構完成

- ✅ **前端模組化架構**：完整的 Web Components 化重構（Phase 1-8）
- ✅ **CSS 模組化**：分離為 base.css、layout.css、components.css 等模組
- ✅ **Web Components**：List View、Edit Page、Script Store、Import/Export、Backup Manager、Data View 全面組件化
- ✅ **多國語系工具**：i18n-helper.js 統一語系管理，NLS 檢查工具確保翻譯完整性
- ✅ **技術升級**：Monaco Editor 0.53 (ESM)、Codicons 更新機制、Node.js v22 類型支援
- ✅ **Vite 構建系統**：新增現代化前端構建工具鏈
- ✅ **範例改善**：更新預設腳本範例與多語言提示文件
- ✅ **Bug 修復**：VM 資源釋放、Monaco 複製/貼上功能、Windows 備份 ID 等問題修復

### v1.7.4 - 程式碼範例優化

- ✅ 修正範例程式碼的錯誤與不一致問題
- ✅ 改善腳本執行的穩定性

### v1.7.2 - TypeScript 類型定義完整化

- ✅ **完整 TypeScript 支援**：新增 `types/status-bar-helper/sbh.d.ts` 提供完整的 API 類型定義
- ✅ **範例腳本擴充**：Script Store 新增更多實用範例
- ✅ **資料清理改善**：優化儲存資料的清理與管理功能
- ✅ **執行狀態優化**：改善腳本執行狀態的即時更新

### v1.7.0 - 機密儲存功能

- ✅ **SecretStorage API**：新增 `sbh.v1.secrets` 安全機密儲存功能
- ✅ **使用者確認機制**：所有機密操作需使用者明確確認
- ✅ **Script Store 範例**：新增機密管理相關的範例腳本
- ✅ **安全性增強**：避免腳本中硬編碼敏感資料

### v1.6.0 - 側邊欄管理系統

- ✅ **SidebarManager**：完整的側邊欄管理功能，支援 HTML 內容載入
- ✅ **生命週期管理**：自動處理 open/close/replace 操作與回調機制
- ✅ **API 整合**：透過 `sbh.v1.sidebar` 提供腳本中的側邊欄控制
- ✅ **聚焦控制**：支援靜默載入與主動聚焦顯示模式

### v1.5.0 - 智慧型定時備份

- ✅ **Smart Backup Manager**：智慧型定時備份系統，採用變更偵測機制
- ✅ **動態間隔調整**：根據變更頻率自動調整備份間隔（最小 6 小時）
- ✅ **原子性操作**：確保備份過程的完整性與一致性
- ✅ **儲存最佳化**：僅在實際變更時執行備份，避免重複備份

## 🏗️ 技術架構總覽

### 核心模組架構

```text
Extension Host (extension.ts)
├── Runtime & VM Management
│   ├── Script Execution (Node.js VM Sandbox)
│   ├── Message Bus (VM ↔ Host Communication)
│   └── TypeScript Definitions (sbh.d.ts)
├── Settings Panel (SettingsPanel.ts)
│   ├── Webview Management
│   ├── Monaco Editor Integration
│   └── State Synchronization
├── Sidebar Manager (SidebarManager.ts)
│   ├── Independent Webview Lifecycle
│   ├── HTML Content Management
│   └── Focus & Close Callbacks
├── Smart Backup Manager (SmartBackupManager.ts)
│   ├── Change Detection Signature
│   ├── Dynamic Interval Adjustment
│   └── Atomic Backup Operations
└── Bridge APIs
    ├── Storage (Global/Workspace)
    ├── File Operations (Text/JSON/Binary)
    ├── Secret Storage (Secure Credentials)
    └── Sidebar Control (Open/Close/Replace)

Frontend Architecture (media/)
├── Web Components (components/)
│   ├── list-view.js - 項目列表組件
│   ├── edit-page.js - 編輯頁面組件
│   ├── script-store.js - 腳本商店組件
│   ├── import-dialog.js - 匯入對話框
│   ├── export-dialog.js - 匯出對話框
│   ├── backup-manager.js - 備份管理組件
│   ├── data-view.js - 資料檢視組件
│   ├── monaco-editor.js - Monaco 編輯器包裝
│   └── confirmation-dialog.js - 確認對話框
├── Utilities (utils/)
│   ├── i18n-helper.js - 國際化工具
│   ├── monaco-loader.js - Monaco 動態載入
│   └── vscode-icons.js - 圖示工具
├── Styles (styles/)
│   ├── base.css - 基礎變數與重置
│   ├── layout.css - 版面配置
│   ├── components.css - 組件樣式
│   ├── list-view.css - 列表檢視樣式
│   └── edit-page.css - 編輯頁面樣式
└── Build System
    ├── Vite - 現代化前端構建
    ├── TypeScript (media-src/) - 類型安全開發
    └── ESM Monaco Editor - 模組化編輯器
```

### API 生態系統

- **v1.8.x**: 前端模組化重構、Monaco ESM、Vite 構建系統、Node.js v22 支援
- **v1.7.x**: 完整的 TypeScript 支援與機密儲存
- **v1.6.x**: 側邊欄管理與擴展 API 整合
- **v1.5.x**: 智慧備份與企業級資料保護
- **向後相容**: 所有 API 變更均維持向後相容性

## 🎨 前端模組化重構（v1.8.x）

### Phase 1-8 完整實作

#### Phase 1: CSS 模組化

- ✅ 分離 base.css（變數與重置）、layout.css（版面配置）
- ✅ 建立 components.css、list-view.css、edit-page.css
- ✅ Codicons 字型與樣式獨立管理

#### Phase 2: 多國語系模組化

- ✅ 建立 `media/utils/i18n-helper.js` 統一語系管理
- ✅ 所有組件透過 `t(key)` 存取翻譯
- ✅ NLS 檢查工具 (`tools/check-nls.mjs`) 確保翻譯完整性
- ✅ 修正語系覆蓋與衝突問題

#### Phase 3: Confirmation System

- ✅ `confirmation-dialog.js` Web Component
- ✅ 非阻塞式確認對話框，Promise-based API
- ✅ 支援標題、訊息、主要/次要按鈕自訂

#### Phase 4: Import Dialog

- ✅ `import-dialog.js` Web Component
- ✅ 封裝預覽、選擇、套用邏輯
- ✅ 支援 Replace/Append 與 Skip/NewId 策略

#### Phase 5: Export Dialog

- ✅ `export-dialog.js` Web Component
- ✅ 項目選擇、JSON 預覽、複製/儲存功能
- ✅ 完整的國際化支援

#### Phase 6: Backup Manager

- ✅ `backup-manager.js` Web Component
- ✅ 備份列表、還原、刪除功能
- ✅ 自動/手動備份整合

#### Phase 7: Script Store

- ✅ `script-store.js` Web Component
- ✅ Catalog 載入、安裝、更新、差異檢視
- ✅ NEW 徽章系統與批次安裝

#### Phase 8: Data View

- ✅ `data-view.js` Web Component
- ✅ 儲存資料檢視與管理
- ✅ Global/Workspace 範圍切換

### 技術特色

#### Web Components 架構

- 自訂元素封裝 (`<list-view>`, `<edit-page>`, 等)
- Shadow DOM 隔離（選擇性使用）
- 生命週期管理 (connectedCallback, disconnectedCallback)
- 事件驅動通訊

#### Monaco Editor 升級

- Monaco 0.53.0 ESM 版本
- 動態載入機制 (`monaco-loader.js`)
- 修復 webview 複製/貼上問題
- TypeScript 定義同步注入

#### Codicons 管理

- 自動更新腳本 (`scripts/update-codicons.mjs`)
- 圖示清單產生工具
- 版本化字型與 CSS 管理

#### Vite 構建系統

- `media-src/` TypeScript 源碼
- `vite.config.ts` 構建配置
- ESM 輸出至 `media/main.js`
- 開發模式與生產優化

### 構建流程

```bash
# 開發模式
npm run compile      # TypeScript (tsc) + 複製資源
npm run watch        # 監看模式編譯

# 前端構建（可選）
npm run build:frontend  # Vite 構建 media-src

# 打包發布
npm run build        # vsce package
```

## 🎨 UI 圖示化升級

### 1. 全面按鈕圖示轉換

- ✅ **列表檢視**: Run/Stop/Edit/Delete 按鈕改用 VS Code Codicons
- ✅ **Script Store**: View/Install/Update/Remove 按鈕轉換為圖示格式
- ✅ **編輯頁面**: Run/Stop/Save/Cancel 按鈕採用圖示設計  
- ✅ **儲存資料**: Delete 按鈕轉換為垃圾桶圖示
- ✅ **重新整理按鈕**: 轉換為圖示格式並右對齊

### 2. 版面配置最佳化

- ✅ 表格行高一致性修復 (34px)
- ✅ 按鈕對齊與間距統一
- ✅ 操作欄寬度針對雙圖示佈局最佳化 (60px)
- ✅ 響應式設計保持

### 3. Script Store 增強

- ✅ 更新確認對話框，包含差異預覽
- ✅ 視覺指示器（有差異時 View 圖示顏色變化）
- ✅ 完整國際化支援（更新確認、預覽對話框）
- ✅ **狀態排序**: 新增 > 可更新 > 已安裝 的優先順序
- ✅ **Diff 視窗 UX 重新設計**: 底部按鈕佈局，移除標題列更新按鈕
- ✅ **NEW 徽章指示器**: Script Store 按鈕顯示新腳本數量的動態徽章
- ✅ **安裝確認對話框**: 批次安裝前顯示詳細清單確認
- ✅ **現代化色彩系統**: 漸層背景與主題適配的狀態徽章

## 🔄 Diff 視窗 UX 重新設計

### 1. 底部按鈕區域

- ✅ **移除標題列更新按鈕**: 消除令人困惑的上方按鈕配置
- ✅ **新增底部操作區域**: 類似標準確認對話框的佈局
- ✅ **取消/更新按鈕**: 位於視窗底部，提供更直觀的操作流程
- ✅ **多國語系支援**: 確保所有按鈕正確顯示本地化文字

### 2. 使用者體驗改善

- ✅ **一致的對話框體驗**: Diff 視窗現在感覺像整合的確認對話框
- ✅ **消除同時跳出視窗問題**: 不再有 diff 視窗和提示視窗同時出現的困擾
- ✅ **更好的決策流程**: 使用者可以完整檢視差異後在底部做決定

## ✂️ 編輯頁面簡化

### 1. Tags 欄位移除

- ✅ 完全移除編輯頁面的 Tags 輸入欄位
- ✅ 移除相關的 JavaScript 處理邏輯
- ✅ 清理不必要的 CSS 規則
- ✅ 保留列表檢視和 Script Store 中的 tags 顯示

### 2. 專注核心功能

- ✅ 簡化編輯介面為四個核心欄位：圖示、標籤、工具提示、腳本
- ✅ 圖示化操作按鈕提供更直觀的操作體驗
- ✅ 移除變更偵測中的 tags 比較邏輯

## 🔧 技術改進

### 無障礙功能維持

- ✅ 所有圖示按鈕保持完整的 `title` 和 `aria-label` 屬性
- ✅ 鍵盤導航支援
- ✅ 螢幕閱讀器相容性

### CSS 最佳化

- ✅ 統一的圖示按鈕樣式 (22-28px)
- ✅ 一致的懸停效果和狀態指示
- ✅ 深淺色主題完全支援

### JavaScript 清理

- ✅ 移除 tags 相關的事件監聽器
- ✅ 簡化儲存邏輯，移除 tags 處理
- ✅ 清理變更偵測函數

---

## 進階匯入/匯出功能實作完成 ✅

### 🎯 功能概覽

這次成功實作了完整的**進階匯入/匯出功能**，為 Status Bar Helper 擴充套件提供強大的設定管理能力。

## 📦 實作內容

### 1. 核心邏輯 (`src/utils/importExport.ts`)

- ✅ `parseAndValidate` - 嚴格 JSON 解析與驗證
- ✅ `estimateSize` - 資料大小估算
- ✅ `diff` - 項目差異比較
- ✅ `applyImport` - 智慧合併與衝突處理
- ✅ `exportSelection` - 選擇性匯出

### 2. 後端橋接 (`src/extension.ts`)

- ✅ `importPreview` - 匯入預覽與驗證
- ✅ `exportPreview` - 匯出預覽與 JSON 產生
- ✅ `applyImport` - 實際套用匯入操作
- ✅ `loadImportFile` - 檔案載入橋接
- ✅ `saveExportToFile` - 檔案儲存橋接

### 3. 前端介面 (`media/settings.html`)

- ✅ 模態對話框設計 (響應式、深淺色主題)
- ✅ 分頁式介面 (匯入/匯出)
- ✅ 預覽表格 (checkbox 第一欄、狀態顯示)
- ✅ 合併策略選擇 (Replace/Append)
- ✅ 衝突處理機制 (Skip/NewId)
- ✅ 檔案載入/儲存功能
- ✅ 剪貼簿操作支援

### 4. 後端訊息處理 (`src/SettingsPanel.ts`)

- ✅ 新增所有 Import/Export 相關訊息處理器
- ✅ 錯誤處理與使用者回饋
- ✅ 自動重新整理狀態列
- ✅ 檔案對話框整合

### 5. 多語系支援

- ✅ 繁體中文翻譯 (`media/nls.zh-tw.json`)
- ✅ 英文翻譯 (`media/nls.en.json`)
- ✅ 動態語言切換支援

## 🔧 技術特色

### 欄位保留與順序

- 嚴格維持 JSON 欄位順序
- 保留未知欄位不遺失
- 型別安全的驗證機制

### 智慧衝突處理

- **Replace** 模式：清除現有項目後匯入
- **Append** 模式：附加到現有項目
- **Skip** 策略：跳過衝突項目
- **NewId** 策略：產生新的命令 ID

### 預覽與安全

- 匯入前完整預覽變更
- 狀態標示：新增/已存在/衝突/跳過
- 選擇性套用功能
- 完整錯誤處理

### 使用者體驗

- 響應式設計適應各種螢幕
- 深淺色主題自動適應
- 直觀的操作流程
- 即時回饋與狀態更新

## 🎨 UI/UX 設計

### 模態對話框

- 置中彈出設計
- 最大寬度 1000px，高度 90%
- 關閉按鈕與點擊外部關閉

### 分頁設計

- 匯入/匯出分頁切換
- 清楚的視覺分隔
- 活動狀態指示

### 預覽表格

- checkbox 作為第一欄
- 顯示必要欄位：text、command、tooltip、size、status、reason
- 懸停效果與選擇狀態

### 操作按鈕

- 明確的操作流程引導
- 禁用狀態防止誤操作
- 視覺回饋與載入狀態

## 📋 使用流程

### 匯入流程

1. 點擊「Advanced I/E」按鈕
2. 切換到「匯入」分頁
3. 貼上 JSON 或載入檔案
4. 選擇合併策略與衝突處理
5. 點擊「預覽變更」
6. 檢視預覽表格並選擇項目
7. 點擊「套用匯入」完成

### 匯出流程

1. 點擊「Advanced I/E」按鈕
2. 切換到「匯出」分頁
3. 選擇要匯出的項目
4. 點擊「產生 JSON」
5. 複製到剪貼簿或儲存檔案

## 🧪 測試狀態

- ✅ 核心邏輯編譯無錯誤
- ✅ TypeScript 型別檢查通過
- ✅ 模組載入測試成功
- ✅ 匯出功能驗證完成
- 🔄 完整整合測試進行中

## 🚀 下一步

功能已完整實作，可以：

1. 在 VS Code 中測試擴充套件
2. 驗證所有操作流程
3. 收集使用者回饋
4. 準備發布新版本

---

**實作完成日期：** 2025年08月15日  
**主要開發者：** GitHub Copilot  
**功能狀態：** ✅ 完成並可用

---

## Script Store Phase 1 & Enhancements (Aug 2025)

### Phase 1 初版

- 本地 catalog 來源：`media/script-store.defaults.<locale>.json`
- 狀態計算：installed / update / new（以 command + scriptHash + text/tooltip/tags 比對）
- 單項安裝與（初版）批次安裝
- 橋接：`scriptStore.catalog`、`install`、`bulkInstall`、`diff`（後端差異資料）

### 強化（2025-08）

- 批次安裝改為原子操作（失敗自動回滾 snapshot）
- 新增 `diff` 後端：提供 before/after（script/text/tooltip/tags）
- Webview Script Store Modal：
  - 加入右側 Diff Pane（欄位級變更標示 + Script side-by-side 簡易行差異）
  - 400 行以上預設摺疊，提供 Expand 展開
  - 每列新增 View 按鈕即時載入 diff
  - 安裝 / 批次安裝 Loading 狀態、按鈕停用、迷你 spinner
  - 批次結果摘要（成功 / 失敗計數）
  - 欄位變動高亮（Text / Tooltip / Tags）

### 後續規劃（未實作）

- Remote catalog fetch（ETag 快取）
- `scriptUrl` 延後載入 & 大腳本 diff 摺疊最佳化
- 更精細的行級 diff（LCS + 高亮 token）
- 安裝前差異多選套用（partial fields 目前策略：全部覆蓋）
- Bridge 測試（rollback、diff 正確性）與安全掃描加強

### 風險控管摘要

- 批次安裝：任何項失敗 → 還原 snapshot → 回傳錯誤
- script 安全檢查：長度上限、封鎖 `eval(` / `new Function` / 可疑 `process.env` dump pattern

### 使用者價值

- 在安裝前即可視覺化變更差異，降低覆蓋腳本風險
- 原子批次提升一致性與可預測性
- 預留擴充空間（Remote / Lazy / Rich Diff）

### Remote Catalog & Locale Refactor (Aug 2025 Late)

- Remote-first catalog loading (GitHub raw) with 3s timeout / 256KB limit, fallback to packaged JSON.
- Unified locale detection (`vscode.env.language`): only `zh-tw` / `zh-hant` → Traditional Chinese; others → English.
- Removed legacy inline `i18n()` fallback; consolidated text refresh via `updateScriptStoreTexts()`.
- Added in-memory 5 min cache layer (structure: { at, entries }) to avoid repeated network calls; future ETag planned.
- Fixed English catalog JSON formatting (first entry script key) causing parse failure & empty Script Store.
- Refactored sync `loadLocalCatalog` → async `loadCatalog` (remote + cache + local) shared across catalog / diff / install.
- Strengthened failure resilience: remote timeout / parse errors downgrade gracefully instead of blank UI.
- Maintained security filters for remote scripts (eval/new Function/process.env mass access rejection).
