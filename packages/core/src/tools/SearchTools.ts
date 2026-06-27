/**
 * 搜索匹配工具集
 * 提供grep(内容搜索)、glob(文件名匹配)、web搜索等功能
 */
import { execSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { resolve, relative } from 'node:path';
import type { ITool } from './ToolRegistry.js';
import type { ToolResult } from '../types/index.js';
import { logger } from '../utils/logger.js';

/**
 * 搜索/匹配工具 (Grep)
 * 使用ripgrep(rg)或回退到Node.js实现
 */
export const GrepTool: ITool = {
  name: 'grep',
  description:
    '在文件中搜索匹配的文本模式。支持正则表达式。搜索速度非常快，适用于在大型代码库中查找代码。',
  requiresConfirm: false,
  parameters: {
    type: 'object',
    properties: {
      pattern: {
        type: 'string',
        description: '搜索的正则表达式模式',
      },
      path: {
        type: 'string',
        description: '搜索路径(相对于工作区)，默认为工作区根目录',
      },
      include: {
        type: 'string',
        description: '包含的文件glob模式，如 "*.ts"',
      },
      caseSensitive: {
        type: 'boolean',
        description: '是否区分大小写，默认false',
      },
      outputMode: {
        type: 'string',
        enum: ['content', 'files_with_matches', 'count'],
        description: '输出模式',
      },
    },
    required: ['pattern'],
  },
  async execute(params, context): Promise<ToolResult> {
    try {
      const pattern = params.pattern as string;
      const searchPath = resolve(context.workspace, (params.path as string) || '.');
      const caseSensitive = (params.caseSensitive as boolean) || false;
      const outputMode = (params.outputMode as string) || 'content';

      // 尝试使用ripgrep
      let useRg = false;
      try {
        execSync('rg --version', { stdio: 'ignore' });
        useRg = true;
      } catch (err) {
        // 回退到Node.js实现
      }

      if (useRg) {
        const args = ['--no-heading', '--with-filename', '--line-number', '--color=never'];
        if (!caseSensitive) args.push('-i');

        if (params.include) {
          args.push('-g', params.include as string);
        }

        if (outputMode === 'files_with_matches') {
          args.push('-l');
        } else if (outputMode === 'count') {
          args.push('-c');
        }

        args.push('--', pattern, searchPath);

        try {
          const result = execSync(`rg ${args.join(' ')}`, {
            encoding: 'utf-8',
            maxBuffer: 10 * 1024 * 1024,
            cwd: context.workspace,
            timeout: 30000,
          });

          const trimmed = result.trim();
          return {
            success: true,
            content: trimmed || '未找到匹配结果',
            metadata: {
              tool: 'ripgrep',
              matchCount: trimmed ? trimmed.split('\n').length : 0,
            },
          };
        } catch (error) {
          // rg 退出码1表示无匹配
          if ((error as { status?: number }).status === 1) {
            return { success: true, content: '未找到匹配结果' };
          }
          throw error;
        }
      }

      // Node.js 回退实现
      const { readFileSync, readdirSync, statSync } = await import('node:fs');
      const { join, extname } = await import('node:path');

      const results: string[] = [];
      const regex = new RegExp(pattern, caseSensitive ? 'g' : 'gi');
      const includePattern = params.include as string;

      function searchDir(dir: string): void {
        if (!existsSync(dir)) return;
        const entries = readdirSync(dir);
        for (const entry of entries) {
          const fullPath = join(dir, entry);
          try {
            const stat = statSync(fullPath);
            if (stat.isDirectory()) {
              if (!entry.startsWith('.') && entry !== 'node_modules') {
                searchDir(fullPath);
              }
            } else if (stat.isFile()) {
              if (includePattern) {
                // 简单的glob匹配
                const ext = extname(entry);
                if (!includePattern.includes(ext) && !includePattern.includes('*')) continue;
              }
              const content = readFileSync(fullPath, 'utf-8');
              const lines = content.split('\n');
              for (let i = 0; i < lines.length; i++) {
                if (regex.test(lines[i])) {
                  // 重置regex的lastIndex
                  regex.lastIndex = 0;
                  const relPath = relative(context.workspace, fullPath);
                  if (outputMode === 'files_with_matches') {
                    results.push(relPath);
                    break;
                  } else {
                    results.push(`${relPath}:${i + 1}: ${lines[i].trim()}`);
                  }
                }
              }
            }
          } catch (err) {
            // 跳过无法读取的文件
          }
        }
      }

      searchDir(searchPath);

      return {
        success: true,
        content: results.join('\n') || '未找到匹配结果',
        metadata: {
          tool: 'nodejs-grep',
          matchCount: results.length,
        },
      };
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      return { success: false, content: `搜索失败: ${msg}`, error: msg };
    }
  },
};

/**
 * 文件匹配工具 (Glob)
 */
export const GlobTool: ITool = {
  name: 'glob',
  description: '使用glob模式匹配文件名。例如"src/** /*.ts"匹配所有TypeScript文件。',
  requiresConfirm: false,
  parameters: {
    type: 'object',
    properties: {
      pattern: {
        type: 'string',
        description: 'Glob匹配模式',
      },
      path: {
        type: 'string',
        description: '搜索起始目录(相对于工作区)',
      },
    },
    required: ['pattern'],
  },
  async execute(params, context): Promise<ToolResult> {
    try {
      const pattern = params.pattern as string;
      const searchPath = resolve(context.workspace, (params.path as string) || '.');

      // 使用系统find命令
      const isWindows = process.platform === 'win32';

      // 将glob转换为简单的find模式
      let cmd: string;
      if (isWindows) {
        cmd = `Get-ChildItem -Path "${searchPath}" -Recurse -Filter "${pattern.replace('**/', '')}" | Select-Object -ExpandProperty FullName`;
        cmd = `powershell -Command "${cmd}"`;
      } else {
        const findPattern = pattern.replace(/\*\*\/?/g, '').replace(/\*/g, '*');
        cmd = `find "${searchPath}" -name "${findPattern}" -type f 2>/dev/null`;
      }

      const result = execSync(cmd, {
        encoding: 'utf-8',
        maxBuffer: 10 * 1024 * 1024,
        timeout: 10000,
      });

      const files = result
        .trim()
        .split('\n')
        .filter(Boolean)
        .map((f) => relative(context.workspace, f.trim()))
        .join('\n');

      return {
        success: true,
        content: files || '未找到匹配的文件',
        metadata: {
          count: files ? files.split('\n').length : 0,
        },
      };
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      return { success: false, content: `文件匹配失败: ${msg}`, error: msg };
    }
  },
};

/**
 * 网络搜索工具
 */
export const WebSearchTool: ITool = {
  name: 'web_search',
  description: '使用搜索引擎搜索网页。适用于查找最新文档、API参考或解决方案。',
  requiresConfirm: false,
  parameters: {
    type: 'object',
    properties: {
      query: {
        type: 'string',
        description: '搜索查询字符串',
      },
      maxResults: {
        type: 'number',
        description: '最大返回结果数，默认5',
      },
    },
    required: ['query'],
  },
  async execute(params, context): Promise<ToolResult> {
    try {
      const query = params.query as string;
      const maxResults = (params.maxResults as number) || 5;

      // 使用DuckDuckGo (免费，无API Key)
      const url = `https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_html=1`;

      const response = await fetch(url, {
        headers: { 'User-Agent': 'EasyAgent/1.0' },
        signal: context.signal,
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const data = (await response.json()) as {
        AbstractText?: string;
        AbstractURL?: string;
        RelatedTopics?: Array<{ Text: string; FirstURL: string }>;
      };

      let result = '';
      if (data.AbstractText) {
        result += `摘要: ${data.AbstractText}\n`;
        if (data.AbstractURL) {
          result += `来源: ${data.AbstractURL}\n\n`;
        }
      }

      if (data.RelatedTopics) {
        result += '相关结果:\n';
        for (const topic of data.RelatedTopics.slice(0, maxResults)) {
          if (topic.Text) {
            result += `- ${topic.Text}\n  链接: ${topic.FirstURL}\n\n`;
          }
        }
      }

      return {
        success: true,
        content: result || `未找到 "${query}" 的相关结果`,
      };
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      logger.error({ error: msg }, '网络搜索失败');
      return {
        success: true,
        content: `网络搜索暂时不可用: ${msg}。建议在网络正常后重试。`,
      };
    }
  },
};

/**
 * 网络抓取工具
 */
export const WebFetchTool: ITool = {
  name: 'web_fetch',
  description: '抓取网页内容并以Markdown格式返回。适用于读取API文档、博客文章等。',
  requiresConfirm: false,
  parameters: {
    type: 'object',
    properties: {
      url: {
        type: 'string',
        description: '要抓取的URL地址',
      },
      fetchInfo: {
        type: 'string',
        description: '描述你想从页面中提取什么信息',
      },
    },
    required: ['url', 'fetchInfo'],
  },
  async execute(params, context): Promise<ToolResult> {
    try {
      const url = params.url as string;
      const fetchInfo = params.fetchInfo as string;

      // 验证URL格式
      try {
        new URL(url);
      } catch (err) {
        return { success: false, content: `无效的URL: ${url}` };
      }

      const response = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; EasyAgent/1.0)',
          Accept: 'text/html,application/xhtml+xml',
        },
        signal: context.signal,
        redirect: 'follow',
      });

      if (!response.ok) {
        return { success: false, content: `HTTP ${response.status}: 无法获取页面内容` };
      }

      const html = await response.text();

      // 简单的HTML到文本转换
      const text = html
        .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
        .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
        .replace(/<[^>]+>/g, '\n')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/\n{3,}/g, '\n\n')
        .trim()
        .substring(0, 10000);

      return {
        success: true,
        content: `页面内容 (用于提取 "${fetchInfo}"):\n\n${text}`,
        metadata: {
          url,
          contentLength: text.length,
        },
      };
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      return { success: false, content: `网页抓取失败: ${msg}`, error: msg };
    }
  },
};

/** 搜索相关工具 */
export const SearchTools = [GrepTool, GlobTool, WebSearchTool, WebFetchTool];
