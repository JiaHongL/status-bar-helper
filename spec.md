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
