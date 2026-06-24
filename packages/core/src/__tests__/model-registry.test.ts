/**
 * ModelRegistry 单元测试
 * 覆盖：四级降级链、缓存机制、单例模式、查询API、强制刷新、并发初始化
 * 
 * 策略：通过 mock fs 操作阻断缓存持久化，确保测试间隔离
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// ============== 缓存路径常量（与源码一致） ==============
const MOCK_CACHE_DIR = 'C:\\ea-test-cache\\.easyagent';
const MOCK_CACHE_FILE = 'C:\\ea-test-cache\\.easyagent\\models-catalog.json';

// ============== 测试辅助 ==============

/** 构建合法的 ModelsCatalog 对象 */
function createMockCatalog(providerId = 'openai', version = '1.0.0') {
  return {
    version,
    generatedAt: new Date().toISOString(),
    providers: [{
      provider: providerId,
      providerName: 'TestProvider',
      baseURL: 'https://api.test.com/v1',
      apiKeyEnv: 'TEST_API_KEY',
      apiFormat: 'openai' as const,
      defaultModel: 'test-model',
      models: [{ provider: providerId, model: 'test-model-1' }],
      updatedAt: new Date().toISOString(),
    }],
  };
}

// ============== fs mock：阻断缓存 I/O ==============
// 内存缓存模拟——每次测试前清空
let mockCacheContent: string | null = null;

vi.mock('node:os', () => ({
  homedir: () => 'C:\\ea-test-cache',
}));

vi.mock('node:fs', async () => {
  const actual = await vi.importActual<typeof import('node:fs')>('node:fs');
  return {
    ...actual,
    existsSync: (p: string) => {
      if (p.includes('models-catalog.json')) return mockCacheContent !== null;
      return (actual as any).existsSync(p);
    },
    readFileSync: (p: string, encoding?: string) => {
      if (p.includes('models-catalog.json') && mockCacheContent !== null) {
        return mockCacheContent;
      }
      throw new Error('ENOENT: no such file');
    },
    writeFileSync: (p: string, data: string) => {
      if (p.includes('models-catalog.json')) {
        mockCacheContent = data;
        return;
      }
    },
    mkdirSync: (..._args: any[]) => {
      // 缓存目录创建：无操作（不写真实磁盘）
    },
    renameSync: actual.renameSync,
    rmdirSync: actual.rmdirSync,
    statSync: actual.statSync,
    unlinkSync: actual.unlinkSync,
  };
});

