/**
 * 通用状态徽章组件
 */
import { CheckCircle2, XCircle, AlertTriangle, Info, Loader2 } from 'lucide-react';

export type BadgeVariant = 'success' | 'error' | 'warning' | 'info' | 'neutral';

interface StatusBadgeProps {
  variant: BadgeVariant;
  label: string;
  /** 是否显示图标 */
  showIcon?: boolean;
  /** 是否脉冲动画 */
  pulse?: boolean;
  size?: 'sm' | 'md';
}

const iconMap: Record<BadgeVariant, React.ComponentType<{ className?: string }>> = {
  success: CheckCircle2,
  error: XCircle,
  warning: AlertTriangle,
  info: Info,
  neutral: Info,
};

const variantClass: Record<BadgeVariant, string> = {
  success: 'badge-success',
  error: 'badge-error',
  warning: 'badge-warning',
  info: 'badge-info',
  neutral: 'badge-neutral',
};

/**
 * 状态徽章 - 统一的状态展示组件
 */
export function StatusBadge({
  variant,
  label,
  showIcon = true,
  pulse = false,
  size = 'sm',
}: StatusBadgeProps) {
  const Icon = iconMap[variant];
  const sizeClass = size === 'sm' ? 'text-[0.65rem] px-1.5 py-0.5' : 'text-xs px-2 py-1';

  return (
    <span className={`badge ${variantClass[variant]} ${sizeClass} ${pulse ? 'pulse-dot' : ''}`}>
      {showIcon && <Icon className="w-3 h-3" />}
      {label}
    </span>
  );
}

/**
 * 加载中指示器
 */
export function LoadingSpinner({ text = '加载中...' }: { text?: string }) {
  return (
    <div className="flex items-center gap-2 text-gray-500 text-sm">
      <Loader2 className="w-4 h-4 animate-spin" />
      <span>{text}</span>
    </div>
  );
}
