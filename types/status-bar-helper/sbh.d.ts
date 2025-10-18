/**
 * StatusBarHelper API definition
 */
interface StatusBarHelper {
  
  v1: {
    /** Global and workspace storage management */
    storage: {
      /** Global storage (shared across all workspaces) */
      global: {
        /** Get a value from global storage */
        get<T>(key: string, defaultValue?: T): Promise<T | undefined>;
        /** Set a value in global storage */
        set<T>(key: string, value: T): Promise<void>;
        /** Remove a value from global storage */
        remove(key: string): Promise<void>;
        /** Get all keys in global storage */
        keys(): Promise<string[]>;
      };
      /** Workspace storage (only available when a workspace is open) */
      workspace: {
        /** Get a value from workspace storage */
        get<T>(key: string, defaultValue?: T): Promise<T | undefined>;
        /** Set a value in workspace storage */
        set<T>(key: string, value: T): Promise<void>;
        /** Remove a value from workspace storage */
        remove(key: string): Promise<void>;
        /** Get all keys in workspace storage */
        keys(): Promise<string[]>;
      };
    };
    /** File operations for reading/writing files in global/workspace storage */
    files: {
      /** Get absolute paths for global/workspace storage folders */
      dirs(): Promise<{ global: string; workspace: string | null }>;

      /** Read a UTF-8 text file */
      readText(scope: 'global' | 'workspace', relativePath: string): Promise<string>;
      /** Write a UTF-8 text file (overwrites existing) */
      writeText(scope: 'global' | 'workspace', relativePath: string, content: string): Promise<void>;

      /** Read a JSON file */
      readJSON<T>(scope: 'global' | 'workspace', relativePath: string): Promise<T>;
      /** Write a JSON file */
      writeJSON(scope: 'global' | 'workspace', relativePath: string, data: any): Promise<void>;

      /** Read binary file as Uint8Array */
      readBytes(scope: 'global' | 'workspace', relativePath: string): Promise<Uint8Array>;
      /**
       * Write binary file
       * @param data Can be Uint8Array, ArrayBuffer, or base64 string
       */
      writeBytes(scope: 'global' | 'workspace', relativePath: string, data: Uint8Array | ArrayBuffer | string): Promise<void>;

      /** Check if a file or directory exists */
      exists(scope: 'global' | 'workspace', relativePath: string): Promise<boolean>;

      /** List files and directories in a folder */
      list(scope: 'global' | 'workspace', relativePath?: string): Promise<{ name: string; type: 'directory' | 'file' }[]>;
      /** List files with stats (size and relative path) */
      listStats(scope: 'global' | 'workspace', relativePath?: string): Promise<{ name: string; type: 'file'; size: number; rel: string }[]>;

      /** Remove a file or directory */
      remove(scope: 'global' | 'workspace', relativePath: string): Promise<void>;
      /** Clear all files in the given scope */
      clearAll(scope: 'global' | 'workspace'): Promise<void>;
    };
    /** Secret storage for sensitive data (encrypted) */
    secret: {
      /** Get a value from secret storage */
      get<T>(key: string, defaultValue?: T): Promise<T | undefined>;
      /** Set a value in secret storage */
      set<T>(key: string, value: T): Promise<void>;
      /** Delete a value from secret storage */
      delete(key: string): Promise<void>;
      /** Get all keys in secret storage */
      keys(): Promise<string[]>;
    };
    /** Sidebar webview management */
    sidebar: {
      /**
      * Open (or replace) the Sidebar webview.
      *
      * Behavior
      * - If a session is already active, it is replaced and that session’s handlers
      *   are fired with onClose('replaced') (new session’s handler is NOT called).
      * - When focus is false, the HTML is loaded silently without switching
      *   focus to the Sidebar.
      * - You can pass onClose to bind a per-session hook that runs when THIS
      *   session is closed or replaced.
      *
      * @param spec Either a raw HTML string, or an object with:
      *   - html     HTML content to load (default: blank page)
      *   - focus    Whether to focus the sidebar after loading (default: true)
      *   - onClose  Per-session handler: (reason: 'closed' | 'replaced') => void
      */
      open(spec: {
        html?: string;
        focus?: boolean;
        onClose?: (reason: string) => void;
      } | string): Promise<void>;

      /**
       * Send a message from extension → Sidebar webview
       * @param msg Arbitrary JSON-serializable object
       * @returns Promise<boolean> whether the message was delivered
       */
      postMessage(msg: any): Promise<boolean>;

      /**
       * Listen for messages from Sidebar webview → extension
       * @param handler Callback invoked when webview posts a message
       * @returns Disposable to unregister the handler
       */
      onMessage(handler: (msg: any) => void): { dispose(): void };

      /**
       * Close the Sidebar view programmatically.
       * Triggers onClose('closed').
       */
      close(): Promise<void>;
        
      /**
       * Listen for Sidebar being closed (by user or replaced by another open).
       * @param handler Callback invoked on close
       * @returns Disposable to unregister the handler
       */
      onClose(handler: () => void): { dispose(): void };
    };
    /** VM (script instance) management and inter-VM messaging */
    vm: {
      /**
       * Stop the current script's VM from inside the script
       * @param reason Optional reason object or string
       */
      stop(reason?: any): void;
      /**
       * Listen for when this VM is stopped externally
       */
      onStop(cb: (reason?: any) => void): void;
      /**
       * Get the reason for stopping the VM
       */
      reason(): any;
      /**
       * Stop the VM by command
       * @param cmd Optional the command to stop; if not provided, it is equivalent to stopping itself.
       * @param reason Optional reason object or string
       */
      stopByCommand(cmd?: string, reason?: any): void;
      /**
      * Open (start) another script by its command id if not already running, then optionally send an initial payload.
      * If it is already running and payload is provided, the payload is sent as a message.
      * @param cmdId Target command id registered in statusBarHelper.items
      * @param payload Optional initial payload message
      */
      open(cmdId: string, payload?: any): Promise<void>;
      /**
      * Send a message to another running VM (or queue until it registers onMessage).
      * @param targetCmdId Target VM command id
      * @param message Arbitrary serializable data
      */
      sendMessage(targetCmdId: string, message: any): void;
      /**
      * Listen for messages coming from other VMs. Returns an unsubscribe function.
      */
      onMessage(handler: (fromCmdId: string, message: any) => void): () => void;
      /**
       * Get all registered scripts (command, text, tooltip)
       * @returns Promise that resolves to an array of script metadata
       * 
       * @example
       * ```typescript
       * const scripts = await sbh.v1.vm.scripts();
       * scripts.forEach(script => {
       *   console.log(`Command: ${script.command}`);
       *   console.log(`Text: ${script.text}`);
       *   console.log(`Tooltip: ${script.tooltip || 'N/A'}`);
       * });
       * ```
       */
      scripts(): Promise<Array<{
        command: string;
        text: string;
        tooltip?: string;
      }>>;
    };
    /** File explorer right-click action integration */
    explorerAction: {
      /**
       * Register an action to appear in the file explorer context menu
       * 
       * When users right-click on files/folders in the explorer and select
       * "Status Bar Helper", a Quick Pick menu will show all registered actions.
       * 
       * The action will be automatically cleaned up when:
       * - dispose() is called manually
       * - The parent VM script is stopped
       * 
       * @param config Explorer action configuration
       * @returns ExplorerActionHandle for managing the registration lifecycle
       * 
       * @example Basic usage - only description
       * ```typescript
       * await sbh.v1.explorerAction.register({
       *   description: 'Display detailed file information',
       *   handler: async (ctx) => {
       *     vscode.window.showInformationMessage(`File: ${ctx.uri?.fsPath}`);
       *   }
       * });
       * ```
       * 
       * @example With codicon
       * ```typescript
       * await sbh.v1.explorerMenu.register({
       *   description: '$(info) Show File Info',
       *   handler: async (ctx) => {
       *     vscode.window.showInformationMessage(`File: ${ctx.uri?.fsPath}`);
       *   }
       * });
       * ```
       * 
       * @example Multi-selection support
       * ```typescript
       * await sbh.v1.explorerAction.register({
       *   description: '$(rocket) Batch process selected files',
       *   handler: async (ctx) => {
       *     const files = ctx.uris || (ctx.uri ? [ctx.uri] : []);
       *     vscode.window.showInformationMessage(`Processing ${files.length} file(s)`);
       *     // Process each file
       *     for (const fileUri of files) {
       *       console.log('Processing:', fileUri.fsPath);
       *     }
       *   }
       * });
       * ```
       * 
       * @example With cleanup logic
       * ```typescript
       * const conn = await db.connect();
       * 
       * const action = await sbh.v1.explorerAction.register({
       *   description: '$(database) Query file in database',
       *   handler: async (ctx) => {
       *     await conn.query('SELECT * FROM files WHERE path = ?', ctx.uri.fsPath);
       *   }
       * });
       * 
       * action.onDispose(() => {
       *   console.log('Action disposed, closing database');
       *   conn.close();
       * });
       * ```
       * 
       * @example Conditional execution
       * ```typescript
       * await sbh.v1.explorerAction.register({
       *   description: '$(symbol-method) Compile TypeScript file',
       *   handler: async (ctx) => {
       *     // Filter for .ts files
       *     if (!ctx.uri?.fsPath.endsWith('.ts')) {
       *       vscode.window.showWarningMessage('This command only works for .ts files');
       *       return;
       *     }
       *     // Compile logic here
       *     console.log('Compiling:', ctx.uri.fsPath);
       *   }
       * });
       * ```
       */
      register(config: ExplorerActionConfig): Promise<ExplorerActionHandle>;
    };
  };
}

