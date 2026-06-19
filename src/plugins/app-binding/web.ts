import { WebPlugin } from "@capacitor/core";
import type { AppBindingPlugin, AppInfo } from "./definitions";

/**
 * Web 端模拟实现 — 在浏览器中使用时无实际功能
 */
export class AppBindingWeb extends WebPlugin implements AppBindingPlugin {
  async getInstalledApps(): Promise<{ apps: AppInfo[] }> {
    console.warn("AppBinding.getInstalledApps: 仅 Android 平台可用");
    return { apps: [] };
  }

  async getBoundApps(): Promise<{ packages: string[] }> {
    console.warn("AppBinding.getBoundApps: 仅 Android 平台可用");
    return { packages: [] };
  }

  async setBoundApps(_options: { packages: string[] }): Promise<void> {
    console.warn("AppBinding.setBoundApps: 仅 Android 平台可用");
  }

  async isAccessibilityServiceEnabled(): Promise<{ enabled: boolean }> {
    console.warn("AppBinding.isAccessibilityServiceEnabled: 仅 Android 平台可用");
    return { enabled: false };
  }

  async openAccessibilitySettings(): Promise<void> {
    console.warn("AppBinding.openAccessibilitySettings: 仅 Android 平台可用");
  }

  async addListener(
    _eventName: "boundAppOpened",
    _listenerFunc: (data: { packageName: string }) => void
  ): Promise<{ remove: () => void }> {
    console.warn("AppBinding.addListener: 仅 Android 平台可用");
    return { remove: () => {} };
  }
}
