/**
 * Import Dialog Web Component - Modern Implementation
 * 匯入對話框 Web Component - 現代化實現
 */

class ImportDialog extends HTMLElement {
  constructor() {
    super();
    this.items = [];
    this.selectedItems = new Set();
    this.resolvePromise = null;
    this.isVisible = false;
    this.mergeStrategy = 'replace';
    this.conflictPolicy = 'skip';
    this.attachShadow({ mode: 'open' });
    this.setupStyles();
    this.setupTemplate();
    this.setupEventListeners();
    this.updateLocalizedTexts();
  }

  // 獲取多國語系文字
  getNlsText(key, fallback) {
    if (window.I18nHelper && window.I18nHelper.getNlsText) {
      return window.I18nHelper.getNlsText(key, fallback);
    }
    return fallback || key;
  }

  updateLocalizedTexts() {
    const shadow = this.shadowRoot;
    
    // 更新標題
    const title = shadow.getElementById('dialog-title');
    if (title) {
      title.textContent = this.getNlsText('selectItemsToImport', '選擇要匯入的項目');
    }

    // 更新匯入選項
    const importTitle = shadow.getElementById('import-options-title');
    if (importTitle) {
      importTitle.textContent = this.getNlsText('importOptions', '匯入選項');
    }

    // 更新合併策略
    const mergeTitle = shadow.getElementById('merge-strategy-title');
    if (mergeTitle) {
      mergeTitle.textContent = this.getNlsText('mergeStrategy', '合併策略');
    }

    const replaceLabel = shadow.getElementById('merge-replace-label');
    if (replaceLabel) {
      replaceLabel.textContent = this.getNlsText('replace', 'Replace（取代）');
    }

    const replaceDesc = shadow.getElementById('merge-replace-desc');
    if (replaceDesc) {
      replaceDesc.textContent = this.getNlsText('replaceDesc', '覆蓋同名 command；未選的舊項目保留。重複直接覆蓋。');
    }

    const appendLabel = shadow.getElementById('merge-append-label');
    if (appendLabel) {
      appendLabel.textContent = this.getNlsText('append', 'Append（新增）');
    }

    const appendDesc = shadow.getElementById('merge-append-desc');
    if (appendDesc) {
      appendDesc.textContent = this.getNlsText('appendDesc', '只新增不存在的項目。重複依衝突處理。');
    }

    // 更新衝突處理
    const conflictTitle = shadow.getElementById('conflict-policy-title');
    if (conflictTitle) {
      conflictTitle.textContent = this.getNlsText('conflictPolicy', '衝突處理');
    }

    const skipLabel = shadow.getElementById('conflict-skip-label');
    if (skipLabel) {
      skipLabel.textContent = this.getNlsText('skip', 'Skip（略過）');
    }

    const skipDesc = shadow.getElementById('conflict-skip-desc');
    if (skipDesc) {
      skipDesc.textContent = this.getNlsText('skipDesc', '忽略重複 command。');
    }

    const newIdLabel = shadow.getElementById('conflict-newid-label');
    if (newIdLabel) {
      newIdLabel.textContent = this.getNlsText('newId', 'New ID（重新命名）');
    }

    const newIdDesc = shadow.getElementById('conflict-newid-desc');
    if (newIdDesc) {
      newIdDesc.textContent = this.getNlsText('newIdDesc', '重複加時間戳記重命名。原有不變。');
    }

    // 更新表格標題
    const textTh = shadow.getElementById('th-text');
    if (textTh) {
      textTh.textContent = this.getNlsText('text', 'Text');
    }

    const commandTh = shadow.getElementById('th-command');
    if (commandTh) {
      commandTh.textContent = this.getNlsText('command', 'Command');
    }

    const tooltipTh = shadow.getElementById('th-tooltip');
    if (tooltipTh) {
      tooltipTh.textContent = this.getNlsText('tooltip', 'Tooltip');
    }

    const importBtn = shadow.getElementById('import-btn');
    if (importBtn) {
      importBtn.textContent = this.getNlsText('import', '匯入');
    }

    const cancelBtn = shadow.getElementById('cancel-btn');
    if (cancelBtn) {
      cancelBtn.textContent = this.getNlsText('cancel', '取消');
    }

    // 更新選項摘要
    this.updateImportSummary();
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
        background: rgba(0, 0, 0, 0.6);
        z-index: 10000;
        display: none;
        align-items: center;
        justify-content: center;
        backdrop-filter: blur(2px);
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
        min-width: 700px;
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
        min-height: 0;
      }

      .import-options {
        margin-bottom: 20px;
        border: 1px solid var(--vscode-panel-border);
        border-radius: 4px;
        background: var(--vscode-editor-inactiveSelectionBackground, rgba(128, 128, 128, 0.1));
      }

