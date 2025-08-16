# Change Log

[Click here for the latest release notes](https://github.com/JiaHongL/status-bar-helper/releases)

## [Unreleased]

### Added

- **Script Store Diff Window Redesign** - Script Store 差異視窗重新設計

  - 新增底部操作按鈕區域，提供更直觀的使用者體驗
  - 移除 header 中的更新按鈕，改為底部 Cancel/Update 按鈕配置
  - 實現狀態排序：新增 > 可更新 > 已安裝，提供更好的項目組織
  - 修正 diff 視窗按鈕的國際化支援
  - 整合確認對話框到 diff 視窗，消除混亂的同時顯示問題

- **Comprehensive UI Icon Conversion** - 全面圖示化介面升級
  - 將所有操作按鈕轉換為緊湊圖示格式：
    - 列表檢視：Run/Stop/Edit/Delete 按鈕改用 Codicons
    - Script Store：View/Install/Update/Remove 按鈕轉換為圖示
    - 編輯頁面：Run/Stop/Save/Cancel 按鈕改為圖示按鈕
    - 儲存資料：Delete 按鈕轉換為垃圾桶圖示
  - Script Store 更新確認對話框，包含差異預覽
  - 重新整理按鈕轉換為圖示格式並右對齊
  - 匯出預覽對話框中隱藏 Tags 欄位
  - 為 Script Store 和對話框增加完整國際化支援

### Changed

- **Enhanced Script Store UX** - Script Store 使用者體驗強化

  - Diff 視窗採用標準確認對話框佈局，按鈕位於底部
  - 改善更新工作流程，消除同時顯示 diff 和確認對話框的問題
  - 狀態排序讓使用者更容易找到新增和可更新的腳本
  - 完整的國際化支援，包含編輯頁面 headers 和所有新增按鈕

- **Edit View Tags Removal** - 移除編輯頁面 Tags 欄位
  - 使用者無法再在項目編輯介面中編輯 tags
  - 保留列表檢視和 Script Store 中的 tags 顯示
  - 簡化編輯介面，專注於核心功能（圖示、標籤、工具提示、腳本）
- **Layout Optimizations** - 版面配置最佳化
  - 改善表格行高一致性和按鈕對齊
  - 操作欄寬度針對雙圖示佈局最佳化（60px）
  - 表格佈局一致性修復

### Technical

- 更新 `showDiff()` 函數控制底部操作區域顯示
- 強化 `updateScriptStoreTexts()` 處理 diff 視窗按鈕國際化
- 新增底部按鈕 CSS 樣式，支援 VS Code 主題
- 維持完整的無障礙功能（title 和 aria-label 屬性）
- 使用 VS Code Codicons 提供一致的視覺體驗
- 保持所有現有功能完整性

### Added (Remote Catalog & Locale Refactor)

- Remote + Cached Script Store catalog：優先 GitHub raw，3s timeout / 256KB 上限，失敗 fallback 本地；結果 5 分鐘快取。
- 統一語系判斷使用 `vscode.env.language`（僅 zh-tw / zh-hant → zh-tw；其餘英文）；解決英文 VS Code 載入繁中 tooltip。
- 移除舊 `i18n()` fallback，集中 `updateScriptStoreTexts()` 採 `t()` 實作。
- 修正英文本地 `script-store.defaults.en.json` 第一筆 script 欄位格式錯誤導致 parse 失敗。

### Changed (Script Store Loading)

- 同步 `loadLocalCatalog` → 異步 `loadCatalog`（遠端 + 快取 + 本地備援）。
- Bulk install / diff 共用統一 catalog 來源避免 race。

### Fixed (Catalog)

- 英文環境顯示繁中 Tooltip。
- 遠端逾時導致空白 Script Store（新增降級與快取）。
- 本地英文 catalog parse error 導致整體中斷。

### Technical (Networking & Caching)

- 使用 Node `https` + AbortController (3s timeout)；記錄 size limit / timeout / parse fail 警告。
- 簡易 in-memory cache（5 分鐘 TTL）後續可擴充 ETag。

### Security

- 遠端腳本仍套用既有安全快篩：阻擋 eval/new Function/大量 process.env。

### Next (Planned – Remote Phase 2)

- ETag / If-None-Match 快取
- `scriptUrl` lazy loading
- token-level richer diff
- 使用者設定覆寫 catalog 語系

### Added (Script Store & Diff)

- **進階匯入/匯出功能** - 完整的狀態列項目匯入匯出支援
  - 新增「Advanced I/E」按鈕開啟進階匯入匯出介面
  - **匯入功能**：
    - 支援貼上 JSON 或載入檔案
    - Replace/Append 合併策略選擇
    - Skip/NewId 衝突處理機制
    - 預覽表格顯示項目狀態 (新增/已存在/衝突/跳過)
    - 可選擇性套用匯入項目
  - **匯出功能**：
    - 可選擇特定項目匯出
    - 即時產生 JSON 預覽
    - 支援複製到剪貼簿或儲存檔案
    - 顯示項目大小資訊
  - **技術特色**：
    - 嚴格欄位順序與未知欄位保留
    - 完整的錯誤處理與驗證
    - 響應式設計支援深淺色主題
    - 多語系支援 (繁體中文/英文)
  - 新增 `src/utils/importExport.ts` 核心邏輯
  - 新增 `importExport` 橋接命名空間：`importPreview`、`exportPreview`、`applyImport`
  - 新增檔案載入與儲存橋接：`loadImportFile`、`saveExportToFile`

## [1.5.0] - 2025-08-15

### Added

- **Script Store Phase 1**：取代舊範例還原流程，提供集中式腳本目錄
  - 本地 catalog：`script-store.defaults.<locale>.json`（含 tags）
  - 狀態判斷：Installed / Update / New（依 command + scriptHash + 文字/tooltip/tags）
  - 單筆安裝、批次安裝（原子性：任一失敗自動回滾）
  - Diff 後端：`scriptStore.diff` 提供 before/after 欄位與 script
  - 新增橋接命名空間：`scriptStore.catalog`、`install`、`bulkInstall`、`diff`
  - Tags 支援：於項目列表、匯入/匯出、Script Store 顯示與過濾
- **Diff Viewer (Webview)**：
  - 右側面板顯示欄位差異（Text / Tooltip / Tags）
  - Script side-by-side 行級簡易差異（>400 行預設摺疊可展開）
  - 變動欄位高亮、快速切換 View
- **UI/UX**：
  - 安裝/批次安裝 loading spinner、按鈕停用狀態
  - 批次安裝結果摘要（成功/失敗統計）
  - View 按鈕快速預覽差異

### Changed

- 移除舊「Restore Samples」流程，改用 Script Store
- Bulk install 從逐項覆蓋改為 snapshot + rollback 策略

### Security

- 安裝前腳本快篩：阻擋 `eval(`、`new Function`、可疑 `process.env` 大量讀取 pattern
- 保持既有限制（大小、原生模組）— 後續擴充 remote 時再加強

### Technical

- 重構橋接內部：抽離 hash 計算 / 狀態建構 / 安裝套用 / 回滾流程
- 加入 tags 至同步/更新判斷 signature

- 新增 Import/Export 相關型別定義：`MergeStrategy`、`ConflictPolicy`、`ParseResult` 等
- 完善錯誤處理與安全驗證機制
- 更新開發文件與 Copilot 指令
- 加強測試覆蓋率

### Security (Script Validation)

- 檔案大小限制：JSON 檔案最大 10MB
- 路徑安全驗證，防止越界存取
- 完整的輸入驗證與錯誤過濾
