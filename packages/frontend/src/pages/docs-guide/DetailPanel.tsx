/**
 * 文档导读页面 - 详情面板（P2-1 拆分产物，自 DocsGuide.tsx 纯搬迁）
 *
 * 点击卡片后右侧滑出的详情面板：文档信息卡 + 完整阅读路径 + 角色定位 + GitHub 链接。
 * 滑入动画类 `docsguide-slide-in-right` 的 <style> 定义在主组件 DocsGuide.tsx。
 *
 * @module pages/docs-guide/DetailPanel
 */

import { X, FileText, ExternalLink } from 'lucide-react';
import { iconComponents, SUPPORTED_ICONS, type DocCard, type RoleGuide } from './data';
import { LEVEL_CONFIG } from './FlowCard';

/** 详情面板（点击卡片后优雅滑出） */
export function DetailPanel({
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
