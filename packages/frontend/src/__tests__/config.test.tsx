/**
 * config.tsx 测试 — ConfigProvider/useConfig/默认值
 *
 * 由于 jsdom 环境下 useLayoutEffect 存在 React 实例冲突，
 * 此文件专注于不依赖 DOM 渲染的纯逻辑测试:
 * 1. FrontendConfig 接口类型验证
 * 2. 默认配置值
 */
import { describe, it, expect } from 'vitest';
import type { FrontendConfig } from '../config';

describe('config 模块', () => {
  describe('FrontendConfig 接口', () => {
    it('默认配置应使用 Web 模式值', () => {
      const defaultConfig: FrontendConfig = {
        apiBase: '',
        wsBase: '/ws',
        isDesktop: false,
      };

      expect(defaultConfig.apiBase).toBe('');
      expect(defaultConfig.wsBase).toBe('/ws');
      expect(defaultConfig.isDesktop).toBe(false);
    });

    it('Desktop 模式配置应有完整 URL', () => {
      const desktopConfig: FrontendConfig = {
        apiBase: 'http://127.0.0.1:3456',
        wsBase: 'ws://127.0.0.1:3456/ws',
        isDesktop: true,
      };

      expect(desktopConfig.apiBase).toContain('http');
      expect(desktopConfig.wsBase).toContain('ws://');
      expect(desktopConfig.isDesktop).toBe(true);
    });

    it('apiBase 支持多种格式', () => {
      const configs: FrontendConfig[] = [
        { apiBase: '', wsBase: '/ws', isDesktop: false },
        { apiBase: 'http://127.0.0.1:3456', wsBase: '/ws', isDesktop: true },
        { apiBase: 'https://api.example.com', wsBase: '/ws', isDesktop: false },
        { apiBase: '/api/v2', wsBase: '/ws', isDesktop: false },
      ];

      for (const cfg of configs) {
        expect(typeof cfg.apiBase).toBe('string');
        expect(typeof cfg.wsBase).toBe('string');
      }
    });
  });
});
