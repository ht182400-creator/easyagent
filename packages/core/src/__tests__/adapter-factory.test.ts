/**
 * 适配器工厂与适配器全面测试
 * 覆盖 AdapterFactory、BaseAdapter、OpenAICompatibleAdapter、ErnieAdapter、HunyuanAdapter
 */
import { describe, it, expect, beforeEach, beforeAll } from 'vitest';

/** 创建基础提供商配置 */
function makeProviderConfig(overrides: Record<string, unknown> = {}) {
  return {
    id: 'deepseek',
    name: 'DeepSeek',
    baseURL: 'https://api.deepseek.com',
    apiKey: 'test-key',
    apiFormat: 'openai' as const,
    models: [{
      id: 'deepseek-chat',
      name: 'DeepSeek V3',
      maxContextTokens: 65536,
      maxOutputTokens: 8192,
      supportsTools: true,
      supportsVision: false,
    }],
    ...overrides,
  };
}

describe('BaseAdapter - 基础功能', () => {
  let BaseAdapter: any;

  beforeAll(async () => {
    const mod = await import('../adapters/BaseAdapter.js');
    BaseAdapter = mod.BaseAdapter;
  });

  it('应正确设置providerName', () => {
    const config = makeProviderConfig();
    const adapter = new (class extends BaseAdapter {
      async chat() { return { id: '', model: '', content: '', finishReason: 'stop' }; }
      async *chatStream() { yield { delta: '' }; }
      async validateConnection() { return true; }
    })(config);
    expect(adapter.providerName).toBe('DeepSeek');
  });

  it('应正确设置currentModel', () => {
    const config = makeProviderConfig();
    const adapter = new (class extends BaseAdapter {
      async chat() { return { id: '', model: '', content: '', finishReason: 'stop' }; }
      async *chatStream() { yield { delta: '' }; }
      async validateConnection() { return true; }
    })(config);
    expect(adapter.currentModel).toBe('deepseek-chat');
  });

  it('应使用指定的modelName参数', () => {
    const config = makeProviderConfig({
      models: [
        { id: 'model-a', name: 'A', maxContextTokens: 4096, maxOutputTokens: 1024, supportsTools: true, supportsVision: false },
        { id: 'model-b', name: 'B', maxContextTokens: 8192, maxOutputTokens: 2048, supportsTools: true, supportsVision: false },
      ],
    });
    const adapter = new (class extends BaseAdapter {
      async chat() { return { id: '', model: '', content: '', finishReason: 'stop' }; }
      async *chatStream() { yield { delta: '' }; }
      async validateConnection() { return true; }
    })(config, 'model-b');
    expect(adapter.currentModel).toBe('model-b');
  });

  it('getModels应返回正确的ModelInfo格式', () => {
    const config = makeProviderConfig();
    const adapter = new (class extends BaseAdapter {
      async chat() { return { id: '', model: '', content: '', finishReason: 'stop' }; }
      async *chatStream() { yield { delta: '' }; }
      async validateConnection() { return true; }
    })(config);
    const models = adapter.getModels();
    expect(models).toHaveLength(1);
    expect(models[0].id).toBe('deepseek-chat');
    expect(models[0].provider).toBe('deepseek');
    expect(models[0].maxContextTokens).toBe(65536);
    expect(models[0].supportsTools).toBe(true);
  });

  it('switchModel应切换模型', () => {
    const config = makeProviderConfig({
      models: [
        { id: 'model-a', name: 'A', maxContextTokens: 4096, maxOutputTokens: 1024, supportsTools: true, supportsVision: false },
        { id: 'model-b', name: 'B', maxContextTokens: 8192, maxOutputTokens: 2048, supportsTools: true, supportsVision: false },
      ],
    });
    const adapter = new (class extends BaseAdapter {
      async chat() { return { id: '', model: '', content: '', finishReason: 'stop' }; }
      async *chatStream() { yield { delta: '' }; }
      async validateConnection() { return true; }
    })(config);
    adapter.switchModel('model-b');
    expect(adapter.currentModel).toBe('model-b');
  });

  it('switchModel到不存在的模型应抛出异常', () => {
    const config = makeProviderConfig();
    const adapter = new (class extends BaseAdapter {
      async chat() { return { id: '', model: '', content: '', finishReason: 'stop' }; }
      async *chatStream() { yield { delta: '' }; }
      async validateConnection() { return true; }
    })(config);
    expect(() => adapter.switchModel('nonexistent')).toThrow('不存在');
  });

  it('getModelInfo应返回当前模型信息', () => {
    const config = makeProviderConfig();
    const adapter = new (class extends BaseAdapter {
      async chat() { return { id: '', model: '', content: '', finishReason: 'stop' }; }
      async *chatStream() { yield { delta: '' }; }
      async validateConnection() { return true; }
    })(config);
    const info = adapter.getModelInfo();
    expect(info).toBeDefined();
    expect(info!.id).toBe('deepseek-chat');
    expect(info!.maxContextTokens).toBe(65536);
  });

  it('getModelInfo对空模型列表应返回undefined', () => {
    const config = makeProviderConfig({ models: [] });
    const adapter = new (class extends BaseAdapter {
      async chat() { return { id: '', model: '', content: '', finishReason: 'stop' }; }
      async *chatStream() { yield { delta: '' }; }
      async validateConnection() { return true; }
    })(config);
    expect(adapter.getModelInfo()).toBeUndefined();
  });
});

