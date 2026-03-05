export const window = {
    showQuickPick: jest.fn(),
    showWarningMessage: jest.fn(),
    showErrorMessage: jest.fn(),
    showInformationMessage: jest.fn(),
    withProgress: jest.fn(),
    createStatusBarItem: jest.fn(() => ({ show: jest.fn(), text: '' })),
};

export const workspace = {
    getConfiguration: jest.fn(() => ({
        get: jest.fn((key, defaultValue) => defaultValue),
    })),
    workspaceFolders: [{
        uri: { fsPath: '/mock/root', scheme: 'file' },
        name: 'mock',
        index: 0
    }],
    openTextDocument: jest.fn(),
    showTextDocument: jest.fn(),
    fs: {
        stat: jest.fn(),
    },
    findFiles: jest.fn(() => Promise.resolve([])),
};

export const ProgressLocation = { Notification: 15 };
export const Uri = {
    file: jest.fn((path) => ({ fsPath: path, scheme: 'file' })),
    parse: jest.fn((url) => ({ fsPath: url, scheme: 'file' })),
};

export const FileType = {
    Unknown: 0,
    File: 1,
    Directory: 2,
    SymbolicLink: 64,
};

export class Range {
    constructor(public startLine: number, public startChar: number, public endLine: number, public endChar: number) { }
}

export class Position {
    constructor(public line: number, public character: number) { }
}

export class Selection {
    constructor(public anchor: any, public active: any) { }
}

export class ExtensionContext { }
export const ViewColumn = { Beside: 1 };
