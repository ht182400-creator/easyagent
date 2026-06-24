# EasyAgent 批次 B 代码审查报告

**批次**：B — P1-2 交付（v0.4.0 + CI/CD + 前端合并）  
**审查范围**：
- `.github/workflows/ci.yml` — CI 流水线
- `.github/workflows/release.yml` — 构建与发布流水线
- `packages/frontend/` — 统一前端包（13 stores + 组件 + 页面，~25 个文件）
- `packages/web/` — Web 入口（依赖于 frontend 包）

**审查日期**：2026-06-24  
**审查人**：AI Assistant  
**当前版本**：v0.4.1

---

## 总体评估

### 🟠 Request Changes（含 4 个阻塞 + 6 个高危问题）

正面评价：
- ✅ CI/CD 流水线设计合理（test → build → release 三级级联）
- ✅ GitHub Actions 使用 pnpm workspace + MSVC 编译 better-sqlite3，配置正确
- ✅ 前端架构优秀：`packages/frontend`（共享 UI）← `packages/web`（Web 入口），依赖注入模式（ConfigContext）
- ✅ Zustand stores 设计清晰，每个 store 职责单一
- ✅ WebSocket 流式通信 + 虚拟滚动（react-window v2）实现良好
- ✅ `apiFetch` 统一请求封装，提供连接失败友好提示
- ✅ 响应式设计（侧边栏折叠、移动端），深色/亮色主题切换

需修复的核心问题：
- **F1/F7**（阻塞）：Vite 专有 API 泄露 + 死代码
- **F8**（阻塞）：自动化任务用轮询替代 WebSocket 事件
- **F3**（高危）：WebSocket 无自动重连
- **F4/F5**（高危）：多处绕过统一 apiFetch
- **F6**（高危）：插件市场全量 Mock 数据

---

## 🔴 阻塞级问题（4 个）

### B1. CI 流水线缺少前端包构建验证

**位置**：`.github/workflows/ci.yml` L78-108

**问题**：`build-check` job 构建了 core/cli/server/desktop 四个包，但没有构建 `packages/frontend`（`npx vite build`）或 `packages/web`（`npm run build`）。前端代码的编译错误无法被 CI 检测到。

**修复**：在 `build-check` job 的 L103-105 之间插入：
```yaml
      - name: Build frontend
        run: cd packages/web && npm run build
```

**分级**：🔴 阻塞 — CI 覆盖不完整，前端合并后的主要交付物未经构建验证。

---

### F1. `chatStore.ts` 使用 Vite 专有 API `import.meta.env.DEV`

**位置**：`packages/frontend/src/stores/chatStore.ts` L216-219

```typescript
const isDesktop = !!(window as any).easyAgent || window.location.protocol === 'file:';
const defaultUrl = (import.meta.env.DEV || isDesktop)  // ⚠️ Vite 专有
  ? 'ws://127.0.0.1:3456/ws'
  : `${protocol}//${window.location.host}/ws`;
```

**问题**：`import.meta.env.DEV` 是 Vite 在编译时注入的常量。如果 `packages/frontend` 作为 npm 包被 Desktop Electron 项目直接导入（非 Vite 构建环境），TypeScript 会报 `Property 'env' does not exist on type 'ImportMeta'` 错误。

**修复**：
```typescript
// 通过 ConfigContext 传递配置，而非依赖构建工具特定 API
// chatStore 应在 connectWebSocket 时接受 wsUrl 参数, 由调用方决定 WebSocket URL
const defaultUrl = isDesktop
  ? 'ws://127.0.0.1:3456/ws'
  : `${protocol}//${window.location.host}/ws`;
