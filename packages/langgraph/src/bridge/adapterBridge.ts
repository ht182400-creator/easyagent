/**
 * adapterBridge — 将 EasyAgent BaseAdapter 包装为 LangGraph ThinkNodeConfig.chat 回调
 *
 * 解决 core ↔ langgraph 两套类型体系之间的差异：
 * - core Message.content: string | ContentBlock[]
 *   → langgraph ChatMessage.content: string（thinkNode 内部 toChatMessages 已保证为 string）
 * - core ChatResponse 包含 id/model/langgraph 不需要的字段
 *
 * @module bridge/adapterBridge
 */
import type { BaseAdapter, Message, ChatResponse as CoreChatResponse, ChatOptions as CoreChatOptions } from '@easyagent/core';
import type { ThinkNodeConfig } from '../nodes/thinkNode';

/**
 * 将 BaseAdapter.chat() 包装为 thinkNode 所需的 chat 回调。
 *
 * thinkNode 内部通过 toChatMessages() 已将 BaseMessage[] → ChatMessage[]，
 * 其中 content 保证为 string，因此转换过程是类型安全的直通映射。
 *
 * @param adapter - EasyAgent 的模型适配器实例
 * @returns 符合 ThinkNodeConfig.chat 签名的回调函数
 *
 * @example
 * const bridge = createAdapterBridge(adapter);
 * const agent = new LangGraphAgent({ think: { chat: bridge, ... }, ... });
 */
export function createAdapterBridge(adapter: BaseAdapter): ThinkNodeConfig['chat'] {
  return async (chatMessages, chatOptions) => {
    // 1. ChatMessage[] → core Message[]
    const coreMessages: Message[] = chatMessages.map((msg) => ({
      role: msg.role,
      content: msg.content,               // thinkNode 保证始终为 string
      tool_calls: msg.tool_calls?.map((tc) => ({
        id: tc.id,
        type: 'function' as const,
        function: { name: tc.function.name, arguments: tc.function.arguments },
      })),
      tool_call_id: msg.tool_call_id,
      name: msg.name,
    }));

    // 2. langgraph ChatOptions → core ChatOptions
    const coreOptions: CoreChatOptions = {};
    if (chatOptions?.tools) {
      // ToolDef.parameters.properties 类型在运行时与 core 的 ToolDefinition 兼容
      coreOptions.tools = chatOptions.tools.map((t) => ({
        name: t.name,
        description: t.description,
        parameters: {
          type: 'object' as const,
          properties: t.parameters.properties as Record<string, unknown>,
          required: t.parameters.required,
        },
      })) as CoreChatOptions['tools'];
    }
    if (chatOptions?.toolChoice != null) {
      coreOptions.toolChoice = chatOptions.toolChoice as CoreChatOptions['toolChoice'];
    }
    if (chatOptions?.signal) {
      coreOptions.signal = chatOptions.signal;
    }

    // 3. 调用 BaseAdapter.chat()
    const coreResponse: CoreChatResponse = await adapter.chat(coreMessages, coreOptions);

    // 4. core ChatResponse → langgraph ChatResponse
    return {
      content: coreResponse.content,
      toolCalls: coreResponse.toolCalls?.map((tc) => ({
        id: tc.id,
        type: 'function' as const,
        function: { name: tc.function.name, arguments: tc.function.arguments },
      })),
      finishReason: coreResponse.finishReason,
      usage: coreResponse.usage
        ? { inputTokens: coreResponse.usage.inputTokens, outputTokens: coreResponse.usage.outputTokens }
        : undefined,
    };
  };
}
