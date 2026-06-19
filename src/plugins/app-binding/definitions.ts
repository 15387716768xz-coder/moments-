export interface AppInfo {
  /** 应用名称 */
  name: string;
  /** 包名，如 com.ss.android.ugc.aweme */
  packageName: string;
  /** 是否为系统应用 */
  isSystemApp: boolean;
}

export interface AppBindingPlugin {
  /** 获取已安装的可启动应用列表 */
  getInstalledApps(): Promise<{ apps: AppInfo[] }>;

  /** 获取已绑定的应用包名列表 */
  getBoundApps(): Promise<{ packages: string[] }>;

  /** 设置绑定的应用包名列表 */
  setBoundApps(options: { packages: string[] }): Promise<void>;

  /** 检查无障碍服务是否已开启 */
  isAccessibilityServiceEnabled(): Promise<{ enabled: boolean }>;

  /** 打开系统无障碍设置页面 */
  openAccessibilitySettings(): Promise<void>;

  /** 监听"检测到绑定应用被打开"事件 */
  addListener(
    eventName: "boundAppOpened",
    listenerFunc: (data: { packageName: string }) => void
  ): Promise<{ remove: () => void }>;
}
