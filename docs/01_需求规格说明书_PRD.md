# EasyAgent - AI编程助手 需求规格说明书 (PRD)

> 版本: v5.3 | 日期: 2026-06-20 | 状态: +版本控制与升级系统 + CHANGELOG + 升级提示 + 版本检查API

---

## 一、项目背景

### 1.1 市场分析

- Claude Code 是目前最强的 AI 编程 Agent，但作为国外产品存在访问门槛
- 中国主流大模型（DeepSeek、通义千问、智谱GLM、Kimi等）发展迅猛，性能已接近国际水平
- CodeBuddy CN 提供了优秀的 IDE 集成体验和国产化方案
- 市场需要一个**开源、国产化、多模型集成**的 AI 编程助手

### 1.2 项目定位

EasyAgent 是一款**基于中国主流大模型的全功能AI编程助手**，融合Claude Code的Agent能力和CodeBuddy CN的本土化优势，提供 CLI + Web + Desktop + IM 四模式操作。

### 1.3 核心差异化优势

| 维度         | Claude Code | CodeBuddy CN    | **EasyAgent v3.0 (本项目)**                        |
| ------------ | ----------- | --------------- | -------------------------------------------------- |
| 模型支持     | 仅 Claude   | DeepSeek + 混元 | **10家国产大模型自由切换**                         |
| 操作界面     | CLI         | IDE插件 + IDE   | **CLI + Web(WorkBuddy风格) + Desktop + IM 四模式** |
| 开源         | 闭源        | 闭源            | **完全开源 (MIT)**                                 |
| IM接入       | ❌          | ❌              | **Telegram/飞书/企业微信** ✅                      |
| 插件系统     | ❌          | ❌              | **PluginManager + 6内置技能** ✅                   |
| MCP协议      | ✅          | ❌              | **JSON-RPC stdio** ✅                              |
| 模型动态更新 | ❌          | ❌              | **GitHub/CDN + 24h缓存** ✅                        |
| i18n         | ✅          | ✅              | **zh-CN/en-US** ✅                                 |
| 桌面应用     | ❌          | ❌              | **Electron 原生 React** ✅                         |
| 知识库       | 无          | 有              | ✅ 5工具                                           |
| 自动化       | 无          | 有              | ✅ 已完成                                          |

---

## 二、功能需求

### 2.1 核心功能模块

#### F1: 多模型适配器 (Model Adapter) - 动态更新 🆕

- **F1.1** 支持 DeepSeek (V4, V4 Flash, V3, R1) - OpenAI兼容API
- **F1.2** 支持 智谱GLM (GLM-5, GLM-5 Flash, GLM-4系列) - OpenAI兼容API
- **F1.3** 支持 通义千问 (Qwen3 Max/Plus/Turbo/Coder Plus) - OpenAI兼容API
- **F1.4** 支持 Kimi (K2.7 Code, K2.6, K2.5) - OpenAI兼容API
- **F1.5** 支持 文心一言 (ERNIE 4.5/Speed/Lite) - 自有API
- **F1.6** 支持 豆包 (Seed 1.6/Pro 1.6/Lite 1.6) - OpenAI兼容API
- **F1.7** 支持 腾讯混元 (TurboS Vision/T1/Pro) - 自有API
- **F1.8** 支持 MiniMax (M3/M3 Flash/M1) - OpenAI兼容API
- **F1.9** 支持 Ollama 本地模型
- **F1.10** 统一适配器接口，模型热切换
- **F1.11** 模型目录动态更新: 启动时从 GitHub/CDN 下载最新 `models-catalog.json`，三级降级 🆕

#### F2: Agent 系统

- **F2.1** 工具调用循环 (ReAct Pattern)
- **F2.2** 多Agent协作 (Coordinator + Workers)
- **F2.3** 计划模式 (先规划再执行)
- **F2.4** 会话持久化与恢复
- **F2.5** 上下文窗口管理
- **F2.6** Token用量统计与预算控制

#### F3: 工具系统 (Tools) — ✅ 51个工具全部完成

**文件工具 (9):**

- **F3.1** read_file — 文件读取
- **F3.2** edit_file — 文件精确编辑
- **F3.3** write_file — 文件写入/创建
- **F3.4** delete_file — 文件删除
- **F3.5** file_info — 文件信息查询
- **F3.6** create_dir — 创建目录
- **F3.7** move_file — 移动文件
- **F3.8** batch_edit — 批量编辑
- **F3.9** list_dir — 目录列表