// 每次测试前：清空 mock 缓存 + 重置单例
beforeEach(async () => {
  mockCacheContent = null;
  vi.unstubAllGlobals();
  (await import('../config/ModelRegistry.js')).resetModelRegistry();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

// ================================================================
// 套件 1: 单例模式
// ================================================================
describe('ModelRegistry — 单例模式', () => {
  it('getModelRegistry() 应始终返回同一个实例', async () => {
    const { getModelRegistry } = await import('../config/ModelRegistry.js');
    const r1 = getModelRegistry();
    const r2 = getModelRegistry();
    expect(r1).toBe(r2);
  });

  it('resetModelRegistry() 后应返回新实例', async () => {
    const { getModelRegistry, resetModelRegistry } = await import('../config/ModelRegistry.js');
    const r1 = getModelRegistry();
    resetModelRegistry();
    const r2 = getModelRegistry();
    expect(r1).not.toBe(r2);
  });
});

// ================================================================
// 套件 2: 未初始化状态
// ================================================================
describe('ModelRegistry — 未初始化状态', () => {
  it('初始化前 isReady() 应为 false', async () => {
    const { getModelRegistry } = await import('../config/ModelRegistry.js');
    expect(getModelRegistry().isReady()).toBe(false);
  });

  it('未初始化时 getModels() 应返回 null', async () => {
    const { getModelRegistry } = await import('../config/ModelRegistry.js');
    expect(getModelRegistry().getModels('deepseek')).toBeNull();
  });

  it('未初始化时 getProviderEntry() 应返回 null', async () => {
    const { getModelRegistry } = await import('../config/ModelRegistry.js');
    expect(getModelRegistry().getProviderEntry('deepseek')).toBeNull();
  });

  it('未初始化时 getAllEntries() 应返回 null', async () => {
    const { getModelRegistry } = await import('../config/ModelRegistry.js');
    expect(getModelRegistry().getAllEntries()).toBeNull();
  });

  it('未初始化时 getCatalog() 应返回 null', async () => {
    const { getModelRegistry } = await import('../config/ModelRegistry.js');
    expect(getModelRegistry().getCatalog()).toBeNull();
  });

  it('未初始化时 getVersion() 应返回 null', async () => {
    const { getModelRegistry } = await import('../config/ModelRegistry.js');
    expect(getModelRegistry().getVersion()).toBeNull();
  });

  it('未初始化时 getGeneratedAt() 应返回 null', async () => {
    const { getModelRegistry } = await import('../config/ModelRegistry.js');
    expect(getModelRegistry().getGeneratedAt()).toBeNull();
  });
});

// ================================================================
// 套件 3: 初始化和查询 (mock fetch)
// ================================================================
describe('ModelRegistry — 初始化和查询', () => {
  it('远程下载成功后应 ready + 数据可查询', async () => {
    const mockCatalog = createMockCatalog('deepseek', '2.0.0');
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      text: async () => JSON.stringify(mockCatalog),
    }));

    const { getModelRegistry } = await import('../config/ModelRegistry.js');
    await getModelRegistry().initialize();

    expect(getModelRegistry().isReady()).toBe(true);
    expect(getModelRegistry().getVersion()).toBe('2.0.0');
    const models = getModelRegistry().getModels('deepseek');
    expect(models).not.toBeNull();
    expect(models!.length).toBe(1);
    expect(models![0].model).toBe('test-model-1');
    expect(getModelRegistry().getModels('ollama')).toBeNull();
  });

  it('getProviderEntry() 返回完整条目信息', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      text: async () => JSON.stringify(createMockCatalog('openai', '1.0.0')),
    }));

    const { getModelRegistry } = await import('../config/ModelRegistry.js');
    await getModelRegistry().initialize();

    const entry = getModelRegistry().getProviderEntry('openai');
    expect(entry).not.toBeNull();
    expect(entry!.apiFormat).toBe('openai');
    expect(entry!.baseURL).toBe('https://api.test.com/v1');
    expect(entry!.providerName).toBe('TestProvider');
  });

  it('getAllEntries() 和 getCatalog() 返回完整数据', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      text: async () => JSON.stringify(createMockCatalog('qwen', '3.0.0')),
    }));

    const { getModelRegistry } = await import('../config/ModelRegistry.js');
    await getModelRegistry().initialize();

    expect(getModelRegistry().getAllEntries()).toHaveLength(1);
    expect(getModelRegistry().getCatalog()!.version).toBe('3.0.0');
  });

  it('getVersion() 和 getGeneratedAt() 返回正确值', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      text: async () => JSON.stringify(createMockCatalog('zhipu', '4.0.0')),
    }));

    const { getModelRegistry } = await import('../config/ModelRegistry.js');
    await getModelRegistry().initialize();

    expect(getModelRegistry().getVersion()).toBe('4.0.0');
    expect(typeof getModelRegistry().getGeneratedAt()).toBe('string');
    expect(getModelRegistry().getGeneratedAt()!.length).toBeGreaterThan(0);
  });
});

// ================================================================
// 套件 4: 并发初始化防护
// ================================================================
describe('ModelRegistry — 并发初始化防护', () => {
  it('多次同时调用 initialize() 只触发一次下载链', async () => {
    let fetchCalls = 0;
    vi.stubGlobal('fetch', vi.fn().mockImplementation(async () => {
      fetchCalls++;
      return { ok: true, text: async () => JSON.stringify(createMockCatalog('deepseek')) };
    }));

    const { getModelRegistry } = await import('../config/ModelRegistry.js');
    const registry = getModelRegistry();

    await Promise.all([
      registry.initialize(),
      registry.initialize(),
      registry.initialize(),
    ]);

    // 主URL成功就不会尝试备用URL，所以只有1次
    expect(fetchCalls).toBe(1);
    expect(registry.isReady()).toBe(true);
  });
});

// ================================================================
// 套件 5: 强制刷新
// ================================================================
describe('ModelRegistry — 强制刷新', () => {
  it('forceRefresh=true 应重新下载（跳过缓存检查）', async () => {
    let fetchCalls = 0;
    vi.stubGlobal('fetch', vi.fn().mockImplementation(async () => {
      fetchCalls++;
      return { ok: true, text: async () => JSON.stringify(createMockCatalog('qwen')) };
    }));

    const { getModelRegistry } = await import('../config/ModelRegistry.js');
    const registry = getModelRegistry();

    // 第一次初始化（无缓存，触发下载）
    await registry.initialize();
    expect(fetchCalls).toBe(1);

    // 用 refresh() 强制重新下载
    await registry.refresh();
    expect(fetchCalls).toBe(2);
  });

  it('refresh() 应重新下载并返回最新版本', async () => {
    let callNum = 0;
    vi.stubGlobal('fetch', vi.fn().mockImplementation(async () => {
      callNum++;
      return { ok: true, text: async () => JSON.stringify(createMockCatalog('qwen', `v${callNum}.0.0`)) };
    }));

    const { getModelRegistry } = await import('../config/ModelRegistry.js');
    const registry = getModelRegistry();

    await registry.initialize();
    expect(registry.getVersion()).toBe('v1.0.0');

    await registry.refresh();
    expect(registry.getVersion()).toBe('v2.0.0');
  });
});

