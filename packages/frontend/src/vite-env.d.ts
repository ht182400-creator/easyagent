/**
 * Vite 客户端类型声明
 *
 * 作用：为 `import.meta.env.*`（如 `import.meta.env.DEV` / `MODE`）提供类型定义。
 *
 * 【2026-09-18 修复】此前 frontend 包缺少本文件，而 `pages/Automation.tsx` 使用了
 * `import.meta.env`，导致 `pnpm --filter @easyagent/web build`（= `tsc && vite build`）
 * 报 `TS2339: Property 'env' does not exist on type 'ImportMeta'` 并中断构建。
 * 由于 `scripts/deploy-server.ps1` 依赖该构建命令，这会使**部署流程整体失效**。
 *
 * 说明：本文件必须位于被 tsconfig `include` 覆盖的目录内（frontend 与 web 的 tsc
 * 都会经依赖链把它纳入编译范围），三斜线指令是 Vite 官方推荐的引入方式。
 */
/// <reference types="vite/client" />
