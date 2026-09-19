# SWE-bench 评测：现状、四处硬伤修复与离线自测方案

> **建立日期**: 2026-09-19
> **适用场景**: 想跑「Agent 代码质量评测」、想核实 README 上那张评测表、或想知道**没有 API Key 能测什么**
> **关联**: `docs/71_元数据诚实性与组件类名门禁.md`（同族问题：不把"看起来像"当成"就是"）· `scripts/swe-bench/` · `packages/core/src/benchmark/`

---

## 一、结论速览

| 你的情况               | 能做什么                                                                   | 命令                                                                                   |
| ---------------------- | -------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| **没有 API Key**       | ① 环境 + 数据集检查 ② **全流程离线自测**（题数/聚合/报告落盘）③ 看历史结果 | `pnpm benchmark:dry` · `pnpm benchmark --offline` · `pnpm benchmark --generate-readme` |
| **有 API Key**         | 真实评测（调用模型，产生费用）                                             | `pnpm build:core` 后 `pnpm benchmark --provider deepseek --model deepseek-v4`          |
| 想看某一版真实评测结果 | 读 `benchmark-results/latest-summary.json`（带口径字段）                   | —                                                                                      |

> ⚠️ **口径警告（先读这条再看任何数字）**
> 当前评测的评分是**结构化启发式**：代码块非空 + 括号配对 + 含 `export`/`function`/`class`，
> **不执行测试用例**。因此 `pass@k` 表示「产出了结构完整的代码」，**不等于**「通过了测试」。
> 它**不是** SWE-bench 官方 harness，**对外不得声称「SWE-bench Verified 分数」**。

---

## 二、修掉的六处问题（此前真评测 100% 跑不起来）

> 起因：用户问"这个没有 API Key 是否能测试"，核查后发现 **即使有 Key 也跑不起来**。
> 六个问题中 ①②③④ 是**导致失败**的硬伤，⑤⑥ 是**导致误导**的诚信问题。

| #   | 现象 / 类别            | 根因                                                                                                                                                                                                               | 证据                                                                                       | 修复                                                                                                             |
| --- | ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------- |
| ①   | **产物路径不存在**     | CLI 动态导入 `packages/core/dist/benchmark/BenchmarkRunner.js`，而 `core/tsup.config.ts` 的 entry 只有 `index/adapters/tools/PluginWorkerEntry` → 该路径**永不存在**（Runner 实际被内联进 `dist/index.js` 并导出） | `Test-Path dist/benchmark` → False；`dist/index.js:16171` 有 `var BenchmarkRunner = class` | CLI 改为导入 `dist/index.js` 并校验导出（检查即使用，不再两条路径）                                              |
| ②   | **Windows 动态导入**   | `import('D:\\...\\index.js')` 被 Node 当作 `c:` 协议 → `ERR_UNSUPPORTED_ESM_URL_SCHEME`                                                                                                                            | —                                                                                          | 改用 `pathToFileURL(...).href`                                                                                   |
| ③   | **`--dry-run` 假通过** | 检查的是 `dist/index.js`（存在），使用的是 `dist/benchmark/*`（不存在）；且 dry-run 用 CLI 自备的宽松解析器读数据集，与评测的加载器**不是同一条链路**                                                              | dry-run 打印「10 题，OK」，真跑立刻「核心包未编译」                                        | dry-run 改为**真实加载核心包 + 真实引擎读数据**，检查与评测同源；失败即 `exit 1`                                 |
| ④   | **数据集解析后 0 题**  | 内置 `benchmark-tasks.json` 是 **pretty-printed JSON 数组**，而 `SWEBenchEngine.loadFromFile()` 只按行 `JSON.parse` → 每行都失败并被**静默跳过**；`FAIL_TO_PASS` 为数组时 `.split()` 抛错也一并吞掉                | 数据集 152 行、逐行解析全失败                                                              | 加载器支持「JSON 数组 / 单对象 / JSONL」三种格式 + `FAIL_TO_PASS` 数组或换行串；坏行**记录行号告警**而非静默丢弃 |
| ⑤   | **难度口径不一致**     | 引擎一律用启发式推断难度，**无视**数据集声明的 `difficulty` → `--difficulty` 过滤与按难度统计和数据集声明长期不符                                                                                                  | 数据集声明 easy/medium/hard = 3/4/3                                                        | 声明优先，缺失才推断（新增用例守护）                                                                             |
| ⑥   | **退出码恒为 0**       | `main()` 无论检查通过与否都不设置退出码 → CI/脚本无法感知失败                                                                                                                                                      | —                                                                                          | 失败 → `exit 1`；`--dry-run` 未通过即 1                                                                          |

