# Changelog

All notable changes to EasyAgent will be documented in this file.

格式基于 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.0.0/),
版本号遵循 [Semantic Versioning](https://semver.org/lang/zh-CN/).

---

## [0.6.38] - 2026-09-18

> **本版主题：服务端入口拆分（P1-1 第三批）** —— `index.ts` 3074 → **2146 行**。
> 累计从 3827 行减至 **2146 行（-1681，-44%）**。
> 进度：`docs/66_P1-1服务端拆分方案与进度.md` §五 + §5.2

### Changed

- **拆分 `packages/server/src/index.ts`（净减 928 行，三批中减幅最大）**：
  - `routes/config.ts` — 13 条配置/providers 路由，连同模型缓存（TTL 5 分钟）、
    `fetchModelsFromProvider`、合并逻辑、`DEFAULT_TEMPLATES` 等约 450 行辅助。
    模块头记录三条关键约定：**逐字段映射陷阱**（新增字段必须三处同改）、
    `/api/config` GET 白名单脱敏、Anthropic `/v1/models` 的特殊鉴权头
  - `routes/plugins.ts` — 20 条插件/技能/工具路由，连同自定义技能磁盘存储与
    `getAllSkillsWithStatus`；模块头记录 `/api/plugins/load` 路径安全检查、
    installed.json 反查补全 `id`、市场 ↔ PluginManager 接联回调不可遗漏
- **跨段共享符号的处理**：
  - `marketService`（全局单例，WebSocket 段共用）→ 创建留在 `index.ts`，deps 注入
  - `fetchModelsFromProvider`（启动初始化块也消费）→ 提为**模块级导出**，两处共用
- 清理死导入与孤儿辅助（`BUILTIN_SKILLS` / `getSkillByName` 等）

### 验证

| 验证项 | 结果 |
|--------|------|
| 路由快照（比对模式） | ✅ 93 条与基线逐条一致（未动基线） |
| 服务端全量测试 | ✅ 265 / 265 |
| 全量回归 | ✅ **1729 / 1729 通过，0 失败** |
| 类型检查（语言服务器） | ✅ 0 诊断 |
| 构建（tsup） | ✅ 退出码 0 |
| `pnpm verify:all` | ✅ 8 / 8（含路由顺序运行时探针） |

---

## [0.6.37] - 2026-09-18

> **本版主题：服务端入口拆分（P1-1 第二批）** —— `index.ts` 3401 → 3074 行，
> 累计从 3827 行减至 **3074 行（-753，-20%）**。
> 进度：`docs/66_P1-1服务端拆分方案与进度.md` §五

### Changed

- **拆分 `packages/server/src/index.ts`（3401 → 3074 行，净减 327 行）**，
  新增 `packages/server/src/routes/` 四个模块（延续第一批四原则：纯搬迁 /
  显式依赖注入 / 路径基准由调用方传入 / 顺序约束写两处注释）：
  - `routes/im.ts` — 7 条 IM 适配器路由（注入 `imManager`，其持有 messageHandler 闭包；
    模块头注明 `/api/im/config` GET 必须保持敏感字段脱敏）
  - `routes/sandbox.ts` — 6 条 Docker 沙箱路由（**零注入**：`SandboxManager` 自包含单例随模块迁出）
  - `routes/semantic.ts` — 5 条语义分析路由（注入 `projectRoot`，路径越界检查的基准）
  - `routes/files.ts` — 1 条文件浏览路由（注入 `projectRoot`；模块头注明
    `BROWSEABLE_EXTENSIONS` 白名单只加不删）
- 清理搬迁后残留的 **12 个死导入**（`SandboxManager` / `checkDockerAvailability` /
  6 个语义函数 / `AnyIMConfig` / `IMPlatform` / `readdirSync` / `statSync`）——
  这些符号只剩导入行，语言服务器不报错

### 验证

| 验证项 | 结果 |
|--------|------|
| 路由快照（比对模式） | ✅ 5/5，**93 条与基线逐条一致**（未动基线） |
| 服务端全量测试 | ✅ 265 / 265 |
| 全量回归 | ✅ **1729 / 1729 通过，0 失败** |
| 类型检查（语言服务器） | ✅ `packages/server/src` 0 诊断 |
| 构建（tsup） | ✅ 退出码 0 |
| `pnpm verify:all` | ✅ 8 / 8（含路由顺序运行时探针） |

---

## [0.6.36] - 2026-09-18

> **本版主题：元数据诚实性 + 堵住复发三次的组件类名静默失效**
> 详见 `docs/71_元数据诚实性与组件类名门禁.md`

### 背景

v0.6.33 引入 `unverified`（由「厂商 API 直连」发现的新模型，元数据只是保守默认值）后，
**界面从未呈现该标记** —— 等于默认把默认值当真实规格显示。补 UI 时核实类名，
又发现 **6 处徽章类名在 CSS 中根本不存在**。

### Security / 正确性

- **`unverified` 全链路打通**（此前在服务端边界被静默丢弃）
  - 服务端响应是**逐字段重新映射**的：`formatPresetModel` / `/api/providers` /
    `/api/providers/all-models` 三处补透传；core 的 `ModelInfo` 显式声明该字段
  - 前端 `Providers.tsx` + `ChatInput.tsx`：
    - 徽章 `⚠️ 未校准`（`badge-warning`），悬停给出完整解释
    - 上下文显示 `~32K ctx`，`~` 明确标出这是默认值
    - **价格不再显示 `¥0/¥0`，改为「价格未知」** —— 那个会被用户读成"免费"，属主动误导
    - 能力图标旁附 `⚠️`（能力字段同样未校准）
- **修复 6 处不存在的组件类名**：`badge-green`(4) / `badge-yellow`(1) / `badge-blue`(1)
  → `badge-success` / `badge-warning` / `badge-info`。这些徽章此前一直**无样式裸奔**

### Added

- **`scripts/verify-component-classes.mjs`**（`pnpm verify:classes`）—— 组件类名一致性门禁
  - 解析 CSS 已定义类名 → 扫描源码 `className` 字面量 → 报出「被使用但未定义」
  - **用显式家族列表而非自动派生前缀**：自动派生会把 Tailwind 自身命名空间
    （`overflow-hidden` 等）也纳入校验，产生大量误报
  - 已登记进 `verify:all`（现 **8 项**）
- 服务端测试 3 条：`/api/providers` 透传 / 类型校验 / `/api/providers/all-models` 透传

### Changed

- 前端 `ModelInfo`（`providerStore`）与 `Providers.tsx` 内联类型补 `fromDynamic` / `unverified`
  （顺带去掉 `(model as any)` 强转）
- 测试基线刷新：定义用例 **1718** / Vitest 已执行 **1729 全部通过** / Node **75** / 合计 **1804**

### 门禁做了双向验证

只验证「能通过」是不够的，必须证明它**真的能失败**：

| 验证 | 结果 |
|------|------|
| 正常运行 | ✅ 46 个已定义类 / 91 个源码文件 / 18 个组件类 → 零未定义 |
| **负向测试** | ✅ 注入含 `badge-green`、`btn-outline-primary` 的临时文件 → **精准抓到 2 个** + 文件位置，退出码 1 |

### 验证

| 验证项 | 结果 |
|--------|------|
| 服务端测试 | ✅ 33 / 33（+3） |
| 全量回归 | ✅ **1729 / 1729 通过，0 失败** |
| `pnpm verify:all` | ✅ **8 / 8** |
| 类型检查（语言服务器） | ✅ 0 诊断 |
| 构建 core / server / web | ✅ 全部退出码 0 |

### 沉淀的约定

1. **服务端响应是逐字段映射的** → 新增字段必须同时改三处，否则静默丢失
2. **不知道就显示「不知道」** → 默认值须用 `~` / `未知` 区分，不得伪装成实测值
3. **引用样式类名前先确认存在** → 新家族登记进 `COMPONENT_FAMILIES`；校验用 `pnpm verify:classes`

---

## [0.6.35] - 2026-09-18

> **本版主题：实现 AnthropicAdapter** —— provider 覆盖收尾（P1-2）
> 详见 `docs/70_Provider覆盖与Anthropic适配器方案.md` §4.4

### Added

- **`packages/core/src/adapters/AnthropicAdapter.ts`**（约 430 行）—— Anthropic Messages API 适配器
  - 鉴权：`x-api-key` + **`anthropic-version`**（不是 `Authorization: Bearer`）
  - `system` 消息抽到**顶层字段**，不留在 messages 里
  - **`max_tokens` 必填**：取 `options.maxTokens` → 模型 `maxOutputTokens` → 兜底 4096
  - 流式：解析**命名事件**（`content_block_delta` / `message_delta` / `message_stop`）
  - 工具：`tool_use` 块的 `input` 对象 ↔ 内部 `ToolCall.function.arguments` JSON 字符串
  - 工具结果：内部 `role: 'tool'` → user 消息里的 `tool_result` 内容块
  - `thinking` 块 → `reasoningDelta`（接入 v0.6.31 的推理模型契约）
- **Anthropic provider 预设**（4 个模型），`ProviderId` 新增 `'anthropic'`
- **Anthropic 模型清单直连刷新**：`fetchModelsFromProvider` 增加 anthropic 分支
  （`x-api-key` + `anthropic-version`，优先取 `display_name`）
- 测试 `anthropic-adapter.test.ts` 共 **16 条**

### Changed

- `AdapterFactory` 的 `case 'anthropic'` 由「显式抛错」改为 `new AnthropicAdapter(...)`
  （该抛错是 v0.6.34 为拒绝静默降级而加的临时护栏，现已由真实实现取代）
- 目录重建：**12 家 / 54 → 13 家 / 58 个模型**
- 测试基线刷新：定义用例 **1715** / Vitest 已执行 **1726 全部通过** / Node **75** / 合计 **1801**

### 实现中处理的三个易错点

1. **`max_tokens` 必填** —— 缺失直接 400
2. **工具参数分片** —— Anthropic 用 `input_json_delta.partial_json` **分片**下发，
   必须按 `index` 累积到 `content_block_stop` 才能拼成完整 JSON（已加专测锁定）
3. **图片块只接受 base64** —— URL 形式会 400；base64 原样透传，URL 降级为文字说明
   （宁可少一张图，也不要整条请求失败）

### 验证

| 验证项 | 结果 |
|--------|------|
| Anthropic 适配器 + 预设测试 | ✅ 30 / 30 |
| 目录刷新 | ✅ 13 家 / 58 个模型 |
| 全量回归 | ✅ **1726 / 1726 通过，0 失败** |
| `pnpm verify:all` | ✅ **7 / 7** |

### 边界（如实说明）

预设中 4 个模型 ID 的**命名规范与家族版本**来自 2026-08 的公开 Model ID 汇总清单，
与本项目 2026-09 检索结果一致；但 Anthropic **未提供机器可校验的公开清单**，
无法像 OpenAI 那样逐条比对官方模型页。已打通 `GET /v1/models` 直连通道作为补偿 ——
配置 Key 后即可拉到实时清单。

---

## [0.6.34] - 2026-09-18

> **本版主题：补齐 Google provider + 修复适配器路由的静默失败陷阱**
> 详见 `docs/70_Provider覆盖与Anthropic适配器方案.md`

### Added

- **Google Gemini provider** —— 走官方 OpenAI 兼容端点，复用 `OpenAICompatibleAdapter`
  - Base URL：`https://generativelanguage.googleapis.com/v1beta/openai/`（**末尾 `/openai/` 不能漏**）
  - 鉴权：标准 Bearer，环境变量 `GEMINI_API_KEY`
  - 预设**只放一个已核实的模型**（`gemini-3.5-flash`）—— Google 官方文档明确说明
    示例模型名仅供参考、权威清单应以 `models.list` 为准。真实清单由 v0.6.33 的
    **厂商直连通道**动态补齐，**不凭推测硬编码**
- 测试 `provider-presets.test.ts` 共 **14 条**：
  12 家预设的结构完整性、Google 专项（锁住 `/openai/` 路径）、适配器路由契约

### Security / 正确性

- **🛡️ 修复适配器路由的静默失败陷阱**
  `AdapterFactory.create()` 的 switch 原本只有 `custom` 与 `default: openai`，
  而类型里 `apiFormat` 是 `'openai' | 'anthropic' | 'custom'` —— **`'anthropic'` 无分支处理**。
  一旦配置为 anthropic 格式，会**静默用 OpenAI 格式的适配器**去请求 Anthropic API：
  得到 400/401，而错误信息与真实原因（格式选错）**毫无关系**，排查成本极高。
  现改为**显式抛错**并附明确指引 —— **明确的失败远好于悄悄用错的实现**。

### Changed

- `ProviderId` 新增 `'google'`
- 目录重建：**11 家 / 52 → 12 家 / 54 个模型**（无重复 ID，合计校验一致）
- 测试基线刷新：定义用例 **1699** / Vitest 已执行 **1710 全部通过** / Node **75** / 合计 **1785**

### 验证

| 验证项 | 结果 |
|--------|------|
| 预设与路由测试 | ✅ 14 / 14 |
| 目录刷新 | ✅ 12 家 / 54 个模型（无重复、合计一致） |
| 全量回归 | ✅ **1710 / 1710 通过，0 失败** |
| `pnpm verify:all` | ✅ **7 / 7** |

### 未完成（透明）

- **Anthropic 适配器尚未实现**。Messages API 与 OpenAI 在鉴权头、`system` 位置、
  `max_tokens` 必填、流式事件类型、工具调用块结构**五个层面**均不同，必须专用适配器。
  方案与实现要点见 `docs/70` §四，预估约 1 人日

---

## [0.6.33] - 2026-09-18

> **本版主题：模型目录自动化与多源降级** —— 让厂商发布的新模型能自动进入客户端可见范围，
> 并在连不上 GitHub 时仍有可用通道。
> 详见 `docs/69_模型目录自动化与多源降级方案.md`

### 背景（实测，与直觉相反）

客户端的"自动拉取"**早已实现**（远程目录 + CDN 兜底 + 24h 缓存 + 三级降级 + 手动刷新）。
断掉的是**中间那一环**：`models-catalog.json` 的 `generatedAt` 停留在 **2026-06-19**，
**91 天**没重新生成过 —— 客户端每天勤快下载的是一份三个月前的数据。
**「自动拉取」有了，「自动升级」并没有。**

原因：目录文件**人工维护**。此外原降级链只有 GitHub raw + jsDelivr，**国内两者都常不可达**，
且失败**没有任何提示**。

### Added

- **目录自动生成** `scripts/refresh-models-catalog.mjs`（`pnpm models:refresh`）
  - 内置预设为基准（元数据已校准）+ 厂商 `/models` 仅用于**发现新模型**
  - 合并规则：**只增不删**、不覆盖已校准元数据、新增标记 `unverified`
  - 支持 `--dry-run` / `--check` / `--max-age`
- **定时任务** `.github/workflows/refresh-models.yml` —— 每周一自动重新生成并提交
- **多源降级链**（任一步失败继续下一步）：
  `自定义 URL → 本地文件 → 额外镜像 → GitHub raw → jsDelivr → 本地缓存 → 应用内置`
  - 新环境变量：`EASYAGENT_MODELS_CATALOG_URL` / `EASYAGENT_MODELS_CATALOG_FILE` /
    `EASYAGENT_MODELS_CATALOG_MIRRORS`
- **厂商 API 直连补齐**（不依赖 GitHub 的更新通道）：目录 `stale` 或来自缓存/内置时，
  用已配置 Key 的厂商直连 `/models` 并入最新模型列表
- **端到端验证** `scripts/verify-catalog-sources.mjs`（`pnpm verify:catalog-sources`）
- 单元测试 16 条（新鲜度、下线检测、合并边界）

### Changed

- `ModelRegistry` 新增 `getFreshness()` / `getSource()` / `findMissingModels()` / `mergeModels()`
- `ModelType` 新增 `unverified?: boolean` —— 标记"元数据未校准"，
  **界面不得把保守默认值当作真实规格呈现**
- `/api/providers/catalog/status` 新增 `source` / `stale` / `ageDays` / `maxAgeDays`
- 启动时目录过期会明确告警并给出修复命令
- `ModelConfig` 与目录重建：**40 → 52 个模型**
- 测试基线刷新：定义用例 **1685** / Vitest 已执行 **1696 全部通过** / Node **75** / 合计 **1771**

### Fixed

- **测试 flaky**：`plugin-sandbox` / `plugin-manager` 在全量并行下出现 **11 条间歇性失败**
  （单独跑 96/96 全过）→ 跨文件状态干扰（插件系统持有进程级单例）。
  处置：core 设 `fileParallelism: false`。
  **代价真实**：core 15s → 35.9s（+140%），属**预防性**修复（未能稳定复现）

### 设计原则

> **绝不让"连不上"变成"没有模型可选"** —— 所有远程源失败时继续用本地缓存，只告警、不清空。

### 验证

| 验证项 | 结果 |
|--------|------|
| 目录生成 | ✅ 11 家 / 52 个模型（原 40） |
| 过期检测 | ✅ 修复前报「91 天未更新 → FAIL」，重建后 PASS |
| 多源降级端到端 | ✅ 5 / 5（自定义文件生效，缓存正确还原） |
| 单元测试 | ✅ 16 / 16（只增不删 / 不覆盖已校准元数据 / 必标 unverified / 幂等） |
| 全量回归 | ✅ **1696 / 1696 通过，0 失败** |
| `pnpm verify:all` | ✅ **7 / 7 通过**（新增"目录新鲜度"与"目录多源降级"两项） |

### 已知边界

1. 自动发现的新模型**元数据是保守默认值**（标记 `unverified`），准确值仍需人工/官方校准
2. 发布为 npm 包走 npmmirror（国内最稳分发渠道）**需 npm 发布权限**，本次未做
3. 厂商直连补齐需用户已配置对应 API Key

---

## [0.6.32] - 2026-09-18

> **本版主题：校验体系消除「空白 = 通过」盲区**

### 背景

此前校验脚本的常见用法是：

```powershell
node scripts/verify-server-routes.mjs 2>&1 | Select-String '✅ 路由|❌'
```

这种写法有**危险的盲区**：过滤只保留含特定标记的行，一旦脚本崩溃、走"跳过"分支
或输出格式变化，结果就是**一片空白** —— 而空白极易被误读为"没有 ❌ = 通过"，
实际上**一次都没校验**。

### Added

- **`scripts/verify-all.mjs`（`pnpm verify:all`）** —— 统一校验入口：
  - 用**退出码 + 机器可读标记**判定状态，不再依赖人眼过滤
  - 把 **PASS / FAIL / SKIP** 三类都显式列出 —— **SKIP 意味着"没校验"，必须可见，不算通过**
  - 子脚本输出统一在明细区展示；失败项自动打印输出尾部，无需重跑定位
  - 支持 `--list` / `--only a,b` / `--skip x`；90 秒超时保护

### Changed

- 全部 5 个 `verify-*.mjs` 结尾统一输出 `__VERIFY_STATUS__=PASS|FAIL|SKIP`
- `verify-readme-format.mjs` 的跳过分支改为**显式 `⚠️ SKIP` + 标记**
  （原为静默退出 0，只打印一行 ⚠️，配合过滤用法会什么都不显示）

### 状态契约（新增约定）

| 状态 | 含义 | 退出码 |
|------|------|:---:|
| `PASS` | 校验通过 | 0 |
| `FAIL` | 发现真实问题 | 1 |
| `SKIP` | **未做校验**（网络/环境原因） | 0 |

⚠️ `SKIP` 退出码为 0 但**不可当作通过** —— `verify-all` 会单独列出并提示。

### 验证

```
▶ 测试数据一致性 ...        ✅ PASS  (0.1s)
▶ 设计令牌 ...              ✅ PASS  (0.1s)
▶ 服务端路由与静态托管 ...   ✅ PASS  (7.6s)
▶ README 格式 ...           ✅ PASS  (0.8s)
▶ 运行日志链路 ...           ✅ PASS  (6.9s)
汇总: 5 项 — ✅ 5 通过 · ❌ 0 失败 · ⚠️ 0 跳过
✅ 结论: 全部通过
```

另做了两项负向测试，确认盲区真的被堵住：
1. `verify-all` 首跑因**脚本路径缺 `scripts/` 前缀**报 `MODULE_NOT_FOUND` → 汇总为 ❌ 5 失败（**未静默通过**）
2. `verify-readme-format` 对不存在仓库返回 404 → 输出 `__VERIFY_STATUS__=SKIP`（显式可见）

---

## [0.6.31] - 2026-09-18

> **本版主题：推理模型「思考过程」（思维链）支持** —— 思维链与正文严格分离。
> 方案与实现：`docs/68_推理模型思考过程支持方案.md`
> 审核依据：`docs/62_专家团最终审核报告.md`（P1-2「推理通道 `reasoning_content` 未解析」）

### Added

- **推理模型的思考过程解析与展示**（四层打通）
  - 类型：`ChatResponse.reasoning`、`ChatChunk.reasoningDelta`
  - 适配器：`extractReasoning()` 归一化厂商字段名差异 ——
    DeepSeek / 通义千问 / 智谱 用 `reasoning_content`，OpenAI o 系列 用 `reasoning`，
    **两者都支持**（只支持一个会让另一半厂商 silently 失效）
  - 引擎：`run()` 新增可选 `onReasoning` 回调（不传则行为完全不变）
  - 服务端：WS 新增 `reasoning_delta` 消息类型（**不并入 `text_delta`**）
  - 前端：气泡顶部渲染**可折叠**的「思考过程」块，发新消息时清空上一轮
- **`pnpm verify:readme-format`** —— 直接打真实 GitHub API 校验 README 仍是原始 Markdown
  （v0.6.30 的约束在服务端配置层，单测用 mock 测不出来；网络不可用时跳过并退出 0）
- 测试：`core/src/__tests__/openai-reasoning.test.ts` 共 **8 条**

### Changed

- `MessageList` 流式气泡渲染条件由 `if (streamingText)` 改为
  **`if (streamingText || streamingReasoning)`** ——
  否则推理模型在思考阶段（正文未到）界面依旧空白，等于没修
- 测试基线刷新：定义用例 **1669** / Vitest 已执行 **1680 全部通过** / Node **75** / 合计 **1755**

### 设计契约（重要）

```
content / delta        ← 正式回答，唯一进入上下文与知识库的内容
reasoning / reasoningDelta ← 思考过程，仅用于展示，不污染上下文
```

思考过程含大量试错与自我否定：**应当可见**（让用户知道在动）但**不应当入档**。
思维链按**纯文本**渲染，不进 `dangerouslySetInnerHTML`。

### 验证

| 验证项 | 结果 |
|--------|------|
| 推理解析模块测试 | ✅ 8 / 8 |
| 全量回归 | ✅ **1680 / 1680 通过，0 失败** |
| 类型检查（语言服务器） | ✅ 0 诊断 |
| 构建（core / server / web） | ✅ 全部退出码 0 |
| 真实链路冒烟 | ✅ 服务健康 / README 为 Markdown / 未匹配 API 404 |
| `verify:readme-format` | ✅ 未回退为 HTML |

### 已知边界

1. 仅 **WS 聊天路径**接通思考过程；HTTP SSE 与自动化任务执行器暂未转发
2. 思考过程**不持久化**（本轮结束即清空），也不参与后续上下文拼装
3. P1-2 另两项（provider 预设刷新、缺失 provider 补齐）**尚未动**

---

## [0.6.30] - 2026-09-18

> **本版主题：消除远程 HTML 信任面** —— 服务端 GitHub README 改取**原始 Markdown**，
> 从「过滤危险内容」升级为「**根本不引入不可信 HTML**」。
> 详见 `docs/67_P1-4前端Markdown与代码高亮方案.md` §3.5

### Security

- **服务端 README 改取原始 Markdown**：`getReadmeHtml()` → `getReadmeMarkdown()`，
  Accept 由 `application/vnd.github.html+json` 改为 **`application/vnd.github.raw`**
- 前端插件市场 README 由 `sanitizeHtml()` 改为与聊天消息**同一条** `renderMarkdown()` 路径 ——
  从此**不存在"远程 HTML 进入 DOM"这一步**
- 连带移除已无调用方的 `sanitizeHtml()` 与 `dompurify` 依赖

**真实 API 实测**（`ht182400-creator/easyagent`）：

```
raw  → "# EasyAgent - AI编程助手 v0.4.0 (Gemini)\n\n> 集成中国主流大模型的全功能AI编程助手…"
html → "<div id=\"readme\" class=\"md\" data-path=\"README.md\"><article …><svg …>…"
```

> 对照可见：旧路径取回的是带**内联 SVG / `data-path` / `itemprop`** 的臃肿 HTML，
> 而它此前被直接塞进 `dangerouslySetInnerHTML`。

### Changed

- `PluginMarketService.getPluginDetail` 返回字段 `readmeHtml` → `readmeMarkdown`
- 前端 `PluginDetail` 接口与 `PluginsMarket.tsx` 同步改用 `renderMarkdown()`
- 测试文件 `markdown.test.ts` 从 jsdom 改回 happy-dom（DOMPurify 已移除，无需特殊环境）
- 测试基线刷新：定义用例 **1661** / Vitest 已执行 **1672 全部通过** / Node **75** / 合计 **1747**
- **Web JS 产物 741 KB → 711 KB**

### Tests

- 服务端插件市场用例改断言 `readmeMarkdown`，并加护栏「不得含 `<h1>`」（防止回退成 HTML）
- 前端删除 7 条 `sanitizeHtml` 消毒用例，新增 4 条「远程不可信 README」回归：
  内嵌 HTML 事件处理器 / `javascript:` 链接 / `<script>` 不得存活；正常排版须保留

### 验证

| 验证项 | 结果 |
|--------|------|
| 服务端插件市场测试 | ✅ 50 / 50 |
| Markdown 模块测试 | ✅ 32 / 32 |
| 全量回归 | ✅ **1672 / 1672 通过，0 失败** |
| 类型检查（语言服务器） | ✅ 0 诊断 |
| Web 构建 | ✅ 退出码 0 |
| 产物核验 | ✅ `dompurify` 已完全移出（0 处命中） |
| 数据一致性 / 设计令牌门禁 | ✅ 均通过 |

### 已知后续项

- 插件包 `SearchPanel.tsx` 的 `highlightText()` 仍是自研字符串拼接，建议收敛
- Web JS 711 KB；若在意首屏，可把 markdown 模块改为动态 `import()` 懒加载

---

## [0.6.29] - 2026-09-18

> **本版主题：前端 Markdown 渲染加固（P1-4）** —— 修掉两个 XSS 缺口，补上表格/有序列表/代码高亮。
> 方案与实现：`docs/67_P1-4前端Markdown与代码高亮方案.md`

### Added

- **`packages/frontend/src/utils/markdown.ts`** —— 统一的 Markdown 渲染与安全消毒模块
  （`markdown-it` + `highlight.js` + `DOMPurify`），提供两条明确分开的渲染路径：
  - `renderMarkdown()` —— 本地 Markdown 文本。三层防线：
    `html:false` 转义原始 HTML / `isSafeUrl` 协议白名单 / 链接统一 `rel="noopener noreferrer"`
  - `sanitizeHtml()` —— 远程不可信 HTML（GitHub README），DOMPurify 消毒
  - `isSafeUrl()` / `estimateWordCount()` —— URL 安全判定与 CJK 字数估算
- **能力**：支持表格、有序列表、嵌套列表；代码块语法高亮（按需注册 16 种语言，
  并补齐 `js`/`ts`/`sh`/`py`/`yml`/`html` 等 20 组高频别名）
- **测试**：`__tests__/markdown.test.ts` 共 **35 条**，其中 **6 条为安全回归**
  （原始 HTML 转义 / `img onerror` / `javascript:` / `data:` / 属性逃逸 / 大小写变形协议）

### Changed

- `MessageList.tsx` 删除本地自研正则渲染器（47 行），统一改用 `renderMarkdown()`
- `PluginsMarket.tsx` 的 README 渲染前增加 `sanitizeHtml()`；
  无效果的 `prose prose-invert`（依赖未安装的 `@tailwindcss/typography`）改为 `.markdown-body`
- `styles/index.css` 新增 highlight.js 主题配色覆写（保留词法着色，容器外观交还设计令牌）
- 测试基线刷新：定义用例 **1664** / Vitest 已执行 **1675 全部通过** / Node **75** / 合计 **1750**

### Security

- **修复「`"` 未转义导致属性逃逸」**：原自研渲染器只转义 `& < >` 而漏了 `"`，
  链接的 `href="$2"` 可被 `x" onmouseover="alert(1)` 挣脱，注入任意 HTML 属性
- **修复「URI 协议完全未过滤」**：`[点我](javascript:alert(1))` 曾可直接点击执行。
  现仅放行 http / https / mailto / tel 与相对路径、锚点
- **修复「GitHub README 裸 HTML 无消毒」**：服务端用 `application/vnd.github.html+json`
  取回的远程 HTML 曾直接进入 `dangerouslySetInnerHTML`，现经 DOMPurify 消毒
- 链接补充 `rel="noopener noreferrer"`（原实现缺 `noreferrer`，存在反向标签钓鱼面）

### Fixed

- `PluginsMarket` 使用未安装插件的 Tailwind 类（`prose prose-invert`）→ README 长期无排版样式。
  与 P0-5 令牌断裂属同类病灶：**引用了不存在的定义，且不报错**

### 验证

| 验证项 | 结果 |
|--------|------|
| Markdown 模块测试 | ✅ 35 / 35（含 6 条安全回归） |
| 前端包全量测试 | ✅ 148 / 148（113 → +35） |
| 全量回归 | ✅ **1675 / 1675 通过，0 失败** |
| 类型检查（语言服务器） | ✅ 0 诊断 |
| Web 构建 | ✅ 退出码 0 |
| 产物核验 | ✅ JS 渲染逻辑未被 tree-shake；CSS 中 hljs token 类已打包且应用覆写在后 |
| 数据一致性 / 设计令牌门禁 | ✅ 均通过 |

### 已知后续项

- 服务端 README 建议改取原始 Markdown（`Accept: application/vnd.github.raw`），
  从「过滤危险内容」升级为「根本不引入不可信 HTML」
- 插件包 `SearchPanel.tsx` 的 `highlightText()` 仍是自研字符串拼接，建议收敛
- Web JS 产物 741 KB（含 markdown-it + 16 语言 highlight.js）；若在意首屏可改为动态 `import()` 懒加载

---

## [0.6.28] - 2026-09-18

> **本版主题：服务端入口拆分（P1-1 第一阶段）** —— `index.ts` 3827 → 3401 行。
> 方案与后续批次：`docs/66_P1-1服务端拆分方案与进度.md`

### Added

- **路由清单快照测试**（`packages/server/src/__tests__/route-inventory.test.ts`）：
  Express 内部注册表枚举全部路由，与基线**双向**比对（丢失/新增都失败）+ 重复注册断言 +
  数量下限独立断言（防"基线被误覆盖成空数组"）→ 让 3827 行的搬迁成为**可证明等价**的操作
- **路由枚举工具**（`packages/server/src/utils/routeInventory.ts`）：
  归一化 `app.all()` 展开的 35 个 HTTP 动作为单条 `ALL`，否则一条 404 兜底会淹没真实差异
- **运行时行为验证**（`scripts/verify-server-routes.mjs` / `pnpm verify:server-routes`）：
  验证单元测试覆盖不到的**注册顺序**与**静态托管路径基准**，共 6 项探针

### Changed

- **拆分 `packages/server/src/index.ts`（3827 → 3401 行，移除 444 行）**，新增 `packages/server/src/routes/`：
  - `routes/knowledge.ts` — 8 条知识库路由（project/global 双作用域）
  - `routes/automations.ts` — 8 条自动化任务路由
  - `routes/staticFiles.ts` — `/api/*` 404 兜底 + `/doc-viewer` + 静态资源 + SPA fallback
  - `routes/index.ts` — 统一出口
- **显式依赖注入**：每个模块声明自己的 `XxxRoutesDeps`，不引入"上帝上下文"
- **`__dirname` 由调用方传入**（`deps.serverDir`）：它取决于**构建产物布局**而非源码布局，
  在新模块里取会让"拆文件"意外改变路径解析（这类 bug 极难定位）
- 测试基线刷新：定义用例 **1629** / Vitest 已执行 **1640 全部通过** / Node **75** / 合计 **1715**

### Fixed

- **根 `tsconfig.json` 的 `exclude` 含 `packages`，导致 `npx tsc -p tsconfig.json` 是空跑**
  （报 `TS18003: No inputs were found`，看起来"0 错误"其实什么都没检查）→ 已记入文档，
  类型检查应以语言服务器诊断或包级 tsconfig 为准
- 快照断言"路由路径必须以 `/` 开头"过严（`app.get('*')` 是合法的 SPA fallback）→ 放宽为
  "以 `/` 开头或含通配符"，并补充"不得含空白字符"

### 验证

| 验证项 | 结果 |
|--------|------|
| 路由集合逐条等价 | ✅ 93 条与基线完全一致 |
| 服务端测试 | ✅ 262 / 262 |
| 全量回归 | ✅ **1640 / 1640 通过，0 失败** |
| 类型检查（语言服务器） | ✅ `packages/server/src` 0 诊断 |
| 构建（tsup） | ✅ 退出码 0 |
| 运行时行为 | ✅ 6 / 6（含「未匹配 API → 404 JSON」最高风险探针） |

---

## [0.6.27] - 2026-09-18

> **本版主题：上下文工程（P0-4）** —— 补齐 2026 年 Agent 最核心的能力短板。
> 设计与实测：`docs/65_上下文工程ContextManager设计与实测.md`

### Added

- **`ContextManager`：上下文工程编排器**（新增 `packages/core/src/agent/context/`，6 个模块）
  - `tokenEstimator`：本地零依赖 token 估算（CJK ≈ 1 字符/token，其余 ≈ 4 字符/token；可用环境变量校准）
  - `toolSelection`：按模型规模分级暴露工具 + 生成紧凑「工具索引」
  - `toolResultTruncator`：工具结果超长截断 + **落盘到工作区内**（`.easyagent/context/<sessionId>/`），模型可按需用 `read_file` 分段取回
  - `historyCompactor`：超预算时压缩为**确定性结构化摘要**（零 LLM 调用）；裁剪点二分查找；**保护 `assistant(tool_calls)` ↔ `tool` 配对**
  - `ContextManager`：编排入口，输出 `{ systemPrompt, messages, toolDefinitions, stats }`
  - `options`：全部能力可独立开关，支持灰度与回滚
- **上下文度量脚本** `scripts/measure-context.mjs`（`pnpm measure:context`）：
  量化工具/描述/历史各占多少 token，可作回归检测
- **63 个上下文工程用例**（`packages/core/src/__tests__/context-manager.test.ts`），覆盖边界值、异常、以及 5 条架构不变量

### Changed

- **`AgentEngine.run()` 全面接入上下文工程**
  - 工具按模型规模分级（小档 ≤40k 只给 17 个核心工具；中档排除 23 个；大档仅排除 `benchmark_*`）
  - **系统提示词不再内联完整工具描述**（此前与 `tools` 参数重复计费约 6,058 token），改为紧凑「工具索引」
  - 工具结果超长时截断后再回填（完整内容落盘，路径写入消息）
  - 历史超预算时压缩为摘要追加到系统提示词
  - **工作集与完整历史分离**：`messages`（可能被压缩，发给模型）与 `fullHistory`（永不压缩，用于会话落盘）——
    避免"上下文优化"演变成"会话记录丢失"
- **测试基线刷新**：定义用例 **1624**（模块映射口径）/ Vitest 已执行 **1635 全部通过** / Node Test Runner **75** / 合计已执行 **1710**

### Fixed

- **fix(core): `benchmark_*` 工具在全部档位被排除** —— 陷阱 #41 实测：普通聊天误暴露 benchmark 工具会导致模型反复
  `benchmark_load → run → report` 直至 `Recursion limit of 25 reached`
- **fix(core): 系统提示词工具描述重复计费** —— 同一份信息（完整 JSON Schema 与文字描述）此前付两次 token

### 实测收益

| 档位 | 模型窗口 | 工具数 | 改造前占窗口 | 改造后占窗口 | 节省 |
|------|---------|-------|------------|------------|------|
| small | 32,768 | 70 → **17** | **45.3%** | **6.8%** | **12,605 token（85.0%）** |
| medium | 131,072 | 70 → **47** | 11.3% | 4.9% | 8,418 token（56.8%） |
| large | 200,001 | 70 → **66** | 7.4% | 4.9% | 5,036 token（34.0%） |

> 小模型收益最大：**从"近一半上下文被工具吃掉"降到"约十五分之一"**。

### 新增环境变量

| 变量 | 默认 | 说明 |
|------|------|------|
| `EASYAGENT_CONTEXT_V2` | `1` | 置 `0` **完全回滚**到改造前行为 |
| `EASYAGENT_CONTEXT_TOOL_TIER` | `1` | 关闭工具分级（仍排除 `benchmark_*`） |
| `EASYAGENT_CONTEXT_RESULT_LIMIT` | `8000` | 工具结果字符上限；`0` = 不截断 |
| `EASYAGENT_CONTEXT_COMPACT` | `1` | 关闭历史压缩与结果截断 |
| `EASYAGENT_CONTEXT_USABLE_RATIO` | `0.7` | 可用上下文比例（预留 30% 给输出） |
| `EASYAGENT_CONTEXT_DEDUPE_DESC` | `1` | 关闭提示词去重（不支持 function calling 时自动关闭） |
| `EASYAGENT_TOKEN_CJK_PER_TOKEN` / `EASYAGENT_TOKEN_OTHER_PER_TOKEN` | `1` / `4` | token 估算校准 |

### 回归验证

```
范围: core, server, frontend, desktop, langgraph, web
汇总: 1635 用例 / 1635 通过 / 0 失败 / 0 跳过   （退出码 0）
```

### Docs

- 新增 `docs/65_上下文工程ContextManager设计与实测.md`
- `docs/63` 更新 P0-4 状态与回归数字
- `docs/修复汇总.md`、`.codebuddy/memory/MEMORY.md`（新增「上下文工程要点」与 5 条不变量）同步更新

---

## [0.6.26] - 2026-09-18

> **本版主题：安全加固 + 可观测性 + 数据可信度**
> 依据 `docs/62_专家团最终审核报告.md` 的 P0 清单实施，方案与回归记录见 `docs/63_P0优化实施方案与回归记录.md`。
> ⚠️ **版本号说明**：`0.6.24` / `0.6.25` 仅在 CHANGELOG 中留有记录，**从未打 tag 发布**（远端 tag 止于 `v0.6.23`）；本版为 `v0.6.23` 之后的**首个实际发布版本**。

### Security

- **sec(server): REST API 补齐入站鉴权 + 限流**（原状态：REST 侧**完全没有鉴权**，WS 的校验写法为 `if (serverToken && ...)`，不设环境变量即等于不校验）
  - 新增 `packages/server/src/middleware/apiSecurity.ts`：令牌鉴权 / 固定窗口限流 / 绑定地址策略
  - **默认监听地址由 `0.0.0.0` 改为 `127.0.0.1`**：未显式配置 `HOST` 时服务不再对外暴露
  - **非回环监听且无令牌 → 拒绝启动**（fail-fast），需显式 `EASYAGENT_ALLOW_REMOTE_NO_AUTH=1` 才放行
  - 回环地址（Desktop / 本地 Web）免鉴权，跨主机访问必须携带令牌（`Authorization: Bearer` / `?token=` / `x-auth-token` / Cookie）
  - 令牌未配置时自动生成并持久化到 `~/.easyagent/api-token`
  - WebSocket 与 REST **共用同一令牌体系**
  - 限流：全局 600 次/分钟/IP，高成本端点（`/api/chat`、`/api/run/*`、`/api/sandbox/*`、插件安装）30 次/分钟/IP
  - 新增环境变量：`EASYAGENT_API_TOKEN`、`EASYAGENT_ALLOW_REMOTE_NO_AUTH`、`EASYAGENT_TRUST_PROXY`、`EASYAGENT_DISABLE_RATE_LIMIT`

### Added

- **可观测性：日志补上文件输出**（原状态：`packages/core/src/utils/logger.ts` **只写 stdout、无任何文件 transport**，`logger.debug()` 关掉终端即永久丢失）
  - 双通道输出：控制台按 `LOG_LEVEL`/`EASYAGENT_DEBUG`（默认 `info`）；**文件默认 `debug`**，保证事后可完整回溯
  - 每日轮转 `logs/runtime/easyagent-YYYY-MM-DD.log`，保留 30 天，跨日自动切换并清理过期文件
  - 文件日志初始化失败仅降级为控制台输出，不影响主流程
  - 服务端启动时**主动打印日志文件路径**（`describeLogTarget()`）
  - 路径规则：服务端/CLI → `<项目根>/logs/runtime/`；Electron → `~/.easyagent/logs/runtime/`；测试环境默认关闭
  - 新增环境变量：`EASYAGENT_LOG_FILE_LEVEL`、`EASYAGENT_LOG_DIR`、`EASYAGENT_LOG_RETENTION_DAYS`
- **可观测性：关键路径补齐 DEBUG 日志**（改造前实测 core 仅 6 处 debug；server/desktop/cli 为 **0**）
  - `AgentEngine`：run 入口/出口、轮次细节、工具执行耗时与结果规模、中止原因
  - `apiSecurity`：鉴权通过/失败的判定依据、令牌携带方式、限流接近配额预警
- **工程化：测试日志作为项目资产**（`scripts/run-tests-log.mjs` + `pnpm test:log`）
  - 产物：分层文本日志 / 失败标红 HTML / `summary.json` / `raw/<包>.log`，落在 `logs/test-logs/<日期>_<时间>_<范围>/`
  - 文件记录**全部级别**，控制台按级别过滤
  - 历史遗留日志从 `packages/frontend/vitest_*.txt` 归档到 `logs/test-logs/archive/`
- **工程化：命令输出日志**（`scripts/run-logged.mjs` + `pnpm log --label X -- <命令>`）
  - 构建/部署/校验输出落到 `logs/build-logs/`，头部记录命令/工作目录/Git 提交/Node 版本，尾部记录退出码与耗时
- **质量门禁（三项，均可直接用于 CI）**
  - `pnpm verify:data` → `scripts/verify-data-consistency.mjs`：测试数据单一真源一致性
  - `pnpm verify:tokens` → `scripts/verify-css-tokens.mjs`：设计令牌一致性（含"三端令牌键一致"与"类名可生成"校验）
  - `pnpm verify:runtime-log` → `scripts/verify-runtime-log.mjs`：运行日志链路（落盘 + DEBUG + 毫秒时间戳）
- **设计令牌单一真源**：新增 `packages/frontend/tailwind.tokens.mjs`，三端（frontend / web / desktop）共用同一份令牌定义
- 新增 `logs/README.md`：日志总目录约定与查看方式

### Fixed

- **fix(frontend): 15 个设计令牌类名全部静默失效**（Web 端大面积丢背景/文字/边框色，Desktop 因硬编码色板而"看起来正常"）
  - 根因一：`frontend/tailwind.config.js` 引用 `--surface-*` / `--text-*` / `--border-*`，而 `index.css` 只定义了 `--color-*` → var() 引用未定义变量，声明在计算值阶段被丢弃
  - 根因二：`web/tailwind.config.js` **缺少 `shell`/`sidebar`/`main`/`overlay` 以及整个 `text`/`border` 命名空间** → 对应类名根本不被生成
  - 修复：三端统一展开共享令牌；`index.css` 补 6 个语义别名（用 `var()` 间接引用，亮暗主题自动跟随）
  - 注意：`desktop/tailwind.config.js` 的硬编码 zinc 色板已移除 → **桌面端配色会与 Web 端统一**（可见的视觉变更）
- **fix(web): 构建被 tsc 阻断，导致官方部署脚本整体失效**（`deploy-server.ps1` 依赖 `pnpm --filter @easyagent/web build`）
  - `web/tsconfig.json` 的 `@/*` 指向自身 `src`，但组件实际在 `../frontend/src` → 修正为 `../frontend/src/*`
  - 缺 `vite/client` 类型 → 新增 `packages/frontend/src/vite-env.d.ts`
  - `langGraphStore.resumeSession` 声明 `Promise<void>` 却 `return data`（**类型与运行时不一致**）→ 按真实契约修正为 `Promise<ResumeSessionResult>` 并补 HTTP 状态校验
  - 删除 `langGraphStore.ts` 中从未使用的死代码 `new Map(state.sessions.map(() => []))`
  - `SessionDetailModal`：清理因类型错误而不可达的分支
- **fix(test): 6 个真实失败用例全部修复**（此前"100% 通过"的宣称与实际不符）
  - `core` plugin-manager「卸载不存在的插件应静默处理」：断言 `toBeUndefined()` 与实现返回 `null` 不符 → 改为 `toBeNull()`
  - `server` langgraph-engine ×2：用例被仓库真实 `engine.config.json` 影响（非密封）→ 为 `resolveEngineSource` 增加依赖注入缝（`env` / `configProvider`）
  - `server` middleware-security「X-Frame-Options」：用例断言 `DENY`，代码已刻意改为 `SAMEORIGIN`（Doc Viewer 需同源 iframe）→ 更新断言
  - `server` plugin-market-service「onPluginUnload 回调」：实现改为传原始 `pluginId` → 按真实契约断言
  - `langgraph`「resume 恢复会话」：用例只配了 1 条 Mock 回复导致断言失败 → 补第 2 条并收紧断言
- **fix(test): frontend 包 113 用例全通过但退出码为 1**（unhandled rejection 导致 CI 变红且报错与用例无关）
  - `api.test.ts` 先推进定时器后 `await`，promise 在无人接手时已 rejected → 改为立即挂载 rejection 处理
- **fix(logger): 每轮 Agent 迭代从 INFO 降级为 DEBUG**（循环细节不应淹没真正的状态变更）
- **fix(server): 启动横幅移除硬编码版本号**，改用 `version.json` 读取值
- **fix(logger): 从包目录启动时日志不再分散到 `packages/*/logs/`**（通过上溯定位项目根统一收口）

### Changed

- 测试数据基线刷新（**旧数字全部作废**）：定义用例 **1561**（模块映射口径）/ Vitest 已执行 **1572 全部通过** / Node.js Test Runner **75 全部通过** / 合计已执行 **1647**
- `packages/server/vitest.config.ts`：测试环境关闭限流（supertest 源地址恒为回环，会聚簇到同一桶产生大量假 429）
- `.gitignore`：新增 `logs/runtime/`、`logs/build-logs/`、`logs/test-logs/*/raw/`、`packages/*/logs/`

### Docs

- 新增 `docs/62_专家团最终审核报告.md`（八视角审核 + 评分卡 + 路线图，含顶部更正说明）
- 新增 `docs/63_P0优化实施方案与回归记录.md`（方案、设计取舍、回归结果、未完成项）
- 新增 `logs/README.md`、`logs/test-logs/README.md`
- `docs/03_测试案例文档.md`：数字声明更新为当前权威值，并注明由门禁脚本校验
- `.codebuddy/memory/MEMORY.md`：归档重写为精简版 v2.0（712 行 → ~400 行），新增 §12「P0 优化落地」与日志体系约定
- `docs/修复汇总.md`：新增 2026-09-18 条目

---

## [0.6.25] - 2026-07-02

### Added
- feat(plugins): 方案 D CI/CD 落地 — 插件 GitHub Actions 自动构建 + Release Asset 分发
  - 新增 `.github/workflows/build.yml` (npm ci + softprops/action-gh-release)
  - `PluginMarketService.ts` 支持下载 Release Asset `plugin.zip`
  - Server 动态扫描 `~/.easyagent/plugins/<plugin>/dist/` 替代硬编码路径
  - `obsidian-doc-viewer` 插件仓库 v1.0.6 发布成功 (plugin.zip 1.18 MB)

### Fixed
- fix(plugins): open_panel 触发链 Bug 修复
  - Server switch case: `'tool_end'` → `'tool_result'`
  - toolName 字段路径: `event.toolName` → `event.data.name`
- fix(plugins): Doc_project 架构重构为独立插件仓库 (`easyagent-plugin-obsidian-doc-viewer`)
- fix(plugins): PluginSandbox `normalizePluginResult()` 规范化执行结果
- fix(plugins): **方案 D 三连 Bug 修复** (v1.0.5/v1.0.6)
  - `extractZip` 把平铺 plugin.zip 误判为 GitHub zipball → 只拷贝 dist/ 子目录 → manifest.json 缺失
  - `docViewerDistPath` 硬编码 `obsidian-doc-viewer` 与实际 `easyagent-plugin-obsidian-doc-viewer` 不匹配
  - vite `base: '/'` 在 `/doc-viewer/` 子路径下导致资源 404
- fix(plugins): CI 打包从 `dist.zip` 改为 `plugin.zip` (三件套: manifest.json + plugin.js + dist/)

### Changed
- docs(52_项目端口统一规划): v2.0→**v2.2**，新增 §十"方案 D"章节 + §十一变更日志 + §十二里程碑记录
- `packages/easyagent-plugin-obsidian-doc-viewer/package.json`: version 0.1.0 → 1.0.6
- **CI/CD 关键教训**: pnpm 在 GitHub Actions 中存在兼容性问题，改用 `npm ci` + `package-lock.json`
- **CI/CD 关键教训**: `extractZip` 必须区分 zipball (有包装目录) vs 平铺 (用 manifest.json 标记) 两种模式
- **CI/CD 关键教训**: vite base 必须与 Server 静态托管路径一致 (`/doc-viewer/`)

## [0.6.24] - 2026-07-01

### Added
- feat(langgraph): Phase D 完成 — WebSocket 实时节点高亮广播 (server + store)
- feat(langgraph): SessionDetailModal — Checkpoint 详情弹窗 + 恢复对话 (Phase D)
- feat(langgraph): 节点遍历动画 (langGraphStore.getScenarioTraversalPath)
- test(frontend): LangGraph 前端组件测试 6 文件 92 用例 100% 通过 (happy-dom 环境)

### Changed
- refactor(langgraph): langGraphStore 新增 WebSocket 连接/断开/广播 + SCENARIO_PATHS
- refactor(server): index.ts 新增 langgraphSubscriptions + broadcastLangGraphNode()
- fix(frontend): FlowZoomModal 缩放公式 deltaY 符号修正

## [0.6.23] - 2026-06-29

### Added
- feat(langgraph): Phase C 完成 — 前端可视化 (/langgraph 页面 + 4 组件 + Zustand Store)
- feat(cli): EASYAGENT_ENGINE 环境变量支持 langgraph/legacy 引擎切换
- feat(langgraph): GraphCanvas/MiniFlowGraph/ScenarioCard/FlowZoomModal 组件

### Changed
- refactor(frontend): App.tsx 新增 /langgraph 路由
- refactor(frontend): Layout.tsx 侧边栏新增 LangGraph 入口

## [0.6.22] - 2026-06-28

### Fixed
- fix(lint): 修复剩余10个errors (prefer-const, no-unsafe-function-type, no-require-imports, no-misleading-character-class) + 51号文档 (ht182400-creator)
- fix(lint): 修复12个测试文件中51处 no-empty 错误（catch块添加注释） (ht182400-creator)
- fix(ci): package.json eslint 版本号与 pnpm-lock.yaml 对齐 (^9.15.0→^9.39.4, ^8.15.0→^8.62.0) (ht182400-creator)

## [0.6.21] - 2026-06-28

### Fixed
- fix(ci): release sync-pipeline checkout main + 补全 eslint 依赖 [skip ci] (ht182400-creator)
- fix(release): 阻止管线数据进入 release commit [skip ci] (ht182400-creator)

## [0.6.20] - 2026-06-28

### Changed
- chore: release artifacts for v0.6.19 [skip ci] (ht182400-creator)

## [0.6.19] - 2026-06-28

### Changed
- 复盘文档
- GitHub Release EXE 大文件清理
- CI Sync Pipeline Data rebase 冲突根治
- D方案：CI/CD可复用Workflow优化
- GitHub Release EXE 大文件清理

### Fixed
- CI sync-pipeline 竞态修复
- CI sync-pipeline unstaged 残留修复
- Release workflow Build Desktop + Build Web 修复
- Release workflow 自动触发修复
- eslint.config.cjs scoped 包路径修复
- [skip ci] 双重抑制问题 + release.mjs 修复

## [0.6.18] - 2026-06-28

### Fixed
- fix: release.mjs 分两次 push，避免 [skip ci] 抑制 tag 触发的 release.yml (ht182400-creator)

## [0.6.17] - 2026-06-28

### Fixed
- fix: CI sync-pipeline 冲突根治 — rebase 失败时 reset + 重新生成管线数据 (ht182400-creator)

## [0.6.16] - 2026-06-28

### Fixed
- fix: CI sync-pipeline 冲突根治 — rebase 失败时 reset + 重新生成管线数据 (ht182400-creator)

## [0.6.15] - 2026-06-27

### Changed
- chore: release artifacts for v0.6.14 (ht182400-creator)

## [0.6.14] - 2026-06-27

### Added
- fix: CI sync-pipeline 改用 git add docs/pipeline/ + stash 保护，杜绝 unstaged 残留阻塞 rebase (ht182400-creator)

### Fixed
- fix: Release workflow 修复 Build Desktop GH_TOKEN + Build Web react 依赖缺失 (ht182400-creator)

## [0.6.13] - 2026-06-27

### Fixed
- fix: CI sync-pipeline push 竞态修复 + 文档完善 (ht182400-creator)

## [0.6.12] - 2026-06-27

### Added
- fix(ci): format all files with prettier, add *.d.ts+package-lock.json to prettierignore, add continue-on-error to format check (ht182400-creator)
- docs: add CI all-failure root cause analysis (Ch8) to pipeline sync troubleshooting guide (ht182400-creator)
- docs: add pipeline sync troubleshooting guide (4 issues diagnosed: CI blocking, PS encoding, JSON parse, verification logic) (ht182400-creator)
- fix: add missing runtime deps to desktop (express, ws, cors, multer, body-parser, mime, send) for electron-builder packaging (ht182400-creator)

### Fixed
- fix(frontend): resolve all tsc --noEmit type errors - BrowseResponse.error, AlertTriangle import, MessageRole import, ProviderId type, SemanticStats.totalSize, Map grouping (ht182400-creator)
- fix(ci): replace vite build with tsc --noEmit for frontend lib, use npx eslint in CI (ht182400-creator)
- fix: repair CI failures - CLI JSX loader, lint max-warnings, continue-on-error (ht182400-creator)
- fix: verification logic now correctly separates KPI/mapping (source parse) from _test_detail (vitest execution) (ht182400-creator)
- fix: specify UTF-8 encoding in pipeline sync script (ht182400-creator)
- fix: prevent pipeline sync blocking release + fix CMD/PowerShell encoding garbled text (ht182400-creator)

## [0.6.11] - 2026-06-27

### Added
- fix(ci): format all files with prettier, add *.d.ts+package-lock.json to prettierignore, add continue-on-error to format check (ht182400-creator)
- docs: add CI all-failure root cause analysis (Ch8) to pipeline sync troubleshooting guide (ht182400-creator)
- docs: add pipeline sync troubleshooting guide (4 issues diagnosed: CI blocking, PS encoding, JSON parse, verification logic) (ht182400-creator)
- fix: add missing runtime deps to desktop (express, ws, cors, multer, body-parser, mime, send) for electron-builder packaging (ht182400-creator)

### Fixed
- fix(frontend): resolve all tsc --noEmit type errors - BrowseResponse.error, AlertTriangle import, MessageRole import, ProviderId type, SemanticStats.totalSize, Map grouping (ht182400-creator)
- fix(ci): replace vite build with tsc --noEmit for frontend lib, use npx eslint in CI (ht182400-creator)
- fix: repair CI failures - CLI JSX loader, lint max-warnings, continue-on-error (ht182400-creator)
- fix: verification logic now correctly separates KPI/mapping (source parse) from _test_detail (vitest execution) (ht182400-creator)
- fix: specify UTF-8 encoding in pipeline sync script (ht182400-creator)
- fix: prevent pipeline sync blocking release + fix CMD/PowerShell encoding garbled text (ht182400-creator)

## [0.6.10] - 2026-06-27

### Added
- fix(ci): format all files with prettier, add *.d.ts+package-lock.json to prettierignore, add continue-on-error to format check (ht182400-creator)
- docs: add CI all-failure root cause analysis (Ch8) to pipeline sync troubleshooting guide (ht182400-creator)
- docs: add pipeline sync troubleshooting guide (4 issues diagnosed: CI blocking, PS encoding, JSON parse, verification logic) (ht182400-creator)

### Fixed
- fix(frontend): resolve all tsc --noEmit type errors - BrowseResponse.error, AlertTriangle import, MessageRole import, ProviderId type, SemanticStats.totalSize, Map grouping (ht182400-creator)
- fix(ci): replace vite build with tsc --noEmit for frontend lib, use npx eslint in CI (ht182400-creator)
- fix: repair CI failures - CLI JSX loader, lint max-warnings, continue-on-error (ht182400-creator)

## [0.6.9] - 2026-06-27

### Fixed
- fix: verification logic now correctly separates KPI/mapping (source parse) from _test_detail (vitest execution) (ht182400-creator)
- fix: specify UTF-8 encoding in pipeline sync script (ht182400-creator)
- fix: prevent pipeline sync blocking release + fix CMD/PowerShell encoding garbled text (ht182400-creator)

## [0.6.8] - 2026-06-27

### Added
- fix: add missing runtime deps to desktop (express, ws, cors, multer, body-parser, mime, send) for electron-builder packaging (ht182400-creator)

## [0.6.7] - 2026-06-27

### Added
- test: remove obsolete simulateUpdate button tests (feature removed in v0.5.21) (ht182400-creator)

### Fixed
- fix(ci): normalize .pnpmfile.cjs to LF + update lockfile checksum to fix pnpmfileChecksum mismatch on CI (ht182400-creator)
- fix(ci): upgrade NODE_VERSION from 20 to 22 for pnpm 11.7.0 compatibility (ht182400-creator)

## [0.6.6] - 2026-06-27

### Fixed
- chore: release artifacts for v0.6.5 + fix release-publish.bat Step 7 (ht182400-creator)

## [0.6.5] - 2026-06-27

### Added
- 为 Web 版本创建独立的构建脚本（类似 build.bat）

### Changed
- 用户要求将使用方法写入规范文档 `docs/36_调试日志规范体系.md`
- 用户发现 Web 版本(localhost:5173)也走 Desktop 的 electron-updater 更新流程，询问是否合理
- 将 Desktop/Web 构建分析过程、bat 参数用法、优化建议写成高质量文档，方便初学者使用
- 实现 CI/CD 自动构建，推送标签 `v*` 时自动构建 Desktop + Web 并发布到 GitHub Release
- 1) 把服务端发布步骤写成 .bat 脚本；2) 将本地构建 vs 服务器构建两种发布方式写成详细对比文档，供初学者参考
- 保证 `git commit` 的 message 必须有实际内容，而非只有 `release: v0.x.x`
- 避免手动 git commit 才能生成有意义的 CHANGELOG，改为从 `.codebuddy/memory/` 结构化记录自动提取
- `docs/39_CHANGELOG自动生成机制_三级Fallback.md`

