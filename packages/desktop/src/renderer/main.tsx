/**
 * Desktop 渲染进程入口
 * 使用统一前端 @easyagent/frontend，通过 mountApp() 注入 Desktop 模式配置
 * IPC 桥接在挂载前初始化，样式由 @easyagent/frontend 统一提供
 */
import { mountApp } from '@/main';

// ==================== 初始化 IPC 桥接 ====================
/** 将 Electron IPC 事件桥接到 Web Store */
function setupIPCBridge() {
  const api = (window as any).easyAgent;
  if (!api) {
    console.log('[EasyAgent Desktop] 开发模式 - IPC 桥接不可用，使用 HTTP API');
    return;
  }

  console.log('[EasyAgent Desktop] IPC 桥接已初始化');

  // 动态导入 store 避免循环依赖（使用统一前端的 store）
  import('@/stores/appStore').then(({ useAppStore }) => {
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

// ==================== 挂载 React 应用 ====================
mountApp(
  { apiBase: 'http://127.0.0.1:3456', wsBase: 'ws://127.0.0.1:3456/ws', isDesktop: true },
  true
);