补充修复：`loadBuiltinDataset()` 现在按 `dist/` → `src/benchmark/` 顺序探测（tsup **不复制 JSON 资源**，旧实现 `__dirname` 恒指 `dist/`，`dryRunBenchmark()` 在产物环境永远 `ok:false`）；并在 `core/tsup.config.ts` 的 `onSuccess` 中把数据集复制到 `dist/`。

---

## 三、离线自测（`--offline`）：无 Key 也能验证整条链路

### 3.1 设计

- `AgentBenchmarkConfig` 新增 `offline?: boolean` 与 `solutionGenerator?: SolutionGenerator`（**依赖注入**）
- 三条路径**同构**（都吃同一份 prompt）：注入的生成器 → `offline` 内置桩 → 真实模型 Agent
- 未注入生成器时的内置桩 `buildOfflineStubSolution(problem)`：
  - `easy` / `medium` → 输出结构完整的占位实现（走**通过**分支）
  - `hard` → **刻意只输出注释**（走**失败**分支）
  - 这样固定得到 **7/10** 的确定性混合结果 —— 若桩让 10 题全绿，"全通过"反而会**掩盖聚合缺陷**（例如恒真判定）
- 所有产物带 `[OFFLINE STUB]` 标记；报告顶部与摘要 JSON 都写明 `mode = offline-mock`

### 3.2 实测（2026-09-19）

```text
$ pnpm benchmark --offline
  模型:     deepseek/deepseek-v4
  Pass@1:  1 次尝试
  数据集:   benchmark-tasks.json
  运行模式: offline-mock（离线自测，不调用任何模型）
  ⚠️ 结果不代表任何模型的真实代码能力，仅用于验证评测流程与聚合口径

===========================================
  评测完成
  运行模式: offline-mock
  通过率:   70.0%
  评分口径: heuristic-structural（不执行测试用例）
  结果目录: benchmark-results/
  ⚠️ 离线自测结果，不代表模型能力
===========================================
退出码=0
```

产物：`benchmark-results/swebench_report_<ts>.md`（含离线横幅 + 口径说明）与 `benchmark-results/latest-summary.json`：

```json
{
  "passRate": 0.7,
  "byDifficulty": {
    "easy": { "total": 3, "passed": 3, "rate": 1 },
    "medium": { "total": 4, "passed": 4, "rate": 1 },
    "hard": { "total": 3, "passed": 0, "rate": 0 }
  },
  "mode": "offline-mock",
  "scoring": "heuristic-structural",
  "limitation": "评分为结构化启发式（…），不执行测试用例；pass@k 表示\"产出结构完整的代码\"，不等于\"通过测试\"。"
}
```

> 数字是**桩的产物**，只证明"链路与聚合正确"（3+4=7 通过、hard 全失败的分支都被正确统计），**不能**作为任何模型的能力依据。

### 3.3 环境检查（`--dry-run`）

```text
$ pnpm benchmark:dry
  核心包:   packages\core\dist\index.js
  OK 核心包已编译并导出 BenchmarkRunner / SWEBenchEngine
  数据集:   benchmark-tasks.json
  路径:     ...\packages\core\dist\benchmark-tasks.json
  题目数:   10
  OK 数据集加载成功（经真实引擎加载，与评测同一口径）
  难度分布:
    - easy: 3 题
    - medium: 4 题
    - hard: 3 题
  OK 环境检查通过！
```

