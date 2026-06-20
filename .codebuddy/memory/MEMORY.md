# EasyAgent 项目记忆

## 项目概述
- **项目**: EasyAgent - 集成中国主流大模型的开源 AI 编程助手
- **版本**: v5.3 (806 tests 全通过)
- **仓库**: https://github.com/ht182400-creator/easyagent (SSH 推送)
- **技术栈**: TypeScript 5.x + React 18 + Vite 5 + Tailwind CSS 3 + Zustand 4 + Express + WebSocket + Electron 30 + SQLite(better-sqlite3) + Vitest + tsup
- **对比参考**: D:\Work_Area\AI\cc-haha

## 核心规则

### 源码编译
- `packages/core/src`: `.ts` 与编译产物 `.js`/`.d.ts`/`.js.map` 共存
- 测试导入路径使用 `.js` 扩展名: `import { ... } from '../config/ConfigManager.js'`
- 修改 `.ts` 后需同步编译，否则测试跑旧代码
- **删除旧编译产物**: `packages/server/src/index.js` 会导致 vitest 优先加载 `.js` 而非 `.ts`

### 构建工具
- **electron-builder 精确锁定 23.6.0**（去掉 `^`），不得使用 v24.0.0
- **pnpm exec** 替代 npx，确保使用本地版本
- **原生模块预编译 + npmRebuild: false**（better-sqlite3）
- **external 框架的子依赖必须全部显式声明**（Express 58个、pino 13个、multer 6个、cors 2个），参考 `express-deps.json`

### API 规范
- **Desktop 中统一用 `127.0.0.1:3456`**，不用 `localhost`（Windows IPv6 陷阱）
- **`apiFetch` 已内部调用 `.json()`**，调用处直接用 `.then(data => ...)`，禁止再调 `.json()`
- CSP 中 `connect-src` 必须包含 `http://127.0.0.1:3456 ws://127.0.0.1:3456`

### Desktop 打包规范
- `index.html` 不用 `<style>` 标签（Vite 5 bug），全部外部 CSS link
- CSS `@import` 必须在所有规则之前
- 使用 HashRouter（适配 file:// 协议）
- VS Code 需排除 `**/packages/desktop/release/**` 避免文件锁定

### Provider 配置
- `PROVIDER_PRESETS` 定义 11 个预设，`ConfigManager.load()` 只有 `apiKey` 的才启用
- API Key 加密存储在 `~/.easyagent/providers.json`

### 版本号管理
- **唯一版本源**: `version.json` (v0.3.0)，修改后运行 `node scripts/sync-version.mjs` 同步
- **禁止硬编码**: UI 组件通过 `/api/version` API 获取版本号，严禁写死
- **发布**: `node scripts/release.mjs patch|minor|major` 版本标记；`release-publish.bat` 全流程交互发布
- verify-build.cjs 第 6 项自动拦截旧版本号硬编码
- 模型列表通过 `/v1/models` API 动态获取，ProviderPresets 仅兜底
- 命令白名单从 `EASYAGENT_ALLOWED_COMMANDS` 环境变量加载
- 模型目录从 GitHub/jsdellivr CDN 下载 `models-catalog.json`，24h TTL 缓存

### 工作记忆文件操作
- 每日日志 (`YYYY-MM-DD.md`) 是追加式日志，**严禁覆盖或删减已有内容**
- MEMORY.md 可就地更新保持精简
- 反例：2026-06-19 事故，使用 `write_to_file` 覆盖 575 行日志为 25 行摘要

## 关键陷阱清单

