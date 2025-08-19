import * as vscode from 'vscode';
import { writeSmartBackup, listSmartBackups, cleanupOldBackups, SmartBackupContent } from './utils/backup';
import { loadFromGlobal } from './globalStateManager';

export type SmartBackupStatus = {
  lastBackupTime: Date | null;      // 上次成功備份的時間
  nextCheckTime: Date;              // 下次檢查的預計時間
  lastChangeTime: Date | null;      // 上次偵測到變更的時間
  currentInterval: number;          // 當前排程的間隔（分鐘）
  changeFrequency: 'high' | 'medium' | 'low' | 'minimal'; // 變更頻率標記
  error?: string;                   // 最近錯誤訊息（如有）
};

// ---- 持久化鍵與安全常數 -----------------------------------------
const GS_KEYS = {
  fireAt: 'smartBackup.fireAt',                 // number (ms)
  lastBackupTime: 'smartBackup.lastBackupTime', // number (ms)
  currentInterval: 'smartBackup.currentInterval',
  changeSignature: 'smartBackup.changeSignature',
  changeTimestamps: 'smartBackup.changeTimestamps', // number[]
};

/** 最長多久一定要檢查一次（避免完全不檢查）— 調到 36 小時 */
const HARD_MAX_CHECK_MIN = 60 * 36;
/** 最小排程間隔（避免太頻繁）- 60 分鐘 */
const MIN_INTERVAL_MIN   = 60;
/** 合理上限 - 5 天 */
const MAX_INTERVAL_MIN   = 5 * 60 * 24;

export class SmartBackupManager {
  private timer: NodeJS.Timeout | null = null; // 定時器
  private lastBackupTime: Date | null = null;  // 上次備份時間
  private lastChangeTime: Date | null = null;  // 上次偵測到變更
  private currentInterval: number = 360;       // 預設 6 小時
  private error: string | undefined;           // 最近錯誤
  private context: vscode.ExtensionContext;    // VSCode context
  private basePath: string;                    // 備份存放路徑
  private changeSignature: string = '';        // 變更簽章（含 script hash）
  private changeCount: number = 0;             // 24h 視窗內變更次數
  private retryCount: number = 0;              // 連續錯誤次數
  private fireAt: number = 0;                  // 下一次觸發時間（ms epoch）
  private changeTimestamps: number[] = [];     // 24h 內的變更時間戳（ms）

  constructor(context: vscode.ExtensionContext) {
    this.context = context;
    this.basePath = context.globalStorageUri.fsPath;
  }

  // 啟動排程（含復原 fireAt 與硬性保險 + 開啟立即檢查；若今天尚未備份則強制備份一次）
  public async start() {
    // 確保目錄存在
    await vscode.workspace.fs.createDirectory(this.context.globalStorageUri);
    await this.loadState();

    // 聚焦時，如果已過期則補跑
    this.context.subscriptions.push(
      vscode.window.onDidChangeWindowState((s) => {
        if (s.focused && this.fireAt && this.fireAt <= Date.now()) {
          void this.checkAndBackup(false);
        }
      })
    );

    // 一開啟就檢查一次；若今天沒有備份，強制備份
    const now = new Date();
    const backedUpToday = !!this.lastBackupTime && this.isSameLocalDate(this.lastBackupTime, now);

    // 立即檢查一次（forceBackup = 今天尚未備份）
    await this.checkAndBackup({ forceBackup: !backedUpToday, skipIfBackedUpToday: backedUpToday, reason: 'startup' });

    // 若前面已檢查，內部會自動依狀態排程；以下為硬性保險再補一層（可留可去）
    const hardMaxMs = HARD_MAX_CHECK_MIN * 60 * 1000;
    const lastBackupMs = this.lastBackupTime ? this.lastBackupTime.getTime() : 0;
    const overdueHard = lastBackupMs && (Date.now() - lastBackupMs) > hardMaxMs;
    if (overdueHard) {
      await this.checkAndBackup(false);
    }
  }

  // 停止排程
  public stop() {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }

  // 可供外部在 deactivate 時呼叫
  public dispose() {
    this.stop();
    this.persistState();
  }

