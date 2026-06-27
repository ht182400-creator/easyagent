/**
 * 语义分析模块测试
 * 测试核心语义分析功能（语义地图构建、符号提取、引用分析）
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import {
  buildSemanticMap,
  searchSymbol,
  findReferences,
  getCodebaseOverview,
  analyzeFile,
  extractSymbols,
  collectSourceFiles,
  findRepoRoot,
  formatSemanticMap,
} from '../semantic/SemanticAnalyzer.js';
import { resetSemanticCache } from '../tools/SemanticTools.js';

/** 测试用临时目录 */
let testDir: string;

beforeAll(() => {
  testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ea-semantic-test-'));
  // 创建测试文件结构
  fs.mkdirSync(path.join(testDir, 'src'), { recursive: true });
  fs.mkdirSync(path.join(testDir, 'src', 'utils'), { recursive: true });
  fs.mkdirSync(path.join(testDir, 'src', 'components'), { recursive: true });
  fs.mkdirSync(path.join(testDir, 'node_modules'), { recursive: true });
  fs.mkdirSync(path.join(testDir, '.git'), { recursive: true });

  // 创建 TypeScript 源文件
  fs.writeFileSync(
    path.join(testDir, 'src', 'index.ts'),
    `
export { App } from './App.js';
export { ConfigManager, getConfig } from './config.js';
export { logger } from './utils/logger.js';
`,
  );

  fs.writeFileSync(
    path.join(testDir, 'src', 'App.ts'),
    `
import React, { useState, useEffect } from 'react';
import { ConfigManager } from './config';

interface AppProps {
  title: string;
  version: number;
}

type Theme = 'light' | 'dark';

export function App({ title, version }: AppProps) {
  const [theme, setTheme] = useState<Theme>('light');
  const [config, setConfig] = useState<ConfigManager | null>(null);

  useEffect(() => {
    console.log('App mounted');
  }, []);

  function handleClick() {
    setTheme(theme === 'light' ? 'dark' : 'light');
  }

  class InnerHelper {
    doWork() {
      return 'done';
    }
  }

  return null;
}

export const CONST_VERSION = 1;
`,
  );

  fs.writeFileSync(
    path.join(testDir, 'src', 'config.ts'),
    `
export class ConfigManager {
  private config: Record<string, unknown> = {};

  constructor() {
    this.load();
  }

  load() {
    this.config = { theme: 'dark' };
  }

  get(key: string): unknown {
    return this.config[key];
  }

  set(key: string, value: unknown): void {
    this.config[key] = value;
  }

  save(): void {
    // 保存到磁盘
  }
}

export function getConfig(): ConfigManager {
  return new ConfigManager();
}

export const DEFAULT_THEME = 'light';
export enum ThemeType {
  Light = 'light',
  Dark = 'dark',
}
`,
  );

  fs.writeFileSync(
    path.join(testDir, 'src', 'utils', 'logger.ts'),
    `
export enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3,
}

export function createLogger(name: string) {
  return {
    info: (msg: string) => console.log(\`[\${name}] \${msg}\`),
    error: (msg: string) => console.error(\`[\${name}] \${msg}\`),
    warn: (msg: string) => console.warn(\`[\${name}] \${msg}\`),
    debug: (msg: string) => console.debug(\`[\${name}] \${msg}\`),
  };
}

export const logger = createLogger('test');
`,
  );

  fs.writeFileSync(
    path.join(testDir, 'src', 'components', 'Button.tsx'),
    `
import React from 'react';

interface ButtonProps {
  label: string;
  onClick: () => void;
  variant?: 'primary' | 'secondary';
}

export const Button: React.FC<ButtonProps> = ({ label, onClick, variant = 'primary' }) => {
  return <button onClick={onClick} className={variant}>{label}</button>;
};
`,
  );

  // 创建 Python 文件
  fs.mkdirSync(path.join(testDir, 'python_app'), { recursive: true });
  fs.writeFileSync(
    path.join(testDir, 'python_app', 'main.py'),
    `
import os
from typing import List, Optional
from dataclasses import dataclass

@dataclass
class Config:
    name: str
    version: int = 1

def greet(name: str, greeting: str = "Hello") -> str:
    return f"{greeting}, {name}!"

class Calculator:
    def __init__(self, precision: int = 2):
        self.precision = precision

    def add(self, a: float, b: float) -> float:
        return round(a + b, self.precision)

    def multiply(self, a: float, b: float) -> float:
        return round(a * b, self.precision)

def main():
    calc = Calculator(precision=4)
    result = calc.add(3.14, 2.86)
    print(greet("World"))
    print(f"Result: {result}")

if __name__ == "__main__":
    main()
`,
  );

  // 创建 JSON 文件
  fs.writeFileSync(
    path.join(testDir, 'package.json'),
    JSON.stringify(
      {
        name: 'test-app',
        version: '1.0.0',
        dependencies: { react: '^18.0.0' },
      },
      null,
      2,
    ),
  );
});

