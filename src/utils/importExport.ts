// importExport.ts
// Status Bar Helper Import/Export 核心邏輯
// 嚴格維持欄位順序、未知欄位保留、型別檢查、錯誤安全

import type { SbhItem } from '../globalStateManager';

export type MergeStrategy = 'replace' | 'append';
export type ConflictPolicy = 'skip' | 'newId';

export interface ParseResult {
  valid: boolean;
  items: SbhItem[];
  error?: string;
  raw?: any[];
}

export interface DiffResult {
  added: SbhItem[];
  replaced: SbhItem[];
  conflicted: SbhItem[];
  skipped: SbhItem[];
  unchanged: SbhItem[];
}

export interface ApplyResult {
  result: SbhItem[];
  applied: SbhItem[];
  skipped: SbhItem[];
  conflicted: SbhItem[];
  error?: string;
}

export interface ExportResult {
  json: string;
  size: number;
  items: SbhItem[];
}

// 嚴格解析與驗證，保留未知欄位與順序
export function parseAndValidate(json: string): ParseResult {
  try {
    const arr = JSON.parse(json);
    if (!Array.isArray(arr)) {
      return { valid: false, items: [], error: 'Not an array' };
    }
    // 只檢查必要欄位，保留未知欄位
    const items: SbhItem[] = [];
    for (const obj of arr) {
      if (!obj || typeof obj !== 'object') {
        return { valid: false, items: [], error: 'Item is not an object' };
      }
      if (!('command' in obj) || typeof obj.command !== 'string') {
        return { valid: false, items: [], error: 'Missing or invalid command' };
      }
      if (!('text' in obj) || typeof obj.text !== 'string') {
        return { valid: false, items: [], error: 'Missing or invalid text' };
      }
      // 允許 tooltip/script/hidden/enableOnInit 缺省
      items.push(obj as SbhItem);
    }
    return { valid: true, items, raw: arr };
  } catch (e: any) {
    return { valid: false, items: [], error: e?.message || String(e) };
  }
}

export function estimateSize(items: SbhItem[]): { total: number; perItem: number[] } {
  const perItem = items.map(i => Buffer.byteLength(JSON.stringify(i), 'utf8'));
  return { total: perItem.reduce((a, b) => a + b, 0), perItem };
}

// Diff: 比對現有與匯入，找出新增、取代、衝突、略過、未變
export function diff(current: SbhItem[], incoming: SbhItem[]): DiffResult {
  const curMap = new Map(current.map(i => [i.command, i]));
  const incMap = new Map(incoming.map(i => [i.command, i]));
  const added: SbhItem[] = [];
  const replaced: SbhItem[] = [];
  const conflicted: SbhItem[] = [];
  const skipped: SbhItem[] = [];
  const unchanged: SbhItem[] = [];
  for (const inc of incoming) {
    if (!curMap.has(inc.command)) {
      added.push(inc);
    } else {
      const cur = curMap.get(inc.command)!;
      if (JSON.stringify(cur) === JSON.stringify(inc)) {
        unchanged.push(inc);
      } else {
        conflicted.push(inc);
      }
    }
  }
  for (const cur of current) {
    if (!incMap.has(cur.command)) {
      skipped.push(cur);
    }
  }
  return { added, replaced, conflicted, skipped, unchanged };
}

// 匯入套用（不動原始順序與未知欄位，保留現有項目的 hidden/enableOnInit 設定）
export function applyImport(
  current: SbhItem[],
  incoming: SbhItem[],
  strategy: MergeStrategy,
  conflictPolicy: ConflictPolicy
): ApplyResult {
  const curMap = new Map(current.map(i => [i.command, i]));
  const result: SbhItem[] = [];
  const applied: SbhItem[] = [];
  const skipped: SbhItem[] = [];
  const conflicted: SbhItem[] = [];
  
  // 輔助函數：合併項目時保留現有的 hidden/enableOnInit 設定
  const mergeWithExisting = (incoming: SbhItem, existing?: SbhItem): SbhItem => {
    if (!existing) {
      // 新項目，使用預設值
      return {
        ...incoming,
        hidden: incoming.hidden ?? false,
        enableOnInit: incoming.enableOnInit ?? false
      };
    }
    // 現有項目，保留 hidden/enableOnInit 設定，其他欄位使用匯入的值
    return {
      ...incoming,
      hidden: existing.hidden,
      enableOnInit: existing.enableOnInit
    };
  };
  
  if (strategy === 'replace') {
    // replace 策略：更新現有項目，新增不存在的項目
    for (const inc of incoming) {
      const existing = curMap.get(inc.command);
      if (existing) {
        if (conflictPolicy === 'skip') {
          skipped.push(inc);
        } else if (conflictPolicy === 'newId') {
          // 產生新 command id
          const newInc = { ...inc, command: inc.command + '_' + Math.random().toString(36).slice(2, 6) };
          const merged = mergeWithExisting(newInc);
          result.push(merged);
          applied.push(merged);
        } else {
          // 預設：直接更新現有項目（保留 hidden/enableOnInit）
          const merged = mergeWithExisting(inc, existing);
          result.push(merged);
          applied.push(merged);
        }
      } else {
        const merged = mergeWithExisting(inc);
        result.push(merged);
        applied.push(merged);
      }
    }
    // 保留未被匯入覆蓋的現有項目
    for (const cur of current) {
      if (!incoming.some(inc => inc.command === cur.command)) {
        result.push(cur);
      }
    }
    return { result, applied, skipped, conflicted };
  } else {
    // append 策略：保留全部現有項目，只新增不存在的
    result.push(...current);
    for (const inc of incoming) {
      const existing = curMap.get(inc.command);
      if (existing) {
        if (conflictPolicy === 'skip') {
          skipped.push(inc);
        } else if (conflictPolicy === 'newId') {
          const newInc = { ...inc, command: inc.command + '_' + Math.random().toString(36).slice(2, 6) };
          const merged = mergeWithExisting(newInc);
          result.push(merged);
          applied.push(merged);
        }
      } else {
        const merged = mergeWithExisting(inc);
        result.push(merged);
        applied.push(merged);
      }
    }
    return { result, applied, skipped, conflicted };
  }
}

export function exportSelection(items: SbhItem[], selected: string[]): ExportResult {
  const sel = items.filter(i => selected.includes(i.command));
  const json = JSON.stringify(sel, null, 2);
  return { json, size: Buffer.byteLength(json, 'utf8'), items: sel };
}
