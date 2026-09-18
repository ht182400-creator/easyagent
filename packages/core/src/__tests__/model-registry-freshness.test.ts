/**
 * 模型目录「新鲜度」与「下线检测」测试
 *
 * ── 背景 ──
 * 客户端每次启动都会自动下载远程目录，但**下载成功 ≠ 数据新鲜**。
 * 实测 `models-catalog.json` 曾停留在 2026-06-19（91 天未重新生成），
 * 客户端每天都在拉这份旧数据，厂商的新模型永远不出现，而界面上**看不出任何异常**。
 *
 * 本测试锁定两条能力：
 *   ① 目录年龄可被量化判断（供启动告警 / UI 提示）
 *   ② 用户配置的模型若已不在目录中可被检出（厂商下线 / 改名）
 *
 * ⚠️ 只做提示，不自动改配置：擅自切换模型会改变回答质量与费用。
 *
 * @module __tests__/model-registry-freshness.test
 */

import { describe, it, expect } from 'vitest';
import { getModelRegistry } from '../config/ModelRegistry.js';

// ===================== 测试辅助 =====================

type RegistryInternals = { catalog: unknown; initialized: boolean };

/**
 * 直接注入目录数据
 *
 * ModelRegistry 的 catalog 是私有字段，且真实初始化依赖网络。
 * 这里绕过网络注入，以便**确定性地**测试纯逻辑（年龄计算 / 差集）。
 */
function seedCatalog(providers: unknown[], generatedAt: string) {
  const registry = getModelRegistry() as unknown as RegistryInternals;
  registry.catalog = {
    version: '9.9.9',
    generatedAt,
    // ⚠️ 必须**深拷贝**：ModelRegistry 是单例，而 mergeModels 会就地修改
    //    catalog.providers[].models。若直接注入原数组，前序用例的变更会写入
    //    测试文件级的共享 fixture，污染后续用例（实测导致"幂等"用例误报失败）。
    providers: JSON.parse(JSON.stringify(providers)),
  };
  registry.initialized = true;
  return registry;
}

/** ISO 时间戳：now - days 天 */
function daysAgo(days: number): string {
  return new Date(Date.now() - days * 86_400_000).toISOString();
}

// ===================== 新鲜度 =====================

describe('ModelRegistry.getFreshness — 目录新鲜度', () => {
  it('刚生成的目录应为新鲜', () => {
    seedCatalog([], daysAgo(0));
    const f = getModelRegistry().getFreshness();
    expect(f.stale).toBe(false);
    expect(f.ageDays).toBeLessThan(1);
  });

  it('超过阈值（默认 30 天）应判定为过期', () => {
    seedCatalog([], daysAgo(91));
    const f = getModelRegistry().getFreshness();
    expect(f.stale).toBe(true);
    expect(f.ageDays).toBeGreaterThan(90);
  });

  it('阈值可自定义', () => {
    seedCatalog([], daysAgo(10));
    expect(getModelRegistry().getFreshness(5).stale).toBe(true);
    expect(getModelRegistry().getFreshness(30).stale).toBe(false);
  });

  it('generatedAt 缺失或非法时应判定为过期（而不是当作新鲜）', () => {
    seedCatalog([], 'not-a-date');
    const f = getModelRegistry().getFreshness();
    expect(f.stale).toBe(true);
    expect(f.ageDays).toBeNull();
  });

  it('应回传用于判定的阈值与原始时间', () => {
    const at = daysAgo(3);
    seedCatalog([], at);
    const f = getModelRegistry().getFreshness(7);
    expect(f.generatedAt).toBe(at);
    expect(f.maxAgeDays).toBe(7);
  });
});

// ===================== 下线 / 改名检测 =====================