---

## 四、真实评测（需要 API Key）

### 4.1 前置

1. **编译核心包**：`pnpm build:core`（评测从 `dist/index.js` 加载 Runner；同时会把数据集复制到 `dist/`）
2. **提供 Key**（任选其一）：
   | 方式 | 具体 |
   | -------------- | ------------------------------------------------------------------------ |
   | 环境变量 | `DEEPSEEK_API_KEY` / `DASHSCOPE_API_KEY`（Qwen）/ `ZHIPU_API_KEY`（GLM）… 由 `ProviderPresets.apiKeyEnv` 决定 |
   | 应用界面配置 | 设置 → 模型 → 填 Key（AES 加密存于 `~/.easyagent/providers.json`，评测直接复用） |
   | 自定义厂商 | `--provider custom` + `CUSTOM_API_KEY` |

### 4.2 运行

```powershell
$env:DEEPSEEK_API_KEY = 'sk-...'
pnpm benchmark --max-problems 1 --difficulty easy      # 先 1 题试水（省钱）
pnpm benchmark --provider deepseek --model deepseek-v4 # 全量 10 题
pnpm benchmark --k 3 --provider qwen --model qwen3-max # pass@3
pnpm benchmark --generate-readme                       # 回看最新结果
```

**成本提醒**：10 题 × k 次 × 单题超时 120s、**串行**（`parallel: 1`）、全是真实调用 —— 会花真金白银且慢。
未配置 Key 时会明确报错并给出三条出路（含 `--offline`），不再静默失败。

---

## 五、口径与局限（引用数字前必读）

| 项         | 现状                                                                                                                                        |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| 评分方式   | 结构化启发式：非空 ≥10 字符 + 花括号数量差 ≤2 + 含 `export`/`function`/`class`                                                              |
| **不做的** | **不执行测试用例**（不落盘、不跑 vitest）                                                                                                   |
| 因此       | `pass@k` = "产出结构完整的代码" ≠ "通过测试"；**不是** SWE-bench 官方 harness                                                               |
| 对外表述   | **禁止**写「SWE-bench Verified 分数」；应写「结构化启发式通过率（非真实测试执行）」                                                         |
| 数据集     | 内置 10 题（easy 3 / medium 4 / hard 3），题目自带 `test_patch` 但当前未被用于判定                                                          |
| 运行姿态   | `allowTools: false` + `maxTurns: 3` —— **禁用工具调用**，模型只有"一次性输出代码文本"的机会                                                 |
| 提示词开卷 | **是**：`buildPrompt()` 把 `test_patch`（测试用例）作为"参考"直接给了模型 → 接真实执行（#20）前必须先决定开卷/闭卷                          |
| 能回答     | "模型能否按格式产出结构完整的代码"（链路 + 格式冒烟）                                                                                       |
| 不能回答   | ① "模型本体强不强"（厂商官方 harness 已测，且我们不跑测试）② "EasyAgent 这个 Agent 强不强"（要开工具 + 多轮 + 真跑测试才配叫 agentic 评测） |

### 5.1 关于 API Key 的成本（常被误解）

- Key 是**按厂商**发放的，**不是按模型**：13 家预设（deepseek / zhipu / qwen / kimi / ernie / doubao / hunyuan / minimax / ollama / openai / google / anthropic / custom），
  各家一个 `apiKeyEnv`，**一个 Key 覆盖该厂商全部模型**（`ProviderPresets.models[]`）。
- 跑 3 个不同厂商的模型 = **3 个 Key**（不是几十个）；且**跑谁配谁**，无需一次配齐。
- **零成本真实评测**：`Ollama (本地)` 预设的 `apiKey` 默认就是占位值 `'ollama'`、模型 `pricing` 为 0 →
  本机起 Ollama 后即可**真跑不花钱**（模型弱，但足以验证"开工具 + 真跑测试"的链路）。
- 花费量级：10 题 × k=1 = **10 次 chat 调用/模型**（3 个模型约 30 次），不是"几十个 Key"的问题。
  建议先 `--max-problems 1 --difficulty easy` 试水。

