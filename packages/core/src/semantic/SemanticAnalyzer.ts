/**
 * 语义分析引擎
 * 纯JS实现，无原生依赖，支持代码库语义地图构建、符号搜索、引用分析
 * 基于正则模式匹配 + 文件遍历实现AST等价功能
 */
import * as fs from 'fs';
import * as path from 'path';

/** 支持的编程语言 */
export type SupportedLanguage = 'javascript' | 'typescript' | 'python' | 'json' | 'tsx' | 'jsx' | 'css' | 'html' | 'markdown' | 'rust' | 'go' | 'java' | 'c' | 'cpp';

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
  kind: 'function' | 'class' | 'interface' | 'type' | 'variable' | 'import' | 'export' | 'enum' | 'method';
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
  };
}

/** 忽略的目录模式 */
const IGNORE_PATTERNS = [
  'node_modules', '.git', 'dist', 'build', '.next', 'coverage',
  '__pycache__', '.venv', 'venv', '.idea', '.vscode', 'target',
  '.turbo', 'out', '.cache', '*.min.js', '*.bundle.js',
];

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
    { regex: /^export\s+(?:default\s+)?(?:const|let|var|function|class|interface|type|enum)?\s*(\w+)/gm, kind: 'export' },
  ],
  javascript: [
    { regex: /^(?:export\s+)?(?:async\s+)?function\s+(\w+)\s*\(/gm, kind: 'function' },
    { regex: /^(?:export\s+)?class\s+(\w+)/gm, kind: 'class' },
    { regex: /^(?:export\s+)?(?:const|let|var)\s+(\w+)/gm, kind: 'variable' },
    { regex: /\b(\w+)\s*\(/gm, kind: 'method' },
    { regex: /^import\s+.*from\s+['"]([^'"]+)['"]/gm, kind: 'import' },
    { regex: /^export\s+(?:default\s+)?(?:const|let|var|function|class)?\s*(\w+)/gm, kind: 'export' },
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
    { regex: /^(?:public|private|protected)?\s*(?:static\s+)?(?:final\s+)?\w+\s+(\w+)\s*\(/gm, kind: 'method' },
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

/** 检查路径是否应该被忽略 */
function shouldIgnore(filePath: string, root: string): boolean {
  const rel = path.relative(root, filePath);
  return IGNORE_PATTERNS.some(pattern => {
    if (pattern.includes('*')) {
      const regex = new RegExp(pattern.replace(/\./g, '\\.').replace(/\*/g, '.*'));
      return regex.test(path.basename(filePath));
    }
    return rel.split(path.sep).includes(pattern);
  });
}

/** 检测仓库根目录 */
export function findRepoRoot(startPath: string): string {
  let current = path.resolve(startPath);
  while (current !== path.parse(current).root) {
    if (fs.existsSync(path.join(current, '.git'))) {
      return current;
    }
    if (fs.existsSync(path.join(current, 'package.json')) &&
        fs.existsSync(path.join(current, 'pnpm-workspace.yaml'))) {
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

/**
 * 从文件内容中提取符号
 */
export function extractSymbols(filePath: string, language: SupportedLanguage): SymbolInfo[] {
  const symbols: SymbolInfo[] = [];
  let content: string;
  try {
    content = fs.readFileSync(filePath, 'utf-8');
  } catch (err) {
    return symbols;
  }

  const lines = content.split('\n');
  const patterns = SYMBOL_PATTERNS[language] || [];

  for (const { regex, kind } of patterns) {
    // 重置regex状态
    regex.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = regex.exec(content)) !== null) {
      const name = match[1];
      if (!name || name.length < 2) continue;
      if (['if', 'for', 'while', 'return', 'break', 'continue', 'throw', 'new', 'this', 'super',
           'true', 'false', 'null', 'undefined', 'typeof', 'instanceof', 'else', 'switch', 'case',
           'catch', 'finally', 'try', 'class', 'function', 'const', 'let', 'var'].includes(name)) {
        continue;
      }

      // 计算行号：找到匹配位置之前的换行数
      const matchPos = match.index;
      const beforeMatch = content.substring(0, matchPos);
      const line = (beforeMatch.match(/\n/g) || []).length + 1;

      // 提取注释行
      const lineContent = lines[line - 1] || '';
      const isComment = /^\s*(\/\/|#|\/\*|\*|--)/.test(lineContent);
      if (isComment) continue;

      // 提取签名
      let signature: string | undefined;
      if (kind === 'function' || kind === 'method') {
        const rest = content.substring(matchPos + match[0].length);
        const parenEnd = rest.indexOf(')');
        if (parenEnd !== -1) {
          signature = match[0].trim() + rest.substring(0, parenEnd + 1);
        }
      }

      symbols.push({
        name,
        kind,
        line,
        column: match.index - content.lastIndexOf('\n', match.index),
        filePath,
        signature,
      });
    }
  }

  return symbols;
}

/**
 * 分析文件语义信息
 */
export function analyzeFile(filePath: string): FileSemanticInfo {
  const language = extToLanguage(filePath) || 'javascript';
  const symbols = extractSymbols(filePath, language);
  let content: string;
  try {
    content = fs.readFileSync(filePath, 'utf-8');
  } catch (err) {
    return {
      filePath, language, symbols: [], imports: [], exports: [],
      lineCount: 0, size: 0,
    };
  }

  const imports = symbols.filter(s => s.kind === 'import').map(s => s.name);
  const exports = symbols.filter(s => s.kind === 'export').map(s => s.name);

  return {
    filePath,
    language,
    symbols,
    imports,
    exports,
    lineCount: content.split('\n').length,
    size: Buffer.byteLength(content),
  };
}

/**
 * 构建完整语义地图
 */
export function buildSemanticMap(rootPath: string, maxDepth = 8, maxFiles = 500): SemanticMap {
  const root = findRepoRoot(rootPath);
  const sourceFiles = collectSourceFiles(root, maxDepth);
  const limitedFiles = sourceFiles.slice(0, maxFiles);

  const files: FileSemanticInfo[] = [];
  const symbolIndex = new Map<string, SymbolInfo[]>();
  const referenceGraph = new Map<string, ReferenceInfo[]>();
  const languageCounts: Record<string, number> = {};
  let totalLines = 0;
  let totalSymbols = 0;

  for (const filePath of limitedFiles) {
    const info = analyzeFile(filePath);
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
        filePath,
        line: symbol.line,
        kind: 'definition',
      });
    }
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
    },
  };
}

/**
 * 搜索符号定义
 */
export function searchSymbol(
  map: SemanticMap,
  query: string,
  caseSensitive = false
): SymbolInfo[] {
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
  workspaceRoot?: string
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
        const isDefined = map.symbolIndex.get(symbolName)?.some(
          s => s.filePath === file.filePath && s.line === line
        );
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
    ``,
    `📁 文件树:`,
  ];

  // 生成文件树
  const treeLines = generateFileTree(map.root, map.files.map(f => f.filePath), 4);
  lines.push(...treeLines);

  // 符号索引摘要
  if (map.symbolIndex.size > 0) {
    lines.push('');
    lines.push(`🔍 符号索引 (${map.symbolIndex.size} 个唯一符号):`);
    const sortedSymbols = [...map.symbolIndex.entries()]
      .filter(([, syms]) => syms.length > 1)  // 只显示多处引用的符号
      .sort(([, a], [, b]) => b.length - a.length)
      .slice(0, 20);

    for (const [name, syms] of sortedSymbols) {
      const locations = syms.map(s =>
        `${path.relative(map.root, s.filePath)}:${s.line}`
      ).join(', ');
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
  const relFiles = files.map(f => path.relative(root, f)).sort();

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

    const items = [...entry.dirs].sort().map(d => ({ name: path.basename(d), isDir: true, path: d }));
    items.push(...entry.files.sort().map(f => ({ name: f, isDir: false, path: '' })));

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

/**
 * 快速获取代码库概览（不解析符号，仅统计和文件树）
 */
export function getCodebaseOverview(rootPath: string): {
  root: string;
  fileTree: string;
  stats: { totalFiles: number; totalLines: number; totalSize: number; languages: Record<string, number> };
} {
  const root = findRepoRoot(rootPath);
  const files = collectSourceFiles(root, 6).slice(0, 300);

  const languageCounts: Record<string, number> = {};
  let totalLines = 0;
  let totalSize = 0;
  const fileList: string[] = [];

  for (const filePath of files) {
    const lang = extToLanguage(filePath) || 'other';
    languageCounts[lang] = (languageCounts[lang] || 0) + 1;
    fileList.push(filePath);

    try {
      const stat = fs.statSync(filePath);
      totalSize += stat.size;
      const content = fs.readFileSync(filePath, 'utf-8');
      totalLines += content.split('\n').length;
    } catch (err) {
      // 忽略
    }
  }

  const treeLines = generateFileTree(root, fileList, 4);

  return {
    root,
    fileTree: treeLines.join('\n'),
    stats: {
      totalFiles: files.length,
      totalLines,
      totalSize,
      languages: languageCounts,
    },
  };
}