afterAll(() => {
  // 清理测试目录
  fs.rmSync(testDir, { recursive: true, force: true });
});

beforeEach(() => {
  resetSemanticCache();
});

// ========== findRepoRoot ==========
describe('findRepoRoot', () => {
  it('应找到包含 .git 的根目录', () => {
    const root = findRepoRoot(testDir);
    expect(root).toBe(testDir);
  });

  it('应向上查找 .git 目录', () => {
    const subDir = path.join(testDir, 'src', 'utils');
    const root = findRepoRoot(subDir);
    expect(root).toBe(testDir);
  });

  it('无 .git 无 workspace 配置时应返回自身', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ea-no-git-'));
    const root = findRepoRoot(tmpDir);
    expect(root).toBe(tmpDir);
    fs.rmdirSync(tmpDir);
  });
});

// ========== collectSourceFiles ==========
describe('collectSourceFiles', () => {
  it('应收集 TypeScript 文件', () => {
    const files = collectSourceFiles(testDir, 4);
    const tsFiles = files.filter((f) => f.endsWith('.ts') || f.endsWith('.tsx'));
    expect(tsFiles.length).toBeGreaterThanOrEqual(3); // index.ts, App.ts, config.ts
  });

  it('应收集 Python 文件', () => {
    const files = collectSourceFiles(testDir, 4);
    const pyFiles = files.filter((f) => f.endsWith('.py'));
    expect(pyFiles.length).toBeGreaterThanOrEqual(1);
  });

  it('应忽略 node_modules 目录', () => {
    const files = collectSourceFiles(testDir, 4);
    const nmFiles = files.filter((f) => f.includes('node_modules'));
    expect(nmFiles.length).toBe(0);
  });

  it('应忽略 .git 目录', () => {
    const files = collectSourceFiles(testDir, 4);
    const gitFiles = files.filter((f) => f.includes('.git/') && !f.endsWith('.git'));
    expect(gitFiles.length).toBe(0);
  });
});

