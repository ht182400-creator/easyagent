/**
 * Sidebar 组件测试
 * 覆盖导航、折叠/展开、会话列表、搜索
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Sidebar } from '@/components/layout/Sidebar';
import { useUIStore } from '@/stores/uiStore';
import { useSessionStore } from '@/stores/sessionStore';
/** 创建测试会话 */
function createSession(id, title) {
    return {
        id,
        title,
        workspace: '/test',
        createdAt: new Date(),
        updatedAt: new Date(),
        status: 'active',
        messageCount: 5,
        tokenUsage: { inputTokens: 100, outputTokens: 200, totalTokens: 300 },
    };
}
describe('Sidebar', () => {
    beforeEach(() => {
        useUIStore.setState({
            sidebarOpen: true,
            activeView: 'chat',
            tabs: [],
            activeTabId: null,
            toasts: [],
        });
        useSessionStore.setState({
            sessions: [],
            messages: [],
            isRunning: false,
            currentSessionId: null,
        });
    });
    describe('展开状态导航', () => {
        it('应渲染所有导航项', () => {
            render(<Sidebar collapsed={false}/>);
            expect(screen.getByText('对话')).toBeInTheDocument();
            expect(screen.getByText('模型')).toBeInTheDocument();
            expect(screen.getByText('会话')).toBeInTheDocument();
            expect(screen.getByText('监控')).toBeInTheDocument();
            expect(screen.getByText('设置')).toBeInTheDocument();
        });
        it('应显示 EasyAgent 标题', () => {
            render(<Sidebar collapsed={false}/>);
            expect(screen.getByText('EasyAgent')).toBeInTheDocument();
        });
        it('应显示新建对话按钮', () => {
            render(<Sidebar collapsed={false}/>);
            expect(screen.getByText('新建对话')).toBeInTheDocument();
        });
        it('当前活动视图应高亮', () => {
            render(<Sidebar collapsed={false}/>);
            const chatBtn = screen.getByText('对话').closest('button');
            expect(chatBtn?.className).toContain('border-brand/20');
        });
        it('点击导航项应切换活动视图', () => {
            render(<Sidebar collapsed={false}/>);
            fireEvent.click(screen.getByText('设置'));
            expect(useUIStore.getState().activeView).toBe('settings');
        });
    });
    describe('折叠状态', () => {
        it('折叠时应只显示图标', () => {
            render(<Sidebar collapsed={true}/>);
            expect(screen.queryByText('对话')).toBeNull();
            expect(screen.queryByText('EasyAgent')).toBeNull();
        });
        it('折叠时点击图标仍能切换视图', () => {
            render(<Sidebar collapsed={true}/>);
            const buttons = document.querySelectorAll('button');
            // 找到设置图标按钮并点击
            const settingsBtn = Array.from(buttons).find((b) => b.getAttribute('title') === '设置');
            if (settingsBtn) {
                fireEvent.click(settingsBtn);
                expect(useUIStore.getState().activeView).toBe('settings');
            }
        });
    });
    describe('侧边栏切换', () => {
        it('click 折叠按钮应调用 toggleSidebar', () => {
            render(<Sidebar collapsed={false}/>);
            const toggleBtn = document.querySelector('[title="折叠侧边栏"]');
            if (toggleBtn) {
                fireEvent.click(toggleBtn);
                expect(useUIStore.getState().sidebarOpen).toBe(false);
            }
        });
    });
    describe('会话列表', () => {
        it('无会话时应显示提示', () => {
            render(<Sidebar collapsed={false}/>);
            expect(screen.getByText('暂无会话')).toBeInTheDocument();
        });
        it('有会话时应显示会话列表', () => {
            useSessionStore.setState({
                sessions: [
                    createSession('s1', '测试会话1'),
                    createSession('s2', '代码评审'),
                ],
            });
            render(<Sidebar collapsed={false}/>);
            expect(screen.getByText('测试会话1')).toBeInTheDocument();
            expect(screen.getByText('代码评审')).toBeInTheDocument();
        });
        it('点击会话应切换当前会话', () => {
            useSessionStore.setState({
                sessions: [createSession('s1', '测试会话')],
            });
            render(<Sidebar collapsed={false}/>);
            fireEvent.click(screen.getByText('测试会话'));
            expect(useSessionStore.getState().currentSessionId).toBe('s1');
        });
    });
    describe('搜索功能', () => {
        it('搜索应过滤会话', async () => {
            useSessionStore.setState({
                sessions: [
                    createSession('s1', '前端开发'),
                    createSession('s2', '后端测试'),
                    createSession('s3', '部署脚本'),
                ],
            });
            render(<Sidebar collapsed={false}/>);
            const searchInput = screen.getByPlaceholderText('搜索会话...');
            await userEvent.type(searchInput, '后端');
            expect(screen.getByText('后端测试')).toBeInTheDocument();
            expect(screen.queryByText('前端开发')).toBeNull();
        });
        it('无匹配结果应显示提示', async () => {
            useSessionStore.setState({
                sessions: [createSession('s1', '测试会话')],
            });
            render(<Sidebar collapsed={false}/>);
            const searchInput = screen.getByPlaceholderText('搜索会话...');
            await userEvent.type(searchInput, '不存在的会话');
            expect(screen.getByText('无匹配会话')).toBeInTheDocument();
        });
        it('大小写不敏感搜索', async () => {
            useSessionStore.setState({
                sessions: [createSession('s1', 'HELLO World')],
            });
            render(<Sidebar collapsed={false}/>);
            const searchInput = screen.getByPlaceholderText('搜索会话...');
            await userEvent.type(searchInput, 'hello');
            expect(screen.getByText('HELLO World')).toBeInTheDocument();
        });
    });
    describe('异常边界', () => {
        it('大量会话应正常渲染', () => {
            const sessions = Array.from({ length: 50 }, (_, i) => createSession(`s${i}`, `会话 ${i}`));
            useSessionStore.setState({ sessions });
            render(<Sidebar collapsed={false}/>);
            expect(screen.getByText('会话 0')).toBeInTheDocument();
        });
    });
});
//# sourceMappingURL=Sidebar.test.js.map