describe('OpenAICompatibleAdapter - 构造与配置', () => {
  let OpenAICompatibleAdapter: any;

  beforeAll(async () => {
    const mod = await import('../adapters/OpenAICompatibleAdapter.js');
    OpenAICompatibleAdapter = mod.OpenAICompatibleAdapter;
  });

  it('应正确设置baseURL追加/v1', () => {
    const config = makeProviderConfig({ baseURL: 'https://api.deepseek.com' });
    const adapter = new OpenAICompatibleAdapter(config);
    expect(adapter.currentModel).toBe('deepseek-chat');
    expect(adapter.providerName).toBe('DeepSeek');
  });

  it('已有/v1的URL不应重复追加', () => {
    const config = makeProviderConfig({ baseURL: 'https://api.deepseek.com/v1' });
    const adapter = new OpenAICompatibleAdapter(config);
    expect(adapter.providerName).toBe('DeepSeek');
  });

  it('应正确继承BaseAdapter的getModels', () => {
    const config = makeProviderConfig({
      models: [
        { id: 'm1', name: 'M1', maxContextTokens: 4096, maxOutputTokens: 1024, supportsTools: true, supportsVision: false },
        { id: 'm2', name: 'M2', maxContextTokens: 8192, maxOutputTokens: 2048, supportsTools: true, supportsVision: true },
      ],
    });
    const adapter = new OpenAICompatibleAdapter(config);
    const models = adapter.getModels();
    expect(models).toHaveLength(2);
    expect(models[1].supportsVision).toBe(true);
  });
});

describe('AdapterFactory - 创建适配器', () => {
  let AdapterFactory: any;
  let OpenAICompatibleAdapter: any;
  let ErnieAdapter: any;
  let HunyuanAdapter: any;

  beforeAll(async () => {
    const adaptersMod = await import('../adapters/index.js');
    AdapterFactory = adaptersMod.AdapterFactory;
    const oaiMod = await import('../adapters/OpenAICompatibleAdapter.js');
    OpenAICompatibleAdapter = oaiMod.OpenAICompatibleAdapter;
    const ernieMod = await import('../adapters/ErnieAdapter.js');
    ErnieAdapter = ernieMod.ErnieAdapter;
    const hunyuanMod = await import('../adapters/HunyuanAdapter.js');
    HunyuanAdapter = hunyuanMod.HunyuanAdapter;
  });

  it('应为openai格式创建OpenAICompatibleAdapter', () => {
    const config = makeProviderConfig({ apiFormat: 'openai' });
    const adapter = AdapterFactory.create(config);
    expect(adapter).toBeInstanceOf(OpenAICompatibleAdapter);
  });

  it('应为ernie创建ErnieAdapter', () => {
    const config = makeProviderConfig({
      id: 'ernie',
      name: '文心一言',
      baseURL: 'https://aip.baidubce.com',
      apiKey: 'key:secret',
      apiFormat: 'custom',
    });
    const adapter = AdapterFactory.create(config);
    expect(adapter).toBeInstanceOf(ErnieAdapter);
  });

  it('应为hunyuan创建HunyuanAdapter', () => {
    const config = makeProviderConfig({
      id: 'hunyuan',
      name: '混元',
      baseURL: 'https://api.hunyuan.cloud.tencent.com',
      apiKey: 'test-key',
      apiFormat: 'custom',
    });
    const adapter = AdapterFactory.create(config);
    expect(adapter).toBeInstanceOf(HunyuanAdapter);
  });

  it('未知custom提供商应回退到OpenAICompatibleAdapter', () => {
    const config = makeProviderConfig({
      id: 'unknown-custom',
      name: '未知自定义',
      apiFormat: 'custom',
    });
    const adapter = AdapterFactory.create(config);
    expect(adapter).toBeInstanceOf(OpenAICompatibleAdapter);
  });

  it('应支持指定modelName参数', () => {
    const config = makeProviderConfig({
      models: [
        { id: 'm1', name: 'M1', maxContextTokens: 4096, maxOutputTokens: 1024, supportsTools: true, supportsVision: false },
        { id: 'm2', name: 'M2', maxContextTokens: 8192, maxOutputTokens: 2048, supportsTools: true, supportsVision: false },
      ],
    });
    const adapter = AdapterFactory.create(config, 'm2');
    expect(adapter.currentModel).toBe('m2');
  });

  it('createAll应创建所有支持提供商的适配器(返回Map)', () => {
    const configs = [
      makeProviderConfig({ id: 'deepseek', name: 'DeepSeek' }),
      makeProviderConfig({
        id: 'ernie', name: '文心一言', baseURL: 'https://aip.baidubce.com',
        apiKey: 'key:secret', apiFormat: 'custom',
      }),
    ];
    const adapters = AdapterFactory.createAll(configs);
    // createAll 返回 Map<ProviderId, BaseAdapter>
    expect(adapters).toBeInstanceOf(Map);
    expect(adapters.size).toBe(2);
    expect(adapters.get('deepseek')).toBeInstanceOf(OpenAICompatibleAdapter);
    expect(adapters.get('ernie')).toBeInstanceOf(ErnieAdapter);
  });

  it('createAll空列表应返回空Map', () => {
    const adapters = AdapterFactory.createAll([]);
    expect(adapters).toBeInstanceOf(Map);
    expect(adapters.size).toBe(0);
  });
});