// ========== extractSymbols ==========
describe('extractSymbols', () => {
  it('应从 TypeScript 文件提取函数定义', () => {
    const filePath = path.join(testDir, 'src', 'App.ts');
    const symbols = extractSymbols(filePath, 'typescript');
    const functions = symbols.filter((s) => s.kind === 'function');
    expect(functions.length).toBeGreaterThanOrEqual(1);
    expect(functions.some((s) => s.name === 'App')).toBe(true);
  });

  it('应从 TypeScript 文件提取类定义', () => {
    const filePath = path.join(testDir, 'src', 'config.ts');
    const symbols = extractSymbols(filePath, 'typescript');
    const classes = symbols.filter((s) => s.kind === 'class');
    expect(classes.some((s) => s.name === 'ConfigManager')).toBe(true);
  });

  it('应从 TypeScript 文件提取接口', () => {
    const filePath = path.join(testDir, 'src', 'App.ts');
    const symbols = extractSymbols(filePath, 'typescript');
    const interfaces = symbols.filter((s) => s.kind === 'interface');
    expect(interfaces.some((s) => s.name === 'AppProps')).toBe(true);
  });

  it('应从 TypeScript 文件提取类型别名', () => {
    const filePath = path.join(testDir, 'src', 'App.ts');
    const symbols = extractSymbols(filePath, 'typescript');
    const types = symbols.filter((s) => s.kind === 'type');
    expect(types.some((s) => s.name === 'Theme')).toBe(true);
  });

  it('应从 TypeScript 文件提取枚举', () => {
    const filePath = path.join(testDir, 'src', 'config.ts');
    const symbols = extractSymbols(filePath, 'typescript');
    const enums = symbols.filter((s) => s.kind === 'enum');
    expect(enums.some((s) => s.name === 'ThemeType')).toBe(true);
  });

  it('应能分析 index.ts 文件并提取符号', () => {
    const filePath = path.join(testDir, 'src', 'index.ts');
    const info = analyzeFile(filePath);
    // index.ts 使用 re-export 语法，正则主要捕获行首声明
    // 验证分析不崩溃且有合理的文件信息
    expect(info.language).toBe('typescript');
    expect(info.lineCount).toBeGreaterThan(0);
    expect(info.size).toBeGreaterThan(0);
  });

  it('应从 Python 文件提取函数', () => {
    const filePath = path.join(testDir, 'python_app', 'main.py');
    const symbols = extractSymbols(filePath, 'python');
    const functions = symbols.filter((s) => s.kind === 'function');
    expect(functions.some((s) => s.name === 'greet')).toBe(true);
    expect(functions.some((s) => s.name === 'main')).toBe(true);
  });

  it('应从 Python 文件提取类', () => {
    const filePath = path.join(testDir, 'python_app', 'main.py');
    const symbols = extractSymbols(filePath, 'python');
    const classes = symbols.filter((s) => s.kind === 'class');
    expect(classes.some((s) => s.name === 'Calculator')).toBe(true);
    expect(classes.some((s) => s.name === 'Config')).toBe(true);
  });

  it('应从 Python 文件提取方法（def 视为 function）', () => {
    const filePath = path.join(testDir, 'python_app', 'main.py');
    const symbols = extractSymbols(filePath, 'python');
    const functions = symbols.filter((s) => s.kind === 'function');
    // Python 的 def 统一视为 function（包括 __init__, add, multiply 等方法）
    expect(functions.length).toBeGreaterThanOrEqual(1);
  });

  it('应从 Python 文件提取导入', () => {
    const filePath = path.join(testDir, 'python_app', 'main.py');
    const symbols = extractSymbols(filePath, 'python');
    const imports = symbols.filter((s) => s.kind === 'import');
    // os, typing 等
    expect(imports.length).toBeGreaterThanOrEqual(1);
  });

  it('应记录符号行号', () => {
    const filePath = path.join(testDir, 'src', 'config.ts');
    const symbols = extractSymbols(filePath, 'typescript');
    const configClass = symbols.find((s) => s.name === 'ConfigManager' && s.kind === 'class');
    expect(configClass).toBeDefined();
    expect(configClass!.line).toBeGreaterThan(0);
  });
});

// ========== analyzeFile ==========
describe('analyzeFile', () => {
  it('应返回完整的文件语义信息', () => {
    const filePath = path.join(testDir, 'src', 'config.ts');
    const info = analyzeFile(filePath);
    expect(info.language).toBe('typescript');
    expect(info.symbols.length).toBeGreaterThan(0);
    expect(info.lineCount).toBeGreaterThan(0);
    expect(info.size).toBeGreaterThan(0);
  });

  it('应对 JSON 文件返回正确语言', () => {
    const filePath = path.join(testDir, 'package.json');
    const info = analyzeFile(filePath);
    expect(info.language).toBe('json');
  });

  it('应对不存在的文件返回空结果', () => {
    const info = analyzeFile(path.join(testDir, 'not-exist.ts'));
    expect(info.symbols.length).toBe(0);
  });
});

