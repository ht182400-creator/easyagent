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
            '@': resolve(__dirname, 'src/renderer'),
        },
    },
    server: {
        port: 5183,
        strictPort: true,
    },
});
//# sourceMappingURL=vite.config.js.map