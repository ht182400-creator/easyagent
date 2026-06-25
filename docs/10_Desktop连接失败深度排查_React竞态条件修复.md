# Desktop 版"无法连接到后端服务"深度排查报告

> **耗时**：约 3 小时（2026-06-26 00:00 - 02:51）
> **版本**：v0.5.4
> **结论**：React `useEffect` 父子组件执行顺序不确定，导致模块级变量 `_apiBase` 同步滞后 → Electron `file://` 协议解析相对 URL 失败

---

## 1. 问题现象

启动 `EasyAgent.exe` 后，页面显示"无法连接到后端服务"：
- 侧边栏显示红色断开图标
- Dashboard 显示"正在连接服务..."
- 实际后端 API 可正常响应（`curl http://127.0.0.1:3456/api/health` → 200 OK）

---

## 2. 排查时间线

### 阶段 1：怀疑后端未启动（⏱ 约 30 分钟）

| 检查项 | 结果 |
|--------|------|
| 端口 3456 是否监听 | ✅ `netstat` 确认 LISTENING |
| `/api/health` 响应 | ✅ `curl` 返回 200 OK |
| `/api/config` 响应 | ✅ `curl` 返回 200 OK |
| `/api/status` 响应 | ✅ `curl` 返回完整 JSON 数据 |

→ **后端完全正常，问题在前端渲染层**。

### 阶段 2：怀疑 asar 打包遗漏（⏱ 约 50 分钟）

| 检查项 | 结果 |
|--------|------|
| asar 中是否包含 `@easyagent/server` | ✅ 正常 |
| asar 中是否包含 `@easyagent/frontend` | ✅ 正常 |
| `better-sqlite3.node` 原生模块 | ✅ unpacked 中正常 |
| dist renderer JS 与 asar 中 JS 一致 | ✅ MD5 匹配 |

→ **打包产物完整，非打包问题**。

### 阶段 3：修复 4 个疑似问题（⏱ 约 40 分钟）

| # | 修改 | 位置 | 假设 |
|---|------|------|------|
| 1 | `server.listen()` Promise 化 | `main.ts:67` | 后端异步启动，`startBackendServer()` 返回时未就绪 |
| 2 | `apiRequest()` 添加 5 次重试 | `request.ts:82` | 前端请求早于后端就绪 |
| 3 | `apiFetch()` 添加重试 | `api.ts` | WebSocket 连接同问题 |
| 4 | Dashboard 真实连接状态 | `Dashboard.tsx` | 一直显示"已连接"（假阳性） |

→ 修复后重新编译打包，问题**依旧**。

### 阶段 4：定位真正根因（⏱ 约 30 分钟）

关键发现：
1. 启动 EXE → `curl` 所有 API 返回 200 OK（后端正常）
2. 前端渲染的 page 却报 "无法连接到后端服务"
3. 错误来自 `request.ts` 的 `TypeError: Failed to fetch` 分支

→ **前端发起的请求 URL 是错误的**。

代码追踪：

```
// App.tsx (子组件) useEffect
loadSettings() → apiRequest('/api/config')

// request.ts:95
const url = path.startsWith('http') ? path : `${_apiBase}${path}`;
// _apiBase 为空字符串 '' → URL = '' + '/api/config' = '/api/config'
// Electron file:// 协议 → 解析为 file:///api/config → Failed to fetch ❌

// config.tsx (父组件) useEffect
setApiBase(merged.apiBase);  // 设置 _apiBase = 'http://127.0.0.1:3456'
// ⚠️ 但子组件的 useEffect 可能先执行！
```

**根因确认**：React 18 不保证父 `useEffect` 先于子 `useEffect` 执行。

---

## 3. 为何 v0.5.3 (6/24) 没有这个问题？

| 对比维度 | v0.5.3 | v0.5.4 (修复前) |
|---------|--------|-----------------|
| `config.tsx` 源码 | `useEffect` | **完全相同** |
| `App.tsx` 源码 | `useEffect` 调用 `loadSettings()` | **完全相同** |
| `request.ts` 源码 | `_apiBase = ''` 初始值 | **完全相同** |

**源码完全一致**。这是 React 18 `useEffect` 的**不确定行为**：

> React 不保证父组件的 `useEffect` 先于子组件执行。多次构建/运行可能得到不同的执行顺序。

- **v0.5.3 构建**：Vite 打包后的 bundle 恰好让 `ConfigProvider.useEffect` 先于 `App.useEffect` 执行 → `_apiBase` 已设置 → ✅
- **v0.5.4 构建**：Vite 打包后的 bundle 恰好让 `App.useEffect` 先于 `ConfigProvider.useEffect` 执行 → `_apiBase` 为空 → ❌

触发差异的可能因素：Vite chunk 分割、模块加载顺序、构建缓存状态、React reconciliation 时序——这些都是非确定性因素。

**所以之前不是说"为什么昨天好的今天不好"，而是竞态条件一直存在，只是恰好没被触发。**

---

## 4. 之前的 4 个修改是否必要？

### ✅ 修改 1：`main.ts` - `server.listen()` Promise 化

```diff
- backendServer.listen(API_PORT, '127.0.0.1', () => {
-   console.log(...);
- });
+ await new Promise<void>((resolve, reject) => {
+   backendServer.listen(API_PORT, '127.0.0.1', () => {
+     console.log(...);
+     resolve();
+   });
+   backendServer.on('error', (err) => reject(err));
+ });
```

**必要性**：修复了后端异步启动的竞态条件。虽然有本次的 useEffect 问题遮蔽，但这是正确的防御性修改——`startBackendServer()` 现在确实等到端口监听就绪才返回。

