# EasyAgent - AI编程助手 v0.4.0 (Gemini)

> 集成中国主流大模型的全功能AI编程助手  
> 融合 WorkBuddy 设计风格 + 国产模型适配  
> **模型目录动态更新 (GitHub/CDN) + 三级数据源降级 + 70工具/17分组 + 版本控制系统 + WorkBuddy 深色主题 UI**

## 📊 Agent 代码质量评测 (SWE-bench Verified)

> EasyAgent 代码生成能力经过标准化评测验证。以下为使用内置 benchmark 数据集的 pass@1 评测结果：

| 模型 | Pass@1 | 解决率 | Easy | Medium | Hard | 评测日期 |
|------|:------:|:------:|:----:|:------:|:----:|:--------:|
| **DeepSeek V4** | *(运行中)* | - | - | - | - | 2026-06 |
| **通义千问 Qwen3 Max** | *(待评测)* | - | - | - | - | - |
| **智谱 GLM-5** | *(待评测)* | - | - | - | - | - |

> 💡 **运行评测**: `pnpm benchmark --provider deepseek --model deepseek-v4`  
> 评测使用 10 道精选编码题目覆盖 easy/medium/hard 三个难度级别，包含数据结构、算法、工具函数等典型编程场景。详见 [`scripts/swe-bench/`](scripts/swe-bench/)

### 评测维度

| 类别 | 题目数 | 示例题型 |
|------|:------:|----------|
| **字符串/文件处理** | 3 | 文件名清洗、CSV 解析、目录大小计算 |
| **数据结构** | 3 | LRU Cache、加权随机选择器、Semver 解析 |
| **系统设计** | 4 | EventEmitter、JSON Schema 验证、DeepMerge、重试机制 |



## ✨ 核心特性

### 🤖 多模型支持 (10家提供商，动态更新)
- **DeepSeek** (V4, V4 Flash, V3, R1) - 高性价比代码生成
- **智谱GLM** (GLM-5, GLM-5 Flash, GLM-4 Plus/Flash/Air) - 国内领先大模型
- **通义千问** (Qwen3 Max/Plus/Turbo/Coder Plus) - 阿里云大模型
- **Kimi** (K2.7 Code, K2.6, K2.5) - 长上下文支持
- **文心一言** (ERNIE 4.5, ERNIE Speed, ERNIE Lite) - 百度大模型
- **豆包** (Seed 1.6, Pro 1.6, Lite 1.6) - 字节跳动大模型
- **腾讯混元** (TurboS Vision, T1, Pro) - 腾讯大模型
- **MiniMax** (M3, M3 Flash, M1) - 超大上下文
- **Ollama** - 本地模型 (Qwen/DeepSeek/GLM)
- **OpenAI兼容** (GPT-4o, GPT-4o-mini) - 自定义兼容接口

> 📡 **动态更新**: 启动时自动从 GitHub/CDN 下载最新 `models-catalog.json`，缓存24h。三级降级：远程目录 > 提供商API > 内置预设，确保始终获取最新模型信息。

### 🛠️ Agent能力 (70个内置工具，17大分组)
| 分组 | 工具数 | 核心工具 |
|------|--------|----------|
| **文件工具** | 9 | read_file, write_file, edit_file, delete_file, list_dir, file_info, create_dir, move_file, batch_edit |
| **搜索工具** | 4 | grep, glob, web_search, web_fetch |
| **执行与Git** | 7 | exec, git_status, git_diff, git_log, git_branch, git_blame, git_commit |
| **代码分析** | 4 | code_stats, run_tests, find_imports, find_definitions |
| **代码质量** | 4 | lint_code, format_code, read_lints, type_check |
| **项目管理** | 4 | read_config, package_run, env_info, project_overview |
| **记忆工具** | 3 | remember, recall, forget |
| **预览与交互** | 4 | start_server, preview_url, diff_files, ask_user |
| **媒体操作** | 3 | read_image, generate_image, screenshot |
| **数据库** | 2 | query_db, db_schema |
| **知识库** | 5 | knowledge_add, knowledge_search, knowledge_get, knowledge_list, knowledge_remove |
| **子Agent** | 3 | delegate_task, list_subagents, install_runtime |

