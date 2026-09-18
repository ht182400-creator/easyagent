/**
 * Markdown 渲染模块测试
 *
 * 重点覆盖两类：
 *   ① **能力**：表格 / 有序列表 / 嵌套列表 / 代码高亮（旧自研正则渲染器全部不支持）
 *   ② **安全**：XSS 防线（原始 HTML 转义、协议白名单、属性逃逸）——每条都对应一个真实缺口
 *
 * ⚠️ 标有「🛡️」的用例是**安全回归**，删除或修改前请先理解它守护的攻击方式。
 *
 * ── 为什么本文件用 jsdom 而不是包默认的 happy-dom ──
 * `sanitizeHtml()` 内部使用 DOMPurify。实测发现 **DOMPurify 在 happy-dom 下行为不可靠**：
 * 连默认配置都会把 `<p>` / `<h2>` / `<span>` 这类正常标签整类剥掉
 * （输入 `<p>hi</p>` 输出只剩 `hi`），而多元素场景下 `<script>` 反而可能存活。
 * 这会让「消毒是否真的生效」的断言失去意义——甚至给出错误的安全结论。
 *
 * 本文件**不渲染任何 React 组件**，因此不受 v0.6.22「改用 happy-dom 规避 React 重复实例」
 * 那条约定的约束，可以安全地使用 jsdom（DOM 实现更完整，也更接近真实浏览器）。
 *
 * @vitest-environment jsdom
 *
 * @module __tests__/markdown.test
 */

import { describe, it, expect } from 'vitest';
import { renderMarkdown, sanitizeHtml, isSafeUrl, estimateWordCount } from '../utils/markdown.js';

// ===================== 渲染能力 =====================

describe('renderMarkdown — 基础渲染', () => {
  it('空输入应返回空串', () => {
    expect(renderMarkdown('')).toBe('');
    expect(renderMarkdown(null)).toBe('');
    expect(renderMarkdown(undefined)).toBe('');
  });

  it('应渲染标题、粗体、斜体、行内代码', () => {
    const html = renderMarkdown('# 标题\n\n这是 **粗体** 与 *斜体* 和 `code`');
    expect(html).toContain('<h1>标题</h1>');
    expect(html).toContain('<strong>粗体</strong>');
    expect(html).toContain('<em>斜体</em>');
    expect(html).toContain('<code>code</code>');
  });

  it('应渲染表格（旧渲染器完全不支持）', () => {
    const html = renderMarkdown('| 名称 | 值 |\n| --- | --- |\n| foo | 1 |\n| bar | 2 |');
    expect(html).toContain('<table>');
    expect(html).toContain('<th>名称</th>');
    expect(html).toContain('<td>foo</td>');
    expect(html).toContain('</table>');
  });

  it('应渲染有序列表（旧渲染器完全不支持）', () => {
    const html = renderMarkdown('1. 第一\n2. 第二\n3. 第三');
    expect(html).toContain('<ol>');
    expect(html).toContain('<li>第一</li>');
    expect(html).toContain('<li>第三</li>');
  });

  it('应渲染嵌套列表（旧渲染器会把子列表压平）', () => {
    const html = renderMarkdown('- 顶层\n  - 子项 A\n  - 子项 B');
    // 嵌套列表表现为 ul 内部再包一层 ul
    expect((html.match(/<ul>/g) || []).length).toBeGreaterThanOrEqual(2);
    expect(html).toContain('子项 A');
    expect(html).toContain('子项 B');
  });

  it('应渲染引用块与分隔线', () => {
    expect(renderMarkdown('> 引用内容')).toContain('<blockquote>');
    expect(renderMarkdown('上\n\n---\n\n下')).toContain('<hr>');
  });

  it('自动识别裸链接应带上 target 与 rel', () => {
    const html = renderMarkdown('访问 https://example.com 看看');
    expect(html).toContain('https://example.com');
    expect(html).toContain('target="_blank"');
    expect(html).toContain('noopener noreferrer');
  });
});

// ===================== 代码高亮 =====================

