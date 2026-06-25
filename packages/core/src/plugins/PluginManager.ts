/**
 * 插件管理器
 * 负责插件的生命周期管理：加载、启用、禁用、卸载
 *
 * 支持两种加载模式：
 * - unsafe: 直接 import() 到主进程（仅用于内置技能，无隔离）
 * - sandbox: worker_threads 隔离（面向第三方插件，安全第一）
 *
 * 加载模式自动选择逻辑：
 * - 插件目录下存在 manifest.json → sandbox 模式
 * - 否则 → unsafe 模式（向后兼容内置技能）
 * - 可通过 loadPluginSafe() 强制使用沙箱
 */
import { EventEmitter } from 'events';
import { existsSync, readFileSync, statSync } from 'fs';
import { join, resolve, dirname } from 'path';
import { logger } from '../utils/logger.js';
import type {
  IPlugin,
  IPluginContext,
  IPluginHook,
  ISkill,
  LoadedPlugin,
  PluginManagerConfig,
  HookContext,
  HookEvent,
  PluginLoadMode,
} from './types.js';
import type { ITool } from '../tools/ToolRegistry.js';
import { ToolRegistry } from '../tools/ToolRegistry.js';
import { loadManifest } from './PluginManifest.js';
import type { PluginPermissions } from './PluginPermission.js';
import { checkPermissions, getDangerousPermissions } from './PluginPermission.js';
import { PluginSandbox } from './PluginSandbox.js';

/** 插件管理器事件 */
interface PluginManagerEvents {
  pluginLoaded: [name: string];
  pluginUnloaded: [name: string];
  pluginError: [name: string, error: Error];
  hookTriggered: [event: HookEvent, context: HookContext];
  sandboxReady: [name: string];
  sandboxError: [name: string, error: Error];
}

/**
 * 插件管理器
 * 单例模式，全局管理所有插件的加载和执行
 */
export class PluginManager extends EventEmitter<PluginManagerEvents> {
  /** 已加载的插件 Map<name, LoadedPlugin> */
  private plugins: Map<string, LoadedPlugin> = new Map();
  /** 已注册的钩子 (按事件分组) */
  private hooks: Map<HookEvent, IPluginHook[]> = new Map();
  /** 已激活的技能 (插件注册时自动加入) */
  private activeSkills: Map<string, ISkill> = new Map();
  /** 用户手动激活的技能名集合 (含内置技能) */
  private userActivatedSkills: Set<string> = new Set();
  /** 关联的 ToolRegistry */
  private toolRegistry: ToolRegistry | null = null;
  /** 配置 */
  private config: PluginManagerConfig;
  /** 沙箱实例 Map<pluginName, PluginSandbox>（仅 sandbox 模式） */
  private sandboxes: Map<string, PluginSandbox> = new Map();
  /** 插件加载模式记录 Map<pluginName, PluginLoadMode> */
  private loadModeMap: Map<string, PluginLoadMode> = new Map();

  constructor(config: PluginManagerConfig = {}) {
    super();
    this.config = {
      hotReload: false,
      disabledPlugins: [],
      extraPluginPaths: [],
      sandbox: { enabled: true, toolTimeout: 30000 },
      ...config,
    };
  }

  /**
   * 绑定 ToolRegistry，用于自动注册插件工具
   */
  setToolRegistry(registry: ToolRegistry): void {
    this.toolRegistry = registry;
  }

  /**
   * 加载单个插件（自动选择 unsafe/sandbox 模式）
   *
   * 模式选择逻辑：
   * - 目录下存在 manifest.json → sandbox 模式（安全隔离）
   * - 否则 → unsafe 模式（直接 import()，向后兼容）
   *
   * @param pluginPath 插件目录或 .js 文件路径
   * @param options.forceMode 强制使用指定加载模式
   * @returns 插件实例（unsafe 模式返回真实实例，sandbox 模式返回包装对象）
   */
  async loadPlugin(
    pluginPath: string,
    options?: { forceMode?: PluginLoadMode }
  ): Promise<IPlugin> {
    const resolvedPath = resolve(pluginPath);
    logger.info({ path: resolvedPath }, '加载插件');

    try {
      // 判断目录
      const isDir = statSync(resolvedPath).isDirectory();

      // 自动检测模式
      let mode: PluginLoadMode;
      if (options?.forceMode) {
        mode = options.forceMode;
      } else if (isDir && existsSync(join(resolvedPath, 'manifest.json'))) {
        mode = 'sandbox';
      } else {
        mode = 'unsafe';
      }

      logger.info({ path: resolvedPath, mode }, '插件加载模式');

      if (mode === 'sandbox') {
        return this.loadPluginWithSandbox(resolvedPath);
      }
      return this.loadPluginUnsafe(resolvedPath);
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      logger.error({ path: resolvedPath, error: err.message }, '插件加载失败');
      this.emit('pluginError', resolvedPath, err);
      throw err;
    }
  }

