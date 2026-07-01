/**
 * AgentFactory — 一键创建 LangGraphAgent 的工厂函数
 *
 * 封装适配器桥接 + 工具桥接，提供与 AgentEngine 相似的构造体验。
 * 使用者无需手动创建 bridge，只需传入 adapter + toolRegistry + options。
 *
 * @module bridge/AgentFactory
 */
import { LangGraphAgent } from '../Agent';
import type { AgentConfig } from '../Agent';
import { createAdapterBridge } from './adapterBridge';
import { createToolBridge } from './toolBridge';
import type { BaseAdapter, ProviderConfig, ToolRegistry } from '@easyagent/core';

/**
 * createLangGraphAgent 的额外选项
 */
export interface LangGraphAgentOptions {
  /** 指定模型名称（当第一个参数为 ProviderConfig 时使用） */
  model?: string;
  /** 系统提示词 */
  systemPrompt?: string;
  /** 最大对话轮次 */
  maxTurns?: number;
  /** 工作区路径 */
  workspace?: string;
  /** 会话 ID */
  sessionId?: string;
  /** Checkpoint 持久化配置 */
  checkpointerConfig?: AgentConfig['checkpointerConfig'];
  /** 长期记忆配置 */
  memoryConfig?: AgentConfig['memoryConfig'];
}

/**
 * 判断一个对象是否为 BaseAdapter 实例
 */
function isBaseAdapter(obj: unknown): obj is BaseAdapter {
  return (
    obj != null &&
    typeof obj === 'object' &&
    'chat' in obj &&
    typeof (obj as Record<string, unknown>).chat === 'function' &&
    'providerName' in obj
  );
}

/**
 * 判断一个对象是否为 ProviderConfig
 */
function isProviderConfig(obj: unknown): obj is ProviderConfig {
  return (
    obj != null &&
    typeof obj === 'object' &&
    'id' in obj &&
    'baseURL' in obj &&
    'apiKey' in obj
  );
}

/**
 * 创建 LangGraphAgent 实例。
 *
 * 支持两种调用方式：
 * 1. 传入 BaseAdapter 实例（不带 model 参数，直接复用）
 * 2. 传入 ProviderConfig + 可选的 model 名称（内部通过 AdapterFactory 创建适配器）
 *
 * @param adapterOrConfig - 模型适配器实例或提供商配置
 * @param tools - EasyAgent 的 ToolRegistry 实例
 * @param options - 额外选项
 * @returns LangGraphAgent 实例
 *
 * @example
 * // 方式1：使用已有 BaseAdapter
 * const adapter = AdapterFactory.create({ ... });
 * const agent = createLangGraphAgent(adapter, registry, { maxTurns: 25 });
 *
 * @example
 * // 方式2：使用 ProviderConfig（自动创建适配器）
 * const agent = createLangGraphAgent(providerConfig, registry, { model: 'deepseek-chat' });
 */
export async function createLangGraphAgent(
  adapterOrConfig: BaseAdapter | ProviderConfig,
  tools: ToolRegistry,
  options: LangGraphAgentOptions = {}
): Promise<LangGraphAgent> {
  // 1. 解析适配器
  let adapter: BaseAdapter;

  if (isBaseAdapter(adapterOrConfig)) {
    adapter = adapterOrConfig;
  } else if (isProviderConfig(adapterOrConfig)) {
    // 延迟导入 AdapterFactory，避免循环依赖
    const { AdapterFactory } = await import('@easyagent/core');
    adapter = AdapterFactory.create(adapterOrConfig, options.model);
  } else {
    throw new Error('createLangGraphAgent: 第一个参数必须是 BaseAdapter 实例或 ProviderConfig 对象');
  }

  // 2. 创建适配器桥接
  const chat = createAdapterBridge(adapter);

  // 3. 创建工具桥接（context 在每次工具调用时动态获取）
  const toolExecutor = createToolBridge(tools, () => ({
    workspace: options.workspace || process.cwd(),
    sessionId: options.sessionId || '',
    // 每次调用创建新的 AbortController，允许外部 abort()
    signal: undefined,
  }));

  // 4. 组装配置并创建 Agent
  const agent = new LangGraphAgent({
    think: {
      chat,
      getToolDefinitions: () => {
        // core ToolDefinition.parameters.properties → Record<string, ToolParameter>
        // langgraph ToolDef.parameters.properties → Record<string, unknown>
        // 结构在运行时完全兼容，仅类型定义不同
        // 过滤掉仅用于评测场景的 benchmark_* 工具，避免普通聊天误触发。
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        return tools
          .getDefinitions()
          .filter((def) => !def.name.startsWith('benchmark_')) as any;
      },
      systemPrompt: options.systemPrompt,
    },
    act: {
      toolExecutor,
    },
    systemPrompt: options.systemPrompt || '你是一个有帮助的 AI 助手。',
    maxTurns: options.maxTurns ?? 25,
    checkpointerConfig: options.checkpointerConfig,
    memoryConfig: options.memoryConfig,
  });

  return agent;
}
