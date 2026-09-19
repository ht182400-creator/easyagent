/**
 * 模块测试：上下文工程（ContextManager 及其子模块）
 *
 * 覆盖目标（按测试专家视角，不止走正常流程）：
 *   · 边界值：空串 / undefined / 空数组 / 恰好等于阈值 / 极端配置
 *   · 异常场景：落盘目录不可写、内容无法序列化、工具名含路径注入字符
 *   · 分支覆盖：每个档位 × 启用/关闭 × 超预算/未超预算
 *   · 协议正确性：历史压缩**不得拆散** assistant(tool_calls) 与其 tool 结果
 *   · 可测试性保证：新增工具在 medium/large 档默认可见（不会因白名单漏登而消失）
 */
import { describe, it, expect, afterEach, beforeEach } from 'vitest';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Message, ToolDefinition } from '../types/index.js';
import {
  estimateMessagesTokens,
  estimateTokens,
  estimateToolDefinitionsTokens,
  PER_MESSAGE_OVERHEAD_TOKENS,
} from '../agent/context/tokenEstimator.js';
import {
  ALWAYS_EXCLUDED_TOOLS,
  CORE_TOOL_NAMES,
  MEDIUM_EXCLUDED_TOOLS,
  buildToolIndexText,
  resolveModelScale,
  selectToolDefinitions,
} from '../agent/context/toolSelection.js';
import { truncateToolResult } from '../agent/context/toolResultTruncator.js';
import { compactHistory } from '../agent/context/historyCompactor.js';
import {
  ContextManager,
  getContextManager,
  resetContextManager,
} from '../agent/context/ContextManager.js';
import { resolveContextOptions, CONTEXT_DIR_RELATIVE } from '../agent/context/options.js';

// ==================== 测试辅助 ====================

/** 构造一个工具定义 */
function makeTool(name: string, descLen = 20): ToolDefinition {
  return {
    name,
    description: 'x'.repeat(descLen),
    parameters: {
      type: 'object',
      properties: { p: { type: 'string', description: 'd' } },
      required: ['p'],
    },
  };
}

/** 一组覆盖各档位的工具（含 CORE、MEDIUM 排除项、benchmark、以及"未登记的新工具"） */
function makeToolSet(): ToolDefinition[] {
  return [
    ...CORE_TOOL_NAMES.slice(0, 5).map((n) => makeTool(n)),
    ...MEDIUM_EXCLUDED_TOOLS.slice(0, 3).map((n) => makeTool(n)),
    ...ALWAYS_EXCLUDED_TOOLS.map((n) => makeTool(n)),
    makeTool('brand_new_tool_not_in_any_list'), // 关键：未登记的新工具
  ];
}

/** 构造一条消息 */
function msg(role: Message['role'], content: string, extra: Partial<Message> = {}): Message {
  return { role, content, ...extra } as Message;
}

/** 保存/恢复环境变量，避免用例之间互相污染 */
const ENV_KEYS = [
  'EASYAGENT_CONTEXT_V2',
  'EASYAGENT_CONTEXT_TOOL_TIER',
  'EASYAGENT_CONTEXT_RESULT_LIMIT',
  'EASYAGENT_CONTEXT_COMPACT',
  'EASYAGENT_CONTEXT_USABLE_RATIO',
  'EASYAGENT_CONTEXT_DEDUPE_DESC',
  'EASYAGENT_TOKEN_CJK_PER_TOKEN',
  'EASYAGENT_TOKEN_OTHER_PER_TOKEN',
] as const;

let savedEnv: Record<string, string | undefined> = {};

beforeEach(() => {
  savedEnv = {};
  for (const k of ENV_KEYS) {
    savedEnv[k] = process.env[k];
    delete process.env[k];
  }
  resetContextManager();
});

afterEach(() => {
  for (const k of ENV_KEYS) {
    if (savedEnv[k] === undefined) delete process.env[k];
    else process.env[k] = savedEnv[k];
  }
  resetContextManager();
});

// ==================== 1. Token 估算 ====================

