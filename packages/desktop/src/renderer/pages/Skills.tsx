/**
 * 技能市场页面 - 全功能版本
 * 支持：技能总览表格、激活/停用、自定义技能 CRUD、搜索筛选
 */
import { useState, useEffect } from 'react';
import { Zap, Tag, Play, Info, Search, Plus, Trash2, RefreshCw, AlertCircle, CheckCircle2, XCircle } from 'lucide-react';
import { apiFetch } from '../api';

/** 技能类型 */
interface Skill {
  name: string;
  description: string;
  tags?: string[];
  prompt?: string;
  requiresConfirm?: boolean;
  source: 'builtin' | 'plugin' | 'custom';
  activated?: boolean;
}

/** 技能图标映射 */
const skillIcons: Record<string, string> = {
  'code-review': '🔍',
  'unit-test-generator': '🧪',
  'code-explain': '💡',
  'generate-doc': '📝',
  refactor: '🔧',
  debug: '🐛',
};

const SOURCE_LABELS: Record<Skill['source'], string> = {
  builtin: '内置',
  plugin: '插件',
  custom: '自定义',
};
const SOURCE_COLORS: Record<Skill['source'], string> = {
  builtin: 'bg-blue-500/10 text-blue-400',
  plugin: 'bg-purple-500/10 text-purple-400',
  custom: 'bg-orange-500/10 text-orange-400',
};