**代码分析工具 (4):**

- **F3.10** code_stats — 代码统计
- **F3.11** run_tests — 运行测试
- **F3.12** find_imports — 查找导入
- **F3.13** find_definitions — 查找定义

**搜索工具 (4):**

- **F3.14** grep — 正则搜索 (ripgrep)
- **F3.15** glob — 文件匹配
- **F3.16** web_search — 网络搜索
- **F3.17** web_fetch — 网页抓取

**命令与Git工具 (7):**

- **F3.18** exec — Shell/PowerShell 执行
- **F3.19** git_status — 状态查看
- **F3.20** git_diff — 差异对比
- **F3.21** git_log — 提交日志
- **F3.22** git_branch — 分支管理
- **F3.23** git_blame — 代码追溯
- **F3.24** git_commit — 提交代码

**项目管理工具 (4):**

- **F3.25** read_config — 读取配置
- **F3.26** package_run — 运行脚本
- **F3.27** env_info — 环境信息
- **F3.28** project_overview — 项目概览

**代码质量工具 (4) 🆕:**

- **F3.29** lint_code — 运行 Linter
- **F3.30** format_code — 代码格式化
- **F3.31** read_lints — 读取 Linter 报告
- **F3.32** type_check — 类型检查

**预览与交互工具 (4) 🆕:**

- **F3.33** start_server — 启动开发服务器
- **F3.34** preview_url — 预览 URL
- **F3.35** diff_files — 文件差异对比
- **F3.36** ask_user — 向用户提问

**媒体操作工具 (3) 🆕:**

- **F3.37** read_image — 读取图片
- **F3.38** generate_image — 生成图片
- **F3.39** screenshot — 截图

**数据库工具 (2) 🆕:**

- **F3.40** query_db — 查询数据库
- **F3.41** db_schema — 查看数据库结构

**知识库工具 (5) 🆕:**

- **F3.42** knowledge_add — 添加知识条目
- **F3.43** knowledge_search — 搜索知识库
- **F3.44** knowledge_get — 获取知识详情
- **F3.45** knowledge_list — 列出知识条目
- **F3.46** knowledge_remove — 删除知识条目

**子Agent工具 (3) 🆕:**

- **F3.47** delegate_task — 委派任务给子Agent
- **F3.48** list_subagents — 列出可用子Agent
- **F3.49** install_runtime — 安装运行时

**记忆工具 (3):**

- **F3.50** remember — 记录知识
- **F3.51** recall — 回忆知识
- **F3.52** forget — 删除记忆

#### F4: 知识库系统 (RAG) — ✅ 5工具 + 完整Web管理 + HTTP API

- **F4.1** 本地文件索引 ✅
- **F4.2** 文档向量化存储 (分块1000字符) ✅
- **F4.3** 语义搜索 (分类/标签/相关性评分 + 服务端搜索优先) ✅
- **F4.4** 知识库管理界面 ✅ (完整 UI: 文档列表/搜索/分类筛选/标签/详情弹窗/添加弹窗)
- **F4.5** 自动索引项目代码 ✅
- **F4.6** KnowledgeService 封装 + HTTP REST API ✅ (7个端点)
- **F4.7** 统计面板: 文档数/存储大小/标签数/分类分布 ✅

#### F4.8: 自动化任务系统 — ✅ AutomationManager + Web管理

- **F4.8.1** 任务 CRUD: 创建/编辑/删除/启停 定时或一次性任务 ✅
- **F4.8.2** RRULE 调度引擎: HOURLY/DAILY/WEEKLY + 下次运行时间计算 ✅
- **F4.8.3** AgentEngine 集成: 自动调用 AI 执行任务提示词 ✅
- **F4.8.4** 任务历史: 运行记录/Token统计/状态追踪 ✅
- **F4.8.5** 预设模板: 每日代码审查/文档更新/安全检查/性能分析 ✅
- **F4.8.6** HTTP REST API ✅ (8个端点)
- **F4.8.7** 轮询执行状态 + 超时检测 + 手动停止 ✅

#### F6: 沙箱执行环境 — ✅ Docker容器 + 本地进程降级

- **F4.5.1** Docker 容器隔离执行
- **F4.5.2** Windows Home 版降级方案: Docker 不可用时自动切换本地进程 (child_process.spawn)
- **F4.5.3** 三种模式: docker / local / disabled，启动时自动检测
- **F4.5.4** Web 管理页面三种 UI: Docker(完整功能) / 本地模式(黄色提示) / 禁用模式(安装指引)

