/**
 * 路由模块统一出口（P1-1：`server/src/index.ts` 拆分产物）
 *
 * ── 背景 ──
 * `packages/server/src/index.ts` 曾达 3800+ 行、注册 93 条路由，
 * 远超项目自身「单文件 ≤500 行」的规范，任何改动都要在近 4000 行里定位。
 *
 * ── 拆分原则 ──
 *   1. **纯搬迁**：路由路径、方法、处理逻辑、**注册顺序**全部保持不变；
 *   2. **显式依赖注入**：每个模块声明自己的 `XxxRoutesDeps`，不引入"上帝上下文"；
 *   3. **可证明等价**：`__tests__/route-inventory.test.ts` 用快照保证路由集合逐条一致，
 *      `tsc` 保证依赖注入无遗漏（漏了字段必然编译失败）。
 *
 * ── ⚠️ 注册顺序约束 ──
 *   `registerStaticRoutes` **必须最后调用**（内含 `/api/*` 404 兜底与 SPA fallback）。
 *
 * @module routes
 */

export { registerAutomationRoutes, type AutomationRoutesDeps } from './automations.js';
export { registerFilesRoutes, type FilesRoutesDeps } from './files.js';
export { registerIMRoutes, type IMRoutesDeps } from './im.js';
export { registerKnowledgeRoutes, type KnowledgeRoutesDeps } from './knowledge.js';
export { registerSandboxRoutes } from './sandbox.js';
export { registerSemanticRoutes, type SemanticRoutesDeps } from './semantic.js';
export {
  registerStaticRoutes,
  resolveDocViewerFallbackDir,
  type StaticRoutesDeps,
} from './staticFiles.js';
