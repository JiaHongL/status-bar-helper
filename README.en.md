# Status Bar Helper

[English](README.en.md) | [繁體中文](README.md)

A VS Code extension that allows you to add custom buttons to the status bar. You can write JavaScript scripts and integrate with VS Code APIs to create unique and practical features.

## ✨ Key Features

- **Custom Buttons**: Create exclusive buttons in the status bar that execute custom JavaScript scripts when clicked.
- **Auto-execution**: Support for automatically triggering specified scripts when VS Code starts.
- **Built-in Monaco Editor**: Provides advanced editing features including syntax highlighting and intelligent suggestions.
- **Data Access API**: Access Storage and File system through extension API for convenient data management.
- **Independent VM Execution**: Each script runs in an independent Node.js VM environment without interference, using only native Node modules.
- **Security & Isolation**: Scripts execute in a controlled environment, avoiding impact on VS Code stability and security.
- **Script Store (Phase 1 + Remote Preview)**: Browse curated sample scripts (local + remote fallback), view diffs (text / tooltip / tags / script), install or bulk install with rollback safety, detect updates via hash signature, NEW badge indicator showing available script counts, and modern UI with confirmation dialogs.
- **Intuitive Icon Interface**: All action buttons use consistent VS Code Codicons for a clean and user-friendly experience.

## 📖 Usage Guide

### Settings Page

On this page, you can manage status bar items with an intuitive icon-based interface:

- Show/hide status bar buttons.
- Add, edit, delete status bar items (using icon buttons).
- View running status in real-time (green dot/count).
- Toggle visibility in status bar and auto-execution on startup.
- Copy cmdId
- One-click Run/Stop to control script execution status (icon buttons).
- Manage global and workspace data stored by the extension (including deletion and size display).

