/**
 * 语义分析引擎
 * 纯JS实现，无原生依赖，支持代码库语义地图构建、符号搜索、引用分析
 * 基于正则模式匹配 + 文件遍历实现AST等价功能
 */
import * as fs from 'fs';
import * as fsp from 'fs/promises';
import * as path from 'path';

/** 支持的编程语言 */
export type SupportedLanguage =
  | 'javascript'
  | 'typescript'
  | 'python'
  | 'json'
  | 'tsx'
  | 'jsx'
  | 'css'
  | 'html'
  | 'markdown'
  | 'rust'
  | 'go'
  | 'java'
  | 'c'
  | 'cpp';

/** 语言→文件扩展名映射 */
const LANGUAGE_EXTENSIONS: Record<SupportedLanguage, string[]> = {
  javascript: ['.js', '.mjs', '.cjs'],
  typescript: ['.ts'],
  python: ['.py', '.pyw'],
  json: ['.json'],
  tsx: ['.tsx'],
  jsx: ['.jsx'],
  css: ['.css', '.scss', '.less'],
  html: ['.html', '.htm'],
  markdown: ['.md', '.mdx'],
  rust: ['.rs'],
  go: ['.go'],
  java: ['.java'],
  c: ['.c', '.h'],
  cpp: ['.cpp', '.cc', '.cxx', '.hpp'],
};

/** 符号提取结果 */
export interface SymbolInfo {
  name: string;
  kind:
    | 'function'
    | 'class'
    | 'interface'
    | 'type'
    | 'variable'
    | 'import'
    | 'export'
    | 'enum'
    | 'method';
  line: number;
  column: number;
  filePath: string;
  signature?: string;
  visibility?: 'public' | 'private' | 'protected';
  context?: string; // 所在类/模块
}

/** 引用关系 */
export interface ReferenceInfo {
  symbol: string;
  filePath: string;
  line: number;
  kind: 'definition' | 'reference' | 'import';
}

/** 文件语义信息 */
export interface FileSemanticInfo {
  filePath: string;
  language: SupportedLanguage;
  symbols: SymbolInfo[];
  imports: string[];
  exports: string[];
  lineCount: number;
  size: number;
}

/** 语义地图 */
export interface SemanticMap {
  root: string;
  files: FileSemanticInfo[];
  symbolIndex: Map<string, SymbolInfo[]>;
  referenceGraph: Map<string, ReferenceInfo[]>;
  stats: {
    totalFiles: number;
    totalLines: number;
    totalSymbols: number;
    languages: Record<string, number>;
    /** 候选文件总数（截断前）—— 大于 totalFiles 即说明被 maxFiles 截断 */
    totalCandidates: number;
    /** 是否因 maxFiles 上限被截断（超出部分未纳入分析，调用方须提示用户） */
    truncated: boolean;
  };
}

/** 忽略的目录模式 */
const IGNORE_PATTERNS = [
  'node_modules',
  '.git',
  'dist',
  'build',
  '.next',
  'coverage',
  '__pycache__',
  '.venv',
  'venv',
  '.idea',
  '.vscode',
  'target',
  '.turbo',
  'out',
  '.cache',
  // 产物/日志类目录：不是源码，且数量巨大（本项目 logs/test-logs 每次回归产出
  // summary.json + 回归测试.html + raw/*.log），会把 maxFiles 上限挤满（2026-09-19 实测）
  'logs',
  'release',
  // 编辑器/工具数据目录：.obsidian 里是 vendored 的第三方插件 bundle
  // （excalidraw/dataview/templater 的 main.js 均为压缩产物，单个就吃掉 10s 扫描）
  '.obsidian',
  'vendor',
  '*.min.js',
  '*.bundle.js',
];

/**
 * 「代码文件」扩展名（扫描时优先收录）
 *
 * ⚠️ 为什么需要优先级：`maxFiles` 是**硬上限**，而真实仓库里文档/数据/产物文件
 * （.md/.json/.html/.css）往往远多于代码文件 —— 只按目录遍历顺序截断时，
 * 这些非代码文件会把上限占满，导致语义地图里**一个 TypeScript 文件都没有**
 * （2026-09-19 实测：本仓库 300 上限被 142 个 `logs/test-logs/**` 的 json/html 占满，
 *  `stats.languages` 里 typescript = 0 → 地图对代码库毫无意义）。
 */
const CODE_FIRST_EXTENSIONS = new Set([
  '.ts',
  '.tsx',
  '.js',
  '.jsx',
  '.mjs',
  '.cjs',
  '.py',
  '.go',
  '.rs',
  '.java',
  '.kt',
  '.rb',
  '.php',
  '.cs',
  '.swift',
  '.c',
  '.cpp',
  '.h',
  '.hpp',
]);

