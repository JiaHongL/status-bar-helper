# Task: 新增「狀態列按鈕 + 預設腳本」

Context: #project @workspace
Goal:
- （已棄用 default-items.ts）改為在 `media/script-store.defaults.<locale>.json` 新增項目（多語系必要時兩份同步）
- 更新 `extension.ts` seeding（若需要 ensureDefaultItems 流程）確保初始同步與 remote hash 一致
- 確保 `GLOBAL_MANIFEST_KEY` 與 `GLOBAL_ITEMS_KEY` 更新並觸發 `_refreshStatusBar`

Constraints:
- TypeScript 嚴格模式；不得使用 any
- 腳本僅使用 Node 內建模組與 `sbh.v1.*` API
- Script Store 項目 script 長度 <= 32KB 且不得含 `eval(` / `new Function` / 過量 `process.env.` (>5)
- JSON 需保持欄位順序與未知欄位保留，合理 tags 陣列長度 ≤12

Deliverables:
- 具體的 patch（diff）或修改區塊
- 更新/新增對應 locale JSON（必要）
- 簡短測試指引（Script Store overlay 能顯示新項且可安裝）

<!--
Maintenance Notes
LastMaintSync: 2025-08-16
Update Triggers:
1. Script Store JSON 結構 / 欄位 / 安全限制改動
2. 安裝流程（hash 計算 / bulk 原子性）調整
3. deprecation: default-items.ts 真正移除時需刪除相關段落
Change Log:
2025-08-16: Switched from default-items.ts to script-store.defaults JSON flow + safety constraints.
-->
