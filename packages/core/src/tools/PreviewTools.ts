/**
 * 预览与交互工具集
 * 提供本地服务器启动、URL预览、用户交互确认等功能
 */
import { execSync, spawn, ChildProcess } from 'node:child_process';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { networkInterfaces } from 'node:os';
import type { ITool } from './ToolRegistry.js';
import type { ToolResult, ToolContext } from '../types/index.js';
import { logger } from '../utils/logger.js';

/** 活跃的服务器进程引用 */
let activeServer: ChildProcess | null = null;

/**
 * 获取本地IP地址
 */
function getLocalIP(): string {
  const nets = networkInterfaces();
  for (const name of Object.keys(nets)) {
    for (const net of nets[name] || []) {
      if (net.family === 'IPv4' && !net.internal) {
        return net.address;
      }
    }
  }
  return '127.0.0.1';
}

/**
 * 检测端口是否被占用
 */
function isPortAvailable(port: number): boolean {
  try {
    const net = require('node:net');
    return new Promise<boolean>((res) => {
      const server = net.createServer();
      server.once('error', () => res(false));
      server.once('listening', () => {
        server.close();
        res(true);
      });
      server.listen(port, '127.0.0.1');
    }) as unknown as boolean;
  } catch (err) {
    return true; // 乐观假设可用
  }
}

/**
 * 启动本地开发服务器工具
 * 自动检测项目类型并启动开发服务器
 */
export const StartServerTool: ITool = {
  name: 'start_server',
  description: '启动本地开发服务器。自动检测项目类型(Vite/Next.js/Express等)并使用合适的启动命令。',
  requiresConfirm: true,
  parameters: {
    type: 'object',
    properties: {
      port: { type: 'number', description: '指定端口号, 默认自动选择(3000-3999)' },
      command: { type: 'string', description: '自定义启动命令, 覆盖自动检测' },
      cwd: { type: 'string', description: '工作子目录(相对于工作区), 默认工作区根目录' },
    },
    required: [],
  },
  async execute(params, context): Promise<ToolResult> {
    try {
      // 停止已有服务器
      if (activeServer) {
        activeServer.kill('SIGTERM');
        activeServer = null;
      }

      const ws = context.workspace;
      const cwd = params.cwd ? resolve(ws, params.cwd as string) : ws;
      const port = (params.port as number) || 3000;

      let command = params.command as string | undefined;

      // 自动检测
      if (!command) {
        if (existsSync(resolve(cwd, 'package.json'))) {
          const pkg = JSON.parse(
            require('node:fs').readFileSync(resolve(cwd, 'package.json'), 'utf-8'),
          );
          if (pkg.scripts?.dev) {
            command = `npm run dev -- --port ${port}`;
          } else if (pkg.scripts?.start) {
            command = `npm start -- --port ${port}`;
          }
        }
        if (!command && existsSync(resolve(cwd, 'index.html'))) {
          command = `npx serve . -l ${port} --no-clipboard`;
        }
        if (
          (!command && existsSync(resolve(cwd, 'main.py'))) ||
          existsSync(resolve(cwd, 'app.py'))
        ) {
          command = `python -m http.server ${port}`;
        }
        if (!command) {
          return { success: false, content: '无法自动检测启动命令。请使用 command 参数指定。' };
        }
      }

      // 设置环境变量中的端口
      const env = { ...process.env, PORT: String(port) };

      const serverProcess = spawn(command, [], {
        cwd,
        shell: true,
        env,
        stdio: 'pipe',
        windowsHide: true,
      });

      activeServer = serverProcess;

      // 收集启动日志
      let startupLog = '';
      const timeout = setTimeout(() => {
        if (activeServer === serverProcess) {
          startupLog += '\n(服务器仍在启动中...)';
        }
      }, 5000);

      serverProcess.stdout?.on('data', (data: Buffer) => {
        startupLog += data.toString().slice(0, 1000);
      });

      serverProcess.stderr?.on('data', (data: Buffer) => {
        startupLog += data.toString().slice(0, 500);
      });

      serverProcess.on('exit', (code) => {
        if (activeServer === serverProcess) {
          activeServer = null;
          logger.info({ code }, '服务器进程退出');
        }
      });

      const localIP = getLocalIP();

      return {
        success: true,
        content: [
          `🚀 开发服务器已启动`,
          ``,
          `本地访问: http://localhost:${port}`,
          `网络访问: http://${localIP}:${port}`,
          ``,
          `启动日志:`,
          startupLog || '(等待输出...)',
        ].join('\n'),
        metadata: {
          port,
          localURL: `http://localhost:${port}`,
          networkURL: `http://${localIP}:${port}`,
          command,
          cwd,
        },
      };
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      return { success: false, content: `启动服务器失败: ${msg}`, error: msg };
    }
  },
};

/**
 * 预览URL工具
 * 在IDE内置浏览器中打开URL预览
 */
