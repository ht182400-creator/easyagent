/**
 * 插件沙箱隔离测试
 * 覆盖: PluginPermission、PluginManifest、PluginSandbox(RPC)、
 *       PluginManager 沙箱模式集成
 */
import { describe, it, expect, beforeEach, afterEach, beforeAll } from 'vitest';
import { existsSync, mkdirSync, writeFileSync, rmSync } from 'fs';
import { join, resolve } from 'path';
import { tmpdir } from 'os';

// ==================== 测试辅助函数 ====================

/** 创建临时测试插件目录 */
function createTestPlugin(dir: string, name: string, files: Record<string, string>): string {
  const pluginDir = join(dir, name);
  mkdirSync(pluginDir, { recursive: true });
  for (const [filename, content] of Object.entries(files)) {
    writeFileSync(join(pluginDir, filename), content, 'utf-8');
  }
  return pluginDir;
}

/** 运行测试后的清理 */
function cleanup(dir: string): void {
  try {
    rmSync(dir, { recursive: true, force: true });
  } catch {
    // 忽略清理错误
  }
}

// ==================== PluginPermission 测试 ====================

describe('PluginPermission - 权限检查', () => {
  let checkPermissions: Function;
  let getDangerousPermissions: Function;
  let PermissionLevels: any;
  let DANGEROUS_PERMISSIONS: any;

  beforeAll(async () => {
    const mod = await import('../plugins/PluginPermission.js');
    checkPermissions = mod.checkPermissions;
    getDangerousPermissions = mod.getDangerousPermissions;
    PermissionLevels = mod.PermissionLevels;
    DANGEROUS_PERMISSIONS = mod.DANGEROUS_PERMISSIONS;
  });

  it('空权限请求应通过', () => {
    const result = checkPermissions({}, PermissionLevels.full);
    expect(result.allowed).toBe(true);
  });

  it('只读权限应在完整权限下通过', () => {
    const result = checkPermissions(PermissionLevels.readonly, PermissionLevels.full);
    expect(result.allowed).toBe(true);
  });

  it('标准权限应在完整权限下通过', () => {
    const result = checkPermissions(PermissionLevels.standard, PermissionLevels.full);
    expect(result.allowed).toBe(true);
  });

  it('应拒绝未授权的 shell 权限', () => {
    const result = checkPermissions(
      { shell: { allow: ['git'] } },
      { fs: { read: ['**/*'] } }, // 没有 shell 权限
    );
    expect(result.allowed).toBe(false);
    expect(result.deniedPermission).toBe('shell');
    expect(result.reason).toContain('shell');
  });

  it('应拒绝不在白名单中的 shell 命令', () => {
    const result = checkPermissions(
      { shell: { allow: ['rm', 'sudo'] } },
      { shell: { allow: ['git', 'node'] } },
    );
    expect(result.allowed).toBe(false);
    expect(result.deniedPermission).toMatch(/shell\.allow/);
  });

  it('应允许白名单中的 shell 命令', () => {
    const result = checkPermissions(
      { shell: { allow: ['git', 'node'] } },
      { shell: { allow: ['git', 'node', 'npm'] } },
    );
    expect(result.allowed).toBe(true);
  });

  it('shell.allow 通配符 * 应允许所有命令', () => {
    const result = checkPermissions(
      { shell: { allow: ['rm', 'sudo', 'curl'] } },
      { shell: { allow: ['*'] } },
    );
    expect(result.allowed).toBe(true);
  });

  it('应拒绝未授权的网络权限', () => {
    const result = checkPermissions(
      { network: { allow: ['api.example.com'] } },
      { fs: { read: ['**/*'] } },
    );
    expect(result.allowed).toBe(false);
    expect(result.deniedPermission).toBe('network');
  });

  it('应拒绝未授权的文件写入权限', () => {
    const result = checkPermissions(
      { fs: { write: ['output/**'] } },
      { fs: { read: ['**/*'] } }, // 只有读权限
    );
    expect(result.allowed).toBe(false);
    expect(result.deniedPermission).toBe('fs.write');
  });

  it('无权限级别应通过完整权限检查', () => {
    const result = checkPermissions(PermissionLevels.none, PermissionLevels.full);
    expect(result.allowed).toBe(true);
  });

  it('getDangerousPermissions 应检测 shell 权限', () => {
    const dangerous = getDangerousPermissions({ shell: { allow: ['git'] } });
    expect(dangerous.length).toBeGreaterThanOrEqual(1);
    expect(dangerous[0].key).toBe('shell');
  });

  it('getDangerousPermissions 空权限应返回空数组', () => {
    const dangerous = getDangerousPermissions({});
    expect(dangerous).toEqual([]);
  });

  it('getDangerousPermissions 只读权限应返回空数组', () => {
    const dangerous = getDangerousPermissions(PermissionLevels.readonly);
    expect(dangerous).toEqual([]);
  });

  it('DANGEROUS_PERMISSIONS 应包含 shell', () => {
    expect(DANGEROUS_PERMISSIONS.shell).toBeDefined();
    expect(DANGEROUS_PERMISSIONS.shell).toContain('命令');
  });
});