#### F5: MCP协议支持

- **F5.1** MCP Server管理 (连接/断开)
- **F5.2** 工具发现 (listTools)
- **F5.3** 资源访问 (readResource)
- **F5.4** Prompt模板

#### F6: 自动化任务 ✅ (已完成)

- **F6.1** 定时任务 (RRULE Cron调度) ✅
- **F6.2** 一次性任务 (ISO 8601 datetime) ✅
- **F6.3** 5种调度预设 ✅
- **F6.4** 执行日志与历史记录 ✅

#### F7: CLI界面 — ✅ Ink React Terminal (7组件架构)

- **F7.1** Banner 渐变色标题栏
- **F7.2** MessageList: 流式消息渲染 + 角色着色
- **F7.3** HelpPanel: 12命令帮助面板
- **F7.4** StatusBar: 当前模型/Token/Turn/状态
- **F7.5** InputBox: 键盘输入 + 禁用状态
- **F7.6** App: 主应用组件 (组合所有子组件)
- **F7.7** 10 个命令: /help, /model, /models, /providers, /switch, /status, /sessions, /tools, /clear, /token-key, /exit

#### F8: Web Dashboard — ✅ WorkBuddy 风格 v4 (10 Store + WS + 虚拟滚动)

- **F8.1** 会话管理界面 (多会话/搜索/删除)
- **F8.2** 模型配置界面 (10家提供商/连接测试)
- **F8.3** Token用量看板 (实时 WebSocket 推送)
- **F8.4** WorkBuddy 风格主页: 品牌渐变Hero + 快捷操作卡片 + 智能模板(6类) + 智能输入框
- **F8.5** 分组导航侧边栏: 4组(核心/管理/扩展/系统) + 折叠 + 激活指示器
- **F8.6** 自定义图标系统: `public/icons/` 目录(22图标) + lucide-react 占位方案
- **F8.4** Chat 页面 (流式消息 + 工具调用卡片)
- **F8.5** 设置页面 (主题/Agent/安全偏好持久化)
- **F8.6** Skills 市场页面 (表格/卡片双视图 + 搜索/来源筛选/详情面板 + 自定义技能 CRUD + 激活/停用)
- **F8.7** IM 管理页面 (三平台配置/启停/状态监控) ✅
- **F8.8** 自动化任务管理页面 (任务列表/创建弹窗/执行历史/模板/启停控制) ✅
- **F8.9** 知识库管理页面 (文档列表/搜索/分类标签筛选/详情查看/添加文档) ✅

#### F9: Desktop 原生应用 — ✅ Electron + React

- **F9.1** AppShell 窗口框架
- **F9.2** Sidebar: 折叠/搜索/导航
- **F9.3** TabBar: 多标签页 + 关闭
- **F9.4** ContentRouter: 内容路由
- **F9.5** StatusBar: 连接状态/版本/更新状态
- **F9.6** ChatView: 消息气泡 + 流式 + 工具调用
- **F9.7** 动态版本号显示 (从 package.json 读取)
- **F9.8** 系统托盘 + 全局菜单 + 关于对话框(含系统信息)

#### F10: 插件与技能系统 — ✅ PluginManager

- **F10.1** IPlugin 接口: name/version/description + register/getTools/getSkills/getHooks/unregister
- **F10.2** ISkill 接口: name/description/prompt/tags + onActivate/onDeactivate
- **F10.3** IPluginHook: 7种事件(preRun/postRun/preTool/postTool/onError/onStream/onDone)
- **F10.4** PluginManager 生命周期: load/unload/enable/disable/triggerHook
- **F10.5** 6 个内置技能: code-review, unit-test-generator, code-explain, generate-doc, refactor, debug

#### F11: IM 适配器系统 — ✅ Telegram/飞书/企业微信

- **F11.1** TelegramAdapter: Bot API, 长轮询/Webhook双模式, 流式编辑, 白名单
- **F11.2** FeishuAdapter: Webhook事件订阅, tenant_access_token自动刷新, Lua/Lark双域名
- **F11.3** WeChatAdapter: 企业微信框架, token管理, URL验证(TODO: 素材上传)
- **F11.4** IMManager: 统一管理, 消息路由 IM→Agent→IM
- **F11.5** Server API: config CRUD + start/stop + webhook端点

