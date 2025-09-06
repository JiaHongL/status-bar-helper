/**
 * Export Dialog Web Component - Clean Implementation
 * 匯出對話框 Web Component - 純淨實現（無向後相容性）
 */

class ExportDialog extends HTMLElement {
  constructor() {
    super();
    this.items = [];
    this.selectedItems = new Set();
    this.resolvePromise = null;
    this.isVisible = false;
    this.attachShadow({ mode: 'open' });
    this.setupStyles();
    this.setupTemplate();
    this.setupEventListeners();
    this.updateLocalizedTexts();
  }

  // 獲取多國語系文字
  getNlsText(key, fallback) {
    // 嘗試從全域 I18nHelper 獲取
    if (window.I18nHelper && window.I18nHelper.getNlsText) {
      return window.I18nHelper.getNlsText(key, fallback);
    }
    // 如果沒有 I18nHelper，直接返回 fallback
    return fallback || key;
  }

  updateLocalizedTexts() {
    const shadow = this.shadowRoot;
    
    // 更新標題
    const title = shadow.getElementById('dialog-title');
    if (title) {
      title.textContent = this.getNlsText('selectItemsToExport', '選擇要匯出的項目');
    }

    // 更新選擇控制按鈕
    const selectAllLabel = shadow.querySelector('label[for="select-all-checkbox"]');
    if (selectAllLabel) {
      selectAllLabel.textContent = this.getNlsText('selectAll', '全選');
    }

    const selectAllBtn = shadow.getElementById('select-all-btn');
    if (selectAllBtn) {
      selectAllBtn.textContent = this.getNlsText('selectAll', '全選');
    }

    const deselectAllBtn = shadow.getElementById('deselect-all-btn');
    if (deselectAllBtn) {
      deselectAllBtn.textContent = this.getNlsText('deselectAll', '全部取消選擇');
    }

    // 更新表格標題
    const headers = shadow.querySelectorAll('th');
    if (headers[1]) {
      headers[1].textContent = this.getNlsText('text', '文字');
    }
    if (headers[2]) {
      headers[2].textContent = this.getNlsText('command', '指令');
    }
    if (headers[3]) {
      headers[3].textContent = this.getNlsText('tooltip', '工具提示');
    }

    // 更新按鈕
    const cancelBtn = shadow.getElementById('cancel-btn');
    if (cancelBtn) {
      cancelBtn.textContent = this.getNlsText('cancel', '取消');
    }

    const exportBtn = shadow.getElementById('export-btn');
    if (exportBtn) {
      exportBtn.textContent = this.getNlsText('export', '確認');
    }

    // 更新空訊息
    const emptyMessage = shadow.getElementById('empty-message');
    if (emptyMessage) {
      emptyMessage.textContent = this.getNlsText('noItemsToExport', '沒有項目可以匯出');
    }
  }

