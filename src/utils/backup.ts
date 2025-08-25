import * as fs from 'fs';
import * as path from 'path';
import { promisify } from 'util';

// 把 fs 的 callback API 包裝成 Promise 版本，方便用 async/await
const readdir = promisify(fs.readdir);
const stat = promisify(fs.stat);
const unlink = promisify(fs.unlink);
const writeFile = promisify(fs.writeFile);
const readFile = promisify(fs.readFile);

// 單一備份檔案的中繼資料 (給 list 用)
export interface SmartBackupFileMeta {
  file: string;                 // 備份檔路徑
  timestamp: Date;              // 備份時間
  size: number;                 // 檔案大小 (bytes)
  itemsCount: number;           // items 陣列長度
  changeSignature: string;      // 變更簽章 (用來判斷內容差異)
  changeFrequency: 'high' | 'medium' | 'low' | 'minimal'; // 變更頻率標記
}

// 備份檔內容格式
export interface SmartBackupContent {
  timestamp: string;            // 備份時間 (ISO 字串)
  type: 'smart';                // 固定為 smart
  changeSignature: string;      // 變更簽章
  changeFrequency: 'high' | 'medium' | 'low' | 'minimal'; // 變更頻率
  items: any[];                 // 被備份的資料陣列
}

// 備份目錄名稱 (固定字串，避免衝突)
export const BACKUP_DIR = 'sbh-backups_mefbv8rlaf1peg_mefc0k4t9sy1fy';
const BACKUP_PREFIX = 'smart-backup-'; // 備份檔名前綴
const BACKUP_SUFFIX = '.json';         // 備份檔名副檔名
const MAX_BACKUPS = 14;                // 最多保留幾份備份
const MAX_TOTAL_SIZE = 50 * 1024 * 1024; // 備份總容量上限 (50MB)

// 確保備份目錄存在，不存在就建立
export async function ensureBackupDir(basePath: string) {
  const dir = path.join(basePath, BACKUP_DIR);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true }); // 遞迴建立資料夾
  }
  return dir;
}

// 產生備份檔案名稱 (依照時間命名，精確到分鐘)
export function getBackupFileName(date: Date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  const h = String(date.getHours()).padStart(2, '0');
  const min = String(date.getMinutes()).padStart(2, '0');
  const ms = String(date.getMilliseconds()).padStart(3, '0');
  return `${BACKUP_PREFIX}${y}-${m}-${d}-${h}-${min}-${ms}${BACKUP_SUFFIX}`;
}

// 建立一個新的備份檔案
export async function writeSmartBackup(basePath: string, content: SmartBackupContent) {
  const dir = await ensureBackupDir(basePath);
  // 以 content.timestamp 作為檔名
  const file = path.join(dir, getBackupFileName(new Date(content.timestamp)));
  // 寫入 JSON 格式 (排版美化 2 空格)
  await writeFile(file, JSON.stringify(content, null, 2), 'utf8');
  return file;
}

// 列出所有備份檔案的中繼資料
export async function listSmartBackups(basePath: string): Promise<SmartBackupFileMeta[]> {
  const dir = await ensureBackupDir(basePath);
  // 過濾出符合命名規則的檔案
  const files = (await readdir(dir)).filter(f => f.startsWith(BACKUP_PREFIX) && f.endsWith(BACKUP_SUFFIX));
  const metas: SmartBackupFileMeta[] = [];

  for (const file of files) {
    const filePath = path.join(dir, file);
    const stats = await stat(filePath); // 取得檔案資訊
    try {
      const raw = await readFile(filePath, 'utf8');
      const json = JSON.parse(raw) as SmartBackupContent;
      // 組合中繼資料
      metas.push({
        file: filePath,
        timestamp: new Date(json.timestamp),
        size: stats.size,
        itemsCount: Array.isArray(json.items) ? json.items.length : 0,
        changeSignature: json.changeSignature,
        changeFrequency: json.changeFrequency
      });
    } catch {
      // 如果檔案壞掉或 JSON 解析失敗就跳過
    }
  }

  // 按 timestamp 由新到舊排序
  metas.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
  return metas;
}

// 清理舊的備份檔案，符合數量和容量限制
export async function cleanupOldBackups(basePath: string) {
  const dir = await ensureBackupDir(basePath);
  const metas = await listSmartBackups(basePath);

  // 只保留最新 MAX_BACKUPS 筆
  const keep = metas.slice(0, MAX_BACKUPS);
  const toDelete = metas.slice(MAX_BACKUPS);

  // 刪除超過數量的
  for (const meta of toDelete) {
    await unlink(meta.file);
  }

  // 檢查總大小是否超過 MAX_TOTAL_SIZE
  let total = keep.reduce((sum, m) => sum + m.size, 0);
  // 從舊到新刪除直到符合容量限制
  for (let i = keep.length - 1; i >= 0 && total > MAX_TOTAL_SIZE; i--) {
    await unlink(keep[i].file);
    total -= keep[i].size;
  }
}

// 讀取單一備份檔案
export async function readSmartBackup(filePath: string): Promise<SmartBackupContent | null> {
  try {
    const raw = await readFile(filePath, 'utf8');
    return JSON.parse(raw) as SmartBackupContent;
  } catch {
    return null; // 解析失敗回傳 null
  }
}
