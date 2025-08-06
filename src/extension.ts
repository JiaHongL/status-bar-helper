import * as vscode from 'vscode';
import { exec } from 'child_process';
import * as fs from 'fs';
import * as fsp from 'fs/promises';
import * as path from 'path';
import { promisify } from 'util';
import { NodeVM } from 'vm2';
import { SettingsPanel } from './SettingsPanel';

// Keep your existing helper functions
const execAsync = promisify(exec);

async function copyFilesRecursive(src: string, dest: string) {
    await fsp.mkdir(dest, { recursive: true });
    const entries = await fsp.readdir(src, { withFileTypes: true });

    for (const entry of entries) {
        const srcPath = path.join(src, entry.name);
        const destPath = path.join(dest, entry.name);

        if (entry.isDirectory()) {
            await copyFilesRecursive(srcPath, destPath);
        } else {
            await fsp.copyFile(srcPath, destPath);
        }
    }
}

// Store disposables for status bar items and commands
let itemDisposables: vscode.Disposable[] = [];

function updateStatusBarItems(context: vscode.ExtensionContext) {
    // Dispose all old items and commands
    itemDisposables.forEach(d => d.dispose());
    itemDisposables = [];

    const config = vscode.workspace.getConfiguration('statusBarHelper');
    const items = config.get<any[]>('items', []);

    items.forEach((item, index) => {
        const { text, tooltip, command, script } = item;
        if (!text || !command) {
            return;
        }

        const statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100 - index);
        statusBarItem.text = text;
        statusBarItem.tooltip = tooltip;
        statusBarItem.command = command;

        const commandDisposable = vscode.commands.registerCommand(command, () => {
            if (script) {
                try {
                    const vm = new NodeVM({
                        console: 'inherit',
                        sandbox: {},
                        require: {
                            external: true,
                            builtin: ['*'],
                            root: './',
                            mock: {
                                vscode: vscode
                            }
                        }
                    });
                    vm.run(script, 'vm.js');
                } catch (e: any) {
                    vscode.window.showErrorMessage(`Error executing script for ${text}: ${e.message}`);
                }
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

    // Your existing commands can be preserved and registered here
    // For example:
    const gitAddCommand = vscode.commands.registerCommand('githelper.gitAdd', () => {
        // Your git add logic here
    });
    context.subscriptions.push(gitAddCommand);

    // ... register your other commands ...
}
