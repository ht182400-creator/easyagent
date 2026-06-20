# EasyAgent Desktop EXE 打包标准流程与问题手册

> 版本: v1.4 | 日期: 2026-06-20 | 基于 10+ 次打包实战经验总结 | 25 个问题已解决 | 当前版本: 0.3.0 (Gemini)

---

## 一、快速打包命令（标准化流水线）

```bash
# ============ 推荐：项目根目录一键脚本（双击） ============
d:\Work_Area\AI\Claude Code  CN\build.bat              # 快速测试模式 (--dir, ~60s)
d:\Work_Area\AI\Claude Code  CN\build.bat --release    # 完整安装包 (NSIS, ~3min)
d:\Work_Area\AI\Claude Code  CN\build.bat --verify     # 仅预检查，不构建
```

**脚本自动执行 5 个阶段**:
1. **清理**: 杀进程(EasyAgent/electron) + 删除旧 release + 清理 dist/renderer
2. **预检查**: `scripts/verify-build.cjs` 自动检查 7 大类 20+ 项已知问题
3. **构建**: core tsup → server tsup → desktop tsup → vite build
4. **打包**: `--dir` 快速模式 或 完整 NSIS 安装包
5. **验证**: 检查输出文件大小 + asar 内容验证

**输出路径**:
- 快速模式: `packages/desktop/release/win-unpacked/EasyAgent.exe` (直接运行)
- 发行模式: `packages/desktop/release/EasyAgent-0.3.0-win-x64.exe` (~87MB)

```bash
# 手动方式（分步执行，不推荐）
cd packages/core && pnpm exec tsup
cd ../server && pnpm exec tsup
cd ../desktop && pnpm exec tsup && pnpm exec vite build && pnpm exec electron-builder --win --x64
```

---

## 二、构建前必检清单（自动执行，无需手动逐项查）

**推荐方式**: 运行 `node packages/desktop/scripts/verify-build.cjs` 自动检查以下所有项目：

### verify-build.cjs 检查清单（7 大类 20+ 项）

| # | 类别 | 检查项 | 严重性 |
|---|------|--------|--------|
| 1 | **文件存在** | LICENSE, icon.ico, installer.nsh, index.html, index.css, api.ts | 🔴 致命 |
| 2 | **package.json 配置** | electron-builder 精确 23.6.0 (非 ^)，无 v24 残留，npmRebuild:false | 🔴 致命 |
| 3 | **index.html** | 无 `<style>` 标签 (Vite 5 bug)，CSP 使用 127.0.0.1:3456 非 localhost | 🔴 致命 |
| 4 | **源码 URL** | api.ts, App.tsx, chatStore.ts, Automation.tsx 无 localhost:3456 | 🔴 致命 |
| 5 | **双重 .json()** | Dashboard.tsx, Automation.tsx, ChatInput.tsx 无 `(r) => r.json()` | 🔴 致命 |
| 6 | **关键依赖** | better-sqlite3, express, ws, cors, multer, pino, body-parser 已声明 | 🟡 影响 |
| 7 | **CSS @import** | index.css 中 @import 在所有规则之前 | 🟡 影响 |

### 构建流程（build.bat 自动执行）

```
build.bat 执行流程:
  ├── [0/5] 清理: 杀进程 + 删 release + 清 dist/renderer
  ├── [1/5] 预检查: node scripts/verify-build.cjs → 任何错误中止
  ├── [2/5] core tsup
  ├── [3/5] server tsup
  ├── [4/5] desktop tsup + vite build
  ├── [5/5] electron-builder (--dir 或完整 NSIS)
  └── 验证: 输出文件大小 + asar 内容检查
```

### VS Code 文件监视器排除

`.vscode/settings.json` 必须包含：
```json
{
  "files.watcherExclude": {
    "**/packages/desktop/release/**": true,
    "**/packages/desktop/release-v*/**": true
  }
}
```

---

## 三、已解决问题的完整清单

### 🔴 问题 1：electron-builder v24.0.0 意外升级（最严重）

**现象**：
- NSIS 打包报错：`Plugin not found, cannot call EnVar::RemoveValue`
- 生成 EXE 仅 0.3MB（正常 ~87MB）

