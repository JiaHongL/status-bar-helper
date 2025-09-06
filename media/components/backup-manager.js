/**
 * Backup Manager Web Component
 * 提供完整的備份管理功能，包括備份列表顯示、建立、還原和刪除
 * 
 * Features:
 * - 備份表格渲染與時間格式化       
 * - 備份還原與刪除操作
 * - VS Code 主題整合與響應式設計
 * - I18nHelper 多語系支援
 * - ConfirmationSystem 整合
 * 
 * Usage:
 * <backup-manager visible="false"></backup-manager>
 * 
 * Properties:
 * - visible: boolean - 控制對話框顯示/隱藏
 * - backups: array - 備份資料陣列
 * 
 * Events:
 * - dialog-opened - 對話框開啟時觸發
 * - dialog-closed - 對話框關閉時觸發
 * - backup-create - 請求建立新備份時觸發
 * - backup-restore - 請求還原備份時觸發 (detail: {backupId})
 * - backup-delete - 請求刪除備份時觸發 (detail: {backupId})
 * - backup-list - 請求取得備份列表時觸發
 */

class BackupManager extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this._backups = [];
    this._loading = false;
    this._rendering = false; // 防止重複渲染
    
    this.render();
    this.bindEvents();
  }

  // 支援的屬性
  static get observedAttributes() {
    return ['visible'];
  }

  // 屬性變更回調
  attributeChangedCallback(name, oldValue, newValue) {
    if (oldValue === newValue) { return; }
    
    switch (name) {
      case 'visible':
        this.updateVisibility();
        break;
    }
  }

  // Getter/Setter for properties
  get visible() {
    return this.getAttribute('visible') === 'true';
  }

  set visible(value) {
    this.setAttribute('visible', String(Boolean(value)));
  }

  get backups() {
    return this._backups;
  }

  set backups(value) {
    if (!Array.isArray(value)) { value = []; }
    this._backups = value;
    this.renderBackupTable();
  }

  // 渲染主體結構
  render() {
    this.shadowRoot.innerHTML = `
      <style>
        /* Codicon 字體支援 */
        @font-face {
          font-family: 'codicon';
          src: url('../codicon.ttf') format('truetype');
        }
        
        .codicon {
          font-family: 'codicon';
          font-size: 16px;
          font-weight: normal;
          font-style: normal;
          line-height: 1;
          letter-spacing: normal;
          text-transform: none;
          display: inline-block;
          white-space: nowrap;
          word-wrap: normal;
          direction: ltr;
          -webkit-font-feature-settings: "liga";
          font-feature-settings: "liga";
          -webkit-font-smoothing: antialiased;
          -moz-osx-font-smoothing: grayscale;
        }
        
        .codicon-close:before { content: '\\ea76'; }
        .codicon-save:before { content: '\\eb61'; }
        .codicon-history:before { content: '\\ea82'; }
        .codicon-trash:before { content: '\\ea81'; }
        .codicon-loading:before { content: '\\eb19'; }
        
        /* 載入動畫 */
        .codicon-loading {
          animation: spin 1s linear infinite;
        }
        
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        
        :host {
          display: block;
          font-family: var(--vscode-font-family);
          font-size: var(--vscode-font-size);
          color: var(--vscode-foreground);
        }

        .sb-modal-overlay {
          position: fixed;
          top: 0;
          left: 0;
          width: 100vw;
          height: 100vh;
          background: rgba(0, 0, 0, 0.4);
          display: none;
          align-items: center;
          justify-content: center;
          z-index: 1000;
          backdrop-filter: blur(2px);
        }

        .sb-modal-overlay.visible {
          display: flex;
        }

        .sb-modal {
          background: var(--vscode-editor-background);
          border: 1px solid var(--vscode-panel-border);
          border-radius: 8px;
          box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
          max-width: 90vw;
          max-height: 90vh;
          width: 700px;
          display: flex;
          flex-direction: column;
          animation: modalSlideIn 0.2s ease-out;
        }

        @keyframes modalSlideIn {
          from {
            opacity: 0;
            transform: scale(0.95) translateY(-10px);
          }
          to {
            opacity: 1;
            transform: scale(1) translateY(0);
          }
        }

        .sb-modal-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 16px 20px;
          border-bottom: 1px solid var(--vscode-panel-border);
          background: var(--vscode-editor-background);
        }

        .sb-modal-title {
          font-size: 16px;
          font-weight: 600;
          color: var(--vscode-foreground);
          margin: 0;
        }

        .sb-modal-close {
          background: none;
          border: none;
          color: var(--vscode-foreground);
          cursor: pointer;
          padding: 4px;
          border-radius: 4px;
          display: flex;
          align-items: center;
          justify-content: center;
          transition: background-color 0.2s ease;
        }

        .sb-modal-close:hover {
          background: var(--vscode-toolbar-hoverBackground);
        }

        .sb-modal-body {
          padding: 20px;
          flex: 1;
          overflow: auto;
          min-height: 0;
        }

        .backup-actions {
          display: flex;
          justify-content: flex-end;
          align-items: center;
          margin-bottom: 16px;
        }

        .sb-btn {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          padding: 8px 16px;
          border: 1px solid transparent;
          border-radius: 4px;
          font-size: 13px;
          font-weight: 500;
          cursor: pointer;
          transition: all 0.2s ease;
          text-decoration: none;
          background: var(--vscode-button-background);
          color: var(--vscode-button-foreground);
        }

        .sb-btn:hover:not(:disabled) {
          background: var(--vscode-button-hoverBackground);
        }

        .sb-btn:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }

        .sb-btn .codicon {
          font-size: 14px;
        }

        .sb-btn .codicon-loading {
          animation: spin 1s linear infinite;
        }

        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }

        .sb-table-container {
          border: 1px solid var(--vscode-panel-border);
          border-radius: 6px;
          overflow: hidden;
          max-height: 400px;
          overflow-y: auto;
        }

        .sb-table {
          width: 100%;
          border-collapse: collapse;
          font-size: 13px;
          background: var(--vscode-editor-background);
        }

        .sb-table th {
          background: var(--vscode-editorGroupHeader-tabsBackground);
          color: var(--vscode-foreground);
          font-weight: 600;
          padding: 10px 8px;
          text-align: left;
          border-bottom: 1px solid var(--vscode-panel-border);
          position: sticky;
          top: 0;
          z-index: 10;
        }

        .sb-table td {
          padding: 8px;
          border-bottom: 1px solid var(--vscode-panel-border);
          vertical-align: middle;
        }

        .sb-table tr:hover {
          background: var(--vscode-list-hoverBackground);
        }

        .sb-th-center {
          text-align: center !important;
        }

        .sb-th-right {
          text-align: right !important;
        }

        .sb-icon-btn {
          background: none;
          border: none;
          color: var(--vscode-foreground);
          cursor: pointer;
          padding: 4px;
          border-radius: 4px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          width: 24px;
          height: 24px;
          transition: background-color 0.2s ease;
        }

        .sb-icon-btn:hover {
          background: var(--vscode-toolbar-hoverBackground);
        }

        .sb-icon-btn .codicon {
          font-size: 14px;
        }

        .restore-btn:hover {
          background: var(--vscode-button-background);
          color: var(--vscode-button-foreground);
        }

        .delete-btn:hover {
          background: var(--vscode-errorForeground);
          color: var(--vscode-editor-background);
        }

        .loading-row, .empty-row {
          text-align: center;
          opacity: 0.7;
          font-style: italic;
        }

        .backup-hint {
          display: inline-block;
          min-width: 220px;
          text-align: right;
          width: 100%;
          margin-top: 8px;
          font-size: 12px;
          opacity: 0.8;
        }

        /* Responsive design */
        @media (max-width: 600px) {
          .sb-modal {
            width: 95vw;
            margin: 10px;
          }
          
          .sb-modal-header {
            padding: 12px 16px;
          }
          
          .sb-modal-body {
            padding: 16px;
          }
          
          .sb-table th, .sb-table td {
            padding: 6px 4px;
            font-size: 12px;
          }
        }
      </style>

      <div class="sb-modal-overlay" id="modal-overlay">
        <div class="sb-modal">
          <div class="sb-modal-header">
            <span class="sb-modal-title" id="modal-title">備份管理</span>
            <button class="sb-modal-close" id="close-btn" title="關閉" aria-label="關閉">
              <span class="codicon codicon-close"></span>
            </button>
          </div>
          <div class="sb-modal-body">
            <div class="backup-actions">
              <button class="sb-btn" id="create-backup-btn">
                <span class="codicon codicon-save"></span>
                <span id="create-backup-label">立即備份</span>
              </button>
            </div>
            <div class="sb-table-container">
              <table class="sb-table">
                <thead>
                  <tr>
                    <th class="sb-th-center" id="th-index" style="width:36px;min-width:24px;max-width:40px;">#</th>
                    <th id="th-backup-time" style="min-width:140px; max-width:180px; white-space:nowrap;">備份時間</th>
                    <th id="th-relative-time" style="width:70px; min-width:60px; max-width:80px; white-space:nowrap;">時間</th>
                    <th class="sb-th-right" id="th-file-size" style="width:90px; min-width:60px; max-width:100px; white-space:nowrap;">大小</th>
                    <th class="sb-th-right" id="th-item-count" style="width:60px; min-width:40px; max-width:70px; white-space:nowrap;">項目</th>
                    <th class="sb-th-center" id="th-restore" style="width:60px; min-width:40px; max-width:70px; white-space:nowrap;">還原</th>
                    <th class="sb-th-center" id="th-delete" style="width:60px; min-width:40px; max-width:70px; white-space:nowrap;">刪除</th>
                  </tr>
                </thead>
                <tbody id="backup-table-body">
                  <tr class="loading-row">
                    <td colspan="7">載入中…</td>
                  </tr>
                </tbody>
              </table>
            </div>
            <div class="backup-hint">
              <span id="backup-hint-label">所有備份僅儲存在本機，請定期自行備份重要資料。</span>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  // 綁定事件監聽
  bindEvents() {
    const closeBtn = this.shadowRoot.getElementById('close-btn');
    const overlay = this.shadowRoot.getElementById('modal-overlay');
    const createBtn = this.shadowRoot.getElementById('create-backup-btn');

    // 關閉按鈕
    closeBtn?.addEventListener('click', () => {
      this.hide();
    });

    // 點擊背景關閉
    overlay?.addEventListener('click', (e) => {
      if (e.target === overlay) {
        this.hide();
      }
    });

    // ESC 鍵關閉
    this.shadowRoot.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this.visible) {
        this.hide();
      }
    });

    // 立即備份按鈕
    createBtn?.addEventListener('click', () => {
      this.handleCreateBackup();
    });

    // 表格事件委派（還原、刪除）
    const tableBody = this.shadowRoot.getElementById('backup-table-body');
    tableBody?.addEventListener('click', (e) => {
      this.handleTableClick(e);
    });
  }

  // 顯示對話框
  show() {
    this.visible = true;
    this.requestBackupList();
    this.dispatchEvent(new CustomEvent('dialog-opened'));
  }

  // 隱藏對話框
  hide() {
    this.visible = false;
    this.dispatchEvent(new CustomEvent('dialog-closed'));
  }

  // 更新顯示狀態
  updateVisibility() {
    const overlay = this.shadowRoot.getElementById('modal-overlay');
    if (overlay) {
      overlay.classList.toggle('visible', this.visible);
      
      if (this.visible) {
        // 聚焦到對話框以便 ESC 鍵工作
        setTimeout(() => {
          overlay.focus();
        }, 100);
      }
    }
  }

  // 請求備份列表
  requestBackupList() {
    this.setLoading(true);
    this.dispatchEvent(new CustomEvent('backup-list'));
  }

  // 設置載入狀態
  setLoading(loading) {
    this._loading = loading;
    if (loading) {
      this.renderLoadingState();
    }
  }

  // 渲染載入狀態
  renderLoadingState() {
    const tbody = this.shadowRoot.getElementById('backup-table-body');
    if (!tbody) { return; }
    
    tbody.innerHTML = `
      <tr class="loading-row">
        <td colspan="7" style="text-align:center; opacity:.7">${this.getText('loading', '載入中…')}</td>
      </tr>
    `;
  }

  // 渲染備份表格
  renderBackupTable() {
    if (this._rendering) { return; }
    this._rendering = true;
    
    try {
      const tbody = this.shadowRoot.getElementById('backup-table-body');
      if (!tbody) { return; }

      const backups = this._backups;

      // 空狀態
      if (!Array.isArray(backups) || !backups.length) {
        tbody.innerHTML = `
          <tr class="empty-row">
            <td colspan="7" style="text-align:center; opacity:.7">${this.getText('noBackups', '沒有找到備份')}</td>
          </tr>
        `;
        return;
      }

      // 依時間新到舊排序
      const sorted = backups.slice().sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
      
      tbody.innerHTML = '';
      sorted.forEach((backup, index) => {
        const row = this.createBackupRow(backup, index);
        tbody.appendChild(row);
      });

    } finally {
      this._rendering = false;
    }
  }

  // 創建備份列表行
  createBackupRow(backup, index) {
    const tr = document.createElement('tr');
    
    // 資料準備
    const idx = index + 1;
    const timeStr = backup.timestamp ? new Date(backup.timestamp).toLocaleString() : '';
    const relativeTime = backup.timestamp ? this.formatRelativeTime(new Date(backup.timestamp)) : '';
    const size = backup.sizeStr || '';
    const count = backup.count || 0;
    const backupId = backup.id || '';

    tr.innerHTML = `
      <td class="sb-th-center" style="width:36px;min-width:24px;max-width:40px;white-space:nowrap;">${idx}</td>
      <td style="min-width:140px;max-width:180px;white-space:nowrap;">${this.escapeHtml(timeStr)}</td>
      <td style="width:70px;min-width:60px;max-width:80px;white-space:nowrap;">${this.escapeHtml(relativeTime)}</td>
      <td class="sb-th-right" style="width:90px;min-width:60px;max-width:100px;white-space:nowrap;">${this.escapeHtml(size)}</td>
      <td class="sb-th-right" style="width:60px;min-width:40px;max-width:70px;white-space:nowrap;">${this.escapeHtml(String(count))}</td>
      <td class="sb-th-center" style="width:60px;min-width:40px;max-width:70px;white-space:nowrap;">
        <button class="sb-icon-btn restore-btn" data-id="${this.escapeHtml(backupId)}" data-timestr="${this.escapeHtml(timeStr)}" title="${this.getText('restore','還原')}">
          <span class="codicon codicon-history"></span>
        </button>
      </td>
      <td class="sb-th-center" style="width:60px;min-width:40px;max-width:70px;white-space:nowrap;">
        <button class="sb-icon-btn delete-btn backup-delete-btn" data-index="${index}" data-id="${this.escapeHtml(backupId)}" data-timestr="${this.escapeHtml(timeStr)}" title="${this.getText('delete','刪除')}">
          <span class="codicon codicon-trash"></span>
        </button>
      </td>
    `;

    return tr;
  }

  // 處理表格點擊事件
  async handleTableClick(e) {
    const restoreBtn = e.target.closest('.restore-btn');
    const deleteBtn = e.target.closest('.backup-delete-btn');

    if (restoreBtn) {
      await this.handleRestoreBackup(restoreBtn);
    } else if (deleteBtn) {
      await this.handleDeleteBackup(deleteBtn);
    }
  }

  // 處理還原備份
  async handleRestoreBackup(btn) {
    const backupId = btn.getAttribute('data-id');
    const timeStr = btn.getAttribute('data-timestr');
    
    if (!backupId) { return; }

    const confirmMsg = this.getText('confirmRestoreBackup', '確定要還原此備份？') + 
                      (timeStr ? `（${timeStr}）` : '');
    
    const confirmed = await this.showConfirmDialog(
      this.getText('restore', '還原'),
      confirmMsg,
      [this.getText('confirm', '確認'), this.getText('cancel', '取消')]
    );

    if (confirmed === this.getText('confirm', '確認')) {
      const onlyId = backupId ? backupId.split(/[/\\]/).pop() : backupId;
      this.dispatchEvent(new CustomEvent('backup-restore', { 
        detail: { backupId: onlyId } 
      }));
    }
  }

  // 處理刪除備份
  async handleDeleteBackup(btn) {
    const index = parseInt(btn.getAttribute('data-index'), 10);
    const backupId = btn.getAttribute('data-id');
    const timeStr = btn.getAttribute('data-timestr');

    if (Number.isNaN(index) || !Array.isArray(this._backups) || !this._backups[index]) { return; }

    const backup = this._backups[index];
    const displayTime = timeStr || (backup.timestamp ? new Date(backup.timestamp).toLocaleString() : '');

    const confirmed = await this.showConfirmDialog(
      this.getText('deleteBackupTitle', '刪除備份'),
      this.getText('deleteBackupMessage', '確定要刪除這個備份嗎？（{time}）').replace('{time}', displayTime),
      [this.getText('delete','刪除'), this.getText('cancel','取消')]
    );

    if (confirmed === this.getText('delete','刪除')) {
      const onlyId = backupId ? backupId.split(/[/\\]/).pop() : backupId;
      this.dispatchEvent(new CustomEvent('backup-delete', { 
        detail: { backupId: onlyId } 
      }));
      
      // 300ms 後自動刷新列表
      setTimeout(() => {
        this.requestBackupList();
      }, 300);
    }
  }

  // 處理建立備份
  handleCreateBackup() {
    const btn = this.shadowRoot.getElementById('create-backup-btn');
    if (!btn || btn.disabled) { return; }

    // 顯示載入動畫
    const originalContent = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = `<span class="codicon codicon-loading"></span> <span>${this.getText('loading', '載入中…')}</span>`;

    // 1.5秒後還原按鈕狀態並發送事件
    setTimeout(() => {
      btn.innerHTML = originalContent;
      btn.disabled = false;
      this.dispatchEvent(new CustomEvent('backup-create'));
    }, 1500);
  }

  // 相對時間格式化
  formatRelativeTime(date) {
    const now = new Date();
    const diff = Math.floor((now - date) / 1000);
    
    if (diff < 60) { return this.getText('justNow', 'just now'); }
    
    const minutes = Math.floor(diff / 60);
    if (diff < 3600) { 
      return this.getText('minutesAgo', '{0} 分鐘前').replace('{0}', minutes); 
    }
    
    const hours = Math.floor(diff / 3600);
    if (diff < 86400) { 
      return this.getText('hoursAgo', '{0} 小時前').replace('{0}', hours); 
    }
    
    const days = Math.floor(diff / 86400);
    return this.getText('daysAgo', '{0} 天前').replace('{0}', days);
  }

  // HTML 轉義
  escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  // 顯示確認對話框
  async showConfirmDialog(title, message, buttons = ['OK']) {
    // 嘗試使用全域的 ConfirmationSystem
    if (window.ConfirmationSystem && typeof window.ConfirmationSystem.showChoiceDialog === 'function') {
      return await window.ConfirmationSystem.showChoiceDialog(title, message, buttons);
    }
    
    // 降級到 window.confirm
    return window.confirm(`${title}\n\n${message}`) ? buttons[0] : buttons[1];
  }

  // 多語系文字取得
  getText(key, defaultValue) {
    // 嘗試使用全域的 I18nHelper
    if (window.I18nHelper && typeof window.I18nHelper.getNlsText === 'function') {
      return window.I18nHelper.getNlsText(key, defaultValue);
    }
    
    // 降級到全域 nls 物件
    if (window.nls && window.nls[key]) {
      return window.nls[key];
    }
    
    return defaultValue || key;
  }

  // 更新多語系文字
  updateTexts() {
    const elements = [
      { id: 'modal-title', key: 'backupManagement', default: '備份管理' },
      { id: 'create-backup-label', key: 'immediateBackup', default: '立即備份' },
      { id: 'th-backup-time', key: 'backupTime', default: '備份時間' },
      { id: 'th-relative-time', key: 'relativeTime', default: '時間' },
      { id: 'th-file-size', key: 'fileSize', default: '大小' },
      { id: 'th-item-count', key: 'itemCount', default: '項目' },
      { id: 'th-restore', key: 'restore', default: '還原' },
      { id: 'th-delete', key: 'delete', default: '刪除' },
      { id: 'backup-hint-label', key: 'backupHint', default: '所有備份僅儲存在本機，請定期自行備份重要資料。' }
    ];

    elements.forEach(({ id, key, default: defaultText }) => {
      const element = this.shadowRoot.getElementById(id);
      if (element) {
        element.textContent = this.getText(key, defaultText);
      }
    });

    // 重新渲染表格以更新按鈕文字
    if (this._backups.length > 0) {
      this.renderBackupTable();
    }
  }
}

// 註冊 Web Component
if (!customElements.get('backup-manager')) {
  customElements.define('backup-manager', BackupManager);
}

// 建立全域 API 以便向後相容
if (typeof window !== 'undefined') {
  window.BackupManagerSystem = {
    show: () => {
      const manager = document.querySelector('backup-manager');
      if (manager) {
        manager.show();
      }
    },
    
    hide: () => {
      const manager = document.querySelector('backup-manager');
      if (manager) {
        manager.hide();
      }
    },
    
    setBackups: (backups) => {
      const manager = document.querySelector('backup-manager');
      if (manager) {
        manager.backups = backups;
      }
    },
    
    updateTexts: () => {
      const manager = document.querySelector('backup-manager');
      if (manager) {
        manager.updateTexts();
      }
    }
  };
  
  // 向後相容函式
  window.showBackupManager = () => window.BackupManagerSystem.show();
  window.updateBackupTable = (backups) => window.BackupManagerSystem.setBackups(backups);
}
