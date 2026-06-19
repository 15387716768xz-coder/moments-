package com.cike.app;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.content.SharedPreferences;
import android.content.pm.ApplicationInfo;
import android.content.pm.PackageManager;
import android.provider.Settings;
import android.content.pm.ResolveInfo;
import android.accessibilityservice.AccessibilityServiceInfo;
import android.view.accessibility.AccessibilityManager;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import org.json.JSONArray;
import org.json.JSONObject;

import java.util.List;

@CapacitorPlugin(name = "AppBinding")
public class AppBindingPlugin extends Plugin {

    private static final String PREFS_NAME = "app_binding_prefs";
    private static final String KEY_BOUND_APPS = "bound_apps";
    private static final String ACTION_BOUND_APP_OPENED = "com.cike.app.BOUND_APP_OPENED";

    private BroadcastReceiver boundAppReceiver;

    @Override
    public void load() {
        super.load();
        registerBoundAppReceiver();
    }

    @Override
    protected void handleOnDestroy() {
        super.handleOnDestroy();
        if (boundAppReceiver != null) {
            try {
                getContext().unregisterReceiver(boundAppReceiver);
            } catch (Exception ignored) {}
        }
    }

    /**
     * 获取已安装的可启动应用列表
     */
    @PluginMethod
    public void getInstalledApps(PluginCall call) {
        try {
            PackageManager pm = getContext().getPackageManager();
            Intent launchIntent = new Intent(Intent.ACTION_MAIN);
            launchIntent.addCategory(Intent.CATEGORY_LAUNCHER);

            List<ResolveInfo> resolveList = pm.queryIntentActivities(launchIntent, 0);
            JSONArray apps = new JSONArray();

            for (ResolveInfo ri : resolveList) {
                JSONObject app = new JSONObject();
                String pkg = ri.activityInfo.packageName;
                app.put("packageName", pkg);
                app.put("name", ri.loadLabel(pm).toString());

                // 判断是否为系统应用
                boolean isSystem = (ri.activityInfo.applicationInfo.flags
                        & ApplicationInfo.FLAG_SYSTEM) != 0;
                app.put("isSystemApp", isSystem);

                apps.put(app);
            }

            JSObject result = new JSObject();
            result.put("apps", apps);
            call.resolve(result);
        } catch (Exception e) {
            call.reject("获取应用列表失败: " + e.getMessage());
        }
    }

    /**
     * 获取已绑定的应用包名
     */
    @PluginMethod
    public void getBoundApps(PluginCall call) {
        try {
            SharedPreferences prefs = getContext().getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
            String json = prefs.getString(KEY_BOUND_APPS, "[]");
            JSONArray arr = new JSONArray(json);

            String[] packages = new String[arr.length()];
            for (int i = 0; i < arr.length(); i++) {
                packages[i] = arr.getString(i);
            }

            JSObject result = new JSObject();
            result.put("packages", arr);
            call.resolve(result);
        } catch (Exception e) {
            call.reject("获取绑定列表失败: " + e.getMessage());
        }
    }

    /**
     * 设置绑定的应用包名列表
     */
    @PluginMethod
    public void setBoundApps(PluginCall call) {
        try {
            JSONArray packages = call.getArray("packages");
            if (packages == null) {
                call.reject("packages 参数不能为空");
                return;
            }

            SharedPreferences prefs = getContext().getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
            prefs.edit().putString(KEY_BOUND_APPS, packages.toString()).apply();

            // 更新无障碍服务中的绑定列表
            AppDetectionService.updateBoundPackages(getContext());

            call.resolve();
        } catch (Exception e) {
            call.reject("保存绑定列表失败: " + e.getMessage());
        }
    }

    /**
     * 检查无障碍服务是否已开启
     */
    @PluginMethod
    public void isAccessibilityServiceEnabled(PluginCall call) {
        try {
            boolean enabled = isAccessibilityServiceOn(getContext());

            JSObject result = new JSObject();
            result.put("enabled", enabled);
            call.resolve(result);
        } catch (Exception e) {
            call.reject("检查无障碍服务状态失败: " + e.getMessage());
        }
    }

    /**
     * 打开系统无障碍设置页面
     */
    @PluginMethod
    public void openAccessibilitySettings(PluginCall call) {
        try {
            Intent intent = new Intent(Settings.ACTION_ACCESSIBILITY_SETTINGS);
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(intent);
            call.resolve();
        } catch (Exception e) {
            call.reject("无法打开无障碍设置: " + e.getMessage());
        }
    }