describe('ModelRegistry.findMissingModels — 下线检测', () => {
  const providers = [
    {
      provider: 'deepseek',
      providerName: 'DeepSeek',
      models: [{ id: 'deepseek-v4' }, { id: 'deepseek-r1' }],
    },
  ];

  it('目录中没有的模型应被检出（疑似下线或改名）', () => {
    seedCatalog(providers, daysAgo(0));
    const missing = getModelRegistry().findMissingModels('deepseek', [
      'deepseek-v4',
      'deepseek-v3-old',
    ]);
    expect(missing).toEqual(['deepseek-v3-old']);
  });

  it('全部存在时应返回空数组', () => {
    seedCatalog(providers, daysAgo(0));
    expect(getModelRegistry().findMissingModels('deepseek', ['deepseek-v4'])).toEqual([]);
  });

  it('提供商不在目录中时应返回空数组（不做误报）', () => {
    seedCatalog(providers, daysAgo(0));
    // 未知提供商无法判断，宁可不报，也不要把用户所有模型都标成"已下线"
    expect(getModelRegistry().findMissingModels('nonexistent', ['x'])).toEqual([]);
  });

  it('空列表应返回空数组', () => {
    seedCatalog(providers, daysAgo(0));
    expect(getModelRegistry().findMissingModels('deepseek', [])).toEqual([]);
  });
});

// ===================== 厂商直连合并 =====================

describe('ModelRegistry.mergeModels — 厂商 API 直连补齐', () => {
  const providers = [
    {
      provider: 'deepseek',
      providerName: 'DeepSeek',
      models: [
        { id: 'deepseek-v4', name: 'DeepSeek V4', maxContextTokens: 131072, supportsTools: true },
      ],
    },
  ];

  it('应把厂商新增的模型并入目录', () => {
    seedCatalog(providers, daysAgo(0));
    const added = getModelRegistry().mergeModels('deepseek', ['deepseek-v4', 'deepseek-v5'], '厂商API');
    expect(added).toBe(1);
    expect(getModelRegistry().getModels('deepseek' as never)?.map((m) => m.id)).toEqual([
      'deepseek-v4',
      'deepseek-v5',
    ]);
  });

  it('🛡️ 新并入的模型必须标记 unverified（元数据只是保守默认值，不能假装是真实规格）', () => {
    seedCatalog(providers, daysAgo(0));
    getModelRegistry().mergeModels('deepseek', ['deepseek-v5'], '厂商API');
    const model = getModelRegistry()
      .getModels('deepseek' as never)
      ?.find((m) => m.id === 'deepseek-v5');
    expect(model?.unverified).toBe(true);
  });

  it('🛡️ 已存在的模型不得被覆盖（保留人工校准过的元数据）', () => {
    seedCatalog(providers, daysAgo(0));
    getModelRegistry().mergeModels('deepseek', ['deepseek-v4'], '厂商API');
    const existing = getModelRegistry()
      .getModels('deepseek' as never)
      ?.find((m) => m.id === 'deepseek-v4');
    // 预设里的 131072 必须还在，不能被默认值 32768 覆盖
    expect(existing?.maxContextTokens).toBe(131072);
    expect(existing?.unverified).toBeUndefined();
  });

  it('🛡️ 只增不删：厂商端点未返回的已有模型必须保留', () => {
    seedCatalog(providers, daysAgo(0));
    getModelRegistry().mergeModels('deepseek', ['brand-new-model'], '厂商API');
    const ids = getModelRegistry().getModels('deepseek' as never)?.map((m) => m.id) ?? [];
    expect(ids).toContain('deepseek-v4');
    expect(ids).toContain('brand-new-model');
  });

  it('未知提供商应返回 0 且不抛异常', () => {
    seedCatalog(providers, daysAgo(0));
    expect(getModelRegistry().mergeModels('nonexistent', ['x'], '厂商API')).toBe(0);
  });

  it('空列表应返回 0', () => {
    seedCatalog(providers, daysAgo(0));
    expect(getModelRegistry().mergeModels('deepseek', [], '厂商API')).toBe(0);
  });

  it('重复调用应幂等（第二次不再新增）', () => {
    seedCatalog(providers, daysAgo(0));
    expect(getModelRegistry().mergeModels('deepseek', ['deepseek-v5'], '厂商API')).toBe(1);
    expect(getModelRegistry().mergeModels('deepseek', ['deepseek-v5'], '厂商API')).toBe(0);
  });
});
