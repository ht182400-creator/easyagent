/**
 * StatusBar 组件测试
 * 覆盖版本显示、更新状态、连接状态
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { StatusBar } from '@/components/layout/StatusBar';
// Mock window.easyAgent
function mockEasyAgent(overrides = {}) {
    const api = {
        getAppVersion: vi.fn().mockResolvedValue('0.2.0'),
        onUpdateStatus: vi.fn(),
        ...overrides,
    };
    window.easyAgent = api;
    return api;
}
function clearEasyAgent() {
    delete window.easyAgent;
}
describe('StatusBar', () => {
    beforeEach(() => {
        clearEasyAgent();
    });
    describe('基础渲染', () => {
        it('应渲染版本号', async () => {
            mockEasyAgent();
            await act(async () => {
                render(<StatusBar />);
            });
            // 等待异步获取版本
            const versionText = await screen.findByText(/v0\.2\.0/);
            expect(versionText).toBeInTheDocument();
        });
        it('应显示工具数量 51', () => {
            mockEasyAgent();
            render(<StatusBar />);
            expect(screen.getByText('工具: 51')).toBeInTheDocument();
        });
        it('easyAgent 不存在时显示默认版本', () => {
            // 不设置 mock - 模拟开发模式
            render(<StatusBar />);
            expect(screen.getByText('v0.2.0')).toBeInTheDocument();
        });
        it('getAppVersion 失败时显示默认版本', async () => {
            mockEasyAgent({ getAppVersion: vi.fn().mockRejectedValue(new Error('fail')) });
            await act(async () => {
                render(<StatusBar />);
            });
            expect(screen.getByText('v0.2.0')).toBeInTheDocument();
        });
    });
    describe('更新状态显示', () => {
        it('更新可用时应显示更新提示', async () => {
            const api = mockEasyAgent();
            let updateCallback = () => { };
            api.onUpdateStatus = vi.fn((cb) => {
                updateCallback = cb;
            });
            await act(async () => {
                render(<StatusBar />);
            });
            await act(async () => {
                updateCallback({ status: 'available', version: '0.3.0' });
            });
            expect(screen.getByText('更新可用')).toBeInTheDocument();
        });
        it('下载中应显示进度', async () => {
            const api = mockEasyAgent();
            let updateCallback = () => { };
            api.onUpdateStatus = vi.fn((cb) => {
                updateCallback = cb;
            });
            await act(async () => {
                render(<StatusBar />);
            });
            await act(async () => {
                updateCallback({ status: 'downloading', percent: 45.5 });
            });
            expect(screen.getByText(/下载中/)).toBeInTheDocument();
            expect(screen.getByText(/46%/)).toBeInTheDocument();
        });
        it('下载完成应显示安装提示', async () => {
            const api = mockEasyAgent();
            let updateCallback = () => { };
            api.onUpdateStatus = vi.fn((cb) => {
                updateCallback = cb;
            });
            await act(async () => {
                render(<StatusBar />);
            });
            await act(async () => {
                updateCallback({ status: 'downloaded' });
            });
            expect(screen.getByText('重启以安装更新')).toBeInTheDocument();
        });
        it('无更新状态时不应显示更新信息', () => {
            mockEasyAgent();
            render(<StatusBar />);
            expect(screen.queryByText('更新可用')).toBeNull();
            expect(screen.queryByText('下载中...')).toBeNull();
        });
    });
    describe('连接状态指示', () => {
        it('应显示绿色连接指示灯', () => {
            mockEasyAgent();
            render(<StatusBar />);
            const indicator = document.querySelector('.bg-green-500');
            expect(indicator).toBeInTheDocument();
        });
    });
});
//# sourceMappingURL=StatusBar.test.js.map