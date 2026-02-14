import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
    root: path.resolve(__dirname, 'src/ui'),
    plugins: [react()],
    base: './',
    build: {
        outDir: path.resolve(__dirname, 'dist/ui'),
        emptyOutDir: true,
        rollupOptions: {
            output: {
                entryFileNames: `[name].js`,
                chunkFileNames: `[name].js`,
                assetFileNames: `[name].[ext]`
            }
        }
    },
    resolve: {
        alias: {
            '@': path.resolve(__dirname, 'src/ui')
        }
    }
});
