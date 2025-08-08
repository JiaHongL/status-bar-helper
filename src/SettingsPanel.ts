import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { spawn, ChildProcessWithoutNullStreams } from 'child_process';
import * as vm from 'vm';
import * as util from 'util';

export class SettingsPanel {
    public static currentPanel: SettingsPanel | undefined;
    private readonly _panel: vscode.WebviewPanel;
    private readonly _extensionUri: vscode.Uri;
    private _disposables: vscode.Disposable[] = [];

    private _activeView: 'list' | 'edit' = 'list';
    private _editingItem: any = null;
    private _running: ChildProcessWithoutNullStreams | null = null;

    private constructor(panel: vscode.WebviewPanel, extensionUri: vscode.Uri) {
        this._panel = panel;
        this._extensionUri = extensionUri;

        this._panel.onDidDispose(() => this.dispose(), null, this._disposables);

        this._panel.webview.onDidReceiveMessage(
            async (message) => {
                switch (message.command) {
                    case 'updateSettings':
                        await vscode.workspace.getConfiguration('statusBarHelper').update('items', message.items, vscode.ConfigurationTarget.Global);
                        this._activeView = 'list';
                        this._editingItem = null;
                        return;

                    case 'getSettings':
                        this._sendStateToWebview();
                        return;

                    case 'enterEditView':
                        this._activeView = 'edit';
                        this._editingItem = message.item;
                        return;

                    case 'exitEditView':
                        this._activeView = 'list';
                        this._editingItem = null;
                        return;

                    case 'showError':
                        vscode.window.showErrorMessage(message.message);
                        return;

                    case 'exportSettings': {
                        const now = new Date();
                        const yyyy = now.getFullYear();
                        const mm = String(now.getMonth() + 1).padStart(2, '0');
                        const dd = String(now.getDate()).padStart(2, '0');
                        const hh = String(now.getHours()).padStart(2, '0');
                        const mi = String(now.getMinutes()).padStart(2, '0');
                        const ss = String(now.getSeconds()).padStart(2, '0');
                        const defaultName = `status-bar-helper-${yyyy}-${mm}-${dd}-${hh}-${mi}-${ss}.json`;

                        const workspaceFolders = vscode.workspace.workspaceFolders;
                        let defaultUri: vscode.Uri | undefined;
                        if (workspaceFolders?.length) {
                            defaultUri = vscode.Uri.joinPath(workspaceFolders[0].uri, defaultName);
                        }

                        const uri = await vscode.window.showSaveDialog({
                            defaultUri,
                            saveLabel: 'Export Settings',
                            filters: { 'JSON': ['json'] }
                        });
                        if (uri) {
                            fs.writeFileSync(uri.fsPath, JSON.stringify(message.items, null, 2));
                            vscode.window.showInformationMessage('Settings exported successfully.');
                        }
                        return;
                    }

                    case 'importSettings': {
                        const uris = await vscode.window.showOpenDialog({ canSelectMany: false, filters: { 'JSON': ['json'] } });
                        if (uris?.length) {
                            const uri = uris[0];
                            const content = fs.readFileSync(uri.fsPath, 'utf8');
                            try {
                                const items = JSON.parse(content);
                                if (Array.isArray(items)) {
                                    await vscode.workspace.getConfiguration('statusBarHelper').update('items', items, vscode.ConfigurationTarget.Global);
                                    this._sendStateToWebview();
                                    this._panel.webview.postMessage({ command: 'importDone', items });
                                    vscode.window.showInformationMessage('Settings imported successfully.');
                                } else {
                                    vscode.window.showErrorMessage('Invalid file format.');
                                }
                            } catch {
                                vscode.window.showErrorMessage('Error parsing settings file.');
                            }
                        }
                        return;
                    }

                    // ========= Run（子行程，安全模式） =========
                    case 'runScript': {
                        if (this._running) { try { this._running.kill(); } catch {} this._running = null; }
                        const code: string = String(message.code ?? '');

                        const prelude = `
(async () => {
  try {
    // ======= user script start =======
`;
                        const postlude = `
    // ======= user script end =======
  } catch (e) {
    console.error((e && (e.stack || e.message)) || String(e));
    process.exitCode = 1;
  }
})();`;

                        const ws = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? this._extensionUri.fsPath;

                        this._running = spawn(process.execPath, ['-'], { cwd: ws });

                        this._running.stdout.on('data', d => {
                            this._panel.webview.postMessage({ command: 'runLog', chunk: d.toString() });
                        });
                        this._running.stderr.on('data', d => {
                            this._panel.webview.postMessage({ command: 'runLog', chunk: d.toString() });
                        });
                        this._running.on('close', (code) => {
                            this._panel.webview.postMessage({ command: 'runDone', code });
                            this._running = null;
                        });

                        const timeout = setTimeout(() => {
                            if (this._running) {
                                try { this._running.kill(); } catch {}
                                this._running = null;
                            }
                        }, 10000);
                        this._running.on('close', () => clearTimeout(timeout));

                        this._running.stdin.write(prelude + code + postlude);
                        this._running.stdin.end();
                        return;
                    }

                    case 'stopRun': {
                        if (this._running) { try { this._running.kill(); } catch {} this._running = null; }
                        return;
                    }

                    // ========= Run (VS Code)：受信任模式（在 extension host 執行） =========
                    case 'runScriptTrusted': {
                        const code: string = String(message.code ?? '');

                        // 把 console.* 轉寫到 webview Output
                        const writeOut = (...args: any[]) => {
                            const text = args.map(a =>
                                typeof a === 'string' ? a : util.inspect(a, { colors: false, depth: 3 })
                            ).join(' ') + '\n';
                            this._panel.webview.postMessage({ command: 'runLog', chunk: text });
                        };
                        const consoleProxy = {
                            log: (...a: any[]) => writeOut(...a),
                            info: (...a: any[]) => writeOut(...a),
                            warn: (...a: any[]) => writeOut(...a),
                            error: (...a: any[]) => writeOut(...a),
                        };

                        const sandbox: any = {
                            vscode,
                            fs,
                            path,
                            process,
                            console: consoleProxy,
                            __dirname: this._extensionUri.fsPath,
                            setTimeout,
                            clearTimeout,
                            setInterval,
                            clearInterval,
                            Buffer,
                            require: (moduleName: string) => {
                                if (moduleName === 'vscode') return vscode;
                                // 允許 Node 內建模組
                                // @ts-ignore
                                const builtins = (process as any).binding ? require('module').builtinModules : [];
                                if (builtins.includes(moduleName)) return require(moduleName);
                                throw new Error(`Only Node built-in modules are allowed: ${moduleName}`);
                            }
                        };

                        const wrapped = `(async () => {
  try {
${code}
  } catch (e) {
    console.error((e && (e.stack || e.message)) || String(e));
  }
})();`;

                        try {
                            const ret = vm.runInNewContext(wrapped, sandbox);
                            if (ret && typeof (ret as Promise<any>).then === 'function') {
                                await ret;
                            }
                            this._panel.webview.postMessage({ command: 'runDone', code: 0 });
                        } catch (e: any) {
                            writeOut(e && (e.stack || e.message) || String(e));
                            this._panel.webview.postMessage({ command: 'runDone', code: 1 });
                        }
                        return;
                    }
                }
            },
            null,
            this._disposables
        );

        this._panel.onDidChangeViewState(
            e => { if (e.webviewPanel.visible) this._sendStateToWebview(); },
            null,
            this._disposables
        );

        this._update();
    }

