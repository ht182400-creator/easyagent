/**
 * 代码质量工具集
 * 提供代码检查、格式化、Lint、类型检查等代码质量保障操作
 */
import { execSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { resolve, relative } from 'node:path';
import type { ITool } from './ToolRegistry.js';
import type { ToolResult, ToolContext } from '../types/index.js';

/** 安全路径验证 */
function safePath(workspace: string, targetPath: string): string {
  const resolved = resolve(workspace, targetPath);
  if (!resolved.startsWith(resolve(workspace))) {
    throw new Error(`安全限制: 无法访问工作区外的路径 "${targetPath}"`);
  }
  return resolved;
}

/**
 * Lint检查工具
 * 自动检测项目类型并运行对应的Linter
 */
export const LintCodeTool: ITool = {
  name: 'lint_code',
  description: '对指定文件或整个项目运行Lint检查。自动检测项目类型并使用对应工具(ESLint/Pylint/golangci-lint等)。',
  requiresConfirm: false,
  parameters: {
    type: 'object',
    properties: {
      filePath: { type: 'string', description: '可选: 指定要检查的文件路径(相对于工作区), 不指定则检查整个项目' },
      fix: { type: 'boolean', description: '是否自动修复可修复的问题, 默认false' },
    },
    required: [],
  },
  async execute(params, context): Promise<ToolResult> {
    try {
      const ws = context.workspace;
      const filePath = params.filePath as string | undefined;
      const fix = (params.fix as boolean) || false;

      // 检测项目类型并确定Lint命令
      let command = '';
      if (existsSync(resolve(ws, 'package.json'))) {
        // 检查是否配置了 lint 脚本
        try {
          const pkg = JSON.parse(require('node:fs').readFileSync(resolve(ws, 'package.json'), 'utf-8'));
          if (pkg.scripts?.lint) {
            command = 'npm run lint';
          } else if (existsSync(resolve(ws, '.eslintrc.js')) || existsSync(resolve(ws, '.eslintrc.json')) || existsSync(resolve(ws, 'eslint.config.js'))) {
            command = 'npx eslint';
            if (fix) command += ' --fix';
          }
        } catch { /* ignore */ }
      }

      if (!command && existsSync(resolve(ws, 'pyproject.toml')) || existsSync(resolve(ws, '.pylintrc'))) {
        command = fix ? 'python -m black . && python -m pylint' : 'python -m pylint';
      }

      if (!command && existsSync(resolve(ws, 'go.mod'))) {
        command = 'golangci-lint run';
        if (fix) command += ' --fix';
      }

      if (!command) {
        return { success: false, content: '未检测到支持的Lint工具。请确认项目已配置 ESLint/Pylint/golangci-lint。' };
      }

      if (filePath) {
        command += ` "${relative(ws, safePath(ws, filePath))}"`;
      }

      const output = execSync(command, {
        cwd: ws,
        encoding: 'utf-8',
        timeout: 60000,
        maxBuffer: 1024 * 1024 * 2,
      });

      const trimmed = output.trim();
      return {
        success: true,
        content: trimmed || '✅ 没有发现Lint问题！',
        metadata: { command, hadIssues: trimmed.length > 0 },
      };
    } catch (error: any) {
      // Lint失败通常表示发现了问题 —— 这是预期的
      const output = error.stdout || error.stderr || error.message || String(error);
      const filtered = output
        .split('\n')
        .filter((line: string) => !line.includes('npm ERR!') && !line.includes('npm notice'))
        .join('\n')
        .slice(0, 5000);

      return {
        success: true,
        content: filtered || `Lint检查发现问题（退出码: ${error.status}）`,
        metadata: { exitCode: error.status, hadIssues: true },
      };
    }
  },
};

/**
 * 代码格式化工具
 * 自动检测项目类型并运行格式化工具
 */
export const FormatCodeTool: ITool = {
  name: 'format_code',
  description: '使用Prettier/Black/gofmt等工具格式化代码。自动检测项目类型并使用合适的格式化工具。',
  requiresConfirm: false,
  parameters: {
    type: 'object',
    properties: {
      filePath: { type: 'string', description: '可选: 指定要格式化的文件路径(相对于工作区), 不指定则格式化整个项目' },
      check: { type: 'boolean', description: '仅检查不修改(check模式), 默认false' },
    },
    required: [],
  },
  async execute(params, context): Promise<ToolResult> {
    const ws = context.workspace;
    const filePath = params.filePath as string | undefined;
    const check = (params.check as boolean) || false;
    try {

      let command = '';
      if (existsSync(resolve(ws, 'package.json'))) {
        // 优先使用项目配置的 format 脚本
        try {
          const pkg = JSON.parse(require('node:fs').readFileSync(resolve(ws, 'package.json'), 'utf-8'));
          if (pkg.scripts?.format) {
            command = 'npm run format';
          }
        } catch { /* ignore */ }
        if (!command) {
          command = 'npx prettier --write';
          if (check) command = 'npx prettier --check';
        }
      }

      if (!command && (existsSync(resolve(ws, 'pyproject.toml')) || existsSync(resolve(ws, 'requirements.txt')))) {
        command = check ? 'python -m black --check .' : 'python -m black .';
      }

      if (!command && existsSync(resolve(ws, 'go.mod'))) {
        command = check ? 'gofmt -l .' : 'gofmt -w .';
      }

      if (!command) {
        return { success: false, content: '未检测到支持的格式化工具。请安装 Prettier/Black/gofmt。' };
      }

      if (filePath) {
        command += ` "${relative(ws, safePath(ws, filePath))}"`;
      } else {
        command += ' .';
      }

      const output = execSync(command, {
        cwd: ws,
        encoding: 'utf-8',
        timeout: 60000,
        maxBuffer: 1024 * 1024 * 2,
      });

      const trimmed = output.trim();
      return {
        success: true,
        content: trimmed || '✅ 代码格式正确，无需修改。',
        metadata: { command, modified: check ? trimmed.length > 0 : true },
      };
    } catch (error: any) {
      const output = error.stdout || error.stderr || error.message || String(error);
      return {
        success: check ? true : false,
        content: check
          ? `代码格式不符合规范:\n${output.slice(0, 3000)}`
          : `格式化失败:\n${output.slice(0, 3000)}`,
        error: check ? undefined : 'FORMAT_FAILED',
        metadata: { exitCode: error.status },
      };
    }
  },
};

/**
 * 读取Linter诊断信息
 * 获取文件的LSP诊断信息(错误/警告/提示)
 */
export const ReadLintsTool: ITool = {
  name: 'read_lints',
  description: '读取并显示文件或项目的Linter/编译器诊断信息（错误、警告、提示）。帮助快速定位代码问题。',
  requiresConfirm: false,
  parameters: {
    type: 'object',
    properties: {
      paths: { type: 'string', description: '可选: 文件或目录路径(相对于工作区), 不指定则返回所有文件的诊断' },
    },
    required: [],
  },
  async execute(params, context): Promise<ToolResult> {
    try {
      // 此工具依赖 IDE 的 LSP 诊断信息，在纯 CLI 环境下使用 lint_code
      // 使用 TypeScript 编译器进行类型检查作为回退
      const ws = context.workspace;

      if (!existsSync(resolve(ws, 'tsconfig.json'))) {
        return {
          success: true,
          content: '未找到 tsconfig.json，无法进行类型检查。对于非 TypeScript 项目，请使用 lint_code 工具。',
        };
      }

      try {
        const output = execSync('npx tsc --noEmit 2>&1', {
          cwd: ws,
          encoding: 'utf-8',
          timeout: 120000,
          maxBuffer: 1024 * 1024 * 5,
        });

        const errorLines = output.trim().split('\n').filter(l => l.includes('error TS'));
        if (errorLines.length === 0) {
          return { success: true, content: '✅ 没有类型错误。' };
        }

        return {
          success: true,
          content: `类型检查发现 ${errorLines.length} 个错误:\n\n${errorLines.slice(0, 50).join('\n')}${errorLines.length > 50 ? `\n... 还有 ${errorLines.length - 50} 个错误` : ''}`,
          metadata: { errorCount: errorLines.length },
        };
      } catch (error: any) {
        const output = error.stdout || error.stderr || error.message || '';
        const lines = output.split('\n').filter((l: string) => l.includes('error TS'));
        return {
          success: true,
          content: `类型检查发现 ${lines.length} 个错误:\n\n${lines.slice(0, 50).join('\n')}${lines.length > 50 ? `\n... 还有 ${lines.length - 50} 个错误` : ''}`,
          metadata: { errorCount: lines.length },
        };
      }
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      return { success: false, content: `诊断读取失败: ${msg}`, error: msg };
    }
  },
};

/**
 * 类型检查工具
 * 针对TypeScript项目运行类型检查
 */
export const TypeCheckTool: ITool = {
  name: 'type_check',
  description: '对TypeScript项目运行类型检查(tsc --noEmit)。发现类型错误和类型不一致问题。',
  requiresConfirm: false,
  parameters: {
    type: 'object',
    properties: {
      project: { type: 'string', description: '可选: tsconfig.json路径(相对于工作区), 默认使用根目录的tsconfig.json' },
    },
    required: [],
  },
  async execute(params, context): Promise<ToolResult> {
    try {
      const ws = context.workspace;
      const project = params.project as string | undefined;

      if (!existsSync(resolve(ws, project || 'tsconfig.json'))) {
        return { success: false, content: '未找到 tsconfig.json，无法进行TypeScript类型检查。' };
      }

      let command = 'npx tsc --noEmit';
      if (project) command += ` -p "${project}"`;

      try {
        const output = execSync(command, {
          cwd: ws,
          encoding: 'utf-8',
          timeout: 120000,
          maxBuffer: 1024 * 1024 * 5,
        });
        return { success: true, content: '✅ 类型检查通过，没有类型错误。' };
      } catch (error: any) {
        const output = (error.stdout || error.stderr || '').slice(0, 5000);
        return { success: true, content: `❌ 类型检查发现错误:\n\n${output}` };
      }
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      return { success: false, content: `类型检查失败: ${msg}`, error: msg };
    }
  },
};

/** 代码质量工具集 */
export const QualityTools = [LintCodeTool, FormatCodeTool, ReadLintsTool, TypeCheckTool];
