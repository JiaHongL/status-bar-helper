/**
 * Script Store Web Component
 * ============================
 * 
 * 完整的腳本商店功能，包含：
 * - Catalog 管理：遠端/本地腳本目錄載入，5分鐘 TTL 快取
 * - 狀態計算：根據 hash 比對計算 New/Update/Installed 狀態
 * - 過濾搜索：文字搜索、狀態過濾、Tag 過濾
 * - 表格渲染：動態表格生成，支援選擇和操作按鈕
 * - 差異檢視：Script 內容對比，欄位變更檢視
 * - 安裝管理：單一/批次安裝、更新、移除
 * - NEW Badge：與主按鈕緊密整合的新腳本數量指示
 * 
 * 特色：
 * - Shadow DOM 封裝，避免樣式衝突
 * - VS Code 主題變數自動整合
 * - I18nHelper 多語系支援
 * - ConfirmationSystem 整合
 * - 完整的錯誤處理和載入狀態
 * 
 * Usage:
 * <script-store visible="false"></script-store>
 * 
 * Properties:
 * - visible: 控制對話框顯示/隱藏
 * 
 * Events:
 * - dialog-opened: 對話框開啟時觸發
 * - dialog-closed: 對話框關閉時觸發  
 * - catalog-loaded: catalog 載入完成時觸發
 * - script-installed: 腳本安裝完成時觸發
 * - new-badge-update: NEW badge 數量更新時觸發 (detail: { count })
 */