// ================================================================
// 套件 6: 下载容错
// ================================================================
describe('ModelRegistry — 下载容错', () => {
  it('HTTP 404 应不崩溃', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false, status: 404, text: async () => 'not found',
    }));

    const { getModelRegistry } = await import('../config/ModelRegistry.js');
    await expect(getModelRegistry().initialize()).resolves.toBeUndefined();
  });

  it('JSON 解析失败应优雅处理', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true, text: async () => 'not valid {{{ json',
    }));

    const { getModelRegistry } = await import('../config/ModelRegistry.js');
    await expect(getModelRegistry().initialize()).resolves.toBeUndefined();
  });

  it('缺少 providers 字段应优雅处理', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true, text: async () => JSON.stringify({ version: '1.0', providers: null }),
    }));

    const { getModelRegistry } = await import('../config/ModelRegistry.js');
    await getModelRegistry().initialize();
    // 不崩溃 = 通过
  });

  it('AbortError 应被捕获', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(
      new DOMException('The operation was aborted', 'AbortError')
    ));

    const { getModelRegistry } = await import('../config/ModelRegistry.js');
    await expect(getModelRegistry().initialize()).resolves.toBeUndefined();
  });

  it('网络完全不可达应不崩溃', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('ENOTFOUND')));

    const { getModelRegistry } = await import('../config/ModelRegistry.js');
    await expect(getModelRegistry().initialize()).resolves.toBeUndefined();
  });
});

// ================================================================
// 套件 7: 缓存 TTL 边界（通过真实 ModelRegistry 验证）
// ================================================================
describe('ModelRegistry — 缓存 TTL 边界', () => {
  it('缓存距今 23h 应直接使用，不发起网络请求', async () => {
    const catalog23h = createMockCatalog('openai', 'almost-expired');
    const meta23h = {
      downloadedAt: Date.now() - 23 * 60 * 60 * 1000,  // 23小时前
      source: 'test',
      catalog: catalog23h,
    };
    mockCacheContent = JSON.stringify(meta23h);

    let fetchCalled = false;
    vi.stubGlobal('fetch', vi.fn().mockImplementation(() => {
      fetchCalled = true;
      return { ok: true, text: async () => JSON.stringify(createMockCatalog('openai', 'remote-new')) };
    }));

    const { getModelRegistry } = await import('../config/ModelRegistry.js');
    await getModelRegistry().initialize();

    expect(fetchCalled).toBe(false);
    expect(getModelRegistry().getVersion()).toBe('almost-expired');
  });

  it('缓存距今 25h 应重新下载', async () => {
    const catalog25h = createMockCatalog('openai', 'expired');
    const meta25h = {
      downloadedAt: Date.now() - 25 * 60 * 60 * 1000,  // 25小时前
      source: 'test',
      catalog: catalog25h,
    };
    mockCacheContent = JSON.stringify(meta25h);

    let requestedVersion = '';
    vi.stubGlobal('fetch', vi.fn().mockImplementation(() => {
      const catalog = createMockCatalog('openai', 'fresh-3.0');
      requestedVersion = catalog.version;
      return { ok: true, text: async () => JSON.stringify(catalog) };
    }));

    const { getModelRegistry } = await import('../config/ModelRegistry.js');
    await getModelRegistry().initialize();

    expect(getModelRegistry().getVersion()).toBe('fresh-3.0');
  });

  it('缓存距今 24h 内（接近边界，不应过期）', async () => {
    const catalog24h = createMockCatalog('openai', 'boundary');
    const meta24h = {
      // +1000ms 补偿测试执行时延，确保 Date.now() - downloadedAt < CACHE_TTL
      downloadedAt: Date.now() - 24 * 60 * 60 * 1000 + 1000,
      source: 'test',
      catalog: catalog24h,
    };
    mockCacheContent = JSON.stringify(meta24h);

    let fetchCalled = false;
    vi.stubGlobal('fetch', vi.fn().mockImplementation(() => {
      fetchCalled = true;
      return { ok: true, text: async () => JSON.stringify(createMockCatalog('openai', 'should-not-use')) };
    }));

    const { getModelRegistry } = await import('../config/ModelRegistry.js');
    await getModelRegistry().initialize();

    expect(fetchCalled).toBe(false);
    expect(getModelRegistry().getVersion()).toBe('boundary');
  });

  it('缓存距今 24h+1ms 应过期重新下载', async () => {
    const catalog24h1ms = createMockCatalog('openai', 'just-expired');
    const meta24h1ms = {
      downloadedAt: Date.now() - 24 * 60 * 60 * 1000 - 1,  // 24小时+1ms
      source: 'test',
      catalog: catalog24h1ms,
    };
    mockCacheContent = JSON.stringify(meta24h1ms);

    let fetchCalled = false;
    vi.stubGlobal('fetch', vi.fn().mockImplementation(() => {
      fetchCalled = true;
      return { ok: true, text: async () => JSON.stringify(createMockCatalog('openai', 'refreshed')) };
    }));

    const { getModelRegistry } = await import('../config/ModelRegistry.js');
    await getModelRegistry().initialize();

    expect(fetchCalled).toBe(true);
    expect(getModelRegistry().getVersion()).toBe('refreshed');
  });
});