**根本原因**：
- `package.json` 声明 `"electron-builder": "^23.6.0"`（semver 范围）
- `pnpm-lock.yaml` 锁定 23.6.0，但 node_modules 中**同时存在 23.6.0 和 24.0.0 两套**
- 运行时 `npx` 优先使用了 hoisted 的 v24.0.0（alpha 版本）
- v24.0.0 自动注入 MULTIUSER_INSTALLMODE 宏，nsis-resources-3.4.1 模板调用不存在的 EnVar 插件

**修复方法（永久）**：
1. `package.json` 中将 `"^23.6.0"` 改为 `"23.6.0"`（去掉 `^`）
2. 删除 `node_modules/.pnpm/` 中所有 `*@24.0.0` 包
3. `pnpm install` 重新解析
4. 验证：只存在 `electron-builder@23.6.0`

**教训**：关键构建工具**必须精确锁定版本**，禁止使用 `^` 或 `~` 范围。

---

### 🔴 问题 2：Vite 5.2.0 inline `<style>` 编译失败

**现象**：
```
[vite:html-inline-proxy] No matching HTML proxy module found
```

**原因**：Vite 5.2.0 对 `<style>` 内联标签的 HTML proxy 处理有 bug。

**修复方法**：
- `index.html` 中 `<style>...</style>` → `<link rel="stylesheet" href="/src/renderer/index.css" />`
- 所有样式移入外部 CSS 文件

**教训**：Electron 环境下不要在 `index.html` 中使用 `<style>` 标签。

---

### 🟡 问题 3：CSS `@import` 顺序错误

**现象**：Vite 构建警告/失败，CSS 规则顺序错误。

**原因**：`@import` 指令在 CSS 规范中**必须在所有其他规则之前**。如果在 `@import` 之前有任何规则（包括注释后的普通规则），CSS 解析器会报错。

**修复方法**：
```css
/* ✅ 正确：@import 在最前面 */
@import url('https://fonts.googleapis.com/css2?...');

/* 然后才是其他规则 */
html, body, #root { margin: 0; ... }

/* ❌ 错误：普通规则在 @import 之前 */
html, body, #root { margin: 0; ... }
@import url('https://fonts.googleapis.com/css2?...');
```

**教训**：`index.css` 中 `@import` 必须在文件最顶部，注释除外但不能有其他规则。

---

### 🟡 问题 4：LICENSE 文件缺失导致 NSIS 打包失败

**现象**：
```
Error: Please specify license file
```

**原因**：`package.json` 中 NSIS 配置了 `"license": "LICENSE"`，但文件不存在。

**修复方法**：创建 `packages/desktop/assets/LICENSE`（MIT 许可证或其他）。

**教训**：`electron-builder` NSIS 配置中引用的所有文件**必须实际存在**。

---

### 🟡 问题 5：better-sqlite3 原生模块编译失败

**现象**：`node-gyp` 无法编译 better-sqlite3。

**原因**：
- VS2019 虽有 v142 toolset，但 Windows SDK 路径 node-gyp 检测不到
- `@electron/rebuild` 因项目路径含空格 `"Claude Code  CN"` 失败

**修复方法**：
1. 使用预编译的 `better_sqlite3.node`
2. 设置 `"npmRebuild": false`（跳过 electron-builder 原生模块重建）
3. 将 better-sqlite3 加入 `asarUnpack`（asar 包外单独存放）

```json
"npmRebuild": false,
"asarUnpack": [
  "node_modules/better-sqlite3/**",
  "node_modules/electron-updater/**"
]
```

**教训**：原生模块**预编译 + npmRebuild:false**，避免编译环境差异。

---

### 🟡 问题 6：pino 子依赖缺失

**现象**：打包后运行时报错找不到 `pino-std-serializers` 等模块。

**原因**：pnpm 将 pino 的 11 个子依赖提升到根 `.pnpm` 目录，electron-builder 的 asar 打包找不到。

**修复方法**：将 pino 的 11 个子依赖**全部加入 `desktop/package.json` dependencies**：
- atomic-sleep, fast-redact, on-exit-leak-free, pino-abstract-transport
- pino-std-serializers, process-warning, quick-format-unescaped
- real-require, safe-stable-stringify, sonic-boom, thread-stream

