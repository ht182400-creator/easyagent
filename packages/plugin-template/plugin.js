/**
* EasyAgent 插件模板
*
* 一个最小可运行的插件示例：注册一个 say-hello 工具。
*
* 重要：execute 必须返回符合 ITool 契约的 ToolResult 对象
*   { success: boolean, content: string, error?: string }
* 而**不是**原始字符串。虽然 PluginSandbox.createProxyTool 会做兜底规范化，
* 但插件侧遵守契约是首要责任（否则 actNode 会把"半结构化返回"误判为工具错误）。
*
* @param {import('@easyagent/core').IPluginContext} context
*/
export default function plugin(context) {
  context.registerTool({
    name: 'say-hello',
    description: '向用户打招呼',
    parameters: {
      type: 'object',
      properties: {
        name: {
          type: 'string',
          description: '用户名称',
        },
      },
      required: ['name'],
    },
    async execute({ name }) {
      return {
        success: true,
        content: `Hello, ${name}! This is from plugin-template.`,
      };
    },
  });
}
