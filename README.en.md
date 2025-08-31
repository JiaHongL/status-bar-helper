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
- script store (to be added later with more sample scripts) for direct installation or updates.
- local storage backup with manual or scheduled backups, and restore functionality.

![alt text](https://raw.githubusercontent.com/JiaHongL/status-bar-helper/main/image/image-1_1.png)

![alt text](https://raw.githubusercontent.com/JiaHongL/status-bar-helper/main/image/image-1_2.png)

![alt text](https://raw.githubusercontent.com/JiaHongL/status-bar-helper/main/image/image-1_3.png)

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

## StatusBarHelper.v1 API

[API definition](https://github.com/JiaHongL/status-bar-helper/blob/main/types/status-bar-helper/sbh.d.ts)

---

Made with ❤️ by **[Joe]**

---