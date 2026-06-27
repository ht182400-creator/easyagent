/**
 * 预览和媒体工具测试
 * 覆盖 StartServerTool, PreviewURLTool, DiffFilesTool, AskUserTool,
 * ReadImageTool, GenerateImageTool, ScreenshotTool
 */
import { describe, it, expect, beforeEach, beforeAll, afterEach } from 'vitest';
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { tmpdir } from 'node:os';

function createTestDir(): string {
  const dir = resolve(
    tmpdir(),
    `ea-pv-test-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
  );
  mkdirSync(dir, { recursive: true });
  return dir;
}

const ctx = (ws: string) => ({ workspace: ws, sessionId: 'test-session' });

// ==================== PreviewURLTool ====================
describe('PreviewURLTool - URL预览', () => {
  let PreviewURLTool: any;
  let workspace: string;

  beforeAll(async () => {
    const mod = await import('../tools/PreviewTools.js');
    PreviewURLTool = mod.PreviewURLTool;
  });

  beforeEach(() => {
    workspace = createTestDir();
  });

  afterEach(() => {
    try {
      rmSync(workspace, { recursive: true, force: true });
    } catch (err) {}
  });

  it('有效HTTP URL应成功', async () => {
    const result = await PreviewURLTool.execute({ url: 'http://localhost:3000' }, ctx(workspace));
    expect(result.success).toBe(true);
    expect(result.content).toContain('localhost:3000');
  });

  it('有效HTTPS URL应成功', async () => {
    const result = await PreviewURLTool.execute(
      { url: 'https://example.com/page' },
      ctx(workspace),
    );
    expect(result.success).toBe(true);
    expect(result.content).toContain('example.com');
  });

  it('无效URL应返回错误', async () => {
    const result = await PreviewURLTool.execute({ url: 'not-a-valid-url' }, ctx(workspace));
    expect(result.success).toBe(false);
    expect(result.content).toContain('无效');
  });

  it('非HTTP协议的URL应返回错误', async () => {
    const result = await PreviewURLTool.execute(
      { url: 'ftp://files.example.com/data' },
      ctx(workspace),
    );
    expect(result.success).toBe(false);
    expect(result.content).toContain('不支持的协议');
  });

  it('file://协议应被拒绝', async () => {
    const result = await PreviewURLTool.execute({ url: 'file:///etc/passwd' }, ctx(workspace));
    expect(result.success).toBe(false);
  });

  it('url参数应为必需', () => {
    expect(PreviewURLTool.parameters.required).toContain('url');
  });
});

// ==================== DiffFilesTool ====================
describe('DiffFilesTool - 文件对比', () => {
  let DiffFilesTool: any;
  let workspace: string;

  beforeAll(async () => {
    const mod = await import('../tools/PreviewTools.js');
    DiffFilesTool = mod.DiffFilesTool;
  });

  beforeEach(() => {
    workspace = createTestDir();
  });

  afterEach(() => {
    try {
      rmSync(workspace, { recursive: true, force: true });
    } catch (err) {}
  });

  it('两个相同文件应返回(较小篇幅)diff输出', async () => {
    writeFileSync(join(workspace, 'a.txt'), 'line1\nline2\nline3');
    writeFileSync(join(workspace, 'b.txt'), 'line1\nline2\nline3');
    const result = await DiffFilesTool.execute(
      { filePath1: 'a.txt', filePath2: 'b.txt' },
      ctx(workspace),
    );
    expect(result.success).toBe(true);
    // diff 对于相同文件，输出只含 --- 和 +++ 头，不包含 -/+
    expect(result.content).toContain('---');
    expect(result.content).toContain('+++');
  });

  it('不同文件应产生diff输出', async () => {
    writeFileSync(join(workspace, 'old.ts'), 'const x = 1;\nconst y = 2;');
    writeFileSync(join(workspace, 'new.ts'), 'const x = 1;\nconst z = 3;');
    const result = await DiffFilesTool.execute(
      { filePath1: 'old.ts', filePath2: 'new.ts' },
      ctx(workspace),
    );
    expect(result.success).toBe(true);
    expect(result.content).toContain('---');
    expect(result.content).toContain('+++');
  });

  it('一个文件为空应显示全部为新增', async () => {
    writeFileSync(join(workspace, 'empty.txt'), '');
    writeFileSync(join(workspace, 'content.txt'), 'hello world');
    const result = await DiffFilesTool.execute(
      { filePath1: 'empty.txt', filePath2: 'content.txt' },
      ctx(workspace),
    );
    expect(result.success).toBe(true);
    // 空对非空,应有diff
    expect(result.content).not.toContain('相同');
  });

  it('filePath1和filePath2都应为必需参数', () => {
    expect(DiffFilesTool.parameters.required).toContain('filePath1');
    expect(DiffFilesTool.parameters.required).toContain('filePath2');
  });
});

// ==================== AskUserTool ====================
describe('AskUserTool - 用户交互', () => {
  let AskUserTool: any;
  let workspace: string;

  beforeAll(async () => {
    const mod = await import('../tools/PreviewTools.js');
    AskUserTool = mod.AskUserTool;
  });

  beforeEach(() => {
    workspace = createTestDir();
  });

  afterEach(() => {
    try {
      rmSync(workspace, { recursive: true, force: true });
    } catch (err) {}
  });

  it('无选项时应为确认型问题', async () => {
    const result = await AskUserTool.execute({ question: '是否继续操作？' }, ctx(workspace));
    expect(result.success).toBe(true);
    expect(result.content).toContain('确认');
    expect(result.content).toContain('是否继续操作');
    expect(result.metadata.type).toBe('confirm');
  });

  it('有选项时应为选择型问题', async () => {
    const result = await AskUserTool.execute(
      { question: '选择方案', options: ['方案A', '方案B', '方案C'] },
      ctx(workspace),
    );
    expect(result.success).toBe(true);
    expect(result.content).toContain('方案A');
    expect(result.content).toContain('方案B');
    expect(result.content).toContain('方案C');
  });

  it('应支持标题参数', async () => {
    const result = await AskUserTool.execute(
      { question: '选择版本', title: '版本选择', options: ['v1', 'v2'] },
      ctx(workspace),
    );
    expect(result.success).toBe(true);
    expect(result.content).toContain('版本选择');
  });

  it('多选模式应显示提示', async () => {
    const result = await AskUserTool.execute(
      { question: '选择多个', options: ['A', 'B', 'C'], multiSelect: true },
      ctx(workspace),
    );
    expect(result.success).toBe(true);
    expect(result.content).toContain('多选');
  });

  it('question参数应为必需', () => {
    expect(AskUserTool.parameters.required).toContain('question');
  });

  it('空选项数组应显示确认模式', async () => {
    const result = await AskUserTool.execute({ question: '确认?', options: [] }, ctx(workspace));
    expect(result.success).toBe(true);
    expect(result.content).toContain('确认');
  });
});

// ==================== ReadImageTool ====================
describe('ReadImageTool - 读取图片', () => {
  let ReadImageTool: any;
  let workspace: string;

  beforeAll(async () => {
    const mod = await import('../tools/MediaTools.js');
    ReadImageTool = mod.ReadImageTool;
  });

  beforeEach(() => {
    workspace = createTestDir();
  });

  afterEach(() => {
    try {
      rmSync(workspace, { recursive: true, force: true });
    } catch (err) {}
  });

  it('文件不存在应返回错误', async () => {
    const result = await ReadImageTool.execute({ filePath: 'nonexistent.png' }, ctx(workspace));
    expect(result.success).toBe(false);
    expect(result.error).toBe('FILE_NOT_FOUND');
  });

  it('不支持的格式应返回错误', async () => {
    writeFileSync(join(workspace, 'file.xyz'), Buffer.from('fake'));
    const result = await ReadImageTool.execute({ filePath: 'file.xyz' }, ctx(workspace));
    expect(result.success).toBe(false);
    expect(result.content).toContain('不支持的图片格式');
  });

  it('应能读取PNG图片', async () => {
    // 最小PNG (1x1 像素, 67字节)
    const minPng = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
      'base64',
    );
    writeFileSync(join(workspace, 'test.png'), minPng);
    const result = await ReadImageTool.execute({ filePath: 'test.png' }, ctx(workspace));
    expect(result.success).toBe(true);
    expect(result.metadata.format).toBe('.png');
    expect(result.metadata.mimeType).toBe('image/png');
  });

  it('应支持SVG格式', async () => {
    writeFileSync(
      join(workspace, 'icon.svg'),
      '<svg xmlns="http://www.w3.org/2000/svg"><circle cx="50" cy="50" r="40"/></svg>',
    );
    const result = await ReadImageTool.execute({ filePath: 'icon.svg' }, ctx(workspace));
    expect(result.success).toBe(true);
    expect(result.metadata.format).toBe('.svg');
    expect(result.metadata.mimeType).toBe('image/svg+xml');
  });

  it('工作区外路径应被拦截', async () => {
    const result = await ReadImageTool.execute({ filePath: '../../etc/image.png' }, ctx(workspace));
    expect(result.success).toBe(false);
  });
});

// ==================== GenerateImageTool ====================
describe('GenerateImageTool - AI图片生成', () => {
  let GenerateImageTool: any;
  let workspace: string;

  beforeAll(async () => {
    const mod = await import('../tools/MediaTools.js');
    GenerateImageTool = mod.GenerateImageTool;
  });

  beforeEach(() => {
    workspace = createTestDir();
  });

  afterEach(() => {
    try {
      rmSync(workspace, { recursive: true, force: true });
    } catch (err) {}
  });

  it('有效prompt应返回生成配置', async () => {
    const result = await GenerateImageTool.execute(
      { prompt: 'A beautiful sunset over mountains' },
      ctx(workspace),
    );
    expect(result.success).toBe(true);
    expect(result.content).toContain('AI图片生成');
    expect(result.metadata.prompt).toBe('A beautiful sunset over mountains');
  });

  it('应支持尺寸参数', async () => {
    const result = await GenerateImageTool.execute(
      { prompt: 'landscape', size: '1536x1024' },
      ctx(workspace),
    );
    expect(result.success).toBe(true);
    expect(result.metadata.width).toBe(1536);
    expect(result.metadata.height).toBe(1024);
  });

  it('无效的尺寸格式应返回错误', async () => {
    const result = await GenerateImageTool.execute(
      { prompt: 'test', size: 'invalid' },
      ctx(workspace),
    );
    expect(result.success).toBe(false);
    expect(result.content).toContain('无效的尺寸参数');
  });

  it('应支持n参数控制在1-4之间', async () => {
    const result = await GenerateImageTool.execute({ prompt: 'cat', n: 3 }, ctx(workspace));
    expect(result.success).toBe(true);
    expect(result.metadata.n).toBe(3);
    expect(result.metadata.filenames.length).toBe(3);
  });

  it('n超过4应被限制为4', async () => {
    const result = await GenerateImageTool.execute({ prompt: 'cat', n: 10 }, ctx(workspace));
    expect(result.success).toBe(true);
    expect(result.metadata.n).toBe(4);
  });

  it('应支持style和quality参数', async () => {
    const result = await GenerateImageTool.execute(
      { prompt: 'art', style: 'vivid', quality: 'high' },
      ctx(workspace),
    );
    expect(result.success).toBe(true);
    expect(result.metadata.style).toBe('vivid');
    expect(result.metadata.quality).toBe('high');
  });

  it('prompt参数应为必需', () => {
    expect(GenerateImageTool.parameters.required).toContain('prompt');
  });
});

// ==================== ScreenshotTool ====================
describe('ScreenshotTool - 截图', () => {
  let ScreenshotTool: any;
  let workspace: string;

  beforeAll(async () => {
    const mod = await import('../tools/MediaTools.js');
    ScreenshotTool = mod.ScreenshotTool;
  });

  beforeEach(() => {
    workspace = createTestDir();
  });

  afterEach(() => {
    try {
      rmSync(workspace, { recursive: true, force: true });
    } catch (err) {}
  });

  it('有效URL应返回截图配置', async () => {
    const result = await ScreenshotTool.execute({ url: 'https://example.com' }, ctx(workspace));
    expect(result.success).toBe(true);
    expect(result.content).toContain('网页截图');
    expect(result.content).toContain('example.com');
  });

  it('无效URL应返回错误', async () => {
    const result = await ScreenshotTool.execute({ url: 'not a url at all' }, ctx(workspace));
    expect(result.success).toBe(false);
    expect(result.content).toContain('无效的URL');
  });

  it('应支持fullPage参数', async () => {
    const result = await ScreenshotTool.execute(
      { url: 'https://example.com', fullPage: true },
      ctx(workspace),
    );
    expect(result.success).toBe(true);
    expect(result.metadata.fullPage).toBe(true);
  });

  it('默认应为全页截图', async () => {
    const result = await ScreenshotTool.execute({ url: 'https://example.com' }, ctx(workspace));
    expect(result.success).toBe(true);
    expect(result.metadata.fullPage).toBe(true);
  });

  it('应支持selector参数', async () => {
    const result = await ScreenshotTool.execute(
      { url: 'https://example.com', selector: '#main' },
      ctx(workspace),
    );
    expect(result.success).toBe(true);
    expect(result.metadata.selector).toBe('#main');
  });

  it('url参数应为必需', () => {
    expect(ScreenshotTool.parameters.required).toContain('url');
  });
});

// ==================== 导出验证 ====================
describe('PreviewTools & MediaTools - 导出完整性', () => {
  it('PreviewTools应包含4个工具', async () => {
    const mod = await import('../tools/PreviewTools.js');
    expect(mod.PreviewTools).toHaveLength(4);
    const names = mod.PreviewTools.map((t: any) => t.name);
    expect(names).toContain('start_server');
    expect(names).toContain('preview_url');
    expect(names).toContain('diff_files');
    expect(names).toContain('ask_user');
  });

  it('MediaTools应包含3个工具', async () => {
    const mod = await import('../tools/MediaTools.js');
    expect(mod.MediaTools).toHaveLength(3);
    const names = mod.MediaTools.map((t: any) => t.name);
    expect(names).toContain('read_image');
    expect(names).toContain('generate_image');
    expect(names).toContain('screenshot');
  });
});
