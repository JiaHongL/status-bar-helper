import * as vscode from 'vscode';
export const SBH_SECRET_KEYS = 'sbh.secret.keys';

export function loadSecretKeys(context: vscode.ExtensionContext): string[] {
  const arr = context.globalState.get<string[]>(SBH_SECRET_KEYS, []);
  return Array.isArray(arr) ? Array.from(new Set(arr.filter(s => typeof s === 'string' && s.trim()))) : [];
}

export async function saveSecretKeys(context: vscode.ExtensionContext, keys: string[]) {
  const uniq = Array.from(new Set(keys.filter(s => typeof s === 'string' && s.trim())));
  await context.globalState.update(SBH_SECRET_KEYS, uniq);
}

export async function addSecretKey(context: vscode.ExtensionContext, key: string) {
  const list = loadSecretKeys(context);
  if (!list.includes(key)) { list.push(key); await saveSecretKeys(context, list); }
}

export async function removeSecretKey(context: vscode.ExtensionContext, key: string) {
  const list = loadSecretKeys(context).filter(k => k !== key);
  await saveSecretKeys(context, list);
}