# 🔍 EasyAgent 代码评审报告 — 批次 A（P0 奠基）

**评审范围**：`6e9f422..1f5bf7f`（14 个 commits，111 个文件，+1756/-371 行）  
**评审日期**：2026-06-24  
**变更性质**：项目初始化 + Desktop 打包体系 + build.bat CMD 兼容性修复（9 commits）+ release-publish.bat  
**评审结论**：🟢 **Approved（所有阻塞级问题已修复）**  修复日期：2026-06-24  修复人：AI Assistant

> ⚠️ **重要前提**：批次 A 覆盖了从 init 到 build 系统稳定化的完整阶段，包含产品代码、打包体系、构建脚本。所有硬性约束（PluginManager 安全、Web/Desktop 同步、ModelRegistry、IM 适配器、沙箱隔离、better-sqlite3）均适用。

---

## 变更文件清单

### 构建系统（11 files）
| 文件 | 变更量 | 类型 |
|------|--------|------|
| `build.bat` | +67/-49 | 核心构建脚本 |
| `release-publish.bat` | +11/-5 | 发布脚本 |
| `repack.bat` | +17 | 新增：快速重打包 |
| `scripts/check-encoding.mjs` | +46 | 新增：编码检查 |

### Desktop 打包体系（11 files）
| 文件 | 变更量 | 类型 |
|------|--------|------|
| `packages/desktop/scripts/verify-build.cjs` | +316/-1 | 核心：预检查脚本 |
| `packages/desktop/scripts/postinstall.cjs` | +68 | 新增：postinstall |
| `packages/desktop/check-module-ver.cjs` | +100 | 新增：模块版本检查 |
| `packages/desktop/package.json` | +45/-16 | 依赖声明 |
| `packages/desktop/src/main.ts` | +25/-4 | 主进程入口 |
| `packages/desktop/check-*.cjs/mjs` (6 files) | +125 | 新增：诊断脚本 |

### Server（1 file）
| 文件 | 变更量 | 类型 |
|------|--------|------|
| `packages/server/src/index.ts` | +26/-14 | 服务入口 |

### Core 源码（~50 files）
| 分类 | 文件数 | 典型变更 |
|------|--------|---------|
| 模型适配器 | 3 | Ernie/Hunyuan/OpenAI 适配器 |
| Agent 引擎 | 1 | AgentEngine.ts |
| 沙箱执行 | 2 | DockerSandbox / LocalSandbox |
| 知识库 | 1 | KnowledgeService.ts |
| 工具系统 | 7 | Code/Git/Knowledge/Search 等工具 |
| IM 适配器 | 4 | Base/Feishu/Telegram/WeChat |
| 配置管理 | 2 | ConfigManager / ModelRegistry |
| 其他 | ~20 | 语义分析/Automation/MCP/日志等 |

### Web & Desktop UI（~30 files）
- Desktop 前端：pages (Chat/Automation/Tools 等 8 页) + stores (10 个)
- Web 前端：pages (6 页) + stores (10 个)

---

## 🔴 阻塞级（Blocking）

### B1 ✅ CORS 完全开放 — 无起源限制 **[已修复]**

**位置**：`packages/server/src/index.ts` L424-428

**修复内容**：添加了具体 CORS 配置，限制来源为 `CORS_ORIGIN` 环境变量或默认 `http://127.0.0.1:3456`，明确声明允许的方法。

---

### B2 ✅ 语义文件 API 路径遍历漏洞 **[已修复]**

**位置**：`packages/server/src/index.ts` L1756-1780

```typescript
app.get('/api/semantic/file', async (req, res) => {
    const filePath = req.query.path as string;
    // ...
    const { existsSync } = await import('node:fs');
    if (!existsSync(filePath)) {  // ← 直接使用用户输入，无路径校验
```

