/**
 * Token 用量分析中心
 * 全方位展示 Token 消耗：概览、趋势、模型分布、费用估算、明细记录
 */
import { useEffect, useState, useCallback } from 'react';
import {
  TrendingUp, Zap, BarChart3, PieChart, DollarSign,
  Activity, Cpu, Clock, ArrowUpRight, ArrowDownRight,
  Calendar, Filter, RefreshCw, Download, Database,
  ChevronRight,
} from 'lucide-react';

// ======================= 类型定义 =======================

interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
}

interface ModelUsage {
  model: string;
  provider: string;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  calls: number;
}

interface DayUsage {
  date: string;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  calls: number;
}

interface ProviderUsage {
  provider: string;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
}

interface CallRecord {
  timestamp: string;
  sessionId: string;
  title: string;
  provider: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  estimatedCost: number;
}

interface CostBreakdown {
  model: string;
  provider: string;
  cost: number;
  tokens: number;
}

interface AnalyticsData {
  summary: {
    total: TokenUsage;
    today: TokenUsage;
    thisWeek: TokenUsage;
    thisMonth: TokenUsage;
  };
  byModel: ModelUsage[];
  byDay: DayUsage[];
  byProvider: ProviderUsage[];
  recentCalls: CallRecord[];
  cost: {
    totalEstimatedCost: number;
    byModel: CostBreakdown[];
    currency: string;
  };
}

// ======================= 工具函数 =======================

/** 格式化Token数量 */
function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

/** 格式化费用 */
function formatCost(n: number): string {
  return `$${n.toFixed(4)}`;
}

