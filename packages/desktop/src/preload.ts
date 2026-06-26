/**
 * EasyAgent Desktop - 预加载脚本
 * 安全地暴露 IPC API 给渲染进程（contextBridge）
 */
import { contextBridge, ipcRenderer } from 'electron';

/**
 * 暴露给渲染进程的完整 API
 * 渲染进程通过 window.easyAgent 访问
 */
contextBridge.exposeInMainWorld('easyAgent', {
  // ==================== Agent 操作 ====================

  /** 发送对话消息 */
  chat: (message: string) => ipcRenderer.invoke('agent-chat', message),

  /** 切换模型 */
  switchModel: (provider: string, model: string) => ipcRenderer.invoke('switch-model', provider, model),

  /** 中止 Agent 执行 */
  abort: () => ipcRenderer.invoke('abort-agent'),

  // ==================== 配置 ====================

  /** 获取应用配置 */
  getConfig: () => ipcRenderer.invoke('get-config'),

  /** 获取可用模型列表 */
  getModels: () => ipcRenderer.invoke('get-models'),

  // ==================== 应用信息 ====================

  /** 获取应用版本号 */
  getAppVersion: () => ipcRenderer.invoke('get-app-version'),

  /** 获取后端 API 端口 */
  getApiPort: () => ipcRenderer.invoke('get-api-port'),

  /** 获取平台信息 */
  getPlatform: () => process.platform,

  // ==================== 自动更新 ====================

  /** 手动检查更新 */
  checkUpdate: () => ipcRenderer.invoke('check-update'),

  /** 获取更新状态 */
  getUpdateStatus: () => ipcRenderer.invoke('get-update-status'),

  /** 用户确认安装已下载的更新（quitAndInstall） */
  installUpdate: () => ipcRenderer.invoke('install-update'),

  /** 模拟更新进度（开发测试用，支持 scenario 参数） */
  simulateUpdate: (params?: { scenario?: string; version?: string }) =>
    ipcRenderer.invoke('simulate-update', params),

  // ==================== 文件操作（桌面特有） ====================

  /** 打开文件选择对话框 */
  openFileDialog: (options?: { filters?: { name: string; extensions: string[] }[] }) =>
    ipcRenderer.invoke('open-file-dialog', options),

  /** 打开目录选择对话框 */
  openDirectoryDialog: () => ipcRenderer.invoke('open-directory-dialog'),

  /** 在系统文件管理器中显示文件 */
  showItemInFolder: (filePath: string) => ipcRenderer.invoke('show-item-in-folder', filePath),

  /** 用系统默认应用打开文件 */
  openExternal: (url: string) => ipcRenderer.invoke('open-external', url),

  // ==================== 事件监听 ====================

  /** 监听 Agent 事件（工具调用、完成、错误等） */
  onAgentEvent: (callback: (event: unknown) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, data: unknown) => callback(data);
    ipcRenderer.on('agent-event', handler);
    return () => ipcRenderer.removeListener('agent-event', handler);
  },

  /** 监听流式响应文本 */
  onChatChunk: (callback: (text: string) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, text: string) => callback(text);
    ipcRenderer.on('chat-chunk', handler);
    return () => ipcRenderer.removeListener('chat-chunk', handler);
  },

  /** 监听新建会话 */
  onNewSession: (callback: () => void) => {
    const handler = () => callback();
    ipcRenderer.on('new-session', handler);
    return () => ipcRenderer.removeListener('new-session', handler);
  },

  /** 监听工作区变化 */
  onWorkspaceChanged: (callback: (workspacePath: string) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, workspacePath: string) => callback(workspacePath);
    ipcRenderer.on('workspace-changed', handler);
    return () => ipcRenderer.removeListener('workspace-changed', handler);
  },

  /** 监听更新状态 */
  onUpdateStatus: (callback: (status: unknown) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, data: unknown) => callback(data);
    ipcRenderer.on('update-status', handler);
    return () => ipcRenderer.removeListener('update-status', handler);
  },

  /** 监听导航请求 */
  onNavigate: (callback: (path: string) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, path: string) => callback(path);
    ipcRenderer.on('navigate', handler);
    return () => ipcRenderer.removeListener('navigate', handler);
  },

  /** 移除所有监听器 */
  removeAllListeners: () => {
    ipcRenderer.removeAllListeners('agent-event');
    ipcRenderer.removeAllListeners('chat-chunk');
    ipcRenderer.removeAllListeners('new-session');
    ipcRenderer.removeAllListeners('workspace-changed');
    ipcRenderer.removeAllListeners('update-status');
    ipcRenderer.removeAllListeners('navigate');
  },
});

