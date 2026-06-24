/**
 * StatusBar 组件测试
 * 覆盖: 版本显示、更新状态、连接指示
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, waitFor } from '@testing-library/react';
import { StatusBar } from '@/components/layout/StatusBar';

/** Mock window.easyAgent API */
function mockEasyAgent(overrides: Record<string, unknown> = {}) {
  (window as any).easyAgent = {
    getAppVersion: vi.fn().mockResolvedValue('0.2.0'),
    onUpdateStatus: vi.fn(),
    ...overrides,
  };
}

function clearEasyAgent() {
  delete (window as any).easyAgent;
}

describe('StatusBar', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearEasyAgent();
  });

  // ==================== 基础渲染 ====================

  describe('基础渲染', () => {
    it('应显示默认版本号', async () => {
      mockEasyAgent();
      const { container } = render(<StatusBar />);

      await waitFor(() => {
        expect(container.textContent).toContain('v0.2.0');
      });
    });

    it('easyAgent 不存在时应显示默认版本', () => {
      const { container } = render(<StatusBar />);
      expect(container.textContent).toContain('v0.3.0');
    });

    it('getAppVersion 失败时应显示默认版本', async () => {
      mockEasyAgent({
        getAppVersion: vi.fn().mockRejectedValue(new Error('fail')),
      });

      const { container } = render(<StatusBar />);

      // 初始显示默认版本，错误时保持不变
      await waitFor(() => {
        expect(container.textContent).toContain('v0.3.0');
      });
    });

    it('应显示绿色连接指示灯', () => {
      const { container } = render(<StatusBar />);
      const dot = container.querySelector('.rounded-full.bg-green-500');
      expect(dot).toBeTruthy();
    });

    it('应显示工具数量', () => {
      const { container } = render(<StatusBar />);
      expect(container.textContent).toContain('工具: 51');
    });
  });

  // ==================== 更新状态 ====================

  describe('更新状态显示', () => {
    it('更新可用时应显示提示', async () => {
      mockEasyAgent({
        onUpdateStatus: vi.fn((cb: (s: unknown) => void) => {
          cb({ status: 'available', version: '1.0.0' });
        }),
      });

      const { container } = render(<StatusBar />);

      await waitFor(() => {
        expect(container.textContent).toContain('更新可用');
      });
    });

    it('下载中应显示进度', async () => {
      mockEasyAgent({
        onUpdateStatus: vi.fn((cb: (s: unknown) => void) => {
          cb({ status: 'downloading', percent: 46 });
        }),
      });

      const { container } = render(<StatusBar />);

      await waitFor(() => {
        expect(container.textContent).toContain('下载中');
        expect(container.textContent).toContain('46%');
      });
    });

    it('下载完成应显示安装提示', async () => {
      mockEasyAgent({
        onUpdateStatus: vi.fn((cb: (s: unknown) => void) => {
          cb({ status: 'downloaded' });
        }),
      });

      const { container } = render(<StatusBar />);

      await waitFor(() => {
        expect(container.textContent).toContain('重启以安装更新');
      });
    });

    it('无更新状态时不应显示更新信息', () => {
      mockEasyAgent({
        onUpdateStatus: vi.fn((cb: (s: unknown) => void) => {
          cb(null);
        }),
      });

      const { container } = render(<StatusBar />);
      expect(container.textContent).not.toContain('更新可用');
      expect(container.textContent).not.toContain('下载中');
      expect(container.textContent).not.toContain('重启');
    });
  });
});