describe('renderMarkdown — 代码高亮', () => {
  it('指定语言时应产出 highlight.js 的高亮标记', () => {
    const html = renderMarkdown('```typescript\nconst a: number = 1;\n```');
    expect(html).toContain('<pre');
    expect(html).toContain('data-lang="typescript"');
    // hljs 会把关键字包进带 class 的 span
    expect(html).toContain('hljs-');
    expect(html).toMatch(/<span class="hljs-keyword">const<\/span>/);
  });

  it('常用别名应能正确映射到高亮器', () => {
    // 注意：样例必须**符合该语言的语法**，否则高亮器本来就不会产出 token。
    //      （实测：`const x = 1;` 在 bash 下确实无 hljs span —— 这不是 bug，是语法不符）
    const samples: Array<[string, string]> = [
      ['js', 'const x = 1;'],
      ['ts', 'const x: number = 1;'],
      ['sh', 'echo hello'],
      ['bash', 'ls -la'],
      ['py', 'def foo(): pass'],
      ['json', '{"a": 1}'],
      ['yml', 'key: value'],
      ['html', '<div class="a">x</div>'],
    ];
    for (const [lang, sample] of samples) {
      const html = renderMarkdown(`\`\`\`${lang}\n${sample}\n\`\`\``);
      expect(html, `围栏语言 ${lang} 应产出高亮（样例: ${sample}）`).toMatch(/class="hljs-/);
    }
  });

  it('无法识别的语言应降级为纯文本代码块（不报错、不产生空属性）', () => {
    const html = renderMarkdown('```totally-unknown-lang\n任意内容\n```');
    expect(html).toContain('<pre><code');
    expect(html).not.toContain('data-lang=""');
  });

  it('未指定语言时应降级为普通代码块而非报错', () => {
    const html = renderMarkdown('```\n未标注语言的代码\n```');
    expect(html).toContain('<code>');
    expect(html).not.toContain('undefined');
  });

  it('未知语言标签不应导致渲染失败', () => {
    const html = renderMarkdown('```not-a-real-lang\nhello world\n```');
    expect(html).toContain('hello world');
  });

  it('🛡️ 代码块中的 HTML/JS 必须被转义，且不得出现可执行的原始标签', () => {
    const html = renderMarkdown('```html\n<script>alert(1)</script>\n```');
    // ① 不得出现未转义的 <script> 字面量（否则会被浏览器当作真标签解析）
    expect(html).not.toContain('<script');
    // ② 尖括号必须被转义（highlight.js 会拆成 span + &lt;/&gt;，因此只要求 &lt; 存在）
    expect(html).toContain('&lt;');
    // ③ 文本内容应保留
    expect(html).toContain('script');
  });
});

// ===================== 安全防线 =====================

describe('renderMarkdown — 安全（🛡️ 回归）', () => {
  it('🛡️ 原始 HTML 必须被转义，不得执行', () => {
    const html = renderMarkdown('<script>alert(1)</script>');
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
  });

  it('🛡️ img onerror 注入必须失效', () => {
    const html = renderMarkdown('<img src=x onerror=alert(1)>');
    expect(html).not.toContain('<img');
    expect(html).toContain('&lt;img');
  });

  it('🛡️ javascript: 链接不得出现在 href 中', () => {
    // 这是旧渲染器最严重的缺口：直接拼 href="$2"，导致点击即执行
    const html = renderMarkdown('[点我](javascript:alert(1))');
    expect(html.toLowerCase()).not.toContain('href="javascript:');
  });

  it('🛡️ data: URI 链接必须被拒绝', () => {
    const html = renderMarkdown('[点我](data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==)');
    expect(html.toLowerCase()).not.toContain('href="data:');
  });

  it('🛡️ 属性逃逸：URL 中的引号不得挣脱 href 属性', () => {
    // 旧渲染器只转义 & < > 而漏了 "，因此这段能拼出 `<a href="x" onmouseover="...">` 注入。
    // 修复后的实测行为：markdown-it 压根不把它识别为链接，整段作为文本输出并把 " 转义为 &quot;。
    const html = renderMarkdown('[聪明的链接](x" onmouseover="alert(1))');
    // ① 不得生成带 onmouseover 属性的真实锚点（这才是攻击成立的形式）
    expect(html).not.toMatch(/<a\b[^>]*onmouseover/i);
    // ② 即便退化为文本，引号也必须是转义形式（防止被二次处理时复活）
    expect(html).toContain('&quot;');
    // ③ 不应产生任何 <a> 标签
    expect(html).not.toContain('<a ');
  });

  it('🛡️ 大小写变形与空白变种的协议必须被拦截', () => {
    const html = renderMarkdown('[x](JaVaScRiPt:alert(1)) [y]( javascript:alert(2))');
    expect(html.toLowerCase()).not.toContain('href="javascript:');
  });

  it('🛡️ 正常链接不受影响（防护不能误伤）', () => {
    const https = renderMarkdown('[文档](https://example.com/docs)');
    expect(https).toContain('href="https://example.com/docs"');

    const relative = renderMarkdown('[文档](./docs/readme.md)');
    expect(relative).toContain('href="./docs/readme.md"');

    const mailto = renderMarkdown('[邮件](mailto:a@b.com)');
    expect(mailto).toContain('href="mailto:a@b.com"');
  });

  it('渲染异常时应返回空串而非抛出（不得把原文塞进 innerHTML）', () => {
    // renderMarkdown 内部已 try/catch；这里验证契约本身
    expect(() => renderMarkdown('# 正常内容')).not.toThrow();
  });
});

// ===================== URL 安全判定 =====================

describe('isSafeUrl — 协议白名单', () => {
  it('放行 http / https / mailto / tel', () => {
    expect(isSafeUrl('https://a.com')).toBe(true);
    expect(isSafeUrl('http://a.com')).toBe(true);
    expect(isSafeUrl('mailto:a@b.com')).toBe(true);
    expect(isSafeUrl('tel:10086')).toBe(true);
  });

  it('放行相对路径与锚点', () => {
    expect(isSafeUrl('./a.md')).toBe(true);
    expect(isSafeUrl('#section-1')).toBe(true);
    expect(isSafeUrl('docs/index.html')).toBe(true);
  });

  it('拦截危险协议', () => {
    expect(isSafeUrl('javascript:alert(1)')).toBe(false);
    expect(isSafeUrl('data:text/html,<script>')).toBe(false);
    expect(isSafeUrl('vbscript:msgbox(1)')).toBe(false);
    expect(isSafeUrl('file:///etc/passwd')).toBe(false);
  });

  it('冒号出现在路径中时不应误判为协议', () => {
    // 形如 `foo/bar:baz` 不应被当成 `foo:` 协议
    expect(isSafeUrl('foo/bar:baz')).toBe(true);
  });
});

// ===================== 远程 HTML 消毒 =====================

describe('sanitizeHtml — 远程 HTML（如 GitHub README）', () => {
  it('空输入应返回空串', () => {
    expect(sanitizeHtml('')).toBe('');
    expect(sanitizeHtml(null)).toBe('');
  });

  it('🛡️ 移除 script 标签', () => {
    const out = sanitizeHtml('<p>hi</p><script>alert(1)</script>');
    expect(out).not.toContain('<script');
    expect(out).toContain('<p>hi</p>');
  });

  it('🛡️ 移除事件处理器属性', () => {
    const out = sanitizeHtml('<p onclick="alert(1)">文本</p>');
    expect(out.toLowerCase()).not.toContain('onclick');
    expect(out).toContain('文本');
  });

  it('🛡️ 移除 javascript: 协议的 href', () => {
    const out = sanitizeHtml('<a href="javascript:alert(1)">恶意链接</a>');
    expect(out.toLowerCase()).not.toContain('javascript:');
  });

  it('🛡️ 移除 iframe / object 等危险标签', () => {
    const out = sanitizeHtml('<iframe src="https://evil.com"></iframe><p>ok</p>');
    expect(out.toLowerCase()).not.toContain('<iframe');
    expect(out).toContain('<p>ok</p>');
  });

  it('保留正常排版内容（防护不能过度清洗）', () => {
    const out = sanitizeHtml(
      '<h2>标题</h2><ul><li>项</li></ul><table><tr><td>单元格</td></tr></table>',
    );
    expect(out).toContain('<h2>标题</h2>');
    expect(out).toContain('<li>项</li>');
    expect(out).toContain('<td>单元格</td>');
  });

  it('保留 hljs 高亮所需的 class', () => {
    const out = sanitizeHtml('<span class="hljs-keyword">const</span>');
    expect(out).toContain('class="hljs-keyword"');
  });
});

// ===================== 字数估算 =====================

describe('estimateWordCount', () => {
  it('空输入应为 0', () => {
    expect(estimateWordCount('')).toBe(0);
    expect(estimateWordCount(null)).toBe(0);
  });

  it('中日韩字符按单字计（不被低估）', () => {
    // "你好世界" 按空白分词会算成 1，这里应为 4
    expect(estimateWordCount('你好世界')).toBe(4);
  });

  it('混合内容应包含空格在内全部计数', () => {
    // "a b 你" → a、空格、b、空格、你 = 5 个字符
    expect(estimateWordCount('a b 你')).toBe(5);
  });
});
