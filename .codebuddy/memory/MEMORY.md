# EasyAgent 项目记忆

## 项目概述
- **项目**: EasyAgent - 集成中国主流大模型的开源 AI 编程助手
- **版本**: v0.5.2 (1195 用例全通过/100%, 29/29 模块 + 6阶段3分支全完成, 综合评分 100, CI 6/6 jobs ✅, 531个问题记录)
- **统一数据源**: `docs/pipeline/lib/module-registry.mjs` → `scripts/unified-sync.mjs` → `test-case-mapping.json` + `pipeline-data.json` → API → 前端
- **测试报告**: `/api/test-detail` 端点提供四级树形测试详情 (包→文件→分组→用例+失败原因)
- **仓库**: https://github.com/ht182400-creator/easyagent (SSH 推送)
- **技术栈**: TypeScript 5.x + React 18 + Vite 5 + Tailwind CSS 3 + Zustand 4 + Express + WebSocket + Electron 30 + SQLite(better-sqlite3) + Vitest + tsup
- **对比参考**: D:\Work_Area\AI\cc-haha

## 编码规范

- **注释要求**: 编写代码时必须保留良好的代码注释，中英文皆可，尽量言简意赅
- 函数/类/复杂逻辑必须有注释说明其用途和关键决策
- 避免无意义注释（如 `// i++`），注释应解释"为什么"而非"做什么"

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
- **Tailwind content 必须包含 frontend 组件路径**: `'../frontend/src/**/*.{js,ts,jsx,tsx}'`，否则生产构建会丢失布局/间距/flex 等 utility 类，导致侧边栏图标文字堆叠（2026-06-26 回归）

### Provider 配置
- `PROVIDER_PRESETS` 定义 11 个预设，`ConfigManager.load()` 只有 `apiKey` 的才启用
- API Key 加密存储在 `~/.easyagent/providers.json`

### 版本号管理
- **唯一版本源**: `version.json` (v0.4.0)，修改后运行 `node scripts/sync-version.mjs` 同步
- **禁止硬编码**: UI 组件通过 `/api/version` API 获取版本号，严禁写死
- **发布**: `node scripts/release.mjs patch|minor|major` 版本标记；`release-publish.bat` 全流程交互发布
- **CI/CD**: `.github/workflows/ci.yml` (日常测试) + `release.yml` (Tag 推送自动构建+发布)。⚠️ **必须使用 `windows-2022` runner**，`windows-latest` (Server 2025 + VS 2026) 不被 node-gyp v10.3.1 识别。
- verify-build.cjs 第 6 项自动拦截旧版本号硬编码
- 模型列表通过 `/v1/models` API 动态获取，ProviderPresets 仅兜底
- 命令白名单从 `EASYAGENT_ALLOWED_COMMANDS` 环境变量加载
- 模型目录从 GitHub/jsdellivr CDN 下载 `models-catalog.json`，24h TTL 缓存

### 🔴 测试数据同步约束（v1.0, 2026-06-25）

**触发条件**（以下任一情况发生时，必须立即同步测试数据）：
1. **发布 Tag 版本**（`release.mjs` 执行后）
2. **完成大模块测试案例**（新增 ≥20 个测试用例的模块）
3. **新增测试文件或删除测试文件**
4. **CI 通过率/用例数发生变化**

**必须同步的文件清单**（缺一不可）：

| # | 文件 | 同步内容 | 同步方式 |
|---|------|---------|---------|
| 1 | `docs/03_测试案例文档.md` | 第1行摘要 + 一、测试概览表 + 四、汇总表 + 底部 footer | 手动更新数据 |
| 2 | `docs/pipeline/test-case-mapping.json` | `_meta.totalTestCases` + `_meta.totalTestFiles` + 模块 `totalCases` | 运行 `node scripts/scan-test-cases.mjs` |
| 3 | `docs/pipeline/pipeline-data.json` | `kpi.testCases` / `kpi.testPassed` / `kpi.providers` / `kpi._totalFiles` | 运行 `node scripts/update-progress.mjs` |
| 4 | `docs/pipeline/project-progress-data.json` | `meta.totalTests` / `meta.modelsSupported` + 完成任务的 status→done | 手动或脚本更新 |
| 5 | `MEMORY.md` | 第2行版本号+用例数 + 测试命令区当前结果 | 手动更新 |
| 6 | `CHANGELOG.md` | 新版本条目（Added/Fixed） | 手动更新 |

**同步验证命令**：
```bash
# 运行后检查 pipeline-data.json kpi.testCases 是否等于实际用例数
node scripts/update-progress.mjs
# 验证管线数据一致性
node --test docs/pipeline/__tests__/pipeline-config.test.mjs
```

**🔴 违例检测**：
- 若 `03_测试案例文档.md` 中的汇总表与 `test-case-mapping.json` 的 `_meta.totalTestCases` 不一致 → 视为数据不同步
- 若 `MEMORY.md` 版本行中测试数 ≠ `test-case-mapping.json` 的 totalTestCases → 视为过期数据
- 每次 AI 会话结束前，自动对比上述数值，若发现不一致则提醒同步

### 工作记忆文件操作
- 每日日志 (`YYYY-MM-DD.md`) 是追加式日志，**严禁覆盖或删减已有内容**
- MEMORY.md 可就地更新保持精简
- 反例：2026-06-19 事故，使用 `write_to_file` 覆盖 575 行日志为 25 行摘要

### Memory 记录格式约定（v1.1, 2026-06-25 强化）

为使管线页面解析器能**准确**提取模块-问题-解决方案数据，**所有问题记录必须**遵循统一格式。详见 `docs/pipeline/memory-format-spec.md`。

**🔴 强制规则（每次记录时自动检查）**：
1. 每个问题/修复使用独立的 `## [模块:ID] 简短标题 (HH:MM)` Section
2. Section 内**必须**含以下字段（缺一不可）：
   - `- **问题**: 描述`（必选）
   - `- **根因**: 分析`（可选）
   - `- **修复**: 方案`（必选）
   - `- **状态**: ✅ resolved` / `⏳ pending` / `❌ open`（必选）
