# 全项目测试覆盖地图 — 重评估版

> 基准: PRD v5.3 / ADD v5.4 / 批次A+B代码评审  
> 评估日期: 2026-06-24  
> 现有测试: core 25文件/637用例 | server 3文件/41用例 | desktop 7文件/118用例  
> 总计: **35 测试文件 / 796 用例**

---

## 一、单元测试层级 (Unit Test)

| 序号 | 目标模块 | 核心场景 | 原始评估 | 重评估 | 现有测试文件 | 用例数(估) | 缺失点 |
|------|----------|----------|----------|--------|-------------|-----------|--------|
| UT-01 | **AgentEngine** | ReAct循环终止(max25轮)、AbortSignal中断、流式回调(onPartialResponse)、最终答案提取 | 部分覆盖 | ✅ **已覆盖** | `agent-engine.test.ts` | ~55 | max25轮边界、onPartialResponse深度验证可加强 |
| UT-02 | **ToolRegistry** | 51工具注册/覆盖、getTool查找、execute参数校验、requiresConfirm权限拦截、超时(30s) | 部分覆盖 | ✅ **已覆盖** | `tool-registry.test.ts` | ~40 | 超时处理(30s)未覆盖 |
| UT-03 | **ModelAdapter** | 10家提供商实例化、连接验证、模型列表获取 | 需补充 | ✅ **已覆盖** | `adapter-factory.test.ts` | ~45 | — |
| UT-04 | **KnowledgeService** | 双作用域CRUD、1000字符分块、跨域fallback | 需补充 | ✅ **已覆盖** | `knowledge-service.test.ts` | ~50 | 1000字符分块存储未验证 |
| UT-05 | **SessionManager** | SQLite持久化、WAL模式、消息序列化、Token统计 | ✅已覆盖 | ✅ **已覆盖** | `session-manager.test.ts` | ~35 | — |
| UT-06 | **PluginManager** | 插件加载/卸载/启用/禁用、6个内置技能、7种钩子触发 | 骨架完成 | ✅ **已覆盖** | `plugins-skills.test.ts` | ~30 | 钩子触发机制(7种)深度不足 |
| UT-07 | **ModelRegistry** | 远程catalog下载、24h TTL缓存、三级降级、强制刷新 | 需补充 | 🔴 **完全缺失** | — | 0 | 368行源码，零覆盖 |
| UT-08 | **AutomationManager** | RRULE解析、nextRun计算、超时、历史500条限制 | 需补充 | ✅ **已覆盖** | `automation-manager.test.ts` | ~30 | maxDurationMinutes超时未验证 |
| UT-09 | **MCPManager** | stdio启动/关闭、JSON-RPC(listTools/callTool)、超时 | 需补充 | ✅ **已覆盖** | `mcp-client.test.ts` | ~35 | — |
| UT-10 | **i18n国际化** | t()翻译、zh-CN/en-US完整覆盖、嵌套键值、缺失键降级 | 需补充 | 🟡 **骨架** | `utils.test.ts` | 5 | 仅测导出+locale切换，无实际翻译内容验证 |
| UT-11 | **SandboxManager** | Docker检测降级、exec执行、输出限制10MB | 需补充 | ✅ **已覆盖** | `sandbox.test.ts` | ~25 | 输出限制10MB未验证 |
| UT-12 | **ConfigManager** | 去硬编码、模型列表、仪表盘模板、命令白名单 | 需补充 | ✅ **已覆盖** | `config-manager.test.ts` | ~40 | — |
| UT-13 | **FileTools** | 路径穿越防护、大文件读写、编码处理 | 部分覆盖 | ✅ **已覆盖** | `builtin-tools.test.ts` + `file-extra-tools.test.ts` | ~60 | 路径穿越防护场景不足 |
| UT-14 | **ExecTools** | 危险命令白名单、Shell注入防护、超时终止、环境变量 | 部分覆盖 | 🟡 **部分** | `builtin-tools.test.ts` | ~25 | 注入防护场景深度不足 |
| UT-15 | **GitTools** | 7个Git命令解析、非Git仓库降级 | 需补充 | 🟡 **部分** | `builtin-tools.test.ts` | ~15 | GitAdvancedTools(21.96KB)零覆盖 |

