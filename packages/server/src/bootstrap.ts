/**
 * 服务端初始化引导（P1-1 第六批拆分产物）
 *
 * ── 本模块的约定 ──
 *   1. **纯搬迁**：各初始化块的执行逻辑与拆分前完全一致，仅改为显式依赖注入的工厂函数；
 *   2. index.ts 只负责编排：创建管理器 → 组装依赖 → 注册路由 → 返回服务对象；
 *   3. `createWsHub()` 必须在 `createAutomationSystem()` **之前**调用 ——
 *      自动化执行器依赖 `broadcastAutomationProgress`（创建时注入同一实例）；
 *   4. 安全中间件栈在 `middleware/securityStack.ts`（applySecurityMiddleware），
 *      注册顺序是安全契约：限流 → express.json → 安全响应头 → API 鉴权。
 *
 * @module bootstrap
 */

import { WebSocket } from 'ws';
import {
  AutomationManager,
  IMManager,
  PROVIDER_PRESETS,
  type ConfigManager,
  type AutomationManager as AutomationManagerType,
  type IMManager as IMManagerType,
  logger,
} from '@easyagent/core';
import type { IMMessage } from '@easyagent/core';
import { getModelRegistry } from '@easyagent/core';
import { createAgent } from './langgraph/index.js';
import { fetchModelsFromProvider } from './routes/config.js';
import type { AgentQuestion } from './hitl.js';

/** 配置快照类型（configManager.load() 的返回值） */
type AppConfig = ReturnType<ConfigManager['getConfig']>;

/** Agent 工厂函数签名（与 index.ts 中 newAgent 一致） */
type AgentFactory = (
  providerConfig: Parameters<typeof createAgent>[0],
  opts?: Parameters<typeof createAgent>[3],
) => ReturnType<typeof createAgent>;

// ===================== 模型目录后台初始化 =====================

/**
 * 后台初始化模型目录（不阻塞服务启动）
 *
 * 拆分自 createApp() 开头的模型目录块：过期告警 + 厂商 API 直连补齐。
 *
 * @param modelRegistry - 模型注册表单例（与 index.ts / config 路由共用）
 */
export function initModelRegistryBackground(
  modelRegistry: ReturnType<typeof getModelRegistry>,
): void {
  modelRegistry
    .initialize()
    .then(async () => {
      // 下载成功 ≠ 数据新鲜：若目录文件本身长期未重新生成，客户端每天都在
      // 拉一份旧数据，厂商的新模型永远不会出现，而界面上看不出任何异常。
      // 因此这里主动告警，把"看不见的过期"变成看得见的事实。
      const freshness = modelRegistry.getFreshness();
      const source = modelRegistry.getSource() || '未知';

      if (freshness.stale) {
        logger.warn(
          {
            generatedAt: freshness.generatedAt,
            ageDays: freshness.ageDays,
            maxAgeDays: freshness.maxAgeDays,
            source,
          },
          '模型目录已过期：厂商新发布的模型不会出现在列表中。' +
            '请运行 `node scripts/refresh-models-catalog.mjs` 重新生成目录',
        );
      }

      // ── 厂商 API 直连补齐（不依赖 GitHub）──
      //
      // 内置的目录分发源（GitHub raw / jsDelivr）在部分网络环境下**都不可达**；
      // 但厂商自己的 API 通常可以直连，且是"厂商一发新模型、/models 立刻就有"的
      // 第一手数据。因此只要目录**不够新**（过期、或来自缓存/内置兜底），
      // 就用已配置 API Key 的厂商直连把模型列表补齐。
      //
      // 注意：此处只**新增**、不删除；新增条目元数据未校准，会标记 unverified。
      const needsEnrich = freshness.stale || /缓存|内置/.test(source);
      if (needsEnrich) {
        let totalAdded = 0;
        for (const preset of PROVIDER_PRESETS) {
          if (!preset.apiKey || !preset.baseURL) continue;
          try {
            const models = await fetchModelsFromProvider(preset);
            if (models.length === 0) continue;
            totalAdded += modelRegistry.mergeModels(
              preset.id,
              models.map((m) => m.id),
              `厂商 API 直连（${preset.id}）`,
            );
          } catch (err) {
            logger.debug(
              { provider: preset.id, error: (err as Error).message },
              '厂商 API 直连补齐失败（忽略，不影响启动）',
            );
          }
        }
        if (totalAdded > 0) {
          logger.info({ totalAdded }, '已通过厂商 API 直连补齐模型列表（目录源不可用或过期）');
        }
      }

      logger.info(
        {
          version: modelRegistry.getVersion(),
          ageDays: freshness.ageDays,
          source,
          stale: freshness.stale,
        },
        '模型目录已就绪',
      );
    })
    .catch((err) => {
      logger.warn({ error: (err as Error).message }, '模型目录初始化失败');
    });
}

