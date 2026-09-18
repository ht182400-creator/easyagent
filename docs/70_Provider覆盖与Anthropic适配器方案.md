# Provider 覆盖补齐与 Anthropic 适配器方案

> **建立日期**: 2026-09-18
> **来源**: `docs/62_专家团最终审核报告.md` —— P1-2 指出「缺 Anthropic / Google 两个 provider」
> **当前状态**（v0.6.35 更新）:
> - ✅ **Google Gemini 已补齐**（走官方 OpenAI 兼容端点，无需新适配器）
> - ✅ **修复了适配器路由的静默失败陷阱**
> - ✅ **AnthropicAdapter 已实现**（`packages/core/src/adapters/AnthropicAdapter.ts`）
>   —— 原方案见 §四，实现说明见 §四末尾「实现完成记录」

---

## 一、补齐 Google Gemini

### 1.1 为什么能复用 OpenAI 适配器

Google 官方提供 **OpenAI 兼容层**，因此不需要写新适配器：

| 项 | 值 |
|----|-----|
| Base URL | `https://generativelanguage.googleapis.com/v1beta/openai/` |
| 鉴权 | 标准 `Authorization: Bearer $GEMINI_API_KEY` |
| 环境变量 | `GEMINI_API_KEY` |
| `apiFormat` | `openai` |

> ⚠️ **末尾的 `/openai/` 不能漏** —— 这是最容易写错的一处，写成
> `.../v1beta` 会直接 404。已在预设里加了醒目注释，并有测试锁定该字符串。

### 1.2 只放一个已核实的模型（刻意的选择）

预设 `models` 里**只放了 `gemini-3.5-flash`**，而不是硬编码一份"看起来完整"的清单。

原因：Google 官方兼容性文档明确说明其示例中的模型名**仅为示例**，
权威清单应以官方文档或 `models.list` 实时返回为准。凭推测填一串 ID，
正是本项目一直在修的那类「失真数据」问题。

**真实清单由动态拉取补齐**：配置 `GEMINI_API_KEY` 后，服务端会调用
`{baseURL}/models` 获取实际可用模型（复用 `/api/providers/:id/models/refresh`
与 v0.6.33 建立的**厂商直连通道**）。

> 这也正是 v0.6.33「厂商 API 直连」设计的价值：**能实时问厂商的，就不要写死。**

---

## 二、🛡️ 修复：适配器路由的静默失败陷阱

### 2.1 问题

`AdapterFactory.create()` 的 switch 原本只有两个分支：

```ts
switch (format) {
  case 'custom': return createCustomAdapter(...);
  case 'openai':
  default:       return new OpenAICompatibleAdapter(...);   // ← 什么都往这里落
}
```

而类型定义里 `apiFormat` 是 **`'openai' | 'anthropic' | 'custom'`** —— 也就是说
`'anthropic'` 是**合法取值**，但没有任何分支处理它。

**后果**：一旦有人配置 `apiFormat: 'anthropic'`，会**静默落到 `default` 分支**，
用一个 OpenAI 格式的适配器去请求 Anthropic 的 API。结果是 400/401，
而错误信息与真实原因（"API 格式选错了"）**毫无关系** —— 排查成本极高。

### 2.2 处置：让它显式失败

```ts
case 'anthropic':
  throw new Error(
    `提供商 ${config.id} 使用 anthropic 格式，但当前版本尚未实现 Anthropic 适配器。...`
  );
```

> **设计原则：明确的失败远好于悄悄用错的实现。**
> 静默降级会伪装成"网络问题/密钥问题"，把真正的配置错误藏起来。

已加测试锁定该契约（`apiFormat=anthropic` 必须抛错，不得回退）。

---

## 三、验证

| 验证项 | 结果 |
|--------|------|
| 预设完整性（12 家） | ✅ id/name/baseURL/apiFormat/apiKeyEnv 齐全；每家至少 1 个模型且 `defaultModel` 在列表内；id 不重复；baseURL 为 https |
| Google 专项 | ✅ baseURL 精确匹配（含 `/openai/`）、格式为 openai、env 为 GEMINI_API_KEY、工厂可创建适配器 |
| 🛡️ anthropic 显式失败 | ✅ 抛错而非静默回退 |
| 目录刷新 | ✅ 12 家 / 54 个模型（无重复 ID，合计校验一致） |
| 全量回归 | ✅ **1710 / 1710 通过，0 失败** |
| `pnpm verify:all` | ✅ **7 / 7** |