| # | 🎯 | 陷阱 | 现象 | 修复 |
|---|-----|------|------|------|
| 1 | 🔀 | electron-builder v24 意外升级 | NSIS EnVar 插件缺失，exe 仅 0.3MB | 精确锁定 23.6.0，删 v24 残留 |
| 2 | 🔀 | Vite 5 `<style>` 内联 | 构建失败 `No matching HTML proxy` | 改外部 CSS link |
| 3 | 🖥️ | `localhost` → IPv6 | Dashboard 显示 `--`，API 请求全失败 | 全部改 `127.0.0.1` |
| 4 | 🖥️ | 双重 `.json()` | 数据不显示，错误被 `.catch()` 静默吞掉 | 直接用 `apiFetch<Type>(url).then(data => ...)` |
| 5 | 🔀 | CSS @import 不在第一行 | Tailwind 样式失效 | 移到文件最顶部 |
| 6 | 🔀 | pnpm workspace symlink | asar 中找不到 @easyagent/core | tsup noExternal bundle |
| 7 | 🔀 | Express 子依赖遗漏 | `Cannot find module 'body-parser'` 等 | 显式声明所有子依赖+孙子依赖 |
| 8 | 🖥️ | VS Code 文件监视器锁定 | `Access Denied` 删除 app.asar | watcherExclude + taskkill |
| 9 | 🖥️ | better-sqlite3 原生编译失败 | node-gyp 检测不到 VS | 预编译 .node 文件 + npmRebuild:false |
| 10 | 🔀 | `packages/server/src/index.js` 残留 | vitest 加载旧 JS 而非新 TS | 删除旧编译产物 |
| 11 | 🖥️ | **apiFetch 全项目双重 .json()** | 13 个文件 43+ 处数据消失无报错 | apiFetch 已返回解析对象，所有调用处去掉 `res.json()` + `res.ok` 检查 |
| 12 | 🔀 | **bat文件 `[!]` + 延迟扩展冲突** | `enabledelayedexpansion` 下 echo `[!]` 被当成变量标记，导致整行解析崩溃 | 改为 `[^^!]`（`^^` 转义） |
| 13 | 🔀 | **bat文件中文编码乱码** | CMD 无法正确处理 UTF-8 中文（无论有无 BOM），BOM 导致 `@echo off` 失效 | **全英文重写**，零中文零编码依赖；版本号前导空格用 `for /f` 自动 trim |
| 14 | 🔀 | **bat文件 `:::` 注释导致 CMD 崩溃** | `::: comment` 被 CMD 解析为非法 label，报 `此时不应有 :。` | **全部改为 `rem` 注释**；不用任何 `:` 开头的注释 |
| 15 | 🔀 | **execSync 路径含空格被截断** | `execSync('node ' + path)` 中路径有空格，CMD 当作参数分隔符截断| 路径加双引号：`node "${path}"` |
| 16 | 🔀 | **`.mjs` 文件含 TS 类型注解** | Node.js ESM 不支持 TS 语法，`function foo(x: string)` 报 `SyntaxError` | 移除全部类型注解，用纯 JS |
| 17 | 🔀 | **esbuild 0.20.1 对 catch 语法极脆弱** | `Expected "finally" but found "}"`：原代码 try 块中 if/else 结束后多了孤儿 `}`，导致 catch 的 `}` 无 try 可关闭 | 1) 统一写 `catch (err)` 2) verify #9 拦截 `catch {}` 和 `catch (_e)` 3) 确保 try 块 brace 配对正确 |
| 18 | 🔀 | **PowerShell `Set-Content` 默认 ANSI 编码** | 批量修改含中文的 UTF-8 文件后中文全变乱码（76文件被毁） | **只能用 Node.js `writeFileSync` 明确指定 `utf8`**；verify-build.cjs 第14项自动检测乱码 |
| 19 | 🔀 | **pnpm v11 `allowBuilds` 占位文本被当 false** | electron/better-sqlite3/esbuild 构建脚本被跳过，打包失败 | `pnpm-workspace.yaml` 中 `allowBuilds` 必须显式设为 `true`，不能留占位文本 |
| 20 | 🖥️ | **better-sqlite3 在 asar 内加载原生模块失败** | `bindings` 从 `__dirname`（asar内路径）找不到 `.node`，后端启动失败，Dashboard 全 `--` | `files` 中 `!node_modules/better-sqlite3/**` 排除出asar；`extraResources` 复制到 `resources/node_modules/better-sqlite3/` |
| 21 | 🖥️ | **mime 缺失导致 Express 500（开发可用/Release 报错）** | 开发模式 pnpm 提升 mime 到 server 包下，send 能间接解析；但 electron-builder 打包后 asar 中 `node_modules/mime` 消失（只在 `@easyagent/server/node_modules/mime`），send `require('mime')` 失败报 `Cannot find module 'mime'` | 在 desktop/package.json 显式添加 `"mime": "^1.6.0"`（不是 mime@2.x！）；verify #11 检查 top-level mime 存在+版本 |
| 22 | 🖥️ | **开发/Release better-sqlite3 MODULE_VERSION 不一致** | 开发用系统 Node v24 编译 (137)，Electron 需要 v20 (123)，加载失败或 Dashboard `--` | postinstall 脚本自动执行 `electron-rebuild`；verify #10 自动检测 |
| 23 | 🖥️ | **electron-updater 传递依赖缺失（dev可用/Release崩溃）** | electron-builder 打包后 asar 中缺少 `lodash.escaperegexp`、`lodash.isequal`、`tiny-typed-emitter`，electron-updater 更新检查时 `require()` 失败 | 在 desktop/package.json 显式添加所有 electron-updater 的传递依赖（8个包）；verify #12 自动检测 |
| 24 | 🖥️ | **Express 生态版本不兼容（dev可用/Release可能异常）** | desktop deps 中 `iconv-lite@0.6.3`、`media-typer@1.1.0`、`ipaddr.js@2.4.0`、`encodeurl@1.0.2` 与 Express 子包预期版本不匹配 | 保持监控；verify #13 自动 WARN；若出现异常则降级到匹配版本 |
| 25 | 🖥️ | **apiFetch 双重 .json() 解析导致数据为空** | `apiFetch` 已内置 `res.json()` 返回解析后数据，但直接使用 `apiFetch().then(r => r.json())` 会导致 TypeError（数组/对象没有 .json() 方法），被 catch 静默吞掉 | 使用 `apiFetch<T>` 泛型直接获取数据，不要调用 `.then(r => r.json())`；原生 `fetch()` 才需要手动 `.json()`
| 26 | 🖥️ | **HashRouter 下 `<a href>` 导致黑屏/页面跳转** | Desktop 使用 HashRouter（路由 `/#/xxx`），但 `<a href="/sessions">` 绕过 React Router 触发全页面导航 | 在所有 tsx 中应使用 `<Link to="/sessions">` 或 `navigate('/sessions')`；仅外部链接（`target="_blank"`）可用 `<a href>`；verify #15 自动检测
| 27 | 🖥️ | **Desktop asar 内 PROJECT_ROOT 指向只读归档** | `createApp()` 中 `PROJECT_ROOT = resolve(__dirname, '..', '..', '..')` 在 asar 内解析到只读路径，知识库写入失败(400)、读取返回空 | 1) `createApp()` 接受 `options.projectRoot` 参数；2) Desktop main.ts 传入 `homedir()` 作为 projectRoot |