  setupStyles() {
    const style = document.createElement('style');
    style.textContent = `
      :host {
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: rgba(0, 0, 0, 0.5);
        display: none;
        z-index: 10000;
        font-family: var(--vscode-font-family);
        font-size: var(--vscode-font-size);
        color: var(--vscode-foreground);
      }

      :host(.visible) {
        display: flex;
        align-items: center;
        justify-content: center;
      }

      .dialog {
        background: var(--vscode-editor-background);
        border: 1px solid var(--vscode-panel-border);
        border-radius: 6px;
        max-width: 90vw;
        max-height: 90vh;
        min-width: 600px;
        display: flex;
        flex-direction: column;
        box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
      }

      .dialog-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 16px 20px;
        border-bottom: 1px solid var(--vscode-panel-border);
        background: var(--vscode-editor-background);
      }

      .dialog-title {
        font-size: 16px;
        font-weight: 600;
        margin: 0;
        color: var(--vscode-foreground);
      }

      .close-btn {
        background: none;
        border: none;
        font-size: 20px;
        cursor: pointer;
        color: var(--vscode-icon-foreground);
        padding: 4px;
        border-radius: 3px;
      }

      .close-btn:hover {
        background: var(--vscode-toolbar-hoverBackground);
      }

      .dialog-content {
        padding: 20px;
        flex: 1;
        display: flex;
        flex-direction: column;
        min-height: 0; /* 允許內容縮小 */
      }

      .selection-controls {
        display: flex;
        gap: 12px;
        margin-bottom: 16px;
        align-items: center;
        flex-shrink: 0; /* 控制項不縮小 */
      }

      .checkbox-container {
        display: flex;
        align-items: center;
        gap: 6px;
      }

      .checkbox-container input[type="checkbox"] {
        margin: 0;
      }

      .btn-secondary {
        background: var(--vscode-button-secondaryBackground);
        color: var(--vscode-button-secondaryForeground);
        border: 1px solid var(--vscode-button-border, transparent);
        padding: 6px 12px;
        border-radius: 4px;
        cursor: pointer;
        font-size: 13px;
      }

      .btn-secondary:hover {
        background: var(--vscode-button-secondaryHoverBackground);
      }

      .table-container {
        flex: 1;
        overflow: auto;
        min-height: 0;
        border: 1px solid var(--vscode-panel-border);
        border-radius: 4px;
        position: relative;
      }

      .items-table {
        width: 100%;
        border-collapse: collapse;
        background: var(--vscode-editor-background);
      }

      .items-table th,
      .items-table td {
        padding: 8px 12px;
        text-align: left;
        border-bottom: 1px solid var(--vscode-panel-border);
      }

      .items-table th {
        background: var(--vscode-editorGroupHeader-tabsBackground);
        font-weight: 600;
        font-size: 12px;
        color: var(--vscode-tab-activeForeground);
        position: sticky;
        top: 0;
        z-index: 10;
      }

      .items-table td {
        font-size: 13px;
        max-width: 200px;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      .items-table tr:hover {
        background: var(--vscode-list-hoverBackground);
      }

      .items-table input[type="checkbox"] {
        margin: 0;
      }

      .empty-message {
        text-align: center;
        padding: 40px;
        color: var(--vscode-descriptionForeground);
        font-style: italic;
      }

      .dialog-actions {
        display: flex;
        justify-content: flex-end;
        gap: 12px;
        padding: 16px 20px;
        border-top: 1px solid var(--vscode-panel-border);
        background: var(--vscode-editor-background);
      }

      .btn-primary {
        background: var(--vscode-button-background);
        color: var(--vscode-button-foreground);
        border: none;
        padding: 8px 16px;
        border-radius: 4px;
        cursor: pointer;
        font-size: 13px;
        font-weight: 500;
      }

      .btn-primary:hover:not(:disabled) {
        background: var(--vscode-button-hoverBackground);
      }

      .btn-primary:disabled {
        opacity: 0.6;
        cursor: not-allowed;
      }

      .btn-cancel {
        background: var(--vscode-button-secondaryBackground);
        color: var(--vscode-button-secondaryForeground);
        border: 1px solid var(--vscode-button-border, transparent);
        padding: 8px 16px;
        border-radius: 4px;
        cursor: pointer;
        font-size: 13px;
      }

      .btn-cancel:hover {
        background: var(--vscode-button-secondaryHoverBackground);
      }

      @media (max-width: 768px) {
        .dialog {
          min-width: 90vw;
        }
        
        .items-table td {
          max-width: 120px;
        }
        
        .selection-controls {
          flex-wrap: wrap;
        }
      }
    `;
    this.shadowRoot.appendChild(style);
  }

  setupTemplate() {
    const template = document.createElement('div');
    template.innerHTML = `
      <div class="dialog">
        <div class="dialog-header">
          <h2 class="dialog-title" id="dialog-title">Select Items to Export</h2>
          <button class="close-btn" id="close-btn" title="Close" aria-label="Close dialog">×</button>
        </div>
        <div class="dialog-content">
          <div class="selection-controls">
            <div class="checkbox-container">
              <input type="checkbox" id="select-all-checkbox">
              <label for="select-all-checkbox">Select All</label>
            </div>
            <button class="btn-secondary" id="select-all-btn">Select All</button>
            <button class="btn-secondary" id="deselect-all-btn">Deselect All</button>
          </div>
          <div id="table-container" class="table-container">
            <table class="items-table" id="items-table">
              <thead>
                <tr>
                  <th></th>
                  <th>Text</th>
                  <th>Command</th>
                  <th>Tooltip</th>
                </tr>
              </thead>
              <tbody id="items-tbody">
              </tbody>
            </table>
            <div class="empty-message" id="empty-message" style="display: none;">
              No items to export
            </div>
          </div>
        </div>
        <div class="dialog-actions">
          <button class="btn-cancel" id="cancel-btn">Cancel</button>
          <button class="btn-primary" id="export-btn">Export Selected</button>
        </div>
      </div>
    `;
    this.shadowRoot.appendChild(template);
  }

