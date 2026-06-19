package com.cike.app;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

/**
 * 开机广播接收器
 *
 * 设备重启后重新加载无障碍服务的绑定列表缓存。
 * 无障碍服务本身会在开机后由系统自动重新绑定，
 * 此 Receiver 仅确保绑定的包名列表是最新的。
 */
public class BootReceiver extends BroadcastReceiver {
    @Override
    public void onReceive(Context context, Intent intent) {
        if (Intent.ACTION_BOOT_COMPLETED.equals(intent.getAction())) {
            // 更新无障碍服务中的绑定包名缓存
            AppDetectionService.updateBoundPackages(context);
        }
    }
}
