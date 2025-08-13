import * as vscode from 'vscode';

// 載入翻譯檔案
let translations: Record<string, string> = {};

try {
  // 獲取當前語言
  const locale = vscode.env.language;
  console.log('🌐 VS Code language:', locale);
  
  // 根據語言載入對應的翻譯檔案
  if (locale.startsWith('zh-') || locale === 'zh') {
    // 嘗試載入繁體中文翻譯
    const path = require('path');
    const fs = require('fs');
    const nlsPath = path.join(__dirname, 'package.nls.zh-tw.json');
    
    console.log('🔍 Looking for Chinese translations at:', nlsPath);
    
    if (fs.existsSync(nlsPath)) {
      const content = fs.readFileSync(nlsPath, 'utf-8');
      translations = JSON.parse(content);
      console.log('✅ Loaded Chinese translations:', Object.keys(translations).length, 'keys');
    } else {
      console.log('❌ Chinese translation file not found');
    }
  } else {
    console.log('📝 Non-Chinese locale, loading English fallback');
  }
  
  // 如果沒有翻譯，載入英文預設值
  if (Object.keys(translations).length === 0) {
    const path = require('path');
    const fs = require('fs');
    const nlsPath = path.join(__dirname, 'package.nls.json');
    
    console.log('🔍 Loading English fallback from:', nlsPath);
    
    if (fs.existsSync(nlsPath)) {
      const content = fs.readFileSync(nlsPath, 'utf-8');
      translations = JSON.parse(content);
      console.log('✅ Loaded English translations:', Object.keys(translations).length, 'keys');
    } else {
      console.log('❌ English translation file not found');
    }
  }
} catch (error) {
  console.warn('⚠️ Failed to load translations:', error);
}

/**
 * 本地化字串函數
 * @param key 翻譯鍵值
 * @param defaultValue 預設值（如果找不到翻譯）
 * @param args 格式化參數
 */
export function localize(key: string, defaultValue?: string, ...args: any[]): string {
  let result = translations[key] || defaultValue || key;
  
  // 除錯：記錄翻譯查找
  if (process.env.NODE_ENV === 'development' || !translations[key]) {
    console.log(`🔤 localize("${key}") -> "${result}"`);
  }
  
  // 簡單的字串格式化：{0}, {1}, etc.
  if (args.length > 0) {
    result = result.replace(/\{(\d+)\}/g, (match, index) => {
      const argIndex = parseInt(index, 10);
      return argIndex < args.length ? String(args[argIndex]) : match;
    });
  }
  
  return result;
}