    public static createOrShow(extensionUri: vscode.Uri) {
        const column = vscode.window.activeTextEditor
            ? vscode.window.activeTextEditor.viewColumn
            : undefined;

        if (SettingsPanel.currentPanel) {
            SettingsPanel.currentPanel._panel.reveal(column);
            return;
        }

        const panel = vscode.window.createWebviewPanel(
            'statusBarHelperSettings',
            'StatusBar Helper Settings',
            column || vscode.ViewColumn.One,
            {
                enableScripts: true,
                localResourceRoots: [
                    vscode.Uri.joinPath(extensionUri, 'media'),
                    vscode.Uri.joinPath(extensionUri, 'out')
                ]
            }
        );

        SettingsPanel.currentPanel = new SettingsPanel(panel, extensionUri);
    }

    private _update() {
        const webview = this._panel.webview;
        this._panel.title = 'StatusBar Helper Settings';
        this._panel.webview.html = this._getHtmlForWebview(webview);
        this._sendStateToWebview();
    }

    private _readTypeDefinitions(baseDir: string, dirPath: string): { path: string, content: string }[] {
        const files: { path: string, content: string }[] = [];
        try {
            const entries = fs.readdirSync(dirPath, { withFileTypes: true });
            for (const entry of entries) {
                const fullPath = path.join(dirPath, entry.name);
                if (entry.isDirectory()) {
                    files.push(...this._readTypeDefinitions(baseDir, fullPath));
                } else if (entry.isFile() && entry.name.endsWith('.d.ts')) {
                    const content = fs.readFileSync(fullPath, 'utf8');
                    const virtualPath = 'file:///' + path.relative(baseDir, fullPath).replace(/\\/g, '/');
                    files.push({ path: virtualPath, content });
                }
            }
        } catch (error) {
            console.error(`Error reading directory ${dirPath}:`, error);
        }
        return files;
    }