---

## 四、Anthropic 适配器方案（尚未实现）

### 4.1 为什么不能复用 OpenAI 兼容适配器

Anthropic Messages API 与 OpenAI 格式在**四个层面**都不同：

| 层面 | OpenAI | Anthropic |
|------|--------|-----------|
| 鉴权 | `Authorization: Bearer` | `x-api-key` + **`anthropic-version`** 头 |
| 系统提示 | `messages` 里 role=system | **顶层 `system` 字段**（不在 messages 中） |
| 请求体 | `max_tokens` 可选 | **`max_tokens` 必填** |
| 流式 | `data:` 单事件流 | **命名事件**（`content_block_delta` / `message_delta` …） |
| 工具 | `tools[]` + `tool_calls` | `tools[]` 用 **`input_schema`**；返回 **`tool_use` 内容块** |
| 工具结果 | role=tool 消息 | **`tool_result` 内容块**（在 user 消息里） |

### 4.2 实现要点（`packages/core/src/adapters/AnthropicAdapter.ts`）

1. 继承 `BaseAdapter`，`apiFormat: 'anthropic'`
2. 请求头：`x-api-key`、`anthropic-version: 2023-06-01`、`content-type`
3. 消息转换：把内部 `Message[]` 的 system 抽到顶层 `system`；tool 结果转 `tool_result` 块
4. 流式解析：按 `event:` 类型分支，只累加 `content_block_delta` 的 `delta.text`
   （可直接复用 v0.6.31 的 `reasoning` 契约：Anthropic 的 `thinking` 块 → `reasoningDelta`）
5. 工具调用：`tool_use` 块 → 归一化为内部 `ToolCall`（`input` 需 `JSON.stringify` 成 `arguments`）
6. 在 `AdapterFactory` 的 `case 'anthropic'` 处改为返回该适配器，并**删除抛错分支**
7. 测试：请求体形状、SSE 事件解析、工具调用归一化、`max_tokens` 必填

### 4.3 预估工作量

约 1 人日（适配器 ~350 行 + 测试 ~200 行 + 预设 + 文档）。
风险点集中在**流式事件类型**与**工具调用块结构**两处，建议先写这两块的解析测试。

### 4.4 实现完成记录（v0.6.35）

| 项 | 结果 |
|----|------|
| 适配器 | `packages/core/src/adapters/AnthropicAdapter.ts`（约 430 行） |
| 工厂接入 | `case 'anthropic'` 由「显式抛错」改为 `new AnthropicAdapter(...)` |
| 预设 | `ProviderId` 新增 `'anthropic'`；4 个模型；`apiFormat: 'anthropic'` |
| 动态刷新 | `fetchModelsFromProvider` 增加 Anthropic 分支（`x-api-key` + `anthropic-version`，解析 `display_name`） |
| 测试 | **16 条**（`anthropic-adapter.test.ts`）+ 预设测试更新 |

**实现中处理的三个易错点**：
1. **`max_tokens` 必填** —— 取 `options.maxTokens` → 模型配置 `maxOutputTokens` → 兜底 4096
2. **工具参数分片** —— Anthropic 用 `input_json_delta.partial_json` 分片下发，
   必须按 `index` 累积到 `content_block_stop` 才能拼成完整 JSON（已加专测）
3. **图片块** —— Anthropic 的图片 `source` **只接受 base64**，URL 形式会直接 400；
   base64 原样透传，URL 降级为文字说明（宁可少一张图，也不要整条请求失败）

**thinking 块**已接入 v0.6.31 建立的 `reasoningDelta` 契约（与推理模型一致）。

**模型 ID 的可信度（如实说明）**：预设中的 4 个 ID 的**命名规范与家族版本**来自
2026-08 的公开 Model ID 汇总清单，与本项目 2026-09 检索结果一致；
但 Anthropic **未提供机器可校验的公开清单**，无法像 OpenAI 那样逐条比对官方模型页。
因此同时打通了 `GET /v1/models` 直连通道作为补偿 —— 配置 Key 后可拉到实时清单。

---

## 五、相关

- 预设与工厂：`packages/core/src/config/ProviderPresets.ts`、`packages/core/src/adapters/index.ts`
- 测试：`packages/core/src/__tests__/provider-presets.test.ts`
- 前置能力：`docs/69`（厂商 API 直连通道）
- 推理模型契约：`docs/68`（`reasoningDelta`）
- 审核依据：`docs/62`（P1-2）
