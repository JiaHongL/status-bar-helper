# Status Bar Helper 前端模組化重構規格書

## 專案資訊
- **專案名稱**: status-bar-helper
- **當前版本**: 1.7.4
- **重構分支**: `refactor/frontend-modularization`
- **備份檔案**: `media/settings.html.backup`
- **開始日期**: 2025-09-03

## 重構目標
將 3500+ 行的單一 `settings.html` 檔案進行模組化拆分，提升程式碼可維護性，同時保持所有功能完整性。

## 核心原則
1. **向後相容**: postMessage API、Bridge 系統完全不變
2. **漸進式重構**: 每個步驟可獨立測試和回滾
3. **功能完整性**: 所有現有功能必須保持正常運作
4. **安全第一**: 先備份，後刪除，嚴格控制程式碼變更

## 重構策略與原則

### 📋 **模組化策略**
1. **基礎工具優先**: Confirmation 系統等被多個模組使用的基礎工具先模組化
2. **依賴順序**: 低依賴模組 → 高依賴模組，避免循環依賴
3. **功能完整性**: 每個模組包含完整的功能邏輯，避免分散
4. **單一職責**: 每個模組專注一個核心功能領域

### 🔧 **技術實作原則**
1. **CSS 先行**: 樣式模組化風險最低，先建立信心
2. **Import/Export 分離**: 複雜功能拆分為更小的模組降低風險
3. **Main Page 整合**: List View + Data View 合併為統一的主頁面模組
4. **Monaco 獨立**: 編輯器功能複雜度高，獨立模組化

### 🛡️ **安全控制原則**
1. **備份優先**: 每個 Phase 開始前確認備份檔案存在
2. **測試驅動**: 新模組完全正常後才刪除舊程式碼
3. **逐步回滾**: 每個 Phase 都有獨立的回滾策略
4. **程式碼追蹤**: 詳細記錄每個程式碼區塊的遷移狀態

### 📊 **進度控制原則**
1. **明確檢查點**: 每個 Phase 都有具體的測試檢查清單
2. **狀態更新**: 完成每個步驟後立即更新規格書進度
3. **問題記錄**: 遇到問題時記錄原因和解決方案
4. **時間追蹤**: 實際耗時與預估時間的對比分析
5. **🔄 即時更新**: **每完成一個 Phase 必須立即更新此規格書**
6. **📝 進度追蹤**: 將 `[ ]` 改為 `[x]`，並更新「當前狀態」區塊
7. **⏰ 時間記錄**: 記錄每個 Phase 的實際開始和完成時間
8. **📋 問題日誌**: 記錄遇到的技術問題和解決方案

### ⚡ **程式碼刪除控制原則**
1. **嚴格順序**: 先確認新模組完全正常，再刪除舊程式碼
2. **功能驗證**: 每個功能都要測試通過才能刪除對應程式碼
3. **備份保留**: 刪除前再次確認 settings.html.backup 完整
4. **分段刪除**: 大的程式碼區塊分小段刪除，避免一次移除過多
5. **記錄追蹤**: 在規格書中標記每個已刪除的程式碼區塊
6. **⚠️ 精確定位**: **絕對不要刪除到新模組的程式碼**，只刪除原始 settings.html 中的舊程式碼
7. **⚠️ 範圍確認**: 刪除前雙重檢查行號範圍，確保不影響其他功能模組

### 🔄 **模組載入順序原則**
1. **工具函式優先**: confirmation.js, dom-helpers.js 等工具先載入
2. **基礎模組次之**: 各功能模組按依賴順序載入
3. **核心控制最後**: app-controller.js, page-router.js 最後載入
4. **初始化順序**: 確保模組間依賴關係正確建立

## 檔案結構規劃

