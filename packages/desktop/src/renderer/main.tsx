/**
 * Desktop 渲染进程入口
 * 使用 HashRouter 适配 Electron file:// 协议
 * 集成 IPC 桥接用于桌面特有功能
 */
import React from 'react';
import ReactDOM from 'react-dom/client';
import { HashRouter } from 'react-router-dom';
import App from './App';
import './index.css';

// ==================== 初始化 IPC 桥接 ====================
/** 检测是否在 Electron 环境中运行 */
function isElectron(): boolean {
  return !!(window as any).easyAgent;
}

/** 将 Electron IPC 事件桥接到 Web Store */
function setupIPCBridge() {
  const api = (window as any).easyAgent;
  if (!api) {
    console.log('[EasyAgent Desktop] 开发模式 - IPC 桥接不可用，使用 HTTP API');
    return;
  }

  console.log('[EasyAgent Desktop] IPC 桥接已初始化');

  // 动态导入 store 避免循环依赖
  import('./stores/appStore').then(({ useAppStore }) => {
    // 监听工作区变化
    api.onWorkspaceChanged((workspacePath: string) => {
      console.log('[EasyAgent Desktop] 工作区切换:', workspacePath);
      useAppStore.getState().addNotification({
        type: 'info',
        message: `工作区已切换: ${workspacePath}`,
        duration: 3000,
      });
    });

    // 监听更新状态
    api.onUpdateStatus((status: any) => {
      if (status.status === 'downloaded') {
        useAppStore.getState().addNotification({
          type: 'success',
          message: '新版本已下载，重启应用以安装更新',
          duration: 0,
        });
      } else if (status.status === 'error') {
        console.warn('[EasyAgent Desktop] 更新检查失败:', status.message);
      }
    });
  });
}

setupIPCBridge();

// ==================== 启动 React 应用 ====================
ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <HashRouter>
      <App />
    </HashRouter>
  </React.StrictMode>
);