  // 設定下一次檢查（分鐘）
  private schedule(intervalMinutes: number) {
    this.stop();

    // 夾在最小/最大之間
    const boundedMin = Math.min(
      Math.max(intervalMinutes, MIN_INTERVAL_MIN),
      MAX_INTERVAL_MIN
    );
    const boundedMs = boundedMin * 60 * 1000;

    this.currentInterval = boundedMin;
    this.fireAt = Date.now() + boundedMs;

    // 持久化 fireAt 與 interval
    void this.context.globalState.update(GS_KEYS.fireAt, this.fireAt);
    void this.context.globalState.update(GS_KEYS.currentInterval, this.currentInterval);

    this.timer = setTimeout(() => this.checkAndBackup(false), boundedMs);
  }

  // 從已存在的備份與 globalState 初始化狀態
  private async loadState() {
    const backups = await listSmartBackups(this.basePath);
    if (backups.length > 0) {
      this.lastBackupTime = backups[0].timestamp;
      this.changeSignature = backups[0].changeSignature;
    }

    // 讀取持久化的 runtime 狀態
    const fireAt = this.context.globalState.get<number>(GS_KEYS.fireAt);
    const curInt = this.context.globalState.get<number>(GS_KEYS.currentInterval);
    const lastBk = this.context.globalState.get<number>(GS_KEYS.lastBackupTime);
    const sig    = this.context.globalState.get<string>(GS_KEYS.changeSignature);
    const chTs   = this.context.globalState.get<number[]>(GS_KEYS.changeTimestamps);

    if (typeof fireAt === 'number') this.fireAt = fireAt;
    if (typeof curInt === 'number') this.currentInterval = curInt;
    if (typeof lastBk === 'number') this.lastBackupTime = new Date(lastBk);
    if (typeof sig === 'string') this.changeSignature = sig;
    if (Array.isArray(chTs)) {
      this.changeTimestamps = chTs;
      // 清掉超過 24 小時的舊紀錄
      const dayAgo = Date.now() - 24 * 60 * 60 * 1000;
      this.changeTimestamps = this.changeTimestamps.filter(t => t >= dayAgo);
      this.changeCount = this.changeTimestamps.length;
    }

    // 若完全沒簽章，使用當前 items 建立一次，避免啟動後立刻誤判
    if (!this.changeSignature) {
      const items = loadFromGlobal(this.context);
      this.changeSignature = this.computeSignature(items);
    }
  }

  private persistState() {
    void this.context.globalState.update(GS_KEYS.fireAt, this.fireAt || undefined);
    void this.context.globalState.update(GS_KEYS.currentInterval, this.currentInterval);
    void this.context.globalState.update(
      GS_KEYS.lastBackupTime,
      this.lastBackupTime ? this.lastBackupTime.getTime() : undefined
    );
    void this.context.globalState.update(GS_KEYS.changeSignature, this.changeSignature || undefined);
    void this.context.globalState.update(GS_KEYS.changeTimestamps, this.changeTimestamps || []);
  }

  // 檢查是否有變更，若有則執行備份；forceBackup = true 時，今日尚未備份會強制備份一次
  private async checkAndBackup(arg: boolean | {
    forceBackup?: boolean;
    skipIfBackedUpToday?: boolean;
    reason?: 'startup' | 'focus' | 'timer';
  } = false) {
    const opts = typeof arg === 'boolean' ? { forceBackup: arg } : (arg || {});
    const forceBackup = !!opts.forceBackup;
    const skipIfBackedUpToday = !!opts.skipIfBackedUpToday;

    try {
      const items = loadFromGlobal(this.context);
      const signature = this.computeSignature(items);
      const now = new Date();
      const hasChanged = signature !== this.changeSignature;

      // 啟動時若今天已有備份 → 直接跳過備份（但仍會計算/排程下一次）
      if (skipIfBackedUpToday && this.lastBackupTime && this.isSameLocalDate(this.lastBackupTime, now)) {
        // 不變更 changeCount、不備份，只排程下一次
        this.currentInterval = this.calculateNextInterval(this.currentInterval, false, this.changeCount);
        this.schedule(this.currentInterval);
        this.persistState();
        return;
      }

      // 只有真的有變更時才計入變更頻率
      if (hasChanged) {
        const nowMs = Date.now();
        const dayAgo = nowMs - 24 * 60 * 60 * 1000;
        this.changeTimestamps.push(nowMs);
        this.changeTimestamps = this.changeTimestamps.filter(t => t >= dayAgo);
        this.changeCount = this.changeTimestamps.length;

        this.lastChangeTime = now;
        this.changeSignature = signature;
      }

      // 有變更 → 備份；或強制備份（但啟動時被上面 guard 擋住就不會進來）
      if (hasChanged || forceBackup) {
        await this.doBackup(items, hasChanged ? signature : this.changeSignature || signature);
        this.lastBackupTime = now;
        this.retryCount = 0;
        await cleanupOldBackups(this.basePath);
      }

      this.currentInterval = this.calculateNextInterval(this.currentInterval, hasChanged, this.changeCount);
      this.schedule(this.currentInterval);

    } catch (e: any) {
      this.error = e?.message || String(e);
      this.retryCount++;
      if (this.retryCount <= 3) {
        this.currentInterval = 30;
        this.schedule(30);
      } else {
        this.stop();
      }
    } finally {
      this.persistState();
    }
  }

