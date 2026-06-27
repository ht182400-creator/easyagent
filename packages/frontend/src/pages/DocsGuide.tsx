/**
 * EasyAgent 文档导读页面 v2.0
 * 按角色展示推荐阅读路径，流线型管道卡片布局
 * 设计理念: 玻璃态卡片 + SVG流线箭头 + 微交互动效
 */
import { useState, useRef, useEffect, useCallback } from 'react';
import {
  BookOpen,
  Users,
  Code2,
  Rocket,
  Bug,
  X,
  Shield,
  FileText,
  Zap,
  Layers,
  GitBranch,
  Package,
  BarChart3,
  Terminal,
  AlertTriangle,
  ExternalLink,
} from 'lucide-react';

// ==================== 类型定义 ====================

/** 文档卡片数据结构 */
interface DocCard {
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
interface RoleGuide {
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
const iconComponents: Record<string, React.ComponentType<{ className?: string }>> = {
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

const SUPPORTED_ICONS = [
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
const roleGuides: RoleGuide[] = [
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
        title: '陷阱清单 37 条',
        desc: '高频问题速查',
        icon: 'AlertTriangle',
        level: 'required',
      },
      {
        id: '35',
        file: '35_MODULE_VERSION问题分析与根治方案.md',
        title: 'MODULE_VERSION 问题',
        desc: 'better-sqlite3 必读',
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
const traps = [
  { id: '9', title: 'better-sqlite3 编译失败', fix: '用预编译 .node + npmRebuild:false' },
  { id: '21', title: 'mime 缺失 Express 500', fix: 'desktop 显式添加 mime@^1.6.0' },
  { id: '22', title: 'MODULE_VERSION 不一致', fix: '构建前跑 build.bat Phase 2.5' },
  { id: '29', title: 'production CSS 布局错乱', fix: 'tailwind content 加 frontend 路径' },
  { id: '33', title: 'electron-rebuild 静默跳过', fix: '用 node-gyp rebuild' },
];

/** 关键链接 */
const keyLinks = [
  { label: 'GitHub 仓库', url: 'https://github.com/ht182400-creator/easyagent' },
  { label: 'GitHub Releases', url: 'https://github.com/ht182400-creator/easyagent/releases' },
  { label: 'CI/CD 流水线', url: 'https://github.com/ht182400-creator/easyagent/actions' },
  { label: '本地后端', url: 'http://127.0.0.1:3456' },
  { label: '管线仪表板', url: 'http://127.0.0.1:8899' },
];

// ==================== 组件 ====================

/** 等级徽章配置 */
const LEVEL_CONFIG: Record<string, { label: string; colors: string }> = {
  required: { label: '必读', colors: 'bg-red-500/10 text-red-400 border-red-500/20' },
  recommended: { label: '推荐', colors: 'bg-amber-500/10 text-amber-400 border-amber-500/20' },
  optional: { label: '了解', colors: 'bg-slate-500/10 text-slate-400 border-slate-500/20' },
};

/** 流线型 SVG 管道箭头 */
function FlowArrow({ colorHex }: { colorHex: string }) {
  return (
    <div className="flex items-center shrink-0 px-1.5">
      <svg
        width="36"
        height="24"
        viewBox="0 0 36 24"
        fill="none"
        className="opacity-40 group-hover/row:opacity-70 transition-opacity"
      >
        <defs>
          <linearGradient
            id={`grad-${colorHex.replace('#', '')}`}
            x1="0"
            y1="12"
            x2="36"
            y2="12"
            gradientUnits="userSpaceOnUse"
          >
            <stop stopColor={colorHex} stopOpacity="0.1" />
            <stop offset="0.5" stopColor={colorHex} stopOpacity="0.35" />
            <stop offset="1" stopColor={colorHex} stopOpacity="0.1" />
          </linearGradient>
        </defs>
        {/* 流线主体 */}
        <line
          x1="0"
          y1="12"
          x2="26"
          y2="12"
          stroke={`url(#grad-${colorHex.replace('#', '')})`}
          strokeWidth="1.5"
          strokeLinecap="round"
        />
        {/* 右侧箭头 */}
        <path
          d="M24 7L30 12L24 17"
          stroke={colorHex}
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="none"
          opacity="0.5"
        />
        {/* 流动粒子 */}
        <circle cx="8" cy="12" r="2" fill={colorHex} opacity="0.3">
          <animate attributeName="cx" from="4" to="22" dur="2s" repeatCount="indefinite" />
          <animate attributeName="opacity" from="0.3" to="0.6" dur="2s" repeatCount="indefinite" />
        </circle>
      </svg>
    </div>
  );
}

/** 文档卡片节点（流程图中的单个卡片） */
function FlowCard({
  card,
  index,
  textColor,
  borderColor,
  bgColor,
  glowColor,
  badgeBg,
  badgeText,
  badgeRing,
  iconRing,
  onClick,
  isActive,
}: {
  card: DocCard;
  index: number;
  textColor: string;
  borderColor: string;
  bgColor: string;
  glowColor: string;
  /** 预计算的 Tailwind 类名（避免 JIT 动态类名失效） */
  badgeBg: string;
  badgeText: string;
  badgeRing: string;
  iconRing: string;
  onClick: () => void;
  isActive: boolean;
}) {
  const IconComp = SUPPORTED_ICONS.includes(card.icon) ? iconComponents[card.icon] : FileText;
  const levelCfg = card.level ? LEVEL_CONFIG[card.level] : null;

  return (
    <button
      onClick={onClick}
      className={`group/card relative flex flex-col items-start gap-2.5 p-4 rounded-2xl border text-left
        transition-all duration-300 cursor-pointer min-w-[230px] max-w-[270px]
        ${
          isActive
            ? `${bgColor} ${borderColor} shadow-lg ${glowColor} scale-[1.03]`
            : 'bg-[#0d1117]/80 backdrop-blur-sm border-white/[0.05] hover:border-white/[0.1] hover:bg-[#111820]/90 hover:shadow-md hover:shadow-black/20'
        }`}
      style={{ animationDelay: `${index * 80}ms` }}
    >
      {/* 顶部栏：序号 + 等级徽章 */}
      <div className="flex items-center justify-between w-full">
        {/* 序号圆点 */}
        <div
          className={`
          flex items-center justify-center w-5 h-5 rounded-full text-[10px] font-bold leading-none
          transition-all duration-300
          ${
            isActive
              ? `${badgeBg} ${badgeText} ${badgeRing}`
              : 'bg-white/[0.04] text-gray-600 group-hover/card:text-gray-400'
          }
        `}
        >
          {index + 1}
        </div>
        {/* 等级徽章 */}
        {levelCfg && (
          <span
            className={`text-[10px] px-2 py-0.5 rounded-full font-medium border ${levelCfg.colors} transition-opacity ${isActive ? 'opacity-100' : 'opacity-60 group-hover/card:opacity-100'}`}
          >
            {levelCfg.label}
          </span>
        )}
      </div>

      {/* 图标 + 标题 */}
      <div className="flex items-center gap-2.5">
        <div
          className={`
          p-1.5 rounded-lg transition-all duration-300
          ${isActive ? `${bgColor} ${iconRing}` : 'bg-white/[0.02] group-hover/card:bg-white/[0.04]'}
        `}
        >
          <IconComp
            className={`w-4 h-4 ${isActive ? textColor : 'text-gray-500 group-hover/card:text-gray-400'} transition-colors`}
          />
        </div>
        <span
          className={`text-[13px] font-semibold leading-snug ${isActive ? textColor : 'text-gray-200 group-hover/card:text-white'} transition-colors`}
        >
          {card.title}
        </span>
      </div>

      {/* 描述 */}
      <span className="text-[11px] text-gray-500 group-hover/card:text-gray-400 leading-relaxed line-clamp-2 transition-colors">
        {card.desc}
      </span>

      {/* 文件路径 */}
      <div className="flex items-center gap-1 mt-auto pt-1 border-t border-white/[0.03] w-full">
        <code className="text-[10px] px-1.5 py-0.5 rounded font-mono text-gray-600 group-hover/card:text-gray-500 transition-colors">
          docs/{card.file}
        </code>
      </div>
    </button>
  );
}

/** 详情面板（点击卡片后优雅滑出） */
function DetailPanel({
  card,
  roleGuide,
  onClose,
}: {
  card: DocCard | null;
  roleGuide: RoleGuide | null;
  onClose: () => void;
}) {
  if (!card || !roleGuide) return null;

  const IconComp = SUPPORTED_ICONS.includes(card.icon) ? iconComponents[card.icon] : FileText;
  const levelCfg = card.level ? LEVEL_CONFIG[card.level] : null;

  return (
    <div
      className="fixed inset-y-0 right-0 w-[440px] bg-[#0a0e14]/98 backdrop-blur-2xl border-l border-white/[0.06]
      shadow-2xl shadow-black/60 z-50 docsguide-slide-in-right flex flex-col"
    >
      {/* 头部 - 渐变背景 */}
      <div className="relative p-6 border-b border-white/[0.05] overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-white/[0.02] to-transparent pointer-events-none" />
        <div className="relative flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div
              className={`p-2.5 rounded-xl ${roleGuide.bgColor} border ${roleGuide.borderColor} ${roleGuide.headerRing}`}
            >
              <roleGuide.icon className={`w-5 h-5 ${roleGuide.textColor}`} />
            </div>
            <div>
              <div className="text-[11px] text-gray-500 uppercase tracking-wider">
                {roleGuide.label} 路径
              </div>
              <div className="text-sm font-semibold text-gray-100 mt-0.5">{card.title}</div>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-xl hover:bg-white/[0.05] text-gray-500 hover:text-gray-300 transition-all hover:scale-110 active:scale-95"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* 内容区 */}
      <div className="flex-1 p-6 space-y-6 overflow-y-auto custom-scrollbar">
        {/* 文档信息卡 */}
        <div className="p-4 rounded-2xl bg-white/[0.02] border border-white/[0.04] space-y-3">
          <div className="flex items-center gap-2.5">
            <IconComp className={`w-5 h-5 ${roleGuide.textColor}`} />
            <span className={`text-base font-semibold ${roleGuide.textColor}`}>{card.title}</span>
          </div>
          <p className="text-[13px] text-gray-400 leading-relaxed">{card.desc}</p>

          <div className="flex items-center gap-2 p-2.5 rounded-xl bg-[#0d1117] border border-white/[0.04]">
            <FileText className="w-3.5 h-3.5 text-gray-500 shrink-0" />
            <code className="text-[12px] text-gray-400 break-all font-mono">docs/{card.file}</code>
          </div>

          {levelCfg && (
            <div className="flex items-center gap-2">
              <span className="text-[11px] text-gray-500">优先级</span>
              <span
                className={`text-[11px] px-2.5 py-1 rounded-full font-medium border ${levelCfg.colors}`}
              >
                {levelCfg.label}
              </span>
            </div>
          )}
        </div>

        {/* 完整路径 */}
        <div className="space-y-3">
          <div className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider flex items-center gap-2">
            <div className="w-1 h-3 rounded-full bg-gradient-to-b from-transparent via-current to-transparent opacity-30" />
            {roleGuide.label} · 完整阅读路径
          </div>
          <div className="space-y-1.5">
            {roleGuide.docs.map((doc, i) => {
              const isCurrent = doc.id === card.id;
              const DocIcon = SUPPORTED_ICONS.includes(doc.icon)
                ? iconComponents[doc.icon]
                : FileText;
              return (
                <div
                  key={doc.id}
                  className={`
                  flex items-center gap-3 p-2.5 rounded-xl transition-all duration-200
                  ${
                    isCurrent
                      ? `${roleGuide.bgColor} border ${roleGuide.borderColor} shadow-sm`
                      : 'hover:bg-white/[0.02] border border-transparent'
                  }
                `}
                >
                  <span
                    className={`text-[10px] font-bold w-5 text-center leading-none ${isCurrent ? roleGuide.textColor : 'text-gray-600'}`}
                  >
                    {i + 1}
                  </span>
                  <DocIcon
                    className={`w-3.5 h-3.5 shrink-0 ${isCurrent ? roleGuide.textColor : 'text-gray-600'}`}
                  />
                  <span
                    className={`text-[12px] font-medium truncate flex-1 ${isCurrent ? roleGuide.textColor : 'text-gray-400'}`}
                  >
                    {doc.title}
                  </span>
                  {doc.level && (
                    <span
                      className={`text-[9px] px-1.5 py-0.5 rounded-full font-medium border shrink-0 ${LEVEL_CONFIG[doc.level].colors}`}
                    >
                      {LEVEL_CONFIG[doc.level].label}
                    </span>
                  )}
                  {/* 管道连接线 */}
                  {i < roleGuide.docs.length - 1 && (
                    <div className="w-3 flex justify-center shrink-0">
                      <div
                        className={`w-px h-3 bg-gradient-to-b ${isCurrent ? roleGuide.pipeGradient : 'from-gray-700 to-transparent'}`}
                      />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* 角色定位 */}
        <div
          className={`p-4 rounded-2xl bg-gradient-to-br ${roleGuide.bgColor} border ${roleGuide.borderColor}`}
        >
          <div className="flex items-center gap-2 mb-2">
            <roleGuide.icon className={`w-4 h-4 ${roleGuide.textColor}`} />
            <span className={`text-[12px] font-semibold ${roleGuide.textColor}`}>角色定位</span>
          </div>
          <p className="text-[12px] text-gray-400 leading-relaxed">{roleGuide.desc}</p>
        </div>
      </div>

      {/* 底部操作栏 */}
      <div className="p-4 border-t border-white/[0.04] bg-[#0a0e14]/80 backdrop-blur-xl">
        <a
          href={`https://github.com/ht182400-creator/easyagent/blob/main/docs/${card.file}`}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center justify-center gap-2 w-full p-2.5 rounded-xl
            bg-white/[0.03] border border-white/[0.05] hover:bg-white/[0.06] hover:border-white/[0.08]
            text-[12px] text-gray-400 hover:text-gray-200 transition-all"
        >
          <ExternalLink className="w-3.5 h-3.5" />在 GitHub 上打开此文档
        </a>
      </div>
    </div>
  );
}

// ==================== 主组件 ====================

export default function DocsGuide() {
  const [activeTab, setActiveTab] = useState('all');
  const [selectedCard, setSelectedCard] = useState<{ card: DocCard; role: RoleGuide } | null>(null);
  const [hoveredCard, setHoveredCard] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  /** 关闭详情面板（ESC 键） */
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.key === 'Escape') setSelectedCard(null);
  }, []);

  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  const activeRole = roleGuides.find((r) => r.id === activeTab) || roleGuides[0];

  return (
    <div ref={containerRef} className="space-y-10 docsguide-fade-in">
      {/* ======== 页面标题 - 渐变装饰 ======== */}
      <div className="relative">
        <div className="absolute -top-6 -left-6 w-32 h-32 bg-blue-500/5 rounded-full blur-3xl pointer-events-none" />
        <div className="flex items-center gap-4">
          <div className="p-2.5 rounded-2xl bg-gradient-to-br from-blue-500/15 via-blue-400/10 to-purple-500/10 border border-blue-500/15 shadow-lg shadow-blue-500/5">
            <BookOpen className="w-7 h-7 text-blue-400" />
          </div>
          <div>
            <h1 className="text-[26px] font-bold text-gray-100 tracking-tight leading-none">
              文档导读
            </h1>
            <p className="text-[13px] text-gray-500 mt-1.5">
              按角色浏览推荐阅读路径 · 快速找到你需要的文档
            </p>
          </div>
        </div>
      </div>

      {/* ======== 角色标签页 - 玻璃态 ======== */}
      <div className="flex gap-1.5 p-1.5 bg-white/[0.02] backdrop-blur-sm border border-white/[0.04] rounded-2xl w-fit">
        {roleGuides.map((role) => {
          const isActive = activeTab === role.id;
          return (
            <button
              key={role.id}
              onClick={() => {
                setActiveTab(role.id);
                setSelectedCard(null);
              }}
              className={`
                relative flex items-center gap-2 px-4 py-2.5 rounded-xl text-[13px] font-medium transition-all duration-200
                ${
                  isActive
                    ? `${role.bgColor} ${role.textColor} border ${role.borderColor} shadow-sm`
                    : 'text-gray-500 hover:text-gray-300 border border-transparent hover:bg-white/[0.02]'
                }
              `}
            >
              <role.icon className={`w-4 h-4 ${isActive ? '' : 'opacity-60'}`} />
              {role.label}
              {/* 激活指示器 */}
              {isActive && (
                <div
                  className={`absolute -bottom-[7px] left-1/2 -translate-x-1/2 w-1.5 h-1.5 rounded-full ${role.indicatorBg} shadow-sm ${role.indicatorShadow}`}
                />
              )}
            </button>
          );
        })}
      </div>

      {/* ======== 角色说明卡 ======== */}
      <div
        className={`relative p-4 rounded-2xl bg-gradient-to-r ${activeRole.bgColor} border ${activeRole.borderColor} max-w-2xl overflow-hidden`}
      >
        <div className="absolute right-4 top-1/2 -translate-y-1/2 opacity-10">
          <activeRole.icon className={`w-16 h-16 ${activeRole.textColor}`} />
        </div>
        <div className="flex items-start gap-3 relative">
          <activeRole.icon className={`w-5 h-5 ${activeRole.textColor} mt-0.5 shrink-0`} />
          <div>
            <div className={`text-[14px] font-semibold ${activeRole.textColor} mb-1`}>
              {activeRole.label}阅读路径
            </div>
            <p className="text-[12px] text-gray-400 leading-relaxed max-w-md">{activeRole.desc}</p>
          </div>
        </div>
      </div>

      {/* ======== 流程图区域 ======== */}
      <div className="space-y-12">
        {activeTab === 'all' ? (
          roleGuides.map((role) => (
            <PipelineRow
              key={role.id}
              role={role}
              hoveredCard={hoveredCard}
              selectedCard={selectedCard}
              onHover={setHoveredCard}
              onSelect={(card) => setSelectedCard({ card, role })}
            />
          ))
        ) : (
          <PipelineRow
            role={activeRole}
            hoveredCard={hoveredCard}
            selectedCard={selectedCard}
            onHover={setHoveredCard}
            onSelect={(card) => setSelectedCard({ card, role: activeRole })}
          />
        )}
      </div>

      {/* ======== 分割线 ======== */}
      {activeTab === 'all' && <hr className="border-white/[0.04]" />}

      {/* ======== 陷阱速查（仅所有人标签页显示） ======== */}
      {activeTab === 'all' && (
        <section className="space-y-4">
          <div className="flex items-center gap-2.5">
            <div className="p-1.5 rounded-lg bg-amber-500/10 border border-amber-500/20">
              <AlertTriangle className="w-4 h-4 text-amber-400" />
            </div>
            <h2 className="text-base font-semibold text-gray-200">高频陷阱速查</h2>
            <span className="text-[11px] text-gray-600">· 完整 37 条见 MEMORY.md</span>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {traps.map((trap) => (
              <div
                key={trap.id}
                className="group/trap p-3.5 rounded-2xl bg-white/[0.01] border border-white/[0.04] hover:border-amber-500/15 hover:bg-amber-500/[0.02] transition-all duration-200"
              >
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-[10px] font-bold text-amber-500/60 bg-amber-500/8 px-1.5 py-0.5 rounded-md font-mono">
                    #{trap.id}
                  </span>
                  <span className="text-[12px] font-medium text-gray-300 group-hover/trap:text-amber-200 transition-colors">
                    {trap.title}
                  </span>
                </div>
                <code className="text-[11px] text-gray-500 group-hover/trap:text-gray-400 transition-colors leading-relaxed">
                  {trap.fix}
                </code>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* ======== 关键链接 ======== */}
      {activeTab === 'all' && (
        <section className="space-y-4">
          <div className="flex items-center gap-2.5">
            <div className="p-1.5 rounded-lg bg-blue-500/10 border border-blue-500/20">
              <Rocket className="w-4 h-4 text-blue-400" />
            </div>
            <h2 className="text-base font-semibold text-gray-200">关键链接</h2>
          </div>
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
            {keyLinks.map((link) => (
              <a
                key={link.url}
                href={link.url}
                target="_blank"
                rel="noopener noreferrer"
                className="group/link p-3.5 rounded-2xl bg-white/[0.01] border border-white/[0.04] hover:border-blue-500/15 hover:bg-blue-500/[0.02] transition-all duration-200 block"
              >
                <div className="flex items-center gap-1.5 mb-1.5">
                  <span className="text-[12px] font-medium text-gray-300 group-hover/link:text-blue-400 transition-colors">
                    {link.label}
                  </span>
                  <ExternalLink className="w-3 h-3 text-gray-600 group-hover/link:text-blue-500/60 transition-colors opacity-0 group-hover/link:opacity-100" />
                </div>
                <code className="text-[10px] text-gray-600 group-hover/link:text-gray-500 break-all font-mono transition-colors">
                  {link.url}
                </code>
              </a>
            ))}
          </div>
        </section>
      )}

      {/* ======== 项目文件地图（仅所有人） ======== */}
      {activeTab === 'all' && (
        <section className="space-y-4">
          <div className="flex items-center gap-2.5">
            <div className="p-1.5 rounded-lg bg-purple-500/10 border border-purple-500/20">
              <Layers className="w-4 h-4 text-purple-400" />
            </div>
            <h2 className="text-base font-semibold text-gray-200">项目文件地图</h2>
          </div>
          <div className="p-5 rounded-2xl bg-white/[0.01] border border-white/[0.04]">
            <pre className="text-[12px] text-gray-400 leading-relaxed overflow-x-auto font-mono">
              {`EasyAgent/
├── packages/
│   ├── core/         🔧 核心库 (Agent/工具/MCP/适配器)
│   ├── server/       🌐 Express 后端 (端口 3456)
│   ├── desktop/      🖥️  Electron 桌面应用
│   ├── web/          🌍 Web Dashboard
│   ├── frontend/     🎨 共享前端组件 (Desktop+Web 共用)
│   └── cli/          ⌨️  命令行工具
├── docs/             📖 项目文档  ← 你在这里
├── scripts/          🔧 构建/发布/同步脚本
├── .codebuddy/
│   └── memory/       🧠 AI 开发日志 + MEMORY.md
├── .github/workflows/⚙️  CI/CD 配置
├── version.json      🏷️  唯一版本号
├── CHANGELOG.md      📋 版本更新日志
└── build.bat         ⚡ 构建入口`}
            </pre>
          </div>
        </section>
      )}

      {/* ======== 详情面板遮罩 ======== */}
      {selectedCard && (
        <div
          className="fixed inset-0 bg-black/50 backdrop-blur-[2px] z-40 docsguide-fade-in"
          onClick={() => setSelectedCard(null)}
        />
      )}

      {/* ======== 详情面板 ======== */}
      <DetailPanel
        card={selectedCard?.card || null}
        roleGuide={selectedCard?.role || null}
        onClose={() => setSelectedCard(null)}
      />

      {/* ======== 动画与滚动条样式（使用唯一前缀避免污染全局） ======== */}
      <style>{`
        @keyframes docsGuideSlideInRight {
          from { transform: translateX(100%); opacity: 0; }
          to { transform: translateX(0); opacity: 1; }
        }
        @keyframes docsGuideFadeIn {
          from { opacity: 0; transform: translateY(8px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .docsguide-slide-in-right {
          animation: docsGuideSlideInRight 0.35s cubic-bezier(0.16, 1, 0.3, 1);
        }
        .docsguide-fade-in {
          animation: docsGuideFadeIn 0.5s ease-out;
        }
        .custom-scrollbar::-webkit-scrollbar {
          width: 4px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: transparent;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: rgba(255,255,255,0.06);
          border-radius: 4px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover {
          background: rgba(255,255,255,0.1);
        }
      `}</style>
    </div>
  );
}

// ==================== 流线型管道行组件 ====================

/** 单行流程卡片，使用 SVG 流线型箭头连接 */
function PipelineRow({
  role,
  hoveredCard,
  selectedCard,
  onHover,
  onSelect,
}: {
  role: RoleGuide;
  hoveredCard: string | null;
  selectedCard: { card: DocCard; role: RoleGuide } | null;
  onHover: (id: string | null) => void;
  onSelect: (card: DocCard) => void;
}) {
  return (
    <div className="space-y-3 docsguide-fade-in group/row">
      {/* 行标题 */}
      <div className="flex items-center gap-2.5">
        <div className={`p-1.5 rounded-lg ${role.bgColor} border ${role.borderColor}`}>
          <role.icon className={`w-3.5 h-3.5 ${role.textColor}`} />
        </div>
        <span className={`text-[13px] font-semibold ${role.textColor}`}>{role.label}</span>
        <span className="text-[11px] text-gray-600">· {role.docs.length} 篇文档 · 按序阅读</span>
      </div>

      {/* 卡片流 + 流线箭头 */}
      <div className="flex items-start flex-wrap gap-0">
        {role.docs.map((doc, i) => {
          const isSelected = selectedCard?.card.id === doc.id && selectedCard?.role.id === role.id;
          return (
            <div key={doc.id} className="flex items-start">
              <FlowCard
                card={doc}
                index={i}
                textColor={role.textColor}
                borderColor={role.borderColor}
                bgColor={role.bgColor}
                glowColor={role.glowColor}
                badgeBg={role.badgeBg}
                badgeText={role.badgeText}
                badgeRing={role.badgeRing}
                iconRing={role.iconRing}
                isActive={isSelected || hoveredCard === doc.id}
                onClick={() => onSelect(doc)}
              />
              {/* 流线型连接箭头（最后一张不显示） */}
              {i < role.docs.length - 1 && <FlowArrow colorHex={role.colorHex} />}
            </div>
          );
        })}
      </div>
    </div>
  );
}