```

或者，在 `FrontendConfig` 接口中增加 `devMode` 字段，由 `ConfigProvider` 注入。

**分级**：🔴 阻塞 — 包跨环境兼容性破坏。

---

### F7. `main.tsx` 中 `useHashRouter` 参数为死代码

**位置**：`packages/frontend/src/main.tsx` L29

```typescript
const Router = useHashRouter ? HashRouter : HashRouter; // 统一使用 HashRouter（兼容性最好）
```

**问题**：三元运算符两侧值完全相同，`useHashRouter` 参数不起任何作用。从注释"统一使用 HashRouter"看是故意的，但参数保留容易误导调用方。

**修复**：要么删除此参数（简化 API），要么保留 `BrowserRouter` 作为备选：
```typescript
import { HashRouter, BrowserRouter } from 'react-router-dom';
// ...
const Router = useHashRouter ? HashRouter : BrowserRouter;
```

**分级**：🔴 阻塞 — 死代码污染公开 API。

---

### F8. `automationStore.runTaskNow` 使用轮询检测任务完成

**位置**：`packages/frontend/src/stores/automationStore.ts` L246-306

```typescript
// 轮询检查任务状态
let attempts = 0;
const maxAttempts = 120; // 最多等 2 分钟
while (attempts < maxAttempts) {
  await new Promise((r) => setTimeout(r, 1000));
  attempts++;
  // ...
  const histRes = await fetch(`/api/automations/history?taskId=${id}&limit=1`);
  // ...
}
```

**问题**：
1. **性能浪费**：120 次 HTTP 请求轮询检测任务完成，在高频任务场景下浪费带宽
2. **时序问题**：1 秒轮询间隔可能导致最多 1 秒延迟才能检测到任务完成
3. **资源泄漏**：如果组件卸载，轮询循环不会被取消（没有 cancellation token）
4. **WebSocket 已有基础设施**：`chatStore` 已有 `handleWSMessage` 支持 `done` 类型消息，应复用 WebSocket 通道接收任务完成事件

**修复**：通过 WebSocket 接收 `automation_done` / `automation_progress` 消息类型，替代轮询。在 `chatStore` 或 `automationStore` 中注册 WebSocket 消息处理：

```typescript
// 在 handleWSMessage 或独立的 automation WS handler 中添加:
case 'automation_done': {
  const { taskId, status, result } = data;
  useAutomationStore.getState().onTaskComplete(taskId, status, result);
  break;
}
```

如果短期内无法迁移，至少应该在 `runTaskNow` 中添加组件卸载时的取消机制。

**分级**：🔴 阻塞 — 架构反模式（轮询替代事件驱动）。

---

## 🟠 高危问题（6 个）

### H1. WebSocket 无自动重连机制

**位置**：`packages/frontend/src/stores/chatStore.ts` L206-274

**问题**：`connectWebSocket()` 创建的 WebSocket 在 `onclose` / `onerror` 后不会自动重连。用户必须手动点击"重新连接"。在生产环境中，网络波动会导致聊天中断。

**修复**：在 `onclose` 和 `onerror` 中添加指数退避重连逻辑：
```typescript
let reconnectAttempts = 0;
const maxReconnectAttempts = 5;
const baseDelay = 1000;

ws.onclose = () => {
  setConnectionState('disconnected');
  if (reconnectAttempts < maxReconnectAttempts) {
    const delay = baseDelay * Math.pow(2, reconnectAttempts);
    setTimeout(() => {
      reconnectAttempts++;
      connectWebSocket(sessionId, wsUrl);
    }, delay);
  }
};
```

**分级**：🟠 高危 — 影响用户体验和连接可靠性。

---

### H2. `settingsStore` 绕过统一 `apiFetch` 工具

**位置**：`packages/frontend/src/stores/settingsStore.ts` L87, L118

```typescript
// saveSettings L87:
const res = await fetch('/api/config', { method: 'PUT', ... });
// loadSettings L118:
const res = await fetch('/api/config');
```

**问题**：
1. 绕过 `apiFetch`，无法使用 `apiBase` 配置，硬编码相对路径
2. 无连接失败友好提示（`apiFetch` 会提示"无法连接到后端服务"）
3. Desktop 环境如果 `apiBase` 非空，此调用会失败

**修复**：使用 `apiFetch` 或通过 Hook 获取正确的 base URL：
```typescript
import { apiFetch } from '../api';
// 在调用时传入 apiBase
const res = await fetch(`${apiBase}/api/config`, { ... });
```

**分级**：🟠 高危 — Desktop 环境功能缺陷。

---

### H3. 多处 Store 绕过统一 `apiFetch` 工具

**位置**：以下 6 个 store 文件中共计约 25 处 `fetch()` 调用

| 文件 | 调用次数 | 示例位置 |
|------|---------|---------|
| `sessionStore.ts` | 3 | L52, L63, L81 |
| `providerStore.ts` | 4 | L68, L104, L126 |
| `pluginsStore.ts` | 2 | L87, (marketplace 无调用) |
| `sandboxStore.ts` | 5 | L112, L127, L162, L190, L201 |
| `knowledgeBaseStore.ts` | 7 | L99, L147, L249, L263, L322, L347, L393 |
| `automationStore.ts` | 7 | L117, L129, L153, L174, L194, L206, L242 |

**问题**：全部使用原始 `fetch('/api/...')`，未通过 `apiFetch` 或 `apiBase` 路由。在 Desktop 环境下 `apiBase` 为 `http://127.0.0.1:3456`，这些相对路径请求会失败。

