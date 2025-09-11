/**
 * Confirmation Dialog Web Component
 * 將原有的 confirmation.js 重構為 Web Components 架構
 */

class ConfirmationDialog extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this.isVisible = false;
    this.currentResolve = null;
  }

  static get observedAttributes() {
    return ['visible', 'title', 'message', 'type'];
  }

  // 多語系支援
  getText(key, defaultValue) {
    if (window.I18nHelper && window.I18nHelper.getNlsText) {
      return window.I18nHelper.getNlsText(key, defaultValue);
    }
    return defaultValue || key;
  }

  connectedCallback() {
    this.render();
    this.setupEventListeners();
  }

  attributeChangedCallback(name, oldValue, newValue) {
    if (oldValue !== newValue) {
      this.render();
    }
  }

  render() {
    const title = this.getAttribute('title') || 'Confirm';
    const message = this.getAttribute('message') || '';
    const type = this.getAttribute('type') || 'confirm'; // confirm, choice, toast
    const visible = this.hasAttribute('visible');

    this.shadowRoot.innerHTML = `
      <style>
        /* 使用簡單的圖示符號，避免字體依賴 */
        :host {
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          z-index: 10000;
          display: ${visible ? 'flex' : 'none'};
          align-items: center;
          justify-content: center;
          background: rgba(0, 0, 0, 0.4);
          font-family: var(--vscode-font-family);
          font-size: var(--vscode-font-size);
        }

        .dialog {
          background: var(--vscode-quickInput-background, var(--vscode-editor-background));
          border: 1px solid var(--vscode-quickInput-border, var(--vscode-panel-border));
          border-radius: 4px;
          min-width: 300px;
          max-width: 500px;
          max-height: 80vh;
          overflow: auto;
          box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
        }

        .header {
          padding: 16px 20px 0;
          font-weight: 600;
          color: var(--vscode-foreground);
          border-bottom: none;
        }

        .content {
          padding: 12px 20px 20px;
          color: var(--vscode-foreground);
          line-height: 1.4;
          white-space: pre-wrap;
        }

        .buttons {
          padding: 0 20px 16px;
          display: flex;
          gap: 8px;
          justify-content: flex-end;
        }

        .button {
          padding: 6px 16px;
          border: 1px solid var(--vscode-button-border, transparent);
          border-radius: 2px;
          cursor: pointer;
          font-size: 13px;
          font-family: var(--vscode-font-family);
          font-weight: 400;
          background: var(--vscode-button-secondaryBackground);
          color: var(--vscode-button-secondaryForeground);
          transition: all 0.15s ease;
          outline: none;
          min-width: 60px;
          text-align: center;
        }

        .button:hover {
          background: var(--vscode-button-secondaryHoverBackground);
        }

        .button:focus {
          outline: 1px solid var(--vscode-focusBorder);
          outline-offset: 2px;
        }

        .button.primary {
          background: var(--vscode-button-background);
          color: var(--vscode-button-foreground);
          border-color: var(--vscode-button-border, transparent);
        }

        .button.primary:hover {
          background: var(--vscode-button-hoverBackground);
        }

        .button.danger {
          /* 使用更合適的紅色背景，確保在各種主題下都清晰 */
          background: #d73a49; /* GitHub 風格的紅色，深淺主題通用 */
          color: #ffffff !important; /* 白色文字 */
          border: 1px solid #cb2431;
        }

        .button.danger:hover {
          background: #cb2431; /* 稍微暗一點的紅色 */
          color: #ffffff !important;
          border-color: #a0171f;
        }

        .button.danger:focus {
          outline: 2px solid #d73a49;
          outline-offset: 2px;
        }

        .button.destructive:focus {
          outline: 2px solid #dc3545;
          outline-offset: 2px;
        }

        .button.destructive {
          /* 對於破壞性操作，使用更強烈的紅色 */
          background: #dc3545; /* Bootstrap 風格的危險紅色 */
          color: #ffffff !important;
          border: 2px solid #c82333; /* 稍微加粗邊框表示破壞性 */
        }

        .button.destructive:hover {
          background: #c82333; /* 更深的紅色 */
          color: #ffffff !important;
          border-color: #a71e2a;
        }

        /* 當按鈕是危險操作時，在深色主題下使用紅色邊框 */
        [data-vscode-theme-kind="vscode-dark"] .button.danger {
          border-color: #f14c4c;
        }

        [data-vscode-theme-kind="vscode-dark"] .button.danger:hover {
          border-color: #ff6666;
          background: var(--vscode-button-hoverBackground);
        }

        /* 在淺色主題下使用深色紅色邊框 */
        [data-vscode-theme-kind="vscode-light"] .button.danger {
          border-color: #d73a49;
        }

        [data-vscode-theme-kind="vscode-light"] .button.danger:hover {
          border-color: #cb2431;
          background: var(--vscode-button-hoverBackground);
        }

        /* Toast 樣式 */
        .toast {
          position: fixed;
          top: 20px;
          right: 20px;
          background: var(--vscode-notifications-background);
          border: 1px solid var(--vscode-notifications-border);
          border-radius: 4px;
          padding: 12px 16px;
          max-width: 400px;
          box-shadow: 0 2px 8px rgba(0, 0, 0, 0.2);
          display: flex;
          align-items: center;
          gap: 8px;
          z-index: 10001;
        }

        .toast.success {
          border-left: 4px solid var(--vscode-testing-iconPassed, #73c991);
        }

        .toast.error {
          border-left: 4px solid var(--vscode-testing-iconFailed, #f14c4c);
        }

        .toast.warning {
          border-left: 4px solid var(--vscode-testing-iconSkipped, #cca700);
        }

        .toast.info {
          border-left: 4px solid var(--vscode-testing-iconQueued, #007acc);
        }

        .toast-icon {
          margin-right: 8px;
          font-size: 16px;
          font-weight: bold;
          display: inline-block;
        }

        .toast-message {
          color: var(--vscode-notifications-foreground);
          flex: 1;
        }

        @keyframes slideIn {
          from { transform: translateX(100%); opacity: 0; }
          to { transform: translateX(0); opacity: 1; }
        }

        @keyframes slideOut {
          from { transform: translateX(0); opacity: 1; }
          to { transform: translateX(100%); opacity: 0; }
        }

        .toast {
          animation: slideIn 0.3s ease-out;
        }

        .toast.hiding {
          animation: slideOut 0.3s ease-out;
        }
      </style>

      ${type === 'toast' ? this.renderToast() : this.renderDialog(title, message, type)}
    `;

    if (visible && type !== 'toast') {
      // 聚焦到第一個按鈕
      setTimeout(() => {
        const firstButton = this.shadowRoot.querySelector('.button');
        if (firstButton) {
          firstButton.focus();
        }
      }, 100);
    }
  }

  renderDialog(title, message, type) {
    return `
      <div class="dialog">
        <div class="header">${this.escapeHtml(title)}</div>
        <div class="content">${this.escapeHtml(message)}</div>
        <div class="buttons" id="buttons">
          ${this.renderButtons(type)}
        </div>
      </div>
    `;
  }

  renderToast() {
    const type = this.getAttribute('toast-type') || 'info';
    const ICON = { success:'✓', error:'✕', warning:'⚠', info:'ℹ' };
    const icon = ICON[type] || ICON.success;
    let message = this.getAttribute('message') || '';
    
    // 多語系翻譯：優先使用 message-key，如果沒有則直接使用 message
    const messageKey = this.getAttribute('message-key');
    if (messageKey && window.I18nHelper && window.I18nHelper.getNlsText) {
      message = window.I18nHelper.getNlsText(messageKey, message);
    }

    return `
      <div class="toast ${type}">
        <span class="toast-icon" aria-hidden="true">${icon}</span>
        <span class="toast-message">${this.escapeHtml(message)}</span>
      </div>
    `;
  }

  renderButtons(type) {
    const choices = this.choices || [];
    
    if (type === 'choice' && choices.length > 0) {
      return choices.map((choice, index) => {
        const isPrimary = index === 0;
        const choiceLower = choice.toLowerCase();
        const isDanger = choiceLower.includes('delete') || 
                        choiceLower.includes('remove') ||
                        choiceLower.includes('刪除') ||
                        choiceLower.includes('移除') ||
                        choiceLower.includes('清除') ||
                        choiceLower.includes('删除') ||
                        choice.includes('刪除') ||
                        choice.includes('移除') ||
                        choice.includes('清除');
        
        let buttonClass = 'button';
        if (isPrimary && !isDanger) {
          buttonClass += ' primary';
        }
        if (isDanger) {
          buttonClass += ' danger';
        }
        
        return `<button class="${buttonClass}" data-choice="${choice}">${this.escapeHtml(choice)}</button>`;
      }).join('');
    }
    
    // 預設確認對話框
    return `
      <button class="button" data-choice="Cancel">Cancel</button>
      <button class="button primary" data-choice="OK">OK</button>
    `;
  }

  setupEventListeners() {
    // 點擊遮罩關閉
    this.addEventListener('click', (e) => {
      if (e.target === this) {
        this.close('Cancel');
      }
    });

    // 按鈕點擊事件
    this.shadowRoot.addEventListener('click', (e) => {
      const button = e.target.closest('.button');
      if (button) {
        const choice = button.dataset.choice;
        this.close(choice);
      }
    });

    // ESC 鍵關閉
    this.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        this.close('Cancel');
      }
    });
  }

  escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  // 公開 API 方法
  show() {
    this.setAttribute('visible', '');
    this.isVisible = true;
    return new Promise((resolve) => {
      this.currentResolve = resolve;
    });
  }

  close(result = 'Cancel') {
    this.removeAttribute('visible');
    this.isVisible = false;
    
    if (this.currentResolve) {
      this.currentResolve(result);
      this.currentResolve = null;
    }

    // 發送自訂事件
    this.dispatchEvent(new CustomEvent('dialog-closed', {
      detail: { result },
      bubbles: true
    }));
  }

  // Toast 自動關閉
  showToast(type, message, duration = 3000) {
    this.setAttribute('type', 'toast');
    this.setAttribute('toast-type', type);
    this.setAttribute('message', message);
    this.setAttribute('visible', '');
    
    setTimeout(() => {
      const toast = this.shadowRoot.querySelector('.toast');
      if (toast) {
        toast.classList.add('hiding');
        setTimeout(() => {
          this.removeAttribute('visible');
        }, 300);
      }
    }, duration);
  }

  // 設定選項（用於 choice dialog）
  setChoices(choices) {
    this.choices = choices;
    if (this.isVisible) {
      this.render();
    }
  }
}