3. 纯操作流程（启动/构建/发布/GitHub Push/文档更新）**不加** `[模块:ID]` 标签，用普通 `##` 标题
4. **禁止**把问题修复混在纯操作流程段落中（如"遇到的问题及解决"列表），必须拆成独立 Section

**⚠️ 反例（06-24/06-25 教训）**：
- ❌ 自由格式表格（`| ID | 文件 | 修复 |`）→ 解析器无法识别
- ❌ `### 🔴 阻塞` 子标题 + 嵌套列表 → 解析器跳过
- ❌ 在操作流程中内嵌问题（"8. CI 补全 Desktop 测试"）→ 不会生成 issue 条目
- ✅ 正确做法见文件末尾的 `## [模块:b2b]` 格式段落

**模块 ID 速查**：
| ID | 模块 | ID | 模块 |
|----|------|----|------|
| F1 | 多模型适配器 | F9 | Desktop 原生应用 |
| F2 | Agent 系统 | F10 | 插件与技能系统 |
| F3 | 工具系统 | F11 | IM 适配器 |
| F4 | 知识库 RAG | F12 | i18n 国际化 |
| F5 | MCP 协议 | F13 | Desktop 自动升级 |
| F6 | 沙箱执行环境 | F14 | 模型目录动态更新 |
| F7 | Ink CLI | F15 | 全面去硬编码 |
| F8 | Web Dashboard | F16 | 版本控制系统 |
| B1a | Web↔Desktop 前端合并 | B2b | GitHub Actions CI/CD |
| B1b | PluginManager 沙箱 | B2c | 集成测试·端到端 |
| B2a | SWE-bench 评测体系 | B2d | 多模型评测排行榜 |
| B2e | 用户行为埋点 | B3a | 一键安装脚本 |
| B3b | VS Code 插件 | B3c | Contributor 引导 |
| P5a | 管线解析与缓存 | P5b | 管线 API 服务 |
| P5c | 前端渲染仪表板 | | |