**修复**：创建一个 store 可用的非 Hook 版本 `getApiBase()`，从 `ConfigContext` 外部读取：
```typescript
// 在 api.ts 中添加
let _cachedApiBase = '';
export function setApiBase(base: string) { _cachedApiBase = base; }
export function getApiBase() { return _cachedApiBase; }

// 在 config.tsx 的 ConfigProvider 中同步
useEffect(() => { setApiBase(merged.apiBase); }, [merged.apiBase]);
```

或更优雅的方案：创建一个 `apiFetch` 的模块级单例，在 ConfigProvider 初始化时注入 base URL。

**分级**：🟠 高危 — 影响所有 store 的 Desktop 适配。

---

### H4. 插件市场数据全量 Mock

**位置**：`packages/frontend/src/stores/pluginsStore.ts` L101-168

**问题**：6 个插件市场条目全部为硬编码模拟数据，`fetchMarketplace()` 完全不发起网络请求，直接返回硬编码数组。注释为"模拟插件市场数据"。

**影响**：
1. 用户看到的插件无法被安装（调用 `installPlugin` 只是前端乐观更新）
2. 已安装插件永远显示空列表（`fetchInstalled` 调用 `/api/plugins` 但后端可能未实现）
3. 误导用户以为有丰富插件生态

**修复**：
- 若后端已实现 `/api/plugins/marketplace` 端点 → 改为真实 API 调用
- 若未实现 → 在 UI 上明确标注 "预览/演示数据"，或显示 "插件市场建设中"

**分级**：🟠 高危 — 功能误导。

---

### H5. 乐观更新缺少错误回滚

**位置**：多个 store

| Store | 方法 | 问题 |
|-------|------|------|
| `automationStore.ts` L137-165 | `createTask` | 先添加到列表，API 失败时不回滚 |
| `knowledgeBaseStore.ts` L144-223 | `addDocument` | 先添加到列表，API 失败时保留假数据（注释"本地存储"） |
| `sessionStore.ts` L61-76 | `deleteSession` | 先移除，API 失败时不恢复 |
| `pluginsStore.ts` L176-211 | `installPlugin` | 先添加假插件，无后端安装 |

**问题**：所有 store 采用"先更新 UI，再请求 API"模式（乐观更新），但 API 失败时仅显示错误通知，UI 状态不回滚。

**修复**：保存旧状态，失败时恢复：
```typescript
createTask: async (task) => {
  const prevTasks = get().tasks;
  const newTask = { ...task, id: genId(), ... };
  set((s) => ({ tasks: [...s.tasks, newTask] }));
  
  try {
    const res = await fetch('/api/automations', { method: 'POST', ... });
    if (!res.ok) throw new Error('创建失败');
    const serverTask = await res.json();
    set((s) => ({ tasks: s.tasks.map(t => t.id === newTask.id ? serverTask : t) }));
  } catch (err) {
    set({ tasks: prevTasks }); // 回滚
    addNotification({ type: 'error', message: '创建失败' });
  }
},
```

**分级**：🟠 高危 — 数据一致性问题。

---

### H6. `Layout.tsx` 硬编码过期版本号

**位置**：`packages/frontend/src/components/Layout.tsx` L60

```typescript
const [appVersion, setAppVersion] = useState('v0.3.0');
```

