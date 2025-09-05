# i18n / NLS 規範與檢查

本專案採 data-nls 聲明式多國語系，並以 `media/nls.en.json` 作為字典權威來源。I18nHelper 會在 Webview 啟動時套用翻譯，並對特定元件（如 Script Store 徽章、Running 標題）做保留處理。

## 規範
- HTML：以 `data-nls="<key>"` 標註可見文字或 placeholder/title（對 `input[type=text]` 與 `.search-wrap` 會自動改寫 placeholder/title）。
- JS：若需在程式中動態取字串，使用 `getNlsText('key', fallback)`。
- 字典：`media/nls.en.json` 為事實來源；其它語系（如 zh-tw）建議同步補齊，但缺漏不阻擋 build。
- 命名：使用小駝峰英文字串。HTML data-nls 與 JS getNlsText 必須一致（例如 `backupManagement`）。

## 檢查器（tools/check-nls.mjs）
- 掃描範圍：`media/**/*.html` 的 `data-nls`、`media/**/*.{js,ts}` 的 `getNlsText('key', ...)`。
- 回報：
  - Error：使用的 key 未出現在 `media/nls.en.json`。
  - Warn：key 存在於 en，但缺漏於其它語系檔（例如 `nls.zh-tw.json`）。
- 忽略：`getNlsText()` 第一參數若包含空白字元，視為以句子做 fallback 的呼叫，不視為 key。

## 使用方式
1) 於專案根目錄執行：

```sh
npm run nls:check
```

2) 可能輸出：
- ❌ Missing keys in media/nls.en.json:（需補字典）
- ⚠️ Keys not present in some locales:（可後續補翻）

## 變更歷史
- 2025-09-05：加入 NLS 檢查器；修正 `backupManagement` 被錯誤 key 覆寫的問題；清除診斷 log。

---

## Phase 2 提案（i18n 擴展與治理）

目標：提升 i18n 一致性與可維護性，避免「翻得對卻被覆寫」或「關鍵字拼錯」等再發，並建立自動化把關。

### 1) 字串格式化與複數（Formatting/Plural）

- 統一改用 `getNlsText(key, fb, ...args)` 的佔位插入（已支援 `{0}` 風格）。
- 複數場景（例如 Script Store 新腳本徽章）：先以英文規則提供 0/1/N 的字串；未來若擴充可加入簡單規則表。

### 2) 覆寫策略（Source of Truth）

- HTML 以 `data-nls` 為主；JS 僅在無 data-nls 或動態內容時呼叫 `getNlsText`。
- I18nHelper 不得以錯誤 key 覆寫既有 `data-nls` 結果；若需同時設定 `title/aria`，僅針對屬性操作，不動可見文字子節點。
- 對保留 innerHTML 的案例（Running 標題、Script Store 徽章），必須複寫保留策略於單一函式，避免重複。

### 3) 驗證與 CI

- 保留 `npm run nls:check`，作為必跑檢查。
- GitHub Actions（後續可加）：
  - PR 觸發 `npm ci && npm run nls:check && npm run compile`。
  - 將缺 key 視為 Fail；其它語系缺漏僅做警告。

### 4) 關鍵情境覆蓋（Edge cases）

- Webview 初始化時區/語言切換：`I18nHelper.initI18n()` 支援重設與全量刷新。
- 視圖切換/overlay 重建：重建 DOM 後需重新呼叫 `updateAllUITexts()`；或在組件掛載後立即呼叫 `updateScriptStoreTexts()` 等局部方法。
- 相對時間（justNow / minutesAgo / hoursAgo / daysAgo）已加入字典，並統一透過 `formatRelativeTime`。

### 5) 命名治理

- 小駝峰 key；避免縮寫與多個近義詞指同概念（以第一次出現為準）。
- 變更 key 需同步調整：HTML `data-nls`、JS `getNlsText`、各語系字典、以及檢查器白名單（若有）。

### 6) PR 審查清單（Checklists）

- [ ] 新增/修改的 UI 文案皆有 `data-nls` 或對應的 `getNlsText`。
- [ ] 執行 `npm run nls:check` 無 error。
- [ ] 若有 innerHTML 操作，確認保留子節點策略，避免覆寫已翻譯文字。
- [ ] 若有新增相對時間或數值插入，使用 `{0}` 佔位與 `formatRelativeTime` 或 `formatText`。

### 7) 驗收標準

- 切換為 zh-tw：主要頁標題、工具列、表格表頭、Script Store、備份管理等皆正確在地化。
- Console 無非必要 log；僅錯誤級輸出保留。
- 檢查器通過（en 無缺 key）。
