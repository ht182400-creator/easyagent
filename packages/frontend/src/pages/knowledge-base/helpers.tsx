/**
 * 知识库页面 - 公共辅助（P2-1 拆分产物，自 KnowledgeBase.tsx 纯搬迁）
 *
 * @module pages/knowledge-base/helpers
 */

import {
  Upload,
  Search,
  FolderTree,
  BookOpen,
  FileText,
  FileCode,
  Link,
  File,
  Folder,
} from 'lucide-react';

/** 功能卡片 */
export const FEATURES = [
  {
    icon: Upload,
    title: '文档导入',
    desc: '支持 Markdown、代码文件、文本文件的文档导入和手动输入',
    color: 'text-blue-400',
    action: 'import' as const,
  },
  {
    icon: Search,
    title: '智能搜索',
    desc: '基于标题、标签、分类和内容的多维度全文检索',
    color: 'text-green-400',
    action: 'search' as const,
  },
  {
    icon: FolderTree,
    title: '分类管理',
    desc: '6个预设分类 + 自定义标签，轻松组织知识文档',
    color: 'text-purple-400',
    action: 'category' as const,
  },
];

/** 分类图标映射 */
export const CATEGORY_ICONS: Record<string, React.FC<{ className?: string }>> = {
  api: FileCode,
  guide: BookOpen,
  note: FileText,
  reference: Link,
  spec: File,
  general: Folder,
};

/** 格式化文件大小 */
export function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}
