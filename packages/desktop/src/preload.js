/**
 * EasyAgent 桌面版 - 预加载脚本
 * 安全地暴露IPC API给渲染进程
 */
import { contextBridge, ipcRenderer } from 'electron';
/**
 * 暴露给渲染进程的API
 */
contextBridge.exposeInMainWorld('easyAgent', {
    /** 发送对话消息 */
    chat: (message) => ipcRenderer.invoke('agent-chat', message),
    /** 切换模型 */
    switchModel: (provider, model) => ipcRenderer.invoke('switch-model', provider, model),
    /** 获取配置 */
    getConfig: () => ipcRenderer.invoke('get-config'),
    /** 获取可用模型 */
    getModels: () => ipcRenderer.invoke('get-models'),
    /** 中止Agent执行 */
    abort: () => ipcRenderer.invoke('abort-agent'),
    /** 获取应用版本 */
    getAppVersion: () => ipcRenderer.invoke('get-app-version'),
    /** 手动检查更新 */
    checkUpdate: () => ipcRenderer.invoke('check-update'),
    /** 获取更新状态 */
    getUpdateStatus: () => ipcRenderer.invoke('get-update-status'),
    /** 监听Agent事件 */
    onAgentEvent: (callback) => {
        ipcRenderer.on('agent-event', (_event, data) => callback(data));
    },
    /** 监听流式响应 */
    onChatChunk: (callback) => {
        ipcRenderer.on('chat-chunk', (_event, text) => callback(text));
    },
    /** 监听新建会话 */
    onNewSession: (callback) => {
        ipcRenderer.on('new-session', () => callback());
    },
    /** 监听工作区变化 */
    onWorkspaceChanged: (callback) => {
        ipcRenderer.on('workspace-changed', (_event, path) => callback(path));
    },
    /** 监听更新状态 */
    onUpdateStatus: (callback) => {
        ipcRenderer.on('update-status', (_event, data) => callback(data));
    },
    /** 移除所有监听器 */
    removeAllListeners: () => {
        ipcRenderer.removeAllListeners('agent-event');
        ipcRenderer.removeAllListeners('chat-chunk');
        ipcRenderer.removeAllListeners('new-session');
        ipcRenderer.removeAllListeners('workspace-changed');
        ipcRenderer.removeAllListeners('update-status');
    },
});
//# sourceMappingURL=preload.js.map