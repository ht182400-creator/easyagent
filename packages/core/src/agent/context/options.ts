/**
 * ContextManager 配置解析
 *
 * 所有能力都可独立开关，便于灰度与快速回滚：
 *   · `EASYAGENT_CONTEXT_V2=0`        全局关闭（完全保持旧行为）
 *   · `EASYAGENT_CONTEXT_TOOL_TIER=0` 关闭工具分级（仍保留 benchmark 排除）
 *   · `EASYAGENT_CONTEXT_RESULT_LIMIT=<N>` 工具结果截断字符上限（0 = 不截断）
 *   · `EASYAGENT_CONTEXT_COMPACT=0`   关闭历史压缩
 *   · `EASYAGENT_CONTEXT_USABLE_RATIO` 可用上下文比例（默认 0.7）
 *
 * @module agent/context/options
 */

import type { ContextManagerOptions } from './types.js';

// ===================== 默认值（禁止在逻辑中裸写） =====================

/** 默认启用上下文管理（可用 EASYAGENT_CONTEXT_V2=0 关闭） */
const DEFAULT_ENABLED = true;

/** 默认可用比例：预留 30% 给模型输出 */
const DEFAULT_USABLE_RATIO = 0.7;

/** 默认单条工具结果字符上限（约 2,000 token） */
const DEFAULT_TOOL_RESULT_LIMIT = 8_000;

/** 截断时保留的头部字符数 */
const DEFAULT_TOOL_RESULT_HEAD = 5_000;

/** 截断时保留的尾部字符数（尾部常含错误信息/结论，价值高） */
const DEFAULT_TOOL_RESULT_TAIL = 1_200;

/** 历史压缩后至少保留的最近消息条数 */
const DEFAULT_KEEP_RECENT_MESSAGES = 8;

/**
 * 落盘目录名（相对工作区）
 *
 * ⚠️ 必须落在**工作区内**：`FileTools.safePath()` 会拒绝读取工作区外的路径
 * （`安全限制: 无法访问工作区外的路径`），若把截断内容写到 `~/.easyagent/`，
 * 模型就无法用 read_file 把它取回来，落盘便失去意义。
 * 目录以 `.` 开头，`list_dir` 默认过滤点文件，因此不会污染目录列表。
 */
export const CONTEXT_DIR_RELATIVE = '.easyagent/context';

// ===================== 工具函数 =====================

/** 读取布尔型环境变量（`0` / `false` 视为关闭；未设置时取默认值） */
function readBoolEnv(key: string, fallback: boolean): boolean {
  const raw = process.env[key];
  if (raw === undefined || raw === '') return fallback;
  return !(raw === '0' || raw.toLowerCase() === 'false' || raw.toLowerCase() === 'off');
}

/** 读取数值型环境变量（非法值回退默认） */
function readNumberEnv(key: string, fallback: number): number {
  const raw = Number(process.env[key]);
  return Number.isFinite(raw) && raw >= 0 ? raw : fallback;
}

/** 读取 0~1 比例（非法值回退默认） */
function readRatioEnv(key: string, fallback: number): number {
  const raw = Number(process.env[key]);
  if (!Number.isFinite(raw) || raw <= 0 || raw > 1) return fallback;
  return raw;
}

// ===================== 解析 =====================

/**
 * 解析生效的 ContextManager 配置
 *
 * @param overrides - 显式覆盖（优先级最高，供调用方/测试使用）
 * @returns 完整配置
 */
export function resolveContextOptions(
  overrides: Partial<ContextManagerOptions> = {},
): ContextManagerOptions {
  const enabled = overrides.enabled ?? readBoolEnv('EASYAGENT_CONTEXT_V2', DEFAULT_ENABLED);

  // 全局关闭时，其余能力一并关闭，确保行为与改造前完全一致
  // 注意：显式字段必须写在 `...overrides` 之后，否则会被覆盖（且同名键会触发 TS1117）
  if (!enabled) {
    return {
      ...overrides,
      enabled: false,
      usableRatio: overrides.usableRatio ?? DEFAULT_USABLE_RATIO,
      toolResultLimit: 0,
      toolResultHeadChars: 0,
      toolResultTailChars: 0,
      // 不压缩历史：等价于"保留全部"，_Compactor 会直接短路返回
      keepRecentMessages: Number.MAX_SAFE_INTEGER,
      enableToolTiering: false,
      dedupeToolDescriptions: false,
      persistTruncatedResults: false,
      contextDir: overrides.contextDir,
    };
  }

  const toolResultLimit =
    overrides.toolResultLimit ?? readNumberEnv('EASYAGENT_CONTEXT_RESULT_LIMIT', DEFAULT_TOOL_RESULT_LIMIT);
  const compactEnabled = readBoolEnv('EASYAGENT_CONTEXT_COMPACT', true);

  return {
    enabled: true,
    usableRatio: overrides.usableRatio ?? readRatioEnv('EASYAGENT_CONTEXT_USABLE_RATIO', DEFAULT_USABLE_RATIO),
    toolResultLimit: compactEnabled ? toolResultLimit : 0,
    toolResultHeadChars: overrides.toolResultHeadChars ?? DEFAULT_TOOL_RESULT_HEAD,
    toolResultTailChars: overrides.toolResultTailChars ?? DEFAULT_TOOL_RESULT_TAIL,
    keepRecentMessages:
      overrides.keepRecentMessages ??
      (compactEnabled ? DEFAULT_KEEP_RECENT_MESSAGES : Number.MAX_SAFE_INTEGER),
    enableToolTiering: overrides.enableToolTiering ?? readBoolEnv('EASYAGENT_CONTEXT_TOOL_TIER', true),
    dedupeToolDescriptions: overrides.dedupeToolDescriptions ?? readBoolEnv('EASYAGENT_CONTEXT_DEDUPE_DESC', true),
    persistTruncatedResults: overrides.persistTruncatedResults ?? true,
    // 未显式指定时由 ContextManager 按「工作区 + CONTEXT_DIR_RELATIVE」计算
    contextDir: overrides.contextDir,
  };
}
