package com.cike.app;

import android.accessibilityservice.AccessibilityService;
import android.accessibilityservice.AccessibilityServiceInfo;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.usage.UsageEvents;
import android.app.usage.UsageStatsManager;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.os.Build;
import android.os.Handler;
import android.os.HandlerThread;
import android.os.Looper;
import android.util.Log;
import android.view.accessibility.AccessibilityEvent;

import org.json.JSONArray;

/**
 * 无障碍服务 — 运行在独立进程 :detection，与主 app 进程隔离
 *
 * 路径 1：AccessibilityEvent 事件驱动
 * 路径 2：后台线程定时轮询 UsageEvents（每 1.5 秒）
 */
public class AppDetectionService extends AccessibilityService {

    private static final String PREFS_NAME = "app_binding_prefs";
    private static final String KEY_BOUND_APPS = "bound_apps";
    private static final String ACTION_BOUND_APP_OPENED = "com.cike.app.BOUND_APP_OPENED";
    private static final String CHANNEL_ID = "cike_detection";
    private static final int NOTIFICATION_ID = 1001;

    private static String[] cachedBoundPackages = new String[0];
    private static long lastTriggerTime = 0;
    private static final long MIN_TRIGGER_INTERVAL = 1500;

    private String lastDetectedPackage = "";
    private long lastDetectedTime = 0;

    // 后台线程 — 独立于 UI 主线程，不受 WebView/React 影响
    private HandlerThread bgThread;
    private Handler bgHandler;
    private Runnable pollRunnable;
    private static final long POLL_INTERVAL = 1500;

    @Override
    public void onServiceConnected() {
        super.onServiceConnected();

        AccessibilityServiceInfo info = new AccessibilityServiceInfo();
        info.eventTypes = AccessibilityEvent.TYPE_WINDOW_STATE_CHANGED
                | AccessibilityEvent.TYPE_WINDOW_CONTENT_CHANGED;
        info.feedbackType = AccessibilityServiceInfo.FEEDBACK_GENERIC;
        info.notificationTimeout = 100;
        info.flags = AccessibilityServiceInfo.DEFAULT
                | AccessibilityServiceInfo.FLAG_REPORT_VIEW_IDS
                | AccessibilityServiceInfo.FLAG_RETRIEVE_INTERACTIVE_WINDOWS;
        setServiceInfo(info);

        startForegroundService();
        // 清除上次 session 遗留的所有放行标记
        DebugState.clearAllAllowances(this);
        updateBoundPackages(this);
        // 调试：打印 prefs 完整内容
        try {
            java.util.Map<String, ?> all = getSharedPreferences("app_binding_prefs", MODE_PRIVATE).getAll();
            Log.i("CIKE", "SVC_START prefs: " + all.keySet());
            for (java.util.Map.Entry<String, ?> e : all.entrySet()) {
                Log.i("CIKE", "  " + e.getKey() + " = " + e.getValue());
            }
        } catch (Exception ex) { Log.i("CIKE", "prefs err: " + ex.getMessage()); }

        // 在独立后台线程启动轮询
        startBackgroundPolling();
    }

    /* ═══════════════════════════════════════════════
       路径 1：AccessibilityEvent
       ═══════════════════════════════════════════════ */

    private int eventCount = 0;

    @Override
    public void onAccessibilityEvent(AccessibilityEvent event) {
        int type = event.getEventType();
        if (type != AccessibilityEvent.TYPE_WINDOW_STATE_CHANGED
                && type != AccessibilityEvent.TYPE_WINDOW_CONTENT_CHANGED) {
            return;
        }

        eventCount++;
        CharSequence pkgSeq = event.getPackageName();
        if (pkgSeq == null) return;
        String pkg = pkgSeq.toString().trim();
        if (pkg.isEmpty()) return;

        if (eventCount % 5 == 1) Log.i("CIKE", "Event #" + eventCount + ": pkg=" + pkg + " type=" + type);
        checkAndTrigger(pkg);
    }

    /* ═══════════════════════════════════════════════
       路径 2：后台线程轮询 UsageEvents
       ═══════════════════════════════════════════════ */

    private void startBackgroundPolling() {
        bgThread = new HandlerThread("cike-detection-bg");
        bgThread.start();
        bgHandler = new Handler(bgThread.getLooper());

        pollRunnable = new Runnable() {
            @Override
            public void run() {
                try {
                    String fgPkg = queryForegroundPackage();
                    if (fgPkg != null && !fgPkg.isEmpty()) {
                        checkAndTrigger(fgPkg);
                    }
                } catch (Exception ignored) {}
                bgHandler.postDelayed(this, POLL_INTERVAL);
            }
        };
        bgHandler.post(pollRunnable);
    }