**问题**：默认版本 `v0.3.0` 已过期。当前版本为 `v0.4.1`。虽然后续 `useEffect` 会从 `/api/version` 获取正确版本，但如果 API 不可用，用户将看到错误的版本号。

**修复**：从 `package.json` 导入，或至少改为 `v0.4.1`：
```typescript
import { version } from '../../../package.json' assert { type: 'json' };
// 或
const [appVersion, setAppVersion] = useState('v0.4.1');
```

**分级**：🟠 高危 — 用户可见的错误信息。

---

## 🟡 建议级问题（7 个）

### S1. `chatStore.ts` `token_usage` 处理传递空 messageId

**位置**：`packages/frontend/src/stores/chatStore.ts` L386-389

```typescript
case 'token_usage': {
  const usage = data.usage as { input: number; output: number; total: number };
  store.updateMessage(sessionId, '', { tokenUsage: usage }); // ⚠️ 空 messageId
  break;
}
```

**问题**：`updateMessage` 使用空字符串 `messageId`，不会匹配任何消息，实质为无效调用。Token 用量永远不会显示。

**修复**：找到最后一条 assistant 消息的 ID 后更新：
```typescript
case 'token_usage': {
  const session = store.sessions[sessionId];
  const lastMsg = session?.messages?.filter(m => m.role === 'assistant').pop();
  if (lastMsg) {
    store.updateMessage(sessionId, lastMsg.id, { tokenUsage: data.usage });
  }
  break;
}
```

**分级**：🟡 建议 — 功能缺陷，Token 统计不生效。

---

### S2. `App.tsx` 健康检查首次立即触发

**位置**：`packages/frontend/src/App.tsx` L47, L78

```typescript
const check = async () => { /* ... */ };
check();                                    // 立即首次检查
const interval = setInterval(check, 30000); // 然后每 30 秒
```

**问题**：`check()` 在 `useEffect` 中立即调用。如果后端启动稍慢（Desktop 版尤其如此），用户会看到"未连接"的警告通知，然后连接成功后才消失，造成闪烁。

**修复**：首次检查延迟 2-3 秒：
```typescript
setTimeout(check, isDesktop ? 3000 : 500);
const interval = setInterval(check, 30000);
```

**分级**：🟡 建议 — 用户体验。

---

### S3. 根 `package.json` 中 `lint` 脚本为 TODO

**位置**：`package.json` L23

```json
"lint": "echo 'lint TODO'",
```

**问题**：`ci.yml` 未配置 lint 步骤，项目中无 ESLint / Prettier 集成。代码风格一致性无法保障。

**分级**：🟡 建议 — CI 质量门禁缺失。

---

### S4. `MessageList.tsx` — 空状态建议按钮通过 DOM 操作赋值

**位置**：`packages/frontend/src/components/Chat/MessageList.tsx` L423-431

```typescript
const el = document.querySelector('textarea[data-chat-input]') as HTMLTextAreaElement;
if (el) {
  el.value = hint;
  el.focus();
  el.dispatchEvent(new Event('input', { bubbles: true }));
}
```

**问题**：通过 `document.querySelector` 跨组件操作 DOM，破坏了 React 单向数据流。如果 ChatInput 被重构（例如改用 div contenteditable），此代码静默失效。

**修复**：使用 `useChatStore.setComposerPrefill(hint)` 替代 DOM 操作。

**分级**：🟡 建议 — 代码质量，跨组件耦合。

---

### S5. `release.yml` 构建流程中 `packages/web` vs `packages/frontend` 关系不清晰

**位置**：`.github/workflows/release.yml` L88-89

```yaml
- name: Build web frontend
  run: cd packages/web && npm run build
```

**问题**：`packages/web` 的 `build` 脚本为 `tsc && vite build`，会编译 web 专属代码并生成静态文件。但 `packages/frontend`（共享包）没有独立的构建验证步骤。如果 frontend 包自身有编译错误（例如类型错误），仅构建 web 包不足以发现问题。

**修复**：添加独立的 frontend 构建检查：
```yaml
- name: Build shared frontend
  run: cd packages/frontend && npx tsc --noEmit
```

**分级**：🟡 建议 — CI 覆盖完整性。

---

### S6. `appStore.addNotification` 最大 10 条限制未文档化

