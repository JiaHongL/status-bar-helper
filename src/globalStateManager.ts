import * as vscode from 'vscode';

// ─────────────────────────────────────────────────────────────
// GlobalState 常數與介面
// ─────────────────────────────────────────────────────────────
export const GLOBAL_MANIFEST_KEY = 'sbh.sys.manifest';
export const GLOBAL_ITEMS_KEY = 'sbh.sys.items';
export const MIGRATION_FLAG_KEY = 'sbh.sys.migrated.v1';

export interface SbhManifest {
  version: number;
  items: Array<{
    command: string;
    text: string;
    tooltip?: string;
    hidden?: boolean;
    enableOnInit?: boolean;
  }>;
}

export interface SbhItemsMap {
  [command: string]: string; // script content
}

export interface SbhItem {
  command: string;
  text: string;
  tooltip?: string;
  hidden?: boolean;
  enableOnInit?: boolean;
  script: string;
}

// ─────────────────────────────────────────────────────────────
// GlobalState 管理函數
// ─────────────────────────────────────────────────────────────

export function initGlobalSyncKeys(context: vscode.ExtensionContext): void {
  context.globalState.setKeysForSync([GLOBAL_MANIFEST_KEY, GLOBAL_ITEMS_KEY]);
}

export function loadFromGlobal(context: vscode.ExtensionContext): SbhItem[] {
  const manifest = context.globalState.get<SbhManifest>(GLOBAL_MANIFEST_KEY);
  const itemsMap = context.globalState.get<SbhItemsMap>(GLOBAL_ITEMS_KEY, {});
  
  if (!manifest || !Array.isArray(manifest.items)) {
    return [];
  }
  
  return manifest.items.map(meta => ({
    ...meta,
    script: itemsMap[meta.command] || ''
  }));
}

export async function saveOneToGlobal(context: vscode.ExtensionContext, item: SbhItem): Promise<void> {
  const manifest = context.globalState.get<SbhManifest>(GLOBAL_MANIFEST_KEY, { version: 1, items: [] });
  const itemsMap = context.globalState.get<SbhItemsMap>(GLOBAL_ITEMS_KEY, {});
  
  // 更新 manifest 中的 metadata
  const existingIndex = manifest.items.findIndex(i => i.command === item.command);
  const meta = {
    command: item.command,
    text: item.text,
    tooltip: item.tooltip,
    hidden: item.hidden,
    enableOnInit: item.enableOnInit
  };
  
  if (existingIndex >= 0) {
    manifest.items[existingIndex] = meta;
  } else {
    manifest.items.push(meta);
  }
  
  // 更新 script 內容
  itemsMap[item.command] = item.script;
  
  // 同步寫回
  await context.globalState.update(GLOBAL_MANIFEST_KEY, manifest);
  await context.globalState.update(GLOBAL_ITEMS_KEY, itemsMap);
}

export async function saveAllToGlobal(context: vscode.ExtensionContext, items: SbhItem[]): Promise<void> {
  const manifest: SbhManifest = { version: 1, items: [] };
  const itemsMap: SbhItemsMap = {};
  
  for (const item of items) {
    manifest.items.push({
      command: item.command,
      text: item.text,
      tooltip: item.tooltip,
      hidden: item.hidden,
      enableOnInit: item.enableOnInit
    });
    itemsMap[item.command] = item.script;
  }
  
  await context.globalState.update(GLOBAL_MANIFEST_KEY, manifest);
  await context.globalState.update(GLOBAL_ITEMS_KEY, itemsMap);
}