/** 格式化日期 */
function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString('zh-CN', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

/** 提供商显示名映射 */
const PROVIDER_LABELS: Record<string, string> = {
  openai: 'OpenAI', anthropic: 'Anthropic', deepseek: 'DeepSeek',
  google: 'Google', alibaba: '阿里云', moonshot: 'Moonshot', zhipu: '智谱',
  baidu: '百度', tencent: '腾讯', ollama: 'Ollama', siliconflow: '硅基流动',
  volc: '火山引擎', groq: 'Groq',
};

function getProviderLabel(id: string): string {
  return PROVIDER_LABELS[id] || id;
}

// ======================= 组件 =======================

/** SVG 环形图 */
function DonutChart({ data, size = 180, thickness = 32 }: {
  data: Array<{ label: string; value: number; color: string }>;
  size?: number;
  thickness?: number;
}) {
  const total = data.reduce((s, d) => s + d.value, 0);
  if (total === 0) return <div className="text-gray-600 text-xs text-center py-4">暂无数据</div>;

  const cx = size / 2;
  const cy = size / 2;
  const r = (size - thickness) / 2;
  const circumference = 2 * Math.PI * r;
  const gap = 3; // 扇区间隙角度

  let cumAngle = -90;
  const slices: Array<{ d: string; color: string }> = [];

  for (const item of data) {
    const sliceAngle = Math.max(3, (item.value / total) * 360 - gap);
    const startRad = (cumAngle * Math.PI) / 180;
    const endRad = ((cumAngle + sliceAngle) * Math.PI) / 180;

    const x1 = cx + r * Math.cos(startRad);
    const y1 = cy + r * Math.sin(startRad);
    const x2 = cx + r * Math.cos(endRad);
    const y2 = cy + r * Math.sin(endRad);

    const largeArc = sliceAngle > 180 ? 1 : 0;
    const d = `M ${x1} ${y1} A ${r} ${r} 0 ${largeArc} 1 ${x2} ${y2}`;
    slices.push({ d, color: item.color });

    cumAngle += sliceAngle + gap;
  }

  // 计算描边宽度实现环形
  const sw = thickness;

  return (
    <div className="flex items-center gap-4">
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="shrink-0">
        {slices.map((s, i) => (
          <path key={i} d={s.d} fill="none" stroke={s.color} strokeWidth={sw} strokeLinecap="round" opacity={0.9} />
        ))}
        <text x={cx} y={cy - 8} textAnchor="middle" className="fill-gray-300" style={{ fontSize: '13px', fontWeight: 600 }}>
          {formatTokens(total)}
        </text>
        <text x={cx} y={cy + 12} textAnchor="middle" className="fill-gray-500" style={{ fontSize: '10px' }}>Total</text>
      </svg>
      <div className="flex flex-col gap-1.5 text-xs">
        {data.map((d) => (
          <div key={d.label} className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ backgroundColor: d.color }} />
            <span className="text-gray-400 truncate max-w-[100px]">{d.label}</span>
            <span className="text-gray-500 ml-auto">{((d.value / total) * 100).toFixed(1)}%</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/** SVG 柱状趋势图 */
function BarChart({ data, height = 140 }: {
  data: Array<{ label: string; value: number }>;
  height?: number;
}) {
  const maxVal = Math.max(1, ...data.map((d) => d.value));
  const barW = Math.max(6, Math.min(16, Math.floor((data.length > 0 ? 600 : 200) / data.length) - 2));

  return (
    <div className="overflow-x-auto">
      <svg width={Math.max(200, data.length * (barW + 4) + 30)} height={height + 30} className="mx-auto">
        {/* 网格线 */}
        {[0, 0.25, 0.5, 0.75, 1].map((pct) => (
          <g key={pct}>
            <line x1="24" y1={height - pct * height + 10} x2={data.length * (barW + 4) + 24} y2={height - pct * height + 10}
              stroke="#374151" strokeWidth="0.5" strokeDasharray="3 3" />
            <text x="20" y={height - pct * height + 14} textAnchor="end" className="fill-gray-600" style={{ fontSize: '8px' }}>
              {formatTokens(Math.round(maxVal * pct))}
            </text>
          </g>
        ))}

        {/* 柱子 */}
        {data.map((d, i) => {
          const bh = Math.max(3, (d.value / maxVal) * height);
          return (
            <g key={i}>
              <rect
                x={i * (barW + 4) + 28}
                y={height - bh + 10}
                width={barW}
                height={bh}
                rx="2"
                className="fill-purple-500/70 hover:fill-purple-400/80 transition-colors"
              />
              <text
                x={i * (barW + 4) + 28 + barW / 2}
                y={height + 24}
                textAnchor="middle"
                className="fill-gray-600"
                style={{ fontSize: '7px' }}
              >
                {d.label.slice(5)}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

// ======================= 主页面 =======================

export default function TokenUsage() {
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [timeRange, setTimeRange] = useState<'today' | 'week' | 'month' | 'all'>('month');
  const [modelFilter, setModelFilter] = useState<string>('');

  const fetchData = useCallback(async () => {
    try {
      setError(null);
      const res = await fetch('/api/token-usage/analytics');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      if (json.success) {
        setData(json);
      } else {
        setError(json.error || '未知错误');
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // 根据时间筛选摘要数据
  const summary = (() => {
    if (!data) return null;
    switch (timeRange) {
      case 'today': return data.summary.today;
      case 'week': return data.summary.thisWeek;
      case 'month': return data.summary.thisMonth;
      default: return data.summary.total;
    }
  })();

  // 模型分布颜色映射
  const MODEL_COLORS = ['#a78bfa', '#60a5fa', '#34d399', '#fbbf24', '#f87171', '#818cf8', '#fb923c', '#2dd4bf'];
  const donutData = data?.byModel.map((m, i) => ({
    label: m.model,
    value: m.totalTokens,
    color: MODEL_COLORS[i % MODEL_COLORS.length],
  })) ?? [];

  // 按提供商颜色
  const PROVIDER_COLORS: Record<string, string> = {
    openai: '#10a37f', anthropic: '#d97706', deepseek: '#4f46e5',
    google: '#4285f4', alibaba: '#ff6a00', zhipu: '#1677ff',
    ollama: '#6366f1', groq: '#f97316', moonshot: '#ec4899',
  };

  // 柱状图数据
  const barData = data?.byDay.map((d) => ({ label: d.date, value: d.totalTokens })) ?? [];

  // 筛选后的明细
  const filteredCalls = modelFilter
    ? data?.recentCalls.filter((c) => `${c.provider}/${c.model}` === modelFilter) ?? []
    : data?.recentCalls ?? [];

  if (loading) {
    return (
      <div className="max-w-6xl mx-auto py-8 animate-fade-in">
        <div className="flex items-center justify-center h-64">
          <div className="text-gray-500 flex items-center gap-3">
            <RefreshCw className="w-5 h-5 animate-spin" />
            <span>加载Token分析数据...</span>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="max-w-6xl mx-auto py-8 animate-fade-in">
        <div className="card">
          <div className="text-center py-16">
            <AlertTriangle className="w-12 h-12 text-yellow-400 mx-auto mb-4" />
            <h2 className="text-lg font-semibold text-gray-300 mb-2">数据加载失败</h2>
            <p className="text-sm text-gray-500 mb-4">{error}</p>
            <button onClick={fetchData} className="btn btn-primary text-sm">重试</button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto py-8 space-y-6 animate-fade-in">
      {/* ======== 页面头部 ======== */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center">
              <Activity className="w-5 h-5 text-white" />
            </div>
            Token 用量分析中心
          </h1>
          <p className="text-sm text-gray-500 mt-1">多维度分析模型调用消耗、趋势变化与费用估算</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={fetchData} className="btn-ghost text-xs px-3 py-1.5 rounded-lg flex items-center gap-1.5">
            <RefreshCw className="w-3.5 h-3.5" />
            刷新
          </button>
          <button className="btn-ghost text-xs px-3 py-1.5 rounded-lg flex items-center gap-1.5">
            <Download className="w-3.5 h-3.5" />
            导出
          </button>
        </div>
      </div>

      {/* ======== 时间范围切换 ======== */}
      <div className="flex items-center gap-1 bg-gray-900/60 rounded-xl p-1 w-fit border border-gray-800/60">
        {(['today', 'week', 'month', 'all'] as const).map((range) => (
          <button
            key={range}
            onClick={() => setTimeRange(range)}
            className={`px-4 py-1.5 rounded-lg text-xs font-medium transition-all ${
              timeRange === range
                ? 'bg-purple-500/20 text-purple-400 shadow-sm'
                : 'text-gray-500 hover:text-gray-300'
            }`}
          >
            {{ today: '今日', week: '本周', month: '本月', all: '总计' }[range]}
          </button>
        ))}
      </div>

      {/* ======== 统计概览卡片 ======== */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <SummaryCard
          label={timeRange === 'today' ? '今日用量' : timeRange === 'week' ? '本周用量' : timeRange === 'month' ? '本月用量' : '总用量'}
          value={summary ? formatTokens(summary.totalTokens) : '—'}
          sub={`输入 ${summary ? formatTokens(summary.inputTokens) : '—'} · 输出 ${summary ? formatTokens(summary.outputTokens) : '—'}`}
          icon={Activity}
          gradient="from-purple-500/15 to-purple-600/5"
          border="border-purple-500/15"
          textColor="text-purple-400"
          accentClass="bg-purple-500/5"
        />
        <SummaryCard
          label="预估费用"
          value={data ? formatCost(data.cost.totalEstimatedCost) : '—'}
          sub={`${data?.cost.byModel.length ?? 0} 个模型`}
          icon={DollarSign}
          gradient="from-emerald-500/15 to-emerald-600/5"
          border="border-emerald-500/15"
          textColor="text-emerald-400"
          accentClass="bg-emerald-500/5"
        />
        <SummaryCard
          label="调用模型"
          value={data?.byModel.length ?? '—'}
          sub={`${data?.byProvider.length ?? 0} 个提供商`}
          icon={Cpu}
          gradient="from-blue-500/15 to-blue-600/5"
          border="border-blue-500/15"
          textColor="text-blue-400"
          accentClass="bg-blue-500/5"
        />
        <SummaryCard
          label="会话数"
          value={data?.recentCalls.length ?? '—'}
          sub={`最近 ${data?.recentCalls.length ?? 0} 条记录`}
          icon={Database}
          gradient="from-amber-500/15 to-amber-600/5"
          border="border-amber-500/15"
          textColor="text-amber-400"
          accentClass="bg-amber-500/5"
        />
      </div>

      {/* ======== 双栏布局：模型分布 + 费用明细 ======== */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* 模型用量分布 (环形图) */}
        <div className="card">
          <h3 className="font-semibold flex items-center gap-2 mb-4">
            <PieChart className="w-4 h-4 text-purple-400" />
            模型用量分布
          </h3>
          {donutData.length === 0 ? (
            <div className="text-gray-600 text-xs text-center py-8">暂无数据</div>
          ) : (
            <DonutChart data={donutData} size={180} thickness={30} />
          )}
        </div>

        {/* 按模型费用明细 */}
        <div className="card">
          <h3 className="font-semibold flex items-center gap-2 mb-4">
            <DollarSign className="w-4 h-4 text-emerald-400" />
            费用估算明细
          </h3>
          {(!data || data.cost.byModel.length === 0) ? (
            <div className="text-gray-600 text-xs text-center py-8">暂无数据</div>
          ) : (
            <div className="space-y-3">
              {data.cost.byModel.map((m, i) => {
                const maxCost = data.cost.byModel[0]?.cost ?? 1;
                const pct = Math.round((m.cost / maxCost) * 100);
                return (
                  <div key={i} className="space-y-1">
                    <div className="flex items-center justify-between text-xs">
                      <div className="flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-full" style={{ backgroundColor: MODEL_COLORS[i % MODEL_COLORS.length] }} />
                        <span className="text-gray-300">{m.model}</span>
                        <span className="text-gray-600">({getProviderLabel(m.provider)})</span>
                      </div>
                      <span className="text-emerald-400 font-medium">{formatCost(m.cost)}</span>
                    </div>
                    <div className="h-1.5 bg-gray-800 rounded-full overflow-hidden">
                      <div className="h-full bg-emerald-500/40 rounded-full transition-all" style={{ width: `${pct}%` }} />
                    </div>
                    <div className="text-gray-600" style={{ fontSize: '10px' }}>{formatTokens(m.tokens)} tokens</div>
                  </div>
                );
              })}
              <div className="border-t border-gray-800/60 pt-2 mt-2 flex justify-between text-xs">
                <span className="text-gray-400 font-medium">总计</span>
                <span className="text-emerald-400 font-bold">{formatCost(data.cost.totalEstimatedCost)}</span>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ======== 日用量趋势图 ======== */}
      {barData.length > 0 && (
        <div className="card">
          <h3 className="font-semibold flex items-center gap-2 mb-4">
            <TrendingUp className="w-4 h-4 text-blue-400" />
            日用量趋势 (近30天)
          </h3>
          <BarChart data={barData} height={140} />
        </div>
      )}

      {/* ======== 调用明细表格 ======== */}
      <div className="card">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold flex items-center gap-2">
            <Clock className="w-4 h-4 text-amber-400" />
            调用明细记录
          </h3>
          {/* 模型筛选 */}
          <select
            value={modelFilter}
            onChange={(e) => setModelFilter(e.target.value)}
            className="bg-gray-800 border border-gray-700/60 rounded-lg px-3 py-1.5 text-xs text-gray-400 outline-none focus:border-purple-500/50"
          >
            <option value="">全部模型</option>
            {data?.byModel.map((m) => (
              <option key={`${m.provider}/${m.model}`} value={`${m.provider}/${m.model}`}>
                {getProviderLabel(m.provider)} / {m.model}
              </option>
            ))}
          </select>
        </div>

        {filteredCalls.length === 0 ? (
          <div className="text-gray-600 text-xs text-center py-8">暂无调用记录</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-gray-500 border-b border-gray-800/60">
                  <th className="text-left py-2.5 pr-4 font-medium">时间</th>
                  <th className="text-left py-2.5 pr-4 font-medium">会话</th>
                  <th className="text-left py-2.5 pr-4 font-medium">模型</th>
                  <th className="text-right py-2.5 pr-4 font-medium">输入</th>
                  <th className="text-right py-2.5 pr-4 font-medium">输出</th>
                  <th className="text-right py-2.5 pr-4 font-medium">合计</th>
                  <th className="text-right py-2.5 font-medium">费用</th>
                </tr>
              </thead>
              <tbody>
                {filteredCalls.map((call, i) => (
                  <tr key={i} className="border-b border-gray-800/30 hover:bg-gray-800/40 transition-colors">
                    <td className="py-2.5 pr-4 text-gray-400 whitespace-nowrap">{formatDate(call.timestamp)}</td>
                    <td className="py-2.5 pr-4 text-gray-300 max-w-[180px] truncate" title={call.title}>{call.title}</td>
                    <td className="py-2.5 pr-4">
                      <div className="flex items-center gap-1.5">
                        <span className="w-1.5 h-1.5 rounded-full" style={{
                          backgroundColor: PROVIDER_COLORS[call.provider] || '#6b7280',
                        }} />
                        <span className="text-gray-300">{call.model}</span>
                        <span className="text-gray-600">({getProviderLabel(call.provider)})</span>
                      </div>
                    </td>
                    <td className="py-2.5 pr-4 text-right text-blue-400 tabular-nums">{formatTokens(call.inputTokens)}</td>
                    <td className="py-2.5 pr-4 text-right text-purple-400 tabular-nums">{formatTokens(call.outputTokens)}</td>
                    <td className="py-2.5 pr-4 text-right text-gray-300 font-medium tabular-nums">{formatTokens(call.totalTokens)}</td>
                    <td className="py-2.5 text-right text-emerald-400 tabular-nums">{formatCost(call.estimatedCost)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

// ======================= 子组件 =======================

/** 统计概览卡片 */
function SummaryCard({
  label, value, sub, icon: Icon, gradient, border, textColor, accentClass,
}: {
  label: string;
  value: string | number;
  sub: string;
  icon: React.ComponentType<{ className?: string }>;
  gradient: string;
  border: string;
  textColor: string;
  accentClass: string;
}) {
  return (
    <div className={`relative overflow-hidden rounded-2xl bg-gradient-to-br ${gradient} ${border} border p-5`}>
      <div className={`absolute -top-6 -right-6 w-16 h-16 rounded-full ${accentClass} blur-xl`} />
      <div className="flex items-center justify-between mb-3 relative">
        <span className="text-xs text-gray-500 font-medium">{label}</span>
        <Icon className={`w-4 h-4 ${textColor}`} />
      </div>
      <div className={`text-2xl font-bold ${textColor} tabular-nums mb-1 relative`}>
        {value}
      </div>
      <div className="text-xs text-gray-600 relative">{sub}</div>
    </div>
  );
}