    private _sendStateToWebview() {
        const config = vscode.workspace.getConfiguration('statusBarHelper');
        const items = config.get<any[]>('items', []);

        let typeDefs: { node: any[], vscode: string } | null = null;
        try {
            const nodeTypeDefsDir = path.join(this._extensionUri.fsPath, 'out', 'typedefs', 'node');
            const nodeTypeDefs = this._readTypeDefinitions(nodeTypeDefsDir, nodeTypeDefsDir);

            const vscodeDtsPath = path.join(this._extensionUri.fsPath, 'out', 'typedefs', 'vscode', 'index.d.ts');
            const vscodeDtsContent = fs.readFileSync(vscodeDtsPath, 'utf8');

            typeDefs = { node: nodeTypeDefs, vscode: vscodeDtsContent };
        } catch (error) {
            console.error('Error reading type definitions:', error);
            vscode.window.showErrorMessage('Error loading script editor type definitions. Autocomplete may not work correctly.');
        }

        this._panel.webview.postMessage({
            command: 'loadState',
            items,
            activeView: this._activeView,
            editingItem: this._editingItem,
            typeDefs
        });
    }

    private _getHtmlForWebview(webview: vscode.Webview): string {
        const htmlPath = path.join(this._extensionUri.fsPath, 'media', 'settings.html');
        let htmlContent = fs.readFileSync(htmlPath, 'utf8');

        htmlContent = htmlContent.replace(
            /<head>/,
            `<head><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; script-src ${webview.cspSource} 'unsafe-inline'; font-src ${webview.cspSource}; img-src ${webview.cspSource} https: data:;">`
        );

        const monacoUri = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'media', 'vs'));
        const codiconsUri = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'media', 'codicon.css'));

        htmlContent = htmlContent.replace(/{{monacoUri}}/g, monacoUri.toString());
        htmlContent = htmlContent.replace(/{{codiconsUri}}/g, codiconsUri.toString());

        return htmlContent;
    }

    public dispose() {
        SettingsPanel.currentPanel = undefined;
        try { if (this._running) this._running.kill(); } catch {}
        this._running = null;

        this._panel.dispose();
        while (this._disposables.length) {
            const x = this._disposables.pop();
            if (x) x.dispose();
        }
    }
}
