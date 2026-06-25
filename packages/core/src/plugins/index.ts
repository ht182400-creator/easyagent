/**
 * 插件系统模块
 * 提供插件加载、技能管理、生命周期钩子、沙箱隔离等功能
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
  PluginLoadMode,
  SandboxSettings,
} from './types.js';

// 管理器
export { PluginManager, getPluginManager, resetPluginManager } from './PluginManager.js';

// 权限系统
export type {
  PluginPermissions,
  FsPermission,
  NetworkPermission,
  ShellPermission,
  PermissionCheckResult,
  PermissionLevel,
} from './PluginPermission.js';

export {
  PermissionLevels,
  checkPermissions,
  getDangerousPermissions,
  DANGEROUS_PERMISSIONS,
} from './PluginPermission.js';

// Manifest 系统
export type {
  PluginManifest,
  ManifestValidationResult,
} from './PluginManifest.js';

export {
  loadManifest,
  getManifestPath,
} from './PluginManifest.js';

// 沙箱系统
export { PluginSandbox, createSandbox } from './PluginSandbox.js';
export type { SandboxInitResult, SandboxConfig } from './PluginSandbox.js';

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
