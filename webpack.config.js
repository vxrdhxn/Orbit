const path = require('path');

module.exports = {
    mode: 'development',
    target: 'node',
    entry: {
        extension: './src/extension.ts',
        worker: './src/providers/worker.ts',
        embeddingsWorker: './src/embeddingsWorker.ts'
    },
    output: {
        path: path.resolve(__dirname, 'dist'),
        filename: '[name].js',
        libraryTarget: 'commonjs',
    },
    externals: {
        vscode: 'commonjs vscode',
        'node:sqlite': 'commonjs node:sqlite',
        '@huggingface/transformers': 'commonjs @huggingface/transformers',
        'onnxruntime-node': 'commonjs onnxruntime-node',
        'node-llama-cpp': 'commonjs node-llama-cpp',
        'sharp': 'commonjs sharp'
    },
    resolve: {
        extensions: ['.ts', '.js'],
    },
    module: {
        rules: [
            {
                test: /\.ts$/,
                exclude: /node_modules/,
                use: [
                    {
                        loader: 'ts-loader',
                        options: {
                            // Preserve dynamic import() so webpackIgnore can leave
                            // node-llama-cpp for the worker's native ESM loader.
                            compilerOptions: { module: 'esnext' },
                        },
                    },
                ],
            },
        ],
    },
    devtool: 'nosources-source-map',
};
