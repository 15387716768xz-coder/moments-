/**
 * 原生桥接层
 *
 * 优先使用 window._NativeBridge（JavaScript Interface，最可靠），
 * 不可用时回退到 Capacitor 插件系统。
 */

function hasNativeBridge() {
  return typeof window._NativeBridge !== "undefined" && window._NativeBridge;
}

export async function openAccessibilitySettings() {
  if (hasNativeBridge()) {
    window._NativeBridge.openAccessibilitySettings();
    return;
  }
  // Capacitor 插件回退
  const { AppBinding } = await import("./index");
  await AppBinding.openAccessibilitySettings();
}

export async function getInstalledApps() {
  if (hasNativeBridge()) {
    const json = window._NativeBridge.getInstalledApps();
    return JSON.parse(json);
  }
  const { AppBinding } = await import("./index");
  return (await AppBinding.getInstalledApps()).apps;
}

export async function getBoundApps() {
  if (hasNativeBridge()) {
    const json = window._NativeBridge.getBoundApps();
    return JSON.parse(json);
  }
  const { AppBinding } = await import("./index");
  return (await AppBinding.getBoundApps()).packages;
}

export async function setBoundApps(packages) {
  if (hasNativeBridge()) {
    window._NativeBridge.setBoundApps(JSON.stringify(packages));
    return;
  }
  const { AppBinding } = await import("./index");
  await AppBinding.setBoundApps({ packages });
}

export async function isAccessibilityServiceEnabled() {
  if (hasNativeBridge()) {
    return window._NativeBridge.isAccessibilityServiceEnabled();
  }
  const { AppBinding } = await import("./index");
  return (await AppBinding.isAccessibilityServiceEnabled()).enabled;
}

/** "停止"出口：短暂放行 + 跳主屏 */
export function exitStop(pkg) {
  if (hasNativeBridge()) window._NativeBridge.exitStop(pkg);
}

/** "刷一会儿"出口：计时器放行 + 短暂放行 + 启动目标 App */
export function exitScroll(pkg, minutes) {
  if (hasNativeBridge()) window._NativeBridge.exitScroll(pkg, minutes);
}

/** "回主页"出口：跳主屏 */
export function exitHome() {
  if (hasNativeBridge()) window._NativeBridge.exitHome();
}