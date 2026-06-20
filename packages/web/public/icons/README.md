# EasyAgent 图标清单

所有自定义图标请放置在当前目录下。图标格式建议：SVG（首选）或 PNG (≥48x48)。
现已提供 22 个示例 SVG 占位图标，可直接替换。

**预览**: 打开 `preview.html` 查看所有图标在深色主题下的视觉效果。

## 需要替换的图标列表

### 🎯 Logo 品牌类 (2个)

| 文件名 | 用途 | 规格 | 示例图形 | 替换建议 |
|--------|------|------|----------|----------|
| `logo.svg` | 侧边栏 Logo | 32×32 | 六边形 + 字母 E | 替换为自己的品牌 Logo |
| `hero-logo.svg` | 主页大 Logo | 64×64 | 双层六边形 + 粗体 E | 替换为更精美的品牌标识 |

### ⚡ 快捷操作入口 (4个)

| 文件名 | 用途 | 规格 | 示例图形 |
|--------|------|------|----------|
| `icon-chat.svg` | 新建对话 | 24×24 | 对话气泡 + 加号 |
| `icon-browse.svg` | 浏览工具 | 24×24 | 文件夹 + 缩放搜索 |
| `icon-knowledge.svg` | 知识库 | 24×24 | 书本 + 灯管标记 |
| `icon-settings.svg` | 系统设置 | 24×24 | 齿轮 |

### 📊 统计数据卡片 (4个)

| 文件名 | 用途 | 规格 | 示例图形 |
|--------|------|------|----------|
| `icon-model.svg` | 已配置模型 | 20×20 | AI芯片/处理器 |
| `icon-session.svg` | 活跃会话 | 20×20 | 迷你对话气泡 |
| `icon-tools.svg` | 可用工具 | 20×20 | 扳手组合 |
| `icon-token.svg` | Token 用量 | 20×20 | 圆形 T 代币 |

### 🧩 智能模板卡片 (6个)

| 文件名 | 用途 | 规格 | 示例图形 |
|--------|------|------|----------|
| `icon-template-code.svg` | 代码生成 | 24×24 | `<>` 尖括号 + 斜线 |
| `icon-template-doc.svg` | 文档写作 | 24×24 | 文件 + 折角 |
| `icon-template-research.svg` | 深度研究 | 24×24 | 放大镜 + 十字准星 |
| `icon-template-data.svg` | 数据分析 | 24×24 | 柱状图 |
| `icon-template-create.svg` | 创意设计 | 24×24 | 灯泡 |
| `icon-template-debug.svg` | 代码调试 | 24×24 | 甲虫(Bug) |

### ⌨️ 输入控件 + 其他 (6个)

| 文件名 | 用途 | 规格 | 示例图形 |
|--------|------|------|----------|
| `icon-send.svg` | 发送消息 | 20×20 | 右上箭头 |
| `icon-attach.svg` | 附件上传 | 20×20 | 回形针 |
| `icon-mic.svg` | 语音输入 | 20×20 | 麦克风 |
| `icon-arrow-right.svg` | 跳转箭头 | 16×16 | 右箭头 |
| `icon-star.svg` | 收藏星标 | 16×16 | 五角星 |
| `icon-plugin.svg` | 插件入口 | 16×16 | 拼图块 |

## 替换方法

```
1. 用你的设计工具导出 SVG（确保 fill="currentColor" 支持主题切换）
2. 保持相同文件名覆盖到本目录
3. cd packages/web && npx vite build   （重新构建）
```

## 注意事项

- 所有 SVG 图标建议使用 `currentColor` 作为 fill/stroke 颜色以支持主题切换
- PNG 图标建议提供 `@2x` 版本 (如 icon-chat.png + icon-chat@2x.png)
- preview.html 可在浏览器直接打开，查看所有图标的当前效果
- 配色建议: 暗色主题用 #e6edf3, 亮色主题用 #1f2328
