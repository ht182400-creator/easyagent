/**
 * 微信适配器 (企业微信/微信公众平台)
 *
 * ## 接入方式说明
 *
 * ### 企业微信
 * 1. 在企业微信管理后台创建自建应用
 * 2. 获取 Corp ID、Agent ID、App Secret
 * 3. 配置消息接收 URL (指向 EasyAgent Server 的 /api/im/wechat/callback)
 * 4. 设置 Token 和 EncodingAESKey 用于消息加解密
 *
 * ### 微信公众号(服务号)
 * 1. 在微信公众平台配置服务器 URL
 * 2. 使用被动回复消息或客服消息接口
 * 3. 需要已完成认证的服务号
 *
 * ## 依赖要求
 * - 企业微信需要 `xml2js` 或 `fast-xml-parser` 解析 XML 消息体
 * - 需要实现 AES 加解密 (EncodingAESKey)
 *
 * ## 当前状态: 占位实现
 * 由于企业微信/微信公众平台的接入需要企业资质认证和公网服务器，
 * 此处提供框架代码和接入文档，实际接入时补充完整实现。
 */
import { BaseIMAdapter } from './BaseIMAdapter.js';
import type { WeChatConfig, IMSendOptions } from './types.js';
/**
 * 微信适配器 (企业微信)
 *
 * 主要功能:
 * - 接收企业微信消息回调
 * - 通过企业微信 API 发送/回复消息
 * - 支持文本、图片、文件等消息类型
 */
export declare class WeChatAdapter extends BaseIMAdapter {
    private config;
    private accessToken;
    private tokenExpiresAt;
    private refreshTimer;
    constructor(config: WeChatConfig);
    protected onStart(): Promise<void>;
    protected onStop(): Promise<void>;
    sendMessage(chatId: string, text: string, _options?: IMSendOptions): Promise<string>;
    editMessage(_chatId: string, _messageId: string, newText: string): Promise<boolean>;
    sendTyping(_chatId: string): Promise<void>;
    sendPhoto(chatId: string, _imageUrl: string, _caption?: string): Promise<string>;
    sendDocument(chatId: string, _fileUrl: string, _caption?: string): Promise<string>;
    /**
     * 处理企业微信 URL 验证 (GET 请求)
     * 企业微信配置回调 URL 时会发送 GET 请求验证
     *
     * @param query - 查询参数 { msg_signature, timestamp, nonce, echostr }
     * @returns 解密后的 echostr
     */
    handleUrlVerify(query: {
        msg_signature?: string;
        timestamp?: string;
        nonce?: string;
        echostr?: string;
    }): Promise<string>;
    /**
     * 处理企业微信消息回调 (POST 请求)
     * 企业微信会将消息以加密 XML 格式 POST 到回调 URL
     *
     * @param body - 加密的消息体 (XML)
     * @returns 回复消息 (XML 或空)
     */
    handleMessageCallback(body: string): Promise<string>;
    private refreshToken;
    private ensureToken;
    private fetchApi;
}
//# sourceMappingURL=WeChatAdapter.d.ts.map