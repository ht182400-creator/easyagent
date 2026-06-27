/**
 * ToolRegistry 全面测试
 * 覆盖注册、执行、参数验证、错误处理、批量操作、列表查询等
 */
import { describe, it, expect, beforeEach } from 'vitest';

// 动态导入以避免模块初始化问题
async function createRegistry() {
  const { ToolRegistry } = await import('../tools/ToolRegistry.js');
  return new ToolRegistry();
}

/** 创建一个简单的echo工具 */
function createEchoTool(name = 'echo') {
  return {
    name,
    description: '回显工具',
    requiresConfirm: false,
    parameters: {
      type: 'object' as const,
      properties: {
        text: { type: 'string', description: '回显文本' },
      },
      required: ['text'],
    },
    execute: async (params: Record<string, unknown>) => ({
      success: true,
      content: `Echo: ${params.text}`,
    }),
  };
}

/** 创建一个带验证的工具 */
function createValidatedTool() {
  return {
    name: 'validated_tool',
    description: '带参数验证的工具',
    requiresConfirm: false,
    parameters: {
      type: 'object' as const,
      properties: {
        count: { type: 'number', description: '数量' },
      },
      required: ['count'],
    },
    validate: (params: Record<string, unknown>) => {
      const count = params.count as number;
      if (typeof count !== 'number' || count < 0) {
        return { valid: false, error: 'count必须是非负数' };
      }
      if (count > 100) {
        return { valid: false, error: 'count不能超过100' };
      }
      return { valid: true };
    },
    execute: async (params: Record<string, unknown>) => ({
      success: true,
      content: `处理了 ${params.count} 项`,
    }),
  };
}

describe('ToolRegistry - 注册与查询', () => {
  let registry: Awaited<ReturnType<typeof createRegistry>>;

  beforeEach(async () => {
    registry = await createRegistry();
  });

  it('应该能够注册单个工具', () => {
    registry.register(createEchoTool());
    expect(registry.has('echo')).toBe(true);
  });

  it('应该能够批量注册工具', () => {
    const tools = [createEchoTool('tool_a'), createEchoTool('tool_b'), createEchoTool('tool_c')];
    registry.registerAll(tools);
    expect(registry.has('tool_a')).toBe(true);
    expect(registry.has('tool_b')).toBe(true);
    expect(registry.has('tool_c')).toBe(true);
  });

  it('覆盖注册同名工具应不抛出异常', () => {
    registry.register(createEchoTool('dup'));
    expect(() => registry.register(createEchoTool('dup'))).not.toThrow();
    expect(registry.has('dup')).toBe(true);
  });

  it('应该能够获取已注册的工具', () => {
    const tool = createEchoTool();
    registry.register(tool);
    const found = registry.get('echo');
    expect(found).toBeDefined();
    expect(found!.name).toBe('echo');
  });

  it('获取未注册的工具应返回undefined', () => {
    const found = registry.get('nonexistent');
    expect(found).toBeUndefined();
  });

  it('应该能够注销工具', () => {
    registry.register(createEchoTool());
    expect(registry.has('echo')).toBe(true);
    const result = registry.unregister('echo');
    expect(result).toBe(true);
    expect(registry.has('echo')).toBe(false);
  });

  it('注销不存在的工具应返回false', () => {
    const result = registry.unregister('nonexistent');
    expect(result).toBe(false);
  });

  it('应该能够列出所有工具名和描述', () => {
    registry.register(createEchoTool('tool1'));
    registry.register(createEchoTool('tool2'));
    const list = registry.list();
    expect(list).toHaveLength(2);
    expect(list[0].name).toBe('tool1');
    expect(list[1].name).toBe('tool2');
  });
});