#### F12: i18n 国际化 — ✅ zh-CN/en-US

- **F12.1** t() 翻译函数
- **F12.2** zh-CN 完整消息表
- **F12.3** en-US 完整消息表

#### F13: Desktop 自动/手动升级 — ✅ electron-updater

- **F13.1** 启动时静默检查更新 (5秒延迟)
- **F13.2** 自动下载更新包 (electron-updater)
- **F13.3** 下载进度显示 (StatusBar 实时百分比)
- **F13.4** 下载完成通知 (弹窗选择立即重启或稍后)
- **F13.5** 手动检查更新 (菜单 "帮助 → 检查更新")
- **F13.6** 更新源配置 (GitHub Releases: ht182400-creator/easyagent)
- **F13.7** 更新失败降级处理 (打开 GitHub Release 页面)
- **F13.8** 当前版本显示 (关于对话框 + StatusBar + ChatView 底部)

#### F14: 模型目录动态更新系统 — ✅ ModelRegistry 🆕

- **F14.1** 启动时后台下载最新 `models-catalog.json` (GitHub Raw + jsdelivr CDN 备用)
- **F14.2** 本地缓存到 `~/.easyagent/models-catalog.json`，24小时 TTL
- **F14.3** 三级数据源降级: 远程目录 > 提供商 /models API > 内置预设(ProviderPresets)
- **F14.4** 下载超时 15s，不阻塞服务启动
- **F14.5** Server API: `/api/providers/catalog/refresh` 强制刷新 + `/api/providers/catalog/status` 状态查询
- **F14.6** 各提供商 `/models` API 动态获取，5分钟缓存
- **F14.7** 模型合并逻辑: 远程模型优先，预设独有模型保留

#### F15: 全面去硬编码 — ✅ 已完成 🆕

- **F15.1** 模型列表: 前端下拉从 `/api/providers/all-models` 动态加载，按提供商分组
- **F15.2** 仪表盘模板: 从 `/api/config/templates` 动态加载，支持运行时修改
- **F15.3** 命令白名单: 从 `EASYAGENT_ALLOWED_COMMANDS` 环境变量加载，默认 40+ 命令
- **F15.4** 前端默认值智能选择: 优先选已配置 API Key 的提供商

#### F16: 版本控制与升级系统 — ✅ 已完成 🆕

- **F16.1** 单一版本源: `version.json` 作为项目唯一版本号来源
- **F16.2** 版本同步脚本: `scripts/sync-version.mjs` 将版本号同步到所有 package.json
- **F16.3** 更新日志: `CHANGELOG.md` 遵循 Keep a Changelog 格式
- **F16.4** 发布自动化: `scripts/release.mjs` 支持 patch/minor/major 版本递增
- **F16.5** 版本信息 API: `/api/version` 返回版本号 + codename + 发布日期 + 更新日志
- **F16.6** 版本检查 API: `/api/version/check` 通过 GitHub API 检查是否有新版本
- **F16.7** 构建时版本注入: 通过 `EASYAGENT_VERSION` 环境变量统一注入
- **F16.8** Web 端版本显示: Layout 侧边栏动态获取版本号，设置页显示完整版本信息
- **F16.9** Desktop 端版本显示: 侧边栏 + StatusBar + 关于对话框均动态获取
- **F16.10** 升级提示: Web 和 Desktop 设置页面均有"检查更新"按钮，发现新版本时通知
- **F16.11** 版本一致检查: `scripts/verify-build.cjs` 检查硬编码旧版本号

---

## 三、非功能需求

### 3.1 性能要求

- Agent响应延迟 < 3s (不含模型推理时间)
- 文件搜索 < 500ms (10万文件项目)
- Web Dashboard 首屏加载 < 2s

### 3.2 安全要求

- API Key 本地加密存储
- 危险命令执行前需确认
- 文件操作有回滚机制
- 支持项目级权限控制

### 3.3 兼容性

- 操作系统: Windows 10+, macOS 12+, Linux (Ubuntu 20.04+)
- Node.js >= 18
- 终端: Windows Terminal, iTerm2, GNOME Terminal

### 3.4 可扩展性

- ✅ 插件系统支持自定义工具和技能
- ✅ 自定义模型适配器 (OpenAI兼容协议)
- 🟡 自定义工作流 (框架已有)

### 3.5 better-sqlite3 兼容性 ⚠️

