/**
 * 代码分析工具集
 * 提供代码检查、统计、格式化、测试运行等操作
 */
import { existsSync, statSync } from 'node:fs';
import { relative, resolve } from 'node:path';
import type { ITool } from './ToolRegistry.js';
import type { ToolResult, ToolContext } from '../types/index.js';

function safePath(workspace: string, targetPath: string): string {
  const resolved = resolve(workspace, targetPath);
  if (!resolved.startsWith(resolve(workspace))) {
    throw new Error(`安全限制: 无法访问工作区外的路径 "${targetPath}"`);
  }
  return resolved;
}

/**
 * 代码统计工具
 * 统计文件/目录的代码行数、文件数、语言分布等
 */
export const CodeStatsTool: ITool = {
  name: 'code_stats',
  description: '统计指定目录(默认工作区根目录)的代码统计：文件数、代码行数、语言分布。',
  requiresConfirm: false,
  parameters: {
    type: 'object',
    properties: {
      targetPath: { type: 'string', description: '目标目录路径(相对于工作区), 默认根目录' },
    },
    required: [],
  },
  async execute(params, context): Promise<ToolResult> {
    try {
      const target = params.targetPath
        ? safePath(context.workspace, params.targetPath as string)
        : context.workspace;
      const { readdirSync, readFileSync, statSync: fsStat } = await import('node:fs');
      const { join, extname } = await import('node:path');

      const extMap: Record<string, { files: number; lines: number }> = {};
      let totalFiles = 0;
      let totalLines = 0;

      const walk = (dir: string, depth: number) => {
        if (depth > 4) return;
        const entries = readdirSync(dir, { withFileTypes: true });
        for (const entry of entries) {
          if (entry.name.startsWith('.') || entry.name === 'node_modules' || entry.name === 'dist') continue;
          const fullPath = join(dir, entry.name);
          if (entry.isDirectory() && depth < 4) {
            walk(fullPath, depth + 1);
          } else if (entry.isFile()) {
            const ext = extname(entry.name).slice(1) || 'other';
            try {
              if (fsStat(fullPath).size < 1024 * 1024) {
                const lines = readFileSync(fullPath, 'utf-8').split('\n').length;
                totalFiles++;
                totalLines += lines;
                if (!extMap[ext]) extMap[ext] = { files: 0, lines: 0 };
                extMap[ext].files++;
                extMap[ext].lines += lines;
              }
            } catch (err) { /* skip binary files */ }
          }
        }
      };
      walk(target, 0);

      const langReport = Object.entries(extMap)
        .sort(([, a], [, b]) => b.lines - a.lines)
        .map(([ext, { files, lines }]) => `  ${ext.padEnd(10)} ${String(files).padStart(5)} 文件  ${String(lines).padStart(7)} 行`)
        .join('\n');

      return {
        success: true,
        content: `代码统计 (${relative(context.workspace, target) || '根目录'}):\n  总文件: ${totalFiles}\n  总行数: ${totalLines}\n\n语言分布:\n${langReport}`,
        metadata: { totalFiles, totalLines, languages: Object.keys(extMap).length },
      };
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      return { success: false, content: `代码统计失败: ${msg}`, error: msg };
    }
  },
};

/**
 * 运行测试工具
 * 自动检测项目类型并运行测试（支持 npm run test / pytest / go test）
 */
export const RunTestsTool: ITool = {
  name: 'run_tests',
  description: '检测项目类型并运行测试套件。支持 Node(npm test)、Python(pytest)、Go(go test)。',
  requiresConfirm: true,
  parameters: {
    type: 'object',
    properties: {
      testPath: { type: 'string', description: '可选: 指定测试文件或目录' },
      flags: { type: 'string', description: '可选: 额外的命令行参数' },
    },
    required: [],
  },
  async execute(params, context): Promise<ToolResult> {
    try {
      const { execSync } = await import('node:child_process');
      const ws = context.workspace;

      let command = '';
      if (existsSync(resolve(ws, 'package.json'))) {
        command = 'npm test';
        if (params.testPath) command += ` -- ${params.testPath}`;
        if (params.flags) command += ` ${params.flags}`;
      } else if (existsSync(resolve(ws, 'go.mod'))) {
        command = `go test ./...`;
        if (params.testPath) command = `go test ${params.testPath}`;
        if (params.flags) command += ` -v ${params.flags}`;
      } else if (existsSync(resolve(ws, 'requirements.txt')) || existsSync(resolve(ws, 'pyproject.toml'))) {
        command = 'python -m pytest';
        if (params.testPath) command += ` ${params.testPath}`;
        if (params.flags) command += ` ${params.flags}`;
      } else {
        return { success: false, content: '未识别的项目类型。支持: Node.js (package.json), Go (go.mod), Python (requirements.txt/pyproject.toml)' };
      }

      const output = execSync(command, { cwd: ws, encoding: 'utf-8', timeout: 120000, maxBuffer: 1024 * 1024 });
      return { success: true, content: output.slice(-4000), metadata: { command } };
    } catch (error: any) {
      const msg = error.stderr || error.stdout || error.message || String(error);
      return { success: false, content: `测试运行失败:\n${msg.slice(-2000)}`, error: 'TEST_FAILED' };
    }
  },
};

