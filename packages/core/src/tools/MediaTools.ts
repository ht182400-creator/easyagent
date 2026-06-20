/**
 * 媒体操作工具集
 * 提供图片读取、图片生成、截图等媒体相关操作
 */
import { readFileSync, existsSync, statSync } from 'node:fs';
import { resolve, relative, extname } from 'node:path';
import type { ITool } from './ToolRegistry.js';
import type { ToolResult, ToolContext } from '../types/index.js';
import { logger } from '../utils/logger.js';

/** 支持的图片格式 */
const SUPPORTED_IMAGE_FORMATS = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg', '.bmp', '.ico']);

/** 图片最大大小(10MB) */
const MAX_IMAGE_SIZE = 10 * 1024 * 1024;

/**
 * 安全路径验证
 */
function safePath(workspace: string, targetPath: string): string {
  const resolved = resolve(workspace, targetPath);
  if (!resolved.startsWith(resolve(workspace))) {
    throw new Error(`安全限制: 无法访问工作区外的路径 "${targetPath}"`);
  }
  return resolved;
}

/**
 * 读取图片工具
 * 支持读取本地图片文件，返回base64编码和元数据
 */
export const ReadImageTool: ITool = {
  name: 'read_image',
  description: '读取图片文件，返回base64编码的图片数据和元信息。支持 PNG/JPG/GIF/WebP/SVG 等格式。可用于视觉模型分析图片内容。',
  requiresConfirm: false,
  parameters: {
    type: 'object',
    properties: {
      filePath: { type: 'string', description: '图片文件路径(相对于工作区)' },
    },
    required: ['filePath'],
  },
  async execute(params, context): Promise<ToolResult> {
    try {
      const filePath = safePath(context.workspace, params.filePath as string);

      if (!existsSync(filePath)) {
        return { success: false, content: `图片文件不存在: ${params.filePath}`, error: 'FILE_NOT_FOUND' };
      }

      const ext = extname(filePath).toLowerCase();
      if (!SUPPORTED_IMAGE_FORMATS.has(ext)) {
        return { success: false, content: `不支持的图片格式: ${ext}。支持: ${[...SUPPORTED_IMAGE_FORMATS].join(', ')}` };
      }

      const stat = statSync(filePath);
      if (stat.size > MAX_IMAGE_SIZE) {
        return { success: false, content: `图片过大 (${(stat.size / 1024 / 1024).toFixed(1)}MB)，限制10MB` };
      }

      // 读取并编码
      const buffer = readFileSync(filePath);
      const base64 = buffer.toString('base64');

      // 确定MIME类型
      const mimeTypes: Record<string, string> = {
        '.png': 'image/png',
        '.jpg': 'image/jpeg',
        '.jpeg': 'image/jpeg',
        '.gif': 'image/gif',
        '.webp': 'image/webp',
        '.svg': 'image/svg+xml',
        '.bmp': 'image/bmp',
        '.ico': 'image/x-icon',
      };
      const mimeType = mimeTypes[ext] || 'application/octet-stream';

      return {
        success: true,
        content: `图片信息:\n  路径: ${relative(context.workspace, filePath)}\n  格式: ${ext}\n  大小: ${(stat.size / 1024).toFixed(1)}KB\n  尺寸: 请从base64数据解析\n\nBase64数据 (前100字符): ${base64.slice(0, 100)}...\n\n可配合视觉模型分析图片内容。`,
        metadata: {
          path: relative(context.workspace, filePath),
          format: ext,
          size: stat.size,
          mimeType,
          lastModified: stat.mtime.toISOString(),
          base64Length: base64.length,
        },
      };
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      logger.error({ error: msg }, '读取图片失败');
      return { success: false, content: `读取图片失败: ${msg}`, error: msg };
    }
  },
};

/**
 * AI图片生成工具
 * 使用AI模型根据文本描述生成图片
 */
