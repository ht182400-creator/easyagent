/**
 * 预览和媒体工具测试
 * 覆盖 StartServerTool, PreviewURLTool, DiffFilesTool, AskUserTool,
 * ReadImageTool, GenerateImageTool, ScreenshotTool
 *
 * ⚠️ 副作用阻断（重要）：PreviewURLTool 内部会 execSync('start "" <url>') 打开系统浏览器。
 * 此前未 mock，导致每次全量回归都真实弹出 https://example.com/page 浏览器页签。
 * 测试只应验证「URL 校验 + 打开命令构造」，不应产生真实副作用 —— 故 mock execSync
 * （spawn 保持真实现，StartServerTool 等不受影响），并在用例中断言命令内容。
 */
import { describe, it, expect, beforeEach, beforeAll, afterEach, vi } from 'vitest';
import { execSync } from 'node:child_process';
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { tmpdir } from 'node:os';

vi.mock('node:child_process', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:child_process')>();
  const mockExecSync = vi.fn(() => Buffer.from(''));
  return {
    ...actual,
    execSync: mockExecSync,
    // CJS 互操作兜底
    default: { ...actual, execSync: mockExecSync },
  };
});

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
    } catch (_) {
      /* 测试清理失败不影响结果 */
    }
  });

  it('有效HTTP URL应成功（不真开浏览器，仅校验打开命令）', async () => {
    const result = await PreviewURLTool.execute({ url: 'http://localhost:3000' }, ctx(workspace));
    expect(result.success).toBe(true);
    expect(result.content).toContain('localhost:3000');
    // 副作用断言：execSync 收到的应是打开命令（含 URL），而非真实执行
    const calls = vi.mocked(execSync).mock.calls as unknown as Array<[string]>;
    const last = calls[calls.length - 1]?.[0] ?? '';
    expect(last).toContain('http://localhost:3000');
  });

  it('有效HTTPS URL应成功（不真开浏览器，仅校验打开命令）', async () => {
    const result = await PreviewURLTool.execute(
      { url: 'https://example.com/page' },
      ctx(workspace),
    );
    expect(result.success).toBe(true);
    expect(result.content).toContain('example.com');
    const calls = vi.mocked(execSync).mock.calls as unknown as Array<[string]>;
    const last = calls[calls.length - 1]?.[0] ?? '';
    // Windows 平台命令形如 start "" "<url>"
    expect(last).toContain('https://example.com/page');
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
    } catch (_) {
      /* 测试清理失败不影响结果 */
    }
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
    } catch (_) {
      /* 测试清理失败不影响结果 */
    }
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
    } catch (_) {
      /* 测试清理失败不影响结果 */
    }
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
    } catch (_) {
      /* 测试清理失败不影响结果 */
    }
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
    } catch (_) {
      /* 测试清理失败不影响结果 */
    }
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

// ==================== StartServerTool 端口分配（2026-09-19 回归） ====================
// 背景：旧实现把默认端口写死 3000 且从不检测占用，而本机 3000 常被自建 Forgejo 占用
// （见 docs/64），启动预览服务器会直接 EADDRINUSE。现改为 3500-3599 内自动选空闲端口。
describe('StartServerTool - 端口分配与冲突告警', () => {
  it('未指定端口：不在 3000 上启动，而是在 3500-3599 内自动选空闲端口', async () => {
    const mod = await import('../tools/PreviewTools.js');
    // ⚠️ workspace 直接用系统临时目录：spawn 出的子进程会持有 cwd，
    // Windows 下导致目录删不掉（rmSync EPERM），故不建临时子目录、无需清理
    const res: any = await mod.StartServerTool.execute(
      { command: 'node --version' },
      ctx(tmpdir()),
    );
    expect(res.success).toBe(true);
    expect(res.metadata.autoSelected).toBe(true);
    expect(res.metadata.port).toBeGreaterThanOrEqual(3500);
    expect(res.metadata.port).toBeLessThanOrEqual(3599);
    // 3000 常被其他服务占用（如自建 Forgejo），绝不能再作为默认端口
    expect(res.metadata.port).not.toBe(3000);
    expect(res.content).toContain('自动选择');
  });

  it('显式指定端口被占用：如实告警且不擅自改端口', async () => {
    const { createServer } = await import('node:net');
    const mod = await import('../tools/PreviewTools.js');
    const occupied = 3566;
    const blocker = createServer();
    await new Promise<void>((r) => blocker.listen(occupied, '127.0.0.1', () => r()));
    try {
      const res: any = await mod.StartServerTool.execute(
        { command: 'node --version', port: occupied },
        ctx(tmpdir()),
      );
      expect(res.success).toBe(true);
      expect(res.metadata.port).toBe(occupied);
      expect(res.metadata.autoSelected).toBe(false);
      expect(res.metadata.portConflict).toBe(true);
      expect(res.content).toContain('已被占用');
    } finally {
      blocker.close();
    }
  });
});
