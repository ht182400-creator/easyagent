/**
 * 自动化任务页面
 *
 * P2-1 拆分：数据/创建弹窗/历史面板/任务列表已迁至 pages/automation/ 子模块，
 * 本文件保留编排（815 → ~260 行）。WebSocket 订阅实时进度的逻辑保留在主组件。
 * 创建弹窗按 `{showCreate && ...}` 条件挂载，模板预填经 `template` prop 传入。
 */
import { useEffect, useState, useRef, useCallback } from 'react';
import { Plus, History, Clock, Zap } from 'lucide-react';
import {
  useAutomationStore,
  SCHEDULE_PRESETS,
  type AutomationTask,
  type AutomationProgressEvent,
} from '../stores/automationStore';
import { useProviderStore } from '../stores/providerStore';
import { FEATURES, TASK_TEMPLATES, type TaskTemplatePrefill } from './automation/data';
import { CreateTaskModal } from './automation/CreateTaskModal';
import { HistoryPanel } from './automation/HistoryPanel';
import { TaskList } from './automation/TaskList';

export default function Automation() {
  const {
    tasks,
    history,
    loading,
    running,
    progressLogs,
    fetchTasks,
    fetchHistory,
    deleteTask,
    toggleTask,
    runTaskNow,
    stopTask,
    addProgressLog,
  } = useAutomationStore();
  const { fetchProviders } = useProviderStore();

  const [showCreate, setShowCreate] = useState(false);
  /** 待预填的模板（点"使用"后记录，创建弹窗打开时初始化表单） */
  const [template, setTemplate] = useState<TaskTemplatePrefill | null>(null);
  const [showHistory, setShowHistory] = useState(false);

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
          } catch (err) {
            /* ignore malformed messages */
          }
        };
        ws.onclose = () => {
          if (!closed) {
            reconnectTimer = setTimeout(connect, 5000);
          }
        };
        ws.onerror = () => {
          /* will trigger onclose */
        };
      } catch (err) {
        /* retry on next effect */
      }
    };

    connect();
    return () => {
      closed = true;
      ws?.close();
      if (reconnectTimer) clearTimeout(reconnectTimer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- addProgressLog 为 store 稳定引用
  }, []);

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

  const handleStop = (task: AutomationTask) => {
    stopTask(task.id);
  };

  /** 使用模板：记录预填并打开创建弹窗 */
  const handleUseTemplate = (tmpl: (typeof TASK_TEMPLATES)[number]) => {
    setTemplate({
      name: tmpl.name,
      prompt: tmpl.prompt,
      scheduleType: tmpl.scheduleType,
      rrule: tmpl.rrule || '',
    });
    setShowCreate(true);
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
            onClick={() => {
              setTemplate(null); // 空白表单
              setShowCreate(true);
            }}
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
            title={
              f.action === 'history'
                ? '点击展开/收起执行历史'
                : f.action === 'tasklist'
                  ? '点击查看任务列表'
                  : '点击查看任务模板'
            }
          >
            <f.icon
              className={`w-10 h-10 ${f.color} mx-auto mb-3 group-hover:scale-110 transition-transform`}
            />
            <h3 className="font-semibold">{f.title}</h3>
            <p className="text-sm text-gray-400 mt-2 group-hover:text-gray-300 transition-colors">
              {f.desc}
            </p>
          </div>
        ))}
      </div>

      {/* 执行历史面板 */}
      {showHistory && <HistoryPanel history={history} />}

      {/* 任务列表 */}
      <div ref={taskListRef}>
        <TaskList
          tasks={tasks}
          loading={loading}
          running={running}
          progressLogs={progressLogs}
          onRunNow={handleRunNow}
          onStop={handleStop}
          onToggle={handleToggle}
          onDelete={handleDelete}
        />
      </div>

      {/* 推荐模板 */}
      <div className="card" ref={templatesRef}>
        <h3 className="font-semibold mb-4 flex items-center gap-2">
          <Zap className="w-5 h-5 text-purple-400" />
          推荐任务模板
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {TASK_TEMPLATES.map((tmpl) => (
            <div
              key={tmpl.name}
              className="bg-gray-800 rounded-lg p-4 flex items-center justify-between hover:bg-gray-750 transition-colors"
            >
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

      {/* 创建任务弹窗（条件挂载 = 每次打开全新表单；template 预填经 prop 传入） */}
      {showCreate && (
        <CreateTaskModal template={template} onClose={() => setShowCreate(false)} />
      )}
    </div>
  );
}