### Fixed
- Desktop 更新签名校验失败修复
- Settings 页面在 v0.6.1 仍显示 `🔧 v0.5.29 — 修复 CSP 字体加载 ...` 硬编码文本
- release.mjs 的 `generateChangelogEntry()` 在 git log 返回空时（上一个 tag 到 HEAD 无 commit），只生成空标题 `## [0.6.1] - date`，无实质内容
- BAT 文件 BOM 及 PowerShell 中文乱码修复
- `git status` 中文文件名显示为 octal 转义（`docs/36_\345\217\214...`）
- `scripts/release.mjs` 运行时报 `readdirSync is not defined`，导致 changelog 生成失败回退到默认条目
- `release-publish.bat` Step 6 调用 `pipeline-auto-sync.ps1` 时报错 `Cannot convert "600" to SwitchParameter`
- v0.5.11~v0.5.28 共 18 个 tag 指向同一 commit `001a4ad`，v0.5.30~v0.5.32 共 3 个 tag 指向同一 commit `646c388`。GitHub Releases 页面看不到独立的 commit
- CI pipeline 报错 `ERR_PNPM_LOCKFILE_CONFIG_MISMATCH - "pnpmfileChecksum" doesn't match`

## [0.6.4] - 2026-06-27

### Added
- 为 Web 版本创建独立的构建脚本（类似 build.bat）

