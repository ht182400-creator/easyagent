/**
 * Vitest 配置 - Desktop 包测试
 * 覆盖 stores、components、IPC 桥接
 */
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import * as path from 'node:path';
export default defineConfig({
    plugins: [react()],
    test: {
        // jsdom 模拟浏览器环境
        environment: 'jsdom',
        // 全局 setup
        globals: true,
        setupFiles: ['./src/__tests__/setup.ts'],
        // 测试超时
        testTimeout: 10000,
        // 路径别名 - 匹配 tsconfig
        alias: {
            '@': path.resolve(__dirname, 'src/renderer'),
        },
        // CSS/Less/静态资源 mock
        css: false,
        // 覆盖率配置
        coverage: {
            provider: 'v8',
            include: ['src/renderer/**/*.{ts,tsx}', 'src/preload.ts'],
            exclude: ['src/renderer/main.tsx', 'src/renderer/**/*.d.ts'],
            thresholds: {
                statements: 60,
                branches: 50,
                functions: 55,
                lines: 60,
            },
        },
        // 排除 Electron 原生模块
        server: {
            deps: {
                inline: [],
            },
        },
    },
});
//# sourceMappingURL=vitest.config.js.map