import type { SimulationNodeDatum } from 'd3';

/**
 * 文档项目核心类型定义
 */

/** 文档节点类型 */
export interface DocNode {
  /** 相对路径，作为唯一标识 */
  id: string;
  /** 显示名称 */
  name: string;
  /** 节点类型 */
  type: 'file' | 'folder';
  /** 完整相对路径 */
  path: string;
  /** 子节点 (仅 folder) */
  children?: DocNode[];
  /** 文档内容 (仅 file) */
  content?: string;
  /** 出链：该文档引用的其他文档 ID 列表 */
  links: string[];
  /** 反链：引用该文档的其他文档 ID 列表 */
  backlinks: string[];
}

/** 图谱节点 (继承 D3 SimulationNodeDatum) */
export interface GraphNode extends SimulationNodeDatum {
  id: string;
  label: string;
  /** 按目录分组的类别 */
  group: string;
  /** 节点半径，基于连接数计算 */
  radius: number;
  /** 连接数，用于决定分组聚集强度 */
  connectionCount: number;
}

/** 边类型：强关联（Markdown 链接） vs 弱关联（关键字共现） */
export type LinkType = 'strong' | 'weak';

/** 图谱边 */
export interface GraphLink {
  source: string;
  target: string;
  /** 关联类型 */
  type: LinkType;
}

/** 图谱数据 */
export interface GraphData {
  nodes: GraphNode[];
  links: GraphLink[];
}

/** 搜索结果 */
export interface SearchResult {
  id: string;
  title: string;
  path: string;
  /** 匹配片段 */
  snippet: string;
  /** 匹配分数 */
  score: number;
}

/** 图谱显示模式 */
export type GraphMode = 'global' | 'neighbors';

/** 应用设置 */
export interface AppSettings {
  /** 已打开的目录名 */
  directoryName: string | null;
  /** 图谱模式 */
  graphMode: GraphMode;
  /** 搜索结果数量限制 */
  searchLimit: number;
  /** 代码块主题 */
  codeTheme: 'light' | 'dark';
}