describe('estimateTokens() — token 估算', () => {
  it('空值与空串应返回 0', () => {
    expect(estimateTokens('')).toBe(0);
    expect(estimateTokens(null)).toBe(0);
    expect(estimateTokens(undefined)).toBe(0);
  });

  it('纯英文按 4 字符 ≈ 1 token', () => {
    // "hello world" = 11 字符 → ceil(11/4) = 3
    expect(estimateTokens('hello world')).toBe(3);
    expect(estimateTokens('a'.repeat(400))).toBe(100);
  });

  it('纯中文按 1 字符 ≈ 1 token', () => {
    expect(estimateTokens('你好世界')).toBe(4);
    expect(estimateTokens('测'.repeat(100))).toBe(100);
  });

  it('中英混合按各自比例分别累计', () => {
    // 4 个汉字(4) + 8 个英文字符(2) = 6
    expect(estimateTokens('你好世界abcdefgh')).toBe(6);
  });

  it('边界：emoji（代理对）不应被重复计数', () => {
    // 😀 是单个码点，应按"非 CJK 的 1 个字符"计，而非 2 个 UTF-16 单元
    const oneEmoji = estimateTokens('😀');
    expect(oneEmoji).toBe(1); // ceil(1/4) = 1
    expect(estimateTokens('😀😀😀😀')).toBe(1); // ceil(4/4) = 1
  });

  it('全角符号与中文标点按 CJK 计', () => {
    expect(estimateTokens('，。！？')).toBe(4);
  });

  it('环境变量可校准比例', () => {
    process.env.EASYAGENT_TOKEN_CJK_PER_TOKEN = '2';
    expect(estimateTokens('你好世界')).toBe(2); // 4 字符 / 2 = 2
    process.env.EASYAGENT_TOKEN_OTHER_PER_TOKEN = '2';
    expect(estimateTokens('abcdefgh')).toBe(4); // 8 / 2
  });
});

describe('estimateMessagesTokens() — 消息数组估算', () => {
  it('空数组返回 0', () => {
    expect(estimateMessagesTokens([])).toBe(0);
  });

  it('应计入每条消息的协议包装开销', () => {
    const messages = [msg('user', ''), msg('assistant', '')];
    expect(estimateMessagesTokens(messages)).toBe(PER_MESSAGE_OVERHEAD_TOKENS * 2);
  });

  it('应计入 assistant 的 tool_calls（JSON 序列化后估算）', () => {
    const withCalls = [
      msg('assistant', '', {
        tool_calls: [
          { id: 'a', type: 'function', function: { name: 'read_file', arguments: '{}' } },
        ],
      }),
    ];
    const withoutCalls = [msg('assistant', '')];
    expect(estimateMessagesTokens(withCalls)).toBeGreaterThan(estimateMessagesTokens(withoutCalls));
  });

  it('结构化内容块（非字符串）不应抛异常', () => {
    const structured = [msg('user', [{ type: 'text', text: 'hi' }] as unknown as string)];
    expect(() => estimateMessagesTokens(structured)).not.toThrow();
    expect(estimateMessagesTokens(structured)).toBeGreaterThan(0);
  });
});

describe('estimateToolDefinitionsTokens() — 工具定义估算', () => {
  it('空数组返回 0', () => {
    expect(estimateToolDefinitionsTokens([])).toBe(0);
  });

  it('工具越多估算越大', () => {
    const one = estimateToolDefinitionsTokens([makeTool('a')]);
    const three = estimateToolDefinitionsTokens([makeTool('a'), makeTool('b'), makeTool('c')]);
    expect(three).toBeGreaterThan(one);
  });
});

// ==================== 2. 工具分级 ====================

describe('resolveModelScale() — 档位推断', () => {
  it('未提供窗口时按 small 处理（保守）', () => {
    expect(resolveModelScale(undefined)).toBe('small');
    expect(resolveModelScale(0)).toBe('small');
  });

  it('窗口边界值', () => {
    expect(resolveModelScale(32_768)).toBe('small');
    expect(resolveModelScale(40_000)).toBe('small');
    expect(resolveModelScale(40_001)).toBe('medium');
    expect(resolveModelScale(131_072)).toBe('medium');
    expect(resolveModelScale(200_000)).toBe('medium');
    expect(resolveModelScale(200_001)).toBe('large');
  });
});

