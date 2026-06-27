/**
 * Desktop IPC 桥接
 * 将 Electron preload 暴露的 IPC 事件桥接到 Web Store
 * 独立文件，main.tsx 挂载前调用
 */

/** 将 Electron IPC 事件桥接到 Web Store */
export function setupIPCBridge(): void {
  const api = (window as any).easyAgent;
  if (!api) {
    console.log('[EasyAgent Desktop] 开发模式 - IPC 桥接不可用，使用 HTTP API');
    return;
  }

  console.log('[EasyAgent Desktop] IPC 桥接已初始化');

  // 动态导入 store 避免循环依赖（使用统一前端的 store）
  import('@easyagent/frontend/stores/appStore').then(({ useAppStore }) => {
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
