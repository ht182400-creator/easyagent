# Changelog

All notable changes to EasyAgent will be documented in this file.

格式基于 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.0.0/),
版本号遵循 [Semantic Versioning](https://semver.org/lang/zh-CN/).

---

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
