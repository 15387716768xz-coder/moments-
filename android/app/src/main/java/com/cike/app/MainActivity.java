package com.cike.app;

import android.content.Intent;
import android.os.Bundle;
import android.provider.Settings;
import android.util.Log;
import android.webkit.JavascriptInterface;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    private String pendingTrigger = null;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        registerPlugin(AppBindingPlugin.class);
        super.onCreate(savedInstanceState);
        getBridge().getWebView().addJavascriptInterface(new NativeBridge(), "_NativeBridge");

        String t = getIntent().getStringExtra("triggerPackage");
        if (t != null) pendingTrigger = t;
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        String t = intent.getStringExtra("triggerPackage");
        if (t != null) pendingTrigger = t;
    }

    public class NativeBridge {

        /** React 轮询触发 */
        @JavascriptInterface
        public String getTrigger() {
            String t = pendingTrigger;
            pendingTrigger = null;
            return t != null ? t : "";
        }

        /* ──── 三个出口方法 ──── */

        /** "停止"出口：跳主屏 + 短暂放行，防止 TikTok 残影触发误检测 */
        @JavascriptInterface
        public void exitStop(String pkg) {
            Log.i("CIKE", "EXIT_STOP: " + pkg);
            AppBindingPlugin.allowNextLaunchOf(getApplicationContext(), pkg);
            goHome();
        }

        /** "刷一会儿"出口：计时器放行 + 短暂放行 + 启动目标 App */
        @JavascriptInterface
        public void exitScroll(String pkg, int minutes) {
            Log.i("CIKE", "EXIT_SCROLL: " + pkg + " minutes=" + minutes + " now=" + System.currentTimeMillis());
            InterceptorState.allowUntil(getApplicationContext(), pkg, minutes);
            Log.i("CIKE", "EXIT_SCROLL allowUntil done, checking prefs...");
            // 验证写入
            long verify = getApplicationContext().getSharedPreferences("app_binding_prefs", MODE_PRIVATE)
                    .getLong("timer_allow_" + pkg, -1L);
            Log.i("CIKE", "EXIT_SCROLL verify timer_allow_" + pkg + " = " + verify + " (now=" + System.currentTimeMillis() + ")");
            AppBindingPlugin.allowNextLaunchOf(getApplicationContext(), pkg);
            // 启动目标 app
            Intent launch = getPackageManager().getLaunchIntentForPackage(pkg);
            if (launch != null) {
                launch.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                startActivity(launch);
                Log.i("CIKE", "EXIT_SCROLL launched: " + pkg);
            } else {
                Log.i("CIKE", "EXIT_SCROLL no launch intent for: " + pkg);
            }
        }

        /** "回主页"出口：跳主屏 */
        @JavascriptInterface
        public void exitHome() {
            goHome();
        }

        private void goHome() {
            Intent intent = new Intent(Intent.ACTION_MAIN);
            intent.addCategory(Intent.CATEGORY_HOME);
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            startActivity(intent);
        }

        /* ──── 设置相关（不变）──── */

        @JavascriptInterface
        public void openAccessibilitySettings() {
            Intent intent = new Intent(Settings.ACTION_ACCESSIBILITY_SETTINGS);
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            startActivity(intent);
        }

        @JavascriptInterface
        public String getInstalledApps() {
            return AppBindingPlugin.getInstalledAppsJson(getApplicationContext());
        }

        @JavascriptInterface
        public String getBoundApps() {
            return AppBindingPlugin.getBoundAppsJson(getApplicationContext());
        }

        @JavascriptInterface
        public void setBoundApps(String packagesJson) {
            AppBindingPlugin.setBoundAppsJson(getApplicationContext(), packagesJson);
        }

        @JavascriptInterface
        public boolean isAccessibilityServiceEnabled() {
            return AppBindingPlugin.isAccessibilityServiceOn(MainActivity.this);
        }

        /* ──── 调试面板 ──── */

        /** 获取完整调试信息 JSON */
        @JavascriptInterface
        public String getDebugInfo() {
            return DebugState.getFullDebugJson(getApplicationContext());
        }

        /** 模拟触发：等同于检测到绑定的 app 被打开 */
        @JavascriptInterface
        public void simulateTrigger(String pkg) {
            pendingTrigger = pkg;
            DebugState.log("SIMULATE", "手动模拟触发: " + pkg);
        }

        /** 清除所有放行标记（重置状态） */
        @JavascriptInterface
        public void clearAllAllowances() {
            DebugState.clearAllAllowances(getApplicationContext());
        }

        /** 跳转应用详情页（方便修改权限） */
        @JavascriptInterface
        public void openAppSettings() {
            Intent intent = new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS);
            intent.setData(android.net.Uri.parse("package:" + getPackageName()));
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            startActivity(intent);
        }
    }
}
