/**
 * Token 估算器（本地启发式，零外部依赖）
 *
 * ── 为什么不用 tiktoken / 各厂商 tokenizer ──
 *   1. 本项目支持 11 家 provider、数十个模型，各自 tokenizer 不同，逐个引入不现实；
 *   2. 上下文管理只需要**量级正确**（判断"是否超预算、要裁多少"），不需要精确计数；
 *   3. 真实用量由 provider 返回的 `usage` 字段兜底校正（见 ContextManager 的偏差校验）。
 *
 * ── 估算模型 ──
 *   · CJK（中日韩表意文字、中文标点、全角符号）：约 **1 字符 ≈ 1 token**
 *   · 其余（英文、代码、ASCII 符号）：约 **4 字符 ≈ 1 token**
 *   该比例对中文场景偏保守（宁可高估而多裁一点，也不要低估导致请求爆窗）。
 *
 * 校准方式：环境变量 `EASYAGENT_TOKEN_CJK_PER_TOKEN` / `EASYAGENT_TOKEN_OTHER_PER_TOKEN`
 * 可在实测偏差较大时调整，而无需改代码。
 *
 * @module agent/context/tokenEstimator
 */

// ===================== 常量 =====================

/** CJK 字符的「字符/token」比值（默认 1，即 1 个汉字约 1 token） */
const DEFAULT_CJK_CHARS_PER_TOKEN = 1;

/** 非 CJK 字符的「字符/token」比值（默认 4） */
const DEFAULT_OTHER_CHARS_PER_TOKEN = 4;

/** CJK 统一表意文字区间 */
const CJK_RANGES: ReadonlyArray<readonly [number, number]> = [
  [0x4e00, 0x9fff], // CJK 统一表意文字
  [0x3400, 0x4dbf], // 扩展 A
  [0x3000, 0x303f], // CJK 符号与标点
  [0xff00, 0xffef], // 全角字符
  [0x3040, 0x30ff], // 日文假名
  [0xac00, 0xd7af], // 谚文
];

// ===================== 类型 =====================

/** 估算参数 */
export interface TokenEstimatorOptions {
  /** CJK 字符的字符/token 比值 */
  cjkCharsPerToken?: number;
  /** 非 CJK 字符的字符/token 比值 */
  otherCharsPerToken?: number;
}

/** 待估算的消息（只取需要的字段，避免与 core 的 Message 类型强耦合） */
export interface EstimatableMessage {
  role: string;
  content: string | unknown;
  tool_calls?: unknown;
  tool_call_id?: string;
}

/** 待估算的工具定义（只取序列化需要的字段） */
export interface EstimatableToolDefinition {
  name: string;
  description: string;
  parameters: unknown;
}

// ===================== 实现 =====================

/** 判断字符是否为 CJK 类（逐码点判断，正确处理代理对） */
function isCjkCodePoint(code: number): boolean {
  for (const [start, end] of CJK_RANGES) {
    if (code >= start && code <= end) return true;
  }
  return false;
}

/** 从环境变量读取数值型覆盖项（非法值回退默认） */
function readEnvNumber(key: string, fallback: number): number {
  const raw = Number(process.env[key]);
  return Number.isFinite(raw) && raw > 0 ? raw : fallback;
}

/** 解析生效的估算参数 */
export function resolveEstimatorOptions(opts: TokenEstimatorOptions = {}): Required<TokenEstimatorOptions> {
  return {
    cjkCharsPerToken:
      opts.cjkCharsPerToken ??
      readEnvNumber('EASYAGENT_TOKEN_CJK_PER_TOKEN', DEFAULT_CJK_CHARS_PER_TOKEN),
    otherCharsPerToken:
      opts.otherCharsPerToken ??
      readEnvNumber('EASYAGENT_TOKEN_OTHER_PER_TOKEN', DEFAULT_OTHER_CHARS_PER_TOKEN),
  };
}

/**
 * 估算一段文本的 token 数
 *
 * @param text - 待估算文本
 * @param opts - 估算参数（不传则读环境变量/默认值）
 * @returns 估算 token 数（非负整数）
 */
export function estimateTokens(text: string | null | undefined, opts?: TokenEstimatorOptions): number {
  if (!text) return 0;
  const { cjkCharsPerToken, otherCharsPerToken } = resolveEstimatorOptions(opts);

  let cjk = 0;
  let other = 0;
  // 用 for...of 遍历码点：避免把 emoji / 增补平面字符按 UTF-16 双字节重复计数
  for (const ch of text) {
    const code = ch.codePointAt(0);
    if (code === undefined) continue;
    if (isCjkCodePoint(code)) cjk++;
    else other++;
  }
  return Math.ceil(cjk / cjkCharsPerToken + other / otherCharsPerToken);
}

/**
 * 估算消息数组的 token 数
 *
 * 除内容外，还计入：
 *   · 每条消息的角色开销（约 {@link PER_MESSAGE_OVERHEAD_TOKENS} token，模拟协议包装）
 *   · assistant 消息中的 `tool_calls`（JSON 序列化后估算）
 *
 * @param messages - 消息数组
 * @param opts - 估算参数
 */
export function estimateMessagesTokens(
  messages: ReadonlyArray<EstimatableMessage>,
  opts?: TokenEstimatorOptions,
): number {
  let total = 0;
  for (const msg of messages) {
    total += PER_MESSAGE_OVERHEAD_TOKENS;
    if (typeof msg.content === 'string') {
      total += estimateTokens(msg.content, opts);
    } else if (msg.content != null) {
      // 结构化内容块（多模态等）按 JSON 估算
      try {
        total += estimateTokens(JSON.stringify(msg.content), opts);
      } catch {
        // 循环引用等极端情况：退化为固定开销，不阻断主流程
        total += PER_MESSAGE_OVERHEAD_TOKENS;
      }
    }
    if (msg.tool_calls) {
      try {
        total += estimateTokens(JSON.stringify(msg.tool_calls), opts);
      } catch {
        total += PER_MESSAGE_OVERHEAD_TOKENS;
      }
    }
  }
  return total;
}

/**
 * 估算工具定义数组的 token 数
 *
 * 注意：按 **紧凑 JSON** 估算（`JSON.stringify(defs)`），因为实际发给 provider 的
 * 就是紧凑形态。若某适配器做了美化输出，真实占用会更高 —— 这正是需要保守估算的原因。
 */
export function estimateToolDefinitionsTokens(
  defs: ReadonlyArray<EstimatableToolDefinition>,
  opts?: TokenEstimatorOptions,
): number {
  if (defs.length === 0) return 0;
  try {
    return estimateTokens(JSON.stringify(defs), opts);
  } catch {
    // 序列化失败时退化为逐条估算
    return defs.reduce(
      (sum, d) => sum + estimateTokens(`${d.name}${d.description}`, opts),
      0,
    );
  }
}

/** 每条消息的协议包装开销（role 标记、分隔符等） */
export const PER_MESSAGE_OVERHEAD_TOKENS = 4;
