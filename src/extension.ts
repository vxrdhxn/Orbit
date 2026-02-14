import * as vscode from 'vscode';
import { ProviderResolver } from './providers/ProviderResolver';
import { OnlineProvider } from './providers/OnlineProvider';
import { LocalProvider } from './providers/LocalProvider';
import { ChatViewProvider } from './providers/ChatViewProvider';
import * as path from 'path';
import * as fs from 'fs';

export function activate(context: vscode.ExtensionContext) {
    console.log('Orbit is active!');

    const config = vscode.workspace.getConfiguration('orbit');
    const onlineEndpoint = config.get<string>('onlineApiEndpoint') || '';
    const onlineApiKey = config.get<string>('onlineApiKey') || '';
    const ollamaEndpoint = config.get<string>('ollamaEndpoint') || 'http://localhost:11434';
    const ollamaModel = config.get<string>('ollamaModel') || 'codellama';

    const onlineProvider = new OnlineProvider(onlineEndpoint, onlineApiKey);
    const localProvider = new LocalProvider(ollamaEndpoint, ollamaModel);
    const resolver = new ProviderResolver(onlineProvider, localProvider);

    // Register Sidebar Chat View Provider
    const chatViewProvider = new ChatViewProvider(context.extensionUri, resolver);
    context.subscriptions.push(
        vscode.window.registerWebviewViewProvider(ChatViewProvider.viewType, chatViewProvider)
    );

    // Register Chat Command to focus the view
    let chatDisposable = vscode.commands.registerCommand('orbit.chat', () => {
        vscode.commands.executeCommand('orbit.chatView.focus');
    });

    // Register Health Check
    let healthDisposable = vscode.commands.registerCommand('orbit.health', async () => {
        const health = await resolver.checkHealth();
        vscode.window.showInformationMessage(
            `Orbit Health: Online=${health.online}, Local=${health.local}, Active=${health.active}`,
            'Open Chat'
        ).then(selection => {
            if (selection === 'Open Chat') {
                vscode.commands.executeCommand('orbit.chat');
            }
        });
    });

    context.subscriptions.push(chatDisposable);
    context.subscriptions.push(healthDisposable);
}

export function deactivate() { }