### UT 层级小结

| 状态 | 数量 | 模块 |
|------|------|------|
| ✅ 已覆盖 | 9 | UT-01~06, UT-08~09, UT-11~13 |
| 🟡 部分 | 4 | UT-10(i18n), UT-14(ExecTools安全), UT-15(GitAdvanced), UT-01(max25边界) |
| 🔴 缺失 | 1 | **UT-07 ModelRegistry** (368行零覆盖) |

---

## 二、集成测试层级 (Integration Test)

| 序号 | 目标模块 | 核心场景 | 原始评估 | 重评估 | 现有测试 | 用例数 | 缺失点 |
|------|----------|----------|----------|--------|---------|--------|--------|
| IT-01 | **Server REST API** | 所有HTTP端点 | 🔴严重缺失 | ✅ **已覆盖** | `server/api.test.ts` | ~25 | 覆盖率待量化，部分端点可能缺 |
| IT-02 | **Server WebSocket** | /ws流式消息推送、断开重连 | 严重缺失 | ✅ **已覆盖** | `server/websocket.test.ts` | ~10 | 重连机制未验证 |
| IT-03 | **TelegramAdapter** | 长轮询/Webhook双模式、流式编辑、白名单 | 严重缺失 | 🟡 **骨架** | `im-adapters.test.ts` (BaseIMAdapter) | ~20 | **无TelegramAdapter专项测试**，仅测抽象基类 |
| IT-04 | **FeishuAdapter** | token刷新、URL验证、Lua/Lark双域名 | 严重缺失 | ✅ **已覆盖** | `feishu-adapter.test.ts` | ~20 | — |
| IT-05 | **WeChatAdapter** | AES-256解密、XML解析、Token管理 | 严重缺失 | ✅ **已覆盖** | `wechat-adapter.test.ts` + `wechat-crypto.test.ts` | ~25 | — |
| IT-06 | **IMManager路由** | 多平台消息路由、并发处理、启停切换 | 需补充 | 🟡 **部分** | `im-adapters.test.ts` | ~15 | 并发消息处理未测 |
| IT-07 | **KnowledgeService+HTTP** | 文件上传(10MB)、作用域切换、统计合并 | 需补充 | 🟡 **部分** | `knowledge-service.test.ts` (单元) | ~50 | 无HTTP层集成测试 |
| IT-08 | **AutomationManager调度** | 定时执行、AgentEngine集成、历史记录、超时 | 需补充 | 🟡 **部分** | `automation-manager.test.ts` (单元) | ~30 | 无AgentEngine集成调用测试 |
| IT-09 | **ModelRegistry+Server** | 启动下载、/api/providers/catalog/refresh、5分钟缓存 | 需补充 | 🔴 **缺失** | — | 0 | ModelRegistry完全无测试 |
| IT-10 | **Desktop IPC** | get-app-version、check-update、update-status事件 | 需补充 | 🟡 **骨架** | `desktop/preload.test.ts` | ~10 | 仅测API规范，无实际IPC调用模拟 |

### IT 层级小结

| 状态 | 数量 | 模块 |
|------|------|------|
| ✅ 已覆盖 | 4 | IT-01, IT-02, IT-04, IT-05 |
| 🟡 部分 | 4 | IT-03(TelegramAdapter缺失), IT-06~08 |
| 🔴 缺失 | 2 | **IT-03 TelegramAdapter专项**, **IT-09 ModelRegistry+Server** |

---

## 三、端到端测试层级 (E2E)

| 序号 | 目标 | 核心场景 | 原始评估 | 重评估 | 备注 |
|------|------|----------|----------|--------|------|
| E2E-01 | CLI→Core | /help → Banner/StatusBar/HelpPanel | 缺失 | 🔴 缺失 | 0用例 |
| E2E-02 | CLI→Agent | "读取README.md" → read_file → 返回 | 缺失 | 🔴 缺失 | 0用例 |
| E2E-03 | Web→Server→Agent | 发消息→WS流式响应→工具卡片渲染 | 缺失 | 🔴 缺失 | 0用例 |
| E2E-04 | Desktop→Agent | Electron启动→发消息→流式响应 | 缺失 | 🔴 缺失 | 0用例 |
| E2E-05 | IM→Agent→IM | Telegram /start → Agent回复 | 缺失 | 🔴 缺失 | 0用例 |
| E2E-06 | 完整闭环 | 修改文件→git diff→测试验证→提交 | 缺失 | 🔴 缺失 | 0用例 |

