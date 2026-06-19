package com.cike.app;

import android.content.Context;
import java.io.BufferedReader;
import java.io.File;
import java.io.FileReader;
import java.io.FileWriter;

/**
 * 计时器放行状态管理
 *
 * 不使用 SharedPreferences（跨进程缓存不同步），直接读写文件。
 */
public class InterceptorState {

    private static File getFile(Context ctx) {
        return new File(ctx.getFilesDir(), "timer_allowances.txt");
    }

    /**
     * 设置计时器放行：在指定分钟内不再拦截该 app
     *
     * 使用原子写入（先写临时文件再 rename），避免跨进程读写竞态。
     */
    public static void allowUntil(Context ctx, String pkg, int minutes) {
        long until = System.currentTimeMillis() + minutes * 60_000L;
        try {
            // 读取现有条目
            StringBuilder sb = new StringBuilder();
            File f = getFile(ctx);
            if (f.exists()) {
                BufferedReader br = new BufferedReader(new FileReader(f));
                String line;
                while ((line = br.readLine()) != null) {
                    String[] parts = line.split("=", 2);
                    if (parts.length == 2 && !parts[0].equals(pkg)) {
                        if (sb.length() > 0) sb.append("\n");
                        sb.append(line);
                    }
                }
                br.close();
            }
            // 追加新条目
            if (sb.length() > 0) sb.append("\n");
            sb.append(pkg).append("=").append(until);

            // ★ 原子写入：先写 .tmp，再 rename（Linux 同文件系统内 rename 是原子操作）
            File tmp = new File(ctx.getFilesDir(), "timer_allowances.tmp");
            FileWriter fw = new FileWriter(tmp);
            fw.write(sb.toString());
            fw.close();
            tmp.renameTo(f);
        } catch (Exception ignored) {}
    }

    /**
     * 设置短暂放行（与 allowUntil 共用文件，原子写入）
     */
    public static void allowNext(Context ctx, String pkg) {
        long until = System.currentTimeMillis() + 3000; // 3 秒窗口
        try {
            StringBuilder sb = new StringBuilder();
            File f = getFile(ctx);
            if (f.exists()) {
                BufferedReader br = new BufferedReader(new FileReader(f));
                String line;
                while ((line = br.readLine()) != null) {
                    String[] parts = line.split("=", 2);
                    if (parts.length == 2
                            && !parts[0].equals(pkg)
                            && !parts[0].equals("next_" + pkg)) {
                        if (sb.length() > 0) sb.append("\n");
                        sb.append(line);
                    }
                }
                br.close();
            }
            if (sb.length() > 0) sb.append("\n");
            sb.append("next_").append(pkg).append("=").append(until);

            File tmp = new File(ctx.getFilesDir(), "timer_allowances.tmp");
            FileWriter fw = new FileWriter(tmp);
            fw.write(sb.toString());
            fw.close();
            tmp.renameTo(f);
        } catch (Exception ignored) {}
    }

    /**
     * 检查短暂放行标记是否有效
     */
    public static boolean isAllowedNext(Context ctx, String pkg) {
        return isAllowedRaw(ctx, "next_" + pkg);
    }

    /**
     * 底层检查：按 key 精确匹配
     */
    private static boolean isAllowedRaw(Context ctx, String key) {
        try {
            File f = getFile(ctx);
            if (!f.exists()) return false;
            BufferedReader br = new BufferedReader(new FileReader(f));
            String line;
            long now = System.currentTimeMillis();
            while ((line = br.readLine()) != null) {
                String[] parts = line.split("=", 2);
                if (parts.length == 2 && parts[0].equals(key)) {
                    long until = Long.parseLong(parts[1]);
                    br.close();
                    return now < until;
                }
            }
            br.close();
        } catch (Exception ignored) {}
        return false;
    }

    /**
     * 检查该 app 是否在计时器放行期内（时间戳过期自动失效）
     */
    public static boolean isAllowed(Context ctx, String pkg) {
        return isAllowedRaw(ctx, pkg);
    }

    /** 清除所有放行标记 */
    public static void clearAll(Context ctx) {
        getFile(ctx).delete();
        new File(ctx.getFilesDir(), "timer_allowances.tmp").delete();
    }
}