**缓存说明**：存量文件（06-22及之前）无需重新格式化，解析器通过 mtime 缓存机制复用已解析结果。

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
| 13 | 🔀 | **bat文件中文编码乱码** | CMD 代码页 936(GBK) 无法正确输出 UTF-8 中文，PowerShell 管道解析中文变乱码 | bat 开头 `chcp 65001` 设置 UTF-8 代码页；ps1 开头设置 `[Console]::OutputEncoding = UTF8`；JSON 数据本身正确，仅显示层编码不匹配 |
| 14 | 🔀 | **bat文件 `:::` 注释导致 CMD 崩溃** | `::: comment` 被 CMD 解析为非法 label，报 `此时不应有 :。` | **全部改为 `rem` 注释**；不用任何 `:` 开头的注释 |
| 14a | 🔀 | **CMD `if (...)` 块内 echo 含 `)` 导致块提前关闭** | echo 中的 `)` 被 CMD 当作 if/for 块的结束符，导致块内剩余代码被跳过或 `else` 被误解析。`^)` 转义不可靠（CMD 预解析器处理不一致） | **用 `goto` 标签模式替代 `if (...) 多行块`**：正确判断后直接 `goto :CONTINUE` 跳过错误处理区；对 if 块内 echo 中不可避免地出现 `)` 的场景，改换措辞去掉括号或用变量替代 |
| 15 | 🔀 | **execSync 路径含空格被截断** | `execSync('node ' + path)` 中路径有空格，CMD 当作参数分隔符截断| 路径加双引号：`node "${path}"` |
| 16 | 🔀 | **`.mjs` 文件含 TS 类型注解** | Node.js ESM 不支持 TS 语法，`function foo(x: string)` 报 `SyntaxError` | 移除全部类型注解，用纯 JS |
| 17 | 🔀 | **esbuild 0.20.1 对 catch 语法极脆弱** | `Expected "finally" but found "}"`：原代码 try 块中 if/else 结束后多了孤儿 `}`，导致 catch 的 `}` 无 try 可关闭 | 1) 统一写 `catch (err)` 2) verify #9 拦截 `catch {}` 和 `catch (_e)` 3) 确保 try 块 brace 配对正确 |
| 18 | 🔀 | **PowerShell `Set-Content` 默认 ANSI 编码** | 批量修改含中文的 UTF-8 文件后中文全变乱码（76文件被毁） | **只能用 Node.js `writeFileSync` 明确指定 `utf8`**；verify-build.cjs 第14项自动检测乱码 |
| 19 | 🔀 | **pnpm v11 `allowBuilds` 占位文本被当 false** | electron/better-sqlite3/esbuild 构建脚本被跳过，打包失败 | `pnpm-workspace.yaml` 中 `allowBuilds` 必须显式设为 `true`，不能留占位文本 |
| 20 | 🖥️ | **better-sqlite3 在 asar 内加载原生模块失败** | `bindings` 从 `__dirname`（asar内路径）找不到 `.node`，后端启动失败，Dashboard 全 `--` | `files` 中 `!node_modules/better-sqlite3/**` 排除出asar；`extraResources` 复制到 `resources/node_modules/better-sqlite3/` |
| 21 | 🖥️ | **mime 缺失导致 Express 500（开发可用/Release 报错）** | 开发模式 pnpm 提升 mime 到 server 包下，send 能间接解析；但 electron-builder 打包后 asar 中 `node_modules/mime` 消失（只在 `@easyagent/server/node_modules/mime`），send `require('mime')` 失败报 `Cannot find module 'mime'` | 在 desktop/package.json 显式添加 `"mime": "^1.6.0"`（不是 mime@2.x！）；verify #11 检查 top-level mime 存在+版本 |
| 22 | 🖥️ | **开发/Release better-sqlite3 MODULE_VERSION 不一致** | 开发用系统 Node v24 编译 (137)，Electron 需要 v20 (123)，加载失败或 Dashboard `--` | 直接 `npx node-gyp rebuild --target=30.0.0 --arch=x64 --dist-url=https://electronjs.org/headers --release`（不能用 `@electron/rebuild`，bin名歧义且 pnpm 下可能不生效）；verify #10 + build.bat Phase 2.5 自动检测/修复 |
| 23 | 🖥️ | **electron-updater 传递依赖缺失（dev可用/Release崩溃）** | electron-builder 打包后 asar 中缺少 `lodash.escaperegexp`、`lodash.isequal`、`tiny-typed-emitter`，electron-updater 更新检查时 `require()` 失败 | 在 desktop/package.json 显式添加所有 electron-updater 的传递依赖（8个包）；verify #12 自动检测 |
| 24 | 🖥️ | **Express 生态版本不兼容（dev可用/Release可能异常）** | desktop deps 中 `iconv-lite@0.6.3`、`media-typer@1.1.0`、`ipaddr.js@2.4.0`、`encodeurl@1.0.2` 与 Express 子包预期版本不匹配 | 保持监控；verify #13 自动 WARN；若出现异常则降级到匹配版本 |
| 25 | 🖥️ | **apiFetch 双重 .json() 解析导致数据为空** | `apiFetch` 已内置 `res.json()` 返回解析后数据，但直接使用 `apiFetch().then(r => r.json())` 会导致 TypeError（数组/对象没有 .json() 方法），被 catch 静默吞掉 | 使用 `apiFetch<T>` 泛型直接获取数据，不要调用 `.then(r => r.json())`；原生 `fetch()` 才需要手动 `.json()`
| 26 | 🖥️ | **HashRouter 下 `<a href>` 导致黑屏/页面跳转** | Desktop 使用 HashRouter（路由 `/#/xxx`），但 `<a href="/sessions">` 绕过 React Router 触发全页面导航 | 在所有 tsx 中应使用 `<Link to="/sessions">` 或 `navigate('/sessions')`；仅外部链接（`target="_blank"`）可用 `<a href>`；verify #15 自动检测
| 27 | 🖥️ | **Desktop asar 内 PROJECT_ROOT 指向只读归档** | `createApp()` 中 `PROJECT_ROOT = resolve(__dirname, '..', '..', '..')` 在 asar 内解析到只读路径，知识库写入失败(400)、读取返回空 | 1) `createApp()` 接受 `options.projectRoot` 参数；2) Desktop main.ts 传入 `homedir()` 作为 projectRoot |
| 28 | 🔀 | **CI windows-latest 已升级 VS 2026，node-gyp 不兼容** | CI 显示 0 jobs 或 better-sqlite3 编译失败，node-gyp v10.3.1 找不到 VS 2026 | ci.yml + release.yml 全部固定 `windows-2022`，确保 VS 2022 编译环境可用 |
| 29 | 🖥️ | **Desktop Tailwind content 未扫描 frontend 组件 → 界面布局错乱** | EXE 运行后侧边栏图标和文字堆叠，flex/gap/w-64 等布局类丢失。开发模式正常但 Release 崩溃。根因：`desktop/tailwind.config.js` 的 `content` 只扫 `./src/renderer/**/*`，而实际 UI 组件在 `../frontend/src/` 中（通过 @/ alias），Tailwind JIT 不会生成只在 frontend 中使用的 utility 类。`web/tailwind.config.js` 早已包含此路径，但 desktop 建包时遗漏 | desktop/tailwind.config.js 的 content 添加 `'../frontend/src/**/*.{js,ts,jsx,tsx}'`；三个包各有独立 config，互不影响 |
| 30 | 🖥️ | **postinstall.cjs 命令名错误 + @electron/rebuild 不生效** | `pnpm exec @electron/rebuild` 找不到二进制（实际注册名是 `electron-rebuild`），即使改用正确名也声称成功但不修改 binary（pnpm symlink 环境问题）。build.bat 自动修复步骤不完善 | postinstall.cjs: 改用 `npx --yes node-gyp rebuild --target=30.0.0 --arch=x64 --dist-url=https://electronjs.org/headers --release`；build.bat: 新增 Phase 2.5 自动检测文件大小并 rebuild；verify-build.cjs: 通过文件大小判断而非仅对比系统 Node 版本 |
| 31 | 🖥️ | **tsup 内联 server 代码导致 asar 双重 CORS** | desktop tsup 打包时将 server 的 `createApp()` 整段内联进 `dist/main.js`，asar 中同时存在两份 CORS 中间件（main.js 1.2MB 含内联 server + node_modules/@easyagent/server/dist/index.js 625KB）。只更新 server 包不更新 main.js → CORS 行为被旧 main.js 覆盖 | 修改 @easyagent/server 源码后必须同时 `tsup --clean` 两个包；asar 修补必须同时替换 `dist/main.js` 和 `node_modules/@easyagent/server/dist/index.js` |
| 32 | 🖥️ | **pnpm hardlink 下 node-gyp rebuild 假成功** | `node-gyp rebuild` exit 0 但 `better_sqlite3.node` mtime+大小未变、NVM 版本仍为 137 而非 123。原因：pnpm store 硬链接 + rebuild 输出到 store 路径，当前工作副本未更新 | 重建后必须检查文件 mtime+大小+NVM 头值（`Buffer.from([123,0,0,0])` 出现位置）；verify-build.cjs 已有 Phase 2.5 自动检测 |
| 33 | 🖥️ | **electron-rebuild 在 pnpm 下静默跳过** | `@electron/rebuild --force` 声称成功但文件完全未变。bin 名歧义（`electron-rebuild` vs `@electron/rebuild`）+ pnpm 符链环境下找不到正确路径 | 直接用 `node-gyp rebuild` 显式指定 `--target=30.0.0 --arch=x64 --dist-url=https://electronjs.org/headers`，不用 electron-rebuild |
| 34 | 🖥️ | **5个脚本争抢 better_sqlite3.node → MODULE_VERSION 反复变** | postinstall.cjs(pnpm install时切electron)、sqlite3-loader.mjs(启动时切system)、build.bat Phase2.5(打包时rebuild)、rebuild-sqlite3.mjs(手动)、build-sqlite3.bat(手动) 互相覆盖。prebuild-install下载缓存的老旧二进制(MODULE=88)也可能被复制。 | 精简为2个脚本：`rebuild-sqlite3.mjs`(唯一编译入口) + `sqlite3-loader.mjs`(运行时切换)。postinstall.cjs 不再触碰.node。build.bat 改为 copy 已有 electron.node 而非 rebuild。删除 build-sqlite3.bat / build-sqlite3-dual.mjs / manage-sqlite3.mjs |
| 35 | 🖥️ | **字节扫描 MODULE_VERSION 始终返回116 (假阳性)** | better-sqlite3 静态链接 sqlite3 c源码(~13万行), 字节扫描碰巧读到sqlite3常量116, 非真实NODE_MODULE_VERSION。导致每次排查都以为版本错误, 浪费数小时重复编译。 | (1) SHA256 比对 electron vs system 版本 → 不同=各自编译成功 (2) System 版本直接 `require('better-sqlite3')` → 加载成功=版本正确 (3) `node scripts/rebuild-sqlite3.mjs --verify` 一键验证 |
| 36 | 🖥️ | **build.bat sqlite3 路径基于 CWD 而非项目根目录** | build.bat 在 `cd ..\desktop` 后使用相对路径 `node_modules\.pnpm\better-sqlite3@...` → pnpm workspace 中 `packages/desktop/` 下无此路径 → `better_sqlite3_electron.node` 始终"不存在" → 每次打包都触发不必要的 node-gyp rebuild → 可能失败。Phase 3.5 恢复路径同理错误。 | `_SQLITE_RELEASE` 路径加 `%~dp0` 前缀（强制基于 build.bat 所在目录=项目根目录）；`node scripts\rebuild-sqlite3.mjs` 也加 `%~dp0` 前缀 |
| 37 | 🖥️ | **Desktop 有独立 renderer CSS，与 frontend CSS 是两个文件** | 修改 `packages/frontend/src/styles/index.css` 的 CSP 字体修复对 Desktop 不生效，因为 Desktop 的 `index.html` 引用 `/src/renderer/index.css`（指向 `packages/desktop/src/renderer/index.css`），而非 frontend 的 CSS。两个文件内容高度相似但独立维护。**前端合并(B1a)后 JS/组件已统一，CSS 也应统一**。 | ✅ 已删除 `packages/desktop/src/renderer/index.css`，移除 `index.html` 中的 `<link>` 标签。CSS 统一由 `frontend/main.tsx` → `import './styles/index.css'` 加载 |



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

