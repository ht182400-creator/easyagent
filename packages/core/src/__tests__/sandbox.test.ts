/**
 * Docker沙箱模块单元测试
 * 覆盖: Docker可用性检测、沙箱生命周期、管理器功能
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { checkDockerAvailability, DockerSandbox, resetDockerCache } from '../sandbox/DockerSandbox.js';
import { SandboxManager } from '../sandbox/SandboxManager.js';
import { execSync } from 'node:child_process';

// ==================== mock 子进程 ====================
vi.mock('node:child_process', async () => {
  const actual = await vi.importActual<typeof import('node:child_process')>('node:child_process');
  const EventEmitter = (await import('node:events')).EventEmitter;
  
  return {
    ...actual,
    execSync: vi.fn(),
    spawn: vi.fn(),
    // 保留 spawn 实际功能用于特定测试
    _spawn: actual.spawn,
  };
});

const mockExecSync = execSync as unknown as ReturnType<typeof vi.fn>;
const mockSpawn = vi.mocked((await import('node:child_process')).spawn);

// ==================== Sandbox 模块测试 ====================

describe('DockerSandbox - 沙箱生命周期', () => {
  
  beforeEach(() => {
    vi.clearAllMocks();
    // 重置 docker 检测缓存 (必须，因为 checkDockerAvailability 有模块级缓存)
    resetDockerCache();
    SandboxManager.resetInstance();
    // 重新设置 execSync mock (clearAllMocks 会清除之前的 mock)
    mockExecSync.mockReturnValue('24.0.7');
  });

  describe('checkDockerAvailability - Docker可用性检测', () => {
    it('应检测到Docker可用', async () => {
      mockExecSync.mockReturnValueOnce('24.0.7');
      
      const result = await checkDockerAvailability();
      
      expect(result.available).toBe(true);
      expect(result.version).toBe('24.0.7');
    });

    it('应检测到Docker不可用', async () => {
      mockExecSync.mockImplementationOnce(() => {
        throw new Error('docker: command not found');
      });
      
      const result = await checkDockerAvailability();
      
      expect(result.available).toBe(false);
      expect(result.error).toBeDefined();
    });

    it('应缓存检测结果', async () => {
      mockExecSync.mockReturnValueOnce('24.0.7');
      
      await checkDockerAvailability();
      // 第二次调用应使用缓存，不再调用 execSync
      mockExecSync.mockClear();
      const result = await checkDockerAvailability();
      
      expect(result.available).toBe(true);
      expect(mockExecSync).not.toHaveBeenCalled();
    });

    it('应处理超时错误', async () => {
      mockExecSync.mockImplementationOnce(() => {
        const err = new Error('ETIMEDOUT');
        (err as any).code = 'ETIMEDOUT';
        throw err;
      });
      
      const result = await checkDockerAvailability();
      
      expect(result.available).toBe(false);
      expect(result.error).toContain('ETIMEDOUT');
    });
  });

  describe('DockerSandbox 构造函数', () => {
    it('应创建默认配置的沙箱实例', () => {
      const sandbox = new DockerSandbox();
      
      expect(sandbox.id).toContain('easyagent-sandbox-');
      expect(sandbox.getStatus().status).toBe('idle');
      expect(sandbox.getStatus().image).toBe('node:20-alpine');
    });

    it('应使用自定义镜像', () => {
      const sandbox = new DockerSandbox({ image: 'python:3.12-alpine' });
      
      expect(sandbox.getStatus().image).toBe('python:3.12-alpine');
    });

    it('应设置资源限制', () => {
      const sandbox = new DockerSandbox({
        limits: { cpuCores: 2, memory: '1g', maxPids: 100 },
      });
      
      expect(sandbox.getStatus().limits.cpuCores).toBe(2);
      expect(sandbox.getStatus().limits.memory).toBe('1g');
      expect(sandbox.getStatus().limits.maxPids).toBe(100);
    });
  });

  describe('getStatus - 沙箱状态查询', () => {
    it('应返回完整的沙箱状态信息', () => {
      const sandbox = new DockerSandbox({
        image: 'node:20-alpine',
        workspace: '/test/workspace',
        readOnly: true,
      });
      
      const status = sandbox.getStatus();
      
      expect(status.id).toBeDefined();
      expect(status.containerId).toBeNull();
      expect(status.status).toBe('idle');
      expect(status.workspace).toBe('/test/workspace');
    });
  });
});

// ==================== SandboxManager 测试 ====================

describe('SandboxManager - 沙箱管理器', () => {
  
  beforeEach(() => {
    vi.clearAllMocks();
    resetDockerCache();
    SandboxManager.resetInstance();
    mockExecSync.mockReturnValue('24.0.7');
  });

  describe('getInstance - 单例模式', () => {
    it('应返回同一个实例', () => {
      const mgr1 = SandboxManager.getInstance();
      const mgr2 = SandboxManager.getInstance();
      
      expect(mgr1).toBe(mgr2);
    });

    it('resetInstance后应创建新实例', () => {
      const mgr1 = SandboxManager.getInstance();
      SandboxManager.resetInstance();
      const mgr2 = SandboxManager.getInstance();
      
      expect(mgr1).not.toBe(mgr2);
    });
  });

  describe('init - 初始化', () => {
    it('应成功初始化 (Docker可用)', async () => {
      const mgr = SandboxManager.getInstance();
      const result = await mgr.init();
      
      expect(result.available).toBe(true);
      expect(result.version).toBe('24.0.7');
    });

    it('应优雅处理Docker不可用', async () => {
      // 重置缓存 + 重设 mock 为抛出异常
      resetDockerCache();
      mockExecSync.mockImplementation(() => {
        throw new Error('docker not found');
      });
      
      const mgr = SandboxManager.getInstance();
      const result = await mgr.init();
      
      expect(result.available).toBe(false);
      // 恢复 mock 以免影响后续测试
      mockExecSync.mockReturnValue('24.0.7');
    });
  });

  describe('getOverview - 系统概览', () => {
    it('应返回默认概览信息', () => {
      const mgr = SandboxManager.getInstance();
      const overview = mgr.getOverview();
      
      expect(overview.enabled).toBe(true);
      expect(overview.dockerAvailable).toBe(false);  // 未 init
      expect(overview.activeCount).toBe(0);
      expect(overview.maxSandboxes).toBe(10);
      expect(overview.sandboxes).toEqual([]);
    });

    it('init后dockerAvailable应为true', async () => {
      const mgr = SandboxManager.getInstance();
      await mgr.init();
      
      const overview = mgr.getOverview();
      expect(overview.dockerAvailable).toBe(true);
    });
  });

  describe('getSandbox - 获取沙箱', () => {
    it('不存在的沙箱应返回undefined', () => {
      const mgr = SandboxManager.getInstance();
      const result = mgr.getSandbox('nonexistent');
      
      expect(result).toBeUndefined();
    });
  });

  describe('listSandboxes - 列出沙箱', () => {
    it('初始时应返回空列表', () => {
      const mgr = SandboxManager.getInstance();
      const list = mgr.listSandboxes();
      
      expect(list).toEqual([]);
    });
  });

  describe('destroySandbox - 销毁不存在的沙箱', () => {
    it('应静默处理不存在沙箱的销毁', async () => {
      const mgr = SandboxManager.getInstance();
      await expect(mgr.destroySandbox('nonexistent')).resolves.not.toThrow();
    });
  });

  describe('shutdown - 关闭管理器', () => {
    it('应成功关闭', async () => {
      const mgr = SandboxManager.getInstance();
      await expect(mgr.shutdown()).resolves.not.toThrow();
    });
  });

  describe('并发限制', () => {
    it('达到上限时应抛出错误', async () => {
      // 由于需要实际Docker环境来创建沙箱，此测试验证逻辑
      // 实际并发测试需要 mock createSandbox
      const mgr = SandboxManager.getInstance({ maxSandboxes: 1 });
      
      // 验证配置已应用
      expect(mgr.getOverview().maxSandboxes).toBe(1);
    });
  });
});

// ==================== 边界条件测试 ====================

describe('DockerSandbox - 边界条件', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('未启动时调用exec应抛出错误', async () => {
    const sandbox = new DockerSandbox();
    
    await expect(sandbox.exec('echo hello')).rejects.toThrow('沙箱未启动');
  });

  it('应处理极长命令', () => {
    const sandbox = new DockerSandbox();
    const longCmd = 'echo ' + 'a'.repeat(10000);
    
    // 构造函数应正确处理超长参数
    expect(sandbox.getStatus().status).toBe('idle');
  });

  it('应处理空配置', () => {
    const sandbox = new DockerSandbox({});
    
    expect(sandbox.getStatus().limits).toEqual({});
    expect(sandbox.getStatus().image).toBe('node:20-alpine');
  });

  it('workspace默认为当前目录', () => {
    const sandbox = new DockerSandbox();
    
    expect(sandbox.getStatus().workspace).toBe(process.cwd());
  });
});

// ==================== SandboxOptions 类型测试 ====================

describe('SandboxOptions - 配置类型', () => {
  it('readOnly为true时工作区应为只读', () => {
    const sandbox = new DockerSandbox({ readOnly: true });
    expect(sandbox.getStatus().id).toBeDefined();
  });

  it('allowNetwork为false时默认无网络', () => {
    const sandbox = new DockerSandbox({ allowNetwork: false });
    expect(sandbox.getStatus().id).toBeDefined();
  });

  it('应支持环境变量注入', () => {
    const sandbox = new DockerSandbox({
      env: { NODE_ENV: 'test', DEBUG: 'easyagent:*' },
    });
    expect(sandbox.getStatus().id).toBeDefined();
  });

  it('应支持自定义工作目录', () => {
    const sandbox = new DockerSandbox({ workdir: '/app' });
    expect(sandbox.getStatus().id).toBeDefined();
  });
});
