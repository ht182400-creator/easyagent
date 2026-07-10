/**
 * EasyAgent 统一前端 - 独立开发/构建入口
 * 仅在 frontend 包独立 vite dev/build 时使用，
 * Web/Desktop 各自有自己的入口文件（web/src/main.tsx, desktop/src/renderer/main.tsx）。
 */
import { mountApp } from './mountApp';

// 独立模式下直接挂载，使用默认配置
mountApp({}, false, 'root');