// Global API aliases
declare const statusBarHelper: StatusBarHelper; // Main API
declare const sbh: StatusBarHelper;             // Short alias
declare const SBH: StatusBarHelper;             // Uppercase alias

// ============================================================================
// Explorer Action API Types
// ============================================================================

/**
 * Context information passed to explorer action handlers
 */
interface ExplorerActionContext {
  /** 
   * Primary selected file/folder URI
   * - Single selection: the clicked item
   * - Multi-selection: the item that was right-clicked (focus item)
   */
  uri?: any; // vscode.Uri
  
  /** 
   * All selected URIs when multiple items are selected
   * - Includes all items in the selection (including `uri`)
   * - undefined for single selection
   * 
   * @example Handle both single and multi-selection
   * const files = ctx.uris || (ctx.uri ? [ctx.uri] : []);
   */
  uris?: any[]; // vscode.Uri[]
}

/**
 * Configuration for registering an explorer action
 */
interface ExplorerActionConfig {
  /** 
   * Description shown in the Quick Pick menu
   * Supports Codicons using $(icon) syntax for visual clarity
   * 
   * This is the only required text field - keep it concise but descriptive
   * 
   * @example Simple description
   * 'Display file information'
   * 
   * @example With codicon
   * '$(info) Show File Info'
   * 
   * @example Action-oriented
   * '$(rocket) Batch process files'
   * 
   * @example Specific action
   * '$(database) Query file in database'
   * 
   * @see https://microsoft.github.io/vscode-codicons/dist/codicon.html
   */
  description: string;
  
