# Status Bar Helper

[English](README.en.md) | [繁體中文](README.md)

這是一款能讓你在 VS Code 狀態列上新增自訂按鈕的擴充套件。
你可以撰寫 JavaScript 腳本，或結合 VS Code API，打造各種獨特且實用的功能。

## ✨ 特色重點

- 自訂按鈕：在狀態列建立專屬按鈕，點擊即可執行自訂 JavaScript 腳本。
- 自動執行：支援在 VS Code 啟動時自動觸發指定腳本。
- 內建 Monaco 編輯器：提供語法高亮、智能提示等進階編輯功能。
- 資料存取 API：可透過擴充 API 操作 Storage 與 File 系統，方便管理資料。
- 獨立 VM 執行：每個腳本皆在獨立 Node.js VM 中運行，互不干擾，並僅使用原生 Node 模組。
- 安全性與隔離性：腳本在受控環境中執行，避免影響 VS Code 及其他腳本的穩定性與安全性。
- Script Store（第一階段 + 遠端預覽）：集中瀏覽範例腳本（本地 + 遠端優先），檢視差異並單筆或批次安裝（原子回滾）、更新偵測（hash）。
- 直觀圖示介面：所有操作按鈕採用一致的 VS Code Codicons，提供簡潔易用的操作體驗。

## 📖 使用說明

### 設定頁

在這個頁面，你可以管理狀態列項目，配備直觀的圖示介面：

- 顯示 / 隱藏 狀態列按鈕。
- 新增、編輯、刪除 狀態列項目（使用圖示按鈕操作）。
- 即時查看 Running 狀態（綠點 / 計數）。
- 切換是否顯示於狀態列，以及啟動時自動執行。
- 複製 cmdId
- 一鍵 Run / Stop 控制腳本運行狀態（圖示按鈕）。
- 管理套件儲存的全域與工作區資料（包含刪除與大小顯示）。
- 提供 script store (之後陸續新增更多腳本範例)，可直接安裝或更新。
- 增加本地備份，可手動備份或自動定時備份，並提供還原功能。

