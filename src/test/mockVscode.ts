console.log("Mocking 'vscode' module...");
const Module = require('module');
const originalRequire = Module.prototype.require;

Module.prototype.require = function (request: any) {
    if (request === 'vscode') {
        return {
            window: {
                showQuickPick: () => { },
                showWarningMessage: () => { },
                showErrorMessage: () => { },
                showInformationMessage: () => { },
                withProgress: () => { },
                createStatusBarItem: () => ({ show: () => { }, text: '' }),
            },
            workspace: {
                getConfiguration: () => ({ get: () => { } }),
                workspaceFolders: [],
                openTextDocument: () => { },
                showTextDocument: () => { },
            },
            ProgressLocation: { Notification: 15 },
            Uri: { file: (path: string) => ({ fsPath: path }) },
            Range: class { },
            Position: class { },
            Selection: class { },
            ExtensionContext: class { },
            ViewColumn: { Beside: 1 }
        };
    }
    return originalRequire.apply(this, arguments);
};
