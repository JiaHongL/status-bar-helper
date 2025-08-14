# Task: 新增「狀態列按鈕 + 預設腳本」

Context: #project @workspace
Goal:
- 在 `src/default-items.ts` 增加一個新的預設腳本（附註解、可於 SettingsPanel 一鍵插入）
- （如果需要）在 `src/extension.ts` 的預設種子清單加入對應項目，文字/tooltip/enableOnInit
- 確保 `GLOBAL_MANIFEST_KEY` 與 `GLOBAL_ITEMS_KEY` 會被正確更新且 UI 會重繪

Constraints:
- TypeScript 嚴格模式；不得使用 any
- 腳本僅使用 Node 內建模組與 `sbh.v1.*` API
- 所有路徑需經 `safeJoin(scopeBase(...), rel)` 處理

Deliverables:
- 具體的 patch（diff）或修改區塊
- 若涉及 UI，請同步更新 SettingsPanel 的插入清單
- 簡短測試指引（如何在 VS Code 中驗證）