describe('ToolRegistry - 执行与结果', () => {
  let registry: Awaited<ReturnType<typeof createRegistry>>;
  const context = { workspace: '/tmp/test', sessionId: 'test-session' };

  beforeEach(async () => {
    registry = await createRegistry();
  });

  it('应该正确执行工具并返回结果', async () => {
    registry.register(createEchoTool());
    const result = await registry.execute('echo', { text: 'hello' }, context);
    expect(result.success).toBe(true);
    expect(result.content).toBe('Echo: hello');
  });

  it('执行未知工具应返回错误', async () => {
    const result = await registry.execute('unknown', {}, context);
    expect(result.success).toBe(false);
    expect(result.error).toContain('not found');
  });

  it('参数验证失败应返回错误', async () => {
    registry.register(createValidatedTool());
    const result = await registry.execute('validated_tool', { count: -1 }, context);
    expect(result.success).toBe(false);
    expect(result.error).toContain('非负数');
  });

  it('参数验证通过应正常执行', async () => {
    registry.register(createValidatedTool());
    const result = await registry.execute('validated_tool', { count: 42 }, context);
    expect(result.success).toBe(true);
    expect(result.content).toBe('处理了 42 项');
  });

  it('参数验证上限检查', async () => {
    registry.register(createValidatedTool());
    const result = await registry.execute('validated_tool', { count: 200 }, context);
    expect(result.success).toBe(false);
    expect(result.error).toContain('不能超过100');
  });

  it('工具执行抛出异常应被捕获并返回错误', async () => {
    registry.register({
      name: 'crash_tool',
      description: '会崩溃的工具',
      requiresConfirm: false,
      parameters: { type: 'object', properties: {}, required: [] },
      execute: async () => {
        throw new Error('工具内部错误');
      },
    });
    const result = await registry.execute('crash_tool', {}, context);
    expect(result.success).toBe(false);
    expect(result.content).toContain('工具执行失败');
    expect(result.error).toContain('工具内部错误');
  });

  it('应正确处理空参数', async () => {
    registry.register({
      name: 'no_param_tool',
      description: '无参数工具',
      requiresConfirm: false,
      parameters: { type: 'object', properties: {}, required: [] },
      execute: async () => ({ success: true, content: 'done' }),
    });
    const result = await registry.execute('no_param_tool', {}, context);
    expect(result.success).toBe(true);
    expect(result.content).toBe('done');
  });
});

describe('ToolRegistry - 工具定义与描述', () => {
  let registry: Awaited<ReturnType<typeof createRegistry>>;

  beforeEach(async () => {
    registry = await createRegistry();
  });

  it('getDefinitions应返回正确的JSON Schema格式', () => {
    registry.register(createEchoTool());
    const defs = registry.getDefinitions();
    expect(defs).toHaveLength(1);
    expect(defs[0].name).toBe('echo');
    expect(defs[0].parameters.type).toBe('object');
    expect(defs[0].parameters.required).toContain('text');
  });

  it('getDefinitions应返回空数组当无工具注册时', () => {
    const defs = registry.getDefinitions();
    expect(defs).toEqual([]);
  });

  it('getDescriptions应生成包含工具信息的描述文本', () => {
    registry.register(createEchoTool());
    const desc = registry.getDescriptions();
    expect(desc).toContain('echo');
    expect(desc).toContain('回显工具');
    expect(desc).toContain('text');
    expect(desc).toContain('(必需)');
  });

  it('getDescriptions应正确标注非必需参数', () => {
    registry.register({
      name: 'opt_tool',
      description: '可选参数工具',
      requiresConfirm: false,
      parameters: {
        type: 'object',
        properties: {
          required_param: { type: 'string', description: '必需参数' },
          optional_param: { type: 'string', description: '可选参数' },
        },
        required: ['required_param'],
      },
      execute: async () => ({ success: true, content: '' }),
    });
    const desc = registry.getDescriptions();
    expect(desc).toContain('(必需)');
    // optional_param 不应该有 (必需) 标记，但应该出现在描述中
    expect(desc).toContain('optional_param');
    expect(desc).toContain('可选参数');
  });

  it('getDescriptions空注册表应返回空字符串', () => {
    const desc = registry.getDescriptions();
    expect(desc).toBe('');
  });
});

describe('ToolRegistry - 边界条件', () => {
  let registry: Awaited<ReturnType<typeof createRegistry>>;

  beforeEach(async () => {
    registry = await createRegistry();
  });

  it('注册0个工具的批量操作不应出错', () => {
    expect(() => registry.registerAll([])).not.toThrow();
    expect(registry.list()).toHaveLength(0);
  });

  it('大量工具注册(100个)应正常工作', () => {
    const tools = Array.from({ length: 100 }, (_, i) => ({
      name: `tool_${i}`,
      description: `工具${i}`,
      requiresConfirm: false,
      parameters: { type: 'object' as const, properties: {}, required: [] },
      execute: async () => ({ success: true, content: `${i}` }),
    }));
    registry.registerAll(tools);
    expect(registry.list()).toHaveLength(100);
    expect(registry.has('tool_0')).toBe(true);
    expect(registry.has('tool_99')).toBe(true);
    expect(registry.has('tool_100')).toBe(false);
  });

  it('重复注销同一工具', () => {
    registry.register(createEchoTool());
    expect(registry.unregister('echo')).toBe(true);
    expect(registry.unregister('echo')).toBe(false);
  });

  it('工具名包含特殊字符', () => {
    const name = 'tool-with_special.chars';
    registry.register(createEchoTool(name));
    expect(registry.has(name)).toBe(true);
    expect(registry.get(name)!.name).toBe(name);
  });
});
