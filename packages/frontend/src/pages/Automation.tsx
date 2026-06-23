import { useEffect, useState, useRef, useCallback } from 'react';
import {
  Plus, Play, Pause, Trash2, Clock, RefreshCw, Calendar,
  Zap, X, CheckCircle2, XCircle, Hourglass, Settings,
  History, AlertTriangle, ChevronDown, ChevronUp,
} from 'lucide-react';
import {
  useAutomationStore,
  SCHEDULE_PRESETS,
  TASK_STATUS_COLORS,
  type AutomationTask,
  type AutomationRun,
  type ScheduleType,
  type AutomationProgressEvent,
} from '../stores/automationStore';
import { useAppStore } from '../stores/appStore';
import { useProviderStore } from '../stores/providerStore';

/** 功能卡片配置 */
const FEATURES = [
  { icon: Clock, title: '定时执行', desc: '支持 RRULE 表达式，设置每日/每周/每小时的定时任务', color: 'text-yellow-400', action: 'templates' as const },
  { icon: RefreshCw, title: '立即触发', desc: '随时手动触发任务执行，实时查看运行结果', color: 'text-green-400', action: 'tasklist' as const },
  { icon: History, title: '执行历史', desc: '查看完整的任务运行记录和 Token 消耗统计', color: 'text-purple-400', action: 'history' as const },
];

/** 预设任务模板 */
const TASK_TEMPLATES = [
  { name: '每日代码审查', scheduleType: 'recurring' as ScheduleType, rrule: 'FREQ=DAILY;BYHOUR=9;BYMINUTE=0', prompt: '请审查当前项目的最新代码变更，列出潜在问题、代码风格问题和安全风险，并给出改进建议。', icon: '🔍' },
  { name: '项目文档更新', scheduleType: 'recurring' as ScheduleType, rrule: 'FREQ=DAILY;BYHOUR=18;BYMINUTE=0', prompt: '检查今天的代码变更，更新项目的 README.md 和相关技术文档，确保文档与代码保持同步。', icon: '📝' },
  { name: '依赖安全检查', scheduleType: 'recurring' as ScheduleType, rrule: 'FREQ=WEEKLY;BYDAY=MO;BYHOUR=10;BYMINUTE=0', prompt: '检查项目依赖的安全漏洞，使用 npm audit 或类似工具，生成安全报告和修复建议。', icon: '🔒' },
  { name: '性能分析', scheduleType: 'recurring' as ScheduleType, rrule: 'FREQ=WEEKLY;BYDAY=FR;BYHOUR=17;BYMINUTE=0', prompt: '分析代码性能热点和瓶颈，提供优化建议，包括算法复杂度、内存使用、I/O 效率等方面。', icon: '⚡' },
];