// 註冊 Web Component
customElements.define('confirmation-dialog', ConfirmationDialog);

/**
 * 全域 API 封裝 - 保持向後相容性
 */
class ConfirmationSystem {
  constructor() {
    this.dialog = null;
    this.ensureDialog();
  }

  ensureDialog() {
    if (!this.dialog) {
      this.dialog = document.createElement('confirmation-dialog');
      document.body.appendChild(this.dialog);
    }
    return this.dialog;
  }

  async showChoiceDialog(title, message, choices = ['OK', 'Cancel']) {
    const dialog = this.ensureDialog();
    dialog.setAttribute('title', title);
    dialog.setAttribute('message', message);
    dialog.setAttribute('type', 'choice');
    dialog.setChoices(choices);
    
    return await dialog.show();
  }

  async confirm(message, title = 'Confirm') {
    const result = await this.showChoiceDialog(title, message, ['OK', 'Cancel']);
    return result === 'OK';
  }

  async confirmDelete(itemName, title = 'Delete Confirmation') {
    const message = `Are you sure you want to delete "${itemName}"?`;
    const result = await this.showChoiceDialog(title, message, ['Delete', 'Cancel']);
    return result === 'Delete';
  }

  showToast(type, message, duration = 3000) {
    const dialog = this.ensureDialog();
    dialog.showToast(type, message, duration);
  }