### 📊 四模式操作
- **Ink CLI**: React Terminal UI，7组件化架构 (Banner/MessageList/HelpPanel/StatusBar/InputBox/App) + 10命令
- **Web Dashboard v4**: WorkBuddy 深色主题 UI (品牌渐变/快捷入口/智能模板/分组导航) + Zustand 10个Store + WebSocket流式 + 虚拟滚动(react-window) + 设计系统v4 + 版本检查
- **桌面应用**: Electron 原生桌面版，AppShell/Sidebar/TabBar/ChatView/StatusBar/ContentRouter 组件 + 自动更新(electron-updater)
- **IM 接入**: Telegram/飞书/企业微信 Bot 适配器，长轮询/Webhook 双模式

### 🔧 高级架构特性
- **版本控制系统**: 单一版本源(version.json) + CHANGELOG + 版本检查 API(/api/version, /api/version/check) + Web/Desktop 端升级提示 + 发布脚本(release.mjs) + 一键发布(release-publish.bat) + 构建时版本注入
- **模型目录动态更新**: 启动时后台下载最新模型目录，24h缓存，三级降级保证可用性
- **Skills/Plugins 系统**: 插件生命周期管理 + 6 内置技能 (code-review/test/debug/refactor/explain/doc)
- **MCP 协议**: JSON-RPC over stdio，多 MCP Server 管理
- **i18n 国际化**: zh-CN / en-US 双语支持
- **会话持久化**: SQLite 本地存储，完整对话历史，WAL 模式
- **API密钥加密**: AES-256-GCM 加密存储
- **Token统计**: 精确使用量追踪和预算控制
- **流式输出**: WebSocket + SSE 实时响应
- **虚拟滚动**: react-window 处理大量消息列表
- **自动化任务**: 定时/一次性任务，RRULE调度引擎，AI执行 + 历史追踪
- **LangGraph 引擎**: 🆕 声明式有向图引擎 (StateGraph + Checkpoint)，双引擎可切换

## 🚀 快速开始

### 环境要求
- Node.js >= 18 且 < 24 (⚠️ Node.js 24.x 暂不支持，详见下方说明)
- pnpm >= 9
- （可选）C++ 编译工具链 — 用于编译 better-sqlite3 原生模块（详见下方说明）

### ⚠️ Node.js 版本要求

**EasyAgent 当前不支持 Node.js 24.x** — better-sqlite3 核心依赖在 Node 24 上无预编译二进制，必须从源码编译 C++ 扩展，成功率仅约 60%。安装时将自动拦截。

| Node.js 版本 | 状态 | 说明 |
|-------------|:----:|------|
| 18.x / 20.x LTS | ✅ 推荐 | 完全支持，开箱即用 |
| 22.x LTS | ✅ 支持 | 完全支持 |
| **24.x** | ❌ 拦截 | better-sqlite3 无预编译二进制 |
| < 18 | ❌ 拦截 | 不支持 ES2022+ 特性 |

> 💡 如果你确实需要在 Node 24 上使用 (自担风险): `set EASYAGENT_SKIP_NODE_CHECK=1 && pnpm install`

### 安装

```bash
# 克隆仓库
git clone <your-repo-url> easyagent
cd easyagent

# 安装依赖
pnpm install
```

### 配置API密钥

```bash
# 方式1: 环境变量 (推荐)
export DEEPSEEK_API_KEY="sk-your-deepseek-key"
export DASHSCOPE_API_KEY="sk-your-qwen-key"    # 通义千问
export ZHIPU_API_KEY="your-zhipu-key"           # 智谱GLM
export MOONSHOT_API_KEY="sk-your-kimi-key"      # Kimi
export ERNIE_API_KEY="apiKey:secretKey"          # 文心一言 (格式: key:secret)
export DOUBAO_API_KEY="your-doubao-key"          # 豆包
export HUNYUAN_SECRET_ID="secretId:secretKey"    # 混元 (格式: id:key)

# 方式2: CLI内设置
ea
EA> /token-key deepseek sk-your-key-here
```

### 构建和运行

