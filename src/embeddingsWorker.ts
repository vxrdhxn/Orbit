import { parentPort } from 'worker_threads';
import { resolvePackageEntryUrl } from './runtime/runtimeResolve';

let pipeline: any = null;
let env: any = null;

async function init() {
    if (!pipeline) {
        // Installed on first use into ~/.orbit/runtime; fall back to a normal
        // require for a development checkout.
        const entryUrl = resolvePackageEntryUrl('@huggingface/transformers', [__dirname]);
        const transformers = entryUrl
            ? await import(/* webpackIgnore: true */ entryUrl)
            : require('@huggingface/transformers');
        pipeline = transformers.pipeline;
        env = transformers.env;
        // Optimization for local usage
        env.allowLocalModels = true;
        env.useBrowserCache = false;
        // Only the browser (WASM) backend has this setting; Node uses onnxruntime-node.
        if (env.backends?.onnx?.wasm) {
            env.backends.onnx.wasm.numThreads = 1;
        }
    }
}

// Simple cache
let extractor: any = null;

parentPort?.on('message', async (msg) => {
    try {
        if (msg.type === 'init') {
            await init();
            if (!extractor) {
                extractor = await pipeline('feature-extraction', msg.model || 'Xenova/all-MiniLM-L6-v2');
            }
            parentPort?.postMessage({ type: 'ready' });
        } else if (msg.type === 'embed') {
            if (!extractor) {
                await init();
                extractor = await pipeline('feature-extraction', msg.model || 'Xenova/all-MiniLM-L6-v2');
            }
            const output = await extractor(msg.texts, { pooling: 'mean', normalize: true });
            parentPort?.postMessage({ id: msg.id, result: output.tolist() });
        }
    } catch (err: any) {
        parentPort?.postMessage({ id: msg.id, error: err.message });
    }
});
