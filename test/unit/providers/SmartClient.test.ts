import { SmartClient } from '../../../src/providers/SmartClient';

describe('SmartClient', () => {
    it('reuses one client while the configuration is unchanged', () => {
        const client: any = new SmartClient();
        const first = client.getClient();
        const second = client.getClient();
        expect(second).toBe(first);
    });

    it('skips background requests on a local model while chat is streaming', async () => {
        const vscode = require('vscode');
        vscode.workspace.getConfiguration.mockImplementation(() => ({
            get: (key: string, def: any) => (key === 'mode' ? 'offline' : def),
        }));
        const client: any = new SmartClient();
        client.activeStreams = 1;
        await expect(client.generate('complete this')).rejects.toMatchObject({ name: 'AbortError' });
        vscode.workspace.getConfiguration.mockImplementation(() => ({
            get: jest.fn((_key: string, def: any) => def),
        }));
    });
});
