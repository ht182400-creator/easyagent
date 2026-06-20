/**
 * IM 适配器系统类型定义
 * 支持 Telegram / 飞书 / 微信等多平台接入
 */
/** IM 适配器抽象事件 */
export var IMAdapterEvent;
(function (IMAdapterEvent) {
    IMAdapterEvent["MESSAGE"] = "message";
    IMAdapterEvent["CALLBACK_QUERY"] = "callback_query";
    IMAdapterEvent["STATUS_CHANGE"] = "status_change";
    IMAdapterEvent["ERROR"] = "error";
    IMAdapterEvent["STARTED"] = "started";
    IMAdapterEvent["STOPPED"] = "stopped";
})(IMAdapterEvent || (IMAdapterEvent = {}));
//# sourceMappingURL=types.js.map