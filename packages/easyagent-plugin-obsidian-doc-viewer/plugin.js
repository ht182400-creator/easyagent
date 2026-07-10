/**
* EasyAgent Plugin: Obsidian Doc Viewer
*
* 该插件在 EasyAgent 中注册一个工具，用于启动文档浏览器。
* 完整 UI 位于 D:\Work_Area\AI\Doc_project，此处为入口包装。
*
* @param {import('@easyagent/core').IPluginContext} context
*/
export default function plugin(context) {
  context.registerTool({
    name: 'open-doc-viewer',
    description: '打开 Obsidian 风格的文档浏览器，查看项目 Markdown 文档的关系图谱',
    parameters: {
      type: 'object',
      properties: {
        workspacePath: {
          type: 'string',
          description: '要浏览的文档目录路径，默认为当前工作区',
        },
      },
      // 显式标注无必需参数：参数全部可选，避免小模型（如 Qwen3.5:9B）
      // 因为无法决定传什么而硬塞无效值；同时 PluginSandbox 也会兜底校验
    },
    async execute({ workspacePath }) {
      // MVP 阶段：返回启动提示
      // 后续可调用 Electron API 打开独立窗口或嵌入面板
      //
      // 重要：必须返回符合 ITool.execute 契约的 ToolResult 对象 { success, content, error }
      // 而不是原始字符串。PluginSandbox.createProxyTool 也会做兜底规范化，但插件侧遵守契约
      // 是首要责任（参考 packages/plugin-template/plugin.js）。
      return {
        success: true,
        content: `文档浏览器已启动，工作区: ${workspacePath || '当前目录'}`,
      };
    },
  });
}