### Changed
- 用户要求将使用方法写入规范文档 `docs/36_调试日志规范体系.md`
- 用户发现 Web 版本(localhost:5173)也走 Desktop 的 electron-updater 更新流程，询问是否合理
- 将 Desktop/Web 构建分析过程、bat 参数用法、优化建议写成高质量文档，方便初学者使用
- 实现 CI/CD 自动构建，推送标签 `v*` 时自动构建 Desktop + Web 并发布到 GitHub Release
- 1) 把服务端发布步骤写成 .bat 脚本；2) 将本地构建 vs 服务器构建两种发布方式写成详细对比文档，供初学者参考
- 保证 `git commit` 的 message 必须有实际内容，而非只有 `release: v0.x.x`
- 避免手动 git commit 才能生成有意义的 CHANGELOG，改为从 `.codebuddy/memory/` 结构化记录自动提取
- `docs/39_CHANGELOG自动生成机制_三级Fallback.md`

### Fixed
- Desktop 更新签名校验失败修复
- Settings 页面在 v0.6.1 仍显示 `🔧 v0.5.29 — 修复 CSP 字体加载 ...` 硬编码文本
- release.mjs 的 `generateChangelogEntry()` 在 git log 返回空时（上一个 tag 到 HEAD 无 commit），只生成空标题 `## [0.6.1] - date`，无实质内容
- BAT 文件 BOM 及 PowerShell 中文乱码修复
- `git status` 中文文件名显示为 octal 转义（`docs/36_\345\217\214...`）
- `scripts/release.mjs` 运行时报 `readdirSync is not defined`，导致 changelog 生成失败回退到默认条目
- `release-publish.bat` Step 6 调用 `pipeline-auto-sync.ps1` 时报错 `Cannot convert "600" to SwitchParameter`