**E2E 层级**: 6/6 🔴 完全缺失。建议 P2 优先级逐步建设。

---

## 四、性能与基准测试 (Performance/Benchmark)

| 序号 | 目标 | 指标 | 原始评估 | 重评估 | 
|------|------|------|----------|--------|
| PT-01 | Agent响应延迟 | 无工具 <3s；5+工具 <15s | 🔴缺失 | 🔴缺失 |
| PT-02 | 文件搜索 | 10万文件grep <500ms | 🔴缺失 | 🔴缺失 |
| PT-03 | Web首屏 | FCP<2s, LCP<2.5s | 🔴缺失 | 🔴缺失 |
| PT-04 | SessionManager | 1000条消息<200ms | 🔴缺失 | 🔴缺失 |
| PT-05 | ToolRegistry | 51工具注册<50ms | 🔴缺失 | 🔴缺失 |
| PT-06 | ModelRegistry | 缓存加载<100ms | 🔴缺失 | 🔴缺失 |
| PT-07 | KnowledgeService | 1000篇搜索<300ms | 🔴缺失 | 🔴缺失 |

**PT 层级**: 7/7 🔴 完全缺失。建议 PT-01/02/04 作为 P0 优先建设（vitest bench）。

---

## 五、跨平台与兼容性 (Cross-Platform)

| 序号 | 目标 | 场景 | 原始评估 | 重评估 |
|------|------|------|----------|--------|
| CP-01 | Windows 10+ | 路径\、taskkill、cmd.exe | 🔴缺失 | 🔴缺失 |
| CP-02 | macOS 12+ | POSIX路径、child_process.spawn | 🔴缺失 | 🔴缺失 |
| CP-03 | Linux Ubuntu | chmod、/bin/sh、Docker | 🔴缺失 | 🔴缺失 |
| CP-04 | Node 18/20/22 | 3 LTS全通过 | 🔴缺失 | 🔴缺失 (CI Matrix未配置) |
| CP-05 | Desktop打包 | NSIS/DMG/AppImage | 🔴缺失 | 🔴缺失 |

**CP 层级**: 5/5 🔴 完全缺失（CI已配置Matrix但无多平台runner执行记录）。

---

## 六、安全测试 (Security)

| 序号 | 目标 | 场景 | 原始评估 | 重评估 |
|------|------|------|----------|--------|
| ST-01 | PluginManager沙箱 | worker_threads隔离 | 🔴缺失 | 🔴缺失 |
| ST-02 | ExecTools注入 | ; rm -rf /、&&、\| | 🔴缺失 | 🔴缺失 |
| ST-03 | FileTools穿越 | ../../../etc/passwd | 🔴缺失 | 🔴缺失 |
| ST-04 | API Key加密 | AES-256-GCM | 需补充 | ✅ **已有** | `encryption.test.ts` 覆盖加密/解密/哈希 |
| ST-05 | IM Webhook签名 | 飞书/企业微信伪造检测 | 🔴缺失 | 🔴缺失 |
| ST-06 | XSS防御 | <script>转义 | 🔴缺失 | 🔴缺失 |
| ST-07 | Token预算限制 | 超限拒止 | 🔴缺失 | 🔴缺失 |

**ST 层级**: 1/7 已覆盖 (ST-04)。

---

## 七、UI/UX 测试

| 序号 | 目标 | 场景 | 原始评估 | 重评估 |
|------|------|------|----------|--------|
| UI-01 | Web Dashboard | 侧边栏、模型配置、技能市场 | 🔴缺失 | 🔴缺失 |
| UI-02 | Desktop UI组件 | Sidebar/TabBar/StatusBar/ChatView | 部分覆盖 | ✅ **部分** | `desktop/` 有 StatusBar(10)+TabBar(9)+Store(30+22+~20) ≈ 91 UI层用例 |
| UI-03 | CLI Ink组件 | Banner/MessageList/StatusBar | 🔴缺失 | 🔴缺失 |
| UI-04 | 响应式布局 | 1920/1366/移动端 | 🔴缺失 | 🔴缺失 |

