/**
 * 飞书/Lark 适配器
 * 通过飞书开放平台接收和发送消息
 * 支持 Webhook 事件订阅 + API 消息回复
 */
import { BaseIMAdapter } from './BaseIMAdapter.js';
import { logger } from '../utils/logger.js';
/** 飞书 API 基础 URL */
const FEISHU_API_BASE = 'https://open.feishu.cn/open-apis';
/** 飞书国际版 (Lark) API 基础 URL */
const LARK_API_BASE = 'https://open.larksuite.com/open-apis';
/**
 * 飞书适配器
 * 支持 Webhook 事件订阅模式
 * 需在飞书开放平台配置机器人事件订阅 URL 指向本服务
 */
export class FeishuAdapter extends BaseIMAdapter {
    config;
    apiBase;
    accessToken = null;
    tokenExpiresAt = 0;
    refreshTimer = null;
    constructor(config) {
        super('feishu', config.name || '飞书 Bot');
        this.config = config;
        // 根据 appId 前缀判断 Lark 国际版
        this.apiBase = config.appId?.startsWith('cli_') ? LARK_API_BASE : FEISHU_API_BASE;
    }
    // ========== 生命周期 ==========
    async onStart() {
        // 获取初始 access_token
        await this.refreshToken();
        // 每隔 1.5 小时刷新 token (token 有效期 2 小时)
        this.refreshTimer = setInterval(() => {
            this.refreshToken().catch((err) => {
                logger.error({ error: err.message }, '飞书 token 刷新失败');
            });
        }, 90 * 60 * 1000);
        logger.info({ appId: this.config.appId }, '飞书适配器已启动');
    }
    async onStop() {
        if (this.refreshTimer) {
            clearInterval(this.refreshTimer);
            this.refreshTimer = null;
        }
        this.accessToken = null;
    }
    // ========== 消息发送 ==========
    async sendMessage(chatId, text, options) {
        const token = await this.ensureToken();
        const content = JSON.stringify({ text });
        const body = {
            receive_id: chatId,
            msg_type: 'text',
            content,
        };
        const result = await this.fetchApi(`${this.apiBase}/im/v1/messages`, {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${token}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(body),
        });
        if (result.code !== 0) {
            throw new Error(`飞书 sendMessage 失败: ${result.code} ${result.msg}`);
        }
        return result.data?.message_id || '';
    }
    async editMessage(chatId, messageId, newText) {
        // 飞书不支持编辑已发送消息，采用删除+重发策略
        try {
            await this.sendMessage(chatId, newText);
            return true;
        }
        catch {
            return false;
        }
    }
    async sendTyping(chatId) {
        // 飞书无"正在输入"API，通过发送临时消息模拟
        // 此处留空，由上层决定是否发送状态文本
    }
    async sendPhoto(chatId, imageUrl, caption) {
        const token = await this.ensureToken();
        // 飞书图片消息需先上传获取 image_key
        const imageKey = await this.uploadImage(imageUrl, token);
        if (!imageKey)
            return '';
        const content = JSON.stringify({ image_key: imageKey });
        const body = {
            receive_id: chatId,
            msg_type: 'image',
            content,
        };
        const result = await this.fetchApi(`${this.apiBase}/im/v1/messages`, {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${token}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(body),
        });
        return result.data?.message_id || '';
    }
    async sendDocument(chatId, fileUrl, caption) {
        // 飞书文件消息需先上传
        const token = await this.ensureToken();
        const fileKey = await this.uploadFile(fileUrl, caption || 'file', token);
        if (!fileKey)
            return '';
        const content = JSON.stringify({ file_key: fileKey });
        const body = {
            receive_id: chatId,
            msg_type: 'file',
            content,
        };
        const result = await this.fetchApi(`${this.apiBase}/im/v1/messages`, {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${token}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(body),
        });
        return result.data?.message_id || '';
    }
    // ========== Webhook 入口 ==========
    /**
     * 处理飞书事件回调 (由外部 HTTP 服务器调用)
     * @param body - 飞书事件回调 body
     * @returns 响应数据 (challenge 校验用)
     */
    async handleEventCallback(body) {
        // URL 验证
        if (body.type === 'url_verification') {
            const expectedToken = this.config.verificationToken;
            if (expectedToken && body.token !== expectedToken) {
                logger.warn('飞书 URL 验证 token 不匹配');
                return {};
            }
            return { challenge: body.challenge };
        }
        // 事件回调
        if (body.event) {
            await this.processFeishuEvent(body.event);
        }
        return {};
    }
    /**
     * 处理飞书事件
     */
    async processFeishuEvent(event) {
        if (event.type !== 'im.message.receive_v1')
            return;
        const msg = event.message;
        if (!msg)
            return;
        // 只处理文本消息
        const textContent = msg.content;
        if (!textContent)
            return;
        let text = '';
        try {
            const parsed = JSON.parse(textContent);
            text = parsed.text || '';
        }
        catch {
            text = textContent;
        }
        if (!text.trim())
            return;
        const chatId = msg.chat_id;
        const senderId = event.sender?.sender_id?.open_id || 'unknown';
        const senderName = event.sender?.sender_id?.open_id || senderId;
        const imMessage = {
            messageId: msg.message_id,
            chatId,
            senderId,
            senderName,
            text,
            timestamp: new Date(parseInt(msg.create_time, 10) || Date.now()).toISOString(),
            isGroupChat: msg.chat_type === 'group',
            raw: event,
        };
        await this.handleIncomingMessage(imMessage);
    }
    // ========== Token 管理 ==========
    /**
     * 获取 access_token
     */
    async refreshToken() {
        const result = await this.fetchApi(`${this.apiBase}/auth/v3/tenant_access_token/internal`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                app_id: this.config.appId,
                app_secret: this.config.appSecret,
            }),
        });
        if (result.code !== 0 || !result.tenant_access_token) {
            throw new Error(`飞书获取 token 失败: ${result.code} ${result.msg}`);
        }
        this.accessToken = result.tenant_access_token;
        this.tokenExpiresAt = Date.now() + ((result.expire || 7200) - 300) * 1000; // 提前 5 分钟刷新
        logger.debug('飞书 token 刷新成功');
        return this.accessToken;
    }
    /**
     * 确保 token 有效
     */
    async ensureToken() {
        if (!this.accessToken || Date.now() >= this.tokenExpiresAt) {
            return this.refreshToken();
        }
        return this.accessToken;
    }
    // ========== 文件上传 ==========
    async uploadImage(imageUrl, token) {
        try {
            // 飞书图片上传需要 form-data，简化处理直接用 URL 方式
            // 生产环境应下载图片后以 multipart/form-data 上传
            const result = await this.fetchApi(`${this.apiBase}/im/v1/images`, {
                method: 'POST',
                headers: {
                    Authorization: `Bearer ${token}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    image_type: 'message',
                    image: imageUrl.startsWith('http') ? undefined : undefined,
                }),
            });
            return result.data?.image_key || null;
        }
        catch {
            logger.warn('飞书图片上传失败');
            return null;
        }
    }
    async uploadFile(fileUrl, fileName, token) {
        try {
            const result = await this.fetchApi(`${this.apiBase}/im/v1/files`, {
                method: 'POST',
                headers: {
                    Authorization: `Bearer ${token}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    file_type: 'stream',
                    file_name: fileName,
                }),
            });
            return result.data?.file_key || null;
        }
        catch {
            logger.warn('飞书文件上传失败');
            return null;
        }
    }
    // ========== HTTP 辅助 ==========
    async fetchApi(url, options) {
        const response = await fetch(url, options);
        if (!response.ok) {
            const errorBody = await response.text();
            throw new Error(`飞书 API 请求失败 ${response.status}: ${errorBody}`);
        }
        return response.json();
    }
}
//# sourceMappingURL=FeishuAdapter.js.map