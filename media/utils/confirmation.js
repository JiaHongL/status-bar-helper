/**
 * Confirmation System Module - 確認對話框系統模組
 * 
 * 提供統一的確認對話框和 Toast 訊息功能，支援多國語系。
 * 依賴 I18nHelper 模組提供多國語系支援。
 * 
 * @version 1.0.0
 * @since Phase 3: 確認對話框系統模組化
 */

(function() {
    'use strict';

    /**
     * Confirmation System 類別
     * 管理確認對話框和 Toast 訊息功能
     */
    class ConfirmationSystem {
        constructor() {
            // 綁定方法，確保 this 正確
            this.showChoiceDialog = this.showChoiceDialog.bind(this);
            this.showToast = this.showToast.bind(this);
            this._initDialog = this._initDialog.bind(this);
            this._createToast = this._createToast.bind(this);
            
            // 內部狀態
            this._dialogInitialized = false;
            this._toastElement = null;
            
            // 確保 DOM 載入完成後初始化
            if (document.readyState === 'loading') {
                document.addEventListener('DOMContentLoaded', () => {
                    this._initDialog();
                });
            } else {
                this._initDialog();
            }
        }

        /**
         * 初始化對話框 DOM 結構（如果尚未存在）
         * @private
         */
        _initDialog() {
            const overlay = document.getElementById('confirm-dialog-overlay');
            if (!overlay) {
                // 創建對話框 HTML 結構
                const dialogHTML = `
                    <div id="confirm-dialog-overlay" class="hidden">
                        <div id="confirm-dialog">
                            <h3 id="confirm-title"></h3>
                            <p id="confirm-message"></p>
                            <div class="confirm-buttons"></div>
                        </div>
                    </div>
                `;
                document.body.insertAdjacentHTML('beforeend', dialogHTML);
            }
            this._dialogInitialized = true;
        }

        /**
         * 取得本地化文字（with I18nHelper 整合）
         * @private
         * @param {string} key - NLS 鍵值
         * @param {string} fallback - 預設文字
         * @returns {string} 本地化文字
         */
        _getNlsText(key, fallback) {
            // 優先使用 I18nHelper
            if (window.I18nHelper && typeof window.I18nHelper.getNlsText === 'function') {
                return window.I18nHelper.getNlsText(key, fallback);
            }
            
            // Fallback 到全域 getNlsText（保持向後相容）
            if (typeof window.getNlsText === 'function') {
                return window.getNlsText(key, fallback);
            }
            
            // 最終 fallback
            return fallback || key;
        }

        /**
         * 顯示選擇對話框
         * @param {string} title - 對話框標題
         * @param {string} message - 對話框訊息
         * @param {string[]} [buttons=['OK']] - 按鈕文字陣列
         * @returns {Promise<string>} 使用者點擊的按鈕文字
         */
        showChoiceDialog(title, message, buttons = ['OK']) {
            // 確保對話框已初始化
            if (!this._dialogInitialized) {
                this._initDialog();
            }

            const overlay = document.getElementById('confirm-dialog-overlay');
            const titleEl = document.getElementById('confirm-title');
            const messageEl = document.getElementById('confirm-message');
            const buttonsEl = document.querySelector('.confirm-buttons');

            if (!overlay || !titleEl || !messageEl || !buttonsEl) {
                console.error('確認對話框 DOM 元素未找到');
                return Promise.resolve(buttons[0] || 'OK');
            }

            titleEl.textContent = title;
            messageEl.textContent = message;
            buttonsEl.innerHTML = ''; // 清除現有按鈕

            overlay.style.zIndex = '3001'; // 高於 modal
            overlay.classList.remove('hidden');

            return new Promise((resolve) => {
                const listeners = [];
                
                buttons.forEach((btnText, idx) => {
                    const btn = document.createElement('button');
                    btn.textContent = btnText;
                    
                    // 為取消和放棄按鈕添加 secondary 樣式
                    const cancelText = this._getNlsText('cancel', 'Cancel');
                    const discardText = this._getNlsText('discard', 'Discard');
                    if (btnText === cancelText || btnText === discardText) {
                        btn.classList.add('secondary');
                    }
                    
                    const listener = () => {
                        overlay.classList.add('hidden');
                        overlay.style.zIndex = '';
                        cleanup();
                        resolve(btnText);
                    };
                    
                    btn.addEventListener('click', listener);
                    buttonsEl.appendChild(btn);
                    listeners.push({ btn, listener });
                });
                
                const cleanup = () => {
                    listeners.forEach(({ btn, listener }) => {
                        btn.removeEventListener('click', listener);
                    });
                };
            });
        }

        /**
         * 創建 Toast 元素（如果尚未存在）
         * @private
         */
        _createToast() {
            if (this._toastElement) {
                return this._toastElement;
            }

            let toast = document.getElementById('sb-toast');
            if (!toast) {
                toast = document.createElement('div');
                toast.id = 'sb-toast';
                toast.style.position = 'fixed';
                toast.style.bottom = '32px';
                toast.style.left = '50%';
                toast.style.transform = 'translateX(-50%)';
                toast.style.zIndex = '9999';
                toast.style.padding = '10px 24px';
                toast.style.borderRadius = '6px';
                toast.style.fontSize = '15px';
                toast.style.color = '#fff';
                toast.style.boxShadow = '0 2px 8px rgba(0,0,0,0.15)';
                toast.style.opacity = '0';
                toast.style.transition = 'opacity 0.3s ease';
                document.body.appendChild(toast);
            }
            
            this._toastElement = toast;
            return toast;
        }

        /**
         * 顯示 Toast 訊息
         * @param {string} msg - 訊息內容
         * @param {string} [type='info'] - 訊息類型：'success', 'error', 'info'
         * @param {number} [duration=2000] - 顯示時間（毫秒）
         */
        showToast(msg, type = 'info', duration = 2000) {
            const toast = this._createToast();
            
            // 設定背景顏色
            const colorMap = {
                'success': '#4caf50',
                'error': '#e53935',
                'warning': '#ff9800',
                'info': '#2196f3'
            };
            
            toast.style.background = colorMap[type] || colorMap.info;
            toast.textContent = msg;
            toast.style.opacity = '1';
            
            // 自動隱藏
            setTimeout(() => {
                if (toast.style.opacity === '1') {
                    toast.style.opacity = '0';
                }
            }, duration);
        }

        /**
         * 顯示成功 Toast 訊息
         * @param {string} msg - 訊息內容
         * @param {number} [duration=2000] - 顯示時間
         */
        showSuccessToast(msg, duration = 2000) {
            this.showToast(msg, 'success', duration);
        }

        /**
         * 顯示錯誤 Toast 訊息
         * @param {string} msg - 訊息內容
         * @param {number} [duration=3000] - 顯示時間（錯誤訊息顯示較久）
         */
        showErrorToast(msg, duration = 3000) {
            this.showToast(msg, 'error', duration);
        }

        /**
         * 顯示警告 Toast 訊息
         * @param {string} msg - 訊息內容
         * @param {number} [duration=2500] - 顯示時間
         */
        showWarningToast(msg, duration = 2500) {
            this.showToast(msg, 'warning', duration);
        }

        /**
         * 顯示確認刪除對話框（常用快捷方法）
         * @param {string} itemName - 要刪除的項目名稱
         * @returns {Promise<boolean>} 是否確認刪除
         */
        async confirmDelete(itemName) {
            const title = this._getNlsText('confirmDelete', 'Confirm Delete');
            const message = this._getNlsText('deleteMessage', `Are you sure you want to delete "${itemName}"?`).replace('{0}', itemName);
            const deleteBtn = this._getNlsText('delete', 'Delete');
            const cancelBtn = this._getNlsText('cancel', 'Cancel');
            
            const choice = await this.showChoiceDialog(title, message, [deleteBtn, cancelBtn]);
            return choice === deleteBtn;
        }

        /**
         * 顯示確認操作對話框（常用快捷方法）
         * @param {string} title - 標題
         * @param {string} message - 訊息
         * @param {string} [confirmText='OK'] - 確認按鈕文字
         * @param {string} [cancelText='Cancel'] - 取消按鈕文字
         * @returns {Promise<boolean>} 是否確認
         */
        async confirm(title, message, confirmText, cancelText) {
            const okBtn = confirmText || this._getNlsText('ok', 'OK');
            const cancelBtn = cancelText || this._getNlsText('cancel', 'Cancel');
            
            const choice = await this.showChoiceDialog(title, message, [okBtn, cancelBtn]);
            return choice === okBtn;
        }

        /**
         * 取得版本資訊
         * @returns {string} 版本號
         */
        getVersion() {
            return '1.0.0';
        }

        /**
         * 檢查依賴狀態
         * @returns {Object} 依賴狀態資訊
         */
        getDependencyStatus() {
            return {
                i18nHelper: !!(window.I18nHelper && typeof window.I18nHelper.getNlsText === 'function'),
                fallbackGetNlsText: typeof window.getNlsText === 'function',
                dialogInitialized: this._dialogInitialized,
                toastAvailable: !!this._toastElement || !!document.getElementById('sb-toast')
            };
        }
    }

    // 建立全域實例
    const confirmationSystem = new ConfirmationSystem();

    // 建立全域 API
    window.ConfirmationSystem = {
        // 核心對話框方法
        showChoiceDialog: confirmationSystem.showChoiceDialog,
        
        // Toast 訊息方法
        showToast: confirmationSystem.showToast,
        showSuccessToast: confirmationSystem.showSuccessToast,
        showErrorToast: confirmationSystem.showErrorToast,
        showWarningToast: confirmationSystem.showWarningToast,
        
        // 快捷方法
        confirmDelete: confirmationSystem.confirmDelete,
        confirm: confirmationSystem.confirm,
        
        // 工具方法
        getVersion: confirmationSystem.getVersion,
        getDependencyStatus: confirmationSystem.getDependencyStatus,
        
        // 內部實例（供除錯用）
        _instance: confirmationSystem
    };

    // 向後相容：提供 showChoiceDialog 和 showToast 全域函式
    // 這樣既有程式碼可以繼續使用，新程式碼建議使用 ConfirmationSystem.*
    
    // 使用 Object.defineProperty 確保全域函式正確設定
    if (typeof window.showChoiceDialog === 'undefined') {
        window.showChoiceDialog = confirmationSystem.showChoiceDialog;
    }
    
    if (typeof window.showToast === 'undefined') {
        window.showToast = confirmationSystem.showToast;
    }
    
    // 額外的安全檢查：如果函式仍然未定義，強制設定
    setTimeout(() => {
        if (typeof window.showChoiceDialog === 'undefined') {
            console.warn('⚠️ showChoiceDialog not found, setting up fallback');
            window.showChoiceDialog = confirmationSystem.showChoiceDialog;
        }
        if (typeof window.showToast === 'undefined') {
            console.warn('⚠️ showToast not found, setting up fallback');
            window.showToast = confirmationSystem.showToast;
        }
    }, 100);

    // 模組載入完成提示
    console.log('✅ Confirmation System Module loaded successfully (v1.0.0)');
    console.log('🔧 Global functions available:', {
        showChoiceDialog: typeof window.showChoiceDialog,
        showToast: typeof window.showToast,
        ConfirmationSystem: typeof window.ConfirmationSystem
    });

})();