  /**
   * 使用沙箱模式加载插件（安全）
   * 插件在 worker_threads 中运行，与主进程隔离
   *
   * @param pluginDir 插件根目录
   * @returns 包装后的插件对象
   */
  async loadPluginSafe(pluginDir: string): Promise<IPlugin> {
    const resolvedDir = resolve(pluginDir);
    if (!statSync(resolvedDir).isDirectory()) {
      throw new Error(`插件路径必须是目录: ${resolvedDir}`);
    }
    return this.loadPluginWithSandbox(resolvedDir);
  }

  /**
   * 沙箱模式内部实现
   */
  private async loadPluginWithSandbox(pluginDir: string): Promise<IPlugin> {
    // 1. 验证 manifest
    const validation = loadManifest(pluginDir);
    if (!validation.valid) {
      const errors = validation.errors.join('; ');
      throw new Error(`插件 Manifest 验证失败: ${errors}`);
    }
    const manifest = validation.manifest!;

    // 2. 权限检查
    let allowedPermissions = manifest.permissions;
    // 检查危险权限并记录警告
    if (manifest.permissions) {
      const dangerous = getDangerousPermissions(manifest.permissions);
      for (const d of dangerous) {
        logger.warn(
          { plugin: manifest.name, permission: d.key },
          `危险权限: ${d.warning}`
        );
      }

      // 如果没有声明权限，默认使用只读
      allowedPermissions = manifest.permissions;
    }

    // 3. 检查是否已加载
    const existingSandbox = this.sandboxes.get(manifest.name);
    if (existingSandbox) {
      logger.warn({ plugin: manifest.name }, '插件沙箱已存在，将先关闭旧沙箱');
      await this.unloadPlugin(manifest.name);
    }

    // 4. 检查依赖
    if (manifest.dependencies) {
      for (const dep of manifest.dependencies) {
        if (!this.plugins.has(dep)) {
          throw new Error(`插件 ${manifest.name} 依赖 ${dep}，但 ${dep} 未加载`);
        }
      }
    }

    // 5. 创建沙箱并启动
    const sandbox = new PluginSandbox({
      manifest,
      pluginDir,
      allowedPermissions,
      toolTimeout: this.config.sandbox?.toolTimeout || 30000,
      resourceLimits: this.config.sandbox?.resourceLimits,
    });

    const initResult = await sandbox.start();
    this.sandboxes.set(manifest.name, sandbox);
    this.loadModeMap.set(manifest.name, 'sandbox');
    this.emit('sandboxReady', manifest.name);

    // 6. 获取工具并注册到 ToolRegistry
    const tools = await sandbox.getTools();
    if (tools.length > 0 && this.toolRegistry) {
      for (const tool of tools) {
        this.toolRegistry.register(tool);
      }
      logger.info({ plugin: manifest.name, count: tools.length }, '沙箱插件工具已注册');
    }

    // 7. 获取技能并注册
    const skills = await sandbox.getSkills();
    for (const skill of skills as ISkill[]) {
      this.activeSkills.set(skill.name, skill);
    }
    if (skills.length > 0) {
      logger.info({ plugin: manifest.name, count: skills.length }, '沙箱插件技能已注册');
    }

    // 8. 构造包装插件对象（实现 IPlugin 接口）
    const pluginWrapper: IPlugin = {
      name: manifest.name,
      version: manifest.version,
      description: manifest.description,
      author: manifest.author,
      dependencies: manifest.dependencies,
      getTools: () => tools,
      getSkills: () => skills as ISkill[],
      async unregister() {
        await sandbox.shutdown();
      },
    };

    // 9. 记录加载状态
    const loadedPlugin: LoadedPlugin = {
      plugin: pluginWrapper,
      sourcePath: pluginDir,
      enabled: true,
      loadedAt: Date.now(),
    };
    this.plugins.set(manifest.name, loadedPlugin);

    this.emit('pluginLoaded', manifest.name);
    logger.info(
      { plugin: manifest.name, version: manifest.version, mode: 'sandbox' },
      '插件(沙箱)加载成功'
    );

    return pluginWrapper;
  }

