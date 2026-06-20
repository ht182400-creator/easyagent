/**
 * 内置技能定义
 * 这些技能默认可用，不依赖外部插件
 */
import type { ISkill } from './types.js';
/**
 * 代码审查技能
 * 对代码进行全面审查，包括风格、安全、性能
 */
export declare const CodeReviewSkill: ISkill;
/**
 * 单元测试生成技能
 * 为指定代码生成全面的测试用例
 */
export declare const UnitTestSkill: ISkill;
/**
 * 代码解释技能
 * 用通俗易懂的方式解释代码逻辑
 */
export declare const CodeExplainSkill: ISkill;
/**
 * 文档生成技能
 * 为代码生成 API 文档或 README
 */
export declare const GenerateDocSkill: ISkill;
/**
 * 重构建议技能
 * 分析代码并提供重构方案
 */
export declare const RefactorSkill: ISkill;
/**
 * 错误调试技能
 * 帮助分析和修复代码中的 bug
 */
export declare const DebugSkill: ISkill;
/**
 * 所有内置技能列表
 */
export declare const BUILTIN_SKILLS: ISkill[];
/**
 * 按标签查找技能
 */
export declare function getSkillsByTag(tag: string): ISkill[];
/**
 * 按名称查找技能
 */
export declare function getSkillByName(name: string): ISkill | undefined;
//# sourceMappingURL=BuiltinSkills.d.ts.map