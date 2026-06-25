/**
 * WorkBuddy 风格仪表盘
 * 深色主题 + 渐变品牌标识 + 快捷入口 + 模板卡片 + 智能输入
 */
import { useState, useEffect, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  MessageSquare, Cpu, Wrench, History, Activity,
  Sparkles, Code2, FileText, Search, BarChart3,
  Palette, Bug, Send, Paperclip, Mic, Star,
  ArrowRight, TrendingUp, Zap
} from 'lucide-react';
import { useAppStore } from '@/stores/appStore';
import { useConfig } from '@/config';
import { apiRequest } from '@/request';

interface SystemStatus {
  model: { provider: string; model: string };
  tokenUsage: { inputTokens: number; outputTokens: number; totalTokens: number };
  sessionCount: number;
  toolCount: number;
  providerCount: number;
  uptime?: number;
  memory?: string;
}

/** 快捷操作入口 */
const quickActions = [
  { path: '/chat', label: '新建对话', desc: '与 AI 开始新对话', icon: MessageSquare, gradient: 'from-blue-500 to-cyan-400', shadow: 'shadow-blue-500/20' },
  { path: '/tools', label: '浏览工具', desc: '查看全部可用工具', icon: Wrench, gradient: 'from-purple-500 to-pink-400', shadow: 'shadow-purple-500/20' },
  { path: '/knowledge', label: '知识库', desc: '管理你的知识资产', icon: FileText, gradient: 'from-emerald-500 to-teal-400', shadow: 'shadow-emerald-500/20' },
  { path: '/settings', label: '系统设置', desc: '配置模型与偏好', icon: Cpu, gradient: 'from-amber-500 to-orange-400', shadow: 'shadow-amber-500/20' },
];

/** 模板图标映射 */
const iconMap: Record<string, React.ComponentType<{ className?: string }>> = {
  Code2, FileText, Search, BarChart3, Palette, Bug,
};

/** 模板渐变色映射 */
const gradientMap: Record<string, { gradient: string; border: string; text: string }> = {
  Code2: { gradient: 'from-blue-500/20 to-blue-600/10', border: 'border-blue-500/20', text: 'text-blue-400' },
  FileText: { gradient: 'from-green-500/20 to-green-600/10', border: 'border-green-500/20', text: 'text-green-400' },
  Search: { gradient: 'from-purple-500/20 to-purple-600/10', border: 'border-purple-500/20', text: 'text-purple-400' },
  BarChart3: { gradient: 'from-amber-500/20 to-amber-600/10', border: 'border-amber-500/20', text: 'text-amber-400' },
  Palette: { gradient: 'from-pink-500/20 to-pink-600/10', border: 'border-pink-500/20', text: 'text-pink-400' },
  Bug: { gradient: 'from-red-500/20 to-red-600/10', border: 'border-red-500/20', text: 'text-red-400' },
};

/** 服务端模板数据结构 */
interface TemplateConfig {
  id: string;
  label: string;
  desc: string;
  icon: string;
  prompt: string;
}

