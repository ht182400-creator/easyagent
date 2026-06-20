import { useState, useEffect } from 'react';
import { Cpu, XCircle, Key, ExternalLink, Zap, RefreshCw } from 'lucide-react';

interface Provider {
  id: string;
  name: string;
  baseURL: string;
  apiKeyEnv: string;
  apiFormat: string;
  hasKey?: boolean;
  fromDynamic?: boolean;
  models: Array<{
    id: string;
    name: string;
    maxContextTokens: number;
    maxOutputTokens: number;
    supportsTools: boolean;
    supportsVision: boolean;
    pricing?: { input: number; output: number };
  }>;
}

export default function Providers() {
  const [providers, setProviders] = useState<Provider[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingProvider, setEditingProvider] = useState<string | null>(null);
  const [apiKeyInput, setApiKeyInput] = useState('');
  /** 测试结果: null=测试中, {success: false, error} 失败, {success: true} 成功, undefined 未测试 */
  const [testResults, setTestResults] = useState<Record<string, { success: boolean; error?: string } | null>>({});
  const [refreshingProvider, setRefreshingProvider] = useState<string | null>(null);

  useEffect(() => {
    fetchProviders();
  }, []);

  const fetchProviders = async () => {
    try {
      const res = await fetch('/api/providers');
      const data = await res.json();
      setProviders(data);
    } catch (err) {
      console.error('获取提供商失败:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleSetKey = async (providerId: string) => {
    try {
      await fetch(`/api/providers/${providerId}/key`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ apiKey: apiKeyInput }),
      });
      setApiKeyInput('');
      setEditingProvider(null);
      fetchProviders();
    } catch (err) {
      console.error('设置密钥失败:', err);
    }
  };

  /** 刷新指定提供商的模型列表（通用端点），返回动态+预设合并结果 */
  const handleRefreshProvider = async (providerId: string) => {
    setRefreshingProvider(providerId);
    try {
      await fetch(`/api/providers/${providerId}/models/refresh`, { method: 'POST' });
      // 刷新后重新获取所有提供商数据（含合并后的模型列表）
      await fetchProviders();
    } catch (err) {
      console.error('刷新模型列表失败:', err);
    } finally {
      setRefreshingProvider(null);
    }
  };

  const handleTest = async (providerId: string) => {
    setTestResults(prev => ({ ...prev, [providerId]: null }));
    try {
      const res = await fetch(`/api/providers/${providerId}/test`, { method: 'POST' });
      const data = await res.json();
      setTestResults(prev => ({
        ...prev,
        [providerId]: { success: data.success, error: data.error },
      }));
    } catch {
      setTestResults(prev => ({
        ...prev,
        [providerId]: { success: false, error: '网络请求失败，请检查后端服务是否正常运行' },
      }));
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">模型提供商</h1>
        <p className="text-gray-400 mt-1">管理AI模型提供商和API密钥配置</p>
      </div>

      {loading ? (
        <div className="text-center py-12 text-gray-500">加载中...</div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {providers.map(provider => (
            <div key={provider.id} className="card">
              {/* 提供商头部 */}
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-gray-800 flex items-center justify-center">
                    <Cpu className="w-5 h-5 text-primary-400" />
                  </div>
                  <div>
                    <h3 className="font-semibold flex items-center gap-2">
                      {provider.name}
                      {provider.fromDynamic && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-green-500/10 text-green-400 border border-green-500/20" title="模型列表已从 API 动态获取">
                          动态
                        </span>
                      )}
                      {!provider.hasKey && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-400 border border-amber-500/20" title="需要配置API密钥">
                          未配置
                        </span>
                      )}
                      {provider.hasKey && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-green-500/10 text-green-400 border border-green-500/20" title="API密钥已配置">
                          已配置
                        </span>
                      )}
                    </h3>
                    <code className="text-xs text-gray-500">{provider.id}</code>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => handleRefreshProvider(provider.id)}
                    disabled={refreshingProvider !== null}
                    className="btn-secondary text-xs py-1 px-3 flex items-center gap-1"
                    title="从提供商 API 动态获取模型列表并合并预设"
                  >
                    <RefreshCw className={`w-3 h-3 ${refreshingProvider === provider.id ? 'animate-spin' : ''}`} />
                  </button>
                  <button
                    onClick={() => handleTest(provider.id)}
                    className="btn-secondary text-xs py-1 px-3"
                  >
                    {testResults[provider.id] === null ? '测试中...' :
                     testResults[provider.id] === undefined ? '测试连接' :
                     testResults[provider.id]!.success ? '✓ 已连接' : '✗ 失败'}
                  </button>
                </div>
              </div>

              {/* 测试失败时显示详细错误信息 */}
              {testResults[provider.id] && !testResults[provider.id]!.success && testResults[provider.id]!.error && (
                <div className="mb-4 p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-sm text-red-400">
                  <div className="flex items-start gap-2">
                    <XCircle className="w-4 h-4 mt-0.5 shrink-0" />
                    <span>{testResults[provider.id]!.error}</span>
                  </div>
                </div>
              )}

              {/* API密钥设置 */}
              <div className="mb-4">
                <label className="text-sm text-gray-400 block mb-1">
                  环境变量: <code className="text-primary-400">{provider.apiKeyEnv}</code>
                </label>
                {editingProvider === provider.id ? (
                  <div className="flex gap-2">
                    <input
                      type="password"
                      value={apiKeyInput}
                      onChange={e => setApiKeyInput(e.target.value)}
                      placeholder="输入API密钥..."
                      className="input text-sm flex-1"
                      autoFocus
                    />
                    <button
                      onClick={() => handleSetKey(provider.id)}
                      className="btn-primary text-sm py-1"
                    >
                      保存
                    </button>
                    <button
                      onClick={() => setEditingProvider(null)}
                      className="btn-secondary text-sm py-1"
                    >
                      取消
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => setEditingProvider(provider.id)}
                    className="flex items-center gap-2 text-sm text-primary-400 hover:underline"
                  >
                    <Key className="w-3 h-3" /> 设置API密钥
                  </button>
                )}
              </div>

              {/* 模型列表 */}
              <div>
                <h4 className="text-sm font-medium text-gray-400 mb-2 flex items-center gap-2">
                  可用模型
                  {provider.fromDynamic && (
                    <span className="badge-green text-[10px] px-1.5 py-0.5">含动态</span>
                  )}
                </h4>
                <div className="space-y-2">
                  {provider.models.map(model => (
                    <div
                      key={model.id}
                      className={`bg-gray-800 rounded-lg p-3 flex items-center justify-between ${
                        (model as any).fromDynamic ? 'ring-1 ring-green-500/30' : ''
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <code className="text-sm text-primary-300">{model.id}</code>
                        <span className="text-gray-500">-</span>
                        <span className="text-sm">{model.name}</span>
                        {(model as any).fromDynamic && (
                          <span className="badge-green text-[10px] px-1.5 py-0" title="来自提供商API动态获取">动态</span>
                        )}
                      </div>
                      <div className="flex items-center gap-3 text-xs text-gray-500">
                        <span>{model.maxContextTokens / 1000}K ctx</span>
                        {model.supportsTools && (
                          <span className="badge-blue" title="支持工具调用">🛠️</span>
                        )}
                        {model.supportsVision && (
                          <span className="badge-green" title="支持图像">👁️</span>
                        )}
                        {model.pricing && (
                          <span title="价格/百万token">
                            ¥{model.pricing.input}/¥{model.pricing.output}
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* 快速设置说明 */}
      <div className="card border-primary-500/20 bg-primary-500/5">
        <h3 className="font-semibold flex items-center gap-2 mb-2">
          <Zap className="w-4 h-4 text-primary-400" />
          快速开始
        </h3>
        <p className="text-sm text-gray-400">
          设置环境变量或通过API密钥设置来启用模型提供商。推荐使用 DeepSeek 作为起步模型，
          性价比高且对中文支持优秀。
        </p>
        <div className="mt-3 p-3 bg-gray-900 rounded-lg">
          <code className="text-sm text-green-400">
            # 设置DeepSeek API密钥 (推荐)
            <br />
            export DEEPSEEK_API_KEY="sk-your-key-here"
            <br />
            <br />
            # 设置其他提供商
            <br />
            export DASHSCOPE_API_KEY="sk-your-key"  # 通义千问
            <br />
            export ZHIPU_API_KEY="your-key"         # 智谱GLM
            <br />
            export MOONSHOT_API_KEY="sk-your-key"   # Kimi
          </code>
        </div>
      </div>
    </div>
  );
}
