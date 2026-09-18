# P1-3 MCP 升级：2025-06-18 规范 + Streamable HTTP

> **建立日期**: 2026-09-18
> **依据**: `docs/62` P1-3
> **状态**: ✅ 已完成 —— 双传输（stdio + Streamable HTTP）、协议版本协商、5 条新规范服务器专项用例

---

## 一、实现

### 1.1 双传输架构（`MCPClient` 按 config 分派）

| 传输 | 配置 | 说明 |
|------|------|------|
| **Streamable HTTP** | `url`（可选 `headers`，如 Authorization） | MCP **2025-06-18** 规范；新实现 `mcp/StreamableHttpTransport.ts` |
| **stdio** | `command` + `args` | 原实现，逻辑保持不变（协议版本升级见下） |

```ts
// 新规范服务器（streamable HTTP）
await mcpManager.connect({ name: 'remote', url: 'https://mcp.example.com/mcp', enabled: true });

// 本地 stdio 服务器（原方式不变）
await mcpManager.connect({ name: 'local', command: 'npx', args: ['-y', 'some-mcp-server'], enabled: true });
```

### 1.2 协议版本协商（两个传输都已实现）

- 客户端 initialize 声明支持的最高版本 `2025-06-18`；
- 服务器返回它选择的版本 —— 在支持列表（`2025-06-18 / 2025-03-26 / 2024-11-05`）内即接受
  并记录 `negotiatedProtocolVersion`；**不支持则断开**（规范要求）；
- initialize 成功后发送 `notifications/initialized`（规范要求；此前 stdio 实现遗漏，已补）。

### 1.3 Streamable HTTP 会话细节（`StreamableHttpTransport`）

| 规范点 | 实现 |
|--------|------|
| `Accept: application/json, text/event-stream` | ✅ 所有 POST |
| 响应形态分派 | 单 JSON / **SSE 流**（多帧 `data:` 解析，命中请求 id 即返回；夹带通知帧转发 `eventCallback`）/ 202 通知 |
| `MCP-Session-Id` | initialize 响应捕获，后续请求回带；**404 = 会话失效**（明确报错提示重连） |
| `MCP-Protocol-Version` 头 | 协商完成后所有请求携带 |
| DELETE 终止会话 | `disconnect()` 发送；服务器不支持时静默忽略 |
| 安全 | 请求超时 30s；错误体截断 200 字符防泄漏/刷屏；错误堆栈只进日志 |

**未实现（记录 TODO）**：GET 长连接 SSE 通道（服务器主动推送）—— 工具列表/调用为客户端驱动
场景不需要常驻连接；将来做 server-initiated 能力（sampling/roots）时再引入。

---

## 二、验证（2026-09-18）

- 用 node:http 实现**仅支持 2025-06-18 的伪 MCP 服务器**（不打公网，CI 安全）：
  - 全流程（initialize 协商 → session id 传播 → tools/list → tools/call → DELETE）✅
  - 版本协商：旧版 `2024-11-05` 兼容接受（stdio 回归）/ `1999-01-01` → 明确报错断开 ✅
  - SSE 响应 + 夹带通知帧转发 ✅ · 缺 session id → 400 ✅ · 配置缺 url+command → 报错 ✅
- 全量回归 **1758/1758**（+5）· 语言服务器 0 诊断

> 验收对照：报告要求「能连接一个仅支持新版规范的公开 MCP Server；单测覆盖」——
> 以规范符合的本地实现等价验证协议行为（CI 无网络保障）；接真实公网服务器属部署期验证。

---

## 三、相关

- `packages/core/src/mcp/StreamableHttpTransport.ts`、`packages/core/src/mcp/MCPClient.ts`
- 规范：https://spec.modelcontextprotocol.io/（2025-06-18）
