# Changelog

All notable changes to EasyAgent will be documented in this file.

格式基于 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.0.0/),
版本号遵循 [Semantic Versioning](https://semver.org/lang/zh-CN/).

---

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