![alt text](https://raw.githubusercontent.com/JiaHongL/status-bar-helper/main/image/image-1_1.png)

![alt text](https://raw.githubusercontent.com/JiaHongL/status-bar-helper/main/image/image-1_2.png)

![alt text](https://raw.githubusercontent.com/JiaHongL/status-bar-helper/main/image/image-1_3.png)

### 編輯頁

在這個頁面中，你可以編寫並即時測試狀態列項目的腳本，配備簡潔的圖示操作介面：

- 圖示化操作按鈕：Run / Stop / Save / Cancel 採用直觀圖示設計。
- 專注核心編輯：僅保留圖示、標籤、工具提示和腳本編輯功能，介面更簡潔。
- 內建 Monaco 編輯器，支援 node 原生模組 與 VS Code API。
- 下方 Output 面板 會即時顯示腳本輸出與執行狀態（成功 / 失敗 / VM 關閉）。
- Output 面板可隱藏或拖拉改變顯示高度。
- 適合快速開發與調試自訂功能。

![alt text](https://raw.githubusercontent.com/JiaHongL/status-bar-helper/main/image/image-2.png)

### 匯入/匯出功能

Status Bar Helper 支援完整的資料匯入匯出功能，讓你輕鬆備份、分享或遷移狀態列項目設定：

#### 📤 匯出功能

- **選擇匯出**：可選擇特定項目進行匯出
- **JSON 格式**：標準 JSON 陣列格式，便於編輯與版本控制
- **完整資料**：包含按鈕文字、提示、腳本、顯示/隱藏狀態等完整設定

#### 📥 匯入功能

- **格式驗證**：嚴格檢查 JSON 格式與必要欄位
- **合併策略**：
  - **Replace（取代）**：清除現有項目，僅保留匯入項目
  - **Append（附加）**：保留現有項目，新增匯入項目
- **衝突處理**：
  - **Skip（略過）**：遇到重複 command ID 時略過該項目
  - **New ID（新 ID）**：自動產生新的 command ID 避免衝突
- **預覽模式**：匯入前可預覽變更內容與衝突狀況

#### 📋 JSON 格式範例

```json
[
  {
    "command": "myext.customButton",
    "text": "$(gear) 我的按鈕",
    "tooltip": "自訂功能按鈕",
    "script": "console.log('Hello World!');",
    "hidden": false,
    "enableOnInit": false
  }
]
```

#### 🔒 安全性與限制

- 檔案大小限制：JSON 檔案最大 10MB
- 欄位保留：完整保留原始欄位順序與未知欄位
- 路徑安全：所有檔案操作均經過路徑驗證，防止越界存取

---

## 🔧 指令與捷徑

- **Status Bar Helper: Settings** — 從命令面板開啟設定頁
- **右下角齒輪按鈕** — 快速進入設定頁

![alt text](https://raw.githubusercontent.com/JiaHongL/status-bar-helper/main/image/image-3.png)

---

## 內建範例

### Script Store

集中式腳本目錄來源：`script-store.defaults.<locale>.json`（目前提供 `en` 與 `zh-tw`）。

功能：

- 遠端優先（GitHub raw，3 秒 timeout / 256KB 上限）→ 失敗 fallback 本地檔
- 語系判斷：`vscode.env.language`（僅 zh-tw / zh-hant 走繁體，其餘英文）
- **NEW 徽章指示器**：Script Store 按鈕顯示新腳本數量，提供視覺化更新提示
- 狀態徽章：NEW / INSTALLED / UPDATE（script + text + tooltip + tags hash）
- **狀態排序**：新增 > 可更新 > 已安裝 的優先順序
- 單項 / 批次安裝（批次為原子：任一失敗即回滾）
- **批次安裝確認**：安裝前顯示詳細清單確認，支援多語系
- **Diff 檢視 UX 改進**：底部按鈕佈局（取消/更新），消除同時跳出視窗問題
- **圖示化操作**：View/Install/Update/Remove 採用直觀圖示設計
- **現代化色彩系統**：漸層背景與主題適配的狀態徽章
- 安全快篩：拒絕含 `eval(`、`new Function`、大量 `process.env` 取用的腳本
- 5 分鐘記憶體快取（後續規劃 ETag）

規劃中（Phase 2）：ETag 快取、`scriptUrl` 延遲載入、token 細粒度 diff、使用者強制語系覆寫。

- Log：示範如何將輸出同時顯示在面板 Output 區塊與 VS Code 的 Output Channel。
- Git Add：示範如何在擴充套件中執行全域 Git 指令（例如 git add）。
- Storage：示範如何使用 StatusBarHelper.v1 的 Storage 與 File API 進行資料讀寫與檔案操作。
  - Global Storage（跨工作區）
    - storage.global.get(key, default?)：讀取值
    - storage.global.set(key, value)：寫入值
    - storage.global.remove(key)：刪除鍵值
    - storage.global.keys()：列出所有鍵
  - Workspace Storage（僅開啟工作區時）
    - storage.workspace.get(key, default?)
    - storage.workspace.set(key, value)
    - storage.workspace.remove(key)
    - storage.workspace.keys()
  - Files API（檔案存取）
    - files.dirs()：取得實體資料夾路徑（global / workspace）
    - 文字：readText(scope, relPath)／writeText(scope, relPath, content)
    - JSON：readJSON(scope, relPath)／writeJSON(scope, relPath, data)
    - 二進位：readBytes(scope, relPath)／writeBytes(scope, relPath, data)（Uint8Array／ArrayBuffer／base64）
    - exists(scope, relPath)：檢查檔案/資料夾是否存在
    - list(scope, relPath?)：列出檔案/資料夾
    - listStats(scope, relPath?)：列出檔案與大小/相對路徑
    - remove(scope, relPath)：刪除檔案或資料夾
    - clearAll(scope)：清空該範圍所有檔案
- Toggle Light/Dark Mode：示範如何將 VS Code 指令製作成狀態列按鈕，快速切換主題。
![alt text](https://raw.githubusercontent.com/JiaHongL/status-bar-helper/main/image/01.gif)
- Board：示範如何使用 VS Code Webview 建立自訂互動介面。
![alt text](https://raw.githubusercontent.com/JiaHongL/status-bar-helper/main/image/02.gif)
- Pomodoro：示範結合狀態列與 showQuickPick 建立簡單的番茄鐘計時器。
![alt text](https://raw.githubusercontent.com/JiaHongL/status-bar-helper/main/image/03.gif)
- Chat A、Chat B：示範如何使用 StatusBarHelper.v1 的 vm 在兩個腳本間建立通訊並互相控制生命週期，包含：
  - vm.open(cmd, payload)：啟動（或喚醒）另一個腳本，並可附帶初始訊息。
  - vm.sendMessage(targetCmd, message)：向目標腳本傳送訊息。
  - vm.onMessage(handler)：接收其他腳本傳來的訊息。
  - vm.stopByCommand(cmd, reason)：結束指定腳本。
  - vm.stop(reason)：自行結束目前腳本。
  - vm.onStop(handler)：監聽 VM 關閉事件。
  
  ![alt text](https://raw.githubusercontent.com/JiaHongL/status-bar-helper/main/image/04.gif)

> 備註：每個 VM 執行完成後不會自動關閉，必須由使用者自行呼叫 vm.stop() 來結束；可搭配 vm.onStop() 監聽 VM 關閉事件。

## StatusBarHelper.v1 API

[API 定義檔](https://github.com/JiaHongL/status-bar-helper/blob/main/types/status-bar-helper/sbh.d.ts)

---

Made with ❤️ by **[Joe]**

---