### 目標結構
```
media/
├── settings.html                 # 主檔案（大幅簡化）
├── settings.html.backup          # 原始備份檔案
├── styles/                       # CSS 模組
│   ├── base.css                 # 全域變數、VS Code 主題
│   ├── layout.css               # 主要佈局結構
│   ├── components.css           # 可重用元件
│   ├── list-view.css            # List View 專用
│   ├── data-view.css            # Data View 專用
│   ├── edit-page.css            # Edit Page 專用
│   ├── modals.css               # 模態視窗基礎
│   ├── script-store.css         # Script Store 專用
│   ├── import-export.css        # Import/Export 專用
│   └── backup-manager.css       # Backup Manager 專用
├── components/                   # JavaScript 模組
│   ├── script-store.js          # Script Store 功能
│   ├── confirmation.js          # 確認對話框系統
│   ├── import.js                # Import 預覽與處理
│   ├── export.js                # Export 預覽與處理
│   ├── backup-manager.js        # Backup Manager
│   ├── main-page.js             # 主頁面 (List View + Data View)
│   └── edit-page.js             # 編輯頁面 (Monaco 編輯器)
├── core/                        # 核心系統
│   ├── app-controller.js        # 主要應用控制器
│   └── page-router.js           # 頁面切換控制
└── utils/                       # 工具函式
    ├── dom-helpers.js           # DOM 操作工具
    └── i18n-helper.js           # 國際化處理
```

## 重構階段計劃

### Phase 1: CSS 模組化 ✅
- [x] 建立備份檔案 (`settings.html.backup`)
- [ ] 建立 CSS 目錄結構
- [ ] 提取並分類現有 CSS
- [ ] 更新 settings.html CSS 載入
- [ ] 測試樣式完整性

### Phase 2: Confirmation 系統模組化 ⭐ 基礎工具模組
- [ ] 建立 JavaScript 目錄結構 (`components/`, `core/`, `utils/`)
- [ ] 分析並定位確認對話框相關程式碼（行號範圍：1450-1550）
- [ ] 創建 `utils/confirmation.js` 檔案
- [ ] 提取 `showChoiceDialog` 函式
- [ ] 提取 `showToast` 函式
- [ ] 提取確認對話框 HTML 模板和樣式處理
- [ ] 在 settings.html 中添加模組載入
- [ ] 建立全域 API（`window.ConfirmationSystem`）
- [ ] 測試各種確認對話框場景
- [ ] 測試 Toast 訊息顯示
- [ ] **確認新模組完全正常後**，刪除原始檔案中的對應程式碼
- [ ] **🔄 立即更新 REFACTOR_SPEC.md 進度**：將 `[ ]` 改為 `[x]`，更新「當前狀態」，記錄完成時間和問題

### Phase 3: Script Store 模組化
- [ ] 分析並定位 Script Store 相關程式碼區塊（行號範圍：3450-3595）
- [ ] 創建 `components/script-store.js` 檔案
- [ ] 提取 RPC 通訊層（`callHost`, `pending` Map, message listener）
- [ ] 提取狀態管理（`ssCatalog`, `ssLoaded`, `ssLoading`, `ssInstalling`）
- [ ] 提取 UI 渲染函式（`render`, `badge`, `fetchCatalog`, `syncBulkButton`）
- [ ] 提取事件處理器（按鈕點擊、搜尋、篩選）
- [ ] 提取 Diff 視窗功能（`showDiff`, `renderScriptDiff`, `closeDiff`）
- [ ] **使用已模組化的 Confirmation 系統**（取代內建的 `showConfirm`）
- [ ] 建立模組初始化機制（`window.ScriptStore = new ScriptStore(...)`）
- [ ] 測試 Script Store 開啟/關閉
- [ ] 測試搜尋和篩選功能
- [ ] 測試腳本安裝和更新功能
- [ ] 測試 Diff 檢視和確認對話框
- [ ] 測試 NEW 徽章系統
- [ ] **確認新模組完全正常後**，刪除原始檔案中的對應程式碼
- [ ] 更新 REFACTOR_SPEC.md 進度

