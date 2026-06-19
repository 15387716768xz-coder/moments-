package com.cike.app;

import android.content.Context;
import android.content.SharedPreferences;
import org.json.JSONArray;
import org.json.JSONObject;
import java.text.SimpleDateFormat;
import java.util.ArrayList;
import java.util.Date;
import java.util.List;
import java.util.Locale;

/**
 * 调试状态 — 收集检测事件日志，供调试面板展示
 */
public class DebugState {

    private static final int MAX_EVENTS = 100;
    private static final List<String> events = new ArrayList<>();

    // ThreadLocal 避免每次 log 调用都 new SimpleDateFormat
    private static final ThreadLocal<SimpleDateFormat> tsFormat =
            ThreadLocal.withInitial(() -> new SimpleDateFormat("HH:mm:ss.SSS", Locale.US));

    public static synchronized void log(String tag, String msg) {
        String ts = tsFormat.get().format(new Date());
        String entry = ts + " [" + tag + "] " + msg;
        events.add(entry);
        if (events.size() > MAX_EVENTS) {
            events.subList(0, events.size() - MAX_EVENTS).clear();
        }
    }

    public static synchronized String getEventsJson() {
        JSONArray arr = new JSONArray();
        for (int i = Math.max(0, events.size() - 50); i < events.size(); i++) {
            arr.put(events.get(i));
        }
        return arr.toString();
    }

    /** 生成完整的调试信息 JSON */
    public static String getFullDebugJson(Context ctx) {
        try {
            JSONObject json = new JSONObject();
            SharedPreferences sp = ctx.getSharedPreferences(
                    "app_binding_prefs", Context.MODE_PRIVATE);

            json.put("boundApps", sp.getString("bound_apps", "[]"));

            // 放行标记：只读已知前缀的键
            JSONObject allows = new JSONObject();
            for (String key : sp.getAll().keySet()) {
                if (key.startsWith("allow_next_") || key.startsWith("timer_allow_")) {
                    long val = sp.getLong(key, 0);
                    String status = System.currentTimeMillis() < val ? "✅有效" : "❌过期";
                    allows.put(key, val + " (" + status + ")");
                }
            }
            json.put("allowances", allows);

            json.put("serviceEnabled", AppBindingPlugin.isAccessibilityServiceOn(ctx));
            json.put("events", new JSONArray(getEventsJson()));

            return json.toString();
        } catch (Exception e) {
            return "{\"error\":\"" + e.getMessage() + "\"}";
        }
    }

    public static void clearAllAllowances(Context ctx) {
        SharedPreferences sp = ctx.getSharedPreferences(
                "app_binding_prefs", Context.MODE_PRIVATE);
        SharedPreferences.Editor ed = sp.edit();
        for (String key : sp.getAll().keySet()) {
            if (key.startsWith("allow_next_") || key.startsWith("timer_allow_")) {
                ed.remove(key);
            }
        }
        ed.apply();
        log("DEBUG", "所有放行标记已清除");
    }
}
