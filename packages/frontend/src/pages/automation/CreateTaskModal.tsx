/**
 * 自动化任务页面 - 创建任务弹窗（P2-1 拆分产物，自 Automation.tsx 纯搬迁）
 *
 * 表单状态（名称/提示词/调度/模型/超时）内聚于弹窗内部；
 * 弹窗按 `{showCreate && ...}` 条件挂载，每次打开即全新状态。
 * 模板预填通过 `template` prop 传入（主组件点击"使用"后记录）。
 *
 * @module pages/automation/CreateTaskModal
 */

import { useState } from 'react';
import { Settings, X, Plus, AlertTriangle } from 'lucide-react';
import {
  SCHEDULE_PRESETS,
  useAutomationStore,
  type ScheduleType,
} from '../../stores/automationStore';
import { useProviderStore } from '../../stores/providerStore';
import { useAppStore } from '../../stores/appStore';

/** 模板预填数据（主组件点击"使用"后传入；null = 空白表单） */
export interface TaskTemplatePrefill {
  name: string;
  prompt: string;
  scheduleType: ScheduleType;
  rrule: string;
}

/** 创建任务弹窗属性 */
export interface CreateTaskModalProps {
  /** 模板预填（null = 空白表单） */
  template: TaskTemplatePrefill | null;
  /** 关闭弹窗 */
  onClose: () => void;
}

export function CreateTaskModal({ template, onClose }: CreateTaskModalProps) {
  const { createTask } = useAutomationStore();
  const { providers } = useProviderStore();
  const addNotification = useAppStore((s) => s.addNotification);

  const [formName, setFormName] = useState(template?.name || '');
  const [formPrompt, setFormPrompt] = useState(template?.prompt || '');
  const [formScheduleType, setFormScheduleType] = useState<ScheduleType>(
    template?.scheduleType || 'recurring',
  );
  const [formRrule, setFormRrule] = useState(template?.rrule || 'FREQ=DAILY;BYHOUR=9;BYMINUTE=0');
  const [formScheduledAt, setFormScheduledAt] = useState('');
  const [formMaxDuration, setFormMaxDuration] = useState<number | undefined>(30);
  // 模型选择
  const [formProvider, setFormProvider] = useState('');
  const [formModel, setFormModel] = useState('');

  /** 当前选中 provider 的模型列表 */
  const selectedProviderModels = providers.find((p) => p.id === formProvider)?.models || [];
  /** 所有提供商列表（包含未配置的，供用户选择） */
  const allProviders = providers;
  /** 有密钥的提供商列表（用于判断执行可行性） */
  const configuredProviderIds = new Set<string>(providers.filter((p) => p.hasKey).map((p) => p.id));

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
      onClose();
    } catch (err) {
      addNotification({ type: 'error', message: `创建失败: ${(err as Error).message}` });
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      onClick={onClose}
    >
      <div
        className="bg-gray-900 border border-gray-700 rounded-xl w-full max-w-lg mx-4 p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-lg font-bold flex items-center gap-2">
            <Settings className="w-5 h-5 text-primary-400" />
            创建自动化任务
          </h2>
          <button className="p-1 hover:bg-gray-800 rounded-lg" onClick={onClose}>
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
                      setFormModel(''); // 清空模型选择
                    }}
                  >
                    <option value="">默认（当前选中）</option>
                    {allProviders.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                        {configuredProviderIds.has(p.id) ? '' : ' (未配置密钥)'}
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
                        <option key={m.id} value={m.id}>
                          {m.id}
                        </option>
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
              onChange={(e) =>
                setFormMaxDuration(e.target.value ? parseInt(e.target.value) : undefined)
              }
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
          <button className="btn-secondary" onClick={onClose}>
            取消
          </button>
          <button className="btn-primary flex items-center gap-2" onClick={handleCreate}>
            <Plus className="w-4 h-4" /> 创建任务
          </button>
        </div>
      </div>
    </div>
  );
}