// ===================== WebSocket 广播中枢 =====================

/** WebSocket 广播中枢：订阅集合与广播函数的集合体 */
export interface WsHub {
  /** ws → 订阅的 sessionId */
  wsSubscriptions: Map<WebSocket, string>;
  /** 订阅自动化进度推送的客户端集合 */
  automationSubscriptions: Set<WebSocket>;
  /** 订阅 LangGraph 节点状态推送的客户端集合（Phase D 实时高亮） */
  langgraphSubscriptions: Set<WebSocket>;
  /** 每个连接的 AbortController，用于中断正在运行的 Agent */
  wsAbortControllers: WeakMap<WebSocket, AbortController>;
  /** 安全发送 WebSocket 消息 */
  safeSend: (ws: WebSocket, data: Record<string, unknown>) => boolean;
  /** 广播自动化任务进度 */
  broadcastAutomationProgress: (event: {
    taskId: string;
    taskName: string;
    type: 'agent_start' | 'agent_turn' | 'tool_call' | 'tool_result' | 'agent_done' | 'agent_error';
    message: string;
    detail?: string;
  }) => void;
  /** 广播 LangGraph 节点状态（Phase D 实时高亮） */
  broadcastLangGraphNode: (nodeId: string, status?: string) => void;
  /** 广播 Agent 提问（HITL：自动化任务无人值守时推送到界面等待回答） */
  broadcastAgentQuestion: (question: AgentQuestion) => void;
}

/**
 * 创建 WebSocket 广播中枢（订阅集合 + safeSend + 两个广播函数）
 *
 * ⚠️ system 路由（open-panel）、automation 执行器、langgraph 路由、WebSocket 段
 * 必须共享**同一实例** —— index.ts 中只调用本函数一次并解构注入，勿重复创建。
 */
export function createWsHub(): WsHub {
  /** ws → 订阅的 sessionId（registerSystemRoutes 的 open-panel 也依赖此 Map） */
  const wsSubscriptions = new Map<WebSocket, string>();
  /** 订阅自动化进度推送的客户端集合 */
  const automationSubscriptions = new Set<WebSocket>();
  /** 订阅 LangGraph 节点状态推送的客户端集合（Phase D 实时高亮） */
  const langgraphSubscriptions = new Set<WebSocket>();
  /** 每个连接的 AbortController，用于中断正在运行的 Agent */
  const wsAbortControllers = new WeakMap<WebSocket, AbortController>();

  /**
   * 安全发送 WebSocket 消息，避免在连接关闭时抛错
   */
  function safeSend(ws: WebSocket, data: Record<string, unknown>): boolean {
    if (ws.readyState !== WebSocket.OPEN) {
      logger.warn({ readyState: ws.readyState, type: data.type }, 'WebSocket 未就绪，跳过发送');
      return false;
    }
    try {
      ws.send(JSON.stringify(data));
      return true;
    } catch (error) {
      logger.error({ error, type: data.type }, 'WebSocket 发送失败');
      return false;
    }
  }

  /**
   * 向所有订阅自动化的客户端广播任务进度事件
   */
  function broadcastAutomationProgress(event: {
    taskId: string;
    taskName: string;
    type: 'agent_start' | 'agent_turn' | 'tool_call' | 'tool_result' | 'agent_done' | 'agent_error';
    message: string;
    detail?: string;
  }): void {
    const payload = {
      type: 'automation_progress',
      ...event,
      timestamp: Date.now(),
    };
    for (const ws of automationSubscriptions) {
      safeSend(ws, payload);
    }
  }

  /**
   * 向所有订阅 LangGraph 节点的客户端广播节点状态变化（Phase D 实时高亮）
   *
   * @param nodeId - 当前活跃的 LangGraph 节点 ID（如 think/route/act 等）
   * @param status - 节点状态描述
   */
  function broadcastLangGraphNode(nodeId: string, status?: string): void {
    const payload = {
      type: 'langgraph_node',
      nodeId,
      status: status || 'executing',
      timestamp: Date.now(),
    };
    for (const ws of langgraphSubscriptions) {
      safeSend(ws, payload);
    }
  }

  /**
   * 向订阅自动化的客户端广播「Agent 提问」（HITL）
   *
   * ⚠️ 信封字段 `type` 必须放在展开**之后**：载荷里的同名字段会覆盖它
   * （自动化进度就踩过这个坑，见 docs/修复汇总 2026-09-19 F24）。
   */
  function broadcastAgentQuestion(question: AgentQuestion): void {
    const payload = { ...question, type: 'agent_question', timestamp: Date.now() };
    for (const ws of automationSubscriptions) {
      safeSend(ws, payload);
    }
  }

  return {
    wsSubscriptions,
    automationSubscriptions,
    langgraphSubscriptions,
    wsAbortControllers,
    safeSend,
    broadcastAutomationProgress,
    broadcastLangGraphNode,
    broadcastAgentQuestion,
  };
}

