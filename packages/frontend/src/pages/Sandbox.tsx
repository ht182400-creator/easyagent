/**
 * 沙箱管理页面
 * Docker 沙箱的创建、执行、监控和销毁管理界面
 */
import { useState, useEffect, useCallback } from 'react';
import { useSandboxStore, type CreateSandboxOptions } from '../stores/sandboxStore';
import { Box, Play, Trash2, RefreshCw, Cpu, HardDrive, Globe, Shield, XCircle, Terminal, ChevronRight, Plus, Clock } from 'lucide-react';

/** 预设镜像 */
const IMAGE_PRESETS = [
  { value: 'node:20-alpine', label: 'Node.js 20', icon: '🟢' },
  { value: 'node:18-alpine', label: 'Node.js 18', icon: '🟡' },
  { value: 'python:3.12-alpine', label: 'Python 3.12', icon: '🐍' },
  { value: 'python:3.11-alpine', label: 'Python 3.11', icon: '🐍' },
  { value: 'ubuntu:22.04', label: 'Ubuntu 22.04', icon: '🐧' },
];

export default function SandboxPage() {
  const {
    dockerStatus, sandboxes, selectedSandbox, execResult,
    loading, creating, executing, commandHistory,
    loadStatus, createSandbox, execCommand, destroySandbox, selectSandbox, clearExecResult,
  } = useSandboxStore();

  // 创建表单状态
  const [showCreate, setShowCreate] = useState(false);
  const [createImage, setCreateImage] = useState('node:20-alpine');
  const [createReadOnly, setCreateReadOnly] = useState(false);
  const [createAllowNetwork, setCreateAllowNetwork] = useState(false);
  const [createMemory, setCreateMemory] = useState('512m');
  const [createCpu, setCreateCpu] = useState(0.5);

  // 执行命令状态
  const [command, setCommand] = useState('');
  const [execTimeout, setExecTimeout] = useState(30000);
  const [showAdvanced, setShowAdvanced] = useState(false);

  // 初始化
  useEffect(() => {
    loadStatus();
    const timer = setInterval(() => loadStatus(), 15000);
    return () => clearInterval(timer);
  }, [loadStatus]);

  /** 创建沙箱 */
  const handleCreate = useCallback(async () => {
    const result = await createSandbox({
      image: createImage,
      readOnly: createReadOnly,
      allowNetwork: createAllowNetwork,
      memoryLimit: createMemory,
      cpuLimit: createCpu,
    });
    if (result) {
      setShowCreate(false);
      await loadStatus();
    }
  }, [createImage, createReadOnly, createAllowNetwork, createMemory, createCpu, createSandbox, loadStatus]);

  /** 执行命令 */
  const handleExec = useCallback(async () => {
    if (!selectedSandbox || !command.trim()) return;
    clearExecResult();
    await execCommand(selectedSandbox.id, command, execTimeout);
  }, [selectedSandbox, command, execTimeout, execCommand, clearExecResult]);

  /** 状态标签 */
  const StatusBadge = ({ status }: { status: string }) => {
    const colors: Record<string, string> = {
      running: 'bg-green-500/10 text-green-400 border-green-500/20',
      stopped: 'bg-gray-500/10 text-gray-400 border-gray-500/20',
      starting: 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20',
      error: 'bg-red-500/10 text-red-400 border-red-500/20',
      idle: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
    };
    const labels: Record<string, string> = {
      running: '运行中', stopped: '已停止', starting: '启动中', error: '错误', idle: '空闲',
    };
    return (
      <span className={`px-2 py-0.5 rounded-full text-xs border ${colors[status] || colors.idle}`}>
        {labels[status] || status}
      </span>
    );
  };

  /**
   * 渲染主沙箱 UI 内容
   * 定义在条件 return 之前，避免 TDZ（暂时性死区）引用错误
   */
  const renderMainContent = () => (
    <div className="h-full flex flex-col">
      {/* 头部 */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white">Docker 沙箱</h1>
          <p className="text-gray-400 text-sm mt-1">
            安全的容器化代码执行环境
            {dockerStatus?.docker.version && (
              <span className="ml-2 text-gray-500">· Docker v{dockerStatus.docker.version}</span>
            )}
            {dockerStatus?.mode === 'local' && (
              <span className="ml-2 text-yellow-500">· 本地进程模式</span>
            )}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-sm text-gray-400">
            {sandboxes.length} / {dockerStatus?.sandbox.maxSandboxes || 10} 活跃
          </span>
          <button onClick={loadStatus} className="p-2 text-gray-400 hover:text-white hover:bg-gray-800 rounded-lg transition-colors" title="刷新">
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
          <button
            onClick={() => setShowCreate(true)}
            disabled={creating || sandboxes.length >= (dockerStatus?.sandbox.maxSandboxes || 10)}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg text-sm font-medium transition-colors"
          >
            <Plus className="w-4 h-4" />
            新建沙箱
          </button>
        </div>
      </div>

      {/* 创建弹窗 */}
      {showCreate && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50" onClick={() => setShowCreate(false)}>
          <div className="bg-gray-900 border border-gray-700 rounded-2xl p-6 w-full max-w-md mx-4 shadow-2xl" onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-semibold text-white mb-4">新建 Docker 沙箱</h3>
            
            {/* 镜像选择 */}
            <label className="block text-sm text-gray-400 mb-1">镜像</label>
            <div className="grid grid-cols-2 gap-2 mb-4">
              {IMAGE_PRESETS.map(img => (
                <button
                  key={img.value}
                  onClick={() => setCreateImage(img.value)}
                  className={`p-2 rounded-lg text-sm border text-left transition-colors ${
                    createImage === img.value
                      ? 'border-blue-500 bg-blue-500/10 text-blue-300'
                      : 'border-gray-700 text-gray-400 hover:border-gray-600'
                  }`}
                >
                  <span className="mr-2">{img.icon}</span>{img.label}
                </button>
              ))}
            </div>

            {/* 资源限制 */}
            <div className="grid grid-cols-2 gap-3 mb-4">
              <div>
                <label className="block text-xs text-gray-500 mb-1">内存限制</label>
                <select value={createMemory} onChange={e => setCreateMemory(e.target.value)}
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white">
                  {['128m', '256m', '512m', '1g', '2g'].map(v => (
                    <option key={v} value={v}>{v}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">CPU 限制</label>
                <select value={createCpu} onChange={e => setCreateCpu(Number(e.target.value))}
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white">
                  {[0.25, 0.5, 1, 2, 4].map(v => (
                    <option key={v} value={v}>{v} 核</option>
                  ))}
                </select>
              </div>
            </div>

            {/* 安全选项 */}
            <div className="space-y-2 mb-4">
              <label className="flex items-center gap-2 text-sm text-gray-400 cursor-pointer">
                <input type="checkbox" checked={createReadOnly} onChange={e => setCreateReadOnly(e.target.checked)}
                  className="rounded bg-gray-800 border-gray-600 text-blue-600 focus:ring-blue-500" />
                <Shield className="w-4 h-4" />
                只读模式 (禁止修改文件)
              </label>
              <label className="flex items-center gap-2 text-sm text-gray-400 cursor-pointer">
                <input type="checkbox" checked={createAllowNetwork} onChange={e => setCreateAllowNetwork(e.target.checked)}
                  className="rounded bg-gray-800 border-gray-600 text-blue-600 focus:ring-blue-500" />
                <Globe className="w-4 h-4" />
                允许网络访问
              </label>
            </div>

            {/* 按钮 */}
            <div className="flex gap-3">
              <button onClick={() => setShowCreate(false)} className="flex-1 px-4 py-2 bg-gray-800 hover:bg-gray-700 rounded-lg text-sm transition-colors">
                取消
              </button>
              <button onClick={handleCreate} disabled={creating}
                className="flex-1 px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 rounded-lg text-sm font-medium transition-colors">
                {creating ? '创建中...' : '创建沙箱'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 主内容区 */}
      <div className="flex-1 grid grid-cols-1 lg:grid-cols-3 gap-6 min-h-0">
        {/* 沙箱列表 */}
        <div className="lg:col-span-1 overflow-auto space-y-3">
          {sandboxes.length === 0 ? (
            <div className="text-center py-16 bg-gray-900/30 rounded-xl border border-gray-800/50">
              <Box className="w-12 h-12 text-gray-600 mx-auto mb-3" />
              <p className="text-gray-500 text-sm">暂无活跃沙箱</p>
              <p className="text-gray-600 text-xs mt-1">点击"新建沙箱"创建一个隔离执行环境</p>
            </div>
          ) : (
            sandboxes.map(sandbox => (
              <div
                key={sandbox.id}
                onClick={() => selectSandbox(sandbox)}
                className={`p-4 rounded-xl border cursor-pointer transition-all ${
                  selectedSandbox?.id === sandbox.id
                    ? 'border-blue-500 bg-blue-500/5'
                    : 'border-gray-800 bg-gray-900/50 hover:border-gray-700'
                }`}
              >
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-mono text-gray-300">{sandbox.id.slice(0, 16)}...</span>
                  <StatusBadge status={sandbox.status} />
                </div>
                <div className="flex items-center gap-4 text-xs text-gray-500">
                  <span className="flex items-center gap-1"><HardDrive className="w-3 h-3" />{sandbox.image}</span>
                  <span>{sandbox.limits?.memory || '-'}</span>
                  <span>{sandbox.limits?.cpuCores ? `${sandbox.limits.cpuCores}CPU` : '-'}</span>
                </div>
              </div>
            ))
          )}
        </div>

        {/* 详情与执行区 */}
        <div className="lg:col-span-2 overflow-auto">
          {!selectedSandbox ? (
            <div className="flex items-center justify-center h-full text-gray-500">
              <div className="text-center">
                <Terminal className="w-16 h-16 text-gray-700 mx-auto mb-4" />
                <p>选择一个沙箱以查看详情并执行命令</p>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              {/* 沙箱详情 */}
              <div className="p-4 rounded-xl bg-gray-900/50 border border-gray-800">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-semibold text-gray-300 font-mono">{selectedSandbox.id}</h3>
                  <div className="flex items-center gap-2">
                    <StatusBadge status={selectedSandbox.status} />
                    <button
                      onClick={() => destroySandbox(selectedSandbox.id)}
                      className="p-1.5 text-red-400 hover:text-red-300 hover:bg-red-500/10 rounded-lg transition-colors"
                      title="销毁沙箱"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
                <div className="grid grid-cols-4 gap-3 text-xs">
                  <div className="p-2 rounded-lg bg-gray-800/50">
                    <span className="text-gray-500">镜像</span>
                    <p className="text-gray-300 mt-1">{selectedSandbox.image}</p>
                  </div>
                  <div className="p-2 rounded-lg bg-gray-800/50">
                    <span className="text-gray-500">容器ID</span>
                    <p className="text-gray-300 mt-1 font-mono">{selectedSandbox.containerId?.slice(0, 12) || 'N/A'}</p>
                  </div>
                  <div className="p-2 rounded-lg bg-gray-800/50">
                    <span className="text-gray-500"><Cpu className="w-3 h-3 inline mr-1" />CPU</span>
                    <p className="text-gray-300 mt-1">{selectedSandbox.limits?.cpuCores || '-'} 核</p>
                  </div>
                  <div className="p-2 rounded-lg bg-gray-800/50">
                    <span className="text-gray-500"><HardDrive className="w-3 h-3 inline mr-1" />内存</span>
                    <p className="text-gray-300 mt-1">{selectedSandbox.limits?.memory || '-'}</p>
                  </div>
                </div>
              </div>

              {/* 命令执行区 */}
              <div className="p-4 rounded-xl bg-gray-900/50 border border-gray-800">
                <h3 className="text-sm font-semibold text-gray-300 mb-3 flex items-center gap-2">
                  <Terminal className="w-4 h-4 text-green-400" />
                  执行命令
                </h3>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={command}
                    onChange={e => setCommand(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && handleExec()}
                    placeholder="输入命令，例如: node -e 'console.log(1+1)'"
                    className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-blue-500 font-mono"
                  />
                  <button
                    onClick={handleExec}
                    disabled={executing || !command.trim() || selectedSandbox.status !== 'running'}
                    className="flex items-center gap-1.5 px-4 py-2 bg-green-600 hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg text-sm font-medium transition-colors"
                  >
                    <Play className="w-4 h-4" />
                    {executing ? '执行中...' : '运行'}
                  </button>
                </div>

                {/* 高级选项 */}
                <button onClick={() => setShowAdvanced(!showAdvanced)}
                  className="mt-2 text-xs text-gray-500 hover:text-gray-400 flex items-center gap-1 transition-colors">
                  <ChevronRight className={`w-3 h-3 transition-transform ${showAdvanced ? 'rotate-90' : ''}`} />
                  高级选项
                </button>
                {showAdvanced && (
                  <div className="mt-2 flex items-center gap-4">
                    <label className="flex items-center gap-2 text-xs text-gray-400">
                      <Clock className="w-3 h-3" />
                      超时(秒):
                      <select value={execTimeout / 1000} onChange={e => setExecTimeout(Number(e.target.value) * 1000)}
                        className="bg-gray-800 border border-gray-700 rounded px-2 py-1 text-xs text-white">
                        {[5, 10, 30, 60, 120, 300].map(v => (
                          <option key={v} value={v}>{v}s</option>
                        ))}
                      </select>
                    </label>
                  </div>
                )}
              </div>

              {/* 执行结果 */}
              {execResult && (
                <div className={`p-4 rounded-xl border ${
                  execResult.success ? 'border-green-800 bg-green-500/5' : 'border-red-800 bg-red-500/5'
                }`}>
                  <div className="flex items-center justify-between mb-2">
                    <span className={`text-sm font-medium ${execResult.success ? 'text-green-400' : 'text-red-400'}`}>
                      {execResult.success ? '✓' : '✗'} 退出码: {execResult.exitCode} · 耗时: {execResult.duration}ms
                      {execResult.timedOut && <span className="text-yellow-400 ml-2">(超时)</span>}
                    </span>
                    <button onClick={clearExecResult} className="text-gray-500 hover:text-gray-400">
                      <XCircle className="w-4 h-4" />
                    </button>
                  </div>
                  {execResult.stdout && (
                    <div>
                      <span className="text-xs text-gray-500">stdout:</span>
                      <pre className="mt-1 p-3 rounded-lg bg-gray-950 text-green-300 text-sm font-mono overflow-auto max-h-64 whitespace-pre-wrap">
                        {execResult.stdout}
                      </pre>
                    </div>
                  )}
                  {execResult.stderr && (
                    <div className="mt-2">
                      <span className="text-xs text-gray-500">stderr:</span>
                      <pre className="mt-1 p-3 rounded-lg bg-gray-950 text-red-300 text-sm font-mono overflow-auto max-h-32 whitespace-pre-wrap">
                        {execResult.stderr}
                      </pre>
                    </div>
                  )}
                </div>
              )}

              {/* 命令历史 */}
              {commandHistory.length > 0 && !execResult && (
                <div>
                  <h4 className="text-xs text-gray-500 mb-2">命令历史</h4>
                  <div className="space-y-1">
                    {commandHistory.slice(0, 5).map((cmd, i) => (
                      <button
                        key={i}
                        onClick={() => setCommand(cmd)}
                        className="w-full text-left p-2 rounded-lg bg-gray-900/30 hover:bg-gray-800 text-sm text-gray-400 font-mono truncate transition-colors border border-gray-800/50"
                      >
                        <Play className="w-3 h-3 inline mr-2 text-gray-600" />
                        {cmd}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );

  // ==================== 条件渲染分支（renderMainContent 之后） ====================

  // 加载中
  if (loading && !dockerStatus) {
    return (
      <div className="flex items-center justify-center h-64">
        <RefreshCw className="w-8 h-8 text-blue-400 animate-spin" />
      </div>
    );
  }

  // Docker 不可用但本地模式已启用
  if (dockerStatus && !dockerStatus.docker.available && dockerStatus.mode === 'local') {
    return (
      <div className="h-full flex flex-col">
        {/* 本地模式提示 */}
        <div className="p-3 mb-4 rounded-xl bg-yellow-500/10 border border-yellow-500/20 flex-shrink-0">
          <div className="flex items-start gap-3">
            <Shield className="w-5 h-5 text-yellow-500 mt-0.5 shrink-0" />
            <div>
              <p className="text-yellow-400 font-medium text-sm">本地进程模式</p>
              <p className="text-gray-400 text-xs mt-0.5">
                Docker 不可用，已降级为本地进程执行。命令将在主机直接执行，无容器隔离。
              </p>
            </div>
          </div>
        </div>
        <div className="flex-1 min-h-0">
          {renderMainContent()}
        </div>
      </div>
    );
  }

  // Docker 不可用且本地模式已禁用
  if (dockerStatus && !dockerStatus.docker.available && dockerStatus.mode === 'disabled') {
    return (
      <div className="max-w-2xl mx-auto pt-16">
        <div className="text-center p-12 rounded-2xl bg-gray-900/50 border border-gray-800">
          <Box className="w-16 h-16 text-gray-600 mx-auto mb-4" />
          <h2 className="text-xl font-semibold text-gray-300 mb-2">沙箱不可用</h2>
          <p className="text-gray-500 mb-6">{dockerStatus.docker.error || 'Docker 未安装且沙箱已禁用'}</p>
          <div className="text-sm text-left text-gray-400 bg-gray-950/50 rounded-xl p-6 max-w-md mx-auto">
            <p className="font-medium text-gray-300 mb-2">启用方式:</p>
            <ol className="list-decimal list-inside space-y-1">
              <li>安装 Docker Desktop (推荐，完整隔离)</li>
              <li>或在设置中启用沙箱的本地进程模式</li>
            </ol>
          </div>
          <button onClick={loadStatus} className="mt-6 px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg text-sm transition-colors">
            <RefreshCw className={`w-4 h-4 inline mr-2 ${loading ? 'animate-spin' : ''}`} />
            重新检测
          </button>
        </div>
      </div>
    );
  }

  // Docker 可用或首次加载完成 → 显示完整功能界面
  return renderMainContent();
}
