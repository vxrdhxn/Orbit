import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
    plugins: [react()],
    build: {
        outDir: '../out/webview',
        emptyOutDir: true,
        rollupOptions: {
            output: {
                entryFileNames: 'index.js',
                assetFileNames: 'index.[ext]',
            },
        },
        sourcemap: true,
    },
    resolve: {
        alias: {
            '@': path.resolve(__dirname, './src'),
        },
    },
    optimizeDeps: {
        include: [
            'react-syntax-highlighter',
            'react-syntax-highlighter/dist/esm/styles/prism',
            'react-markdown'
        ]
    }
});
