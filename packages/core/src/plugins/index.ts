/**
 * 插件系统模块
 * 提供插件加载、技能管理、生命周期钩子等功能
 */
// 类型
export type {
  IPlugin,
  IPluginContext,
  IPluginHook,
  ISkill,
  ISkillContext,
  LoadedPlugin,
  PluginManagerConfig,
  HookContext,
  HookEvent,
} from './types.js';

// 管理器
export { PluginManager, getPluginManager, resetPluginManager } from './PluginManager.js';

// 内置技能
export {
  CodeReviewSkill,
  UnitTestSkill,
  CodeExplainSkill,
  GenerateDocSkill,
  RefactorSkill,
  DebugSkill,
  BUILTIN_SKILLS,
  getSkillsByTag,
  getSkillByName,
} from './BuiltinSkills.js';
