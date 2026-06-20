import type { FC } from 'react';
interface InputBoxProps {
    /** 提交回调 - 用户按回车触发 */
    onSubmit: (text: string) => void;
    /** 是否禁用输入(Agent运行时) */
    disabled?: boolean;
    /** 输入提示符 */
    prompt?: string;
}
/**
 * 输入框 - 处理键盘输入
 * - 回车: 提交内容
 * - 退格: 删除字符
 * - Ctrl+C: 不做特殊处理(由上层处理)
 * - 其他: 追加到输入
 */
export declare const InputBox: FC<InputBoxProps>;
export {};
//# sourceMappingURL=InputBox.d.ts.map