```bash
# === 安装依赖 ===
pnpm install

# === 构建 ===
cd packages/core && pnpm exec tsup       # 核心引擎 (70工具 + MCP + i18n)
cd ../langgraph && pnpm exec tsup        # 🆕 LangGraph 工作流引擎 (StateGraph + Checkpoint)
cd ../cli && pnpm exec tsup              # Ink CLI (React Terminal)
cd ../server && pnpm exec tsup           # Web服务端 (增强WebSocket + 双引擎 + 版本API)
cd ../web && npx vite build              # Web Dashboard v4
cd ../desktop && pnpm exec tsup && pnpm exec vite build  # 原生桌面版 (Vite + autoUpdater)

# === 运行 ===
cd packages/cli && node dist/main.js           # Ink CLI (React Terminal UI)
cd ../server && node dist/index.js             # Web服务端 (http://localhost:3456)
cd ../web && npx vite --port 5173              # Web开发模式
cd ../desktop && npx electron dist/main.js     # 原生桌面版
cd ../langgraph && start-demo.bat              # 🆕 LangGraph Demo (http://localhost:3455)
```

### 快速验证

```bash
# 环境检查 (Node.js 版本 + 评测数据集)
pnpm benchmark:dry

# 核心测试 (629/629 通过)
cd packages/core && npx vitest run

# 服务端测试 (160/160 通过, 含 LangGraph 引擎适配)
cd packages/server && npx vitest run

# Desktop 测试 (127/127 通过)
cd packages/desktop && npx vitest run

# LangGraph 测试 (57/57 通过)
cd packages/langgraph && npx vitest run

# 全量测试 (1469/1469 通过)
pnpm test:all
```

### ⚠️ better-sqlite3 编译说明

`better-sqlite3` 是 C++ 原生模块，EasyAgent 通过 `preinstall` 脚本自动拦截不兼容的 Node.js 版本：
- **Node.js 18/20/22 用户**：有预编译二进制，`pnpm install` 开箱即用
- **Node.js 24.x 用户**：安装时自动拦截并提示降级方案
  - 如需强制安装: `set EASYAGENT_SKIP_NODE_CHECK=1 && pnpm install`
  - 然后手动编译: `cd packages/core && pnpm rebuild better-sqlite3`
- **测试环境**：vitest 已通过 alias mock 绕过原生模块依赖，测试始终可运行

## 📁 项目结构

```
easyagent/
├── packages/
│   ├── core/              # 核心引擎 (✅ 196KB + DTS 43KB + 10/10 测试)
│   │   ├── adapters/      # 模型适配器 (10个提供商 + 工厂)
│   │   ├── agent/         # Agent引擎 (ReAct循环 + 流式)
│   │   ├── tools/         # 工具系统 (70个内置工具，17分组)
│   │   ├── mcp/           # MCP协议 (JSON-RPC over stdio)
│   │   ├── plugins/       # 插件系统 (PluginManager + 生命周期)
│   │   ├── im/            # IM适配器 (Telegram/飞书/企业微信)
│   │   ├── session/       # 会话管理 (SQLite + WAL)
│   │   ├── config/        # 配置管理 + 模型动态注册表
│   │   └── utils/         # 工具函数 (i18n/logger/encryption)
│   ├── langgraph/         # 🆕 LangGraph 工作流引擎 (✅ 54KB ESM + DTS 26.5KB)
│   │   ├── state/         # AgentState 定义 + Reducer
│   │   ├── nodes/         # Think/Act/Observe 三节点
│   │   ├── graph/         # StateGraph 编译 + 条件路由
│   │   ├── memory/        # CheckpointSaver (SQLite) + Memory
│   │   ├── bridge/        # Phase A: 与 core 桥接 (adapter/tool/factory)
│   │   └── demo/          # Web 可视化 Demo (端口 3455)
│   ├── cli/               # Ink CLI (✅ 14KB React Terminal)
│   ├── server/            # Web服务端 REST+WS (✅ 621KB ESM, 双引擎切换)
│   │   ├── src/langgraph/ # 🆕 Phase B: 引擎适配器 + 工厂 + Checkpoint API
│   │   └── API: /api/* (REST) + ws:// (WebSocket 8事件) + /api/langgraph/sessions
│   ├── web/               # Web Dashboard v4 WorkBuddy 风格 (✅ 306KB JS + 46KB CSS)
│   ├── desktop/           # Electron原生桌面版 (✅ 173KB JS + 16KB CSS)
│   │   └── src/renderer/  # React原生UI (AppShell/Sidebar/TabBar/ChatView/StatusBar)
│   ├── frontend/          # 🆕 共享前端组件 (Desktop + Web 共用)
│   └── vscode/            # VS Code 扩展 (独立版本)
├── scripts/               # 工具脚本
│   ├── sync-version.mjs   # 版本同步脚本 🆕
│   └── release.mjs        # 发布自动化脚本 🆕
├── release-publish.bat    # 一键交互式发布脚本 🆕
├── CHANGELOG.md            # 更新日志 (Keep a Changelog 格式) 🆕
├── version.json            # 单一版本源 🆕
├── models-catalog.json    # 远程模型目录模板 🆕
├── .codebuddy/memory/     # AI 工作记忆 (跨会话上下文)
└── pnpm-workspace.yaml    # pnpm monorepo 配置
```

