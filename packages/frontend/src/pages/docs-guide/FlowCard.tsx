/**
 * 文档导读页面 - 流程卡片组件（P2-1 拆分产物，自 DocsGuide.tsx 纯搬迁）
 *
 * 内容：等级徽章配置 / 流线型 SVG 管道箭头 / 文档卡片节点。
 * ⚠️ Tailwind 类名均为预计算静态类（由 data.tsx 的 RoleGuide 提供），
 *    勿改为动态拼接 —— 会触发 Tailwind JIT 类名失效（陷阱 #29 同源）。
 *
 * @module pages/docs-guide/FlowCard
 */

import { FileText } from 'lucide-react';
import { iconComponents, SUPPORTED_ICONS, type DocCard } from './data';

/** 等级徽章配置 */
export const LEVEL_CONFIG: Record<string, { label: string; colors: string }> = {
  required: { label: '必读', colors: 'bg-red-500/10 text-red-400 border-red-500/20' },
  recommended: { label: '推荐', colors: 'bg-amber-500/10 text-amber-400 border-amber-500/20' },
  optional: { label: '了解', colors: 'bg-slate-500/10 text-slate-400 border-slate-500/20' },
};

/** 流线型 SVG 管道箭头 */
export function FlowArrow({ colorHex }: { colorHex: string }) {
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
export function FlowCard({
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
