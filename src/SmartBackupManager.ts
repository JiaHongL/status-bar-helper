import * as vscode from 'vscode';
import * as path from 'path';
import { writeSmartBackup, listSmartBackups, cleanupOldBackups, SmartBackupContent, SmartBackupFileMeta } from './utils/backup';
import { loadFromGlobal } from './globalStateManager';

export type SmartBackupStatus = {
  lastBackupTime: Date | null;      // 上次成功備份的時間
  nextCheckTime: Date;              // 下次檢查的預計時間
  lastChangeTime: Date | null;      // 上次偵測到變更的時間
  currentInterval: number;          // 當前排程的間隔（分鐘）
  changeFrequency: 'high' | 'medium' | 'low' | 'minimal'; // 變更頻率標記
  error?: string;                   // 最近錯誤訊息（如有）
};

export class SmartBackupManager {
  private timer: NodeJS.Timeout | null = null; // 定時器，負責排程備份檢查
  private lastBackupTime: Date | null = null;  // 上次備份時間
  private lastChangeTime: Date | null = null;  // 上次偵測到變更的時間
  private currentInterval: number = 360;       // 預設間隔 360 分鐘（6小時）
  private error: string | undefined;           // 錯誤訊息暫存
  private context: vscode.ExtensionContext;    // VSCode 擴充 context，用來存取 globalState 與檔案路徑
  private basePath: string;                    // 備份檔存放路徑
  private changeSignature: string = '';        // 用於比對是否有變更的簽章
  private changeCount: number = 0;             // 累計變更次數
  private retryCount: number = 0;              // 重試次數，失敗時會用

  constructor(context: vscode.ExtensionContext) {
    this.context = context;
    this.basePath = context.globalStorageUri.fsPath; // 指定備份存放於 globalStorage
  }

  // 啟動備份排程
  public async start() {
    await this.loadState();
    this.schedule(this.currentInterval);
  }

  // 停止備份排程
  public stop() {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }

  // 設定下一次檢查間隔（分鐘）
  private schedule(intervalMinutes: number) {
    this.stop();
    this.timer = setTimeout(() => this.checkAndBackup(), intervalMinutes * 60 * 1000);
  }

  // 從已存在的備份中初始化狀態
  private async loadState() {
    // 可擴充：從 globalState 載入更多狀態，目前僅取最近備份
    const backups = await listSmartBackups(this.basePath);
    if (backups.length > 0) {
      this.lastBackupTime = backups[0].timestamp;
      this.changeSignature = backups[0].changeSignature;
    }
    // TODO: 可考慮從 globalState 記錄 lastChangeTime
  }

  // 檢查是否有變更，若有則執行備份
  private async checkAndBackup() {
    try {
      const items = loadFromGlobal(this.context); // 取當前設定
      const signature = this.computeSignature(items);
      const now = new Date();
      let hasChanged = signature !== this.changeSignature;

      if (hasChanged) {
        this.changeCount++;
        this.lastChangeTime = now;
        this.changeSignature = signature;
        await this.doBackup(items, signature);
        this.lastBackupTime = now;
        this.retryCount = 0;
      }

      // 調整下一次的間隔（動態調整策略）
      this.currentInterval = this.calculateNextInterval(this.currentInterval, hasChanged, this.changeCount);

      // 清理舊備份
      await cleanupOldBackups(this.basePath);

      // 再次排程
      this.schedule(this.currentInterval);

    } catch (e: any) {
      this.error = e.message || String(e);
      this.retryCount++;

      if (this.retryCount <= 3) {
        this.schedule(30); // 錯誤時 30 分鐘後重試
      } else {
        // 超過 3 次錯誤 → 停止備份，等下次變更再恢復
        this.stop();
      }
    }
  }

  // 執行一次實際的備份
  private async doBackup(items: any[], signature: string) {
    const now = new Date();
    const freq = this.getChangeFrequency();
    const content: SmartBackupContent = {
      timestamp: now.toISOString(),
      type: 'smart',
      changeSignature: signature,
      changeFrequency: freq,
      items: items.map(i => ({ ...i, script: undefined })) // 選擇性：不存 script 內容，減少容量
    };
    await writeSmartBackup(this.basePath, content);
  }

  // 計算簽章，用於比對變更
  private computeSignature(items: any[]): string {
    return items.map(i => `${i.command}|${i.text}|${i.tooltip}|${i.hidden?'1':'0'}|${i.enableOnInit?'1':'0'}`)
      .sort().join('~');
  }

  // 根據變更次數與狀態調整下一次備份間隔
  private calculateNextInterval(current: number, hasChanged: boolean, recentChangeCount: number): number {
    if (hasChanged) {
      if (recentChangeCount >= 3) { return 360; } // 高頻 → 6小時
      if (recentChangeCount >= 2) { return 480; } // 中頻 → 8小時
      return 720; // 低頻 → 12小時
    } else {
      return Math.min(current * 1.5, 1440); // 沒變更 → 間隔延長，最多一天
    }
  }

  // 判斷變更頻率標籤
  private getChangeFrequency(): 'high' | 'medium' | 'low' | 'minimal' {
    if (this.changeCount >= 3) { return 'high'; }
    if (this.changeCount >= 2) { return 'medium'; }
    if (this.changeCount >= 1) { return 'low'; }
    return 'minimal';
  }

  // 對外提供目前狀態
  public getStatus(): SmartBackupStatus {
    return {
      lastBackupTime: this.lastBackupTime,
      nextCheckTime: new Date(Date.now() + this.currentInterval * 60 * 1000),
      lastChangeTime: this.lastChangeTime,
      currentInterval: this.currentInterval,
      changeFrequency: this.getChangeFrequency(),
      error: this.error
    };
  }
}
