import * as path from 'path';
import * as fs from 'fs';

/**
 * Opt-in real-inference test.
 *
 * Skipped unless ORBIT_TEST_MODEL points to a GGUF file. It loads the model
 * through LocalClient and the built worker (dist/worker.js), so run
 * `npm run compile` first.
 */
const modelPath = process.env.ORBIT_TEST_MODEL;
const workerPath = path.join(process.cwd(), 'dist', 'worker.js');

const workers: any[] = [];

// LocalClient resolves worker.js next to its own source file, which does not
// exist under ts-jest. Point it at the webpack-built worker instead.
jest.mock('worker_threads', () => {
    const actual = jest.requireActual('worker_threads');
    const builtWorker = require('path').join(process.cwd(), 'dist', 'worker.js');
    return {
        ...actual,
        Worker: class extends actual.Worker {
            constructor(_file: string, options?: any) {
                super(builtWorker, options);
                workers.push(this);
            }
        },
    };
});

import { LocalClient } from '../../../src/providers/LocalClient';

const describeIfModel = modelPath ? describe : describe.skip;

describeIfModel('LocalClient real inference (ORBIT_TEST_MODEL)', () => {
    jest.setTimeout(600000);

    afterAll(async () => {
        await Promise.all(workers.map(w => w.terminate()));
    });

    it('loads the model and generates a response', async () => {
        expect(fs.existsSync(modelPath as string)).toBe(true);
        expect(fs.existsSync(workerPath)).toBe(true);

        const client = new LocalClient('orbit-test-model', modelPath);
        const chunks: string[] = [];

        const response = await client.generateStream(
            'Reply with the single word: ready',
            chunk => chunks.push(chunk)
        );

        expect(typeof response).toBe('string');
        expect(response.trim().length).toBeGreaterThan(0);
        expect(chunks.length).toBeGreaterThan(0);
    });
});
