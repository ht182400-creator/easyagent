/**
 * ContextManager —— 上下文工程编排器
 *
 * ── 定位 ──
 * 2026 年 Agent 的能力上限由模型决定，而**实际表现由上下文工程决定**。
 * 改造前 EasyAgent 在这一点上是空白的：无 token 预算、无历史压缩、
 * 无工具结果截断、70 个工具 schema 无条件全量下发（实测固定开销 ≈ 14,832 token，
 * 占 32k 小模型窗口的 45.3%）。
 *
 * ── 本类负责的四件事 ──
 *   ① 工具按模型规模分级暴露（toolSelection）
 *   ② 系统提示词去重：用紧凑「工具索引」替代与 tools 参数重复的完整描述
 *   ③ 工具结果超长截断 + 工作区内落盘（toolResultTruncator）
 *   ④ 历史超预算时压缩为结构化摘要（historyCompactor）
 *
 * ── 可回滚 ──
 * `EASYAGENT_CONTEXT_V2=0` 时 `build()` 原样返回入参（仅保留 benchmark 工具排除），
 * 行为与改造前完全一致。
 *
 * @module agent/context/ContextManager
 */

import type { Message, ToolDefinition } from '../../types/index.js';
import { logger } from '../../utils/logger.js';
import { compactHistory } from './historyCompactor.js';
import { resolveContextOptions } from './options.js';
import { estimateMessagesTokens, estimateTokens, estimateToolDefinitionsTokens } from './tokenEstimator.js';
import { buildToolIndexText, resolveModelScale, selectToolDefinitions } from './toolSelection.js';
import { truncateToolResult } from './toolResultTruncator.js';
import type {
  ContextAdjustment,
  ContextBuildInput,
  ContextBuildResult,
  ContextManagerOptions,
  ContextStats,
  ModelScale,
  TruncatedToolResult,
} from './types.js';

// ===================== 常量 =====================

/**
 * 模型上下文窗口未知时的假定值
 *
 * 取保守值而非乐观值：宁可多裁一点，也不要因低估而触发 provider 的
 * "context length exceeded" 硬报错（那会让整轮对话直接失败）。
 */
const DEFAULT_ASSUMED_WINDOW_TOKENS = 32_768;

/** 工具结果截断时用于回填消息的工具名占位（工具名未知时） */
const UNKNOWN_TOOL_NAME = 'unknown-tool';

// ===================== 实现 =====================

/**
 * 上下文管理器
 *
 * 设计为无状态（除配置外），可安全地在多会话间复用同一实例。
 */
export class ContextManager {
  private readonly options: ContextManagerOptions;

  /**
   * @param overrides - 配置覆盖（优先级高于环境变量；主要供测试使用）
   */
  constructor(overrides: Partial<ContextManagerOptions> = {}) {
    this.options = resolveContextOptions(overrides);
  }

  /** 当前生效的配置（只读，供诊断与测试断言） */
  getOptions(): Readonly<ContextManagerOptions> {
    return this.options;
  }

  /**
   * 截断单条工具结果
   *
   * 由 `AgentEngine` 在每次工具执行**之后**调用，再决定回填给模型的内容。
   *
   * @param content - 工具返回的原始内容
   * @param meta - 会话/工作区/工具名
   */
  truncateToolResult(
    content: string,
    meta: { workspace: string; sessionId: string; toolName?: string },
  ): TruncatedToolResult {
    if (!this.options.enabled) {
      return { content, truncated: false, originalChars: content?.length ?? 0 };
    }
    return truncateToolResult(
      content,
      {
        workspace: meta.workspace,
        sessionId: meta.sessionId,
        toolName: meta.toolName || UNKNOWN_TOOL_NAME,
      },
      this.options,
    );
  }

