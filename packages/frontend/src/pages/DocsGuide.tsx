/**
 * EasyAgent 文档导读页面 v2.0
 * 按角色展示推荐阅读路径，流线型管道卡片布局
 * 设计理念: 玻璃态卡片 + SVG流线箭头 + 微交互动效
 *
 * P2-1 拆分：数据/卡片/详情面板/管道行已迁至 pages/docs-guide/ 子模块，
 * 本文件只保留主组件编排（952 → ~290 行）。CSS 动画类名 docsguide-* 前缀唯一。
 */
import { useState, useRef, useEffect, useCallback } from 'react';
import { BookOpen, AlertTriangle, Rocket, Layers, ExternalLink } from 'lucide-react';
import { roleGuides, traps, keyLinks, type DocCard, type RoleGuide } from './docs-guide/data';
import { DetailPanel } from './docs-guide/DetailPanel';
import { PipelineRow } from './docs-guide/PipelineRow';

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