### Phase 4: Import 模組化
- [ ] 分析並定位 Import 相關程式碼（行號範圍：2400-2550）
- [ ] 創建 `components/import.js` 檔案
- [ ] 提取匯入預覽功能（`showImportPreview`, `showPreviewDialog`）
- [ ] 提取選項控制（merge strategy, conflict policy）
- [ ] 提取匯入預覽表格渲染和操作
- [ ] 提取批次選擇控制（全選、取消選擇）
- [ ] **使用已模組化的 Confirmation 系統**
- [ ] 在 settings.html 中添加模組載入
- [ ] 建立模組初始化和事件綁定
- [ ] 測試檔案選擇和讀取功能
- [ ] 測試匯入預覽表格顯示
- [ ] 測試合併策略和衝突處理
- [ ] 測試批次選擇和實際匯入
- [ ] **確認新模組完全正常後**，刪除原始檔案中的對應程式碼
- [ ] 更新 REFACTOR_SPEC.md 進度

### Phase 5: Export 模組化
- [ ] 分析並定位 Export 相關程式碼（行號範圍：2550-2650）
- [ ] 創建 `components/export.js` 檔案
- [ ] 提取匯出預覽功能（`showExportPreview`）
- [ ] 提取項目選擇和篩選邏輯
- [ ] 提取匯出格式化和檔案生成
- [ ] 提取下載觸發機制
- [ ] **使用已模組化的 Confirmation 系統**
- [ ] 在 settings.html 中添加模組載入
- [ ] 建立模組初始化和事件綁定
- [ ] 測試項目選擇和預覽功能
- [ ] 測試匯出檔案生成
- [ ] 測試下載功能
- [ ] **確認新模組完全正常後**，刪除原始檔案中的對應程式碼
- [ ] 更新 REFACTOR_SPEC.md 進度

### Phase 6: Backup Manager 模組化
- [ ] 分析並定位備份管理相關程式碼（行號範圍：1700-1850）
- [ ] 創建 `components/backup-manager.js` 檔案
- [ ] 提取備份表格渲染（`renderBackupTable`）
- [ ] 提取時間格式化（`formatRelativeTime`）
- [ ] 提取備份操作（create, restore, delete）
- [ ] **使用已模組化的 Confirmation 系統**（還原確認、刪除確認）
- [ ] 在 settings.html 中添加模組載入
- [ ] 建立模組初始化和事件綁定
- [ ] 測試備份列表顯示和刷新
- [ ] 測試立即備份功能
- [ ] 測試備份還原功能
- [ ] 測試備份刪除功能
- [ ] **確認新模組完全正常後**，刪除原始檔案中的對應程式碼
- [ ] 更新 REFACTOR_SPEC.md 進度

### Phase 7: Main Page 模組化 (List View + Data View)
- [ ] 分析並定位主頁面相關程式碼（行號範圍：2000-2400）
- [ ] 創建 `components/main-page.js` 檔案
- [ ] 提取頁面切換控制（`showListView`, `showEditView`）
- [ ] 提取 List View 渲染邏輯（`renderListView`）
- [ ] 提取 Data View 渲染邏輯（`renderStoredData`）
- [ ] 提取搜尋和篩選功能
- [ ] 提取項目操作（run, stop, edit, delete）
- [ ] 提取拖拽排序功能
- [ ] 提取執行狀態更新（running badge）
- [ ] 提取同步狀態顯示（last sync indicator）
- [ ] 提取資料刷新邏輯（定時器管理）
- [ ] 在 settings.html 中添加模組載入
- [ ] 建立主頁面控制器初始化
- [ ] 測試頁面切換功能
- [ ] 測試列表顯示和更新
- [ ] 測試資料檢視和篩選
- [ ] 測試搜尋功能
- [ ] 測試項目操作按鈕
- [ ] 測試執行狀態指示器
- [ ] **確認新模組完全正常後**，刪除原始檔案中的對應程式碼
- [ ] 更新 REFACTOR_SPEC.md 進度

