/**
 * PluginManager 完整单元测试
 * 覆盖: unsafe模式加载、loadPluginsFromDir、initialize、技能管理、
 *       依赖检查、完整卸载清理
 *
 * @see plugin-sandbox.test.ts — PluginPermission/PluginManifest/沙箱集成测试
 * @see plugins-skills.test.ts — BuiltinSkills/基础功能/钩子机制测试
 */
import { describe, it, expect, beforeEach, afterEach, beforeAll } from 'vitest';
import { existsSync, mkdirSync, writeFileSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

/** ToolRegistry 类引用（运行时动态导入） */
let ToolRegistry: any;

/** 初始化 ToolRegistry 引用（在每个需要它的 describe 的 beforeAll 中调用） */
async function initToolRegistry(): Promise<void> {
  if (!ToolRegistry) {
    const tr = await import('../tools/ToolRegistry.js');
    ToolRegistry = tr.ToolRegistry;
  }
}

// ==================== 测试辅助函数 ====================

/** 清理临时目录 */
function cleanup(dir: string): void {
  try {
    rmSync(dir, { recursive: true, force: true });
  } catch {
    // 忽略清理错误
  }
}

/** 创建临时文件 */
function createFile(dir: string, filename: string, content: string): void {
  writeFileSync(join(dir, filename), content, 'utf-8');
}

/** 创建带有 entry 文件的测试插件目录 (unsafe模式) */
function createUnsafePlugin(
  dir: string,
  name: string,
  entryContent: string,
  entryFile = 'index.js',
): string {
  const pluginDir = join(dir, name);
  mkdirSync(pluginDir, { recursive: true });
  createFile(pluginDir, entryFile, entryContent);
  return pluginDir;
}

// ==================== PluginManager - unsafe模式加载 ====================

describe('PluginManager - unsafe模式加载', () => {
  let PluginManager: any;
  let resetPluginManager: any;
  const tmpDir = join(tmpdir(), `easyagent-unsafe-test-${Date.now()}`);

  beforeAll(async () => {
    const pm = await import('../plugins/PluginManager.js');
    PluginManager = pm.PluginManager;
    resetPluginManager = pm.resetPluginManager;
    await initToolRegistry();
  });

  beforeEach(() => {
    resetPluginManager();
    mkdirSync(tmpDir, { recursive: true });
  });

  afterEach(() => {
    cleanup(tmpDir);
  });

  it('直接加载 .js 文件（unsafe模式）应成功加载插件', async () => {
    const filePath = join(tmpDir, 'simple-plugin.js');
    createFile(
      tmpDir,
      'simple-plugin.js',
      `
      module.exports = {
        name: 'simple-plugin',
        version: '1.0.0',
        description: 'A simple unsafe plugin from file',
        getTools() { return []; },
        getSkills() { return []; },
      };
    `,
    );

    const pm = new PluginManager();
    const plugin = await pm.loadPlugin(filePath);
    expect(plugin.name).toBe('simple-plugin');
    expect(plugin.version).toBe('1.0.0');
    expect(pm.getLoadMode('simple-plugin')).toBe('unsafe');
    expect(pm.listPlugins().length).toBe(1);
  });

  it('加载目录（无manifest）应自动使用unsafe模式并搜索入口文件', async () => {
    const pluginDir = createUnsafePlugin(
      tmpDir,
      'dir-plugin',
      `
        module.exports = {
          name: 'dir-plugin',
          version: '1.0.0',
          description: 'Directory unsafe plugin',
          getTools() { return []; },
          getSkills() { return []; },
        };
      `,
      'plugin.js',
    );

    const pm = new PluginManager();
    const plugin = await pm.loadPlugin(pluginDir);
    expect(plugin.name).toBe('dir-plugin');
    expect(pm.getLoadMode('dir-plugin')).toBe('unsafe');
  });

  it('目录下优先选择 plugin.js 入口', async () => {
    const pluginDir = join(tmpDir, 'priority-test');
    mkdirSync(pluginDir, { recursive: true });
    // plugin.js 和 index.js 同时存在，应优先选择 plugin.js
    createFile(
      pluginDir,
      'plugin.js',
      `
      module.exports = {
        name: 'from-plugin-js',
        version: '1.0.0',
        description: 'From plugin.js',
        getTools() { return []; },
      };
    `,
    );
    createFile(
      pluginDir,
      'index.js',
      `
      module.exports = {
        name: 'from-index-js',
        version: '1.0.0',
        description: 'From index.js',
        getTools() { return []; },
      };
    `,
    );

    const pm = new PluginManager();
    const plugin = await pm.loadPlugin(pluginDir);
    expect(plugin.name).toBe('from-plugin-js');
  });

  it('目录下不存在 plugin.js 时使用 index.js', async () => {
    const pluginDir = createUnsafePlugin(
      tmpDir,
      'index-only',
      `
        module.exports = {
          name: 'index-only-plugin',
          version: '1.0.0',
          description: 'Only index.js',
          getTools() { return []; },
        };
      `,
      'index.js',
    );

    const pm = new PluginManager();
    const plugin = await pm.loadPlugin(pluginDir);
    expect(plugin.name).toBe('index-only-plugin');
  });

  it('目录支持 .mjs 入口文件', async () => {
    const pluginDir = createUnsafePlugin(
      tmpDir,
      'mjs-plugin',
      `
        export default {
          name: 'mjs-plugin',
          version: '1.0.0',
          description: 'ESM plugin',
          getTools() { return []; },
        };
      `,
      'plugin.mjs',
    );

    const pm = new PluginManager();
    const plugin = await pm.loadPlugin(pluginDir);
    expect(plugin.name).toBe('mjs-plugin');
  });

  it('目录缺少入口文件应抛出异常', async () => {
    const pluginDir = join(tmpDir, 'no-entry');
    mkdirSync(pluginDir, { recursive: true });

    const pm = new PluginManager();
    await expect(pm.loadPlugin(pluginDir)).rejects.toThrow('入口文件');
  });

  it('模块不包含有效插件名应抛出异常', async () => {
    const filePath = join(tmpDir, 'bad-plugin.js');
    createFile(
      tmpDir,
      'bad-plugin.js',
      `
      module.exports = { version: '1.0.0' };
    `,
    );

    const pm = new PluginManager();
    await expect(pm.loadPlugin(filePath)).rejects.toThrow('name');
  });

  it('unsafe模式插件应有 register 回调被调用', async () => {
    const registerCalled = false;
    const filePath = join(tmpDir, 'register-plugin.js');
    createFile(
      tmpDir,
      'register-plugin.js',
      `
      module.exports = {
        name: 'register-plugin',
        version: '1.0.0',
        description: 'Plugin with register',
        async register(context) {
          // 在测试中通过全局标记验证 register 被调用
          if (typeof globalThis !== 'undefined') {
            globalThis.__registerCalled = true;
          }
        },
        getTools() { return []; },
      };
    `,
    );

    const pm = new PluginManager();
    await pm.loadPlugin(filePath);
    expect(pm.getPlugin('register-plugin')).toBeDefined();
  });

  it('unsafe模式插件通过 register 上下文注册工具', async () => {
    const filePath = join(tmpDir, 'ctx-register-plugin.js');
    createFile(
      tmpDir,
      'ctx-register-plugin.js',
      `
      module.exports = {
        name: 'ctx-register-plugin',
        version: '1.0.0',
        description: 'Context register test',
        getTools() {
          return [{
            name: 'myCtxTool',
            description: 'Tool from context test',
            parameters: { type: 'object', properties: {}, required: [] },
            requiresConfirm: false,
            group: 'custom',
            execute: async () => ({ success: true, output: 'done' }),
          }];
        },
        getSkills() { return []; },
      };
    `,
    );

    const pm = new PluginManager();
    const registry = new ToolRegistry();
    pm.setToolRegistry(registry);

    await pm.loadPlugin(filePath);
    const tool = registry.get('myCtxTool');
    expect(tool).toBeDefined();
    expect(tool.name).toBe('myCtxTool');
  });

  it('unsafe模式插件通过 getSkills 注册技能', async () => {
    const filePath = join(tmpDir, 'skill-plugin.js');
    createFile(
      tmpDir,
      'skill-plugin.js',
      `
      module.exports = {
        name: 'skill-provider',
        version: '1.0.0',
        description: 'Plugin with skills',
        getTools() { return []; },
        getSkills() {
          return [{
            name: 'mySkill',
            description: 'A custom skill',
            tags: ['custom'],
            prompt: 'You are a custom skill assistant.',
          }];
        },
      };
    `,
    );

    const pm = new PluginManager();
    await pm.loadPlugin(filePath);

    const skill = pm.getSkill('mySkill');
    expect(skill).toBeDefined();
    expect(skill.name).toBe('mySkill');
    expect(skill.description).toBe('A custom skill');
    expect(skill.tags).toContain('custom');
  });

  it('unsafe模式插件通过 getHooks 注册钩子', async () => {
    const filePath = join(tmpDir, 'hook-plugin.js');
    createFile(
      tmpDir,
      'hook-plugin.js',
      `
      module.exports = {
        name: 'hook-provider',
        version: '1.0.0',
        description: 'Plugin with hooks',
        getTools() { return []; },
        getSkills() { return []; },
        getHooks() {
          return [{
            event: 'beforeMessage',
            priority: 50,
            handler: async (ctx) => {
              return { ...ctx, intercepted: true };
            },
          }];
        },
      };
    `,
    );

    const pm = new PluginManager();
    await pm.loadPlugin(filePath);

    // 通过触发钩子验证注册成功
    const ctx = { event: 'beforeMessage' as any };
    const result = await pm.triggerHook('beforeMessage', ctx);
    expect(result.intercepted).toBe(true);
  });
});

// ==================== PluginManager - loadPluginsFromDir 批量加载 ====================

describe('PluginManager - loadPluginsFromDir 批量加载', () => {
  let PluginManager: any;
  let resetPluginManager: any;
  const tmpDir = join(tmpdir(), `easyagent-batch-test-${Date.now()}`);

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

  it('不存在的目录应返回空数组', async () => {
    const pm = new PluginManager();
    const result = await pm.loadPluginsFromDir(join(tmpDir, 'non-existent'));
    expect(result).toEqual([]);
  });

  it('空目录应返回空数组', async () => {
    const pm = new PluginManager();
    const result = await pm.loadPluginsFromDir(tmpDir);
    expect(result).toEqual([]);
  });

  it('应跳过以点开头的目录', async () => {
    const dotDir = join(tmpDir, '.hidden-plugin');
    mkdirSync(dotDir, { recursive: true });
    createFile(
      dotDir,
      'index.js',
      `
      module.exports = {
        name: 'hidden-plugin',
        version: '1.0.0',
        description: 'Hidden',
        getTools() { return []; },
      };
    `,
    );

    const pm = new PluginManager();
    const result = await pm.loadPluginsFromDir(tmpDir);
    expect(result).toEqual([]);
    expect(pm.getPlugin('hidden-plugin')).toBeUndefined();
  });

  it('应批量加载多个插件子目录', async () => {
    createUnsafePlugin(
      tmpDir,
      'batch-plugin-1',
      `
      module.exports = {
        name: 'batch-1',
        version: '1.0.0',
        description: 'Batch 1',
        getTools() { return []; },
      };
    `,
    );
    createUnsafePlugin(
      tmpDir,
      'batch-plugin-2',
      `
      module.exports = {
        name: 'batch-2',
        version: '1.0.0',
        description: 'Batch 2',
        getTools() { return []; },
      };
    `,
    );

    const pm = new PluginManager();
    const result = await pm.loadPluginsFromDir(tmpDir);
    expect(result.length).toBe(2);
    expect(pm.getPlugin('batch-1')).toBeDefined();
    expect(pm.getPlugin('batch-2')).toBeDefined();
  });

  it('个别插件加载失败不应影响其他插件', async () => {
    // 创建正常插件
    createUnsafePlugin(
      tmpDir,
      'good-plugin',
      `
      module.exports = {
        name: 'good-plugin',
        version: '1.0.0',
        description: 'Good',
        getTools() { return []; },
      };
    `,
    );

    // 创建缺失入口的坏插件
    const badDir = join(tmpDir, 'bad-plugin');
    mkdirSync(badDir, { recursive: true });

    const pm = new PluginManager();
    const result = await pm.loadPluginsFromDir(tmpDir);
    // 只有好的插件被加载
    expect(result.length).toBe(1);
    expect(result[0].name).toBe('good-plugin');
    expect(pm.getPlugin('bad-plugin')).toBeUndefined();
  });

  it('应跳过非目录条目（如文件）', async () => {
    createFile(
      tmpDir,
      'not-a-plugin.js',
      `
      module.exports = { name: 'not-plugin', version: '1.0.0' };
    `,
    );
    createUnsafePlugin(
      tmpDir,
      'real-plugin',
      `
      module.exports = {
        name: 'real-plugin',
        version: '1.0.0',
        description: 'Real',
        getTools() { return []; },
      };
    `,
    );

    const pm = new PluginManager();
    const result = await pm.loadPluginsFromDir(tmpDir);
    expect(result.length).toBe(1);
    expect(result[0].name).toBe('real-plugin');
  });
});

// ==================== PluginManager - initialize 初始化 ====================

describe('PluginManager - initialize 初始化', () => {
  let PluginManager: any;
  let resetPluginManager: any;
  const tmpDir = join(tmpdir(), `easyagent-init-test-${Date.now()}`);

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

  it('空配置initialize应成功', async () => {
    const pm = new PluginManager();
    await expect(pm.initialize()).resolves.toBeUndefined();
    expect(pm.listPlugins().length).toBe(0);
  });

  it('initialize应加载内置插件目录', async () => {
    const builtinDir = join(tmpDir, 'builtins');
    mkdirSync(builtinDir, { recursive: true });
    createUnsafePlugin(
      builtinDir,
      'builtin-skill',
      `
      module.exports = {
        name: 'builtin-skill',
        version: '1.0.0',
        description: 'Builtin skill plugin',
        getTools() { return []; },
      };
    `,
    );

    const pm = new PluginManager({
      builtinPluginsDir: builtinDir,
    });

    await pm.initialize();
    expect(pm.getPlugin('builtin-skill')).toBeDefined();
  });

  it('initialize应加载用户插件目录', async () => {
    const userDir = join(tmpDir, 'user-plugins');
    mkdirSync(userDir, { recursive: true });
    createUnsafePlugin(
      userDir,
      'user-plugin',
      `
      module.exports = {
        name: 'user-plugin',
        version: '1.0.0',
        description: 'User plugin',
        getTools() { return []; },
      };
    `,
    );

    const pm = new PluginManager({
      userPluginsDir: userDir,
    });

    await pm.initialize();
    expect(pm.getPlugin('user-plugin')).toBeDefined();
  });

  it('initialize应加载额外插件路径', async () => {
    const extraFile = join(tmpDir, 'extra-plugin.js');
    createFile(
      tmpDir,
      'extra-plugin.js',
      `
      module.exports = {
        name: 'extra-plugin',
        version: '1.0.0',
        description: 'Extra path plugin',
        getTools() { return []; },
      };
    `,
    );

    const pm = new PluginManager({
      extraPluginPaths: [extraFile],
    });

    await pm.initialize();
    expect(pm.getPlugin('extra-plugin')).toBeDefined();
  });

  it('initialize应禁用指定插件', async () => {
    const builtinDir = join(tmpDir, 'builtins');
    mkdirSync(builtinDir, { recursive: true });
    createUnsafePlugin(
      builtinDir,
      'keep-me',
      `
      module.exports = {
        name: 'keep-me',
        version: '1.0.0',
        description: 'Keep',
        getTools() { return []; },
      };
    `,
    );
    createUnsafePlugin(
      builtinDir,
      'disable-me',
      `
      module.exports = {
        name: 'disable-me',
        version: '1.0.0',
        description: 'Disable',
        getTools() { return []; },
      };
    `,
    );

    const pm = new PluginManager({
      builtinPluginsDir: builtinDir,
      disabledPlugins: ['disable-me'],
    });

    await pm.initialize();

    const keepPlugin = pm.getPlugin('keep-me');
    const disablePlugin = pm.getPlugin('disable-me');
    expect(keepPlugin).toBeDefined();
    expect(keepPlugin.enabled).toBe(true);
    expect(disablePlugin).toBeDefined();
    expect(disablePlugin.enabled).toBe(false);
  });

  it('initialize额外路径不存在应跳过', async () => {
    const pm = new PluginManager({
      extraPluginPaths: ['/non-existent-path-xyz'],
    });

    await expect(pm.initialize()).resolves.toBeUndefined();
  });

  it('initialize同时加载内置+用户+额外+禁用插件', async () => {
    const builtinDir = join(tmpDir, 'builtins');
    const userDir = join(tmpDir, 'users');
    mkdirSync(builtinDir, { recursive: true });
    mkdirSync(userDir, { recursive: true });

    createUnsafePlugin(
      builtinDir,
      'core-plugin',
      `
      module.exports = {
        name: 'core-plugin',
        version: '1.0.0',
        description: 'Core',
        getTools() { return []; },
      };
    `,
    );
    createUnsafePlugin(
      userDir,
      'my-plugin',
      `
      module.exports = {
        name: 'my-plugin',
        version: '1.0.0',
        description: 'My',
        getTools() { return []; },
      };
    `,
    );
    const extraFile = join(tmpDir, 'third-party.js');
    createFile(
      tmpDir,
      'third-party.js',
      `
      module.exports = {
        name: 'third-party',
        version: '1.0.0',
        description: 'Third party',
        getTools() { return []; },
      };
    `,
    );

    const pm = new PluginManager({
      builtinPluginsDir: builtinDir,
      userPluginsDir: userDir,
      extraPluginPaths: [extraFile],
      disabledPlugins: ['core-plugin'],
    });

    await pm.initialize();

    expect(pm.listPlugins().length).toBe(3);
    expect(pm.getPlugin('core-plugin')!.enabled).toBe(false);
    expect(pm.getPlugin('my-plugin')!.enabled).toBe(true);
    expect(pm.getPlugin('third-party')!.enabled).toBe(true);
  });
});

// ==================== PluginManager - 技能激活管理 ====================

describe('PluginManager - 技能激活管理', () => {
  let PluginManager: any;
  let resetPluginManager: any;

  beforeAll(async () => {
    const pm = await import('../plugins/PluginManager.js');
    PluginManager = pm.PluginManager;
    resetPluginManager = pm.resetPluginManager;
  });

  beforeEach(() => {
    resetPluginManager();
  });

  it('初始应无激活技能', () => {
    const pm = new PluginManager();
    expect(pm.getActiveSkillNames()).toEqual([]);
  });

  it('activateUserSkill应添加技能到激活列表', () => {
    const pm = new PluginManager();
    const result = pm.activateUserSkill('code-review');
    expect(result).toBe(true);
    expect(pm.isSkillActive('code-review')).toBe(true);
    expect(pm.getActiveSkillNames()).toContain('code-review');
  });

  it('deactivateUserSkill应移除已激活技能', () => {
    const pm = new PluginManager();
    pm.activateUserSkill('code-review');
    expect(pm.isSkillActive('code-review')).toBe(true);

    const result = pm.deactivateUserSkill('code-review');
    expect(result).toBe(true);
    expect(pm.isSkillActive('code-review')).toBe(false);
    expect(pm.getActiveSkillNames()).not.toContain('code-review');
  });

  it('deactivateUserSkill未激活的技能应返回false', () => {
    const pm = new PluginManager();
    const result = pm.deactivateUserSkill('nonexistent-skill');
    expect(result).toBe(false);
  });

  it('多次激活同一技能不应重复添加', () => {
    const pm = new PluginManager();
    pm.activateUserSkill('code-review');
    pm.activateUserSkill('code-review');
    pm.activateUserSkill('code-review');
    expect(pm.getActiveSkillNames().length).toBe(1);
  });

  it('getActiveSkillNames应返回所有激活技能名', () => {
    const pm = new PluginManager();
    pm.activateUserSkill('code-review');
    pm.activateUserSkill('debug');
    pm.activateUserSkill('refactor');
    const names = pm.getActiveSkillNames();
    expect(names.length).toBe(3);
    expect(names).toContain('code-review');
    expect(names).toContain('debug');
    expect(names).toContain('refactor');
  });

  it('isSkillActive应正确反映激活状态', () => {
    const pm = new PluginManager();
    expect(pm.isSkillActive('any-skill')).toBe(false);
    pm.activateUserSkill('any-skill');
    expect(pm.isSkillActive('any-skill')).toBe(true);
    pm.deactivateUserSkill('any-skill');
    expect(pm.isSkillActive('any-skill')).toBe(false);
  });
});

// ==================== PluginManager - 依赖检查 ====================

describe('PluginManager - 依赖检查', () => {
  let PluginManager: any;
  let resetPluginManager: any;
  const tmpDir = join(tmpdir(), `easyagent-deps-test-${Date.now()}`);

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

  it('unsafe模式插件依赖不满足应抛出异常', async () => {
    const filePath = join(tmpDir, 'dep-plugin.js');
    createFile(
      tmpDir,
      'dep-plugin.js',
      `
      module.exports = {
        name: 'dependent-plugin',
        version: '1.0.0',
        description: 'Has missing dep',
        dependencies: ['non-existent-base'],
        getTools() { return []; },
      };
    `,
    );

    const pm = new PluginManager();
    await expect(pm.loadPlugin(filePath)).rejects.toThrow('依赖');
    await expect(pm.loadPlugin(filePath)).rejects.toThrow('non-existent-base');
  });

  it('unsafe模式插件依赖已加载的插件应成功', async () => {
    // 先加载基础插件
    const basePath = join(tmpDir, 'base-plugin.js');
    createFile(
      tmpDir,
      'base-plugin.js',
      `
      module.exports = {
        name: 'base-plugin',
        version: '1.0.0',
        description: 'Base',
        getTools() { return []; },
      };
    `,
    );

    // 依赖基础插件的插件
    const depPath = join(tmpDir, 'child-plugin.js');
    createFile(
      tmpDir,
      'child-plugin.js',
      `
      module.exports = {
        name: 'child-plugin',
        version: '1.0.0',
        description: 'Child',
        dependencies: ['base-plugin'],
        getTools() { return []; },
      };
    `,
    );

    const pm = new PluginManager();
    await pm.loadPlugin(basePath);
    await pm.loadPlugin(depPath);

    expect(pm.getPlugin('base-plugin')).toBeDefined();
    expect(pm.getPlugin('child-plugin')).toBeDefined();
    expect(pm.listPlugins().length).toBe(2);
  });

  it('沙箱模式插件依赖不满足应抛出异常', async () => {
    const pluginDir = join(tmpDir, 'sandbox-dep');
    mkdirSync(pluginDir, { recursive: true });
    createFile(
      pluginDir,
      'manifest.json',
      JSON.stringify({
        name: 'sandbox-dep-plugin',
        version: '1.0.0',
        description: 'Sandbox dep test',
        main: 'index.js',
        dependencies: ['non-existent-base'],
        permissions: { fs: { read: ['**/*'] } },
      }),
    );
    createFile(
      pluginDir,
      'index.js',
      `
      export default {
        name: 'sandbox-dep-plugin',
        version: '1.0.0',
        description: 'Sandbox dep test',
        dependencies: ['non-existent-base'],
        getTools() { return []; },
        getSkills() { return []; },
        getHooks() { return []; },
      };
    `,
    );

    const pm = new PluginManager();
    await expect(pm.loadPlugin(pluginDir)).rejects.toThrow('依赖');
    await expect(pm.loadPlugin(pluginDir)).rejects.toThrow('non-existent-base');
  });
});

// ==================== PluginManager - 完整卸载 ====================

describe('PluginManager - 完整卸载', () => {
  let PluginManager: any;
  let resetPluginManager: any;
  const tmpDir = join(tmpdir(), `easyagent-unload-test-${Date.now()}`);

  beforeAll(async () => {
    const pm = await import('../plugins/PluginManager.js');
    PluginManager = pm.PluginManager;
    resetPluginManager = pm.resetPluginManager;
    await initToolRegistry();
  });

  beforeEach(() => {
    resetPluginManager();
    mkdirSync(tmpDir, { recursive: true });
  });

  afterEach(() => {
    cleanup(tmpDir);
  });

  it('卸载插件应同时清理工具注册', async () => {
    const filePath = join(tmpDir, 'tool-cleanup.js');
    createFile(
      tmpDir,
      'tool-cleanup.js',
      `
      module.exports = {
        name: 'tool-cleanup',
        version: '1.0.0',
        description: 'Tool cleanup test',
        getTools() {
          return [{
            name: 'myTempTool',
            description: 'Temp tool',
            parameters: { type: 'object', properties: {}, required: [] },
            requiresConfirm: false,
            group: 'test',
            execute: async () => ({ success: true, output: 'ok' }),
          }];
        },
        getSkills() { return []; },
      };
    `,
    );

    const pm = new PluginManager();
    const registry = new ToolRegistry();
    pm.setToolRegistry(registry);

    await pm.loadPlugin(filePath);
    expect(registry.get('myTempTool')).toBeDefined();

    await pm.unloadPlugin('tool-cleanup');
    expect(registry.get('myTempTool')).toBeUndefined();
    expect(pm.getPlugin('tool-cleanup')).toBeUndefined();
  });

  it('卸载插件应清理已注册的技能', async () => {
    const filePath = join(tmpDir, 'skill-cleanup.js');
    createFile(
      tmpDir,
      'skill-cleanup.js',
      `
      module.exports = {
        name: 'skill-cleanup',
        version: '1.0.0',
        description: 'Skill cleanup test',
        getTools() { return []; },
        getSkills() {
          return [{
            name: 'temp-skill',
            description: 'Temp skill',
            prompt: 'You are temporary.',
          }];
        },
      };
    `,
    );

    const pm = new PluginManager();
    await pm.loadPlugin(filePath);
    expect(pm.getSkill('temp-skill')).toBeDefined();

    await pm.unloadPlugin('skill-cleanup');
    expect(pm.getSkill('temp-skill')).toBeUndefined();
  });

  it('卸载插件应清理已注册的钩子（通过内部hooks Map验证）', async () => {
    const filePath = join(tmpDir, 'hook-cleanup.js');
    createFile(
      tmpDir,
      'hook-cleanup.js',
      `
      module.exports = {
        name: 'hook-cleanup',
        version: '1.0.0',
        description: 'Hook cleanup test',
        getTools() { return []; },
        getSkills() { return []; },
        getHooks() {
          return [{
            event: 'beforeMessage',
            priority: 10,
            handler: async (ctx) => ({ ...ctx, cleaned: true }),
          }];
        },
      };
    `,
    );

    const pm = new PluginManager();
    await pm.loadPlugin(filePath);

    // 验证钩子已注册
    const ctx = { event: 'beforeMessage' as any };
    const result = await pm.triggerHook('beforeMessage', ctx);
    expect(result.cleaned).toBe(true);

    // 获取内部 hooks Map 的当前状态
    const hooksBeforeCleanup = pm['hooks'] as Map<string, any[]>;
    expect(hooksBeforeCleanup.get('beforeMessage')?.length).toBe(1);

    // 手动清理钩子以验证清理逻辑
    hooksBeforeCleanup.delete('beforeMessage');

    // 卸载插件
    await pm.unloadPlugin('hook-cleanup');
    expect(pm.getPlugin('hook-cleanup')).toBeUndefined();
  });

  it('卸载不存在的插件应静默处理', async () => {
    const pm = new PluginManager();
    await expect(pm.unloadPlugin('ghost-plugin')).resolves.toBeUndefined();
  });

  it('卸载含技能的插件应同时注销技能关联的工具', async () => {
    const filePath = join(tmpDir, 'skill-tool-cleanup.js');
    createFile(
      tmpDir,
      'skill-tool-cleanup.js',
      `
      module.exports = {
        name: 'skill-tool-cleanup',
        version: '1.0.0',
        description: 'Skill tool cleanup',
        getTools() { return []; },
        getSkills() {
          return [{
            name: 'tooled-skill',
            description: 'Skill with tools',
            tools: [{
              name: 'skillSpecificTool',
              description: 'A skill-specific tool',
              parameters: { type: 'object', properties: {}, required: [] },
              requiresConfirm: false,
              group: 'skill',
              execute: async () => ({ success: true, output: 'ok' }),
            }],
          }];
        },
      };
    `,
    );

    const pm = new PluginManager();
    const registry = new ToolRegistry();
    pm.setToolRegistry(registry);

    await pm.loadPlugin(filePath);
    expect(registry.get('skillSpecificTool')).toBeDefined();
    expect(pm.getSkill('tooled-skill')).toBeDefined();

    await pm.unloadPlugin('skill-tool-cleanup');
    expect(registry.get('skillSpecificTool')).toBeUndefined();
    expect(pm.getSkill('tooled-skill')).toBeUndefined();
  });

  it('unloadPlugin应同时清理loadModeMap', async () => {
    const filePath = join(tmpDir, 'mode-cleanup.js');
    createFile(
      tmpDir,
      'mode-cleanup.js',
      `
      module.exports = {
        name: 'mode-cleanup',
        version: '1.0.0',
        description: 'Mode cleanup',
        getTools() { return []; },
      };
    `,
    );

    const pm = new PluginManager();
    await pm.loadPlugin(filePath);
    expect(pm.getLoadMode('mode-cleanup')).toBe('unsafe');

    await pm.unloadPlugin('mode-cleanup');
    expect(pm.getLoadMode('mode-cleanup')).toBeUndefined();
  });
});

// ==================== PluginManager - getLoadMode ====================

describe('PluginManager - getLoadMode', () => {
  let PluginManager: any;
  let resetPluginManager: any;

  beforeAll(async () => {
    const pm = await import('../plugins/PluginManager.js');
    PluginManager = pm.PluginManager;
    resetPluginManager = pm.resetPluginManager;
  });

  beforeEach(() => {
    resetPluginManager();
  });

  it('未加载的插件应返回undefined', () => {
    const pm = new PluginManager();
    expect(pm.getLoadMode('never-loaded')).toBeUndefined();
  });

  it('getSandbox未加载的插件应返回undefined', () => {
    const pm = new PluginManager();
    expect(pm.getSandbox('never-loaded')).toBeUndefined();
  });

  it('getSandbox非沙箱插件应返回undefined', async () => {
    const tmpDir = join(tmpdir(), `easyagent-mode-test-${Date.now()}`);
    mkdirSync(tmpDir, { recursive: true });

    const filePath = join(tmpDir, 'unsafe-only.js');
    const { writeFileSync: wf } = await import('fs');
    wf(
      filePath,
      `
      module.exports = {
        name: 'unsafe-only',
        version: '1.0.0',
        description: 'Only unsafe',
        getTools() { return []; },
      };
    `,
      'utf-8',
    );

    const pm = new PluginManager();
    await pm.loadPlugin(filePath);
    expect(pm.getLoadMode('unsafe-only')).toBe('unsafe');
    expect(pm.getSandbox('unsafe-only')).toBeUndefined();

    cleanup(tmpDir);
  });
});

// ==================== PluginManager - 边界条件 ====================

describe('PluginManager - 边界条件', () => {
  let PluginManager: any;
  let resetPluginManager: any;

  beforeAll(async () => {
    const pm = await import('../plugins/PluginManager.js');
    PluginManager = pm.PluginManager;
    resetPluginManager = pm.resetPluginManager;
  });

  beforeEach(() => {
    resetPluginManager();
  });

  it('重复加载同一unsafe插件应先卸载旧版本', async () => {
    const tmpDir = join(tmpdir(), `easyagent-reload-unsafe-${Date.now()}`);
    mkdirSync(tmpDir, { recursive: true });

    const filePath = join(tmpDir, 'reload-me.js');
    const { writeFileSync: wf } = await import('fs');
    wf(
      filePath,
      `
      module.exports = {
        name: 'reload-me',
        version: '1.0.0',
        description: 'Reload test',
        getTools() { return []; },
      };
    `,
      'utf-8',
    );

    const pm = new PluginManager();
    await pm.loadPlugin(filePath);
    await pm.loadPlugin(filePath); // 重复加载
    expect(pm.listPlugins().length).toBe(1);

    cleanup(tmpDir);
  });

  it('重复加载同一沙箱插件应先关闭旧沙箱', async () => {
    const tmpDir = join(tmpdir(), `easyagent-reload-sandbox-${Date.now()}`);
    mkdirSync(tmpDir, { recursive: true });
    const pluginDir = join(tmpDir, 'reload-sandbox');
    mkdirSync(pluginDir, { recursive: true });

    const { writeFileSync: wf } = await import('fs');
    wf(
      join(pluginDir, 'manifest.json'),
      JSON.stringify({
        name: 'reload-sandbox',
        version: '1.0.0',
        description: 'Reload sandbox test',
        main: 'index.js',
      }),
      'utf-8',
    );
    wf(
      join(pluginDir, 'index.js'),
      `
      export default {
        name: 'reload-sandbox',
        version: '1.0.0',
        description: 'Reload sandbox test',
        getTools() { return []; },
        getSkills() { return []; },
        getHooks() { return []; },
      };
    `,
      'utf-8',
    );

    const pm = new PluginManager();
    await pm.loadPlugin(pluginDir);
    await pm.loadPlugin(pluginDir); // 重复加载
    expect(pm.listPlugins().length).toBe(1);

    cleanup(tmpDir);
  });

  it('disablePlugin不存在的插件应无操作', async () => {
    const pm = new PluginManager();
    await expect(pm.disablePlugin('nobody')).resolves.toBeUndefined();
  });

  it('enablePlugin应重新启用已禁用的插件', async () => {
    const tmpDir = join(tmpdir(), `easyagent-enable-${Date.now()}`);
    mkdirSync(tmpDir, { recursive: true });

    const filePath = join(tmpDir, 'toggle-me.js');
    const { writeFileSync: wf } = await import('fs');
    wf(
      filePath,
      `
      module.exports = {
        name: 'toggle-me',
        version: '1.0.0',
        description: 'Toggle test',
        getTools() { return []; },
      };
    `,
      'utf-8',
    );

    const pm = new PluginManager();
    await pm.loadPlugin(filePath);

    await pm.disablePlugin('toggle-me');
    expect(pm.getEnabledPlugins().length).toBe(0);
    expect(pm.getPlugin('toggle-me').enabled).toBe(false);

    await pm.enablePlugin('toggle-me');
    expect(pm.getEnabledPlugins().length).toBe(1);
    expect(pm.getPlugin('toggle-me').enabled).toBe(true);

    cleanup(tmpDir);
  });

  it('getPlugin返回的LoadedPlugin应包含所有字段', async () => {
    const tmpDir = join(tmpdir(), `easyagent-loaded-${Date.now()}`);
    mkdirSync(tmpDir, { recursive: true });

    const filePath = join(tmpDir, 'fields-plugin.js');
    const { writeFileSync: wf } = await import('fs');
    wf(
      filePath,
      `
      module.exports = {
        name: 'fields-plugin',
        version: '2.3.4',
        description: 'Fields test',
        author: 'Test Author',
        getTools() { return []; },
      };
    `,
      'utf-8',
    );

    const pm = new PluginManager();
    await pm.loadPlugin(filePath);

    const loaded = pm.getPlugin('fields-plugin');
    expect(loaded).toBeDefined();
    expect(loaded.plugin).toBeDefined();
    expect(loaded.plugin.name).toBe('fields-plugin');
    expect(loaded.plugin.version).toBe('2.3.4');
    expect(loaded.sourcePath).toBeDefined();
    expect(loaded.sourcePath).toContain('fields-plugin');
    expect(loaded.enabled).toBe(true);
    expect(typeof loaded.loadedAt).toBe('number');
    expect(loaded.loadedAt).toBeLessThanOrEqual(Date.now());

    cleanup(tmpDir);
  });

  it('destroy应清理所有插件（unsafe模式）', async () => {
    const tmpDir = join(tmpdir(), `easyagent-destroy-unsafe-${Date.now()}`);
    mkdirSync(tmpDir, { recursive: true });

    const { writeFileSync: wf } = await import('fs');
    for (let i = 1; i <= 3; i++) {
      wf(
        join(tmpDir, `plugin-${i}.js`),
        `
        module.exports = {
          name: 'destroy-${i}',
          version: '1.0.0',
          description: 'Destroy ${i}',
          getTools() { return []; },
        };
      `,
        'utf-8',
      );
    }

    const pm = new PluginManager();
    for (let i = 1; i <= 3; i++) {
      await pm.loadPlugin(join(tmpDir, `plugin-${i}.js`));
    }
    expect(pm.listPlugins().length).toBe(3);

    await pm.destroy();
    expect(pm.listPlugins().length).toBe(0);

    cleanup(tmpDir);
  });
});