/** 状态标签 */
function StatusBadge({ status }: { status: string }) {
  const config: Record<string, { label: string; color: string; bg: string }> = {
    ACTIVE: { label: '运行中', color: '#10b981', bg: 'bg-emerald-500/10' },
    PAUSED: { label: '已暂停', color: '#f59e0b', bg: 'bg-amber-500/10' },
    COMPLETED: { label: '已完成', color: '#6b7280', bg: 'bg-gray-500/10' },
    ERROR: { label: '异常', color: '#ef4444', bg: 'bg-red-500/10' },
  };
  const c = config[status] || config.PAUSED;
  return (
    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${c.bg}`} style={{ color: c.color }}>
      {c.label}
    </span>
  );
}

export default function Automation() {
  const { tasks, history, loading, running, lastRun, progressLogs, fetchTasks, fetchHistory, createTask, deleteTask, toggleTask, runTaskNow, stopTask, addProgressLog, clearProgressLogs } = useAutomationStore();
  const { providers, fetchProviders } = useProviderStore();
  const addNotification = useAppStore((s) => s.addNotification);

  const [showCreate, setShowCreate] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [expandedErrors, setExpandedErrors] = useState<Set<string>>(new Set());  // 展开的错误详情

  /** 功能卡片点击的滚动目标 ref */
  const taskListRef = useRef<HTMLDivElement>(null);
  const templatesRef = useRef<HTMLDivElement>(null);

  /** 点击功能介绍卡片：滚动到对应区域或展开面板 */
  const handleFeatureClick = useCallback((action: 'templates' | 'tasklist' | 'history') => {
    if (action === 'history') {
      // 展开/收起执行历史面板
      setShowHistory((prev) => !prev);
    } else if (action === 'tasklist' && taskListRef.current) {
      taskListRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } else if (action === 'templates' && templatesRef.current) {
      templatesRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, []);

  // 创建表单
  const [formName, setFormName] = useState('');
  const [formPrompt, setFormPrompt] = useState('');
  const [formScheduleType, setFormScheduleType] = useState<ScheduleType>('recurring');
  const [formRrule, setFormRrule] = useState('FREQ=DAILY;BYHOUR=9;BYMINUTE=0');
  const [formScheduledAt, setFormScheduledAt] = useState('');
  const [formMaxDuration, setFormMaxDuration] = useState<number | undefined>(30);
  // 模型选择
  const [formProvider, setFormProvider] = useState('');
  const [formModel, setFormModel] = useState('');

  useEffect(() => {
    fetchTasks();
    fetchHistory();
    fetchProviders();
  }, [fetchTasks, fetchHistory, fetchProviders]);

  /** 
   * WebSocket 连接：订阅自动化任务进度
   * 接收服务端推送的工具调用、推理轮次等实时事件
   */
  useEffect(() => {
    const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
    const host = import.meta.env.DEV ? 'localhost:3456' : location.host;
    const wsUrl = `${protocol}//${host}/ws`;

    let ws: WebSocket | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let closed = false;

    const connect = () => {
      if (closed) return;
      try {
        ws = new WebSocket(wsUrl);
        ws.onopen = () => {
          ws?.send(JSON.stringify({ type: 'subscribe_automation' }));
        };
        ws.onmessage = (event) => {
          try {
            const msg = JSON.parse(event.data);
            if (msg.type === 'automation_progress') {
              const progress = msg as AutomationProgressEvent;
              addProgressLog(progress.taskId, {
                timestamp: progress.timestamp,
                type: progress.type,
                message: progress.message,
                detail: progress.detail,
              });
            }
          } catch (err) { /* ignore malformed messages */ }
        };
        ws.onclose = () => {
          if (!closed) {
            reconnectTimer = setTimeout(connect, 5000);
          }
        };
        ws.onerror = () => { /* will trigger onclose */ };
      } catch (err) { /* retry on next effect */ }
    };

    connect();
    return () => {
      closed = true;
      ws?.close();
      if (reconnectTimer) clearTimeout(reconnectTimer);
    };
  }, []);

  /** 当前选中 provider 的模型列表 */
  const selectedProviderModels = providers.find((p) => p.id === formProvider)?.models || [];
  /** 所有提供商列表（包含未配置的，供用户选择） */
  const allProviders = providers;
  /** 有密钥的提供商列表（用于判断执行可行性） */
  const configuredProviderIds = new Set(providers.filter((p) => p.hasKey).map((p) => p.id));

  const handleCreate = async () => {
    if (!formName.trim()) {
      addNotification({ type: 'warning', message: '请输入任务名称' });
      return;
    }
    if (!formPrompt.trim()) {
      addNotification({ type: 'warning', message: '请输入任务提示词' });
      return;
    }
    try {
      await createTask({
        name: formName,
        prompt: formPrompt,
        scheduleType: formScheduleType,
        rrule: formScheduleType === 'recurring' ? formRrule : undefined,
        scheduledAt: formScheduleType === 'once' ? formScheduledAt : undefined,
        cwds: [],
        status: 'ACTIVE',
        maxDurationMinutes: formMaxDuration,
        provider: formProvider || undefined,
        model: formModel || undefined,
      });
      setShowCreate(false);
      resetForm();
    } catch (err) {
      addNotification({ type: 'error', message: `创建失败: ${(err as Error).message}` });
    }
  };

  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`确定要删除任务 "${name}" 吗？`)) return;
    await deleteTask(id);
  };

  const handleToggle = async (task: AutomationTask) => {
    const active = task.status !== 'ACTIVE';
    await toggleTask(task.id, active);
  };

  const handleRunNow = async (task: AutomationTask) => {
    if (running.has(task.id)) return;
    await runTaskNow(task.id);
  };

  const handleStop = async (task: AutomationTask) => {
    stopTask(task.id);
  };

  const handleUseTemplate = (template: typeof TASK_TEMPLATES[number]) => {
    setFormName(template.name);
    setFormPrompt(template.prompt);
    setFormScheduleType(template.scheduleType);
    setFormRrule(template.rrule || '');
    setShowCreate(true);
  };

  const resetForm = () => {
    setFormName('');
    setFormPrompt('');
    setFormScheduleType('recurring');
    setFormRrule('FREQ=DAILY;BYHOUR=9;BYMINUTE=0');
    setFormScheduledAt('');
    setFormMaxDuration(30);
    setFormProvider('');
    setFormModel('');
  };

  return (
    <div className="space-y-6">
      {/* 头部 */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">自动化任务</h1>
          <p className="text-gray-400 mt-1">创建定时执行的AI任务，自动化重复工作</p>
        </div>
        <div className="flex gap-2">
          <button
            className="btn-secondary flex items-center gap-2 text-sm"
            onClick={() => setShowHistory(!showHistory)}
          >
            <History className="w-4 h-4" /> 执行历史
          </button>
          <button
            className="btn-primary flex items-center gap-2"
            onClick={() => { resetForm(); setShowCreate(true); }}
          >
            <Plus className="w-4 h-4" /> 创建任务
          </button>
        </div>
      </div>

      {/* 功能介绍 - 可点击跳转 */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {FEATURES.map((f) => (
          <div
            key={f.title}
            className="card text-center cursor-pointer hover:border-primary-500/30 hover:bg-gray-800/80 transition-all group"
            onClick={() => handleFeatureClick(f.action)}
            title={f.action === 'history' ? '点击展开/收起执行历史' : f.action === 'tasklist' ? '点击查看任务列表' : '点击查看任务模板'}
          >
            <f.icon className={`w-10 h-10 ${f.color} mx-auto mb-3 group-hover:scale-110 transition-transform`} />
            <h3 className="font-semibold">{f.title}</h3>
            <p className="text-sm text-gray-400 mt-2 group-hover:text-gray-300 transition-colors">{f.desc}</p>
          </div>
        ))}
      </div>

      {/* 执行历史面板 */}
      {showHistory && (
        <div className="card">
          <h3 className="font-semibold mb-4 flex items-center gap-2">
            <History className="w-5 h-5 text-purple-400" />
            执行历史
          </h3>
          {history.length === 0 ? (
            <div className="text-center py-6 text-gray-500">
              <History className="w-10 h-10 mx-auto mb-2 text-gray-700" />
              <p>暂无执行记录</p>
            </div>
          ) : (
            <div className="space-y-2 max-h-80 overflow-y-auto">
              {history.slice(0, 30).map((run) => (
                <div key={run.id}>
                  <div 
                    className={`bg-gray-800 rounded-lg p-3 flex items-center justify-between ${
                      run.status === 'failed' && run.error ? 'cursor-pointer hover:bg-gray-750' : ''
                    }`}
                    onClick={() => {
                      if (run.status === 'failed' && run.error) {
                        setExpandedErrors((prev) => {
                          const next = new Set(prev);
                          next.has(run.id) ? next.delete(run.id) : next.add(run.id);
                          return next;
                        });
                      }
                    }}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      {run.status === 'running' ? <Hourglass className="w-4 h-4 text-yellow-400 animate-pulse" /> :
                       run.status === 'completed' ? <CheckCircle2 className="w-4 h-4 text-emerald-400" /> :
                       <XCircle className="w-4 h-4 text-red-400" />}
                      <div className="min-w-0">
                        <p className="font-medium text-sm truncate">{run.taskName}</p>
                        <p className="text-xs text-gray-500">
                          {new Date(run.startTime).toLocaleString('zh-CN')}
                          {run.tokenUsage && ` · ${run.tokenUsage.total} tokens`}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <span className={`text-xs px-2 py-0.5 rounded ${
                        run.status === 'completed' ? 'bg-emerald-500/10 text-emerald-400' :
                        run.status === 'running' ? 'bg-amber-500/10 text-amber-400' :
                        'bg-red-500/10 text-red-400'
                      }`}>
                        {run.status === 'completed' ? '成功' : run.status === 'running' ? '执行中' : '失败'}
                      </span>
                      {run.status === 'failed' && run.error && (
                        expandedErrors.has(run.id) 
                          ? <ChevronUp className="w-3.5 h-3.5 text-gray-500" />
                          : <ChevronDown className="w-3.5 h-3.5 text-gray-500" />
                      )}
                    </div>
                  </div>
                  {/* 展开的错误详情 */}
                  {run.status === 'failed' && run.error && expandedErrors.has(run.id) && (
                    <div className="bg-red-500/5 border border-red-500/20 rounded-lg p-3 mt-1 ml-9">
                      <p className="text-xs text-red-400 font-medium mb-1">错误原因</p>
                      <pre className="text-xs text-red-300 whitespace-pre-wrap break-words">{run.error}</pre>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* 任务列表 */}
      <div className="card" ref={taskListRef}>
        <h3 className="font-semibold mb-4 flex items-center gap-2">
          <Clock className="w-5 h-5 text-yellow-400" />
          任务列表 ({tasks.length})
        </h3>

        {loading ? (
          <div className="text-center py-8">
            <RefreshCw className="w-8 h-8 animate-spin mx-auto mb-2 text-gray-600" />
            <p className="text-gray-500">加载中...</p>
          </div>
        ) : tasks.length === 0 ? (
          <div className="text-center py-8">
            <Clock className="w-12 h-12 text-gray-700 mx-auto mb-3" />
            <p className="text-gray-500">暂无自动化任务</p>
            <p className="text-sm text-gray-600 mt-1">点击"创建任务"或使用下方模板快速开始</p>
          </div>
        ) : (
          <div className="space-y-3">
            {tasks.map((task) => (
              <div key={task.id} className="bg-gray-800 rounded-lg p-4">
                <div className="flex items-start justify-between mb-2">
                  <div className="flex-1 min-w-0 mr-4">
                    <div className="flex items-center gap-2 mb-1">
                      <h4 className="font-medium">{task.name}</h4>
                      <StatusBadge status={task.status} />
                      {running.has(task.id) && (
                        <span className="flex items-center gap-1 text-xs text-yellow-400">
                          <RefreshCw className="w-3 h-3 animate-spin" /> 执行中
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-gray-500 truncate">{task.prompt}</p>
                    <div className="flex items-center gap-3 mt-1 text-xs text-gray-600">
                      {task.provider && (
                        <span className="text-primary-400/70">模型: {task.provider}/{task.model || '默认'}</span>
                      )}
                    </div>
                    <div className="flex items-center gap-3 mt-2 text-xs text-gray-600">
                      <span className="flex items-center gap-1">
                        <Calendar className="w-3 h-3" />
                        {task.scheduleType === 'recurring' ? '定时循环' : '一次性'}
                      </span>
                      {task.nextRunAt && (
                        <span>下次: {new Date(task.nextRunAt).toLocaleString('zh-CN')}</span>
                      )}
                      {task.lastRunAt && (
                        <span>上次: {new Date(task.lastRunAt).toLocaleString('zh-CN')}</span>
                      )}
                      <span>已执行 {task.runCount} 次</span>
                    </div>

                    {/* 实时执行进度日志 */}
                    {running.has(task.id) && progressLogs.get(task.id) && progressLogs.get(task.id)!.length > 0 && (
                      <div className="mt-3 max-h-40 overflow-y-auto border-t border-gray-700/50 pt-2">
                        <p className="text-xs text-gray-500 mb-1 font-medium">实时执行日志</p>
                        {progressLogs.get(task.id)!.slice(-20).map((log, i) => (
                          <div key={i} className="text-xs py-0.5 flex items-start gap-2">
                            <span className="text-gray-600 flex-shrink-0 w-14 text-right">
                              {new Date(log.timestamp).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                            </span>
                            <span className={`flex-shrink-0 ${
                              log.type === 'tool_call' ? 'text-blue-400' :
                              log.type === 'tool_result' ? 'text-purple-400' :
                              log.type === 'agent_error' ? 'text-red-400' :
                              log.type === 'agent_done' ? 'text-emerald-400' :
                              'text-yellow-400'
                            }`}>
                              {log.message}
                            </span>
                            {log.detail && (
                              <span className="text-gray-500 truncate max-w-[200px]" title={log.detail}>
                                {log.detail.length > 60 ? log.detail.substring(0, 60) + '...' : log.detail}
                              </span>
                            )}
                          </div>
                        ))}
                        {progressLogs.get(task.id)!.length > 20 && (
                          <p className="text-xs text-gray-600 mt-1">仅显示最近 20 条，共 {progressLogs.get(task.id)!.length} 条</p>
                        )}
                      </div>
                    )}
                  </div>

                  {/* 操作按钮 */}
                  <div className="flex items-center gap-1.5 flex-shrink-0">
                    {running.has(task.id) ? (
                      <button
                        className="p-2 rounded-lg bg-red-500/10 text-red-400 hover:bg-red-500/20 transition-colors"
                        title="停止"
                        onClick={() => handleStop(task)}
                      >
                        <XCircle className="w-4 h-4" />
                      </button>
                    ) : (
                      <button
                        className="p-2 rounded-lg bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20 transition-colors"
                        title="立即执行"
                        onClick={() => handleRunNow(task)}
                      >
                        <Play className="w-4 h-4" />
                      </button>
                    )}
                    <button
                      className="p-2 rounded-lg hover:bg-gray-700 transition-colors"
                      title={task.status === 'ACTIVE' ? '暂停' : '启用'}
                      onClick={() => handleToggle(task)}
                    >
                      {task.status === 'ACTIVE' ? (
                        <Pause className="w-4 h-4 text-yellow-400" />
                      ) : (
                        <Play className="w-4 h-4 text-gray-500" />
                      )}
                    </button>
                    <button
                      className="p-2 rounded-lg hover:bg-red-500/10 transition-colors"
                      title="删除"
                      onClick={() => handleDelete(task.id, task.name)}
                    >
                      <Trash2 className="w-4 h-4 text-red-400" />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 推荐模板 */}
      <div className="card" ref={templatesRef}>
        <h3 className="font-semibold mb-4 flex items-center gap-2">
          <Zap className="w-5 h-5 text-purple-400" />
          推荐任务模板
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {TASK_TEMPLATES.map((tmpl) => (
            <div key={tmpl.name} className="bg-gray-800 rounded-lg p-4 flex items-center justify-between hover:bg-gray-750 transition-colors">
              <div className="flex items-center gap-3 min-w-0">
                <span className="text-2xl">{tmpl.icon}</span>
                <div className="min-w-0">
                  <h4 className="font-medium text-sm">{tmpl.name}</h4>
                  <p className="text-xs text-gray-500 truncate">{tmpl.prompt.slice(0, 60)}...</p>
                  <span className="text-xs text-gray-600 mt-1 block">
                    {SCHEDULE_PRESETS.find((p) => p.rrule === tmpl.rrule)?.label || tmpl.rrule}
                  </span>
                </div>
              </div>
              <button
                className="btn-secondary text-xs py-1 px-3 flex items-center gap-1 flex-shrink-0"
                onClick={() => handleUseTemplate(tmpl)}
              >
                <Plus className="w-3 h-3" /> 使用
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* 创建任务弹窗 */}
      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setShowCreate(false)}>
          <div className="bg-gray-900 border border-gray-700 rounded-xl w-full max-w-lg mx-4 p-6" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-lg font-bold flex items-center gap-2">
                <Settings className="w-5 h-5 text-primary-400" />
                创建自动化任务
              </h2>
              <button className="p-1 hover:bg-gray-800 rounded-lg" onClick={() => setShowCreate(false)}>
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4">
              {/* 任务名 */}
              <div>
                <label className="block text-sm font-medium text-gray-400 mb-1">任务名称</label>
                <input
                  type="text"
                  className="input w-full"
                  placeholder="例如: 每日代码审查"
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
                />
              </div>

              {/* 提示词 */}
              <div>
                <label className="block text-sm font-medium text-gray-400 mb-1">任务提示词</label>
                <textarea
                  className="input w-full h-24 resize-none"
                  placeholder="描述让AI做什么..."
                  value={formPrompt}
                  onChange={(e) => setFormPrompt(e.target.value)}
                />
              </div>

              {/* 模型选择 */}
              <div>
                <label className="block text-sm font-medium text-gray-400 mb-1">
                  运行模型（可选，默认使用当前选中的模型）
                </label>
                {allProviders.length === 0 ? (
                  <div className="flex items-center gap-2 text-xs text-amber-400 bg-amber-500/10 rounded-lg p-3">
                    <AlertTriangle className="w-4 h-4 flex-shrink-0" />
                    尚未配置任何模型提供商，任务将无法执行。请先在「设置 → 模型提供商」中配置。
                  </div>
                ) : (
                  <>
                    <div className="flex gap-2">
                      <select
                        className="input flex-1"
                        value={formProvider}
                        onChange={(e) => {
                          setFormProvider(e.target.value);
                          setFormModel('');  // 清空模型选择
                        }}
                      >
                        <option value="">默认（当前选中）</option>
                        {allProviders.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.name}{configuredProviderIds.has(p.id) ? '' : ' (未配置密钥)'}
                          </option>
                        ))}
                      </select>
                      {formProvider && (
                        <select
                          className="input flex-1"
                          value={formModel}
                          onChange={(e) => setFormModel(e.target.value)}
                        >
                          <option value="">默认模型</option>
                          {selectedProviderModels.map((m) => (
                            <option key={m.id} value={m.id}>{m.id}</option>
                          ))}
                        </select>
                      )}
                    </div>
                    {/* 选中未配置的提供商时给出提示 */}
                    {formProvider && !configuredProviderIds.has(formProvider) && (
                      <div className="flex items-center gap-2 text-xs text-amber-400 bg-amber-500/10 rounded-lg p-2 mt-2">
                        <AlertTriangle className="w-4 h-4 flex-shrink-0" />
                        该提供商尚未配置 API 密钥，需先在「设置 → 模型提供商」中配置后才能正常执行任务。
                      </div>
                    )}
                  </>
                )}
              </div>

              {/* 调度类型 */}
              <div>
                <label className="block text-sm font-medium text-gray-400 mb-1">调度类型</label>
                <div className="flex gap-2">
                  <button
                    className={`flex-1 py-2 rounded-lg text-sm transition-colors ${formScheduleType === 'recurring' ? 'bg-primary-500/20 text-primary-400 border border-primary-500/30' : 'bg-gray-800 text-gray-400'}`}
                    onClick={() => setFormScheduleType('recurring')}
                  >
                    定时循环
                  </button>
                  <button
                    className={`flex-1 py-2 rounded-lg text-sm transition-colors ${formScheduleType === 'once' ? 'bg-primary-500/20 text-primary-400 border border-primary-500/30' : 'bg-gray-800 text-gray-400'}`}
                    onClick={() => setFormScheduleType('once')}
                  >
                    一次性
                  </button>
                </div>
              </div>

              {/* 调度参数 */}
              {formScheduleType === 'recurring' ? (
                <div>
                  <label className="block text-sm font-medium text-gray-400 mb-1">执行频率</label>
                  <div className="grid grid-cols-3 gap-2">
                    {SCHEDULE_PRESETS.map((preset) => (
                      <button
                        key={preset.rrule}
                        className={`py-2 px-3 rounded-lg text-xs transition-colors ${formRrule === preset.rrule ? 'bg-primary-500/20 text-primary-400 border border-primary-500/30' : 'bg-gray-800 text-gray-400 hover:bg-gray-750'}`}
                        onClick={() => setFormRrule(preset.rrule)}
                      >
                        {preset.label}
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                <div>
                  <label className="block text-sm font-medium text-gray-400 mb-1">执行时间</label>
                  <input
                    type="datetime-local"
                    className="input w-full"
                    value={formScheduledAt}
                    onChange={(e) => setFormScheduledAt(e.target.value)}
                  />
                </div>
              )}

              {/* 超时限制 */}
              <div>
                <label className="block text-sm font-medium text-gray-400 mb-1">
                  超时限制 (分钟，可选)
                </label>
                <input
                  type="number"
                  className="input w-24"
                  min={1}
                  max={120}
                  value={formMaxDuration || ''}
                  onChange={(e) => setFormMaxDuration(e.target.value ? parseInt(e.target.value) : undefined)}
                />
              </div>

              {formScheduleType === 'once' && !formScheduledAt && (
                <div className="flex items-center gap-2 text-xs text-amber-400 bg-amber-500/10 rounded-lg p-3">
                  <AlertTriangle className="w-4 h-4 flex-shrink-0" />
                  未设置执行时间，任务创建后将立即执行
                </div>
              )}
            </div>

            <div className="flex justify-end gap-3 mt-6">
              <button className="btn-secondary" onClick={() => setShowCreate(false)}>取消</button>
              <button className="btn-primary flex items-center gap-2" onClick={handleCreate}>
                <Plus className="w-4 h-4" /> 创建任务
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