      .options-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 12px 16px;
        background: var(--vscode-editorGroupHeader-tabsBackground);
        border-bottom: 1px solid var(--vscode-panel-border);
        cursor: pointer;
      }

      .options-title {
        font-weight: 600;
        color: var(--vscode-foreground);
      }

      .options-actions {
        display: flex;
        align-items: center;
        gap: 8px;
      }

      .toggle-btn {
        background: none;
        border: none;
        color: var(--vscode-icon-foreground);
        cursor: pointer;
        font-size: 14px;
        padding: 2px 6px;
        border-radius: 3px;
      }

      .toggle-btn:hover {
        background: var(--vscode-toolbar-hoverBackground);
      }

      .summary {
        font-size: 12px;
        color: var(--vscode-descriptionForeground);
        font-style: italic;
      }

      .summary.hidden {
        display: none;
      }

      .options-body {
        padding: 16px;
      }

      .options-body.collapsed {
        display: none;
      }

      .grid-two {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 24px;
      }

      .group {
        display: flex;
        flex-direction: column;
        gap: 8px;
      }

      .group.hidden {
        display: none;
      }

      .group-title {
        font-weight: 600;
        margin-bottom: 8px;
        color: var(--vscode-foreground);
      }

      .radio-line {
        display: flex;
        align-items: center;
        gap: 8px;
        cursor: pointer;
        padding: 4px 0;
      }

      .radio-line input[type="radio"] {
        margin: 0;
      }

      .radio-desc {
        font-size: 12px;
        color: var(--vscode-descriptionForeground);
        margin-left: 24px;
        margin-bottom: 8px;
      }

      .hint {
        font-style: italic;
        opacity: 0.8;
      }

      .thin-sep {
        border: none;
        border-top: 1px solid var(--vscode-panel-border);
        margin: 16px 0 0 0;
      }

      .selection-controls {
        display: flex;
        gap: 12px;
        margin-bottom: 16px;
        align-items: center;
        flex-shrink: 0;
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

      .items-table code {
        background: var(--vscode-textCodeBlock-background);
        padding: 2px 4px;
        border-radius: 3px;
        font-size: 12px;
        color: var(--vscode-textPreformat-foreground);
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
        border: 1px solid var(--vscode-button-border, transparent);
        padding: 8px 16px;
        border-radius: 4px;
        cursor: pointer;
        font-weight: 500;
      }

      .btn-primary:hover {
        background: var(--vscode-button-hoverBackground);
      }

      .btn-primary:disabled {
        opacity: 0.5;
        cursor: not-allowed;
      }

      .btn-cancel {
        background: var(--vscode-button-secondaryBackground);
        color: var(--vscode-button-secondaryForeground);
        border: 1px solid var(--vscode-button-border, transparent);
        padding: 8px 16px;
        border-radius: 4px;
        cursor: pointer;
      }

      .btn-cancel:hover {
        background: var(--vscode-button-secondaryHoverBackground);
      }

      /* 響應式設計 */
      @media (max-width: 800px) {
        .dialog {
          min-width: 90vw;
        }

        .grid-two {
          grid-template-columns: 1fr;
          gap: 16px;
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
          <h2 class="dialog-title" id="dialog-title">Select Items to Import</h2>
          <button class="close-btn" id="close-btn" title="Close" aria-label="Close dialog">×</button>
        </div>
        <div class="dialog-content">
          <div class="import-options" id="import-options">
            <div class="options-header" id="options-header">
              <span class="options-title" id="import-options-title">Import Options</span>
              <div class="options-actions">
                <span id="import-options-summary" class="summary hidden"></span>
                <button id="toggle-import-options" type="button" class="toggle-btn" title="Toggle Options">▲</button>
              </div>
            </div>
            <div id="import-options-body" class="options-body">
              <div class="grid-two">
                <div class="group">
                  <div class="group-title" id="merge-strategy-title">Merge Strategy</div>
                  <label class="radio-line">
                    <input type="radio" name="merge-strategy" value="replace" id="merge-replace" checked>
                    <strong id="merge-replace-label">Replace（取代）</strong>
                  </label>
                  <div class="radio-desc" id="merge-replace-desc">覆蓋同名 command；未選的舊項目保留。<span class="hint">重複直接覆蓋。</span></div>
                  <label class="radio-line">
                    <input type="radio" name="merge-strategy" value="append" id="merge-append">
                    <strong id="merge-append-label">Append（新增）</strong>
                  </label>
                  <div class="radio-desc" id="merge-append-desc">只新增不存在的項目。<span class="hint">重複依衝突處理。</span></div>
                </div>
                <div id="conflict-policy-wrapper" class="group hidden">
                  <div class="group-title" id="conflict-policy-title">Conflict Policy</div>
                  <label class="radio-line">
                    <input type="radio" name="conflict-policy" value="skip" id="conflict-skip" checked>
                    <strong id="conflict-skip-label">Skip（略過）</strong>
                  </label>
                  <div class="radio-desc" id="conflict-skip-desc">忽略重複 command。</div>
                  <label class="radio-line">
                    <input type="radio" name="conflict-policy" value="newId" id="conflict-newid">
                    <strong id="conflict-newid-label">New ID（重新命名）</strong>
                  </label>
                  <div class="radio-desc" id="conflict-newid-desc">重複加時間戳記重命名。<span class="hint">原有不變。</span></div>
                </div>
              </div>
              <hr class="thin-sep" />
            </div>
          </div>
          <div id="table-container" class="table-container">
            <table class="items-table" id="items-table">
              <thead>
                <tr>
                  <th style="width: 40px;"><input type="checkbox" id="select-all-checkbox"></th>
                  <th id="th-text">Text</th>
                  <th id="th-command">Command</th>
                  <th id="th-tooltip">Tooltip</th>
                </tr>
              </thead>
              <tbody id="items-tbody">
              </tbody>
            </table>
            <div class="empty-message" id="empty-message" style="display: none;">
              No items to import
            </div>
          </div>
        </div>
        <div class="dialog-actions">
          <button class="btn-cancel" id="cancel-btn">Cancel</button>
          <button class="btn-primary" id="import-btn">Import Selected</button>
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
    
    // Click outside to close - only on the overlay background
    this.addEventListener('click', (e) => {
      if (e.target === this) {
        this.hide();
      }
    });

    // Prevent dialog content clicks from bubbling to background
    const dialog = shadow.querySelector('.dialog');
    dialog.addEventListener('click', (e) => {
      e.stopPropagation();
    });

    // Selection controls
    const selectAllCheckbox = shadow.getElementById('select-all-checkbox');
    
    selectAllCheckbox.addEventListener('change', (e) => {
      this.toggleSelectAll(e.target.checked);
    });

    // Import action
    const importBtn = shadow.getElementById('import-btn');
    importBtn.addEventListener('click', () => {
      const selected = this.items.filter((_, index) => this.selectedItems.has(index));
      
      if (selected.length === 0) {
        if (window.ConfirmationSystem && window.ConfirmationSystem.showWarning) {
          window.ConfirmationSystem.showWarning('請至少選擇一個項目');
        } else {
          alert('請至少選擇一個項目');
        }
        return;
      }

      this.resolve({
        items: selected,
        mergeStrategy: this.mergeStrategy,
        conflictPolicy: this.conflictPolicy
      });
    });

    // Import options toggle
    const toggleBtn = shadow.getElementById('toggle-import-options');
    const optionsBody = shadow.getElementById('import-options-body');
    const summary = shadow.getElementById('import-options-summary');
    
    let collapsed = false;
    toggleBtn.addEventListener('click', () => {
      collapsed = !collapsed;
      if (collapsed) {
        optionsBody.classList.add('collapsed');
        toggleBtn.textContent = '▼';
        summary.classList.remove('hidden');
      } else {
        optionsBody.classList.remove('collapsed');
        toggleBtn.textContent = '▲';
        summary.classList.add('hidden');
      }
    });

    // Merge strategy change
    const mergeReplaceRadio = shadow.getElementById('merge-replace');
    const mergeAppendRadio = shadow.getElementById('merge-append');
    const conflictWrapper = shadow.getElementById('conflict-policy-wrapper');

    const updateConflictVisibility = () => {
      const mergeVal = shadow.querySelector('input[name="merge-strategy"]:checked')?.value || 'replace';
      this.mergeStrategy = mergeVal;
      
      if (mergeVal === 'append') {
        conflictWrapper.classList.remove('hidden');
      } else {
        conflictWrapper.classList.add('hidden');
      }
      this.updateImportSummary();
    };

    mergeReplaceRadio.addEventListener('change', updateConflictVisibility);
    mergeAppendRadio.addEventListener('change', updateConflictVisibility);

    // Conflict policy change
    const conflictSkipRadio = shadow.getElementById('conflict-skip');
    const conflictNewIdRadio = shadow.getElementById('conflict-newid');

    const updateConflictPolicy = () => {
      const conflictVal = shadow.querySelector('input[name="conflict-policy"]:checked')?.value || 'skip';
      this.conflictPolicy = conflictVal;
      this.updateImportSummary();
    };

    conflictSkipRadio.addEventListener('change', updateConflictPolicy);
    conflictNewIdRadio.addEventListener('change', updateConflictPolicy);

    // Escape key to close
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this.isVisible) {
        this.hide();
      }
    });

    // Initialize
    updateConflictVisibility();
  }

  updateImportSummary() {
    const shadow = this.shadowRoot;
    const summaryEl = shadow.getElementById('import-options-summary');
    if (!summaryEl) {
      return;
    }

    let txt = '';
    if (this.mergeStrategy === 'replace') {
      txt = this.getNlsText('replaceAll', '取代');
    } else if (this.mergeStrategy === 'append') {
      txt = this.getNlsText('add', '新增') + '/ ' + (this.conflictPolicy === 'newId' ? this.getNlsText('renameOnConflict', '重名改名') : this.getNlsText('skipOnConflict', '重名略過'));
    }
    summaryEl.textContent = txt;
  }

  populateTable() {
    const shadow = this.shadowRoot;
    const tbody = shadow.getElementById('items-tbody');
    const emptyMessage = shadow.getElementById('empty-message');
    const tableContainer = shadow.getElementById('table-container');
    
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
        <td title="${this.escapeHtml(item.command || '')}"><code>${this.escapeHtml(item.command || '')}</code></td>
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
    
    // Update select all checkbox
    const selectAllCheckbox = shadow.getElementById('select-all-checkbox');
    if (selectAllCheckbox) {
      selectAllCheckbox.checked = this.selectedItems.size === this.items.length;
      selectAllCheckbox.indeterminate = this.selectedItems.size > 0 && this.selectedItems.size < this.items.length;
    }

    // Update import button
    const importBtn = shadow.getElementById('import-btn');
    if (importBtn) {
      importBtn.disabled = this.selectedItems.size === 0;
      importBtn.textContent = this.selectedItems.size > 0 
        ? this.getNlsText('import', '匯入') + ` (${this.selectedItems.size})`
        : this.getNlsText('import', '匯入');
    }
  }

  escapeHtml(text) {
    if (typeof text !== 'string') {
      return '';
    }
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  async show(items = []) {
    return new Promise((resolve) => {
      this.items = items || [];
      this.selectedItems.clear();
      this.resolvePromise = resolve;
      this.isVisible = true;

      // Select all items by default
      this.items.forEach((_, index) => {
        this.selectedItems.add(index);
      });

      // Reset to default options
      const shadow = this.shadowRoot;
      const mergeReplaceRadio = shadow.getElementById('merge-replace');
      if (mergeReplaceRadio) {
        mergeReplaceRadio.checked = true;
      }
      const conflictSkipRadio = shadow.getElementById('conflict-skip');
      if (conflictSkipRadio) {
        conflictSkipRadio.checked = true;
      }
      this.mergeStrategy = 'replace';
      this.conflictPolicy = 'skip';

      // Reset collapsed state
      const optionsBody = shadow.getElementById('import-options-body');
      const toggleBtn = shadow.getElementById('toggle-import-options');
      const summary = shadow.getElementById('import-options-summary');
      if (optionsBody && toggleBtn && summary) {
        optionsBody.classList.remove('collapsed');
        toggleBtn.textContent = '▲';
        summary.classList.add('hidden');
      }

      this.populateTable();
      this.updateUI();
      this.updateImportSummary();
      this.updateLocalizedTexts();
      
      this.classList.add('visible');

      // Dispatch event
      this.dispatchEvent(new CustomEvent('dialog-opened', {
        detail: { items: this.items }
      }));
    });
  }

  hide() {
    this.isVisible = false;
    this.classList.remove('visible');
    
    if (this.resolvePromise) {
      this.resolvePromise(null);
      this.resolvePromise = null;
    }

    // Dispatch event
    this.dispatchEvent(new CustomEvent('dialog-closed'));
  }

  resolve(result) {
    this.isVisible = false;
    this.classList.remove('visible');
    
    if (this.resolvePromise) {
      this.resolvePromise(result);
      this.resolvePromise = null;
    }

    // Dispatch event
    this.dispatchEvent(new CustomEvent('import-confirmed', {
      detail: result
    }));
  }
}

// Register the custom element
customElements.define('import-dialog', ImportDialog);

// Global API for backward compatibility
window.ImportSystem = {
  async showImportPreview(items) {
    await customElements.whenDefined('import-dialog');
    const importDialog = document.getElementById('import-dialog');
    if (importDialog && importDialog.show) {
      return await importDialog.show(items);
    }
    throw new Error('Import dialog not found or not properly initialized');
  }
};

// Legacy function for backward compatibility
window.showImportPreview = async function(items) {
  return await window.ImportSystem.showImportPreview(items);
};

