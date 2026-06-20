# EasyAgent - AI编程助手 v0.3.0 (Gemini)

> 集成中国主流大模型的全功能AI编程助手  
> 融合 WorkBuddy 设计风格 + 国产模型适配  
> **模型目录动态更新 (GitHub/CDN) + 三级数据源降级 + 70工具/17分组 + 版本控制系统 + WorkBuddy 深色主题 UI**

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

## 🚀 快速开始

### 环境要求
- Node.js >= 18
- pnpm >= 9
- （可选）C++ 编译工具链 — 用于编译 better-sqlite3 原生模块（详见下方说明）

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
cd ../cli && pnpm exec tsup              # Ink CLI (React Terminal)
cd ../server && pnpm exec tsup           # Web服务端 (增强WebSocket + 版本API)
cd ../web && npx vite build              # Web Dashboard v4
cd ../desktop && pnpm exec tsup && pnpm exec vite build  # 原生桌面版 (Vite + autoUpdater)

# === 运行 ===
cd packages/cli && node dist/main.js           # Ink CLI (React Terminal UI)
cd ../server && node dist/index.js             # Web服务端 (http://localhost:3456)
cd ../web && npx vite --port 5173              # Web开发模式
cd ../desktop && npx electron dist/main.js     # 原生桌面版
```

### 快速验证

```bash
# 核心测试 (629/629 通过)
cd packages/core && npx vitest run

# 服务端测试 (41/41 通过)
cd packages/server && npx vitest run

# Desktop 测试 (127/127 通过)
cd packages/desktop && npx vitest run

# 全量测试 (806/806 通过)
pnpm test:all
```

### ⚠️ better-sqlite3 编译说明

`better-sqlite3` 是 C++ 原生模块，需要匹配当前 Node.js 版本的预编译二进制文件：
- **Node.js v24.13.0 用户**：当前无预编译二进制，需安装 C++ 编译工具链从源码编译
  - Windows: 安装 Visual Studio Build Tools (含 C++ 工作负载) + Python 3.x
  - 安装后运行: `pnpm rebuild better-sqlite3`
- **Node.js 18/20/22 用户**：有预编译二进制，开箱即用
- **测试环境**：vitest 已通过 alias mock 绕过原生模块依赖，测试始终可运行

## 📁 项目结构

```
easyagent/
├── packages/
│   ├── core/              # 核心引擎 (✅ 196KB + DTS 43KB + 10/10 测试)
│   │   ├── adapters/      # 模型适配器 (10个提供商 + 工厂)
│   │   ├── agent/         # Agent引擎 (ReAct循环 + 流式)
│   │   ├── tools/         # 工具系统 (70个内置工具，17分组: File/FileExtra/Search/Exec/Git/Code/Project/Quality/Preview/Media/Database/Knowledge/SubAgent/Memory)
│   │   ├── mcp/           # MCP协议 (JSON-RPC over stdio) 客户端/管理器
│   │   ├── plugins/       # 插件系统 (PluginManager + 生命周期 + 6内置技能)
│   │   ├── im/            # IM适配器 (Telegram/飞书/企业微信) + IMManager
│   │   ├── session/       # 会话管理 (SQLite + WAL模式)
│   │   ├── config/        # 配置管理 + 模型动态注册表 🆕
│   │   │   ├── ConfigManager.ts    # 配置管理器
│   │   │   ├── ModelRegistry.ts    # 模型目录动态注册表
│   │   │   └── ProviderPresets.ts  # 预设模型(兜底)
│   │   └── utils/         # 工具函数 (i18n/logger/encryption)
│   ├── cli/               # Ink CLI (✅ 14KB React Terminal)
│   │   └── src/main.tsx   # Ink组件: Banner/MessageList/HelpPanel/StatusBar/InputBox/App + 10命令
│   ├── server/            # Web服务端 REST+WS+Plugins+IM (✅ 29KB + 32 tests)
│   │   ├── API: /api/* (REST) + ws:// (WebSocket 8事件) + /api/plugins + /api/im + /api/sandbox + /api/semantic
│   │   └── __tests__/     # api.test.ts(18) + static-files.test.ts(6) + websocket.test.ts(5) = 32集成测试
│   ├── web/               # Web Dashboard v4 WorkBuddy 风格 (✅ 306KB JS + 46KB CSS)
│   │   ├── public/icons/  # 图标资源目录 (README.md 含清单)
│   │   ├── stores/        # Zustand 10个Store: app/chat/provider/session/settings/tools/mcp/plugins/automation/knowledgeBase
│   │   ├── components/Chat/ # MessageList(虚拟滚动)/ChatInput/ToolCallCard
│   │   ├── components/Common/ # StatusBadge + Layout(分组导航/折叠/主题切换)
│   │   └── pages/         # Dashboard(WorkBuddy风格+快捷入口+模板卡片+智能输入)/Chat/Settings/Sessions/Skills/IMSettings
│   ├── desktop/           # Electron原生桌面版 (✅ 173KB JS + 16KB CSS)
│   │   ├── src/main.ts   # Electron主进程 (Agent/IPC/菜单/托盘/全局快捷键)
│   │   ├── src/preload.ts # contextBridge IPC桥接
│   │   └── src/renderer/  # React原生UI (AppShell/Sidebar/TabBar/ContentRouter/StatusBar)
├── docs/                  # 文档
│   ├── 01_需求规格说明书_PRD.md
│   ├── 02_架构设计文档_ADD.md
│   ├── 03_测试案例文档.md
│   ├── 05_Desktop_EXE打包标准流程.md
│   ├── 06_版本发布与CI-CD流程指南.md 🆕
│   └── 07_自动更新分发方案对比.md 🆕
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
# 运行所有测试 (806 tests)
pnpm test:all

# 运行核心模块测试 (629 tests)
pnpm test:core

# 运行服务端集成测试 (41 tests)
pnpm test:server

# 运行 Desktop 测试 (127 tests)
pnpm test:desktop
```

## 🏗️ 技术栈

| 层级 | 技术 | 备注 |
|------|------|------|
| 语言 | TypeScript 5.x | 严格模式 |
| 运行时 | Node.js 18+ | 推荐 20 LTS |
| 包管理 | pnpm 11+ | monorepo workspace |
| CLI框架 | Ink (React for Terminal) | Banner/ChatView/StatusBar |
| Web前端 | React 18 + Vite + Tailwind CSS v3 | WorkBuddy 深色主题 + 虚拟滚动(react-window) + 分组导航 |
| 状态管理 | Zustand v4 | 10个Store + 持久化 |
| Web后端 | Express + WebSocket (ws) | REST + 8事件类型 |
| 桌面 | Electron 30 + React/Vite/Tailwind | 四件套布局 |
| 数据库 | **better-sqlite3** (SQLite) | ⚠️ Node 24 需从源码编译 |
| 加密 | AES-256-GCM | 密钥本地加密存储 |
| 构建 | tsup + Vite | ESM 输出 |
| 测试 | Vitest | 806/806 通过 (Core 629 + Server 41 + Desktop 127 + 双域知识库 9) |
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
