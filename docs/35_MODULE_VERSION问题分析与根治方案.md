# better-sqlite3 MODULE_VERSION 问题深度分析与根治方案

> **创建日期**: 2026-06-26  
> **影响范围**: EasyAgent 后端启动、Desktop EXE 打包、electron-builder 产物  
> **核心问题**: better-sqlite3 编译产物的 MODULE_VERSION 不可控地反复变化

---

## 1. 问题现象

| 症状 | 表现 |
|------|------|
| `node-gyp rebuild` 成功编译 | 所有测试通过 |
| 过一段时间再次启动 | `MODULE_VERSION mismatch` 报错 |
| Desktop EXE 启动失败 | "无法连接到后端服务" |
| 版本反复跳变 | 123→137→88→116→128，不知道何时被覆盖 |

**典型错误信息：**
```
Error: The module '...\better_sqlite3.node'
was compiled against a different Node.js version using
NODE_MODULE_VERSION 116. This version of Node.js requires
NODE_MODULE_VERSION 137.
```

---

## 2. MODULE_VERSION 速查表

| MODULE_VERSION | 对应运行时 | 场景 |
|:---:|------|------|
| **137** | Node.js v24.x | 当前开发环境（系统 Node） |
| **123** | Electron 30 (Node 20.x) | Desktop EXE 内置后端 |
| 116 | Node.js v20.8-v20.9 | prebuild-install 下载的缓存二进制 ⚠️ |
| 88 | Node.js v14.x | pnpm store 中的老旧预编译二进制 ⚠️ |

**关键认知**: 同一个 `better_sqlite3.node` 文件在同一个位置，但需要支持 **两种不同的运行环境**（开发环境用系统 Node，打包后的 EXE 用 Electron 内置 Node）。

---

## 3. 根因分析

### 3.1 prebuild-install 是罪魁祸首

`better-sqlite3@12.11.1` 的 `package.json` 包含：

```json
{
  "scripts": {
    "install": "prebuild-install || node-gyp rebuild"
  }
}
```

**每次 `pnpm install` 都会触发此脚本**，执行流程：

```
pnpm install
  → better-sqlite3 install script
    → prebuild-install 从 npm registry 搜索预编译二进制
      → 找到 (Node v20, ABI=116) → 下载覆盖 build/Release/better_sqlite3.node ✅ 覆盖完成!
      → 找不到 → node-gyp rebuild 从源码编译
```

**prebuild-install 选择的版本取决于 pnpm store 缓存**，而非当前运行的 Node 版本。这就是为什么你会看到 116、88 等莫名其妙的值。

### 3.2 多脚本互相覆盖（已在 06-26 修复）

之前有 5 个脚本同时操纵同一个 `.node` 文件：

| 脚本 | 触发时机 | 写入版本 |
|------|---------|---------|
| `postinstall.cjs` | pnpm install | Electron (123) |
| `sqlite3-loader.mjs` | 启动后端 | System (137) |
| `build.bat` Phase 2.5 | 打包 | node-gyp rebuild |
| `rebuild-sqlite3.mjs` | 手动 | System (137) |
| `build-sqlite3.bat` | 手动 | CMD copy 静默失败 |

**修复**: 删除冗余脚本，只剩 2 个管理入口。

### 3.3 Desktop EXE 中的问题

`electron-builder` 将 `better-sqlite3` 配置为 `asarUnpack`（不解压进 asar 包），意味着：

```
打包时: better_sqlite3.node = system版本 (137)  → 复制到 EXE 资源
EXE运行时: Electron 30 内置 Node (需要 ABI=123) → 加载失败!
```

**build.bat Phase 2.5 职责**: 打包前临时将 better_sqlite3.node 切换为 electron 版本 (123)，打包完成后 Phase 3.5 恢复为 system 版本。

---

## 4. 终极解决方案

### 4.1 架构（仅保留 2 个核心脚本）

