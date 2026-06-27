# CORS 修复深度复盘 — 编译链路与"假成功"陷阱

> **日期**: 2026-06-26  
> **涉及模块**: `packages/server`, `packages/desktop`, `better-sqlite3`, `electron-builder/asar`  
> **修复次数**: 4 次尝试，其中 3 次为假成功  
> **ROI 分析**: 一个 CORS 白名单回调，因编译链路复杂性，耗时 ~2h 排查

---

## 一、问题背景

2026-06-24 代码审查中将 CORS 从"完全开放（`origin: '*'`）"标记为 🔴 阻塞级漏洞，要求改为受控白名单。实现后发现 Desktop 版（Electron `loadFile()`）的 `Origin: null` 被拒绝，前端显示"无法连接到后端服务"。

---

## 二、编译链路全景图

这就是为什么改一个 CORS 配置需要动这么多东西：

```
┌──────────────────────────────────────────────────────────────┐
│                    TypeScript 源码层                           │
│                                                              │
│  packages/server/src/index.ts  ← CORS 逻辑修改点             │
│       │                                                      │
│       │  import { createApp } from '@easyagent/server'       │
│       ▼                                                      │
│  packages/desktop/src/main.ts  ← Electron 主进程入口          │
│       │                                                      │
└───────┼──────────────────────────────────────────────────────┘
        │
        │  tsup (bundler — 关键！)
        │
        ▼
┌──────────────────────────────────────────────────────────────┐
│               tsup 编译产物层 (dist/)                          │
│                                                              │
│  ┌─ packages/server/dist/index.js ─────────────────────────┐ │
│  │  大小: ~625 KB                                           │ │
│  │  来源: tsup 打包 server/src/index.ts + 依赖              │ │
│  │  包含: cors() 回调 + corsEnv 逻辑                        │ │
│  │  发布到: node_modules/@easyagent/server/dist/index.js   │ │
│  └──────────────────────────────────────────────────────────┘ │
│                                                              │
│  ┌─ packages/desktop/dist/main.js ─────────────────────────┐ │
│  │  大小: ~1.2 MB                                           │ │
│  │  来源: tsup 打包 desktop/src/main.ts + **内联 server 码**  │ │
│  │  🔴 关键: tsup 将 createApp() 的整个 server 代码打入     │ │
│  │     main.js，包括**另一份 cors() 中间件**                │ │
│  └──────────────────────────────────────────────────────────┘ │
│                                                              │
│  ┌─ packages/desktop/dist/renderer/ ────────────────────────┐ │
│  │  前端 React 应用 (Vite build)                            │ │
│  │  index.html + assets/index-xxx.js + index-xxx.css        │ │
│  └──────────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────┘
        │
        │  electron-builder (asar 打包)
        │
        ▼
┌──────────────────────────────────────────────────────────────┐
│                 app.asar 归档内容                              │
│                                                              │
│  dist/                                                        │
│  ├── main.js        ← 🔴 CORS 配置 #1 (TS内联, 1.2 MB)      │
│  ├── preload.js                                              │
│  └── renderer/                                               │
│      ├── index.html  (CSP: connect-src 127.0.0.1:3456)       │
│      └── assets/                                             │
│          └── index-xxx.js (fetch 发送 Origin: null)           │
│                                                              │
│  node_modules/                                                │
│  └── @easyagent/                                             │
│      └── server/                                             │
│          └── dist/index.js  ← 🔴 CORS 配置 #2 (包发布, 625 KB)│
│                                                              │
│  package.json  ← "main": "dist/main.js"                      │
└──────────────────────────────────────────────────────────────┘
```

### 关键发现：两份 CORS 代码，一份生效

| 位置                                                  | 代码来源              | 大小   | 是否生效                                 |
| ----------------------------------------------------- | --------------------- | ------ | ---------------------------------------- |
| `asar://dist/main.js`                                 | tsup 内联 server 源码 | 1.2 MB | **✅ 是** — `package.json.main` 指向此处 |
| `asar://node_modules/@easyagent/server/dist/index.js` | pnpm workspace 发布   | 625 KB | ❌ 否 — 被 main.js 覆盖                  |

