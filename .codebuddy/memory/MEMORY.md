# EasyAgent 项目记忆

> 📖 **新手导航**：`docs/README.md` → `docs/00_新手上手指南.md`
> 🔎 **精简版 v3.0（2026-09-19 重写：合并重复、修正失效状态、陷阱表外置以控制体积）**
> 📚 附录：`关键陷阱清单.md`（57 条代码/打包陷阱 + 15 条环境陷阱 + bat 铁律）· 详表 `docs/修复汇总.md`（按日期倒序）· 管线 `docs/pipeline/ARCHITECTURE.md` · 审核 `docs/62`
> ⚠️ **涉及构建 / 打包 / 环境 / 桌面端 / 测试隔离的问题，动手前先读 `关键陷阱清单.md`**（该表最易踩且症状与根因常常无关）。

## 目录

- [0. 当前状态速查](#0-当前状态速查) | [1. 项目概述](#1-项目概述) | [2. 核心规则速查](#2-核心规则速查)
- [3. 双通道发布](#3-双通道发布github--forgejo) | [4. 构建 / 测试 / 数据同步](#4-构建--测试--数据同步)
- [5. Git / 插件 / LangGraph](#5-git--插件--langgraph-速查) | [6. 管线系统](#6-管线系统指针式) | [7. 服务器部署](#7-服务器部署)
- [8. 平台化改造（P0/P1）](#8-平台化改造p0p1) | [9. 工具箱](#9-工具箱日志--上下文--语义扫描--模型目录)
- [10. 关键文件索引](#10-关键文件索引) | [11. 环境变量与重构安全网](#11-环境变量与重构安全网) | [12. 附录](#12-附录按需读取)

---

## 0. 当前状态速查

| 项 | 值 |
|----|-----|
| 版本 | **v0.6.43**（唯一版本源 `version.json`；改后跑 `node scripts/sync-version.mjs` 同步 7 个 package.json + server 硬编码兜底） |
| 本版主题 | 语义扫描性能治理（**11.0s → 0.26s，累计 43×**）+ 截断可见化 + 沙箱不经 shell + 端口治理 |
| 双通道 | GitHub ✅ / Forgejo ✅（`main = 713e095`、tag `v0.6.43`、Release id=82）→ §3 |
| 测试权威数字 | 定义用例 **1833**（真源 `docs/pipeline/test-case-mapping.json`，CI 门禁校验）/ Vitest 执行 **1844 全通过**（core 1144 · server 278 · frontend 149 · desktop 215 · langgraph 57 · web 2）。**任何历史数字（1822/1833/1798/1809 及更早）都已过期，禁止引用** |
| 已登记遗留 | ① 语义解析 ~150ms 剩余空间（`docs/44` #19，做前先补解析基准）② ~~Forgejo 缺 v0.6.40~42 的 Release~~ → 已于 2026-09-19 补建（id=79/80/81）③ **评测接真实测试执行**（`docs/44` #20：现在只做结构化启发式，**不跑测试** → 不得声称 SWE-bench Verified） |
| 版本历史 | v0.6.42 = 修「关于」面板 vundefined（ESM 裸 `__dirname` 致 `/api/version` 500）· v0.6.41 = P1 全清 + 轻量压测 · 更早见 `CHANGELOG.md` |

---

## 1. 项目概述

- **项目**: EasyAgent — 集成中国主流大模型的开源 AI 编程助手
- **仓库**: `git@github.com:ht182400-creator/easyagent.git`（origin，SSH）；镜像 `http://localhost:3000/ht182400/easyagent`（forgejo）
- **技术栈**: TypeScript 5.x + React 18 + Vite 5 + Tailwind 3 + Zustand 4 + Express + WS + Electron 30 + SQLite(better-sqlite3) + Vitest + tsup
- **Monorepo（12 包）**: `core`(引擎/工具/适配器) / `langgraph`(StateGraph 引擎) / `server`(Express API+WS) / `frontend`(共享 UI) / `web`(薄壳) / `desktop`(Electron) / `cli` / `vscode`(未完成) / `plugin-template` / `easyagent-plugin-obsidian-doc-viewer`
- **双引擎**: `AgentEngine`（ReAct while 循环，默认）+ `@easyagent/langgraph`（Think-Act-Observe 图）；优先级 CLI `--engine` > `EASYAGENT_ENGINE` > `engine.config.json` > `legacy`（`docs/53`、`docs/54`）
- **模型接入**: `PROVIDER_PRESETS` 11 家；模型目录多源降级（§9.4）
- **Web↔Desktop 隔离**: 共用 `@easyagent/frontend`，各入口（`web/src/main.tsx`、`desktop/src/renderer/main.tsx`）只注入平台配置；差异 = 路由（BrowserRouter vs HashRouter）/ 协议 / IPC 桥（`ipcBridge.ts`）。**改 UI 只改 `packages/frontend/src/`**；⚠️ `frontend/src/main.tsx` 只导出 `mountApp`，**绝不自行调用**（否则双重挂载 → 全局字体/布局异常）；改模块入口后 Vite HMR 可能不一致（全空白无报错）→ **重启 Vite**

---

## 2. 核心规则速查

| # | 规则 | 要点 |
|---|------|------|
| 1 | **编译+测试不可省** | 改完必须 `tsc`/`vitest` 全绿 + IDE 诊断零 ERROR |
| 2 | **日志必分级** | debug=入口/出口/参数；info=状态变更；warn=可恢复；error=不可恢复（带堆栈）。禁止裸 `console.log`（.mjs 用 `scripts/lib/logger.mjs`） |
| 3 | **try-catch 不吞异常** | 文件 I/O / 网络 / 外部进程 / 输入解析必须包；catch 里 `log.error(..., { error, context })`，禁止 `pass` |
| 4 | **禁止硬编码** | 魔法数字/字符串/路径/超时/阈值 → `UPPER_SNAKE_CASE` 常量（或 `_config`） |
| 5 | **单文件 ≤500 行** | 超了按职责拆。⚠️ 现存超标：`docs/pipeline/index.html`、6 个前端页面 664~747 行（**用户 2026-09-18 决策保留不拆**；仅当某页 >1000 行时再按 `pages/<page>/` 拆）。`server/src/index.ts` 已拆至 389 行 |
| 6 | **改签名 → 查所有调用方** | 搜全项目同步更新 |
| 7 | **不猜 → 先搜** | 先搜官方文档/社区，禁止凭感觉写 |
| 8 | **收尾更新文档** | `.codebuddy/memory/YYYY-MM-DD.md` + `docs/修复汇总.md` + 相关 `docs/` |

**Memory 纪律**: 每日日志 `YYYY-MM-DD.md` **追加式**，严禁覆盖/删减（反例：2026-06-19 覆盖 575 行 → 25 行事故）；`MEMORY.md` 可就地更新。
**修复记录双轨**: `MEMORY.md` 简表 + `docs/修复汇总.md` 详表（`## YYYY-MM-DD HH:MM — 标题`，新→旧），修复完**必须**追加详表。
**Memory MD 格式（管线解析器依赖）**: 每问题 `## [模块:ID] 标题 (HH:MM)` + 必含 `- **问题**:` / `- **修复**:` / `- **状态**: ✅ resolved`；纯操作流程**不要**加 `[模块:ID]`（`docs/pipeline/memory-format-spec.md`）。
**模块 ID**: F1 多模型 / F2 Agent / F3 工具 / F4 知识库RAG / F5 MCP / F6 沙箱 / F7 CLI / F8 Web Dashboard / F9 Desktop / F10 插件技能 / F11 IM / F12 i18n / F13 自动升级 / F14 模型目录 / F15 去硬编码 / F16 版本控制 / B1a Web↔Desktop / B2b CI-CD / B3a 安装脚本 / B3b VS Code / P5a-c 管线 / lg1~lg6 LangGraph。
**源码编译**: `core/src` 中 `.ts` 与产物 `.js/.d.ts` 共存 → 测试导入用 `.js` 扩展名；改 `.ts` 后同步编译；**删除 `packages/server/src/index.js` 等旧产物**（否则 vitest 加载旧 JS）。
**构建工具**: electron-builder **精确锁 23.6.0**（勿升 v24）；用 `pnpm exec`；原生模块预编译 + `npmRebuild:false`；external 框架子依赖必须全声明（Express 58 / pino 13 / multer 6 / cors 2，见 `packages/desktop/express-deps.json`）。
**API 规范**: Desktop 统一 `127.0.0.1:3456`（不用 `localhost`，Windows IPv6 陷阱）；`apiFetch` 已内部 `.json()`，调用处**禁止再 `.json()`**；CSP `connect-src` 含 `http://127.0.0.1:3456 ws://127.0.0.1:3456`。
**Desktop 打包**: `index.html` 不用 `<style>`（Vite 5 bug）；`@import` 必须在所有规则前；HashRouter；`tailwind.config.js` 的 `content` **必须含** `'../frontend/src/**/*.{js,ts,jsx,tsx}'`。
**版本/CSP 校验**: `packages/desktop/scripts/verify-build.cjs`（17 类 30+ 项）；第 6 项拦截旧版本号硬编码；命令白名单 `EASYAGENT_ALLOWED_COMMANDS`。
**调试日志开关**: `LOG_LEVEL` > `EASYAGENT_DEBUG`；`.bat` 的 `[DEBUG]` 行需 `if %_DBG%==1` 包裹。

---

## 3. 双通道发布（GitHub + Forgejo）

| remote | 地址 | 认证 | Release |
|--------|------|------|---------|
| `origin` | `git@github.com:ht182400-creator/easyagent.git` | SSH | `.github/workflows/release.yml` 在 tag 推送时**自动创建**（含 EXE） |
| `forgejo` | `http://localhost:3000/ht182400/easyagent.git` | HTTP Basic | **需手动调 API 创建**（该实例无工作流，仅源码归档） |

- **Forgejo 实例**: `http://localhost:3000`（`16.0.2+gitea-1.22.0`），用户名 **`ht182400`**（⚠️ 不是 `ht82400`），仓库 `ht182400/easyagent`（公开）
- **推送**: `pnpm push:forgejo --tag vX.Y.Z`（`scripts/push-forgejo.mjs`）
- **🔴 凭据纪律**: `FORGEJO_USER` / `FORGEJO_TOKEN` **只从环境变量读**，绝不写进 remote URL / `.git/config` / 文档 / 代码；脚本用**一次性 `http.extraHeader`** 注入 Basic 头（不落盘、不进 reflog）。凭据若在对话/终端外露应立即轮换
- **⚠️ 推前必须** `git fetch forgejo main` 比对历史：**同源才可快进**；不同源绝不可 force push
- **建 Release（PowerShell）**: `Invoke-RestMethod` + `-ContentType 'application/json; charset=utf-8'` + `-Body ([Text.Encoding]::UTF8.GetBytes($json))`（**传字节数组，否则中文乱码**）；正文风格 = 主题 / Changed / Fixed / 验证；创建后**回读校验** `body`/`draft`/`tag_name`。完整写法见 `docs/64` §3.3、踩坑 §5、发布记录 §6
- **发版固定动作（v0.6.43 教训）**: ① 打 tag 前确认发版相关提交**已全部落盘**（v0.6.43 的 tag 指向 `308f50c` 而非 HEAD）② 推完 Forgejo **必须建 Release**（v0.6.40~42 曾漏建，已于 2026-09-19 补建 id=79~81）③ 发版后自查 `GET /releases?limit=N`，比对「tag 有而 Release 无」④ **已推送的 tag 绝不移位**（移位需 force push 两个远端）

---

## 4. 构建 / 测试 / 数据同步

```bash
build.bat              # 快速测试 (--dir, ~60s)     build.bat --release  # 完整 NSIS (~3min)
build.bat --verify     # 仅预检查
# 流程: 清理进程 → verify-build.cjs 预检查 → core/server/desktop tsup → vite build → electron-builder → 输出验证
# 输出: release/EasyAgent-<ver>-win-x64.exe 或 release/win-unpacked/EasyAgent.exe
start-backend.bat      # 后端 localhost:3456        start-frontend.bat   # Web 前端 localhost:5173
pnpm build             # core → cli → server → desktop tsup    pnpm build:web  # web 生产构建
pnpm test:all          # core → server → langgraph → desktop → frontend → web → cli
pnpm test:core:fast    # core 并行快跑（-62%）；结果仅"可重跑"场景采信，不写管线 JSON
node scripts/unified-sync.mjs   # 统一同步管线数据（唯一入口）
```

> ⚠️ 构建前必须清 `dist/renderer` 缓存（否则 Vite 复用旧产物）。构建链唯一入口是 `build.bat`，禁止手动逐步跑。

**🔴 触发即同步**（发布 Tag / 新增≥20 用例 / 增删测试文件 / CI 通过率变化）——必须同步 6 处：
`docs/03_测试案例文档.md` + `docs/pipeline/test-case-mapping.json`（`scripts/scan-test-cases.mjs`）+ `docs/pipeline/pipeline-data.json`（`scripts/update-progress.mjs`）+ `docs/pipeline/project-progress-data.json` + `MEMORY.md` + `CHANGELOG.md`
**违例判定**: `03` 汇总表 ≠ `test-case-mapping.json._meta.totalTestCases`，或 `MEMORY.md` 版本行 ≠ 实际 → 视为不同步。

---

## 5. Git / 插件 / LangGraph 速查

**Git 陷阱**

- 内嵌 git 仓库（`packages/plugin-template`、`packages/easyagent-plugin-obsidian-doc-viewer`）被当 gitlink(160000) → `git rm --cached -f <dir>` → 删其 `.git` → 再 `git add`
- 管线钩子每次提交后改写 `docs/pipeline/*.json` → 提交无法收敛；对策 `git commit --no-verify`（工作区仍留 5~6 个 JSON 差异属正常生成物行为）
- 同步排除清单：`temp/`、`未命名.base`、`.obsidian/plugins/*`、`packages/*/docs/.obsidian/`
- ⚠️ 发版 commit **绝不能含 `[skip ci]`**（tag 指向该 commit 会连 tag push 一起跳过）；`git add .` 前先 `git checkout HEAD -- docs/pipeline/`
- **Node 调 git 必须同捕 stdout + stderr**：`execFileSync` 只返回 stdout，而推送结果（`old..new main -> main`）与多数错误原因（401/非快进/找不到远端）**全走 stderr** → 成功会被误报"无变化"、失败可能被报成成功。用 `spawnSync` + `stdio:['ignore','pipe','pipe']`（`push-forgejo.mjs` / `run-logged.mjs`，已修 `013e996`）

**插件系统**

- 两种 `default export`：对象式（官方协议，`register(context)` + `getTools/getSkills/getHooks`）与函数式（兼容）
- 包格式：GitHub Release zipball + 根目录 `manifest.json`；发现有仓库打 `easyagent-plugin` topic
- 隔离：`PluginSandbox.ts` Worker Threads + `PluginPermission.ts`（默认拒绝，none/readonly/standard/full）
- ⚠️ `PluginSandbox` 加载 `PluginWorkerEntry.js` 时 **sibling 优先，回退 `<core>/dist/`**；勿留 `src/plugins/PluginWorkerEntry.js` 残留
- ⚠️ `tsup` 用对象 entry 独立输出 `PluginWorkerEntry.js`（`splitting:false` 会内联）；dts 排除该 entry

**LangGraph 包**

- 图: `START → think → route → (act → observe → think)* → END`
- 产物: `bridge/adapterBridge.ts` + `toolBridge.ts` + `AgentFactory.ts`；`server/src/langgraph/`；`frontend/src/components/LangGraph/` + `pages/LangGraph.tsx`
- 依赖: `@langchain/langgraph ^0.2`、`@langchain/core ^0.3`、`better-sqlite3`；Demo `pnpm demo:web`（3455）
- ⚠️ `stream()` 走 `streamEvents`，非流式 adapter 无 `on_chat_model_stream` → 必须从 checkpointer 取最新 AI 消息兜底发 response 事件

---

## 6. 管线系统（指针式）

- **唯一权威源**: `docs/pipeline/lib/module-registry.mjs`（30 模块 + testFiles 映射）→ `scripts/unified-sync.mjs` → 5 个输出文件 → API → 前端
- **唯一配置源**: `docs/pipeline/lib/pipeline-config.mjs`（KPI/评分/阶段/模块/`TEST_LEVEL4_MAP`/`TOOL_PARAMS_MAP`）
- **KPI 必须动态计算**，严禁硬编码通过率；`testCases` 来自 mapping，`passRate` 来自 `_vitest-*.json` 实时计算
- **三级渐进加载**: HTTP API → 静态 JSON 快照 → 内嵌骨架（兼容 HTTP/file:///离线）
- **数据一致性铁律**: `renderPassCharts` 必须从 `pipelineData.kpi` 取权威值，**不得从 items 反推**
- **CI 自动同步**: `ci.yml` 的 `sync-pipeline` job 在 6 个 job 全绿后下载 vitest artifacts → `unified-sync.mjs` → commit `[skip ci]`
- **新增模块流程**: `docs/43_管线模块添加标准流程.md`（改 `module-registry.mjs` + `pipeline-parser.mjs` 的标签 regex）
- **关键命令**: `node docs/pipeline/server.mjs`（8898）、`del docs\pipeline\.pipeline-cache.json` 强制重建
- ⚠️ JS 的 `\b` 对中文无效 → 中文边界用 `(?![一-龥\w])`

---

## 7. 服务器部署

- **目标**: Windows 云服务器 `82.156.71.231:3456`，域名 `CCCN.fable5.icu`，项目根 `C:\easyagent`；服务器在 **NAT 后**
- **架构**: 单 Node 进程，Server 用 `express.static(packages/web/dist)` 托管页面 + `/api/*` + `/ws`；前端同源（`apiBase:''`/`wsBase:'/ws'`），无 CORS
- **构建链**: `core → langgraph → server → web`（Vite 直打包 `@easyagent/frontend` 源码）；启动 `node packages/server/dist/index.js`；生产 `PORT=80 HOST=0.0.0.0`
- **Node**: 必须 18/20/22 LTS（`preinstall` 拦截 ≥24）；启动前 `node scripts/sqlite3-loader.mjs system`
- **持久化**: SSH 会话启动的 node 会随注销被杀 → `schtasks /create /tn ea_server /tr C:\easyagent\start.bat /sc onstart /ru SYSTEM /rl highest /f`；重启 = `Stop-Process -Name node -Force` + `schtasks /end` + `/run`
- **部署流程**: `pnpm run build:server` → `scp packages/server/dist/* Administrator@82.156.71.231:C:/easyagent/packages/server/dist/` → 重启
- **CORS 致命坑（已修）**: 公网 IP 不在白名单 → 子资源 500（首页正常）。修法：前置同源预判定中间件（Origin 的 host:port 与 Host 一致即摘 Origin 让 `cors` 按同源放行）+ `CORS_ORIGIN` 白名单；**不要整包删除 cors**（`docs/60` §4.4）
- **交付物**: `docs/60`、`scripts/deploy-server.ps1`、`scripts/start-server.cmd`；HTTPS 用 Caddy 反代

---

## 8. 平台化改造（P0/P1）

> 完整清单见 `docs/62_专家团最终审核报告.md` + `docs/63_P0优化实施方案与回归记录.md`。**全部已交付**（P0 六项 + P1 七项 + 校验体系/模型目录自动化）。

| 项 | 一句话 | 关键文件 / 文档 |
|----|--------|----------------|
| P0-1 安全 | REST 鉴权 + 限流 + **默认只听 127.0.0.1**；非回环无令牌**拒绝启动**；WS/REST 共用令牌 | `server/src/middleware/apiSecurity.ts` |
| P0-2 测试 | 6 个真实失败全修（4 个用例过期/写错、2 个产品缺陷）+ frontend unhandled rejection | §12 测试修复 |
| P0-3 数据 | 单一真源 + CI 一致性门禁 | `scripts/verify-data-consistency.mjs` |
| P0-4 上下文工程 | `ContextManager`：token 预算 / 工具按模型规模分级 / 结果截断+落盘 / 历史压缩；小模型档固定开销 **45.3% → 6.8%** | `core/src/agent/context/`、`docs/65`、§9.2 |
| P0-5 令牌 | 15 个语义令牌类名恢复生效；三端共用 `tailwind.tokens.mjs` | `scripts/verify-css-tokens.mjs` |
| P0-6 数据刷新 | `unified-sync.mjs` 重跑，`_stale` 清零 | `docs/pipeline/*.json` |
| P1-1 服务端拆分 | ✅ 六批完成：`index.ts` **3827 → 389 行**；第六批抽 `bootstrap.ts` | `server/src/routes/`、`docs/66` |
| P1-2 思维链 | `reasoning_content`/`reasoning` 双字段归一化；**正文与思考过程严格分离**（思考不入上下文） | `core/src/adapters/OpenAICompatibleAdapter.ts`、`docs/68` |
| P1-3 MCP 升级 | `StreamableHttpTransport`（2025-06-18：单 JSON/SSE 分派、Session-Id、Protocol-Version、DELETE）+ 双传输分派 + 版本协商。**未实现 GET 长连接推送** | `core/src/mcp/`、`docs/75` |
| P1-4 Markdown 加固 | 修 2 个 XSS 缺口（`"` 未转义、`javascript:` 未过滤）+ README 裸 HTML | `frontend/src/utils/markdown.ts`、`docs/67`、§9.5 |
| P1-5 数据库迁移 | `DatabaseMigrator`（`user_version` 版本戳 + 事务 + fail-fast + mock 跳过）；**新增迁移只追加不改历史，基线必须幂等** | `core/src/db/`、`docs/72` |
| P1-6 错误中间件+冒烟 | `errorHandler`（堆栈只进日志）+ `asyncHandler`（**Express 4 不捕获 async 路由 rejection，async 路由必须包裹**）+ `pnpm smoke` | `server/src/middleware/errorHandler.ts`、`docs/73` |
| 校验体系 | `pnpm verify:all` 统一入口；统一输出 `__VERIFY_STATUS__=PASS\|FAIL\|SKIP` | `scripts/verify-all.mjs`、§9.3 |
| 模型目录自动化 | 目录自动生成 + 多源降级 + 厂商 `/models` 直连补齐 + 来源可见 | `scripts/refresh-models-catalog.mjs`、`docs/69` |

### 8.1 重构/搬迁的通用教训（改大文件前必读）

- **🔧 纯搬迁后的死导入核查（linter 不管）**：会残留**只剩导入行的死导入**（v0.6.37 清了 12 个），语言服务器**不报错**。做法：临时 `.mjs` 脚本对每个被搬走符号做 `new RegExp('\\b'+name+'\\b','g')` 全文计数，=1 即死导入。**⚠️ 别用 `node -e` 内联：本环境 shell 会剥引号，正则全失效、计数恒为 0（假象）**
- **✂️ 大块搬迁必须双重验证（v0.6.38）**：用"首个 `{` 配对"脚本时 `Array<{...}>` 会让括号深度**提前归零** → 删除被截断，残留**语法合法但行为错误**的代码（`return` 裸露在函数外提前退出），IDE 甚至 0 诊断。**① 残留核查（过滤注释行后逐符号计数）② 路由快照比对**，缺一不可
- **⏱️ TDZ 陷阱（v0.6.39）**：旧代码把对 `const` 的引用写在**路由回调里**（请求时才执行）从未报错；改注册式后引用在 `createApp` **立即求值** → `ReferenceError: Cannot access 'x' before initialization`，测试文件直接加载失败。语言服务器**不报 TDZ**。解法：把被引用 `const` **上移**到注册点前；搬迁前先问"这段引用了哪些定义在**后面**的 const？"
- **⏳ 偶发超时根因（2026-09-18 已修）**：`GET /api/semantic/map` 假失败 = **无缓存的同步重操作 + 紧超时预算 + 收官期负载尖峰**（常态 1~3s vs vitest 15s；收官期实测 54s vs 常态 30s）。已修：路由层补 60s 缓存（key=`workspace|depth|maxFiles`，`refresh=true` 强制重建）+ 用例超时放宽到 30s。**教训**：请求处理器内的同步重扫描，超时预算必须按**最坏负载**设定（`docs/66` §5.5）

---

## 9. 工具箱（日志 / 上下文 / 语义扫描 / 模型目录）

### 9.1 日志体系（禁止往 temp/ 或系统临时目录写日志）

| 类型 | 位置 | 生成方式 | 入库 |
|------|------|---------|:---:|
| 运行日志 | `logs/runtime/easyagent-YYYY-MM-DD.log` | 运行时自动（每日轮转，留 30 天） | ❌ |
| 测试日志 | `logs/test-logs/<日期>_<时间>_<范围>/` | `pnpm test:log` | ✅ 汇总；`raw/` 忽略 |
| 命令输出 | `logs/build-logs/<日期>_<时间>_<标签>.log` | `pnpm log --label X -- <命令>` | ❌ |

**两条通道级别故意不同（"看不到 debug"的答案）**：控制台 `LOG_LEVEL` > `EASYAGENT_DEBUG`（默认 **info**）；文件 `EASYAGENT_LOG_FILE_LEVEL`（默认 **debug**）。另有 `EASYAGENT_LOG_DIR`、`EASYAGENT_LOG_RETENTION_DAYS`（默认 30）。服务端/CLI 用 `<cwd>/logs/runtime/`；Electron 用 `~/.easyagent/logs/runtime/`。**服务端启动时会打印日志路径。**
**分级纪律**：循环/轮次细节用 `debug` 不用 `info`。**ANSI 颜色码禁止进日志文件**（显示成"小方块 + `[39m`"噪音）→ 落盘前 `stripAnsi()`，子进程 `NO_COLOR=1` + `FORCE_COLOR=0`。

### 9.2 上下文工程要点（P0-4）

- **开关**：`EASYAGENT_CONTEXT_V2=0` 完全回滚；**档位**：小档 ≤40k 只给 17 个核心工具；中档 ≤200k 排除 23 个；大档仅排除 `benchmark_*`
- **关键不变量（有用例守护）**：① 历史压缩**不得拆散** `assistant(tool_calls)` ↔ `tool` 结果（否则 provider 400）② 压缩只作用于"发给模型的工作集"，**会话落盘用 `fullHistory`** ③ medium/large 用**排除清单**（新增工具默认可见）④ **模型不支持 function calling 时必须保留内联工具描述** ⑤ 工具结果落盘必须在**工作区内**（`FileTools.safePath()`）
- 度量 `pnpm measure:context`（需先构建 core）

### 9.3 校验体系（v0.6.32 起）

- **一律用 `pnpm verify:all`**，**不要**用 `node scripts/xxx.mjs | Select-String '✅|❌'` —— 脚本崩溃/走跳过分支/输出格式变化时一片空白，而空白极易被误读成"没问题"，实际**一次都没校验**
- 三状态：`PASS`(0) / `FAIL`(1) / `SKIP`(**未做校验，退出码 0 但不可当通过**)。新增脚本必须打印 `__VERIFY_STATUS__=...` 并登记进 `verify-all.mjs` 的 `VERIFIERS`
- **门禁必须做负向测试**（故意注入违规样本确认真的失败），否则是假的安全网（先例 `docs/71` §2.4）

### 9.4 语义扫描与模型目录

**语义扫描（v0.6.43 主线）**

- **缓存层级**：① 路由 SWR（60s，key=`workspace|depth|maxFiles`）② Worker 内地图缓存（60s）③ core **两级增量缓存**（`analysisCache` + `lineCountCache`，指纹 = `mtimeMs + size`，上限 5000 条）。**`refresh=true` 必须清三层**（主线程 `resetSemanticCache()`+`clearAnalysisCache()`、Worker 内 `clearAnalysisCache()`）；**新增缓存必须接入 force**
- **性能画像（勿凭直觉优化）**：717 文件/35MB → **读盘 243ms(59%) > 正则解析 150ms(36%) > 遍历 5%**。已治：Buffer 直读、并发读盘、忽略模式预编译、`extractSymbols` 的 O(n²) 行号改 `buildLineIndex()`+二分
- **已证伪的伪优化**：`UV_THREADPOOL_SIZE`、单纯提高 `concurrency` 都在噪声内（本机抖动 ±30%）→ 不要重走；**评测必须多次取中位数**。**剩余空间 = 正则解析 ~150ms**（`docs/44` #19，做前先补基准）
- **`maxFiles` 只是天花板**：开销 ∝ 实际文件数（1000/3000/10000 实测均 ~630ms）；默认 **1000**（旧 300 会漏 216 个代码文件）；`prioritizeSourceFiles()` 保证代码优先；截断由 `stats.totalCandidates`/`truncated` 暴露 + UI 告警 —— **禁止静默截断**

**模型目录（`docs/69`）**：模型**列表**走厂商 `/models` 直连；**元数据**走目录分发。降级链 `自定义URL → 本地文件 → 额外镜像 → GitHub raw → jsDelivr → 本地缓存 → 应用内置`（`EASYAGENT_MODELS_CATALOG_URL/FILE/MIRRORS`）。
**三条铁律**：① 远程源失败只告警不清空 ② 厂商抖动不删模型（只增不删）③ 直连新模型标 `unverified`，**不把保守默认值当真实规格**。排障第一问 `GET /api/providers/catalog/status` 看 `source`/`stale`/`ageDays`（**下载成功 ≠ 数据新鲜**）；`pnpm models:refresh` / `pnpm verify:all`（30 天门禁）。

### 9.5 服务端响应契约与前端渲染安全

- **⚠️ 服务端响应字段是「逐字段映射」的**：`/api/providers` 等**不是整对象透传**，新增字段必须同时改三处：① `formatPresetModel()` ② `/api/providers` models 映射 ③ `/api/providers/all-models` 映射。实例：v0.6.33 的 `unverified` 在这三处被丢 → v0.6.36 前界面把保守默认值当真实规格（`¥0` 读成"免费"）
- **🎨 样式类名不存在也不报错（已复发 3 次：P0-5 / v0.6.29 `prose` / v0.6.36 `badge-green`）**：校验 `pnpm verify:classes`；**新增组件类家族必须登记进 `scripts/verify-component-classes.mjs` 的 `COMPONENT_FAMILIES`**（不自动派生前缀的原因：会把 Tailwind 自身命名空间纳入 → 大量误报）
- **📝 HTML 渲染安全（改任何 `dangerouslySetInnerHTML` 前必读）**：**唯一合法路径** = `renderMarkdown()`（markdown-it `html:false` + `isSafeUrl` 协议白名单 + `rel="noopener noreferrer"`）。**核心原则：消除信任面，而非过滤危险内容** —— 服务端 GitHub README 取**原始 Markdown**（`Accept: application/vnd.github.raw`），不存在"远程 HTML 进 DOM"。历史教训：自研正则渲染器只转义 `& < >` **漏了 `"`** → `href="$2"` 可被挣脱；协议完全不过滤 → `[x](javascript:alert(1))` 点击即执行

### 9.6 常用命令

```bash
pnpm test:log / pnpm test:log:smoke   # 全量回归+分级日志 / 冒烟（秒级）
pnpm test:core:fast                   # core 并行快跑（19.9s vs 53.6s，-62%）；**不写管线 JSON**，结果仅"可重跑"场景采信（陷阱 #55）
pnpm verify:all                       # 全部门禁（唯一正确入口）
pnpm smoke                            # 真实启动 → health → sessions
pnpm verify:data / verify:tokens / verify:runtime-log
pnpm log --label 构建web --cwd packages/web -- npm run build   # 命令输出自动存档
```

---

## 10. 关键文件索引

| 类别 | 路径 |
|------|------|
| 版本源 / 同步 | `version.json`、`scripts/sync-version.mjs` |
| 核心引擎 | `packages/core/src/agent/AgentEngine.ts`、`packages/core/src/tools/{ToolRegistry,index}.ts` |
| 模型预设 | `packages/core/src/config/{ProviderPresets,ModelRegistry}.ts` |
| 服务端 | `packages/server/src/index.ts`（389 行）、`routes/`、`bootstrap.ts`、`middleware/{apiSecurity,errorHandler}.ts` |
| 前端 / 共享入口 | `packages/frontend/src/{App.tsx,pages/*,components/*,stores/*}`、`mountApp.tsx`（只导出） |
| 桌面 | `packages/desktop/src/main.ts`、`ipcBridge.ts`、`index.html` |
| 质量门禁 | `scripts/{run-tests-log,verify-data-consistency,verify-css-tokens,verify-all,smoke-test}.mjs`、`packages/desktop/scripts/verify-build.cjs`、`docs/14_构建前必检清单.md` |
| 测试日志 | `logs/test-logs/<日期>_<时间>_<范围>/`（分层 log + 失败标红 HTML + summary.json + raw/） |
| 设计令牌真源 | `packages/frontend/tailwind.tokens.mjs` + `frontend/src/styles/index.css` |
| 发布 / CI | `scripts/release.mjs`、`scripts/push-forgejo.mjs`、`docs/06`、`docs/38`、`docs/64`、`.github/workflows/{ci,_test,release}.yml` |
| 打包 | `docs/05`、`docs/11`、`build.bat` |
| 管线 | `docs/pipeline/lib/{module-registry,pipeline-config,pipeline-api,pipeline-parser}.mjs`、`docs/pipeline/ARCHITECTURE.md` |
| 架构 / 需求 / 测试 | `docs/02`、`docs/01`、`docs/03_测试案例文档.md` |
| 修复详表 | `docs/修复汇总.md` ← 每次修复必追加 |
| 引擎 / 模型决策 | `docs/53`、`docs/54` |
| 部署 | `docs/60_服务器部署指南.md`、`scripts/deploy-server.ps1`、`scripts/start-server.cmd` |
| 审核 | `docs/62_专家团最终审核报告.md`、`docs/63_P0优化实施方案与回归记录.md` |

---

## 11. 环境变量与重构安全网

### 11.1 服务端环境变量

| 变量 | 默认 | 说明 |
|------|------|------|
| `HOST` | **`127.0.0.1`**（原 `0.0.0.0`） | 公网部署须显式设 `0.0.0.0` |
| `PORT` | `3456` | 主服务端口（**不是 3000**） |
| `EASYAGENT_API_TOKEN` | 自动生成并持久化到 `~/.easyagent/api-token` | 非回环访问必需；回环免鉴权 |
| `EASYAGENT_ALLOW_REMOTE_NO_AUTH` | 未设置 | 置 `1` 才允许"公网 + 无令牌"（不推荐） |
| `EASYAGENT_TRUST_PROXY` | 未设置 | 置于 Caddy/Nginx 后必须设为代理层数（如 `1`），否则 `req.ip` 恒为代理地址 → 回环判定/限流失真 |
| `EASYAGENT_DISABLE_RATE_LIMIT` | 未设置 | 置 `1` 关闭限流（仅压测用） |

**公网部署三步**：`HOST=0.0.0.0` → `EASYAGENT_API_TOKEN=<强随机>` → `EASYAGENT_TRUST_PROXY=1`；首访 `http://域名:端口/?token=<令牌>` 自动换 Cookie。

### 11.2 服务端重构安全网（改 `server/src/index.ts` 前必读）

| 手段 | 命令 | 作用 |
|------|------|------|
| 路由清单快照 | `pnpm --filter @easyagent/server test` | 93 条路由与基线**双向**比对（丢/多都失败）+ 重复注册断言 |
| 运行时行为 | `pnpm verify:server-routes` | 验证**注册顺序**与静态托管（单测覆盖不到） |
| 类型检查 | IDE 语言服务器 | 依赖注入漏字段必然失败。⚠️ 根 tsconfig `exclude` 含 `packages`，跑它是空跑 |

**拆分四原则**：① 纯搬迁（路径/方法/逻辑/顺序全不变）② 显式依赖注入（每模块自己的 `XxxRoutesDeps`，不要"上帝上下文"）③ `__dirname` 由调用方传入（取决于**构建产物**布局）④ 顺序约束写进模块头 + 调用点两处注释。
**必须保持的注册顺序**：`registerStaticRoutes` **最后调用**（内含 `/api/*` 404 兜底与 SPA fallback，顺序错会让未匹配 API 返回 `200 + index.html`）；知识库 `/api/knowledge/stats/summary` **先于** `/api/knowledge/:id`。
**更新路由基线**：`$env:UPDATE_ROUTE_INVENTORY='1'; pnpm --filter @easyagent/server test` → **必须 review 基线 diff**。

### 11.3 P0-2 测试修复（6 项）

`core` plugin-manager 卸载断言 `toBeUndefined`→`toBeNull`（契约 `Promise<string | null>`）· `server` langgraph-engine 默认/未知值 ×2 **用例非密封**（被真实 `engine.config.json` 影响）→ 加依赖注入 · `server` X-Frame-Options `DENY`→`SAMEORIGIN`（代码已刻意支持同源 iframe）· `server` plugin-market `onPluginUnload` 断言改回真实契约 · `langgraph` resume 用例只配 1 条 Mock 回复 → 补第 2 条并收紧断言 · `frontend` api.test.ts **unhandled rejection** → 立即挂载 rejection 处理。
> ⚠️ `_vitest-desktop.json` 的 mtime 曾停在 2026-06-27，导致"30 个孤儿测试"的错误结论。**判断测试状态必须重跑，不能只看管线快照**（`docs/62` 更正说明）。

---

## 12. 附录（按需读取）

| 文件 | 内容 |
|------|------|
| `.codebuddy/memory/关键陷阱清单.md` | **52 条代码/打包陷阱**（Desktop/Web/通用）+ **15 条环境陷阱**（pnpm 安装拦截、DOMPurify/happy-dom、vitest 别名、静默 0、端口、沙箱、闩锁缓存、WS 信封覆盖、HITL、tsc 门禁、测试数据重定向…）+ **Windows bat 三条禁令** |
| `docs/修复汇总.md` | 全部修复详表（新→旧），每个问题含现象/根因/修复/验证 |
| `docs/pipeline/ARCHITECTURE.md` | 管线系统架构 |
| `docs/62` / `docs/63` | 专家团审核结论 / P0 优化实施方案与回归记录 |
| `docs/77` | **SWE-bench 评测现状与离线自测**：无 Key 时的三种用法（dry-run / `--offline` / `--generate-readme`）；**口径限制（结构化启发式，不执行测试 → 禁止称 SWE-bench Verified）**；四处硬伤修复记录 |
