# EasyAgent 项目记忆

> 📖 **新手导航**: `docs/README.md` → `docs/00_新手上手指南.md`
> 🔎 **本文件为精简版 v2.0（2026-09-17 归档重写，712 → ~360 行）**。完整详表见 `docs/修复汇总.md`（按日期倒序）；管线细节见 `docs/pipeline/ARCHITECTURE.md`；本次审核结论见 `docs/62_专家团最终审核报告.md`。

## 目录

- [1. 项目概述](#1-项目概述) | [2. 核心规则速查](#2-核心规则速查)
- [3. 关键陷阱清单（52 条）](#3-关键陷阱清单) | [4. Windows bat 铁律](#4-windows-bat-文件铁律)
- [5. Web↔Desktop 约束](#5-web--desktop-代码隔离约束) | [6. 构建与启动](#6-构建与启动命令)
- [7. 测试与数据同步](#7-测试与数据同步) | [8. 管线系统](#8-管线系统指针式)
- [9. 服务器部署](#9-服务器部署) | [10. Git / 插件 / LangGraph](#10-git--插件--langgraph-速查)
- [11. 关键文件索引](#11-关键文件索引) | [12. P0 优化落地（2026-09-18）](#12-p0-优化落地2026-09-18)

---

## 12. P0 优化落地（2026-09-18）

> 依据 `docs/62_专家团最终审核报告.md` 的 P0 清单实施。方案与回归记录：`docs/63_P0优化实施方案与回归记录.md`。

### 已交付

| 项 | 内容 | 关键文件 |
|----|------|---------|
| P0-1 安全 | REST 鉴权 + 限流 + **默认只监听 127.0.0.1**；非回环监听且无令牌时**拒绝启动**；WS 与 REST 共用令牌 | `packages/server/src/middleware/apiSecurity.ts` |
| P0-2 测试 | 6 个真实失败全部修复（4 个是用例过期/写错、2 个是产品缺陷）；frontend unhandled rejection 修复 | 见 §12「测试修复」 |
| P0-3 数据 | 单一真源 + CI 一致性门禁 | `scripts/verify-data-consistency.mjs` |
| **P0-4 上下文工程** | **`ContextManager`：token 预算 / 工具按模型规模分级 / 工具结果截断+工作区落盘 / 历史压缩。小模型档固定开销 45.3% → 6.8%** | `packages/core/src/agent/context/`、`scripts/measure-context.mjs`、`docs/65` |
| P0-5 令牌 | 15 个语义令牌类名全部恢复生效；三端共用 `tailwind.tokens.mjs` | `packages/frontend/tailwind.tokens.mjs`、`scripts/verify-css-tokens.mjs` |
| 附加 | web 构建解锁（原 `tsc` 11 个错误导致 `deploy-server.ps1` 整体失效） | `packages/web/tsconfig.json` |
| 附加 | 测试日志改为项目内持久资产（禁写系统临时目录） | `scripts/run-tests-log.mjs`、`logs/test-logs/` |
| P0-6 数据刷新 | `unified-sync.mjs` 已重跑，`_stale` 清零 | `docs/pipeline/*.json` |
| **P1-5 数据库迁移** | **已完成**：`DatabaseMigrator`（`PRAGMA user_version` 版本戳 + 事务化 + fail-fast + mock 环境自动跳过）；sessions.db（v1 基线 + v2 索引）与 langgraph-checkpoints.db 已接入；真实存量库副本验证数据零丢失。**新增迁移只追加不改历史，基线必须幂等** | `core/src/db/`、`langgraph/src/memory/checkpointerMigrations.ts`、`docs/72` |
| **P1-6 错误中间件 + CI 冒烟** | **已完成（收尾）**：`errorHandler`（/api/* 统一 `{success:false,error:{code,message}}`，堆栈只进日志，headersSent 防护）+ `asyncHandler`（**Express 4 不捕获 async 路由 rejection，async 路由必须包裹**）+ `scripts/smoke-test.mjs` + ci.yml `smoke-test` job（真实启动→health→sessions）；命令 `pnpm smoke` | `server/src/middleware/errorHandler.ts`、`scripts/smoke-test.mjs`、`docs/73` |
| **P1-3 MCP 升级** | **已完成（P1 全清）**：`StreamableHttpTransport`（2025-06-18 规范：单 JSON/SSE 响应分派、Session-Id、Protocol-Version 头、DELETE 终止）+ `MCPClient` 双传输分派（`url`/`command` 二选一）+ 版本协商（2025-06-18/2025-03-26/2024-11-05）；补 stdio 遗漏的 initialized 通知。**未实现：GET 长连接推送通道（server-initiated 场景再引入）** | `core/src/mcp/`、`docs/75` |
| **P1-1 服务端拆分** | **✅ 六批全部完成（2026-09-18）：`index.ts` 3827 → 389 行（-89.8%），达成 ≤500 目标**。第六批抽 `bootstrap.ts`（模型目录初始化 / createWsHub / createAutomationSystem / createIMManagerFor / applySecurityMiddleware）。全量回归 1729/1729 | `packages/server/src/routes/`、`bootstrap.ts`、`docs/66` |

### 🔧 纯搬迁后的死导入核查（linter 不管这个）

纯搬迁式重构后，源文件会残留**只剩导入行的死导入**（如 v0.6.37 清理的 12 个：
`SandboxManager` / `checkDockerAvailability` / 6 个语义函数 / `AnyIMConfig` / `IMPlatform` /
`readdirSync` / `statSync`）。语言服务器**不报错**，靠逐符号计数核查发现。

**做法**：搬迁完成后写一个临时 `.mjs` 脚本，对每个被搬走的符号做
`new RegExp('\\b' + name + '\\b','g')` 全文计数 —— 计数 = 1（仅导入行）即死导入。
**⚠️ 不要用 `node -e` 内联脚本做这事：本环境 shell 会剥引号，正则全部失效、计数恒为 0（假象）。**

### ✂️ 大块删除/搬迁的双重验证（v0.6.38 教训）

块级搬迁（>100 行的删除）用"首个 `{` 配对"脚本时，`Array<{...}>` 类型注解会让
括号深度**提前归零** → 删除被截断，残留**语法合法但行为错误**的代码
（如 `return` 裸露在函数外层会提前退出；语言服务器甚至 0 诊断，静默通过！）。

**必须做双重验证，缺一不可**：
1. **残留核查**：对每个被搬走的符号全文计数（过滤 `//` / `*` 注释行），
   非注释残留 = 迁移不完整
2. **路由快照比对**（服务端）或等价的"可证明等价"测试

### ⏱️ TDZ 陷阱：注册式搬迁会"提前求值"（v0.6.39 教训）

旧代码把对 `const` 的引用写在**路由回调里**（请求时才执行，createApp 早已完成），
因此引用"定义在后"的变量从未报错。改成**注册式**后，依赖注入让引用在 createApp
**立即求值** → `ReferenceError: Cannot access 'x' before initialization`，测试文件直接加载失败。

- **语言服务器不报 TDZ**（静态上完全合法）——又一个"编译通过 ≠ 运行正确"的实证
- 解法：把被引用的 `const` 定义**上移**到注册点之前（函数声明有提升无需动）
- 判别法：搬迁前先问"这段代码引用了哪些定义在**后面**的 const？"——有就要么上移，要么延迟注入

### ⏳ 偶发超时的系统性根因（2026-09-18 已修复，改这块前必读）

`GET /api/semantic/map` 假失败反复发生的机制 = **无缓存的同步重操作 + 紧超时预算 + 收官期负载尖峰**：

1. `routes/semantic.ts` 的 map/search/references 原先**每次请求都同步全仓扫描**
   （绕过了 core `SemanticTools` 的 60s 缓存）；常态 1~3s vs vitest 15s 超时，余量仅 5~15 倍
2. 收官期连环重负载（tsup 重建 + verify:all 启动真实服务器探针 + 复验；实测整套 54s vs 常态 30s）
   让最重的同步操作首先击穿预算

**已修复**：路由层补 60s 缓存（key=`workspace|depth|maxFiles`，`refresh=true` 强制重建）+
两个用例超时放宽到 30s。
**教训**：① 请求处理器内的同步重扫描，超时预算必须按最坏负载（而非常态）设定；
② 单包复验紧跟全量回归/构建跑出的超时，先复跑再定性。
（详 `docs/66` §5.5、`docs/修复汇总.md` 2026-09-18 第六批条目）
| **P1-4 Markdown 加固** | **已完成**：修掉 2 个 XSS 缺口（`"` 未转义导致属性逃逸、`javascript:` 协议未过滤）+ README 裸 HTML 无消毒；补上表格/有序列表/代码高亮 | `packages/frontend/src/utils/markdown.ts`、`docs/67` |
| **P1-2 思维链支持** | **已完成**：推理模型思考过程解析与展示，`reasoning_content` / `reasoning` 双字段归一化；契约是**正文与思考过程严格分离**（思考不入上下文） | `core/src/adapters/OpenAICompatibleAdapter.ts`、`docs/68` |
| **校验体系去盲区** | **已完成**：新增 `pnpm verify:all`；全部 `verify-*.mjs` 统一输出 `__VERIFY_STATUS__=PASS\|FAIL\|SKIP` | `scripts/verify-all.mjs` |
| **模型目录自动化** | **已完成**：目录自动生成 + 多源降级链 + 厂商 `/models` 直连补齐 + 来源可见 | `scripts/refresh-models-catalog.mjs`、`docs/69` |

### 🧩 模型目录（详见 `docs/69`）

**模型列表**走厂商 `/models` 直连（国内可达、第一手）；**元数据**走目录分发。
降级链：`自定义URL → 本地文件 → 额外镜像 → GitHub raw → jsDelivr → 本地缓存 → 应用内置`。
环境变量 `EASYAGENT_MODELS_CATALOG_URL/FILE/MIRRORS`；自建 Forgejo（localhost:3000）可作镜像源。

**三条铁律**：① 远程源失败只告警不清空（缓存兜底）② 厂商抖动不删模型（只增不删）
③ 直连发现的新模型标 `unverified`，界面可区分，不把保守默认值当真实规格。
排障第一问：`GET /api/providers/catalog/status` 看 `source`/`stale`/`ageDays`——**下载成功 ≠ 数据新鲜**。
目录过期用 `pnpm models:refresh`；`pnpm verify:all` 检查是否超 30 天。

### ✅ 校验体系的正确用法（v0.6.32 起）

**一律用 `pnpm verify:all`，不要用 `node scripts/xxx.mjs | Select-String '✅|❌'` 这类过滤写法。**

原因：过滤只保留含标记的行 —— 脚本崩溃 / 走"跳过"分支 / 输出格式变化时会**一片空白**，
而空白极易被误读成"没报错=通过"，实际上**一次都没校验**。

**三种状态**（`verify-all` 会把 SKIP 单独列出）：

| 状态 | 含义 | 退出码 |
|------|------|:---:|
| `PASS` | 校验通过 | 0 |
| `FAIL` | 发现真实问题 | 1 |
| `SKIP` | **未做校验**（网络/环境原因） | 0 |

⚠️ **`SKIP` 退出码为 0，但不可当作通过。**

**新增校验脚本时必须遵守**：结尾打印 `__VERIFY_STATUS__=PASS|FAIL|SKIP`，
并在 `verify-all.mjs` 的 `VERIFIERS` 清单里登记（否则不会被汇总到）。

> **只验证"能通过"是不够的**：新增门禁必须做**负向测试**（故意注入一个违规样本，
> 确认它真的失败）。不做这一步就等于加了一道假的安全网。
> 已有先例见 `docs/71` §2.4（组件类名门禁的双向验证）。

### ⚠️ 服务端响应字段是「逐字段映射」的（加字段前必读）

`/api/providers` 等接口**不是整对象透传**，而是逐字段重新挑选。因此**新增模型/提供商字段时
必须同时改三处**，否则字段会在无声无息中丢失：

1. `formatPresetModel()`（服务端 `index.ts`）
2. `/api/providers` 的 models 映射
3. `/api/providers/all-models` 的映射

> 实例：v0.6.33 引入的 `unverified` 就在这三处被丢掉，导致 v0.6.36 之前界面一直
> 把厂商直连发现的模型的**保守默认值当成真实规格**显示（`¥0` 被读成"免费"）。

### 🎨 样式类名：不存在也不会报错（本仓库已复发 3 次）

| 时间 | 现象 |
|------|------|
| P0-5 | `tailwind.config.js` 引用未定义的 CSS 变量 |
| v0.6.29 | `prose prose-invert` 依赖未安装的 `@tailwindcss/typography` |
| v0.6.36 | `badge-green`(4)/`badge-yellow`(1)/`badge-blue`(1) 均不存在（实有 `badge-success/warning/error/info/neutral`） |

**共同点：写错类名不会报错，只是"看起来有点不对"，肉眼极易放过。**

- 校验命令：`pnpm verify:classes`（已并入 `pnpm verify:all`）
- **新增组件类家族时必须登记进 `scripts/verify-component-classes.mjs` 的 `COMPONENT_FAMILIES`**，
  否则该家族不受保护
- 为何不自动派生前缀：会把 Tailwind 自身命名空间（`overflow-hidden` 等）也纳入校验 → 大量误报

### 📝 前端 HTML 渲染安全（改任何 `dangerouslySetInnerHTML` 前必读）

**只有一条合法路径**：所有 Markdown 内容（AI 回复 / 知识库 / 插件市场 README）都走
`renderMarkdown()`（`utils/markdown.ts`）：markdown-it `html:false` 转义原始 HTML +
`isSafeUrl` 协议白名单（`javascript:`/`data:`/`vbscript:`/`file:` 全部拦截）+
链接统一 `rel="noopener noreferrer"`。

**核心原则：消除信任面，而不是过滤危险内容。** 服务端 GitHub README 取的是
**原始 Markdown**（`Accept: application/vnd.github.raw`，已实测可用），因此**不存在
"远程 HTML 进 DOM"这一步**。`sanitizeHtml()` 与 `dompurify` 依赖已随之移除
（若将来真出现无法避免的远程 HTML，需恢复 DOMPurify + 消毒回归用例 + jsdom 环境）。

**历史教训**：原自研正则渲染器只转义 `& < >` 而**漏了 `"`**，链接 `href="$2"` 可被挣脱；
且 URI 协议完全不过滤 → `[x](javascript:alert(1))` 点击即执行。
另：`PluginsMarket` 曾把 GitHub 渲染后的裸 HTML（含内联 SVG）直接塞进 `dangerouslySetInnerHTML`。

### ⚠️ 环境陷阱（本仓库特有）

| 陷阱 | 现象 | 解法 |
|------|------|------|
| **pnpm 安装被 IDE 批量删除保护拦截** | `ERR_PNPM_LINKING_FAILED` / `SAFE_DELETE_BULK_CONFIRM_REQUIRED`，count 501 > 500；依赖进了 store 但**没链接到包**，且 `package.json` 未更新；计数 scope 是 turn，**重试不归零** | 手动写 `package.json` + `pnpm install`；必要时对**该条命令**设 `CODEBUDDY_SAFE_DELETE_ENABLED=0`（IDE 源码第 22 行的开关），跑完立即 `Remove-Item Env:CODEBUDDY_SAFE_DELETE_ENABLED` |
| **中断的 install 会静默破坏其他包链接** | desktop 包 0 用例，报 `Failed to resolve "@testing-library/jest-dom"`，而前端测试全绿 | 跑**全量** `pnpm install` 修复。**改依赖后必须跑全量回归**——只看改动所在的包会漏掉跨包链接损伤 |
| **DOMPurify 在 happy-dom 下不可靠** | 连 `<p>`/`<h2>`/`<span class>` 都被整类剥掉（默认配置亦然），多元素时 `<script>` 反而可能存活 → 安全断言会给出**错误结论** | 测试文件加单文件指令 `// @vitest-environment jsdom`。本仓库默认用 happy-dom（v0.6.22 为规避 React 重复实例），但**不渲染 React 的测试文件**可安全切 jsdom |
| **引用不存在的定义不报错** | `prose prose-invert` 类（未装 `@tailwindcss/typography`）、Tailwind 令牌指向未定义 CSS 变量——都是静默失效 | 用脚本门禁兜底：`verify-css-tokens.mjs`；新引入第三方类名前先确认依赖已安装 |
| **vitest 别名挡住原生 better-sqlite3** | core 的 vitest 把 `better-sqlite3` 别名到内存 mock（pragma 无感知）→ 依赖真实 SQLite 语义的代码在单测中拿不到 user_version/事务回滚 | 专项测试用 `createRequire(import.meta.url)('better-sqlite3')` **绕过 Vite 别名**加载真模块（P1-5 先例，`DatabaseMigrator.test.ts`）；迁移器对 mock 环境自动跳过（读到版本为 null） |

### 🛡️ 服务端重构的安全网（改 `server/src/index.ts` 前必读）

| 手段 | 命令 | 作用 |
|------|------|------|
| 路由清单快照 | `pnpm --filter @easyagent/server test` | 93 条路由与基线**双向**比对，丢/多都会失败；另有重复注册断言 |
| 运行时行为 | `pnpm verify:server-routes` | 验证**注册顺序**与静态托管（单测覆盖不到） |
| 类型检查 | 语言服务器诊断（IDE） | 依赖注入漏字段必然失败。**⚠️ 根 tsconfig `exclude` 含 `packages`，跑它是空跑** |

**拆分四原则**：① 纯搬迁（路径/方法/逻辑/顺序全不变）② 显式依赖注入（每个模块自己的 `XxxRoutesDeps`，不要"上帝上下文"）③ `__dirname` 由调用方传入（它取决于**构建产物**布局，在新模块里取会让"拆文件"改变路径解析）④ 顺序约束写进模块头 + 调用点两处注释

**必须保持的注册顺序**：
- `registerStaticRoutes` **最后调用** → 内含 `/api/*` 404 兜底与 SPA fallback；顺序错会让未匹配 API 返回 `200 + index.html`（前端把 HTML 当 JSON 解析，报错与根因无关）
- 知识库 `/api/knowledge/stats/summary` **必须先于** `/api/knowledge/:id`

**更新路由基线**：`$env:UPDATE_ROUTE_INVENTORY='1'; pnpm --filter @easyagent/server test`，然后**必须 review 基线 diff**

### 🧠 上下文工程要点（P0-4，改这块代码前必读）

- **开关**：`EASYAGENT_CONTEXT_V2=0` 完全回到改造前行为（无需改代码即可回滚）
- **档位**：小档 ≤40k 只给 17 个核心工具（白名单）；中档 ≤200k 排除 23 个；大档仅排除 `benchmark_*`
- **关键不变量（有专门用例守护，改动时勿破坏）**：
  1. 历史压缩**不得拆散** `assistant(tool_calls)` ↔ `tool` 结果（否则 provider 报 400）
  2. 压缩只作用于「发给模型的工作集」，**会话落盘用 `fullHistory`**（压缩不能导致历史丢失）
  3. medium/large 档用**排除清单**而非白名单 → **新增工具默认可见**
  4. **模型不支持 function calling 时必须保留内联工具描述**（否则能力直接消失）
  5. 工具结果落盘必须在**工作区内**（`FileTools.safePath()` 拒绝工作区外路径）
- **相关陷阱**：`benchmark_*` 工具全档位排除（陷阱 #41：普通聊天误暴露会导致死循环）
- **度量**：`pnpm measure:context`（需先构建 core）

### 新增命令（务必记住）

```bash
pnpm test:log            # 全量回归 + 分级测试日志（logs/test-logs/<日期>_<时间>_<范围>/）
pnpm test:log:smoke      # 冒烟（web + frontend，秒级）
pnpm verify:data         # 测试数据一致性门禁（CI 用）
pnpm verify:tokens       # 设计令牌一致性门禁（CI 用）
pnpm verify:runtime-log  # 运行日志链路验证（落盘 + DEBUG + 毫秒时间戳）
pnpm log --label 构建web --cwd packages/web -- npm run build   # 命令输出自动存档
```

### 🔴 日志体系（2026-09-18 建立，禁止再往 temp/ 或系统临时目录写日志）

| 类型 | 位置 | 生成方式 | 入库 |
|------|------|---------|:---:|
| **运行日志** | `logs/runtime/easyagent-YYYY-MM-DD.log` | 运行时自动（每日轮转，保留 30 天） | ❌ |
| **测试日志** | `logs/test-logs/<日期>_<时间>_<范围>/` | `pnpm test:log` | ✅ 汇总；`raw/` 忽略 |
| **命令输出** | `logs/build-logs/<日期>_<时间>_<标签>.log` | `pnpm log --label X -- <命令>` | ❌ |
| 历史归档 | `logs/test-logs/archive/`、`logs/build-logs/archive-2026-09-18/` | 手工 | ✅ |

**两条通道的级别故意不同（这是"看不到 debug"的答案）**：
- 控制台：`LOG_LEVEL` > `EASYAGENT_DEBUG`，默认 **info**（保持清爽）
- 文件：`EASYAGENT_LOG_FILE_LEVEL`，默认 **debug**（事后必须查得到细节）

其余变量：`EASYAGENT_LOG_DIR`（目录覆盖）、`EASYAGENT_LOG_RETENTION_DAYS`（默认 30）。
路径规则：服务端/CLI 用 `<cwd>/logs/runtime/`；Electron 用 `~/.easyagent/logs/runtime/`（工作目录不可控）。
**服务端启动时会主动打印日志文件路径**。

**日志分级纪律（本轮同时纠正）**：循环/轮次这类细节用 `debug`，不要再写 `info`（否则刷屏并淹没真正的状态变更）。
实测改造前 core 包 105 info / 60 error / 54 warn / **仅 6 debug**，server、desktop、cli 的 debug 调用数为 **0**。

### 🔀 双通道发布（GitHub + Forgejo，2026-09-18 建立）

| remote | 地址 | 认证 | Release |
|--------|------|------|---------|
| `origin` | `git@github.com:ht182400-creator/easyagent.git` | SSH | 由 `.github/workflows/release.yml` 在 tag 推送时**自动创建**（含 EXE） |
| `forgejo` | `http://localhost:3000/ht182400/easyagent.git` | HTTP Basic | **需手动调 API 创建**（该实例无工作流，仅源码归档） |

- Forgejo 实例：`http://localhost:3000`（`16.0.2+gitea-1.22.0`），用户名 **`ht182400`**（⚠️ 不是 `ht82400`，少一个 `1` 会得到 `user does not exist`），仓库 `ht182400/easyagent`（公开）
- **推送命令**：`pnpm push:forgejo`（脚本 `scripts/push-forgejo.mjs`）
- **🔴 凭据纪律**：`FORGEJO_USER` / `FORGEJO_TOKEN` **只从环境变量读**，绝不写进 remote URL / `.git/config` / 文档 / 代码。
  脚本通过**一次性 `http.extraHeader`** 注入 Basic 头 → 不落盘、不进 reflog。（写入 remote URL 会残留在 `.git/config` + reflog，已验证规避）
- 完整流程与踩坑：`docs/64_Forgejo发布指南.md`
- ⚠️ 推送前**必须** `git fetch forgejo` 比对历史是否同源；不同源绝不可 force push，须先与用户确认

### 🪤 通用陷阱：Node 调用 git 必须同时捕获 stdout 与 stderr（2026-09-18 实测）

`execFileSync('git', args)` **只返回 stdout**，而 git 的以下输出**全部走 stderr**：
- 推送结果（`old..new  main -> main`、`Everything up-to-date`）
- 大部分错误原因（401、非快进、找不到远端）

**后果**：成功会被报成"无变化"（`output` 为空 + `|| '默认文案'` 兜底），失败也可能被报成成功。
**规避**：用 `spawnSync` + `stdio: ['ignore','pipe','pipe']`，把 `stdout + stderr` 合并后再判断。
**适用**：任何"包装外部命令并依据输出做判断"的脚本（`push-forgejo.mjs`、`run-logged.mjs`）——已修 `013e996`。

### 版本号现状（2026-09-18）

- `version.json` = **0.6.40**，tag = **v0.6.40**（本次发布：P1 收官——拆分/bootstrap/P1-5 迁移/P1-6 错误中间件+冒烟）
- 发版后 post-commit 钩子会再次改写 `docs/pipeline/*.json` → **工作区长期残留这 5~6 个文件的差异属正常生成物行为**，用 `git commit --no-verify` 可收敛一次，但钩子会再跑一轮（不必继续追）

### 新增/变更的环境变量（服务端）

| 变量 | 默认 | 说明 |
|------|------|------|
| `HOST` | **`127.0.0.1`**（已改，原 `0.0.0.0`） | 公网部署须显式设 `0.0.0.0` |
| `EASYAGENT_API_TOKEN` | 自动生成并持久化到 `~/.easyagent/api-token` | 非回环访问必需；回环（桌面/本地）免鉴权 |
| `EASYAGENT_ALLOW_REMOTE_NO_AUTH` | 未设置 | 置 `1` 才允许"公网 + 无令牌"裸奔（不推荐） |
| `EASYAGENT_TRUST_PROXY` | 未设置 | 置于 Caddy/Nginx 之后必须设为代理层数（如 `1`），否则 `req.ip` 恒为代理地址 → 回环判定与限流失真 |
| `EASYAGENT_DISABLE_RATE_LIMIT` | 未设置 | 置 `1` 关闭限流（仅压测/测试用） |

**公网部署三步**：`HOST=0.0.0.0` → `EASYAGENT_API_TOKEN=<强随机>` → `EASYAGENT_TRUST_PROXY=1`。浏览器首次访问 `http://域名:端口/?token=<令牌>` 自动换取 Cookie。

### 测试修复明细（P0-2）

| 位置 | 性质 | 修复 |
|------|------|------|
| `core` plugin-manager「卸载不存在的插件应静默处理」 | 用例断言与实现不符 | `toBeUndefined()` → `toBeNull()`（实现契约为 `Promise<string \| null>`） |
| `server` langgraph-engine「默认/未知值」×2 | **用例非密封**：被仓库真实 `engine.config.json` 影响 | 给 `resolveEngineSource/getEngineType` 增加依赖注入（`env` / `configProvider`），用例注入 `() => null` |
| `server` middleware-security「X-Frame-Options」 | 用例过期 | `DENY` → `SAMEORIGIN`（代码已刻意改为支持同源 iframe） |
| `server` plugin-market-service「onPluginUnload 回调」 | 用例过期 | 断言改回真实契约（收到原始 `pluginId`，用回调回传的 manifest name 定位目录） |
| `langgraph` 「resume 恢复会话」 | **用例缺陷**：只配了 1 条 Mock 回复 | 补第 2 条回复，并把断言收紧为"必须拿到第 2 条回复 + 历史被恢复" |
| `frontend` api.test.ts「连续失败后应最终拒绝」 | **unhandled rejection** → 用例全绿但退出码非零 | 立即挂载 rejection 处理，再推进定时器 |

> ⚠️ 注意：`_vitest-desktop.json` 的 mtime 曾停留在 2026-06-27，导致"30 个孤儿测试"的错误结论（详见 `docs/62` 更正说明）。**判断测试状态必须重跑，不能只看管线快照。**

---

## 1. 项目概述

- **项目**: EasyAgent — 集成中国主流大模型的开源 AI 编程助手
- **版本**: v0.6.25（唯一版本源 `version.json`，改后跑 `node scripts/sync-version.mjs`）
- **仓库**: https://github.com/ht182400-creator/easyagent（SSH 推送）
- **技术栈**: TypeScript 5.x + React 18 + Vite 5 + Tailwind 3 + Zustand 4 + Express + WS + Electron 30 + SQLite(better-sqlite3) + Vitest + tsup
- **Monorepo（12 包）**: `core`(引擎/工具/适配器) / `langgraph`(StateGraph 引擎) / `server`(Express API+WS) / `frontend`(共享 UI) / `web`(薄壳) / `desktop`(Electron) / `cli` / `vscode`(未完成) / `plugin-template` / `easyagent-plugin-obsidian-doc-viewer`
- **双引擎**: `AgentEngine`（ReAct while 循环，默认）+ `@easyagent/langgraph`（Think-Act-Observe 图）。三级优先级选择：CLI `--engine` > `EASYAGENT_ENGINE` > `engine.config.json` > 默认 `legacy`。详见 `docs/53`、`docs/54`
- **模型接入**: `PROVIDER_PRESETS` 11 家；模型目录四级降级（远程 GitHub/CDN → 本地缓存 24h → 内置 `models-catalog.json` → 硬编码兜底）
- **⚠️ 2026-09-18 实测基线（勿再用旧数字）**: 定义用例 **1718**（模块映射口径，48 个映射文件）；**Vitest 已执行 1758，全部通过，0 失败**（P1-5 迁移器 +18、P1-6 错误中间件 +6、P1-3 MCP Streamable HTTP +5 后）。**历史值 1195 / 1260 / 1514 / 1561 / 1572 / 1624 / 1635 / 1629 / 1640 / 1664 / 1675 / 1661 / 1672 / 1669 / 1680 / 1685 / 1696 / 1699 / 1710 / 1715 / 1726 / 1729 / 1747 / 1753 均已过期**。真源 = `docs/pipeline/test-case-mapping.json`，由 `node scripts/verify-data-consistency.mjs` 作为 CI 门禁校验（见 §12）

---

## 2. 核心规则速查

| # | 规则 | 要点 |
|---|------|------|
| 1 | **编译+测试不可省** | 改完必须 `py_compile` 等价物（tsc/vitest）全绿 + `read_lints` 到零 ERROR |
| 2 | **日志必分级** | debug=入口/出口/参数；info=状态变更；warn=可恢复；error=不可恢复（带 traceback/堆栈）。禁止裸 `console.log`（.mjs 用 `scripts/lib/logger.mjs`） |
| 3 | **try-catch 不吞异常** | 文件 I/O / 网络 / 外部进程 / 输入解析必须包；catch 里 `log.error(..., { error, context })`，禁止 `pass` |
| 4 | **禁止硬编码** | 魔法数字/字符串/路径/超时/阈值 → `UPPER_SNAKE_CASE` 常量（或 `_config`） |
| 5 | **单文件 ≤500 行** | 超了按职责拆。⚠️ 现存超标：`docs/pipeline/index.html` 2201 行、6 个前端页面 664~747 行（**用户 2026-09-18 决策保留不拆**：行数无运行时性能影响，可维护性可接受；仅当某页因迭代膨胀 >1000 行时再按 `pages/<page>/` 范式拆）。`server/src/index.ts` 已拆至 389 行 |
| 6 | **改签名 → 查所有调用方** | 搜全项目同步更新 |
| 7 | **不猜 → 先搜** | 先搜官方文档/社区，禁止凭感觉写 |
| 8 | **收尾更新文档** | `.codebuddy/memory/YYYY-MM-DD.md` + `docs/修复汇总.md` + 相关 `docs/` |

**源码编译**: `packages/core/src` 中 `.ts` 与产物 `.js/.d.ts` 共存 → 测试导入用 `.js` 扩展名；改 `.ts` 后需同步编译；**删除 `packages/server/src/index.js` 等旧产物**（否则 vitest 优先加载旧 JS）。

**构建工具**: electron-builder **精确锁 23.6.0**（勿升 v24）；用 `pnpm exec`；原生模块预编译 + `npmRebuild:false`；external 框架的子依赖必须全部显式声明（Express 58 / pino 13 / multer 6 / cors 2，见 `packages/desktop/express-deps.json`）。

**API 规范**: Desktop 统一 `127.0.0.1:3456`（不用 `localhost`，Windows IPv6 陷阱）；`apiFetch` 已内部 `.json()`，调用处**禁止再 `.json()`**；CSP `connect-src` 必须含 `http://127.0.0.1:3456 ws://127.0.0.1:3456`。

**Desktop 打包**: `index.html` 不用 `<style>`（Vite 5 bug）；`@import` 必须在所有规则之前；HashRouter；`tailwind.config.js` 的 `content` **必须含** `'../frontend/src/**/*.{js,ts,jsx,tsx}'`。

**版本/CSP 校验**: `packages/desktop/scripts/verify-build.cjs`（17 类 30+ 项）第 6 项拦截旧版本号硬编码；命令白名单来自 `EASYAGENT_ALLOWED_COMMANDS`。

**Memory 写入纪律**: 每日日志 `YYYY-MM-DD.md` 是**追加式**，严禁覆盖/删减（反例：2026-06-19 用 `write_to_file` 覆盖 575 行 → 25 行事故）；`MEMORY.md` 可就地更新保持精简。

**修复记录双轨**: `MEMORY.md` = 简表（一行一条）；`docs/修复汇总.md` = 详表（`## YYYY-MM-DD HH:MM — 标题`，新→旧）。修复完**必须**追加详表。

**调试日志开关**: `LOG_LEVEL` > `EASYAGENT_DEBUG`；`.bat` 的 `[DEBUG]` 行需 `if %_DBG%==1` 包裹。

**Memory MD 格式（管线解析器依赖）**: 每问题独立 `## [模块:ID] 标题 (HH:MM)`；必含 `- **问题**:` / `- **修复**:` / `- **状态**: ✅ resolved`；纯操作流程**不要**加 `[模块:ID]`；解析器实现见 `docs/pipeline/memory-format-spec.md`。

**模块 ID 速查**: F1 多模型适配 / F2 Agent / F3 工具 / F4 知识库RAG / F5 MCP / F6 沙箱 / F7 CLI / F8 Web Dashboard / F9 Desktop / F10 插件技能 / F11 IM / F12 i18n / F13 自动升级 / F14 模型目录 / F15 去硬编码 / F16 版本控制；B1a Web↔Desktop 合并 / B2b CI-CD / B3a 安装脚本 / B3b VS Code 插件；P5a 管线解析 / P5b 管线 API / P5c 仪表板；lg1~lg6 LangGraph 六项。

---

## 3. 关键陷阱清单

> 范围标记：🖥️=Desktop 专属 / 🌐=Web 专属 / 🔀=两者影响。**新 bug 修复后必须在此加一行 + 在 `verify-build.cjs` 加检查**。

| # | 🎯 | 陷阱 | 修复 |
|---|-----|------|------|
| 1 | 🔀 | electron-builder v24 意外升级 → NSIS EnVar 缺失，exe 仅 0.3MB | 精确锁 23.6.0，删 v24 残留 |
| 2 | 🔀 | Vite 5 `<style>` 内联 → `No matching HTML proxy` | 改外部 CSS link |
| 3 | 🖥️ | `localhost` 解析成 IPv6 → Dashboard 全 `--` | 全改 `127.0.0.1` |
| 4 | 🖥️ | 双重 `.json()` → 数据不显示且错误被吞 | `apiFetch<T>(url).then(d => ...)` |
| 5 | 🔀 | CSS `@import` 不在首行 → Tailwind 失效 | 移到最顶部 |
| 6 | 🔀 | pnpm symlink → asar 里找不到 `@easyagent/core` | tsup `noExternal` bundle |
| 7 | 🔀 | Express 子依赖遗漏 → `Cannot find module 'body-parser'` | 显式声明全部子/孙依赖 |
| 8 | 🖥️ | VS Code watcher 锁定 → 删 app.asar `Access Denied` | watcherExclude + taskkill |
| 9 | 🖥️ | better-sqlite3 原生编译失败 | 预编译 `.node` + `npmRebuild:false` |
| 10 | 🔀 | `packages/server/src/index.js` 残留 → vitest 加载旧 JS | 删除旧编译产物 |
| 11 | 🖥️ | apiFetch 双重 `.json()` 全项目 13 文件 43+ 处 | 去掉 `res.json()`，直接用返回值 |
| 12 | 🔀 | bat `[!]` + 延迟扩展冲突 → 整行解析崩溃 | 改 `[^^!]` |
| 13 | 🔀 | bat 中文乱码（CMD 936 vs UTF-8） | JSON 数据本身正确，仅显示层；见 §4 |
| 13a | 🔀 | git status 中文名显示 octal 转义 | `git config --global core.quotepath false` |
| 14 | 🔀 | bat `:::` 注释被当非法 label → CMD 崩溃 | 全部改 `rem` |
| 14a | 🔀 | CMD `if(...)` 块内 echo 含 `)` → 块提前关闭（`^)` 不可靠） | 改 `goto` 标签模式 |
| 15 | 🔀 | `execSync('node ' + path)` 路径含空格被截断 | 加双引号 `node "${path}"` |
| 16 | 🔀 | `.mjs` 含 TS 类型注解 → SyntaxError | 纯 JS |
| 17 | 🔀 | esbuild 0.20.1 对 catch 语法脆弱 → `Expected "finally"` | 统一 `catch (err)`；verify #9 拦截裸 `catch {}` |
| 18 | 🔀 | PowerShell `Set-Content` 默认 ANSI → 76 个中文文件被毁 | **只用 Node `writeFileSync(..., 'utf8')`**；verify #14 检测 |
| 19 | 🔀 | pnpm v11 `allowBuilds` 占位文本被当 false | 显式设 `true` |
| 20 | 🖥️ | asar 内加载 better-sqlite3 失败 | `!node_modules/better-sqlite3/**` 排除出 asar + `extraResources` |
| 21 | 🖥️ | `mime` 缺失 → Release 下 Express 500 | desktop 显式加 `"mime": "^1.6.0"`（**不是 2.x**）；verify #11 |
| 22 | 🖥️ | 开发/Release better-sqlite3 MODULE_VERSION 不一致（137 vs 123） | `npx node-gyp rebuild --target=30.0.0 --arch=x64 --dist-url=https://electronjs.org/headers --release`；verify #10 + build.bat Phase 2.5 |
| 23 | 🖥️ | electron-updater 传递依赖缺失（dev 可用/Release 崩） | desktop 显式加 8 个传递依赖；verify #12 |
| 24 | 🖥️ | Express 生态版本不兼容（iconv-lite/media-typer/ipaddr.js/encodeurl） | 保持监控；verify #13 WARN |
| 25 | 🖥️ | apiFetch 双重 `.json()` → TypeError 被静默吞 | 用 `apiFetch<T>` 泛型 |
| 26 | 🖥️ | HashRouter 下 `<a href>` → 黑屏 | 用 `<Link>` / `navigate()`；verify #15 |
| 27 | 🖥️ | asar 内 `PROJECT_ROOT` 只读 → 知识库写入 400 | `createApp({ projectRoot })`，Desktop 传 `homedir()` |
| 28 | 🔀 | CI `windows-latest` 升级 VS 2026 → node-gyp 不识别，0 jobs | 全部固定 `windows-2022` |
| 29 | 🖥️ | Desktop Tailwind `content` 漏 frontend → 布局类丢失 | 加 `'../frontend/src/**/*.{js,ts,jsx,tsx}'` |
| 30 | 🖥️ | `pnpm exec @electron/rebuild` bin 名歧义 + 不生效 | 改 `npx --yes node-gyp rebuild ...`；按文件大小判断 |
| 31 | 🖥️ | tsup 内联 server → asar 里两份 CORS，旧 main.js 覆盖新逻辑 | 改 server 后**同时** `tsup --clean` 两个包；asar 修补要同时替换两处 |
| 32 | 🖥️ | pnpm hardlink 下 node-gyp rebuild 假成功（exit 0 但文件未变） | 重建后查 mtime+大小+头值；verify Phase 2.5 |
| 33 | 🖥️ | electron-rebuild 在 pnpm 下静默跳过 | 直接用 `node-gyp` 显式参数 |
| 34 | 🖥️ | 5 个脚本争抢 `better_sqlite3.node` → MODULE_VERSION 反复变 | 精简为 2 个：`rebuild-sqlite3.mjs`（唯一编译入口）+ `sqlite3-loader.mjs`（运行时切换） |
| 35 | 🖥️ | 字节扫描 MODULE_VERSION 假阳性（始终 116） | 勿扫字节；用 SHA256 比对 + `rebuild-sqlite3.mjs --verify` |
| 36 | 🖥️ | build.bat sqlite3 路径基于 CWD → 误判"不存在"→ 每次多余 rebuild | 路径加 `%~dp0` 前缀 |
| 37 | 🖥️ | Desktop 独立 renderer CSS 与 frontend 两套 | ✅ 已删，统一由 `frontend/main.tsx` import |
| 38 | 🔀 | pnpm isolated 下 `pnpm exec eslint` 找不到 bin | 用 `scripts/lint.bat` / `clean.bat` 直调 `.pnpm` 路径 |
| 39 | 🖥️ | electron-builder 找不到传递依赖（pnpm isolated 无 `.pnpm/`） | tsup `noExternal` 内联 express/cors/ws/multer；pino 例外须保持 external |
| 40 | 🖥️ | LangGraph checkpoint 序列化丢 BaseMessage 原型方法（`getType is not a function`） | 统一用 `getMessageType(msg)`；`toChatMessages()` 用 hasToolCalls/getToolCallId |
| 41 | 🔀 | LangGraph 普通聊天误暴露 benchmark 工具 → 死循环 `Recursion limit reached` | 系统提示词约束；过滤 `benchmark_*`；`consecutiveFailures>3` 停止；`recursionLimit = maxTurns*3+10` |
| 42 | 🔀 | 小模型被 66 个工具 schema 污染（占上下文 19-25%）→ 语气偏移/输出 JSON 解释 | 按模型分级暴露工具（7B→15-20 个；70B+→完整） |
| 43 | 🌐 | 插件市场安装进度卡"准备中"（WS 未建立） | HTTP 轮询兜底 1s/次 ≤60s；终态清理 |
| 44 | 🌐 | 已安装插件仍显示"使用"（id 前缀 `local:` 不匹配） | 按 id + name 双匹配 |
| 45 | 🔀 | `fetch failed` 与 `Failed to fetch` 是两种字符串 | 错误匹配兼容两者 |
| 46 | 🔀 | Ollama 未启动 → 只显示 "fetch failed"，原因不明 | 区分后端宕机 vs 上游 LLM 不可达；给出"请运行 ollama serve" |
| 47 | 🔀 | 插件 `execute` 返回 string 而非 `ToolResult` → LLM 无意义反思循环 | 四层防御：模板修正 + `normalizePluginResult()` + actNode 兜底 + 可识别错误前缀 |
| 48 | 🔀 | LLM 非流式 → thinkNode 重复同一工具 → 160s 死循环 | 连续相同工具调用 ≥2 次即停；`consecutiveIdenticalToolCalls` |
| 49 | 🌐 | `tool_use` WS 事件早于 assistant 占位消息 → 工具卡片丢失 | handler 中自动补建占位消息 |
| 50 | 🌐 | toolCallId 不匹配（伪造两个不同 ID）→ 工具结果永远丢 | 用 LangChain `event.run_id` 作 toolCallId |
| 51 | 🌐 | Doc_project 面板集成 | Server 静态托管 `/doc-viewer/`（vite `base:'/doc-viewer/'`），`X-Frame-Options: SAMEORIGIN`，WS `open_panel` |
| 52 | 🌐 | 双缓存导致插件装到旧版本 | `RELEASE_CACHE_TTL=5min` + `skipCache` 层层穿透 + `POST /api/plugins/market/refresh` |

---

## 4. Windows bat 文件铁律

**三条禁令**（违反任一条 → CMD 报错信息与真实原因完全无关）：

| # | 禁令 | 替代 |
|---|------|------|
| 1 | 禁用 Unicode box-drawing 字符（`╔ ║ ⚠️` 等） | 用 ASCII `=====`、`[OK]`、`[FAIL]` |
| 2 | 禁用 `type file \| findstr`（chcp=65001 时管道截断） | `findstr /c:"kw" file > nul 2> nul` |
| 3 | 禁用 `chcp 65001`（CMD 公认 bug，echo 中文后解析器失序） | **不设 chcp**，中文 Windows 默认 936 |

**次要**: `:::` → `rem`；`if(...)` 块内 echo 含 `)` → 改 `goto`；文件存 UTF-8 without BOM。

---

## 5. Web ↔ Desktop 代码隔离约束

- 前端已统一为 `@easyagent/frontend` 共享包，Web/Desktop 通过 `mountApp()` 复用同一套 UI/状态/路由
- 各自入口（`web/src/main.tsx`、`desktop/src/renderer/main.tsx`）只注入平台配置

| 差异点 | Web | Desktop |
|--------|-----|---------|
| 路由 | `BrowserRouter` | `HashRouter` |
| 协议 | HTTP/HTTPS | `file://` + `http://127.0.0.1:3456` |
| IPC 桥接 | 无 | `ipcBridge.ts` → `window.easyAgent` |

- **改 UI/组件/状态 → 只改 `packages/frontend/src/`**；改入口/IPC → 改对应平台 `main.tsx` / `ipcBridge.ts`
- ⚠️ `frontend/src/main.tsx` **只导出 `mountApp`，绝不自行调用**（否则与 web/desktop 入口双重挂载 → 全局字体/布局异常）
- ⚠️ 改模块入口后 Vite HMR 缓存可能不一致（页面全空白、无 JS 错误）→ **重启 Vite**

---

## 6. 构建与启动命令

```bash
build.bat              # 快速测试 (--dir, ~60s)
build.bat --release    # 完整 NSIS 安装包 (~3min)
build.bat --verify     # 仅预检查
# 流程: 清理进程 → verify-build.cjs 预检查 → core/server/desktop tsup → vite build → electron-builder → 输出验证
# 输出: release/EasyAgent-<ver>-win-x64.exe 或 release/win-unpacked/EasyAgent.exe

start-backend.bat      # 后端 localhost:3456（可见窗口）
start-frontend.bat     # Web 前端 localhost:5173

pnpm build             # core → cli → server → desktop tsup
pnpm build:web         # web 生产构建
```
> ⚠️ 构建前必须清 `dist/renderer` 缓存（否则 Vite 复用旧产物，前端代码不更新）。构建链唯一入口是 `build.bat`，禁止手动逐步跑。

---

## 7. 测试与数据同步

```bash
pnpm test:all                    # core → server → langgraph → desktop → frontend → web → cli
pnpm run test:coverage           # 全包覆盖率
node scripts/unified-sync.mjs    # 统一同步管线数据（唯一入口）
node --test docs/pipeline/__tests__/pipeline-*.test.mjs
```

**🔴 触发即同步**（发布 Tag / 新增≥20 用例 / 增删测试文件 / CI 通过率变化）——必须同步 6 处：
`docs/03_测试案例文档.md` + `docs/pipeline/test-case-mapping.json`（`scripts/scan-test-cases.mjs`）+ `docs/pipeline/pipeline-data.json`（`scripts/update-progress.mjs`）+ `docs/pipeline/project-progress-data.json` + `MEMORY.md` + `CHANGELOG.md`

**违例判定**: `03_测试案例文档.md` 汇总表 ≠ `test-case-mapping.json._meta.totalTestCases`，或 `MEMORY.md` 版本行 ≠ 实际 → 视为不同步。

---

## 8. 管线系统（指针式）

- **唯一权威源**: `docs/pipeline/lib/module-registry.mjs`（30 模块 + testFiles 映射）→ `scripts/unified-sync.mjs` → 5 个输出文件 → API → 前端
- **唯一配置源**: `docs/pipeline/lib/pipeline-config.mjs`（KPI/评分/阶段/模块/`TEST_LEVEL4_MAP`/`TOOL_PARAMS_MAP`）
- **KPI 必须动态计算**，严禁硬编码通过率；`testCases` 来自 mapping，`passRate` 来自 `_vitest-*.json` 实时计算
- **三级渐进加载**: HTTP API → 静态 JSON 快照 → 内嵌骨架（兼容 HTTP/file:///离线）
- **数据一致性铁律**: `renderPassCharts` 必须从 `pipelineData.kpi` 取权威值，**不得从 items 反推**
- **CI 自动同步**: `ci.yml` 的 `sync-pipeline` job 在 6 个 job 全绿后自动下载 vitest artifacts → `unified-sync.mjs` → commit `[skip ci]`
- **新增模块流程**: 见 `docs/43_管线模块添加标准流程.md`（改 `module-registry.mjs` + `pipeline-parser.mjs` 的标签 regex）
- **关键命令**: `node docs/pipeline/server.mjs`（端口 8898）、`del docs\pipeline\.pipeline-cache.json` 强制重建缓存
- ⚠️ JS 的 `\b` 对中文无效 → 中文边界用 `(?![一-龥\w])`

---

## 9. 服务器部署

- **目标**: Windows 云服务器 `82.156.71.231:3456`，域名 `CCCN.fable5.icu`；项目根 `C:\easyagent`；服务器在 **NAT 后**（本机网卡是私网 IP）
- **架构**: 单 Node 进程，Server 用 `express.static(packages/web/dist)` 同时托管页面 + `/api/*` + `/ws`；前端 `apiBase:''` / `wsBase:'/ws'` 同源，无 CORS
- **部署构建链**: `core → langgraph → server → web`（web 由 Vite 直打包 `@easyagent/frontend` 源码）；启动 `node packages/server/dist/index.js`；生产 `PORT=80 HOST=0.0.0.0`
- **Node 版本**: 必须 Node 18/20/22 LTS（`preinstall` 拦截 ≥24）；启动前 `node scripts/sqlite3-loader.mjs system`
- **进程持久化**: SSH 会话里启动的 node 会随注销被杀 → 必须 `schtasks /create /tn ea_server /tr C:\easyagent\start.bat /sc onstart /ru SYSTEM /rl highest /f`；重启 = `Stop-Process -Name node -Force` + `schtasks /end` + `/run`
- **部署流程**: 本地 `pnpm run build:server` → `scp packages/server/dist/* Administrator@82.156.71.231:C:/easyagent/packages/server/dist/` → 重启
- **CORS 致命坑（已修）**: 公网 IP 不在白名单 → 子资源 500（首页正常）。修法：前置同源预判定中间件（比较 Origin 的 host:port 与 Host 头一致即摘 Origin 让 `cors` 按同源放行）+ `CORS_ORIGIN` 环境变量白名单。**不要整包删除 cors**。详见 `docs/60` §4.4
- **交付物**: `docs/60_服务器部署指南.md`、`scripts/deploy-server.ps1`、`scripts/start-server.cmd`；HTTPS 用 Caddy 反代

---

## 10. Git / 插件 / LangGraph 速查

**Git 陷阱**
- 内嵌 git 仓库（`packages/plugin-template`、`packages/easyagent-plugin-obsidian-doc-viewer`）会被当成 gitlink(160000) → `git rm --cached -f <dir>` → 删其 `.git` → 再 `git add`
- 管线钩子会在每次提交后改写 `docs/pipeline/*.json` → 提交无法收敛。对策：`git commit --no-verify` 终止循环（post-commit 钩子不受影响，工作区仍留 5 个 JSON 差异属正常生成物行为）
- 同步排除清单：`temp/`、`未命名.base`、`.obsidian/plugins/*`、`packages/*/docs/.obsidian/`
- ⚠️ 发版 commit **绝不能含 `[skip ci]`**（tag 指向该 commit 会连 tag push 一起跳过）；发版前 `git add .` 前先 `git checkout HEAD -- docs/pipeline/`

**插件系统**
- 支持两种 `default export`：对象式（官方协议，`register(context)` + `getTools/getSkills/getHooks`）与函数式（兼容）
- 包格式：GitHub Release zipball + 根目录 `manifest.json`；发现方式：仓库打 `easyagent-plugin` topic
- 隔离：`PluginSandbox.ts` Worker Threads + `PluginPermission.ts`（默认拒绝，四级 none/readonly/standard/full）
- ⚠️ `PluginSandbox` 加载 `PluginWorkerEntry.js` 时 **sibling 优先，回退 `<core>/dist/`**；勿留 `src/plugins/PluginWorkerEntry.js` 历史残留
- ⚠️ `tsup` 用对象 entry 独立输出 `PluginWorkerEntry.js`（`splitting:false` 会内联，路径敏感入口必须独立打包）；dts 排除该 entry

**LangGraph 包**
- 图: `START → think → route → (act → observe → think)* → END`
- 产物: `bridge/adapterBridge.ts` + `toolBridge.ts` + `AgentFactory.ts`；`server/src/langgraph/`；`frontend/src/components/LangGraph/` + `pages/LangGraph.tsx`
- 关键依赖: `@langchain/langgraph ^0.2`、`@langchain/core ^0.3`、`better-sqlite3`
- ⚠️ `stream()` 走 `streamEvents`，非流式 adapter 无 `on_chat_model_stream` → 必须从 checkpointer 取最新 AI 消息兜底发 response 事件
- Demo: `pnpm demo:web`（端口 3455）

---

## 11. 关键文件索引

| 类别 | 路径 |
|------|------|
| 版本源 / 同步 | `version.json`、`scripts/sync-version.mjs` |
| 核心引擎 | `packages/core/src/agent/AgentEngine.ts`、`packages/core/src/tools/{ToolRegistry,index}.ts` |
| 模型预设 | `packages/core/src/config/ProviderPresets.ts`、`ModelRegistry.ts` |
| 服务端 | `packages/server/src/index.ts`（389 行，P1-1 六批完成）、`packages/server/src/routes/`、`packages/server/src/bootstrap.ts` |
| 前端 | `packages/frontend/src/{App.tsx,pages/*,components/*,stores/*}` |
| 共享入口 | `packages/frontend/src/mountApp.tsx`（只导出，不自调用） |
| 桌面 | `packages/desktop/src/main.ts`（1252 行）、`ipcBridge.ts`、`index.html` |
| 构建校验 | `packages/desktop/scripts/verify-build.cjs`、`docs/14_构建前必检清单.md` |
| **质量门禁（新增）** | `scripts/run-tests-log.mjs`（回归+日志）、`scripts/verify-data-consistency.mjs`（数据一致性）、`scripts/verify-css-tokens.mjs`（设计令牌） |
| **测试日志目录** | `logs/test-logs/<日期>_<时间>_<范围>/`（分层 log + 失败标红 HTML + summary.json + raw/） |
| **API 安全中间件** | `packages/server/src/middleware/apiSecurity.ts`（鉴权 / 限流 / 绑定地址 / fail-fast 自检） |
| **设计令牌真源** | `packages/frontend/tailwind.tokens.mjs` + `packages/frontend/src/styles/index.css`（`--color-*`） |
| 打包流程 | `docs/05_Desktop_EXE打包标准流程.md`、`docs/11_构建链路对照表_tsup_asar_inline详解.md` |
| 发布 / CI | `scripts/release.mjs`、`release-publish.bat`、`docs/06`、`docs/49`、`.github/workflows/{ci,_test,release}.yml` |
| 管线 | `docs/pipeline/lib/{module-registry,pipeline-config,pipeline-api,pipeline-parser}.mjs`、`docs/pipeline/ARCHITECTURE.md` |
| 架构 / 需求 | `docs/02_架构设计文档_ADD.md`、`docs/01_需求规格说明书_PRD.md` |
| 测试文档 | `docs/03_测试案例文档.md` |
| 修复详表 | `docs/修复汇总.md` ← 每次修复必追加 |
| 引擎/模型决策 | `docs/53_引擎选择配置与LangGraph使用指南.md`、`docs/54_AI引擎架构决策知识库.md` |
| 部署 | `docs/60_服务器部署指南.md`、`scripts/deploy-server.ps1`、`scripts/start-server.cmd` |
| 本次审核 | `docs/62_专家团最终审核报告.md` |