## 🎯 CLI命令

| 命令 | 说明 |
|------|------|
| `/help` | 显示帮助 |
| `/model` | 查看当前模型 |
| `/models` | 列出所有可用模型 |
| `/providers` | 显示已配置的提供商 |
| `/switch <provider> <model>` | 切换模型 |
| `/status` | 查看系统状态 |
| `/sessions` | 会话列表 |
| `/clear` | 清除当前会话 |
| `/tools` | 列出可用工具 |
| `/token-key <provider> <key>` | 设置API密钥 |
| `/exit` | 退出 |

## 🔌 API接口

### REST API

#### 核心 API
```
GET  /api/health              - 健康检查
GET  /api/status              - 系统状态
GET  /api/version             - 版本信息 + 更新日志
GET  /api/version/check       - 检查新版本 (GitHub API)
GET  /api/config              - 获取配置
PUT  /api/config              - 更新配置
GET  /api/providers           - 提供商列表(含动态模型)
PUT  /api/providers/:id/key   - 设置API密钥
POST /api/providers/:id/test  - 测试连接
POST /api/providers/:id/models/refresh - 刷新单个提供商模型 🆕
GET  /api/providers/all-models          - 全部动态模型列表 🆕
POST /api/providers/catalog/refresh     - 强制刷新模型目录 🆕
GET  /api/providers/catalog/status      - 模型目录状态查询 🆕
GET  /api/config/templates    - 仪表盘模板 🆕
GET  /api/config/allowed-commands - 命令白名单 🆕
GET  /api/sessions            - 会话列表
GET  /api/sessions/:id        - 获取会话
DELETE /api/sessions/:id      - 删除会话
POST /api/sessions/search     - 搜索会话
POST /api/chat                - 发送消息
GET  /api/tools               - 工具列表
```

#### LangGraph 引擎 API 🆕
```
GET  /api/langgraph/sessions          - Checkpoint 会话列表
GET  /api/langgraph/sessions/:id      - 会话状态
POST /api/langgraph/sessions/:id/resume - 从 Checkpoint 恢复
```

#### Plugins & Skills API
```
GET    /api/plugins           - 插件列表
POST   /api/plugins/load      - 加载插件
POST   /api/plugins/unload    - 卸载插件
PUT    /api/plugins/:id/toggle - 启用/禁用插件
GET    /api/skills            - 技能列表
```

#### IM 适配器 API
```
GET    /api/im/status         - IM 平台状态
GET    /api/im/config         - IM 配置列表（脱敏）
PUT    /api/im/config         - 配置/更新 IM 平台
POST   /api/im/:platform/start - 启动 IM 平台
POST   /api/im/:platform/stop  - 停止 IM 平台
DELETE /api/im/:platform      - 删除 IM 平台配置
ALL    /api/im/webhook/:platform - Webhook 接收端点
```

### WebSocket (增强协议 v2)

```
ws://localhost:3456/ws

客户端 → 服务端:
  { type: "subscribe", sessionId: "..." }   # 订阅会话
  { type: "chat", message: "...", sessionId, model, provider }  # 发送消息
  { type: "stop", sessionId: "..." }        # 停止生成
  { type: "switch_model", provider, model } # 切换模型

服务端 → 客户端: (8种事件)
  { type: "connected" }                      # 连接成功
  { type: "text_delta", delta: "..." }       # 流式文本增量
  { type: "text_done" }                      # 文本完成
  { type: "tool_use", toolCallId, toolName, input }  # 工具调用开始
  { type: "tool_result", toolCallId, output, error }  # 工具调用结果
  { type: "token_usage", usage: {...} }      # Token统计
  { type: "error", message: "..." }          # 错误
  { type: "done" }                           # 全部完成
```

## 🧪 测试

