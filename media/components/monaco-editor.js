/**
 * Monaco Editor Web Component
 *
 * 封裝 Monaco Editor 為 Web Component，提供統一的編輯器介面
 * 不使用 Shadow DOM，與現有樣式和全域變數相容
 *
 * Features:
 * - TypeScript/JavaScript 語法支持
 * - 自動佈局調整
 * - 快捷鍵支持 (Ctrl/Cmd+S)
 * - 主題自動切換 (light/dark)
 * - Type definitions 支持
 * - 草稿自動保存
 *
 * Events:
 * - monaco-ready: Monaco 編輯器準備完成
 * - content-changed: 內容變更
 * - save-triggered: Ctrl/Cmd+S 觸發儲存
 *
 * Properties:
 * - value: 編輯器內容
 * - language: 程式語言 (預設: javascript)
 * - theme: 主題 (auto/vs/vs-dark)
 * - readOnly: 唯讀模式
 * - itemCommand: 當前編輯項目的命令 ID (用於草稿)
 * - typeDefs: 類型定義物件
 */

class MonacoEditorComponent extends HTMLElement {
  constructor() {
    super();

    // 不使用 Shadow DOM，直接操作 Light DOM
    // this.attachShadow({ mode: 'open' });

    // 編輯器實例
    this._editor = null;
    this._isReady = false;
    this._pendingValue = "";

    // 屬性預設值
    this._value = "";
    this._language = "javascript";
    this._readOnly = false;
    this._itemCommand = null;
    this._typeDefs = null;

    // 事件處理器
    this._resizeObserver = null;
    this._changeListener = null;
    this._saveCommand = null;

    // 綁定方法
    this._handleResize = this._handleResize.bind(this);
    this._handleContentChange = this._handleContentChange.bind(this);
    this._handleSaveCommand = this._handleSaveCommand.bind(this);
  }

  // 觀察的屬性
  static get observedAttributes() {
    return [
      "value",
      "language",
      "theme",
      "readonly",
      "monaco-uri",
      "item-command",
    ];
  }

  // 屬性 getters/setters
  get value() {
    if (this._editor && this._isReady) {
      return this._editor.getValue();
    }
    return this._value;
  }

  set value(val) {
    this._value = val || "";
    if (this._editor && this._isReady) {
      if (this._editor.getValue() !== this._value) {
        this._editor.setValue(this._value);
      }
    } else {
      this._pendingValue = this._value;
    }
  }

  get language() {
    return this._language;
  }

  set language(val) {
    this._language = val || "javascript";
    if (this._editor && this._isReady) {
      const model = this._editor.getModel();
      if (model) {
        monaco.editor.setModelLanguage(model, this._language);
      }
    }
  }

  get readOnly() {
    return this._readOnly;
  }

  set readOnly(val) {
    this._readOnly = Boolean(val);
    if (this._editor && this._isReady) {
      this._editor.updateOptions({ readOnly: this._readOnly });
    }
  }

  get itemCommand() {
    return this._itemCommand;
  }

  set itemCommand(val) {
    this._itemCommand = val;
  }

  get typeDefs() {
    return this._typeDefs;
  }

  set typeDefs(val) {
    this._typeDefs = val;
    if (this._editor && this._isReady && this._typeDefs) {
      this._applyTypeDefs();
    }
  }

  // 生命週期方法
  connectedCallback() {
    this._initializeMonaco();
    this._render();
    this._setupResizeObserver();
  }

  disconnectedCallback() {
    this._cleanup();
  }

  attributeChangedCallback(name, oldValue, newValue) {
    if (oldValue === newValue) {
      return;
    }

    switch (name) {
      case "value":
        this.value = newValue;
        break;
      case "language":
        this.language = newValue;
        break;
      case "theme":
        this.theme = newValue;
        break;
      case "readonly":
        this.readOnly = newValue !== null;
        break;
      case "item-command":
        this.itemCommand = newValue;
        break;
    }
  }

  // 渲染編輯器容器
  _render() {
    this.innerHTML =
      '<div class="monaco-editor-container" style="width: 100%; height: 100%;"></div>';
  }

