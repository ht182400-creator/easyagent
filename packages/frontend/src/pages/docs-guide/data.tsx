/**
 * 文档导读页面 - 数据定义（P2-1 拆分产物，自 DocsGuide.tsx 纯搬迁）
 *
 * 内容：类型定义 / 图标映射 / 按角色分组的阅读路径 / 陷阱速查 / 关键链接。
 * 数据来自 docs/README.md 的导航结构 —— 改 docs/README.md 导航时同步这里。
 *
 * @module pages/docs-guide/data
 */

import {
  BookOpen,
  Users,
  Code2,
  Rocket,
  Bug,
  Shield,
  FileText,
  Zap,
  Layers,
  GitBranch,
  Package,
  BarChart3,
  Terminal,
  AlertTriangle,
} from 'lucide-react';

// ==================== 类型定义 ====================

/** 文档卡片数据结构 */
export interface DocCard {
  id: string;
  /** 文件名 */
  file: string;
  /** 显示标题 */
  title: string;
  /** 一句话描述 */
  desc: string;
  /** 图标标识 */
  icon: string;
  /** 强制等级 */
  level?: 'required' | 'recommended' | 'optional';
}

/** 角色信息 */
export interface RoleGuide {
  id: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  desc: string;
  /** 主题色 hex 值（用于SVG等） */
  colorHex: string;
  color: string;
  bgColor: string;
  borderColor: string;
  textColor: string;
  glowColor: string;
  /** 序号圆点激活样式（预计算，避免 Tailwind JIT 动态类名失效） */
  badgeBg: string;
  badgeText: string;
  badgeRing: string;
  iconRing: string;
  /** 标签指示器样式 */
  indicatorBg: string;
  indicatorShadow: string;
  /** 详情面板内管道渐变 */
  pipeGradient: string;
  /** 详情面板头部 ring */
  headerRing: string;
  docs: DocCard[];
}

// ==================== 数据定义（来自 docs/README.md） ====================

/** 图标映射（使用 lucide 组件名） */
export const iconComponents: Record<string, React.ComponentType<{ className?: string }>> = {
  BookOpen,
  FileText,
  Shield,
  Zap,
  Layers,
  Code2,
  Package,
  BarChart3,
  Terminal,
  GitBranch,
  AlertTriangle,
  Bug,
  Rocket,
};

export const SUPPORTED_ICONS = [
  'BookOpen',
  'FileText',
  'Shield',
  'Zap',
  'Layers',
  'Code2',
  'Package',
  'BarChart3',
  'Terminal',
  'GitBranch',
  'AlertTriangle',
  'Bug',
  'Rocket',
];

