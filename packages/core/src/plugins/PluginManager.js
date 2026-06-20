/**
 * 插件管理器
 * 负责插件的生命周期管理：加载、启用、禁用、卸载
 * 与 ToolRegistry 集成，自动注册/注销插件提供的工具
 */
import { EventEmitter } from 'events';
import { existsSync, statSync } from 'fs';
import { join, resolve } from 'path';
import { logger } from '../utils/logger.js';
/**
 * 插件管理器
 * 单例模式，全局管理所有插件的加载和执行
 */
export class PluginManager extends EventEmitter {
    /** 已加载的插件 Map<name, LoadedPlugin> */
    plugins = new Map();
    /** 已注册的钩子 (按事件分组) */
    hooks = new Map();
    /** 已激活的技能 */
    activeSkills = new Map();
    /** 用户手动激活的技能名集合 (含内置技能) */
    userActivatedSkills = new Set();
    /** 关联的 ToolRegistry */
    toolRegistry = null;
    /** 配置 */
    config;
    constructor(config = {}) {
        super();
        this.config = {
            hotReload: false,
            disabledPlugins: [],
            extraPluginPaths: [],
            ...config,
        };
    }
    /**
     * 绑定 ToolRegistry，用于自动注册插件工具
     */
    setToolRegistry(registry) {
        this.toolRegistry = registry;
    }
    /**
     * 加载单个插件（从文件路径）
     * @param pluginPath 插件目录或 .js 文件路径
     */
    async loadPlugin(pluginPath) {
        const resolvedPath = resolve(pluginPath);
        logger.info({ path: resolvedPath }, '加载插件');
        try {
            // 判断是目录还是文件
            let entryPath;
            if (statSync(resolvedPath).isDirectory()) {
                // 尝试加载 plugin.js 或 index.js
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
            }
            else {
                entryPath = resolvedPath;
            }
            // 动态导入插件模块
            const module = await import(`file://${entryPath}`);
            const plugin = module.default || module.plugin || module;
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
            // 注册插件提供的工具
            if (plugin.getTools && this.toolRegistry) {
                const tools = plugin.getTools();
                for (const tool of tools) {
                    this.toolRegistry.register(tool);
                }
                logger.info({ plugin: plugin.name, count: tools.length }, '插件工具已注册');
            }
            // 注册插件提供的技能
            if (plugin.getSkills) {
                const skills = plugin.getSkills();
                for (const skill of skills) {
                    this.activeSkills.set(skill.name, skill);
                    // 技能的工具也注册到全局
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
            // 记录加载状态
            const loadedPlugin = {
                plugin,
                sourcePath: resolvedPath,
                enabled: true,
                loadedAt: Date.now(),
            };
            this.plugins.set(plugin.name, loadedPlugin);
            this.emit('pluginLoaded', plugin.name);
            logger.info({ plugin: plugin.name, version: plugin.version }, '插件加载成功');
            return plugin;
        }
        catch (error) {
            const err = error instanceof Error ? error : new Error(String(error));
            logger.error({ path: resolvedPath, error: err.message }, '插件加载失败');
            this.emit('pluginError', resolvedPath, err);
            throw err;
        }
    }
    /**
     * 从目录批量加载插件
     */
    async loadPluginsFromDir(dirPath) {
        const { readdirSync } = await import('fs');
        const resolvedDir = resolve(dirPath);
        if (!existsSync(resolvedDir)) {
            logger.warn({ dir: resolvedDir }, '插件目录不存在，跳过');
            return [];
        }
        const entries = readdirSync(resolvedDir, { withFileTypes: true });
        const plugins = [];
        for (const entry of entries) {
            if (!entry.isDirectory() || entry.name.startsWith('.'))
                continue;
            const pluginPath = join(resolvedDir, entry.name);
            try {
                const plugin = await this.loadPlugin(pluginPath);
                plugins.push(plugin);
            }
            catch (error) {
                logger.warn({ plugin: entry.name }, '跳过加载失败的插件');
            }
        }
        return plugins;
    }
    /**
     * 初始化：加载所有内置插件和用户插件
     */
    async initialize() {
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
                    }
                    catch (error) {
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
     * 卸载插件
     */
    async unloadPlugin(name) {
        const loaded = this.plugins.get(name);
        if (!loaded) {
            logger.warn({ plugin: name }, '插件未加载，无法卸载');
            return;
        }
        // 调用 unregister
        if (loaded.plugin.unregister) {
            try {
                await loaded.plugin.unregister();
            }
            catch (error) {
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
        this.emit('pluginUnloaded', name);
        logger.info({ plugin: name }, '插件已卸载');
    }
    /**
     * 禁用插件
     */
    async disablePlugin(name) {
        const loaded = this.plugins.get(name);
        if (!loaded)
            return;
        loaded.enabled = false;
        logger.info({ plugin: name }, '插件已禁用');
    }
    /**
     * 启用插件
     */
    async enablePlugin(name) {
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
    getPlugin(name) {
        return this.plugins.get(name);
    }
    /**
     * 列出所有插件
     */
    listPlugins() {
        return Array.from(this.plugins.values());
    }
    /**
     * 获取启用的插件
     */
    getEnabledPlugins() {
        return this.listPlugins().filter((p) => p.enabled);
    }
    /**
     * 获取所有技能
     */
    getSkills() {
        return Array.from(this.activeSkills.values());
    }
    /**
     * 获取指定名称的技能
     */
    getSkill(name) {
        return this.activeSkills.get(name);
    }
    /**
     * 用户激活一个技能
     */
    activateUserSkill(name) {
        this.userActivatedSkills.add(name);
        logger.info({ skill: name }, '用户激活技能');
        return true;
    }
    /**
     * 用户停用一个技能
     */
    deactivateUserSkill(name) {
        const removed = this.userActivatedSkills.delete(name);
        if (removed) {
            logger.info({ skill: name }, '用户停用技能');
        }
        return removed;
    }
    /**
     * 检查技能是否已被用户激活
     */
    isSkillActive(name) {
        return this.userActivatedSkills.has(name);
    }
    /**
     * 获取所有用户已激活的技能名列表
     */
    getActiveSkillNames() {
        return Array.from(this.userActivatedSkills);
    }
    /**
     * 触发钩子事件
     * @param event 事件类型
     * @param context 事件上下文
     * @returns 修改后的上下文
     */
    async triggerHook(event, context) {
        const hooks = this.hooks.get(event) || [];
        // 按优先级排序
        const sorted = [...hooks].sort((a, b) => (a.priority ?? 100) - (b.priority ?? 100));
        let currentContext = { ...context };
        for (const hook of sorted) {
            try {
                const plugin = this.findPluginByHook(hook);
                if (plugin && !plugin.enabled)
                    continue;
                currentContext = await hook.handler(currentContext);
                if (currentContext.preventDefault)
                    break;
            }
            catch (error) {
                logger.error({ event, error: error.message }, '钩子执行失败');
            }
        }
        this.emit('hookTriggered', event, currentContext);
        return currentContext;
    }
    /**
     * 销毁插件管理器
     */
    async destroy() {
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
    registerHook(hook) {
        const existing = this.hooks.get(hook.event) || [];
        existing.push(hook);
        this.hooks.set(hook.event, existing);
    }
    /**
     * 注销钩子
     */
    unregisterHook(hook) {
        const existing = this.hooks.get(hook.event) || [];
        this.hooks.set(hook.event, existing.filter((h) => h !== hook));
    }
    /**
     * 查找钩子所属的插件
     */
    findPluginByHook(hook) {
        for (const [, loaded] of this.plugins) {
            if (loaded.plugin.getHooks) {
                const hooks = loaded.plugin.getHooks();
                if (hooks.includes(hook))
                    return loaded;
            }
        }
        return undefined;
    }
    /**
     * 创建插件上下文
     */
    createPluginContext(pluginName) {
        const registry = this.toolRegistry;
        return {
            registerTool(tool) {
                if (registry) {
                    registry.register(tool);
                    logger.info({ plugin: pluginName, tool: tool.name }, '插件注册工具');
                }
            },
            registerTools(tools) {
                if (registry) {
                    registry.registerAll(tools);
                    logger.info({ plugin: pluginName, count: tools.length }, '插件批量注册工具');
                }
            },
            getConfig() {
                return {};
            },
        };
    }
}
/**
 * 全局插件管理器单例
 */
let globalPluginManager = null;
/**
 * 获取全局插件管理器实例
 */
export function getPluginManager(config) {
    if (!globalPluginManager) {
        globalPluginManager = new PluginManager(config);
    }
    return globalPluginManager;
}
/**
 * 重置全局插件管理器（测试用）
 */
export function resetPluginManager() {
    globalPluginManager = null;
}
//# sourceMappingURL=PluginManager.js.map