/**
 * 设置页面 - 自动更新 UI 测试
 *
 * 验证 Settings.tsx 中更新状态卡片的 6 种状态渲染
 * 使用 mock window.easyAgent 模拟桌面环境
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, fireEvent, cleanup } from '@testing-library/react';
import { useAppStore } from '@/stores/appStore';
import { useSettingsStore } from '@/stores/settingsStore';

// ==================== Mock 模块 ====================

// Mock fetch for version API
const mockFetch = vi.fn();
global.fetch = mockFetch;

// Mock @/request 模块
vi.mock('@/request', () => ({
  apiRequest: vi.fn(),
  setApiBase: vi.fn(),
  getApiBase: vi.fn(() => 'http://127.0.0.1:3456'),
}));

// ==================== 测试辅助函数 ====================

/**
 * 挂载 mock 的 easyAgent API 到 window
 */
function mockEasyAgent(overrides: Record<string, unknown> = {}) {
  (window as any).easyAgent = {
    getAppVersion: vi.fn().mockResolvedValue('0.5.20'),
    checkUpdate: vi.fn().mockResolvedValue({ success: true, status: 'idle' }),
    getUpdateStatus: vi.fn().mockResolvedValue({
      isUpdateSupported: true,
      currentVersion: '0.5.20',
      lastUpdateStatus: 'idle',
      lastUpdateInfo: {},
    }),
    installUpdate: vi.fn().mockResolvedValue({ success: true, status: 'installing' }),
    onUpdateStatus: vi.fn().mockReturnValue(vi.fn()), // 返回清理函数
    onAgentEvent: vi.fn().mockReturnValue(vi.fn()),
    onChatChunk: vi.fn().mockReturnValue(vi.fn()),
    onNewSession: vi.fn().mockReturnValue(vi.fn()),
    onWorkspaceChanged: vi.fn().mockReturnValue(vi.fn()),
    onNavigate: vi.fn().mockReturnValue(vi.fn()),
    removeAllListeners: vi.fn(),
    ...overrides,
  };
}

/**
 * 清除 easyAgent mock
 */
function clearEasyAgent() {
  delete (window as any).easyAgent;
}

/**
 * Mock SettingsStore 默认状态
 */
function setupStores() {
  useAppStore.setState({
    theme: 'dark' as const,
    connected: true,
  });
  useSettingsStore.setState({
    agent: { maxTurns: 25, temperature: 0.7, allowTools: true },
    security: { requireConfirmation: true, dailyTokenLimit: 1000000 },
    preferences: { theme: 'dark', sendBehavior: 'enter', autoScroll: true },
    saving: false,
  });
}

// ==================== 导入被测组件 ====================

// 动态导入以避免在模块级别触发副作用
async function importSettingsPage() {
  const mod = await import('@/pages/Settings');
  return mod.default;
}

// ==================== 测试套件 ====================

