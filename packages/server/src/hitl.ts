/**
 * 人在环路（Human-in-the-Loop）问答代理
 *
 * ── 解决什么问题 ──
 * Agent 调用 `ask_user` 时，交互式会话里用户能直接回答；但**自动化任务是无人值守的**，
 * 旧实现只会把问题当普通文本返回，Agent 只能自己猜一个答案继续跑。
 * 这里把提问**推送到 UI** 并等待用户回答，实现「Agent 停下来问 → 用户在界面答 → Agent 继续」。
 *
 * ── 为什么放在 server 而不是改 Agent 内核 ──
 * `ToolRegistry.register()` 是**按名覆盖**，所以只要在服务端注册一个可交互版 `ask_user`，
 * 两个引擎（core AgentEngine / LangGraph）都会用它 —— 不必改 Agent 内核与工具上下文协议。
 *
 * ── 超时策略 ──
 * 无人值守场景下用户可能一直不在。默认等 5 分钟，超时返回一段**让 Agent 自行决策**的说明
 * （而不是抛错或永久挂起）。停止任务时调用 `cancelAll()` 释放等待中的 Promise。
 *
 * @module hitl
 */

import { randomUUID } from 'node:crypto';
import { logger } from '@easyagent/core';
import type { ITool, ToolResult, ToolContext } from '@easyagent/core';

/** 提问请求（Agent 侧） */
export interface AgentQuestionRequest {
  question: string;
  options?: string[];
  title?: string;
  multiSelect?: boolean;
}

/** 推送给前端的提问 */
export interface AgentQuestion extends AgentQuestionRequest {
  id: string;
  createdAt: number;
  /** 过期时间戳（前端可显示倒计时） */
  expiresAt: number;
}

/** 默认等待时长：给用户足够时间看到并回答 */
export const DEFAULT_QUESTION_TIMEOUT_MS = 5 * 60 * 1000;

interface PendingQuestion {
  question: AgentQuestion;
  resolve: (answer: string) => void;
  timer: NodeJS.Timeout;
}

/**
 * 提问代理：广播问题 → 等待回答（或超时）→ 把回答交回给工具
 */
export class QuestionBroker {
  private readonly pending = new Map<string, PendingQuestion>();
  private readonly timeoutMs: number;

  constructor(
    private readonly deps: {
      /** 广播提问到前端（来自 createWsHub，须为同一实例） */
      broadcast: (question: AgentQuestion) => void;
      /** 等待时长（毫秒），默认 5 分钟 */
      timeoutMs?: number;
    },
  ) {
    this.timeoutMs = deps.timeoutMs ?? DEFAULT_QUESTION_TIMEOUT_MS;
  }

  /**
   * 提问并等待用户回答
   *
   * @returns 用户的回答；超时则返回「请自行决策」的说明（不抛错，保证 Agent 能继续）
   */
  ask(req: AgentQuestionRequest): Promise<string> {
    const now = Date.now();
    const question: AgentQuestion = {
      id: `q_${now}_${randomUUID().slice(0, 6)}`,
      createdAt: now,
      expiresAt: now + this.timeoutMs,
      ...req,
    };

    return new Promise<string>((resolve) => {
      const timer = setTimeout(() => {
        this.pending.delete(question.id);
        logger.warn(
          { id: question.id, question: req.question.slice(0, 60) },
          'Agent 提问超时（用户未回答）',
        );
        resolve(
          `（用户在 ${Math.round(this.timeoutMs / 1000)} 秒内未回答，属于无人值守场景：` +
            `请基于已有信息和你的判断自行选择最合理的做法继续执行，并在最终结果中说明这一点。）`,
        );
      }, this.timeoutMs);

      this.pending.set(question.id, { question, resolve, timer });

      try {
        this.deps.broadcast(question);
      } catch (err) {
        logger.warn({ error: (err as Error).message }, '广播 Agent 提问失败（前端可能离线）');
      }
      logger.info(
        { id: question.id, question: req.question.slice(0, 80) },
        'Agent 正在等待用户回答',
      );
    });
  }

  /**
   * 提交用户回答
   *
   * @returns 是否命中待答问题（false = 已超时/已回答/不存在）
   */
  answer(id: string, text: string): boolean {
    const p = this.pending.get(id);
    if (!p) return false;

    clearTimeout(p.timer);
    this.pending.delete(id);
    p.resolve(text);
    logger.info({ id }, '已收到用户回答，Agent 继续执行');
    return true;
  }

  /** 当前待回答的问题（页面刷新后可恢复显示） */
  list(): AgentQuestion[] {
    return [...this.pending.values()].map((p) => p.question);
  }

  /**
   * 取消所有等待（任务停止 / 服务关闭时调用）
   *
   * ⚠️ 必须调用：否则等待中的 Promise 永远不会落地（工具调用挂死）。
   *
   * @returns 被取消的问题数量
   */
  cancelAll(reason = '任务已停止'): number {
    const count = this.pending.size;
    for (const [, p] of this.pending) {
      clearTimeout(p.timer);
      p.resolve(`（${reason}，无需继续回答。）`);
    }
    this.pending.clear();
    return count;
  }
}

/**
 * 创建「可交互版」ask_user 工具（覆盖内置实现）
 *
 * 与内置版的区别：把问题与选项推送到前端等待真人回答，而不是直接返回一段文本。
 */
export function createInteractiveAskUserTool(broker: QuestionBroker): ITool {
  return {
    name: 'ask_user',
    description:
      '当需要用户做出决策、选择或确认时，向用户提出结构化的多选或确认问题。' +
      '（自动化任务中会推送到界面等待用户回答，超时则请自行判断继续）',
    parameters: {
      type: 'object',
      properties: {
        question: { type: 'string', description: '向用户提出的问题' },
        options: {
          type: 'array',
          items: { type: 'string', description: '选项' },
          description: '可选项列表，如 ["方案A", "方案B"]。不提供则为确认型问题。',
        },
        title: { type: 'string', description: '可选: 问题标题' },
        multiSelect: { type: 'boolean', description: '是否允许多选, 默认false' },
      },
      required: ['question'],
    },
    requiresConfirm: false,
    group: 'interaction',
    async execute(params: Record<string, unknown>, _context: ToolContext): Promise<ToolResult> {
      const question = String(params.question ?? '');
      if (!question) {
        return { success: false, content: '缺少 question 参数', error: 'missing question' };
      }

      const options = params.options as string[] | undefined;
      const answer = await broker.ask({
        question,
        options,
        title: params.title as string | undefined,
        multiSelect: (params.multiSelect as boolean) || false,
      });

      return {
        success: true,
        content: `用户回答：${answer}`,
        metadata: { question, options, answer },
      };
    },
  };
}
