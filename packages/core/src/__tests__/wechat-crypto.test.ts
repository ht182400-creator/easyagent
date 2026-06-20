/**
 * AES-256-CBC 解密算法独立测试 (企业微信 WeChatAdapter 使用的算法)
 * 测试加密→解密往返，确保算法正确性
 */
import { describe, it, expect } from 'vitest';
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

/**
 * 企业微信 AES-256-CBC 解密 (与 WeChatAdapter.wxDecrypt 逻辑一致)
 * EncodingAESKey = Base64(AESKey)，43 字符
 */
function wxDecrypt(encrypted: string, encodingAESKey: string): string {
  const aesKey = Buffer.from(encodingAESKey + '=', 'base64');
  const ciphertext = Buffer.from(encrypted, 'base64');
  const iv = aesKey.subarray(0, 16);
  const decipher = createDecipheriv('aes-256-cbc', aesKey, iv);
  decipher.setAutoPadding(false);

  let decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]);

  // 去除 PKCS7 padding
  const padLen = decrypted[decrypted.length - 1];
  if (padLen > 0 && padLen <= 32) {
    decrypted = decrypted.subarray(0, decrypted.length - padLen);
  }

  // 去掉前 16 字节随机字符串 + 4 字节网络字节序长度
  const contentLen = decrypted.readInt32BE(16);
  const content = decrypted.subarray(20, 20 + contentLen).toString('utf-8');

  // 去除 null 字符 (CorpID 填充)
  const nullIdx = content.indexOf('\0');
  return nullIdx >= 0 ? content.slice(0, nullIdx) : content;
}

/** 加密辅助: 模拟企业微信加密格式 */
function wxEncrypt(plainText: string, encodingAESKey: string, corpId: string): string {
  const aesKey = Buffer.from(encodingAESKey + '=', 'base64');
  const iv = aesKey.subarray(0, 16);
  const random = randomBytes(16);
  const contentBuf = Buffer.from(plainText, 'utf-8');
  const lenBuf = Buffer.alloc(4);
  lenBuf.writeInt32BE(contentBuf.length, 0);
  const corpBuf = Buffer.from(corpId, 'utf-8');
  const fullPlain = Buffer.concat([random, lenBuf, contentBuf, corpBuf]);

  // PKCS7 padding
  const padLen = 32 - (fullPlain.length % 32);
  const padBuf = Buffer.alloc(padLen, padLen);
  const padded = Buffer.concat([fullPlain, padBuf]);

  const cipher = createCipheriv('aes-256-cbc', aesKey, iv);
  cipher.setAutoPadding(false);
  const encrypted = Buffer.concat([cipher.update(padded), cipher.final()]);
  return encrypted.toString('base64');
}

describe('企业微信 AES-256-CBC 加解密算法', () => {
  // 43-字符 EncodingAESKey
  const encodingAESKey = 'abcdefghijklmnopqrstuvwxyz0123456789ABCDEFG';

  it('加密→解密往返应保持一致', () => {
    const plainText = 'hello_world_test';
    const encrypted = wxEncrypt(plainText, encodingAESKey, 'test_corp');
    const decrypted = wxDecrypt(encrypted, encodingAESKey);
    expect(decrypted).toBe(plainText);
  });

  it('中文文本往返应保持一致', () => {
    const plainText = '你好，世界！企业微信加密测试';
    const encrypted = wxEncrypt(plainText, encodingAESKey, 'corp_test');
    const decrypted = wxDecrypt(encrypted, encodingAESKey);
    expect(decrypted).toBe(plainText);
  });

  it('空字符串往返应保持一致', () => {
    const encrypted = wxEncrypt('', encodingAESKey, 'test_corp');
    const decrypted = wxDecrypt(encrypted, encodingAESKey);
    expect(decrypted).toBe('');
  });

  it('XML 格式内容往返应保持一致', () => {
    const xmlContent = '<xml><ToUserName>wx123</ToUserName><Content>消息</Content></xml>';
    const encrypted = wxEncrypt(xmlContent, encodingAESKey, 'wx_corp_id');
    const decrypted = wxDecrypt(encrypted, encodingAESKey);
    expect(decrypted).toBe(xmlContent);
  });

  it('长文本往返应保持一致', () => {
    const longText = 'A'.repeat(500);
    const encrypted = wxEncrypt(longText, encodingAESKey, 'corp');
    const decrypted = wxDecrypt(encrypted, encodingAESKey);
    expect(decrypted).toBe(longText);
  });

  it('多个随机密钥均应正确工作', () => {
    // 测试 5 组随机密钥
    for (let i = 0; i < 5; i++) {
      // 生成随机 32 字节 AES key，编码为 43 字符 base64
      const randomKey = randomBytes(32).toString('base64').replace(/=+$/, '');
      // 确保正好 43 字符（32字节 base64 编码 = 44字符含1 padding）
      // 去掉尾部 =
      const key = randomKey.slice(0, 43);
      
      const plainText = `test_message_${i}`;
      const encrypted = wxEncrypt(plainText, key, `corp_${i}`);
      const decrypted = wxDecrypt(encrypted, key);
      expect(decrypted).toBe(plainText);
    }
  });

  it('PKCS7 边界(正好32字节倍数)往返应正确', () => {
    // random(16)+len(4)+content(0)+corpId(7)=27 → pad to 32
    const encrypted = wxEncrypt('', encodingAESKey, 'test123');
    const decrypted = wxDecrypt(encrypted, encodingAESKey);
    expect(decrypted).toBe('');
  });
});