/**
 * 查找导入/依赖工具
 * 查找指定符号或模块在项目中的导入位置
 */
export const FindImportsTool: ITool = {
  name: 'find_imports',
  description: '查找项目中哪些文件导入了指定的模块或符号。用于重构时了解依赖关系。',
  requiresConfirm: false,
  parameters: {
    type: 'object',
    properties: {
      moduleOrSymbol: { type: 'string', description: '要搜索的模块名或导入符号' },
      filePattern: { type: 'string', description: '文件匹配模式, 例如 "*.ts" 或 "*.py", 默认所有文本文件' },
    },
    required: ['moduleOrSymbol'],
  },
  async execute(params, context): Promise<ToolResult> {
    try {
      const query = params.moduleOrSymbol as string;
      const filePattern = (params.filePattern as string) || '*.{ts,tsx,js,jsx,vue,py,go}';
      const { execSync } = await import('node:child_process');
      // 优先使用 ripgrep
      let output: string;
      try {
        output = execSync(`rg --no-heading -l "${query.replace(/"/g, '\\"')}" --iglob "${filePattern}" -g '!node_modules' -g '!dist' -g '!.git' --max-count=3 .`, {
          cwd: context.workspace, encoding: 'utf-8', timeout: 15000,
        });
      } catch (err) {
        // rg 不可用，fallback 到 grep
        const { GrepTool } = await import('./SearchTools.js');
        const result = await GrepTool.execute({ pattern: `import.*${query}`, glob: filePattern }, context);
        return result;
      }
      const files = output.trim().split('\n').filter(Boolean);
      return {
        success: true,
        content: files.length > 0
          ? `找到 ${files.length} 个文件导入了 "${query}":\n${files.map((f, i) => `  ${i + 1}. ${f}`).join('\n')}`
          : `未找到导入 "${query}" 的文件`,
        metadata: { filesFound: files.length },
      };
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      return { success: false, content: `查找导入失败: ${msg}`, error: msg };
    }
  },
};

/**
 * 查找定义工具
 * 搜索代码中的函数/类/变量定义
 */
export const FindDefinitionsTool: ITool = {
  name: 'find_definitions',
  description: '搜索代码中的函数、类、变量等定义位置。使用正则或grep查找定义语法。',
  requiresConfirm: false,
  parameters: {
    type: 'object',
    properties: {
      symbol: { type: 'string', description: '要搜索的符号名称' },
      kind: { type: 'string', description: '可选: function/class/variable/interface/enum, 不指定则搜索所有' },
      language: { type: 'string', description: '可选: typescript/javascript/python/go/rust, 帮助匹配语法' },
    },
    required: ['symbol'],
  },
  async execute(params, context): Promise<ToolResult> {
    try {
      const symbol = params.symbol as string;
      const kind = (params.kind as string) || '';
      const lang = (params.language as string) || 'typescript';
      // 根据语言和类型构造正则
      const patterns: Record<string, Record<string, string>> = {
        typescript: { function: `function\\s+${symbol}`, class: `class\\s+${symbol}`, interface: `interface\\s+${symbol}`, type: `type\\s+${symbol}`, variable: `(const|let|var)\\s+${symbol}` },
        python: { function: `def\\s+${symbol}`, class: `class\\s+${symbol}` },
        go: { function: `func\\s+${symbol}`, type: `type\\s+${symbol}` },
      };
      const langPatterns = patterns[lang] || patterns['typescript'];
      const pattern = kind ? langPatterns[kind] : Object.values(langPatterns).join('|');
      if (!pattern) {
        return { success: false, content: `不支持的语言或类型: ${lang}/${kind}` };
      }
      const { execSync } = await import('node:child_process');
      let output: string;
      try {
        output = execSync(`rg --no-heading -n "${pattern}" -g '!node_modules' -g '!dist' -g '!.git' .`, {
          cwd: context.workspace, encoding: 'utf-8', timeout: 15000, maxBuffer: 1024 * 512,
        });
      } catch (err) {
        return { success: true, content: `未找到 "${symbol}" 的定义`, metadata: { found: 0 } };
      }
      const lines = output.trim().split('\n').filter(Boolean);
      return {
        success: true,
        content: `找到 ${lines.length} 处 "${symbol}" 的${kind || '定义'}:\n${lines.slice(0, 20).join('\n')}${lines.length > 20 ? `\n... 还有 ${lines.length - 20} 处结果` : ''}`,
        metadata: { found: lines.length, pattern },
      };
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      return { success: false, content: `查找定义失败: ${msg}`, error: msg };
    }
  },
};

/** 代码分析工具集 */
export const CodeTools = [CodeStatsTool, RunTestsTool, FindImportsTool, FindDefinitionsTool];