export default function SkillsPage() {
  const [skills, setSkills] = useState<Skill[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeSkill, setActiveSkill] = useState<Skill | null>(null);
  const [filter, setFilter] = useState('');
  const [sourceFilter, setSourceFilter] = useState<'all' | Skill['source']>('all');
  const [viewMode, setViewMode] = useState<'cards' | 'table'>('table');

  // 激活/停用状态
  const [activating, setActivating] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; msg: string } | null>(null);

  // 自定义技能表单
  const [showAddForm, setShowAddForm] = useState(false);
  const [newSkill, setNewSkill] = useState({ name: '', description: '', prompt: '', tags: '' });
  const [adding, setAdding] = useState(false);

  // 统计
  const activeCount = skills.filter((s) => s.activated).length;
  const builtinCount = skills.filter((s) => s.source === 'builtin').length;
  const pluginCount = skills.filter((s) => s.source === 'plugin').length;
  const customCount = skills.filter((s) => s.source === 'custom').length;

  useEffect(() => {
    fetchSkills();
  }, []);

  /** 获取技能列表 */
  const fetchSkills = async () => {
    setLoading(true);
    try {
      const data = await apiFetch<Skill[]>('/api/skills');
      setSkills(Array.isArray(data) ? data : []);
    } catch (err) {
      // 服务不可用时静默失败
    } finally {
      setLoading(false);
    }
  };

  /** 激活技能 */
  const handleActivate = async (skillName: string) => {
    setActivating(skillName);
    try {
      const data = await apiFetch<{ success: boolean; error?: string }>(`/api/skills/${encodeURIComponent(skillName)}/activate`, { method: 'POST' });
      if (!data.success) throw new Error(data.error || '激活失败');
      // 更新列表中的激活状态
      setSkills((prev) => prev.map((s) => (s.name === skillName ? { ...s, activated: true } : s)));
      setFeedback({ type: 'success', msg: `✅ "${skillName}" 已激活` });
      // 如果详情面板开着，同步更新
      if (activeSkill?.name === skillName) {
        setActiveSkill((prev) => (prev ? { ...prev, activated: true } : null));
      }
    } catch (err) {
      setFeedback({ type: 'error', msg: `❌ ${(err as Error).message || '激活失败'}` });
    } finally {
      setActivating(null);
    }
  };

  /** 停用技能 */
  const handleDeactivate = async (skillName: string) => {
    setActivating(skillName);
    try {
      const data = await apiFetch<{ success: boolean; error?: string }>(`/api/skills/${encodeURIComponent(skillName)}/deactivate`, { method: 'POST' });
      if (!data.success) throw new Error(data.error || '停用失败');
      setSkills((prev) => prev.map((s) => (s.name === skillName ? { ...s, activated: false } : s)));
      setFeedback({ type: 'success', msg: `⏹️ "${skillName}" 已停用` });
      if (activeSkill?.name === skillName) {
        setActiveSkill((prev) => (prev ? { ...prev, activated: false } : null));
      }
    } catch (err) {
      setFeedback({ type: 'error', msg: `❌ ${(err as Error).message || '停用失败'}` });
    } finally {
      setActivating(null);
    }
  };

  /** 删除自定义技能 */
  const handleDeleteCustom = async (skillName: string) => {
    if (!confirm(`确定删除自定义技能 "${skillName}" 吗？此操作不可撤销。`)) return;
    try {
      await apiFetch(`/api/skills/custom/${encodeURIComponent(skillName)}`, { method: 'DELETE' });
      setSkills((prev) => prev.filter((s) => s.name !== skillName));
      if (activeSkill?.name === skillName) setActiveSkill(null);
      setFeedback({ type: 'success', msg: `🗑️ "${skillName}" 已删除` });
    } catch (err) {
      setFeedback({ type: 'error', msg: `❌ ${(err as Error).message || '删除失败'}` });
    }
  };

  /** 添加自定义技能 */
  const handleAddSkill = async () => {
    const { name, description, prompt, tags } = newSkill;
    if (!name.trim() || !description.trim()) {
      setFeedback({ type: 'error', msg: '❌ 名称和描述不能为空' });
      return;
    }
    setAdding(true);
    try {
      const data = await apiFetch<{ success: boolean; error?: string; skill?: Skill }>('/api/skills/custom', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          description: description.trim(),
          prompt: prompt.trim() || undefined,
          tags: tags ? tags.split(',').map((t) => t.trim()).filter(Boolean) : undefined,
        }),
      });
      if (!data.success) throw new Error(data.error || '添加失败');
      setSkills((prev) => [...prev, data.skill!]);
      setShowAddForm(false);
      setNewSkill({ name: '', description: '', prompt: '', tags: '' });
      setFeedback({ type: 'success', msg: `➕ "${name.trim()}" 已添加到技能库` });
    } catch (err) {
      setFeedback({ type: 'error', msg: `❌ ${(err as Error).message || '添加失败'}` });
    } finally {
      setAdding(false);
    }
  };

  /** 点击技能详情 - 清除之前的反馈 */
  const handleSelectSkill = (skill: Skill) => {
    setActiveSkill(skill);
    setFeedback(null); // 切换技能时清除反馈
  };

  /** 过滤技能 */
  const filtered = skills.filter((s) => {
    const matchSource = sourceFilter === 'all' || s.source === sourceFilter;
    const matchSearch =
      s.name.includes(filter.toLowerCase()) ||
      s.description.toLowerCase().includes(filter.toLowerCase()) ||
      s.tags?.some((t) => t.includes(filter.toLowerCase()));
    return matchSource && matchSearch;
  });

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-[calc(100vh-7rem)]">
      {/* 标题栏 */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-xl font-bold">技能市场</h1>
          <p className="text-sm text-gray-500 mt-1">
            管理 Agent 技能：激活/停用、添加自定义技能
          </p>
        </div>
        <div className="flex items-center gap-3">
          {/* 视图切换 */}
          <div className="flex bg-gray-900 rounded-lg border border-gray-800 overflow-hidden">
            <button
              onClick={() => setViewMode('table')}
              className={`px-3 py-1 text-xs ${viewMode === 'table' ? 'bg-blue-500/20 text-blue-400' : 'text-gray-500 hover:text-gray-300'}`}
            >
              表格
            </button>
            <button
              onClick={() => setViewMode('cards')}
              className={`px-3 py-1 text-xs ${viewMode === 'cards' ? 'bg-blue-500/20 text-blue-400' : 'text-gray-500 hover:text-gray-300'}`}
            >
              卡片
            </button>
          </div>
          {/* 统��� */}
          <div className="flex items-center gap-3 text-xs text-gray-600">
            <span className="flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-green-500" />
              {activeCount} 已激活
            </span>
            <span>/{skills.length} 总计</span>
          </div>
          <button
            onClick={() => { fetchSkills(); setFeedback(null); }}
            className="p-1.5 text-gray-500 hover:text-gray-300 hover:bg-gray-800 rounded"
            title="刷新"
          >
            <RefreshCw className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* 统计栏 + 添加按钮 + 搜索 */}
      <div className="flex items-center gap-3 mb-4 flex-wrap">
        {/* 来源筛选 */}
        <div className="flex gap-1">
          {(['all', 'builtin', 'plugin', 'custom'] as const).map((src) => (
            <button
              key={src}
              onClick={() => { setSourceFilter(src); setActiveSkill(null); setFeedback(null); }}
              className={`px-2.5 py-1 rounded text-xs transition-colors ${
                sourceFilter === src
                  ? 'bg-gray-700 text-gray-200'
                  : 'bg-gray-900 text-gray-500 hover:text-gray-300 border border-gray-800'
              }`}
            >
              {src === 'all' ? '全部' : SOURCE_LABELS[src]}
              <span className="ml-1 opacity-50">
                {src === 'all' ? skills.length : src === 'builtin' ? builtinCount : src === 'plugin' ? pluginCount : customCount}
              </span>
            </button>
          ))}
        </div>

        <div className="flex-1" />

        {/* 搜索 */}
        <div className="relative">
          <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-600" />
          <input
            type="text"
            placeholder="搜索技能..."
            className="w-48 bg-gray-900 border border-gray-800 rounded-lg pl-8 pr-3 py-1.5 text-sm text-gray-300 focus:outline-none focus:border-blue-500/50"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
          />
        </div>

        {/* 添加自定义技能按钮 */}
        <button
          onClick={() => { setShowAddForm(!showAddForm); setFeedback(null); }}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs transition-colors ${
            showAddForm ? 'bg-orange-500/20 text-orange-400' : 'bg-gray-900 border border-gray-800 text-gray-400 hover:text-gray-200'
          }`}
        >
          <Plus className="w-3.5 h-3.5" />
          新增技能
        </button>
      </div>

      {/* 添加技能表单 */}
      {showAddForm && (
        <div className="mb-4 p-4 bg-gray-900/50 rounded-xl border border-gray-800 space-y-3">
          <div className="text-sm font-medium text-gray-300">添加自定义技能</div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-gray-500 mb-1 block">名称 *</label>
              <input
                type="text"
                className="w-full bg-gray-950 border border-gray-800 rounded-lg px-3 py-1.5 text-sm text-gray-300 focus:outline-none focus:border-orange-500/50"
                placeholder="skill-name"
                value={newSkill.name}
                onChange={(e) => setNewSkill({ ...newSkill, name: e.target.value })}
              />
            </div>
            <div>
              <label className="text-xs text-gray-500 mb-1 block">标签（逗号分隔）</label>
              <input
                type="text"
                className="w-full bg-gray-950 border border-gray-800 rounded-lg px-3 py-1.5 text-sm text-gray-300 focus:outline-none focus:border-orange-500/50"
                placeholder="tag1, tag2"
                value={newSkill.tags}
                onChange={(e) => setNewSkill({ ...newSkill, tags: e.target.value })}
              />
            </div>
            <div className="col-span-2">
              <label className="text-xs text-gray-500 mb-1 block">描述 *</label>
              <input
                type="text"
                className="w-full bg-gray-950 border border-gray-800 rounded-lg px-3 py-1.5 text-sm text-gray-300 focus:outline-none focus:border-orange-500/50"
                placeholder="技能的简要描述..."
                value={newSkill.description}
                onChange={(e) => setNewSkill({ ...newSkill, description: e.target.value })}
              />
            </div>
            <div className="col-span-2">
              <label className="text-xs text-gray-500 mb-1 block">系统提示词（可选）</label>
              <textarea
                className="w-full bg-gray-950 border border-gray-800 rounded-lg px-3 py-1.5 text-sm text-gray-300 focus:outline-none focus:border-orange-500/50 h-20 resize-none"
                placeholder="激活时注入的 system prompt..."
                value={newSkill.prompt}
                onChange={(e) => setNewSkill({ ...newSkill, prompt: e.target.value })}
              />
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <button onClick={() => setShowAddForm(false)} className="px-3 py-1.5 text-xs text-gray-500 hover:text-gray-300">
              取消
            </button>
            <button
              onClick={handleAddSkill}
              disabled={adding}
              className="px-4 py-1.5 text-xs bg-orange-500/20 text-orange-400 rounded-lg hover:bg-orange-500/30 disabled:opacity-50"
            >
              {adding ? '添加中...' : '确认添加'}
            </button>
          </div>
        </div>
      )}

      {/* 反馈消息 */}
      {feedback && (
        <div
          className={`text-xs p-2.5 rounded-lg mb-3 border ${
            feedback.type === 'success'
              ? 'bg-green-500/10 text-green-400 border-green-500/20'
              : 'bg-red-500/10 text-red-400 border-red-500/20'
          }`}
        >
          {feedback.msg}
        </div>
      )}

      {/* 主内容区 */}
      <div className="flex gap-4 flex-1 overflow-hidden">
        {/* 左侧：技能表格或卡片列表 */}
        <div className="flex-1 overflow-y-auto pr-2">
          {viewMode === 'table' ? (
            /* 表格视图 */
            <div className="border border-gray-800 rounded-xl overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-900/50 text-left">
                    <th className="px-4 py-2.5 text-xs text-gray-500 font-medium w-8">#</th>
                    <th className="px-4 py-2.5 text-xs text-gray-500 font-medium">技能名称</th>
                    <th className="px-4 py-2.5 text-xs text-gray-500 font-medium w-20">来源</th>
                    <th className="px-4 py-2.5 text-xs text-gray-500 font-medium w-16">状态</th>
                    <th className="px-4 py-2.5 text-xs text-gray-500 font-medium w-44">操作</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="px-4 py-8 text-center text-gray-600">
                        {filter ? '没有匹配的技能' : '暂无可用技能'}
                      </td>
                    </tr>
                  ) : (
                    filtered.map((skill, idx) => (
                      <tr
                        key={skill.name}
                        onClick={() => handleSelectSkill(skill)}
                        className={`border-t border-gray-800/50 cursor-pointer transition-colors ${
                          activeSkill?.name === skill.name
                            ? 'bg-blue-500/5'
                            : 'hover:bg-gray-900/30'
                        }`}
                      >
                        <td className="px-4 py-2.5 text-gray-600 text-xs">{idx + 1}</td>
                        <td className="px-4 py-2.5">
                          <div className="flex items-center gap-2">
                            <span className="text-base">{skillIcons[skill.name] || '📦'}</span>
                            <div>
                              <div className="font-medium text-gray-200 text-sm">{skill.name}</div>
                              <div className="text-xs text-gray-500 truncate max-w-xs">{skill.description}</div>
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-2.5">
                          <span className={`text-xs px-1.5 py-0.5 rounded ${SOURCE_COLORS[skill.source]}`}>
                            {SOURCE_LABELS[skill.source]}
                          </span>
                        </td>
                        <td className="px-4 py-2.5">
                          {skill.activated ? (
                            <span className="flex items-center gap-1 text-xs text-green-400">
                              <CheckCircle2 className="w-3 h-3" /> 已激活
                            </span>
                          ) : (
                            <span className="flex items-center gap-1 text-xs text-gray-600">
                              <XCircle className="w-3 h-3" /> 未激活
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-2.5">
                          <div className="flex gap-1.5">
                            {skill.activated ? (
                              <button
                                onClick={(e) => { e.stopPropagation(); handleDeactivate(skill.name); }}
                                disabled={activating === skill.name}
                                className="text-xs px-2 py-1 rounded bg-yellow-500/10 text-yellow-400 hover:bg-yellow-500/20 disabled:opacity-50"
                              >
                                {activating === skill.name ? '...' : '停用'}
                              </button>
                            ) : (
                              <button
                                onClick={(e) => { e.stopPropagation(); handleActivate(skill.name); }}
                                disabled={activating === skill.name}
                                className="text-xs px-2 py-1 rounded bg-blue-500/10 text-blue-400 hover:bg-blue-500/20 disabled:opacity-50"
                              >
                                {activating === skill.name ? '...' : '激活'}
                              </button>
                            )}
                            {/* 自定义技能可删除 */}
                            {skill.source === 'custom' && (
                              <button
                                onClick={(e) => { e.stopPropagation(); handleDeleteCustom(skill.name); }}
                                className="text-xs px-1.5 py-1 rounded text-gray-600 hover:text-red-400 hover:bg-red-500/10"
                                title="删除"
                              >
                                <Trash2 className="w-3 h-3" />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          ) : (
            /* 卡片视图 */
            <div className="space-y-2">
              {filtered.length === 0 ? (
                <div className="text-center text-gray-600 py-12">
                  <Zap className="w-8 h-8 mx-auto mb-2 opacity-30" />
                  <p>{filter ? '没有匹配的技能' : '暂无可用技能'}</p>
                </div>
              ) : (
                filtered.map((skill) => (
                  <button
                    key={skill.name}
                    onClick={() => handleSelectSkill(skill)}
                    className={`w-full text-left p-4 rounded-xl border transition-all duration-150 ${
                      activeSkill?.name === skill.name
                        ? 'border-blue-500/30 bg-blue-500/5'
                        : 'border-gray-800 bg-gray-900/50 hover:border-gray-700'
                    }`}
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex items-start gap-3 min-w-0">
                        <span className="text-xl mt-0.5">{skillIcons[skill.name] || '📦'}</span>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <h3 className="font-medium text-sm text-gray-200">{skill.name}</h3>
                            <span className={`text-[10px] px-1.5 py-0.5 rounded ${SOURCE_COLORS[skill.source]}`}>
                              {SOURCE_LABELS[skill.source]}
                            </span>
                            {skill.activated && (
                              <span className="text-[10px] px-1.5 py-0.5 rounded bg-green-500/10 text-green-400">已激活</span>
                            )}
                            {skill.requiresConfirm && (
                              <span className="text-[10px] px-1.5 py-0.5 rounded bg-yellow-500/10 text-yellow-500">需确认</span>
                            )}
                          </div>
                          <p className="text-xs text-gray-500 mt-1 line-clamp-2">{skill.description}</p>
                          {skill.tags && skill.tags.length > 0 && (
                            <div className="flex gap-1 mt-2 flex-wrap">
                              {skill.tags.map((tag) => (
                                <span key={tag} className="text-[10px] px-1.5 py-0.5 rounded bg-gray-800 text-gray-500">
                                  {tag}
                                </span>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                      {/* 快速操作按钮 */}
                      <div className="flex gap-1 ml-2 shrink-0" onClick={(e) => e.stopPropagation()}>
                        {skill.activated ? (
                          <button
                            onClick={() => handleDeactivate(skill.name)}
                            disabled={activating === skill.name}
                            className="text-xs px-2 py-1 rounded bg-yellow-500/10 text-yellow-400 hover:bg-yellow-500/20 disabled:opacity-50"
                          >
                            {activating === skill.name ? '...' : '停用'}
                          </button>
                        ) : (
                          <button
                            onClick={() => handleActivate(skill.name)}
                            disabled={activating === skill.name}
                            className="text-xs px-2 py-1 rounded bg-blue-500/10 text-blue-400 hover:bg-blue-500/20 disabled:opacity-50"
                          >
                            {activating === skill.name ? '...' : '激活'}
                          </button>
                        )}
                      </div>
                    </div>
                  </button>
                ))
              )}
            </div>
          )}
        </div>

        {/* 右侧：技能详情面板 */}
        <div className="w-96 shrink-0 border border-gray-800 rounded-xl bg-gray-900/30 overflow-y-auto">
          {activeSkill ? (
            <div className="p-4">
              <div className="flex items-center gap-3 mb-4">
                <span className="text-2xl">{skillIcons[activeSkill.name] || '📦'}</span>
                <div>
                  <h3 className="font-semibold text-gray-200">{activeSkill.name}</h3>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className={`text-xs px-1.5 py-0.5 rounded ${SOURCE_COLORS[activeSkill.source]}`}>
                      {SOURCE_LABELS[activeSkill.source]}
                    </span>
                    {activeSkill.activated ? (
                      <span className="text-xs text-green-400 flex items-center gap-1">
                        <span className="w-1.5 h-1.5 rounded-full bg-green-500" />已激活
                      </span>
                    ) : (
                      <span className="text-xs text-gray-600 flex items-center gap-1">
                        <span className="w-1.5 h-1.5 rounded-full bg-gray-600" />未激活
                      </span>
                    )}
                  </div>
                </div>
              </div>

              <p className="text-sm text-gray-400 mb-4">{activeSkill.description}</p>

              {activeSkill.tags && activeSkill.tags.length > 0 && (
                <div className="mb-4">
                  <div className="flex items-center gap-1.5 text-xs text-gray-600 mb-2">
                    <Tag className="w-3 h-3" /> 标签
                  </div>
                  <div className="flex gap-1 flex-wrap">
                    {activeSkill.tags.map((tag) => (
                      <span key={tag} className="text-xs px-2 py-0.5 rounded bg-gray-800 text-gray-400">
                        {tag}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {activeSkill.prompt && (
                <div className="mb-4">
                  <div className="flex items-center gap-1.5 text-xs text-gray-600 mb-2">
                    <Info className="w-3 h-3" /> 系统提示词
                  </div>
                  <div className="text-xs text-gray-500 bg-gray-950 rounded-lg p-3 max-h-48 overflow-y-auto whitespace-pre-wrap border border-gray-800">
                    {activeSkill.prompt}
                  </div>
                </div>
              )}

              {/* 操作按钮 */}
              <div className="flex gap-2 mt-2">
                {activeSkill.activated ? (
                  <button
                    className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-sm bg-yellow-500/10 text-yellow-400 hover:bg-yellow-500/20 border border-yellow-500/20 disabled:opacity-50"
                    onClick={() => handleDeactivate(activeSkill.name)}
                    disabled={activating === activeSkill.name}
                  >
                    <Play className="w-3.5 h-3.5 rotate-180" />
                    {activating === activeSkill.name ? '停用中...' : '停用技能'}
                  </button>
                ) : (
                  <button
                    className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-sm bg-blue-500/10 text-blue-400 hover:bg-blue-500/20 border border-blue-500/20 disabled:opacity-50"
                    onClick={() => handleActivate(activeSkill.name)}
                    disabled={activating === activeSkill.name}
                  >
                    <Play className="w-3.5 h-3.5" />
                    {activating === activeSkill.name ? '激活中...' : '激活技能'}
                  </button>
                )}
                {activeSkill.source === 'custom' && (
                  <button
                    className="flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-sm text-red-400 hover:bg-red-500/10 border border-red-500/20"
                    onClick={() => handleDeleteCustom(activeSkill.name)}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-center h-full text-gray-600 text-sm">
              <p>选择技能查看详情</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
