# 智慧型定時備份 (Smart Timed Backup) 規格書

## 必須遵守

不影響原本程式碼的正確行為，並且能夠在不干擾使用者的情況下自動運行。智慧型定時備份應該是完全自動化的，無需使用者手動介入。

## 概述

智慧型定時備份是 Status Bar Helper 擴充功能的核心備份策略之一，能夠根據狀態列項目的變更頻率動態調整備份間隔，確保重要變更得到及時保護，同時避免過度備份造成儲存負擔。

## 核心邏輯

智慧型定時備份會監控狀態列項目的所有變更，並根據變更頻率自動調整備份間隔。系統採用「有異動才備份」的原則，避免無意義的重複備份。

## 基本參數 (固定值)

- **最小間隔**: 6小時 (360分鐘)
- **每日保證**: 至少2次備份 (配合6小時間隔)
- **觸發條件**: 只有在偵測到實際變更時才執行備份
- **監控範圍**: 狀態列項目的新增、刪除、修改 (script/text/tooltip/hidden/enableOnInit)

## 變更偵測機制

### 變更簽章計算

```typescript
interface ChangeDetection {
  // 變更簽章計算 (類似現有 adaptive polling)
  signature: string; // command|scriptHash|text|tooltip|hidden|enableOnInit
  lastSignature: string; // 上次記錄的簽章
  hasChanged: boolean; // 是否有變更
  changeCount: number; // 變更次數統計
}
```

### 簽章組成說明

變更簽章由以下欄位組合而成：

- `command`: 指令名稱
- `scriptHash`: 腳本內容的 SHA256 雜湊值
- `text`: 顯示文字
- `tooltip`: 工具提示文字
- `hidden`: 是否隱藏
- `enableOnInit`: 是否在啟動時執行

## 智慧間隔調整策略

### 變更頻率分級 (固定規則)

1. **高頻變更** (1小時內多次變更)
   - 間隔: 6小時 (基本間隔)
   - 描述: 用戶正在積極開發/調試階段

2. **中頻變更** (1天內2-3次變更)
   - 間隔: 8小時
   - 描述: 正常使用階段

3. **低頻變更** (超過1天才有變更)
   - 間隔: 12小時
   - 描述: 穩定使用階段

4. **超低頻變更** (超過3天無變更)
   - 間隔: 24小時 (但每日仍至少1次檢查)
   - 描述: 幾乎不變更的狀態

### 備份時機判斷

```typescript
interface BackupTiming {
  nextCheckTime: Date;     // 下次檢查時間
  lastBackupTime: Date;    // 上次備份時間
  lastChangeTime: Date;    // 上次變更時間
  currentInterval: number; // 當前間隔 (分鐘)
  changeFrequency: 'high' | 'medium' | 'low' | 'minimal';
}
```

## 執行流程

### 1. 初始化階段

```
啟動擴充功能 → 載入上次備份狀態 → 設定第一次檢查時間 (6小時後)
```

### 2. 定期檢查循環

```
計時器觸發 → 計算當前簽章 → 比對是否有變更 → 
  ├─ 有變更 → 執行備份 → 更新變更統計 → 調整下次間隔
  └─ 無變更 → 更新檢查時間 → 維持或延長間隔
```

### 3. 間隔調整邏輯

```typescript
function calculateNextInterval(
  currentInterval: number,
  hasChanged: boolean,
  recentChangeCount: number
): number {
  if (hasChanged) {
    // 有變更時，根據最近變更頻率調整
    if (recentChangeCount >= 3) return 360; // 6小時 (高頻)
    if (recentChangeCount >= 2) return 480; // 8小時 (中頻)
    return 720; // 12小時 (低頻)
  } else {
    // 無變更時，逐漸延長間隔 (但不超過24小時)
    return Math.min(currentInterval * 1.5, 1440);
  }
}
```

## 備份檔案管理

### 檔案命名格式

```
智慧備份檔案格式:
smart-backup-YYYY-MM-DD-HH-mm.json

範例:
smart-backup-2025-08-16-14-30.json (下午2:30的備份)
smart-backup-2025-08-16-20-30.json (晚上8:30的備份)
```

### 儲存空間管理 (固定策略)

- **保留策略**: 最多保留10次智慧備份，超過則自動清理最舊的備份
- **自動清理**: 每次執行智慧備份後清理過期檔案
- **空間限制**: 智慧備份總大小不超過50MB
- **備份前提**: 有異動才進行備份

### 檔案結構

```json
{
  "timestamp": "2025-08-16T14:30:00.000Z",
  "type": "smart",
  "changeSignature": "cmd1|abc123|text1|tooltip1|false|true",
  "changeFrequency": "medium",
  "items": [
    {
      "command": "example.command",
      "text": "範例按鈕",
      "tooltip": "這是範例工具提示",
      "script": "console.log('Hello World');",
      "hidden": false,
      "enableOnInit": true
    }
  ]
}
```

## UI 設計規格

### 備份管理視窗（Backup Management Overlay）

#### 結構與功能

- **上方操作列**：
  - 「手動備份」按鈕（primary，codicon-save）

- **備份檔案列表**（表格或清單）：
  - 欄位：
    1. 備份時間（如 2025-08-16 14:30）
    2. 時間（相對時間，如 2小時前）
    3. 檔案大小（如 2.3 KB）
    4. 數量（備份內的項目數）
    5. 還原按鈕（icon，codicon-debug-restart）
    6. 刪除按鈕（icon，codicon-trash）