**输出**: `release/EasyAgent-0.4.0-win-x64.exe` 或 `release/win-unpacked/EasyAgent.exe`

## Server + Web 启动

```bash
start-backend.bat   # 后端 localhost:3456 (可见窗口)
start-frontend.bat  # Web前端 localhost:5173 (可见窗口)
```

## 测试命令

```bash
cd packages/core && npx vitest run     # 926 tests (JSON → _vitest-core.json)
cd packages/server && npx vitest run   # 151 tests (JSON → _vitest-server.json)
cd packages/desktop && npx vitest run  # 118 tests (JSON → _vitest-desktop.json)
# 覆盖率
pnpm run test:coverage                 # 全包覆盖率检查
pnpm run test:coverage:core            # Core 仅覆盖率 (thresholds 35/25/30/35)
pnpm run test:coverage:server          # Server 仅覆盖率 (thresholds 30/20/25/30)
```
**管线动态通过率**: 服务器启动时自动读取 `docs/pipeline/_vitest-*.json`，按模块汇总计算各阶段 pass rate。
**测试用例数**: 来自 `docs/pipeline/test-case-mapping.json`（`scripts/unified-sync.mjs` 自动生成）。
**当前结果**: 1195 定义用例 / 1195 CI已执行(1195通过/0失败) / 100% CI通过率 · 综合评分 100 · CI v0.5.2 ✅ 6/6 jobs。

## SWE-bench 评测基准 (P0-2 已完成)

```bash
pnpm benchmark:dry                     # 环境检查 (无需 API Key)
pnpm benchmark --provider deepseek --model deepseek-v4  # 实际评测
```

- 数据集: `packages/core/src/benchmark/benchmark-tasks.json` (10题, easy/medium/hard)
- 运行器: `BenchmarkRunner.ts` + `SWEBenchEngine.ts`
- CLI: `scripts/swe-bench/run-benchmark.mjs`

## Node.js 版本限制 (P0-1 已完成)

- engines: `>=18.0.0 <24.0.0` (better-sqlite3 无 Node 24 预编译)
- preinstall: `scripts/preinstall.cjs` 自动拦截
- 跳过: `set EASYAGENT_SKIP_NODE_CHECK=1` (Windows) / `export` (Unix)

## 管线模块 v2.1 动态化架构 (2026-06-23)

### 架构原则
- **KPI 动态计算**: `testCases` 从 `test-case-mapping.json` 读取，`passRate` 从 vitest JSON 报告实时计算，**严禁硬编码通过率**
- **单一配置源**: `docs/pipeline/lib/pipeline-config.mjs` 是唯一配置源（MODULES + PHASES + BRANCHES + KPI），模块变更只改这一个文件
- **测试用例对照表**: `docs/pipeline/test-case-mapping.json` 由 `scripts/scan-test-cases.mjs` 自动生成，是测试数量的唯一数据源
- **vitest JSON 报告**: 运行测试后自动生成 `_vitest-*.json`，管线服务器读取并动态计算各阶段通过率
- **三级渐进式加载**: HTTP API → 静态 JSON 快照 → 内嵌骨架回退，确保 HTTP/file:///离线三种模式均可用
- **产品目录模式**: Dashboard 卡片详情（工具列表、模型目录）视为静态产品文档，存于 `pipeline-data.json.dashboard`

