/**
 * 加密工具模块
 * 用于安全存储API密钥等敏感信息
 * 使用AES-256-GCM加密
 */
import crypto from 'node:crypto';
import { logger } from './logger.js';
/** 加密算法 */
const ALGORITHM = 'aes-256-gcm';
/** 密钥长度 */
const KEY_LENGTH = 32;
/** IV长度 */
const IV_LENGTH = 16;
/** 认证标签长度 */
const TAG_LENGTH = 16;
/**
 * 从密码派生加密密钥
 * @param password - 主密码
 * @param salt - 盐值
 * @returns 派生的密钥
 */
function deriveKey(password, salt) {
    return crypto.pbkdf2Sync(password, salt, 100000, KEY_LENGTH, 'sha256');
}
/**
 * 获取或创建主密码
 * 从环境变量或机器标识派生
 */
function getMasterPassword() {
    const envPassword = process.env.EASYAGENT_MASTER_KEY;
    if (envPassword)
        return envPassword;
    // 使用机器标识作为后备密码
    const machineId = `${process.env.COMPUTERNAME || ''}${process.env.USER || ''}${process.env.HOME || ''}`;
    return crypto.createHash('sha256').update(machineId).digest('hex');
}
/**
 * 加密文本
 * @param plaintext - 明文
 * @returns 加密后的Base64字符串 (格式: salt:iv:authTag:ciphertext)
 */
export function encrypt(plaintext) {
    try {
        const password = getMasterPassword();
        const salt = crypto.randomBytes(32);
        const key = deriveKey(password, salt);
        const iv = crypto.randomBytes(IV_LENGTH);
        const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
        const encrypted = Buffer.concat([
            cipher.update(plaintext, 'utf8'),
            cipher.final(),
        ]);
        const authTag = cipher.getAuthTag();
        // 格式: base64(salt):base64(iv):base64(authTag):base64(ciphertext)
        return [
            salt.toString('base64'),
            iv.toString('base64'),
            authTag.toString('base64'),
            encrypted.toString('base64'),
        ].join(':');
    }
    catch (error) {
        logger.error({ error }, '加密失败');
        throw new Error('加密操作失败');
    }
}
/**
 * 解密文本
 * @param encryptedData - 加密的Base64字符串
 * @returns 解密后的明文
 */
export function decrypt(encryptedData) {
    try {
        const password = getMasterPassword();
        const parts = encryptedData.split(':');
        if (parts.length !== 4) {
            throw new Error('无效的加密数据格式');
        }
        const salt = Buffer.from(parts[0], 'base64');
        const iv = Buffer.from(parts[1], 'base64');
        const authTag = Buffer.from(parts[2], 'base64');
        const ciphertext = Buffer.from(parts[3], 'base64');
        const key = deriveKey(password, salt);
        const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
        decipher.setAuthTag(authTag);
        const decrypted = Buffer.concat([
            decipher.update(ciphertext),
            decipher.final(),
        ]);
        return decrypted.toString('utf8');
    }
    catch (error) {
        logger.error({ error }, '解密失败');
        throw new Error('解密操作失败，可能密钥已变更');
    }
}
/**
 * 哈希文本(SHA256)
 * @param text - 输入文本
 * @returns 哈希值
 */
export function hash(text) {
    return crypto.createHash('sha256').update(text).digest('hex');
}
//# sourceMappingURL=encryption.js.map