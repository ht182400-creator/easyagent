/**
 * EasyAgent 统一前端 - 应用根组件
 * 通过 ConfigContext 支持 Web (相对路径) 和 Desktop (127.0.0.1:3456) 两种模式
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
import { useConfig } from './config';

export default function App() {
  const { apiBase, isDesktop } = useConfig();
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

  // 检测后端服务连接
  useEffect(() => {
    let cancelled = false;
    let retryCount = 0;
    const maxRetries = isDesktop ? 30 : 5; // 桌面版等待更久（后端启动慢）

    const check = async () => {
      try {
        const res = await fetch(`${apiBase}/api/status`);
        if (!cancelled) {
          if (res.ok) {
            setServerConnected(true);
            retryCount = 0;
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
            if (isDesktop) {
              addNotification({
                type: 'warning',
                message: '后端服务未就绪，请检查应用状态',
                duration: 5000,
              });
            }
          }
        }
      }
    };

    check();
    const interval = setInterval(check, 30000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [apiBase, isDesktop, setServerConnected, addNotification]);

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
