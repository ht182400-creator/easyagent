/**
 * EasyAgent Desktop - 应用根组件
 * 使用 HashRouter + 内嵌后端 API
 */
import { Routes, Route } from 'react-router-dom';
import { useEffect } from 'react';
import Layout from './components/Layout';
import Dashboard from './pages/Dashboard';
import ChatPage from './pages/Chat';
import Providers from './pages/Providers';
import Sessions from './pages/Sessions';
import Tools from './pages/Tools';
import SettingsPage from './pages/Settings';
import KnowledgeBase from './pages/KnowledgeBase';
import Automation from './pages/Automation';
import TokenUsage from './pages/TokenUsage';
import SkillsPage from './pages/Skills';
import IMSettings from './pages/IMSettings';
import SandboxPage from './pages/Sandbox';
import SemanticPage from './pages/Semantic';
import { useAppStore, initializeTheme } from './stores/appStore';
import { useSettingsStore } from './stores/settingsStore';

/** 后端 API 基准 URL（桌面版内嵌 Express 服务） */
const API_BASE = 'http://127.0.0.1:3456';

export default function App() {
  const setServerConnected = useAppStore((s) => s.setServerConnected);
  const addNotification = useAppStore((s) => s.addNotification);
  const loadSettings = useSettingsStore((s) => s.loadSettings);

  // 初始化主题
  useEffect(() => {
    initializeTheme();
  }, []);

  // 加载持久化设置
  useEffect(() => {
    loadSettings();
  }, [loadSettings]);

  // 检测后端服务连接（桌面版内嵌 Express 端口 3456）
  useEffect(() => {
    let cancelled = false;
    let retryCount = 0;
    const maxRetries = 30; // 最多重试 30 次 (30秒)

    const check = async () => {
      try {
        const res = await fetch(`${API_BASE}/api/status`);
        if (!cancelled) {
          if (res.ok) {
            setServerConnected(true);
            retryCount = 0; // 重置重试计数
          } else {
            retryCount++;
            if (retryCount >= maxRetries) {
              setServerConnected(false);
            }
          }
        }
      } catch (err) {
        if (!cancelled) {
          retryCount++;
          if (retryCount >= maxRetries) {
            setServerConnected(false);
            addNotification({
              type: 'warning',
              message: '后端服务未就绪，请检查应用状态',
              duration: 5000,
            });
          }
        }
      }
    };
    // 首次立即检查
    check();
    const interval = setInterval(check, 30000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [setServerConnected, addNotification]);

  return (
    <Layout>
      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="/chat" element={<ChatPage />} />
        <Route path="/providers" element={<Providers />} />
        <Route path="/sessions" element={<Sessions />} />
        <Route path="/tools" element={<Tools />} />
        <Route path="/knowledge" element={<KnowledgeBase />} />
        <Route path="/automation" element={<Automation />} />
        <Route path="/token-usage" element={<TokenUsage />} />
        <Route path="/skills" element={<SkillsPage />} />
        <Route path="/im" element={<IMSettings />} />
        <Route path="/sandbox" element={<SandboxPage />} />
        <Route path="/semantic" element={<SemanticPage />} />
        <Route path="/settings" element={<SettingsPage />} />
      </Routes>
    </Layout>
  );
}