  /**
   * 不安全模式加载插件（向后兼容）
   * 直接 import() 到主进程，用于内置技能和可信插件
   */
  private async loadPluginUnsafe(resolvedPath: string): Promise<IPlugin> {
    // 判断是目录还是文件
    let entryPath: string;
    if (statSync(resolvedPath).isDirectory()) {
      const candidates = [
        join(resolvedPath, 'plugin.js'),
        join(resolvedPath, 'plugin.mjs'),
        join(resolvedPath, 'index.js'),
        join(resolvedPath, 'index.mjs'),
      ];
      entryPath = candidates.find((p) => existsSync(p)) || '';
      if (!entryPath) {
        throw new Error(`插件目录缺少入口文件: ${resolvedPath}`);
      }
    } else {
      entryPath = resolvedPath;
    }

    // 动态导入插件模块
    const module = await import(`file://${entryPath}`);
    const plugin: IPlugin = module.default || module.plugin || module;

    if (!plugin || !plugin.name) {
      throw new Error('插件必须导出 name 属性');
    }

    // 检查是否已加载
    if (this.plugins.has(plugin.name)) {
      logger.warn({ plugin: plugin.name }, '插件已加载，将先卸载旧版本');
      await this.unloadPlugin(plugin.name);
    }

    // 检查依赖
    if (plugin.dependencies) {
      for (const dep of plugin.dependencies) {
        if (!this.plugins.has(dep)) {
          throw new Error(`插件 ${plugin.name} 依赖 ${dep}，但 ${dep} 未加载`);
        }
      }
    }

    // 创建插件上下文
    const context = this.createPluginContext(plugin.name);

    // 调用 register
    if (plugin.register) {
      await plugin.register(context);
    }

    // 注册工具、技能、钩子
    await this.registerToolsAndSkillsAndHooks(plugin);

    // 记录加载状态
    const loadedPlugin: LoadedPlugin = {
      plugin,
      sourcePath: resolvedPath,
      enabled: true,
      loadedAt: Date.now(),
    };
    this.plugins.set(plugin.name, loadedPlugin);
    this.loadModeMap.set(plugin.name, 'unsafe');

    this.emit('pluginLoaded', plugin.name);
    logger.info(
      { plugin: plugin.name, version: plugin.version },
      '插件加载成功'
    );

    return plugin;
  }

  /**
   * 注册插件的工具、技能和钩子（复用逻辑）
   */
  private async registerToolsAndSkillsAndHooks(plugin: IPlugin): Promise<void> {
    // 注册工具
    if (plugin.getTools && this.toolRegistry) {
      const tools = plugin.getTools();
      for (const tool of tools) {
        this.toolRegistry.register(tool);
      }
      logger.info({ plugin: plugin.name, count: tools.length }, '插件工具已注册');
    }

    // 注册技能
    if (plugin.getSkills) {
      const skills = plugin.getSkills();
      for (const skill of skills) {
        this.activeSkills.set(skill.name, skill);
        if (skill.tools && this.toolRegistry) {
          for (const tool of skill.tools) {
            this.toolRegistry.register(tool);
          }
        }
      }
      logger.info({ plugin: plugin.name, count: skills.length }, '插件技能已注册');
    }

    // 注册钩子
    if (plugin.getHooks) {
      const pluginHooks = plugin.getHooks();
      for (const hook of pluginHooks) {
        this.registerHook(hook);
      }
      logger.info({ plugin: plugin.name, count: pluginHooks.length }, '插件钩子已注册');
    }
  }

  /**
   * 获取插件的加载模式
   */
  getLoadMode(name: string): PluginLoadMode | undefined {
    return this.loadModeMap.get(name);
  }

  /**
   * 从目录批量加载插件
   */
  async loadPluginsFromDir(dirPath: string): Promise<IPlugin[]> {
    const { readdirSync } = await import('fs');
    const resolvedDir = resolve(dirPath);

    if (!existsSync(resolvedDir)) {
      logger.warn({ dir: resolvedDir }, '插件目录不存在，跳过');
      return [];
    }

    const entries = readdirSync(resolvedDir, { withFileTypes: true });
    const plugins: IPlugin[] = [];

    for (const entry of entries) {
      if (!entry.isDirectory() || entry.name.startsWith('.')) continue;

      const pluginPath = join(resolvedDir, entry.name);
      try {
        const plugin = await this.loadPlugin(pluginPath);
        plugins.push(plugin);
      } catch (error) {
        logger.warn({ plugin: entry.name }, '跳过加载失败的插件');
      }
    }

    return plugins;
  }