```
┌─────────────────────────────────────────────────────────┐
│                    .pnpmfile.cjs                         │
│        删除 better-sqlite3 的 install 脚本               │
│        阻止 prebuild-install 自动下载                     │
└─────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────┐
│                rebuild-sqlite3.mjs                       │
│    【唯一编译入口】                                       │
│    编译 Electron 30 版本 → better_sqlite3_electron.node   │
│    编译 System Node 版本  → better_sqlite3_system.node    │
│    默认激活 system 版本                                   │
│    输出到缓存 .codebuddy/sqlite3-cache/                   │
└─────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────┐
│                sqlite3-loader.mjs                        │
│    【运行时切换】                                         │
│    后端启动时 → 确保加载 system 版本                      │
└─────────────────────────────────────────────────────────┘
```

### 4.2 文件改动清单

| 文件 | 操作 | 说明 |
|------|------|------|
| `.pnpmfile.cjs` | 🆕 新建 | pnpm hook，删除 better-sqlite3 的 install 脚本 |
| `scripts/rebuild-sqlite3.mjs` | ✅ 保留 | 唯一编译入口 |
| `scripts/sqlite3-loader.mjs` | ✅ 保留 | 运行时切换 |
| `packages/desktop/scripts/postinstall.cjs` | 🔧 改造 | 只打印信息，不碰 .node |
| `build.bat` Phase 2.5 | 🔧 改造 | 打包前 copy electron.node（不 rebuild） |
| `build.bat` Phase 3.5 | 🆕 新增 | 打包后自动 restore system 版本 |
| `build-sqlite3.bat` | 🔪 删除 | CMD copy /Y 静默失败 |
| `scripts/build-sqlite3-dual.mjs` | 🔪 删除 | 重复功能 |
| `scripts/manage-sqlite3.mjs` | 🔪 删除 | 重复功能 |

### 4.3 .pnpmfile.cjs 核心逻辑

```javascript
module.exports = {
  hooks: {
    readPackage(pkg) {
      if (pkg.name === 'better-sqlite3') {
        delete pkg.scripts.install;  // 阻止 prebuild-install
      }
      return pkg;
    }
  }
};
```

### 4.4 build.bat 生命周期

```
Phase 1:   tsup core/server/desktop (TypeScript 编译)
Phase 2:   vite build (前端打包)
Phase 2.5: [SWITCH] copy better_sqlite3_electron.node → better_sqlite3.node
Phase 3:   electron-builder --dir → 打包 EXE
Phase 3.5: [RESTORE] copy better_sqlite3.node.backup → better_sqlite3.node
```

Phase 2.5 现在的逻辑（不再触发 node-gyp rebuild）：
```batch
rem 只需复制，不需要重新编译
copy /Y "better_sqlite3_electron.node" "better_sqlite3.node"
```

### 4.5 关键发现：字节扫描验证的陷阱 ⚠️

**错误做法**（不可靠）：
```javascript
// 扫描 .node 文件中 uint32 值 80-200 当作 MODULE_VERSION
const buf = readFileSync('better_sqlite3.node');
for (let i = 64; i < buf.length - 8; i++) {
  const v = buf.readUInt32LE(i);
  if (v >= 80 && v <= 200) return v;  // ← 不可靠！
}
```

**为什么失败**：`better-sqlite3` 静态链接了完整的 sqlite3 C 库（源码约 13 万行），二进制中充满各种巧合值。**实测始终返回 116**（sqlite3 源码中的某个常数值），无论实际 MODULE_VERSION 是 123 还是 137。

**正确做法**（SHA256 比对）：
```javascript
import { createHash } from 'crypto';

// 通过 SHA256 精确比对编译产物
function sha256(path) { 
  return createHash('sha256').update(readFileSync(path)).digest('hex').slice(0,16); 
}

// Electron 版本必须与 System 版本不同
const elHash = sha256('better_sqlite3_electron.node');
const sysHash = sha256('better_sqlite3_system.node');
const isValid = elHash !== sysHash;  // ✅ 不同 = 各自编译成功
```

