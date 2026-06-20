/**
 * 加密文本
 * @param plaintext - 明文
 * @returns 加密后的Base64字符串 (格式: salt:iv:authTag:ciphertext)
 */
export declare function encrypt(plaintext: string): string;
/**
 * 解密文本
 * @param encryptedData - 加密的Base64字符串
 * @returns 解密后的明文
 */
export declare function decrypt(encryptedData: string): string;
/**
 * 哈希文本(SHA256)
 * @param text - 输入文本
 * @returns 哈希值
 */
export declare function hash(text: string): string;
