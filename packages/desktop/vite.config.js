import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'node:path';
export default defineConfig({
    plugins: [react()],
    root: '.',
    base: './',
    build: {
        outDir: 'dist/renderer',
        emptyOutDir: true,
        sourcemap: true,
    },
    resolve: {
        alias: {
            '@': resolve(__dirname, '../frontend/src'),
        },
    },
    server: {
        port: 5183,
        strictPort: true,
        proxy: {
            '/api': {
                target: 'http://localhost:3456',
                changeOrigin: true,
            },
            '/ws': {
                target: 'ws://localhost:3456',
                ws: true,
            },
        },
    },
});
//# sourceMappingURL=vite.config.js.map