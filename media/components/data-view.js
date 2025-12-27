/**
 * Data View Web Component
 * =======================
 * 
 * Manages stored data visualization, filtering, and operations
 * 
 * Features:
 * - Data table rendering with type icons
 * - Real-time filtering and search
 * - Type-based categorization
 * - Data operations (delete, clear all)
 * - Responsive design with theme adaptation
 * 
 * API:
 * - Properties: data, filterText, filterType, nlsData
 * - Events: data-refresh-requested, data-delete-requested, data-clear-requested
 * 
 * @author Status Bar Helper
 */

class DataView extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    
    // Internal state
    this._data = [];
    this._filterText = '';
    this._filterType = 'all';
    this._nlsData = {};
    
    // Cached filtered data
    this._filteredData = [];
    
    // Flag to prevent duplicate event listeners
    this._eventListenersSetup = false;
    
    this.render();
  
    // Initialize codicons CSS if provided
    const codiconsUri = this.getAttribute('codicons-uri');
    if (codiconsUri) {
      this.loadCodiconsCSS();
    }

    // Detect and apply theme class
    this.updateThemeClass();
    
    // Watch for theme changes
    this.setupThemeObserver();
  }

  // ============================================================================
  // Properties and Attributes
  // ============================================================================

  static get observedAttributes() {
    return ['filter-text', 'filter-type', 'codicons-uri'];
  }

  attributeChangedCallback(name, oldValue, newValue) {
    if (oldValue === newValue) {
      return;
    }
    
    switch (name) {
      case 'filter-text':
        this._filterText = newValue || '';
        this.updateFilteredData();
        break;
      case 'filter-type':
        this._filterType = newValue || 'all';
        this.updateFilteredData();
        break;
      case 'codicons-uri':
        this.loadCodiconsCSS();
        break;
    }
  }

  // Data property (complex object, use property not attribute)
  get data() {
    return this._data;
  }

  set data(value) {
    this._data = Array.isArray(value) ? value : [];
    this.updateFilteredData();
  }

  // Filter text property
  get filterText() {
    return this._filterText;
  }

  set filterText(value) {
    const newValue = value || '';
    if (this._filterText === newValue) {
      return; // No change, skip update
    }
    
    this._filterText = newValue;
    // Don't set attribute to avoid double-triggering
    // this.setAttribute('filter-text', this._filterText);
    this.updateFilteredData();
  }

  // Filter type property
  get filterType() {
    return this._filterType;
  }

  set filterType(value) {
    const newValue = value || 'all';
    if (this._filterType === newValue) {
      return; // No change, skip update
    }
    
    this._filterType = newValue;
    // Don't set attribute to avoid double-triggering
    // this.setAttribute('filter-type', this._filterType);
    this.updateFilteredData();
  }

  // NLS data property
  get nlsData() {
    return this._nlsData;
  }

  set nlsData(value) {
    this._nlsData = value || {};
    this.updateTexts();
  }

  // ============================================================================
  // Theme Management
  // ============================================================================

  updateThemeClass() {
    // Detect theme from body class
    const body = document.body;
    if (body.classList.contains('vscode-light')) {
      this.classList.add('vscode-light');
      this.classList.remove('vscode-dark', 'vscode-high-contrast');
    } else if (body.classList.contains('vscode-dark')) {
      this.classList.add('vscode-dark');
      this.classList.remove('vscode-light', 'vscode-high-contrast');
    } else if (body.classList.contains('vscode-high-contrast')) {
      this.classList.add('vscode-high-contrast');
      this.classList.remove('vscode-light', 'vscode-dark');
    }
  }

  setupThemeObserver() {
    // Watch for theme changes on body element
    const observer = new MutationObserver(() => {
      this.updateThemeClass();
    });

    observer.observe(document.body, {
      attributes: true,
      attributeFilter: ['class']
    });

    // Store observer for cleanup
    this._themeObserver = observer;
  }

  disconnectedCallback() {
    // Cleanup theme observer
    if (this._themeObserver) {
      this._themeObserver.disconnect();
    }
    
    // Cleanup filter timer
    if (this._filterTimer) {
      clearTimeout(this._filterTimer);
    }
  }

  // ============================================================================
  // Codicons Management
  // ============================================================================

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
      } else {
        console.warn('Codicons URI not provided via codicons-uri attribute');
      }
    } catch (error) {
      console.error('Failed to load Codicons CSS:', error);
    }
  }

  updateCodiconsUri(uri) {
    if (!uri) {
      return;
    }
    
    // 重新載入 Codicons CSS
    this.loadCodiconsCSS();
  }

  // ============================================================================
  // Core Rendering
  // ============================================================================

  render() {
    this.shadowRoot.innerHTML = `
      <style>
        /* Import VS Code theme variables */
        :host {
          display: flex;
          flex-direction: column;
          height: 100%;
          font-family: var(--vscode-font-family);
          font-size: var(--vscode-font-size);
          color: var(--vscode-foreground);
          background: transparent;
        }

        /* Panel Header */
        .data-title-bar {
          display: flex;
          align-items: center;
          gap: 12px;
          margin-bottom: 8px;
          flex-shrink: 0;
        }

        .data-title { 
          display: flex; 
          align-items: center; 
          gap: 8px; 
          font-weight: 600; 
          margin-right: auto; 
        }

        .data-title i { 
          opacity: .8; 
        }

        /* Search and Filter Components */
        .data-search-wrap {
          flex: 1; 
          display: flex; 
          align-items: center; 
          gap: 6px; 
          min-width: 180px; 
          max-width: 420px;
          background: var(--vscode-input-background); 
          border: 1px solid var(--vscode-input-border);
          border-radius: 4px; 
          height: 28px; 
          padding: 0 8px;
        }

        .data-search-wrap:focus-within {
          border-color: var(--vscode-focusBorder);
        }

        .data-search-wrap i {
          opacity: 0.6;
          font-size: 14px;
        }

        #data-filter-input { 
          all: unset; 
          flex: 1; 
          height: 100%; 
          font-size: .95em; 
          color: var(--vscode-input-foreground); 
        }

        #data-filter-input::placeholder {
          color: var(--vscode-input-placeholderForeground);
        }

        .data-filter-wrap {
          display: flex; 
          align-items: center;
          margin: 0 8px;
        }

        #data-type-filter {
          background: var(--vscode-dropdown-background);
          border: 1px solid var(--vscode-dropdown-border);
          color: var(--vscode-dropdown-foreground);
          border-radius: 4px;
          padding: 4px 8px;
          height: 28px;
          font-size: 0.9em;
          min-width: 140px;
        }

        #data-type-filter:focus {
          border-color: var(--vscode-focusBorder);
          outline: none;
        }

        .data-actions {
          display: flex;
          gap: 8px;
        }

        /* Package Manager Button - Primary action with blue gradient */
        .data-actions .package-manager-btn {
          background: linear-gradient(135deg, #0078d4, #106ebe);
          color: #ffffff;
          border: 1px solid rgba(255, 255, 255, 0.2);
          border-radius: 4px;
          padding: 4px 12px;
          height: 26px;
          font-size: 0.9em;
          font-weight: 500;
          cursor: pointer;
          display: flex;
          align-items: center;
          gap: 6px;
          box-shadow: 0 2px 4px rgba(0, 120, 212, 0.25);
          transition: all 0.2s ease;
        }

        .data-actions .package-manager-btn:hover {
          background: linear-gradient(135deg, #106ebe, #005a9e);
          transform: translateY(-1px);
          box-shadow: 0 3px 6px rgba(0, 120, 212, 0.35);
        }

        :host(.vscode-light) .data-actions .package-manager-btn {
          background: linear-gradient(135deg, #005a9e, #0078d4);
          box-shadow: 0 2px 4px rgba(0, 90, 158, 0.3);
        }

        :host(.vscode-light) .data-actions .package-manager-btn:hover {
          background: linear-gradient(135deg, #004578, #005a9e);
        }

        .data-actions .package-manager-btn .codicon {
          font-size: 14px;
        }

        /* Clear All Button - Destructive action with gradient */
        .data-actions button {
          background: linear-gradient(135deg, #dc3545, #e74c5c);
          color: #ffffff;
          border: 1px solid rgba(255, 255, 255, 0.2);
          border-radius: 4px;
          padding: 4px 12px;
          height: 26px;
          font-size: 0.9em;
          font-weight: 500;
          cursor: pointer;
          display: flex;
          align-items: center;
          gap: 6px;
          box-shadow: 0 2px 4px rgba(220, 53, 69, 0.25);
          transition: all 0.2s ease;
        }

        .data-actions button:hover {
          background: linear-gradient(135deg, #c82333, #dc3545);
          transform: translateY(-1px);
          box-shadow: 0 3px 6px rgba(220, 53, 69, 0.35);
        }

        /* Light theme optimization */
        :host(.vscode-light) .data-actions button {
          background: linear-gradient(135deg, #c82333, #dc3545);
          box-shadow: 0 2px 4px rgba(200, 35, 51, 0.3);
        }

        :host(.vscode-light) .data-actions button:hover {
          background: linear-gradient(135deg, #bd2130, #c82333);
        }

        /* Table Styles */
        .data-table-container {
          flex: 1;
          overflow: auto;
          border: 1px solid var(--vscode-panel-border);
          border-radius: 4px;
        }

        .data-table {
          width: 100%;
          border-collapse: collapse;
          font-size: 0.9em;
        }

        .data-table th {
          background: var(--vscode-sideBar-background);
          border-bottom: 1px solid var(--vscode-panel-border);
          padding: 8px 12px;
          text-align: left;
          font-weight: 600;
          font-size: 0.85em;
          white-space: nowrap;
          position: sticky;
          top: 0;
          z-index: 1;
        }

        .data-table td {
          padding: 6px 12px;
          border-bottom: 1px solid var(--vscode-panel-border);
          vertical-align: middle;
        }

        .data-table tbody tr:hover {
          background: var(--vscode-list-hoverBackground);
        }

        .data-table tbody tr:nth-child(even) {
          background: var(--vscode-editor-lineHighlightBackground);
        }

        .data-table tbody tr:nth-child(even):hover {
          background: var(--vscode-list-hoverBackground);
        }

        /* Type Icon Column */
        .data-type-cell {
          display: flex;
          align-items: center;
          gap: 8px;
          font-weight: 500;
        }

        .data-type-cell i {
          font-size: 16px;
          opacity: 0.8;
          width: 16px;
          text-align: center;
        }

        /* Key/Path Column */
        .data-key-cell {
          font-family: var(--vscode-editor-font-family);
          font-size: 0.85em;
          word-break: break-all;
          max-width: 0;
        }

        /* Size Column */
        .data-size-cell {
          text-align: left;
          font-family: var(--vscode-editor-font-family);
          font-size: 0.85em;
          color: var(--vscode-descriptionForeground);
        }

        /* Actions Column */
        .data-actions-cell {
          text-align: center;
        }

        .data-delete-btn {
          width: 24px;
          height: 24px;
          min-width: 24px;
          padding: 0;
          box-sizing: border-box;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          border: 1px solid var(--vscode-button-border, transparent);
          background: #cc3333;
          color: var(--vscode-button-foreground);
          cursor: pointer;
          border-radius: 6px;
        }

        .data-delete-btn:hover {
          background: #a32929;
        }

        .data-delete-btn i {
          font-size: 13px;
          line-height: 1;
        }

        /* Empty State */
        .data-empty {
          text-align: center;
          padding: 40px 20px;
          color: var(--vscode-descriptionForeground);
        }

        .data-empty i {
          font-size: 48px;
          opacity: 0.3;
          margin-bottom: 12px;
        }

        .data-empty h3 {
          margin: 0 0 8px 0;
          font-weight: 500;
        }

        .data-empty p {
          margin: 0;
          font-size: 0.9em;
        }
      </style>

      <div class="data-title-bar">
        <div class="data-title">
          <i class="codicon codicon-database"></i>
          <span data-nls="storedData">Stored Data</span>
        </div>
        <div class="data-search-wrap">
          <i class="codicon codicon-search"></i>
          <input
            id="data-filter-input"
            type="text"
            placeholder="Filter by key/path…"
            data-nls="filterByKeyPath"
          />
        </div>
        <div class="data-filter-wrap">
          <select id="data-type-filter">
            <option value="all" data-nls="filterAll">All</option>
            <option value="packages" data-nls="filterPackages">Installed Packages</option>
            <option value="global-storage" data-nls="filterGlobalStorage">Global Storage</option>
            <option value="secret-storage" data-nls="filterSecretStorage">Secret Storage</option>
            <option value="workspace-storage" data-nls="filterWorkspaceStorage">Workspace Storage</option>
            <option value="global-files" data-nls="filterGlobalFiles">Global Files</option>
            <option value="workspace-files" data-nls="filterWorkspaceFiles">Workspace Files</option>
            <option value="text-files" data-nls="filterTextFiles">Text Files</option>
            <option value="json-files" data-nls="filterJsonFiles">JSON Files</option>
            <option value="binary-files" data-nls="filterBinaryFiles">Binary Files</option>
          </select>
        </div>
        <div class="data-actions">
          <button id="package-manager-btn" type="button" class="package-manager-btn" data-nls="managePackages" title="Manage npm packages">
            <span class="codicon codicon-package"></span>
            <span class="btn-text" data-nls="managePackages">Packages</span>
          </button>
          <button id="clear-all-btn" type="button" data-nls="clearAll">
            Clear All
          </button>
        </div>
      </div>
      <div class="data-table-container">
        <table class="data-table">
          <thead>
            <tr>
              <th style="width: 180px" data-nls="type">Type</th>
              <th data-nls="keyPath">Key / Path</th>
              <th style="width: 80px" data-nls="size">Size</th>
              <th style="width: 50px; text-align: center" data-nls="actions">Actions</th>
            </tr>
          </thead>
          <tbody id="data-table-body">
          </tbody>
        </table>
      </div>
    `;

    this.setupEventListeners();
  }

  // ============================================================================
  // Event Handling
  // ============================================================================

  setupEventListeners() {
    // Prevent duplicate event listener setup
    if (this._eventListenersSetup) {
      return;
    }

    const filterInput = this.shadowRoot.getElementById('data-filter-input');
    const typeFilter = this.shadowRoot.getElementById('data-type-filter');
    const clearAllBtn = this.shadowRoot.getElementById('clear-all-btn');

    // Filter input with debouncing
    if (filterInput) {
      const handleInput = (e) => {
        const inputValue = e.target.value;
        
        clearTimeout(this._filterTimer);
        this._filterTimer = setTimeout(() => {
          this.filterText = inputValue;
        }, 300);
      };
      
      filterInput.addEventListener('input', handleInput);
      // Store reference for cleanup if needed
      this._filterInputHandler = handleInput;
    } else {
      console.error('Filter input not found!');
    }

    // Type filter
    if (typeFilter) {
      const handleChange = (e) => {
        this.filterType = e.target.value;
      };
      
      typeFilter.addEventListener('change', handleChange);
      // Store reference for cleanup if needed
      this._typeFilterHandler = handleChange;
    } else {
      console.error('Type filter not found!');
    }

    // Package Manager button
    const packageManagerBtn = this.shadowRoot.getElementById('package-manager-btn');
    if (packageManagerBtn) {
      packageManagerBtn.addEventListener('click', () => {
        this.dispatchEvent(new CustomEvent('open-package-manager', {
          bubbles: true,
          composed: true
        }));
      });
    }

    // Clear all button
    clearAllBtn.addEventListener('click', async () => {
      const filteredData = this._filteredData || [];
      
      if (!filteredData.length) {
        await window.ConfirmationSystem.showChoiceDialog(
          this.getNlsText("nothingToDelete", "沒有可刪除的資料"),
          this.getNlsText("nothingToDeleteDesc", "目前列表為空。"),
          [this.getNlsText("ok", "好")]
        );
        return;
      }

      const choice = await window.ConfirmationSystem.showChoiceDialog(
        this.getNlsText("clearFiltered", "清除目前列表"),
        this.getNlsText("clearFilteredMessage", `確定要刪除目前列表的 ${filteredData.length} 項資料嗎？此操作無法復原。`).replace('{0}', String(filteredData.length)),
        [this.getNlsText("delete", "刪除"), this.getNlsText("cancel", "取消")]
      );
      
      if (choice === this.getNlsText("delete", "刪除")) {
        const confirmClear = this.dispatchEvent(new CustomEvent('data-clear-requested', {
          cancelable: true,
          detail: { filteredData }
        }));
        
        if (confirmClear) {
          // Clear operation confirmed
        }
      }
    });

    // Delete button delegation
    this.shadowRoot.addEventListener('click', async (e) => {
      if (e.target.closest('.data-delete-btn')) {
        e.preventDefault();
        e.stopPropagation();
        
        const btn = e.target.closest('.data-delete-btn');
        const key = btn.dataset.key;
        const kind = btn.dataset.kind;
        const index = parseInt(btn.dataset.i);
        
        if (key && kind && index >= 0 && index < this._filteredData.length) {
          const row = this._filteredData[index];
          
          // Show confirmation dialog using global showChoiceDialog
          const choice = await window.ConfirmationSystem.showChoiceDialog(
            this.getNlsText('deleteConfirm', 'Delete Data'),
            this.getNlsText('deleteDataMessage', 'Are you sure you want to delete the data at "{path}"?').replace('{path}', key),
            [this.getNlsText('delete', 'Delete'), this.getNlsText('cancel', 'Cancel')]
          );
          
          if (choice === this.getNlsText('delete', 'Delete')) {
            // 派發事件到父級，傳送完整的 row 對象
            this.dispatchEvent(new CustomEvent('data-delete-requested', {
              bubbles: true,
              detail: { row }
            }));
          }
        }
      }
    });
    
    // Mark event listeners as setup
    this._eventListenersSetup = true;
  }

  // ============================================================================
  // Data Processing and Filtering
  // ============================================================================

  updateFilteredData() {
    const q = this._filterText.trim().toLowerCase();
    
    // Text filtering
    let filtered = q ? 
      this._data.filter(row => {
        // Check both key and keyPath fields - data might use either
        const key = (row.key || '').toLowerCase();
        const keyPath = (row.keyPath || '').toLowerCase();
        const matches = key.includes(q) || keyPath.includes(q);
        
        return matches;
      }) : 
      [...this._data]; // Use spread operator instead of slice

    // Type filtering
    if (this._filterType !== 'all') {
      filtered = filtered.filter(row => {
        switch (this._filterType) {
          case 'global-storage':
            return row.kind === 'kv' && row.scope === 'global';
          case 'secret-storage':
            return row.kind === 'secret';
          case 'workspace-storage':
            return row.kind === 'kv' && row.scope === 'workspace';
          case 'global-files':
            return row.kind === 'file' && row.scope === 'global';
          case 'workspace-files':
            return row.kind === 'file' && row.scope === 'workspace';
          case 'text-files':
            return row.kind === 'file' && row.ext === 'text';
          case 'json-files':
            return row.kind === 'file' && row.ext === 'json';
          case 'binary-files':
            return row.kind === 'file' && row.ext === 'binary';
          case 'packages':
            return row.kind === 'package';
          default:
            return true;
        }
      });
    }

    // Sort by size (largest first)
    filtered.sort((a, b) => (b.size || 0) - (a.size || 0));

    this._filteredData = filtered;
    this.renderTable();
  }

  renderTable() {
    const tbody = this.shadowRoot.getElementById('data-table-body');
    
    if (!this._filteredData.length) {
      tbody.innerHTML = `
        <tr>
          <td colspan="4">
            <div class="data-empty">
              <div><i class="codicon codicon-database"></i></div>
              <h3>${this.getNlsText('noDataFound', 'No data found')}</h3>
              <p>${this.getNlsText('noDataDescription', 'No stored data matches your filter criteria.')}</p>
            </div>
          </td>
        </tr>
      `;
      return;
    }

    const tableHTML = this._filteredData.map((row, index) => `
      <tr>
        <td>
          <div class="data-type-cell">
            <i class="codicon codicon-${this.getTypeIcon(row)}"></i>
            <span>${this.escapeHtml(this.getTypeLabel(row))}</span>
          </div>
        </td>
        <td class="data-key-cell">${this.escapeHtml(row.key || row.keyPath || '')}</td>
        <td class="data-size-cell">${this.formatBytes(row.size || 0)}</td>
        <td class="data-actions-cell">
          <button 
            class="data-delete-btn" 
            data-key="${this.escapeHtml(row.key || row.keyPath || '')}"
            data-kind="${this.escapeHtml(row.kind || '')}"
            data-i="${index}"
            title="${this.getNlsText('delete', 'Delete')}"
            aria-label="${this.getNlsText('delete', 'Delete')}"
          >
            <i class="codicon codicon-trash"></i>
          </button>
        </td>
      </tr>
    `).join('');
    
    tbody.innerHTML = tableHTML;
  }

  // ============================================================================
  // Utility Methods
  // ============================================================================

  getTypeIcon(row) {
    if (row.kind === 'package') {
      return 'package';
    }
    if (row.kind === 'secret') {
      return 'lock';
    }
    if (row.kind === 'kv') {
      return 'database';
    }
    if (row.ext === 'text') {
      return 'file-text';
    }
    if (row.ext === 'json') {
      return 'file-code';
    }
    return 'file-binary';
  }

  getTypeLabel(row) {
    if (row.kind === 'package') {
      const version = row.version ? `@${row.version}` : '';
      return `${this.getNlsText('npmPackage', 'npm 套件')}${version}`;
    }
    if (row.kind === 'secret') {
      return this.getNlsText('secretStorage', 'Secret Storage');
    }
    if (row.kind === 'kv') {
      return row.scope === 'global' ? 
        this.getNlsText('globalStorage', 'Global Storage') : 
        this.getNlsText('workspaceStorage', 'Workspace Storage');
    }
    if (row.kind === 'file') {
      const scopeLabel = row.scope === 'global' ? 
        this.getNlsText('globalFile', 'Global File') : 
        this.getNlsText('workspaceFile', 'Workspace File');
      const extLabel = row.ext === 'text' ? 'Text' : 
                       row.ext === 'json' ? 'JSON' : 'Binary';
      return `${scopeLabel} (${extLabel})`;
    }
    return 'Unknown';
  }

  formatBytes(n) {
    if (!Number.isFinite(n)) {
      return '0 B';
    }
    const units = ['B', 'KB', 'MB', 'GB'];
    let i = 0;
    while (n >= 1024 && i < units.length - 1) {
      n /= 1024;
      i++;
    }
    return `${Math.round(n * 10) / 10} ${units[i]}`;
  }

  escapeHtml(str = '') {
    return str.replace(/[&<>"']/g, (match) => {
      const escapes = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
      return escapes[match];
    });
  }

  getNlsText(key, defaultValue) {
    return this._nlsData[key] || defaultValue || key;
  }

  updateTexts() {
    // Update all elements with data-nls attributes
    this.shadowRoot.querySelectorAll('[data-nls]').forEach(el => {
      const key = el.getAttribute('data-nls');
      const text = this.getNlsText(key, el.textContent);
      
      if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') {
        el.placeholder = text;
      } else {
        el.textContent = text;
      }
    });

    // Re-render table if needed to update type labels
    if (this._filteredData.length > 0) {
      this.renderTable();
    }
  }

  // ============================================================================
  // Public API Methods
  // ============================================================================

  /**
   * Refresh data display
   */
  refresh() {
    this.updateFilteredData();
    
    // Trigger refresh request
    this.dispatchEvent(new CustomEvent('data-refresh-requested', {
      detail: { timestamp: Date.now() }
    }));
  }

  /**
   * Clear current filters
   */
  clearFilters() {
    this.filterText = '';
    this.filterType = 'all';
    
    const filterInput = this.shadowRoot.getElementById('data-filter-input');
    const typeFilter = this.shadowRoot.getElementById('data-type-filter');
    
    if (filterInput) {
      filterInput.value = '';
    }
    if (typeFilter) {
      typeFilter.value = 'all';
    }
  }

  /**
   * Get currently visible data (for external operations)
   */
  getVisibleData() {
    return [...this._filteredData];
  }
}

// Register the custom element
customElements.define('data-view', DataView);

// Export for module systems
if (typeof module !== 'undefined' && module.exports) {
  module.exports = DataView;
}