describe('Settings 页面 - 自动更新 UI', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupStores();
    mockFetch.mockReset();
    // 默认 fetch 返回（version API）
    mockFetch.mockResolvedValue({
      json: () => Promise.resolve({
        version: '0.5.20',
        codename: 'Test',
        releaseDate: '2026-06-26',
        changelog: 'Test changelog',
      }),
    });
    mockEasyAgent();
  });

  afterEach(() => {
    cleanup();
    clearEasyAgent();
    vi.resetModules(); // 清除动态导入缓存，确保测试隔离
  });

  // ============ 基础渲染测试 ============

  describe('基础渲染', () => {
    it('应渲染"检查更新"按钮', async () => {
      const SettingsPage = await importSettingsPage();
      render(<SettingsPage />);

      await waitFor(() => {
        expect(screen.getByText('检查更新')).toBeDefined();
      });
    });

    it('应显示当前版本号', async () => {
      const SettingsPage = await importSettingsPage();
      render(<SettingsPage />);

      await waitFor(() => {
        expect(screen.getByText(/v0\.5\.20/)).toBeDefined();
      });
    });

  });

  // ============ 状态卡片样式函数测试（组件外纯函数） ============

  describe('状态辅助函数 - getStatusCardStyle', () => {
    // 直接测试纯函数逻辑（通过 UI 验证）
    it('downloading 状态应显示蓝色卡片+进度条', async () => {
      mockEasyAgent({
        getUpdateStatus: vi.fn().mockResolvedValue({
          isUpdateSupported: true,
          currentVersion: '0.5.20',
          lastUpdateStatus: 'downloading',
          lastUpdateInfo: { version: '0.5.21', percent: 45 },
        }),
        onUpdateStatus: vi.fn().mockReturnValue(vi.fn()),
      });

      const SettingsPage = await importSettingsPage();
      render(<SettingsPage />);

      await waitFor(() => {
        // 应显示下载标题
        expect(screen.getByText(/正在下载/)).toBeDefined();
        // 应显示进度文本
        expect(screen.getByText('下载中')).toBeDefined();
        // 应显示百分比
        expect(screen.getByText('45.0%')).toBeDefined();
      });
    });

    it('error 状态应显示黄色卡片+重试按钮', async () => {
      mockEasyAgent({
        getUpdateStatus: vi.fn().mockResolvedValue({
          isUpdateSupported: true,
          currentVersion: '0.5.20',
          lastUpdateStatus: 'error',
          lastUpdateInfo: { version: '0.5.21', error: 'ETIMEDOUT' },
        }),
        onUpdateStatus: vi.fn().mockReturnValue(vi.fn()),
      });

      const SettingsPage = await importSettingsPage();
      render(<SettingsPage />);

      await waitFor(() => {
        expect(screen.getByText('更新失败')).toBeDefined();
        expect(screen.getByText('重试')).toBeDefined();
      });
    });

    it('checking 状态应显示蓝色卡片', async () => {
      mockEasyAgent({
        getUpdateStatus: vi.fn().mockResolvedValue({
          isUpdateSupported: true,
          currentVersion: '0.5.20',
          lastUpdateStatus: 'checking',
          lastUpdateInfo: {},
        }),
        onUpdateStatus: vi.fn().mockReturnValue(vi.fn()),
      });

      const SettingsPage = await importSettingsPage();
      render(<SettingsPage />);

      await waitFor(() => {
        expect(screen.getByText(/正在检查更新/)).toBeDefined();
      });
    });

    it('installing 状态应显示紫色卡片', async () => {
      mockEasyAgent({
        getUpdateStatus: vi.fn().mockResolvedValue({
          isUpdateSupported: true,
          currentVersion: '0.5.20',
          lastUpdateStatus: 'installing',
          lastUpdateInfo: { version: '0.5.21' },
        }),
        onUpdateStatus: vi.fn().mockReturnValue(vi.fn()),
      });

      const SettingsPage = await importSettingsPage();
      render(<SettingsPage />);

      await waitFor(() => {
        expect(screen.getByText(/正在安装更新/)).toBeDefined();
      });
    });
  });

  // ============ 按钮行为测试 ============

  describe('按钮行为', () => {
    it('点击"立即重启安装"应调用 installUpdate', async () => {
      const mockInstallUpdate = vi.fn().mockResolvedValue({ success: true, status: 'installing' });

      mockEasyAgent({
        getUpdateStatus: vi.fn().mockResolvedValue({
          isUpdateSupported: true,
          currentVersion: '0.5.20',
          lastUpdateStatus: 'downloaded',
          lastUpdateInfo: { version: '0.5.21' },
        }),
        installUpdate: mockInstallUpdate,
        onUpdateStatus: vi.fn().mockReturnValue(vi.fn()),
      });

      const SettingsPage = await importSettingsPage();
      render(<SettingsPage />);

      await waitFor(() => {
        expect(screen.getByText('立即重启安装')).toBeDefined();
      });

      fireEvent.click(screen.getByText('立即重启安装'));

      await waitFor(() => {
        expect(mockInstallUpdate).toHaveBeenCalled();
      });
    });

    it('点击"重试"应调用 checkForUpdates', async () => {
      const mockCheckUpdate = vi.fn().mockResolvedValue({ success: true, status: 'idle' });

      mockEasyAgent({
        getUpdateStatus: vi.fn().mockResolvedValue({
          isUpdateSupported: true,
          currentVersion: '0.5.20',
          lastUpdateStatus: 'error',
          lastUpdateInfo: { error: 'ETIMEDOUT' },
        }),
        checkUpdate: mockCheckUpdate,
        onUpdateStatus: vi.fn().mockReturnValue(vi.fn()),
      });

      const SettingsPage = await importSettingsPage();
      render(<SettingsPage />);

      await waitFor(() => {
        expect(screen.getByText('重试')).toBeDefined();
      });

      fireEvent.click(screen.getByText('重试'));

      // 点击"重试"会触发 checkForUpdates()，其中会调用 Server API
      // 然后调用 checkUpdate IPC
      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalled();
      });
    });

  });

  // ============ 事件监听测试 ============

  describe('事件监听', () => {
    it('应注册 onUpdateStatus 监听器', async () => {
      const mockOnUpdateStatus = vi.fn().mockReturnValue(vi.fn());

      mockEasyAgent({
        getUpdateStatus: vi.fn().mockResolvedValue({
          isUpdateSupported: true,
          currentVersion: '0.5.20',
          lastUpdateStatus: 'idle',
          lastUpdateInfo: {},
        }),
        onUpdateStatus: mockOnUpdateStatus,
      });

      const SettingsPage = await importSettingsPage();
      render(<SettingsPage />);

      await waitFor(() => {
        expect(mockOnUpdateStatus).toHaveBeenCalled();
      });
    });

    it('组件卸载时应清理监听器', async () => {
      const mockCleanup = vi.fn();
      const mockOnUpdateStatus = vi.fn().mockReturnValue(mockCleanup);

      mockEasyAgent({
        getUpdateStatus: vi.fn().mockResolvedValue({
          isUpdateSupported: true,
          currentVersion: '0.5.20',
          lastUpdateStatus: 'idle',
          lastUpdateInfo: {},
        }),
        onUpdateStatus: mockOnUpdateStatus,
      });

      const SettingsPage = await importSettingsPage();
      const { unmount } = render(<SettingsPage />);

      await waitFor(() => {
        expect(mockOnUpdateStatus).toHaveBeenCalled();
      });

      unmount();

      expect(mockCleanup).toHaveBeenCalled();
    });
  });

  // ============ 非桌面环境降级测试 ============

  describe('非桌面环境', () => {
    it('没有 easyAgent 时不应崩溃', async () => {
      clearEasyAgent();

      const SettingsPage = await importSettingsPage();
      // 不应抛出错误
      expect(() => render(<SettingsPage />)).not.toThrow();
    });

    it('没有 easyAgent 时仍显示检查更新按钮', async () => {
      clearEasyAgent();

      const SettingsPage = await importSettingsPage();
      render(<SettingsPage />);

      await waitFor(() => {
        expect(screen.getByText('检查更新')).toBeDefined();
      });
    });
  });

  // ============ 状态卡片不渲染场景 ============

  describe('状态卡片条件渲染', () => {
    it('idle 状态且无 updateInfo 时不显示状态卡片', async () => {
      mockEasyAgent({
        getUpdateStatus: vi.fn().mockResolvedValue({
          isUpdateSupported: true,
          currentVersion: '0.5.20',
          lastUpdateStatus: 'idle',
          lastUpdateInfo: {},
        }),
        onUpdateStatus: vi.fn().mockReturnValue(vi.fn()),
      });

      const SettingsPage = await importSettingsPage();
      render(<SettingsPage />);

      await waitFor(() => {
        expect(screen.getByText('检查更新')).toBeDefined();
      });

      // idle 状态不应显示状态卡片
      expect(screen.queryByText(/正在检查更新/)).toBeNull();
      expect(screen.queryByText(/发现新版本/)).toBeNull();
      expect(screen.queryByText(/正在下载/)).toBeNull();
      expect(screen.queryByText(/已下载/)).toBeNull();
      expect(screen.queryByText('更新失败')).toBeNull();
    });
  });
});

