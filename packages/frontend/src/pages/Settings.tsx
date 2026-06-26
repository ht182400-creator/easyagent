/**
 * 升级版设置页面 - 使用 settingsStore 持久化
 * 支持: Agent配置、安全设置、主题选择、快捷键偏好
 */
import { Sliders, Shield, Monitor, Keyboard, Save, Loader2, RefreshCw, ExternalLink, Download, CheckCircle, AlertCircle, RotateCw, ArrowUpCircle, ArrowDownToLine } from 'lucide-react';
import { useSettingsStore } from '../stores/settingsStore';
import { useAppStore } from '../stores/appStore';
import { getApiBase } from '../request';
import { useState, useEffect, useCallback } from 'react';

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

/**
 * electron-updater 完整更新状态
 *
 * idle        → 无更新活动
 * checking    → 正在检查更新
 * available   → 发现新版本，准备下载
 * downloading → 下载中（percent 可用）
 * downloaded  → 下载完成，等待用户安装
 * error       → 检查或下载失败（message 含错误信息）
 * installing  → 正在执行安装（应用即将重启）
 */
interface UpdateStatus {
  status: 'idle' | 'checking' | 'available' | 'downloading' | 'downloaded' | 'error' | 'installing';
  version?: string;
  releaseDate?: string;
  percent?: number;
  message?: string;
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
  /** electron-updater 下载状态 */
  const [updaterStatus, setUpdaterStatus] = useState<UpdateStatus | null>(null);

  useEffect(() => {
    const apiBase = getApiBase();
    fetch(`${apiBase}/api/version`)
      .then(r => r.json())
      .then((data: VersionInfo) => setVersionInfo(data))
      .catch(() => { /* 忽略 */ });
  }, []);

  /** 初始化和监听 electron-updater — 挂载时查询状态 + 注册事件 */
  useEffect(() => {
    const ea = (window as any).easyAgent;
    if (!ea) {
      console.log('[Settings] easyAgent 不可用 (非桌面环境)');
      return;
    }

    // 1. 查询当前状态（处理页面挂载时更新已发生的情况）
    if (ea.getUpdateStatus) {
      ea.getUpdateStatus().then((s: any) => {
        console.log('[Settings] 初始更新状态:', JSON.stringify(s));
        const st = s?.lastUpdateStatus;
        const info = s?.lastUpdateInfo || {};

        switch (st) {
          case 'downloaded':
            setUpdaterStatus({ status: 'downloaded', version: info.version });
            break;
          case 'downloading':
            setUpdaterStatus({ status: 'downloading', percent: info.percent ?? 0, version: info.version });
            break;
          case 'available':
            setUpdaterStatus({ status: 'available', version: info.version });
            break;
          case 'checking':
            setUpdaterStatus({ status: 'checking' });
            break;
          case 'error':
            setUpdaterStatus({ status: 'error', message: info.error || '更新出错' });
            break;
          case 'installing':
            setUpdaterStatus({ status: 'installing', version: info.version });
            break;
          // idle 无需设置卡片
        }
      }).catch((err: any) => console.log('[Settings] 查询更新状态失败:', err));
    }

    // 2. 注册后续事件监听
    if (ea?.onUpdateStatus) {
      const cleanup = ea.onUpdateStatus((status: UpdateStatus) => {
        console.log('[Settings] 收到更新事件:', status.status, 'percent:', status.percent ?? 'N/A');
        setUpdaterStatus(prev => {
          // [v0.5.23] 防止 available 事件覆盖已推进的 downloading/downloaded 状态
          // 原因: checkForUpdates() 返回 downloading 后，update-available 事件可能异步到达
          // 如果不用 prev 判断，available 会覆盖 downloading，导致 UI 卡住
          if (status.status === 'available' && prev) {
            if (prev.status === 'downloading' || prev.status === 'downloaded') {
              console.log('[Settings] 忽略 available 事件，保持当前状态:', prev.status);
              return prev;
            }
          }
          return status;
        });
      });
      return cleanup;
    }
  }, []);