describe('PluginPermission - 权限级别预设', () => {
  let PermissionLevels: any;

  beforeAll(async () => {
    const mod = await import('../plugins/PluginPermission.js');
    PermissionLevels = mod.PermissionLevels;
  });

  it('none 级别应为空权限', () => {
    expect(PermissionLevels.none).toEqual({});
  });

  it('readonly 级别应有 fs.read 权限', () => {
    expect(PermissionLevels.readonly.fs).toBeDefined();
    expect(PermissionLevels.readonly.fs!.read).toBeDefined();
    expect(PermissionLevels.readonly.fs!.write).toBeUndefined();
  });

  it('standard 级别应有 fs + network 权限', () => {
    expect(PermissionLevels.standard.fs).toBeDefined();
    expect(PermissionLevels.standard.network).toBeDefined();
  });

  it('full 级别应有 fs + network + shell 权限', () => {
    expect(PermissionLevels.full.fs).toBeDefined();
    expect(PermissionLevels.full.network).toBeDefined();
    expect(PermissionLevels.full.shell).toBeDefined();
    expect(PermissionLevels.full.shell!.allow).toContain('git');
  });
});

// ==================== PluginManifest 测试 ====================

describe('PluginManifest - manifest 加载验证', () => {
  let loadManifest: Function;
  let getManifestPath: Function;
  const tmpDir = join(tmpdir(), `easyagent-manifest-test-${Date.now()}`);

  beforeAll(async () => {
    const mod = await import('../plugins/PluginManifest.js');
    loadManifest = mod.loadManifest;
    getManifestPath = mod.getManifestPath;
  });

  beforeEach(() => {
    mkdirSync(tmpDir, { recursive: true });
  });

  afterEach(() => {
    cleanup(tmpDir);
  });

  it('缺少 manifest.json 应返回错误', () => {
    const pluginDir = createTestPlugin(tmpDir, 'test-plugin', {});
    const result = loadManifest(pluginDir);
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors[0]).toContain('缺少 manifest.json');
  });

  it('manifest.json JSON 格式错误应返回错误', () => {
    const pluginDir = createTestPlugin(tmpDir, 'test-plugin', {
      'manifest.json': '{ invalid json }',
    });
    const result = loadManifest(pluginDir);
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toContain('解析失败');
  });

  it('缺少必需字段应返回错误', () => {
    const pluginDir = createTestPlugin(tmpDir, 'test-plugin', {
      'manifest.json': JSON.stringify({ name: 'test' }),
    });
    const result = loadManifest(pluginDir);
    expect(result.valid).toBe(false);
    // 缺少 version, description, main
    expect(result.errors.length).toBe(3);
  });

  it('有效的 manifest 应通过验证', () => {
    const pluginDir = createTestPlugin(tmpDir, 'test-plugin', {
      'manifest.json': JSON.stringify({
        name: 'test-plugin',
        version: '1.0.0',
        description: 'A test plugin',
        main: 'index.js',
      }),
      'index.js': 'export default { name: "test-plugin", version: "1.0.0" };',
    });
    const result = loadManifest(pluginDir);
    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
    expect(result.manifest).toBeDefined();
    expect(result.manifest!.name).toBe('test-plugin');
    expect(result.manifest!.version).toBe('1.0.0');
  });

  it('kebab-case 无效的名称应报错', () => {
    const pluginDir = createTestPlugin(tmpDir, 'test-plugin', {
      'manifest.json': JSON.stringify({
        name: 'TestPlugin',
        version: '1.0.0',
        description: 'Test',
        main: 'index.js',
      }),
      'index.js': 'export default { name: "TestPlugin", version: "1.0.0" };',
    });
    const result = loadManifest(pluginDir);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e: string) => e.includes('kebab-case'))).toBe(true);
  });

  it('插件名过长应报错', () => {
    const longName = 'a'.repeat(65);
    const pluginDir = createTestPlugin(tmpDir, 'test-plugin', {
      'manifest.json': JSON.stringify({
        name: longName,
        version: '1.0.0',
        description: 'Test',
        main: 'index.js',
      }),
    });
    const result = loadManifest(pluginDir);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e: string) => e.includes('长度'))).toBe(true);
  });

  it('无效 semver 版本号应报错', () => {
    const pluginDir = createTestPlugin(tmpDir, 'test-plugin', {
      'manifest.json': JSON.stringify({
        name: 'test-plugin',
        version: 'v1.0',
        description: 'Test',
        main: 'index.js',
      }),
    });
    const result = loadManifest(pluginDir);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e: string) => e.includes('版本号'))).toBe(true);
  });

  it('有效的 semver 预发布版本应通过', () => {
    const pluginDir = createTestPlugin(tmpDir, 'test-plugin', {
      'manifest.json': JSON.stringify({
        name: 'test-plugin',
        version: '1.0.0-alpha.1',
        description: 'A test plugin',
        main: 'index.js',
      }),
      'index.js': 'export default { name: "test-plugin", version: "1.0.0-alpha.1" };',
    });
    const result = loadManifest(pluginDir);
    expect(result.valid).toBe(true);
  });

  it('入口文件路径包含 .. 应拒绝（安全限制）', () => {
    const pluginDir = createTestPlugin(tmpDir, 'test-plugin', {
      'manifest.json': JSON.stringify({
        name: 'test-plugin',
        version: '1.0.0',
        description: 'Test',
        main: '../etc/passwd',
      }),
    });
    const result = loadManifest(pluginDir);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e: string) => e.includes('..'))).toBe(true);
  });

  it('入口文件路径以 / 开头应拒绝（安全限制）', () => {
    const pluginDir = createTestPlugin(tmpDir, 'test-plugin', {
      'manifest.json': JSON.stringify({
        name: 'test-plugin',
        version: '1.0.0',
        description: 'Test',
        main: '/etc/passwd',
      }),
    });
    const result = loadManifest(pluginDir);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e: string) => e.includes('绝对路径'))).toBe(true);
  });

  it('入口文件缺失应报错', () => {
    const pluginDir = createTestPlugin(tmpDir, 'test-plugin', {
      'manifest.json': JSON.stringify({
        name: 'test-plugin',
        version: '1.0.0',
        description: 'A test plugin',
        main: 'missing.js',
      }),
    });
    const result = loadManifest(pluginDir);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e: string) => e.includes('不存在'))).toBe(true);
  });

  it('含 shell 权限应有危险权限警告', () => {
    const pluginDir = createTestPlugin(tmpDir, 'test-plugin', {
      'manifest.json': JSON.stringify({
        name: 'test-plugin',
        version: '1.0.0',
        description: 'Test',
        main: 'index.js',
        permissions: { shell: { allow: ['git'] } },
      }),
      'index.js': 'export default { name: "test-plugin", version: "1.0.0" };',
    });
    const result = loadManifest(pluginDir);
    expect(result.valid).toBe(true);
    expect(result.warnings.length).toBeGreaterThan(0);
    expect(result.warnings.some((w: string) => w.includes('危险权限'))).toBe(true);
  });

  it('dependencies 非数组应报错', () => {
    const pluginDir = createTestPlugin(tmpDir, 'test-plugin', {
      'manifest.json': JSON.stringify({
        name: 'test-plugin',
        version: '1.0.0',
        description: 'Test',
        main: 'index.js',
        dependencies: 'invalid',
      }),
    });
    const result = loadManifest(pluginDir);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e: string) => e.includes('dependencies'))).toBe(true);
  });

  it('完整的 manifest 应解析所有字段', () => {
    const pluginDir = createTestPlugin(tmpDir, 'test-plugin', {
      'manifest.json': JSON.stringify({
        name: 'test-plugin',
        version: '1.0.0',
        description: 'A complete test plugin',
        author: 'Test Author',
        main: 'index.js',
        dependencies: ['dep-a', 'dep-b'],
        engines: { easyagent: '>=0.4.0', node: '>=18' },
        permissions: { fs: { read: ['**/*'] }, network: { allow: ['api.github.com'] } },
        keywords: ['test', 'plugin'],
        repository: 'https://github.com/test/plugin',
        license: 'MIT',
      }),
      'index.js': 'export default { name: "test-plugin", version: "1.0.0" };',
    });
    const result = loadManifest(pluginDir);
    expect(result.valid).toBe(true);
    expect(result.manifest!.author).toBe('Test Author');
    expect(result.manifest!.dependencies).toEqual(['dep-a', 'dep-b']);
    expect(result.manifest!.engines!.easyagent).toBe('>=0.4.0');
    expect(result.manifest!.keywords).toEqual(['test', 'plugin']);
    expect(result.manifest!.license).toBe('MIT');
  });

  it('getManifestPath 应返回正确路径', () => {
    const expected = join(resolve(tmpDir), 'manifest.json');
    expect(getManifestPath(tmpDir)).toBe(expected);
  });
});