describe('selectToolDefinitions() — 工具分级筛选', () => {
  const tools = makeToolSet();

  it('small 档只保留核心工具（白名单制）', () => {
    const { selected } = selectToolDefinitions(tools, 'small', true);
    expect(selected.length).toBeGreaterThan(0);
    for (const t of selected) expect(CORE_TOOL_NAMES).toContain(t.name);
  });

  it('medium 档排除 MEDIUM_EXCLUDED 与 benchmark', () => {
    const { selected, excludedNames } = selectToolDefinitions(tools, 'medium', true);
    const names = selected.map((t) => t.name);
    expect(names).not.toContain('benchmark_load');
    expect(excludedNames).toContain('benchmark_load');
    for (const n of MEDIUM_EXCLUDED_TOOLS.slice(0, 3)) expect(names).not.toContain(n);
  });

  it('large 档仅排除 ALWAYS_EXCLUDED', () => {
    const { selected } = selectToolDefinitions(tools, 'large', true);
    const names = selected.map((t) => t.name);
    expect(names).not.toContain('benchmark_load');
    // MEDIUM 才排除的工具在 large 档应保留
    expect(names).toContain(MEDIUM_EXCLUDED_TOOLS[0]);
  });

  it('关键设计：未登记的新工具在 medium/large 档默认可见', () => {
    const NEW = 'brand_new_tool_not_in_any_list';
    expect(selectToolDefinitions(tools, 'medium', true).selected.map((t) => t.name)).toContain(NEW);
    expect(selectToolDefinitions(tools, 'large', true).selected.map((t) => t.name)).toContain(NEW);
    // small 是白名单制，未登记即不暴露（预期行为）
    expect(selectToolDefinitions(tools, 'small', true).selected.map((t) => t.name)).not.toContain(
      NEW,
    );
  });

  it('关闭分级时仍排除 benchmark（该排除有独立证据支持）', () => {
    const { selected } = selectToolDefinitions(tools, 'large', false);
    const names = selected.map((t) => t.name);
    expect(names).not.toContain('benchmark_load');
    expect(names).toContain(MEDIUM_EXCLUDED_TOOLS[0]); // 非 benchmark 不受影响
  });

  it('空输入不应抛异常', () => {
    expect(() => selectToolDefinitions([], 'small', true)).not.toThrow();
    expect(selectToolDefinitions([], 'small', true).selected).toEqual([]);
  });
});

describe('buildToolIndexText() — 紧凑工具索引', () => {
  it('空数组返回占位文案', () => {
    expect(buildToolIndexText([])).toContain('已禁用');
  });

  it('每行一条，格式为「- 名称: 描述首句」', () => {
    const text = buildToolIndexText([makeTool('read_file', 10)]);
    expect(text.startsWith('- read_file: ')).toBe(true);
  });

  it('长描述应被截断并加省略号', () => {
    const long = makeTool('t', 200);
    long.description = 'A'.repeat(200);
    const text = buildToolIndexText([long], 10);
    expect(text).toContain('…');
    expect(text.length).toBeLessThan(80);
  });

  it('只取描述首句（遇到换行/句号即止）', () => {
    const t = makeTool('t');
    t.description = '第一句。第二句很长很长很长';
    expect(buildToolIndexText([t], 100)).toContain('第一句');
    expect(buildToolIndexText([t], 100)).not.toContain('第二句');
  });
});

// ==================== 3. 工具结果截断 ====================

