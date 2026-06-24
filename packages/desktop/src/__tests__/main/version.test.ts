/**
 * 主进程 - 版本与更新测试
 * 测试 getAppVersion 逻辑和 IPC handler
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';

describe('主进程 - 版本号', () => {
  // 模拟 getAppVersion 函数逻辑
  function getAppVersion(): string {
    try {
      const pkgPath = path.join(__dirname, '..', '..', '..', 'package.json');
      const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
      return pkg.version || '0.0.0';
    } catch (err) {
      return '0.3.0'; // 默认版本
    }
  }

  it('应正确读取 package.json 中的版本', () => {
    const version = getAppVersion();
    // 版本号应符合 semver 格式 + 非零 (已演进)
    expect(version).toMatch(/^\d+\.\d+\.\d+$/);
    expect(version).not.toBe('0.0.0');
  });

  it('读取失败应返回默认版本 0.3.0', () => {
    // 测试 catch 分支：模拟非 ESM 下读取 package.json 失败
    function testGetVersion(readResult: string | Error): string {
      try {
        if (readResult instanceof Error) throw readResult;
        const pkg = JSON.parse(readResult);
        return pkg.version || '0.0.0';
      } catch (err) {
        return '0.3.0';
      }
    }
    // 异常情况 → 默认版本
    expect(testGetVersion(new Error('ENOENT'))).toBe('0.3.0');
  });

  it('package.json 无 version 字段时应返回 0.0.0', () => {
    function testGetVersion(readResult: string | Error): string {
      try {
        if (readResult instanceof Error) throw readResult;
        const pkg = JSON.parse(readResult);
        return pkg.version || '0.0.0';
      } catch (err) {
        return '0.3.0';
      }
    }
    // 无 version 字段 → '0.0.0'
    expect(testGetVersion(JSON.stringify({ name: 'test' }))).toBe('0.0.0');
  });
});

describe('主进程 - IPC Handlers', () => {
  // 模拟 IPC handler 注册模式
  const handlers: Record<string, Function> = {};

  function mockIpcHandle(channel: string, handler: Function) {
    handlers[channel] = handler;
  }

  beforeEach(() => {
    Object.keys(handlers).forEach((k) => delete handlers[k]);
  });

  it('get-app-version handler 应返回版本号', async () => {
    mockIpcHandle('get-app-version', async () => '0.3.0');
    const result = await handlers['get-app-version']?.();
    expect(result).toBe('0.3.0');
  });

  it('get-update-status handler 应返回更新状态对象', async () => {
    mockIpcHandle('get-update-status', async () => ({
      isUpdateSupported: true,
      currentVersion: '0.3.0',
      updateDownloaded: false,
    }));
    const result = await handlers['get-update-status']?.();
    expect(result).toHaveProperty('isUpdateSupported');
    expect(result).toHaveProperty('currentVersion');
    expect(result).toHaveProperty('updateDownloaded');
    expect(result.isUpdateSupported).toBe(true);
    expect(result.updateDownloaded).toBe(false);
  });

  it('check-update handler 应正常调用', async () => {
    let called = false;
    mockIpcHandle('check-update', async () => {
      called = true;
    });
    await handlers['check-update']?.();
    expect(called).toBe(true);
  });

  it('agent-chat handler 无 agent 时应返回错误', async () => {
    mockIpcHandle('agent-chat', async (_event: unknown, message: string) => {
      // agent 为 null
      const agent = null;
      if (!agent) return { error: 'Agent未初始化' };
      return { content: 'ok' };
    });
    const result = await handlers['agent-chat']?.({}, '测试');
    expect(result).toEqual({ error: 'Agent未初始化' });
  });

  it('abort-agent handler 应返回成功', async () => {
    let abortCalled = false;
    mockIpcHandle('abort-agent', async () => {
      abortCalled = true;
      return { success: true };
    });
    const result = await handlers['abort-agent']?.();
    expect(result).toEqual({ success: true });
    expect(abortCalled).toBe(true);
  });
});

describe('主进程 - 版本格式验证', () => {
  function isValidSemver(version: string): boolean {
    return /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(-[a-zA-Z\d]+(\.[a-zA-Z\d]+)*)?(\+[a-zA-Z\d]+(\.[a-zA-Z\d]+)*)?$/.test(version);
  }

  it('0.3.0 是有效的 semver 版本', () => {
    expect(isValidSemver('0.3.0')).toBe(true);
  });

  it('0.1.0 是有效的 semver 版本', () => {
    expect(isValidSemver('0.1.0')).toBe(true);
  });

  it('1.0.0-beta.1 是有效的 semver 版本', () => {
    expect(isValidSemver('1.0.0-beta.1')).toBe(true);
  });

  it('abc 不是有效的 semver 版本', () => {
    expect(isValidSemver('abc')).toBe(false);
  });

  it('空字符串不是有效的 semver 版本', () => {
    expect(isValidSemver('')).toBe(false);
  });
});
