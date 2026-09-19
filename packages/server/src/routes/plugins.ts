/**
 * 插件 / 技能 / 工具路由（P1-1 第三批拆分产物）
 *
 * ── ⚠️ 本模块的约定 ──
 *   1. **纯搬迁**：路由路径、方法、处理逻辑与拆分前完全一致（见 v0.6.28 拆分方案）；
 *   2. `marketService` 由调用方注入（`getPluginMarketService` 是全局单例，
 *      WebSocket 段也持同一实例用于广播安装进度）—— 两个回调
 *      （安装后自动 load / 卸载时自动 unload）是**市场与 PluginManager 的接合点**，
 *      随本模块注册，不要漏掉；
 *   3. `/api/plugins/load` 有**路径安全检查**（插件必须位于 ~/.easyagent/plugins 内）；
 *   4. `GET /api/plugins` 会用 installed.json 反查补全 `id`（owner/repo 形式），
 *      前端卸载依赖这一行为；
 *   5. 自定义技能的磁盘存储（`loadCustomSkills` / `saveCustomSkills`）随本模块迁入，
 *      存储路径固定为 `~/.easyagent/data/custom-skills.json`。
 *
 * @module routes/plugins
 */

import type { Express } from 'express';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import { BUILTIN_SKILLS, getSkillByName, logger } from '@easyagent/core';
import type { PluginManager, ToolRegistry, ConfigManager } from '@easyagent/core';
import type { PluginMarketService } from '../services/PluginMarketService.js';

// ===================== 自定义技能存储（随拆分自 index.ts 迁入） =====================

const CUSTOM_SKILLS_DIR = join(homedir(), '.easyagent', 'data');
const CUSTOM_SKILLS_PATH = join(CUSTOM_SKILLS_DIR, 'custom-skills.json');

/** 自定义技能接口 */
interface CustomSkill {
  name: string;
  description: string;
  prompt?: string;
  tags?: string[];
  requiresConfirm?: boolean;
}

/** 从磁盘加载自定义技能 */
function loadCustomSkills(): CustomSkill[] {
  try {
    if (!existsSync(CUSTOM_SKILLS_PATH)) return [];
    const raw = readFileSync(CUSTOM_SKILLS_PATH, 'utf-8');
    return JSON.parse(raw) as CustomSkill[];
  } catch (err) {
    logger.warn({ error: (err as Error).message }, '加载自定义技能失败，返回空列表');
    return [];
  }
}

/** 保存自定义技能到磁盘 */
function saveCustomSkills(skills: CustomSkill[]): void {
  if (!existsSync(CUSTOM_SKILLS_DIR)) {
    mkdirSync(CUSTOM_SKILLS_DIR, { recursive: true });
  }
  writeFileSync(CUSTOM_SKILLS_PATH, JSON.stringify(skills, null, 2), 'utf-8');
}

// ===================== 路由依赖 =====================

/** 插件/技能/工具路由依赖 */
export interface PluginRoutesDeps {
  pluginManager: PluginManager;
  toolRegistry: ToolRegistry;
  configManager: ConfigManager;
  /** 插件目录（~/.easyagent/plugins），路径安全检查的基准 */
  pluginsDir: string;
  /** 插件市场服务（全局单例，由调用方注入；WebSocket 段持同一实例广播进度） */
  marketService: PluginMarketService;
}

/**
 * 注册插件 / 技能 / 工具路由
 *
 * @param app - Express 应用
 * @param deps - 显式注入的依赖
 */