// ==================== 纯函数测试（不依赖 DOM） ====================

/**
 * 测试 Settings.tsx 中导出的状态辅助函数
 * 这些是纯函数，测试结果稳定可靠
 */
describe('Settings 页面 - 状态辅助函数（纯函数测试）', () => {
  // 动态导入以获取导出的函数
  let getStatusCardStyle: (status: string) => string;
  let getStatusTitle: (status: string, version?: string) => string;
  let getStatusDescription: (status: string) => string;
  let getStatusAction: (status: string) => boolean;

  beforeAll(async () => {
    const mod = await import('@/pages/Settings');
    getStatusCardStyle = mod.getStatusCardStyle;
    getStatusTitle = mod.getStatusTitle;
    getStatusDescription = mod.getStatusDescription;
    getStatusAction = mod.getStatusAction;
  });

  describe('getStatusCardStyle', () => {
    it('downloaded → 绿色', () => {
      expect(getStatusCardStyle('downloaded')).toContain('bg-green-500');
    });
    it('downloading → 蓝色', () => {
      expect(getStatusCardStyle('downloading')).toContain('bg-blue-500');
    });
    it('checking → 蓝色', () => {
      expect(getStatusCardStyle('checking')).toContain('bg-blue-500');
    });
    it('available → 蓝色', () => {
      expect(getStatusCardStyle('available')).toContain('bg-blue-500');
    });
    it('error → 黄色', () => {
      expect(getStatusCardStyle('error')).toContain('bg-yellow-500');
    });
    it('installing → 紫色', () => {
      expect(getStatusCardStyle('installing')).toContain('bg-purple-500');
    });
    it('未知状态 → 灰色', () => {
      expect(getStatusCardStyle('unknown')).toContain('bg-gray-500');
    });
  });

  describe('getStatusTitle', () => {
    it('downloaded 有版本号 → "新版本 v0.5.21 已下载"', () => {
      expect(getStatusTitle('downloaded', '0.5.21')).toBe('新版本 v0.5.21 已下载');
    });
    it('downloaded 无版本号 → 仍包含"已下载"', () => {
      expect(getStatusTitle('downloaded')).toContain('已下载');
    });
    it('downloading → 包含"正在下载"', () => {
      expect(getStatusTitle('downloading', '0.5.21')).toContain('正在下载');
    });
    it('checking → "正在检查更新..."', () => {
      expect(getStatusTitle('checking')).toBe('正在检查更新...');
    });
    it('error → "更新失败"', () => {
      expect(getStatusTitle('error')).toBe('更新失败');
    });
    it('installing → 包含"安装"', () => {
      expect(getStatusTitle('installing')).toContain('安装');
    });
    it('available 有版本 → 包含版本号', () => {
      expect(getStatusTitle('available', '1.0.0')).toContain('v1.0.0');
    });
  });

  describe('getStatusDescription', () => {
    it('downloaded → 提示重启', () => {
      expect(getStatusDescription('downloaded')).toContain('重启');
    });
    it('error → 提示重试', () => {
      expect(getStatusDescription('error')).toContain('重试');
    });
    it('downloading → 提示后台下载', () => {
      expect(getStatusDescription('downloading')).toContain('后台');
    });
    it('idle → 空字符串', () => {
      expect(getStatusDescription('idle')).toBe('');
    });
  });

  describe('getStatusAction', () => {
    it('downloaded → 显示操作按钮', () => {
      expect(getStatusAction('downloaded')).toBe(true);
    });
    it('error → 显示操作按钮（重试）', () => {
      expect(getStatusAction('error')).toBe(true);
    });
    it('downloading → 不显示操作按钮', () => {
      expect(getStatusAction('downloading')).toBe(false);
    });
    it('checking → 不显示操作按钮', () => {
      expect(getStatusAction('checking')).toBe(false);
    });
    it('idle → 不显示操作按钮', () => {
      expect(getStatusAction('idle')).toBe(false);
    });
    it('installing → 不显示操作按钮', () => {
      expect(getStatusAction('installing')).toBe(false);
    });
  });
});