// ==================== PluginManager 沙箱模式集成测试 ====================

describe('PluginManager - 沙箱模式集成', () => {
  let PluginManager: any;
  let resetPluginManager: any;
  let getPluginManager: any;
  let ToolRegistry: any;
  const tmpDir = join(tmpdir(), `easyagent-sandbox-test-${Date.now()}`);

  beforeAll(async () => {
    const pm = await import('../plugins/PluginManager.js');
    PluginManager = pm.PluginManager;
    resetPluginManager = pm.resetPluginManager;
    getPluginManager = pm.getPluginManager;
    const tr = await import('../tools/ToolRegistry.js');
    ToolRegistry = tr.ToolRegistry;
  });

  beforeEach(() => {
    resetPluginManager();
    mkdirSync(tmpDir, { recursive: true });
  });

  afterEach(() => {
    cleanup(tmpDir);
  });

  it('无 manifest 的插件应使用 unsafe 模式加载', async () => {
    const pluginDir = createTestPlugin(tmpDir, 'unsafe-plugin', {
      'index.js': `
        module.exports = {
          name: 'unsafe-plugin',
          version: '1.0.0',
          description: 'Unsafe mode plugin',
          getTools() { return []; },
        };
      `,
    });

    const pm = new PluginManager();
    await pm.loadPlugin(pluginDir);
    expect(pm.getLoadMode('unsafe-plugin')).toBe('unsafe');
  });

  it('有 manifest.json 的插件应使用 sandbox 模式加载', async () => {
    const pluginDir = createTestPlugin(tmpDir, 'sandbox-plugin', {
      'manifest.json': JSON.stringify({
        name: 'sandbox-plugin',
        version: '1.0.0',
        description: 'Sandbox mode plugin',
        main: 'index.js',
        permissions: { fs: { read: ['**/*'] } },
      }),
      'index.js': `
        export default {
          name: 'sandbox-plugin',
          version: '1.0.0',
          description: 'Sandbox mode plugin',
          getTools() { return []; },
          getSkills() { return []; },
          getHooks() { return []; },
        };
      `,
    });

    const pm = new PluginManager();
    await pm.loadPlugin(pluginDir);
    expect(pm.getLoadMode('sandbox-plugin')).toBe('sandbox');
  });

  it('forceMode 应覆盖自动检测', async () => {
    const pluginDir = createTestPlugin(tmpDir, 'forced-plugin', {
      'manifest.json': JSON.stringify({
        name: 'forced-plugin',
        version: '1.0.0',
        description: 'Force mode plugin',
        main: 'index.js',
      }),
      'index.js': `
        export default {
          name: 'forced-plugin',
          version: '1.0.0',
          description: 'Force mode plugin',
          getTools() { return []; },
        };
      `,
    });

    const pm = new PluginManager();
    await pm.loadPlugin(pluginDir, { forceMode: 'unsafe' });
    expect(pm.getLoadMode('forced-plugin')).toBe('unsafe');
  });

  it('loadPluginSafe 应强制使用沙箱模式', async () => {
    const pluginDir = createTestPlugin(tmpDir, 'safe-plugin', {
      'manifest.json': JSON.stringify({
        name: 'safe-plugin',
        version: '1.0.0',
        description: 'Safe plugin',
        main: 'index.js',
        permissions: {},
      }),
      'index.js': `
        export default {
          name: 'safe-plugin',
          version: '1.0.0',
          description: 'Safe plugin',
          getTools() { return []; },
          getSkills() { return []; },
          getHooks() { return []; },
        };
      `,
    });

    const pm = new PluginManager();
    await pm.loadPluginSafe(pluginDir);
    expect(pm.getLoadMode('safe-plugin')).toBe('sandbox');
  });

  it('沙箱插件应可在 ToolRegistry 中注册工具', async () => {
    const pluginDir = createTestPlugin(tmpDir, 'tool-plugin', {
      'manifest.json': JSON.stringify({
        name: 'tool-plugin',
        version: '1.0.0',
        description: 'Plugin with tools',
        main: 'index.js',
        permissions: { fs: { read: ['**/*'] } },
      }),
      'index.js': `
        export default {
          name: 'tool-plugin',
          version: '1.0.0',
          description: 'Plugin with tools',
          getTools() {
            return [{
              name: 'myTool',
              description: 'My sandbox tool',
              parameters: { type: 'object', properties: {}, required: [] },
              requiresConfirm: false,
              group: 'custom',
              execute: async (params, ctx) => ({ success: true, output: 'executed in worker' }),
            }];
          },
          getSkills() { return []; },
          getHooks() { return []; },
        };
      `,
    });

    const pm = new PluginManager();
    const registry = new ToolRegistry();
    pm.setToolRegistry(registry);

    await pm.loadPlugin(pluginDir);

    // 验证工具已注册
    const tool = registry.get('myTool');
    expect(tool).toBeDefined();
    expect(tool.name).toBe('myTool');
    expect(tool.description).toBe('My sandbox tool');
  });

  it('卸载沙箱插件应清理插件和沙箱', async () => {
    const pluginDir = createTestPlugin(tmpDir, 'cleanup-plugin', {
      'manifest.json': JSON.stringify({
        name: 'cleanup-plugin',
        version: '1.0.0',
        description: 'Cleanup test',
        main: 'index.js',
      }),
      'index.js': `
        export default {
          name: 'cleanup-plugin',
          version: '1.0.0',
          description: 'Cleanup test',
          getTools() { return []; },
          getSkills() { return []; },
          getHooks() { return []; },
        };
      `,
    });

    const pm = new PluginManager();
    await pm.loadPlugin(pluginDir);
    expect(pm.listPlugins().length).toBe(1);
    expect(pm.getSandbox('cleanup-plugin')).toBeDefined();

    await pm.unloadPlugin('cleanup-plugin');
    expect(pm.listPlugins().length).toBe(0);
    expect(pm.getSandbox('cleanup-plugin')).toBeUndefined();
    expect(pm.getLoadMode('cleanup-plugin')).toBeUndefined();
  });

  it('无效 manifest 应抛出异常', async () => {
    const pluginDir = createTestPlugin(tmpDir, 'bad-manifest-plugin', {
      'manifest.json': JSON.stringify({
        name: 'Bad-Manifest',
        // 缺少必需字段
      }),
      'index.js': '',
    });

    const pm = new PluginManager();
    await expect(pm.loadPlugin(pluginDir)).rejects.toThrow('Manifest');
  });

  it('destroy 应清理所有沙箱', async () => {
    const pluginDir = createTestPlugin(tmpDir, 'destroy-test', {
      'manifest.json': JSON.stringify({
        name: 'destroy-test',
        version: '1.0.0',
        description: 'Destroy test',
        main: 'index.js',
      }),
      'index.js': `
        export default {
          name: 'destroy-test',
          version: '1.0.0',
          description: 'Destroy test',
          getTools() { return []; },
          getSkills() { return []; },
          getHooks() { return []; },
        };
      `,
    });

    const pm = new PluginManager();
    await pm.loadPlugin(pluginDir);

    await pm.destroy();
    expect(pm.listPlugins().length).toBe(0);
    // destroy 应已清理所有 sandbox map
  });

  it('getEnabledPlugins 应包含沙箱插件', async () => {
    const pluginDir = createTestPlugin(tmpDir, 'enabled-sandbox', {
      'manifest.json': JSON.stringify({
        name: 'enabled-sandbox',
        version: '1.0.0',
        description: 'Enabled sandbox test',
        main: 'index.js',
      }),
      'index.js': `
        export default {
          name: 'enabled-sandbox',
          version: '1.0.0',
          description: 'Enabled sandbox test',
          getTools() { return []; },
          getSkills() { return []; },
          getHooks() { return []; },
        };
      `,
    });

    const pm = new PluginManager();
    await pm.loadPlugin(pluginDir);
    const enabled = pm.getEnabledPlugins();
    expect(enabled.length).toBe(1);
    expect(enabled[0].enabled).toBe(true);
  });

  it('沙箱模式配置应传递给 PluginSandbox', async () => {
    const pluginDir = createTestPlugin(tmpDir, 'config-sandbox', {
      'manifest.json': JSON.stringify({
        name: 'config-sandbox',
        version: '1.0.0',
        description: 'Config test',
        main: 'index.js',
      }),
      'index.js': `
        export default {
          name: 'config-sandbox',
          version: '1.0.0',
          description: 'Config test',
          getTools() { return []; },
          getSkills() { return []; },
          getHooks() { return []; },
        };
      `,
    });

    const pm = new PluginManager({
      sandbox: { enabled: true, toolTimeout: 15000 },
    });
    await pm.loadPlugin(pluginDir);

    const sandbox = pm.getSandbox('config-sandbox');
    expect(sandbox).toBeDefined();
    expect(sandbox.status).toBe('ready');
  });
});

