package com.cike.app;

import android.content.Context;
import android.content.SharedPreferences;

/**
 * 计时器放行状态管理（跨进程通过 SharedPreferences 共享）
 */
public class InterceptorState {

    private static final String PREFS_NAME = "app_binding_prefs";

    /**
     * 设置计时器放行：在指定分钟内不再拦截该 app
     */
    public static void allowUntil(Context ctx, String pkg, int minutes) {
        long until = System.currentTimeMillis() + minutes * 60_000L;
        ctx.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
                .edit().putLong("timer_allow_" + pkg, until).apply();
    }

    /**
     * 检查该 app 是否在计时器放行期内（时间戳过期自动失效）
     */
    public static boolean isAllowed(Context ctx, String pkg) {
        long until = ctx.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
                .getLong("timer_allow_" + pkg, 0L);
        return System.currentTimeMillis() < until;
    }
}