**为什么有两份？** Electron 主进程 `main.ts` 通过 `import { createApp } from '@easyagent/server'` 引入 server，tsup 打包时**内联了整个 server 包**（含 `cors()` 配置），导致 asar 中同时存在两份 CORS 中间件代码。

---

## 三、"假成功" 陷阱全景（4 次尝试）

### 尝试 #1：只修改 server 包 ❌ 假成功

| 步骤 | 操作                                                                       | 结果         | 为什么是"假成功"                                              |
| ---- | -------------------------------------------------------------------------- | ------------ | ------------------------------------------------------------- |
| 1    | 修改 `packages/server/src/index.ts` CORS 逻辑                              | ✅ 代码正确  | —                                                             |
| 2    | `cd packages/server && npx tsup --clean`                                   | ✅ 编译成功  | —                                                             |
| 3    | 验证 `packages/server/dist/index.js` 含 `corsEnv`                          | ✅ 确认      | —                                                             |
| 4    | 提取 asar → 替换 `node_modules/@easyagent/server/dist/index.js` → 重新打包 | ✅ asar 生成 | 🔴 **asar 中还有 `dist/main.js`，里面的旧 CORS 会覆盖新代码** |

**假成功信号**: asar 重新打包成功，但实际运行仍使用 `dist/main.js` 中的旧 CORS 逻辑。

**为什么容易被骗**: 直觉上"改 server 源码 → 编译 server dist → 替换 asar 中的 server 包"逻辑自洽。但忽略了 tsup 在编译 desktop 时内联了 server 代码。

---

### 尝试 #2：better-sqlite3 重建 ❌ 假成功

| 步骤 | 操作                                                  | 结果                  | 为什么是"假成功"                                                             |
| ---- | ----------------------------------------------------- | --------------------- | ---------------------------------------------------------------------------- |
| 1    | `npx node-gyp rebuild --target=30.0.0 ...`            | exitCode 0            | 🔴 **pnpm 硬链接环境下，rebuild 输出到 store 目录，而非当前工作副本**        |
| 2    | 检查文件大小                                          | 1,755,136 (没变)      | 🔴 **实际仍需 NVM 137，不是需要的 123**                                      |
| 3    | `npx @electron/rebuild --force --only=better-sqlite3` | 声称成功              | 🔴 **electron-rebuild 在 pnpm 符链环境下找不到正确路径，静默跳过**           |
| 4    | node require 测试                                     | "loaded successfully" | 🔴 **当前 node 是 NVM 137，二进制匹配 → 显示成功；但 Electron 需要 NVM 123** |

**假成功信号**: 命令 exit 0、输出 "loaded successfully"。

**为什么容易被骗**: 系统 Node 和 Electron Node 版本不同（v24 vs v20），同一个二进制对前者合法对后者非法。用系统 Node 测试通过 ≠ Electron 能加载。

---

### 尝试 #3：asar 提取 + 替换 server 包 ✅→❌ 部分成功

| 步骤 | 操作                                                | 结果                              | 为什么是"部分假成功"                             |
| ---- | --------------------------------------------------- | --------------------------------- | ------------------------------------------------ |
| 1    | 提取 asar                                           | ✅ 提取成功                       | —                                                |
| 2    | 替换 `node_modules/@easyagent/server/dist/index.js` | ✅ 替换成功                       | —                                                |
| 3    | 重新打包 asar                                       | ✅ 打包成功                       | —                                                |
| 4    | API 测试: `Origin: null` → ACAO 检查                | ❌ 仍返回 `http://127.0.0.1:3456` | 🔴 **asar 中 `dist/main.js` 的旧 CORS 仍在运行** |

**假成功信号**: asar 操作成功、API 有响应，但 CORS 行为未变。

**为什么容易被骗**: 替换了自以为"唯一"的 CORS 配置点，但因为 main.js 中还有一份内联的旧代码，旧的覆盖了新的。