export const PreviewURLTool: ITool = {
  name: 'preview_url',
  description: '在IDE内置浏览器中预览指定的HTTP/HTTPS URL。适用于查看Web应用、HTML页面等。',
  requiresConfirm: false,
  parameters: {
    type: 'object',
    properties: {
      url: { type: 'string', description: '要预览的完整HTTP/HTTPS URL' },
    },
    required: ['url'],
  },
  async execute(params, context): Promise<ToolResult> {
    try {
      const url = params.url as string;

      // URL格式验证
      try {
        const parsed = new URL(url);
        if (!['http:', 'https:'].includes(parsed.protocol)) {
          return {
            success: false,
            content: `不支持的协议: ${parsed.protocol}。仅支持 HTTP/HTTPS。`,
          };
        }
      } catch (err) {
        return { success: false, content: `无效的URL: ${url}。请提供完整的HTTP/HTTPS URL。` };
      }

      // 尝试打开浏览器（跨平台）
      const platform = process.platform;
      let openCmd: string;
      if (platform === 'win32') {
        openCmd = `start "" "${url}"`;
      } else if (platform === 'darwin') {
        openCmd = `open "${url}"`;
      } else {
        openCmd = `xdg-open "${url}"`;
      }

      try {
        execSync(openCmd, { timeout: 5000, stdio: 'ignore' });
      } catch (err) {
        // 在IDE环境中可能没有图形界面浏览器，静默忽略
      }

      return {
        success: true,
        content: `🔗 已在浏览器中打开: ${url}`,
        metadata: { url },
      };
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      return { success: false, content: `打开URL失败: ${msg}`, error: msg };
    }
  },
};

/**
 * 比较两个文件差异工具
 * 输出 unified diff 格式的差异
 */
export const DiffFilesTool: ITool = {
  name: 'diff_files',
  description: '比较两个文件的差异，输出 unified diff 格式。可用于代码审查、版本对比。',
  requiresConfirm: false,
  parameters: {
    type: 'object',
    properties: {
      filePath1: { type: 'string', description: '第一个文件路径(相对于工作区)' },
      filePath2: { type: 'string', description: '第二个文件路径(相对于工作区)' },
    },
    required: ['filePath1', 'filePath2'],
  },
  async execute(params, context): Promise<ToolResult> {
    try {
      const ws = context.workspace;
      const file1 = params.filePath1 as string;
      const file2 = params.filePath2 as string;

      const { readFileSync } = await import('node:fs');

      const content1 = readFileSync(resolve(ws, file1), 'utf-8');
      const content2 = readFileSync(resolve(ws, file2), 'utf-8');

      // 简单的行级diff实现
      const lines1 = content1.split('\n');
      const lines2 = content2.split('\n');
      const maxLen = Math.max(lines1.length, lines2.length);

      const diffLines: string[] = [];
      diffLines.push(`--- ${file1}`);
      diffLines.push(`+++ ${file2}`);

      // 查找差异块
      let i = 0;
      while (i < maxLen) {
        if (i < lines1.length && i < lines2.length) {
          if (lines1[i] !== lines2[i]) {
            // 找到差异块的开始
            const blockStart = Math.max(0, i - 2);
            diffLines.push(
              `@@ -${blockStart + 1},${Math.min(10, lines1.length - blockStart)} +${blockStart + 1},${Math.min(10, lines2.length - blockStart)} @@`,
            );
            for (let j = blockStart; j < Math.min(i + 5, maxLen); j++) {
              if (j >= lines1.length && j >= lines2.length) break;
              if (j >= lines1.length) {
                diffLines.push(`+${lines2[j]}`);
              } else if (j >= lines2.length) {
                diffLines.push(`-${lines1[j]}`);
              } else if (lines1[j] !== lines2[j]) {
                diffLines.push(`-${lines1[j]}`);
                diffLines.push(`+${lines2[j]}`);
              } else {
                diffLines.push(` ${lines1[j]}`);
              }
            }
            i = Math.min(i + 5, maxLen);
          }
        } else if (i >= lines1.length) {
          diffLines.push(`+${lines2[i]}`);
        } else {
          diffLines.push(`-${lines1[i]}`);
        }
        i++;
      }

      const diff = diffLines.slice(0, 200).join('\n');
      return {
        success: true,
        content: diff || '两个文件内容完全相同。',
        metadata: {
          file1,
          file2,
          lines1: lines1.length,
          lines2: lines2.length,
        },
      };
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      return { success: false, content: `比较文件失败: ${msg}`, error: msg };
    }
  },
};

/**
 * 向用户提问确认工具
 * 当Agent需要用户决策时使用
 */
export const AskUserTool: ITool = {
  name: 'ask_user',
  description: '当Agent需要用户做出决策、选择或确认时，向用户提出结构化的多选或确认问题。',
  requiresConfirm: false,
  parameters: {
    type: 'object',
    properties: {
      question: { type: 'string', description: '向用户提出的问题' },
      options: {
        type: 'array',
        items: { type: 'string', description: '选项' },
        description: '可选项列表，如 ["方案A", "方案B", "方案C"]。不提供则为确认型问题。',
      },
      title: { type: 'string', description: '可选: 问题标题' },
      multiSelect: { type: 'boolean', description: '是否允许多选, 默认false' },
    },
    required: ['question'],
  },
  async execute(params, context): Promise<ToolResult> {
    const question = params.question as string;
    const options = params.options as string[] | undefined;
    const title = params.title as string | undefined;
    const multiSelect = (params.multiSelect as boolean) || false;

    if (options && options.length > 0) {
      const optList = options.map((o, i) => `  ${i + 1}. ${o}`).join('\n');
      return {
        success: true,
        content: [
          title ? `📋 ${title}\n` : '📋 请选择:',
          question,
          '',
          optList,
          multiSelect ? '\n(可多选，输入序号如: 1,3,4)' : '\n(请回复序号或选项名称)',
        ].join('\n'),
        metadata: { question, options, multiSelect },
      };
    }

    return {
      success: true,
      content: ['❓ 请确认:', question, '', '(回复 "是/确认/yes" 或 "否/取消/no")'].join('\n'),
      metadata: { question, type: 'confirm' },
    };
  },
};

/** 预览与交互工具集 */
export const PreviewTools = [StartServerTool, PreviewURLTool, DiffFilesTool, AskUserTool];
