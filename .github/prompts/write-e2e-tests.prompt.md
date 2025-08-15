# Task: 撰寫 E2E 測試（`@vscode/test-electron`）

Context: #project @workspace
Goal:
- 啟動 VS Code，載入擴充，打開 SettingsPanel
- 新增一個腳本，按下「Run」後應該看到 runLog 與 runDone 訊息
- 觸發 `statusBarHelper._abortByCommand` 後，VM 定時器與 disposables 應被清理

Constraints:
- 使用官方 test harness；如無 `npm test`，請新增腳本與 README 指引
- 測試不要依賴外網；使用暫存檔案夾

Deliverables:
- `src/test/extension.test.ts` 內的具體測試案例
- 新增/更新 `package.json` scripts 與最小 README 測試說明

<!--
Maintenance Notes
LastMaintSync: 2025-08-16
Update Triggers:
1. 測試框架或 `@vscode/test-electron` 版本策略改變
2. 需新增 Script Store / ImportExport / Polling 相關測試步驟
3. package.json scripts 結構調整（如新增 test:e2e / test:unit）
Change Log:
2025-08-16: Added maintenance block for consistency.
-->
