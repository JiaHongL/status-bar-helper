// vite.config.ts
import { defineConfig } from 'vite';
import monacoEditorPlugin from 'vite-plugin-monaco-editor';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

// ✅ 用「專案根」當 root，outDir 用相對路徑，避免跑出 Users/xxx 巢狀資料夾
export default defineConfig({
  root: __dirname,
  base: './', // 產出使用相對路徑，適合 webview 的 asWebviewUri

  plugins: [
    monacoEditorPlugin({
      // 想要哪些語言/worker就列哪些；最少要 editorWorkerService
      languageWorkers: ['editorWorkerService', 'typescript', 'json', 'html', 'css'],
      // globalAPI: true, // 需要時再打開
    }) as any,
  ],

  build: {
    outDir: 'media/dist',
    emptyOutDir: true,
    sourcemap: false,
    cssCodeSplit: false, // 把 CSS 合併為一個檔，方便在 webview 裡 <link>

    rollupOptions: {
      input: path.resolve(__dirname, 'media-src/main.ts'),
      output: {
        // 固定檔名，避免 hash 造成 webview 無法預先替換路徑
        entryFileNames: 'monaco-bundle.js',
        chunkFileNames: 'assets/[name].js',
        assetFileNames: (info) =>
          info.name && info.name.endsWith('.css') ? 'monaco-bundle.css' : 'assets/[name][extname]',
      },
    },
  },
});