describe('truncateToolResult() — 工具结果截断与落盘', () => {
  let workspace = '';

  beforeEach(() => {
    workspace = mkdtempSync(join(tmpdir(), 'ea-ctx-'));
  });
  afterEach(() => {
    try {
      rmSync(workspace, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
  });

  const baseOpts = resolveContextOptions({ enabled: true });

  it('未超阈值时原样返回', () => {
    const r = truncateToolResult(
      'short',
      { workspace, sessionId: 's1', toolName: 'read_file' },
      baseOpts,
    );
    expect(r.truncated).toBe(false);
    expect(r.content).toBe('short');
    expect(r.originalChars).toBe(5);
  });

  it('恰好等于阈值时不截断（边界）', () => {
    const limit = 100;
    const content = 'a'.repeat(limit);
    const r = truncateToolResult(
      content,
      { workspace, sessionId: 's1', toolName: 'read_file' },
      { ...baseOpts, toolResultLimit: limit },
    );
    expect(r.truncated).toBe(false);
  });

  it('超阈值时截断，并把完整内容落盘到工作区内', () => {
    const content = 'H'.repeat(6_000) + 'M'.repeat(4_000) + 'T'.repeat(2_000);
    const r = truncateToolResult(
      content,
      { workspace, sessionId: 'sess-1', toolName: 'read_file' },
      { ...baseOpts, toolResultLimit: 1_000 },
    );

    expect(r.truncated).toBe(true);
    expect(r.originalChars).toBe(12_000);
    expect(r.persistedPath).toBeTruthy();

    // 落盘路径必须是**工作区相对路径**（read_file 会做 safePath 校验）
    expect(r.persistedPath!.startsWith(CONTEXT_DIR_RELATIVE)).toBe(true);

    const abs = join(workspace, r.persistedPath!);
    expect(existsSync(abs)).toBe(true);
    expect(readFileSync(abs, 'utf-8')).toBe(content); // 完整内容不丢

    // 回填内容应包含头、尾、以及取回提示
    expect(r.content).toContain('已截断');
    expect(r.content).toContain('read_file');
    expect(r.content.length).toBeLessThan(content.length);
  });

  it('toolResultLimit=0 表示关闭截断', () => {
    const content = 'a'.repeat(100_000);
    const r = truncateToolResult(
      content,
      { workspace, sessionId: 's1', toolName: 'exec' },
      { ...baseOpts, toolResultLimit: 0 },
    );
    expect(r.truncated).toBe(false);
  });

  it('禁用落盘时仍截断，只是不提供路径', () => {
    const content = 'a'.repeat(20_000);
    const r = truncateToolResult(
      content,
      { workspace, sessionId: 's1', toolName: 'exec' },
      { ...baseOpts, toolResultLimit: 1_000, persistTruncatedResults: false },
    );
    expect(r.truncated).toBe(true);
    expect(r.persistedPath).toBeUndefined();
    expect(r.content).toContain('未能保存');
  });

  it('落盘失败（工作区路径非法）应降级为纯截断，不抛异常', () => {
    // Windows 下含非法字符的路径无法创建目录
    const badWorkspace = join(workspace, 'a\u0000b');
    const content = 'a'.repeat(20_000);
    expect(() =>
      truncateToolResult(
        content,
        { workspace: badWorkspace, sessionId: 's1', toolName: 'exec' },
        { ...baseOpts, toolResultLimit: 1_000 },
      ),
    ).not.toThrow();
  });

  it('极端配置：头+尾大于阈值时不应产生"截断后更长"', () => {
    const content = 'a'.repeat(5_000);
    const r = truncateToolResult(
      content,
      { workspace, sessionId: 's1', toolName: 'exec' },
      {
        ...baseOpts,
        toolResultLimit: 100,
        toolResultHeadChars: 10_000,
        toolResultTailChars: 10_000,
      },
    );
    expect(r.truncated).toBe(true);
    // 保留部分不应超过阈值本身（提示文案另计，故给一定余量）
    expect(r.content.length).toBeLessThan(content.length);
  });

  it('工具名含路径注入字符时应被清理（不逃逸出目标目录）', () => {
    const content = 'a'.repeat(20_000);
    const r = truncateToolResult(
      content,
      { workspace, sessionId: 's1', toolName: '../../evil' },
      { ...baseOpts, toolResultLimit: 1_000 },
    );
    expect(r.persistedPath).toBeTruthy();
    expect(r.persistedPath!).not.toContain('..');
    expect(
      join(workspace, r.persistedPath!).startsWith(join(workspace, CONTEXT_DIR_RELATIVE)),
    ).toBe(true);
  });
});

// ==================== 4. 历史压缩 ====================

describe('compactHistory() — 历史压缩', () => {
  it('空数组为无操作', () => {
    const r = compactHistory({ messages: [], budgetTokens: 100, keepRecentMessages: 4 });
    expect(r.droppedCount).toBe(0);
    expect(r.messages).toEqual([]);
    expect(r.summaryText).toBe('');
  });

  it('未超预算为无操作', () => {
    const messages = [msg('user', 'hi'), msg('assistant', 'hello')];
    const r = compactHistory({ messages, budgetTokens: 100_000, keepRecentMessages: 4 });
    expect(r.droppedCount).toBe(0);
    expect(r.messages).toHaveLength(2);
  });

  it('超预算时丢弃最旧消息并生成摘要，剩余保持顺序', () => {
    const messages: Message[] = [];
    for (let i = 0; i < 20; i++) {
      messages.push(msg('user', `问题${i}：` + 'x'.repeat(200)));
      messages.push(msg('assistant', `回答${i}：` + 'y'.repeat(200)));
    }
    const r = compactHistory({ messages, budgetTokens: 200, keepRecentMessages: 4 });
    expect(r.droppedCount).toBeGreaterThan(0);
    expect(r.messages.length).toBeGreaterThanOrEqual(4);
    expect(r.summaryText).toContain('早前对话摘要');
    // 保留的是**较新**的消息
    const lastContent = String(r.messages[r.messages.length - 1].content);
    expect(lastContent).toContain('回答19');
  });

  it('关键：不得拆散 assistant(tool_calls) 与其 tool 结果', () => {
    // 构造：多条普通消息 + 一组 工具调用(assistant+tool) + 若干新消息
    const messages: Message[] = [
      msg('user', 'U1' + 'a'.repeat(400)),
      msg('assistant', 'A1' + 'b'.repeat(400)),
      msg('user', 'U2'),
      msg('assistant', '准备调用工具', {
        tool_calls: [
          { id: 'call_1', type: 'function', function: { name: 'read_file', arguments: '{}' } },
        ],
      }),
      msg('tool', 'T'.repeat(800), { tool_call_id: 'call_1' }),
      msg('assistant', '结果已处理'),
      msg('user', 'U3'),
      msg('assistant', 'A3'),
    ];

    const r = compactHistory({ messages, budgetTokens: 50, keepRecentMessages: 3 });

    // 不变量：保留下来的消息中，任何 tool 消息之前都必须有对应的 assistant(tool_calls)
    let pendingToolCallIds = new Set<string>();
    for (const m of r.messages) {
      if (m.role === 'assistant' && m.tool_calls?.length) {
        for (const tc of m.tool_calls) pendingToolCallIds.add(tc.id);
      } else if (m.role === 'tool') {
        expect(pendingToolCallIds.has(m.tool_call_id || '')).toBe(true);
      }
    }
  });

  it('不得把"带工具调用的 assistant"单独保留而其 tool 结果被丢掉', () => {
    const messages: Message[] = [
      msg('user', '老消息' + 'x'.repeat(600)),
      msg('assistant', '调用', {
        tool_calls: [{ id: 'c1', type: 'function', function: { name: 'grep', arguments: '{}' } }],
      }),
      msg('tool', '结果', { tool_call_id: 'c1' }),
      msg('assistant', '完成'),
      msg('user', '新消息1'),
      msg('assistant', '新消息2'),
    ];
    const r = compactHistory({ messages, budgetTokens: 20, keepRecentMessages: 2 });
    const keptToolIds = new Set(
      r.messages.filter((m) => m.role === 'tool').map((m) => m.tool_call_id),
    );
    for (const m of r.messages) {
      if (m.role === 'assistant' && m.tool_calls?.length) {
        for (const tc of m.tool_calls) {
          expect(keptToolIds.has(tc.id)).toBe(true);
        }
      }
    }
  });

  it('触达"最少保留"下限后停止裁剪并标记仍超预算', () => {
    const messages: Message[] = [];
    for (let i = 0; i < 10; i++) messages.push(msg('user', 'x'.repeat(1_000)));
    const r = compactHistory({ messages, budgetTokens: 1, keepRecentMessages: 6 });
    expect(r.messages.length).toBe(6);
    expect(r.stillOverBudget).toBe(true);
  });

  it('摘要中应省略超长内容（不把原文抄一遍）', () => {
    const messages: Message[] = [msg('user', 'X'.repeat(5_000)), msg('assistant', 'ok')];
    const r = compactHistory({ messages, budgetTokens: 10, keepRecentMessages: 1 });
    expect(r.summaryText).not.toContain('X'.repeat(200));
  });
});

// ==================== 5. ContextManager 编排 ====================

describe('ContextManager.build() — 上下文构建', () => {
  /** 构造 build 输入 */
  function makeInput(overrides: Partial<Parameters<ContextManager['build']>[0]> = {}) {
    return {
      systemPrompt: '你是助手。',
      messages: [msg('user', '你好')],
      toolDefinitions: makeToolSet(),
      workspace: process.cwd(),
      sessionId: 's1',
      model: 'deepseek-v4',
      ...overrides,
    };
  }

  it('关闭上下文管理时：原样返回，但 benchmark 仍被排除', () => {
    const cm = new ContextManager({ enabled: false });
    const input = makeInput();
    const r = cm.build(input);

    expect(r.toolDefinitions.map((t) => t.name)).not.toContain('benchmark_load');
    expect(r.messages[0].role).toBe('system');
    // 关闭时系统提示词不加工具索引
    expect(r.systemPrompt).toBe(input.systemPrompt);
    expect(r.stats.toolCount.after).toBeLessThan(r.stats.toolCount.before);
  });

  it('小窗口模型：工具被裁到核心集，且系统提示词追加紧凑索引', () => {
    const cm = new ContextManager({ enabled: true });
    const r = cm.build(makeInput({ maxContextTokens: 32_768 }));

    expect(r.stats.scale).toBe('small');
    for (const t of r.toolDefinitions) expect(CORE_TOOL_NAMES).toContain(t.name);
    expect(r.systemPrompt).toContain('工具索引');
    // 索引是"名称 + 首句"，不应再出现完整参数定义
    expect(r.systemPrompt).not.toContain('参数:');
  });

  it('大窗口模型：工具接近全量（仅减 benchmark）', () => {
    const cm = new ContextManager({ enabled: true });
    const r = cm.build(makeInput({ maxContextTokens: 131_072 }));

    expect(r.stats.scale).toBe('medium');
    expect(r.toolDefinitions.map((t) => t.name)).toContain('brand_new_tool_not_in_any_list');
    expect(r.toolDefinitions.map((t) => t.name)).not.toContain('benchmark_load');
  });

  it('未提供窗口时按保守的 small 处理', () => {
    const cm = new ContextManager({ enabled: true });
    const r = cm.build(makeInput({ maxContextTokens: undefined }));
    expect(r.stats.scale).toBe('small');
  });

  it('统计信息应自洽（total = system + tools + messages；usageRatio 合理）', () => {
    const cm = new ContextManager({ enabled: true });
    const r = cm.build(makeInput({ maxContextTokens: 131_072 }));
    const s = r.stats;
    expect(s.totalTokens).toBe(s.systemTokens + s.toolTokens + s.messageTokens);
    expect(s.budgetTokens).toBe(Math.floor(s.windowTokens * cm.getOptions().usableRatio));
    expect(s.usageRatio).toBeGreaterThan(0);
    expect(s.usageRatio).toBeLessThanOrEqual(1);
  });

  it('messages 第 0 条必须是 system，且内容与 systemPrompt 一致', () => {
    const cm = new ContextManager({ enabled: true });
    const r = cm.build(makeInput());
    expect(r.messages[0].role).toBe('system');
    expect(r.messages[0].content).toBe(r.systemPrompt);
  });

  it('历史超预算时应压缩并在系统提示词中带出摘要', () => {
    const cm = new ContextManager({ enabled: true, keepRecentMessages: 2 });
    const history: Message[] = [];
    for (let i = 0; i < 40; i++) history.push(msg('user', `历史${i}` + 'x'.repeat(1_500)));

    // 显式给定较小的窗口，确保压缩必然触发（否则默认 32k 预算下不会超）
    const r = cm.build(makeInput({ messages: history, maxContextTokens: 8_192 }));
    expect(r.systemPrompt).toContain('早前对话摘要');
    expect(r.stats.adjustments.some((a) => a.kind === 'history-compaction')).toBe(true);
  });

  it('工具数量为零时不应抛异常', () => {
    const cm = new ContextManager({ enabled: true });
    const r = cm.build(makeInput({ toolDefinitions: [] }));
    expect(r.toolDefinitions).toEqual([]);
    expect(r.stats.toolCount.after).toBe(0);
  });

  it('允许工具但被禁用时应给出提示文案而非空工具段', () => {
    const cm = new ContextManager({ enabled: true });
    const r = cm.build(makeInput({ toolDefinitions: [] }));
    expect(r.systemPrompt).toContain('工具索引');
  });

  it('单次覆盖 dedupeToolDescriptions=false 时不追加工具索引（供不支持 function calling 的模型使用）', () => {
    const cm = new ContextManager({ enabled: true });
    const r = cm.build(makeInput({ dedupeToolDescriptions: false }));
    expect(r.systemPrompt).not.toContain('工具索引');
  });

  it('单次覆盖优先级高于全局配置（全局开、单次关）', () => {
    const cm = new ContextManager({ enabled: true, dedupeToolDescriptions: true });
    expect(cm.getOptions().dedupeToolDescriptions).toBe(true);
    expect(cm.build(makeInput()).systemPrompt).toContain('工具索引');
    expect(cm.build(makeInput({ dedupeToolDescriptions: false })).systemPrompt).not.toContain(
      '工具索引',
    );
  });
});

describe('ContextManager.truncateToolResult() — 编排层截断', () => {
  it('关闭时不截断', () => {
    const cm = new ContextManager({ enabled: false });
    const r = cm.truncateToolResult('a'.repeat(100_000), {
      workspace: process.cwd(),
      sessionId: 's1',
    });
    expect(r.truncated).toBe(false);
  });

  it('启用时按配置截断（工具名缺省不应抛异常）', () => {
    const cm = new ContextManager({ enabled: true, toolResultLimit: 100 });
    const r = cm.truncateToolResult('a'.repeat(10_000), {
      workspace: process.cwd(),
      sessionId: 's-truncate-test',
    });
    expect(r.truncated).toBe(true);
    expect(r.originalChars).toBe(10_000);
    // 清理本次落盘
    try {
      rmSync(join(process.cwd(), CONTEXT_DIR_RELATIVE, 's-truncate-test'), {
        recursive: true,
        force: true,
      });
    } catch {
      /* ignore */
    }
  });
});

// ==================== 6. 配置解析 ====================

describe('resolveContextOptions() — 配置解析', () => {
  it('默认启用', () => {
    expect(resolveContextOptions().enabled).toBe(true);
  });

  it('EASYAGENT_CONTEXT_V2=0 全局关闭，且其余能力一并关闭', () => {
    process.env.EASYAGENT_CONTEXT_V2 = '0';
    const o = resolveContextOptions();
    expect(o.enabled).toBe(false);
    expect(o.toolResultLimit).toBe(0);
    expect(o.enableToolTiering).toBe(false);
    expect(o.dedupeToolDescriptions).toBe(false);
  });

  it('EASYAGENT_CONTEXT_RESULT_LIMIT 可调整截断阈值', () => {
    process.env.EASYAGENT_CONTEXT_RESULT_LIMIT = '123';
    expect(resolveContextOptions().toolResultLimit).toBe(123);
  });

  it('EASYAGENT_CONTEXT_TOOL_TIER=0 关闭分级', () => {
    process.env.EASYAGENT_CONTEXT_TOOL_TIER = '0';
    expect(resolveContextOptions().enableToolTiering).toBe(false);
  });

  it('EASYAGENT_CONTEXT_COMPACT=0 关闭压缩与截断', () => {
    process.env.EASYAGENT_CONTEXT_COMPACT = '0';
    const o = resolveContextOptions();
    expect(o.toolResultLimit).toBe(0);
    expect(o.keepRecentMessages).toBe(Number.MAX_SAFE_INTEGER);
  });

  it('非法 usableRatio 回退默认 0.7', () => {
    process.env.EASYAGENT_CONTEXT_USABLE_RATIO = 'abc';
    expect(resolveContextOptions().usableRatio).toBe(0.7);
    process.env.EASYAGENT_CONTEXT_USABLE_RATIO = '1.5';
    expect(resolveContextOptions().usableRatio).toBe(0.7);
  });

  it('显式覆盖优先于环境变量', () => {
    process.env.EASYAGENT_CONTEXT_RESULT_LIMIT = '999';
    expect(resolveContextOptions({ toolResultLimit: 5 }).toolResultLimit).toBe(5);
  });
});

describe('getContextManager() — 共享实例', () => {
  it('无覆盖时返回同一实例', () => {
    const a = getContextManager();
    const b = getContextManager();
    expect(a).toBe(b);
  });

  it('提供覆盖时返回新实例', () => {
    const a = getContextManager();
    const b = getContextManager({ enabled: false });
    expect(a).not.toBe(b);
    expect(b.getOptions().enabled).toBe(false);
  });

  it('resetContextManager 后重新解析配置', () => {
    const before = getContextManager();
    resetContextManager();
    process.env.EASYAGENT_CONTEXT_V2 = '0';
    const after = getContextManager();
    expect(after).not.toBe(before);
    expect(after.getOptions().enabled).toBe(false);
  });
});
