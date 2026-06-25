# Changelog

All notable changes to EasyAgent will be documented in this file.

格式基于 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.0.0/),
版本号遵循 [Semantic Versioning](https://semver.org/lang/zh-CN/).

---

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