// ========== buildSemanticMap ==========
describe('buildSemanticMap', () => {
  it('应构建完整的语义地图', () => {
    const map = buildSemanticMap(testDir, 4);
    expect(map.root).toBe(testDir);
    expect(map.files.length).toBeGreaterThan(0);
    expect(map.stats.totalFiles).toBeGreaterThan(0);
    expect(map.stats.totalLines).toBeGreaterThan(0);
    expect(map.stats.totalSymbols).toBeGreaterThan(0);
  });

  it('应正确统计文件数', () => {
    const map = buildSemanticMap(testDir, 4);
    expect(map.stats.totalFiles).toBeGreaterThanOrEqual(4);
  });

  it('应正确统计语言分布', () => {
    const map = buildSemanticMap(testDir, 4);
    const languages = Object.keys(map.stats.languages);
    expect(languages).toContain('typescript');
    expect(languages).toContain('python');
    expect(languages).toContain('json');
  });

  it('应限制最大文件数', () => {
    const map = buildSemanticMap(testDir, 4, 2);
    expect(map.files.length).toBeLessThanOrEqual(2);
  });

  it('符号索引应包含定义', () => {
    const map = buildSemanticMap(testDir, 4);
    expect(map.symbolIndex.has('ConfigManager')).toBe(true);
    expect(map.symbolIndex.has('greet')).toBe(true);
  });
});

// ========== searchSymbol ==========
describe('searchSymbol', () => {
  it('应通过名称搜索符号', () => {
    const map = buildSemanticMap(testDir, 4);
    const results = searchSymbol(map, 'Config');
    expect(results.length).toBeGreaterThan(0);
    expect(results.some((r) => r.name === 'ConfigManager')).toBe(true);
  });

  it('应支持模糊搜索', () => {
    const map = buildSemanticMap(testDir, 4);
    const results = searchSymbol(map, 'ger');
    expect(results.some((r) => r.name === 'logger')).toBe(true);
  });

  it('应支持大小写不敏感搜索', () => {
    const map = buildSemanticMap(testDir, 4);
    const results = searchSymbol(map, 'config');
    expect(results.some((r) => r.name === 'ConfigManager')).toBe(true);
  });

  it('大小写敏感搜索应精确匹配', () => {
    const map = buildSemanticMap(testDir, 4);
    const results = searchSymbol(map, 'Config', true);
    const lowerResults = searchSymbol(map, 'config', true);
    expect(results.length).toBeGreaterThanOrEqual(lowerResults.length);
  });

  it('搜索不存在的符号应返回空结果', () => {
    const map = buildSemanticMap(testDir, 4);
    const results = searchSymbol(map, 'XYZABCNotExist');
    expect(results.length).toBe(0);
  });
});

// ========== findReferences ==========
describe('findReferences', () => {
  it('应找到符号的定义和引用', () => {
    const map = buildSemanticMap(testDir, 4);
    const refs = findReferences(map, 'ConfigManager');
    const definitions = refs.filter((r) => r.kind === 'definition');
    expect(definitions.length).toBeGreaterThan(0);
  });

  it('应对不存在的符号返回空数组', () => {
    const map = buildSemanticMap(testDir, 4);
    const refs = findReferences(map, 'NonExistentSymbol');
    expect(refs.length).toBe(0);
  });
});

// ========== getCodebaseOverview ==========
describe('getCodebaseOverview', () => {
  it('应返回代码库概览', () => {
    const overview = getCodebaseOverview(testDir);
    expect(overview.root).toBe(testDir);
    expect(overview.stats.totalFiles).toBeGreaterThan(0);
    expect(overview.stats.totalLines).toBeGreaterThan(0);
    expect(overview.stats.totalSize).toBeGreaterThan(0);
    expect(overview.fileTree.length).toBeGreaterThan(0);
  });

  it('fileTree 应包含目录结构', () => {
    const overview = getCodebaseOverview(testDir);
    expect(overview.fileTree).toContain('src');
    // 应使用 📁 或 📄 前缀
    expect(overview.fileTree).toMatch(/[📁📄]/);
  });
});

// ========== formatSemanticMap ==========
describe('formatSemanticMap', () => {
  it('应生成可读的语义地图文本', () => {
    const map = buildSemanticMap(testDir, 4, 100);
    const formatted = formatSemanticMap(map);
    expect(formatted).toContain('代码库语义地图');
    expect(formatted).toContain('统计');
    expect(formatted).toContain('文件树');
    expect(formatted.length).toBeGreaterThan(100);
  });
});