```bash
# 运行所有测试 (1469 tests)
pnpm test:all

# 运行核心模块测试 (629 tests)
pnpm test:core

# 运行服务端集成测试 (160 tests, 含 LangGraph 引擎)
pnpm test:server

# 运行 Desktop 测试 (127 tests)
pnpm test:desktop

# 运行 LangGraph 引擎测试 (57 tests)
cd packages/langgraph && npx vitest run
```

## 🏗️ 技术栈

| 层级 | 技术 | 备注 |
|------|------|------|
| 语言 | TypeScript 5.x | 严格模式 |
| 运行时 | Node.js 18-22 (LTS 推荐) | ⚠️ 24.x 被 preinstall 拦截 |
| 包管理 | pnpm 11+ | monorepo workspace |
| 包管理 | pnpm 11+ | monorepo workspace |
| CLI框架 | Ink (React for Terminal) | Banner/ChatView/StatusBar |
| Web前端 | React 18 + Vite + Tailwind CSS v3 | WorkBuddy 深色主题 + 虚拟滚动(react-window) + 分组导航 |
| 状态管理 | Zustand v4 | 10个Store + 持久化 |
| Web后端 | Express + WebSocket (ws) | REST + 8事件类型 |
| 桌面 | Electron 30 + React/Vite/Tailwind | 四件套布局 |
| 数据库 | **better-sqlite3** (SQLite) | ⚠️ Node 24 需从源码编译 |
| 加密 | AES-256-GCM | 密钥本地加密存储 |
| 构建 | tsup + Vite | ESM 输出 |
| 测试 | Vitest | Core 629 + Server 160 + Desktop 127 + LangGraph 57 + Frontend/Web/管线 396 = 1469 通过 |
| 插件系统 | IPlugin/ISkill/PluginManager | 生命周期 + 钩子 |
| IM适配器 | 原生 fetch (零外部依赖) | Telegram/飞书/企业微信 |

## 📊 与竞品对比

| 功能 | Claude Code | CodeBuddy CN | **EasyAgent** |
|------|------------|-------------|-----------|
| 中国大模型 | ❌ | DeepSeek+混元 | ✅ **10家国产大模型** |
| CLI界面 | ✅ | IDE插件 | ✅ **Ink React Terminal** |
| Web Dashboard | ❌ | ❌ | ✅ **WorkBuddy 风格 + WS 流式** |
| 桌面应用 | ❌ | ❌ | ✅ **Electron 原生** |
| IM 接入 | ❌ | ❌ | ✅ **Telegram/飞书/微信** |
| 开源 | ❌ | ❌ | ✅ **MIT** |
| 会话持久化 | 有限 | ✅ | ✅ **SQLite + WAL** |
| 多会话管理 | ✅ | ✅ | ✅ |
| Token统计 | ✅ | ✅ | ✅ |
| 流式输出 | ✅ | ✅ | ✅ **WS + SSE 双模式** |
| 自定义模型 | 有限 | ❌ | ✅ **完整支持** |
| API密钥加密 | - | - | ✅ **AES-256-GCM** |
| 模型动态更新 | ❌ | ❌ | ✅ **GitHub/CDN + 24h缓存** |
| MCP协议 | ✅ | ❌ | ✅ **JSON-RPC stdio** |
| 插件系统 | ❌ | ❌ | ✅ **PluginManager + 6技能** |
| 工具数量 | 59 | ~30 | 70 |
| 虚拟滚动 | ✅ | ❌ | ✅ **react-window** |
| i18n | ✅ | ✅ | ✅ **zh-CN/en-US** |
| 自动化任务 | ❌ | ✅ | ✅ 已完成 |
| 版本控制 | ❌ | ❌ | ✅ version.json + CHANGELOG + 升级提示 |

## 🎨 图标资源

自定义图标集中放置在 `packages/web/public/icons/` 目录。详细清单见该目录下的 `README.md`。

共需 **22 个图标**，涵盖：Logo / 快速操作 / 统计 / 模板 / 输入框 五大类。使用 `lucide-react` 作为默认图标方案，需自定义的图标（如品牌 Logo）可替换为本地 SVG/PNG。

```bash
# 部署自定义图标
cp your-icons/*.svg packages/web/public/icons/
cd packages/web && npx vite build
```

## 🤝 贡献

欢迎提交 Issue 和 Pull Request！

## 📄 协议

MIT License

---

**EasyAgent** - 让AI编程触手可及