    private String queryForegroundPackage() {
        try {
            if (Build.VERSION.SDK_INT < Build.VERSION_CODES.LOLLIPOP) return null;
            UsageStatsManager usm = (UsageStatsManager) getSystemService(Context.USAGE_STATS_SERVICE);
            if (usm == null) return null;

            long now = System.currentTimeMillis();
            UsageEvents events = usm.queryEvents(now - 4000, now);
            if (events == null) return null;

            String lastFgPkg = null;
            long lastFgTime = 0;
            UsageEvents.Event event = new UsageEvents.Event();

            while (events.hasNextEvent()) {
                events.getNextEvent(event);
                if (event.getEventType() == UsageEvents.Event.MOVE_TO_FOREGROUND
                        || event.getEventType() == UsageEvents.Event.ACTIVITY_RESUMED) {
                    if (event.getTimeStamp() > lastFgTime) {
                        lastFgTime = event.getTimeStamp();
                        lastFgPkg = event.getPackageName();
                    }
                }
            }
            return lastFgPkg;
        } catch (Exception e) {
            return null;
        }
    }

    /* ═══════════════════════════════════════════════
       共同逻辑
       ═══════════════════════════════════════════════ */

    private void checkAndTrigger(String currentPackage) {
        if (currentPackage == null || currentPackage.isEmpty()) return;

        if (currentPackage.equals(getPackageName())
                || currentPackage.equals("com.android.systemui")
                || currentPackage.equals("android")) {
            return;
        }

        if (!isBoundPackage(currentPackage)) return;

        Log.i("CIKE", "BOUND: " + currentPackage + " (bound=" + cachedBoundPackages.length + " apps)");

        long now = System.currentTimeMillis();

        // 放行条件 1：短暂放行（allowNextLaunchOf）
        if (AppBindingPlugin.shouldAllowOnce(this, currentPackage)) {
            Log.i("CIKE", "ALLOW_NEXT_PASS: " + currentPackage);
            return;
        }

        // 放行条件 2：计时器期间放行（文件 I/O，可靠跨进程）
        if (InterceptorState.isAllowed(this, currentPackage)) {
            Log.i("CIKE", "TIMER_PASS: " + currentPackage + " 计时器放行中");
            return;
        }

        // 放行条件 3：防抖（1.5 秒内同包名不重复触发）
        if (currentPackage.equals(lastDetectedPackage)
                && (now - lastDetectedTime) < 1500) {
            DebugState.log("DETECT", currentPackage + " → 防抖跳过 (" + (now - lastDetectedTime) + "ms)");
            return;
        }

        lastDetectedPackage = currentPackage;
        lastDetectedTime = now;

        DebugState.log("TRIGGER", "🚀 触发拦截: " + currentPackage);

        // 直接启动「此刻」，不跳主屏，不加延迟
        Intent launchIntent = new Intent(this, MainActivity.class);
        launchIntent.addFlags(
                Intent.FLAG_ACTIVITY_NEW_TASK |
                Intent.FLAG_ACTIVITY_CLEAR_TOP |
                Intent.FLAG_ACTIVITY_SINGLE_TOP
        );
        launchIntent.putExtra("triggerPackage", currentPackage);
        startActivity(launchIntent);
    }

    private boolean isBoundPackage(String packageName) {
        for (String bound : cachedBoundPackages) {
            if (bound.equals(packageName)) return true;
        }
        return false;
    }

    /* ═══════════════════════════════════════════════
       生命周期
       ═══════════════════════════════════════════════ */

    @Override
    public void onInterrupt() {}

    @Override
    public void onDestroy() {
        super.onDestroy();
        if (bgHandler != null && pollRunnable != null) {
            bgHandler.removeCallbacks(pollRunnable);
        }
        if (bgThread != null) {
            bgThread.quitSafely();
        }
        stopForeground(true);
    }

    private void startForegroundService() {
        createNotificationChannel();
        Notification notification = new Notification.Builder(this, CHANNEL_ID)
                .setContentTitle("此刻 · 陪伴中")
                .setContentText("正在守护你的专注，绑定 app 打开时会提醒你")
                .setSmallIcon(android.R.drawable.ic_menu_info_details)
                .setPriority(Notification.PRIORITY_LOW)
                .setOngoing(true)
                .build();
        startForeground(NOTIFICATION_ID, notification);
    }

    private void createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationChannel channel = new NotificationChannel(
                    CHANNEL_ID, "此刻检测服务",
                    NotificationManager.IMPORTANCE_LOW);
            channel.setDescription("检测绑定应用打开，需持续运行");
            channel.setShowBadge(false);
            NotificationManager nm = (NotificationManager) getSystemService(NOTIFICATION_SERVICE);
            if (nm != null) nm.createNotificationChannel(channel);
        }
    }

    public static void updateBoundPackages(Context context) {
        try {
            SharedPreferences prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
            String json = prefs.getString(KEY_BOUND_APPS, "[]");
            JSONArray arr = new JSONArray(json);
            cachedBoundPackages = new String[arr.length()];
            for (int i = 0; i < arr.length(); i++) {
                cachedBoundPackages[i] = arr.getString(i);
            }
        } catch (Exception e) {
            cachedBoundPackages = new String[0];
        }
    }
}
