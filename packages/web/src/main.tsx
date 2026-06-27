/**
 * EasyAgent Web - 入口文件
 * 通过 mountApp 使用统一前端 @easyagent/frontend，传入 Web 模式配置
 * 样式由 @easyagent/frontend/src/styles/index.css 统一提供（已删除本地冗余副本）
 */
import { mountApp } from '@easyagent/frontend';

mountApp({ apiBase: '', wsBase: '/ws', isDesktop: false }, true);