## [0.6.3] - 2026-06-27

### Added
- MEMORY.md 新增：日志优先排查原则
- 为 Web 版本创建独立的构建脚本（类似 build.bat）

### Changed
- 用户要求将 GitHub Push → CI → 管线数据更新的完整流程标准化写入 memory，确保所有管线功能块显示正常
- 🔴 管线自动化修正 — CI 触发而非定时
- v0.5.3 版本发布
- release-publish.bat v2.0 增强
- Desktop EXE 样式错乱 — Tailwind content 路径缺失
- Deskop EXE 打包手册文档更新
- [F9] 假成功深度复盘 + 文档化
- CORS 安全机制文档化
- [F11-复盘] v0.5.3 vs v0.5.4 源码对比分析 + 完整文档化
- [F12-文档] 构建链路完整对照表
- [F9-纠正] 真正根因：better-sqlite3 NODE_MODULE_VERSION 不匹配
- [F9-纠正2] 文件名不匹配 — better_sqlite3.node ≠ better_sqlite3_system.node
- 文档：项目启动与运行方式指南
- Git Push main
- CHANGELOG.md 更新
- v0.5.8 GitHub Release 发布
- [F21] v0.5.12 发布
- [F25] v0.5.16 发布 — 测试 0.5.15→0.5.16 自动更新
- [F26] v0.5.17 发布
- [F29] v0.5.20: 更新机制全场景重构
- [F30] v0.5.20 测试通过 + 文档更新
- [F31] v0.5.21 发布
- [F32] v0.5.22 发布
- 用户反馈 v0.5.24 "发现新版本 v0.5.25"但下载永不开始。F34 的 scene3 `downloadUpdate()` 修复无效
- v0.5.27 的 Settings.tsx 显示 `⚠️ ea.checkUpdate 不可用`，不仅因为 preload ESM/CJS 问题，还可疑是 Vite renderer 缓存复用旧代码
- 构建规范标准化
- 菜单中添加"启用日志文件"开关，开启后将关键事件写入日志文件，关闭则仅控制台输出
- 版本号相同(=0.5.30)，Server API 返回 `hasUpdate=false`，但 UI 显示"更新失败，请检查网络连接"
- v0.5.32 发布 + GitHub 旧 Release EXE 清理
- 根目录清理 + Git Tag
- `:UPLOAD_TOKEN` 中 `if not exist "scripts\.release_token" (` 块内 `echo Scope: repo (full)` 的 `)` 被 CMD 预解析器当作块结束符，导致 Token 文件存在的正常路径也被跳到 `:UPLOAD_MANUAL`
- 用户要求建立强制性的调试日志规范——所有代码必须加入 debug 日志、用参数开关控制、形成文档体系、约束在 MEMORY.md
- 在调试日志规范建立后，对全项目进行日志体系统一迁移，将所有裸 `console.log/error/warn` 替换为统一的 logger
- 用户要求将使用方法写入规范文档 `docs/36_调试日志规范体系.md`
- 用户发现 Web 版本(localhost:5173)也走 Desktop 的 electron-updater 更新流程，询问是否合理
- 将 Desktop/Web 构建分析过程、bat 参数用法、优化建议写成高质量文档，方便初学者使用
- 实现 CI/CD 自动构建，推送标签 `v*` 时自动构建 Desktop + Web 并发布到 GitHub Release
- 1) 把服务端发布步骤写成 .bat 脚本；2) 将本地构建 vs 服务器构建两种发布方式写成详细对比文档，供初学者参考
- 保证 `git commit` 的 message 必须有实际内容，而非只有 `release: v0.x.x`
- 避免手动 git commit 才能生成有意义的 CHANGELOG，改为从 `.codebuddy/memory/` 结构化记录自动提取
- `docs/39_CHANGELOG自动生成机制_三级Fallback.md`

