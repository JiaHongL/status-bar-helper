// media/utils/monaco-loader.js
// 以 import.meta.url 組相對路徑，確保同源
const distBase   = new URL('../dist/', import.meta.url);               // .../media/dist/
const workerBase = new URL('./monacoeditorwork/', distBase);           // .../media/dist/monacoeditorwork/

// 依照你 dist 裡的檔名（從截圖看是 *.worker.bundle.js）
const workerMap = {
  editorWorkerService: 'editor.worker.bundle.js',
  json:                'json.worker.bundle.js',
  css:                 'css.worker.bundle.js',
  scss:                'css.worker.bundle.js',
  less:                'css.worker.bundle.js',
  html:                'html.worker.bundle.js',
  handlebars:          'html.worker.bundle.js',
  razor:               'html.worker.bundle.js',
  typescript:          'ts.worker.bundle.js',
  javascript:          'ts.worker.bundle.js',
};

// 同源 blob module worker，避免 cross-origin
self.MonacoEnvironment = {
  getWorker(_moduleId, label) {
    const file = workerMap[label] || workerMap.editorWorkerService;
    const url  = new URL(file, workerBase).toString();  // 仍是 webview 資源，但只在 blob 內 import

    // 用 module blob 啟動，再在裡面 import 真正的 worker 檔
    const code = `import ${JSON.stringify(url)};`;
    const blob = new Blob([code], { type: 'text/javascript' });
    const blobUrl = URL.createObjectURL(blob);
    try {
      return new Worker(blobUrl, { type: 'module' });
    } catch (e) {
      console.error('[MonacoEnvironment] blob module worker failed, fallback to classic', e);
      // 少見 fallback（如果你的 bundle 不是 ESM 就用 classic）
      const classic = new Blob([`importScripts(${JSON.stringify(url)});`], { type: 'text/javascript' });
      return new Worker(URL.createObjectURL(classic));
    }
  }
};

// 先定義好 MonacoEnvironment 再載入 monaco 本體
await import(new URL('monaco-bundle.js', distBase));
