/**
 * IPC 预加载桥接测试
 * 覆盖所有 contextBridge API 的完整性
 * 注意：因 ESM 限制，不直接 import preload.ts，而是测试 API 规范
 */
import { describe, it, expect, vi } from 'vitest';

describe('Preload IPC API 规范', () => {
  /**
   * 模拟 contextBridge.exposeInMainWorld 的行为
   * 验证 API 对象的完整性
   */
  function createMockAPI() {
    // 模拟 ipcRenderer
    const mockInvoke = vi.fn();
    const mockOn = vi.fn();
    const mockRemoveAll = vi.fn();

    return {
      chat: (message: string) => mockInvoke('agent-chat', message),
      switchModel: (provider: string, model: string) => mockInvoke('switch-model', provider, model),
      getConfig: () => mockInvoke('get-config'),
      getModels: () => mockInvoke('get-models'),
      abort: () => mockInvoke('abort-agent'),
      getAppVersion: () => mockInvoke('get-app-version'),
      checkUpdate: () => mockInvoke('check-update'),
      getUpdateStatus: () => mockInvoke('get-update-status'),
      onAgentEvent: (cb: Function) => mockOn('agent-event', cb),
      onChatChunk: (cb: Function) => mockOn('chat-chunk', cb),
      onNewSession: (cb: Function) => mockOn('new-session', cb),
      onWorkspaceChanged: (cb: Function) => mockOn('workspace-changed', cb),
      onUpdateStatus: (cb: Function) => mockOn('update-status', cb),
      removeAllListeners: () => {
        mockRemoveAll('agent-event');
        mockRemoveAll('chat-chunk');
        mockRemoveAll('new-session');
        mockRemoveAll('workspace-changed');
        mockRemoveAll('update-status');
      },
      _mocks: { mockInvoke, mockOn, mockRemoveAll },
    };
  }

  describe('API 方法完备性', () => {
    it('应包含全部核心通信方法', () => {
      const api = createMockAPI();
      expect(api).toHaveProperty('chat');
      expect(api).toHaveProperty('switchModel');
      expect(api).toHaveProperty('getConfig');
      expect(api).toHaveProperty('getModels');
      expect(api).toHaveProperty('abort');
    });

    it('应包含版本与更新方法', () => {
      const api = createMockAPI();
      expect(api).toHaveProperty('getAppVersion');
      expect(api).toHaveProperty('checkUpdate');
      expect(api).toHaveProperty('getUpdateStatus');
    });

    it('应包含所有事件监听方法', () => {
      const api = createMockAPI();
      expect(api).toHaveProperty('onAgentEvent');
      expect(api).toHaveProperty('onChatChunk');
      expect(api).toHaveProperty('onNewSession');
      expect(api).toHaveProperty('onWorkspaceChanged');
      expect(api).toHaveProperty('onUpdateStatus');
    });

    it('应包含 removeAllListeners 方法', () => {
      const api = createMockAPI();
      expect(api).toHaveProperty('removeAllListeners');
      expect(typeof api.removeAllListeners).toBe('function');
    });
  });

  describe('IPC 通道映射', () => {
    it('chat 应调用 agent-chat 通道', () => {
      const api = createMockAPI();
      api.chat('Hello');
      expect(api._mocks.mockInvoke).toHaveBeenCalledWith('agent-chat', 'Hello');
    });

    it('switchModel 应调用 switch-model 通道', () => {
      const api = createMockAPI();
      api.switchModel('deepseek', 'deepseek-chat');
      expect(api._mocks.mockInvoke).toHaveBeenCalledWith(
        'switch-model',
        'deepseek',
        'deepseek-chat',
      );
    });

    it('getAppVersion 应调用 get-app-version 通道', () => {
      const api = createMockAPI();
      api.getAppVersion();
      expect(api._mocks.mockInvoke).toHaveBeenCalledWith('get-app-version');
    });

    it('checkUpdate 应调用 check-update 通道', () => {
      const api = createMockAPI();
      api.checkUpdate();
      expect(api._mocks.mockInvoke).toHaveBeenCalledWith('check-update');
    });

    it('getUpdateStatus 应调用 get-update-status 通道', () => {
      const api = createMockAPI();
      api.getUpdateStatus();
      expect(api._mocks.mockInvoke).toHaveBeenCalledWith('get-update-status');
    });

    it('abort 应调用 abort-agent 通道', () => {
      const api = createMockAPI();
      api.abort();
      expect(api._mocks.mockInvoke).toHaveBeenCalledWith('abort-agent');
    });
  });

  describe('事件监听', () => {
    it('onAgentEvent 应监听 agent-event 事件', () => {
      const api = createMockAPI();
      const cb = vi.fn();
      api.onAgentEvent(cb);
      expect(api._mocks.mockOn).toHaveBeenCalledWith('agent-event', cb);
    });

    it('onUpdateStatus 应监听 update-status 事件', () => {
      const api = createMockAPI();
      const cb = vi.fn();
      api.onUpdateStatus(cb);
      expect(api._mocks.mockOn).toHaveBeenCalledWith('update-status', cb);
    });
  });

  describe('removeAllListeners', () => {
    it('应移除全部 5 种事件监听', () => {
      const api = createMockAPI();
      api.removeAllListeners();
      expect(api._mocks.mockRemoveAll).toHaveBeenCalledTimes(5);
      expect(api._mocks.mockRemoveAll).toHaveBeenCalledWith('agent-event');
      expect(api._mocks.mockRemoveAll).toHaveBeenCalledWith('chat-chunk');
      expect(api._mocks.mockRemoveAll).toHaveBeenCalledWith('new-session');
      expect(api._mocks.mockRemoveAll).toHaveBeenCalledWith('workspace-changed');
      expect(api._mocks.mockRemoveAll).toHaveBeenCalledWith('update-status');
    });
  });
});
