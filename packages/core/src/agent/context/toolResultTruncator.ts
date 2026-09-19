/**
 * 工具结果截断器
 *
 * ── 问题 ──
 * 工具结果被原样 push 进 `messages`：一次 `read_file` 可能带回整个文件、
 * 一次 `exec` 可能带回上千行日志。几轮之后上下文就被这些"原始素材"占满，
 * 而真正重要的近期对话反而被挤掉。
 *
 * ── 策略 ──
 *   1. 超过阈值时按「头部 + 尾部」截断（**尾部常含错误信息与结论，价值最高**）；
 *   2. 完整内容落盘到**工作区内**（`<workspace>/.easyagent/context/<sessionId>/`），
 *      并在消息里给出**工作区相对路径** → 模型需要时可用 `read_file` 分段取回；
 *   3. 落盘失败只降级为纯截断，绝不影响工具执行本身。
 *
 * ⚠️ 落盘位置必须是工作区**内**：`FileTools.safePath()` 拒绝工作区外路径，
 * 写到 `~/.easyagent/` 会让模型无法取回（详见 options.ts 的说明）。
 *
 * @module agent/context/toolResultTruncator
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { logger } from '../../utils/logger.js';
import { CONTEXT_DIR_RELATIVE } from './options.js';
import type { ContextManagerOptions, TruncatedToolResult } from './types.js';

// ===================== 常量 =====================

/** 文件名中允许的字符（其余替换为 `-`，防止路径注入） */
const UNSAFE_FILENAME_CHARS = /[^a-zA-Z0-9_-]+/g;

/** 文件名最大长度（防止超长工具名导致文件系统报错） */
const MAX_FILENAME_BASE_LENGTH = 48;

// ===================== 落盘 =====================

/**
 * 把完整工具结果落盘到工作区内
 *
 * @param content - 完整内容
 * @param meta - 落盘上下文
 * @returns 绝对路径与工作区相对路径；失败时返回 null
 */
function persistFullResult(
  content: string,
  meta: { workspace: string; sessionId: string; toolName: string; contextDir?: string },
): { absPath: string; relPath: string } | null {
  try {
    const baseDir = meta.contextDir ?? join(meta.workspace, CONTEXT_DIR_RELATIVE);
    const sessionDir = join(baseDir, sanitizeSegment(meta.sessionId));
    mkdirSync(sessionDir, { recursive: true });

    const fileName = `${sanitizeSegment(meta.toolName)}-${Date.now()}.txt`;
    const absPath = join(sessionDir, fileName);
    writeFileSync(absPath, content, 'utf-8');

    // read_file 需要的是**工作区相对路径**（它会用 safePath 校验）
    const relPath = relative(meta.workspace, absPath).split('\\').join('/');
    return { absPath, relPath };
  } catch (err) {
    logger.warn(
      { error: (err as Error).message, tool: meta.toolName },
      '工具结果落盘失败，已降级为纯截断',
    );
    return null;
  }
}

/** 清理路径片段中的非法字符 */
function sanitizeSegment(raw: string): string {
  const cleaned = (raw || 'unknown')
    .replace(UNSAFE_FILENAME_CHARS, '-')
    .slice(0, MAX_FILENAME_BASE_LENGTH);
  return cleaned || 'unknown';
}

// ===================== 截断 =====================

/**
 * 按配置截断单条工具结果
 *
 * @param content - 工具返回的原始文本
 * @param meta - 会话/工作区/工具名（用于落盘与提示文案）
 * @param opts - ContextManager 配置
 * @returns 截断结果（含是否截断、原始长度、落盘路径）
 */
export function truncateToolResult(
  content: string,
  meta: { workspace: string; sessionId: string; toolName: string },
  opts: ContextManagerOptions,
): TruncatedToolResult {
  const original = content ?? '';
  const originalChars = original.length;

  // 未启用 / 未超阈值 → 原样返回
  if (opts.toolResultLimit <= 0 || originalChars <= opts.toolResultLimit) {
    return { content: original, truncated: false, originalChars };
  }

  const head = Math.max(0, opts.toolResultHeadChars);
  const tail = Math.max(0, opts.toolResultTailChars);

  // 极端配置保护：头+尾 >= 阈值时按比例压缩，避免"截断后反而更长"
  const effectiveHead = Math.min(head, Math.floor(opts.toolResultLimit * 0.7));
  const effectiveTail = Math.min(tail, opts.toolResultLimit - effectiveHead);
  const omitted = originalChars - effectiveHead - effectiveTail;

  let persisted: { absPath: string; relPath: string } | null = null;
  if (opts.persistTruncatedResults) {
    persisted = persistFullResult(original, { ...meta, contextDir: opts.contextDir });
  }

  const retrievalHint = persisted
    ? `完整内容（${originalChars} 字符）已保存到 \`${persisted.relPath}\`，` +
      '需要时可用 read_file 分段读取（配合 offset/limit 参数）。'
    : '完整内容未能保存（落盘被禁用或失败），如需全文请缩小查询范围后重新调用工具。';

  const contentOut =
    original.slice(0, effectiveHead) +
    `\n\n... [内容过长已截断：原始 ${originalChars} 字符，此处保留前 ${effectiveHead} 与后 ${effectiveTail} 字符，省略 ${omitted} 字符] ...\n` +
    retrievalHint +
    '\n\n' +
    original.slice(originalChars - effectiveTail);

  logger.debug(
    {
      tool: meta.toolName,
      originalChars,
      keptChars: contentOut.length,
      persisted: !!persisted,
    },
    '工具结果已截断',
  );

  return {
    content: contentOut,
    truncated: true,
    originalChars,
    persistedPath: persisted?.relPath,
  };
}
