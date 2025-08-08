# Status Bar Helper

在 VS Code **左下角狀態列**放上你自訂的按鈕，一鍵執行 JavaScript。  

![alt text](https://raw.githubusercontent.com/JiaHongL/status-bar-helper/main/media/readme/image-2.png
)

支援 **VS Code API** 與 **Node.js**，內建漂亮設定面板、拖拉排序、Import/Export、與預設範例（**Log / Git / Board**）。

![alt text](https://raw.githubusercontent.com/JiaHongL/status-bar-helper/main/media/readme/image.png)

內建 Monaco 編輯器，支援 Monaco 、Cmd/Ctrl+S 儲存與測試執行．

![alt text](https://raw.githubusercontent.com/JiaHongL/status-bar-helper/main/media/readme/image-1.png)
---

## ✨ 特色重點

- **一鍵執行**：按一下就跑腳本  
- **智慧型執行**：自動偵測是否使用 `vscode`，自動選擇最佳執行方式  
- **好用設定面板**：Icon 選擇、Label/Tooltip、Monaco 編輯器、底部輸出、Cmd/Ctrl+S 儲存  
- **管理方便**：搜尋、拖拉排序、Import/Export、**一鍵還原預設範例**

---

## 🚀 快速開始

1. 打開命令面板 → **`Status Bar Helper: Settings`**  
   或直接點 **右下角狀態列的齒輪圖示**（`Status Bar Helper Settings`）開啟設定面板。
2. 右上角 **Restore Samples** → 選 **Replace All** 或 **Append**  
3. 左下角將出現三個可試跑的按鈕：**Log / Git / Board**

---

## ➕ 新增自己的按鈕

在設定面板點 **Add New Item** → 選 Icon、填 Label/Tooltip、貼上腳本 → **Save**。  
你的腳本可同時使用 **VS Code API**（例如顯示通知、存取編輯器狀態）以及 **Node.js 內建模組**（例如 `fs`、`path`、`os` 等）——兩邊都支援。

---

## 🔧 指令與捷徑

- **Status Bar Helper: Settings** — 打開設定面板  
- **右下角齒輪按鈕** — 直接開啟設定面板

---

## 🙋 常見問題（精簡）

- **看不到按鈕？** 到設定面板新增或按 **Restore Samples**，必要時重新載入視窗。  
- **取消編輯會不會存？** 有變更會跳出「Discard changes?」，選擇後才離開。  
- **安全性**：使用 VS Code API 的腳本在擴充 VM 內跑，**僅允許 `vscode` 與 Node 內建模組**。

---

Made with ❤️ by **[Joe]**
