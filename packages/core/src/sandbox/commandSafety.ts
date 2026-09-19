/**
 * 沙箱命令解析与安全校验（2026-09-19 根治版）
 *
 * ── 为什么要这个模块 ──
 * 旧实现用「危险字符黑名单」校验命令，把 `(` `)` 也一律当作子 shell 拒绝。
 * 但 `node -e 'console.log(1+1)'` 这类命令的括号在**引号内**，根本不可能构成子 shell ——
 * 结果是任何带函数调用的单行代码（JS/Python）都无法在沙箱里执行（用户实报）。
 *
 * ── 现在的模型 ──
 *   1. `parseCommandLine()` 按引号规则把命令切成 argv（引号内一律按字面量处理）；
 *   2. `findUnquotedShellOperator()` 只扫描**引号外**的 shell 元字符；
 *   3. `LocalSandbox` 进一步用 `spawn(argv[0], argv.slice(1), { shell: false })` 执行 ——
 *      **不经 shell**，`()` `$` 反引号等都只是普通字符，注入在结构上不可能；
 *      `DockerSandbox` 仍需经 `sh -c`，故保留「引号外元字符」拦截作为安全底线。
 *
 * ── 引号规则（与常见 shell 对齐，兼顾 Windows 路径）──
 *   - `'...'`：单引号内全部字面量，不支持转义；
 *   - `"..."`：双引号内仅 `\"` 与 `\\` 为转义，其他字符字面量；
 *   - 引号外：`\` **不作转义**（否则 `C:\Work\Area` 会被吃成 `C:WorkArea`），
 *     空格/制表符分词。
 *
 * @module sandbox/commandSafety
 */

/** 引号外会改变命令结构的操作符（链式 / 管道 / 重定向） */
const CHAINING_OPERATORS = new Set([';', '&', '|', '<', '>', '\n', '\r']);

/** 引号外会被 shell 展开/替换的字符（仅在「经 shell 执行」时才有危险） */
const EXPANSION_CHARACTERS = new Set(['$', '`']);

/** 命中的未加引号元字符 */
export interface UnquotedOperatorHit {
  /** 命中的字符（换行显示为 \n） */
  char: string;
  /** 在原始命令中的下标 */
  index: number;
  /**
   * 类别
   * - `chaining`：链式/管道/重定向 —— 两种沙箱都拒绝（一次只跑一条命令）
   * - `expansion`：变量展开/命令替换 —— 仅经 shell 执行（Docker `sh -c`）时才拒绝
   */
  kind: 'chaining' | 'expansion';
}

/**
 * 按引号规则把命令切成 argv
 *
 * @throws 引号未闭合时抛错（调用方应转成用户可读的失败信息）
 */
export function parseCommandLine(input: string): string[] {
  const tokens: string[] = [];
  let current = '';
  /** 当前 token 是否有内容（用于区分 `echo ''` 的空参数与连续空格） */
  let hasCurrent = false;
  let quote: '"' | "'" | null = null;

  for (let i = 0; i < input.length; i++) {
    const ch = input[i];

    if (quote === "'") {
      if (ch === "'") quote = null;
      else current += ch;
      continue;
    }

    if (quote === '"') {
      if (ch === '\\' && (input[i + 1] === '"' || input[i + 1] === '\\')) {
        current += input[++i];
      } else if (ch === '"') {
        quote = null;
      } else {
        current += ch;
      }
      continue;
    }

    // ── 引号外 ──
    if (ch === '"' || ch === "'") {
      quote = ch;
      hasCurrent = true;
      continue;
    }
    if (ch === ' ' || ch === '\t') {
      if (hasCurrent) {
        tokens.push(current);
        current = '';
        hasCurrent = false;
      }
      continue;
    }
    current += ch;
    hasCurrent = true;
  }

  if (quote) {
    throw new Error(`命令引号未闭合: ${quote}`);
  }
  if (hasCurrent) {
    tokens.push(current);
  }
  return tokens;
}

/**
 * 查找第一个**未加引号**的 shell 元字符
 *
 * @returns 命中信息；没有则返回 null
 */
export function findUnquotedShellOperator(input: string): UnquotedOperatorHit | null {
  let quote: '"' | "'" | null = null;

  for (let i = 0; i < input.length; i++) {
    const ch = input[i];

    if (quote === "'") {
      if (ch === "'") quote = null;
      continue;
    }

    if (quote === '"') {
      // 双引号内 `\"` 是转义，不能当作引号结束
      if (ch === '\\' && (input[i + 1] === '"' || input[i + 1] === '\\')) {
        i++;
        continue;
      }
      if (ch === '"') quote = null;
      continue;
    }

    // ── 引号外 ──
    if (ch === '"' || ch === "'") {
      quote = ch;
      continue;
    }
    if (CHAINING_OPERATORS.has(ch)) {
      return { char: ch === '\n' ? '\\n' : ch === '\r' ? '\\r' : ch, index: i, kind: 'chaining' };
    }
    if (EXPANSION_CHARACTERS.has(ch)) {
      return { char: ch, index: i, kind: 'expansion' };
    }
  }

  return null;
}

/**
 * 判定命令是否可安全执行（供两种沙箱复用）
 *
 * @param requireShellSafe - true 时把变量展开(`$`/反引号)也算危险（Docker `sh -c` 场景）
 * @returns `{ argv }` 或 `{ error }`
 */
export function checkCommand(
  command: string,
  requireShellSafe: boolean,
): { argv?: string[]; error?: string } {
  const hit = findUnquotedShellOperator(command);
  if (hit && (hit.kind === 'chaining' || requireShellSafe)) {
    const what = hit.kind === 'chaining' ? '管道/重定向/链式操作符' : '变量展开或命令替换';
    return {
      error:
        `沙箱一次只执行一条命令：命令中未加引号位置的 "${hit.char}" 属于${what}，已被拒绝。` +
        `如需在代码里使用该字符，请用引号包起来（例如 node -e 'console.log(1+1)'）。` +
        `命令: ${command.slice(0, 200)}`,
    };
  }

  try {
    const argv = parseCommandLine(command);
    if (argv.length === 0) {
      return { error: '命令为空' };
    }
    return { argv };
  } catch (err) {
    return { error: `命令解析失败: ${(err as Error).message}` };
  }
}
