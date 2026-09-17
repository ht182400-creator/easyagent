/**
 * 工具暴露策略 —— 按模型规模分级选择工具定义
 *
 * ── 问题（2026-09-18 实测）──
 *   工具总数 70；工具定义 JSON ≈ 8,774 token，工具描述文本 ≈ 6,058 token，
 *   合计 **≈ 14,832 token 固定开销**。占 qwen2.5:7b（32k）的 **45.3%**。
 *   且 `AgentEngine.buildSystemPrompt()` 把全部工具描述**又**拼进系统提示词，
 *   与 `tools` 参数重复计费（同一份信息付两次钱）。
 *
 * ── 设计原则：宁可漏裁，不可误裁 ──
 *   1. `ALWAYS_EXCLUDED` 只放**有明确证据**必须排除的工具（会诱发死循环/完全无关）；
 *   2. `CORE_TOOL_NAMES` 是**小模型白名单**（32k 窗口必须激进裁剪）；
 *   3. medium/large 档用**排除清单**而非白名单 —— 这样**新增工具默认可见**，
 *      不会因为忘了加进白名单而悄悄"能力消失"。
 *
 * @module agent/context/toolSelection
 */

import type { ToolDefinition } from '../../types/index.js';
import type { ModelScale } from './types.js';

// ===================== 档位阈值 =====================

/** small 档上限（token）：≤ 此窗口视为小模型，只暴露核心工具 */
export const SMALL_SCALE_MAX_TOKENS = 40_000;

/** medium 档上限（token）：≤ 此窗口视为中等模型，排除高成本低价值工具 */
export const MEDIUM_SCALE_MAX_TOKENS = 200_000;

// ===================== 工具清单 =====================

/**
 * 所有档位**一律排除**的工具
 *
 * `benchmark_*`：陷阱 #41 实测——普通聊天误暴露 benchmark 工具会导致模型反复调用
 * （benchmark_load → run → report）直到 `Recursion limit of 25 reached`。
 * 这组工具只服务于离线评测，不应进入交互式 Agent 的工具表。
 */
export const ALWAYS_EXCLUDED_TOOLS: readonly string[] = [
  'benchmark_load',
  'benchmark_run',
  'benchmark_report',
  'benchmark_scan',
];

/**
 * small 档（≤40k 窗口）保留的核心工具
 *
 * 选取标准：覆盖"读 → 改 → 跑 → 查 → 问"的最小闭环，共 17 个。
 * 刻意不包含：数据库 / 沙箱 / 多模态生成 / 知识库管理 / 高级 git / 代码语义分析
 * —— 这些在 32k 窗口下的性价比为负。
 */
export const CORE_TOOL_NAMES: readonly string[] = [
  // 文件读写（7）
  'read_file',
  'write_file',
  'edit_file',
  'list_dir',
  'grep',
  'glob',
  'delete_file',
  // 执行与验证（2）
  'exec',
  'run_tests',
  // 版本控制（2）
  'git_status',
  'git_diff',
  // 项目理解（1）
  'project_overview',
  // 交互与记忆（3）
  'ask_user',
  'remember',
  'recall',
  // 外部信息（1）
  'web_search',
  // 目录/文件维护（1）
  'create_dir',
];

/**
 * medium 档（≤200k 窗口）额外排除的工具
 *
 * 判据：**schema 成本高 且 交互式编程场景使用频率低**。
 * 注意是"排除"而非"白名单"——新增工具默认对 medium 可见。
 */
export const MEDIUM_EXCLUDED_TOOLS: readonly string[] = [
  // 沙箱（schema 最大：sandbox_exec 单条 983 字符）
  'sandbox_exec',
  'sandbox_status',
  'sandbox_cleanup',
  // 多模态生成（编程场景使用率极低）
  'generate_image',
  'screenshot',
  // 高级 git（长尾操作，需要时可用 exec 执行 git 命令）
  'git_cherry_pick',
  'git_reflog',
  'git_stash',
  'git_tag',
  'git_blame',
  'git_auto_commit',
  // 代码语义分析（find_imports / find_definitions / read_lints 已覆盖主要诉求）
  'code_semantic_map',
  'code_symbol_search',
  'code_find_references',
  'code_file_structure',
  // 数据库（非全栈场景用不到）
  'query_db',
  'db_schema',
  // 运行时安装（风险高且应由用户手动完成）
  'install_runtime',
  // 知识库删除（破坏性且低频）
  'knowledge_remove',
];

// ===================== 档位与筛选 =====================

/**
 * 依据上下文窗口推断模型规模档位
 *
 * 未提供窗口时按 `small` 处理（保守：宁可少暴露工具，也不要爆窗）。
 *
 * @param maxContextTokens - 模型上下文窗口（token）
 */
export function resolveModelScale(maxContextTokens?: number): ModelScale {
  if (!maxContextTokens || maxContextTokens <= 0) return 'small';
  if (maxContextTokens <= SMALL_SCALE_MAX_TOKENS) return 'small';
  if (maxContextTokens <= MEDIUM_SCALE_MAX_TOKENS) return 'medium';
  return 'large';
}

/** 判定某工具在给定档位下是否应暴露 */
function isVisible(name: string, scale: ModelScale): boolean {
  if (ALWAYS_EXCLUDED_TOOLS.includes(name)) return false;

  if (scale === 'small') {
    // 小模型：白名单制（必须激进裁剪，否则一半上下文被工具吃掉）
    return CORE_TOOL_NAMES.includes(name);
  }
  if (scale === 'medium') {
    return !MEDIUM_EXCLUDED_TOOLS.includes(name);
  }
  return true; // large：除 ALWAYS_EXCLUDED 外全量
}

/** 筛选结果 */
export interface ToolSelectionResult {
  /** 实际暴露的工具 */
  selected: ToolDefinition[];
  /** 被排除的工具名 */
  excludedNames: string[];
}

/**
 * 按档位筛选工具定义
 *
 * @param defs - 全量工具定义
 * @param scale - 模型规模档位
 * @param enableTiering - 是否启用分级（false 时仅应用 ALWAYS_EXCLUDED）
 */
export function selectToolDefinitions(
  defs: readonly ToolDefinition[],
  scale: ModelScale,
  enableTiering = true,
): ToolSelectionResult {
  const selected: ToolDefinition[] = [];
  const excludedNames: string[] = [];

  for (const def of defs) {
    const visible = enableTiering ? isVisible(def.name, scale) : !ALWAYS_EXCLUDED_TOOLS.includes(def.name);
    if (visible) selected.push(def);
    else excludedNames.push(def.name);
  }
  return { selected, excludedNames };
}

/**
 * 生成紧凑的「工具索引」文本，用于替代系统提示词中的完整工具描述
 *
 * 形态：`- read_file: 读取文件内容`
 * 只保留「名称 + 描述首句（截断）」，把参数细节交给 `tools` 参数承载，
 * 从而消除重复计费（实测可省约 6,000 token）。
 *
 * @param defs - 实际暴露的工具定义
 * @param maxDescChars - 单条描述保留的最大字符数
 */
export function buildToolIndexText(defs: readonly ToolDefinition[], maxDescChars = 48): string {
  if (defs.length === 0) return '（工具调用已禁用）';
  return defs
    .map((d) => {
      // 只取第一句/第一行，避免把整段描述再抄一遍
      const firstLine = (d.description || '').split(/[\n。；;]/)[0]?.trim() ?? '';
      const desc = firstLine.length > maxDescChars ? `${firstLine.slice(0, maxDescChars)}…` : firstLine;
      return `- ${d.name}: ${desc}`;
    })
    .join('\n');
}
