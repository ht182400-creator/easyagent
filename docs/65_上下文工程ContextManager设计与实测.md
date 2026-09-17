# 上下文工程（ContextManager）设计与实测

> **建立日期**: 2026-09-18
> **对应任务**: `docs/62_专家团最终审核报告.md` 的 **P0-4**
> **结论**: 小模型档上下文固定开销从 **45.3% 降到 6.8%**（节省 **12,605 token / 85%**），全量回归 1635/1635 通过

---

## 一、问题：不是"工具不够"，是"上下文被工具挤爆"

2026 年的共识是：**Agent 的能力上限由模型决定，实际表现由上下文工程决定**。
同一个模型，上下文喂得好与坏，任务成功率差异可达 2~3 倍。

改造前 EasyAgent 在这一项上是空白的 —— `AgentEngine.run()` 中：

```ts
const messages: Message[] = [
  { role: 'system', content: this.buildSystemPrompt(workspace) },
  ...session.messages,
  { role: 'user', content: userMessage },
];
const toolDefinitions = this.buildToolDefinitions();   // 70 个，全量下发
// 循环内 messages.push(...) —— 上限？没有。仅靠 maxTurns 限制轮数
```

### 1.1 实测基线（`node scripts/measure-context.mjs`）

| 项 | 数值 |
|----|------|
| 工具总数 | **70** |
| 工具定义 JSON（`tools` 参数，紧凑） | 22,258 字符 ≈ **8,774 token** |
| 工具描述文本（**又被拼进系统提示词**） | 10,702 字符 ≈ **6,058 token** |
| **合计每次请求固定开销** | **≈ 14,832 token** |

占各模型窗口：

| 模型窗口 | 占用 |
|---------|------|
| qwen2.5:7b（32k） | **45.3%** |
| DeepSeek V4（131k） | 11.3% |
| GLM-5（200k） | 7.4% |

### 1.2 三个具体缺陷

| # | 缺陷 | 后果 |
|---|------|------|
| 1 | **同一份信息付两次钱** | `buildSystemPrompt()` 用 `tools.getDescriptions()` 把全部工具描述内联进提示词，而 `tools` 参数已经携带了完整 JSON Schema |
| 2 | **工具不做分级** | 70 个工具无条件全量下发。7B 模型识别 70 个工具定义本身就是负担（陷阱 #42 已定性，本次给出定量证据） |
| 3 | **工具结果无条件回灌** | 一次 `read_file` 可能带回整个文件、一次 `exec` 可能带回上千行日志，直接 push 进 messages；历史只增不减 |

> 这解释了为什么"51 个工具"的宣传与"AI 能力不强"的体感长期矛盾：
> **不是工具不够，是上下文被工具和原始结果挤爆了。**

---

## 二、设计

### 2.1 模块结构（`packages/core/src/agent/context/`）

| 文件 | 职责 | 关键点 |
|------|------|--------|
| `tokenEstimator.ts` | 本地零依赖 token 估算 | CJK ≈ 1 字符/token，其余 ≈ 4 字符/token；可用环境变量校准 |
| `toolSelection.ts` | 按模型规模分级选工具 + 生成紧凑索引 | small 用**白名单**，medium/large 用**排除清单** |
| `toolResultTruncator.ts` | 结果超长截断 + 工作区内落盘 | 截断后给出**工作区相对路径**，模型可 `read_file` 取回 |
| `historyCompactor.ts` | 历史压缩为结构化摘要 | **保护 `assistant(tool_calls)` ↔ `tool` 配对**；二分查找最小裁剪点 |
| `ContextManager.ts` | 编排入口 | 输出 `{ systemPrompt, messages, toolDefinitions, stats }` |
| `options.ts` | 配置解析 | 全部能力可独立开关，可灰度可回滚 |

### 2.2 四个关键设计决策

**① 档位阈值与工具清单策略：宁可漏裁，不可误裁**

```ts
small  : 窗口 ≤ 40k   → 只保留 CORE_TOOL_NAMES（17 个核心工具，白名单制）
medium : 窗口 ≤ 200k  → 排除 23 个「schema 成本高 + 交互式编程低频」的工具
large  : 窗口 > 200k  → 仅排除 benchmark_*（4 个）
```

- `ALWAYS_EXCLUDED` 只放**有明确证据**的工具：`benchmark_*`（陷阱 #41 实测会导致普通聊天陷入
  `benchmark_load → run → report` 死循环直至 `Recursion limit of 25 reached`）。
- **medium/large 用排除清单而非白名单** —— 这样**新增工具默认可见**，
  不会因为忘了加进白名单而悄悄"能力消失"。（已有专门用例守护这条不变量。）

**② 描述去重必须带安全守卫**

实测中档可省约 6,000 token，但有个陷阱：**若模型不支持 function calling**，
适配器不会下发 `tools` 字段，此时再移除内联描述 = 模型完全不知道有工具可用。

```ts
const supportsFunctionCalling = modelInfo?.supportsTools !== false;
const dedupeDescriptions = contextOptions.dedupeToolDescriptions && supportsFunctionCalling;
```

这是"能力消失"而非"省 token"，因此单独立了守卫与日志。

**③ 截断内容必须落在工作区内**

`FileTools.safePath()` 会拒绝工作区外路径（`安全限制: 无法访问工作区外的路径`），
所以完整内容落盘到 **`<workspace>/.easyagent/context/<sessionId>/`**，
消息里给的是**工作区相对路径**。若落到 `~/.easyagent/`，模型无法取回，落盘就失去意义。
（目录以 `.` 开头，`list_dir` 默认过滤点文件，不会污染目录列表。）

**④ 压缩不得影响会话记录**

`AgentEngine` 维护两个数组：

