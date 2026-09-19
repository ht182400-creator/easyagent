/**
 * 历史压缩器
 *
 * ── 问题 ──
 * `AgentEngine.run()` 中 `messages.push(...)` **没有任何上限**，历史只增不减，
 * 长会话必然撞上下文窗口。此前仅靠 `maxTurns` 限制循环轮数，与 token 预算无关。
 *
 * ── 策略（确定性压缩，不额外调用 LLM）──
 *   1. 超出预算时，从**最旧**的消息开始丢弃；丢弃量取"能放进预算的**最小**裁剪点"
 *      （即尽量少丢），通过二分查找定位（见下方实现说明）；
 *   2. 被丢弃的消息压成一段**结构化摘要**追加到系统提示词
 *      （不是丢掉就完事 —— 至少保留"聊过什么"的线索）；
 *   3. **绝不允许拆散 `assistant(tool_calls)` 与其后续 `tool` 结果**：
 *      部分 provider 会因 "tool_call_id 找不到对应请求" 直接报错 400，
 *      因此裁剪点必须做配对回退（见 `adjustCutForToolPairs`）；
 *   4. `keepRecentMessages` 是"至少保留多少条"的**下限** —— 当前任务上下文比历史更重要，
 *      即便因此超出预算也不裁（宁可轻微溢出，也不要让模型"忘记刚做的事"）。
 *
 * ── 为什么不用 LLM 做摘要 ──
 *   摘要本身要花一次 API 调用（延迟 + 成本 + 失败面）。
 *   确定性压缩零成本、可测试、可复现；LLM 摘要留作后续可选增强。
 *
 * @module agent/context/historyCompactor
 */

import type { Message } from '../../types/index.js';
import { estimateMessagesTokens } from './tokenEstimator.js';

// ===================== 常量 =====================

/** 摘要中单条消息保留的最大字符数 */
const SUMMARY_LINE_MAX_CHARS = 96;

/** 摘要最多列出的消息条数（超出则折叠为一行统计） */
const SUMMARY_MAX_LINES = 24;

// ===================== 工具 =====================

/** 把消息内容统一转成字符串（ContentBlock[] 等结构走 JSON） */
function contentToString(content: Message['content']): string {
  if (typeof content === 'string') return content;
  if (content == null) return '';
  try {
    return JSON.stringify(content);
  } catch {
    return '[内容无法序列化]';
  }
}

/** 压缩为单行摘要（去掉换行、截断） */
function toSingleLine(text: string, maxChars = SUMMARY_LINE_MAX_CHARS): string {
  const flat = text.replace(/\s+/g, ' ').trim();
  return flat.length > maxChars ? `${flat.slice(0, maxChars)}…` : flat;
}

/**
 * 判断该消息是否为「带工具调用的 assistant」
 *
 * 这类消息后必须紧跟其 tool 结果，否则裁剪会破坏协议配对。
 */
function isAssistantWithToolCalls(msg: Message | undefined): boolean {
  return (
    !!msg && msg.role === 'assistant' && Array.isArray(msg.tool_calls) && msg.tool_calls.length > 0
  );
}

/**
 * 把裁剪点向前回退到「不会拆散工具调用配对」的位置
 *
 * 规则：
 *   · 若裁剪点落在 `tool` 消息上 → 必须一起保留其前面的 assistant；
 *   · 若裁剪点前一条是「带工具调用的 assistant」→ 也必须一起保留（否则其 tool 结果会被孤立）。
 *
 * @param messages - 全量消息
 * @param cut - 候选裁剪点（此下标起的消息保留）
 * @returns 修正后的裁剪点
 */
function adjustCutForToolPairs(messages: readonly Message[], cut: number): number {
  let c = cut;
  // 循环直到稳定：单次回退可能又落到新的 tool 消息上
  for (let guard = 0; guard < messages.length; guard++) {
    const atCut = messages[c];
    const beforeCut = messages[c - 1];

    if (atCut && atCut.role === 'tool') {
      c -= 1; // 与其请求者一起保留
      continue;
    }
    if (c > 0 && isAssistantWithToolCalls(beforeCut)) {
      c -= 1; // 请求者也要丢掉，避免产生孤立的 tool_calls
      continue;
    }
    break;
  }
  return Math.max(0, c);
}