---

## 八、文档与交付验证

| 序号 | 目标 | 场景 | 原始评估 | 重评估 |
|------|------|------|----------|--------|
| DV-01 | 版本一致性 | version.json ↔ package.json | 🔴缺失 | 🔴缺失 |
| DV-02 | CHANGELOG | Keep a Changelog | 🔴缺失 | 🔴缺失 |
| DV-03 | README | curl \| bash 一键安装 | 🔴缺失 | 🔴缺失 |
| DV-04 | API文档 | swagger-jsdoc | 🔴缺失 | 🔴缺失 |
| DV-05 | 覆盖率门禁 | Core>80%, Server>70% | 🔴缺失 | 🔴缺失 |

---

---

## 九、管线模块自审计 (Pipeline Self-Audit)

> 新增评估: 2026-06-24，对照测试覆盖地图补充管线模块覆盖分析

### 9.1 管线模块文件结构

```
docs/pipeline/
├── lib/                          # 核心库 (339 symbols)
│   ├── pipeline-config.mjs       # 【唯一配置源】29模块/6阶段/3分支/KPI/评分 (222 symbols)
│   ├── pipeline-api.mjs          # 6 REST API 路由处理器 (26 symbols)
│   ├── pipeline-parser.mjs       # MD 文件解析器 (76 symbols)
│   └── pipeline-cache.mjs        # mtime 文件级缓存 (15 symbols)
├── __tests__/                    # 管线自测试 (58用例 ✅ 100%)
│   ├── pipeline-config.test.mjs  # 29 用例 — MODULES/PHASES/KPI/Dashboard
│   ├── pipeline-cache.test.mjs   # 16 用例 — 读写/快照/有效性/压力
│   ├── pipeline-parser.test.mjs  # 9 用例 — 标签/关键词/去重/状态
│   └── pipeline-api.test.mjs     # 14 用例 — 6端点/JSON/CORS/404
├── scripts/
│   └── scan-test-cases.mjs       # 测试用例扫描器 → test-case-mapping.json
├── index.html                    # ~1900 行 — SVG流程图 + 仪表板 + 问题面板 + 时序图
├── server.mjs                    # 113 行 — HTTP服务器(端口8898) + 路径穿越防护
├── pipeline-data.json            # ~6880 行 — 管线+仪表板数据快照 (187KB)
├── memory-format-spec.md         # Memory 记录格式规范 v1.0
├── ARCHITECTURE.md               # ~500 行 — 架构设计文档 v2.2
├── README.md                     # 使用说明
├── issue-data.json               # 问题快照 (89 问题 / 26 模块)
├── project-progress-data.json    # 旧版进度数据
├── test-case-mapping.json        # 876 用例→模块映射表
├── code-review-*.md              # 3 份代码评审报告 (2026-06-24)
└── _*.mjs / _*.json              # ⚠️ 8+ 临时脚本 (需清理)
```

### 9.2 管线模块测试覆盖 (已在 test-case-mapping.json 中)

| ID | 管线模块 | test-case-mapping 用例数 | 独立测试用例 | 状态 |
|----|----------|------------------------|-------------|------|
| p5a | 管线数据看板 (index.html) | 29 | `pipeline-config.test.mjs` 29 用例 | ✅ 已覆盖 |
| p5b | 自动数据采集 (cache+parser) | 25 | cache 16 + parser 9 | ✅ 已覆盖 |
| p5c | 实时问题追踪 (parser+API) | 23 | parser 9(共享) + API 14 | ✅ 已覆盖 |
| p5d | 管线自测试 | 0 | 4文件58用例，100% 通过 | ✅ 已覆盖 |

> 管线模块不计入主项目 796 用例，其自身 58 用例使用 Node.js 原生 `--test` 运行器。

### 9.3 管线模块健康度评估