- **互動行為**：
  - 點擊「還原」按鈕時，彈出確認視窗，明確顯示「確定要還原哪個備份時間」
  - 點擊「刪除」按鈕時，彈出確認視窗，明確顯示「確定要刪除哪個備份時間」

- **無障礙設計**：
  - 按鈕支援鍵盤操作，ESC 關閉 overlay，Enter 確認

#### HTML 結構範例

```html
<div class="backup-overlay" id="backup-management-overlay">
  <div class="overlay-content">
    <div class="overlay-header">
      <span class="overlay-title"><i class="codicon codicon-folder"></i> 備份管理</span>
      <button class="close-btn" title="關閉"><i class="codicon codicon-close"></i></button>
    </div>
    <div class="overlay-actions">
      <button class="action-btn primary" id="manual-backup-btn"><i class="codicon codicon-save"></i> 手動備份</button>
    </div>
    <div class="backup-list">
      <table>
        <thead>
          <tr>
            <th>備份時間</th>
            <th>時間</th>
            <th>檔案大小</th>
            <th>數量</th>
            <th>還原</th>
            <th>刪除</th>
          </tr>
        </thead>
        <tbody>
          <!-- 備份檔案列 -->
        </tbody>
      </table>
    </div>
  </div>
</div>
```

#### 確認視窗行為

- 按下「還原」時：
  - 顯示：「確定要還原此備份？（2025-08-16 14:30）」
- 按下「刪除」時：
  - 顯示：「確定要刪除此備份？（2025-08-16 14:30）」

#### 其他

- 支援響應式設計，表格在小螢幕下可橫向捲動或壓縮顯示。

### 互動行為規範

#### 狀態更新時機

1. **即時更新**：
   - 備份完成後立即更新狀態
   - 檢查完成後更新下次時間
   - 錯誤發生時立即顯示錯誤狀態

2. **定期更新**：
   - 每30秒更新相對時間顯示
   - 每5分鐘重新計算下次檢查時間

3. **使用者觸發**：
   - 開啟設定面板時強制刷新
   - 點擊備份管理按鈕時更新資料

#### 動畫效果

```css
/* 狀態切換動畫 */
.status-icon {
  transition: color 0.3s ease, transform 0.2s ease;
}

.status-icon.pulse {
  animation: pulse 2s infinite;
}

@keyframes pulse {
  0% { opacity: 1; }
  50% { opacity: 0.6; }
  100% { opacity: 1; }
}

/* 覆蓋層開啟動畫 */
.backup-overlay {
  opacity: 0;
  transform: translateY(20px);
  transition: all 0.3s ease;
}

.backup-overlay.show {
  opacity: 1;
  transform: translateY(0);
}
```

### 狀態更新時機

- 每次檢查完成後更新
- 備份完成後立即更新
- 使用者開啟設定面板時重新整理

## 與其他備份策略的整合

### 備份策略優先順序

1. **匯入前備份**: 不影響智慧備份時程
2. **手動備份**: 不影響智慧備份時程
3. **重複避免**: 若手動備份距離上次智慧備份不到30分鐘，智慧備份會延後到下個週期

### 檔案系統協調

- 所有備份策略共用相同的備份目錄結構
- 智慧備份不會覆蓋其他類型的備份檔案
- 自動清理只處理智慧備份檔案，不影響手動或匯入前備份

## 錯誤處理

### 備份失敗處理

- **備份失敗**: 記錄錯誤，30分鐘後重試，最多重試3次
- **連續失敗**: 3次重試後暫停智慧備份，記錄嚴重錯誤
- **恢復機制**: 下次變更發生時自動重新啟用

### 錯誤日誌

所有錯誤都會記錄到 VS Code 的輸出面板，包含：

- 錯誤時間戳記
- 錯誤類型和詳細訊息
- 當前備份狀態

## 技術實作細節

### 計時器管理

```typescript
class SmartBackupTimer {
  private timer: NodeJS.Timeout | null = null;
  private currentInterval: number = 360; // 6小時
  
  public schedule(intervalMinutes: number): void {
    this.clear();
    this.timer = setTimeout(() => {
      this.executeBackupCheck();
    }, intervalMinutes * 60 * 1000);
  }
  
  public clear(): void {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }
}
```

### 變更監控

系統會在以下時機檢查變更：
- 使用者修改狀態列項目時
- 匯入新項目時
- 定期檢查計時器觸發時
- 擴充功能啟動時

### 效能優化

- 變更簽章計算採用快取機制，避免重複計算
- 備份檔案寫入採用異步操作，不阻塞 UI
- 大型腳本內容採用增量比較，提升檢查效率

## 設計目標達成

這個智慧型定時備份設計確保了：

1. **變更保護**: 有異動時及時備份
2. **資源節約**: 無變更時不浪費空間
3. **靈活調整**: 根據使用模式動態優化
4. **可靠性**: 每日保證最少備份次數
5. **自動化**: 完全自動運行，無需使用者設定

## 版本歷史

- v1.0 (2025-08-16): 初始規格版本
- 後續版本將根據使用者回饋和實際使用情況進行調整

---

*本規格書是 Status Bar Helper 擴充功能備份機制的技術文件，用於指導開發實作和維護工作。*
