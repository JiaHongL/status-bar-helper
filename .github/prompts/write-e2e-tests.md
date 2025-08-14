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