  /**
   * 手动检查更新 — 完整状态机处理
   *
   * 流程：
   *   1. 先查询后台状态 → 如果已在下载/已完成 → 直接显示
   *   2. 查询 Server API → 展示版本信息和更新日志
   *   3. 如有新版本 → 触发 IPC check-update（主进程状态机处理）
   *   4. 根据返回状态更新 UI
   */
  const checkForUpdates = async () => {
    setCheckingUpdate(true);
    console.log('[Settings] 用户点击检查更新...');
    try {
      const ea = (window as any).easyAgent;

      // ────── Step 0: 先查询后台更新状态 ──────
      if (ea?.getUpdateStatus) {
        const bgStatus = await ea.getUpdateStatus();
        console.log('[Settings] 后台更新状态:', JSON.stringify(bgStatus));

        switch (bgStatus?.lastUpdateStatus) {
          case 'downloaded':
            console.log('[Settings] 后台已下载完成');
            setUpdaterStatus({ status: 'downloaded', version: bgStatus.lastUpdateInfo?.version });
            break;
          case 'downloading':
            console.log('[Settings] 后台正在下载中');
            setUpdaterStatus({
              status: 'downloading',
              percent: bgStatus.lastUpdateInfo?.percent ?? 0,
            });
            break;
          case 'checking':
            console.log('[Settings] 后台正在检查中');
            setUpdaterStatus({ status: 'checking' });
            break;
          case 'installing':
            console.log('[Settings] 正在安装中');
            setUpdaterStatus({ status: 'installing' });
            break;
        }
      }

      // ────── Step 1: 查询版本信息（Server API）──────
      const apiBase = getApiBase();
      const res = await fetch(`${apiBase}/api/version/check`);
      const result: UpdateCheckResult = await res.json();
      console.log('[Settings] Server API 返回:', JSON.stringify(result));
      setUpdateInfo(result);

      // ────── Step 2: 触发 IPC 更新检查 ──────
      if (result.hasUpdate) {
        if (ea?.checkUpdate) {
          console.log('[Settings] 调用 ea.checkUpdate()...');
          const upResult = await ea.checkUpdate();
          console.log('[Settings] ea.checkUpdate() 返回:', JSON.stringify(upResult),
            ' success=', !!upResult?.success,
            ' status=', upResult?.status);

          // 根据主进程返回的状态更新 UI
          const st = upResult?.status;
          console.log('[Settings] 处理 IPC 返回状态:', st, ' success=', !!upResult?.success);
          if (!upResult?.success) {
            console.log('[Settings] → UI: error');
            setUpdaterStatus({ status: 'error', message: upResult?.error || '检查更新失败' });
          } else if (st === 'downloaded') {
            console.log('[Settings] → UI: downloaded');
            setUpdaterStatus({ status: 'downloaded', version: upResult.lastUpdateInfo?.version || upResult.version });
          } else if (st === 'downloading') {
            console.log('[Settings] → UI: downloading (percent=', upResult.lastUpdateInfo?.percent ?? 0, ')');
            setUpdaterStatus({
              status: 'downloading',
              version: upResult.version,
              percent: upResult.lastUpdateInfo?.percent ?? 0,
            });
          } else if (st === 'checking') {
            console.log('[Settings] → UI: checking');
            setUpdaterStatus({ status: 'checking', message: upResult.message });
          } else if (st === 'available') {
            console.log('[Settings] → UI: available (竞态防御检查中...)');
            setUpdaterStatus(prev => {
              console.log('[Settings]   available prev.status=', prev?.status);
              if (prev && (prev.status === 'downloading' || prev.status === 'downloaded')) {
                console.log('[Settings]   ⚠️ 忽略 available，保持:', prev.status);
                return prev;
              }
              console.log('[Settings]   → 设置 available');
              return { status: 'available', version: upResult.version };
            });
          } else if (st === 'idle') {
            console.log('[Settings] → UI: idle (无更新)');
            setUpdaterStatus(null);
          } else {
            console.log('[Settings] → UI: 未知状态:', st);
          }
        } else {
          console.log('[Settings] ⚠️ ea.checkUpdate 不可用');
        }
      } else {
        console.log('[Settings] Server API 返回 hasUpdate=false, 跳过 IPC 检查');
      }
    } catch (err) {
      console.error('[Settings] 检查更新异常:', err);
      setUpdateInfo({
        currentVersion: '', latestVersion: '', hasUpdate: false,
        releaseUrl: '', publishedAt: '', body: '',
        error: '检查失败',
      });
      setUpdaterStatus({ status: 'error', message: '网络异常，请稍后重试' });
    } finally {
      setCheckingUpdate(false);
    }
  };