- Node.js 18/20/22: 预编译二进制可用，开箱即用
- **Node.js 24.x**: 无预编译二进制，需安装 C++ 编译工具链 (VS Build Tools + Python) 从源码编译
- 测试环境: vitest 已通过 alias mock 绕过原生模块依赖，测试始终可运行

---

## 四、用户故事

### US1: 开发者日常编码 ✅

> 作为后端开发，我想用自然语言描述需求，让AI帮我写代码、修复bug、重构代码。

### US2: 多模型切换 ✅

> 作为全栈开发者，我想在不同任务中切换不同模型（DeepSeek写代码、通义千问写文档），以最优性价比完成任务。

### US3: 知识库问答 ✅

> 作为新加入项目的开发者，我想让AI理解整个项目代码库，快速回答关于代码架构的问题。

### US4: 自动化任务 ✅

> 作为Tech Lead，我想设置每天自动进行代码review，并收到报告。

### US5: IM 远程交互 ✅ 🆕

> 作为远程开发者，我想通过 Telegram/飞书 与 AI 助手对话，随时随地获取 Code Review。

### US6: 桌面原生体验 ✅ 🆕

> 作为重终端用户，我想要一个原生桌面应用，支持多标签页、全局快捷键、系统托盘。

### US7: 插件扩展 ✅ 🆕

> 作为高级开发者，我想安装/卸载插件来扩展 AI 助手能力，自定义工作流。

---

## 五、项目排期

| 阶段      | 内容                                                                  | 状态    |
| --------- | --------------------------------------------------------------------- | ------- |
| Phase 1   | 核心框架 + 模型适配器 (10家提供商)                                    | ✅ 完成 |
| Phase 2   | Agent系统 + 工具集 (51 tools)                                         | ✅ 完成 |
| Phase 3   | Ink CLI (React Terminal) + 会话管理                                   | ✅ 完成 |
| Phase 4   | Web Dashboard v4 WorkBuddy 风格 (10 Store + WS + 虚拟滚动 + 图标系统) | ✅ 完成 |
| Phase 5   | Desktop 原生应用 (Electron)                                           | ✅ 完成 |
| Phase 5.5 | Desktop 自动升级 + 测试 (127测试用例)                                 | ✅ 完成 |
| Phase 6   | MCP 协议 + i18n 国际化                                                | ✅ 完成 |
| Phase 7   | Skills/Plugins 系统 (6内置技能)                                       | ✅ 完成 |
| Phase 8   | IM 适配器 (Telegram/飞书/企业微信)                                    | ✅ 完成 |
| Phase 9   | 知识库 RAG + 自动化任务                                               | ✅ 完成 |
| Phase 10  | 模型目录动态更新 + 去硬编码重构                                       | ✅ 完成 |
| Phase 11  | 版本控制与升级系统 (version.json + CHANGELOG + 升级提示)              | ✅ 完成 |

---

## 六、验收标准

| #   | 标准                                                 | 状态                                                  |
| --- | ---------------------------------------------------- | ----------------------------------------------------- |
| 1   | 支持至少7家中国主流大模型                            | ✅ 10家                                               |
| 2   | Agent能完成文件读写、搜索、命令执行等基本操作        | ✅ 51工具                                             |
| 3   | CLI交互流畅，支持 Markdown 渲染                      | ✅ Ink React Terminal                                 |
| 4   | Web Dashboard 可用，支持流式通信 + WorkBuddy 风格 UI | ✅ Zustand + WS + 分组导航                            |
| 5   | 通过单元测试                                         | ✅ 10/10 (better-sqlite3 mock)                        |
| 6   | 文档齐全                                             | ✅ README + PRD + ADD + CHANGELOG + 发布指南          |
| 7   | Desktop 原生应用可运行 + 自动更新机制                | ✅ Electron + electron-updater                        |
| 8   | IM 适配器可接收/回复消息                             | ✅ Telegram + 飞书 + 微信                             |
| 9   | 插件可加载/卸载/热切换                               | ✅ PluginManager                                      |
| 10  | 支持中英双语                                         | ✅ zh-CN/en-US                                        |
| 11  | Desktop 单元测试 > 120 cases                         | ✅ 127/127                                            |
| 12  | 自动升级(静默检查+下载+通知+重启)                    | ✅ electron-updater                                   |
| 13  | 版本控制系统                                         | ✅ version.json + CHANGELOG + 升级提示 + 版本检查 API |
| 14  | 全量测试 > 800 cases                                 | ✅ 806/806                                            |