**教训**：pnpm 提升的传递依赖在 asar 打包中可能丢失，关键库的子依赖必须显式声明。

---

### 🟡 问题 7：pnpm workspace symlink 在 asar 中失效

**现象**：打包后 `@easyagent/core` 或 `@easyagent/server` 找不到。

**原因**：pnpm workspace 使用 symlink 链接本地包，asar 打包后 symlink 失效。

**修复方法**：在 `tsup.config.ts` 中将 workspace 包**打包进 main.js**：
```ts
noExternal: ['@easyagent/core', '@easyagent/server']
```

**教训**：pnpm workspace 本地包在桌面打包时必须 bundle 入主进程代码。

---

### 🟡 问题 8：Electron 和原生模块 external 声明

**现象**：tsup 打包报错或运行时 electron 模块找不到。

**原因**：Electron 在运行时提供自己的模块，编译时不应打包。

**修复方法**：`tsup.config.ts` 中声明：
```ts
external: [
  'electron',
  'better-sqlite3',
  'pino', 'pino-pretty',
  'express', 'cors', 'ws', 'multer',
  'electron-updater', 'electron-store',
]
```

**教训**：**必须 external** 的包类别：
- Electron 核心模块 (electron)
- 原生 C++ 模块 (better-sqlite3)
- 使用内部 CJS require 的模块 (pino/pino-pretty)
- 整个 Express 生态 (express/cors/ws/multer)

---

### 🟢 问题 9：VS Code 文件监视器锁定 app.asar

**现象**：打包到 99% 时失败或 asar 写入错误。

**原因**：CodeBuddy/VS Code 的文件监视器锁定了 `release/win-unpacked/resources/app.asar`。

**修复方法**：`.vscode/settings.json` 排除 release 目录：
```json
"files.watcherExclude": {
  "**/packages/desktop/release/**": true,
  "**/packages/desktop/release-v*/**": true
}
```

**打包前额外**：`taskkill /f /im EasyAgent.exe` 关闭残留进程。

---

### 🟢 问题 10：CSP 与 file:// 协议

**现象**：Electron 窗口白屏，控制台报 CSP 违规。

**原因**：Electron 使用 `file://` 协议加载页面，默认 CSP 会阻止 API 请求和 WebSocket。

**修复方法**：`index.html` 中设置宽松的 CSP：
```html
<meta http-equiv="Content-Security-Policy" 
  content="default-src 'self'; 
           script-src 'self' 'unsafe-inline'; 
           style-src 'self' 'unsafe-inline'; 
           connect-src 'self' http://localhost:3456 ws://localhost:3456; 
           img-src 'self' data:; 
           font-src 'self' data:;" />
```

---

### 🟢 问题 11：HashRouter vs BrowserRouter

**现象**：页面刷新后 404 或路由不工作。

**原因**：`file://` 协议不支持 HTML5 History API（BrowserRouter 依赖）。

**修复方法**：使用 `HashRouter` 替代 `BrowserRouter`：
```tsx
import { HashRouter } from 'react-router-dom';
// 而不是 import { BrowserRouter } from 'react-router-dom';
```

---

### 🟢 问题 12：API 请求 base URL

**现象**：Electron 中 API 请求发送到错误地址。

**原因**：Web 版使用 Vite proxy，Electron 需要直接连接 localhost。

**修复方法**：创建统一的 `api.ts` 封装：
```ts
const API_BASE = 'http://localhost:3456';
export function apiFetch(path: string, options?: RequestInit) {
  return fetch(`${API_BASE}${path}`, options);
}
```

---

### 🟢 问题 13：pnpm exec vs npx 命令差异

**现象**：`npx electron-builder` 运行了非预期的版本。

**原因**：`npx` 可能使用全局缓存或 PATH 中的版本，而非 `node_modules` 本地版本。

**修复方法**：始终使用 `pnpm exec` 替代 `npx`：
```bash
# ✅ 正确
pnpm exec tsup
pnpm exec electron-builder --win --x64

# ❌ 错误
npx tsup
npx electron-builder --win --x64
```

---

### 🟡 问题 14：Express 子依赖（body-parser 等）asar 打包遗漏