/** 代码符号正则模式（按语言） */
const SYMBOL_PATTERNS: Record<string, Array<{ regex: RegExp; kind: SymbolInfo['kind'] }>> = {
  typescript: [
    { regex: /^(?:export\s+)?(?:async\s+)?function\s+(\w+)\s*\(/gm, kind: 'function' },
    { regex: /^(?:export\s+)?(?:abstract\s+)?class\s+(\w+)/gm, kind: 'class' },
    { regex: /^(?:export\s+)?interface\s+(\w+)/gm, kind: 'interface' },
    { regex: /^(?:export\s+)?type\s+(\w+)\s*=/gm, kind: 'type' },
    { regex: /^(?:export\s+)?(?:const|let|var)\s+(\w+)/gm, kind: 'variable' },
    { regex: /^(?:export\s+)?enum\s+(\w+)/gm, kind: 'enum' },
    { regex: /\b(?:public|private|protected)?\s*(?:async\s+)?(\w+)\s*\(/gm, kind: 'method' },
    { regex: /^import\s+.*from\s+['"]([^'"]+)['"]/gm, kind: 'import' },
    {
      regex:
        /^export\s+(?:default\s+)?(?:const|let|var|function|class|interface|type|enum)?\s*(\w+)/gm,
      kind: 'export',
    },
  ],
  javascript: [
    { regex: /^(?:export\s+)?(?:async\s+)?function\s+(\w+)\s*\(/gm, kind: 'function' },
    { regex: /^(?:export\s+)?class\s+(\w+)/gm, kind: 'class' },
    { regex: /^(?:export\s+)?(?:const|let|var)\s+(\w+)/gm, kind: 'variable' },
    { regex: /\b(\w+)\s*\(/gm, kind: 'method' },
    { regex: /^import\s+.*from\s+['"]([^'"]+)['"]/gm, kind: 'import' },
    {
      regex: /^export\s+(?:default\s+)?(?:const|let|var|function|class)?\s*(\w+)/gm,
      kind: 'export',
    },
    { regex: /^module\.exports\s*=/gm, kind: 'export' },
    { regex: /require\s*\(\s*['"]([^'"]+)['"]\s*\)/gm, kind: 'import' },
  ],
  python: [
    { regex: /^def\s+(\w+)\s*\(/gm, kind: 'function' },
    { regex: /^class\s+(\w+)/gm, kind: 'class' },
    { regex: /^(\w+)\s*=\s*/gm, kind: 'variable' },
    { regex: /^from\s+(\S+)\s+import/gm, kind: 'import' },
    { regex: /^import\s+(\S+)/gm, kind: 'import' },
  ],
  rust: [
    { regex: /^(?:pub\s+)?fn\s+(\w+)\s*\(/gm, kind: 'function' },
    { regex: /^(?:pub\s+)?struct\s+(\w+)/gm, kind: 'class' },
    { regex: /^(?:pub\s+)?enum\s+(\w+)/gm, kind: 'enum' },
    { regex: /^(?:pub\s+)?trait\s+(\w+)/gm, kind: 'interface' },
    { regex: /^(?:pub\s+)?(?:const|static)\s+(\w+)/gm, kind: 'variable' },
    { regex: /^use\s+(\S+)/gm, kind: 'import' },
  ],
  go: [
    { regex: /^func\s+(\w+)\s*\(/gm, kind: 'function' },
    { regex: /^type\s+(\w+)\s+struct/gm, kind: 'class' },
    { regex: /^type\s+(\w+)\s+interface/gm, kind: 'interface' },
    { regex: /^(?:var|const)\s+(\w+)/gm, kind: 'variable' },
    { regex: /^import\s+(?:\(|\"(\S+)\")/gm, kind: 'import' },
  ],
  java: [
    {
      regex: /^(?:public|private|protected)?\s*(?:static\s+)?(?:final\s+)?\w+\s+(\w+)\s*\(/gm,
      kind: 'method',
    },
    { regex: /^(?:public\s+)?class\s+(\w+)/gm, kind: 'class' },
    { regex: /^(?:public\s+)?interface\s+(\w+)/gm, kind: 'interface' },
    { regex: /^(?:public\s+)?enum\s+(\w+)/gm, kind: 'enum' },
    { regex: /^import\s+(\S+)/gm, kind: 'import' },
  ],
};

/** 将文件扩展名映射到语言 */
function extToLanguage(filePath: string): SupportedLanguage | null {
  const ext = path.extname(filePath).toLowerCase();
  for (const [lang, exts] of Object.entries(LANGUAGE_EXTENSIONS)) {
    if (exts.includes(ext)) return lang as SupportedLanguage;
  }
  return null;
}

/**
 * 代码文件优先排序（稳定排序：同优先级内保持目录遍历顺序）
 *
 * 配合 `maxFiles` 截断使用，确保上限优先分配给真正的源码。
 */
function prioritizeSourceFiles(files: string[]): string[] {
  return [...files].sort((a, b) => {
    const pa = CODE_FIRST_EXTENSIONS.has(path.extname(a).toLowerCase()) ? 0 : 1;
    const pb = CODE_FIRST_EXTENSIONS.has(path.extname(b).toLowerCase()) ? 0 : 1;
    return pa - pb;
  });
}

/**
 * 忽略判定（**一次性编译**）
 *
 * ⚠️ 旧实现每次调用都为通配模式 `new RegExp` —— 717 文件 × 2 个通配模式 = 上千次正则编译，
 * 白烧掉可观时间（2026-09-19 剖析）。
 */
const IGNORE_PATH_SEGMENTS = new Set(IGNORE_PATTERNS.filter((p) => !p.includes('*')));
const IGNORE_NAME_REGEXES = IGNORE_PATTERNS.filter((p) => p.includes('*')).map(
  (p) => new RegExp(p.replace(/\./g, '\\.').replace(/\*/g, '.*')),
);

/** 检查路径是否应该被忽略 */
function shouldIgnore(filePath: string, root: string): boolean {
  const rel = path.relative(root, filePath);
  if (rel.split(path.sep).some((segment) => IGNORE_PATH_SEGMENTS.has(segment))) return true;
  const name = path.basename(filePath);
  return IGNORE_NAME_REGEXES.some((regex) => regex.test(name));
}

/** 检测仓库根目录 */
export function findRepoRoot(startPath: string): string {
  let current = path.resolve(startPath);
  while (current !== path.parse(current).root) {
    if (fs.existsSync(path.join(current, '.git'))) {
      return current;
    }
    if (
      fs.existsSync(path.join(current, 'package.json')) &&
      fs.existsSync(path.join(current, 'pnpm-workspace.yaml'))
    ) {
      return current;
    }
    current = path.dirname(current);
  }
  return startPath;
}

/**
 * 递归收集目录中所有源文件
 */
export function collectSourceFiles(root: string, maxDepth = 8): string[] {
  const files: string[] = [];

  function walk(dir: string, depth: number) {
    if (depth > maxDepth) return;
    if (shouldIgnore(dir, root)) return;

    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch (err) {
      return;
    }

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (shouldIgnore(fullPath, root)) continue;

      if (entry.isDirectory()) {
        walk(fullPath, depth + 1);
      } else if (entry.isFile()) {
        const lang = extToLanguage(entry.name);
        if (lang) files.push(fullPath);
      }
    }
  }

  walk(root, 0);
  return files;
}

/** 单文件最多提取的符号数（防极端文件拖垮整体扫描） */
const MAX_SYMBOLS_PER_FILE = 3000;

/**
 * 构建行号索引：一次性记录每个换行符之后的起始偏移
 *
 * ⚠️ 为什么必须这么做：旧实现**每个符号**都用 `content.substring(0, matchPos)` +
 * 对前缀全文匹配 `\n` 来求行号，复杂度是 **O(符号数 × 文件长度)**。
 * 实测一个压缩成单行的第三方 bundle（26 行 / 25804 处匹配）单独耗时 **10.3s**，
 * 占整个仓库扫描的 96%（2026-09-19 性能剖析）。改为一次性建索引 + 二分查找后为 O(1)。
 */
function buildLineIndex(content: string): number[] {
  const offsets: number[] = [0];
  for (let i = 0; i < content.length; i++) {
    if (content.charCodeAt(i) === 10 /* \n */) offsets.push(i + 1);
  }
  return offsets;
}

/** 二分查找某偏移所在行号（1-based） */
function lineAt(offsets: number[], pos: number): number {
  let lo = 0;
  let hi = offsets.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (offsets[mid] <= pos) lo = mid;
    else hi = mid - 1;
  }
  return lo + 1;
}

/** 取第 line 行文本（1-based）—— 用偏移切片，避免整文件 split 的额外内存与耗时 */
function lineTextAt(offsets: number[], content: string, line: number): string {
  const start = offsets[line - 1] ?? 0;
  const rawEnd = line > offsets.length - 1 ? content.length + 1 : offsets[line];
  return content.slice(start, Math.max(start, rawEnd - 1)).replace(/\r$/, '');
}

/**
 * 是否为「压缩/打包产物」（行数极少但单行极长）
 *
 * 这类文件符号匹配可达数万条：既不是可读源码，又会把扫描拖到秒级。
 */
function looksMinified(content: string, lineCount: number): boolean {
  if (lineCount > 50) return false;
  return content.length / Math.max(lineCount, 1) > 2000;
}

/**
 * 从文件中提取符号（公共 API：读盘 + 委托 `extractSymbolsFromContent`）
 */
export function extractSymbols(filePath: string, language: SupportedLanguage): SymbolInfo[] {
  let content: string;
  try {
    content = fs.readFileSync(filePath, 'utf-8');
  } catch {
    return [];
  }
  return extractSymbolsFromContent(content, language, filePath);
}

/** 单文件分析缓存条目 */
interface AnalysisCacheEntry {
  mtimeMs: number;
  size: number;
  info: FileSemanticInfo;
}

/**
 * 单文件分析缓存（**增量扫描的关键**）
 *
 * 键 = 文件绝对路径，指纹 = `mtimeMs + size`：文件没变就复用上次的符号/导入导出结果，
 * **连读盘和正则解析都跳过**。实测二次构建同一目录从 ~0.6s 降到 ~30ms 量级。
 * 条目在每次 `buildSemanticMap` 结束后按「本次实际扫描集合」裁剪，内存有界。
 */
const analysisCache = new Map<string, AnalysisCacheEntry>();

/** 缓存条目上限：超过即整体清空（防止长期驻留超大仓库的符号数据） */
const ANALYSIS_CACHE_LIMIT = 5000;

/**
 * 概览专用的「行数缓存」（只存行数，不保留符号；同样按 `mtimeMs + size` 指纹）
 *
 * `getCodebaseOverview` 旧实现每次都 `readFileSync(utf-8)` + `split('\n')` 全量扫一遍，
 * 而概览只需要行数 —— 缓存后可复用（2026-09-19 剖析：该路径本就是主线程同步阻塞大户）。
 */
const lineCountCache = new Map<string, { mtimeMs: number; size: number; lines: number }>();

/** 清空增量缓存（强制刷新 / 单元测试用）：符号分析缓存 + 概览行数缓存 */
export function clearAnalysisCache(): void {
  analysisCache.clear();
  lineCountCache.clear();
}

/** 写入符号分析缓存（超出条目上限时整体清空） */
function storeAnalysisCache(
  filePath: string,
  mtimeMs: number,
  size: number,
  info: FileSemanticInfo,
): void {
  if (analysisCache.size >= ANALYSIS_CACHE_LIMIT) analysisCache.clear();
  analysisCache.set(filePath, { mtimeMs, size, info });
}

/**
 * 带 mtime 指纹的 `analyzeFile`（增量扫描入口）
 *
 * 文件未变更（`mtimeMs` + `size` 相同）→ 直接返回缓存的 `FileSemanticInfo`。
 */
export function analyzeFileCached(filePath: string): FileSemanticInfo {
  let stat: fs.Stats;
  try {
    stat = fs.statSync(filePath);
  } catch {
    // 拿不到 stat（权限/竞态）→ 交回无缓存实现（其内部会处理读失败）
    return analyzeFile(filePath);
  }
  const cached = analysisCache.get(filePath);
  if (cached && cached.mtimeMs === stat.mtimeMs && cached.size === stat.size) {
    return cached.info;
  }
  let info: FileSemanticInfo;
  let size = stat.size;
  try {
    // 直接读 Buffer：行数按字节统计、size 取 buf.length（省掉一次 utf-8 解码与再编码）
    const buf = fs.readFileSync(filePath);
    info = analyzeFromBuffer(filePath, buf);
    size = buf.length;
  } catch {
    info = analyzeFile(filePath);
  }
  // ⚠️ 指纹用「读取前」的 stat：若读盘期间文件被改写，下次构建 stat 不一致 → 自动重解析
  storeAnalysisCache(filePath, stat.mtimeMs, size, info);
  return info;
}

/**
 * 从已读入的内容中提取符号
 *
 * ⚠️ 与 `extractSymbols` 分开是为了**避免二次读盘**：`analyzeFile` 本就需要全文
 * （算行数/大小/导入导出），旧实现下每个文件会被读两遍（2026-09-19 优化）。
 */
function extractSymbolsFromContent(
  content: string,
  language: SupportedLanguage,
  filePath: string,
): SymbolInfo[] {
  const symbols: SymbolInfo[] = [];

  // 行号索引：一次 O(n) 建索引，之后每个符号 O(log n) 定位（替代旧的 O(n²) 前缀计数）
  const lineOffsets = buildLineIndex(content);
  // 压缩/打包产物直接跳过（实测单个 bundle 曾占全仓扫描 96% 耗时）
  if (looksMinified(content, lineOffsets.length)) {
    return symbols;
  }
  const patterns = SYMBOL_PATTERNS[language] || [];

  // 标签：单文件符号数达上限时跳出所有模式循环
  outer: for (const { regex, kind } of patterns) {
    // 重置regex状态
    regex.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = regex.exec(content)) !== null) {
      const name = match[1];
      if (!name || name.length < 2) continue;
      if (
        [
          'if',
          'for',
          'while',
          'return',
          'break',
          'continue',
          'throw',
          'new',
          'this',
          'super',
          'true',
          'false',
          'null',
          'undefined',
          'typeof',
          'instanceof',
          'else',
          'switch',
          'case',
          'catch',
          'finally',
          'try',
          'class',
          'function',
          'const',
          'let',
          'var',
        ].includes(name)
      ) {
        continue;
      }

      // 单文件符号上限：巨型生成代码不再无界消耗
      if (symbols.length >= MAX_SYMBOLS_PER_FILE) break outer;

      // 行号：二分查找 + 行偏移（旧实现见 buildLineIndex 注释）
      const matchPos = match.index;
      const line = lineAt(lineOffsets, matchPos);

      // 提取注释行（按偏移切片，不整文件 split）
      const lineContent = lineTextAt(lineOffsets, content, line);
      const isComment = /^\s*(\/\/|#|\/\*|\*|--)/.test(lineContent);
      if (isComment) continue;

      // 提取签名
      let signature: string | undefined;
      if (kind === 'function' || kind === 'method') {
        // ⚠️ 不要 `content.substring(matchPos + …)`：每个匹配复制一段尾串是 O(n·m)。
        // 改为带起点的 indexOf + 扫描窗口上限（正常函数签名不会超过 500 字符）
        const from = matchPos + match[0].length;
        const parenEnd = content.indexOf(')', from);
        if (parenEnd !== -1 && parenEnd - from < 500) {
          signature = `${match[0].trim()}${content.slice(from, parenEnd + 1)}`.trim();
        }
      }

      symbols.push({
        name,
        kind,
        line,
        column: matchPos - (lineOffsets[line - 1] ?? 0) + 1,
        filePath,
        signature,
      });
    }
  }

  return symbols;
}

/**
 * 统计 Buffer 中的行数
 *
 * 等价于 `content.split('\n').length`，但**不解码、不建数组**。
 * UTF-8 里 0x0A 只可能是换行符（多字节字符的字节均 ≥ 0x80），故按字节统计与按字符统计等价。
 */
function countLinesInBuffer(buf: Buffer): number {
  let lines = 1;
  for (let i = 0; i < buf.length; i++) {
    if (buf[i] === 10) lines++;
  }
  return lines;
}

/** 空的分析结果（读失败 / 无符号模式语言共用） */
function emptyFileInfo(filePath: string, language: SupportedLanguage): FileSemanticInfo {
  return { filePath, language, symbols: [], imports: [], exports: [], lineCount: 0, size: 0 };
}

/**
 * 由已读入的 Buffer 生成文件语义信息（同步 / 并发两条路径共用同一套解析逻辑）
 *
 * 2026-09-19 性能剖析驱动的三处优化：
 * 1. **行数按字节统计**：省掉 `split('\n')` 的整表分配
 * 2. **`size` 直接取 `buf.length`**：旧实现用 `Buffer.byteLength(content)` 把整个字符串
 *    按 UTF-8 重新编一遍来算长度（全仓 35MB 语料纯属浪费）
 * 3. **无符号模式的语言（markdown/json/html/css…）直接返回**：它们只需要行数/大小，
 *    跳过 utf-8 解码与符号扫描
 */
function analyzeFromBuffer(filePath: string, buf: Buffer): FileSemanticInfo {
  const language = extToLanguage(filePath) || 'javascript';
  const lineCount = countLinesInBuffer(buf);

  if ((SYMBOL_PATTERNS[language] || []).length === 0) {
    return {
      filePath,
      language,
      symbols: [],
      imports: [],
      exports: [],
      lineCount,
      size: buf.length,
    };
  }

  const content = buf.toString('utf-8');
  const symbols = extractSymbolsFromContent(content, language, filePath);
  return {
    filePath,
    language,
    symbols,
    imports: symbols.filter((s) => s.kind === 'import').map((s) => s.name),
    exports: symbols.filter((s) => s.kind === 'export').map((s) => s.name),
    lineCount,
    size: buf.length,
  };
}

/**
 * 分析文件语义信息
 */
export function analyzeFile(filePath: string): FileSemanticInfo {
  let buf: Buffer;
  try {
    buf = fs.readFileSync(filePath);
  } catch {
    return emptyFileInfo(filePath, extToLanguage(filePath) || 'javascript');
  }
  return analyzeFromBuffer(filePath, buf);
}

/**
 * 构建完整语义地图
 *
 * @param rootPath - 扫描起点
 * @param maxDepth - 目录扫描深度
 * @param maxFiles - 最多分析的文件数
 * @param options.expandToRepoRoot - 是否向上扩展到仓库根（默认 true 保持原行为）；
 *        显式传入具体目录的调用方（如 REST API 带 path 参数）可传 false，
 *        避免「查一个子目录却扫描整个 monorepo」的 10s 级等待（压测实测，见 docs/76）
 */
export function buildSemanticMap(
  rootPath: string,
  maxDepth = 8,
  // 默认上限 1000：实测本仓库 717 个可扫描文件（516 个代码文件）。
  // 旧默认 300 时（代码优先排序后）300 个名额全被代码文件占满，仍有 **216 个代码文件（42%）**
  // 与全部 114 个 .md / 73 个 .json 未被纳入 —— 而 O(n²) 修复后全量扫描不到 1s，放宽上限是划算的（2026-09-19）
  maxFiles = 1000,
  options: { expandToRepoRoot?: boolean } = {},
): SemanticMap {
  const root = options.expandToRepoRoot === false ? path.resolve(rootPath) : findRepoRoot(rootPath);
  const sourceFiles = collectSourceFiles(root, maxDepth);
  // 代码文件优先占满 maxFiles（否则文档/数据文件会把上限吃光，见 CODE_FIRST_EXTENSIONS 注释）
  const limitedFiles = prioritizeSourceFiles(sourceFiles).slice(0, maxFiles);

  // 同步路径：逐文件走增量缓存（readFileSync 无法重叠 I/O → 冷启受 I/O 拖累，见 buildSemanticMapAsync）
  const infos = limitedFiles.map((filePath) => analyzeFileCached(filePath));
  return assembleMap(root, sourceFiles, limitedFiles, infos);
}

/**
 * 并发读盘版构建（**UI/Worker 走这条**；同步版保留给工具层与单测）
 *
 * 2026-09-19 分阶段剖析（本仓库 717 文件、35MB）：
 *   纯读盘 243ms（**59%**）· 正则解析 150ms（36%）· 目录遍历 20~41ms（5%）
 * → 瓶颈是**磁盘 I/O 而非 CPU**：同步 `readFileSync` 无法重叠 I/O 等待，
 *   故这里先 `statSync` 判定增量缓存命中，未命中的文件限流并发读入（默认 16），再统一解析
 *   （解析是纯 CPU，加线程收益有限，暂不做）。
 *
 * @param options.concurrency - 并发读盘数（默认 16；机械盘 / 网络盘可调小）
 */
export async function buildSemanticMapAsync(
  rootPath: string,
  maxDepth = 8,
  maxFiles = 1000,
  options: { expandToRepoRoot?: boolean; concurrency?: number } = {},
): Promise<SemanticMap> {
  const { concurrency = 16 } = options;
  const root = options.expandToRepoRoot === false ? path.resolve(rootPath) : findRepoRoot(rootPath);
  const sourceFiles = collectSourceFiles(root, maxDepth);
  const limitedFiles = prioritizeSourceFiles(sourceFiles).slice(0, maxFiles);

  const infos = new Map<string, FileSemanticInfo>();
  const pending: Array<{ filePath: string; mtimeMs: number; size: number }> = [];

  for (const filePath of limitedFiles) {
    let stat: fs.Stats | null = null;
    try {
      stat = fs.statSync(filePath);
    } catch {
      stat = null;
    }
    const cached = stat ? analysisCache.get(filePath) : undefined;
    if (stat && cached && cached.mtimeMs === stat.mtimeMs && cached.size === stat.size) {
      infos.set(filePath, cached.info); // 命中增量缓存：连读盘都省掉
    } else {
      pending.push({ filePath, mtimeMs: stat?.mtimeMs ?? 0, size: stat?.size ?? 0 });
    }
  }

  await runWithConcurrency(pending, concurrency, async (item) => {
    try {
      const buf = await fsp.readFile(item.filePath);
      const info = analyzeFromBuffer(item.filePath, buf);
      // ⚠️ 指纹取「读取前」的 stat：若读盘期间文件被改写，下次构建 stat 不一致 → 自动重解析
      storeAnalysisCache(item.filePath, item.mtimeMs, buf.length, info);
      infos.set(item.filePath, info);
    } catch {
      infos.set(item.filePath, emptyFileInfo(item.filePath, 'javascript'));
    }
  });

  return assembleMap(
    root,
    sourceFiles,
    limitedFiles,
    limitedFiles.map(
      (filePath) =>
        infos.get(filePath) ?? emptyFileInfo(filePath, extToLanguage(filePath) || 'javascript'),
    ),
  );
}

/** 限流并发执行（不保证完成顺序；调用方自行收集结果） */
async function runWithConcurrency<T>(
  items: T[],
  concurrency: number,
  handler: (item: T) => Promise<void>,
): Promise<void> {
  if (items.length === 0) return;
  let cursor = 0;
  const workers = Math.max(1, Math.min(concurrency, items.length));
  await Promise.all(
    Array.from({ length: workers }, async () => {
      while (cursor < items.length) {
        const item = items[cursor++];
        await handler(item);
      }
    }),
  );
}

/**
 * 汇总为最终语义地图（同步 / 并发两条路径共用，确保统计与索引口径**完全一致**）
 */
function assembleMap(
  root: string,
  sourceFiles: string[],
  limitedFiles: string[],
  infos: FileSemanticInfo[],
): SemanticMap {
  const files: FileSemanticInfo[] = [];
  const symbolIndex = new Map<string, SymbolInfo[]>();
  const referenceGraph = new Map<string, ReferenceInfo[]>();
  const languageCounts: Record<string, number> = {};
  let totalLines = 0;
  let totalSymbols = 0;

  for (const info of infos) {
    files.push(info);
    totalLines += info.lineCount;
    totalSymbols += info.symbols.length;
    languageCounts[info.language] = (languageCounts[info.language] || 0) + 1;

    // 构建符号索引和引用图
    for (const symbol of info.symbols) {
      if (['import', 'export'].includes(symbol.kind)) continue;

      // 符号索引
      if (!symbolIndex.has(symbol.name)) {
        symbolIndex.set(symbol.name, []);
      }
      symbolIndex.get(symbol.name)!.push(symbol);

      // 引用图
      if (!referenceGraph.has(symbol.name)) {
        referenceGraph.set(symbol.name, []);
      }
      referenceGraph.get(symbol.name)!.push({
        symbol: symbol.name,
        filePath: info.filePath,
        line: symbol.line,
        kind: 'definition',
      });
    }
  }

  // 增量缓存裁剪：只保留本次实际扫描的文件，避免切换目录/缩小范围后旧条目长期驻留
  const scannedSet = new Set(limitedFiles);
  for (const cachedPath of analysisCache.keys()) {
    if (!scannedSet.has(cachedPath)) analysisCache.delete(cachedPath);
  }

  return {
    root,
    files,
    symbolIndex,
    referenceGraph,
    stats: {
      totalFiles: files.length,
      totalLines,
      totalSymbols,
      languages: languageCounts,
      // 截断可见化：候选数 > 实际扫描数时，调用方（UI / 工具输出）必须提示"还有文件未纳入"
      totalCandidates: sourceFiles.length,
      truncated: sourceFiles.length > limitedFiles.length,
    },
  };
}

/**
 * 搜索符号定义
 */
export function searchSymbol(map: SemanticMap, query: string, caseSensitive = false): SymbolInfo[] {
  const results: SymbolInfo[] = [];
  const q = caseSensitive ? query : query.toLowerCase();

  for (const [name, symbols] of map.symbolIndex) {
    const n = caseSensitive ? name : name.toLowerCase();
    if (n.includes(q)) {
      results.push(...symbols);
    }
  }
  return results;
}

/**
 * 查找符号的所有引用位置
 */
export function findReferences(
  map: SemanticMap,
  symbolName: string,
  workspaceRoot?: string,
): ReferenceInfo[] {
  const references: ReferenceInfo[] = [];
  const range = workspaceRoot || map.root;

  // 从引用图中获取已知定义
  if (map.referenceGraph.has(symbolName)) {
    references.push(...map.referenceGraph.get(symbolName)!);
  }

  // 在源文件中grep搜索
  for (const file of map.files) {
    try {
      const content = fs.readFileSync(file.filePath, 'utf-8');
      const lines = content.split('\n');
      const regex = new RegExp(`\\b${escapeRegex(symbolName)}\\b`, 'g');
      let match: RegExpExecArray | null;

      while ((match = regex.exec(content)) !== null) {
        const line = (content.substring(0, match.index).match(/\n/g) || []).length + 1;
        // 跳过已在符号索引中的定义
        const isDefined = map.symbolIndex
          .get(symbolName)
          ?.some((s) => s.filePath === file.filePath && s.line === line);
        if (isDefined) continue;

        references.push({
          symbol: symbolName,
          filePath: file.filePath,
          line,
          kind: 'reference',
        });
      }
    } catch (err) {
      // 忽略访问失败的文件
    }
  }

  return references;
}

/**
 * 生成语义地图的文本表示
 */
export function formatSemanticMap(map: SemanticMap): string {
  const lines: string[] = [
    `📊 代码库语义地图`,
    `根目录: ${map.root}`,
    ``,
    `📈 统计:`,
    `  文件数: ${map.stats.totalFiles}`,
    `  总行数: ${map.stats.totalLines.toLocaleString()}`,
    `  总符号数: ${map.stats.totalSymbols}`,
    `  语言分布: ${Object.entries(map.stats.languages)
      .map(([lang, count]) => `${lang}(${count})`)
      .join(', ')}`,
    // 截断可见化：到达上限时必须说明"还有多少没扫"，否则会被误认为地图是完整的
    ...(map.stats.truncated
      ? [
          `  ⚠️ 已达文件上限：本次扫描 ${map.stats.totalFiles} / 候选 ${map.stats.totalCandidates}`,
          `     其余 ${map.stats.totalCandidates - map.stats.totalFiles} 个文件未纳入（可调大 maxFiles 重扫）`,
        ]
      : []),
    ``,
    `📁 文件树:`,
  ];

  // 生成文件树
  const treeLines = generateFileTree(
    map.root,
    map.files.map((f) => f.filePath),
    4,
  );
  lines.push(...treeLines);

  // 符号索引摘要
  if (map.symbolIndex.size > 0) {
    lines.push('');
    lines.push(`🔍 符号索引 (${map.symbolIndex.size} 个唯一符号):`);
    const sortedSymbols = [...map.symbolIndex.entries()]
      .filter(([, syms]) => syms.length > 1) // 只显示多处引用的符号
      .sort(([, a], [, b]) => b.length - a.length)
      .slice(0, 20);

    for (const [name, syms] of sortedSymbols) {
      const locations = syms
        .map((s) => `${path.relative(map.root, s.filePath)}:${s.line}`)
        .join(', ');
      lines.push(`  ${name} (${syms.length}处) → ${locations}`);
    }
  }

  return lines.join('\n');
}

/**
 * 生成ASCII文件树
 */
function generateFileTree(root: string, files: string[], maxDepth: number): string[] {
  const lines: string[] = [];
  const relFiles = files.map((f) => path.relative(root, f)).sort();

  // 构建目录结构
  const dirMap = new Map<string, { dirs: Set<string>; files: string[] }>();

  for (const rel of relFiles) {
    const parts = rel.split(path.sep);
    let current = '';
    for (let i = 0; i < parts.length; i++) {
      const parent = current || '.';
      current = current ? path.join(current, parts[i]) : parts[i];
      if (!dirMap.has(parent)) {
        dirMap.set(parent, { dirs: new Set(), files: [] });
      }
      if (i === parts.length - 1) {
        dirMap.get(parent)!.files.push(parts[i]);
      } else {
        dirMap.get(parent)!.dirs.add(current);
      }
    }
  }

  function render(dir: string, prefix: string, depth: number): void {
    if (depth > maxDepth) return;

    const entry = dirMap.get(dir);
    if (!entry) return;

    const items = [...entry.dirs]
      .sort()
      .map((d) => ({ name: path.basename(d), isDir: true, path: d }));
    items.push(...entry.files.sort().map((f) => ({ name: f, isDir: false, path: '' })));

    for (let i = 0; i < items.length; i++) {
      const isLast = i === items.length - 1;
      const connector = isLast ? '└── ' : '├── ';
      const childPrefix = prefix + (isLast ? '    ' : '│   ');

      if (items[i].isDir) {
        lines.push(`${prefix}${connector}📁 ${items[i].name}/`);
        render(items[i].path, childPrefix, depth + 1);
      } else {
        lines.push(`${prefix}${connector}📄 ${items[i].name}`);
      }
    }
  }

  lines.push('.');
  render('.', '', 0);
  return lines;
}

/** 转义正则特殊字符 */
function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** 代码库概览结果 */
export interface CodebaseOverview {
  root: string;
  fileTree: string;
  stats: {
    totalFiles: number;
    totalLines: number;
    totalSize: number;
    languages: Record<string, number>;
    /** 候选文件总数（截断前） */
    totalCandidates: number;
    /** 是否因上限被截断（超出部分未纳入） */
    truncated: boolean;
  };
}

/** 概览的待统计文件集（同步 / 并发两版共用，保证口径一致） */
function collectOverviewInputs(rootPath: string): {
  root: string;
  candidates: string[];
  files: string[];
} {
  const root = findRepoRoot(rootPath);
  // 同样代码优先：概览的文件上限也不能被文档/数据文件吃光
  const candidates = prioritizeSourceFiles(collectSourceFiles(root, 6));
  return { root, candidates, files: candidates.slice(0, 1000) };
}

/** 概览聚合：语言计数按文件集，行数/大小按成功读到的行（与旧实现一致） */
function aggregateOverview(
  root: string,
  candidates: string[],
  files: string[],
  rows: Map<string, { lines: number; size: number }>,
): CodebaseOverview {
  const languageCounts: Record<string, number> = {};
  let totalLines = 0;
  let totalSize = 0;

  for (const filePath of files) {
    const lang = extToLanguage(filePath) || 'other';
    languageCounts[lang] = (languageCounts[lang] || 0) + 1;
    const row = rows.get(filePath);
    if (row) {
      totalLines += row.lines;
      totalSize += row.size;
    }
  }

  return {
    root,
    fileTree: generateFileTree(root, files, 4).join('\n'),
    stats: {
      totalFiles: files.length,
      totalLines,
      totalSize,
      languages: languageCounts,
      totalCandidates: candidates.length,
      truncated: candidates.length > files.length,
    },
  };
}

/** 概览用：取文件行数（mtime + size 命中则免读盘；读盘也按字节数行、不解码） */
function countFileLines(filePath: string, stat: fs.Stats): number {
  const cached = lineCountCache.get(filePath);
  if (cached && cached.mtimeMs === stat.mtimeMs && cached.size === stat.size) {
    return cached.lines;
  }
  const buf = fs.readFileSync(filePath);
  const lines = countLinesInBuffer(buf);
  if (lineCountCache.size >= ANALYSIS_CACHE_LIMIT) lineCountCache.clear();
  lineCountCache.set(filePath, { mtimeMs: stat.mtimeMs, size: stat.size, lines });
  return lines;
}

/**
 * 快速获取代码库概览（不解析符号，仅统计和文件树）—— 同步版
 */
export function getCodebaseOverview(rootPath: string): CodebaseOverview {
  const { root, candidates, files } = collectOverviewInputs(rootPath);
  const rows = new Map<string, { lines: number; size: number }>();

  for (const filePath of files) {
    try {
      const stat = fs.statSync(filePath);
      rows.set(filePath, { lines: countFileLines(filePath, stat), size: stat.size });
    } catch {
      // 忽略读失败的文件（语言计数仍计入，与旧实现一致）
    }
  }

  return aggregateOverview(root, candidates, files, rows);
}

/**
 * 概览（**并发读盘版**，路由 / UI 用）
 *
 * 同步版会对 700+ 文件逐个 `readFileSync`（实测 ~240ms **同步阻塞主线程**），
 * 这里改为「stat 判缓存命中 + 未命中者限流并发读」：读盘等待期间事件循环不被占死。
 */
export async function getCodebaseOverviewAsync(
  rootPath: string,
  concurrency = 16,
): Promise<CodebaseOverview> {
  const { root, candidates, files } = collectOverviewInputs(rootPath);
  const rows = new Map<string, { lines: number; size: number }>();
  const pending: Array<{ filePath: string; mtimeMs: number; size: number }> = [];

  for (const filePath of files) {
    let stat: fs.Stats | null = null;
    try {
      stat = fs.statSync(filePath);
    } catch {
      stat = null;
    }
    if (!stat) continue;

    const cached = lineCountCache.get(filePath);
    if (cached && cached.mtimeMs === stat.mtimeMs && cached.size === stat.size) {
      rows.set(filePath, { lines: cached.lines, size: stat.size });
    } else {
      pending.push({ filePath, mtimeMs: stat.mtimeMs, size: stat.size });
    }
  }

  await runWithConcurrency(pending, concurrency, async (item) => {
    try {
      const buf = await fsp.readFile(item.filePath);
      const lines = countLinesInBuffer(buf);
      if (lineCountCache.size >= ANALYSIS_CACHE_LIMIT) lineCountCache.clear();
      lineCountCache.set(item.filePath, { mtimeMs: item.mtimeMs, size: item.size, lines });
      rows.set(item.filePath, { lines, size: item.size });
    } catch {
      // 忽略读失败
    }
  });

  return aggregateOverview(root, candidates, files, rows);
}