## ⚠️ Web ↔ Desktop 代码隔离约束

- **Web 和 Desktop 是两套独立的前端代码**，分别位于 `packages/web/src/` 和 `packages/desktop/src/renderer/`，各自拥有独立的 `pages/`、`components/`、`stores/`、`api.ts` 副本，**不共享任何前端代码**
- **修改 Desktop 前端时必须确保不影响 Web 功能**，反之亦然。两者的关键差异：
  | 差异点 | Web | Desktop |
  |--------|-----|---------|
  | 路由方案 | `BrowserRouter`（路径 `/sessions`） | `HashRouter`（路径 `/#/sessions`） |
  | HTTP 库 | 原生 `fetch()`（需手动 `.json()`） | `apiFetch()` 封装（已内置 `.json()`） |
  | 协议 | HTTP/HTTPS | `file://` + `http://127.0.0.1:3456` |
  | 环境检测 | 无 | `window.easyAgent` IPC 桥接 |
- **判断要改哪个包**：如果功能与 Electron/IPC/本地文件系统相关 → Desktop；如果功能是纯 Web/Cookie/浏览器原生 → Web；如果两者都需要 → **两边独立修改，不要假设共享代码**
- **修改同一功能时**：必须分别在两个包中做对应的修改，不能只改一个而遗漏另一个

### ⚠️ 陷阱自愈规则（每次修复 bug 后必须执行）
- **每次发现并修复一个新 bug 后，必须同时更新两个文件，无需用户提醒**：
  1. **MEMORY.md** ── 在陷阱表中新增一行，**必须标注 🎯 范围标记**（🖥️=Desktop / 🌐=Web / 🔀=两者）
  2. **verify-build.cjs** ── 添加对应的自动检查逻辑
- **每日日志 (`YYYY-MM-DD.md`) 中的 bug 记录也必须标注范围标记**，格式：`[🖥️ Desktop专属]` / `[🌐 Web专属]` / `[🔀 两者影响]`
- 目的：让脚本替人记住教训，下次构建自动拦截

## 标准化打包流水线

```bash
build.bat              # 快速测试 (--dir, ~60s)
build.bat --release    # 完整 NSIS 安装包 (~3min)
build.bat --verify     # 仅预检查，不构建
```

**流程**: 清理进程 → verify-build.cjs 预检查(10大类20+项) → core/server/desktop tsup → vite build → electron-builder → 输出验证

**输出**: `release/EasyAgent-0.3.0-win-x64.exe` 或 `release/win-unpacked/EasyAgent.exe`

## Server + Web 启动

```bash
start-backend.bat   # 后端 localhost:3456 (可见窗口)
start-frontend.bat  # Web前端 localhost:5173 (可见窗口)
```

## 测试命令

```bash
cd packages/core && npx vitest run     # 629 tests
cd packages/server && npx vitest run   # 41 tests
cd packages/desktop && npx vitest run  # 127 tests
```

## 关键文件索引

- 版本源: `version.json` (0.3.0 "Gemini")
- 版本同步: `scripts/sync-version.mjs`
- 发布脚本: `scripts/release.mjs`
- 一键发布: `release-publish.bat`（交互式，集成版本标记+构建+上传全流程）
- 更新日志: `CHANGELOG.md`
- 打包流程: `docs/05_Desktop_EXE打包标准流程.md` (v1.4, 25个问题)
- 发布与CI/CD: `docs/06_版本发布与CI-CD流程指南.md` (v1.0, 发布全流程 + GitHub Actions)
- 分发方案: `docs/07_自动更新分发方案对比.md` (v1.0, GitHub Releases/R2/COS/自建 5 方案对比)
- 预检查脚本: `packages/desktop/scripts/verify-build.cjs`
- 一键打包: `build.bat`
- 依赖清单: `packages/desktop/express-deps.json` (90+ 包)
- 架构设计: `docs/02_架构设计文档_ADD.md` (v5.4)
- 需求文档: `docs/01_需求规格说明书_PRD.md` (v5.3)
- 测试文档: `docs/03_测试案例文档.md` (806 tests)