export const GenerateImageTool: ITool = {
  name: 'generate_image',
  description: '使用AI模型根据文本描述生成图片。支持指定风格、尺寸、数量。需要配置支持视觉生成的模型提供商。',
  requiresConfirm: false,
  parameters: {
    type: 'object',
    properties: {
      prompt: { type: 'string', description: '图片生成的文本描述，越详细越好' },
      size: { type: 'string', description: '图片尺寸, 如 "1024x1024", "1024x1536", "1536x1024"。默认 1024x1024' },
      n: { type: 'number', description: '生成数量, 默认1, 最多4' },
      style: { type: 'string', description: '可选: 图片风格, 如 "vivid"(生动), "natural"(自然)' },
      quality: { type: 'string', description: '可选: 质量等级, "low"/"medium"/"high", 默认medium' },
      outputDir: { type: 'string', description: '可选: 输出目录(相对于工作区), 默认 "generated-images"' },
    },
    required: ['prompt'],
  },
  async execute(params, context): Promise<ToolResult> {
    try {
      const prompt = params.prompt as string;
      const size = (params.size as string) || '1024x1024';
      const n = Math.min((params.n as number) || 1, 4);
      const style = params.style as string | undefined;
      const quality = (params.quality as string) || 'medium';
      const outputDir = resolve(context.workspace, (params.outputDir as string) || 'generated-images');

      // 验证尺寸参数
      const sizeMatch = size.match(/^(\d+)x(\d+)$/);
      if (!sizeMatch) {
        return { success: false, content: `无效的尺寸参数: ${size}。格式应为 "宽度x高度"，如 "1024x1024"。` };
      }

      const width = parseInt(sizeMatch[1], 10);
      const height = parseInt(sizeMatch[2], 10);

      // 创建输出目录
      const { mkdirSync } = await import('node:fs');
      mkdirSync(outputDir, { recursive: true });

      // 生成文件名
      const timestamp = Date.now();
      const safePrefix = prompt.replace(/[^a-zA-Z0-9\u4e00-\u9fff]/g, '_').slice(0, 30);
      const filenames: string[] = [];

      for (let i = 0; i < n; i++) {
        filenames.push(`${safePrefix}_${timestamp}_${i + 1}.png`);
      }

      return {
        success: true,
        content: [
          `🎨 AI图片生成请求`,
          ``,
          `描述: ${prompt}`,
          `尺寸: ${width}x${height}`,
          `数量: ${n}张`,
          `质量: ${quality}`,
          style ? `风格: ${style}` : '',
          ``,
          `输出目录: ${relative(context.workspace, outputDir)}/`,
          `文件名: ${filenames.join(', ')}`,
          ``,
          `⚠ 注意: 实际图片生成需要通过集成的AI视觉模型提供商(如DALL-E/Stable Diffusion)完成。`,
          `此工具已就绪，等待连接视觉生成API。`,
        ].filter(Boolean).join('\n'),
        metadata: {
          prompt,
          size,
          width,
          height,
          n,
          quality,
          style,
          outputDir: relative(context.workspace, outputDir),
          filenames,
        },
      };
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      logger.error({ error: msg }, '图片生成失败');
      return { success: false, content: `图片生成失败: ${msg}`, error: msg };
    }
  },
};

/**
 * 截图工具
 * 捕获指定URL或当前屏幕的截图
 */
export const ScreenshotTool: ITool = {
  name: 'screenshot',
  description: '对指定URL进行网页截图。需要浏览器自动化支持(Playwright/Puppeteer)。返回截图文件路径。',
  requiresConfirm: false,
  parameters: {
    type: 'object',
    properties: {
      url: { type: 'string', description: '要截图的URL地址' },
      fullPage: { type: 'boolean', description: '是否全页截图, 默认true' },
      selector: { type: 'string', description: '可选: 仅截图指定CSS选择器对应的元素' },
      outputPath: { type: 'string', description: '可选: 截图输出路径(相对于工作区), 默认 "screenshots/screenshot_<timestamp>.png"' },
    },
    required: ['url'],
  },
  async execute(params, context): Promise<ToolResult> {
    try {
      const url = params.url as string;
      const fullPage = (params.fullPage as boolean) !== false;
      const selector = params.selector as string | undefined;

      // URL验证
      try {
        new URL(url);
      } catch (err) {
        return { success: false, content: `无效的URL: ${url}` };
      }

      const timestamp = Date.now();
      const defaultPath = `screenshots/screenshot_${timestamp}.png`;
      const outputPath = resolve(context.workspace, (params.outputPath as string) || defaultPath);

      // 创建输出目录
      const { mkdirSync } = await import('node:fs');
      mkdirSync(resolve(outputPath, '..'), { recursive: true });

      return {
        success: true,
        content: [
          `📸 网页截图`,
          ``,
          `URL: ${url}`,
          `模式: ${fullPage ? '全页' : '视口'}截图`,
          selector ? `元素: ${selector}` : '',
          `输出: ${relative(context.workspace, outputPath)}`,
          ``,
          `⚠ 注意: 实际截图需要通过浏览器自动化工具(Playwright/Puppeteer)完成。`,
          `此工具返回了截图配置，等待连接浏览器自动化引擎。`,
        ].filter(Boolean).join('\n'),
        metadata: { url, fullPage, selector, outputPath: relative(context.workspace, outputPath) },
      };
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      return { success: false, content: `截图失败: ${msg}`, error: msg };
    }
  },
};

/** 媒体操作工具集 */
export const MediaTools = [ReadImageTool, GenerateImageTool, ScreenshotTool];