  /** 
   * Handler function called when the action is selected from Quick Pick
   * Receives context information about the selected files/folders
   * 
   * @example Single file handler
   * handler: async (ctx) => {
   *   if (ctx.uri) {
   *     console.log('Processing:', ctx.uri.fsPath);
   *   }
   * }
   * 
   * @example Multi-selection handler
   * handler: async (ctx) => {
   *   const files = ctx.uris || (ctx.uri ? [ctx.uri] : []);
   *   for (const fileUri of files) {
   *     console.log('Processing:', fileUri.fsPath);
   *   }
   * }
   */
  handler: (context: ExplorerActionContext) => void | Promise<void>;
}

/**
 * Handle returned from explorer action registration
 */
interface ExplorerActionHandle {
  /** 
   * Auto-generated unique identifier for this registration
   * @readonly
   */
  readonly menuId: string;
  
  /** 
   * Unregister this action from the explorer menu
   * Triggers onDispose listeners if registered
   * @returns Promise that resolves when cleanup is complete
   */
  dispose(): Promise<void>;
  
  /**
   * Register a callback to be invoked when this registration is disposed
   * Note: Only triggered when dispose() is explicitly called, not when VM stops
   * @param callback Function to call on disposal
   * @returns Disposable to stop listening
   * 
   * @example
   * const action = await sbh.v1.explorerAction.register({ ... });
   * action.onDispose(() => {
   *   console.log('Explorer action unregistered');
   *   // Clean up resources
   * });
   */
  onDispose(callback: () => void): { dispose(): void };
}