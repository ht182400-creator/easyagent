import { describe, it, expect } from 'vitest';
import { extractWikiLinks, rebuildLinks, resolveWikiLink } from '../src/services/wikiLinkParser';
import type { DocNode } from '../src/types';

describe('wikiLinkParser', () => {
  it('应提取简单 WikiLink', () => {
    const content = '请参考 [[01_整体架构]] 文档';
    expect(extractWikiLinks(content)).toEqual(['01_整体架构.md']);
  });

  it('应提取带显示文本的 WikiLink', () => {
    const content = '请参考 [[01_整体架构|架构设计]]';
    expect(extractWikiLinks(content)).toEqual(['01_整体架构.md']);
  });

  it('应去重多个相同链接', () => {
    const content = '[[A]] 和 [[A]] 是同一个';
    expect(extractWikiLinks(content)).toEqual(['A.md']);
  });

  it('应保留已有扩展名', () => {
    const content = '[[config.json]]';
    expect(extractWikiLinks(content)).toEqual(['config.json']);
  });

  it('rebuildLinks 应正确构建 backlinks', () => {
    const docs: DocNode[] = [
      { id: 'A.md', name: 'A', type: 'file', path: 'A.md', content: '[[B]]', links: [], backlinks: [] },
      { id: 'B.md', name: 'B', type: 'file', path: 'B.md', content: '', links: [], backlinks: [] },
    ];

    rebuildLinks(docs);

    expect(docs[0].links).toContain('B.md');
    expect(docs[1].backlinks).toContain('A.md');
  });

  describe('resolveWikiLink', () => {
    it('应解析同级文档链接', () => {
      const index = new Map([['01_整体架构.md'.toLowerCase(), '01_整体架构.md']]);
      expect(resolveWikiLink('01_整体架构.md', '00_项目规划.md', index)).toBe('01_整体架构.md');
    });

    it('应解析不带扩展名的链接', () => {
      const index = new Map([['01_整体架构.md'.toLowerCase(), '01_整体架构.md']]);
      expect(resolveWikiLink('01_整体架构', '00_项目规划.md', index)).toBe('01_整体架构.md');
    });

    it('应解析相对路径 ../ 链接', () => {
      const index = new Map([
        ['docs/00_项目规划.md'.toLowerCase(), 'docs/00_项目规划.md'],
        ['README.md'.toLowerCase(), 'README.md'],
      ]);
      expect(resolveWikiLink('../README.md', 'docs/00_项目规划.md', index)).toBe('README.md');
    });

    it('应解析子目录链接', () => {
      const index = new Map([
        ['docs/00_项目规划.md'.toLowerCase(), 'docs/00_项目规划.md'],
        ['docs/sub/详细设计.md'.toLowerCase(), 'docs/sub/详细设计.md'],
      ]);
      expect(resolveWikiLink('sub/详细设计.md', 'docs/00_项目规划.md', index)).toBe(
        'docs/sub/详细设计.md',
      );
    });

    it('无法解析时应返回 null', () => {
      const index = new Map<string, string>();
      expect(resolveWikiLink('不存在的文档', '00_项目规划.md', index)).toBeNull();
    });
  });
});