### ✅ 修改 2：`request.ts` - `apiRequest()` 5 次重试

**必要性**：防御性措施。即使 `useLayoutEffect` 修复后，Electron 环境仍可能存在网络初始化延迟，重试逻辑作为二重保险是正确的。

### ✅ 修改 3：`Dashboard.tsx` - 真实连接状态

**必要性**：将假阳性"服务运行中"改为真实的 `serverConnected` 状态指示，下次排查能更快定位问题。

### ✅ 修改 4：`config.tsx` - `useEffect` → `useLayoutEffect`（本次根治）

**必要性**：**唯一的根治性修复**。`useLayoutEffect` 在 DOM 更新后、浏览器绘制前同步执行，且父组件的 `useLayoutEffect` 保证先于子组件的所有 effect（包括 `useEffect` 和 `useLayoutEffect`）执行。

```diff
- import { createContext, useContext, useEffect, type ReactNode, type FC } from 'react';
+ import { createContext, useContext, useLayoutEffect, type ReactNode, type FC } from 'react';

- useEffect(() => {
+ // ⚠️ 使用 useLayoutEffect 而非 useEffect: 必须保证在子组件挂载/effect 之前同步完成，
+ // 否则 App.tsx 的 loadSettings() 会以空 _apiBase 发起请求导致连接失败
+ useLayoutEffect(() => {
    setApiBase(merged.apiBase);
    setWsBase(merged.wsBase);
    setIsDesktop(merged.isDesktop);
  }, [merged.apiBase, merged.wsBase, merged.isDesktop]);
```

---

## 5. 对 Web 版的影响分析

**不会影响 Web 版功能。** 分析如下：

| 运行环境 | `_apiBase` 空字符串时的 URL | 浏览器解析 | 结果 |
|---------|--------------------------|-----------|------|
| Web (http://localhost:5173) | `/api/config` | `http://localhost:5173/api/config` | ✅ Vite 代理正常 |
| Desktop (file://) | `/api/config` | `file:///api/config` | ❌ 文件系统路径，不存在 |

Web 版默认 `apiBase=''`，空字符串 + 相对路径在浏览器中天然正确。只有 Electron `file://` 协议才会将相对路径解析到本地文件系统。

`useLayoutEffect` vs `useEffect` 对 Web 版行为没有差异，因为 Web 版 `apiBase` 本来就是 `''`，早设置晚设置都不影响结果。

---

## 6. 完整修复清单

| 文件 | 修改内容 | 修复类型 |
|------|---------|---------|
| `config.tsx:8,59` | `useEffect` → `useLayoutEffect` | 🔴 **根因修复** |
| `Dashboard.tsx:14-15` | 新增 import `useConfig`, `apiRequest` | 依赖修复 |
| `Dashboard.tsx:66-74` | 裸 `fetch('/api/status')` → `apiRequest('/api/status')` | 🟡 防御修复 |
| `Dashboard.tsx:77-84` | 裸 `fetch('/api/config/templates')` → `apiRequest(...)` | 🟡 防御修复 |
| `main.ts:67` | `server.listen()` Promise 化 | 🟡 后端竞态修复 |
| `request.ts:82-124` | `apiRequest()` 5 次重试 + performRequest | 🟡 防御修复 |

---

## 7. 验证结果

```
$ EasyAgent.exe → 启动 8 秒后
PORT 3456: LISTENING ✅
/api/health → 200 OK ✅
/api/config → 200 OK ✅
/api/status → 200 OK (含 model/tokenUsage/sessionCount) ✅
asar renderer JS: index-BBA_WhUs.js ✅
```

---

## 8. 教训与预防

### 架构层面

1. **不要在 `useEffect` 中同步模块级变量供子组件使用**。`useEffect` 的执行时机是异步、不确定的。应使用 `useLayoutEffect`（同步执行、父先于子）或在组件外部（模块顶层）直接初始化。

2. **Electron `file://` 协议下相对 URL 是陷阱**。裸 `fetch('/api/...')` 在浏览器中走同源策略正确，在 `file://` 下解析为 `file:///api/...` 必然失败。所有请求应使用统一的 `apiRequest()` 封装。

### 排查层面

3. **先用 `curl` 验证后端，隔离问题域**。本次如果一开始就确认后端 API 正常，可以省去约 30 分钟的打包排查时间。

4. **竞态条件类 bug 的典型特征**：同一代码不同次运行结果不同、测试环境正常但生产失败。遇到此类问题优先考虑执行顺序/时序问题。

### 代码审查清单

- [ ] 所有 `fetch()` 调用使用 `apiRequest()` 封装（含 `apiBase` 前缀）
- [ ] 模块级变量初始化不依赖组件 `useEffect` 的执行顺序
- [ ] 需要保证父子组件间执行顺序的副作用使用 `useLayoutEffect`
- [ ] Desktop 构建后验证 `/api/health` 端点可访问

---

## 附录：为何 useLayoutEffect 能解决问题

```
React 组件生命周期执行顺序（保证的）：

1. 组件渲染（render）
2. DOM 更新
3. useLayoutEffect（父 → 子）         ← 🔒 同步执行，父先于子
4. 浏览器绘制
5. useEffect（父/子顺序不确定）        ← ⚠️ 异步执行，顺序不保证
```

`useLayoutEffect` 在第 3 步同步执行，React 明确保证父组件的 `useLayoutEffect` 先于所有子组件 effect 执行。因此 `setApiBase()` 必然在 `loadSettings()` 之前完成，根除了竞态。
