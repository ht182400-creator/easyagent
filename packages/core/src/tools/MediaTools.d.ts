import type { ITool } from './ToolRegistry.js';
/**
 * 读取图片工具
 * 支持读取本地图片文件，返回base64编码和元数据
 */
export declare const ReadImageTool: ITool;
/**
 * AI图片生成工具
 * 使用AI模型根据文本描述生成图片
 */
export declare const GenerateImageTool: ITool;
/**
 * 截图工具
 * 捕获指定URL或当前屏幕的截图
 */
export declare const ScreenshotTool: ITool;
/** 媒体操作工具集 */
export declare const MediaTools: ITool[];
//# sourceMappingURL=MediaTools.d.ts.map