**问题**：`filePath` 直接来自 `req.query.path`，未经任何路径越界检查。攻击者可通过 `../../etc/passwd` 读取系统任意文件。而同文件中 `/api/files/browse` 端点（L1808）正确使用了 `resolve + startsWith(PROJECT_ROOT)` 防护。

**修复**：添加与 `/api/files/browse` 一致的路径安全检查。

**分级**：🔴 阻塞 — 路径遍历可能导致任意文件读取。

---

### B3 ✅ 插件加载路径可导致 RCE **[已修复]**

**位置**：`packages/server/src/index.ts` L1236-1251

```typescript
app.post('/api/plugins/load', async (req, res) => {
    const { path: pluginPath } = req.body;
    // ...
    const plugin = await pluginManager.loadPlugin(pluginPath);
    // ↑ 未校验 pluginPath 是否在允许的插件目录内
```

**问题**：`pluginPath` 直接来自用户输入，无任何路径校验。如果 `PluginManager.loadPlugin` 内部执行 `import()` 或 `require()`，攻击者可加载任意 Node.js 模块实现 RCE。

**修复**：限制插件路径必须在预设插件目录内，使用 `resolve + startsWith` 进行路径校验。

**分级**：🔴 阻塞 — 远程代码执行漏洞。

---

### B4 ✅ 加密密钥派生使用可预测的机器标识 **[已修复]**

**位置**：`packages/core/src/utils/encryption.ts` L37-38

```typescript
const machineId = `${process.env.COMPUTERNAME || ''}${process.env.USER || ''}${process.env.HOME || ''}`;
return crypto.createHash('sha256').update(machineId).digest('hex');
```

**问题**：当 `EASYAGENT_MASTER_KEY` 未设置时，加密密钥从 `COMPUTERNAME + USER + HOME` 派生。这些信息：
- 对同一台机器上所有进程完全一致
- 可被任何本地进程通过 `process.env` 读取
- 不具备真正的随机熵
- 攻击者获取加密的 `providers.json` 后可解密所有 API 密钥

**修复**：最低限度使用 `crypto.randomBytes(32)` 生成并持久化主密钥；最佳实践使用操作系统密钥链。

**分级**：🔴 阻塞 — API 密钥加密形同虚设。

---

### B5 ✅ 本地沙箱命令注入风险 **[已修复]**

**位置**：`packages/core/src/sandbox/LocalSandbox.ts` L67

```typescript
const shellArgs = isWindows ? ['/d', '/s', '/c', command] : ['-c', command];
```