**真实测试执行已落地（2026-09-19，原 `docs/44` #20 完成）**：`SolutionRunner` 把解法与数据集自带
`test_patch` 落盘到 `temp/benchmark-run/<题目>-<时间戳>/`，用 **node 直接启动 vitest**（不经 shell）跑一遍，
再按 `FAIL_TO_PASS` / `PASS_TO_PASS` 的用例名逐条核对 → 见 §七。

---

## 六、四种运行姿态 × 判定档（矩阵 + 实测）

**运行姿态**（谁在产出"解法"）

| 姿态                      | 命令                            |   调用模型   | 能验证什么                                                                  | 实测（10 题）                                                            |
| ------------------------- | ------------------------------- | :----------: | --------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| 离线桩（Runner 层）       | `--offline`                     |      ❌      | 评测流程 / 聚合口径 / 报告落盘                                              | **70.0%（7/10）**，桩按难度设计                                          |
| Mock 适配器（adapter 层） | `--mock-agent [--allow-tools]`  |      ❌      | **真实跑通 agent 轨迹**：工具注册 → 工具执行 → 消息回灌 → 多轮 → 上下文压缩 | **0.0%**（桩当然过不了真测试）；日志可见 `list_dir` 调用与「70→17 工具」 |
| 真实模型                  | `--provider X --model Y`        | ✅（需 Key） | 端到端能力（厂商模型 + EasyAgent 编排）                                     | 待配 Key 后运行                                                          |
| 本地模型（零成本）        | `--provider ollama --model <m>` |  ✅（本地）  | 同上，但**不花钱**                                                          | 本机已装 ollama 0.32.9 但**尚未下载任何模型**（需 `ollama pull`，GB 级） |

**判定档**（怎么算"解决"）

| 判定档       | 取值                                         | 行为                                             | 实测                                        |
| ------------ | -------------------------------------------- | ------------------------------------------------ | ------------------------------------------- |
| 真实执行     | `--real-tests`（默认 `auto` 且 vitest 可用） | 落盘 + vitest 实跑 + `FAIL_TO_PASS` 逐条核对     | `--offline --real-tests` → **0.0%（预期）** |
| 结构化启发式 | `--heuristic`（`--offline` 默认）            | 只看"非空 + 括号配对 + 含 export/function/class" | **70.0%**（与桩设计一致）                   |

> ✅ **负向对照是刻意保留的**：`--offline --real-tests` 期望**全失败**。若它显示通过，说明判定被写成了橡皮章。

---

## 七、真实执行是怎么做的

1. **工作区**：`temp/benchmark-run/<题目 id>-<时间戳>/`（仓库内、已 gitignore）。**保留策略 = 通过即清、失败保留**
   （`keepWorkspace`/`keepOnFailure`，CLI `--keep-workspace` 可全量保留）
   > ⚠️ 为什么默认要清：工作区里的 `solution.test.ts` 会被静态扫描器（`docs/pipeline/scripts/scan-test-cases.mjs`）
   > 误当仓库测试资产 → 定义用例虚增（实测 **+21 条**）→ 触发数据一致性门禁 `_stale`。
   > 已双保险：扫描器 `EXCLUDE_DIRS` 增加 `temp/` 等生成目录 + 执行器默认清理。
2. **嵌套运行参数**：单题工作区只跑 1 个测试文件，实测 **~1.7s 就是启动下限**；
   `--maxWorkers=1` 会让 vitest **静默不执行用例**（`total=0` 空报告而退出码仍为 0，属假信号），
   `--no-isolate` 无收益 → 一律保持默认参数（对照数据见 `solutionRunner.ts` 注释）。
   想再快只能减少"每题一次"的运行次数。
3. **落盘三个文件**：`solution.ts`（模型/桩产物）、`solution.test.ts`（数据集 `test_patch` 原文）、`vitest.config.mts`（内联最小配置）
4. **执行**：`spawn(process.execPath, [vitest.mjs, 'run', '--root', 工作区, '--reporter=json', ...], { shell: false })`
   —— **不经 shell**（argv 逐项传递，结构上杜绝注入），单题超时 60s
