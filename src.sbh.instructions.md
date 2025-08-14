---
paths:
  - src/**
task: code
---
# SBH Code Rules (src/**)

## Status bar item lifecycle
- 任何對 `RUNTIMES` 的新增/刪除都要同步維護 `MESSAGE_HANDLERS` 與 `MESSAGE_QUEUES`
- `abortByCommand()` 必須：abort signal、delete runtime、清理 handlers/queues、推送 UI 狀態

## VM sandbox contract
- 對 `vscode` 的深層 Proxy 必須把 `Disposable` 收進 `disposables` 集合
- 重新包裝 `setTimeout/Interval`，在 `stop` 或 VM 結束時逐一清掉
- `console` 需導流到 SettingsPanel 的 runLog，字串化非字串參數

## Bridge namespace（示意）
- `v1.storage.global/workspace`：get/set/del/clear/keys/size
- `v1.fs.*`：scope 限制在擴充 storageUri 之下；拒絕絕對路徑與 `..`
- 任何 bridge 例外需轉換為 `{ ok:false, error }` 回傳

## Webview 協定
- 只用 `vscode.postMessage` 與 `onDidReceiveMessage`
- 事件類型必須集中定義（e.g. `'runLog' | 'runDone' | 'runAbort' | 'itemsChanged'`）
- 開 panel 時推送完整狀態；更動後只發差異事件
