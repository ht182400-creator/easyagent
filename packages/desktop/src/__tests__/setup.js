/**
 * 测试全局 Setup
 * 配置 jsdom 环境、mock Electron API
 */
import '@testing-library/jest-dom';
import { vi } from 'vitest';
// Mock scrollIntoView - jsdom 不支持
Element.prototype.scrollIntoView = vi.fn();
// Mock Electron 的 window.easyAgent (contextBridge 暴露的 API)
// 各测试可以覆盖此 mock
const mockApi = {
    chat: vi.fn().mockResolvedValue({}),
    switchModel: vi.fn().mockResolvedValue({ success: true }),
    getConfig: vi.fn().mockResolvedValue({}),
    getModels: vi.fn().mockResolvedValue([]),
    abort: vi.fn(),
    getAppVersion: vi.fn().mockResolvedValue('0.2.0'),
    checkUpdate: vi.fn(),
    getUpdateStatus: vi.fn().mockResolvedValue({
        isUpdateSupported: false,
        currentVersion: '0.2.0',
        updateDownloaded: false,
    }),
    onAgentEvent: vi.fn(),
    onChatChunk: vi.fn(),
    onNewSession: vi.fn(),
    onWorkspaceChanged: vi.fn(),
    onUpdateStatus: vi.fn(),
    removeAllListeners: vi.fn(),
};
// 默认不设置 easyAgent，各测试按需 mock
//# sourceMappingURL=setup.js.map