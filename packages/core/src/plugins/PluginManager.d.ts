/// <reference types="node" />
/**
 * 插件管理器
 * 负责插件的生命周期管理：加载、启用、禁用、卸载
 * 与 ToolRegistry 集成，自动注册/注销插件提供的工具
 */
import { EventEmitter } from 'events';
import type { IPlugin, ISkill, LoadedPlugin, PluginManagerConfig, HookContext, HookEvent } from './types.js';
import { ToolRegistry } from '../tools/ToolRegistry.js';
/** 插件管理器事件 */
interface PluginManagerEvents {
    pluginLoaded: [name: string];
    pluginUnloaded: [name: string];
    pluginError: [name: string, error: Error];
    hookTriggered: [event: HookEvent, context: HookContext];
}
/**
 * 插件管理器
 * 单例模式，全局管理所有插件的加载和执行
 */
export declare class PluginManager extends EventEmitter<PluginManagerEvents> {
    /** 已加载的插件 Map<name, LoadedPlugin> */
    private plugins;
    /** 已注册的钩子 (按事件分组) */
    private hooks;
    /** 已激活的技能 */
    private activeSkills;
    /** 关联的 ToolRegistry */
    private toolRegistry;
    /** 配置 */
    private config;
    constructor(config?: PluginManagerConfig);
    /**
     * 绑定 ToolRegistry，用于自动注册插件工具
     */
    setToolRegistry(registry: ToolRegistry): void;
    /**
     * 加载单个插件（从文件路径）
     * @param pluginPath 插件目录或 .js 文件路径
     */
    loadPlugin(pluginPath: string): Promise<IPlugin>;
    /**
     * 从目录批量加载插件
     */
    loadPluginsFromDir(dirPath: string): Promise<IPlugin[]>;
    /**
     * 初始化：加载所有内置插件和用户插件
     */
    initialize(): Promise<void>;
    /**
     * 卸载插件
     */
    unloadPlugin(name: string): Promise<void>;
    /**
     * 禁用插件
     */
    disablePlugin(name: string): Promise<void>;
    /**
     * 启用插件
     */
    enablePlugin(name: string): Promise<void>;
    /**
     * 获取插件
     */
    getPlugin(name: string): LoadedPlugin | undefined;
    /**
     * 列出所有插件
     */
    listPlugins(): LoadedPlugin[];
    /**
     * 获取启用的插件
     */
    getEnabledPlugins(): LoadedPlugin[];
    /**
     * 获取所有技能
     */
    getSkills(): ISkill[];
    /**
     * 获取指定名称的技能
     */
    getSkill(name: string): ISkill | undefined;
    /**
     * 触发钩子事件
     * @param event 事件类型
     * @param context 事件上下文
     * @returns 修改后的上下文
     */
    triggerHook(event: HookEvent, context: HookContext): Promise<HookContext>;
    /**
     * 销毁插件管理器
     */
    destroy(): Promise<void>;
    /**
     * 注册钩子
     */
    private registerHook;
    /**
     * 注销钩子
     */
    private unregisterHook;
    /**
     * 查找钩子所属的插件
     */
    private findPluginByHook;
    /**
     * 创建插件上下文
     */
    private createPluginContext;
}
/**
 * 获取全局插件管理器实例
 */
export declare function getPluginManager(config?: PluginManagerConfig): PluginManager;
/**
 * 重置全局插件管理器（测试用）
 */
export declare function resetPluginManager(): void;
export {};
//# sourceMappingURL=PluginManager.d.ts.map