**现象**：
```
Error: Cannot find module 'body-parser'
Require stack: ...\app.asar\node_modules\express\lib\express.js
```

**原因**：`express` 在 tsup 中声明为 external，但 pnpm 将其 20+ 个子依赖提升到根 `.pnpm` 目录。electron-builder 打包 asar 时，未被显式声明的提升子依赖可能遗漏。

**当前修复**：将 `body-parser` 显式加入 `package.json` dependencies：
```json
"body-parser": "^1.20.0"
```

**潜在风险**：Express 还有 20+ 个子依赖（accepts, content-disposition, finalhandler, send, serve-static, type-is 等），后续可能逐个暴露。**如再次出现类似错误，考虑将所有外部包的子依赖批量加入**。

**教训**：pnpm + electron-builder 组合下，关键外部包的子依赖必须显式声明或确保在打包文件范围内。

---

### 🟡 问题 15：Express depd 子依赖缺失（问题 14 的连锁反应）

**现象**：
```
Error: Cannot find module 'depd'
Require stack: ...\app.asar\node_modules\express\lib\express.js
```

**原因**：修复问题 14（加了 `body-parser`）后，Express 加载到下一个子依赖 `depd` 时又报缺失。说明 Express 的 30 个子依赖在 asar 打包中均不可靠。

**修复方法**：一次性将 Express 4.22.2 的全部 30 个直接依赖显式加入 `package.json`（见问题 16）。

**教训**：修复 pnpm 子依赖问题时，不要逐个加——**批量分析完整依赖树，一次性全部加入**。

---

### 🟡 问题 16：Express 全部 30 个子依赖批量缺失

**现象**：Express 的 30 个直接依赖逐个暴露（先 body-parser → depd → 预期还有 content-type, http-errors 等）。

**原因**：pnpm 将所有 Express 子依赖提升到根 `.pnpm` 目录，electron-builder 的 `node_modules/**/*` 规则虽然理论上包含所有内容，但 pnpm 的特殊目录结构可能导致部分深层依赖未被正确遍历打包。

**修复方法**：`package.json` dependencies 中显式声明 Express 全部 30 个直接依赖：

```json
"accepts": "^1.3.8",
"array-flatten": "^1.1.1",
"body-parser": "^1.20.0",
"content-disposition": "^0.5.4",
"content-type": "^1.0.4",
"cookie": "^0.7.1",
"cookie-signature": "^1.0.6",
"debug": "^2.6.9",
"depd": "^2.0.0",
"encodeurl": "^1.0.2",
"escape-html": "^1.0.3",
"etag": "^1.8.1",
"finalhandler": "^1.2.0",
"fresh": "^0.5.2",
"http-errors": "^2.0.0",
"merge-descriptors": "^1.0.1",
"methods": "^1.1.2",
"on-finished": "^2.4.1",
"parseurl": "^1.3.3",
"path-to-regexp": "^0.1.7",
"proxy-addr": "^2.0.7",
"qs": "^6.11.0",
"range-parser": "^1.2.1",
"safe-buffer": "^5.2.1",
"send": "^0.18.0",
"serve-static": "^1.15.0",
"setprototypeof": "^1.2.0",
"statuses": "^2.0.1",
"type-is": "^1.6.18",
"utils-merge": "^1.0.1",
"vary": "^1.1.2"
```

**潜在风险（孙子依赖）**：Express 子依赖还有自己的依赖（如 `negotiator`, `mime-types`, `forwarded`, `ipaddr.js`, `ms`, `bytes`, `iconv-lite`, `raw-body`, `unpipe`, `side-channel` 等约 15 个），目前靠 electron-builder 的 `node_modules/**/*` 规则覆盖，**如果后续仍报缺失，可能也需要显式声明**。

**教训**：对于 pnpm + electron-builder 组合，每新增一个 external 的框架级包（express/multer/cors 等），必须同时显式声明其**全部子依赖**。

---

### 🟢 问题 17：win-unpacked 目录文件被锁（Access Denied）

**现象**：
```
⨯ remove d:\...\release\win-unpacked\d3dcompiler_47.dll: Access is denied.
app-builder.exe process failed ERR_ELECTRON_BUILDER_CANNOT_EXECUTE
```