/** 按角色分组的文档阅读路径 */
export const roleGuides: RoleGuide[] = [
  {
    id: 'all',
    label: '所有人',
    icon: Users,
    desc: '新人入职必读，10分钟快速了解项目',
    colorHex: '#60a5fa',
    color: 'blue',
    bgColor: 'bg-blue-500/10',
    borderColor: 'border-blue-500/30',
    textColor: 'text-blue-400',
    glowColor: 'shadow-blue-500/20',
    badgeBg: 'bg-blue-500/20',
    badgeText: 'text-blue-300',
    badgeRing: 'ring-1 ring-blue-500/30',
    iconRing: 'ring-1 ring-blue-500/20',
    indicatorBg: 'bg-blue-400',
    indicatorShadow: 'shadow-blue-400/50',
    pipeGradient: 'from-blue-500/30 to-blue-500/10',
    headerRing: 'ring-1 ring-blue-500/5',
    docs: [
      {
        id: '00',
        file: '00_新手上手指南.md',
        title: '新手上手指南',
        desc: '从克隆代码到第一次发布的完整步行',
        icon: 'BookOpen',
        level: 'required',
      },
      {
        id: '14',
        file: '14_构建前必检清单.md',
        title: '构建前必检清单',
        desc: '30秒救命清单，每次构建前看',
        icon: 'Shield',
        level: 'required',
      },
      {
        id: '12',
        file: '12_项目启动与运行方式指南.md',
        title: '项目启动指南',
        desc: '如何启动后端/前端',
        icon: 'Terminal',
        level: 'required',
      },
    ],
  },
  {
    id: 'dev',
    label: '开发者',
    icon: Code2,
    desc: '写代码时的必备知识',
    colorHex: '#34d399',
    color: 'emerald',
    bgColor: 'bg-emerald-500/10',
    borderColor: 'border-emerald-500/30',
    textColor: 'text-emerald-400',
    glowColor: 'shadow-emerald-500/20',
    badgeBg: 'bg-emerald-500/20',
    badgeText: 'text-emerald-300',
    badgeRing: 'ring-1 ring-emerald-500/30',
    iconRing: 'ring-1 ring-emerald-500/20',
    indicatorBg: 'bg-emerald-400',
    indicatorShadow: 'shadow-emerald-400/50',
    pipeGradient: 'from-emerald-500/30 to-emerald-500/10',
    headerRing: 'ring-1 ring-emerald-500/5',
    docs: [
      {
        id: '37',
        file: '37_双重构建体系详解_Desktop与Web.md',
        title: '双重构建体系详解',
        desc: '理解构建流程',
        icon: 'Layers',
        level: 'required',
      },
      {
        id: '11',
        file: '11_构建链路对照表_tsup_asar_inline详解.md',
        title: '构建链路对照表',
        desc: '源码 → 产物的映射关系',
        icon: 'GitBranch',
        level: 'required',
      },
      {
        id: '02',
        file: '02_架构设计文档_ADD.md',
        title: '架构设计文档',
        desc: '完整技术架构 v5.4',
        icon: 'BarChart3',
        level: 'recommended',
      },
      {
        id: '36',
        file: '36_调试日志规范体系.md',
        title: '调试日志规范体系',
        desc: '怎么写 debug 日志',
        icon: 'FileText',
        level: 'optional',
      },
      {
        id: '39',
        file: '39_CHANGELOG自动生成机制_三级Fallback.md',
        title: 'CHANGELOG 自动生成',
        desc: 'CHANGELOG 怎么来的',
        icon: 'Zap',
        level: 'optional',
      },
    ],
  },
  {
    id: 'publisher',
    label: '发布者',
    icon: Rocket,
    desc: '发版本时的完整流程',
    colorHex: '#a78bfa',
    color: 'purple',
    bgColor: 'bg-purple-500/10',
    borderColor: 'border-purple-500/30',
    textColor: 'text-purple-400',
    glowColor: 'shadow-purple-500/20',
    badgeBg: 'bg-purple-500/20',
    badgeText: 'text-purple-300',
    badgeRing: 'ring-1 ring-purple-500/30',
    iconRing: 'ring-1 ring-purple-500/20',
    indicatorBg: 'bg-purple-400',
    indicatorShadow: 'shadow-purple-400/50',
    pipeGradient: 'from-purple-500/30 to-purple-500/10',
    headerRing: 'ring-1 ring-purple-500/5',
    docs: [
      {
        id: '38',
        file: '38_双通道发布指南_本地vs服务器.md',
        title: '双通道发布指南',
        desc: '两种发布方式对比',
        icon: 'GitBranch',
        level: 'required',
      },
      {
        id: '40',
        file: '40_发布产物与自动化流程详解_面向新手.md',
        title: '发布产物与自动化流程',
        desc: 'latest.yml / release.yml 是什么',
        icon: 'Package',
        level: 'required',
      },
      {
        id: '06',
        file: '06_版本发布与CI-CD流程指南.md',
        title: 'CI/CD 流程指南',
        desc: 'CI/CD 全流程',
        icon: 'Rocket',
        level: 'recommended',
      },
      {
        id: '05',
        file: '05_Desktop_EXE打包标准流程.md',
        title: 'Desktop EXE 打包流程',
        desc: '打包技术细节',
        icon: 'Zap',
        level: 'recommended',
      },
      {
        id: '07',
        file: '07_自动更新分发方案对比.md',
        title: '自动更新分发方案',
        desc: 'GitHub/R2/COS 等 5 方案',
        icon: 'Layers',
        level: 'optional',
      },
    ],
  },
  {
    id: 'troubleshooter',
    label: '排查者',
    icon: Bug,
    desc: '出问题时的救命文档',
    colorHex: '#fbbf24',
    color: 'amber',
    bgColor: 'bg-amber-500/10',
    borderColor: 'border-amber-500/30',
    textColor: 'text-amber-400',
    glowColor: 'shadow-amber-500/20',
    badgeBg: 'bg-amber-500/20',
    badgeText: 'text-amber-300',
    badgeRing: 'ring-1 ring-amber-500/30',
    iconRing: 'ring-1 ring-amber-500/20',
    indicatorBg: 'bg-amber-400',
    indicatorShadow: 'shadow-amber-400/50',
    pipeGradient: 'from-amber-500/30 to-amber-500/10',
    headerRing: 'ring-1 ring-amber-500/5',
    docs: [
      {
        id: 'mem',
        file: 'MEMORY.md (.codebuddy/memory/)',
        title: '陷阱清单 62 条',
        desc: '高频问题速查',
        icon: 'AlertTriangle',
        level: 'required',
      },
      {
        id: '35',
        file: '35_MODULE_VERSION问题分析与根治方案.md',
        title: 'MODULE_VERSION 问题',
        desc: '服务端 better-sqlite3 必读（桌面已内置驱动）',
        icon: 'Bug',
        level: 'required',
      },
      {
        id: '04',
        file: '04_CORS修复深度复盘_编译链与假成功陷阱.md',
        title: 'CORS 修复深度复盘',
        desc: '编译链与假成功陷阱',
        icon: 'Shield',
        level: 'recommended',
      },
      {
        id: '10',
        file: '10_Desktop连接失败深度排查_React竞态条件修复.md',
        title: 'Desktop 连接失败排查',
        desc: 'React 竞态条件修复',
        icon: 'AlertTriangle',
        level: 'recommended',
      },
    ],
  },
];

// ==================== 通用背景数据 ====================

/** 陷阱速查（高频） */
export const traps = [
  { id: '9', title: 'better-sqlite3 编译失败', fix: '用预编译 .node + npmRebuild:false' },
  { id: '21', title: 'mime 缺失 Express 500', fix: 'desktop 显式添加 mime@^1.6.0' },
  { id: '22', title: 'MODULE_VERSION 不一致', fix: '构建前跑 build.bat Phase 2.5' },
  { id: '29', title: 'production CSS 布局错乱', fix: 'tailwind content 加 frontend 路径' },
  { id: '33', title: 'electron-rebuild 静默跳过', fix: '用 node-gyp rebuild' },
];

/** 关键链接 */
export const keyLinks = [
  { label: 'GitHub 仓库', url: 'https://github.com/ht182400-creator/easyagent' },
  { label: 'GitHub Releases', url: 'https://github.com/ht182400-creator/easyagent/releases' },
  { label: 'CI/CD 流水线', url: 'https://github.com/ht182400-creator/easyagent/actions' },
  { label: '本地后端', url: 'http://127.0.0.1:3456' },
  { label: '管线仪表板', url: 'http://127.0.0.1:8899' },
];