5. **判定**：解析 JSON 报告取 `assertionResults[].title`，与 `FAIL_TO_PASS` / `PASS_TO_PASS` 的用例名
   （兼容 `test('xxx')` 包裹形式）逐条比对；**全部通过才算解决**
6. **降级**：vitest 不可用（如打包后的 Electron 环境）→ 回退启发式，并在 `meta.testExecutionReason`
   与报告中**如实标注**（禁止静默降级）

---

## 八、日志与留证（排查"当时到底跑了什么"）

| 产物                            | 位置                                        | 生成方式                                                                               |
| ------------------------------- | ------------------------------------------- | -------------------------------------------------------------------------------------- |
| 命令输出 + DEBUG 日志           | `logs/build-logs/<日期>_<时间>_<标签>.log`  | `pnpm log --label 评测-离线自测 -- node scripts/swe-bench/run-benchmark.mjs --offline` |
| 回归测试日志（分层 + 失败标红） | `logs/test-logs/<日期>_<时间>_<范围>/`      | `pnpm test:log` 或 `node scripts/run-tests-log.mjs --only core --scope 评测`           |
| 评测报告（含逐题 FAIL_TO_PASS） | `benchmark-results/swebench_report_<ts>.md` | 每次评测自动写（该目录已 gitignore）                                                   |
| 机器可读摘要（带口径字段）      | `benchmark-results/latest-summary.json`     | 同上                                                                                   |
| 真实执行工作区（可复现单题）    | `temp/benchmark-run/<题目>-<ts>/`           | 判定档为真实执行时，每题一个                                                           |

> 想看核心包 DEBUG 细节：设 `LOG_LEVEL=debug`（CLI 只在**未设置**时才降到 `warn`，避免核心日志污染报告输出）。
> 实测据此拿到 17 条 debug 行，含 `AgentEngine.run 入口`、`上下文已构建（70→17 工具）`、`数据库 schema 已是最新`。

---

## 九、命令速查

```bash
pnpm benchmark:dry                                             # 环境 + 数据集检查（无需 Key）
pnpm benchmark --offline                                       # 链路自测（启发式判定，约 7/10）
pnpm benchmark --offline --real-tests                          # 负向对照（预期 0 通过）
pnpm benchmark --mock-agent --allow-tools                      # 跑通 agent 轨迹（工具 + 多轮，零成本）
pnpm benchmark --generate-readme                               # 最新结果摘要
pnpm build:core && pnpm benchmark --provider X --model Y       # 真实评测（需 Key；默认 auto 走真实执行）
pnpm benchmark --provider X --model Y --allow-tools --max-turns 10   # agentic 真实评测
pnpm benchmark --max-problems 1 --difficulty easy              # 最省钱的试水
pnpm benchmark --heuristic                                     # 强制启发式（对照）
```

相关测试：`packages/core/src/__tests__/benchmark-runner.test.ts` —— **35 条用例**（数据格式兼容、难度声明、
pass@k 聚合、失败分支、异常路径、报告落盘、**真实执行正/负对照**、Mock 适配器轨迹），已登记进
`module-registry.mjs` 的 **b2a「SWE-bench 评测体系」**（该模块此前标 done 却 `testFiles: []`）。
实测：core **1143/1143**；项目定义用例 **1833**、vitest 执行 **1844**（2026-09-19，全量日志见 `logs/test-logs/`）。

---

## 七、相关

- CLI：`scripts/swe-bench/run-benchmark.mjs`
- 核心：`packages/core/src/benchmark/{BenchmarkRunner,SWEBenchEngine}.ts`、`packages/core/tsup.config.ts`（运行时资源复制）
- 测试：`packages/core/src/__tests__/benchmark-runner.test.ts`
- 同族诚信治理：`docs/71_元数据诚实性与组件类名门禁.md`
- 剩余工作：`docs/44_优化内容综合进度与优先级.md` #20