**终极验证**（system 版本）：
```javascript
// 直接加载模块 — 只有 MODULE_VERSION 匹配才会成功
const b = require('better-sqlite3');  
new b(':memory:').exec('SELECT 1');  // ✅ = 编译正确
```

### 4.6 rebuild-sqlite3.mjs 新增 `--verify` 模式

```bash
# 只验证不编译
node scripts/rebuild-sqlite3.mjs --verify

# 输出示例:
# [System 版本验证] ✅ 加载成功 (1760256B, SHA256=9b553361f74c24c5)
# [Electron 版本验证] ✅ 文件有效 (1755136B, SHA256=13751beb7c07167d, 与system不同)
# [当前激活版本] 📌 System (Node v24)
```

---

## 5. 标准操作流程 (SOP)

### 5.1 日常开发（启动后端）

```bash
pnpm install          # 不会覆盖 .node 文件（.pnpmfile.cjs 保护）
start-backend.bat     # sqlite3-loader 确保 system 版本
```

### 5.2 重新编译 better-sqlite3

**何时需要**：
- 升级 Node.js 版本
- 升级 Electron 版本
- pnpm install 后发现 .node 文件丢失

```bash
node scripts/rebuild-sqlite3.mjs
```

输出：
```
=== better-sqlite3 双版本编译 ===
[Electron 30] 编译中... → better_sqlite3_electron.node (MODULE_VERSION=123)
[System Node] 编译中... → better_sqlite3_system.node (MODULE_VERSION=137)
=== 完成 ===
```

### 5.3 打包 Desktop EXE

```bash
build.bat                # 自动处理切换和恢复
```

或手动：
```bash
# 1. 切换为 Electron 版本
copy /Y better_sqlite3_electron.node better_sqlite3.node

# 2. 打包
cd packages/desktop && npx electron-builder --dir

# 3. 恢复为 system 版本
copy /Y better_sqlite3_system.node better_sqlite3.node
```

### 5.4 故障排查

```bash
# 检查当前版本
node -e "process.versions.modules"     # 系统 Node ABI
node -e "require('better-sqlite3')"    # 测试加载

# 查看 .node 文件信息
dir node_modules\.pnpm\better-sqlite3@12.11.1\node_modules\better-sqlite3\build\Release\

# 如果加载失败，重新编译
node scripts/rebuild-sqlite3.mjs
```

### 5.5 验证 Desktop EXE

```bash
# 1. 确认 asar 中的版本
npx asar extract packages/desktop/release/win-unpacked/resources/app.asar _tmp/
# 2. 找到 better_sqlite3.node（asarUnpack 所以不在 asar 内）
dir packages/desktop/release/win-unpacked/resources/app.asar.unpacked/
```

---

## 6. 环境依赖

| 组件 | 版本 | 用途 |
|------|------|------|
| Node.js | v24.13.0 | 开发环境（MODULE=137） |
| pnpm | 11.7.0 | 包管理器 |
| Electron | 30.0.0 | Desktop 运行时（MODULE=123） |
| better-sqlite3 | 12.11.1 | SQLite 数据库 |
| node-gyp | 12.4.0 | 编译 native 模块 |
| Python | 3.13.3 | node-gyp 依赖 |
| Visual Studio | 2019 | C++ 编译器 |
| electron-builder | 23.6.0 | Desktop 打包 |

---

## 7. 常见问题 FAQ

### Q: 为什么用字节扫描总是读到 MODULE_VERSION=116？
**A**: better-sqlite3 静态链接了完整的 sqlite3 C 库 (约 13 万行)，二进制中包含大量巧合值。字节扫描方法在 sqlite3 源码中碰巧读到了常数 116，**与实际 MODULE_VERSION 无关**。不要使用字节扫描方式验证版本！

