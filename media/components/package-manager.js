/**
 * Package Manager Web Component
 * ==============================
 * 
 * A dialog component for managing npm packages in the extension's storage.
 * Provides install, uninstall, and view functionality.
 * 
 * Features:
 * - Install new packages by name
 * - View installed packages list
 * - Uninstall packages
 * - Version support
 * 
 * Events:
 * - package-install-requested: Fired when user wants to install a package
 * - package-uninstall-requested: Fired when user wants to uninstall a package
 * - package-manager-closed: Fired when dialog is closed
 * 
 * @author Status Bar Helper
 */

class PackageManager extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    
    // Internal state
    this._packages = [];
    this._filteredPackages = [];
    this._searchQuery = '';
    this._nlsData = {};
    this._isOpen = false;
    this._isInstalling = false;
    
    this.render();
    this.loadCodiconsCSS();
    this.setupEventListeners();
    
    // Detect and apply theme class
    this.updateThemeClass();
    this.setupThemeObserver();
  }

  // ============================================================================
  // Properties
  // ============================================================================

  get packages() {
    return this._packages;
  }

  set packages(value) {
    this._packages = Array.isArray(value) ? value : [];
    this._filteredPackages = this.filterPackages(this._searchQuery);
    this.renderPackagesList();
  }

  // Filter packages by search query
  filterPackages(query) {
    if (!query) return this._packages;
    const lowerQuery = query.toLowerCase();
    return this._packages.filter(pkg => 
      pkg.name.toLowerCase().includes(lowerQuery) ||
      (pkg.version && pkg.version.toLowerCase().includes(lowerQuery))
    );
  }

  get nlsData() {
    return this._nlsData;
  }

  set nlsData(value) {
    this._nlsData = value || {};
    this.updateTexts();
  }

  get isOpen() {
    return this._isOpen;
  }

  // ============================================================================
  // Theme Management
  // ============================================================================

  updateThemeClass() {
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
    const observer = new MutationObserver(() => {
      this.updateThemeClass();
    });

    observer.observe(document.body, {
      attributes: true,
      attributeFilter: ['class']
    });

    this._themeObserver = observer;
  }

  disconnectedCallback() {
    if (this._themeObserver) {
      this._themeObserver.disconnect();
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
        const link = document.createElement('link');
        link.rel = 'stylesheet';
        link.href = codiconsUri;
        this.shadowRoot.insertBefore(link, this.shadowRoot.firstChild);
      } else {
        // Fallback: 從頁面中找 codicon.css 連結
        const existingLink = document.querySelector('link[href*="codicon.css"]');
        if (existingLink) {
          const link = document.createElement('link');
          link.rel = 'stylesheet';
          link.href = existingLink.href;
          this.shadowRoot.insertBefore(link, this.shadowRoot.firstChild);
        }
      }
    } catch (error) {
      console.error('Failed to load Codicons CSS:', error);
    }
  }

  // ============================================================================
  // Core Rendering
  // ============================================================================

  render() {
    this.shadowRoot.innerHTML = `
      <style>
        :host {
          display: none;
          position: fixed;
          inset: 0;
          z-index: 10000;
          font-family: var(--vscode-font-family);
          font-size: var(--vscode-font-size);
        }

        :host(.open) {
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .overlay {
          position: absolute;
          inset: 0;
          background: rgba(0, 0, 0, 0.5);
        }

        .dialog {
          position: relative;
          background: var(--vscode-editor-background);
          border: 1px solid var(--vscode-panel-border);
          border-radius: 8px;
          box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
          width: 90%;
          max-width: 600px;
          max-height: 80vh;
          display: flex;
          flex-direction: column;
          overflow: hidden;
        }

        .header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 16px 20px;
          border-bottom: 1px solid var(--vscode-panel-border);
          background: var(--vscode-sideBar-background);
        }

        .header h2 {
          margin: 0;
          font-size: 1.1em;
          font-weight: 600;
          display: flex;
          align-items: center;
          gap: 8px;
          color: var(--vscode-foreground);
        }

        .close-btn {
          width: 28px;
          height: 28px;
          border: none;
          background: transparent;
          color: var(--vscode-foreground);
          cursor: pointer;
          border-radius: 4px;
          display: flex;
          align-items: center;
          justify-content: center;
          opacity: 0.7;
        }

        .close-btn:hover {
          background: var(--vscode-toolbar-hoverBackground);
          opacity: 1;
        }

        .content {
          flex: 1;
          overflow: auto;
          padding: 20px;
        }

        /* Install Section */
        .install-section {
          margin-bottom: 24px;
        }

        .install-section h3 {
          margin: 0 0 12px 0;
          font-size: 0.95em;
          font-weight: 600;
          color: var(--vscode-foreground);
        }

        .install-form {
          display: flex;
          gap: 8px;
        }

        .install-input {
          flex: 1;
          padding: 8px 12px;
          border: 1px solid var(--vscode-input-border);
          background: var(--vscode-input-background);
          color: var(--vscode-input-foreground);
          border-radius: 4px;
          font-size: 0.95em;
        }

        .install-input:focus {
          outline: none;
          border-color: var(--vscode-focusBorder);
        }

        .install-input::placeholder {
          color: var(--vscode-input-placeholderForeground);
        }

        .install-btn {
          padding: 8px 16px;
          background: var(--vscode-button-background);
          color: var(--vscode-button-foreground);
          border: none;
          border-radius: 4px;
          font-size: 0.95em;
          cursor: pointer;
          display: flex;
          align-items: center;
          gap: 6px;
          white-space: nowrap;
        }

        .install-btn:hover:not(:disabled) {
          background: var(--vscode-button-hoverBackground);
        }

        .install-btn:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }

        .install-btn.installing {
          pointer-events: none;
        }

        .spinner {
          width: 14px;
          height: 14px;
          border: 2px solid transparent;
          border-top-color: currentColor;
          border-radius: 50%;
          animation: spin 0.8s linear infinite;
        }

        @keyframes spin {
          to { transform: rotate(360deg); }
        }

        /* Packages List */
        .packages-section h3 {
          margin: 0 0 12px 0;
          font-size: 0.95em;
          font-weight: 600;
          color: var(--vscode-foreground);
          display: flex;
          align-items: center;
          gap: 8px;
        }

        .packages-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          margin-bottom: 12px;
          gap: 12px;
        }

        .packages-header h3 {
          margin: 0;
          display: flex;
          align-items: center;
          gap: 8px;
        }

        .packages-header-actions {
          display: flex;
          align-items: center;
          gap: 16px;
        }

        .search-wrapper {
          position: relative;
          flex: 1;
          max-width: 200px;
        }

        .search-input {
          width: 82%;
          padding: 5px 8px 5px 28px;
          border: 1px solid var(--vscode-input-border);
          background: var(--vscode-input-background);
          color: var(--vscode-input-foreground);
          border-radius: 4px;
          font-size: 0.9em;
        }

        .search-input:focus {
          outline: none;
          border-color: var(--vscode-focusBorder);
        }

        .search-input::placeholder {
          color: var(--vscode-input-placeholderForeground);
        }

        .search-icon {
          position: absolute;
          left: 8px;
          top: 50%;
          transform: translateY(-50%);
          color: var(--vscode-input-placeholderForeground);
          font-size: 14px;
          pointer-events: none;
        }

        .clear-search-btn {
          position: absolute;
          right: 4px;
          top: 50%;
          transform: translateY(-50%);
          width: 18px;
          height: 18px;
          border: none;
          background: transparent;
          color: var(--vscode-input-placeholderForeground);
          cursor: pointer;
          border-radius: 3px;
          display: none;
          align-items: center;
          justify-content: center;
          padding: 0;
        }

        .clear-search-btn.visible {
          display: flex;
        }

        .clear-search-btn:hover {
          background: var(--vscode-toolbar-hoverBackground);
          color: var(--vscode-foreground);
        }

        .remove-all-btn {
          padding: 4px 10px;
          border: none;
          background: var(--vscode-button-secondaryBackground);
          color: var(--vscode-button-secondaryForeground);
          border-radius: 4px;
          font-size: 0.85em;
          cursor: pointer;
          display: flex;
          align-items: center;
          gap: 4px;
          white-space: nowrap;
        }

        .remove-all-btn:hover:not(:disabled) {
          background: var(--vscode-inputValidation-errorBackground);
          color: var(--vscode-errorForeground);
        }

        .remove-all-btn:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }

        .package-count {
          font-size: 0.85em;
          font-weight: normal;
          color: var(--vscode-descriptionForeground);
        }

        .packages-list {
          border: 1px solid var(--vscode-panel-border);
          border-radius: 4px;
          max-height: 300px;
          overflow: auto;
        }

        .package-item {
          display: flex;
          align-items: center;
          padding: 10px 12px;
          border-bottom: 1px solid var(--vscode-panel-border);
          gap: 12px;
        }

        .package-item:last-child {
          border-bottom: none;
        }

        .package-item:hover {
          background: var(--vscode-list-hoverBackground);
        }

        .package-icon {
          font-size: 18px;
          opacity: 0.7;
          color: var(--vscode-symbolIcon-packageForeground, #cb7832);
        }

        .package-info {
          flex: 1;
          min-width: 0;
        }

        .package-name {
          font-weight: 500;
          color: var(--vscode-foreground);
          word-break: break-all;
        }

        .package-meta {
          display: flex;
          gap: 12px;
          margin-top: 2px;
          font-size: 0.85em;
          color: var(--vscode-descriptionForeground);
        }

        .package-version {
          color: var(--vscode-symbolIcon-constantForeground, #4fc1ff);
        }

        .package-size {
          opacity: 0.8;
        }

        .package-actions {
          display: flex;
          gap: 6px;
        }

        .uninstall-btn {
          width: 26px;
          height: 26px;
          padding: 0;
          border: none;
          background: transparent;
          color: var(--vscode-errorForeground);
          cursor: pointer;
          border-radius: 4px;
          display: flex;
          align-items: center;
          justify-content: center;
          opacity: 0.7;
        }

        .uninstall-btn:hover {
          background: var(--vscode-inputValidation-errorBackground);
          opacity: 1;
        }

        /* Empty State */
        .empty-state {
          text-align: center;
          padding: 40px 20px;
          color: var(--vscode-descriptionForeground);
        }

        .empty-state i {
          font-size: 36px;
          opacity: 0.4;
          margin-bottom: 12px;
        }

        .empty-state p {
          margin: 0;
          font-size: 0.9em;
        }

        /* Message */
        .message {
          padding: 10px 12px;
          border-radius: 4px;
          margin-bottom: 16px;
          font-size: 0.9em;
          display: none;
        }

        .message.success {
          display: block;
          background: var(--vscode-inputValidation-infoBackground);
          border: 1px solid var(--vscode-inputValidation-infoBorder);
          color: var(--vscode-inputValidation-infoForeground);
        }

        .message.error {
          display: block;
          background: var(--vscode-inputValidation-errorBackground);
          border: 1px solid var(--vscode-inputValidation-errorBorder);
          color: var(--vscode-inputValidation-errorForeground);
        }

        /* Footer */
        .footer {
          padding: 12px 20px;
          border-top: 1px solid var(--vscode-panel-border);
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 8px;
        }

        .footer-hint {
          font-size: 0.8em;
          color: var(--vscode-descriptionForeground);
          opacity: 0.8;
          flex: 1;
          display: flex;
          align-items: center;
          gap: 4px;
        }

        .footer-hint .codicon {
          font-size: 12px;
        }

        .footer-actions {
          display: flex;
          gap: 8px;
        }

        .footer-btn {
          padding: 6px 16px;
          border: 1px solid var(--vscode-button-border, transparent);
          border-radius: 4px;
          font-size: 0.9em;
          cursor: pointer;
        }

        .footer-btn.primary {
          background: var(--vscode-button-background);
          color: var(--vscode-button-foreground);
        }

        .footer-btn.primary:hover {
          background: var(--vscode-button-hoverBackground);
        }

        .footer-btn.secondary {
          background: var(--vscode-button-secondaryBackground);
          color: var(--vscode-button-secondaryForeground);
        }

        .footer-btn.secondary:hover {
          background: var(--vscode-button-secondaryHoverBackground);
        }
      </style>

      <div class="overlay" id="overlay"></div>
      <div class="dialog">
        <div class="header">
          <h2>
            <i class="codicon codicon-package"></i>
            <span data-nls="packageManager">套件管理</span>
          </h2>
          <button class="close-btn" id="close-btn" title="Close">
            <i class="codicon codicon-close"></i>
          </button>
        </div>
        <div class="content">
          <div class="message" id="message"></div>
          
          <div class="install-section">
            <h3 data-nls="installPackage">安裝套件</h3>
            <div class="install-form">
              <input 
                type="text" 
                class="install-input" 
                id="package-input" 
                placeholder="playwright、playwright@latest、playwright@1.57.0"
                data-nls-placeholder="packageInputPlaceholder"
              />
              <button class="install-btn" id="install-btn">
                <i class="codicon codicon-cloud-download"></i>
                <span data-nls="install">安裝</span>
              </button>
            </div>
          </div>

          <div class="packages-section">
            <div class="packages-header">
              <h3>
                <span data-nls="installedPackages">已安裝套件</span>
                <span class="package-count" id="package-count">(0)</span>
              </h3>
              <div class="packages-header-actions">
                <div class="search-wrapper">
                  <i class="codicon codicon-search search-icon"></i>
                  <input 
                    type="text" 
                    class="search-input" 
                    id="search-input" 
                    placeholder="搜尋套件..."
                    data-nls-placeholder="searchPackagesPlaceholder"
                  />
                  <button class="clear-search-btn" id="clear-search-btn" title="Clear">
                    <i class="codicon codicon-close"></i>
                  </button>
                </div>
                <button class="remove-all-btn" id="remove-all-btn" title="移除全部" data-nls-title="removeAllPackages">
                  <i class="codicon codicon-trash"></i>
                  <span data-nls="removeAll">移除全部</span>
                </button>
              </div>
            </div>
            <div class="packages-list" id="packages-list">
              <div class="empty-state">
                <div><i class="codicon codicon-package"></i></div>
                <p data-nls="noPackagesInstalled">尚未安裝任何套件</p>
              </div>
            </div>
          </div>
        </div>
        <div class="footer">
          <div class="footer-hint">
            <i class="codicon codicon-info"></i>
            <span data-nls="packageStorageHint">套件安裝於擴充儲存空間，僅供腳本使用</span>
          </div>
          <div class="footer-actions">
            <button class="footer-btn secondary" id="refresh-btn">
              <span data-nls="refresh">重新整理</span>
            </button>
            <button class="footer-btn primary" id="done-btn">
              <span data-nls="close">關閉</span>
            </button>
          </div>
        </div>
      </div>
    `;
  }

  // ============================================================================
  // Event Handling
  // ============================================================================

  setupEventListeners() {
    // Close button
    this.shadowRoot.getElementById('close-btn').addEventListener('click', () => {
      this.close();
    });

    // Overlay click
    this.shadowRoot.getElementById('overlay').addEventListener('click', () => {
      this.close();
    });

    // Done button
    this.shadowRoot.getElementById('done-btn').addEventListener('click', () => {
      this.close();
    });

    // Refresh button
    this.shadowRoot.getElementById('refresh-btn').addEventListener('click', () => {
      this.dispatchEvent(new CustomEvent('packages-refresh-requested', {
        bubbles: true
      }));
    });

    // Search input
    this.shadowRoot.getElementById('search-input').addEventListener('input', (e) => {
      this._searchQuery = e.target.value.trim();
      this._filteredPackages = this.filterPackages(this._searchQuery);
      this.renderPackagesList();
      
      // Toggle clear button visibility
      const clearBtn = this.shadowRoot.getElementById('clear-search-btn');
      if (this._searchQuery) {
        clearBtn.classList.add('visible');
      } else {
        clearBtn.classList.remove('visible');
      }
    });

    // Clear search button
    this.shadowRoot.getElementById('clear-search-btn').addEventListener('click', () => {
      const searchInput = this.shadowRoot.getElementById('search-input');
      searchInput.value = '';
      this._searchQuery = '';
      this._filteredPackages = this.filterPackages('');
      this.renderPackagesList();
      this.shadowRoot.getElementById('clear-search-btn').classList.remove('visible');
      searchInput.focus();
    });

    // Remove all button
    this.shadowRoot.getElementById('remove-all-btn').addEventListener('click', async () => {
      if (!this._packages.length) return;
      
      const confirmed = await window.ConfirmationSystem?.showChoiceDialog(
        this.getNlsText('removeAllConfirm', '確認移除全部套件'),
        this.getNlsText('removeAllMessage', '確定要移除全部 {count} 個套件嗎？此操作無法復原。').replace('{count}', this._packages.length),
        [this.getNlsText('removeAll', '移除全部'), this.getNlsText('cancel', '取消')]
      );

      if (confirmed === this.getNlsText('removeAll', '移除全部')) {
        this.dispatchEvent(new CustomEvent('packages-remove-all-requested', {
          bubbles: true,
          detail: { packages: this._packages.map(p => p.name) }
        }));
      }
    });

    // Install button
    this.shadowRoot.getElementById('install-btn').addEventListener('click', () => {
      this.handleInstall();
    });

    // Enter key in input
    this.shadowRoot.getElementById('package-input').addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        this.handleInstall();
      }
    });

    // Uninstall button delegation
    this.shadowRoot.getElementById('packages-list').addEventListener('click', async (e) => {
      const btn = e.target.closest('.uninstall-btn');
      if (btn) {
        const name = btn.dataset.name;
        if (name) {
          // Confirm uninstall
          const confirmed = await window.ConfirmationSystem?.showChoiceDialog(
            this.getNlsText('uninstallConfirm', '確認移除套件'),
            this.getNlsText('uninstallMessage', `確定要移除套件「${name}」嗎？`).replace('{name}', name),
            [this.getNlsText('uninstall', '移除'), this.getNlsText('cancel', '取消')]
          );

          if (confirmed === this.getNlsText('uninstall', '移除')) {
            this.dispatchEvent(new CustomEvent('package-uninstall-requested', {
              bubbles: true,
              detail: { name }
            }));
          }
        }
      }
    });

    // ESC key to close
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this._isOpen) {
        this.close();
      }
    });
  }

  handleInstall() {
    if (this._isInstalling) return;

    const input = this.shadowRoot.getElementById('package-input');
    const rawValue = input.value.trim();
    
    if (!rawValue) {
      this.showMessage('error', this.getNlsText('packageNameRequired', '請輸入套件名稱'));
      return;
    }

    // Parse package name and version
    let name = rawValue;
    let version = undefined;

    // Handle scoped packages (@org/name@version)
    if (rawValue.startsWith('@')) {
      const parts = rawValue.split('@');
      if (parts.length >= 3) {
        name = `@${parts[1]}`;
        version = parts[2];
      } else {
        name = rawValue;
      }
    } else if (rawValue.includes('@')) {
      const parts = rawValue.split('@');
      name = parts[0];
      version = parts[1];
    }

    this.setInstalling(true);
    this.hideMessage();

    this.dispatchEvent(new CustomEvent('package-install-requested', {
      bubbles: true,
      detail: { name, version }
    }));
  }

  // ============================================================================
  // UI Methods
  // ============================================================================

  open() {
    this._isOpen = true;
    this.classList.add('open');
    this.shadowRoot.getElementById('package-input').focus();
    
    // Request packages list
    this.dispatchEvent(new CustomEvent('packages-refresh-requested', {
      bubbles: true
    }));
  }

  close() {
    this._isOpen = false;
    this.classList.remove('open');
    this.hideMessage();
    this.shadowRoot.getElementById('package-input').value = '';
    
    this.dispatchEvent(new CustomEvent('package-manager-closed', {
      bubbles: true
    }));
  }

  setInstalling(installing) {
    this._isInstalling = installing;
    const btn = this.shadowRoot.getElementById('install-btn');
    const input = this.shadowRoot.getElementById('package-input');
    
    if (installing) {
      btn.classList.add('installing');
      btn.disabled = true;
      btn.innerHTML = `<span class="spinner"></span><span>${this.getNlsText('installing', '安裝中...')}</span>`;
      input.disabled = true;
    } else {
      btn.classList.remove('installing');
      btn.disabled = false;
      btn.innerHTML = `<i class="codicon codicon-cloud-download"></i><span data-nls="install">${this.getNlsText('install', '安裝')}</span>`;
      input.disabled = false;
      input.value = '';
      input.focus();
    }
  }

  setRemoving(packageName) {
    // 目前僅用於狀態追蹤，後續可擴展為顯示移除中狀態
    this._removingPackage = packageName;
  }

  showMessage(type, text) {
    const msg = this.shadowRoot.getElementById('message');
    msg.className = `message ${type}`;
    msg.textContent = text;
  }

  hideMessage() {
    const msg = this.shadowRoot.getElementById('message');
    msg.className = 'message';
    msg.textContent = '';
  }

  handleInstallResult(result) {
    this.setInstalling(false);
    
    if (result.success) {
      this.showMessage('success', 
        this.getNlsText('packageInstalled', '套件 {name} 安裝成功！')
          .replace('{name}', result.name + (result.version ? `@${result.version}` : ''))
      );
      // Refresh list
      this.dispatchEvent(new CustomEvent('packages-refresh-requested', {
        bubbles: true
      }));
    } else {
      this.showMessage('error', 
        this.getNlsText('packageInstallFailed', '安裝失敗：{error}')
          .replace('{error}', result.error || 'Unknown error')
      );
    }
  }

  renderPackagesList() {
    const list = this.shadowRoot.getElementById('packages-list');
    const count = this.shadowRoot.getElementById('package-count');
    const removeAllBtn = this.shadowRoot.getElementById('remove-all-btn');
    
    // Update count (total packages)
    count.textContent = `(${this._packages.length})`;
    
    // Enable/disable remove all button
    if (removeAllBtn) {
      removeAllBtn.disabled = !this._packages.length;
    }

    // Use filtered packages for display
    const displayPackages = this._filteredPackages.length > 0 || this._searchQuery ? this._filteredPackages : this._packages;

    if (!this._packages.length) {
      list.innerHTML = `
        <div class="empty-state">
          <div><i class="codicon codicon-package"></i></div>
          <p data-nls="noPackagesInstalled">${this.getNlsText('noPackagesInstalled', '尚未安裝任何套件')}</p>
        </div>
      `;
      return;
    }

    if (!displayPackages.length && this._searchQuery) {
      list.innerHTML = `
        <div class="empty-state">
          <div><i class="codicon codicon-search"></i></div>
          <p>${this.getNlsText('noSearchResults', '找不到符合的套件')}</p>
        </div>
      `;
      return;
    }

    list.innerHTML = displayPackages.map(pkg => `
      <div class="package-item">
        <i class="codicon codicon-package package-icon"></i>
        <div class="package-info">
          <div class="package-name">${this.escapeHtml(pkg.name)}</div>
          <div class="package-meta">
            <span class="package-version">v${this.escapeHtml(pkg.version || 'unknown')}</span>
            <span class="package-size">${this.formatBytes(pkg.size || 0)}</span>
          </div>
        </div>
        <div class="package-actions">
          <button 
            class="uninstall-btn" 
            data-name="${this.escapeHtml(pkg.name)}"
            title="${this.getNlsText('uninstall', '移除')}"
          >
            <i class="codicon codicon-trash"></i>
          </button>
        </div>
      </div>
    `).join('');
  }

  // ============================================================================
  // Utility Methods
  // ============================================================================

  getNlsText(key, defaultValue) {
    return this._nlsData[key] || defaultValue || key;
  }

  escapeHtml(str = '') {
    return String(str).replace(/[&<>"']/g, (match) => {
      const escapes = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
      return escapes[match];
    });
  }

  formatBytes(n) {
    if (!Number.isFinite(n) || n === 0) return '0 B';
    const units = ['B', 'KB', 'MB', 'GB'];
    let i = 0;
    while (n >= 1024 && i < units.length - 1) {
      n /= 1024;
      i++;
    }
    return `${Math.round(n * 10) / 10} ${units[i]}`;
  }

  updateTexts() {
    this.shadowRoot.querySelectorAll('[data-nls]').forEach(el => {
      const key = el.getAttribute('data-nls');
      const text = this.getNlsText(key, el.textContent);
      el.textContent = text;
    });

    this.shadowRoot.querySelectorAll('[data-nls-placeholder]').forEach(el => {
      const key = el.getAttribute('data-nls-placeholder');
      const text = this.getNlsText(key, el.placeholder);
      el.placeholder = text;
    });

    // Re-render list
    this.renderPackagesList();
  }
}

// Register the custom element
customElements.define('package-manager', PackageManager);
