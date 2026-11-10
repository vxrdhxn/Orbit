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

// Keeps the context small so the model fits on machines with limited memory.
const MAX_CONTEXT_SIZE = 4096;

async function disposeAll() {
    for (const resource of [session, context, model, llama]) {
        try {
            await resource?.dispose();
        } catch {
            // Already disposed or never fully created.
        }
    }
    session = context = model = llama = null;
}

async function loadModelOn(module: any, modelPath: string, useGpu: boolean) {
    // Assign to locals first so a failure never leaves half-initialized state.
    const newLlama = await module.getLlama(useGpu ? undefined : { gpu: false });
    try {
        const newModel = await newLlama.loadModel({ modelPath });
        const newContext = await newModel.createContext({ contextSize: { max: MAX_CONTEXT_SIZE } });
        llama = newLlama;
        model = newModel;
        context = newContext;
        session = new module.LlamaChatSession({
            contextSequence: newContext.getSequence()
        });
    } catch (err) {
        await newLlama.dispose().catch(() => undefined);
        throw err;
    }
}

async function initLlama(modelPath: string) {
    if (session) {
        return;
    }

    const module = await loadLlamaModule();

    try {
        await loadModelOn(module, modelPath, true);
    } catch (gpuError: any) {
        // GPU/Vulkan can run out of memory (shared memory on integrated GPUs).
        // Retry on the CPU before giving up.
        await disposeAll();
        try {
            await loadModelOn(module, modelPath, false);
        } catch (cpuError: any) {
            await disposeAll();
            throw new Error(
                `Could not load the model. GPU attempt: ${gpuError?.message}. ` +
                `CPU attempt: ${cpuError?.message}. ` +
                'This usually means not enough free memory: close other apps or pick a smaller model.'
            );
        }
    }
}

parentPort?.on('message', async (msg) => {
    try {
        if (msg.type === 'init') {
            await initLlama(msg.modelPath);
            parentPort?.postMessage({ id: msg.id, result: 'ok' });
        } else if (msg.type === 'generate') {
            // Every prompt already carries the full context and history, so do not
            // let the session stack its own copy on top of it.
            session.resetChatHistory();
            const response = await session.prompt(msg.prompt);
            parentPort?.postMessage({ id: msg.id, result: response });
        } else if (msg.type === 'generateStream') {
            session.resetChatHistory();
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
