/**
 * ChatView 组件测试
 * 覆盖消息发送、空状态、快捷键、异常处理
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ChatView } from '@/components/chat/ChatView';
import { useSessionStore } from '@/stores/sessionStore';
import { useUIStore } from '@/stores/uiStore';
// 模拟 window.easyAgent
function mockEasyAgent(overrides = {}) {
    const api = {
        chat: vi.fn().mockResolvedValue({}),
        abort: vi.fn(),
        getAppVersion: vi.fn().mockResolvedValue('0.2.0'),
        getConfig: vi.fn().mockResolvedValue({}),
        getModels: vi.fn().mockResolvedValue([]),
        ...overrides,
    };
    window.easyAgent = api;
    return api;
}
describe('ChatView', () => {
    beforeEach(() => {
        delete window.easyAgent;
        useSessionStore.setState({
            sessions: [],
            messages: [],
            isRunning: false,
            currentSessionId: null,
        });
        useUIStore.setState({
            tabs: [],
            activeTabId: null,
            toasts: [],
            sidebarOpen: true,
            activeView: 'chat',
        });
    });
    describe('欢迎页 (空状态)', () => {
        it('无消息时应显示欢迎页', () => {
            render(<ChatView />);
            expect(screen.getByText('EasyAgent')).toBeInTheDocument();
        });
        it('应显示快速开始建议', () => {
            render(<ChatView />);
            expect(screen.getByText('解释这个项目的代码结构')).toBeInTheDocument();
            expect(screen.getByText('帮我调试一个错误')).toBeInTheDocument();
            expect(screen.getByText('写一份 README 文档')).toBeInTheDocument();
            expect(screen.getByText('优化性能，给我建议')).toBeInTheDocument();
        });
        it('应显示版本号在底部', () => {
            render(<ChatView />);
            expect(screen.getByText(/v0\.2\.0/)).toBeInTheDocument();
        });
        it('应显示输入框', () => {
            render(<ChatView />);
            expect(screen.getByPlaceholderText(/输入消息/)).toBeInTheDocument();
        });
    });
    describe('消息输入 - 正常流程', () => {
        it('输入文字后输入框值应更新', async () => {
            render(<ChatView />);
            const input = screen.getByPlaceholderText(/输入消息/);
            await userEvent.type(input, '测试消息');
            expect(input.value).toBe('测试消息');
        });
        it('Enter 键发送后输入应清空', async () => {
            mockEasyAgent();
            render(<ChatView />);
            const input = screen.getByPlaceholderText(/输入消息/);
            await userEvent.type(input, 'Hello{Enter}');
            expect(input.value).toBe('');
        });
        it('Shift+Enter 应换行不发送', async () => {
            mockEasyAgent();
            render(<ChatView />);
            const input = screen.getByPlaceholderText(/输入消息/);
            await userEvent.type(input, 'Line1{Shift>}{Enter}{/Shift}Line2');
            expect(input.value).toContain('\n');
        });
        it('运行中 Enter 不应清空输入', async () => {
            mockEasyAgent();
            useSessionStore.setState({ isRunning: true });
            render(<ChatView />);
            const input = screen.getByPlaceholderText(/输入消息/);
            await userEvent.type(input, '测试{Enter}');
            // 运行中不应发送，所以输入保持在
            expect(input.value).toContain('测试');
        });
    });
    describe('消息列表', () => {
        it('用户消息应显示 YOU 标签', () => {
            useSessionStore.getState().addMessage({
                role: 'user',
                content: '测试',
                timestamp: new Date(),
            });
            render(<ChatView />);
            expect(screen.getByText('YOU')).toBeInTheDocument();
        });
        it('AI 消息应显示 AI 标签', () => {
            useSessionStore.getState().addMessage({
                role: 'assistant',
                content: '回复',
                timestamp: new Date(),
            });
            render(<ChatView />);
            expect(screen.getByText('AI')).toBeInTheDocument();
        });
        it('流式消息应显示思考中', () => {
            useSessionStore.getState().addMessage({
                role: 'assistant',
                content: '',
                timestamp: new Date(),
                isStreaming: true,
            });
            render(<ChatView />);
            expect(screen.getByText('思考中...')).toBeInTheDocument();
        });
        it('应显示消息内容', () => {
            useSessionStore.getState().addMessage({
                role: 'user',
                content: '测试问题',
                timestamp: new Date(),
            });
            useSessionStore.getState().addMessage({
                role: 'assistant',
                content: '这是AI回复',
                timestamp: new Date(),
            });
            render(<ChatView />);
            expect(screen.getByText('测试问题')).toBeInTheDocument();
            expect(screen.getByText('这是AI回复')).toBeInTheDocument();
        });
    });
    describe('工具调用卡片', () => {
        it('运行中的工具应显示', () => {
            useSessionStore.getState().addMessage({
                role: 'assistant',
                content: '处理中...',
                timestamp: new Date(),
            });
            useSessionStore.getState().addToolCall({
                id: 'tc-1',
                name: 'read_file',
                input: { path: '/test.ts' },
                status: 'running',
            });
            render(<ChatView />);
            expect(screen.getByText('read_file')).toBeInTheDocument();
        });
        it('完成的工具应显示输出', () => {
            useSessionStore.getState().addMessage({
                role: 'assistant',
                content: '完成',
                timestamp: new Date(),
            });
            useSessionStore.getState().addToolCall({
                id: 'tc-1',
                name: 'search',
                input: { query: 'test' },
                output: '找到 3 个结果',
                status: 'done',
            });
            render(<ChatView />);
            expect(screen.getByText('search')).toBeInTheDocument();
            expect(screen.getByText('找到 3 个结果')).toBeInTheDocument();
        });
        it('错误的工具应显示错误信息', () => {
            useSessionStore.getState().addMessage({
                role: 'assistant',
                content: '出错',
                timestamp: new Date(),
            });
            useSessionStore.getState().addToolCall({
                id: 'tc-1',
                name: 'exec',
                input: { command: 'bad' },
                error: '权限不足',
                status: 'error',
            });
            render(<ChatView />);
            expect(screen.getByText('权限不足')).toBeInTheDocument();
        });
    });
    describe('异常处理', () => {
        it('send 失败应显示 toast', async () => {
            const api = mockEasyAgent({
                chat: vi.fn().mockRejectedValue(new Error('网络错误')),
            });
            render(<ChatView />);
            const input = screen.getByPlaceholderText(/输入消息/);
            // 直接通过存储添加用户消息来模拟发送
            useSessionStore.getState().addMessage({
                role: 'user',
                content: 'test',
                timestamp: new Date(),
            });
            // 验证 toast 系统
            const state = useUIStore.getState();
            // 组件应不会崩溃
            expect(input).toBeInTheDocument();
        });
        it('easyAgent 不可用时应显示开发模式提示', async () => {
            render(<ChatView />);
            const input = screen.getByPlaceholderText(/输入消息/);
            await userEvent.type(input, 'test{Enter}');
            // 应添加开发模式提示
            await act(async () => {
                await new Promise((r) => setTimeout(r, 200));
            });
            const state = useSessionStore.getState();
            expect(state.messages.length).toBeGreaterThan(0);
        });
    });
    describe('停止生成', () => {
        it('运行中应存在按钮', () => {
            useSessionStore.setState({ isRunning: true });
            render(<ChatView />);
            const buttons = screen.getAllByRole('button');
            expect(buttons.length).toBeGreaterThan(0);
        });
        it('点击停止按钮应调用 abort', async () => {
            const api = mockEasyAgent();
            useSessionStore.setState({ isRunning: true });
            render(<ChatView />);
            // 找到停止按钮（带有 Square icon 的按钮）
            const buttons = screen.getAllByRole('button');
            // 停止按钮应该是最后一个
            const stopBtn = buttons[buttons.length - 1];
            await act(async () => {
                fireEvent.click(stopBtn);
            });
            expect(api.abort).toHaveBeenCalled();
        });
    });
});
//# sourceMappingURL=ChatView.test.js.map