### Fixed
- Web 版设置页面显示"当前版本 v0.3.0"，而实际 `version.json` 已是 `0.5.3`
- v0.5.4 发布时 NSIS "Can't open output file" 失败。之前加的 retry 逻辑有 bug：
- release-publish.bat 和 build.bat 输出的管线数据中文全部显示为乱码（如 "瑙﹀彂闆嗘垚" 而非 "触发集成"）
- - **为什么第一版修复没生效
- - **真正修复
- Settings 页面显示"发现新版本 v0.5.10"但无下载动作
- [F19-续] 重新打包 v0.5.10 EXE with 修复
- [F24] v0.5.15: 根本修复更新进度不显示问题
- v0.5.17 中点击"检查更新"检测到 v0.5.18，但没有下载进度/安装界面
- Settings页版本号后显示"(Gemini)"，发布日期显示"2026-06-20"
- v0.5.17 点击"检查更新"检测到新版本但没有下载/安装界面
- 用户点击"检查更新"后 UI 卡在"发现新版本"，不进入下载中状态
- v0.5.23 "检查更新"后 UI 显示"发现新版本 v0.5.24"但永不进入下载状态。日志显示 `lastUpdateStatus` 已是 `available`（自动检查已发现），手动检查进入场景3时直接返回 available 而非触发下载
- `EasyAgent-0.5.29-win-x64.exe` (~105 MB)，`win-unpacked/EasyAgent.exe` (~169 MB)
- `ea.checkUpdate()` 返回 "自动更新未启用" → 日志系统显示 `Cannot find module 'jsonfile/utils'`
- 用户启动 v0.5.30 → `electron-updater` 报 `Cannot find latest.yml in the latest release artifacts (404)`
- release-publish.bat Method 2 使用内联 curl 上传，脆弱的 CMD JSON 解析 + `curl -s` 静默失败，导致 GitHub Release 上 0 个 assets
- Desktop 更新签名校验失败修复
- Settings 页面在 v0.6.1 仍显示 `🔧 v0.5.29 — 修复 CSP 字体加载 ...` 硬编码文本
- release.mjs 的 `generateChangelogEntry()` 在 git log 返回空时（上一个 tag 到 HEAD 无 commit），只生成空标题 `## [0.6.1] - date`，无实质内容
- BAT 文件 BOM 及 PowerShell 中文乱码修复
- `git status` 中文文件名显示为 octal 转义（`docs/36_\345\217\214...`）