### 关键组件
| 文件 | 职责 |
|------|------|
| `docs/pipeline/lib/pipeline-config.mjs` | 唯一配置源 |
| `docs/pipeline/lib/pipeline-api.mjs` | 6 REST API 端点 |
| `docs/pipeline/lib/pipeline-parser.mjs` | Memory MD 解析 + 缓存 |
| `docs/pipeline/lib/pipeline-cache.mjs` | mtime 文件级缓存 |
| `docs/pipeline/server.mjs` | 113 行路由分发 |
| `docs/pipeline/index.html` | 前端渲染 (924 行, 0 硬编码) |
| `docs/pipeline/pipeline-data.json` | 静态快照 (含 pipeline + dashboard) |
| `docs/pipeline/ARCHITECTURE.md` | 架构设计文档 |
| `scripts/update-progress.mjs` | Git hook 自动检测更新 |

### 关键命令
```bash
node docs/pipeline/server.mjs              # 启动管线服务器 (端口 8898)
node scripts/update-progress.mjs           # 手动触发进度同步
del docs\pipeline\.pipeline-cache.json     # 强制重建解析缓存
```

### 新增/修改模块定义（只需改一个文件）

**唯一入口**：`docs/pipeline/lib/pipeline-config.mjs`

在该文件的 `MODULES` 对象中添加新条目即可：

```js
export const MODULES = {
  // ... 现有模块 ...
  newId: {
    id: 'newId',        // 模块唯一 ID，对应 memory 文件中 [模块:newId]
    name: '新模块名',      // 显示名称
    phase: 'P3',        // 所属阶段（P1-P6）
    icon: '🆕',         // 节点图标
    desc: '模块简述',     // 鼠标悬停提示
    status: 'pending',  // pending | in-progress | done
    keywords: ['关键1', '关键2'],  // memory 文件中无显式标签时的关键词匹配回退
  },
};
```

同时需在 `pipeline-parser.mjs` 第192行附近，将新模块 ID 前缀加入标签 regex：
```js
/\[模块[：:]\s*(F\d+|B[123][a-e]|p5[a-c]|newId)\s*\]/i
```

Memory 文件中使用 `[模块:newId]` 标签，解析器即可自动识别分配。

### 仪表板测试分类数据层级

测试分类卡片支持 **4 层渐进展开**：

| 层级 | 数据位置 | 示例 |
|------|---------|------|
| L1 | `generateTestItems()` 的 `expandItems` | 多模型适配器 (127 tests) |
| L2 | `generateTestItems()` 的 level-2 | DeepSeek 适配 (18) |
| L3 | `TEST_LEVEL3_MAP` | 流式对话测试 (4) |
| L4 | `TEST_LEVEL4_MAP` | SSE 流式响应完整性 ✅ |

**新增 L4 数据示例**（在 `pipeline-config.mjs` 的 `TEST_LEVEL4_MAP` 中）：
```js
'流式对话测试': [
  { label: 'SSE 流式响应完整性', val: '✅' },
  { label: 'chunk 分片重组正确性', val: '✅' },
],
```

L3 项有 `expandItems` 时自动渲染为可展开行（▶ 箭头），无则保持纯文本显示。

**L4 全覆盖（2026-06-23 补全）**: `TEST_LEVEL4_MAP` 覆盖全部 209 个 L3 项的 L4 具体用例名称，13 个模块 100% 覆盖。注入逻辑在 `attachLevel3()` 中统一处理，不区分模块。

### 工具卡片 L3 参数详情（2026-06-23 新增）

`tools` 卡片现支持 3 级展开（L1: 工具组 → L2: 工具名 → L3: 参数签名）：

**新增工具参数**（在 `pipeline-config.mjs` 的 `TOOL_PARAMS_MAP` 中）：
```js
'read_file': [
  { label: 'filePath', val: 'string · 必填' },
  { label: 'offset', val: 'number' },
  { label: 'limit', val: 'number' },
],
```

已覆盖 30 个工具的参数签名，`attachToolParams()` 自动注入到 `generateToolItems()` 返回数据中。

### 🔴 数据分析图表数据一致性规则 (v1.0, 2026-06-25)

**问题根源**：pass 面板的分析图表从 `detail.items`（`generatePassRateItems`）推导总数，而 KPI 从 `getKPI()` 获取，两者数据源可能不一致。

**强制规则**：
1. `renderPassCharts` 必须从 `pipelineData.kpi` 获取权威通过/失败/跳过/总数，**不得从 items 反推**
2. `generatePassRateItems` 必须包含所有阶段+分支节点ID，确保 `items.val` 总和 = `KPI.testCases`
3. `calcPhasePassRate` 返回 `rate: 'N/A'` 时，图表需显示"N/A"文字+底部解释说明
4. `pass` 面板 summary 必须同时检查 `failed` 和 `skipped`（三种情况：全通过/有跳过/有失败）
5. 任何新增模块（分支/主线）必须同步更新 `generatePassRateItems` 的 `phaseDefs` 列表

### 仪表板 9 张卡片速查

| 卡片 | cardId | 层级 | 说明 |
|------|--------|------|------|
| 测试用例总数 | tests | L1→**L4** (全覆盖) | 13个模块 209 L3项→209 L4具体用例，100%覆盖 |
| 测试通过率 | pass | L1→L2 | 按阶段分组 |
| 内置工具数 | tools | L1→L3 | 工具组→工具名→参数 |
| 模型提供商 | models | L1→L2 | 提供商→模型 |
| 综合评分 | score | 图表 | 版本演进柱状图+维度条 |
| 操作模式 | modes | L1→L2 | 模式→功能特性 |
| **主线完工率** 🆕 | progress | L1→L2 | 分期进度条+模块明细 |
| **已完成模块** 🆕 | modules_progress | L1→L2 | 按状态分组+模块清单 |
| 问题记录 | issues | 节点点击 | 模块问题分布+时间线 |

### Memory 文件格式约束（解析器依赖）

**核心规则（编写新记录时遵循）**：
1. 每个问题使用独立的 `## ` section，可带 `[模块:ID]` 标签或依赖关键词匹配
2. 问题字段推荐使用 `- **问题**:` / `- **根因**:` / `- **修复**:` / `- **状态**: ✅ resolved` 格式