/** 把被丢弃的消息压成结构化摘要文本 */
function buildSummaryText(dropped: readonly Message[]): string {
  if (dropped.length === 0) return '';

  const lines: string[] = [];
  for (const msg of dropped.slice(0, SUMMARY_MAX_LINES)) {
    const text = contentToString(msg.content);
    if (msg.role === 'tool') {
      lines.push(`- [tool] 返回 ${text.length} 字符（已省略）`);
      continue;
    }
    const toolNote = isAssistantWithToolCalls(msg) ? '（调用了工具）' : '';
    lines.push(`- [${msg.role}]${toolNote} ${toSingleLine(text) || '(空)'}`);
  }

  const omitted = dropped.length - Math.min(dropped.length, SUMMARY_MAX_LINES);
  const tail = omitted > 0 ? `\n- …（另有 ${omitted} 条更早的消息已省略）` : '';

  return (
    `## 早前对话摘要（为节省上下文已自动压缩 ${dropped.length} 条历史消息）\n` +
    '> 以下为被压缩内容的要点。如需查看某处的完整细节，请重新读取相关文件或让用户补充说明。\n\n' +
    lines.join('\n') +
    tail
  );
}

// ===================== 主流程 =====================

/** 压缩输入 */
export interface CompactHistoryInput {
  /** 待压缩消息（通常不含 system） */
  messages: Message[];
  /** 消息可用的 token 预算（已扣除系统提示词与工具定义） */
  budgetTokens: number;
  /** 至少保留的最近消息条数 */
  keepRecentMessages: number;
}

/** 压缩结果 */
export interface CompactHistoryResult {
  /** 压缩后的消息（保持原有顺序） */
  messages: Message[];
  /** 摘要文本（追加到系统提示词；无需压缩时为空串） */
  summaryText: string;
  /** 被丢弃的消息条数 */
  droppedCount: number;
  /** 被丢弃内容的估算 token 数 */
  droppedTokens: number;
  /** 是否仍超出预算（按要求保留最近消息导致） */
  stillOverBudget: boolean;
}

/**
 * 压缩历史消息
 *
 * @param input - 见 {@link CompactHistoryInput}
 * @returns 见 {@link CompactHistoryResult}
 */
export function compactHistory(input: CompactHistoryInput): CompactHistoryResult {
  const { messages, budgetTokens, keepRecentMessages } = input;

  const tokensOf = (arr: readonly Message[]) => estimateMessagesTokens(arr);

  if (messages.length === 0 || tokensOf(messages) <= budgetTokens) {
    return {
      messages,
      summaryText: '',
      droppedCount: 0,
      droppedTokens: 0,
      stillOverBudget: false,
    };
  }

  // ── 裁剪点搜索 ──
  //
  // 目标：在「不超过预算」的前提下**尽量少丢**消息。
  //
  // 约定：`keepRecentMessages` 是"至少保留多少条"的**下限**（当前任务上下文优先于历史），
  // 因此裁剪点存在上界 `maxCut = 消息总数 - 最少保留数`。
  //
  // 单调性：裁剪点越大 → 保留的消息越少 → token 越小（弱单调递减），
  // 故可用**二分查找**定位"仍能放下"的最小裁剪点，复杂度 O(log n) 次估算。
  // 若连 maxCut 都放不下，说明已无更激进的空间，只能接受溢出（并置 stillOverBudget）。
  const minKeep = Math.max(0, Math.min(keepRecentMessages, messages.length));
  const maxCut = adjustCutForToolPairs(messages, messages.length - minKeep);

  let cut = maxCut; // 默认取上界；若它都放不下则保持此值（接受溢出）
  let lo = 0;
  let hi = maxCut;
  while (lo <= hi) {
    const mid = Math.floor((lo + hi) / 2);
    const safeMid = adjustCutForToolPairs(messages, mid);
    if (tokensOf(messages.slice(safeMid)) <= budgetTokens) {
      cut = safeMid; // 该裁剪点可行，尝试继续少丢
      hi = safeMid - 1;
    } else {
      lo = mid + 1; // 丢得不够，需要更大的裁剪点
    }
  }

  const dropped = messages.slice(0, cut);
  const kept = messages.slice(cut);
  const summaryText = buildSummaryText(dropped);

  return {
    messages: kept,
    summaryText,
    droppedCount: dropped.length,
    droppedTokens: dropped.length > 0 ? tokensOf(dropped) : 0,
    stillOverBudget: tokensOf(kept) > budgetTokens,
  };
}
