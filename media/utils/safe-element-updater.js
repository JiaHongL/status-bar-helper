/**
 * SafeElementUpdater - 安全的元素更新器
 * 統一處理有 data-nls 屬性的元素，避免覆寫已翻譯的文字
 */
class SafeElementUpdater {
    /**
     * 更新元素文字內容，保護 data-nls 元素
     * @param {Element} element - 要更新的元素
     * @param {string} newContent - 新的內容
     * @param {Object} options - 選項
     * @param {boolean} options.preserveDataNls - 是否保護 data-nls 元素（預設 true）
     * @param {boolean} options.preserveChildren - 是否保留特定子元素
     * @param {string[]} options.preserveSelectors - 要保留的子元素選擇器
     */
    static updateTextContent(element, newContent, options = {}) {
        const {
            preserveDataNls = true,
            preserveChildren = false,
            preserveSelectors = []
        } = options;

        // 檢查是否為 data-nls 元素
        if (preserveDataNls && element.hasAttribute('data-nls')) {
            console.warn('SafeElementUpdater: 嘗試覆寫 data-nls 元素，已忽略', {
                element: element.id || element.tagName,
                nlsKey: element.getAttribute('data-nls'),
                attemptedContent: newContent
            });
            return false;
        }

        if (!preserveChildren) {
            element.textContent = newContent;
            return true;
        }

        // 保留特定子元素的更新
        const childrenToPreserve = [];
        for (const selector of preserveSelectors) {
            const children = element.querySelectorAll(selector);
            children.forEach(child => {
                childrenToPreserve.push(child.cloneNode(true));
            });
        }

        element.textContent = newContent;
        
        // 重新添加保留的子元素
        for (const child of childrenToPreserve) {
            element.appendChild(child);
        }

        return true;
    }

    /**
     * 更新 innerHTML，保留指定的子元素
     * @param {Element} element - 要更新的元素
     * @param {string} newHTML - 新的 HTML 內容
     * @param {string[]} preserveSelectors - 要保留的子元素選擇器
     */
    static updateInnerHTML(element, newHTML, preserveSelectors = []) {
        if (element.hasAttribute('data-nls')) {
            console.warn('SafeElementUpdater: 嘗試覆寫 data-nls 元素的 innerHTML，已忽略', {
                element: element.id || element.tagName,
                nlsKey: element.getAttribute('data-nls')
            });
            return false;
        }

        const childrenToPreserve = [];
        for (const selector of preserveSelectors) {
            const children = element.querySelectorAll(selector);
            children.forEach(child => {
                childrenToPreserve.push(child.outerHTML);
            });
        }

        element.innerHTML = newHTML + childrenToPreserve.join('');
        return true;
    }

    /**
     * 更新 Running 標題（保留 span 子元素）
     * @param {Element} thElement - th 元素
     * @param {string} newText - 新文字
     */
    static updateRunningHeader(thElement, newText) {
        const span = thElement.querySelector('span');
        return this.updateInnerHTML(thElement, newText, span ? ['span'] : []);
    }

    /**
     * 更新 Script Store 按鈕（保留徽章）
     * @param {Element} buttonElement - 按鈕元素
     * @param {string} newText - 新文字
     */
    static updateScriptStoreButton(buttonElement, newText) {
        const badge = buttonElement.querySelector('#script-store-new-badge');
        return this.updateInnerHTML(buttonElement, newText, badge ? ['#script-store-new-badge'] : []);
    }

    /**
     * 安全設定元素屬性（不影響 textContent）
     * @param {Element} element - 元素
     * @param {string} attribute - 屬性名
     * @param {string} value - 屬性值
     */
    static setAttribute(element, attribute, value) {
        element.setAttribute(attribute, value);
    }

    /**
     * 批量設定屬性
     * @param {Element} element - 元素
     * @param {Object} attributes - 屬性對象
     */
    static setAttributes(element, attributes) {
        for (const [key, value] of Object.entries(attributes)) {
            element.setAttribute(key, value);
        }
    }
}

// 全域暴露
if (typeof window !== 'undefined') {
    window.SafeElementUpdater = SafeElementUpdater;
}

// Node.js 環境支援
if (typeof module !== 'undefined' && module.exports) {
    module.exports = SafeElementUpdater;
}
