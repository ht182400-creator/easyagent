/**
 * IM 适配器管理页面
 * 配置和管理 Telegram / 飞书 / 微信 接入
 */
import { useState, useEffect, useCallback } from 'react';
import { Send, Play, Square, Trash2, RefreshCw, AlertCircle, CheckCircle2 } from 'lucide-react';
import { getApiBase } from '../request';

/** IM 平台类型 */
type IMPlatform = 'telegram' | 'feishu' | 'wechat';

/** IM 配置联合类型 */
interface AnyIMConfig {
  platform: IMPlatform;
  enabled?: boolean;
  name: string;
  botToken?: string;
  mode?: 'polling' | 'webhook';
  appId?: string;
  appSecret?: string;
  corpId?: string;
  agentId?: string;
  encodingAESKey?: string;
  verificationToken?: string;
}

const platformMeta: Record<IMPlatform, {
  label: string;
  icon: string;
  color: string;
  docsUrl: string;
  description: string;
}> = {
  telegram: {
    label: 'Telegram',
    icon: '✈️',
    color: '#0088cc',
    docsUrl: 'https://core.telegram.org/bots/api',
    description: '通过 @BotFather 创建 Bot 获取 Token，支持长轮询和 Webhook 两种模式',
  },
  feishu: {
    label: '飞书',
    icon: '🐦',
    color: '#3370ff',
    docsUrl: 'https://open.feishu.cn/document/home/index',
    description: '在飞书开放平台创建自建应用，配置事件订阅 URL 接收消息',
  },
  wechat: {
    label: '企业微信',
    icon: '💬',
    color: '#07c160',
    docsUrl: 'https://developer.work.weixin.qq.com/document/path/90665',
    description: '在企业微信管理后台创建自建应用，配置消息接收 URL (需公网服务器)',
  },
};