// ================================================================
// 套件 8: 缓存读取验证
// ================================================================
describe('ModelRegistry — 缓存读写', () => {
  it('本地缓存存在且未过期时应直接使用（不发起网络请求）', async () => {
    // 预填充 mock 缓存
    const cachedCatalog = createMockCatalog('openai', 'cached-1.0');
    const cacheMeta = {
      downloadedAt: Date.now() - 1000, // 1秒前，未过期
      source: 'test',
      catalog: cachedCatalog,
    };
    mockCacheContent = JSON.stringify(cacheMeta);

    let fetchCalled = false;
    vi.stubGlobal('fetch', vi.fn().mockImplementation(() => {
      fetchCalled = true;
      return { ok: true, text: async () => JSON.stringify(createMockCatalog('openai', 'remote-2.0')) };
    }));

    const { getModelRegistry } = await import('../config/ModelRegistry.js');
    await getModelRegistry().initialize();

    expect(fetchCalled).toBe(false); // 不应发起网络请求
    expect(getModelRegistry().getVersion()).toBe('cached-1.0'); // 使用缓存版本
    expect(getModelRegistry().isReady()).toBe(true);
  });

  it('缓存过期时应发起远程更新', async () => {
    // 预填充过期缓存 (25小时前)
    const cachedCatalog = createMockCatalog('openai', 'old-1.0');
    const cacheMeta = {
      downloadedAt: Date.now() - 25 * 60 * 60 * 1000,
      source: 'test',
      catalog: cachedCatalog,
    };
    mockCacheContent = JSON.stringify(cacheMeta);

    let fetchCalled = false;
    vi.stubGlobal('fetch', vi.fn().mockImplementation(() => {
      fetchCalled = true;
      return { ok: true, text: async () => JSON.stringify(createMockCatalog('openai', 'new-2.0')) };
    }));

    const { getModelRegistry } = await import('../config/ModelRegistry.js');
    await getModelRegistry().initialize();

    expect(fetchCalled).toBe(true); // 过期应发起请求
    expect(getModelRegistry().getVersion()).toBe('new-2.0'); // 使用新版本
  });

  it('远程下载失败时应回退到过期缓存', async () => {
    // 预填充过期缓存
    const cachedCatalog = createMockCatalog('qwen', 'fallback-1.0');
    const cacheMeta = {
      downloadedAt: Date.now() - 25 * 60 * 60 * 1000, // 25h前，已过期
      source: 'test',
      catalog: cachedCatalog,
    };
    mockCacheContent = JSON.stringify(cacheMeta);

    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Network down')));

    const { getModelRegistry } = await import('../config/ModelRegistry.js');
    await getModelRegistry().initialize();

    // 应回退到本地缓存
    expect(getModelRegistry().isReady()).toBe(true);
    expect(getModelRegistry().getVersion()).toBe('fallback-1.0');
  });
});

// ================================================================
// 套件 9: 类型安全验证
// ================================================================
describe('ModelRegistry — 类型安全', () => {
  it('getModels 返回正确的模型结构', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      text: async () => JSON.stringify(createMockCatalog('openai', '1.0')),
    }));

    const { getModelRegistry } = await import('../config/ModelRegistry.js');
    await getModelRegistry().initialize();

    const models = getModelRegistry().getModels('openai');
    expect(models).not.toBeNull();
    if (models) {
      expect(Array.isArray(models)).toBe(true);
      expect(models[0]).toHaveProperty('provider');
      expect(models[0]).toHaveProperty('model');
    }
  });

  it('ProviderEntry 结构完整', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      text: async () => JSON.stringify(createMockCatalog('zhipu', '5.0')),
    }));

    const { getModelRegistry } = await import('../config/ModelRegistry.js');
    await getModelRegistry().initialize();

    const entry = getModelRegistry().getProviderEntry('zhipu')!;
    expect(entry.provider).toBe('zhipu');
    expect(entry.providerName).toBeTruthy();
    expect(entry.baseURL).toMatch(/^https?:\/\//);
    expect(entry.apiKeyEnv).toBeTruthy();
    expect(['openai', 'anthropic', 'custom']).toContain(entry.apiFormat);
    expect(Array.isArray(entry.models)).toBe(true);
  });
});