  setupEventListeners() {
    const shadow = this.shadowRoot;
    
    // Close dialog
    const closeBtn = shadow.getElementById('close-btn');
    const cancelBtn = shadow.getElementById('cancel-btn');
    
    closeBtn.addEventListener('click', () => this.hide());
    cancelBtn.addEventListener('click', () => this.hide());
    
    // Click outside to close - only on the overlay background, not the dialog content
    this.addEventListener('click', (e) => {
      // 只有點擊到最外層的 host element 才關閉（即點擊背景）
      if (e.target === this) {
        this.hide();
      }
    });

    // 防止對話框內容的點擊事件冒泡到背景
    const dialog = shadow.querySelector('.dialog');
    dialog.addEventListener('click', (e) => {
      e.stopPropagation();
    });

    // Selection controls
    const selectAllCheckbox = shadow.getElementById('select-all-checkbox');
    const selectAllBtn = shadow.getElementById('select-all-btn');
    const deselectAllBtn = shadow.getElementById('deselect-all-btn');
    
    selectAllCheckbox.addEventListener('change', (e) => {
      this.toggleSelectAll(e.target.checked);
    });
    
    selectAllBtn.addEventListener('click', () => {
      this.toggleSelectAll(true);
    });
    
    deselectAllBtn.addEventListener('click', () => {
      this.toggleSelectAll(false);
    });

    // Export action
    const exportBtn = shadow.getElementById('export-btn');
    exportBtn.addEventListener('click', () => {
      const selected = this.items.filter((_, index) => this.selectedItems.has(index));
      this.resolve(selected);
    });

    // Escape key to close
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this.isVisible) {
        this.hide();
      }
    });
  }

  populateTable() {
    const tbody = this.shadowRoot.getElementById('items-tbody');
    const emptyMessage = this.shadowRoot.getElementById('empty-message');
    const tableContainer = this.shadowRoot.getElementById('table-container');
    
    if (!this.items || this.items.length === 0) {
      tableContainer.style.display = 'none';
      emptyMessage.style.display = 'block';
      return;
    }

    tableContainer.style.display = 'block';
    emptyMessage.style.display = 'none';
    
    tbody.innerHTML = '';
    
    this.items.forEach((item, index) => {
      const row = document.createElement('tr');
      
      row.innerHTML = `
        <td>
          <input type="checkbox" data-index="${index}" ${this.selectedItems.has(index) ? 'checked' : ''}>
        </td>
        <td title="${this.escapeHtml(item.text || '')}">${this.escapeHtml(item.text || '')}</td>
        <td title="${this.escapeHtml(item.command || '')}">${this.escapeHtml(item.command || '')}</td>
        <td title="${this.escapeHtml(item.tooltip || '')}">${this.escapeHtml(item.tooltip || '')}</td>
      `;
      
      tbody.appendChild(row);
      
      // Add checkbox event listener
      const checkbox = row.querySelector('input[type="checkbox"]');
      checkbox.addEventListener('change', (e) => {
        const idx = parseInt(e.target.dataset.index);
        if (e.target.checked) {
          this.selectedItems.add(idx);
        } else {
          this.selectedItems.delete(idx);
        }
        this.updateUI();
      });
    });
  }

  toggleSelectAll(selectAll) {
    this.selectedItems.clear();
    if (selectAll) {
      this.items.forEach((_, index) => {
        this.selectedItems.add(index);
      });
    }
    this.updateUI();
    this.populateTable();
  }

  updateUI() {
    const shadow = this.shadowRoot;
    const selectAllCheckbox = shadow.getElementById('select-all-checkbox');
    const exportBtn = shadow.getElementById('export-btn');
    
    const allSelected = this.items.length > 0 && this.selectedItems.size === this.items.length;
    const someSelected = this.selectedItems.size > 0;
    
    selectAllCheckbox.checked = allSelected;
    selectAllCheckbox.indeterminate = someSelected && !allSelected;
    
    exportBtn.disabled = !someSelected;
    
    if (someSelected) {
      exportBtn.textContent = this.getNlsText('exportSelected', '確認 ({count})').replace('{count}', this.selectedItems.size);
    } else {
      exportBtn.textContent = this.getNlsText('export', '確認');
    }
  }

  escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  show(items = []) {
    return new Promise((resolve) => {
      this.items = [...items];
      this.selectedItems.clear();
      
      // Select all by default
      this.items.forEach((_, index) => {
        this.selectedItems.add(index);
      });
      
      this.resolvePromise = resolve;
      
      // 更新本地化文字（以防語言在運行時改變）
      this.updateLocalizedTexts();
      
      this.populateTable();
      this.updateUI();
      
      this.classList.add('visible');
      this.isVisible = true;
      
      // Focus management
      const firstFocusable = this.shadowRoot.querySelector('button, input');
      if (firstFocusable) {
        firstFocusable.focus();
      }
    });
  }

  hide() {
    this.classList.remove('visible');
    this.isVisible = false;
    this.resolve([]);
  }

  resolve(result) {
    if (this.resolvePromise) {
      this.resolvePromise(result);
      this.resolvePromise = null;
    }
    this.classList.remove('visible');
    this.isVisible = false;
  }

  get visible() {
    return this.isVisible;
  }
}

// 註冊 Web Component
customElements.define('export-dialog', ExportDialog);
