/**
 * 插件管理器和内置技能测试
 * 覆盖 PluginManager、BuiltinSkills 的正常与异常场景
 */
import { describe, it, expect, beforeEach, beforeAll, afterEach } from 'vitest';

// ==================== BuiltinSkills 测试 ====================
describe('BuiltinSkills - 技能定义', () => {
  let skills: any;

  beforeAll(async () => {
    skills = await import('../plugins/BuiltinSkills.js');
  });

  it('BUILTIN_SKILLS应包含6个技能', () => {
    expect(skills.BUILTIN_SKILLS).toHaveLength(6);
  });

  it('CodeReviewSkill应有正确的名称和标签', () => {
    expect(skills.CodeReviewSkill.name).toBe('code-review');
    expect(skills.CodeReviewSkill.tags).toContain('code');
    expect(skills.CodeReviewSkill.tags).toContain('review');
    expect(skills.CodeReviewSkill.prompt).toBeDefined();
    expect(skills.CodeReviewSkill.prompt.length).toBeGreaterThan(100);
  });

  it('UnitTestSkill应有正确的名称和标签', () => {
    expect(skills.UnitTestSkill.name).toBe('unit-test-generator');
    expect(skills.UnitTestSkill.tags).toContain('testing');
  });

  it('CodeExplainSkill应有正确的名称和标签', () => {
    expect(skills.CodeExplainSkill.name).toBe('code-explain');
    expect(skills.CodeExplainSkill.tags).toContain('learning');
  });

  it('GenerateDocSkill应有正确的名称和标签', () => {
    expect(skills.GenerateDocSkill.name).toBe('generate-doc');
    expect(skills.GenerateDocSkill.tags).toContain('documentation');
  });

  it('RefactorSkill应有正确的名称和标签', () => {
    expect(skills.RefactorSkill.name).toBe('refactor');
    expect(skills.RefactorSkill.tags).toContain('refactoring');
  });

  it('DebugSkill应有正确的名称和标签', () => {
    expect(skills.DebugSkill.name).toBe('debug');
    expect(skills.DebugSkill.tags).toContain('debugging');
  });

  it('所有技能都有description', () => {
    for (const skill of skills.BUILTIN_SKILLS) {
      expect(skill.description).toBeDefined();
      expect(skill.description.length).toBeGreaterThan(5);
    }
  });

  it('所有技能都有prompt', () => {
    for (const skill of skills.BUILTIN_SKILLS) {
      expect(skill.prompt).toBeDefined();
      expect(skill.prompt.length).toBeGreaterThan(50);
    }
  });

  it('所有技能的name应为kebab-case', () => {
    for (const skill of skills.BUILTIN_SKILLS) {
      expect(skill.name).toMatch(/^[a-z]+(-[a-z]+)*$/);
    }
  });
});

describe('BuiltinSkills - 查找函数', () => {
  let mod: any;

  beforeAll(async () => {
    mod = await import('../plugins/BuiltinSkills.js');
  });

  it('getSkillsByTag("code")应返回相关技能', () => {
    const result = mod.getSkillsByTag('code');
    expect(result.length).toBeGreaterThanOrEqual(3);
    const names = result.map((s: any) => s.name);
    expect(names).toContain('code-review');
    expect(names).toContain('code-explain');
    expect(names).toContain('refactor');
  });

  it('getSkillsByTag("testing")应返回测试相关技能', () => {
    const result = mod.getSkillsByTag('testing');
    expect(result.length).toBeGreaterThanOrEqual(1);
    expect(result[0].name).toBe('unit-test-generator');
  });

  it('getSkillsByTag("documentation")应返回文档相关技能', () => {
    const result = mod.getSkillsByTag('documentation');
    expect(result.length).toBeGreaterThanOrEqual(2);
    const names = result.map((s: any) => s.name);
    expect(names).toContain('code-explain');
    expect(names).toContain('generate-doc');
  });

  it('getSkillsByTag("quality")应返回质量相关技能', () => {
    const result = mod.getSkillsByTag('quality');
    expect(result.length).toBeGreaterThanOrEqual(2);
    const names = result.map((s: any) => s.name);
    expect(names).toContain('code-review');
    expect(names).toContain('refactor');
  });

  it('getSkillsByTag不存在的标签应返回空数组', () => {
    const result = mod.getSkillsByTag('nonexistent_tag_xyz');
    expect(result).toEqual([]);
  });

  it('getSkillsByTag空字符串应返回空数组', () => {
    const result = mod.getSkillsByTag('');
    expect(result).toEqual([]);
  });

  it('getSkillByName应精确查找', () => {
    const skill = mod.getSkillByName('code-review');
    expect(skill).toBeDefined();
    expect(skill.name).toBe('code-review');
  });

  it('getSkillByName不存在的名称应返回undefined', () => {
    const skill = mod.getSkillByName('non-existent-skill');
    expect(skill).toBeUndefined();
  });

  it('getSkillByName空字符串应返回undefined', () => {
    const skill = mod.getSkillByName('');
    expect(skill).toBeUndefined();
  });

  it('getSkillsByTag("debugging")应返回debug技能', () => {
    const result = mod.getSkillsByTag('debugging');
    expect(result.length).toBe(1);
    expect(result[0].name).toBe('debug');
  });

  it('getSkillsByTag("troubleshooting")应返回debug技能', () => {
    const result = mod.getSkillsByTag('troubleshooting');
    expect(result.length).toBe(1);
    expect(result[0].name).toBe('debug');
  });
});

