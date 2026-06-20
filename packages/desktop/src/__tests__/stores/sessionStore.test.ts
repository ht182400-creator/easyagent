/**
 * Session Store 单元测试
 * 覆盖会话、消息、Agent状态管理
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { useSessionStore } from '@/stores/sessionStore';

describe('sessionStore', () => {
  beforeEach(() => {
    useSessionStore.setState({
      sessions: [],
      messages: [],
      isRunning: false,
      currentSessionId: null,
    });
  });

  // ==================== 会话管理 ====================

  describe('会话管理', () => {
    const createSession = (overrides = {}) => ({
      id: 'session-1',
      title: '测试会话',
      workspace: '/test',
      createdAt: new Date(),
      updatedAt: new Date(),
      status: 'active' as const,
      messageCount: 0,
      tokenUsage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
      ...overrides,
    });

    it('addSession 应添加会话到列表头部', () => {
      const session = createSession();
      useSessionStore.getState().addSession(session);
      const state = useSessionStore.getState();
      expect(state.sessions).toHaveLength(1);
      expect(state.sessions[0].id).toBe('session-1');
    });

    it('addSession 新会话应排在最前面', () => {
      const s1 = createSession({ id: 's1', title: '旧会话' });
      const s2 = createSession({ id: 's2', title: '新会话' });
      useSessionStore.getState().addSession(s1);
      useSessionStore.getState().addSession(s2);
      const state = useSessionStore.getState();
      expect(state.sessions[0].id).toBe('s2');
      expect(state.sessions[1].id).toBe('s1');
    });

    it('setSessions 应替换整个会话列表', () => {
      const sessions = [createSession({ id: 'a' }), createSession({ id: 'b' })];
      useSessionStore.getState().setSessions(sessions);
      expect(useSessionStore.getState().sessions).toHaveLength(2);
    });

    it('removeSession 应移除指定会话', () => {
      useSessionStore.getState().addSession(createSession({ id: 's1' }));
      useSessionStore.getState().addSession(createSession({ id: 's2' }));
      useSessionStore.getState().removeSession('s1');
      const state = useSessionStore.getState();
      expect(state.sessions).toHaveLength(1);
      expect(state.sessions[0].id).toBe('s2');
    });

    it('removeSession 移除不存在的会话应无副作用', () => {
      useSessionStore.getState().addSession(createSession());
      useSessionStore.getState().removeSession('non-existent');
      expect(useSessionStore.getState().sessions).toHaveLength(1);
    });

    it('setCurrentSessionId 应设置当前会话', () => {
      useSessionStore.getState().setCurrentSessionId('session-1');
      expect(useSessionStore.getState().currentSessionId).toBe('session-1');

      useSessionStore.getState().setCurrentSessionId(null);
      expect(useSessionStore.getState().currentSessionId).toBeNull();
    });
  });

  // ==================== 消息管理 ====================

  describe('消息管理', () => {
    it('addMessage 应添加消息并返回 ID', () => {
      const msg = { role: 'user' as const, content: '你好', timestamp: new Date() };
      const id = useSessionStore.getState().addMessage(msg);
      const state = useSessionStore.getState();
      expect(state.messages).toHaveLength(1);
      expect(state.messages[0].id).toBe(id);
      expect(state.messages[0].role).toBe('user');
      expect(state.messages[0].content).toBe('你好');
      expect(id).toMatch(/^msg_\d+$/);
    });

    it('消息 ID 应递增', () => {
      const id1 = useSessionStore.getState().addMessage({ role: 'user', content: 'A', timestamp: new Date() });
      const id2 = useSessionStore.getState().addMessage({ role: 'user', content: 'B', timestamp: new Date() });
      const num1 = parseInt(id1.replace('msg_', ''));
      const num2 = parseInt(id2.replace('msg_', ''));
      expect(num2).toBeGreaterThan(num1);
    });

    it('appendToLastMessage 应追加内容到最后一条 assistant 消息', () => {
      useSessionStore.getState().addMessage({ role: 'assistant', content: 'Hello', timestamp: new Date() });
      useSessionStore.getState().appendToLastMessage(' World');
      const last = useSessionStore.getState().messages[0];
      expect(last.content).toBe('Hello World');
    });

    it('appendToLastMessage 应创建新 assistant 消息如果最后一条不是 assistant', () => {
      useSessionStore.getState().addMessage({ role: 'user', content: 'Hi', timestamp: new Date() });
      useSessionStore.getState().appendToLastMessage('Response');
      const state = useSessionStore.getState();
      expect(state.messages).toHaveLength(2);
      expect(state.messages[1].role).toBe('assistant');
      expect(state.messages[1].isStreaming).toBe(true);
    });

    it('appendToLastMessage 空消息列表应创建新消息', () => {
      useSessionStore.getState().appendToLastMessage('New');
      const state = useSessionStore.getState();
      expect(state.messages).toHaveLength(1);
      expect(state.messages[0].role).toBe('assistant');
    });

    it('setLastMessageStreaming 应设置流式状态', () => {
      useSessionStore.getState().addMessage({ role: 'assistant', content: '测试', timestamp: new Date() });
      useSessionStore.getState().setLastMessageStreaming(true);
      expect(useSessionStore.getState().messages[0].isStreaming).toBe(true);

      useSessionStore.getState().setLastMessageStreaming(false);
      expect(useSessionStore.getState().messages[0].isStreaming).toBe(false);
    });

    it('setLastMessageStreaming 空列表应无副作用', () => {
      useSessionStore.getState().setLastMessageStreaming(true);
      expect(useSessionStore.getState().messages).toHaveLength(0);
    });

    it('clearMessages 应清空所有消息', () => {
      useSessionStore.getState().addMessage({ role: 'user', content: 'A', timestamp: new Date() });
      useSessionStore.getState().addMessage({ role: 'assistant', content: 'B', timestamp: new Date() });
      useSessionStore.getState().clearMessages();
      expect(useSessionStore.getState().messages).toHaveLength(0);
    });
  });

  // ==================== 工具调用 ====================

  describe('工具调用管理', () => {
    it('addToolCall 应附加到最后一条 assistant 消息', () => {
      useSessionStore.getState().addMessage({ role: 'assistant', content: 'Processing...', timestamp: new Date() });
      useSessionStore.getState().addToolCall({
        id: 'tc-1',
        name: 'read_file',
        input: { path: '/test.ts' },
        status: 'running',
      });
      const msg = useSessionStore.getState().messages[0];
      expect(msg.toolCalls).toHaveLength(1);
      expect(msg.toolCalls![0].name).toBe('read_file');
    });

    it('addToolCall 最后一条非 assistant 消息应忽略', () => {
      // 没有 assistant 消息时不应崩溃
      useSessionStore.getState().addToolCall({
        id: 'tc-1',
        name: 'test',
        input: {},
        status: 'running',
      });
      // 不应添加消息或抛出异常
      expect(useSessionStore.getState().messages).toHaveLength(0);
    });

    it('updateToolCall 应更新工具调用状态', () => {
      useSessionStore.getState().addMessage({ role: 'assistant', content: '', timestamp: new Date() });
      useSessionStore.getState().addToolCall({ id: 'tc-1', name: 'search', input: {}, status: 'running' });
      useSessionStore.getState().updateToolCall('tc-1', {
        output: '找到 3 个结果',
        status: 'done',
      });
      const tc = useSessionStore.getState().messages[0].toolCalls![0];
      expect(tc.status).toBe('done');
      expect(tc.output).toBe('找到 3 个结果');
    });

    it('updateToolCall 不存在的 ID 应无副作用', () => {
      useSessionStore.getState().addMessage({ role: 'assistant', content: '', timestamp: new Date() });
      useSessionStore.getState().updateToolCall('non-existent', { status: 'done' });
      // 不应崩溃
    });

    it('多个工具调用应独立更新', () => {
      useSessionStore.getState().addMessage({ role: 'assistant', content: '', timestamp: new Date() });
      useSessionStore.getState().addToolCall({ id: 'tc-1', name: 'tool-a', input: {}, status: 'running' });
      useSessionStore.getState().addToolCall({ id: 'tc-2', name: 'tool-b', input: {}, status: 'running' });
      useSessionStore.getState().updateToolCall('tc-1', { status: 'done', output: 'OK' });
      useSessionStore.getState().updateToolCall('tc-2', { status: 'error', error: 'Failed' });
      const msg = useSessionStore.getState().messages[0];
      expect(msg.toolCalls![0].status).toBe('done');
      expect(msg.toolCalls![1].status).toBe('error');
    });
  });

  // ==================== Agent 状态 ====================

  describe('Agent 运行状态', () => {
    it('初始状态应为非运行中', () => {
      expect(useSessionStore.getState().isRunning).toBe(false);
    });

    it('setIsRunning 应切换运行状态', () => {
      useSessionStore.getState().setIsRunning(true);
      expect(useSessionStore.getState().isRunning).toBe(true);

      useSessionStore.getState().setIsRunning(false);
      expect(useSessionStore.getState().isRunning).toBe(false);
    });
  });

  // ==================== 异常边界 ====================

  describe('异常边界', () => {
    it('大量消息应正常工作', () => {
      for (let i = 0; i < 100; i++) {
        useSessionStore.getState().addMessage({
          role: i % 2 === 0 ? 'user' : 'assistant',
          content: `消息 ${i}`,
          timestamp: new Date(),
        });
      }
      expect(useSessionStore.getState().messages).toHaveLength(100);
    });

    it('特殊字符内容应正常存储', () => {
      useSessionStore.getState().addMessage({
        role: 'user',
        content: '<script>alert("XSS")</script>\n```\n{ "json": true }\n```',
        timestamp: new Date(),
      });
      expect(useSessionStore.getState().messages[0].content).toContain('<script>');
    });

    it('空字符串内容应正常存储', () => {
      useSessionStore.getState().addMessage({
        role: 'user',
        content: '',
        timestamp: new Date(),
      });
      expect(useSessionStore.getState().messages[0].content).toBe('');
    });

    it('快速交替 setRunning 应保持最终状态', () => {
      useSessionStore.getState().setIsRunning(true);
      useSessionStore.getState().setIsRunning(false);
      useSessionStore.getState().setIsRunning(true);
      expect(useSessionStore.getState().isRunning).toBe(true);
    });
  });
});