**原因**：
- 上次打包或运行后，`EasyAgent.exe` / `electron.exe` 进程未完全退出
- Windows 文件句柄仍锁住 `win-unpacked` 目录中的 DLL 文件
- electron-builder 打包前需要清理旧的 `win-unpacked`，删除失败导致打包中断

**修复方法**：
1. `taskkill /f /im EasyAgent.exe 2>nul`
2. `taskkill /f /im electron.exe 2>nul`
3. `rmdir /s /q packages\desktop\release` 删除整个旧目录
4. 重新打包

**教训**：打包前**必须**清理进程 + 删除旧 release 目录，不能只杀进程不删目录。建议在 `build.bat` 中自动执行这步。

---

### 🟢 问题 18：CMD 批处理中文编码乱码

**现象**：
```
'输出:' is not recognized as an internal or external command
'��出目录:' is not recognized ...
```

**原因**：CMD 窗口默认编码（GBK）与批处理文件中的 UTF-8 中文不兼容，即使加了 `chcp 65001` 也不稳定。

**修复方法**：批处理文件**全部使用英文**，避免任何中文字符：
```batch
echo   BUILD SUCCESS
echo   Output: packages\desktop\release\
```

**教训**：Windows CMD 批处理脚本中不要使用中文，编码兼容性不可靠。用英文保持稳定。

---

### 🟡 问题 19：Express 孙子依赖 ee-first 缺失

**现象**：
```
Error: Cannot find module 'ee-first'
Require stack: ...\app.asar\node_modules\on-finished\index.js
```

**原因**：`on-finished` 是 Express 的子依赖（已声明），但其子依赖 `ee-first` 未显式声明，在 asar 中遗漏。

**修复方法**：补充 28 个 Express 孙子依赖：
```json
// Express 直接依赖的子依赖（孙子依赖）
"ee-first", "negotiator", "mime-types", "mime-db", "bytes",
"iconv-lite", "raw-body", "inherits", "toidentifier",
"forwarded", "ipaddr.js", "media-typer", "ms", "mime", "unpipe", "destroy"
// qs/side-channel 链路 (18个)
"side-channel", "side-channel-list", "side-channel-map", "side-channel-weakmap",
"call-bound", "get-intrinsic", "call-bind-apply-helpers", "object-inspect",
"es-define-property", "es-errors", "es-object-atoms", "function-bind",
"gopd", "dunder-proto", "get-proto", "has-symbols", "hasown", "math-intrinsics"
```

**教训**：Express 依赖树 = 30 直接 + 28 孙子 = 58 个包，全部显式声明。参见创建的 `express-deps.json` 参考文件。

---

### 🟡 问题 20：Express 孙子依赖 destroy 缺失

**现象**：
```
Error: Cannot find module 'destroy'
Require stack: ...\app.asar\node_modules\body-parser\lib\read.js
```

**原因**：`destroy` 是 `body-parser` 和 `send` 的共用子依赖，问题 19 遗漏了它。

**修复方法**：`package.json` 中加入 `"destroy": "^1.2.0"`。

---

### 🟡 问题 21：Multer 子依赖 busboy 缺失

**现象**：
```
Error: Cannot find module 'busboy'
Require stack: ...\app.asar\node_modules\multer\lib\make-middleware.js
```

**原因**：`multer` 是文件上传中间件，其子依赖 `busboy`, `streamsearch`, `append-field`, `concat-stream` 均未显式声明。

**修复方法**：补充 multer 完整子依赖链：
```json
// multer 直接子依赖
"append-field", "busboy", "concat-stream"
// multer 孙子依赖（concat-stream + busboy + readable-stream）
"buffer-from", "readable-stream", "typedarray",
"core-util-is", "isarray", "process-nextick-args",
"string_decoder", "util-deprecate"
// busboy 子依赖
"streamsearch"
```

**教训**：框架包的子依赖不仅限于直接子依赖，**孙子依赖也必须在 asar 打包中显式声明**。

---

### 🟡 问题 22：Pino 子依赖 split2 缺失

**现象**：`pino-abstract-transport` 依赖 `split2` 和 `readable-stream`，这些未显式声明。

**修复方法**：`package.json` 中加入 `"split2": "^4.2.0"`。

---

### 📋 问题 23：创建 express-deps.json 参考文件

