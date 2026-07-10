import type { DocNode, GraphData, GraphNode, GraphLink } from '../types';
import type { CooccurrencePair } from './keywordCooccurrence';

/**
 * 根据文档节点构建 D3 力导向图数据
 * @param docs 文档节点列表
 * @param weakPairs 关键字共现的弱关联边（可选）
 */
export function buildGraphData(docs: DocNode[], weakPairs?: CooccurrencePair[]): GraphData {
  const nodes: GraphNode[] = docs.map((doc) => {
    const connectionCount = doc.links.length + doc.backlinks.length;
    return {
      id: doc.id,
      label: doc.name,
      group: extractGroup(doc.path),
      radius: Math.max(5, Math.min(20, 5 + connectionCount * 2)),
      connectionCount,
    };
  });

  const links: GraphLink[] = [];
  const added = new Set<string>();

  // 强关联：Markdown 链接
  for (const doc of docs) {
    for (const targetId of doc.links) {
      // 忽略指向非文档文件 (如 .json/.html)
      if (!targetId.endsWith('.md')) continue;

      const key = [doc.id, targetId].sort().join('->');
      if (!added.has(key)) {
        links.push({ source: doc.id, target: targetId, type: 'strong' });
        added.add(key);
      }
    }
  }

  // 弱关联：关键字共现（跳过已有强关联的文档对）
  if (weakPairs) {
    for (const pair of weakPairs) {
      const key = [pair.sourceId, pair.targetId].sort().join('->');
      if (!added.has(key)) {
        links.push({ source: pair.sourceId, target: pair.targetId, type: 'weak' });
        added.add(key);
      }
    }
  }

  return { nodes, links };
}

/**
 * 过滤出与指定节点相关的邻居图谱
 * 包含：当前节点 + 直接出链/反链节点
 */
export function filterGraphByNeighbors(graph: GraphData, centerId: string): GraphData {
  const relatedIds = new Set<string>([centerId]);

  for (const link of graph.links) {
    const sourceId = typeof link.source === 'string' ? link.source : (link.source as GraphNode).id;
    const targetId = typeof link.target === 'string' ? link.target : (link.target as GraphNode).id;

    if (sourceId === centerId) relatedIds.add(targetId);
    if (targetId === centerId) relatedIds.add(sourceId);
  }

  const nodes = graph.nodes.filter((node) => relatedIds.has(node.id));
  const nodeSet = new Set(nodes.map((n) => n.id));
  const links = graph.links.filter((link) => {
    const sourceId = typeof link.source === 'string' ? link.source : (link.source as GraphNode).id;
    const targetId = typeof link.target === 'string' ? link.target : (link.target as GraphNode).id;
    return nodeSet.has(sourceId) && nodeSet.has(targetId);
  });

  return { nodes, links };
}

/**
 * 从路径提取分组 (用于节点着色)
 */
function extractGroup(path: string): string {
  const parts = path.split('/');
  if (parts.length <= 1) return 'root';
  return parts[0];
}
