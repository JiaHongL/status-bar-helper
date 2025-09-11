/**
 * List View Web Component
 * 
 * Manages the main status bar items table display with:
 * - Search/filter integration
 * - Item rendering and sorting
 * - Drag & drop reordering
 * - Action buttons (run/stop/edit/delete)
 * - Visibility and auto-run toggles
 * - Command copying functionality
 */

// Prevent duplicate declarations
if (window.ListViewComponent) {
  // Skip redefinition silently
} else {

class ListViewComponent extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    
    // State management
    this._items = [];
    this._filterText = '';
    this._runningCommands = new Set();
    this._nlsData = {};
    this._codiconsUri = '';
    
    // Event handlers
    this._boundHandlers = {
      dragStart: this._handleDragStart.bind(this),
      dragOver: this._handleDragOver.bind(this),
      drop: this._handleDrop.bind(this),
      itemAction: this._handleItemAction.bind(this),
      toggleChange: this._handleToggleChange.bind(this),
      copyCommand: this._handleCopyCommand.bind(this)
    };
    
    this._setupShadowDOM();
  }

  // ========== Component Lifecycle ==========
  
  static get observedAttributes() {
    return ['codicons-uri'];
  }

  attributeChangedCallback(name, oldValue, newValue) {
    if (name === 'codicons-uri' && newValue !== oldValue) {
      this._codiconsUri = newValue;
      this._loadCodiconsCSS();
    }
  }

  connectedCallback() {
    this._setupEventListeners();
    // Load codicons if URI is already set
    if (this._codiconsUri) {
      this._loadCodiconsCSS();
    }
  }

  disconnectedCallback() {
    this._cleanupEventListeners();
  }

  // ========== CSS Loading ==========
  
  _loadCodiconsCSS() {
    if (!this._codiconsUri) {
      return;
    }
    
    // Remove existing codicons link if any
    const existingLink = this.shadowRoot.querySelector('link[data-codicons]');
    if (existingLink) {
      existingLink.remove();
    }
    
    // Add new codicons CSS link
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = this._codiconsUri;
    link.setAttribute('data-codicons', 'true');
    this.shadowRoot.insertBefore(link, this.shadowRoot.firstChild);
  }

  // ========== Properties ==========
  
  get items() {
    return this._items;
  }

  set items(value) {
    this._items = Array.isArray(value) ? [...value] : [];
    this._render();
  }

  get filterText() {
    return this._filterText;
  }

  set filterText(value) {
    this._filterText = String(value || '');
    this._render();
  }

  get runningCommands() {
    return this._runningCommands;
  }

  set runningCommands(value) {
    this._runningCommands = new Set(value);
    this._render();
  }

  // ========== NLS Support (參考 data-view.js 模式) ==========

  // 多語系文字取得 - 參考 data-view.js 實作
  getText(key, defaultValue) {
    return this._nlsData[key] || defaultValue || key;
  }

  // NLS data property - 參考 data-view.js
  get nlsData() {
    return this._nlsData;
  }

  set nlsData(value) {
    this._nlsData = value || {};
    this.updateTexts();
  }

  updateTexts() {
    // Update all elements with data-nls attributes
    this.shadowRoot.querySelectorAll('[data-nls]').forEach(el => {
      const key = el.getAttribute('data-nls');
      const text = this.getText(key, el.textContent);
      
      if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') {
        el.placeholder = text;
      } else {
        el.textContent = text;
      }
    });

    // Re-render if needed to update texts
    this._render();
  }

  // ========== Shadow DOM Setup ==========
  
  _setupShadowDOM() {
    const template = document.createElement('template');
    template.innerHTML = `
      <style>
        ${this._getComponentStyles()}
      </style>
      <div class="list-table-container">
        <table class="list-table">
          <thead>
            <tr>
              <th style="width: 40px;"></th>
              <th style="width: 40px; text-align: center;" data-nls="icon">${this.getText('icon', 'Icon')}</th>
              <th data-nls="labelTooltip">${this.getText('labelTooltip', 'Item & Tooltip')}</th>
              <th style="width: 80px; text-align: center;" data-nls="status">${this.getText('status', 'Status')}</th>
              <th style="width: 80px; text-align: center;" data-nls="visible">${this.getText('visible', 'Visible')}</th>
              <th style="width: 100px; text-align: center;" data-nls="runAtStartup">${this.getText('runAtStartup', 'Run at Startup')}</th>
              <th style="width: 80px; text-align: center;" data-nls="cmdId">${this.getText('cmdId', 'Command ID')}</th>
              <th style="width: 140px; text-align: center;" data-nls="actions">${this.getText('actions', 'Actions')}</th>
            </tr>
          </thead>
          <tbody id="items-list-body">
            <!-- Items will be rendered here -->
          </tbody>
        </table>
      </div>
    `;
    
    this.shadowRoot.appendChild(template.content.cloneNode(true));
  }

  _getComponentStyles() {
    return `
      /* Component Container */
      :host {
        display: block;
        height: 100%;
        overflow: hidden;
      }

      /* Table Layout */
      .list-table-container { 
        flex-grow: 1; 
        height: 100%;
        overflow-y: auto; 
      }

      table.list-table { 
        width: 100%; 
        border-collapse: collapse; 
      }

      table.list-table th {
        text-align: left; 
        color: var(--vscode-descriptionForeground); 
        font-size: .9em; 
        padding: 8px 10px;
        border-bottom: 1px solid var(--vscode-editorGroup-border);
        position: sticky; 
        top: 0; 
        background: var(--vscode-sideBar-background); 
        z-index: 1;
      }

      table.list-table td {
        padding: 0px 10px; 
        border-bottom: 1px dotted var(--vscode-editorGroup-border); 
        vertical-align: middle;
      }

      tr.item-row { 
        height: 34px; 
      }

      table.list-table tr.item-row:hover {
        background-color: var(--vscode-list-hoverBackground);
      }

      /* Table Cell Content */
      .td-content-wrapper { 
        height: 100%; 
        display: flex; 
        align-items: center; 
      }

      .td-content-wrapper.justify-center { 
        justify-content: center; 
      }

      .td-content-wrapper.justify-end { 
        justify-content: flex-end; 
        gap: 6px; 
      }

      /* Drag Handle */
      .drag-handle { 
        opacity: .55; 
        cursor: grab; 
      }

      .drag-handle:hover { 
        opacity: .9; 
      }

      .drag-handle:active {
        cursor: grabbing;
      }

      /* Item Icon */
      .item-icon .codicon {
        width: 22px; 
        height: 22px; 
        display: inline-flex; 
        align-items: center; 
        justify-content: center;
        border-radius: 6px;
        background: var(--vscode-button-secondaryBackground);
        color: var(--vscode-icon-foreground);
      }

      /* Item Details */
      .item-details { 
        display: flex; 
        flex-direction: row; 
        gap: 8px; 
        overflow: hidden; 
        align-items: center; 
      }

      .item-label { 
        font-weight: 600; 
        white-space: nowrap; 
        overflow: hidden; 
        text-overflow: ellipsis; 
      }

      .item-tooltip { 
        color: var(--vscode-descriptionForeground); 
        white-space: nowrap; 
        overflow: hidden; 
        text-overflow: ellipsis; 
        font-size: .9em; 
      }

      /* Hidden items styling */
      tr.is-hidden .item-label, 
      tr.is-hidden .item-tooltip { 
        opacity: .55; 
      }

      /* Running Status */
      .running-dot {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        color: var(--vscode-charts-green);
        font-weight: 500;
        font-size: 0.85em;
      }

      .running-dot::before {
        content: '';
        width: 8px;
        height: 8px;
        border-radius: 50%;
        background-color: var(--vscode-charts-green);
        animation: pulse 2s infinite;
      }

      @keyframes pulse {
        0% { opacity: 0.6; }
        50% { opacity: 1; }
        100% { opacity: 0.6; }
      }

      /* Slide Checkbox (Toggle Switch) */
      .slide-checkbox {
        position: relative;
        display: inline-block;
        width: 34px;
        height: 18px;
        cursor: pointer;
      }

      .slide-checkbox input {
        opacity: 0;
        width: 0;
        height: 0;
      }

      .slider {
        position: absolute;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background-color: var(--vscode-button-secondaryBackground);
        transition: 0.2s;
        border-radius: 18px;
        border: 1px solid var(--vscode-button-border, transparent);
      }

      .slider:before {
        position: absolute;
        content: "";
        height: 12px;
        width: 12px;
        left: 2px;
        bottom: 2px;
        background-color: var(--vscode-button-secondaryForeground);
        transition: 0.2s;
        border-radius: 50%;
      }

      input:checked + .slider {
        background-color: var(--vscode-button-background);
      }

      input:checked + .slider:before {
        transform: translateX(16px);
        background-color: var(--vscode-button-foreground);
      }

      /* Command Cell */
      .command-cell {
        display: flex;
        justify-content: center;
        align-items: center;
        gap: 4px;
      }

      .command-input {
        flex-grow: 1;
        background-color: var(--vscode-input-background);
        color: var(--vscode-input-foreground);
        border: 1px solid var(--vscode-input-border);
        padding: 2px 6px;
        font-family: var(--vscode-editor-font-family, monospace);
        font-size: 0.9em;
        border-radius: 3px;
        max-width: 80px;
      }

      /* Action Buttons */
      .item-actions { 
        display: flex; 
        gap: 4px; 
        align-items: center; 
        white-space: nowrap; 
        height: 34px; 
      }

      .item-actions .td-content-wrapper { 
        height: 34px; 
      }

      /* Icon Buttons */
      .icon-btn, .copy-btn {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 24px;
        height: 24px;
        border: 1px solid var(--vscode-button-border);
        border-radius: 4px;
        background: var(--vscode-button-secondaryBackground);
        color: var(--vscode-button-secondaryForeground);
        cursor: pointer;
        transition: all 0.15s ease;
        font-size: 14px;
      }

      .icon-btn:hover, .copy-btn:hover {
        background: var(--vscode-button-secondaryHoverBackground);
        border-color: var(--vscode-focusBorder);
        color: var(--vscode-button-foreground);
      }

      .icon-btn:active, .copy-btn:active {
        background: var(--vscode-button-background);
        transform: scale(0.95);
      }

      /* Action button specific colors */
      .run-now-item:hover {
        background: var(--vscode-charts-green);
        color: white;
      }

      .stop-item:hover {
        background: var(--vscode-charts-red);
        color: white;
      }

      .edit-item:hover {
        background: var(--vscode-charts-blue);
        color: white;
      }

      .delete-item:hover {
        background: var(--vscode-charts-orange);
        color: white;
      }

      /* Empty State */
      .empty-state {
        text-align: center;
        opacity: 0.7;
        padding: 20px;
        font-style: italic;
      }

      /* Codicon Integration */
      .codicon {
        font-family: codicon;
        cursor: inherit;
        color: inherit;
        font-size: inherit;
      }

      /* Drag and Drop Visual Feedback */
      tr.item-row[draggable="true"]:hover {
        background-color: var(--vscode-list-hoverBackground);
        cursor: grab;
      }

      tr.item-row.drag-over {
        background-color: var(--vscode-list-dropBackground);
        border: 1px dashed var(--vscode-list-focusOutline);
      }

      /* Responsive adjustments */
      @media (max-width: 860px) {
        .item-tooltip {
          display: none;
        }
        
        .command-input {
          max-width: 60px;
          font-size: 0.8em;
        }
        
        table.list-table th,
        table.list-table td {
          padding: 4px 6px;
        }
      }
    `;
  }

  // ========== Event Handling ==========
  
  _setupEventListeners() {
    const tbody = this.shadowRoot.getElementById('items-list-body');
    if (tbody) {
      tbody.addEventListener('click', this._boundHandlers.itemAction);
      tbody.addEventListener('change', this._boundHandlers.toggleChange);
      tbody.addEventListener('dragstart', this._boundHandlers.dragStart);
      tbody.addEventListener('dragover', this._boundHandlers.dragOver);
      tbody.addEventListener('drop', this._boundHandlers.drop);
    }
  }

  _cleanupEventListeners() {
    const tbody = this.shadowRoot.getElementById('items-list-body');
    if (tbody) {
      tbody.removeEventListener('click', this._boundHandlers.itemAction);
      tbody.removeEventListener('change', this._boundHandlers.toggleChange);
      tbody.removeEventListener('dragstart', this._boundHandlers.dragStart);
      tbody.removeEventListener('dragover', this._boundHandlers.dragOver);
      tbody.removeEventListener('drop', this._boundHandlers.drop);
    }
  }

  // ========== Rendering ==========
  
  _render() {
    const tbody = this.shadowRoot.getElementById('items-list-body');
    if (!tbody) {
      return;
    }

    tbody.innerHTML = '';
    
    const filteredItems = this._getFilteredItems();

    if (!filteredItems.length) {
      tbody.innerHTML = `
        <tr>
          <td colspan="8" class="empty-state">
            ${this._filterText 
              ? this.getText('noMatchingItems', 'No matching items')
              : this.getText('noItemsToDisplay', 'No items to display')
            }
          </td>
        </tr>
      `;
      return;
    }

    // Sort running items to the top
    const sortedItems = [...filteredItems].sort((a, b) => {
      const aRunning = this._runningCommands.has(a.command);
      const bRunning = this._runningCommands.has(b.command);
      if (aRunning && !bRunning) {
        return -1;
      }
      if (!aRunning && bRunning) {
        return 1;
      }
      return 0;
    });

    sortedItems.forEach((item) => {
      const originalIndex = this._items.indexOf(item);
      const row = this._createItemRow(item, originalIndex);
      tbody.appendChild(row);
    });

    this._updateRunningBadge();
  }

  _getFilteredItems() {
    const q = this._filterText.trim().toLowerCase();
    if (!q) {
      return this._items;
    }

    return this._items.filter((item) => {
      const label = item.text.replace(/^\$\(([^)]+)\) /, '');
      const tagMatch = Array.isArray(item.tags) && 
        item.tags.some((t) => t.toLowerCase().includes(q));
      
      return (
        label.toLowerCase().includes(q) ||
        (item.tooltip || '').toLowerCase().includes(q) ||
        (item.command || '').toLowerCase().includes(q) ||
        tagMatch
      );
    });
  }

  _createItemRow(item, originalIndex) {
    const m = item.text.match(/^\$\(([^)]+)\) (.*)$/);
    const icon = m ? m[1] : '';
    const label = m ? (m[2] ?? '---') : item.text;
    const isRunning = this._runningCommands.has(item.command);

    const row = document.createElement('tr');
    row.className = 'item-row';
    if (item.hidden) {
      row.classList.add('is-hidden');
    }
    row.dataset.index = originalIndex;

    // Only set draggable for non-running items
    if (!isRunning) {
      row.setAttribute('draggable', 'true');
    }

    row.innerHTML = `
      <td class="drag-handle" title="Drag to reorder">
        <div class="td-content-wrapper">
          <i class="codicon codicon-grabber"></i>
        </div>
      </td>
      <td class="item-icon">
        <div class="td-content-wrapper justify-center">
          <i class="codicon codicon-${icon || 'ellipsis'}"></i>
        </div>
      </td>
      <td>
        <div class="td-content-wrapper">
          <div class="item-details">
            <div class="item-label" title="${this._escapeHtml(label)}">
              ${this._escapeHtml(label)}
            </div>
            <div class="item-tooltip" title="${this._escapeHtml(item.tooltip || '')}">
              ${this._escapeHtml(item.tooltip || 'No tooltip')}
            </div>
          </div>
        </div>
      </td>
      <td>
        <div class="td-content-wrapper justify-center">
          ${isRunning 
            ? `<span class="running-dot">${this.getText('running', 'Running')}</span>`
            : `<span style="opacity:.5">—</span>`
          }
        </div>
      </td>
      <td>
        <div class="td-content-wrapper justify-center">
          <label class="slide-checkbox">
            <input type="checkbox" class="visibility-toggle" data-index="${originalIndex}" ${item.hidden ? '' : 'checked'}>
            <span class="slider"></span>
          </label>
        </div>
      </td>
      <td>
        <div class="td-content-wrapper justify-center">
          <label class="slide-checkbox">
            <input type="checkbox" class="run-on-enable-toggle" data-index="${originalIndex}" ${item.enableOnInit ? 'checked' : ''}>
            <span class="slider"></span>
          </label>
        </div>
      </td>
      <td>
        <div class="td-content-wrapper justify-center">
          <div class="command-cell">
            <button class="copy-btn" title="Copy ${this._escapeHtml(item.command || '')}">
              <i class="codicon codicon-clippy"></i>
            </button>
            <input type="text" readonly class="command-input" style="display: none;" value="${this._escapeHtml(item.command || '')}" />
          </div>
        </div>
      </td>
      <td class="item-actions">
        <div class="td-content-wrapper justify-end">
          <button class="icon-btn run-now-item" data-index="${originalIndex}" type="button" 
                  title="${this.getText('run', 'Run')}" aria-label="${this.getText('run', 'Run')}">
            <i class="codicon codicon-play"></i>
          </button>
          <button class="icon-btn stop-item" data-index="${originalIndex}" type="button" 
                  title="${this.getText('stop', 'Stop')}" aria-label="${this.getText('stop', 'Stop')}">
            <i class="codicon codicon-debug-stop"></i>
          </button>
          <button class="icon-btn edit-item" data-index="${originalIndex}" type="button" 
                  title="${this.getText('edit', 'Edit')}" aria-label="${this.getText('edit', 'Edit')}">
            <i class="codicon codicon-edit"></i>
          </button>
          <button class="icon-btn delete-item" data-index="${originalIndex}" type="button" 
                  title="${this.getText('delete', 'Delete')}" aria-label="${this.getText('delete', 'Delete')}">
            <i class="codicon codicon-trash"></i>
          </button>
        </div>
      </td>
    `;

    return row;
  }

  // ========== Event Handlers ==========
  
  _handleItemAction(e) {
    const button = e.target.closest('button');
    if (!button) {
      return;
    }

    const index = parseInt(button.dataset.index);
    if (isNaN(index)) {
      return;
    }

    if (button.classList.contains('run-now-item')) {
      this._dispatchItemEvent('item-run', { index });
    } else if (button.classList.contains('stop-item')) {
      this._dispatchItemEvent('item-stop', { index });
    } else if (button.classList.contains('edit-item')) {
      this._dispatchItemEvent('item-edit', { index });
    } else if (button.classList.contains('delete-item')) {
      this._dispatchItemEvent('item-delete', { index });
    } else if (button.classList.contains('copy-btn')) {
      this._handleCopyCommand(e);
    }
  }

  _handleToggleChange(e) {
    const checkbox = e.target;
    const index = parseInt(checkbox.dataset.index);
    if (isNaN(index)) {
      return;
    }

    if (checkbox.classList.contains('visibility-toggle')) {
      this._dispatchItemEvent('item-visibility-toggle', { 
        index, 
        visible: checkbox.checked 
      });
    } else if (checkbox.classList.contains('run-on-enable-toggle')) {
      this._dispatchItemEvent('item-startup-toggle', { 
        index, 
        enableOnInit: checkbox.checked 
      });
    }
  }

  _handleCopyCommand(e) {
    const button = e.target.closest('.copy-btn');
    if (!button) {
      return;
    }

    const input = button.parentElement.querySelector('.command-input');
    if (input && input.value) {
      navigator.clipboard.writeText(input.value).then(() => {
        this._dispatchItemEvent('command-copied', { command: input.value });
      }).catch(err => {
        // Silently handle clipboard failure
      });
    }
  }

  _handleDragStart(e) {
    const row = e.target.closest('tr.item-row');
    if (!row) {
      return;
    }

    const index = parseInt(row.dataset.index);
    e.dataTransfer.setData('text/plain', index);
    e.dataTransfer.effectAllowed = 'move';
  }

  _handleDragOver(e) {
    const row = e.target.closest('tr.item-row');
    if (!row) {
      return;
    }

    const index = parseInt(row.dataset.index);
    const targetItem = this._items[index];
    
    // Only allow drop on non-running items
    if (targetItem && !this._runningCommands.has(targetItem.command)) {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      row.classList.add('drag-over');
    }
  }

  _handleDrop(e) {
    e.preventDefault();
    
    const row = e.target.closest('tr.item-row');
    if (!row) {
      return;
    }

    row.classList.remove('drag-over');
    
    const fromIndex = parseInt(e.dataTransfer.getData('text/plain'));
    const toIndex = parseInt(row.dataset.index);
    
    if (isNaN(fromIndex) || fromIndex === toIndex) {
      return;
    }

    // Check that both source and target items are not running
    const fromItem = this._items[fromIndex];
    const toItem = this._items[toIndex];
    
    if (this._runningCommands.has(fromItem.command) || 
        this._runningCommands.has(toItem.command)) {
      return;
    }

    this._dispatchItemEvent('items-reorder', { fromIndex, toIndex });
  }

  // ========== Utility Methods ==========
  
  _dispatchItemEvent(eventName, detail) {
    this.dispatchEvent(new CustomEvent(eventName, { 
      detail,
      bubbles: true 
    }));
  }

  _escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  _updateRunningBadge() {
    // This would be implemented to update external running badge
    const runningCount = this._runningCommands.size;
    this._dispatchItemEvent('running-count-changed', { count: runningCount });
  }

  // ========== Public Methods ==========

  refresh() {
    this._render();
  }

  getFilteredItemCount() {
    return this._getFilteredItems().length;
  }
}

// Register the custom element
if (!customElements.get('list-view')) {
  customElements.define('list-view', ListViewComponent);
}

// Export for external use
if (!window.ListViewComponent) {
  window.ListViewComponent = ListViewComponent;
}

} // End of duplicate declaration check
