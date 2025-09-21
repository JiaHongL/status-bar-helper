// media-src/main.ts
import * as monaco from 'monaco-editor';

// 暴露給 webview 內的其他腳本（你的 monaco-editor Web Component）
(window as any).monaco = monaco;

// （可選）JS/TS 語言服務預設
monaco.languages.typescript.javascriptDefaults.setCompilerOptions({
  target: monaco.languages.typescript.ScriptTarget.ES2020,
  module: monaco.languages.typescript.ModuleKind.ESNext,
  allowJs: true,
  allowNonTsExtensions: true,
  checkJs: false,
});