// ===================== 自动化任务系统 =====================

/** 自动化系统创建依赖 */
export interface AutomationSystemDeps {
  /** 配置快照（任务未指定 provider/model 时的兜底来源） */
  config: AppConfig;
  /** 配置管理器（解析任务指定的 provider） */
  configManager: ConfigManager;
  /** Agent 工厂（执行任务时创建 Agent 实例） */
  newAgent: AgentFactory;
  /** 自动化进度广播函数（来自 createWsHub，须为同一实例） */
  broadcastAutomationProgress: WsHub['broadcastAutomationProgress'];
}

/**
 * 创建并初始化自动化任务管理器（含执行器与生命周期事件广播）
 *
 * 拆分自 createApp() 的自动化块；执行器通过 AgentEngine 执行任务，
 * 并把轮次/工具调用进度广播到前端。
 *
 * @param deps - 显式注入的依赖
 */
export function createAutomationSystem(deps: AutomationSystemDeps): AutomationManagerType {
  const { config, configManager, newAgent, broadcastAutomationProgress } = deps;

  const automationManager = new AutomationManager({
    checkIntervalMs: 30000,
  });
  automationManager.initialize();

  // 设置自动化执行器：通过 AgentEngine 执行任务
  automationManager.setExecutor(async (task) => {
    // 优先使用任务指定的 provider/model，否则使用当前默认配置
    const taskProviderId = task.provider || config.currentModel.provider;
    const taskModel = task.model || config.currentModel.model;

    const providerConfig = configManager.getProvider(taskProviderId);
    if (!providerConfig) {
      const allConfigured = configManager.getAvailableProviders();
      const configuredNames =
        allConfigured.map((p: { name: string }) => p.name || p.id).join('、') || '无';
      throw new Error(
        `未找到模型提供商 ${taskProviderId}。` +
          (task.provider
            ? `任务指定了 "${taskProviderId}"，但该提供商未配置 API 密钥，请在「设置 → 模型提供商」中配置。`
            : `当前已配置的提供商: ${configuredNames}。请在「设置 → 模型提供商」中配置 API 密钥。`),
      );
    }

    broadcastAutomationProgress({
      taskId: task.id,
      taskName: task.name,
      type: 'agent_start',
      message: `开始执行: ${task.prompt.substring(0, 80)}`,
      detail: `提供商: ${taskProviderId}, 模型: ${taskModel}`,
    });

    const agent = await newAgent(providerConfig, {
      model: taskModel,
      provider: taskProviderId,
    });

    /** 注册 Agent 事件监听，将工具调用进度广播到前端 */
    let currentTurn = 0;
    const agentListener = (event: { type: string; data: unknown }) => {
      if (event.type === 'turn_start') {
        currentTurn++;
        broadcastAutomationProgress({
          taskId: task.id,
          taskName: task.name,
          type: 'agent_turn',
          message: `第 ${currentTurn} 轮推理中...`,
        });
      } else if (event.type === 'tool_call') {
        const data = event.data as {
          toolCalls?: Array<{ function: { name: string; arguments: string } }>;
        };
        if (data?.toolCalls) {
          for (const tc of data.toolCalls) {
            broadcastAutomationProgress({
              taskId: task.id,
              taskName: task.name,
              type: 'tool_call',
              message: `调用工具: ${tc.function.name}`,
              detail: `参数: ${tc.function.arguments}`,
            });
          }
        }
      } else if (event.type === 'tool_result') {
        const data = event.data as {
          toolName: string;
          result: { success?: boolean; content?: string; error?: string };
        };
        broadcastAutomationProgress({
          taskId: task.id,
          taskName: task.name,
          type: 'tool_result',
          message: `工具结果: ${data.toolName} ${data.result?.error ? '❌' : '✅'}`,
          detail: data.result?.error || data.result?.content?.substring(0, 300) || '',
        });
      }
    };
    agent.onEvent(agentListener);

    let fullResponse = '';
    try {
      await agent.run(task.prompt, {
        sessionId: `auto_${task.id}_${Date.now()}`,
        onPartialResponse: (text: string) => {
          fullResponse += text;
        },
      });

      broadcastAutomationProgress({
        taskId: task.id,
        taskName: task.name,
        type: 'agent_done',
        message: '执行完成',
      });

      const usage = await agent.getTokenUsage();
      return {
        result: fullResponse,
        tokenUsage: {
          input: usage?.inputTokens || 0,
          output: usage?.outputTokens || 0,
          total: usage?.totalTokens || 0,
        },
      };
    } catch (error) {
      broadcastAutomationProgress({
        taskId: task.id,
        taskName: task.name,
        type: 'agent_error',
        message: '执行出错',
        detail: (error as Error).message,
      });
      throw error;
    } finally {
      agent.offEvent(agentListener);
    }
  });

  // 监听自动化任务生命周期事件，广播到前端
  automationManager.on('task:start', (task: any) => {
    broadcastAutomationProgress({
      taskId: task.id,
      taskName: task.name,
      type: 'agent_start',
      message: `任务开始: ${task.name}`,
    });
  });
  automationManager.on('task:complete', (task: any) => {
    broadcastAutomationProgress({
      taskId: task.id,
      taskName: task.name,
      type: 'agent_done',
      message: `任务完成: ${task.name}`,
    });
  });
  automationManager.on('task:error', (task: any) => {
    broadcastAutomationProgress({
      taskId: task.id,
      taskName: task.name,
      type: 'agent_error',
      message: `任务失败: ${task.name}`,
    });
  });

  return automationManager;
}