![Settings Page](https://raw.githubusercontent.com/JiaHongL/status-bar-helper/main/image/image-1.png)

### Editor Page

On this page, you can write and test status bar item scripts with a clean icon-based interface:

- **Icon-based Action Buttons**: Run/Stop/Save/Cancel buttons feature intuitive icon design.
- **Focused Core Editing**: Only retain icon, label, tooltip, and script editing functions for a cleaner interface.
- Built-in Monaco editor with support for native Node modules and VS Code API.
- Output panel below shows real-time script output and execution status (success/failure/VM closed).
- Output panel can be hidden or resized by dragging.
- Perfect for rapid development and debugging of custom features.

![Editor Page](https://raw.githubusercontent.com/JiaHongL/status-bar-helper/main/image/image-2.png)

---

## 🔧 Commands & Shortcuts

- **Status Bar Helper: Settings** — Open settings page from command palette
- **Gear button in bottom right** — Quick access to settings page

![Commands](https://raw.githubusercontent.com/JiaHongL/status-bar-helper/main/image/image-3.png)

---

## 🎯 Built-in Examples

### Script Store

The Script Store aggregates curated examples defined in `script-store.defaults.<locale>.json` (currently `en` & `zh-tw`).

Features:

- Remote-first with GitHub raw fetch (3s timeout / 256KB limit) → fallback to packaged JSON
- Locale resolution via `vscode.env.language` (only `zh-tw` / `zh-hant` → Traditional Chinese; others → English)
- **NEW Badge Indicator**: Script Store button displays count of new scripts with visual update hints
- Status badges: NEW / INSTALLED / UPDATE (hash of script + text + tooltip + tags)
- **Status Priority Sorting**: New > Update > Installed order
- Per-item or bulk install (bulk is atomic: any failure rolls back all)
- **Batch Install Confirmation**: Displays detailed item list confirmation before installation
- **Improved Diff UX**: Bottom button layout (Cancel/Update), eliminating confusing simultaneous dialogs
- **Icon-based Actions**: View/Install/Update/Remove with intuitive icon design
- **Modern Color System**: Gradient backgrounds and theme-adaptive status badges
- Safety filters: reject scripts containing `eval(`, `new Function`, or excessive `process.env` access
- 5‑minute in-memory catalog cache (future: ETag planned)

Planned (Phase 2): remote catalog ETag cache, `scriptUrl` lazy loading, richer token diff, user locale override.

This extension comes with several practical examples to help you get started quickly:

- **Minimal Log Demo**: Demonstrates how to use VS Code + Node.js APIs, including file access, workspace information retrieval, and output display.
- **Git Add**: Example of executing terminal commands from VS Code extension (git add .) with proper error handling.
- **Storage Demo**: Shows how to use the custom statusBarHelper API for:
  - Key-value storage (global/workspace)
  - File operations (readText, writeText, readJSON, writeJSON, readBytes, writeBytes)
  - Directory management (list, listStats, exists, remove)
  - clearAll(scope): Clear all files in the specified scope
- **Toggle Light/Dark Mode**: Demonstrates how to convert VS Code commands into status bar buttons for quick theme switching.

![Demo 1](https://raw.githubusercontent.com/JiaHongL/status-bar-helper/main/image/01.gif)

- **Board**: Demonstrates how to use VS Code Webview to create custom interactive interfaces.

![Demo 2](https://raw.githubusercontent.com/JiaHongL/status-bar-helper/main/image/02.gif)

- **Pomodoro**: Demonstrates combining status bar with showQuickPick to create a simple Pomodoro timer.

![Demo 3](https://raw.githubusercontent.com/JiaHongL/status-bar-helper/main/image/03.gif)

---

## StatusBarHelper.v1 API Definition

```javascript
/**
 * StatusBarHelper API Definition
 * Provides scripts with: key-value storage (global/workspace), file read/write (global/workspace), and VM control.
 */
interface StatusBarHelper {
  v1: {
    // ─────────────────────────────────────────────────────────
    // Storage Management (key-value style, serialized storage; suitable for small-medium settings/data)
    // ─────────────────────────────────────────────────────────
    storage: {
      /** Global storage (shared across all workspaces). Suitable for user preferences, shared settings, etc. */
      global: {
        /**
         * Read value for specified key.
         * @param key Key name
         * @param def (Optional) Default value; returned when key doesn't exist (otherwise returns undefined)
         * @returns Stored value or undefined (or def)
         */
        get<T>(key: string, def?: T): Promise<T | undefined>;
        /**
         * Write value for specified key.
         * @param key Key name
         * @param value Value to store (can be serializable object)
         */
        set<T>(key: string, value: T): Promise<void>;
        /**
         * Delete specified key.
         * @param key Key name
         */
        remove(key: string): Promise<void>;
        /**
         * Get list of all existing keys.
         * @returns Array of strings
         */
        keys(): Promise<string[]>;
      };

      /** Workspace storage (limited to currently opened Workspace). Suitable for project-specific state or settings. */
      workspace: {
        /**
         * Read value for specified key.
         * @param key Key name
         * @param def (Optional) Default value; returned when key doesn't exist (otherwise returns undefined)
         * @returns Stored value or undefined (or def)
         */
        get<T>(key: string, def?: T): Promise<T | undefined>;
        /**
         * Write value for specified key.
         * @param key Key name
         * @param value Value to store (can be serializable object)
         */
        set<T>(key: string, value: T): Promise<void>;
        /**
         * Delete specified key.
         * @param key Key name
         */
        remove(key: string): Promise<void>;
        /**
         * Get list of all existing keys.
         * @returns Array of strings
         */
        keys(): Promise<string[]>;
      };
    };

    // ─────────────────────────────────────────────────────────
    // File Operations (for global/workspace SBH-specific folders)
    // Suitable for larger data, binary data, or scenarios requiring directory hierarchy.
    // All paths use relativePath "relative to respective root directory".
    // ─────────────────────────────────────────────────────────
    files: {
      /**
       * Get absolute paths of both storage root directories.
       * @returns { global, workspace } (workspace is null when no workspace)
       */
      dirs(): Promise<{ global: string; workspace: string | null }>;

      /**
       * Read UTF-8 plain text file.
       * @param scope 'global' or 'workspace'
       * @param relativePath Relative path under storage root directory
       * @returns File content string
       */
      readText(scope: 'global' | 'workspace', relativePath: string): Promise<string>;

      /**
       * Write UTF-8 plain text file (overwrite).
       * Creates parent folders automatically if they don't exist.
       * @param scope 'global' or 'workspace'
       * @param relativePath Relative path under storage root directory
       * @param content File content
       */
      writeText(scope: 'global' | 'workspace', relativePath: string, content: string): Promise<void>;

      /**
       * Read JSON file and deserialize to object.
       * @param scope 'global' or 'workspace'
       * @param relativePath Relative path
       * @returns Deserialized data
       */
      readJSON<T>(scope: 'global' | 'workspace', relativePath: string): Promise<T>;

      /**
       * Write JSON file (overwrite).
       * @param scope 'global' or 'workspace'
       * @param relativePath Relative path
       * @param data Any serializable data
       */
      writeJSON(scope: 'global' | 'workspace', relativePath: string, data: any): Promise<void>;

      /**
       * Read byte file, returns Uint8Array.
       * @param scope 'global' or 'workspace'
       * @param relativePath Relative path
       */
      readBytes(scope: 'global' | 'workspace', relativePath: string): Promise<Uint8Array>;

      /**
       * Write byte file (overwrite).
       * @param scope 'global' or 'workspace'
       * @param relativePath Relative path
       * @param data Can be Uint8Array, ArrayBuffer, or base64 string
       */
      writeBytes(
        scope: 'global' | 'workspace',
        relativePath: string,
        data: Uint8Array | ArrayBuffer | string
      ): Promise<void>;

      /**
       * Check if file or directory exists.
       * @param scope 'global' or 'workspace'
       * @param relativePath Relative path
       * @returns true if exists
       */
      exists(scope: 'global' | 'workspace', relativePath: string): Promise<boolean>;

      /**
       * List directory contents (non-recursive).
       * @param scope 'global' or 'workspace'
       * @param relativePath (Optional) Directory to list
       * @returns name and type ('directory' | 'file')
       */
      list(
        scope: 'global' | 'workspace',
        relativePath?: string
      ): Promise<{ name: string; type: 'directory' | 'file' }[]>;

      /**
       * Recursively list all files with sizes (bytes), returns relative path rel.
       * @param scope 'global' or 'workspace'
       * @param relativePath (Optional) Starting directory
       */
      listStats(
        scope: 'global' | 'workspace',
        relativePath?: string
      ): Promise<{ name: string; type: 'file'; size: number; rel: string }[]>;

      /**
       * Delete single file or empty directory.
       * @param scope 'global' or 'workspace'
       * @param relativePath Relative path
       */
      remove(scope: 'global' | 'workspace', relativePath: string): Promise<void>;

      /**
       * Clear all contents under the scope root directory (only deletes contents, not root).
       * Use with caution.
       * @param scope 'global' or 'workspace'
       */
      clearAll(scope: 'global' | 'workspace'): Promise<void>;
    };

    // ─────────────────────────────────────────────────────────
    // VM (Script Execution Environment) Control
    // Allows scripts to actively stop themselves or listen for external stop events.
    // ─────────────────────────────────────────────────────────
    vm: {
      /**
       * Actively stop current VM.
       * @param reason (Optional) Stop reason object or string, will appear in onStop callback.
       */
      stop(reason?: any): void;

      /**
       * Called when this VM is stopped externally (or already stopped).
       * - If VM is already stopped, callback will be triggered once in next microtask.
       * - Returned function can unsubscribe.
       * @param cb Handler function to call when stopped (can get reason)
       * @returns Unsubscribe function
       */
      onStop(cb: (reason?: any) => void): () => void;

      /**
       * Get last stop reason (may be undefined if not stopped yet).
       */
      reason(): any;

      /**
       * Current VM's command name (corresponds to your status bar item command).
       */
      command: string;

      /**
       * Stop a VM by command name (or self).
       * @param cmd (Optional) Command to stop; if not provided, equivalent to stopping self
       * @param reason (Optional) Stop reason
       */
      stopByCommand(cmd?: string, reason?: any): void;

      /**
       * Open (start) another command's corresponding script (if not already running).
       * If already running and payload is provided, sends as message.
       * @param cmdId Target script's command Id
       * @param payload (Optional) First message to send after startup
       */
      open(cmdId: string, payload?: any): Promise<void>;

      /**
       * Send message to another running VM (if target hasn't registered onMessage, will queue until registered).
       * @param targetCmdId Target VM's command Id
       * @param message Data to pass
       */
      sendMessage(targetCmdId: string, message: any): void;

      /**
       * Listen for messages from other VMs, returns unsubscribe function.
       * @param handler Handler function (fromCmdId, message)
       * @returns unsubscribe function
       */
      onMessage(handler: (fromCmdId: string, message: any) => void): () => void;
      
      /**
       * This VM's AbortSignal; you can listen for 'abort' events yourself.
       * Generally recommended to use onStop instead.
       */
      signal: AbortSignal;
    };
  };
}

// ─────────────────────────────────────────────────────────
// Global aliases (choose any one to use in your scripts)
// Example: const { storage, files, vm } = statusBarHelper.v1;
// ─────────────────────────────────────────────────────────
declare const statusBarHelper: StatusBarHelper; // Full name
declare const sbh: StatusBarHelper;             // Short name
declare const SBH: StatusBarHelper;             // Uppercase alias
```

---