  /**
   * 构建本轮的完整上下文
   *
   * @param input - 见 {@link ContextBuildInput}
   * @returns 可直接用于 LLM 请求的系统提示词/消息/工具定义 + 统计
   */
  build(input: ContextBuildInput): ContextBuildResult {
    const adjustments: ContextAdjustment[] = [];

    // ── 未启用：原样返回（仅做 benchmark 工具排除，该排除有独立证据支持）──
    if (!this.options.enabled) {
      const { selected, excludedNames } = selectToolDefinitions(input.toolDefinitions, 'large', false);
      return {
        systemPrompt: input.systemPrompt,
        messages: [{ role: 'system', content: input.systemPrompt }, ...input.messages],
        toolDefinitions: selected,
        stats: this.buildStats({
          scale: 'large',
          windowTokens: input.maxContextTokens ?? DEFAULT_ASSUMED_WINDOW_TOKENS,
          systemTokens: estimateTokens(input.systemPrompt),
          toolTokens: estimateToolDefinitionsTokens(selected),
          messageTokens: estimateMessagesTokens(input.messages),
          before: input.toolDefinitions.length,
          after: selected.length,
          adjustments:
            excludedNames.length > 0
              ? [{ kind: 'tool-tiering', detail: `排除 ${excludedNames.join(', ')}`, tokensDelta: 0 }]
              : [],
        }),
      };
    }

    // ── ① 确定模型规模档位 ──
    const windowTokens = input.maxContextTokens || DEFAULT_ASSUMED_WINDOW_TOKENS;
    const scale: ModelScale = resolveModelScale(input.maxContextTokens);
    if (!input.maxContextTokens) {
      logger.debug(
        { model: input.model },
        '未获取到模型上下文窗口，按保守值假定（如不符请在 provider 配置中补齐 maxContextTokens）',
      );
    }

    // ── ② 工具分级 ──
    const beforeCount = input.toolDefinitions.length;
    const { selected: tools, excludedNames } = selectToolDefinitions(
      input.toolDefinitions,
      scale,
      this.options.enableToolTiering,
    );
    const toolTokensBefore = estimateToolDefinitionsTokens(input.toolDefinitions);
    const toolTokens = estimateToolDefinitionsTokens(tools);
    if (excludedNames.length > 0) {
      adjustments.push({
        kind: 'tool-tiering',
        detail: `${scale} 档排除 ${excludedNames.length} 个工具（保留 ${tools.length}/${beforeCount}）`,
        tokensDelta: toolTokens - toolTokensBefore,
      });
    }

    // ── ③ 系统提示词：用紧凑索引替代重复的完整工具描述 ──
    //
    // 单次覆盖优先：调用方在"模型不支持 function calling"时必须传 false，
    // 否则 tools 字段不会被下发，模型将完全拿不到工具信息。
    const dedupe = input.dedupeToolDescriptions ?? this.options.dedupeToolDescriptions;
    let systemPrompt = input.systemPrompt;
    const systemBefore = estimateTokens(systemPrompt);
    if (dedupe) {
      const indexText = buildToolIndexText(tools);
      systemPrompt =
        `${systemPrompt}\n\n## 工具索引\n` +
        '> 完整的参数定义已通过 function calling 的 tools 字段下发，此处仅列出名称与用途。\n\n' +
        indexText;
      const indexCost = estimateTokens(systemPrompt) - systemBefore;
      adjustments.push({
        kind: 'description-dedupe',
        // 说明：tokensDelta 是「索引本身的开销」，不是净收益。
        // 净收益来自"不再内联完整工具描述"（实测该内联块约 6,000 token，
        // 见 `node scripts/measure-context.mjs` 的输出），此处不重复计入。
        detail: `系统提示词不再内联完整工具描述，改为紧凑索引（索引自身开销 ${indexCost} token）`,
        tokensDelta: indexCost,
      });
    }
    const systemTokens = estimateTokens(systemPrompt);

    // ── ④ 计算消息可用预算并压缩历史 ──
    const budgetTokens = Math.floor(windowTokens * this.options.usableRatio);
    const messageBudget = Math.max(0, budgetTokens - systemTokens - toolTokens);

    const compacted = compactHistory({
      messages: input.messages,
      budgetTokens: messageBudget,
      keepRecentMessages: this.options.keepRecentMessages,
    });
    if (compacted.droppedCount > 0) {
      adjustments.push({
        kind: 'history-compaction',
        detail: `压缩 ${compacted.droppedCount} 条历史消息为摘要`,
        tokensDelta: -compacted.droppedTokens + estimateTokens(compacted.summaryText),
      });
      // 摘要追加到系统提示词末尾（不插入消息数组，避免部分 provider 拒绝中途 system 消息）
      systemPrompt = `${systemPrompt}\n\n${compacted.summaryText}`;
    }
    if (compacted.stillOverBudget) {
      logger.warn(
        {
          model: input.model,
          scale,
          keptMessages: compacted.messages.length,
          budget: messageBudget,
        },
        '历史已压缩至"最少保留"下限仍超出预算，下一轮可能触发 provider 上下文超限',
      );
    }

    const finalSystemTokens = compacted.droppedCount > 0 ? estimateTokens(systemPrompt) : systemTokens;
    const messages: Message[] = [{ role: 'system', content: systemPrompt }, ...compacted.messages];

    const result: ContextBuildResult = {
      systemPrompt,
      messages,
      toolDefinitions: tools,
      stats: this.buildStats({
        scale,
        windowTokens,
        systemTokens: finalSystemTokens,
        toolTokens,
        messageTokens: estimateMessagesTokens(compacted.messages),
        before: beforeCount,
        after: tools.length,
        adjustments,
      }),
    };

    logger.debug(
      {
        model: input.model,
        scale,
        window: windowTokens,
        usageRatio: result.stats.usageRatio,
        tools: `${result.stats.toolCount.before}→${result.stats.toolCount.after}`,
        tokens: {
          system: result.stats.systemTokens,
          tools: result.stats.toolTokens,
          messages: result.stats.messageTokens,
          total: result.stats.totalTokens,
        },
        adjustments: adjustments.map((a) => a.detail),
      },
      '上下文已构建',
    );

    return result;
  }

  /** 汇总统计信息 */
  private buildStats(input: {
    scale: ModelScale;
    windowTokens: number;
    systemTokens: number;
    toolTokens: number;
    messageTokens: number;
    before: number;
    after: number;
    adjustments: ContextAdjustment[];
  }): ContextStats {
    const totalTokens = input.systemTokens + input.toolTokens + input.messageTokens;
    return {
      scale: input.scale,
      windowTokens: input.windowTokens,
      budgetTokens: Math.floor(input.windowTokens * this.options.usableRatio),
      systemTokens: input.systemTokens,
      toolTokens: input.toolTokens,
      messageTokens: input.messageTokens,
      totalTokens,
      usageRatio: input.windowTokens > 0 ? totalTokens / input.windowTokens : 0,
      toolCount: { before: input.before, after: input.after },
      adjustments: input.adjustments,
    };
  }
}

/** 进程级共享实例（配置来自环境变量，启动后不变） */
let sharedManager: ContextManager | null = null;

/**
 * 获取共享的 ContextManager
 *
 * 之所以共享：`build()` 内不保存会话状态，多会话复用同一实例是安全的，
 * 且能省去每个 AgentEngine 各自解析环境变量的开销。
 */
export function getContextManager(overrides?: Partial<ContextManagerOptions>): ContextManager {
  if (overrides) return new ContextManager(overrides);
  if (!sharedManager) sharedManager = new ContextManager();
  return sharedManager;
}

/** 重置共享实例（仅测试使用：便于切换环境变量后重新解析配置） */
export function resetContextManager(): void {
  sharedManager = null;
}