// ===================== IM 适配器管理器 =====================

/** IM 管理器创建依赖 */
export interface IMManagerDeps {
  /** 配置快照（IM 消息处理时的默认模型来源） */
  config: AppConfig;
  /** 配置管理器（解析当前 provider） */
  configManager: ConfigManager;
  /** Agent 工厂 */
  newAgent: AgentFactory;
}

/**
 * 创建 IM 适配器管理器（含消息处理逻辑：IM 消息 → Agent 引擎 → 流式回复）
 *
 * 拆分自 createApp() 的 IM 块；消息处理为闭包，依赖注入。
 *
 * @param deps - 显式注入的依赖
 */
export function createIMManagerFor(deps: IMManagerDeps): IMManagerType {
  const { config, configManager, newAgent } = deps;

  return new IMManager({
    messageHandler: async (message: IMMessage) => {
      // IM 消息 → Agent 引擎处理逻辑
      const providerConfig = configManager.getCurrentProvider();
      if (!providerConfig) {
        throw new Error('未配置模型提供商');
      }
      const agent = await newAgent(providerConfig, {
        model: config.currentModel.model,
        provider: config.currentModel.provider,
      });

      // 创建/获取 IM 会话
      const sessionId = `im_${message.chatId}`;

      // 流式生成器
      async function* streamGen(): AsyncGenerator<string> {
        let done = false;
        agent.onEvent((event) => {
          if (event.type === 'error') {
            done = true;
          }
        });

        await agent.run(message.text, {
          sessionId,
          onPartialResponse: async (text: string) => {
            // yield 每次增量文本
          },
        });
      }

      // 使用简易方式：直接运行并返回流
      let fullResponse = '';
      const chunks: string[] = [];

      agent.onEvent((event) => {
        if (event.type === 'error') {
          chunks.push(`\n\n⚠️ ${event.message}`);
        }
      });

      await agent.run(message.text, {
        sessionId,
        onPartialResponse: (text: string) => {
          fullResponse += text;
          chunks.push(text);
        },
      });

      // 构造支持流式输出的生成器
      async function* actualStream(): AsyncGenerator<string> {
        let index = 0;
        // 按字符逐批 yield，模拟流式效果
        const allText = fullResponse;
        const batchSize = 50;
        while (index < allText.length) {
          yield allText.substring(index, index + batchSize);
          index += batchSize;
          // 小延迟模拟流式
          await new Promise((r) => setTimeout(r, 30));
        }
      }

      return { streamGenerator: actualStream() };
    },
  });
}
