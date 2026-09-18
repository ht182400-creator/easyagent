/**
 * 文档导读页面 - 管道行组件（P2-1 拆分产物，自 DocsGuide.tsx 纯搬迁）
 *
 * 单行流程卡片，使用 SVG 流线型箭头连接。
 *
 * @module pages/docs-guide/PipelineRow
 */

import type { DocCard, RoleGuide } from './data';
import { FlowArrow, FlowCard } from './FlowCard';

/** 单行流程卡片，使用 SVG 流线型箭头连接 */
export function PipelineRow({
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
  // onHover 当前未消费（卡片激活态由 selected/hovered 状态组合决定）；
  // 保留参数以稳定主组件调用契约，勿在卡片内重复绑定造成双重触发
  void onHover;

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
