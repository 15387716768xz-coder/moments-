import { registerPlugin } from "@capacitor/core";
import type { AppBindingPlugin } from "./definitions";

/**
 * AppBinding Capacitor 插件
 *
 * 提供以下功能：
 * - 获取已安装应用列表
 * - 管理绑定的应用
 * - 无障碍服务状态检查与跳转
 * - 监听绑定应用的打开事件
 */
const AppBinding = registerPlugin<AppBindingPlugin>("AppBinding", {
  web: () => import("./web").then((m) => new m.AppBindingWeb()),
});

export { AppBinding };
export type { AppInfo, AppBindingPlugin } from "./definitions";
