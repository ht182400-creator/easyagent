import { Component, type ReactNode } from 'react';
import ReactMarkdown from 'react-markdown';
import type { Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { oneLight } from 'react-syntax-highlighter/dist/esm/styles/prism';
import { useDocStore } from '../stores/docStore';
import { resolveWikiLink } from '../services/wikiLinkParser';

/**
 * SyntaxHighlighter 错误边界
 * 防止 SyntaxHighlighter 内部访问不存在的 DOM 节点导致白屏
 */
class SyntaxErrorBoundary extends Component<
  { children: ReactNode },
  { hasError: boolean }
> {
  constructor(props: { children: ReactNode }) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  render() {
    if (this.state.hasError) {
      return <code className="text-sm text-slate-600">[代码块渲染失败]</code>;
    }
    return this.props.children;
  }
}

/**
 * Markdown 预览组件
 * 支持 WikiLink 点击跳转 (支持相对路径)
 */
interface MarkdownPreviewProps {
  docId: string;
}

export function MarkdownPreview({ docId }: MarkdownPreviewProps) {
  const { docs, selectDoc } = useDocStore();
  const doc = docs.get(docId);

  if (!doc) {
    return (
      <div className="flex h-full items-center justify-center text-slate-400">
        文档不存在或已被移除
      </div>
    );
  }

  // 构建路径索引用于解析相对链接
  const pathIndex = new Map<string, string>();
  for (const d of docs.values()) {
    pathIndex.set(d.path.toLowerCase(), d.id);
    pathIndex.set(d.id.toLowerCase(), d.id);
    pathIndex.set(d.id.replace(/\.md$/i, '').toLowerCase(), d.id);
  }

  // 自定义 WikiLink 组件
  const WikiLink = ({ href, children }: { href?: string; children?: React.ReactNode }) => {
    if (!href) return <>{children}</>;

    const targetId = resolveWikiLink(href, doc.path, pathIndex);
    const exists = targetId !== null;

    return (
      <button
        onClick={() => targetId && selectDoc(targetId)}
        className={`inline text-sm font-medium underline-offset-2 hover:underline ${
          exists ? 'text-indigo-600' : 'text-red-500 line-through'
        }`}
        title={exists ? '点击查看' : `目标文档不存在: ${href}`}
      >
        {children}
      </button>
    );
  };

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-sidebar-border px-5 py-3">
        <h1 className="text-lg font-semibold text-slate-900">{doc.name}</h1>
        <p className="text-xs text-slate-500">{doc.path}</p>
        <div className="mt-2 flex gap-3 text-xs text-slate-500">
          <span>出链: {doc.links.length}</span>
          <span>反链: {doc.backlinks.length}</span>
        </div>
      </div>

      <div className="flex-1 overflow-auto px-5 py-4">
        <article className="prose prose-sm max-w-none prose-indigo">
          <ReactMarkdown
            remarkPlugins={[remarkGfm]}
            components={{
              code: ({ className, children }) => {
                const match = /language-(\w+)/.exec(className || '');
                const text = String(children).replace(/\n$/, '');
                return match ? (
                  <SyntaxErrorBoundary>
                    <SyntaxHighlighter
                      style={oneLight as any}
                      language={match[1]}
                      PreTag="div"
                    >
                      {text}
                    </SyntaxHighlighter>
                  </SyntaxErrorBoundary>
                ) : (
                  <code className={className}>{children}</code>
                );
              },
              a: ({ href, children }) => {
                if (href && !href.startsWith('http')) {
                  return <WikiLink href={href}>{children}</WikiLink>;
                }
                return (
                  <a
                    href={href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-indigo-600"
                  >
                    {children}
                  </a>
                );
              },
            } as Components}
          >
            {doc.content || ''}
          </ReactMarkdown>
        </article>
      </div>
    </div>
  );
}
