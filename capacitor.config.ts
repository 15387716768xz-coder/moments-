import { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.cike.app',
  appName: '此刻',
  webDir: 'dist',
  server: {
    androidScheme: 'https',
  },
  plugins: {
    AppBinding: {
      // 自定义插件配置（如有需要）
    },
  },
  android: {
    allowMixedContent: true,
  },
};

export default config;