  /**
   * 初始化：加载所有内置插件和用户插件
   */
  async initialize(): Promise<void> {
    logger.info('开始初始化插件系统');

    // 加载内置插件
    if (this.config.builtinPluginsDir) {
      await this.loadPluginsFromDir(this.config.builtinPluginsDir);
    }

    // 加载用户插件
    if (this.config.userPluginsDir) {
      await this.loadPluginsFromDir(this.config.userPluginsDir);
    }

    // 加载额外路径
    if (this.config.extraPluginPaths) {
      for (const extraPath of this.config.extraPluginPaths) {
        if (existsSync(extraPath)) {
          try {
            await this.loadPlugin(extraPath);
          } catch (error) {
            logger.warn({ path: extraPath }, '额外路径插件加载失败');
          }
        }
      }
    }

    // 禁用指定插件
    if (this.config.disabledPlugins) {
      for (const name of this.config.disabledPlugins) {
        await this.disablePlugin(name);
      }
    }

    const count = this.plugins.size;
    logger.info({ count }, '插件系统初始化完成');
  }

  /**
   * 卸载插件（同时关闭对应的沙箱）
   */
  async unloadPlugin(name: string): Promise<void> {
    const loaded = this.plugins.get(name);
    if (!loaded) {
      logger.warn({ plugin: name }, '插件未加载，无法卸载');
      return;
    }

    // 如果使用沙箱模式，先关闭沙箱
    const sandbox = this.sandboxes.get(name);
    if (sandbox) {
      try {
        await sandbox.shutdown();
      } catch (error) {
        logger.warn({ plugin: name, error }, '沙箱关闭失败');
      }
      this.sandboxes.delete(name);
    }

    // 调用 unregister
    if (loaded.plugin.unregister) {
      try {
        await loaded.plugin.unregister();
      } catch (error) {
        logger.warn({ plugin: name, error }, '插件卸载回调出错');
      }
    }

    // 注销工具
    if (loaded.plugin.getTools && this.toolRegistry) {
      const tools = loaded.plugin.getTools();
      for (const tool of tools) {
        this.toolRegistry.unregister(tool.name);
      }
    }

    // 注销技能的工具
    if (loaded.plugin.getSkills) {
      const skills = loaded.plugin.getSkills();
      for (const skill of skills) {
        this.activeSkills.delete(skill.name);
        if (skill.tools && this.toolRegistry) {
          for (const tool of skill.tools) {
            this.toolRegistry.unregister(tool.name);
          }
        }
      }
    }

    // 注销钩子
    if (loaded.plugin.getHooks) {
      const pluginHooks = loaded.plugin.getHooks();
      for (const hook of pluginHooks) {
        this.unregisterHook(hook);
      }
    }

    this.plugins.delete(name);
    this.loadModeMap.delete(name);
    this.emit('pluginUnloaded', name);
    logger.info({ plugin: name }, '插件已卸载');
  }

  /**
   * 获取沙箱中的插件
   */
  getSandbox(name: string): PluginSandbox | undefined {
    return this.sandboxes.get(name);
  }

  /**
   * 禁用插件
   */
  async disablePlugin(name: string): Promise<void> {
    const loaded = this.plugins.get(name);
    if (!loaded) return;
    loaded.enabled = false;
    logger.info({ plugin: name }, '插件已禁用');
  }

  /**
   * 启用插件
   */
  async enablePlugin(name: string): Promise<void> {
    const loaded = this.plugins.get(name);
    if (!loaded) {
      throw new Error(`插件 ${name} 未加载`);
    }
    loaded.enabled = true;
    logger.info({ plugin: name }, '插件已启用');
  }

  /**
   * 获取插件
   */
  getPlugin(name: string): LoadedPlugin | undefined {
    return this.plugins.get(name);
  }

  /**
   * 列出所有插件
   */
  listPlugins(): LoadedPlugin[] {
    return Array.from(this.plugins.values());
  }

  /**
   * 获取启用的插件
   */
  getEnabledPlugins(): LoadedPlugin[] {
    return this.listPlugins().filter((p) => p.enabled);
  }

  /**
   * 获取所有技能
   */
  getSkills(): ISkill[] {
    return Array.from(this.activeSkills.values());
  }

