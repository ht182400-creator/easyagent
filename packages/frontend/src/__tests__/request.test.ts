/**
 * request.ts 测试 — 模块级 API/WS/Desktop 配置的 setter/getter
 *
 * 这是全局共享请求模块的核心，ConfigProvider 通过它注入运行时配置，
 * Store 内的 apiRequest() 依赖 _apiBase 发起请求。
 * 验证所有 setter/getter 的读写正确性及模块隔离。
 */
import { describe, it, expect, beforeEach } from 'vitest';
import {
  setApiBase,
  getApiBase,
  setWsBase,
  getWsBase,
  setIsDesktop,
  getIsDesktop,
} from '../request';

describe('request 模块级配置', () => {
  beforeEach(() => {
    // 每个测试前重置为默认值
    setApiBase('');
    setWsBase('/ws');
    setIsDesktop(false);
  });

  describe('apiBase', () => {
    it('默认值应为空字符串（Web 模式）', () => {
      expect(getApiBase()).toBe('');
    });

    it('应能设置并获取 apiBase', () => {
      setApiBase('http://127.0.0.1:3456');
      expect(getApiBase()).toBe('http://127.0.0.1:3456');
    });

    it('应能设置相对路径', () => {
      setApiBase('/api/v2');
      expect(getApiBase()).toBe('/api/v2');
    });

    it('应能设置为带端口的完整URL', () => {
      setApiBase('https://api.example.com:8443');
      expect(getApiBase()).toBe('https://api.example.com:8443');
    });
  });

  describe('wsBase', () => {
    it('默认值应为 "/ws"', () => {
      expect(getWsBase()).toBe('/ws');
    });

    it('应能设置并获取 wsBase', () => {
      setWsBase('ws://127.0.0.1:3456/ws');
      expect(getWsBase()).toBe('ws://127.0.0.1:3456/ws');
    });

    it('应支持 WSS 协议', () => {
      setWsBase('wss://api.example.com/ws');
      expect(getWsBase()).toBe('wss://api.example.com/ws');
    });
  });

  describe('isDesktop', () => {
    it('默认值应为 false（Web 模式）', () => {
      expect(getIsDesktop()).toBe(false);
    });

    it('应能设置为 true（Desktop 模式）', () => {
      setIsDesktop(true);
      expect(getIsDesktop()).toBe(true);
    });

    it('应能从 true 切换回 false', () => {
      setIsDesktop(true);
      expect(getIsDesktop()).toBe(true);
      setIsDesktop(false);
      expect(getIsDesktop()).toBe(false);
    });
  });

  describe('模块隔离', () => {
    it('各配置项应相互独立不污染', () => {
      setApiBase('http://desktop:3456');
      setWsBase('ws://desktop:3456/ws');
      setIsDesktop(true);

      expect(getApiBase()).toBe('http://desktop:3456');
      expect(getWsBase()).toBe('ws://desktop:3456/ws');
      expect(getIsDesktop()).toBe(true);

      // 修改一个不应影响另一个
      setApiBase('');
      expect(getApiBase()).toBe('');
      expect(getWsBase()).toBe('ws://desktop:3456/ws');
    });
  });
});