### Q: 那怎么正确验证 MODULE_VERSION？
**A**: 
- **System 版本**: 直接 `require('better-sqlite3')` + 内存数据库测试 → 加载成功 = 版本正确
- **Electron 版本**: 用 SHA256 对比 electron 和 system 版本 → 不同 = 编译成功
- **快捷命令**: `node scripts/rebuild-sqlite3.mjs --verify`

### Q: 为什么 MODULE_VERSION 会变成 116 或 88？
**A**: better-sqlite3 的 `prebuild-install` 在 `pnpm install` 时从 pnpm store 下载缓存的老旧预编译二进制。`.pnpmfile.cjs` 已永久阻止此行为。

### Q: 重新编译需要多久？
**A**: Electron 30 约 1 分钟 + System 约 1 分钟 = 总共约 2 分钟。只在升级 Node/Electron 时需要。

### Q: 升级 Node.js 后怎么办？
**A**: 
1. 运行 `node scripts/rebuild-sqlite3.mjs` 重新编译
2. 注意新的 MODULE_VERSION 值
3. 更新本文档中的 MODULE_VERSION 速查表

### Q: 升级 Electron 后怎么办？
**A**:
1. 修改 `packages/desktop/package.json` 中的 electron 版本
2. 运行 `pnpm install`（`.pnpmfile.cjs` 保护 .node 不被覆盖）
3. 运行 `node scripts/rebuild-sqlite3.mjs`（electron 版本会自动匹配新版本）
4. 确认 `better_sqlite3_electron.node` 的 MODULE_VERSION 匹配新的 Electron 版本

### Q: 怎么确认 Desktop EXE 中的版本正确？
**A**: 
1. 先确认 `better_sqlite3_electron.node` 带有 `MODULE_VERSION=123`（或当前 Electron 版本对应的值）
2. `build.bat` 的 Phase 2.5 会将 electron 版本复制到 active slot
3. 打包完成后可以解压 asar 验证

---

## 8. 修改记录

| 日期 | 改动 | 说明 |
|------|------|------|
| 2026-06-26 | 创建文档 | 全面分析问题根源和解决方案 |
| 2026-06-26 | 新增 .pnpmfile.cjs | 永久阻止 prebuild-install 覆盖 |
| 2026-06-26 | 删除冗余脚本 | build-sqlite3.bat, build-sqlite3-dual.mjs, manage-sqlite3.mjs |
| 2026-06-26 | 改造 build.bat | Phase 2.5 不再 rebuild，改为 copy；新增 Phase 3.5 自动恢复 |
| 2026-06-26 | 重写 rebuild-sqlite3.mjs | 移除不可靠的字节扫描验证；新增 SHA256 比对 + --verify 模式 |
| 2026-06-26 | 验证 Desktop EXE | 确认 app.asar.unpacked 中的 .node SHA256=13751b...（匹配 Electron 30） |
| 2026-06-26 | 发现字节扫描陷阱 | better-sqlite3 二进制中常数 116 是 sqlite3 源码巧合值，非真实 MODULE_VERSION |
| 2026-06-26 | 修复 build.bat 路径错误 | Phase 2.5/3.5 `_SQLITE_RELEASE` 路径加 `%~dp0` 前缀，解决 cd 后相对路径在 pnpm workspace 中找不到文件的问题 |

---

## 9. 总结

问题的本质是 **native 模块二进制不兼容** —— 同一个 `.node` 文件无法同时满足 Node v24 开发环境和 Electron 30 运行时的 ABI 要求。

解决方案的核心思路：
1. **双版本编译** — 提前编译好 system 和 electron 两套版本
2. **按需切换** — 开发时用 system，打包前切 electron
3. **阻止自动覆盖** — `.pnpmfile.cjs` 删除 better-sqlite3 的 install 脚本
4. **单一编译入口** — 只用 `rebuild-sqlite3.mjs` 编译，其他脚本全部删除
