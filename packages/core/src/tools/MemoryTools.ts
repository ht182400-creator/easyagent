/**
 * 记忆/知识库工具集
 * 支持会话级别的记忆存取，便于跨轮次上下文保持
 */
import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
  readdirSync,
  unlinkSync,
} from 'node:fs';
import { resolve, join } from 'node:path';
import type { ITool } from './ToolRegistry.js';
import type { ToolResult, ToolContext } from '../types/index.js';

/** 获取记忆存储目录 */
function getMemoryDir(workspace: string): string {
  const dir = resolve(workspace, '.easyagent', 'memory');
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  return dir;
}

/**
 * 存储记忆工具
 * 将信息持久化到工作区的 .easyagent/memory 目录
 */
export const RememberTool: ITool = {
  name: 'remember',
  description: '持久化存储一条信息到工作区记忆库。适合保存决策、约定、用户偏好等长期信息。',
  requiresConfirm: false,
  parameters: {
    type: 'object',
    properties: {
      key: { type: 'string', description: '记忆的键名/标识符(用于检索)' },
      content: { type: 'string', description: '要存储的内容' },
      category: {
        type: 'string',
        description: '可选: 分类标签, 如 convention/preference/decision/fact',
      },
    },
    required: ['key', 'content'],
  },
  async execute(params, context): Promise<ToolResult> {
    try {
      const memDir = getMemoryDir(context.workspace);
      const key = (params.key as string).replace(/[^a-zA-Z0-9_\-]/g, '_');
      const content = params.content as string;
      const category = (params.category as string) || 'general';
      const filePath = join(memDir, `${category}_${key}.md`);

      const timestamp = new Date().toISOString();
      const entry = `# ${key}\n\n> 分类: ${category}\n> 时间: ${timestamp}\n\n${content}\n`;
      writeFileSync(filePath, entry, 'utf-8');

      return { success: true, content: `已存储记忆: ${key} (分类: ${category})` };
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      return { success: false, content: `存储记忆失败: ${msg}`, error: msg };
    }
  },
};

/**
 * 检索记忆工具
 * 从工作区记忆库中检索信息
 */
export const RecallTool: ITool = {
  name: 'recall',
  description: '从工作区记忆库中检索之前存储的信息。按 key 精确查找或列出所有记忆。',
  requiresConfirm: false,
  parameters: {
    type: 'object',
    properties: {
      key: { type: 'string', description: '要检索的记忆键名, 不指定则列出所有记忆标题' },
      category: { type: 'string', description: '可选: 按分类筛选' },
    },
    required: [],
  },
  async execute(params, context): Promise<ToolResult> {
    try {
      const memDir = getMemoryDir(context.workspace);

      if (params.key) {
        const key = (params.key as string).replace(/[^a-zA-Z0-9_\-]/g, '_');
        const category = (params.category as string) || '';
        // 寻找匹配文件
        const files = readdirSync(memDir).filter(
          (f) => f.includes(key) && (category ? f.includes(category) : true),
        );
        if (files.length === 0) {
          return { success: true, content: `未找到记忆: ${key}` };
        }
        const contents = files.map((f) => readFileSync(join(memDir, f), 'utf-8')).join('\n---\n');
        return { success: true, content: contents };
      }

      // 列出所有记忆
      const files = readdirSync(memDir)
        .filter((f) => f.endsWith('.md'))
        .filter((f) => !params.category || f.includes(params.category as string));
      if (files.length === 0) {
        return { success: true, content: '记忆库为空' };
      }
      const titles = files.map((f) => {
        const content = readFileSync(join(memDir, f), 'utf-8');
        const firstLine =
          content
            .split('\n')
            .find((l) => l.startsWith('# '))
            ?.replace('# ', '') || f;
        const category = content.match(/> 分类: (\w+)/)?.[1] || 'general';
        return `  [${category}] ${firstLine} (${f})`;
      });

      return {
        success: true,
        content: `记忆库 (${files.length}条):\n${titles.join('\n')}\n\n使用 key 参数检索指定记忆内容`,
      };
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      return { success: false, content: `检索记忆失败: ${msg}`, error: msg };
    }
  },
};

/**
 * 忘记记忆工具
 */
export const ForgetTool: ITool = {
  name: 'forget',
  description: '从记忆库中删除指定的记忆条目。',
  requiresConfirm: true,
  parameters: {
    type: 'object',
    properties: {
      key: { type: 'string', description: '要删除的记忆键名' },
    },
    required: ['key'],
  },
  async execute(params, context): Promise<ToolResult> {
    try {
      const memDir = getMemoryDir(context.workspace);
      const key = (params.key as string).replace(/[^a-zA-Z0-9_\-]/g, '_');
      const files = readdirSync(memDir).filter((f) => f.includes(key));
      if (files.length === 0) {
        return { success: false, content: `未找到记忆: ${key}` };
      }
      files.forEach((f) => unlinkSync(join(memDir, f)));
      return { success: true, content: `已删除 ${files.length} 条记忆: ${key}` };
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      return { success: false, content: `删除记忆失败: ${msg}`, error: msg };
    }
  },
};

/** 记忆/知识库工具集 */
export const MemoryTools = [RememberTool, RecallTool, ForgetTool];