**解析器已兼容的格式（新旧均可）**：
- 冒号位置：`**问题：**`（旧）和 `**问题**: `（新）都兼容
- `### ` 子节识别：支持 `### 问题诊断/问题回顾` → `### 修复内容/解决` 模式
- 解决方案标记：`**修复**`, `**修复1**`, `**修复方案**`, `**修复内容**`, `**正确方案**`, `**核心方案**`, `**最终方案**`, `**解决**` 均识别
- 编号修复项：`**1. 修复描述**` / `**2. 修复描述**` 在 solution 块内被捕获
- 粗体键值对：`- **Pages**: desc` 在 solution 块内被捕获
- `- **修复** (path):` 括号后跟冒号的格式也被识别

**不需要遵守的旧约束**：
- ~~每个 Section 必须含 `[模块:ID]`~~ → 关键词匹配作为回退方案
- ~~冒号必须在粗体标记内部~~ → 内外皆可
- ~~不能用 `### 修复内容`~~ → 已支持
- 纯操作流程（启动/构建/GitHub）如无意匹配，可加 `## ` 但无模块标签和 fix 字段，会自动过滤

**模块 ID 速查**：
| ID | 模块 | ID | 模块 |
|----|------|----|------|
| F1 | 多模型适配器 | F9 | Desktop 原生应用 |
| F2 | Agent 系统 | F10 | 插件与技能系统 |
| F3 | 工具系统 | F11 | IM 适配器 |
| F4 | 知识库 RAG | F12 | i18n 国际化 |
| F5 | MCP 协议 | F13 | Desktop 自动升级 |
| F6 | 沙箱执行环境 | F14 | 模型目录动态更新 |
| F7 | Ink CLI | F15 | 全面去硬编码 |
| F8 | Web Dashboard | F16 | 版本控制系统 |
| B1a-B3c | 分支优化项(10个) | P5a-P5c | 管线运维(3个) |

**缓存说明**：仅修改日期（当日）或变更过的 MD 文件会被重新解析，旧文件复用 mtime 缓存

### 解析器修复历程（2026-06-23）

两次大规模修复，将问题追踪覆盖率从 ~23% 提升到 **99.5%**：

**第一轮 — 模块分配修复**：
- 问题：p5a/p5b/p5c/b2b 等模块节点显示 0 个问题
- 根因：① 内存文件标签错误（`[模块:F8]`→应为`[模块:p5a]`）② `**date**:`格式无`## `标题头 ③ regex 冒号位置单一 ④ section 过滤过激（跳过GitHub等）⑤ 去重仅看`date+title`
- 结果：总问题数 39→64→87，p5a:0→4, p5b:0→1, p5c:0→3, b2b:0→3

**第二轮 — "详见原文"消除修复**：
- 问题：大量条目显示"详见原文"（44/64 = 69%），无法展开具体解决信息
- 根因：① `### 修复内容`不被识别为solution section ② `\b`对中文字符无效（`解决\b`始终false）③ `### 问题回顾`→`### 解决`过渡时entry被提前push ④ `**修复**(path):`括号后冒号不匹配 ⑤ solution块内粗体键值对不捕获 ⑥ `**修复1**:`编号修复项不匹配
- 关键修复：`\b`→`(?![一-龥\w])`（中文友好边界）；fixStart regex改为通配含修复/方案关键词的粗体标签；问题→解决子段间不reset problem、不提前push entry
- 结果：总问题数 87→143→189，"详见原文" 44→25→6→1（-97.7%）

**重要教训**：
- JavaScript `\b` word boundary 对中文字符无效，需用 `(?![一-龥\w])` 替代
- `### ` 子段（问题回顾→解决）过渡时不应推送/重置条目，需保留累积状态

## 参考：BMAD Agent Team 插件评估（2026-06-23）

**BMAD** (Business Model And Design) 是 CodeBuddy 的 Agile 团队协作插件，包含 7 个角色化 Agent：

| Agent | 角色 | 说明 |
|-------|------|------|
| bmad-po | Product Owner | 需求收集、用户故事、PRD 编写 |
| bmad-architect | System Architect | 技术架构设计、方案评审（交互式） |
| bmad-sm | Scrum Master | Sprint 规划、任务拆解 |
| bmad-dev | Developer | 按 PRD/架构/sprint 计划实现功能 |
| bmad-qa | QA Engineer | 全面自动化测试 |
| bmad-review | Code Reviewer | 独立代码审查 |
| bmad-orchestrator | Orchestrator | 工作流协调、仓库分析 |

**评估结论**：不适合 EasyAgent 项目。
- 功能重叠：EasyAgent 本身是 AI 编程助手（70 工具），bmad 做的事它都能直接做
- 组织错配：bmad 为多角色团队设计，EasyAgent 是个人/小团队项目
- 已移除：工作区引用（`_add_level3.mjs`）+ 用户级插件目录均已清理

## 🔴 管线数据完整更新工作流 (v2.0, 2026-06-26)

**核心原则**：每次 `git push` → CI 全部通过 → **CI 自动**获取 vitest 报告 → **CI 自动**运行 unified-sync → **CI 自动** git commit + push 管线文件 → 本地 pull 即可。

**⚡ 自动化方式**：
- **CI 端**：`.github/workflows/ci.yml` 中 `sync-pipeline` job，在所有 6 个 job 通过后自动触发（仅 push main 分支）
- **本地端**：`git pull` 后运行 `scripts/pipeline-auto-sync.ps1` 同步服务器状态

**CI sync-pipeline job 流程**：
1. 下载 `test-core`、`test-server`、`test-desktop` 上传的 vitest JSON artifacts
2. 运行 `node scripts/unified-sync.mjs` 刷新所有管线数据文件
3. `git add` + `git commit -m "ci: auto-sync pipeline data [skip ci]"` + `git push`

### 数据流全景图

