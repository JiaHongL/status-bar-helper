/**
 * Edit Page Web Component
 * 封裝整個編輯頁面的功能，包含表單控制項、Monaco Editor、輸出面板等
 * 
 * Features:
 * - 圖示選擇器
 * - 標籤和工具提示輸入
 * - Monaco Editor 整合
 * - 輸出面板與分割器
 * - 草稿保存
 * - 事件處理
 */

class EditPageComponent extends HTMLElement {
  constructor() {
    super();
    
    // 狀態管理
    this.currentEditingIndex = null;
    this.currentItem = null;
    this.selectedIcon = '';
    this.typeDefs = null;
    this.monacoUri = null; // Monaco URI for initialization
    
    // UI 元素引用
    this.monacoEditor = null;
    this.iconDropdown = null;
    this.isIconDropdownOpen = false;
    
    // 事件處理器引用（用於清理）
    this.eventHandlers = new Map();
    
    // 分割器狀態
    this.splitState = {
      ratio: 0.65,
      isCollapsed: false,
      isDragging: false
    };
    
    // 默認腳本模板
    this.defaultScript = `// Press Ctrl+S (or Cmd+S) to save
const vscode = require('vscode');
const { storage, files, vm } = statusBarHelper.v1;
const { setTimeout, clearTimeout, setInterval, clearInterval } = require('timers');
const { randomUUID } = require('crypto');
const fs = require('fs');
const path = require('path');
const { exec, spawn } = require('child_process');
const util = require('util');
`;
  }

  connectedCallback() {
    this.render();
    this.initializeEventListeners();
    this.initializeIconDropdown();
    this.initializeSplitter();
    
    console.log('📝 Edit Page Web Component initialized');
  }

  disconnectedCallback() {
    this.cleanup();
  }

  // 屬性觀察
  static get observedAttributes() {
    return ['editing-index', 'type-defs'];
  }

  attributeChangedCallback(name, oldValue, newValue) {
    if (name === 'editing-index') {
      this.currentEditingIndex = newValue === 'null' ? null : parseInt(newValue, 10);
    } else if (name === 'type-defs') {
      try {
        this.typeDefs = newValue ? JSON.parse(newValue) : null;
      } catch (e) {
        console.warn('Invalid typeDefs JSON:', e);
        this.typeDefs = null;
      }
      this.monacoEditor.typeDefs = this.typeDefs;
    }
  }

  // 設置編輯項目
  setItem(index, item) {
    this.currentEditingIndex = index;
    this.currentItem = { ...item };
    
    // 解析圖示和標籤
    const match = item.text.match(/^\$\(([^)]+)\) (.*)$/);
    this.selectedIcon = match ? match[1] : '';
    const label = match ? match[2] : item.text;
    
    // 如果是新項目且沒有腳本，使用默認腳本
    if (index === null && !item.script) {
      item.script = this.defaultScript;
    }
    
    // 更新 UI
    this.updateFormFields(label, item.tooltip || '', item.script || '');
    this.updateIconDisplay();
    
    // 更新 Monaco Editor
    if (this.monacoEditor) {
      this.monacoEditor.itemCommand = item.command;
      this.monacoEditor.value = item.script || '';
      this.monacoEditor.typeDefs = this.typeDefs;
    }
    
