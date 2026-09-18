/**
 * 自动化任务页面 - 任务列表卡片（P2-1 拆分产物，自 Automation.tsx 纯搬迁）
 * 含实时执行进度日志渲染；交互只上报，业务逻辑留在主组件。
 *
 * @module pages/automation/TaskList
 */

import { Clock, RefreshCw, Calendar, Play, Pause, Trash2, XCircle } from 'lucide-react';
import type { AutomationTask, AutomationProgressEvent } from '../../stores/automationStore';
import { StatusBadge } from './data';

/** 任务列表属性 */
export interface TaskListProps {
  tasks: AutomationTask[];
  loading: boolean;
  /** 正在执行中的任务 id 集合 */
  running: Set<string>;
  /** 实时执行进度日志（taskId → 事件序列） */
  progressLogs: Map<string, AutomationProgressEvent[]>;
  onRunNow: (task: AutomationTask) => void;
  onStop: (task: AutomationTask) => void;
  onToggle: (task: AutomationTask) => void;
  onDelete: (id: string, name: string) => void;
}

export function TaskList({
  tasks,
  loading,
  running,
  progressLogs,
  onRunNow,
  onStop,
  onToggle,
  onDelete,
}: TaskListProps) {
  return (
    <div className="card">
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
                      <span className="text-primary-400/70">
                        模型: {task.provider}/{task.model || '默认'}
                      </span>
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
                  {running.has(task.id) &&
                    progressLogs.get(task.id) &&
                    progressLogs.get(task.id)!.length > 0 && (
                      <div className="mt-3 max-h-40 overflow-y-auto border-t border-gray-700/50 pt-2">
                        <p className="text-xs text-gray-500 mb-1 font-medium">实时执行日志</p>
                        {progressLogs
                          .get(task.id)!
                          .slice(-20)
                          .map((log, i) => (
                            <div key={i} className="text-xs py-0.5 flex items-start gap-2">
                              <span className="text-gray-600 flex-shrink-0 w-14 text-right">
                                {new Date(log.timestamp).toLocaleTimeString('zh-CN', {
                                  hour: '2-digit',
                                  minute: '2-digit',
                                  second: '2-digit',
                                })}
                              </span>
                              <span
                                className={`flex-shrink-0 ${
                                  log.type === 'tool_call'
                                    ? 'text-blue-400'
                                    : log.type === 'tool_result'
                                      ? 'text-purple-400'
                                      : log.type === 'agent_error'
                                        ? 'text-red-400'
                                        : log.type === 'agent_done'
                                          ? 'text-emerald-400'
                                          : 'text-yellow-400'
                                }`}
                              >
                                {log.message}
                              </span>
                              {log.detail && (
                                <span
                                  className="text-gray-500 truncate max-w-[200px]"
                                  title={log.detail}
                                >
                                  {log.detail.length > 60
                                    ? log.detail.substring(0, 60) + '...'
                                    : log.detail}
                                </span>
                              )}
                            </div>
                          ))}
                        {progressLogs.get(task.id)!.length > 20 && (
                          <p className="text-xs text-gray-600 mt-1">
                            仅显示最近 20 条，共 {progressLogs.get(task.id)!.length} 条
                          </p>
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
                      onClick={() => onStop(task)}
                    >
                      <XCircle className="w-4 h-4" />
                    </button>
                  ) : (
                    <button
                      className="p-2 rounded-lg bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20 transition-colors"
                      title="立即执行"
                      onClick={() => onRunNow(task)}
                    >
                      <Play className="w-4 h-4" />
                    </button>
                  )}
                  <button
                    className="p-2 rounded-lg hover:bg-gray-700 transition-colors"
                    title={task.status === 'ACTIVE' ? '暂停' : '启用'}
                    onClick={() => onToggle(task)}
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
                    onClick={() => onDelete(task.id, task.name)}
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
  );
}
