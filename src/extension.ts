import * as vscode from 'vscode';
import { exec } from 'child_process';
import * as fs from 'fs';
import * as fsp from 'fs/promises';
import * as path from 'path';
import { promisify } from 'util';
import * as vm from 'vm';
import { SettingsPanel } from './SettingsPanel';

// Store disposables for status bar items and commands
let itemDisposables: vscode.Disposable[] = [];

function updateStatusBarItems(context: vscode.ExtensionContext) {
    // Dispose all old items and commands
    itemDisposables.forEach(d => d.dispose());
    itemDisposables = [];

    const config = vscode.workspace.getConfiguration('statusBarHelper');
    const items = config.get<any[]>('items', []);

    items.forEach((item, index) => {
        const { text, tooltip, command, script, hidden } = item;
        if (!text || !command) return;
        if (hidden) return;

        const statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100 - index);
        statusBarItem.text = text;
        statusBarItem.tooltip = tooltip;
        statusBarItem.command = command;

        const commandDisposable = vscode.commands.registerCommand(command, () => {
            if (!script) return;

            const sandbox = {
                vscode,
                fs,
                path,
                process,
                console: console,
                __dirname: path.dirname(context.extensionPath),
                require: (moduleName: string) => {
                    if (moduleName === 'vscode') return vscode;
                    // 只允許 Node 內建模組
                    if (require.resolve(moduleName) === moduleName) {
                        return require(moduleName);
                    } else {
                        throw new Error(`Only built-in modules are allowed: ${moduleName}`);
                    }
                }
            };

            const wrappedScript = `(function() { ${script} })();`;

            try {
                vm.runInNewContext(wrappedScript, sandbox);
            } catch (e: any) {
                vscode.window.showErrorMessage(`❌ Script error: ${e.message}`);
                console.error(e);
            }
        });

        itemDisposables.push(statusBarItem, commandDisposable);
        statusBarItem.show();
    });
}

export function activate(context: vscode.ExtensionContext) {
    console.log('✅ Status Bar Helper Extension Activated');

    // Register command to show settings panel
    context.subscriptions.push(vscode.commands.registerCommand('statusBarHelper.showSettings', () => {
        SettingsPanel.createOrShow(context.extensionUri);
    }));

    // Initial update
    updateStatusBarItems(context);

    // Watch for configuration changes
    context.subscriptions.push(vscode.workspace.onDidChangeConfiguration(e => {
        if (e.affectsConfiguration('statusBarHelper.items')) {
            updateStatusBarItems(context);
        }
    }));

    // A gear icon to open settings
    const settingsStatusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
    settingsStatusBarItem.text = `$(gear)`;
    settingsStatusBarItem.tooltip = 'Status Bar Helper Settings';
    settingsStatusBarItem.command = 'statusBarHelper.showSettings';
    settingsStatusBarItem.show();
    context.subscriptions.push(settingsStatusBarItem);

    // Example placeholder
    const gitAddCommand = vscode.commands.registerCommand('githelper.gitAdd', () => {
        // TODO
    });
    context.subscriptions.push(gitAddCommand);
}

export function deactivate() {
    itemDisposables.forEach(d => d.dispose());
}