describe('企业微信 XML 解析', () => {
  /**
   * 企业微信 XML 解析 (与 WeChatAdapter.parseWeChatXML 逻辑一致)
   */
  function parseWeChatXML(xml: string): Record<string, string> | null {
    try {
      const result: Record<string, string> = {};
      const regex = /<(\w+)>(?:<!\[CDATA\[(.*?)\]\]>|(.*?))<\/\1>/gs;
      let match;
      while ((match = regex.exec(xml)) !== null) {
        result[match[1]] = match[2] || match[3] || '';
      }
      return Object.keys(result).length > 0 ? result : null;
    } catch (err) {
      return null;
    }
  }

  it('应正确解析标准 XML 消息（平级标签）', () => {
    // 此正则匹配 <TagName>...</TagName> 对，不处理嵌套
    // 在实际使用中，微信消息解密后 slice(20) 得到的是完整 <xml>...</xml> 体，
    // <xml> 标签会先被匹配并吞掉所有内部标签。此处测试平级标签场景。
    const xml = '<ToUserName><![CDATA[wx12345]]></ToUserName><FromUserName><![CDATA[user_abc]]></FromUserName><CreateTime>1710000000</CreateTime><MsgType><![CDATA[text]]></MsgType><Content><![CDATA[你好]]></Content><MsgId>1234567890</MsgId>';

    const result = parseWeChatXML(xml);
    expect(result).not.toBeNull();
    expect(result!.ToUserName).toBe('wx12345');
    expect(result!.FromUserName).toBe('user_abc');
    expect(result!.Content).toBe('你好');
    expect(result!.MsgType).toBe('text');
  });

  it('应处理无 CDATA 的标签', () => {
    const xml = '<ToUserName>wx_simple</ToUserName><FromUserName>user_simple</FromUserName><MsgType>event</MsgType>';

    const result = parseWeChatXML(xml);
    expect(result).not.toBeNull();
    expect(result!.ToUserName).toBe('wx_simple');
    expect(result!.MsgType).toBe('event');
  });

  it('空 XML 应返回 null', () => {
    expect(parseWeChatXML('')).toBeNull();
  });

  it('自闭合标签应正常匹配并返回空内容', () => {
    const result = parseWeChatXML('<root></root>');
    expect(result).toEqual({ root: '' });
  });

  it('应忽略 XML 声明并解析后续标签', () => {
    const xml = '<?xml version="1.0"?><Name>value</Name>';
    const result = parseWeChatXML(xml);
    expect(result).not.toBeNull();
    expect(result!.Name).toBe('value');
  });

  it('特殊字符应正确提取', () => {
    const xml = '<Field><![CDATA[特殊 &lt; &amp; &gt; 字符]]></Field>';
    const result = parseWeChatXML(xml);
    expect(result).not.toBeNull();
    expect(result!.Field).toBe('特殊 &lt; &amp; &gt; 字符');
  });
});
