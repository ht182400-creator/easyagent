/**
 * Desktop 渲染进程入口
 * 使用统一前端 @easyagent/frontend，通过 mountApp() 注入 Desktop 模式配置
 * IPC 桥接在挂载前初始化，样式由 @easyagent/frontend 统一提供
 *
 * API 端口通过 Vite define 注入（__API_PORT__），可通过 API_PORT 环境变量覆盖
 */
import { mountApp } from '@easyagent/frontend';
import { setupIPCBridge } from './ipcBridge';

// Vite define 注入的全局常量（见 vite.config.ts → define）
declare const __API_PORT__: string;
const apiBaseUrl = `http://127.0.0.1:${__API_PORT__}`;
const wsBaseUrl = `ws://127.0.0.1:${__API_PORT__}/ws`;

// ==================== 初始化 IPC 桥接 ====================
setupIPCBridge();

// ==================== 挂载 React 应用 ====================
mountApp(
  { apiBase: apiBaseUrl, wsBase: wsBaseUrl, isDesktop: true },
  true,
);