| 指标 | 评估 | 详情 |
|------|------|------|
| 📐 架构设计 | ✅ 优秀 | 单一配置源、三级加载、纯函数渲染、四级渐进展开 |
| 🧪 自测试 | ✅ 100% | 4 文件 58 用例全通过，覆盖 config/cache/parser/API |
| 📊 数据覆盖 | ✅ 完整 | 26 模块问题追踪、876 用例映射、9 张仪表板卡片 |
| 🔒 安全性 | ✅ 良好 | server.mjs 路径穿越防护、lib/*.mjs 不对外暴露 |
| 📝 文档 | ✅ 完善 | ARCHITECTURE.md(500行) + README.md + memory-format-spec.md |
| 🔄 数据同步 | ⚠️ 部分 | Git hook 自动更新存在但 KPI 数据已过时 |
| 🧹 代码整洁 | ⚠️ 需清理 | 8+ 临时 `_*.mjs` 脚本、3 个 `_vitest-*.json` 快照残留 |
| 🐛 遗留问题 | 🟡 3项 | 见 9.4 节 |

### 9.4 管线模块发现的问题

| # | 问题 | 严重度 | 详情 |
|---|------|--------|------|
| PIPE-01 | **KPI 数据过时** | 🟡 P1 | `pipeline-data.json` meta.totalTests=35(实际796)、modelsSupported=4(实际10)。评分引擎 `calculateScore()` 依赖过时数据 |
| PIPE-02 | **临时脚本残留** | 🟢 P3 | 8 个 `_*.mjs` 临时脚本 (`_add_level3.mjs`, `_check_data.mjs`, `_debug.mjs`, `_direct_test.mjs`, `_scan_issues.mjs`, `_test_api.mjs`, `_test_api2.mjs`, `_test_final.mjs`) + 4 个 `_*.json` 快照 (`_test_detail.json`, `_vitest-*.json`x3) |
| PIPE-03 | **pipeline-data.json 过大** | 🟢 P3 | 6880 行/187KB，dashboard 段含重复 L4 测试用例名。可通过引用 test-case-mapping.json 节点 ID 替代内嵌完整数据 |
| PIPE-04 | **缺少 CI 集成** | 🟡 P1 | 管线自测试 (`node --test`) 未纳入 `.github/workflows/ci.yml`，仅手动运行 |
| PIPE-05 | **code-review 发现 C1 已修复** | ✅ 已修复 | `calculateScore()` 添加 5s TTL 缓存 (commit `f53cdbd`) |
| PIPE-06 | **code-review 发现 C2-C3 遗留** | 🟢 P3 | `scoreDimensions` 字段命名不一致；`pipeline-api.mjs` LIVE_CACHE 和 scoreCache TTL 双重重叠 |

### 9.5 管线模块行动建议

| 优先级 | 行动 | 对应问题 |
|--------|------|---------|
| 🟡 P1 | 更新 `pipeline-data.json` KPI 为最新值 (796 用例、10 提供商) | PIPE-01 |
| 🟡 P1 | 将 `node --test docs/pipeline/__tests__/` 加入 CI | PIPE-04 |
| 🟢 P3 | 清理 8 个临时 `_*.mjs` 脚本 + 4 个 `_*.json` 快照 | PIPE-02 |
| 🟢 P3 | 优化 `pipeline-data.json` dashboard 段，引用 test-case-mapping.json 节点 | PIPE-03 |

---

## 重评估结论

### 状态分布

| 层级 | 🔴 缺失 | 🟡 部分 | ✅ 已覆盖 | 合计 |
|------|---------|---------|-----------|------|
| 单元测试 (UT) | 1 | 4 | 10 | 15 |
| 集成测试 (IT) | 2 | 4 | 4 | 10 |
| E2E (E2E) | 6 | 0 | 0 | 6 |
| 性能 (PT) | 7 | 0 | 0 | 7 |
| 跨平台 (CP) | 5 | 0 | 0 | 5 |
| 安全 (ST) | 6 | 0 | 1 | 7 |
| UI/UX | 3 | 1 | 0 | 4 |
| 文档交付 | 5 | 0 | 0 | 5 |
| **主线合计** | **35** | **9** | **15** | **59** |
| 管线自测试 (P5) | 0 | 0 | ✅ 4 | 4 |
| **全项目合计** | **35** | **9** | **19** | **63** |

### 与原始评估的主要差异

| 差异点 | 原始评估 | 重评估 | 原因 |
|--------|----------|--------|------|
| UT-03 ModelAdapter | "需补充" | ✅已覆盖 | adapter-factory.test.ts 已覆盖5个适配器 |
| UT-04 KnowledgeService | "需补充" | ✅已覆盖 | knowledge-service.test.ts ~50用例 |
| UT-06 PluginManager | "骨架完成" | ✅已覆盖 | plugins-skills.test.ts 已覆盖插件生命周期 |
| UT-08 AutomationManager | "需补充" | ✅已覆盖 | automation-manager.test.ts ~30用例 |
| UT-09 MCPManager | "需补充" | ✅已覆盖 | mcp-client.test.ts ~35用例 |
| UT-11 SandboxManager | "需补充" | ✅已覆盖 | sandbox.test.ts ~25用例 |
| UT-12 ConfigManager | "需补充" | ✅已覆盖 | config-manager.test.ts ~40用例 |
| IT-01 Server API | "严重缺失" | ✅已覆盖 | server/api.test.ts |
| IT-02 Server WS | "严重缺失" | ✅已覆盖 | server/websocket.test.ts |
| IT-04 FeishuAdapter | "严重缺失" | ✅已覆盖 | feishu-adapter.test.ts |
| IT-05 WeChatAdapter | "严重缺失" | ✅已覆盖 | wechat-adapter + wechat-crypto |

### 🔴 P0 立即行动项 (5项)

| 优先级 | ID | 行动 | 依据 | 状态 |
|--------|----|------|------|------|
| 🔴P0 | **UT-07** | 编写 ModelRegistry 单元测试 | 368行核心代码零覆盖 | ✅ 已完成 (30 tests) |
| 🔴P0 | **ST-02** | 编写 ExecTools 注入防护测试 | 批次A B5修复后安全性需验证 | ✅ 已完成 (34 tests) |
| 🔴P0 | **ST-03** | 编写 FileTools 路径穿越测试 | 批次A B6修复后安全性需验证 | ✅ 已完成 (28 tests) |
| 🔴P0 | **IT-03** | 编写 TelegramAdapter 专项集成测试 | 530行适配器仅测抽象基类 | ✅ 已完成 (30 tests) |
| 🔴P0 | **PT-01** | 建立 vitest bench 基准测试框架 | 全项目零性能基准 | ✅ 已完成 (4组/8项) |

### 🟡 P1 规划项 (7项)

| 优先级 | ID | 行动 | 状态 |
|--------|----|------|------|
| 🟡P1 | **UT-10** | i18n 深度翻译验证测试 (嵌套键/缺键降级) | ✅ 已完成 (39 tests) |
| 🟡P1 | **UT-15** | GitAdvancedTools 测试 (21.96KB零覆盖) | ✅ 已完成 (32 tests) |
| 🟡P1 | **IT-09** | ModelRegistry+Server 集成测试 | ⏳ 后端 | 
| 🟡P1 | **DV-05** | 覆盖率门禁 (vitest --coverage + CI门禁) | ⏳ 后端 |
| 🟡P1 | **PIPE-01** | 更新 pipeline-data.json KPI (796用例/10提供商) | ✅ 已更新 (814/10) |
| 🟡P1 | **PIPE-04** | CI 集成管线自测试 (node --test docs/pipeline/__tests__/) | ✅ 已集成 |

### 🟢 P3 管线清理项 (3项)

| 优先级 | ID | 行动 |
|--------|----|------|
| 🟢P3 | **PIPE-02** | 清理 8 个临时 `_*.mjs` 脚本 + 4 个 `_*.json` 快照 |
| 🟢P3 | **PIPE-03** | 优化 pipeline-data.json dashboard 引用 test-case-mapping.json |
| 🟢P3 | **PIPE-06** | 统一 scoreDimensions 字段命名 + 消除 LIVE_CACHE/scoreCache 双重缓存 |
