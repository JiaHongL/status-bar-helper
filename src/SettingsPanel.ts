import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';

export class SettingsPanel {
    public static currentPanel: SettingsPanel | undefined;
    private readonly _panel: vscode.WebviewPanel;
    private readonly _extensionUri: vscode.Uri;
    private _disposables: vscode.Disposable[] = [];

    private constructor(panel: vscode.WebviewPanel, extensionUri: vscode.Uri) {
        this._panel = panel;
        this._extensionUri = extensionUri;

        this._panel.onDidDispose(() => this.dispose(), null, this._disposables);
        this._panel.webview.onDidReceiveMessage(
            message => {
                switch (message.command) {
                    case 'updateSettings':
                        vscode.workspace.getConfiguration('statusBarHelper').update('items', message.items, vscode.ConfigurationTarget.Global);
                        vscode.window.showInformationMessage('Settings updated!');
                        return;
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

        const config = vscode.workspace.getConfiguration('statusBarHelper');
        const items = config.get<any[]>('items', []);
        this._panel.webview.postMessage({ command: 'loadItems', items: items });
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