// ==================== PluginManager 测试 ====================
describe('PluginManager - 基础功能', () => {
  let PluginManager: any;
  let resetPluginManager: any;
  let getPluginManager: any;
  let ToolRegistry: any;

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
  });

  afterEach(() => {
    resetPluginManager();
  });

  it('应正确创建PluginManager实例', () => {
    const pm = new PluginManager();
    expect(pm.listPlugins()).toEqual([]);
    expect(pm.getSkills()).toEqual([]);
  });

  it('应正确设置ToolRegistry', () => {
    const pm = new PluginManager();
    const registry = new ToolRegistry();
    pm.setToolRegistry(registry);
    // 设置后应能通过listPlugins验证无错误
    expect(pm.listPlugins()).toEqual([]);
  });

  it('getPlugin不存在的插件应返回undefined', () => {
    const pm = new PluginManager();
    expect(pm.getPlugin('nonexistent')).toBeUndefined();
  });

  it('getSkill不存在的技能应返回undefined', () => {
    const pm = new PluginManager();
    expect(pm.getSkill('nonexistent')).toBeUndefined();
  });

  it('listPlugins空实例应返回空数组', () => {
    const pm = new PluginManager();
    expect(pm.listPlugins()).toEqual([]);
    expect(pm.getEnabledPlugins()).toEqual([]);
  });

  it('getSkills空实例应返回空数组', () => {
    const pm = new PluginManager();
    expect(pm.getSkills()).toEqual([]);
  });

  it('getPluginManager应返回单例', () => {
    const pm1 = getPluginManager();
    const pm2 = getPluginManager();
    expect(pm1).toBe(pm2);
  });

  it('resetPluginManager应重置单例', () => {
    const pm1 = getPluginManager();
    resetPluginManager();
    const pm2 = getPluginManager();
    expect(pm1).not.toBe(pm2);
  });

  it('应支持自定义配置', () => {
    const pm = new PluginManager({
      hotReload: true,
      disabledPlugins: ['plugin-a', 'plugin-b'],
      extraPluginPaths: ['/custom/path'],
    });
    // 通过内部结构验证配置
    expect(pm).toBeDefined();
  });
});

describe('PluginManager - enable/disable', () => {
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

  afterEach(() => {
    resetPluginManager();
  });

  it('disablePlugin不存在的插件应无操作', async () => {
    const pm = new PluginManager();
    await expect(pm.disablePlugin('nonexistent')).resolves.toBeUndefined();
  });

  it('enablePlugin不存在的插件应抛出异常', async () => {
    const pm = new PluginManager();
    await expect(pm.enablePlugin('nonexistent')).rejects.toThrow('未加载');
  });
});

describe('PluginManager - destroy与清理', () => {
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

  it('destroy空实例应成功', async () => {
    const pm = new PluginManager();
    await expect(pm.destroy()).resolves.toBeUndefined();
    expect(pm.listPlugins()).toEqual([]);
  });
});

describe('PluginManager - 钩子机制', () => {
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

  it('triggerHook无注册钩子应返回原上下文', async () => {
    const pm = new PluginManager();
    const ctx = { event: 'beforeMessage' as any, sessionId: 'test' };
    const result = await pm.triggerHook('beforeMessage', ctx);
    expect(result.sessionId).toBe('test');
    expect(result).toEqual(ctx);
  });

  it('triggerHook应执行注册的钩子并按优先级排序', async () => {
    const pm = new PluginManager();
    const executionOrder: number[] = [];

    // 通过内部方法注册钩子
    const hooks = pm['hooks'];
    hooks.set('beforeMessage', [
      {
        event: 'beforeMessage',
        priority: 200,
        handler: async (ctx: any) => {
          executionOrder.push(2);
          return { ...ctx, modified: 'low' };
        },
      },
      {
        event: 'beforeMessage',
        priority: 100,
        handler: async (ctx: any) => {
          executionOrder.push(1);
          return { ...ctx, modified: 'high' };
        },
      },
    ]);

    const result = await pm.triggerHook('beforeMessage', { event: 'beforeMessage' });
    expect(executionOrder).toEqual([1, 2]); // 优先级小的先执行
  });

  it('triggerHook中preventDefault应中断后续钩子', async () => {
    const pm = new PluginManager();
    const executionOrder: number[] = [];

    const hooks = pm['hooks'];
    hooks.set('beforeMessage', [
      {
        event: 'beforeMessage',
        priority: 100,
        handler: async (ctx: any) => {
          executionOrder.push(1);
          return { ...ctx, preventDefault: true };
        },
      },
      {
        event: 'beforeMessage',
        priority: 200,
        handler: async (ctx: any) => {
          executionOrder.push(2); // 不应被执行
          return ctx;
        },
      },
    ]);

    await pm.triggerHook('beforeMessage', { event: 'beforeMessage' });
    expect(executionOrder).toEqual([1]); // 第二个钩子被跳过
  });

  it('triggerHook中钩子异常不应中断后续钩子', async () => {
    const pm = new PluginManager();
    const executionOrder: number[] = [];

    const hooks = pm['hooks'];
    hooks.set('beforeMessage', [
      {
        event: 'beforeMessage',
        priority: 100,
        handler: async () => {
          executionOrder.push(1);
          throw new Error('钩子执行错误');
        },
      },
      {
        event: 'beforeMessage',
        priority: 200,
        handler: async (ctx: any) => {
          executionOrder.push(2);
          return ctx;
        },
      },
    ]);

    await pm.triggerHook('beforeMessage', { event: 'beforeMessage' });
    expect(executionOrder).toEqual([1, 2]); // 第二个钩子仍执行
  });
});