  // 實際執行一次備份
  private async doBackup(items: any[], signature: string) {
    const now = new Date();
    const freq = this.getChangeFrequency();
    const content: SmartBackupContent = {
      timestamp: now.toISOString(),
      type: 'smart',
      changeSignature: signature,
      changeFrequency: freq,
      items: items.map(i => ({
        ...i,
        // 存 script 的 hash 供比對；內容本體不落地以節省空間
        scriptHash: i.script ? this.hashString(String(i.script)) : undefined,
        script: i.script ?? undefined,
      }))
    };
    await writeSmartBackup(this.basePath, content);
  }

  // 計算簽章（含 script hash）
  private computeSignature(items: any[]): string {
    return items
      .map(i => {
        const scriptHash = i.script ? this.hashString(String(i.script)) : '';
        return `${i.command}|${i.text}|${i.tooltip}|${i.hidden?'1':'0'}|${i.enableOnInit?'1':'0'}|${scriptHash}`;
      })
      .sort()
      .join('~');
  }

  // 簡易字串 hash（避免額外相依）
  private hashString(input: string): string {
    let h = 0;
    for (let i = 0; i < input.length; i++) {
      h = ((h << 5) - h) + input.charCodeAt(i);
      h |= 0;
    }
    return h.toString(16);
  }

  private calculateNextInterval(current: number, hasChanged: boolean, recentChangeCount: number): number {
    if (hasChanged) {
      // 有變更：但你不常改，抓寬鬆一點
      if (recentChangeCount >= 3) { return 720; }  // 12 小時
      if (recentChangeCount >= 1) { return 960; }  // 16 小時
      return 1440;                                 // 24 小時
    } else {
      // 沒變更：逐步拉長，最多 48 小時
      const next = Math.round(current * 1.8);
      return Math.min(Math.max(next, 720), MAX_INTERVAL_MIN); // 至少 12h，最多 5 天
    }
  }

  // 變更頻率標籤（依 24h 視窗）
  private getChangeFrequency(): 'high' | 'medium' | 'low' | 'minimal' {
    if (this.changeCount >= 6) return 'high';
    if (this.changeCount >= 3) return 'medium';
    if (this.changeCount >= 1) return 'low';
    return 'minimal';
  }

  private isSameLocalDate(a: Date, b: Date) {
    return a.getFullYear() === b.getFullYear()
      && a.getMonth() === b.getMonth()
      && a.getDate() === b.getDate();
  }

  // 對外提供目前狀態（用 fireAt 呈現更精準的 nextCheckTime）
  public getStatus(): SmartBackupStatus {
    const next = this.fireAt
      ? new Date(this.fireAt)
      : new Date(Date.now() + this.currentInterval * 60 * 1000);

    return {
      lastBackupTime: this.lastBackupTime,
      nextCheckTime: next,
      lastChangeTime: this.lastChangeTime,
      currentInterval: this.currentInterval,
      changeFrequency: this.getChangeFrequency(),
      error: this.error
    };
  }
}
