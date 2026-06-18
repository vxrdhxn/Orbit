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
        'better-sqlite3': 'commonjs better-sqlite3',
        '@xenova/transformers': 'commonjs @xenova/transformers',
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
                    },
                ],
            },
        ],
    },
    devtool: 'nosources-source-map',
};