class ScriptStore extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    
        // Script Store 狀態
    this._visible = false;
    this._catalog = [];
    this._loaded = false;
    this._loading = false;
    this._installing = false;
    this._currentDiffCommand = null;
    
    // 事件綁定
    this.show = this.show.bind(this);
    this.hide = this.hide.bind(this);
    this.handleTableClick = this.handleTableClick.bind(this);
  }

  static get observedAttributes() {
    return ['visible', 'codicons-uri'];
  }

  // 設置當前項目的便捷方法
  set currentItems(items) {
    this._currentItems = Array.isArray(items) ? items : [];
    console.log('Script Store: set current items via property:', this._currentItems.length);
  }

  get currentItems() {
    return this._currentItems || [];
  }

  connectedCallback() {
    // 延遲初始化，確保在下一個事件循環中執行
    setTimeout(() => {
      this.initialize();
    }, 0);
  }

  // 統一的初始化方法
  initialize() {
    if (this._initialized) {
      return;
    }
    
    try {
      console.log('Starting ScriptStore initialization...');
      
      // 首先設置初始狀態 - 從屬性讀取 visible 狀態
      const visibleAttr = this.getAttribute('visible');
      this._visible = visibleAttr !== null && visibleAttr !== 'false';
      
      this.completeInitialization();
    } catch (error) {
      console.error('ScriptStore initialization failed:', error);
      // 嘗試顯示錯誤訊息
      try {
        this.shadowRoot.innerHTML = `<div style="padding: 20px; color: var(--vscode-errorForeground);">
          <h3>Script Store Error</h3>
          <p>Failed to initialize: ${error.message}</p>
          <button onclick="location.reload()">Retry</button>
        </div>`;
      } catch (renderError) {
        console.error('Failed to render error message:', renderError);
      }
    }
  }

  // 完成初始化
  completeInitialization() {
    try {
      console.log('Completing ScriptStore initialization with I18nHelper available');
      
      this.render();
      this.setupEventListeners();
      
      // 載入 Codicons CSS 到 Shadow DOM
      this.loadCodiconsCSS();
      
      // 確保正確設置初始顯示狀態
      this.updateVisibility();
      
      this._initialized = true;
      console.log('ScriptStore initialized successfully, visible:', this._visible);
      
      // 只有在組件可見時才載入數據
      if (this._visible) {
        this.fetchCatalog();
      }

    } catch (error) {
      console.error('ScriptStore completion failed:', error);
      this.shadowRoot.innerHTML = `<div style="padding: 20px; color: var(--vscode-errorForeground);">
        <h3>Script Store Error</h3>
        <p>Failed to complete initialization: ${error.message}</p>
        <button onclick="location.reload()">Retry</button>
      </div>`;
    }
  }

  // 載入 Codicons CSS 到 Shadow DOM
  loadCodiconsCSS() {
    try {
      // 從屬性獲取 Codicons URI
      const codiconsUri = this.getAttribute('codicons-uri');
      if (codiconsUri) {
        // 直接載入 Codicons CSS
        const link = document.createElement('link');
        link.rel = 'stylesheet';
        link.href = codiconsUri;
        this.shadowRoot.insertBefore(link, this.shadowRoot.firstChild);
        console.log('Codicons CSS loaded into Shadow DOM from URI:', codiconsUri);
      } else {
        console.warn('Codicons URI not provided via codicons-uri attribute');
      }
    } catch (error) {
      console.error('Failed to load Codicons CSS:', error);
    }
  }

  attributeChangedCallback(name, oldValue, newValue) {
    // 只有在初始化完成後才處理屬性變更
    if (!this._initialized) {
      return;
    }
    
    if (name === 'visible') {
      const newVisible = newValue !== null && newValue !== 'false';
      
      // 只有在狀態真的改變時才更新
      if (this._visible !== newVisible) {
        this._visible = newVisible;
        console.log('Visibility changed to:', this._visible);
        
        if (this._visible) {
          this.show();
        } else {
          this.hide();
        }
      }
    } else if (name === 'codicons-uri') {
      // 當 Codicons URI 更新時重新載入 CSS
      if (newValue && oldValue !== newValue) {
        this.loadCodiconsCSS();
      }
    }
  }

  // 多語系支援 - 直接使用 I18nHelper
  getText(key, defaultValue) {
    if (window.I18nHelper && window.I18nHelper.getNlsText) {
      return window.I18nHelper.getNlsText(key, defaultValue);
    }
    return defaultValue || key;
  }

  // 狀態文字翻譯
  getStatusText(status) {
    const statusMap = {
      'new': this.getText('statusNew', 'New'),
      'update': this.getText('update', 'Update'),  
      'installed': this.getText('installed', 'Installed')
    };
    return statusMap[status] || status;
  }

  // 渲染主體結構
  render() {
    this.shadowRoot.innerHTML = `
      <style>
        :host {
          display: block;
          font-family: var(--vscode-font-family);
          font-size: var(--vscode-font-size);
          color: var(--vscode-foreground);
        }

        .ss-modal-overlay {
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background: rgba(0, 0, 0, 0.45);
          display: none;
          align-items: center;
          justify-content: center;
          z-index: 2000;
        }

        .ss-modal {
          width: 1040px;
          max-width: 96%;
          max-height: 90vh;
          background: var(--vscode-editor-background);
          border: 1px solid var(--vscode-editorGroup-border);
          border-radius: 8px;
          display: flex;
          flex-direction: column;
          box-shadow: 0 10px 40px rgba(0, 0, 0, 0.5);
        }

        .ss-header {
          padding: 10px 14px;
          display: flex;
          gap: 12px;
          align-items: center;
          border-bottom: 1px solid var(--vscode-editorGroup-border);
        }

        .ss-header h3 {
          margin: 0;
          font-size: 14px;
          font-weight: 600;
        }

        .ss-header-status {
          font-size: 11px;
          opacity: 0.7;
          display: flex;
          align-items: center;
          gap: 4px;
        }

        .ss-close {
          margin-left: auto;
          background: transparent;
          border: 1px solid transparent;
          color: var(--vscode-foreground);
          cursor: pointer;
          width: 24px;
          height: 24px;
          border-radius: 4px;
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .ss-close:hover {
          background: var(--vscode-toolbar-hoverBackground);
        }

        .ss-body {
          padding: 12px 14px;
          display: flex;
          flex-direction: column;
          gap: 10px;
          overflow: hidden;
          flex: 1;
        }

        .ss-filters {
          display: flex;
          gap: 8px;
          align-items: center;
          flex-wrap: wrap;
        }

        .ss-filters input,
        .ss-filters select {
          height: 26px;
          line-height: 24px;
          padding: 0 6px;
          box-sizing: border-box;
          background: var(--vscode-input-background);
          color: var(--vscode-input-foreground);
          border: 1px solid var(--vscode-input-border);
          border-radius: 3px;
        }

        .ss-refresh {
          margin-left: auto;
          height: 26px;
          width: 26px;
          padding: 0;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          background: var(--vscode-button-secondaryBackground);
          color: var(--vscode-button-secondaryForeground);
          border: 1px solid var(--vscode-button-border);
          border-radius: 3px;
          cursor: pointer;
        }

        .ss-refresh:hover {
          background: var(--vscode-button-secondaryHoverBackground);
        }

        .ss-main {
          display: flex;
          flex: 1;
          min-height: 0;
          gap: 12px;
        }

        .ss-left {
          flex: 1;
          display: flex;
          flex-direction: column;
          min-height: 0;
        }

        .ss-table-wrap {
          flex: 1;
          overflow: auto;
          border: 1px solid var(--vscode-editorGroup-border);
          min-height: 360px;
          position: relative;
        }

        .loading-dim {
          opacity: 0.5;
          pointer-events: none;
        }

        .ss-table {
          width: 100%;
          border-collapse: collapse;
        }

        .ss-table th,
        .ss-table td {
          padding: 6px 8px;
          border-bottom: 1px dotted var(--vscode-editorGroup-border);
          font-size: 12px;
          vertical-align: middle;
          text-align: left;
        }

        .ss-table th {
          position: sticky;
          top: 0;
          background: var(--vscode-sideBar-background);
          font-weight: 600;
        }

        .ss-table tbody tr:hover {
          background-color: var(--vscode-list-hoverBackground);
        }

        /* 欄位寬度控制 */
        .ss-table th:nth-child(1),
        .ss-table td:nth-child(1) { width: 26px; }
        .ss-table th:nth-child(2),
        .ss-table td:nth-child(2) { width: 155px; max-width: 155px; }
        .ss-table th:nth-child(3),
        .ss-table td:nth-child(3) { width: 300px; max-width: 300px; }
        .ss-table th:nth-child(4),
        .ss-table td:nth-child(4) { width: 140px; }
        .ss-table th:nth-child(5),
        .ss-table td:nth-child(5) { width: 60px; }
        .ss-table th:nth-child(6),
        .ss-table td:nth-child(6) { width: 60px; }

        .ss-status-badge {
          padding: 2px 6px;
          border-radius: 10px;
          font-size: 9px;
          text-transform: uppercase;
          letter-spacing: 0.3px;
          font-weight: 600;
          box-shadow: 0 1px 2px rgba(0, 0, 0, 0.12);
        }

        .ss-status-new {
          background: linear-gradient(135deg, #007acc, #0099ff);
          color: #ffffff;
          border: 1px solid rgba(255, 255, 255, 0.3);
        }

        .ss-status-update {
          background: linear-gradient(135deg, #ff9500, #ffad33);
          color: #ffffff;
          border: 1px solid rgba(255, 255, 255, 0.3);
        }

        .ss-status-installed {
          background: linear-gradient(135deg, #28a745, #34ce57);
          color: #ffffff;
          border: 1px solid rgba(255, 255, 255, 0.3);
        }

        .ss-actions {
          display: flex;
          flex-wrap: wrap;
          gap: 3px;
        }

        .ss-actions button {
          height: 22px;
          width: 22px;
          padding: 0;
          font-size: 11px;
          flex: 0 0 auto;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          border-radius: 4px;
          background: var(--vscode-button-secondaryBackground);
          color: var(--vscode-button-secondaryForeground);
          border: 1px solid var(--vscode-button-border);
          cursor: pointer;
        }

        .ss-actions button:hover {
          background: var(--vscode-button-secondaryHoverBackground);
        }

        .ss-tag-badge {
          background: var(--vscode-editorGroup-border);
          padding: 2px 5px;
          border-radius: 6px;
          margin: 0 4px 4px 0;
          font-size: 10px;
          display: inline-block;
        }

        .ss-footer {
          padding: 8px 14px;
          border-top: 1px solid var(--vscode-editorGroup-border);
          display: flex;
          gap: 8px;
          align-items: center;
        }

        .ss-footer .spacer {
          flex: 1;
        }

        .ss-share-link {
          color: var(--vscode-textLink-foreground);
          text-decoration: none;
          font-size: 12px;
          display: flex;
          align-items: center;
          gap: 4px;
        }

        .ss-share-link:hover {
          text-decoration: underline;
        }

        .ss-error {
          color: var(--vscode-errorForeground);
          font-size: 12px;
        }

        .ss-empty {
          text-align: center;
          padding: 40px 0;
          opacity: 0.6;
          display: none;
        }

        .mini-spinner {
          width: 14px;
          height: 14px;
          border: 2px solid var(--vscode-editorGroup-border);
          border-top-color: var(--vscode-progressBar-background, #0a84ff);
          border-radius: 50%;
          animation: spin 0.8s linear infinite;
        }

        @keyframes spin {
          to { transform: rotate(360deg); }
        }

        .bulk-install-btn {
          background: var(--vscode-button-background);
          color: var(--vscode-button-foreground);
          border: 1px solid var(--vscode-button-border);
          padding: 4px 12px;
          border-radius: 3px;
          cursor: pointer;
        }

        .bulk-install-btn:hover {
          background: var(--vscode-button-hoverBackground);
        }

        .bulk-install-btn:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }

        /* 確認對話框樣式 */
        .ss-confirm-overlay {
          position: fixed;
          inset: 0;
          z-index: 3200;
          display: none;
        }

        /* 確認對話框樣式 */
        .ss-confirm-overlay {
          position: fixed;
          inset: 0;
          z-index: 3200;
          display: none;
        }

        .confirm-backdrop {
          position: absolute;
          inset: 0;
          background: rgba(0, 0, 0, .35);
        }

        .ss-confirm-dialog {
          position: absolute;
          top: 50%;
          left: 50%;
          transform: translate(-50%, -50%);
          width: min(420px, 90vw);
          background: var(--vscode-editor-background);
          border: 1px solid var(--vscode-editorGroup-border);
          box-shadow: 0 6px 22px rgba(0, 0, 0, .5);
          border-radius: 6px;
          padding: 16px 18px 14px;
          display: flex;
          flex-direction: column;
          gap: 14px;
        }

        .ss-confirm-dialog h4 {
          margin: 0;
          font-size: 14px;
        }

        .ss-confirm-message {
          font-size: 12px;
          opacity: .85;
        }

        .ss-confirm-actions {
          display: flex;
          justify-content: flex-end;
          gap: 8px;
        }

        .ss-confirm-actions button {
          height: 26px;
          padding: 0 12px;
          border: 1px solid var(--vscode-button-border);
          border-radius: 2px;
          background: var(--vscode-button-secondaryBackground);
          color: var(--vscode-button-secondaryForeground);
          cursor: pointer;
          font-size: 13px;
        }

        .ss-confirm-actions button.primary {
          background: var(--vscode-button-background);
          color: var(--vscode-button-foreground);
          border-color: var(--vscode-button-background);
        }

        /* Diff 對話框樣式 */
        .ss-diff-overlay {
          position: fixed;
          inset: 0;
          z-index: 3100;
          display: none;
        }

        .ss-diff-overlay[style*="block"] {
          display: block !important;
        }

        .ss-diff-backdrop {
          position: absolute;
          inset: 0;
          background: rgba(0, 0, 0, 0.35);
          backdrop-filter: blur(2px);
        }

        .ss-diff-window {
          position: absolute;
          top: 50%;
          left: 50%;
          transform: translate(-50%, -50%);
          width: min(1100px, 90vw);
          height: min(80vh, 800px);
          display: flex;
          flex-direction: column;
          background: var(--vscode-editor-background);
          border: 1px solid var(--vscode-editorGroup-border);
          box-shadow: 0 8px 28px rgba(0, 0, 0, 0.55);
          border-radius: 6px;
          overflow: hidden;
        }

        .ss-diff-header {
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 8px 16px;
          border-bottom: 1px solid var(--vscode-panel-border);
          font-size: 14px;
          font-weight: 600;
          line-height: 1.4;
        }

        .ss-diff-header h4 {
          margin: 0;
          font-size: 14px;
          font-weight: 600;
        }

        .ss-diff-close {
          height: 24px;
          width: 28px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          background: transparent;
          border: 1px solid transparent;
          color: var(--vscode-foreground);
          cursor: pointer;
          margin-left: auto;
        }

        .ss-diff-close:hover {
          background: var(--vscode-toolbar-hoverBackground);
        }

        .ss-diff-body {
          flex: 1;
          overflow: auto;
          padding: 10px 14px;
        }

        .field-diff {
          margin-bottom: 8px;
        }

        .field-diff.changed .before,
        .field-diff.changed .after {
          background: rgba(255, 200, 0, 0.08);
          border: 1px solid var(--vscode-editorWarning-border, rgba(255, 200, 0, 0.2));
        }

        .field-diff .label {
          font-weight: 600;
          font-size: 11px;
          margin-bottom: 2px;
        }

        .field-diff .pair {
          display: flex;
          gap: 6px;
        }

        .field-diff .pair > div {
          flex: 1;
          border: 1px solid var(--vscode-editorGroup-border);
          padding: 4px 6px;
          border-radius: 4px;
          white-space: pre-wrap;
          word-break: break-word;
        }

        .script-diff {
          border: 1px solid var(--vscode-editorGroup-border);
          border-radius: 4px;
        }

        .script-diff.collapsed pre {
          max-height: 140px;
          overflow: hidden;
          position: relative;
        }

        .script-diff.collapsed pre:after {
          content: '…';
          position: absolute;
          left: 0;
          right: 0;
          bottom: 0;
          padding: 4px 8px;
          background: linear-gradient(to bottom, rgba(0, 0, 0, 0), var(--vscode-editor-background));
        }

        .script-diff-header {
          display: flex;
          gap: 8px;
          align-items: center;
          padding: 4px 6px;
          background: var(--vscode-sideBar-background);
          font-size: 11px;
        }

        .script-diff-header button {
          height: 22px;
          padding: 0 8px;
        }

        .split-pre {
          display: flex;
          gap: 2px;
        }

        .split-pre pre {
          flex: 1;
          margin: 0;
          padding: 6px 8px;
          font-size: 11px;
          line-height: 1.3;
          background: var(--vscode-editor-background);
          border: none;
          overflow: auto;
        }

        .changed-line {
          background: rgba(255, 80, 80, 0.08);
        }

        .added-line {
          background: rgba(0, 180, 90, 0.10);
        }

        .removed-line {
          background: rgba(180, 0, 0, 0.12);
          text-decoration: line-through;
          opacity: 0.75;
        }

        /* Script Diff 樣式 - 從 backup 文件復原 */
        .script-diff {
          margin: 8px 0;
          border: 1px solid var(--vscode-panel-border);
          border-radius: 4px;
        }
        .script-diff-header {
          background: var(--vscode-editor-background);
          padding: 8px 12px;
          border-bottom: 1px solid var(--vscode-panel-border);
          display: flex;
          align-items: center;
          font-weight: 600;
        }
        .split-pre {
          display: flex;
          height: 400px;
          overflow: hidden;
        }
        .split-pre pre {
          flex: 1;
          margin: 0;
          padding: 8px;
          overflow: auto;
          background: var(--vscode-editor-background);
          color: var(--vscode-editor-foreground);
          font-family: var(--vscode-editor-font-family);
          font-size: var(--vscode-editor-font-size);
          line-height: 1.4;
          border: none;
        }
        .split-pre pre:first-child {
          border-right: 1px solid var(--vscode-panel-border);
        }
        .script-diff .ln {
          min-height: 1.4em;
          white-space: pre-wrap;
          word-break: break-all;
        }
        .script-diff .ln.added-line { 
          background: rgba(0, 160, 0, .10); 
        }
        .script-diff .ln.removed-line { 
          background: rgba(200, 0, 0, .10); 
        }
        .script-diff .ln.changed-line { 
          background: rgba(255, 200, 0, .10); 
        }
        .script-diff .diff-del { 
          background: rgba(200, 0, 0, .25); 
          text-decoration: line-through; 
        }
        .script-diff .diff-add { 
          background: rgba(0, 160, 0, .25); 
        }
        .script-diff.collapsed .split-pre {
          height: 200px;
        }
        .field-diff {
          margin: 8px 0;
          padding: 8px;
          border: 1px solid var(--vscode-panel-border);
          border-radius: 4px;
        }
        .field-diff.changed {
          background: rgba(255, 200, 0, .05);
          border-color: rgba(255, 200, 0, .3);
        }
        .field-diff .label {
          font-weight: 600;
          margin-bottom: 4px;
          color: var(--vscode-foreground);
        }
        .field-diff .pair {
          display: flex;
          gap: 8px;
        }
        .field-diff .before,
        .field-diff .after {
          flex: 1;
          padding: 4px 8px;
          background: var(--vscode-input-background);
          border: 1px solid var(--vscode-input-border);
          border-radius: 3px;
          font-family: var(--vscode-editor-font-family);
          font-size: var(--vscode-editor-font-size);
        }
        .field-diff .before {
          background: rgba(200, 0, 0, .05);
          border-color: rgba(200, 0, 0, .2);
        }
        .field-diff .after {
          background: rgba(0, 160, 0, .05);
          border-color: rgba(0, 160, 0, .2);
        }

        .ss-diff-actions {
          display: flex;
          justify-content: flex-end;
          gap: 8px;
          padding: 10px 16px;
          border-top: 1px solid var(--vscode-editorGroup-border);
        }

        .ss-diff-actions button {
          height: 26px;
          padding: 0 16px;
          border: 1px solid var(--vscode-button-border);
          border-radius: 2px;
          background: var(--vscode-button-secondaryBackground);
          color: var(--vscode-button-secondaryForeground);
          cursor: pointer;
          font-size: 13px;
        }

        .ss-diff-actions button.ss-primary-btn {
          background: var(--vscode-button-background);
          color: var(--vscode-button-foreground);
          border-color: var(--vscode-button-background);
        }

        .ss-diff-actions button:hover {
          background: var(--vscode-button-hoverBackground);
        }

        .ss-diff-actions button.ss-primary-btn:hover {
          background: var(--vscode-button-hoverBackground);
        }
      </style>

      <div id="modal-overlay" class="ss-modal-overlay">
        <div class="ss-modal">
          <div class="ss-header">
            <h3 id="header-title"><i class="codicon codicon-extensions" style="margin-right: 6px;"></i></h3>
            <div id="header-status" class="ss-header-status"></div>
            <button id="close-btn" class="ss-close" title="Close">✕</button>
          </div>
          
          <div class="ss-body">
            <div class="ss-filters">
              <input type="text" id="search-input" placeholder="" />
              <select id="status-filter">
                <option value="all"></option>
                <option value="new"></option>
                <option value="update"></option>
                <option value="installed"></option>
              </select>
              <select id="tag-filter">
                <option value=""></option>
              </select>
              <button id="refresh-btn" class="ss-refresh" title="Refresh" aria-label="Refresh">
                <i class="codicon codicon-refresh"></i>
              </button>
            </div>
            
            <div class="ss-main">
              <div class="ss-left">
                <div id="table-wrap" class="ss-table-wrap">
                  <table id="table" class="ss-table">
                    <thead>
                      <tr>
                        <th></th>
                        <th id="col-label"></th>
                        <th id="col-tooltip"></th>
                        <th id="col-tags"></th>
                        <th id="col-status"></th>
                        <th id="col-actions"></th>
                      </tr>
                    </thead>
                    <tbody id="table-body"></tbody>
                  </table>
                  <div id="empty-message" class="ss-empty">No entries</div>
                </div>
              </div>
            </div>
          </div>
          
          <div class="ss-footer">
            <div id="error-message" class="ss-error"></div>
            <a id="share-link" href="#" class="ss-share-link">
              <span>🔗</span>
              <span id="share-text"></span>
            </a>
            <div class="spacer"></div>
            <button id="bulk-install-btn" class="bulk-install-btn" disabled></button>
          </div>
        </div>
      </div>

      <!-- 確認對話框 -->
      <div id="confirm-overlay" class="ss-confirm-overlay" style="display:none;">
        <div class="confirm-backdrop"></div>
        <div id="confirm-dialog" class="ss-confirm-dialog">
          <h4 id="confirm-title">Confirm</h4>
          <div id="confirm-message" class="ss-confirm-message"></div>
          <div class="ss-confirm-actions">
            <button id="confirm-cancel" type="button" class="ss-cancel-btn">Cancel</button>
            <button id="confirm-ok" type="button" class="ss-primary-btn primary">OK</button>
          </div>
        </div>
      </div>

      <!-- Diff 對話框 -->
      <div id="ss-diff-layer" class="ss-diff-overlay" style="display:none;">
        <div class="ss-diff-backdrop"></div>
        <div class="ss-diff-window">
          <div class="ss-diff-header">
            <h4 id="ss-diff-window-title">Diff</h4>
            <button id="ss-dw-close" class="ss-diff-close codicon codicon-close" aria-label="Close"></button>
          </div>
          <div id="ss-diff-body" class="ss-diff-body">
            Loading diff...
          </div>
          <div id="ss-diff-actions" class="ss-diff-actions" style="display:none;">
            <button id="ss-diff-cancel" type="button" class="ss-cancel-btn">Cancel</button>
            <button id="ss-diff-update" type="button" class="ss-primary-btn">Update</button>
          </div>
        </div>
      </div>
    `;

    // 翻譯文字將在 completeInitialization 中統一更新
  }

  // 修正的多語系實現 - 學習 ImportDialog 的做法
  updateLocalizedTexts() {
    // 更新標題
    const headerTitle = this.shadowRoot.getElementById('header-title');
    if (headerTitle) {
      headerTitle.innerHTML = `<i class="codicon codicon-extensions" style="margin-right: 6px;"></i>${this.getText('scriptStore', 'Script Store')}`;
    }
    console.log('Header title set to:', headerTitle ? headerTitle.textContent : 'N/A');
    console.log('I18nHelper available:', !!window.I18nHelper);
    console.log('Sample text:', this.getText('scriptStore', 'Script Store'));

    // 更新搜索框
    const searchInput = this.shadowRoot.getElementById('search-input');
    if (searchInput) {
      searchInput.placeholder = this.getText('filterScripts', 'Filter scripts…');
    }

    // 更新表格標題
    const colLabel = this.shadowRoot.getElementById('col-label');
    if (colLabel) colLabel.textContent = this.getText('label', 'Label');

    const colTooltip = this.shadowRoot.getElementById('col-tooltip');
    if (colTooltip) colTooltip.textContent = this.getText('tooltip', 'Tooltip');

    const colTags = this.shadowRoot.getElementById('col-tags');
    if (colTags) colTags.textContent = this.getText('tags', 'Tags');

    const colStatus = this.shadowRoot.getElementById('col-status');
    if (colStatus) colStatus.textContent = this.getText('status', 'Status');

    const colActions = this.shadowRoot.getElementById('col-actions');
    if (colActions) colActions.textContent = this.getText('actions', 'Actions');

    // 更新空消息
    const emptyMessage = this.shadowRoot.getElementById('empty-message');
    if (emptyMessage) {
      emptyMessage.textContent = this.getText('scriptStoreNoEntries', 'No entries');
    }

    // 更新批量安裝按鈕
    const bulkInstallBtn = this.shadowRoot.getElementById('bulk-install-btn');
    if (bulkInstallBtn) {
      bulkInstallBtn.textContent = this.getText('installSelected', 'Install Selected');
    }

    // 更新狀態過濾器選項
    const statusFilter = this.shadowRoot.getElementById('status-filter');
    if (statusFilter && statusFilter.options && statusFilter.options.length >= 4) {
      statusFilter.options[0].textContent = this.getText('filterAll', 'All');
      statusFilter.options[1].textContent = this.getText('statusNew', 'New');
      statusFilter.options[2].textContent = this.getText('update', 'Update');
      statusFilter.options[3].textContent = this.getText('installed', 'Installed');
    }

    // 更新分享連結
    const shareLink = this.shadowRoot.getElementById('share-link');
    if (shareLink) {
      const shareText = shareLink.querySelector('#share-text');
      if (shareText) {
        shareText.textContent = this.getText('shareYourScript', 'Share your script');
      }
    }

    // 更新確認對話框
    const confirmTitle = this.shadowRoot.getElementById('confirm-title');
    if (confirmTitle) confirmTitle.textContent = this.getText('confirm', 'Confirm');

    const confirmCancel = this.shadowRoot.getElementById('confirm-cancel');
    if (confirmCancel) confirmCancel.textContent = this.getText('cancel', 'Cancel');

    const confirmOk = this.shadowRoot.getElementById('confirm-ok');
    if (confirmOk) confirmOk.textContent = this.getText('ok', 'OK');
  }

  // 設置事件監聽器
  setupEventListeners() {
    try {
      const overlay = this.shadowRoot.getElementById('modal-overlay');
      const closeBtn = this.shadowRoot.getElementById('close-btn');
      const refreshBtn = this.shadowRoot.getElementById('refresh-btn');
      const searchInput = this.shadowRoot.getElementById('search-input');
      const statusFilter = this.shadowRoot.getElementById('status-filter');
      const tagFilter = this.shadowRoot.getElementById('tag-filter');
      const tableBody = this.shadowRoot.getElementById('table-body');
      const bulkInstallBtn = this.shadowRoot.getElementById('bulk-install-btn');
      const shareLink = this.shadowRoot.getElementById('share-link');

      // 確保所有必要元素都存在
      if (!overlay || !closeBtn || !tableBody) {
        throw new Error('Required DOM elements not found');
      }

      // 關閉對話框
      closeBtn.addEventListener('click', () => this.hide());
      overlay.addEventListener('click', (e) => {
        if (e.target === overlay) {
          this.hide();
        }
      });

      // 刷新 catalog
      if (refreshBtn) {
        refreshBtn.addEventListener('click', () => this.fetchCatalog());
      }

      // 過濾器
      if (searchInput) {
        searchInput.addEventListener('input', (e) => {
          this._searchText = e.target.value;
          this.renderTable();
        });
      }

      if (statusFilter) {
        statusFilter.addEventListener('change', (e) => {
          this._statusFilter = e.target.value;
          this.renderTable();
        });
      }

      if (tagFilter) {
        tagFilter.addEventListener('change', (e) => {
          this._tagFilter = e.target.value;
          this.renderTable();
        });
      }

      // 表格操作
      tableBody.addEventListener('click', this.handleTableClick);
      tableBody.addEventListener('change', (e) => {
        if (e.target.classList.contains('ss-checkbox')) {
          this.updateBulkButton();
        }
      });

      // 批次安裝
      if (bulkInstallBtn) {
        bulkInstallBtn.addEventListener('click', () => this.handleBulkInstall());
      }

      // 分享連結 - 通過 callHost 使用 VS Code openExternal API
      if (shareLink) {
        shareLink.addEventListener('click', async (e) => {
          e.preventDefault();
          const shareUrl = 'https://github.com/JiaHongL/status-bar-helper/issues/new?title=%5BShare%5D%20%5BYour%20Script%20Name%5D&body=Label%28s%29%3A%20%5BYour%20Label%5D%0ATooltip%3A%20%5BYour%20Tooltip%5D%0A%0AScript%3A%0A%60%60%60js%0A%5BYour%20Script%5D%0A%60%60%60';
          
          try {
            // 通過 RPC 調用主頁面的 openExternal 功能
            if (window.vscode) {
              window.vscode.postMessage({ 
                command: 'openExternal', 
                url: shareUrl 
              });
            } else {
              // 後備方案：直接開啟連結
              window.open(shareUrl, '_blank');
            }
          } catch (error) {
            console.error('Failed to open share link:', error);
            // 後備方案：直接開啟連結
            window.open(shareUrl, '_blank');
          }
        });
      }

      // Diff 對話框事件監聽器
      this.setupDiffEventListeners();

      console.log('Event listeners setup completed');
    } catch (error) {
      console.error('Failed to setup event listeners:', error);
    }
  }

  // 設置 Diff 對話框事件監聽器
  setupDiffEventListeners() {
    const diffLayer = this.shadowRoot.getElementById('ss-diff-layer');
    const diffClose = this.shadowRoot.getElementById('ss-dw-close');
    const diffCancel = this.shadowRoot.getElementById('ss-diff-cancel');
    const diffUpdate = this.shadowRoot.getElementById('ss-diff-update');

    if (diffClose) {
      diffClose.addEventListener('click', () => this.closeDiff());
    }

    if (diffCancel) {
      diffCancel.addEventListener('click', () => this.closeDiff());
    }

    if (diffUpdate) {
      diffUpdate.addEventListener('click', async (e) => {
        const cmd = e.target.dataset.cmd;
        if (cmd) {
          const entry = this._catalog.find((e) => e.command === cmd);
          const scriptName = entry ? entry.text || cmd : cmd;
          const confirmed = await this.showConfirmDialog(
            this.getText('updateConfirm', 'Update script "{name}"?').replace('{name}', scriptName),
            '',
            this.getText('update', 'Update'),
            this.getText('cancel', 'Cancel')
          );
          if (confirmed) {
            this.closeDiff();
            await this.installScript(cmd);
          }
        }
      });
    }

    if (diffLayer) {
      diffLayer.addEventListener('click', (e) => {
        if (e.target.classList.contains('ss-diff-backdrop')) {
          this.closeDiff();
        }
      });
    }

    // 鍵盤快捷鍵
    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this._currentDiffCommand) {
        this.closeDiff();
      }
    });
  }

  // 顯示對話框
  show() {
    if (!this._initialized) {
      console.warn('ScriptStore not initialized yet');
      return;
    }
    
    this._visible = true;
    this.updateVisibility();
    this.resetFilters();
    this.fetchCatalog();
    this.dispatchEvent(new CustomEvent('dialog-opened'));
    this.updateLocalizedTexts();
  }

  // 隱藏對話框
  hide() {
    if (!this._initialized) {
      return;
    }
    
    this._visible = false;
    this.updateVisibility();
    this.dispatchEvent(new CustomEvent('dialog-closed'));
  }

  // 更新顯示狀態
  updateVisibility() {
    const overlay = this.shadowRoot.getElementById('modal-overlay');
    if (overlay) {
      overlay.style.display = this._visible ? 'flex' : 'none';
    }
  }

  // 重置過濾器
  resetFilters() {
    this._searchText = '';
    this._statusFilter = 'all';
    this._tagFilter = '';

    const searchInput = this.shadowRoot.getElementById('search-input');
    const statusFilter = this.shadowRoot.getElementById('status-filter');
    const tagFilter = this.shadowRoot.getElementById('tag-filter');

    if (searchInput) {
      searchInput.value = '';
    }
    if (statusFilter) {
      statusFilter.value = 'all';
    }
    if (tagFilter) {
      tagFilter.value = '';
    }
  }

  // 載入 catalog
  async fetchCatalog() {
    if (this._loading) {
      console.log('fetchCatalog: already loading, skipping');
      return;
    }
    
    console.log('fetchCatalog: starting, vscode available:', !!window.vscode);
    
    this.setLoading(true);
    this.setHeaderStatus('<span class="mini-spinner"></span>');
    this.clearError();

    try {
      // 使用 VS Code postMessage API 調用 host
      console.log('fetchCatalog: calling host with catalog command');
      const result = await this.callHost('catalog', []);
      console.log('fetchCatalog: received result:', result);
      
      this._catalog = (result.data && result.data.entries) || [];
      console.log('fetchCatalog: catalog entries count:', this._catalog.length);
      
      const count = this._catalog.length;
      this.setHeaderStatus(`${count} ${this.getText('scriptStoreEntriesSuffix', 'entries')}`);
      
      // 更新 tag filter 選項
      this.updateTagFilterOptions();
      
      // 更新 NEW badge
      this.updateNewBadge();
      
      this.dispatchEvent(new CustomEvent('catalog-loaded', { 
        detail: { catalog: this._catalog, count } 
      }));
      
    } catch (error) {
      console.error('fetchCatalog: error occurred:', error);
      this.setError('Load failed: ' + (error?.message || error));
      this.setHeaderStatus('Error');
      this.updateNewBadge([]); // 錯誤時隱藏 badge
    } finally {
      this.setLoading(false);
      this.renderTable();
      
      // 如果有開啟的 diff 對話框，重新顯示
      if (this._currentDiffCommand) {
        this.showDiff(this._currentDiffCommand);
      }
    }
  }

  // 調用 host RPC
  async callHost(fn, args) {
    console.log(`callHost: calling ${fn} with args:`, args);
    
    return new Promise((resolve, reject) => {
      const id = 'ss_' + Math.random().toString(36).slice(2, 9);
      console.log(`callHost: generated ID ${id} for command ${fn}`);
      
      // 確保全域 pending Map 存在
      if (!window.scriptStorePending) {
        window.scriptStorePending = new Map();
      }
      
      window.scriptStorePending.set(id, { resolve, reject });
      
      // 使用 VS Code 的 postMessage API
      if (window.vscode) {
        window.vscode.postMessage({
          command: "scriptStore:req",
          reqId: id,
          fn,
          args,
        });
      } else {
        reject(new Error('VS Code API not available'));
        return;
      }
      
      // 15 秒超時保護
      setTimeout(() => {
        if (window.scriptStorePending && window.scriptStorePending.has(id)) {
          window.scriptStorePending.get(id).reject(new Error("timeout"));
          window.scriptStorePending.delete(id);
        }
      }, 15000);
    });
  }

  // 設置載入狀態
  setLoading(loading) {
    this._loading = loading;
    const tableWrap = this.shadowRoot.getElementById('table-wrap');
    if (tableWrap) {
      tableWrap.classList.toggle('loading-dim', loading);
    }
  }

  // 設置標題狀態
  setHeaderStatus(html) {
    const status = this.shadowRoot.getElementById('header-status');
    if (status) {
      status.innerHTML = html;
    }
  }

  // 顯示確認對話框
  showConfirmDialog(title, message, confirmText, cancelText) {
    return new Promise((resolve) => {
      const overlay = this.shadowRoot.getElementById('confirm-overlay');
      const dialog = this.shadowRoot.getElementById('confirm-dialog');
      const titleEl = this.shadowRoot.getElementById('confirm-title');
      const messageEl = this.shadowRoot.getElementById('confirm-message');
      const confirmBtn = this.shadowRoot.getElementById('confirm-ok');
      const cancelBtn = this.shadowRoot.getElementById('confirm-cancel');

      if (!overlay || !dialog || !titleEl || !messageEl || !confirmBtn || !cancelBtn) {
        console.warn('Confirm dialog elements not found, using browser confirm');
        resolve(confirm(message));
        return;
      }

      // 設置內容
      titleEl.textContent = title;
      messageEl.textContent = message;
      confirmBtn.textContent = confirmText;
      cancelBtn.textContent = cancelText;

      // 顯示對話框
      overlay.style.display = 'block';

      // 一次性事件監聽器
      const handleConfirm = () => {
        overlay.style.display = 'none';
        cleanup();
        resolve(true);
      };

      const handleCancel = () => {
        overlay.style.display = 'none';
        cleanup();
        resolve(false);
      };

      const cleanup = () => {
        confirmBtn.removeEventListener('click', handleConfirm);
        cancelBtn.removeEventListener('click', handleCancel);
      };

      confirmBtn.addEventListener('click', handleConfirm);
      cancelBtn.addEventListener('click', handleCancel);
    });
  }

  // 設置錯誤訊息
  setError(message) {
    const error = this.shadowRoot.getElementById('error-message');
    if (error) {
      error.textContent = message;
    }
  }

  // 清除錯誤訊息
  clearError() {
    this.setError('');
  }

  // 更新 NEW badge
  updateNewBadge(catalog = null) {
    const data = catalog || this._catalog;
    const newCount = data.filter(item => item.status === 'new').length;
    
    this.dispatchEvent(new CustomEvent('new-badge-update', { 
      detail: { count: newCount } 
    }));
  }

  // 更新 tag filter 選項
  updateTagFilterOptions() {
    const tagFilter = this.shadowRoot.getElementById('tag-filter');
    if (!tagFilter) {
      return;
    }
    
    // 收集所有唯一的 tags
    const allTags = new Set();
    this._catalog.forEach(entry => {
      if (entry.tags && Array.isArray(entry.tags)) {
        entry.tags.forEach(tag => {
          if (tag && typeof tag === 'string' && tag.trim()) {
            allTags.add(tag.trim());
          }
        });
      }
    });
    
    // 清除現有選項（保留 "All" 選項）
    const currentValue = tagFilter.value;
    const allText = this.getText('filterAll', 'All');
    tagFilter.innerHTML = `<option value="">${allText}</option>`;
    
    // 添加 tag 選項（按字母順序排序）
    const sortedTags = Array.from(allTags).sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()));
    sortedTags.forEach(tag => {
      const option = document.createElement('option');
      option.value = tag;
      option.textContent = tag;
      tagFilter.appendChild(option);
    });
    
    // 恢復之前的選擇值（如果仍然存在）
    if (currentValue && sortedTags.includes(currentValue)) {
      tagFilter.value = currentValue;
    } else {
      tagFilter.value = '';
      this._tagFilter = '';
    }
    
    console.log('updateTagFilterOptions: updated with', sortedTags.length, 'tags:', sortedTags);
  }

  // 渲染表格
  renderTable() {
    this.applyFilters();
    
    const tbody = this.shadowRoot.getElementById('table-body');
    const emptyMessage = this.shadowRoot.getElementById('empty-message');
    
    if (!tbody) {
      return;
    }

    if (this._filteredCatalog.length === 0) {
      tbody.innerHTML = '';
      emptyMessage.style.display = 'block';
      return;
    }

    emptyMessage.style.display = 'none';

    // 排序：New > Update > Installed，然後按標籤排序
    const sortedCatalog = [...this._filteredCatalog].sort((a, b) => {
      const statusOrder = { new: 0, update: 1, installed: 2 };
      const aOrder = statusOrder[a.status] ?? 3;
      const bOrder = statusOrder[b.status] ?? 3;
      
      if (aOrder !== bOrder) {
        return aOrder - bOrder;
      }
      return (a.text || a.command).localeCompare(b.text || b.command);
    });

    tbody.innerHTML = sortedCatalog.map(entry => this.renderTableRow(entry)).join('');
    this.updateBulkButton();
  }

  // 應用過濾器
  applyFilters() {
    this._filteredCatalog = this._catalog.filter(entry => {
      // 文字搜索
      if (this._searchText) {
        const searchLower = this._searchText.toLowerCase();
        const text = (entry.text || entry.command).toLowerCase();
        const tooltip = (entry.tooltip || '').toLowerCase();
        const tags = (entry.tags || []).join(' ').toLowerCase();
        
        if (!text.includes(searchLower) && 
            !tooltip.includes(searchLower) && 
            !tags.includes(searchLower)) {
          return false;
        }
      }

      // 狀態過濾
      if (this._statusFilter !== 'all' && entry.status !== this._statusFilter) {
        return false;
      }

      // Tag 過濾
      if (this._tagFilter) {
        const tagLower = this._tagFilter.toLowerCase();
        const tags = (entry.tags || []).map(t => t.toLowerCase());
        if (!tags.some(t => t.includes(tagLower))) {
          return false;
        }
      }

      return true;
    });
  }

  // 渲染表格行
  renderTableRow(entry) {
    const isInstalled = entry.status === 'installed';
    const hasUpdate = entry.status === 'update';
    const isNew = entry.status === 'new';

    return `
      <tr>
        <td>
          <input type="checkbox" class="ss-checkbox" data-command="${this.escapeHtml(entry.command)}" 
                 ${isInstalled ? 'disabled' : ''}>
        </td>
        <td title="${this.escapeHtml(entry.text || entry.command)}">
          ${this.escapeHtml(entry.text || entry.command)}
        </td>
        <td title="${this.escapeHtml(entry.tooltip || '')}">
          ${this.escapeHtml(entry.tooltip || '')}
        </td>
        <td>
          ${(entry.tags || []).map(tag => 
            `<span class="ss-tag-badge">${this.escapeHtml(tag)}</span>`
          ).join('')}
        </td>
        <td>
          <span class="ss-status-badge ss-status-${entry.status}">
            ${this.getStatusText(entry.status)}
          </span>
        </td>
        <td>
          <div class="ss-actions">
            ${!isInstalled ? `
              <button data-action="install" data-command="${this.escapeHtml(entry.command)}" 
                      title="${this.getText('install', 'Install')}" 
                      ${this._installing ? 'disabled' : ''}>
                <i class="codicon codicon-cloud-download"></i>
              </button>
            ` : ''}
            ${hasUpdate ? `
              <button data-action="update" data-command="${this.escapeHtml(entry.command)}" 
                      title="${this.getText('update', 'Update')}"
                      ${this._installing ? 'disabled' : ''}>
                <i class="codicon codicon-sync"></i>
              </button>
            ` : ''}
            <button data-action="view" data-command="${this.escapeHtml(entry.command)}" 
                    title="${this.getText('view', 'View')}">
              <i class="codicon codicon-eye"></i>
            </button>
            ${isInstalled ? `
              <button data-action="uninstall" data-command="${this.escapeHtml(entry.command)}" 
                      title="${this.getText('uninstall', 'Remove')}"
                      ${this._installing ? 'disabled' : ''}>
                <i class="codicon codicon-trash"></i>
              </button>
            ` : ''}
          </div>
        </td>
      </tr>
    `;
  }

  // HTML 轉義
  escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  // 格式化位元組大小
  formatBytes(n) {
    if (!Number.isFinite(n)) {
      return "0 B";
    }
    const u = ["B", "KB", "MB", "GB"];
    let i = 0;
    while (n >= 1024 && i < u.length - 1) {
      n /= 1024;
      i++;
    }
    return `${Math.round(n * 10) / 10} ${u[i]}`;
  }

  // 處理表格點擊事件
  async handleTableClick(e) {
    console.log('handleTableClick: event triggered', e.target);
    const button = e.target.closest('button[data-action]');
    console.log('handleTableClick: button found', button);
    if (!button) {
      console.log('handleTableClick: no action button found');
      return;
    }

    const action = button.dataset.action;
    const command = button.dataset.command;
    
    console.log('handleTableClick: action =', action, 'command =', command);
    
    if (!action || !command) {
      console.error('handleTableClick: missing action or command', { action, command });
      return;
    }
    
    switch (action) {
      case 'install':
        await this.installScript(command);
        break;
      case 'update':
        // 顯示 diff 並提供更新按鈕
        console.log('Update action triggered for command:', command);
        await this.showDiff(command, true);
        break;
      case 'view':
        // 顯示 diff（只檢視）
        console.log('View action triggered for command:', command);
        await this.showDiff(command, false);
        break;
      case 'uninstall':
        await this.uninstallScript(command);
        break;
    }
  }

  // 獲取當前已安裝的腳本資料
  async getCurrentScript(command) {
    try {
      // 直接從 currentItems 中查找
      const currentItem = this.currentItems.find(item => item.command === command);
      console.log('getCurrentScript: found in currentItems:', command, !!currentItem);
      return currentItem || null;
    } catch (error) {
      console.error('Failed to get current script:', error);
      return null;
    }
  }

  // 安裝腳本
  async installScript(command) {
    console.log('installScript: called with command:', command);
    
    const entry = this._catalog.find(e => e.command === command);
    if (!entry) {
      console.error('installScript: entry not found for command:', command);
      return;
    }

    console.log('installScript: found entry:', entry);

    try {
      this._installing = true;
      this.renderTable(); // 更新按鈕狀態

      console.log('installScript: calling callHost with install command');
      await this.callHost('install', [entry]);
      console.log('installScript: callHost completed successfully');
      
      // 更新本地狀態（將狀態改為 installed）
      const catalogEntry = this._catalog.find(e => e.command === command);
      if (catalogEntry) {
        catalogEntry.status = 'installed';
        console.log('installScript: updated local catalog status to installed');
      }
      
      // 重新載入 catalog（不阻塞，在背景執行）
      this.fetchCatalog().catch(error => {
        console.warn('installScript: failed to refresh catalog after install:', error);
      });

    } catch (error) {
      console.error('installScript: install failed:', error);
      this.setError('Install failed: ' + (error?.message || error));
    } finally {
      this._installing = false;
      this.renderTable();
      console.log('installScript: finished, _installing set to false');
    }
  }

  // 移除腳本
  async uninstallScript(command) {
    const entry = this._catalog.find(e => e.command === command);
    const scriptName = entry ? entry.text || command : command;
    
    // 使用 ConfirmationSystem 顯示確認對話框
    if (window.ConfirmationSystem) {
      const removeText = this.getText('removeConfirmYes', 'Remove');
      const cancelText = this.getText('cancel', 'Cancel');
      
      const confirmed = await window.ConfirmationSystem.showChoiceDialog(
        this.getText('removeConfirm', 'Remove script "{name}"?').replace('{name}', scriptName),
        '',
        [removeText, cancelText]  // 使用字串陣列而不是物件陣列
      );

      if (!confirmed || confirmed !== removeText) {
        return;
      }
    }

    try {
      this._installing = true;
      this.renderTable();

      await this.callHost('uninstall', [command]);
      await this.fetchCatalog();

    } catch (error) {
      this.setError('Uninstall failed: ' + (error?.message || error));
    } finally {
      this._installing = false;
      this.renderTable();
    }
  }

  // 批次安裝
  async handleBulkInstall() {
    const checkboxes = this.shadowRoot.querySelectorAll('input.ss-checkbox:checked');
    const commands = Array.from(checkboxes).map(cb => cb.dataset.command);
    const entries = this._catalog.filter(e => commands.includes(e.command) && e.status !== 'installed');
    
    if (entries.length === 0) {
      return;
    }

    // 顯示確認對話框
    const installList = entries.map(e => `• ${e.text || e.command} (${this.getText(e.status, e.status)})`).join('\n');
    const message = `${this.getText('confirmInstall', 'Are you sure you want to install the following items?')}\n\n${installList}`;
    
    // 使用內建確認對話框
    const confirmed = await this.showConfirmDialog(
      this.getText('installScript', 'Install Scripts'),
      message,
      this.getText('install', 'Install'),
      this.getText('cancel', 'Cancel')
    );

    if (!confirmed) {
      return;
    }

    try {
      this._installing = true;
      this.renderTable();

      // 逐一安裝
      for (const entry of entries) {
        await this.callHost('install', [entry]);
      }

      await this.fetchCatalog();

    } catch (error) {
      this.setError('Bulk install error: ' + (error?.message || error));
    } finally {
      this._installing = false;
      this.renderTable();
    }
  }

  // 更新批次安裝按鈕狀態
  updateBulkButton() {
    const checkboxes = this.shadowRoot.querySelectorAll('input.ss-checkbox:checked:not(:disabled)');
    const bulkBtn = this.shadowRoot.getElementById('bulk-install-btn');
    
    if (bulkBtn) {
      bulkBtn.disabled = checkboxes.length === 0 || this._installing;
    }
  }

  // 顯示差異檢視
  // 公開 API
  get visible() {
    return this._visible;
  }

  set visible(value) {
    if (value) {
      this.setAttribute('visible', '');
    } else {
      this.removeAttribute('visible');
    }
  }

  get catalog() {
    return this._catalog;
  }

  // 高亮差異的輔助方法
  highlightDiff(before = "", after = "") {
    // 簡單的行級差異檢測
    const beforeLines = before.split('\n');
    const afterLines = after.split('\n');
    
    let beforeHighlighted = before;
    let afterHighlighted = after;
    let changed = before !== after;
    
    // 如果內容不同，簡單地標記整個內容
    if (changed) {
      beforeHighlighted = `<span class="diff-removed">${this.escapeHtml(before)}</span>`;
      afterHighlighted = `<span class="diff-added">${this.escapeHtml(after)}</span>`;
    } else {
      beforeHighlighted = this.escapeHtml(before);
      afterHighlighted = this.escapeHtml(after);
    }
    
    return {
      beforeText: beforeHighlighted,
      afterText: afterHighlighted,
      changed: changed
    };
  }

  // 行級差異算法 (基於備份檔案的正確實現)
  simpleLineDiff(a, b) {
    const al = a.split(/\r?\n/);
    const bl = b.split(/\r?\n/);
    const max = Math.max(al.length, bl.length);
    const rows = [];
    
    for (let i = 0; i < max; i++) {
      const av = al[i];
      const bv = bl[i];
      
      if (av === bv) {
        rows.push({ type: 'same', before: av, after: bv });
      } else {
        if (av != null && bv != null) {
          rows.push({ type: 'changed', before: av, after: bv });
        } else if (av != null) {
          rows.push({ type: 'removed', before: av, after: '' });
        } else {
          rows.push({ type: 'added', before: '', after: bv });
        }
      }
    }
    return rows;
  }

  // 字符級差異算法 (LCS-based) - 從備份文件直接複製
  inlineDiff(a, b) {
    if(a===b) return { a: this.escapeHtml(a||''), b: this.escapeHtml(b||'') };
    a=a||''; b=b||'';
    const maxProduct = 40000; // safeguard (e.g. 200x200 chars) to avoid heavy O(n*m) cost
    const ax=[...a], bx=[...b]; // spread handles surrogate pairs
    if(ax.length * bx.length > maxProduct){
      // fallback: prefix/suffix (previous behavior)
      let start=0; while(start<ax.length && start<bx.length && ax[start]===bx[start]) start++;
      let endA=ax.length-1, endB=bx.length-1; while(endA>=start && endB>=start && ax[endA]===bx[endB]){ endA--; endB--; }
      const prefix=this.escapeHtml(ax.slice(0,start).join(''));
      const suffix=this.escapeHtml(ax.slice(endA+1).join('')); // same for b
      const delSeg=this.escapeHtml(ax.slice(start,endA+1).join(''));
      const addSeg=this.escapeHtml(bx.slice(start,endB+1).join(''));
      return {
        a: prefix + (delSeg?`<span class="diff-del">${delSeg}</span>`:'') + suffix,
        b: this.escapeHtml(bx.slice(0,start).join('')) + (addSeg?`<span class="diff-add">${addSeg}</span>`:'') + this.escapeHtml(bx.slice(endB+1).join(''))
      };
    }
    // Build LCS matrix
    const n=ax.length, m=bx.length;
    const dp = Array(n+1);
    for(let i=0;i<=n;i++){ dp[i]=new Uint16Array(m+1); }
    for(let i=1;i<=n;i++){
      const ai=ax[i-1];
      const row=dp[i], prev=dp[i-1];
      for(let j=1;j<=m;j++){
        if(ai===bx[j-1]) row[j]=prev[j-1]+1; else row[j]= row[j-1] > prev[j] ? row[j-1] : prev[j];
      }
    }
    // Reconstruct operations
    let i=n, j=m; const ops = [];
    while(i>0 || j>0){
      if(i>0 && j>0 && ax[i-1]===bx[j-1]){ ops.push({t:'eq', c:ax[i-1]}); i--; j--; }
      else if(j>0 && (i===0 || dp[i][j-1] >= dp[i-1][j])){ ops.push({t:'add', c:bx[j-1]}); j--; }
      else { ops.push({t:'del', c:ax[i-1]}); i--; }
    }
    ops.reverse();
    // Collapse consecutive ops of same type
    const collapsed = [];
    for(const o of ops){
      const last = collapsed[collapsed.length-1];
      if(last && last.t===o.t){ last.c += o.c; } else collapsed.push({ t:o.t, c:o.c });
    }
    let outA='', outB='';
    for(const seg of collapsed){
      const esc = this.escapeHtml(seg.c);
      if(seg.t==='eq'){ outA += esc; outB += esc; }
      else if(seg.t==='del'){ outA += `<span class="diff-del">${esc}</span>`; }
      else if(seg.t==='add'){ outB += `<span class="diff-add">${esc}</span>`; }
    }
    return { a: outA, b: outB };
  }

  // 簡單的文字 diff 函數 - 基於備份檔案實現
  highlightDiff(before, after) {
    before = before || '';
    after = after || '';
    
    if (before === after) {
      return {
        before: this.escapeHtml(before),
        after: this.escapeHtml(after),
        beforeText: this.escapeHtml(before),
        afterText: this.escapeHtml(after),
        changed: false
      };
    }
    
    const inlineDiffResult = this.inlineDiff(before, after);
    return {
      before: inlineDiffResult.a,
      after: inlineDiffResult.b,
      beforeText: inlineDiffResult.a,
      afterText: inlineDiffResult.b,
      changed: true
    };
  }

  // 渲染腳本差異 - 基於備份檔案的完整實現
  renderScriptDiff(scriptBefore, scriptAfter, cmd) {
    scriptBefore = scriptBefore || '';
    scriptAfter = scriptAfter || '';
    
    const linesBefore = scriptBefore.split(/\r?\n/).length;
    const linesAfter = scriptAfter.split(/\r?\n/).length;
    const collapse = linesBefore > 400 || linesAfter > 400;
    const diffRows = this.simpleLineDiff(scriptBefore, scriptAfter).slice(0, collapse ? 400 : undefined);
    
    const preL = diffRows.map(r => {
      let cls = '';
      if (r.type === 'changed') cls = 'changed-line';
      else if (r.type === 'removed') cls = 'removed-line';
      
      let content = '';
      if (r.type === 'changed') {
        const parts = this.inlineDiff(r.before || '', r.after || '');
        content = parts.a;
      } else {
        content = this.escapeHtml(r.before || '');
      }
      return `<div class="ln ${cls}">${content || ''}</div>`;
    }).join('\n');
    
    const preR = diffRows.map(r => {
      let cls = '';
      if (r.type === 'changed') cls = 'changed-line';
      else if (r.type === 'added') cls = 'added-line';
      
      let content = '';
      if (r.type === 'changed') {
        const parts = this.inlineDiff(r.before || '', r.after || '');
        content = parts.b;
      } else {
        content = this.escapeHtml(r.after || '');
      }
      return `<div class="ln ${cls}">${content || ''}</div>`;
    }).join('\n');

    return `<div class="script-diff ${collapse ? 'collapsed' : ''}">
      <div class="script-diff-header">Script Diff (${linesBefore} → ${linesAfter} lines)${collapse ? '<span style="margin-left:auto;">(collapsed)</span>' : ''}
        ${collapse ? '<button type="button" data-action="expand-script">Expand</button>' : ''}
      </div>
      <div class="split-pre" data-collapse="${collapse ? 1 : 0}"><pre id="ss-pre-before">${preL}</pre><pre id="ss-pre-after">${preR}</pre></div>
    </div>`;
  }  // 顯示差異對話框
  async showDiff(cmd, showUpdateButton = false) {
    this._currentDiffCommand = cmd;
    const layer = this.shadowRoot.getElementById("ss-diff-layer");
    const body = this.shadowRoot.getElementById("ss-diff-body");
    const title = this.shadowRoot.getElementById("ss-diff-window-title");
    const actionsArea = this.shadowRoot.getElementById("ss-diff-actions");
    const updateBtn = this.shadowRoot.getElementById("ss-diff-update");

    if (title) {
      title.textContent = `${this.getText("diffTitle", "Diff")} - ${cmd}`;
    }
    if (actionsArea) {
      actionsArea.style.display = showUpdateButton ? "flex" : "none";
      const cancelBtn = this.shadowRoot.getElementById("ss-diff-cancel");
      if (cancelBtn) {
        cancelBtn.textContent = this.getText("cancel", "Cancel");
      }
      if (updateBtn) {
        updateBtn.dataset.cmd = cmd;
        updateBtn.textContent = this.getText("update", "Update");
        updateBtn.setAttribute(
          "aria-label",
          this.getText("update", "Update")
        );
      }
    }
    layer.style.display = "block";
    body.innerHTML =
      '<div style="padding:8px; opacity:.7;">Loading diff…</div>';
    try {
      const r = await this.callHost("diff", [[cmd]]);
      const d =
        r && r.ok && r.data && r.data.diffs ? r.data.diffs[0] : null;
      if (!d) {
        body.innerHTML =
          '<div style="padding:8px; color:var(--vscode-errorForeground);">Diff not available.</div>';
        return;
      }
      const before = d.before || {};
      const after = d.after || {
        text: this._catalog.find((e) => e.command === cmd)?.text,
      };
      const textDiff = this.highlightDiff(before.text, after.text);
      const tooltipDiff = this.highlightDiff(before.tooltip, after.tooltip);
      const tagsDiff = this.highlightDiff(
        (before.tags || []).join(", "),
        (after.tags || []).join(", ")
      );
      const scriptBefore = before.script || "";
      const scriptAfter = after.script || "";
      
      body.innerHTML = `
        <div class="field-diff ${textDiff.changed ? "changed" : ""}">
          <div class="label">${this.getText("text", "Text")}</div>
          <div class="pair">
            <div class="before">${textDiff.beforeText || '<i style="opacity:.5">—</i>'}</div>
            <div class="after">${textDiff.afterText || '<i style="opacity:.5">—</i>'}</div>
          </div>
        </div>
        <div class="field-diff ${tooltipDiff.changed ? "changed" : ""}">
          <div class="label">${this.getText("tooltip", "Tooltip")}</div>
          <div class="pair">
            <div class="before">${tooltipDiff.beforeText || '<i style="opacity:.5">—</i>'}</div>
            <div class="after">${tooltipDiff.afterText || '<i style="opacity:.5">—</i>'}</div>
          </div>
        </div>
        <div class="field-diff ${tagsDiff.changed ? "changed" : ""}">
          <div class="label">${this.getText("tags", "Tags")}</div>
          <div class="pair">
            <div class="before">${tagsDiff.beforeText || '<i style="opacity:.5">—</i>'}</div>
            <div class="after">${tagsDiff.afterText || '<i style="opacity:.5">—</i>'}</div>
          </div>
        </div>
        ${this.renderScriptDiff(scriptBefore, scriptAfter, cmd)}
      `;
      
      // 處理展開按鈕
      body.querySelectorAll('button[data-action="expand-script"]').forEach(btn => {
        btn.addEventListener('click', () => {
          const wrapper = btn.closest('.script-diff');
          if (wrapper) {
            wrapper.classList.remove('collapsed');
            btn.remove();
            // 重新渲染完整差異 (按照備份文件的方式，直接顯示原始內容)
            const beforePre = body.querySelector('#ss-pre-before');
            const afterPre = body.querySelector('#ss-pre-after');
            if (beforePre && afterPre) {
              beforePre.innerHTML = scriptBefore.split(/\r?\n/).map(l => 
                `<div class="ln">${this.escapeHtml(l)}</div>`
              ).join('\n');
              afterPre.innerHTML = scriptAfter.split(/\r?\n/).map(l => 
                `<div class="ln">${this.escapeHtml(l)}</div>`
              ).join('\n');
            }
          }
        });
      });
    } catch (e) {
      body.innerHTML =
        '<div style="padding:8px; color:var(--vscode-errorForeground);">Diff error: ' +
        this.escapeHtml(e?.message || String(e)) +
        "</div>";
    }
  }

  // 關閉差異對話框
  closeDiff() {
    const layer = this.shadowRoot.getElementById("ss-diff-layer");
    if (layer) {
      layer.style.display = "none";
      this._currentDiffCommand = null;
    }
  }

  get loading() {
    return this._loading;
  }

  // 顯示錯誤訊息
  showError(message) {
    console.error('ScriptStore error:', message);
    
    // 嘗試顯示在 UI 中
    const status = this.shadowRoot.getElementById('header-status');
    if (status) {
      status.innerHTML = `<span style="color: var(--vscode-errorForeground);">Error: ${message}</span>`;
      
      // 3 秒後清除錯誤訊息
      setTimeout(() => {
        status.innerHTML = '';
      }, 3000);
    }
  }
}

// 註冊 Web Component
console.log('script-store.js: registering ScriptStore component');
customElements.define('script-store', ScriptStore);
