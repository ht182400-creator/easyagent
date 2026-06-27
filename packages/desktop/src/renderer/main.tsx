/**
 * Desktop 渲染进程入口
 * 使用统一前端 @easyagent/frontend，通过 mountApp() 注入 Desktop 模式配置
 * IPC 桥接在挂载前初始化，样式由 @easyagent/frontend 统一提供
 */
import { mountApp } from '@easyagent/frontend';
import { setupIPCBridge } from './ipcBridge';

// ==================== 初始化 IPC 桥接 ====================
setupIPCBridge();

// ==================== 挂载 React 应用 ====================
mountApp(
  { apiBase: 'http://127.0.0.1:3456', wsBase: 'ws://127.0.0.1:3456/ws', isDesktop: true },
  true,
);