**目的**：避免逐次试错，建立完整的运行时依赖清单。

**文件**：`packages/desktop/express-deps.json`

**内容结构**：
- Express 30 个直接依赖 + 19 个孙子依赖 + 18 个 qs/side-channel 链路
- Pino 11 个子依赖 + split2
- Multer 6 个子依赖链
- Cors 2 个子依赖（`object-assign`, `vary`）
- 分类说明 + 完整依赖列表（90+ 个包）

**使用方式**：新增 external 框架包时，先查此文件。新发现缺失依赖直接追加到文件末尾。

---

### 🔴 问题 24：IPv4/IPv6 不一致导致 API 请求全部失败

**现象**：Desktop Dashboard 统计卡片 `--`，模板显示"加载中..."，而 Web 版本正常。

**根本原因**：
- 后端 `main.ts` 绑定 `127.0.0.1`（纯 IPv4）
- 但 5 个文件硬编码了 `localhost:3456`
- Windows 上 `localhost` 可能解析为 IPv6 `::1`，导致 API/WebSocket 请求全部无法到达后端

**修复的 5 个文件**：
| 文件 | 修改 |
|------|------|
| `api.ts` | `API_BASE` + `WS_BASE` → `127.0.0.1:3456` |
| `index.html` | CSP `connect-src` → `127.0.0.1:3456` |
| `App.tsx` | 私有 `API_BASE` → `127.0.0.1:3456` |
| `chatStore.ts` | WS URL → `ws://127.0.0.1:3456/ws` |
| `Automation.tsx` | WS host → `127.0.0.1:3456` |

**教训**：
- Desktop 中 api.ts / CSP / main.ts 三者的地址必须保持完全一致，都用 `127.0.0.1` 而非 `localhost`
- 全局搜索替换每个直接使用 URL 的文件都要改
- `verify-build.cjs` 现已自动检查此项

---

### 🔴 问题 25：apiFetch 双重 .json() 解析导致数据不显示

**现象**：修复 IPv4/IPv6 后 Dashboard 仍不显示数据（统计 `--`，模板"加载中..."）。

**根本原因**：
- `apiFetch()` 已内部调用 `response.json()` 返回解析后的对象
- 但 Dashboard.tsx 和 ChatInput.tsx 中又调用 `.then((r) => r.json())`
- 第二次 `.json()` 在已解析的对象上报 `TypeError: r.json is not a function`
- 错误被 `.catch(() => {})` 静默吞掉，无任何日志输出

**修复的 3 处**：
| 文件 | 旧代码 | 新代码 |
|------|--------|--------|
| `Dashboard.tsx` /api/status | `.then((r) => r.json()).then((data) => ...)` | `apiFetch<SystemStatus>(url).then((data) => ...)` |
| `Dashboard.tsx` /api/config/templates | `.then((r) => r.json()).then((data) => ...)` | `apiFetch<...>(url).then((data) => ...)` |
| `ChatInput.tsx` /api/providers/all-models | `.then((r) => r.json()).then((data) => ...)` | `apiFetch<...>(url).then((data) => ...)` |

**教训**：
- `apiFetch` 封装已做 JSON 解析，所有调用处直接用 `.then(data => ...)`，不要再调 `.json()`
- `.catch(() => {})` 会静默吞掉所有错误，调试时极难发现
- `verify-build.cjs` 现已自动检查此项

---

## 四、核心配置文件速查

### 4.1 `package.json` 关键字段

```jsonc
{
  "type": "module",                          // ESM 模式
  "main": "./dist/main.js",                  // 主进程入口
  "build": {
    "npmRebuild": false,                       // 跳过原生模块重建
    "asar": true,                              // 启用 asar 打包
    "compression": "maximum",                  // 最大压缩
    "asarUnpack": [                            // asar 外打包
      "node_modules/better-sqlite3/**",
      "node_modules/electron-updater/**"
    ],
    "files": [                                 // 包含文件
      "dist/**/*",
      "assets/**/*",
      "node_modules/**/*",
      "!node_modules/**/*.ts",                 // 排除源码
      "!node_modules/**/*.map",
      "!node_modules/**/__tests__/**"
    ],
    "nsis": {
      "oneClick": false,
      "perMachine": false,
      "allowToChangeInstallationDirectory": true,
      "license": "LICENSE"                     // 需要 assets/LICENSE 存在
    }
  },
  "devDependencies": {
    "electron": "30.0.0",                      // 精确锁定
    "electron-builder": "23.6.0"               // 精确锁定，非 ^23.6.0
  }
}
```