  // 便捷方法
  showSuccess(message, duration = 3000) {
    this.showToast('success', message, duration);
  }

  showError(message, duration = 3000) {
    this.showToast('error', message, duration);
  }

  showWarning(message, duration = 3000) {
    this.showToast('warning', message, duration);
  }

  showInfo(message, duration = 3000) {
    this.showToast('info', message, duration);
  }
}

// 建立全域實例
window.ConfirmationSystem = new ConfirmationSystem();

// 向後相容性 - 全域函式
window.showChoiceDialog = (title, message, choices) => 
  window.ConfirmationSystem.showChoiceDialog(title, message, choices);

window.showToast = (type, message, duration) => 
  window.ConfirmationSystem.showToast(type, message, duration);

// 確保 I18nHelper 整合（如果可用）
if (window.I18nHelper) {
  // 使用 I18nHelper 本地化按鈕文字
  const originalShowChoiceDialog = window.ConfirmationSystem.showChoiceDialog.bind(window.ConfirmationSystem);
  
  window.ConfirmationSystem.showChoiceDialog = async function(title, message, choices) {
    // 本地化常見按鈕文字
    const localizedChoices = choices.map(choice => {
      const lowerChoice = choice.toLowerCase();
      if (lowerChoice === 'ok') {
        return window.I18nHelper.getNlsText('ok', 'OK');
      }
      if (lowerChoice === 'cancel') {
        return window.I18nHelper.getNlsText('cancel', 'Cancel');
      }
      if (lowerChoice === 'delete') {
        return window.I18nHelper.getNlsText('delete', 'Delete');
      }
      if (lowerChoice === 'save') {
        return window.I18nHelper.getNlsText('save', 'Save');
      }
      return choice;
    });
    
    return originalShowChoiceDialog(title, message, localizedChoices);
  };
}