// ==================== PluginManager 错误处理测试 ====================

describe('PluginManager - 沙箱错误处理', () => {
  let PluginManager: any;
  let resetPluginManager: any;
  const tmpDir = join(tmpdir(), `easyagent-error-test-${Date.now()}`);

  beforeAll(async () => {
    const pm = await import('../plugins/PluginManager.js');
    PluginManager = pm.PluginManager;
    resetPluginManager = pm.resetPluginManager;
  });

  beforeEach(() => {
    resetPluginManager();
    mkdirSync(tmpDir, { recursive: true });
  });

  afterEach(() => {
    cleanup(tmpDir);
  });

  it('loadPluginSafe 对非目录路径应抛出异常', async () => {
    const filePath = join(tmpDir, 'not-a-dir.js');
    writeFileSync(filePath, 'module.exports = {}');

    const pm = new PluginManager();
    await expect(pm.loadPluginSafe(filePath)).rejects.toThrow('目录');
  });

  it('重复加载同一插件应先卸载旧版本', async () => {
    const pluginDir = createTestPlugin(tmpDir, 'reload-plugin', {
      'manifest.json': JSON.stringify({
        name: 'reload-plugin',
        version: '1.0.0',
        description: 'Reload test',
        main: 'index.js',
      }),
      'index.js': `
        export default {
          name: 'reload-plugin',
          version: '1.0.0',
          description: 'Reload test',
          getTools() { return []; },
          getSkills() { return []; },
          getHooks() { return []; },
        };
      `,
    });

    const pm = new PluginManager();
    await pm.loadPlugin(pluginDir);
    await pm.loadPlugin(pluginDir); // 重复加载不抛错
    expect(pm.listPlugins().length).toBe(1);
  });
});