### 4.2 `tsup.config.ts` 关键配置

```ts
export default defineConfig({
  format: ['esm'],                             // ESM 输出
  clean: false,                                // 不清理 dist（保留 Vite 输出）
  external: [
    'electron',                                // Electron 核心
    'better-sqlite3',                         // 原生模块
    'pino', 'pino-pretty',                    // CJS require
    'express', 'cors', 'ws', 'multer',        // Express 生态
    'electron-updater', 'electron-store',      // Electron 插件
  ],
  noExternal: ['@easyagent/core', '@easyagent/server'],  // workspace 包 bundle
  esbuildOptions(options) {
    options.platform = 'node';
    options.target = 'node20';
  },
});
```

### 4.3 `index.html` 规范

```html
<!DOCTYPE html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8" />
    <!-- ⚠️ CSP 必须使用 127.0.0.1 而非 localhost (Windows IPv6 陷阱) -->
    <meta http-equiv="Content-Security-Policy" content="default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; connect-src 'self' http://127.0.0.1:3456 ws://127.0.0.1:3456; img-src 'self' data:; font-src 'self' data:;" />
    <title>EasyAgent Desktop - AI编程助手</title>
    <!-- ✅ 使用外部 CSS，不使用 <style> 标签 -->
    <link rel="stylesheet" href="/src/renderer/index.css" />
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/renderer/main.tsx"></script>
  </body>
</html>
```

### 4.4 `index.css` 规范

```css
/* ✅ @import 必须在所有规则之前（注释除外） */
@import url('https://fonts.googleapis.com/css2?...');

/* ✅ 然后才是防止白屏等基础样式 */
html, body, #root { margin: 0; padding: 0; height: 100%; background: #09090b; }

/* ✅ 再然后是 tailwind 指令 */
@tailwind base;
@tailwind components;
@tailwind utilities;
```

---

## 五、打包失败诊断流程图

```
打包失败
  ├── tsup 构建失败？
  │   ├── 检查 tsup.config.ts external/noExternal 配置
  │   ├── 检查 src/main.ts 导入路径
  │   └── 检查 TypeScript 编译错误
  │
  ├── Vite 构建失败？
  │   ├── [vite:html-inline-proxy] → index.html 中有 <style> 标签？
  │   ├── @import 顺序错误 → index.css 中 @import 不在第一行？
  │   └── 模块找不到 → 检查 src/renderer/ 文件完整性？
  │
  ├── electron-builder 打包失败？
  │   ├── Plugin not found: EnVar → electron-builder 是 v24.0.0？
  │   │   → 删除 node_modules 中 v24 包，锁回 23.6.0
  │   ├── LICENSE not found → assets/LICENSE 存在？
  │   ├── better-sqlite3 编译失败 → npmRebuild 设为 false？
  │   ├── asar 写入失败 / Access Denied → 进程锁？release 目录残留？
  │   │   → taskkill EasyAgent+electron + rmdir release 目录
  │   ├── EXE 仅 0.3MB → NSIS 编译未完成就退出了
  │   ├── pino 子依赖缺失 → package.json 中 11 个子依赖完整？
  │   ├── Express 子依赖缺失 → 30 个直接 + 28 个孙子依赖全部显式声明？
  │   └── Multer/cors 子依赖缺失 → instanceof express-deps.json？
  │
  └── 运行时崩溃？
      ├── CSP 违规 → index.html CSP 含 127.0.0.1:3456？（不是 localhost）
      ├── API 请求失败 → 使用 apiFetch 而非 fetch？localhost 改为 127.0.0.1 了吗？
      ├── 数据不显示(无报错) → apiFetch 后是否又调了 .json()？(问题 25)
      ├── Dashboard -- / 模板加载中 → 同上双重 .json() 或 IPv4/IPv6 不一致(问题 24/25)
      ├── 路由不工作 → 使用 HashRouter？
      ├── pnpm symlink → noExternal 包含了 core/server？
      ├── better-sqlite3 找不到 → asarUnpack + 原生模块路径？
      ├── Cannot find module 'xxx' → 查 express-deps.json 是否遗漏
      ├── body-parser/depd/http-errors → 问题 14/15/16
      ├── ee-first/destroy → 问题 19/20
      └── busboy/streamsearch/readable-stream → 问题 21/22
```