### Phase 8: Edit Page 模組化
- [ ] 分析並定位編輯頁面相關程式碼（行號範圍：3200-3450）
- [ ] 創建 `components/edit-page.js` 檔案
- [ ] 提取 Monaco 編輯器初始化邏輯
- [ ] 提取 TypeScript 定義注入
- [ ] 提取編輯器主題切換
- [ ] 提取腳本執行和輸出處理
- [ ] 提取編輯頁面渲染（`renderEditView`）
- [ ] 提取編輯器生命週期管理
- [ ] **與 Main Page 模組整合**（頁面切換邏輯）
- [ ] 在 settings.html 中添加模組載入
- [ ] 建立編輯頁面控制器初始化
- [ ] 測試編輯器開啟和關閉
- [ ] 測試語法高亮和自動完成
- [ ] 測試腳本執行和輸出顯示
- [ ] 測試主題切換
- [ ] 測試頁面切換（Main ↔ Edit）
- [ ] **確認新模組完全正常後**，刪除原始檔案中的對應程式碼
- [ ] 更新 REFACTOR_SPEC.md 進度

### Phase 9: 核心系統整合
- [ ] 創建 `core/app-controller.js` 主要應用控制器
- [ ] 提取 postMessage 通訊邏輯
- [ ] 提取全域狀態管理（items, nls, runningStates）
- [ ] 提取初始化流程
- [ ] 創建 `core/page-router.js` 頁面路由控制
- [ ] 提取頁面切換邏輯（Main Page ↔ Edit Page）
- [ ] 建立模組間通訊機制
- [ ] 整合所有模組初始化
- [ ] 進行完整功能測試
- [ ] 清理剩餘的舊程式碼
- [ ] 最終優化和程式碼整理

## 程式碼映射追蹤

### CSS 程式碼映射
| 原始位置 | 目標檔案 | 說明 | 狀態 |
|---------|---------|------|------|
| `<style>` 行 83-100 | `base.css` | CSS 變數、全域樣式 | 待處理 |
| `<style>` 行 101-200 | `layout.css` | 主要佈局結構 | 待處理 |
| `<style>` 行 201-300 | `components.css` | 按鈕、表格元件 | 待處理 |
| ... | ... | ... | ... |

### JavaScript 程式碼映射

| 功能模組 | 原始行號範圍 | 目標檔案 | 主要函式 | 狀態 |
|---------|-------------|---------|----------|------|
| **Confirmation 系統** ⭐ | 1450-1550 | `utils/confirmation.js` | `showChoiceDialog`, `showToast` | 待處理 |
| **Script Store RPC** | 3450-3500 | `components/script-store.js` | `callHost`, `pending` Map, message listener | 待處理 |
| **Script Store UI** | 3500-3550 | `components/script-store.js` | `render`, `badge`, `fetchCatalog`, `syncBulkButton` | 待處理 |
| **Script Store Diff** | 3550-3595 | `components/script-store.js` | `showDiff`, `renderScriptDiff`, `closeDiff` | 待處理 |
| **Import 預覽** | 2400-2500 | `components/import.js` | `showImportPreview`, `showPreviewDialog` | 待處理 |
| **Import 選項控制** | 2500-2550 | `components/import.js` | merge strategy, conflict policy | 待處理 |
| **Export 預覽** | 2550-2600 | `components/export.js` | `showExportPreview`, selection logic | 待處理 |
| **Export 檔案生成** | 2600-2650 | `components/export.js` | format generation, download trigger | 待處理 |
| **Backup Manager** | 1700-1800 | `components/backup-manager.js` | `renderBackupTable`, backup operations | 待處理 |
| **Backup 時間格式** | 1650-1700 | `components/backup-manager.js` | `formatRelativeTime` | 待處理 |
| **Main Page 控制** | 2000-2050 | `components/main-page.js` | `showListView`, `showEditView` | 待處理 |
| **List View 渲染** | 2050-2200 | `components/main-page.js` | `renderListView`, item operations | 待處理 |
| **List View 搜尋** | 2200-2300 | `components/main-page.js` | search, filter functionality | 待處理 |
| **Data View 渲染** | 1850-1950 | `components/main-page.js` | `renderStoredData`, data operations | 待處理 |
| **Data View 篩選** | 1950-2000 | `components/main-page.js` | type filter, search, clear all | 待處理 |
| **Edit Page Monaco** | 3200-3300 | `components/edit-page.js` | Monaco setup, typedef injection | 待處理 |
| **Edit Page 編輯** | 3300-3400 | `components/edit-page.js` | `renderEditView`, script execution | 待處理 |
| **Edit Page 主題** | 3400-3450 | `components/edit-page.js` | theme switching | 待處理 |
| **初始化邏輯** | 1600-1650 | `core/app-controller.js` | initialization, state setup | 待處理 |
| **postMessage 通訊** | 3000-3200 | `core/app-controller.js` | message handling, bridge calls | 待處理 |
| **頁面路由** | 1550-1600 | `core/page-router.js` | page switching logic | 待處理 |