export default function Dashboard() {
  const navigate = useNavigate();
  const [status, setStatus] = useState<SystemStatus | null>(null);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const serverConnected = useAppStore((s) => s.serverConnected);
  const { apiBase } = useConfig();
  /** 从服务端动态加载的模板列表 */
  const [templates, setTemplates] = useState<TemplateConfig[]>([]);

  const fetchStatus = useCallback(() => {
    apiRequest<SystemStatus>('/api/status')
      .then((data) => {
        setStatus(data);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  // 获取模板
  const fetchTemplates = useCallback(() => {
    apiRequest<{ success: boolean; templates?: TemplateConfig[] }>('/api/config/templates')
      .then((data) => {
        if (data.success) setTemplates(data.templates || []);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    fetchStatus();
    fetchTemplates();
    const interval = setInterval(fetchStatus, 30000);
    return () => clearInterval(interval);
  }, [fetchStatus, fetchTemplates]);

  // 发送快捷对话
  const handleSend = () => {
    const trimmed = query.trim();
    if (!trimmed) return;
    navigate(`/chat?message=${encodeURIComponent(trimmed)}`);
  };

  // 点击模板发起对话
  const handleTemplate = (tpl: TemplateConfig) => {
    const queryText = tpl.prompt ? `${tpl.prompt}` : '';
    navigate(`/chat?template=${encodeURIComponent(tpl.id)}&label=${encodeURIComponent(tpl.label)}&message=${encodeURIComponent(queryText)}`);
  };

  /** 获取模板的 UI 配置(图标+样式)，根据 icon 字段映射 */
  function getTemplateStyle(tpl: TemplateConfig) {
    const IconComp = iconMap[tpl.icon] || Code2;
    const style = gradientMap[tpl.icon] || gradientMap.Code2;
    return { Icon: IconComp, ...style };
  }

  return (
    <div className="max-w-6xl mx-auto space-y-10 animate-fade-in">
      {/* ======== Hero 区域 ======== */}
      <section className="text-center pt-8 pb-4">
        {/* Logo & 品牌标识 */}
        <div className="mb-6">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-blue-500 via-purple-500 to-pink-500 shadow-lg shadow-purple-500/25 mb-4">
            <Sparkles className="w-8 h-8 text-white" />
          </div>
        </div>

        <h1 className="text-4xl sm:text-5xl font-extrabold tracking-tight">
          <span className="bg-gradient-to-r from-blue-400 via-purple-400 to-pink-400 bg-clip-text text-transparent">
            EasyAgent
          </span>
        </h1>
        <p className="mt-3 text-lg text-gray-400 max-w-2xl mx-auto leading-relaxed">
          你的智能 AI 工作伙伴 — 多模型对话、工具调用、知识管理、自动化的全能助手
        </p>

        {/* 状态指示器 */}
        <div className="mt-5 flex items-center justify-center gap-4">
          <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full border ${
            serverConnected
              ? 'bg-green-500/10 border-green-500/20'
              : 'bg-yellow-500/10 border-yellow-500/20'
          }`}>
            <div className={`w-2 h-2 rounded-full ${
              serverConnected
                ? 'bg-green-400 shadow-[0_0_6px_rgba(34,197,94,0.4)] animate-pulse-dot'
                : 'bg-yellow-400 shadow-[0_0_6px_rgba(234,179,8,0.4)]'
            }`} />
            <span className={`text-xs font-medium ${
              serverConnected ? 'text-green-400' : 'text-yellow-400'
            }`}>
              {serverConnected ? '服务运行中' : '正在连接服务...'}
            </span>
          </div>
          {status && (
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-blue-500/10 border border-blue-500/20">
              <TrendingUp className="w-3.5 h-3.5 text-blue-400" />
              <span className="text-xs text-blue-400 font-medium">
                {status.model.provider} / {status.model.model}
              </span>
            </div>
          )}
        </div>
      </section>

      {/* ======== 快捷操作 ======== */}
      <section>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {quickActions.map((action) => (
            <Link
              key={action.path}
              to={action.path}
              className="group relative overflow-hidden rounded-2xl border border-gray-800/60 bg-gray-900/60 backdrop-blur-sm p-5 transition-all duration-300 hover:border-gray-700/60 hover:bg-gray-800/60 hover:-translate-y-0.5 hover:shadow-lg"
            >
              {/* 图标背景光晕 */}
              <div className={`absolute -top-4 -right-4 w-20 h-20 rounded-full bg-gradient-to-br ${action.gradient} opacity-10 group-hover:opacity-20 transition-opacity duration-500 blur-xl`} />
              <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${action.gradient} flex items-center justify-center mb-3 ${action.shadow}`}>
                <action.icon className="w-5 h-5 text-white" />
              </div>
              <h3 className="font-semibold text-sm group-hover:text-white transition-colors">
                {action.label}
              </h3>
              <p className="text-xs text-gray-500 mt-1 group-hover:text-gray-400 transition-colors">
                {action.desc}
              </p>
              <div className="absolute bottom-5 right-5 opacity-0 group-hover:opacity-100 transition-all duration-300 translate-x-2 group-hover:translate-x-0">
                <ArrowRight className="w-4 h-4 text-gray-500" />
              </div>
            </Link>
          ))}
        </div>
      </section>

      {/* ======== 统计卡片 - 可点击跳转 ======== */}
      <section>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {STAT_CARDS.map((card) => {
            const rawValue = (() => {
              if (loading) return '—';
              if (!status) return '—';
              switch (card.label) {
                case '已配置模型': return status.providerCount;
                case '活跃会话': return status.sessionCount;
                case '可用工具': return status.toolCount;
                case 'Token 用量': return `${(status.tokenUsage.totalTokens / 1000).toFixed(1)}K`;
                default: return '—';
              }
            })();
            return (
              <StatCard
                key={card.label}
                label={card.label}
                value={rawValue}
                icon={card.icon}
                gradient={card.gradient}
                border={card.border}
                textColor={card.textColor}
                onClick={() => navigate(card.path)}
              />
            );
          })}
        </div>
      </section>

      {/* ======== 智能模板 ======== */}
      <section>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <Star className="w-5 h-5 text-amber-400" />
            智能模板
          </h2>
          <span className="text-xs text-gray-600">选择一个模板快速开始</span>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {templates.length === 0 ? (
            <div className="col-span-full text-center py-4 text-xs text-gray-600">模板加载中...</div>
          ) : (
            templates.map((tpl) => {
              const { Icon, gradient, border, text } = getTemplateStyle(tpl);
              return (
                <button
                  key={tpl.id}
                  type="button"
                  onClick={() => handleTemplate(tpl)}
                  className={`group relative overflow-hidden rounded-xl bg-gradient-to-br ${gradient} ${border} border p-4 text-left transition-all duration-300 hover:-translate-y-0.5 hover:shadow-lg cursor-pointer`}
                >
                  <div className="flex items-start gap-3">
                    <div className={`w-9 h-9 rounded-lg bg-gray-800/80 flex items-center justify-center ${text}`}>
                      <Icon className="w-4.5 h-4.5" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className="font-medium text-sm">{tpl.label}</h3>
                      <p className="text-xs text-gray-500 mt-0.5 line-clamp-1">{tpl.desc}</p>
                    </div>
                  </div>
                </button>
              );
            })
          )}
        </div>
      </section>

      {/* ======== 智能输入框 ======== */}
      <section className="pb-10">
        <div className="relative max-w-3xl mx-auto">
          <div className="absolute inset-0 rounded-2xl bg-gradient-to-r from-blue-500/20 via-purple-500/20 to-pink-500/20 blur-xl opacity-50" />
          <div className="relative flex items-center gap-3 bg-gray-900/90 backdrop-blur-md border border-gray-700/60 rounded-2xl p-2 pl-5 shadow-2xl">
            {/* 附件按钮 */}
            <button
              type="button"
              className="p-1.5 rounded-lg hover:bg-gray-800 transition-colors text-gray-500 hover:text-gray-300"
              title="上传附件"
            >
              <Paperclip className="w-4.5 h-4.5" />
            </button>

            {/* 输入框 */}
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSend()}
              placeholder="输入你的问题，或选择一个模板开始..."
              className="flex-1 bg-transparent border-none outline-none text-sm text-gray-200 placeholder:text-gray-600 py-2"
            />

            {/* 语音按钮 */}
            <button
              type="button"
              className="p-1.5 rounded-lg hover:bg-gray-800 transition-colors text-gray-500 hover:text-gray-300"
              title="语音输入"
            >
              <Mic className="w-4.5 h-4.5" />
            </button>

            {/* 发送按钮 */}
            <button
              type="button"
              onClick={handleSend}
              disabled={!query.trim()}
              className="p-2.5 rounded-xl bg-gradient-to-r from-blue-500 to-purple-600 hover:from-blue-400 hover:to-purple-500 disabled:opacity-30 disabled:cursor-not-allowed transition-all duration-200 shadow-lg shadow-purple-500/20 hover:shadow-purple-500/30"
            >
              <Send className="w-4.5 h-4.5 text-white" />
            </button>
          </div>

          {/* 输入框提示 */}
          <p className="text-center mt-3 text-xs text-gray-600">
            支持多模型对话 · 文件上传 · Markdown 渲染 · 代码高亮
          </p>
        </div>
      </section>
    </div>
  );
}

/** 统计卡片配置 */
const STAT_CARDS = [
  { label: '已配置模型', path: '/providers', icon: Cpu, gradient: 'from-blue-500/15 to-blue-600/5', border: 'border-blue-500/15', textColor: 'text-blue-400' },
  { label: '活跃会话', path: '/sessions', icon: History, gradient: 'from-emerald-500/15 to-emerald-600/5', border: 'border-emerald-500/15', textColor: 'text-emerald-400' },
  { label: '可用工具', path: '/tools', icon: Wrench, gradient: 'from-purple-500/15 to-purple-600/5', border: 'border-purple-500/15', textColor: 'text-purple-400' },
  { label: 'Token 用量', path: '/token-usage', icon: Activity, gradient: 'from-amber-500/15 to-amber-600/5', border: 'border-amber-500/15', textColor: 'text-amber-400' },
];

/** 统计卡片组件 */
function StatCard({
  label, value, icon: Icon, gradient, border, textColor, onClick,
}: {
  label: string;
  value: string | number;
  icon: React.ComponentType<{ className?: string }>;
  gradient: string;
  border: string;
  textColor: string;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`relative overflow-hidden rounded-2xl bg-gradient-to-br ${gradient} ${border} border p-5 transition-all hover:-translate-y-0.5 hover:shadow-lg cursor-pointer text-left w-full group`}
      title={`点击跳转到${label}`}
    >
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs text-gray-500 font-medium group-hover:text-gray-400 transition-colors">{label}</span>
        <Icon className={`w-4 h-4 ${textColor} group-hover:scale-110 transition-transform`} />
      </div>
      <div className={`text-2xl font-bold ${textColor} tabular-nums`}>
        {value === '—' ? (
          <span className="inline-block w-12 h-7 rounded-md bg-gray-800 animate-pulse" />
        ) : (
          value
        )}
      </div>
    </button>
  );
}
