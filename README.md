# Status Bar Helper

[English](README.md) | [繁體中文](README.tw.md)

This is an extension that lets you add custom buttons to the VS Code status bar. You can write JavaScript scripts, or integrate with the VS Code API and native Node.js modules, to create a wide variety of unique and practical features.

## ✨ Key Features

- **Custom Buttons**: Create exclusive buttons in the status bar that execute custom JavaScript scripts when clicked.
- **Auto-execution**: Support for automatically triggering specified scripts when VS Code starts.
- **Built-in Monaco Editor**: Provides advanced editing features including syntax highlighting and intelligent suggestions.
- **Data Access API**: Access Storage and File system through extension API for convenient data management.
- **Independent VM Execution**: Each script runs in an independent Node.js VM environment without interference, using only native Node modules.
- **Security & Isolation**: Scripts execute in a controlled environment, avoiding impact on VS Code stability and security.
- **Intuitive Icon Interface**: All action buttons use consistent VS Code Codicons for a clean and user-friendly experience.


## Sponsor the Author

If you find this tool useful, feel free to buy the author a coffee. Thank you for your support!

<a href="https://www.buymeacoffee.com/Joe.lin" target="_blank"><img src="https://cdn.buymeacoffee.com/buttons/v2/default-yellow.png" alt="Buy Me A Coffee" style="height: 60px !important;width: 217px !important;" ></a>


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
  ![Commands](https://raw.githubusercontent.com/JiaHongL/status-bar-helper/main/image/image-3_1.png)
  
- **Gear button in bottom right** — Quick access to settings page  
  ![Commands](https://raw.githubusercontent.com/JiaHongL/status-bar-helper/main/image/image-3_2.png)

---

## 🎯 Built-in Examples

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

## Script Development Guide (For AI Model Reference)

If you want to automatically generate scripts for use with Status Bar Helper via AI, you can refer to this prompt. It will clearly guide the AI to write scripts that conform to the extension's supported specifications and can run correctly in the environment. [Click here to view](https://github.com/JiaHongL/status-bar-helper/blob/main/docs/generate-script.prompt.md)

---

## StatusBarHelper.v1 API

[API definition](https://github.com/JiaHongL/status-bar-helper/blob/main/types/status-bar-helper/sbh.d.ts)

---

## 💡 Note

This extension allows running custom scripts, which are written or provided by users themselves, offering great flexibility and automation. Please only use scripts from trusted or verified sources to ensure safety and stability; any issues or risks are the sole responsibility of the user.

---

Made with ❤️ by **[Joe]**
