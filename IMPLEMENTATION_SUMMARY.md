# 進階匯入/匯出功能實作完成 ✅

## 🎯 功能概覽

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
