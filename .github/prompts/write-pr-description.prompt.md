# Task: 產生 PR 內容（變更摘要）

Context: #changes #project
Goal:
- 根據這次 diff 產生 Summary（做了什麼/為什麼）
- 梳理 Impact（受影響模組、相容性、邊界情況）
- 給出 Rollback Plan 與 Test Plan（含指令）

Constraints:
- 使用 repo 的 PR 模板欄位
Deliverables:
- Markdown 片段，可直接貼到 PR 描述

<!--
Maintenance Notes
LastMaintSync: 2025-08-16
Update Triggers:
1. PR 描述需要新增欄位（Security Impact / Performance Benchmark 等）
2. Rollback / Test Plan 標準化格式改版
3. 引入自動化 Changelog 產生流程需要補欄位
Change Log:
2025-08-16: Added maintenance block.
-->