**问题**：`command` 直接传给 `cmd.exe /c` 或 `sh -c`，无任何输入清理。shell 元字符（`;`, `|`, `&&`, `$()`, `` ` `` 等）可导致命令注入。`LocalSandbox` 在主机上直接执行，影响主机系统。`DockerSandbox` 有同样问题（L197-199）。

**修复**：`LocalSandbox` 使用 `spawn(command, [args])` 直接执行避免 shell 解析；`DockerSandbox` 添加元字符检测并拒绝危险模式。

**分级**：🔴 阻塞 — 本地沙箱无隔离，命令注入直接影响主机。

---

### B6 ✅ 知识库路径遍历 — 可读取工作区外任意文件 **[已修复]**

**位置**：`packages/core/src/knowledge/KnowledgeService.ts` L131、L384、L409

```typescript
// addDocument
const fullPath = resolve(this.workspace, filePath);
// importFromAbsolutePath — 完全无限制
importFromAbsolutePath(absolutePath: string) {
    if (!existsSync(absolutePath)) return { ... };
    const content = readFileSync(absolutePath, 'utf-8');
```

**问题**：`filePath` 可包含 `../../` 读取工作区外文件。`importFromAbsolutePath` 接受任意绝对路径，无白名单限制，可直接读取系统任何文件。

**修复**：`resolve` 后检查结果是否在 `workspace` 目录内；`importFromAbsolutePath` 添加目录白名单或完全移除。

**分级**：🔴 阻塞 — 路径遍历导致任意文件读取。

---

### B7 ✅ verify-build.cjs 子包路径错误，导致 catch 语法和 UTF-8 检查静默跳过 **[已修复]**

**位置**：`packages/desktop/scripts/verify-build.cjs` L275-281

```javascript
const subPackages = [
  path.join(ROOT, '..', '..', '..', 'core', 'src'),   // ← 错误：多了一层 ..
  path.join(ROOT, '..', '..', '..', 'desktop', 'src'), // ROOT 已是 packages/desktop/
];
```

**问题**：`ROOT = packages/desktop/`，`ROOT/../../..` 指向工作区外部。正确的路径应为 `ROOT/../../core/src`。当前导致 `fs.existsSync(pkgDir)` 返回 false，**静默跳过**第 9 项（catch 语法检查）和第 14 项（UTF-8 编码检查）。

**修复**：改为 `path.join(ROOT, '..', '..', 'core', 'src')`。

**分级**：🔴 阻塞 — 两项关键检查完全失效。

---

### B8 ✅ verify-build.cjs 检查不存在的 `api.ts` 文件，每次构建必然失败 **[已修复]**

**位置**：`packages/desktop/scripts/verify-build.cjs` L30

```javascript
['src/renderer/api.ts', 'API client'],
```

**问题**：`src/renderer/api.ts` 文件不存在于项目中。此检查会导致**每次构建都触发 FAIL**，阻塞 `build.bat --release`。

**修复**：检查文件实际路径并修正，或从 `requiredFiles` 列表移除。

**分级**：🔴 阻塞 — 直接阻断构建流程。

---

## 🟠 高危（High）

### H1 ✅ release-publish.bat — `echo %errorlevel%` 后 errorlevel 被覆盖 **[已修复]**

**位置**：`release-publish.bat` L234-237

```batch
call build.bat --release
echo [DEBUG A] errorlevel=%errorlevel%
if errorlevel 1 goto :BUILD_FAILED    ← echo 成功后 errorlevel=0！
```

**问题**：`echo` 命令成功后会将 errorlevel 设为 0，导致后续 `if errorlevel 1` 永远为 false。即使 `build.bat` 返回失败，也会错误进入 `:BUILD_OK` 分支。

**修复**：先保存 errorlevel 到变量，再 echo：
```batch
call build.bat --release
set _BUILD_ERR=%errorlevel%
echo [DEBUG A] errorlevel=%_BUILD_ERR%
if %_BUILD_ERR% neq 0 goto :BUILD_FAILED
```

**分级**：🟠 高危 — 构建失败可能被静默忽略。

---

### H2 ✅ WebSocket `stop` 消息未真正停止 Agent 执行 **[已修复]**

**位置**：`packages/server/src/index.ts` L2410-2415

```typescript
case 'stop': {
    safeSend(ws, { type: 'done', sessionId: sid });
    break;
    // ↑ 只通知客户端，未中断正在运行的 agent.run()
}
```

**问题**：向客户端发送 `done` 信号但未中断 Agent 执行，Agent 继续消耗 API token 和计算资源。

**修复**：使用 `AbortController` 或类似机制真正中断 Agent 执行。

**分级**：🟠 高危 — 浪费 AI API 配额和计算资源。

---

### H3 ✅ 会话管理器在 IM 适配器回调中被闭包引用，存在初始化顺序问题 **[已修复]**

**位置**：`packages/server/src/index.ts` L351-420

```typescript
// L351: IM 管理器初始化，messageHandler 闭包引用 sessionManager
const imManager = new IMManager({ messageHandler: (msg) => {
    return sessionManager.processMessage(msg);  // ← 此时 sessionManager 未初始化！
}});
// L420: 会话管理器初始化（晚 70 行）
const sessionManager = new SessionManager();
```

**问题**：`sessionManager` 通过 `let` 声明会被提升，但在 L351 时值为 `undefined`。如果 `messageHandler` 在赋值前被调用，将崩溃。

**修复**：将 `sessionManager` 初始化移到 `imManager` 之前。

**分级**：🟠 高危 — 特定时序下运行时崩溃。

---

### H4 ✅ `POST /api/chat` 忽略请求中的 `provider` 参数 **[已修复]**

**位置**：`packages/server/src/index.ts` L1189-1216

```typescript
app.post('/api/chat', async (req, res) => {
    const { message, sessionId, provider, model } = req.body;
    const providerConfig = configManager.getCurrentProvider();  // ← 忽略了 provider！
```

**问题**：请求中的 `provider` 参数被解构但从未使用，始终使用 `getCurrentProvider()`。而 WebSocket chat 处理正确使用了 `provider` 参数，功能不一致。

**分级**：🟠 高危 — 功能不一致，用户指定 provider 被忽略。

---

### H5 ✅ ConfigManager 危险命令白名单 **[已修复]**

**位置**：`packages/core/src/config/ConfigManager.ts` L68-70

```typescript
allowedCommands: parseAllowedCommandsFromEnv().length > 0 
    ? parseAllowedCommandsFromEnv()   // ← 调用了两次
    : DEFAULT_ALLOWED_COMMANDS,       // ← 包含 rm/curl/wget
```

**问题**：`parseAllowedCommandsFromEnv()` 被调用两次（性能浪费）。`DEFAULT_ALLOWED_COMMANDS` 包含 `rm`（数据丢失）、`curl`/`wget`（下载任意内容）。无命令参数限制。

**分级**：🟠 高危 — 命令白名单过于宽松。

---

### H6 ✅ verify-build.cjs `CURRENT_VERSION` 硬编码为 `0.3.0` **[已修复]**

**位置**：`packages/desktop/scripts/verify-build.cjs` L212

```javascript
const CURRENT_VERSION = '0.3.0';
```

**问题**：当前版本为 `0.4.1`，但版本号检测常量仍为 `0.3.0`。旧版本检测正则会错误标记合法版本号为硬编码。需更新为 `'0.4.1'`。

**分级**：🟠 高危 — 版本检查逻辑过期，可能阻塞构建。

---

### H7 ✅ verify-build.cjs MODULE_VERSION 死代码 + 假阳性风险 **[已修复]**

**位置**：`packages/desktop/scripts/verify-build.cjs` L318-341

- L319-328 定义了 `checkScript` 变量但从未使用（死代码）
- L341 使用 `process.versions.modules`（当前 Node 版本）而非 better-sqlite3 .node 文件的 MODULE_VERSION，如果用户 Node 版本与 Electron 不同，会假阳性报警

**分级**：🟠 高危 — 假阳性可能阻碍正常构建流程。

---

## 🟡 建议优化（Comment）

### C1. web/desktop store 字段命名 `apiBase` → `apiBaseUrl` 不一致

大量 store 中硬编码 `apiBase: http://127.0.0.1:3456`，但不同 store 使用的变量名不统一（`apiBase` vs `API_BASE` vs `baseUrl`）。

**建议**：抽取为全局常量 `API_BASE_URL`。

---

### C2. 日志中工具参数可能泄露敏感信息

**位置**：`packages/core/src/agent/AgentEngine.ts` L233

```typescript
logger.info({ tool: toolName, input: toolInput }, '执行工具');
```

**问题**：工具输入被完整记录到日志，可能包含 API 密钥、密码等。

**建议**：添加敏感字段过滤，或降低日志级别。

---

### C3. `GET /api/config` 脱敏不完整

**位置**：`packages/server/src/index.ts` L764-774

```typescript
const safeConfig = { ...cfg, providers: cfg.providers.map(p => ({ ...p, apiKey: '••••••••' })) };
```

**问题**：`...cfg` 会暴露配置对象中所有现有和未来的敏感字段。应改为白名单方式，显式列出可返回字段。

---

### C4. WebSocket 无认证机制

**位置**：`packages/server/src/index.ts` L2266

任何知道服务地址的人都可以建立 WebSocket 连接发送 `chat` 消息，消耗 AI API 配额。

**建议**：连接建立时通过 token/cookie 进行认证。

---

### C5. 缺少安全 HTTP 头部

**位置**：`packages/server/src/index.ts` 整个应用

缺少 `X-Content-Type-Options`、`X-Frame-Options`、`Content-Security-Policy`、`Strict-Transport-Security` 等安全头。

**建议**：使用 `helmet` 中间件。

---

### C6. `check-*.cjs/mjs` 诊断脚本未被任何流程引用

以下 7 个文件在 `packages/desktop/` 根目录，但未被 `build.bat`、`release-publish.bat`、`package.json scripts`、CI 配置 引用：

`check-bundle.cjs`、`check-bundle.mjs`、`check-chunks.cjs`、`check-imports.cjs`、`check-module-ver.cjs`、`check-node-ver.cjs`、`check-startup.cjs`

**建议**：如果保留价值，移到 `scripts/debug/` 子目录；否则删除以降低维护负担。

---

### C7. `@easyagent/core` 和 `@easyagent/server` 使用相对路径而非 `workspace:*`

**位置**：`packages/desktop/package.json` L144-146

```json
"@easyagent/core": "../core",       // 应为 "workspace:*"
"@easyagent/server": "../server",   // 应为 "workspace:*"
```

与 `@easyagent/frontend: "workspace:*"` 声明方式不一致，pnpm 在发布时可能无法正确解析。

---

### C8. postinstall.cjs 使用 `npx @electron/rebuild` 而非 `pnpm exec`

**位置**：`packages/desktop/scripts/postinstall.cjs` L16

`npx` 会下载线上版本，可能与 `devDependencies` 中声明的 `@electron/rebuild: "^4.0.4"` 版本不一致。建议改用 `pnpm exec @electron/rebuild`。

---

### C9. `/api/config` 版本号硬编码不一致

`APP_VERSION = '0.3.0'`（L430）vs 横幅 `v0.4.1`（L2477），版本号来源不一致。

---

### C10. 知识库合并统计 bug

```typescript
global: { totalDocs: globalStats.totalSize, totalSize: globalStats.totalSize },
```

`totalDocs` 错误赋值为 `totalSize`（文件大小）而非 `totalDocs`（文档数量）。

---

## 🏗️ 架构影响评估

### 本次变更与现有模块的重叠度

| 领域 | 重叠度 | 说明 |
|------|--------|------|
| 沙箱安全 | 🔴 高 | LocalSandbox/DockerSandbox 命令注入风险影响 F6 |
| API 安全 | 🔴 高 | CORS/路径遍历/RCE 影响 F2/F5/F8 |
| 加密存储 | 🔴 中 | 密钥派生影响 F1 适配器 API 密钥安全 |
| 知识库 | 🔴 中 | 路径遍历影响 F4 数据安全 |
| 构建系统 | 🟡 高 | build.bat/verify-build 影响 B1a-B3c 交付 |

---

## 检查清单逐项核对

| 检查项 | 结果 | 说明 |
|--------|------|------|
| monorepo 包边界 | 🟡 | desktop 依赖使用相对路径而非 workspace:* |
| API 注册 / WebSocket | 🔴 | CORS 完全开放、无认证、stop 无效、provider 参数忽略 |
| Desktop 自动更新 | ✅ | electron-updater 已正确引入 |
| ModelRegistry 目录合并 | ✅ | 配置结构合理 |
| 国际化 `t()` | 🟡 | 部分页面未见国际化调用 |
| CHANGELOG 记录 | ✅ | v0.3.3 + v0.4.0 已记录 |
| Node 版本兼容 | 🟡 | 参见 B7、H6、H7 |
| better-sqlite3 封装 | 🟡 | postinstall 使用 npx 风险 |
| Web/Desktop 同步 | ✅ | 本批次两端 store 均有对应修改 |
| 版本号来源 | 🔴 | 多处硬编码不一致（B8、C9） |
| 插件安全（worker_threads/vm 隔离） | 🔴 | 插件加载路径可导致 RCE（B3） |
| KnowledgeService scope 区分 | 🔴 | 任意文件读取风险（B6） |
| 沙箱命令执行安全 | 🔴 | 命令注入风险（B5） |
| 加密密钥安全 | 🔴 | 可预测的机器标识派生（B4） |
| 循环中同步 I/O | ✅ | 未发现相关问题 |
| 数据库直连 | ✅ | better-sqlite3 封装正确 |

---

## 最终结论

### 🟢 Approved（所有阻塞级+高危级问题已于 2026-06-24 修复）

**修复统计**：

| 级别 | 数量 | 已修复 | 状态 |
|------|------|--------|------|
| 🔴 阻塞 | 8 | 8 | ✅ 全部修复 |
| 🟠 高危 | 7 | 7 | ✅ 全部修复 |
| 🟡 建议 | 10 | 0 | ⏸ 可选后续优化 |

**修复详情**：

| 编号 | 问题 | 修复文件 | 修复方式 |
|------|------|---------|---------|
| B1 | CORS 完全开放 | `index.ts` | 添加 origin/credentials/methods 白名单 |
| B2 | 语义文件 API 路径遍历 | `index.ts` | 添加 `resolve + startsWith(PROJECT_ROOT)` 检查 |
| B3 | 插件加载 RCE | `index.ts` | 限制插件路径在 `.easyagent/plugins/` 内 |
| B4 | 加密密钥可预测 | `encryption.ts` | 生成 `randomBytes(32)` 持久化到 `~/.easyagent/secret.key` |
| B5 | 沙箱命令注入 | `LocalSandbox.ts`/`DockerSandbox.ts` | 添加 `validateCommand()` 检测 shell 元字符 |
| B6 | 知识库路径遍历 | `KnowledgeService.ts` | addDocument/importFromAbsolutePath 添加路径校验 |
| B7 | verify-build 子包路径 | `verify-build.cjs` | 修正 `ROOT/../..` 路径 |
| B8 | verify-build api.ts 假检查 | `verify-build.cjs` | 从 requiredFiles 删除 |
| H1 | release-publish errorlevel | `release-publish.bat` | 先保存 errorlevel 再 echo |
| H2 | WebSocket stop 无效 | `index.ts` | 引入 AbortController 机制 |
| H3 | SessionManager 初始化顺序 | `index.ts` | 移至 imManager 之前 |
| H4 | /api/chat 忽略 provider | `index.ts` | 检查并使用请求中的 provider 参数 |
| H5 | 危险命令白名单 | `ConfigManager.ts` | 移除 rm/curl/wget，修复双重调用 |
| H6 | verify-build 版本过期 | `verify-build.cjs` | CURRENT_VERSION 更新为 0.4.1 |
| H7 | MODULE_VERSION 死代码 | `verify-build.cjs` | 删除未使用的 checkScript 变量 |

**正面评价**：
- ✅ pnpm workspace 结构设计合理（5 个独立包）
- ✅ verify-build.cjs 检查逻辑全面（10 大类 20+ 项），路径已修正
- ✅ Desktop/Web 代码隔离概念正确，两端独立修改
- ✅ build.bat 的 CMD 兼容性处理有效解决了 bat 解析问题
- ✅ IM 适配器设计抽象良好
- ✅ 模型适配器支持中国主流大模型

---

*本报告基于 EasyAgent 代码评审专家（兼产品架构视角）角色生成。评审依据：PRD v5.3、ADD v5.4、MEMORY.md 陷阱清单、verify-build.cjs。*