| 数组 | 用途 |
|------|------|
| `messages`（工作集） | 真正发给模型，可能已被压缩 |
| `fullHistory`（完整历史） | 会话落盘用，**永不压缩** |

否则长会话落盘后历史会被永久截断 —— 那是数据丢失，不是上下文优化。

**⑤ 历史裁剪必须保护工具调用配对**

裁剪点落在 `tool` 消息上、或前一条是「带工具调用的 assistant」时，
必须一起前移（`adjustCutForToolPairs`）。否则部分 provider 会因
"tool_call_id 找不到对应请求" 直接 **400**。已用专门用例守护该不变量。

---

## 三、实测收益

`node scripts/measure-context.mjs`（需先 `pnpm --filter @easyagent/core build`）：

### 3.1 固定开销（系统提示词 + 工具定义）对比

| 档位 | 模型窗口 | 工具数 | 改造前 | 改造后 | 节省 |
|------|---------|-------|-------|-------|------|
| **small** | 32,768 | 70 → **17** | 14,832 | **2,227** | **12,605（85.0%）** |
| **medium** | 131,072 | 70 → **47** | 14,832 | 6,414 | 8,418（56.8%） |
| **large** | 200,001 | 70 → **66** | 14,832 | 9,796 | 5,036（34.0%） |

### 3.2 占模型窗口比例

| 档位 | 改造前 | 改造后 |
|------|-------|-------|
| small（32k） | **45.3%** | **6.8%** |
| medium（131k） | 11.3% | 4.9% |
| large（200k+） | 7.4% | 4.9% |

> **小模型受益最大**：从"近一半上下文被工具吃掉"降到"约十五分之一"，
> 释放出来的空间直接变成可用的对话与代码上下文。

### 3.3 触发的裁剪动作（可观测性）

`ContextStats.adjustments` 会逐条说明本轮做了什么：

```
small:
  · [tool-tiering] small 档排除 53 个工具（保留 17/70）  (-6,899 token)
  · [description-dedupe] 系统提示词不再内联完整工具描述，改为紧凑索引（索引自身开销 325 token）
```

这些统计同时以 `logger.debug` 输出，排查"为什么模型没调用某个工具"时可直接查看。

---

## 四、配置与回滚

| 环境变量 | 默认 | 说明 |
|---------|------|------|
| `EASYAGENT_CONTEXT_V2` | `1`（启用） | 置 `0` 全局关闭，行为与改造前完全一致 |
| `EASYAGENT_CONTEXT_TOOL_TIER` | `1` | 置 `0` 关闭工具分级（仍排除 `benchmark_*`） |
| `EASYAGENT_CONTEXT_RESULT_LIMIT` | `8000` | 工具结果字符上限；`0` = 不截断 |
| `EASYAGENT_CONTEXT_COMPACT` | `1` | 置 `0` 关闭历史压缩与结果截断 |
| `EASYAGENT_CONTEXT_USABLE_RATIO` | `0.7` | 可用上下文比例（预留 30% 给模型输出） |
| `EASYAGENT_CONTEXT_DEDUPE_DESC` | `1` | 关闭系统提示词去重（不支持 function calling 时会自动关闭） |
| `EASYAGENT_TOKEN_CJK_PER_TOKEN` | `1` | token 估算校准：CJK 字符/token |
| `EASYAGENT_TOKEN_OTHER_PER_TOKEN` | `4` | token 估算校准：非 CJK 字符/token |

**回滚方式**：`set EASYAGENT_CONTEXT_V2=0` 即可完全回到改造前行为，无需改代码。

---

## 五、验证

| 项 | 结果 |
|----|------|
| 上下文模块用例 | **63 个**（本次新增，含边界值/异常/配对保护/新增工具默认可见等不变量） |
| 全量回归 | **1635 / 1635 通过，0 失败** |
| 既有行为 | `AgentEngine` 原有测试全部通过（无回归） |
| typecheck | 新增文件零错误（`core` 包既有 89 个历史错误与本改动无关） |

**测试覆盖的边界与异常**（按测试专家视角）：

- token 估算：空串 / `null` / 空数组 / emoji 代理对 / 全角符号 / 环境变量校准
- 档位：`undefined` / 恰好等于阈值 / 阈值 +1
- 截断：恰好等于阈值 / `limit=0` / 禁用落盘 / **工作区路径非法（降级不抛异常）** / **工具名含 `../` 路径注入**
- 压缩：空数组 / 未超预算 / **配对不得被拆散（两条不变量用例）** / 触达最少保留下限 / 摘要不抄原文
- 编排：关闭开关时原样返回 / 三档各一次 / 统计自洽 / 单次覆盖优先于全局

---

## 六、后续可做（未纳入本次）

| 项 | 说明 |
|----|------|
| LLM 滚动摘要 | 当前为**确定性结构化摘要**（零成本、可测试）。若实测信息损失明显，可增加"用便宜模型做摘要"的可选路径 |
| 工具结果语义压缩 | 例如把大段日志按"错误/警告/摘要"结构化压缩，而非简单头尾截断 |
| Provider 实际用量回校 | 用 `usage` 字段校正估算偏差，动态调整 `usableRatio`（当前为静态启发式） |
| 前端可视化 | 把 `ContextStats` 通过事件推给 UI，让用户看到"本轮上下文占用" |
| 落盘清理策略 | `.easyagent/context/` 目前只增不删，需要按会话寿命清理 |

---

## 七、相关

- 度量脚本：`scripts/measure-context.mjs`
- 模块源码：`packages/core/src/agent/context/`
- 用例：`packages/core/src/__tests__/context-manager.test.ts`
- 审核依据：`docs/62_专家团最终审核报告.md` §3.3（C1 上下文工程缺失）、§4.2
- 方案与回归：`docs/63_P0优化实施方案与回归记录.md`
