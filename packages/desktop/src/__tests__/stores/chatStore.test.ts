/**
 * 聊天 Store 单元测试
 * 覆盖: 消息管理、工具调用、流式输出、连接状态
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useChatStore } from '@/stores/chatStore';
import type { ChatMessage, ToolCallBlock } from '@/stores/chatStore';

const SESSION_ID = 'test-session';
const SESSION_ID_2 = 'test-session-2';

/** 构造测试消息 */
function makeMsg(overrides: Partial<ChatMessage> = {}): ChatMessage {
  return {
    id: `msg_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    role: 'user',
    content: '测试消息',
    timestamp: Date.now(),
    ...overrides,
  };
}

/** 构造工具调用 */
function makeToolCall(overrides: Partial<ToolCallBlock> = {}): ToolCallBlock {
  return {
    toolCallId: `tc_${Date.now()}`,
    toolName: 'read_file',
    input: { path: '/test/file.ts' },
    status: 'running',
    ...overrides,
  };
}

describe('chatStore', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // 重置到初始状态
    useChatStore.setState({
      sessions: {},
      activeSessionId: null,
      ws: null,
      composerPrefill: '',
      _reconnectAttempts: 0,
      _reconnectTimer: null,
    });
  });

  // ==================== 初始状态 ====================

  describe('初始状态', () => {
    it('sessions 初始为空对象', () => {
      expect(useChatStore.getState().sessions).toEqual({});
    });

    it('无活跃会话', () => {
      expect(useChatStore.getState().activeSessionId).toBeNull();
    });

    it('composerPrefill 为空', () => {
      expect(useChatStore.getState().composerPrefill).toBe('');
    });
  });

  // ==================== 消息管理 ====================

  describe('addMessage / 消息管理', () => {
    it('addMessage 应添加消息并自动创建会话', () => {
      const msg = makeMsg();
      useChatStore.getState().addMessage(SESSION_ID, msg);

      const state = useChatStore.getState();
      expect(state.sessions[SESSION_ID]).toBeDefined();
      expect(state.sessions[SESSION_ID].messages).toHaveLength(1);
      expect(state.sessions[SESSION_ID].messages[0].content).toBe('测试消息');
    });

    it('多条消息应按顺序追加', () => {
      const msg1 = makeMsg({ content: '第一条' });
      const msg2 = makeMsg({ content: '第二条' });
      const msg3 = makeMsg({ content: '第三条', role: 'assistant' });

      useChatStore.getState().addMessage(SESSION_ID, msg1);
      useChatStore.getState().addMessage(SESSION_ID, msg2);
      useChatStore.getState().addMessage(SESSION_ID, msg3);

      const msgs = useChatStore.getState().sessions[SESSION_ID].messages;
      expect(msgs).toHaveLength(3);
      expect(msgs.map((m) => m.content)).toEqual(['第一条', '第二条', '第三条']);
    });

    it('消息 ID 应保持独立', () => {
      const msg1 = makeMsg();
      const msg2 = makeMsg();
      useChatStore.getState().addMessage(SESSION_ID, msg1);
      useChatStore.getState().addMessage(SESSION_ID, msg2);

      const ids = useChatStore.getState().sessions[SESSION_ID].messages.map((m) => m.id);
      expect(ids[0]).not.toBe(ids[1]);
    });

    it('支持所有消息角色', () => {
      const roles = ['user', 'assistant', 'system', 'tool'] as const;
      roles.forEach((role) => {
        useChatStore.getState().addMessage(SESSION_ID, makeMsg({ role, content: role }));
      });
      const msgs = useChatStore.getState().sessions[SESSION_ID].messages;
      expect(msgs).toHaveLength(4);
      expect(msgs.map((m) => m.role)).toEqual(roles);
    });
  });

  // ==================== updateMessage ====================

  describe('updateMessage', () => {
    it('应更新指定消息的字段', () => {
      const msg = makeMsg();
      useChatStore.getState().addMessage(SESSION_ID, msg);
      useChatStore.getState().updateMessage(SESSION_ID, msg.id, {
        content: '更新后的内容',
        isStreaming: true,
      });

      const updated = useChatStore.getState().sessions[SESSION_ID].messages[0];
      expect(updated.content).toBe('更新后的内容');
      expect(updated.isStreaming).toBe(true);
      expect(updated.role).toBe('user'); // 未修改的字段保持不变
    });

    it('更新不存在的消息 ID 应无副作用', () => {
      useChatStore.getState().addMessage(SESSION_ID, makeMsg());
      useChatStore.getState().updateMessage(SESSION_ID, 'non-existent', { content: 'x' });
      expect(useChatStore.getState().sessions[SESSION_ID].messages[0].content).toBe('测试消息');
    });

    it('更新不存在的会话应无副作用', () => {
      expect(() => {
        useChatStore.getState().updateMessage('no-session', 'msg-1', { content: 'x' });
      }).not.toThrow();
    });
  });

  // ==================== addToolCall ====================

  describe('addToolCall', () => {
    it('应为指定消息添加工具调用', () => {
      const msg = makeMsg({ role: 'assistant' });
      useChatStore.getState().addMessage(SESSION_ID, msg);

      const tc = makeToolCall();
      useChatStore.getState().addToolCall(SESSION_ID, msg.id, tc);

      const msgs = useChatStore.getState().sessions[SESSION_ID].messages;
      expect(msgs[0].toolCalls).toHaveLength(1);
      expect(msgs[0].toolCalls![0].toolName).toBe('read_file');
    });

    it('多个工具调用应独立存储', () => {
      const msg = makeMsg({ role: 'assistant' });
      useChatStore.getState().addMessage(SESSION_ID, msg);

      useChatStore.getState().addToolCall(SESSION_ID, msg.id, makeToolCall({ toolName: 'tool_a' }));
      useChatStore.getState().addToolCall(SESSION_ID, msg.id, makeToolCall({ toolName: 'tool_b' }));
      useChatStore.getState().addToolCall(SESSION_ID, msg.id, makeToolCall({ toolName: 'tool_c' }));

      const tcNames = useChatStore.getState().sessions[SESSION_ID].messages[0].toolCalls!.map((tc) => tc.toolName);
      expect(tcNames).toEqual(['tool_a', 'tool_b', 'tool_c']);
    });

    it('不存在的消息 ID 应无副作用', () => {
      useChatStore.getState().addMessage(SESSION_ID, makeMsg());
      expect(() => {
        useChatStore.getState().addToolCall(SESSION_ID, 'fake-msg', makeToolCall());
      }).not.toThrow();
    });
  });

  // ==================== updateToolCall ====================

  describe('updateToolCall', () => {
    it('应更新工具调用状态', () => {
      const msg = makeMsg({ role: 'assistant' });
      useChatStore.getState().addMessage(SESSION_ID, msg);
      const tc = makeToolCall();
      useChatStore.getState().addToolCall(SESSION_ID, msg.id, tc);

      useChatStore.getState().updateToolCall(SESSION_ID, msg.id, tc.toolCallId, {
        status: 'done',
        output: '文件内容...',
      });

      const updated = useChatStore.getState().sessions[SESSION_ID].messages[0].toolCalls![0];
      expect(updated.status).toBe('done');
      expect(updated.output).toBe('文件内容...');
    });

    it('更新不存在的 toolCallId 应无副作用', () => {
      const msg = makeMsg({ role: 'assistant' });
      useChatStore.getState().addMessage(SESSION_ID, msg);
      useChatStore.getState().addToolCall(SESSION_ID, msg.id, makeToolCall());

      useChatStore.getState().updateToolCall(SESSION_ID, msg.id, 'non-existent', { status: 'done' });
      expect(useChatStore.getState().sessions[SESSION_ID].messages[0].toolCalls![0].status).toBe('running');
    });
  });

  // ==================== clearMessages ====================

  describe('clearMessages', () => {
    it('应清空指定会话的消息', () => {
      useChatStore.getState().addMessage(SESSION_ID, makeMsg());
      useChatStore.getState().addMessage(SESSION_ID, makeMsg({ role: 'assistant' }));

      useChatStore.getState().clearMessages(SESSION_ID);
      const session = useChatStore.getState().sessions[SESSION_ID];
      expect(session.messages).toHaveLength(0);
      expect(session.streamingText).toBe('');
    });

    it('不清空其他会话', () => {
      useChatStore.getState().addMessage(SESSION_ID, makeMsg({ content: '会话A' }));
      useChatStore.getState().addMessage(SESSION_ID_2, makeMsg({ content: '会话B' }));

      useChatStore.getState().clearMessages(SESSION_ID);
      expect(useChatStore.getState().sessions[SESSION_ID_2].messages).toHaveLength(1);
      expect(useChatStore.getState().sessions[SESSION_ID_2].messages[0].content).toBe('会话B');
    });
  });

  // ==================== 会话隔离 ====================

  describe('会话隔离', () => {
    it('不同会话的消息应完全隔离', () => {
      useChatStore.getState().addMessage(SESSION_ID, makeMsg({ content: 'A-1' }));
      useChatStore.getState().addMessage(SESSION_ID_2, makeMsg({ content: 'B-1' }));
      useChatStore.getState().addMessage(SESSION_ID, makeMsg({ content: 'A-2', role: 'assistant' }));

      const state = useChatStore.getState();
      expect(state.sessions[SESSION_ID].messages).toHaveLength(2);
      expect(state.sessions[SESSION_ID_2].messages).toHaveLength(1);
    });

    it('工具调用在会话间隔离', () => {
      const msgA = makeMsg({ role: 'assistant', content: 'A' });
      const msgB = makeMsg({ role: 'assistant', content: 'B' });
      useChatStore.getState().addMessage(SESSION_ID, msgA);
      useChatStore.getState().addMessage(SESSION_ID_2, msgB);
      useChatStore.getState().addToolCall(SESSION_ID, msgA.id, makeToolCall({ toolName: 'tool-a' }));
      useChatStore.getState().addToolCall(SESSION_ID_2, msgB.id, makeToolCall({ toolName: 'tool-b' }));

      const aTCs = useChatStore.getState().sessions[SESSION_ID].messages[0].toolCalls!;
      const bTCs = useChatStore.getState().sessions[SESSION_ID_2].messages[0].toolCalls!;
      expect(aTCs[0].toolName).toBe('tool-a');
      expect(bTCs[0].toolName).toBe('tool-b');
    });
  });

  // ==================== setActiveSession ====================

  describe('setActiveSession', () => {
    it('应设置活跃会话 ID', () => {
      useChatStore.getState().setActiveSession('session-abc');
      expect(useChatStore.getState().activeSessionId).toBe('session-abc');
    });
  });

  // ==================== setGenerating ====================

  describe('setGenerating', () => {
    it('应设置生成状态', () => {
      useChatStore.getState().setGenerating(SESSION_ID, true);
      expect(useChatStore.getState().sessions[SESSION_ID].isGenerating).toBe(true);

      useChatStore.getState().setGenerating(SESSION_ID, false);
      expect(useChatStore.getState().sessions[SESSION_ID].isGenerating).toBe(false);
    });
  });

  // ==================== 流式文本 ====================

  describe('流式文本管理', () => {
    it('setStreamingText 应设置流式文本', () => {
      useChatStore.getState().setStreamingText(SESSION_ID, '正在生成...');
      expect(useChatStore.getState().sessions[SESSION_ID].streamingText).toBe('正在生成...');
    });

    it('appendStreamingText 应追加文本', () => {
      useChatStore.getState().setStreamingText(SESSION_ID, 'Hello');
      useChatStore.getState().appendStreamingText(SESSION_ID, ' World');
      expect(useChatStore.getState().sessions[SESSION_ID].streamingText).toBe('Hello World');
    });
  });

  // ==================== 连接状态 ====================

  describe('setConnectionState', () => {
    it('应更新连接状态', () => {
      const states = ['disconnected', 'connecting', 'connected', 'error'] as const;
      for (const s of states) {
        useChatStore.getState().setConnectionState(SESSION_ID, s);
        expect(useChatStore.getState().sessions[SESSION_ID].connectionState).toBe(s);
      }
    });

    it('初始连接状态为 disconnected', () => {
      useChatStore.getState().addMessage(SESSION_ID, makeMsg());
      expect(useChatStore.getState().sessions[SESSION_ID].connectionState).toBe('disconnected');
    });
  });

  // ==================== Composer预填 ====================

  describe('composerPrefill', () => {
    it('setComposerPrefill 应设置预填文本', () => {
      useChatStore.getState().setComposerPrefill('预填内容');
      expect(useChatStore.getState().composerPrefill).toBe('预填内容');
    });

    it('clearComposerPrefill 应清空预填文本', () => {
      useChatStore.getState().setComposerPrefill('内容');
      useChatStore.getState().clearComposerPrefill();
      expect(useChatStore.getState().composerPrefill).toBe('');
    });
  });

  // ==================== 异常边界 ====================

  describe('异常边界', () => {
    it('大量消息应正常工作', () => {
      for (let i = 0; i < 100; i++) {
        useChatStore.getState().addMessage(
          SESSION_ID,
          makeMsg({ content: `消息 ${i}`, role: i % 2 === 0 ? 'user' : 'assistant' })
        );
      }
      expect(useChatStore.getState().sessions[SESSION_ID].messages).toHaveLength(100);
    });

    it('特殊字符内容应正常存储', () => {
      const special = ['<script>alert(1)</script>', '&lt;&gt;&amp;', '你好👋🌍', '{\\"key\\": \\"value\\"}'];
      special.forEach((c) => {
        useChatStore.getState().addMessage(SESSION_ID, makeMsg({ content: c }));
      });
      const contents = useChatStore.getState().sessions[SESSION_ID].messages.map((m) => m.content);
      expect(contents).toEqual(special);
    });

    it('空字符串内容应正常存储', () => {
      useChatStore.getState().addMessage(SESSION_ID, makeMsg({ content: '' }));
      expect(useChatStore.getState().sessions[SESSION_ID].messages[0].content).toBe('');
    });

    it('快速切换生成状态应保持最终值', () => {
      useChatStore.getState().setGenerating(SESSION_ID, true);
      useChatStore.getState().setGenerating(SESSION_ID, true);
      useChatStore.getState().setGenerating(SESSION_ID, false);
      useChatStore.getState().setGenerating(SESSION_ID, false);
      expect(useChatStore.getState().sessions[SESSION_ID].isGenerating).toBe(false);
    });
  });
});
