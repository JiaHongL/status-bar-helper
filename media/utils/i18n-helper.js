/**
 * I18n Helper Module - 多國語系輔助模組
 * 
 * 提供統一的國際化功能，包括文字取得、格式化、語言切換等核心功能。
 * 作為基礎工具模組，供其他所有模組使用。
 * 
 * @version 1.0.0
 * @since Phase 2: 多國語系模組化
 */

(function() {
    'use strict';

    /**
     * I18n Helper 類別
     * 管理多國語系相關功能
     */
    class I18nHelper {
        constructor() {
            // 內部狀態
            this._translations = {};
            this._currentLocale = 'en';
            this._fallbackLocale = 'en';
            
            // 綁定方法，確保 this 正確
            this.getNlsText = this.getNlsText.bind(this);
            this.formatText = this.formatText.bind(this);
            this.setLanguage = this.setLanguage.bind(this);
            this.initI18n = this.initI18n.bind(this);
            this.updateUITexts = this.updateUITexts.bind(this);
            this.formatRelativeTime = this.formatRelativeTime.bind(this);
        }

        /**
         * 初始化多語系系統
         * @param {Object} nlsData - 多語系資料物件
         * @param {string} [locale] - 目標語言代碼
         */
        initI18n(nlsData, locale) {
            if (nlsData && typeof nlsData === 'object') {
                this._translations = { ...nlsData };
            }
            
            if (locale) {
                this._currentLocale = locale;
            }
            
            // 觸發 UI 更新
            this.updateUITexts();
        }

        /**
         * 取得本地化文字
         * @param {string} key - NLS 鍵值
         * @param {string} [defaultValue] - 預設文字（當鍵值不存在時）
         * @param {...any} args - 用於格式化的參數
         * @returns {string} 本地化後的文字
         */
        getNlsText(key, defaultValue, ...args) {
            const text = this._translations[key] || defaultValue || key;
            
            // 如果有額外參數，則進行格式化
            if (args.length > 0) {
                return this.formatText(text, ...args);
            }
            
            return text;
        }

        /**
         * 格式化文字模板（支援 {0}, {1} 等參數替換）
         * @param {string} template - 文字模板
         * @param {...any} args - 替換參數
         * @returns {string} 格式化後的文字
         */
        formatText(template, ...args) {
            if (!template || typeof template !== 'string') {
                return template || '';
            }
            
            return template.replace(/\{(\d+)\}/g, (match, index) => {
                const argIndex = parseInt(index, 10);
                return argIndex < args.length ? String(args[argIndex]) : match;
            });
        }

        /**
         * 設定目前語言
         * @param {string} locale - 語言代碼
         */
        setLanguage(locale) {
            if (locale && typeof locale === 'string') {
                this._currentLocale = locale;
                this.updateUITexts();
            }
        }

        /**
         * 取得目前語言代碼
         * @returns {string} 語言代碼
         */
        getCurrentLanguage() {
            return this._currentLocale;
        }

        /**
         * 取得所有翻譯資料
         * @returns {Object} 翻譯資料物件
         */
        getTranslations() {
            return { ...this._translations };
        }

        /**
         * 格式化相對時間（24小時制）
         * @param {Date|number|string} date - 時間
         * @returns {string} 格式化後的相對時間
         */
        formatRelativeTime(date) {
            const targetDate = new Date(date);
            const now = new Date();
            const diff = Math.floor((now - targetDate) / 1000);
            
            if (diff < 60) {
                return this.getNlsText('justNow', 'just now');
            }
            if (diff < 3600) {
                return this.getNlsText('minutesAgo', '{0}m ago', Math.floor(diff/60));
            }
            if (diff < 86400) {
                return this.getNlsText('hoursAgo', '{0}h ago', Math.floor(diff/3600));
            }
            return this.getNlsText('daysAgo', '{0}d ago', Math.floor(diff/86400));
        }

        /**
         * 更新 UI 文字
         * 遍歷所有具有 data-i18n-* 屬性的元素並更新其文字
         */
        updateUITexts() {
            // 更新頁面標題
            document.title = this.getNlsText('title', 'StatusBar Helper Settings');

            // 更新具有 data-i18n-text 屬性的元素
            const textElements = document.querySelectorAll('[data-i18n-text]');
            textElements.forEach(element => {
                const key = element.getAttribute('data-i18n-text');
                if (key) {
                    const originalText = element.getAttribute('data-i18n-original') || element.textContent;
                    if (!element.hasAttribute('data-i18n-original')) {
                        element.setAttribute('data-i18n-original', originalText);
                    }
                    element.textContent = this.getNlsText(key, originalText);
                }
            });

            // 更新具有 data-i18n-title 屬性的元素
            const titleElements = document.querySelectorAll('[data-i18n-title]');
            titleElements.forEach(element => {
                const key = element.getAttribute('data-i18n-title');
                if (key) {
                    const originalTitle = element.getAttribute('data-i18n-title-original') || element.title;
                    if (!element.hasAttribute('data-i18n-title-original')) {
                        element.setAttribute('data-i18n-title-original', originalTitle);
                    }
                    element.title = this.getNlsText(key, originalTitle);
                }
            });

            // 更新具有 data-i18n-placeholder 屬性的元素
            const placeholderElements = document.querySelectorAll('[data-i18n-placeholder]');
            placeholderElements.forEach(element => {
                const key = element.getAttribute('data-i18n-placeholder');
                if (key) {
                    const originalPlaceholder = element.getAttribute('data-i18n-placeholder-original') || element.placeholder;
                    if (!element.hasAttribute('data-i18n-placeholder-original')) {
                        element.setAttribute('data-i18n-placeholder-original', originalPlaceholder);
                    }
                    element.placeholder = this.getNlsText(key, originalPlaceholder);
                }
            });

            // 更新主要區塊標題
            this._updateMainSectionTitles();
        }

        /**
         * 更新主要區塊標題（內部方法）
         * @private
         */
        _updateMainSectionTitles() {
            // 狀態列項目標題
            const statusBarTitle = document.querySelector('#list-view .list-title span');
            if (statusBarTitle) {
                statusBarTitle.textContent = this.getNlsText('statusBarItems', 'Status Bar Items');
            }

            // 存儲資料標題
            const storedDataTitle = document.querySelector('#data-view .data-title span');
            if (storedDataTitle) {
                storedDataTitle.textContent = this.getNlsText('storedData', 'Stored Data');
            }

            // 備份管理按鈕
            const backupStatusRoot = document.getElementById('backup-status-root');
            if (backupStatusRoot) {
                const btn = backupStatusRoot.querySelector('.backup-manage-btn');
                if (btn) {
                    const label = btn.querySelector('#backup-manage-label');
                    // 使用與 HTML data-nls 一致的 key，避免 fallback 英文覆寫
                    const txt = this.getNlsText('backupManagement', 'Backup Management');
                    btn.title = txt;
                    btn.setAttribute('aria-label', txt);
                    btn.querySelector('i')?.setAttribute('title', txt);
                    btn.querySelector('i')?.setAttribute('aria-label', txt);
                    if (label) {
                        label.textContent = txt;
                    }
                }
            }
        }

        /**
         * 取得版本資訊
         * @returns {string} 版本號
         */
        getVersion() {
            return '1.0.0';
        }
    }

    // 建立全域實例
    const i18nHelper = new I18nHelper();

    // 建立全域 API
    window.I18nHelper = {
        // 核心方法
        getNlsText: i18nHelper.getNlsText,
        formatText: i18nHelper.formatText,
        setLanguage: i18nHelper.setLanguage,
        initI18n: i18nHelper.initI18n,
        updateUITexts: i18nHelper.updateUITexts,
        formatRelativeTime: i18nHelper.formatRelativeTime,
        
        // 取得器方法
        getCurrentLanguage: i18nHelper.getCurrentLanguage,
        getTranslations: i18nHelper.getTranslations,
        getVersion: i18nHelper.getVersion,
        
        // 內部實例（供除錯用）
        _instance: i18nHelper
    };

    // 模組載入完成提示
    console.log('📖 I18n Helper Module loaded successfully (v1.0.0)');

})();
