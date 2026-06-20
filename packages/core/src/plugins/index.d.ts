/**
 * 插件系统模块
 * 提供插件加载、技能管理、生命周期钩子等功能
 */
export type { IPlugin, IPluginContext, IPluginHook, ISkill, ISkillContext, LoadedPlugin, PluginManagerConfig, HookContext, HookEvent, } from './types.js';
export { PluginManager, getPluginManager, resetPluginManager } from './PluginManager.js';
export { CodeReviewSkill, UnitTestSkill, CodeExplainSkill, GenerateDocSkill, RefactorSkill, DebugSkill, BUILTIN_SKILLS, getSkillsByTag, getSkillByName, } from './BuiltinSkills.js';
//# sourceMappingURL=index.d.ts.map