**位置**：`packages/frontend/src/stores/appStore.ts` L74

```typescript
set((s) => ({ notifications: [...s.notifications.slice(-9), newNotif] }));
```

**问题**：通过 `.slice(-9)` 隐式限制最多 10 条通知，但 JSDoc 和接口定义中均未说明此限制。

**分级**：🟡 建议 — 代码可读性。

---

### S7. 建议按钮通过 `useEffect` 依赖 `providers` 长度重复请求

**位置**：`packages/frontend/src/components/Chat/ChatInput.tsx` L194-201

```typescript
const providers = useProviderStore((s) => s.providers);
useEffect(() => {
  if (providers.length > 0) {
    fetch('/api/providers/all-models')
      .then((r) => r.json())
      .then((data) => { if (data.success) setAvailableModels(data.models || []); })
      .catch(() => {});
  }
}, [providers]);
```

**问题**：每当 `providers` 数组引用变化（即使内容相同），都会触发 `/api/providers/all-models` 重新请求。Zustand 每次更新都会创建新数组引用，导致不必要的重复请求。

**修复**：使用 `useProviderStore` 的 selector + 浅比较，或者改为仅在 `providers.length` 变化时触发。

**分级**：🟡 建议 — 性能优化。

---

## 统计汇总

| 级别 | 数量 | 编号 |
|------|------|------|
| 🔴 阻塞 | 4 | B1, F1, F7, F8 |
| 🟠 高危 | 6 | H1, H2, H3, H4, H5, H6 |
| 🟡 建议 | 7 | S1, S2, S3, S4, S5, S6, S7 |
| **合计** | **17** | |

### 按模块分布

| 模块 | 阻塞 | 高危 | 建议 | 合计 |
|------|------|------|------|------|
| CI/CD (workflows) | 1 | 0 | 2 | 3 |
| Chat (chatStore + ChatInput + MessageList) | 1 | 1 | 2 | 4 |
| 核心入口 (main/config/api) | 1 | 0 | 0 | 1 |
| 其他 Stores | 1 | 4 | 2 | 7 |
| UI 组件 (Layout) | 0 | 1 | 0 | 1 |
| 其他 (package.json) | 0 | 0 | 1 | 1 |

---

## 最终结论

### 🟠 Request Changes（含 4 个阻塞 + 6 个高危）

**核心理由**：
- **F1/F7** 破坏了 `packages/frontend` 的跨环境兼容性（非 Vite 场景崩溃）
- **F8** 轮询架构反模式，且无取消机制，可能导致资源泄漏
- **B1** CI 未验证前端构建，主要交付物未经 CI 门禁
- **H3** 6 个 Store 的 25+ 处 fetch 调用在 Desktop 环境会因缺少 apiBase 前缀而失败
- 其余高危问题影响数据一致性（H5）、用户体验（H1/H2/H6）和功能真实性（H4）

**推荐行动**：

| 优先级 | 编号 | 问题 | 预估工时 |
|--------|------|------|---------|
| 🔴 P0 | F1 | `import.meta.env.DEV` 兼容性 | 0.5h |
| 🔴 P0 | F7 | `useHashRouter` 死代码 | 0.25h |
| 🔴 P1 | B1 | CI 添加前端构建检查 | 0.25h |
| 🔴 P1 | F8 | 轮询 → WebSocket 事件 | 2h |
| 🟠 P1 | H3 | Store 统一 apiFetch | 2h |
| 🟠 P1 | H5 | 乐观更新回滚 | 1.5h |
| 🟠 P2 | H1 | WebSocket 自动重连 | 1h |
| 🟠 P2 | H4 | 插件市场真实数据 | 1h |
| 🟠 P2 | H2 | settingsStore 修复 | 0.5h |
| 🟠 P2 | H6 | 版本号更新 | 0.25h |
| 🟡 P3 | S1-S7 | 建议级优化 | 3h |
| **合计** | — | — | **~12.25h** |

**审查结论**：`packages/frontend` 的前端架构设计优秀（Context 注入 + Zustand 状态管理 + WebSocket 通信），但在跨环境兼容性、CI 覆盖完整性和数据流一致性方面存在需要修复的问题。