## 關鍵函式與變數追蹤

### 全域變數（需保留）
- `vscode` - VS Code API 參照
- `items` - 狀態列項目陣列
- `nls` - 國際化文字對照
- `runningHost`, `runningPanel` - 執行狀態
- `currentEditor` - Monaco 編輯器實例

### 關鍵函式（需注意相依性）
- `renderListView()` - List View 渲染
- `renderStoredData()` - Data View 渲染
- `showEditView()` - 編輯頁面顯示
- `openScriptStore()` - Script Store 開啟
- `showChoiceDialog()` - 確認對話框

## 測試檢查清單

### CSS 模組化測試
- [ ] 主要佈局正常顯示
- [ ] 響應式設計正常（<860px, <1100px）
- [ ] 明暗主題切換正常
- [ ] 所有按鈕樣式正確
- [ ] 模態視窗樣式正確

### Script Store 模組化測試
- [ ] Script Store 正常開啟
- [ ] 搜尋和篩選功能正常
- [ ] 腳本安裝功能正常
- [ ] Diff 檢視功能正常
- [ ] NEW 徽章顯示正常

### 整體功能測試
- [ ] 主列表顯示和操作正常
- [ ] 資料檢視和篩選正常
- [ ] 編輯器正常開啟和儲存
- [ ] 匯入匯出功能正常
- [ ] 備份管理功能正常

## 風險控制

### 回滾策略
1. **Phase 1 失敗**: 恢復 `settings.html.backup`
2. **Phase 2 失敗**: 保留 CSS 模組化，回滾 JavaScript 變更
3. **任何階段**: 可逐步回滾特定模組

### 注意事項
- ⚠️ **程式碼刪除安全**: **絕對不要刪除到新模組的程式碼**，只刪除原始 `settings.html` 中的舊程式碼
- ⚠️ **精確行號範圍**: 刪除前仔細確認行號範圍，避免誤刪其他功能模組
- ⚠️ **測試後刪除**: 刪除舊程式碼前務必確認新模組正常運作
- ⚠️ **保持全域變數**: 保持全域變數和事件監聽器的完整性
- ⚠️ **模組載入順序**: 確保模組載入順序正確
- ⚠️ **postMessage 通訊**: 測試所有 postMessage 通訊正常
- ⚠️ **分段刪除**: 大的程式碼區塊要分小段刪除，每次刪除後測試
- ⚠️ **備份檔案**: 每次重大變更前確認 `settings.html.backup` 存在且完整

### 🔥 **程式碼刪除檢查清單** (每次刪除前必須執行)
1. ✅ **新模組測試**: 確認新模組的所有功能都正常運作
2. ✅ **功能驗證**: 測試對應功能在新模組中完全正常
3. ✅ **行號確認**: 仔細檢查要刪除的程式碼行號範圍
4. ✅ **範圍檢查**: 確認刪除範圍不包含其他模組的程式碼
5. ✅ **依賴檢查**: 確認要刪除的程式碼沒有被其他模組使用
6. ✅ **備份確認**: 確認 `settings.html.backup` 檔案完整
7. ✅ **分段刪除**: 大區塊分成小段，每次刪除後測試
8. ✅ **記錄更新**: 在規格書中標記已刪除的程式碼區塊
9. ✅ **回滾準備**: 準備好快速回滾的方案