    /**
     * 注册广播接收器，监听绑定 app 被打开的事件
     */
    private void registerBoundAppReceiver() {
        boundAppReceiver = new BroadcastReceiver() {
            @Override
            public void onReceive(Context context, Intent intent) {
                if (ACTION_BOUND_APP_OPENED.equals(intent.getAction())) {
                    String packageName = intent.getStringExtra("packageName");
                    if (packageName != null) {
                        JSObject data = new JSObject();
                        data.put("packageName", packageName);
                        notifyListeners("boundAppOpened", data);
                    }
                }
            }
        };

        IntentFilter filter = new IntentFilter(ACTION_BOUND_APP_OPENED);
        getContext().registerReceiver(boundAppReceiver, filter);
    }

    /**
     * 判断无障碍服务是否开启（多重检测，兼容各种 ROM）
     */
    public static boolean isAccessibilityServiceOn(Context context) {
        try {
            // 方法 1：AccessibilityManager（标准方式）
            AccessibilityManager am = (AccessibilityManager)
                    context.getSystemService(Context.ACCESSIBILITY_SERVICE);
            if (am != null) {
                List<AccessibilityServiceInfo> enabledServices = am.getEnabledAccessibilityServiceList(
                        AccessibilityServiceInfo.FEEDBACK_ALL_MASK);
                for (AccessibilityServiceInfo service : enabledServices) {
                    String id = service.getId();
                    // 多种 ID 格式兼容
                    if (id != null && (id.contains(context.getPackageName())
                            || id.contains("cike")
                            || id.contains("AppDetectionService"))) {
                        return true;
                    }
                }
            }

            // 方法 2：Settings.Secure（更底层，某些 ROM 上更可靠）
            try {
                String enabledServicesStr = android.provider.Settings.Secure.getString(
                        context.getContentResolver(),
                        android.provider.Settings.Secure.ENABLED_ACCESSIBILITY_SERVICES);
                if (enabledServicesStr != null && !enabledServicesStr.isEmpty()) {
                    if (enabledServicesStr.contains(context.getPackageName())
                            || enabledServicesStr.contains("cike")) {
                        return true;
                    }
                }
            } catch (Exception ignored) {}

            // 方法 3：检查无障碍服务是否在运行中
            try {
                android.app.ActivityManager activityManager = (android.app.ActivityManager)
                        context.getSystemService(Context.ACTIVITY_SERVICE);
                if (activityManager != null) {
                    List<android.app.ActivityManager.RunningServiceInfo> runningServices =
                            activityManager.getRunningServices(100);
                    for (android.app.ActivityManager.RunningServiceInfo service : runningServices) {
                        if (service.service != null
                                && service.service.getClassName() != null
                                && service.service.getClassName().contains("AppDetectionService")) {
                            return true;
                        }
                    }
                }
            } catch (Exception ignored) {}

        } catch (Exception e) {
            return false;
        }
        return false;
    }

    /**
     * [静态方法] 获取已安装应用列表 JSON
     * 供 NativeBridge (JavaScript Interface) 调用
     */
    public static String getInstalledAppsJson(Context context) {
        try {
            PackageManager pm = context.getPackageManager();
            Intent launchIntent = new Intent(Intent.ACTION_MAIN);
            launchIntent.addCategory(Intent.CATEGORY_LAUNCHER);
            List<ResolveInfo> resolveList = pm.queryIntentActivities(launchIntent, 0);
            JSONArray apps = new JSONArray();
            for (ResolveInfo ri : resolveList) {
                JSONObject app = new JSONObject();
                app.put("packageName", ri.activityInfo.packageName);
                app.put("name", ri.loadLabel(pm).toString());
                app.put("isSystemApp", (ri.activityInfo.applicationInfo.flags
                        & ApplicationInfo.FLAG_SYSTEM) != 0);
                apps.put(app);
            }
            return apps.toString();
        } catch (Exception e) {
            return "[]";
        }
    }

    /**
     * [静态方法] 获取已绑定应用列表 JSON
     */
    public static String getBoundAppsJson(Context context) {
        SharedPreferences prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
        return prefs.getString(KEY_BOUND_APPS, "[]");
    }

    /**
     * [静态方法] 保存绑定应用列表
     */
    public static void setBoundAppsJson(Context context, String json) {
        SharedPreferences prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
        prefs.edit().putString(KEY_BOUND_APPS, json).commit();
        AppDetectionService.updateBoundPackages(context);
    }

    /**
     * 短暂放行（3 秒）：停止拦截后，让目标 App 后台任务安静消失。
     *
     * 改用 InterceptorState 文件存储（原子写入），避免 SharedPreferences 跨进程缓存不同步。
     */
    public static void allowNextLaunchOf(Context context, String pkg) {
        InterceptorState.allowNext(context, pkg);
    }

    /**
     * 检查短暂放行标记是否有效。时间窗口过期自动失效。
     *
     * 改用 InterceptorState 文件存储，每次读取都是最新磁盘内容。
     */
    public static boolean shouldAllowOnce(Context context, String pkg) {
        return InterceptorState.isAllowedNext(context, pkg);
    }
}