describe('AdapterFactory - 边界条件', () => {
  let AdapterFactory: any;

  beforeAll(async () => {
    const mod = await import('../adapters/index.js');
    AdapterFactory = mod.AdapterFactory;
  });

  it('无模型的配置应能创建适配器', () => {
    const config = makeProviderConfig({ models: [] });
    const adapter = AdapterFactory.create(config);
    expect(adapter).toBeDefined();
    expect(adapter.currentModel).toBe('');
  });

  it('使用defaultModel而非第一个模型', () => {
    const config = makeProviderConfig({
      defaultModel: 'deepseek-r1',
      models: [
        { id: 'deepseek-chat', name: 'V3', maxContextTokens: 65536, maxOutputTokens: 8192, supportsTools: true, supportsVision: false },
        { id: 'deepseek-r1', name: 'R1', maxContextTokens: 65536, maxOutputTokens: 8192, supportsTools: true, supportsVision: false },
      ],
    });
    const adapter = AdapterFactory.create(config);
    expect(adapter.currentModel).toBe('deepseek-r1');
  });
});

describe('OpenAICompatibleAdapter - URL构造（防止Kimi类空URL缺陷）', () => {
  let OpenAICompatibleAdapter: any;

  beforeAll(async () => {
    const mod = await import('../adapters/OpenAICompatibleAdapter.js');
    OpenAICompatibleAdapter = mod.OpenAICompatibleAdapter;
  });

  it('baseURL以/v1结尾的Kimi预设应保持不变', () => {
    const config = makeProviderConfig({
      id: 'kimi',
      baseURL: 'https://api.moonshot.cn/v1',
      apiKey: 'sk-moonshot-key',
    });
    const adapter = new OpenAICompatibleAdapter(config);
    expect(adapter.baseURL).toBe('https://api.moonshot.cn/v1');
  });

  it('baseURL不以/v1结尾应自动追加', () => {
    const config = makeProviderConfig({
      id: 'qwen',
      baseURL: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
      apiKey: 'sk-qwen-key',
    });
    const adapter = new OpenAICompatibleAdapter(config);
    expect(adapter.baseURL).toBe('https://dashscope.aliyuncs.com/compatible-mode/v1');
  });

  it('baseURL末尾带斜杠应正确去除后追加/v1', () => {
    const config = makeProviderConfig({
      id: 'custom',
      baseURL: 'https://api.example.com/',
      apiKey: 'test-key',
    });
    const adapter = new OpenAICompatibleAdapter(config);
    expect(adapter.baseURL).toBe('https://api.example.com/v1');
  });

  it('空baseURL应产生不完整的URL并在连接时暴露错误', () => {
    // 模拟bug场景：setApiKey曾创建过空baseURL的条目
    const config = makeProviderConfig({
      id: 'kimi',
      baseURL: '',
      apiKey: 'test-key',
    });
    const adapter = new OpenAICompatibleAdapter(config);
    // 空baseURL会导致 '/v1' → 仅 '/v1'，缺少协议和主机
    // 虽不是falsy，但URL不完整
    expect(adapter.baseURL).toBe('/v1');
    // 调用 validateConnection 时会因为缺少主机而抛出连接错误
  });
});