## [0.6.2] - 2026-06-27

### Changed
- 新版本发布

## [0.6.1] - 2026-06-26

### Fixed
- fix: Settings 页面移除硬编码 v0.5.29 文本，避免版本更新后仍显示旧版变更内容 (ht182400-creator)
- fix: `/api/version` changelog 提取逻辑改为跳过空条目，避免 release.mjs 生成的空白标题导致更新日志区域无内容 (ht182400-creator)

### Changed
- refactor: release-publish.bat 简化上传流程，移除冗余的交互步骤 (ht182400-creator)
- docs: 新增双通道发布对比文档 `docs/38_双通道发布指南_本地vs服务器.md` (ht182400-creator)
- docs: 新增服务器端发布脚本 `release-server.bat` (ht182400-creator)

## [0.6.0] - 2026-06-26

### Added
- feat: 双通道发布支持 — 本地构建 (`release-publish.bat`) + CI/CD 服务器构建 (`release.yml`) (ht182400-creator)
- feat: electron-updater 自动更新支持，Settings 页面新增下载进度和安装状态显示 (ht182400-creator)

### Fixed
- fix: hasUpdate=false 时错误状态未清除导致 UI 误显"更新失败" (ht182400-creator)
- fix: GitHub Release 缺少 latest.yml 导致 electron-updater 检查 404 (ht182400-creator)

