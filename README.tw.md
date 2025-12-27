# Status Bar Helper

[English](README.md) | [繁體中文](README.tw.md)

這是一款能讓你在 VS Code 狀態列上新增自訂按鈕的擴充套件，你可以撰寫 JavaScript 腳本，或結合 VS Code API 與原生 Node.js 模組，打造各種獨特且實用的功能。

## ✨ 特色重點

- 自訂按鈕：在狀態列建立專屬按鈕，點擊即可執行自訂 JavaScript 腳本。
- 自動執行：支援在 VS Code 啟動時自動觸發指定腳本。
- 內建 Monaco 編輯器：提供語法高亮、智能提示等進階編輯功能。
- 資料存取 API：可透過擴充 API 操作 Storage 與 File 系統，方便管理資料。
- 獨立 VM 執行：每個腳本皆在獨立 Node.js VM 中運行，互不干擾，並僅使用原生 Node 模組。
- 安全性與隔離性：腳本在受控環境中執行，避免影響 VS Code 及其他腳本的穩定性與安全性。
- 直觀圖示介面：所有操作按鈕採用一致的 VS Code Codicons，提供簡潔易用的操作體驗。
- npm 套件支援：可在腳本中使用 `require` 載入 `sbh.packages/node_modules/` 下的 npm 套件，擴展功能。

## 贊助作者

如果您覺得這個小工具實用，歡迎請作者喝杯咖啡，感謝您的支持！

<a href="https://www.buymeacoffee.com/Joe.lin" target="_blank"><img src="https://cdn.buymeacoffee.com/buttons/v2/default-yellow.png" alt="Buy Me A Coffee" style="height: 60px !important;width: 217px !important;" ></a>

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

### npm 套件支援

- NPM 套件管理視窗
 ![alt text](https://raw.githubusercontent.com/JiaHongL/status-bar-helper/main/image/image-4_1.png)

- 在腳本中使用 package.install('package-name') 安裝套件，並可透過 require 載入使用。
 ![alt text](https://raw.githubusercontent.com/JiaHongL/status-bar-helper/main/image/image-4_2.png)

## 🔧 指令與捷徑

- **Status Bar Helper: Settings** — 從命令面板開啟設定頁
  ![alt text](https://raw.githubusercontent.com/JiaHongL/status-bar-helper/main/image/image-3_1.png)

- **右下角齒輪按鈕** — 快速進入設定頁  
  ![alt text](https://raw.githubusercontent.com/JiaHongL/status-bar-helper/main/image/image-3_2.png)

---

## 內建範例

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

---

## Script 開發指南 (給 AI Model 閱讀使用)

若您希望透過 AI 自動生成可用於 Status Bar Helper 的 Script，可以參考這份 prompt。內容將明確指引 AI 依據擴充套件支援的規範，撰寫能在環境中正常執行的 Script。[點此查看](https://github.com/JiaHongL/status-bar-helper/blob/main/docs/generate-script.tw.prompt.md)

---

## StatusBarHelper.v1 API

[API 定義檔](https://github.com/JiaHongL/status-bar-helper/blob/main/types/status-bar-helper/sbh.d.ts)

---

## 💡 小提醒

本擴充支援執行自訂腳本，這些腳本皆由使用者自行撰寫或提供，能帶來高度彈性與自動化能力。請僅使用可信來源或自行驗證過的腳本，以確保安全與穩定；若因此產生任何問題或風險，均由使用者自行承擔。

---

Made with ❤️ by **[Joe]**
