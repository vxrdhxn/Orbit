import * as vscode from 'vscode';
import { ServiceLocator } from './core/ServiceLocator';
import { CommandRegistrar } from './core/CommandRegistrar';

export function activate(context: vscode.ExtensionContext) {
    try {
        console.log('Orbit v2.0.1 (Hybrid AI) is active!');

        // Bootstrap Core Infrastructure
        const services = new ServiceLocator();
        const registrar = new CommandRegistrar(context, services);

        // Initialize Global Systems
        services.initGlobalServices(context);
        registrar.registerGlobalCommands();

        // Initialize Workspace-dependent Systems
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (workspaceFolders && workspaceFolders.length > 0) {
            const workspaceFolder = workspaceFolders[0].uri;
            services.initWorkspaceServices(context, workspaceFolder);
            registrar.registerWorkspaceCommands(workspaceFolder);
        } else {
            console.log('Orbit: No workspace folders found. Chat is available, but advanced features (review, pilot, etc.) require an open folder.');
        }

    } catch (error) {
        console.error('Orbit activation failed:', error);
        vscode.window.showErrorMessage('Orbit failed to activate. Please check the Developer Tools console for details.');
    }
}

export function deactivate() { }
