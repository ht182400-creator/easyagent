# EasyAgent 插件模板

> 用于创建新的 EasyAgent 第三方插件

## 快速开始

```bash
# 复制本模板
cp -r packages/plugin-template my-plugin

# 修改 manifest.json
# 实现 plugin.js

# 安装到 EasyAgent
# 设置 → 第三方插件 → 本地安装
```

## 文件结构

```
my-plugin/
├── manifest.json    # 插件元信息
├── plugin.js        # 入口文件
├── README.md        # 插件说明
└── icon.svg         # 插件图标
```

## manifest.json 示例

```json
{
  "name": "my-plugin",
  "version": "1.0.0",
  "description": "My first EasyAgent plugin",
  "main": "plugin.js",
  "author": "your-name",
  "license": "MIT",
  "permissions": {
    "filesystem": { "read": ["**/*.md"], "write": false }
  }
}
```

## plugin.js 示例

```javascript
/**
 * EasyAgent 插件入口
 * @param {import('@easyagent/core').IPluginContext} context
 */
export default function plugin(context) {
  context.registerTool({
    name: 'hello',
    description: 'Say hello',
    parameters: { type: 'object', properties: {} },
    async execute() {
      return 'Hello from my plugin!';
    },
  });
}
```