  /**
   * 用户点击"立即重启安装"按钮
   * 仅在 downloaded 状态下调用
   */
  const handleInstallUpdate = async () => {
    const ea = (window as any).easyAgent;
    if (!ea?.installUpdate) {
      console.log('[Settings] installUpdate 不可用');
      return;
    }
    console.log('[Settings] 用户确认安装更新...');
    setUpdaterStatus(prev => prev ? { ...prev, status: 'installing' } : null);
    const result = await ea.installUpdate();
    if (!result?.success) {
      console.error('[Settings] 安装失败:', result?.error);
      setUpdaterStatus(prev => prev ? { ...prev, status: 'downloaded', message: result?.error } : null);
    }
  };

  // [v0.5.21] 模拟更新测试功能已移除 — 生产环境不需要

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
          <div className="flex items-center gap-2">
            <button
              onClick={checkForUpdates}
              disabled={checkingUpdate}
              className="btn btn-sm btn-ghost flex items-center gap-1.5 text-xs"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${checkingUpdate ? 'animate-spin' : ''}`} />
              {checkingUpdate ? '检查中...' : '检查更新'}
            </button>
{/* [v0.5.21] 模拟更新按钮已移除 */}
          </div>
        </div>

        {/* 版本信息 */}
        <div className="text-xs text-gray-500 space-y-1 mb-3">
          <p>当前版本: <span className="text-blue-400 font-medium">{versionInfo ? `v${versionInfo.version}` : 'v0.3.0'}</span>
            {versionInfo?.codename && <span className="text-gray-600 ml-1">({versionInfo.codename})</span>}
          </p>
          {versionInfo?.releaseDate && (
            <p>发布日期: {versionInfo.releaseDate}</p>
          )}
          <p className="text-green-400/80">🔧 v0.5.29 — 修复 CSP 字体加载 + 自动更新 electron-updater 加载失败</p>
          <p>技术栈: TypeScript + React + Zustand + Tailwind CSS + Express + WebSocket</p>
          <p>支持模型: DeepSeek · 智谱GLM · 通义千问 · Kimi · 文心一言 · 豆包 · 混元 · MiniMax · OpenAI · Ollama</p>
        </div>

        {/* ═══════════════════════════════════════════
             更新状态卡片 — 覆盖全场景
             ═══════════════════════════════════════════ */}
        {updaterStatus && (
          <div className={`mt-3 p-3 rounded-lg border ${getStatusCardStyle(updaterStatus.status)}`}>
            {/* 标题行 */}
            <div className="flex items-center gap-2 mb-2">
              {getStatusIcon(updaterStatus.status)}
              <p className="text-sm font-medium">
                {getStatusTitle(updaterStatus.status, updaterStatus.version)}
              </p>
            </div>

            {/* 进度条 (downloading) */}
            {updaterStatus.status === 'downloading' && (
              <div className="mb-2">
                <div className="flex items-center justify-between text-xs text-blue-400 mb-1">
                  <span>下载中</span>
                  <span>{updaterStatus.percent?.toFixed(1) ?? '0'}%</span>
                </div>
                <div className="w-full bg-gray-700 rounded-full h-2 overflow-hidden">
                  <div
                    className="h-full bg-blue-500 rounded-full transition-all duration-300"
                    style={{ width: `${updaterStatus.percent ?? 0}%` }}
                  />
                </div>
              </div>
            )}

            {/* 描述文本 */}
            <p className="text-xs text-gray-400 mb-2">
              {getStatusDescription(updaterStatus.status)}
            </p>

            {/* 操作按钮 */}
            {getStatusAction(updaterStatus.status) && (
              <div className="flex items-center gap-2">
                {updaterStatus.status === 'downloaded' && (
                  <button
                    onClick={handleInstallUpdate}
                    className="btn btn-sm btn-primary flex items-center gap-1.5 text-xs"
                  >
                    <ArrowUpCircle className="w-3.5 h-3.5" />
                    立即重启安装
                  </button>
                )}
                {updaterStatus.status === 'error' && (
                  <button
                    onClick={checkForUpdates}
                    disabled={checkingUpdate}
                    className="btn btn-sm btn-ghost flex items-center gap-1.5 text-xs text-amber-400"
                  >
                    <RotateCw className={`w-3.5 h-3.5 ${checkingUpdate ? 'animate-spin' : ''}`} />
                    重试
                  </button>
                )}
                {updaterStatus.status === 'downloaded' && (
                  <span className="text-xs text-gray-500">重启后将自动安装更新</span>
                )}
              </div>
            )}
          </div>
        )}

        {/* 更新通知卡片（Server API 发现新版本，但 updater 尚未联动时） */}
        {updateInfo?.hasUpdate && !updaterStatus && (
          <div className="mt-3 p-3 rounded-lg bg-green-500/10 border border-green-500/20">
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

        {/* 已是最新版本 */}
        {updateInfo && !updateInfo.hasUpdate && !updateInfo.error && !updaterStatus && (
          <p className="text-xs text-green-500 mb-3">✅ 当前已是最新版本</p>
        )}

        {/* 检查失败 */}
        {updateInfo?.error && !updaterStatus && (
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

/** ═══════════════════════════════════════════
 *  状态卡片辅助函数（组件外部，避免重渲染）
 *  ═══════════════════════════════════════════ */

/** 获取状态卡片整体样式 */
export function getStatusCardStyle(status: string): string {
  switch (status) {
    case 'downloading':
      return 'bg-blue-500/10 border-blue-500/20';
    case 'downloaded':
      return 'bg-green-500/10 border-green-500/20';
    case 'available':
    case 'checking':
      return 'bg-blue-500/10 border-blue-500/20';
    case 'error':
      return 'bg-yellow-500/10 border-yellow-500/20';
    case 'installing':
      return 'bg-purple-500/10 border-purple-500/20';
    default:
      return 'bg-gray-500/10 border-gray-500/20';
  }
}

/** 获取状态图标 */
export function getStatusIcon(status: string) {
  const cn = 'w-4 h-4';
  switch (status) {
    case 'downloading':
      return <ArrowDownToLine className={`${cn} text-blue-400 animate-pulse`} />;
    case 'downloaded':
      return <CheckCircle className={`${cn} text-green-400`} />;
    case 'available':
    case 'checking':
      return <RefreshCw className={`${cn} text-blue-400 animate-spin`} />;
    case 'error':
      return <AlertCircle className={`${cn} text-yellow-400`} />;
    case 'installing':
      return <ArrowUpCircle className={`${cn} text-purple-400`} />;
    default:
      return <Download className={`${cn} text-gray-400`} />;
  }
}

/** 获取状态标题文本 */
export function getStatusTitle(status: string, version?: string): string {
  const ver = version ? ` v${version}` : '';
  switch (status) {
    case 'checking':
      return `正在检查更新...`;
    case 'available':
      return `发现新版本${ver}`;
    case 'downloading':
      return `正在下载${ver}`;
    case 'downloaded':
      return `新版本${ver} 已下载`;
    case 'error':
      return '更新失败';
    case 'installing':
      return '正在安装更新...';
    default:
      return `更新状态`;
  }
}

/** 获取状态描述文本 */
export function getStatusDescription(status: string): string {
  switch (status) {
    case 'checking':
      return '正在连接更新服务器，请稍候...';
    case 'available':
      return '已发现新版本，下载即将开始...';
    case 'downloading':
      return '正在后台下载更新，你可以继续使用应用。';
    case 'downloaded':
      return '更新已下载完成，点击下方按钮重启应用以完成安装。';
    case 'error':
      return '请检查网络连接后重试，或前往 GitHub 手动下载。';
    case 'installing':
      return '应用正在关闭并安装更新，即将自动重启...';
    default:
      return '';
  }
}

/** 获取操作按钮文本（非 downloading/downloaded/error 不需要按钮） */
export function getStatusAction(status: string): boolean {
  return status === 'downloaded' || status === 'error';
}