## 進度追蹤

### 當前狀態
- **備份檔案**: ✅ 已建立
- **規格書**: ✅ 已建立，調整順序：**Confirmation 優先**
- **CSS 模組化**: 🔄 準備中
- **Confirmation 系統**: ⏳ 下一步（基礎工具模組）
- **Script Store 模組化**: ⏳ 第三階段
- **其他模組**: ⏳ 依序進行

### 🕐 **實際進度追蹤** (每完成一個 Phase 記錄)
```
Phase 1 (CSS 模組化):
- 開始時間: [待記錄]
- 完成時間: [待記錄] 
- 實際耗時: [待記錄]
- 遇到問題: [待記錄]

Phase 2 (Confirmation 系統):
- 開始時間: [待記錄]
- 完成時間: [待記錄]
- 實際耗時: [待記錄] 
- 遇到問題: [待記錄]

[其他 Phase 完成後補充...]
```

### 📝 **Phase 完成檢查表** (每個 Phase 完成後執行)
- [ ] ✅ 新模組功能完全正常
- [ ] ✅ 舊程式碼已安全刪除
- [ ] ✅ 規格書 Phase 狀態已更新 `[ ]` → `[x]`
- [ ] ✅ 「當前狀態」區塊已更新
- [ ] ✅ 實際進度追蹤已記錄時間
- [ ] ✅ 遇到的問題已記錄
- [ ] ✅ 準備進入下一個 Phase

### 完成時間預估
- Phase 1 (CSS 模組化): 2-3 小時
- Phase 2 (Confirmation 系統): 1-2 小時  
- Phase 3 (Script Store): 3-4 小時
- Phase 4 (Import 模組化): 2-3 小時
- Phase 5 (Export 模組化): 1-2 小時
- Phase 6 (Backup Manager): 2-3 小時
- Phase 7 (Edit Page): 3-4 小時
- Phase 8 (List View): 3-4 小時
- Phase 9 (Data View): 2-3 小時
- Phase 10 (核心整合): 2-3 小時
- **總計**: 約 21-31 小時

### 里程碑追蹤
- 🎯 **里程碑 1**: CSS 完全模組化（預計 Phase 1 完成）
- 🎯 **里程碑 2**: 第一個 JS 模組成功（預計 Phase 2 完成）
- 🎯 **里程碑 3**: 獨立功能模組完成（預計 Phase 5 完成）
- 🎯 **里程碑 4**: 核心頁面模組完成（預計 Phase 8 完成）
- 🎯 **里程碑 5**: 完整重構完成（預計 Phase 9 完成）

## 更新日誌

- **2025-09-03 14:00**: 建立規格書，完成備份檔案
- **2025-09-03 14:30**: 詳細制定 9 個 Phase 的嚴謹步驟
- **2025-09-03 14:45**: 更新程式碼映射表和里程碑追蹤
- **2025-09-03 15:00**: 調整重構順序：Confirmation 優先，Import/Export 分離
- **2025-09-03 15:15**: 重新設計 Main Page 架構，合併 List View + Data View
- **2025-09-03 15:30**: **補充完整重構原則**：
  - 新增模組化策略、技術實作原則
  - 強化安全控制原則（程式碼刪除控制）
  - 建立進度控制與模組載入順序原則
  - 明確「先確認新模組正常，再刪除舊程式碼」的嚴格流程
- **2025-09-03 15:45**: **強化程式碼刪除安全機制**：
  - 新增「絕對不要刪除到新模組的程式碼」重要提醒
  - 建立 9 步驟程式碼刪除檢查清單
  - 強調精確行號範圍確認和分段刪除策略
- **2025-09-03 16:00**: **建立完整進度追蹤機制**：
  - 強化進度控制原則：每完成 Phase 必須立即更新規格書
  - 新增實際進度追蹤區塊：記錄每個 Phase 的開始/完成時間
  - 建立 Phase 完成檢查表：確保每個步驟都有追蹤
  - 強調規格書是活文件，需要持續更新狀態