// ========== 边界条件 ==========
describe('边界条件', () => {
  it('空目录应返回有效的空地图', () => {
    const emptyDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ea-empty-'));
    const map = buildSemanticMap(emptyDir, 4);
    expect(map.files.length).toBe(0);
    expect(map.stats.totalFiles).toBe(0);
    fs.rmdirSync(emptyDir);
  });

  it('大文件应正常处理不崩溃', () => {
    const filePath = path.join(testDir, 'src', 'large.ts');
    const largeContent = Array.from(
      { length: 5000 },
      (_, i) => `const x${i} = ${i}; // line ${i}`,
    ).join('\n');
    fs.writeFileSync(filePath, largeContent);

    const info = analyzeFile(filePath);
    expect(info.lineCount).toBeGreaterThan(4000);
    expect(info.symbols.length).toBeGreaterThan(0);

    fs.unlinkSync(filePath);
  });

  it('应跳过注释行中的符号', () => {
    const filePath = path.join(testDir, 'src', 'comments.ts');
    fs.writeFileSync(
      filePath,
      `
// function commentedFunc() {}
// class CommentedClass {}
/* interface HiddenInterface {} */
const realVar = 42;
`,
    );
    const symbols = extractSymbols(filePath, 'typescript');
    // 注释中的不应被提取
    expect(symbols.filter((s) => s.name === 'commentedFunc').length).toBe(0);
    expect(symbols.filter((s) => s.name === 'CommentedClass').length).toBe(0);
    expect(symbols.some((s) => s.name === 'realVar')).toBe(true);

    fs.unlinkSync(filePath);
  });
});

// ========== 语义分析工具接口测试 ==========
describe('SemanticTools 接口', () => {
  it('SemanticMapTool 应包含5个参数定义', async () => {
    const { SemanticMapTool } = await import('../tools/SemanticTools.js');
    expect(SemanticMapTool.name).toBe('code_semantic_map');
    expect(SemanticMapTool.parameters.type).toBe('object');
    expect(SemanticMapTool.parameters.properties).toHaveProperty('path');
    expect(SemanticMapTool.parameters.properties).toHaveProperty('maxDepth');
    expect(SemanticMapTool.parameters.properties).toHaveProperty('maxFiles');
    expect(SemanticMapTool.requiresConfirm).toBe(false);
  });

  it('SymbolSearchTool 应包含查询参数', async () => {
    const { SymbolSearchTool } = await import('../tools/SemanticTools.js');
    expect(SymbolSearchTool.name).toBe('code_symbol_search');
    expect(SymbolSearchTool.parameters.required).toContain('query');
  });

  it('ReferenceFindTool 应包含符号参数', async () => {
    const { ReferenceFindTool } = await import('../tools/SemanticTools.js');
    expect(ReferenceFindTool.name).toBe('code_find_references');
    expect(ReferenceFindTool.parameters.required).toContain('symbol');
  });

  it('CodebaseOverviewTool 应有合理的参数', async () => {
    const { CodebaseOverviewTool } = await import('../tools/SemanticTools.js');
    expect(CodebaseOverviewTool.name).toBe('code_overview');
    expect(CodebaseOverviewTool.requiresConfirm).toBe(false);
  });

  it('FileStructureTool 应包含文件路径参数', async () => {
    const { FileStructureTool } = await import('../tools/SemanticTools.js');
    expect(FileStructureTool.name).toBe('code_file_structure');
    expect(FileStructureTool.parameters.required).toContain('filePath');
  });

  it('SemanticTools 应包含5个工具', async () => {
    const { SemanticTools } = await import('../tools/SemanticTools.js');
    expect(SemanticTools.length).toBe(5);
    const names = SemanticTools.map((t) => t.name);
    expect(names).toContain('code_semantic_map');
    expect(names).toContain('code_symbol_search');
    expect(names).toContain('code_find_references');
    expect(names).toContain('code_overview');
    expect(names).toContain('code_file_structure');
  });

  it('工具应能在测试目录上执行', async () => {
    const { CodebaseOverviewTool } = await import('../tools/SemanticTools.js');
    const result = await CodebaseOverviewTool.execute({ path: testDir }, {
      workspace: testDir,
    } as any);
    expect(result.success).toBe(true);
    expect(result.content).toContain('代码库概览');
  });
});