  /**
   * 获取指定名称的技能
   */
  getSkill(name: string): ISkill | undefined {
    return this.activeSkills.get(name);
  }

  /**
   * 用户激活一个技能
   */
  activateUserSkill(name: string): boolean {
    this.userActivatedSkills.add(name);
    logger.info({ skill: name }, '用户激活技能');
    return true;
  }

  /**
   * 用户停用一个技能
   */
  deactivateUserSkill(name: string): boolean {
    const removed = this.userActivatedSkills.delete(name);
    if (removed) {
      logger.info({ skill: name }, '用户停用技能');
    }
    return removed;
  }

  /**
   * 检查技能是否已被用户激活
   */
  isSkillActive(name: string): boolean {
    return this.userActivatedSkills.has(name);
  }

  /**
   * 获取所有用户已激活的技能名列表
   */
  getActiveSkillNames(): string[] {
    return Array.from(this.userActivatedSkills);
  }

  /**
   * 触发钩子事件
   * @param event 事件类型
   * @param context 事件上下文
   * @returns 修改后的上下文
   */
  async triggerHook(event: HookEvent, context: HookContext): Promise<HookContext> {
    const hooks = this.hooks.get(event) || [];

    // 按优先级排序
    const sorted = [...hooks].sort(
      (a, b) => (a.priority ?? 100) - (b.priority ?? 100)
    );

    let currentContext = { ...context };
    for (const hook of sorted) {
      try {
        const plugin = this.findPluginByHook(hook);
        if (plugin && !plugin.enabled) continue;

        currentContext = await hook.handler(currentContext);
        if (currentContext.preventDefault) break;
      } catch (error) {
        logger.error(
          { event, error: (error as Error).message },
          '钩子执行失败'
        );
      }
    }

    this.emit('hookTriggered', event, currentContext);
    return currentContext;
  }

  /**
   * 销毁插件管理器（清理所有插件和沙箱）
   */
  async destroy(): Promise<void> {
    // 先关闭所有沙箱
    for (const [name, sandbox] of this.sandboxes) {
      try {
        await sandbox.shutdown();
      } catch (error) {
        logger.warn({ plugin: name, error }, '销毁时沙箱关闭失败');
      }
    }
    this.sandboxes.clear();
    this.loadModeMap.clear();

    // 卸载所有插件
    for (const [name] of this.plugins) {
      await this.unloadPlugin(name);
    }
    this.removeAllListeners();
    logger.info('插件管理器已销毁');
  }

  // ===================== 私有方法 =====================

  /**
   * 注册钩子
   */
  private registerHook(hook: IPluginHook): void {
    const existing = this.hooks.get(hook.event) || [];
    existing.push(hook);
    this.hooks.set(hook.event, existing);
  }

  /**
   * 注销钩子
   */
  private unregisterHook(hook: IPluginHook): void {
    const existing = this.hooks.get(hook.event) || [];
    this.hooks.set(
      hook.event,
      existing.filter((h) => h !== hook)
    );
  }

  /**
   * 查找钩子所属的插件
   */
  private findPluginByHook(hook: IPluginHook): LoadedPlugin | undefined {
    for (const [, loaded] of this.plugins) {
      if (loaded.plugin.getHooks) {
        const hooks = loaded.plugin.getHooks();
        if (hooks.includes(hook)) return loaded;
      }
    }
    return undefined;
  }

  /**
   * 创建插件上下文
   */
  private createPluginContext(pluginName: string): IPluginContext {
    const registry = this.toolRegistry;
    return {
      registerTool(tool: ITool): void {
        if (registry) {
          registry.register(tool);
          logger.info({ plugin: pluginName, tool: tool.name }, '插件注册工具');
        }
      },
      registerTools(tools: ITool[]): void {
        if (registry) {
          registry.registerAll(tools);
          logger.info(
            { plugin: pluginName, count: tools.length },
            '插件批量注册工具'
          );
        }
      },
      getConfig(): Record<string, unknown> {
        return {};
      },
    };
  }
}

/**
 * 全局插件管理器单例
 */
let globalPluginManager: PluginManager | null = null;

/**
 * 获取全局插件管理器实例
 */
export function getPluginManager(config?: PluginManagerConfig): PluginManager {
  if (!globalPluginManager) {
    globalPluginManager = new PluginManager(config);
  }
  return globalPluginManager;
}

/**
 * 重置全局插件管理器（测试用）
 */
export function resetPluginManager(): void {
  globalPluginManager = null;
}
