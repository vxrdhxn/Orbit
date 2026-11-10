import { parentPort } from 'worker_threads';
import * as os from 'os';
import * as path from 'path';
import * as fs from 'fs';
import { resolvePackageEntryUrl } from '../runtime/runtimeResolve';

let llamaModule: any;
let llama: any = null;
let model: any = null;
let context: any = null;
let session: any = null;

async function loadLlamaModule() {
    if (!llamaModule) {
        // node-llama-cpp is ESM-only. Keep this import native so the worker,
        // not the CommonJS extension bundle, resolves it at runtime.
        // It is installed on first use into ~/.orbit/runtime; fall back to the
        // bare specifier for a development checkout.
        const entryUrl = resolvePackageEntryUrl('node-llama-cpp', [__dirname]);
        llamaModule = await import(/* webpackIgnore: true */ entryUrl ?? 'node-llama-cpp');
    }
    return llamaModule;
}

async function initLlama(modelPath: string) {
    const module = await loadLlamaModule();
    if (!llama) {
        llama = await module.getLlama();
    }
    if (!model) {
        model = await llama.loadModel({ modelPath });
        context = await model.createContext();
        session = new module.LlamaChatSession({
            contextSequence: context.getSequence()
        });
    }
}

parentPort?.on('message', async (msg) => {
    try {
        if (msg.type === 'init') {
            await initLlama(msg.modelPath);
            parentPort?.postMessage({ id: msg.id, result: 'ok' });
        } else if (msg.type === 'generate') {
            const response = await session.prompt(msg.prompt);
            parentPort?.postMessage({ id: msg.id, result: response });
        } else if (msg.type === 'generateStream') {
            const response = await session.prompt(msg.prompt, {
                onTextChunk(text: string) {
                    parentPort?.postMessage({ id: msg.id, chunk: text });
                }
            });
            parentPort?.postMessage({ id: msg.id, result: response });
        }
    } catch (err: any) {
        parentPort?.postMessage({ id: msg.id, error: err.message });
    }
});
