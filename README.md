# Status Bar Helper

這是一個 VSCode 擴充功能，提供兩個按鈕來快速執行常用的 Git 操作：`git add .` 和 `git submodule update --init --recursive`。

## 🚀 功能

- ☁️ **Git Add**：將所有變更加入暫存區（執行 `git add .`）
- 🔁 **Submodule Update**：初始化並更新 submodules（執行 `git submodule update --init --recursive`）

這些按鈕會顯示在 VSCode 左下角的狀態列中，點一下就能執行！

## 🔧 安裝

### 從 `.vsix` 安裝：

1. 執行 `vsce package` 打包
2. 拖曳 `.vsix` 檔進 VSCode
3. 或使用：`Extensions` → `⋯` → `Install from VSIX...`

## 💡 適用場景

- 使用 monorepo 或 submodule 結構
- 希望更快整理 Git 狀態

---

Made with ❤️ by [你的名字]
