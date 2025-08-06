import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';

export class SettingsPanel {
    public static currentPanel: SettingsPanel | undefined;
    private readonly _panel: vscode.WebviewPanel;
    private readonly _extensionUri: vscode.Uri;
    private _disposables: vscode.Disposable[] = [];

    private _activeView: 'list' | 'edit' = 'list';
    private _editingItem: any = null;

    private constructor(panel: vscode.WebviewPanel, extensionUri: vscode.Uri) {
        this._panel = panel;
        this._extensionUri = extensionUri;

        this._panel.onDidDispose(() => this.dispose(), null, this._disposables);

        this._panel.webview.onDidReceiveMessage(
            message => {
                switch (message.command) {
                    case 'updateSettings':
                        vscode.workspace.getConfiguration('statusBarHelper').update('items', message.items, vscode.ConfigurationTarget.Global);
                        this._activeView = 'list'; // After saving, we are back to the list view
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
                    case 'exportSettings':
                        {
                            const now = new Date();
                            const year = now.getFullYear();
                            const month = (now.getMonth() + 1).toString().padStart(2, '0');
                            const day = now.getDate().toString().padStart(2, '0');
                            const hours = now.getHours().toString().padStart(2, '0');
                            const minutes = now.getMinutes().toString().padStart(2, '0');
                            const seconds = now.getSeconds().toString().padStart(2, '0');
                            const defaultName = `status-bar-helper-${year}-${month}-${day}-${hours}-${minutes}-${seconds}.json`;

                            const workspaceFolders = vscode.workspace.workspaceFolders;
                            let defaultUri: vscode.Uri | undefined;
                            if (workspaceFolders && workspaceFolders.length > 0) {
                                defaultUri = vscode.Uri.joinPath(workspaceFolders[0].uri, defaultName);
                            }

                            vscode.window.showSaveDialog({ 
                                defaultUri,
                                saveLabel: 'Export Settings', 
                                filters: { 'JSON': ['json'] } 
                            }).then(uri => {
                                if (uri) {
                                    fs.writeFileSync(uri.fsPath, JSON.stringify(message.items, null, 2));
                                    vscode.window.showInformationMessage('Settings exported successfully.');
                                }
                            });
                        }
                        return;
                    case 'importSettings':
                        vscode.window.showOpenDialog({ canSelectMany: false, filters: { 'JSON': ['json'] } }).then(async (uris) => {
                            if (uris && uris.length > 0) {
                                const uri = uris[0];
                                const content = fs.readFileSync(uri.fsPath, 'utf8');
                                try {
                                    const items = JSON.parse(content);
                                    if (Array.isArray(items)) {
                                        await vscode.workspace.getConfiguration('statusBarHelper').update('items', items, vscode.ConfigurationTarget.Global);
                                        // The onDidChangeConfiguration event in extension.ts will handle the status bar update.
                                        // We just need to refresh the webview.
                                        this._sendStateToWebview(); 
                                        vscode.window.showInformationMessage('Settings imported successfully.');
                                    } else {
                                        vscode.window.showErrorMessage('Invalid file format.');
                                    }
                                } catch (e) {
                                    vscode.window.showErrorMessage('Error parsing settings file.');
                                }
                            }
                        });
                        return;
                }
            },
            null,
            this._disposables
        );

        this._panel.onDidChangeViewState(
            e => {
                if (e.webviewPanel.visible) {
                    this._sendStateToWebview();
                }
            },
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
                localResourceRoots: [vscode.Uri.joinPath(extensionUri, 'media')]
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

    private _sendStateToWebview() {
        const config = vscode.workspace.getConfiguration('statusBarHelper');
        const items = config.get<any[]>('items', []);
        this._panel.webview.postMessage({ 
            command: 'loadState', 
            items: items,
            activeView: this._activeView,
            editingItem: this._editingItem
        });
    }

    private _getHtmlForWebview(webview: vscode.Webview): string {
        const htmlPath = path.join(this._extensionUri.fsPath, 'media', 'settings.html');
        let htmlContent = fs.readFileSync(htmlPath, 'utf8');

        // Set the Content Security Policy
        htmlContent = htmlContent.replace(/<head>/, `<head><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; script-src ${webview.cspSource} 'unsafe-inline'; font-src ${webview.cspSource}; img-src ${webview.cspSource} https: data:;">`);

        const monacoUri = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'media', 'vs'));
        const codiconsUri = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'media', 'codicon.css'));

        htmlContent = htmlContent.replace(/{{monacoUri}}/g, monacoUri.toString());
        htmlContent = htmlContent.replace(/{{codiconsUri}}/g, codiconsUri.toString());

        return htmlContent;
    }

    public dispose() {
        SettingsPanel.currentPanel = undefined;
        this._panel.dispose();
        while (this._disposables.length) {
            const x = this._disposables.pop();
            if (x) {
                x.dispose();
            }
        }
    }
}
