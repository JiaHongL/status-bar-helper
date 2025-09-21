# Status Bar Helper — Script Development Guide (For AI Model Use)

## Essential Reference Documents (**Model Must Attempt to Read and Understand**)

The following four documents **the model should first attempt to read and understand** (if the environment has network access). After reading, the model must be able to implement scripts according to the types and API specifications found in these documents.

1.  SBH README (Package Overview)  
    [https://github.com/JiaHongL/status-bar-helper/blob/main/README.md](https://github.com/JiaHongL/status-bar-helper/blob/main/README.md)

    - Purpose: To understand the overall design goals of Status Bar Helper, how scripts are loaded and executed, and common use cases (e.g., triggers, sidebar, storage, etc.).

2.  SBH Type Definitions (SBH's Own API Types — **raw file**, must-read)  
    [https://raw.githubusercontent.com/JiaHongL/status-bar-helper/refs/heads/main/types/status-bar-helper/sbh.d.ts](https://raw.githubusercontent.com/JiaHongL/status-bar-helper/refs/heads/main/types/status-bar-helper/sbh.d.ts)

    - Purpose: To directly reference the `statusBarHelper.v1` type definitions (including `storage`, `files`, `secret`, `sidebar`, `vm`, etc.) to avoid generating code that does not conform to the actual API.
    - Key points you need to "understand" (summarized from `sbh.d.ts`):
      - `storage`: Two-level access (`global` / `workspace`), each providing Promise APIs like `get(key, default?)`, `set`, `remove`, and `keys()` for persistent key/value storage (note that `workspace` may not be available if no workspace is open).
      - `files`: Provides full file I/O (`dirs()`, `readText`/`writeText`, `readJSON`/`writeJSON`, `readBytes`/`writeBytes`, `exists`, `list`, `listStats`, `remove`, `clearAll`). All are Promises and require a `scope: 'global' | 'workspace'` and a relative path.
      - `secret`: Encrypted storage for sensitive data (`get` / `set` / `delete` / `keys()`), used for storing tokens or secrets.
      - `sidebar`: Sidebar/webview management (`open(spec)` can accept raw HTML or `{ html?, focus?, onClose? }`; has `postMessage`, `onMessage(handler)` (returns a disposable), `close()`, and `onClose(handler)`; if a session already exists, `open` will replace the old session and trigger the old session's `onClose('replaced')`).
      - `vm`: VM lifecycle and inter-script communication (`stop` / `onStop` / `reason` / `stopByCommand`, `open(cmdId, payload?)`, `sendMessage`, `onMessage`). **Note: The type file does not provide any display methods (e.g., the previously assumed `vm.setLabel` does not exist) — the VM is primarily responsible for execution control and message passing.**

3.  VS Code d.ts (Official VS Code API Reference)  
    [https://raw.githubusercontent.com/microsoft/vscode/refs/heads/main/src/vscode-dts/vscode.d.ts](https://raw.githubusercontent.com/microsoft/vscode/refs/heads/main/src/vscode-dts/vscode.d.ts)

    - Purpose: To confirm which `vscode` APIs can be safely used in extensions/scripts (e.g., `commands.executeCommand`、`window.showInformationMessage`、`workspace.workspaceFolders`、`window.showInputBox`、`window.showQuickPick` etc.), using these official APIs as a fallback for display or workspace operations when necessary.

4.  Node.js Types (DefinitelyTyped — types/node v22)  
    [https://github.com/DefinitelyTyped/DefinitelyTyped/tree/master/types/node/v22](https://github.com/DefinitelyTyped/DefinitelyTyped/tree/master/types/node/v22)

    - Purpose: To confirm the signatures of the Node built-in modules that will be used (sync vs. async, callback vs. Promise) to avoid API misuse.
    - Limited scope principle (**do not attempt to read the entire repo**): Read only the type files directly related to script implementation, such as `child_process.d.ts`, `fs.d.ts`, `path.d.ts`, `os.d.ts`, `process.d.ts`, `crypto.d.ts`, `timers.d.ts`, `stream.d.ts`.
    - The d.ts is based on Node v22 by default, but execution follows the user's environment (Node v18 ~ v24). When writing code, please follow the syntax and APIs of the actual Node version.

5.  SBH Default Script Reference

    - [https://raw.githubusercontent.com/JiaHongL/status-bar-helper/refs/heads/main/src/default-items.ts](https://raw.githubusercontent.com/JiaHongL/status-bar-helper/refs/heads/main/src/default-items.ts)

---

## 1. How to Import Related Modules for Scripts

```js
const vscode = require("vscode");
const { storage, files, vm, sidebar } = statusBarHelper.v1;
const {
  setTimeout,
  clearTimeout,
  setInterval,
  clearInterval,
} = require("timers");
const { randomUUID } = require("crypto");
const fs = require("fs");
const path = require("path");
const { exec, spawn } = require("child_process");
const util = require("util");
const fsp = require("fs").promises;
```

Key points:

- Please refer to the import method above. Since the script runs in a Node.js environment, you must use `require()`.
- After writing your script, remember to check that any modules you use are imported at the top of the file.

---

## 2. Demonstrating statusBarHelper.v1.vm

```js
const vscode = require("vscode");
const { vm } = statusBarHelper.v1;

(function main() {
  const SELF = "sbh.demo.vmChatA";
  const PEER = "sbh.demo.vmChatB";
  let panel;

  vm.onStop(() => {
    try {
      panel?.dispose();
    } catch {}
  });

  function ensurePanel() {
    if (panel) return panel;
    panel = vscode.window.createWebviewPanel(
      "sbhVmChatA",
      "VM Chat A",
      vscode.ViewColumn.Active,
      { enableScripts: true, retainContextWhenHidden: true }
    );
    panel.onDidDispose(() => {
      try {
        vm.stop();
      } catch {}
    });
    return panel;
  }

  vm.onMessage((from, payload) => {
    if (from !== PEER) return;
    console.log("[B → me]", payload);
  });

  ensurePanel();
  console.log("[system] Chat A ready");
})();
```

Key points:

- `vm.open` / `vm.sendMessage` / `vm.onMessage` → inter-VM messaging
- `vm.stopByCommand` / `vm.stop` → stopping a specified or self-VM
- `vm.onStop` → cleaning up resources (e.g., closing a WebviewPanel)
- If you are running a one-time script without opening any `createWebviewPanel()` or `sidebar.open()`, remember to call vm.stop() at the end to terminate the script.
- If the script uses `createWebviewPanel()` or `sidebar.open()`, you do not need to call vm.stop(), because vm.stop() will also close the webviewPanel or sidebar.

---

## 3. Demonstrating statusBarHelper.v1.secret / statusBarHelper.v1.storage / statusBarHelper.v1.files

```js
const { secret, storage, files, vm } = statusBarHelper.v1;

(async () => {
  await secret.set("github.token", "ghp_xxx...");
  console.log("token =", await secret.get("github.token"));

  await storage.global.set("demo.keep", { ts: Date.now() });
  console.log(await storage.global.get("demo.keep"));

  const txtRel = "demo/notes/hello.txt";
  await files.writeText("global", txtRel, "hello");
  console.log(await files.readText("global", txtRel));

  vm.stop();
})();
```

Key points:

- `secret.set`/`get`/`delete`/`keys` → storing tokens or sensitive information
- `storage.global` and `storage.workspace` → key/value storage
- `files.readText`/`writeText`/`readJSON`/`writeJSON`/`readBytes`/`writeBytes` → file access
- `files.exists`/`list`/`listStats`/`remove` → file management
- If you want to read files within the project, please use `vscode.workspace.fs` instead of `statusBarHelper.v1.files`

---

## 4. Demonstrating workspaceFolders + exec

```js
const vscode = require("vscode");
const { exec } = require("child_process");
const { vm } = statusBarHelper.v1;

const workspaceFolders = vscode.workspace.workspaceFolders;
if (workspaceFolders && workspaceFolders.length > 0) {
  const cwd = workspaceFolders[0].uri.fsPath;
  exec("git add .", { cwd }, (err) => {
    if (err) vscode.window.showErrorMessage("Git Add failed");
    else vscode.window.showInformationMessage("✅ git add . successful");
    vm.stop();
  });
}
```

Key points:

- Use `workspaceFolders[0].uri.fsPath` as `cwd`.
- Use `child_process.exec` to execute Git or shell commands.
- Use `vscode.window.showInformationMessage` / `showErrorMessage` to display results.

---

## 5. Demonstrating createWebviewPanel

```js
const panel = vscode.window.createWebviewPanel(
  "sbhWeather",
  "Weather",
  vscode.ViewColumn.Active,
  { enableScripts: true, retainContextWhenHidden: true }
);
const nonce = Math.random().toString(36).slice(2);
panel.webview.html = `
  <meta http-equiv="Content-Security-Policy"
    content="default-src 'none'; img-src data:; style-src 'unsafe-inline'; script-src 'nonce-${nonce}';">
  <script nonce="${nonce}">console.log('ok');</script>
`;
```

Key points:

- `createWebviewPanel(viewType, title, column, options)`
- Inject HTML with `panel.webview.html`.
- CSP must be set with `<meta http-equiv="Content-Security-Policy" …>`.
- The `<script>` tag must include `nonce="${nonce}"`.
- Use `vm.onStop` and `panel.onDidDispose` to clean up resources.

---

## 6. Demonstrating statusBarHelper.v1.sidebar

Key points: `sidebar.open()`, `postMessage`, `onMessage`, synchronous closing.

```js
const { sidebar, vm } = statusBarHelper.v1;
const vscode = require("vscode");

await sidebar.open({ html: "<h3>Sidebar Demo</h3>", onClose: () => vm.stop() });

const panel = vscode.window.createWebviewPanel(
  "sbh.tab",
  "Demo Tab",
  vscode.ViewColumn.Active,
  { enableScripts: true }
);

// Relay message
sidebar.onMessage((m) => panel.webview.postMessage(m));
panel.webview.onDidReceiveMessage((m) => sidebar.postMessage(m));
```

Key points:

- `sidebar.open({ html, onClose })` → opens the sidebar.
- `sidebar.postMessage` / `sidebar.onMessage` → communicates with the VM or WebviewPanel.
- `sidebar.close` / `sidebar.onClose` → closes and listens for close events.
- Can be combined with `vscode.window.createWebviewPanel` for two-way interaction.

---

## 7. Demonstrating createStatusBarItem / showInputBox / showQuickPick

```js
const vscode = require("vscode");
const { vm } = statusBarHelper.v1;

(function () {
  const item = vscode.window.createStatusBarItem(
    vscode.StatusBarAlignment.Right,
    1000
  );
  item.text = "🍅 25:00";
  item.command = "sbh.demo.pomodoro";
  item.show();

  vscode.commands.registerCommand("sbh.demo.pomodoro", async () => {
    const choice = await vscode.window.showQuickPick([
      "Start",
      "Custom…",
      "Close",
    ]);
    if (choice === "Custom…") {
      const minutes = await vscode.window.showInputBox({
        prompt: "Enter minutes",
        value: "25",
      });
      vscode.window.showInformationMessage(`Start ${minutes} min`);
    }
  });

  vm.onStop(() => item.dispose());
})();
```

Key points:

- `createStatusBarItem` → creates a custom status bar item.
- `showQuickPick` → dynamic menu.
- `showInputBox` → custom input (including `validateInput`).
- Can be combined with `setInterval` to implement tools like a pomodoro timer.

---

## 8. Demonstrating withProgress / activeTab.input

Combined example:

```js
const vscode = require("vscode");
const { vm } = statusBarHelper.v1;

(async () => {
  await vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      title: "Processing...",
      cancellable: false,
    },
    async (progress) => {
      progress.report({ message: "Analyzing the current active tab" });
      await new Promise((r) => setTimeout(r, 1000));
      const active = vscode.window.tabGroups.activeTabGroup?.activeTab?.input;
      console.log("active tab input =", active);
    }
  );
  vm.stop();
})();
```

Key points:

- `withProgress({ location, title }, task)` → displays progress for long-running tasks.
- `tabGroups.activeTabGroup?.activeTab?.input` → gets information about the active tab (file or Webview).

---

## 9. Demonstrating vscode.commands.executeCommand

```js
const vscode = require("vscode");
const { vm } = statusBarHelper.v1;

(async () => {
  try {
    // Execute VS Code's built-in "toggle light/dark themes" command
    await vscode.commands.executeCommand(
      "workbench.action.toggleLightDarkThemes"
    );
  } catch (e) {
    // If the execution fails, show an error message
    vscode.window.showErrorMessage("Toggle theme failed: " + (e?.message || e));
  } finally {
    // Whether successful or not, the script must stop the VM at the end
    vm.stop();
  }
})();
```

Key points:

- `vscode.commands.executeCommand(commandId, ...args)` → executes a VS Code command.

---

## Others

- Pay special attention to the use of CSP and `nonce`.
  - CSP must be set with `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data:; style-src 'unsafe-inline'; script-src 'nonce-xxxx';">`.
  - `<script nonce="${nonce}">` is paired with `const nonce = Math.random().toString(36).slice(2);`.
  - To use the VS Code API, you must call `const vscode = acquireVsCodeApi();` inside the script.
- If you use string templates in HTML, be careful to escape backticks and `${}`, for example:

```js
const panel = vscode.window.createWebviewPanel(
  "demo",
  "Demo",
  vscode.ViewColumn.Active,
  { enableScripts: true }
);
const nonce = Math.random().toString(36).slice(2);
panel.webview.html = `
  <meta http-equiv="Content-Security-Policy"
    content="default-src 'none'; img-src data:; style-src 'unsafe-inline'; script-src 'nonce-${nonce}';">
  <script nonce="${nonce}">
    const vscode = acquireVsCodeApi();
    const msg = 'Hello from Webview';
    console.log(msg);
    vscode.postMessage({ type: 'greet', text: msg });
  </script>
`;
```

Please read the reference documents above. I will then provide the script requirements. Please produce executable script code according to the API and type specifications in the documents.

If you are ready, please reply with "Please begin," and I will then provide the requirements.