---

### 尝试 #4：重编译 desktop + 完整替换 ✅ 真正解决

| 步骤 | 操作                                                                             | 结果                         |
| ---- | -------------------------------------------------------------------------------- | ---------------------------- |
| 1    | `cd packages/desktop && npx tsup --clean`                                        | ✅ 编译成功，main.js 1.19 MB |
| 2    | 验证 main.js 含 `corsEnv`                                                        | ✅ 确认                      |
| 3    | 提取 asar → 替换 `dist/main.js` + `node_modules/@easyagent/server/dist/index.js` | ✅ 双重替换                  |
| 4    | 重新打包 asar                                                                    | ✅ 打包成功，4.1 MB          |
| 5    | API 测试: `Origin: null`                                                         | ✅ ACAO 返回 `"null"`        |

---

## 四、假成功根因分析

### 假成功类型 #A：命令成功 ≠ 文件变更

```
node-gyp rebuild → exitCode 0
    ↓
文件时间戳未变 / 文件大小未变 / NVM 版本未变
    ↓
原因: pnpm hardlink → 重建的是 store 副本，当前路径仍是旧文件
```

### 假成功类型 #B：环境匹配 ≠ 目标环境匹配

```
node -e "require('better_sqlite3.node')" → OK
    ↓
系统 Node v24 (NVM 137) 匹配 → 但 Electron Node v20 (NVM 123) 不匹配
    ↓
原因: 用系统环境测试 Electron 专用二进制
```

### 假成功类型 #C：单点修复 ≠ 全链路修复

```
修改 server/src/index.ts → 编译 → 打包 asar
    ↓
asar 内有两处 CORS 代码，只更新了一处
    ↓
原因: 不了解 tsup 内联行为
```

### 假成功类型 #D：asar 操作成功 ≠ 内容正确

```
提取 asar → 替换文件 → 重新打包 → 生成 asar
    ↓
被替换的不是实际生效的文件
    ↓
原因: 对 asar 内部文件优先级 (main.js > node_modules) 不了解
```

---

## 五、验证方法论 — 如何避免假成功

### 必须执行的 5 级验证

```
L1: 源码                                    ← 肉眼 review
L2: 本地编译产物 (dist/*.js)                 ← 检查关键字符串
L3: pnpm store 同步 (node_modules/.pnpm)    ← 确认硬链接指向
L4: asar 内容                               ← 提取后检查组串
L5: 运行中 API 行为                          ← HTTP 探测 + 头检查
```

**不能停留在任何一级**。每级通过 ≠ 下一级通过。

### 真实验证 vs 假阳性信号

| 假阳性信号                     | 为什么不可靠              | 真实验证应该怎么做                                     |
| ------------------------------ | ------------------------- | ------------------------------------------------------ |
| `node-gyp rebuild → 0`         | pnpm hardlink 分离        | 检查文件 mtime+大小，确认 NVM 版本匹配                 |
| `electron-rebuild → succeeded` | pnpm 下静默跳过           | 直接使用 node-gyp + 验证二进制 NVM 值                  |
| `node require() → OK`          | 系统 Node ≠ Electron Node | 必须在 Electron 中加载或检查 NVM 头                    |
| asar 打包成功                  | 内容可能还是旧的          | 提取 asar 后检查组串 + 运行 API 探测                   |
| API 返回 200                   | CORS 头可能仍错误         | 带上 `Origin: null` 检查 `Access-Control-Allow-Origin` |
| 进程启动无崩溃                 | 前端可能静默失败          | 检查 Electron 内 fetch 是否成功                        |

---

## 六、CORS 地址绑定机制最终版

### 两级策略（当前生效版本）

```
精确模式 (CORS_ORIGIN 环境变量已设置):
  origin === CORS_ORIGIN值 → 允许
  否则 → 拒绝 "Not allowed by CORS"

默认模式 (未设 CORS_ORIGIN):
  origin 为 null → 允许 (Electron Desktop file://)
  origin 以 http://127.0.0.1 开头 → 允许 (本地服务/Vite)
  origin 以 http://localhost 开头 → 允许 (开发备选)
  其他 → 拒绝
```