  // 初始化 Monaco 編輯器
  _initializeMonaco() {
    const ready = () => (typeof window !== 'undefined' && window.monaco);

    if (ready()) {
      this._createEditor();
      return;
    }
    let tries = 0;
    const timer = setInterval(() => {
      if (ready()) {
        clearInterval(timer);
        this._createEditor();
      } else if (++tries > 60) {
        clearInterval(timer);
        console.error('[MonacoEditorComponent] monaco not ready. Ensure ESM import is placed before this component is used.');
      }
    }, 50);
  }

  // 建立編輯器實例
  _createEditor() {
    const container = this.querySelector(".monaco-editor-container");
    if (!container) {
      return;
    }

    // 清理舊的編輯器
    if (this._editor) {
      this._editor.dispose();
      this._editor = null;
    }

    // 決定主題
    const theme = this._getTheme();

    // 建立編輯器
    this._editor = monaco.editor.create(container, {
      value: this._pendingValue || this._value,
      language: this._language,
      theme,
      readOnly: this._readOnly,
      automaticLayout: true,
      lineNumbers: "relative",
      glyphMargin: true,
      folding: true,
      foldingStrategy: "auto",
      showFoldingControls: "mouseover",
      matchBrackets: "always",
      scrollBeyondLastLine: false,
      smoothScrolling: true,
      mouseWheelZoom: true,
      wordWrap: "on",
      wrappingIndent: "indent",
      quickSuggestions: { other: true, comments: false, strings: false },
      quickSuggestionsDelay: 50,
      parameterHints: { enabled: true, cycle: true },
      snippetSuggestions: "inline",
      suggestOnTriggerCharacters: true,
      acceptSuggestionOnEnter: "on",
      renderWhitespace: "boundary",
      renderControlCharacters: true,
      renderIndentGuides: true,
      highlightActiveIndentGuide: true,
      bracketPairColorization: { enabled: true },
      colorDecorators: true,
      codeLens: true,
      lightbulb: { enabled: true },
      inlayHints: { enabled: true },
      links: true,
      multiCursorModifier: "ctrlCmd",
      minimap: { enabled: false },
      target: monaco.languages.typescript.ScriptTarget.ES2020,
      module: monaco.languages.typescript.ModuleKind.CommonJS,
      allowNonTsExtensions: true,
    });

    this._isReady = true;
    this._pendingValue = "";

    // 設置事件監聽器
    this._setupEventListeners();

    // 應用類型定義
    if (this._typeDefs) {
      this._applyTypeDefs();
    }

    // 觸發準備完成事件
    this.dispatchEvent(
      new CustomEvent("monaco-ready", {
        detail: { editor: this._editor },
      })
    );
  }

  // 設置事件監聽器
  _setupEventListeners() {
    if (!this._editor) {
      return;
    }

    // 內容變更監聽
    this._changeListener = this._editor.onDidChangeModelContent((e) => {
      this._handleContentChange(e);
    });

    // Ctrl/Cmd+S 快捷鍵
    this._saveCommand = this._editor.addCommand(
      monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS,
      () => this._handleSaveCommand()
    );
  }

  // 處理內容變更
  _handleContentChange(event) {
    const newValue = this._editor.getValue();

    // 觸發內容變更事件
    this.dispatchEvent(
      new CustomEvent("content-changed", {
        detail: {
          value: newValue,
          event,
          itemCommand: this._itemCommand,
        },
      })
    );

    // 自動保存草稿（如果有 itemCommand）
    if (this._itemCommand && typeof window.saveDraft === "function") {
      window.saveDraft({
        command: this._itemCommand,
        script: newValue,
      });
    }
  }

  // 處理儲存快捷鍵
  _handleSaveCommand() {
    this.dispatchEvent(
      new CustomEvent("save-triggered", {
        detail: {
          value: this._editor.getValue(),
          itemCommand: this._itemCommand,
        },
      })
    );
  }

  // 設置 ResizeObserver
  _setupResizeObserver() {
    if (typeof ResizeObserver !== "undefined") {
      this._resizeObserver = new ResizeObserver(() => {
        this._handleResize();
      });
      this._resizeObserver.observe(this);
    }

    // Fallback: window resize 事件
    window.addEventListener("resize", this._handleResize);
  }