```
module-registry.mjs (唯一权威源——29 模块定义 + testFiles 映射)
  │
  ├──→ unified-sync.mjs (统一同步脚本)
  │       ├── 步骤1: 加载 MODULE_REGISTRY + PHASE_DEFINITIONS + BRANCH_DEFINITIONS
  │       ├── 步骤2: 扫描 packages/ 下所有 *.test.ts/tsx 文件
  │       ├── 步骤3: 统计用例数 (优先 vitest 报告 → 源码解析回退)
  │       ├── 步骤4: 生成 test-case-mapping.json (模块→文件→用例数)
  │       ├── 步骤5: 调用 getKPI() 获取动态 KPI
  │       ├── 步骤6: 强制清除缓存, 调用 parseMemoryIssues() 解析所有问题
  │       ├── 步骤7: 生成 pipeline-data.json (phases/branches/kpi/scoreHistory/dashboard)
  │       └── 步骤8: 导出 issue-data.json (离线问题回退)
  │
  ├──→ 输出文件 (共 5 个):
  │     ├── test-case-mapping.json     ← 模块→测试文件映射 (从 registry 生成)
  │     ├── pipeline-data.json         ← KPI + phases + branches + dashboard + scoreHistory
  │     ├── _test_detail.json          ← 四级树形测试详情 (从 vitest 报告生成)
  │     ├── issue-data.json            ← 问题数据离线回退 (526+ 条)
  │     └── project-progress-data.json ← 项目进度 (git hook 自动更新)
  │
  ├──→ Vitest 报告输入 (3 个):
  │     ├── _vitest-core.json    ← CI job test-core 或本地 npx vitest run
  │     ├── _vitest-server.json  ← CI job test-server
  │     └── _vitest-desktop.json ← CI job test-desktop
  │
  └──→ API 层 (server.mjs + pipeline-api.mjs → pipeline-config.mjs)
        ├── GET /api/pipeline      ← pipelineView + KPI + scoreHistory
        ├── GET /api/dashboard     ← 9 张卡片完整数据
        ├── GET /api/dashboard/:id ← 单卡片详情
        ├── GET /api/issues        ← 实时解析 memory MD 问题
        ├── GET /api/status        ← 系统状态摘要
        ├── GET /api/modules       ← 全部模块列表
        └── GET /api/test-detail   ← 四级树形测试详情 (自动回退 _test_detail.json)
```

### 文件依赖关系（修改触发链）

| 修改源文件 | 触发更新的文件 | 更新方式 |
|-----------|--------------|---------|
| `module-registry.mjs` (新增/修改模块) | test-case-mapping.json + pipeline-data.json | `node scripts/unified-sync.mjs` |
| `pipeline-config.mjs` (KPI/评分/阶段逻辑) | pipeline-data.json (API 动态读取,无需重生成) | 重启服务器即可 |
| 项目测试文件 (*.test.ts) 增删 | test-case-mapping.json (用例数变化) | `node scripts/unified-sync.mjs` |
| `_vitest-*.json` (CI 报告刷新) | pipeline-data.json KPI + _test_detail.json | `node scripts/unified-sync.mjs` |
| `.codebuddy/memory/*.md` (新增问题记录) | issue-data.json + pipeline-data.json.dashboard.issues | `node scripts/unified-sync.mjs` |
| `03_测试案例文档.md` (手动更新) | 无自动依赖, 但需与 mapping 一致 | 手动同步 |

### 🔴 GitHub Push → CI → 管线更新 标准流程

**触发条件**：每次 `git push` 到 main 分支后 CI 完成（6/6 jobs ✅）。

**必须执行的步骤**（缺一不可）：

#### 第 1 步：获取 CI vitest 报告

```bash
# 方式 A：本地重新运行 vitest（推荐，最简单可靠）
cd packages/core && npx vitest run     # → _vitest-core.json (926 tests)
cd packages/server && npx vitest run   # → _vitest-server.json (151 tests)
cd packages/desktop && npx vitest run  # → _vitest-desktop.json (118 tests)
# 合计 1195 tests

# 方式 B：从 GitHub Actions artifacts 下载（需认证 token）
# CI 各 job 的 vitest JSON 输出自动写入 docs/pipeline/_vitest-*.json
# 但需确认 vitest.config.ts 中已配置 reporter: 'json' + outputFile
```

#### 第 2 步：运行统一同步脚本

```bash
node scripts/unified-sync.mjs
```

此脚本自动完成：
1. 加载 module-registry.mjs 模块定义
2. 扫描所有测试文件，统计用例数
3. 生成 `test-case-mapping.json`（1195 用例, 48 文件, 29 模块）
4. 强制清除问题缓存，重新解析所有 memory MD 文件
5. 生成 `pipeline-data.json`（KPI=1195/1195/0, score=100, 6 phases, 3 branches, 9 dashboard cards）
6. 导出 `issue-data.json`（离线问题回退）

#### 第 3 步：重启管线服务器

```bash
# 杀掉旧进程
Get-Process -Name "node" -ErrorAction SilentlyContinue | Stop-Process -Force
# 启动新服务器
Start-Process -FilePath "node" -ArgumentList "docs/pipeline/server.mjs", "8899" -WorkingDirectory "d:\Work_Area\AI\Claude Code  CN" -WindowStyle Hidden
# 验证端口
netstat -ano | findstr ":8899"
```

#### 第 4 步：验证数据一致性

```bash
# 验证 KPI 数据
node -e "var pd=JSON.parse(require('fs').readFileSync('docs/pipeline/pipeline-data.json','utf-8')); console.log('KPI:', pd.kpi.testCases, '/', pd.kpi.testPassed, '/', pd.kpi.testFailed, ' score:', pd.kpi.scoreTotal)"

# 验证测试映射
node -e "var m=JSON.parse(require('fs').readFileSync('docs/pipeline/test-case-mapping.json','utf-8')); console.log('mapping:', m._meta.totalTestCases, 'cases,', m._meta.totalTestFiles, 'files')"

# 验证 API 响应
curl -s http://127.0.0.1:8899/api/pipeline | node -e "var d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{var j=JSON.parse(d);console.log('API KPI:',j.kpi.testCases,j.kpi.testPassRate,j.kpi.scoreTotal)})"

# 运行管线测试
node --test docs/pipeline/__tests__/pipeline-*.test.mjs
```