export function registerPluginRoutes(app: Express, deps: PluginRoutesDeps): void {
  const { pluginManager, toolRegistry, configManager, pluginsDir, marketService } = deps;

  /** 合并所有可用技能并标记激活状态 */
  function getAllSkillsWithStatus(): Array<{
    name: string;
    description: string;
    prompt?: string;
    tags?: string[];
    requiresConfirm?: boolean;
    source: 'builtin' | 'plugin' | 'custom';
    activated: boolean;
  }> {
    const custom = loadCustomSkills();
    const activeNames = pluginManager.getActiveSkillNames();

    function getSkillWithStatus<
      T extends {
        name: string;
        description: string;
        prompt?: string;
        tags?: string[];
        requiresConfirm?: boolean;
      },
    >(skill: T, source: 'builtin' | 'plugin' | 'custom') {
      return {
        name: skill.name,
        description: skill.description,
        prompt: skill.prompt,
        tags: skill.tags,
        requiresConfirm: skill.requiresConfirm,
        source,
        activated: activeNames.includes(skill.name),
      };
    }

    return [
      ...BUILTIN_SKILLS.map((s) => getSkillWithStatus(s, 'builtin')),
      ...pluginManager.getSkills().map((s) => getSkillWithStatus(s, 'plugin')),
      ...custom.map((s) => getSkillWithStatus(s, 'custom')),
    ];
  }

  /** 获取插件列表 */
  app.get('/api/plugins', (_req, res) => {
    // 根据 sourcePath 反查 installed.json 补全 id（owner/repo 形式）
    // 这样前端卸载时能拿到正确的 pluginId，而不是用 local:<name> 兜底
    const installed = marketService.getInstalledPlugins();
    const installedByPath = new Map<
      string,
      { id: string; version: string; installedAt: string; source: string }
    >();
    const installedByName = new Map<
      string,
      { id: string; version: string; installedAt: string; source: string }
    >();
    for (const p of installed) {
      // 用 sourcePath 末尾目录名匹配
      const segs = p.localPath.split(/[/\\]/);
      const dirName = segs[segs.length - 1] || '';
      if (dirName) installedByPath.set(dirName, p);
      if (p.name) installedByName.set(p.name, p);
    }

    const plugins = pluginManager.listPlugins().map((p) => {
      // 用 sourcePath basename 优先匹配，再退到 plugin.name
      const segs = (p.sourcePath || '').split(/[/\\]/);
      const dirName = segs[segs.length - 1] || '';
      const matched = installedByPath.get(dirName) || installedByName.get(p.plugin.name);
      return {
        id: matched?.id || `local:${p.plugin.name}`,
        name: p.plugin.name,
        version: p.plugin.version,
        description: p.plugin.description,
        author: p.plugin.author,
        enabled: p.enabled,
        sourcePath: p.sourcePath,
        loadedAt: p.loadedAt,
        installedAt: matched?.installedAt,
        source: matched?.source || 'local',
        error: p.error,
      };
    });
    res.json(plugins);
  });

  /** 加载插件 */
  app.post('/api/plugins/load', async (req, res) => {
    try {
      const { path: pluginPath } = req.body;
      if (!pluginPath) {
        return res.status(400).json({ error: '缺少 path 参数' });
      }
      // 安全检查：插件路径必须限定在用户插件目录内
      const resolvedPluginPath = resolve(pluginPath);
      if (!resolvedPluginPath.startsWith(pluginsDir)) {
        return res.status(403).json({ error: '安全限制: 插件必须位于 .easyagent/plugins 目录内' });
      }
      const plugin = await pluginManager.loadPlugin(resolvedPluginPath);
      res.json({
        name: plugin.name,
        version: plugin.version,
        description: plugin.description,
      });
    } catch (error) {
      res.status(500).json({ error: (error as Error).message });
    }
  });

  /** 启用/禁用插件 */
  app.post('/api/plugins/:name/toggle', async (req, res) => {
    try {
      const { name } = req.params;
      const { enabled } = req.body;
      if (enabled) {
        await pluginManager.enablePlugin(name);
      } else {
        await pluginManager.disablePlugin(name);
      }
      res.json({ name, enabled });
    } catch (error) {
      res.status(500).json({ error: (error as Error).message });
    }
  });

  /** 卸载插件 */
  app.delete('/api/plugins/:name', async (req, res) => {
    try {
      await pluginManager.unloadPlugin(req.params.name);
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: (error as Error).message });
    }
  });

  // ===================== 插件市场 =====================

  // 安装完成后自动注册到 PluginManager
  marketService.setPluginLoadCallback(async (pluginDir: string) => {
    try {
      await pluginManager.loadPlugin(pluginDir);
      logger.info(`[Plugins] 已自动加载第三方插件: ${pluginDir}`);
    } catch (err) {
      logger.error(`[Plugins] 自动加载插件失败 ${pluginDir}: ${(err as Error).message}`);
    }
  });

  // 卸载时从 PluginManager 移除
  marketService.setPluginUnloadCallback(async (nameOrId: string) => {
    try {
      const actualName = await pluginManager.unloadPlugin(nameOrId);
      logger.info(
        `[Plugins] 已从 PluginManager 卸载: ${nameOrId}${actualName ? ` (实际 name: ${actualName})` : ''}`,
      );
      return actualName;
    } catch (err) {
      logger.warn(`[Plugins] 从 PluginManager 卸载失败 ${nameOrId}: ${(err as Error).message}`);
      return null;
    }
  });

  /** 获取插件市场列表 */
  app.get('/api/plugins/market', async (req, res) => {
    try {
      const forceRefresh = req.query.refresh === 'true';
      const plugins = await marketService.listMarket(forceRefresh);
      res.json(plugins);
    } catch (error) {
      res.status(500).json({ error: (error as Error).message });
    }
  });

  /** 强制刷新插件市场缓存（清除磁盘 + 内存缓存，下次 GET /api/plugins/market 将重新拉取） */
  app.post('/api/plugins/market/refresh', (_req, res) => {
    try {
      marketService.clearMarketCache();
      res.json({
        success: true,
        message: '市场缓存已清除，请重新请求 /api/plugins/market?refresh=true 获取最新数据',
      });
    } catch (error) {
      res.status(500).json({ error: (error as Error).message });
    }
  });

  /** 获取插件详情 + README */
  app.get('/api/plugins/market/:id', async (req, res) => {
    try {
      const pluginId = decodeURIComponent(req.params.id);
      const detail = await marketService.getPluginDetail(pluginId);
      res.json(detail);
    } catch (error) {
      res.status(500).json({ error: (error as Error).message });
    }
  });

  /** 安装插件 */
  app.post('/api/plugins/install', async (req, res) => {
    try {
      const { pluginId, version } = req.body;
      if (!pluginId) {
        return res.status(400).json({ error: '缺少 pluginId 参数' });
      }
      const jobId = await marketService.installPlugin(pluginId, version);
      res.json({ jobId });
    } catch (error) {
      res.status(500).json({ error: (error as Error).message });
    }
  });

  /** 查询安装进度 */
  app.get('/api/plugins/install/:jobId', (req, res) => {
    const job = marketService.getInstallProgress(req.params.jobId);
    if (!job) {
      return res.status(404).json({ error: '安装任务不存在' });
    }
    res.json(job);
  });

  /** 卸载插件（市场安装的插件） */
  app.post('/api/plugins/uninstall/:id', async (req, res) => {
    try {
      const pluginId = decodeURIComponent(req.params.id);
      await marketService.uninstallPlugin(pluginId);
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: (error as Error).message });
    }
  });

  /** 检查插件更新 */
  app.post('/api/plugins/update-check', async (_req, res) => {
    try {
      const updates = await marketService.checkAllUpdates();
      // 转换为数组格式便于前端消费
      const result = Array.from(updates.entries()).map(([id, latestVersion]) => ({
        id,
        latestVersion,
        hasUpdate: latestVersion !== null,
      }));
      res.json({ updates: result });
    } catch (error) {
      res.status(500).json({ error: (error as Error).message });
    }
  });

  /** 安全模式 */
  app.post('/api/plugins/safe-mode', (req, res) => {
    // 安全模式状态由前端管理，后端提供切换端点
    const { enabled } = req.body;
    // 存储到内存或文件
    res.json({ safeMode: enabled });
  });

  // ===================== 技能 =====================

  /** 获取技能列表（含激活状态和自定义技能） */
  app.get('/api/skills', (_req, res) => {
    res.json(getAllSkillsWithStatus());
  });

  /** 激活技能 */
  app.post('/api/skills/:name/activate', async (req, res) => {
    try {
      const { name } = req.params;

      // 查找技能
      let skill = getSkillByName(name) || pluginManager.getSkill(name);
      // 在自定义技能中查找
      if (!skill) {
        const custom = loadCustomSkills().find((s) => s.name === name);
        if (custom) skill = custom as unknown as typeof skill;
      }

      if (!skill) {
        res.status(404).json({ error: `技能 "${name}" 不存在` });
        return;
      }

      // 调用技能的 onActivate 回调（如果有）
      let enhancedContext = null;
      if (skill.onActivate) {
        const context = {
          availableTools: toolRegistry.list(),
          config: configManager.getAll(),
        };
        enhancedContext = await skill.onActivate(context);
      }

      // 记录激活状态
      pluginManager.activateUserSkill(name);
      logger.info({ skill: name }, '技能已激活');
      res.json({
        success: true,
        skill: {
          name: skill.name,
          description: skill.description,
          prompt: skill.prompt,
        },
        enhancedContext,
      });
    } catch (error) {
      logger.error({ skill: req.params.name, error }, '激活技能失败');
      res.status(500).json({ error: (error as Error).message });
    }
  });

  /** 停用技能 */
  app.post('/api/skills/:name/deactivate', (req, res) => {
    const { name } = req.params;
    const removed = pluginManager.deactivateUserSkill(name);
    if (removed) {
      res.json({ success: true, message: `技能 "${name}" 已停用` });
    } else {
      res.status(404).json({ error: `技能 "${name}" 未被激活` });
    }
  });

  // ===================== 自定义技能 CRUD =====================

  /** 添加自定义技能 */
  app.post('/api/skills/custom', (req, res) => {
    try {
      const { name, description, prompt, tags, requiresConfirm } = req.body;
      if (!name || !description) {
        res.status(400).json({ error: '技能名称和描述不能为空' });
        return;
      }

      const skills = loadCustomSkills();
      if (skills.find((s) => s.name === name)) {
        res.status(409).json({ error: `技能 "${name}" 已存在` });
        return;
      }

      // 检查不与内置/插件技能冲突
      if (getSkillByName(name) || pluginManager.getSkill(name)) {
        res.status(409).json({ error: `技能 "${name}" 与内置或插件技能冲突` });
        return;
      }

      const newSkill: CustomSkill = { name, description, prompt, tags, requiresConfirm };
      skills.push(newSkill);
      saveCustomSkills(skills);
      logger.info({ skill: name }, '自定义技能已添加');
      res.json({ success: true, skill: { ...newSkill, source: 'custom', activated: false } });
    } catch (error) {
      logger.error({ error }, '添加自定义技能失败');
      res.status(500).json({ error: (error as Error).message });
    }
  });

  /** 删除自定义技能 */
  app.delete('/api/skills/custom/:name', (req, res) => {
    const { name } = req.params;
    const skills = loadCustomSkills();
    const index = skills.findIndex((s) => s.name === name);
    if (index === -1) {
      res.status(404).json({ error: `自定义技能 "${name}" 不存在` });
      return;
    }
    skills.splice(index, 1);
    saveCustomSkills(skills);
    // 同时取消激活状态
    pluginManager.deactivateUserSkill(name);
    logger.info({ skill: name }, '自定义技能已删除');
    res.json({ success: true });
  });

  /** 更新自定义技能 */
  app.put('/api/skills/custom/:name', (req, res) => {
    const { name } = req.params;
    const skills = loadCustomSkills();
    const index = skills.findIndex((s) => s.name === name);
    if (index === -1) {
      res.status(404).json({ error: `自定义技能 "${name}" 不存在` });
      return;
    }
    skills[index] = { ...skills[index], ...req.body, name: skills[index].name };
    saveCustomSkills(skills);
    logger.info({ skill: name }, '自定义技能已更新');
    res.json({
      success: true,
      skill: { ...skills[index], source: 'custom', activated: pluginManager.isSkillActive(name) },
    });
  });

  // ===================== 工具 =====================

  /** 获取工具列表（分组信息由工具自身定义，启用状态来自持久化配置） */
  app.get('/api/tools', (_req, res) => {
    const tools = toolRegistry.list().map((t) => ({
      ...t,
      // group 由 getAllBuiltinTools() 自动标注，无需手动映射
      group: t.group || 'other',
      requiresConfirm: t.name === 'delete_file' || t.name === 'exec',
      builtin: true,
      // enabled 来自 ToolRegistry 的真实运行时状态
      enabled: t.enabled,
    }));
    res.json(tools);
  });

  /** 切换工具的启用/禁用状态 */
  app.post('/api/tools/:name', (req, res) => {
    const { name } = req.params;
    const { enabled } = req.body;
    if (typeof enabled !== 'boolean') {
      return res.status(400).json({ error: '缺少 enabled 参数 (true/false)' });
    }
    const ok = toolRegistry.setEnabled(name, enabled);
    if (!ok) {
      return res.status(404).json({ error: `工具 "${name}" 不存在` });
    }
    // 持久化禁用列表
    configManager.saveDisabledToolNames(toolRegistry.getDisabledNames());
    logger.info({ tool: name, enabled }, '工具状态已切换');
    res.json({ success: true, name, enabled });
  });
}
