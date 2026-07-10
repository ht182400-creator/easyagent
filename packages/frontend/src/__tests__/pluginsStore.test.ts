/**
 * pluginsStore 测试 — 插件安装进度订阅链路
 *
 * 覆盖：
 * - initPluginProgressListener 订阅 plugin:install:progress 事件总线
 * - 收到事件后调用 updateInstallProgress
 * - 取消订阅后不再接收事件
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { clearAllListeners, emit } from '../events';
import { usePluginsStore, initPluginProgressListener } from '../stores/pluginsStore';

describe('pluginsStore — 插件安装进度订阅', () => {
  beforeEach(() => {
    clearAllListeners();
    // 重置 store
    usePluginsStore.setState({ installProgress: new Map() });
  });

  it('initPluginProgressListener 应返回取消订阅函数', () => {
    const unsubscribe = initPluginProgressListener();
    expect(typeof unsubscribe).toBe('function');
    unsubscribe();
  });

  it('收到 plugin:install:progress 事件应更新 installProgress', () => {
    const unsubscribe = initPluginProgressListener();

    emit('plugin:install:progress', {
      jobId: 'job_001',
      pluginId: 'owner/plugin-a',
      progress: 50,
      status: 'downloading',
    });

    const progress = usePluginsStore.getState().installProgress.get('job_001');
    expect(progress).toBeDefined();
    expect(progress?.pluginId).toBe('owner/plugin-a');
    expect(progress?.progress).toBe(50);
    expect(progress?.status).toBe('downloading');

    unsubscribe();
  });

  it('多次进度更新应覆盖同一 jobId 的记录', () => {
    const unsubscribe = initPluginProgressListener();

    emit('plugin:install:progress', {
      jobId: 'job_002', pluginId: 'owner/plugin-b', progress: 20, status: 'downloading',
    });
    emit('plugin:install:progress', {
      jobId: 'job_002', pluginId: 'owner/plugin-b', progress: 60, status: 'extracting',
    });

    const progress = usePluginsStore.getState().installProgress.get('job_002');
    expect(progress?.progress).toBe(60);
    expect(progress?.status).toBe('extracting');

    unsubscribe();
  });

  it('取消订阅后不应再收到事件', () => {
    const unsubscribe = initPluginProgressListener();

    emit('plugin:install:progress', {
      jobId: 'job_003', pluginId: 'owner/plugin-c', progress: 10, status: 'downloading',
    });
    expect(usePluginsStore.getState().installProgress.size).toBe(1);

    unsubscribe();

    emit('plugin:install:progress', {
      jobId: 'job_004', pluginId: 'owner/plugin-d', progress: 20, status: 'downloading',
    });
    // 仍只有 job_003
    expect(usePluginsStore.getState().installProgress.size).toBe(1);
    expect(usePluginsStore.getState().installProgress.has('job_004')).toBe(false);
  });

  it('done 状态应自动将 marketplace 中对应插件标记为已安装', () => {
    usePluginsStore.setState({
      marketplace: [
        { id: 'owner/plugin-e', name: 'E', description: '', author: 'owner',
          version: '1.0.0', downloads: 0, stars: 0, updatedAt: '', repoUrl: '',
          tags: [], permissions: null, installed: false },
      ],
      installed: [],
      installProgress: new Map(),
    });

    const unsubscribe = initPluginProgressListener();

    emit('plugin:install:progress', {
      jobId: 'job_005', pluginId: 'owner/plugin-e', progress: 100, status: 'done',
    });

    const plugin = usePluginsStore.getState().marketplace.find(p => p.id === 'owner/plugin-e');
    expect(plugin?.installed).toBe(true);

    unsubscribe();
  });

  it('done 状态应清理 installProgress 中对应 jobId（避免 UI 永久锁定在 done）', () => {
    usePluginsStore.setState({
      marketplace: [],
      installed: [],
      installProgress: new Map([['job_006', {
        jobId: 'job_006', pluginId: 'owner/plugin-f', progress: 100, status: 'done',
      }]]),
    });

    const unsubscribe = initPluginProgressListener();

    // 再次触发 done 状态（模拟重复推送或轮询兜底）
    emit('plugin:install:progress', {
      jobId: 'job_006', pluginId: 'owner/plugin-f', progress: 100, status: 'done',
    });

    // installProgress 中对应条目应被清理（UI 不再显示进度条）
    expect(usePluginsStore.getState().installProgress.has('job_006')).toBe(false);

    unsubscribe();
  });

  it('done 状态应自动将新插件追加到 installed 列表（UI 立即可见）', () => {
    usePluginsStore.setState({
      marketplace: [],
      installed: [],
      installProgress: new Map(),
    });

    const unsubscribe = initPluginProgressListener();

    emit('plugin:install:progress', {
      jobId: 'job_007', pluginId: 'owner/plugin-g', progress: 100, status: 'done',
    });

    const installed = usePluginsStore.getState().installed;
    expect(installed.some((p) => p.id === 'owner/plugin-g')).toBe(true);

    unsubscribe();
  });

  it('fetchMarketplace 应通过 name 匹配已安装插件（避免 id 形式不一致导致按钮状态错误）', async () => {
    // 场景: 后端 /api/plugins/install 返回的 id 是 local:obsidian-doc-viewer，
    // 而 /api/plugins/market 返回的 id 是 obsidian-doc-viewer。
    // 仅按 id 匹配会全部 fail，导致已安装插件在市场上仍显示"使用/卸载"按钮（错误）。
    usePluginsStore.setState({
      installed: [
        // 模拟 fetchInstalled 合并后的实际数据结构：id 为 local:<name>，name 为插件名
        { id: 'local:obsidian-doc-viewer', name: 'obsidian-doc-viewer', version: '1.0.0',
          author: '', description: '', enabled: true, installedAt: '', source: 'local',
          localPath: '', updateAvailable: false, tools: [], skills: [], hooks: [] },
      ],
      marketplace: [],
      loading: false,
    });

    // mock apiRequest 拦截 /api/plugins/market
    const { apiRequest } = await import('../request');
    vi.spyOn(await import('../request'), 'apiRequest').mockResolvedValueOnce([
      { id: 'obsidian-doc-viewer', name: 'obsidian-doc-viewer', description: 'doc viewer',
        author: 'test', version: '1.0.0', downloads: 0, stars: 0, updatedAt: '',
        repoUrl: '', tags: [], permissions: null, installed: false },
    ] as any);

    await usePluginsStore.getState().fetchMarketplace();

    const plugin = usePluginsStore.getState().marketplace.find(p => p.id === 'obsidian-doc-viewer');
    expect(plugin?.installed).toBe(true); // 关键断言：已安装插件应被正确标记

    vi.restoreAllMocks();
  });
});