### 🔴 管线功能块显示健康检查清单

| # | 检查项 | 预期值 | 验证方式 |
|---|--------|--------|---------|
| 1 | 测试用例总数卡片 | 1195 | 仪表板 → tests 卡片 → 展开全部模块 |
| 2 | 测试通过率卡片 | 100% | 仪表板 → pass 卡片 → 各阶段显示"100%"或"代码扫描" |
| 3 | 内置工具数卡片 | 51 tools | 仪表板 → tools 卡片 → 17 分组 → 可展开参数 |
| 4 | 模型提供商卡片 | 10 providers | 仪表板 → models 卡片 → 10 家国产模型 |
| 5 | 综合评分卡片 | 100/100 | 仪表板 → score 卡片 → 五维度柱状图 |
| 6 | 操作模式卡片 | 4 modes | 仪表板 → modes 卡片 → Chat/Agent/Plan/Review |
| 7 | 主线完工率卡片 | 100%, 6/6 阶段 | 仪表板 → progress 卡片 → 进度条全绿 |
| 8 | 已完成模块卡片 | 29/29 模块 | 仪表板 → modules_progress → 全部 done ✅ |
| 9 | 问题记录卡片 | 535+ 条 | 仪表板 → issues 卡片 → 覆盖 23+ 模块 |
| 10 | 全景流程图 | 29 节点全绿 | SVG 管线图 → 6 阶段 3 分支全部绿色 done |
| 11 | 节点点击面板 | testCount 正确 | 点击任意节点 → "🧪 N 测试用例" |
| 12 | MD 问题反馈面板 | 按模块分类 | 点击问题记录卡片 → 展开 → 按模块显示问题 |
| 13 | 测试详情报告 | 1195 用例 | 点击失败的测试数 → 四级树形展开 (包→文件→分组→用例) |
| 14 | pass 数据分析图 | 环形图+柱状图+表格 | pass 面板 → 三图数据一致 |
| 15 | 版本历史图 | v0.1.0 → v0.5.2 单调递增 | score 卡片 → 版本演进柱状图 |

### Vitest 报告刷新注意事项

1. **core 包 vitest 配置**：`packages/core/vitest.config.ts` 必须配置 JSON reporter + outputFile
2. **报告时效性检测**：`unified-sync.mjs` 会对比 vitest 报告 mtime 与 `_test_detail.json` mtime，若 vitest 更新则强制重新生成
3. **完整性问题**：历史上 `_vitest-core.json` 曾只包含 1 文件/49 断言（应为 33 文件/926 断言），务必确认 3 个报告文件都完整
4. **验证完整性**：`_vitest-core.json` 中 `numTotalTests` 应 ≈ 926; `_vitest-server.json` ≈ 151; `_vitest-desktop.json` ≈ 118

### 常见问题速查

| 问题 | 症状 | 修复 |
|------|------|------|
| vitest 报告过期 | KPI 显示 318 而非 1195 | 重新运行 `npx vitest run` 生成新报告 |
| 问题缓存过旧 | issues 卡片显示旧数量 | `del docs\pipeline\.pipeline-cache.json` + 重启服务器 |
| 服务器代码未更新 | API 返回旧数据 | 重启 node 进程 (pipeline-config.mjs 动态 import) |
| testCount 缺失 | 节点面板不显示测试数 | 运行 `node scripts/unified-sync.mjs` 重新生成 |
| 模块状态不一致 | 完工率 < 100% 但全部 done | 检查 module-registry.mjs 中各模块 status 字段 |
| _test_detail.json 过期 | 测试详情只显示 318 条 | 运行 `npx vitest run` 刷新报告 → unified-sync 自动重新生成 |
| JSON/API 数据不一致 | 页面显示与 API 返回不同 | 检查 transformJSONData() 兼容 pipeline.phases (v2.0) 和 mainLane (v1.x) |

## 关键文件索引

- 版本源: `version.json` (0.5.2)
- 版本同步: `scripts/sync-version.mjs`
- 统一管线同步: `scripts/unified-sync.mjs` ← **核心同步入口**
- 模块注册表: `docs/pipeline/lib/module-registry.mjs` ← **唯一权威源**
- 管线配置: `docs/pipeline/lib/pipeline-config.mjs` ← KPI/评分/阶段/模块定义
- 管线 API: `docs/pipeline/lib/pipeline-api.mjs` ← 7 REST API 端点
- 管线解析器: `docs/pipeline/lib/pipeline-parser.mjs` ← Memory MD 解析 + 缓存
- 管线服务器: `docs/pipeline/server.mjs` ← HTTP 服务 (端口 8898/8899)
- 管线前端: `docs/pipeline/index.html` ← 仪表板渲染 (924 行)
- 管线架构: `docs/pipeline/ARCHITECTURE.md`
- 发布脚本: `scripts/release.mjs`
- 一键发布: `release-publish.bat`（交互式，集成版本标记+构建+上传全流程）
- 更新日志: `CHANGELOG.md`
- 打包流程: `docs/05_Desktop_EXE打包标准流程.md` (v1.8, 28个问题详解)
- **构建必检清单**: `docs/14_构建前必检清单.md` ← ⭐ 每次构建前30秒过一遍
- 发布与CI/CD: `docs/06_版本发布与CI-CD流程指南.md` (v1.0, 发布全流程 + GitHub Actions)
- 分发方案: `docs/07_自动更新分发方案对比.md` (v1.0, GitHub Releases/R2/COS/自建 5 方案对比)
- 预检查脚本: `packages/desktop/scripts/verify-build.cjs` (17类, 30+项自动检查)
- 一键打包: `build.bat --release` ← **唯一入口，禁止手动一步步跑**
- 依赖清单: `packages/desktop/express-deps.json` (90+ 包)
- 架构设计: `docs/02_架构设计文档_ADD.md` (v5.4)
- 需求文档: `docs/01_需求规格说明书_PRD.md` (v5.3)
- 测试文档: `docs/03_测试案例文档.md` (1273 tests, 覆盖率门禁)