  // 處理大小調整
  _handleResize() {
    if (this._editor && this._isReady) {
      // 延遲調整佈局，避免頻繁調用
      if (this._resizeTimer) {
        clearTimeout(this._resizeTimer);
      }
      this._resizeTimer = setTimeout(() => {
        this._editor.layout();
      }, 100);
    }
  }

  // 決定編輯器主題
  _getTheme() {
    return document.body.classList.contains("vscode-light") ? "vs" : "vs-dark";
  }

  // 更新主題
  updateTheme() {
    if (this._editor && this._isReady) {
      monaco.editor.setTheme(this._getTheme());
    }
  }

  // 應用類型定義
  _applyTypeDefs() {
    if (!this._typeDefs || !monaco) {
      return;
    }

    try {
      if (this._typeDefs.node) {
        this._typeDefs.node.forEach((lib) => {
          monaco.languages.typescript.javascriptDefaults.addExtraLib(
            lib.content,
            lib.path
          );
        });
      }

      if (this._typeDefs.vscode) {
        monaco.languages.typescript.javascriptDefaults.addExtraLib(
          this._typeDefs.vscode,
          "file:///vscode.d.ts"
        );
      }

      if (this._typeDefs.sbh) {
        monaco.languages.typescript.javascriptDefaults.addExtraLib(
          this._typeDefs.sbh,
          "file:///sbh.d.ts"
        );
      }
    } catch (error) {
      console.warn("Failed to apply type definitions:", error);
    }
  }

  // 清理資源
  _cleanup() {
    // 清理 ResizeObserver
    if (this._resizeObserver) {
      this._resizeObserver.disconnect();
      this._resizeObserver = null;
    }

    // 清理 resize 事件監聽器
    window.removeEventListener("resize", this._handleResize);

    // 清理 resize timer
    if (this._resizeTimer) {
      clearTimeout(this._resizeTimer);
      this._resizeTimer = null;
    }

    // 清理編輯器事件監聽器
    if (this._changeListener) {
      this._changeListener.dispose();
      this._changeListener = null;
    }

    if (this._saveCommand) {
      this._saveCommand.dispose();
      this._saveCommand = null;
    }

    // 清理編輯器實例
    if (this._editor) {
      this._editor.dispose();
      this._editor = null;
    }

    this._isReady = false;
  }

  // 公開方法

  /**
   * 獲取編輯器實例
   * @returns {monaco.editor.IStandaloneCodeEditor|null}
   */
  getEditor() {
    return this._editor;
  }

  /**
   * 刷新編輯器佈局
   */
  layout() {
    if (this._editor && this._isReady) {
      this._editor.layout();
    }
  }

  /**
   * 聚焦編輯器
   */
  focus() {
    if (this._editor && this._isReady) {
      this._editor.focus();
    }
  }

  /**
   * 設置編輯器內容（不觸發變更事件）
   * @param {string} value
   */
  setValue(value) {
    if (this._editor && this._isReady) {
      this._editor.setValue(value || "");
    } else {
      this._pendingValue = value || "";
    }
    this._value = value || "";
  }

  /**
   * 插入文字到游標位置
   * @param {string} text
   */
  insertText(text) {
    if (this._editor && this._isReady) {
      const selection = this._editor.getSelection();
      const range = new monaco.Range(
        selection.startLineNumber,
        selection.startColumn,
        selection.endLineNumber,
        selection.endColumn
      );
      this._editor.executeEdits("insert-text", [
        {
          range,
          text,
          forceMoveMarkers: true,
        },
      ]);
    }
  }

  /**
   * 取得選取的文字
   * @returns {string}
   */
  getSelectedText() {
    if (this._editor && this._isReady) {
      const selection = this._editor.getSelection();
      return this._editor.getModel().getValueInRange(selection);
    }
    return "";
  }
}

// 註冊 Web Component
customElements.define("monaco-editor", MonacoEditorComponent);

// 全域暴露給舊程式碼使用
if (typeof window !== "undefined") {
  window.MonacoEditorComponent = MonacoEditorComponent;
}
