/**
 * 升级版设置页面 - 使用 settingsStore 持久化
 * 支持: Agent配置、安全设置、主题选择、快捷键偏好
 */
import { Sliders, Shield, Monitor, Keyboard, Save, Loader2, RefreshCw, ExternalLink } from 'lucide-react';
import { useSettingsStore } from '../stores/settingsStore';
import { useAppStore } from '../stores/appStore';
import { useState, useEffect } from 'react';

/** 版本信息接口 */
interface VersionInfo {
  version: string;
  codename: string;
  releaseDate: string;
  changelog: string;
}

/** 更新检查结果接口 */
interface UpdateCheckResult {
  currentVersion: string;
  latestVersion: string;
  hasUpdate: boolean;
  releaseUrl: string;
  publishedAt: string;
  body: string;
  error?: string;
}

export default function SettingsPage() {
  const {
    agent, security, preferences,
    setAgentSettings, setSecuritySettings, setPreferences,
    saveSettings, saving,
  } = useSettingsStore();

  const { setTheme, theme, addNotification } = useAppStore();

  const handleSave = async () => {
    await saveSettings();
  };

  /** 版本信息与更新检查 */
  const [versionInfo, setVersionInfo] = useState<VersionInfo | null>(null);
  const [updateInfo, setUpdateInfo] = useState<UpdateCheckResult | null>(null);
  const [checkingUpdate, setCheckingUpdate] = useState(false);

  useEffect(() => {
    fetch('/api/version')
      .then(r => r.json())
      .then((data: VersionInfo) => setVersionInfo(data))
      .catch(() => { /* 忽略 */ });
  }, []);

  const checkForUpdates = async () => {
    setCheckingUpdate(true);
    try {
      const res = await fetch('/api/version/check');
      const result: UpdateCheckResult = await res.json();
      setUpdateInfo(result);
    } catch (err) {
      setUpdateInfo({ currentVersion: '', latestVersion: '', hasUpdate: false, releaseUrl: '', publishedAt: '', body: '', error: '检查失败' });
    } finally {
      setCheckingUpdate(false);
    }
  };

  return (
    <div className="space-y-6 max-w-3xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">设置</h1>
          <p className="text-gray-500 mt-1 text-sm">配置 Agent 行为和系统参数</p>
        </div>
        <button
          onClick={handleSave}
          className="btn btn-primary gap-2"
          disabled={saving}
        >
          {saving ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Save className="w-4 h-4" />
          )}
          {saving ? '保存中...' : '保存设置'}
        </button>
      </div>

      {/* Agent 配置 */}
      <div className="card">
        <h3 className="font-semibold mb-5 flex items-center gap-2 text-base">
          <Sliders className="w-5 h-5 text-blue-400" />
          Agent 配置
        </h3>
        <div className="space-y-5">
          <div>
            <label className="flex items-center justify-between text-sm mb-2">
              <span className="text-gray-300">最大对话轮次</span>
              <span className="text-blue-400 font-mono font-medium">{agent.maxTurns}</span>
            </label>
            <input
              type="range"
              min={5}
              max={50}
              value={agent.maxTurns}
              onChange={(e) => setAgentSettings({ maxTurns: parseInt(e.target.value) })}
              className="w-full accent-blue-500 h-2 rounded-lg cursor-pointer"
            />
            <div className="flex justify-between text-xs text-gray-600 mt-1">
              <span>5 (快速)</span>
              <span>50 (完整)</span>
            </div>
          </div>

          <div>
            <label className="flex items-center justify-between text-sm mb-2">
              <span className="text-gray-300">温度参数</span>
              <span className="text-blue-400 font-mono font-medium">{agent.temperature}</span>
            </label>
            <input
              type="range"
              min={0}
              max={2}
              step={0.1}
              value={agent.temperature}
              onChange={(e) => setAgentSettings({ temperature: parseFloat(e.target.value) })}
              className="w-full accent-blue-500 h-2 rounded-lg cursor-pointer"
            />
            <div className="flex justify-between text-xs text-gray-600 mt-1">
              <span>0 (精确)</span>
              <span>1 (平衡)</span>
              <span>2 (创意)</span>
            </div>
          </div>

          <label className="flex items-start gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={agent.allowTools}
              onChange={(e) => setAgentSettings({ allowTools: e.target.checked })}
              className="mt-0.5 rounded accent-blue-500"
            />
            <div>
              <span className="text-sm text-gray-300">启用工具调用</span>
              <p className="text-xs text-gray-600 mt-0.5">
                允许 Agent 使用文件操作、搜索、命令执行等工具
              </p>
            </div>
          </label>
        </div>
      </div>

      {/* 安全设置 */}
      <div className="card">
        <h3 className="font-semibold mb-5 flex items-center gap-2 text-base">
          <Shield className="w-5 h-5 text-amber-400" />
          安全配置
        </h3>
        <div className="space-y-5">
          <label className="flex items-start gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={security.requireConfirmation}
              onChange={(e) => setSecuritySettings({ requireConfirmation: e.target.checked })}
              className="mt-0.5 rounded accent-blue-500"
            />
            <div>
              <span className="text-sm text-gray-300">执行命令前需要确认</span>
              <p className="text-xs text-gray-600 mt-0.5">
                在 shell 命令、文件删除等危险操作前要求用户确认
              </p>
            </div>
          </label>

          <div>
            <label className="block text-sm text-gray-300 mb-2">
              每日 Token 上限
            </label>
            <input
              type="number"
              value={security.dailyTokenLimit}
              onChange={(e) =>
                setSecuritySettings({
                  dailyTokenLimit: parseInt(e.target.value) || 0,
                })
              }
              className="input max-w-[200px]"
              min={0}
              step={100000}
            />
            <p className="text-xs text-gray-600 mt-1.5">
              达到上限后暂停 API 调用，防止意外费用
            </p>
          </div>
        </div>
      </div>

      {/* 偏好设置 */}
      <div className="card">
        <h3 className="font-semibold mb-5 flex items-center gap-2 text-base">
          <Monitor className="w-5 h-5 text-purple-400" />
          偏好设置
        </h3>
        <div className="space-y-5">
          {/* 主题 */}
          <div>
            <label className="block text-sm text-gray-300 mb-2">界面主题</label>
            <div className="flex gap-2">
              {[
                { value: 'dark' as const, label: '深色', desc: '护眼暗色' },
                { value: 'light' as const, label: '亮色', desc: '清爽亮色' },
              ].map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => setTheme(opt.value)}
                  className={`flex-1 p-3 rounded-xl border transition-all text-left ${
                    theme === opt.value
                      ? 'border-blue-500 bg-blue-500/10'
                      : 'border-gray-800 bg-gray-800/50 hover:border-gray-700'
                  }`}
                >
                  <div className="font-medium text-sm">{opt.label}</div>
                  <div className="text-xs text-gray-500 mt-0.5">{opt.desc}</div>
                </button>
              ))}
            </div>
          </div>

          {/* 发送快捷键 */}
          <div>
            <label className="block text-sm text-gray-300 mb-2">发送快捷键</label>
            <div className="flex gap-2">
              {[
                { value: 'enter' as const, label: 'Enter 发送', desc: 'Shift+Enter 换行' },
                { value: 'ctrl_enter' as const, label: 'Ctrl+Enter 发送', desc: 'Enter 换行' },
              ].map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => setPreferences({ sendBehavior: opt.value })}
                  className={`flex-1 p-3 rounded-xl border transition-all text-left ${
                    preferences.sendBehavior === opt.value
                      ? 'border-blue-500 bg-blue-500/10'
                      : 'border-gray-800 bg-gray-800/50 hover:border-gray-700'
                  }`}
                >
                  <div className="font-medium text-sm">{opt.label}</div>
                  <div className="text-xs text-gray-500 mt-0.5">{opt.desc}</div>
                </button>
              ))}
            </div>
          </div>

          {/* 其他偏好 */}
          <label className="flex items-start gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={preferences.autoScroll}
              onChange={(e) => setPreferences({ autoScroll: e.target.checked })}
              className="mt-0.5 rounded accent-blue-500"
            />
            <div>
              <span className="text-sm text-gray-300">自动滚动到最新消息</span>
            </div>
          </label>
        </div>
      </div>

      {/* 保存按钮 */}
      <div className="flex justify-end">
        <button
          onClick={handleSave}
          className="btn btn-primary gap-2 btn-lg"
          disabled={saving}
        >
          {saving ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" /> 保存中...
            </>
          ) : (
            <>
              <Save className="w-4 h-4" /> 保存全部设置
            </>
          )}
        </button>
      </div>

      {/* 关于 EasyAgent */}
      <div className="card border-blue-500/10 bg-blue-500/[0.02]">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-semibold text-sm">关于 EasyAgent</h3>
          <button
            onClick={checkForUpdates}
            disabled={checkingUpdate}
            className="btn btn-sm btn-ghost flex items-center gap-1.5 text-xs"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${checkingUpdate ? 'animate-spin' : ''}`} />
            {checkingUpdate ? '检查中...' : '检查更新'}
          </button>
        </div>

        {/* 版本信息 */}
        <div className="text-xs text-gray-500 space-y-1 mb-3">
          <p>当前版本: <span className="text-blue-400 font-medium">{versionInfo ? `v${versionInfo.version}` : 'v0.3.0'}</span>
            {versionInfo?.codename && <span className="text-gray-600 ml-1">({versionInfo.codename})</span>}
          </p>
          {versionInfo?.releaseDate && (
            <p>发布日期: {versionInfo.releaseDate}</p>
          )}
          <p>技术栈: TypeScript + React + Zustand + Tailwind CSS + Express + WebSocket</p>
          <p>支持模型: DeepSeek · 智谱GLM · 通义千问 · Kimi · 文心一言 · 豆包 · 混元 · MiniMax · OpenAI · Ollama</p>
        </div>

        {/* 更新通知 */}
        {updateInfo?.hasUpdate && (
          <div className="mb-3 p-3 rounded-lg bg-green-500/10 border border-green-500/20">
            <p className="text-sm font-medium text-green-400">🎉 发现新版本 v{updateInfo.latestVersion}</p>
            <p className="text-xs text-gray-400 mt-1">
              发布时间: {updateInfo.publishedAt ? new Date(updateInfo.publishedAt).toLocaleDateString('zh-CN') : '未知'}
            </p>
            <a
              href={updateInfo.releaseUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 mt-2 text-xs text-blue-400 hover:text-blue-300"
            >
              <ExternalLink className="w-3 h-3" /> 查看发布页面
            </a>
          </div>
        )}

        {updateInfo && !updateInfo.hasUpdate && !updateInfo.error && (
          <p className="text-xs text-green-500 mb-3">✅ 当前已是最新版本</p>
        )}

        {updateInfo?.error && (
          <p className="text-xs text-yellow-500 mb-3">⚠️ 无法检查更新: {updateInfo.error}</p>
        )}

        {/* 更新日志 */}
        {versionInfo?.changelog && (
          <div className="mt-2">
            <h4 className="text-xs font-semibold text-gray-400 mb-2 uppercase tracking-wider">更新日志</h4>
            <pre className="text-xs text-gray-500 whitespace-pre-wrap font-mono leading-relaxed max-h-80 overflow-y-auto bg-black/20 rounded-lg p-3">
              {versionInfo.changelog}
            </pre>
          </div>
        )}
      </div>
    </div>
  );
}