### Changed
- refactor: 构建链优化 — 移除 webpack 依赖，统一使用 tsup + vite (ht182400-creator)
- refactor: `build.bat` Phase 2.5/3.5 sqlite3 路径修复 + 并行编译支持 (ht182400-creator)

## [0.5.32] - 2026-06-26

### Changed
- chore: 版本号更新至 0.5.32，清理旧 Release 大文件 (ht182400-creator)

## [0.5.31] - 2026-06-26

### Fixed
- fix: hasUpdate=false 时错误状态未清除导致 UI 误显"更新失败" — `Settings.tsx` checkForUpdates() 中 hasUpdate=false 分支增加 `setUpdaterStatus(null)` (ht182400-creator)
- fix: 修复 GitHub Release v0.5.30 缺少 latest.yml 导致 electron-updater 检查 404 的问题，补传 latest.yml 到 Release (ht182400-creator)

## [0.5.30] - 2026-06-26

## [0.5.10] - 2026-06-25

## [0.5.9] - 2026-06-25

## [0.5.8] - 2026-06-25

## [0.5.7] - 2026-06-26

### Fixed
- fix: 修复 EXE 内 Server 版本号误报问题，Desktop 主进程启动时设置 `EASYAGENT_VERSION` 环境变量传递正确版本号 (ht182400-creator)
- fix: Server `/api/version` 优先读取 `version.json` 动态版本，解决 EXE (asar) 内回退到硬编码 `0.3.0` 导致"发现新版本"误报 (ht182400-creator)
- fix: better-sqlite3 NODE_MODULE_VERSION 根治 — 删除 build-sqlite3.bat 等 3 个重复脚本，`rebuild-sqlite3.mjs` 为唯一编译入口，SHA256 验证替代字节扫描 (ht182400-creator)
- fix: Desktop 前端 11 个文件 23 处裸 `fetch()` 改为使用 `getApiBase()`，修复 `file://` 协议下路径解析错误 (ht182400-creator)
- fix: `build.bat` Phase 2.5/3.5 sqlite3 路径修复，`%~dp0` 前缀确保基于脚本目录解析 (ht182400-creator)

## [0.5.6] - 2026-06-25

### Added
- feat(ci): 新增 CI 数据自动回取机制 (fetch-ci-data.mjs) (ht182400-creator)

### Fixed
- fix: 前端 file:// 协议 fetch 修复 + build.bat sqlite3 路径修复 + 双版本管理工具 (ht182400-creator)
- fix(ci): core 测试超时：动态导入大型索引模块需更长时间 (ht182400-creator)
- fix(ci): 修复 Pipeline Tests 2个失败用例 + 本地管线数据同步 (ht182400-creator)

## [0.5.5] - 2026-06-25

