import { ChevronRight, ChevronDown, FileText, Folder } from 'lucide-react';
import { useState } from 'react';
import { useDocStore } from '../stores/docStore';
import type { DocNode } from '../types';

/**
 * 左侧文件树组件
 * 目录/文件名左侧显示与图谱节点相同的分组颜色
 */
export function FileTree() {
  const { rootNodes, selectedDocId, selectDoc, groupColorMap } = useDocStore();

  return (
    <div className="h-full overflow-auto p-3">
      <h2 className="mb-3 px-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
        文档目录
      </h2>
      <ul className="space-y-0.5">
        {rootNodes.map((node) => (
          <TreeNode
            key={node.id}
            node={node}
            level={0}
            selectedId={selectedDocId}
            onSelect={selectDoc}
            groupColorMap={groupColorMap}
          />
        ))}
      </ul>
    </div>
  );
}

interface TreeNodeProps {
  node: DocNode;
  level: number;
  selectedId: string | null;
  onSelect: (id: string) => void;
  /** 分组名 → 颜色（与图谱共用） */
  groupColorMap: Map<string, string>;
}

/**
 * 获取当前节点对应的分组颜色
 * - 文件：取 path 的第一段目录名
 * - 目录：取自身 name
 */
function getNodeColor(node: DocNode, colorMap: Map<string, string>): string {
  if (node.type === 'folder') {
    return colorMap.get(node.name) ?? '#64748b';
  }
  const group = node.path.split('/')[0] || node.name;
  return colorMap.get(group) ?? '#64748b';
}

function TreeNode({ node, level, selectedId, onSelect, groupColorMap }: TreeNodeProps) {
  const [expanded, setExpanded] = useState(true);
  const isSelected = node.id === selectedId;
  const hasChildren = node.children && node.children.length > 0;
  const nodeColor = getNodeColor(node, groupColorMap);

  return (
    <li>
      <div
        className={`
          flex cursor-pointer items-center rounded-md px-2 py-1 text-sm
          hover:bg-slate-100
          ${isSelected ? 'bg-indigo-50 text-indigo-700' : 'text-slate-700'}
        `}
        style={{ paddingLeft: `${level * 12 + 8}px` }}
        onClick={() => {
          if (node.type === 'file') {
            onSelect(node.id);
          } else {
            setExpanded(!expanded);
          }
        }}
      >
        {hasChildren ? (
          <span
            className="mr-1 text-slate-400"
            onClick={(e) => {
              e.stopPropagation();
              setExpanded(!expanded);
            }}
          >
            {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
          </span>
        ) : (
          <span className="mr-1 w-3.5" />
        )}

        {/* 分组色块（与图谱节点同色） */}
        <span
          className="mr-2 inline-block h-2.5 w-2.5 flex-shrink-0 rounded-full"
          style={{ backgroundColor: nodeColor }}
          aria-hidden
        />

        {node.type === 'folder' ? (
          <Folder size={14} className="mr-1.5 text-slate-400" />
        ) : (
          <FileText size={14} className="mr-1.5 text-slate-400" />
        )}

        <span className="truncate">{node.name}</span>
      </div>

      {hasChildren && expanded && (
        <ul className="mt-0.5">
          {node.children!.map((child) => (
            <TreeNode
              key={child.id}
              node={child}
              level={level + 1}
              selectedId={selectedId}
              onSelect={onSelect}
              groupColorMap={groupColorMap}
            />
          ))}
        </ul>
      )}
    </li>
  );
}
