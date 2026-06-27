/**
 * Web main.tsx 测试 — 平台适配器入口冒烟
 *
 * 验证:
 * 1. Web 入口正确导入 mountApp
 * 2. 传入正确的 Web 配置（空 apiBase、"/ws" wsBase、isDesktop=false）
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

describe('Web 平台适配器入口', () => {
  let mountSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mountSpy = vi.fn();
    // Mock @easyagent/frontend 的 mountApp
    vi.doMock('@easyagent/frontend', () => ({
      mountApp: mountSpy,
    }));

    // 确保 #root 容器存在
    if (!document.getElementById('root')) {
      const root = document.createElement('div');
      root.id = 'root';
      document.body.appendChild(root);
    }
  });

  afterEach(() => {
    vi.resetModules();
    document.body.innerHTML = '';
  });

  it('应成功导入 mountApp 函数', async () => {
    const { mountApp } = await import('@easyagent/frontend');
    expect(mountApp).toBeDefined();
    expect(typeof mountApp).toBe('function');
  });

  it('入口调用 mountApp 时应传入 Web 模式配置', async () => {
    // 动态导入入口文件会触发 mountApp 调用
    mountSpy.mockImplementation(() => {});

    await import('../main');

    expect(mountSpy).toHaveBeenCalledTimes(1);
    const [config, useHashRouter] = mountSpy.mock.calls[0];

    expect(config).toEqual({
      apiBase: '',
      wsBase: '/ws',
      isDesktop: false,
    });
    expect(useHashRouter).toBe(true);
  });
});