export default function IMSettings() {
  const [configs, setConfigs] = useState<AnyIMConfig[]>([]);
  const [statuses, setStatuses] = useState<Record<string, { status: string; uptime: number }>>({});
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<IMPlatform | null>(null);

  // 编辑表单
  const [editForm, setEditForm] = useState<Partial<AnyIMConfig>>({});
  const [saving, setSaving] = useState(false);

  const fetchData = useCallback(async () => {
    try {
      const apiBase = getApiBase();
      const [cfgRes, statusRes] = await Promise.all([
        fetch(`${apiBase}/api/im/config`),
        fetch(`${apiBase}/api/im/status`),
      ]);
      const cfgs = await cfgRes.json();
      const sts = await statusRes.json();

      setConfigs(cfgs);
      const stMap: Record<string, { status: string; uptime: number }> = {};
      for (const s of sts) {
        stMap[s.platform] = { status: s.status, uptime: s.uptime };
      }
      setStatuses(stMap);
    } catch (err) {
      console.error('加载 IM 配置失败:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleSave = async (platform: IMPlatform) => {
    setSaving(true);
    try {
      const apiBase = getApiBase();
      const res = await fetch(`${apiBase}/api/im/config`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...editForm, platform, enabled: true }),
      });
      if (!res.ok) throw new Error('保存失败');
      setExpanded(null);
      await fetchData();
    } catch (err) {
      alert('保存失败: ' + (err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const handleToggle = async (platform: IMPlatform, action: 'start' | 'stop') => {
    try {
      const apiBase = getApiBase();
      const res = await fetch(`${apiBase}/api/im/${platform}/${action}`, { method: 'POST' });
      if (!res.ok) {
        const body = await res.json();
        throw new Error(body.error || '操作失败');
      }
      await fetchData();
    } catch (err) {
      alert((err as Error).message);
    }
  };

  const handleDelete = async (platform: IMPlatform) => {
    if (!confirm(`确定删除 ${platformMeta[platform].label} 配置？`)) return;
    try {
      const apiBase = getApiBase();
      await fetch(`${apiBase}/api/im/${platform}`, { method: 'DELETE' });
      await fetchData();
    } catch (err) {
      alert('删除失败: ' + (err as Error).message);
    }
  };

  const getStatusIcon = (platform: IMPlatform) => {
    const st = statuses[platform];
    if (!st || st.status === 'stopped') return <Square className="w-4 h-4 text-gray-400" />;
    if (st.status === 'running') return <CheckCircle2 className="w-4 h-4 text-green-500" />;
    if (st.status === 'error') return <AlertCircle className="w-4 h-4 text-red-500" />;
    return <RefreshCw className="w-4 h-4 text-yellow-500 animate-spin" />;
  };

  const getStatusText = (platform: IMPlatform) => {
    const st = statuses[platform];
    if (!st) return '未配置';
    if (st.status === 'running') return `运行中 · ${Math.floor(st.uptime / 60)}分`;
    if (st.status === 'error') return '错误';
    if (st.status === 'starting') return '启动中...';
    return '已停止';
  };

  const openEditor = (platform: IMPlatform, existing?: AnyIMConfig) => {
    setExpanded(platform);
    if (existing) {
      setEditForm({ ...existing });
    } else {
      // 初始化默认表单
      const defaults: Record<string, Partial<AnyIMConfig>> = {
        telegram: { platform: 'telegram', name: 'Telegram Bot', botToken: '', mode: 'polling' },
        feishu: { platform: 'feishu', name: '飞书 Bot', appId: '', appSecret: '' },
        wechat: { platform: 'wechat', name: '企业微信 Bot', corpId: '', agentId: '', appSecret: '' },
      };
      setEditForm(defaults[platform] || { platform });
    }
  };

  if (loading) {
    return (
      <div className="p-6 text-gray-400">
        <div className="animate-pulse space-y-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-32 bg-gray-100 rounded-xl" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-3xl mx-auto">
      {/* 头部 */}
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-2">
          <Send className="w-6 h-6 text-blue-600" />
          <h1 className="text-2xl font-bold text-gray-900">IM 适配器</h1>
        </div>
        <p className="text-gray-500">
          将 EasyAgent 接入 Telegram、飞书、企业微信等 IM 平台，在聊天工具中与 AI 对话
        </p>
      </div>

      {/* 平台卡片列表 */}
      <div className="space-y-4">
        {(Object.entries(platformMeta) as [IMPlatform, typeof platformMeta[IMPlatform]][]).map(
          ([platform, meta]) => {
            const cfg = configs.find((c) => c.platform === platform);
            const isEditing = expanded === platform;

            return (
              <div
                key={platform}
                className="bg-white border border-gray-200 rounded-xl overflow-hidden transition-shadow hover:shadow-sm"
              >
                {/* 卡片头部 */}
                <div className="p-4 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <span className="text-2xl">{meta.icon}</span>
                    <div>
                      <h3 className="font-semibold text-gray-900">{meta.label}</h3>
                      <p className="text-sm text-gray-400">
                        {cfg ? `${cfg.name} · ` : ''}{getStatusText(platform)}
                      </p>
                    </div>
                    <span className="ml-2">{getStatusIcon(platform)}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    {/* 启动/停止按钮 */}
                    {cfg && (
                      <>
                        {(statuses[platform]?.status === 'running') ? (
                          <button
                            onClick={() => handleToggle(platform, 'stop')}
                            className="px-3 py-1.5 text-sm bg-orange-50 text-orange-600 rounded-lg hover:bg-orange-100 transition-colors"
                          >
                            <Square className="w-3.5 h-3.5 inline mr-1" />
                            停止
                          </button>
                        ) : (
                          <button
                            onClick={() => handleToggle(platform, 'start')}
                            className="px-3 py-1.5 text-sm bg-green-50 text-green-600 rounded-lg hover:bg-green-100 transition-colors"
                          >
                            <Play className="w-3.5 h-3.5 inline mr-1" />
                            启动
                          </button>
                        )}
                      </>
                    )}
                    {/* 配置按钮 */}
                    <button
                      onClick={() => openEditor(platform, cfg)}
                      className="px-3 py-1.5 text-sm bg-blue-50 text-blue-600 rounded-lg hover:bg-blue-100 transition-colors"
                    >
                      {cfg ? '编辑' : '配置'}
                    </button>
                    {/* 删除 */}
                    {cfg && (
                      <button
                        onClick={() => handleDelete(platform)}
                        className="p-1.5 text-gray-300 hover:text-red-500 rounded-lg hover:bg-red-50 transition-colors"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </div>

                {/* 编辑面板 */}
                {isEditing && (
                  <div className="border-t border-gray-100 px-4 py-4 bg-gray-50">
                    <p className="text-xs text-gray-400 mb-4">{meta.description}</p>

                    {platform === 'telegram' && (
                      <div className="space-y-3">
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">显示名称</label>
                          <input
                            type="text"
                            value={(editForm as { name?: string }).name || ''}
                            onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                            placeholder="我的 Telegram Bot"
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">
                            Bot Token <span className="text-red-500">*</span>
                          </label>
                          <input
                            type="password"
                            value={(editForm as { botToken?: string }).botToken || ''}
                            onChange={(e) => setEditForm({ ...editForm, botToken: e.target.value })}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm font-mono focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                            placeholder="123456:ABC-DEF1234gh..."
                          />
                          <p className="text-xs text-gray-400 mt-1">
                            从 <a href="https://t.me/BotFather" target="_blank" rel="noopener noreferrer" className="text-blue-500 hover:underline">@BotFather</a> 获取
                          </p>
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">连接模式</label>
                          <select
                            value={(editForm as { mode?: string }).mode || 'polling'}
                            onChange={(e) => setEditForm({ ...editForm, mode: e.target.value as 'polling' | 'webhook' })}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
                          >
                            <option value="polling">长轮询 (polling) - 无需公网</option>
                            <option value="webhook">Webhook - 需公网地址</option>
                          </select>
                        </div>
                      </div>
                    )}

                    {platform === 'feishu' && (
                      <div className="space-y-3">
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">显示名称</label>
                          <input
                            type="text"
                            value={(editForm as { name?: string }).name || ''}
                            onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                            placeholder="飞书 AI 助手"
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">App ID <span className="text-red-500">*</span></label>
                          <input
                            type="text"
                            value={(editForm as { appId?: string }).appId || ''}
                            onChange={(e) => setEditForm({ ...editForm, appId: e.target.value })}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm font-mono"
                            placeholder="cli_xxxxxxxxxxxx"
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">App Secret <span className="text-red-500">*</span></label>
                          <input
                            type="password"
                            value={(editForm as { appSecret?: string }).appSecret || ''}
                            onChange={(e) => setEditForm({ ...editForm, appSecret: e.target.value })}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm font-mono"
                          />
                        </div>
                      </div>
                    )}

                    {platform === 'wechat' && (
                      <div className="space-y-3">
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">显示名称</label>
                          <input
                            type="text"
                            value={(editForm as { name?: string }).name || ''}
                            onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                            placeholder="企业微信 AI 助手"
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">企业 Corp ID</label>
                          <input
                            type="text"
                            value={(editForm as { corpId?: string }).corpId || ''}
                            onChange={(e) => setEditForm({ ...editForm, corpId: e.target.value })}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm font-mono"
                            placeholder="ww1234567890abcdef"
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">应用 Agent ID</label>
                          <input
                            type="text"
                            value={(editForm as { agentId?: string }).agentId || ''}
                            onChange={(e) => setEditForm({ ...editForm, agentId: e.target.value })}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                            placeholder="1000001"
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">应用 Secret</label>
                          <input
                            type="password"
                            value={(editForm as { appSecret?: string }).appSecret || ''}
                            onChange={(e) => setEditForm({ ...editForm, appSecret: e.target.value })}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm font-mono"
                          />
                        </div>
                        <div className="p-3 bg-yellow-50 border border-yellow-200 rounded-lg text-xs text-yellow-700">
                          <AlertCircle className="w-3.5 h-3.5 inline mr-1" />
                          企业微信接入需要公网服务器和域名，消息接收 URL 为: <code className="bg-yellow-100 px-1 rounded">/api/im/webhook/wechat</code>
                        </div>
                      </div>
                    )}

                    {/* 操作按钮 */}
                    <div className="flex items-center gap-3 mt-4 pt-3 border-t border-gray-200">
                      <button
                        onClick={() => handleSave(platform)}
                        disabled={saving}
                        className="px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
                      >
                        {saving ? '保存中...' : '保存配置'}
                      </button>
                      <button
                        onClick={() => setExpanded(null)}
                        className="px-4 py-2 text-sm text-gray-500 rounded-lg hover:bg-gray-100 transition-colors"
                      >
                        取消
                      </button>
                      <a
                        href={meta.docsUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs text-blue-500 hover:underline ml-auto"
                      >
                        接入文档 →
                      </a>
                    </div>
                  </div>
                )}
              </div>
            );
          }
        )}
      </div>

      {/* 底部提示 */}
      <div className="mt-8 p-4 bg-blue-50 border border-blue-200 rounded-xl">
        <p className="text-sm text-blue-700 font-medium mb-1">💡 使用提示</p>
        <ul className="text-xs text-blue-600 space-y-1">
          <li>• <strong>Telegram</strong>: 推荐使用长轮询模式，无需公网即可测试</li>
          <li>• <strong>飞书</strong>: Webhook URL 为 <code className="bg-blue-100 px-1 rounded">http://你的服务器:端口/api/im/webhook/feishu</code></li>
          <li>• <strong>企业微信</strong>: 消息接收 URL 为 <code className="bg-blue-100 px-1 rounded">http://你的服务器:端口/api/im/webhook/wechat</code></li>
        </ul>
      </div>
    </div>
  );
}