---

## 六、版本变更历史

| 日期 | 版本 | electron-builder | 结果 | 备注 |
|------|------|-----------------|------|------|
| 2026-06-18 | 0.2.0 | 23.6.0 | ✅ 85.7MB | 首次打包成功 |
| 2026-06-20 上午 | 0.2.0 | 24.0.0(意外) | ❌ 0.3MB | v24 EnVar 插件缺失 |
| 2026-06-20 下午 | 0.2.0 | 23.6.0(锁定) | ✅ 86.7MB | 修复 13 问题后重新打包 |
| 2026-06-20 14:41 | 0.2.0 | 23.6.0 | ❌ body-parser缺失 | 问题14: Express子依赖遗漏 |
| 2026-06-20 14:48 | 0.2.0 | 23.6.0 | ❌ depd缺失 | 问题15: 连锁反应 |
| 2026-06-20 14:49 | 0.2.0 | 23.6.0 | ❌ win-unpacked锁 | 问题17: 进程残留 |
| 2026-06-20 14:53 | 0.2.0 | 23.6.0 | ✅ 成功 | 修复 18 个问题后打包成功 |
| 2026-06-20 14:55-15:00 | 0.2.0 | 23.6.0 | ❌❌❌ | 问题19-22: 孙子依赖连环缺失 |
| 2026-06-20 15:00 | 0.2.0 | 23.6.0 | ✅ 成功 | 补全 90+ 依赖后打包成功 |
| 2026-06-20 16:09 | 0.2.0 | 23.6.0 | ❌ Dashboard空 | 问题24: localhost→127.0.0.1 5文件 |
| 2026-06-20 16:16 | 0.2.0 | 23.6.0 | ❌ 仍然空 | 问题25: 双重.json() 静默失败 |
| 2026-06-20 16:29 | 0.2.0 | 23.6.0 | ✅ 成功 | 修复 25 个问题 + 标准化流水线 v1.3 |
| 2026-06-20 20:22 | 0.3.0 | 23.6.0 | ✅ 成功 | 版本控制系统上线 + 仓库修正 + 文档全量更新 |

---

## 七、黄金法则

1. **版本精确锁定**：electron、electron-builder、vite 全部去掉 `^`/`~`
2. **预编译原生模块**：better-sqlite3 预编译 + npmRebuild: false
3. **pnpm workspace 打包**：noExternal 包 + external 原生模块
4. **pnpm exec 而非 npx**：确保使用本地版本
5. **打包前清理进程+目录**：taskkill EasyAgent+electron + rmdir release (build.bat 自动执行)
6. **HTML 不用 `<style>`**：全部外部 CSS
7. **CSS @import 置顶**：在所有其他规则之前
8. **文件引用必须存在**：LICENSE, icon.ico, installer.nsh 等
9. **CSP/API 统一用 127.0.0.1**：不用 localhost (Windows IPv6 陷阱)
10. **HashRouter 不用 BrowserRouter**：适配 file:// 协议
11. **external 框架的子依赖全声明**：Express 58 个, pino 13 个, multer 6 个, cors 2 个
12. **批处理纯英文**：CMD 中文编码不可靠, 全英文最稳定
13. **项目根放 build.bat**：双击一键, 包含清理→预检查→构建→打包→验证全流程
14. **创建 express-deps.json**：避免重复试错，一次性建立完整依赖清单
15. **孙子依赖也必须声明**：30 个直接子依赖不够，28 个孙子依赖也要加
16. **apiFetch 已解析 JSON**：调用处直接用 `.then(data => ...)`，禁止再调 `.json()`
17. **每次修改源码后清理 dist/renderer**：避免 Vite 缓存旧文件 (build.bat 自动执行)
18. **构建前运行 verify-build.cjs**：自动检查 20+ 项已知问题 (build.bat 自动执行)