### 验证命令

```bash
# 快速验证 (需 EasyAgent 已启动)
node -e "var http=require('http');http.get('http://127.0.0.1:3456/api/health',{headers:{'Origin':'null'}},function(r){var d='';r.on('data',function(c){d+=c});r.on('end',function(){var acao=r.headers['access-control-allow-origin'];console.log('ACAO:',JSON.stringify(acao));console.log(acao==='null'?'PASS':'FAIL')})})"
```

**预期输出**: `ACAO: "null"` → `PASS`

---

## 七、已知修复历史（完整）

| 日期     | 尝试      | 问题                        | 修复                                                                       | 是否生效                    |
| -------- | --------- | --------------------------- | -------------------------------------------------------------------------- | --------------------------- |
| 06-24    | 初始      | CORS 完全开放               | 添加 `CORS_ORIGIN` + 默认白名单                                            | ✅                          |
| 06-26 #1 | 假成功    | Desktop Origin:null 被拒    | server CORS 改为回调，只替换 asar 中 server 包                             | ❌ main.js 中旧代码覆盖     |
| 06-26 #2 | 假成功    | better-sqlite3 NVM 不匹配   | node-gyp/electron-rebuild 重建                                             | ❌ pnpm 硬链接 + 环境不匹配 |
| 06-26 #3 | 部分成功  | 同 #1                       | asar 热更新 server 包 + 修补 main.js                                       | ⚠️ desktop main 未重编译    |
| 06-26 #4 | ✅ 真成功 | 根因: dual-CORS + tsup 内联 | `tsup --clean` 重编译 desktop + 完整替换 asar 内 main.js + server/index.js | ✅                          |

---

## 八、教训与规则

### 🔴 强制性规则

1. **修改与 @easyagent/server 有关的源码后，必须同时重新 `tsup --clean` 两个包**：
   - `packages/server` — 更新发布包
   - `packages/desktop` — tsup 内联 server 到 main.js，必须重编

2. **二进制模块重建必须验证 NVM 值**，不能只看 exitCode 或文件是否存在：

   ```js
   // 检查 better_sqlite3.node 的 NODE_MODULE_VERSION
   const buf = fs.readFileSync('better_sqlite3.node');
   const nvm123 = buf.indexOf(Buffer.from([123, 0, 0, 0]));
   const nvm137 = buf.indexOf(Buffer.from([137, 0, 0, 0]));
   // Electron 30.x 需要 NVM 123
   ```

3. **asar 修改后必须提取验证**，不能假设重新打包的内容正确：

   ```bash
   npx @electron/asar extract app.asar _check/
   # 确认 _check/dist/main.js 和 _check/node_modules/@easyagent/server/dist/index.js 均已更新
   ```

4. **CORS 修复必须用 `Origin: null` 头验证**，单纯 HTTP 200 不代表正确处理了 CORS。

### 📊 陷阱登记（追加到 MEMORY.md）

此事件新发现/确认的陷阱：

- **陷阱 #31**: 🖥️ **tsup 内联 server 代码导致 asar 双重 CORS** — desktop main.js 内联了 server 的 cors()，asar 中同时存在两份 CORS 中间件，main.js 中的覆盖 node_modules 中的
- **陷阱 #32**: 🖥️ **pnpm 硬链接下 node-gyp rebuild 假成功** — rebuild 输出到 store 目录，当前路径未变，需检查文件 mtime+大小+NVM 值
- **陷阱 #33**: 🖥️ **electron-rebuild 在 pnpm 下静默跳过** — 命令声称成功但实际未修改任何文件

---

> **最后更新**: 2026-06-26 02:14  
> **作者**: AI + 用户协作  
> **相关文档**: `03_测试案例文档.md` §3.32, `05_Desktop_EXE打包标准流程.md`
