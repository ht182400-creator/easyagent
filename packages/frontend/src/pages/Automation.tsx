/**
 * 自动化任务页面
 *
 * P2-1 拆分：数据/创建弹窗/历史面板/任务列表已迁至 pages/automation/ 子模块，
 * 本文件保留编排（815 → ~260 行）。WebSocket 订阅实时进度的逻辑保留在主组件。
 * 创建弹窗按 `{showCreate && ...}` 条件挂载，模板预填经 `template` prop 传入。
 */
import { useEffect, useState, useRef, useCallback } from 'react';
import { Plus, History, Clock, Zap, HelpCircle, RefreshCw } from 'lucide-react';
import {
  useAutomationStore,
  SCHEDULE_PRESETS,
  normalizeAutomationStep,
  type AutomationTask,
  type AgentQuestion,
} from '../stores/automationStore';
import { useProviderStore } from '../stores/providerStore';
import { FEATURES, TASK_TEMPLATES } from './automation/data';
// ⚠️ TaskTemplatePrefill 定义在 CreateTaskModal（不是 data）—— 之前导入来源写错，只有 tsc 能发现
import { CreateTaskModal, type TaskTemplatePrefill } from './automation/CreateTaskModal';
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
    questions,
    addQuestion,
    fetchQuestions,
    answerQuestion,
  } = useAutomationStore();
  const { fetchProviders } = useProviderStore();

  const [showCreate, setShowCreate] = useState(false);
  /** 待预填的模板（点"使用"后记录，创建弹窗打开时初始化表单） */
  const [template, setTemplate] = useState<TaskTemplatePrefill | null>(null);
  const [showHistory, setShowHistory] = useState(false);
  /** 「立即触发」任务选择器 */
  const [showRunPicker, setShowRunPicker] = useState(false);
  /** HITL：各提问的输入草稿（questionId → 文本） */
  const [answers, setAnswers] = useState<Record<string, string>>({});

  /** 功能卡片点击的滚动目标 ref */
  const taskListRef = useRef<HTMLDivElement>(null);
  const templatesRef = useRef<HTMLDivElement>(null);

  /**
   * 点击功能介绍卡片
   *
   * ⚠️ 旧实现里「立即触发」只是**滚动到任务列表** —— 列表本来就在视野内时，
   * 用户点击后毫无反馈，看起来像按钮坏了（2026-09-19 实报「点击立即触发不管用」）。
   * 现在改为语义明确的行为：新建 / 选择任务立即触发 / 展开历史。
   */
  const handleFeatureClick = useCallback((action: 'create' | 'runnow' | 'history') => {
    if (action === 'history') {
      setShowHistory((prev) => !prev);
    } else if (action === 'create') {
      setTemplate(null);
      setShowCreate(true);
    } else {
      setShowRunPicker(true);
    }
  }, []);

  useEffect(() => {
    fetchTasks();
    fetchHistory();
    fetchProviders();
    // 刷新页面后把仍然待回答的 Agent 提问拉回来（HITL）
    fetchQuestions();
  }, [fetchTasks, fetchHistory, fetchProviders, fetchQuestions]);

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
            // ⚠️ 后端把「步骤类型」直接放在 msg.type 上（agent_start / tool_call / …），
            // 而不是信封类型 'automation_progress' —— 旧代码只认后者，导致实时日志永远为空
            //（用户实报：只显示「执行中」，看不到在干什么）。见 normalizeAutomationStep 注释。
            // 人在环路：Agent 提问（推送到界面等待回答，超时后 Agent 自行判断）
            if (msg.type === 'agent_question') {
              addQuestion(msg as AgentQuestion);
              return;
            }

            const step = normalizeAutomationStep(msg);
            if (step) {
              addProgressLog(msg.taskId, {
                timestamp: msg.timestamp ?? Date.now(),
                type: step,
                message: msg.message,
                detail: msg.detail,
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

      {/* 人在环路：Agent 提问 —— 任务正在等你回答（不答则超时后 Agent 自行决策） */}
      {questions.length > 0 && (
        <div className="card border border-amber-500/40 bg-amber-500/5">
          {questions.map((q) => (
            <div key={q.id} className="mb-5 last:mb-0">
              <h3 className="font-semibold flex items-center gap-2 text-amber-300">
                <HelpCircle className="w-5 h-5" />
                {q.title || 'Agent 需要你的决策'}
                <span className="text-xs text-gray-500 font-normal">
                  剩余 {Math.max(0, Math.round((q.expiresAt - Date.now()) / 1000))}s 后自动跳过
                </span>
              </h3>
              <p className="text-sm text-gray-200 mt-2 whitespace-pre-wrap">{q.question}</p>

              {q.options && q.options.length > 0 && (
                <div className="flex flex-wrap gap-2 mt-3">
                  {q.options.map((opt) => (
                    <button
                      key={opt}
                      className="btn-secondary text-sm"
                      onClick={() => answerQuestion(q.id, opt)}
                    >
                      {opt}
                    </button>
                  ))}
                </div>
              )}

              <div className="flex gap-2 mt-3">
                <input
                  className="flex-1 bg-gray-900/50 border border-gray-700/50 rounded-lg px-3 py-2 text-sm
                    text-gray-200 placeholder-gray-600 focus:outline-none focus:ring-2 focus:ring-amber-500/30"
                  placeholder="输入回答后按回车（也可点上方选项）"
                  value={answers[q.id] || ''}
                  onChange={(e) => setAnswers({ ...answers, [q.id]: e.target.value })}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && (answers[q.id] || '').trim()) {
                      answerQuestion(q.id, answers[q.id].trim());
                    }
                  }}
                />
                <button
                  className="btn-primary text-sm"
                  disabled={!(answers[q.id] || '').trim()}
                  onClick={() => answerQuestion(q.id, (answers[q.id] || '').trim())}
                >
                  回复
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

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
                : f.action === 'runnow'
                  ? '点击选择要立即执行的任务'
                  : '点击新建定时任务'
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

      {/* 立即触发：选择要立刻执行的任务（此前「立即触发」卡片只是滚动，用户以为按钮坏了） */}
      {showRunPicker && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
          onClick={() => setShowRunPicker(false)}
        >
          <div className="card w-full max-w-md" onClick={(e) => e.stopPropagation()}>
            <h3 className="font-semibold mb-1 flex items-center gap-2">
              <RefreshCw className="w-4 h-4 text-green-400" /> 立即触发任务
            </h3>
            <p className="text-xs text-gray-500 mb-3">
              选择任一任务立刻执行（暂停中的任务也可手动执行一次）
            </p>
            {tasks.length === 0 ? (
              <p className="text-sm text-gray-500 py-4 text-center">暂无任务，请先「创建任务」</p>
            ) : (
              <div className="space-y-2 max-h-72 overflow-y-auto">
                {tasks.map((t) => {
                  const isRunning = running.has(t.id);
                  return (
                    <button
                      key={t.id}
                      disabled={isRunning}
                      onClick={async () => {
                        setShowRunPicker(false);
                        await runTaskNow(t.id);
                      }}
                      className={`w-full text-left p-3 rounded-lg border transition-colors ${
                        isRunning
                          ? 'border-gray-700/50 bg-gray-800/40 opacity-60 cursor-not-allowed'
                          : 'border-gray-700/50 bg-gray-800/60 hover:bg-gray-700/60'
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-sm">{t.name}</span>
                        {isRunning && <span className="text-xs text-yellow-400">执行中…</span>}
                        {t.status !== 'ACTIVE' && !isRunning && (
                          <span className="text-xs text-amber-400">已暂停</span>
                        )}
                      </div>
                      <p className="text-xs text-gray-500 truncate mt-0.5">{t.prompt}</p>
                    </button>
                  );
                })}
              </div>
            )}
            <div className="flex justify-end mt-4">
              <button className="btn-secondary text-sm" onClick={() => setShowRunPicker(false)}>
                关闭
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 创建任务弹窗（条件挂载 = 每次打开全新表单；template 预填经 prop 传入） */}
      {showCreate && <CreateTaskModal template={template} onClose={() => setShowCreate(false)} />}
    </div>
  );
}
