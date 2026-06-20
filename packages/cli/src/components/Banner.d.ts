import type { FC } from 'react';
interface BannerProps {
    /** 应用版本号 */
    version?: string;
    /** 副标题文本 */
    subtitle?: string;
}
/**
 * 欢迎Banner - ASCII艺术字 + 渐变色彩
 * 使用figlet生成ASCII字体，gradient-string添加渐变效果
 */
export declare const Banner: FC<BannerProps>;
export {};
//# sourceMappingURL=Banner.d.ts.map