    // 觸發事件
    this.dispatchEvent(new CustomEvent('item-loaded', {
      detail: { index, item: this.currentItem }
    }));
  }

  // 獲取當前編輯內容
  getCurrentContent() {
    const labelInput = this.querySelector('#edit-label');
    const tooltipInput = this.querySelector('#edit-tooltip');
    
    let text = labelInput ? labelInput.value.trim() : '';
    if (this.selectedIcon && text) {
      text = `\$(${this.selectedIcon}) ${text}`;
    }
    
    return {
      text,
      tooltip: tooltipInput ? tooltipInput.value : '',
      script: this.monacoEditor ? this.monacoEditor.value : '',
      icon: this.selectedIcon
    };
  }

  // 渲染組件 HTML
  render() {
    this.innerHTML = `
      <div class="edit-item-container">
        <div class="controls-row">
          <div class="field icon-field">
            <label data-nls="icon">Icon</label>
            <div id="icon-trigger" class="icon-trigger">
              <i id="selected-icon" class="codicon codicon-ellipsis"></i>
              <span id="selected-icon-name" data-nls="selectIcon">Select icon</span>
              <i class="codicon codicon-chevron-down"></i>
            </div>
            <div id="icon-dropdown" class="icon-dropdown">
              <input type="text" id="icon-search" placeholder="Search icons…" data-nls="searchIcons">
              <div id="icon-list" class="icon-list"></div>
            </div>
          </div>
          <div class="field label-field">
            <label for="edit-label" data-nls="label">Label</label>
            <input type="text" id="edit-label">
          </div>
          <div class="field tooltip-field">
            <label for="edit-tooltip" data-nls="tooltip">Tooltip</label>
            <input type="text" id="edit-tooltip">
          </div>
          <div class="actions">
            <button type="button" id="run-btn" class="edit-icon-btn" title="Smart Run (auto-detect)" aria-label="Run" data-nls="run">
              <i class="codicon codicon-play"></i>
            </button>
            <button type="button" id="stop-btn" class="edit-icon-btn" title="Stop" aria-label="Stop" data-nls="stop">
              <i class="codicon codicon-debug-stop"></i>
            </button>
            <button type="button" id="save-item-btn" class="edit-icon-btn" title="Save" aria-label="Save" data-nls="save">
              <i class="codicon codicon-save"></i>
            </button>
            <button type="button" id="cancel-edit-btn" class="edit-icon-btn" title="Cancel" aria-label="Cancel" data-nls="cancel">
              <i class="codicon codicon-close"></i>
            </button>
          </div>
        </div>

        <div class="eo-stack" id="eo-stack">
          <monaco-editor 
            id="monaco-editor-component" 
            language="javascript"
            theme="auto"
            monaco-uri="">
          </monaco-editor>
          <div class="splitter" id="eo-splitter" title="Drag to resize" data-nls="dragToResize"></div>
          <div class="output-container" id="output-container">
            <div class="output-header" id="output-toggle">
              <i class="codicon codicon-terminal"></i>
              <span class="title" data-nls="output">Output</span>
              <i class="codicon codicon-chevron-down chev" id="output-chevron"></i>
            </div>
            <pre id="run-output"></pre>
          </div>
        </div>
      </div>
    `;
  }

  // 初始化事件監聽器
  initializeEventListeners() {
    // Monaco Editor 事件
    this.monacoEditor = this.querySelector('#monaco-editor-component');
    if (this.monacoEditor) {
      // 設置 Monaco URI（如果已經設置了）
      if (this.monacoUri) {
        this.monacoEditor.setAttribute('monaco-uri', this.monacoUri);
      }
      
      const monacoReadyHandler = (e) => {
        console.log('Monaco Editor ready in Edit Page');
        this.layoutEditor();
      };
      
      const contentChangedHandler = (e) => {
        this.dispatchEvent(new CustomEvent('content-changed', {
          detail: { 
            content: e.detail.content,
            item: this.currentItem 
          }
        }));
      };
      
      const saveTriggeredHandler = () => {
        this.handleSave();
      };
      
      this.monacoEditor.addEventListener('monaco-ready', monacoReadyHandler);
      this.monacoEditor.addEventListener('content-changed', contentChangedHandler);
      this.monacoEditor.addEventListener('save-triggered', saveTriggeredHandler);
      
      // 保存處理器引用以便清理
      this.eventHandlers.set('monaco-ready', monacoReadyHandler);
      this.eventHandlers.set('content-changed', contentChangedHandler);
      this.eventHandlers.set('save-triggered', saveTriggeredHandler);
    }

    // 表單輸入事件
    const labelInput = this.querySelector('#edit-label');
    const tooltipInput = this.querySelector('#edit-tooltip');
    
    if (labelInput) {
      const labelHandler = (e) => {
        this.dispatchEvent(new CustomEvent('field-changed', {
          detail: { 
            field: 'label', 
            value: e.target.value,
            item: this.currentItem 
          }
        }));
      };
      labelInput.addEventListener('input', labelHandler);
      this.eventHandlers.set('label-input', labelHandler);
    }
    
    if (tooltipInput) {
      const tooltipHandler = (e) => {
        this.dispatchEvent(new CustomEvent('field-changed', {
          detail: { 
            field: 'tooltip', 
            value: e.target.value,
            item: this.currentItem 
          }
        }));
      };
      tooltipInput.addEventListener('input', tooltipHandler);
      this.eventHandlers.set('tooltip-input', tooltipHandler);
    }

    // 按鈕事件
    this.addEventListener('click', this.handleButtonClick.bind(this));

    // 輸出面板切換
    const outputToggle = this.querySelector('#output-toggle');
    if (outputToggle) {
      const toggleHandler = () => this.toggleOutput();
      outputToggle.addEventListener('click', toggleHandler);
      this.eventHandlers.set('output-toggle', toggleHandler);
    }

    // 窗口調整事件
    const resizeHandler = () => this.layoutEditor();
    window.addEventListener('resize', resizeHandler, { passive: true });
    this.eventHandlers.set('window-resize', resizeHandler);
  }

  // 按鈕點擊處理
  handleButtonClick(e) {
    const button = e.target.closest('button');
    if (!button) {
      return;
    }

    switch (button.id) {
      case 'save-item-btn':
        this.handleSave();
        break;
      case 'cancel-edit-btn':
        this.handleCancel();
        break;
      case 'run-btn':
        this.handleRun();
        break;
      case 'stop-btn':
        this.handleStop();
        break;
    }
  }

  // 保存處理
  handleSave() {
    const content = this.getCurrentContent();
    
    this.dispatchEvent(new CustomEvent('save-item', {
      detail: {
        index: this.currentEditingIndex,
        item: {
          ...this.currentItem,
          ...content
        }
      }
    }));
  }

  // 取消處理
  async handleCancel() {
    // 檢查是否有未保存的更改
    const hasUnsaved = this.hasUnsavedChanges();
    
    if (hasUnsaved) {
      this.dispatchEvent(new CustomEvent('confirm-discard', {
        detail: {
          index: this.currentEditingIndex,
          item: this.currentItem
        }
      }));
    } else {
      this.dispatchEvent(new CustomEvent('cancel-edit', {
        detail: {
          index: this.currentEditingIndex,
          item: this.currentItem
        }
      }));
    }
  }

  // 運行處理
  handleRun() {
    const script = this.monacoEditor ? this.monacoEditor.value : '';
    
    // 顯示輸出面板
    this.showOutput();
    const outputEl = this.querySelector('#run-output');
    if (outputEl) {
      outputEl.textContent = "▶ Running script...\n";
    }
    
    this.dispatchEvent(new CustomEvent('run-script', {
      detail: {
        script,
        item: this.currentItem
      }
    }));
  }

  // 停止處理
  handleStop() {
    this.dispatchEvent(new CustomEvent('stop-script', {
      detail: {
        item: this.currentItem
      }
    }));
  }

  // 檢查是否有未保存的更改
  hasUnsavedChanges() {
    if (!this.currentItem) {
      return false;
    }
    
    const current = this.getCurrentContent();
    const original = {
      text: this.currentItem.text || '',
      tooltip: this.currentItem.tooltip || '',
      script: this.currentItem.script || '',
      icon: this.selectedIcon || ''
    };
    
    return JSON.stringify(current) !== JSON.stringify(original);
  }

  // 更新表單欄位
  updateFormFields(label, tooltip, script) {
    const labelInput = this.querySelector('#edit-label');
    const tooltipInput = this.querySelector('#edit-tooltip');
    
    if (labelInput) {
      labelInput.value = label;
    }
    if (tooltipInput) {
      tooltipInput.value = tooltip;
    }
  }

  // 更新圖示顯示
  updateIconDisplay() {
    const iconEl = this.querySelector('#selected-icon');
    const nameEl = this.querySelector('#selected-icon-name');
    
    if (iconEl && nameEl) {
      if (this.selectedIcon) {
        iconEl.className = `codicon codicon-${this.selectedIcon}`;
        nameEl.textContent = this.selectedIcon;
      } else {
        iconEl.className = 'codicon codicon-ellipsis';
        nameEl.textContent = this.getNlsText('selectIcon', 'Select icon');
      }
    }
  }

  // 初始化圖示下拉選單
  initializeIconDropdown() {
    const trigger = this.querySelector('#icon-trigger');
    const dropdown = this.querySelector('#icon-dropdown');
    const searchInput = this.querySelector('#icon-search');
    const iconList = this.querySelector('#icon-list');
    
    if (!trigger || !dropdown || !searchInput || !iconList) {
      return;
    }

    // 點擊觸發器
    const triggerHandler = () => {
      this.isIconDropdownOpen ? this.closeIconDropdown() : this.openIconDropdown();
    };
    trigger.addEventListener('click', triggerHandler);
    this.eventHandlers.set('icon-trigger', triggerHandler);

    // 搜尋輸入
    let searchTimer;
    const searchHandler = () => {
      clearTimeout(searchTimer);
      searchTimer = setTimeout(() => {
        this.renderIcons(searchInput.value.trim());
      }, 80);
    };
    searchInput.addEventListener('input', searchHandler);
    this.eventHandlers.set('icon-search', searchHandler);

    // ESC 鍵關閉
    const keyHandler = (e) => {
      if (e.key === 'Escape') {
        this.closeIconDropdown();
        trigger.focus();
      } else if (e.key === 'Enter') {
        const firstIcon = iconList.querySelector('.icon-item');
        if (firstIcon) {
          firstIcon.click();
        }
      }
    };
    searchInput.addEventListener('keydown', keyHandler);
    this.eventHandlers.set('icon-keydown', keyHandler);

    this.iconDropdown = dropdown;
  }

  // 開啟圖示下拉選單
  openIconDropdown() {
    if (this.isIconDropdownOpen) {
      return;
    }
    
    this.isIconDropdownOpen = true;
    const trigger = this.querySelector('#icon-trigger');
    const dropdown = this.iconDropdown;
    const searchInput = this.querySelector('#icon-search');
    
    // 移動到 body 並定位
    document.body.appendChild(dropdown);
    this.positionDropdown();
    dropdown.style.display = 'block';
    
    // 聚焦搜尋框
    if (searchInput) {
      searchInput.focus();
    }
    
    // 全域點擊關閉
    const globalClickHandler = (e) => {
      if (!trigger.contains(e.target) && !dropdown.contains(e.target)) {
        this.closeIconDropdown();
      }
    };
    
    // 視窗調整重新定位
    const resizeHandler = () => {
      if (this.isIconDropdownOpen) {
        this.positionDropdown();
      }
    };
    
    document.addEventListener('click', globalClickHandler);
    window.addEventListener('resize', resizeHandler, { passive: true });
    window.addEventListener('scroll', resizeHandler, { passive: true });
    
    this.iconDropdownCleanup = () => {
      document.removeEventListener('click', globalClickHandler);
      window.removeEventListener('resize', resizeHandler);
      window.removeEventListener('scroll', resizeHandler);
    };
    
    // 渲染圖示列表
    this.renderIcons();
  }

  // 關閉圖示下拉選單
  closeIconDropdown() {
    if (!this.isIconDropdownOpen) {
      return;
    }
    
    this.isIconDropdownOpen = false;
    const dropdown = this.iconDropdown;
    
    dropdown.style.display = 'none';
    this.appendChild(dropdown); // 移回原位置
    
    if (this.iconDropdownCleanup) {
      this.iconDropdownCleanup();
      this.iconDropdownCleanup = null;
    }
  }

  // 定位下拉選單
  positionDropdown() {
    const trigger = this.querySelector('#icon-trigger');
    const dropdown = this.iconDropdown;
    
    if (!trigger || !dropdown) {
      return;
    }
    
    const rect = trigger.getBoundingClientRect();
    Object.assign(dropdown.style, {
      position: 'fixed',
      left: `${Math.round(rect.left)}px`,
      top: `${Math.round(rect.bottom)}px`,
      width: `${Math.round(rect.width)}px`
    });
  }

  // 渲染圖示列表
  renderIcons(filter = '') {
    const iconList = this.querySelector('#icon-list');
    if (!iconList) {
      return;
    }
    
    // 取得圖示列表（假設全域可用）
    const icons = window.vscodeIcons || [];
    const filterLower = filter.toLowerCase();
    
    iconList.innerHTML = '';
    
    icons
      .filter(name => name.toLowerCase().includes(filterLower))
      .forEach(name => {
        const div = document.createElement('div');
        div.className = `icon-item${name === this.selectedIcon ? ' selected' : ''}`;
        div.innerHTML = `<i class="codicon codicon-${name}" title="${name}"></i>`;
        
        div.onclick = () => {
          this.selectedIcon = name;
          this.updateIconDisplay();
          this.closeIconDropdown();
          
          // 觸發圖示變更事件
          this.dispatchEvent(new CustomEvent('field-changed', {
            detail: { 
              field: 'icon', 
              value: name,
              item: this.currentItem 
            }
          }));
        };
        
        iconList.appendChild(div);
      });
  }

  // 初始化分割器
  initializeSplitter() {
    const splitter = this.querySelector('#eo-splitter');
    const stack = this.querySelector('#eo-stack');
    const editorEl = this.monacoEditor;
    const outputEl = this.querySelector('#output-container');
    
    if (!splitter || !stack || !editorEl || !outputEl) {
      return;
    }

    const SPLIT_MIN_EDITOR = 120;
    const SPLIT_MIN_OUTPUT = 60;
    const SPLIT_BAR = 6;

    let startY = 0;
    let startEditorHeight = 0;
    let totalHeight = 0;

    const onMouseMove = (e) => {
      const dy = e.clientY - startY;
      const availableHeight = totalHeight - SPLIT_BAR;
      const newEditorHeight = Math.max(
        SPLIT_MIN_EDITOR,
        Math.min(availableHeight - SPLIT_MIN_OUTPUT, startEditorHeight + dy)
      );
      
      const ratio = newEditorHeight / availableHeight;
      this.applySplitLayout(ratio);
    };

    const onMouseUp = () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
      this.splitState.isDragging = false;
    };

    const mouseDownHandler = (e) => {
      if (this.splitState.isCollapsed) {
        return;
      }
      
      e.preventDefault();
      this.splitState.isDragging = true;
      startY = e.clientY;
      startEditorHeight = editorEl.getBoundingClientRect().height;
      totalHeight = stack.getBoundingClientRect().height;
      
      window.addEventListener('mousemove', onMouseMove);
      window.addEventListener('mouseup', onMouseUp);
    };

    splitter.addEventListener('mousedown', mouseDownHandler);
    this.eventHandlers.set('splitter-mousedown', mouseDownHandler);
  }

  // 應用分割佈局
  applySplitLayout(ratio = null) {
    const stack = this.querySelector('#eo-stack');
    const editorEl = this.monacoEditor;
    const outputEl = this.querySelector('#output-container');
    
    if (!stack || !editorEl || !outputEl) {
      return;
    }

    const SPLIT_MIN_EDITOR = 120;
    const SPLIT_MIN_OUTPUT = 60;
    const SPLIT_BAR = 6;
    const totalHeight = stack.clientHeight - SPLIT_BAR;

    if (ratio !== null) {
      this.splitState.ratio = ratio;
    }

    if (this.splitState.isCollapsed) {
      const outputHeader = outputEl.querySelector('.output-header');
      const headerHeight = outputHeader ? outputHeader.offsetHeight : 28;
      
      editorEl.style.height = `${Math.max(SPLIT_MIN_EDITOR, totalHeight - headerHeight)}px`;
      outputEl.style.height = `${headerHeight}px`;
    } else {
      const editorHeight = Math.max(
        SPLIT_MIN_EDITOR,
        Math.min(totalHeight - SPLIT_MIN_OUTPUT, Math.round(totalHeight * this.splitState.ratio))
      );
      const outputHeight = Math.max(SPLIT_MIN_OUTPUT, totalHeight - editorHeight);
      
      editorEl.style.height = `${editorHeight}px`;
      outputEl.style.height = `${outputHeight}px`;
    }

    // 佈局編輯器
    this.layoutEditor();
  }

  // 切換輸出面板
  toggleOutput() {
    const outputEl = this.querySelector('#output-container');
    const outputContent = this.querySelector('#run-output');
    
    if (!outputEl || !outputContent) {
      return;
    }

    this.splitState.isCollapsed = !this.splitState.isCollapsed;
    
    if (this.splitState.isCollapsed) {
      outputEl.classList.add('collapsed');
      outputContent.setAttribute('hidden', '');
    } else {
      outputEl.classList.remove('collapsed');
      outputContent.removeAttribute('hidden');
    }
    
    this.applySplitLayout();
  }

  // 顯示輸出面板
  showOutput() {
    if (this.splitState.isCollapsed) {
      this.toggleOutput();
    }
  }

  // 佈局編輯器
  layoutEditor() {
    setTimeout(() => {
      if (this.monacoEditor && typeof this.monacoEditor.layout === 'function') {
        this.monacoEditor.layout();
      }
    }, 0);
  }

  // 設置輸出內容
  setOutput(content) {
    const outputEl = this.querySelector('#run-output');
    if (outputEl) {
      outputEl.textContent = content;
    }
  }

  // 添加輸出內容
  appendOutput(content) {
    const outputEl = this.querySelector('#run-output');
    if (outputEl) {
      outputEl.textContent += content;
    }
  }

  // 清理資源
  cleanup() {
    // 關閉圖示下拉選單
    this.closeIconDropdown();
    
    // 清理事件監聽器
    this.eventHandlers.forEach((handler, key) => {
      if (key === 'window-resize') {
        window.removeEventListener('resize', handler);
      } else if (key.includes('monaco-')) {
        if (this.monacoEditor) {
          this.monacoEditor.removeEventListener(key.replace('monaco-', ''), handler);
        }
      }
      // 其他事件會隨著元素移除自動清理
    });
    
    this.eventHandlers.clear();
    
    console.log('📝 Edit Page Web Component cleaned up');
  }

  // 國際化輔助方法
  getNlsText(key, defaultValue) {
    if (typeof window.getNlsText === 'function') {
      return window.getNlsText(key, defaultValue);
    }
    return defaultValue || key;
  }

  // 設置 Monaco URI
  setMonacoUri(uri) {
    this.monacoUri = uri;
    if (this.monacoEditor) {
      this.monacoEditor.setAttribute('monaco-uri', uri);
    }
  }

  // 設置國際化資料
  set nlsData(data) {
    this._nlsData = data;
    // 更新所有 data-nls 元素
    this.querySelectorAll('[data-nls]').forEach(el => {
      const key = el.getAttribute('data-nls');
      const translated = this.getNlsText(key, el.textContent);
      
      if (el.tagName.toLowerCase() === 'input' && el.type === 'text') {
        el.placeholder = translated;
      } else if (el.hasAttribute('title')) {
        el.title = translated;
      } else {
        el.textContent = translated;
      }
    });
  }

  get nlsData() {
    return this._nlsData;
  }
}

// 註冊 Web Component
customElements.define('edit-page', EditPageComponent);

console.log('📝 Edit Page Web Component defined');