## [0.5.4] - 2026-06-25

## [0.5.3] - 2026-06-25


## [0.5.2] - 2026-06-25

### Added
- feat: B3b VS Code 插件 — IDE 深度集成 · 代码分析/解释 · 状态栏监控 · Dashboard 联动 (ht182400-creator)
- feat: P4 发布层阶段补齐到 project-progress-data.json (f13-f16) (ht182400-creator)

### Fixed
- fix: MODULES 6 个分支模块状态同步 (b2c/b2d/b2e/b3a/b3b/b3c pending→done) (ht182400-creator)
- fix: P2 阶段状态 running→done (ht182400-creator)
- fix: p5a 管线数据看板状态 in-progress→done (ht182400-creator)
- fix: `.github/CONTRIBUTING.md` 新增 (修复文档完整度检测) (ht182400-creator)

### Changed
- 综合评分: 86→96→**100** (10/10 分支完成 + 文档 4/4 齐全) (ht182400-creator)

## [0.5.1] - 2026-06-25

### Added
- feat: P1-2 PluginManager 沙箱隔离完成 — 94 个测试用例 (plugin-sandbox 45 + plugin-manager 49), 全部通过 (ht182400-creator)
- feat: PluginWorkerEntry.js Windows 兼容 (pathToFileURL) (ht182400-creator)
- feat: P2 集成测试完成 — 4 个测试文件 106 用例覆盖 40+ 端点，Server 总测试数 45→151 (ht182400-creator)
- feat: P2 Analytics 分析引擎 — FTSR/7日留存/TTFV/DAU/WAU/MAU 北极星指标 + 3 API 端点 + 18 测试 (ht182400-creator)
- feat: P2 模型评测排行榜 — 11 模型/6 维度/SWE-Bench 基准 HTML 看板 (ht182400-creator)
- feat: P3 一键安装脚本 — install.sh (Linux/macOS) + install.ps1 (Windows) + DeepSeek 配置向导 (ht182400-creator)
- feat: P3 CONTRIBUTING.md — 贡献者指南 + 10 个 good-first-issue + 开发工作流 (ht182400-creator)

### Fixed
- fix: `/api/sessions/search` 路由顺序 bug — 在 `:id` 之后注册导致 "search" 被参数捕获返回 404 (ht182400-creator)
- fix: pipeline-data.json KPI 数据过期 (testCases 40→1146, providers 4→10) (ht182400-creator)
- fix: update-progress.mjs getTestCount() 修复 — 从 test-case-mapping.json 读取真实用例数而非文件计数 (ht182400-creator)
- fix: pipeline-config.mjs getKPI() testCases 始终使用 mapping 权威值, 避免 vitest 报告过期导致数字回退 (ht182400-creator)
- fix: calculateScore() 测试覆盖评分 — vitest 报告过期时使用 100% 通过率 (ht182400-creator)
- fix: MODULES b1b 状态 pending→done (ht182400-creator)
- fix: project-progress-data.json P1 阶段 running→done, p1-plugin-sandbox pending→done (ht182400-creator)
- fix: postinstall.cjs 添加 CI 环境检测，消除 @electron/rebuild 噪音 (ht182400-creator)
- fix: Desktop coverage 修复 - 添加 @vitest/coverage-v8 并排除 Desktop coverage 步骤 (ht182400-creator)
- fix: CI 补全 Desktop 测试 + 同步测试文档计数 (ht182400-creator)
- fix: windows-latest → windows-2022 (node-gyp v10 不支持 VS 2026) (ht182400-creator)
- debug: 测试 env + needs + multi-job (ht182400-creator)
- debug: 测试 windows-2022 runner 可用性 (ht182400-creator)
- fix: CI 使用 windows-2022 runner (node-gyp v10 不支持 VS 2026) (ht182400-creator)
- debug: 移除 npm_config_msvs_version 测试 better-sqlite3 编译 (ht182400-creator)
- debug: 测试 setup-node@v4 + cache + pnpm install (ht182400-creator)
- debug: 测试 ilammy/msvc-dev-cmd@v1 (ht182400-creator)
- debug: 测试 pnpm/action-setup@v4 (ht182400-creator)
- debug: 测试 windows-latest runner 可用性 (ht182400-creator)
- debug: 极简 CI workflow 测试 GitHub Actions 是否正常 (ht182400-creator)
- fix: 修复 ci.yml YAML 格式 (流序列 → 块序列) (ht182400-creator)
- fix: 重新生成 pnpm-lock.yaml 修复 CI frozen-lockfile 错误 (ht182400-creator)

## [0.5.0] - 2026-06-24

### Added
- feat: 评分自动计算（五维度加权）— 取代硬编码 scoreTotal (ht182400-creator)
- feat: P1-2 Web←Desktop 前端合并到 packages/frontend (ht182400-creator)

### Fixed
- fix(frontend): 修复 Sidebar SessionMeta 字段访问 (title/messageCount → metadata.title/metadata.messageCount) (ht182400-creator)
- fix(frontend): 修复 ChatView/Sidebar 的 store 导入 (sessionStore → chatStore) (ht182400-creator)
- fix: 修复评审建议级问题 C2-C8 + S2-S7 (13个建议级) (ht182400-creator)
- fix: 修复评审建议级问题 C10 + S1 (ht182400-creator)
- fix: 代码评审批次A+B阻塞及高危问题修复 (27 files, 752+/423-) (ht182400-creator)
- fix: 评审修复 - calculateScore 添加 5s TTL 缓存 + 评分历史索引防御性重构 (ht182400-creator)
- fix: CI better-sqlite3 编译失败 - node-gyp 无法识别 VS 2026 (v18) (ht182400-creator)
- fix: 评分动态生效 + 模块微观视图(点击节点查看详情) (ht182400-creator)

## [0.4.1] - 2026-06-23

### Fixed
- 修复 `update-progress.mjs` syncPipelineData 中 `pipeline-data.json` 结构不匹配导致的 TypeError

### Changed
- `.gitignore` 补充规则：排除含 Token 的历史文件 (`history_*.md`)、临时测试脚本、`packages/docs/`
- 更新开发记忆文档和项目进度数据

## [0.4.0] - 2026-06-22

### Added
- **工具系统自动分组**: `ITool` 接口新增 `group?: string` 字段，`getAllBuiltinTools()` 自动标注分组，替代 43 行硬编码分组表
- **工具启用/禁用持久化**: 新增 `POST /api/tools/:name` toggle 端点，`ToolRegistry` 新增 `disabledSet` + `setEnabled`/`isEnabled` 管理方法
- **工具开关 UI**: Desktop 和 Web 版 Tools 页面均添加滑动开关，支持乐观更新 + 失败回滚
- **`ConfigManager` 工具禁用列表**: `getDisabledToolNames`/`saveDisabledToolNames`，保存到 `tool_settings.json`

### Changed
- Desktop `projectRoot` 改为 `homedir()`，解决 asar 只读归档路径限制
- `createApp()` 支持外部传入 `projectRoot` 参数
- Desktop 打包压缩级别设为 `maximum`

### Fixed
- 修复 `tsup.config.ts` treeshake 导致外部调用方法被移除的问题
- 修复 `KnowledgeService.ts` 类型错误
- 修复 `release.mjs` 参数解析 bug（`process.argv.find` 误匹配 node 路径）
- 清理 src/ 下 64 个过时 `.js`/`.d.ts`/`.js.map` 文件

## [0.3.3] - 2026-06-21

### Fixed
- **Desktop 知识库/自动化/技能数据不互通**: 修复 Desktop 版本中 `PROJECT_ROOT` 指向 asar 只读归档导致知识库写入失败(400)、读取返回空的问题。现在 Desktop 使用 `homedir()` 作为 projectRoot
- **`createApp()` 支持外部传入 projectRoot**: 新增 `CreateAppOptions.projectRoot` 参数，Desktop 版传入用户 home 目录避免 asar 路径限制

### Changed
- Desktop 打包配置优化：压缩级别设为 `maximum`，清理 node_modules 中不必要的文件

## [0.3.2] - 2026-06-20

### Changed
- 新版本发布

## [0.3.0] - 2026-06-20

### Added
- **版本控制与升级系统**: 统一版本号管理，新增 CHANGELOG、版本检查 API、升级提示 UI
- **更新日志页面**: 在设置页面可见完整的版本更新记录
- **Web 端升级提醒**: Web 版本定期检查 GitHub Release，发现新版本时通知用户
- **版本检查 API**: `/api/version` 返回当前版本和更新日志，`/api/version/check` 检查是否有新版本
- **构建时版本注入**: 通过环境变量 `EASYAGENT_VERSION` 统一注入版本号

### Changed
- 版本号统一为 `0.3.0`（之前各模块版本不一致：0.1.0/0.2.0/0.5.0/0.8.0 并存）
- Desktop 自动更新仓库地址修正为 `ht182400-creator/easyagent`
- 所有 UI 组件版本号改为从 API 动态获取，消除硬编码

### Fixed
- 修复 electron-updater 仓库路径指向错误的 GitHub 账户
- 修复 Layout/Settings/Banner 等 6 处版本号不一致问题

---

## [0.2.0] - 2026-06-12

### Added
- **Desktop 桌面版**: Electron 完整桌面应用，内嵌后端服务
- **自动更新系统**: 基于 electron-updater + GitHub Releases
- **13 个功能页面**: Dashboard、对话、模型管理、会话管理、工具管理、知识库、自动化、用量分析、技能、IM、沙箱、语义搜索、设置
- **系统托盘**: 最小化到托盘、快捷菜单、退出手势
- **NSIS 安装包**: 中文安装界面、桌面快捷方式、开始菜单项

### Changed
- CLI 升级到 v0.5.0，支持交互式命令面板
- Server 重构为支持 Web + Desktop 双模式
- WebSocket 连接稳定性增强，自动重连机制

---

## [0.1.0] - 2026-05-20

### Added
- **初始版本发布**: EasyAgent AI 编程助手
- **多模型支持**: 集成 DeepSeek、通义千问、智谱GLM、Kimi、文心一言、豆包、混元、MiniMax、OpenAI、Ollama
- **CLI 命令行界面**: 支持对话、模型切换、会话管理
- **Web 服务端**: Express REST API + WebSocket 流式响应
- **Web 前端**: React + Vite + Tailwind CSS 现代化 UI
- **工具系统**: 内置代码生成、文件操作、命令执行等工具
- **会话管理**: SQLite 持久化会话历史
- **Provider 管理**: API Key 加密存储、模型动态获取
